// Bot de Discord de Robot Companion corriendo en la Raspberry Pi (siempre encendida).
// Usa el mismo bot-discord.js que la app; sus "ganchos" llaman al núcleo del PC por la LAN,
// y lo que el PC quiere enviar (permisos, avisos, respuestas, tarjetas) llega por eventos en vivo.
//   discord.json : token, ownerId, centralGuildId, mutedGuilds  (modo 600)
//   pc.json      : { "url": "http://192.168.1.31:47900", "token": "<token del núcleo>" }  (modo 600)
const fs = require('fs');
const path = require('path');
const { createDiscord } = require('./bot-discord');

const pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'pc.json'), 'utf8'));
const APAGADO = '💤 El PC está apagado o el robot no está abierto. Cuando vuelva, pídemelo otra vez.';
let pcVivo = false, caidoDesde = 0, avisadoCaida = false;

async function llamar(accion, cuerpo = {}, ms = 130_000) {
  try {
    const r = await fetch(`${pc.url}/v1/remoto/${accion}`, {
      method: 'POST', headers: { 'x-robot-token': pc.token, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return undefined;
    return (await r.json()).r;
  } catch { return undefined; }
}

const bot = createDiscord(path.join(__dirname, 'discord.json'), {
  decide: async (id, b, via) => !!(await llamar('decidir', { id, b, via }, 15_000)),
  onServerMessage: m => { llamar('ingest', { m }, 15_000); },
  cardAction: async (id, accion) => (await llamar('tarjeta', { id, accion }, 30_000)) ?? APAGADO,
  onTalk: async texto => (await llamar('texto', { texto })) || { ok: false, msg: APAGADO },
  onSummary: async () => (await llamar('resumen', {}, 15_000)) || APAGADO,
  onStatus: s => console.log('[discord]', s),
});

// eventos del PC → acciones del bot
async function escuchar() {
  for (;;) {
    try {
      const r = await fetch(`${pc.url}/v1/eventos`, { headers: { 'x-robot-token': pc.token, 'x-cliente': 'pi' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      estado(true);
      const lector = r.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
          for (const l of bloque.split('\n')) {
            if (!l.startsWith('data: ')) continue;
            let e; try { e = JSON.parse(l.slice(6)); } catch { continue; }
            if (e.tipo === 'remoto' && typeof bot[e.metodo] === 'function') {
              Promise.resolve(bot[e.metodo](...(e.args || []))).catch(er => console.error('[pi]', e.metodo, er.message));
            }
          }
        }
      }
    } catch (e) { if (pcVivo) console.log('[pi] sin conexión con el PC:', e.message); }
    estado(false);
    await new Promise(r => setTimeout(r, 5000));
  }
}
function estado(vivo) {
  if (vivo === pcVivo) return;
  pcVivo = vivo;
  console.log(`[pi] PC ${vivo ? 'conectado' : 'desconectado'}`);
  if (!vivo) caidoDesde = Date.now();
  else if (avisadoCaida) { avisadoCaida = false; bot.sendAviso('🔌 **PC de vuelta.** El robot vuelve a estar contigo.', 'green'); }
}
// si el PC lleva 3 min caído, avisa una vez (sin spam si duerme toda la noche)
setInterval(() => {
  if (!pcVivo && !avisadoCaida && caidoDesde && Date.now() - caidoDesde > 180_000) {
    avisadoCaida = true;
    bot.sendAviso('💤 **El PC se apagó o el robot se cerró.** Sigo aquí en la Pi; los mensajes que me mandes los contesto cuando vuelva.', 'gray');
  }
}, 30_000);

escuchar();
process.on('SIGTERM', () => { try { bot.stop(); } catch { } process.exit(0); });
