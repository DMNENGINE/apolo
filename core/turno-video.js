// Vídeo-resumen del turno de noche: HTML animado vertical (9:16, ~60 s) con el robot 3D, titulares y capturas,
// grabado con Chrome/Edge headless por CDP (Page.startScreencast → frames JPEG con su marca de tiempo → ffmpeg a MP4 de 30 fps).
// Sin navegador o sin ffmpeg en el PATH: queda video.html (se reproduce solo al abrirlo) y se dice el motivo.
// El robot 3D usa core/ui/robot3d.js: durante la grabación se sirve todo por un http local; abierto como archivo, sale el casco SVG.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');

const UI = path.join(__dirname, 'ui');
const escH = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ESTADO = { hecho: ['HECHO', '#2bdc7c'], espera: ['ESPERA TU OK', '#f5b83d'], error: ['FALLÓ', '#ff5d5d'], pendiente: ['SIN EMPEZAR', '#8a96a3'], cancelado: ['CANCELADO', '#8a96a3'], trabajando: ['A MEDIAS', '#4fb6ff'] };

// escenas: portada → una por encargo → pendiente → decide tú → cierre. Duraciones ajustadas a ~60 s.
function escenas(inf) {
  const enc = inf.encargos.slice(0, 6);
  const fijas = [['portada', 8], ['pendiente', inf.pendiente.length ? 7 : 0], ['decidir', inf.necesitoQueDecidas.length ? 8 : 0], ['cierre', 6]];
  const fijo = fijas.reduce((a, [, s]) => a + s, 0);
  const porEnc = enc.length ? Math.max(5, Math.min(16, Math.round((60 - fijo) / enc.length))) : 0;
  const l = [{ tipo: 'portada', s: 8 }];
  enc.forEach((e, i) => {
    const esc0 = (inf.escenas || []).find(x => x.id === e.id) || (inf.escenas || [])[i] || {};
    const cap = (inf.capturas || []).find(c => c.encargo === e.id);
    l.push({ tipo: 'encargo', s: porEnc, n: i + 1, total: enc.length, titulo: esc0.titulo || e.texto.split('\n')[0].slice(0, 60), texto: esc0.texto || String(e.resultado || '').replace(/\s+/g, ' ').slice(0, 180),
      estado: e.estado, rama: e.rama, cambios: e.cambios, captura: cap?.archivo });
  });
  if (inf.pendiente.length) l.push({ tipo: 'lista', s: 7, titulo: 'Pendiente', color: '#4fb6ff', items: inf.pendiente.slice(0, 4) });
  if (inf.necesitoQueDecidas.length) l.push({ tipo: 'lista', s: 8, titulo: 'Necesito que decidas', color: '#f5b83d', items: inf.necesitoQueDecidas.slice(0, 4) });
  l.push({ tipo: 'cierre', s: 6 });
  return l;
}

