# Catálogo completo de emojis: cualquier emoji Unicode de un solo carácter, dibujado con la fuente de emojis del sistema
# (Segoe UI Emoji en Windows, vectorial: sale nítido a cualquier tamaño) y con nuestro acabado de pegatina
# (contorno blanco + sombra suave), igual que los propios de emojis.py. Se generan al pedirlos y se guardan.
# Uso: python catalogo.py <carpeta> <emoji> [<emoji> …]  → JSON {emoji: ruta | null}
#      python catalogo.py --lista  → JSON con todos los emojis disponibles
import json, os, sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FUENTES = [r'C:\Windows\Fonts\seguiemj.ttf', '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', '/System/Library/Fonts/Apple Color Emoji.ttc']
FUENTE = next((f for f in FUENTES if os.path.exists(f)), None)
N, T = 512, 380                                    # lienzo y tamaño del glifo


def disponibles():
    from fontTools.ttLib import TTFont
    cmap = TTFont(FUENTE, fontNumber=0).getBestCmap()
    # rangos de emoji (pictogramas, símbolos, transporte, banderas no: son pares)
    rangos = [(0x2190, 0x21FF), (0x2300, 0x23FF), (0x2600, 0x27BF), (0x2B00, 0x2BFF), (0x1F000, 0x1FAFF)]
    return [chr(c) for c in sorted(cmap) if any(a <= c <= b for a, b in rangos)]


def nombre(e): return 'u' + '_'.join(f'{ord(c):x}' for c in e if ord(c) != 0xFE0F)


def dibujar(e, ruta):
    f = ImageFont.truetype(FUENTE, T)
    txt = e.replace('\ufe0f', '')
    g = Image.new('RGBA', (N * 2, N * 2), (0, 0, 0, 0))
    ImageDraw.Draw(g).text((N // 2, N // 2), txt, font=f, embedded_color=True)
    caja = g.getbbox()
    if not caja or g.getchannel('A').getextrema()[1] == 0:
        return False
    g = g.crop(caja)
    if max(g.size) > T:                                # que quepa con el contorno
        r = T / max(g.size); g = g.resize((max(1, round(g.width * r)), max(1, round(g.height * r))), Image.LANCZOS)
    lienzo = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    x, y = (N - g.width) // 2, (N - g.height) // 2
    a = Image.new('L', (N, N), 0); a.paste(g.getchannel('A'), (x, y))
    borde = a.filter(ImageFilter.MaxFilter(29)).filter(ImageFilter.GaussianBlur(1.2))     # contorno blanco de pegatina
    sombra = borde.filter(ImageFilter.GaussianBlur(10)).point(lambda v: v * 0.45)
    lienzo.paste((0, 0, 0, 255), (6, 10), sombra)
    lienzo.paste((255, 255, 255, 255), (0, 0), borde)
    lienzo.alpha_composite(g, (x, y))
    lienzo.save(ruta)
    return True


if __name__ == '__main__':
    if sys.argv[1] == '--lista':
        print(json.dumps(disponibles(), ensure_ascii=True)); sys.exit()
    carpeta = sys.argv[1]; os.makedirs(carpeta, exist_ok=True)
    out = {}
    for e in sys.argv[2:]:
        ruta = os.path.join(carpeta, nombre(e) + '.png')
        try:
            out[e] = ruta if os.path.exists(ruta) or dibujar(e, ruta) else None
        except Exception:
            out[e] = None
    print(json.dumps(out, ensure_ascii=True))
