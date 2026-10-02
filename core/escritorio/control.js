// Control del ratón y el teclado (fase 2). Permiso POR ENCARGO: el modelo pide "tomar_control" con un motivo,
// el usuario lo aprueba una vez (siempre se pregunta, nunca se guarda como regla) y durante unos minutos puede actuar.
// Frenos:
//   - pánico: si el usuario mueve el ratón, hace clic, pulsa una tecla o Ctrl+Alt+Esc → se suelta el control y se cancela el turno
//   - ventanas protegidas (bancos, gestores de contraseñas…): ni mira ni actúa
//   - nunca escribe en un campo de contraseña
//   - acciones delicadas (enviar, borrar, comprar, pagar, publicar… o Enter en apps de mensajería/correo) piden permiso aparte
// Eventos del bus: 'control' { activo, sesion, motivo, hasta, razon }
const path = require('path');
const { spawn } = require('child_process');
const { recientes, bloqueada } = require('./index');

const DELICADAS = /\b(enviar|env[ií]a|send|borrar|eliminar|delete|remove|quitar|comprar|buy|pagar|pay|checkout|realizar pedido|place order|publicar|post|tweet|compartir|share|confirmar|confirm|submit|instalar|install|desinstalar|uninstall|transferir|transfer|vaciar|empty|formatear|format|firmar|sign|suscribir|subscribe|aprobar|approve|cr[eé]ditos|credits|reiniciar|restart|apagar|shut ?down|cerrar sesi[oó]n|log ?out|sign ?out)\b/i;
const MENSAJERIA = /discord|whatsapp|telegram|signal|slack|teams|outlook|thunderbird|messenger|gmail|correo|mail|instagram|facebook|twitter|\bx\.com|tiktok/i;

