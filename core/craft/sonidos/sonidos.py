# Efectos de sonido propios de APOLO (MIT): todos sintetizados aquí con numpy, sin bancos de sonido de nadie.
# Uso: python sonidos.py [carpeta]  → <nombre>.wav (48 kHz, estéreo, 16 bits)
import os, sys, wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def t(seg): return np.arange(int(SR * seg)) / SR


def env(n, ataque=0.005, caida=0.3, forma=4.0):
    x = np.arange(n) / SR
    a = np.clip(x / max(ataque, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(0, x - ataque) * forma / max(caida, 1e-3))


def ruido(seg): return rng.standard_normal(int(SR * seg))


def filtro_banda(x, f0, f1, q=6.0):
    # banda que se desplaza de f0 a f1 (resonador de 2.º orden, coeficientes por muestra)
    n = len(x); y = np.zeros(n); y1 = y2 = 0.0
    fs = np.geomspace(max(f0, 20), max(f1, 20), n)
    for i in range(n):
        w = 2 * np.pi * fs[i] / SR; al = np.sin(w) / (2 * q); c = np.cos(w); a0 = 1 + al
        v = (al * x[i] - (-2 * c) * y1 - (1 - al) * y2) / a0
        y2, y1 = y1, v; y[i] = v
    return y


def paso_bajo(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); p = 0.0
    for i in range(len(x)):
        p = (1 - a) * x[i] + a * p; y[i] = p
    return y


def barrido(f0, f1, seg, onda='sin'):
    f = np.geomspace(f0, f1, int(SR * seg)); fase = 2 * np.pi * np.cumsum(f) / SR
    if onda == 'sierra': return 2 * ((fase / (2 * np.pi)) % 1) - 1
    if onda == 'cuadrada': return np.sign(np.sin(fase))
    return np.sin(fase)


def campana(f, seg, parciales=((1, 1), (2.76, .5), (5.4, .25), (8.9, .12))):
    x = t(seg); y = sum(a * np.sin(2 * np.pi * f * m * x) * np.exp(-x * (2 + m * 1.5)) for m, a in parciales)
    return y * env(len(x), 0.002, seg, 1)


def mezclar(*partes):
    n = max(len(p) + int(o * SR) for o, p in partes); y = np.zeros(n)
    for o, p in partes:
        i = int(o * SR); y[i:i + len(p)] += p
    return y


# ── catálogo ──
def whoosh():
    n = ruido(0.55); e = np.sin(np.linspace(0, np.pi, len(n))) ** 2
    return filtro_banda(n, 300, 3500, 3) * e * 1.6

def swoosh():
    n = ruido(0.25); e = np.sin(np.linspace(0, np.pi, len(n))) ** 1.5
    return filtro_banda(n, 2500, 600, 3) * e * 1.6

def impacto():
    x = t(1.4)
    grave = np.sin(2 * np.pi * np.cumsum(np.geomspace(90, 38, len(x))) / SR) * env(len(x), 0.002, 1.2, 3.5)
    golpe = paso_bajo(ruido(0.3), 900) * env(int(SR * 0.3), 0.001, 0.25, 6) * 3
    return np.tanh(mezclar((0, grave * 1.3), (0, golpe)) * 1.8) * 0.9

def golpe():
    x = t(0.3)
    return np.tanh((np.sin(2 * np.pi * np.cumsum(np.geomspace(160, 50, len(x))) / SR) + paso_bajo(ruido(0.3), 1500) * 0.8) * env(len(x), 0.001, 0.2, 7) * 2)

def ding(): return campana(1320, 1.4) * 0.8

def pop():
    x = t(0.09); return barrido(900, 220, 0.09) * env(len(x), 0.001, 0.08, 5)

def riser():
    seg = 1.6; n = ruido(seg); e = np.linspace(0, 1, len(n)) ** 2
    tono = barrido(180, 900, seg, 'sierra') * 0.25
    return (filtro_banda(n, 400, 6000, 2) * 1.2 + paso_bajo(tono, 3000)) * e

def glitch():
    y = np.zeros(int(SR * 0.42)); i = 0
    while i < len(y):
        d = int(SR * rng.uniform(0.015, 0.05)); f = rng.uniform(80, 1800)
        trozo = barrido(f, f * rng.uniform(0.5, 2), d / SR, 'cuadrada') * rng.uniform(0.3, 0.8)
        m = min(len(trozo), len(y) - i); y[i:i + m] = trozo[:m]; i += d + int(SR * rng.uniform(0, 0.02))
    return np.round(y * 6) / 6 * 0.7                       # "bitcrush"

def claxon():                                                # bocina de aire de tráiler: dos notas de sierra, un poco desafinadas
    seg = 1.1; x = t(seg)
    y = sum(barrido(f, f * 0.995, seg, 'sierra') for f in (185, 233, 186.5))
    e = np.clip(x / 0.04, 0, 1) * np.clip((seg - x) / 0.12, 0, 1)
    return np.tanh(paso_bajo(y, 2200) * 1.5) * e * 0.8

def tambor():                                                # dun, dun, DUN (los escalones de zoom)
    def tom(f, a): x = t(0.5); return np.sin(2 * np.pi * np.cumsum(np.geomspace(f, f * 0.6, len(x))) / SR) * env(len(x), 0.002, 0.45, 4) * a
    return np.tanh(mezclar((0, tom(110, .7)), (0.28, tom(98, .85)), (0.56, tom(70, 1.3))) * 1.6) * 0.9

def chaching():
    return mezclar((0, campana(2100, 0.5) * .6), (0.12, campana(2650, 1.0) * .8), (0, paso_bajo(ruido(0.08), 6000) * env(int(SR * .08), .001, .06, 6) * .5))

def rasgueo():                                               # rayón de disco
    seg = 0.5; x = t(seg); f = 300 + 900 * np.abs(np.sin(2 * np.pi * 3.2 * x))
    tono = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return filtro_banda(ruido(seg), 800, 2400, 2) * 0.5 * np.abs(np.sin(2 * np.pi * 6.4 * x)) + tono * 0.35 * env(len(x), 0.003, 0.5, 2)

def camara():
    return mezclar((0, paso_bajo(ruido(0.03), 7000) * env(int(SR * .03), .001, .02, 5)), (0.07, paso_bajo(ruido(0.05), 4000) * env(int(SR * .05), .001, .04, 5) * .8))

def error():
    x = t(0.5); return paso_bajo(barrido(150, 140, 0.5, 'cuadrada'), 1800) * np.clip((0.5 - x) / 0.05, 0, 1) * np.clip(x / 0.01, 0, 1) * 0.6

def boing():
    x = t(0.7); f = 180 * (1 + 0.5 * np.exp(-x * 4)) * (1 + 0.08 * np.sin(2 * np.pi * 14 * x))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.003, 0.6, 3) * 0.8

