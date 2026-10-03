# Genera build/icon.ico (16..256) y build/icon.png (512) desde el render del casco (core/ui/m/icono-512.png).
# Quita el fondo cuadrado con una máscara circular suave (conserva el halo verde). Uso: python build/generar-icono.py
import math, os
from PIL import Image

aqui = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(aqui, '..', 'core', 'ui', 'm', 'icono-512.png')).convert('RGBA')
w, h = src.size
cx, cy = w / 2, h / 2 + 4
r_lleno, r_cero = 0.40 * w, 0.49 * w
rgb = src.load()
mascara = Image.new('L', (w, h))
px = mascara.load()
for y in range(h):
    for x in range(w):
        d = math.hypot(x - cx, y - cy)
        a = 1.0 if d <= r_lleno else max(0.0, 1 - (d - r_lleno) / (r_cero - r_lleno))
        if d > r_lleno - 6:                      # fuera del casco: solo queda el halo verde (alfa = brillo)
            g = rgb[x, y][1]
            a = min(a, max(0.0, min(1.0, (g - 10) / 45)))
        px[x, y] = int(255 * a)
src.putalpha(mascara)
src.save(os.path.join(aqui, 'icon.png'))
src.save(os.path.join(aqui, 'icon.ico'), sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print('icon.ico + icon.png')
