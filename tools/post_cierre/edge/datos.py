r"""Edge por cuenta (06/10) — análisis en solo lectura. Ver ESTADO.md, sección "Edge por cuenta, 06/10".

Datos (tools/post_cierre/data/edge/, ignorado por git):
  trades_mios.csv  export de la tabla trades (solo tus filas)
  ea.json          trades EA cerrados (bajar_ea.py, endpoint ?accion=trades, solo lectura)
  m1.npy           velas M1 XAUUSD del MT5 local (velas.py, MT5 abierto, solo lectura)
Orden (desde tools/post_cierre, con .venv\Scripts\python.exe; PYTHONIOENCODING=utf-8):
  edge/bajar_ea.py · edge/velas.py · edge/build.py · edge/features.py · edge/analisis.py
  edge/parte2.py · edge/parte_ea.py · edge/sim.py · edge/operativa.py · edge/limite.py
  (calidad_*.py y prueba_reconstruccion.py: comprobaciones del paso 1)
"""
from pathlib import Path
import csv, json, collections, numpy as np
from datetime import datetime, timedelta
DATOS = Path(__file__).resolve().parent.parent / 'data' / 'edge'
S = str(DATOS)
CSV = DATOS / 'trades_mios.csv'
M1 = np.load(DATOS / "m1.npy"); T = M1[:, 0].astype('int64')
EPOCH = datetime(1970, 1, 1)
def ts(dt): return int((dt - EPOCH).total_seconds())
def vela(t):  # t epoch minute start
    i = np.searchsorted(T, t)
    return M1[i] if i < len(T) and T[i] == t else None
TOL = 0.35
def dentro(v, p): return v is not None and v[3] - TOL <= p <= v[2] + TOL

def reconstruir(fecha, hora, dur, pe, pc):
    """Minuto de entrada: vela de esa hora que contiene pe y cuya vela a +dur (±1) contiene pc."""
    base = datetime.strptime(fecha, "%Y.%m.%d") + timedelta(hours=hora)
    if ts(base) < T[0]: return None, 'sin_velas'
    cands = []
    for m in range(60):
        t0 = base + timedelta(minutes=m)
        if not dentro(vela(ts(t0)), pe): continue
        ok = any(dentro(vela(ts(t0 + timedelta(minutes=dur + k))), pc) for k in (0, -1, 1))
        if ok: cands.append(t0)
    if not cands: return None, 'sin_encaje'
    if len(cands) == 1: return cands[0], 'unico'
    # varias: si son consecutivas en un tramo corto, tomar la del medio (error pequeño)
    span = (cands[-1] - cands[0]).total_seconds() / 60
    if span <= 10: return cands[len(cands) // 2], 'tramo<=10'
    return None, 'ambiguo'

def naive(s): return datetime.fromisoformat(s).replace(tzinfo=None) if s else None
