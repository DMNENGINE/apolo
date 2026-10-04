// Plugin de Stream Deck del Robot Companion (APOLO).
// Habla con Stream Deck por WebSocket (protocolo SDK v2) y con la app por HTTP local (127.0.0.1:47823, con la clave secreta).
// Teclas: Permitir · Denegar (mantener 2 s = PÁNICO) · Estado · Pánico/Reanudar · Micrófono · Abrir panel · Mensaje rápido ·
//         Uso del plan · Mover isla · Ir a la terminal · Modo Gamer. Las imágenes se dibujan en vivo (SVG 144x144).
const WebSocket = require('./node_modules/ws');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const port = +arg('-port'), uuid = arg('-pluginUUID'), registerEvent = arg('-registerEvent');
const logFile = path.join(__dirname, 'debug.log');
const log = m => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${m}\n`); } catch { } };
if (!port || !uuid) { log('faltan argumentos'); process.exit(1); }

const P = 'com.robotcompanion.';
const A = {
  allow: P + 'allow', deny: P + 'deny', status: P + 'status', panico: P + 'panico', micro: P + 'micro', panel: P + 'panel',
  mensaje: P + 'mensaje', uso: P + 'uso', isla: P + 'isla', terminal: P + 'terminal', gamer: P + 'gamer',
};
const contexts = new Map();          // context -> { action, settings, lastImg, ocupado }
const downAt = new Map();            // context -> ms de keyDown
let state = null, blink = false;

const token = () => { try { return fs.readFileSync(path.join(os.homedir(), '.claude', 'robot-companion.token'), 'utf8').trim(); } catch { return ''; } };
function req(method, p, cuerpo, timeout = 1500) {
  return new Promise(ok => {
    const data = cuerpo ? Buffer.from(JSON.stringify(cuerpo)) : null;
    const r = http.request({ host: '127.0.0.1', port: 47823, path: p, method, timeout,
      headers: { 'x-robot-token': token(), ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => ok({ code: res.statusCode, body: b }));
    });
    r.on('error', () => ok(null)); r.on('timeout', () => { r.destroy(); ok(null); });
    if (data) r.write(data);
    r.end();
  });
}

// ---------- dibujo de las teclas (SVG 144x144) ----------
const COL = { reposo: '#3ddc84', trabajando: '#35c8f0', permiso: '#ffb020', listo: '#3ddc84', error: '#ff4d4d', dormido: '#6a7bb0', off: '#4a4f57' };
const NOMBRE = { reposo: 'LISTO', trabajando: 'TRABAJANDO', permiso: 'PERMISO', listo: '¡HECHO!', error: 'ERROR', dormido: 'Zzz', off: 'APAGADO' };
const APAGADO = '#4a4f57';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = (body, fondo = '#07090c') => 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="${fondo}"/>${body}</svg>`);
const txt = (t, y, size, col, w = 700) => `<text x="72" y="${y}" font-family="Segoe UI,Arial" font-size="${size}" font-weight="${w}" fill="${col}" text-anchor="middle">${esc(t)}</text>`;
const corto = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const viva = () => !!state;          // la app contesta

