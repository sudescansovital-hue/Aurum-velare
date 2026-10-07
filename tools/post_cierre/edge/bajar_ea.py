import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import post_cierre as pc
url = getattr(pc, "BASE_URL_POR_DEFECTO", None) or "https://aurumvelare.com"
cli = pc.ClienteWeb(url, pc.leer_credenciales())
d = cli.trades()
json.dump(d, open((sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent.parent / 'data' / 'edge' / 'ea.json')), "w", encoding="utf-8"), ensure_ascii=False, default=str)
print(type(d), list(d.keys()) if isinstance(d, dict) else len(d))
for k,v in (d.items() if isinstance(d, dict) else []):
    print(k, len(v) if hasattr(v,'__len__') else v)
