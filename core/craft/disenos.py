# Piezas gráficas propias de los diseños (Pillow): marco con brillo para la ventanita flotante y la raya del podcast.
# Uso: python disenos.py marco <salida.png> <ancho> <alto> <radio> [color hex]
#      python disenos.py raya <salida.png> <ancho> <alto> [color hex]
import sys

from PIL import Image, ImageDraw, ImageFilter


def color(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def marco(salida, w, h, r, c='22e6ff'):
    m = 40                                            # margen para el brillo
    W, H = w + 2 * m, h + 2 * m
    col = color(c)
    linea = Image.new('L', (W, H), 0)
    ImageDraw.Draw(linea).rounded_rectangle((m - 5, m - 5, m + w + 4, m + h + 4), r + 5, outline=255, width=9)
    brillo = linea.filter(ImageFilter.GaussianBlur(14)).point(lambda v: min(255, v * 2))
    sombra = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sombra).rounded_rectangle((m, m + 10, m + w, m + h + 10), r, fill=200)
    sombra = sombra.filter(ImageFilter.GaussianBlur(16))
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    im.paste((0, 0, 0, 255), (0, 0), sombra)
    im.paste(col + (255,), (0, 0), brillo)
    im.paste((235, 255, 255, 255), (0, 0), linea)
    hueco = Image.new('L', (W, H), 0)                 # por dentro transparente: ahí va el vídeo
    ImageDraw.Draw(hueco).rounded_rectangle((m, m, m + w, m + h), r, fill=255)
    a = im.getchannel('A'); a.paste(0, (0, 0), hueco); im.putalpha(a)
    im.save(salida)


def aro(salida, d, c='22e6ff'):
    m = 40; N = d + 2 * m; col = color(c)
    linea = Image.new('L', (N, N), 0)
    ImageDraw.Draw(linea).ellipse((m - 5, m - 5, m + d + 4, m + d + 4), outline=255, width=9)
    brillo = linea.filter(ImageFilter.GaussianBlur(14)).point(lambda v: min(255, v * 2))
    sombra = Image.new('L', (N, N), 0)
    ImageDraw.Draw(sombra).ellipse((m, m + 10, m + d, m + d + 10), fill=200)
    sombra = sombra.filter(ImageFilter.GaussianBlur(16))
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    im.paste((0, 0, 0, 255), (0, 0), sombra)
    im.paste(col + (255,), (0, 0), brillo)
    im.paste((235, 255, 255, 255), (0, 0), linea)
    hueco = Image.new('L', (N, N), 0)
    ImageDraw.Draw(hueco).ellipse((m, m, m + d, m + d), fill=255)
    a = im.getchannel('A'); a.paste(0, (0, 0), hueco); im.putalpha(a)
    im.save(salida)


def raya(salida, w, h, c='22e6ff'):
    col = color(c); H = h + 40
    linea = Image.new('L', (w, H), 0)
    ImageDraw.Draw(linea).rectangle((0, 20, w, 20 + h), fill=255)
    brillo = linea.filter(ImageFilter.GaussianBlur(10)).point(lambda v: min(255, v * 2))
    im = Image.new('RGBA', (w, H), (0, 0, 0, 0))
    im.paste(col + (255,), (0, 0), brillo)
    im.paste((235, 255, 255, 255), (0, 0), linea)
    im.save(salida)


if __name__ == '__main__':
    q, salida = sys.argv[1], sys.argv[2]
    if q == 'aro':
        aro(salida, int(sys.argv[3]), *(sys.argv[4:5]))
    elif q == 'marco':
        marco(salida, int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), *(sys.argv[6:7]))
    else:
        raya(salida, int(sys.argv[3]), int(sys.argv[4]), *(sys.argv[5:6]))
    print('ok')
