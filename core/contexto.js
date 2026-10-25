const { tokensAprox } = require('./compactar');
function ensamblar({ system, mensajes, herramientas, limite = 24000, reserva = 2048 }) {
  const fijos = tokensAprox(system) + tokensAprox(herramientas.map(h => ({ name: h.nombre, description: h.descripcion, parameters: h.parametros }))) + reserva;
  const reparados = []; let pendientes = new Map();
  const cerrar = () => { for (const id of pendientes.keys()) reparados.push({ role: 'tool', toolCallId: id, content: 'Resultado incierto tras una interrupcion. No repetir efectos sin consultar su estado o pedir conciliacion.' }); pendientes = new Map(); };
  for (const m of mensajes) {
    if (m.role !== 'tool') cerrar();
    reparados.push({ ...m, ...(m.role === 'tool' && m.estado ? { content: `[estado=${m.estado}; evidencias=${JSON.stringify(m.evidencias || [])}]\n${m.content || ''}` } : {}) });
    if (m.role === 'assistant') for (const c of m.toolCalls || []) pendientes.set(c.id, true);
    if (m.role === 'tool') pendientes.delete(m.toolCallId);
  }
  cerrar(); let lista = reparados;
  const imagenes = () => lista.reduce((n, m) => n + (m.imagenes || []).reduce((a, i) => a + Math.max(1024, Math.ceil((i.datos?.length || 0) / 4)), 0), 0);
  const cuenta = () => fijos + tokensAprox(lista.map(({ imagenes, ...m }) => m)) + imagenes();
  const podados = [];
  for (let i = 0; i < lista.length && cuenta() > limite; i++) {
    const m = lista[i];
    if (m.role !== 'tool') continue;
    const texto = String(m.content || '');
    if (texto.length > 900) {
      const extremos = texto.slice(0, 450) + '\n[extracto; resultado completo conservado en el historial/artefacto]\n' + texto.slice(-450);
      lista[i] = { ...m, content: extremos }; podados.push(i);
    }
    if (cuenta() > limite && lista[i].imagenes?.length) lista[i] = { ...lista[i], imagenes: undefined, content: lista[i].content + '\n[imagen omitida por presupuesto]' };
  }
  const estimados = cuenta();
  if (estimados > limite) throw Object.assign(new Error('contexto supera el presupuesto; divide la entrada o reduce herramientas'), { code: 'CONTEXTO_EXCEDIDO', estimados, limite });
  return { mensajes: lista, estimados, podados };
}
module.exports = { ensamblar };
