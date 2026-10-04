# Iconos de la lista de acciones del Stream Deck (mismo estilo que allow/deny: cuadro redondeado + trazo).
# Las teclas en sí se dibujan en vivo en plugin.js (SVG); esto es solo para la lista y la imagen por defecto.
# Uso: python streamdeck/generar-iconos.py
import math, os
from PIL import Image, ImageDraw

DIR = os.path.join(os.path.dirname(__file__), 'com.robotcompanion.sdPlugin', 'imgs')
S = 576                      # se dibuja a 576 px y se reduce (antialias)

def lienzo():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)

def marco(d, c):
    d.rounded_rectangle([40, 40, S - 40, S - 40], radius=90, outline=c, width=36)

def L(d, pts, c, w=34):
    d.line(pts, fill=c, width=w, joint='curve')
    for p in (pts[0], pts[-1]): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=c)

def panico(d, c):
    n = 8; r = 150; cx = cy = S / 2
    pts = [(cx + r * math.cos(math.pi / 8 + i * 2 * math.pi / n), cy + r * math.sin(math.pi / 8 + i * 2 * math.pi / n)) for i in range(n)]
    d.polygon(pts, outline=c, width=34)
    d.rectangle([cx - 70, cy - 22, cx + 70, cy + 22], fill=c)

def micro(d, c):
    d.rounded_rectangle([228, 140, 348, 330], radius=60, outline=c, width=34)
    d.arc([168, 200, 408, 400], 0, 180, fill=c, width=34)
    L(d, [(288, 400), (288, 450)], c)

def panel(d, c):
    d.rounded_rectangle([150, 170, 426, 400], radius=26, outline=c, width=30)
    L(d, [(150, 230), (426, 230)], c, 26)
    for x, h in ((205, 70), (265, 110), (325, 50), (380, 90)): L(d, [(x, 370), (x, 370 - h)], c, 26)

def mensaje(d, c):
    d.rounded_rectangle([140, 160, 436, 360], radius=50, outline=c, width=32)
    d.polygon([(200, 350), (200, 440), (290, 355)], fill=c)
    for x in (220, 288, 356): d.ellipse([x - 20, 240, x + 20, 280], fill=c)

def uso(d, c):
    d.arc([150, 170, 426, 446], 180, 360, fill=c, width=34)
    L(d, [(288, 308), (370, 230)], c)
    d.ellipse([268, 288, 308, 328], fill=c)

def isla(d, c):
    d.rounded_rectangle([130, 200, 280, 330], radius=18, outline=c, width=26)
    d.rounded_rectangle([300, 200, 450, 330], radius=18, outline=c, width=26)
    L(d, [(190, 400), (390, 400)], c, 30)
    d.polygon([(390, 365), (440, 400), (390, 435)], fill=c)

def terminal(d, c):
    d.rounded_rectangle([140, 170, 436, 410], radius=26, outline=c, width=30)
    L(d, [(200, 250), (260, 295), (200, 340)], c, 30)
    L(d, [(290, 345), (370, 345)], c, 30)

def gamer(d, c):
    d.rounded_rectangle([120, 210, 456, 380], radius=85, outline=c, width=32)
    L(d, [(200, 295), (260, 295)], c, 26); L(d, [(230, 265), (230, 325)], c, 26)
    for x, y in ((360, 270), (395, 315)): d.ellipse([x - 20, y - 20, x + 20, y + 20], fill=c)

ACCIONES = {
    'panico': ('#ff4d4d', panico), 'micro': ('#35c8f0', micro), 'panel': ('#3ddc84', panel), 'mensaje': ('#b58cff', mensaje),
    'uso': ('#ffb020', uso), 'isla': ('#35c8f0', isla), 'terminal': ('#3ddc84', terminal), 'gamer': ('#ff6ad5', gamer),
}

for nombre, (color, dibujo) in ACCIONES.items():
    im, d = lienzo()
    marco(d, color); dibujo(d, color)
    for sufijo, lado in (('', 72), ('@2x', 144)):
        im.resize((lado, lado), Image.LANCZOS).save(os.path.join(DIR, f'{nombre}{sufijo}.png'))
    for sufijo, lado in (('-list', 28), ('-list@2x', 56)):
        im.resize((lado, lado), Image.LANCZOS).save(os.path.join(DIR, f'{nombre}{sufijo}.png'))
print('iconos:', ', '.join(ACCIONES))
