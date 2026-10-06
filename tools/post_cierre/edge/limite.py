"""Límite de pérdida diaria (−500 $): por qué no coincidían el marcador del Diario
y el análisis de edge, y cuál es el dato bueno (aclarado 06/10).

Se rompe el límite, por cuenta y día de servidor, en el CIERRE del trade que deja
el P&L realizado del día en −500 $ o peor (como _daResumenDia en diario-analisis.js).
  A) Diario: solo trades EA analizados, todas las cuentas; "después" = trades
     CERRADOS más tarde (incluye los que ya estaban abiertos al romperse).
  C) Análisis de edge del 06/10 (ERRÓNEO): día y acumulado por orden de ENTRADA,
     así que sumaba P&L de trades aún abiertos y cambiaba el momento de la ruptura.
  D) Bueno para la regla "para al llegar a −500": todos los trades (EA + importados),
     y "después" = trades ABIERTOS después del cierre que rompe el límite.
"""
import pickle, json, csv, collections, numpy as np
from datos import S, CSV, naive
out, TR = pickle.load(open(S + r"\analisis.pkl", "rb"))
benef = {x['fp']: float(x['beneficio']) for x in csv.DictReader(open(CSV, encoding='utf-8-sig'))
         if x['usuario_email'] == 'roderastrader@gmail.com'}
ea = json.load(open(S + r"\ea.json", encoding="utf-8"))['pendientes']
LIM = -500

def calc(filas, clave_dia, orden, despues_por='cierre'):
    dias = collections.defaultdict(list)
    for r in filas: dias[clave_dia(r)].append(r)
    tras = []; nd = set()
    for k, L in dias.items():
        L = sorted(L, key=orden); acum = collections.Counter(); roto = {}
        for r in L:
            c = r['cuenta']
            if c in roto:
                if despues_por == 'cierre' or r['ini'] >= roto[c]: tras.append(r); nd.add((k, c))
                continue
            acum[c] += r['b']
            if acum[c] <= LIM: roto[c] = r['fin']
    porc = collections.defaultdict(lambda: [0, 0.0])
    for r in tras: porc[r['cuenta']][0] += 1; porc[r['cuenta']][1] += r['b']
    return tras, len(tras), round(sum(r['b'] for r in tras)), len(nd), {c: (n, round(v)) for c, (n, v) in porc.items()}

F_ea = [dict(cuenta=e['cuenta_numero'], ini=naive(e['fecha_entrada']), fin=naive(e['fecha_cierre']), b=benef[e['fp']], fp=e['fp'])
        for e in ea if e['fp'] in benef]
F_all = [dict(cuenta=t['cuenta'], grupo=t['grupo'], ini=t['e_mid'], fin=t['c_lo'] + (t['c_hi'] - t['c_lo']) / 2, b=t['benef'],
              pts=t['pts'], tiempo=t['tiempo'], fp=t['fp']) for t in TR]
dia_c = lambda r: r['fin'].date(); dia_e = lambda r: r['ini'].date()
A = calc(F_ea, dia_c, lambda r: r['fin'])
print('A) Diario (EA, global):            trades %d, $ %d, días %d, por cuenta %s' % A[1:])
print('   el marcador del 05/10 daba 51 trades / −6.349 $: le faltaba 2026.09.25_23453924 (−268,40 $, 178497, 25/09).')
print('   Su cierre se completó con sql_fix_cierre_23453924.sql el 05/10 y su análisis entró en el Diario el 05/10 a las 20:00 (auto.log).')
print('   fp en A:', '2026.09.25_23453924' in {r['fp'] for r in A[0]})
print('B) A con todos los trades:          trades %d, $ %d, días %d, por cuenta %s' % calc(F_all, dia_c, lambda r: r['fin'])[1:])
print('C) análisis del 06/10 (erróneo):    trades %d, $ %d, días %d, por cuenta %s' % calc(F_all, dia_e, lambda r: r['ini'])[1:])
D = calc(F_all, dia_c, lambda r: r['fin'], 'apertura')
print('D) BUENO (todos, abiertos después): trades %d, $ %d, días %d, por cuenta %s' % D[1:])
print('E) D solo EA:                       trades %d, $ %d, días %d, por cuenta %s' % calc(F_ea, dia_c, lambda r: r['fin'], 'apertura')[1:])
rng = np.random.default_rng(5)
for g in ('Maestra', 'Prueba', 'Resto'):
    L = [r for r in D[0] if r['grupo'] == g]; p = np.array([r['pts'] for r in L])
    b = rng.choice(p, (4000, len(p))).mean(1)
    print(f"   D {g}: {len(L)} trades, $ {sum(r['b'] for r in L):+.0f}, pts {p.mean():+.2f} IC95 {np.percentile(b, [2.5, 97.5]).round(2)}, "
          f"WR {100*(p>0).mean():.0f}%, con solo hora {sum(r['tiempo']=='solo_hora' for r in L)}")
