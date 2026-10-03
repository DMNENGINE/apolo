// Plugin de APOLO: canal de Signal vía signal-cli en modo daemon HTTP (JSON-RPC + eventos SSE) en este mismo equipo.
// Red: SOLO 127.0.0.1 / localhost (lo declara el manifest); no guarda secretos: la cuenta de Signal la tiene signal-cli.
// La lógica está en signal.js (se prueba con un fetch falso).
const { definirPlugin } = require('@apolo/sdk');
const { crearSignal } = require('./signal');

let bot = null;

module.exports = definirPlugin({
  async activar(apolo) {
    const canal = apolo.registrarCanal({
      id: 'signal', nombre: 'Signal', descripcion: 'Signal vía signal-cli local, solo tu número',
      enviar: texto => bot && bot.avisar(texto),
      permiso: p => (bot ? bot.permiso(p) : false),
      permisoResuelto: (id, decision, via) => bot && bot.permisoResuelto(id, decision, via),
      tarjeta: t => (bot ? bot.tarjeta(t) : false),
      acciones: {
        estado: () => bot.estado(),
        conectar: d => bot.conectar(d),
        prueba: () => bot.prueba(),
        desconectar: () => bot.desconectar(),
      },
    });
    bot = crearSignal({ fetch: globalThis.fetch, canal, almacen: apolo.almacen, config: apolo.config, log: (...a) => apolo.log(...a) });
    setImmediate(() => bot.arrancar().catch(e => apolo.log('[signal] no arrancó:', e.message)));
  },
  async desactivar() { if (bot) bot.detener(); bot = null; },
});
