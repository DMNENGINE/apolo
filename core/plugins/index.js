// Gestor de plugins: instalar (carpeta/zip/tgz/npm/GitHub) → escanear (antivirus de skills) → activar en su PROPIO proceso.
//   Código en <dir>/plugins/<nombre>/ (modo dev: se usa la carpeta original y se vigila), estado en <dir>/plugins/_estado.json,
//   datos de cada plugin en <dir>/plugins-datos/<nombre>/. Nuevo = desactivado; escaneo rojo exige forzar (409).
//   Proceso: core/sdk/ejecutor.js con el modelo de permisos de Node (lee solo su carpeta, escribe solo su almacén, sin
//   child_process salvo "shell" declarado, sin el entorno del usuario). RPC JSON por IPC con timeouts; si se cae se
//   reinicia con backoff (máx. cfg.gestorPlugins.maxReinicios = 3) y después queda ROTO.
//   Herramientas: pasan por los permisos normales con el riesgo DECLARADO en el manifest (por defecto escritura; si el escaneo
//   no es verde se preguntan siempre). Permisos no declarados (red, memoria, archivos, shell…) se preguntan SIEMPRE.
const fs = require('fs');
const path = require('path');
const { fork, spawn, execFileSync } = require('child_process');
const M = require('./manifest');
const I = require('./instalar');
const { VERSION } = require('../sdk');

const SDK_DIR = require('../rutas').fuera(path.join(__dirname, '..', 'sdk'));   // el node del sistema no lee app.asar
const ORDEN = { lectura: 0, escritura: 1, ejecucion: 2 };
const maxRiesgo = (...r) => r.filter(x => x in ORDEN).reduce((a, b) => (ORDEN[b] > ORDEN[a] ? b : a), 'lectura');
const CLAVE_PLURAL = { herramienta: 'herramientas', comando: 'comandos', proveedor: 'proveedores', canal: 'canales' };
const BUS_LIBRES = ['plugins', 'skills', 'tarea'];          // eventos sin contenido de conversaciones
const BUS_PRIVADOS = ['turno', 'aviso'];                    // requieren "conversaciones"

// flags del proceso hijo: modelo de permisos de Node (estable en 22.13+/23+, experimental en 20-22) + entorno mínimo
// Dentro de Electron el modelo de permisos choca con su capa asar → se usa el node del sistema (cfg.gestorPlugins.node o PATH);
// si no hay, Electron como Node SIN límite de archivos (la red y el entorno siguen filtrados) y se avisa en el log.
let nodeSistema;
function buscarNode(ruta) {
  if (nodeSistema !== undefined && !ruta) return nodeSistema;
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const cands = ruta ? [ruta] : String(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean).map(d => path.join(d, exe));
  let r = null;
  for (const c of cands) {
    try {
      if (!fs.statSync(c).isFile()) continue;
      const v = execFileSync(c, ['-v'], { windowsHide: true, timeout: 5000 }).toString().trim().replace(/^v/, '');
      if (+v.split('.')[0] >= 20) { r = { ruta: c, version: v }; break; }
    } catch { }
  }
  if (!ruta) nodeSistema = r;
  return r;
}
function entornoHijo({ lectura, escritura, shell, node }) {
  let execPath = process.execPath, version = process.versions.node, electron = false;
  if (process.versions.electron) { const s = buscarNode(node); if (s) { execPath = s.ruta; version = s.version; } else electron = true; }
  const [ma, mi] = version.split('.').map(Number);
  const nuevo = ma > 22 || (ma === 22 && mi >= 13);
  const execArgv = [];
  if (ma >= 20 && !electron) {
    execArgv.push(nuevo ? '--permission' : '--experimental-permission');
    if (nuevo) { lectura.forEach(d => execArgv.push('--allow-fs-read=' + d)); escritura.forEach(d => execArgv.push('--allow-fs-write=' + d)); }
    else execArgv.push('--allow-fs-read=' + lectura.join(','), '--allow-fs-write=' + escritura.join(','));
    if (shell) execArgv.push('--allow-child-process');
    if (ma > 20 || mi >= 11) execArgv.push('--disable-warning=ExperimentalWarning');
  }
  execArgv.push('--max-old-space-size=512');
  const env = { APOLO_PLUGIN: '1' };
  for (const k of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'TEMP', 'TMP', 'LANG', 'TZ']) if (process.env[k]) env[k] = process.env[k];
  if (electron) env.ELECTRON_RUN_AS_NODE = '1';
  return { execPath, execArgv, env, sandbox: ma >= 20 && !electron };
}
const resumenArgs = a => { const v = Object.values(a || {}).find(x => typeof x === 'string' || typeof x === 'number'); return v === undefined ? '' : String(v).slice(0, 120); };
const sinFunciones = o => JSON.parse(JSON.stringify(o ?? null));

