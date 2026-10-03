// FASE 6 · Reuniones: APOLO toma notas, resume y saca tareas. Dos capturas:
//   - 'navegador': subtítulos en vivo de Google Meet / Teams web / Zoom web leídos del DOM por la extensión (sin audio, ligero).
//     La extensión manda {bloque, hablante, texto, t} por POST /v1/navegador/reunion; aquí se deduplican las actualizaciones
//     parciales (los subtítulos se reescriben mientras la persona habla) con fusionar().
//   - 'audio': micrófono ("yo") + audio del sistema por loopback ("ellos") en trozos de 30 s (so.lanzarGrabadora → grabar.ps1),
//     cola serie → whisper (bus 'transcribir-audio' que atiende main.js con transcribirArchivo) → segmentos con marca de tiempo.
// Al parar: resumen con generarJSON (modelo barato) {resumen, decisiones[], tareas[{quien,que,cuando?}], preguntasAbiertas[], temas[]}.
// Se guarda en <nucleo>/reuniones/<id>.json; el resumen entra en la memoria (origen 'reunión') y en la línea de tiempo.
// NUNCA empieza sola: la pide el usuario (panel, agente, tarea programada) o una regla suya ("siempre en Meet").
const fs = require('fs');
const path = require('path');

const ESQUEMA = { type: 'object', properties: {
  resumen: { type: 'string' },
  decisiones: { type: 'array', items: { type: 'string' } },
  tareas: { type: 'array', items: { type: 'object', properties: { quien: { type: 'string' }, que: { type: 'string' }, cuando: { type: 'string' } }, required: ['que'] } },
  preguntasAbiertas: { type: 'array', items: { type: 'string' } },
  temas: { type: 'array', items: { type: 'string' } },
}, required: ['resumen', 'decisiones', 'tareas', 'preguntasAbiertas', 'temas'] };

