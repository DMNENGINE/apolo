// Memoria: lo que APOLO recuerda (las más recientes) y buscar por voz (modo 'dictado' del nodo: lo que dices vuelve aquí, no al chat).
// rueda = elegir · toque = leer entera / olvidar
const ICO = { preferencia: '♥', hecho: '•', proyecto: '▣', persona: '☺', instruccion: '!', tarea: '⏱' };

let os, lista, cab, busqueda = '', esperando = false;

function filas(L) {
  return L.map(m => ({
    id: m.id, ico: ICO[m.tipo] || '•', titulo: String(m.texto || '').replace(/\s+/g, ' ').slice(0, 90),
    sub: `${m.tipo || 'recuerdo'} · ${os.hace(m.actualizada || m.creada || Date.now())}`, accion: () => detalle(m),
  }));
}
async function recientes() {
  busqueda = '';
  const L = (await os.api('/v1/memoria?limite=60')).slice(0, 60);   // .slice: por si el núcleo aún no entiende ?limite
  cab.innerHTML = `<span class="chip">recientes</span><span class="chip">toca «Buscar» y habla</span>`;
  lista.poner([{ id: 'buscar', ico: '⌕', titulo: 'Buscar (dictar)', sub: 'mantén el botón y di qué buscas', accion: buscar }, ...filas(L)], false);
}
async function resultados(q) {
  busqueda = q;
  const L = await os.api(`/v1/memoria?q=${encodeURIComponent(q)}`);
  cab.innerHTML = `<span class="chip">«${os.esc(q.slice(0, 24))}»</span><span class="chip">${L.length} resultados</span>`;
  lista.poner([{ id: 'atras', ico: '←', titulo: 'Ver las recientes', accion: () => recientes() }, { id: 'buscar', ico: '⌕', titulo: 'Buscar otra cosa', accion: buscar }, ...filas(L)], false);
}
async function buscar() {
  try { await os.api(`/v1/nodos/${encodeURIComponent(await os.miNodo())}/modo`, { method: 'POST', body: JSON.stringify({ modo: 'dictado' }) }); }
  catch (e) { return os.aviso('Buscar', e.message); }
  esperando = true;
  os.carta({ titulo: 'Buscar en la memoria', texto: 'Mantén el botón y di qué buscas.\nEj.: "la impresora", "Brito", "mi PC"', opciones: [['Cancelar', cancelar]] });
}
function cancelar() {
  esperando = false;
  os.miNodo().then(id => os.api(`/v1/nodos/${encodeURIComponent(id)}/modo`, { method: 'POST', body: '{"modo":null}' })).catch(() => { });
}
function detalle(m) {
  os.carta({ titulo: m.tipo || 'Recuerdo', nota: `${m.usos || 0} usos · ${os.hace(m.actualizada || m.creada || Date.now())}`, texto: String(m.texto || '').slice(0, 500), opciones: [
    ['Volver', () => {}],
    ['Olvidar…', () => os.carta({ titulo: '¿Olvidar?', texto: String(m.texto || '').slice(0, 140), opciones: [['No', () => detalle(m)], ['Sí, olvidar', async () => {
      try { await os.api(`/v1/memoria/${encodeURIComponent(m.id)}`, { method: 'DELETE' }); os.toast('Olvidado'); busqueda ? resultados(busqueda) : recientes(); }
      catch (e) { os.aviso('No se pudo', e.message); }
    }, 'peligro']] }), 'peligro'],
  ] });
}

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-cab"></div><div class="m-lista"></div>';
    cab = el.querySelector('.m-cab');
    lista = os.crearLista(el.querySelector('.m-lista'), { vacio: 'Nada recordado todavía.' });
    await recientes();
  },
  tecla: t => lista?.tecla(t),
  alPtt(fase) { if (fase === 'fin' && esperando) { os.cerrarCarta(); os.toast('Buscando…'); return true; } return false; },
  nodo(m) {
    if (m.tipo !== 'dictado' || !esperando) return;
    esperando = false;
    if (m.texto) resultados(m.texto).catch(e => os.aviso('No se pudo', e.message));
    else os.toast('No te entendí');
  },
  cerrar() { if (esperando) cancelar(); lista = null; },
};
