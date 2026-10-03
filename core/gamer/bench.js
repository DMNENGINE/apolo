// Modo Gamer fase 2: medir de verdad. medir() = PresentMon N s + sensores cada ~3 s; benchmark() = medir SIN modo gamer → activar → medir CON él.
// Una medición a la vez. Estado en vivo (fase, restante, fps del último segundo, temps) para el panel. Resultados en <datos>/gamer/bench/<fecha>.json.
// La tarjeta para compartir (1080x1920, robot 3D) se hace con el navegador headless por CDP de wrapped.js (core/ui/gamer-tarjeta.js).
const fs = require('fs');
const path = require('path');
const { resumir } = require('./sensores');

const norm = n => String(n || '').toLowerCase().replace(/\.exe$/, '').trim();
const pad = n => String(n).padStart(2, '0');
const sello = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const err = (m, status = 400) => Object.assign(new Error(m), { status });
const r1 = n => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

function crearRendimiento({ cfg, gamer, so, presentmon, sensores, prohibido = () => false, dormir = ms => new Promise(ok => setTimeout(ok, ms)), intervaloSensores = 3000, asentarMs = 5000 }) {
  const dir = path.join(cfg.dir, 'gamer', 'bench');
  let vivo = null, ultimaPantalla = null, ctrl = null;            // vivo = estado de la medición en curso (o la última terminada)

  const fijarPantalla = e => { ultimaPantalla = e && e.completa && e.proceso ? { proceso: e.proceso, t: Date.now() } : ultimaPantalla; };

  // juego (nombre de proceso o pid) → {pid, nombre}. Sin juego: el último que se puso a pantalla completa
  async function resolver(juego) {
    const j = norm(juego || ultimaPantalla?.proceso);
    if (!j) throw err('dime el juego (nombre del proceso, p. ej. eurotrucks2.exe) o ponlo a pantalla completa');
    const pid = /^\d+$/.test(j) ? +j : 0;
    const ps = (await so.gamerProcesos()).filter(p => (pid ? p.pid === pid : norm(p.nombre) === j) && !prohibido(p));
    if (!ps.length) throw err(`no encuentro el proceso "${juego || ultimaPantalla?.proceso}" (¿está abierto?)`, 404);
    return { pid: ps[0].pid, nombre: ps[0].nombre };
  }

  // una fase: PresentMon + muestreo de sensores en paralelo
  async function fase(nombre, { pid, segundos, admin, csv }) {
    const t0 = Date.now(), muestras = [];
    Object.assign(vivo, { fase: nombre, inicioFase: t0, segundosFase: segundos, fps: null });
    let seguir = true;
    const muestreo = (async () => {
      while (seguir) {
        try { const s = await sensores.leer(); muestras.push(s); vivo.sensores = { gpu: s.gpu, cpu: s.cpu }; } catch { }
        for (let w = 0; seguir && w < intervaloSensores; w += 250) await dormir(Math.min(250, intervaloSensores));
      }
    })();
    try {
      const r = await presentmon.capturar({ pid, segundos, admin, csv, senal: ctrl.signal, enVivo: f => { vivo.fps = f; } });
      return { ...r.metricas, aplicacion: r.aplicacion, columna: r.columna, version: r.version, sensores: resumir(muestras) };
    } finally { seguir = false; await muestreo; }
  }

  const ocupado = () => vivo && !['listo', 'error', 'cancelado'].includes(vivo.fase);
  function empezar(tipo, extra) {
    if (ocupado()) throw err('ya hay una medición en curso', 409);
    if (!presentmon.buscar().instalado) throw err('PresentMon no está instalado: pulsa "Descargar PresentMon" en el panel Modo Gamer', 409);
    ctrl = new AbortController();
    vivo = { id: sello(), tipo, fase: 'preparando', desde: Date.now(), ...extra };
  }
  function guardar(res) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${res.id}.json`), JSON.stringify(res, null, 2)); return res; }
  const fallo = e => { vivo.fase = ctrl?.signal.aborted ? 'cancelado' : 'error'; vivo.error = e.message; throw e; };

  // medir una vez (no toca el modo gamer)
  async function medir({ segundos = 60, juego, admin = !!cfg.gamer?.presentmonAdmin } = {}) {
    segundos = Math.max(5, Math.min(600, +segundos || 60));
    empezar('medida', { segundos });
    try {
      const j = await resolver(juego); vivo.juego = j.nombre;
      const m = await fase('midiendo', { pid: j.pid, segundos, admin, csv: path.join(dir, `${vivo.id}.csv`) });
      const res = guardar({ id: vivo.id, tipo: 'medida', fecha: new Date().toISOString(), juego: j.nombre, segundos, gamerActivo: !!gamer.estado().activo, medida: m });
      Object.assign(vivo, { fase: 'listo', resultado: res.id });
      return res;
    } catch (e) { return fallo(e); }
  }

  // antes/después: el usuario lo pide; el modo gamer se queda ACTIVO al final (estás jugando)
  async function benchmark({ segundos = 60, juego, admin = !!cfg.gamer?.presentmonAdmin } = {}) {
    segundos = Math.max(10, Math.min(300, +segundos || 60));
    if (gamer.estado().activo) throw err('para medir el "antes" el Modo Gamer tiene que estar apagado: desactívalo y vuelve a empezar', 409);
    empezar('bench', { segundos });
    try {
      const j = await resolver(juego); vivo.juego = j.nombre;
      const antes = await fase('antes', { pid: j.pid, segundos, admin, csv: path.join(dir, `${vivo.id}-antes.csv`) });
      vivo.antes = { fps: antes.fps, low1: antes.low1 };
      vivo.fase = 'activando';
      const e = await gamer.activar(j.nombre);
      const cambios = (e.cambios || []).filter(c => c.estado === 'hecho').map(c => c.detalle || c.titulo);
      await dormir(asentarMs);                                     // que el plan de energía y las pausas se noten
      if (ctrl.signal.aborted) throw err('medición cancelada');
      const despues = await fase('despues', { pid: j.pid, segundos, admin, csv: path.join(dir, `${vivo.id}-despues.csv`) });
      const res = guardar({ id: vivo.id, tipo: 'bench', fecha: new Date().toISOString(), juego: j.nombre, segundos, antes, despues, cambios, delta: delta(antes, despues),
        alertas: [...new Set([...(antes.sensores?.alertas || []), ...(despues.sensores?.alertas || [])])] });
      Object.assign(vivo, { fase: 'listo', resultado: res.id });
      return res;
    } catch (e) { return fallo(e); }
  }

  function delta(a, d) {
    const dif = k => (a[k] != null && d[k] != null ? r1(d[k] - a[k]) : null);
    return { fps: dif('fps'), pct: a.fps ? r1(100 * (d.fps - a.fps) / a.fps) : null, low1: dif('low1'), low01: dif('low01'), ftP99: dif('ftP99'), tirones: dif('tirones') };
  }

  function cancelar() { if (!ocupado()) return false; ctrl.abort(); return true; }
  function estadoVivo() {
    if (!vivo) return { fase: 'nada' };
    const restante = vivo.inicioFase && ['antes', 'despues', 'midiendo'].includes(vivo.fase) ? Math.max(0, Math.ceil(vivo.segundosFase - (Date.now() - vivo.inicioFase) / 1000)) : null;
    return { ...vivo, restante, ultimaPantalla: ultimaPantalla?.proceso || null };
  }
  function leerRes(id) {
    if (!/^[\w-]{6,40}$/.test(String(id || ''))) throw err('id no válido');
    try { return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')); } catch { throw err('no existe esa medición', 404); }
  }
  function historial(n = 30) {
    let fs_ = []; try { fs_ = fs.readdirSync(dir).filter(f => /^[\w-]+\.json$/.test(f)).sort().reverse().slice(0, n); } catch { }
    return fs_.map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { id: r.id, tipo: r.tipo, fecha: r.fecha, juego: r.juego, segundos: r.segundos, fps: r.tipo === 'bench' ? r.despues?.fps : r.medida?.fps, antes: r.antes?.fps ?? null, delta: r.delta || null, low1: r.tipo === 'bench' ? r.despues?.low1 : r.medida?.low1, alertas: r.alertas || r.medida?.sensores?.alertas || [] }; } catch { return null; } }).filter(Boolean);
  }

  // ---------- tarjeta para compartir (PNG 1080x1920) ----------
  function paginaTarjeta(res, { nombre = cfg.nombre || 'APOLO', idioma } = {}) {
    const json = JSON.stringify({ ...res, nombre, idioma }).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${nombre} · Modo Gamer</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body>
<script type="application/json" id="datos">${json}</script>
<script src="/ui/i18n.js"></script><script src="/ui/gamer-tarjeta.js"></script></body></html>`;
  }
  async function tarjeta(id, opciones = {}) {
    const res = leerRes(id);
    if (res.tipo !== 'bench') throw err('la tarjeta es para benchmarks antes/después');
    const v = require('../turno-video'), { abrirCDP } = require('../wrapped');
    const carpeta = path.join(dir, `${id}-tarjeta`); fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, 'video.html'), paginaTarjeta(res, opciones));
    const nav = v.buscarNavegador(opciones.navegador);
    if (!nav) throw err('no encontré Chrome/Edge para hacer la imagen', 500);
    const srv = await v.servidor(carpeta), ses = await abrirCDP(nav, 1080, 1920);
    try {
      await ses.cdp('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/video.html` });
      await ses.esperar('window.listo === true', 20_000);
      await dormir(900);
      const r = await ses.cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
      const f = path.join(carpeta, `apolo-gamer-${id}.png`);
      fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
      return f;
    } finally { ses.cerrar(); srv.close(); }
  }

  return { medir, benchmark, cancelar, estadoVivo, historial, leer: leerRes, tarjeta, paginaTarjeta, fijarPantalla, resolver, delta, ocupado };
}

module.exports = { crearRendimiento };
