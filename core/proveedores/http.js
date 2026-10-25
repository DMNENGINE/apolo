// fetch con timeout y errores legibles (nunca muestra la API key).
async function pedir(url, { method = 'POST', headers = {}, body, signal, timeout = 300_000, tipoStream, onDelta } = {}) {
  const ctl = new AbortController();
  const abortar = () => ctl.abort(signal.reason);
  const t = setTimeout(() => ctl.abort(new Error('tiempo de espera agotado')), timeout);
  if (signal?.aborted) abortar();
  signal?.addEventListener('abort', abortar, { once: true });
  try {
    const r = await fetch(url, {
      method, signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.ok && tipoStream && /text\/event-stream/i.test(r.headers.get('content-type') || '')) return await require('./streaming').leerStream(r, tipoStream, onDelta);
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!r.ok) {
      const det = j?.error?.message || j?.error || j?.message || txt.slice(0, 300);
      const error = new Error(require('../seguridad').redactar(`HTTP ${r.status} ${new URL(url).host}: ${typeof det === 'string' ? det : JSON.stringify(det)}`));
      error.status = r.status; error.tipo = j?.error?.type || j?.error?.code;
      const retry = r.headers.get('retry-after');
      error.retryAfterMs = retry ? (/^\d+(\.\d+)?$/.test(retry) ? +retry * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
      throw error;
    }
    if (j === null) throw new Error(`respuesta no JSON de ${new URL(url).host}`);
    return j;
  } catch (e) {
    if (ctl.signal.aborted && !signal?.aborted) throw Object.assign(new Error('tiempo de espera agotado'), { code: 'ETIMEDOUT', cause: e });
    if (e.cause?.code === 'ECONNREFUSED') throw Object.assign(new Error(`no se pudo conectar a ${new URL(url).host} (¿está encendido?)`), { code: 'ECONNREFUSED', cause: e });
    throw e;
  } finally { clearTimeout(t); signal?.removeEventListener('abort', abortar); }
}
module.exports = { pedir };
