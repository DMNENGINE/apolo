const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { escribirAtomico } = require('./persistencia');
const { redactar } = require('./seguridad');
const ordenar = x => Array.isArray(x) ? x.map(ordenar) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordenar(x[k])])) : x;
const hash = x => crypto.createHash('sha256').update(JSON.stringify(ordenar(x))).digest('hex');
function crearEjecuciones({ cfg }) {
  const base = path.join(cfg.dir, 'ejecuciones'); fs.mkdirSync(base, { recursive: true });
  const locks = path.join(base, 'bloqueos'); fs.mkdirSync(locks, { recursive: true });
  const bloqueo = (ambito, huella) => path.join(locks, hash([ambito, huella]) + '.json');
  const vivo = dueno => { if (!dueno?.pid) return false; try { process.kill(dueno.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const liberar = (r, o) => { if (o.riesgo === 'lectura') return; const f = bloqueo(r.ambito || r.sesion, o.huella); try { const x = JSON.parse(fs.readFileSync(f, 'utf8')); if (x.operacion === o.id) fs.unlinkSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; } };
  const ruta = id => { if (!/^[\w-]{6,80}$/.test(id)) throw new Error('ejecucion invalida'); return path.join(base, id + '.json'); };
  const guardar = r => escribirAtomico(ruta(r.id), JSON.stringify(r, null, 2));
  const leer = id => { try { return JSON.parse(fs.readFileSync(ruta(id), 'utf8')); } catch { return null; } };
  function lista(sesion) {
    return fs.readdirSync(base).filter(f => f.endsWith('.json')).map(f => leer(f.slice(0, -5))).filter(r => r && (!sesion || r.sesion === sesion)).sort((a, b) => b.inicio - a.inicio);
  }
  // Una operacion interrumpida nunca se repite por suposicion.
  for (const r of lista()) if (['trabajando', 'esperando'].includes(r.estado) && !vivo(r.dueno)) {
    r.estado = 'interrumpida';
    for (const o of r.operaciones) if (o.estado === 'trabajando') o.estado = o.riesgo === 'lectura' ? 'interrumpida' : 'incierto';
    guardar(r);
  }
  for (const r of lista()) for (const o of r.operaciones) if (o.estado === 'incierto' && o.riesgo !== 'lectura') {
    try { fs.writeFileSync(bloqueo(r.ambito || r.sesion, o.huella), JSON.stringify({ ejecucion: r.id, operacion: o.id }), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  function iniciar(s, objetivo) {
    const r = { id: crypto.randomUUID(), sesion: s.id, ambito: s.tareaId || s.turnoNoche?.id || s.id, dueno: { pid: process.pid }, inicio: Date.now(), estado: 'trabajando', objetivo: redactar(String(objetivo)).slice(0, 2000), operaciones: [], uso: { entrada: 0, salida: 0 }, pasos: 0 };
    guardar(r); return r;
  }
  function empezar(r, c, riesgo) {
    const huella = hash([c.name, c.args]);
    if (r.operaciones.some(o => o.callId === c.id)) throw new Error('toolCall duplicada: ' + c.id);
    const o = { id: crypto.randomUUID(), callId: c.id, herramienta: c.name, huella, riesgo, estado: 'trabajando', inicio: Date.now() };
    if (riesgo !== 'lectura') {
      const f = bloqueo(r.ambito, huella), dato = JSON.stringify({ ejecucion: r.id, operacion: o.id });
      try { fs.writeFileSync(f, dato, { flag: 'wx', mode: 0o600 }); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        // un incierto antiguo de una ejecución que ya no corre no bloquea para siempre (p. ej. una tarea diaria que agotó el tiempo una noche)
        let previo = null, edad = 0; try { previo = JSON.parse(fs.readFileSync(f, 'utf8')); edad = Date.now() - fs.statSync(f).mtimeMs; } catch { }
        const prev = previo && leer(previo.ejecucion), corriendo = prev && ['trabajando', 'esperando'].includes(prev.estado) && vivo(prev.dueno);
        if (corriendo || edad < (cfg.ejecuciones?.bloqueoHoras ?? 6) * 3600000) throw new Error('operacion en curso o incierta: no se repite el efecto');
        fs.writeFileSync(f, dato, { mode: 0o600 }); o.retomaIncierta = previo?.operacion || true;
      }
    }
    r.operaciones.push(o);
    try { guardar(r); } catch (e) { r.operaciones.pop(); liberar(r, o); throw e; }
    return o;
  }
  function terminar(r, o, resultado) {
    Object.assign(o, { estado: resultado.estado, verificado: resultado.verificado, codigo: resultado.codigo, fin: Date.now() }); guardar(r); if (o.estado !== 'incierto') liberar(r, o);
  }
  function cerrar(r, estado) { r.estado = estado; r.fin = Date.now(); for (const o of r.operaciones) if (o.estado === 'trabajando') o.estado = o.riesgo === 'lectura' ? 'interrumpida' : 'incierto'; guardar(r); }
  function artefacto(r, texto) {
    const id = crypto.randomUUID();
    const dir = path.join(base, r.id); fs.mkdirSync(dir, { recursive: true });
    escribirAtomico(path.join(dir, id + '.txt'), redactar(texto));
    return { ejecucion: r.id, id };
  }
  function recurso(sesion, run, id, desde = 0, max = 12000) {
    if (!/^[\w-]{6,80}$/.test(id)) throw new Error('artefacto invalido');
    const r = leer(run); if (!r || r.sesion !== sesion) throw new Error('artefacto de otra sesion');
    const f = path.join(base, run, id + '.txt');
    const t = fs.readFileSync(f, 'utf8'); return t.slice(Math.max(0, desde), Math.max(0, desde) + Math.min(12000, max));
  }
  function conciliar(sesion, run, op, decision) {
    if (!['confirmada', 'no_ocurrio'].includes(decision)) throw new Error('decision invalida');
    const r = leer(run); const o = r?.operaciones.find(o => o.id === op);
    if (!r || r.sesion !== sesion || !o || o.estado !== 'incierto') throw new Error('operacion no conciliable');
    o.estado = decision; guardar(r); liberar(r, o); return true;
  }
  return { iniciar, empezar, terminar, cerrar, guardar, lista, leer, artefacto, recurso, conciliar };
}
module.exports = { crearEjecuciones, hash };
