// Fases de sueño de la memoria (tarea interna nocturna, cfg.memoria.sueno { hora: '04:00', activo: false } — apagado hasta que el usuario lo pruebe con su memoria real).
//   ligera  : fusiona recuerdos casi iguales (Jaccard de raíces + coseno de los vectores) y caduca 'hecho' viejos que nunca se usaron
//   REM     : el modelo (el del cerebro o el por defecto, nunca el plan de Claude salvo que lo elijas) conecta recuerdos →
//             patrones nuevos (tipo 'patron', origen 'sueño') + entidades/relaciones para el grafo (incremental)
//   profunda: reescribe/condensa el perfil sin perder datos (si se pierde un nombre o un número, se queda el perfil de antes)
// Antes de tocar nada copia memoria.json a <dir>/suenos/<id>.memoria.bak.json (se guardan 14) → deshacer(id) lo devuelve.
// Informe: <dir>/suenos/<id>.json { fusionados, olvidados, nuevos, perfilAntes, perfilDespues, resumen "esta noche aprendí…" }
// y aviso (bus 'aviso-externo', no urgente) a la hora del briefing de la mañana.
const fs = require('fs');
const path = require('path');
const { parecido, tokens, normal } = require('./memoria');
const { coseno } = require('./vectores');

const DEF = { hora: '04:00', activo: false, caducarDias: 120, jaccard: 0.6, coseno: 0.92, cosenoJaccard: 0.35, maxREM: 60, maxPatrones: 5, guardar: 14 };
const pad = n => String(n).padStart(2, '0');
const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutos = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : null; };

// datos "duros" de un texto: números y palabras con mayúscula (nombres propios). La fase profunda no puede perder ninguno.
function datosDuros(texto) {
  const s = new Set();
  for (const m of String(texto).matchAll(/\d+(?:[.,:]\d+)*/g)) s.add(m[0]);
  for (const m of String(texto).matchAll(/[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.-]+/g)) {
    const antes = String(texto).slice(0, m.index).trimEnd();
    const abreFrase = !antes || /[.!?:;\-–•]$/.test(antes);
    if (abreFrase && !/[A-ZÁÉÍÓÚÑ0-9]/.test(m[0].slice(1))) continue;          // "Tiene…" al empezar frase no es un nombre (salvo SIGLAS/CamelCase)
    const w = normal(m[0]).replace(/[.-]+$/, ''); if (w.length > 1) s.add(w);
  }
  return s;
}
// palabras que abren frase y no son nombres (para no exigirlas al condensar)
const COMUNES = new Set(tokens('tiene vive prefiere usa trabaja quiere le gusta su sus es esta está son hace lleva habla escribe se llama the has likes prefers uses lives works').concat(['el', 'la', 'los', 'las', 'su', 'sus', 'es', 'le', 'se', 'un', 'una', 'en', 'de', 'tu', 'mi', 'si', 'no', 'y']));

