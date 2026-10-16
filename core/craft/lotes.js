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

const ESTILOS_DEFECTO = ['pop', 'karaoke', 'fuego', 'impacto', 'terror', 'atardecer', 'noche', 'tornado', 'arcoiris', 'oro'];

function crearLotes({ cfg, bus, tareas, subtitulador, generarJSON, modelo, ejecutar = execFile, log = () => { } }) {
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

  const sh = (cmd, args, { timeout = 600_000 } = {}) => new Promise((ok, mal) =>
    ejecutar(cmd, args, { windowsHide: true, timeout, maxBuffer: 64 << 20, encoding: 'utf8' }, (e, out, err) => (e ? mal(new Error(`${cmd}: ${(err || e.message).toString().trim().slice(0, 300)}`)) : ok(out))));
  const ssh = (f, comando) => sh('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', f.host, comando], { timeout: 60_000 });
  const scp = (f, remoto, local) => sh('scp', ['-q', '-o', 'BatchMode=yes', `${f.host}:${remoto}`, local]);
  const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const carpetaFuente = f => path.join(conf.salida, f.nombre || f.id);

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
    c.estado = 'editando'; c.error = null; guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
    fs.mkdirSync(path.dirname(original), { recursive: true });
    if (!fs.existsSync(original)) await scp(f, `${f.ruta}/${c.carpeta}/${c.archivo}`, original);
    const comun = { video: original, perfil: f.perfil, carpeta: path.join(base, 'editados'), nombre: `${String(c.rank).padStart(2, '0')}`,
      tituloClip: String(c.titulo || '').replace(/\s*\((portrait|vertical)\)\s*/i, '').trim() || undefined };
    if (!c.estiloForzado) {                             // transcribe primero (queda en caché) para elegir el estilo por lo que se dice
      const t = await subtitulador.subtitular({ ...comun, soloTranscribir: true }, {});
      const texto = JSON.parse(typeof t === 'string' ? t : t.texto).subtitulos.map(x => x.texto).join(' ');
      const usados = Object.values(est.clips).filter(x => x.stream === c.stream && x.estilo && x.id !== id).map(x => x.estilo);
      c.estilo = await elegirEstilo(f, c, texto, usados);
    } else c.estilo = c.estiloForzado;
    const r = await subtitulador.subtitular({ ...comun, nombre: `${String(c.rank).padStart(2, '0')} - ${c.estilo}`, estilo: c.estilo, escenas: f.escenas ?? 'auto' }, {});
    const d = r.datos || {};
    if (c.estado === 'descartado') {                    // lo descartaron mientras se editaba: fuera lo recién hecho
      for (const k of ['mp4', 'srt', 'previa', 'proyecto']) try { if (d[k]) fs.rmSync(d[k], { force: true }); } catch { }
      try { fs.rmSync(original, { force: true }); } catch { }
      return;
    }
    if (c.mp4 && c.mp4 !== d.mp4) for (const viejo of [c.mp4, c.srt, c.previa, c.proyecto]) try { if (viejo) fs.rmSync(viejo, { force: true }); } catch { }   // al rehacer, fuera la versión anterior
    Object.assign(c, { estado: 'revisar', mp4: d.mp4, srt: d.srt, previa: d.previa, proyecto: d.proyecto, gancho: d.gancho, dudas: d.dudas || [], escenas: d.escenas || [],
      emojis: d.emojis || 0, editado: Date.now(), estiloForzado: null });
    guardarEst();
    bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
  }

  async function procesar() {
    if (enCurso) return;
    while (cola.length) {
      const id = cola.shift(); enCurso = id;
      try { await editarUno(id); }
      catch (e) { const c = est.clips[id]; if (c) { c.estado = 'error'; c.error = e.message.slice(0, 400); guardarEst(); } log('[lotes]', id, e.message); }
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
      c.estado = 'aprobado'; c.decidido = Date.now();
      if (original) fs.rmSync(original, { force: true });
    } else if (accion === 'descartar') {
      for (const k of ['mp4', 'srt', 'previa', 'proyecto']) if (c[k]) fs.rmSync(c[k], { force: true });
      if (original) fs.rmSync(original, { force: true });
      c.estado = 'descartado'; c.decidido = Date.now();
    } else throw Object.assign(new Error('acción'), { status: 400 });
    guardarEst(); bus?.emit('lotes', { tipo: 'clip', clip: publico(c) });
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

  const publico = c => ({ ...c, original: undefined });
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

  async function http(M, p, b = {}) {        // /v1/revision
    if (M === 'GET' && !p[2]) return estado();
    if (M === 'POST' && p[2] === 'revisar') return revisar();
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
    if (M === 'POST' && ['aprobar', 'descartar', 'rehacer'].includes(p[3])) return decidir(c.id, p[3], b);
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  return { revisar, procesar, decidir, limpiar, estado, programar, http, elegirEstilo, ESTILOS_DEFECTO };
}

module.exports = { crearLotes, ESTILOS_DEFECTO };
