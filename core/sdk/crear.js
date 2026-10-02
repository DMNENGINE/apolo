#!/usr/bin/env node
// Plantilla de plugin (equivale a `npm create apolo-plugin`):
//   node core/sdk/crear.js <nombre> [carpeta-destino]
// Genera <destino>/<nombre>/ con apolo-plugin.json, index.js (1 herramienta + 1 comando) y package.json.
// Luego: /plugin add <ruta> --dev  (recarga en caliente al guardar) y /plugin on <nombre>.
const fs = require('fs');
const path = require('path');
const { VERSION } = require('./index');

function crear(nombre, destino = process.cwd()) {
  nombre = String(nombre || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(nombre)) throw new Error('nombre no válido: minúsculas, números y guiones (ej. mi-plugin)');
  const dir = path.resolve(destino, nombre);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`la carpeta ${dir} ya existe y no está vacía`);
  const id = nombre.replace(/-/g, '_');
  const mayor = VERSION.split('.')[0];
  const manifest = {
    nombre, version: '0.1.0', descripcion: `Plugin ${nombre} para APOLO`, autor: '', licencia: 'MIT', entrada: 'index.js', apoloSdk: `^${mayor}.0.0`,
    permisos: [],
    aporta: {
      herramientas: [{ nombre: `${id}_eco`, riesgo: 'lectura', descripcion: 'Devuelve el texto que recibe con la hora (ejemplo: cámbiala por la tuya).' }],
      comandos: [{ nombre: id, descripcion: `/${id} <texto>` }],
    },
  };
  const codigo = `// Plugin ${nombre} para APOLO. Corre en su propio proceso: solo puede leer esta carpeta y escribir en apolo.almacen.ruta.
// Red: declara cada dominio en apolo-plugin.json ("permisos": ["red:api.ejemplo.com"]); lo no declarado se pregunta al usuario.
const { definirPlugin } = require('@apolo/sdk');

module.exports = definirPlugin({
  async activar(apolo) {
    // apolo.config = tu sección de config.json → "plugins": { "${nombre}": { ... } }
    apolo.registrarHerramienta({
      nombre: '${id}_eco',
      descripcion: 'Devuelve el texto que recibe con la hora.',
      parametros: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
      ejecutar: async ({ texto }, ctx) => {
        const veces = apolo.almacen.leer('veces', 0) + 1;     // datos propios en <dir>/plugins-datos/${nombre}/
        apolo.almacen.guardar('veces', veces);
        return \`\${new Date().toLocaleTimeString('es')} · \${texto} (llamada nº \${veces}, sesión \${ctx.sesion?.id || '-'})\`;
      },
    });
    apolo.registrarComando({ nombre: '${id}', descripcion: '/${id} <texto>', ejecutar: async texto => \`${nombre} dice: \${texto || 'hola'}\` });
    apolo.log('${nombre} activo');
  },
  async desactivar() { },
});
`;
  const pkg = { name: `apolo-plugin-${nombre}`, version: '0.1.0', description: manifest.descripcion, main: 'index.js', keywords: ['apolo-plugin'], license: 'MIT' };   // @apolo/sdk lo pone APOLO al ejecutar (no hace falta instalarlo)
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'apolo-plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'index.js'), codigo);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  return dir;
}

if (require.main === module) {
  try {
    const dir = crear(process.argv[2], process.argv[3]);
    console.log(`plugin creado en ${dir}\n  pruébalo: /plugin add ${dir} --dev  y luego  /plugin on ${path.basename(dir)}`);
  } catch (e) { console.error(e.message); console.error('uso: node core/sdk/crear.js <nombre> [carpeta]'); process.exit(1); }
}

module.exports = { crear };
