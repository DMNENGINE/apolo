// Captura del panel del núcleo con Edge headless controlado por CDP (funciona aunque la página tenga SSE/WebGL vivos;
// --screenshot con virtual-time se cuelga). Uso: node tools/captura-panel.js /agentes salida.png [ancho] [alto] [esperaMs]
// En Git Bash: MSYS_NO_PATHCONV=1 (si no, "/agentes" se convierte en C:/Program Files/Git/agentes). EVAL="expr" imprime una evaluación.
const { spawn } = require('child_process');
const fs = require('fs');
const [ruta = '/agentes', salida = require('os').tmpdir() + '/panel.png', ancho = 1400, alto = 900, espera = 4000] = process.argv.slice(2);
const T = fs.readFileSync(process.env.APPDATA + '/robot-companion/nucleo/token', 'utf8').trim();
const puerto = 9333 + Math.floor(Math.random() * 500);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${require('os').tmpdir()}/robot-edge-cdp`, `--window-size=${ancho},${alto}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
(async () => {
  let pag;
  for (let i = 0; i < 40 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
  const ws = new WebSocket(pag.webSocketDebuggerUrl);
  await new Promise(ok => ws.onopen = ok);
  let n = 0; const esperas = new Map();
  ws.onmessage = m => { const j = JSON.parse(m.data); if (esperas.has(j.id)) { esperas.get(j.id)(j); esperas.delete(j.id); } };
  const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esperas.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: +ancho, height: +alto, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:47900/#${ruta}&token=${T}` });
  await dormir(+espera);
  await cdp('Runtime.evaluate', { expression: `location.hash = '#${ruta}'` });   // por si el arranque cambió la ruta
  await dormir(2000);
  if (process.env.EVAL) console.log(JSON.stringify((await cdp('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true })).result));
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(salida, Buffer.from(r.result.data, 'base64'));
  console.log('ok', salida);
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
