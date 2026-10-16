# Trueno — fuente propia de APOLO / LAGCTRUCKS (MIT). Rotulación industrial de camión: mayúsculas condensadas con las esquinas
# cortadas en chaflán y sin curvas. Cada letra se construye con barras y diagonales que se unen con skia-pathops (sin solapes:
# así el contorno de los subtítulos no dibuja costuras dentro de la letra). Las minúsculas usan las mismas formas.
# Uso: python trueno.py <carpeta de salida>   → Trueno-Black.ttf y Trueno-Regular.ttf
import math, os, sys

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.reverseContourPen import ReverseContourPen

UPM, H, ASC, DESC = 1000, 720, 960, -260
LSB = 46                                              # margen a cada lado de la letra


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def seg(x0, y0, x1, y1, w, ext=0):
    """barra diagonal de grosor w (ext alarga los extremos para que solapen bien)"""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    x0, y0, x1, y1 = x0 - ux * ext, y0 - uy * ext, x1 + ux * ext, y1 + uy * ext
    nx, ny = -uy * w / 2, ux * w / 2
    return [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]


def esquina(x, y, c, cual):
    """triángulo que corta la esquina (x,y): tl tr bl br"""
    sx = 1 if cual[1] == 'l' else -1
    sy = -1 if cual[0] == 't' else 1
    return [(x - sx * 2, y - sy * 2), (x + sx * c, y - sy * 2), (x - sx * 2, y + sy * c)]


class Glifo:
    def __init__(self, ancho):
        self.ancho, self.mas, self.menos = ancho, [], []

    def add(self, *ps): self.mas += ps; return self
    def cut(self, *ps): self.menos += ps; return self


