// Proceso de UN plugin (lo lanza core/plugins con child_process.fork y el modelo de permisos de Node):
//   - lee solo core/sdk, la carpeta del plugin, su almacén y las archivos:<ruta> declaradas; escribe solo en su almacén y esas rutas
//   - child_process solo si declara "shell"; sin variables de entorno del usuario (ni claves ni token)
//   - red: fetch/http/https/net/tls vigilados → dominios declarados (red:dominio); lo demás se pregunta al usuario (fetch) o se bloquea
// RPC JSON por IPC en los dos sentidos: { t:'llamar', id, metodo, args } → { t:'resp', id, ok, valor | error }; { t:'log' }, { t:'evento' }.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { VERSION } = require('./index');

const SDK = path.join(__dirname, 'index.js');
const resolverOrig = Module._resolveFilename;
const SUBMODULOS = { '@apolo/sdk/ws-cliente': path.join(__dirname, 'ws-cliente.js') };   // piezas del SDK que un plugin puede pedir
Module._resolveFilename = function (req, ...r) { return req === '@apolo/sdk' ? SDK : SUBMODULOS[req] || resolverOrig.call(this, req, ...r); };

const enviar = m => { try { if (process.connected) process.send(m); } catch { } };
const texto = x => (typeof x === 'string' ? x : x instanceof Error ? x.stack || x.message : (() => { try { return JSON.stringify(x); } catch { return String(x); } })());
const log = (nivel, ...a) => enviar({ t: 'log', nivel, texto: a.map(texto).join(' ').slice(0, 4000) });
console.log = console.info = (...a) => log('info', ...a);
console.warn = (...a) => log('aviso', ...a);
console.error = (...a) => log('error', ...a);

// ---------- RPC hacia el núcleo ----------
let n = 0;
const esperando = new Map();
function llamar(metodo, args = {}, ms = 30_000) {
  return new Promise((ok, mal) => {
    const id = 'h' + (++n).toString(36);
    const t = ms ? setTimeout(() => { esperando.delete(id); mal(new Error(`el núcleo no respondió a ${metodo} en ${ms / 1000} s`)); }, ms) : null;
    esperando.set(id, { ok, mal, t });
    enviar({ t: 'llamar', id, metodo, args });
  });
}

// ---------- red ----------
let redOk = () => true;
function vigilarRed(permisos) {
  const red = permisos.filter(p => p === 'red' || p.startsWith('red:')).map(p => (p === 'red' ? '*' : p.slice(4).toLowerCase()));
  const aprobados = new Set();
  redOk = h => {
    h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
    return red.includes('*') || aprobados.has(h) || red.some(d => d === h || (d.startsWith('*.') && (h.endsWith(d.slice(1)) || h === d.slice(2))));
  };
  async function asegurar(h) {
    if (redOk(h)) return;
    const si = await llamar('permiso', { permiso: 'red:' + h, motivo: `conectar con ${h}` }, 0);
    if (!si) throw new Error(`red: "${h}" no está declarado en apolo-plugin.json (red:${h}) y el usuario no lo permitió`);
    aprobados.add(String(h).toLowerCase());
  }
  const bloquear = h => { if (h !== undefined && !redOk(h)) throw new Error(`red: "${h}" no está declarado en apolo-plugin.json; decláralo (red:${h}) o pide permiso antes con apolo.permisos.pedir('red:${h}')`); };
  const f = globalThis.fetch;
  if (f) globalThis.fetch = async function (entrada, init) {
    const u = new URL(typeof entrada === 'string' || entrada instanceof URL ? String(entrada) : entrada.url);
    await asegurar(u.hostname);
    return f.call(this, entrada, init);
  };
  const hostHttp = a => { const x = a[0]; if (typeof x === 'string' || x instanceof URL) return new URL(String(x)).hostname; return x?.hostname || String(x?.host || 'localhost').replace(/:\d+$/, ''); };
  for (const nom of ['http', 'https']) {
    const m = require(nom);
    for (const fn of ['request', 'get']) { const o = m[fn]; m[fn] = function (...a) { bloquear(hostHttp(a)); return o.apply(this, a); }; }
  }
  const hostNet = a => { const x = a[0]; if (x && typeof x === 'object') return x.path ? undefined : x.host || x.servername || 'localhost'; if (typeof x === 'number' || /^\d+$/.test(String(x))) return a[1] && typeof a[1] === 'string' ? a[1] : 'localhost'; return undefined; };
  const net = require('net'), tls = require('tls');
  const nc = net.connect; net.connect = net.createConnection = function (...a) { bloquear(hostNet(a)); return nc.apply(this, a); };
  const tc = tls.connect; tls.connect = function (...a) { bloquear(hostNet(a)); return tc.apply(this, a); };
}