function crearControl({ cfg, bus, permisos, cancelarTurno, manos = null }) {   // manos: sustituto del ayudante (tests)
  const activos = new Map();             // sesion.id -> { hasta, motivo, timer }
  let hijo = null, buf = '', n = 0, listo = null, apagarTimer = null;
  const esperas = new Map();

  function arrancar() {
    if (hijo) return listo;
    hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'manos.ps1')], { windowsHide: true });
    hijo.stdout.setEncoding('utf8');
    let avisarListo;
    listo = new Promise(ok => { avisarListo = ok; });
    hijo.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue;
        let j; try { j = JSON.parse(l.replace(/^﻿/, '')); } catch { continue; }
        if (j.evento === 'listo') avisarListo();
        else if (j.evento === 'panico') panico(j.motivo);
        else { esperas.get(j.id)?.(j); esperas.delete(j.id); }
      }
    });
    hijo.on('exit', () => {
      hijo = null; listo = null;
      for (const [, ok] of esperas) ok({ ok: false, error: 'el ayudante de manos se cerró' });
      esperas.clear();
      for (const id of [...activos.keys()]) soltar(id, 'el ayudante de manos se cerró');
    });
    return listo;
  }

  async function orden(o, timeout = 30_000) {
    if (manos) { const r = await manos(o); if (r && r.ok === false) throw new Error(r.error); return r || {}; }
    await Promise.race([arrancar(), new Promise((_, mal) => setTimeout(() => mal(new Error('el ayudante de manos no arrancó')), 20_000))]);
    return new Promise((ok, mal) => {
      const id = ++n;
      const t = setTimeout(() => { esperas.delete(id); mal(new Error('el ayudante de manos no respondió')); }, timeout);
      esperas.set(id, j => { clearTimeout(t); j.ok ? ok(j) : mal(new Error(j.error)); });
      hijo.stdin.write(JSON.stringify({ id, ...o }) + '\n');
    });
  }

  function programarApagado() {                 // sin control activo durante 5 min: se cierra el ayudante
    clearTimeout(apagarTimer);
    if (!activos.size) { apagarTimer = setTimeout(() => { if (!activos.size && hijo) hijo.stdin.end(); }, 5 * 60_000); apagarTimer.unref?.(); }
  }

  // marca en memoria (no enumerable: nunca va al .json de la sesión) que usa el riesgo de ver_pantalla
  const marcar = (s, v) => Object.defineProperty(s, 'controlando', { value: v, writable: true, enumerable: false, configurable: true });
  const activo = s => { const c = s && activos.get(s.id); return !!c && Date.now() < c.hasta; };

  async function tomar(s, { motivo, minutos = 5 }) {
    if (process.platform !== 'win32' && !manos) throw new Error('el control del PC solo está disponible en Windows por ahora');
    minutos = Math.min(Math.max(Number(minutos) || 5, 1), 30);
    for (const id of activos.keys()) if (id !== s.id) throw new Error('otra conversación ya está controlando el PC');
    clearTimeout(activos.get(s.id)?.timer);
    const hasta = Date.now() + minutos * 60_000;
    activos.set(s.id, { hasta, motivo, s, timer: setTimeout(() => soltar(s.id, 'se acabó el tiempo'), minutos * 60_000) });
    activos.get(s.id).timer.unref?.();
    marcar(s, true);
    clearTimeout(apagarTimer);
    await orden({ op: 'armar' });
    bus.emit('control', { activo: true, sesion: s.id, motivo, hasta });
    return { hasta, minutos };
  }

  function soltar(id, razon = 'terminado') {
    const c = activos.get(id); if (!c) return false;
    clearTimeout(c.timer); activos.delete(id); marcar(c.s, false);
    if (!activos.size && hijo) orden({ op: 'desarmar' }).catch(() => { });
    bus.emit('control', { activo: false, sesion: id, motivo: c.motivo, razon });
    programarApagado();
    return true;
  }
  const soltarTodo = razon => [...activos.keys()].map(id => soltar(id, razon)).some(Boolean);

  function panico(motivo) {
    const txt = { raton: 'moviste el ratón', clic: 'hiciste clic', teclado: 'pulsaste una tecla', teclas: 'Ctrl+Alt+Esc' }[motivo] || motivo;
    for (const id of [...activos.keys()]) { soltar(id, `recuperaste el control (${txt})`); cancelarTurno?.(id); }
  }

  // coordenadas de la última ver_pantalla de la sesión: #elemento o [x,y] de la imagen → píxeles reales de pantalla
  function aPantalla(s, { elemento, x, y }) {
    const r = recientes.get(s.id);
    if (!r) throw new Error('primero usa ver_pantalla para saber qué hay y dónde');
    if (elemento !== undefined && elemento !== null && elemento !== '') {
      const e = r.elementos.find(z => z.id === Number(String(elemento).replace('#', '')));
      if (!e) throw new Error(`no existe el elemento #${elemento} en la última captura; vuelve a usar ver_pantalla`);
      return { x: Math.round(e.x + e.ancho / 2), y: Math.round(e.y + e.alto / 2), nombre: e.nombre, tipo: e.tipo };
    }
    if (typeof x !== 'number' || typeof y !== 'number') throw new Error('indica "elemento" (#id de ver_pantalla) o x,y de la imagen');
    return { x: Math.round(r.origen.x + x * r.escala), y: Math.round(r.origen.y + y * r.escala) };
  }

  async function pedirDelicada(s, que) {
    const h = { nombre: 'accion_delicada', riesgo: 'control', resumen: () => que, siemprePreguntar: () => 'acción delicada con tu ratón/teclado' };
    const p = await permisos.pedir({ h, args: {}, sesion: s });
    if (!p.ok) throw new Error(`DENEGADO por el usuario: ${que}`);
  }

  // una acción del ratón/teclado con todas las comprobaciones; devuelve el texto para el modelo
  async function accion(s, op, a = {}) {
    if (!activo(s)) throw new Error('no tienes el control del PC: pide primero "tomar_control" con un motivo claro');
    let p = null, p2 = null;
    if (op === 'clic' || op === 'mover' || op === 'arrastrar' || (op === 'scroll' && (a.elemento !== undefined || a.x !== undefined)) || (op === 'escribir' && (a.elemento !== undefined || a.x !== undefined))) p = aPantalla(s, a);
    if (op === 'arrastrar') p2 = aPantalla(s, { elemento: a.elemento2, x: a.x2, y: a.y2 });
    const info = await orden({ op: 'info', ...(p ? { x: p.x, y: p.y } : {}) });
    const prot = bloqueada(cfg, info.ventana);
    if (prot) throw new Error(`la ventana activa ("${info.ventana.titulo}") está PROTEGIDA: no actúo ahí. Pide al usuario que lo haga él.`);
    const objetivo = p?.nombre || info.enPunto?.nombre || '';
    const ventana = `${info.ventana.titulo} ${info.ventana.proceso}`;

    // delicadas
    let delicada = '';
    if (op === 'clic' && DELICADAS.test(objetivo)) delicada = `clic en "${objetivo}" (${info.ventana.titulo})`;
    if (op === 'tecla') {
      const c = String(a.combo || '').toLowerCase();
      if (/\b(enter|intro)\b/.test(c) && MENSAJERIA.test(ventana)) delicada = `pulsar ${a.combo} en ${info.ventana.titulo} (podría enviar un mensaje)`;
      if (/\b(delete|supr)\b/.test(c) && /explorer/i.test(info.ventana.proceso)) delicada = `pulsar ${a.combo} en el Explorador (borraría archivos)`;
    }
    if (op === 'escribir' && /\n/.test(a.texto || '') && MENSAJERIA.test(ventana)) delicada = `escribir con saltos de línea en ${info.ventana.titulo} (podría enviar un mensaje)`;
    if (delicada) await pedirDelicada(s, delicada);
    if (!activo(s)) throw new Error('el control se soltó mientras esperaba tu permiso');

    if (op === 'escribir') {
      if (p) { await orden({ op: 'clic', x: p.x, y: p.y, armadoRequerido: true }); await new Promise(ok => setTimeout(ok, 150)); }
      const foco = p ? (await orden({ op: 'info' })).foco : info.foco;
      if (foco?.password) throw new Error('el campo con el foco es una CONTRASEÑA: no escribo contraseñas. Pide al usuario que la escriba él.');
      await orden({ op: 'escribir', texto: String(a.texto || ''), armadoRequerido: true }, 120_000);
      return `escrito (${String(a.texto || '').length} caracteres) en ${foco?.nombre ? `"${foco.nombre}"` : 'el campo con el foco'} de "${info.ventana.titulo}"`;
    }
    if (op === 'clic') { await orden({ op: 'clic', x: p.x, y: p.y, boton: a.boton || 'izq', doble: !!a.doble, armadoRequerido: true }); return `${a.doble ? 'doble ' : ''}clic ${a.boton === 'der' ? 'derecho ' : ''}en ${objetivo ? `"${objetivo}"` : `(${p.x},${p.y})`} · ventana "${info.ventana.titulo}"`; }
    if (op === 'mover') { await orden({ op: 'mover', x: p.x, y: p.y, armadoRequerido: true }); return `ratón movido a ${objetivo ? `"${objetivo}"` : `(${p.x},${p.y})`}`; }
    if (op === 'arrastrar') { await orden({ op: 'arrastrar', x: p.x, y: p.y, x2: p2.x, y2: p2.y, armadoRequerido: true }); return 'arrastrado'; }
    if (op === 'scroll') { await orden({ op: 'scroll', cantidad: Math.max(-30, Math.min(30, Number(a.cantidad) || 3)), ...(p ? { x: p.x, y: p.y } : {}), armadoRequerido: true }); return `scroll ${a.cantidad > 0 || a.cantidad === undefined ? 'abajo' : 'arriba'}`; }
    if (op === 'tecla') { await orden({ op: 'tecla', combo: String(a.combo || ''), armadoRequerido: true }); return `pulsado ${a.combo} en "${info.ventana.titulo}"`; }
    throw new Error('acción desconocida');
  }

  // si el turno de la sesión termina, el control se suelta solo
  bus.on('evento', e => { if ((e.tipo === 'fin' || e.tipo === 'error') && activos.has(e.sesion)) soltar(e.sesion, 'terminó el encargo'); });

  return {
    tomar, soltar, soltarTodo, accion, activo,
    estado: () => [...activos].map(([sesion, c]) => ({ sesion, motivo: c.motivo, hasta: c.hasta })),
    cerrar: () => { soltarTodo('cierre'); hijo?.kill(); },
    _orden: orden, _panico: panico,
  };
}

module.exports = { crearControl, DELICADAS, MENSAJERIA };