function generarHTML(inf, { nombre = 'APOLO' } = {}) {
  const sc = escenas(inf);
  const total = sc.reduce((a, x) => a + x.s, 0);
  const f0 = new Date(inf.creado).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }), fecha = f0.charAt(0).toUpperCase() + f0.slice(1);
  const hechos = inf.encargos.filter(e => e.estado === 'hecho').length;
  const dur = Math.max(1, Math.round(((inf.fin || inf.creado) - inf.inicio) / 60000));
  const casco = `<svg viewBox="0 0 64 64" class="casco"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7584"/><stop offset=".55" stop-color="#3a414c"/><stop offset="1" stop-color="#1f242b"/></linearGradient></defs>
    <path d="M10 31C10 17 20 7 32 7s22 10 22 24v9c0 9-7 16-16 16H26c-9 0-16-7-16-16z" fill="url(#cg)"/><rect x="15" y="25" width="34" height="15" rx="7.5" fill="#05140b"/>
    <rect class="ojo" x="22.5" y="29.5" width="6" height="6" rx="2" fill="#2bdc7c"/><rect class="ojo" x="35.5" y="29.5" width="6" height="6" rx="2" fill="#2bdc7c"/></svg>`;
  const escena = (x, i) => {
    if (x.tipo === 'portada') return `<section data-i="${i}" class="portada">
        <div class="eyebrow">${escH(nombre)} · TURNO DE NOCHE</div>
        <h1>${escH(inf.titular || 'Esto es lo que hice mientras dormías')}</h1>
        <div class="chips"><span class="chip v">${hechos} hecho${hechos === 1 ? '' : 's'}</span><span class="chip a">${inf.pendiente.length} pendiente${inf.pendiente.length === 1 ? '' : 's'}</span><span class="chip d">${inf.necesitoQueDecidas.length} para decidir</span></div>
        <div class="meta">${escH(fecha)} · ${dur} min trabajando · ${inf.encargos.length} encargo${inf.encargos.length === 1 ? '' : 's'}</div></section>`;
    if (x.tipo === 'encargo') {
      const [et, col] = ESTADO[x.estado] || ESTADO.pendiente;
      return `<section data-i="${i}" class="encargo">
        <div class="eyebrow">ENCARGO ${x.n} DE ${x.total}</div>
        <div class="sello" style="--c:${col}">${et}</div>
        <h2>${escH(x.titulo)}</h2>
        ${x.captura ? `<div class="cap"><img src="${escH(x.captura)}" alt=""></div>` : ''}
        <p>${escH(x.texto)}</p>
        ${x.rama ? `<div class="rama"><b>rama</b> ${escH(x.rama)}${x.cambios ? `<small>${escH(x.cambios.trim())}</small>` : ''}</div>` : ''}</section>`;
    }
    if (x.tipo === 'lista') return `<section data-i="${i}" class="lista" style="--c:${x.color}">
        <h2>${escH(x.titulo)}</h2><ul>${x.items.map((t, k) => `<li style="--k:${k}">${escH(t)}</li>`).join('')}</ul></section>`;
    return `<section data-i="${i}" class="cierre"><h2>Buenos días ☀️</h2><p>El informe completo está en el panel.<br>Nada se ha subido ni fusionado sin ti.</p><div class="firma">${escH(nombre)}</div></section>`;
  };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escH(nombre)} · Turno de noche</title>
