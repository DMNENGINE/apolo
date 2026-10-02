"""Servidor de voz del robot: Whisper (faster-whisper) cargado una sola vez, sin internet.
Protocolo por stdin/stdout (una línea JSON por respuesta):
  arranque  -> {"ready": true, "device": "cuda|cpu", "model": "..."}
  "listen"  -> graba del micrófono hasta que dejas de hablar y responde {"text": "...", "conf": 0.0-1.0}
  "file <ruta>" -> transcribe un archivo de audio (notas de voz de Telegram/WhatsApp: ogg/opus, mp3, m4a...)
"""
import json, math, os, sys, time
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

MODEL = os.environ.get('ROBOT_WHISPER_MODEL', 'small')
SR = 16000
BLOCK = int(SR * 0.03)                # 30 ms

def out(o):
    sys.stdout.write(json.dumps(o, ensure_ascii=False) + '\n'); sys.stdout.flush()

def load():
    for dev, ct in (('cuda', 'float16'), ('cpu', 'int8')):
        try:
            m = WhisperModel(MODEL, device=dev, compute_type=ct)
            # prueba real: algunas GPUs nuevas cargan pero fallan al transcribir
            list(m.transcribe(np.zeros(SR, dtype=np.float32), language='es')[0])
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

model, device = load()
out({'ready': True, 'device': device, 'model': MODEL})
for line in sys.stdin:
    line = line.strip()
    if line.startswith('file '):                              # nota de voz: idioma detectado solo (no solo español)
        try:
            segs, info = model.transcribe(leer_audio(line[5:]), beam_size=5, vad_filter=True)
            segs = list(segs)
            text = ' '.join(s.text.strip() for s in segs).strip()
            conf = math.exp(sum(s.avg_logprob for s in segs) / len(segs)) if segs else 0
            out({'text': text, 'conf': round(conf, 2), 'idioma': info.language})
        except Exception as e:
            out({'text': '', 'conf': 0, 'error': str(e)})
        continue
    if line != 'listen': continue
    try:
        audio = record()
        if audio is None or len(audio) < SR * 0.3:
            out({'text': '', 'conf': 0}); continue
        segs, info = model.transcribe(audio, language='es', beam_size=5, vad_filter=True,
                                      initial_prompt='Claude, sesión, proyecto, RobotCompanion, Python, script, terminal.')
        segs = list(segs)
        text = ' '.join(s.text.strip() for s in segs).strip()
        conf = math.exp(sum(s.avg_logprob for s in segs) / len(segs)) if segs else 0
        out({'text': text, 'conf': round(conf, 2)})
    except Exception as e:
        out({'text': '', 'conf': 0, 'error': str(e)})
