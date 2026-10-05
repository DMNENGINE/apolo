// MCP remoto con OAuth (core/mcp-remoto.js): descubrimiento, registro dinámico, PKCE, token, initialize/tools/list/tools/call
// (con imagen y respuesta SSE), renovación con el refresh token y 429 con Retry-After. Servidor OAuth+MCP falso.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { crearMcpRemotos } = require('../mcp-remoto');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function servidorFalso() {
  const s = { codigos: new Map(), tokens: new Set(), refrescos: 0, llamadas: [], limitado: 1, registrados: [] };
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d);
    req.on('end', () => {
      const base = `http://127.0.0.1:${srv.address().port}`, u = new URL(req.url, base);
      const json = (o, code = 200, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/.well-known/oauth-protected-resource/mcp') return json({ resource: base + '/mcp', authorization_servers: [base + '/auth'], scopes_supported: ['openid'] });
      if (u.pathname === '/auth/.well-known/oauth-authorization-server') return json({ authorization_endpoint: base + '/auth/authorize', token_endpoint: base + '/auth/token', registration_endpoint: base + '/auth/register' });
      if (u.pathname === '/auth/register') { const r = JSON.parse(b); s.registrados.push(r); return json({ client_id: 'cli_' + s.registrados.length, redirect_uris: r.redirect_uris }, 201); }
      if (u.pathname === '/auth/token') {
        const p = new URLSearchParams(b);
        if (p.get('grant_type') === 'authorization_code') {
          const c = s.codigos.get(p.get('code'));
          const reto = crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url');
          if (!c || c !== reto || p.get('resource') !== base + '/mcp') return json({ error: 'invalid_grant' }, 400);
        } else if (p.get('grant_type') === 'refresh_token') { if (p.get('refresh_token') !== 'r1') return json({ error: 'invalid_grant' }, 400); s.refrescos++; }
        const t = 'tok' + crypto.randomBytes(4).toString('hex'); s.tokens.add(t);
        return json({ access_token: t, refresh_token: 'r1', expires_in: 3600 });
      }
      if (u.pathname === '/mcp') {
        const tok = String(req.headers.authorization || '').replace('Bearer ', '');
        if (!s.tokens.has(tok)) return json({ error: 'unauthorized' }, 401);
        const m = JSON.parse(b); s.llamadas.push(m.method);
        if (m.method === 'initialize') return json({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }, 200, { 'mcp-session-id': 'ses1' });
        if (!m.id) { res.writeHead(202); return res.end(); }
        if (req.headers['mcp-session-id'] !== 'ses1') return json({ error: 'sin sesión' }, 400);
        if (m.method === 'tools/list') return json({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'search_screens', description: 'Busca pantallas', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }] } });
        if (m.method === 'tools/call') {
          if (s.limitado-- > 0) { res.writeHead(429, { 'retry-after': '0' }); return res.end(); }
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `3 pantallas de "${m.params.arguments.query}"` }, { type: 'image', mimeType: 'image/png', data: PNG.toString('base64') }] } })}\n\n`);
        }
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ s, srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

test('MCP remoto: OAuth (DCR + PKCE), herramientas registradas, llamada con imagen, renovación y 429', async () => {
  const { s, srv, base } = await servidorFalso();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpr-'));
  const secretos = new Map();
  const cfg = { dir, boveda: { leer: k => secretos.get(k) ?? null, guardar: (k, v) => secretos.set(k, v), borrar: k => secretos.delete(k) } };
  const reg = new Map();
  // "navegador": sigue la URL de autorización, el servidor da el código y vuelve al 127.0.0.1 de APOLO
  const abrir = async url => {
    const u = new URL(url);
    assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
    const code = 'c' + crypto.randomBytes(3).toString('hex'); s.codigos.set(code, u.searchParams.get('code_challenge'));
    await fetch(`${u.searchParams.get('redirect_uri')}?code=${code}&state=${u.searchParams.get('state')}`);
  };
  const m = crearMcpRemotos({ cfg, registrar: hs => hs.forEach(h => reg.set(h.nombre, h)), quitar: ns => [].concat(ns).forEach(n => reg.delete(n)), abrir });
  try {
    await assert.rejects(m.conectar('prueba'), /servidor desconocido/);
    const { flujo } = await m.conectar('prueba', { url: base + '/mcp', nombre: 'Prueba' });
    for (let i = 0; i < 100 && m.flujo(flujo).estado === 'esperando'; i++) await new Promise(ok => setTimeout(ok, 20));
    assert.deepStrictEqual(m.flujo(flujo), { estado: 'conectado', servidor: 'prueba', herramientas: ['search_screens'] });
    assert.strictEqual(secretos.get('mcp:prueba:refresh'), 'r1');
    assert.match(s.registrados[0].redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const h = reg.get('prueba_search_screens');
    assert.ok(h && h.disponible());
    const r = await h.ejecutar({ query: 'onboarding banco' });
    assert.match(r.texto, /3 pantallas de "onboarding banco"/);
    assert.strictEqual(r.imagenes.length, 1);
    assert.deepStrictEqual(fs.readFileSync(r.imagenes[0].ruta), PNG);
    // otro proceso (reinicio de la app): sin token en memoria → usa el refresh de la bóveda; las herramientas salen del disco
    const reg2 = new Map();
    const m2 = crearMcpRemotos({ cfg, registrar: hs => hs.forEach(x => reg2.set(x.nombre, x)), quitar: ns => [].concat(ns).forEach(n => reg2.delete(n)), abrir: () => assert.fail('no debe abrir el navegador') });
    const r2 = await reg2.get('prueba_search_screens').ejecutar({ query: 'checkout' });
    assert.match(r2.texto, /checkout/);
    assert.strictEqual(s.refrescos, 1);
    assert.deepStrictEqual(m2.estado().find(x => x.id === 'prueba').conectado, true);
    m2.desconectar('prueba');
    assert.strictEqual(secretos.has('mcp:prueba:refresh'), false);
    assert.strictEqual(reg2.has('prueba_search_screens'), false);
    assert.ok(m2.estado().some(x => x.id === 'mobbin' && x.url === 'https://api.mobbin.com/mcp'));
  } finally { srv.close(); }
});
