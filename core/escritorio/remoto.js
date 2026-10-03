// Escritorio remoto desde la app móvil: ver la pantalla en vivo (flujo.ps1) y usar el ratón/teclado (manos.ps1, el MISMO
// ayudante y el MISMO vigilante que el control del agente).
// Seguridad (docs/movil.md → "Escritorio remoto"):
//   · Permiso propio por dispositivo (d.escritorio), APAGADO por defecto y que solo se concede desde el PC (token maestro).
//   · Cada sesión se aprueba: en el PC (cfg.escritorio.remoto.aprobacion = 'pc', por defecto) o con el PIN/passkey del móvil ('pin').
//   · Una sola sesión a la vez; nunca mientras el agente controla el ratón, se graba una demo o hay PÁNICO.
//   · Ventanas protegidas (cfg.escritorio.bloqueadas): negras en el flujo y no se puede tocar/escribir en ellas.
//   · El vigilante de manos.ps1 se arma con la primera acción: si alguien toca el ratón/teclado del PC → se corta la sesión.
//   · Tiempo máximo (maxMin 30) y corte por inactividad (inactividadMin 5); pánico desde cualquier canal la corta.
//   · Borde rojo + "control remoto activo desde <móvil>" en el PC (bus 'escritorio-remoto' → main.js / control-overlay).
//   · Auditoría encadenada: inicio, cada acción (sin el texto escrito: solo su longitud) y fin con el resumen.
// Protocolo del flujo (igual que flujo.ps1, se reenvía tal cual): [u32 L][u16 H][cabecera JSON][JPEG]; control de flujo por créditos.
'use strict';
const crypto = require('crypto');
const so = require('./so');
const { BLOQUEADAS } = require('./index');

const DEF = { aprobacion: 'pc', maxMin: 30, inactividadMin: 5, fps: 8, calidad: 60, ancho: 1280, esperaAprobacionSeg: 90 };
const TECLA = /^((ctrl|alt|shift|win)\+){0,3}(esc|tab|enter|backspace|delete|insert|space|home|end|pageup|pagedown|up|down|left|right|f([1-9]|1[0-2])|[a-z0-9]|win|menu|printscreen)$/;
const MOTIVOS = { raton: 'moviste el ratón', clic: 'hiciste clic', teclado: 'pulsaste una tecla', teclas: 'Ctrl+Alt+Esc' };
const err = (m, status = 400) => Object.assign(new Error(m), { status });
const lim = (v, a, b) => Math.max(a, Math.min(b, v));

