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
//   GET  /v1/skills/marketplace[?refrescar=1] → {entradas, fuentes, etiquetas, actualizado} · GET /v1/skills/marketplace/ficha?id= → {entrada, texto}
//   taller: POST /v1/skills/crear {nombre,descripcion,instrucciones,scripts?,disparadores?,pruebas?} → {skill}
//   POST /v1/skills/:slug/mejorar {aplicar?, propuesta?} → {diff, propuesta, cambios, aplicado} · GET /v1/skills/:slug/aprendizaje
//   POST /v1/skills/:slug/evaluar {modelos[]} → {resultados:[{modelo,aciertos,total,detalles}]} · POST /v1/skills/:slug/exportar {destino?} → {ruta}
//   GET  /v1/skills/:slug/versiones · POST /v1/skills/:slug/versiones/restaurar {version} (también /restaurar)
//   GET  /v1/plugins · GET /v1/plugins/:nombre (con logs) · POST /v1/plugins/instalar {fuente, reemplazar?, dev?} → {plugin} | {opciones}
//   PATCH /v1/plugins/:nombre {activo, forzar?} · POST /v1/plugins/:nombre/recargar|escanear · DEL /v1/plugins/:nombre
//   POST /v1/plugins/comandos/:cmd {texto} → {texto}   (comandos /x que aportan los plugins)
//   POST /v1/plugins/oficial/:slack|matrix|signal (instala el canal del repo) · POST /v1/plugins/:nombre/canales/:id/:accion {datos} → acciones del canal
//   GET  /v1/consejo · POST /v1/consejo {pregunta, miembros?, rondas?} → SSE (fase inicio|miembro|respuesta|ronda|votando|veredicto|fin)
//   GET  /v1/consejo/:id · POST /v1/consejo/:id/cancelar
//   /v1/turno (core/turno.js http): GET · POST {texto,cwd,modelo} · POST empezar|parar · PATCH orden {ids} · PATCH config · DEL :id
//   POST :id/reintentar {aprobar} · GET informes/:id · GET informes/:id/archivo/video.mp4|video.html · POST informes/:id/video
//   FASE 4 (memoria v2): GET /v1/sueno · POST /v1/sueno (soñar ya) · GET /v1/sueno/:id · POST /v1/sueno/:id/deshacer · PATCH /v1/sueno/config {hora, activo}
//   GET /v1/grafo · GET /v1/grafo/:entidad · GET /v1/linea?desde&hasta&q&tipos · GET /v1/privacidad · POST /v1/privacidad/exportar (zip) · POST /v1/privacidad/borrar {codigo?, frase?}
//   GET /v1/wrapped?periodo=semana|mes|año&privado · POST /v1/wrapped/video · GET /v1/wrapped/video (mp4) · POST /v1/wrapped/png {carta?} (png o zip)
//   FASE 6 reuniones (core/reuniones.js): GET /v1/reuniones[?q=] · POST {fuente:'navegador'|'audio', titulo} · POST /parar · GET|PATCH /config
//   GET|PATCH|DEL /v1/reuniones/:id · POST :id/resumir|tareas {indices}|enviar · GET :id/exportar · POST /v1/navegador/reunion (extensión)
//   FASE 6 dashboards (core/dashboards.js): GET /v1/dashboards · POST {titulo, widgets, fijado?, confirmo?} · GET|PATCH|DEL /v1/dashboards/:id
//   GET /v1/dashboards/:id/datos[?forzar=1&widget=] → {widgets:{id:{datos, error, t, proximo}}} (caché por widget)
//   ETAPA J Modo Gamer (core/gamer): GET /v1/gamer[?revision=0] (estado + revisión) · POST /v1/gamer/activar {juego?} · POST /v1/gamer/desactivar
//   GET /v1/gamer/revision · GET /v1/gamer/limpieza (tamaños) · POST /v1/gamer/limpieza {ids} · PATCH /v1/gamer/config {cerrar[], modo, acciones{}}
//   GET  /v1/nodos · POST /v1/nodos/emparejar {codigo} · POST /v1/nodos/activar {activo} · PATCH|DEL /v1/nodos/:id
//   POST /v1/nodos/:id/gesto {gesto|estado} · POST /v1/nodos/:id/foto → {ruta}   (ojo de escritorio ESP32: core/nodos)
//   APP MÓVIL (core/movil.js, PWA en /m/): POST /v1/movil/canjear {codigo,pin,nombre} (sin token) → token de dispositivo (header x-dispositivo)
//   escritorio: GET /v1/movil · POST /v1/movil/emparejar → {url, svg QR} · PATCH /v1/movil/config {activo, urlMovil} · PATCH|DEL /v1/movil/dispositivos/:id
//   móvil: GET|PATCH|DEL /v1/movil/yo · GET /v1/movil/permisos · POST /v1/movil/permisos/:id {decision, prueba} · POST /v1/movil/reto · /v1/movil/passkey/*
//          POST|DEL /v1/movil/push · GET /v1/movil/tarjetas · POST /v1/movil/tarjetas/:id {accion}   (+ lo que deja movil.alcance: chat, eventos, agentes…)
//   POST /v1/voz/transcribir (audio binario) → {texto}   (bus 'transcribir-audio' → main.js → Whisper)
//   ESCRITORIO REMOTO (core/escritorio/remoto.js): móvil con d.escritorio → GET /v1/escritorio · POST /v1/escritorio/sesion {prueba?} (aprobación en el PC
//          o PIN/passkey) · GET /v1/escritorio/flujo?monitor&ancho (binario, header x-escritorio) · POST /v1/escritorio/accion · DEL /v1/escritorio/sesion
//          escritorio: GET /v1/escritorio · POST /v1/escritorio/solicitudes/:id {aprobar} · POST /v1/escritorio/cortar
//   STREAM (core/stream): GET /v1/stream · PATCH config · POST secretos|conectar|desconectar|callar|panico|reanudar|clave|silenciar|decir|gesto|alerta|simular|comentar|encuesta
//   overlay OBS sin token: GET /stream/overlay?clave= · /stream/eventos?clave= (SSE) · /stream/audio/:id?clave=
//   FASE 9 (seguridad): GET /v1/panico · POST /v1/panico {origen} · POST /v1/panico/reanudar   (kill switch global, core/panico.js)
//   GET /v1/auditoria?q&tipo&quien&decision&desde&limite · GET /v1/auditoria/verificar · GET /v1/auditoria/exportar (jsonl)
//   Defensa: Host debe ser localhost / IP literal / cfg.red.urlMovil / cfg.red.hosts (anti DNS rebinding); peticiones que cambian algo
//   con un Origin ajeno o sec-fetch-site cross-site → 403 (anti CSRF, también para /v1/movil/canjear que no lleva token).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { crearNucleo, version } = require('./index');
const CANALES_OFICIALES = ['slack', 'matrix', 'signal'];             // plugins de canal del repo (plugins/<n>) que el panel instala
const admin = require('./admin');
const seg = require('./seguridad');

