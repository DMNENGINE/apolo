#!/usr/bin/env node
// Espejo local de la Biblioteca DMN: sirve en la red de casa los modelos que ESTE equipo ya descargó al preparar skills,
// para que otro PC (o una VM de pruebas) no los vuelva a bajar de internet. En el otro APOLO: skills.espejo = "http://<este-pc>:8099".
//   node tools/espejo-recursos.js [--puerto 8099] [--datos %APPDATA%\robot-companion\nucleo]
// Solo lectura y solo por sha256: GET /sha256/<hash> (con Range). Únicamente archivos que una skill instalada declara en su
// preparar.json, que existen en la carpeta de recursos y cuyo tamaño coincide. El que descarga vuelve a comprobar el sha256.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { leerPlan, rutaSegura, rutasBase } = require('../core/skills/preparar');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const puerto = Number(arg('puerto', 8099));
const datos = arg('datos', path.join(process.env.APPDATA || os.homedir(), 'robot-companion', 'nucleo'));
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(datos, 'config.json'), 'utf8')); } catch { }
const { apps, modelos } = rutasBase({ skills: cfg.skills || {} });

const mapa = new Map();                                            // sha256 → { ruta, bytes }
const dirSkills = path.join(datos, 'skills');
for (const slug of fs.existsSync(dirSkills) ? fs.readdirSync(dirSkills) : []) {
  const dir = path.join(dirSkills, slug);
  let plan; try { plan = leerPlan(dir); } catch { continue; }
  for (const p of plan?.pasos || []) {
    if (p.tipo !== 'descarga' || !/^[a-f0-9]{64}$/i.test(p.sha256 || '')) continue;
    try {
      const f = rutaSegura(p.destino, { apps, modelos, skill: dir, datos: path.join(dir, '_datos') });
      const st = fs.statSync(f);
      if (!p.bytes || st.size === p.bytes) mapa.set(p.sha256.toLowerCase(), { ruta: f, bytes: st.size });
    } catch { }
  }
}
if (!mapa.size) { console.log('No hay modelos descargados que servir.'); process.exit(1); }

http.createServer((req, res) => {
  const m = /^\/sha256\/([a-f0-9]{64})$/.exec(req.url || '');
  const a = m && mapa.get(m[1]);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (!a) { res.writeHead(404).end(); return; }
  const r = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  let ini = 0, fin = a.bytes - 1;
  if (r) {
    ini = Number(r[1]); if (r[2]) fin = Math.min(Number(r[2]), fin);
    if (ini >= a.bytes) { res.writeHead(416, { 'content-range': `bytes */${a.bytes}` }).end(); return; }
  }
  res.writeHead(r ? 206 : 200, { 'content-type': 'application/octet-stream', 'content-length': fin - ini + 1, 'accept-ranges': 'bytes', ...(r ? { 'content-range': `bytes ${ini}-${fin}/${a.bytes}` } : {}) });
  if (req.method === 'HEAD') { res.end(); return; }
  console.log(`${new Date().toLocaleTimeString()} ${req.socket.remoteAddress} → ${path.basename(a.ruta)}${ini ? ` desde ${(ini / 2 ** 30).toFixed(1)} GB` : ''}`);
  fs.createReadStream(a.ruta, { start: ini, end: fin }).pipe(res);
}).listen(puerto, '0.0.0.0', () => {
  console.log(`Espejo de la Biblioteca DMN en http://0.0.0.0:${puerto} · ${mapa.size} archivos (${([...mapa.values()].reduce((n, x) => n + x.bytes, 0) / 2 ** 30).toFixed(1)} GB):`);
  for (const [h, x] of mapa) console.log(`  ${h.slice(0, 12)}…  ${path.basename(x.ruta)}`);
});
