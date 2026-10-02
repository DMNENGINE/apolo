"""Lee las notificaciones de Discord que Windows guarda en el centro de notificaciones.
No toca la cuenta de Discord: solo lee wpndatabase.db (copiado, en modo lectura).
Uso: python dms_reader.py <ultimo_ArrivalTime>  -> imprime JSON [{t, title, body}] de las nuevas.
Con ultimo = -1 solo devuelve el ArrivalTime más reciente (para no inundar al arrancar)."""
import json, os, re, shutil, sqlite3, sys, tempfile
from xml.etree import ElementTree as ET

src = os.path.join(os.environ['LOCALAPPDATA'], 'Microsoft', 'Windows', 'Notifications')
tmp = os.path.join(tempfile.gettempdir(), 'robot-companion-wpn')
os.makedirs(tmp, exist_ok=True)
for f in ('wpndatabase.db', 'wpndatabase.db-wal', 'wpndatabase.db-shm'):
    try: shutil.copyfile(os.path.join(src, f), os.path.join(tmp, f))
    except OSError: pass

last = int(sys.argv[1]) if len(sys.argv) > 1 else -1
db = sqlite3.connect(os.path.join(tmp, 'wpndatabase.db'))
q = """select n.ArrivalTime, n.Payload from Notification n join NotificationHandler h on n.HandlerId = h.RecordId
       where h.PrimaryId like '%iscord%' and n.ArrivalTime > ? order by n.ArrivalTime"""
if last < 0:
    row = db.execute("select max(n.ArrivalTime) from Notification n join NotificationHandler h on n.HandlerId = h.RecordId where h.PrimaryId like '%iscord%'").fetchone()
    print(json.dumps({'last': row[0] or 0})); sys.exit()
out = []
for t, payload in db.execute(q, (last,)):
    xml = payload.decode('utf-8', 'ignore') if isinstance(payload, bytes) else payload
    try:
        texts = [(e.text or '').strip() for e in ET.fromstring(xml).iter('text')]
    except ET.ParseError:
        texts = [re.sub(r'<[^>]+>', '', xml)]
    texts = [x for x in texts if x]
    if texts:
        out.append({'t': t, 'title': texts[0][:80], 'body': ' '.join(texts[1:])[:300]})
print(json.dumps({'last': max([last] + [o['t'] for o in out]), 'items': out}))