// panel web (core/ui): archivos estáticos sin token; la API sí lo pide
const UI = path.join(__dirname, 'ui');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json; charset=utf-8' };
function estatico(res, nombre) {
  const f = path.join(UI, nombre);
  let es = false; try { es = f.startsWith(UI + path.sep) && fs.statSync(f).isFile(); } catch { }
  if (!es) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache',
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data:", 'x-frame-options': nombre === 'wrapped.html' ? 'SAMEORIGIN' : 'DENY' });
  fs.createReadStream(f).pipe(res);
}

function iniciar(opciones = {}) {
  const n = opciones.nucleo || crearNucleo(opciones);
  // nodos de hardware (ojo ESP32…): WebSocket propio en otro puerto (cfg.nodos.puerto); API /v1/nodos vía extensiones (core/nodos)
  if (!n.nodos) {
    n.nodos = require('./nodos').crearNodos({ nucleo: n }); n.extensiones.nodos = { http: n.nodos.http };
    if (n.nodos.activo()) n.nodos.iniciar(opciones.puertoNodos).catch(e => console.log(`[nodos] no pude abrir el puerto: ${e.message}`));
  }
  // co-host de streaming (core/stream): API /v1/stream con token; overlay de OBS en /stream/* con su clave de solo lectura
  if (!n.stream) {
    n.stream = require('./stream').crearStream({ nucleo: n }); n.extensiones.stream = { http: n.stream.http };
    if (!opciones.sinTareas) n.stream.autoConectar();
  }
  const fTok = path.join(n.cfg.dir, 'token');
  let token; try { token = fs.readFileSync(fTok, 'utf8').trim(); } catch { }
  if (!token) { token = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(fTok, token, { mode: 0o600 }); }
  seg.registrarSecreto(token);                                  // nunca en registros ni en salidas de herramientas

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
  // app móvil: tokens de dispositivo con alcance limitado; cfg.red.moviles abre la LAN privada SOLO a /m/ y a esos tokens
  const MV = require('./movil');
  const movil = n.movil || (n.movil = MV.crearMovil({ nucleo: n }));
  // escritorio remoto desde el móvil (core/escritorio/remoto.js): flujo de pantalla + ratón/teclado con permiso propio por dispositivo
  if (!n.remoto) n.remoto = require('./escritorio/remoto').crearRemoto({ nucleo: n, ...(opciones.remoto || {}) });
  const ipCliente = opciones.ipCliente || ipDe;                 // las pruebas simulan IPs de la LAN
  const leerBinario = (req, max) => new Promise((ok, mal) => {
    const t = []; let l = 0;
    req.on('data', d => { l += d.length; if (l > max) { mal(new Error('demasiado grande')); req.destroy(); } else t.push(d); });
    req.on('end', () => ok(Buffer.concat(t))); req.on('error', mal);
  });

  const manejar = async (req, res) => {
    try {
      const ip = ipCliente(req);
      const total = local(ip) || permitidos.has(ip);
      const lanMovil = !total && movil.activo() && MV.ipPrivada(ip);   // móvil de la LAN: solo /m/ y token de dispositivo
      if (!total && !lanMovil) { res.writeHead(403); return res.end(); }
      const M = req.method;
      // FASE 9: DNS rebinding (una web cuyo dominio pasa a apuntar a 127.0.0.1) y CSRF desde páginas web
      if (!seg.hostPermitido(req.headers.host, [seg.hostDeUrl(n.cfg.red?.urlMovil), ...(n.cfg.red?.hosts || [])])) { res.writeHead(421, { 'content-type': 'text/plain' }); return res.end('host no permitido'); }
      if (M !== 'GET' && M !== 'HEAD' && (!seg.origenPermitido(req.headers.origin, req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site')) return json(res, 403, { error: 'origen no permitido' });
      const u = new URL(req.url, 'http://x'); const p = u.pathname.split('/').filter(Boolean);
      if (M === 'GET' && u.pathname === '/m') { res.writeHead(301, { location: '/m/' + u.search }); return res.end(); }
      if (p[0] === 'stream' && total) return n.stream.publico(req, res, u);   // overlay de OBS: ?clave= (nunca el token)
      if (M === 'GET' && p[0] !== 'v1') {
        const nombre = p.length ? p.join('/') + (u.pathname.endsWith('/') ? '/index.html' : '') : 'index.html';
        if (lanMovil && !MV.estaticoMovil(nombre)) { res.writeHead(403); return res.end(); }
        return estatico(res, nombre);
      }
      if (M === 'POST' && p[0] === 'v1' && p[1] === 'movil' && p[2] === 'canjear' && !p[3]) {   // el móvil aún no tiene token: canjea el código del QR
        try { return json(res, 200, movil.canjear(await leer(req, 4096), { ip })); } catch (e) { return json(res, e.status || 400, { error: e.message }); }
      }
      const tok = String(req.headers['x-robot-token'] || '');
      const maestro = !lanMovil && !!tok && iguales(tok, token);     // el token maestro no vale desde un móvil de la LAN
      const disp = maestro ? null : movil.autenticar(String(req.headers['x-dispositivo'] || ''), { ip });
      if (!maestro && !disp) return json(res, 401, { error: 'token' });
      if (p[0] !== 'v1') return json(res, 404, { error: 'ruta' });
      if (disp && !MV.alcance(M, p)) return json(res, 403, { error: 'fuera del alcance del móvil' });

      if (p[1] === 'movil') {
        try { return json(res, 200, await movil.http(M, p, ['POST', 'PUT', 'PATCH'].includes(M) ? await leer(req) : {}, { maestro, dispositivo: disp, origen: String(req.headers.origin || ''), ip, puerto: srv.address()?.port })); }
        catch (e) { return json(res, e.status || 400, { error: e.message }); }
      }
      if (p[1] === 'escritorio') return n.remoto.http(req, res, M, p, { maestro, disp, leer, json, origen: String(req.headers.origin || ''), q: Object.fromEntries(u.searchParams), sesionHdr: req.headers['x-escritorio'] });
      if (p[1] === 'voz' && p[2] === 'transcribir' && M === 'POST') {   // nota de voz (móvil / panel) → Whisper de la app de escritorio
        if (!n.bus.listenerCount('transcribir-audio')) return json(res, 501, { error: 'la transcripción necesita la app de escritorio (Whisper)' });
        const tipo = String(req.headers['content-type'] || '');
        const ext = /ogg/.test(tipo) ? '.ogg' : /mp4|m4a|aac/.test(tipo) ? '.m4a' : /wav/.test(tipo) ? '.wav' : '.webm';
        let audio; try { audio = await leerBinario(req, 15e6); } catch (e) { return json(res, 413, { error: e.message }); }
        if (audio.length < 100) return json(res, 400, { error: 'audio vacío' });
        const dv = path.join(n.cfg.dir, 'voz-movil'); fs.mkdirSync(dv, { recursive: true });
        const fa = path.join(dv, crypto.randomBytes(8).toString('hex') + ext); fs.writeFileSync(fa, audio);
        try {
          const texto = await new Promise((ok, mal) => {
            const t = setTimeout(() => mal(new Error('tiempo agotado')), 150_000);
            n.bus.emit('transcribir-audio', { ruta: fa, origen: disp ? 'movil' : 'panel', responder: (e, txt) => { clearTimeout(t); if (e) mal(e instanceof Error ? e : new Error(String(e))); else ok(String(txt || '').trim()); } });
          });
          return json(res, 200, { texto });
        } catch (e) { return json(res, 500, { error: e.message }); } finally { fs.rm(fa, () => { }); }
      }

      if (M === 'GET' && p[1] === 'estado') return json(res, 200, { version, nombre: n.personalidad.nombre(), proveedores: n.proveedores.disponibles(), modeloPorDefecto: n.cfg.modeloPorDefecto, permisos: n.permisos.pendientes() });
      if (p[1] === 'config') {
        if (M === 'GET') return json(res, 200, admin.configPublica(n.cfg));
        if (M === 'PATCH') {
          const b = await leer(req), antes = n.cfg.permisos.modo;
          const c = admin.guardarConfig(n.cfg, b); n.proveedores.reset();
          if (n.cfg.permisos.modo !== antes) n.bus.emit('config-seguridad', { resumen: `modo de permisos: ${antes} → ${n.cfg.permisos.modo}` });
          if (b.proveedores) for (const [k, v] of Object.entries(b.proveedores)) if (v && typeof v.apiKey === 'string') n.bus.emit('config-seguridad', { resumen: `clave de ${k} ${v.apiKey ? 'cambiada' : 'quitada'}` });
          return json(res, 200, c);
        }
      }
      if (n.extensiones[p[1]]?.http) {                         // extensiones de la app: conectores (correo, GitHub…), telegram
        try {
          let cuerpo = ['POST', 'PUT', 'PATCH'].includes(M) ? await leer(req) : {};
          if (disp) cuerpo = p[1] === 'panico' ? { origen: `movil:${disp.nombre}` } : { texto: cuerpo.texto };   // móvil: pánico, o el encargo del turno sin carpeta ni modelo
          else if (p[1] === 'panico') cuerpo = { origen: String(cuerpo.origen || req.headers['x-cliente'] || 'panel').slice(0, 40), quien: String(cuerpo.quien || req.headers['x-cliente'] || 'panel').slice(0, 40) };
          const r = await n.extensiones[p[1]].http(M, p, cuerpo, Object.fromEntries(u.searchParams));
          if (r?.__archivo) {                                  // la extensión devuelve un archivo (p. ej. el vídeo del turno de noche, el zip de la exportación)
            res.writeHead(200, { 'content-type': TIPOS[path.extname(r.__archivo)] || { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.zip': 'application/zip' }[path.extname(r.__archivo)] || 'application/octet-stream', 'content-length': fs.statSync(r.__archivo).size,
              ...(r.nombre ? { 'content-disposition': `attachment; filename="${String(r.nombre).replace(/[^\w.-]/g, '_')}"` } : {}) });
            return fs.createReadStream(r.__archivo).pipe(res);
          }
          return json(res, 200, r);
        } catch (e) { return json(res, e.status || 400, { error: e.message }); }
      }
      if (p[1] === 'consejo') {                                 // consejo de modelos (core/consejo.js)
        if (!p[2] && M === 'GET') return json(res, 200, { candidatos: n.consejo.candidatos(), enCurso: n.consejo.enCurso(), historial: n.consejo.historial(30) });
        if (!p[2] && M === 'POST') {                            // → SSE con el progreso; el último evento es fase 'fin'
          const b = await leer(req);
          if (!String(b.pregunta || '').trim()) return json(res, 400, { error: 'pregunta' });
          const enviar = sse(res), ctl = new AbortController();
          res.on('close', () => { if (!res.writableFinished && b.cancelarAlCerrar) ctl.abort(); });
          n.consejo.consultar({ pregunta: b.pregunta, miembros: b.miembros, rondas: b.rondas, moderador: b.moderador, signal: ctl.signal, alEvento: enviar })
            .then(r => enviar({ tipo: 'consejo-resultado', resultado: r }), e => enviar({ tipo: 'consejo-error', error: e.message })).finally(() => res.end());
          return;
        }
        if (p[2] && p[3] === 'cancelar' && M === 'POST') return json(res, 200, { ok: n.consejo.cancelar(p[2]) });
        if (p[2] && !p[3] && M === 'GET') { const r = n.consejo.obtener(p[2]); return r ? json(res, 200, r) : json(res, 404, { error: 'consejo' }); }
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
        if (p[2] === 'reunion' && M === 'POST') { let b; try { b = await leer(req, 2e6); } catch (e) { return json(res, 400, { error: e.message }); } try { return json(res, 200, n.reuniones ? await n.reuniones.desdeExtension(b) : { ok: false }); } catch (e) { return json(res, e.status || 500, { error: e.message }); } }   // subtítulos de reuniones (core/reuniones.js)
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
        if (M === 'DELETE' && p[2] !== undefined) { const r = n.permisos.reglas()[+p[2]]; const ok = n.permisos.borrarRegla(+p[2]); if (ok) n.bus.emit('config-seguridad', { resumen: `regla borrada: ${r?.herramienta} ${r?.prefijo}` }); return json(res, ok ? 200 : 404, {}); }
      }
      if (p[1] === 'importar') {                                   // migración desde OpenClaw u otro asistente (robot-migracion/1)
        if (M === 'GET') return json(res, 200, n.importador.historial());
        if (M === 'POST') { try { return json(res, 200, await n.importador.importar(await leer(req, 9 * 1024 * 1024))); } catch (e) { return json(res, 400, { error: e.message }); } }
      }
      if (p[1] === 'control') {
        if (!p[2] && M === 'GET') return json(res, 200, n.control.estado());
        if (p[2] === 'soltar' && M === 'POST') {                  // botón de pánico desde el panel, la isla o el Stream Deck
          const est = n.control.estado(); n.control.soltarTodo('el usuario lo detuvo');   // solo el control; el pánico global es POST /v1/panico
          for (const c of est) n.agente.cancelar(c.sesion);
          const remota = n.remoto.cortar('el usuario lo detuvo');           // también la sesión de escritorio remoto
          return json(res, 200, { ok: true, soltados: est.length + (remota ? 1 : 0) });
        }
      }
      if (p[1] === 'agentes' && M === 'GET') return json(res, 200, n.subagentes.lista());
      if (p[1] === 'eventos' && M === 'GET') {
        const enviar = sse(res);
        const g = l => enviar({ tipo: 'registro', ...l }); if (!disp) n.bus.on('registro', g);   // los registros no van al móvil
        const cliente = disp ? '' : String(req.headers['x-cliente'] || '');                  // un móvil no puede hacerse pasar por la Pi
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
        const hk = () => enviar({ tipo: 'permisos-externos' }); n.bus.on('nodo-permiso', hk); n.bus.on('nodo-refrescar', hk);   // permisos de los hooks de Claude Code (main.js)
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => { clearInterval(ping); n.bus.off('permiso', a); n.bus.off('permiso-resuelto', b); n.bus.off('evento', c); n.bus.off('tarea', d); n.bus.off('agente', ag); n.bus.off('control', ctl); n.bus.off('registro', g); n.bus.off('nodo-permiso', hk); n.bus.off('nodo-refrescar', hk);
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
        const quien = disp ? `movil:${disp.nombre}` : String(req.headers['x-cliente'] || 'panel').slice(0, 40);
        return json(res, n.permisos.resolver(p[2], decision, undefined, quien) ? 200 : 404, {});
      }
      if (p[1] === 'skills') {                                    // motor de skills (core/skills)
        const sk = n.skills, err = (e, c = 400) => json(res, e.status || c, { error: e.message });
        if (!p[2] && M === 'GET') return json(res, 200, { skills: sk.lista() });
        // marketplace (core/skills/marketplace.js): catálogo agregado con caché de 6 h y ficha (SKILL.md / README)
        if (p[2] === 'marketplace' && M === 'GET') {
          try {
            if (p[3] === 'ficha') return json(res, 200, await sk.ficha(String(u.searchParams.get('id') || '')));
            const c = await sk.catalogo({ refrescar: u.searchParams.get('refrescar') === '1' });
            const plug = new Set((n.plugins?.lista?.() || []).map(x => x.nombre));
            return json(res, 200, { ...c, entradas: c.entradas.map(e => (e.tipo === 'plugin' && plug.has(e.nombre) ? { ...e, instalada: e.nombre } : e)) });
          } catch (e) { return err(e, 502); }
        }
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
        if (p[2] === 'oficial' && p[3] && M === 'POST') {             // Panel → Canales: instala un canal oficial del repo
          const of = decodeURIComponent(p[3]);
          if (!CANALES_OFICIALES.includes(of)) return json(res, 404, { error: 'plugin' });
          try { return json(res, 200, await pl.instalar(require('./rutas').fuera(path.join(__dirname, '..', 'plugins', of)), { reemplazar: true })); } catch (e) { return err(e); }
        }
        const nom = p[2] && decodeURIComponent(p[2]);
        if (!nom || !pl.obtener(nom)) return json(res, 404, { error: 'plugin' });
        // acciones de configuración de un canal (estado, conectar, enlace, prueba, desconectar): los secretos van del cuerpo
        // al plugin, que los guarda cifrados con apolo.secretos; ninguna respuesta los incluye
        if (p[3] === 'canales' && p[4] && p[5] && M === 'POST') {
          if (!/^[a-z]{3,20}$/.test(p[5])) return json(res, 400, { error: 'accion' });
          try { return json(res, 200, await pl.accionCanal(nom, decodeURIComponent(p[4]), p[5], await leer(req))); } catch (e) { return err(e); }
        }
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
        if (!p[2] && M === 'POST') {
          const b = await leer(req);                                   // desde el móvil: sin carpeta propia, canal 'movil'
          const s = n.sesiones.crear(disp ? { titulo: typeof b.titulo === 'string' ? b.titulo.slice(0, 80) : undefined, modelo: typeof b.modelo === 'string' && b.modelo.includes('/') ? b.modelo : undefined, canal: 'movil', cwd: n.cfg.carpeta || undefined } : b);
          const { mensajes, ...m } = s; return json(res, 201, m);
        }
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
  };
  const srv = http.createServer(manejar);
  const puerto = opciones.puerto ?? n.cfg.puerto;
  const host = opciones.host || (permitidos.size || movil.activo() ? '0.0.0.0' : '127.0.0.1');   // solo se abre a la LAN si hay IPs permitidas o el modo móviles
  // modo móviles activado en caliente con el servidor solo en 127.0.0.1: escucha además en las IPs de la LAN (mismo manejador)
  const extras = [];
  movil.alCambiarActivo = v => {
    if (host === '0.0.0.0') return;
    if (!v) { for (const s of extras.splice(0)) s.close(); return; }
    if (extras.length || !srv.listening) return;
    for (const { ip } of movil.ipsLan()) {
      const s2 = http.createServer(manejar);
      s2.on('error', e => console.log(`[móvil] no pude escuchar en ${ip}: ${e.message}`));
      s2.listen(srv.address().port, ip); extras.push(s2);
    }
  };
  srv.on('close', () => { for (const s of extras.splice(0)) s.close(); });
  return new Promise((ok, mal) => { srv.once('error', mal); srv.listen(puerto, host, () => (opciones.sinTareas || (n.tareas.iniciar(), n.turno?.iniciar(), n.sueno?.programar(), n.sueno?.iniciar()), 0) || ok({ nucleo: n, servidor: srv, puerto: srv.address().port, token })); });
}

if (require.main === module) {
  iniciar().then(({ puerto, nucleo }) => {
    console.log(`[núcleo] escuchando en http://127.0.0.1:${puerto}  datos: ${nucleo.cfg.dir}`);
    console.log(`[núcleo] modelo por defecto: ${nucleo.cfg.modeloPorDefecto}`);
    console.log(`[núcleo] panel: http://127.0.0.1:${puerto}/#token=<ver ${path.join(nucleo.cfg.dir, 'token')}>`);
  });
}

module.exports = { iniciar };
