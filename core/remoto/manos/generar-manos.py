#!/usr/bin/env python3
"""Generador del dataset de APOLO-MANOS (usar herramientas). Corre DENTRO del CT107 (Proxmox), no depende del PC.

El maestro (modelo abierto del Ollama del CT100) escribe escenarios: pedido de Demon → llamadas a herramientas (1-2 pasos)
→ resultado realista de cada una → respuesta final basada SOLO en esos resultados. Se valida todo sin juez:
argumentos contra el esquema real de la herramienta, shell solo de lectura, y la respuesta anclada a los resultados.
Salida: manos-train.jsonl / manos-val.jsonl en formato tool-calling de Soup (forma OpenAI: tool_calls + role tool + tools).
Solo librería estándar. Reanudable; se para creando el archivo "parar".
"""
import argparse, hashlib, json, os, random, re, sys, time, unicodedata, urllib.request

LECTURA_SHELL = re.compile(r"^\s*(Get-ChildItem|gci|dir|ls|Get-Content|gc|type|cat|Get-Process|Get-Date|ipconfig|ping|Get-PSDrive|Get-Volume|nvidia-smi|systeminfo|"
                           r"Get-ComputerInfo|Test-Path|Select-String|Get-Service|hostname|whoami|Get-NetIPAddress|Get-CimInstance|Get-WmiObject|python --version|node --version|"
                           r"git (status|log|diff|branch)|Get-Item|Measure-Object|Resolve-DnsName|Test-NetConnection|Get-Disk|Get-Uptime|wsl -l|winget list)\b", re.I)
PELIGRO_SHELL = re.compile(r"Remove-|\bdel\b|\brm\b|\brmdir\b|Set-|Stop-|Start-Process|New-Item|Out-File|>\s*\S|Invoke-WebRequest|iwr\b|curl\b|format\b|Restart-|shutdown|"
                           r"Clear-|Move-Item|Copy-Item|Rename-Item|reg (add|delete)|git (push|reset|checkout|commit)|pip install|npm i|winget install|Invoke-Expression|iex\b", re.I)
URL = re.compile(r"https?://\S+")

# contexto del entorno del usuario (rutas, máquinas, webs): vive en <dir>/contexto.txt (privado, no va al repo)
CONTEXTO_GENERICO = "Usuario de Windows 11 con proyectos en D:\\Proyectos y documentos en su carpeta de usuario; tiene una Raspberry Pi y un servidor Proxmox en su red local."

# formato REAL de lo que devuelven las herramientas de APOLO (core/herramientas.js), para que los resultados se parezcan
FORMATOS = """Formato real de los resultados:
- listar: una entrada por línea; las carpetas acaban en "/" (p. ej. "core/\\nmain.js\\npackage.json"); vacía = "(vacía)".
- leer_archivo: líneas numeradas "1\\t<línea>"; si hay más: "…(240 líneas en total)".
- shell: la salida tal cual de PowerShell.
- web: el texto de la página (sin HTML).
- buscar_memoria: una línea por recuerdo "<id> [<tipo>] <texto>" (id de 4-6 letras/números); nada = "(sin resultados)".
- recordar: "recuerdo <id> guardado".
- buscar_historial: "[12/11/2026, 10:30:00 · usuario] <texto>" por línea; nada = "(no encontré nada)".
- programar_tarea: "tarea <id> creada (<cuándo>); próxima: 12/11/2026, 9:00:00".
- ver_tareas: "<id> · ● <nombre> · aviso · <cuándo>" por línea; nada = "(no hay tareas)".
- navegador_abrir: "abierta <url> en la pestaña <n>". navegador_pestanas: "<id> · <título> · <url>" por línea.
- ver_skills: "<nombre> (activa) — <descripción>" por línea."""


def _norm(t):
    return ''.join(c for c in unicodedata.normalize('NFD', str(t).lower()) if unicodedata.category(c) != 'Mn')


def h(t):
    return hashlib.sha1(re.sub(r"\W+", " ", str(t).lower()).strip().encode()).hexdigest()[:16]


COMUNES = {'si', 'no', 'tu', 'tus', 'tienes', 'hay', 'demon', 'apolo', 'es', 'el', 'la', 'los', 'las', 'un', 'una', 'en', 'de', 'y', 'con', 'para', 'por', 'lo', 'te', 'se',
           'listo', 'hecho', 'vale', 'ok', 'aqui', 'ahi', 'he', 'ya', 'te', 'mira', 'son', 'esta', 'estan', 'tambien', 'pero', 'como', 'que', 'cual', 'nada', 'todo'}


