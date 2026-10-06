from datos import *
F = float
rows = [x for x in csv.DictReader(open(CSV, encoding='utf-8-sig'))
        if x['usuario_email'] in ('roderastrader@gmail.com', 'sudescansovital@gmail.com')]
ea = {e['fp']: e for e in json.load(open(S + r"\ea.json", encoding="utf-8"))['pendientes']}
calidad = collections.Counter()
calidad['filas de tus emails'] = len(rows)
rows2 = []
for x in rows:
    if x['cuenta_numero'] == '4011477': calidad['excluida 4011477 (pedido)'] += 1; continue
    if not x['fecha'] or not x['volumen'] or not x['tipo']:
        calidad['sin fecha/lote/dirección (import antiguo %s)' % x['cuenta_numero']] += 1; continue
    rows2.append(x)
# duplicados por cuenta+position_id
seen = {}
for x in rows2:
    k = (x['cuenta_numero'], x['fp'].split('_')[-1])
    if k in seen: calidad['duplicado'] += 1; x['_dup'] = 1
    seen[k] = 1
rows2 = [x for x in rows2 if not x.get('_dup')]
GR = {'7747760': 'Maestra', '178497': 'Prueba'}
T_ = []
recon = collections.Counter()
for x in rows2:
    t = dict(cuenta=x['cuenta_numero'], grupo=GR.get(x['cuenta_numero'], 'Resto'), fuente=x['fuente'], fp=x['fp'],
             pid=int(x['fp'].split('_')[-1]), dir=x['tipo'], vol=F(x['volumen']), pe=F(x['precio_entrada']),
             pc=F(x['precio_cierre']), benef=F(x['beneficio']), fecha=x['fecha'], hora=int(x['hora']), dur=int(x['dur_min']),
             estrategia=x['estrategia'] or None)
    t['pts'] = t['benef'] / (100 * t['vol'])
    e = ea.get(x['fp'])
    if e:
        fe, fc = naive(e['fecha_entrada']), naive(e['fecha_cierre'])
        t.update(e_lo=fe, e_hi=fe, c_lo=fc, c_hi=fc, tiempo='exacto_ea', ea=True)
        if fe.hour != t['hora']: calidad['EA: hora de trades != hora EA'] += 1
        t['sl_orig'] = e['sl_original']; t['estrategia'] = e['estrategia'] or t['estrategia']
        t['cierre_tipo'] = next((ev['tipo_evento'] for ev in reversed(e['eventos']) if ev['tipo_evento'].startswith('cierre')), None)
    else:
        m, k = reconstruir(t['fecha'], t['hora'], t['dur'], t['pe'], t['pc'])
        recon[k] += 1
        base = datetime.strptime(t['fecha'], "%Y.%m.%d") + timedelta(hours=t['hora'])
        if m: lo, hi = m - timedelta(minutes=3), m + timedelta(minutes=3)
        else: lo, hi = base, base + timedelta(minutes=59)
        t.update(e_lo=lo, e_hi=hi, c_lo=lo + timedelta(minutes=t['dur']), c_hi=hi + timedelta(minutes=t['dur'] + 1),
                 tiempo='velas' if m else 'solo_hora', ea=False, sl_orig=None, cierre_tipo=None)
    t['e_mid'] = t['e_lo'] + (t['e_hi'] - t['e_lo']) / 2
    T_.append(t)
print(calidad); print('reconstrucción importados', recon)
pickle_path = S + r"\trades.pkl"
import pickle; pickle.dump((T_, dict(calidad), dict(recon)), open(pickle_path, 'wb'))
for g in ('Maestra', 'Prueba', 'Resto'):
    L = [t for t in T_ if t['grupo'] == g]
    print(g, len(L), collections.Counter(t['tiempo'] for t in L), collections.Counter(t['hora'] for t in L).most_common())
