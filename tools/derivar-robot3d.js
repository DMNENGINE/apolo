// Genera core/ui/robot3d.js (robot del panel web) desde app/robot.js, la fuente única.
// Solo cambian los imports: el panel no tiene importmap ni node_modules, usa su copia de three en core/ui/vendor.
//   node tools/derivar-robot3d.js      (ejecútalo cada vez que cambies app/robot.js)
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(raiz, 'app', 'robot.js'), 'utf8');
const cambios = [
  [/^import \* as THREE from 'three';$/m, "import * as THREE from './vendor/three.module.min.js';"],
  [/^import \{ GLTFLoader \} from 'three\/addons\/loaders\/GLTFLoader\.js';$/m, "import { GLTFLoader } from './vendor/GLTFLoader.js';"],
];
for (const [re, por] of cambios) { if (!re.test(s)) throw new Error(`no encontré el import ${re}`); s = s.replace(re, por); }
if (/from 'three/.test(s)) throw new Error('queda algún import de three sin convertir');
s = `// ⚠️ GENERADO desde app/robot.js por tools/derivar-robot3d.js — no lo edites aquí.\n${s}`;
fs.writeFileSync(path.join(raiz, 'core', 'ui', 'robot3d.js'), s);
console.log('ok core/ui/robot3d.js', s.length, 'bytes');

// El catálogo y su evaluador son compartidos, con app/ como fuente.
fs.writeFileSync(path.join(raiz, 'core', 'ui', 'animaciones-casco.js'), '// GENERADO desde app/animaciones-casco.js; no editar.\n' + fs.readFileSync(path.join(raiz, 'app', 'animaciones-casco.js'), 'utf8'));

fs.writeFileSync(path.join(raiz, 'core', 'ui', 'ojos-catalogo.js'), '// GENERADO desde app/ojos-catalogo.js; no editar.\n' + fs.readFileSync(path.join(raiz, 'app', 'ojos-catalogo.js'), 'utf8'));

const galeria = fs.readFileSync(path.join(raiz, 'app', 'galeria-100.html'), 'utf8')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('src="./galeria-100.js"', 'src="./galeria-casco.js"');
fs.writeFileSync(path.join(raiz, 'core', 'ui', 'galeria-casco.html'), '<!-- GENERADO desde app/galeria-100.html; no editar. -->\n' + galeria);

fs.writeFileSync(path.join(raiz, 'core', 'ui', 'galeria-casco.js'), '// GENERADO desde app/galeria-100.js; no editar.\n' + fs.readFileSync(path.join(raiz, 'app', 'galeria-100.js'), 'utf8').replace("from './robot.js'", "from './robot3d.js'"));
