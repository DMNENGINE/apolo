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