function crearRemoto({ nucleo: n, control = n.control, lanzarFlujo = so.lanzarFlujo, ahora = () => Date.now(), limites = {} }) {
  const conf = () => ({ ...DEF, ...(n.cfg.escritorio?.remoto || {}) });
  const maxMs = () => limites.maxMs ?? conf().maxMin * 60_000;
  const inactMs = () => limites.inactMs ?? conf().inactividadMin * 60_000;
  const patrones = () => n.cfg.escritorio?.bloqueadas || BLOQUEADAS;
  let ses = null, monitores = null;
  const solicitudes = new Map();

  const auditar = (decision, resumen, quien, herramienta) => { try { n.auditoria?.registrar({ tipo: 'escritorio-remoto', decision, quien, herramienta, resumen }); } catch { } };
  const avisar = e => { n.bus.emit('escritorio-remoto', e); n.bus.emit('evento', { tipo: 'escritorio-remoto', ...e }); };
  const publico = s => s && { id: s.id, dispositivo: s.nombre, disp: s.disp, inicio: s.inicio, hasta: s.hasta, ultimo: s.ultimo, armado: s.armado, acciones: s.acciones, flujos: s.flujos.size, via: s.via };

  function bloqueoInicio() {
    if (n.panico?.activo?.()) throw err('PÁNICO activo: reanuda desde el escritorio', 423);
    if (control?.estado?.().length) throw err('el agente está usando el ratón y el teclado ahora mismo', 409);
    if (n.demo?.grabando?.()) throw err('se está grabando una demostración en el PC', 409);
  }

  function crear(d, via) {
    bloqueoInicio();
    if (ses && ses.disp !== d.id) throw err(`ya hay una sesión remota desde ${ses.nombre}`, 409);
    if (ses) cortar('sustituida por otra sesión del mismo móvil');
    const t = ahora();
    const s = ses = { id: crypto.randomBytes(16).toString('base64url'), disp: d.id, nombre: d.nombre, inicio: t, hasta: t + maxMs(), ultimo: t, armado: false, retenido: false,
      acciones: {}, flujos: new Set(), marco: null, tapadas: [], fgProt: false, via };
    const paso = Math.max(20, Math.min(1000, inactMs() / 4, maxMs() / 4));
    s.reloj = setInterval(() => {
      if (ses !== s) return clearInterval(s.reloj);
      if (ahora() >= s.hasta) cortar('se acabó el tiempo máximo');
      else if (ahora() - s.ultimo >= inactMs()) cortar('inactividad');
    }, paso);
    s.reloj.unref?.();
    auditar('inicio', `${d.nombre} · aprobado por ${via} · máx ${Math.round(maxMs() / 60_000)} min`, `movil:${d.nombre}`);
    n.registro?.add('aviso', 'escritorio remoto', `sesión iniciada desde ${d.nombre} (${via})`);
    avisar({ activo: true, dispositivo: d.nombre, hasta: s.hasta });
    return { sesion: s.id, hasta: s.hasta, inactividad: inactMs(), monitores };
  }

  function cortar(razon = 'terminada') {
    const s = ses; if (!s) return false;
    ses = null; clearInterval(s.reloj);
    for (const f of [...s.flujos]) f.cerrar(razon);
    if (s.armado) control?.orden?.({ op: 'desarmar' }).catch(() => { });
    if (s.retenido) control?.retener?.(false);
    const acc = Object.entries(s.acciones).map(([k, v]) => `${k} ${v}`).join(', ') || 'solo miró';
    auditar('fin', `${s.nombre} · ${Math.round((ahora() - s.inicio) / 1000)} s · ${acc} · ${razon}`, `movil:${s.nombre}`);
    n.registro?.add('info', 'escritorio remoto', `sesión de ${s.nombre} terminada: ${razon}`);
    avisar({ activo: false, dispositivo: s.nombre, razon });
    return true;
  }

  // aprobación en el PC: la petición del móvil espera (long-poll) hasta que alguien decide en el escritorio
  function solicitar(d) {
    bloqueoInicio();
    for (const q of [...solicitudes.values()]) if (q.disp === d.id) q.decidir(false, 'sustituida');
    const id = crypto.randomBytes(5).toString('hex');
    return new Promise((ok, mal) => {
      const t = setTimeout(() => q.decidir(false, 'nadie respondió a tiempo'), limites.esperaMs ?? conf().esperaAprobacionSeg * 1000);
      t.unref?.();
      const q = { id, disp: d.id, dispositivo: d.nombre, creada: ahora(), decidir: (si, quien) => {
        if (!solicitudes.has(id)) return false;
        clearTimeout(t); solicitudes.delete(id);
        n.bus.emit('evento', { tipo: 'escritorio-solicitud', id, resuelta: true });
        if (!si) { auditar('rechazada', `${d.nombre}: ${quien}`, quien); mal(err(quien === 'nadie respondió a tiempo' ? 'nadie lo aprobó en el PC a tiempo' : 'rechazado en el PC', 403)); return true; }
        try { ok(crear(d, quien)); } catch (e) { mal(e); }
        return true;
      } };
      solicitudes.set(id, q);
      n.registro?.add('aviso', 'escritorio remoto', `${d.nombre} pide ver y controlar el PC`);
      n.bus.emit('escritorio-solicitud', { id, dispositivo: d.nombre });
      n.bus.emit('evento', { tipo: 'escritorio-solicitud', id, dispositivo: d.nombre });
    });
  }
  const resolver = (id, si, quien = 'PC') => solicitudes.get(id)?.decidir(!!si, si ? quien : `rechazada en el ${quien}`) || false;

  // ---------- flujo de imagen ----------
  function abrirFlujo(req, res, s, q) {
    if (typeof lanzarFlujo !== 'function') throw err('el escritorio remoto solo está disponible en Windows por ahora', 501);
    const c = conf();
    const pedido = lim(Number(q.ancho) || c.ancho, 480, 2560), monitor = lim(Number(q.monitor) || 0, 0, 16);   // 0 = el monitor principal
    let ancho = pedido, calidad = c.calidad, buf = Buffer.alloc(0), cerrado = false;
    const p = lanzarFlujo();
    const orden = o => { if (!cerrado) try { p.stdin.write(JSON.stringify(o) + '\n'); } catch { } };
    const config = () => orden({ op: 'config', monitor, ancho, calidad, fps: c.fps, bloqueadas: patrones() });
    // adaptación: latencia media de entrega al socket en ventanas de 3 s → baja/sube ancho y calidad
    let v = { t: ahora(), lat: 0, n: 0, bytes: 0 };
    const adaptar = () => {
      const dt = ahora() - v.t; if (dt < 3000) return;
      const media = v.n ? v.lat / v.n : 0;
      if (media > 350 && ancho > 640) { ancho = Math.max(640, Math.round(ancho * 0.75)); calidad = Math.max(35, calidad - 10); config(); }
      else if (v.n && media < 120 && (ancho < pedido || calidad < c.calidad)) { ancho = Math.min(pedido, Math.round(ancho * 1.25)); calidad = Math.min(c.calidad, calidad + 5); config(); }
      h.stats = { fps: +(v.n * 1000 / dt).toFixed(1), kBps: +(v.bytes / 1.024 / dt).toFixed(1), latencia: Math.round(media), ancho, calidad };
      v = { t: ahora(), lat: 0, n: 0, bytes: 0 };
    };
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.socket?.setNoDelay?.(true);
    p.stdout.on('data', d => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= 6) {
        const L = buf.readUInt32BE(0); if (buf.length < 4 + L) break;
        const trozo = buf.subarray(0, 4 + L); buf = buf.subarray(4 + L);
        let cab = {}; try { cab = JSON.parse(trozo.subarray(6, 6 + trozo.readUInt16BE(4)).toString('utf8')); } catch { }
        if (cab.evento === 'listo') monitores = cab.monitores;
        else if (cab.W) {
          s.marco = { mon: cab.mon, origen: cab.origen, mw: cab.mw, mh: cab.mh };
          s.tapadas = cab.tapadas || []; s.fgProt = !!cab.fgProt;
        }
        if (cerrado) return;
        const t0 = ahora();
        res.write(trozo, () => { if (cab.W) { v.lat += ahora() - t0; v.n++; v.bytes += trozo.length; orden({ op: 'credito' }); adaptar(); } });
      }
    });
    p.stderr?.on?.('data', d => n.registro?.add('error', 'escritorio remoto', String(d).trim().split('\n')[0].slice(0, 200)));
    const h = { stats: null, monitor, cerrar: razon => {
      if (cerrado) return; cerrado = true; s.flujos.delete(h);
      try { p.stdin.write('{"op":"parar"}\n'); p.stdin.end?.(); } catch { }
      const k = setTimeout(() => { try { p.kill(); } catch { } }, 400); k.unref?.();
      try { res.end(); } catch { }
      void razon;
    } };
    s.flujos.add(h);
    req.on('close', () => h.cerrar('el móvil cerró'));
    p.on('exit', () => h.cerrar('el capturador se cerró'));
    config(); orden({ op: 'credito' }); orden({ op: 'credito' });
    return h;
  }

  // ---------- acciones del móvil → manos.ps1 ----------
  async function accion(s, b = {}) {
    const op = String(b.op || '');
    s.ultimo = ahora();
    if (op === 'latido') return { ok: true, hasta: s.hasta };
    const m = s.marco;
    if (!m) throw err('aún no hay imagen del escritorio', 409);
    const punto = (x, y) => {
      x = Number(x); y = Number(y);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw err('x, y deben ir de 0 a 1');
      const px = Math.round(m.origen.x + x * (m.mw - 1)), py = Math.round(m.origen.y + y * (m.mh - 1));
      if (s.tapadas.some(r => px >= r.x && px < r.x + r.ancho && py >= r.y && py < r.y + r.alto)) throw err('ventana PROTEGIDA: no se puede tocar desde el móvil', 403);
      return { x: px, y: py };
    };
    const teclado = () => { if (s.fgProt) throw err('la ventana activa está PROTEGIDA: no se escribe en ella desde el móvil', 403); };
    let o, resumen;
    if (op === 'clic') { const p = punto(b.x, b.y); o = { op: 'clic', ...p, boton: b.boton === 'der' ? 'der' : 'izq', doble: !!b.doble }; resumen = `${b.doble ? 'doble ' : ''}clic ${o.boton} (${p.x},${p.y})`; }
    else if (op === 'mover') { const p = punto(b.x, b.y); o = { op: 'mover', ...p }; resumen = `mover (${p.x},${p.y})`; }
    else if (op === 'arrastrar') { const p = punto(b.x, b.y), p2 = punto(b.x2, b.y2); o = { op: 'arrastrar', ...p, x2: p2.x, y2: p2.y }; resumen = `arrastrar (${p.x},${p.y})→(${p2.x},${p2.y})`; }
    else if (op === 'scroll') {
      const p = punto(b.x, b.y); const cantidad = lim(Math.round(Number(b.cantidad) || 0), -15, 15);
      if (!cantidad) return { ok: true };
      o = { op: 'scroll', ...p, cantidad }; resumen = `scroll ${cantidad}`;
    }
    else if (op === 'escribir') { teclado(); const texto = String(b.texto ?? '').slice(0, 500); if (!texto) return { ok: true }; o = { op: 'escribir', texto }; resumen = `${texto.length} caracteres`; }
    else if (op === 'tecla') {
      teclado();
      const combo = String(b.combo || '').toLowerCase().replace(/\s+/g, '');
      if (!TECLA.test(combo)) throw err('tecla no válida');
      o = { op: 'tecla', combo }; resumen = combo;
    }
    else throw err('acción desconocida');
    if (!s.armado) {                                    // primera acción: se arma el vigilante (tocar el PC = se corta)
      if (!s.retenido) { control.retener?.(true); s.retenido = true; }
      await control.orden({ op: 'armar' });
      if (ses !== s) { control.orden({ op: 'desarmar' }).catch(() => { }); throw err('la sesión remota se cortó', 410); }
      s.armado = true;
    }
    await control.orden({ ...o, armadoRequerido: true }, op === 'escribir' ? 60_000 : 10_000);
    if (ses !== s) throw err('la sesión remota se cortó', 410);
    s.acciones[op] = (s.acciones[op] || 0) + 1;
    auditar('accion', resumen, `movil:${s.nombre}`, op);
    return { ok: true };
  }

  // ---------- frenos ----------
  n.bus.on('panico', e => { for (const q of [...solicitudes.values()]) q.decidir(false, 'pánico'); cortar(`pánico (${e?.origen || '¿?'})`); });
  control?.alEventoManos?.(j => {
    if (!ses) return;
    if (j.evento === 'panico') cortar(`recuperaste el control en el PC (${MOTIVOS[j.motivo] || j.motivo})`);
    else if (j.evento === 'demo-fin' && /se cerró/.test(j.motivo || '') && ses.armado) cortar('el ayudante de manos se cerró');
  });
  n.bus.on('evento', e => {
    if (e?.tipo !== 'movil' || !ses || e.id !== ses.disp) return;
    if (e.accion === 'revocado' || (e.accion === 'escritorio' && !e.valor)) cortar('permiso retirado en el PC');
  });

  // ---------- HTTP: /v1/escritorio/… ----------
  // ctx = { maestro, disp, leer(req,max), json(res,code,obj), origen, q (query), sesionHdr }
  async function http(req, res, M, p, ctx) {
    const [, , a, x] = p, { json, leer } = ctx;
    try {
      if (ctx.maestro) {
        if (!a && M === 'GET') return json(res, 200, estado());
        if (a === 'solicitudes' && x && M === 'POST') { const b = await leer(req, 4096); const ok = resolver(x, b.aprobar === true, 'PC'); return json(res, ok ? 200 : 404, { ok }); }
        if (a === 'cortar' && M === 'POST') return json(res, 200, { ok: cortar('cortada desde el PC') });
        throw err('ruta', 404);
      }
      const d = ctx.disp;
      if (!d?.escritorio) throw err('este móvil no tiene permiso de escritorio remoto: actívalo en el PC (Configuración → Dispositivos)', 403);
      if (!a && M === 'GET') {
        const mia = ses && ses.disp === d.id;
        return json(res, 200, { permitido: true, aprobacion: conf().aprobacion, ocupado: !!ses && !mia, monitores,
          sesion: mia ? { id: ses.id, hasta: ses.hasta, inactividad: inactMs() } : null, stats: mia ? [...ses.flujos].map(f => f.stats).filter(Boolean)[0] || null : null });
      }
      if (a === 'reto' && M === 'POST') return json(res, 200, n.movil.retoEscritorio(d));
      if (a === 'sesion' && M === 'POST') {
        const b = await leer(req, 8192);
        if (conf().aprobacion === 'pin') { n.movil.probar(d, b.prueba, 'escritorio', { origen: ctx.origen }); return json(res, 200, crear(d, `PIN/huella de ${d.nombre}`)); }
        return json(res, 200, await solicitar(d));
      }
      const sid = String(ctx.q?.s || ctx.sesionHdr || '');
      const s = ses && ses.disp === d.id && sid && sid === ses.id ? ses : null;
      if (a === 'sesion' && M === 'DELETE') return json(res, 200, { ok: s ? cortar('cerrada desde el móvil') : false });
      if (!s) throw err('no hay sesión remota activa (terminó o caducó)', 410);
      if (a === 'flujo' && M === 'GET') { abrirFlujo(req, res, s, ctx.q || {}); return; }
      if (a === 'accion' && M === 'POST') return json(res, 200, await accion(s, await leer(req, 8192)));
      throw err('ruta', 404);
    } catch (e) { if (!res.headersSent) json(res, e.status || 400, { error: e.message }); else try { res.end(); } catch { } }
  }

  function estado() {
    return { sesion: publico(ses), solicitudes: [...solicitudes.values()].map(q => ({ id: q.id, dispositivo: q.dispositivo, creada: q.creada })),
      config: conf(), stats: ses ? [...ses.flujos].map(f => f.stats).filter(Boolean)[0] || null : null };
  }

  return { http, crear, cortar, solicitar, resolver, accion, abrirFlujo, estado, activa: () => !!ses, sesion: () => ses };
}

module.exports = { crearRemoto, TECLA };
