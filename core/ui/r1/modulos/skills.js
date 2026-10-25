// Skills de la R1 (las que llevan canales: ['r1']): dictar una nueva, activarla, usarla o borrarla.
// Crear: "Nueva skill" pone el nodo en modo 'crear-skill' → lo siguiente que digas lo redacta el taller → llega 'skill-borrador'
// (r1.js se lo pasa a este módulo aunque ya no esté abierto).
let os, lista = null, cab = null, esperando = false;

async function cargar() {
  if (!lista) return;
  const L = ((await os.api('/v1/skills')).skills || []).filter(s => (s.canales || []).includes('r1'))
    .sort((a, b) => (b.activa - a.activa) || String(a.nombre || a.slug).localeCompare(b.nombre || b.slug));
  cab.innerHTML = `<span class="chip">${L.filter(s => s.activa).length} activas</span><span class="chip">${L.length} skills R1</span>`;
  lista.poner([
    { id: '+', ico: '+', titulo: 'Nueva skill (dictar)', sub: 'mantén el botón y di qué debe hacer', accion: nueva },
    ...L.map(s => ({ id: s.slug, ico: `<span class="punto ${s.activa ? 'ok' : ''}"></span>`, clase: s.activa ? '' : 'apagada',
      titulo: s.nombre || s.slug, sub: s.activa ? s.descripcion || '' : `borrador · escaneo ${s.escaneo?.nivel || 'pendiente'}`, accion: () => ver(s) })),
  ]);
}
function ver(s, nueva = false) {
  const opciones = s.activa
    ? [['Usar ahora', () => usar(s)], ['Desactivar', () => activar(s, false)], ['Volver', () => {}]]
    : [['Activar', () => activar(s, true)], [nueva ? 'Luego' : 'Volver', () => {}], ['Borrar', () => borrar(s), 'peligro']];
  os.carta({ titulo: nueva ? 'Skill nueva' : s.nombre || s.slug, texto: `${nueva ? `${s.nombre || s.slug}: ` : ''}${s.descripcion || ''}`,
    nota: `${s.activa ? 'activa' : 'borrador'} · escaneo ${s.escaneo?.nivel || 'pendiente'}`, opciones });
}
async function activar(s, on) {
  try {
    const r = await os.api(`/v1/skills/${encodeURIComponent(s.slug)}`, { method: 'PATCH', body: JSON.stringify({ activa: on }) });
    os.hud(on ? 'SKILL ACTIVADA' : 'SKILL DESACTIVADA', 2, 'listo');
    await cargar();
    ver(r.skill || { ...s, activa: on });
  } catch (e) { os.aviso('No se pudo', on ? `${e.message}. Revísala en el panel del PC (Skills).` : e.message, () => ver(s)); }
}
function borrar(s) {
  os.carta({ titulo: '¿Borrar?', texto: s.nombre || s.slug, opciones: [['No', () => ver(s)], ['Sí, borrar', async () => {
    try { await os.api(`/v1/skills/${encodeURIComponent(s.slug)}`, { method: 'DELETE' }); os.hud('SKILL BORRADA', 2, 'listo'); await cargar(); }
    catch (e) { os.aviso('No se pudo', e.message); }
  }, 'peligro']] });
}
async function usar(s) {
  try { await os.decir(`Ejecuta ahora la skill "${s.slug}".`); } catch (e) { os.aviso('No se pudo', e.message); }
}
async function nueva() {
  try { await os.api(`/v1/nodos/${encodeURIComponent(await os.miNodo())}/modo`, { method: 'POST', body: JSON.stringify({ modo: 'crear-skill' }) }); }
  catch (e) { return os.aviso('Nueva skill', e.message); }
  esperando = true;
  os.carta({ titulo: 'Nueva skill', texto: 'Mantén el botón y dime qué debe hacer.\nEj.: "modo cocina: enséñame los pasos de la receta en la pantalla"',
    opciones: [['Cancelar', () => { esperando = false; os.miNodo().then(id => os.api(`/v1/nodos/${encodeURIComponent(id)}/modo`, { method: 'POST', body: '{"modo":null}' })).catch(() => { }); }]] });
}

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-cab"></div><div class="m-lista"></div>';
    cab = el.querySelector('.m-cab');
    lista = os.crearLista(el.querySelector('.m-lista'));
    await cargar();
  },
  tecla: t => lista?.tecla(t),
  alPtt(fase) {
    if (fase !== 'fin' || !esperando) return false;
    os.carta({ titulo: 'Redactando…', texto: 'APOLO está escribiendo tu skill' });
    os.robot.hud('REDACTANDO SKILL', 10, 'trabajando');
    return true;
  },
  // también con el módulo cerrado (r1.js lo carga y llama con os)
  nodo(m, o) {
    if (o) os = o;
    if (m.tipo === 'skill-borrador') { esperando = false; os.hud('SKILL LISTA', 2, 'listo'); cargar().catch(() => { }); ver(m.skill, true); }
    else if (m.tipo === 'skill-error') { esperando = false; os.aviso('No pude crearla', m.motivo || 'error'); }
  },
  evento(e) { if (e.tipo === 'skills') cargar().catch(() => { }); },
  cerrar() { lista = null; cab = null; },
};