function robotKey(st) {
  const c = COL[st] || COL.off, on = st !== 'off';
  const sleeping = st === 'dormido', x = st === 'error';
  const eye = cx => sleeping ? `<path d="M${cx - 9} 70 q9 7 18 0" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : x ? `<path d="M${cx - 8} 62 l16 16 M${cx + 8} 62 l-16 16" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`
    : `<circle cx="${cx}" cy="70" r="11" fill="#3cc8b4"/><circle cx="${cx - 3}" cy="66" r="4" fill="#fff"/>`;
  const glow = on && (st !== 'permiso' || blink) ? `<circle cx="72" cy="64" r="52" fill="none" stroke="${c}" stroke-width="4" opacity=".55"/>` : '';
  return svg(`${glow}<circle cx="72" cy="64" r="46" fill="#3a3f48"/><rect x="36" y="50" width="72" height="38" rx="9" fill="#080c10" stroke="${c}" stroke-width="3"/>${eye(56)}${eye(88)}${txt(NOMBRE[st] || st, 132, 19, c)}`);
}
function allowKey(s) {
  const p = s && s.perm;
  if (!p) return svg(`<path d="M44 74 l18 18 l38 -44" stroke="#2c3138" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${txt('PERMITIR', 128, 18, '#3a4048')}`);
  if (p.peligro) return svg(`<path d="M72 20 l40 70 h-80z" fill="none" stroke="#ff4d4d" stroke-width="6" stroke-linejoin="round"/>${txt('!', 80, 38, '#ff4d4d', 900)}${txt('MANTÉN 1s', 116, 19, '#ffb3b3')}${txt(p.tool, 136, 15, '#ff8a8a', 600)}`, blink ? '#5a0d0d' : '#3a0808');
  return svg(`<path d="M40 66 l20 20 l42 -48" stroke="#3ddc84" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${txt('PERMITIR', 118, 20, '#9ff0c0')}${txt(p.tool, 138, 15, '#3ddc84', 600)}`, blink ? '#0f3d24' : '#0a2a19');
}
function denyKey(s) {
  const p = s && s.perm;
  if (!p) return svg(`<path d="M48 40 l48 48 M96 40 l-48 48" stroke="#2c3138" stroke-width="12" stroke-linecap="round"/>${txt('DENEGAR', 118, 18, '#3a4048')}${txt('2 s = PÁNICO', 137, 13, '#5a3a3a', 600)}`);
  return svg(`<path d="M46 38 l52 52 M98 38 l-52 52" stroke="#ff4d4d" stroke-width="13" stroke-linecap="round"/>${txt('DENEGAR', 124, 20, '#ffb3b3')}`, '#2a0a0a');
}
function panicoKey(s) {
  const oct = (c, w) => `<polygon points="50,22 94,22 122,50 122,94 94,122 50,122 22,94 22,50" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;
  if (s && s.panico) return svg(`${oct('#ff4d4d', 7)}${txt('PARADO', 72, 22, '#ffb3b3', 900)}${txt('mantén 1s:', 96, 14, '#ff8a8a', 600)}${txt('REANUDAR', 114, 15, '#ffffff', 800)}`, blink ? '#5a0d0d' : '#3a0808');
  const c = viva() ? '#ff4d4d' : APAGADO;
  return svg(`${oct(c, 6)}${txt('STOP', 84, 30, c, 900)}${txt('PÁNICO', 140, 14, viva() ? '#ff8a8a' : APAGADO, 700)}`);
}
function microKey(c) {
  const col = c.ocupado ? '#ffffff' : viva() ? '#35c8f0' : APAGADO;
  return svg(`${c.ocupado ? '<circle cx="72" cy="58" r="50" fill="#35c8f0" opacity=".25"/>' : ''}<rect x="54" y="20" width="36" height="62" rx="18" fill="none" stroke="${col}" stroke-width="8"/><path d="M38 62 a34 34 0 0 0 68 0" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"/><path d="M72 96 v14" stroke="${col}" stroke-width="8" stroke-linecap="round"/>${txt(c.ocupado ? 'TE ESCUCHO' : 'HABLAR', 136, 17, col)}`);
}
const PAGINAS = { '': 'INICIO', '/chat': 'CHAT', '/agentes': 'MISSION', '/turno': 'TURNO', '/auto': 'TAREAS', '/skills': 'SKILLS', '/memoria': 'MEMORIA',
  '/wrapped': 'WRAPPED', '/uso': 'USO', '/reuniones': 'REUNIONES', '/dashboards': 'TABLEROS', '/stream': 'STREAM', '/avatar': 'AVATAR', '/ajustes': 'AJUSTES' };
