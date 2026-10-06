// Estudio de Avatares (servidor): guarda las recetas del avatar del usuario y del "Avatar de APOLO" (skin 2D del compañero),
// el historial, y genera el "Personaje IA" con el modelo de imágenes que el usuario tenga (OpenAI images o Gemini image).
// Nada se genera sin `confirmar: true` (el panel enseña antes el coste/uso y el prompt). El render es core/ui/avatar.js (el mismo del navegador).
// Datos en <datos>/avatar/: avatar.json {usuario, apolo, usarEnIsla, enOverlay, historial[], ia[]} · ia/<id>.png · cache/*.svg
// API (vía extensiones del daemon → /v1/avatar):
//   GET    /v1/avatar                          todo (recetas, ajustes, historial, imágenes IA, motores detectados)
//   GET    /v1/avatar/svg?quien=usuario|apolo&estado=&animado=0|1   imagen SVG de la receta
//   PUT    /v1/avatar/usuario|apolo {receta}   guarda (validada)          · DELETE /v1/avatar/usuario|apolo   la quita
//   PATCH  /v1/avatar {usarEnIsla, enOverlay}
//   GET    /v1/avatar/motores                  qué generadores de imagen hay (y por qué no, si no hay)
//   POST   /v1/avatar/generar-ia {descripcion, opciones, desdeForma, motor, referencia?, confirmar}
//          sin confirmar → {presupuesto} (no llama a nadie) · con confirmar → genera 1 imagen y la guarda
//   GET    /v1/avatar/ia/:id                   PNG · DELETE /v1/avatar/ia/:id
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./ui/avatar');
const { pedir } = require('./proveedores/http');

