from datos import *
r=[x for x in csv.DictReader(open(CSV,encoding='utf-8-sig')) if x['usuario_email']=='roderastrader@gmail.com' and x['cuenta_numero']!='4011477' and x['fecha'] and x['volumen']]
F=float
rat=collections.defaultdict(list); big=[]
for x in r:
    v=F(x['volumen']); b=F(x['beneficio']); pe,pc=F(x['precio_entrada']),F(x['precio_cierre'])
    d=1 if x['tipo']=='buy' else -1
    pts=b/(100*v); pp=d*(pc-pe)
    if abs(pp)>3: rat[x['cuenta_numero']].append(pts/pp)
    if abs(pts)>60 or abs(pp)>60 or v>5 or v<0.01: big.append((x['cuenta_numero'],x['fp'],x['tipo'],v,b,pe,pc,round(pts,1),round(pp,1),x['dur_min']))
for c,l in rat.items(): l=np.array(l); print(c,len(l),'mediana pts_benef/pts_precio',round(np.median(l),3),'fuera [0.8,1.2]:',((l<0.8)|(l>1.2)).sum())
print('extremos'); [print(b) for b in big]
vs=collections.Counter((x['cuenta_numero'],x['volumen']) for x in r); print(sorted(vs.items()))
