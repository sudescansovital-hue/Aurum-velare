import pickle, numpy as np, itertools, collections
from features import VARS, VARS_EA
from datos import S
out, TR = pickle.load(open(S + r"\analisis.pkl", "rb"))
rng = np.random.default_rng(11)
def ci(x, B=3000):
    x = np.asarray(x)
    if len(x) < 2: return (np.nan, np.nan)
    b = rng.choice(x, (B, len(x))).mean(1); return tuple(np.percentile(b, [2.5, 97.5]))
print('Variables solo EA: split 60/40 dentro de los trades EA de cada grupo; un segmento entra si n IS >= 30')
for g in ('Maestra', 'Prueba', 'Resto'):
    L = sorted([t for t in TR if t['grupo'] == g and t['ea']], key=lambda t: t['e_mid'])
    k = int(round(len(L) * .6)); IS, OOS = L[:k], L[k:]
    print(f'== {g}: EA {len(L)} (IS {len(IS)} hasta {IS[-1]["fecha"]}, OOS {len(OOS)})')
    conds = [(v,) for v in VARS_EA] + [(a, b) for a in VARS_EA for b in VARS + VARS_EA if a != b and (b not in VARS_EA or a < b)]
    for vs in conds:
        grp = collections.defaultdict(list)
        for t in IS:
            key = tuple(t[v] for v in vs)
            if None not in key: grp[key].append(t)
        for key, A in grp.items():
            if len(A) < 30: continue
            p = [t['pts'] for t in A]; lo, hi = ci(p)
            B = [t['pts'] for t in OOS if tuple(t[v] for v in vs) == key]
            lo2, hi2 = ci(B) if len(B) >= 2 else (np.nan, np.nan)
            flag = 'IS IC>0' if lo > 0 else 'IS IC<0' if hi < 0 else ''
            print(f"  {' & '.join(f'{v}={x}' for v, x in zip(vs, key)):<60} IS n={len(A)} {np.mean(p):+.2f} [{lo:+.2f},{hi:+.2f}] | OOS n={len(B)} {np.mean(B) if B else np.nan:+.2f} [{lo2:+.2f},{hi2:+.2f}] {flag}")
