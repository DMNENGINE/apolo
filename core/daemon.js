#!/usr/bin/env node
// Daemon del núcleo: API HTTP local (127.0.0.1) + eventos SSE. Header obligatorio: x-robot-token (archivo <dir>/token).
//   GET  /v1/estado                      versión, proveedores, permisos pendientes
//   GET  /v1/sesiones                    lista
//   POST /v1/sesiones {modelo,cwd,titulo,canal}
//   GET  /v1/sesiones/:id                sesión con mensajes
//   DEL  /v1/sesiones/:id
//   POST /v1/sesiones/:id/mensajes {texto}   → SSE con los eventos del turno
//   POST /v1/sesiones/:id/cancelar
//   POST /v1/sesiones/:id/compactar      resume ya lo antiguo (deja solo el último turno) y guarda lo duradero en memoria
//   POST /v1/permisos/:id {decision: allow|always|deny}
//   POST /v1/externo/permiso {resumen,peligro,origen}  → espera tu decisión (agentes MCP)
//   POST /v1/externo/aviso {texto,urgente,origen}
//   POST /v1/remoto/:accion              canales remotos (bot de Discord en la Pi): decidir | texto | tarjeta | resumen | ingest
//   POST /v1/importar {robot-migracion/1} · GET /v1/importar   migración (memoria, SOUL, USER, automatizaciones, agentes, skills)
//   GET  /v1/control · POST /v1/control/soltar   quién controla el ratón/teclado · pánico (suelta y cancela el turno)
//   GET  /v1/agentes                     Mission Control: qué sesiones y subagentes trabajan ahora (+ lo de las últimas 6 h)
//   GET  /v1/eventos                     SSE global (permisos, tareas, eventos de todas las sesiones)
//   GET  /v1/memoria?q= · POST /v1/memoria {texto,tipo} · DEL /v1/memoria/:id
//   GET  /v1/tareas · POST /v1/tareas {nombre,cuando,accion,canal} · DEL /v1/tareas/:id · POST /v1/tareas/:id/ejecutar
//   GET  /v1/skills · GET /v1/skills/:slug (con contenido) · POST /v1/skills/instalar {fuente} → {skill} | {opciones}
//   PATCH /v1/skills/:slug {activa, forzar} · POST /v1/skills/:slug/escanear · POST /v1/skills/:slug/actualizar {aplicar} → {diff, aplicado}
//   DEL  /v1/skills/:slug (no las externas)
//   taller: POST /v1/skills/crear {nombre,descripcion,instrucciones,scripts?,disparadores?,pruebas?} → {skill}
//   POST /v1/skills/:slug/mejorar {aplicar?, propuesta?} → {diff, propuesta, cambios, aplicado} · GET /v1/skills/:slug/aprendizaje
//   POST /v1/skills/:slug/evaluar {modelos[]} → {resultados:[{modelo,aciertos,total,detalles}]} · POST /v1/skills/:slug/exportar {destino?} → {ruta}
//   GET  /v1/skills/:slug/versiones · POST /v1/skills/:slug/versiones/restaurar {version} (también /restaurar)
//   GET  /v1/plugins · GET /v1/plugins/:nombre (con logs) · POST /v1/plugins/instalar {fuente, reemplazar?, dev?} → {plugin} | {opciones}
//   PATCH /v1/plugins/:nombre {activo, forzar?} · POST /v1/plugins/:nombre/recargar|escanear · DEL /v1/plugins/:nombre
//   POST /v1/plugins/comandos/:cmd {texto} → {texto}   (comandos /x que aportan los plugins)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { crearNucleo, version } = require('./index');
const admin = require('./admin');

