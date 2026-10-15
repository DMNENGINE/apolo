// Servicios en línea del usuario (webs, bots de Discord, apps, túneles, servidores): se comprueban cada minuto y Mission Control
// los pinta en los racks de la sala de servidores (un rack por grupo, un servidor del rack por servicio).
// Config: <dir>/servicios.json  { grupos: [{ id, nombre, servicios: [{ id, nombre, url } | { id, nombre, ssh, unidad } | { id, nombre, ssh, pm2 } | { id, nombre, ssh } | { id, nombre, tcp }] }] }
//   url      → GET; en línea si responde < 500 (los 52x de Cloudflare = caído)
//   ssh+unidad → `systemctl is-active <unidad>` en esa máquina (una sola conexión por máquina para todas sus unidades)
//   ssh+pm2  → estado de la app en `pm2 jlist` · ssh solo → la máquina responde · tcp "host:puerto" → el puerto abre
// /v1/servicios: GET → { grupos, estado, revisado } · PUT { grupos } · POST revisar
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');

const SSH_OK = /^[\w.-]+@[\w.-]+$/, NOMBRE_OK = /^[\w@.:-]+$/;

function sshDefecto(destino, comando) {
  return new Promise(ok => execFile('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', '-o', 'StrictHostKeyChecking=accept-new', destino, comando],
    { timeout: 20000, windowsHide: true, maxBuffer: 4 << 20 }, (e, salida) => ok({ ok: !e || e.code === 3, salida: String(salida || ''), error: e && !salida ? e.message : '' })));
}
function tcpDefecto(destino) {
  const [host, puerto] = String(destino).split(':');
  return new Promise(ok => { const t0 = Date.now(), s = net.connect({ host, port: +puerto, timeout: 6000 });
    s.once('connect', () => { s.destroy(); ok({ ok: true, ms: Date.now() - t0 }); }); s.once('timeout', () => { s.destroy(); ok({ ok: false, detalle: 'sin respuesta' }); }); s.once('error', e => ok({ ok: false, detalle: e.code || e.message })); });
}

