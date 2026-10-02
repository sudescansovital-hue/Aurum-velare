#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
post_cierre.py — Analisis post-cierre + examen de la EA (FASE 1, en seco)

============================================================================
REGLA DE SEGURIDAD — LEER ANTES DE TOCAR ESTE ARCHIVO
============================================================================
Este script usa el paquete `MetaTrader5` SOLO en modo lectura, contra el
terminal MT5 que el usuario tenga abierto en su maquina. Funciones
PERMITIDAS: initialize, shutdown, account_info, symbols_get, symbol_info,
symbol_info_tick, copy_rates_range, copy_rates_from, history_deals_get,
history_orders_get.

PROHIBIDO usar (y no se usan en ningun punto de este archivo):
order_send, order_check, order_close, positions_close, positions_get con
intencion de operar, o cualquier funcion que abra, modifique o cierre
operaciones reales. Ver _bloquear_funciones_de_trading() mas abajo: tras
mt5.initialize() se sobrescriben esas funciones para que lancen una
excepcion si alguna vez se llaman por error, en vez de confiar solo en
este comentario.

Este script NO modifica el EA ni ninguna tabla existente. Lee los trades de
la EA pendientes de analisis desde api/post-cierre.js (FASE 2) o, con
--fuente csv, desde los CSV exportados a mano (FASE 1); lee velas M1 del
terminal MT5, y escribe ficheros nuevos dentro de tools/post_cierre/salida/.
Solo con --subir escribe en Supabase, y solo a traves de api/post-cierre.js
en las tablas post_cierre_analisis / post_cierre_velas (nunca con la service key).

El token del endpoint vive en tools/post_cierre/.post_cierre_token (ignorado
por git). Este script NUNCA lo imprime, ni en errores.
============================================================================

Uso:
    .venv\\Scripts\\python.exe post_cierre.py                 # pendientes de la web, en seco
    .venv\\Scripts\\python.exe post_cierre.py --subir         # ... y subirlos
    .venv\\Scripts\\python.exe post_cierre.py --limit 5       # prueba
    .venv\\Scripts\\python.exe post_cierre.py --fuente csv    # FASE 1, CSVs de data/

Requiere el terminal MT5 abierto (ruta fija en MT5_TERMINAL_PATH). Sus velas
XAUUSD se usan para los trades de TODAS las cuentas, que cuentan todas igual.
--cuenta <numero> limita el analisis a una cuenta.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field, fields
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# ── Constantes / umbrales (documentados aquí, no dispersos por el código) ──

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR_DEFAULT = BASE_DIR / "data"
SALIDA_DIR_DEFAULT = BASE_DIR / "salida"
# Terminal que el usuario abre a mano (verificado en procesos activos, 29/09).
MT5_TERMINAL_PATH = r"C:\Users\boli-\AppData\Roaming\MetaTrader 5\terminal64.exe"

# Mas alla de esta distancia (en puntos = unidades de precio XAUUSD, igual
# criterio que el resto del proyecto) un SL/TP "original" se descarta como
# error de tecleo del usuario, no como dato real. Ver casos reales: SL 943,
# 2995, 3440, 4010, 4462 con entradas ~4000-4600; TP 40104, 5163, 5511, 5501, 2323.
DEDAZO_MAX_DIST = 150.0

# Un movimiento de SL se considera "breakeven real" si el nuevo SL queda a
# esta distancia o menos del precio de entrada (con signo, a favor o en
# contra da igual para este umbral). Corregido en sesion: NO se usa tiempo
# desde la entrada (lotaje alto puede asegurar a BE en segundos y ser real).
BE_TOLERANCIA_PTS = 1.0

# Tolerancia para "el precio de cierre esta pegado al SL/TP guardado" al
# deducir el tipo de cierre por precio cuando falta o discrepa el evento.
# Mismo criterio que usa el propio EA en HandleDealClose (desempate a <=1.0pt).
TOLERANCIA_DEDUCCION_TIPO_CIERRE = 1.0

# Ventana post-cierre principal: hasta que toque SL original o TP, con un
# maximo de 4h de MERCADO. Se cuenta en velas M1 existentes (1 vela = 1 min
# de mercado abierto), asi que un cierre el viernes tarde sigue el lunes al
# abrir y los cortes diarios no cuentan. "Pronto" y "pts dejados" usan esta.
VENTANA_POST_CIERRE_MIN_MERCADO = 240
# Recorrido a favor en ventanas fijas (sin cortar en SL/TP), columnas aparte.
VENTANAS_FAVOR_FIJAS_MIN = (60, 240)
# Cuanto calendario pedir a MT5 para cubrir 4h de mercado aunque haya fin de
# semana o festivo por medio.
VENTANA_BUSQUEDA_DIAS = 5

# Cierre a mano: si tras cerrar el precio fue a favor esta cantidad de pts o
# mas (dentro de la ventana principal) cuenta como "pronto", o como "mixto"
# si luego acabo tocando el SL original. Cambiar aqui para afinar.
UMBRAL_FAVOR_MANUAL_PTS = 5.0

# Salidas en breakeven (criterios v2, 02/10): mismo umbral que los cierres a
# mano. Tras salir en BE: SL original sin ir UMBRAL_FAVOR_MANUAL_PTS a favor =
# te_salvo; SL tras ir 5+ = mixto_te_saco_de_un_recorrido; 5+ sin tocar SL, o
# TP = te_saco_de_un_ganador; resto = sin_efecto. (Sustituye a la fraccion
# 0.5x distancia entrada->SL de la v1.)

# Fecha a partir de la cual el periodo se considera "fiable" (EA afinada).
FECHA_CORTE_SEPTIEMBRE = datetime(2026, 9, 1)

# ── FASE 2: web ──
# Sube si cambia cualquier criterio/umbral de arriba: el endpoint devuelve
# entonces como pendientes todos los trades con una version anterior.
CRITERIOS_VERSION = 2   # v2 (02/10): be_efecto con mixto_te_saco_de_un_recorrido
BASE_URL_DEFAULT = "https://aurumvelare.com"
TOKEN_PATH = BASE_DIR / ".post_cierre_token"   # lineas token=... y opcional bypass=...
LOTE_SUBIDA = 25                               # = MAX_RESULTADOS_POR_LOTE del endpoint
# Grafico del trade: velas de contexto antes de la entrada y maximo de puntos
# para el tramo del trade (si dura mas, se agrupan velas M1 consecutivas).
VELAS_ANTES_ENTRADA = 10
MAX_VELAS_DURANTE = 240

COLUMNA_ORDEN_RESULTADOS = None  # se rellena al final con los nombres de ResultadoTrade


# ── Modelos de datos ────────────────────────────────────────────────────

@dataclass
class Trade:
    position_id: int
    fp: str
    cuenta_numero: str
    estrategia: Optional[str]
    direccion: str
    precio_entrada: float
    fecha_entrada: datetime
    precio_cierre: float
    fecha_cierre: datetime
    sl_col: Optional[float]          # ea_trades.sl_original tal cual (ya reconstruido con cascada simple)
    tp_col: Optional[float]
    sl_actual: Optional[float]
    tp_actual: Optional[float]
    tipo_cierre_evento: Optional[str]
    n_breakeven_ea: int
    volumen: Optional[float] = None
    # Se rellenan despues de cargar sl_tp_changes.csv / eventos_sl.csv
    cambios_sl: list = field(default_factory=list)   # [(timestamp, valor_nuevo), ...] ordenado
    cambios_tp: list = field(default_factory=list)
    eventos_be_ea: list = field(default_factory=list)  # [(tipo_evento, timestamp, sl_en_evento, puntos_desde_entrada)]


@dataclass
class ResultadoTrade:
    position_id: int
    fp: str
    cuenta_numero: str
    estrategia: str
    periodo: str
    direccion: str
    volumen: str
    fecha_entrada: str
    precio_entrada: float
    fecha_cierre: str
    precio_cierre: float

    sl_original_usado: str
    sl_original_origen: str
    sl_original_descartados: str
    tp_original_usado: str
    tp_original_origen: str
    tp_original_descartados: str

    tipo_cierre_guardado: str
    tipo_cierre_deducido_por_precio: str
    tipo_cierre_normalizado: str
    tipo_cierre_discrepancia: str
    tipo_cierre_detallado: str  # sl_original_perdida / sl_breakeven / sl_beneficio_trailing / tp / manual / desconocido

    mfe_ea_puntos: str
    mae_ea_puntos: str
    mfe_calc_puntos: str
    mfe_calc_en: str
    mae_calc_puntos: str
    mae_calc_en: str

    entrada_dentro_de_vela: str
    cierre_dentro_de_vela: str

    n_be_eventos_ea: int
    n_be_reales: int
    n_be_falsos: int
    be_real_ts: str
    be_real_nivel: str
    be_efecto: str

    # Ventana principal: hasta SL original / TP, maximo 4h de mercado
    resultado_post_cierre: str
    tiempo_mercado_hasta_resultado_min: str
    recorrido_favor_post_cierre_puntos: str   # = pts dejados (cortado en SL/TP)
    recorrido_contra_post_cierre_puntos: str
    # Ventanas fijas de mercado, sin cortar en SL/TP
    recorrido_favor_1h_puntos: str
    recorrido_favor_4h_puntos: str
    velas_post_cierre_disponibles: int

    decision_cierre_manual: str  # bien_cerrado / mixto_te_saliste_con_poco / pronto / correcto / indeterminado
    pts_favor_antes_sl: str      # cierre a mano mixto o salida en BE mixto: pts a favor antes del SL original

    notas: str


