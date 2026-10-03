// APOLO móvil (PWA servida por el daemon en /m/). Vanilla, sin librerías. Habla con /v1 con su PROPIO token de dispositivo
// (header x-dispositivo), nunca con el maestro. Pestañas: Inicio · Chat · Permisos · Turno · Ajustes.
// Lo peligroso se aprueba con passkey (huella/cara, si el navegador lo permite: HTTPS) o con el PIN elegido al emparejar.
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('apm.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem('apm.' + k); else localStorage.setItem('apm.' + k, JSON.stringify(v)); } catch { } },
};
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const vibrar = p => { try { navigator.vibrate?.(p); } catch { } };

// ---------- iconos propios (trazo 1.8, como el panel) ----------
const IC = {
  casa: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  luna: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  enviar: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  parar: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.01"/>',
  rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="4"/><path d="M12 4v4M9 14h.01M15 14h.01"/>',
  herr: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  tarjeta: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  huella: '<path d="M12 11v3a8 8 0 0 1-1.5 4.7"/><path d="M8 8.5A5 5 0 0 1 17 11v1.5c0 1.6-.2 3.1-.6 4.5"/><path d="M5.3 15.5A9 9 0 0 1 5 13v-2a7 7 0 0 1 11.7-5.2"/><path d="M9 11v2c0 2.6-.8 5-2.2 7"/><path d="M19.8 15.5c.1-.8.2-1.6.2-2.5v-2a8 8 0 0 0-.6-3"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  movil: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  salir: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',
  descarga: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
  estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  nuevo: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 19.5h.01"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || IC.robot}</svg>`;
const hace = t => {
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 50) return tr('ahora');
  if (s < 3600) return tr('hace {n} min', { n: Math.round(s / 60) });
  if (s < 86400) return tr('hace {n} h', { n: Math.round(s / 3600) });
  return new Date(t).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' });
};
function md(t) {                                   // markdown mínimo y seguro: bloques de código, `código`, **negrita**, enlaces http(s)
  return String(t || '').split(/```[\w+-]*\n?([\s\S]*?)(?:```|$)/g).map((p, i) => {
    if (i % 2) return `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>`;
    return p.split(/\n{2,}/).filter(x => x.trim()).map(par => `<p>${esc(par)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>')}</p>`).join('');
  }).join('');
}

// ---------- estado ----------
const E = {
  token: LS.get('token', ''), yo: null, nombre: LS.get('nombre', 'APOLO'), permisos: [], agentes: [], tarjetas: null, turno: null, wrapped: null,
  vista: 'inicio', sesion: LS.get('sesion', ''), chat: null, enCurso: null, conectado: true, robot: null, sinRed: false, instalar: null,
};

// ---------- API ----------
async function api(M, ruta, cuerpo, { crudo, tipo } = {}) {
  let r;
  try {
    r = await fetch('/v1' + ruta, { method: M, headers: { 'x-dispositivo': E.token, ...(crudo ? { 'content-type': tipo || 'application/octet-stream' } : cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: crudo || (cuerpo === undefined ? undefined : JSON.stringify(cuerpo)) });
  } catch (e) { conexion(false); throw new Error(tr('Sin conexión con {n}', { n: E.nombre })); }
  conexion(true);
  if (r.status === 401 && !ruta.startsWith('/movil/canjear')) { desemparejado(); throw new Error(tr('Este móvil ya no está emparejado')); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(tr(j.error || `HTTP ${r.status}`)); e.status = r.status; throw e; }
  return j;
}
async function flujo(M, ruta, cuerpo, alEvento, senal) {
  const r = await fetch('/v1' + ruta, { method: M, signal: senal, headers: { 'x-dispositivo': E.token, 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (r.status === 401) { desemparejado(); throw new Error(tr('Este móvil ya no está emparejado')); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(tr(j.error || `HTTP ${r.status}`)); }
  const lector = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await lector.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const b = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const l of b.split('\n')) if (l.startsWith('data: ')) { try { alEvento(JSON.parse(l.slice(6))); } catch { } }
    }
  }
}
function conexion(ok) {
  if (E.conectado === ok) return;
  E.conectado = ok; robotEstado(); pintarCab();
  const f = $('#franja'); if (f) f.hidden = ok;
}

// ---------- avisos y hojas ----------
function toast(texto, mal = false) {
  const el = document.createElement('div'); el.className = 'toast' + (mal ? ' mal' : '');
  el.innerHTML = `${ic(mal ? 'x' : 'check')}<div>${esc(texto)}</div>`;
  $('#toasts').append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = 0; el.style.transform = 'translateY(-10px)'; setTimeout(() => el.remove(), 300); }, mal ? 5000 : 2600);
}
function hoja(html, { completa = false, alAbrir } = {}) {
  return new Promise(ok => {
    const v = document.createElement('div'); v.className = 'velo';
    v.innerHTML = `<div class="hoja ${completa ? 'completa' : ''}" role="dialog" aria-modal="true"><div class="asa"></div>${html}</div>`;
    const cerrar = val => { v.remove(); ok(val); };
    v.addEventListener('click', e => { if (e.target === v) cerrar(null); const b = e.target.closest('[data-cerrar]'); if (b) cerrar(b.dataset.cerrar === '' ? null : b.dataset.cerrar); });
    // deslizar hacia abajo desde el asa para cerrar
    let y0 = null; const h = $('.hoja', v);
    h.addEventListener('touchstart', e => { if (h.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    h.addEventListener('touchmove', e => { if (y0 !== null) { const d = e.touches[0].clientY - y0; if (d > 0) h.style.transform = `translateY(${d}px)`; } }, { passive: true });
    h.addEventListener('touchend', e => { if (y0 === null) return; const d = e.changedTouches[0].clientY - y0; y0 = null; if (d > 110) cerrar(null); else h.style.transform = ''; });
    $('#hojas').append(v);
    alAbrir?.(v, cerrar);
  });
}
// teclado numérico propio (como el de bloqueo del teléfono)
function pedirPin(titulo, sub) {
  return hoja(`<h2>${esc(titulo)}</h2><p class="sub">${esc(sub || '')}</p><div class="pin-puntos">${'<i></i>'.repeat(4)}</div>
    <div class="teclado">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button class="fn" data-n="borrar">${tr('Borrar')}</button><button data-n="0">0</button><button class="fn" data-n="ok"><b style="color:var(--acento)">OK</b></button></div>`, {
    alAbrir(v, cerrar) {
      let pin = '';
      const pintar = () => { const p = $('.pin-puntos', v); p.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
      $('.teclado', v).onclick = e => {
        const b = e.target.closest('[data-n]'); if (!b) return; vibrar(8);
        if (b.dataset.n === 'borrar') pin = pin.slice(0, -1);
        else if (b.dataset.n === 'ok') { if (pin.length >= 4) cerrar(pin); else { $('.pin-puntos', v).classList.add('mal'); setTimeout(() => $('.pin-puntos', v)?.classList.remove('mal'), 400); } return; }
        else if (pin.length < 8) pin += b.dataset.n;
        pintar();
      };
    },
  });
}

// ---------- robot de la cabecera ----------
const LOG = ['> APOLO móvil', 'conectado'];
function montarRobot(caja) {
  if (!caja) return;
  if (!window.RobotM) { addEventListener('robotm-listo', () => montarRobot(caja), { once: true }); return; }
  try {
    if (E.robot) { E.robot.destruir(); E.robot = null; }
    const cv = document.createElement('canvas');
    E.robot = window.RobotM.crear(cv, LOG);
    caja.innerHTML = ''; caja.append(cv);
    E.robot.setFps?.(30); robotEstado();
    cv.addEventListener('click', () => { E.robot?.poke(); vibrar(10); });
  } catch (e) { console.warn('robot 3D no disponible', e); }
}
function estadoRobot() {
  if (!E.conectado) return 'dormido';
  if (E.permisos.length) return 'permiso';
  if (E.enCurso || E.agentes.some(a => a.estado === 'trabajando')) return 'trabajando';
  return 'reposo';
}
function robotEstado() {
  const s = estadoRobot();
  document.body.dataset.estado = s;
  try { E.robot?.setState(s); } catch { }
}
const TXT_ESTADO = { reposo: 'En reposo · listo para ti', trabajando: 'Trabajando…', permiso: 'Esperando tu permiso', dormido: 'Sin conexión' };

// ---------- arranque ----------
async function arrancar() {
  const h = location.hash;
  const par = (h.match(/par=([\w-]+)/) || [])[1];
  if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { });
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); E.instalar = e; });
  if (par) return pantallaEmparejar(par);
  if (!E.token) return pantallaSinEmparejar();
  montarApp();
}

