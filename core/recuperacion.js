function clasificar(e) {
  const status = +e.status || +(String(e.message).match(/HTTP\s+(\d{3})/) || [])[1];
  const imagen = [400, 415, 422].includes(status) && /image|vision|imagen|multimodal/i.test(e.message) && /not support|unsupported|no.*admit|no.*soport|not accept/i.test(e.message);
  return { status, imagen, temporal: [408, 429, 500, 502, 503, 504].includes(status) || /ECONNRESET|ETIMEDOUT|ECONNREFUSED/.test(e.code || e.cause?.code || '') };
}
function esperar(ms, signal) {
  return new Promise((ok, mal) => {
    if (signal?.aborted) return mal(signal.reason || new Error('cancelado'));
    const limpiar = () => signal?.removeEventListener('abort', abortar);
    const t = setTimeout(() => { limpiar(); ok(); }, ms);
    const abortar = () => { clearTimeout(t); limpiar(); mal(signal.reason || new Error('cancelado')); };
    signal?.addEventListener('abort', abortar, { once: true });
  });
}
async function recuperar(fn, { signal, cfg = {}, aviso = () => {}, dormir = esperar } = {}) {
  const max = Math.max(0, Math.min(cfg.reintentos ?? 2, 5));
  for (let n = 0;; n++) {
    signal?.throwIfAborted();
    try { return await fn(n); }
    catch (e) {
      if (signal?.aborted || !clasificar(e).temporal || n >= max) throw e;
      const ms = Math.max(Number(e.retryAfterMs) || 0, (cfg.esperaMs ?? 300) * 2 ** n);
      if (ms > (cfg.maxEsperaMs ?? 60000)) throw e;
      aviso({ intento: n + 1, esperaMs: ms, status: clasificar(e).status });
      await dormir(ms, signal);
    }
  }
}
function cancelable(p, signal) {
  return new Promise((ok, mal) => {
    const abortar = () => mal(signal.reason || new Error('cancelado'));
    if (signal?.aborted) { Promise.resolve(p).catch(() => {}); return abortar(); }
    signal?.addEventListener('abort', abortar, { once: true });
    Promise.resolve(p).then(ok, mal).finally(() => signal?.removeEventListener('abort', abortar));
  });
}
module.exports = { recuperar, clasificar, esperar, cancelable };
