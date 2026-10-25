// ApoloOS · la pantalla de la Rabbit R1 (la sirve el núcleo de APOLO del PC: core/ui/r1/).
// Sistema por módulos, como el rabbitOS: el casco es el inicio; la rueda abre las tarjetas de los módulos; cada módulo
// (modulos/<id>.js) se descarga solo al abrirlo y usa la API del núcleo con una vista mínima (el panel del PC es demasiado pesado para la R1).
//   rueda = moverse · toque = elegir · doble toque = atrás · mantener = hablar con APOLO (en cualquier sitio) · 3 toques = pánico
// Módulo: export default { abrir(el, os), tecla(t) → true si la usó, evento(e) (SSE del núcleo), nodo(m), alPtt(fase) → true, cerrar() }
// La parte nativa (ApoloOS, Java) expone window.R1 y llama a window.R1recibe(tipo, datos):
//   'nodo' (protocolo de core/nodos), 'conexion', 'tecla', 'voz', 'hablando', 'camara', 'modoCamara' (cámara o vídeo a pantalla completa), 'musica'.
// En un navegador normal (pruebas) funciona sin R1 con ?token=... y las teclas ↑ ↓ espacio (toque) y Escape (doble).
import { createRobot } from '../robot3d.js';

const $ = s => document.querySelector(s);
const nativo = window.R1 || null;
const cfg = nativo ? JSON.parse(nativo.config() || '{}') : { token: new URLSearchParams(location.search).get('token') || '' };

function api(ruta, opciones = {}) {
  return fetch(ruta, { ...opciones, headers: { 'content-type': 'application/json', 'x-robot-token': cfg.token, ...(opciones.headers || {}) } })
    .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => Promise.reject(new Error(j.error || `${ruta}: ${r.status}`))));
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hace = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };

// ---------- robot (solo se mueve cuando está a la vista) ----------
// GPU modesta (PowerVR del Helio P35): lo que la frena es subir la textura del visor (512 px → 19 fps; 256 px → 57 fps). ?pr= y ?hud= para medir.
const qs = new URLSearchParams(location.search);
const robot = createRobot($('#robot'), '../casco.glb', { animacion: 'vitrina', pixelRatio: +(qs.get('pr') || 1), antialias: false, hudMax: +(qs.get('hud') || 256) });
robot.setFps?.(30);
window.__robot = robot;                            // para medir desde el depurador (chrome://inspect)