function pantallaSinEmparejar() {
  $('#raiz').innerHTML = `<div class="emp"><div class="robot" id="robotEmp"></div>
    <h1>${tr('Conecta tu móvil')}</h1><p class="sub">${tr('Empareja este móvil con {n} una sola vez. Tu token maestro nunca sale del ordenador.', { n: esc(E.nombre) })}</p>
    <div class="tarj"><ol class="pasos">
      <li><div>${tr('En el ordenador abre el panel: <b>Configuración → Dispositivos</b>.')}</div></li>
      <li><div>${tr('Pulsa <b>Conectar móvil</b>: sale un código QR (vale 5 minutos).')}</div></li>
      <li><div>${tr('Escanéalo con la cámara de este móvil y elige un PIN.')}</div></li></ol></div>
    <p class="pie">${tr('El móvil y el ordenador tienen que estar en la misma red Wi-Fi.')}</p></div>`;
  montarRobot($('#robotEmp'));
}

function pantallaEmparejar(codigo) {
  const so = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Móvil';
  $('#raiz').innerHTML = `<div class="emp"><div class="robot" id="robotEmp"></div>
    <h1>${tr('Hola, soy {n}', { n: esc(E.nombre) })}</h1><p class="sub">${tr('Vamos a conectar este móvil. Elige un nombre y un PIN.')}</p>
    <label class="campo"><span>${tr('Nombre de este móvil')}</span><input id="eNom" maxlength="40" value="${esc(so === 'Móvil' ? tr('Mi móvil') : tr('Mi {x}', { x: so }))}"></label>
    <label class="campo"><span>${tr('PIN (4 a 8 cifras)')}</span><input id="ePin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" placeholder="••••"></label>
    <label class="campo"><span>${tr('Repite el PIN')}</span><input id="ePin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" placeholder="••••"></label>
    <div class="nota">${ic('candado')}<span>${tr('El PIN protege las acciones <b>peligrosas</b> (borrar, instalar, comandos delicados). Si tu navegador lo permite, luego podrás usar la huella o la cara.')}</span></div>
    <button class="btn pri ancho" id="eOk" style="margin-top:18px">${tr('Conectar')}</button>
    <p class="pie">${tr('Código de un solo uso · caduca a los 5 minutos')}</p></div>`;
  montarRobot($('#robotEmp'));
  $('#eOk').onclick = async () => {
    const pin = $('#ePin').value.trim(), pin2 = $('#ePin2').value.trim();
    if (!/^\d{4,8}$/.test(pin)) return toast(tr('El PIN debe tener de 4 a 8 cifras'), true);
    if (pin !== pin2) return toast(tr('Los PIN no coinciden'), true);
    const b = $('#eOk'); b.disabled = true; b.textContent = tr('Conectando…');
    try {
      const r = await fetch('/v1/movil/canjear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo, pin, nombre: $('#eNom').value.trim(), so, idioma: I18N.idioma() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(tr(j.error || `HTTP ${r.status}`));
      E.token = j.token; LS.set('token', j.token);
      history.replaceState(null, '', location.pathname + '#inicio');
      vibrar([20, 40, 20]);
      montarApp(true);
    } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = tr('Conectar'); }
  };
}

function desemparejado() {
  if (!E.token) return;
  E.token = ''; LS.set('token', null); LS.set('sesion', null);
  E.ctlEventos?.abort();
  if (E.robot) { try { E.robot.destruir(); } catch { } E.robot = null; }
  pantallaSinEmparejar();
  toast(tr('Este móvil ya no está emparejado'), true);
}

