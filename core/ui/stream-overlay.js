// Overlay de OBS de APOLO co-host (lo sirve /stream/overlay?clave=…). Escucha /stream/eventos (SSE con la clave de solo lectura)
// y pinta: robot 3D con gestos, bocadillo con efecto máquina de escribir, subtítulos, alertas, encuesta y "lo que hace el agente".
// Parámetros: formato=vertical|horizontal (si no, por la proporción), demo=1 (escena de ejemplo en bucle) | demo=fijo (todo a la vez, para capturas),
// fondo=juego (juego falso detrás, para previsualizar), robot=0 (sin robot).
import { createRobot } from '/robot3d.js';

const q = new URLSearchParams(location.search);
const clave = q.get('clave') || '';
const demo = q.get('demo');
const $ = s => document.querySelector(s);
const raiz = document.documentElement;
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const espera = ms => new Promise(ok => setTimeout(ok, ms));

// ---------- formato ----------
function formato() {
  const f = q.get('formato');
  raiz.classList.toggle('vertical', f ? f === 'vertical' : innerHeight > innerWidth * 1.15);
}
formato(); addEventListener('resize', () => { formato(); if (q.get('fondo') === 'juego') pintarJuego(); });

// ---------- textos (es/en) ----------
let idioma = (q.get('idioma') || navigator.language || 'es').slice(0, 2) === 'en' ? 'en' : 'es';
const TXT = {
  es: { rol: 'co-host IA', sub: 'Nueva suscripción', regalo: 'Subs regaladas', raid: 'Raid', bits: 'Bits', donacion: 'Donación', seguidor: 'Nuevo seguidor', anuncio: 'Anuncio', encuesta: 'Encuesta', votos: 'votos', vota: 'Vota con !voto 1, 2, 3…', gana: 'Gana', meses: 'meses', personas: 'personas' },
  en: { rol: 'AI co-host', sub: 'New subscriber', regalo: 'Gifted subs', raid: 'Raid', bits: 'Bits', donacion: 'Donation', seguidor: 'New follower', anuncio: 'Announcement', encuesta: 'Poll', votos: 'votes', vota: 'Vote with !vote 1, 2, 3…', gana: 'Winner', meses: 'months', personas: 'people' },
};
const T = k => TXT[idioma][k] || TXT.es[k] || k;

// ---------- robot ----------
let robot = null;
if (q.get('robot') !== '0') {
  try { robot = createRobot($('#robot'), '/casco.glb', { animacion: 'vitrina', log: ['> co-host en directo', '> leyendo el chat…'] }); }
  catch (e) { console.warn('sin WebGL:', e); $('#robot').style.visibility = 'hidden'; }
}
const gesto = (g, s = 3) => { try { if (g) robot?.gesto(g, s); } catch { } };

// ---------- bocadillo + subtítulos + voz (una frase detrás de otra) ----------
const frases = []; let hablando = false, audio = null, cortar = null;
function decir(e) { frases.push(e); if (frases.length > 6) frases.shift(); if (!hablando) siguiente(); }
async function siguiente() {
  const e = frases.shift(); if (!e) { hablando = false; return; }
  hablando = true; document.body.classList.add('hablando');
  const caja = $('#bocadillo'), txt = caja.querySelector('.txt'), quien = caja.querySelector('.quien');
  let cancelado = false; cortar = () => { cancelado = true; };
  quien.innerHTML = e.a ? `<b>@${esc(e.a)}</b>${e.pregunta ? ` · ${esc(e.pregunta)}` : ''}` : ''; quien.style.display = e.a ? '' : 'none';
  txt.textContent = '';
  if (conf.bocadillo !== false) { caja.classList.add('on'); document.body.classList.add('bocadillo-on'); }
  try { robot?.setState('trabajando'); } catch { }
  gesto(e.gesto, 3.5);
  // voz
  let finAudio = Promise.resolve(), durAudio = 0;
  if (e.audio && clave) {
    audio = new Audio(`/stream/audio/${encodeURIComponent(e.id)}?clave=${encodeURIComponent(clave)}`);
    finAudio = new Promise(ok => { audio.onended = ok; audio.onerror = ok; setTimeout(ok, 30_000); });
    audio.onloadedmetadata = () => { durAudio = audio.duration * 1000 || 0; };
    audio.play().catch(() => { });
  }
  // máquina de escribir
  const total = e.texto.length, paso = Math.max(14, Math.min(40, 2400 / Math.max(1, total)));
  const tSubs = subtitulos(e.texto, () => durAudio);
  for (let i = 1; i <= total && !cancelado; i++) {
    txt.innerHTML = esc(e.texto.slice(0, i)) + '<span class="cursor"></span>';
    await espera(paso);
  }
  if (!cancelado) txt.textContent = e.texto;
  await Promise.race([Promise.all([finAudio, espera(e.audio ? 0 : 1200 + total * 45), tSubs]), new Promise(ok => { const t = setInterval(() => { if (cancelado) { clearInterval(t); ok(); } }, 100); })]);
  if (!cancelado) await espera(demo === 'fijo' ? 1e9 : 1300);
  caja.classList.remove('on'); document.body.classList.remove('bocadillo-on', 'hablando'); $('#subs').classList.remove('on');
  try { robot?.setState('reposo'); } catch { }
  audio = null; cortar = null;
  await espera(350); siguiente();
}
// trozos de ~7 palabras repartidos en lo que dura el audio (o por longitud si no hay voz)
async function subtitulos(texto, dur) {
  if (conf.subtitulos === false) return;
  const palabras = texto.split(/\s+/), trozos = [];
  for (let i = 0; i < palabras.length; i += 7) trozos.push(palabras.slice(i, i + 7).join(' '));
  const s = $('#subs'), span = s.querySelector('span');
  s.classList.add('on');
  await espera(250);
  for (const t of trozos) {
    span.textContent = t;
    const total = dur() || (1200 + texto.length * 45);
    await espera(Math.max(900, total * (t.length / texto.length)));
    if (!s.classList.contains('on')) return;
  }
}
function callar() {
  frases.length = 0;
  try { audio?.pause(); } catch { }
  cortar?.();
  $('#bocadillo').classList.remove('on'); $('#subs').classList.remove('on');
}

