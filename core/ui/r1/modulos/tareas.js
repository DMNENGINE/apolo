// Tareas: recordatorios y automatizaciones del núcleo (GET /v1/tareas). Toque = ejecutar ahora / pausar / activar.
// Para crear una: mantén el botón y díselo a APOLO ("recuérdame mañana a las 9…").
const hora = t => { const d = new Date(t); const hoy = new Date().toDateString() === d.toDateString();
  return `${hoy ? '' : d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) + ' '}${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })}`; };
function cuandoTxt(c = {}) {
  if (c.cron) return `cron ${c.cron}`;
  if (c.cada) return `cada ${c.cada}`;
  if (c.en) { const t = Date.parse(c.en); return Number.isNaN(t) ? String(c.en) : hora(t); }
  return '';
}
const proximaDe = t => (typeof t.proxima === 'number' ? t.proxima : t.proxima && Date.parse(t.proxima)) || 0;

let os, lista, cab, tareas = [];

async function cargar() {
  tareas = await os.api('/v1/tareas');
  tareas.sort((a, b) => (b.activa - a.activa) || ((proximaDe(a) || 9e15) - (proximaDe(b) || 9e15)));
  const act = tareas.filter(t => t.activa).length;
  cab.innerHTML = `<span class="chip">${act} activas</span><span class="chip">${tareas.length} en total</span>`;
  lista.poner([
    ...tareas.map(t => ({
      id: t.id, ico: `<span class="punto ${t.activa ? 'ok' : ''}"></span>`, clase: t.activa ? '' : 'apagada',
      titulo: t.nombre || t.accion?.texto || t.id,
      sub: proximaDe(t) ? `próxima: ${hora(proximaDe(t))}` : cuandoTxt(t.cuando) || (t.ultima ? `última: ${os.hace(t.ultima)}` : ''),
      der: t.ultima ? os.hace(t.ultima) : '', accion: () => detalle(t),
    })),
    { id: '+', ico: '+', titulo: 'Nueva tarea', sub: 'mantén el botón y díselo a APOLO', accion: () => os.aviso('Nueva tarea', 'Mantén el botón y dile a APOLO, por ejemplo:\n"recuérdame mañana a las 9 llamar al taller"\n"cada lunes a las 10 resúmeme el correo"') },
  ]);
}

function detalle(t) {
  os.carta({ titulo: t.nombre || 'Tarea', nota: `${t.activa ? 'activa' : 'pausada'} · ${cuandoTxt(t.cuando)}`,
    texto: [t.accion?.texto, t.ultimoResultado ? `Última vez: ${String(t.ultimoResultado).slice(0, 160)}` : ''].filter(Boolean).join('\n\n') || '(sin descripción)',
    opciones: [
      ['Ejecutar ahora', async () => { try { await os.api(`/v1/tareas/${encodeURIComponent(t.id)}/ejecutar`, { method: 'POST' }); os.toast('Ejecutando…'); setTimeout(() => cargar().catch(() => { }), 1500); } catch (e) { os.aviso('No se pudo', e.message); } }],
      [t.activa ? 'Pausar' : 'Activar', async () => { try { await os.api(`/v1/tareas/${encodeURIComponent(t.id)}`, { method: 'PATCH', body: JSON.stringify({ activa: !t.activa }) }); os.toast(t.activa ? 'Pausada' : 'Activada'); await cargar(); } catch (e) { os.aviso('No se pudo', e.message); } }],
      ['Volver', () => {}],
    ] });
}

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-cab"></div><div class="m-lista"></div>';
    cab = el.querySelector('.m-cab');
    lista = os.crearLista(el.querySelector('.m-lista'), { vacio: 'No hay tareas.' });
    await cargar();
  },
  tecla: t => lista?.tecla(t),
  evento(e) { if (e.tipo === 'tarea' || e.tipo === 'tareas' || e.tarea) cargar().catch(() => { }); },
  cerrar() { lista = null; },
};
