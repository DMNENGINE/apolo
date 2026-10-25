// Medios (vídeos de YouTube y Rumble para la Rabbit R1): buscar y reproducir sin cuenta ni anuncios.
// El trabajo de verdad lo hace yt-dlp desde medios.py (Python del PC; pip install "yt-dlp[default]" curl_cffi).
// API (extensión del daemon, con token):
//   GET  /v1/medios/buscar?fuente=youtube|rumble&q=  → {resultados: [{id, titulo, canal, duracion, mini, url, fecha}]}
//   POST /v1/medios/stream {url}                     → {tipo: mp4|hls, ver | url, titulo, canal, duracion, cabeceras}
//   GET  /v1/medios/mini?u=<miniatura>               → la imagen (caché en <dir>/medios-mini; solo hosts de YouTube y Rumble)
//   GET  /v1/medios/historial                        → lo último que se vio
//   GET  /v1/medios/ver/<clave>                      → el vídeo de YouTube pasado por el PC (daemon.js → proxy)
// Por qué el PC hace de paso para YouTube: el enlace de googlevideo va atado a la IP de quien lo pidió (la IPv6 del PC;
// la R1 tiene otra) y daría 403. Rumble (HLS) no lo ata: la R1 lo abre directo.
// Herramienta del agente: r1_video {q, fuente?} → busca y lo pone en la pantalla de la R1 (mensaje 'video' del nodo).
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, 'medios.py');
const HOSTS_MINI = /^(i\d?\.ytimg\.com|[\w-]+\.ytimg\.com|[\w.-]+\.rumble\.cloud|[\w.-]+\.rumble\.com)$/i;
const VIDA_STREAM = 5 * 3600_000;            // los enlaces de googlevideo caducan a las ~6 h

