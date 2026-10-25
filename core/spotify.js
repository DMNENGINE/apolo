// Spotify (Web API) para el módulo Música de la Rabbit R1: tus playlists, lo guardado y lo reciente, y ponerlo a sonar
// en la R1 (Spotify Connect) o en otro dispositivo. La app de Spotify de la R1 es la que suena; esto es "la biblioteca y el mando".
// Login OAuth con PKCE (sin client secret): cfg.spotify.clientId de una app creada en developer.spotify.com con la
// redirect URI  http://127.0.0.1:<puerto del daemon>/spotify/callback  — el daemon atiende /spotify/callback sin token
// (lo protege el "state" de un solo uso). Los tokens se guardan en <dir>/spotify.json (0600), nunca se devuelven por la API.
// API (extensión del daemon, con token):
//   GET  /v1/spotify/estado → {configurado, vinculado, usuario}      POST /v1/spotify/vincular → abre el login en el navegador del PC
//   POST /v1/spotify/desvincular · PUT /v1/spotify/config {clientId}
//   GET  /v1/spotify/playlists · /v1/spotify/guardadas · /v1/spotify/recientes · /v1/spotify/dispositivos
//   POST /v1/spotify/poner {uri, dispositivo?} → suena en la R1 si su Spotify está activo; si no {abrir: uri} para que la R1 lo abra
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ALCANCES = 'playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played user-read-playback-state user-modify-playback-state user-read-currently-playing';
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const err = (m, status = 400) => Object.assign(new Error(m), { status });

