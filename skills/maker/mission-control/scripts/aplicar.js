#!/usr/bin/env node
// Pone un mundo como el actual de Mission Control y (opcional) lo guarda en la galería del usuario.
// Uso: node scripts/aplicar.js mundo.json [--galeria id] [--solo-galeria]
'use strict';
const fs = require('fs');
const path = require('path');
const { api, datos } = require('./apolo');
const { validar } = require('./validar');

(async () => {
  const f = process.argv[2], i = process.argv.indexOf('--galeria'), id = i > 0 ? String(process.argv[i + 1] || '').replace(/[^\w-]/g, '') : '', solo = process.argv.includes('--solo-galeria');
  if (!f) { console.error('uso: node aplicar.js mundo.json [--galeria id] [--solo-galeria]'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(f, 'utf8')), v = validar(m);
  if (v.err.length) { console.error('El mundo tiene errores; pasa antes validar.js:\n' + v.err.join('\n')); process.exit(1); }
  if (id) { const d = path.join(datos(), 'mundos'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, id + '.json'), JSON.stringify(m, null, 1)); console.log(`guardado en la galería: ${id}`); }
  if (!solo) { const r = await api('PUT', '/mundo', { mundo: m }); console.log(`aplicado: «${r.mundo.nombre}» (${r.mundo.ancho}x${r.mundo.alto}, ${r.mundo.objetos.length} objetos). Recarga Mission Control.`); }
})().catch(e => { console.error('error: ' + e.message); process.exit(1); });
