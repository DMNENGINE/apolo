// Nada de rutas de la máquina del autor en lo que se distribuye (D:/RobotCompanion, el usuario de Windows…):
// en la instalación de otra persona esas rutas no existen. Recorre los archivos de código del repo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const SALTAR = new Set(['node_modules', '.git', 'dist', 'lanzamiento', 'test', 'vendor', '.pio', 'docs']);
const EXT = /\.(js|cjs|mjs|ts|ps1|cmd|bat|py|html|json|nsh|cpp|h)$/i;
// rutas del autor y los equipos de su red (Proxmox, Pi, Ollama…): cada instalación configura los suyos
const PROHIBIDO = /[A-Z]:[\\/]+RobotCompanion|\\Users\\yosoy|\/Users\/yosoy|\b192\.168\.1\.(102|124|127|86|206|31|84|176)\b/i;

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
  // Con git, solo lo que se publicaría (con seguimiento o nuevo no excluido): lo excluido en .git/info/exclude es local.
  let lista = null;
  try { lista = new Set(require('child_process').execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean).map(x => path.join(RAIZ, x))); } catch { lista = null; }
  for (const f of recorrer(RAIZ, []).filter(x => !lista || lista.has(x))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (PROHIBIDO.test(l)) malos.push(`${path.relative(RAIZ, f)}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(malos, []);
});
