import pickle, numpy as np, collections
from datos import S
out, TR = pickle.load(open(S + r"\analisis.pkl", "rb"))
NO_ENTRADA = {'duracion'}   # no se sabe al entrar
def usable(s): return not (set(s['vars']) & NO_ENTRADA)
def match(s): return lambda t: tuple(t[v] for v in s['vars']) == s['key']
def metr(L, lots):
    usd = np.array([t['pts'] * 100 * l for t, l in zip(L, lots) if l > 0])
    if len(usd) == 0: return dict(n=0)
    eq = np.cumsum(usd); dd = (np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq).max()
    racha = mx = 0
    for u in usd:
        racha = racha + 1 if u < 0 else 0; mx = max(mx, racha)
    dias = collections.defaultdict(float)
    for t, l in zip(L, lots):
        if l > 0: dias[t['fecha']] += t['pts'] * 100 * l
    return dict(n=len(usd), usd=usd.sum(), usd_tr=usd.mean(), dd=dd, racha=mx, peor_dia=min(dias.values()))
def tabla(nombre, L, base, mejor, malos):
    fm = match(mejor) if mejor else (lambda t: False)
    fb = [match(s) for s in malos]
    malo = lambda t: any(f(t) for f in fb)
    est = {
        f'lote fijo {base}': [base] * len(L),
        f'2x ({2*base}) en "{mejor["seg"] if mejor else "-"}"': [2 * base if fm(t) else base for t in L],
        f'solo "{mejor["seg"] if mejor else "-"}"': [base if fm(t) else 0 for t in L],
        f'no operar los {len(malos)} segmentos malos IS': [0 if malo(t) else base for t in L],
        '2x en el mejor + no operar malos': [0 if malo(t) else 2 * base if fm(t) else base for t in L],
        'real (tus lotes)': [t['vol'] for t in L],
    }
    print(f'\n=== {nombre} (n={len(L)})')
    print(f'  mejor IS: {mejor["seg"] if mejor else "-"}  | malos IS: {[s["seg"] for s in malos]}')
    for k, lots in est.items():
        m = metr(L, lots)
        if m['n'] == 0: print(f'  {k:<70} sin trades'); continue
        print(f"  {k:<70} trades {m['n']:3d}  $ {m['usd']:+8.0f}  $/trade {m['usd_tr']:+7.1f}  máx DD {m['dd']:7.0f}  peor racha {m['racha']:2d}  peor día {m['peor_dia']:+6.0f}")
reglas = {}
for g in ('Maestra', 'Prueba', 'Resto'):
    r = out[g]
    cand = [s for s in r['segs_pos'] + r['segs_apar'] if usable(s)]
    mejor = max(cand, key=lambda s: s['pts_is']) if cand else None
    malos = [s for s in r['segs_neg'] if usable(s)]
    reglas[g] = (mejor, malos)
for g in ('Maestra', 'Resto'):
    L = sorted([t for t in TR if t['grupo'] == g and t['parte'] == 'OOS'], key=lambda t: t['e_mid'])
    base = out[g]['total']['lote_med']
    tabla(f'{g} — fuera de muestra, reglas sacadas de su primera parte', L, base, *reglas[g])
P = sorted([t for t in TR if t['grupo'] == 'Prueba'], key=lambda t: t['e_mid'])
tabla('Prueba — TODOS sus trades con las reglas de la Maestra (prueba independiente)', P, 0.2, *reglas['Maestra'])
POOS = [t for t in P if t['parte'] == 'OOS']
tabla('Prueba — su parte final con las reglas de la Maestra', POOS, 0.2, *reglas['Maestra'])