function panelKey(c) {
  const col = viva() ? '#3ddc84' : APAGADO, r = (c.settings && c.settings.ruta) || '';
  const barras = [[44, 26], [62, 40], [80, 18], [98, 32]].map(([x, h]) => `<path d="M${x} 88 v-${h}" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`).join('');
  return svg(`<rect x="26" y="22" width="92" height="76" rx="10" fill="none" stroke="${col}" stroke-width="7"/><path d="M26 40 h92" stroke="${col}" stroke-width="6"/>${barras}${txt(corto(PAGINAS[r] || r.replace('/', '').toUpperCase() || 'PANEL', 10), 130, 19, col)}`);
}
function mensajeKey(c) {
  const col = c.ocupado ? '#ffffff' : viva() ? '#b58cff' : APAGADO, s = c.settings || {};
  const etiqueta = corto(s.titulo || s.texto || 'CONFIGÚRAME', 12);
  const activo = c.ocupado ? Math.floor(Date.now() / 300) % 3 : -1;
  const puntos = [0, 1, 2].map(i => `<circle cx="${50 + i * 22}" cy="56" r="7" fill="${col}" opacity="${activo < 0 || activo === i ? 1 : .35}"/>`).join('');
  return svg(`<rect x="24" y="22" width="96" height="66" rx="18" fill="none" stroke="${col}" stroke-width="7"/><path d="M44 86 v20 l22 -20" fill="${col}"/>${puntos}${txt(etiqueta, 134, etiqueta.length > 9 ? 15 : 18, col)}`);
}
function usoKey(s) {
  const u = s && s.uso;
  if (!u) return svg(`<path d="M30 96 a42 42 0 0 1 84 0" fill="none" stroke="${APAGADO}" stroke-width="10" stroke-linecap="round"/>${txt('USO', 132, 19, APAGADO)}`);
  const p = Math.max(u.p5 || 0, 0), pc = Math.round(p * 100), col = p >= .92 ? '#ff4d4d' : p >= .8 ? '#ffb020' : '#3ddc84';
  const a = Math.PI * (1 - Math.min(p, 1)), x = 72 + 42 * Math.cos(a), y = 96 - 42 * Math.sin(a);
  const arco = p > 0 ? `<path d="M30 96 A42 42 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"/>` : '';
  // sin límite aprendido todavía (limites.json en null) no hay %: se enseñan los tokens de hoy
  const sabe = !!(u.p5 || u.pW);
  const abajo = u.pausado ? 'CEREBRO PAUSA' : u.pW ? `${Math.round(u.pW * 100)}% semana` : `${u.msgs || 0} mensajes hoy`;
  return svg(`<path d="M30 96 a42 42 0 0 1 84 0" fill="none" stroke="#1d2228" stroke-width="10" stroke-linecap="round"/>${arco}${txt(sabe ? pc + '%' : `${Math.round((u.tokens || 0) / 1e5) / 10}M`, 92, 26, sabe ? col : '#9aa6b2', 800)}${txt(sabe ? '5 h' : 'tokens hoy', 30, 14, '#7b8794', 600)}${txt(abajo, 132, 15, u.pausado ? '#ff8a8a' : '#9aa6b2', 600)}`);
}
function islaKey(s) {
  const col = viva() ? '#35c8f0' : APAGADO, fuera = s && s.islaFuera;
  const desde = fuera ? 102 : 42, hasta = fuera ? 42 : 102, flecha = fuera ? -1 : 1;
  return svg(`<rect x="18" y="30" width="48" height="40" rx="7" fill="none" stroke="${col}" stroke-width="6"/><rect x="78" y="30" width="48" height="40" rx="7" fill="none" stroke="${col}" stroke-width="6"/><circle cx="${desde}" cy="50" r="9" fill="${col}"/><path d="M${desde} 92 H${hasta}" stroke="${col}" stroke-width="6" stroke-linecap="round"/><path d="M${hasta - 12 * flecha} 82 l${12 * flecha} 10 l${-12 * flecha} 10" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${txt(fuera ? 'VOLVER' : 'MOVER ISLA', 132, 17, col)}`);
}
function terminalKey(s) {
  const pide = s && s.perm, col = pide ? '#ffb020' : viva() ? '#3ddc84' : APAGADO;
  return svg(`<rect x="22" y="26" width="100" height="74" rx="10" fill="none" stroke="${col}" stroke-width="7"/><path d="M42 50 l16 13 l-16 13" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M68 80 h28" stroke="${col}" stroke-width="7" stroke-linecap="round"/>${txt(pide ? 'IR AL PERMISO' : 'TERMINAL', 132, pide ? 15 : 18, col)}`, pide && blink ? '#2a1f08' : '#07090c');
}
function gamerKey(s) {
  const on = s && s.gamer, col = on ? '#ff6ad5' : viva() ? '#a0628f' : APAGADO;
  return svg(`<rect x="16" y="40" width="112" height="56" rx="28" fill="${on ? '#ff6ad5' : 'none'}" fill-opacity=".18" stroke="${col}" stroke-width="7"/><path d="M42 68 h22 M53 57 v22" stroke="${col}" stroke-width="7" stroke-linecap="round"/><circle cx="92" cy="60" r="6" fill="${col}"/><circle cx="104" cy="74" r="6" fill="${col}"/>${txt(on ? 'GAMER ON' : 'GAMER OFF', 132, 18, col)}`);
}

