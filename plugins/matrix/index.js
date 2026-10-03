// Plugin de APOLO: canal de Matrix (Client-Server API con /sync en long-poll). Corre en su propio proceso.
// Red: matrix.org y *.matrix.org declarados; si tu homeserver es otro, APOLO te pregunta UNA vez antes de conectar con él.
// El token de acceso es el secreto "matrix:token" (almacén cifrado de la app); la contraseña nunca se guarda.
// La lógica está en matrix.js (se prueba con un fetch falso).
const { definirPlugin } = require('@apolo/sdk');
const { crearMatrix } = require('./matrix');

let bot = null;

module.exports = definirPlugin({
  async activar(apolo) {
    const canal = apolo.registrarCanal({
      id: 'matrix', nombre: 'Matrix', descripcion: 'Cuenta de bot de Matrix en una sala privada contigo',
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
    bot = crearMatrix({ fetch: globalThis.fetch, canal, almacen: apolo.almacen, secretos: apolo.secretos, config: apolo.config, log: (...a) => apolo.log(...a) });
    setImmediate(() => bot.arrancar().catch(e => apolo.log('[matrix] no arrancó:', e.message)));
  },
  async desactivar() { if (bot) bot.detener(); bot = null; },
});
