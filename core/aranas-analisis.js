// Fragmentos completos y referencias verificables para los análisis de página.
function lotesDeBloques(bloques, max = 10000) {
  const lotes = []; let lote = [], tamano = 0, ref = 0;
  for (const b of bloques) {
    const texto = String(b.texto || '');
    for (let inicio = 0; inicio < texto.length; inicio += 5000) {
      const parte = texto.slice(inicio, inicio + 5000), unidad = { ref: ref++, i: b.i, texto: parte, inicio };
      if (lote.length && tamano + parte.length > max) { lotes.push(lote); lote = []; tamano = 0; }
      lote.push(unidad); tamano += parte.length;
    }
  }
  if (lote.length) lotes.push(lote);
  return lotes;
}
const normalizar = texto => String(texto || '').replace(/\s+/g, ' ').trim();
function evidenciaLiteral(unidad, frase) {
  const f = normalizar(frase);
  return f.length >= 4 && normalizar(unidad.texto).includes(f);
}
function probabilidad(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, Math.min(100, Math.round(valor))) : null;
}
module.exports = { lotesDeBloques, evidenciaLiteral, probabilidad };