def letras(T, C):
    """T = grosor del trazo, C = chaflán. Devuelve {carácter: Glifo}"""
    m = H / 2                                          # altura de la barra del medio
    bm = T * 0.86                                      # grosor de las barras horizontales del medio
    G = {}

    def caja(B, cortes='', medio=None):
        g = Glifo(B)
        for c in cortes.split():
            x = 0 if c[1] == 'l' else B; y = H if c[0] == 't' else 0
            g.cut(esquina(x, y, C, c))
        return g

    B = 450
    G['A'] = caja(B, 'tl tr').add(rect(0, 0, T, H), rect(B - T, 0, B, H), rect(0, H - T, B, H), rect(0, m - bm / 2 - 30, B, m + bm / 2 - 30))
    G['B'] = caja(B, 'tr br').add(rect(0, 0, T, H), rect(0, H - T, B - 40, H), rect(0, m - bm / 2, B, m + bm / 2), rect(0, 0, B, T),
                                  rect(B - T - 40, m, B - 40, H), rect(B - T, 0, B, m)).cut(esquina(B - 40, H, C, 'tr'), [(B + 2, m + bm / 2 + 2), (B - 42, m + bm / 2 + 2), (B + 2, m + 30)])
    G['C'] = caja(B, 'tl bl tr br').add(rect(0, 0, T, H), rect(0, H - T, B, H), rect(0, 0, B, T))
    G['D'] = caja(B, 'tr br').add(rect(0, 0, T, H), rect(0, H - T, B, H), rect(0, 0, B, T), rect(B - T, 0, B, H))
    G['E'] = caja(410).add(rect(0, 0, T, H), rect(0, H - T, 410, H), rect(0, m - bm / 2, 370, m + bm / 2), rect(0, 0, 410, T))
    G['F'] = caja(400).add(rect(0, 0, T, H), rect(0, H - T, 400, H), rect(0, m - bm / 2 - 20, 360, m + bm / 2 - 20))
    G['G'] = caja(B, 'tl bl tr br').add(rect(0, 0, T, H), rect(0, H - T, B, H), rect(0, 0, B, T), rect(B - T, 0, B, m + bm / 2 - 20),
                                        rect(B * 0.48, m - bm / 2 - 20, B, m + bm / 2 - 20))
    G['H'] = caja(B).add(rect(0, 0, T, H), rect(B - T, 0, B, H), rect(0, m - bm / 2, B, m + bm / 2))
    G['I'] = caja(T).add(rect(0, 0, T, H))
    G['J'] = caja(420, 'bl br').add(rect(420 - T, 0, 420, H), rect(0, 0, 420, T), rect(0, 0, T, H * 0.36))
    G['K'] = caja(460).add(rect(0, 0, T, H), seg(T * 0.6, m - 40, 460 - T * 0.55, H, T * 1.12, 60), seg(T * 1.2, m + 10, 460 - T * 0.55, 0, T * 1.12, 60)).cut(rect(460, -100, 700, H + 100), rect(-50, H, 700, H + 200), rect(-50, -200, 700, 0))
    G['L'] = caja(400).add(rect(0, 0, T, H), rect(0, 0, 400, T))
    B = 580
    G['M'] = caja(B).add(rect(0, 0, T, H), rect(B - T, 0, B, H), seg(T / 2, H + 60, B / 2, H * 0.3, T * 1.05), seg(B - T / 2, H + 60, B / 2, H * 0.3, T * 1.05),
                         [(B / 2 - T * 0.53, H * 0.3 + 4), (B / 2 + T * 0.53, H * 0.3 + 4), (B / 2, H * 0.3 - T * 0.62)]).cut(rect(-50, H, 700, H + 200))
    B = 480
    G['N'] = caja(B).add(rect(0, 0, T, H), rect(B - T, 0, B, H), seg(T / 2, H, B - T / 2, 0, T * 1.1, 0)).cut(rect(-50, H, 700, H + 200), rect(-50, -200, 700, 0))
    B = 470
    G['O'] = caja(B, 'tl tr bl br').add(rect(0, 0, T, H), rect(B - T, 0, B, H), rect(0, H - T, B, H), rect(0, 0, B, T))
    G['P'] = caja(450, 'tr').add(rect(0, 0, T, H), rect(0, H - T, 450, H), rect(0, m - bm / 2 - 30, 450, m + bm / 2 - 30), rect(450 - T, m - 30, 450, H)).cut(esquina(450, m - bm / 2 - 30, C * 0.8, 'br'))
    G['Q'] = caja(B, 'tl tr bl br').add(rect(0, 0, T, H), rect(B - T, 0, B, H), rect(0, H - T, B, H), rect(0, 0, B, T), seg(B * 0.55, T * 1.7, B + 30, -110, T * 0.95, 0))
    G['R'] = caja(460, 'tr').add(rect(0, 0, T, H), rect(0, H - T, 460, H), rect(0, m - bm / 2 - 30, 460, m + bm / 2 - 30), rect(460 - T, m - 30, 460, H),
                                 seg(T * 1.3, m - 30, 460 - T * 0.5, 0, T * 1.1, 30)).cut(esquina(460, m - bm / 2 - 30, C * 0.8, 'br'), rect(-50, -200, 700, 0), rect(460, -100, 700, m))
    G['S'] = caja(450, 'tl br tr bl').add(rect(0, H - T, 450, H), rect(0, m, T, H), rect(0, m - bm / 2, 450, m + bm / 2), rect(450 - T, 0, 450, m), rect(0, 0, 450, T))
    G['T'] = caja(450).add(rect(0, H - T, 450, H), rect(225 - T / 2, 0, 225 + T / 2, H))
    G['U'] = caja(460, 'bl br').add(rect(0, 0, T, H), rect(460 - T, 0, 460, H), rect(0, 0, 460, T))
    G['V'] = caja(480).add(seg(T * 0.55, H + 40, 240, 0, T * 1.12, 40), seg(480 - T * 0.55, H + 40, 240, 0, T * 1.12, 40)).cut(rect(-60, H, 700, H + 300), rect(-60, -300, 700, 0))
    G['W'] = caja(640).add(seg(T * 0.5, H + 30, 170, 0, T, 40), seg(320, H * 0.72, 170, 0, T, 40), seg(320, H * 0.72, 470, 0, T, 40), seg(640 - T * 0.5, H + 30, 470, 0, T, 40)).cut(rect(-60, H, 800, H + 300), rect(-60, -300, 800, 0))
    G['X'] = caja(470).add(seg(T * 0.5, H, 470 - T * 0.5, 0, T * 1.1, 60), seg(470 - T * 0.5, H, T * 0.5, 0, T * 1.1, 60)).cut(rect(-80, H, 700, H + 300), rect(-80, -300, 700, 0), rect(470, -100, 700, H + 100), rect(-200, -100, 0, H + 100))
    G['Y'] = caja(470).add(seg(T * 0.5, H, 235, m - 40, T * 1.1, 60), seg(470 - T * 0.5, H, 235, m - 40, T * 1.1, 60), rect(235 - T / 2, 0, 235 + T / 2, m)).cut(rect(-80, H, 700, H + 300), rect(470, -100, 700, H + 100), rect(-200, -100, 0, H + 100))
    G['Z'] = caja(440).add(rect(0, H - T, 440, H), rect(0, 0, 440, T), seg(T * 0.4, T * 0.6, 440 - T * 0.4, H - T * 0.6, T * 1.15, 0))
    # números (mismo vocabulario)
    B = 440
    G['0'] = caja(B, 'tl tr bl br').add(rect(0, 0, T, H), rect(B - T, 0, B, H), rect(0, H - T, B, H), rect(0, 0, B, T), seg(T, T, B - T, H - T, T * 0.55, 0))
    G['1'] = caja(300).add(rect(300 - T - 40, 0, 300 - 40, H), seg(300 - T - 40, H - T * 0.5, 40, H - T * 1.6, T * 0.9, 20), rect(20, 0, 300, T * 0.9))
    G['2'] = caja(B, 'tl tr').add(rect(0, H - T, B, H), rect(B - T, m, B, H), rect(0, m - bm / 2, B, m + bm / 2), rect(0, 0, T, m), rect(0, 0, B, T))
    G['3'] = caja(B, 'tr br').add(rect(0, H - T, B, H), rect(60, m - bm / 2, B, m + bm / 2), rect(0, 0, B, T), rect(B - T, 0, B, H))
    G['4'] = caja(B).add(rect(0, m - 40, T, H), rect(0, m - 40 - bm, B, m - 40), rect(B - T - 30, 0, B - 30, H))
    G['5'] = caja(B, 'br bl').add(rect(0, H - T, B, H), rect(0, m, T, H), rect(0, m - bm / 2, B, m + bm / 2), rect(B - T, 0, B, m), rect(0, 0, B, T))
    G['6'] = caja(B, 'tl bl br tr').add(rect(0, 0, T, H), rect(0, H - T, B, H), rect(0, m - bm / 2, B, m + bm / 2), rect(B - T, 0, B, m), rect(0, 0, B, T))
    G['7'] = caja(430).add(rect(0, H - T, 430, H), seg(430 - T * 0.55, H - 20, 150, 0, T * 1.1, 0)).cut(rect(-50, -300, 600, 0))
    G['8'] = caja(B, 'tl tr bl br').add(rect(0, 0, T, H), rect(B - T, 0, B, H), rect(0, H - T, B, H), rect(0, 0, B, T), rect(0, m - bm / 2, B, m + bm / 2)).cut(
        [(-2, m + bm / 2 + 30), (C * 0.5, m), (-2, m - bm / 2 - 30)], [(B + 2, m + bm / 2 + 30), (B - C * 0.5, m), (B + 2, m - bm / 2 - 30)])
    G['9'] = caja(B, 'tl tr br bl').add(rect(0, m, T, H), rect(0, H - T, B, H), rect(0, m - bm / 2, B, m + bm / 2), rect(B - T, 0, B, H), rect(0, 0, B, T))
    # signos
    P = T * 1.05
    G['.'] = caja(P).add(rect(0, 0, P, P))
    G[','] = caja(P).add(rect(0, 0, P, P), [(P * 0.35, 0), (P, 0), (P * 0.25, -P * 0.9), (-P * 0.2, -P * 0.9)])
    G[':'] = caja(P).add(rect(0, 0, P, P), rect(0, H * 0.55, P, H * 0.55 + P))
    G[';'] = caja(P).add(rect(0, H * 0.55, P, H * 0.55 + P), rect(0, 0, P, P), [(P * 0.35, 0), (P, 0), (P * 0.25, -P * 0.9), (-P * 0.2, -P * 0.9)])
    G['!'] = caja(P).add(rect(0, 0, P, P), [(0, H), (P, H), (P * 0.82, P + 70), (P * 0.18, P + 70)])
    G['?'] = caja(420, 'tl tr').add(rect(0, H - T, 420, H), rect(420 - T, m - 20, 420, H), rect(140, m - bm / 2 - 20, 420, m + bm / 2 - 20), rect(140, P + 70, 140 + T, m),
                                    rect(140 - (P - T) / 2, 0, 140 + T + (P - T) / 2, P))
    G['-'] = caja(300).add(rect(0, m - bm / 2 - 30, 300, m + bm / 2 - 30))
    G["'"] = caja(T * 0.8).add([(0, H), (T * 0.8, H), (T * 0.6, H - 230), (T * 0.2, H - 230)])
    G['"'] = caja(T * 2.2).add([(0, H), (T * 0.8, H), (T * 0.6, H - 230), (T * 0.2, H - 230)], [(T * 1.4, H), (T * 2.2, H), (T * 2.0, H - 230), (T * 1.6, H - 230)])
    G['('] = caja(230).add(rect(70, -60, 70 + T, H + 40), rect(70, H + 40 - T * 0.7, 230, H + 40), rect(70, -60, 230, -60 + T * 0.7)).cut(esquina(70, H + 40, C * 0.8, 'tl'), esquina(70, -60, C * 0.8, 'bl'))
    G[')'] = caja(230).add(rect(160 - T, -60, 160, H + 40), rect(0, H + 40 - T * 0.7, 160, H + 40), rect(0, -60, 160, -60 + T * 0.7)).cut(esquina(160, H + 40, C * 0.8, 'tr'), esquina(160, -60, C * 0.8, 'br'))
    G['/'] = caja(360).add(seg(0, -40, 360, H + 40, T * 0.95, 0))
    G['%'] = caja(560).add(seg(60, 0, 500, H, T * 0.7, 0), rect(0, H - 250, 200, H), rect(360, 0, 560, 250)).cut(rect(T * 0.6, H - 250 + T * 0.6, 200 - T * 0.6, H - T * 0.6), rect(360 + T * 0.6, T * 0.6, 560 - T * 0.6, 250 - T * 0.6))
    G['#'] = caja(520).add(rect(0, H * 0.58, 520, H * 0.58 + T * 0.75), rect(0, H * 0.25, 520, H * 0.25 + T * 0.75), seg(170, 0, 230, H, T * 0.8, 0), seg(330, 0, 390, H, T * 0.8, 0))
    G['+'] = caja(420).add(rect(0, m - bm / 2 - 30, 420, m + bm / 2 - 30), rect(210 - bm / 2, m - 210 - 30, 210 + bm / 2, m + 210 - 30))
    G['&'] = caja(500, 'tl tr bl').add(rect(0, 0, T, m + 40), rect(30, m, T + 30, H), rect(30, H - T, 380, H), rect(380 - T, m + 60, 380, H), rect(0, m - bm / 2 + 30, 500, m + bm / 2 + 30), rect(0, 0, 420, T), rect(420 - T, 0, 420, m + 30))
    G['@'] = caja(640, 'tl tr bl br').add(rect(0, -40, T * 0.8, H), rect(0, H - T * 0.8, 640, H), rect(640 - T * 0.8, 120, 640, H), rect(0, -40, 520, -40 + T * 0.8),
                                          rect(170, 120, 470, 470)).cut(rect(170 + T * 0.75, 120 + T * 0.75, 470 - T * 0.75, 470 - T * 0.75))
    G['$'] = caja(450, 'tl br tr bl').add(rect(0, H - T, 450, H), rect(0, m, T, H), rect(0, m - bm / 2, 450, m + bm / 2), rect(450 - T, 0, 450, m), rect(0, 0, 450, T),
                                          rect(225 - T * 0.3, -90, 225 + T * 0.3, H + 90))
    return G


