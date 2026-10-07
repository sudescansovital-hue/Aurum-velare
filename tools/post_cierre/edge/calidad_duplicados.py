import csv,collections,json
from datos import S, CSV
r=[x for x in csv.DictReader(open(CSV,encoding='utf-8-sig')) if x['usuario_email'] in ('roderastrader@gmail.com',) and x['cuenta_numero']!='4011477' and x['fecha']]
ea=json.load(open(S + r'\ea.json',encoding='utf-8'))['pendientes']
F=float
imp=[x for x in r if x['fuente']=='import']; eat=[x for x in r if x['fuente']=='ea']
m=0
for a in imp:
    for b in eat:
        if a['cuenta_numero']==b['cuenta_numero'] and a['fecha']==b['fecha'] and abs(F(a['precio_entrada'])-F(b['precio_entrada']))<0.5 and abs(int(a['hora'])-int(b['hora']))<=1:
            m+=1; print('posible doble',a['fp'],b['fp'],a['beneficio'],b['beneficio'],a['volumen'],b['volumen'],a['hora'],b['hora'],a['dur_min'],b['dur_min'])
print('posibles dobles',m)
for f in ['2026.07.02_18579861','2026.07.02_18562722','2026.06.30_18162636','2026.06.30_18160546','2026.08.24_21761795']:
    e=[x for x in ea if x['fp']==f][0]
    cand=[(x['fp'],x['fuente'],x['beneficio'],x['hora']) for x in r if x['cuenta_numero']==e['cuenta_numero'] and abs(F(x['precio_entrada'])-e['precio_entrada'])<0.5]
    print(f,e['tipo'],e['volumen'],e['beneficio'],e['fecha_entrada'],e['fecha_cierre'],'| en trades:',cand)
