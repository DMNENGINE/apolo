"""Miniatura de YouTube con letras doradas estilo Zelda + logo del proyecto.

Uso: python thumb.py config.json
config.json:
 {"fondo": "C:/.../imagen.png", "logo": "C:/.../logo.png", "salida": "C:/.../Miniatura",   # sin extensión
  "arriba": "EMULADOR DE SWITCH 2 EN PC",                    # línea dorada arriba a la izquierda
  "derecha_arriba": {"texto": "DLSS 5.0", "verde": true},    # opcional; verde = degradado verde NVIDIA
  "derecha_abajo": "120 FPS",                                # texto grande dorado abajo a la derecha
  "logo_centro": [1560, 560], "logo_ancho": 640}
Saca <salida>_1920.png y <salida>.jpg (1280x720). MIRA el resultado: si algo se sale del borde, baja el tamaño.
"""
import json, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

C = json.load(open(sys.argv[1], encoding="utf-8"))
W, H = 1920, 1080
SERIF = r"C:\Windows\Fonts\cambriab.ttf"
EMPTY = lambda: Image.new("RGBA", (W, H), (0, 0, 0, 0))

bg = Image.open(C["fondo"]).convert("RGB").resize((W, H), Image.LANCZOS)
shade = Image.new("L", (W, H), 0); d = ImageDraw.Draw(shade)
for y in range(H):
    a = 0
    if y > H * 0.60: a = int(165 * ((y - H * 0.60) / (H * 0.40)) ** 1.4)
    if y < H * 0.25: a = max(a, int(150 * (1 - y / (H * 0.25)) ** 1.3))
    d.line([(0, y), (W, y)], fill=a)
col = Image.new("L", (W, H), 0); cd = ImageDraw.Draw(col)
for x in range(int(W * 0.60), W):
    cd.line([(x, 0), (x, H)], fill=int(80 * ((x - W * 0.60) / (W * 0.40)) ** 1.2))
shade = ImageChops.lighter(shade, col)
canvas = Image.composite(Image.new("RGB", (W, H), (8, 6, 4)), bg, shade).convert("RGBA")

GOLD = [(0.0, (255, 250, 210)), (0.45, (250, 205, 90)), (0.55, (214, 150, 40)), (1.0, (120, 62, 12))]
GREEN = [(0.0, (235, 255, 190)), (0.45, (160, 225, 60)), (0.55, (118, 185, 0)), (1.0, (40, 85, 0))]

def gold_text(img, xy, txt, size, anchor="la", tracking=0, stroke=9, glow=(255, 190, 60, 150), grad=GOLD):
    font = ImageFont.truetype(SERIF, size)
    widths = [font.getlength(c) for c in txt]
    total = sum(widths) + tracking * (len(txt) - 1)
    asc, desc = font.getmetrics()
    x0, y0 = xy
    if anchor[0] == "r": x0 -= total
    elif anchor[0] == "m": x0 -= total / 2
    if anchor[1] == "s": y0 -= asc
    mask, strk = Image.new("L", (W, H), 0), Image.new("L", (W, H), 0)
    md, sd = ImageDraw.Draw(mask), ImageDraw.Draw(strk)
    x = x0
    for c, w in zip(txt, widths):
        md.text((x, y0), c, font=font, fill=255)
        sd.text((x, y0), c, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
        x += w + tracking
    top, bot = int(y0 + asc * 0.15), int(y0 + asc + desc * 0.3)
    gimg = EMPTY(); gd = ImageDraw.Draw(gimg)
    for yy in range(max(top - 5, 0), min(bot + 5, H)):
        t = min(max((yy - top) / max(bot - top, 1), 0), 1)
        for i in range(len(grad) - 1):
            if grad[i][0] <= t <= grad[i + 1][0]:
                u = (t - grad[i][0]) / (grad[i + 1][0] - grad[i][0]); c0, c1 = grad[i][1], grad[i + 1][1]
                colr = tuple(int(c0[j] + (c1[j] - c0[j]) * u) for j in range(3)); break
        gd.line([(0, yy), (W, yy)], fill=colr + (255,))
    if glow: img.alpha_composite(Image.composite(Image.new("RGBA", (W, H), glow), EMPTY(), strk.filter(ImageFilter.GaussianBlur(26))))
    img.alpha_composite(Image.composite(Image.new("RGBA", (W, H), (0, 0, 0, 210)), EMPTY(), ImageChops.offset(strk, 8, 10).filter(ImageFilter.GaussianBlur(7))))
    img.alpha_composite(Image.composite(Image.new("RGBA", (W, H), (38, 18, 4, 255)), EMPTY(), strk))
    img.alpha_composite(Image.composite(Image.new("RGBA", (W, H), (150, 95, 25, 255)), EMPTY(), mask.filter(ImageFilter.MaxFilter(5))))
    img.alpha_composite(Image.composite(gimg, EMPTY(), mask))
    hl = ImageChops.subtract(mask, ImageChops.offset(mask, 0, 4)).filter(ImageFilter.GaussianBlur(1))
    img.alpha_composite(Image.composite(Image.new("RGBA", (W, H), (255, 255, 235, 210)), EMPTY(), hl))

if C.get("logo"):
    lg = Image.open(C["logo"]).convert("RGBA")
    a = lg.split()[3].point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    lg.putalpha(a); lg = lg.crop(a.getbbox())
    lw = C.get("logo_ancho", 640); lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
    cx, cy = C.get("logo_centro", [1560, 560]); lx, ly = cx - lw // 2, cy - lg.height // 2
    glow = EMPTY(); glow.paste((255, 40, 120, 170), (lx, ly), lg.split()[3])
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(28))); canvas.alpha_composite(lg, (lx, ly))

cx = C.get("logo_centro", [1560, 560])[0]
if C.get("arriba"): gold_text(canvas, (70, 40), C["arriba"], C.get("arriba_tam", 86), tracking=4, stroke=8)
da = C.get("derecha_arriba")
if da:
    verde = da.get("verde")
    gold_text(canvas, (cx, 330), da["texto"], 150, anchor="ms", tracking=6, stroke=10,
              glow=(120, 200, 40, 140) if verde else (255, 190, 60, 150), grad=GREEN if verde else GOLD)
if C.get("derecha_abajo"): gold_text(canvas, (1885, 1045), C["derecha_abajo"], 185, anchor="rs", tracking=6, stroke=12)

out = canvas.convert("RGB")
out.save(C["salida"] + "_1920.png", optimize=True)
out.resize((1280, 720), Image.LANCZOS).save(C["salida"] + ".jpg", quality=92, optimize=True)
print("ok", C["salida"] + ".jpg")