// frases que whisper se inventa con silencio o ruido
const ALUCINACION = /^(¡?gracias( por ver(lo)?| a todos)?[.!]*|subt[ií]tulos (realizados )?por la comunidad de amara\.org|thanks for watching[.!]*|\.+|…|música|\[m[uú]sica\]|suscr[ií]bete.*)$/i;
const PLATAFORMAS = [['meet', /meet\.google\.com/i], ['teams', /teams\.(microsoft|live)\.com/i], ['zoom', /zoom\.(us|com)\/(wc|j)\//i]];
const plataformaDe = url => (PLATAFORMAS.find(([, r]) => r.test(String(url || ''))) || [null])[0];
const err = (m, status = 400) => Object.assign(new Error(m), { status });

// ---------- deduplicado de subtítulos parciales ----------
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
// une la versión anterior de un mismo bloque de subtítulos con la nueva
function combinar(viejo, nuevo) {
  if (!viejo) return nuevo;
  const a = norm(viejo), b = norm(nuevo);
  if (a === b) return nuevo;                                                  // misma frase (quizá con otra puntuación)
  if (b.includes(a)) return nuevo;                                            // creció
  if (a.includes(b)) return viejo;                                            // trozo que ya teníamos
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p >= Math.min(a.length, b.length) * 0.5 && p >= 3) return nuevo;      // reescrito el final (corrección)
  // al bloque largo le quitaron el principio: buscar el arranque del nuevo dentro del viejo
  // (la cola más larga del viejo que sea el principio del nuevo)
  const pal = String(nuevo).trim().split(/\s+/), pv = String(viejo).trim().split(/\s+/);
  for (let i = 1; i < pv.length; i++) { const cola = norm(pv.slice(i).join(' ')); if (cola.length >= 6 && b.startsWith(cola)) return `${pv.slice(0, i).join(' ')} ${String(nuevo).trim()}`; }
  if (norm(pal[0]) && norm(pal[0]) === norm(String(viejo).trim().split(/\s+/)[0])) return nuevo;   // misma arrancada → corrección
  return `${String(viejo).trim()} ${String(nuevo).trim()}`;
}
// mete una actualización en la lista de segmentos: mismo bloque → se actualiza; sin bloque → último del mismo hablante si encaja
function fusionar(segs, e, { ventanaMs = 15_000 } = {}) {
  const texto = String(e.texto || '').replace(/\s+/g, ' ').trim();
  if (!texto) return null;
  const hablante = String(e.hablante || '').trim() || 'Desconocido';
  let s = null;
  if (e.bloque) { for (let i = segs.length - 1; i >= Math.max(0, segs.length - 40); i--) if (segs[i].bloque === e.bloque) { s = segs[i]; break; } }
  else {
    const u = segs[segs.length - 1];
    if (u && !u.bloque && u.hablante === hablante && (e.t ?? 0) - (u.tFin ?? u.t) <= ventanaMs) {
      const a = norm(u.texto), b = norm(texto);
      if (b.startsWith(a.slice(0, Math.max(3, Math.floor(a.length * 0.5)))) || a.startsWith(b) || b.includes(a)) s = u;
    }
  }
  if (s) {
    const nuevo = combinar(s.texto, texto);
    if (nuevo === s.texto && s.hablante === hablante) return null;
    s.texto = nuevo; if (e.hablante) s.hablante = hablante; s.tFin = e.t ?? s.tFin;
    return s;
  }
  s = { t: e.t ?? 0, tFin: e.t ?? 0, hablante, texto, fuente: 'subtitulos', ...(e.bloque ? { bloque: e.bloque } : {}) };
  segs.push(s);
  return s;
}

// fecha de una tarea ("2026-10-07", "2026-10-07T15:00", "mañana", texto libre…) → ms; si no se entiende o ya pasó → mañana 9:00
function fechaTarea(cuando, ahora = Date.now()) {
  const manana = () => { const d = new Date(ahora); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };
  const c = String(cuando || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) { const [y, m, d] = c.split('-').map(Number); const t = new Date(y, m - 1, d, 9, 0, 0).getTime(); return t > ahora ? t : manana(); }
  const t = Date.parse(c);
  return !isNaN(t) && t > ahora ? t : manana();
}
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function crearReuniones({ cfg, bus, navegador, generarJSON, modelo, tareas, memoria, lanzarGrabadora, transcribir, ahora = () => Date.now() }) {
  const dir = path.join(cfg.dir, 'reuniones');
  const fConf = path.join(dir, '_config.json');
  const POR_DEFECTO = { siempreMeet: false, trozoSeg: 30, guardarAudio: false, umbralSilencio: 0.004, modelo: '', avisoLegal: false };
  const conf = () => { let c = {}; try { c = JSON.parse(fs.readFileSync(fConf, 'utf8')); } catch { } return { ...POR_DEFECTO, ...(cfg.reuniones || {}), ...c }; };
  function configurar(b = {}) {
    const c = conf(), n = {};
    for (const k of Object.keys(POR_DEFECTO)) if (b[k] !== undefined) n[k] = typeof POR_DEFECTO[k] === 'boolean' ? !!b[k] : typeof POR_DEFECTO[k] === 'number' ? Number(b[k]) || POR_DEFECTO[k] : String(b[k]);
    fs.mkdirSync(dir, { recursive: true });
    const g = { ...(() => { try { return JSON.parse(fs.readFileSync(fConf, 'utf8')); } catch { return {}; } })(), ...n };
    fs.writeFileSync(fConf, JSON.stringify(g, null, 2));
    return { ...c, ...n };
  }
  const archivo = id => path.join(dir, `${String(id).replace(/[^\w-]/g, '')}.json`);
  const leer = id => { try { return JSON.parse(fs.readFileSync(archivo(id), 'utf8')); } catch { return null; } };
  const guardar = r => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(archivo(r.id), JSON.stringify(r, null, 1)); };
  const emitir = (accion, r, extra = {}) => {
    bus.emit('evento', { tipo: 'reunion', accion, id: r.id, titulo: r.titulo, fuente: r.fuente, estado: r.estado, ...extra });
    bus.emit('reunion', { accion, id: r.id, titulo: r.titulo, fuente: r.fuente, estado: r.estado, resumen: r.resumen || null, ...extra });   // main.js: isla, ojo, móvil
  };

  let activa = null;            // { r, grab, cola[], procesando, parado (promesa), guardarT }
  const guardarLuego = () => { if (!activa || activa.guardarT) return; activa.guardarT = setTimeout(() => { if (activa) { activa.guardarT = null; guardar(activa.r); } }, 1500); activa.guardarT.unref?.(); };

  // ---------- audio: cola serie de trozos → whisper ----------
  const transcriptor = ruta => (transcribir ? transcribir(ruta) : new Promise((ok, mal) => {
    if (!bus.listenerCount('transcribir-audio')) return mal(new Error('no hay transcriptor (Whisper) conectado: abre la app de escritorio'));
    bus.emit('transcribir-audio', { ruta, responder: (e, texto) => (e ? mal(e instanceof Error ? e : new Error(String(e))) : ok(texto || '')) });
  }));
  function encolar(a, trozo) {
    const c = conf();
    if (trozo.rms != null && trozo.rms < c.umbralSilencio && (trozo.pico ?? 1) < c.umbralSilencio * 8) { a.silencios = (a.silencios || 0) + 1; if (!c.guardarAudio) fs.rm(trozo.ruta, { force: true }, () => { }); return; }
    a.cola.push(trozo);
    a.cola.sort((x, y) => x.inicioMs - y.inicioMs || (x.fuente === 'mic' ? -1 : 1));    // por tiempo; a la par, "yo" antes que "ellos"
    procesar(a);
  }
  async function procesar(a) {
    if (a.procesando) return;
    a.procesando = true;
    try {
      while (a.cola.length) {
        const t = a.cola.shift();
        let texto = '';
        try { texto = String(await transcriptor(t.ruta) || '').trim(); } catch (e) { a.r.avisos.push(`whisper: ${e.message}`.slice(0, 200)); }
        if (!conf().guardarAudio) fs.rm(t.ruta, { force: true }, () => { });
        if (!texto || ALUCINACION.test(texto)) continue;
        const s = { t: t.inicioMs, tFin: t.inicioMs + (t.durMs || 0), hablante: t.fuente === 'mic' ? 'yo' : 'ellos', texto, fuente: t.fuente };
        const segs = a.r.segmentos; let i = segs.length; while (i > 0 && (segs[i - 1].t > s.t || (segs[i - 1].t === s.t && s.fuente === 'mic' && segs[i - 1].fuente !== 'mic'))) i--;
        segs.splice(i, 0, s);
        a.r.trozos = (a.r.trozos || 0) + 1;
        emitir('segmento', a.r, { segmento: s }); guardarLuego();
      }
    } finally { a.procesando = false; a.alVaciar?.splice(0).forEach(f => f()); }
  }
  const vaciar = a => (a.procesando || a.cola.length ? new Promise(ok => (a.alVaciar = a.alVaciar || []).push(ok)) : Promise.resolve());

  function arrancarGrabadora(a) {
    const lanzar = lanzarGrabadora || require('./escritorio/so').lanzarGrabadora;
    const p = lanzar(); a.grab = p;
    let buf = '';
    a.parado = new Promise(ok => { a._parado = ok; });
    return new Promise((ok, mal) => {
      let listo = false;
      const t = setTimeout(() => { if (!listo) mal(new Error('la grabadora no arrancó a tiempo')); }, 30_000); t.unref?.();
      p.stdout?.setEncoding?.('utf8');
      p.stdout.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const l = buf.slice(0, i).trim().replace(/^\uFEFF/, ''); buf = buf.slice(i + 1);
          if (!l) continue; let e; try { e = JSON.parse(l); } catch { continue; }
          if (e.evento === 'listo') { p.stdin.write(JSON.stringify({ op: 'empezar', dir: path.join(dir, a.r.id), prefijo: 't', trozoSeg: conf().trozoSeg, mic: a.r.mic !== false, sistema: a.r.sistema !== false }) + '\n'); }
          else if (e.evento === 'grabando') { a.r.dispositivos = { ...(a.r.dispositivos || {}), [e.fuente]: `${e.hz} Hz · ${e.canales} canales` }; if (!listo) { listo = true; clearTimeout(t); ok(); } }
          else if (e.evento === 'trozo') encolar(a, e);
          else if (e.evento === 'error') { a.r.avisos.push(`${e.fuente || 'grabadora'}: ${e.error}`.slice(0, 200)); emitir('aviso', a.r, { texto: e.error });
            if (!listo && a.r.avisos.length >= (a.r.mic !== false) + (a.r.sistema !== false)) { clearTimeout(t); mal(new Error(a.r.avisos.join(' · '))); } }
          else if (e.evento === 'parado') a._parado();
        }
      });
      p.on('exit', () => { a._parado(); if (!listo) { clearTimeout(t); mal(new Error(p.error || 'la grabadora se cerró')); } });
      p.on('error', e => { a._parado(); if (!listo) { clearTimeout(t); mal(e); } });
    });
  }

  // ---------- empezar / parar ----------
  async function empezar({ fuente = 'navegador', titulo, pestana, mic, sistema, quien = 'usuario' } = {}) {
    if (!['navegador', 'audio'].includes(fuente)) throw err("fuente: 'navegador' o 'audio'");
    if (activa) throw err(`ya hay una reunión en curso ("${activa.r.titulo}"); párala antes`, 409);
    const t0 = ahora(), d = new Date(t0);
    const id = `r${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const r = { id, titulo: String(titulo || '').slice(0, 120) || (fuente === 'audio' ? 'Llamada' : 'Reunión'), fuente, quien, inicio: t0, fin: null, estado: 'grabando', segmentos: [], avisos: [], resumen: null, tareasCreadas: {} };
    if (fuente === 'audio') { r.mic = mic !== false; r.sistema = sistema !== false; }
    const a = { r, cola: [], procesando: false };
    activa = a;
    try {
      if (fuente === 'navegador') {
        if (!navegador?.conectado?.()) throw err('la extensión del navegador no está conectada (instálala y pega el token)', 409);
        const x = await navegador.orden('reunion', { accion: 'empezar', id, pestana: pestana ?? null }, 20_000);
        Object.assign(r, { pestana: x.pestana, url: x.url, plataforma: x.plataforma || plataformaDe(x.url), subtitulos: x.subtitulos !== false });
        if (!titulo && x.titulo) r.titulo = String(x.titulo).replace(/\s*[-–|]\s*(Google Meet|Microsoft Teams|Zoom).*$/i, '').slice(0, 120) || r.titulo;
        if (!r.subtitulos) r.avisos.push('Los subtítulos de la reunión están apagados: actívalos (botón CC o el aviso en la página).');
      } else await arrancarGrabadora(a);
    } catch (e) { activa = null; try { a.grab?.kill(); } catch { } throw e; }
    guardar(r); emitir('empezada', r, { subtitulos: r.subtitulos });
    bus.emit('nodo-estado', { estado: 'trabajando', msg: 'REC', segundos: 4 * 3600 });
    return r;
  }

  async function parar({ motivo = 'usuario', resumir: hacerResumen = true } = {}) {
    if (!activa) throw err('no hay ninguna reunión en curso', 404);
    const a = activa;
    if (a.parando) return a.parando;
    a.parando = (async () => {
      const r = a.r;
      if (r.fuente === 'navegador') { try { await navegador.orden('reunion', { accion: 'parar', id: r.id }, 8000); } catch { } }
      else if (a.grab) {
        try { a.grab.stdin.write('{"op":"parar"}\n'); } catch { }
        await Promise.race([a.parado, new Promise(ok => setTimeout(ok, 10_000).unref?.())]);
        try { a.grab.stdin.write('{"op":"salir"}\n'); a.grab.stdin.end(); } catch { }
        setTimeout(() => { try { a.grab.kill(); } catch { } }, 3000).unref?.();
        await vaciar(a);
        if (!conf().guardarAudio) fs.rm(path.join(dir, r.id), { recursive: true, force: true }, () => { });
      }
      clearTimeout(a.guardarT);
      r.fin = ahora(); r.motivoFin = motivo; r.estado = r.segmentos.length ? 'resumiendo' : 'lista';
      activa = null;
      guardar(r); emitir('parada', r);
      bus.emit('nodo-estado', { estado: 'reposo', msg: '', segundos: 1 });
      if (hacerResumen && r.segmentos.length) { try { return await resumir(r.id); } catch (e) { const x = leer(r.id); x.estado = 'error'; x.error = e.message; guardar(x); emitir('error', x, { texto: e.message }); return x; } }
      return r;
    })();
    return a.parando;
  }

  // ---------- subtítulos desde la extensión ----------
  async function desdeExtension(b = {}) {
    if (b.evento === 'detectada') {                       // regla "siempre en Meet": la extensión avisa al entrar en una sala
      if (!conf().siempreMeet || activa || plataformaDe(b.url) !== 'meet') return { ok: true, empezada: false };
      const r = await empezar({ fuente: 'navegador', pestana: b.pestana, quien: 'regla' });
      return { ok: true, empezada: true, id: r.id };
    }
    if (!activa || activa.r.fuente !== 'navegador' || (b.id && b.id !== activa.r.id)) return { ok: false, activa: !!activa };
    const r = activa.r;
    if (b.evento === 'parar' || b.evento === 'fin') { parar({ motivo: b.evento === 'fin' ? 'reunión cerrada' : 'botón en la página' }).catch(() => { }); return { ok: true }; }
    if (b.evento === 'estado') { if (r.subtitulos !== !!b.subtitulos) { r.subtitulos = !!b.subtitulos; emitir('subtitulos', r, { subtitulos: r.subtitulos }); guardarLuego(); } return { ok: true }; }
    let n = 0;
    for (const e of (Array.isArray(b.eventos) ? b.eventos : []).slice(0, 200)) {
      const s = fusionar(r.segmentos, { bloque: e.bloque ? String(e.bloque).slice(0, 40) : null, hablante: String(e.hablante || '').slice(0, 80), texto: String(e.texto || '').slice(0, 4000), t: Math.max(0, (Number(e.t) || ahora()) - r.inicio) });
      if (s) { n++; emitir('segmento', r, { segmento: s }); }
    }
    if (n) { r.subtitulos = true; guardarLuego(); }
    return { ok: true, n };
  }

  // ---------- resumen, tareas, exportar ----------
  function transcripcion(r, max = 60_000) {
    const l = r.segmentos.map(s => `[${mmss(s.t)}] ${s.hablante}: ${s.texto}`);
    let txt = l.join('\n');
    if (txt.length > max) txt = `${txt.slice(0, max * 0.6)}\n[… recortado …]\n${txt.slice(-max * 0.4)}`;
    return txt;
  }
  async function resumir(id) {
    const r = leer(id); if (!r) throw err('no existe esa reunión', 404);
    if (!r.segmentos.length) throw err('la reunión no tiene transcripción');
    r.estado = 'resumiendo'; guardar(r); emitir('resumiendo', r);
    const c = conf(), fecha = new Date(r.inicio);
    const system = 'Eres quien toma las notas de una reunión. Resume en el idioma de la transcripción, sin inventar nada. ' +
      '"yo" es el usuario (dueño del asistente); "ellos" son los demás participantes cuando no hay nombres. ' +
      'tareas: solo compromisos concretos (quien = persona o "yo"; cuando = fecha ISO YYYY-MM-DD o YYYY-MM-DDTHH:MM si se dijo, si no omítelo). ' +
      'decisiones: lo que quedó acordado. preguntasAbiertas: lo que quedó sin resolver. temas: 3-8 etiquetas cortas.';
    const prompt = `Reunión "${r.titulo}" del ${fecha.toISOString().slice(0, 16).replace('T', ' ')} (hoy es ${new Date(ahora()).toISOString().slice(0, 10)}).\nTRANSCRIPCIÓN:\n${transcripcion(r)}`;
    const { datos } = await generarJSON({ modelo: c.modelo || modelo?.(), system, prompt, schema: ESQUEMA });
    const x = leer(id) || r;
    x.resumen = { resumen: String(datos.resumen || ''), decisiones: datos.decisiones || [], tareas: (datos.tareas || []).map(t => ({ quien: t.quien || '', que: t.que, ...(t.cuando ? { cuando: t.cuando } : {}) })), preguntasAbiertas: datos.preguntasAbiertas || [], temas: datos.temas || [] };
    x.estado = 'lista'; x.resumidaEn = ahora();
    try {
      if (memoria?.recordar) { const m = memoria.recordar({ texto: `Reunión "${x.titulo}" (${fecha.toLocaleDateString('es')}): ${x.resumen.resumen}`.slice(0, 1200), tipo: 'hecho', origen: 'reunión', nuevo: true }); x.recuerdo = m?.id; }
    } catch { }
    guardar(x); emitir('resumida', x);
    return x;
  }
  function crearTareas(id, { indices } = {}) {
    const r = leer(id); if (!r?.resumen) throw err('la reunión aún no tiene resumen');
    if (!tareas) throw err('las tareas no están disponibles');
    const sel = Array.isArray(indices) && indices.length ? indices.map(Number) : r.resumen.tareas.map((_, i) => i);
    const creadas = [];
    for (const i of sel) {
      const t = r.resumen.tareas[i]; if (!t || r.tareasCreadas?.[i]) continue;
      const cuando = new Date(fechaTarea(t.cuando, ahora())).toISOString();
      const nombre = `${t.quien && t.quien !== 'yo' ? `${t.quien}: ` : ''}${t.que}`.slice(0, 80);
      const x = tareas.crear({ nombre, cuando: { en: cuando }, accion: { tipo: 'aviso', texto: `📋 De la reunión "${r.titulo}": ${t.quien ? `${t.quien} → ` : ''}${t.que}` }, canal: 'isla' });
      r.tareasCreadas = { ...(r.tareasCreadas || {}), [i]: x.id }; creadas.push({ indice: i, id: x.id, nombre, cuando });
    }
    guardar(r); if (creadas.length) emitir('tareas', r, { creadas: creadas.length });
    return { creadas, reunion: r };
  }
  function exportarMd(id) {
    const r = typeof id === 'object' ? id : leer(id); if (!r) throw err('no existe esa reunión', 404);
    const R = r.resumen, d = new Date(r.inicio), dur = r.fin ? Math.round((r.fin - r.inicio) / 60000) : null;
    const lista = (t, xs) => (xs?.length ? `\n## ${t}\n${xs.map(x => `- ${x}`).join('\n')}\n` : '');
    return `# ${r.titulo}\n\n${d.toLocaleString('es')}${dur != null ? ` · ${dur} min` : ''} · ${r.fuente === 'audio' ? 'audio local' : `subtítulos ${r.plataforma || ''}`.trim()}\n` +
      (R ? `\n## Resumen\n${R.resumen}\n${lista('Decisiones', R.decisiones)}${lista('Tareas', R.tareas.map(t => `${t.quien ? `**${t.quien}**: ` : ''}${t.que}${t.cuando ? ` (${t.cuando})` : ''}`))}${lista('Preguntas abiertas', R.preguntasAbiertas)}${R.temas?.length ? `\n**Temas:** ${R.temas.join(', ')}\n` : ''}` : '') +
      `\n## Transcripción\n${r.segmentos.map(s => `**[${mmss(s.t)}] ${s.hablante}:** ${s.texto}`).join('\n\n')}\n`;
  }
  function enviar(id) {
    const r = leer(id); if (!r?.resumen) throw err('la reunión aún no tiene resumen');
    if (!bus.listenerCount('reunion-enviar')) throw err('no hay ningún canal móvil conectado (Telegram, Discord o WhatsApp)', 409);
    const R = r.resumen;
    const texto = `**📋 ${r.titulo}** (${new Date(r.inicio).toLocaleString('es')})\n${R.resumen}` +
      (R.decisiones.length ? `\n\n**Decisiones**\n${R.decisiones.map(x => `• ${x}`).join('\n')}` : '') +
      (R.tareas.length ? `\n\n**Tareas**\n${R.tareas.map(t => `• ${t.quien ? `${t.quien}: ` : ''}${t.que}${t.cuando ? ` (${t.cuando})` : ''}`).join('\n')}` : '') +
      (R.preguntasAbiertas.length ? `\n\n**Preguntas abiertas**\n${R.preguntasAbiertas.map(x => `• ${x}`).join('\n')}` : '');
    bus.emit('reunion-enviar', { id, texto: texto.slice(0, 3800) });
    return { ok: true };
  }

  const resumenLista = r => ({ id: r.id, titulo: r.titulo, fuente: r.fuente, plataforma: r.plataforma, inicio: r.inicio, fin: r.fin, estado: r.estado, segmentos: r.segmentos.length,
    hablantes: [...new Set(r.segmentos.map(s => s.hablante))].slice(0, 12), resumen: r.resumen?.resumen?.slice(0, 280) || '', tareas: r.resumen?.tareas?.length || 0, temas: r.resumen?.temas || [] });
  function lista({ q, limite = 200 } = {}) {
    let fs_ = []; try { fs_ = fs.readdirSync(dir).filter(f => /^r[\w-]+\.json$/.test(f)); } catch { }
    const nq = norm(q);
    const out = [];
    for (const f of fs_) {
      const r = leer(f.slice(0, -5)); if (!r) continue;
      if (nq && !norm(`${r.titulo} ${r.resumen?.resumen || ''} ${(r.resumen?.temas || []).join(' ')} ${r.segmentos.map(s => s.texto).join(' ')}`).includes(nq)) continue;
      out.push(resumenLista(r));
    }
    return out.sort((a, b) => b.inicio - a.inicio).slice(0, limite);
  }
  function borrar(id) {
    if (activa?.r.id === id) throw err('está en curso: párala antes', 409);
    const f = archivo(id); if (!fs.existsSync(f)) return false;
    fs.rmSync(f, { force: true }); fs.rmSync(path.join(dir, String(id).replace(/[^\w-]/g, '')), { recursive: true, force: true });
    return true;
  }
  const estado = () => (activa ? { id: activa.r.id, titulo: activa.r.titulo, fuente: activa.r.fuente, inicio: activa.r.inicio, segmentos: activa.r.segmentos.length, subtitulos: activa.r.subtitulos, cola: activa.cola.length, avisos: activa.r.avisos.slice(-3) } : null);
  const obtener = id => (activa?.r.id === id ? activa.r : leer(id));

  async function http(M, p, b = {}, q = {}) {
    const id = p[2] ? decodeURIComponent(p[2]) : '';
    if (!id && M === 'GET') return { reuniones: lista({ q: q.q }), activa: estado(), config: conf() };
    if (!id && M === 'POST') return empezar({ fuente: b.fuente, titulo: b.titulo, pestana: b.pestana, mic: b.mic, sistema: b.sistema, quien: 'panel' });
    if (id === 'parar' && M === 'POST') return parar({ motivo: 'panel' });
    if (id === 'config') { if (M === 'GET') return conf(); if (M === 'PATCH' || M === 'POST') return configurar(b); }
    if (id === 'activar-subtitulos' && M === 'POST') { if (activa?.r.fuente !== 'navegador') throw err('no hay reunión del navegador en curso', 409); return navegador.orden('reunion', { accion: 'activar', id: activa.r.id }, 10_000); }
    const r = obtener(id); if (!r) throw err('no existe esa reunión', 404);
    if (!p[3] && M === 'GET') return r;
    if (!p[3] && M === 'PATCH') { if (b.titulo) r.titulo = String(b.titulo).slice(0, 120); guardar(r); return r; }
    if (!p[3] && M === 'DELETE') return { ok: borrar(id) };
    if (p[3] === 'resumir' && M === 'POST') return resumir(id);
    if (p[3] === 'tareas' && M === 'POST') return crearTareas(id, { indices: b.indices });
    if (p[3] === 'enviar' && M === 'POST') return enviar(id);
    if (p[3] === 'exportar' && M === 'GET') return { nombre: `${r.titulo.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || r.id}.md`, md: exportarMd(r) };
    throw err('ruta', 404);
  }

  const api = { empezar, parar, desdeExtension, resumir, crearTareas, exportarMd, enviar, lista, obtener, borrar, estado, conf, configurar, http, transcripcion, _encolar: t => activa && encolar(activa, t), _vaciar: () => activa && vaciar(activa) };
  INSTANCIAS.set(cfg, api);
  return api;
}
const INSTANCIAS = new WeakMap();

