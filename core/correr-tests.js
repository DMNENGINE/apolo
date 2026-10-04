// Lanza node --test con la lista de test/*.test.js ya resuelta: en Windows nadie expande el comodín y Node 20
// (el de Electron) no interpreta patrones glob en --test (Node 22 sí). Mismo resultado en Windows, Linux y Mac.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'test');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort().map(f => path.join('test', f));
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...archivos], { stdio: 'inherit', cwd: __dirname });
process.exit(r.status ?? 1);
