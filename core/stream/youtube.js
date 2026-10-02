// Chat de YouTube en directo (YouTube Data API v3, liveChatMessages) por sondeo.
// Necesita una API key del usuario (solo leer) o un token OAuth (leer + escribir). Ver docs/stream.md.
// Cuota: 10 000 unidades/día por proyecto; cada lectura del chat gasta ~5. Por eso el sondeo nunca baja de minSeg
// (por defecto 15 s ≈ 1200 unidades/hora) aunque YouTube sugiera menos con pollingIntervalMillis.
const API = 'https://www.googleapis.com/youtube/v3';

// acepta la URL del directo (watch?v=, youtu.be/, /live/) o el id de 11 caracteres
function idDeVideo(x) {
  const s = String(x || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : '';
}

// item de liveChatMessages → { mensaje } | { alerta } | null
function convertirItem(it) {
  const s = it?.snippet || {}, a = it?.authorDetails || {};
  const usuario = a.displayName || 'alguien';
  const base = { plataforma: 'youtube', id: it.id, usuario, login: a.channelId || usuario, t: Date.parse(s.publishedAt) || Date.now(), mod: !!a.isChatModerator, streamer: !!a.isChatOwner, sub: !!a.isChatSponsor };
  switch (s.type) {
    case 'textMessageEvent': return { mensaje: { ...base, texto: s.textMessageDetails?.messageText ?? s.displayMessage ?? '' } };
    case 'superChatEvent': return { alerta: { plataforma: 'youtube', tipo: 'donacion', usuario, cantidad: s.superChatDetails?.amountDisplayString || '', texto: s.superChatDetails?.userComment || '' } };
    case 'superStickerEvent': return { alerta: { plataforma: 'youtube', tipo: 'donacion', usuario, cantidad: s.superStickerDetails?.amountDisplayString || '', texto: '' } };
    case 'newSponsorEvent': return { alerta: { plataforma: 'youtube', tipo: 'sub', usuario, cantidad: 0, texto: s.newSponsorDetails?.memberLevelName || '' } };
    case 'memberMilestoneChatEvent': return { alerta: { plataforma: 'youtube', tipo: 'sub', usuario, cantidad: s.memberMilestoneChatDetails?.memberMonth || 0, texto: s.memberMilestoneChatDetails?.userComment || '' } };
    case 'membershipGiftingEvent': return { alerta: { plataforma: 'youtube', tipo: 'regalo', usuario, cantidad: s.membershipGiftingDetails?.giftMembershipsCount || 1, texto: '' } };
    default: return null;
  }
}

function crearYoutube({ video = '', apiKey = '', oauth = '', minSeg = 15, fetch: f = globalThis.fetch, alMensaje = () => { }, alAlerta = () => { }, alEstado = () => { }, log = () => { } } = {}) {
  if (!apiKey && !oauth) throw new Error('falta la API key o el token OAuth de YouTube');
  const vid = idDeVideo(video);
  if (!vid && !oauth) throw new Error('pega la URL o el id del directo (sin OAuth no puedo buscar tu emisión activa)');
  let parado = false, chatId = '', pagina = '', temporizador = null, estado = 'conectando', primera = true, unidades = 0;
  const ponerEstado = (e, detalle = '') => { estado = e; alEstado({ estado: e, detalle }); };
  const llamar = async (ruta, opciones = {}) => {
    const u = new URL(API + ruta);
    if (!oauth && apiKey) u.searchParams.set('key', apiKey);
    const r = await f(u, { ...opciones, headers: { ...(oauth ? { authorization: 'Bearer ' + oauth } : {}), ...(opciones.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(15_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const motivo = j?.error?.errors?.[0]?.reason || ''; throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { status: r.status, motivo }); }
    return j;
  };
  async function buscarChat() {
    if (vid) {
      unidades += 1;
      const j = await llamar(`/videos?part=liveStreamingDetails,snippet&id=${vid}`);
      const d = j.items?.[0]; if (!d) throw new Error('no encuentro ese vídeo');
      if (!d.liveStreamingDetails?.activeLiveChatId) throw new Error('ese vídeo no está en directo ahora (o tiene el chat desactivado)');
      return { id: d.liveStreamingDetails.activeLiveChatId, titulo: d.snippet?.title || '' };
    }
    unidades += 1;
    const j = await llamar('/liveBroadcasts?part=snippet&broadcastStatus=active&mine=true');
    const b = j.items?.[0]; if (!b) throw new Error('no tienes ninguna emisión activa en YouTube');
    return { id: b.snippet.liveChatId, titulo: b.snippet.title || '' };
  }
  async function sondear() {
    if (parado) return;
    let espera = minSeg * 1000;
    try {
      if (!chatId) { const c = await buscarChat(); chatId = c.id; ponerEstado('conectado', c.titulo ? `«${c.titulo.slice(0, 60)}»${oauth ? '' : ' (solo lectura)'}` : ''); }
      unidades += 5;
      const j = await llamar(`/liveChat/messages?liveChatId=${encodeURIComponent(chatId)}&part=snippet,authorDetails&maxResults=200${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`);
      pagina = j.nextPageToken || pagina;
      espera = Math.max(minSeg * 1000, +j.pollingIntervalMillis || 0);
      // la primera página es el historial: no se reacciona a mensajes viejos
      if (!primera) for (const it of j.items || []) { const c = convertirItem(it); if (c?.mensaje) alMensaje(c.mensaje); if (c?.alerta) alAlerta(c.alerta); }
      primera = false;
      if (estado !== 'conectado') ponerEstado('conectado');
    } catch (e) {
      if (e.motivo === 'quotaExceeded') { ponerEstado('error', 'cuota de YouTube agotada por hoy'); parado = true; return; }
      if (e.motivo === 'liveChatEnded' || e.motivo === 'liveChatNotFound') { ponerEstado('desconectado', 'el directo terminó'); parado = true; return; }
      if (e.status === 401 || (e.status === 403 && e.motivo !== 'rateLimitExceeded')) { ponerEstado('error', `YouTube: ${e.message.slice(0, 120)}`); parado = true; return; }
      ponerEstado('error', e.message.slice(0, 120)); espera = Math.max(espera, 30_000);
    }
    if (!parado) temporizador = setTimeout(sondear, espera);
  }
  sondear();
  return {
    puedeEscribir: !!oauth,
    estado: () => estado,
    unidades: () => unidades,
    async escribir(texto) {
      if (!oauth || !chatId) return false;
      unidades += 50;
      await llamar('/liveChat/messages?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { liveChatId: chatId, type: 'textMessageEvent', textMessageDetails: { messageText: String(texto).slice(0, 200) } } }) });
      return true;
    },
    cerrar() { parado = true; clearTimeout(temporizador); ponerEstado('desconectado'); },
  };
}

module.exports = { crearYoutube, convertirItem, idDeVideo };