// ---------- Stream Deck ----------
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
function imagen(c) {
  const st = state ? state.state : 'off';
  switch (c.action) {
    case A.status: return robotKey(st);
    case A.allow: return allowKey(state);
    case A.deny: return denyKey(state);
    case A.panico: return panicoKey(state);
    case A.micro: return microKey(c);
    case A.panel: return panelKey(c);
    case A.mensaje: return mensajeKey(c);
    case A.uso: return usoKey(state);
    case A.isla: return islaKey(state);
    case A.terminal: return terminalKey(state);
    case A.gamer: return gamerKey(state);
    default: return null;
  }
}
function paint(context) {
  const c = contexts.get(context); if (!c) return;
  const img = imagen(c);
  if (!img || img === c.lastImg) return;
  c.lastImg = img;
  send({ event: 'setImage', context, payload: { image: img, target: 0 } });
}
const resultado = (context, r) => send({ event: r && r.code === 200 ? 'showOk' : 'showAlert', context });
// la tecla se queda "ocupada" (animada) mientras dura algo: escuchar, esperar la respuesta de un mensaje
async function mientras(context, trabajo) {
  const c = contexts.get(context); if (c) c.ocupado = true;
  const t = setInterval(() => paint(context), 300);
  try { return await trabajo; } finally { clearInterval(t); if (c) { c.ocupado = false; c.lastImg = ''; } paint(context); }
}

async function pulsar(action, context, held) {
  const c = contexts.get(context) || {}, s = c.settings || {};
  switch (action) {
    case A.status: await req('POST', '/poke'); return;
    case A.panico:
      if (state && state.panico && held < 1000) { send({ event: 'showAlert', context }); return; }   // reanudar exige mantener 1 s
      return resultado(context, await req('POST', '/panico?a=alternar'));
    case A.micro: {
      const r = await req('POST', '/escuchar');
      if (r && r.code === 200) await mientras(context, new Promise(ok => setTimeout(ok, 6000))); else resultado(context, r);
      return;
    }
    case A.panel: return resultado(context, await req('POST', '/panel?ruta=' + encodeURIComponent(s.ruta || '')));
    case A.mensaje:
      if (!String(s.texto || '').trim()) { send({ event: 'showAlert', context }); return; }   // sin texto: configúralo en el inspector
      return resultado(context, await mientras(context, req('POST', '/texto', { texto: s.texto }, 120_000)));
    case A.uso: return resultado(context, await req('POST', '/panel?ruta=/uso'));
    case A.isla: return resultado(context, await req('POST', '/mover?a=' + (held >= 1000 ? 'reset' : state && state.islaFuera ? 'casa' : 'otro')));
    case A.terminal: return resultado(context, await req('POST', '/enfocar', null, 10_000));
    case A.gamer: return resultado(context, await req('POST', '/gamer', null, 15_000));
  }
  // Permitir / Denegar
  if (action === A.deny && held >= 2000) {                   // Denegar mantenido 2 s = PÁNICO global (para todo hasta reanudar)
    return resultado(context, await req('POST', '/panico'));
  }
  const p = state && state.perm;
  if (!p) {                                                    // Denegar sin permiso pendiente: recupera el control del ratón si lo tiene el agente
    if (action === A.deny) { const r = await req('POST', '/decide?b=deny'); if (r && r.code === 200) return resultado(context, r); }
    send({ event: 'showAlert', context }); return;
  }
  if (action === A.allow && p.peligro && held < 1000) { send({ event: 'showAlert', context }); return; }   // peligroso: hay que mantener
  resultado(context, await req('POST', `/decide?id=${p.id}&b=${action === A.allow ? 'allow' : 'deny'}`));
}

ws.on('open', () => { send({ event: registerEvent, uuid }); log('conectado a Stream Deck'); });
ws.on('message', async raw => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  const { event, action, context, payload } = m;
  if (event === 'willAppear') { contexts.set(context, { action, settings: (payload && payload.settings) || {}, lastImg: '' }); paint(context); }
  else if (event === 'willDisappear') contexts.delete(context);
  else if (event === 'didReceiveSettings') { const c = contexts.get(context); if (c) { c.settings = (payload && payload.settings) || {}; c.lastImg = ''; paint(context); } }
  else if (event === 'keyDown') downAt.set(context, Date.now());
  else if (event === 'keyUp') {
    const held = Date.now() - (downAt.get(context) || Date.now()); downAt.delete(context);
    try { await pulsar(action, context, held); } catch (e) { log('pulsar: ' + e.message); send({ event: 'showAlert', context }); }
    poll();
  }
});
ws.on('close', () => process.exit(0));

// ---------- sondeo del estado de la app ----------
async function poll() {
  const r = await req('GET', '/state');
  try { state = r && r.code === 200 ? JSON.parse(r.body) : null; } catch { state = null; }
  blink = !blink;
  for (const ctx of contexts.keys()) paint(ctx);
}
setInterval(poll, 500);
