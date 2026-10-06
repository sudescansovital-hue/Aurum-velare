from datos import *
ea = json.load(open(S + r"\ea.json", encoding="utf-8"))['pendientes']
res = collections.Counter(); err = []
for e in ea:
    fe, fc = naive(e['fecha_entrada']), naive(e['fecha_cierre'])
    dur = int(round((fc - fe).total_seconds() / 60))
    fe0 = fe.replace(second=0)
    t, k = reconstruir(fe.strftime("%Y.%m.%d"), fe.hour, int((fc.replace(second=0)-fe0).total_seconds()//60), e['precio_entrada'], e['precio_cierre'])
    res[k] += 1
    if t: err.append(abs((t - fe0).total_seconds() / 60))
err = np.array(err); print(res, 'error min: mediana', np.median(err), 'p90', np.percentile(err, 90), '>5min', (err > 5).sum(), 'n', len(err))
