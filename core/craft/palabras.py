# Transcribe un vídeo/audio palabra por palabra con faster-whisper → JSON [{w, s, e, p}].
# El audio se saca con ffmpeg a PCM 16 kHz (faster-whisper 1.2 + PyAV 19 rompen decode_audio).
# Uso: python palabras.py <entrada> <salida.json> [modelo=large-v3] [idioma=es] [contexto] (APOLO_WHISPER_GPU=1 prueba la GPU primero)
import json, os, subprocess, sys

import numpy as np
from faster_whisper import WhisperModel

entrada, salida = sys.argv[1], sys.argv[2]
modelo = sys.argv[3] if len(sys.argv) > 3 else "large-v3"
idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "auto" else None
contexto = sys.argv[5] if len(sys.argv) > 5 else None

pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", entrada, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768

m = None
intentos = (("cuda", "float16"), ("cpu", "int8")) if os.environ.get("APOLO_WHISPER_GPU") == "1" else (("cpu", "int8"),)
for dispositivo, tipo in intentos:
    try:
        m = WhisperModel(modelo, device=dispositivo, compute_type=tipo)
        segs, info = m.transcribe(audio, language=idioma, word_timestamps=True, vad_filter=True, beam_size=5,
                                  vad_parameters=dict(min_silence_duration_ms=400), initial_prompt=contexto)
        palabras = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 2)}
                    for s in segs for w in s.words]
        break
    except Exception as e:  # sin librerías CUDA (cublas) → CPU
        if dispositivo == "cpu":
            raise
        print(f"cuda no disponible ({e}); uso cpu", file=sys.stderr)

json.dump({"idioma": info.language, "duracion": round(len(audio) / 16000, 3), "palabras": palabras},
          open(salida, "w", encoding="utf-8"), ensure_ascii=False)
print(len(palabras))
