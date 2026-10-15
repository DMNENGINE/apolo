#!/usr/bin/env node
// Captura de un mundo SIN aplicarlo: abre Mission Control en una ventana invisible, carga el mundo en la página y guarda un PNG.
// Uso: node scripts/captura.js mundo.json salida.png [--ancho 1600] [--espera 7]
// Necesita APOLO abierto (su panel sirve la página) y su Electron.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { token, electron, BASE } = require('./apolo');

const [f, salida] = process.argv.slice(2), arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] || d : d; };
if (!f || !salida) { console.error('uso: node captura.js mundo.json salida.png [--ancho 1600] [--espera 7]'); process.exit(2); }
const ex = electron(); if (!ex) { console.error('no encuentro el Electron de APOLO (define APOLO_ELECTRON)'); process.exit(1); }
const mundo = JSON.parse(fs.readFileSync(f, 'utf8')), ancho = arg('ancho', 1600), espera = arg('espera', 7) * 1000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-captura-')), principal = path.join(tmp, 'main.js');
fs.writeFileSync(principal, `
const { app, BrowserWindow } = require('electron'); const fs = require('fs');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: ${ancho}, height: ${Math.round(ancho * .78)}, show: false, webPreferences: { backgroundThrottling: false, offscreen: true } }); w.webContents.setFrameRate(30);
  const errores = []; w.webContents.on('console-message', (_e, _l, m) => { if (/rror|Uncaught/.test(m)) errores.push(m); });
  await w.loadURL(${JSON.stringify(BASE + '/#/agentes&token=' + token())}); w.webContents.setZoomFactor(1);
  const espera = ms => new Promise(ok => setTimeout(ok, ms)), js = c => w.webContents.executeJavaScript(c);
  await espera(4000);
  await js('localStorage.setItem("rc.mc.modo", JSON.stringify("mundo")); (window.MC_MUNDO && MC_MUNDO.m) ? 1 : 0');
  const ok = await js(${JSON.stringify(`(() => { try { MC_MUNDO.cargar(${JSON.stringify(mundo)}); document.querySelector('.mm-mapa')?.scrollIntoView({ block: 'start' }); return 'ok'; } catch (e) { return 'ERROR ' + e.message; } })()`)});
  await espera(${espera});
  const img = await w.webContents.capturePage(); fs.writeFileSync(${JSON.stringify(path.resolve(salida))}, img.toPNG());
  console.log(JSON.stringify({ carga: ok, errores }));
  app.quit();
});`);
const r = spawnSync(ex, [principal], { encoding: 'utf8', timeout: 90000 });
fs.rmSync(tmp, { recursive: true, force: true });
const linea = (r.stdout || '').trim().split('\n').pop() || '';
let res = {}; try { res = JSON.parse(linea); } catch { }
if (!fs.existsSync(salida)) { console.error('no se pudo capturar' + (r.stderr ? ': ' + r.stderr.slice(-400) : '')); process.exit(1); }
console.log(`captura: ${path.resolve(salida)} · carga: ${res.carga || '?'}${res.errores?.length ? ' · errores en la página: ' + res.errores.join(' | ') : ''}`);