function crearSueno({ cfg, bus, memoria, grafo, generarJSON, modelo, registro, horaBriefing, tareas }) {
  const dir = path.join(cfg.dir, 'suenos');
  const conf = () => ({ ...DEF, ...(cfg.memoria?.sueno || {}) });
  const log = (nivel, t) => registro?.add?.(nivel, 'sueño', t);
  const emitir = (fase, extra = {}) => bus?.emit('evento', { tipo: 'sueno', fase, ...extra });
  let enCurso = null;

  const rutaInf = id => path.join(dir, `${id}.json`);
  const leer = id => { if (!/^[\w-]{6,40}$/.test(String(id))) return null; try { return JSON.parse(fs.readFileSync(rutaInf(id), 'utf8')); } catch { return null; } };
  const guardarInf = i => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(rutaInf(i.id), JSON.stringify(i, null, 2)); };
  function informes(limite = 30) {
    try {
      return fs.readdirSync(dir).filter(f => /^[\w-]+\.json$/.test(f) && !f.endsWith('.bak.json')).map(f => leer(f.slice(0, -5))).filter(Boolean)
        .sort((a, b) => b.inicio - a.inicio).slice(0, limite);
    } catch { return []; }
  }

  // copia de seguridad antes de tocar; se guardan las últimas N
  function copiar(id) {
    fs.mkdirSync(dir, { recursive: true });
    const origen = path.join(cfg.dir, 'memoria.json'), destino = path.join(dir, `${id}.memoria.bak.json`);
    if (fs.existsSync(origen)) fs.copyFileSync(origen, destino); else fs.writeFileSync(destino, '[]');
    const baks = fs.readdirSync(dir).filter(f => f.endsWith('.memoria.bak.json')).map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of baks.slice(conf().guardar)) try { fs.unlinkSync(path.join(dir, x.f)); } catch { }
    return path.basename(destino);
  }
  // deshacer una noche: vuelve memoria.json a como estaba antes de ese sueño
  function deshacer(id) {
    const f = path.join(dir, `${id}.memoria.bak.json`);
    if (!/^[\w-]{6,40}$/.test(String(id)) || !fs.existsSync(f)) throw Object.assign(new Error('no hay copia de esa noche'), { status: 404 });
    const datos = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.writeFileSync(path.join(cfg.dir, 'memoria.json'), JSON.stringify(datos, null, 2));
    memoria.indexar?.().catch?.(() => { });
    const i = leer(id); if (i) { i.deshecho = Date.now(); guardarInf(i); }
    log('info', `sueño ${id} deshecho: memoria restaurada (${datos.length} recuerdos)`);
    emitir('deshecho', { id });
    return { ok: true, recuerdos: datos.length };
  }

  // ---------- fase ligera ----------
  async function faseLigera(inf) {
    const c = conf();
    if (memoria.indexar) await memoria.indexar().catch(() => { });
    const lista = memoria.lista().slice();
    const borrados = new Set();
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i]; if (borrados.has(a.id)) continue;
      const grupo = [a];
      for (let j = i + 1; j < lista.length; j++) {
        const b = lista[j];
        if (borrados.has(b.id) || b.tipo !== a.tipo) continue;
        const jac = parecido(a.texto, b.texto);
        const va = memoria.vector?.(a.id), vb = memoria.vector?.(b.id);
        const cos = va && vb ? coseno(va, vb) : 0;
        // casi iguales por palabras, o casi iguales por significado (y algo de palabras en común para no mezclar temas)
        if (jac >= c.jaccard || (cos >= c.coseno && jac >= c.cosenoJaccard)) { grupo.push(b); borrados.add(b.id); }
      }
      if (grupo.length < 2) continue;
      // se queda el más completo (más largo; a igualdad, el más reciente) y suma los usos de todos
      const queda = grupo.slice().sort((x, y) => y.texto.length - x.texto.length || y.actualizada - x.actualizada)[0];
      const resto = grupo.filter(x => x !== queda);
      for (const x of resto) memoria.olvidar(x.id);
      memoria.editar(queda.id, { usos: grupo.reduce((n, x) => n + (x.usos || 0), 0), fusionados: [...(queda.fusionados || []), ...resto.map(x => x.id)].slice(-20), actualizada: Math.max(...grupo.map(x => x.actualizada || 0)) });
      borrados.delete(queda.id);
      inf.fusionados.push({ queda: { id: queda.id, texto: queda.texto, tipo: queda.tipo }, borrados: resto.map(x => ({ id: x.id, texto: x.texto })) });
    }
    // caducar: hechos viejos que nunca se usaron (los que guardaste tú a mano o por la API no caducan)
    const limite = Date.now() - c.caducarDias * 86400_000;
    for (const m of memoria.lista().slice()) {
      if (m.tipo !== 'hecho' || (m.usos || 0) > 0 || (m.actualizada || m.creada || 0) > limite || /^(api|usuario|panel)$/.test(m.origen || '')) continue;
      memoria.olvidar(m.id);
      inf.olvidados.push({ id: m.id, texto: m.texto, motivo: `sin usar en ${c.caducarDias} días` });
    }
  }

  // ---------- fase REM ----------
  const ESQ_REM = {
    type: 'object', required: ['patrones', 'entidades', 'relaciones', 'aprendi'],
    properties: {
      patrones: { type: 'array', items: { type: 'object', required: ['texto', 'recuerdos'], properties: { texto: { type: 'string' }, recuerdos: { type: 'array', items: { type: 'string' } }, confianza: { type: 'number' } } } },
      entidades: { type: 'array', items: { type: 'object', required: ['nombre', 'tipo'], properties: { nombre: { type: 'string' }, tipo: { type: 'string', enum: ['persona', 'proyecto', 'lugar', 'cosa', 'herramienta'] }, recuerdos: { type: 'array', items: { type: 'string' } } } } },
      relaciones: { type: 'array', items: { type: 'object', required: ['de', 'a', 'tipo'], properties: { de: { type: 'string' }, a: { type: 'string' }, tipo: { type: 'string' }, recuerdos: { type: 'array', items: { type: 'string' } } } } },
      aprendi: { type: 'string' },
    },
  };
  async function faseREM(inf, signal) {
    const c = conf();
    const todos = memoria.lista();
    if (todos.length < 2) { inf.fases.rem = 'pocos recuerdos'; return; }
    // los que el grafo aún no ha procesado con el modelo + contexto reciente y patrones previos (para no repetirlos)
    const pend = grafo ? grafo.pendientesLLM(c.maxREM) : [];
    const ids = new Set(pend.map(m => m.id));
    const recientes = todos.slice().sort((a, b) => (b.actualizada || 0) - (a.actualizada || 0));
    for (const m of recientes) { if (ids.size >= c.maxREM) break; ids.add(m.id); }
    const sel = todos.filter(m => ids.has(m.id));
    const patrones = todos.filter(m => m.tipo === 'patron').slice(-15);
    const prompt = `RECUERDOS (id · tipo · texto):\n${sel.map(m => `${m.id} · ${m.tipo} · ${m.texto}`).join('\n')}\n\n` +
      (patrones.length ? `PATRONES QUE YA CONOCES (no los repitas):\n${patrones.map(m => `- ${m.texto}`).join('\n')}\n\n` : '') +
      `Tarea:\n1) patrones: conecta recuerdos DISTINTOS y deduce hasta ${c.maxPatrones} patrones o ideas NUEVAS y útiles sobre el usuario (hábitos, prioridades, cómo le gusta trabajar, relaciones entre sus proyectos). ` +
      `Cada uno en una frase en tercera persona, con los ids que lo apoyan (mínimo 2) y confianza 0-1. Nada inventado ni obvio; si no hay, lista vacía.\n` +
      `2) entidades: personas, proyectos, lugares, cosas y herramientas que aparecen (nombre canónico corto, tipo, ids de recuerdos donde salen). Al usuario llámalo "usuario".\n` +
      `3) relaciones entre entidades: {de, a, tipo (verbo corto: "trabaja en", "es amigo de", "usa", "está en", "es parte de"…), recuerdos}.\n` +
      `4) aprendi: UNA frase cálida, dicha por el asistente AL usuario (tuteándole: "eres", "te gusta"), que empiece por "Esta noche aprendí" y resuma lo más interesante (máx. 25 palabras, sin datos sensibles).`;
    const { datos } = await generarJSON({ modelo: modelo(), system: 'Eres la fase REM del sueño de un asistente: consolidas su memoria a largo plazo. Respondes en español.', prompt, schema: ESQ_REM, signal });
    const validos = new Set(todos.map(m => m.id));
    for (const p of (datos.patrones || []).slice(0, c.maxPatrones)) {
      const apoyos = (p.recuerdos || []).filter(id => validos.has(id));
      if ((p.confianza ?? 1) < 0.55 || apoyos.length < 2 || !String(p.texto || '').trim()) continue;
      try {
        const r = memoria.recordar({ texto: String(p.texto).slice(0, 400), tipo: 'patron', origen: 'sueño' });
        if (r.accion === 'creada') inf.nuevos.push({ id: r.id, texto: r.texto, apoyos });
      } catch { }
    }
    if (grafo) {
      const r = grafo.incorporar({ entidades: datos.entidades, relaciones: datos.relaciones }, sel.map(m => m.id));
      inf.grafo = { ...inf.grafo, nuevas: r.nuevas, relaciones: r.relaciones };
    }
    inf.frase = String(datos.aprendi || '').trim().slice(0, 300);
  }

  // ---------- fase profunda ----------
  const ESQ_PERFIL = { type: 'object', required: ['perfil'], properties: { perfil: { type: 'array', items: { type: 'string' } }, notas: { type: 'string' } } };
  async function faseProfunda(inf, signal) {
    const perfil = memoria.lista().filter(m => m.tipo === 'perfil');
    inf.perfilAntes = perfil.map(m => m.texto);
    inf.perfilDespues = inf.perfilAntes;
    if (perfil.length < 2) { inf.fases.profunda = 'nada que condensar'; return; }
    const prompt = `PERFIL ACTUAL DEL USUARIO (va siempre en el contexto del asistente, cada línea es un recuerdo):\n${perfil.map(m => `- ${m.texto}`).join('\n')}\n\n` +
      'Reescríbelo condensado: une lo repetido, ordena de lo más a lo menos importante, frases cortas en tercera persona (máx. 300 caracteres cada una, máx. 8 líneas). ' +
      'PROHIBIDO perder datos: conserva TODOS los nombres propios, números, lugares, fechas y preferencias tal cual. No inventes nada.';
    const { datos } = await generarJSON({ modelo: modelo(), system: 'Eres la fase de sueño profundo de un asistente: condensas el perfil del usuario sin perder información. Respondes en español.', prompt, schema: ESQ_PERFIL, signal });
    const nuevo = (datos.perfil || []).map(t => String(t).trim()).filter(Boolean).map(t => t.slice(0, 600)).slice(0, 10);
    if (!nuevo.length) { inf.fases.profunda = 'el modelo devolvió un perfil vacío: se queda el de antes'; return; }
    // verificación: ningún dato duro (número o nombre propio) del perfil viejo puede desaparecer
    const viejo = new Set(); for (const t of inf.perfilAntes) for (const d of datosDuros(t)) if (!COMUNES.has(d)) viejo.add(d);
    const textoNuevo = normal(nuevo.join(' \n '));
    const perdidos = [...viejo].filter(d => !textoNuevo.includes(normal(d)));
    if (perdidos.length) { inf.fases.profunda = `rechazado: se perdían ${perdidos.slice(0, 6).join(', ')}`; inf.perfilRechazado = nuevo; return; }
    if (nuevo.join('\n') === inf.perfilAntes.join('\n')) { inf.fases.profunda = 'sin cambios'; return; }
    const usos = perfil.reduce((n, m) => n + (m.usos || 0), 0);
    for (const m of perfil) memoria.olvidar(m.id);
    const creados = [];
    for (const t of nuevo) { try { const r = memoria.recordar({ texto: t, tipo: 'perfil', origen: 'sueño', nuevo: true }); creados.push(r.id); } catch { } }
    if (creados[0]) memoria.editar(creados[0], { usos });
    inf.perfilDespues = memoria.lista().filter(m => m.tipo === 'perfil').map(m => m.texto);
    inf.perfilCambiado = true;
  }

  // ---------- una noche completa ----------
  async function dormir({ motivo = 'manual', signal } = {}) {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const ahora = new Date();
      let id = fechaLocal(ahora); if (fs.existsSync(rutaInf(id))) id = `${id}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
      const inf = { id, fecha: fechaLocal(ahora), inicio: Date.now(), fin: 0, motivo, modelo: modelo(), fases: {}, fusionados: [], olvidados: [], nuevos: [], perfilAntes: [], perfilDespues: [], perfilCambiado: false,
        grafo: {}, frase: '', resumen: '', errores: [], recuerdosAntes: memoria.lista().length, entregado: motivo === 'manual' ? Date.now() : null };
      inf.backup = copiar(id);
      emitir('inicio', { id });
      log('info', `empieza el sueño (${motivo}) con ${inf.recuerdosAntes} recuerdos`);
      const fase = async (nombre, fn) => {
        emitir('fase', { id, nombre });
        const t0 = Date.now();
        try { await fn(inf, signal); if (!inf.fases[nombre]) inf.fases[nombre] = `ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`; }
        catch (e) { inf.fases[nombre] = `error: ${e.message}`; inf.errores.push(`${nombre}: ${e.message}`); log('aviso', `fase ${nombre}: ${e.message}`); }
      };
      await fase('ligera', faseLigera);
      await fase('rem', faseREM);
      await fase('profunda', faseProfunda);
      if (grafo) { try { grafo.actualizar(); inf.grafo = { ...inf.grafo, ...grafo.resumen() }; } catch { } }
      inf.recuerdosDespues = memoria.lista().length;
      inf.fin = Date.now();
      inf.resumen = resumir(inf);
      guardarInf(inf);
      emitir('fin', { id, resumen: inf.resumen });
      log('info', inf.resumen.split('\n')[0]);
      return inf;
    })().finally(() => { enCurso = null; });
    return enCurso;
  }
  function resumir(i) {
    const n = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
    const partes = [];
    if (i.fusionados.length) partes.push(`fusioné ${n(i.fusionados.reduce((s, f) => s + f.borrados.length, 0), 'recuerdo repetido', 'recuerdos repetidos')}`);
    if (i.olvidados.length) partes.push(`dejé ir ${n(i.olvidados.length, 'dato viejo', 'datos viejos')} sin usar`);
    if (i.nuevos.length) partes.push(`descubrí ${n(i.nuevos.length, 'patrón nuevo', 'patrones nuevos')}`);
    if (i.perfilCambiado) partes.push(`condensé tu perfil (${i.perfilAntes.length} → ${i.perfilDespues.length} líneas)`);
    if (i.grafo?.nuevas) partes.push(`conecté ${n(i.grafo.nuevas, 'cosa nueva', 'cosas nuevas')} en el grafo`);
    const cab = i.frase && /^esta noche/i.test(i.frase) ? i.frase : `Esta noche ${partes.length ? partes.join(', ') : 'ordené la memoria y todo estaba en su sitio'}.`;
    const det = [cab];
    if (i.frase && cab !== i.frase) det.push(i.frase);
    else if (partes.length) det.push(`(${partes.join(' · ')})`);
    for (const p of i.nuevos.slice(0, 3)) det.push(`• ${p.texto}`);
    if (i.errores.length) det.push(`⚠ ${i.errores.join(' · ')}`);
    return det.join('\n');
  }

  // ---------- tarea interna + entrega por la mañana ----------
  function textoAviso(i) { return `🌙 **Sueño de la memoria** — ${i.resumen}`.slice(0, 2500); }
  function momentoEntrega(i) {
    const h = minutos(horaBriefing?.()) ?? minutos('08:00');
    const d = new Date(i.inicio); d.setHours(Math.floor(h / 60), h % 60, 0, 0);
    if (d.getTime() <= i.inicio) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function revisarEntregas() {
    for (const i of informes(5)) {
      if (i.entregado || i.deshecho) continue;
      if (Date.now() < momentoEntrega(i)) continue;
      i.entregado = Date.now(); guardarInf(i);
      if (Date.now() - i.fin < 36 * 3600_000) bus?.emit('aviso-externo', { texto: textoAviso(i), urgente: false, origen: 'Sueño' });
    }
  }
  // crea / ajusta / quita la tarea programada según cfg.memoria.sueno
  function programar() {
    if (!tareas) return null;
    const c = conf(), m = minutos(c.hora) ?? minutos(DEF.hora);
    const cron = `${m % 60} ${Math.floor(m / 60)} * * *`;
    const ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === 'sueno');
    if (c.activo === false) { if (ya) tareas.borrar(ya.id); return null; }
    if (ya && ya.cuando?.cron === cron) return ya;
    if (ya) tareas.borrar(ya.id);
    return tareas.crear({ nombre: 'Sueño de la memoria', cuando: { cron }, accion: { tipo: 'interna', nombre: 'sueno' }, canal: 'isla' });
  }
  let reloj = null;
  function iniciar() { if (!reloj) { reloj = setInterval(() => { try { revisarEntregas(); } catch { } }, 60_000); reloj.unref?.(); } }
  function detener() { clearInterval(reloj); reloj = null; }
  function configurar(cambios = {}) {
    const f = path.join(cfg.dir, 'config.json');
    let disco = {}; try { disco = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
    const s = { ...(cfg.memoria?.sueno || {}) };
    if (typeof cambios.activo === 'boolean') s.activo = cambios.activo;
    if (typeof cambios.hora === 'string' && minutos(cambios.hora) !== null) s.hora = cambios.hora;
    cfg.memoria = { ...(cfg.memoria || {}), sueno: s };
    disco.memoria = { ...(disco.memoria || {}), sueno: s };
    fs.writeFileSync(f, JSON.stringify(disco, null, 2));
    programar();
    return conf();
  }

  return { dormir, deshacer, informes, leer, revisarEntregas, programar, iniciar, detener, configurar, conf, enCurso: () => !!enCurso, datosDuros };
}

module.exports = { crearSueno, datosDuros, fechaLocal };
