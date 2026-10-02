// @apolo/sdk — API estable y versionada para plugins de APOLO.
// Un plugin es una carpeta (o paquete npm) con apolo-plugin.json + su entrada (CommonJS):
//
//   const { definirPlugin } = require('@apolo/sdk');
//   module.exports = definirPlugin({
//     async activar(apolo) { apolo.registrarHerramienta({ nombre: 'hola', descripcion: '…', parametros: {…}, ejecutar: async (args, ctx) => 'texto' }); },
//     async desactivar() { },
//   });
//
// Cada plugin corre en SU PROPIO proceso Node; "apolo" es un proxy por RPC al núcleo (no ve claves, cfg completo ni token).
// Tipos completos en index.d.ts. Reglas de versión: cambios incompatibles = sube la mayor (apoloSdk "^1.0.0" en el manifest).

const VERSION = '1.0.0';

/**
 * Define un plugin. Valida la forma y lo marca con la versión del SDK.
 * @param {import('./index').DefinicionPlugin} def
 * @returns {import('./index').DefinicionPlugin}
 */
function definirPlugin(def) {
  if (!def || typeof def.activar !== 'function') throw new Error('definirPlugin: falta activar(apolo)');
  if (def.desactivar !== undefined && typeof def.desactivar !== 'function') throw new Error('definirPlugin: desactivar debe ser una función');
  return Object.freeze({ ...def, __apoloSdk: VERSION });
}

/** @type {readonly string[]} */
const RIESGOS = Object.freeze(['lectura', 'escritura', 'ejecucion']);
/** Permisos que se pueden declarar en apolo-plugin.json. Lo no declarado se pregunta SIEMPRE al usuario. */
const PERMISOS = Object.freeze(['red:<dominio>', 'archivos:<ruta>', 'shell', 'pantalla', 'memoria', 'tareas', 'conversaciones', 'notificaciones']);

module.exports = { definirPlugin, VERSION, RIESGOS, PERMISOS };