// panel web (core/ui): archivos estáticos sin token; la API sí lo pide
const UI = path.join(__dirname, 'ui');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };
function estatico(res, nombre) {
  const f = path.join(UI, nombre);
  if (!f.startsWith(UI + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache',
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:", 'x-frame-options': 'DENY' });
  fs.createReadStream(f).pipe(res);
}

function iniciar(opciones = {}) {
  const n = opciones.nucleo || crearNucleo(opciones);
  const fTok = path.join(n.cfg.dir, 'token');
  let token; try { token = fs.readFileSync(fTok, 'utf8').trim(); } catch { }
  if (!token) { token = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(fTok, token, { mode: 0o600 }); }

  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  const sse = res => { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); return e => res.write(`data: ${JSON.stringify(e)}\n\n`); };
  const leer = (req, max = 1e6) => new Promise((ok, mal) => {
    let b = ''; req.setEncoding('utf8'); req.on('data', d => { b += d; if (b.length > max) { mal(new Error('demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { mal(new Error('JSON inválido')); } });
  });
  const iguales = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const permitidos = new Set((n.cfg.red?.permitidos || []).map(String));
  const local = ip => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const ipDe = req => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  // eventos para clientes remotos: si no hay ninguno conectado se guardan (máx. 100, 15 min) y se entregan al conectar
  n.remotos = 0; n.motores = {}; const cola = [];
  n.bus.on('remoto', e => { if (!n.remotos) { cola.push({ t: Date.now(), e }); if (cola.length > 100) cola.shift(); } });

  const srv = http.createServer(async (req, res) => {
    try {
      if (!local(req.socket.remoteAddress) && !permitidos.has(ipDe(req))) { res.writeHead(403); return res.end(); }
      const u = new URL(req.url, 'http://x'); const p = u.pathname.split('/').filter(Boolean); const M = req.method;
      if (M === 'GET' && p[0] !== 'v1') return estatico(res, p.length ? p.join('/') : 'index.html');
      if (!iguales(String(req.headers['x-robot-token'] || ''), token)) return json(res, 401, { error: 'token' });
      if (p[0] !== 'v1') return json(res, 404, { error: 'ruta' });

      if (M === 'GET' && p[1] === 'estado') return json(res, 200, { version, nombre: n.personalidad.nombre(), proveedores: n.proveedores.disponibles(), modeloPorDefecto: n.cfg.modeloPorDefecto, permisos: n.permisos.pendientes() });
      if (p[1] === 'config') {
        if (M === 'GET') return json(res, 200, admin.configPublica(n.cfg));
        if (M === 'PATCH') { const c = admin.guardarConfig(n.cfg, await leer(req)); n.proveedores.reset(); return json(res, 200, c); }
      }
      if (n.extensiones[p[1]]?.http) {                         // extensiones de la app: conectores (correo, GitHub…), telegram
        try { return json(res, 200, await n.extensiones[p[1]].http(M, p, ['POST', 'PUT', 'PATCH'].includes(M) ? await leer(req) : {})); }
        catch (e) { return json(res, e.status || 400, { error: e.message }); }
      }
      if (p[1] === 'chatgpt') {                                // ChatGPT vía Codex CLI (plan de ChatGPT, sin API key)
        const cx = require('./proveedores/codex-cli');
        if (M === 'GET') {
          const e = await cx.estadoAsync();
          if (e.sesion) await n.proveedores.comprobar().catch(() => { });
          return json(res, 200, e);
        }
        if (M === 'POST' && p[2] === 'conectar') { try { return json(res, 200, { ok: true, ...(await cx.conectar()) }); } catch (e) { return json(res, 200, { ok: false, error: e.message }); } }
        if (M === 'POST' && p[2] === 'usar') {                  // ponerlo como modelo por defecto
          const c = admin.guardarConfig(n.cfg, { modeloPorDefecto: 'chatgpt/default' }); n.proveedores.reset(); return json(res, 200, c);
        }
      }
      if (p[1] === 'proveedores' && p[2] && p[3] === 'modelos' && M === 'GET') {
        try { const { api } = n.proveedores.resolver(`${p[2]}/x`, { sinRespaldo: true }); return json(res, 200, { ok: true, modelos: await api.modelos() }); }
        catch (e) { return json(res, 200, { ok: false, error: e.message }); }
      }
      if (p[1] === 'externo' && M === 'POST') {
        const b = await leer(req);
        if (p[2] === 'permiso') {
          if (!b.resumen) return json(res, 400, { error: 'resumen' });
          const r = await n.permisos.pedirExterno(b);
          return json(res, 200, { permitido: r.ok, motivo: r.motivo || '' });
        }
        if (p[2] === 'aviso') {
          if (!b.texto) return json(res, 400, { error: 'texto' });
          n.registro.add(b.urgente ? 'aviso' : 'info', `aviso de ${b.origen || 'externo'}`, String(b.texto).slice(0, 300));
          n.bus.emit('aviso-externo', { texto: String(b.texto).slice(0, 3000), urgente: !!b.urgente, origen: String(b.origen || 'externo').slice(0, 40) });
          return json(res, 200, { entregado: n.bus.listenerCount('aviso-externo') > 0 });
        }
      }
      if (p[1] === 'remoto' && p[2] && M === 'POST') {
        const f = n.remoto?.[p[2]];
        if (typeof f !== 'function') return json(res, 404, { error: 'acción remota no disponible' });
        try { return json(res, 200, { r: await f(await leer(req)) ?? null }); } catch (e) { return json(res, 500, { error: e.message }); }
      }
      if (p[1] === 'cerebro') {                                 // ajustes del cerebro de la app de escritorio (si está)
        if (!n.cerebro) return json(res, 404, { error: 'sin cerebro (la app de escritorio no está)' });
        if (M === 'GET') return json(res, 200, n.cerebro.leer());
        if (M === 'PATCH') return json(res, 200, n.cerebro.guardar(await leer(req)));
      }
      if (p[1] === 'sistema' && M === 'GET') return json(res, 200, require('./extras').sistema(n.cfg));
      if (p[1] === 'canales' && M === 'GET') return json(res, 200, n.canales.lista());
      if (p[1] === 'registros' && M === 'GET') return json(res, 200, n.registro.lista(+u.searchParams.get('desde') || 0));
      if (p[1] === 'aprobaciones' && M === 'GET') return json(res, 200, n.historialPermisos.lista());
      if (p[1] === 'herramientas' && M === 'GET') {
        const off = new Set(n.cfg.herramientasOff || []);
        return json(res, 200, require('./herramientas').HERRAMIENTAS.map(h => ({ nombre: h.nombre, descripcion: h.descripcion, riesgo: typeof h.riesgo === 'function' ? 'variable' : h.riesgo, activa: !off.has(h.nombre) })));
      }
      if (p[1] === 'navegador') {                                   // extensión del navegador (long-poll)
        if (!p[2] && M === 'GET') return json(res, 200, n.navegador.estado());
        if (p[2] === 'esperar' && M === 'GET') return n.navegador.esperar(req, res, { instancia: String(req.headers['x-instancia'] || '').slice(0, 40), navegador: String(req.headers['x-navegador'] || '').slice(0, 60), version: String(req.headers['x-version'] || '').slice(0, 20) });
        if (p[2] === 'resultado' && p[3] && M === 'POST') { let b; try { b = await leer(req, 12e6); } catch (e) { return json(res, 400, { error: e.message }); } return json(res, 200, { ok: n.navegador.resultado(p[3], b) }); }
        if (p[2] === 'detener' && M === 'POST') return json(res, 200, { ok: n.navegador.detener() });
        if (p[2] === 'nombre' && M === 'GET') return json(res, 200, { nombre: n.personalidad.nombre() });
      }
      if (p[1] === 'identidad') {                                   // nombre del compañero
        if (M === 'GET') return json(res, 200, { nombre: n.personalidad.nombre() });
        if (M === 'PATCH') { try { return json(res, 200, { nombre: n.personalidad.ponerNombre((await leer(req)).nombre) }); } catch (e) { return json(res, 400, { error: e.message }); } }
      }
      if (p[1] === 'personalidad') {
        if (!p[2] && M === 'GET') return json(res, 200, n.personalidad.lista());
        if (p[2] && M === 'PUT') { try { n.personalidad.guardar(p[2], (await leer(req)).contenido ?? ''); return json(res, 200, {}); } catch (e) { return json(res, 400, { error: e.message }); } }
        if (p[2] && p[3] === 'restablecer' && M === 'POST') { n.personalidad.restablecer(p[2]); return json(res, 200, {}); }
      }
      if (p[1] === 'uso' && M === 'GET') return json(res, 200, admin.uso(n.sesiones, +u.searchParams.get('dias') || 30));
      if (p[1] === 'reglas') {
        if (M === 'GET') return json(res, 200, n.permisos.reglas());
        if (M === 'DELETE' && p[2] !== undefined) return json(res, n.permisos.borrarRegla(+p[2]) ? 200 : 404, {});
      }
      if (p[1] === 'importar') {                                   // migración desde OpenClaw u otro asistente (robot-migracion/1)
        if (M === 'GET') return json(res, 200, n.importador.historial());
        if (M === 'POST') { try { return json(res, 200, await n.importador.importar(await leer(req, 9 * 1024 * 1024))); } catch (e) { return json(res, 400, { error: e.message }); } }
      }
      if (p[1] === 'control') {
        if (!p[2] && M === 'GET') return json(res, 200, n.control.estado());
        if (p[2] === 'soltar' && M === 'POST') {                  // botón de pánico desde el panel, la isla o el Stream Deck
          const est = n.control.estado(); n.control.soltarTodo('el usuario lo detuvo');
          for (const c of est) n.agente.cancelar(c.sesion);
          return json(res, 200, { ok: true, soltados: est.length });
        }
      }
      if (p[1] === 'agentes' && M === 'GET') return json(res, 200, n.subagentes.lista());
      if (p[1] === 'eventos' && M === 'GET') {
        const enviar = sse(res);
        const g = l => enviar({ tipo: 'registro', ...l }); n.bus.on('registro', g);
        const cliente = String(req.headers['x-cliente'] || '');
        const esRemoto = cliente === 'pi';                       // solo el bot de la Pi recibe los envíos a Discord
        const esMotor = cliente && !esRemoto;                    // puentes de motores externos (Antigravity…)
        const mot = e => enviar({ tipo: 'motor', ...e });
        if (esMotor) {
          n.motores[cliente] = (n.motores[cliente] || 0) + 1; n.bus.on('motor', mot);
          n.canales.registrar(cliente, { nombre: cliente[0].toUpperCase() + cliente.slice(1), tipo: 'motor', estado: 'activo', detalle: 'Puente conectado: escribe "' + cliente + ': …" en la isla, Discord o voz' });
        }
        const rem = e => enviar({ tipo: 'remoto', ...e });
        if (esRemoto) {
          n.remotos++; n.bus.emit('remoto-conexion', { conectados: n.remotos, cliente: String(req.headers['x-cliente']) });
          for (const x of cola.splice(0)) if (Date.now() - x.t < 15 * 60_000) rem(x.e);
          n.bus.on('remoto', rem);
        }
        const a = e => enviar({ tipo: 'permiso', ...e }), b = e => enviar({ tipo: 'permiso-resuelto', ...e }), c = e => enviar(e), d = e => enviar({ ...e, tipo: 'tarea', subtipo: e.tipo }), ag = e => enviar({ tipo: 'agente', agente: e }), ctl = e => enviar({ ...e, tipo: 'control' });
        n.bus.on('permiso', a); n.bus.on('permiso-resuelto', b); n.bus.on('evento', c); n.bus.on('tarea', d); n.bus.on('agente', ag); n.bus.on('control', ctl);
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => { clearInterval(ping); n.bus.off('permiso', a); n.bus.off('permiso-resuelto', b); n.bus.off('evento', c); n.bus.off('tarea', d); n.bus.off('agente', ag); n.bus.off('control', ctl); n.bus.off('registro', g);
          if (esRemoto) { n.bus.off('remoto', rem); n.remotos--; n.bus.emit('remoto-conexion', { conectados: n.remotos }); }
          if (esMotor) {
            n.bus.off('motor', mot); n.motores[cliente]--;
            if (!n.motores[cliente]) n.canales.registrar(cliente, { estado: 'inactivo', detalle: 'Puente desconectado: pídele al agente que lo arranque de nuevo' });
          }
        });
        return;
      }
      if (p[1] === 'permisos' && p[2] && M === 'POST') {
        const { decision } = await leer(req);
        if (!['allow', 'always', 'deny'].includes(decision)) return json(res, 400, { error: 'decision' });
        return json(res, n.permisos.resolver(p[2], decision) ? 200 : 404, {});
      }
      if (p[1] === 'skills') {                                    // motor de skills (core/skills)
        const sk = n.skills, err = (e, c = 400) => json(res, e.status || c, { error: e.message });
        if (!p[2] && M === 'GET') return json(res, 200, { skills: sk.lista() });
        if (p[2] === 'instalar' && !p[3] && M === 'POST') {
          const { fuente } = await leer(req);
          if (!fuente) return json(res, 400, { error: 'fuente' });
          try { return json(res, 200, await sk.instalar(String(fuente))); } catch (e) { return err(e); }
        }
        if (p[2] === 'crear' && !p[3] && M === 'POST') { try { return json(res, 201, { skill: sk.publica(await sk.taller.crear(await leer(req))) }); } catch (e) { return err(e); } }
        const s = p[2] && sk.obtener(decodeURIComponent(p[2]));
        if (!s) return json(res, 404, { error: 'skill' });
        if (!p[3] && M === 'GET') return json(res, 200, s);
        if (!p[3] && M === 'PATCH') {
          const b = await leer(req);
          if (typeof b.activa !== 'boolean') return json(res, 400, { error: 'activa' });
          try { return json(res, 200, (x => ({ ...x, skill: x }))(await sk.activar(s.slug, b.activa, { forzar: !!b.forzar }))); } catch (e) { return err(e); }
        }
        if (!p[3] && M === 'DELETE') { try { return json(res, 200, { ok: sk.borrar(s.slug) }); } catch (e) { return err(e, 403); } }
        if (p[3] === 'escanear' && M === 'POST') { try { return json(res, 200, (x => ({ ...x, escaneo: x }))(await sk.escanear(s.slug))); } catch (e) { return err(e, 500); } }
        if (p[3] === 'actualizar' && M === 'POST') { try { return json(res, 200, await sk.actualizar(s.slug, { aplicar: !!(await leer(req)).aplicar })); } catch (e) { return err(e); } }
        // taller (core/skills/taller.js)
        const tl = sk.taller;
        if (p[3] === 'mejorar' && M === 'POST') { try { const b = await leer(req); return json(res, 200, await tl.mejorar(s.slug, { aplicar: !!b.aplicar, propuesta: b.propuesta })); } catch (e) { return err(e, 500); } }
        if (p[3] === 'aprendizaje' && M === 'GET') return json(res, 200, { fallos: tl.aprendizaje(s.slug) });
        if (p[3] === 'evaluar' && M === 'POST') { try { return json(res, 200, await tl.evaluar(s.slug, (await leer(req)).modelos)); } catch (e) { return err(e); } }
        if (p[3] === 'exportar' && M === 'POST') { try { return json(res, 200, await tl.exportar(s.slug, { destino: (await leer(req)).destino })); } catch (e) { return err(e, 500); } }
        if (p[3] === 'versiones' && !p[4] && M === 'GET') return json(res, 200, { versiones: tl.versiones(s.slug) });
        if ((p[3] === 'restaurar' || (p[3] === 'versiones' && p[4] === 'restaurar')) && M === 'POST') { try { return json(res, 200, await tl.restaurar(s.slug, (await leer(req)).version)); } catch (e) { return err(e); } }
      }
      if (p[1] === 'plugins') {                                   // plugins (core/plugins): cada uno en su proceso
        const pl = n.plugins, err = (e, c = 400) => json(res, e.status || c, { error: e.message });
        if (!p[2] && M === 'GET') return json(res, 200, { plugins: pl.lista(), comandos: pl.comandos(), sdk: pl.version });
        if (p[2] === 'instalar' && !p[3] && M === 'POST') {
          const b = await leer(req);
          if (!b.fuente) return json(res, 400, { error: 'fuente' });
          try { return json(res, 200, await pl.instalar(String(b.fuente), { reemplazar: !!b.reemplazar, dev: !!b.dev })); } catch (e) { return err(e); }
        }
        if (p[2] === 'comandos' && p[3] && M === 'POST') {
          try { const t = await pl.comando(decodeURIComponent(p[3]), String((await leer(req)).texto || '')); return t === null ? json(res, 404, { error: 'comando' }) : json(res, 200, { texto: t }); } catch (e) { return err(e, 500); }
        }
        const nom = p[2] && decodeURIComponent(p[2]);
        if (!nom || !pl.obtener(nom)) return json(res, 404, { error: 'plugin' });
        if (!p[3] && M === 'GET') return json(res, 200, pl.obtener(nom));
        if (!p[3] && M === 'PATCH') {
          const b = await leer(req);
          if (typeof b.activo !== 'boolean') return json(res, 400, { error: 'activo' });
          try { return json(res, 200, { plugin: await pl.activar(nom, b.activo, { forzar: !!b.forzar }) }); } catch (e) { return err(e); }
        }
        if (!p[3] && M === 'DELETE') { try { return json(res, 200, { ok: await pl.borrar(nom) }); } catch (e) { return err(e); } }
        if (p[3] === 'recargar' && M === 'POST') { try { return json(res, 200, { plugin: await pl.recargar(nom) }); } catch (e) { return err(e, 500); } }
        if (p[3] === 'escanear' && M === 'POST') { try { return json(res, 200, { escaneo: await pl.escanear(nom) }); } catch (e) { return err(e, 500); } }
      }
      if (p[1] === 'memoria') {
        if (!p[2] && M === 'GET') { const q = u.searchParams.get('q'); return json(res, 200, q ? await n.memoria.buscarH(q, { limite: 50 }) : n.memoria.lista()); }
        if (!p[2] && M === 'POST') { try { return json(res, 201, n.memoria.recordar({ ...(await leer(req)), origen: 'api' })); } catch (e) { return json(res, 400, { error: e.message }); } }
        if (p[2] && M === 'DELETE') return json(res, n.memoria.olvidar(p[2]) ? 200 : 404, {});
      }
      if (p[1] === 'tareas') {
        if (!p[2] && M === 'GET') return json(res, 200, n.tareas.lista());
        if (!p[2] && M === 'POST') { try { return json(res, 201, n.tareas.crear(await leer(req))); } catch (e) { return json(res, 400, { error: e.message }); } }
        const t = n.tareas.obtener(p[2]); if (!t) return json(res, 404, { error: 'tarea' });
        if (!p[3] && M === 'DELETE') return json(res, 200, { ok: n.tareas.borrar(t.id) });
        if (p[3] === 'ejecutar' && M === 'POST') { n.tareas.ejecutar(t); return json(res, 202, {}); }
        if (!p[3] && M === 'PATCH') { const { activa } = await leer(req); return json(res, 200, n.tareas.pausar(t.id, !!activa)); }
      }
      if (p[1] === 'sesiones') {
        if (!p[2] && M === 'GET') return json(res, 200, n.sesiones.lista());
        if (!p[2] && M === 'POST') { const s = n.sesiones.crear(await leer(req)); const { mensajes, ...m } = s; return json(res, 201, m); }
        const s = n.sesiones.obtener(p[2]); if (!s) return json(res, 404, { error: 'sesión' });
        if (!p[3] && M === 'GET') return json(res, 200, s);
        if (!p[3] && M === 'DELETE') { n.agente.cancelar(s.id); return json(res, 200, { ok: n.sesiones.borrar(s.id) }); }
        if (!p[3] && M === 'PATCH') {
          const c = await leer(req);
          if (typeof c.modelo === 'string' && c.modelo.includes('/')) s.modelo = c.modelo.trim();
          if (typeof c.titulo === 'string' && c.titulo.trim()) s.titulo = c.titulo.trim().slice(0, 80);
          if (typeof c.cwd === 'string' && c.cwd.trim()) s.cwd = path.resolve(c.cwd.trim());
          n.sesiones.guardarMeta(s); const { mensajes, ...m } = s; return json(res, 200, m);
        }
        if (p[3] === 'cancelar' && M === 'POST') return json(res, 200, { ok: n.agente.cancelar(s.id) });
        if (p[3] === 'compactar' && M === 'POST') {
          if (n.agente.ocupada(s.id)) return json(res, 409, { error: 'la sesión ya está trabajando' });
          try {
            const c = await n.compactador.compactar(s, { forzar: true });
            if (!c) return json(res, 200, { ok: false, motivo: 'no hay nada antiguo que resumir' });
            n.sesiones.guardarMeta(s);
            n.bus.emit('evento', { tipo: 'compactacion', sesion: s.id, ...c });
            return json(res, 200, { ok: true, ...c });
          } catch (e) { return json(res, 500, { error: e.message }); }
        }
        if (p[3] === 'mensajes' && M === 'POST') {
          const { texto } = await leer(req);
          if (!texto) return json(res, 400, { error: 'texto' });
          if (n.agente.ocupada(s.id)) return json(res, 409, { error: 'la sesión ya está trabajando' });
          const enviar = sse(res);
          n.enviar(s, String(texto), enviar).catch(() => { }).finally(() => res.end());
          return;
        }
      }
      json(res, 404, { error: 'ruta' });
    } catch (e) { if (!res.headersSent) json(res, 500, { error: e.message }); else res.end(); }
  });
  const puerto = opciones.puerto ?? n.cfg.puerto;
  const host = permitidos.size ? '0.0.0.0' : '127.0.0.1';            // solo se abre a la LAN si hay IPs permitidas
  return new Promise((ok, mal) => { srv.once('error', mal); srv.listen(puerto, host, () => (opciones.sinTareas || n.tareas.iniciar(), 0) || ok({ nucleo: n, servidor: srv, puerto: srv.address().port, token })); });
}

if (require.main === module) {
  iniciar().then(({ puerto, nucleo }) => {
    console.log(`[núcleo] escuchando en http://127.0.0.1:${puerto}  datos: ${nucleo.cfg.dir}`);
    console.log(`[núcleo] modelo por defecto: ${nucleo.cfg.modeloPorDefecto}`);
    console.log(`[núcleo] panel: http://127.0.0.1:${puerto}/#token=<ver ${path.join(nucleo.cfg.dir, 'token')}>`);
  });
}

module.exports = { iniciar };
