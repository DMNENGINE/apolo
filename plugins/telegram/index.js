// Plugin de APOLO: canal de Telegram (sustituye a telegram.js de la app cuando cfg.plugins.telegramComoPlugin = true).
// Corre en su propio proceso: solo puede hablar con api.telegram.org, el token lo pide a la app (secreto "tg:token" declarado)
// y los permisos que resuelve son SOLO los que la app le mostró. La lógica está en bot.js (se prueba con un fetch falso).
const { definirPlugin } = require('@apolo/sdk');
const { crearBot } = require('./bot');

let bot = null;

module.exports = definirPlugin({
  async activar(apolo) {
    let canal = null;
    canal = apolo.registrarCanal({
      id: 'telegram', nombre: 'Telegram', descripcion: 'Bot de Telegram enlazado a tu chat',
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
    bot = crearBot({ fetch: globalThis.fetch, canal, almacen: apolo.almacen, secretos: apolo.secretos, config: apolo.config, log: (...a) => apolo.log(...a) });
    setImmediate(() => bot.arrancar().catch(e => apolo.log('[telegram] no arrancó:', e.message)));   // no bloquea la activación
  },
  async desactivar() { if (bot) bot.detener(); bot = null; },
});
