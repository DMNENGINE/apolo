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


def h(t):
    return hashlib.sha1(re.sub(r"\W+", " ", str(t).lower()).strip().encode()).hexdigest()[:16]


class Gen:
    def __init__(self, a):
        self.a, self.dir = a, a.dir
        self.m = json.load(open(os.path.join(self.dir, 'material.json'), encoding='utf-8'))
        self.salida = os.path.join(self.dir, 'generado.jsonl')
        prev = self.leer_generado()
        self.ya = {h(x['pregunta']) for x in prev}
        self.e = {'activo': True, 'fase': 'preparando', 'hechas': len(prev), 'objetivo': a.objetivo, 'descartadas': 0, 'error': '',
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
        cola = []
        # 1) preguntas reales que se entienden solas
        self.e['fase'] = 'eligiendo tus preguntas'; self.guardar()
        for t in m.get('preguntas', []):
            if self.parar() or len(cola) + self.e['hechas'] >= a.objetivo:
                break
            if h(t) in self.ya:
                continue
            try:
                r = self.chat([{'role': 'system', 'content': 'Respondes solo SI o NO.'}, {'role': 'user', 'content':
                               '¿Este mensaje se puede contestar bien SIN ver la conversación anterior ni el ordenador del usuario (es una pregunta general o de opinión, '
                               f'se entiende sola y no nombra cosas que no conoces)?\n\n"{t}"'}], maximo=4, temp=0).upper()
                if r.startswith('SI') or r.startswith('SÍ'):
                    cola.append(('tuya', t)); self.ya.add(h(t))
            except Exception as er:
                self.e['error'] = str(er)[:200]
        # 2) preguntas nuevas sobre sus temas, con su forma de escribir
        self.e['fase'] = 'escribiendo preguntas de tus temas'; self.guardar()
        mem = list(m.get('memorias', [])); random.shuffle(mem)
        estilo = m.get('estilo', [])
        i = 0
        while len(cola) + self.e['hechas'] < a.objetivo * 1.25 and not self.parar() and i < 600:
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
                    if isinstance(t, str) and len(t) > 6 and h(t) not in self.ya:
                        self.ya.add(h(t)); cola.append(('sus temas', t))
            except Exception as er:
                self.e['error'] = str(er)[:200]
        # 3) respuestas como APOLO + juez
        self.e['fase'] = 'respondiendo como APOLO'; self.guardar()
        with open(self.salida, 'a', encoding='utf-8') as f:
            for fuente, q in cola:
                if self.parar() or self.e['hechas'] >= a.objetivo:
                    break
                try:
                    resp = self.chat([{'role': 'system', 'content': sys_apolo}, *ejemplos, {'role': 'user', 'content': q}], maximo=550)
                    if len(resp) < 15 or MALA.search(resp) or TITULO.search(resp):
                        self.e['descartadas'] += 1; continue
                    j = self.chat_json([{'role': 'system', 'content': 'Eres un revisor exigente de datos de entrenamiento. Puntúas la respuesta de un asistente llamado APOLO.'},
                                        {'role': 'user', 'content': f'PREGUNTA: {q}\n\nRESPUESTA: {resp}\n\nDevuelve JSON {{"inventa": true si afirma datos o explica cosas que probablemente no existen o no puede saber, '
                                         '"plantilla": true si parece un folleto de chatbot (títulos, listas de ventajas), "nota": 1-5 (5 = útil, correcta, natural y con personalidad)}'}], 120)
                    nota = 1 if (j.get('inventa') or j.get('plantilla')) else int(j.get('nota') or 0)
                    if nota < a.nota:
                        self.e['descartadas'] += 1; continue
                    f.write(json.dumps({'fuente': fuente, 'pregunta': q, 'respuesta': resp, 'modelo': a.modelo, 'nota': nota, 't': time.time()}, ensure_ascii=False) + '\n'); f.flush()
                    self.e['hechas'] += 1; self.e['error'] = ''
                except Exception as er:
                    self.e['error'] = str(er)[:200]; time.sleep(5)
                self.e['ultima'] = time.time()
                self.guardar()
        self.montar()
        self.e['fase'] = 'parado' if self.parar() else 'terminado'
        self.e['activo'] = False; self.e['fin'] = time.time(); self.guardar()

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
