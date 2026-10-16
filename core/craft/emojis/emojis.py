# Emojis propios de APOLO (MIT): pegatinas planas con borde oscuro y contorno blanco, dibujadas con Pillow.
# No usan ningún set de terceros (Twemoji, Noto, Segoe…). Uso: python emojis.py [carpeta]  → <nombre>.png 512×512 con transparencia.
import math, os, sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

N = 1024                     # se dibuja al doble y se reduce (bordes suaves)
TINTA = (24, 20, 28, 255)
L = 34                       # grosor de la línea oscura
DIR = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(DIR, '..', 'fuentes', 'Trueno-Black.ttf')


def lienzo():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); return im, ImageDraw.Draw(im)


def cara(d, color=(255, 205, 40, 255)):
    d.ellipse((90, 90, N - 90, N - 90), fill=color, outline=TINTA, width=L)


def poli(d, pts, fill, w=L): d.polygon(pts, fill=fill, outline=TINTA, width=w)


def estrella(d, cx, cy, r, fill, puntas=4, interior=0.38, rot=0):
    pts = []
    for i in range(puntas * 2):
        a = rot + math.pi * i / puntas - math.pi / 2; rr = r if i % 2 == 0 else r * interior
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    poli(d, pts, fill)


def fuego(d):
    poli(d, [(512, 70), (640, 260), (700, 200), (820, 440), (840, 640), (760, 850), (512, 950), (270, 850), (190, 640), (230, 420), (330, 500), (360, 300)], (255, 92, 20, 255))
    poli(d, [(512, 400), (600, 560), (650, 520), (690, 690), (620, 850), (512, 890), (400, 850), (340, 700), (400, 560), (450, 620)], (255, 205, 40, 255), 24)


def risa(d):
    cara(d)
    for x in (360, 664):                                         # ojos cerrados de risa: ^ ^
        d.line([(x - 90, 430), (x, 360), (x + 90, 430)], fill=TINTA, width=L, joint='curve')
    d.chord((260, 470, 764, 860), 0, 180, fill=(120, 30, 40, 255), outline=TINTA, width=L)
    d.chord((340, 700, 684, 860), 200, 340, fill=(255, 110, 120, 255))
    for x, s in ((170, -1), (854, 1)):                           # lágrimas
        poli(d, [(x, 470), (x + s * 70, 600), (x + s * 40, 680), (x - s * 30, 640)], (90, 190, 255, 255), 22)


def camion(d):
    poli(d, [(90, 300), (600, 300), (600, 760), (90, 760)], (235, 240, 245, 255))         # remolque
    poli(d, [(600, 400), (820, 400), (930, 560), (930, 760), (600, 760)], (40, 200, 200, 255))   # cabina teal
    poli(d, [(660, 450), (800, 450), (870, 560), (660, 560)], (170, 235, 255, 255), 22)        # ventana
    d.rectangle((130, 360, 560, 430), fill=(255, 205, 40, 255))
    for x in (230, 470, 800):
        d.ellipse((x - 95, 680, x + 95, 870), fill=TINTA); d.ellipse((x - 45, 730, x + 45, 820), fill=(200, 200, 210, 255))


def saludo(d):
    piel, w = (255, 200, 120, 255), L
    d.rounded_rectangle((120, 560, 430, 680), 60, fill=piel, outline=TINTA, width=w)                    # pulgar (detrás de la palma)
    for x, h in ((320, 230), (420, 150), (520, 140), (620, 200)):                                         # dedos
        d.rounded_rectangle((x, h, x + 100, 640), 50, fill=piel, outline=TINTA, width=w)
    d.rounded_rectangle((300, 470, 740, 900), 130, fill=piel, outline=TINTA, width=w)                   # palma encima
    d.rectangle((300 + w, 470 - 4, 740 - w, 560), fill=piel)                                             # funde dedos y palma
    for i in range(3):                                                                                    # movimiento: 3 rayitas
        y = 250 + i * 110; d.line([(140 + i * 20, y), (230, y - 40)], fill=TINTA, width=26)