// ---------- cascarón de la app ----------
const TABS = [['inicio', 'Inicio', 'casa'], ['chat', 'Chat', 'chat'], ['permisos', 'Permisos', 'escudo'], ['turno', 'Turno', 'luna'], ['ajustes', 'Ajustes', 'ajustes']];
function montarApp(recien = false) {
  $('#raiz').innerHTML = `<div class="app" id="app">
    <header class="cab" id="cab"><div class="robot" id="robotCab"><div class="respaldo">${ic('robot')}</div></div><div class="t"><b id="cabT"></b><small id="cabS"></small></div><div class="acc" id="cabA"></div></header>
    <main class="vista" id="vista"></main>
    <nav class="tabs" id="tabs">${TABS.map(([k, t, i]) => `<a href="#${k}" data-tab="${k}"><span class="ico">${ic(i)}</span><span>${tr(t)}</span>${k === 'permisos' ? '<b class="badge" id="badge" hidden></b>' : ''}</a>`).join('')}</nav></div>`;
  montarRobot($('#robotCab'));
  if (!E.oyentes) {
    E.oyentes = true;
    addEventListener('hashchange', ruta);
    addEventListener('scroll', () => $('#cab')?.classList.toggle('sombra', scrollY > 4), { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && E.token) { cargarPermisos(); cargarAgentes(); } });
  }
  api('GET', '/movil/yo').then(y => { E.yo = y; E.nombre = y.nombreAsistente || E.nombre; LS.set('nombre', E.nombre); pintarCab(); if (E.vista === 'ajustes') ruta(); }).catch(() => { });
  cargarPermisos(); cargarAgentes();
  escucharEventos();
  ruta();
  if (recien) setTimeout(bienvenida, 500);
  clearInterval(E.refresco); E.refresco = setInterval(() => { if (document.visibilityState === 'visible') { cargarPermisos(); cargarAgentes(); } }, 20_000);
}
function pintarCab() {
  const app = $('#app'); if (!app) return;
  const s = estadoRobot();
  app.classList.toggle('grande', E.vista === 'inicio');
  app.classList.toggle('chat', E.vista === 'chat');
  const titulos = { inicio: E.nombre, chat: E.chat?.titulo && E.chat.titulo !== 'Nueva sesión' ? E.chat.titulo : tr('Chat'), permisos: tr('Permisos'), turno: tr('Turno de noche'), ajustes: tr('Ajustes') };
  $('#cabT').textContent = E.vista === 'inicio' ? E.nombre.toUpperCase() : titulos[E.vista];
  const punto = { reposo: 'ok', trabajando: 'info', permiso: 'aviso', dormido: 'mal' }[s];
  $('#cabS').innerHTML = `<span class="punto ${punto}"></span>${E.vista === 'inicio' || E.vista === 'chat' ? tr(TXT_ESTADO[s]) : esc(E.nombre) + ' · ' + tr(TXT_ESTADO[s])}`;
  $('#cabA').innerHTML = E.vista === 'chat' ? `<button class="btn-ic" id="nuevoChat" aria-label="${tr('Nueva conversación')}">${ic('nuevo')}</button>` : '';
  $('#nuevoChat')?.addEventListener('click', () => nuevaConversacion());
  const n = E.permisos.length, bd = $('#badge');
  if (bd) { bd.hidden = !n; bd.textContent = n; }
  document.title = n ? `(${n}) ${E.nombre}` : E.nombre;
}
function ruta() {
  if (!$('#app')) return;
  const v = (location.hash.slice(1).split(/[?&]/)[0] || 'inicio');
  E.vista = VISTAS[v] ? v : 'inicio';
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === E.vista));
  pintarCab();
  scrollTo(0, 0);
  const vista = $('#vista');
  vista.innerHTML = `<div class="franja" id="franja" ${E.conectado ? 'hidden' : ''}>${ic('wifi')}${tr('Sin conexión con {n}. Reintentando…', { n: esc(E.nombre) })}</div><div id="cont"></div>`;
  $('.entrada')?.remove(); $('.grabando')?.remove();
  VISTAS[E.vista](($('#cont')));
}

// ---------- eventos en vivo (SSE por fetch, con reconexión) ----------
async function escucharEventos() {
  E.ctlEventos?.abort();
  const ctl = E.ctlEventos = new AbortController();
  let espera = 1000;
  while (!ctl.signal.aborted && E.token) {
    try {
      await flujo('GET', '/eventos', undefined, ev => { espera = 1000; conexion(true); alEvento(ev); }, ctl.signal);
    } catch { if (ctl.signal.aborted) return; conexion(false); }
    await new Promise(ok => setTimeout(ok, espera)); espera = Math.min(espera * 2, 15000);
    if (!ctl.signal.aborted) { cargarPermisos(); cargarAgentes(); }
  }
}
function alEvento(e) {
  if (e.tipo === 'permiso' || e.tipo === 'permisos-externos') { cargarPermisos(); if (e.tipo === 'permiso') vibrar([60, 40, 60]); }
  else if (e.tipo === 'permiso-resuelto') cargarPermisos();
  else if (e.tipo === 'agente') {
    const a = e.agente; if (!a) return;
    const i = E.agentes.findIndex(x => x.id === a.id);
    if (i >= 0) E.agentes[i] = a; else E.agentes.unshift(a);
    robotEstado(); pintarCab();
    if (E.vista === 'inicio') pintarAgentes();
  } else if (e.tipo === 'tarea' && E.vista === 'turno') VISTAS.turno($('#cont'), true);
  else if (e.tipo === 'herramienta' && e.nombre) { LOG.push('> ' + e.nombre); try { E.robot?.pushLog('> ' + e.nombre); } catch { } }
}
async function cargarPermisos() {
  try {
    const { permisos } = await api('GET', '/movil/permisos');
    const antes = E.permisos.map(p => p.id).join();
    E.permisos = permisos;
    if (antes !== permisos.map(p => p.id).join()) {
      robotEstado(); pintarCab();
      if (E.vista === 'permisos') pintarPermisos();
      if (E.vista === 'inicio') pintarAlerta();
    }
  } catch { }
}
async function cargarAgentes() {
  try { E.agentes = await api('GET', '/agentes'); robotEstado(); pintarCab(); if (E.vista === 'inicio') pintarAgentes(); } catch { }
}

// ---------- vistas ----------
const VISTAS = {};

