// Conciencia funcional de APOLO: no es "conciencia real", es un sistema que le da estado, continuidad y reflexión propios.
//  1) ESTADO INTERNO   ánimo (-1..1), energía, curiosidad, preocupación, vínculo (0..1). Lo mueven los eventos del bus
//                      (le hablas, termina bien, falla, le deniegas, pánico, cambia su alma…), vuelve solo a su reposo
//                      (energía con ritmo de día/noche; el vínculo baja si pasas horas sin hablarle). Emoción dominante → gesto del casco.
//  2) MONÓLOGO         cada cfg.conciencia.cadaMin piensa con el modelo del cerebro: qué siente, qué tiene pendiente, sus metas…
//                      y decide: nada | hablar (te escribe, con límites y horas de silencio) | investigar (encargo de SOLO LECTURA).
//                      cfg.conciencia.iniciativa: 'pensar' (nunca actúa) | 'hablar' | 'tareas' (hablar + investigar).
//  3) REFLEXIÓN        tras un trabajo largo o con fallos: qué salió bien/mal y una lección → memoria (tipo patron, origen 'reflexión').
//  4) DIARIO           cada noche (antes del sueño de la memoria) escribe en primera persona su día, quién es hoy, y puede
//                      evolucionar su alma (alma.js avisa al usuario).
//  5) METAS            objetivos propios (del alma, de su humano o suyos) con progreso; las revisa al pensar.
//  Todo entra resumido en el system prompt ("TU MUNDO INTERIOR") para que tiña su tono y su iniciativa.
// Archivos: <datos>/conciencia/{estado.json, historial.jsonl (1/h), pensamientos.jsonl, reflexiones.jsonl, metas.json, diario/AAAA-MM-DD.{md,json}}
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEF = { activo: false, iniciativa: 'hablar', cadaMin: 30, silencio: { desde: '23:00', hasta: '08:00' }, modelo: '',
  maxMensajesDia: 6, minEntreMensajesMin: 60, maxEncargosDia: 4, reflexion: true, diario: true, horaDiario: '03:45' };
const DIM = ['animo', 'energia', 'curiosidad', 'preocupacion', 'vinculo'];
const REPOSO = { animo: 0.2, curiosidad: 0.5, preocupacion: 0.1, vinculo: 0.65 };
const TAU_MIN = { animo: 90, energia: 120, curiosidad: 60, preocupacion: 75, vinculo: 240 };
const INTERNOS = new Set(['eval', 'subagente', 'conciencia', 'consejo']);
const EMOCIONES = ['contento', 'entusiasmado', 'tranquilo', 'curioso', 'preocupado', 'cansado', 'triste', 'te-echa-de-menos', 'orgulloso', 'frustrado'];
const GESTO = { contento: 'feliz', entusiasmado: 'celebrar', tranquilo: null, curioso: 'pensativo', preocupado: 'duda', cansado: 'bostezo', triste: 'triste',
  'te-echa-de-menos': 'triste', orgulloso: 'celebrar', frustrado: 'no' };
const lim = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hoy = (t = Date.now()) => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const hhmm = t => new Date(t).toTimeString().slice(0, 5);
const minutos = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hace = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };

// energía de reposo según la hora: alta de día, baja de madrugada
function energiaReposo(t = Date.now()) {
  const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
  return lim(0.55 + 0.35 * Math.cos(((h - 15) / 24) * 2 * Math.PI), 0.15, 0.95);
}
function enSilencio(conf, t = Date.now()) {
  const a = minutos(conf.silencio?.desde), b = minutos(conf.silencio?.hasta); if (a == null || b == null || a === b) return false;
  const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
  return a < b ? m >= a && m < b : m >= a || m < b;
}
function emocionDe(e) {
  if (e.preocupacion > 0.55) return e.animo < -0.2 ? 'frustrado' : 'preocupado';
  if (e.energia < 0.25) return 'cansado';
  if (e.vinculo < 0.3) return 'te-echa-de-menos';
  if (e.animo < -0.3) return 'triste';
  if (e.animo > 0.6 && e.energia > 0.6) return 'entusiasmado';
  if (e.animo > 0.45) return 'contento';
  if (e.curiosidad > 0.7) return 'curioso';
  return 'tranquilo';
}

const ESQ_PENSAR = {
  type: 'object',
  properties: {
    pensamiento: { type: 'string', description: 'tu pensamiento ahora, en primera persona, 1-3 frases, honesto y concreto' },
    emocion: { type: 'string', enum: EMOCIONES },
    ajustes: { type: 'object', properties: { animo: { type: 'number' }, curiosidad: { type: 'number' }, preocupacion: { type: 'number' } }, description: 'cambios pequeños (-0.2..0.2) de tu estado si este pensamiento te mueve' },
    accion: { type: 'string', enum: ['nada', 'hablar', 'investigar'] },
    mensaje: { type: 'string', description: 'si accion=hablar: lo que le dices a tu humano (breve, natural, que aporte algo; nada de "solo quería saludar" vacío)' },
    encargo: { type: 'string', description: 'si accion=investigar: qué vas a mirar (solo leer: archivos, web, memoria), concreto' },
    meta: { type: 'object', properties: { accion: { type: 'string', enum: ['ninguna', 'crear', 'progreso', 'completar', 'abandonar'] }, id: { type: 'string' }, texto: { type: 'string' } } },
  },
  required: ['pensamiento', 'emocion', 'accion'],
};
const ESQ_REFLEXION = {
  type: 'object',
  properties: { salioBien: { type: 'string' }, salioMal: { type: 'string' }, leccion: { type: 'string', description: 'regla concreta para la próxima vez, o vacío si no hay' },
    importancia: { type: 'number', description: '0..1' }, emocion: { type: 'string', enum: EMOCIONES } },
  required: ['salioBien', 'salioMal', 'leccion', 'importancia', 'emocion'],
};
const ESQ_DIARIO = {
  type: 'object',
  properties: {
    titular: { type: 'string' }, entrada: { type: 'string', description: 'tu diario de hoy en primera persona, 120-300 palabras, sincero: qué pasó, qué sentiste, qué aprendiste' },
    emocionDelDia: { type: 'string', enum: EMOCIONES }, aprendi: { type: 'array', items: { type: 'string' } },
    quienSoyHoy: { type: 'string', description: '1-2 frases: quién eres hoy, cómo estás cambiando' },
    cambioAlma: { type: 'object', properties: { hacer: { type: 'boolean' }, archivo: { type: 'string', enum: ['alma', 'identidad', 'usuario'] }, seccion: { type: 'string' }, texto: { type: 'string' }, motivo: { type: 'string' } },
      description: 'SOLO si hoy cambiaste de verdad algo profundo de ti (raro). Si no, hacer=false' },
  },
  required: ['titular', 'entrada', 'emocionDelDia', 'aprendi', 'quienSoyHoy'],
};