// ---------- alertas ----------
const COLOR = { sub: '#a78bfa', regalo: '#ff5fa2', raid: '#ff6a3d', bits: '#5ab0ff', donacion: '#f5c542', seguidor: '#2bdc7c', anuncio: '#22c3a6' };
const ICONO = { sub: '★', regalo: '🎁', raid: '⚔', bits: '◆', donacion: '$', seguidor: '♥', anuncio: '📣' };
const colaAlertas = []; let enAlerta = false;
function alerta(a) { if (conf.alertas === false) return; colaAlertas.push(a); if (!enAlerta) otraAlerta(); }
async function otraAlerta() {
  const a = colaAlertas.shift(); if (!a) { enAlerta = false; return; }
  enAlerta = true;
  const el = document.createElement('div'); el.className = 'alerta'; el.style.setProperty('--c', COLOR[a.tipo] || 'var(--acento)');
  const cant = a.cantidad ? (a.tipo === 'raid' ? `${a.cantidad} ${T('personas')}` : a.tipo === 'sub' && +a.cantidad > 1 ? `${a.cantidad} ${T('meses')}` : a.tipo === 'regalo' ? `×${a.cantidad}` : a.tipo === 'bits' ? `${a.cantidad} bits` : String(a.cantidad)) : '';
  el.innerHTML = `<div class="ico">${ICONO[a.tipo] || '★'}</div><div><div class="tit">${esc(T(a.tipo))}</div><div class="nom">${esc(a.usuario)}${cant ? ` <em>${esc(cant)}</em>` : ''}</div>${a.texto ? `<div class="msg">${esc(a.texto)}</div>` : ''}</div>`;
  $('#alertas').appendChild(el);
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('i'); c.className = 'confeti';
    const ang = Math.random() * Math.PI * 2, r = 220 + Math.random() * 380;
    c.style.cssText = `--x:${Math.cos(ang) * r * innerWidth / 1920}px;--y:${Math.sin(ang) * r * .6 * innerWidth / 1920 + 80}px;--r:${Math.random() * 720 - 360}deg;background:${['#fff', COLOR[a.tipo] || '#2bdc7c', '#ffd34d', '#ff5fa2', '#5ab0ff'][i % 5]};animation-delay:${Math.random() * .25}s`;
    el.appendChild(c);
  }
  await espera(demo === 'fijo' ? 1e9 : 6000);
  el.classList.add('fuera'); await espera(500); el.remove();
  otraAlerta();
}

