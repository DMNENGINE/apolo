// Correo: varias cuentas a la vez. Gmail y Outlook/Hotmail con OAuth ("Conectar con Google/Microsoft");
// Yahoo, iCloud y dominio propio por IMAP/SMTP con contraseña de aplicación.
// Leer y buscar = lectura. Enviar = SIEMPRE pide permiso (en la isla, Discord o Stream Deck).
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

// servidores conocidos por dominio; el resto se rellena a mano en el panel
const PRESETS = [
  { re: /@(gmail|googlemail)\.com$/i, nombre: 'Gmail', imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    oauth: 'google', ayuda: 'Gmail: mejor con el botón "Conectar con Google". Con contraseña: myaccount.google.com/apppasswords (necesita la verificación en 2 pasos).' },
  { re: /@(yahoo|ymail)\.[a-z.]+$/i, nombre: 'Yahoo', imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    ayuda: 'Yahoo: Seguridad de la cuenta → Generar contraseña de aplicación.' },
  { re: /@(icloud|me|mac)\.com$/i, nombre: 'iCloud', imap: { host: 'imap.mail.me.com', port: 993, secure: true }, smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    ayuda: 'iCloud: appleid.apple.com → Contraseñas de apps.' },
  { re: /@(outlook|hotmail|live|msn)\.[a-z.]+$/i, nombre: 'Outlook', oauth: 'microsoft', soloOAuth: true, imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    ayuda: 'Outlook/Hotmail: usa el botón "Conectar con Microsoft".' },
];
const preset = email => PRESETS.find(p => p.re.test(email)) || null;
const recortar = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');

