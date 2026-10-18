// Cómo le va a cada clip publicado: una vez al día lee lo último del canal en YouTube (API si está conectado, si no yt-dlp)
// y en TikTok (yt-dlp, perfil público), empareja cada publicación con su clip (por id si lo subió APOLO, por enlace puesto
// a mano en Revisión, o por fecha + duración + título con el modelo) y saca lo aprendido: qué estilos, diseños, tipos de
// momento, duraciones y horas rinden más que la media del canal. Eso vuelve como pistas al elegir estilo, título y hora.
'use strict';
const { execFile } = require('child_process');

const DIA = 864e5;
const norm = s => String(s || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/#\S+/g, '').replace(/[^\p{L}\d ]/gu, ' ').split(/\s+/).filter(w => w.length > 2);
const parecido = (a, b) => { const A = new Set(norm(a)), B = new Set(norm(b)); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); };
const mediana = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

// duración final del clip (la del 4K o la revisada; si no, la del tramo)
const durClip = c => c.k4?.medidas?.duracion || c.calidad?.medidas?.duracion || (c.fin - c.inicio);

// empareja publicaciones con clips (puro, salvo la ayuda opcional del modelo). Reglas: el vídeo se publicó después de aprobar
// el clip (−2 h) y antes de 30 días; cada vídeo va con un clip como mucho. Primero ids conocidos, luego los casi seguros
// (misma duración ±1,5 s y título parecido, o duración exacta y único candidato)
function emparejar(clips, videos) {
  const usados = new Set(), out = {};
  const clave = v => `${v.plataforma}:${v.id}`;
  for (const c of clips) for (const v of videos) {
    const conocido = (v.plataforma === 'youtube' && c.youtube?.id === v.id) || c.vinculos?.[v.plataforma] === v.id;
    if (conocido && !usados.has(clave(v))) { (out[c.id] = out[c.id] || {})[v.plataforma] = { ...v, como: 'id' }; usados.add(clave(v)); }
  }
  const candidatos = [];
  for (const c of clips) {
    const desde = (c.decidido || c.editado || 0) - 2 * 3600e3, d = durClip(c);
    for (const v of videos) {
      if (usados.has(clave(v)) || out[c.id]?.[v.plataforma] || !v.fecha || v.fecha < desde || v.fecha > desde + 30 * DIA) continue;
      const dd = Math.abs((v.duracion || 0) - d);
      const t = Math.max(parecido(v.titulo, c.gancho), parecido(v.titulo, c.textos?.es?.titulo), parecido(v.titulo, c.textos?.en?.titulo));
      if (dd <= 1.5 && t >= 0.5) candidatos.push({ c, v, p: 2 + t - dd / 10 });
      else if (dd <= 1.5) candidatos.push({ c, v, p: 1 - dd / 10, soloDuracion: true });
    }
  }
  candidatos.sort((a, b) => b.p - a.p);
  for (const x of candidatos) {
    if (usados.has(clave(x.v)) || out[x.c.id]?.[x.v.plataforma]) continue;
    // solo por duración: vale si ningún otro clip tiene esa misma duración (si no, se deja para el modelo)
    if (x.soloDuracion && candidatos.some(y => y !== x && y.v === x.v && y.c !== x.c && !out[y.c.id]?.[x.v.plataforma])) continue;
    (out[x.c.id] = out[x.c.id] || {})[x.v.plataforma] = { ...x.v, como: x.soloDuracion ? 'duracion' : 'titulo' };
    usados.add(clave(x.v));
  }
  return { pares: out, libres: videos.filter(v => !usados.has(clave(v))) };
}