// ---------- encuesta ----------
let encuesta = null, relojEnc = null;
function pintarEncuesta(e, ganadora) {
  const caja = $('#encuesta');
  if (!e) { caja.classList.remove('on'); clearInterval(relojEnc); return; }
  encuesta = e;
  const total = e.opciones.reduce((s, o) => s + o.votos, 0) || 0;
  caja.innerHTML = `<div class="cab">◉ ${esc(T('encuesta'))}<span class="t" id="encT"></span></div><h3>${esc(e.pregunta)}</h3>${e.opciones.map((o, i) => {
    const pct = total ? Math.round(o.votos / total * 100) : 0;
    return `<div class="op ${ganadora && ganadora === o.texto ? 'gana' : ''}"><i style="width:${pct}%"></i><span class="n">${i + 1}</span><span>${esc(o.texto)}</span><span class="v">${pct}% · ${o.votos}</span></div>`;
  }).join('')}<div class="pie">${ganadora ? `🏆 ${esc(T('gana'))}: ${esc(ganadora)}` : esc(T('vota'))}</div>`;
  caja.classList.add('on');
  clearInterval(relojEnc);
  const reloj = () => { const s = Math.max(0, Math.round((e.hasta - Date.now()) / 1000)); const t = $('#encT'); if (t) t.textContent = ganadora ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  reloj(); if (!ganadora) relojEnc = setInterval(reloj, 1000);
  if (ganadora && demo !== 'fijo') setTimeout(() => { if (encuesta === e) pintarEncuesta(null); }, 9000);
}

// ---------- agente ----------
function agente(t) { const a = $('#agente'); a.textContent = t || ''; a.classList.toggle('on', !!t && conf.agente !== false); }

// ---------- config ----------
let conf = { bocadillo: true, subtitulos: true, alertas: true, agente: false, robot: true, color: '#2bdc7c' };
function aplicar(c = {}, nombre) {
  conf = { ...conf, ...c };
  if (/^#[0-9a-f]{6}$/i.test(conf.color || '')) raiz.style.setProperty('--acento', conf.color);
  raiz.classList.toggle('sin-robot', conf.robot === false);
  if (nombre) $('#nombre').textContent = nombre;
  $('#rol').textContent = T('rol');
  if (conf.agente === false) agente('');
}

// ---------- eventos del núcleo ----------
function manejar(e) {
  switch (e.tipo) {
    case 'hola': if (e.idioma && !q.get('idioma')) idioma = e.idioma === 'en' ? 'en' : 'es'; aplicar(e.overlay, e.nombre); raiz.classList.toggle('panico', !!e.panico); pintarEncuesta(e.encuesta); agente(e.agente); break;
    case 'config': aplicar(e.overlay, e.nombre); break;
    case 'decir': decir(e); break;
    case 'gesto': gesto(e.gesto, 3); break;
    case 'alerta': alerta(e.alerta); break;
    case 'encuesta': pintarEncuesta(e.encuesta); break;
    case 'encuesta-fin': pintarEncuesta(e.encuesta, e.ganadora || ''); break;
    case 'agente': agente(e.texto); break;
    case 'callar': callar(); break;
    case 'panico': callar(); colaAlertas.length = 0; $('#alertas').innerHTML = ''; pintarEncuesta(null); agente(''); raiz.classList.add('panico'); try { robot?.setState('dormido'); } catch { } break;
    case 'reanudar': raiz.classList.remove('panico'); try { robot?.setState('reposo'); } catch { } break;
    case 'clave-revocada': fuente?.close(); callar(); break;
  }
}
let fuente = null;
if (!demo && clave) {
  fuente = new EventSource(`/stream/eventos?clave=${encodeURIComponent(clave)}`);
  fuente.onmessage = m => { try { manejar(JSON.parse(m.data)); } catch { } };
}

// ---------- fondo de juego falso (previsualización) ----------
function pintarJuego() {
  const c = $('#juego'), W = c.width = innerWidth, H = c.height = innerHeight, x = c.getContext('2d'), k = Math.min(W, H) / 1080;
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b2a4a'); g.addColorStop(.45, '#c4633f'); g.addColorStop(.62, '#f2b25c'); g.addColorStop(1, '#2a1a12');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,230,170,.9)'; x.beginPath(); x.arc(W * .68, H * .5, 70 * k, 0, 7); x.fill();
  const montes = (base, alto, color, sem) => { x.fillStyle = color; x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= 40; i++) { const px = i / 40 * W; x.lineTo(px, H * base - Math.abs(Math.sin(i * 1.7 + sem) * alto + Math.sin(i * .45 + sem * 2) * alto * .6) * k); } x.lineTo(W, H); x.fill(); };
  montes(.58, 120, '#5b2f3a', 1); montes(.66, 90, '#3a1f2c', 4); montes(.76, 70, '#21141d', 7);
  // castillo
  x.fillStyle = '#140c12'; const cx = W * .22, cy = H * .62; x.fillRect(cx, cy - 160 * k, 40 * k, 160 * k); x.fillRect(cx + 40 * k, cy - 100 * k, 90 * k, 100 * k); x.fillRect(cx + 130 * k, cy - 210 * k, 34 * k, 210 * k);
  for (let i = 0; i < 4; i++) x.fillRect(cx + 40 * k + i * 24 * k, cy - 116 * k, 12 * k, 16 * k);
  // suelo
  g = x.createLinearGradient(0, H * .78, 0, H); g.addColorStop(0, '#2d1d16'); g.addColorStop(1, '#0d0806'); x.fillStyle = g; x.fillRect(0, H * .78, W, H * .22);
  // personaje
  x.save(); x.translate(W * .45, H * .86); x.scale(k, k); x.fillStyle = '#0b0708';
  x.fillRect(-14, -120, 28, 70); x.beginPath(); x.arc(0, -138, 18, 0, 7); x.fill(); x.fillRect(-12, -50, 10, 50); x.fillRect(4, -50, 10, 50);
  x.save(); x.rotate(-.7); x.fillStyle = '#d8e2ea'; x.fillRect(20, -150, 6, 110); x.restore(); x.restore();
  // HUD de juego
  const hud = (px, py, w, col, val, txt) => { x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(px, py, w, 18 * k); x.fillStyle = col; x.fillRect(px + 3 * k, py + 3 * k, (w - 6 * k) * val, 12 * k); x.fillStyle = '#fff'; x.font = `${13 * k}px system-ui`; x.fillText(txt, px, py - 6 * k); };
  hud(40 * k, 50 * k, 420 * k, '#c0392b', .72, 'HP'); hud(40 * k, 92 * k, 300 * k, '#27ae60', .45, 'STAMINA');
  x.fillStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.arc(W - 120 * k, 120 * k, 80 * k, 0, 7); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 2 * k; x.stroke(); x.fillStyle = '#ffd34d'; x.beginPath(); x.arc(W - 120 * k, 120 * k, 6 * k, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)'; x.font = `600 ${30 * k}px system-ui`; x.textAlign = 'center'; x.fillText('MARGIT, THE FELL OMEN', W / 2, H - 120 * k);
  hud(W / 2 - 400 * k, H - 100 * k, 800 * k, '#a8322a', .38, '');
}
if (q.get('fondo') === 'juego') { raiz.classList.add('con-fondo'); pintarJuego(); }

// ---------- demo ----------
async function escenaDemo() {
  manejar({ tipo: 'hola', nombre: 'APOLO', overlay: { agente: true }, encuesta: null });
  const fijo = demo === 'fijo';
  await espera(fijo ? 1500 : 800);
  manejar({ tipo: 'agente', texto: idioma === 'en' ? 'Searching the web' : 'Buscando en la web' });
  manejar({ tipo: 'decir', id: 'd1', a: 'NightOwl_77', pregunta: idioma === 'en' ? 'can he beat this boss?' : '¿le gana a este jefe?', texto: idioma === 'en' ? 'Third try against Margit... I believe! Well, statistically, I believe a little.' : 'Tercer intento contra Margit… ¡yo creo! Bueno, estadísticamente creo un poquito.', gesto: 'guino' });
  await espera(fijo ? 600 : 5000);
  manejar({ tipo: 'alerta', alerta: { tipo: 'raid', usuario: 'PixelKnight', cantidad: 42 } });
  await espera(fijo ? 300 : 3000);
  const hasta = Date.now() + 75_000;
  const e = { pregunta: idioma === 'en' ? 'Next try: win or lose?' : '¿Próximo intento: gana o pierde?', opciones: [{ texto: idioma === 'en' ? 'Wins 🏆' : 'Gana 🏆', votos: 18 }, { texto: idioma === 'en' ? 'Loses 💀' : 'Pierde 💀', votos: 31 }, { texto: idioma === 'en' ? 'Rage quits' : 'Rage quit', votos: 9 }], hasta };
  manejar({ tipo: 'encuesta', encuesta: e });
  if (fijo) return;
  for (let i = 0; i < 8; i++) { await espera(1500); e.opciones[i % 3].votos += 2 + (i % 4); manejar({ tipo: 'encuesta', encuesta: { ...e, opciones: e.opciones.map(o => ({ ...o })) } }); }
  manejar({ tipo: 'encuesta-fin', encuesta: e, ganadora: e.opciones[1].texto });
  manejar({ tipo: 'gesto', gesto: 'celebrar' });
  await espera(12000); manejar({ tipo: 'agente', texto: '' }); escenaDemo();
}
if (demo) escenaDemo();
window.overlayAPOLO = { manejar };   // para pruebas (Edge headless / panel)
