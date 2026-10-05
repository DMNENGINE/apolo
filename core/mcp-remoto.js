// Servidores MCP remotos (Streamable HTTP + OAuth) como herramientas del agente: Mobbin hoy; Canva, Figma… mañana.
//  - OAuth según la especificación MCP: metadatos del recurso → servidor de autorización → registro dinámico (RFC 7591)
//    → PKCE S256 con redirección a 127.0.0.1 (RFC 8252) → refresh token cifrado en la bóveda. Sin claves que pegar.
//  - Cada herramienta del servidor se registra como `<id>_<herramienta>` (p. ej. mobbin_search_screens) con su esquema.
//    La lista se guarda en disco: tras reiniciar están disponibles sin red; se refresca al conectar o al usarlas.
//  - Las imágenes que devuelve (capturas de Mobbin) se guardan en <datos>/capturas/mcp (se borran a las 24 h, como las
//    demás capturas) y llegan al modelo como imágenes; lo que el robot "aprende" son notas, no las fotos.
// Config: <datos>/mcp-remotos.json  [{ id, nombre, url, activo, herramientas:[{name,description,inputSchema}], cliente:{client_id, redirect} }]
// Secretos (bóveda): mcp:<id>:refresh
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const CONOCIDOS = {
  mobbin: { nombre: 'Mobbin', url: 'https://api.mobbin.com/mcp', descripcion: 'Capturas reales de apps y webs (pantallas, flujos, secciones) como referencia de diseño. Plan Pro o superior.' },
};
const VERSION_MCP = '2025-06-18';
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const PAGINA = (ok, txt) => `<!doctype html><meta charset="utf-8"><title>APOLO</title><body style="background:#05070a;color:#e8f6ee;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:54px">${ok ? '✅' : '⚠️'}</div><h2 style="color:${ok ? '#3dff9a' : '#ff6b6b'}">${txt}</h2><p style="color:#9fb3a8">Ya puedes cerrar esta pestaña y volver a APOLO.</p></div>`;

function abrirNavegador(url) {
  const { spawn } = require('child_process');
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { }
}