function crearSpotify({ nucleo, puerto = () => 47900, fetch: f = (...a) => globalThis.fetch(...a), abrir }) {
  const { cfg } = nucleo;
  const fTok = path.join(cfg.dir, 'spotify.json');
  let tok = null; try { tok = JSON.parse(fs.readFileSync(fTok, 'utf8')); } catch { }
  const guardar = () => { try { fs.writeFileSync(fTok, JSON.stringify(tok), { mode: 0o600 }); } catch { } };
  const pendientes = new Map();               // state → {verifier, hasta}
  const clientId = () => String(cfg.spotify?.clientId || '').trim();
  const redirect = () => `http://127.0.0.1:${puerto()}/spotify/callback`;
  const abrirNavegador = abrir || (url => (process.platform === 'win32' ? spawn('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')], { windowsHide: true, detached: true })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true })).unref());

  function urlLogin() {
    if (!clientId()) throw err('falta el Client ID de Spotify (PUT /v1/spotify/config {clientId})');
    const verifier = b64url(crypto.randomBytes(48)), state = b64url(crypto.randomBytes(16));
    pendientes.set(state, { verifier, hasta: Date.now() + 10 * 60_000 });
    const q = new URLSearchParams({ response_type: 'code', client_id: clientId(), scope: ALCANCES, redirect_uri: redirect(), state,
      code_challenge_method: 'S256', code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) });
    return `https://accounts.spotify.com/authorize?${q}`;
  }
  async function pedirToken(campos) {
    const r = await f('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), ...campos }).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err(`Spotify: ${j.error_description || j.error || r.status}`, 502);
    tok = { ...(tok || {}), acceso: j.access_token, refresco: j.refresh_token || tok?.refresco, caduca: Date.now() + (j.expires_in - 60) * 1000 };
    guardar();
  }
  // /spotify/callback (lo llama el daemon sin token): devuelve el HTML que verá el navegador
  async function callback(q) {
    const p = pendientes.get(String(q.state || ''));
    pendientes.delete(String(q.state || ''));
    if (!p || p.hasta < Date.now()) return { codigo: 400, html: pagina('El enlace caducó o no es válido. Vuelve a pulsar «Vincular Spotify».') };
    if (q.error || !q.code) return { codigo: 400, html: pagina(`Spotify no dio permiso (${String(q.error || 'sin código').slice(0, 60)}).`) };
    try {
      await pedirToken({ grant_type: 'authorization_code', code: String(q.code), redirect_uri: redirect(), code_verifier: p.verifier });
      const yo = await api('GET', '/me').catch(() => null);
      if (yo) { tok.usuario = yo.display_name || yo.id; guardar(); }
      nucleo.bus?.emit('evento', { tipo: 'spotify', accion: 'vinculado' });
      return { codigo: 200, html: pagina(`Spotify vinculado${tok.usuario ? ` como ${tok.usuario}` : ''}. Ya puedes cerrar esta pestaña.`) };
    } catch (e) { return { codigo: 502, html: pagina(`No se pudo vincular: ${e.message}`) }; }
  }
  const pagina = t => `<!doctype html><meta charset="utf-8"><title>APOLO · Spotify</title><body style="font:20px system-ui;background:#000;color:#1ed760;display:grid;place-items:center;height:90vh"><p>${String(t).replace(/[<>&]/g, '')}</p>`;

  async function api(M, ruta, cuerpo) {
    if (!tok?.refresco) throw err('Spotify no está vinculado', 409);
    if (!tok.acceso || Date.now() > tok.caduca) await pedirToken({ grant_type: 'refresh_token', refresh_token: tok.refresco });
    const r = await f(`https://api.spotify.com/v1${ruta}`, { method: M, headers: { authorization: `Bearer ${tok.acceso}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) throw err(`Spotify: ${j?.error?.message || r.status}`, r.status === 401 ? 409 : 502);
    return j;
  }
  const img = x => (x?.images || x?.album?.images || []).slice(-1)[0]?.url || '';

  async function dispositivos() {
    const j = await api('GET', '/me/player/devices');
    return (j?.devices || []).map(d => ({ id: d.id, nombre: d.name, tipo: d.type, activo: d.is_active, volumen: d.volume_percent }));
  }
  // la R1 en Spotify Connect: el dispositivo tipo Smartphone (es el único Android que hay), o cfg.spotify.dispositivo
  const esR1 = d => (cfg.spotify?.dispositivo ? d.nombre === cfg.spotify.dispositivo : d.tipo === 'Smartphone');

  async function poner({ uri, dispositivo }) {
    uri = String(uri || '');
    if (!/^spotify:(playlist|album|artist|track|show|episode|collection)(:[\w:]+)?$/.test(uri) && uri !== 'spotify:collection') throw err('uri de Spotify no válida');
    const L = await dispositivos().catch(() => []);
    const d = dispositivo ? L.find(x => x.id === dispositivo) : L.find(esR1);
    if (!d) return { abrir: uri, motivo: 'el Spotify de la R1 no está activo: se abre allí' };
    const cuerpo = /^spotify:track:/.test(uri) ? { uris: [uri] } : uri === 'spotify:collection' ? null : { context_uri: uri };
    if (cuerpo) await api('PUT', `/me/player/play?device_id=${encodeURIComponent(d.id)}`, cuerpo);
    else await api('PUT', '/me/player', { device_ids: [d.id], play: true });
    return { ok: true, dispositivo: d.nombre };
  }

  async function httpApi(M, p, body = {}, q = {}) {
    const que = p[2];
    if (M === 'GET' && que === 'estado') return { configurado: !!clientId(), vinculado: !!tok?.refresco, usuario: tok?.usuario || '', redirect: redirect() };
    if (M === 'PUT' && que === 'config') {
      const id = String(body.clientId || '').trim();
      if (!/^[0-9a-f]{32}$/i.test(id)) throw err('Client ID no válido (32 caracteres hexadecimales)');
      cfg.spotify = { ...(cfg.spotify || {}), clientId: id };
      try { const fc = path.join(cfg.dir, 'config.json'), c = JSON.parse(fs.readFileSync(fc, 'utf8')); c.spotify = { ...(c.spotify || {}), clientId: id }; fs.writeFileSync(fc, JSON.stringify(c, null, 2)); } catch { }
      return { ok: true, redirect: redirect() };
    }
    if (M === 'POST' && que === 'vincular') { const u = urlLogin(); abrirNavegador(u); return { ok: true, abierto: true, redirect: redirect() }; }
    if (M === 'POST' && que === 'desvincular') { tok = null; try { fs.unlinkSync(fTok); } catch { } return { ok: true }; }
    if (M === 'GET' && que === 'playlists') {
      const j = await api('GET', '/me/playlists?limit=50');
      return (j?.items || []).filter(Boolean).map(x => ({ uri: x.uri, nombre: x.name, canciones: x.tracks?.total ?? x.items?.total ?? null, dueno: x.owner?.display_name || '', img: img(x) }));
    }
    if (M === 'GET' && que === 'guardadas') {
      const j = await api('GET', '/me/tracks?limit=40');
      return (j?.items || []).map(x => x.track).filter(Boolean).map(t => ({ uri: t.uri, nombre: t.name, artista: (t.artists || []).map(a => a.name).join(', '), img: img(t) }));
    }
    if (M === 'GET' && que === 'recientes') {
      const j = await api('GET', '/me/player/recently-played?limit=30'), vistos = new Set();
      return (j?.items || []).map(x => x.track).filter(t => t && !vistos.has(t.uri) && vistos.add(t.uri)).map(t => ({ uri: t.uri, nombre: t.name, artista: (t.artists || []).map(a => a.name).join(', '), img: img(t) }));
    }
    if (M === 'GET' && que === 'dispositivos') return dispositivos();
    if (M === 'POST' && que === 'poner') return poner(body);
    throw err('ruta', 404);
  }

  return { http: httpApi, callback, urlLogin, poner, api };
}

module.exports = { crearSpotify };
