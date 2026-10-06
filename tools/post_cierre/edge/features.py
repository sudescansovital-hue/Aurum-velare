import pickle, collections, numpy as np
from datetime import datetime, timedelta
from datos import M1, T, ts, S
TR, CAL, REC = pickle.load(open(S + r"\trades.pkl", "rb"))
DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
def sesion(h):
    if h <= 8: return 'Asia 00-08'
    if h <= 14: return 'Londres 09-14'
    if h <= 19: return 'NY 15-19'
    return 'NY tarde 20-23'
def mins(a): return a.total_seconds() / 60
def ma200(t):
    tm = ts(t.replace(second=0))
    i = np.searchsorted(T, tm)      # vela de entrada (aún abierta): usar las 200 anteriores cerradas
    if i < 200 or i >= len(T) or T[i] - T[i - 200] > 200 * 60 * 3: return None
    return M1[i - 200:i, 4].mean()
porc = collections.defaultdict(list)
for t in TR: porc[t['cuenta']].append(t)
for c, L in porc.items():
    L.sort(key=lambda t: (t['e_mid'], t['pid']))
    med = float(np.median([t['vol'] for t in L]))
    for i, t in enumerate(L):
        t['sesion'] = sesion(t['hora'])
        t['dia_semana'] = DIAS[datetime.strptime(t['fecha'], '%Y.%m.%d').weekday()]
        t['direccion'] = 'compra' if t['dir'] == 'buy' else 'venta'
        t['lote'] = 'lote<mediana' if t['vol'] < med - 1e-9 else ('lote=mediana' if abs(t['vol'] - med) < 1e-9 else 'lote>mediana')
        t['lote_med_cuenta'] = med
        t['duracion'] = '<5 min' if t['dur'] < 5 else '5-14 min' if t['dur'] < 15 else '15-59 min' if t['dur'] < 60 else '60+ min'
        dia = [u for u in L[:i] if u['fecha'] == t['fecha']]
        t['n_dia_idx'] = len(dia) + 1
        t['n_trade_dia'] = '1º del día' if not dia else '2º-3º del día' if len(dia) <= 2 else '4º+ del día'
        if not dia:
            t['anterior'] = 'primero del día'; t['espera'] = 'primero del día'; t['vuelta'] = 'no'
        else:
            p = dia[-1]
            t['anterior'] = 'anterior ganó' if p['pts'] > 1 else 'anterior BE' if p['pts'] >= -1 else 'anterior perdió'
            glo, ghi = mins(t['e_lo'] - p['c_hi']), mins(t['e_hi'] - p['c_lo'])
            t['gap_mid'] = (glo + ghi) / 2
            if ghi < 0: e = 'solapada (anterior abierta)'
            elif glo >= -1 and ghi < 15: e = 'espera <15 min'
            elif glo >= 15 and ghi < 60: e = 'espera 15-59 min'
            elif glo >= 60: e = 'espera 60+ min'
            elif glo >= 15: e = 'espera 15+ min (incierto)'
            else: e = 'espera incierta'
            t['espera'] = e
            contraria = p['dir'] != t['dir']; mala = p['pts'] < 0 or p.get('cierre_tipo') == 'cierre_manual'
            if contraria and mala and e == 'espera <15 min': t['vuelta'] = 'sí'
            elif contraria and mala and e == 'espera incierta': t['vuelta'] = 'incierta'
            else: t['vuelta'] = 'no'
        cerr = [u for u in dia if u['c_lo'] + (u['c_hi'] - u['c_lo']) / 2 <= t['e_mid']]  # cierre estimado antes de la entrada estimada
        pnl = sum(u['benef'] for u in cerr)
        t['dia_iba'] = 'día en pérdida' if cerr and pnl < 0 else 'día en ganancia' if cerr and pnl > 0 else 'nada cerrado aún'
        if t['ea']:
            t['estrat'] = t['estrategia'] or 'sin clasificar'
            m = ma200(t['e_lo'])
            if m is None: t['ma200'] = None
            else:
                arriba = t['pe'] > m
                t['ma200'] = 'MA200 a favor' if arriba == (t['dir'] == 'buy') else 'MA200 en contra'
            t['dist_sl'] = None
            if t['sl_orig']:
                d = abs(t['pe'] - t['sl_orig'])
                t['dist_sl'] = 'SL ≤7' if d <= 7 else 'SL 7-11' if d <= 11 else 'SL 11-20' if d <= 20 else 'SL >20'
            else: t['dist_sl'] = 'sin SL inicial'
        else:
            t['estrat'] = t['ma200'] = t['dist_sl'] = None
        # tanteo (tu definición del 03/09): 1ª entrada del día con lote < mediana de la cuenta;
        # segunda entrada = la siguiente del día en la misma dirección que ese tanteo.
        if not dia: t['tanteo'] = 'tanteo' if t['lote'] == 'lote<mediana' else 'resto'
        elif len(dia) == 1 and dia[0]['tanteo'] == 'tanteo' and dia[0]['dir'] == t['dir']: t['tanteo'] = 'segunda tras tanteo'
        else: t['tanteo'] = 'resto'
VARS = ['sesion', 'dia_semana', 'direccion', 'lote', 'duracion', 'anterior', 'espera', 'vuelta', 'n_trade_dia', 'dia_iba', 'tanteo']
VARS_EA = ['estrat', 'ma200', 'dist_sl']
pickle.dump(TR, open(S + r"\feat.pkl", "wb"))
if __name__ == '__main__':
    for g in ('Maestra', 'Prueba', 'Resto'):
        L = [t for t in TR if t['grupo'] == g]
        print('==', g, len(L))
        for v in VARS + VARS_EA: print(' ', v, dict(collections.Counter(t[v] for t in L)))