function validar(c) {
  const grupos = (Array.isArray(c?.grupos) ? c.grupos : []).slice(0, 12).map((g, i) => ({
    id: String(g.id || `g${i}`).replace(/[^\w-]/g, '').slice(0, 30) || `g${i}`, nombre: String(g.nombre || 'Grupo').slice(0, 30),
    servicios: (Array.isArray(g.servicios) ? g.servicios : []).slice(0, 8).map((s, j) => {
      const x = { id: String(s.id || `${i}-${j}`).replace(/[^\w.-]/g, '').slice(0, 40) || `${i}-${j}`, nombre: String(s.nombre || s.id || 'servicio').slice(0, 40) };
      if (s.url && /^https?:\/\//i.test(s.url)) x.url = String(s.url).slice(0, 300);
      else if (s.ssh && SSH_OK.test(s.ssh)) { x.ssh = s.ssh; if (s.unidad && NOMBRE_OK.test(s.unidad)) x.unidad = s.unidad; else if (s.pm2 && NOMBRE_OK.test(s.pm2)) x.pm2 = s.pm2; }
      else if (s.tcp && /^[\w.-]+:\d{1,5}$/.test(s.tcp)) x.tcp = s.tcp;
      else return null;
      return x;
    }).filter(Boolean),
  }));
  return { grupos };
}

function crearServicios({ cfg, bus, log, fetch: f = globalThis.fetch, ssh = sshDefecto, tcp = tcpDefecto, cadaMs = 60_000 }) {
  const archivo = path.join(cfg.dir, 'servicios.json');
  let conf = { grupos: [] }, estado = {}, revisado = 0, corriendo = null, timer = null;
  try { conf = validar(JSON.parse(fs.readFileSync(archivo, 'utf8'))); } catch { }

  async function web(s) {
    const t0 = Date.now(), ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 10000);
    try { const r = await f(s.url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'APOLO-monitor/1' } }); try { await r.body?.cancel?.(); } catch { }
      return r.status < 500 ? { ok: true, ms: Date.now() - t0, detalle: `HTTP ${r.status}` } : { ok: false, ms: Date.now() - t0, detalle: `HTTP ${r.status}` }; }
    catch (e) { return { ok: false, detalle: e.name === 'AbortError' ? 'no responde (10 s)' : (e.cause?.code || e.message) }; }
    finally { clearTimeout(tm); }
  }

  // todas las comprobaciones de una máquina en una sola conexión ssh
  async function maquina(destino, lista) {
    const unidades = lista.filter(s => s.unidad).map(s => s.unidad), pm2 = lista.some(s => s.pm2);
    const cmd = `echo APOLO-OK; ${unidades.length ? `systemctl is-active ${unidades.join(' ')}; ` : ''}${pm2 ? 'echo APOLO-PM2; pm2 jlist 2>/dev/null' : ''}`;
    const t0 = Date.now(), r = await ssh(destino, cmd), ms = Date.now() - t0, out = {};
    if (!/APOLO-OK/.test(r.salida)) { for (const s of lista) out[s.id] = { ok: false, detalle: `sin conexión con ${destino.split('@')[1]}` }; return out; }
    const [antes, despues = ''] = r.salida.split('APOLO-PM2'), lineas = antes.split('\n').map(l => l.trim()).filter(Boolean).slice(1);
    let apps = []; try { apps = JSON.parse(despues.trim() || '[]'); } catch { }
    for (const s of lista) {
      if (s.unidad) { const v = lineas[unidades.indexOf(s.unidad)] || 'desconocido'; out[s.id] = { ok: v === 'active', detalle: v }; }
      else if (s.pm2) { const a = apps.find(x => x.name === s.pm2); out[s.id] = a ? { ok: a.pm2_env?.status === 'online', detalle: `pm2 ${a.pm2_env?.status}` } : { ok: false, detalle: 'no está en pm2' }; }
      else out[s.id] = { ok: true, ms, detalle: 'responde' };
    }
    return out;
  }

  async function revisar() {
    if (corriendo) return corriendo;
    corriendo = (async () => {
      const todos = conf.grupos.flatMap(g => g.servicios), nuevo = {}, porMaquina = new Map();
      for (const s of todos) if (s.ssh) { if (!porMaquina.has(s.ssh)) porMaquina.set(s.ssh, []); porMaquina.get(s.ssh).push(s); }
      await Promise.all([
        ...todos.filter(s => s.url).map(async s => { nuevo[s.id] = await web(s); }),
        ...todos.filter(s => s.tcp).map(async s => { nuevo[s.id] = await tcp(s.tcp); }),
        ...[...porMaquina].map(async ([d, l]) => Object.assign(nuevo, await maquina(d, l))),
      ]);
      const ahora = Date.now();
      for (const s of todos) {
        const n = nuevo[s.id] || { ok: false, detalle: '?' }, v = estado[s.id];
        n.t = ahora; n.desde = v && v.ok === n.ok ? v.desde : ahora;
        if (v && v.ok !== n.ok) log?.(n.ok ? 'info' : 'aviso', `${s.nombre} ${n.ok ? 'vuelve a estar en línea' : `se ha caído (${n.detalle})`}`);
        nuevo[s.id] = n;
      }
      estado = nuevo; revisado = ahora;
      bus?.emit('servicios', { estado, revisado });
      return estado;
    })().finally(() => { corriendo = null; });
    return corriendo;
  }

  function empezar() { clearInterval(timer); if (conf.grupos.length) { revisar().catch(() => {}); timer = setInterval(() => revisar().catch(() => {}), cadaMs); timer.unref?.(); } }
  function parar() { clearInterval(timer); timer = null; }

  async function http(M, p, cuerpo) {
    if (M === 'GET' && !p[2]) return { ...conf, estado, revisado };
    if (M === 'PUT' && !p[2]) { conf = validar(cuerpo); fs.writeFileSync(archivo, JSON.stringify(conf, null, 1)); estado = {}; empezar(); return { ...conf, estado, revisado }; }
    if (M === 'POST' && p[2] === 'revisar') { await revisar(); return { ...conf, estado, revisado }; }
    const e = new Error('no encontrado'); e.status = 404; throw e;
  }
  return { http, revisar, empezar, parar, estado: () => estado };
}

module.exports = { crearServicios, validar };
