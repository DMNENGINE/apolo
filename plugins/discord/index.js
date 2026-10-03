// Plugin de APOLO: bot de Discord propio sin discord.js (Gateway por el WebSocket del SDK + REST). Para quien NO tiene el bot en
// una Raspberry Pi: la app lo arranca solo con cfg.plugins.discordComoPlugin = true y NUNCA a la vez que el modo Pi o el
// bot-discord.js local (entonces le pasa config.bloqueado y no se conecta). Lógica en discord.js.
const { definirPlugin } = require('@apolo/sdk');
const { conectar } = require('@apolo/sdk/ws-cliente');
const { crearDiscord } = require('./discord');

let bot = null;

module.exports = definirPlugin({
  async activar(apolo) {
    const canal = apolo.registrarCanal({
      id: 'discord', nombre: 'Discord', descripcion: 'Tu bot de Discord (DMs contigo)',
      enviar: texto => bot && bot.avisar(texto),
      permiso: p => (bot ? bot.permiso(p) : false),
      permisoResuelto: (id, decision, via) => bot && bot.permisoResuelto(id, decision, via),
      tarjeta: t => (bot ? bot.tarjeta(t) : false),
      acciones: {
        estado: () => bot.estado(),
        conectar: d => bot.conectar(d),
        enlace: () => bot.nuevoCodigo(),
        prueba: () => bot.prueba(),
        categoria: () => bot.prepararCategoria().then(() => bot.estado()),
        desconectar: () => bot.desconectar(),
      },
    });
    bot = crearDiscord({ fetch: globalThis.fetch, conectarWS: url => conectar(url), canal, almacen: apolo.almacen, secretos: apolo.secretos, config: apolo.config, log: (...a) => apolo.log(...a) });
    setImmediate(() => bot.arrancar().catch(e => apolo.log('[discord] no arrancó:', e.message)));
  },
  async desactivar() { if (bot) bot.detener(); bot = null; },
});
