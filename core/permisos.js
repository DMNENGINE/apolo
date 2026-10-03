// Permisos: decide si una herramienta se ejecuta sola, se pregunta o se bloquea.
// Las peticiones pendientes se resuelven desde cualquier canal (isla, Discord, Stream Deck, CLI, web).
const fs = require('fs');
const path = require('path');
const esPeligroso = require('../shared/peligro');
const seg = require('./seguridad');
const { crearExfil } = require('./exfil');

const ALIAS = { shell: 'Bash', escribir_archivo: 'Write', editar_archivo: 'Edit' };   // para reutilizar peligro.js
const RUTAS = new Set(['leer_archivo', 'listar', 'escribir_archivo', 'editar_archivo']);
const nivel = r => ({ lectura: 0, pantalla: 1, escritura: 2, control: 2, ejecucion: 3 }[r] ?? 2);
const dentro = (f, d) => { const a = path.resolve(f).toLowerCase(), b = path.resolve(d).toLowerCase(); return a === b || a.startsWith(b + path.sep); };
const normPrefijo = p => String(p || '').toLowerCase().replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|com)$/, '');

function crearPermisos({ cfg, bus }) {
  const f = path.join(cfg.dir, 'reglas.json');
  let reglas = []; try { reglas = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
  const pendientes = new Map();
  let n = 0;
  let bloqueo = () => '';                      // kill switch (core/panico.js): mientras devuelva un motivo, todo lo que no sea lectura se deniega
  let auditoria = null;                       // core/auditoria.js (se engancha después)
  const exfil = crearExfil({ cfg });           // anti-exfiltración (el agente le cuenta los turnos y lo leído)

  function clave(h, args, cwd) {
    if (h.clavePermiso) return { herramienta: h.nombre, prefijo: h.clavePermiso(args) };   // p. ej. scripts de skills: por skill/script
    if (h.nombre === 'shell') return { herramienta: 'shell', prefijo: esPeligroso.analizar(args.comando).primera };   // normalizada: sin ruta, sin .exe, minúsculas
    if (args.dominio !== undefined) return { herramienta: h.nombre, prefijo: String(args.dominio) };   // navegador: regla por sitio
    if (args.ruta === undefined) return { herramienta: h.nombre, prefijo: '*' };
    return { herramienta: h.nombre, prefijo: path.dirname(path.resolve(cwd, String(args.ruta))) };
  }
  const coincide = (r, k) => r.herramienta === k.herramienta &&
    (k.herramienta === 'shell' ? normPrefijo(r.prefijo) === k.prefijo : k.prefijo === '*' ? r.prefijo === k.prefijo : (k.prefijo + path.sep).startsWith(r.prefijo + path.sep));

  async function pedir({ h, args, sesion, ctx }) {
    const modo = cfg.permisos.modo;
    let riesgo = typeof h.riesgo === 'function' ? h.riesgo(args, sesion) : h.riesgo;
    // FASE 9: rutas sensibles (token, claves, .env, ssh…), escribir en los datos de APOLO y la red local (SSRF) nunca pasan solas
    const rutaAbs = RUTAS.has(h.nombre) && args.ruta !== undefined ? path.resolve(sesion.cwd || '.', String(args.ruta)) : '';
    const sensible = (rutaAbs && (seg.rutaSensible(rutaAbs, { dirNucleo: cfg.dir }) || (/^(escribir|editar)_/.test(h.nombre) && dentro(rutaAbs, cfg.dir) && !dentro(rutaAbs, path.join(cfg.dir, 'turno', 'worktrees')) && 'datos internos de APOLO')))
      || (h.nombre === 'web' && seg.urlPrivada(args.url) && 'red local / este equipo') || '';
    if (sensible && riesgo === 'lectura') riesgo = 'escritura';
    // anti-exfiltración (core/exfil.js): enviar datos a un dominio nuevo se pregunta aunque sea "lectura" y aunque el modo sea auto
    const ex = exfil.evaluar({ h, args, sesion });
    if (ex && !reglas.some(r => coincide(r, { herramienta: 'exfil', prefijo: ex.dominio }))) {
      const mb = bloqueo(); if (mb) return { ok: false, motivo: mb };
      const resumen = `ENVIAR DATOS a ${ex.dominio} (primera vez): ${ex.motivo} · ${ex.url}`;
      if (ex.modo === 'bloquear') {
        auditoria?.registrar({ tipo: 'accion', sesion: sesion.id, herramienta: h.nombre, resumen, riesgo: 'exfil', decision: 'deny', quien: 'anti-exfiltración', resultado: 'bloqueado' });
        return { ok: false, motivo: `anti-exfiltración: ${ex.motivo} a ${ex.dominio}, bloqueado por configuración (seguridad.exfil = bloquear)` };
      }
      const k = { herramienta: 'exfil', prefijo: ex.dominio };
      if (sesion.turnoNoche) {
        bus.emit('turno-permiso', { sesion: sesion.id, herramienta: h.nombre, resumen, clave: k, peligro: 'anti-exfiltración' });
        return { ok: false, motivo: 'TURNO DE NOCHE: enviar datos a un dominio nuevo necesita permiso del usuario; queda pendiente para la mañana. No lo intentes por otra vía.' };
      }
      const r = await esperar({ sesion: sesion.id, herramienta: h.nombre, resumen, args, peligro: '', exfil: true }, k, 'exfil', ex);
      if (!r.ok || riesgo === 'lectura') return r;
    }
    if (riesgo === 'lectura') return { ok: true };
    const motivoBloqueo = bloqueo();
    if (motivoBloqueo) { auditoria?.registrar({ tipo: 'accion', sesion: sesion.id, herramienta: h.nombre, resumen: h.resumen(args), riesgo, decision: 'deny', quien: 'pánico', resultado: 'bloqueado' }); return { ok: false, motivo: motivoBloqueo }; }
    if (modo === 'solo-lectura') return { ok: false, motivo: 'modo solo-lectura' };
    // siemprePreguntar: herramientas que se aprueban una a una (control del PC, acciones delicadas): sin reglas "siempre" ni modo auto
    const an = h.nombre === 'shell' ? esPeligroso.analizar(args.comando) : null;
    const peligro = (sensible ? `acceso sensible: ${sensible}` : '') || h.siemprePreguntar?.(args, ctx) || esPeligroso(ALIAS[h.nombre] || h.nombre, { command: args.comando, file_path: args.ruta && path.resolve(sesion.cwd, args.ruta) });
    const k = clave(h, args, sesion.cwd);
    // un comando compuesto (; && | $( )) o envuelto (cmd /c, powershell -c…) no se aprueba por la regla de su primera palabra
    const porRegla = !(an && (an.compuesto || an.envoltorio)) && reglas.some(r => coincide(r, k));
    if (!peligro && (modo === 'auto' || porRegla)) {
      const aid = nivel(riesgo) >= 2 ? auditoria?.registrar({ tipo: 'accion', sesion: sesion.id, herramienta: h.nombre, resumen: h.resumen(args), riesgo, decision: 'allow', quien: porRegla ? 'regla siempre' : 'modo auto' }) : null;
      return { ok: true, auditId: aid };
    }
    // turno de noche (core/turno.js): un permiso NUEVO no despierta a nadie; queda apuntado para la mañana y el encargo sigue/pasa al siguiente.
    // Lo aprobado por la mañana (reintentar con aprobar) vale solo para ese encargo; lo peligroso, solo para el mismo comando exacto.
    if (sesion.turnoNoche) {
      const resumen = String(h.resumen(args) || '').slice(0, 300);
      if ((sesion.turnoNoche.permitidos || []).some(x => x.herramienta === k.herramienta && x.prefijo === k.prefijo && (!peligro || x.resumen === resumen))) return { ok: true };
      bus.emit('turno-permiso', { sesion: sesion.id, herramienta: h.nombre, resumen, clave: k, peligro });
      return { ok: false, motivo: 'TURNO DE NOCHE: esto necesita un permiso nuevo del usuario y queda pendiente para la mañana. No lo intentes por otra vía: sigue con lo que puedas hacer sin ello y apúntalo en tu informe.' };
    }

    return esperar({ sesion: sesion.id, herramienta: h.nombre, resumen: h.resumen(args), args, peligro }, k, riesgo);
  }
  // crea la petición pendiente y espera la respuesta del usuario (10 min → deny)
  function esperar(datos, k, riesgo, exf = null) {
    const id = `p${Date.now().toString(36)}${(++n).toString(36)}`;
    const req = { id, ...datos, creado: Date.now() };
    return new Promise(ok => {
      const t = setTimeout(() => resolver(id, 'deny', 'sin respuesta en 10 min'), 600_000);
      pendientes.set(id, { req, ok, t, k, riesgo, exf });
      bus.emit('permiso', req);
    });
  }

  // decision: allow | always | deny
  // quien = canal/dispositivo que decidió (panel, isla, discord, movil:<nombre>, nodo:<id>, streamdeck…) → registro de auditoría
  function resolver(id, decision, motivo, quien = 'desconocido') {
    const p = pendientes.get(id); if (!p) return false;
    pendientes.delete(id); clearTimeout(p.t);
    if (decision === 'always' && p.k && !p.req.peligro && !reglas.some(r => coincide(r, p.k))) {
      reglas.push(p.k); fs.writeFileSync(f, JSON.stringify(reglas, null, 2));
    }
    const ok = decision === 'allow' || decision === 'always';
    if (ok && p.exf) exfil.marcarVisitado(p.exf.dominio, p.exf.turno);   // aprobado una vez: conocido desde el turno siguiente
    bus.emit('permiso-resuelto', { id, decision, motivo, quien: String(quien).slice(0, 60) });
    const aid = auditoria?.registrar({ tipo: p.req.herramienta === 'externo' ? 'externo' : 'accion', sesion: p.req.sesion, herramienta: p.req.herramienta, origen: p.req.origen, resumen: p.req.resumen,
      riesgo: p.riesgo || '', peligro: p.req.peligro || undefined, decision, quien: String(quien).slice(0, 60), motivo: ok ? undefined : (motivo || 'denegado por el usuario') });
    p.ok({ ok, motivo: ok ? '' : (motivo || 'denegado por el usuario'), auditId: ok ? aid : null });
    return true;
  }

  // un agente externo (vía MCP) pide permiso para algo que va a hacer él; espera tu respuesta
  function pedirExterno({ resumen, peligro = '', origen = 'externo', esperaMs = 300_000 }) {
    const mb = bloqueo(); if (mb) return Promise.resolve({ ok: false, motivo: mb });
    const id = `p${Date.now().toString(36)}${(++n).toString(36)}`;
    const req = { id, sesion: null, herramienta: 'externo', origen: String(origen).slice(0, 40), resumen: String(resumen).slice(0, 1500), args: { comando: String(resumen).slice(0, 1500) }, peligro: String(peligro || '').slice(0, 120), creado: Date.now() };
    return new Promise(ok => {
      const t = setTimeout(() => resolver(id, 'deny', 'sin respuesta a tiempo'), Math.min(esperaMs, 600_000));
      pendientes.set(id, { req, ok, t, k: null });
      bus.emit('permiso', req);
    });
  }
  function borrarRegla(i) { if (!reglas[i]) return false; reglas.splice(i, 1); fs.writeFileSync(f, JSON.stringify(reglas, null, 2)); return true; }
  // pánico: deniega todo lo pendiente
  function denegarTodo(motivo = 'pánico', quien = 'pánico') { let c = 0; for (const id of [...pendientes.keys()]) if (resolver(id, 'deny', motivo, quien)) c++; return c; }
  return { pedir, pedirExterno, resolver, exfil, borrarRegla, denegarTodo, ponerBloqueo: fn => { bloqueo = typeof fn === 'function' ? fn : () => ''; }, ponerAuditoria: a => { auditoria = a; },
    resultado: (aid, ok, texto) => { if (aid && auditoria) auditoria.resultado(aid, ok, texto); }, pendientes: () => [...pendientes.values()].map(p => p.req), reglas: () => reglas };
}

module.exports = { crearPermisos };
