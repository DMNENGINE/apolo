// Sandbox por niveles para código de TERCEROS (Etapa H): scripts de skills (ejecutar_script_skill) y "shell" de plugins.
//   normal       como siempre: proceso hijo con entorno limpio (sin claves) y cwd = carpeta de la skill.
//   restringido  Windows: Job Object (memoria, CPU, nº de procesos, tiempo, KILL_ON_JOB_CLOSE, sin portapapeles) + token de
//                integridad BAJA + cwd = copia temporal etiquetada "Low". Ver docs/seguridad/sandbox.md (qué bloquea y qué NO).
//   aislado      Windows Sandbox (VM desechable) con la skill en solo lectura, carpeta de salida y red apagada salvo permiso.
// Elección (cfg.seguridad.sandbox = { porDefecto: 'auto'|'normal'|'restringido'|'aislado', porSkill: { <slug> | plugin:<nombre>: nivel } }):
//   auto → normal si está FIRMADA por un autor de confianza Y el escaneo es verde (o es un plugin en desarrollo local); si no, restringido.
//   Un escaneo ROJO nunca corre en normal. Si el nivel no existe en este SO: aislado → restringido; restringido → normal con aviso
//   (o bloqueado si sinSoporte = 'bloquear'). La elección y el resultado van a la auditoría (tipo "sandbox").
// Los procesos vivos están en un registro del módulo: matarTodo() (lo llama el pánico) mata jaulas y VMs de cualquier instancia.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const NIVELES = ['normal', 'restringido', 'aislado'];
const PEDIDOS = ['auto', ...NIVELES];
const vivos = new Set();                                  // { matar() }

function implDe(plataforma = process.platform) {
  return plataforma === 'win32' ? require('./windows') : require('./otros').para(plataforma);
}
const confDe = cfg => ({ porDefecto: 'auto', porSkill: {}, memoriaMB: 512, cpu: 50, procesos: 1, protegerLectura: [], sinSoporte: 'avisar', ...(cfg?.seguridad?.sandbox || {}) });

// ¿de confianza? firma verificada (autor en cfg.skills.autoresConfianza) + escaneo verde; plugin dev = código del propio usuario
function fiable(meta = {}) {
  if (meta.dev) return { si: true, porque: 'plugin en desarrollo local' };
  const f = meta.firma?.estado || 'sin firma', e = meta.escaneo?.nivel || 'pendiente';
  if (f === 'verificada' && e === 'verde') return { si: true, porque: `firmada por ${meta.firma.autor || 'autor de confianza'} y escaneo verde` };
  return { si: false, porque: `firma ${f}, escaneo ${e}` };
}

// decisión pura (testeable): { nivel: normal|restringido|aislado|bloqueado, pedido, motivo, avisos[] }
function elegirNivel({ conf, clave, meta = {}, disp }) {
  const porSkill = conf.porSkill?.[clave];
  const pedido = PEDIDOS.includes(porSkill) ? porSkill : PEDIDOS.includes(conf.porDefecto) ? conf.porDefecto : 'auto';
  const fi = fiable(meta), avisos = [];
  let nivel, motivo;
  if (pedido === 'auto') { nivel = fi.si ? 'normal' : 'restringido'; motivo = `${fi.si ? 'de confianza' : 'no confiable'} (${fi.porque})`; }
  else { nivel = pedido; motivo = PEDIDOS.includes(porSkill) ? 'elegido por el usuario para esta skill' : 'nivel por defecto de la configuración'; }
  if (nivel === 'normal' && meta.escaneo?.nivel === 'rojo') { nivel = 'restringido'; motivo = 'escaneo ROJO: nunca corre sin sandbox'; }
  if (nivel === 'aislado' && !disp.aislado) { avisos.push(`nivel aislado no disponible: ${disp.motivoAislado || 'Windows Sandbox no está instalado'}; uso el restringido`); nivel = 'restringido'; }
  if (nivel === 'restringido' && !disp.restringido) {
    avisos.push(`nivel restringido no disponible: ${disp.motivoRestringido}`);
    nivel = conf.sinSoporte === 'bloquear' ? 'bloqueado' : 'normal';
  }
  return { nivel, pedido, motivo, avisos, fiable: fi.si };
}

