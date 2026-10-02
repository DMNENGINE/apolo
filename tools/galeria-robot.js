// Hoja de gestos del robot: abre app/galeria.html en Edge headless (CDP), pone cada gesto y lo captura;
// luego compone todas las capturas en una sola imagen (canvas de la propia página).
//   node tools/galeria-robot.js [salida.png] [--fotos carpeta]   --fotos: además, un PNG transparente por gesto (para la web)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const args = process.argv.slice(2), iF = args.indexOf('--fotos');
const dirFotos = iF >= 0 ? args.splice(iF, 2)[1] : null;
const salida = args[0] || path.join(os.tmpdir(), 'galeria-robot.png');
// [gesto, etiqueta, opciones, ms de espera antes de capturar]
const GESTOS = [
  ['nada', 'reposo', {}, 1500], ['nada', 'trabajando', { estado: 'trabajando' }, 1500], ['nada', 'dormido (Zzz)', { estado: 'dormido' }, 2500],
  ['greet', 'saludo', {}, 700], ['reloj', 'la hora', { msg: '' }, 900], ['guino', 'guiño', {}, 500], ['corazon', 'corazones', { msg: '♥' }, 700],
  ['sorpresa', 'sorpresa', {}, 600], ['feliz', 'contento', {}, 700], ['celebrar', 'celebra (tarea lista)', {}, 600],
  ['triste', 'triste (error)', {}, 900], ['duda', 'duda (permiso)', {}, 900], ['pensativo', 'pensativo', {}, 1500], ['navegando', 'navegando (web)', {}, 1200],
  ['bostezo', 'bostezo', {}, 1100], ['estornudo', 'estornudo', { secs: 2.6 }, 1250], ['remolino', 'mareado (remolino)', { msg: '' }, 900],
];

const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(RAIZ)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(0, '127.0.0.1');
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
const puerto = 9700 + Math.floor(Math.random() * 200);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${os.tmpdir()}/robot-edge-galeria`, '--window-size=300,300', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
(async () => {
  let pag; for (let i = 0; i < 40 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
  const ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise(ok => ws.onopen = ok);
  let n = 0; const esp = new Map(), errores = [];
  ws.onmessage = m => {
    const j = JSON.parse(m.data);
    if (j.method === 'Runtime.exceptionThrown') errores.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
    esp.get(j.id)?.(j); esp.delete(j.id);
  };
  const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esp.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 300, height: 300, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/app/galeria.html` });
  await dormir(4000);
  if (dirFotos) {                                         // fondo transparente y sin etiqueta para las fotos sueltas
    fs.mkdirSync(dirFotos, { recursive: true });
    await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp('Runtime.evaluate', { expression: "document.documentElement.style.background='transparent'; document.body.style.background='transparent'; document.getElementById('t').style.display='none'" });
  }
  const fotos = [];
  for (const [g, et, op, ms] of GESTOS) {
    await cdp('Runtime.evaluate', { expression: `mostrar(${JSON.stringify(g)}, ${JSON.stringify(et)}, ${JSON.stringify(op)})` });
    await dormir(ms);
    const foto = (await cdp('Page.captureScreenshot', { format: 'png' })).result.data;
    fotos.push(foto);
    if (dirFotos) fs.writeFileSync(path.join(dirFotos, `robot-${et.split(' ')[0].normalize('NFD').replace(/[^a-z0-9]/gi, '').toLowerCase()}.png`), Buffer.from(foto, 'base64'));
  }
  // componer la hoja (4 columnas) en la propia página
  const r = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const fotos = ${JSON.stringify(fotos)}, cols = 4, w = 300, h = 300;
    const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = Math.ceil(fotos.length / cols) * h;
    const x = cv.getContext('2d'); x.fillStyle = '#11151b'; x.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < fotos.length; i++) { const im = new Image(); im.src = 'data:image/png;base64,' + fotos[i]; await im.decode(); x.drawImage(im, (i % cols) * w, (i / cols | 0) * h); }
    return cv.toDataURL('image/png').split(',')[1];
  })()` });
  fs.writeFileSync(salida, Buffer.from(r.result.result.value, 'base64'));
  console.log('ok', salida, `(${GESTOS.length} gestos)`, '\nerrores JS:', errores.length ? errores.join('\n') : 'ninguno');
  ws.close(); edge.kill(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