def corazon(d):
    d.ellipse((130, 200, 540, 610), fill=(240, 40, 80, 255)); d.ellipse((484, 200, 894, 610), fill=(240, 40, 80, 255))
    d.polygon([(150, 480), (874, 480), (512, 900)], fill=(240, 40, 80, 255))
    m = Image.new('L', (N, N), 0); md = ImageDraw.Draw(m)                                # contorno del corazón
    md.ellipse((130, 200, 540, 610), fill=255); md.ellipse((484, 200, 894, 610), fill=255); md.polygon([(150, 480), (874, 480), (512, 900)], fill=255)
    borde = m.filter(ImageFilter.MaxFilter(L * 2 + 1 | 1))
    return borde


def brillo(d):
    estrella(d, 560, 470, 400, (255, 220, 60, 255)); estrella(d, 230, 230, 150, (255, 255, 255, 255)); estrella(d, 820, 830, 130, (255, 240, 160, 255))


def dinero(d):
    poli(d, [(380, 170), (644, 170), (590, 300), (434, 300)], (200, 150, 70, 255))
    d.ellipse((150, 260, 874, 940), fill=(215, 165, 80, 255), outline=TINTA, width=L)
    d.line([(400, 300), (624, 300)], fill=TINTA, width=L)
    f = ImageFont.truetype(FUENTE, 470); d.text((512, 620), '$', font=f, anchor='mm', fill=(30, 140, 60, 255), stroke_width=14, stroke_fill=TINTA)


def fantasma(d):
    blanco = (248, 248, 255, 255)
    pts = [(200, 900), (200, 450)] + [(512 + 312 * math.cos(a), 450 - 340 * math.sin(a)) for a in [math.pi * i / 20 for i in range(21)]][::-1] + [(824, 900), (720, 800), (616, 900), (512, 800), (408, 900), (304, 800)]
    pts = [(200, 900), (200, 450)] + [(512 - 312 * math.cos(math.pi * i / 20), 450 - 340 * math.sin(math.pi * i / 20)) for i in range(21)] + [(824, 900), (720, 800), (616, 900), (512, 800), (408, 900), (304, 800)]
    poli(d, pts, blanco)
    d.ellipse((330, 360, 450, 520), fill=TINTA); d.ellipse((574, 360, 694, 520), fill=TINTA)
    d.ellipse((440, 560, 584, 720), fill=TINTA)


def sorpresa(d):
    cara(d)
    for x in (370, 654): d.ellipse((x - 55, 330, x + 55, 470), fill=TINTA)
    d.ellipse((410, 560, 614, 820), fill=(120, 30, 40, 255), outline=TINTA, width=L)
    d.arc((270, 220, 470, 330), 200, 340, fill=TINTA, width=24); d.arc((554, 220, 754, 330), 200, 340, fill=TINTA, width=24)


def rayo(d):
    poli(d, [(600, 60), (240, 560), (470, 560), (380, 960), (800, 400), (560, 400), (700, 60)], (255, 220, 30, 255))


def cien(d):
    f = ImageFont.truetype(FUENTE, 470)
    d.text((512, 470), '100', font=f, anchor='mm', fill=(235, 30, 45, 255), stroke_width=16, stroke_fill=TINTA)
    for y in (720, 820): d.rounded_rectangle((150, y, 874, y + 60), 30, fill=(235, 30, 45, 255), outline=TINTA, width=16)


def corona(d):
    poli(d, [(140, 780), (140, 330), (330, 540), (512, 230), (694, 540), (884, 330), (884, 780)], (255, 200, 30, 255))
    d.rectangle((140, 720, 884, 860), fill=(240, 170, 20, 255), outline=TINTA, width=L)
    for x, c in ((300, (230, 40, 70, 255)), (512, (40, 160, 255, 255)), (724, (230, 40, 70, 255))): d.ellipse((x - 45, 745, x + 45, 835), fill=c, outline=TINTA, width=14)


def calavera(d):
    hueso = (245, 245, 240, 255)
    d.ellipse((170, 110, 854, 760), fill=hueso, outline=TINTA, width=L)
    d.rounded_rectangle((330, 640, 694, 900), 60, fill=hueso, outline=TINTA, width=L)
    d.rectangle((345, 600, 679, 700), fill=hueso)
    d.ellipse((280, 360, 470, 560), fill=TINTA); d.ellipse((554, 360, 744, 560), fill=TINTA)
    d.polygon([(512, 580), (470, 660), (554, 660)], fill=TINTA)
    for x in (420, 512, 604): d.line([(x, 760), (x, 880)], fill=TINTA, width=18)