// FASE 9 · kill switch: el móvil puede PARAR todo (reanudar solo desde el escritorio)
async function pintarPanico() {
  const c = document.getElementById('panico'); if (!c) return;
  let st = { activo: false }; try { st = await api('GET', '/panico'); } catch { }
  c.innerHTML = st.activo
    ? `<div style="padding:12px;border-radius:12px;background:#c33;color:#fff;font-weight:700;text-align:center">🛑 ${tr('PÁNICO: todo parado')} (${esc(st.origen || '')})<br><small style="font-weight:400">${tr('Reanuda desde el escritorio')}</small></div>`
    : `<button id="btPanico" style="width:100%;padding:12px;border-radius:12px;border:1px solid #c33;background:transparent;color:#f55;font-weight:700">🛑 ${tr('Parar TODO')}</button>`;
  const b = document.getElementById('btPanico');
  if (b) b.onclick = async () => { if (!confirm(tr('¿Parar TODO ahora?'))) return; vibrar(40); try { await api('POST', '/panico', {}); toast(tr('PÁNICO: todo parado')); } catch (e) { toast(e.message, true); } pintarPanico(); };
}
VISTAS.inicio = c => {
  c.innerHTML = `<div id="alerta"></div>
    <div class="rapidos">
      <button data-ir="hablar"><span class="bola ac">${ic('mic')}</span>${tr('Hablar')}</button>
      <button data-ir="chat"><span class="bola">${ic('chat')}</span>${tr('Chat')}</button>
      <button data-ir="encargo"><span class="bola">${ic('luna')}</span>${tr('Encargo')}</button>
      <button data-ir="wrapped"><span class="bola">${ic('estrella')}</span>${tr('Wrapped')}</button></div>
    <div class="sec">${tr('Ahora mismo')}<span class="n" id="nAg">0</span></div><div id="agentes"></div>
    <div class="sec" id="secTar" hidden>${tr('Tarjetas')}<span class="n" id="nTar">0</span></div><div id="tarjetas"></div>
    <div class="sec">${tr('Tu semana')}</div><div id="semana"></div>
    <div id="panico" style="margin:18px 0 8px"></div>`;
  pintarPanico();
  c.querySelector('.rapidos').onclick = e => {
    const b = e.target.closest('[data-ir]'); if (!b) return; vibrar(8);
    const d = b.dataset.ir;
    if (d === 'hablar') { E.hablarAlEntrar = true; location.hash = '#chat'; }
    else if (d === 'chat') location.hash = '#chat';
    else if (d === 'encargo') hojaEncargo();
    else if (d === 'wrapped') abrirWrapped();
  };
  pintarAlerta(); pintarAgentes(); pintarTarjetas(); pintarSemana();
};
function pintarAlerta() {
  const a = $('#alerta'); if (!a) return;
  const n = E.permisos.length;
  if (!n) { a.innerHTML = ''; return; }
  const p = E.permisos[0];
  a.innerHTML = `<button class="alerta" id="irPerm" style="width:100%;text-align:left;color:inherit">
    <span class="ic">${ic(p.peligro ? 'alerta' : 'escudo')}</span><span class="tx"><b>${tr('{n} permiso espera|{n} permisos esperan', { n })}</b><small>${esc(p.resumen)}</small></span>${ic('flecha')}</button>`;
  $('#irPerm').onclick = () => { location.hash = '#permisos'; };
}
function pintarAgentes() {
  const caja = $('#agentes'); if (!caja) return;
  const trab = E.agentes.filter(a => a.estado === 'trabajando'), resto = E.agentes.filter(a => a.estado !== 'trabajando').slice(0, Math.max(0, 3 - trab.length));
  $('#nAg').textContent = trab.length;
  const fila = a => {
    const st = a.estado === 'trabajando' ? '<span class="giro"></span>' : a.estado === 'error' ? `<span class="chip mal">${tr('error')}</span>` : `<span class="chip ok">${ic('check')}</span>`;
    const det = a.estado === 'trabajando' ? (a.herramienta ? [a.herramienta.nombre, a.herramienta.resumen].filter(Boolean).join(' · ') : a.modelo || '') : [a.pasos ? `${a.pasos} ${tr('pasos')}` : String(a.modelo || '').split('/').pop(), hace(a.fin || a.inicio)].filter(Boolean).join(' · ');
    return `<div class="it"><span class="ic">${ic(a.padre ? 'herr' : 'robot')}</span><span class="tx"><b>${esc(a.nombre || tr('Agente'))}</b><small>${esc(det)}</small></span><span class="der">${st}</span></div>`;
  };
  caja.innerHTML = trab.length || resto.length ? `<div class="lista">${[...trab, ...resto].map(fila).join('')}</div>`
    : `<div class="tarj tenue peq" style="display:flex;gap:10px;align-items:center">${ic('robot')}${tr('Nadie trabaja ahora. Pídele algo por chat o por voz.')}</div>`;
}
async function pintarTarjetas() {
  const caja = $('#tarjetas'); if (!caja) return;
  try { const r = await api('GET', '/movil/tarjetas'); E.tarjetas = r.disponible ? r.tarjetas : null; } catch { E.tarjetas = null; }
  if (!$('#tarjetas')) return;
  $('#secTar').hidden = !E.tarjetas;
  if (!E.tarjetas) { caja.innerHTML = ''; return; }
  $('#nTar').textContent = E.tarjetas.length;
  if (!E.tarjetas.length) { caja.innerHTML = `<div class="tarj tenue peq" style="display:flex;gap:10px;align-items:center">${ic('tarjeta')}${tr('Sin tarjetas: el cerebro no ha visto nada importante.')}</div>`; return; }
  const pri = { urgente: 'mal', normal: 'info', ruido: '' };
  caja.innerHTML = E.tarjetas.slice(0, 6).map(t => `<div class="tarj card-c" data-id="${t.id}">
    <div class="arr"><span class="chip ${pri[t.prioridad] || ''}">${esc(tr(t.prioridad || 'normal'))}</span><b>${esc(t.autor || '')}</b><span class="tenue peq">${hace(t.t)}</span></div>
    <p>${esc(t.resumen || t.texto)}</p>${t.lugar ? `<p class="peq" style="color:var(--txt-3);margin-top:4px">${ic(t.tipo === 'mail' ? 'correo' : 'chat')} ${esc(t.lugar)}</p>` : ''}
    ${t.respuesta ? `<div class="resp">${esc(t.respuesta)}</div>` : ''}
    <div class="fila-btn">${t.puedeEnviar && t.respuesta ? `<button class="btn pri chico" data-a="enviar">${ic('enviar')}${tr('Responder')}</button>` : ''}<button class="btn chico" data-a="descartar">${tr('Descartar')}</button><button class="btn chico fantasma" data-a="ruido">${tr('Es ruido')}</button></div></div>`).join('');
  caja.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const card = b.closest('[data-id]');
    b.disabled = true;
    try { const r = await api('POST', `/movil/tarjetas/${card.dataset.id}`, { accion: b.dataset.a }); if (r.texto) toast(r.texto.replace(/[*_]/g, '')); card.style.transition = 'opacity .25s'; card.style.opacity = 0; setTimeout(() => pintarTarjetas(), 260); }
    catch (er) { toast(er.message, true); b.disabled = false; }
  };
}
async function pintarSemana() {
  const caja = $('#semana'); if (!caja) return;
  try { E.wrapped = await api('GET', '/wrapped?periodo=semana&privado=false'); } catch { caja.innerHTML = ''; return; }
  const d = E.wrapped, h = (x, dec = 1) => Number(x || 0).toLocaleString(I18N.locale(), { maximumFractionDigits: dec });
  if (!$('#semana')) return;
  caja.innerHTML = `<button class="wrapped" id="abrirWr"><small>${tr('{n} Wrapped', { n: esc(E.nombre) })}</small><b>~${h(d.ahorro?.horas)} h</b><span class="tenue">${tr('ahorradas esta semana · toca para verlo')}</span>${ic('flecha', 'flecha')}</button>
    <div class="kpis" style="margin-top:10px"><div class="kpi"><small>${tr('Conversaciones')}</small><b>${h(d.sesiones, 0)}</b><span>${tr('{n} días activos', { n: d.diasActivos ?? 0 })}</span></div>
    <div class="kpi"><small>${tr('Horas de agente')}</small><b>${h(d.horasAgente)}</b><span>${tr('racha: {n}', { n: d.racha?.actual ?? 0 })}</span></div></div>`;
  $('#abrirWr').onclick = abrirWrapped;
}
async function abrirWrapped() {
  try {
    const d = E.wrapped || await api('GET', '/wrapped?periodo=semana&privado=false');
    d.acento = '#2bdc7c'; window.WR_DATOS = d;
    hoja(`<div style="display:flex;align-items:center;margin-bottom:10px"><h2 style="flex:1;margin:0">${tr('Tu semana')}</h2><button class="btn-ic" data-cerrar="">${ic('x')}</button></div><iframe src="../wrapped.html" title="Wrapped"></iframe>`, { completa: true });
  } catch (e) { toast(e.message, true); }
}

