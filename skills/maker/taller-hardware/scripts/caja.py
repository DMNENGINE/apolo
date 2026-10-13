"""Genera la caja imprimible de un proyecto con Blender en segundo plano.
uso: python scripts/caja.py <params.json> <carpeta de salida>
params.json (mm): {"nombre": "estacion-clima", "interior": [80, 60, 35], "pared": 2.4, "base": 2.0, "radio": 3,
  "agujeros": [{"cara": "frente|atras|izq|der|abajo|tapa", "forma": "rect|circulo", "x": 0, "y": 0, "ancho": 12, "alto": 7, "diametro": 6, "nombre": "USB-C"}],
  "postes": [{"x": -30, "y": -20, "alto": 5, "diametro": 6, "tornillo": 2.5}], "ventilacion": true}
Busca blender.exe (BLENDER o Program Files\\Blender Foundation\\*). Imprime un JSON con las rutas de los STL y la vista."""
import glob, json, os, shutil, subprocess, sys

def blender():
    for c in (os.environ.get('BLENDER'), shutil.which('blender')):
        if c and os.path.exists(c): return c
    pf = [os.environ.get('ProgramFiles', r'C:\Program Files'), os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')]
    cands = sorted(glob.glob(os.path.join(pf[0], 'Blender Foundation', '*', 'blender.exe')) + glob.glob(os.path.join(pf[1], 'Blender Foundation', '*', 'blender.exe')))
    for c in ('/usr/bin/blender', '/Applications/Blender.app/Contents/MacOS/Blender'):
        if os.path.exists(c): cands.append(c)
    return cands[-1] if cands else None

if __name__ == '__main__':
    if len(sys.argv) < 3: sys.exit(__doc__)
    params, salida = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    b = blender()
    if not b: sys.exit('No encuentro Blender. Instálalo (blender.org) o pon su ruta en la variable BLENDER.')
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'caja_blender.py')
    r = subprocess.run([b, '-b', '--factory-startup', '--python', script, '--', params, salida], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    linea = next((l for l in r.stdout.splitlines() if l.startswith('CAJA_JSON ')), None)
    if not linea:
        err = [l for l in (r.stdout + r.stderr).splitlines() if 'Error' in l or 'Traceback' in l or 'error' in l]
        sys.exit('Blender no generó la caja:\n' + '\n'.join(err[-15:] or (r.stdout + r.stderr).splitlines()[-15:]))
    print(json.dumps(json.loads(linea[10:]), ensure_ascii=False, indent=1))
