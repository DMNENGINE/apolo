// Mission Control → Trading: puente con el enjambre de DMN Trader (la central suele ser la Pi).
// La dirección y el token salen de los datos de la skill «trader» (<dir>/skills/trader/_datos/trader.json); si no, el PC local.
const fs = require('fs');
const path = require('path');

const PERMITIDAS = [['GET', /^mapa$/], ['GET', /^informe$/], ['GET', /^lecciones$/], ['GET', /^agente\/\d+$/], ['POST', /^iniciar$/], ['POST', /^parar$/]];

function destino(dir) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'skills', 'trader', '_datos', 'trader.json'), 'utf8'));
    return { url: String(c.url || '').replace(/\/+$/, '') || 'http://127.0.0.1:8777', token: c.token || '' };
  } catch { return { url: 'http://127.0.0.1:8777', token: '' }; }
}

async function pedir(dir, metodo, partes, cuerpo, query = {}) {
  const ruta = partes.filter(Boolean).join('/') || 'mapa';
  if (!PERMITIDAS.some(([m, rx]) => m === metodo && rx.test(ruta))) { const e = new Error('ruta de trading no permitida'); e.status = 404; throw e; }
  const { url, token } = destino(dir);
  const qs = new URLSearchParams(query).toString();
  const r = await fetch(`${url}/api/enjambre/${ruta}${qs ? '?' + qs : ''}`, {
    method: metodo, signal: AbortSignal.timeout(20000),
    headers: { ...(cuerpo ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-token': token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).catch(e => { const x = new Error(`DMN Trader no responde en ${url} (${e.cause?.code || e.message})`); x.status = 502; throw x; });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `DMN Trader: HTTP ${r.status}`); e.status = r.status; throw e; }
  return { ...j, _central: url };
}

module.exports = { pedir, destino };
