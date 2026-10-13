"""Cliente de ProtoForja para APOLO (solo biblioteca estándar).
uso:
  python scripts/pf.py opciones "<idea>" [principiante|experto]
  python scripts/pf.py proyecto "<idea>" '<json de la opción elegida>' [principiante|experto]
  python scripts/pf.py lista
  python scripts/pf.py ver <id>
Configuración (la primera que exista):
  variables PROTOFORJA_URL y PROTOFORJA_CLAVE · o el archivo _datos/protoforja.json de la skill: {"url": "...", "clave": "pf_..."}
Sin clave también funciona, pero el proyecto no se guarda en la cuenta del usuario."""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def conf():
    c = {}
    try:
        with open(os.path.join(RAIZ, '_datos', 'protoforja.json'), encoding='utf-8') as f: c = json.load(f)
    except Exception: pass
    url = os.environ.get('PROTOFORJA_URL') or c.get('url') or 'https://protoforja.com'
    return url.rstrip('/'), os.environ.get('PROTOFORJA_CLAVE') or c.get('clave') or ''

def api(ruta, metodo='GET', cuerpo=None, timeout=300):
    url, clave = conf()
    req = urllib.request.Request(url + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers={'content-type': 'application/json', 'user-agent': 'APOLO-protoforja/1.0', **({'authorization': 'Bearer ' + clave} if clave else {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try: msg = json.loads(e.read().decode('utf-8')).get('error')
        except Exception: msg = ''
        sys.exit(f'ProtoForja respondió {e.code}: {msg or e.reason}' + (' (¿la clave es correcta? créala en la web → Mi cuenta)' if e.code == 401 else ''))
    except urllib.error.URLError as e:
        sys.exit(f'No pude conectar con ProtoForja en {url}: {e.reason}')

def coste(c): return f"{c.get('min', '?')}–{c.get('max', '?')} {c.get('moneda', '')}".strip() if c else 'sin precio'

def markdown(p, url):
    l = [f"# {p.get('nombre')}", p.get('resumen', ''), '']
    if p.get('bloques'): l += [f"`{p['bloques']}`", '']
    l += [f"Coste: {coste(p.get('coste'))} · dificultad: {p.get('dificultad', '?')} · {p.get('horas', '?')} h", '']
    l += ['## Piezas'] + [f"- {x.get('cantidad', 1)} × {x.get('nombre')} — {x.get('para', '')}" for x in p.get('piezas', [])] + ['']
    l += ['## Conexiones'] + [f"- {c.get('desde')} → {c.get('hasta')} ({c.get('senal', '')}) {c.get('nota', '')}" for c in p.get('conexiones', [])] + ['']
    a = p.get('alimentacion') or {}
    l += ['## Alimentación', f"{a.get('fuente', '')} · {a.get('total_ma', '?')} mA {a.get('autonomia', '')}", '']
    k = p.get('codigo') or {}
    l += [f"## Código ({k.get('archivo', '')}, {k.get('plataforma', '')})", f"Librerías: {', '.join(k.get('librerias') or [])}", '```', k.get('contenido', ''), '```', k.get('instrucciones', ''), '']
    l += ['## Montaje'] + [f"{i}. {s}" for i, s in enumerate(p.get('montaje', []), 1)] + ['']
    if p.get('seguridad'): l += ['## Seguridad'] + [f"- {s}" for s in p['seguridad']] + ['']
    l += ['## Caja (parámetros para scripts/caja.py de la skill taller-hardware)', json.dumps({'nombre': p.get('slug', 'proyecto'), **(p.get('caja') or {})}, ensure_ascii=False)]
    if p.get('id'): l += ['', f"En la web (caja 3D y STL): {url}/app?proyecto={p['id']}"]
    return '\n'.join(l)

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    url, clave = conf()
    if a[0] == 'opciones' and len(a) >= 2:
        r = api('/api/opciones', 'POST', {'idea': a[1], 'perfil': a[2] if len(a) > 2 else 'principiante'})
        print(f"Entendido: {r.get('entendido', '')}\n")
        for o in r.get('opciones', []):
            print(f"[{o['nivel']}] {o['titulo']} — {coste(o.get('coste'))} — {o.get('dificultad', '')}, {o.get('horas', '?')} h\n  {o.get('resumen', '')}")
            print(f"  hace: {'; '.join(o.get('que_hace', []))}\n  piezas: {'; '.join(o.get('piezas_clave', []))}")
        print('\nOPCIONES_JSON ' + json.dumps(r.get('opciones', []), ensure_ascii=False))
    elif a[0] == 'proyecto' and len(a) >= 3:
        perfil = a[3] if len(a) > 3 else 'principiante'
        # la opción: JSON, ruta a un .json con ella, o solo el nivel (economica|normal|avanzada) → se vuelven a pedir las opciones
        if a[2] in ('economica', 'económica', 'normal', 'avanzada'):
            ops = api('/api/opciones', 'POST', {'idea': a[1], 'perfil': perfil}).get('opciones', [])
            opcion = next((o for o in ops if o.get('nivel') == a[2].replace('ó', 'o')), ops[1] if len(ops) > 1 else None)
        else:
            try: opcion = json.load(open(a[2], encoding='utf-8')) if os.path.isfile(a[2]) else json.loads(a[2])
            except Exception: sys.exit('El tercer argumento debe ser el JSON de la opción elegida (la línea OPCIONES_JSON de "opciones"), un archivo con él, o el nivel: economica / normal / avanzada.')
        if isinstance(opcion, list): opcion = opcion[0] if opcion else None
        p = api('/api/proyecto', 'POST', {'idea': a[1], 'opcion': opcion, 'perfil': perfil})
        if p.get('nombre') == 'No disponible': sys.exit(p.get('resumen', 'No se puede diseñar este proyecto.'))
        print(markdown(p, url)); print('\n' + ('Guardado en la cuenta del usuario.' if p.get('id') else 'No se guardó en ninguna cuenta (falta la clave).'))
    elif a[0] == 'lista':
        if not clave: sys.exit('Falta la clave de ProtoForja (web → Mi cuenta → Crear clave).')
        ps = api('/api/proyectos').get('proyectos', [])
        print(f'{len(ps)} proyecto(s):')
        for p in ps: print(f"- {p['id']} · {p['nombre']} · {p.get('nivel') or ''} · {coste(p.get('coste'))} · {p.get('origen')} — {p['idea'][:100]}")
    elif a[0] == 'ver' and len(a) >= 2:
        print(markdown(api('/api/proyectos/' + urllib.request.quote(a[1])), url))
    else: sys.exit(__doc__)
