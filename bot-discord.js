// Bot "Robot Companion" de Discord (corre dentro de la app del PC).
// - Categoría propia en BOT CENTRAL: 🤖 ROBOT COMPANION con #🔐・permisos y #📣・avisos (solo visible para el dueño).
// - Permisos de Claude Code con botones (Permitir / Siempre / Denegar); los peligrosos piden confirmación.
// - Reenvía a la isla los mensajes nuevos de los servidores donde está el bot.
// - Solo obedece al dueño (OWNER_ID), igual que el resto de bots de BOT CENTRAL.
const fs = require('fs');
const {
  Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, OverwriteType, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');

const CATEGORY = '🤖 ROBOT COMPANION';
const CHANNELS = { permisos: '🔐・permisos', avisos: '📣・avisos', hablar: '💬・hablar' };

function createDiscord(cfgPath, hooks) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { }
  const api = { enabled: false, status: 'sin configurar', sendPerm() { }, resolvePerm() { }, sendAviso() { }, reply() { }, sendCard() { }, replyTo() { return false; }, stop() { } };
  if (!cfg.token || !cfg.ownerId || !cfg.centralGuildId) return api;

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],                      // necesario para recibir DMs
  });
  const ch = {};                       // permisos / avisos
  const sent = new Map();              // permId -> { msg, p }
  let categoryId = null;
  api.enabled = true; api.status = 'conectando…';

  async function ensureChannels() {
    const guild = await client.guilds.fetch(cfg.centralGuildId);
    const all = await guild.channels.fetch();
    const priv = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: cfg.ownerId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
    ];
    let cat = all.find(c => c && c.type === ChannelType.GuildCategory && c.name === CATEGORY);
    if (!cat) cat = await guild.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: priv });
    categoryId = cat.id;
    for (const [key, name] of Object.entries(CHANNELS)) {
      // se encuentra por la etiqueta del tema (el nombre puede cambiar)
      let c = all.find(x => x && x.parentId === cat.id && (x.topic || '').includes(`robot: ${key}`));
      if (!c) c = await guild.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, topic: `robot: ${key} · Robot Companion (PC)`, permissionOverwrites: priv });
      ch[key] = c;
    }
  }

  const color = { amber: 0xffb020, red: 0xff4d4d, green: 0x3ddc84, gray: 0x5b6472, blue: 0x35c8f0 };
  function permEmbed(p, result) {
    const e = new EmbedBuilder()
      .setTitle(result ? result.title : (p.peligro ? `⛔ PELIGRO · Claude pide ${p.tool}` : `⚠ Claude pide permiso · ${p.tool}`))
      .setColor(result ? result.color : (p.peligro ? color.red : color.amber))
      .addFields({ name: 'Sesión', value: p.session || '—', inline: true }, { name: 'Herramienta', value: p.tool, inline: true })
      .setDescription('```\n' + String(p.detail || '').slice(0, 900).replace(/```/g, 'ˋˋˋ') + '\n```' + (p.peligro && !result ? `\n**Ojo:** ${p.peligro}` : ''))
      .setTimestamp(new Date());
    if (result) e.setFooter({ text: result.footer });
    return e;
  }
  function permButtons(p) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`perm:${p.id}:${p.peligro ? 'ask' : 'allow'}`).setLabel(p.peligro ? 'Permitir (peligroso)' : 'Permitir').setStyle(p.peligro ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji('✅'),
    );
    if (!p.peligro) row.addComponents(new ButtonBuilder().setCustomId(`perm:${p.id}:always`).setLabel('Siempre').setStyle(ButtonStyle.Secondary).setEmoji('🔁'));
    row.addComponents(new ButtonBuilder().setCustomId(`perm:${p.id}:deny`).setLabel('Denegar').setStyle(ButtonStyle.Danger).setEmoji('❌'));
    return [row];
  }

  // DM al dueño = notificación push en el teléfono. El canal queda como registro (sin mención).
  let ownerUser = null;
  const owner = async () => {
    if (!client.isReady()) await new Promise(r => client.once('ready', r));   // esperar a estar conectado
    return ownerUser || (ownerUser = await client.users.fetch(cfg.ownerId));
  };
  const dmOn = cfg.dm !== false;
  api.sendPerm = async p => {
    if (sent.has(p.id)) return;
    const payload = { embeds: [permEmbed(p)], components: permButtons(p) };
    const msgs = [];
    try { if (dmOn) msgs.push(await (await owner()).send(payload)); } catch (e) { console.error('[discord] DM', e.message); }
    try { if (ch.permisos) msgs.push(await ch.permisos.send(payload)); } catch (e) { console.error('[discord] canal', e.message); }
    if (msgs.length) sent.set(p.id, { msgs, p });
  };
  api.resolvePerm = async (id, behavior, via) => {
    const s = sent.get(id); if (!s) return;
    sent.delete(id);
    const where = { http: 'el Stream Deck', isla: 'la PC', discord: 'Discord', tiempo: '—' }[via] || via;
    const r = behavior === 'expired'
      ? { title: `⌛ Caducó · ${s.p.tool}`, color: color.gray, footer: 'Nadie contestó a tiempo: Claude preguntó en la terminal' }
      : behavior === 'deny'
        ? { title: `❌ Denegado · ${s.p.tool}`, color: color.red, footer: `Denegado desde ${where}` }
        : { title: `✅ Permitido · ${s.p.tool}`, color: color.green, footer: `${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${where}` };
    for (const m of s.msgs) { try { await m.edit({ content: '', embeds: [permEmbed(s.p, r)], components: [] }); } catch { } }
  };
  api.reply = async md => {                                   // respuesta de Claude -> DM (trozos de 1900)
    try {
      const u = await owner();
      for (let i = 0; i < md.length && i < 5700; i += 1900) await u.send(md.slice(i, i + 1900));
    } catch (e) { console.error('[discord] reply', e.message); }
  };
  api.sendAviso = async (text, tone = 'blue') => {
    const payload = { embeds: [new EmbedBuilder().setDescription(text).setColor(color[tone] || color.blue).setTimestamp(new Date())] };
    try { if (dmOn) await (await owner()).send(payload); } catch (e) { console.error('[discord] DM', e.message); }
    try { if (ch.avisos) await ch.avisos.send(payload); } catch { }
  };

  // tarjetas urgentes al móvil (con respuesta preparada)
  api.sendCard = async c => {
    const e = new EmbedBuilder().setColor(c.prioridad === 'urgente' ? color.red : color.blue)
      .setTitle(`${c.prioridad === 'urgente' ? '🔴 Urgente' : '🔵 Aviso'} · ${c.author || ''}${c.guild ? ' en ' + c.guild : ''}`)
      .setDescription(`${c.resumen}\n\n> ${String(c.text).slice(0, 600).replace(/\n/g, '\n> ')}${c.respuesta ? `\n\n**Respuesta preparada:**\n${c.respuesta}` : ''}`)
      .setURL(c.link && c.link.startsWith('http') ? c.link : null).setTimestamp(new Date(c.t || Date.now()));
    const row = new ActionRowBuilder();
    if (c.canSend && c.respuesta) row.addComponents(new ButtonBuilder().setCustomId(`card:${c.id}:enviar`).setLabel('Enviar respuesta').setStyle(ButtonStyle.Success).setEmoji('📨'));
    row.addComponents(new ButtonBuilder().setCustomId(`card:${c.id}:descartar`).setLabel('Descartar').setStyle(ButtonStyle.Secondary));
    row.addComponents(new ButtonBuilder().setCustomId(`card:${c.id}:ruido`).setLabel('No me importa').setStyle(ButtonStyle.Secondary).setEmoji('🔕'));
    try { await (await owner()).send({ embeds: [e], components: [row] }); } catch (err) { console.error('[discord] card', err.message); }
  };
  api.replyTo = async (channelId, msgId, text) => {        // responder en el servidor (como el bot)
    try { const chn = await client.channels.fetch(channelId); const msg = await chn.messages.fetch(msgId); await msg.reply(text); return true; }
    catch (e) { console.error('[discord] replyTo', e.message); return false; }
  };
  client.on('interactionCreate', async it => {
    if (it.isButton() && it.customId.startsWith('card:')) {
      if (it.user.id !== cfg.ownerId) return it.reply({ content: 'No autorizado.', ephemeral: true });
      const [, idS, action] = it.customId.split(':');
      const r = await hooks.cardAction(+idS, action);
      return it.update({ components: [], content: r || '✓' }).catch(() => { });
    }
    if (!it.isButton() || !it.customId.startsWith('perm:')) return;
    if (it.user.id !== cfg.ownerId) return it.reply({ content: 'No autorizado.', ephemeral: true });
    const [, idS, action] = it.customId.split(':'); const id = +idS;
    if (action === 'ask') {                                   // peligroso: segunda confirmación
      return it.reply({
        content: '⛔ **Esto es peligroso.** ¿Seguro que quieres permitirlo?', ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`perm:${id}:sure`).setLabel('Sí, permitir').setStyle(ButtonStyle.Danger))],
      });
    }
    const behavior = action === 'sure' ? 'allow' : action;
    const ok = await hooks.decide(id, behavior, 'discord');
    if (!ok) return it.reply({ content: 'Ese permiso ya se respondió o caducó.', ephemeral: true }).catch(() => { });
    if (action === 'sure') await it.update({ content: '✅ Permitido.', components: [] }).catch(() => { });
    else await it.deferUpdate().catch(() => { });
  });

  // hablarle a Claude: DM al bot o el canal #💬・hablar (solo el dueño)
  async function onTalkMessage(m) {
    if (m.author.id !== cfg.ownerId) return m.reply('No autorizado.').catch(() => { });
    const t = m.content.trim();
    if (/^(estado|sesiones|status)$/i.test(t)) return m.reply(hooks.onSummary ? await hooks.onSummary() : '—').catch(() => { });
    if (/^(ayuda|help)$/i.test(t)) return m.reply('Escríbeme lo que quieres que haga Claude. Para elegir proyecto: `en RobotCompanion: ...`. Escribe `estado` para ver las sesiones.').catch(() => { });
    await m.channel.sendTyping().catch(() => { });
    const r = await hooks.onTalk(t);
    m.reply(r.msg).catch(() => { });
  }
  client.on('messageCreate', m => {
    // alertas de la Pi (CONTROL-COMANDER publica en #🚨・alertas de BOT CENTRAL)
    if (m.author.bot && m.guild && m.guild.id === cfg.centralGuildId && /alerta/i.test(m.channel.name) && m.author.id !== client.user.id) {
      const e = m.embeds[0];
      const text = [m.content, e && e.title, e && e.description].filter(Boolean).join(' · ').slice(0, 400);
      if (text) hooks.onServerMessage({ kind: 'pi', guild: m.guild.name, channel: m.channel.name, author: m.author.username, text, guildId: m.guild.id, channelId: m.channel.id, msgId: m.id });
      return;
    }
    if (m.author.bot || !m.content) return;
    if (!m.guild) return onTalkMessage(m);
    if (ch.hablar && m.channel.id === ch.hablar.id) return onTalkMessage(m);
    if (m.channel.parentId && m.channel.parentId === categoryId) return;
    if ((cfg.mutedGuilds || []).includes(m.guild.id)) return;
    hooks.onServerMessage({
      kind: 'server', guild: m.guild.name, channel: m.channel.name, author: m.member?.displayName || m.author.username,
      text: m.content.slice(0, 500), mention: m.mentions.users.has(cfg.ownerId),
      guildId: m.guild.id, channelId: m.channel.id, msgId: m.id,
    });
  });

  client.once('ready', async () => {
    try { await ensureChannels(); api.status = `conectado como ${client.user.tag}`; }
    catch (e) { api.status = 'error: ' + e.message; console.error('[discord]', e.message); }
    hooks.onStatus && hooks.onStatus(api.status);
  });
  client.on('error', e => console.error('[discord]', e.message));
  client.login(cfg.token).catch(e => { api.status = 'error de login: ' + e.message; hooks.onStatus && hooks.onStatus(api.status); });
  api.stop = () => client.destroy();
  return api;
}

module.exports = { createDiscord };
