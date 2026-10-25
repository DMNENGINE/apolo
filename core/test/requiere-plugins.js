// Para archivos de pruebas que arrancan procesos de plugins de terceros: necesitan el modelo de permisos de Node
// (22.13+). En un Node sin él (p. ej. 20 en la CI) esas pruebas se saltan con el motivo, en vez de fallar y dejar
// procesos vivos que cuelgan el ejecutor. Uso: const test = require('./requiere-plugins');
const base = require('node:test');
const motivo = require('../plugins').motivoSinSandbox();
module.exports = !motivo ? base : Object.assign((nombre, o, f) =>
  typeof o === 'function' ? base(nombre, { skip: motivo }, o) : base(nombre, { ...(o || {}), skip: motivo }, f), base);