// Canales remotos (Telegram, WhatsApp… como plugin): la app (main.js) puede "mediar" con mediar({ resolverPermiso, accionTarjeta,
//   recibir, transcribir }); si nadie media, el gestor reenvía él mismo los permisos del núcleo (bus 'permiso') a los canales
//   con aporta.canales[].permisos = true. Un canal SOLO puede resolver los permisos (y tarjetas) que se le mostraron a él.
// Secretos: el plugin pide por nombre lo declarado en "secretos" del manifest; los da el proveedor inyectado (secretos o
//   ponerSecretos({ leer, guardar, permitir? })), p. ej. el almacén safeStorage de conectores. Fuera de su espacio "<nombre>:"
//   hace falta que el proveedor lo permita o que el usuario lo apruebe una vez. Los valores nunca van al registro.
function crearPlugins({ cfg, bus, permisos, memoria, tareas, proveedores, canales, herramientas, escaner, sesiones, enviar, tokenGithub, secretos = null }) {
  const base = path.join(cfg.dir, 'plugins'), datos = path.join(cfg.dir, 'plugins-datos'), fEstado = path.join(base, '_estado.json');
  const op = () => ({ timeoutMs: 60_000, activarMs: 20_000, proveedorMs: 300_000, maxReinicios: 3, backoffMs: 1000, dev: false, ...(cfg.gestorPlugins || {}) });
  fs.mkdirSync(base, { recursive: true });
  let estado = {}; try { estado = JSON.parse(fs.readFileSync(fEstado, 'utf8')); } catch { }
  const guardar = () => fs.writeFileSync(fEstado, JSON.stringify(estado, null, 2));
  const avisar = (accion, nombre, extra = {}) => bus.emit('evento', { tipo: 'plugins', accion, nombre, ...extra });
  const dirDe = nombre => estado[nombre]?.ruta || path.join(base, nombre);
  const nombres = () => Object.keys(estado).filter(n => fs.existsSync(path.join(dirDe(n), M.ARCHIVO)));
  const manifestDe = nombre => M.leer(dirDe(nombre), VERSION);
  const vacio = () => ({ herramientas: new Map(), comandos: new Map(), proveedores: new Map(), canales: new Map(), bus: new Set(), permisosVistos: new Map(), tarjetasVistas: new Map() });
  let anfitrion = {}, proveedorSecretos = secretos;
  const vivos = new Map();
  const rt = nombre => { let r = vivos.get(nombre); if (!r) vivos.set(nombre, r = { estado: 'parado', pend: new Map(), reg: vacio(), reinicios: 0, logs: [], n: 0, sesiones: new Map() }); return r; };
  function anotar(nombre, nivel, txt) {
    const r = rt(nombre);
    for (const linea of String(txt).split(/\r?\n/).filter(x => x.trim())) {
      const l = { t: Date.now(), nivel, texto: linea.slice(0, 2000) };
      r.logs.push(l); if (r.logs.length > 200) r.logs.shift();
      bus.emit('registro', { ...l, origen: `plugin ${nombre}` });
    }
  }
  const escanerDe = () => (typeof escaner === 'function' ? escaner() : escaner);

  // ---------- RPC ----------
  const enviarA = (proc, m) => { try { if (proc?.connected) proc.send(m); } catch { } };
  function llamar(nombre, metodo, args = {}, ms = op().timeoutMs, signal) {
    const r = rt(nombre), proc = r.proc;
    if (!proc || !proc.connected) return Promise.reject(new Error(`el plugin "${nombre}" no está en marcha`));
    if (signal?.aborted) return Promise.reject(new Error('cancelado'));
    return new Promise((ok, mal) => {
      const id = 'n' + (++r.n).toString(36);
      const cancelar = () => enviarA(proc, { t: 'llamar', id: 'x' + id, metodo: 'cancelar', args: { id } });
      const ab = () => { cancelar(); fin(mal, new Error('cancelado')); };
      const t = setTimeout(() => { cancelar(); fin(mal, new Error(`el plugin "${nombre}" no respondió a ${metodo} en ${Math.round(ms / 1000)} s`)); }, ms);
      function fin(f, v) { clearTimeout(t); r.pend.delete(id); signal?.removeEventListener?.('abort', ab); f(v); }
      signal?.addEventListener?.('abort', ab, { once: true });
      r.pend.set(id, { ok: v => fin(ok, v), mal: e => fin(mal, e) });
      enviarA(proc, { t: 'llamar', id, metodo, args });
    });
  }
  async function alMensaje(nombre, proc, m) {
    const r = rt(nombre);
    if (r.proc !== proc || !m || typeof m !== 'object') return;
    if (m.t === 'resp') { const p = r.pend.get(m.id); if (p) (m.ok ? p.ok(m.valor) : p.mal(new Error(m.error || 'error'))); return; }
    if (m.t === 'log') return anotar(nombre, ['info', 'aviso', 'error'].includes(m.nivel) ? m.nivel : 'info', m.texto);
    if (m.t === 'llamar') {
      try { enviarA(proc, { t: 'resp', id: m.id, ok: true, valor: sinFunciones(await atender(nombre, m.metodo, m.args || {})) }); }
      catch (e) { enviarA(proc, { t: 'resp', id: m.id, ok: false, error: String(e?.message || e) }); }
    }
  }

  // ---------- permisos del plugin ----------
  async function exigir(nombre, permiso, motivo = '') {
    if (M.declarado(rt(nombre).man?.permisos, permiso)) return true;
    if (cfg.permisos?.modo === 'solo-lectura') return false;
    const r = await permisos.pedirExterno({ resumen: `El plugin "${nombre}" pide ${permiso}, que NO declaró en su manifest${motivo ? ': ' + motivo : ''}`, peligro: 'permiso no declarado por el plugin', origen: `plugin ${nombre}` });
    return !!r?.ok;
  }
  const denegado = p => new Error(`DENEGADO: el usuario no permitió ${p}`);
  // secretos fuera de su espacio "<nombre>:" (p. ej. tg:token): los permite la app (proveedor.permitir) o el usuario UNA vez
  async function secretoPermitido(nombre, s) {
    if (s.toLowerCase().startsWith(nombre.toLowerCase() + ':')) return true;
    try { if (await proveedorSecretos.permitir?.({ plugin: nombre, nombre: s, origen: estado[nombre]?.origen || null, dev: !!estado[nombre]?.dev })) return true; } catch { }
    if ((estado[nombre]?.secretosOk || []).includes(s)) return true;
    if (cfg.permisos?.modo === 'solo-lectura') return false;
    const r = await permisos.pedirExterno({ resumen: `El plugin "${nombre}" quiere usar tu secreto guardado "${s}" (lo declaró en su manifest)`, peligro: 'acceso a un secreto', origen: `plugin ${nombre}` });
    if (!r?.ok) return false;
    if (estado[nombre]) { estado[nombre].secretosOk = [...new Set([...(estado[nombre].secretosOk || []), s])]; guardar(); }
    return true;
  }

  // ---------- lo que el plugin pide al núcleo ----------
  async function atender(nombre, metodo, a) {
    const r = rt(nombre);
    if (!['arrancando', 'activo'].includes(r.estado)) throw new Error('el plugin no está activo');
    switch (metodo) {
      case 'registrar': return registrar(nombre, a.tipo, a.def || {});
      case 'permiso': return exigir(nombre, String(a.permiso || ''), String(a.motivo || '').slice(0, 300));
      case 'memoria.buscar': {
        if (!await exigir(nombre, 'memoria', `buscar "${String(a.consulta).slice(0, 80)}" en tu memoria`)) throw denegado('memoria');
        return (await memoria.buscarH(String(a.consulta || ''), { limite: Math.min(+a.limite || 6, 20) })).map(m => ({ id: m.id, tipo: m.tipo, texto: m.texto }));
      }
      case 'memoria.recordar': {
        if (!await exigir(nombre, 'memoria', `guardar "${String(a.texto).slice(0, 80)}" en tu memoria`)) throw denegado('memoria');
        const m = memoria.recordar({ texto: String(a.texto || ''), tipo: a.tipo || 'hecho', origen: `plugin ${nombre}` });
        return { id: m.id, accion: m.accion };
      }
      case 'tareas.programar': {
        if (!await exigir(nombre, 'tareas', `programar "${a.nombre}"`)) throw denegado('tareas');
        const titulo = `[${nombre}] ${String(a.nombre).slice(0, 60)}`;
        if (a.clave) {
          const interna = `plugin:${nombre}:${a.clave}`;
          registrarInterna(interna);
          const ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === interna);
          if (ya) return { id: ya.id, proxima: ya.proxima, existia: true };
          const t = tareas.crear({ nombre: titulo, cuando: a.cuando, accion: { tipo: 'interna', nombre: interna } });
          return { id: t.id, proxima: t.proxima };
        }
        if (!a.aviso) throw new Error('tareas.programar: falta aviso o ejecutar');
        const t = tareas.crear({ nombre: titulo, cuando: a.cuando, accion: { tipo: 'aviso', texto: a.aviso } });
        return { id: t.id, proxima: t.proxima };
      }
      case 'tareas.ver': case 'tareas.borrar': {
        if (!await exigir(nombre, 'tareas', metodo === 'tareas.ver' ? 'ver sus tareas' : 'borrar una tarea')) throw denegado('tareas');
        const mias = tareas.lista().filter(t => t.nombre.startsWith(`[${nombre}] `));
        if (metodo === 'tareas.ver') return mias.map(t => ({ id: t.id, nombre: t.nombre, cuando: t.cuando, proxima: t.proxima, activa: t.activa, ultimoResultado: t.ultimoResultado }));
        return mias.some(t => t.id === a.id) ? tareas.borrar(a.id) : false;
      }
      case 'canal.recibir': {
        if (!r.reg.canales.has(a.id)) throw new Error(`canal "${a.id}" no registrado`);
        if (typeof anfitrion.recibir === 'function') {                // la app enruta (destinos, Claude Code, cerebro…)
          const v = await anfitrion.recibir({ plugin: nombre, canal: a.id, texto: String(a.texto || '').slice(0, 20_000), de: String(a.de || '') });
          if (v !== undefined) return String((v && typeof v === 'object' ? v.msg : v) || '');
        }
        const clave = `${a.id}\0${a.de || ''}`;
        let s = r.sesiones.get(clave) && sesiones.obtener(r.sesiones.get(clave));
        if (!s) { s = sesiones.crear({ canal: `plugin:${nombre}:${a.id}`, titulo: `${nombre}/${a.id}${a.de ? ' · ' + a.de : ''}` }); r.sesiones.set(clave, s.id); }
        return String(await enviar(s, String(a.texto || '').slice(0, 20_000)) || '');
      }
      case 'canal.estado': {
        if (!r.reg.canales.has(a.id)) throw new Error(`canal "${a.id}" no registrado`);
        canales.registrar(`plugin:${nombre}:${a.id}`, { estado: String(a.estado || 'activo').slice(0, 30), detalle: String(a.detalle || '').slice(0, 300) });
        avisar('canal', nombre, { canal: a.id, estado: String(a.estado || 'activo').slice(0, 30), detalle: String(a.detalle || '').slice(0, 300) });
        return true;
      }
      case 'canal.decidir': {                                         // botón Permitir/Denegar del canal: SOLO lo que se le mostró
        const v = r.reg.permisosVistos.get(String(a.permiso));
        if (!v || v.canal !== a.id) throw new Error('ese permiso no se mostró en este canal (o ya no está pendiente)');
        let d = String(a.decision || '');
        if (!['allow', 'always', 'deny'].includes(d)) throw new Error('decisión no válida (allow | always | deny)');
        if (d === 'always' && v.peligro) d = 'allow';                 // lo peligroso nunca se convierte en regla
        const via = String(r.reg.canales.get(a.id)?.nombre || a.id);
        // la app/núcleo avisa después con permisoResuelto (y eso lo quita de "vistos" y edita el mensaje del canal)
        const ok = typeof anfitrion.resolverPermiso === 'function' ? !!await anfitrion.resolverPermiso(v.id, d, via) : permisos.resolver(v.id, d, d === 'deny' ? `denegado desde ${via}` : via, `plugin:${nombre}/${via}`);
        if (!ok) r.reg.permisosVistos.delete(String(a.permiso));
        return ok;
      }
      case 'canal.tarjeta': {
        const v = r.reg.tarjetasVistas.get(String(a.tarjeta));
        if (!v || v.canal !== a.id) throw new Error('esa tarjeta no se mostró en este canal');
        const acc = String(a.accion || '');
        if (!['enviar', 'descartar', 'ruido', 'urgente', 'normal'].includes(acc)) throw new Error('acción de tarjeta no válida');
        if (typeof anfitrion.accionTarjeta !== 'function') throw new Error('no hay tarjetas en este equipo');
        if (['enviar', 'descartar', 'ruido'].includes(acc)) r.reg.tarjetasVistas.delete(String(a.tarjeta));
        return String(await anfitrion.accionTarjeta(v.id, acc) || '');
      }
      case 'canal.transcribir': {                                     // nota de voz descargada en SU almacén → Whisper de la app
        if (!r.reg.canales.has(a.id)) throw new Error(`canal "${a.id}" no registrado`);
        if (typeof anfitrion.transcribir !== 'function') return { texto: '', error: 'la transcripción no está disponible en este equipo' };
        const alm = path.resolve(datos, nombre), f = path.resolve(alm, String(a.ruta || ''));
        if (!f.toLowerCase().startsWith(alm.toLowerCase() + path.sep) || !fs.existsSync(f)) throw new Error('solo se transcriben archivos de tu almacén');
        const t = await anfitrion.transcribir(f) || {};
        return { texto: String(t.text ?? t.texto ?? '').slice(0, 10_000), error: t.error ? String(t.error).slice(0, 300) : '' };
      }
      case 'secreto.leer': case 'secreto.guardar': {
        const s = String(a.nombre || '');
        if (!(r.man.secretos || []).includes(s)) throw new Error(`el secreto "${s}" no está declarado en "secretos" de ${M.ARCHIVO}`);
        if (!proveedorSecretos) throw new Error('no hay almacén de secretos en este equipo');
        if (!await secretoPermitido(nombre, s)) throw denegado(`el secreto ${s}`);
        if (metodo === 'secreto.leer') return String(await proveedorSecretos.leer(s) || '');
        if (typeof proveedorSecretos.guardar !== 'function') throw new Error('el almacén de secretos es de solo lectura');
        await proveedorSecretos.guardar(s, String(a.valor ?? '').slice(0, 10_000)); return true;
      }
      case 'bus.on': {
        const tipo = String(a.tipo || '');
        if (BUS_PRIVADOS.includes(tipo)) { if (!await exigir(nombre, 'conversaciones', `escuchar los eventos "${tipo}"`)) throw denegado('conversaciones'); }
        else if (!BUS_LIBRES.includes(tipo) && !/^plugin:[\w-]+:[\w.-]+$/.test(tipo)) throw new Error(`evento "${tipo}" no disponible (${[...BUS_LIBRES, ...BUS_PRIVADOS].join(', ')}, plugin:<nombre>:<evento>)`);
        r.reg.bus.add(tipo); return true;
      }
      case 'bus.emitir': bus.emit('evento', { tipo: 'plugin', plugin: nombre, evento: String(a.tipo).slice(0, 60), datos: a.datos }); return true;
      case 'archivos.leer': case 'archivos.escribir': {
        const f = path.resolve(String(a.ruta || ''));
        const lee = metodo === 'archivos.leer';
        if (!await exigir(nombre, 'archivos:' + f, `${lee ? 'leer' : 'escribir'} ${f}`)) throw denegado('archivos:' + f);
        if (lee) return fs.readFileSync(f, 'utf8').slice(0, 2_000_000);
        fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, String(a.contenido ?? '')); return true;
      }
      case 'shell': {
        if (!await exigir(nombre, 'shell', `ejecutar: ${String(a.comando).slice(0, 300)}`)) throw denegado('shell');
        // FASE 9: declarar "shell" no da carta blanca: lo peligroso/ofuscado se pregunta SIEMPRE, uno a uno
        const pel = require('../../shared/peligro')('Bash', { command: String(a.comando || '') });
        if (pel) {
          if (cfg.permisos?.modo === 'solo-lectura') throw denegado('shell');
          const r2 = await permisos.pedirExterno({ resumen: `El plugin "${nombre}" quiere ejecutar: ${String(a.comando).slice(0, 600)}`, peligro: pel, origen: `plugin ${nombre}` });
          if (!r2?.ok) throw denegado('shell peligroso');
        }
        return shell(String(a.comando || ''), Math.min(+a.timeoutSeg || 60, 600));
      }
      default: throw new Error(`método desconocido ${metodo}`);
    }
  }
  const shell = (comando, seg) => new Promise(ok => {
    const [bin, args] = process.platform === 'win32' ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando]] : ['bash', ['-lc', comando]];
    const p = spawn(bin, args, { windowsHide: true, env: require('../seguridad').envLimpio(process.env) }); let out = '';   // sin claves ni tokens del entorno
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => p.kill(), seg * 1000);
    p.on('close', code => { clearTimeout(t); ok({ salida: out.slice(-20_000), codigo: code }); });
    p.on('error', e => { clearTimeout(t); ok({ salida: e.message, codigo: -1 }); });
  });
  function registrarInterna(interna) {
    const [, nombre, clave] = interna.split(':');
    tareas.registrarInterna(interna, async () => {
      if (rt(nombre).estado !== 'activo') throw new Error(`el plugin "${nombre}" no está activo`);
      return llamar(nombre, 'tarea', { clave }, op().timeoutMs).then(v => (typeof v === 'string' ? v : v?.texto || ''));
    });
  }

  // ---------- registros (solo lo declarado en "aporta") ----------
  function registrar(nombre, tipo, d) {
    const r = rt(nombre), id = String((tipo === 'canal' ? d.id || d.nombre : d.nombre || d.id) || '');   // en un canal "nombre" es el visible
    const decl = (r.man.aporta[CLAVE_PLURAL[tipo]] || []).find(x => x.nombre === id);
    if (!CLAVE_PLURAL[tipo]) throw new Error(`tipo de registro desconocido "${tipo}"`);
    if (!decl) throw new Error(`${tipo} "${id}" no está declarado en aporta.${CLAVE_PLURAL[tipo]} de ${M.ARCHIVO}`);
    if (tipo === 'herramienta') {
      const ya = herramientas.porNombre[id];
      if (ya && ya.plugin !== nombre) throw new Error(`ya existe una herramienta "${id}" (del núcleo o de otro plugin)`);
      const riesgoBase = maxRiesgo(decl.riesgo || 'escritura', d.riesgo);
      const confiable = () => estado[nombre]?.dev || estado[nombre]?.escaneo?.nivel === 'verde';
      const h = {
        nombre: id, plugin: nombre, parametros: d.parametros && typeof d.parametros === 'object' ? d.parametros : { type: 'object', properties: {} },
        descripcion: String(decl.descripcion || d.descripcion || id).slice(0, 2000),
        riesgo: () => (confiable() ? riesgoBase : maxRiesgo(riesgoBase, 'escritura')),
        siemprePreguntar: () => (confiable() ? '' : `herramienta del plugin "${nombre}" (escaneo ${estado[nombre]?.escaneo?.nivel || 'pendiente'})`),
        clavePermiso: () => `plugin:${nombre}/${id}`,
        resumen: resumenArgs,
        disponible: () => rt(nombre).estado === 'activo' && rt(nombre).reg.herramientas.get(id) === h,
        ejecutar: (args, ctx = {}) => llamar(nombre, 'herramienta', { nombre: id, args, ctx: { sesion: { id: ctx.sesion?.id, canal: ctx.sesion?.canal, modelo: ctx.sesion?.modelo }, cwd: ctx.cwd } }, op().timeoutMs, ctx.signal),
      };
      herramientas.registrar([h]); r.reg.herramientas.set(id, h);
    } else if (tipo === 'comando') {
      for (const [otro, x] of vivos) if (otro !== nombre && x.reg.comandos.has(id)) throw new Error(`el comando /${id} ya lo registró el plugin "${otro}"`);
      r.reg.comandos.set(id, { nombre: id, descripcion: String(decl.descripcion || d.descripcion || '').slice(0, 300) });
    } else if (tipo === 'proveedor') {
      proveedores.registrarExterno(id, { chat: req => llamar(nombre, 'proveedor', { nombre: id, peticion: peticionLimpia(req) }, op().proveedorMs, req?.signal) }, { plugin: nombre, modelos: d.modelos || [] });
      r.reg.proveedores.set(id, { nombre: id, modelos: d.modelos || [] });
    } else {
      canales.registrar(`plugin:${nombre}:${id}`, { nombre: String(d.nombre || id), tipo: 'plugin', plugin: nombre, estado: 'activo', detalle: String(d.descripcion || decl.descripcion || '') });
      r.reg.canales.set(id, { id, nombre: d.nombre || id, puedeEnviar: !!d.puedeEnviar,
        permisos: decl.permisos === true && !!d.permisos,                                   // declarado en el manifest Y con manejador
        tarjetas: !!d.tarjetas && M.declarado(r.man.permisos, 'conversaciones') });         // las tarjetas son contenido de conversaciones
    }
    return true;
  }
  const peticionLimpia = req => {
    const { signal, herramientas: hs, ...resto } = req || {};
    return { ...sinFunciones(resto), herramientas: (hs || []).map(h => ({ nombre: h.nombre, descripcion: h.descripcion, parametros: h.parametros })) };
  };
  function quitarRegistros(nombre) {
    const r = rt(nombre);
    for (const [id, h] of r.reg.herramientas) if (herramientas.porNombre[id] === h) herramientas.quitar(id);
    for (const id of r.reg.proveedores.keys()) proveedores.quitarExterno(id);
    for (const id of r.reg.canales.keys()) canales.registrar(`plugin:${nombre}:${id}`, { estado: 'inactivo', detalle: 'plugin parado' });
    r.reg = vacio();
  }

  // reenvío de eventos del bus a los plugins suscritos
  function reenviar(tipo, d) { for (const r of vivos.values()) if (r.reg.bus.has(tipo) && r.estado === 'activo') enviarA(r.proc, { t: 'evento', tipo, datos: sinFunciones(d) }); }
  bus.on('evento', e => {
    if (e.tipo === 'plugins' || e.tipo === 'skills') reenviar(e.tipo, e);
    else if (e.tipo === 'fin') reenviar('turno', { sesion: e.sesion, texto: String(e.texto || '').slice(0, 4000) });
    else if (e.tipo === 'plugin') reenviar(`plugin:${e.plugin}:${e.evento}`, e.datos);
  });
  bus.on('tarea', e => reenviar('tarea', { id: e.tarea?.id, nombre: e.tarea?.nombre, tipo: e.tipo, texto: String(e.texto || '').slice(0, 2000) }));
  bus.on('aviso-externo', e => reenviar('aviso', e));
  // sin app que medie (daemon/CLI solos): los permisos del núcleo van directos a los canales que los aceptan
  bus.on('permiso', req => {
    if (anfitrion.resolverPermiso || !req) return;
    mostrarPermiso({ id: req.id, tool: req.herramienta === 'externo' ? req.origen || 'externo' : req.herramienta, detail: req.resumen, peligro: req.peligro || '', session: req.origen || 'APOLO' }).catch(() => { });
  });
  bus.on('permiso-resuelto', e => { if (!anfitrion.resolverPermiso && e) permisoResuelto(e.id, e.decision, String(e.motivo || 'APOLO').replace(/^denegado desde /, '')); });

  // ---------- canales remotos: permisos y tarjetas ----------
  const canalesCon = (prop, filtro = {}) => {
    const out = [];
    for (const [nombre, r] of vivos) {
      if (r.estado !== 'activo' || (filtro.plugin && filtro.plugin !== nombre)) continue;
      for (const c of r.reg.canales.values()) if (c[prop] && (!filtro.canal || filtro.canal === c.id)) out.push({ nombre, r, c });
    }
    return out;
  };
  // p = { id, tool, detail, peligro, session } (lo mismo que movil.sendPerm de main.js). Devuelve en cuántos canales se mostró.
  async function mostrarPermiso(p, filtro = {}) {
    if (!p || p.id === undefined || p.id === null) return 0;
    const limpio = { id: String(p.id), tool: String(p.tool || '').slice(0, 200), detail: String(p.detail ?? '').slice(0, 2000), peligro: p.peligro ? String(p.peligro).slice(0, 200) : '', session: String(p.session || '').slice(0, 120) };
    const rs = await Promise.all(canalesCon('permisos', filtro).map(async ({ nombre, r, c }) => {
      r.reg.permisosVistos.set(limpio.id, { id: p.id, canal: c.id, peligro: !!limpio.peligro });     // antes de enviar: el botón puede llegar enseguida
      try { if (await llamar(nombre, 'canal.permiso', { id: c.id, permiso: limpio })) return 1; } catch (e) { anotar(nombre, 'aviso', `permiso no mostrado: ${e.message}`); }
      r.reg.permisosVistos.delete(limpio.id); return 0;
    }));
    return rs.reduce((a, b) => a + b, 0);
  }
  function permisoResuelto(id, decision, via = '') {
    const k = String(id);
    for (const [nombre, r] of vivos) {
      const v = r.reg.permisosVistos.get(k); if (!v) continue;
      r.reg.permisosVistos.delete(k);
      if (r.estado === 'activo') llamar(nombre, 'canal.permisoResuelto', { id: v.canal, permiso: k, decision: String(decision || ''), via: String(via || '') }).catch(() => { });
    }
  }
  // c = tarjeta del cerebro { id, kind, author, guild, resumen, respuesta, prioridad, canSend }
  async function mostrarTarjeta(t, filtro = {}) {
    if (!t || t.id === undefined) return 0;
    const limpia = { id: String(t.id), kind: String(t.kind || ''), author: String(t.author || '').slice(0, 120), guild: String(t.guild || '').slice(0, 120), resumen: String(t.resumen || '').slice(0, 2000), respuesta: String(t.respuesta || '').slice(0, 2000), prioridad: String(t.prioridad || ''), canSend: !!t.canSend };
    const rs = await Promise.all(canalesCon('tarjetas', filtro).map(async ({ nombre, r, c }) => {
      r.reg.tarjetasVistas.set(limpia.id, { id: t.id, canal: c.id });
      try { if (await llamar(nombre, 'canal.tarjeta', { id: c.id, tarjeta: limpia })) return 1; } catch (e) { anotar(nombre, 'aviso', `tarjeta no mostrada: ${e.message}`); }
      r.reg.tarjetasVistas.delete(limpia.id); return 0;
    }));
    return rs.reduce((a, b) => a + b, 0);
  }
  // acciones de configuración del canal (panel: estado, conectar, enlace…) → canal.acciones[accion](datos) en el plugin
  const accionCanal = (nombre, id, accion, datosA = {}) => llamar(nombre, 'canal.accion', { id: String(id), accion: String(accion), datos: sinFunciones(datosA) });
  const mediar = (a = {}) => { anfitrion = { ...anfitrion, ...a }; };
  const ponerSecretos = p => { proveedorSecretos = p || null; };

  // ---------- ciclo de vida del proceso ----------
  async function lanzar(nombre) {
    const r = rt(nombre), man = manifestDe(nombre), dir = path.resolve(dirDe(nombre));
    const alm = path.join(datos, nombre); fs.mkdirSync(alm, { recursive: true });
    r.man = man; r.estado = 'arrancando'; r.parando = false; r.reg = vacio();
    const lectura = [SDK_DIR, dir, alm], escritura = [alm];
    for (const p of man.permisos) if (p.startsWith('archivos:')) { const ru = path.resolve(p.slice(9)); lectura.push(ru); escritura.push(ru); }
    const { execPath, execArgv, env, sandbox } = entornoHijo({ lectura, escritura, shell: man.permisos.includes('shell'), node: op().node });
    if (!sandbox) anotar(nombre, 'aviso', 'sin modelo de permisos de Node (instala Node 20+ o pon cfg.gestorPlugins.node): el plugin corre sin límite de archivos');
    const proc = fork(path.join(SDK_DIR, 'ejecutor.js'), [], { cwd: alm, env, execPath, execArgv, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    r.proc = proc;
    proc.stdout?.on('data', d => anotar(nombre, 'info', d)); proc.stderr?.on('data', d => anotar(nombre, 'error', d));
    proc.on('message', m => alMensaje(nombre, proc, m));
    proc.on('exit', (code, sig) => alSalir(nombre, proc, code, sig));
    proc.on('error', e => anotar(nombre, 'error', e.message));
    proc.unref(); proc.channel?.unref?.(); proc.stdout?.unref?.(); proc.stderr?.unref?.();   // no mantienen vivo al núcleo (CLI, tests)
    await llamar(nombre, 'iniciar', { nombre, version: man.version, dir, entrada: man.entrada, config: sinFunciones(cfg.plugins?.[nombre] || {}), almacen: alm, permisos: man.permisos }, op().activarMs);
    r.estado = 'activo'; r.desde = Date.now();
  }
  function alSalir(nombre, proc, code, sig) {
    const r = rt(nombre); if (r.proc !== proc) return;
    r.proc = null;
    for (const p of [...r.pend.values()]) p.mal(new Error(`el plugin "${nombre}" se cayó (código ${code ?? sig})`));
    r.pend.clear(); quitarRegistros(nombre);
    const eraActivo = r.estado === 'activo';
    if (r.parando || !estado[nombre]?.activo || !eraActivo) { if (r.estado !== 'roto') r.estado = 'parado'; return; }
    anotar(nombre, 'error', `el proceso terminó (código ${code ?? sig})`);
    caida(nombre, `se cayó (código ${code ?? sig})`);
  }
  function caida(nombre, motivo) {
    const r = rt(nombre);
    if (r.reinicios >= op().maxReinicios) {
      r.estado = 'roto';
      if (estado[nombre]) { estado[nombre].roto = { motivo, fecha: Date.now() }; guardar(); }
      anotar(nombre, 'error', `marcado ROTO tras ${r.reinicios} reinicios: ${motivo}`);
      return avisar('roto', nombre, { motivo });
    }
    const espera = op().backoffMs * 3 ** r.reinicios;
    r.reinicios++; r.estado = 'reiniciando';
    avisar('reiniciando', nombre, { intento: r.reinicios, espera, motivo });
    clearTimeout(r.temporizador);
    r.temporizador = setTimeout(() => { r.temporizador = null; if (estado[nombre]?.activo && !r.parando) arrancar(nombre).catch(() => { }); }, espera);
  }
  async function arrancar(nombre, { manual = false } = {}) {
    const r = rt(nombre);
    try {
      await lanzar(nombre);
      clearTimeout(r.estable); r.estable = setTimeout(() => { r.reinicios = 0; }, 300_000); r.estable.unref?.();
      avisar('activo', nombre);
      return true;
    } catch (e) {
      anotar(nombre, 'error', `no arrancó: ${e.message}`);
      await detener(nombre, { suave: false });
      if (manual) throw e;
      caida(nombre, `no arrancó: ${e.message}`);
      return false;
    }
  }
  async function detener(nombre, { suave = true } = {}) {
    const r = rt(nombre), proc = r.proc;
    clearTimeout(r.temporizador); clearTimeout(r.estable); r.parando = true;
    if (proc && suave && r.estado === 'activo') { try { await llamar(nombre, 'desactivar', {}, 5000); } catch { } }
    if (proc) await new Promise(ok => {
      if (proc.exitCode !== null || proc.signalCode) return ok();
      const t = setTimeout(ok, 3000); proc.once('exit', () => { clearTimeout(t); ok(); });
      try { proc.kill(); } catch { ok(); }
    });
    if (r.proc === proc) r.proc = null;
    quitarRegistros(nombre);
    r.estado = estado[nombre]?.roto ? 'roto' : 'parado';
  }
  // modo dev: recarga en caliente al cambiar archivos
  function vigilar(nombre, on = true) {
    const r = rt(nombre);
    try { r.vigia?.close(); } catch { } r.vigia = null;
    if (!on || !(estado[nombre]?.dev || op().dev) || !estado[nombre]?.activo) return;
    try {
      let t = null;
      r.vigia = fs.watch(dirDe(nombre), { recursive: true }, (ev, f) => {
        if (f && /(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(f)) return;
        clearTimeout(t); t = setTimeout(() => recargar(nombre).then(() => anotar(nombre, 'info', `recargado (cambió ${f || 'algo'})`)).catch(e => anotar(nombre, 'error', `recarga fallida: ${e.message}`)), 400);
      });
      r.vigia.unref?.();
    } catch (e) { anotar(nombre, 'aviso', `no puedo vigilar la carpeta: ${e.message}`); }
  }

  // ---------- vista pública ----------
  function publica(nombre) {
    const e = estado[nombre] || {}, r = rt(nombre);
    let man = null, error = '';
    try { man = manifestDe(nombre); } catch (x) { error = x.message; }
    const n = l => (l || []).map(x => x.nombre);
    return {
      nombre, version: man?.version || e.version || '', descripcion: man?.descripcion || '', autor: man?.autor || '', licencia: man?.licencia || '',
      apoloSdk: man?.apoloSdk || '', permisos: man?.permisos || [],
      aporta: man ? { herramientas: man.aporta.herramientas, canales: n(man.aporta.canales), proveedores: n(man.aporta.proveedores), comandos: n(man.aporta.comandos), vistas: man.aporta.vistas, gestos: n(man.aporta.gestos), voces: n(man.aporta.voces) } : null,
      activo: !!e.activo, estado: r.estado, roto: e.roto || null, reinicios: r.reinicios, escaneo: e.escaneo || null, firma: e.firma || null, origen: e.origen || null, dev: !!e.dev, ruta: dirDe(nombre), fecha: e.fecha || null,
      registrados: { herramientas: [...r.reg.herramientas.keys()], comandos: [...r.reg.comandos.keys()], proveedores: [...r.reg.proveedores.keys()], canales: [...r.reg.canales.keys()] },
      ...(error ? { error } : {}),
    };
  }
  const existe = nombre => { if (!estado[nombre]) { const e = new Error(`no hay ningún plugin "${nombre}"`); e.status = 404; throw e; } };

  // ---------- operaciones ----------
  async function escanear(nombre) {
    existe(nombre);
    let r;
    try {
      const e = escanerDe(); if (!e) throw new Error('el escáner no está disponible');
      const man = manifestDe(nombre);
      const dominios = man.permisos.filter(p => p === 'red' || p.startsWith('red:')).map(p => (p === 'red' ? '*' : p.slice(4)));
      r = await e.escanear(dirDe(nombre), { marcador: M.ARCHIVO, dominios });
      r = { nivel: ['verde', 'amarillo', 'rojo'].includes(r?.nivel) ? r.nivel : 'amarillo', hallazgos: Array.isArray(r?.hallazgos) ? r.hallazgos.slice(0, 200) : [], resumen: String(r?.resumen || ''), explicacion: String(r?.explicacion || '') };
    } catch (x) { r = { nivel: 'amarillo', hallazgos: [], resumen: `no se pudo escanear: ${x.message}`, explicacion: '', error: true }; }
    r.fecha = Date.now();
    // firma ed25519 (core/skills/firmar.js): inválida = cuarentena roja
    let firma; try { firma = require('../skills/firmar').verificar(dirDe(nombre), cfg.skills?.autoresConfianza); } catch (x) { firma = { estado: 'invalida', motivo: x.message }; }
    firma.fecha = Date.now();
    if (firma.estado === 'invalida') {
      r.nivel = 'rojo'; r.hallazgos.unshift({ archivo: 'FIRMA.json', linea: 0, regla: 'firma inválida', gravedad: 'crítica', texto: firma.motivo });
      r.resumen = `FIRMA INVÁLIDA: ${firma.motivo}. ${r.resumen}`.trim();
    }
    estado[nombre].firma = firma;
    estado[nombre].escaneo = r; guardar();
    if (r.nivel === 'rojo' && estado[nombre].activo) { estado[nombre].activo = false; guardar(); await detener(nombre); }
    avisar('escaneado', nombre, { nivel: r.nivel });
    return r;
  }

  async function instalar(fuente, { reemplazar = false, dev = false } = {}) {
    const tr = await I.traer(fuente, { cfg, tokenGithub });
    try {
      const x = I.elegir(tr);
      if (x.opciones) return { opciones: x.opciones };
      const man = M.leer(x.dir, VERSION);
      if (estado[man.nombre] && !reemplazar) { const e = new Error(`el plugin "${man.nombre}" ya está instalado (reinstala con reemplazar o usa recargar)`); e.status = 409; throw e; }
      if (dev && tr.origen.tipo !== 'local') throw new Error('el modo dev solo vale para carpetas locales');
      I.comprobarTamano(x.dir);
      if (estado[man.nombre]) await detener(man.nombre);
      let destino = x.dir;
      if (!dev) {
        destino = path.join(base, man.nombre);
        fs.rmSync(destino, { recursive: true, force: true });
        I.copiar(x.dir, destino);
        try { await I.instalarDependencias(destino); } catch (e) { fs.rmSync(destino, { recursive: true, force: true }); throw new Error(`no pude instalar sus dependencias: ${e.message}`); }
      }
      estado[man.nombre] = { activo: false, origen: tr.origen, version: man.version, fecha: Date.now(), escaneo: null, ...(dev ? { dev: true, ruta: path.resolve(destino) } : {}) };
      guardar(); avisar('instalado', man.nombre);
      await escanear(man.nombre);
      return { plugin: publica(man.nombre) };
    } finally { tr.limpiar(); }
  }

  async function activar(nombre, on, { forzar = false } = {}) {
    existe(nombre);
    const r = rt(nombre);
    if (!on) {
      estado[nombre].activo = false; guardar();
      vigilar(nombre, false); await detener(nombre);
      avisar('desactivado', nombre);
      return publica(nombre);
    }
    manifestDe(nombre);                                        // valida (y comprueba la versión del SDK)
    if (!estado[nombre].escaneo) await escanear(nombre);
    if (estado[nombre].escaneo?.nivel === 'rojo' && !forzar) { const e = new Error('el escaneo es ROJO: para activarlo igualmente confirma con forzar'); e.status = 409; throw e; }
    if (r.estado === 'activo' && estado[nombre].activo) return publica(nombre);
    delete estado[nombre].roto; r.reinicios = 0;
    await detener(nombre, { suave: false });
    await arrancar(nombre, { manual: true });
    estado[nombre].activo = true; guardar();
    vigilar(nombre);
    avisar('activado', nombre);
    return publica(nombre);
  }

  async function recargar(nombre) {
    existe(nombre);
    manifestDe(nombre);
    if (!estado[nombre].activo) return publica(nombre);
    const r = rt(nombre);
    await detener(nombre);
    delete estado[nombre].roto; r.reinicios = 0; guardar();
    try { await arrancar(nombre, { manual: true }); }
    catch (e) { caida(nombre, `no arrancó al recargar: ${e.message}`); throw e; }
    avisar('recargado', nombre);
    return publica(nombre);
  }

  async function borrar(nombre) {
    existe(nombre);
    estado[nombre].activo = false;
    vigilar(nombre, false); await detener(nombre);
    if (!estado[nombre].dev) fs.rmSync(path.join(base, nombre), { recursive: true, force: true });   // en dev la carpeta es del usuario: no se toca
    delete estado[nombre]; guardar(); vivos.delete(nombre);
    avisar('borrado', nombre);
    return true;
  }

  // comandos /x de los plugins (CLI, chat)
  function comandos() { const out = []; for (const [p, r] of vivos) if (r.estado === 'activo') for (const c of r.reg.comandos.values()) out.push({ ...c, plugin: p }); return out; }
  async function comando(cmd, texto = '', ctx = {}) {
    for (const [p, r] of vivos) if (r.estado === 'activo' && r.reg.comandos.has(cmd)) {
      const v = await llamar(p, 'comando', { nombre: cmd, texto, ctx: sinFunciones(ctx) });
      return typeof v === 'string' ? v : v?.texto || '';
    }
    return null;
  }
  // enviar por un canal de un plugin (avisos proactivos)
  const enviarCanal = (nombre, id, texto, a) => llamar(nombre, 'canal', { id, texto: String(texto), a });

  // arranque: tareas internas de plugins + plugins activos
  async function iniciar() {
    try { for (const t of tareas.lista()) if (t.accion?.tipo === 'interna' && /^plugin:[\w-]+:/.test(t.accion.nombre)) registrarInterna(t.accion.nombre); } catch { }
    const lista = nombres().filter(n => estado[n].activo && !estado[n].roto);
    await Promise.all(lista.map(async n => { if (await arrancar(n)) vigilar(n); }));
    return lista.length;
  }
  async function cerrar() { await Promise.all([...vivos.keys()].map(n => { vigilar(n, false); return detener(n); })); }

  return {
    lista: () => nombres().map(publica), obtener: nombre => (estado[nombre] ? { ...publica(nombre), logs: rt(nombre).logs.slice(-50) } : null),
    instalar, activar, recargar, borrar, escanear, iniciar, cerrar, comandos, comando, enviarCanal, llamar,
    mediar, ponerSecretos, mostrarPermiso, permisoResuelto, mostrarTarjeta, accionCanal,
    activo: nombre => rt(nombre).estado === 'activo', estadoDe: nombre => rt(nombre).estado,
    dir: base, datos, version: VERSION,
  };
}

module.exports = { crearPlugins, entornoHijo };
