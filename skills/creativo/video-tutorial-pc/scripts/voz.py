"""Narración neural por secciones con edge-tts.

Uso: python voz.py guion.json carpeta_salida [voz] [rate] [secciones]
  guion.json = {"00": "texto...", "01": "texto..."}
  voz: es-MX-JorgeNeural (ES hombre, por defecto) · en-US-AndrewNeural (EN hombre)
  rate: "+0%", "+5%", "+10%"  ·  secciones: "02,03" para regenerar solo esas
Escribe <carpeta>/voz_<sección>.mp3 e imprime la duración de cada una (ffprobe).
Si da 403: pip install --upgrade edge-tts.  Si una sección da NoAudioReceived, se reintenta 3 veces.
"""
import asyncio, json, os, subprocess, sys, time
import edge_tts

guion = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
voz = sys.argv[3] if len(sys.argv) > 3 else "es-MX-JorgeNeural"
rate = sys.argv[4] if len(sys.argv) > 4 else "+0%"
solo = sys.argv[5].split(",") if len(sys.argv) > 5 else list(guion)
os.makedirs(out, exist_ok=True)

async def una(k):
    f = os.path.join(out, f"voz_{k}.mp3")
    for intento in range(3):
        try:
            await edge_tts.Communicate(guion[k], voz, rate=rate).save(f)
            return f
        except Exception as e:
            print("reintento", k, type(e).__name__); time.sleep(3)
    raise SystemExit(f"falló la sección {k}")

async def main():
    for k in solo:
        f = await una(k)
        d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                           capture_output=True, text=True).stdout.strip()
        print(k, d)

asyncio.run(main())