def ojos(d):
    for cx in (330, 694):
        d.ellipse((cx - 190, 200, cx + 190, 830), fill=(255, 255, 255, 255), outline=TINTA, width=L)
        d.ellipse((cx - 40, 420, cx + 140, 640), fill=TINTA)
        d.ellipse((cx + 20, 450, cx + 70, 500), fill=(255, 255, 255, 255))


def pesa(d):
    d.rounded_rectangle((260, 470, 764, 554), 30, fill=(150, 150, 160, 255), outline=TINTA, width=24)
    for x0 in (110, 784):
        d.rounded_rectangle((x0, 260, x0 + 130, 764), 40, fill=(60, 60, 70, 255), outline=TINTA, width=L)
    for x0 in (220, 694):
        d.rounded_rectangle((x0, 330, x0 + 110, 694), 36, fill=(90, 90, 100, 255), outline=TINTA, width=L)


def mexico(d):
    d.rectangle((100, 240, 374, 800), fill=(0, 135, 70, 255)); d.rectangle((374, 240, 650, 800), fill=(255, 255, 255, 255)); d.rectangle((650, 240, 924, 800), fill=(205, 30, 45, 255))
    d.rectangle((100, 240, 924, 800), outline=TINTA, width=L)
    d.ellipse((440, 440, 584, 600), fill=(160, 110, 40, 255), outline=TINTA, width=16)


def like(d):
    piel = (255, 200, 120, 255)
    d.rounded_rectangle((120, 470, 290, 900), 30, fill=(70, 120, 230, 255), outline=TINTA, width=L)       # puño de la manga
    d.rounded_rectangle((300, 430, 840, 900), 90, fill=piel, outline=TINTA, width=L)
    d.rounded_rectangle((420, 120, 580, 520), 80, fill=piel, outline=TINTA, width=L)                       # pulgar
    d.rectangle((440, 420, 560, 480), fill=piel)
    for y in (560, 660, 760): d.line([(560, y), (800, y)], fill=TINTA, width=20)


EMOJIS = {'fuego': fuego, 'risa': risa, 'camion': camion, 'saludo': saludo, 'corazon': corazon, 'brillo': brillo, 'dinero': dinero,
          'fantasma': fantasma, 'sorpresa': sorpresa, 'rayo': rayo, 'cien': cien, 'corona': corona, 'calavera': calavera, 'ojos': ojos,
          'pesa': pesa, 'mexico': mexico, 'like': like}


def pegatina(nombre, dibujar):
    im, d = lienzo()
    extra = dibujar(d)
    if extra is not None:                                         # corazón: el borde oscuro se dibuja como máscara
        tinta = Image.new('RGBA', (N, N), TINTA); base = Image.new('RGBA', (N, N), (0, 0, 0, 0)); base.paste(tinta, mask=extra)
        base.alpha_composite(im); im = base
    # contorno blanco de pegatina alrededor de todo
    a = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).filter(ImageFilter.MaxFilter(41))
    fondo = Image.new('RGBA', (N, N), (0, 0, 0, 0)); fondo.paste(Image.new('RGBA', (N, N), (255, 255, 255, 255)), mask=a)
    sombra = Image.new('RGBA', (N, N), (0, 0, 0, 0)); sombra.paste(Image.new('RGBA', (N, N), (0, 0, 0, 110)), mask=a.filter(ImageFilter.GaussianBlur(18)))
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0)); out.alpha_composite(sombra, (0, 12)); out.alpha_composite(fondo); out.alpha_composite(im)
    return out.resize((512, 512), Image.LANCZOS)


if __name__ == '__main__':
    dst = sys.argv[1] if len(sys.argv) > 1 else DIR
    os.makedirs(dst, exist_ok=True)
    for n, f in EMOJIS.items():
        pegatina(n, f).save(os.path.join(dst, f'{n}.png'))
    print(len(EMOJIS), 'emojis en', dst)
