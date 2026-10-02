// Turno de noche: una cola de encargos (texto + carpeta + modelo opcional) que APOLO hace mientras duermes.
//   - Se ejecuta en una ventana horaria (cfg.turno.desde/hasta, p. ej. 01:00–07:00) o al momento ("empieza el turno").
//   - Un encargo cada vez (o cfg.turno.paralelo a la vez), cada uno en su propia sesión (canal 'turno', tarea: true).
//   - En proyectos git trabaja en un `git worktree` con rama apolo/turno-<fecha>-<slug>: la rama del usuario no se toca y NUNCA hay push.
//     Al terminar se hace commit en esa rama (autor "APOLO (turno de noche)") y se quita el worktree; la rama queda para revisar.
//   - Permisos: valen las reglas "siempre" que ya existen. Lo que pida un permiso NUEVO no despierta a nadie: queda apuntado para la mañana
//     (permisos.js → evento 'turno-permiso') y el encargo pasa al siguiente. Por la mañana: reintentar con aprobar=true.
//   - Al acabar: informe matutino (generarJSON) {titular, hecho[], pendiente[], necesitoQueDecidas[], guion} + vídeo-resumen vertical
//     (turno-video.js) y aviso a la hora del briefing (bus 'aviso-externo' → isla con voz + Discord/Telegram/WhatsApp).
// cfg.turno = { desde:'01:00', hasta:'07:00', paralelo:1, modelo, modeloInforme, informe:'08:00', maxMin:90, video:true, auto:true }
// Datos: <dir>/turno/estado.json (cola + turno actual), <dir>/turno/informes/<id>/ (informe.json, video.html, video.mp4, capturas)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const DEF = { desde: '01:00', hasta: '07:00', paralelo: 1, informe: '08:00', maxMin: 90, video: true, auto: true };
const ESTADOS = ['pendiente', 'trabajando', 'hecho', 'espera', 'error', 'cancelado'];
const minutos = hhmm => { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null; };
function enVentana(desde, hasta, d = new Date()) {
  const x = d.getHours() * 60 + d.getMinutes(), a = minutos(desde), b = minutos(hasta);
  if (a === null || b === null || a === b) return false;
  return a < b ? x >= a && x < b : x >= a || x < b;
}
const p2 = n => String(n).padStart(2, '0');
const fechaCorta = (d = new Date()) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');
const SIN_COMMIT = ['**/node_modules/**', '**/.venv/**', '**/venv/**', '**/__pycache__/**', '**/.DS_Store'];
const AUTOR = ['-c', 'user.name=APOLO (turno de noche)', '-c', 'user.email=apolo@localhost'];

