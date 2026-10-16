# Iconos de redes para la marca de los clips (MIT): Discord, YouTube, Facebook, Instagram, TikTok y Kick dibujados con
# Pillow a partir de formas simples (no se copian archivos de logos). Los colores son los de cada red para que se reconozcan.
# Uso: python iconos.py [carpeta]  → <red>.png 512×512 con transparencia
import math, os, sys

from PIL import Image, ImageDraw, ImageFilter

N = 1024                     # se dibuja al doble y se reduce (bordes suaves)
BLANCO = (255, 255, 255, 255)


def lienzo():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); return im, ImageDraw.Draw(im)


def caja(d, color, r=230, m=40):
    d.rounded_rectangle((m, m, N - m, N - m), r, fill=color)


def degradado(colores, angulo=45):
    """lienzo N×N con un degradado lineal entre varios colores (para Instagram)"""
    g = Image.new('RGBA', (N, N))
    px = g.load()
    a = math.radians(angulo); dx, dy = math.cos(a), -math.sin(a)
    for y in range(N):
        for x in range(N):
            t = ((x - N / 2) * dx + (y - N / 2) * dy) / (N * 0.72) + 0.5
            t = min(1, max(0, t)) * (len(colores) - 1)
            i = min(int(t), len(colores) - 2); f = t - i
            c0, c1 = colores[i], colores[i + 1]
            px[x, y] = tuple(int(c0[k] + (c1[k] - c0[k]) * f) for k in range(3)) + (255,)
    return g


def youtube():
    im, d = lienzo()
    d.rounded_rectangle((60, 200, N - 60, N - 200), 200, fill=(255, 0, 51, 255))
    d.polygon([(420, 345), (420, 679), (700, 512)], fill=BLANCO)
    return im


def discord():
    im, d = lienzo()
    caja(d, (88, 101, 242, 255))
    # cara del mando: cuerpo redondeado con dos "orejas" arriba y la barbilla curva
    d.rounded_rectangle((215, 330, 809, 760), 190, fill=BLANCO)
    d.polygon([(250, 470), (330, 300), (450, 285), (470, 350)], fill=BLANCO)
    d.polygon([(774, 470), (694, 300), (574, 285), (554, 350)], fill=BLANCO)
    d.ellipse((215, 560, 400, 790), fill=BLANCO); d.ellipse((624, 560, 809, 790), fill=BLANCO)
    d.ellipse((370, 735, 654, 880), fill=(88, 101, 242, 255))      # la curva de abajo entre las dos "patas"
    for cx in (395, 629):                                        # ojos
        d.ellipse((cx - 62, 470, cx + 62, 610), fill=(88, 101, 242, 255))
    return im


def facebook():
    im, d = lienzo()
    azul = (8, 102, 255, 255)
    d.ellipse((40, 40, N - 40, N - 40), fill=azul)
    # la "f": palo, travesaño y el gancho de arriba (arco grueso)
    d.rectangle((455, 420, 590, 984), fill=BLANCO)
    d.rectangle((360, 540, 700, 655), fill=BLANCO)
    d.arc((455, 215, 815, 575), 180, 270, fill=BLANCO, width=135)
    d.rectangle((635, 215, 720, 350), fill=BLANCO)
    # lo que se sale del círculo, fuera
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).ellipse((40, 40, N - 40, N - 40), fill=255)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0)); out.paste(im, (0, 0), m)
    return out


def instagram():
    g = degradado([(254, 218, 117), (250, 126, 30), (214, 41, 118), (150, 47, 191), (79, 91, 213)], 50)
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).rounded_rectangle((40, 40, N - 40, N - 40), 250, fill=255)
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); im.paste(g, (0, 0), m)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((215, 215, 809, 809), 170, outline=BLANCO, width=72)
    d.ellipse((362, 362, 662, 662), outline=BLANCO, width=72)
    d.ellipse((650, 300, 730, 380), fill=BLANCO)
    return im


def nota(d, dx, dy, color):
    """la nota de TikTok: aro abajo a la izquierda, palo y bandera curva arriba a la derecha"""
    d.ellipse((235 + dx, 520 + dy, 525 + dx, 810 + dy), outline=color, width=95)
    d.rectangle((432 + dx, 200 + dy, 527 + dx, 700 + dy), fill=color)
    d.arc((180 + dx, 200 + dy, 780 + dx, 800 + dy), 270, 345, fill=color, width=95)   # bandera: de lo alto del palo hacia la derecha


def tiktok():
    im, d = lienzo()
    caja(d, (10, 10, 12, 255))
    capa = Image.new('RGBA', (N, N), (0, 0, 0, 0)); dc = ImageDraw.Draw(capa)
    nota(dc, -22, -14, (37, 244, 238, 255))                     # cian detrás
    nota(dc, 22, 14, (254, 44, 85, 255))                        # rojo detrás
    nota(dc, 0, 0, BLANCO)
    im.alpha_composite(capa)
    return im


def kick():
    im, d = lienzo()
    caja(d, (83, 252, 24, 255), r=170)
    # la K en bloques (pixelada), negra
    u = 92; x0, y0 = 236, 236
    brazos = {0: (4, 5), 1: (3, 4), 2: (2, 3), 3: (2, 3), 4: (3, 4), 5: (4, 5)}   # fila → columnas del brazo (en escalera)
    bloques = [(c, f) for f in range(6) for c in (0, 1)] + [(c, f) for f, cs in brazos.items() for c in cs]
    for (bx, by) in bloques:
        d.rectangle((x0 + bx * u, y0 + by * u, x0 + (bx + 1) * u - 1, y0 + (by + 1) * u - 1), fill=(10, 10, 12, 255))
    return im


REDES = {'discord': discord, 'youtube': youtube, 'facebook': facebook, 'instagram': instagram, 'tiktok': tiktok, 'kick': kick}

if __name__ == '__main__':
    salida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'iconos')
    os.makedirs(salida, exist_ok=True)
    for nombre, f in REDES.items():
        f().resize((512, 512), Image.LANCZOS).save(os.path.join(salida, nombre + '.png'))
    print('ok', len(REDES))