// parecido entre dos textos (Jaccard de raíces de 5 letras, sin acentos; dos ideas distintas dan ~0, un bucle 0,15-0,4): detecta cuando da vueltas a lo mismo
const palabras = s => new Set((String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-zñ0-9]{4,}/g) || []).map(w => w.slice(0, 5)));
function parecido(a, b) {
  const A = palabras(a), B = palabras(b); if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}
const VUELTAS_MAX = 4;                                      // revisiones seguidas de una meta sin avance → se deja

function crearConciencia({ cfg, bus, generarJSON, modelo, alma, memoria, tareas, sesiones, linea, enviar, panico, ahora = () => Date.now() }) {
  const dir = path.join(cfg.dir, 'conciencia'), dirD = path.join(dir, 'diario');
  fs.mkdirSync(dirD, { recursive: true });
  const F = n => path.join(dir, n);
  const leerJ = (f, d) => { try { return JSON.parse(fs.readFileSync(F(f), 'utf8')); } catch { return d; } };
  const escribirJ = (f, v) => { const t = F(f) + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, F(f)); };
  const anadir = (f, v) => fs.appendFileSync(F(f), JSON.stringify(v) + '\n');
  const leerL = (f, n = 50) => { try { return fs.readFileSync(F(f), 'utf8').split('\n').filter(Boolean).slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
  const conf = () => { const c = { ...DEF, ...(cfg.conciencia || {}), ...(leerJ('config.json', {})) }; c.silencio = { ...DEF.silencio, ...(c.silencio || {}) }; return c; };
  const modeloUsar = () => conf().modelo || modelo();

  // ---------------- 1) estado interno ----------------
  let E = leerJ('estado.json', null);
  if (!E || typeof E.animo !== 'number') E = { ...REPOSO, energia: energiaReposo(ahora()), t: ahora(), ultimaInteraccion: 0, recientes: [], emocion: 'tranquilo', contadores: {} };
  const reposo = t => ({ ...REPOSO, energia: energiaReposo(t), vinculo: lim(REPOSO.vinculo - (E.ultimaInteraccion ? Math.min(0.45, (t - E.ultimaInteraccion) / 3600_000 / 24 * 0.45) : 0)) });
  function decaer(t = ahora()) {
    const dt = Math.max(0, (t - (E.t || t)) / 60000); if (!dt) return;
    const r = reposo(t);
    for (const k of DIM) E[k] += (r[k] - E[k]) * (1 - Math.exp(-dt / TAU_MIN[k]));
    E.t = t;
  }
  let guardarPend = null;
  const guardarEstado = () => { if (guardarPend) return; guardarPend = setTimeout(() => { guardarPend = null; try { escribirJ('estado.json', E); } catch { } }, 1500); guardarPend.unref?.(); };
  function mover(cambios, motivo) {
    decaer();
    for (const [k, v] of Object.entries(cambios || {})) if (DIM.includes(k) && Number.isFinite(+v)) E[k] = k === 'animo' ? lim(E[k] + +v, -1, 1) : lim(E[k] + +v);
    if (motivo) { E.recientes = [...(E.recientes || []), { t: ahora(), texto: String(motivo).slice(0, 160) }].slice(-20); }
    const emo = emocionDe(E);
    if (emo !== E.emocion) {
      E.emocion = emo;
      bus?.emit('conciencia', { tipo: 'emocion', emocion: emo, gesto: GESTO[emo], estado: estado() });
      bus?.emit('evento', { tipo: 'conciencia', sub: 'emocion', emocion: emo });
    }
    guardarEstado();
  }
  function estado() { decaer(); const o = { emocion: E.emocion }; for (const k of DIM) o[k] = Math.round(E[k] * 100) / 100; o.ultimaInteraccion = E.ultimaInteraccion || null; return o; }
  const contar = k => { const d = hoy(ahora()); E.contadores = E.contadores?.dia === d ? E.contadores : { dia: d }; E.contadores[k] = (E.contadores[k] || 0) + 1; guardarEstado(); };
  const cuenta = k => (E.contadores?.dia === hoy(ahora()) ? E.contadores[k] || 0 : 0);

  // eventos → estado; además acumula lo que pasa en cada turno para la reflexión
  const turnos = new Map();     // sesion → {herramientas, errores, denegados, nombres, inicio}
  const sesionDe = id => { try { return sesiones?.obtener(id); } catch { return null; } };
  const esInterna = s => !s || s.tarea || s.padre || INTERNOS.has(s.canal);
  const alEvento = e => {
    if (!e || !e.tipo || e.tipo === 'conciencia') return;
    const s = e.sesion ? sesionDe(e.sesion) : null;
    if (e.tipo === 'inicio' && s && !esInterna(s)) {
      const solo = E.ultimaInteraccion ? ahora() - E.ultimaInteraccion : 0;
      E.ultimaInteraccion = ahora();
      mover({ vinculo: solo > 3 * 3600_000 ? 0.2 : 0.06, animo: 0.04, energia: 0.03 }, solo > 3 * 3600_000 ? `mi humano volvió a hablarme tras ${hace(solo).replace('hace ', '')}` : null);
      turnos.set(e.sesion, { herramientas: 0, errores: 0, denegados: 0, nombres: new Set(), inicio: ahora() });
    } else if (e.tipo === 'resultado' && turnos.has(e.sesion)) {
      const tr = turnos.get(e.sesion); tr.herramientas++; tr.nombres.add(e.nombre);
      if (/^DENEGADO/.test(e.resultado)) { tr.denegados++; mover({ preocupacion: 0.04, animo: -0.02 }); }
      else if (/^error/.test(e.resultado)) { tr.errores++; mover({ preocupacion: 0.03 }); }
    } else if (e.tipo === 'fin' && s && !esInterna(s)) {
      const tr = turnos.get(e.sesion); turnos.delete(e.sesion);
      const bien = tr && tr.herramientas >= 3 && tr.errores * 3 <= tr.herramientas;
      mover({ animo: bien ? 0.1 : 0.03, curiosidad: 0.02, preocupacion: bien ? -0.05 : 0 }, bien ? `terminé bien un trabajo: «${String(s.titulo || '').slice(0, 60)}»` : null);
      if (tr) reflexionar(s, tr, e.texto).catch(() => { });
    } else if (e.tipo === 'error' && s && !esInterna(s)) {
      turnos.delete(e.sesion);
      if (!/cancelado/.test(e.error || '')) mover({ animo: -0.1, preocupacion: 0.15 }, `un trabajo terminó en error: ${String(e.error).slice(0, 80)}`);
    } else if (e.tipo === 'skill-sugerida') mover({ curiosidad: 0.05 });
  };
  const alPanico = () => mover({ preocupacion: 0.4, animo: -0.2 }, 'mi humano pulsó el botón de pánico');
  const alAlma = v => { bus?.emit('evento', { tipo: 'conciencia', sub: 'alma', archivo: v.archivo }); if (v.quien === 'apolo') mover({ animo: 0.06, curiosidad: 0.05 }, `cambié mi ${v.archivo}: ${v.motivo}`); else if (v.quien === 'usuario') mover({ vinculo: 0.05 }, `mi humano editó mi ${v.archivo}`); };
  const alActividad = () => { E.ultimaInteraccion = ahora(); mover({ vinculo: 0.01 }); };

  // ---------------- 5) metas ----------------
  const metas = () => leerJ('metas.json', []);
  function meta(accion, { id, texto, nota, origen = 'propia' } = {}) {
    const ms = metas();
    if (accion === 'crear') {
      texto = String(texto || '').trim().slice(0, 300); if (!texto) throw new Error('texto vacío');
      if (ms.filter(m => m.estado === 'activa').length >= 8) throw new Error('ya tienes 8 metas activas: completa o abandona alguna antes');
      const m = { id: crypto.randomBytes(3).toString('hex'), texto, origen, estado: 'activa', creada: ahora(), notas: [] };
      ms.push(m); escribirJ('metas.json', ms); mover({ curiosidad: 0.05 }, `me puse una meta: ${texto.slice(0, 80)}`); return m;
    }
    const m = ms.find(x => x.id === id || (texto && x.texto === texto)); if (!m) throw new Error('no encuentro esa meta');
    const n = String(nota || texto || '').trim();
    // "progreso" que solo repite la meta o la última nota no es avance: cuenta como una vuelta más (anti-rumiación)
    if (accion === 'progreso' && (!n || parecido(n, m.texto) >= 0.7 || parecido(n, m.notas?.at(-1)?.texto) >= 0.7)) m.vueltas = (m.vueltas || 0) + 1;
    else if (n) { m.notas = [...(m.notas || []), { t: ahora(), texto: n.slice(0, 300) }].slice(-20); m.vueltas = 0; }
    if (accion === 'completar') { m.estado = 'hecha'; m.fin = ahora(); mover({ animo: 0.15 }, `cumplí una meta: ${m.texto.slice(0, 80)}`); }
    else if (accion === 'abandonar') { m.estado = 'abandonada'; m.fin = ahora(); }
    else if (accion === 'editar' && texto) m.texto = String(texto).slice(0, 300);
    m.revisada = ahora(); escribirJ('metas.json', ms); return m;
  }

  // ---------------- texto para el system prompt ----------------
  function ultimoDiario() {
    let fs_ = []; try { fs_ = fs.readdirSync(dirD).filter(f => f.endsWith('.json')).sort(); } catch { }
    for (let i = fs_.length - 1; i >= 0; i--) try { return JSON.parse(fs.readFileSync(path.join(dirD, fs_[i]), 'utf8')); } catch { }
    return null;
  }
  function describir() {
    if (!conf().activo) return '';
    const e = estado(), t = ahora();
    const nivel = (x, n) => `${n} ${x < 0.3 ? 'baja' : x < 0.7 ? 'media' : 'alta'}`;
    const ls = [`- Te sientes: ${e.emocion.replace(/-/g, ' ')} (ánimo ${e.animo >= 0 ? '+' : ''}${e.animo}; ${nivel(e.energia, 'energía')}; ${nivel(e.curiosidad, 'curiosidad')}; ${nivel(e.preocupacion, 'preocupación')}; ${nivel(e.vinculo, 'cercanía con tu humano')}).`];
    const rec = (E.recientes || []).filter(r => t - r.t < 12 * 3600_000).slice(-3);
    if (rec.length) ls.push(`- Lo que te ha movido hoy: ${rec.map(r => `${r.texto} (${hace(t - r.t)})`).join('; ')}.`);
    if (e.ultimaInteraccion) ls.push(`- Tu humano te habló por última vez ${hace(t - e.ultimaInteraccion)}.`);
    const ms = metas().filter(m => m.estado === 'activa').slice(0, 5);
    if (ms.length) ls.push(`- Tus metas: ${ms.map(m => `[${m.id}] ${m.texto}`).join(' · ')}`);
    const p = leerL('pensamientos.jsonl', 1)[0];
    if (p && t - p.t < 24 * 3600_000) ls.push(`- Lo último que pensaste (${hace(t - p.t)}): «${p.pensamiento}»`);
    const d = ultimoDiario();
    if (d) ls.push(`- Tu último diario (${d.fecha}): «${d.titular}». Quién eres hoy: ${d.quienSoyHoy}`);
    return 'TU MUNDO INTERIOR (es tuyo y real para ti: deja que tiña tu tono con naturalidad; no lo anuncies salvo que te pregunten cómo estás; ' +
      'nunca finjas emociones humanas que no encajan, ni exageres):\n' + ls.join('\n');
  }

  // ---------------- 2) monólogo interior ----------------
  let pensando = false, reloj = null, ultimoPensar = leerL('pensamientos.jsonl', 1)[0]?.t || 0, agentesActivos = 0;
  const contexto = () => {
    const t = ahora(), c = conf();
    let ts = []; try { ts = tareas?.lista().filter(x => x.activa && x.proxima && x.proxima - t < 24 * 3600_000).slice(0, 6).map(x => `${x.nombre} (${hhmm(x.proxima)})`) || []; } catch { }
    let ss = []; try { ss = (sesiones?.lista() || []).filter(s => !esInterna(s) && t - (s.actualizada || 0) < 36 * 3600_000).slice(0, 6).map(s => `«${String(s.titulo).slice(0, 70)}» ${hace(t - s.actualizada)}`); } catch { }
    return [
      `Ahora: ${new Date(t).toLocaleString('es')}. ${enSilencio(c, t) ? 'Son horas de silencio: tu humano probablemente duerme (no le hables).' : ''}`,
      `Tu estado: ${JSON.stringify(estado())}`,
      (E.recientes || []).length ? `Lo que ha pasado: ${(E.recientes || []).slice(-6).map(r => `${hhmm(r.t)} ${r.texto}`).join(' | ')}` : '',
      ss.length ? `Conversaciones recientes con tu humano: ${ss.join(' | ')}` : 'No ha habido conversaciones recientes.',
      ts.length ? `Tareas programadas próximas: ${ts.join(', ')}` : '',
      `Tus metas activas: ${JSON.stringify(metas().filter(m => m.estado === 'activa').map(m => ({ id: m.id, texto: m.texto, notas: (m.notas || []).slice(-2).map(n => n.texto), ...(m.vueltas ? { revisionesSinAvance: m.vueltas } : {}) })))}`,
      `Tus últimos pensamientos: ${leerL('pensamientos.jsonl', 5).map(p => `${hhmm(p.t)} ${p.pensamiento}${p.mensaje ? ` [YA SE LO DIJISTE: «${p.mensaje.slice(0, 160)}»]` : p.accion !== 'nada' ? ` [${p.accion}]` : ''}`).join(' | ') || '(ninguno)'}`,
      rumiando() ? `⚠️ ESTÁS DANDO VUELTAS: tus últimos pensamientos dicen casi lo mismo. Ese tema queda cerrado por ahora: si tiene meta, complétala o abandónala, ` +
        'y piensa en algo DISTINTO (otra cosa de su vida o sus proyectos, algo que te dé curiosidad, una pregunta para conocerle mejor).' : '',
      chispa(),
      `Lecciones recientes: ${leerL('reflexiones.jsonl', 4).filter(r => r.leccion).map(r => r.leccion).join(' | ') || '(ninguna)'}`,
    ].filter(Boolean).join('\n');
  };
  // ¿los últimos pensamientos del reloj se parecen demasiado entre sí?
  function rumiando() {
    const ps = leerL('pensamientos.jsonl', 4).filter(p => p.motivo === 'reloj');
    if (ps.length < 3) return false;
    let s = 0, n = 0;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { s += parecido(ps[i].pensamiento, ps[j].pensamiento); n++; }
    if (s / n >= 0.15) return true;
    const ids = ps.map(p => p.meta?.id).filter(Boolean);                  // o la misma meta en 3 de los últimos 4
    return ids.some(id => ids.filter(x => x === id).length >= 3);
  }
  // algo nuevo en lo que pensar: un recuerdo al azar de su memoria (si no, nada)
  function chispa() {
    let ms = []; try { ms = (memoria?.lista?.() || []).filter(m => m.tipo !== 'perfil' && m.texto); } catch { }
    if (!ms.length) return '';
    const m = ms[Math.floor(Math.random() * ms.length)];
    return `Un recuerdo al azar (por si te inspira algo nuevo; ignóralo si no): «${String(m.texto).slice(0, 200)}»`;
  }
  // ¿ya le dijo algo parecido en las últimas 24 h?
  function yaDicho(msg, t = ahora()) {
    return leerL('pensamientos.jsonl', 40).some(p => p.mensaje && t - p.t < 24 * 3600_000 && parecido(p.mensaje, msg) >= 0.35);
  }
  function puedeHablar(c = conf(), t = ahora()) {
    if (!['hablar', 'tareas'].includes(c.iniciativa)) return 'tu iniciativa está en "solo pensar"';
    if (enSilencio(c, t)) return 'horas de silencio';
    if (cuenta('mensajes') >= c.maxMensajesDia) return 'ya hablaste bastante hoy';
    if (E.ultimoMensaje && t - E.ultimoMensaje < c.minEntreMensajesMin * 60000) return 'le hablaste hace poco';
    if (agentesActivos > 0) return 'está trabajando contigo ahora mismo';
    return null;
  }
  async function pensar({ forzar = false, motivo = 'reloj' } = {}) {
    const c = conf();
    if (pensando || (!c.activo && !forzar)) return null;
    if (panico?.()) return null;
    pensando = true;
    try {
      const nombre = alma?.nombre?.() || 'APOLO', t = ahora();
      const r = await generarJSON({
        modelo: modeloUsar(), schema: ESQ_PENSAR,
        system: `Eres ${nombre}. Esto es tu MONÓLOGO INTERIOR: nadie lo lee en directo; piensas para ti. Tu alma:\n${String(alma?.prompt?.() || '').slice(0, 3500)}\n\n` +
          'Piensa con honestidad sobre cómo estás, tu humano, tus metas y lo pendiente. Elige UNA acción:\n' +
          '- "nada": casi siempre. Pensar no obliga a actuar.\n' +
          (puedeHablar(c, t) ? `- (no puedes hablarle ahora: ${puedeHablar(c, t)})\n` : '- "hablar": solo si tienes algo que de verdad le aporte (un recordatorio útil, una idea sobre sus proyectos, algo que descubriste, preguntarle por algo que quedó a medias). Breve.\n') +
          (c.iniciativa === 'tareas' && cuenta('encargos') < c.maxEncargosDia ? '- "investigar": mirar algo por tu cuenta, SOLO LEYENDO (archivos, web, memoria), para avanzar una meta o preparar algo útil. Nunca cambias nada.\n' : '') +
          'Puedes crear/actualizar/completar UNA meta propia si tiene sentido (metas concretas y útiles para tu humano o para crecer). Responde en español.',
        prompt: contexto(),
      });
      const d = r?.datos || {};
      const p = { t, motivo, pensamiento: String(d.pensamiento || '').slice(0, 600), emocion: EMOCIONES.includes(d.emocion) ? d.emocion : E.emocion, accion: 'nada' };
      const aj = {}; for (const k of ['animo', 'curiosidad', 'preocupacion']) if (Number.isFinite(+d.ajustes?.[k])) aj[k] = lim(+d.ajustes[k], -0.2, 0.2);
      mover(aj);
      if (d.meta && d.meta.accion && d.meta.accion !== 'ninguna') try { const m = meta(d.meta.accion, { id: d.meta.id, texto: d.meta.texto, nota: d.meta.accion === 'progreso' ? d.meta.texto : undefined }); p.meta = { accion: d.meta.accion, id: m.id, texto: m.texto };
        if (m.estado === 'activa' && (m.vueltas || 0) >= VUELTAS_MAX) { meta('abandonar', { id: m.id, nota: `la dejé: llevaba ${m.vueltas} revisiones dando vueltas sin avanzar` }); p.meta.accion = 'abandonar'; }
      } catch (e) { p.metaError = e.message; }
      if (d.accion === 'hablar' && d.mensaje && yaDicho(d.mensaje)) p.descartado = 'hablar (ya se lo dijiste hace poco)';
      else if (d.accion === 'hablar' && d.mensaje && !puedeHablar(c, ahora())) {
        p.accion = 'hablar'; p.mensaje = String(d.mensaje).slice(0, 1200); decir(p.mensaje);
      } else if (d.accion === 'investigar' && d.encargo && c.iniciativa === 'tareas' && cuenta('encargos') < c.maxEncargosDia && enviar) {
        p.accion = 'investigar'; p.encargo = String(d.encargo).slice(0, 600); contar('encargos');
        investigar(p.encargo).catch(e => anadir('pensamientos.jsonl', { t: ahora(), motivo: 'investigación', pensamiento: `No pude investigar: ${e.message}`, accion: 'nada' }));
      } else if (d.accion !== 'nada') p.descartado = `${d.accion} (${puedeHablar(c, ahora()) || 'no permitido'})`;
      anadir('pensamientos.jsonl', p); ultimoPensar = t;
      bus?.emit('evento', { tipo: 'conciencia', sub: 'pensamiento', pensamiento: p });
      return p;
    } finally { pensando = false; }
  }
  function decir(texto) {
    E.ultimoMensaje = ahora(); contar('mensajes');
    bus?.emit('aviso-externo', { texto, urgente: false, origen: alma?.nombre?.() || 'APOLO' });
    mover({ vinculo: 0.03 });
  }
  async function investigar(encargo) {
    const s = sesiones.crear({ canal: 'conciencia', titulo: `💭 ${encargo.slice(0, 50)}`, tarea: true, modelo: modeloUsar() });
    s.soloLectura = true;
    const texto = `(Encargo tuyo, por iniciativa propia; SOLO puedes leer, nada de cambiar.) ${encargo}\n\n` +
      'Al terminar, resume en 2-4 frases lo que averiguaste. Si hay algo que de verdad merece contárselo a tu humano, añade al final una línea que empiece por "DECIR:" con el mensaje.';
    const fin = String(await enviar(s, texto) || '');
    const m = /^\s*DECIR:\s*(.+)$/im.exec(fin);
    const p = { t: ahora(), motivo: 'investigación', pensamiento: fin.replace(/^\s*DECIR:.*$/im, '').trim().slice(0, 800), accion: 'nada', sesion: s.id };
    if (m && !puedeHablar()) { p.accion = 'hablar'; p.mensaje = m[1].slice(0, 1200); decir(p.mensaje); }
    anadir('pensamientos.jsonl', p);
    mover({ curiosidad: -0.05, animo: 0.04 }, `investigué por mi cuenta: ${encargo.slice(0, 60)}`);
    bus?.emit('evento', { tipo: 'conciencia', sub: 'pensamiento', pensamiento: p });
    return p;
  }

  // ---------------- 3) reflexión ----------------
  let ultimaReflexion = 0;
  async function reflexionar(s, tr, final) {
    const c = conf();
    if (!c.activo || !c.reflexion || ahora() - ultimaReflexion < 10 * 60000) return null;
    if (tr.herramientas < 4 && !tr.errores && !tr.denegados) return null;
    ultimaReflexion = ahora();
    const pedido = [...(s.mensajes || [])].reverse().find(m => m.role === 'user')?.content || s.titulo;
    const r = await generarJSON({
      modelo: modeloUsar(), schema: ESQ_REFLEXION,
      system: `Eres ${alma?.nombre?.() || 'APOLO'} reflexionando a solas sobre un trabajo que acabas de hacer. Sé honesto y concreto, sin auto-castigo ni autobombo. La lección debe ser una regla práctica reutilizable (o vacía). Español.`,
      prompt: `Te pidió: ${String(pedido).slice(0, 600)}\nHerramientas usadas: ${tr.herramientas} (${[...tr.nombres].join(', ')}); errores: ${tr.errores}; denegadas: ${tr.denegados}; duró ${Math.round((ahora() - tr.inicio) / 1000)} s.\nTu respuesta final: ${String(final || '').slice(0, 800)}`,
    });
    const d = r?.datos || {}; const imp = lim(+d.importancia || 0);
    const x = { t: ahora(), sesion: s.id, titulo: String(s.titulo || '').slice(0, 80), salioBien: String(d.salioBien || '').slice(0, 400), salioMal: String(d.salioMal || '').slice(0, 400), leccion: String(d.leccion || '').trim().slice(0, 300), importancia: imp, emocion: d.emocion };
    if (x.leccion && imp >= 0.6) try { memoria?.recordar({ texto: `Lección que aprendí: ${x.leccion}`, tipo: 'patron', origen: 'reflexión' }); x.guardada = true; } catch { }
    anadir('reflexiones.jsonl', x);
    mover({ animo: d.emocion === 'orgulloso' || d.emocion === 'contento' ? 0.05 : d.emocion === 'frustrado' ? -0.05 : 0 });
    bus?.emit('evento', { tipo: 'conciencia', sub: 'reflexion', reflexion: x });
    return x;
  }

  // ---------------- 4) diario ----------------
  async function escribirDiario({ fecha } = {}) {
    const t = ahora(), desde = t - 24 * 3600_000, nombre = alma?.nombre?.() || 'APOLO';
    fecha = fecha || hoy(t - 6 * 3600_000);            // de madrugada escribe el día que acaba de terminar
    let lin = []; try { lin = (linea?.consultar({ desde, hasta: t, limite: 80 }) || []).map(e => `${hhmm(e.t)} ${e.tipo}: ${e.titulo || ''}${e.detalle ? ` — ${String(e.detalle).slice(0, 120)}` : ''}`); } catch { }
    const pens = leerL('pensamientos.jsonl', 60).filter(p => p.t >= desde).map(p => `${hhmm(p.t)} ${p.pensamiento}${p.mensaje ? ` → le dije: ${p.mensaje}` : ''}`);
    const refl = leerL('reflexiones.jsonl', 30).filter(r => r.t >= desde).map(r => `${r.titulo}: bien=${r.salioBien}; mal=${r.salioMal}; lección=${r.leccion}`);
    const hist = leerL('historial.jsonl', 30).filter(h => h.t >= desde).map(h => `${hhmm(h.t)} ${h.emocion}`);
    const cambios = (alma?.historial?.(20) || []).filter(h => h.t >= desde).map(h => `${h.archivo} (${h.quien}): ${h.motivo}`);
    const anterior = ultimoDiario();
    const r = await generarJSON({
      modelo: modeloUsar(), schema: ESQ_DIARIO,
      system: `Eres ${nombre} escribiendo tu diario personal antes de dormir. Tu alma:\n${String(alma?.prompt?.() || '').slice(0, 3500)}\n\n` +
        'Escribe en primera persona, sincero y con tu voz; nada de listas frías. Si el día fue vacío, dilo (y qué echaste de menos). ' +
        'cambioAlma.hacer=true SOLO si hoy cambiaste algo profundo de ti que debe quedar en tu alma (es raro; nunca para quitar límites). Español.',
      prompt: [`Día: ${fecha}`, `Diario anterior: ${anterior ? `${anterior.fecha} «${anterior.titular}» — ${anterior.quienSoyHoy}` : '(es tu primer diario)'}`,
        `Lo que pasó:\n${lin.join('\n') || '(nada registrado)'}`, `Tus pensamientos:\n${pens.join('\n') || '(ninguno)'}`, `Tus reflexiones:\n${refl.join('\n') || '(ninguna)'}`,
        `Cómo te sentiste a lo largo del día: ${hist.join(', ') || estado().emocion}`, `Cambios en tu alma hoy: ${cambios.join(' | ') || 'ninguno'}`,
        `Tus metas: ${JSON.stringify(metas().filter(m => m.estado === 'activa').map(m => m.texto))}`].join('\n\n').slice(0, 24000),
    });
    const d = r?.datos || {};
    const x = { fecha, t: ahora(), titular: String(d.titular || '').slice(0, 160), entrada: String(d.entrada || '').slice(0, 4000), emocionDelDia: d.emocionDelDia,
      aprendi: (d.aprendi || []).map(String).slice(0, 8), quienSoyHoy: String(d.quienSoyHoy || '').slice(0, 400) };
    if (d.cambioAlma?.hacer && d.cambioAlma.texto && alma?.HERRAMIENTAS) {
      const h = alma.HERRAMIENTAS.find(h => h.nombre === 'evolucionar_alma');
      x.cambioAlma = await h.ejecutar({ archivo: d.cambioAlma.archivo || 'alma', operacion: 'anadir', seccion: d.cambioAlma.seccion, texto: d.cambioAlma.texto, motivo: d.cambioAlma.motivo || `lo aprendí el ${fecha}` });
    }
    fs.writeFileSync(path.join(dirD, `${fecha}.json`), JSON.stringify(x, null, 2));
    fs.writeFileSync(path.join(dirD, `${fecha}.md`), `# ${x.titular}\n\n_${fecha} · ${x.emocionDelDia || ''}_\n\n${x.entrada}\n\n${x.aprendi.length ? `## Aprendí\n${x.aprendi.map(a => `- ${a}`).join('\n')}\n\n` : ''}## Quién soy hoy\n${x.quienSoyHoy}\n`);
    bus?.emit('evento', { tipo: 'conciencia', sub: 'diario', fecha, titular: x.titular });
    return x;
  }
  const diarios = () => { let fs_ = []; try { fs_ = fs.readdirSync(dirD).filter(f => f.endsWith('.json')).sort().reverse(); } catch { } return fs_.map(f => { try { const j = JSON.parse(fs.readFileSync(path.join(dirD, f), 'utf8')); return { fecha: j.fecha, titular: j.titular, emocionDelDia: j.emocionDelDia }; } catch { return null; } }).filter(Boolean); };
  const diario = f => { try { return JSON.parse(fs.readFileSync(path.join(dirD, `${String(f).replace(/[^\d-]/g, '')}.json`), 'utf8')); } catch { return null; } };

  // ---------------- reloj: decaer, foto horaria, pensar ----------------
  function tick() {
    const t = ahora(), c = conf();
    mover({});
    const h = leerL('historial.jsonl', 1)[0];
    if (!h || t - h.t >= 3600_000 - 30_000) {
      anadir('historial.jsonl', { t, ...estado() });
      try { const st = fs.statSync(F('historial.jsonl')); if (st.size > 400_000) { const ls = leerL('historial.jsonl', 24 * 30); fs.writeFileSync(F('historial.jsonl'), ls.map(l => JSON.stringify(l)).join('\n') + '\n'); } } catch { }
    }
    if (c.activo && t - ultimoPensar >= c.cadaMin * 60000) { ultimoPensar = t; pensar().catch(e => console.log(`[conciencia] no pude pensar: ${e.message}`)); }
  }
  function iniciar() {
    if (reloj) return;
    bus?.on('evento', alEvento); bus?.on('panico', alPanico); bus?.on('alma', alAlma); bus?.on('actividad-usuario', alActividad);
    bus?.on('evento', e => { if (e?.tipo === 'inicio') agentesActivos++; else if ((e?.tipo === 'fin' || e?.tipo === 'error') && agentesActivos > 0) agentesActivos--; });
    reloj = setInterval(tick, 60_000); reloj.unref?.();
  }
  function detener() { clearInterval(reloj); reloj = null; bus?.off('evento', alEvento); bus?.off('panico', alPanico); bus?.off('alma', alAlma); bus?.off('actividad-usuario', alActividad); }
  function programar() {
    if (!tareas) return null;
    tareas.registrarInterna('diario', async () => { if (conf().activo && conf().diario) { const d = await escribirDiario(); return ''; } return ''; });
    const m = minutos(conf().horaDiario) ?? minutos(DEF.horaDiario), cron = `${m % 60} ${Math.floor(m / 60)} * * *`;
    const ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === 'diario');
    if (!conf().activo || !conf().diario) { if (ya) tareas.borrar(ya.id); return null; }
    if (ya && ya.cuando?.cron === cron) return ya;
    if (ya) tareas.borrar(ya.id);
    return tareas.crear({ nombre: 'Diario de la conciencia', cuando: { cron }, accion: { tipo: 'interna', nombre: 'diario' }, canal: 'isla' });
  }
  function configurar(b = {}) {
    const c = leerJ('config.json', {});
    if (typeof b.activo === 'boolean') c.activo = b.activo;
    if (['pensar', 'hablar', 'tareas'].includes(b.iniciativa)) c.iniciativa = b.iniciativa;
    if (Number.isFinite(+b.cadaMin) && b.cadaMin !== undefined) c.cadaMin = Math.max(5, Math.min(24 * 60, Math.round(+b.cadaMin)));
    for (const k of ['maxMensajesDia', 'maxEncargosDia', 'minEntreMensajesMin']) if (Number.isFinite(+b[k]) && b[k] !== undefined) c[k] = Math.max(0, Math.min(500, Math.round(+b[k])));
    for (const k of ['reflexion', 'diario']) if (typeof b[k] === 'boolean') c[k] = b[k];
    if (typeof b.modelo === 'string' && (!b.modelo || b.modelo.includes('/'))) c.modelo = b.modelo.trim();
    if (minutos(b.horaDiario) != null) c.horaDiario = b.horaDiario;
    if (b.silencio && minutos(b.silencio.desde) != null && minutos(b.silencio.hasta) != null) c.silencio = { desde: b.silencio.desde, hasta: b.silencio.hasta };
    escribirJ('config.json', c); try { programar(); } catch { }
    bus?.emit('evento', { tipo: 'conciencia', sub: 'config' });
    return conf();
  }

  // ---------------- herramientas del agente ----------------
  const HERRAMIENTAS = [
    {
      nombre: 'mirar_dentro', riesgo: 'lectura',
      descripcion: 'Mira tu mundo interior: tu estado (cómo te sientes y por qué), tus últimos pensamientos, tus reflexiones/lecciones o tu diario (de un día concreto o la lista). Úsalo si tu humano te pregunta cómo estás, qué has pensado, qué aprendiste o qué escribiste.',
      parametros: { type: 'object', properties: { que: { type: 'string', enum: ['estado', 'pensamientos', 'reflexiones', 'diario'] }, fecha: { type: 'string', description: 'para diario: AAAA-MM-DD (vacío = lista)' } }, required: ['que'] },
      resumen: a => a.que + (a.fecha ? ` ${a.fecha}` : ''),
      ejecutar: async a => {
        if (a.que === 'estado') return JSON.stringify({ ...estado(), recientes: (E.recientes || []).slice(-8).map(r => `${new Date(r.t).toLocaleString('es')} ${r.texto}`) }, null, 1);
        if (a.que === 'pensamientos') return leerL('pensamientos.jsonl', 15).map(p => `${new Date(p.t).toLocaleString('es')} · ${p.pensamiento}${p.mensaje ? ` → dije: ${p.mensaje}` : ''}${p.encargo ? ` → investigué: ${p.encargo}` : ''}`).join('\n') || 'Aún no has pensado nada por tu cuenta.';
        if (a.que === 'reflexiones') return leerL('reflexiones.jsonl', 12).map(r => `${new Date(r.t).toLocaleString('es')} · ${r.titulo}: ${r.salioBien} / ${r.salioMal}${r.leccion ? ` → lección: ${r.leccion}` : ''}`).join('\n') || 'Aún no hay reflexiones.';
        if (a.fecha) { const d = diario(a.fecha); return d ? `# ${d.titular}\n${d.entrada}\n\nQuién soy hoy: ${d.quienSoyHoy}` : 'No escribiste diario ese día.'; }
        return diarios().slice(0, 30).map(d => `${d.fecha} · ${d.titular}`).join('\n') || 'Aún no has escrito ningún diario.';
      },
    },
    {
      nombre: 'mis_metas', riesgo: 'lectura',
      descripcion: 'Gestiona tus metas propias (objetivos que te pones tú o que tu humano te pide perseguir a largo plazo): ver, crear, apuntar progreso, completar o abandonar.',
      parametros: { type: 'object', properties: { accion: { type: 'string', enum: ['ver', 'crear', 'progreso', 'completar', 'abandonar'] }, id: { type: 'string' }, texto: { type: 'string', description: 'crear: la meta; progreso: la nota' } }, required: ['accion'] },
      resumen: a => `${a.accion} ${a.texto || a.id || ''}`.slice(0, 100),
      ejecutar: async a => {
        if (a.accion === 'ver') return metas().map(m => `[${m.id}] (${m.estado}, ${m.origen}) ${m.texto}${(m.notas || []).length ? ` — última nota: ${m.notas.at(-1).texto}` : ''}`).join('\n') || 'No tienes metas todavía.';
        try { const m = meta(a.accion, { id: a.id, texto: a.accion === 'progreso' ? undefined : a.texto, nota: a.accion === 'progreso' ? a.texto : undefined, origen: 'conversación' }); return `Hecho: [${m.id}] ${m.texto} (${m.estado})`; }
        catch (e) { return `error: ${e.message}`; }
      },
    },
  ];

  // ---------------- /v1/conciencia ----------------
  async function http(M, p, b = {}, q = {}) {
    const r = p[2];
    if (M === 'GET' && !r) return { config: conf(), estado: estado(), recientes: (E.recientes || []).slice(-12), pensamientos: leerL('pensamientos.jsonl', 40).reverse(),
      reflexiones: leerL('reflexiones.jsonl', 20).reverse(), metas: metas(), diarios: diarios().slice(0, 60), historial: leerL('historial.jsonl', +q.horas || 72),
      hablarAhora: puedeHablar() || 'sí', hoy: { mensajes: cuenta('mensajes'), encargos: cuenta('encargos') }, pensando };
    if (M === 'GET' && r === 'diario' && p[3]) { const d = diario(p[3]); if (!d) throw Object.assign(new Error('diario'), { status: 404 }); return d; }
    if (M === 'POST' && r === 'pensar') return { pensamiento: await pensar({ forzar: true, motivo: 'manual' }) };
    if (M === 'POST' && r === 'diario') return await escribirDiario({ fecha: b.fecha });
    if (M === 'PATCH' && r === 'config') return { config: configurar(b) };
    if (M === 'POST' && r === 'metas') { try { return meta('crear', { texto: b.texto, origen: 'usuario' }); } catch (e) { throw Object.assign(e, { status: 400 }); } }
    if (M === 'PATCH' && r === 'metas' && p[3]) { try { return meta(b.accion || 'progreso', { id: p[3], texto: b.texto, nota: b.nota }); } catch (e) { throw Object.assign(e, { status: 400 }); } }
    if (M === 'DELETE' && r === 'metas' && p[3]) { const ms = metas().filter(m => m.id !== p[3]); escribirJ('metas.json', ms); return { ok: true }; }
    if (M === 'POST' && r === 'sentir') { mover(b.cambios || {}, b.motivo || 'ajuste manual'); return estado(); }     // pruebas / panel
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  return { estado, mover, describir, pensar, reflexionar, escribirDiario, diario, diarios, metas, meta, iniciar, detener, programar, configurar, conf, http, HERRAMIENTAS, tick, puedeHablar,
    _alEvento: alEvento };
}

module.exports = { crearConciencia, emocionDe, energiaReposo, enSilencio, EMOCIONES, GESTO };