<style>
:root{--v:#2bdc7c;--fondo:#05070a}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#000;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#eef2f5}
#v{position:relative;width:min(100vw,56.25vh);height:min(100vh,177.78vw);background:radial-gradient(120% 60% at 50% 0%,#0f2a1c 0%,#071009 45%,var(--fondo) 100%);overflow:hidden;font-size:calc(min(100vw,56.25vh)/22)}
#v::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px);pointer-events:none}
.barras{position:absolute;top:2.2%;left:4%;right:4%;display:flex;gap:.25em;z-index:5}.barras i{flex:1;height:.18em;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}.barras i b{display:block;height:100%;width:0;background:#fff}
.robot{position:absolute;left:50%;top:6%;width:46%;aspect-ratio:1;transform:translateX(-50%);z-index:2;transition:top .8s cubic-bezier(.2,.8,.2,1),width .8s cubic-bezier(.2,.8,.2,1)}
.robot canvas,.robot svg{width:100%!important;height:100%!important;display:block}
.robot svg{animation:flota 3.2s ease-in-out infinite;filter:drop-shadow(0 0 1.2em rgba(43,220,124,.45))}
.robot .ojo{animation:parpadeo 4s infinite;transform-origin:center;transform-box:fill-box}
@keyframes flota{50%{transform:translateY(-4%)}}@keyframes parpadeo{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
body.peq .robot{top:5%;width:24%}
section{position:absolute;left:7%;right:7%;top:52%;bottom:7%;display:flex;flex-direction:column;opacity:0;transform:translateY(-3%);transition:opacity .3s,transform .3s;z-index:3}
section.on{opacity:1;transform:none;transition:opacity .6s .35s,transform .6s .35s cubic-bezier(.2,.8,.2,1)}
section:not(.on){pointer-events:none}
body.peq section{top:22%}
.eyebrow{font-size:.62em;letter-spacing:.25em;color:var(--v);font-weight:700}
h1{font-size:1.9em;line-height:1.08;margin:.35em 0 .45em;font-weight:800;letter-spacing:-.01em}
h2{font-size:1.55em;line-height:1.1;margin:.3em 0 .45em;font-weight:800}
p{font-size:.92em;line-height:1.4;color:#c4ccd4;margin:.2em 0 .6em}
.chips{display:flex;gap:.4em;flex-wrap:wrap}.chip{font-size:.72em;padding:.35em .8em;border-radius:99px;font-weight:700;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)}
.chip.v{color:#2bdc7c;border-color:rgba(43,220,124,.5)}.chip.a{color:#4fb6ff;border-color:rgba(79,182,255,.45)}.chip.d{color:#f5b83d;border-color:rgba(245,184,61,.45)}
.meta{margin-top:auto;font-size:.66em;color:#7d8893}
.sello{align-self:flex-start;margin-top:.5em;font-size:.68em;font-weight:800;letter-spacing:.14em;color:var(--c);border:2px solid var(--c);padding:.2em .6em;border-radius:.3em;transform:rotate(-3deg)}
section.on .sello{animation:sello .5s .4s both cubic-bezier(.2,1.6,.4,1)}@keyframes sello{from{transform:scale(2.2) rotate(-12deg);opacity:0}}
.cap{border-radius:.5em;overflow:hidden;border:1px solid rgba(255,255,255,.15);margin:.2em 0 .6em;max-height:34%;box-shadow:0 .6em 2em rgba(0,0,0,.5)}.cap img{width:100%;display:block;object-fit:cover;object-position:top}
.rama{margin-top:auto;font-family:Consolas,monospace;font-size:.66em;background:rgba(43,220,124,.08);border:1px solid rgba(43,220,124,.3);padding:.6em .8em;border-radius:.5em;color:#bfeed3;word-break:break-all}
.rama b{color:var(--v);margin-right:.5em}.rama small{display:block;color:#7fa892;margin-top:.2em}
.lista h2{color:var(--c)}.lista ul{list-style:none;padding:0;margin:0}.lista li{font-size:.86em;line-height:1.35;padding:.55em 0 .55em 1.1em;position:relative;border-bottom:1px solid rgba(255,255,255,.07);opacity:0;transform:translateX(-6%)}
.lista li::before{content:"";position:absolute;left:0;top:1.05em;width:.45em;height:.45em;border-radius:50%;background:var(--c)}
section.on li{animation:entra .5s calc(.35s + var(--k)*.55s) forwards cubic-bezier(.2,.8,.2,1)}@keyframes entra{to{opacity:1;transform:none}}
.cierre{align-items:center;text-align:center;justify-content:center}.cierre h2{font-size:2.1em}.firma{margin-top:1em;font-weight:800;letter-spacing:.3em;color:var(--v)}
.marca{position:absolute;bottom:2.2%;right:5%;font-size:.5em;letter-spacing:.2em;color:rgba(255,255,255,.35);z-index:5}
</style></head><body>
<div id="v"><div class="barras">${sc.map(() => '<i><b></b></i>').join('')}</div>
<div class="robot" id="robot">${casco}</div>
${sc.map(escena).join('\n')}
<div class="marca">${escH(nombre)} · TURNO DE NOCHE</div></div>
<script>
const ESC = ${JSON.stringify(sc.map(x => ({ tipo: x.tipo, s: x.s, estado: x.estado })))}, TOTAL = ${total};
let robot = null, t0 = 0, actual = -1;
window.listo = false;
function estadoRobot(x) { if (!robot) return;
  if (x.tipo === 'portada') { robot.setState('listo'); robot.gesto?.('saludo', 3, 'BUENOS DÍAS'); }
  else if (x.tipo === 'encargo') { robot.setState(x.estado === 'hecho' ? 'listo' : x.estado === 'error' ? 'error' : x.estado === 'espera' ? 'permiso' : 'trabajando'); if (x.estado === 'hecho') robot.gesto?.('celebrar', 2.5, '✓ HECHO'); else if (x.estado === 'espera') robot.gesto?.('duda', 2.5, '¿ME DAS PERMISO?'); }
  else if (x.tipo === 'lista') robot.gesto?.('pensativo', 3, '');
  else { robot.setState('reposo'); robot.gesto?.('guino', 2.5, '¡HASTA LUEGO!'); } }
function paso() {
  const t = (performance.now() - t0) / 1000;
  let acc = 0, i = 0; for (; i < ESC.length - 1 && t >= acc + ESC[i].s; i++) acc += ESC[i].s;
  if (i !== actual) { actual = i;
    document.querySelectorAll('section').forEach(s => s.classList.toggle('on', +s.dataset.i === i));
    document.body.classList.toggle('peq', ESC[i].tipo === 'encargo' || ESC[i].tipo === 'lista');
    estadoRobot(ESC[i]); }
  document.querySelectorAll('.barras b').forEach((b, k) => { let a = 0; for (let j = 0; j < k; j++) a += ESC[j].s; b.style.width = Math.max(0, Math.min(1, (t - a) / ESC[k].s)) * 100 + '%'; });
  if (t < TOTAL) requestAnimationFrame(paso); else window.terminado = true;
}
window.empezar = () => { t0 = performance.now(); actual = -1; window.terminado = false; requestAnimationFrame(paso); };
window.TOTAL = TOTAL;
// robot 3D si se sirve por http (grabación); abierto como archivo se queda el casco SVG
(async () => {
  if (location.protocol.startsWith('http')) try {
    const m = await import('/ui/robot3d.js');
    const cv = document.createElement('canvas'); const caja = document.getElementById('robot');
    robot = m.createRobot(cv, '/ui/casco.glb', { animacion: 'vitrina', log: ['> turno de noche', '> informe listo'] });
    caja.innerHTML = ''; caja.append(cv); robot.setFps?.(30);
    await new Promise(ok => setTimeout(ok, 1800));
  } catch (e) { console.warn('robot 3D no disponible', e); }
  window.listo = true;
  if (!/grabar/.test(location.hash)) window.empezar();
})();
</script></body></html>`;
}

// ---------- grabación ----------
function buscarNavegador(preferido) {
  const l = [preferido, process.env.APOLO_NAVEGADOR,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].filter(Boolean);
  return l.find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
}
const hayFfmpeg = (bin = 'ffmpeg') => new Promise(ok => execFile(bin, ['-version'], { windowsHide: true, timeout: 10_000 }, e => ok(!e)));

// http mínimo: / = carpeta del informe, /ui/ = core/ui (robot3d.js, three, casco.glb)
function servidor(dir) {
  const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const [raiz, rel] = u.startsWith('/ui/') ? [UI, u.slice(4)] : [dir, u.slice(1) || 'video.html'];
    const f = path.resolve(raiz, rel);
    if (!f.startsWith(path.resolve(raiz) + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

async function grabar({ dir, segundos, ancho = 720, alto = 1280, navegador, ffmpeg = 'ffmpeg', fps = 30 }) {
  const srv = await servidor(dir);
  const puerto = 9500 + Math.floor(Math.random() * 400);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-video-'));
  const frames = path.join(dir, '_frames'); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);
  const nav = spawn(navegador, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, `--window-size=${ancho},${alto}`,
    '--hide-scrollbars', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const dormir = ms => new Promise(ok => setTimeout(ok, ms));
  let ws;
  try {
    let pag; for (let i = 0; i < 60 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
    if (!pag) throw new Error('el navegador headless no arrancó');
    ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('CDP no conecta')); });
    let n = 0; const esp = new Map(); const lista = [];
    ws.onmessage = m => {
      const j = JSON.parse(m.data);
      if (j.id && esp.has(j.id)) { esp.get(j.id)(j); esp.delete(j.id); return; }
      if (j.method === 'Page.screencastFrame') {
        const { data, metadata, sessionId } = j.params;
        const f = path.join(frames, `f${String(lista.length).padStart(5, '0')}.jpg`);
        fs.writeFileSync(f, Buffer.from(data, 'base64'));
        lista.push({ f, t: metadata.timestamp });
        ws.send(JSON.stringify({ id: ++n, method: 'Page.screencastFrameAck', params: { sessionId } }));
      }
    };
    const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esp.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/video.html#grabar` });
    for (let i = 0; i < 60; i++) { await dormir(250); const r = await cdp('Runtime.evaluate', { expression: 'window.listo === true', returnByValue: true }); if (r.result?.result?.value) break; }
    await cdp('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: ancho, maxHeight: alto, everyNthFrame: 1 });
    await cdp('Runtime.evaluate', { expression: 'window.empezar()' });
    const t0 = Date.now();
    while (Date.now() - t0 < (segundos + 0.6) * 1000) {
      await dormir(500);
      const r = await cdp('Runtime.evaluate', { expression: 'window.terminado === true', returnByValue: true });
      if (r.result?.result?.value) break;
    }
    await cdp('Page.stopScreencast');
    await dormir(200);
    if (lista.length < 5) throw new Error(`la grabación no dio imágenes (${lista.length})`);
    // concat de ffmpeg con la duración real de cada frame → MP4 a fps constantes
    const txt = [];
    for (let i = 0; i < lista.length; i++) {
      const d = i < lista.length - 1 ? Math.max(0.001, lista[i + 1].t - lista[i].t) : 1 / fps;
      txt.push(`file '${lista[i].f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`, `duration ${d.toFixed(4)}`);
    }
    txt.push(`file '${lista.at(-1).f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
    const fLista = path.join(frames, 'lista.txt'); fs.writeFileSync(fLista, txt.join('\n'));
    const salida = path.join(dir, 'video.mp4');
    await new Promise((ok, mal) => {
      const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', fLista, '-vf', `fps=${fps},scale=${ancho}:${alto}:flags=lanczos,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', salida], { windowsHide: true });
      let err = ''; p.stderr.on('data', d => { err += d; });
      p.on('close', c => (c === 0 ? ok() : mal(new Error(`ffmpeg: ${err.trim().split('\n').slice(-2).join(' ')}`))));
      p.on('error', mal);
    });
    return { mp4: salida, frames: lista.length, segundos: Math.round(lista.at(-1).t - lista[0].t) };
  } finally {
    try { ws?.close(); } catch { }
    try { nav.kill(); } catch { }
    srv.close();
    await dormir(400);
    fs.rmSync(frames, { recursive: true, force: true });
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { }
  }
}

// genera video.html y, si se puede, video.mp4. opciones: { grabar: false, navegador, ffmpeg, ancho, alto, nombre }
async function crearVideo(inf, dir, opciones = {}) {
  const t0 = Date.now();
  const html = generarHTML(inf, { nombre: opciones.nombre });
  fs.writeFileSync(path.join(dir, 'video.html'), html);
  const segundos = escenas(inf).reduce((a, x) => a + x.s, 0);
  if (opciones.grabar === false) return { html: 'video.html', segundos, motivo: 'grabación desactivada' };
  const navegador = buscarNavegador(opciones.navegador);
  if (!navegador) return { html: 'video.html', segundos, motivo: 'no encontré Chrome/Edge para grabar: abre video.html para verlo' };
  if (!(await hayFfmpeg(opciones.ffmpeg))) return { html: 'video.html', segundos, motivo: 'ffmpeg no está en el PATH: abre video.html para verlo (instala ffmpeg para tener el MP4)' };
  const r = await grabar({ dir, segundos, navegador, ffmpeg: opciones.ffmpeg, ancho: opciones.ancho, alto: opciones.alto });
  return { html: 'video.html', mp4: 'video.mp4', segundos: r.segundos, frames: r.frames, ms: Date.now() - t0 };
}

module.exports = { crearVideo, generarHTML, escenas, buscarNavegador, grabar, servidor, hayFfmpeg };