const err = (m, status = 400) => Object.assign(new Error(m), { status });
const limpio = (t, max) => String(t ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- prompt propio del Personaje IA (inglés) ----------
// NUNCA infiere edad ni género: solo los pone si el usuario los eligió; si no, pide un personaje neutro y sin edad.
const DESC_OJOS = {
  casco: c => `two large round glowing anime-style eyes like the visor eyes of the APOLO robot helmet: deep navy at the top fading into ${c} with a hint of pink at the bottom, a dark pupil, one big soft white highlight and a tiny four-point sparkle`,
  puntos: c => `two simple solid oval dot eyes in ${c}, each with a tiny white highlight`,
  capsulas: c => `two tall rounded capsule-shaped eyes in ${c}, each with a small white highlight`,
  pixel: c => `two blocky pixel-art eyes in ${c}, made of small rounded squares`,
  felices: c => `two smiling half-moon eyes in ${c}`,
};
const DESC_FORMA = { circulo: 'round', cuadrado: 'rounded-square', pildora: 'pill', hexagono: 'honeycomb-hexagon', gota: 'droplet', nube: 'cloud', escudo: 'shield', estrella: 'soft star',
  corazon: 'heart', trebol: 'four-leaf clover', flor: 'flower', rombo: 'rounded diamond', triangulo: 'soft triangle', burbuja: 'speech-bubble', casco: 'robot-helmet', blob: 'organic blob' };
const GENEROS = { femenino: 'feminine-presenting', masculino: 'masculine-presenting', neutro: 'androgynous' };
const EDADES = { nino: 'a child', joven: 'a teenager', adulto: 'an adult', mayor: 'an older adult' };
function promptIA(opciones = {}, receta = null) {
  const o = opciones || {};
  const estilo = o.estilo === '2d'
    ? 'a clean 2D character illustration with soft cel shading, smooth confident outlines and a gentle glow'
    : 'a small 3D collectible designer-toy figure with soft matte surfaces, chunky rounded proportions, a slightly oversized head and soft studio lighting';
  const R = receta ? A.normalizar(receta) : null;
  const estiloOjos = A.OJOS.includes(o.ojos) ? o.ojos : R?.ojos || 'casco';
  const colorOjos = R?.colorOjos || '#46d7be';
  const L = [`Create one original character for APOLO, a personal AI companion app, rendered as ${estilo}.`];
  L.push(`Character: ${limpio(o.descripcion, 600) || 'a friendly, curious little companion'}.`);
  if (limpio(o.pelo, 80)) L.push(`Hair: ${limpio(o.pelo, 80)}.`);
  if (limpio(o.colores, 80)) L.push(`Main colors: ${limpio(o.colores, 80)}.`);
  if (limpio(o.ropa, 80)) L.push(`Outfit: ${limpio(o.ropa, 80)}.`);
  if (limpio(o.accesorio, 80)) L.push(`Accessory: ${limpio(o.accesorio, 80)}.`);
  if (R && o.desdeForma) L.push(`Base it on the user's avatar: a ${DESC_FORMA[R.forma] || 'round'}-shaped body in the color ${R.cuerpo}; keep that exact main color and that eye style${R.accesorio !== 'ninguno' ? `, and keep its ${({ antena: 'little antenna', auriculares: 'headphones', visor: 'see-through visor', gorra: 'cap' })[R.accesorio]}` : ''}.`);
  L.push(`Eyes: ${DESC_OJOS[estiloOjos](colorOjos)}. The eyes are the most expressive part of the character.`);
  const g = GENEROS[o.genero], e = EDADES[o.edad];
  if (g || e) L.push(`The character is ${[e, g].filter(Boolean).join(', ')}.`);
  if (!g) L.push('Keep the character gender-neutral: no specific gender.');
  if (!e) L.push('Do not give the character a specific age.');
  L.push('Centered, facing the viewer, friendly expression, full body or bust, on a plain soft single-color background. No text, no letters, no logos, no watermark. It must be an original design, not a copy of any existing character, mascot or franchise.');
  return L.join(' ');
}

function crearAvatar({ cfg, bus, fetchImpl } = {}) {
  const dir = path.join(cfg.dir, 'avatar'), dirIA = path.join(dir, 'ia'), dirCache = path.join(dir, 'cache'), f = path.join(dir, 'avatar.json');
  const vacio = () => ({ usuario: null, apolo: null, usarEnIsla: false, enOverlay: false, historial: [], ia: [] });
  function leer() {
    try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return { ...vacio(), ...d, historial: Array.isArray(d.historial) ? d.historial : [], ia: Array.isArray(d.ia) ? d.ia : [] }; }
    catch { return vacio(); }
  }
  function guardar(d) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d, null, 2)); fs.renameSync(tmp, f);
  }
  const avisar = quien => { try { bus?.emit('evento', { tipo: 'avatar', quien }); } catch { } };

  // ---------- recetas ----------
  function ponerReceta(quien, receta) {
    if (!['usuario', 'apolo'].includes(quien)) throw err('quien: usuario | apolo');
    const d = leer();
    if (receta === null) { d[quien] = null; guardar(d); avisar(quien); return null; }
    const v = A.validar(receta);
    if (!v.ok) throw err('receta no válida: ' + v.errores.join('; '));
    if (v.receta.tipo === 'ia' && !d.ia.some(x => x.id === v.receta.ia.id)) throw err('esa imagen IA no existe');
    d[quien] = v.receta;
    const firma = JSON.stringify(v.receta);
    d.historial = [{ t: Date.now(), quien, receta: v.receta }, ...d.historial.filter(h => JSON.stringify(h.receta) !== firma)].slice(0, 30);
    guardar(d); avisar(quien);
    return v.receta;
  }
  function ajustes(b = {}) {
    const d = leer();
    if (typeof b.usarEnIsla === 'boolean') d.usarEnIsla = b.usarEnIsla;
    if (typeof b.enOverlay === 'boolean') d.enOverlay = b.enOverlay;
    guardar(d); avisar('ajustes');
    return { usarEnIsla: d.usarEnIsla, enOverlay: d.enOverlay };
  }
  const recetaDe = quien => { const d = leer(); return d[quien] || (quien === 'apolo' ? A.PRESETS[0] : null); };
  // data: URI de la imagen IA (para el Wrapped/overlay, que no pueden mandar el token); null si es grande o no existe
  function imagenIA(id, max = 3e6) {
    if (!/^[a-z0-9-]{6,48}$/.test(String(id || ''))) return null;
    const p = path.join(dirIA, id + '.png');
    try { const b = fs.readFileSync(p); return b.length <= max ? 'data:image/png;base64,' + b.toString('base64') : null; } catch { return null; }
  }
  function svgDe(quien, { estado, animado = false } = {}) {
    const r = recetaDe(quien); if (!r) return null;
    return A.svg(r, { estado, animado, imagen: r.tipo === 'ia' ? imagenIA(r.ia.id) : undefined });
  }
  // Un solo avatar para todo (isla, panel, overlay), pero SOLO si el usuario activa "Usar avatar en lugar del casco":
  // el casco 3D es la cara de APOLO por defecto. Activado → el avatar de APOLO; si no hay, el tuyo; si no, el preset.
  const caraCompanero = d => d.usarEnIsla ? (d.apolo || d.usuario || A.PRESETS[0]) : null;
  const conImagen = r => ({ receta: r, imagen: r?.tipo === 'ia' ? imagenIA(r.ia.id) : null });
  const paraIsla = () => { const r = caraCompanero(leer()); return r ? { usar: true, ...conImagen(r) } : { usar: false, receta: A.PRESETS[0], imagen: null }; };
  const paraOverlay = () => { const d = leer(), r = caraCompanero(d); return d.enOverlay && r ? conImagen(r) : null; };

  // ---------- Personaje IA ----------
  function motores() {
    const p = cfg.proveedores || {}, a = cfg.avatar || {};
    return [
      { id: 'openai', nombre: 'OpenAI Images', listo: !!p.openai?.apiKey, modelo: a.modeloOpenAI || 'gpt-image-1',
        coste: { imagenes: 1, aprox: '≈ 0,04 US$', nota: 'precio aproximado de la API de OpenAI (1024×1024, calidad media); se cobra en tu cuenta de OpenAI, no en tu plan de Claude' },
        falta: p.openai?.apiKey ? '' : 'falta la API key de OpenAI (Configuración → Claves de API)' },
      { id: 'gemini', nombre: 'Gemini (imagen)', listo: !!p.gemini?.apiKey, modelo: a.modeloGemini || 'gemini-2.5-flash-image',
        coste: { imagenes: 1, aprox: '≈ 0,04 US$', nota: 'precio aproximado de la API de Gemini por imagen; si tu clave es del nivel gratuito puede no costar nada (o no permitir imágenes)' },
        falta: p.gemini?.apiKey ? '' : 'falta la API key de Gemini (Configuración → Claves de API)' },
    ];
  }
  async function llamarOpenAI(m, prompt, signal) {
    const p = cfg.proveedores.openai, base = String(p.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const body = { model: m.modelo, prompt, n: 1, size: '1024x1024' };
    if (/^dall-e/i.test(m.modelo)) { body.response_format = 'b64_json'; body.quality = 'standard'; } else body.quality = cfg.avatar?.calidad || 'medium';
    const j = await pedir(`${base}/images/generations`, { headers: { authorization: `Bearer ${p.apiKey}` }, body, signal, timeout: 180_000 });
    const d = j?.data?.[0];
    if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
    if (d?.url) { const r = await (fetchImpl || fetch)(d.url, { signal }); if (!r.ok) throw err(`no pude descargar la imagen (${r.status})`, 502); return Buffer.from(await r.arrayBuffer()); }
    throw err('OpenAI no devolvió ninguna imagen', 502);
  }
  async function llamarGemini(m, prompt, referencia, signal) {
    const p = cfg.proveedores.gemini, base = String(p.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const parts = [{ text: prompt }];
    if (referencia) parts.push({ inlineData: { mimeType: 'image/png', data: referencia } });
    const j = await pedir(`${base}/models/${encodeURIComponent(m.modelo)}:generateContent`, {
      headers: { 'x-goog-api-key': p.apiKey }, signal, timeout: 180_000,
      body: { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } },
    });
    for (const c of j?.candidates || []) for (const x of c?.content?.parts || []) if (x.inlineData?.data) return Buffer.from(x.inlineData.data, 'base64');
    const motivo = j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason;
    throw err(`Gemini no devolvió ninguna imagen${motivo ? ` (${motivo})` : ''}`, 502);
  }
  let enCurso = false;
  async function generarIA(b = {}, { signal } = {}) {
    const lista = motores(), listos = lista.filter(m => m.listo);
    if (!listos.length) throw err('No hay ningún generador de imágenes configurado. Añade una API key de OpenAI o de Gemini en Configuración → Claves de API (el modo Forma funciona sin nada).', 409);
    const m = b.motor ? lista.find(x => x.id === b.motor) : listos[0];
    if (!m) throw err('motor: openai | gemini');
    if (!m.listo) throw err(m.falta, 409);
    const opciones = { ...(b.opciones || {}), descripcion: b.descripcion ?? b.opciones?.descripcion, desdeForma: !!b.desdeForma };
    for (const k of ['pelo', 'colores', 'ropa', 'accesorio']) if (opciones[k] !== undefined && typeof opciones[k] !== 'string') throw err(`${k}: texto`);
    if (opciones.genero && !GENEROS[opciones.genero]) throw err('genero: femenino | masculino | neutro (o vacío)');
    if (opciones.edad && !EDADES[opciones.edad]) throw err('edad: nino | joven | adulto | mayor (o vacío)');
    const base = b.desdeForma ? (b.receta ? A.validar(b.receta).receta : recetaDe('usuario')) : null;
    const prompt = promptIA(opciones, base);
    const referencia = m.id === 'gemini' && b.desdeForma && typeof b.referencia === 'string' && /^[A-Za-z0-9+/=]{100,900000}$/.test(b.referencia) ? b.referencia : null;
    const presupuesto = { motor: m.id, nombre: m.nombre, modelo: m.modelo, imagenes: 1, coste: m.coste, prompt, conReferencia: !!referencia };
    if (b.confirmar !== true) return { presupuesto };               // nada se genera sin pulsar
    if (enCurso) throw err('ya hay una imagen generándose', 409);
    enCurso = true;
    try {
      const png = m.id === 'openai' ? await llamarOpenAI(m, prompt, signal) : await llamarGemini(m, prompt, referencia, signal);
      if (png.length < 64) throw err('la imagen recibida está vacía', 502);
      const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
      fs.mkdirSync(dirIA, { recursive: true });
      fs.writeFileSync(path.join(dirIA, id + '.png'), png);
      const d = leer();
      const item = { id, t: Date.now(), motor: m.id, modelo: m.modelo, prompt, descripcion: limpio(opciones.descripcion, 200), bytes: png.length };
      d.ia = [item, ...d.ia];
      for (const viejo of d.ia.slice(40)) fs.rm(path.join(dirIA, viejo.id + '.png'), { force: true }, () => { });
      d.ia = d.ia.slice(0, 40);
      guardar(d);
      return { imagen: item, presupuesto };
    } finally { enCurso = false; }
  }
  function borrarIA(id) {
    if (!/^[a-z0-9-]{6,48}$/.test(String(id))) throw err('id');
    const d = leer();
    if (!d.ia.some(x => x.id === id)) throw err('no existe', 404);
    d.ia = d.ia.filter(x => x.id !== id);
    for (const q of ['usuario', 'apolo']) if (d[q]?.tipo === 'ia' && d[q].ia.id === id) d[q] = { ...d[q], tipo: 'forma', ia: undefined };
    guardar(d); fs.rm(path.join(dirIA, id + '.png'), { force: true }, () => { }); avisar('ia');
    return { ok: true };
  }

  // ---------- API ----------
  async function http(M, p, b = {}, q = {}) {
    const sub = p[2];
    if (!sub && M === 'GET') { const d = leer(); return { usuario: d.usuario, apolo: d.apolo, usarEnIsla: d.usarEnIsla, enOverlay: d.enOverlay, historial: d.historial.slice(0, 20), ia: d.ia, motores: motores() }; }
    if (!sub && M === 'PATCH') return ajustes(b);
    if (sub === 'svg' && !p[3] && M === 'GET') {
      const quien = q.quien === 'apolo' ? 'apolo' : 'usuario', estado = A.ESTADOS.includes(q.estado) ? q.estado : 'reposo';
      const s = svgDe(quien, { estado, animado: q.animado === '1' });
      if (!s) throw err('sin avatar', 404);
      fs.mkdirSync(dirCache, { recursive: true });
      const arch = path.join(dirCache, `${quien}-${estado}-${A.hash(s).toString(36)}.svg`);
      if (!fs.existsSync(arch)) {
        try { for (const x of fs.readdirSync(dirCache)) if (x.startsWith(`${quien}-${estado}-`)) fs.rmSync(path.join(dirCache, x), { force: true }); } catch { }
        fs.writeFileSync(arch, s);
      }
      return { __archivo: arch };
    }
    if ((sub === 'usuario' || sub === 'apolo') && !p[3]) {
      if (M === 'PUT') return { receta: ponerReceta(sub, b && b.receta !== undefined ? b.receta : b) };
      if (M === 'DELETE') { ponerReceta(sub, null); return { ok: true }; }
      if (M === 'GET') return { receta: recetaDe(sub) };
    }
    if (sub === 'motores' && M === 'GET') return { motores: motores() };
    if (sub === 'generar-ia' && M === 'POST') return generarIA(b);
    if (sub === 'ia' && p[3] && !p[4]) {
      const id = p[3];
      if (M === 'DELETE') return borrarIA(id);
      if (M === 'GET') {
        if (!/^[a-z0-9-]{6,48}$/.test(id)) throw err('id');
        const arch = path.join(dirIA, id + '.png'); if (!fs.existsSync(arch)) throw err('no existe', 404);
        return { __archivo: arch };
      }
    }
    throw err('ruta', 404);
  }

  return { leer, ponerReceta, ajustes, recetaDe, svgDe, imagenIA, paraIsla, paraOverlay, motores, generarIA, borrarIA, http, dir };
}

module.exports = { crearAvatar, promptIA };
