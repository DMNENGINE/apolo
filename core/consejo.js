// Consejo de modelos: una pregunta → N modelos responden EN PARALELO → (opcional) rondas de debate en las que cada uno
// ve las respuestas de los demás y puede corregirse → un moderador sintetiza y vota (generarJSON).
// Cada consejo es una sesión (canal 'consejo') y cada miembro una sesión HIJA: así se ve en vivo en Mission Control.
// Si un miembro falla (sin key, 429, CLI sin instalar, tiempo agotado) se marca AUSENTE y el consejo sigue.
//   cfg.consejo = { miembros: ['proveedor/modelo'…], rondas: 1, moderador: 'proveedor/modelo', timeoutSeg: 240, max: 6 }
// Eventos: bus 'evento' { tipo: 'consejo', fase, consejo: <instantánea> }   fase: inicio|miembro|respuesta|ronda|veredicto|fin
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const POR_DEFECTO = ['claudecode/haiku', 'chatgpt/default', 'gemini/gemini-3.8-flash', 'ollama/gemma4:31b-cloud', 'ollama/qwen3.6'];
const SISTEMA_MIEMBRO = nombre => [
  `Eres ${nombre}, miembro de un CONSEJO de modelos de IA distintos que responden a la misma pregunta del usuario.`,
  'Da TU mejor respuesta: directa, concreta y razonada, sin relleno. Máximo ~180 palabras salvo que la pregunta exija más.',
  'Responde en el idioma de la pregunta. No hables de que eres parte de un consejo salvo que te lo pidan.',
].join('\n');
const PROMPT_DEBATE = (otras, ronda) => [
  `RONDA DE DEBATE ${ronda}. Estas son las respuestas de los OTROS miembros del consejo:`, '',
  otras, '',
  'Revísalas con espíritu crítico. Si alguno tiene razón en algo que tú fallaste, corrígete; si crees que se equivocan, defiéndelo con argumentos.',
  'Empieza con UNA línea exactamente así: "POSTURA: mantengo" o "POSTURA: corrijo" o "POSTURA: matizo".',
  'Después da tu respuesta FINAL mejorada (máximo ~150 palabras) y, si discrepas de alguien, di de quién y por qué en una frase.',
].join('\n');
const ESQUEMA = {
  type: 'object',
  properties: {
    respuesta: { type: 'string', description: 'la respuesta final del consejo, la mejor síntesis posible' },
    votos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { modelo: { type: 'string' }, voto: { type: 'string', enum: ['a favor', 'parcial', 'en contra'] }, motivo: { type: 'string' } },
        required: ['modelo', 'voto', 'motivo'],
      },
    },
    acuerdo: { type: 'number', description: '0-100: cuánto coinciden los miembros con la respuesta final' },
    titular: { type: 'string', description: 'una frase corta y llamativa que resuma el veredicto' },
  },
  required: ['respuesta', 'votos', 'acuerdo'],
};
const SISTEMA_MODERADOR = 'Eres el MODERADOR imparcial de un consejo de modelos de IA. Lees la pregunta y la postura FINAL de cada miembro ' +
  '(tras el debate, si lo hubo) y: 1) escribes la mejor respuesta posible combinando lo correcto de cada uno (si hay errores, no los copies); ' +
  '2) registras el VOTO de cada miembro respecto a esa respuesta final: "a favor" (su postura coincide), "parcial" (coincide en parte) o "en contra" (defiende otra cosa), ' +
  'con un motivo de una frase; 3) das el % de acuerdo global (0-100). Usa exactamente los nombres de modelo que se te dan. Responde en el idioma de la pregunta.';

