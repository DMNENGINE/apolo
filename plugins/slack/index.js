// Plugin de APOLO: canal de Slack por Socket Mode (WebSocket saliente: no hace falta servidor público ni túnel).
// Corre en su propio proceso: solo puede hablar con slack.com / *.slack.com; los tokens (xapp- y xoxb-) los pide a la app
// (secretos "slack:app" y "slack:bot" declarados) y los permisos que resuelve son SOLO los que la app le mostró.
// La lógica está en slack.js (se prueba con fetch y WebSocket falsos).
const { definirPlugin } = require('@apolo/sdk');
const { conectar: conectarWS } = require('@apolo/sdk/ws-cliente');
const { crearSlack } = require('./slack');

let bot = null;

module.exports = definirPlugin({
  async activar(apolo) {
    const canal = apolo.registrarCanal({
      id: 'slack', nombre: 'Slack', descripcion: 'App de Slack enlazada a tu usuario (mensajes directos)',
      enviar: texto => bot && bot.avisar(texto),
      permiso: p => (bot ? bot.permiso(p) : false),
      permisoResuelto: (id, decision, via) => bot && bot.permisoResuelto(id, decision, via),
      tarjeta: t => (bot ? bot.tarjeta(t) : false),
      acciones: {
        estado: () => bot.estado(),
        conectar: d => bot.conectar(d),
        enlace: () => bot.nuevoEnlace(),
        prueba: () => bot.prueba(),
        desconectar: () => bot.desconectar(),
      },
    });
    bot = crearSlack({ fetch: globalThis.fetch, conectarWS, canal, almacen: apolo.almacen, secretos: apolo.secretos, config: apolo.config, log: (...a) => apolo.log(...a) });
    setImmediate(() => bot.arrancar().catch(e => apolo.log('[slack] no arrancó:', e.message)));   // no bloquea la activación
  },
  async desactivar() { if (bot) bot.detener(); bot = null; },
});
