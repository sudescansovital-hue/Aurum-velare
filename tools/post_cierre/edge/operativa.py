import pickle, numpy as np, collections
from datos import S
out, TR = pickle.load(open(S + r"\analisis.pkl", "rb"))
def perfil(nombre, L):
    L = sorted(L, key=lambda t: t['e_mid']); n = len(L)
    exact = [t for t in L if t['tiempo'] != 'solo_hora']
    dias = collections.defaultdict(list)
    for t in L: dias[t['fecha']].append(t)
    nd = np.array([len(v) for v in dias.values()])
    print(f'\n== {nombre}: {n} trades, {len(dias)} días, {L[0]["fecha"]} → {L[-1]["fecha"]}')
    print('  sesiones:', {k: f'{100*v/n:.0f}%' for k, v in sorted(collections.Counter(t['sesion'] for t in L).items())})
    v = np.array([t['vol'] for t in L])
    print(f'  lote: mediana {np.median(v)}, media {v.mean():.2f}, máx {v.max()}, % ≥0.4: {100*(v>=0.4).mean():.0f}%, % ≤0.11: {100*(v<=0.11).mean():.0f}%')
    print(f'  trades/día: media {nd.mean():.1f}, mediana {np.median(nd):.0f}, máx {nd.max()}, % días con 5+: {100*(nd>=5).mean():.0f}%')
    print(f'  ventas: {100*np.mean([t["dir"]=="sell" for t in L]):.0f}%')
    d = np.array([t['dur'] for t in L]); print(f'  duración: mediana {np.median(d):.0f} min, <5: {100*(d<5).mean():.0f}%, 15-59: {100*((d>=15)&(d<60)).mean():.0f}%, 60+: {100*(d>=60).mean():.0f}%')
    if exact:
        nn = [t for t in exact if t['n_dia_idx'] > 1]
        seg = [t for t in nn if t['espera'] == 'espera <15 min']; vu = [t for t in nn if t['vuelta'] == 'sí']; sol = [t for t in nn if t['espera'].startswith('solapada')]
        inc = [t for t in nn if 'incierta' in t['espera'] or 'incierto' in t['espera']]
        print(f'  (con hora exacta/velas: {len(exact)} trades; no-primeros del día {len(nn)}, inciertos {len(inc)})')
        print(f'  entradas seguidas <15 min: {100*len(seg)/max(1,len(nn)):.0f}% de los no-primeros; vueltas: {100*len(vu)/max(1,len(nn)):.0f}%; solapadas: {100*len(sol)/max(1,len(nn)):.0f}%')
        g = [t['gap_mid'] for t in nn if 'gap_mid' in t and t['tiempo']!='solo_hora']
        if g: print(f'  minutos entre cierre y siguiente entrada: mediana {np.median(g):.0f}')
    # cuándo paran
    ult = []; pnl_fin = []; minimo = []; tras500 = 0; dias500 = 0; tras_racha = []
    for f, T in dias.items():
        T = sorted(T, key=lambda t: t['e_mid']); cum = np.cumsum([t['benef'] for t in T])
        ult.append('ganó' if T[-1]['benef'] > 0 else 'perdió'); pnl_fin.append(cum[-1]); minimo.append(cum.min())
        hit = np.where(cum <= -500)[0]
        if len(hit): dias500 += 1; tras500 += len(T) - 1 - hit[0]
        # pérdidas seguidas al final
        k = 0
        for t in reversed(T):
            if t['benef'] < 0: k += 1
            else: break
        tras_racha.append(k)
    pnl_fin = np.array(pnl_fin)
    print(f'  paran tras un trade: {dict(collections.Counter(ult))}; días cerrados en pérdida {100*(pnl_fin<0).mean():.0f}%; P&L diario mediano {np.median(pnl_fin):+.0f} $')
    print(f'  días que tocan −500 $: {dias500} de {len(dias)}; trades hechos DESPUÉS de tocar −500: {tras500}')
    print(f'  pérdidas seguidas con las que terminan el día: media {np.mean(tras_racha):.1f}; días terminados con 2+ pérdidas seguidas: {100*np.mean(np.array(tras_racha)>=2):.0f}%')
    # lote tras pérdida
    up_loss = up_win = n_loss = n_win = 0
    for f, T in dias.items():
        T = sorted(T, key=lambda t: t['e_mid'])
        for a, b in zip(T, T[1:]):
            if a['benef'] < 0: n_loss += 1; up_loss += b['vol'] > a['vol']
            elif a['benef'] > 0: n_win += 1; up_win += b['vol'] > a['vol']
    print(f'  sube lote en el siguiente trade: tras pérdida {100*up_loss/max(1,n_loss):.0f}% ({n_loss}), tras ganancia {100*up_win/max(1,n_win):.0f}% ({n_win})')
M = [t for t in TR if t['grupo'] == 'Maestra']; P = [t for t in TR if t['grupo'] == 'Prueba']
perfil('Maestra (todo)', M)
perfil('Maestra desde 25/06 (hora exacta o por velas)', [t for t in M if t['fecha'] >= '2026.06.25'])
perfil('Maestra mismo periodo que la Prueba (10/09→)', [t for t in M if t['fecha'] >= '2026.09.10'])
perfil('Prueba', P)
