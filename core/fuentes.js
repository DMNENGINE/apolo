// Lectores especiales para la herramienta `web`: páginas cuyo HTML no trae el contenido útil.
//   YouTube → título, canal, fecha, descripción y TRANSCRIPCIÓN (subtítulos; prefiere los manuales en español,
//             luego los automáticos, luego el idioma original). API pública "player" como cliente Android, sin claves.
//   (Reddit, TikTok y X bloquean a los programas sin sesión: para esos, el navegador con la extensión.)
// especial(url) → texto | null (null = no es una de estas, o falló: la herramienta sigue con la descarga normal).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ANDROID = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34 };

function idYouTube(url) {
  let u; try { u = new URL(url); } catch { return null; }
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  if (h === 'youtu.be') return u.pathname.slice(1, 12) || null;
  if (h !== 'youtube.com' && h !== 'youtube-nocookie.com') return null;
  if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
  const m = /^\/(shorts|live|embed|v)\/([\w-]{11})/.exec(u.pathname);
  return m ? m[2] : null;
}

const decodificar = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

async function leerYouTube(id, { signal, idioma = 'es' } = {}) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' },
    body: JSON.stringify({ videoId: id, context: { client: { ...ANDROID, hl: idioma } } }),
  });
  const j = await r.json();
  const v = j.videoDetails;
  if (!v) return `[YouTube] No se pudo leer el vídeo ${id}: ${j.playabilityStatus?.reason || j.playabilityStatus?.status || 'sin datos'}`;
  const pistas = j.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const es = p => p.languageCode.startsWith(idioma);
  const p = pistas.find(x => es(x) && x.kind !== 'asr') || pistas.find(x => es(x)) || pistas.find(x => x.kind === 'asr') || pistas[0];
  let trans = '';
  if (p) {
    try {
      const x = await (await fetch(p.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3', { signal, headers: { 'user-agent': UA } })).json();
      trans = (x.events || []).map(e => (e.segs || []).map(s => s.utf8).join('')).join(' ').replace(/\s+/g, ' ').trim();
    } catch { }
  }
  const min = Math.round((+v.lengthSeconds || 0) / 60);
  return [
    `[YouTube] ${decodificar(v.title)}`,
    `Canal: ${v.author} · Duración: ${min} min · Visualizaciones: ${(+v.viewCount || 0).toLocaleString('es')} · https://www.youtube.com/watch?v=${id}`,
    v.shortDescription ? `\nDESCRIPCIÓN:\n${v.shortDescription}` : '',
    trans ? `\nTRANSCRIPCIÓN (${p.languageCode}${p.kind === 'asr' ? ', automática: puede tener errores' : ''}):\n${trans}`
      : '\n(Este vídeo no tiene subtítulos: solo hay título y descripción.)',
  ].filter(Boolean).join('\n');
}

async function especial(url, opciones = {}) {
  try {
    const id = idYouTube(url);
    if (id) return await leerYouTube(id, opciones);
  } catch (e) { if (e.name === 'AbortError') throw e; }
  return null;
}

module.exports = { especial, idYouTube, leerYouTube };
