// Permisos: decide si una herramienta se ejecuta sola, se pregunta o se bloquea.
// Las peticiones pendientes se resuelven desde cualquier canal (isla, Discord, Stream Deck, CLI, web).
const fs = require('fs');
const path = require('path');
const esPeligroso = require('../shared/peligro');

const ALIAS = { shell: 'Bash', escribir_archivo: 'Write', editar_archivo: 'Edit' };   // para reutilizar peligro.js

function crearPermisos({ cfg, bus }) {
  const f = path.join(cfg.dir, 'reglas.json');
  let reglas = []; try { reglas = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
  const pendientes = new Map();
  let n = 0;

  function clave(h, args, cwd) {
    if (h.nombre === 'shell') return { herramienta: 'shell', prefijo: String(args.comando || '').trim().split(/\s+/)[0] };
    if (args.dominio !== undefined) return { herramienta: h.nombre, prefijo: String(args.dominio) };   // navegador: regla por sitio
    if (args.ruta === undefined) return { herramienta: h.nombre, prefijo: '*' };
    return { herramienta: h.nombre, prefijo: path.dirname(path.resolve(cwd, String(args.ruta))) };
  }
  const coincide = (r, k) => r.herramienta === k.herramienta &&
    (k.herramienta === 'shell' || k.prefijo === '*' ? r.prefijo === k.prefijo : (k.prefijo + path.sep).startsWith(r.prefijo + path.sep));

  async function pedir({ h, args, sesion }) {
    const modo = cfg.permisos.modo;
    const riesgo = typeof h.riesgo === 'function' ? h.riesgo(args, sesion) : h.riesgo;
    if (riesgo === 'lectura') return { ok: true };
    if (modo === 'solo-lectura') return { ok: false, motivo: 'modo solo-lectura' };
    // siemprePreguntar: herramientas que se aprueban una a una (control del PC, acciones delicadas): sin reglas "siempre" ni modo auto
    const peligro = h.siemprePreguntar?.(args) || esPeligroso(ALIAS[h.nombre] || h.nombre, { command: args.comando, file_path: args.ruta && path.resolve(sesion.cwd, args.ruta) });
    const k = clave(h, args, sesion.cwd);
    if (!peligro && (modo === 'auto' || reglas.some(r => coincide(r, k)))) return { ok: true };

    const id = `p${Date.now().toString(36)}${(++n).toString(36)}`;
    const req = { id, sesion: sesion.id, herramienta: h.nombre, resumen: h.resumen(args), args, peligro, creado: Date.now() };
    return new Promise(ok => {
      const t = setTimeout(() => resolver(id, 'deny', 'sin respuesta en 10 min'), 600_000);
      pendientes.set(id, { req, ok, t, k });
      bus.emit('permiso', req);
    });
  }

  // decision: allow | always | deny
  function resolver(id, decision, motivo) {
    const p = pendientes.get(id); if (!p) return false;
    pendientes.delete(id); clearTimeout(p.t);
    if (decision === 'always' && p.k && !p.req.peligro && !reglas.some(r => coincide(r, p.k))) {
      reglas.push(p.k); fs.writeFileSync(f, JSON.stringify(reglas, null, 2));
    }
    const ok = decision === 'allow' || decision === 'always';
    bus.emit('permiso-resuelto', { id, decision, motivo });
    p.ok({ ok, motivo: ok ? '' : (motivo || 'denegado por el usuario') });
    return true;
  }

  // un agente externo (vía MCP) pide permiso para algo que va a hacer él; espera tu respuesta
  function pedirExterno({ resumen, peligro = '', origen = 'externo', esperaMs = 300_000 }) {
    const id = `p${Date.now().toString(36)}${(++n).toString(36)}`;
    const req = { id, sesion: null, herramienta: 'externo', origen: String(origen).slice(0, 40), resumen: String(resumen).slice(0, 1500), args: { comando: String(resumen).slice(0, 1500) }, peligro: String(peligro || '').slice(0, 120), creado: Date.now() };
    return new Promise(ok => {
      const t = setTimeout(() => resolver(id, 'deny', 'sin respuesta a tiempo'), Math.min(esperaMs, 600_000));
      pendientes.set(id, { req, ok, t, k: null });
      bus.emit('permiso', req);
    });
  }
  function borrarRegla(i) { if (!reglas[i]) return false; reglas.splice(i, 1); fs.writeFileSync(f, JSON.stringify(reglas, null, 2)); return true; }
  return { pedir, pedirExterno, resolver, borrarRegla, pendientes: () => [...pendientes.values()].map(p => p.req), reglas: () => reglas };
}

module.exports = { crearPermisos };
