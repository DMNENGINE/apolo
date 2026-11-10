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
URL = re.compile(r"https?://|www\.|\b[\w-]+\.(com|net|org|io|engine|app|dev)\b", re.I)


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
        body = {'model': self.a.modelo, 'think': False, 'stream': False, 'keep_alive': '5m', 'messages': messages,
                'options': {'num_predict': maximo, 'temperature': temp}}
        if json_mode:
            body['format'] = 'json'
        req = urllib.request.Request(self.a.url.rstrip('/') + '/api/chat', data=json.dumps(body).encode(), headers={'content-type': 'application/json'})
        with urllib.request.urlopen(req, timeout=300) as r:
            j = json.load(r)
        return re.sub(r"<think>[\s\S]*?</think>", '', j.get('message', {}).get('content', '')).strip()

    def chat_json(self, messages, maximo=900):
        t = self.chat(messages, True, maximo, .5)
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
                 '"papeles": true si confunde quién es quién (el USUARIO se llama Demon; el asistente es APOLO y nunca dice que él es Demon), ') if recuerdo else ''
        j = self.chat_json([{'role': 'system', 'content': 'Eres un revisor muy estricto de datos de entrenamiento. En estos diálogos el USUARIO es Demon y el ASISTENTE es APOLO.'},
                            {'role': 'user', 'content': f'TEXTO DE ORIGEN:\n{fuente_texto}\n\nPREGUNTA (de Demon): {q}\nRESPUESTA (de APOLO): {r}\n\n'
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
                                    {'role': 'user', 'content': 'Escribe 8 pares pregunta/respuesta. Las preguntas son lo que tu usuario (Demon) te diría sobre ti: quién eres, cómo eres, qué te importa, '
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
                r = self.chat_json([{'role': 'system', 'content': 'Eres APOLO, el asistente personal de tu usuario. Tu usuario se llama Demon: él te habla y tú le respondes. '
                                     'Tú NO eres Demon. Los recuerdos son cosas que sabes DE ÉL (de su vida, su gente, sus gustos y proyectos). Tu forma de ser:\n' + voz},
                                    {'role': 'user', 'content': 'Estos son recuerdos tuyos sobre Demon:\n' + '\n'.join(f'{k}. [{x["tipo"]}] {x["t"]}' for k, x in enumerate(lote)) +
                                     '\n\nPara CADA recuerdo escribe 2 pares distintos: una pregunta natural que Demon te haría (informal, como él escribe, hablándote de tú) cuya respuesta sea ese recuerdo, '
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

    def montar(self):
        """apolo-train.jsonl / apolo-val.jsonl: reales (ya separados por sesión) + generados (5 % a validación)."""
        sysmsg = self.m.get('system', 'Eres APOLO, el asistente personal de tu usuario.')
        gen = self.leer_generado()
        random.seed(7)
        val_gen = set(random.sample(range(len(gen)), max(1, len(gen) // 20))) if gen else set()
        def ej(q, r):
            return json.dumps({'messages': [{'role': 'system', 'content': sysmsg}, {'role': 'user', 'content': q}, {'role': 'assistant', 'content': r}]}, ensure_ascii=False)
        train = [json.dumps({'messages': x}, ensure_ascii=False) for x in self.m.get('reales_train', [])] + [ej(g['pregunta'], g['respuesta']) for k, g in enumerate(gen) if k not in val_gen]
        val = [json.dumps({'messages': x}, ensure_ascii=False) for x in self.m.get('reales_val', [])] + [ej(g['pregunta'], g['respuesta']) for k, g in enumerate(gen) if k in val_gen]
        random.shuffle(train)
        open(os.path.join(self.dir, 'apolo-train.jsonl'), 'w', encoding='utf-8').write('\n'.join(train) + '\n')
        open(os.path.join(self.dir, 'apolo-val.jsonl'), 'w', encoding='utf-8').write('\n'.join(val) + '\n')
        self.e['dataset'] = {'train': len(train), 'val': len(val), 'reales': len(self.m.get('reales_train', [])) + len(self.m.get('reales_val', [])), 'generados': len(gen)}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dir', default='/srv/entrenamiento/apolo')
    p.add_argument('--objetivo', type=int, default=1200)
    p.add_argument('--url', default='http://192.168.1.86:11434')
    p.add_argument('--modelo', default='qwen3:8b')
    p.add_argument('--nota', type=int, default=4)
    p.add_argument('--identidad', type=int, default=150)
    p.add_argument('--recuerdos', type=int, default=2000)
    p.add_argument('--tuyas', action='store_true', help='usar también sus preguntas reales en la charla')
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