function git(args, cwd, timeout = 60_000) {
  return new Promise((ok, mal) => execFile('git', args, { cwd, windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (e, out, err) => {
    if (e) { e.message = String(err || e.message).trim().split('\n').slice(-3).join(' '); return mal(e); }
    ok(String(out).trim());
  }));
}

const PROMPT = (e, wt, cwdOriginal) => [
  'TURNO DE NOCHE: el usuario está durmiendo y te dejó este encargo en la cola. Trabaja de forma AUTÓNOMA, sin hacer preguntas: nadie te va a contestar hasta mañana.',
  wt ? `Trabajas en una COPIA aislada del proyecto: un git worktree en la rama "${wt.rama}" (carpeta ${wt.ruta}). Haz aquí todos los cambios. ` +
    `NO hagas git push, NO cambies de rama y NO toques la carpeta original (${cwdOriginal}). Al terminar, el sistema hará commit en esa rama para que el usuario lo revise.` : '',
  'Si algo necesita un permiso o una decisión del usuario, no insistas ni busques atajos: apúntalo y sigue con lo que sí puedes hacer.',
  'Verifica lo que hagas (ejecuta, prueba, relee). Termina con un INFORME breve con tres apartados: HECHO (concreto), PENDIENTE y DECISIONES que necesitas del usuario.',
  '', 'ENCARGO:', e.texto,
].filter(Boolean).join('\n');

const ESQUEMA_INFORME = {
  type: 'object',
  properties: {
    titular: { type: 'string', description: 'una frase corta con lo más importante de la noche' },
    hecho: { type: 'array', items: { type: 'string' } },
    pendiente: { type: 'array', items: { type: 'string' } },
    necesitoQueDecidas: { type: 'array', items: { type: 'string' } },
    escenas: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' }, texto: { type: 'string' } }, required: ['titulo', 'texto'] }, description: 'una por encargo: titular de 3-6 palabras y una frase' },
    guion: { type: 'string', description: 'guion de narración en primera persona para un vídeo de ~60 s (unas 130 palabras), tono cercano y con energía' },
  },
  required: ['titular', 'hecho', 'pendiente', 'necesitoQueDecidas', 'guion'],
};
const SISTEMA_INFORME = 'Eres APOLO, un asistente que ha trabajado durante la noche mientras el usuario dormía. Escribe el INFORME MATUTINO a partir de los encargos. ' +
  'Sé concreto y honesto: no digas que algo está hecho si el resultado no lo muestra. "necesitoQueDecidas" = permisos pendientes, dudas, ramas que revisar/fusionar. ' +
  'Cada punto en una frase corta. Escribe en español.';

function crearTurno({ cfg, bus, sesiones, enviar, cancelar, generarJSON, modeloInforme, horaBriefing, registro, video: videoOpc }) {
  const base = path.join(cfg.dir, 'turno');
  const fEstado = path.join(base, 'estado.json');
  const dirInf = path.join(base, 'informes');
  fs.mkdirSync(dirInf, { recursive: true });
  let st = { cola: [], turno: null };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(fEstado, 'utf8')) }; } catch { }
  // si la app se cerró en mitad de un turno: lo que estaba trabajando vuelve a la cola
  for (const e of st.cola) if (e.estado === 'trabajando') { e.estado = 'pendiente'; e.nota = 'se interrumpió (la app se cerró): vuelve a la cola'; }
  if (st.turno && !st.turno.fin) st.turno = null;
  const conf = () => ({ ...DEF, ...(cfg.turno || {}) });
  const guardar = () => { try { fs.writeFileSync(fEstado, JSON.stringify(st, null, 2)); } catch { } };
  guardar();
  const log = (nivel, txt) => { try { registro?.add?.(nivel, 'turno de noche', txt); } catch { } };
  const emitir = (fase, extra = {}) => bus.emit('evento', { tipo: 'turno-noche', fase, estado: estado(), ...extra });
  let corriendo = null;                       // { t, parar, activos: Map(id → promesa) }
  const porSesion = new Map();                // sesion.id → encargo

  function estado() {
    const c = conf();
    return { activo: !!corriendo, turno: st.turno, ventana: { desde: c.desde, hasta: c.hasta, ahora: enVentana(c.desde, c.hasta) }, paralelo: c.paralelo, informe: c.informe,
      cola: st.cola.map(e => ({ ...e })) };
  }

  // ---------- cola ----------
  function agregar({ texto, cwd, modelo } = {}) {
    texto = String(texto || '').trim();
    if (!texto) throw new Error('falta el texto del encargo');
    if (st.cola.filter(e => e.estado === 'pendiente').length >= 50) throw new Error('la cola ya tiene 50 encargos pendientes');
    const e = { id: `e${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`, texto: texto.slice(0, 4000), cwd: path.resolve(String(cwd || cfg.carpeta || os.homedir())),
      modelo: modelo ? (cfg.alias?.[String(modelo).toLowerCase()] || String(modelo).trim()) : undefined, estado: 'pendiente', creado: Date.now(), permisos: [], permitidos: [] };
    if (e.modelo && !e.modelo.includes('/')) throw new Error(`modelo "${modelo}" no válido: usa un alias o proveedor/modelo`);
    st.cola.push(e); guardar(); emitir('cola');
    log('info', `encargo en cola: ${e.texto.slice(0, 100)}`);
    return { ...e };
  }
  const obtener = id => st.cola.find(e => e.id === id) || null;
  function borrar(id) {
    const e = obtener(id); if (!e) return false;
    if (e.estado === 'trabajando' && e.sesion) { e.borrado = true; cancelar(e.sesion); }
    st.cola = st.cola.filter(x => x.id !== id); guardar(); emitir('cola');
    return true;
  }
  // orden de la cola (arrastrar en el panel): los ids que se den van primero, en ese orden; el resto detrás
  function ordenar(ids = []) {
    const pos = new Map([].concat(ids).map((id, i) => [String(id), i]));
    st.cola.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e6 + st.cola.indexOf(a)) - (pos.has(b.id) ? pos.get(b.id) : 1e6 + st.cola.indexOf(b)));
    guardar(); emitir('cola');
    return st.cola.map(e => e.id);
  }
  // por la mañana: volver a la cola; aprobar = los permisos que pidió quedan concedidos SOLO para este encargo
  function reintentar(id, { aprobar = false } = {}) {
    const e = obtener(id); if (!e) throw new Error('encargo no encontrado');
    if (e.estado === 'trabajando') throw new Error('ese encargo está trabajando ahora');
    if (aprobar) for (const p of e.permisos) if (!e.permitidos.some(x => x.herramienta === p.clave.herramienta && x.prefijo === p.clave.prefijo && x.resumen === p.resumen))
      e.permitidos.push({ herramienta: p.clave.herramienta, prefijo: p.clave.prefijo, resumen: p.resumen, peligro: p.peligro || '' });
    Object.assign(e, { estado: 'pendiente', permisos: [], resultado: undefined, error: undefined, nota: aprobar ? 'reintento con los permisos aprobados' : 'reintento' });
    // al final de los pendientes
    st.cola = st.cola.filter(x => x !== e); const i = st.cola.map(x => x.estado).lastIndexOf('pendiente'); st.cola.splice(i + 1, 0, e);
    guardar(); emitir('cola');
    return { ...e };
  }

  // un permiso nuevo durante el turno: se apunta para la mañana (permisos.js ya lo denegó sin despertar a nadie)
  bus.on('turno-permiso', p => {
    const e = porSesion.get(p.sesion); if (!e) return;
    e.permisos.push({ herramienta: p.herramienta, resumen: p.resumen, clave: p.clave, peligro: p.peligro || '', t: Date.now() });
    guardar(); emitir('permiso', { encargo: e.id });
    log('aviso', `permiso pendiente para la mañana: ${p.herramienta} ${p.resumen}`);
    if (e.permisos.length >= 3) cancelar(p.sesion);                      // insiste: se corta y pasa al siguiente
  });

  // ---------- git worktree ----------
  async function prepararWorktree(e, cwd) {
    let top; try { top = path.resolve(await git(['rev-parse', '--show-toplevel'], cwd)); } catch { return null; }   // no es git
    const baseCommit = await git(['rev-parse', 'HEAD'], top).catch(() => { throw new Error('el repositorio no tiene ningún commit todavía'); });
    let rama = `apolo/turno-${fechaCorta()}-${slug(e.texto) || e.id}`;
    if (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${rama}`], top).then(() => true, () => false)) rama += `-${e.id.slice(-4)}`;
    const raiz = path.join(base, 'worktrees', `${slug(path.basename(top)) || 'repo'}-${e.id}`);
    fs.mkdirSync(path.dirname(raiz), { recursive: true });
    await git(['worktree', 'add', '-b', rama, raiz, baseCommit], top);
    const sub = path.relative(top, path.resolve(cwd));
    return { top, raiz, ruta: sub && !sub.startsWith('..') ? path.join(raiz, sub) : raiz, rama, base: baseCommit };
  }
  async function cerrarWorktree(e, wt) {
    try {
      if (await git(['status', '--porcelain'], wt.raiz)) {
        // todo menos dependencias/caché instaladas (node_modules, .venv…) aunque el repo no tenga .gitignore
        await git(['add', '-A', '--', '.', ...SIN_COMMIT.map(x => `:(exclude,glob)${x}`)], wt.raiz);
        const hay = await git(['diff', '--cached', '--quiet'], wt.raiz).then(() => false, () => true);
        if (hay) await git([...AUTOR, 'commit', '-m', `APOLO turno de noche: ${e.texto.split('\n')[0].slice(0, 70)}`, '-m', `Encargo ${e.id}. Revisa antes de fusionar.`], wt.raiz);
      }
    } catch (er) { e.nota = `no pude hacer commit en la rama (${er.message}); el worktree se queda en ${wt.raiz}`; e.worktree = wt.raiz; }
    const commits = +(await git(['rev-list', '--count', `${wt.base}..${wt.rama}`], wt.top).catch(() => '0')) || 0;
    e.commits = commits;
    if (commits) {
      e.cambios = await git(['diff', '--shortstat', wt.base, wt.rama], wt.top).catch(() => '');
      e.archivos = (await git(['diff', '--name-only', wt.base, wt.rama], wt.top).catch(() => '')).split('\n').filter(Boolean).slice(0, 40);
    }
    if (!e.worktree) {
      await git(['worktree', 'remove', '--force', wt.raiz], wt.top).catch(() => { });
      if (!commits) await git(['branch', '-D', wt.rama], wt.top).catch(() => { });
    }
    e.rama = commits || e.worktree ? wt.rama : undefined;
    e.repo = wt.top;
  }

  // ---------- ejecución ----------
  async function ejecutarEncargo(e, t) {
    const c = conf();
    Object.assign(e, { estado: 'trabajando', inicio: Date.now(), fin: 0, turno: t.id, permisos: [], error: undefined, nota: undefined, rama: undefined, cambios: undefined, archivos: undefined, commits: undefined, capturas: [] });
    guardar(); emitir('encargo', { encargo: e.id });
    log('info', `empieza: ${e.texto.slice(0, 100)}`);
    let wt = null;
    try { wt = await prepararWorktree(e, e.cwd); }
    catch (er) {                                                     // si es git pero no hay worktree, NO se trabaja en la rama del usuario
      Object.assign(e, { estado: 'error', error: `no pude preparar el worktree: ${er.message}`, fin: Date.now() });
      guardar(); emitir('encargo', { encargo: e.id }); return;
    }
    if (!fs.existsSync(e.cwd)) { Object.assign(e, { estado: 'error', error: `la carpeta no existe: ${e.cwd}`, fin: Date.now() }); guardar(); emitir('encargo', { encargo: e.id }); return; }
    if (wt) { e.rama = wt.rama; guardar(); emitir('encargo', { encargo: e.id }); }
    const s = sesiones.crear({ modelo: e.modelo || c.modelo || cfg.modeloPorDefecto, cwd: wt ? wt.ruta : e.cwd, canal: 'turno', titulo: `Turno de noche: ${e.texto.split('\n')[0].slice(0, 50)}`, tarea: true });
    Object.defineProperty(s, 'turnoNoche', { value: { encargo: e.id, permitidos: e.permitidos || [] }, enumerable: false, configurable: true });
    e.sesion = s.id; porSesion.set(s.id, e); guardar();
    let porTiempo = false;
    const tope = setTimeout(() => { porTiempo = true; cancelar(s.id); }, Math.max(1, c.maxMin) * 60_000); tope.unref?.();
    try {
      e.resultado = String(await enviar(s, PROMPT(e, wt, e.cwd)) || '').slice(0, 6000);
      e.estado = e.permisos.length ? 'espera' : 'hecho';
    } catch (er) {
      if (t.parado && !e.permisos.length) { e.estado = 'pendiente'; e.nota = 'el turno se paró: vuelve a la cola'; }
      else if (e.permisos.length) e.estado = 'espera';
      else { e.estado = 'error'; e.error = porTiempo ? `tiempo agotado (${c.maxMin} min)` : er.message; }
      e.resultado = String(s.mensajes.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '').slice(0, 6000) || undefined;
    } finally { clearTimeout(tope); porSesion.delete(s.id); }
    // capturas que hizo durante el encargo (ver_pantalla, navegador_captura): para el vídeo
    e.capturas = s.mensajes.flatMap(m => m.imagenes || []).map(i => i.ruta).filter(r => r && fs.existsSync(r)).slice(-3);
    if (wt) await cerrarWorktree(e, wt).catch(er => { e.nota = `worktree: ${er.message}`; });
    e.fin = Date.now();
    if (e.borrado) return;
    guardar(); emitir('encargo', { encargo: e.id });
    log(e.estado === 'error' ? 'error' : 'info', `${e.estado}: ${e.texto.slice(0, 80)}${e.rama ? ` (rama ${e.rama})` : ''}`);
  }

  async function bucle(t) {
    const activos = new Map();
    while (!t.parado) {
      const c = conf();
      const puede = t.modo === 'manual' || enVentana(c.desde, c.hasta);
      const sig = st.cola.find(e => e.estado === 'pendiente');
      if (puede && sig && activos.size < Math.max(1, Math.min(4, c.paralelo | 0 || 1))) {
        const pr = ejecutarEncargo(sig, t).catch(er => { sig.estado = 'error'; sig.error = er.message; guardar(); }).finally(() => activos.delete(sig.id));
        activos.set(sig.id, pr);
        if (!t.encargos.includes(sig.id)) t.encargos.push(sig.id);
        guardar();
        continue;
      }
      if (!activos.size) break;
      await Promise.race(activos.values());
    }
    await Promise.allSettled(activos.values());
  }

  // empieza ya (modo manual: hasta vaciar la cola) o por la ventana horaria (modo ventana: no arranca nada fuera de horario)
  function empezar({ modo = 'manual' } = {}) {
    if (corriendo) return { ok: false, motivo: 'el turno ya está en marcha', estado: estado() };
    if (!st.cola.some(e => e.estado === 'pendiente')) return { ok: false, motivo: 'no hay encargos pendientes en la cola', estado: estado() };
    const t = { id: `t${fechaCorta()}-${Date.now().toString(36).slice(-5)}`, inicio: Date.now(), fin: 0, modo, encargos: [] };
    st.turno = t; guardar();
    corriendo = { t, promesa: null };
    emitir('inicio');
    log('info', `turno ${modo === 'manual' ? 'empezado a mano' : 'empezado por horario'}: ${st.cola.filter(e => e.estado === 'pendiente').length} encargos`);
    corriendo.promesa = (async () => {
      try { await bucle(t); } catch (er) { log('error', er.message); }
      t.fin = Date.now(); guardar();
      let informe = null;
      try { if (t.encargos.length) informe = await crearInforme(t); } catch (er) { log('error', `informe: ${er.message}`); }
      corriendo = null; st.turno = null; guardar();
      emitir('fin', { informe: informe?.id });
      return informe;
    })();
    return { ok: true, turno: t.id, estado: estado(), promesa: corriendo.promesa };
  }
  function parar() {
    if (!corriendo) return false;
    corriendo.t.parado = true;
    for (const e of st.cola) if (e.estado === 'trabajando' && e.sesion) cancelar(e.sesion);
    emitir('parando');
    return true;
  }

  // ---------- informe matutino ----------
  const dirDe = id => path.join(dirInf, String(id).replace(/[^\w-]/g, ''));
  async function crearInforme(t) {
    const encargos = st.cola.filter(e => t.encargos.includes(e.id)).map(e => ({ ...e }));
    const dir = dirDe(t.id); fs.mkdirSync(dir, { recursive: true });
    const decidirAuto = [];   // [texto, clave]: se añade solo si el modelo no lo mencionó ya (clave = rama o comando)
    for (const e of encargos) {
      for (const p of e.permisos || []) decidirAuto.push([`Permiso pendiente en "${e.texto.slice(0, 50)}": ${p.herramienta} → ${String(p.resumen).slice(0, 120)}${p.peligro ? ` (⚠ ${p.peligro})` : ''}`, String(p.resumen).slice(0, 60)]);
      if (e.rama) decidirAuto.push([`Revisar y fusionar (o borrar) la rama ${e.rama}${e.cambios ? ` (${e.cambios.trim()})` : ''}`, e.rama]);
    }
    const prompt = encargos.map((e, i) => [
      `### Encargo ${i + 1} (id ${e.id}) — estado: ${e.estado}`, `Pedido: ${e.texto.slice(0, 600)}`,
      e.rama ? `Rama: ${e.rama} · ${e.commits || 0} commit(s) ${e.cambios || ''}${e.archivos?.length ? ` · archivos: ${e.archivos.slice(0, 10).join(', ')}` : ''}` : '',
      e.permisos?.length ? `Permisos que pidió y quedaron pendientes: ${e.permisos.map(p => `${p.herramienta}: ${p.resumen}`).join(' | ')}` : '',
      e.error ? `Error: ${e.error}` : '', `Resultado/informe del agente:\n${String(e.resultado || '(nada)').slice(0, 2000)}`,
    ].filter(Boolean).join('\n')).join('\n\n');
    let datos = null, modeloUsado = null;
    try {
      modeloUsado = conf().modeloInforme || modeloInforme?.() || cfg.modeloPorDefecto;
      ({ datos } = await generarJSON({ modelo: modeloUsado, system: SISTEMA_INFORME, prompt, schema: ESQUEMA_INFORME, signal: AbortSignal.timeout(180_000) }));
    } catch (er) { log('aviso', `el modelo no pudo escribir el informe (${er.message}): lo hago a mano`); }
    if (!datos) {                                                    // informe mecánico (sin modelo)
      const hechos = encargos.filter(e => e.estado === 'hecho');
      datos = {
        titular: `${hechos.length} de ${encargos.length} encargos terminados esta noche`,
        hecho: hechos.map(e => `${e.texto.split('\n')[0].slice(0, 80)}${e.rama ? ` (rama ${e.rama})` : ''}`),
        pendiente: encargos.filter(e => e.estado !== 'hecho').map(e => `${e.texto.split('\n')[0].slice(0, 80)} — ${e.estado}${e.error ? `: ${e.error}` : ''}`),
        necesitoQueDecidas: [], escenas: [],
        guion: `Buenos días. Esta noche he trabajado en ${encargos.length} encargos y he terminado ${hechos.length}. Tienes el detalle en el informe.`,
      };
    }
    const unico = l => [...new Set((l || []).map(x => String(x).trim()).filter(Boolean))];
    const informe = {
      id: t.id, creado: Date.now(), inicio: t.inicio, fin: t.fin, modo: t.modo, modelo: modeloUsado,
      titular: String(datos.titular || '').slice(0, 200), hecho: unico(datos.hecho), pendiente: unico(datos.pendiente),
      necesitoQueDecidas: unico([...(datos.necesitoQueDecidas || []), ...decidirAuto.filter(([, k]) => !(datos.necesitoQueDecidas || []).some(x => String(x).includes(k))).map(([t]) => t)]), guion: String(datos.guion || ''),
      escenas: (datos.escenas || []).slice(0, 8),
      encargos: encargos.map(e => ({ id: e.id, texto: e.texto, estado: e.estado, rama: e.rama, cambios: e.cambios, commits: e.commits, archivos: e.archivos, error: e.error, permisos: e.permisos, sesion: e.sesion, modelo: e.modelo, inicio: e.inicio, fin: e.fin, resultado: String(e.resultado || '').slice(0, 3000) })),
      video: { estado: conf().video ? 'pendiente' : 'desactivado' }, entregado: false,
    };
    // capturas al directorio del informe (las originales se borran a las 24 h)
    let n = 0;
    for (const e of encargos) for (const r of e.capturas || []) {
      try { const dst = `cap-${++n}${path.extname(r) || '.jpg'}`; fs.copyFileSync(r, path.join(dir, dst)); (informe.capturas ||= []).push({ encargo: e.id, archivo: dst }); } catch { }
    }
    guardarInforme(informe);
    emitir('informe', { informe: informe.id });
    log('info', `informe listo: ${informe.titular}`);
    if (conf().video) await hacerVideo(informe.id).catch(er => log('aviso', `vídeo: ${er.message}`));
    revisarEntregas();
    return leerInforme(informe.id);
  }
  function guardarInforme(i) { const d = dirDe(i.id); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'informe.json'), JSON.stringify(i, null, 2)); }
  function leerInforme(id) { try { return JSON.parse(fs.readFileSync(path.join(dirDe(id), 'informe.json'), 'utf8')); } catch { return null; } }
  function informes(limite = 20) {
    try {
      return fs.readdirSync(dirInf).filter(d => fs.existsSync(path.join(dirInf, d, 'informe.json'))).sort().reverse().slice(0, limite).map(leerInforme).filter(Boolean)
        .map(i => ({ id: i.id, creado: i.creado, titular: i.titular, hecho: i.hecho.length, pendiente: i.pendiente.length, decidir: i.necesitoQueDecidas.length, encargos: i.encargos.length, video: i.video, entregado: i.entregado }));
    } catch { return []; }
  }

  // vídeo-resumen vertical: HTML animado + grabación por CDP (+ ffmpeg). Sin navegador o sin ffmpeg queda el HTML.
  async function hacerVideo(id) {
    const i = leerInforme(id); if (!i) throw new Error('informe no encontrado');
    const v = require('./turno-video');
    const d = dirDe(id);
    i.video = { estado: 'grabando' }; guardarInforme(i); emitir('video', { informe: id });
    try {
      const r = await v.crearVideo(i, d, { ...(videoOpc || {}), ...(conf().videoOpciones || {}) });
      i.video = { estado: r.mp4 ? 'listo' : 'solo-html', html: 'video.html', mp4: r.mp4 ? 'video.mp4' : undefined, segundos: r.segundos, motivo: r.motivo, ms: r.ms };
    } catch (er) { i.video = { estado: fs.existsSync(path.join(d, 'video.html')) ? 'solo-html' : 'error', html: fs.existsSync(path.join(d, 'video.html')) ? 'video.html' : undefined, motivo: er.message }; }
    guardarInforme(i); emitir('video', { informe: id });
    return i.video;
  }
  function archivoInforme(id, nombre) {
    if (!/^[\w.-]+$/.test(String(nombre)) || nombre === 'informe.json') return null;
    const f = path.join(dirDe(id), nombre);
    return fs.existsSync(f) ? f : null;
  }

  // ---------- entrega a la hora del briefing ----------
  function momentoEntrega(i) {
    const hora = minutos(horaBriefing?.() || conf().informe) ?? minutos(DEF.informe);
    const d = new Date(i.creado); d.setHours(Math.floor(hora / 60), hora % 60, 0, 0);
    if (d.getTime() <= i.creado) d.setDate(d.getDate() + 1);
    // turno por horario → espera al briefing; uno empezado a mano de día (faltan > 9 h para el briefing) → al momento
    return i.modo === 'ventana' || d.getTime() - i.creado <= 9 * 3600_000 ? d.getTime() : i.creado;
  }
  function textoAviso(i) {
    const l = (t, a) => a.length ? `\n**${t}**\n${a.slice(0, 6).map(x => `• ${x}`).join('\n')}` : '';
    return `🌙 **Turno de noche** — ${i.titular}${l('Hecho', i.hecho)}${l('Pendiente', i.pendiente)}${l('Necesito que decidas', i.necesitoQueDecidas)}` +
      `${i.video?.mp4 ? '\n🎬 Vídeo-resumen listo en el panel → Turno de noche.' : ''}`;
  }
  function entregar(i) {
    i.entregado = Date.now(); guardarInforme(i);
    bus.emit('aviso-externo', { texto: textoAviso(i).slice(0, 3000), urgente: true, origen: 'Turno de noche' });
    emitir('entregado', { informe: i.id });
    log('info', `informe entregado: ${i.titular}`);
  }
  function revisarEntregas() {
    for (const r of informes(10)) {
      if (r.entregado) continue;
      const i = leerInforme(r.id); if (!i || i.video?.estado === 'grabando') continue;
      if (Date.now() >= momentoEntrega(i)) entregar(i);
    }
  }

  // ---------- reloj (solo el daemon lo arranca) ----------
  let reloj = null;
  function tick() {
    try {
      const c = conf();
      if (!corriendo && c.auto !== false && enVentana(c.desde, c.hasta) && st.cola.some(e => e.estado === 'pendiente')) empezar({ modo: 'ventana' });
      revisarEntregas();
    } catch (er) { log('error', er.message); }
  }
  function iniciar() { if (!reloj) { reloj = setInterval(tick, 30_000); reloj.unref?.(); setTimeout(tick, 3000).unref?.(); } }
  function detener() { clearInterval(reloj); reloj = null; }

  function configurar(c = {}) {
    const f = path.join(cfg.dir, 'config.json');
    let disco = {}; try { disco = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
    const n = { ...(cfg.turno || {}) };
    for (const k of ['desde', 'hasta', 'informe']) if (c[k] !== undefined) { if (minutos(c[k]) === null) throw new Error(`${k}: usa HH:MM`); n[k] = c[k]; }
    if (c.paralelo !== undefined) n.paralelo = Math.max(1, Math.min(4, c.paralelo | 0));
    if (c.maxMin !== undefined) n.maxMin = Math.max(5, Math.min(600, c.maxMin | 0));
    for (const k of ['video', 'auto']) if (typeof c[k] === 'boolean') n[k] = c[k];
    for (const k of ['modelo', 'modeloInforme']) if (typeof c[k] === 'string') n[k] = c[k].includes('/') ? c[k].trim() : undefined;
    cfg.turno = disco.turno = n;
    fs.writeFileSync(f, JSON.stringify(disco, null, 2));
    emitir('config');
    return conf();
  }

  // API (daemon → n.extensiones.turno.http): GET / · POST / {texto,cwd,modelo} · POST /empezar · POST /parar · PATCH /orden {ids}
  //   PATCH /config · DELETE /:id · POST /:id/reintentar {aprobar} · GET /informes/:id · GET /informes/:id/archivo/:nombre · POST /informes/:id/video
  async function http(M, p, b = {}) {
    const err = (m, status = 400) => Object.assign(new Error(m), { status });
    if (!p[2] && M === 'GET') return { ...estado(), config: conf(), informes: informes() };
    if (!p[2] && M === 'POST') return { encargo: agregar(b) };
    if (p[2] === 'empezar' && M === 'POST') { const r = empezar({ modo: 'manual' }); delete r.promesa; return r; }
    if (p[2] === 'parar' && M === 'POST') return { ok: parar() };
    if (p[2] === 'orden' && (M === 'PATCH' || M === 'POST')) return { orden: ordenar(b.ids || []) };
    if (p[2] === 'config' && M === 'PATCH') return { config: configurar(b) };
    if (p[2] === 'informes') {
      if (!p[3] && M === 'GET') return { informes: informes(50) };
      const i = leerInforme(p[3]); if (!i) throw err('informe no encontrado', 404);
      if (!p[4] && M === 'GET') return i;
      if (p[4] === 'archivo' && p[5] && M === 'GET') {
        const f = archivoInforme(i.id, decodeURIComponent(p[5])); if (!f) throw err('archivo no encontrado', 404);
        return { __archivo: f };
      }
      if (p[4] === 'video' && M === 'POST') { hacerVideo(i.id).catch(() => { }); return { ok: true }; }
      if (p[4] === 'entregar' && M === 'POST') { entregar(i); return { ok: true }; }
    }
    const e = p[2] && obtener(p[2]); if (!e) throw err('encargo no encontrado', 404);
    if (!p[3] && M === 'GET') return { ...e };
    if (!p[3] && M === 'DELETE') return { ok: borrar(e.id) };
    if (p[3] === 'reintentar' && M === 'POST') return { encargo: reintentar(e.id, { aprobar: !!b.aprobar }) };
    throw err('ruta', 404);
  }

  return { agregar, borrar, ordenar, reintentar, empezar, parar, estado, informes, leerInforme, hacerVideo, archivoInforme, iniciar, detener, configurar, http, textoAviso,
    esperar: () => corriendo?.promesa || Promise.resolve(null), _enVentana: enVentana, _revisarEntregas: revisarEntregas };
}

