const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const CODIGO = /\.(js|mjs|cjs|ts|tsx|jsx|py|ps1|bat|cmd|sh|c|cc|cpp|h|hpp|cs|java|go|rs|php|rb|lua|kt|swift|sql|gd)$/i;
const TEXTO = /\.(txt|md|csv|log|json|xml)$/i;
function admiteArchivo(archivo, tipo) {
  return tipo === 'codigo' ? CODIGO.test(archivo) : ['lectora','ia'].includes(tipo) && (TEXTO.test(archivo) || CODIGO.test(archivo));
}
function extraerArchivo(archivo, tipo) {
  archivo = path.resolve(archivo);
  if (!admiteArchivo(archivo,tipo)) throw new Error('Ese formato no tiene un extractor de texto compatible con esta araña. Elige texto o código; no se usará otra pestaña.');
  const estado = fs.statSync(archivo);
  if (!estado.isFile()) throw new Error('Elige un archivo, no una carpeta');
  if (estado.size > 8 * 1024 * 1024) throw new Error('El archivo supera 8 MB; divídelo antes de analizarlo');
  const b = fs.readFileSync(archivo);
  let texto = b[0] === 255 && b[1] === 254 ? b.subarray(2).toString('utf16le') : b.toString('utf8').replace(/^\uFEFF/,'');
  if (texto.includes('\0')) throw new Error('El archivo parece binario; no se analizará como texto');
  // HTML se abre en el visor para extraer el texto visible, no las etiquetas.
  if (/\.html?$/i.test(archivo)) throw new Error('Abre el HTML en el navegador y ejecuta la araña desde esa página');
  if (!texto.trim()) throw new Error('El archivo está vacío');
  return { titulo:path.basename(archivo),url:pathToFileURL(archivo).href,completo:texto,caracteresPagina:texto.length,de:'archivo',
    bloques:[{i:0,t:tipo === 'codigo'?'codigo':'texto',texto}] };
}
module.exports = { admiteArchivo, extraerArchivo };
