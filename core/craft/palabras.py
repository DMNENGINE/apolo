# Transcribe un vídeo/audio palabra por palabra con faster-whisper → JSON [{w, s, e, p}].
# El audio se saca con ffmpeg a PCM 16 kHz (faster-whisper 1.2 + PyAV 19 rompen decode_audio).
# Uso: python palabras.py <entrada> <salida.json> [modelo=large-v3] [idioma=es] [contexto]
#   GPU: se prueba sola (APOLO_WHISPER_GPU=0 la apaga). Las DLL de CUDA (cublas/cudnn) salen de PyTorch si está instalado.
#   Voz aislada: si hay Demucs, se separa la voz del motor/música/juego antes de Whisper (APOLO_DEMUCS=0 lo apaga).
#   Con el audio del stream mezclado, el VAD tiraba tramos enteros de habla (150 s de clip → 99 palabras);
#   con la voz aislada sale casi el doble de texto y con menos palabras dudosas.
import json, os, re, subprocess, sys

import numpy as np

entrada, salida = sys.argv[1], sys.argv[2]
modelo = sys.argv[3] if len(sys.argv) > 3 else "large-v3"
idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "auto" else None
contexto = sys.argv[5] if len(sys.argv) > 5 else None

torch = None
try:
    import torch
    lib = os.path.join(os.path.dirname(torch.__file__), "lib")
    if os.path.isdir(lib):
        os.add_dll_directory(lib)
        os.environ["PATH"] = lib + os.pathsep + os.environ.get("PATH", "")
except Exception:
    torch = None
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions, get_speech_timestamps

gpu = os.environ.get("APOLO_WHISPER_GPU") != "0" and torch is not None and torch.cuda.is_available()


def leer(sr, canales):
    b = subprocess.run(["ffmpeg", "-v", "error", "-i", entrada, "-ac", str(canales), "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True, check=True).stdout
    return np.frombuffer(b, dtype=np.float32).reshape(-1, canales).T.copy()


def aislar_voz():
    """Pista de voz a 16 kHz mono con Demucs htdemucs, o None si no se puede."""
    if os.environ.get("APOLO_DEMUCS") == "0" or torch is None:
        return None
    try:
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        sep = get_model("htdemucs").eval()
        sr, dev = sep.samplerate, ("cuda" if gpu else "cpu")
        sep.to(dev)
        mezcla = torch.from_numpy(leer(sr, 2))
        ref = mezcla.mean(0)
        media, desv = ref.mean(), ref.std() + 1e-8
        with torch.no_grad():
            fuentes = apply_model(sep, ((mezcla - media) / desv)[None].to(dev), split=True, overlap=0.25, progress=False)[0]
        voz = (fuentes[sep.sources.index("vocals")].cpu() * desv + media).mean(0).numpy().astype(np.float32)
        del sep, fuentes
        if gpu:
            torch.cuda.empty_cache()
        b = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
                            "-ar", "16000", "-f", "f32le", "-"], input=voz.tobytes(), capture_output=True, check=True).stdout
        return np.frombuffer(b, dtype=np.float32)
    except Exception as e:
        print(f"demucs no disponible ({e}); uso el audio original", file=sys.stderr)
        return None


audio = aislar_voz()
voz_aislada = audio is not None
if audio is None:
    audio = leer(16000, 1)[0]

SR = 16000
# frases que Whisper se inventa en tramos con poca voz (subtítulos de YouTube con los que se entrenó)
INVENTADAS = re.compile(r"^[¡!¿?.,\s]*(gracias( por ver(lo)?| a todos)?|suscr[ií]bete.*|subt[ií]tulos.*amara.*|m[uú]sica)[.!?\s]*$", re.I)


def tramos(a, maximo=25, hueco=1.0):
    """Tramos con voz (VAD Silero), juntando los cercanos hasta `maximo` s."""
    ts = get_speech_timestamps(a, VadOptions(threshold=0.25, min_silence_duration_ms=500, speech_pad_ms=300, max_speech_duration_s=20))
    out = []
    for t in ts:
        if out and t["start"] - out[-1][1] < hueco * SR and t["end"] - out[-1][0] < maximo * SR:
            out[-1][1] = t["end"]
        else:
            out.append([t["start"], t["end"]])
    return out


def transcribir(m):
    # Cada tramo de voz por separado. Con el audio entero (ventanas de 30 s encadenadas) Whisper se saltaba frases
    # al final de una ventana y perdía la puntuación; el modo por lotes de faster-whisper descartaba tramos enteros.
    # El final del tramo anterior va de pista para no perder el hilo.
    palabras, previo, info = [], "", None
    for s, e in tramos(audio):
        pista = " ".join(x for x in (contexto, previo[-200:]) if x) or None
        segs, info = m.transcribe(audio[s:e], language=idioma, word_timestamps=True, beam_size=5, condition_on_previous_text=False,
                                  vad_filter=False, initial_prompt=pista)
        for sg in segs:
            if INVENTADAS.match(sg.text) or sg.no_speech_prob > 0.8:
                continue
            palabras += [{"w": w.word.strip(), "s": round(w.start + s / SR, 3), "e": round(w.end + s / SR, 3), "p": round(w.probability, 2)}
                         for w in sg.words]
            previo += " " + sg.text.strip()
    return palabras, (info.language if info else idioma)


intentos = (("cuda", "float16"), ("cpu", "int8")) if gpu else (("cpu", "int8"),)
for dispositivo, tipo in intentos:
    try:
        palabras, lengua = transcribir(WhisperModel(modelo, device=dispositivo, compute_type=tipo))
        break
    except Exception as e:  # sin librerías CUDA (cublas) → CPU
        if dispositivo == "cpu":
            raise
        print(f"cuda no disponible ({e}); uso cpu", file=sys.stderr)

json.dump({"idioma": lengua, "duracion": round(len(audio) / 16000, 3), "vozAislada": voz_aislada, "dispositivo": dispositivo,
           "palabras": palabras}, open(salida, "w", encoding="utf-8"), ensure_ascii=False)
print(len(palabras))
