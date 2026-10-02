// Plugin de Telegram (plugins/telegram) con un fetch FALSO: nunca se llama a api.telegram.org.
// Enlace con código, solo el chat enlazado, permisos con botones (peligrosos con confirmación), tarjetas, voz, avisos, migración.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const M = require('../plugins/manifest');
const DIR = path.join(__dirname, '..', '..', 'plugins', 'telegram');
const { crearBot, html } = require(path.join(DIR, 'bot.js'));

const TOKEN = '123456789:' + 'A'.repeat(35);
function telegramFalso() {
  const llamadas = [], cola = []; let despertar = null, msgId = 100;
  const resp = j => ({ ok: j.ok, status: j.ok ? 200 : 400, json: async () => j });
  async function fetch(url, init = {}) {
    if (url.includes('/file/bot')) { llamadas.push({ metodo: 'descarga', url }); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([79, 103, 103, 83]).buffer }; }
    const metodo = url.split('/').pop(), datos = JSON.parse(init.body || '{}');
    if (!url.startsWith('https://api.telegram.org/bot')) throw new Error('URL inesperada');
    llamadas.push({ metodo, datos });
    switch (metodo) {
      case 'getMe': return resp(url.includes('/botMALO') ? { ok: false, error_code: 401, description: 'Unauthorized' } : { ok: true, result: { username: 'prueba_bot' } });
      case 'getUpdates':
        if (!cola.length) await new Promise((ok, mal) => { despertar = ok; init.signal?.addEventListener('abort', () => mal(new Error('abortado')), { once: true }); });
        return resp({ ok: true, result: cola.splice(0) });
      case 'sendMessage': case 'editMessageText': return resp({ ok: true, result: { message_id: ++msgId } });
      case 'getFile': return resp({ ok: true, result: { file_path: 'voice/file_1.oga' } });
      default: return resp({ ok: true, result: true });
    }
  }
  let uid = 1;
  const empujar = (...ups) => { cola.push(...ups.map(u => ({ update_id: uid++, ...u }))); const d = despertar; despertar = null; d?.(); };
  const de = (metodo, pred = () => true) => llamadas.filter(l => l.metodo === metodo && pred(l.datos));
  return { fetch, llamadas, empujar, de };
}
function entorno({ token = '', config = {} } = {}) {
  const tg = telegramFalso(), ruta = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-alm-'));
  const datos = {}, secretos = { 'tg:token': token }, ev = { recibidos: [], decisiones: [], tarjetas: [], estados: [], audios: [] };
  const canal = {
    recibir: async t => { ev.recibidos.push(t); return 'respuesta **ok**'; },
    estado: async (e, d) => { ev.estados.push(d); return true; },
    decidir: async (id, d) => { ev.decisiones.push([id, d]); return true; },
    tarjeta: async (id, a) => { ev.tarjetas.push([id, a]); return 'hecho'; },
    transcribir: async r => { ev.audios.push(fs.existsSync(r) && r.startsWith(ruta)); return { texto: 'hola por voz', error: '' }; },
  };
  const almacen = { ruta, leer: (k, d = null) => (k in datos ? JSON.parse(JSON.stringify(datos[k])) : d), guardar: (k, v) => { datos[k] = v; return true; } };
  const bot = crearBot({ fetch: tg.fetch, canal, almacen, secretos: { leer: async s => secretos[s] || '', guardar: async (s, v) => { secretos[s] = v; return true; } }, config, esperaReintento: 20 });
  return { tg, bot, ev, secretos, datos, ruta };
}
const hasta = async (f, ms = 3000) => { const t0 = Date.now(); for (; ;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await new Promise(ok => setTimeout(ok, 10)); } };

test('telegram plugin: manifest válido (canal con permisos, red solo api.telegram.org, secreto tg:token)', () => {
  const m = M.leer(DIR, '1.0.0');
  assert.deepStrictEqual(m.secretos, ['tg:token']);
  assert.deepStrictEqual(m.permisos.filter(p => p.startsWith('red')), ['red:api.telegram.org']);
  assert.strictEqual(m.aporta.canales[0].nombre, 'telegram'); assert.strictEqual(m.aporta.canales[0].permisos, true);
  assert.strictEqual(html('**a** <b> `c`'), '<b>a</b> &lt;b&gt; <code>c</code>');
});

