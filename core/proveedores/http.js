// fetch con timeout y errores legibles (nunca muestra la API key).
async function pedir(url, { method = 'POST', headers = {}, body, signal, timeout = 300_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error('tiempo de espera agotado')), timeout);
  signal?.addEventListener('abort', () => ctl.abort(signal.reason), { once: true });
  try {
    const r = await fetch(url, {
      method, signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!r.ok) {
      const det = j?.error?.message || j?.error || j?.message || txt.slice(0, 300);
      throw new Error(`HTTP ${r.status} ${new URL(url).host}: ${typeof det === 'string' ? det : JSON.stringify(det)}`);
    }
    if (j === null) throw new Error(`respuesta no JSON de ${new URL(url).host}`);
    return j;
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') throw new Error(`no se pudo conectar a ${new URL(url).host} (¿está encendido?)`);
    throw e;
  } finally { clearTimeout(t); }
}
module.exports = { pedir };
