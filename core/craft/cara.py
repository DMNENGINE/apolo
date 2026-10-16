# Dónde está la cara dentro de una zona del vídeo durante un tramo → {"x", "y", "muestras"} (px del vídeo) o null.
# Detector YuNet de OpenCV (modelos/yunet.onnx, licencia MIT en modelos/yunet-LICENSE.txt): se miran 7 fotogramas del tramo,
# en cada uno la cara más segura, y se devuelve la mediana (si te mueves, el encuadre va al sitio donde más estás).
# Uso: python cara.py <video> <desde> <hasta> <x0> <y0> <x1> <y1>
import json, os, subprocess, sys

import cv2
import numpy as np

video, desde, hasta = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
x0, y0, x1, y1 = (int(float(v)) for v in sys.argv[4:8])
w, h = x1 - x0, y1 - y0
modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelos', 'yunet.onnx')
det = cv2.FaceDetectorYN.create(modelo, '', (w, h), 0.6, 0.3, 50)
xs, ys = [], []
for i in range(7):
    t = desde + (hasta - desde) * (i + 0.5) / 7
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', video, '-frames:v', '1', '-vf', f'crop={w}:{h}:{x0}:{y0}',
                          '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True).stdout
    if len(raw) < w * h * 3:
        continue
    _, caras = det.detect(np.frombuffer(raw, np.uint8).reshape(h, w, 3))
    if caras is None or not len(caras):
        continue
    c = max(caras, key=lambda f: f[-1])                # la más segura
    xs.append(x0 + c[0] + c[2] / 2); ys.append(y0 + c[1] + c[3] / 2)
print(json.dumps({'x': round(float(np.median(xs))), 'y': round(float(np.median(ys))), 'muestras': len(xs)} if xs else None))
