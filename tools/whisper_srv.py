"""Servidor de voz del robot: Whisper (faster-whisper) cargado una sola vez, sin internet.
Protocolo por stdin/stdout (una línea JSON por respuesta):
  arranque  -> {"ready": true, "device": "cuda|cpu", "model": "..."}
  "listen"  -> graba del micrófono hasta que dejas de hablar y responde {"text": "...", "conf": 0.0-1.0}
  "listen rapido" -> igual, para la llamada de la isla: corta con el VAD de Silero (1,1 s sin voz, frases de hasta 60 s)
                     y transcribe con Parakeet v3 (sherpa-onnx) si está instalado; si no, Whisper beam 1 y transcribe con beam 1
  "file <ruta>" -> transcribe un archivo de audio (notas de voz de Telegram/WhatsApp: ogg/opus, mp3, m4a...)
  'hablantes {"ruta": "...", "reunion": "id"}' -> {"segmentos": [{"ini", "fin", "hablante": "persona 1", "texto"}]}
                     (reuniones: separa quién habla con sherpa-onnx; "segmentos": null si faltan los modelos)
Entorno (lo pone la app al lanzarlo):
  ROBOT_WHISPER_MODEL   modelo ('auto' por defecto: large-v3-turbo en GPU si hay VRAM libre, si no small en CPU)
  ROBOT_SMART_TURN      ruta del ONNX de Smart Turn v3 (fin de turno por entonación; sin él corta por silencio)
  ROBOT_WHISPER_IDIOMA  idioma de la app (es por defecto): el micrófono lo usa siempre; en las notas de voz se detecta
                        solo y, si la detección es dudosa, se repite en este idioma (los audios cortos confunden es/pt/gl)
  ROBOT_WHISPER_PROMPT  vocabulario (nombre del compañero, proyectos, palabras del usuario): mejora nombres propios
"""
import json, math, os, re, subprocess, sys, time, importlib.util

# ctranslate2 (faster-whisper) necesita cublas64_12 + cuDNN 9 para la GPU; sin ellos caía SIEMPRE a CPU.
# El torch cu12x instalado ya trae esas DLL en torch/lib: se añaden a la búsqueda sin importar torch (más rápido).
try:
    _t = importlib.util.find_spec('torch')
    if _t and _t.origin and os.name == 'nt':
        _lib = os.path.join(os.path.dirname(_t.origin), 'lib')
        if os.path.exists(os.path.join(_lib, 'cublas64_12.dll')):
            os.add_dll_directory(_lib); os.environ['PATH'] = _lib + os.pathsep + os.environ.get('PATH', '')
except Exception:
    pass

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

# 'auto' (por defecto): large-v3-turbo en la GPU si hay ≥ 1,5 GB libres (Ollama/ComfyUI pueden llenarla); si no, small en CPU
MODEL = os.environ.get('ROBOT_WHISPER_MODEL') or 'auto'
VRAM_MIN_MB = 1500
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

def vram_libre_mb():
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'], capture_output=True,
                           text=True, timeout=5, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return int(r.stdout.strip().splitlines()[0])
    except Exception:
        return 0

def load():
    """→ (modelo, device). En 'auto' elige según la VRAM libre en ese momento."""
    global MODEL
    if MODEL == 'auto':
        libre = vram_libre_mb()
        intentos = ([('large-v3-turbo', 'cuda', 'int8_float16')] if libre >= VRAM_MIN_MB else []) + [('small', 'cpu', 'int8')]
        if libre < VRAM_MIN_MB: sys.stderr.write(f'[whisper] GPU con {libre} MB libres: small en CPU\n')
    else:
        intentos = [(MODEL, 'cuda', 'float16'), (MODEL, 'cpu', 'int8')]
    for nombre, dev, ct in intentos:
        try:
            m = WhisperModel(nombre, device=dev, compute_type=ct, cpu_threads=os.cpu_count() or 4)
            # prueba real: algunas GPUs nuevas cargan pero fallan al transcribir
            list(m.transcribe(np.zeros(SR, dtype=np.float32), language=IDIOMA)[0])
            MODEL = nombre
            return m, dev
        except Exception as e:
            sys.stderr.write(f'[whisper] {nombre} en {dev} no disponible: {e}\n')
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

