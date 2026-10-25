// Pestaña Trading (paquete dmn-trader): puente con el motor de DMN Trader.
// Destino: el motor que arranca el paquete en este equipo (<dir>/plugins-datos/dmn-trader/destino.json + token en la
// bóveda); si no está, la configuración antigua de la skill «trader» (<dir>/skills/trader/_datos/trader.json) o el PC local.
const fs = require('fs');
const path = require('path');
const seg = require('./seguridad');
const AUTORIZADO = Symbol('trading autorizado');
const error = (texto, status = 400) => Object.assign(new Error(texto), { status });
const objeto = x => x && typeof x === 'object' && !Array.isArray(x);

// "piloto…" va a /api/piloto… (piloto con dinero real del motor); lo demás a /api/enjambre/…
const PERMITIDAS = [['GET', /^mapa$/], ['GET', /^noticias$/], ['GET', /^informe$/], ['GET', /^lecciones$/], ['GET', /^agente\/\d+$/], ['POST', /^iniciar$/], ['POST', /^parar$/],
  ['GET', /^piloto$/], ['POST', /^piloto\/config$/]];

function destinoPaquete(dir, boveda) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, 'plugins-datos', 'dmn-trader', 'destino.json'), 'utf8')); } catch { return null; }
  if (!d || typeof d.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(d.url) || !boveda) return null;
  const token = boveda.leer('plugin:dmn-trader:token'); if (!token) return null;
  seg.registrarSecreto(token); return { url: d.url, token, paquete: true };
}

