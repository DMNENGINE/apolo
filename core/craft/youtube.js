// YouTube del canal (API oficial): conectar la cuenta con OAuth (app de escritorio + PKCE, el navegador vuelve a un puerto
// local de un solo uso), subir un clip con subida reanudable (programado con publishAt), ponerle la portada y los
// subtítulos (.srt) y leer estadísticas y retención (YouTube Analytics) para aprender qué funciona.
// Archivos en <datos>/craft: youtube-cliente.json (el JSON "OAuth client ID → Desktop app" de Google Cloud) y
// youtube-token.json (refresh token + canal). Cuota de la API: ~10 000 unidades/día; subir = 1600, portada = 50, subtítulos = 400.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ALCANCES = ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
const API = 'https://www.googleapis.com/youtube/v3', SUBIR = 'https://www.googleapis.com/upload/youtube/v3';
const TROZO = 32 * 1024 * 1024;                           // múltiplo de 256 KiB, como pide la subida reanudable

class ErrorYT extends Error { constructor(m, { status, motivo } = {}) { super(m); this.status = status; this.motivo = motivo; this.cuota = /quotaExceeded|uploadLimitExceeded|dailyLimitExceeded|rateLimitExceeded/.test(motivo || ''); } }

function crearYouTube({ dir, pedir = globalThis.fetch, abrir = null, log = () => { } }) {
  const FCLI = path.join(dir, 'youtube-cliente.json'), FTOK = path.join(dir, 'youtube-token.json');
  const leer = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const guardar = (f, o) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  const cliente = () => { const j = leer(FCLI); const c = j?.installed || j?.web || j; return c?.client_id && c?.client_secret ? c : null; };
  let tok = leer(FTOK), pendiente = null;

  const estado = () => ({ configurado: !!cliente(), conectado: !!tok?.refresh_token, canal: tok?.canal || null, conectando: !!pendiente, alcances: tok?.scope || null });

  function ponerCliente(json) {
    const j = typeof json === 'string' ? JSON.parse(json) : json, c = j?.installed || j?.web || j;
    if (!c?.client_id || !c?.client_secret) throw Object.assign(new Error('ese JSON no tiene client_id y client_secret (descárgalo de Google Cloud → Credenciales → ID de cliente OAuth → App de escritorio)'), { status: 400 });
    guardar(FCLI, { installed: { client_id: c.client_id, client_secret: c.client_secret } });
    return estado();
  }
  function desconectar() { tok = null; try { fs.rmSync(FTOK, { force: true }); } catch { } return estado(); }

  async function formulario(url, datos) {
    const r = await pedir(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(datos).toString() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErrorYT(`Google ${r.status}: ${d.error_description || d.error || 'error'}`, { status: r.status, motivo: d.error });
    return d;
  }

  // conectar: abre el consentimiento de Google en el navegador; Google vuelve a http://127.0.0.1:<puerto>/ con el código
  async function conectar({ esperarMs = 10 * 60_000 } = {}) {
    const c = cliente(); if (!c) throw Object.assign(new Error('primero sube el JSON del cliente OAuth de Google Cloud'), { status: 409 });
    if (pendiente) return { url: pendiente.url };
    const verificador = crypto.randomBytes(32).toString('base64url'), reto = crypto.createHash('sha256').update(verificador).digest('base64url');
    const estadoOAuth = crypto.randomBytes(16).toString('hex');
    const srv = http.createServer();
    await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
    const redirect = `http://127.0.0.1:${srv.address().port}/`;
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: c.client_id, redirect_uri: redirect, response_type: 'code', scope: ALCANCES.join(' '),
      access_type: 'offline', prompt: 'consent', state: estadoOAuth, code_challenge: reto, code_challenge_method: 'S256' });
    const fin = () => { clearTimeout(reloj); try { srv.close(); } catch { } pendiente = null; };
    const reloj = setTimeout(() => { log('[youtube] conexión caducada'); fin(); }, esperarMs); reloj.unref?.();
    const listo = new Promise((ok, mal) => srv.on('request', async (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      if (!q.get('code') && !q.get('error')) { res.writeHead(404).end(); return; }
      const html = (t, bien) => { res.writeHead(bien ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;background:#0b1d3a;color:#fff;display:grid;place-items:center;height:100vh"><div>${t}<br><small>Ya puedes cerrar esta pestaña.</small></div>`); };
      try {
        if (q.get('state') !== estadoOAuth) throw new Error('estado OAuth no coincide');
        if (q.get('error')) throw new Error(`Google: ${q.get('error')}`);
        const d = await formulario('https://oauth2.googleapis.com/token', { code: q.get('code'), client_id: c.client_id, client_secret: c.client_secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verificador });
        if (!d.refresh_token) throw new Error('Google no dio refresh_token');
        tok = { refresh_token: d.refresh_token, access_token: d.access_token, expira: Date.now() + (d.expires_in - 60) * 1000, scope: d.scope };
        const ch = await api('GET', `${API}/channels?part=snippet,contentDetails&mine=true`);
        const it = ch.items?.[0];
        tok.canal = it ? { id: it.id, titulo: it.snippet?.title, subidas: it.contentDetails?.relatedPlaylists?.uploads } : null;
        guardar(FTOK, tok);
        html(`✅ APOLO conectado a YouTube${tok.canal ? `: <b>${tok.canal.titulo}</b>` : ''}`, true); ok(estado());
      } catch (e) { html(`❌ ${String(e.message).replace(/</g, '&lt;')}`); mal(e); }
      finally { fin(); }
    }));
    listo.catch(e => log('[youtube] conectar', e.message));
    pendiente = { url, listo };
    try { abrir?.(url); } catch { }
    return { url };
  }

  async function token() {
    if (!tok?.refresh_token) throw Object.assign(new ErrorYT('YouTube no está conectado'), { status: 409 });
    if (tok.access_token && Date.now() < tok.expira) return tok.access_token;
    const c = cliente(); if (!c) throw new ErrorYT('falta el cliente OAuth');
    const d = await formulario('https://oauth2.googleapis.com/token', { refresh_token: tok.refresh_token, client_id: c.client_id, client_secret: c.client_secret, grant_type: 'refresh_token' })
      .catch(e => { if (e.motivo === 'invalid_grant') { desconectar(); throw new ErrorYT('Google retiró el permiso; vuelve a conectar YouTube', { status: 401, motivo: 'invalid_grant' }); } throw e; });
    tok = { ...tok, access_token: d.access_token, expira: Date.now() + (d.expires_in - 60) * 1000 };
    guardar(FTOK, tok);
    return tok.access_token;
  }

  async function api(M, url, { cuerpo, crudo, tipo, cabeceras = {} } = {}) {
    const r = await pedir(url, { method: M, headers: { Authorization: `Bearer ${await token()}`, ...(cuerpo ? { 'content-type': 'application/json; charset=UTF-8' } : tipo ? { 'content-type': tipo } : {}), ...cabeceras },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : crudo ? { body: crudo } : {}) });
    if (r.status === 204) return {};
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = d.error || {}; throw new ErrorYT(`YouTube ${r.status}: ${e.message || 'error'}`, { status: r.status, motivo: e.errors?.[0]?.reason || e.status }); }
    return d;
  }

  // subida reanudable: se abre la sesión con los metadatos y el vídeo va en trozos de 32 MB (si un trozo falla, se pregunta
  // a YouTube hasta dónde llegó y se sigue desde ahí)
  async function subir({ archivo, titulo, descripcion = '', etiquetas = [], idioma = 'es', idiomaAudio = 'es', localizaciones, privacidad = 'public', publicarEn = null, categoria = '20', progreso = () => { } }) {
    const total = fs.statSync(archivo).size;
    const meta = { snippet: { title: String(titulo).slice(0, 100), description: String(descripcion).slice(0, 4900), tags: etiquetas.slice(0, 30), categoryId: categoria, defaultLanguage: idioma, defaultAudioLanguage: idiomaAudio },
      status: { privacyStatus: publicarEn ? 'private' : privacidad, ...(publicarEn ? { publishAt: new Date(publicarEn).toISOString() } : {}), selfDeclaredMadeForKids: false, embeddable: true },
      ...(localizaciones && Object.keys(localizaciones).length ? { localizations: localizaciones } : {}) };
    const partes = ['snippet', 'status', ...(meta.localizations ? ['localizations'] : [])].join(',');
    const ini = await pedir(`${SUBIR}/videos?uploadType=resumable&part=${partes}`, { method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'content-type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(total), 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify(meta) });
    if (!ini.ok) { const d = await ini.json().catch(() => ({})); const e = d.error || {}; throw new ErrorYT(`YouTube ${ini.status}: ${e.message || 'no abrió la subida'}`, { status: ini.status, motivo: e.errors?.[0]?.reason }); }
    const sesion = ini.headers.get('location');
    if (!sesion) throw new ErrorYT('YouTube no dio la dirección de subida');
    const fd = fs.openSync(archivo, 'r');
    try {
      let desde = 0, fallos = 0;
      while (true) {
        const hasta = Math.min(total, desde + TROZO), buf = Buffer.alloc(hasta - desde);
        fs.readSync(fd, buf, 0, buf.length, desde);
        let r;
        try { r = await pedir(sesion, { method: 'PUT', headers: { Authorization: `Bearer ${await token()}`, 'content-length': String(buf.length), 'content-range': `bytes ${desde}-${hasta - 1}/${total}` }, body: buf }); }
        catch (e) { r = { status: 0, error: e }; }
        if (r.status === 200 || r.status === 201) { progreso(100); return await r.json(); }
        if (r.status === 308) { const rg = r.headers.get('range'); desde = rg ? +rg.split('-')[1] + 1 : 0; fallos = 0; progreso(Math.round(desde / total * 100)); continue; }
        if (r.status >= 400 && r.status < 500 && r.status !== 408) { const d = await r.json?.().catch(() => ({})); const e = d?.error || {}; throw new ErrorYT(`YouTube ${r.status}: ${e.message || 'subida rechazada'}`, { status: r.status, motivo: e.errors?.[0]?.reason }); }
        if (++fallos > 6) throw new ErrorYT(`la subida se cortó demasiadas veces (${r.error?.message || r.status})`);
        await new Promise(ok => setTimeout(ok, Math.min(60_000, 2000 * 2 ** fallos)));
        // ¿hasta dónde llegó?
        const q = await pedir(sesion, { method: 'PUT', headers: { Authorization: `Bearer ${await token()}`, 'content-length': '0', 'content-range': `bytes */${total}` } }).catch(() => null);
        if (q?.status === 200 || q?.status === 201) return await q.json();
        if (q?.status === 308) { const rg = q.headers.get('range'); desde = rg ? +rg.split('-')[1] + 1 : 0; }
      }
    } finally { fs.closeSync(fd); }
  }

  const portada = (videoId, jpg) => api('POST', `${SUBIR}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, { crudo: fs.readFileSync(jpg), tipo: 'image/jpeg' });

  async function subtitulos(videoId, { idioma, nombre, srt }) {
    const borde = 'apolo' + crypto.randomBytes(8).toString('hex');
    const cuerpo = Buffer.concat([
      Buffer.from(`--${borde}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ snippet: { videoId, language: idioma, name: nombre, isDraft: false } })}\r\n--${borde}\r\ncontent-type: application/octet-stream\r\n\r\n`),
      Buffer.from(srt, 'utf8'), Buffer.from(`\r\n--${borde}--`)]);
    return api('POST', `${SUBIR}/captions?part=snippet&uploadType=multipart`, { crudo: cuerpo, tipo: `multipart/related; boundary=${borde}` });
  }

  // lo último subido al canal (también lo que suba el streamer a mano): id, título, fecha, duración, estadísticas
  async function recientes(n = 50) {
    if (!tok?.canal?.subidas) throw new ErrorYT('no sé la lista de subidas del canal');
    const pl = await api('GET', `${API}/playlistItems?part=contentDetails&maxResults=${Math.min(50, n)}&playlistId=${tok.canal.subidas}`);
    const ids = (pl.items || []).map(x => x.contentDetails?.videoId).filter(Boolean);
    return ids.length ? videos(ids) : [];
  }
  const dur = iso => { const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0); };
  async function videos(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const d = await api('GET', `${API}/videos?part=snippet,statistics,contentDetails,status&id=${ids.slice(i, i + 50).join(',')}`);
      for (const v of d.items || []) out.push({ plataforma: 'youtube', id: v.id, url: `https://www.youtube.com/shorts/${v.id}`, titulo: v.snippet?.title || '', fecha: Date.parse(v.status?.publishAt || v.snippet?.publishedAt) || null,
        duracion: dur(v.contentDetails?.duration), vistas: +v.statistics?.viewCount || 0, likes: +v.statistics?.likeCount || 0, comentarios: +v.statistics?.commentCount || 0, privacidad: v.status?.privacyStatus });
    }
    return out;
  }
  // retención: % medio visto y segundos medios por vídeo (YouTube Analytics, solo del canal conectado)
  async function retencion(ids) {
    const out = {};
    const hoy = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < ids.length; i += 100) {
      const d = await api('GET', 'https://youtubeanalytics.googleapis.com/v2/reports?' + new URLSearchParams({ ids: 'channel==MINE', startDate: '2020-01-01', endDate: hoy,
        metrics: 'views,averageViewDuration,averageViewPercentage,shares,subscribersGained', dimensions: 'video', filters: `video==${ids.slice(i, i + 100).join(',')}` }));
      for (const f of d.rows || []) out[f[0]] = { vistasAnalytics: f[1], segundosMedios: f[2], retencion: +(+f[3]).toFixed(1), compartidos: f[4], suscriptores: f[5] };
    }
    return out;
  }

  return { estado, ponerCliente, conectar, desconectar, subir, portada, subtitulos, recientes, videos, retencion, conectado: () => !!tok?.refresh_token, esperarConexion: () => pendiente?.listo };
}

module.exports = { crearYouTube, ErrorYT, ALCANCES };
