"""Lista de cortes (EDL) para quitar tiempos muertos de una grabación de pantalla.

Uso:
  ffmpeg -i grab.mp4 -vf "freezedetect=n=-75dB:d=2" -map 0:v -f null - 2> freeze.log
  python edl.py config.json
config.json:
  {"freeze_log": "freeze.log", "duracion": 774.9, "offset": 35.5, "item": 64,
   "pausa": 2.5, "pausas_largas": {"227.1": 5.0},           # segundo de inicio de la pausa -> segundos a conservar
   "cortes": [[441.8, 450.5], [488.8, 505.4]],             # cortes manuales (menús por error, ventanas coladas...)
   "secciones": {"02": 10, "03": 48},                      # segundo de la grabación donde empieza cada sección
   "salida": "steps.json"}
Imprime el mapa de secciones en la línea de tiempo y escribe los pasos timeline.place para FilmCraft (V1, sin audio).
"""
import json, re, sys
T = 254016000000  # ticks por segundo de FilmCraft

cfg = json.load(open(sys.argv[1], encoding="utf-8"))
END = cfg["duracion"]
log = open(cfg["freeze_log"], encoding="utf-8", errors="ignore").read()
st = [float(x) for x in re.findall(r"freeze_start: ([0-9.]+)", log)]
en = [float(x) for x in re.findall(r"freeze_end: ([0-9.]+)", log)]
fr = list(zip(st, en + [END] * (len(st) - len(en))))
m = []
for s, e in fr:  # unir pausas pegadas (el reloj de la barra de tareas las parte)
    if m and s - m[-1][1] < 0.3: m[-1] = (m[-1][0], e)
    else: m.append((s, e))
hold = {float(k): v for k, v in cfg.get("pausas_largas", {}).items()}
cuts = []
for s, e in m:
    k = next((v for key, v in hold.items() if s <= key + 0.05 and key < e), cfg.get("pausa", 2.5))
    if e - s > k + 0.4: cuts.append((s + k, e - 0.3))
cuts += [tuple(c) for c in cfg.get("cortes", [])]
cuts.sort()
mc = []
for s, e in cuts:
    if mc and s <= mc[-1][1]: mc[-1] = (mc[-1][0], max(e, mc[-1][1]))
    else: mc.append((s, e))
keeps, t = [], 0.0
for s, e in mc:
    if s - t > 0.25: keeps.append((t, s))
    t = max(t, e)
if END - t > 0.25: keeps.append((t, END))
OFF = cfg.get("offset", 0.0)

def tl(src):
    pos = OFF
    for s, e in keeps:
        if src < s: return pos
        if src <= e: return pos + src - s
        pos += e - s
    return pos

steps, pos = [], OFF
for s, e in keeps:
    steps.append({"id": "timeline.place", "params": {"item": cfg["item"], "track": "V1", "time": round(pos * T), "insert": False,
                  "sourceIn": round(s * T), "duration": round((e - s) * T), "audio": False}})
    pos += e - s
json.dump(steps, open(cfg.get("salida", "steps.json"), "w"))
total = sum(e - s for s, e in keeps)
print(json.dumps({"tramos": len(keeps), "duracion": round(total, 1), "fin": round(OFF + total, 1),
                  "secciones": {k: round(tl(v), 2) for k, v in cfg.get("secciones", {}).items()}}, ensure_ascii=False))
