// HTTP para herramientas: DNS fijado a la conexion y cada salto vuelve a autorizarse.
const dns = require('dns').promises;
const net = require('net');
const seg = require('./seguridad');
async function destino(url, lookup = dns.lookup) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('URL http(s) sin credenciales requerida');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!ips.length) throw new Error('DNS sin direcciones');
  const privada = seg.urlPrivada(u.href) || ips.some(ip => seg.urlPrivada(`http://${ip.family === 6 ? '[' + ip.address + ']' : ip.address}/`));
  return { u, ip: ips[0], privada };
}
function descargar(d, init) {
  return new Promise((ok, mal) => {
    const cliente = require(d.u.protocol === 'https:' ? 'https' : 'http');
    const req = cliente.request(d.u, {
      method: init.method || 'GET', headers: init.headers, signal: init.signal, agent: false,
      lookup: (_host, options, cb) => options.all ? cb(null, [d.ip]) : cb(null, d.ip.address, d.ip.family),
    }, res => {
      let bytes = 0; const partes = [];
      res.on('data', p => { bytes += p.length; if (bytes > 5 * 1024 * 1024) res.destroy(new Error('respuesta supera 5 MiB')); else partes.push(p); });
      res.on('error', mal);
      res.on('end', () => { const texto = Buffer.concat(partes).toString('utf8'); ok({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: res.headers, text: async () => texto, json: async () => JSON.parse(texto) }); });
    });
    req.on('error', mal); req.setTimeout(30_000, () => req.destroy(new Error('tiempo de red agotado')));
    req.end(init.body);
  });
}
async function fetchSeguro(url, init = {}, { autorizar, lookup, request = descargar } = {}) {
  let actual = String(url), opciones = { ...init };
  for (let salto = 0; salto <= 5; salto++) {
    opciones.signal?.throwIfAborted();
    const d = await destino(actual, lookup);
    if (salto || d.privada) {
      if (!autorizar || !await autorizar(d.u.href, { privada: d.privada, metodo: opciones.method || 'GET', cuerpo: opciones.body })) throw new Error('DENEGADO: destino de red requiere permiso');
    }
    opciones.signal?.throwIfAborted();
    const r = await request(d, opciones);
    if (![301, 302, 303, 307, 308].includes(r.status) || !r.headers.location) return r;
    if (salto === 5) throw new Error('demasiadas redirecciones');
    const siguiente = new URL(r.headers.location, actual);
    if (d.u.protocol === 'https:' && siguiente.protocol !== 'https:') throw new Error('redireccion HTTPS a HTTP bloqueada');
    if (r.status === 303 || ([301, 302].includes(r.status) && opciones.method === 'POST')) opciones = { ...opciones, method: 'GET', body: undefined };
    if (siguiente.origin !== d.u.origin) {
      const headers = { ...opciones.headers };
      for (const k of Object.keys(headers)) if (/^(authorization|cookie|proxy-authorization|host)$/i.test(k)) delete headers[k];
      opciones = { ...opciones, headers };
    }
    actual = siguiente.href;
  }
}
module.exports = { fetchSeguro, destino };
