import sys, numpy as np
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import post_cierre as pc
mt5 = pc.conectar_mt5()
sim = pc.detectar_simbolo_oro(mt5)
out=[]
d=datetime(2026,4,1)
while d < datetime(2026,10,8):
    h=d+timedelta(days=15)
    r=mt5.copy_rates_range(sim, mt5.TIMEFRAME_M1, d.replace(tzinfo=timezone.utc), h.replace(tzinfo=timezone.utc))
    n=0 if r is None else len(r)
    print(d.date(), n)
    if n: out.append(np.stack([r['time'].astype('int64'), r['open'], r['high'], r['low'], r['close']], 1))
    d=h
mt5.shutdown()
a=np.concatenate(out); a=a[np.unique(a[:,0],return_index=True)[1]]
np.save((sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent.parent / 'data' / 'edge' / 'm1.npy')), a); print(a.shape, datetime.utcfromtimestamp(a[0,0]), datetime.utcfromtimestamp(a[-1,0]))