class VadStream:
    """Silero VAD (el que trae faster-whisper) en tiempo real: probabilidad de voz cada 32 ms (512 muestras),
    con el estado de la red entre bloques. Distingue voz de ruido/respiración mejor que el volumen."""
    N, CTX = 512, 64
    def __init__(self):
        from faster_whisper.vad import get_vad_model
        self.ses = get_vad_model().session
        self.reset()
    def reset(self):
        self.h = np.zeros((1, 1, 128), dtype='float32'); self.c = np.zeros((1, 1, 128), dtype='float32')
        self.ctx = np.zeros(self.CTX, dtype='float32')
    def __call__(self, bloque):
        x = np.concatenate([self.ctx, bloque.astype('float32')])[None, :]
        out, self.h, self.c = self.ses.run(None, {'input': x, 'h': self.h, 'c': self.c})
        self.ctx = bloque[-self.CTX:].astype('float32')
        return float(np.asarray(out).reshape(-1)[0])

_vad = None
def vad():
    global _vad
    if _vad is None:
        try: _vad = VadStream()
        except Exception as e:
            sys.stderr.write(f'[whisper] sin VAD de Silero ({e}): se usa el volumen\n'); _vad = False
    return _vad

# Smart Turn v3 (pipecat-ai, BSD-2, 8 MB ONNX, ~45 ms en CPU): mira la ENTONACIÓN de los últimos 8 s y dice si
# terminaste la frase. Modo SOLO ALARGAR (prudente, sin validar aún con voz humana en español): al llegar al silencio
# de siempre (tail_s) pregunta; si dice "a medias" (pausa para pensar) espera hasta TURNO_MAX_S en vez de cortarte.
# Nunca corta ANTES que sin él. (Con voz sintética cortada daba "terminó" 0,97-0,99: no fiarse para cortar antes.)
TURNO_ONNX = os.environ.get('ROBOT_SMART_TURN') or os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'robot-companion', 'stt', 'smart-turn', 'smart-turn-v3.2-cpu.onnx')
TURNO_MAX_S = 2.0
_turno = None
def turno():
    global _turno
    if _turno is None:
        try:
            import onnxruntime as ort
            from faster_whisper.feature_extractor import FeatureExtractor
            if not os.path.exists(TURNO_ONNX): raise FileNotFoundError(TURNO_ONNX)
            so = ort.SessionOptions(); so.inter_op_num_threads = 1; so.intra_op_num_threads = 2
            _turno = (ort.InferenceSession(TURNO_ONNX, sess_options=so, providers=['CPUExecutionProvider']), FeatureExtractor(feature_size=80, chunk_length=8))
            sys.stderr.write('[whisper] Smart Turn cargado\n')
        except Exception as e:
            sys.stderr.write(f'[whisper] sin Smart Turn ({e}): corta por silencio\n'); _turno = False
    return _turno

def fin_de_turno(audio):
    """→ probabilidad (0-1) de que la frase esté terminada. Mismas features que el WhisperFeatureExtractor de
    referencia (verificado: diferencia 0): últimos 8 s, normalizados, con relleno al final."""
    ses, fe = _turno
    a = audio[-8 * SR:].astype(np.float32)
    a = (a - a.mean()) / np.sqrt(a.var() + 1e-7)
    a = np.pad(a, (0, 8 * SR - len(a)))
    x = fe(a, padding=0)[:, :800][None].astype(np.float32)
    return float(ses.run(None, {'input_features': x})[0].reshape(-1)[0])

def record_vad(max_s=60, wait_s=8, tail_s=1.1, pre_s=0.3):
    """Graba con Silero: empieza cuando hay voz (≥64 ms seguidos), guarda 0,3 s de antes para no comerse la
    primera sílaba y corta tras tail_s sin voz (o antes/después si Smart Turn lo decide). Las pausas con ruido de
    fondo ya no la alargan y hablar bajito ya no cuenta como silencio. Si Silero no carga, graba por volumen."""
    v = vad()
    if not v: return record(max_s, wait_s, tail_s)
    v.reset()
    st_ok = turno()
    N = VadStream.N
    previo, chunks, started, voz, silencio, t0 = [], [], False, 0, 0.0, time.time()
    tope = tail_s                                           # silencio que corta; Smart Turn puede alargarlo en esta pausa
    with sd.InputStream(samplerate=SR, channels=1, dtype='float32', blocksize=N) as st:
        while True:
            b, _ = st.read(N); b = b[:, 0].copy()
            p = v(b)
            if not started:
                previo.append(b); previo = previo[-(int(pre_s * SR / N) + 1):]
                voz = voz + 1 if p > 0.5 else 0
                if voz >= 2: started, chunks = True, list(previo)
            else:
                chunks.append(b)
                if p > 0.35: silencio, tope = 0.0, tail_s
                else: silencio += N / SR
                if st_ok and silencio > tail_s and tope == tail_s:  # llegó el corte de siempre: ¿frase a medias?
                    try:
                        if fin_de_turno(np.concatenate(chunks)) < 0.5: tope = TURNO_MAX_S
                    except Exception as e: sys.stderr.write(f'[whisper] Smart Turn falló: {e}\n')
            el = time.time() - t0
            if (not started and el > wait_s) or (started and silencio > tope) or el > max_s: break
    return np.concatenate(chunks) if chunks else None