// ---------- chat ----------
VISTAS.chat = async c => {
  c.innerHTML = `<div class="msgs" id="msgs"></div>`;
  const ent = document.createElement('div'); ent.className = 'entrada';
  ent.innerHTML = `<button class="mic" id="mic" aria-label="${tr('Mantén pulsado para hablar')}">${ic('mic')}</button>
    <div class="caja"><textarea id="txt" rows="1" placeholder="${tr('Escribe a {n}…', { n: esc(E.nombre) })}" enterkeyhint="send"></textarea><button class="enviar" id="env" aria-label="${tr('Enviar')}">${ic('enviar')}</button></div>`;
  $('#app').append(ent);
  const t = $('#txt');
  t.addEventListener('input', () => { t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; });
  t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); enviarChat(); } });
  $('#env').onclick = () => E.enCurso ? cancelarChat() : enviarChat();
  prepararMic($('#mic'));
  await cargarChat();
  if (E.hablarAlEntrar) { E.hablarAlEntrar = false; toast(tr('Mantén pulsado el micro para hablar')); $('#mic').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 600, iterations: 2 }); }
};
async function cargarChat() {
  let s = null;
  if (E.sesion) { try { s = await api('GET', `/sesiones/${E.sesion}`); } catch { s = null; } }
  E.chat = s; pintarCab();
  pintarChat();
}
function pintarChat() {
  const caja = $('#msgs'); if (!caja) return;
  const ms = (E.chat?.mensajes || []).filter(m => m.role === 'user' || (m.role === 'assistant' && (m.content || m.toolCalls?.length)));
  if (!ms.length) {
    caja.innerHTML = `<div class="bienv"><b>${tr('¿En qué te ayudo?')}</b>${tr('Escribe o mantén pulsado el micro para hablar.')}
      <div class="sug">${['¿Qué tengo pendiente hoy?', 'Resume lo último que hiciste', '¿Cómo va el turno de noche?'].map(x => `<button>${esc(tr(x))}</button>`).join('')}</div></div>`;
    caja.querySelector('.sug').onclick = e => { const b = e.target.closest('button'); if (b) { $('#txt').value = b.textContent; enviarChat(); } };
    return;
  }
  caja.innerHTML = ms.map(m => m.role === 'user' ? `<div class="burb yo">${esc(m.content)}</div>`
    : (m.toolCalls || []).map(tc => `<div class="paso hecho">${ic('herr')}<span>${esc(tc.name)}</span></div>`).join('') + (m.content ? `<div class="burb ia">${md(m.content)}</div>` : '')).join('');
  abajo();
}
const abajo = () => requestAnimationFrame(() => scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
async function nuevaConversacion() {
  if (E.enCurso) return;
  E.sesion = ''; LS.set('sesion', null); E.chat = null; pintarCab(); pintarChat(); vibrar(8);
}
async function enviarChat(texto) {
  const t = $('#txt'); texto = String(texto ?? t?.value ?? '').trim();
  if (!texto || E.enCurso) return;
  if (t) { t.value = ''; t.style.height = 'auto'; }
  try {
    if (!E.sesion) { const s = await api('POST', '/sesiones', { titulo: texto.slice(0, 60) }); E.sesion = s.id; LS.set('sesion', s.id); E.chat = { ...s, mensajes: [] }; pintarCab(); }
  } catch (e) { return toast(e.message, true); }
  const caja = $('#msgs');
  if (caja.querySelector('.bienv')) caja.innerHTML = '';
  caja.insertAdjacentHTML('beforeend', `<div class="burb yo">${esc(texto)}</div><div class="escribiendo" id="esc"><i></i><i></i><i></i></div>`);
  abajo();
  const ctl = new AbortController(); E.enCurso = ctl; botonEnviar(); robotEstado(); pintarCab();
  const quitarEsc = () => $('#esc')?.remove();
  const ponerEsc = () => { quitarEsc(); $('#msgs')?.insertAdjacentHTML('beforeend', '<div class="escribiendo" id="esc"><i></i><i></i><i></i></div>'); };
  try {
    await flujo('POST', `/sesiones/${E.sesion}/mensajes`, { texto }, e => {
      const cj = $('#msgs'); if (!cj) return;
      if (e.tipo === 'texto' && e.texto) { quitarEsc(); cj.insertAdjacentHTML('beforeend', `<div class="burb ia">${md(e.texto)}</div>`); abajo(); }
      else if (e.tipo === 'herramienta') { quitarEsc(); cj.insertAdjacentHTML('beforeend', `<div class="paso" id="p-${esc(e.id)}"><span class="giro"></span><span>${esc(e.nombre)}${e.resumen ? ' · ' + esc(String(e.resumen).slice(0, 60)) : ''}</span></div>`); ponerEsc(); abajo(); try { E.robot?.hud(String(e.nombre).toUpperCase(), 2, 'trabajando'); } catch { } }
      else if (e.tipo === 'resultado') { const p = document.getElementById('p-' + e.id); if (p) { p.classList.add('hecho'); p.querySelector('.giro')?.replaceWith(document.createRange().createContextualFragment(ic('check'))); } }
      else if (e.tipo === 'error') { quitarEsc(); cj.insertAdjacentHTML('beforeend', `<div class="burb err">${esc(e.error)}</div>`); abajo(); }
      else if (e.tipo === 'aviso' && e.texto) { cj.insertAdjacentHTML('beforeend', `<div class="paso">${ic('alerta')}<span>${esc(e.texto)}</span></div>`); }
    }, ctl.signal);
  } catch (e) { if (!ctl.signal.aborted) { $('#msgs')?.insertAdjacentHTML('beforeend', `<div class="burb err">${esc(e.message)}</div>`); } }
  quitarEsc(); E.enCurso = null; botonEnviar(); robotEstado(); pintarCab();
  try { E.robot?.hud(tr('LISTO'), 2, 'listo'); } catch { }
  vibrar(15);
}
function botonEnviar() { const b = $('#env'); if (!b) return; b.classList.toggle('parar', !!E.enCurso); b.innerHTML = ic(E.enCurso ? 'parar' : 'enviar'); }
async function cancelarChat() { if (!E.enCurso) return; try { await api('POST', `/sesiones/${E.sesion}/cancelar`); } catch { } E.enCurso?.abort(); }

// ---------- voz: mantener para hablar ----------
function prepararMic(b) {
  let rec = null, trozos = [], cancelado = false, x0 = 0, t0 = 0;
  const puede = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  const empezar = async e => {
    e.preventDefault();
    if (!puede) return toast(isSecureContext ? tr('Este navegador no puede grabar audio') : tr('La voz necesita HTTPS (túnel o Tailscale). Ver docs/movil.md'), true);
    if (E.enCurso || rec) return;
    x0 = e.clientX; cancelado = false; t0 = Date.now();
    try { b.setPointerCapture?.(e.pointerId); } catch { }
    let flujoAudio;
    try { flujoAudio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return toast(tr('Sin permiso para el micrófono'), true); }
    const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    rec = new MediaRecorder(flujoAudio, tipo ? { mimeType: tipo } : undefined); trozos = [];
    rec.ondataavailable = ev => ev.data.size && trozos.push(ev.data);
    rec.onstop = async () => {
      flujoAudio.getTracks().forEach(t => t.stop());
      $('.grabando')?.remove(); b.classList.remove('on');
      const r = rec; rec = null;
      if (cancelado || Date.now() - t0 < 500) { if (!cancelado) toast(tr('Mantén pulsado mientras hablas')); return; }
      const blob = new Blob(trozos, { type: r.mimeType || 'audio/webm' });
      const aviso = document.createElement('div'); aviso.className = 'grabando'; aviso.innerHTML = `<span class="giro"></span>${tr('Transcribiendo…')}`; document.body.append(aviso);
      try { const j = await api('POST', '/voz/transcribir', undefined, { crudo: blob, tipo: blob.type }); aviso.remove(); if (j.texto) enviarChat(j.texto); else toast(tr('No te he entendido'), true); }
      catch (er) { aviso.remove(); toast(er.message, true); }
    };
    rec.start(); b.classList.add('on'); vibrar(25);
    const g = document.createElement('div'); g.className = 'grabando'; g.innerHTML = `<span class="ondas"><i></i><i></i><i></i><i></i><i></i></span>${tr('Suelta para enviar · desliza ← para cancelar')}`;
    document.body.append(g);
  };
  const soltar = () => { if (rec && rec.state === 'recording') rec.stop(); };
  b.addEventListener('pointerdown', empezar);
  b.addEventListener('pointerup', soltar); b.addEventListener('pointercancel', () => { cancelado = true; soltar(); });
  b.addEventListener('pointermove', e => { if (rec && x0 - e.clientX > 80 && !cancelado) { cancelado = true; vibrar(30); soltar(); toast(tr('Cancelado')); } });
  b.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------- permisos ----------
VISTAS.permisos = c => { c.innerHTML = '<div id="perms"></div>'; pintarPermisos(); cargarPermisos(); };
function pintarPermisos() {
  const caja = $('#perms'); if (!caja) return;
  if (!E.permisos.length) {
    caja.innerHTML = `<div class="vacio"><div class="gran">${ic('escudo')}</div><b>${tr('Todo en orden')}</b>${tr('Cuando {n} necesite tu permiso aparecerá aquí y te avisará.', { n: esc(E.nombre) })}</div>`;
    return;
  }
  caja.innerHTML = E.permisos.map(p => `<div class="perm ${p.peligro ? 'peligro' : ''}" data-id="${esc(p.id)}">
    <div class="arr"><span class="chip ${p.peligro ? 'mal' : 'aviso'}">${ic(p.peligro ? 'alerta' : 'escudo')}${esc(p.origen)}</span><span class="chip">${esc(p.herramienta)}</span><span class="hace">${hace(p.creado)}</span></div>
    <pre>${esc(p.resumen)}</pre>
    ${p.peligro ? `<div class="riesgo">${ic('alerta')}<span>${tr('Peligroso: {x}', { x: esc(tr(p.peligro)) })}</span></div>` : ''}
    <div class="fila-btn"><button class="btn mal" data-d="deny">${ic('x')}${tr('Denegar')}</button><button class="btn pri" data-d="allow">${ic(!p.peligro ? 'check' : passkeyPosible() && E.yo?.passkeys ? 'huella' : 'candado')}${tr('Permitir')}</button></div>
    ${p.peligro ? '' : `<button class="btn fantasma ancho chico" data-d="always" style="margin-top:6px">${tr('Permitir siempre esto')}</button>`}</div>`).join('');
  caja.onclick = async e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const el = b.closest('[data-id]'), p = E.permisos.find(x => x.id === el.dataset.id); if (!p) return;
    vibrar(10);
    $$('button', el).forEach(x => x.disabled = true);
    const ok = await decidir(p, b.dataset.d);
    if (ok) { el.style.transition = 'opacity .25s, transform .25s'; el.style.opacity = 0; el.style.transform = 'translateX(' + (b.dataset.d === 'deny' ? '-' : '') + '40px)'; setTimeout(cargarPermisos, 250); }
    else $$('button', el).forEach(x => x.disabled = false);
  };
}
// decide un permiso; lo peligroso pide passkey (si hay) o PIN
async function decidir(p, decision) {
  let prueba;
  if (decision !== 'deny' && p.peligro) {
    prueba = await pruebaPeligro(p);
    if (!prueba) return false;
  }
  try {
    await api('POST', `/movil/permisos/${encodeURIComponent(p.id)}`, { decision, prueba });
    toast(decision === 'deny' ? tr('Denegado') : tr('Permitido'));
    vibrar(decision === 'deny' ? 30 : [15, 30, 15]);
    return true;
  } catch (e) { toast(e.message, true); if (e.status === 404) cargarPermisos(); return false; }
}
const passkeyPosible = () => !!(window.PublicKeyCredential && isSecureContext && navigator.credentials);
async function pruebaPeligro(p) {
  const conHuella = passkeyPosible() && (E.yo?.passkeys || 0) > 0;
  const html = `<h2>${tr('Acción peligrosa')}</h2><p class="sub">${tr('Vas a permitir esto en tu ordenador:')}</p>
    <div class="perm peligro" style="animation:none"><pre>${esc(p.resumen)}</pre><div class="riesgo">${ic('alerta')}<span>${esc(tr(p.peligro))}</span></div></div>
    <div class="huella">${conHuella ? `<div class="gran">${ic('huella')}</div>` : ''}
    <button class="btn malpri ancho" data-cerrar="${conHuella ? 'huella' : 'pin'}">${ic(conHuella ? 'huella' : 'candado')}${tr(conHuella ? 'Confirmar con huella o cara' : 'Confirmar con mi PIN')}</button>
    ${conHuella ? `<button class="btn fantasma ancho chico" data-cerrar="pin">${tr('Usar el PIN')}</button>` : ''}<button class="btn ancho" data-cerrar="">${tr('Cancelar')}</button></div>`;
  const via = await hoja(html);
  if (via === 'pin') { const pin = await pedirPin(tr('Escribe tu PIN'), tr('El que elegiste al emparejar este móvil')); return pin ? { tipo: 'pin', pin } : null; }
  if (via !== 'huella') return null;
  try {
    const r = await api('POST', '/movil/reto', { permiso: p.id });
    const a = await navigator.credentials.get({ publicKey: { challenge: desB64u(r.reto), allowCredentials: r.credenciales.map(id => ({ type: 'public-key', id: desB64u(id) })), userVerification: 'required', timeout: 60000 } });
    return { tipo: 'passkey', reto: r.reto, id: a.id, clientDataJSON: b64u(a.response.clientDataJSON), authenticatorData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature) };
  } catch (e) { toast(e.name === 'NotAllowedError' ? tr('Cancelado') : e.message, true); return null; }
}

