// Conexión de la CLI con el núcleo: cliente del daemon (API /v1 en 127.0.0.1) o, si no está corriendo, núcleo en proceso.
// La misma interfaz en los dos casos, así la TUI no sabe cuál usa.
'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { carpetaDatos } = require('../config');

function leerSSE(cuerpo, alEvento) {
  const dec = new TextDecoder(); let buf = '';
  const lector = cuerpo.getReader();
  return (async () => {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, k); buf = buf.slice(k + 2);
        const datos = bloque.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
        if (datos) try { alEvento(JSON.parse(datos)); } catch { }
      }
    }
  })();
}

async function conectarDaemon({ dir = carpetaDatos(), puerto } = {}) {
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')); } catch { }
  const port = puerto || +process.env.APOLO_NUCLEO_PUERTO || cfg.puerto || 47900;
  let token; try { token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim(); } catch { return null; }
  const base = `http://127.0.0.1:${port}`;
  const cab = { 'x-robot-token': token, 'content-type': 'application/json' };
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { ...cab, 'x-cliente': 'cli' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const t = await r.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { texto: t }; }
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
    return j;
  };
  let estado;
  try { estado = await Promise.race([pedir('GET', '/v1/estado'), new Promise((_, m) => setTimeout(() => m(new Error('timeout')), 1500))]); }
  catch { return null; }

  const bus = new EventEmitter();
  let parar = null, cerrado = false;
  const escuchar = async () => {                       // SSE global: permisos, subagentes… (sin x-cliente: no es un "motor")
    while (!cerrado) {
      try {
        const ctl = new AbortController(); parar = () => ctl.abort();
        const r = await fetch(base + '/v1/eventos', { headers: { 'x-robot-token': token }, signal: ctl.signal });
        bus.emit('conexion', true);
        await leerSSE(r.body, e => bus.emit('evento', e));
      } catch { }
      if (cerrado) break;
      bus.emit('conexion', false);
      await new Promise(ok => setTimeout(ok, 2000));
    }
  };
  escuchar();

  return {
    modo: 'daemon', base, estado, dir, bus,
    nombre: estado.nombre || 'APOLO',
    crearSesion: o => pedir('POST', '/v1/sesiones', { canal: 'cli', ...o }),
    sesion: id => pedir('GET', `/v1/sesiones/${id}`),
    sesiones: () => pedir('GET', '/v1/sesiones'),
    cambiarSesion: (id, c) => pedir('PATCH', `/v1/sesiones/${id}`, c),
    async enviar(id, texto, alEvento) {
      const r = await fetch(`${base}/v1/sesiones/${id}/mensajes`, { method: 'POST', headers: { ...cab, 'x-cliente': 'cli' }, body: JSON.stringify({ texto }) });
      if (!r.ok) { let e = ''; try { e = (await r.json()).error; } catch { } throw new Error(e || `HTTP ${r.status}`); }
      await leerSSE(r.body, alEvento);
    },
    cancelar: id => pedir('POST', `/v1/sesiones/${id}/cancelar`, {}),
    compactar: id => pedir('POST', `/v1/sesiones/${id}/compactar`, {}),
    resolver: (id, decision) => pedir('POST', `/v1/permisos/${id}`, { decision }),
    pendientes: async () => (await pedir('GET', '/v1/estado')).permisos || [],
    memoria: q => pedir('GET', '/v1/memoria' + (q ? '?q=' + encodeURIComponent(q) : '')),
    recordar: texto => pedir('POST', '/v1/memoria', { texto, tipo: 'hecho' }),
    tareas: () => pedir('GET', '/v1/tareas'),
    skills: async () => (await pedir('GET', '/v1/skills')).skills,
    plugins: async () => (await pedir('GET', '/v1/plugins')).plugins,
    uso: () => pedir('GET', '/v1/uso?dias=7'),
    config: () => pedir('GET', '/v1/config'),
    panico: () => pedir('POST', '/v1/panico', { origen: 'cli', quien: 'cli' }),
    conectarMcp: id => pedir('POST', `/v1/mcp-remotos/${id}/conectar`, {}),
    flujoMcp: f => pedir('GET', `/v1/mcp-remotos/flujo/${f}`),
    diseno: () => pedir('GET', '/v1/diseno'),
    reanudar: () => pedir('POST', '/v1/panico/reanudar', { quien: 'cli' }),
    cerrar() { cerrado = true; parar?.(); },
  };
}

function enProceso() {
  const { crearNucleo } = require('../index');
  const n = crearNucleo();
  const bus = new EventEmitter();
  n.bus.on('permiso', e => bus.emit('evento', { tipo: 'permiso', ...e }));
  n.bus.on('permiso-resuelto', e => bus.emit('evento', { tipo: 'permiso-resuelto', ...e }));
  n.bus.on('agente', a => bus.emit('evento', { tipo: 'agente', agente: a }));
  const sinMensajes = s => { const { mensajes, ...m } = s; return m; };
  return {
    modo: 'proceso', dir: n.cfg.dir, bus, nucleo: n,
    nombre: (() => { try { return n.personalidad.nombre(); } catch { return 'APOLO'; } })(),
    estado: { modeloPorDefecto: n.cfg.modeloPorDefecto, proveedores: n.proveedores.disponibles() },
    crearSesion: async o => sinMensajes(n.sesiones.crear({ canal: 'cli', ...o })),
    sesion: async id => n.sesiones.obtener(id),
    sesiones: async () => n.sesiones.lista(),
    async cambiarSesion(id, ch) {
      const s = n.sesiones.obtener(id);
      if (ch.modelo) s.modelo = ch.modelo; if (ch.cwd) s.cwd = path.resolve(ch.cwd); if (ch.titulo) s.titulo = ch.titulo;
      n.sesiones.guardarMeta(s); return sinMensajes(s);
    },
    enviar: (id, texto, alEvento) => n.enviar(n.sesiones.obtener(id), texto, alEvento).catch(() => { }),
    cancelar: async id => ({ ok: n.agente.cancelar(id) }),
    async compactar(id) { const s = n.sesiones.obtener(id); const r = await n.compactador.compactar(s, { forzar: true }); n.sesiones.guardarMeta(s); return r ? { ok: true, ...r } : { ok: false, motivo: 'no hay nada antiguo que resumir' }; },
    resolver: async (id, d) => n.permisos.resolver(id, d, undefined, 'cli'),
    pendientes: async () => n.permisos.pendientes(),
    memoria: async q => q ? n.memoria.buscarH(q, { limite: 50 }) : n.memoria.lista(),
    recordar: async texto => n.memoria.recordar({ texto, tipo: 'hecho', origen: 'cli' }),
    tareas: async () => n.tareas.lista(),
    skills: async () => n.skills.lista(),
    plugins: async () => n.plugins.lista(),
    uso: async () => require('../admin').uso(n.sesiones, 7),
    config: async () => n.cfg,
    panico: async () => n.panico.activar('cli'),
    conectarMcp: id => n.mcpRemotos.conectar(id),
    flujoMcp: async f => n.mcpRemotos.flujo(f) || { estado: 'desconocido' },
    diseno: async () => n.diseno.http('GET', ['v1', 'diseno']),
    reanudar: async () => n.panico.reanudar('cli'),
    cerrar() { },
  };
}

async function conectar(opciones = {}) {
  if (!opciones.local) { const d = await conectarDaemon(opciones); if (d) return d; }
  return enProceso();
}

module.exports = { conectar, conectarDaemon, enProceso, leerSSE };