// lo aprendido (puro): rendimiento de un clip = media de log2(vistas / mediana del canal en esa plataforma), +retención si la
// hay. Por factor, la media "encogida" hacia 0 (con pocos clips no se saca ninguna conclusión fuerte)
function aprender(clips, canal = {}, { zona } = {}) {
  const horaEn = t => +new Intl.DateTimeFormat('en-US', { timeZone: zona || undefined, hourCycle: 'h23', hour: '2-digit' }).format(new Date(t)) % 24;
  const base = {}, filas = [];
  for (const p of ['youtube', 'tiktok']) base[p] = mediana((canal[p] || []).map(v => v.vistas).filter(x => x > 0)) || null;
  const retBase = mediana(clips.map(c => c.metricas?.youtube?.retencion).filter(x => x > 0)) || null;
  for (const c of clips) {
    const m = c.metricas || {}, partes = [];
    for (const p of ['youtube', 'tiktok']) if (m[p]?.vistas > 0 && base[p]) partes.push(Math.log2(m[p].vistas / base[p]));
    if (!partes.length) continue;
    let r = partes.reduce((a, b) => a + b, 0) / partes.length;
    if (retBase && m.youtube?.retencion > 0) r += 0.5 * Math.log2(m.youtube.retencion / retBase);
    const fecha = m.youtube?.fecha || m.tiktok?.fecha;
    filas.push({ c, r, vistas: (m.youtube?.vistas || 0) + (m.tiktok?.vistas || 0), hora: fecha ? horaEn(fecha) : null });
  }
  const grupo = f => {
    const g = {};
    for (const x of filas) for (const k of [].concat(f(x) ?? [])) { (g[k] = g[k] || []).push(x.r); }
    return Object.fromEntries(Object.entries(g).map(([k, rs]) => { const m = rs.reduce((a, b) => a + b, 0) / (rs.length + 2); return [k, { n: rs.length, factor: +(2 ** m).toFixed(2) }]; })
      .sort((a, b) => b[1].factor - a[1].factor));
  };
  const tramo = d => (d < 60 ? '<60 s' : d < 90 ? '60–90 s' : d < 120 ? '90–120 s' : '120 s+');
  const orden = [...filas].sort((a, b) => b.r - a.r);
  return {
    muestras: filas.length, base, actualizado: Date.now(),
    estilos: grupo(x => x.c.estilo), disenos: grupo(x => { const t = [...new Set((x.c.disenos || []).map(d => d.tipo))]; return t.length ? t : ['ninguno']; }),
    momentos: grupo(x => x.c.momento?.tipo), duraciones: grupo(x => tramo(durClip(x.c))), horas: grupo(x => (x.hora == null ? null : String(x.hora).padStart(2, '0') + ':00')),
    mejores: orden.slice(0, 5).map(x => ({ id: x.c.id, gancho: x.c.gancho, titulo: x.c.textos?.es?.titulo, vistas: x.vistas, factor: +(2 ** x.r).toFixed(2) })),
    peores: orden.slice(-3).reverse().filter(x => x.r < 0).map(x => ({ id: x.c.id, gancho: x.c.gancho, vistas: x.vistas, factor: +(2 ** x.r).toFixed(2) })),
  };
}

// pistas en texto para los prompts (vacío hasta que haya al menos `min` clips medidos)
function pistas(ap, { min = 5 } = {}) {
  if (!ap || ap.muestras < min) return { estilo: '', titulo: '', director: '' };
  const lista = (g, n = 4) => Object.entries(g || {}).filter(([, v]) => v.n >= 2).slice(0, n).map(([k, v]) => `${k} ×${v.factor} (${v.n} clips)`).join(', ');
  const flojos = g => Object.entries(g || {}).filter(([, v]) => v.n >= 2 && v.factor < 0.85).map(([k, v]) => `${k} ×${v.factor}`).join(', ');
  const est = lista(ap.estilos), fl = flojos(ap.estilos), mom = lista(ap.momentos, 3), dis = lista(ap.disenos, 3), dur = lista(ap.duraciones, 2);
  return {
    estilo: [est && `Estilos que mejor rinden en este canal (vistas frente a la media): ${est}.`, fl && `Rinden menos: ${fl}.`, mom && `Tipos de momento que mejor funcionan: ${mom}.`].filter(Boolean).join(' '),
    titulo: ap.mejores?.length ? `Títulos de los clips que más vistas tuvieron: ${ap.mejores.map(x => `"${x.titulo || x.gancho}" (${x.vistas} vistas)`).join('; ')}.` : '',
    director: [dis && `Diseños que mejor rinden: ${dis}.`, dur && `Duraciones que mejor rinden: ${dur}.`].filter(Boolean).join(' '),
  };
}

// horas de publicación aprendidas: las 3 mejores con al menos 2 clips y factor ≥ 1 (si no hay, las del kit)
function mejoresHoras(ap, delKit) {
  const hs = Object.entries(ap?.horas || {}).filter(([, v]) => v.n >= 2 && v.factor >= 1).slice(0, 3).map(([h]) => h);
  return hs.length >= 2 ? hs : delKit;
}