// ---------- API que recibe el plugin ----------
const reg = { herramientas: new Map(), comandos: new Map(), proveedores: new Map(), canales: new Map(), tareas: new Map(), bus: new Map() };
let def = null, pendientes = [];
const congelar = o => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
const exigir = (c, t) => { if (!c) throw new Error(t); };

function crearApi(a) {
  const registrar = (tipo, d) => { const p = llamar('registrar', { tipo, def: d }, 15_000); pendientes.push(p); p.catch(() => { }); return p; };
  const declarados = Object.freeze([...a.permisos]);
  const fArch = clave => path.join(a.almacen, String(clave).replace(/[^\w.-]/g, '_').slice(0, 120) + '.json');
  return Object.freeze({
    nombre: a.nombre, version: a.version, sdk: VERSION,
    config: congelar(JSON.parse(JSON.stringify(a.config || {}))),
    log: (...x) => log('info', ...x),
    registrarHerramienta(h) {
      exigir(h && /^[a-z][a-z0-9_-]{0,50}$/i.test(h.nombre || ''), 'registrarHerramienta: nombre no válido');
      exigir(typeof h.ejecutar === 'function', 'registrarHerramienta: falta ejecutar(args, ctx)');
      reg.herramientas.set(h.nombre, h);
      return registrar('herramienta', { nombre: h.nombre, descripcion: String(h.descripcion || ''), parametros: h.parametros || { type: 'object', properties: {} }, riesgo: h.riesgo });
    },
    registrarComando(c) {
      exigir(c && c.nombre && typeof c.ejecutar === 'function', 'registrarComando: nombre y ejecutar(texto, ctx) obligatorios');
      reg.comandos.set(c.nombre, c);
      return registrar('comando', { nombre: c.nombre, descripcion: String(c.descripcion || '') });
    },
    registrarProveedor(p) {
      exigir(p && p.nombre && typeof p.chat === 'function', 'registrarProveedor: nombre y chat(peticion) obligatorios');
      reg.proveedores.set(p.nombre, p);
      return registrar('proveedor', { nombre: p.nombre, modelos: Array.isArray(p.modelos) ? p.modelos.map(String) : [] });
    },
    registrarCanal(c) {
      const id = c && (c.id || c.nombre);
      exigir(id, 'registrarCanal: id obligatorio');
      reg.canales.set(id, c);
      registrar('canal', { id, nombre: String(c.nombre || id), descripcion: String(c.descripcion || ''), puedeEnviar: typeof c.enviar === 'function',
        permisos: typeof c.permiso === 'function', tarjetas: typeof c.tarjeta === 'function' });
      return Object.freeze({
        recibir: (txt, o = {}) => llamar('canal.recibir', { id, texto: String(txt), de: o.de ? String(o.de) : '' }, 0),
        estado: (estado, detalle = '') => llamar('canal.estado', { id, estado: String(estado), detalle: String(detalle) }),
        // solo permisos/tarjetas que el núcleo mostró en ESTE canal (permiso(p) / tarjeta(t)); lo demás se rechaza
        decidir: (permiso, decision) => llamar('canal.decidir', { id, permiso: String(permiso), decision: String(decision) }),
        tarjeta: (tarjeta, accion) => llamar('canal.tarjeta', { id, tarjeta: String(tarjeta), accion: String(accion) }, 120_000),
        // audio guardado en tu almacén (apolo.almacen.ruta) → { texto, error }
        transcribir: ruta => llamar('canal.transcribir', { id, ruta: String(ruta) }, 300_000),
      });
    },
    bus: Object.freeze({
      on(tipo, fn) { exigir(typeof fn === 'function', 'bus.on: falta la función'); const l = reg.bus.get(tipo) || []; l.push(fn); reg.bus.set(tipo, l); return l.length === 1 ? llamar('bus.on', { tipo }, 0) : Promise.resolve(true); },
      off(tipo, fn) { const l = (reg.bus.get(tipo) || []).filter(x => x !== fn); reg.bus.set(tipo, l); },
      emitir: (tipo, datos) => llamar('bus.emitir', { tipo: String(tipo), datos }),
    }),
    // solo los nombres declarados en "secretos" del manifest; los da la app desde su almacén cifrado. No los registres en el log.
    secretos: Object.freeze({
      leer: nombre => llamar('secreto.leer', { nombre: String(nombre) }, 0),
      guardar: (nombre, valor) => llamar('secreto.guardar', { nombre: String(nombre), valor: String(valor ?? '') }, 0),
    }),
    memoria: Object.freeze({
      buscar: (consulta, o = {}) => llamar('memoria.buscar', { consulta: String(consulta), limite: o.limite }, 0),
      recordar: (txt, o = {}) => llamar('memoria.recordar', { texto: String(txt), tipo: o.tipo }, 0),
    }),
    tareas: Object.freeze({
      programar({ nombre, cuando, aviso, ejecutar }) {
        exigir(nombre && cuando, 'tareas.programar: nombre y cuando obligatorios');
        const clave = String(nombre).toLowerCase().replace(/[^\w-]+/g, '-').slice(0, 60);
        if (typeof ejecutar === 'function') reg.tareas.set(clave, ejecutar);
        return llamar('tareas.programar', { nombre: String(nombre), cuando, aviso: aviso ? String(aviso) : '', clave: typeof ejecutar === 'function' ? clave : '' }, 0);
      },
      ver: () => llamar('tareas.ver', {}, 0),
      borrar: id => llamar('tareas.borrar', { id: String(id) }, 0),
    }),
    permisos: Object.freeze({
      declarados,
      pedir: (permiso, motivo = '') => llamar('permiso', { permiso: String(permiso), motivo: String(motivo) }, 0),
    }),
    archivos: Object.freeze({
      leer: ruta => llamar('archivos.leer', { ruta: String(ruta) }, 0),
      escribir: (ruta, contenido) => llamar('archivos.escribir', { ruta: String(ruta), contenido: String(contenido) }, 0),
    }),
    shell: (comando, o = {}) => llamar('shell', { comando: String(comando), timeoutSeg: o.timeoutSeg }, 0),
    almacen: Object.freeze({
      ruta: a.almacen,
      leer(clave, porDefecto = null) { try { return JSON.parse(fs.readFileSync(fArch(clave), 'utf8')); } catch { return porDefecto; } },
      guardar(clave, valor) { fs.mkdirSync(a.almacen, { recursive: true }); fs.writeFileSync(fArch(clave), JSON.stringify(valor, null, 1)); return true; },
      borrar(clave) { try { fs.rmSync(fArch(clave)); return true; } catch { return false; } },
    }),
  });
}