function crearCorreo({ almacen, oauth, log = console.log }) {

  // credenciales de una cuenta: contraseña de aplicación o token OAuth (se renueva solo)
  async function auth(c) {
    if (String(c.auth).startsWith('oauth')) return { user: c.email, accessToken: await oauth.token(c) };
    return { user: c.usuario || c.email, pass: almacen.secreto(c.id) };
  }
  async function imap(c) {
    const cli = new ImapFlow({ host: c.imap.host, port: c.imap.port, secure: c.imap.secure !== false, auth: await auth(c), logger: false, emitLogs: false, socketTimeout: 60_000 });
    cli.on('error', e => log('[correo]', c.email, e.message));
    await cli.connect();
    return cli;
  }
  async function conImap(c, f) {
    const cli = await imap(c);
    try { return await f(cli); } finally { try { await cli.logout(); } catch { } }
  }
  const cuenta = id => {
    const c = id ? almacen.cuentas().find(x => x.id === id || x.email.toLowerCase() === String(id).toLowerCase()) : almacen.cuentas()[0];
    if (!c) throw new Error(id ? `no tengo la cuenta "${id}"` : 'no hay ninguna cuenta de correo conectada (Panel → Configuración → Correo)');
    return c;
  };
  const resumenMsg = (c, m) => ({
    cuenta: c.email, uid: m.uid, fecha: m.envelope?.date ? new Date(m.envelope.date).toISOString() : '',
    de: (m.envelope?.from || []).map(a => a.name ? `${a.name} <${a.address}>` : a.address).join(', '),
    asunto: m.envelope?.subject || '(sin asunto)', leido: m.flags?.has('\\Seen') || false,
  });

  // últimos mensajes de una carpeta (por defecto INBOX)
  async function bandeja(c, { max = 15, soloNoLeidos = false, carpeta = 'INBOX' } = {}) {
    return conImap(c, async cli => {
      const lock = await cli.getMailboxLock(carpeta);
      try {
        const total = cli.mailbox.exists || 0; if (!total) return [];
        let uids;
        if (soloNoLeidos) uids = (await cli.search({ seen: false }, { uid: true }) || []).slice(-max);
        const rango = uids ? uids : `${Math.max(1, total - max + 1)}:*`;
        const out = [];
        for await (const m of cli.fetch(rango, { envelope: true, flags: true, uid: true }, uids ? { uid: true } : undefined)) out.push(resumenMsg(c, m));
        return out.reverse();
      } finally { lock.release(); }
    });
  }
  async function leer(c, uid, carpeta = 'INBOX') {
    return conImap(c, async cli => {
      const lock = await cli.getMailboxLock(carpeta);
      try {
        const m = await cli.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
        if (!m) throw new Error(`no encuentro el mensaje ${uid}`);
        const p = await simpleParser(m.source);
        return {
          cuenta: c.email, uid, de: p.from?.text || '', para: p.to?.text || '', cc: p.cc?.text || '', asunto: p.subject || '', fecha: p.date?.toISOString() || '',
          messageId: p.messageId || '', referencias: [].concat(p.references || []), texto: recortar((p.text || '').trim(), 12_000),
          adjuntos: (p.attachments || []).map(a => `${a.filename || 'adjunto'} (${Math.round((a.size || 0) / 1024)} KB)`),
        };
      } finally { lock.release(); }
    });
  }
  async function buscar(c, texto, { max = 15 } = {}) {
    return conImap(c, async cli => {
      const lock = await cli.getMailboxLock('INBOX');
      try {
        const uids = ((await cli.search({ or: [{ subject: texto }, { from: texto }, { body: texto }] }, { uid: true })) || []).slice(-max);
        if (!uids.length) return [];
        const out = [];
        for await (const m of cli.fetch(uids, { envelope: true, flags: true, uid: true }, { uid: true })) out.push(resumenMsg(c, m));
        return out.reverse();
      } finally { lock.release(); }
    });
  }
  // mensajes nuevos desde el último UID visto (para los avisos); la primera vez solo marca dónde está
  async function nuevos(c) {
    return conImap(c, async cli => {
      const lock = await cli.getMailboxLock('INBOX');
      try {
        const sig = cli.mailbox.uidNext || 1;
        if (!c.ultimoUid || c.uidValidity !== String(cli.mailbox.uidValidity)) { almacen.actualizar(c.id, { ultimoUid: sig - 1, uidValidity: String(cli.mailbox.uidValidity) }); return []; }
        if (sig - 1 <= c.ultimoUid) return [];
        const out = [];
        for await (const m of cli.fetch(`${c.ultimoUid + 1}:*`, { envelope: true, flags: true, uid: true, bodyParts: ['TEXT'] }, { uid: true })) {
          if (m.uid <= c.ultimoUid) continue;
          let trozo = ''; try { trozo = Buffer.from(m.bodyParts?.get('TEXT') || '').toString('utf8').replace(/<[^>]+>/g, ' ').replace(/=\r?\n/g, '').replace(/\s+/g, ' ').slice(0, 400); } catch { }
          out.push({ ...resumenMsg(c, m), trozo });
        }
        almacen.actualizar(c.id, { ultimoUid: sig - 1 });
        return out.slice(-10);
      } finally { lock.release(); }
    });
  }
  async function enviar(c, { para, cc, asunto, texto, enRespuestaA, referencias }) {
    const a = await auth(c);
    const t = nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure !== false && c.smtp.port === 465,
      auth: a.accessToken ? { type: 'OAuth2', user: a.user, accessToken: a.accessToken } : { user: a.user, pass: a.pass } });
    const r = await t.sendMail({ from: c.nombre ? `"${c.nombre}" <${c.email}>` : c.email, to: para, cc, subject: asunto, text: texto,
      inReplyTo: enRespuestaA || undefined, references: referencias?.length ? referencias : enRespuestaA || undefined });
    return r.messageId;
  }
  async function probar(c) {
    const n = await conImap(c, async cli => (await cli.status('INBOX', { messages: true, unseen: true })));
    return { ok: true, mensajes: n.messages, noLeidos: n.unseen };
  }

  // ---------- herramientas para el agente ----------
  const lista = r => r.length ? r.map(m => `[${m.cuenta} #${m.uid}] ${m.leido ? '  ' : '● '}${m.fecha.slice(0, 16).replace('T', ' ')} · ${m.de} — ${m.asunto}`).join('\n') : '(nada)';
  const cuentasTxt = () => almacen.cuentas().map(c => `- ${c.email}${c.nombre ? ` (${c.nombre})` : ''}`).join('\n') || '(ninguna)';
  const herramientas = [
    { nombre: 'correo_cuentas', riesgo: 'lectura', descripcion: 'Lista las cuentas de correo conectadas.',
      parametros: { type: 'object', properties: {} }, resumen: () => 'cuentas de correo', ejecutar: async () => cuentasTxt() },
    { nombre: 'correo_bandeja', riesgo: 'lectura', descripcion: 'Últimos correos de la bandeja de entrada. Sin "cuenta" = TODAS las cuentas. ● = no leído.',
      parametros: { type: 'object', properties: { cuenta: { type: 'string', description: 'email de la cuenta (opcional)' }, soloNoLeidos: { type: 'boolean' }, max: { type: 'number' } } },
      resumen: a => `bandeja ${a.cuenta || 'todas'}`,
      ejecutar: async a => {
        const cs = a.cuenta ? [cuenta(a.cuenta)] : almacen.cuentas();
        if (!cs.length) return cuentasTxt();
        const partes = await Promise.all(cs.map(c => bandeja(c, { max: Math.min(a.max || 10, 40), soloNoLeidos: a.soloNoLeidos }).then(lista).catch(e => `error en ${c.email}: ${e.message}`)));
        return partes.map((p, i) => `== ${cs[i].email} ==\n${p}`).join('\n\n');
      } },
    { nombre: 'correo_leer', riesgo: 'lectura', descripcion: 'Lee un correo completo (texto, remitente, adjuntos) por cuenta y uid.',
      parametros: { type: 'object', properties: { cuenta: { type: 'string' }, uid: { type: 'number' } }, required: ['cuenta', 'uid'] },
      resumen: a => `leer correo #${a.uid}`,
      ejecutar: async a => { const m = await leer(cuenta(a.cuenta), a.uid); return `De: ${m.de}\nPara: ${m.para}${m.cc ? '\nCC: ' + m.cc : ''}\nFecha: ${m.fecha}\nAsunto: ${m.asunto}\nMessage-ID: ${m.messageId}${m.adjuntos.length ? '\nAdjuntos: ' + m.adjuntos.join(', ') : ''}\n\n${m.texto}`; } },
    { nombre: 'correo_buscar', riesgo: 'lectura', descripcion: 'Busca correos por texto (asunto, remitente o cuerpo). Sin "cuenta" = todas.',
      parametros: { type: 'object', properties: { texto: { type: 'string' }, cuenta: { type: 'string' } }, required: ['texto'] },
      resumen: a => `buscar correo "${a.texto}"`,
      ejecutar: async a => {
        const cs = a.cuenta ? [cuenta(a.cuenta)] : almacen.cuentas();
        const partes = await Promise.all(cs.map(c => buscar(c, a.texto).then(lista).catch(e => `error: ${e.message}`)));
        return partes.map((p, i) => `== ${cs[i].email} ==\n${p}`).join('\n\n') || cuentasTxt();
      } },
    { nombre: 'correo_enviar', riesgo: 'escritura', siemprePreguntar: () => 'enviar un correo',
      descripcion: 'Envía un correo (o responde uno: pasa enRespuestaA = Message-ID y el asunto con "Re: "). SIEMPRE pide permiso al usuario. Sin "cuenta" usa la primera.',
      parametros: { type: 'object', properties: { cuenta: { type: 'string' }, para: { type: 'string' }, cc: { type: 'string' }, asunto: { type: 'string' }, texto: { type: 'string' }, enRespuestaA: { type: 'string' } }, required: ['para', 'asunto', 'texto'] },
      resumen: a => `correo a ${a.para}: "${a.asunto}"\n${recortar(a.texto, 300)}`,
      ejecutar: async a => { const id = await enviar(cuenta(a.cuenta), a); return `enviado (${id})`; } },
  ];

  return { PRESETS: PRESETS.map(({ re, ...p }) => p), preset, bandeja, leer, buscar, nuevos, enviar, probar, herramientas, cuenta };
}

module.exports = { crearCorreo, preset };
