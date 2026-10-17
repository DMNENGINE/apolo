# Análisis del vídeo para el director de edición: qué pasa en cada zona y cuándo.
#  - movimiento por zona (diferencia media entre muestras, 0–100) a 5 muestras/s
#  - caras por zona (detector YuNet, modelos/yunet.onnx) a 2,5 muestras/s: centro y tamaño de cada una
#  - volumen del audio (dB) cada 0,2 s
# Todo nuestro: OpenCV + numpy + ffmpeg. Uso: python analisis.py <video> <salida.json> '<zonas json {"cara":[x0,y0,x1,y1],…}>'
import json, os, subprocess, sys

import cv2
import numpy as np

video, salida = sys.argv[1], sys.argv[2]
zonas = json.loads(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else {}
MUESTRAS, CADA_CARA, ESC = 5.0, 2, 0.25            # muestras/s · caras cada 2 muestras · movimiento a 1/4 de resolución

cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
if not zonas:
    zonas = {'todo': [0, 0, W, H]}
paso = max(1, round(fps / MUESTRAS))
modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelos', 'yunet.onnx')
dets = {}
for n, (x0, y0, x1, y1) in zonas.items():
    w, h = int((x1 - x0) / 2), int((y1 - y0) / 2)                  # caras a media resolución (de sobra para 1080p)
    dets[n] = (cv2.FaceDetectorYN.create(modelo, '', (w, h), 0.7, 0.3, 20), w, h)

mov = {n: [] for n in zonas}
caras = {n: [] for n in zonas}
prev = None
i = muestra = 0
while True:
    ok = cap.grab()
    if not ok:
        break
    if i % paso:
        i += 1
        continue
    ok, f = cap.retrieve()
    if not ok:
        break
    t = round(i / fps, 2)
    peq = cv2.cvtColor(cv2.resize(f, (int(W * ESC), int(H * ESC)), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.int16)
    for n, (x0, y0, x1, y1) in zonas.items():
        a = (slice(int(y0 * ESC), int(y1 * ESC)), slice(int(x0 * ESC), int(x1 * ESC)))
        mov[n].append(0 if prev is None else round(float(np.abs(peq[a] - prev[a]).mean()) * 100 / 64, 1))
        if muestra % CADA_CARA == 0:
            det, w, h = dets[n]
            trozo = cv2.resize(f[int(y0):int(y1), int(x0):int(x1)], (w, h), interpolation=cv2.INTER_AREA)
            _, cs = det.detect(trozo)
            lista = []
            for c in (cs if cs is not None else []):
                lista.append([round(x0 + (c[0] + c[2] / 2) * 2), round(y0 + (c[1] + c[3] / 2) * 2), round(c[2] * 2), round(float(c[-1]), 2)])
            caras[n].append([t, sorted(lista, key=lambda c: -c[2])[:4]])
    prev = peq
    i += 1
    muestra += 1

# volumen: pcm mono 8 kHz → dB RMS cada 0,2 s
audio = []
try:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
    s = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    b = 1600
    for k in range(0, len(s) - b + 1, b):
        audio.append(round(float(20 * np.log10(np.sqrt(np.mean(s[k:k + b] ** 2)) + 1e-6)), 1))
except Exception:
    pass

json.dump({'ancho': W, 'alto': H, 'duracion': round(total / fps, 2), 'pasoMov': round(paso / fps, 3), 'pasoAudio': 0.2,
           'zonas': zonas, 'movimiento': mov, 'caras': caras, 'audio': audio}, open(salida, 'w'))
print('ok')
