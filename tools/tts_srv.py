"""Voz local de APOLO: OmniVoice (k2-fsa, Apache-2.0) cargado una vez, sin internet ni API keys.
Corre con el Python del venv <datos>/tts/venv (creado por la app o a mano: python -m venv --system-site-packages venv
+ pip install omnivoice num2words), así no toca el torch/transformers globales.

Protocolo por stdin/stdout (una línea JSON por petición / respuesta):
  arranque -> {"ready": true, "device": "cuda", "voz": "<ruta wav de referencia>"}
  {"id": 1, "texto": "...", "salida": "C:/.../x.mp3"} -> {"id": 1, "ok": true, "ms": 820}  (o "error")
La voz es SIEMPRE la misma: se clona de <datos>/tts/voz-apolo.wav (+ voz-apolo.txt con lo que dice).
Si no existe, se crea una vez con diseño de voz (ROBOT_TTS_INSTRUCT) y se guarda; para cambiar la voz de APOLO
basta con poner ahí tu propio wav de 3-10 s (y su texto en el .txt) y reiniciar el servidor.
Entorno: ROBOT_TTS_DIR (carpeta de datos), ROBOT_TTS_PASOS (16 por defecto: rápido), ROBOT_TTS_VELOCIDAD (1.08).
"""
import json, os, subprocess, sys, time

DIR = os.environ.get('ROBOT_TTS_DIR') or os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'robot-companion', 'tts')
PASOS = int(os.environ.get('ROBOT_TTS_PASOS') or 16)
VELOCIDAD = float(os.environ.get('ROBOT_TTS_VELOCIDAD') or 1.08)
INSTRUCT = os.environ.get('ROBOT_TTS_INSTRUCT') or 'male, young adult, moderate pitch'
REF_WAV, REF_TXT = os.path.join(DIR, 'voz-apolo.wav'), os.path.join(DIR, 'voz-apolo.txt')
FRASE_REF = 'Hola, soy Apolo. Estoy listo para ayudarte con tus proyectos, tus tareas y lo que necesites hoy.'
SR = 24000

def out(o):
    sys.stdout.write(json.dumps(o, ensure_ascii=False) + '\n'); sys.stdout.flush()

def log(m):
    sys.stderr.write(f'[tts] {m}\n'); sys.stderr.flush()

def guardar(audio, ruta):
    """wav directo; mp3 (u otro) vía ffmpeg desde un wav temporal (la isla y el ojo ESP32 esperan mp3)."""
    import soundfile as sf
    if ruta.lower().endswith('.wav'):
        sf.write(ruta, audio, SR); return
    tmp = ruta + '.tmp.wav'
    sf.write(tmp, audio, SR)
    try:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-q:a', '4', ruta],
                       check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    finally:
        try: os.remove(tmp)
        except OSError: pass

def main():
    import torch
    from omnivoice import OmniVoice
    if not torch.cuda.is_available():
        raise SystemExit('sin CUDA: la voz local solo corre en GPU (se usa edge-tts)')
    model = OmniVoice.from_pretrained('k2-fsa/OmniVoice', device_map='cuda:0', dtype=torch.float16)
    os.makedirs(DIR, exist_ok=True)
    if not os.path.exists(REF_WAV):                           # primera vez: se diseña la voz y se fija para siempre
        log(f'creando la voz de APOLO ({INSTRUCT})')
        a = model.generate(text=FRASE_REF, language='es', instruct=INSTRUCT, num_step=32)[0]
        import soundfile as sf
        sf.write(REF_WAV, a, SR)
        with open(REF_TXT, 'w', encoding='utf-8') as f: f.write(FRASE_REF)
    ref_txt = open(REF_TXT, encoding='utf-8').read().strip() if os.path.exists(REF_TXT) else None
    voz = model.create_voice_clone_prompt(REF_WAV, ref_txt)
    model.generate(text='Listo.', language='es', voice_clone_prompt=voz, num_step=PASOS)   # calentar kernels
    out({'ready': True, 'device': 'cuda', 'voz': REF_WAV})
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try: p = json.loads(line)
        except Exception: continue
        t0 = time.time()
        try:
            a = model.generate(text=str(p['texto'])[:600], language=p.get('idioma') or 'es', voice_clone_prompt=voz,
                               num_step=PASOS, speed=VELOCIDAD)[0]
            guardar(a, p['salida'])
            out({'id': p.get('id'), 'ok': True, 'ms': int((time.time() - t0) * 1000)})
        except Exception as e:
            out({'id': p.get('id'), 'ok': False, 'error': str(e)[:300]})

if __name__ == '__main__':
    main()