function crearMcpRemotos({ cfg, registrar, quitar, abrir = abrirNavegador, fetch: fetchX = globalThis.fetch, log = () => { } }) {
  const dir = cfg.dir, F = path.join(dir, 'mcp-remotos.json');
  const boveda = cfg.boveda;
  let lista = []; try { lista = JSON.parse(fs.readFileSync(F, 'utf8')); } catch { }
  const guardar = () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(F, JSON.stringify(lista, null, 2)); };
  const obtener = id => lista.find(x => x.id === id);
  const vivos = new Map();           // id → { token, vence, sesion }
  const flujos = new Map();          // id de flujo → { estado, error, servidor }
  const secreto = id => `mcp:${id}:refresh`;

  const json = async (url, op = {}) => {
    const r = await fetchX(url, { ...op, signal: AbortSignal.timeout(op.timeout || 20_000) });
    const t = await r.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { texto: t }; }
    if (!r.ok) throw Object.assign(new Error(j.error_description || j.error?.message || j.error || j.message || `HTTP ${r.status}`), { status: r.status });
    return j;
  };

  // ── OAuth ──
  async function descubrir(s) {
    const u = new URL(s.url);
    let recurso;
    try { recurso = await json(`${u.origin}/.well-known/oauth-protected-resource${u.pathname}`); }
    catch { recurso = await json(`${u.origin}/.well-known/oauth-protected-resource`); }
    const as = String(recurso.authorization_servers?.[0] || u.origin).replace(/\/$/, '');
    let meta;
    try { meta = await json(`${as}/.well-known/oauth-authorization-server`); }
    catch { meta = await json(`${as}/.well-known/openid-configuration`); }
    return { recurso: recurso.resource || s.url, meta, escopos: recurso.scopes_supported || ['openid'] };
  }

  async function conectar(id, { url: urlNueva, nombre } = {}) {
    if (!/^[a-z0-9-]{1,30}$/.test(id)) throw new Error('id no válido');
    let s = obtener(id);
    if (!s) {
      const k = CONOCIDOS[id]; if (!k && !/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(urlNueva || '')) throw new Error(`servidor desconocido: ${id} (pasa su url https://…)`);
      s = { id, nombre: nombre || k?.nombre || id, url: k?.url || urlNueva, activo: true, herramientas: [] }; lista.push(s); guardar();
    }
    const { recurso, meta, escopos } = await descubrir(s);
    const srv = http.createServer();
    // el puerto de redirección queda registrado en el cliente: se reutiliza si está libre, si no se registra otro cliente
    const puertoGuardado = s.cliente?.redirect ? +new URL(s.cliente.redirect).port : 0;
    await new Promise(ok => { srv.once('error', () => srv.listen(0, '127.0.0.1', ok)); srv.listen(puertoGuardado, '127.0.0.1', ok); });
    const redirect = `http://127.0.0.1:${srv.address().port}/callback`;
    if (!s.cliente || s.cliente.redirect !== redirect || s.cliente.registro !== meta.registration_endpoint) {
      if (!meta.registration_endpoint) { srv.close(); throw new Error('el servidor no permite registro dinámico de clientes'); }
      const c = await json(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        client_name: 'APOLO', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
      }) });
      s.cliente = { client_id: c.client_id, redirect, registro: meta.registration_endpoint }; guardar();
    }
    const verificador = b64url(crypto.randomBytes(32)), reto = b64url(crypto.createHash('sha256').update(verificador).digest());
    const anti = b64url(crypto.randomBytes(16)), fid = 'f_' + b64url(crypto.randomBytes(6));
    const flujo = { estado: 'esperando', servidor: id }; flujos.set(fid, flujo);
    const cerrar = () => { try { srv.close(); } catch { } };
    const caduca = setTimeout(() => { if (flujo.estado === 'esperando') Object.assign(flujo, { estado: 'error', error: 'tiempo agotado' }); cerrar(); }, 10 * 60_000); caduca.unref?.();
    srv.on('request', async (req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
      const fin = (ok, txt) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGINA(ok, txt)); clearTimeout(caduca); setTimeout(cerrar, 500); };
      if (u.searchParams.get('state') !== anti) { Object.assign(flujo, { estado: 'error', error: 'estado OAuth no coincide' }); return fin(false, 'Algo no cuadra, inténtalo otra vez'); }
      if (u.searchParams.get('error')) { Object.assign(flujo, { estado: 'error', error: u.searchParams.get('error_description') || u.searchParams.get('error') }); return fin(false, 'No se concedió el acceso'); }
      try {
        const t = await json(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
          grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: redirect, client_id: s.cliente.client_id, code_verifier: verificador, resource: recurso,
        }) });
        if (!t.access_token) throw new Error('no llegó el token');
        if (t.refresh_token) boveda.guardar(secreto(id), t.refresh_token);
        vivos.set(id, { token: t.access_token, vence: Date.now() + ((t.expires_in || 3600) - 120) * 1000, meta, recurso });
        s.conectado = Date.now(); s.activo = true; guardar();
        await refrescarHerramientas(id);
        Object.assign(flujo, { estado: 'conectado', herramientas: s.herramientas.map(h => h.name) });
        fin(true, `${s.nombre} conectado`);
      } catch (e) { Object.assign(flujo, { estado: 'error', error: e.message }); log('[mcp]', id, e.message); fin(false, 'No se pudo conectar: ' + e.message); }
    });
    const url = meta.authorization_endpoint + '?' + new URLSearchParams({ client_id: s.cliente.client_id, response_type: 'code', redirect_uri: redirect,
      scope: escopos.join(' '), code_challenge: reto, code_challenge_method: 'S256', state: anti, resource: recurso });
    abrir(url);
    return { flujo: fid, url };
  }

  async function token(id) {
    const v = vivos.get(id);
    if (v && Date.now() < v.vence) return v.token;
    const s = obtener(id); const refresh = boveda.leer(secreto(id));
    if (!s?.cliente || !refresh) throw Object.assign(new Error(`${s?.nombre || id} no está conectado: conéctalo en el panel (Configuración → Servicios MCP) o con /conectar ${id}`), { status: 401 });
    const { meta, recurso } = v?.meta ? v : await descubrir(s);
    const t = await json(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refresh, client_id: s.cliente.client_id, resource: recurso,
    }) }).catch(e => { throw Object.assign(new Error(`${s.nombre}: la sesión caducó, vuelve a conectarlo (${e.message})`), { status: 401 }); });
    if (t.refresh_token) boveda.guardar(secreto(id), t.refresh_token);
    vivos.set(id, { ...(v || {}), token: t.access_token, vence: Date.now() + ((t.expires_in || 3600) - 120) * 1000, meta, recurso });
    return t.access_token;
  }

  // ── MCP (Streamable HTTP) ──
  let siguiente = 1;
  async function rpc(id, metodo, params, { notificacion = false, reintento = true } = {}) {
    const s = obtener(id), v = vivos.get(id) || {};
    const cab = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${await token(id)}`, 'mcp-protocol-version': VERSION_MCP };
    if (v.sesion) cab['mcp-session-id'] = v.sesion;
    const msg = { jsonrpc: '2.0', method: metodo, ...(params ? { params } : {}), ...(notificacion ? {} : { id: siguiente++ }) };
    let r;
    for (let i = 0; i < 3; i++) {
      r = await fetchX(s.url, { method: 'POST', headers: cab, body: JSON.stringify(msg), signal: AbortSignal.timeout(90_000) });
      if (r.status !== 429) break;
      const ra = r.headers.get('retry-after'); await new Promise(ok => setTimeout(ok, Math.min(30, ra !== null && !isNaN(+ra) ? +ra : 2 ** i * 2) * 1000));
    }
    if (r.status === 401 && reintento) { vivos.set(id, { ...v, vence: 0 }); return rpc(id, metodo, params, { notificacion, reintento: false }); }
    if (r.status === 404 && v.sesion && reintento) { vivos.set(id, { ...vivos.get(id), sesion: null }); await iniciarSesion(id); return rpc(id, metodo, params, { notificacion, reintento: false }); }
    const ses = r.headers.get('mcp-session-id'); if (ses) vivos.set(id, { ...vivos.get(id), sesion: ses });
    if (notificacion) return null;
    if (!r.ok) throw Object.assign(new Error(`${s.nombre}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`), { status: r.status });
    const tipo = r.headers.get('content-type') || '';
    let resp;
    if (tipo.includes('text/event-stream')) {
      const txt = await r.text();
      for (const bloque of txt.split(/\r?\n\r?\n/)) {
        const datos = bloque.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (!datos) continue;
        try { const j = JSON.parse(datos); if (j.id === msg.id) { resp = j; break; } } catch { }
      }
    } else resp = await r.json();
    if (!resp) throw new Error(`${s.nombre}: respuesta vacía`);
    if (resp.error) throw new Error(`${s.nombre}: ${resp.error.message || JSON.stringify(resp.error)}`);
    return resp.result;
  }
  async function iniciarSesion(id) {
    const v = vivos.get(id);
    if (v?.iniciada && v.sesion !== null) return;
    await rpc(id, 'initialize', { protocolVersion: VERSION_MCP, capabilities: {}, clientInfo: { name: 'APOLO', version: '1' } }, { reintento: false });
    await rpc(id, 'notifications/initialized', undefined, { notificacion: true }).catch(() => { });
    vivos.set(id, { ...vivos.get(id), iniciada: true });
  }

  async function refrescarHerramientas(id) {
    await iniciarSesion(id);
    const r = await rpc(id, 'tools/list', {});
    const s = obtener(id);
    s.herramientas = (r.tools || []).map(t => ({ name: t.name, description: String(t.description || '').slice(0, 1500), inputSchema: t.inputSchema || { type: 'object', properties: {} } }));
    guardar(); registrarDe(s);
    return s.herramientas;
  }

  // resultado MCP → { texto, imagenes } para el agente (las imágenes a disco: el agente manda solo las 2 últimas al modelo)
  function convertir(id, res) {
    const textos = [], imagenes = [];
    const dirImg = path.join(dir, 'capturas', 'mcp');
    for (const c of res.content || []) {
      if (c.type === 'text') textos.push(c.text);
      else if (c.type === 'image' && c.data) {
        fs.mkdirSync(dirImg, { recursive: true });
        const ext = /png/.test(c.mimeType) ? 'png' : /webp/.test(c.mimeType) ? 'webp' : 'jpg';
        const ruta = path.join(dirImg, `${id}-${Date.now()}-${imagenes.length}.${ext}`);
        fs.writeFileSync(ruta, Buffer.from(c.data, 'base64')); imagenes.push({ mime: c.mimeType || 'image/jpeg', ruta });
      } else if (c.type === 'resource' && c.resource?.text) textos.push(c.resource.text);
      else if (c.type === 'resource_link') textos.push(`${c.name || ''} ${c.uri}`);
    }
    if (res.structuredContent && !textos.length) textos.push(JSON.stringify(res.structuredContent).slice(0, 20_000));
    const texto = (res.isError ? '⚠ ' : '') + (textos.join('\n').slice(0, 30_000) || '(sin texto)') + (imagenes.length ? `\n(${imagenes.length} imagen(es) adjunta(s))` : '');
    return imagenes.length ? { texto, imagenes } : texto;
  }

  const nombreH = (id, n) => `${id}_${n}`.replace(/[^\w-]/g, '_').slice(0, 64);
  const registradas = new Map();      // id → [nombres]
  function registrarDe(s) {
    if (registradas.has(s.id)) quitar(registradas.get(s.id));
    if (!s.activo || !s.herramientas?.length) { registradas.delete(s.id); return; }
    const hs = s.herramientas.map(t => ({
      nombre: nombreH(s.id, t.name), riesgo: 'lectura', servicio: `mcp:${s.id}`,
      descripcion: `[${s.nombre}] ${t.description}`, parametros: t.inputSchema,
      resumen: a => String(a.query || a.q || a.search || Object.values(a || {})[0] || '').slice(0, 120),
      disponible: () => !!obtener(s.id)?.activo && !!boveda.leer(secreto(s.id)),
      ejecutar: async a => { await iniciarSesion(s.id); return convertir(s.id, await rpc(s.id, 'tools/call', { name: t.name, arguments: a || {} })); },
    }));
    registrar(hs); registradas.set(s.id, hs.map(h => h.nombre));
  }
  for (const s of lista) registrarDe(s);

  function desconectar(id) {
    const s = obtener(id); if (!s) return false;
    boveda.borrar(secreto(id)); vivos.delete(id); s.activo = false; delete s.conectado; guardar(); registrarDe(s);
    return true;
  }
  const estado = () => [...Object.entries(CONOCIDOS).filter(([k]) => !obtener(k)).map(([id, k]) => ({ id, nombre: k.nombre, url: k.url, descripcion: k.descripcion, conectado: false, herramientas: [] })),
    ...lista.map(s => ({ id: s.id, nombre: s.nombre, url: s.url, descripcion: CONOCIDOS[s.id]?.descripcion || '', conectado: !!(s.activo && boveda.leer(secreto(s.id))), desde: s.conectado || null, herramientas: (s.herramientas || []).map(h => h.name) }))];

  async function httpApi(M, p, b = {}) {     // /v1/mcp-remotos
    if (M === 'GET' && !p[2]) return { servidores: estado() };
    if (M === 'GET' && p[2] === 'flujo' && p[3]) return flujos.get(p[3]) || { estado: 'desconocido' };
    if (M === 'POST' && p[2] && p[3] === 'conectar') return conectar(p[2], b);
    if (M === 'POST' && p[2] && p[3] === 'desconectar') return { ok: desconectar(p[2]) };
    if (M === 'POST' && p[2] && p[3] === 'probar') return { herramientas: (await refrescarHerramientas(p[2])).map(h => h.name) };
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  // para otros módulos del núcleo (biblioteca de diseño…): llamar a una herramienta y recibir { texto, imagenes }
  async function llamar(id, nombre, args = {}) { await iniciarSesion(id); const r = convertir(id, await rpc(id, 'tools/call', { name: nombre, arguments: args })); return typeof r === 'string' ? { texto: r, imagenes: [] } : r; }
  const conectado = id => !!(obtener(id)?.activo && boveda.leer(secreto(id)));

  return { conectar, desconectar, estado, llamar, conectado, http: httpApi, token, rpc, refrescarHerramientas, flujo: fid => flujos.get(fid), CONOCIDOS };
}

module.exports = { crearMcpRemotos, CONOCIDOS };