COLUMNA_ORDEN_RESULTADOS = [f.name for f in fields(ResultadoTrade)]


@dataclass
class Vela:
    time: datetime
    open: float
    high: float
    low: float
    close: float


# ── Utilidades de parseo CSV ────────────────────────────────────────────

def _null(v: str):
    v = (v or "").strip()
    return None if v == "" or v.lower() == "null" else v


def _f(v: str) -> Optional[float]:
    v = _null(v)
    return float(v) if v is not None else None


def _i(v: str) -> Optional[int]:
    v = _null(v)
    return int(float(v)) if v is not None else None


def _ts(v: str) -> Optional[datetime]:
    """Parsea 'YYYY-MM-DD HH:MM:SS+00' como hora de servidor MT5 (naive),
    misma convencion ya documentada en el informe de auditoria: el EA manda
    hora de pared del servidor sin offset real, Postgres la etiqueta +00.
    No se convierte a UTC real — se deja naive para que coincida con lo que
    devuelve copy_rates_range() del mismo terminal/broker."""
    v = _null(v)
    if v is None:
        return None
    v = v.replace("+00", "").strip()
    return datetime.strptime(v, "%Y-%m-%d %H:%M:%S")


def _b(v: str) -> bool:
    return (v or "").strip().lower() == "true"


# ── Carga de los 4 CSV ──────────────────────────────────────────────────