// ---------- turno de noche ----------
VISTAS.turno = async (c, refresco) => {
  if (!refresco) c.innerHTML = `<div class="tarj"><label class="campo" style="margin-bottom:10px"><span>${tr('Nuevo encargo para esta noche')}</span>
    <textarea id="tnTxt" placeholder="${tr('Ej.: revisa los issues abiertos y arregla los fáciles')}"></textarea></label><button class="btn pri ancho" id="tnAdd">${ic('mas')}${tr('Añadir a la cola')}</button></div><div id="tnEstado"></div>`;
  if (!refresco) $('#tnAdd').onclick = async () => {
    const texto = $('#tnTxt').value.trim(); if (!texto) return toast(tr('Escribe el encargo'), true);
    try { await api('POST', '/turno', { texto }); $('#tnTxt').value = ''; toast(tr('Añadido a la cola')); vibrar(15); VISTAS.turno(c, true); } catch (e) { toast(e.message, true); }
  };
  let d; try { d = E.turno = await api('GET', '/turno'); } catch (e) { $('#tnEstado').innerHTML = `<p class="tenue">${esc(e.message)}</p>`; return; }
  const caja = $('#tnEstado'); if (!caja) return;
  const chipE = { pendiente: '', trabajando: 'info', hecho: 'ok', error: 'mal', espera: 'aviso', cancelado: '' };
  const cola = (d.cola || []).slice().reverse().slice(0, 30);
  const inf = (d.informes || [])[0];
  caja.innerHTML = `<div class="sec">${tr('Estado')}</div><div class="lista">
      <div class="it"><span class="ic">${ic('luna')}</span><span class="tx"><b>${d.activo ? tr('Turno en marcha') : tr('Turno parado')}</b><small>${tr('Ventana {a}–{b} · informe a las {c}', { a: esc(d.ventana?.desde || '—'), b: esc(d.ventana?.hasta || '—'), c: esc(d.informe || '—') })}</small></span><span class="der">${d.activo ? '<span class="giro"></span>' : ''}</span></div>
      ${inf ? `<div class="it"><span class="ic">${ic('estrella')}</span><span class="tx"><b>${esc(inf.titular || tr('Último informe'))}</b><small>${hace(inf.creado || inf.fin || inf.t)}</small></span></div>` : ''}</div>
    <div class="sec">${tr('Cola')}<span class="n">${(d.cola || []).filter(e => e.estado === 'pendiente').length}</span></div>
    ${cola.length ? `<div class="lista">${cola.map(e => `<div class="it"><span class="tx"><b style="white-space:normal">${esc(e.texto)}</b><small>${hace(e.creado)}${e.rama ? ' · ' + esc(e.rama) : ''}</small></span><span class="der"><span class="chip ${chipE[e.estado] || ''}">${esc(tr(e.estado))}</span></span></div>`).join('')}</div>`
    : `<div class="vacio" style="padding:26px"><b>${tr('Cola vacía')}</b>${tr('Déjale encargos y trabajará mientras duermes.')}</div>`}`;
};
function hojaEncargo() {
  hoja(`<h2>${tr('Encargo para esta noche')}</h2><p class="sub">${tr('{n} lo hará en el turno de noche y te dejará un informe por la mañana.', { n: esc(E.nombre) })}</p>
    <label class="campo"><textarea id="heTxt" placeholder="${tr('Ej.: revisa los issues abiertos y arregla los fáciles')}"></textarea></label>
    <div class="fila-btn"><button class="btn" data-cerrar="">${tr('Cancelar')}</button><button class="btn pri" id="heOk">${tr('Añadir')}</button></div>`, {
    alAbrir(v, cerrar) {
      setTimeout(() => $('#heTxt', v)?.focus(), 300);
      $('#heOk', v).onclick = async () => {
        const texto = $('#heTxt', v).value.trim(); if (!texto) return;
        try { await api('POST', '/turno', { texto }); toast(tr('Añadido a la cola')); vibrar(15); cerrar(true); } catch (e) { toast(e.message, true); }
      };
    },
  });
}

