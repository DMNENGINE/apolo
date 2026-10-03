// Modo Gamer (Etapa J, fase 1): optimizaciones REALES y REVERSIBLES mientras juegas.
// Regla: cada cambio se apunta en <cfg.dir>/gamer/sesion.json ANTES de hacerlo (qué había antes) → desactivar() lo deshace
// en orden inverso aunque la app se cerrara a medias (restaurarPendiente() al arrancar). Todo lo real pasa por la capa `so` (gamer*).
// Nada de placebo: ni "limpiadores de RAM", ni tocar Defender/firewall, ni servicios, ni Realtime.
const fs = require('fs');
const path = require('path');
const { crearLimpieza } = require('./limpieza');
const { crearRevision } = require('./revision');

// procesos que NUNCA se pausan ni se tocan (sistema + el propio APOLO)
const LISTA_NEGRA = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm', 'explorer', 'msmpeng',
  'nissrv', 'securityhealthservice', 'fontdrvhost', 'sihost', 'taskhostw', 'ctfmon', 'audiodg', 'conhost', 'searchhost', 'startmenuexperiencehost',
  'shellexperiencehost', 'textinputhost', 'runtimebroker', 'spoolsv', 'wudfhost', 'lsaiso', 'memcompression', 'electron', 'apolo', 'robot companion', 'robotcompanion', 'node', 'powershell']);