function crearSandbox({ cfg = {}, auditoria = null, plataforma = process.platform, impl } = {}) {
  const so = impl || implDe(plataforma);
  const conf = () => confDe(cfg);
  const dirCache = () => path.join(cfg.dir || path.join(os.tmpdir(), 'apolo'), 'sandbox');
  let dispCache = null;
  const disponible = () => (dispCache ||= so.disponible());

  const elegir = (clave, meta) => elegirNivel({ conf: conf(), clave, meta, disp: disponible() });

  // ejecuta bin+args con el nivel elegido. dirOrigen = carpeta de la skill (se copia en restringido/aislado).
  // → { salida, codigo, nivel, decision, nota }  (nunca lanza: los errores vuelven como salida + código -1)
  async function ejecutar({ clave, meta, tipo = 'skill', bin, args = [], dirOrigen = null, env = {}, timeoutSeg = 120, signal = null, sesion = null, red = false }) {
    const d = elegir(clave, meta), c = conf();
    const nota = `[sandbox: ${d.nivel}] ${d.motivo}${d.avisos.length ? ' · ' + d.avisos.join(' · ') : ''}`;
    const idA = auditoria?.registrar({ tipo: 'sandbox', herramienta: tipo === 'plugin' ? 'plugin.shell' : 'ejecutar_script_skill', origen: clave, decision: d.nivel,
      motivo: `${d.motivo}${d.avisos.length ? ' · ' + d.avisos.join(' · ') : ''}`, resumen: `${path.basename(String(bin))} ${args.map(a => path.basename(String(a))).join(' ')}`.slice(0, 300), sesion: sesion?.id });
    const fin = (r) => {
      const marcas = String(r.salida || '').split(/\r?\n/).filter(l => l.startsWith('[sandbox]')).join(' · ');
      try { auditoria?.resultado(idA, r.codigo === 0, `${d.nivel} · código ${r.codigo}${marcas ? ' · ' + marcas : ''}`); } catch { }
      return { ...r, nivel: d.nivel, decision: d, nota };
    };
    if (d.nivel === 'bloqueado') return fin({ salida: `[sandbox] bloqueado: ${d.avisos.join(' · ')} (cfg.seguridad.sandbox.sinSoporte = 'bloquear')`, codigo: -1 });
    try {
      if (d.nivel === 'normal') return fin(await correr(spawnSeguro(bin, args, { cwd: dirOrigen || undefined, env }), { timeoutSeg, signal }));
      if (d.nivel === 'aislado') return fin(await so.ejecutarAislado({ bin, args, dirOrigen, env, timeoutSeg, signal, red: !!red, dirCache: dirCache(), registrar }));
      const prep = await so.prepararRestringido({ dirOrigen, dirCache: dirCache(), dirDatos: cfg.dir, protegerLectura: c.protegerLectura });
      try {
        const remap = a => (dirOrigen && typeof a === 'string' && a.startsWith(dirOrigen) ? prep.cwd + a.slice(dirOrigen.length) : a);
        const p = so.lanzarRestringido({ jaula: prep.jaula, bin, args: args.map(remap), cwd: prep.cwd,
          env: { ...env, ...(env.SKILL_DIR ? { SKILL_DIR: prep.cwd } : {}), TEMP: prep.tmp, TMP: prep.tmp },
          limites: { memoriaMB: c.memoriaMB, cpu: c.cpu, procesos: c.procesos, seg: Math.min(timeoutSeg, 600) } });
        return fin(await correr(p, { timeoutSeg: timeoutSeg + 10, signal }));
      } finally { prep.limpiar(); }
    } catch (e) { return fin({ salida: `[sandbox] error: ${e.message}`, codigo: -1 }); }
  }

  function estado() {
    const c = conf(), d = disponible();
    return { porDefecto: c.porDefecto, porSkill: c.porSkill, limites: { memoriaMB: c.memoriaMB, cpu: c.cpu, procesos: c.procesos }, disponible: d, vivos: vivos.size, plataforma };
  }
  // cambia el nivel de una skill/plugin (clave) o el por defecto (clave = null) y lo guarda en config.json
  function ponerNivel(clave, nivel) {
    if (!PEDIDOS.includes(nivel)) throw Object.assign(new Error(`nivel no válido (${PEDIDOS.join(', ')})`), { status: 400 });
    cfg.seguridad = cfg.seguridad || {}; cfg.seguridad.sandbox = { ...(cfg.seguridad.sandbox || {}) };
    const sb = cfg.seguridad.sandbox;
    if (clave) { sb.porSkill = { ...(sb.porSkill || {}) }; if (nivel === 'auto') delete sb.porSkill[clave]; else sb.porSkill[clave] = nivel; } else sb.porDefecto = nivel;
    if (cfg.dir) {
      const f = path.join(cfg.dir, 'config.json');
      let disco = {}; try { disco = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
      disco.seguridad = { ...(disco.seguridad || {}), sandbox: { ...(disco.seguridad?.sandbox || {}), porDefecto: sb.porDefecto, porSkill: sb.porSkill } };
      if (disco.seguridad.sandbox.porDefecto === undefined) delete disco.seguridad.sandbox.porDefecto;
      fs.writeFileSync(f, JSON.stringify(disco, null, 2));
    }
    try { auditoria?.registrar({ tipo: 'seguridad', resumen: `sandbox ${clave || '(por defecto)'} → ${nivel}`, quien: 'panel' }); } catch { }
    return estado();
  }
  async function http(M, p, b = {}) {
    if (M === 'GET' && !p[2]) return estado();
    if (M === 'PATCH' && !p[2]) return ponerNivel(b.clave || null, String(b.nivel || ''));
    throw Object.assign(new Error('ruta'), { status: 404 });
  }
  return { elegir, ejecutar, estado, ponerNivel, disponible, http, matarTodo };
}

// spawn con entorno ya limpio (lo da el llamador) y sin ventana
function spawnSeguro(bin, args, { cwd, env }) {
  return spawn(bin, args, { cwd, windowsHide: true, env });
}
function registrar(matar) { const r = { matar }; vivos.add(r); return () => vivos.delete(r); }
// recoge salida, aplica tiempo y cancelación; el proceso queda en el registro de vivos mientras corre
function correr(p, { timeoutSeg, signal }) {
  return new Promise(ok => {
    let out = '', hecho = false;
    const quitar = registrar(() => { try { p.kill(); } catch { } });
    const cerrar = r => { if (hecho) return; hecho = true; clearTimeout(t); quitar(); ok(r); };
    p.stdout?.on('data', x => { out += x; }); p.stderr?.on('data', x => { out += x; });
    const t = setTimeout(() => { try { p.kill(); } catch { } out += '\n[cancelado por tiempo]'; }, Math.min(timeoutSeg || 120, 610) * 1000);
    signal?.addEventListener('abort', () => { try { p.kill(); } catch { } }, { once: true });
    p.on('close', code => cerrar({ salida: out, codigo: code }));
    p.on('error', e => cerrar({ salida: `error: ${e.message}`, codigo: -1 }));
  });
}
// pánico: mata todo lo que corre en sandbox (jaulas → KILL_ON_JOB_CLOSE se lleva a los hijos; VMs de Windows Sandbox)
function matarTodo() {
  let n = 0;
  for (const r of [...vivos]) { try { r.matar(); n++; } catch { } vivos.delete(r); }
  return n;
}

let defecto = null;
// instancia para quien no tenga una (ctx sin sandbox): nunca hay atajo sin pasar por la elección de nivel
function porDefecto(cfg) { if (cfg) return crearSandbox({ cfg }); return (defecto ||= crearSandbox({})); }

module.exports = { crearSandbox, elegirNivel, fiable, matarTodo, porDefecto, NIVELES, PEDIDOS, _vivos: vivos };
