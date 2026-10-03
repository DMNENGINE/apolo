// ¿Qué implementación de WhatsApp/Discord usa la app? (main.js; aparte para poder probarlo sin Electron)
//   whatsapp: cfg.plugins.whatsappComoPlugin → plugins/whatsapp; si no, whatsapp.js
//   discord:  el modo Pi (discord.json "modo":"pi") y el bot-discord.js local (discord.json con token) mandan. El plugin solo
//             arranca con cfg.plugins.discordComoPlugin = true y NINGUNO de los dos; si no, se avisa y el plugin no se conecta.
function decidirDiscord(cfgPlugins = {}, dcfg = {}) {
  const flag = !!(cfgPlugins && cfgPlugins.discordComoPlugin);
  const pi = dcfg && dcfg.modo === 'pi', local = !pi && !!String((dcfg && dcfg.token) || '').trim();
  const actual = pi ? 'pi' : local ? 'local' : 'ninguno';
  if (!flag) return { plugin: false, actual, bloqueado: '', aviso: '' };
  if (pi) return { plugin: false, actual, bloqueado: 'el bot de Discord corre en la Raspberry Pi (modo pi)', aviso: 'discordComoPlugin está activado pero el bot corre en la Pi: el plugin NO arranca. Quita "modo":"pi" de discord.json y para el servicio de la Pi si quieres usarlo.' };
  if (local) return { plugin: false, actual, bloqueado: 'la app ya usa su bot de Discord (discord.json con token)', aviso: 'discordComoPlugin está activado pero discord.json tiene token (bot-discord.js local): el plugin NO arranca. Vacía "token" en discord.json para usar el plugin.' };
  return { plugin: true, actual: 'plugin', bloqueado: '', aviso: '' };
}
const whatsappComoPlugin = cfgPlugins => !!(cfgPlugins && cfgPlugins.whatsappComoPlugin);

module.exports = { decidirDiscord, whatsappComoPlugin };