test('telegram plugin: sin token no llama a nada; conectar valida y da el enlace start=código', async () => {
  const { tg, bot, secretos } = entorno();
  assert.strictEqual((await bot.arrancar()).configurado, false);
  assert.strictEqual(tg.llamadas.length, 0);
  await assert.rejects(bot.conectar({ token: 'hola' }), /no parece un token/);
  const e = await bot.conectar({ token: TOKEN });
  assert.strictEqual(secretos['tg:token'], TOKEN);
  assert.match(e.enlace, /^https:\/\/t\.me\/prueba_bot\?start=[0-9a-f]{12}$/);
  assert.strictEqual(e.enlazado, false);
  bot.detener();
});

test('telegram plugin: enlace, solo el chat enlazado, mensajes, permisos, tarjetas, voz y avisos', async () => {
  const { tg, bot, ev, datos, ruta } = entorno({ token: TOKEN, config: { bot: 'prueba_bot', codigo: 'abc123' } });
  await bot.arrancar();
  // un extraño con un código malo → privado; con el código bueno → enlazado
  tg.empujar({ message: { chat: { id: 555 }, text: '/start nope' } });
  await hasta(() => tg.de('sendMessage', d => d.chat_id === 555).length);
  assert.match(tg.de('sendMessage', d => d.chat_id === 555)[0].datos.text, /privado/);
  tg.empujar({ message: { chat: { id: 42 }, from: { first_name: 'Demon', username: 'demon' }, text: '/start abc123' } });
  await hasta(() => bot.estado().enlazado);
  assert.strictEqual(datos.estado.chatId, 42); assert.strictEqual(datos.estado.codigo, null); assert.strictEqual(bot.estado().usuario, 'demon');
  // texto del chat enlazado → APOLO → respuesta en HTML; otro chat → privado y no pasa
  tg.empujar({ message: { chat: { id: 42 }, text: 'qué tal' } }, { message: { chat: { id: 99 }, text: 'cuélame' } });
  await hasta(() => tg.de('sendMessage', d => d.chat_id === 42 && /<b>ok<\/b>/.test(d.text)).length && tg.de('sendMessage', d => d.chat_id === 99).length);
  assert.deepStrictEqual(ev.recibidos, ['qué tal']);
  // permiso normal: botones Permitir/Siempre/Denegar; el botón desde otro chat no vale
  assert.strictEqual(await bot.permiso({ id: '7', tool: 'Bash', detail: 'npm test', peligro: '', session: 'proyecto' }), true);
  const kb = tg.de('sendMessage', d => /Permiso: Bash/.test(d.text))[0].datos.reply_markup.inline_keyboard[0].map(b => b.callback_data);
  assert.deepStrictEqual(kb, ['perm:7:allow', 'perm:7:always', 'perm:7:deny']);
  tg.empujar({ callback_query: { id: 'q0', data: 'perm:7:allow', message: { chat: { id: 99 } } } }, { callback_query: { id: 'q1', data: 'perm:7:allow', message: { chat: { id: 42 } } } });
  await hasta(() => ev.decisiones.length);
  await hasta(() => tg.de('answerCallbackQuery').length === 2);
  assert.deepStrictEqual(ev.decisiones, [['7', 'allow']]);
  await bot.permisoResuelto('7', 'allow', 'Telegram');
  assert.ok(tg.de('editMessageText', d => /Permitido desde Telegram/.test(d.text)).length);
  // peligroso: sin "Siempre", primero pide confirmación
  await bot.permiso({ id: '8', tool: 'Bash', detail: 'rm -rf /', peligro: 'borra todo', session: 'x' });
  assert.deepStrictEqual(tg.de('sendMessage', d => /PELIGRO/.test(d.text))[0].datos.reply_markup.inline_keyboard[0].map(b => b.callback_data), ['perm:8:ask', 'perm:8:deny']);
  tg.empujar({ callback_query: { id: 'q2', data: 'perm:8:ask', message: { chat: { id: 42 } } } });
  await hasta(() => tg.de('editMessageText', d => /¿Seguro\?/.test(d.text)).length);
  assert.strictEqual(ev.decisiones.length, 1);
  tg.empujar({ callback_query: { id: 'q3', data: 'perm:8:allow', message: { chat: { id: 42 } } } });
  await hasta(() => ev.decisiones.length === 2);
  assert.deepStrictEqual(ev.decisiones[1], ['8', 'allow']);
  // tarjeta con sus botones
  assert.strictEqual(await bot.tarjeta({ id: '3', kind: 'mail', author: 'Ana', resumen: 'factura', respuesta: 'ok', canSend: true, prioridad: 'urgente' }), true);
  assert.match(tg.de('sendMessage', d => /Ana/.test(d.text))[0].datos.text, /URGENTE/);
  tg.empujar({ callback_query: { id: 'q4', data: 'card:3:enviar', message: { chat: { id: 42 }, text: 'Ana' } } });
  await hasta(() => ev.tarjetas.length);
  assert.deepStrictEqual(ev.tarjetas, [['3', 'enviar']]);
  // nota de voz: se descarga en el almacén, la transcribe la app y se borra
  tg.empujar({ message: { chat: { id: 42 }, voice: { file_id: 'F1', file_size: 1000 } } });
  await hasta(() => ev.recibidos.length === 2);
  assert.deepStrictEqual(ev.audios, [true]); assert.strictEqual(ev.recibidos[1], 'hola por voz');
  assert.ok(tg.de('sendMessage', d => /🎙 <i>hola por voz<\/i>/.test(d.text)).length);
  await hasta(() => !fs.readdirSync(ruta).some(f => f.startsWith('voz-')));
  // aviso proactivo
  await bot.avisar('**Hola** desde APOLO');
  assert.ok(tg.de('sendMessage', d => d.text === '<b>Hola</b> desde APOLO').length);
  bot.detener();
});