// ---------- ajustes ----------
VISTAS.ajustes = c => {
  const y = E.yo || {};
  const pushPosible = 'PushManager' in window && 'serviceWorker' in navigator && isSecureContext;
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const motivoHttps = tr('Necesita HTTPS: abre la app por el túnel o Tailscale (docs/movil.md).');
  c.innerHTML = `<div class="sec">${tr('Este móvil')}</div><div class="lista">
      <div class="ajuste"><span class="ic it" style="padding:0"><span class="ic">${ic('movil')}</span></span><div class="tx"><b>${esc(y.nombre || '…')}</b><small>${tr('Emparejado {x}', { x: hace(y.creado) })}${y.ip ? ' · ' + esc(y.ip) : ''}</small></div><button class="btn chico" id="ajNom">${tr('Renombrar')}</button></div></div>
    <div class="sec">${tr('Seguridad')}</div><div class="lista">
      <div class="ajuste"><div class="tx"><b>${tr('Huella o cara')}</b><small>${passkeyPosible() ? (y.passkeys ? tr('Activada: se pide para lo peligroso') : tr('Aprueba lo peligroso con tu huella en vez del PIN')) : motivoHttps}</small></div>
        ${passkeyPosible() ? (y.passkeys ? `<button class="btn chico" id="ajPkOff">${tr('Quitar')}</button>` : `<button class="btn pri chico" id="ajPk">${tr('Activar')}</button>`) : `<span class="chip">${tr('No disponible')}</span>`}</div>
      <div class="ajuste"><div class="tx"><b>${tr('PIN')}</b><small>${tr('Lo elegiste al emparejar. 5 fallos bloquean este móvil.')}</small></div><span class="chip ok">${ic('candado')}${tr('Activo')}</span></div></div>
    <div class="sec">${tr('Notificaciones')}</div><div class="lista">
      <div class="ajuste"><div class="tx"><b>${tr('Avisos push')}</b><small>${pushPosible ? (y.push ? tr('Te aviso de permisos y avisos urgentes') : tr('Permisos pendientes y avisos urgentes, aunque la app esté cerrada')) : motivoHttps + ' ' + tr('Mientras, Telegram te avisa.')}</small></div>
        ${pushPosible ? (y.push ? `<button class="btn chico" id="ajPushOff">${tr('Desactivar')}</button>` : `<button class="btn pri chico" id="ajPush">${tr('Activar')}</button>`) : `<span class="chip">${tr('No disponible')}</span>`}</div></div>
    <div class="sec">${tr('App')}</div><div class="lista">
      <div class="ajuste"><div class="tx"><b>${tr('Idioma')}</b></div><div class="seg" id="ajIdi">${Object.entries(I18N.idiomas).map(([k, n]) => `<button data-v="${k}" class="${I18N.idioma() === k ? 'on' : ''}">${esc(n)}</button>`).join('')}</div></div>
      <div class="ajuste"><div class="tx"><b>${tr('Instalar en la pantalla de inicio')}</b><small>${instalada ? tr('Ya está instalada') : /iPhone|iPad/.test(navigator.userAgent) ? tr('En Safari: Compartir → Añadir a pantalla de inicio') : tr('Abre el menú del navegador → Instalar app')}</small></div>${!instalada && E.instalar ? `<button class="btn pri chico" id="ajInst">${ic('descarga')}${tr('Instalar')}</button>` : ''}</div></div>
    <button class="btn mal ancho" id="ajSalir" style="margin-top:24px">${ic('salir')}${tr('Desemparejar este móvil')}</button>
    <p class="tenue peq" style="text-align:center;margin-top:14px">${esc(E.nombre)} · ${esc(location.host)}${isSecureContext ? ' · ' + ic('candado') : ''}</p>`;
  $('#ajIdi').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; I18N.poner(b.dataset.v); try { localStorage.setItem('rc.idioma', JSON.stringify(b.dataset.v)); } catch { } api('PATCH', '/movil/yo', { idioma: b.dataset.v }).catch(() => { }); montarApp(); };
  $('#ajNom').onclick = () => hoja(`<h2>${tr('Nombre de este móvil')}</h2><label class="campo"><input id="nmIn" maxlength="40" value="${esc(y.nombre || '')}"></label><div class="fila-btn"><button class="btn" data-cerrar="">${tr('Cancelar')}</button><button class="btn pri" id="nmOk">${tr('Guardar')}</button></div>`, {
    alAbrir(v, cerrar) { $('#nmOk', v).onclick = async () => { try { E.yo = { ...E.yo, ...(await api('PATCH', '/movil/yo', { nombre: $('#nmIn', v).value })) }; cerrar(true); ruta(); } catch (e) { toast(e.message, true); } }; },
  });
  $('#ajPk')?.addEventListener('click', activarPasskey);
  $('#ajPkOff')?.addEventListener('click', async () => { await api('DELETE', '/movil/passkey').catch(e => toast(e.message, true)); E.yo.passkeys = 0; ruta(); });
  $('#ajPush')?.addEventListener('click', activarPush);
  $('#ajPushOff')?.addEventListener('click', async () => {
    try { const reg = await navigator.serviceWorker.ready; (await reg.pushManager.getSubscription())?.unsubscribe(); } catch { }
    await api('DELETE', '/movil/push').catch(() => { }); E.yo.push = false; ruta();
  });
  $('#ajInst')?.addEventListener('click', async () => { E.instalar.prompt(); await E.instalar.userChoice.catch(() => { }); E.instalar = null; ruta(); });
  $('#ajSalir').onclick = async () => {
    const ok = await hoja(`<h2>${tr('¿Desemparejar este móvil?')}</h2><p class="sub">${tr('Tendrás que escanear un QR nuevo para volver a conectarlo.')}</p><div class="fila-btn"><button class="btn" data-cerrar="">${tr('Cancelar')}</button><button class="btn malpri" data-cerrar="si">${tr('Desemparejar')}</button></div>`);
    if (ok !== 'si') return;
    await api('DELETE', '/movil/yo').catch(() => { });
    desemparejado();
  };
};
async function activarPasskey() {
  const pin = await pedirPin(tr('Escribe tu PIN'), tr('Para activar la huella o la cara en este móvil'));
  if (!pin) return;
  try {
    const o = await api('POST', '/movil/passkey/opciones', { pin });
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: desB64u(o.reto), rp: { name: o.rp }, user: { id: desB64u(o.usuario.id), name: o.usuario.nombre, displayName: o.usuario.nombre },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000, attestation: 'none',
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      excludeCredentials: (o.excluir || []).map(id => ({ type: 'public-key', id: desB64u(id) })) } });
    const r = cred.response, pk = r.getPublicKey?.();
    if (!pk) throw new Error(tr('Este navegador no da la clave pública de la passkey'));
    await api('POST', '/movil/passkey/registrar', { reto: o.reto, id: cred.id, alg: r.getPublicKeyAlgorithm?.() ?? -7, publicKey: b64u(pk), clientDataJSON: b64u(r.clientDataJSON), authenticatorData: r.getAuthenticatorData ? b64u(r.getAuthenticatorData()) : undefined });
    E.yo.passkeys = 1; toast(tr('Huella activada')); vibrar([15, 30, 15]); ruta();
  } catch (e) { toast(e.name === 'NotAllowedError' ? tr('Cancelado') : e.message, true); }
}
async function activarPush() {
  try {
    if (await Notification.requestPermission() !== 'granted') return toast(tr('Sin permiso para notificaciones'), true);
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desB64u(E.yo.vapid) });
    await api('POST', '/movil/push', { suscripcion: sub.toJSON() });
    E.yo.push = true; toast(tr('Avisos activados')); ruta();
  } catch (e) { toast(e.message, true); }
}
async function bienvenida() {
  await hoja(`<div class="huella"><div class="gran">${ic('check')}</div></div><h2 style="text-align:center">${tr('¡Conectado!')}</h2>
    <p class="sub" style="text-align:center">${tr('Ya puedes hablar con {n}, aprobar permisos y dejarle encargos desde aquí.', { n: esc(E.nombre) })}</p>
    <div class="nota">${isSecureContext ? tr('En <b>Ajustes</b> puedes activar la huella y los avisos push.') : tr('Estás por <b>http</b> en la red local: la huella, los avisos push y la voz necesitan HTTPS. Aprobarás lo peligroso con tu PIN.')}</div>
    <button class="btn pri ancho" data-cerrar="" style="margin-top:16px">${tr('Empezar')}</button>`);
}

arrancar();