// herramientas del agente (se registran desde index.js; usan ctx.turno)
const HERRAMIENTAS = [
  {
    nombre: 'turno_agregar', riesgo: 'lectura',
    descripcion: 'Añade un encargo a la cola del TURNO DE NOCHE: se hará solo, en la ventana nocturna (o al decir "empieza el turno"), en su propia sesión y, ' +
      'si es un proyecto git, en una rama aparte (sin push). Úsalo cuando el usuario diga "esta noche haz…", "déjalo para el turno de noche", "mientras duermo…".',
    parametros: { type: 'object', properties: {
      texto: { type: 'string', description: 'el encargo completo con todo el contexto (lo hará otro agente sin ver esta conversación)' },
      cwd: { type: 'string', description: 'opcional: carpeta del proyecto; por defecto tu carpeta de trabajo' },
      modelo: { type: 'string', description: 'opcional: alias o proveedor/modelo' },
    }, required: ['texto'] },
    resumen: a => String(a.texto || '').slice(0, 120),
    ejecutar: async (a, ctx) => {
      if (!ctx.turno) return 'error: el turno de noche no está disponible aquí';
      const e = ctx.turno.agregar({ texto: a.texto, cwd: a.cwd ? path.resolve(ctx.cwd, a.cwd) : ctx.cwd, modelo: a.modelo });
      const est = ctx.turno.estado();
      return `Encargo añadido a la cola (${e.id}, carpeta ${e.cwd}). Pendientes: ${est.cola.filter(x => x.estado === 'pendiente').length}. ` +
        `Se hará entre las ${est.ventana.desde} y las ${est.ventana.hasta}, o ya si el usuario dice "empieza el turno".`;
    },
  },
  {
    nombre: 'turno_ver', riesgo: 'lectura',
    descripcion: 'Muestra la cola del turno de noche (encargos y su estado) y el último informe matutino.',
    parametros: { type: 'object', properties: {} },
    resumen: () => 'cola del turno de noche',
    ejecutar: async (a, ctx) => {
      if (!ctx.turno) return 'error: el turno de noche no está disponible aquí';
      const est = ctx.turno.estado(), inf = ctx.turno.informes(1)[0];
      const cola = est.cola.length ? est.cola.map((e, i) => `${i + 1}. [${e.estado}] ${e.texto.split('\n')[0].slice(0, 90)} (${e.id}${e.rama ? `, rama ${e.rama}` : ''}${e.permisos?.length ? `, ${e.permisos.length} permiso(s) pendiente(s)` : ''})`).join('\n') : '(cola vacía)';
      const ult = inf ? ctx.turno.leerInforme(inf.id) : null;
      return `Turno ${est.activo ? 'EN MARCHA' : 'parado'} · ventana ${est.ventana.desde}–${est.ventana.hasta} · ${est.paralelo} a la vez\n${cola}` +
        (ult ? `\n\nÚltimo informe (${new Date(ult.creado).toLocaleString()}): ${ult.titular}\nHecho: ${ult.hecho.join('; ') || '—'}\nPendiente: ${ult.pendiente.join('; ') || '—'}\nDecidir: ${ult.necesitoQueDecidas.join('; ') || '—'}` : '');
    },
  },
  {
    nombre: 'turno_empezar', riesgo: 'lectura',
    descripcion: 'Empieza YA el turno de noche con los encargos pendientes de la cola (sin esperar a la ventana horaria). Úsalo si el usuario dice "empieza el turno".',
    parametros: { type: 'object', properties: {} },
    resumen: () => 'empezar el turno de noche',
    ejecutar: async (a, ctx) => {
      if (!ctx.turno) return 'error: el turno de noche no está disponible aquí';
      const r = ctx.turno.empezar({ modo: 'manual' });
      return r.ok ? `Turno empezado (${r.turno}): ${r.estado.cola.filter(x => x.estado === 'pendiente' || x.estado === 'trabajando').length} encargo(s). El informe llegará al terminar (o a la hora del briefing).` : `No empezó: ${r.motivo}`;
    },
  },
];

module.exports = { crearTurno, HERRAMIENTAS, enVentana, DEF };
