// Lógica del canal de Signal (sin depender del SDK: se prueba con un fetch falso).
//   Habla SOLO con el daemon local de signal-cli (`signal-cli -a +NUM daemon --http 127.0.0.1:8080`):
//     POST /api/v1/rpc     JSON-RPC 2.0 (send, sendReaction, getAttachment, version)
//     GET  /api/v1/events  eventos en SSE (data: {"envelope": …})
//   Solo atiende al número del dueño (y a su UUID cuando lo conoce); nada de grupos.
//   Permisos: reacción 👍 / 🔁 / 👎 al mensaje del permiso, citarlo, o responder 1 / 2 / 3 (#n si hay varios).
//   Los peligrosos nunca tienen "siempre" y piden CONFIRMO n. Tarjetas con 📨 / 🗑 / 🔕. Notas de voz → getAttachment → Whisper.
// Dependencias inyectadas: fetch (vigilado: solo 127.0.0.1/localhost), canal (registrarCanal), almacen, config, log.
const fs = require('fs');
const path = require('path');

const plano = md => String(md ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/```(?:\w+\n)?/g, '').replace(/`([^`\n]+)`/g, '$1').slice(0, 6000);
const REACCION = { '👍': 'allow', '🔁': 'always', '👎': 'deny', '📨': 'enviar', '🗑': 'descartar', '🔕': 'ruido' };
const sinVS = s => String(s || '').replace(/️/g, '');
const NUM = /^\+\d{6,15}$/;
const AYUDA = '🤖 Qué puedo hacer por aquí\n• Escríbeme cualquier cosa: la paso al mejor modelo.\n• "gemma: …", "chatgpt: …", "claude: …" para elegir modelo.\n• Permisos: reacciona 👍 / 🔁 / 👎 o responde 1 / 2 / 3 (los peligrosos piden CONFIRMO n).\n• Mándame una nota de voz y la transcribo.\n\nestado · nueva · ayuda';

// solo el daemon de ESTE equipo
function normalizarUrl(u) {
  const x = new URL(String(u || 'http://127.0.0.1:8080').trim());
  if (x.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname)) throw new Error('signal-cli tiene que escuchar en este equipo: http://127.0.0.1:<puerto>');
  return x.origin;
}

function crearSignal({ fetch: f = globalThis.fetch, canal, almacen, config = {}, log = () => { }, esperaReintento = 5000 }) {
  let vivo = false, ctl = null, estado = 'sin configurar', bucleEnCurso = null, n = 0, corto = 0;
  let st = almacen.leer('estado', null) || { url: config.url || null, cuenta: config.cuenta || null, dueno: config.dueno || null, duenoUuid: null, visto: false };
  const guardar = c => { st = { ...st, ...c }; almacen.guardar('estado', st); };
  const perms = new Map();                                    // id → { ts, n, p, confirmar }
  const porTs = new Map();                                    // timestamp de nuestro mensaje → { tipo, id }
  const setEstado = e => { if (e === estado) return; estado = e; Promise.resolve(canal.estado(e === 'conectado' ? 'activo' : 'inactivo', e)).catch(() => { }); };
  const esperar = ms => new Promise(ok => setTimeout(ok, ms));

  async function rpc(metodo, params = {}, { url = st.url, ms = 30_000 } = {}) {
    const r = await f(url + '/api/v1/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(ms),
      body: JSON.stringify({ jsonrpc: '2.0', id: 'a' + (++n), method: metodo, params: st.cuenta && !params.account ? { ...params, account: st.cuenta } : params }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('signal-cli: ' + (j.error?.message || `HTTP ${r.status}`));
    return j.result;
  }
  async function enviar(md) {
    if (!st.dueno) return null;
    try { const r = await rpc('send', { recipient: [st.dueno], message: plano(md) }); return r?.timestamp || null; }
    catch (e) { log('[signal]', e.message); return null; }
  }
  const reaccionar = (ts, emoji) => rpc('sendReaction', { recipient: [st.dueno], emoji, targetAuthor: st.cuenta, targetTimestamp: ts }).catch(() => { });

  // ---------- eventos (SSE) ----------
  async function bucle() {
    while (vivo) {
      try {
        const r = await f(st.url + '/api/v1/events' + (st.cuenta ? '?account=' + encodeURIComponent(st.cuenta) : ''), { headers: { accept: 'text/event-stream' }, signal: ctl.signal });
        if (!r.ok || !r.body) throw new Error(`eventos: HTTP ${r.status}`);
        setEstado(st.visto ? 'conectado' : 'esperando tu primer mensaje');
        const lector = r.body.getReader(), dec = new TextDecoder();
        let buf = '';
        for (; ;) {
          const { value, done } = await lector.read();
          if (done) break;
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
            const datos = bloque.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (!datos) continue;
            let j; try { j = JSON.parse(datos); } catch { continue; }
            await procesar(j.envelope || j.params?.envelope).catch(e => log('[signal]', e.message));
          }
        }
        if (vivo) setEstado('reconectando');
      } catch (e) {
        if (!vivo) return;
        setEstado('signal-cli no responde, reintentando'); log('[signal]', e.message);
      }
      if (vivo) await esperar(esperaReintento);
    }
  }

  const esDueno = env => !!env && (env.sourceNumber === st.dueno || env.source === st.dueno || (!!st.duenoUuid && env.sourceUuid === st.duenoUuid));
  async function procesar(env) {
    if (!env || !env.dataMessage) return;
    if (!esDueno(env)) return;                                 // nadie más: ni otros números ni grupos
    const d = env.dataMessage;
    if (d.groupInfo || d.groupV2) return;
    if (!st.visto || (env.sourceUuid && !st.duenoUuid)) { guardar({ visto: true, duenoUuid: env.sourceUuid || st.duenoUuid || null }); setEstado('conectado'); }
    if (d.reaction) {
      if (d.reaction.isRemove || d.reaction.targetAuthorNumber && d.reaction.targetAuthorNumber !== st.cuenta) return;
      const obj = porTs.get(+d.reaction.targetSentTimestamp), acc = REACCION[sinVS(d.reaction.emoji)];
      if (!obj || !acc) return;
      if (obj.tipo === 'perm' && ['allow', 'always', 'deny'].includes(acc)) return decidirPerm(obj.id, acc);
      if (obj.tipo === 'card' && ['enviar', 'descartar', 'ruido'].includes(acc)) return accionTarjeta(obj.id, acc);
      return;
    }
    const audio = (d.attachments || []).find(a => /^audio\//.test(a.contentType || ''));
    if (audio) {
      const t = await notaDeVoz(audio); if (!t) return;
      await enviar(`🎙 ${t}`);
      return responder(await canal.recibir(t, { de: 'chat' }));
    }
    const texto = String(d.message || '').trim();
    const objetivo = d.quote ? porTs.get(+d.quote.id) : null;
    if (await respuestaRapida(texto, objetivo)) return;
    if (!texto) return;
    if (/^\/?(ayuda|help)$/i.test(texto)) return enviar(AYUDA);
    if (/^\/?estado$/i.test(texto)) return enviar('🟢 Estoy encendido y escuchando.');
    responder(await canal.recibir(/^\/?nueva$/i.test(texto) ? '/nueva' : texto, { de: 'chat' }));
  }
  const responder = r => { if (r) return enviar(String(r)); };

  async function respuestaRapida(t, objetivo) {
    const conf = /^confirmo\s*#?(\d+)$/i.exec(t);
    if (conf) {
      const s = [...perms.entries()].find(([, v]) => v.n === +conf[1]);
      if (!s) { enviar('⌛ Ese permiso ya no está pendiente.'); return true; }
      if (s[1].p.peligro && !s[1].confirmar) { enviar(`Primero reacciona 👍 o responde 1 #${s[1].n}.`); return true; }
      if (!await Promise.resolve(canal.decidir(s[0], 'allow')).catch(() => false)) enviar('⌛ Ese permiso ya no está pendiente.');
      return true;
    }
    const m = /^([123])(?:\s*#\s*(\d+))?$/.exec(t);
    if (m) {
      let id = objetivo?.tipo === 'perm' ? objetivo.id : null;
      if (!id && m[2]) id = ([...perms.entries()].find(([, v]) => v.n === +m[2]) || [])[0];
      if (!id && perms.size === 1) id = [...perms.keys()][0];
      if (!id) { if (perms.size) enviar(`¿Cuál? Hay varios permisos pendientes: escribe por ejemplo 1 #${[...perms.values()][0].n}`); return !!perms.size; }
      await decidirPerm(id, { 1: 'allow', 2: 'always', 3: 'deny' }[m[1]]); return true;
    }
    if (objetivo?.tipo === 'card' && /^(enviar|descartar|ruido)$/i.test(t)) { await accionTarjeta(objetivo.id, t.toLowerCase()); return true; }
    return false;
  }
  async function decidirPerm(id, accion) {
    const s = perms.get(id);
    if (s && s.p.peligro && accion !== 'deny') {
      if (!s.confirmar) { s.confirmar = true; await enviar(`⛔ ¿Seguro? Esto es peligroso. Escribe CONFIRMO ${s.n} para permitirlo o 3 #${s.n} para denegarlo.`); }
      return;
    }
    if (!await Promise.resolve(canal.decidir(id, accion)).catch(() => false)) enviar('⌛ Ese permiso ya no está pendiente.');
  }
  async function accionTarjeta(id, acc) {
    const r = await Promise.resolve(canal.tarjeta(id, acc)).catch(e => '❌ ' + e.message);
    if (r) enviar(String(r));
  }

  async function notaDeVoz(a) {
    if ((a.size || 0) > 20 * 1024 * 1024) { enviar('🎙 Esa nota es demasiado larga.'); return null; }
    let ruta = null;
    try {
      const r = await rpc('getAttachment', { id: String(a.id), recipient: st.dueno }, { ms: 60_000 });
      const b64 = typeof r === 'string' ? r : r?.data;
      if (!b64) throw new Error('signal-cli no devolvió el audio');
      fs.mkdirSync(almacen.ruta, { recursive: true });
      ruta = path.join(almacen.ruta, `voz-${Date.now()}.${/ogg/.test(a.contentType) ? 'ogg' : 'm4a'}`);
      fs.writeFileSync(ruta, Buffer.from(b64, 'base64'));
      const t = await canal.transcribir(ruta);
      if (!t || !t.texto) { enviar('🎙 No entendí la nota de voz' + (t?.error ? ` (${t.error})` : '') + '. ¿Me lo escribes?'); return null; }
      return t.texto;
    } catch (e) { log('[signal] voz', e.message); enviar('🎙 No pude leer la nota de voz (hace falta signal-cli 0.13 o más nuevo).'); return null; }
    finally { if (ruta) fs.rm(ruta, () => { }); }
  }

  // ---------- lo que manda la app ----------
  const textoPerm = (p, k) => `${p.peligro ? '⛔ PELIGRO · ' : '⚠️ '}Permiso #${k}: ${p.tool}\n📁 ${p.session}\n${String(p.detail || '').slice(0, 900)}${p.peligro ? `\nOjo: ${p.peligro}` : ''}`;
  async function permiso(p) {
    if (!st.dueno || !st.visto || !vivo) return false;
    const id = String(p.id), k = ++corto;
    const pie = p.peligro ? `\n\nReacciona 👍 (te pediré CONFIRMO ${k}) o 👎 · o responde 1 / 3` : '\n\nReacciona 👍 permitir · 🔁 siempre · 👎 denegar · o responde 1 / 2 / 3';
    const ts = await enviar(textoPerm(p, k) + pie);
    if (!ts) return false;
    perms.set(id, { ts, n: k, p, confirmar: false }); porTs.set(+ts, { tipo: 'perm', id });
    return true;
  }
  function permisoResuelto(id, behavior, via) {
    const s = perms.get(String(id)); if (!s) return; perms.delete(String(id)); porTs.delete(+s.ts);
    const r = behavior === 'expired' ? '⌛ Caducó sin respuesta' : behavior === 'deny' ? `✋ Denegado desde ${via}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${via}`;
    return reaccionar(s.ts, behavior === 'deny' || behavior === 'expired' ? '✋' : '✅').then(() => enviar(`Permiso #${s.n}: ${r}`));
  }
  async function tarjeta(c) {
    if (!st.dueno || !st.visto || !vivo) return false;
    const t = `${c.prioridad === 'urgente' ? '🔴 URGENTE · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} ${c.author || ''}${c.guild ? ` · ${c.guild}` : ''}\n${c.resumen || ''}${c.respuesta ? `\n\nRespuesta sugerida:\n${c.respuesta}` : ''}\n\n${c.respuesta && c.canSend ? '📨 enviar · ' : ''}🗑 descartar · 🔕 ruido`;
    const ts = await enviar(t); if (!ts) return false;
    porTs.set(+ts, { tipo: 'card', id: String(c.id) });
    return true;
  }
  const avisar = texto => enviar(texto);

  // ---------- configuración (panel) ----------
  async function conectar({ url, cuenta, dueno } = {}) {
    const u = normalizarUrl(url || st.url);
    cuenta = String(cuenta || st.cuenta || '').replace(/[\s()-]/g, ''); dueno = String(dueno || st.dueno || '').replace(/[\s()-]/g, '');
    if (!NUM.test(cuenta)) throw new Error('El número de la cuenta de signal-cli (la del robot) debe ir con prefijo: +34600111222.');
    if (!NUM.test(dueno)) throw new Error('Tu número debe ir con prefijo: +34600111222.');
    if (cuenta === dueno) throw new Error('Usa un número DISTINTO para el robot (signal-cli registrado con otra SIM o un número virtual).');
    const v = await rpc('version', {}, { url: u, ms: 8000 }).catch(e => { throw new Error(`No encuentro signal-cli en ${u} (${e.message}). Arráncalo con: signal-cli -a ${cuenta} daemon --http ${u.replace(/^http:\/\//, '')}`); });
    detener();
    const mismo = st.dueno === dueno && st.cuenta === cuenta;
    guardar({ url: u, cuenta, dueno, version: v?.version || '', ...(mismo ? {} : { duenoUuid: null, visto: false }) });
    iniciar();
    await enviar('🤖 APOLO conectado. Escríbeme por aquí (solo atiendo a este número). Escribe "ayuda" para ver qué puedo hacer.');
    return estadoPublico();
  }
  async function desconectar() { detener(); st = {}; almacen.guardar('estado', {}); setEstado('sin configurar'); return estadoPublico(); }
  async function prueba() { if (!await avisar('🤖 Prueba: así te llegarán los avisos.')) throw new Error('No se pudo enviar: ¿está arrancado signal-cli?'); return estadoPublico(); }
  const estadoPublico = () => ({ configurado: !!(st.url && st.cuenta && st.dueno), estado, url: st.url || null, cuenta: st.cuenta || null, dueno: st.dueno || null, enlazado: !!st.visto, version: st.version || '' });

  function iniciar() {
    if (vivo || !st.url || !st.cuenta || !st.dueno) return;
    vivo = true; ctl = new AbortController(); setEstado('conectando');
    bucleEnCurso = bucle();
  }
  function detener() { vivo = false; try { ctl?.abort(); } catch { } ctl = null; }
  async function arrancar() { if (!st.url || !st.cuenta || !st.dueno) { setEstado('sin configurar'); return estadoPublico(); } iniciar(); return estadoPublico(); }

  return {
    arrancar, iniciar, detener, conectar, desconectar, prueba, estado: estadoPublico,
    permiso, permisoResuelto, tarjeta, avisar, procesar,
    get bucle() { return bucleEnCurso; },
  };
}

module.exports = { crearSignal, normalizarUrl, plano };