ACENTO = {'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U', 'Ñ': 'N'}


def con_acento(g, base, T):
    """copia el glifo base y le pone tilde, diéresis o virgulilla encima"""
    n = Glifo(g.ancho); n.mas, n.menos = list(g.mas), list(g.menos)
    cx = g.ancho / 2; y0 = H + 55
    if base == 'Ü':
        d = T * 0.85
        n.add(rect(cx - d * 1.6, y0, cx - d * 0.6, y0 + d), rect(cx + d * 0.6, y0, cx + d * 1.6, y0 + d))
    elif base == 'Ñ':
        w = T * 0.62                                  # virgulilla en zigzag: una sola banda, sin uniones
        zz = [(cx - 175, y0 + 5), (cx - 60, y0 + 95), (cx + 60, y0 + 15), (cx + 175, y0 + 105)]
        n.add([(x, y + w) for x, y in zz] + [(x, y) for x, y in zz[::-1]])
    else:
        n.add([(cx - 40, y0), (cx + 40, y0), (cx + 150, y0 + 160), (cx + 30, y0 + 160)])
    return n


def invertido(g):
    """¡ ¿ = ! ? girados 180° y bajados para colgar de la línea base"""
    n = Glifo(g.ancho)
    gira = lambda p: [(g.ancho - x, H - y - 220) for x, y in p]
    n.mas = [gira(p) for p in g.mas]; n.menos = [gira(p) for p in g.menos]
    return n