function crearMedios({ nucleo }) {
  const { cfg } = nucleo;
  const opc = () => ({ python: 'python', ...(cfg.medios || {}) });
  const reg = (nivel, titulo, detalle = '') => { try { nucleo.registro?.add(nivel, titulo, detalle); } catch { } };
  const fHist = path.join(cfg.dir, 'medios-historial.json');
  const dirMini = path.join(cfg.dir, 'medios-mini');
  const busquedas = new Map();                 // fuente|q → {t, r}
  const streams = new Map();                   // clave → {url, cabeceras, creado}

  function py(args, ms = 60_000) {
    return new Promise((ok, mal) => {
      const p = spawn(opc().python, [SCRIPT, ...args], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let out = '', err = '';
      const t = setTimeout(() => { p.kill(); mal(new Error('yt-dlp tardó demasiado')); }, ms);
      p.stdout.on('data', d => { out += d; });
      p.stderr.on('data', d => { err += d; });
      p.on('error', e => { clearTimeout(t); mal(new Error(`no pude lanzar Python (${e.message}); instala Python y "pip install yt-dlp[default] curl_cffi"`)); });
      p.on('close', () => {
        clearTimeout(t);
        let j; try { j = JSON.parse(out); } catch { return mal(new Error((err || out || 'sin respuesta de medios.py').trim().split('\n').pop().slice(0, 200))); }
        if (j && j.error) return mal(new Error(j.error));
        ok(j);
      });
    });
  }

  async function buscar(fuente, q) {
    fuente = fuente === 'rumble' ? 'rumble' : 'youtube';
    q = String(q || '').trim().slice(0, 200);
    if (!q) throw Object.assign(new Error('falta q'), { status: 400 });
    const k = `${fuente}|${q.toLowerCase()}`, c = busquedas.get(k);
    if (c && Date.now() - c.t < 10 * 60_000) return c.r;
    const r = await py(['buscar', fuente, q]);
    busquedas.set(k, { t: Date.now(), r });
    if (busquedas.size > 50) busquedas.delete(busquedas.keys().next().value);
    return r;
  }

  function historial() { try { return JSON.parse(fs.readFileSync(fHist, 'utf8')); } catch { return []; } }
  function anotar(item) {
    const L = [item, ...historial().filter(x => x.url !== item.url)].slice(0, 50);
    try { fs.writeFileSync(fHist, JSON.stringify(L, null, 1)); } catch { }
  }

  async function stream(url, extra = {}) {
    if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|rumble\.com)\//.test(String(url || ''))) throw Object.assign(new Error('solo enlaces de YouTube o Rumble'), { status: 400 });
    const i = await py(['stream', url]);
    anotar({ fuente: /rumble\.com/.test(url) ? 'rumble' : 'youtube', url, titulo: i.titulo || extra.titulo || '', canal: i.canal || extra.canal || '',
      duracion: i.duracion || extra.duracion || '', mini: extra.mini || i.mini || '', t: Date.now() });
    reg('info', 'vídeo en la R1', `${i.titulo || url}`);
    const base = { tipo: i.tipo, titulo: i.titulo, canal: i.canal, duracion: i.duracion };
    if (i.tipo === 'hls') return { ...base, url: i.url, cabeceras: i.cabeceras || {} };
    const clave = crypto.randomBytes(12).toString('hex');
    for (const [k, s] of streams) if (Date.now() - s.creado > VIDA_STREAM) streams.delete(k);
    while (streams.size >= 20) streams.delete(streams.keys().next().value);
    streams.set(clave, { url: i.url, cabeceras: i.cabeceras || {}, creado: Date.now() });
    return { ...base, ver: `/v1/medios/ver/${clave}` };
  }

  // el vídeo pasado por el PC, con Range (el reproductor de Android pide trozos al adelantar)
  function proxy(req, res, clave) {
    const s = streams.get(String(clave || ''));
    if (!s) { res.writeHead(404); return res.end(); }
    const pedir = (u, saltos) => {
      const h = { ...s.cabeceras, ...(req.headers.range ? { range: req.headers.range } : {}) };
      const up = (u.startsWith('https:') ? https : http).get(u, { headers: h }, r => {
        if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && saltos < 4) { r.resume(); return pedir(new URL(r.headers.location, u).href, saltos + 1); }
        const fuera = {};
        for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) if (r.headers[k]) fuera[k] = r.headers[k];
        res.writeHead(r.statusCode, { ...fuera, 'cache-control': 'no-store' });
        r.pipe(res);
      });
      up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on('close', () => up.destroy());
    };
    pedir(s.url, 0);
  }

  // miniaturas: se guardan en disco y se sirven como archivo (la R1 las pide con su token y las enseña como blob)
  function mini(u) {
    let url; try { url = new URL(String(u || '')); } catch { throw Object.assign(new Error('u'), { status: 400 }); }
    if (url.protocol !== 'https:' || !HOSTS_MINI.test(url.hostname)) throw Object.assign(new Error('host no permitido'), { status: 400 });
    fs.mkdirSync(dirMini, { recursive: true });
    const f = path.join(dirMini, crypto.createHash('sha1').update(url.href).digest('hex').slice(0, 20) + '.jpg');
    if (fs.existsSync(f)) return Promise.resolve({ __archivo: f });
    return new Promise((ok, mal) => {
      const r0 = https.get(url.href, { headers: { 'user-agent': 'Mozilla/5.0' } }, r => {
        if (r.statusCode !== 200) { r.resume(); return mal(Object.assign(new Error(`miniatura: ${r.statusCode}`), { status: 502 })); }
        const partes = []; let n = 0;
        r.on('data', d => { n += d.length; if (n > 2e6) r.destroy(); else partes.push(d); });
        r.on('end', () => {
          fs.writeFileSync(f, Buffer.concat(partes));
          try { const L = fs.readdirSync(dirMini); if (L.length > 600) for (const x of L.slice(0, 200)) fs.unlinkSync(path.join(dirMini, x)); } catch { }
          ok({ __archivo: f });
        });
      });
      r0.on('error', e => mal(Object.assign(e, { status: 502 })));
      r0.setTimeout(15_000, () => r0.destroy(new Error('miniatura: tiempo agotado')));
    });
  }

  async function httpApi(M, p, body, q = {}) {
    if (M === 'GET' && p[2] === 'buscar') return { resultados: await buscar(q.fuente, q.q) };
    if (M === 'POST' && p[2] === 'stream') return stream(body.url, body);
    if (M === 'GET' && p[2] === 'mini') return mini(q.u);
    if (M === 'GET' && p[2] === 'historial') return historial();
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  // herramienta: "ponme en la R1 un vídeo de …"
  const r1 = () => (nucleo.nodos?.lista?.() || []).filter(n => n.modelo === 'rabbit-r1' && n.conectado);
  nucleo.registrarHerramientas?.([{
    nombre: 'r1_video', riesgo: 'lectura',
    descripcion: 'Busca un vídeo en YouTube o Rumble y lo pone a reproducir en la pantalla de la Rabbit R1 (sin anuncios). '
      + 'Úsala cuando el usuario pida ver o poner un vídeo en la R1 ("ponme en la R1 el último vídeo de X", "pon en Rumble…"). '
      + 'q: lo que hay que buscar; fuente: youtube (por defecto) o rumble; url: si ya tienes el enlace exacto.',
    parametros: { type: 'object', properties: { q: { type: 'string' }, fuente: { type: 'string', enum: ['youtube', 'rumble'] }, url: { type: 'string' } } },
    resumen: a => `vídeo en la R1: ${a.url || a.q || ''}`,
    disponible: () => r1().length > 0,
    ejecutar: async a => {
      const L = r1(); if (!L.length) return 'La Rabbit R1 no está conectada ahora mismo.';
      let elegido = a.url ? { url: a.url, titulo: '' } : (await buscar(a.fuente, a.q))[0];
      if (!elegido) return `No encontré nada para "${a.q}" en ${a.fuente || 'youtube'}.`;
      const s = await stream(elegido.url, elegido);
      for (const n of L) nucleo.nodos.enviar(n.id, { tipo: 'video', ...s });
      return `Reproduciendo en la R1: "${s.titulo || elegido.titulo}"${s.canal ? ` (${s.canal})` : ''}${s.duracion ? `, ${s.duracion}` : ''}.`;
    },
  }]);

  nucleo.registrarHerramientas?.([{
    nombre: 'r1_musica', riesgo: 'lectura',
    descripcion: 'Música en la Rabbit R1 con su Spotify (Premium): q = lo que hay que poner ("pon Bad Bunny", "música para concentrarme"), '
      + 'o accion = alternar | pausa | play | siguiente | anterior, o uri = spotify:playlist:… (de una playlist del usuario). Suena por el altavoz de la R1.',
    parametros: { type: 'object', properties: { q: { type: 'string' }, accion: { type: 'string', enum: ['alternar', 'pausa', 'play', 'siguiente', 'anterior'] }, uri: { type: 'string' } } },
    resumen: a => `música en la R1: ${a.q || a.accion || a.uri || ''}`,
    disponible: () => r1().length > 0,
    ejecutar: async a => {
      const L = r1(); if (!L.length) return 'La Rabbit R1 no está conectada ahora mismo.';
      if (!a.q && !a.accion && !a.uri) return 'Dime qué poner (q), una acción o una uri de Spotify.';
      if (a.uri && nucleo.spotify) {                 // con la Web API vinculada: directo a la R1 por Spotify Connect
        const r = await nucleo.spotify.poner({ uri: a.uri }).catch(() => null);
        if (r?.ok) return `Sonando en ${r.dispositivo}.`;
      }
      for (const n of L) nucleo.nodos.enviar(n.id, { tipo: 'musica', ...(a.q ? { q: String(a.q).slice(0, 200) } : a.uri ? { uri: a.uri } : { accion: a.accion }) });
      return a.q ? `Pidiendo a Spotify de la R1: "${a.q}".` : a.uri ? 'Abriendo en el Spotify de la R1.' : `Hecho (${a.accion}).`;
    },
  }]);

  return { http: httpApi, proxy, buscar, stream, historial };
}

module.exports = { crearMedios };