def anclada(resp, fuentes):
    """Todo nombre propio, ruta o cifra de la respuesta tiene que salir de los resultados de las herramientas o del pedido."""
    o = _norm(fuentes)
    for t in re.findall(r"[A-ZÁÉÍÓÚÑ][\w\-\.:\\/]+|\w*\d[\w\.,%:\\/\-]*", resp):
        n = _norm(t).strip(".,:;'\"«»()")
        if n in COMUNES or len(n) < 2:
            continue
        if n not in o:
            return False
    return True


def valida_args(args, esquema):
    """Argumentos contra el esquema real: obligatorios, tipos, enums y nada que no exista."""
    if not isinstance(args, dict):
        return False
    props, req = esquema.get('properties', {}), esquema.get('required', [])
    if any(k not in args for k in req) or any(k not in props for k in args):
        return False
    tipos = {'string': str, 'number': (int, float), 'boolean': bool, 'object': dict, 'array': list}
    for k, v in args.items():
        p = props[k]
        t = tipos.get(p.get('type'))
        if t and not isinstance(v, t) or (p.get('type') == 'number' and isinstance(v, bool)):
            return False
        if 'enum' in p and v not in p['enum']:
            return False
    return True


class Gen:
    def __init__(self, a):
        self.a, self.dir = a, a.dir
        fc = os.path.join(self.dir, 'contexto.txt')
        self.contexto = open(fc, encoding='utf-8').read().strip() if os.path.exists(fc) else CONTEXTO_GENERICO
        self.tools = json.load(open(os.path.join(self.dir, 'herramientas.json'), encoding='utf-8'))
        self.por = {t['function']['name']: t['function'] for t in self.tools}
        self.salida = os.path.join(self.dir, 'generado.jsonl')
        prev = self.leer()
        self.ya = {h(x['pedido']) for x in prev}
        self.e = {'activo': True, 'fase': 'escribiendo escenarios', 'hechas': len(prev), 'objetivo': a.objetivo, 'descartadas': 0, 'motivos': {}, 'error': '',
                  'por_herramienta': {}, 'pid': os.getpid(), 'desde': time.time(), 'maestro': f'{a.modelo} @ {a.url}'}
        for x in prev:
            for p in x['pasos']:
                self.e['por_herramienta'][p['herramienta']] = self.e['por_herramienta'].get(p['herramienta'], 0) + 1
        self.guardar()

    def leer(self):
        try:
            return [json.loads(l) for l in open(self.salida, encoding='utf-8') if l.strip()]
        except FileNotFoundError:
            return []

    def guardar(self):
        p = os.path.join(self.dir, 'estado.json'); json.dump(self.e, open(p + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False); os.replace(p + '.tmp', p)

    def parar(self):
        return os.path.exists(os.path.join(self.dir, 'parar'))

    def chat_json(self, messages, maximo=2200, temp=.8):
        body = {'model': self.a.modelo, 'think': False, 'stream': False, 'keep_alive': '5m', 'format': 'json', 'messages': messages,
                'options': {'num_predict': maximo, 'temperature': temp}}
        req = urllib.request.Request(self.a.url.rstrip('/') + '/api/chat', data=json.dumps(body).encode(), headers={'content-type': 'application/json'})
        with urllib.request.urlopen(req, timeout=400) as r:
            t = json.load(r).get('message', {}).get('content', '')
        t = re.sub(r"<think>[\s\S]*?</think>", '', t).strip()
        try:
            return json.loads(t)
        except Exception:
            return json.loads(t[t.find('{'):t.rfind('}') + 1])

    def descartar(self, motivo):
        self.e['descartadas'] += 1; self.e['motivos'][motivo] = self.e['motivos'].get(motivo, 0) + 1

    def revisar(self, esc):
        """None si vale; si no, el motivo."""
        pedido, pasos, resp = str(esc.get('pedido', '')).strip(), esc.get('pasos') or [], str(esc.get('respuesta', '')).strip()
        if len(pedido) < 6 or len(resp) < 8 or not isinstance(pasos, list) or not 1 <= len(pasos) <= 3:
            return 'forma'
        if h(pedido) in self.ya:
            return 'repetido'
        fuentes = pedido
        for p in pasos:
            if not isinstance(p, dict):
                return 'forma'
            n, args, res = p.get('herramienta'), p.get('args'), p.get('resultado')
            if n not in self.por:
                return 'herramienta inexistente'
            if isinstance(args, str):
                try:
                    args = json.loads(args); p['args'] = args
                except Exception:
                    return 'args no json'
            if not valida_args(args, self.por[n]['parameters']):
                return 'args fuera de esquema'
            if n == 'shell' and (not LECTURA_SHELL.search(args.get('comando', '')) or PELIGRO_SHELL.search(args.get('comando', ''))):
                return 'shell no es de lectura'
            if not isinstance(res, str) or len(res.strip()) < 2:
                p['resultado'] = res = json.dumps(res, ensure_ascii=False) if res is not None else ''
                if len(res) < 2:
                    return 'sin resultado'
            fuentes += '\n' + json.dumps(args, ensure_ascii=False) + '\n' + res
        if not anclada(resp, fuentes):
            return 'respuesta no anclada'
        if re.search(r'\b(no tengo acceso|no puedo (acceder|ejecutar)|como (ia|modelo))\b', resp, re.I):
            return 'se niega'
        for u in URL.findall(resp):
            if _norm(u.rstrip('.,)')) not in _norm(fuentes):
                return 'url inventada'
        return None

    def juez(self, esc):
        """Juez estricto: ¿la herramienta encaja con el pedido y la respuesta es correcta según los resultados (sin errores de unidades, fechas…)?"""
        pasos = '\n'.join(f'{k + 1}. {p["herramienta"]} {json.dumps(p["args"], ensure_ascii=False)} → {str(p["resultado"])[:700]}' for k, p in enumerate(esc['pasos']))
        try:
            j = self.chat_json([{'role': 'system', 'content': 'Eres un revisor muy estricto de datos de entrenamiento de un asistente que usa herramientas. Devuelves SOLO JSON.'},
                                {'role': 'user', 'content': f'PEDIDO: {esc["pedido"]}\nPASOS:\n{pasos}\nRESPUESTA FINAL: {esc["respuesta"]}\n\n'
                                 'JSON {"herramienta_adecuada": true si las herramientas elegidas son las lógicas para ese pedido (p. ej. para ver qué hay en una carpeta, '
                                 'listar; para algo del pasado, buscar_historial), "resultado_creible": true si el resultado es lo que devolvería esa herramienta con esos args, '
                                 '"respuesta_correcta": true si la respuesta responde al pedido y TODO lo que dice sale bien de los resultados (sin confundir bytes con segundos, '
                                 'fechas, cantidades…)}'}], 200, temp=.1)
        except Exception:
            return 'juez sin respuesta'
        for k in ('herramienta_adecuada', 'resultado_creible', 'respuesta_correcta'):
            if not j.get(k):
                return 'juez: ' + k
        return None

    def run(self):
        nombres = list(self.por)
        i = 0
        while self.e['hechas'] < self.a.objetivo and not self.parar():
            n = min(nombres, key=lambda k: (self.e['por_herramienta'].get(k, 0), random.random()))   # la menos cubierta primero
            f = self.por[n]
            ahora = time.strftime('%Y-%m-%d %H:%M', time.localtime(time.time() + random.randint(-90, 90) * 86400))
            extra = random.choice(['', ' Uno de ellos necesita 2 pasos (p. ej. listar y luego leer_archivo, o buscar_memoria y luego recordar).',
                                   ' Uno de ellos puede usar otra herramienta de la lista si encaja mejor.'])
            lista = '\n'.join(f'- {k}: {v["description"]} params={json.dumps(v["parameters"].get("properties", {}), ensure_ascii=False)} obligatorios={v["parameters"].get("required", [])}'
                              for k, v in self.por.items())
            try:
                r = self.chat_json([{'role': 'system', 'content': 'Generas datos de entrenamiento para APOLO, el asistente de Demon en su PC. Español. Devuelves SOLO JSON válido.'},
                                    {'role': 'user', 'content': f'{self.contexto}\n\nHora actual: {ahora}.\n\nHERRAMIENTAS:\n{lista}\n\n{FORMATOS}\n\n'
                                     f'Escribe 4 escenarios DISTINTOS donde Demon pide algo que APOLO resuelve con la herramienta "{n}".{extra}\n'
                                     'Cada escenario: "pedido" (como escribe Demon: informal, de tú, a veces con faltas), "pasos" (lista de {"herramienta","args","resultado"}: '
                                     'args EXACTOS según el esquema, sin claves inventadas; "resultado" = la salida REALISTA que devolvería la herramienta: listados, texto, '
                                     'salida de PowerShell, "ok"/"guardado", etc.), y "respuesta" = lo que APOLO le dice a Demon al final, 1-3 frases, usando SOLO lo que '
                                     'dicen los resultados (no inventes nada fuera de ellos). shell: SOLO comandos de lectura (Get-ChildItem, Get-Content, Get-Process, ipconfig, '
                                     'ping, nvidia-smi, Test-Path, Select-String, git status…), nunca borrar, mover, instalar ni cambiar nada. programar_tarea: "en" con formato '
                                     'YYYY-MM-DDTHH:mm calculado desde la hora actual. JSON {"escenarios":[{"pedido":"...","pasos":[{"herramienta":"...","args":{...},"resultado":"..."}],"respuesta":"..."}]}'}])
            except Exception as er:
                self.e['error'] = str(er)[:200]; self.guardar(); time.sleep(5); continue
            for esc in (r.get('escenarios') or []) if isinstance(r, dict) else []:
                if not isinstance(esc, dict):
                    continue
                motivo = self.revisar(esc) or self.juez(esc)
                if motivo:
                    self.descartar(motivo); continue
                esc['ahora'] = ahora
                with open(self.salida, 'a', encoding='utf-8') as fo:
                    fo.write(json.dumps(esc, ensure_ascii=False) + '\n')
                self.ya.add(h(esc['pedido'])); self.e['hechas'] += 1
                for p in esc['pasos']:
                    self.e['por_herramienta'][p['herramienta']] = self.e['por_herramienta'].get(p['herramienta'], 0) + 1
            self.e['error'] = ''; i += 1; self.guardar()
        self.montar()
        self.e['activo'] = False; self.e['fase'] = 'parado' if self.parar() else 'terminado'; self.e['fin'] = time.time(); self.guardar()

    def montar(self):
        """manos-train/val.jsonl en forma OpenAI (tool_calls + role tool) con el system del modo manos de APOLO."""
        filas = []
        for k, esc in enumerate(self.leer()):
            sysm = SYSTEM_MANOS.format(ahora=esc.get('ahora', ''))
            msgs = [{'role': 'system', 'content': sysm}, {'role': 'user', 'content': esc['pedido']}]
            for j, p in enumerate(esc['pasos']):
                cid = f'call_{k}_{j}'
                msgs.append({'role': 'assistant', 'content': '', 'tool_calls': [{'id': cid, 'type': 'function',
                             'function': {'name': p['herramienta'], 'arguments': json.dumps(p['args'], ensure_ascii=False)}}]})
                msgs.append({'role': 'tool', 'tool_call_id': cid, 'name': p['herramienta'], 'content': str(p['resultado'])[:3000]})
            msgs.append({'role': 'assistant', 'content': esc['respuesta']})
            filas.append(json.dumps({'messages': msgs, 'tools': self.tools}, ensure_ascii=False))
        random.Random(7).shuffle(filas)
        nv = max(1, len(filas) // 20)
        open(os.path.join(self.dir, 'manos-val.jsonl'), 'w', encoding='utf-8').write('\n'.join(filas[:nv]) + '\n')
        open(os.path.join(self.dir, 'manos-train.jsonl'), 'w', encoding='utf-8').write('\n'.join(filas[nv:]) + '\n')
        self.e['dataset'] = {'train': len(filas) - nv, 'val': nv}


# IGUAL que sistemaManos() de core/agente.js (si cambia allí, cambiar aquí)
SYSTEM_MANOS = ('Eres APOLO, el asistente personal de tu usuario en su PC (Windows). Usa tus herramientas para hacer lo que te pide y respóndele '
                'en español, directo y breve, contando SOLO lo que digan los resultados. Ahora (hora local): {ahora}.')

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dir', default='/srv/entrenamiento/apolo/manos')
    p.add_argument('--objetivo', type=int, default=1500)
    p.add_argument('--url', required=True)
    p.add_argument('--modelo', default='qwen3:8b')
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
