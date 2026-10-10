// Voz neural de Microsoft Edge ("Leer en voz alta") SIN Python: el mismo protocolo que el paquete edge-tts,
// sobre el WebSocket propio (core/sdk/ws-cliente). Así la voz buena funciona nada más instalar, sin pip.
//   await sintetizar('Hola', 'salida.mp3', { voz: 'es-ES-AlvaroNeural', rate: '+8%', pitch: '+12Hz' })  → true | lanza Error
const fs = require('fs');
const crypto = require('crypto');
const { conectar } = require('../core/sdk/ws-cliente');

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM = '143.0.3650.75';
const MAYOR = CHROMIUM.split('.')[0];
const URL_WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' + TOKEN;
const URL_VOCES = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=' + TOKEN;
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAYOR}.0.0.0 Safari/537.36 Edg/${MAYOR}.0.0.0`;

let desfase = 0;                                    // segundos: corrige el reloj del PC si el servidor lo rechaza (403)
const id = () => crypto.randomUUID().replace(/-/g, '');
// Sec-MS-GEC: sha256(ticks de Windows redondeados a 5 min + token), en mayúsculas
function gec() {
  let s = Math.floor(Date.now() / 1000 + desfase) + 11644473600;
  s -= s % 300;
  return crypto.createHash('sha256').update(`${BigInt(s) * 10000000n}${TOKEN}`).digest('hex').toUpperCase();
}
const fecha = () => new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (.+) GMT$/, '$1 $3 $2 $4 $5') + ' GMT+0000 (Coordinated Universal Time)';
const xml = s => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');

async function corregirReloj() {
  try {
    const r = await fetch(URL_VOCES, { method: 'HEAD', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': UA } });
    const d = Date.parse(r.headers.get('date'));
    if (d) desfase = (d - Date.now()) / 1000;
  } catch { }
}

async function intentar(texto, archivo, { voz, rate = '+0%', pitch = '+0Hz', volume = '+0%' }, timeoutMs) {
  const ws = await conectar(`${URL_WSS}&ConnectionId=${id()}&Sec-MS-GEC=${gec()}&Sec-MS-GEC-Version=1-${CHROMIUM}`, {
    timeoutMs, cabeceras: {
      'Pragma': 'no-cache', 'Cache-Control': 'no-cache', 'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': `muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`,
    },
  });
  return new Promise((ok, mal) => {
    const trozos = [];
    const t = setTimeout(() => { ws.cerrar(); mal(new Error('edge-tts: tiempo agotado')); }, timeoutMs);
    ws.on('binario', b => {
      if (b.length < 2) return;
      const n = b.readUInt16BE(0), cab = b.subarray(2, 2 + n).toString('utf8');
      if (/Path:audio\r?\n/.test(cab + '\n') && b.length > 2 + n) trozos.push(b.subarray(2 + n));
    });
    ws.on('texto', s => {
      if (!/Path:turn\.end/.test(s)) return;
      clearTimeout(t); ws.cerrar();
      if (!trozos.length) return mal(new Error('edge-tts: no llegó audio'));
      fs.writeFileSync(archivo, Buffer.concat(trozos)); ok(true);
    });
    ws.on('cerrar', ({ motivo }) => { clearTimeout(t); if (!trozos.length) mal(new Error('edge-tts: conexión cerrada ' + (motivo || ''))); });
    ws.enviarTexto(`X-Timestamp:${fecha()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
      '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
    ws.enviarTexto(`X-RequestId:${id()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${fecha()}Z\r\nPath:ssml\r\n\r\n` +
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${xml(voz)}'>` +
      `<prosody pitch='${xml(pitch)}' rate='${xml(rate)}' volume='${xml(volume)}'>${xml(texto)}</prosody></voice></speak>`);
  });
}

async function sintetizar(texto, archivo, opciones, timeoutMs = 12_000) {
  try { return await intentar(texto, archivo, opciones, timeoutMs); }
  catch (e) {
    if (!/403/.test(e.message)) throw e;
    await corregirReloj();                           // reloj del PC desfasado: el token caduca cada 5 min
    return intentar(texto, archivo, opciones, timeoutMs);
  }
}

module.exports = { sintetizar };