def contorno(g):
    """une las piezas y resta los cortes → camino sin solapes"""
    def camino(polis):
        p = pathops.Path()
        for poli in polis:
            # todas las piezas en el mismo sentido (antihorario): si no, una diagonal "resta" donde pisa a una barra
            area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poli, poli[1:] + poli[:1]))
            if area < 0: poli = poli[::-1]
            p.moveTo(*poli[0])
            for pt in poli[1:]: p.lineTo(*pt)
            p.close()
        return p
    p = camino(g.mas); p.simplify(fix_winding=True)
    if g.menos:
        c = camino(g.menos); c.simplify(fix_winding=True)
        p = pathops.op(p, c, pathops.PathOp.DIFFERENCE)
    return p


def construir(salida, peso, T, C):
    G = letras(T, C)
    for a, b in ACENTO.items(): G[a] = con_acento(G[b], a, T)
    G['¡'] = invertido(G['!']); G['¿'] = invertido(G['?'])
    nombres = {' ': 'space'}
    for ch in G: nombres[ch] = 'uni%04X' % ord(ch)
    orden = ['.notdef', 'space'] + [nombres[ch] for ch in G]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(orden)
    cmap = {32: 'space', 160: 'space'}
    for ch in G:
        cmap[ord(ch)] = nombres[ch]
        if ch.lower() != ch and len(ch.lower()) == 1: cmap[ord(ch.lower())] = nombres[ch]     # minúsculas = mismas formas
    fb.setupCharacterMap(cmap)
    glifos, metricas = {}, {}
    vacio = TTGlyphPen(None)
    glifos['.notdef'] = vacio.glyph(); glifos['space'] = TTGlyphPen(None).glyph()
    metricas['.notdef'] = (300, 0); metricas['space'] = (int(T * 1.6 + 80), 0)
    for ch, g in G.items():
        p = contorno(g)
        pen = TTGlyphPen(None)
        p.draw(ReverseContourPen(_Desplazar(pen, LSB)))
        gl = pen.glyph()
        glifos[nombres[ch]] = gl
        metricas[nombres[ch]] = (int(round(g.ancho + 2 * LSB)), LSB)
    fb.setupGlyf(glifos)
    for n in metricas:
        gl = glifos[n]
        if hasattr(gl, 'recalcBounds'): gl.recalcBounds(fb.font['glyf'])
        metricas[n] = (metricas[n][0], getattr(gl, 'xMin', 0) or 0)
    fb.setupHorizontalMetrics(metricas)
    fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
    familia = 'Trueno'
    fb.setupNameTable({'familyName': familia if peso == 'Black' else f'{familia} {peso}', 'styleName': 'Regular',
                       'uniqueFontIdentifier': f'APOLO:{familia}-{peso}:1.0', 'fullName': f'{familia} {peso}', 'psName': f'{familia}-{peso}',
                       'version': 'Version 1.000', 'copyright': 'Copyright 2026 DMN / APOLO', 'licenseDescription': 'MIT License',
                       'typographicFamily': familia, 'typographicSubfamily': peso})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, usWinAscent=ASC, usWinDescent=-DESC, sCapHeight=H, sxHeight=H,
                usWeightClass=900 if peso == 'Black' else 400, achVendID='APLO', fsType=0)
    fb.setupPost(); fb.setupHead(unitsPerEm=UPM, fontRevision=1.0)
    ruta = os.path.join(salida, f'Trueno-{peso}.ttf')
    fb.save(ruta)
    return ruta


class _Desplazar:
    """pen que mueve todo dx en x (deja el margen izquierdo)"""
    def __init__(self, pen, dx): self.pen, self.dx = pen, dx
    def _m(self, p): return (round(p[0] + self.dx), round(p[1]))
    def moveTo(self, p): self.pen.moveTo(self._m(p))
    def lineTo(self, p): self.pen.lineTo(self._m(p))
    def qCurveTo(self, *ps): self.pen.qCurveTo(*[self._m(p) if p else None for p in ps])
    def curveTo(self, *ps): self.pen.curveTo(*[self._m(p) for p in ps])
    def closePath(self): self.pen.closePath()
    def endPath(self): self.pen.endPath()
    def addComponent(self, *a): self.pen.addComponent(*a)


if __name__ == '__main__':
    salida = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(salida, exist_ok=True)
    for peso, T, C in (('Black', 150, 105), ('Regular', 92, 80)):
        print(construir(salida, peso, T, C))