function destino(dir, { boveda } = {}) {
  const p = destinoPaquete(dir, boveda); if (p) return p;
  let c = {};
  try { c = JSON.parse(fs.readFileSync(path.join(dir, 'skills/trader/_datos/trader.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw error('Configuracion de DMN Trader ilegible'); }
  let u; try { u = new URL(c.url || 'http://127.0.0.1:8777'); } catch { throw error('URL de DMN Trader invalida'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.protocol === 'http:' && !seg.urlPrivada(u.href))) throw error('DMN Trader requiere HTTPS o HTTP privado sin credenciales ni consulta en la URL');
  let token = '';
  if (c.tokenRef) {
    if (c.tokenRef !== 'boveda:trading:central' || !boveda) throw error('Referencia de credencial de trading no disponible');
    token = boveda.leer('trading:central'); if (!token) throw error('Credencial de trading no disponible', 503);
  } else if (c.token) {
    if (typeof c.token !== 'string' || /[\r\n]/.test(c.token)) throw error('Credencial de trading invalida');
    token = c.token;
    // El cliente Python usa el original: no se borra hasta migrar ambos clientes.
    if (boveda) { if (boveda.leer('trading:central') !== token) boveda.guardar('trading:central', token); if (boveda.leer('trading:central') !== token) throw error('No se pudo verificar la boveda de trading', 503); }
  }
  seg.registrarSecreto(token); return { url: u.href.replace(/\/+$/, ''), token };
}

async function pedir(dir, metodo, partes, cuerpo, query = {}, opciones = {}) {
  const ruta = partes.filter(Boolean).join('/') || 'mapa';
  if (!PERMITIDAS.some(([m, rx]) => m === metodo && rx.test(ruta))) { const e = new Error('ruta de trading no permitida'); e.status = 404; throw e; }
  if (metodo === 'POST' && opciones.autorizado !== AUTORIZADO) throw error('El control de trading requiere autorizacion de APOLO', 403);
  if (Object.keys(query).some(k => k !== 'n') || (query.n !== undefined && (!/^\d{1,3}$/.test(String(query.n)) || +query.n < 1 || +query.n > 100))) throw error('Consulta de trading invalida');
  const { url, token } = opciones.destino || destino(dir, opciones);
  const qs = new URLSearchParams(query).toString();
  const r = await (opciones.fetch || fetch)(`${url}/api/${ruta.startsWith('piloto') ? '' : 'enjambre/'}${ruta}${qs ? '?' + qs : ''}`, {
    method: metodo, redirect: 'error', signal: opciones.signal ? AbortSignal.any([opciones.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    headers: { ...(cuerpo ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-token': token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).catch(() => { throw error('DMN Trader no responde; solicitud no confirmada', 502); });
  if (!r.body) throw error('Respuesta vacia de DMN Trader', 502);
  const lector = r.body.getReader(); let bytes = 0; const trozos = [];
  try { for (;;) { const { value, done } = await lector.read(); if (done) break; bytes += value.length; if (bytes > 4 * 1024 * 1024) { await lector.cancel(); throw error('Respuesta de trading demasiado grande', 502); } trozos.push(Buffer.from(value)); } }
  catch { throw error('Respuesta de trading interrumpida o demasiado grande', 502); } finally { lector.releaseLock(); }
  let j; try { j = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch { throw error(r.ok ? 'DMN Trader no devolvio JSON valido' : 'DMN Trader rechazo la solicitud', r.ok ? 502 : r.status); }
  if (!r.ok) {
    if (r.status === 409 && j?.codigo === 'CIERRES_PENDIENTES') throw Object.assign(error('Hay posiciones simuladas pendientes de cierre. Se conservan capital, historial y protecciones; espera la ejecucion de los cierres antes de iniciar una sesion nueva.', 409), { code: 'CIERRES_PENDIENTES' });
    throw error('DMN Trader rechazo la solicitud (HTTP ' + r.status + ')', r.status >= 400 && r.status < 600 ? r.status : 502);
  }
  validarRespuesta(ruta, j);
  return Array.isArray(j) ? j : { ...j, _central: url };
}

function validarRespuesta(ruta, j) {
  if (!objeto(j) && !Array.isArray(j)) throw error('Respuesta de DMN Trader invalida', 502);
  const piloto = ruta.startsWith('piloto');
  // en el estado del piloto, "error" es el último aviso del bucle (p. ej. límite de peticiones de GMGN), no un rechazo
  if (objeto(j) && (j.ok === false || (j.error && !(piloto && ruta === 'piloto')))) throw error('DMN Trader rechazo la solicitud', 502);
  if (piloto && ruta === 'piloto' && (!objeto(j.cfg) || typeof j.cfg.activo !== 'boolean')) throw error('Estado del piloto incompleto', 502);
  if (ruta === 'mapa') {
    if (!objeto(j.total) || !Array.isArray(j.nodos) || j.nodos.length > 32) throw error('Mapa de trading incompleto', 502);
    const ids = new Set();
    for (const n of j.nodos) {
      if (!objeto(n) || typeof n.nodo !== 'string' || !n.nodo || n.nodo.length > 100 || ids.has(n.nodo) || !Array.isArray(n.agentes) || n.agentes.length > 2000 || !objeto(n.kpis)) throw error('Nodo de trading invalido', 502);
      ids.add(n.nodo);
      if ((n.local !== undefined && typeof n.local !== 'boolean') || (n.kpis.activo !== undefined && typeof n.kpis.activo !== 'boolean')) throw error('Estado de nodo invalido', 502);
      const agentes = new Set();
      for (const a of n.agentes) { if (!objeto(a) || !Number.isInteger(a.id) || agentes.has(a.id)) throw error('Agente de trading invalido', 502); agentes.add(a.id); }
    }
    if (j.nodos.filter(n => n.local).length > 1) throw error('Central local ambigua', 502);
  }
  const numericos = new Set(['agentes', 'trades', 'ganados', 'metas', 'quiebras', 'r_medio', 'equity', 'max_equity', 'meta', 'generacion', 'tick_s', 'n', 'capital', 'riesgo_pct', 'pnl_pct', 'impacto', 'importancia', 'ts', 'MERCADO', 'CRIPTO', 'ACCIONES', 'valor', 'stop_atr', 'rr', 'max_barras', 'be_en_r', 'tramos', 'trail_r', 'filtro_ia']);
  function revisar(x, profundidad = 0, padre = '') {
    if (profundidad > 16) throw error('Respuesta de trading demasiado anidada', 502);
    if (Array.isArray(x)) { if (x.length > 10000) throw error('Lista de trading demasiado grande', 502); for (const v of x) revisar(v, profundidad + 1, padre); }
    else if (objeto(x)) for (const [k, v] of Object.entries(x)) {
      const lista = Array.isArray(v) && (k === 'agentes' || (k === 'trades' && profundidad === 0 && /^agente\//.test(ruta)));
      // los eventos macro (ForexFactory) traen el impacto como etiqueta: 'High', 'Medium'…
      const etiqueta = k === 'impacto' && padre === 'eventos' && typeof v === 'string' && v.length <= 40;
      if (numericos.has(k) && !lista && !etiqueta && v != null && (typeof v !== 'number' || !Number.isFinite(v))) throw error('Dato numerico de trading invalido: ' + k + ' (' + typeof v + ')', 502);
      if (typeof v === 'string' && v.length > 30000) throw error('Texto de trading demasiado largo', 502);
      revisar(v, profundidad + 1, k);
    }
  }
  if (!piloto) revisar(j);   // el estado del piloto tiene su propio esquema (lo revisa trading-autopiloto antes de usarlo)
  if (/^agente\//.test(ruta) && (!objeto(j.genoma) || !Array.isArray(j.intentos_lista) || !Array.isArray(j.lecciones))) throw error('Detalle de trading incompleto', 502);
  return j;
}
// La capacidad de escritura solo se entrega al controlador que aplica permisos y panico.
function transporte(n, fetchPrueba) { return (m, ruta, b, d, q) => pedir(n.cfg.dir, m, [ruta], b, q, { autorizado: AUTORIZADO, boveda: n.cfg.boveda, fetch: fetchPrueba, destino: d }); }
module.exports = { pedir, destino, validarRespuesta, transporte, error };
