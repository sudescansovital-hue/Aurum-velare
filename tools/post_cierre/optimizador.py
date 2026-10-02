#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
optimizador.py — Optimizador de SL/TP (re-simulacion con velas M1)

Re-simula TODOS los trades de la EA con reglas alternativas de salida sobre
una rejilla SL x TP, combinada con BE y parcial, y compara contra la gestion
real. Valida fuera de muestra: elige la mejor regla con los trades hasta
--hasta (31/08 por defecto) y la comprueba en los posteriores.

ES UNA SIMULACION CON VELAS M1: dentro de un minuto no se sabe el orden de
maximo y minimo, no hay spread ni comision, y la entrada es la real de cada
trade. Ver SUPUESTOS abajo y la cabecera del informe.

Misma regla de seguridad que post_cierre.py: MT5 solo lectura (reutiliza
conectar_mt5, que bloquea las funciones de trading). No escribe en Supabase
ni en el EA: solo lee trades por api/post-cierre.js (?accion=trades) y deja
salida/optimizador.md + salida/optimizador_rejilla.csv.

Uso (con MT5 abierto):
    .venv\\Scripts\\python.exe optimizador.py
    .venv\\Scripts\\python.exe optimizador.py --hasta 2026-08-31 --riesgo-eur 126
"""

from __future__ import annotations

import argparse
import csv
import sys
import warnings
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

import post_cierre as pc

# nanmean de una combinacion sin trades validos avisa; es esperable (queda NaN).
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# ── Rejilla y supuestos (cambiar aqui) ─────────────────────────────────────

SL_PTS = np.arange(7, 26, 1, dtype=float)    # 7..25
TP_PTS = np.arange(7, 51, 1, dtype=float)    # 7..50
# Gestiones combinadas con cada SL x TP. be = pts a favor para mover el SL a
# la entrada; parcial = (fraccion, pts) y el resto queda con BE desde ahi.
GESTIONES = [
    ("sin gestión", {"be": None, "parcial": None}),
    ("BE a +5", {"be": 5.0, "parcial": None}),
    ("BE a +10", {"be": 10.0, "parcial": None}),
    ("BE a +15", {"be": 15.0, "parcial": None}),
    ("parcial 50% a +10 + BE", {"be": None, "parcial": (0.5, 10.0)}),
]
# Regla de referencia fija (simulador de gestion, caso d).
REFERENCIA = ("SL 11 / TP 33 sin gestión", 11.0, 33.0, "sin gestión")

MAX_MIN_SIMULACION = 1440      # 24 h de mercado; si no toca nada, cierra a mercado
DIAS_BUSQUEDA = 5              # calendario pedido a MT5 para cubrir esas 24 h
VALOR_PUNTO = 100.0            # $ por punto y lote (XAUUSD, igual que la web)
RIESGO_EUR_DEFAULT = 126.0
EURUSD_FALLBACK = 1.17         # solo si MT5 no da EURUSD
LIMITE_DIA_USD = 500.0         # "dia que rompe 500 $" = una cuenta pierde >= 500 $ ese dia
TOP_N = 10
MIN_TRADES_RANKING = 8         # por debajo, la combinacion no entra en el ranking

ESTRATEGIAS = [("Global", None), ("estructura", "estructura"),
               ("rechazo_rsi", "rechazo_rsi"), ("sin clasificar", "sin_clasificar")]


# ── Datos por trade ────────────────────────────────────────────────────────

class TradeSim:
    """Arrays de la simulacion para un trade: recorrido a favor/en contra por
    vela desde la entrada (pts), y sus maximos acumulados para buscar el
    primer toque de cada nivel con searchsorted."""

    def __init__(self, t: pc.Trade, beneficio, velas: list):
        self.t = t
        self.beneficio = beneficio
        compra = t.direccion == "buy"
        e = t.precio_entrada
        hi = np.array([v.high for v in velas]); lo = np.array([v.low for v in velas])
        cl = np.array([v.close for v in velas])
        self.n = len(velas)
        self.dias = [v.time.date() for v in velas]
        fav = (hi - e) if compra else (e - lo)
        adv = (e - lo) if compra else (hi - e)
        self.cm_fav = np.maximum.accumulate(fav) if self.n else fav
        self.cm_adv = np.maximum.accumulate(adv) if self.n else adv
        self.cierre_final = float((cl[-1] - e) if compra else (e - cl[-1])) if self.n else 0.0
        # vuelta[i] = primera vela j >= i que toca la entrada (para la salida en BE)
        vuelta = np.full(self.n + 1, self.n, dtype=int)
        for i in range(self.n - 1, -1, -1):
            vuelta[i] = i if adv[i] >= 0 else vuelta[i + 1]
        self.vuelta = vuelta

    def primer_toque(self, cm, niveles):
        return np.searchsorted(cm, niveles, side="left")  # n = nunca

    def simular(self, be, parcial):
        """Devuelve (pts, idx_salida) de forma (len(SL), len(TP)). NaN donde la
        combinacion no tiene sentido (BE o parcial >= TP)."""
        n = self.n
        isl = self.primer_toque(self.cm_adv, SL_PTS)[:, None]
        itp = self.primer_toque(self.cm_fav, TP_PTS)[None, :]
        sl = SL_PTS[:, None]; tp = TP_PTS[None, :]
        # Sin disparador: SL o TP, el primero; misma vela -> SL (conservador)
        sale_sl = (isl <= itp) & (isl < n)
        pts = np.where(sale_sl, -sl, np.where(itp < n, tp, self.cierre_final))
        idx = np.where(sale_sl, isl, np.where(itp < n, itp, n - 1))
        nivel = parcial[1] if parcial else be
        if nivel is None:
            return pts.astype(float), idx
        it = int(self.primer_toque(self.cm_fav, [nivel])[0])
        if it < n:
            frac, rem = (parcial[0], 1 - parcial[0]) if parcial else (0.0, 1.0)
            asegurado = frac * nivel
            ibe = self.vuelta[it]  # misma vela que el disparador cuenta (conservador)
            resto = np.where(itp < ibe, tp, 0.0 if ibe < n else self.cierre_final)
            idx_resto = np.where(itp < ibe, itp, ibe if ibe < n else n - 1)
            dispara = it < isl  # el SL original no llego antes (misma vela -> SL)
            pts = np.where(dispara, asegurado + rem * resto, pts)
            idx = np.where(dispara, idx_resto, idx)
        pts = np.where(nivel < tp, pts, np.nan)
        return pts.astype(float), idx


# ── Metricas ───────────────────────────────────────────────────────────────

def metricas(pts: np.ndarray, usd_vol: np.ndarray, usd_riesgo: np.ndarray):
    """pts/usd_*: (T, ...) en orden de fecha_entrada. Devuelve dict de arrays
    con la forma de la rejilla."""
    validos = ~np.isnan(pts)
    n = validos.sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        wr = np.where(n > 0, (np.nan_to_num(pts) > 0).sum(axis=0) / n, np.nan)
        esp_pts = np.nanmean(pts, axis=0)
        esp_vol = np.nanmean(usd_vol, axis=0)
        esp_rie = np.nanmean(usd_riesgo, axis=0)
    tot_vol = np.nansum(usd_vol, axis=0)
    tot_rie = np.nansum(usd_riesgo, axis=0)
    # Peor racha (perdidas seguidas) y maximo drawdown con riesgo fijo
    racha = np.zeros(pts.shape[1:]); peor = np.zeros(pts.shape[1:])
    acum = np.zeros(pts.shape[1:]); pico = np.zeros(pts.shape[1:]); dd = np.zeros(pts.shape[1:])
    for i in range(pts.shape[0]):
        p = pts[i]
        racha = np.where(np.isnan(p), racha, np.where(p < 0, racha + 1, 0))
        peor = np.maximum(peor, racha)
        acum = acum + np.nan_to_num(usd_riesgo[i])
        pico = np.maximum(pico, acum)
        dd = np.maximum(dd, pico - acum)
    return {"n": n, "wr": wr, "esp_pts": esp_pts, "esp_vol": esp_vol, "tot_vol": tot_vol,
            "esp_rie": esp_rie, "tot_rie": tot_rie, "peor_racha": peor, "max_dd_rie": dd}


def dias_rompen(cuentas, dias, usd) -> int:
    """Dias (por cuenta) cuya suma de P&L es <= -LIMITE_DIA_USD."""
    suma = defaultdict(float)
    for c, d, u in zip(cuentas, dias, usd):
        if u is not None and not np.isnan(u):
            suma[(c, d)] += u
    return sum(1 for v in suma.values() if v <= -LIMITE_DIA_USD)


# ── Informe ────────────────────────────────────────────────────────────────

def fmt(v, dec=1, signo=False):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    s = f"{v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("+" + s) if signo and v > 0 else s


def fila(nombre, m, dias_vol, dias_rie):
    return (f"| {nombre} | {int(m['n'])} | {fmt(m['wr'] * 100, 0)}% | {fmt(m['esp_pts'], 2, True)} | "
            f"{fmt(m['esp_vol'], 0, True)} | {fmt(m['tot_vol'], 0, True)} | {fmt(m['esp_rie'], 0, True)} | "
            f"{fmt(m['tot_rie'], 0, True)} | {int(m['peor_racha'])} | {fmt(m['max_dd_rie'], 0)} | "
            f"{dias_vol} / {dias_rie} |")


CABECERA_TABLA = ("| Regla | n | WR | Esp. pts | Esp. $ (vol. real) | Total $ (vol. real) | Esp. $ (riesgo fijo) | "
                  "Total $ (riesgo fijo) | Peor racha | Máx. DD $ (riesgo fijo) | Días ≤ −500 $ (vol / riesgo) |\n"
                  "|---|---|---|---|---|---|---|---|---|---|---|")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hasta", default="2026-08-31", help="Último día de la muestra de optimización (incluido)")
    ap.add_argument("--riesgo-eur", type=float, default=RIESGO_EUR_DEFAULT)
    ap.add_argument("--eurusd", type=float, default=None, help="Forzar el cambio EUR/USD (por defecto, de MT5)")
    ap.add_argument("--base-url", default=pc.BASE_URL_DEFAULT)
    ap.add_argument("--out-dir", type=Path, default=pc.SALIDA_DIR_DEFAULT)
    args = ap.parse_args()
    corte = datetime.strptime(args.hasta, "%Y-%m-%d") + timedelta(days=1)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/5] Pidiendo todos los trades EA a {args.base_url} ...")
    try:
        resp = pc.ClienteWeb(args.base_url, pc.leer_credenciales()).trades()
    except RuntimeError as e:
        sys.exit(f"    Error: {e}")
    trades, _ = pc.cargar_desde_web(resp["pendientes"])
    beneficio = {x["fp"]: x.get("beneficio") for x in resp["pendientes"]}
    print(f"    {len(trades)} trades.")

    print("[2/5] Conectando a MT5 (solo lectura) y descargando velas M1...")
    mt5 = pc.conectar_mt5()
    simbolo = pc.detectar_simbolo_oro(mt5)
    eurusd = args.eurusd
    if eurusd is None:
        # El nombre lleva sufijo segun el broker (WSF: 'EURUSDc')
        nombres = [s.name for s in mt5.symbols_get() if "EURUSD" in s.name.upper()]
        tick = mt5.symbol_info_tick(nombres[0]) if nombres else None
        eurusd = float(tick.bid) if tick and tick.bid else None
    origen_cambio = "MT5 (EURUSD bid actual)" if eurusd and args.eurusd is None else "--eurusd" if args.eurusd else None
    if not eurusd:
        eurusd, origen_cambio = EURUSD_FALLBACK, f"valor fijo {EURUSD_FALLBACK} (MT5 no dio EURUSD)"
    riesgo_usd = args.riesgo_eur * eurusd

    sims = []
    sin_velas = []
    for t in sorted(trades.values(), key=lambda t: t.fecha_entrada):
        minuto = t.fecha_entrada.replace(second=0, microsecond=0)
        velas = pc.obtener_velas_m1(mt5, simbolo, minuto, t.fecha_entrada + timedelta(days=DIAS_BUSQUEDA))
        # Desde la vela siguiente a la de entrada (la de entrada mezcla precio previo)
        velas = [v for v in velas if v.time > minuto][:MAX_MIN_SIMULACION]
        if not velas:
            sin_velas.append(t.fp)
            continue
        sims.append(TradeSim(t, beneficio.get(t.fp), velas))
    mt5.shutdown()
    print(f"    {len(sims)} trades con velas · {len(sin_velas)} sin velas (fuera).")

    print(f"[3/5] Simulando {len(SL_PTS)}×{len(TP_PTS)} SL×TP × {len(GESTIONES)} gestiones...")
    T = len(sims)
    vol = np.array([s.t.volumen or 0.0 for s in sims])
    res = {}
    for nombre, g in GESTIONES:
        P = np.empty((T, len(SL_PTS), len(TP_PTS))); I = np.empty_like(P, dtype=int)
        for k, s in enumerate(sims):
            P[k], I[k] = s.simular(g["be"], g["parcial"])
        res[nombre] = (P, I)

    # Gestion real: beneficio real ($) y pts equivalentes; R con el SL original.
    real_usd = np.array([float(s.beneficio) if s.beneficio is not None else np.nan for s in sims])
    real_pts = np.where(vol > 0, real_usd / (VALOR_PUNTO * np.where(vol > 0, vol, 1)), np.nan)
    dist_sl = []
    for s in sims:
        slo, _, _ = pc.reconstruir_original(s.t, s.t.cambios_sl, s.t.sl_col)
        dist_sl.append(abs(s.t.precio_entrada - slo) if slo is not None and abs(s.t.precio_entrada - slo) > 0.5 else np.nan)
    dist_sl = np.array(dist_sl)
    real_rie = real_pts / dist_sl * riesgo_usd

    en_muestra = np.array([s.t.fecha_entrada < corte for s in sims])
    estrategia = np.array([s.t.estrategia or "sin_clasificar" for s in sims])
    cuentas = [s.t.cuenta_numero for s in sims]

    def subconjunto(nombre_estr, periodo):
        m = en_muestra if periodo == "in" else ~en_muestra
        return m if nombre_estr is None else m & (estrategia == nombre_estr)

    def met_regla(mask, gest, i_sl, j_tp):
        P, I = res[gest]
        p = P[mask, i_sl, j_tp]
        u_vol = p * VALOR_PUNTO * vol[mask]
        u_rie = p / SL_PTS[i_sl] * riesgo_usd
        m = metricas(p[:, None], u_vol[:, None], u_rie[:, None])
        m = {k: v[0] for k, v in m.items()}
        idx = I[mask, i_sl, j_tp]
        ss = [s for s, ok in zip(sims, mask) if ok]
        dias = [s.dias[i] for s, i in zip(ss, idx)]
        cs = [s.t.cuenta_numero for s in ss]
        return m, dias_rompen(cs, dias, u_vol), dias_rompen(cs, dias, u_rie)

    def met_real(mask):
        m = metricas(real_pts[mask][:, None], real_usd[mask][:, None], real_rie[mask][:, None])
        m = {k: v[0] for k, v in m.items()}
        ss = [s for s, ok in zip(sims, mask) if ok]
        dias = [s.t.fecha_cierre.date() for s in ss]
        cs = [s.t.cuenta_numero for s in ss]
        return m, dias_rompen(cs, dias, real_usd[mask]), dias_rompen(cs, dias, real_rie[mask])

    i_ref = int(np.where(SL_PTS == REFERENCIA[1])[0][0]); j_ref = int(np.where(TP_PTS == REFERENCIA[2])[0][0])

    print("[4/5] Optimizando en muestra y validando fuera de muestra...")
    md = []
    hasta_txt = datetime.strptime(args.hasta, "%Y-%m-%d").strftime("%d/%m/%Y")
    md.append("# Optimizador de SL/TP — simulación con velas M1\n")
    md.append("> **Aviso: es una SIMULACIÓN con velas M1, no un resultado real.** Dentro de cada minuto no se "
              "sabe si llegó antes al máximo o al mínimo; cuando una vela toca dos niveles se asume lo peor "
              "(primero el SL; tras activar el BE, salida en BE). Sin spread, comisión ni deslizamiento (en "
              "ventas el SL/TP real salta con el ask, ~0,2–0,3 pts antes). La entrada es la real de cada trade; "
              f"si en {MAX_MIN_SIMULACION // 60} h de mercado no toca SL ni TP, se cierra a mercado.\n")
    md.append(f"- Trades: {T} simulados ({int(en_muestra.sum())} en muestra hasta el {hasta_txt}, "
              f"{int((~en_muestra).sum())} fuera de muestra después) · {len(sin_velas)} sin velas, fuera.")
    md.append(f"- Rejilla: SL {int(SL_PTS[0])}–{int(SL_PTS[-1])} × TP {int(TP_PTS[0])}–{int(TP_PTS[-1])} pts (de 1 en 1) "
              f"× gestiones: {', '.join(n for n, _ in GESTIONES)}. Combinaciones con BE o parcial ≥ TP, fuera.")
    md.append(f"- $ con volumen real: pts × {int(VALOR_PUNTO)} × lotes del trade. $ con riesgo fijo: "
              f"{fmt(args.riesgo_eur, 0)} € = {fmt(riesgo_usd, 2)} $ por trade (EUR/USD {fmt(eurusd, 4)}, "
              f"{origen_cambio}); 1 SL = −{fmt(riesgo_usd, 0)} $.")
    md.append(f"- Gestión real: `beneficio` real del trade (incluye parciales); riesgo fijo con la distancia al "
              f"SL original ({int(np.isnan(dist_sl).sum())} trades sin SL original fuera de esa columna).")
    md.append(f"- Elección: la regla con mayor esperanza en $ con riesgo fijo **en muestra**, con al menos "
              f"{MIN_TRADES_RANKING} trades; luego se mira qué habría dado **fuera de muestra**. "
              f"Peor racha = pérdidas seguidas; Máx. DD = mayor caída desde un máximo, con riesgo fijo; "
              f"días ≤ −500 $ = días en que una misma cuenta pierde 500 $ o más.\n")

    filas_csv = []
    for titulo, estr in ESTRATEGIAS:
        m_in = subconjunto(estr, "in"); m_out = subconjunto(estr, "out")
        md.append(f"\n## {titulo}\n")
        md.append(f"En muestra: {int(m_in.sum())} trades · fuera de muestra: {int(m_out.sum())} trades.")
        if estr in ("estructura", "rechazo_rsi"):
            md.append(" **Ojo:** las estrategias solo se clasifican desde el 26/08, así que la muestra de "
                      "optimización es muy corta y el resultado no es fiable.")
        md.append("")
        if m_in.sum() == 0 or m_out.sum() == 0:
            md.append("_Sin trades suficientes en alguno de los dos periodos._\n")
            continue

        # Ranking en muestra de toda la rejilla
        cand = []
        for gest, _ in GESTIONES:
            P, _I = res[gest]
            p = P[m_in]
            u_vol = p * VALOR_PUNTO * vol[m_in][:, None, None]
            u_rie = p / SL_PTS[None, :, None] * riesgo_usd
            m = metricas(p, u_vol, u_rie)
            for i in range(len(SL_PTS)):
                for j in range(len(TP_PTS)):
                    if np.isnan(m["esp_rie"][i, j]) or m["n"][i, j] < MIN_TRADES_RANKING:
                        continue
                    cand.append((m["esp_rie"][i, j], gest, i, j))
                    filas_csv.append({"vista": titulo, "periodo": "en_muestra", "gestion": gest,
                                      "sl": int(SL_PTS[i]), "tp": int(TP_PTS[j]),
                                      **{k: round(float(v[i, j]), 4) for k, v in m.items()}})
        cand.sort(key=lambda x: -x[0])
        if not cand:
            md.append("_Ninguna combinación con trades suficientes._\n")
            continue
        _, g_best, i_best, j_best = cand[0]
        nombre_best = f"SL {int(SL_PTS[i_best])} / TP {int(TP_PTS[j_best])} · {g_best}"

        for periodo, mask, rotulo in (("in", m_in, f"En muestra (hasta el {hasta_txt})"),
                                      ("out", m_out, f"Fuera de muestra (después del {hasta_txt}) — la prueba de verdad")):
            md.append(f"### {rotulo}\n")
            md.append(CABECERA_TABLA)
            md.append(fila("Gestión real", *met_real(mask)))
            md.append(fila(f"**Mejor en muestra:** {nombre_best}", *met_regla(mask, g_best, i_best, j_best)))
            md.append(fila(f"Referencia: {REFERENCIA[0]}", *met_regla(mask, REFERENCIA[3], i_ref, j_ref)))
            md.append("")

        md.append(f"### Top {TOP_N} en muestra y qué dieron fuera de muestra\n")
        md.append("| # | Regla | Esp. $ riesgo fijo (en muestra) | Total $ riesgo fijo (en muestra) | "
                  "Esp. $ riesgo fijo (fuera) | Total $ riesgo fijo (fuera) | WR fuera | n fuera |\n|---|---|---|---|---|---|---|---|")
        for k, (_, g, i, j) in enumerate(cand[:TOP_N], 1):
            mi, _, _ = met_regla(m_in, g, i, j); mo, _, _ = met_regla(m_out, g, i, j)
            md.append(f"| {k} | SL {int(SL_PTS[i])} / TP {int(TP_PTS[j])} · {g} | {fmt(mi['esp_rie'], 0, True)} | "
                      f"{fmt(mi['tot_rie'], 0, True)} | {fmt(mo['esp_rie'], 0, True)} | {fmt(mo['tot_rie'], 0, True)} | "
                      f"{fmt(mo['wr'] * 100, 0)}% | {int(mo['n'])} |")
        # Puesto que habria tenido la mejor en muestra si se ordenara por fuera de muestra
        fuera = []
        for gest, _ in GESTIONES:
            P, _I = res[gest]
            p = P[m_out]
            m = metricas(p, p * VALOR_PUNTO * vol[m_out][:, None, None], p / SL_PTS[None, :, None] * riesgo_usd)
            for i in range(len(SL_PTS)):
                for j in range(len(TP_PTS)):
                    if not np.isnan(m["esp_rie"][i, j]):
                        fuera.append((m["esp_rie"][i, j], gest, i, j))
                        filas_csv.append({"vista": titulo, "periodo": "fuera_de_muestra", "gestion": gest,
                                          "sl": int(SL_PTS[i]), "tp": int(TP_PTS[j]),
                                          **{k: round(float(v[i, j]), 4) for k, v in m.items()}})
        fuera.sort(key=lambda x: -x[0])
        puesto = next(k for k, c in enumerate(fuera, 1) if c[1:] == (g_best, i_best, j_best))
        _, gf, i_f, j_f = fuera[0]
        md.append(f"\nLa mejor en muestra ({nombre_best}) queda en el puesto **{puesto} de {len(fuera)}** fuera de "
                  f"muestra. La mejor fuera de muestra a toro pasado sería SL {int(SL_PTS[i_f])} / TP {int(TP_PTS[j_f])} · "
                  f"{gf} ({fmt(fuera[0][0], 0, True)} $/trade con riesgo fijo); no sirve para elegir, solo para "
                  f"ver cuánto cambia el óptimo entre periodos.\n")

    p_md = args.out_dir / "optimizador.md"
    p_md.write_text("\n".join(md), encoding="utf-8")
    p_csv = args.out_dir / "optimizador_rejilla.csv"
    if filas_csv:
        with open(p_csv, "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(filas_csv[0].keys()))
            w.writeheader()
            w.writerows(filas_csv)
    print("[5/5] Listo.")
    print(f"    {p_md}")
    print(f"    {p_csv}")


if __name__ == "__main__":
    main()
