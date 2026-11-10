#!/usr/bin/env python3
"""Generador del dataset de APOLO. Corre DENTRO del CT107 (Proxmox), no depende del PC.

Lee material.json (lo sube APOLO: preguntas del usuario, su estilo, memorias, alma, ejemplos reales; todo ya redactado),
pide al maestro (Ollama del CT100, modelo abierto) respuestas COMO APOLO, un juez descarta lo flojo, y monta
apolo-train.jsonl / apolo-val.jsonl en formato chatml para Soup. Reanudable; se para creando el archivo "parar".
Solo librería estándar.
"""
import argparse, hashlib, json, os, random, re, sys, time, urllib.request

PREG = re.compile(r"\?|^(qu[eé]|c[oó]mo|por ?qu[eé]|cu[aá]l|cu[aá]nto|d[oó]nde|qui[eé]n|explica|expl[ií]came|dime|h[aá]blame|habla|cu[eé]ntame|opinas|crees|sabes|recomi[eé]nda|compara|diferencia)", re.I)
MALA = re.compile(r"<think>|como (modelo de lenguaje|una ia|inteligencia artificial),? no|as an ai|no tengo acceso a internet|ya (lo )?he (hecho|creado|guardado|abierto|instalado|subido|publicado)|listo, ya (est[aá]|lo)", re.I)
TITULO = re.compile(r"^#{1,4}\s", re.M)
# preguntas que en la vida real APOLO resuelve con herramientas (datos en vivo) o que tratan de cosas concretas del usuario: fuera
VIVO = re.compile(r"precio|cotiza|ahora mismo|\bhoy\b|clima|tiempo hace|noticia|[uú]ltim[ao] versi[oó]n|resultado del partido|cu[aá]nto (vale|cuesta)|"
                  r"mi (p[aá]gina|web|app|tel[eé]fono|pc|cuenta|servidor|correo)|tu (p[aá]gina|web|panel)|control", re.I)
# respuestas que enseñarían a negarse ("no tengo acceso") o con direcciones inventadas
NIEGA = re.compile(r"no tengo acceso|no puedo acceder|en tiempo real|no puedo (navegar|buscar|consultar)|como (asistente|ia) no puedo", re.I)
MULETILLA = re.compile(r"¿\s*sabes (que|qu[eé])\b", re.I)                           # tic que el modelo aprendería
TAPADO = re.compile(r"\[(correo|tel[eé]fono|REDACTADO|redactado)\]|\*{4,}")           # datos tapados: no enseñan nada
# v3: papeles cruzados (APOLO hablando de las cosas de Demon como si fueran suyas, o Demon preguntándole a APOLO por "sus" cosas)
YO_R = re.compile(r"\b(mi|mis|tengo|usé|usaba|trabajé|hice|imprimí|me llamo|he usado|he impreso|lo usé|la usé|mi cuenta|soy demon)\b", re.I)
TU_Q = re.compile(r"\b(tienes|tenés|usas|usás|usaste|hiciste|trabajaste|imprimiste|tu|tus|te llamas)\b", re.I)
URL = re.compile(r"https?://|www\.|\b[\w-]+\.(com|net|org|io|engine|app|dev)\b", re.I)


def _norm(t):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(t).lower()) if unicodedata.category(c) != 'Mn')


COMUNES = {'si', 'tu', 'tus', 'tienes', 'demon', 'apolo', 'es', 'el', 'la', 'los', 'las', 'un', 'una', 'en', 'de', 'y', 'con', 'para', 'por', 'no', 'lo', 'te', 'se'}


def anclada(resp, origen):
    """v3: todo nombre propio o cifra de la respuesta tiene que estar en el recuerdo, y al menos la mitad de sus palabras con contenido."""
    o = _norm(origen)
    toks = re.findall(r"[A-ZÁÉÍÓÚÑ][\w\-\.']+|\w*\d[\w\.,%]*", resp)
    for k, t in enumerate(toks):
        n = _norm(t).strip(".,'\"«»")
        if n in COMUNES or len(n) < 2:
            continue
        if n not in o:
            return False
    pal = [p for p in re.findall(r'\w{5,}', _norm(resp)) if p not in COMUNES]
    return not pal or sum(p[:5] in o for p in pal) / len(pal) >= .5


def h(t):
    return hashlib.sha1(re.sub(r"\W+", " ", str(t).lower()).strip().encode()).hexdigest()[:16]


