// Captura de cualquier página (URL o archivo local) con Edge headless controlado por CDP.
//   node tools/captura-url.js <url|ruta> <salida.png> [ancho=1280] [alto=900] [completa=0] [esperaMs=3000]
//   completa=1 → toda la página de arriba abajo (con el viewport del alto indicado, para que 100vh sea realista)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
let [destino, salida, ancho = 1280, alto = 900, completa = 0, espera = 3000] = process.argv.slice(2);
if (!/^[a-z]+:\/\//i.test(destino)) destino = 'file:///' + path.resolve(destino).replace(/\\/g, '/');
const puerto = 9900 + Math.floor(Math.random() * 90);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${os.tmpdir()}/robot-edge-url`, `--window-size=${ancho},${alto}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
(async () => {
  let pag; for (let i = 0; i < 40 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
  const ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise(ok => ws.onopen = ok);
  let n = 0; const esp = new Map();
  ws.onmessage = m => { const j = JSON.parse(m.data); esp.get(j.id)?.(j); esp.delete(j.id); };
  const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esp.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: +ancho, height: +alto, deviceScaleFactor: 1, mobile: +ancho < 600 });
  await cdp('Page.navigate', { url: destino });
  await dormir(+espera);
  let params = { format: 'png' };
  if (+completa) {
    const m = await cdp('Page.getLayoutMetrics');
    const h = Math.ceil(m.result.cssContentSize?.height || m.result.contentSize.height);
    params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: +ancho, height: Math.min(h, 16000), scale: 1 } };
  }
  const r = await cdp('Page.captureScreenshot', params);
  fs.writeFileSync(salida, Buffer.from(r.result.data, 'base64'));
  console.log('ok', salida);
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