const norm = n => String(n || '').toLowerCase().replace(/\.exe$/, '').trim();
const prohibido = (p, propios = []) => LISTA_NEGRA.has(norm(p.nombre)) || propios.includes(p.pid);
// plan de energía: "Máximo rendimiento" (oculto en muchos PCs) o, si no, "Alto rendimiento". powercfg sale en la página OEM → el nombre puede venir sin tildes
const MAXIMO = { guid: 'e9a42b02-d5df-448d-aa00-03f14749eb61', re: /ultimate performance|m.{1,2}ximo rendimiento/i };
const ALTO = { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', re: /high performance|alto rendimiento/i };
const INSTANCIAS = new WeakMap();
const err = (m, status = 400) => Object.assign(new Error(m), { status });

function crearGamer({ cfg, bus, permisos, so = require('../escritorio/so'), entorno, propios = [process.pid, process.ppid] } = {}) {
  const dir = path.join(cfg.dir, 'gamer');
  const fSes = path.join(dir, 'sesion.json'), fUlt = path.join(dir, 'ultima.json');
  const conf = () => ({ cerrar: [], modo: 'suspender', acciones: {}, ...(cfg.gamer || {}) });
  const activa = nombre => conf().acciones[nombre] !== false;           // todas activas salvo que se apaguen en cfg.gamer.acciones
  const limpieza = crearLimpieza({ entorno });
  const revision = crearRevision({ so });
  let sesion = leer(fSes), cola = Promise.resolve();

  function leer(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
  function guardar() { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fSes, JSON.stringify(sesion, null, 2)); }
  const enCola = fn => { const p = cola.then(fn, fn); cola = p.catch(() => { }); return p; };   // activar/desactivar nunca se pisan
  const emitir = activo => bus?.emit('evento', { tipo: 'gamer', activo, juego: sesion?.juego || null });

  // ---------- acciones: preparar() → [{antes, despues, detalle}] (vacío = nada que hacer); hacer(c); deshacer(c) ----------
  const ACCIONES = {
    plan: {
      titulo: 'Plan de energía de máximo rendimiento',
      async preparar() {
        const planes = await so.gamerPlanes(), act = planes.find(p => p.activo);
        const obj = planes.find(p => p.guid === MAXIMO.guid || MAXIMO.re.test(p.nombre)) || planes.find(p => p.guid === ALTO.guid || ALTO.re.test(p.nombre));
        if (!act || !obj || obj.guid === act.guid) return [];
        return [{ antes: { guid: act.guid, nombre: act.nombre }, despues: { guid: obj.guid, nombre: obj.nombre }, detalle: `${act.nombre} → ${obj.nombre}` }];
      },
      hacer: c => so.gamerPonerPlan(c.despues.guid),
      deshacer: c => so.gamerPonerPlan(c.antes.guid),
    },
    noMolestar: {
      titulo: 'No molestar (notificaciones en silencio)',
      async preparar() { const v = await so.gamerNoMolestar(); return v === 0 ? [] : [{ antes: v, despues: 0, detalle: 'notificaciones en silencio' }]; },
      hacer: () => so.gamerPonerNoMolestar(0),
      deshacer: c => so.gamerPonerNoMolestar(c.antes),
    },
    pausar: {
      titulo: 'Pausar apps que tú apruebas',
      async preparar(juego) {
        const lista = (conf().cerrar || []).map(norm).filter(Boolean);
        if (!lista.length) return [];
        const modo = conf().modo === 'cerrar' ? 'cerrar' : 'suspender';
        return (await so.gamerProcesos())
          .filter(p => lista.includes(norm(p.nombre)) && !prohibido(p, propios) && norm(p.nombre) !== norm(juego))
          .map(p => ({ antes: { pid: p.pid, nombre: p.nombre, modo }, despues: modo === 'cerrar' ? 'cerrado' : 'suspendido', detalle: `${p.nombre} (${p.pid}) ${modo === 'cerrar' ? 'cerrado' : 'en pausa'}` }));
      },
      async hacer(c) {
        if (c.antes.modo !== 'cerrar') return so.gamerSuspender(c.antes.pid);
        // cerrar no se puede deshacer → confirmación explícita (isla / Discord / Stream Deck / panel)
        const r = permisos?.pedirExterno ? await permisos.pedirExterno({ resumen: `Modo Gamer: cerrar ${c.antes.nombre} (pid ${c.antes.pid})`, origen: 'modo gamer', esperaMs: 60_000 }) : { ok: false };
        if (!r.ok) throw new Error('no confirmado');
        return so.gamerCerrar(c.antes.pid);
      },
      deshacer: c => (c.antes.modo === 'cerrar' ? null : so.gamerReanudar(c.antes.pid)),
    },
    prioridad: {
      titulo: 'Prioridad alta al juego',
      async preparar(juego) {
        if (!juego) return [];
        const j = norm(juego), pid = /^\d+$/.test(j) ? +j : 0;
        const ps = (await so.gamerProcesos()).filter(p => (pid ? p.pid === pid : norm(p.nombre) === j) && !prohibido(p, propios));
        const out = [];
        for (const p of ps.slice(0, 8)) {
          const antes = await so.gamerPrioridad(p.pid);
          if (antes !== 'High' && antes !== 'RealTime') out.push({ antes: { pid: p.pid, nombre: p.nombre, clase: antes }, despues: 'High', detalle: `${p.nombre} (${p.pid}) ${antes} → High` });
        }
        return out;
      },
      hacer: c => so.gamerPonerPrioridad(c.antes.pid, 'High'),
      deshacer: c => so.gamerPonerPrioridad(c.antes.pid, c.antes.clase),
    },
    apolo: {
      titulo: 'APOLO al mínimo (isla dormida)',
      preparar: async () => [{ antes: false, despues: true, detalle: 'isla dormida' }],
      hacer: () => emitir(true),
      deshacer: () => emitir(false),
    },
  };
  const ORDEN = ['plan', 'noMolestar', 'pausar', 'prioridad', 'apolo'];

  const activar = (juego = null) => enCola(async () => {
    if (sesion?.activo) return estado();
    juego = juego ? String(juego).slice(0, 120) : null;
    sesion = { activo: true, juego, desde: new Date().toISOString(), cambios: [] };
    guardar();
    for (const tipo of ORDEN) {
      if (!activa(tipo)) continue;
      let lista = [];
      try { lista = await ACCIONES[tipo].preparar(juego); }
      catch (e) { sesion.cambios.push({ tipo, titulo: ACCIONES[tipo].titulo, estado: 'error', error: e.message }); guardar(); continue; }
      for (const c of lista) {
        const cambio = { tipo, titulo: ACCIONES[tipo].titulo, estado: 'pendiente', antes: c.antes, despues: c.despues, detalle: c.detalle, t: Date.now() };
        sesion.cambios.push(cambio); guardar();                       // PRIMERO se apunta, luego se hace
        try { await ACCIONES[tipo].hacer(cambio); cambio.estado = 'hecho'; }
        catch (e) { cambio.estado = 'error'; cambio.error = e.message; }
        guardar();
      }
    }
    return estado();
  });

  const desactivar = ({ motivo = 'manual' } = {}) => enCola(async () => {
    if (!sesion?.activo) return { ...estado(), deshechos: 0 };
    let deshechos = 0;
    for (const c of [...sesion.cambios].reverse()) {                  // orden inverso; 'pendiente' = quizá a medias → también se deshace
      if (c.estado !== 'hecho' && c.estado !== 'pendiente') continue;
      try { await ACCIONES[c.tipo]?.deshacer(c); c.estado = 'deshecho'; deshechos++; }
      catch (e) { c.estado = 'no deshecho'; c.error = e.message; }
      guardar();
    }
    sesion.activo = false; sesion.hasta = new Date().toISOString(); sesion.motivo = motivo;
    fs.writeFileSync(fUlt, JSON.stringify(sesion, null, 2));
    try { fs.unlinkSync(fSes); } catch { }
    const fin = { ...estado(), deshechos, ultima: sesion };
    sesion = null;
    return fin;
  });

  // al arrancar: si quedó una sesión abierta (cierre a medias, apagón…), se deshace todo
  async function restaurarPendiente() {
    sesion = leer(fSes);
    if (!sesion?.activo) { sesion = null; return null; }
    return desactivar({ motivo: 'restaurar tras cierre' });
  }

  const estado = () => ({ activo: !!sesion?.activo, juego: sesion?.juego || null, desde: sesion?.desde || null, cambios: sesion?.cambios || [] });
  const ultima = () => leer(fUlt);

  function configurar(b = {}) {                                     // cfg.gamer {cerrar[], modo, acciones{}} → config.json
    const g = { ...conf() };
    if (Array.isArray(b.cerrar)) g.cerrar = [...new Set(b.cerrar.map(x => String(x).trim()).filter(x => x && !LISTA_NEGRA.has(norm(x))))].slice(0, 50);
    if (b.modo === 'cerrar' || b.modo === 'suspender') g.modo = b.modo;
    if (b.acciones && typeof b.acciones === 'object') for (const k of ORDEN) if (typeof b.acciones[k] === 'boolean') g.acciones = { ...g.acciones, [k]: b.acciones[k] };
    cfg.gamer = g;
    const f = path.join(cfg.dir, 'config.json');
    let disco = {}; try { disco = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
    disco.gamer = g; fs.writeFileSync(f, JSON.stringify(disco, null, 2));
    return g;
  }

  // API /v1/gamer (daemon → extensiones)
  async function http(M, p, b = {}, q = {}) {
    const sub = p[2] || '';
    if (!sub && M === 'GET') {
      const out = { estado: estado(), config: conf(), acciones: Object.fromEntries(ORDEN.map(k => [k, ACCIONES[k].titulo])), ultima: ultima() };
      if (q.revision !== '0') { try { out.revision = await revision.revisar(); } catch (e) { out.revision = { error: e.message }; } }
      return out;
    }
    if (sub === 'activar' && M === 'POST') return activar(b.juego);
    if (sub === 'desactivar' && M === 'POST') return desactivar({ motivo: 'panel' });
    if (sub === 'revision' && M === 'GET') return revision.revisar();
    if (sub === 'limpieza' && M === 'GET') return { zonas: await limpieza.analizar() };
    if (sub === 'limpieza' && M === 'POST') {
      if (sesion?.activo) throw err('nunca durante la partida: desactiva el Modo Gamer primero');
      if (!Array.isArray(b.ids) || !b.ids.length) throw err('elige qué limpiar (ids)');
      return limpieza.limpiar(b.ids);
    }
    if (sub === 'config' && (M === 'PATCH' || M === 'POST')) return { config: configurar(b) };
    throw err('ruta', 404);
  }

  const api = { activar, desactivar, restaurarPendiente, estado, ultima, configurar, http, revisar: () => revision.revisar(), limpieza, ACCIONES };
  INSTANCIAS.set(cfg, api);
  return api;
}

// ---------- herramientas del agente (se registran en core/herramientas.js) ----------
const inst = ctx => INSTANCIAS.get(ctx?.cfg);
const describir = e => (e.activo
  ? `Modo Gamer ACTIVO${e.juego ? ` (${e.juego})` : ''} desde ${e.desde}\n${e.cambios.map(c => `- [${c.estado}] ${c.titulo}: ${c.detalle || ''}${c.error ? ` (error: ${c.error})` : ''}`).join('\n') || '- sin cambios (ya estaba todo bien)'}`
  : 'Modo Gamer desactivado.');
const kb = n => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : `${Math.round(n / (1 << 20))} MB`);
const HERRAMIENTAS = [
  {
    nombre: 'modo_gamer', riesgo: a => (a.activar === false ? 'lectura' : 'ejecucion'),   // activar cambia el PC → pide permiso; desactivar solo restaura
    descripcion: 'Activa o desactiva el MODO GAMER: plan de energía de máximo rendimiento, notificaciones en silencio, pausa las apps que el usuario aprobó (cfg.gamer.cerrar), ' +
      'prioridad alta al juego (juego = nombre del proceso, p. ej. "eurotrucks2.exe", o su pid) y la isla se duerme. Todo se deshace al desactivar.',
    parametros: { type: 'object', properties: { activar: { type: 'boolean' }, juego: { type: 'string' } }, required: ['activar'] },
    resumen: a => (a.activar === false ? 'desactivar' : `activar${a.juego ? ` · ${a.juego}` : ''}`),
    ejecutar: async (a, ctx) => {
      const G = inst(ctx); if (!G) return 'error: el Modo Gamer no está disponible aquí';
      try {
        if (a.activar === false) { const r = await G.desactivar({ motivo: 'agente' }); return `Modo Gamer desactivado: ${r.deshechos} cambios deshechos.`; }
        return describir(await G.activar(a.juego));
      } catch (e) { return `error: ${e.message}`; }
    },
  },
  {
    nombre: 'gamer_revisar', riesgo: 'lectura',
    descripcion: 'Revisión de SOLO LECTURA del PC para jugar: frecuencia del monitor (¿144 Hz puesto a 60?), HAGS, modo juego de Windows, programas de inicio y tamaño de las cachés que se pueden limpiar.',
    parametros: { type: 'object', properties: {} },
    resumen: () => 'revisar el PC',
    ejecutar: async (a, ctx) => {
      const G = inst(ctx); if (!G) return 'error: el Modo Gamer no está disponible aquí';
      const r = await G.revisar(), z = await G.limpieza.analizar().catch(() => []);
      return [r.avisos.length ? `AVISOS:\n${r.avisos.map(x => `- ${x}`).join('\n')}` : 'Sin avisos: todo bien puesto.',
        `Monitores: ${(r.monitores || []).map(m => `${m.nombre} ${m.ancho}x${m.alto} a ${m.actualHz} Hz (máx ${m.maxHz})`).join('; ') || '?'}`,
        `HAGS: ${r.hags.texto} · Modo juego: ${r.modoJuego.texto}`,
        `Inicio (${(r.inicio || []).length}): ${(r.inicio || []).map(i => i.nombre).join(', ')}`,
        `Limpieza posible (gamer_limpiar ids): ${z.filter(x => x.existe).map(x => `${x.id} ${x.nombre} ${kb(x.bytes)}`).join('; ') || 'nada'}`].join('\n');
    },
  },
  {
    nombre: 'gamer_limpiar', riesgo: 'escritura',
    descripcion: 'Borra SOLO las cachés elegidas (ids de gamer_revisar: temp, d3d, nv-dx, nv-gl, amd-dx). Se regeneran solas; los archivos en uso se saltan. Nunca durante una partida.',
    parametros: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    resumen: a => (a.ids || []).join(', '),
    ejecutar: async (a, ctx) => {
      const G = inst(ctx); if (!G) return 'error: el Modo Gamer no está disponible aquí';
      if (G.estado().activo) return 'error: nunca durante la partida: desactiva el Modo Gamer primero';
      const r = await G.limpieza.limpiar(a.ids || []);
      return `Liberados ${kb(r.liberados)} (${r.borrados} archivos; ${r.saltados} en uso se saltaron).`;
    },
  },
];

module.exports = { crearGamer, HERRAMIENTAS, LISTA_NEGRA, prohibido, inst };