// nombre corto para mostrar: el modelo; si es genérico ('default', 'auto'), el proveedor (chatgpt/default → ChatGPT)
const NOMBRES = { chatgpt: 'ChatGPT', claudecode: 'Claude Code', gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude' };
const etiqueta = m => { const x = String(m || '').split('/'); if (x.length < 2) return m; const mod = x.slice(1).join('/'); return /^(default|auto)$/i.test(mod) ? (NOMBRES[x[0]] || x[0]) : mod; };
const PESO = { 'a favor': 1, parcial: 0.5, 'en contra': 0 };

function crearConsejo({ cfg, bus, sesiones, proveedores, generarJSON }) {
  const dir = path.join(cfg.dir, 'consejos');
  const vivos = new Map();                                         // id → { r, ctl }
  const c = () => cfg.consejo || {};
  const alias = m => cfg.alias?.[String(m).toLowerCase()] || String(m).trim();

  // ¿se puede usar este modelo en este equipo? (sin respaldo: un miembro que no está NO se cambia por otro)
  function disponible(modelo) {
    try {
      const prov = String(modelo).split('/')[0];
      if (proveedores.listos?.()[prov] === false) return { ok: false, motivo: 'no está disponible en este equipo (sin key, sin sesión o sin instalar)' };
      proveedores.resolver(modelo, { sinRespaldo: true });
      return { ok: true };
    } catch (e) { return { ok: false, motivo: e.message }; }
  }
  const miembrosPorDefecto = () => (c().miembros?.length ? c().miembros : POR_DEFECTO).map(alias);
  // los que se convocan si no se elige: los de la config que estén listos (sin repetir)
  function candidatos() {
    return [...new Set(miembrosPorDefecto())].map(m => ({ modelo: m, ...disponible(m) }));
  }

  const guardar = r => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${r.id}.json`), JSON.stringify(r, null, 2));
      const fs0 = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();                     // guarda los últimos 60
      for (const f of fs0.slice(0, Math.max(0, fs0.length - 60))) fs.unlinkSync(path.join(dir, f));
    } catch { }
  };
  const foto = r => JSON.parse(JSON.stringify(r));
  function emitir(r, fase, extra = {}, alEvento) {
    const e = { tipo: 'consejo', fase, id: r.id, consejo: foto(r), ...extra };
    bus.emit('evento', e);
    try { alEvento?.(e); } catch { }
  }
  // eventos de sesión normales (inicio/texto/fin/error) → Mission Control pinta cada miembro como una tarjeta viva
  const evSesion = (s, tipo, datos = {}) => bus.emit('evento', { tipo, sesion: s.id, ...datos });

  async function preguntar(m, s, mensajes, signal) {
    const { api, model } = proveedores.resolver(m.modelo, { sinRespaldo: true });
    const sys = SISTEMA_MIEMBRO(etiqueta(m.modelo));
    let r = await api.chat({ model, system: sys, mensajes, herramientas: [], signal });
    if (!r.texto?.trim()) {                                         // modelos que "piensan" y no contestan: se pide una vez más
      const r2 = await api.chat({ model, system: sys, mensajes: [...mensajes, { role: 'user', content: '(Escribe ya tu respuesta, breve.)' }], herramientas: [], signal });
      r = { ...r2, uso: { entrada: (r.uso?.entrada || 0) + (r2.uso?.entrada || 0), salida: (r.uso?.salida || 0) + (r2.uso?.salida || 0) } };
    }
    if (!r.texto?.trim()) throw new Error('respuesta vacía');
    s.uso.entrada += r.uso?.entrada || 0; s.uso.salida += r.uso?.salida || 0;
    return r.texto.trim();
  }

  // un turno de un miembro (respuesta inicial o ronda de debate) con su tiempo límite; si falla queda ausente
  async function turno(r, m, contenido, ronda, signal, alEvento) {
    const s = sesiones.obtener(m.sesion);
    const ms0 = Date.now();
    m.estado = 'pensando'; m.ronda = ronda;
    evSesion(s, 'inicio', { modelo: m.modelo });
    emitir(r, 'miembro', { modelo: m.modelo }, alEvento);
    sesiones.agregar(s, { role: 'user', content: contenido, t: Date.now() });
    const tope = AbortSignal.timeout((c().timeoutSeg || 240) * 1000);
    try {
      const historial = s.mensajes.filter(x => x.role === 'user' || x.role === 'assistant').map(x => ({ role: x.role, content: x.content }));
      const texto = await preguntar(m, s, historial, AbortSignal.any([signal, tope]));
      sesiones.agregar(s, { role: 'assistant', content: texto, t: Date.now() });
      const postura = ronda > 0 ? ((texto.match(/POSTURA:\s*(mantengo|corrijo|matizo)/i) || [])[1] || '').toLowerCase() || 'matizo' : undefined;
      const limpio = ronda > 0 ? texto.replace(/^\s*\**POSTURA:[^\n]*\n?/i, '').trim() : texto;
      r.rondas[ronda].push({ modelo: m.modelo, texto: limpio, postura, ms: Date.now() - ms0 });
      m.estado = 'listo'; m.ultimo = limpio;
      evSesion(s, 'texto', { texto: limpio.slice(0, 300) });
      evSesion(s, 'fin', { texto: limpio, uso: { ...s.uso } });
      sesiones.guardarMeta(s);
      emitir(r, 'respuesta', { modelo: m.modelo, ronda }, alEvento);
    } catch (e) {
      const motivo = signal.aborted ? 'cancelado' : tope.aborted ? `sin respuesta en ${c().timeoutSeg || 240} s` : String(e.message || e).slice(0, 200);
      m.estado = signal.aborted ? 'cancelado' : 'ausente'; m.motivo = motivo;
      evSesion(s, 'error', { error: signal.aborted ? 'cancelado' : `ausente: ${motivo}` });
      sesiones.guardarMeta(s);
      emitir(r, 'miembro', { modelo: m.modelo }, alEvento);
    }
  }

  // la respuesta FINAL de cada miembro presente (la de su última ronda)
  function finales(r) {
    const out = [];
    for (const m of r.miembros) {
      if (m.estado !== 'listo') continue;
      for (let i = r.rondas.length - 1; i >= 0; i--) { const x = r.rondas[i].find(y => y.modelo === m.modelo); if (x) { out.push(x); break; } }
    }
    return out;
  }

  async function moderar(r, signal) {
    const fin = finales(r);
    const prompt = `PREGUNTA:\n${r.pregunta}\n\n` + fin.map(x => `### ${x.modelo}${x.postura ? ` (postura: ${x.postura})` : ''}\n${x.texto}`).join('\n\n') +
      (r.miembros.some(m => m.estado === 'ausente') ? `\n\nAusentes (no votan): ${r.miembros.filter(m => m.estado === 'ausente').map(m => m.modelo).join(', ')}` : '');
    const orden = [...new Set([r.moderador, ...fin.map(x => x.modelo)].filter(Boolean))];     // si el moderador falla, modera otro presente
    let ultimo = '';
    for (const mod of orden) {
      if (!disponible(mod).ok) continue;
      try {
        const { datos } = await generarJSON({ modelo: mod, system: SISTEMA_MODERADOR, prompt, schema: ESQUEMA, signal: AbortSignal.any([signal, AbortSignal.timeout((c().timeoutSeg || 240) * 1000)]) });
        // votos: solo de miembros presentes, con su nombre exacto; los que el moderador olvidó cuentan como "parcial"
        const votos = fin.map(x => {
          const v = (datos.votos || []).find(y => y.modelo === x.modelo) || (datos.votos || []).find(y => etiqueta(y.modelo) === etiqueta(x.modelo) || String(y.modelo).includes(etiqueta(x.modelo)));
          return { modelo: x.modelo, voto: v?.voto || 'parcial', motivo: String(v?.motivo || 'sin motivo').slice(0, 300) };
        });
        const calculado = votos.length ? Math.round(votos.reduce((a, v) => a + PESO[v.voto], 0) / votos.length * 100) : 0;
        const acuerdo = Number.isFinite(+datos.acuerdo) ? Math.round((Math.max(0, Math.min(100, +datos.acuerdo)) + calculado) / 2) : calculado;
        return { respuesta: String(datos.respuesta), votos, acuerdo, titular: String(datos.titular || '').slice(0, 140), moderador: mod };
      } catch (e) { if (signal.aborted) throw e; ultimo = e.message; }
    }
    // sin moderador posible: gana la respuesta más completa y nadie vota
    const mejor = fin.slice().sort((a, b) => b.texto.length - a.texto.length)[0];
    return { respuesta: mejor ? mejor.texto : '(ningún miembro respondió)', votos: [], acuerdo: 0, titular: '', moderador: null, aviso: `sin moderador: ${ultimo || 'ninguno disponible'}` };
  }

  const textoVeredicto = r => {
    const v = r.veredicto; if (!v) return r.error || '(sin veredicto)';
    const sim = { 'a favor': '✅', parcial: '🟡', 'en contra': '❌' };
    const pres = r.miembros.filter(m => m.estado === 'listo').length;
    return `🏛️ **Consejo de ${pres} modelo${pres === 1 ? '' : 's'}** · acuerdo ${v.acuerdo}%${v.titular ? `\n_${v.titular}_` : ''}\n\n${v.respuesta}` +
      (v.votos.length ? `\n\n**Votos:** ${v.votos.map(x => `${sim[x.voto] || '·'} ${etiqueta(x.modelo)}`).join(' · ')}` : '') +
      (r.miembros.some(m => m.estado === 'ausente') ? `\n**Ausentes:** ${r.miembros.filter(m => m.estado === 'ausente').map(m => etiqueta(m.modelo)).join(', ')}` : '');
  };

  // pregunta → respuestas en paralelo → rondas de debate → veredicto.  alSesion(s) se llama ANTES del primer await
  async function consultar({ pregunta, miembros, rondas, moderador, signal, alEvento, alSesion, origen } = {}) {
    pregunta = String(pregunta || '').trim();
    if (!pregunta) throw new Error('falta la pregunta');
    const max = c().max || 6;
    let lista = (Array.isArray(miembros) && miembros.length ? miembros : typeof miembros === 'string' && miembros.trim() ? miembros.split(/[,\s]+/) : null);
    lista = lista ? [...new Set(lista.map(alias).filter(Boolean))] : candidatos().filter(x => x.ok).map(x => x.modelo);
    if (lista.length > max) lista = lista.slice(0, max);
    if (!lista.length) throw new Error('no hay ningún modelo disponible para el consejo (configura cfg.consejo.miembros)');
    const nRondas = Math.max(0, Math.min(3, Number.isFinite(+rondas) ? +rondas : (c().rondas ?? 1)));
    const ctl = new AbortController();
    const parar = () => ctl.abort(new Error('cancelado'));
    signal?.addEventListener('abort', parar, { once: true });

    const id = `c${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
    const s0 = sesiones.crear({ modelo: alias(moderador || c().moderador || lista[0]), canal: 'consejo', titulo: `Consejo: ${pregunta.slice(0, 60)}`, nombreAgente: 'Consejo' });
    s0.consejo = id; sesiones.guardarMeta(s0);
    const r = {
      id, pregunta, creado: Date.now(), fin: 0, estado: 'trabajando', sesion: s0.id, rondasPedidas: nRondas, origen: origen || undefined,
      moderador: s0.modelo, miembros: [], rondas: [[]], veredicto: null,
    };
    for (const m of lista) {
      const s = sesiones.crear({ modelo: m, cwd: s0.cwd, canal: 'consejo', titulo: `Consejo · ${etiqueta(m)}`, padre: s0.id, nombreAgente: etiqueta(m) });
      const d = disponible(m);
      r.miembros.push({ modelo: m, sesion: s.id, estado: d.ok ? 'esperando' : 'ausente', motivo: d.ok ? undefined : d.motivo });
    }
    vivos.set(id, { r, ctl });
    try { alSesion?.(s0, r); } catch { }
    sesiones.agregar(s0, { role: 'user', content: pregunta, t: Date.now() });
    evSesion(s0, 'inicio', { modelo: s0.modelo });
    for (const m of r.miembros.filter(x => x.estado === 'ausente')) { const s = sesiones.obtener(m.sesion); evSesion(s, 'inicio', { modelo: m.modelo }); evSesion(s, 'error', { error: `ausente: ${m.motivo}` }); }
    emitir(r, 'inicio', {}, alEvento);
    guardar(r);
    try {
      // ronda 0: todos a la vez
      await Promise.all(r.miembros.filter(m => m.estado === 'esperando').map(m => turno(r, m, pregunta, 0, ctl.signal, alEvento)));
      guardar(r);
      // rondas de debate: cada uno ve lo que dijeron los OTROS en la ronda anterior (necesita al menos 2 presentes)
      for (let k = 1; k <= nRondas && !ctl.signal.aborted; k++) {
        const previas = r.rondas[k - 1];
        const presentes = r.miembros.filter(m => m.estado === 'listo' && previas.some(x => x.modelo === m.modelo));
        if (presentes.length < 2) break;
        r.rondas.push([]);
        emitir(r, 'ronda', { ronda: k }, alEvento);
        await Promise.all(presentes.map(m => {
          const otras = previas.filter(x => x.modelo !== m.modelo).map(x => `### ${etiqueta(x.modelo)}\n${x.texto}`).join('\n\n');
          return turno(r, m, PROMPT_DEBATE(otras, k), k, ctl.signal, alEvento);
        }));
        guardar(r);
      }
      if (ctl.signal.aborted) throw new Error('cancelado');
      if (!r.miembros.some(m => m.estado === 'listo')) throw new Error(`ningún miembro respondió (${r.miembros.map(m => `${etiqueta(m.modelo)}: ${m.motivo || m.estado}`).join('; ')})`);
      r.fase = 'votando'; emitir(r, 'votando', {}, alEvento);
      r.veredicto = await moderar(r, ctl.signal);
      if (r.veredicto.moderador) r.moderador = r.veredicto.moderador;
      r.estado = 'listo'; r.fin = Date.now(); r.fase = undefined;
      const texto = textoVeredicto(r);
      sesiones.agregar(s0, { role: 'assistant', content: texto, t: Date.now() });
      evSesion(s0, 'texto', { texto: texto.slice(0, 300) });
      evSesion(s0, 'fin', { texto, uso: { ...s0.uso } });
      sesiones.guardarMeta(s0);
      emitir(r, 'veredicto', {}, alEvento);
      return { ...foto(r), texto };
    } catch (e) {
      r.estado = ctl.signal.aborted ? 'cancelado' : 'error'; r.error = e.message; r.fin = Date.now(); r.fase = undefined;
      evSesion(s0, 'error', { error: e.message });
      sesiones.guardarMeta(s0);
      throw e;
    } finally {
      signal?.removeEventListener('abort', parar);
      vivos.delete(id); guardar(r);
      emitir(r, 'fin', {}, alEvento);
    }
  }

  function cancelar(id) {   // por id del consejo, de su sesión o de la sesión de un miembro
    const v = vivos.get(id) || [...vivos.values()].find(x => x.r.sesion === id || x.r.miembros.some(m => m.sesion === id)); if (!v) return false; v.ctl.abort(new Error('cancelado')); return true; }
  function historial(limite = 20) {
    try {
      return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, limite)
        .map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { id: r.id, pregunta: r.pregunta, creado: r.creado, estado: r.estado, acuerdo: r.veredicto?.acuerdo, miembros: r.miembros.map(m => ({ modelo: m.modelo, estado: m.estado })) }; } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }
  function obtener(id) {
    if (vivos.has(id)) return foto(vivos.get(id).r);
    if (!/^c[a-z0-9]{6,20}$/.test(String(id))) return null;
    try { return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')); } catch { return null; }
  }
  return { consultar, cancelar, historial, obtener, candidatos, textoVeredicto, enCurso: () => [...vivos.values()].map(v => foto(v.r)) };
}