test('telegram plugin: migra el chat enlazado de telegram.js y token no válido para el bucle', async () => {
  const { tg, bot, ev } = entorno({ token: TOKEN, config: { chatId: 42, bot: 'viejo_bot', usuario: 'demon' } });
  await bot.arrancar();
  assert.strictEqual(bot.estado().enlazado, true);
  await hasta(() => ev.estados.includes('conectado'));
  tg.empujar({ message: { chat: { id: 42 }, text: '/estado' } });
  await hasta(() => tg.de('sendMessage', d => /encendido/.test(d.text)).length);
  bot.detener();
  const malo = entorno({ token: 'MALO' });
  await malo.bot.arrancar();
  await hasta(() => malo.ev.estados.includes('token no válido'));
  malo.bot.detener();
});

test('telegram plugin: se instala y activa en el gestor (proceso propio); sin token no sale a la red', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-tg-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, skills: { rutas: [] }, gestorPlugins: { timeoutMs: 8000 } }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [], resumen: 'ok' }) }, embedder: null });
  const pedidos = []; n.bus.on('permiso', p => pedidos.push(p));
  n.plugins.ponerSecretos({ leer: () => '', guardar: () => true, permitir: ({ plugin, nombre }) => plugin === 'telegram' && nombre === 'tg:token' });
  await n.plugins.instalar(DIR);
  const p = await n.plugins.activar('telegram', true);
  assert.deepStrictEqual(p.registrados.canales, ['telegram']);
  const e = await hasta(async () => { const x = await n.plugins.accionCanal('telegram', 'telegram', 'estado'); return x; });
  assert.strictEqual(e.configurado, false);
  assert.strictEqual(await n.plugins.mostrarPermiso({ id: 1, tool: 'Bash', detail: 'ls', session: 's' }), 0);   // sin chat enlazado no se muestra
  await assert.rejects(n.plugins.accionCanal('telegram', 'telegram', 'conectar', { token: 'malo' }), /no parece un token/);
  await assert.rejects(n.plugins.accionCanal('telegram', 'telegram', 'constructor'), /no tiene la acción/);
  assert.strictEqual(pedidos.length, 0);                                                         // tg:token lo permitió la app: sin preguntar
  await n.plugins.cerrar();
});