// ---------- textos de abajo (lo que te oyó y lo que respondió) ----------
let tOido = 0, tDijo = 0;
function mostrar(el, texto, segundos) {
  el.textContent = texto;
  el.classList.toggle('oculto', !texto);
  return texto ? setTimeout(() => el.classList.add('oculto'), segundos * 1000) : 0;
}
function oido(t) { clearTimeout(tOido); tOido = mostrar($('#oido'), t, 12); }
function dijo(t) { clearTimeout(tDijo); tDijo = mostrar($('#dijo'), String(t || '').replace(/[#*_`>]/g, '').slice(0, 280), 25); }
function hud(msg, seg = 3, estado = 'listo') { robot.hud(msg, seg, estado); if (vista !== 'apolo' && msg) toast(msg, seg); }
let tToast = 0;
function toast(t, seg = 2.5) { clearTimeout(tToast); tToast = mostrar($('#toast'), t, seg); }

// ---------- permiso: la rueda elige, el botón confirma ----------
let permiso = null, opcion = 'corta';
function verPermiso(p) {
  permiso = p;
  $('#permiso').classList.toggle('oculto', !p);
  if (!p) return;
  $('#pResumen').textContent = p.resumen || '';
  $('#pPeligro').classList.toggle('oculto', !p.peligro);
  elegir('corta');
}
function elegir(o) {
  opcion = o;
  $('#pSi').classList.toggle('activa', o === 'corta');
  $('#pNo').classList.toggle('activa', o === 'larga');
}
function confirmarPermiso() { if (!permiso) return; nativo?.boton(opcion); verPermiso(null); }

// ---------- carta: título + texto + opciones (la rueda elige, el botón confirma) ----------
let carta = null, cSel = 0, tCarta = 0;          // {titulo, texto, nota, opciones: [[texto, fn, clase]], segundos}
function abrirCarta(c) {
  clearTimeout(tCarta);
  carta = c; cSel = 0;
  $('#cTitulo').textContent = c.titulo || '';
  $('#cTexto').textContent = c.texto || '';
  $('#cNota').textContent = c.nota || '';
  $('#cNota').classList.toggle('oculto', !c.nota);
  pintarCarta();
  $('#carta').classList.remove('oculto');
  if (c.segundos) tCarta = setTimeout(cerrarCarta, c.segundos * 1000);
}
function pintarCarta() {
  $('#cOpciones').innerHTML = (carta.opciones || []).map(([t, , cls], i) => `<li class="${i === cSel ? 'activa' : ''} ${cls || ''}">${esc(t)}</li>`).join('');
  $('#cOpciones li.activa')?.scrollIntoView({ block: 'nearest' });
}
function cerrarCarta() { clearTimeout(tCarta); carta = null; $('#carta').classList.add('oculto'); }
function teclaCarta(t) {
  const ops = carta.opciones || [];
  if ((t === 'arriba' || t === 'abajo') && ops.length) { cSel = (cSel + (t === 'arriba' ? ops.length - 1 : 1)) % ops.length; pintarCarta(); clearTimeout(tCarta); }
  else if (t === 'toque') { const f = ops[cSel]?.[1]; cerrarCarta(); f?.(); }
  else if (t === 'doble') cerrarCarta();
}
const aviso = (titulo, texto, volver) => abrirCarta({ titulo, texto, opciones: [[volver ? 'Volver' : 'Cerrar', volver || (() => {})]] });

// ---------- lista para los módulos: filas con selección; la rueda mueve y el toque ejecuta la acción de la fila ----------
// fila: {id, ico (HTML de confianza: lo pone el módulo), titulo, sub, der, clase, accion}
function crearLista(el, { vacio = 'Nada por aquí.' } = {}) {
  let filas = [], sel = 0;
  function pintar() {
    el.innerHTML = filas.length ? filas.map((f, i) => `<div class="fila ${i === sel ? 'sel' : ''} ${f.clase || ''}">${f.ico ? `<span class="f-ico">${f.ico}</span>` : ''}`
      + `<span class="f-txt"><b>${esc(f.titulo)}</b>${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span>${f.der ? `<span class="f-der">${esc(f.der)}</span>` : ''}</div>`).join('')
      : `<p class="vacio">${esc(vacio)}</p>`;
    el.querySelector('.fila.sel')?.scrollIntoView({ block: 'nearest' });
  }
  return {
    poner(nuevas, mantener = true) {
      const id = filas[sel]?.id;
      filas = nuevas;
      const i = mantener && id != null ? filas.findIndex(f => f.id === id) : -1;
      sel = Math.max(0, Math.min(i >= 0 ? i : mantener ? sel : 0, filas.length - 1));
      pintar();
    },
    tecla(t) {
      if (!filas.length) return false;
      if (t === 'arriba' || t === 'abajo') { sel = (sel + (t === 'arriba' ? filas.length - 1 : 1)) % filas.length; pintar(); return true; }
      if (t === 'toque') { filas[sel].accion?.(); return true; }
      return false;
    },
    actual: () => filas[sel],
    repintar: pintar,
  };
}

// ---------- el nodo de la R1 en APOLO (para mandar texto como si lo hubieras dicho, o cambiar de modo) ----------
let nodoId = '';
async function miNodo() {
  if (nodoId) return nodoId;
  const r = await api('/v1/nodos');
  nodoId = (r.nodos || []).find(n => n.modelo === 'rabbit-r1' && n.conectado)?.id || '';
  if (!nodoId) throw new Error('la R1 no está conectada a APOLO');
  return nodoId;
}
// ojo: no empezar por "usa …" (el puente del PC lo toma como "usa <modelo>")
async function decir(texto) {
  await api(`/v1/nodos/${encodeURIComponent(await miNodo())}/texto`, { method: 'POST', body: JSON.stringify({ texto }) });
  oido(texto); robot.hud('PENSANDO…', 4, 'trabajando');
}

// ---------- módulos ----------
// tarjetas del lanzador: solo metadatos (el código del módulo no se descarga hasta abrirlo). resumen(): línea viva de la tarjeta
const n0 = x => (x == null || Number.isNaN(x) ? '—' : x);
const MODULOS = [
  { id: 'mision', nombre: 'Mission Control', ico: '▣', color: '#39ff88', desc: 'Quién está trabajando ahora',
    resumen: async () => { const l = await api('/v1/agentes'); const t = l.filter(a => a.estado === 'trabajando').length; return t ? `${t} trabajando ahora` : `${l.length} agentes · nadie trabajando`; } },
  { id: 'chat', nombre: 'Chat', ico: '❝', color: '#5ad1ff', desc: 'La conversación con APOLO' },
  { id: 'musica', nombre: 'Música', ico: '♫', color: '#1ed760', desc: 'Tu Spotify en la R1' },
  { id: 'videos', nombre: 'Videos', ico: '▶', color: '#ff4e45', desc: 'YouTube y Rumble sin anuncios' },
  { id: 'camara', nombre: 'Cámara', ico: '◎', color: '#ff5a6a', desc: 'Fotos a la galería y al PC',
    accion: () => (nativo?.camara ? nativo.camara(true) : aviso('Cámara', 'Actualiza ApoloOS en la R1 para usar el modo cámara.')) },
  { id: 'tareas', nombre: 'Tareas', ico: '⏱', color: '#ffb238', desc: 'Recordatorios y automatizaciones',
    resumen: async () => { const l = (await api('/v1/tareas')).filter(t => t.activa); return `${l.length} activas`; } },
  { id: 'memoria', nombre: 'Memoria', ico: '✦', color: '#c58aff', desc: 'Lo que APOLO recuerda' },
  { id: 'skills', nombre: 'Skills', ico: 'ϟ', color: '#8affbc', desc: 'Oficios de APOLO para la R1',
    resumen: async () => { const l = ((await api('/v1/skills')).skills || []).filter(s => (s.canales || []).includes('r1')); return `${l.filter(s => s.activa).length} activas · ${l.length} en total`; } },
  { id: 'sistema', nombre: 'Sistema', ico: '▤', color: '#5ad1ff', desc: 'El PC y la R1',
    resumen: async () => { const s = await api('/v1/sistema'); return `PC · CPU ${n0(Math.round(s.cpu?.uso))}% · RAM ${n0(Math.round((1 - s.memoria.libre / s.memoria.total) * 100))}%`; } },
  { id: 'ajustes', nombre: 'Ajustes', ico: '⚙', color: '#9aa8a0', desc: 'Volumen, brillo, panel completo' },
];

let vista = 'apolo', actual = null, actualId = '', cargando = false, camaraNativa = false;  // vista: 'apolo' | 'lanzador' | 'modulo'
function ponerVista(v) {
  vista = v;
  document.body.dataset.vista = v;
  robot.setFps?.(v === 'apolo' && !camaraNativa ? 30 : 1);          // fuera del casco, casi parado (la GPU es poca)
  $('#titulo').textContent = v === 'modulo' ? MODULOS.find(m => m.id === actualId)?.nombre || '' : '';
}

// ----- lanzador: tarjetas en carrusel vertical -----
let lSel = 0, tLanz = 0;
function abrirLanzador(sel = lSel) {
  cerrarModulo();
  lSel = (sel + MODULOS.length) % MODULOS.length;
  $('#lanzador').innerHTML = MODULOS.map(m => `<article class="tarjeta-mod" style="--c:${m.color}"><span class="t-ico">${m.ico}</span>`
    + `<h2>${esc(m.nombre)}</h2><p data-res="${m.id}">${esc(m.desc)}</p></article>`).join('');
  colocarLanzador();
  ponerVista('lanzador');
  vigilarLanzador();
  for (const m of MODULOS) if (m.resumen) m.resumen().then(t => { const p = document.querySelector(`[data-res="${m.id}"]`); if (p && t) p.textContent = t; }).catch(() => { });
}
function colocarLanzador() {
  [...$('#lanzador').children].forEach((el, i) => {
    let d = i - lSel;
    if (d > MODULOS.length / 2) d -= MODULOS.length; else if (d < -MODULOS.length / 2) d += MODULOS.length;   // carrusel circular
    el.style.transform = `translateY(calc(-50% + ${d * 150}px)) scale(${d === 0 ? 1 : 0.82})`;
    el.style.opacity = Math.abs(d) > 1 ? 0 : d === 0 ? 1 : 0.4;
    el.classList.toggle('sel', d === 0);
  });
}
function vigilarLanzador() { clearTimeout(tLanz); tLanz = setTimeout(() => { if (vista === 'lanzador') irApolo(); }, 20_000); }
function teclaLanzador(t) {
  vigilarLanzador();
  if (t === 'arriba' || t === 'abajo') { lSel = (lSel + (t === 'arriba' ? MODULOS.length - 1 : 1)) % MODULOS.length; colocarLanzador(); }
  else if (t === 'toque') abrirModulo(MODULOS[lSel].id);
  else if (t === 'doble') irApolo();
}
function irApolo() { clearTimeout(tLanz); cerrarModulo(); ponerVista('apolo'); }

// ----- abrir / cerrar un módulo -----
const os = { api, esc, hace, nativo, robot, token: cfg.token, hud, toast, oido, carta: abrirCarta, cerrarCarta, aviso, crearLista, miNodo, decir,
  volver: () => abrirLanzador(), abrirModulo: id => abrirModulo(id), modulo: id => cargarModulo(id) };
const cache = new Map();
function cargarModulo(id) {
  if (!cache.has(id)) cache.set(id, import(`./modulos/${id}.js`).then(m => m.default).catch(e => { cache.delete(id); throw e; }));
  return cache.get(id);
}
async function abrirModulo(id) {
  const meta = MODULOS.find(m => m.id === id);
  if (!meta || cargando) return;
  if (meta.accion) { meta.accion(); return; }
  cargando = true;
  cerrarModulo();
  clearTimeout(tLanz);
  actualId = id;
  const el = $('#modulo');
  el.innerHTML = '<p class="vacio">Cargando…</p>';
  el.style.setProperty('--c', meta.color);
  ponerVista('modulo');
  try {
    const m = await cargarModulo(id);
    if (actualId !== id) return;
    actual = m;
    el.innerHTML = '';
    await m.abrir(el, os);
  } catch (e) {
    el.innerHTML = `<p class="vacio">No pude abrir ${esc(meta.nombre)}: ${esc(e.message)}</p>`;
  } finally { cargando = false; }
}
function cerrarModulo() {
  if (actual) { try { actual.cerrar?.(); } catch { } }
  actual = null; actualId = '';
  $('#modulo').innerHTML = '';
}

// ---------- teclas de la R1 ----------
function tecla(t) {
  if (t === 'ptt-inicio') { $('#escucha').classList.remove('oculto'); actual?.alPtt?.('inicio'); return; }
  if (t === 'ptt-fin') {
    $('#escucha').classList.add('oculto');
    if (!actual?.alPtt?.('fin')) robot.hud('PENSANDO…', 4, 'trabajando');
    return;
  }
  if (t === 'panico') { hud('PÁNICO: TODO PARADO', 3, 'error'); return; }
  if (permiso) {
    if (t === 'arriba' || t === 'abajo') elegir(opcion === 'corta' ? 'larga' : 'corta');
    else if (t === 'toque') confirmarPermiso();
    return;
  }
  if (carta) return teclaCarta(t);
  if (vista === 'lanzador') return teclaLanzador(t);
  if (vista === 'modulo') {
    let usada = false;
    try { usada = !!actual?.tecla?.(t); } catch { }
    if (!usada && t === 'doble') abrirLanzador();
    return;
  }
  // casco
  if (t === 'arriba' || t === 'abajo') abrirLanzador(t === 'arriba' ? MODULOS.length - 1 : 0);
  else if (t === 'toque') robot.poke();
  else if (t === 'doble') robot.greet();
}

// ---------- mensajes del nodo (core/nodos) ----------
function nodo(m) {
  switch (m.tipo) {
    case 'estado': robot.setState(m.estado, m.estado === 'reposo' ? '' : m.msg || ''); if (m.estado !== 'permiso') verPermiso(null); break;
    case 'flash': robot.hud(m.msg || '', m.segundos || 3, m.estado || 'listo'); break;
    case 'gesto': robot.gesto(m.gesto, m.segundos || 3, m.msg); break;
    case 'permiso': verPermiso(m); break;
    case 'oido': oido(m.texto || '(no te entendí)'); break;
    case 'emparejar': emparejar(m.codigo); break;
    case 'bienvenido': $('#emparejar').classList.add('oculto'); robot.greet(); if (m.zona) { zonaPC = m.zona; reloj(); } break;
    case 'rechazado': robot.hud('EMPAREJANDO…', 3, 'permiso'); break;
    case 'tarjeta': abrirCarta({ titulo: m.titulo, texto: m.texto, segundos: m.segundos, opciones: [['Cerrar', () => {}]] }); break;
    // la skill dictada llega aunque hayas salido del módulo: lo carga y se la pasa
    case 'skill-borrador': case 'skill-error': cargarModulo('skills').then(s => s.nodo?.(m, os)).catch(() => { }); return;
  }
  try { actual?.nodo?.(m); } catch { }
}
// el código de emparejar se confirma solo con el token (la pantalla la sirve el propio núcleo)
function emparejar(codigo) {
  $('#codigo').textContent = codigo;
  $('#emparejar').classList.remove('oculto');
  api('/v1/nodos/emparejar', { method: 'POST', body: JSON.stringify({ codigo, nombre: 'Rabbit R1' }) })
    .catch(() => { /* si falla, el código queda en pantalla para escribirlo en el panel */ });
}

window.R1recibe = (tipo, d) => {
  if (tipo === 'nodo') nodo(d);
  else if (tipo === 'tecla') tecla(d.tecla);
  else if (tipo === 'voz') $('#anillo').style.setProperty('--nivel', String(1 + Math.max(0, d.nivel) * 0.6));
  else if (tipo === 'conexion') $('#pc').classList.toggle('apagado', !d.conectado);
  else if (tipo === 'hablando' && d.si) robot.hud('', 1, 'listo');
  else if (tipo === 'musica') { try { actual?.musica?.(d); } catch { } }      // cambió lo que suena (módulo Música)
  else if (tipo === 'modoCamara') { camaraNativa = d.activa; ponerVista(vista); }   // la vista previa nativa tapa la web
  else if (tipo === 'camara') { $('#camaraAro').classList.toggle('oculto', !d.activa); if (d.activa) robot.gesto('mirar', 2); }
};

// ---------- eventos del núcleo (SSE): la respuesta de APOLO + lo que necesite el módulo abierto ----------
async function escuchar() {
  try {
    const r = await fetch('/v1/eventos', { headers: { 'x-robot-token': cfg.token } });
    const lector = r.body.getReader(), dec = new TextDecoder();
    let resto = '';
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const partes = resto.split('\n\n'); resto = partes.pop();
      for (const p of partes) {
        const l = p.split('\n').find(x => x.startsWith('data: '));
        if (!l) continue;
        let e; try { e = JSON.parse(l.slice(6)); } catch { continue; }
        if (e.tipo === 'fin' && e.texto && !actual?.muestraRespuestas) dijo(e.texto);
        try { actual?.evento?.(e); } catch { }
      }
    }
  } catch { }
  setTimeout(escuchar, 4000);                      // se reconecta solo
}

// ---------- reloj, batería y activación de nodos ----------
// la hora va con la zona del PC (llega en 'bienvenido'), aunque la de Android de la R1 esté mal; cambia justo al cambiar el minuto
let zonaPC = '', tReloj = 0;
function reloj() {
  const d = new Date();
  let hm;
  try { hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false, ...(zonaPC ? { timeZone: zonaPC } : {}) }); }
  catch { hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }   // zona desconocida
  $('#hora').textContent = hm;
  if (nativo) { try { const b = JSON.parse(nativo.bateria()); $('#bat').textContent = `${b.cargando ? '⚡' : ''}${b.nivel}%`; } catch { } }
  clearTimeout(tReloj);
  tReloj = setTimeout(reloj, 60_000 - (Date.now() % 60_000) + 50);
}
reloj();
document.addEventListener('visibilitychange', () => { if (!document.hidden) reloj(); });   // al encender la pantalla
api('/v1/nodos').then(n => n.activo ? null : api('/v1/nodos/activar', { method: 'POST', body: JSON.stringify({ activo: true }) })).catch(() => { });
escuchar();
ponerVista('apolo');
if (nativo) { try { window.R1recibe('conexion', JSON.parse(nativo.conexion())); } catch { } }

// pruebas en el navegador: ↑ ↓ = rueda, espacio = toque, Escape = doble toque
if (!nativo) addEventListener('keydown', e => {
  const t = { ArrowUp: 'arriba', ArrowDown: 'abajo', ' ': 'toque', Escape: 'doble' }[e.key];
  if (t) { e.preventDefault(); tecla(t); }
});
