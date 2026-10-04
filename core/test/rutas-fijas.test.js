// Nada de rutas de la máquina del autor en lo que se distribuye (D:/RobotCompanion, el usuario de Windows…):
// en la instalación de otra persona esas rutas no existen. Recorre los archivos de código del repo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const SALTAR = new Set(['node_modules', '.git', 'dist', 'lanzamiento', 'test', 'vendor', '.pio', 'docs']);
const EXT = /\.(js|cjs|mjs|ts|ps1|cmd|bat|py|html|json|nsh|cpp|h)$/i;
const PROHIBIDO = /[A-Z]:[\\/]+RobotCompanion|\\Users\\yosoy|\/Users\/yosoy/i;

function recorrer(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SALTAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, out);
    else if (EXT.test(e.name) && fs.statSync(p).size < 2e6) out.push(p);
  }
  return out;
}

test('sin rutas fijas de la máquina del autor en el código', () => {
  const malos = [];
  for (const f of recorrer(RAIZ, [])) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (PROHIBIDO.test(l)) malos.push(`${path.relative(RAIZ, f)}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(malos, []);
});