# Parakeet TDT 0.6B v3 (NVIDIA, multilingüe con español) con sherpa-onnx: ~6× más rápido que Whisper small en CPU
# (4 s de voz: 0,23 s frente a 1,45 s). Solo para la llamada; si no está el modelo o sherpa-onnx, Whisper como siempre.
PARAKEET_DIR = os.environ.get('ROBOT_PARAKEET_DIR') or os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'robot-companion', 'stt', 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8')
_parakeet = None
def parakeet():
    global _parakeet
    if _parakeet is None:
        try:
            import sherpa_onnx
            p = lambda f: os.path.join(PARAKEET_DIR, f)
            if not os.path.exists(p('encoder.int8.onnx')): raise FileNotFoundError(PARAKEET_DIR)
            _parakeet = sherpa_onnx.OfflineRecognizer.from_transducer(encoder=p('encoder.int8.onnx'), decoder=p('decoder.int8.onnx'), joiner=p('joiner.int8.onnx'),
                tokens=p('tokens.txt'), num_threads=max(1, (os.cpu_count() or 4) // 2), model_type='nemo_transducer', decoding_method='greedy_search')
            sys.stderr.write('[whisper] Parakeet cargado para la llamada\n')
        except Exception as e:
            sys.stderr.write(f'[whisper] sin Parakeet ({e}): la llamada usa Whisper\n'); _parakeet = False
    return _parakeet

def transcribir_rapido(audio):
    """→ (texto, conf, motor). Parakeet si está; si no, Whisper con beam 1."""
    r = parakeet()
    if r:
        s = r.create_stream(); s.accept_waveform(SR, audio); r.decode_stream(s)
        t = s.result.text.strip()
        return t, (0.9 if t else 0.0), 'parakeet'
    t, c, _ = transcribir(audio, IDIOMA, 1)
    return t, c, 'whisper'

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

def transcribir(audio, idioma=None, beam=5):
    """→ (texto, confianza, info). Quita segmentos que son alucinaciones típicas o casi seguro silencio."""
    segs, info = model.transcribe(audio, language=idioma, beam_size=beam, vad_filter=True,
                                  initial_prompt=PROMPT, condition_on_previous_text=False)
    segs = [s for s in segs if not ALUCINACIONES.search(s.text) and s.no_speech_prob < 0.8]
    text = ' '.join(s.text.strip() for s in segs).strip()
    conf = math.exp(sum(s.avg_logprob for s in segs) / len(segs)) if segs else 0
    return text, conf, info

# ---------- Quién habla (reuniones): sherpa-onnx, CPU, ~45 MB de modelos ----------
# pyannote segmentation 3.0 (MIT) separa los cambios de voz y 3D-Speaker ERes2Net (Apache-2.0) saca la huella de cada voz.
# En cada trozo de 30 s del audio de "ellos": separa tramos → huella por persona → la compara con las ya oídas en ESA
# reunión (persona 1, persona 2… estables entre trozos) → transcribe cada tramo. Sin los modelos: None (como antes).
DIAR_DIR = os.environ.get('ROBOT_DIAR_DIR') or os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'robot-companion', 'stt', 'diarizacion')
_diar = None
_personas = {}                                                # reunión → [gestor de huellas, cuántas personas]
def diarizador():
    global _diar
    if _diar is None:
        try:
            import sherpa_onnx as so
            seg, emb = os.path.join(DIAR_DIR, 'sherpa-onnx-pyannote-segmentation-3-0', 'model.int8.onnx'), os.path.join(DIAR_DIR, 'voces.onnx')
            for f in (seg, emb):
                if not os.path.exists(f): raise FileNotFoundError(f)
            hilos = max(1, min(4, (os.cpu_count() or 4) // 2))
            ecfg = so.SpeakerEmbeddingExtractorConfig(model=emb, num_threads=hilos)
            cfg = so.OfflineSpeakerDiarizationConfig(
                segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg), num_threads=hilos),
                embedding=ecfg, clustering=so.FastClusteringConfig(num_clusters=-1, threshold=0.6), min_duration_on=0.3, min_duration_off=0.5)
            if not cfg.validate(): raise ValueError('configuración de diarización no válida')
            _diar = (so.OfflineSpeakerDiarization(cfg), so.SpeakerEmbeddingExtractor(ecfg), so)
            sys.stderr.write('[whisper] separación de hablantes cargada\n')
        except Exception as e:
            sys.stderr.write(f'[whisper] sin separación de hablantes ({e})\n'); _diar = False
    return _diar

def huella(ext, audio):
    s = ext.create_stream(); s.accept_waveform(SR, audio); s.input_finished()
    return list(ext.compute(s))

def con_hablantes(ruta, reunion):
    """→ [{ini, fin, hablante, texto}] o None si no hay modelos (el que llama usa la transcripción de siempre)."""
    d = diarizador()
    if not d: return None
    sd_, ext, so = d
    a = leer_audio(ruta)
    if len(a) < SR: return []
    tramos = []                                               # une tramos seguidos de la misma persona (pausas < 1 s)
    for s in sd_.process(a).sort_by_start_time():
        if tramos and tramos[-1][2] == s.speaker and s.start - tramos[-1][1] < 1.0: tramos[-1][1] = s.end
        else: tramos.append([s.start, s.end, s.speaker])
    if reunion not in _personas:
        if len(_personas) > 4: _personas.clear()
        _personas[reunion] = [so.SpeakerEmbeddingManager(ext.dim), 0]
    gestor = _personas[reunion]
    nombres = {}
    for k in {t[2] for t in tramos}:
        voz = np.concatenate([a[int(i * SR):int(f * SR)] for i, f, kk in tramos if kk == k])
        if len(voz) < SR: nombres[k] = None; continue         # menos de 1 s: muy poco para reconocer la voz
        e = huella(ext, voz)
        n = gestor[0].search(e, threshold=0.5)
        if not n:
            gestor[1] += 1; n = f'persona {gestor[1]}'; gestor[0].add(n, e)
        nombres[k] = n
    res = []
    for i, f, k in tramos:
        trozo = a[int(i * SR):int(f * SR)]
        if len(trozo) < SR * 0.4: continue
        texto, _, _ = transcribir(trozo, IDIOMA)
        if texto: res.append({'ini': round(i, 2), 'fin': round(f, 2), 'hablante': nombres.get(k) or 'ellos', 'texto': texto})
    return res

if __name__ == '__main__':
    model, device = load()
    out({'ready': True, 'device': device, 'model': MODEL})
    import threading                                          # VAD y Parakeet en segundo plano: la 1.ª llamada no espera su carga
    threading.Thread(target=lambda: (vad(), turno(), parakeet()), daemon=True).start()
    for line in sys.stdin:
        line = line.strip()
        if line.startswith('hablantes '):                     # reunión: {"ruta", "reunion"} → tramos por persona
            try:
                p = json.loads(line[10:]); t0 = time.time()
                segs = con_hablantes(p['ruta'], str(p.get('reunion') or ''))
                out({'segmentos': segs, 'ms': int((time.time() - t0) * 1000)} if segs is not None else {'segmentos': None, 'error': 'sin modelos de hablantes'})
            except Exception as e:
                out({'segmentos': None, 'error': str(e)[:300]})
            continue
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
        if line not in ('listen', 'listen rapido'): continue
        rapido = line == 'listen rapido'                       # llamada: Silero decide cuándo acabaste (1,1 s sin voz) y transcribe Parakeet
        try:
            audio = record_vad(max_s=60, wait_s=8, tail_s=1.1) if rapido else record_vad(max_s=15, wait_s=6, tail_s=1.0)
            if audio is None or len(audio) < SR * 0.3:
                out({'text': '', 'conf': 0}); continue
            t0 = time.time()
            if rapido: text, conf, motor = transcribir_rapido(audio)
            else: (text, conf, _), motor = transcribir(audio, IDIOMA, 5), 'whisper'
            out({'text': text, 'conf': round(conf, 2), 'motor': motor, 'ms': int((time.time() - t0) * 1000)})
        except Exception as e:
            out({'text': '', 'conf': 0, 'error': str(e)})
