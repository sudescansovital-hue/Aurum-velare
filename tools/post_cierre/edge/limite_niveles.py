"""Límite diario con la regla real del usuario (06/10), POR CUENTA, día de servidor
por hora de CIERRE, P&L realizado en orden de cierre:
  N1 un solo trade pierde >= 500 $  -> ese día se cierra (en el cierre de ese trade)
  N2 el día suma <= -800 $          -> límite
  N3 el día suma <= -1.100 $        -> cierre obligatorio
"Después" = trades ABIERTOS después del cierre que rompe el nivel (los que ya
estaban abiertos se cuentan aparte). Todos los trades (EA + importados).
"""
import pickle, collections, sys, numpy as np
from datos import S
out, TR = pickle.load(open(S + r"\analisis.pkl", "rb"))
NIV = {'N1 trade <= -500': ('trade', -500), 'N2 día <= -800': ('dia', -800), 'N3 día <= -1.100': ('dia', -1100)}
rng = np.random.default_rng(9)
def ic(p):
    if len(p) < 2: return '—'
    b = rng.choice(p, (4000, len(p))).mean(1); lo, hi = np.percentile(b, [2.5, 97.5]); return f'[{lo:+.2f}, {hi:+.2f}]'
def fin(t): return t['c_lo'] + (t['c_hi'] - t['c_lo']) / 2
for cuenta, nom in (('7747760', 'Maestra'), ('178497', 'Prueba')):
    L = [t for t in TR if t['cuenta'] == cuenta]
    dias = collections.defaultdict(list)
    for t in L: dias[fin(t).date()].append(t)
    print(f'\n== {nom} {cuenta}: {len(L)} trades, {len(dias)} días con cierres')
    rupturas = {}
    for niv, (tipo, lim) in list(NIV.items()) + [('Cualquiera (el primero que salte)', ('any', None))]:
        nd = 0; tras = []; abiertos = []; detalle = []
        for d, T in sorted(dias.items()):
            T = sorted(T, key=fin); acum = 0; mom = None
            for t in T:
                acum += t['benef']
                hit = (t['benef'] <= -500 if tipo == 'trade' else acum <= lim if tipo == 'dia'
                       else (t['benef'] <= -500 or acum <= -800))
                if hit: mom = fin(t); break
            if mom is None: continue
            nd += 1
            dt = [u for u in T if u['e_mid'] >= mom]; ab = [u for u in T if u['e_mid'] < mom and fin(u) > mom]
            tras += dt; abiertos += ab
            detalle.append(f"{d} ({len(dt)} después, {sum(u['benef'] for u in dt):+.0f} $; día {sum(u['benef'] for u in T):+.0f} $)")
        p = np.array([u['pts'] for u in tras])
        sol = sum(u['tiempo'] == 'solo_hora' for u in tras)
        print(f"  {niv:<34} días {nd:2d} | trades después {len(tras):3d}  $ {sum(u['benef'] for u in tras):+7.0f}  "
              f"pts/trade {p.mean() if len(p) else float('nan'):+.2f} {ic(p)}  WR {100*(p>0).mean() if len(p) else 0:.0f}%"
              f" | ya abiertos {len(abiertos)} ({sum(u['benef'] for u in abiertos):+.0f} $) | con solo hora {sol}")
        if '-v' in sys.argv:
            for x in detalle: print('      ', x)
