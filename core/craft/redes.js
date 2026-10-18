// Lo que acompaña a un clip aprobado en redes: título y descripción en español e inglés (con el modelo del cerebro y las
// pistas de lo que mejor ha funcionado en el canal), los subtítulos traducidos al inglés (.srt) y la hora a la que se
// programa en YouTube (las horas del kit, sin pasarse de N por día). Todo puro salvo las llamadas al modelo.
'use strict';

// ── .srt ──
const aSeg = t => { const [h, m, s] = t.replace(',', '.').split(':'); return +h * 3600 + +m * 60 + +s; };
const aTiempo = s => { const ms = Math.round(s * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
function leerSrt(texto) {
  return String(texto || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => {
    const l = b.trim().split('\n'), i = l.findIndex(x => x.includes('-->'));
    if (i < 0) return null;
    const [a, z] = l[i].split('-->').map(x => x.trim());
    return { s: aSeg(a), e: aSeg(z), texto: l.slice(i + 1).join(' ').trim() };
  }).filter(x => x && x.texto);
}
const escribirSrt = cues => cues.map((c, i) => `${i + 1}\n${aTiempo(c.s)} --> ${aTiempo(c.e)}\n${c.texto}\n`).join('\n');

// subtítulos al inglés línea a línea (mismos tiempos). En tandas de 60 con el texto de alrededor, para que no salga
// palabra suelta sin sentido; si el modelo no devuelve las mismas líneas, esa tanda se reintenta una vez y si no, falla
async function traducirSrt(texto, { generarJSON, modelo, idioma = 'inglés', contexto = '' } = {}) {
  const cues = leerSrt(texto);
  if (!cues.length) return '';
  if (!generarJSON) throw new Error('no hay modelo para traducir');
  const out = [];
  for (let i = 0; i < cues.length; i += 60) {
    const tanda = cues.slice(i, i + 60);
    let lineas = null;
    for (let intento = 0; intento < 2 && !lineas; intento++) {
      const r = await generarJSON({ modelo: modelo?.(), system: `Traduces subtítulos de clips de streams al ${idioma} natural y coloquial (como hablaría un camionero/gamer), sin censura ni explicaciones.`,
        prompt: `${contexto ? `Contexto: ${contexto}\n` : ''}Traduce CADA línea al ${idioma}. Devuelve exactamente ${tanda.length} líneas en el mismo orden (una frase puede quedar repartida entre líneas seguidas: repártela igual). Nombres propios y apodos tal cual.\n\n`
          + tanda.map((c, j) => `${j + 1}. ${c.texto}`).join('\n'),
        schema: { type: 'object', properties: { lineas: { type: 'array', items: { type: 'string' } } }, required: ['lineas'] } });
      const ls = (r?.datos || r || {}).lineas;
      if (Array.isArray(ls) && ls.length === tanda.length) lineas = ls.map(x => String(x).replace(/^\d+\.\s*/, '').trim());
    }
    if (!lineas) throw new Error('el modelo no devolvió la traducción completa');
    tanda.forEach((c, j) => out.push({ ...c, texto: lineas[j] || c.texto }));
  }
  return escribirSrt(out);
}

// ── título y descripción para redes (es + en) ──
const tituloBonito = g => { const s = String(g || '').toLocaleLowerCase('es').trim(); return s ? s[0].toLocaleUpperCase('es') + s.slice(1) : ''; };
function textosBase({ gancho, kit, stream }) {
  const t = tituloBonito(gancho) || kit?.marca || 'Clip';
  const enlace = stream ? `\n\nStream completo / full stream: https://www.youtube.com/watch?v=${stream}` : '';
  return { es: { titulo: t, descripcion: `${t}.${enlace}` }, en: { titulo: t, descripcion: `${t}.${enlace}` } };
}
async function textosRedes({ gancho, transcripcion = '', titulo = '', kit, stream, generarJSON, modelo, pistas = '' }) {
  const base = textosBase({ gancho, kit, stream });
  if (!generarJSON) return { ...base, modelo: false };
  try {
    const r = await generarJSON({ modelo: modelo?.(), system: 'Escribes títulos y descripciones de Shorts/TikTok que enganchan, en español y en inglés de EE. UU., sin clickbait falso.',
      prompt: `Canal: ${kit?.marca || ''}. ${kit?.contexto || ''}\nStream: ${titulo}\nTítulo en pantalla del clip: ${gancho || '—'}\nLo que se dice:\n${String(transcripcion).slice(0, 2000)}\n${pistas ? `\nLo que mejor ha funcionado en este canal:\n${pistas}\n` : ''}\n`
        + 'Devuelve es y en: titulo = máx. 70 caracteres, sin hashtags ni comillas, con la idea más fuerte del clip; descripcion = 1–2 frases que inviten a ver y comentar (sin hashtags, sin enlaces). En inglés que suene natural para camioneros de EE. UU. (no traducción literal). '
        + 'gancho_en = el título en pantalla pasado al inglés (máx. 6 palabras).',
      schema: { type: 'object', properties: {
        es: { type: 'object', properties: { titulo: { type: 'string' }, descripcion: { type: 'string' } }, required: ['titulo', 'descripcion'] },
        en: { type: 'object', properties: { titulo: { type: 'string' }, descripcion: { type: 'string' } }, required: ['titulo', 'descripcion'] },
        gancho_en: { type: 'string' } }, required: ['es', 'en'] } });
    const d = r?.datos || r || {};
    const limpio = (x, n) => String(x || '').replace(/#\S+/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().replace(/^["“'«]+|["”'»]+$/g, '').trim().slice(0, n);
    const enlace = stream ? `\n\nStream completo / full stream: https://www.youtube.com/watch?v=${stream}` : '';
    const out = {};
    for (const k of ['es', 'en']) {
      const t = limpio(d[k]?.titulo, 70), ds = limpio(d[k]?.descripcion, 400);
      out[k] = t ? { titulo: t, descripcion: (ds || t) + enlace } : base[k];
    }
    const ge = limpio(d.gancho_en, 60);
    return { ...out, ...(ge ? { ganchoEn: ge.toUpperCase() } : {}), modelo: true };
  } catch { return { ...base, modelo: false }; }
}
// título final de YouTube: título + hashtags del kit sin pasar de 100 caracteres (lo que quepa)
function tituloConHashtags(titulo, hashtags = '', max = 100) {
  let t = String(titulo || '').trim().slice(0, max);
  for (const h of String(hashtags).split(/\s+/).filter(x => /^#\S+$/.test(x))) if ((t + ' ' + h).length <= max) t += ' ' + h;
  return t;
}

// ── horas de publicación ──
function partes(t, zona) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute };
}
const desfaseMin = (t, zona) => { const p = partes(t, zona); return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.H, p.M) - Math.floor(t / 60000) * 60000) / 60000); };
const fechaEn = (t, zona) => { const p = partes(t, zona); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
function instanteEn(fecha, hhmm, zona) {                 // "2026-10-18" + "19:00" en esa zona → ms UTC
  const [y, m, d] = fecha.split('-').map(Number), [H, M] = String(hhmm).split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, H, M || 0);
  let t = local;
  for (let i = 0; i < 2; i++) t = local - desfaseMin(t, zona) * 60000;
  return t;
}
// el primer hueco libre: a una de las horas del kit, al menos margenMin desde ahora, sin pasar de maxPorDia y a más de
// 45 min de otro clip programado
function siguienteHueco({ horas = ['19:00'], zona = 'UTC', ocupados = [], ahora = Date.now(), maxPorDia = 3, margenMin = 30, dias = 45 } = {}) {
  const hs = [...new Set(horas)].filter(h => /^\d{1,2}:\d\d$/.test(h)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!hs.length) return null;
  const vistos = new Set();
  for (let k = 0; k <= dias; k++) {
    const fecha = fechaEn(ahora + k * 864e5, zona);
    if (vistos.has(fecha)) continue; vistos.add(fecha);
    if (ocupados.filter(t => fechaEn(t, zona) === fecha).length >= maxPorDia) continue;
    for (const h of hs) {
      const t = instanteEn(fecha, h, zona);
      if (t < ahora + margenMin * 60000 || ocupados.some(o => Math.abs(o - t) < 45 * 60000)) continue;
      return t;
    }
  }
  return null;
}

module.exports = { leerSrt, escribirSrt, traducirSrt, textosRedes, textosBase, tituloBonito, tituloConHashtags, siguienteHueco, instanteEn, fechaEn };
