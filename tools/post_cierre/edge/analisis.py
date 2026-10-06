import pickle, collections, itertools, json, numpy as np
from features import VARS, VARS_EA
from datos import S
TR = pickle.load(open(S + r"\feat.pkl", "rb"))
rng = np.random.default_rng(7)
IS_FRAC, MIN_IS, MIN_OOS = 0.6, 30, 15
def ci(x, B=4000):
    x = np.asarray(x); 
    if len(x) < 2: return (np.nan, np.nan)
    b = rng.choice(x, (B, len(x))).mean(1); return tuple(np.percentile(b, [2.5, 97.5]))
def resumen(L):
    p = np.array([t['pts'] for t in L]); b = np.array([t['benef'] for t in L])
    f = sorted(t['fecha'] for t in L)
    return dict(n=len(L), desde=f[0], hasta=f[-1], pnl=round(b.sum(), 2), wr=round(100 * (b > 0).mean(), 1),
                pts=round(p.mean(), 2), pts_ci=[round(v, 2) for v in ci(p)], usd=round(b.mean(), 2), lote_med=float(np.median([t['vol'] for t in L])),
                dias=len(set(f)))
out = {}
for g in ('Maestra', 'Prueba', 'Resto'):
    L = sorted([t for t in TR if t['grupo'] == g], key=lambda t: t['e_mid'])
    k = int(round(len(L) * IS_FRAC)); IS, OOS = L[:k], L[k:]
    for t in IS: t['parte'] = 'IS'
    for t in OOS: t['parte'] = 'OOS'
    res = dict(total=resumen(L), IS=resumen(IS), OOS=resumen(OOS))
    if g == 'Resto': res['por_cuenta'] = {c: resumen([t for t in L if t['cuenta'] == c]) for c in sorted(set(t['cuenta'] for t in L))}
    vars_ = VARS + VARS_EA
    segs = []
    conds = [(v,) for v in vars_] + list(itertools.combinations(vars_, 2))
    for vs in conds:
        vals = collections.defaultdict(list)
        for t in IS:
            key = tuple(t[v] for v in vs)
            if None in key: continue
            vals[key].append(t)
        for key, A in vals.items():
            if len(A) < MIN_IS: continue
            # descartar combinaciones redundantes (la 2ª condición no filtra nada)
            if len(vs) == 2:
                n1 = sum(1 for t in IS if t[vs[0]] == key[0]); n2 = sum(1 for t in IS if t[vs[1]] == key[1])
                if len(A) in (n1, n2): continue
            p = np.array([t['pts'] for t in A]); lo, hi = ci(p, 2000)
            B = [t for t in OOS if tuple(t[v] for v in vs) == key]
            q = np.array([t['pts'] for t in B])
            segs.append(dict(seg=' & '.join(f'{v}={x}' for v, x in zip(vs, key)), vars=vs, key=key,
                             n_is=len(A), pts_is=p.mean(), lo_is=lo, hi_is=hi, wr_is=(p > 0).mean(),
                             n_oos=len(B), pts_oos=q.mean() if len(B) else np.nan,
                             wr_oos=(q > 0).mean() if len(B) else np.nan))
    # positivos candidatos: IS IC95 > 0 ; aparentes: IS media > 0 y > media IS de la cuenta
    base_is = res['IS']['pts']
    for s in segs:
        if s['n_oos'] >= MIN_OOS:
            B = [t['pts'] for t in OOS if tuple(t[v] for v in s['vars']) == s['key']]
            s['lo_oos'], s['hi_oos'] = ci(B, 2000)
        else: s['lo_oos'] = s['hi_oos'] = np.nan
    def veredicto(s, signo):
        if s['n_oos'] < MIN_OOS: return 'no verificable (OOS<15)'
        if signo > 0:
            if s['lo_oos'] > 0: return 'SE SOSTIENE (IC95 OOS > 0)'
            if s['pts_oos'] > 0: return 'se sostiene débil (OOS > 0, IC incluye 0)'
            return 'NO se sostiene'
        else:
            if s['hi_oos'] < 0: return 'PIERDE SIEMPRE (IC95 OOS < 0)'
            if s['pts_oos'] < 0: return 'pierde débil (OOS < 0, IC incluye 0)'
            return 'NO se sostiene'
    pos = [s for s in segs if s['lo_is'] > 0]
    apar = [s for s in segs if s['lo_is'] <= 0 and s['pts_is'] > max(0, base_is)]
    neg = [s for s in segs if s['hi_is'] < 0]
    for s in pos + apar: s['ver'] = veredicto(s, +1)
    for s in neg: s['ver'] = veredicto(s, -1)
    res['segs_pos'] = sorted(pos, key=lambda s: -s['lo_is'])
    res['segs_apar'] = sorted(apar, key=lambda s: -s['pts_is'])
    res['segs_neg'] = sorted(neg, key=lambda s: s['hi_is'])
    res['n_segs'] = len(segs)
    out[g] = res
pickle.dump((out, TR), open(S + r"\analisis.pkl", "wb"))
f = lambda v: '—' if v is None or (isinstance(v, float) and np.isnan(v)) else f'{v:+.2f}' if isinstance(v, float) else str(v)
for g, r in out.items():
    print(f"\n######## {g}")
    for k in ('total', 'IS', 'OOS'): print(k, r[k])
    if 'por_cuenta' in r:
        for c, v in r['por_cuenta'].items(): print('   ', c, v)
    print('segmentos evaluados (n IS≥30):', r['n_segs'])
    for nom in ('segs_pos', 'segs_neg', 'segs_apar'):
        print(f"-- {nom}: {len(r[nom])}")
        for s in r[nom][:25]:
            print(f"   {s['seg']:<70} IS n={s['n_is']:3d} {f(s['pts_is'])} [{f(s['lo_is'])},{f(s['hi_is'])}] WR{s['wr_is']:.0%} | OOS n={s['n_oos']:3d} {f(s['pts_oos'])} [{f(s['lo_oos'])},{f(s['hi_oos'])}] | {s['ver']}")
