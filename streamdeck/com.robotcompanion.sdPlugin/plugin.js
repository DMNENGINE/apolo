// Plugin de Stream Deck del Robot Companion.
// Habla con Stream Deck por WebSocket (protocolo SDK v2) y con la app por HTTP local (127.0.0.1:47823, con la clave secreta).
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

const A = { allow: 'com.robotcompanion.allow', deny: 'com.robotcompanion.deny', status: 'com.robotcompanion.status' };
const contexts = new Map();          // context -> { action, lastImg }
const downAt = new Map();            // context -> ms de keyDown
let state = null, blink = false;

const token = () => { try { return fs.readFileSync(path.join(os.homedir(), '.claude', 'robot-companion.token'), 'utf8').trim(); } catch { return ''; } };
function req(method, p) {
  return new Promise(ok => {
    const r = http.request({ host: '127.0.0.1', port: 47823, path: p, method, timeout: 1500, headers: { 'x-robot-token': token() } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => ok({ code: res.statusCode, body: b }));
    });
    r.on('error', () => ok(null)); r.on('timeout', () => { r.destroy(); ok(null); }); r.end();
  });
}

// ---------- dibujo de las teclas (SVG 144x144) ----------
const COL = { reposo: '#3ddc84', trabajando: '#35c8f0', permiso: '#ffb020', listo: '#3ddc84', error: '#ff4d4d', dormido: '#6a7bb0', off: '#4a4f57' };
const NOMBRE = { reposo: 'LISTO', trabajando: 'TRABAJANDO', permiso: 'PERMISO', listo: '¡HECHO!', error: 'ERROR', dormido: 'Zzz', off: 'APAGADO' };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = body => 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#07090c"/>${body}</svg>`);
const txt = (t, y, size, col, w = 700) => `<text x="72" y="${y}" font-family="Segoe UI,Arial" font-size="${size}" font-weight="${w}" fill="${col}" text-anchor="middle">${esc(t)}</text>`;

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
  if (p.peligro) return svg(`<rect width="144" height="144" fill="${blink ? '#5a0d0d' : '#3a0808'}"/><path d="M72 20 l40 70 h-80z" fill="none" stroke="#ff4d4d" stroke-width="6" stroke-linejoin="round"/>${txt('!', 80, 38, '#ff4d4d', 900)}${txt('MANTÉN 1s', 116, 19, '#ffb3b3')}${txt(p.tool, 136, 15, '#ff8a8a', 600)}`);
  return svg(`<rect width="144" height="144" fill="${blink ? '#0f3d24' : '#0a2a19'}"/><path d="M40 66 l20 20 l42 -48" stroke="#3ddc84" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${txt('PERMITIR', 118, 20, '#9ff0c0')}${txt(p.tool, 138, 15, '#3ddc84', 600)}`);
}
function denyKey(s) {
  const p = s && s.perm;
  if (!p) return svg(`<path d="M48 44 l48 48 M96 44 l-48 48" stroke="#2c3138" stroke-width="12" stroke-linecap="round"/>${txt('DENEGAR', 128, 18, '#3a4048')}`);
  return svg(`<rect width="144" height="144" fill="#2a0a0a"/><path d="M46 38 l52 52 M98 38 l-52 52" stroke="#ff4d4d" stroke-width="13" stroke-linecap="round"/>${txt('DENEGAR', 124, 20, '#ffb3b3')}`);
}

// ---------- Stream Deck ----------
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
function paint(context) {
  const c = contexts.get(context); if (!c) return;
  const st = state ? state.state : 'off';
  const img = c.action === A.status ? robotKey(st) : c.action === A.allow ? allowKey(state) : denyKey(state);
  if (img === c.lastImg) return;
  c.lastImg = img;
  send({ event: 'setImage', context, payload: { image: img, target: 0 } });
}
ws.on('open', () => { send({ event: registerEvent, uuid }); log('conectado a Stream Deck'); });
ws.on('message', async raw => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  const { event, action, context } = m;
  if (event === 'willAppear') { contexts.set(context, { action, lastImg: '' }); paint(context); }
  else if (event === 'willDisappear') contexts.delete(context);
  else if (event === 'keyDown') downAt.set(context, Date.now());
  else if (event === 'keyUp') {
    const held = Date.now() - (downAt.get(context) || Date.now()); downAt.delete(context);
    if (action === A.status) { await req('POST', '/poke'); return; }
    if (action === A.deny && held >= 2000) {                   // Denegar mantenido 2 s = PÁNICO global (para todo hasta reanudar)
      const r = await req('POST', '/panico'); send({ event: r && r.code === 200 ? 'showOk' : 'showAlert', context }); poll(); return;
    }
    const p = state && state.perm;
    if (!p) { send({ event: 'showAlert', context }); return; }
    if (action === A.allow && p.peligro && held < 1000) { send({ event: 'showAlert', context }); return; }   // peligroso: hay que mantener
    const r = await req('POST', `/decide?id=${p.id}&b=${action === A.allow ? 'allow' : 'deny'}`);
    send({ event: r && r.code === 200 ? 'showOk' : 'showAlert', context });
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