// ---------- llamadas del núcleo ----------
const enCurso = new Map();                                  // id de la llamada → AbortController
async function conSenal(id, fn) { const c = new AbortController(); enCurso.set(id, c); try { return await fn(c.signal); } finally { enCurso.delete(id); } }
const resultado = r => (typeof r === 'string' ? r : r && typeof r === 'object' && 'texto' in r ? { texto: String(r.texto) } : r === undefined || r === null ? '' : texto(r));

const resultadoCrudo = r => { try { return JSON.parse(JSON.stringify(r ?? null)); } catch { return String(r); } };

const MANEJADORES = {
  async iniciar(a) {
    vigilarRed(a.permisos || []);
    const mod = require(path.join(a.dir, a.entrada));
    def = mod && mod.__esModule && mod.default ? mod.default : mod && mod.activar ? mod : mod?.default;
    if (!def || typeof def.activar !== 'function') throw new Error('la entrada no exporta definirPlugin({ activar(apolo) })');
    pendientes = [];
    await def.activar(crearApi(a));
    const r = await Promise.allSettled(pendientes);
    const mal = r.find(x => x.status === 'rejected');
    if (mal) throw mal.reason;
    return { herramientas: [...reg.herramientas.keys()], comandos: [...reg.comandos.keys()] };
  },
  async desactivar() { if (def?.desactivar) await def.desactivar(); return true; },
  herramienta({ nombre, args, ctx }, id) {
    const h = reg.herramientas.get(nombre); if (!h) throw new Error(`herramienta "${nombre}" no registrada`);
    return conSenal(id, async signal => resultado(await h.ejecutar(args || {}, { ...(ctx || {}), signal })));
  },
  comando({ nombre, texto: t, ctx }, id) {
    const c = reg.comandos.get(nombre); if (!c) throw new Error(`comando "${nombre}" no registrado`);
    return conSenal(id, async signal => resultado(await c.ejecutar(String(t || ''), { ...(ctx || {}), signal })));
  },
  proveedor({ nombre, peticion }, id) {
    const p = reg.proveedores.get(nombre); if (!p) throw new Error(`proveedor "${nombre}" no registrado`);
    return conSenal(id, async signal => {
      const r = await p.chat({ ...(peticion || {}), signal }) || {};
      return { texto: String(r.texto || ''), toolCalls: Array.isArray(r.toolCalls) ? r.toolCalls : [], uso: { entrada: +r.uso?.entrada || 0, salida: +r.uso?.salida || 0 } };
    });
  },
  async canal({ id, texto: t, a }) { const c = reg.canales.get(id); if (!c?.enviar) throw new Error(`el canal "${id}" no envía`); await c.enviar(String(t), { a }); return true; },
  async 'canal.permiso'({ id, permiso }) { const c = reg.canales.get(id); if (!c?.permiso) return false; return (await c.permiso(permiso)) !== false; },
  async 'canal.permisoResuelto'({ id, permiso, decision, via }) { const c = reg.canales.get(id); if (c?.permisoResuelto) await c.permisoResuelto(permiso, decision, via); return true; },
  async 'canal.tarjeta'({ id, tarjeta }) { const c = reg.canales.get(id); if (!c?.tarjeta) return false; return (await c.tarjeta(tarjeta)) !== false; },
  async 'canal.accion'({ id, accion, datos }) {
    const c = reg.canales.get(id), f = c?.acciones?.[accion];
    if (typeof f !== 'function' || !Object.prototype.hasOwnProperty.call(c.acciones, accion)) throw new Error(`el canal "${id}" no tiene la acción "${accion}"`);
    return resultadoCrudo(await f(datos || {}));
  },
  async tarea({ clave }) { const f = reg.tareas.get(clave); if (!f) throw new Error(`tarea "${clave}" sin función`); return resultado(await f()); },
  cancelar({ id }) { enCurso.get(id)?.abort(new Error('cancelado')); return true; },
};

process.on('message', async m => {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'resp') {
    const e = esperando.get(m.id); if (!e) return;
    esperando.delete(m.id); clearTimeout(e.t);
    return m.ok ? e.ok(m.valor) : e.mal(new Error(m.error || 'error'));
  }
  if (m.t === 'evento') { for (const fn of reg.bus.get(m.tipo) || []) { try { await fn(m.datos); } catch (e) { log('error', `bus ${m.tipo}:`, e); } } return; }
  if (m.t === 'llamar') {
    const f = MANEJADORES[m.metodo];
    try { if (!f) throw new Error(`método desconocido ${m.metodo}`); enviar({ t: 'resp', id: m.id, ok: true, valor: await f(m.args || {}, m.id) }); }
    catch (e) { enviar({ t: 'resp', id: m.id, ok: false, error: String(e?.message || e) }); }
  }
});
process.on('disconnect', () => process.exit(0));
process.on('uncaughtException', e => { log('error', 'excepción no capturada:', e); setTimeout(() => process.exit(1), 50); });
process.on('unhandledRejection', e => log('error', 'promesa rechazada sin capturar:', e));
enviar({ t: 'hola', sdk: VERSION, pid: process.pid });
