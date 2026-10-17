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

// "#00d9ff" → [0, 0.85, 1] (los .jsx trabajan con colores 0..1)
const rgb = hex => (/^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map(i => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4)) : null);
// variables de color del kit para los .jsx (las que no estén, el .jsx usa las suyas)
function varsColor(colores) {
  const out = {};
  for (const [k, c] of [['COLOR_ACENTO', colores?.acento], ['COLOR_TEXTO', colores?.primario], ['COLOR_FONDO', colores?.fondo]]) { const v = rgb(c); if (v) out[k] = v; }
  return out;
}

// pieza animada con transparencia a partir de un .jsx: el .jsx con las variables delante → EffectCraft la monta y la renderiza
// a ProRes 4444 → WebM VP9 con alfa (FilmCraft lo lee; ~0,5 MB en vez de ~90). Lo codifica ffmpeg: el WebM que saca EffectCraft
// cambia el color de los primeros fotogramas. Una por contenido (clave = hash de las variables y del .jsx); las de más de 30 días se borran.
async function renderJsx({ plantilla, comp, prefijo, vars, carpeta, mcpLocales, ffmpeg = 'ffmpeg' }) {
  const clave = require('crypto').createHash('sha1').update(JSON.stringify([vars, fs.statSync(path.join(DIR, plantilla)).mtimeMs])).digest('hex').slice(0, 12);
  const mov = path.join(carpeta, `${prefijo}-${clave}.webm`);
  if (fs.existsSync(mov)) return mov;
  const cli = cliEffectCraft(mcpLocales);
  if (!cli) throw new Error(`para el ${prefijo} animado hace falta EffectCraft (no está instalado)`);
  fs.mkdirSync(carpeta, { recursive: true });
  try { for (const n of fs.readdirSync(carpeta)) { const f = path.join(carpeta, n); if (n.startsWith(prefijo + '-') && Date.now() - fs.statSync(f).mtimeMs > 30 * 864e5) fs.rmSync(f, { force: true }); } } catch { }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${prefijo}-`));
  const jsx = path.join(tmp, plantilla), proyecto = path.join(tmp, `${prefijo}.ecproj`);
  const v = (k, x) => `var ${k} = ${JSON.stringify(typeof x === 'string' ? x.replace(/\\/g, '/') : x)};\n`;
  fs.writeFileSync(jsx, Object.entries({ ...vars, SALIDA_PROYECTO: proyecto }).map(([k, x]) => v(k, x)).join('') + fs.readFileSync(path.join(DIR, plantilla), 'utf8'));
  try {
    await ejecutar(cli, ['--empty', 'script', jsx], 120_000);
    const prores = path.join(tmp, `${prefijo}.mov`), parcial = mov + '.tmp.webm';
    await ejecutar(cli, ['--project', proyecto, 'render', '--comp', comp, '--out', prores, '--format', 'prores', '--prores', '4444', '--channels', 'rgba', '--audio', 'off'], 600_000);
    await ejecutar(ffmpeg, ['-v', 'error', '-y', '-i', prores, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '22', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', parcial], 600_000);
    fs.renameSync(parcial, mov);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
  return mov;
}

// título animado del principio (titulo.jsx). escala 2 = renderizado al doble (nítido también en la exportación 4K; en la
// línea de tiempo va al 50 %). colores = los del kit de marca (sin kit, los de LAGCTRUCKS)
// anchoMax = ancho máximo del texto en px a escala 1 (la placa mide 70 más): lo da la zona segura del kit
function asegurarTitulo({ linea1, linea2 = '', duracion = 3.5, escala = 1, colores, anchoMax, carpeta, mcpLocales, ffmpeg = 'ffmpeg' }) {
  const dur = Math.max(1.5, Math.min(8, +duracion || 3.5));
  return renderJsx({ plantilla: 'titulo.jsx', comp: 'Titulo', prefijo: 'titulo', carpeta, mcpLocales, ffmpeg,
    vars: { LINEA1: String(linea1), LINEA2: String(linea2 || ''), DURACION: +dur.toFixed(2), ESCALA: escala, ...(anchoMax ? { ANCHO_MAX: Math.round(anchoMax) } : {}), ...varsColor(colores) } });
}
const PLACA_TITULO = 70;

// rótulo animado (lower third, rotulo.jsx): NOMBRE grande + SUB (@usuario, cargo…) en las placas del kit. Mide 1080×300 (×escala).
// Geometría a escala 1: la barra va de X0−29 a X0−15; las placas, de X0 a X0 + 92 + texto (texto ≤ anchoMax)
const ALTO_ROTULO = 300, X0_ROTULO = 90;
function asegurarRotulo({ nombre, sub = '', duracion = 4, escala = 1, colores, fuente, anchoMax, carpeta, mcpLocales, ffmpeg = 'ffmpeg' }) {
  const dur = Math.max(2, Math.min(10, +duracion || 4));
  return renderJsx({ plantilla: 'rotulo.jsx', comp: 'Rotulo', prefijo: 'rotulo', carpeta, mcpLocales, ffmpeg,
    vars: { NOMBRE: String(nombre).toLocaleUpperCase('es'), SUB: String(sub || ''), DURACION: +dur.toFixed(2), ESCALA: escala, ...(anchoMax ? { ANCHO_MAX: Math.round(anchoMax) } : {}),
      ...(fuente?.familia ? { FUENTE: `${fuente.familia}-${fuente.estilo || 'Black'}` } : {}), ...varsColor(colores) } });
}

module.exports = { asegurarLetrero, asegurarTitulo, asegurarRotulo, renderJsx, varsColor, rgb, BUCLE, ALTO_ROTULO, X0_ROTULO, PLACA_TITULO };
