const { redactar } = require('./seguridad');
function normalizar(out) {
  const objeto = out && typeof out === 'object';
  const texto = redactar(String(objeto ? out.texto ?? '' : out ?? ''), { patrones: false });
  const salida = texto.match(/\[c[oó]digo de salida (-?\d+)\]/i);
  const exitCode = objeto && out.exitCode !== undefined ? out.exitCode : salida ? +salida[1] : undefined;
  let estado = objeto ? out.estado : undefined;
  if (!['exito', 'error', 'denegado', 'incierto', 'desconocido'].includes(estado)) estado = objeto && out.ok === false ? 'error' : 'desconocido';
  if (estado !== 'incierto' && /^(error\s*:|DENEGADO\b|⚠)/i.test(texto)) estado = /^DENEGADO/i.test(texto) ? 'denegado' : 'error';
  if (Number.isInteger(exitCode) && estado !== 'incierto') estado = exitCode === 0 ? 'exito' : 'error';
  return { estado, codigo: objeto ? String(out.codigo || '') : '', texto, exitCode,
    verificado: estado === 'exito' && objeto && out.verificado === true,
    evidencias: objeto && Array.isArray(out.evidencias) ? out.evidencias.map(e => redactar(String(e))) : [],
    imagenes: objeto && Array.isArray(out.imagenes) ? out.imagenes : [], reintentable: objeto && out.reintentable === true };
}
const fallo = r => ['error', 'denegado', 'incierto'].includes(r.estado);
function exito(texto, evidencias = []) { return { estado: 'exito', texto, verificado: evidencias.length > 0, evidencias }; }
module.exports = { normalizar, fallo, exito };