// herramienta del agente (se registra desde index.js; usa ctx.consejo)
const HERRAMIENTA = {
  nombre: 'consultar_consejo', riesgo: 'lectura',
  descripcion: 'Convoca un CONSEJO de varios modelos de IA (Claude, ChatGPT, Gemini, modelos locales…): todos responden a la pregunta en paralelo, ' +
    'debaten viendo las respuestas de los demás y un moderador da el veredicto con votos y % de acuerdo. Úsalo para preguntas difíciles, ' +
    'decisiones u opiniones donde conviene contrastar, o cuando el usuario lo pida ("pregúntale al consejo", "que debatan las IAs").',
  parametros: {
    type: 'object',
    properties: {
      pregunta: { type: 'string', description: 'la pregunta completa, con todo el contexto necesario (los miembros no ven esta conversación)' },
      miembros: { type: 'array', items: { type: 'string' }, description: 'opcional: alias o proveedor/modelo; por defecto los disponibles de la configuración' },
      rondas: { type: 'number', description: 'opcional: rondas de debate (0-3, por defecto 1)' },
    },
    required: ['pregunta'],
  },
  resumen: a => `${String(a.pregunta || '').slice(0, 120)}${a.miembros?.length ? ` (${[].concat(a.miembros).join(', ')})` : ''}`,
  ejecutar: async (a, ctx) => {
    if (!ctx.consejo) return 'error: el consejo no está disponible aquí';
    const r = await ctx.consejo.consultar({ pregunta: a.pregunta, miembros: a.miembros, rondas: a.rondas, signal: ctx.signal, origen: ctx.sesion?.id });
    return r.texto;
  },
};

module.exports = { crearConsejo, HERRAMIENTA, POR_DEFECTO, etiqueta };
