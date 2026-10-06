import pickle, collections, numpy as np
from datos import S
rng = np.random.default_rng(7)
def ci(x, B=4000):
    x = np.asarray(x)
    if len(x) < 2: return (np.nan, np.nan)
    b = rng.choice(x, (B, len(x))).mean(1); return tuple(np.percentile(b, [2.5, 97.5]))
out, TR = pickle.load(open(S + r"\analisis.pkl", "rb"))
G = lambda g: sorted([t for t in TR if t['grupo'] == g], key=lambda t: t['e_mid'])
def st(L):
    if not L: return 'n=0'
    p = np.array([t['pts'] for t in L]); lo, hi = ci(p, 3000)
    return f"n={len(L):3d} pts/trade {p.mean():+.2f} [IC95 {lo:+.2f},{hi:+.2f}] WR {100*(p>0).mean():.0f}% $ {sum(t['benef'] for t in L):+.0f}"
print('### 1) Hallazgos de la Maestra probados en otras cuentas (independiente)')
tests = {'sesion=NY 15-19': lambda t: t['sesion'] == 'NY 15-19', 'duracion=60+ min': lambda t: t['duracion'] == '60+ min',
         'duracion=15-59 min': lambda t: t['duracion'] == '15-59 min', 'sesion=Londres 09-14': lambda t: t['sesion'] == 'Londres 09-14',
         'Asia & venta': lambda t: t['sesion'] == 'Asia 00-08' and t['direccion'] == 'venta', 'Lunes': lambda t: t['dia_semana'] == 'Lun',
         'duracion=<5 min': lambda t: t['duracion'] == '<5 min', 'vuelta=sí': lambda t: t['vuelta'] == 'sí', 'espera <15': lambda t: t['espera'] == 'espera <15 min',
         '1º del día': lambda t: t['n_trade_dia'] == '1º del día', '4º+ del día': lambda t: t['n_trade_dia'] == '4º+ del día',
         'día en pérdida': lambda t: t['dia_iba'] == 'día en pérdida', 'tanteo': lambda t: t['tanteo'] == 'tanteo'}
for nom, fn in tests.items():
    print(f'  {nom}')
    for g in ('Maestra', 'Prueba', 'Resto'):
        L = G(g); A = [t for t in L if fn(t)]; B = [t for t in L if not fn(t)]
        print(f'     {g:8s} dentro: {st(A)} | fuera: {st(B)}')
print('\n### 2) Prueba: descriptivo por variable (78 trades; NO validable, solo orientativo)')
L = G('Prueba')
for v in ['sesion','dia_semana','direccion','lote','duracion','anterior','espera','vuelta','n_trade_dia','dia_iba','tanteo','estrat','ma200','dist_sl']:
    for val in sorted(set(t[v] for t in L if t[v] is not None)):
        A = [t for t in L if t[v] == val]
        if len(A) >= 10: print(f'  {v}={val:<28} {st(A)}')
print('\n### 2b) Maestra y Resto: variables solo EA (descriptivo, todos los trades EA)')
for g in ('Maestra','Resto'):
    L = [t for t in G(g) if t['ea']]
    for v in ['estrat','ma200','dist_sl']:
        for val in sorted(set(t[v] for t in L if t[v] is not None)):
            A = [t for t in L if t[v] == val]
            if len(A) >= 10: print(f'  {g} {v}={val:<20} {st(A)}')
print('\n### 3) Maestra: $ vs pts (¿el lote explica el P&L?)')
for g in ('Maestra','Prueba','Resto'):
    L = G(g); v = np.array([t['vol'] for t in L]); p = np.array([t['pts'] for t in L]); b = np.array([t['benef'] for t in L])
    med = np.median(v)
    print(f'  {g}: P&L real {b.sum():+.0f}; mismo trade con lote fijo {med}: {(p*100*med).sum():+.0f}; corr(lote, pts) {np.corrcoef(v,p)[0,1]:+.2f}')
    for lab, m in (('lote<med', v < med-1e-9), ('lote=med', abs(v-med) < 1e-9), ('lote>med', v > med+1e-9)):
        print(f'      {lab}: n={m.sum()} pts {p[m].mean():+.2f} $ {b[m].sum():+.0f}')
