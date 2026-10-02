// OAuth para el correo: "Conectar con Google" / "Conectar con Microsoft".
// Flujo de app de escritorio (RFC 8252): servidor de un solo uso en 127.0.0.1:<puerto>, PKCE, el navegador vuelve
// con un código, se cambia por tokens y se guarda SOLO el refresh token (cifrado). El email sale del id_token.
const http = require('http');
const crypto = require('crypto');

const PROVEEDORES = {
  google: {
    nombre: 'Gmail', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    escopos: 'openid email https://mail.google.com/', extra: { access_type: 'offline', prompt: 'consent' },
    imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    env: ['APOLO_GOOGLE_CLIENT_ID', 'APOLO_GOOGLE_CLIENT_SECRET'],
  },
  microsoft: {
    nombre: 'Outlook', auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    escopos: 'openid email offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send', extra: { prompt: 'select_account' },
    imap: { host: 'outlook.office365.com', port: 993, secure: true }, smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    env: ['APOLO_MS_CLIENT_ID', null],
  },
};
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const PAGINA = (ok, txt) => `<!doctype html><meta charset="utf-8"><title>APOLO</title><body style="background:#05070a;color:#e8f6ee;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:54px">${ok ? '✅' : '⚠️'}</div><h2 style="color:${ok ? '#3dff9a' : '#ff6b6b'}">${txt}</h2><p style="color:#9fb3a8">Ya puedes cerrar esta pestaña y volver a APOLO.</p></div>`;

function crearOAuth({ almacen, abrir, log = console.log }) {
  const flujos = new Map();                                  // id → { estado, email, error, cuentaId }
  const cache = new Map();                                   // id de cuenta → { token, vence }

  // credenciales de la app registrada (panel o variables de entorno)
  function cliente(p) {
    const cfg = almacen.config().oauth?.[p] || {}, P = PROVEEDORES[p];
    const id = cfg.clientId || process.env[P.env[0]] || '', secreto = cfg.clientSecret || (P.env[1] && process.env[P.env[1]]) || '';
    if (!id) throw new Error(`Falta registrar la app de ${P.nombre} (Panel → Correo y servicios → Credenciales OAuth; guía en docs/oauth.md).`);
    return { id, secreto };
  }
  const configurado = p => { try { cliente(p); return true; } catch { return false; } };

  async function postToken(p, datos) {
    const c = cliente(p);
    const r = await fetch(PROVEEDORES[p].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.id, ...(c.secreto ? { client_secret: c.secreto } : {}), ...datos }), signal: AbortSignal.timeout(20_000) });
    return r.json();
  }

  // paso 1: abre el navegador; cuando vuelve con el código, crea (o renueva) la cuenta. alTerminar(cuentaId)
  async function iniciar(p, { alTerminar, cuentaId } = {}) {
    const P = PROVEEDORES[p]; if (!P) throw new Error('proveedor desconocido');
    const c = cliente(p);
    const verificador = b64url(crypto.randomBytes(32)), reto = b64url(crypto.createHash('sha256').update(verificador).digest());
    const estadoAnti = b64url(crypto.randomBytes(16)), id = 'f_' + b64url(crypto.randomBytes(6));
    const flujo = { estado: 'esperando', proveedor: p }; flujos.set(id, flujo);

    const srv = http.createServer();
    await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
    const redirect = `http://127.0.0.1:${srv.address().port}/`;
    const cerrar = () => { try { srv.close(); } catch { } };
    const caduca = setTimeout(() => { if (flujo.estado === 'esperando') { flujo.estado = 'error'; flujo.error = 'tiempo agotado'; } cerrar(); }, 10 * 60_000);
    caduca.unref?.();

    srv.on('request', async (req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/' || (!u.searchParams.get('code') && !u.searchParams.get('error'))) { res.writeHead(404); return res.end(); }
      const fin = (ok, txt) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGINA(ok, txt)); clearTimeout(caduca); setTimeout(cerrar, 500); };
      if (u.searchParams.get('state') !== estadoAnti) { flujo.estado = 'error'; flujo.error = 'estado OAuth no coincide'; return fin(false, 'Algo no cuadra, inténtalo otra vez'); }
      if (u.searchParams.get('error')) { flujo.estado = 'error'; flujo.error = u.searchParams.get('error_description') || u.searchParams.get('error'); return fin(false, 'No se concedió el acceso'); }
      try {
        const t = await postToken(p, { grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: redirect, code_verifier: verificador });
        if (!t.refresh_token) throw new Error(t.error_description || t.error || 'no llegó el refresh token');
        const claims = JSON.parse(Buffer.from(String(t.id_token || '').split('.')[1] || 'e30', 'base64').toString('utf8'));
        const email = claims.email || claims.preferred_username || '';
        if (!email) throw new Error('no pude saber qué correo es');
        let cid = cuentaId || almacen.cuentas().find(x => x.email.toLowerCase() === email.toLowerCase())?.id;
        if (!cid) cid = almacen.agregarCuenta({ email, nombre: claims.name || '', proveedor: P.nombre, auth: 'oauth-' + p, avisos: true, imap: P.imap, smtp: P.smtp });
        else almacen.actualizar(cid, { auth: 'oauth-' + p, imap: P.imap, smtp: P.smtp });
        almacen.guardarSecreto(cid, t.refresh_token);
        cache.set(cid, { token: t.access_token, vence: Date.now() + ((t.expires_in || 3600) - 120) * 1000 });
        Object.assign(flujo, { estado: 'conectado', email, cuentaId: cid });
        fin(true, `${email} conectado`);
        alTerminar?.(cid);
      } catch (e) { flujo.estado = 'error'; flujo.error = e.message; log('[oauth]', p, e.message); fin(false, 'No se pudo conectar: ' + e.message); }
    });

    const url = P.auth + '?' + new URLSearchParams({ client_id: c.id, response_type: 'code', redirect_uri: redirect, scope: P.escopos,
      code_challenge: reto, code_challenge_method: 'S256', state: estadoAnti, ...P.extra });
    abrir(url);
    return { id, url };
  }
  const estado = id => flujos.get(id) || null;

  // token de acceso vigente para IMAP/SMTP (XOAUTH2); se renueva solo con el refresh token guardado
  async function token(c) {
    const k = cache.get(c.id);
    if (k && Date.now() < k.vence) return k.token;
    const p = String(c.auth).replace(/^oauth-/, '').replace(/^ms$/, 'microsoft');
    const refresh = almacen.secreto(c.id);
    if (!refresh) throw new Error(`${c.email}: hay que volver a conectar la cuenta`);
    const t = await postToken(p, { grant_type: 'refresh_token', refresh_token: refresh, ...(p === 'microsoft' ? { scope: PROVEEDORES.microsoft.escopos } : {}) });
    if (!t.access_token) throw new Error(`${c.email}: ${t.error_description || t.error || 'el proveedor rechazó la sesión'} — vuelve a conectar la cuenta`);
    if (t.refresh_token) almacen.guardarSecreto(c.id, t.refresh_token);
    cache.set(c.id, { token: t.access_token, vence: Date.now() + ((t.expires_in || 3600) - 120) * 1000 });
    return t.access_token;
  }
  return { iniciar, estado, token, configurado, PROVEEDORES };
}

module.exports = { crearOAuth, PROVEEDORES };
