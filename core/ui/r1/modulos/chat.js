// Chat: la conversación con APOLO (por defecto la de la isla, que es donde va lo que dices en la R1), en vivo.
// rueda = desplazar · toque = opciones (conversación nueva, ver otra) · mantener = hablar (lo pone la R1 entera)
const limpiar = t => String(t || '').replace(/```[\s\S]*?```/g, '[código]').replace(/[#*_`>]/g, '').replace(/\n{3,}/g, '\n\n').trim();

let os, caja, sesionId = '', siguiendo = true, tCarga = 0;

// conversaciones de verdad: sin las de tareas automáticas (tarea: true), subagentes (padre) ni internas
const deVerdad = s => !s.tarea && !s.padre && !s.soloLectura && !['eval', 'subagente', 'conciencia', 'consejo', 'dashboard'].includes(s.canal);
async function laDeLaIsla() {
  const L = await os.api('/v1/sesiones');
  return L.filter(s => s.canal === 'isla' && deVerdad(s)).sort((a, b) => (b.actualizada || 0) - (a.actualizada || 0))[0]?.id || '';
}
async function cargar(id, resolver = true) {
  if (siguiendo && resolver) id = await laDeLaIsla();
  sesionId = id;
  if (!id) { caja.innerHTML = '<p class="vacio">Aún no hay conversación. Mantén el botón y habla con APOLO.</p>'; return; }
  const s = await os.api(`/v1/sesiones/${encodeURIComponent(id)}`);
  const msgs = (s.mensajes || []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-30);
  caja.innerHTML = `<p class="ch-tit">${os.esc(s.titulo || 'Conversación')}</p>` + (msgs.length ? msgs.map(m =>
    `<div class="burbuja ${m.role === 'user' ? 'yo' : 'el'}">${os.esc(limpiar(m.content).slice(0, 900))}</div>`).join('') : '<p class="vacio">Conversación vacía.</p>');
  caja.scrollTop = caja.scrollHeight;
}
// resolver: volver a buscar cuál es la conversación de la isla (la lista de sesiones es larga: solo cuando empieza otra)
const recargar = (resolver = false) => { clearTimeout(tCarga); tCarga = setTimeout(() => cargar(sesionId, resolver).catch(() => { }), 300); };

async function otras() {
  const L = (await os.api('/v1/sesiones')).filter(deVerdad)
    .sort((a, b) => (b.actualizada || 0) - (a.actualizada || 0)).slice(0, 8);
  os.carta({ titulo: 'Conversaciones', opciones: [
    ['● La de la isla (en vivo)', () => { siguiendo = true; cargar(''); }],
    ...L.map(s => [`${(s.titulo || s.id).slice(0, 26)} · ${os.hace(s.actualizada || s.creada)}`, () => { siguiendo = false; cargar(s.id); }]),
  ] });
}

export default {
  muestraRespuestas: true,                         // la respuesta ya sale aquí: sin el globo de abajo
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="ch-caja"></div>';
    caja = el.querySelector('.ch-caja');
    siguiendo = true;
    await cargar('');
  },
  tecla(t) {
    if (t === 'arriba' || t === 'abajo') { caja.scrollBy({ top: t === 'arriba' ? -90 : 90, behavior: 'smooth' }); return true; }
    if (t === 'toque') {
      os.carta({ titulo: 'Chat', texto: 'Mantén el botón para hablarle a APOLO.', opciones: [
        ['Conversación nueva', async () => { try { await os.decir('/nueva'); siguiendo = true; setTimeout(() => cargar(''), 800); } catch (e) { os.aviso('No se pudo', e.message); } }],
        ['Ver otra conversación', () => otras().catch(e => os.aviso('No se pudo', e.message))],
        ['Volver', () => {}],
      ] });
      return true;
    }
    return false;
  },
  evento(e) {
    if (!['inicio', 'fin', 'error'].includes(e.tipo)) return;
    if (e.sesion === sesionId) recargar();
    else if (siguiendo && e.tipo === 'inicio') recargar(true);   // puede haber empezado otra conversación en la isla
  },
  cerrar() { clearTimeout(tCarga); },
};
