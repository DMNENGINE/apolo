// Mission Control ligero: quién está trabajando ahora (GET /v1/agentes + eventos 'agente' del SSE). Sin el mundo 3D del panel.
// rueda = elegir agente · toque = detalle (y Detener si está trabajando)
const ESTADO = { trabajando: ['ok vivo', 'trabajando'], listo: ['ok', 'listo'], incompleto: ['aviso', 'incompleto'], error: ['mal', 'error'], cancelado: ['aviso', 'cancelado'], quieto: ['', 'en espera'] };
const crono = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
const modeloCorto = m => String(m || '').split('/').pop().replace(/^claude-/, '').slice(0, 18);

let os, lista, cab, agentes = new Map(), tReloj = 0, tPintar = 0;

function pintar() {
  const L = [...agentes.values()].sort((a, b) => ((b.estado === 'trabajando') - (a.estado === 'trabajando')) || ((b.inicio || 0) - (a.inicio || 0))).slice(0, 40);
  const trab = L.filter(a => a.estado === 'trabajando').length;
  cab.innerHTML = `<span class="chip">${trab} trabajando</span><span class="chip">${agentes.size} agentes</span>`;
  lista.poner(L.map(a => {
    const [cls, txt] = ESTADO[a.estado] || ESTADO.quieto;
    const dur = a.estado === 'trabajando' ? Date.now() - (a.inicio || Date.now()) : (a.fin || 0) - (a.inicio || 0);
    return {
      id: a.id, ico: `<span class="punto ${cls}"></span>`, clase: a.estado === 'trabajando' ? '' : 'apagada',
      titulo: `${a.padre ? '⤷ ' : ''}${a.nombre || a.id}`,
      sub: a.estado === 'trabajando' ? (a.herramienta?.nombre ? `${a.herramienta.nombre}${a.herramienta.resumen ? ': ' + a.herramienta.resumen : ''}` : 'pensando…') : `${txt} · ${modeloCorto(a.modelo)}`,
      der: dur > 0 ? crono(dur) : '',
      accion: () => detalle(a.id),
    };
  }));
}
const pronto = () => { clearTimeout(tPintar); tPintar = setTimeout(pintar, 250); };   // los eventos llegan a ráfagas

function detalle(id) {
  const a = agentes.get(id); if (!a) return;
  const [, txt] = ESTADO[a.estado] || ESTADO.quieto;
  const uso = a.uso ? ` · ${Math.round(((a.uso.entrada || 0) + (a.uso.salida || 0)) / 1000)}k tokens` : '';
  const ops = [];
  if (a.estado === 'trabajando' && !a.externo) ops.push(['Detener', async () => {
    try { await os.api(`/v1/sesiones/${encodeURIComponent(a.id)}/cancelar`, { method: 'POST' }); os.toast('Detenido'); } catch (e) { os.aviso('No se pudo', e.message); }
  }, 'peligro']);
  ops.push(['Volver', () => {}]);
  os.carta({ titulo: a.nombre || a.id, nota: `${txt} · ${modeloCorto(a.modelo)} · ${a.pasos || 0} pasos${uso}`,
    texto: a.estado === 'trabajando' && a.herramienta?.nombre ? `Ahora: ${a.herramienta.nombre}\n${a.herramienta.resumen || ''}` : String(a.ultimo || '(sin resumen)').replace(/[#*_`>]/g, '').slice(0, 300),
    opciones: ops });
}

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-cab"></div><div class="m-lista"></div>';
    cab = el.querySelector('.m-cab');
    lista = os.crearLista(el.querySelector('.m-lista'), { vacio: 'Nadie ha trabajado todavía.' });
    agentes = new Map((await os.api('/v1/agentes')).map(a => [a.id, a]));
    pintar();
    tReloj = setInterval(() => { if ([...agentes.values()].some(a => a.estado === 'trabajando')) pintar(); }, 1000);   // cronómetros
  },
  tecla: t => lista?.tecla(t),
  evento(e) { if (e.tipo === 'agente' && e.agente) { agentes.set(e.agente.id, e.agente); pronto(); } },
  cerrar() { clearInterval(tReloj); clearTimeout(tPintar); lista = null; },
};
