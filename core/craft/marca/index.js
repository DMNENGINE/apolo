// Letrero de marca animado (arriba en los clips): lo monta EffectCraft con letrero.jsx y los iconos de iconos.py, y lo
// renderiza a un bucle de 6 s con transparencia (ProRes 4444). Se hace una vez por nombre y se reutiliza.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const DIR = __dirname;
const BUCLE = 6;                                       // segundos del bucle (DUR en letrero.jsx)

function cliEffectCraft(mcpLocales) {
  const s = mcpLocales?.obtener?.('effectcraft');
  if (s?.comando) return s.comando;
  const def = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'EffectCraft', 'effectcraft-cli.exe');
  return fs.existsSync(def) ? def : null;
}

const ejecutar = (cmd, args, timeout) => new Promise((ok, mal) => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 << 20, encoding: 'utf8' },
  (e, out, err) => (e ? mal(new Error(`${path.basename(cmd)}: ${(err || out || e.message).trim().slice(-300)}`)) : ok(out))));

// devuelve la ruta del .mov; lo crea si no existe (≈ 20 s). nombre1 en blanco + nombre2 en cian
async function asegurarLetrero({ nombre1 = 'LAGC', nombre2 = 'TRUCKS', carpeta, mcpLocales, python = 'python' }) {
  const clave = `${nombre1}${nombre2}`.replace(/[^\p{L}\d]/gu, '').toLowerCase() || 'marca';
  const mov = path.join(carpeta, `letrero-${clave}.mov`);
  if (fs.existsSync(mov)) return mov;
  const cli = cliEffectCraft(mcpLocales);
  if (!cli) throw new Error('para el letrero animado hace falta EffectCraft (no está instalado)');
  fs.mkdirSync(carpeta, { recursive: true });
  const iconos = path.join(DIR, 'iconos');
  if (!fs.existsSync(path.join(iconos, 'youtube.png'))) await ejecutar(python, [path.join(DIR, 'iconos.py'), iconos], 120_000);
  // el .jsx con las variables delante (el script las lee si existen)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'letrero-'));
  const jsx = path.join(tmp, 'letrero.jsx'), proyecto = path.join(tmp, 'letrero.ecproj');
  const v = (k, x) => `var ${k} = ${JSON.stringify(String(x).replace(/\\/g, '/'))};\n`;
  fs.writeFileSync(jsx, v('NOMBRE1', nombre1) + v('NOMBRE2', nombre2) + v('DIR_ICONOS', iconos) + v('SALIDA_PROYECTO', proyecto) + fs.readFileSync(path.join(DIR, 'letrero.jsx'), 'utf8'));
  try {
    await ejecutar(cli, ['--empty', 'script', jsx], 120_000);
    const parcial = mov + '.tmp.mov';
    await ejecutar(cli, ['--project', proyecto, 'render', '--comp', 'Letrero', '--out', parcial, '--format', 'prores', '--prores', '4444', '--channels', 'rgba', '--audio', 'off'], 600_000);
    fs.renameSync(parcial, mov);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
  return mov;
}

module.exports = { asegurarLetrero, BUCLE };