// ---------- herramientas del agente ----------
const inst = ctx => INSTANCIAS.get(ctx?.cfg);
const conErr = f => async (a, ctx) => { const R = inst(ctx); if (!R) return 'error: las reuniones no están disponibles aquí'; try { return await f(R, a || {}, ctx); } catch (e) { return `error: ${e.message}`; } };
const HERRAMIENTAS = [
  {
    nombre: 'reunion_empezar', riesgo: 'escritura',
    descripcion: 'Empieza a tomar notas de una reunión SOLO si el usuario lo pide (o una tarea suya programada). fuente "navegador" = lee los subtítulos en vivo de Google Meet / Teams web / Zoom web en el navegador del usuario (necesita la extensión; si los subtítulos están apagados, avisa al usuario). ' +
      'fuente "audio" = graba micrófono ("yo") + audio del sistema ("ellos") de cualquier app (Discord, Zoom de escritorio, llamadas) y lo transcribe con Whisper. Recuerda al usuario que debe informar a los participantes. Al parar se resume solo.',
    parametros: { type: 'object', properties: { fuente: { type: 'string', enum: ['navegador', 'audio'] }, titulo: { type: 'string' }, pestana: { type: 'number', description: 'id de pestaña (opcional; si no, la de Meet/Teams/Zoom abierta)' } }, required: ['fuente'] },
    resumen: a => `${a.fuente}${a.titulo ? ` · "${a.titulo}"` : ''}`,
    ejecutar: conErr(async (R, a) => {
      const r = await R.empezar({ fuente: a.fuente, titulo: a.titulo, pestana: a.pestana, quien: 'agente' });
      return `Tomando notas de "${r.titulo}" (${r.id}, ${r.fuente}${r.plataforma ? ` · ${r.plataforma}` : ''}).` + (r.avisos.length ? `\nAVISO: ${r.avisos.join(' · ')}` : '') +
        '\nRecuérdale al usuario que informe a los participantes. Para terminar: reunion_parar.';
    }),
  },
  {
    nombre: 'reunion_parar', riesgo: 'lectura',
    descripcion: 'Para la reunión en curso, termina de transcribir y genera el resumen (decisiones, tareas, preguntas abiertas).',
    parametros: { type: 'object', properties: {} },
    resumen: () => '',
    ejecutar: conErr(async R => {
      const r = await R.parar({ motivo: 'agente' });
      if (!r.resumen) return `Reunión "${r.titulo}" parada (${r.segmentos.length} fragmentos${r.error ? `; error al resumir: ${r.error}` : ''}).`;
      return `Reunión "${r.titulo}" terminada y resumida (${r.id}).\n${R.exportarMd(r).split('## Transcripción')[0].trim()}\nEl usuario la ve en el panel → Reuniones (#/reuniones/${r.id}).`;
    }),
  },
  {
    nombre: 'reuniones_ver', riesgo: 'lectura',
    descripcion: 'Lista las reuniones guardadas (más recientes primero) con su resumen corto. q busca en títulos, resúmenes y transcripciones.',
    parametros: { type: 'object', properties: { q: { type: 'string' } } },
    resumen: a => a.q || '',
    ejecutar: conErr(async (R, a) => {
      const e = R.estado(), l = R.lista({ q: a.q, limite: 20 });
      return (e ? `EN CURSO: "${e.titulo}" (${e.id}, ${e.fuente}, ${e.segmentos} fragmentos)\n\n` : '') +
        (l.map(r => `${r.id} · "${r.titulo}" · ${new Date(r.inicio).toLocaleString('es')} · ${r.estado}${r.tareas ? ` · ${r.tareas} tareas` : ''}\n  ${r.resumen}`).join('\n') || '(no hay reuniones)');
    }),
  },
  {
    nombre: 'reunion_resumen', riesgo: 'lectura',
    descripcion: 'Devuelve el resumen completo de una reunión (decisiones, tareas, preguntas). Con transcripcion=true añade la transcripción.',
    parametros: { type: 'object', properties: { id: { type: 'string' }, transcripcion: { type: 'boolean' } }, required: ['id'] },
    resumen: a => a.id,
    ejecutar: conErr(async (R, a) => {
      let r = R.obtener(a.id); if (!r) return `error: no existe la reunión ${a.id}`;
      if (!r.resumen && r.estado !== 'grabando' && r.segmentos.length) r = await R.resumir(a.id);
      const md = R.exportarMd(r);
      return a.transcripcion ? md.slice(0, 20_000) : md.split('## Transcripción')[0].trim();
    }),
  },
];

module.exports = { crearReuniones, HERRAMIENTAS, fusionar, combinar, fechaTarea, plataformaDe, ESQUEMA };
