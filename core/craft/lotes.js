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

const ESTILOS_DEFECTO = ['pop', 'karaoke', 'fuego', 'impacto', 'terror', 'atardecer', 'noche', 'tornado', 'arcoiris', 'oro'];
// ajustes que son listas y se ACUMULAN al pedir cambios (cada comentario añade el suyo)
const ACUMULABLES = ['correcciones', 'quitarEmojis', 'sinEfectos', 'rotulos'];

// miniaturas: crearMiniaturas (core/craft/miniatura.js) o nada (sin portadas); kits: crearKits; medir: calidad.medir (inyectables en tests)
function crearLotes({ cfg, bus, tareas, subtitulador, generarJSON, modelo, ejecutar = execFile, pedir, log = () => { }, miniaturas = null, kits = require('./kit').crearKits({ cfg }), medir = calidad.medir }) {
  const dir = path.join(cfg.dir, 'craft');
  const FC = path.join(dir, 'lotes.json'), FE = path.join(dir, 'lotes-estado.json');
  const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
  const guardarJ = (f, o) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  let conf = { salida: path.join(os.homedir(), 'Videos', 'APOLO'), retencionDias: 7, fuentes: [], ...leer(FC, {}) };
  const est = { vistos: {}, clips: {}, ...leer(FE, {}) };
  const guardarConf = () => guardarJ(FC, conf), guardarEst = () => guardarJ(FE, est);
  const cola = [];                                     // ids de clips por editar (en orden)
  let enCurso = null, revisando = false;
  for (const c of Object.values(est.clips)) if (c.estado === 'editando' || c.estado === 'en cola') { c.estado = 'en cola'; cola.push(c.id); }   // tras reiniciar
  for (const c of Object.values(est.clips)) if (c.estado === 'descargando') { c.estado = 'error'; c.error = 'la descarga se cortó al reiniciar; pídelo otra vez'; }
  // exportaciones 4K pendientes (van en la misma cola como "4k:<id>")
  for (const c of Object.values(est.clips)) if (c.estado === 'aprobado' && ['en cola', 'exportando'].includes(c.k4?.estado)) { c.k4 = { estado: 'en cola' }; cola.push('4k:' + c.id); }

  const sh = (cmd, args, { timeout = 600_000 } = {}) => new Promise((ok, mal) =>
    ejecutar(cmd, args, { windowsHide: true, timeout, maxBuffer: 64 << 20, encoding: 'utf8' }, (e, out, err) => (e ? mal(new Error(`${cmd}: ${(err || e.message).toString().trim().slice(0, 300)}`)) : ok(out))));
  const ssh = (f, comando) => sh('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', f.host, comando], { timeout: 60_000 });
  const scp = (f, remoto, local) => sh('scp', ['-q', '-o', 'BatchMode=yes', `${f.host}:${remoto}`, local]);
  const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const carpetaFuente = f => path.join(conf.salida, f.nombre || f.id);
  const kitDe = c => { const f = conf.fuentes.find(x => x.id === c.fuente); return f?.perfil ? kits.obtener(f.perfil) : null; };
  const publicador = crearPublicador({ conf: () => conf.discordClips, ejecutar, ...(pedir ? { pedir } : {}), log, kitDe });
  const borrar = (...fs_) => { for (const f of fs_.flat()) if (f) try { fs.rmSync(f, { force: true }); } catch { } };
  const archivosPortadas = c => (c.portadas || []).flatMap(p => [p.jpg, p.pcraft]);

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
        prompt: `Lo que se dice en el clip:\n${transcripcion.slice(0, 2500)}\n\nLo que escribía el chat en ese momento:\n${clip.chat.join(' | ').slice(0, 800)}\n\n`
          + `Estilos disponibles:\n${permitidos.map(e => `- ${e}: ${estilos.ESTILOS[e].descripcion}`).join('\n')}\n\n`
          + `Ya usados en este stream (evita repetir mucho): ${usados.join(', ') || 'ninguno'}.\nElige UNO por el tono (miedo/fantasmas → terror, risas → arcoiris o tornado, épico/récord → oro o impacto, charla tranquila → noche o karaoke, energía → pop o fuego).`,
        schema: { type: 'object', properties: { estilo: { type: 'string', enum: permitidos }, motivo: { type: 'string' } }, required: ['estilo'] } });
      const d = r?.datos || r;
      return permitidos.includes(d.estilo) ? d.estilo : permitidos[0];
    } catch { return permitidos[0]; }
  }

  async function editarUno(id) {
    const c = est.clips[id]; if (!c || c.estado !== 'en cola') return;   // descartado mientras esperaba
    const f = conf.fuentes.find(x => x.id === c.fuente);
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
      tituloClip: c.tituloClip || String(c.titulo || '').replace(/\s*\((portrait|vertical)\)\s*/i, '').trim() || undefined };
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
      portadas, portada: Math.min(c.portada || 0, Math.max(0, portadas.length - 1)) });
    guardarEst();
    bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
  }

  async function procesar() {
    if (enCurso) return;
    while (cola.length) {
      const id = cola.shift(); enCurso = id;
      if (id.startsWith('4k:')) { await hacer4k(id.slice(3)); enCurso = null; continue; }
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
          const f = conf.fuentes.find(x => x.id === c.fuente);
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
    const f = conf.fuentes.find(x => x.id === c.fuente);
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
      if (publicador.activo()) publicar(c);
    } catch (e) { c.k4 = { estado: 'error', error: e.message.slice(0, 300), ...(fs.existsSync(destino) ? { mp4: destino } : {}) }; log('[lotes] 4K', id, e.message); }
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
  }

  // ── 4K → Google Drive + anuncio en el canal de Discord del streamer (de uno en uno, sin frenar la cola de edición) ──
  let subidas = Promise.resolve();
  function publicar(c) {
    if (['en cola', 'subiendo'].includes(c.publicado?.estado)) return publico(c);
    c.publicado = { ...c.publicado, estado: 'en cola' }; guardarEst();
    subidas = subidas.then(async () => {
      c.publicado = { ...c.publicado, estado: 'subiendo', desde: Date.now() }; bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
      try { c.publicado = await publicador.publicar(c); }
      catch (e) { c.publicado = { ...c.publicado, estado: 'error', error: e.message.slice(0, 300) }; log('[lotes] publicar', c.id, e.message); }
      guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    });
    return publico(c);
  }
  for (const c of Object.values(est.clips)) if (['en cola', 'subiendo'].includes(c.publicado?.estado) && publicador.activo()) { c.publicado.estado = 'pendiente'; publicar(c); }   // tras reiniciar

  // ── 3. decisiones del usuario ──
  function decidir(id, accion, { estilo } = {}) {
    const c = est.clips[id]; if (!c) throw Object.assign(new Error('no existe ese clip'), { status: 404 });
    const f = conf.fuentes.find(x => x.id === c.fuente);
    const base = f ? path.join(carpetaFuente(f), `${c.fecha}_${c.stream}`) : null;
    const original = base ? path.join(base, 'originales', c.archivo) : null;
    if (accion === 'rehacer') {
      if (c.estado === 'editando' || c.estado === 'en cola') return publico(c);
      if (estilo && !estilos.ESTILOS[estilo]) throw Object.assign(new Error(`estilo desconocido: ${estilo}`), { status: 400 });
      c.estiloForzado = estilo || (f?.estilos?.length ? f.estilos : ESTILOS_DEFECTO).find(e => e !== c.estilo);
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
      // la versión 4K para subir (salvo exportar4k: false); las fuentes se borran cuando termine
      if (conf.exportar4k !== false && c.proyecto && fs.existsSync(c.proyecto)) { guardarEst(); encolar4k(c); }
      else borrarFuentes(c);
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
    estilos: estilos.lista() });

  // tarea interna cada 15 min (la crea programar(), que solo llama el daemon)
  tareas?.registrarInterna('lotes', async () => { await revisar(); limpiar(); return ''; });
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
    const hms = x => `${Math.floor(x / 3600)}:${String(Math.floor(x % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    const args = ['-m', 'yt_dlp', '-q', '--no-warnings', '--download-sections', `*${hms(desde)}-${hms(hasta)}`, '-f', 'bv*[height<=1920][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1920]+ba',
      '--merge-output-format', 'mp4', '-o', destino, `https://www.youtube.com/watch?v=${stream}`];
    (fs.existsSync(destino) ? Promise.resolve() : new Promise((ok, mal) => ejecutar(cfg?.craft?.python || 'python', args, { windowsHide: true, timeout: 1_800_000 },
      e => (e || !fs.existsSync(destino) ? mal(e || new Error('yt-dlp no dejó el vídeo')) : ok()))))
      .then(() => { c.estado = 'en cola'; cola.push(id); guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); procesar(); })
      .catch(e => { c.estado = 'error'; c.error = `no se pudo descargar el tramo: ${String(e.message).slice(0, 300)}`; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) }); });
    return publico(c);
  }

  async function http(M, p, b = {}) {        // /v1/revision
    if (M === 'GET' && !p[2]) return estado();
    if (M === 'POST' && p[2] === 'revisar') return revisar();
    if (M === 'POST' && p[2] === 'nuevo') return nuevo(b);
    if (M === 'PATCH' && p[2] === 'config') {
      if (b.salida) conf.salida = String(b.salida);
      if (b.retencionDias) conf.retencionDias = Math.max(1, +b.retencionDias);
      if (Array.isArray(b.fuentes)) conf.fuentes = b.fuentes;
      guardarConf(); programar(); return { config: conf };
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
    if (M === 'POST' && ['aprobar', 'descartar', 'rehacer'].includes(p[3])) return decidir(c.id, p[3], b);
    if (M === 'POST' && p[3] === 'modificar') return modificar(c.id, b);
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
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  return { revisar, procesar, decidir, publicar, modificar, nuevo, interpretar, abrir, reexportar, limpiar, estado, programar, http, elegirEstilo, ESTILOS_DEFECTO };
}

module.exports = { crearLotes, ESTILOS_DEFECTO };
