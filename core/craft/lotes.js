// Editor automático por lotes: trae clips cortados por otra máquina (p. ej. la Pi que vigila los streams), los edita con
// subtitular_video (perfil, estilo elegido por el modelo según el tono, escenas y efectos automáticos) y los deja en REVISIÓN:
// el usuario los ve en el panel (#/revision) y decide Aprobar / Otro estilo / Descartar. Nunca publica nada solo.
//
// Fuentes (config <datos>/craft/lotes.json → fuentes[]):
//   { id, nombre, activa, tipo: 'ssh', host: 'usuario@ip', ruta: '~/carpeta/salida',  ← carpetas <fecha>_<id>/ con manifiesto.json + clips
//     perfil, escenas: 'auto', estilos: [...permitidos], minClipSeg: 30, minStreamSeg: 600 }
//   manifiesto.json: { video, titulo, fecha, duracion, clips: [{ rank, archivo, inicio, fin, chat: [...] }] }
// Estado <datos>/craft/lotes-estado.json: { vistos: {fuente/carpeta: fecha}, clips: { id: {...} } }
// Disco: el original se borra al decidir; lo descartado se borra; lo pendiente de más de `retencionDias` se limpia.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const estilos = require('./estilos');
const calidad = require('./calidad');
const { crearPublicador } = require('./publicar');
const redes = require('./redes');
const metricasMod = require('./metricas');

const ESTILOS_DEFECTO = ['pop', 'karaoke', 'fuego', 'impacto', 'terror', 'atardecer', 'noche', 'tornado', 'arcoiris', 'oro'];
// ajustes que son listas y se ACUMULAN al pedir cambios (cada comentario añade el suyo)
const ACUMULABLES = ['correcciones', 'quitarEmojis', 'sinEfectos', 'rotulos'];