def suspenso():                                              # nota grave que crece (tensión)
    seg = 2.0; x = t(seg)
    y = sum(np.sin(2 * np.pi * f * x) for f in (55, 55.6, 82.4)) + paso_bajo(ruido(seg), 300) * 2
    return y * np.linspace(0, 1, len(x)) ** 1.5 * np.clip((seg - x) / 0.1, 0, 1) * 0.35


CATALOGO = {
    'whoosh': (whoosh, 'paso de aire largo: entra un cambio de plano o una ventana'),
    'swoosh': (swoosh, 'paso de aire corto: sale algo, transición rápida'),
    'impacto': (impacto, 'golpe grave de cine: choque, accidente, revelación'),
    'golpe': (golpe, 'puñetazo seco: remate de una frase, zoom de golpe'),
    'ding': (ding, 'campanita: dato, acierto, idea'),
    'pop': (pop, 'burbuja corta: aparece un emoji o un texto'),
    'riser': (riser, 'subida de tensión antes de algo (1,6 s, acaba en el momento)'),
    'glitch': (glitch, 'fallo digital: algo raro, error, susto'),
    'claxon': (claxon, 'bocina de aire de tráiler: saludo, entrada, momento camionero'),
    'tambor': (tambor, 'dun dun DUN: lo cómico o lo dramático en 3 pasos'),
    'chaching': (chaching, 'caja registradora: dinero, pagos'),
    'rasgueo': (rasgueo, 'rayón de disco: algo se corta, "¿qué?", giro inesperado'),
    'camara': (camara, 'disparo de cámara: foto, captura, "miren esto"'),
    'error': (error, 'zumbido de fallo: se equivoca, sale mal'),
    'boing': (boing, 'muelle cómico: tropiezo, salto, tontería'),
    'suspenso': (suspenso, 'nota grave que crece (2 s): miedo, tensión, misterio'),
}


# pico de cada sonido en dBFS, ya pensado para ir debajo de la voz (los que suenan más densos, más bajos)
NIVEL = {'whoosh': -8, 'swoosh': -8, 'impacto': -5, 'golpe': -7, 'ding': -8, 'pop': -9, 'riser': -9, 'glitch': -15, 'claxon': -13,
         'tambor': -6, 'chaching': -8, 'rasgueo': -9, 'camara': -7, 'error': -16, 'boing': -10, 'suspenso': -8}


def guardar(nombre, y, carpeta):
    y = np.asarray(y, dtype=np.float64)
    pico = np.max(np.abs(y)) or 1
    y = y / pico * 10 ** (NIVEL.get(nombre, -8) / 20)
    fade = min(len(y), int(SR * 0.004)); y[-fade:] *= np.linspace(1, 0, fade)
    s = (np.clip(y, -1, 1) * 32767).astype(np.int16)
    with wave.open(os.path.join(carpeta, f'{nombre}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(np.repeat(s, 2).tobytes())


if __name__ == '__main__':
    carpeta = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(carpeta, exist_ok=True)
    pedidos = sys.argv[2:] or list(CATALOGO)
    for n in pedidos:
        guardar(n, CATALOGO[n][0](), carpeta)
    print('ok', len(pedidos))
