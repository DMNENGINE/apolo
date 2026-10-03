// Registro de auditoría encadenado (FASE 9): <nucleo>/auditoria.jsonl
// Cada línea = {n, t, tipo, …, prev, hash}; hash = sha256(prev + JSON de la línea sin hash). Cambiar, borrar o reordenar una línea
// del medio rompe la cadena (verificar()). Límite honesto: quien pueda escribir el archivo puede REHACER toda la cadena o cortar el
// final; para eso está exportar() (guarda copias fuera) y el ancla en la bóveda (último n/hash cifrado con DPAPI, opcional).
// Qué entra: acciones con riesgo ≥ escritura (aprobadas por regla/modo auto o por una persona), quién aprobó (canal/dispositivo),
// el resultado, permisos externos (MCP, plugins), pánico/reanudar y cambios de seguridad (modo de permisos, reglas).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redactar } = require('./seguridad');

const GENESIS = '0'.repeat(64);
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const sinHash = l => { const { hash, ...resto } = l; return resto; };
const calcular = l => sha(l.prev + JSON.stringify(sinHash(l)));

function crearAuditoria({ cfg, bus, ahora = Date.now, boveda = null } = {}) {
  const f = path.join(cfg.dir, 'auditoria.jsonl');
  let ultimo = { n: 0, hash: GENESIS };
  try {                                                         // lee solo el final del archivo para retomar la cadena
    const st = fs.statSync(f), tam = Math.min(st.size, 64 * 1024), fd = fs.openSync(f, 'r'), b = Buffer.alloc(tam);
    fs.readSync(fd, b, 0, tam, st.size - tam); fs.closeSync(fd);
    const lineas = b.toString('utf8').trim().split('\n'); const l = JSON.parse(lineas[lineas.length - 1]);
    if (l && l.hash) ultimo = { n: l.n, hash: l.hash };
  } catch { }
  let seq = 0;
  const pendientesRes = new Map();                              // auditId → n de la acción (para enlazar el resultado)

  function escribir(datos) {
    const l = { n: ultimo.n + 1, t: ahora(), ...datos, prev: ultimo.hash };
    for (const k of Object.keys(l)) if (l[k] === undefined || l[k] === '') delete l[k];
    l.hash = calcular(l);
    fs.appendFileSync(f, JSON.stringify(l) + '\n', { mode: 0o600 });
    ultimo = { n: l.n, hash: l.hash };
    bus?.emit('evento', { tipo: 'auditoria', linea: l });
    return l;
  }
  // registrar una entrada; devuelve un id para luego enlazar el resultado
  function registrar(e = {}) {
    const l = escribir({ tipo: String(e.tipo || 'accion'), sesion: e.sesion || undefined, herramienta: e.herramienta, origen: e.origen,
      resumen: e.resumen !== undefined ? redactar(String(e.resumen)).slice(0, 400) : undefined, riesgo: e.riesgo, peligro: e.peligro,
      decision: e.decision, quien: e.quien, motivo: e.motivo !== undefined ? redactar(String(e.motivo)).slice(0, 200) : undefined, resultado: e.resultado });
    const id = `a${(++seq).toString(36)}`; pendientesRes.set(id, l.n);
    if (pendientesRes.size > 500) pendientesRes.delete(pendientesRes.keys().next().value);
    return id;
  }
  function resultado(id, ok, texto = '') {
    const ref = pendientesRes.get(id); if (!ref) return;
    pendientesRes.delete(id);
    escribir({ tipo: 'resultado', ref, resultado: ok ? 'ok' : 'error', detalle: redactar(String(texto || '')).split('\n')[0].slice(0, 200) });
  }
  function leerTodo() {
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { return []; }
    return txt.split('\n').filter(Boolean).map((x, i) => { try { return JSON.parse(x); } catch { return { n: -1, roto: true, linea: i + 1 }; } });
  }
  // recorre toda la cadena: {ok, total, primeraRota?, motivo?}
  function verificar() {
    const ls = leerTodo(); let prev = GENESIS, n = 0;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (l.roto) return { ok: false, total: ls.length, primeraRota: i + 1, motivo: 'línea ilegible' };
      if (l.prev !== prev) return { ok: false, total: ls.length, primeraRota: i + 1, n: l.n, motivo: 'la cadena no enlaza con la línea anterior (borrada o reordenada)' };
      if (calcular(l) !== l.hash) return { ok: false, total: ls.length, primeraRota: i + 1, n: l.n, motivo: 'el contenido de la línea fue modificado' };
      if (l.n !== n + 1) return { ok: false, total: ls.length, primeraRota: i + 1, n: l.n, motivo: 'numeración saltada' };
      prev = l.hash; n = l.n;
    }
    const r = { ok: true, total: ls.length, ultimo: prev };
    const ancla = leerAncla();
    if (ancla && ancla.n > n) Object.assign(r, { ok: false, motivo: `faltan líneas al final: el ancla guardada dice ${ancla.n} y el archivo acaba en ${n}` });
    return r;
  }
  // lista filtrada (más nuevas primero)
  function lista({ q = '', tipo = '', quien = '', decision = '', desde = 0, limite = 300 } = {}) {
    const qq = String(q).toLowerCase();
    return leerTodo().filter(l => !l.roto && (!tipo || l.tipo === tipo) && (!quien || String(l.quien || '').includes(quien)) && (!decision || l.decision === decision) && (!desde || l.t >= +desde)
      && (!qq || JSON.stringify(l).toLowerCase().includes(qq))).reverse().slice(0, Math.min(+limite || 300, 5000));
  }
  // ancla en la bóveda (DPAPI): último {n, hash}; detecta que alguien corte el final del archivo. Se guarda cada 25 líneas y al cerrar.
  function leerAncla() { try { const v = boveda?.leer?.('auditoria:ancla'); return v ? JSON.parse(v) : null; } catch { return null; } }
  let ancladas = 0;
  function anclar() { if (!boveda?.guardar || ultimo.n === ancladas) return; try { boveda.guardar('auditoria:ancla', JSON.stringify(ultimo)); ancladas = ultimo.n; } catch { } }
  let tAncla = null;                                            // DPAPI cuesta ~0,3 s: como mucho una vez cada 30 s, y solo si hubo líneas
  bus?.on('evento', e => { if (e.tipo === 'auditoria' && !tAncla && boveda?.guardar) { tAncla = setTimeout(() => { tAncla = null; anclar(); }, 30_000); tAncla.unref?.(); } });

  async function http(M, p, b = {}, q = {}) {
    if (M === 'GET' && !p[2]) return { lineas: lista(q), ultimo };
    if (M === 'GET' && p[2] === 'verificar') return verificar();
    if (M === 'GET' && p[2] === 'exportar') { anclar(); return { __archivo: f, nombre: `auditoria-${new Date(ahora()).toISOString().slice(0, 10)}.jsonl` }; }
    throw Object.assign(new Error('ruta'), { status: 404 });
  }
  return { registrar, resultado, verificar, lista, http, anclar, archivo: f, ultimo: () => ({ ...ultimo }) };
}

module.exports = { crearAuditoria, calcular, GENESIS };
