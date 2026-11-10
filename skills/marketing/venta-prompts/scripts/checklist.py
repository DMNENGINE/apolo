#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Autoevalua una pagina de ventas (hecha con la skill venta-prompts) y devuelve UNA linea.

Uso:
  python -X utf8 checklist.py <ruta-local.html | url>
  python -X utf8 checklist.py <...> --json     # misma linea, solo el objeto JSON
  python -X utf8 checklist.py secciones        # el orden de secciones a construir (texto)

Sin dependencias. Lo que no pueda medir, no lo puntua: los avisos son eso, avisos.
Salida del modo revision: una linea JSON {url, puntos 0-100, fallos[], avisos[], leido}
"""
import json
import re
import sys

# ---------- el orden de secciones que funciona (y su peso si falta) ----------
SECCIONES = [
    ("hero", "Titular de beneficio (<=12 palabras) + subtitulo + UN CTA + una linea de 'Acceso inmediato · N prompts · pago unico'"),
    ("producto", "El producto de verdad a la vista: fragmento, la guia, un resultado"),
    ("beneficios", "3 bloques, cada uno responde a una objecion distinta (tiempo, uso, 'no es solo texto')"),
    ("muestra", "Antes y despues con lo que se compra: mismo encargo con prompt flojo y con el del paquete"),
    ("prueba", "3 testimonios verificables o la muestra si no hay; sin testimonios NO existe la seccion"),
    ("precios", "3 escalones, el del medio destacado, precio exacto + ancla + IVA/impuestos y que incluye cada uno"),
    ("faq", "3-8 objeciones que impiden comprar, respuesta de una frase"),
    ("cta_final", "Repite el CTA con el mismo texto que el del hero"),
    ("footer", "Legal: privacidad, terminos, contacto; nada compitiendo"),
]

# (etiqueta, regex con palabra completa, contexto obligatorio o None). Los verbos que a veces
# si valen ("descubre lo que no te dicen", "el precio exacto es el unico") solo salen si
# aparece el relleno de marketing en el mismo texto.
FILLER = [
    ("imagine", r"\bimagina(s|r|d|te)?\b", None),
    ("el unico/la unica", r"\b(el|la)\s+unic[oa]s?\b", r"\bno\s+(es|hay|existe)\b|\bnunca\b|\bnot\b"),
    ("revoluciona", r"\brevolucion\w*", None),
    ("nivel superior", r"\bnivel\s+superior\b", None),
    ("proximo nivel", r"\b(proximo|siguiente)\s+nivel\b", None),
    ("desbloquea tu", r"\bdesbloquea\b", None),
    ("lleva tu ... al", r"\blleva\s+tu\s+\w+(\s+\w+){0,4}\s+al\s+(siguiente|proximo)\b", None),
    ("descubre", r"\bdescubre\b", r"\bnunca|\bthat\b|\bque\s+(no\s+)?te\b"),
    ("garantizado", r"\bgarantizad[oa]\b", None),
    ("infinito", r"\binfinit[oa]s?\b", r"\bno\b|\bnunca\b|\bnot\b"),
    ("sin limites", r"\bsin\s+limites\b", r"\bno\b|\bnunca\b|\bnot\b"),
    ("secretos", r"\bsecretos?\b", r"\brevelad|\bque\s+(no|nadie)|\bdaily\b"),
]

PODER = ["quiero", "comprar", "compralo", "empieza", "empezar", "acceder", "accede", "reservar",
         "consigue", "consigue", "obtener", "obten los", "pedir", "hazte con", "llévatelo",
         "unirse", "apuntate", "descarga", "ver los", "buy", "get", "start", "order"]
DEBIL = ["saber mas", "mas informacion", "mas info", "leer mas", "descubre", "click aqui",
         "aqui", "más", "ver mas", "seguir", "continuar", "learn more", "read more"]


def norm(s):
    s = (s or "").replace("<br>", " ")
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ü", "u"), ("ñ", "n")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def leer(destino):
    if re.match(r"^https?://", destino, re.I):
        import urllib.request
        req = urllib.request.Request(destino, headers={"User-Agent": "Mozilla/5.0 apolo-venta-prompts"})
        with urllib.request.urlopen(req, timeout=15) as r:
            crudo = r.read(400_000)
        try:
            return crudo.decode("utf-8")
        except UnicodeDecodeError:
            return crudo.decode("latin-1", "replace")
    with open(destino, "rb") as f:
        crudo = f.read(400_000)
    try:
        return crudo.decode("utf-8")
    except UnicodeDecodeError:
        return crudo.decode("latin-1", "replace")


def texto_visible(html):
    html = re.sub(r"(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>", " ", html)
    t = re.sub(r"(?s)<[^>]+>", " ", html)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&aacute;", "á")
    return re.sub(r"\s+", " ", t).strip()


def leer_sin(xs):
    n = len(xs)
    if n == 0:
        return ""
    if n == 1:
        return xs[0]
    return ", ".join(xs[:-1]) + " y " + xs[-1]


def evaluar(destino):
    html = leer(destino)
    txt = texto_visible(html)
    low = norm(txt)
    fallos, avisos = [], []

    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    titulo_doc = norm(m.group(1)) if m else ""
    h1 = [norm(t) for t in re.findall(r"(?is)<h1[^>]*>(.*?)</h1>", html)]
    h1 = [t for t in h1 if t]
    hero = h1[0] if h1 else ""
    palabras = len(hero.split()) if hero else 0

    puntos = 100

    # --- CTA ---
    botones = re.findall(r"(?is)<(?:button|a)\b[^>]*>(.*?)</(?:button|a)>", html)
    botones = [norm(b) for b in botones if norm(b)]
    cta = [b for b in botones if any(p in b for p in PODER)]
    debiles = [b for b in botones if b in DEBIL]
    if not botones:
        fallos.append("no hay ningun boton o enlace que parezca un CTA")
        puntos -= 22
    else:
        if not cta and debiles:
            fallos.append("todos los botones son debiles (%s): ninguno dice que se compra" % ", ".join(sorted(set(debiles))[:4]))
            puntos -= 18
        distintos = sorted(set(cta))
        if len({d for d in distintos if "comprar" in d or "quiero" in d}) > 2:
            avisos.append("CTA con mas de dos textos distintos: %s" % ", ".join(distintos[:5]))
            puntos -= 5

    # --- el precio en la parte visible ---
    if re.search(r"(?<!\d)(?:[0-9]{1,4}[.,][0-9]{2})(?!\d)", low) is None and not re.search(r"(?:€|\$|usd|eur)\s*\d", low):
        if re.search(r"desde\s+", low) or "contact" in low:
            fallos.append("el precio no es exacto (aparece 'desde' o 'contactar'): un producto de autoservicio tiene precio a la vista")
        else:
            fallos.append("no se encuentra ningun precio con numero en la pagina")
        puntos -= 16
    money = re.search(r"(?:€|\$|usd|eur)\s?\d|\d[.,]\d{2}\s?(?:€|\$|usd|eur)", low)
    if money and hero:
        # el precio tiene que estar en el primer 60% del texto visible
        idx = low.find(money.group(0))
        if idx > len(low) * 0.6:
            avisos.append("el precio aparece muy abajo (a mas del 60%% del texto): la mayoria no llega")
            puntos -= 6

    # --- titular ---
    if not h1:
        fallos.append("no hay H1: el titular de beneficio es obligatorio")
        puntos -= 14
    elif palabras > 12:
        fallos.append("el H1 tiene %d palabras (tope 12)" % palabras)
        puntos -= 8
    if "imagina" in hero or "revoluciona" in hero or "descubre" in hero:
        fallos.append("el titular usa relleno ('imagina/revoluciona/descubre') en vez de decir que se obtiene")
        puntos -= 8

    # --- secciones ---
    faltan = []
    if not re.search(r"faq|preguntas frecuentes|dudas|frequently", low) and not re.search(r"(?i)<details", html):
        faltan.append("faq")
    if not re.search(r"\bprecios?\b|\bplanes\b|pricing", low) and not money:
        faltan.append("precios")
    if not re.search(r"testimoni|resenas|reseñas|opiniones|casos de exito|clientes", low):
        avisos.append("sin seccion de prueba social (vale si de verdad no hay testimonios: entonces la prueba es la muestra)")
    if not re.search(r"garantia|devolucion|reembolso|acceso inmediato", low):
        avisos.append("no se ve garantia ni acceso: es la objecion que mas cuesta")
        puntos -= 4
    for f in faltan:
        fallos.append("falta la seccion: %s" % f)
        puntos -= 12

    # --- relleno y ambiguedad ---
    rellenos = [k for k, rx, ctx in FILLER
                if re.search(rx, low) and (ctx is None or not re.search(ctx, low))]
    if rellenos:
        avisos.append("relleno detectado: %s. Un dato pesa mas que tres adjetivos" % ", ".join(rellenos[:5]))
        puntos -= min(10, 2 * len(rellenos))

    # --- densidad ---
    n_pal = len(low.split())
    if n_pal > 400:
        por_1000 = round(n_pal / 1000, 1)
        if not re.search(r"(?i)<h2", html):
            avisos.append("mas de %d palabras sin subtitulos (H2): los bloques largos no se leen a saltos" % n_pal)
            puntos -= 6
        else:
            avisos.append("%d palabras de texto: revisa que cada párrafo tenga una sola idea" % n_pal)
    if n_pal < 120:
        avisos.append("muy poco texto (%d palabras): falta explicar para quien es y que incluye" % n_pal)
        puntos -= 6

    # --- movil ---
    if not re.search(r"(?i)name=[\"']viewport", html):
        fallos.append("falta la meta viewport: la pagina no se vera bien en movil")
        puntos -= 10
    if re.search(r"(?i)font-size\s*:\s*(\d{1,2})(\.\d+)?px", html):
        tam = [int(x) for x in re.findall(r"(?i)font-size\s*:\s*(\d{1,2})(?:\.\d+)?px", html)]
        if tam and min(tam) < 12:
            avisos.append("hay texto por debajo de 12px (minimo comodo 16px en movil)")
            puntos -= 3

    # --- lunares de mentira ---
    if re.search(r"\bsolo \d+|quedan \d+|ultimas? \d+ (?:horas|dias|plazas)", low) and not re.search(r"lanzamiento|fundador|primeras", low):
        avisos.append("escasez sin motivo real (solo/quedan): si no es verdad, quitala")

    puntos = max(0, min(100, puntos))
    return {
        "url": destino,
        "puntos": puntos,
        "fallos": fallos,
        "avisos": avisos,
        "leido": {"titulo": titulo_doc, "h1": hero, "palabras_h1": palabras,
                  "palabras_pagina": n_pal, "cta": sorted(set(cta))[:6], "hay_precio": bool(money)},
        "listo": puntos >= 70 and not [f for f in fallos],
    }


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    solo_json = "--json" in argv
    if not args:
        print("uso: checklist.py <ruta|url> | checklist.py secciones", file=sys.stderr)
        return 2
    if args[0].lower() in ("secciones", "sections"):
        lineas = ["%d. %s — %s" % (i + 1, n, d) for i, (n, d) in enumerate(SECCIONES)]
        print("Orden de secciones (y el tope de cada una):\n" + "\n".join(lineas))
        print("Regla: un CTA con el mismo texto en todos los bloques; el precio antes de la mitad.")
        return 0
    try:
        r = evaluar(args[0])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"url": args[0], "error": "%s: %s" % (type(e).__name__, e)}, ensure_ascii=False))
        return 1
    if solo_json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        estado = "LISTA" if r["listo"] else "NO LISTA"
        print(json.dumps(r, ensure_ascii=False))
        print("%s — %d/100 · %d fallos · %d avisos" % (estado, r["puntos"], len(r["fallos"]), len(r["avisos"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