function crearMetricas({ python = 'python', ejecutar = execFile, youtube = null, generarJSON = null, modelo = null, log = () => { } } = {}) {
  const sh = (args, timeout = 240_000) => new Promise((ok, mal) => ejecutar(python, ['-m', 'yt_dlp', '--no-warnings', ...args], { windowsHide: true, timeout, maxBuffer: 64 << 20, encoding: 'utf8' },
    (e, out, err) => (e ? mal(new Error(String(err || e.message).trim().split('\n').slice(-2).join(' ').slice(0, 300))) : ok(String(out || '')))));
  const reintentar = async (fn, n = 3) => { let ultimo; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { ultimo = e; await new Promise(ok => setTimeout(ok, 5000 * (i + 1))); } } throw ultimo; };
  const handle = h => String(h || '').replace(/^@?/, '@');

  async function deYouTube(cuenta, n = 30) {
    if (youtube?.conectado()) {
      const vs = await youtube.recientes(n);
      try { const ret = await youtube.retencion(vs.map(v => v.id)); for (const v of vs) Object.assign(v, ret[v.id] || {}); } catch (e) { log('[metricas] retención', e.message); }
      return vs;
    }
    if (!cuenta) return [];
    const lista = JSON.parse(await reintentar(() => sh(['--flat-playlist', '-J', '--playlist-end', String(n), `https://www.youtube.com/${handle(cuenta)}/shorts`])));
    const out = [];
    for (const e of (lista.entries || []).slice(0, n)) {
      try {
        const j = JSON.parse(await sh(['-j', '--skip-download', `https://www.youtube.com/shorts/${e.id}`], 90_000));
        out.push({ plataforma: 'youtube', id: e.id, url: `https://www.youtube.com/shorts/${e.id}`, titulo: j.title || e.title || '', fecha: j.timestamp ? j.timestamp * 1000 : null,
          duracion: j.duration || 0, vistas: j.view_count || e.view_count || 0, likes: j.like_count || 0, comentarios: j.comment_count || 0 });
      } catch (err) { log('[metricas] yt', e.id, err.message); }
    }
    return out;
  }
  async function deTikTok(cuenta, n = 40) {
    if (!cuenta) return [];
    // sin --impersonate (curl_cffi) TikTok a veces contesta una página vacía ("Failed to parse JSON")
    const lista = JSON.parse(await reintentar(() => sh(['--impersonate', 'chrome', '--flat-playlist', '-J', '--playlist-end', String(n), `https://www.tiktok.com/${handle(cuenta)}`])));
    return (lista.entries || []).map(e => ({ plataforma: 'tiktok', id: String(e.id), url: e.url || `https://www.tiktok.com/${handle(cuenta)}/video/${e.id}`, titulo: e.title || e.description || '',
      fecha: e.timestamp ? e.timestamp * 1000 : null, duracion: e.duration || 0, vistas: e.view_count || 0, likes: e.like_count || 0, comentarios: e.comment_count || 0, compartidos: e.repost_count || 0 }));
  }

  // lo que la regla no pudo decidir (p. ej. el streamer lo recortó y le puso otro título, en inglés), con el modelo
  async function emparejarConModelo(clips, libres, pares) {
    if (!generarJSON) return 0;
    const sin = clips.filter(c => !pares[c.id]?.youtube || !pares[c.id]?.tiktok);
    const cand = libres.filter(v => v.fecha && sin.some(c => v.fecha >= (c.decidido || 0) - 2 * 3600e3 && v.fecha <= (c.decidido || 0) + 30 * DIA));
    if (!sin.length || !cand.length) return 0;
    const r = await generarJSON({ modelo: modelo?.(), system: 'Emparejas clips editados con las publicaciones de redes que salieron de ellos. Solo emparejas si es claramente el mismo clip.',
      prompt: `Clips (id · título en pantalla · de qué va · duración · aprobado):\n${sin.map(c => `- ${c.id} · "${c.gancho || ''}" · ${(c.textos?.en?.titulo || '')} · ${Math.round(durClip(c))} s · ${new Date(c.decidido || 0).toISOString().slice(0, 16)}`).join('\n')}\n\n`
        + `Publicaciones (plataforma:id · título · duración · fecha):\n${cand.map(v => `- ${v.plataforma}:${v.id} · "${v.titulo.slice(0, 90)}" · ${v.duracion} s · ${new Date(v.fecha).toISOString().slice(0, 16)}`).join('\n')}\n\n`
        + 'El streamer puede recortar el clip (dura menos, nunca más) y cambiarle el título (a veces en inglés). Cada publicación va con un clip como mucho; una por plataforma y clip. Devuelve solo los pares de los que estés seguro (confianza 0–1).',
      schema: { type: 'object', properties: { pares: { type: 'array', items: { type: 'object', properties: { clip: { type: 'string' }, publicacion: { type: 'string' }, confianza: { type: 'number' } }, required: ['clip', 'publicacion', 'confianza'] } } }, required: ['pares'] } });
    let n = 0;
    for (const p of (r?.datos || r || {}).pares || []) {
      const c = sin.find(x => x.id === p.clip), v = cand.find(x => `${x.plataforma}:${x.id}` === p.publicacion);
      if (!c || !v || p.confianza < 0.75 || pares[c.id]?.[v.plataforma] || v.duracion > durClip(c) + 2) continue;
      if (Object.values(pares).some(o => o[v.plataforma]?.id === v.id)) continue;
      (pares[c.id] = pares[c.id] || {})[v.plataforma] = { ...v, como: 'modelo' }; n++;
    }
    return n;
  }

  // una pasada: devuelve { canal: {youtube:[...], tiktok:[...]}, pares, errores }
  async function medir(clips, cuentas = {}) {
    const canal = {}, errores = [];
    for (const [p, fn] of [['youtube', deYouTube], ['tiktok', deTikTok]]) {
      try { canal[p] = await fn(cuentas[p]); } catch (e) { canal[p] = []; errores.push(`${p}: ${e.message}`); log('[metricas]', p, e.message); }
    }
    const todos = [...canal.youtube, ...canal.tiktok];
    const { pares, libres } = emparejar(clips, todos);
    try { await emparejarConModelo(clips, libres, pares); } catch (e) { errores.push(`emparejar: ${e.message}`); }
    return { canal, pares, errores };
  }

  return { medir, deYouTube, deTikTok };
}

module.exports = { crearMetricas, emparejar, aprender, pistas, mejoresHoras, parecido, durClip };