// miniaturas: crearMiniaturas (core/craft/miniatura.js) o nada (sin portadas); kits: crearKits; medir: calidad.medir;
// diccionario: crearDiccionario; youtube: crearYouTube; metricas: crearMetricas (inyectables en tests)
function crearLotes({ cfg, bus, tareas, subtitulador, generarJSON, modelo, ejecutar = execFile, pedir, log = () => { }, miniaturas = null, kits = require('./kit').crearKits({ cfg }), medir = calidad.medir,
  diccionario = require('./diccionario').crearDiccionario({ cfg }), youtube, metricas, abrirUrl = null, medal = null }) {
  const dir = path.join(cfg.dir, 'craft');
  const FC = path.join(dir, 'lotes.json'), FE = path.join(dir, 'lotes-estado.json'), FA = path.join(dir, 'aprendizaje.json');
  youtube = youtube || require('./youtube').crearYouTube({ dir, ...(pedir ? { pedir } : {}), abrir: abrirUrl, log });
  metricas = metricas || metricasMod.crearMetricas({ python: cfg?.craft?.python || 'python', ejecutar, youtube, generarJSON, modelo, log });
  const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
  const guardarJ = (f, o) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  let conf = { salida: path.join(os.homedir(), 'Videos', 'APOLO'), retencionDias: 7, fuentes: [], ...leer(FC, {}) };
  const est = { vistos: {}, clips: {}, ...leer(FE, {}) };
  let aprendido = leer(FA, null);                      // lo aprendido de las métricas (metricas.aprender)
  const guardarConf = () => guardarJ(FC, conf), guardarEst = () => guardarJ(FE, est);
  const cola = [];                                     // ids de clips por editar (en orden)
  let enCurso = null, revisando = false;
  for (const c of Object.values(est.clips)) if (c.estado === 'editando' || c.estado === 'en cola') { c.estado = 'en cola'; cola.push(c.id); }   // tras reiniciar
  for (const c of Object.values(est.clips)) if (c.estado === 'descargando') { c.estado = 'error'; c.error = 'la descarga se cortó al reiniciar; pídelo otra vez'; }
  // textos para redes + inglés ("en:<id>") y exportaciones 4K ("4k:<id>") pendientes: van en la misma cola, en ese orden
  for (const c of Object.values(est.clips)) if (c.estado === 'aprobado' && ['en cola', 'preparando'].includes(c.en?.estado)) { c.en = { ...c.en, estado: 'en cola' }; cola.push('en:' + c.id); }
  for (const c of Object.values(est.clips)) if (c.estado === 'aprobado' && ['en cola', 'exportando'].includes(c.k4?.estado)) { c.k4 = { estado: 'en cola' }; cola.push('4k:' + c.id); }

  const sh = (cmd, args, { timeout = 600_000 } = {}) => new Promise((ok, mal) =>
    ejecutar(cmd, args, { windowsHide: true, timeout, maxBuffer: 64 << 20, encoding: 'utf8' }, (e, out, err) => (e ? mal(new Error(`${cmd}: ${(err || e.message).toString().trim().slice(0, 300)}`)) : ok(out))));
  const ssh = (f, comando) => sh('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', f.host, comando], { timeout: 60_000 });
  const scp = (f, remoto, local) => sh('scp', ['-q', '-o', 'BatchMode=yes', `${f.host}:${remoto}`, local]);
  const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const carpetaFuente = f => path.join(conf.salida, f.nombre || f.id);
  // los clips de Medal que el usuario elige en el panel van como una fuente más (fija): su kit, sin 4K (el 1080 ya es el
  // final), editados aunque no se hable y SIN publicar (Drive/Discord/YouTube son del canal de la fuente ssh, no suyos)
  const FUENTE_MEDAL = { id: 'medal', nombre: 'Medal', tipo: 'medal', perfil: 'medal', escenas: 'auto', publicar: false, exportar4k: false, sinVoz: true };
  const fuenteDe = id => conf.fuentes.find(x => x.id === id) || (id === 'medal' ? FUENTE_MEDAL : null);
  const kitDe = c => { const f = fuenteDe(c.fuente); return f?.perfil ? kits.obtener(f.perfil) : null; };
  const publicador = crearPublicador({ conf: () => conf.discordClips, ejecutar, ...(pedir ? { pedir } : {}), log, kitDe });
  const borrar = (...fs_) => { for (const f of fs_.flat()) if (f) try { fs.rmSync(f, { force: true }); } catch { } };
  const archivosPortadas = c => (c.portadas || []).flatMap(p => [p.jpg, p.pcraft]);
  const pistasDe = () => metricasMod.pistas(aprendido);
  const zonaDe = k => k?.publicacion?.zona || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ── 1. buscar streams nuevos en las fuentes ──
  async function revisar() {
    if (revisando) return { nuevos: 0, ocupado: true };
    revisando = true;
    let nuevos = 0;
    try {
      for (const f of conf.fuentes.filter(x => x.activa !== false && x.tipo === 'ssh')) {
        let lista;
        try { lista = (await ssh(f, `ls -1 ${f.ruta}`)).split('\n').map(s => s.trim()).filter(s => /^\d{4}-\d\d-\d\d_/.test(s)); }
        catch (e) { log('[lotes]', f.id, e.message); continue; }
        // soloUltimo (por defecto): del más nuevo al más viejo; en cuanto uno entra en cola, los anteriores se dan por vistos
        const soloUltimo = f.soloUltimo !== false;
        const pendientes = lista.filter(c => !est.vistos[`${f.id}/${c}`]).sort();
        if (soloUltimo) pendientes.reverse();
        let encolado = false;
        for (const carpeta of pendientes) {
          const clave = `${f.id}/${carpeta}`;
          if (encolado) { est.vistos[clave] = new Date().toISOString(); log('[lotes] stream viejo, se salta', clave); guardarEst(); continue; }
          let m;
          try { m = JSON.parse(await ssh(f, `cat ${f.ruta}/${q(carpeta)}/manifiesto.json`)); }
          catch { if (soloUltimo) break; continue; }   // todavía cortando: se mira en la siguiente vuelta (y no se cuela uno viejo)
          const listos = (m.clips || []).filter(c => c.archivo && c.estado !== 'cortando');
          if (!listos.length && (m.clips || []).length) { if (soloUltimo) break; continue; }
          est.vistos[clave] = new Date().toISOString();
          if ((m.duracion || 0) < (f.minStreamSeg ?? 600)) { log('[lotes] stream corto, se ignora', clave); guardarEst(); continue; }
          for (const c of listos) {
            if ((c.fin - c.inicio) < (f.minClipSeg ?? 30)) continue;
            const id = `${f.id}_${m.video}_${String(c.rank).padStart(2, '0')}`;
            if (est.clips[id]) continue;
            est.clips[id] = { id, fuente: f.id, stream: m.video, titulo: m.titulo, fecha: m.fecha, carpeta, rank: c.rank, archivo: c.archivo,
              inicio: c.inicio, fin: c.fin, chat: (c.chat || []).slice(0, 12).map(x => (typeof x === 'string' ? x : x.texto || x.mensaje || '')).filter(Boolean),
              // lo que el detector de la Pi sabe del momento: de qué tipo fue la reacción del chat, cuánta gente y cuánta en inglés
              ...(c.tipo ? { momento: { tipo: c.tipo, autores: c.autores ?? null, ingles: c.ingles ?? null, puntaje: c.puntaje ?? null } } : {}),
              estado: 'en cola', creado: Date.now() };
            cola.push(id); nuevos++;
          }
          if (soloUltimo && listos.length) encolado = true;
          guardarEst();
          bus?.emit('lotes', { tipo: 'nuevos', fuente: f.id, stream: m.video, clips: listos.length });
        }
      }
    } finally { revisando = false; }
    procesar();
    return { nuevos };
  }

  // ── 2. editar la cola, de uno en uno ──
  async function elegirEstilo(f, clip, transcripcion, usados) {
    const permitidos = (f.estilos?.length ? f.estilos : ESTILOS_DEFECTO).filter(e => estilos.ESTILOS[e]);
    if (!generarJSON) return permitidos[0];
    try {
      const r = await generarJSON({ modelo: modelo?.(), system: 'Eres editor de clips verticales para TikTok/Shorts. Eliges el estilo de subtítulos que mejor va con el tono del clip.',
        prompt: `Lo que se dice en el clip:\n${transcripcion.slice(0, 2500)}\n\nLo que escribía el chat en ese momento:\n${(clip.chat || []).join(' | ').slice(0, 800)}\n\n`
          + (clip.momento?.tipo ? `El chat reaccionó sobre todo con: ${clip.momento.tipo}${clip.momento.autores ? ` (${clip.momento.autores} personas)` : ''}.\n` : '')
          + (pistasDe().estilo ? `${pistasDe().estilo}\n\n` : '')
          + `Estilos disponibles:\n${permitidos.map(e => `- ${e}: ${estilos.ESTILOS[e].descripcion}`).join('\n')}\n\n`
          + `Ya usados en este stream (evita repetir mucho): ${usados.join(', ') || 'ninguno'}.\nElige UNO por el tono (miedo/fantasmas → terror, risas → arcoiris o tornado, épico/récord → oro o impacto, charla tranquila → noche o karaoke, energía → pop o fuego).`,
        schema: { type: 'object', properties: { estilo: { type: 'string', enum: permitidos }, motivo: { type: 'string' } }, required: ['estilo'] } });
      const d = r?.datos || r;
      return permitidos.includes(d.estilo) ? d.estilo : permitidos[0];
    } catch { return permitidos[0]; }
  }

  async function editarUno(id) {
    const c = est.clips[id]; if (!c || c.estado !== 'en cola') return;   // descartado mientras esperaba
    const f = fuenteDe(c.fuente);
    if (!f) { c.estado = 'error'; c.error = 'la fuente ya no existe'; return; }
    const base = path.join(carpetaFuente(f), `${c.fecha}_${c.stream}`);
    const original = path.join(base, 'originales', c.archivo);
    c.estado = 'editando'; c.error = null; c.progreso = { fase: 'empezando', pct: 0, desde: Date.now() }; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    // progreso en vivo (solo en memoria; la página lo pide cada pocos segundos): fase, % de la edición entera y lo que le queda a la exportación
    const ctx = { progreso: (fase, pct, eta) => { c.progreso = { ...c.progreso, fase: String(fase).replace(/…$/, ''), ...(pct != null ? { pct: Math.round(Math.min(100, Math.max(c.progreso?.pct || 0, pct))) } : {}), eta: eta ?? null }; } };
    if (c.reexportar) {                                 // retocado a mano en FilmCraft: solo volver a exportar su proyecto
      await subtitulador.reexportar({ proyecto: c.proyecto, mp4: c.mp4, previa: c.previa, segPrevia: Math.min(20, (c.fin - c.inicio) / 3) }, ctx);
      Object.assign(c, { estado: 'revisar', editado: Date.now(), reexportar: false, retocado: true });
      guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
      return;
    }
    fs.mkdirSync(path.dirname(original), { recursive: true });
    if (!fs.existsSync(original)) await scp(f, `${f.ruta}/${c.carpeta}/${c.archivo}`, original);
    const comun = { video: original, perfil: f.perfil, carpeta: path.join(base, 'editados'), nombre: `${String(c.rank).padStart(2, '0')}`,
      tituloClip: c.tituloClip || String(c.titulo || '').replace(/\s*\((portrait|vertical)\)\s*/i, '').trim() || undefined, pistas: pistasDe(), ...(f.sinVoz ? { sinVoz: true } : {}) };
    if (!c.estiloForzado) {                             // transcribe primero (queda en caché) para elegir el estilo por lo que se dice
      ctx.progreso('transcribiendo', 2);
      const t = await subtitulador.subtitular({ ...comun, soloTranscribir: true }, ctx);
      ctx.progreso('eligiendo estilo', 6);
      const texto = JSON.parse(typeof t === 'string' ? t : t.texto).subtitulos.map(x => x.texto).join(' ');
      const usados = Object.values(est.clips).filter(x => x.stream === c.stream && x.estilo && x.id !== id).map(x => x.estilo);
      c.estilo = await elegirEstilo(f, c, texto, usados);
    } else c.estilo = c.estiloForzado;
    const { estilo: _e, ...ajustes } = c.ajustes || {};  // cambios pedidos desde Revisión (vibración, efectos, escenas, gancho…)
    // el plan del director se guarda: pedir un cambio no rehace toda la edición (salvo si cambia el montaje: avance/recorte)
    const clave = claveMontaje(c);
    const plan = c.plan && c.planClave === clave ? c.plan : undefined;
    const r = await subtitulador.subtitular({ ...comun, nombre: `${String(c.rank).padStart(2, '0')} - ${c.estilo}`, estilo: c.estilo, escenas: f.escenas ?? 'auto', ...ajustes, ...(plan ? { plan } : {}) }, ctx);
    const d = r.datos || {};
    if (c.estado === 'descartado') {                    // lo descartaron mientras se editaba: fuera lo recién hecho
      for (const k of ['mp4', 'srt', 'previa', 'proyecto']) try { if (d[k]) fs.rmSync(d[k], { force: true }); } catch { }
      try { fs.rmSync(original, { force: true }); } catch { }
      return;
    }
    if (c.mp4 && c.mp4 !== d.mp4) for (const viejo of [c.mp4, c.srt, c.previa, c.proyecto]) try { if (viejo) fs.rmSync(viejo, { force: true }); } catch { }   // al rehacer, fuera la versión anterior
    // portadas (PhotoCraft): los mejores momentos de cara del vídeo sin nada encima, con el gancho y los colores del kit
    let portadas = c.portadas || [];
    if (miniaturas && d.fuente && fs.existsSync(d.fuente) && (kitDe(c)?.miniatura?.variantes ?? 3) > 0) {
      ctx.progreso('portadas (PhotoCraft)', 99);
      try {
        let an = null; try { an = d.analisis ? JSON.parse(fs.readFileSync(d.analisis, 'utf8')) : null; } catch { }
        const k = kitDe(c), letrero = k?.letrero ? path.join(cfg.dir, 'craft', 'marca', `letrero-${`${k.letrero.nombre1 || ''}${k.letrero.nombre2 || ''}`.replace(/[^\p{L}\d]/gu, '').toLowerCase() || 'marca'}.mov`) : null;
        const nuevas = await miniaturas.deClip({ video: d.fuente, an, texto: d.gancho || c.tituloClip || c.titulo || '', kit: k, carpeta: path.dirname(d.mp4),
          nombre: `${String(c.rank).padStart(2, '0')} - ${c.estilo}`, letrero: letrero && fs.existsSync(letrero) ? letrero : null });
        const vale = new Set(nuevas.flatMap(p => [p.jpg, p.pcraft]));
        borrar(archivosPortadas(c).filter(f => !vale.has(f)));
        portadas = nuevas.map(p => ({ jpg: p.jpg, pcraft: p.pcraft, t: p.t }));
      } catch (e) { log('[lotes] portadas', id, e.message); }
    }
    Object.assign(c, { estado: 'revisar', mp4: d.mp4, srt: d.srt, previa: d.previa, proyecto: d.proyecto, gancho: d.gancho, dudas: d.dudas || [], escenas: d.escenas || [],
      emojis: d.emojis || 0, editado: Date.now(), estiloForzado: null, retocado: false, plan: d.plan || null, planClave: clave, disenos: d.plan?.disenos || [], sonidos: d.sonidos || 0,
      calidad: d.calidad || null, audioPro: d.audioPro || null, rotulos: d.rotulos || 0, noCorregidas: d.noCorregidas || [],
      portadas, portada: Math.min(c.portada || 0, Math.max(0, portadas.length - 1)), fuenteVideo: d.fuente || null, diccionario: d.diccionario || 0 });
    // las correcciones que sí se aplicaron pasan al diccionario del canal (los clips siguientes ya salen bien)
    const corr = (c.ajustes?.correcciones || []).filter(x => !(d.noCorregidas || []).some(n => n.mal === x.mal && n.bien === x.bien));
    if (corr.length && f.perfil) try { diccionario.aprender(f.perfil, corr, c.id); } catch (e) { log('[lotes] diccionario', e.message); }
    guardarEst();
    bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
  }

  async function procesar() {
    if (enCurso) return;
    while (cola.length) {
      const id = cola.shift(); enCurso = id;
      if (id.startsWith('4k:')) { await hacer4k(id.slice(3)); enCurso = null; continue; }
      if (id.startsWith('en:')) { await prepararRedes(id.slice(3)); enCurso = null; continue; }
      try { await editarUno(id); }
      catch (e) { const c = est.clips[id]; if (c) { c.estado = 'error'; c.error = e.message.slice(0, 400); guardarEst(); } log('[lotes]', id, e.message); }
      if (est.clips[id]?.progreso) { delete est.clips[id].progreso; guardarEst(); }
      enCurso = null;
      const c = est.clips[id];
      // ¿se acabó ese stream? → aviso con el resumen
      if (c && !cola.some(x => est.clips[x]?.stream === c.stream)) {
        const del = Object.values(est.clips).filter(x => x.stream === c.stream);
        const listos = del.filter(x => x.estado === 'revisar').length, malos = del.filter(x => x.estado === 'error').length;
        if (listos && !del.some(x => x.avisado)) {
          for (const x of del) x.avisado = true; guardarEst();
          const f = fuenteDe(c.fuente);
          bus?.emit('aviso-externo', { origen: 'Clips', urgente: false,
            texto: `🎬 ${listos} clips de ${f?.nombre || c.fuente} (${c.titulo || c.stream}) listos para revisar en el panel → Revisión.${malos ? ` ${malos} fallaron.` : ''} Estilos: ${[...new Set(del.map(x => x.estilo).filter(Boolean))].join(', ')}.` });
        }
      }
    }
  }

  // ── 4K para subir: al aprobar se exporta otra vez el proyecto a 2160×3840 (textos y letrero nítidos; el vídeo de la fuente
  // es 1080p y se reescala). Las fuentes (original y vídeo montado con avance/recorte) se borran cuando acaba ──
  const ANCHO4K = 2160, ALTO4K = 3840;
  function encolar4k(c) {
    if (!c.proyecto || !fs.existsSync(c.proyecto)) throw Object.assign(new Error('el clip no tiene proyecto para exportar en 4K'), { status: 409 });
    if (['en cola', 'exportando'].includes(c.k4?.estado)) return;
    c.k4 = { estado: 'en cola' }; cola.push('4k:' + c.id); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar();
  }
  function borrarFuentes(c) {
    const f = fuenteDe(c.fuente);
    const base = f ? path.join(carpetaFuente(f), `${c.fecha}_${c.stream}`) : null;
    if (!base) return;
    try { fs.rmSync(path.join(base, 'originales', c.archivo), { force: true }); } catch { }
    const raiz = path.basename(c.archivo, path.extname(c.archivo)), ed = path.join(base, 'editados');
    // montados (avance/recorte) y su versión con el audio de estudio (.master.mp4 + su huella)
    try { for (const n of fs.readdirSync(ed)) if (n.startsWith(raiz + '.') && (/\.(a|r)[\d.\-_ar]+\.mp4$/.test(n) || /\.master\.mp4(\.json)?$/.test(n))) fs.rmSync(path.join(ed, n), { force: true }); } catch { }
  }
  async function hacer4k(id) {
    const c = est.clips[id]; if (!c || c.estado !== 'aprobado') return;
    const destino = c.mp4.replace(/\.mp4$/i, ' 4K.mp4');
    c.k4 = { estado: 'exportando', pct: 0, desde: Date.now() }; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    try {
      await subtitulador.reexportar({ proyecto: c.proyecto, mp4: destino, ancho: ANCHO4K, alto: ALTO4K, srt: false },
        { progreso: (fase, pct, eta) => { c.k4 = { ...c.k4, pct: Math.round(pct ?? c.k4.pct ?? 0), eta: eta ?? null }; } });
      // control antes de dar el 4K por bueno (y antes de subirlo): resolución, duración igual a la versión revisada, audio y vídeo
      const m = await medir(destino, { ffmpeg: cfg?.craft?.ffmpeg, ligero: true });
      const q = calidad.evaluar(m, { esperado: { ancho: ANCHO4K, alto: ALTO4K, duracion: c.calidad?.medidas?.duracion } });
      if (!q.ok) throw new Error(`calidad del 4K: ${q.errores.map(x => x.texto).join('; ')}`);
      c.k4 = { estado: 'listo', mp4: destino, hecho: Date.now(), medidas: { ancho: m.ancho, alto: m.alto, duracion: m.duracion, bytes: m.bytes } };
      borrarFuentes(c);
      bus?.emit('aviso-externo', { origen: 'Clips', urgente: false, texto: `🎬 4K listo para subir: ${path.basename(destino)}` });
      if (publicador.activo() && fuenteDe(c.fuente)?.publicar !== false) publicar(c);
    } catch (e) { c.k4 = { estado: 'error', error: e.message.slice(0, 300), ...(fs.existsSync(destino) ? { mp4: destino } : {}) }; log('[lotes] 4K', id, e.message); }
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
  }

  // ── al aprobar, antes del 4K: título y descripción para redes (es + en), subtítulos en inglés (.srt) y, si el kit lo pide
  // (ingles.quemado), una versión con los subtítulos y el título en inglés quemados (1080p, mismo plan del director) ──
  async function prepararRedes(id) {
    const c = est.clips[id]; if (!c || c.estado !== 'aprobado') return;
    const k = kitDe(c), f = fuenteDe(c.fuente);
    c.en = { ...c.en, estado: 'preparando', desde: Date.now() }; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    let srtEs = ''; try { srtEs = c.srt && fs.existsSync(c.srt) ? fs.readFileSync(c.srt, 'utf8') : ''; } catch { }
    const avisos = [];
    if (!c.textos) c.textos = await redes.textosRedes({ gancho: c.gancho, transcripcion: redes.leerSrt(srtEs).map(x => x.texto).join(' '), titulo: c.titulo, kit: k, stream: c.stream, generarJSON, modelo, pistas: pistasDe().titulo });
    if (k?.ingles?.srt !== false && srtEs && !(c.en.srt && fs.existsSync(c.en.srt))) {
      try {
        const en = await redes.traducirSrt(srtEs, { generarJSON, modelo, contexto: k?.contexto });
        const destino = c.mp4.replace(/\.mp4$/i, '.en.srt');
        fs.writeFileSync(destino, en); c.en.srt = destino;
      } catch (e) { avisos.push(`subtítulos en inglés: ${e.message}`); log('[lotes] srt en', id, e.message); }
    }
    if (k?.ingles?.quemado && c.en.srt && !(c.en.mp4 && fs.existsSync(c.en.mp4))) {
      try {
        if (!c.fuenteVideo || !fs.existsSync(c.fuenteVideo)) throw new Error('ya no está el vídeo de origen');
        c.en.estado = 'editando'; guardarEst();
        // el vídeo de origen ya va montado (avance/recorte): los tiempos de los subtítulos y del plan son los de ese vídeo
        const { correcciones: _c, subtitulosFijos: _sf, avance: _a, recorte: _r, gancho: _g, estilo: _e, temblor, ...aj } = c.ajustes || {};
        const subs = redes.leerSrt(fs.readFileSync(c.en.srt, 'utf8'));
        const ctx = { progreso: (fase, pct) => { c.en = { ...c.en, fase: String(fase).replace(/…$/, ''), pct: Math.round(pct ?? c.en.pct ?? 0) }; } };
        const r = await subtitulador.subtitular({ video: c.fuenteVideo, perfil: f?.perfil, carpeta: path.dirname(c.fuenteVideo), nombre: `${String(c.rank).padStart(2, '0')} - ${c.estilo} EN`,
          estilo: c.estilo, escenas: f?.escenas ?? 'auto', ...aj, ...(temblor === false || (temblor && !_a && !_r) ? { temblor } : {}), plan: c.plan || undefined, subtitulos: subs,
          gancho: c.textos?.ganchoEn || c.gancho || false, cta: k?.ingles?.cta || 'Follow for more', diccionario: false }, ctx);
        const d = r.datos || {};
        const destino = c.mp4.replace(/\.mp4$/i, ' EN.mp4');
        fs.renameSync(d.mp4, destino);
        borrar(d.srt, d.previa, d.proyecto);
        c.en = { ...c.en, mp4: destino, calidad: d.calidad || null };
        if (d.calidad && !d.calidad.ok) avisos.push(`versión en inglés: ${(d.calidad.errores || []).map(x => x.texto).join('; ')}`);
      } catch (e) { avisos.push(`versión en inglés: ${e.message}`); log('[lotes] versión en', id, e.message); }
    }
    c.en = { ...c.en, estado: 'listo', hecho: Date.now(), avisos }; delete c.en.fase; delete c.en.pct;
    if (conf.exportar4k === false || f?.exportar4k === false || !c.proyecto) borrarFuentes(c);   // sin 4K detrás, aquí acaba lo que necesita el vídeo de origen
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
  }
  function encolarRedes(c) {
    if (['en cola', 'preparando', 'editando'].includes(c.en?.estado)) return;
    c.en = { ...c.en, estado: 'en cola' }; cola.push('en:' + c.id);
  }

  // ── 4K → Google Drive + anuncio en el canal de Discord del streamer (de uno en uno, sin frenar la cola de edición) ──
  // y después YouTube (programado). El 4K local se borra cuando ya no hace falta (Drive confirmado y YouTube hecho)
  const confYT = () => ({ activo: false, programar: true, ...(conf.youtube || {}) });
  // un clip marcado para otra red (Facebook, TikTok…) en Revisión no se sube solo a YouTube; se puede subir a mano
  const ytPara = c => confYT().activo && youtube.conectado() && fuenteDe(c.fuente)?.publicar !== false && kitDe(c)?.publicacion?.youtube?.activo !== false
    && (!c.ajustes?.plataforma || c.ajustes.plataforma === 'youtube');
  let subidas = Promise.resolve();
  function publicar(c) {
    if (['en cola', 'subiendo'].includes(c.publicado?.estado)) return publico(c);
    c.publicado = { ...c.publicado, estado: 'en cola' }; guardarEst();
    const conYT = ytPara(c) && !['listo', 'subiendo'].includes(c.youtube?.estado);
    if (conYT) reservarHueco(c);                         // el anuncio ya dice a qué hora sale en YouTube
    subidas = subidas.then(async () => {
      c.publicado = { ...c.publicado, estado: 'subiendo', desde: Date.now() }; bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
      try { c.publicado = await publicador.publicar(c, { borrarLocal: conYT ? false : conf.discordClips?.borrarLocal }); }
      catch (e) { c.publicado = { ...c.publicado, estado: 'error', error: e.message.slice(0, 300) }; log('[lotes] publicar', c.id, e.message); }
      guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
      if (conYT) await subirYouTube(c);
    });
    return publico(c);
  }

  // hora de publicación: la siguiente libre entre las del kit (o las que mejor han funcionado), sin pasar de maxPorDia
  function reservarHueco(c) {
    const k = kitDe(c), py = k?.publicacion?.youtube || {};
    if (confYT().programar === false) { c.youtube = { ...c.youtube, estado: 'en cola', publicarEn: null }; return; }
    if (c.youtube?.publicarEn && c.youtube.publicarEn > Date.now() + 15 * 60_000) { c.youtube = { ...c.youtube, estado: 'en cola' }; return; }
    const ocupados = Object.values(est.clips).filter(x => x.id !== c.id && x.youtube?.publicarEn && x.youtube.estado !== 'error').map(x => x.youtube.publicarEn);
    const t = redes.siguienteHueco({ horas: metricasMod.mejoresHoras(aprendido, py.horas || ['12:00', '18:00', '21:00']), zona: zonaDe(k), ocupados, maxPorDia: py.maxPorDia || 3 });
    c.youtube = { ...c.youtube, estado: 'en cola', publicarEn: t };
  }

  async function subirYouTube(c) {
    const k = kitDe(c), py = k?.publicacion?.youtube || {};
    if (!c.youtube?.estado || c.youtube.estado === 'error' || c.youtube.estado === 'esperando cuota') reservarHueco(c);
    if (c.youtube.publicarEn && c.youtube.publicarEn < Date.now() + 15 * 60_000) reservarHueco(c);   // la hora reservada ya pasó (p. ej. esperó cuota)
    c.youtube = { ...c.youtube, estado: 'subiendo', pct: 0, desde: Date.now(), error: null }; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    let archivo = c.k4?.mp4, temporal = null;
    try {
      if (!archivo || !fs.existsSync(archivo)) {             // el 4K local ya se borró: de vuelta desde Drive
        temporal = path.join(os.tmpdir(), `apolo-yt-${process.pid}-${Date.now()}.mp4`);
        await publicador.traer(c, temporal); archivo = temporal;
      }
      const tx = c.textos || redes.textosBase({ gancho: c.gancho, kit: k, stream: c.stream });
      const tags = (py.hashtags || k?.hashtags || '').split(/\s+/).filter(h => h.startsWith('#'));
      const tagsEn = (k?.ingles?.hashtags || py.hashtags || k?.hashtags || '').split(/\s+/).filter(h => h.startsWith('#'));
      const v = await youtube.subir({ archivo, titulo: redes.tituloConHashtags(tx.es.titulo, tags.join(' ')), descripcion: `${tx.es.descripcion}\n\n${tags.join(' ')}`,
        etiquetas: [...new Set([...tags, ...tagsEn].map(h => h.slice(1)))], idioma: 'es', idiomaAudio: 'es', privacidad: py.privacidad || 'public', publicarEn: c.youtube.publicarEn,
        localizaciones: tx.en?.titulo ? { en: { title: redes.tituloConHashtags(tx.en.titulo, tagsEn.join(' ')), description: `${tx.en.descripcion}\n\n${tagsEn.join(' ')}` } } : null,
        progreso: pct => { c.youtube = { ...c.youtube, pct }; } });
      const avisos = [];
      const jpg = c.portadas?.[c.portada || 0]?.jpg;
      if (jpg && fs.existsSync(jpg)) {
        try {
          let foto = jpg;
          if (fs.statSync(jpg).size > 2_000_000) { foto = path.join(os.tmpdir(), `apolo-yt-portada-${Date.now()}.jpg`); await sh(cfg?.craft?.ffmpeg || 'ffmpeg', ['-y', '-v', 'error', '-i', jpg, '-vf', 'scale=720:-2', '-q:v', '4', foto]); }
          await youtube.portada(v.id, foto);
          if (foto !== jpg) borrar(foto);
        } catch (e) { avisos.push(`portada: ${e.message}`); }
      }
      if (c.en?.srt && fs.existsSync(c.en.srt)) try { await youtube.subtitulos(v.id, { idioma: 'en', nombre: 'English', srt: fs.readFileSync(c.en.srt, 'utf8') }); } catch (e) { avisos.push(`subtítulos en inglés: ${e.message}`); }
      c.youtube = { estado: 'listo', id: v.id, url: `https://www.youtube.com/shorts/${v.id}`, publicarEn: c.youtube.publicarEn, hecho: Date.now(), avisos };
      const cuando = c.youtube.publicarEn ? new Date(c.youtube.publicarEn).toLocaleString('es', { timeZone: zonaDe(k), weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'ya';
      bus?.emit('aviso-externo', { origen: 'Clips', urgente: false, texto: `📺 Subido a YouTube: «${tx.es.titulo}». Se publica ${cuando}.${avisos.length ? ` Ojo: ${avisos.join('; ')}` : ''}` });
    } catch (e) {
      // sin cuota hoy: lo vuelve a intentar la tarea de cada 15 min cuando YouTube reinicia la cuota (medianoche de California)
      if (e.cuota) c.youtube = { ...c.youtube, estado: 'esperando cuota', error: e.message.slice(0, 200), reintentar: siguienteMedianochePT() };
      else c.youtube = { ...c.youtube, estado: 'error', error: e.message.slice(0, 300) };
      log('[lotes] youtube', c.id, e.message);
    } finally {
      if (temporal) borrar(temporal);
      if (conf.discordClips?.borrarLocal && c.publicado?.estado === 'listo' && c.youtube?.estado !== 'esperando cuota') try { if (await publicador.liberar(c)) c.publicado.borradoLocal = true; } catch (e) { log('[lotes] liberar', e.message); }
      guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    }
  }
  const siguienteMedianochePT = () => redes.instanteEn(redes.fechaEn(Date.now() + 864e5, 'America/Los_Angeles'), '00:10', 'America/Los_Angeles');
  function reintentarYouTube() {
    for (const c of Object.values(est.clips)) if (c.youtube?.estado === 'esperando cuota' && Date.now() >= (c.youtube.reintentar || 0) && ytPara(c)) {
      c.youtube = { ...c.youtube, estado: 'en cola' };
      subidas = subidas.then(() => subirYouTube(c));
    }
  }
  function aYouTube(c) {                                 // a mano desde Revisión (también clips publicados antes de conectar YouTube)
    if (c.estado !== 'aprobado') throw Object.assign(new Error('primero apruébalo'), { status: 409 });
    if (!youtube.conectado()) throw Object.assign(new Error('YouTube no está conectado'), { status: 409 });
    if (['en cola', 'subiendo'].includes(c.youtube?.estado)) return publico(c);
    if (c.youtube?.estado === 'listo') throw Object.assign(new Error('ya está en YouTube'), { status: 409 });
    if (!(c.k4?.mp4 && fs.existsSync(c.k4.mp4)) && !c.publicado?.drive?.remoto) throw Object.assign(new Error('no hay 4K ni copia en Drive'), { status: 409 });
    reservarHueco(c); guardarEst();
    subidas = subidas.then(() => subirYouTube(c));
    return publico(c);
  }
  for (const c of Object.values(est.clips)) if (['en cola', 'subiendo'].includes(c.publicado?.estado) && publicador.activo()) { c.publicado.estado = 'pendiente'; publicar(c); }   // tras reiniciar
  for (const c of Object.values(est.clips)) if (['en cola', 'subiendo'].includes(c.youtube?.estado) && c.publicado?.estado === 'listo') { c.youtube.estado = 'en cola'; subidas = subidas.then(() => subirYouTube(c)); }

  // ── métricas: una vez al día (desde la tarea de cada 15 min) — vistas, likes y retención de lo publicado → lo aprendido ──
  let midiendo = null;
  function medibles() { return Object.values(est.clips).filter(c => c.estado === 'aprobado' && (c.publicado?.estado === 'listo' || c.youtube?.id || c.vinculos) && Date.now() - (c.decidido || 0) < 60 * 864e5); }
  function cuentas() {
    const out = {};
    for (const f of conf.fuentes) { const k = f.perfil && kits.obtener(f.perfil); for (const [p, h] of Object.entries(k?.cuentas || {})) if (!out[p]) out[p] = h; }
    return out;
  }
  async function actualizarMetricas() {
    if (midiendo) return midiendo;
    midiendo = (async () => {
      const clips = medibles();
      const r = await metricas.medir(clips, cuentas());
      for (const c of clips) {
        const p = r.pares[c.id]; if (!p) continue;
        c.metricas = { ...(c.metricas || {}) };
        for (const [plat, v] of Object.entries(p)) c.metricas[plat] = { id: v.id, url: v.url, titulo: v.titulo, fecha: v.fecha, duracion: v.duracion, vistas: v.vistas, likes: v.likes, comentarios: v.comentarios,
          ...(v.compartidos != null ? { compartidos: v.compartidos } : {}), ...(v.retencion != null ? { retencion: v.retencion, segundosMedios: v.segundosMedios } : {}), como: v.como, at: Date.now() };
      }
      const k = conf.fuentes[0]?.perfil ? kits.obtener(conf.fuentes[0].perfil) : null;
      aprendido = { ...metricasMod.aprender(Object.values(est.clips).filter(c => c.metricas), r.canal, { zona: zonaDe(k) }), errores: r.errores,
        canal: { youtube: r.canal.youtube?.length || 0, tiktok: r.canal.tiktok?.length || 0 } };
      guardarJ(FA, aprendido);
      est.metricasEn = Date.now(); guardarEst();
      bus?.emit('lotes', { tipo: 'metricas', muestras: aprendido.muestras });
      return aprendido;
    })().finally(() => { midiendo = null; });
    return midiendo;
  }

  // ── 3. decisiones del usuario ──
  function decidir(id, accion, { estilo } = {}) {
    const c = est.clips[id]; if (!c) throw Object.assign(new Error('no existe ese clip'), { status: 404 });
    const f = fuenteDe(c.fuente);
    const base = f ? path.join(carpetaFuente(f), `${c.fecha}_${c.stream}`) : null;
    const original = base ? path.join(base, 'originales', c.archivo) : null;
    if (accion === 'rehacer') {
      if (c.estado === 'editando' || c.estado === 'en cola') return publico(c);
      if (estilo && !estilos.ESTILOS[estilo]) throw Object.assign(new Error(`estilo desconocido: ${estilo}`), { status: 400 });
      c.estiloForzado = estilo || (f?.estilos?.length ? f.estilos : ESTILOS_DEFECTO).find(e => e !== c.estilo);
      c.estado = 'en cola'; cola.push(id); guardarEst(); procesar();
    } else if (accion === 'repetir') {                   // misma edición y mismo estilo (p. ej. tras mejorar la transcripción)
      if (c.estado === 'editando' || c.estado === 'en cola') return publico(c);
      if (!['revisar', 'error'].includes(c.estado)) throw Object.assign(new Error('solo se repiten clips en revisión'), { status: 409 });
      c.estiloForzado = c.estilo;
      c.estado = 'en cola'; cola.push(id); guardarEst(); procesar();
    } else if (accion === 'aprobar') {
      if (!c.mp4 || !fs.existsSync(c.mp4)) throw Object.assign(new Error('el clip no tiene vídeo editado'), { status: 409 });
      const destino = path.join(carpetaFuente(f || { id: c.fuente }), 'aprobados', c.fecha);
      fs.mkdirSync(destino, { recursive: true });
      const nombre = `${c.fecha} ${c.stream} ${String(c.rank).padStart(2, '0')} - ${c.estilo}`;
      for (const [k, ext] of [['mp4', '.mp4'], ['srt', '.srt']]) if (c[k] && fs.existsSync(c[k])) { const d = path.join(destino, nombre + ext); fs.renameSync(c[k], d); c[k] = d; }
      // la portada elegida va con el vídeo (JPG + .pcraft para retocarla); las otras se borran
      const elegida = c.portadas?.[c.portada || 0];
      if (elegida && fs.existsSync(elegida.jpg)) {
        const p = { t: elegida.t };
        for (const [k, ext] of [['jpg', '.jpg'], ['pcraft', '.pcraft']]) if (elegida[k] && fs.existsSync(elegida[k])) { p[k] = path.join(destino, `${nombre} - portada${ext}`); fs.renameSync(elegida[k], p[k]); }
        borrar(archivosPortadas(c).filter(f => f !== elegida.jpg && f !== elegida.pcraft));
        c.portadas = [p]; c.portada = 0;
      }
      c.estado = 'aprobado'; c.decidido = Date.now();
      encolarRedes(c);                                   // títulos es/en + inglés, antes del 4K (usa el vídeo de origen)
      // la versión 4K para subir (salvo exportar4k: false); las fuentes se borran cuando termine
      if (conf.exportar4k !== false && f?.exportar4k !== false && c.proyecto && fs.existsSync(c.proyecto)) { guardarEst(); encolar4k(c); }
      else { guardarEst(); procesar(); }                 // sin 4K, las fuentes se borran al terminar lo de redes
    } else if (accion === 'descartar') {
      for (const k of ['mp4', 'srt', 'previa', 'proyecto']) if (c[k]) fs.rmSync(c[k], { force: true });
      if (original) fs.rmSync(original, { force: true });
      borrar(archivosPortadas(c)); c.portadas = [];
      c.estado = 'descartado'; c.decidido = Date.now();
    } else throw Object.assign(new Error('acción'), { status: 400 });
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    return publico(c);
  }

  // ── 4. cambios pedidos desde Revisión: en palabras ("quita la vibración salvo de 0:40 a 0:55, más suave") o ya concretos ──
  // se guardan en c.ajustes (se acumulan) y el clip se rehace con el mismo estilo; la transcripción sale de la caché
  const ENUM_IGUAL = (...v) => ({ type: 'string', enum: ['igual', ...v] });
  async function interpretar(c, pedido) {
    if (!generarJSON) throw Object.assign(new Error('no hay modelo para entender el pedido; usa los controles'), { status: 400 });
    const dur = Math.round(c.fin - c.inicio);
    const v = vista(c);                                  // los tiempos que dice el usuario son los del vídeo que está viendo
    const r = await generarJSON({ modelo: modelo?.(), system: 'Traduces lo que pide un streamer sobre un clip vertical ya editado a ajustes concretos del editor. Solo cambias lo que pide; lo demás "igual".',
      prompt: `El vídeo editado dura ${Math.round(v.duracion)} s${v.dA ? ` (los primeros ${v.dA} s son el avance)` : ''}. Da TODOS los tiempos tal como los dice el usuario, en segundos del vídeo editado ("1:05" = 65); `
        + `no los recalcules. Estilo actual: ${c.estilo}. `
        + `Cambios de escena actuales: ${(c.escenas || []).map(e => `${e.tipo} ${Math.round(e.desde)}–${Math.round(e.hasta)} s`).join(', ') || 'ninguno'}. `
        + `Diseños actuales: ${(c.plan?.disenos || []).map(d => `${d.tipo} ${Math.round(d.desde)}–${Math.round(d.hasta)} s`).join(', ') || 'ninguno'}. `
        + `Efectos de sonido: ${c.plan?.sonidos?.length || 0}. Emojis: ${(c.plan?.emojis || []).map(e => `${e.emoji} ${Math.round(e.t)} s`).join(', ') || '—'}. `
        + `Ajustes ya aplicados: ${JSON.stringify(c.ajustes || {})}.\n\nLo que pide: "${pedido}"\n\n`
        + 'temblor = la vibración/sacudida de pantalla: "quitar" (ninguna), "tramos" (solo en esos tramos, p. ej. "que solo vibre de 40 a 55"), "intensidad" (la automática más suave/fuerte); intensidad 0–100 = % de la máxima (la actual es 100; "suave" ≈ 25, "media" ≈ 50). '
        + 'avance = repetir un TROZO DEL VÍDEO al principio como adelanto y luego el clip entero ("que empiece con el accidente de 0:45 a 0:47", "recap", "gancho del segundo X", "adelanto"): da desde/hasta en segundos; quitarAvance = true si pide quitarlo. '
        + 'recorte = dónde EMPIEZA y/o dónde TERMINA el clip ("que termine en 1:37", "que empiece en 0:10", "corta el final desde 2:00"): desde y/o hasta (lo que no diga, sin poner); quitarRecorte = true si pide el clip entero otra vez. '
        + 'efectos = los golpes automáticos (zoom, destellos, glitch…). escenas = los cambios de escena (acercamientos a la cara). '
        + 'disenos = la composición de las cámaras por tramos: pantalla (zoom a la cabina/juego con la cámara de la cara en una VENTANITA flotante) , podcast (pantalla partida arriba cara / abajo cabina) y enfoque (la pantalla partida + los pedales en una burbuja flotante; para explicaciones); modo "quitar" (sin ninguno), "lista" (exactamente los que pide, con desde/hasta; incluye los actuales que quiera conservar), "auto" (que el director decida otra vez). '
        + 'sonidos = los efectos de sonido (whoosh, impacto, claxon…): "si" / "no". nuevoPlan = true si pide otra edición distinta / otras ideas / rehacerlo de cero. '
        + 'gancho = SOLO el TEXTO del título que sale al principio ("-" para quitarlo, "" = igual); nunca pongas tiempos en el gancho. '
        + 'Si un comentario va con su momento ("En 0:12 …"), cambia SOLO eso y en ese momento: '
        + 'correcciones = el subtítulo dice algo mal ("no dice X, dice Y", "se escribe Chuy") → [{t, mal: las palabras tal como salen ahora, bien: como deberían}]; '
        + 'quitarEmojis = [t] donde sobra un emoji; sinEfectos = [{desde, hasta}] donde sobra un zoom/golpe/cambio de escena (unos 2 s alrededor si dice solo un momento); '
        + 'rotulos = [{t, nombre, sub}] para poner un rótulo con un nombre ("pon el nombre de Don Chuy cuando lo saluda", sub = @usuario o lo que diga). '
        + 'respuesta = una frase corta que confirma lo que vas a cambiar.',
      schema: { type: 'object', properties: {
        estilo: { type: 'string', enum: ['igual', ...Object.keys(estilos.ESTILOS)] },
        temblor: { type: 'object', properties: { modo: ENUM_IGUAL('quitar', 'tramos', 'intensidad'), intensidad: { type: 'number' }, tramos: { type: 'array', items: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' } }, required: ['desde', 'hasta'] } } }, required: ['modo'] },
        efectos: ENUM_IGUAL('auto', 'no'), escenas: ENUM_IGUAL('auto', 'no'), emojis: ENUM_IGUAL('si', 'no'),
        look: ENUM_IGUAL('ninguno', ...Object.keys(require('./efectos').LOOKS)), gancho: { type: 'string' }, respuesta: { type: 'string' },
        avance: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' } } }, quitarAvance: { type: 'boolean' },
        recorte: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' } } }, quitarRecorte: { type: 'boolean' },
        disenos: { type: 'object', properties: { modo: ENUM_IGUAL('quitar', 'lista', 'auto'), lista: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: ['pantalla', 'podcast', 'enfoque'] }, desde: { type: 'number' }, hasta: { type: 'number' }, esquina: { type: 'string', enum: ['derecha', 'izquierda'] } }, required: ['tipo', 'desde', 'hasta'] } } }, required: ['modo'] },
        sonidos: ENUM_IGUAL('si', 'no'), nuevoPlan: { type: 'boolean' },
        correcciones: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, mal: { type: 'string' }, bien: { type: 'string' } }, required: ['mal', 'bien'] } },
        quitarEmojis: { type: 'array', items: { type: 'number' } },
        sinEfectos: { type: 'array', items: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' } }, required: ['desde', 'hasta'] } },
        rotulos: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, nombre: { type: 'string' }, sub: { type: 'string' } }, required: ['t', 'nombre'] } },
      }, required: ['temblor', 'respuesta'] } });
    const d = r?.datos || r || {};
    const aj = {};
    if (d.estilo && d.estilo !== 'igual') aj.estilo = d.estilo;
    const tb = d.temblor || {};
    if (tb.modo === 'quitar') aj.temblor = false;
    else if (tb.modo === 'tramos' && tb.tramos?.length) aj.temblor = { tramos: tb.tramos.map(x => [v.aOrig(+x.desde), v.aOrig(+x.hasta)]), ...(tb.intensidad != null ? { intensidad: +tb.intensidad } : {}) };
    else if (tb.modo === 'intensidad' && tb.intensidad != null) aj.temblor = { intensidad: +tb.intensidad };
    if (d.efectos && d.efectos !== 'igual') aj.efectos = d.efectos;
    if (d.escenas && d.escenas !== 'igual') aj.escenas = d.escenas;
    if (d.emojis && d.emojis !== 'igual') aj.emojis = d.emojis === 'si';
    if (d.look && d.look !== 'igual') aj.look = d.look === 'ninguno' ? false : d.look;
    if (d.gancho === '-') aj.gancho = false;
    else if (d.gancho && d.gancho !== 'igual' && !/\d:\d\d/.test(d.gancho)) aj.gancho = d.gancho;   // un "0:45 - 0:47" no es un título
    const ds = d.disenos || {};                           // tiempos del vídeo editado = los del plan (no se pasan al original)
    if (ds.modo === 'quitar') aj.disenos = false;
    else if (ds.modo === 'lista' && ds.lista?.length) aj.disenos = ds.lista.map(x => ({ tipo: x.tipo, desde: +x.desde, hasta: +x.hasta, esquina: x.esquina || 'derecha' }));
    else if (ds.modo === 'auto') { aj.disenos = null; aj.nuevoPlan = true; }
    if (d.sonidos === 'no') aj.sonidos = false; else if (d.sonidos === 'si') aj.sonidos = null;
    if (d.nuevoPlan) aj.nuevoPlan = true;
    if (d.quitarAvance) aj.avance = null;
    else if (d.avance && +d.avance.hasta > +d.avance.desde && +d.avance.desde >= 0) {
      const av = [v.aOrig(+d.avance.desde), v.aOrig(+d.avance.hasta)];
      if (av[1] > av[0] && av[1] <= dur + 1) aj.avance = av;
    }
    if (d.quitarRecorte) aj.recorte = null;
    else if (d.recorte && (d.recorte.desde != null || d.recorte.hasta != null)) {
      const actual = c.ajustes?.recorte || [0, dur];
      // un "empieza en" que cae dentro del avance = el inicio de siempre
      const rc = [d.recorte.desde != null && +d.recorte.desde > v.dA ? v.aOrig(+d.recorte.desde) : actual[0],
        d.recorte.hasta != null ? v.aOrig(+d.recorte.hasta) : actual[1]].map(x => Math.min(dur, Math.max(0, +x.toFixed(2))));
      if (rc[1] - rc[0] >= 3) aj.recorte = rc;
    }
    // por momentos: las correcciones de texto van en tiempos del clip original (se aplican a la transcripción); lo demás, del
    // vídeo editado (es donde están los emojis, los golpes y los rótulos)
    const num = x => (Number.isFinite(+x) ? +(+x).toFixed(2) : null);
    const corr = (d.correcciones || []).filter(x => String(x.mal || '').trim() && String(x.bien || '').trim() && x.mal !== x.bien)
      .map(x => ({ ...(num(x.t) != null ? { t: v.aOrig(num(x.t)) } : {}), mal: String(x.mal).slice(0, 120), bien: String(x.bien).slice(0, 120) }));
    if (corr.length) aj.correcciones = corr;
    const qe = (d.quitarEmojis || []).map(num).filter(x => x != null && x >= 0);
    if (qe.length) aj.quitarEmojis = qe;
    const sf = (d.sinEfectos || []).map(x => [num(x.desde), num(x.hasta)]).filter(([a1, b]) => a1 != null && b != null && b > a1);
    if (sf.length) aj.sinEfectos = sf;
    const ro = (d.rotulos || []).filter(x => String(x.nombre || '').trim() && num(x.t) != null).map(x => ({ t: num(x.t), nombre: String(x.nombre).slice(0, 40), sub: String(x.sub || '').slice(0, 50) }));
    if (ro.length) aj.rotulos = ro;
    return { ajustes: aj, respuesta: String(d.respuesta || '') };
  }

  const claveMontaje = c => JSON.stringify([c.ajustes?.avance || null, c.ajustes?.recorte || null]);

  // tiempos del vídeo editado (con avance delante y recortado) ↔ tiempos del clip original
  function vista(c) {
    const av = c.ajustes?.avance, rc = c.ajustes?.recorte, dur = c.fin - c.inicio;
    const dA = av ? av[1] - av[0] : 0, rd = rc ? rc[0] : 0, rh = rc ? rc[1] : dur;
    return { dA, duracion: dA + rh - rd, aOrig: t => +(t < dA ? av[0] + t : t - dA + rd).toFixed(2), aVista: o => +(o - rd + dA).toFixed(2) };
  }

  // comentarios por momento (Revisión: "💬 en este momento"): [{ t: s del vídeo editado, texto }] → un pedido con los tiempos delante
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pedidoDeComentarios = cs => cs.filter(x => String(x?.texto || '').trim()).slice(0, 20)
    .map(x => (Number.isFinite(+x.t) ? `En ${mmss(+x.t)} (segundo ${(+x.t).toFixed(1)}): ${String(x.texto).trim().slice(0, 300)}` : String(x.texto).trim().slice(0, 300))).join('\n');

  async function modificar(id, { pedido, ajustes, comentarios } = {}) {
    const c = est.clips[id]; if (!c) throw Object.assign(new Error('no existe ese clip'), { status: 404 });
    if (!['revisar', 'error'].includes(c.estado)) throw Object.assign(new Error('el clip se está editando; espera a que termine'), { status: 409 });
    if (Array.isArray(comentarios) && comentarios.length) pedido = [pedidoDeComentarios(comentarios), pedido].filter(x => x && String(x).trim()).join('\n');
    let aj = ajustes && typeof ajustes === 'object' ? ajustes : {}, respuesta = '';
    if (pedido && String(pedido).trim()) ({ ajustes: aj, respuesta } = await interpretar(c, String(pedido).trim().slice(0, 3000)));
    if (!Object.keys(aj).length) throw Object.assign(new Error('no entendí qué cambiar; dilo de otra forma'), { status: 400 });
    if (aj.nuevoPlan) { c.plan = null; aj = { ...aj }; delete aj.nuevoPlan; }   // el director vuelve a decidir la edición
    const antes = c.ajustes?.temblor, vAntes = vista(c), montajeAntes = claveMontaje(c);
    for (const k of ACUMULABLES) if (Array.isArray(aj[k]) && Array.isArray(c.ajustes?.[k])) aj = { ...aj, [k]: [...c.ajustes[k], ...aj[k]] };
    c.ajustes = { ...(c.ajustes || {}), ...aj };
    // si cambia el montaje (avance/recorte), lo marcado en tiempos del vídeo editado (lo de antes y lo de este pedido: todo se
    // dijo mirando el vídeo de antes) se recoloca para que siga en su sitio
    if (claveMontaje(c) !== montajeAntes) {
      const vNueva = vista(c), mover = s => vNueva.aVista(vAntes.aOrig(s));
      const aj2 = c.ajustes;
      if (aj2.quitarEmojis) aj2.quitarEmojis = aj2.quitarEmojis.map(mover);
      if (aj2.sinEfectos) aj2.sinEfectos = aj2.sinEfectos.map(([d, h]) => [mover(d), mover(h)]);
      if (aj2.rotulos) aj2.rotulos = aj2.rotulos.map(r => ({ ...r, t: mover(r.t) }));
    }
    // "más suave" después de "solo de 40 a 55": se quedan los tramos con la nueva intensidad
    if (aj.temblor && typeof aj.temblor === 'object' && !aj.temblor.tramos && antes?.tramos) c.ajustes.temblor = { ...antes, ...aj.temblor };
    for (const [k, v] of Object.entries(c.ajustes)) if (v === null) delete c.ajustes[k];   // null = quitar ese ajuste (vuelve a lo automático)
    if (pedido) (c.pedidos = c.pedidos || []).push({ texto: String(pedido).slice(0, 600), respuesta, cuando: Date.now(), ...(comentarios?.length ? { comentarios: comentarios.length } : {}) });
    c.estiloForzado = c.ajustes.estilo || c.estilo;
    c.estado = 'en cola'; cola.push(id); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar();
    return { clip: publico(c), ajustes: c.ajustes, respuesta };
  }

  // editor de subtítulos de Revisión: se ven y se editan en tiempos del vídeo editado; se guardan en tiempos del clip original
  // (ajustes.subtitulosFijos) para que sigan en su sitio si luego cambia el avance o el recorte
  function subtitulos(id) {
    const c = est.clips[id]; if (!c) throw Object.assign(new Error('no existe ese clip'), { status: 404 });
    const v = vista(c);
    let srt = ''; try { srt = c.srt && fs.existsSync(c.srt) ? fs.readFileSync(c.srt, 'utf8') : ''; } catch { }
    // los del avance son una copia de los del clip: se ven pero se editan en su sitio
    const lista = redes.leerSrt(srt).map(x => ({ s: +x.s.toFixed(2), e: +x.e.toFixed(2), texto: x.texto, ...(x.s < v.dA - 0.01 ? { adelanto: true } : {}) }));
    return { subtitulos: lista, dA: v.dA, duracion: v.duracion, aMano: !!c.ajustes?.subtitulosFijos };
  }
  function guardarSubtitulos(id, { subtitulos: lista, restaurar } = {}) {
    const c = est.clips[id]; if (!c) throw Object.assign(new Error('no existe ese clip'), { status: 404 });
    if (!['revisar', 'error'].includes(c.estado)) throw Object.assign(new Error('el clip se está editando; espera a que termine'), { status: 409 });
    c.ajustes = { ...(c.ajustes || {}) };
    if (restaurar) delete c.ajustes.subtitulosFijos;
    else {
      if (!Array.isArray(lista)) throw Object.assign(new Error('faltan los subtítulos'), { status: 400 });
      const v = vista(c);
      const fijos = lista.filter(x => !x.adelanto && String(x.texto || '').trim() && +x.e > +x.s && +x.s >= v.dA - 0.01)
        .map(x => ({ s: v.aOrig(Math.max(v.dA, +x.s)), e: v.aOrig(+x.e), texto: String(x.texto).replace(/\s+/g, ' ').trim().slice(0, 120) }))
        .filter(x => x.e > x.s).sort((x, y) => x.s - y.s);
      if (!fijos.length) throw Object.assign(new Error('no queda ningún subtítulo'), { status: 400 });
      c.ajustes.subtitulosFijos = fijos;
      delete c.ajustes.correcciones;                     // ya van dentro del texto editado
    }
    (c.pedidos = c.pedidos || []).push({ texto: restaurar ? 'subtítulos automáticos otra vez' : 'subtítulos editados a mano', respuesta: '', cuando: Date.now() });
    c.estiloForzado = c.estilo;
    c.estado = 'en cola'; cola.push(id); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar();
    return publico(c);
  }

  // abre el proyecto en FilmCraft con ventana; "exportar" (después de guardar allí) lo vuelve a exportar tal cual
  async function abrir(id) {
    const c = est.clips[id]; if (!c?.proyecto) throw Object.assign(new Error('el clip no tiene proyecto'), { status: 409 });
    return subtitulador.abrirEnApp(c.proyecto);
  }
  function reexportar(id) {
    const c = est.clips[id]; if (!c?.proyecto) throw Object.assign(new Error('el clip no tiene proyecto'), { status: 409 });
    if (!['revisar', 'error'].includes(c.estado)) throw Object.assign(new Error('el clip se está editando; espera a que termine'), { status: 409 });
    c.reexportar = true; c.estado = 'en cola'; cola.push(id); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar();
    return publico(c);
  }

  // limpieza: pendientes viejos (y sus originales) fuera; el registro de decididos se queda 30 días
  function limpiar() {
    const ahora = Date.now(), dia = 864e5;
    for (const c of Object.values(est.clips)) {
      if (c.estado === 'revisar' && ahora - (c.editado || c.creado) > conf.retencionDias * dia) decidir(c.id, 'descartar');
      if ((c.estado === 'descartado' || c.estado === 'aprobado') && ahora - (c.decidido || 0) > 30 * dia) delete est.clips[c.id];
    }
    guardarEst();
  }

  const publico = c => ({ ...c, original: undefined, cajas: undefined });
  const estado = () => ({ config: conf, enCurso, cola: [...cola], revisando,
    clips: Object.values(est.clips).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || a.rank - b.rank).map(publico),
    estilos: estilos.lista(), youtube: { ...youtube.estado(), ...confYT() }, aprendido, metricasEn: est.metricasEn || null, midiendo: !!midiendo,
    diccionario: Object.fromEntries([...new Set(conf.fuentes.map(f => f.perfil).filter(Boolean))].map(k => [k, diccionario.lista(k).length])) });
  const kitPorDefecto = () => conf.fuentes.find(f => f.perfil)?.perfil || null;
  // un enlace de YouTube o TikTok → { plataforma, id }
  function enlaceA(url) {
    const u = String(url || '').trim();
    let m = u.match(/tiktok\.com\/.*\/video\/(\d+)/); if (m) return { plataforma: 'tiktok', id: m[1] };
    m = u.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([\w-]{11})/); if (m) return { plataforma: 'youtube', id: m[1] };
    throw Object.assign(new Error('pon un enlace de YouTube o de TikTok'), { status: 400 });
  }

  // tarea interna cada 15 min (la crea programar(), que solo llama el daemon)
  tareas?.registrarInterna('lotes', async () => {
    await revisar(); limpiar(); reintentarYouTube();
    if (Date.now() - (est.metricasEn || 0) > 20 * 3600e3 && medibles().length) actualizarMetricas().catch(e => log('[lotes] métricas', e.message));
    return '';
  });
  function programar() {
    if (!tareas) return;
    const ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === 'lotes');
    const hay = conf.fuentes.some(f => f.activa !== false);
    if (hay && !ya) tareas.crear({ nombre: 'Editor automático de clips', cuando: { cron: '*/15 * * * *' }, accion: { tipo: 'interna', nombre: 'lotes' } });
    if (!hay && ya) tareas.borrar(ya.id);
    if (cola.length) procesar();
  }

  // ── 5. clip pedido a mano: un tramo de un stream que ya conocemos (p. ej. 1:30:00–1:35:00) ──
  // se descarga de YouTube en el PC (yt-dlp, solo ese tramo, vertical) y entra en la cola con los ajustes que se pidan
  async function nuevo({ stream, desde, hasta, ajustes = {}, titulo } = {}) {
    const ref = Object.values(est.clips).find(x => x.stream === stream);
    if (!ref) throw Object.assign(new Error(`no conozco el stream ${stream}`), { status: 404 });
    desde = +desde; hasta = +hasta;
    if (!(desde >= 0) || !(hasta - desde >= 10) || hasta - desde > 900) throw Object.assign(new Error('el tramo tiene que durar entre 10 s y 15 min'), { status: 400 });
    const f = conf.fuentes.find(x => x.id === ref.fuente) || { id: ref.fuente };
    const rank = Math.max(0, ...Object.values(est.clips).filter(x => x.stream === stream).map(x => x.rank || 0)) + 1;
    const dur = Math.round(hasta - desde);
    const archivo = `${String(rank).padStart(2, '0')}_${String(Math.round(desde)).padStart(5, '0')}_${dur}s.mp4`;
    const id = `${ref.fuente}_${stream}_${String(rank).padStart(2, '0')}`;
    const c = est.clips[id] = { id, fuente: ref.fuente, stream, titulo: ref.titulo, fecha: ref.fecha, carpeta: ref.carpeta, rank, archivo, inicio: desde, fin: hasta,
      estado: 'descargando', creado: Date.now(), manual: true, ajustes: ajustes && typeof ajustes === 'object' ? ajustes : {}, ...(titulo ? { tituloClip: String(titulo) } : {}) };
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    const destino = path.join(carpetaFuente(f), `${ref.fecha}_${stream}`, 'originales', archivo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    // el tramo: yt-dlp solo da los enlaces directos (vídeo y audio) y lo corta NUESTRO ffmpeg (-nostdin, sin recodificar).
    // Con --download-sections el ffmpeg que lanza yt-dlp se caía dentro de APOLO ("ffmpeg exited with code 3436169992")
    // aunque desde una terminal funcionaba; así es el mismo ffmpeg que ya corta y exporta todo lo demás
    const corre = (cmd, a, timeout) => new Promise((ok, mal) => ejecutar(cmd, a, { windowsHide: true, timeout, maxBuffer: 64 << 20 },
      (e, out, err) => (e ? mal(Object.assign(new Error(String(err || e.message || '').trim().split('\n').slice(-3).join(' ').slice(0, 400) || 'falló'), { completo: String(err || '') })) : ok(String(out || '')))));
    // con las cabeceras que usa yt-dlp (navegador, idioma…): sin ellas el servidor de vídeo de YouTube contesta a veces 403
    const formatos = async () => {
      const j = JSON.parse(await corre(cfg?.craft?.python || 'python', ['-m', 'yt_dlp', '-q', '--no-warnings', '-j', '-f', 'bv*[height<=1920][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1920]+ba',
        `https://www.youtube.com/watch?v=${stream}`], 120_000));
      const fs_ = (j.requested_formats || [j]).filter(x => /^https?:/.test(x.url || '')).slice(0, 2);
      if (!fs_.length) throw new Error('YouTube no dio enlaces del vídeo');
      return fs_;
    };
    const bajar = async (intento = 1) => {
      const fs_ = await formatos();
      const parcial = destino + '.tmp.mp4', dur = String(hasta - desde);
      const entradas = fs_.flatMap(x => {
        const h = x.http_headers || {}, otras = Object.entries(h).filter(([k]) => k !== 'User-Agent').map(([k, v]) => `${k}: ${v}\r\n`).join('');
        return [...(h['User-Agent'] ? ['-user_agent', h['User-Agent']] : []), ...(otras ? ['-headers', otras] : []), '-ss', String(desde), '-t', dur, '-i', x.url];
      });
      try {
        await corre(cfg?.craft?.ffmpeg || 'ffmpeg', ['-nostdin', '-v', 'error', '-y', ...entradas, '-map', '0:v:0', '-map', fs_.length > 1 ? '1:a:0' : '0:a:0', '-c', 'copy', '-movflags', '+faststart', parcial], 1_800_000);
      } catch (e) {
        try { fs.rmSync(parcial, { force: true }); } catch { }
        if (intento < 2 && /403|Forbidden|Server returned/i.test(e.message)) return bajar(intento + 1);   // enlaces nuevos y otra vez
        throw e;
      }
      if (!fs.existsSync(parcial) || fs.statSync(parcial).size < 10_000) throw new Error('ffmpeg no dejó el tramo');
      fs.renameSync(parcial, destino);
    };
    (fs.existsSync(destino) ? Promise.resolve() : bajar().catch(e => {   // el error entero, a un archivo (aquí solo cabe una línea)
      try { fs.appendFileSync(path.join(dir, 'descargas.log'), `${new Date().toISOString()} ${id}\n${e.completo || e.stack}\n\n`); } catch { }
      throw e;
    }))
      .then(() => { c.estado = 'en cola'; cola.push(id); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar(); })
      .catch(e => { c.estado = 'error'; c.error = `no se pudo descargar el tramo: ${String(e.message).slice(0, 300)}`; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); });
    return publico(c);
  }

  // ── 6. un clip de Medal elegido en el panel: se trae al PC, se pasa a vertical si hace falta y entra en la cola ──
  // formato: vertical (la partida entera en medio con el fondo desenfocado) · recorte (zoom al centro, llena la pantalla) ·
  // horizontal (tal cual)
  const FORMATOS = ['vertical', 'recorte', 'horizontal'];
  const FILTROS = {
    vertical: '[0:v]split=2[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.06[f];[b]scale=1080:-2[g];[f][g]overlay=(W-w)/2:(H-h)/2,setsar=1[v]',
    recorte: '[0:v]scale=-2:1920,crop=1080:1920,setsar=1[v]',
  };
  async function desdeMedal({ id, formato = 'vertical', titulo, estilo, ajustes = {} } = {}) {
    if (!medal) throw Object.assign(new Error('Medal no está disponible'), { status: 409 });
    if (!FORMATOS.includes(formato)) throw Object.assign(new Error(`formato: ${FORMATOS.join(' | ')}`), { status: 400 });
    if (estilo && !estilos.ESTILOS[estilo]) throw Object.assign(new Error(`estilo desconocido: ${estilo}`), { status: 400 });
    const m = (await medal.cargar()).clips.find(x => x.id === String(id || ''));
    if (!m) throw Object.assign(new Error('ese clip no está en Medal'), { status: 404 });
    if (m.tipo !== 'clip') throw Object.assign(new Error('eso es una captura, no un clip'), { status: 400 });
    const stream = String(m.id).replace(/[^\w-]/g, '_'), cid = `medal_${stream}`;
    const ya = est.clips[cid];
    if (ya && !['descartado', 'error'].includes(ya.estado)) return publico(ya);   // ya está (en cola, editándose o en Revisión)
    const fecha = new Date(m.fecha || Date.now()).toISOString().slice(0, 10);
    const propio = m.titulo && !/^untitled/i.test(m.titulo) ? m.titulo : '';
    const c = est.clips[cid] = { id: cid, fuente: 'medal', stream, titulo: `${m.juego || 'Medal'}${propio ? ` · ${propio}` : ''}`, juego: m.juego || null, medal: { id: m.id, compartir: m.compartir },
      fecha, carpeta: null, rank: 1, archivo: `${stream}.mp4`, inicio: 0, fin: +(m.duracion || 0).toFixed(2), formato, estado: 'descargando', creado: Date.now(), manual: true,
      ajustes: ajustes && typeof ajustes === 'object' ? ajustes : {}, ...(titulo || propio ? { tituloClip: String(titulo || propio) } : {}), ...(estilo ? { estiloForzado: estilo } : {}) };
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    const destino = path.join(carpetaFuente(FUENTE_MEDAL), `${fecha}_${stream}`, 'originales', c.archivo);
    (async () => {
      const bajado = await medal.traer(m.id);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const md = await medir(bajado, { ffmpeg: cfg?.craft?.ffmpeg, ligero: true });
      if (md.duracion) c.fin = +(+md.duracion).toFixed(2);
      if (formato === 'horizontal' || !(md.ancho > md.alto)) fs.copyFileSync(bajado, destino);
      else await sh(cfg?.craft?.ffmpeg || 'ffmpeg', ['-y', '-v', 'error', '-i', bajado, '-filter_complex', FILTROS[formato], '-map', '[v]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', destino], { timeout: 1_800_000 });
    })()
      .then(() => { c.estado = 'en cola'; c.error = null; cola.push(cid); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar(); })
      .catch(e => { c.estado = 'error'; c.error = `no se pudo preparar el clip de Medal: ${String(e.message).slice(0, 300)}`; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); });
    return publico(c);
  }

  async function http(M, p, b = {}, consulta = {}) {   // /v1/revision
    if (M === 'GET' && !p[2]) return estado();
    if (M === 'POST' && p[2] === 'revisar') return revisar();
    if (M === 'POST' && p[2] === 'nuevo') return nuevo(b);
    if (M === 'PATCH' && p[2] === 'config') {
      if (b.salida) conf.salida = String(b.salida);
      if (b.retencionDias) conf.retencionDias = Math.max(1, +b.retencionDias);
      if (Array.isArray(b.fuentes)) conf.fuentes = b.fuentes;
      guardarConf(); programar(); return { config: conf };
    }
    // YouTube del canal: GET estado · POST {cliente: JSON de Google} · POST {activo, programar} · POST conectar · POST desconectar
    if (p[2] === 'youtube') {
      if (M === 'GET') return { ...youtube.estado(), ...confYT() };
      if (M === 'POST' && p[3] === 'conectar') {
        const r = await youtube.conectar();
        youtube.esperarConexion()?.then(() => { conf.youtube = { ...confYT(), activo: true }; guardarConf(); bus?.emit('aviso-externo', { origen: 'Clips', urgente: false, texto: `📺 YouTube conectado${youtube.estado().canal ? `: ${youtube.estado().canal.titulo}` : ''}. Los clips aprobados se suben y se programan solos.` }); }).catch(() => { });
        return r;
      }
      if (M === 'POST' && p[3] === 'desconectar') { conf.youtube = { ...confYT(), activo: false }; guardarConf(); return { ...youtube.desconectar(), ...confYT() }; }
      if (M === 'POST') {
        if (b.cliente) youtube.ponerCliente(b.cliente);
        if (typeof b.activo === 'boolean' || typeof b.programar === 'boolean') {
          conf.youtube = { ...confYT(), ...(typeof b.activo === 'boolean' ? { activo: b.activo } : {}), ...(typeof b.programar === 'boolean' ? { programar: b.programar } : {}) }; guardarConf();
        }
        return { ...youtube.estado(), ...confYT() };
      }
    }
    if (p[2] === 'metricas') {                           // GET lo aprendido · POST medir ahora (tarda 1–3 min; se avisa por el bus)
      if (M === 'GET') return { aprendido, metricasEn: est.metricasEn || null, midiendo: !!midiendo, cuentas: cuentas() };
      if (M === 'POST') { actualizarMetricas().catch(e => log('[lotes] métricas', e.message)); return { iniciado: true }; }
    }
    if (p[2] === 'medal') {                              // GET ?juego&texto&limite · GET <id>/miniatura · POST {id, formato, titulo, estilo}
      if (!medal) throw Object.assign(new Error('Medal no está disponible'), { status: 409 });
      if (M === 'GET' && p[3] && p[4] === 'miniatura') {
        const f = await medal.miniatura(decodeURIComponent(p[3]), path.join(dir, 'medal-miniaturas'));
        if (!f) throw Object.assign(new Error('sin miniatura'), { status: 404 });
        return { __archivo: f };
      }
      if (M === 'GET') {
        const ca = await medal.cargar();
        const r = await medal.buscar({ juego: consulta.juego, texto: consulta.texto, tipo: 'clip', orden: consulta.orden || 'reciente', limite: Math.min(120, +consulta.limite || 60) });
        const en = Object.fromEntries(Object.values(est.clips).filter(x => x.medal).map(x => [x.medal.id, { id: x.id, estado: x.estado }]));
        return { instalado: ca.instalado, carpeta: ca.carpeta, errores: ca.errores, juegos: await medal.juegos(), total: r.total,
          clips: r.clips.map(x => ({ id: x.id, titulo: x.titulo, juego: x.juego, fecha: x.fecha, duracion: x.duracion, local: !!x.local, ancho: x.ancho, alto: x.alto, vistas: x.vistas, compartir: x.compartir, enRevision: en[x.id] || null })) };
      }
      if (M === 'POST') return desdeMedal(b);
    }
    if (p[2] === 'diccionario') {                        // GET ?kit · POST {kit, mal, bien} añade · POST {kit, quitar: mal} quita
      const kit = String((M === 'GET' ? consulta?.kit : b.kit) || kitPorDefecto() || '');
      if (!kit) throw Object.assign(new Error('no hay kit'), { status: 400 });
      if (M === 'POST' && b.quitar) diccionario.quitar(kit, b.quitar);
      else if (M === 'POST') diccionario.anadir(kit, b.mal, b.bien);
      return { kit, entradas: diccionario.lista(kit) };
    }
    const c = p[2] && est.clips[decodeURIComponent(p[2])];
    if (!c) throw Object.assign(new Error('no existe ese clip'), { status: 404 });
    if (M === 'GET' && p[3] === 'video') { if (!c.mp4 || !fs.existsSync(c.mp4)) throw Object.assign(new Error('sin vídeo'), { status: 404 }); return { __archivo: c.mp4 }; }
    if (M === 'GET' && p[3] === 'previa') { if (!c.previa || !fs.existsSync(c.previa)) throw Object.assign(new Error('sin vista previa'), { status: 404 }); return { __archivo: c.previa }; }
    if (M === 'GET' && p[3] === 'portada') {           // /v1/revision/<id>/portada/<n>
      const pt = c.portadas?.[+p[4] || 0];
      if (!pt?.jpg || !fs.existsSync(pt.jpg)) throw Object.assign(new Error('sin portada'), { status: 404 });
      return { __archivo: pt.jpg };
    }
    if (M === 'POST' && p[3] === 'portada') {          // elegir la portada que va con el vídeo (y al anuncio de Discord)
      const n = Math.round(+b.indice);
      if (!(n >= 0 && n < (c.portadas?.length || 0))) throw Object.assign(new Error('esa portada no existe'), { status: 400 });
      c.portada = n; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
      return publico(c);
    }
    if (M === 'POST' && ['aprobar', 'descartar', 'rehacer', 'repetir'].includes(p[3])) return decidir(c.id, p[3], b);
    if (M === 'POST' && p[3] === 'modificar') return modificar(c.id, b);
    if (M === 'GET' && p[3] === 'subtitulos') return subtitulos(c.id);
    if (M === 'POST' && p[3] === 'subtitulos') return guardarSubtitulos(c.id, b);
    if (M === 'POST' && p[3] === 'abrir') return abrir(c.id);
    if (M === 'POST' && p[3] === 'exportar') return reexportar(c.id);
    if (M === 'POST' && p[3] === '4k') {
      if (c.estado !== 'aprobado') throw Object.assign(new Error('primero apruébalo'), { status: 409 });
      encolar4k(c); return publico(c);
    }
    if (M === 'POST' && p[3] === 'publicar') {
      if (c.k4?.estado !== 'listo') throw Object.assign(new Error('todavía no hay 4K de este clip'), { status: 409 });
      return publicar(c);
    }
    if (M === 'POST' && p[3] === 'youtube') return aYouTube(c);
    if (M === 'POST' && p[3] === 'redes') {            // (re)hacer títulos es/en y lo de inglés de un aprobado (p. ej. de antes de tener esto)
      if (c.estado !== 'aprobado') throw Object.assign(new Error('primero apruébalo'), { status: 409 });
      if (b.textos === true) delete c.textos;
      encolarRedes(c); guardarEst(); procesar(); return publico(c);
    }
    if (M === 'POST' && p[3] === 'vincular') {         // "este clip es esta publicación" (si el emparejado automático no lo encontró)
      const { plataforma, id } = enlaceA(b.url);
      c.vinculos = { ...(c.vinculos || {}), [plataforma]: id };
      if (c.metricas?.[plataforma] && c.metricas[plataforma].id !== id) delete c.metricas[plataforma];
      guardarEst(); return publico(c);
    }
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  return { revisar, procesar, decidir, publicar, modificar, nuevo, interpretar, abrir, reexportar, limpiar, estado, programar, http, elegirEstilo, prepararRedes, actualizarMetricas, aYouTube, reintentarYouTube, desdeMedal, ESTILOS_DEFECTO };
}

module.exports = { crearLotes, ESTILOS_DEFECTO };
