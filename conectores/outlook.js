// Outlook / Hotmail / Live: inicio de sesión de Microsoft con "código de dispositivo" (sin contraseñas en APOLO).
// Necesita el "Application (client) ID" de una app registrada en Azure (gratis, una vez): ver docs/outlook.md.
const TENANT = 'common';
const ESCOPOS = 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send';
const URL_MS = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;

function crearOutlook({ almacen, log = console.log }) {
  const enCurso = new Map();                                 // id de cuenta → { codigo, url, estado }
  const cache = new Map();                                   // id de cuenta → { token, vence }
  const clientId = () => {
    const id = almacen.config().msClientId || process.env.APOLO_MS_CLIENT_ID;
    if (!id) throw new Error('Para Outlook falta el "client ID" de Microsoft (Panel → Correo → Outlook: configurar).');
    return id;
  };
  const post = async (url, datos) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(datos), signal: AbortSignal.timeout(20_000) });
    return r.json();
  };

  // paso 1: pide un código; el usuario lo escribe en microsoft.com/devicelogin. El sondeo sigue en segundo plano.
  async function iniciar(cuentaId) {
    const d = await post(`${URL_MS}/devicecode`, { client_id: clientId(), scope: ESCOPOS });
    if (!d.device_code) throw new Error(d.error_description || d.error || 'Microsoft no dio un código');
    const info = { codigo: d.user_code, url: d.verification_uri, estado: 'esperando', mensaje: d.message };
    enCurso.set(cuentaId, info);
    (async () => {
      const fin = Date.now() + (d.expires_in || 900) * 1000;
      let paso = (d.interval || 5) * 1000;
      while (Date.now() < fin && enCurso.get(cuentaId) === info) {
        await new Promise(ok => setTimeout(ok, paso));
        const t = await post(`${URL_MS}/token`, { client_id: clientId(), grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code }).catch(e => ({ error: e.message }));
        if (t.access_token) {
          almacen.guardarSecreto(cuentaId, t.refresh_token);
          cache.set(cuentaId, { token: t.access_token, vence: Date.now() + (t.expires_in - 120) * 1000 });
          info.estado = 'conectado'; return;
        }
        if (t.error === 'slow_down') paso += 5000;
        else if (t.error && t.error !== 'authorization_pending') { info.estado = 'error'; info.mensaje = t.error_description || t.error; log('[outlook]', info.mensaje); return; }
      }
      if (info.estado === 'esperando') { info.estado = 'error'; info.mensaje = 'el código caducó'; }
    })();
    return info;
  }
  const estado = cuentaId => enCurso.get(cuentaId) || null;

  // token de acceso vigente (renueva con el refresh token guardado)
  async function token(c) {
    const k = cache.get(c.id);
    if (k && Date.now() < k.vence) return k.token;
    const refresh = almacen.secreto(c.id);
    if (!refresh) throw new Error(`${c.email}: falta iniciar sesión con Microsoft`);
    const t = await post(`${URL_MS}/token`, { client_id: clientId(), grant_type: 'refresh_token', refresh_token: refresh, scope: ESCOPOS });
    if (!t.access_token) throw new Error(`${c.email}: Microsoft rechazó la sesión (${t.error_description || t.error}). Vuelve a conectar la cuenta.`);
    if (t.refresh_token) almacen.guardarSecreto(c.id, t.refresh_token);
    cache.set(c.id, { token: t.access_token, vence: Date.now() + (t.expires_in - 120) * 1000 });
    return t.access_token;
  }
  return { iniciar, estado, token };
}

module.exports = { crearOutlook };