def cargar_trades(data_dir: Path) -> dict[str, Trade]:
    trades: dict[str, Trade] = {}
    with open(data_dir / "ea_trades_cerrados.csv", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            fp = row["fp"]
            trades[fp] = Trade(
                position_id=_i(row["position_id"]),
                fp=fp,
                cuenta_numero=row["cuenta_numero"],
                estrategia=_null(row["estrategia"]),
                direccion=row["direccion"],
                precio_entrada=_f(row["precio_entrada"]),
                fecha_entrada=_ts(row["fecha_entrada"]),
                precio_cierre=_f(row["precio_cierre"]),
                fecha_cierre=_ts(row["fecha_cierre"]),
                sl_col=_f(row["sl_original_reconstruido"]),
                tp_col=_f(row["tp_original_reconstruido"]),
                sl_actual=_f(row["sl_actual"]),
                tp_actual=_f(row["tp_actual"]),
                tipo_cierre_evento=_null(row["tipo_cierre_evento"]),
                n_breakeven_ea=_i(row["n_breakeven"]) or 0,
            )
    return trades


def cargar_volumen(data_dir: Path, trades: dict[str, Trade]) -> None:
    with open(data_dir / "volumen.csv", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            t = trades.get(row["fp"])
            if t is not None:
                t.volumen = _f(row["volumen"])


def cargar_sl_tp_changes(data_dir: Path, trades_por_pos: dict[int, list[Trade]]) -> dict:
    """Devuelve stats de deduplicacion. Filas EXACTAMENTE iguales
    (tipo, position_id, valor_anterior, valor_nuevo, timestamp) se
    deduplican y se cuentan como fallo de la EA (retry sin proteccion de
    idempotencia en ea_sl_changes/ea_tp_changes, a diferencia de
    trade_eventos que si tiene UNIQUE)."""
    vistos = set()
    duplicados = []
    total = 0
    with open(data_dir / "sl_tp_changes.csv", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            total += 1
            pos_id = _i(row["position_id"])
            tipo = row["tipo"]
            valor_nuevo = _f(row["valor_nuevo"])
            valor_anterior = _f(row["valor_anterior"])
            ts = _ts(row["timestamp"])
            key = (tipo, pos_id, valor_anterior, valor_nuevo, ts)
            if key in vistos:
                duplicados.append(key)
                continue
            vistos.add(key)

            for t in trades_por_pos.get(pos_id, []):
                if tipo == "sl":
                    t.cambios_sl.append((ts, valor_nuevo))
                else:
                    t.cambios_tp.append((ts, valor_nuevo))

    for t in trades_por_pos_flat(trades_por_pos):
        t.cambios_sl.sort(key=lambda x: x[0])
        t.cambios_tp.sort(key=lambda x: x[0])

    return {"total_filas": total, "filas_unicas": len(vistos), "duplicados": duplicados}


def trades_por_pos_flat(trades_por_pos: dict[int, list[Trade]]):
    for lst in trades_por_pos.values():
        for t in lst:
            yield t


def cargar_eventos_sl(data_dir: Path, trades: dict[str, Trade]) -> None:
    with open(data_dir / "eventos_sl.csv", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            t = trades.get(row["fp"])
            if t is None:
                continue
            t.eventos_be_ea.append((
                row["tipo_evento"],
                _ts(row["timestamp"]),
                _f(row["sl_en_evento"]),
                _f(row["puntos_desde_entrada"]),
            ))
    for t in trades.values():
        t.eventos_be_ea.sort(key=lambda x: x[1])


# ── Reconstruccion SL/TP original con cascada anti-dedazo ──────────────

def reconstruir_original(trade: Trade, cambios: list, valor_columna: Optional[float]) -> tuple:
    """Cascada: (1) columna sl_original/tp_original si es sana, (2) primer
    cambio registrado en ea_sl_changes/ea_tp_changes que sea sano, en orden
    cronologico, (3) si ninguno es sano, 'no_fiable'.
    Devuelve (valor_usado, origen, lista_de_descartados)."""
    descartados = []
    candidatos = []
    if valor_columna is not None:
        candidatos.append(("columna_original", valor_columna))
    for ts, val in cambios:
        candidatos.append(("cambio_registrado", val))

    for origen, val in candidatos:
        dist = abs(val - trade.precio_entrada)
        if dist <= DEDAZO_MAX_DIST:
            return val, origen, descartados
        # El mismo dedazo suele estar en la columna y en el historico: una vez basta
        if val not in descartados:
            descartados.append(val)

    return None, "no_fiable", descartados


# ── Clasificacion de tipo de cierre ─────────────────────────────────────

def deducir_tipo_cierre_por_precio(precio_cierre, sl_actual, tp_actual) -> str:
    if tp_actual is not None and abs(precio_cierre - tp_actual) <= TOLERANCIA_DEDUCCION_TIPO_CIERRE:
        return "tp_probable"
    if sl_actual is not None and abs(precio_cierre - sl_actual) <= TOLERANCIA_DEDUCCION_TIPO_CIERRE:
        return "sl_probable"
    return "manual_probable"


def normalizar_tipo_cierre(guardado: Optional[str], deducido: str) -> tuple:
    """Devuelve (tipo_normalizado, hubo_discrepancia)."""
    mapa_deducido = {"tp_probable": "cierre_tp", "sl_probable": "cierre_sl", "manual_probable": "cierre_manual"}
    if guardado in ("cierre_tp", "cierre_sl", "cierre_manual"):
        discrepancia = guardado != mapa_deducido[deducido]
        return guardado, discrepancia
    # 'cierre' generico (agosto, pre-subtipos) o NULL: no hay subtipo guardado
    # fiable, se usa el deducido por precio como fuente.
    return mapa_deducido[deducido] + "_deducido", False


def clasificar_cierre_sl_detallado(direccion, precio_entrada, sl_actual) -> str:
    if sl_actual is None:
        return "desconocido"
    dist = (sl_actual - precio_entrada) if direccion == "buy" else (precio_entrada - sl_actual)
    if abs(dist) <= BE_TOLERANCIA_PTS:
        return "sl_breakeven"
    if dist > BE_TOLERANCIA_PTS:
        return "sl_beneficio_trailing"
    return "sl_original_o_ajustado_perdida"


def tipo_cierre_detallado(tipo_normalizado: str, direccion, precio_entrada, sl_actual) -> str:
    base = tipo_normalizado.replace("_deducido", "")
    if base == "cierre_sl":
        return clasificar_cierre_sl_detallado(direccion, precio_entrada, sl_actual)
    if base == "cierre_tp":
        return "tp"
    if base == "cierre_manual":
        return "manual"
    return "desconocido"


# ── Breakeven real vs falso (reclasificacion, criterio corregido) ──────

def reclasificar_breakeven(trade: Trade) -> dict:
    """Para cada evento que la EA etiqueto como 'breakeven', re-evalua con
    el criterio correcto: |puntos_desde_entrada| <= BE_TOLERANCIA_PTS. Si
    no lo cumple, es un falso positivo de la EA — se reclasifica segun el
    signo (favor -> equivalente a sl_protegido, contra -> sl_ajustado)."""
    eventos_be_ea = [e for e in trade.eventos_be_ea if e[0] == "breakeven"]
    reales = []
    falsos = []
    for tipo_evento, ts, sl_en_evento, pts in eventos_be_ea:
        if pts is None:
            continue
        if abs(pts) <= BE_TOLERANCIA_PTS:
            reales.append((ts, sl_en_evento, pts))
        else:
            reclasif = "sl_protegido_real" if pts > 0 else "sl_ajustado_real"
            falsos.append((ts, sl_en_evento, pts, reclasif))
    return {"reales": reales, "falsos": falsos, "n_ea": len(eventos_be_ea)}


# ── MT5: conexion de solo lectura ───────────────────────────────────────

def _bloquear_funciones_de_trading(mt5):
    """Defensa en profundidad ademas del comentario de cabecera: si por lo
    que sea algun dia alguien llama a una de estas funciones, el script
    falla ruidosamente en vez de mandar una orden real."""
    def _bloqueada(nombre):
        def _f(*a, **k):
            raise RuntimeError(
                f"BLOQUEADO: '{nombre}' es una funcion de trading, prohibida en este "
                f"script de solo lectura (post_cierre.py). Ver cabecera del archivo."
            )
        return _f

    for nombre in ("order_send", "order_check", "order_close"):
        if hasattr(mt5, nombre):
            setattr(mt5, nombre, _bloqueada(nombre))
    if hasattr(mt5, "positions_close"):
        setattr(mt5, "positions_close", _bloqueada("positions_close"))


def conectar_mt5():
    try:
        import MetaTrader5 as mt5
    except ImportError:
        sys.exit(
            "El paquete MetaTrader5 no esta instalado en este entorno. "
            "Activa el venv: tools\\post_cierre\\.venv\\Scripts\\Activate.ps1"
        )
    # Ruta exacta del terminal que el usuario tiene abierto a mano: nunca lanzar
    # otro MT5 de los instalados. timeout=60s y sin reintentos.
    if not mt5.initialize(path=MT5_TERMINAL_PATH, timeout=60_000):
        sys.exit(f"No se pudo conectar con el terminal MT5 (¿esta abierto?). Error: {mt5.last_error()}")
    _bloquear_funciones_de_trading(mt5)
    return mt5


def detectar_simbolo_oro(mt5, forzado: Optional[str] = None) -> str:
    if forzado:
        return forzado
    candidatos = [s for s in mt5.symbols_get() if "XAU" in s.name.upper() or "GOLD" in s.name.upper()]
    if not candidatos:
        sys.exit("No se encontro ningun simbolo XAU/GOLD en el broker conectado. Usa --simbolo para forzarlo.")
    visibles = [s for s in candidatos if s.visible]
    elegido = (visibles or candidatos)[0]
    nombres = ", ".join(sorted(s.name for s in candidatos))
    print(f"[MT5] Simbolos XAU/GOLD encontrados: {nombres} -> usando '{elegido.name}'")
    return elegido.name


def obtener_velas_m1(mt5, simbolo: str, desde: datetime, hasta: datetime) -> list:
    rates = mt5.copy_rates_range(simbolo, mt5.TIMEFRAME_M1, desde, hasta)
    if rates is None:
        return []
    return [Vela(datetime.utcfromtimestamp(int(r["time"])), float(r["open"]), float(r["high"]),
                 float(r["low"]), float(r["close"])) for r in rates]


# ── Calculos sobre velas ────────────────────────────────────────────────

def extremos(velas: list, direccion: str, precio_ref: float):
    mejor = peor = None
    mejor_en = peor_en = None
    for v in velas:
        if direccion == "buy":
            if mejor is None or v.high > mejor:
                mejor, mejor_en = v.high, v.time
            if peor is None or v.low < peor:
                peor, peor_en = v.low, v.time
        else:
            if mejor is None or v.low < mejor:
                mejor, mejor_en = v.low, v.time
            if peor is None or v.high > peor:
                peor, peor_en = v.high, v.time
    if mejor is None:
        return None, None, None, None
    if direccion == "buy":
        mfe = max(0.0, mejor - precio_ref)
        mae = max(0.0, precio_ref - peor)
    else:
        mfe = max(0.0, precio_ref - mejor)
        mae = max(0.0, peor - precio_ref)
    return round(mfe, 2), mejor_en, round(mae, 2), peor_en


def resultado_post_cierre_walk(velas_post: list, direccion: str, sl_original, tp_original):
    """Recorre velas_post (ya limitadas a la ventana de mercado) hasta tocar
    SL original o TP. Devuelve (resultado, indice_vela_del_toque o None)."""
    for i, v in enumerate(velas_post):
        if direccion == "buy":
            toco_sl = sl_original is not None and v.low <= sl_original
            toco_tp = tp_original is not None and v.high >= tp_original
        else:
            toco_sl = sl_original is not None and v.high >= sl_original
            toco_tp = tp_original is not None and v.low <= tp_original
        if toco_sl and toco_tp:
            return "ambiguo_misma_vela", i
        if toco_sl:
            return "fue_a_sl", i
        if toco_tp:
            return "fue_a_tp", i
    if not velas_post:
        return "datos_insuficientes", None
    return "ninguno_en_ventana", None


def recorrido_ventana_principal(velas_post: list, resultado: str, idx_toque, direccion: str,
                                precio_cierre: float, tp_original):
    """Recorrido a favor/en contra desde el cierre hasta el toque de SL/TP (o
    fin de ventana). La vela del toque no cuenta para el extremo a favor (no
    se sabe si ese extremo fue antes o despues del SL dentro del minuto); si
    el toque fue TP, el favor es exactamente la distancia al TP."""
    if idx_toque is None:
        tramo = velas_post
    else:
        tramo = velas_post[:idx_toque]
    favor, _, contra, _ = extremos(tramo, direccion, precio_cierre)
    if resultado == "fue_a_tp" and tp_original is not None:
        favor = round(abs(tp_original - precio_cierre), 2)
    elif favor is None and idx_toque == 0:
        favor = 0.0  # toque en la primera vela: no dio tiempo a nada a favor
    return favor, contra


def vela_que_contiene(velas: list, ts: datetime) -> Optional[Vela]:
    """Vela M1 cuyo minuto coincide con ts (mismo criterio que usa MT5:
    la vela con time <= ts < time+1min)."""
    objetivo = ts.replace(second=0, microsecond=0)
    for v in velas:
        if v.time == objetivo:
            return v
    return None


def precio_dentro_de_vela(vela: Optional[Vela], precio: float, margen: float = 0.5) -> Optional[bool]:
    if vela is None:
        return None
    return (vela.low - margen) <= precio <= (vela.high + margen)


# ── Analisis por trade ───────────────────────────────────────────────────

def analizar_trade(mt5, simbolo: str, trade: Trade, velas_out: Optional[dict] = None) -> ResultadoTrade:
    """velas_out (FASE 2): si se pasa un dict, se rellena con las velas para el
    grafico de la web (ver preparar_velas_grafico). No cambia ningun calculo."""
    notas = []

    periodo = ("septiembre" if trade.fecha_cierre >= FECHA_CORTE_SEPTIEMBRE
               else "agosto_secundario" if trade.fecha_cierre >= datetime(2026, 8, 1)
               else "anterior_no_fiable")

    sl_original, sl_origen, sl_descartados = reconstruir_original(trade, trade.cambios_sl, trade.sl_col)
    tp_original, tp_origen, tp_descartados = reconstruir_original(trade, trade.cambios_tp, trade.tp_col)
    if sl_descartados:
        notas.append(f"SL original con dedazo descartado: {sl_descartados}")
    if tp_descartados:
        notas.append(f"TP original con dedazo descartado: {tp_descartados}")

    deducido = deducir_tipo_cierre_por_precio(trade.precio_cierre, trade.sl_actual, trade.tp_actual)
    tipo_normalizado, discrepancia = normalizar_tipo_cierre(trade.tipo_cierre_evento, deducido)
    detallado = tipo_cierre_detallado(tipo_normalizado, trade.direccion, trade.precio_entrada, trade.sl_actual)

    reclas_be = reclasificar_breakeven(trade)
    hubo_be_real = len(reclas_be["reales"]) > 0
    be_ts = be_nivel = None
    if hubo_be_real:
        be_ts, be_nivel, _pts = reclas_be["reales"][0]

    # Velas desde la entrada hasta cierre + VENTANA_BUSQUEDA_DIAS de calendario,
    # en una sola llamada a MT5; la ventana post-cierre se corta despues en
    # velas M1 existentes = minutos de mercado abierto (salta fines de semana).
    desde = trade.fecha_entrada
    hasta = trade.fecha_cierre + timedelta(days=VENTANA_BUSQUEDA_DIAS)
    velas = obtener_velas_m1(mt5, simbolo, desde, hasta)
    velas_intra = [v for v in velas if trade.fecha_entrada <= v.time <= trade.fecha_cierre]
    velas_post = [v for v in velas if v.time > trade.fecha_cierre][:VENTANA_POST_CIERRE_MIN_MERCADO]
    if len(velas_post) < VENTANA_POST_CIERRE_MIN_MERCADO:
        notas.append(f"Ventana post-cierre incompleta: {len(velas_post)} de "
                     f"{VENTANA_POST_CIERRE_MIN_MERCADO} min de mercado disponibles")

    if not velas_intra:
        notas.append("Sin velas M1 durante el trade (broker sin historico en esa ventana, o trade < 1 min)")

    if velas_out is not None:
        velas_antes = obtener_velas_m1(mt5, simbolo, trade.fecha_entrada - timedelta(days=VENTANA_BUSQUEDA_DIAS),
                                       trade.fecha_entrada)
        velas_out["velas"] = preparar_velas_grafico(velas_antes, velas, trade, velas_post)

    mfe_calc, mfe_en, mae_calc, mae_en = extremos(velas_intra, trade.direccion, trade.precio_entrada)

    vela_entrada = vela_que_contiene(velas, trade.fecha_entrada)
    vela_cierre = vela_que_contiene(velas, trade.fecha_cierre)
    entrada_ok = precio_dentro_de_vela(vela_entrada, trade.precio_entrada)
    cierre_ok = precio_dentro_de_vela(vela_cierre, trade.precio_cierre)

    resultado_pc, idx_toque = resultado_post_cierre_walk(velas_post, trade.direccion, sl_original, tp_original)
    # Minutos de mercado hasta el toque (1 vela M1 = 1 min de mercado)
    tiempo_min = idx_toque + 1 if idx_toque is not None else None

    favor_pc, contra_pc = recorrido_ventana_principal(velas_post, resultado_pc, idx_toque, trade.direccion,
                                                      trade.precio_cierre, tp_original)
    favor_fijo = {}
    for mins in VENTANAS_FAVOR_FIJAS_MIN:
        f, _, _, _ = extremos(velas_post[:mins], trade.direccion, trade.precio_cierre)
        favor_fijo[mins] = f

    # Efecto del breakeven real (si lo hubo)
    be_efecto = "na"
    # pts a favor antes de tocar el SL original tras salir: cierres a mano
    # 'mixto' y salidas en BE 'mixto_te_saco_de_un_recorrido'.
    pts_favor_antes_sl = None
    if hubo_be_real:
        salida_en_be = detallado == "sl_breakeven"
        if salida_en_be:
            # Misma logica que los cierres a mano (criterios v2, 02/10)
            fue_a_favor = favor_pc is not None and favor_pc >= UMBRAL_FAVOR_MANUAL_PTS
            if resultado_pc == "fue_a_sl":
                be_efecto = "mixto_te_saco_de_un_recorrido" if fue_a_favor else "te_salvo"
                if fue_a_favor:
                    pts_favor_antes_sl = favor_pc
            elif resultado_pc == "fue_a_tp" or (resultado_pc == "ninguno_en_ventana" and fue_a_favor):
                be_efecto = "te_saco_de_un_ganador"
            else:
                be_efecto = "sin_efecto"
        else:
            velas_post_be = [v for v in velas_intra if v.time >= be_ts]
            habria_tocado_sl_original = False
            if sl_original is not None:
                for v in velas_post_be:
                    if trade.direccion == "buy" and v.low <= sl_original:
                        habria_tocado_sl_original = True
                        break
                    if trade.direccion == "sell" and v.high >= sl_original:
                        habria_tocado_sl_original = True
                        break
            be_efecto = "te_salvo" if habria_tocado_sl_original else "sin_efecto"

    # Decision de cierre a mano
    # favor_pc = recorrido a favor desde el cierre hasta el toque (sin la vela
    # del toque) o hasta el fin de la ventana principal.
    decision_manual = "na"
    if detallado == "manual":
        fue_a_favor = favor_pc is not None and favor_pc >= UMBRAL_FAVOR_MANUAL_PTS
        if resultado_pc == "fue_a_sl":
            pts_favor_antes_sl = favor_pc
            decision_manual = "mixto_te_saliste_con_poco" if fue_a_favor else "bien_cerrado"
        elif resultado_pc == "fue_a_tp":
            decision_manual = "pronto"
        elif resultado_pc == "ninguno_en_ventana":
            decision_manual = "pronto" if fue_a_favor else "correcto"
        else:  # ambiguo_misma_vela / datos_insuficientes
            decision_manual = "indeterminado"

    return ResultadoTrade(
        position_id=trade.position_id,
        fp=trade.fp,
        cuenta_numero=trade.cuenta_numero,
        estrategia=trade.estrategia or "sin_clasificar",
        periodo=periodo,
        direccion=trade.direccion,
        volumen=str(trade.volumen) if trade.volumen is not None else "",
        fecha_entrada=trade.fecha_entrada.isoformat(),
        precio_entrada=trade.precio_entrada,
        fecha_cierre=trade.fecha_cierre.isoformat(),
        precio_cierre=trade.precio_cierre,
        sl_original_usado=str(sl_original) if sl_original is not None else "",
        sl_original_origen=sl_origen,
        sl_original_descartados=";".join(str(x) for x in sl_descartados),
        tp_original_usado=str(tp_original) if tp_original is not None else "",
        tp_original_origen=tp_origen,
        tp_original_descartados=";".join(str(x) for x in tp_descartados),
        tipo_cierre_guardado=trade.tipo_cierre_evento or "",
        tipo_cierre_deducido_por_precio=deducido,
        tipo_cierre_normalizado=tipo_normalizado,
        tipo_cierre_discrepancia=str(discrepancia),
        tipo_cierre_detallado=detallado,
        mfe_ea_puntos="",  # la EA nunca lo rellena — ver examen_ea.md
        mae_ea_puntos="",
        mfe_calc_puntos=str(mfe_calc) if mfe_calc is not None else "",
        mfe_calc_en=mfe_en.isoformat() if mfe_en else "",
        mae_calc_puntos=str(mae_calc) if mae_calc is not None else "",
        mae_calc_en=mae_en.isoformat() if mae_en else "",
        entrada_dentro_de_vela=str(entrada_ok) if entrada_ok is not None else "sin_dato",
        cierre_dentro_de_vela=str(cierre_ok) if cierre_ok is not None else "sin_dato",
        n_be_eventos_ea=reclas_be["n_ea"],
        n_be_reales=len(reclas_be["reales"]),
        n_be_falsos=len(reclas_be["falsos"]),
        be_real_ts=be_ts.isoformat() if be_ts else "",
        be_real_nivel=str(be_nivel) if be_nivel is not None else "",
        be_efecto=be_efecto,
        resultado_post_cierre=resultado_pc,
        tiempo_mercado_hasta_resultado_min=str(tiempo_min) if tiempo_min is not None else "",
        recorrido_favor_post_cierre_puntos=str(favor_pc) if favor_pc is not None else "",
        recorrido_contra_post_cierre_puntos=str(contra_pc) if contra_pc is not None else "",
        recorrido_favor_1h_puntos=str(favor_fijo[60]) if favor_fijo[60] is not None else "",
        recorrido_favor_4h_puntos=str(favor_fijo[240]) if favor_fijo[240] is not None else "",
        velas_post_cierre_disponibles=len(velas_post),
        decision_cierre_manual=decision_manual,
        pts_favor_antes_sl=str(pts_favor_antes_sl) if pts_favor_antes_sl is not None else "",
        notas="; ".join(notas),
    )


# ── FASE 2: endpoint api/post-cierre.js ─────────────────────────────────

def leer_credenciales(path: Path = TOKEN_PATH) -> dict:
    """Lee token= (obligatorio) y bypass= (opcional, Protection Bypass de
    Vercel para previews). Nunca imprime los valores."""
    if not path.exists():
        sys.exit(f"Falta el archivo de token {path} (ignorado por git). Pide que lo regeneren; "
                 f"no pegues el token en la terminal.")
    cred = {}
    for linea in path.read_text(encoding="utf-8").splitlines():
        if "=" in linea:
            k, v = linea.split("=", 1)
            cred[k.strip()] = v.strip()
    if not cred.get("token"):
        sys.exit(f"El archivo {path} no tiene una linea token=...")
    return cred


class ClienteWeb:
    def __init__(self, base_url: str, cred: dict):
        self.base_url = base_url.rstrip("/")
        self._cred = cred

    def _peticion(self, metodo: str, accion: str, params: Optional[dict] = None, cuerpo=None):
        query = urllib.parse.urlencode(dict(params or {}, accion=accion))
        cabeceras = {"Authorization": "Bearer " + self._cred["token"], "Content-Type": "application/json"}
        if self._cred.get("bypass"):
            cabeceras["x-vercel-protection-bypass"] = self._cred["bypass"]
        datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
        req = urllib.request.Request(f"{self.base_url}/api/post-cierre?{query}", data=datos,
                                     headers=cabeceras, method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # Solo codigo + cuerpo de la respuesta: nunca las cabeceras de la peticion.
            cuerpo_err = e.read().decode("utf-8", "replace")[:300]
            if "Vercel Authentication" in cuerpo_err or "Protected deployment" in cuerpo_err:
                cuerpo_err = "deployment protegido por Vercel (falta o no vale bypass= en el archivo de token)"
            raise RuntimeError(f"{metodo} {accion}: HTTP {e.code} - {cuerpo_err}") from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"{metodo} {accion}: sin conexion con {self.base_url} ({e.reason})") from None

    def ping(self):
        return self._peticion("GET", "ping")

    def pendientes(self, version: int):
        return self._peticion("GET", "pendientes", {"version": version})

    def subir(self, lote: list):
        return self._peticion("POST", "resultados", cuerpo={"criterios_version": CRITERIOS_VERSION,
                                                            "resultados": lote})


def _ts_web(v: Optional[str]) -> Optional[datetime]:
    """'2026-10-01T15:15:06+00:00' -> naive, misma convencion que _ts()."""
    if v is None:
        return None
    return datetime.fromisoformat(v).replace(tzinfo=None)


def _fl(v) -> Optional[float]:
    return float(v) if v is not None else None


def _cascada_original(columna, cambios: list) -> Optional[float]:
    """Misma cascada que la exportacion de FASE 1 (sl/tp_original_reconstruido):
    columna -> valor_anterior del primer cambio -> valor_nuevo del primer cambio.
    Verificado 02/10 igual al CSV en los 290 trades comunes."""
    if columna is not None:
        return float(columna)
    if cambios:
        if cambios[0]["valor_anterior"] is not None:
            return float(cambios[0]["valor_anterior"])
        return float(cambios[0]["valor_nuevo"])
    return None


def cargar_desde_web(pendientes: list) -> tuple:
    """Construye los mismos Trade que cargar_trades + cargar_volumen +
    cargar_sl_tp_changes + cargar_eventos_sl, a partir de la respuesta de
    ?accion=pendientes. Devuelve (trades, dedup_stats)."""
    trades: dict[str, Trade] = {}
    vistos = set()
    duplicados = []
    total = 0
    for x in pendientes:
        eventos = sorted(x["eventos"], key=lambda e: e["timestamp"])
        cierres = [e["tipo_evento"] for e in eventos if e["tipo_evento"].startswith("cierre")]
        t = Trade(
            position_id=int(x["position_id"]),
            fp=x["fp"],
            cuenta_numero=str(x["cuenta_numero"]),
            estrategia=x["estrategia"],
            direccion=(x["tipo"] or "").lower(),
            precio_entrada=_fl(x["precio_entrada"]),
            fecha_entrada=_ts_web(x["fecha_entrada"]),
            precio_cierre=_fl(x["precio_cierre"]),
            fecha_cierre=_ts_web(x["fecha_cierre"]),
            sl_col=_cascada_original(x["sl_original"], x["sl_changes"]),
            tp_col=_cascada_original(x["tp_original"], x["tp_changes"]),
            sl_actual=_fl(x["sl_actual"]),
            tp_actual=_fl(x["tp_actual"]),
            tipo_cierre_evento=cierres[-1] if cierres else None,
            n_breakeven_ea=sum(1 for e in eventos if e["tipo_evento"] == "breakeven"),
            volumen=_fl(x["volumen"]),
        )
        for tipo, clave, destino in (("sl", "sl_changes", t.cambios_sl), ("tp", "tp_changes", t.cambios_tp)):
            for c in x[clave]:
                total += 1
                ts = _ts_web(c["timestamp"])
                key = (tipo, t.position_id, _fl(c["valor_anterior"]), _fl(c["valor_nuevo"]), ts)
                if key in vistos:
                    duplicados.append(key)
                    continue
                vistos.add(key)
                destino.append((ts, _fl(c["valor_nuevo"])))
            destino.sort(key=lambda z: z[0])
        t.eventos_be_ea = [(e["tipo_evento"], _ts_web(e["timestamp"]), _fl(e["precio"]), _fl(e["puntos_desde_entrada"]))
                           for e in eventos if e["tipo_evento"] in ("breakeven", "sl_protegido", "sl_ajustado")]
        trades[t.fp] = t
    return trades, {"total_filas": total, "filas_unicas": len(vistos), "duplicados": duplicados}


def _agrupar_velas(velas: list, k: int) -> list:
    out = []
    for i in range(0, len(velas), k):
        g = velas[i:i + k]
        out.append(Vela(g[0].time, g[0].open, max(v.high for v in g), min(v.low for v in g), g[-1].close))
    return out


def preparar_velas_grafico(velas_antes: list, velas: list, trade: Trade, velas_post: list) -> Optional[dict]:
    """Formato de post_cierre_velas: [[min_desde_inicio, o, h, l, c], ...] con
    VELAS_ANTES_ENTRADA de contexto + el trade (agrupado si pasa de
    MAX_VELAS_DURANTE) + la ventana post-cierre en M1 tal cual se analizo."""
    durante = [v for v in velas if v.time <= trade.fecha_cierre]
    primera = durante[0].time if durante else trade.fecha_entrada
    antes = [v for v in velas_antes if v.time < primera][-VELAS_ANTES_ENTRADA:]
    k = max(1, math.ceil(len(durante) / MAX_VELAS_DURANTE))
    if k > 1:
        durante = _agrupar_velas(durante, k)
    serie = antes + durante + velas_post
    if not serie:
        return None
    inicio = serie[0].time
    return {
        "inicio": inicio.isoformat() + "+00:00",
        "velas": [[int((v.time - inicio).total_seconds() // 60),
                   round(v.open, 2), round(v.high, 2), round(v.low, 2), round(v.close, 2)] for v in serie],
        "tf_durante_min": k,
        "idx_entrada": len(antes),
        "idx_cierre": len(antes) + len(durante),
    }


def resultado_a_fila(r: ResultadoTrade, trade: Trade, simbolo: str, broker: str) -> dict:
    """ResultadoTrade (strings, como el CSV) -> columnas de post_cierre_analisis."""
    def num(s):
        return float(s) if s not in ("", None) else None

    def ent(s):
        return int(s) if s not in ("", None) else None

    def booleano(s):
        return {"True": True, "False": False}.get(s)

    def iso(s):
        return s + "+00:00" if s else None

    # Ventana cerrada: el veredicto ya no puede cambiar si toco SL/TP, si hay
    # 4 h de mercado completas, o si el cierre es tan antiguo que no van a
    # llegar mas velas (datos_insuficientes de junio/julio no se re-analizan).
    ventana_completa = (r.resultado_post_cierre in ("fue_a_sl", "fue_a_tp", "ambiguo_misma_vela")
                        or r.velas_post_cierre_disponibles >= VENTANA_POST_CIERRE_MIN_MERCADO
                        or datetime.utcnow() - trade.fecha_cierre > timedelta(days=VENTANA_BUSQUEDA_DIAS))
    return {
        "fp": r.fp,
        "position_id": r.position_id,
        "cuenta_numero": r.cuenta_numero,
        "estrategia": None if r.estrategia == "sin_clasificar" else r.estrategia,
        "direccion": r.direccion,
        "volumen": num(r.volumen),
        "fecha_entrada": iso(r.fecha_entrada),
        "precio_entrada": r.precio_entrada,
        "fecha_cierre": iso(r.fecha_cierre),
        "precio_cierre": r.precio_cierre,
        "sl_original": num(r.sl_original_usado),
        "sl_original_origen": r.sl_original_origen,
        "tp_original": num(r.tp_original_usado),
        "tp_original_origen": r.tp_original_origen,
        "sl_final": trade.sl_actual,
        "tp_final": trade.tp_actual,
        "tipo_cierre_guardado": r.tipo_cierre_guardado or None,
        "tipo_cierre_deducido": r.tipo_cierre_deducido_por_precio,
        "tipo_cierre_discrepancia": r.tipo_cierre_discrepancia == "True",
        "tipo_cierre_detallado": r.tipo_cierre_detallado,
        "mfe_puntos": num(r.mfe_calc_puntos),
        "mfe_en": iso(r.mfe_calc_en),
        "mae_puntos": num(r.mae_calc_puntos),
        "mae_en": iso(r.mae_calc_en),
        "n_be_ea": r.n_be_eventos_ea,
        "n_be_reales": r.n_be_reales,
        "be_real_en": iso(r.be_real_ts),
        "be_real_nivel": num(r.be_real_nivel),
        "be_efecto": r.be_efecto,
        "resultado_post_cierre": r.resultado_post_cierre,
        "minutos_hasta_resultado": ent(r.tiempo_mercado_hasta_resultado_min),
        "favor_post_puntos": num(r.recorrido_favor_post_cierre_puntos),
        "contra_post_puntos": num(r.recorrido_contra_post_cierre_puntos),
        "favor_1h_puntos": num(r.recorrido_favor_1h_puntos),
        "favor_4h_puntos": num(r.recorrido_favor_4h_puntos),
        "velas_post_disponibles": r.velas_post_cierre_disponibles,
        "ventana_completa": ventana_completa,
        "decision_cierre_manual": r.decision_cierre_manual,
        "pts_favor_antes_sl": num(r.pts_favor_antes_sl),
        "entrada_en_vela": booleano(r.entrada_dentro_de_vela),
        "cierre_en_vela": booleano(r.cierre_dentro_de_vela),
        "notas": r.notas or None,
        "simbolo_velas": simbolo,
        "broker_velas": broker,
        "criterios_version": CRITERIOS_VERSION,
    }


def subir_resultados(cliente: ClienteWeb, filas: list) -> tuple:
    guardados = 0
    rechazados = []
    for i in range(0, len(filas), LOTE_SUBIDA):
        resp = cliente.subir(filas[i:i + LOTE_SUBIDA])
        guardados += resp.get("guardados", 0)
        rechazados += resp.get("rechazados", [])
        print(f"    lote {i // LOTE_SUBIDA + 1}: {resp.get('guardados', 0)} guardados, "
              f"{len(resp.get('rechazados', []))} rechazados")
    return guardados, rechazados


# ── Escritura de salidas ────────────────────────────────────────────────

def escribir_resultados_csv(resultados: list, out_dir: Path):
    path = out_dir / "resultados.csv"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNA_ORDEN_RESULTADOS)
        w.writeheader()
        for r in resultados:
            w.writerow(r.__dict__)
    return path


DECISIONES_MANUALES = ("bien_cerrado", "mixto_te_saliste_con_poco", "pronto", "correcto", "indeterminado")


def _conteo_manual(cont) -> str:
    return " ".join(f"{k}={cont[k]}" for k in DECISIONES_MANUALES)


def _semana_iso(fecha_iso: str) -> str:
    d = datetime.fromisoformat(fecha_iso)
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def escribir_resumen_md(resultados: list, out_dir: Path, filtro_cuenta_conectada: Optional[str],
                        broker_velas: str = "?"):
    def bloque_decisiones(lista, titulo, nivel="###"):
        manuales = [r for r in lista if r.decision_cierre_manual != "na"]
        cont = defaultdict(int)
        for r in manuales:
            cont[r.decision_cierre_manual] += 1
        be = [r for r in lista if r.be_efecto != "na"]
        cont_be = defaultdict(int)
        for r in be:
            cont_be[r.be_efecto] += 1
        sl_detalle = defaultdict(int)
        for r in lista:
            if r.tipo_cierre_detallado.startswith("sl_"):
                sl_detalle[r.tipo_cierre_detallado] += 1
        lineas = [f"{nivel} {titulo} ({len(lista)} trades)\n"]
        lineas.append(f"**Cierres a mano** ({len(manuales)} con veredicto post-cierre calculable):")
        for k in DECISIONES_MANUALES:
            lineas.append(f"- {k}: {cont[k]}")
        for k, texto in (("pronto", "pts dejados en los 'pronto'"),
                         ("mixto_te_saliste_con_poco", "pts a favor antes del SL en los 'mixto'")):
            vals = [float(r.recorrido_favor_post_cierre_puntos) for r in manuales
                    if r.decision_cierre_manual == k and r.recorrido_favor_post_cierre_puntos]
            if vals:
                lineas.append(f"- {texto}: total {round(sum(vals), 2)} · media {round(statistics.mean(vals), 2)} "
                              f"· mediana {round(statistics.median(vals), 2)}")
        lineas.append(f"\n**Breakeven real, efecto** ({len(be)} trades con BE real):")
        for k in ("te_salvo", "mixto_te_saco_de_un_recorrido", "te_saco_de_un_ganador", "sin_efecto"):
            lineas.append(f"- {k}: {cont_be[k]}")
        lineas.append(f"\n**Salidas por SL, detalle**:")
        for k in ("sl_original_o_ajustado_perdida", "sl_breakeven", "sl_beneficio_trailing"):
            lineas.append(f"- {k}: {sl_detalle[k]}")
        return "\n".join(lineas) + "\n"

    def por_grupo(lista, campo):
        grupos = defaultdict(list)
        for r in lista:
            grupos[getattr(r, campo)].append(r)
        out = []
        for k in sorted(grupos):
            g = grupos[k]
            manuales = [r for r in g if r.decision_cierre_manual != "na"]
            cont = defaultdict(int)
            for r in manuales:
                cont[r.decision_cierre_manual] += 1
            out.append(f"- **{k}**: {len(g)} trades · manual " + _conteo_manual(cont))
        return "\n".join(out)

    def bloques_por_periodo(lista, nivel, omitir_vacios):
        """Mismos bloques para la vista global y para cada cuenta: todo el
        historico, y luego septiembre+agosto / septiembre / agosto aparte."""
        sep = [r for r in lista if r.periodo == "septiembre"]
        ago = [r for r in lista if r.periodo == "agosto_secundario"]
        ant = [r for r in lista if r.periodo == "anterior_no_fiable"]
        partes = [bloque_decisiones(lista, "Todo el histórico", nivel)]
        for sub, titulo in ((sep + ago, "Septiembre + agosto"),
                            (sep, "Solo septiembre — periodo fiable"),
                            (ago, "Solo agosto — secundario, EA sin afinar del todo")):
            if sub or not omitir_vacios:
                partes.append(bloque_decisiones(sub, titulo, nivel))
        if ant:
            partes.append(f"*({len(ant)} trades de junio/julio incluidos en 'Todo el histórico': datos de "
                          f"origen casi todo NULL, la mayoría sin veredicto calculable.)*\n")
        return "\n".join(partes)

    por_semana = defaultdict(list)
    for r in resultados:
        por_semana[_semana_iso(r.fecha_cierre)].append(r)
    lineas_semana = []
    for sem in sorted(por_semana):
        g = por_semana[sem]
        manuales = [r for r in g if r.decision_cierre_manual != "na"]
        cont = defaultdict(int)
        for r in manuales:
            cont[r.decision_cierre_manual] += 1
        favor_vals = [float(r.recorrido_favor_post_cierre_puntos) for r in manuales
                      if r.recorrido_favor_post_cierre_puntos]
        media_favor = round(statistics.mean(favor_vals), 2) if favor_vals else None
        lineas_semana.append(
            f"- **{sem}**: {len(g)} trades cerrados · {len(manuales)} a mano "
            f"({_conteo_manual(cont)}) "
            f"· recorrido medio a favor tras cerrar (si aplica): {media_favor if media_favor is not None else 'n/d'} pts"
        )

    md = []
    md.append("# Resumen — análisis post-cierre (FASE 1, en seco)\n")
    md.append(f"Cuentas analizadas: `{filtro_cuenta_conectada or 'todas'}` · velas XAUUSD de: `{broker_velas}`\n")
    md.append(f"Ventana post-cierre: hasta tocar SL original o TP, máximo {VENTANA_POST_CIERRE_MIN_MERCADO // 60}h "
              f"de mercado abierto (fines de semana y cortes no cuentan) · cierres a mano con esta ventana: "
              f"SL sin ir {UMBRAL_FAVOR_MANUAL_PTS}pts a favor = bien_cerrado; SL tras ir "
              f"{UMBRAL_FAVOR_MANUAL_PTS}+ pts a favor = mixto; TP primero, o {UMBRAL_FAVOR_MANUAL_PTS}+ pts a "
              f"favor sin tocar SL = pronto; resto = correcto · "
              f"tolerancia BE: ±{BE_TOLERANCIA_PTS}pt\n")

    por_cuenta = defaultdict(list)
    for r in resultados:
        por_cuenta[r.cuenta_numero].append(r)

    # ── Vista GLOBAL (principal): todas las cuentas juntas, como en la web.
    # Las cuentas cambian pero la forma de operar es la misma.
    md.append("\n# 1. Vista global — todas las cuentas\n")
    md.append(f"{len(resultados)} trades de {len(por_cuenta)} cuentas "
              f"({', '.join(sorted(por_cuenta))}), incluidas las que ya no se usan.\n")
    md.append(bloques_por_periodo(resultados, "##", omitir_vacios=False))

    md.append("\n## Por estrategia A/B (todo el histórico)\n")
    md.append(por_grupo(resultados, "estrategia"))


    md.append("\n\n## Por semana\n")
    md.append("\n".join(lineas_semana))

    # ── Desglose por cuenta: mismos bloques, cuenta a cuenta.
    md.append("\n\n# 2. Desglose por cuenta\n")
    md.append(por_grupo(resultados, "cuenta_numero"))
    for c in sorted(por_cuenta, key=lambda k: max(r.fecha_cierre for r in por_cuenta[k]), reverse=True):
        g = por_cuenta[c]
        # Encaje precio guardado vs vela M1: detecta desfases de precio o de
        # hora de servidor entre brokers.
        ok_e = sum(1 for r in g if r.entrada_dentro_de_vela == "True")
        ok_c = sum(1 for r in g if r.cierre_dentro_de_vela == "True")
        fechas = sorted(r.fecha_cierre for r in g)
        md.append(f"\n## Cuenta {c}\n")
        md.append(f"{len(g)} trades · del {fechas[0][:10]} al {fechas[-1][:10]} · encaje con velas: "
                  f"entrada {ok_e}/{len(g)}, cierre {ok_c}/{len(g)}\n")
        md.append(bloques_por_periodo(g, "###", omitir_vacios=True))

    path = out_dir / "resumen.md"
    path.write_text("\n".join(md), encoding="utf-8")
    return path


def escribir_examen_ea_md(resultados: list, dedup_stats: dict, out_dir: Path):
    md = []
    md.append("# Examen de la EA — qué guarda bien, qué mal, qué falta\n")
    md.append("Generado por post_cierre.py (FASE 1, en seco). Solo lectura — ningún hallazgo de aquí se ha "
              "corregido en el EA ni en Supabase; eso queda para una sesión aparte.\n")

    # 1. MFE/MAE
    con_mfe_calc = [r for r in resultados if r.mfe_calc_puntos]
    md.append("\n## 1. MFE/MAE — la EA no los guarda nunca\n")
    md.append(f"`ea_trades.mfe_price/mfe_puntos/mae_price/mae_puntos` están a NULL en el 100% de los "
              f"{len(resultados)} trades analizados, pese a que las columnas existen. El código que las "
              f"calcula (`ActualizarExtremosAbiertas`, `1a16f57`) y el que las guarda (`api/trade-mt5.js`, "
              f"`0817b5a`) están desplegados desde el 04/09 — ver hallazgo previo de la sesión de auditoría.\n")
    md.append(f"Con velas M1 sí se pudieron calcular {len(con_mfe_calc)} de {len(resultados)}. Ejemplo de lo "
              f"que se está perdiendo (primeros 5):\n")
    for r in con_mfe_calc[:5]:
        md.append(f"- `{r.fp}`: MFE calculado {r.mfe_calc_puntos}pts, MAE calculado {r.mae_calc_puntos}pts "
                  f"(EA: ambos NULL)")

    # 2. Breakeven falsos
    total_ea = sum(r.n_be_eventos_ea for r in resultados)
    total_reales = sum(r.n_be_reales for r in resultados)
    total_falsos = total_ea - total_reales
    por_mes = defaultdict(lambda: {"ea": 0, "reales": 0})
    for r in resultados:
        mes = r.fecha_cierre[:7]
        por_mes[mes]["ea"] += r.n_be_eventos_ea
        por_mes[mes]["reales"] += r.n_be_reales
    md.append("\n## 2. Breakeven falsos — la EA etiqueta cualquier movimiento de SL cercano como 'breakeven'\n")
    md.append(f"Criterio correcto: SL nuevo a ±{BE_TOLERANCIA_PTS}pt de la entrada (usando "
              f"`puntos_desde_entrada` que la propia EA ya calcula y manda en el evento — no hace falta "
              f"recalcular nada, solo aplicar el umbral correcto). NO se descarta por tiempo: un lotaje alto "
              f"puede asegurar a BE en segundos y ser real.\n")
    md.append(f"Total eventos 'breakeven' etiquetados por la EA: {total_ea}. Reales según el criterio "
              f"correcto: {total_reales}. Falsos: {total_falsos} "
              f"({round(100*total_falsos/total_ea, 1) if total_ea else 0}%).\n")
    md.append("Por mes:\n")
    for mes in sorted(por_mes):
        d = por_mes[mes]
        falsos = d["ea"] - d["reales"]
        md.append(f"- {mes}: {d['ea']} etiquetados 'breakeven' · {d['reales']} reales · {falsos} falsos")

    # 3. Duplicados en ea_sl_changes/ea_tp_changes
    md.append("\n## 3. Filas duplicadas en ea_sl_changes / ea_tp_changes\n")
    md.append(f"De {dedup_stats['total_filas']} filas exportadas, {len(dedup_stats['duplicados'])} son "
              f"duplicados exactos (mismo position_id, valor_anterior, valor_nuevo y timestamp al segundo). "
              f"Quedaron {dedup_stats['filas_unicas']} filas únicas tras deduplicar.\n")
    md.append("A diferencia de `trade_eventos` (que tiene `UNIQUE(fp, tipo_evento, timestamp)` e "
              "`ignore-duplicates`), `ea_sl_changes`/`ea_tp_changes` no tienen protección de idempotencia en "
              "`api/trade-mt5.js` — un reintento de `ProcessRetryQueue()` que ya se guardó la primera vez "
              "vuelve a insertarse. No afecta a los totales de este análisis (se dedupli­ca aquí), pero infla "
              "los conteos de \"nº de cambios de SL/TP\" en cualquier consulta directa sobre esas tablas.\n")
    if dedup_stats["duplicados"]:
        ej = dedup_stats["duplicados"][0]
        md.append(f"Ejemplo: position_id {ej[1]}, {ej[0]} {ej[3]} en {ej[4]} (duplicado).\n")

    # 4. Dedazos
    con_dedazo_sl = [r for r in resultados if r.sl_original_descartados]
    con_dedazo_tp = [r for r in resultados if r.tp_original_descartados]
    md.append("\n## 4. Errores de tecleo en SL/TP original (no son fallo de la EA)\n")
    md.append(f"{len(con_dedazo_sl)} trades con al menos un valor de SL descartado por estar a más de "
              f"{DEDAZO_MAX_DIST}pts de la entrada; {len(con_dedazo_tp)} en TP. Se usó el siguiente valor "
              f"disponible en el histórico de cambios; si ninguno era razonable, se marcó `no_fiable`. "
              f"Clasificado como error de tecleo del usuario al modificar SL/TP a mano en MT5, no como bug "
              f"de la EA.\n")
    for r in con_dedazo_sl[:10]:
        md.append(f"- `{r.fp}` (entrada {r.precio_entrada}): SL descartado(s) {r.sl_original_descartados} "
                  f"→ usado: {r.sl_original_usado or 'no_fiable'} ({r.sl_original_origen})")
    for r in con_dedazo_tp[:10]:
        md.append(f"- `{r.fp}` (entrada {r.precio_entrada}): TP descartado(s) {r.tp_original_descartados} "
                  f"→ usado: {r.tp_original_usado or 'no_fiable'} ({r.tp_original_origen})")

    # 5. cierre_tp
    guardado_tp = [r for r in resultados if r.tipo_cierre_guardado == "cierre_tp"]
    deducido_tp = [r for r in resultados if r.tipo_cierre_deducido_por_precio == "tp_probable"]
    discrepantes = [r for r in resultados if r.tipo_cierre_discrepancia == "True"]
    por_par = defaultdict(int)
    for r in discrepantes:
        por_par[(r.tipo_cierre_guardado or "(null)", r.tipo_cierre_deducido_por_precio)] += 1
    md.append("\n## 5. Tipo de cierre guardado por la EA vs deducido por precio\n")
    md.append(f"Se compara el `tipo_cierre_evento` que guarda la EA con el que se deduce por precio (cierre a "
              f"≤{TOLERANCIA_DEDUCCION_TIPO_CIERRE}pt del SL o TP actual). Discrepancias: "
              f"{len(discrepantes)} de {len(resultados)}.\n")
    for (g, d), n in sorted(por_par.items(), key=lambda x: -x[1]):
        md.append(f"- guardado `{g}` · deducido `{d}`: {n}")
    md.append(f"\n`cierre_tp` guardado: {len(guardado_tp)} de {len(resultados)}; deducido por precio: "
              f"{len(deducido_tp)}. La EA no ha marcado ningún `cierre_tp` (hallazgo de la sesión de "
              f"auditoría, pendiente de otra sesión por tocar el EA de producción), aunque con estos datos "
              f"solo hay {len(deducido_tp)} caso(s) por precio, así que su peso real es pequeño.\n")
    md.append("Detalle de las discrepancias:\n")
    for r in discrepantes[:10]:
        md.append(f"- `{r.fp}`: guardado={r.tipo_cierre_guardado or '(null)'} · "
                  f"deducido={r.tipo_cierre_deducido_por_precio}")

    # 6. Entrada/cierre fuera de vela
    fuera_entrada = [r for r in resultados if r.entrada_dentro_de_vela == "False"]
    fuera_cierre = [r for r in resultados if r.cierre_dentro_de_vela == "False"]
    md.append("\n## 6. Precio de entrada/cierre guardado vs rango de su vela M1\n")
    md.append(f"Entrada fuera del rango [low,high] de su vela M1: {len(fuera_entrada)}. "
              f"Cierre fuera de rango: {len(fuera_cierre)}. (Sobre {len(resultados)} trades de todas las "
              f"cuentas, comparados con las velas XAUUSD del terminal abierto; margen ±0.5pt.)\n")
    for r in (fuera_entrada + fuera_cierre)[:10]:
        md.append(f"- `{r.fp}`: entrada={r.precio_entrada} (ok={r.entrada_dentro_de_vela}) · "
                  f"cierre={r.precio_cierre} (ok={r.cierre_dentro_de_vela})")

    # 7. estrategia NULL
    sin_clasificar = [r for r in resultados if r.estrategia == "sin_clasificar"]
    por_mes_estr = defaultdict(int)
    for r in sin_clasificar:
        por_mes_estr[r.fecha_cierre[:7]] += 1
    md.append("\n## 7. `estrategia` NULL — antes del 26/08 siempre, después parcial\n")
    md.append(f"{len(sin_clasificar)} de {len(resultados)} trades sin estrategia clasificada. Por mes:\n")
    for mes in sorted(por_mes_estr):
        md.append(f"- {mes}: {por_mes_estr[mes]} sin clasificar")

    path = out_dir / "examen_ea.md"
    path.write_text("\n".join(md), encoding="utf-8")
    return path


# ── main ─────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="Analizar solo los N trades más recientes (prueba)")
    ap.add_argument("--data-dir", type=Path, default=DATA_DIR_DEFAULT)
    ap.add_argument("--out-dir", type=Path, default=SALIDA_DIR_DEFAULT)
    ap.add_argument("--cuenta", type=str, default=None,
                    help="Analizar solo esta cuenta_numero (por defecto: todas, con las velas del terminal abierto)")
    ap.add_argument("--simbolo", type=str, default=None, help="Forzar el nombre exacto del símbolo de oro")
    ap.add_argument("--fuente", choices=("web", "csv"), default="web",
                    help="web: pendientes de api/post-cierre.js (FASE 2) · csv: CSVs de data/ (FASE 1)")
    ap.add_argument("--subir", action="store_true",
                    help="Subir los resultados a la web (sin esto no se escribe nada fuera de salida/)")
    ap.add_argument("--base-url", type=str, default=BASE_URL_DEFAULT,
                    help="URL de la web; para probar, la del preview de Vercel")
    args = ap.parse_args()
    if args.subir and args.fuente != "web":
        sys.exit("--subir solo funciona con --fuente web.")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    cliente = None
    if args.fuente == "web":
        print(f"[1/6] Pidiendo trades pendientes a {args.base_url} ...")
        cliente = ClienteWeb(args.base_url, leer_credenciales())
        try:
            resp = cliente.pendientes(CRITERIOS_VERSION)
        except RuntimeError as e:
            sys.exit(f"    Error: {e}")
        trades, dedup_stats = cargar_desde_web(resp["pendientes"])
        print(f"    {resp['total_ea']} trades EA cerrados en la web · {len(trades)} pendientes de análisis "
              f"(criterios v{CRITERIOS_VERSION}).")
        if not trades:
            print("    Nada que analizar.")
            return
    else:
        print("[1/6] Cargando CSVs...")
        trades = cargar_trades(args.data_dir)
        cargar_volumen(args.data_dir, trades)
        trades_por_pos = defaultdict(list)
        for t in trades.values():
            trades_por_pos[t.position_id].append(t)
        dedup_stats = cargar_sl_tp_changes(args.data_dir, trades_por_pos)
        cargar_eventos_sl(args.data_dir, trades)
    print(f"    {len(trades)} trades cerrados cargados. "
          f"sl_tp_changes: {dedup_stats['total_filas']} filas -> {dedup_stats['filas_unicas']} únicas "
          f"({len(dedup_stats['duplicados'])} duplicados descartados).")

    print("[2/6] Conectando a MT5 (solo lectura)...")
    mt5 = conectar_mt5()
    info = mt5.account_info()
    broker_velas = info.company if info else "?"
    print(f"    Cuenta conectada: {info.login if info else '?'} (broker: {broker_velas}) — "
          f"sus velas se usan para los trades de TODAS las cuentas")

    simbolo = detectar_simbolo_oro(mt5, args.simbolo)

    print("[3/6] Seleccionando trades...")
    lista = list(trades.values())
    if args.cuenta:
        antes = len(lista)
        lista = [t for t in lista if t.cuenta_numero == args.cuenta]
        print(f"    --cuenta {args.cuenta}: {len(lista)} de {antes} trades.")
    print(f"    {len(lista)} trades de {len({t.cuenta_numero for t in lista})} cuentas.")
    lista.sort(key=lambda t: t.fecha_cierre, reverse=True)
    if args.limit:
        lista = lista[: args.limit]
        print(f"    --limit {args.limit}: analizando solo estos {len(lista)}.")

    if not lista:
        mt5.shutdown()
        sys.exit("No hay trades que analizar con este filtro.")

    print(f"[4/6] Descargando velas M1 y analizando {len(lista)} trade(s)...")
    resultados = []
    filas_web = []
    for i, t in enumerate(lista, 1):
        print(f"    ({i}/{len(lista)}) {t.fp} ...")
        velas_out = {} if args.subir else None
        r = analizar_trade(mt5, simbolo, t, velas_out)
        resultados.append(r)
        if args.subir:
            filas_web.append({"analisis": resultado_a_fila(r, t, simbolo, broker_velas),
                              "velas": velas_out.get("velas")})

    mt5.shutdown()

    print("[5/6] Escribiendo resultados...")
    p1 = escribir_resultados_csv(resultados, args.out_dir)
    p2 = escribir_resumen_md(resultados, args.out_dir, args.cuenta, broker_velas)
    p3 = escribir_examen_ea_md(resultados, dedup_stats, args.out_dir)
    print(f"    {p1}")
    print(f"    {p2}")
    print(f"    {p3}")

    if args.subir:
        print(f"[6/6] Subiendo {len(filas_web)} resultado(s) a {args.base_url} ...")
        try:
            guardados, rechazados = subir_resultados(cliente, filas_web)
        except RuntimeError as e:
            sys.exit(f"    Error: {e}")
        print(f"    {guardados} guardados · {len(rechazados)} rechazados")
        for rr in rechazados[:20]:
            print(f"      - {rr.get('fp')}: {rr.get('motivo')}")
    else:
        print("[6/6] Listo (en seco: no se ha subido nada; usa --subir).")


if __name__ == "__main__":
    main()
