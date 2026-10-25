// Videos: YouTube y Rumble sin cuenta ni anuncios (core/medios en el PC: yt-dlp). Buscar por voz (modo 'dictado' del nodo),
// resultados con miniatura, y el vídeo a pantalla completa en el reproductor nativo de ApoloOS (R1.video).
// rueda = elegir · toque = ver · en el vídeo: toque = pausa, rueda = ±10 s, 2 toques = salir
const FUENTES = { youtube: 'YouTube', rumble: 'Rumble' };

let os, lista, cab, fuente = 'youtube', busqueda = '', esperando = false, vivo = 0;
const blobs = [];

function soltarBlobs() { while (blobs.length) URL.revokeObjectURL(blobs.pop()); }
// miniaturas: el PC las baja y las cachea; aquí llegan con el token y se enseñan como blob (la CSP no deja cargar webs de fuera)
async function miniaturas(items, turno) {
  for (const v of items) {
    if (turno !== vivo || !v.mini) continue;
    try {
      const r = await fetch(`/v1/medios/mini?u=${encodeURIComponent(v.mini)}`, { headers: { 'x-robot-token': os.token } });
      if (!r.ok || turno !== vivo) continue;
      const u = URL.createObjectURL(await r.blob()); blobs.push(u);
      v.img = u;
      pintar(items, turno, true);
    } catch { }
  }
}
let ultimas = [];
function pintar(items, turno, mantener = true) {
  if (turno !== vivo) return;
  ultimas = items;
  const otra = fuente === 'youtube' ? 'rumble' : 'youtube';
  lista.poner([
    { id: 'buscar', ico: '⌕', titulo: busqueda ? 'Buscar otra cosa' : `Buscar en ${FUENTES[fuente]}`, sub: 'mantén el botón y di qué quieres ver', accion: buscar },
    { id: 'fuente', ico: '⇄', titulo: `Cambiar a ${FUENTES[otra]}`, accion: () => { fuente = otra; busqueda ? resultados(busqueda) : inicio(); } },
    ...(busqueda ? [{ id: 'atras', ico: '←', titulo: 'Lo último que vi', accion: inicio }] : []),
    ...items.map(v => ({
      id: v.url, ico: v.img ? `<img class="v-mini" src="${v.img}" alt="">` : '<span class="v-mini v-vacia">▶</span>', clase: 'v-fila',
      titulo: v.titulo, sub: [v.canal, v.fecha].filter(Boolean).join(' · '), der: v.duracion || '', accion: () => ver(v),
    })),
  ], mantener);
}

async function inicio() {
  busqueda = ''; const turno = ++vivo; soltarBlobs();
  cab.innerHTML = `<span class="chip">${FUENTES[fuente]}</span><span class="chip">lo último que viste</span>`;
  const h = (await os.api('/v1/medios/historial').catch(() => [])).filter(v => !fuente || v.fuente === fuente).slice(0, 15);
  pintar(h, turno, false);
  miniaturas(h, turno);
}
async function resultados(q) {
  busqueda = q; const turno = ++vivo; soltarBlobs();
  cab.innerHTML = `<span class="chip">${FUENTES[fuente]}</span><span class="chip">«${os.esc(q.slice(0, 22))}»</span>`;
  lista.poner([{ id: 'c', ico: '…', titulo: 'Buscando…' }], false);
  try {
    const r = (await os.api(`/v1/medios/buscar?fuente=${fuente}&q=${encodeURIComponent(q)}`)).resultados || [];
    pintar(r, turno, false);
    miniaturas(r, turno);
  } catch (e) { if (turno === vivo) { pintar([], turno, false); os.aviso('No pude buscar', e.message); } }
}
async function ver(v) {
  if (!os.nativo?.video) return os.aviso('Videos', 'Actualiza ApoloOS en la R1 para ver vídeos.');
  os.toast(`Cargando «${String(v.titulo).slice(0, 30)}»…`, 6);
  try {
    const s = await os.api('/v1/medios/stream', { method: 'POST', body: JSON.stringify({ url: v.url, titulo: v.titulo, canal: v.canal, duracion: v.duracion, mini: v.mini }) });
    os.nativo.video(JSON.stringify(s));
  } catch (e) { os.aviso('No pude abrirlo', e.message); }
}
async function buscar() {
  try { await os.api(`/v1/nodos/${encodeURIComponent(await os.miNodo())}/modo`, { method: 'POST', body: JSON.stringify({ modo: 'dictado' }) }); }
  catch (e) { return os.aviso('Buscar', e.message); }
  esperando = true;
  os.carta({ titulo: `Buscar en ${FUENTES[fuente]}`, texto: 'Mantén el botón y di qué quieres ver.\nEj.: "lofi para estudiar", "noticias de hoy"', opciones: [['Cancelar', cancelar]] });
}
function cancelar() {
  esperando = false;
  os.miNodo().then(id => os.api(`/v1/nodos/${encodeURIComponent(id)}/modo`, { method: 'POST', body: '{"modo":null}' })).catch(() => { });
}

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-cab"></div><div class="m-lista"></div>';
    cab = el.querySelector('.m-cab');
    lista = os.crearLista(el.querySelector('.m-lista'));
    await inicio();
  },
  tecla: t => lista?.tecla(t),
  alPtt(fase) { if (fase === 'fin' && esperando) { os.cerrarCarta(); os.toast('Buscando…'); return true; } return false; },
  nodo(m) {
    if (m.tipo !== 'dictado' || !esperando) return;
    esperando = false;
    if (m.texto) resultados(m.texto); else os.toast('No te entendí');
  },
  cerrar() { if (esperando) cancelar(); vivo++; soltarBlobs(); lista = null; },
};
