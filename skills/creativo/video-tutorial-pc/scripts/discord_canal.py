#!/usr/bin/env python3
"""Crea un canal de SOLO LECTURA en DIGITAL VOID y publica un embed ES + EN del tutorial. Se ejecuta EN LA PI.

  scp discord_canal.py config.json miniatura.jpg dmn@192.168.1.127:/tmp/
  ssh dmn@192.168.1.127 'set -a; . ~/control-commander/.env; set +a; python3 /tmp/discord_canal.py /tmp/config.json; rm -f /tmp/discord_canal.py /tmp/config.json /tmp/miniatura.jpg'

config.json:
 {"guild": "756289290400694392", "categoria": "1339733219184218113",   # TOOLS
  "nombre": "🍒│𝐋𝐈𝐂𝐇𝐈𝐈-𝐒𝐖𝐈𝐓𝐂𝐇-𝟐", "tema": "…", "imagen": "/tmp/miniatura.jpg",
  "embeds": [{"title": "…", "url": "…", "color": 16723582, "description": "…", "image": {"url": "attachment://miniatura.jpg"}},
             {"title": "🇺🇸 …", "description": "…"}]}
Para editar después (p. ej. al tener el link de YouTube): PATCH /channels/<canal>/messages/<mensaje> con {"embeds": [...]}.
NUNCA publiques enlaces a juegos/ROMs/keys/firmware: comprueba antes cualquier enlace con `curl -sI`.
"""
import json, os, sys, urllib.request, uuid

C = json.load(open(sys.argv[1], encoding="utf-8"))
API = "https://discord.com/api/v10"
H = {"Authorization": f"Bot {os.environ['DISCORD_BOT_TOKEN']}", "User-Agent": "DiscordBot (control-comander, 1.0)"}

def req(method, path, body=None, headers=None, raw=None):
    h = dict(H); h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if body is not None and raw is None: h["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(API + path, data=data, method=method, headers=h)) as r:
        return json.loads(r.read() or b"null")

G = C["guild"]
cat = next(c for c in req("GET", f"/guilds/{G}/channels") if c["id"] == C["categoria"])
ow = [dict(o) for o in cat.get("permission_overwrites", [])]          # hereda los permisos de la categoría
DENY = 2048 | 274877906944 | 34359738368 | 68719476736              # escribir, escribir en hilos, crear hilos
e = next((o for o in ow if o["id"] == G), None)
if e: e["deny"] = str(int(e["deny"]) | DENY); e["allow"] = str(int(e["allow"]) & ~DENY)
else: ow.append({"id": G, "type": 0, "allow": "0", "deny": str(DENY)})
ow.append({"id": req("GET", "/users/@me")["id"], "type": 1, "allow": str(1024 | 2048 | 16384 | 32768 | 65536), "deny": "0"})
ch = req("POST", f"/guilds/{G}/channels", {"name": C["nombre"], "type": 0, "parent_id": C["categoria"],
                                          "topic": C.get("tema", ""), "permission_overwrites": ow})
payload = {"embeds": C["embeds"], "allowed_mentions": {"parse": []}}
if C.get("imagen"):
    fn = os.path.basename(C["imagen"]); payload["attachments"] = [{"id": 0, "filename": fn}]
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"
            + json.dumps(payload) + f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{fn}\"\r\n"
            "Content-Type: image/jpeg\r\n\r\n").encode() + open(C["imagen"], "rb").read() + f"\r\n--{b}--\r\n".encode()
    msg = req("POST", f"/channels/{ch['id']}/messages", raw=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
else:
    msg = req("POST", f"/channels/{ch['id']}/messages", payload)
print(json.dumps({"canal": ch["id"], "mensaje": msg["id"], "url": f"https://discord.com/channels/{G}/{ch['id']}"}))