class Gen:
    def __init__(self, a):
        self.a, self.dir = a, a.dir
        self.m = json.load(open(os.path.join(self.dir, 'material.json'), encoding='utf-8'))
        self.salida = os.path.join(self.dir, 'generado.jsonl')
        prev = self.leer_generado()
        self.ya = {h(x['pregunta']) for x in prev}
        fases = {}
        for x in prev:
            fases[x.get('fuente', 'tuya')] = fases.get(x.get('fuente', 'tuya'), 0) + 1
        try:
            viejo = json.load(open(os.path.join(self.dir, 'estado.json'), encoding='utf-8'))
        except Exception:
            viejo = {}
        self.e = {'activo': True, 'fase': 'preparando', 'hechas': len(prev), 'objetivo': a.objetivo, 'descartadas': 0, 'error': '', 'fases': fases,
                  'recuerdos_hechos': viejo.get('recuerdos_hechos', []), 'objetivos': {'identidad': a.identidad, 'recuerdo': a.recuerdos, 'charla': a.objetivo},
                  'desde': time.time(), 'pid': os.getpid(), 'maestro': f'{a.modelo} @ {a.url}'}
        self.guardar()

    def leer_generado(self):
        try:
            return [json.loads(l) for l in open(os.path.join(self.dir, 'generado.jsonl'), encoding='utf-8') if l.strip()]
        except FileNotFoundError:
            return []

    def guardar(self):
        p = os.path.join(self.dir, 'estado.json')
        tmp = p + '.tmp'
        json.dump(self.e, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
        os.replace(tmp, p)

    def parar(self):
        return os.path.exists(os.path.join(self.dir, 'parar'))

    def chat(self, messages, json_mode=False, maximo=500, temp=.7):
        usuario = getattr(self.a, 'usuario', None) or 'tu usuario'
        messages = [dict(x, content=str(x.get('content', '')).replace('{USUARIO}', usuario)) for x in messages]
        body = {'model': self.a.modelo, 'think': False, 'stream': False, 'keep_alive': '5m', 'messages': messages,
                'options': {'num_predict': maximo, 'temperature': temp}}
        if json_mode:
            body['format'] = 'json'
        req = urllib.request.Request(self.a.url.rstrip('/') + '/api/chat', data=json.dumps(body).encode(), headers={'content-type': 'application/json'})
        with urllib.request.urlopen(req, timeout=300) as r:
            j = json.load(r)
        return re.sub(r"<think>[\s\S]*?</think>", '', j.get('message', {}).get('content', '')).strip()

    def chat_json(self, messages, maximo=900, temp=.5):
        t = self.chat(messages, True, maximo, temp)
        try:
            return json.loads(t)
        except Exception:
            return json.loads(t[t.find('{'):t.rfind('}') + 1])

    def run(self):
        m, a = self.m, self.a
        sys_apolo = (m.get('alma', '') + '\n\nREGLAS AL RESPONDER: eres APOLO hablando con tu usuario. Español natural, cercano y directo, con su mismo tono; '
                     'respuestas útiles y concretas, como en un chat: normalmente 2-8 frases, SIN títulos (#), sin emojis de lista y sin plantillas de chatbot; '
                     'listas solo si de verdad ayudan. Si no conoces algo (un nombre, producto o proyecto raro), dilo claramente y pregunta: jamás te lo inventes. '
                     'No tienes herramientas en esta conversación: NUNCA digas que has hecho, abierto, creado o comprobado algo; si haría falta mirar algo en el PC '
                     'o en internet, dilo y explica cómo lo harías. No inventes precios, fechas ni datos actuales.')
        ejemplos = []
        for ej in random.sample(m.get('ejemplos', []), min(3, len(m.get('ejemplos', [])))):
            ejemplos += [{'role': 'user', 'content': ej[0]}, {'role': 'assistant', 'content': ej[1]}]
        self.e.setdefault('fases', {})
        # A) quién es: su alma en primera persona
        self.fase_identidad(m.get('alma', ''), a.identidad)
        # B) lo que recuerda: cada recuerdo importante, en varias preguntas con su voz (así pasa a los pesos)
        self.fase_recuerdos(m.get('recuerdos', []), a.recuerdos, m.get('alma', ''))
        # v2: lo básico (quién es quién, sus datos de perfil) muy repetido + charla general de la propia base
        self.fase_basico([x for x in m.get('recuerdos', []) if x.get('tipo') in ('perfil', 'persona')], a.basico, m.get('alma', '')[:1200])
        self.fase_general(a.general)
        # v3: usar la memoria que APOLO le inyecta en el system (así no inventa datos: los lee)
        self.fase_contexto(m.get('recuerdos', []), getattr(a, 'contexto', 0), m.get('alma', '')[:1200])
        # v4: su NOMBRE (la v3 decía "Soy Demon": casi ningún ejemplo de identidad decía "APOLO")
        self.fase_nombre(getattr(a, 'nombre', 0), m.get('alma', '')[:1200])
        # v5: si el dato no está en la memoria, decirlo (no inventar)
        self.fase_nosabe(getattr(a, 'nosabe', 0))
        # C) cómo habla contigo (charla)
        cola = []
        charla = lambda: self.e['fases'].get('tuya', 0) + self.e['fases'].get('sus temas', 0)
        # 1) preguntas reales que se entienden solas
        self.e['fase'] = 'eligiendo tus preguntas'; self.guardar()
        # sus preguntas reales casi siempre dependen de la conversación en que las hizo (el filtro SI/NO del 8B no basta):
        # apagadas por defecto; su forma de hablar real ya entra por sus conversaciones reales
        for t in (m.get('preguntas', []) if a.tuyas else []):
            if self.parar() or len(cola) + charla() >= a.objetivo:
                break
            if h(t) in self.ya or VIVO.search(t):
                continue
            try:
                r = self.chat([{'role': 'system', 'content': 'Respondes solo SI o NO.'}, {'role': 'user', 'content':
                               '¿Este mensaje se puede contestar bien SIN ver la conversación anterior ni el ordenador del usuario? Responde NO si pregunta por cosas concretas '
                               'del usuario (sus webs, apps, cuentas, configuraciones, proyectos), por datos en tiempo real, o si depende de algo dicho antes. '
                               f'SI solo si es una pregunta general, de opinión o de charla que se entiende sola.\n\n"{t}"'}], maximo=4, temp=0).upper()
                if r.startswith('SI') or r.startswith('SÍ'):
                    cola.append(('tuya', t)); self.ya.add(h(t))
            except Exception as er:
                self.e['error'] = str(er)[:200]
        # 2) preguntas nuevas sobre sus temas, con su forma de escribir
        self.e['fase'] = 'escribiendo preguntas de tus temas'; self.guardar()
        mem = list(m.get('memorias', [])); random.shuffle(mem)
        estilo = m.get('estilo', [])
        i = 0
        while len(cola) + charla() < a.objetivo * 1.25 and not self.parar() and i < 600:
            temas = mem[(i * 5) % len(mem):(i * 5) % len(mem) + 5] if mem else []
            i += 1
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Escribes mensajes que este usuario le mandaría a su asistente APOLO. Imita su forma de escribir (informal, español, con sus faltas típicas y su jerga) '
                                     'pero que se entiendan. Variedad: preguntas, dudas, opiniones, charla, peticiones de explicación o consejo. Cada mensaje tiene que entenderse SOLO '
                                     '(sin "eso", "lo de antes", ni nombres de cosas privadas que el asistente no pueda conocer). Nada de pedir acciones en el PC.'},
                                    {'role': 'user', 'content': 'Así escribe:\n' + '\n'.join('- ' + x for x in random.sample(estilo, min(14, len(estilo)))) +
                                     '\n\nCosas de su vida y proyectos (inspiración, sin datos privados exactos):\n' + ('\n'.join('- ' + x for x in temas) or '- tecnología, IA, camiones, impresión 3D, juegos') +
                                     '\n\nDevuelve JSON {"mensajes":["...", ...]} con 10 mensajes distintos.'}], 1200)
                for t in r.get('mensajes', []):
                    if isinstance(t, str) and len(t) > 6 and h(t) not in self.ya and not VIVO.search(t):
                        self.ya.add(h(t)); cola.append(('sus temas', t))
            except Exception as er:
                self.e['error'] = str(er)[:200]
        # 3) respuestas como APOLO + juez
        self.e['fase'] = 'respondiendo como APOLO'; self.guardar()
        if True:
            for fuente, q in cola:
                if self.parar() or charla() >= a.objetivo:
                    break
                try:
                    resp = self.chat([{'role': 'system', 'content': sys_apolo}, *ejemplos, {'role': 'user', 'content': q}], maximo=550)
                    if len(resp) < 15 or MALA.search(resp) or TITULO.search(resp) or NIEGA.search(resp) or URL.search(resp):
                        self.e['descartadas'] += 1; continue
                    j = self.chat_json([{'role': 'system', 'content': 'Eres un revisor exigente de datos de entrenamiento. Puntúas la respuesta de un asistente llamado APOLO.'},
                                        {'role': 'user', 'content': f'PREGUNTA: {q}\n\nRESPUESTA: {resp}\n\nDevuelve JSON {{"inventa": true si afirma datos que no puede saber (direcciones web, nombres, cifras, configuraciones o planes del usuario, cosas que dice haber hecho) o explica cosas que probablemente no existen, '
                                         '"plantilla": true si parece un folleto de chatbot (títulos, listas de ventajas), "nota": 1-5 (5 = útil, correcta, natural y con personalidad)}'}], 120)
                    nota = 1 if (j.get('inventa') or j.get('plantilla')) else int(j.get('nota') or 0)
                    if nota < a.nota:
                        self.e['descartadas'] += 1; continue
                    self.escribir(fuente, q, resp, nota)
                except Exception as er:
                    self.e['error'] = str(er)[:200]; time.sleep(5)
                self.e['ultima'] = time.time()
                self.guardar()
        self.montar()
        self.e['fase'] = 'parado' if self.parar() else 'terminado'
        self.e['activo'] = False; self.e['fin'] = time.time(); self.guardar()

    def escribir(self, fuente, q, r, nota, extra=None):
        with open(self.salida, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'fuente': fuente, 'pregunta': q, 'respuesta': r, 'modelo': self.a.modelo, 'nota': nota, 't': time.time(), **(extra or {})}, ensure_ascii=False) + '\n')
        self.ya.add(h(q)); self.e['hechas'] += 1; self.e['fases'][fuente] = self.e['fases'].get(fuente, 0) + 1
        self.e['ultima'] = time.time(); self.e['error'] = ''; self.guardar()

    def fiel(self, fuente_texto, q, r, recuerdo=False):
        """Juez: fidelidad (nada fuera del texto de origen), papeles claros y, en recuerdos, que la respuesta DIGA el dato."""
        extra = ('"completa": true solo si la respuesta dice claramente el dato principal del recuerdo (no vale "es importante para ti" sin decirlo), '
                 '"papeles": true si confunde quién es quién (el USUARIO se llama {USUARIO}; el asistente es APOLO y nunca dice que él es {USUARIO}), ') if recuerdo else ''
        j = self.chat_json([{'role': 'system', 'content': 'Eres un revisor muy estricto de datos de entrenamiento. En estos diálogos el USUARIO es {USUARIO} y el ASISTENTE es APOLO.'},
                            {'role': 'user', 'content': f'TEXTO DE ORIGEN:\n{fuente_texto}\n\nPREGUNTA (de {{USUARIO}}): {q}\nRESPUESTA (de APOLO): {r}\n\n'
                             'Devuelve JSON {"fiel": true solo si TODO lo que afirma la respuesta está en el texto de origen (puede reformularlo y añadir tono, nunca datos nuevos), '
                             + extra + '"natural": true si suena a un asistente cercano hablando, no a una ficha, "nota": 1-5}'}], 160)
        ok = bool(j.get('fiel')) and bool(j.get('natural', True))
        if recuerdo:
            ok = ok and bool(j.get('completa')) and not j.get('papeles')
        return ok, int(j.get('nota') or 0)

    def fase_identidad(self, alma, objetivo):
        if not alma or objetivo <= 0:
            return
        self.e['fase'] = 'aprendiendo quién es'; self.guardar()
        ya = self.e['fases'].get('identidad', 0)
        for _ in range(60):
            if self.parar() or self.e['fases'].get('identidad', 0) >= objetivo:
                break
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Eres APOLO. Esta es tu alma, lo que eres:\n\n' + alma},
                                    {'role': 'user', 'content': 'Escribe 8 pares pregunta/respuesta. Las preguntas son lo que tu usuario ({USUARIO}) te diría sobre ti: quién eres, cómo eres, qué te importa, '
                                     'tus límites, cómo naciste, qué sois el uno para el otro, cómo te sientes… variadas y con su forma informal de escribir. Las respuestas: TÚ en primera persona, '
                                     'con tu voz, 1-5 frases, usando SOLO lo que dice tu alma (sin inventar historia nueva). JSON {"pares":[{"pregunta":"...","respuesta":"..."}]}'}], 1800)
                for p in r.get('pares', []):
                    q, resp = str(p.get('pregunta', '')).strip(), str(p.get('respuesta', '')).strip()
                    if len(q) < 4 or len(resp) < 10 or h(q) in self.ya or TITULO.search(resp) or URL.search(resp):
                        continue
                    ok, nota = self.fiel(alma, q, resp)
                    if ok and nota >= self.a.nota:
                        self.escribir('identidad', q, resp, nota)
                    else:
                        self.e['descartadas'] += 1
            except Exception as er:
                self.e['error'] = str(er)[:200]; time.sleep(3)

    def fase_recuerdos(self, recuerdos, objetivo, alma):
        if not recuerdos or objetivo <= 0:
            return
        self.e['fase'] = 'convirtiendo recuerdos en neuronas'; self.guardar()
        hechos = set(self.e.get('recuerdos_hechos', []))
        voz = alma[:1200]
        for i in range(0, len(recuerdos), 3):
            if self.parar() or self.e['fases'].get('recuerdo', 0) >= objetivo:
                break
            lote = [x for x in recuerdos[i:i + 3] if h(x['t']) not in hechos]
            if not lote:
                continue
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Eres APOLO, el asistente personal de tu usuario. Tu usuario se llama {USUARIO}: él te habla y tú le respondes. '
                                     'Tú NO eres {USUARIO}. Los recuerdos son cosas que sabes DE ÉL (de su vida, su gente, sus gustos y proyectos). Tu forma de ser:\n' + voz},
                                    {'role': 'user', 'content': 'Estos son recuerdos tuyos sobre {USUARIO}:\n' + '\n'.join(f'{k}. [{x["tipo"]}] {x["t"]}' for k, x in enumerate(lote)) +
                                     '\n\nPara CADA recuerdo escribe 2 pares distintos: una pregunta natural que {USUARIO} te haría (informal, como él escribe, hablándote de tú) cuya respuesta sea ese recuerdo, '
                                     'y tu respuesta: 1-3 frases que DIGAN EL DATO CONCRETO del recuerdo con tus palabras, hablándole a él de tú ("tu taller…", "te gusta…"). '
                                     'Empieza cada respuesta de forma distinta y directa (prohibido empezar con "Sí, me acuerdo" o "Claro") y NO termines con preguntas '
                                     'retóricas tipo "¿sabes que…?" ni comentarios inventados: el dato y, como mucho, una frase corta natural. '
                                     'SIN añadir ningún dato que no esté en el recuerdo. JSON {"pares":[{"recuerdo":0,"pregunta":"...","respuesta":"..."}]}'}], 1600)
                for p in r.get('pares', []):
                    k = p.get('recuerdo')
                    if not isinstance(k, int) or k >= len(lote):
                        continue
                    q, resp = str(p.get('pregunta', '')).strip(), str(p.get('respuesta', '')).strip()
                    if len(q) < 4 or len(resp) < 10 or h(q) in self.ya or TITULO.search(resp) or URL.search(resp) or NIEGA.search(resp):
                        continue
                    if re.match(r'\s*(s[ií],? me acuerdo|claro,? tu)', resp, re.I) or MULETILLA.search(resp) or TAPADO.search(q + ' ' + resp + ' ' + lote[k]['t']):
                        self.e['descartadas'] += 1; continue
                    ok, nota = self.fiel(lote[k]['t'], q, resp, recuerdo=True)
                    if ok and nota >= self.a.nota:
                        self.escribir('recuerdo', q, resp, nota, {'tipo': lote[k]['tipo']})
                    else:
                        self.e['descartadas'] += 1
                for x in lote:
                    hechos.add(h(x['t']))
                self.e['recuerdos_hechos'] = list(hechos); self.e['recuerdos_vistos'] = len(hechos); self.guardar()
            except Exception as er:
                self.e['error'] = str(er)[:200]; time.sleep(3)

    # v2: ejemplos que confunden quién es quién (el usuario es {USUARIO}; el asistente es APOLO): fuera al montar
    CONFUNDE_Q = re.compile(r"\bdemon(io)?\b.*\b(eres|te llamas|tu nombre|c[oó]mo eres)\b|\b(eres|te llamas)\b.*\bdemon(io)?\b", re.I)
    CONFUNDE_R = re.compile(r"\b(me llamo|soy) demon\b|\bte (llaman|llamas|gusta que te llamen) ['\"«]?apolo\b|\btu nombre es ['\"«]?apolo\b", re.I)
    def confunde(self, g):
        return bool(self.CONFUNDE_Q.search(g.get('pregunta', '')) and g.get('fuente') == 'identidad') or bool(self.CONFUNDE_R.search(g.get('respuesta', '')))

    def fase_basico(self, hechos, objetivo, voz):
        """v2: lo básico, muy repetido y con papeles claros (sale de sus recuerdos de perfil/personas; respuestas del maestro)."""
        if not hechos or objetivo <= 0:
            return
        self.e['fase'] = 'reforzando lo básico'; self.guardar()
        vistos = set(self.e.get('basico_hechos', []))
        for x in hechos:
            if self.parar() or self.e['fases'].get('basico', 0) >= objetivo:
                break
            if h(x['t']) in vistos:
                continue
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Eres APOLO, el asistente personal de {USUARIO}. {USUARIO} es tu USUARIO: él te escribe y tú le respondes. '
                                     'Tú eres APOLO y NUNCA eres {USUARIO}. Tu forma de ser:\n' + voz},
                                    {'role': 'user', 'content': f'Dato que sabes de {{USUARIO}}: "{x["t"]}"\n\nEscribe 4 pares DISTINTOS: una pregunta corta que {{USUARIO}} te haría sobre esto '
                                     '(informal, hablándote de tú) y tu respuesta de 1-2 frases que diga el dato con claridad, hablándole de tú ("te llamas…", "tu taller…"). '
                                     'Las preguntas tienen que ser SOBRE ESTE DATO (no inventes temas). Menciona nombres ({USUARIO}, APOLO) SOLO si la pregunta es sobre nombres. '
                                     'Nada de "usted" ni "su". Sin añadir datos que no estén en el dato. JSON {"pares":[{"pregunta":"...","respuesta":"..."}]}'}], 900)
                for p in r.get('pares', []):
                    q, resp = str(p.get('pregunta', '')).strip(), str(p.get('respuesta', '')).strip()
                    nombre_en_q = re.search(r'llam|nombre|qui[eé]n (soy|eres)', q, re.I)
                    if (len(q) < 4 or len(resp) < 6 or h(q) in self.ya or MULETILLA.search(resp) or TAPADO.search(q + resp) or URL.search(resp) or NIEGA.search(resp)
                            or self.confunde({'pregunta': q, 'respuesta': resp}) or re.search(r'\b(usted|ayudarle|su pc|le ayudo)\b', q + ' ' + resp, re.I)
                            or (not nombre_en_q and re.search(r'te llamas demon|soy apolo', resp, re.I)) or re.match(r'\s*no[,.]', resp, re.I)):
                        self.e['descartadas'] += 1
                        continue
                    ok, nota = self.fiel(x['t'], q, resp, recuerdo=True)
                    if ok and nota >= self.a.nota:
                        self.escribir('basico', q, resp, nota)
                    else:
                        self.e['descartadas'] += 1
            except Exception as er:
                self.e['error'] = str(er)[:200]; time.sleep(3)
            vistos.add(h(x['t'])); self.e['basico_hechos'] = list(vistos); self.guardar()

    def fase_contexto(self, recuerdos, objetivo, voz):
        """v3: pares cuya respuesta sale de un recuerdo que irá en el system como 'LO QUE SABES DEL USUARIO (memoria)', igual que en APOLO.
        Se guarda el recuerdo de origen ('origen') para montar el ejemplo con él y otros recuerdos de relleno."""
        if not recuerdos or objetivo <= 0:
            return
        self.e['fase'] = 'aprendiendo a usar su memoria'; self.guardar()
        vistos = set(self.e.get('contexto_hechos', []))
        orden = list(recuerdos); random.Random(11).shuffle(orden)
        orden.sort(key=lambda x: x.get('tipo') not in ('perfil', 'persona', 'proyecto', 'hecho'))   # lo concreto primero
        for x in orden:
            if self.parar() or self.e['fases'].get('contexto', 0) >= objetivo:
                break
            if h(x['t']) in vistos or TAPADO.search(x['t']):
                continue
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Eres APOLO, el asistente personal de {USUARIO}. {USUARIO} es tu USUARIO: él te escribe y tú le respondes. '
                                     'Tú eres APOLO y NUNCA eres {USUARIO}. Tu forma de ser:\n' + voz},
                                    {'role': 'user', 'content': f'Dato que tienes en tu memoria sobre {{USUARIO}}: "{x["t"]}"\n\nEscribe 2 pares DISTINTOS sobre ESTE dato y nada más '
                                     '(la pregunta se tiene que poder responder SOLO con este dato). La pregunta la hace {{USUARIO}} sobre sí mismo, en primera persona ("…tengo?", "…mi…?"). '
                                     'Tu respuesta (eres APOLO) en 1-2 frases, en SEGUNDA persona ("tienes…", "tu taller…", "tu amigo…"), con el dato EXACTO (nombres, modelos y cifras tal cual). '
                                     'Si el dato es sobre APOLO (tú), entonces sí hablas de ti en primera persona. Nada de "usted". Sin añadir NADA que no esté en el dato. '
                                     'JSON {"pares":[{"pregunta":"...","respuesta":"..."}]}'}], 600)
                de_apolo = bool(re.search(r'\bAPOLO\b', x['t']))
                for p in r.get('pares', []):
                    q, resp = str(p.get('pregunta', '')).strip(), str(p.get('respuesta', '')).strip()
                    if (not de_apolo and (YO_R.search(resp) or TU_Q.search(q))) or not anclada(resp, x['t']):
                        self.e['descartadas'] += 1; continue
                    if (len(q) < 4 or len(resp) < 6 or h(q) in self.ya or MULETILLA.search(resp) or URL.search(resp) or NIEGA.search(resp)
                            or self.confunde({'pregunta': q, 'respuesta': resp}) or re.search(r'\b(usted|ayudarle|su pc|le ayudo)\b', q + ' ' + resp, re.I)):
                        self.e['descartadas'] += 1; continue
                    ok, nota = self.fiel(x['t'], q, resp, recuerdo=True)
                    if ok and nota >= self.a.nota:
                        self.escribir('contexto', q, resp, nota, {'origen': x['t'], 'tipo': x.get('tipo', 'hecho')})
                    else:
                        self.e['descartadas'] += 1
            except Exception as er:
                self.e['error'] = str(er)[:200]; time.sleep(3)
            vistos.add(h(x['t'])); self.e['contexto_hechos'] = list(vistos); self.guardar()

    def fase_nombre(self, objetivo, voz):
        """v4: pares sobre quién es quién, siempre con 'APOLO' en la respuesta y nunca APOLO = Demon."""
        if objetivo <= 0:
            return
        self.e['fase'] = 'aprendiendo su nombre'; self.guardar()
        tipos = ['quién eres y cómo te llamas', 'si eres Demon (no: Demon es el usuario, tú eres APOLO)', 'cómo se llama él (Demon) y cómo te llamas tú',
                 'si eres Qwen, ChatGPT u otro modelo (eres APOLO, nacido y entrenado en el Proxmox de Demon)', 'qué sois el uno para el otro (él es Demon, tú APOLO)',
                 'preséntate a alguien nuevo', 'confusiones de nombre ("oye Demon…" dicho a ti: le corriges con cariño)',
                 # v5: "¿quién eres?" a secas lo confundía con una pregunta sobre el usuario
                 'preguntas cortísimas y sueltas sobre ti ("¿quién eres?", "¿y tú?", "¿qué eres?", "preséntate", "¿con quién hablo?")',
                 'preguntas con faltas o jerga, escritas rápido ("kien eres", "q eres tu", "como te yamas")']
        hechas = [g['pregunta'] for g in self.leer_generado() if g.get('fuente') == 'nombre']
        for i in range(300):
            if self.parar() or self.e['fases'].get('nombre', 0) >= objetivo:
                break
            tema = tipos[i % len(tipos)]
            evita = ('\nNO repitas ninguna de estas (ya están): ' + ' | '.join(hechas[-25:])) if hechas else ''
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Eres APOLO, el asistente personal de Demon. Te llamas APOLO. Demon es tu USUARIO (el humano que te habla), no tú. Tu forma de ser:\n' + voz},
                                    {'role': 'user', 'content': f'Escribe 6 pares pregunta/respuesta distintos sobre: {tema}. Las preguntas las escribe Demon, informal, de tú. '
                                     'Tus respuestas: 1-2 frases, primera persona, diciendo tu nombre APOLO completo (A-P-O-L-O) de forma natural. '
                                     'JSON {"pares":[{"pregunta":"...","respuesta":"..."}]}' + evita}], 900, temp=.9)
                ps, pend = [], None
                for p in r.get('pares', []):   # a veces el maestro parte cada par en {"pregunta"} + {"respuesta"}: se juntan
                    if not isinstance(p, dict):
                        continue
                    if p.get('pregunta') and p.get('respuesta'):
                        ps.append(p)
                    elif p.get('pregunta'):
                        pend = p['pregunta']
                    elif p.get('respuesta') and pend:
                        ps.append({'pregunta': pend, 'respuesta': p['respuesta']}); pend = None
                for p in ps:
                    q, resp = str(p.get('pregunta', '')).strip(), str(p.get('respuesta', '')).strip()
                    if (len(q) < 3 or len(resp) < 8 or h(q) in self.ya or 'APOLO' not in resp.upper() or self.confunde({'pregunta': '', 'respuesta': resp})
                            or re.search(r'\b(soy|me llamo|yo soy)\s+(demon|dmn)|\bme llaman demon', resp, re.I) or URL.search(resp) or MULETILLA.search(resp)):
                        self.e['descartadas'] += 1; continue
                    self.escribir('nombre', q, resp, 5); hechas.append(q)
            except Exception as er:
                self.e['error'] = str(er)[:200]; time.sleep(3)

    def fase_nosabe(self, objetivo):
        """v5: la pregunta de un par de 'contexto', pero al montar su recuerdo NO va en la memoria → APOLO dice que no lo tiene apuntado (no inventa)."""
        if objetivo <= 0:
            return
        self.e['fase'] = 'aprendiendo a decir "no lo sé"'; self.guardar()
        base = [g for g in self.leer_generado() if g.get('fuente') == 'contexto']
        random.Random(17).shuffle(base)
        hechas = {h(g['pregunta']) for g in self.leer_generado() if g.get('fuente') == 'nosabe'}
        for g in base:
            if self.parar() or self.e['fases'].get('nosabe', 0) >= objetivo:
                break
            if h(g['pregunta']) in hechas:
                continue
            try:
                resp = self.chat([{'role': 'system', 'content': 'Eres APOLO, el asistente personal de Demon. Hablas de tú, español, cercano y directo.'},
                                  {'role': 'user', 'content': f'Demon te pregunta: "{g["pregunta"]}"\nNO tienes ese dato apuntado en tu memoria. Respóndele en 1-2 frases: '
                                   'dile con naturalidad que eso no lo tienes apuntado (o no lo sabes) y pídele que te lo cuente para recordarlo. '
                                   'PROHIBIDO dar ningún dato, nombre, cifra o suposición. Solo la respuesta, sin comillas.'}], maximo=120, temp=.8)
            except Exception as er:
                self.e['error'] = str(er)[:200]; time.sleep(3); continue
            resp = resp.strip().strip('"«»')
            q_norm = _norm(g['pregunta'])
            inventa = any(_norm(t).strip(".,'\"«»") not in q_norm for t in re.findall(r"[A-ZÁÉÍÓÚÑ][\w\-\.]+|\w*\d[\w\.,%]*", resp)
                          if _norm(t).strip(".,'\"«»") not in COMUNES | {'no', 'eso', 'esa', 'ese', 'lo', 'pues', 'oye', 'uf', 'vaya', 'perdona', 'cuentame', 'me', 'ahora', 'ni', 'mmm', 'hmm', 'que', 'dime', 'ese', 'sabes'})
            if (len(resp) < 10 or len(resp) > 260 or inventa or MULETILLA.search(resp) or URL.search(resp)
                    or not re.search(r'\bno (lo |la |los |las |me )?(tengo|s[eé]|recuerdo|consta|aparece|apunt)|\bni idea\b|no tengo (ese|esa|eso)', resp, re.I)):
                self.e['descartadas'] += 1; continue
            self.escribir('nosabe', g['pregunta'], resp, 5, {'origen': g['origen'], 'tipo': g.get('tipo', 'hecho'), 'sin_origen': True})
            hechas.add(h(g['pregunta']))

    def fase_general(self, objetivo):
        """v2: charla general escrita por la PROPIA base (preguntas y respuestas) para que el entrenamiento no le haga olvidar lo que sabía."""
        if objetivo <= 0:
            return
        self.e['fase'] = 'conservando lo que ya sabía'; self.guardar()
        modelo_ant = self.a.modelo; self.a.modelo = self.a.modelo_general
        temas = ['ciencia', 'historia', 'tecnología y ordenadores', 'consejos prácticos del día a día', 'cocina', 'salud y deporte (general)', 'matemáticas sencillas',
                 'idiomas y palabras', 'geografía', 'música y cine', 'motor y mecánica', 'videojuegos', 'dinero y ahorro', 'escritura y redacción', 'lógica y acertijos']
        try:
            for i in range(200):
                if self.parar() or self.e['fases'].get('general', 0) >= objetivo:
                    break
                tema = temas[i % len(temas)]
                try:
                    qs = self.chat_json([{'role': 'user', 'content': f'Escribe 12 preguntas distintas y variadas en español sobre {tema}, como las haría una persona normal a un asistente '
                                          '(algunas cortas, algunas pidiendo explicación o una lista breve). JSON {"preguntas":["...", ...]}'}], 900).get('preguntas', [])
                except Exception as er:
                    self.e['error'] = str(er)[:200]; time.sleep(3); continue
                for q in qs:
                    if self.parar() or self.e['fases'].get('general', 0) >= objetivo:
                        break
                    q = str(q).strip()
                    if len(q) < 6 or h(q) in self.ya:
                        continue
                    try:
                        resp = self.chat([{'role': 'system', 'content': 'Responde en español, claro y breve (2-6 frases o una lista corta). Sin títulos.'}, {'role': 'user', 'content': q}], maximo=380, temp=.6)
                    except Exception as er:
                        self.e['error'] = str(er)[:200]; continue
                    if len(resp) < 15 or MALA.search(resp) or TITULO.search(resp) or URL.search(resp):
                        self.e['descartadas'] += 1; continue
                    self.escribir('general', q, resp, 4)
        finally:
            self.a.modelo = modelo_ant

    def montar(self):
        """apolo-train.jsonl / apolo-val.jsonl: reales (ya separados por sesión) + generados (5 % a validación)."""
        sysmsg = self.m.get('system', 'Eres APOLO, el asistente personal de tu usuario.')
        if getattr(self.a, 'ligero', False):   # v5: IGUAL que sistemaLigero() de core/agente.js (si cambia allí, cambiar aquí)
            sysmsg += '\nTú eres APOLO. Tu usuario es la persona que te escribe: la memoria de abajo habla de ÉL, no de ti (si se llama de otra forma, ese es SU nombre, no el tuyo).'
        gen = [g for g in self.leer_generado() if not self.confunde(g)]
        if getattr(self.a, 'contexto', 0):   # v3: fuera los pares con papeles cruzados ("mi GPU…", "me llamo DMNENGINE") salvo si hablan de APOLO
            gen = [g for g in gen if g.get('fuente') not in ('recuerdo', 'basico', 'contexto') or 'APOLO' in g['respuesta'] + g.get('origen', '')
                   or not (YO_R.search(g['respuesta']) or (TU_Q.search(g['pregunta']) and g.get('fuente') == 'contexto'))]
            gen = [g for g in gen if g.get('fuente') != 'contexto' or anclada(g['respuesta'], g.get('origen', ''))]
            gen = [g for g in gen if not (g.get('fuente') == 'identidad' and re.search(r'\bdemon(io)?\b', g['pregunta'], re.I))]   # v4: le hablaban a APOLO como "demonio"
        random.seed(7)
        val_gen = set(random.sample(range(len(gen)), max(1, len(gen) // 20))) if gen else set()
        recs = [x for x in self.m.get('recuerdos', []) if not TAPADO.search(x['t'])]
        perfil = [x for x in recs if x.get('tipo') == 'perfil']
        rnd = random.Random(13)
        def memoria(g):
            # como memoria.contexto() de APOLO: unos cuantos de perfil + el recuerdo de origen entre otros de relleno
            otros = rnd.sample(perfil, min(3, len(perfil))) + rnd.sample(recs, min(4, len(recs)))
            po = set(re.findall(r'\w{5,}', _norm(g['origen'])))
            parecido = lambda t: len(po & set(re.findall(r'\w{5,}', _norm(t)))) >= max(2, len(po) // 3)   # v5: en "no lo sé" no puede colarse el dato por otro recuerdo
            lineas = [x for x in otros if x['t'] != g['origen'] and not (g.get('sin_origen') and parecido(x['t']))]
            if not g.get('sin_origen'):
                lineas.append({'t': g['origen'], 'tipo': g.get('tipo', 'hecho')})
            rnd.shuffle(lineas)
            return '\n\nLO QUE SABES DEL USUARIO (memoria):\n' + '\n'.join(f'- [{rnd.randrange(16**4):04x}·{x.get("tipo", "hecho")}] {x["t"][:300]}' for x in lineas)
        def ej(q, r, g=None):
            s = sysmsg + (memoria(g) if g and g.get('origen') else '')
            return json.dumps({'messages': [{'role': 'system', 'content': s}, {'role': 'user', 'content': q}, {'role': 'assistant', 'content': r}]}, ensure_ascii=False)
        # v3: quién es también SIN system (que "soy APOLO" quede en los pesos, no solo en el prompt)
        sin_sys = [json.dumps({'messages': [{'role': 'user', 'content': g['pregunta']}, {'role': 'assistant', 'content': g['respuesta']}]}, ensure_ascii=False)
                   for g in gen if g.get('fuente') in ('identidad', 'nombre')] if getattr(self.a, 'contexto', 0) else []
        # conversaciones reales: en trozos que quepan en max_length (~2.800 caracteres ≈ 800 tokens); si un mensaje del usuario
        # es enorme se recorta SU parte, nunca la respuesta (si no, Soup rechaza el ejemplo: "no causal-loss target")
        def trozos(msgs, maxc=2800):
            sysm = msgs[0] if msgs and msgs[0]['role'] == 'system' else {'role': 'system', 'content': sysmsg}
            pares = [(msgs[i], msgs[i + 1]) for i in range(1 if msgs[0]['role'] == 'system' else 0, len(msgs) - 1, 2)
                     if msgs[i]['role'] == 'user' and msgs[i + 1]['role'] == 'assistant']
            out, cur, n = [], [], 0
            for u, r in pares:
                r = {'role': 'assistant', 'content': r['content'][:1600]}
                u = {'role': 'user', 'content': u['content'] if len(u['content']) + len(r['content']) <= maxc else u['content'][:max(300, maxc - len(r['content']))] + '…'}
                t = len(u['content']) + len(r['content'])
                if cur and n + t > maxc:
                    out.append([sysm] + cur); cur, n = [], 0
                cur += [u, r]; n += t
            if cur:
                out.append([sysm] + cur)
            return [json.dumps({'messages': x}, ensure_ascii=False) for x in out]
        train = [t for x in self.m.get('reales_train', []) for t in trozos(x)] + [ej(g['pregunta'], g['respuesta'], g) for k, g in enumerate(gen) if k not in val_gen] + sin_sys
        val = [t for x in self.m.get('reales_val', []) for t in trozos(x)] + [ej(g['pregunta'], g['respuesta'], g) for k, g in enumerate(gen) if k in val_gen]
        random.shuffle(train)
        open(os.path.join(self.dir, 'apolo-train.jsonl'), 'w', encoding='utf-8').write('\n'.join(train) + '\n')
        open(os.path.join(self.dir, 'apolo-val.jsonl'), 'w', encoding='utf-8').write('\n'.join(val) + '\n')
        self.e['dataset'] = {'train': len(train), 'val': len(val), 'reales': len(self.m.get('reales_train', [])) + len(self.m.get('reales_val', [])), 'generados': len(gen)}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dir', default='/srv/entrenamiento/apolo')
    p.add_argument('--objetivo', type=int, default=1200)
    p.add_argument('--url', required=True, help='Ollama maestro, p. ej. http://<host>:11434')
    p.add_argument('--usuario', default='tu usuario', help='nombre con el que el usuario habla a APOLO')
    p.add_argument('--modelo', default='qwen3:8b')
    p.add_argument('--nota', type=int, default=4)
    p.add_argument('--identidad', type=int, default=150)
    p.add_argument('--recuerdos', type=int, default=2000)
    p.add_argument('--tuyas', action='store_true', help='usar también sus preguntas reales en la charla')
    p.add_argument('--basico', type=int, default=0, help='v2: pares de lo básico (perfil/personas)')
    p.add_argument('--general', type=int, default=0, help='v2: charla general escrita por la base')
    p.add_argument('--modelo-general', default='qwen3:4b-instruct-2507-q4_K_M')
    p.add_argument('--nosabe', type=int, default=0, help='v5: "no lo tengo apuntado" cuando el dato no está en la memoria')
    p.add_argument('--ligero', action='store_true', help='v5: system igual al del modo ligero de APOLO (agente.js sistemaLigero)')
    p.add_argument('--nombre', type=int, default=0, help='v4: pares de quién es quién (APOLO ≠ Demon)')
    p.add_argument('--contexto', type=int, default=0, help='v3: pares que se responden leyendo la memoria inyectada en el system')
    p.add_argument('--solo-montar', action='store_true')
    a = p.parse_args()
    try:
        os.remove(os.path.join(a.dir, 'parar'))
    except FileNotFoundError:
        pass
    g = Gen(a)
    if a.solo_montar:
        g.montar(); g.e['activo'] = False; g.e['fase'] = 'montado'; g.guardar(); sys.exit(0)
    try:
        g.run()
    except Exception as er:
        g.e['activo'] = False; g.e['fase'] = 'error'; g.e['error'] = str(er)[:300]; g.guardar(); raise
