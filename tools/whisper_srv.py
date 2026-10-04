"""Servidor de voz del robot: Whisper (faster-whisper) cargado una sola vez, sin internet.
Protocolo por stdin/stdout (una línea JSON por respuesta):
  arranque  -> {"ready": true, "device": "cuda|cpu", "model": "..."}
  "listen"  -> graba del micrófono hasta que dejas de hablar y responde {"text": "...", "conf": 0.0-1.0}
  "file <ruta>" -> transcribe un archivo de audio (notas de voz de Telegram/WhatsApp: ogg/opus, mp3, m4a...)
Entorno (lo pone la app al lanzarlo):
  ROBOT_WHISPER_MODEL   modelo (small por defecto)
  ROBOT_WHISPER_IDIOMA  idioma de la app (es por defecto): el micrófono lo usa siempre; en las notas de voz se detecta
                        solo y, si la detección es dudosa, se repite en este idioma (los audios cortos confunden es/pt/gl)
  ROBOT_WHISPER_PROMPT  vocabulario (nombre del compañero, proyectos, palabras del usuario): mejora nombres propios
"""
import json, math, os, re, sys, time
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

MODEL = os.environ.get('ROBOT_WHISPER_MODEL', 'small')
IDIOMA = (os.environ.get('ROBOT_WHISPER_IDIOMA') or 'es')[:2].lower()
PROMPT = os.environ.get('ROBOT_WHISPER_PROMPT') or (
    'APOLO, Claude, ChatGPT, Gemma, Gemini, Telegram, WhatsApp, Discord, Stream Deck, Mission Control, Modo Gamer, '
    'panel, sesión, proyecto, terminal, memoria, tarea, resumen, consejo.')
SR = 16000
BLOCK = int(SR * 0.03)                # 30 ms
# frases que Whisper se inventa en silencios o ruido (vienen de subtítulos de su entrenamiento)
ALUCINACIONES = re.compile(r'(amara\.org|subt[ií]tulos (realizados|hechos|por)|gracias por ver|suscr[ií]bete|thanks for watching|'
                           r'thank you for watching|please subscribe|www\.)', re.I)

def out(o):
    sys.stdout.write(json.dumps(o, ensure_ascii=False) + '\n'); sys.stdout.flush()

def load():
    for dev, ct in (('cuda', 'float16'), ('cpu', 'int8')):
        try:
            m = WhisperModel(MODEL, device=dev, compute_type=ct, cpu_threads=os.cpu_count() or 4)
            # prueba real: algunas GPUs nuevas cargan pero fallan al transcribir
            list(m.transcribe(np.zeros(SR, dtype=np.float32), language=IDIOMA)[0])
            return m, dev
        except Exception as e:
            sys.stderr.write(f'[whisper] {dev} no disponible: {e}\n')
    raise SystemExit('sin backend')

def record(max_s=15, wait_s=6, tail_s=1.0):
    """Graba: espera a que empieces a hablar (hasta wait_s) y corta tras tail_s de silencio."""
    chunks, started, silent, t0 = [], False, 0.0, time.time()
    with sd.InputStream(samplerate=SR, channels=1, dtype='float32', blocksize=BLOCK) as st:
        noise = []
        for _ in range(10):                                   # 0.3 s para medir el ruido de fondo
            b, _ = st.read(BLOCK); noise.append(float(np.sqrt(np.mean(b ** 2))))
        thr = max(0.012, float(np.median(noise)) * 3.2)
        while True:
            b, _ = st.read(BLOCK); b = b[:, 0]
            rms = float(np.sqrt(np.mean(b ** 2)))
            if rms > thr:
                started, silent = True, 0.0
            elif started:
                silent += 0.03
            if started: chunks.append(b.copy())
            el = time.time() - t0
            if (not started and el > wait_s) or (started and silent > tail_s) or el > max_s: break
    return np.concatenate(chunks) if chunks else None

def leer_audio(ruta):
    """Decodifica cualquier audio (ogg/opus, mp3, m4a...) a 16 kHz mono float32 con PyAV.
    (faster-whisper 1.2 llama a av.open(metadata_errors=...), que PyAV 19 ya no acepta.)"""
    import av
    trozos = []
    with av.open(ruta) as c:
        rs = av.AudioResampler(format='s16', layout='mono', rate=SR)
        for f in c.decode(audio=0):
            for r in rs.resample(f): trozos.append(r.to_ndarray())
        for r in rs.resample(None): trozos.append(r.to_ndarray())
    if not trozos: return np.zeros(0, dtype=np.float32)
    return (np.concatenate(trozos, axis=1).flatten().astype(np.float32) / 32768.0)

def transcribir(audio, idioma=None):
    """→ (texto, confianza, info). Quita segmentos que son alucinaciones típicas o casi seguro silencio."""
    segs, info = model.transcribe(audio, language=idioma, beam_size=5, vad_filter=True,
                                  initial_prompt=PROMPT, condition_on_previous_text=False)
    segs = [s for s in segs if not ALUCINACIONES.search(s.text) and s.no_speech_prob < 0.8]
    text = ' '.join(s.text.strip() for s in segs).strip()
    conf = math.exp(sum(s.avg_logprob for s in segs) / len(segs)) if segs else 0
    return text, conf, info

if __name__ == '__main__':
    model, device = load()
    out({'ready': True, 'device': device, 'model': MODEL})
    for line in sys.stdin:
        line = line.strip()
        if line.startswith('file '):                          # nota de voz: idioma detectado (puede ser otro)
            try:
                a = leer_audio(line[5:])
                text, conf, info = transcribir(a)
                idioma = info.language
                if idioma != IDIOMA and info.language_probability < 0.8:   # detección dudosa → en el idioma de la app
                    text, conf, _ = transcribir(a, IDIOMA); idioma = IDIOMA
                out({'text': text, 'conf': round(conf, 2), 'idioma': idioma})
            except Exception as e:
                out({'text': '', 'conf': 0, 'error': str(e)})
            continue
        if line != 'listen': continue
        try:
            audio = record()
            if audio is None or len(audio) < SR * 0.3:
                out({'text': '', 'conf': 0}); continue
            text, conf, _ = transcribir(audio, IDIOMA)
            out({'text': text, 'conf': round(conf, 2)})
        except Exception as e:
            out({'text': '', 'conf': 0, 'error': str(e)})
