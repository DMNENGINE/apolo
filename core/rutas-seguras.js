// Destinos reales: los permisos no pueden depender del nombre de un enlace.
const fs = require('fs');
const path = require('path');
const autorizadas = new WeakMap();

function validarRuta(f) {
  const absoluta = path.resolve(String(f));
  if (absoluta.includes('\0')) throw new Error('ruta no valida');
  if (process.platform === 'win32') {
    // Resolver UNC antes de aprobar podria autenticar contra un servidor remoto.
    if (/^\\\\/.test(absoluta)) throw new Error('ruta de red o dispositivo no permitida');
    const partes = absoluta.slice(path.parse(absoluta).root.length).split(/[\\/]/);
    if (partes.some(p => /:|[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('ruta especial de Windows no permitida');
  }
  return absoluta;
}

function rutaReal(f) {
  let actual = validarRuta(f);
  const faltan = [];
  for (;;) {
    let existe = true;
    try { fs.lstatSync(actual); }
    catch (e) { if (e.code !== 'ENOENT') throw e; existe = false; }
    // Un enlace roto no se confunde con una carpeta que aun no existe.
    if (existe) return validarRuta(path.join(fs.realpathSync(actual), ...faltan));
    const padre = path.dirname(actual);
    if (padre === actual) throw new Error('no se puede resolver la ruta');
    faltan.unshift(path.basename(actual)); actual = padre;
  }
}

function dentro(f, base) {
  const rel = path.relative(base, f);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
}

function prepararRuta(cwd, ruta = '.') {
  const absoluta = validarRuta(path.resolve(cwd || '.', String(ruta)));
  return { absoluta, real: rutaReal(absoluta) };
}
function autorizarRuta(args, destino) { autorizadas.set(args, Object.freeze({ ...destino })); }
function comprobarRuta(cwd, args) {
  const actual = prepararRuta(cwd, args.ruta ?? '.');
  const previa = autorizadas.get(args);
  if (previa && (previa.absoluta !== actual.absoluta || previa.real !== actual.real)) throw new Error('la ruta cambio despues del permiso; solicita un permiso nuevo');
  return actual.real;
}

module.exports = { validarRuta, rutaReal, dentro, prepararRuta, autorizarRuta, comprobarRuta };
