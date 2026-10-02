// Conectores de APOLO: correo (varias cuentas), GitHub, Hugging Face y ElevenLabs.
// Registra sus herramientas en el núcleo, sirve /v1/conectores/* (panel) y avisa de correos nuevos.
const { crearAlmacen } = require('./almacen');
const { crearCorreo, preset } = require('./correo');
const { crearServicios } = require('./servicios');
const { crearOAuth } = require('./oauth');

const CADA_MS = 3 * 60_000;

function crearConectores({ dir, cifrar, descifrar, nucleo, abrir, alNuevoCorreo = () => { }, log = console.log }) {
  const almacen = crearAlmacen({ dir, cifrar, descifrar, log });
  const oauth = crearOAuth({ almacen, abrir, log });
  const correo = crearCorreo({ almacen, oauth, log });
  const servicios = crearServicios({ almacen });
  const errores = new Map();                                 // id de cuenta → último error al vigilar

  // al modelo solo se le ofrecen las herramientas de lo que está conectado
  for (const h of correo.herramientas) h.disponible = () => almacen.cuentas().length > 0;
  for (const h of servicios.herramientas) h.disponible = () => !!almacen.servicio(h.servicio)?.conectado;
  nucleo.registrarHerramientas([...correo.herramientas, ...servicios.herramientas]);

  const publicaCuenta = c => ({ id: c.id, email: c.email, nombre: c.nombre || '', proveedor: c.proveedor, auth: c.auth, avisos: c.avisos !== false,
    imap: c.imap, smtp: c.smtp, error: errores.get(c.id) || null });

  async function vigilar() {
    for (const c of almacen.cuentas()) {
      if (c.avisos === false || !almacen.secreto(c.id)) continue;
      try {
        const nuevos = await correo.nuevos(c);
        errores.delete(c.id);
        for (const m of nuevos) alNuevoCorreo(c, m);
      } catch (e) { errores.set(c.id, e.message); log('[correo]', c.email, e.message); }
    }
  }
  const t1 = setTimeout(() => vigilar().catch(() => { }), 20_000); t1.unref?.();
  const t2 = setInterval(() => vigilar().catch(() => { }), CADA_MS); t2.unref?.();

  // ---------- API para el panel: /v1/conectores/... (p = ['v1','conectores',...]) ----------
  async function http(M, p, cuerpo) {
    const [, , a, b, c] = p;
    if (!a && M === 'GET') return {
      cifrado: almacen.cifrado, oauth: { google: oauth.configurado('google'), microsoft: oauth.configurado('microsoft') }, presets: correo.PRESETS,
      cuentas: almacen.cuentas().map(publicaCuenta),
      servicios: Object.fromEntries(servicios.SERVICIOS.map(k => [k, { conectado: !!almacen.servicio(k)?.conectado, quien: almacen.servicio(k)?.quien || '' }])),
    };
    if (a === 'config' && M === 'PATCH') {                   // credenciales de las apps OAuth registradas (Google / Microsoft)
      const o = { ...(almacen.config().oauth || {}) };
      for (const p of ['google', 'microsoft']) {
        const v = cuerpo.oauth?.[p]; if (!v) continue;
        o[p] = { ...o[p], ...(v.clientId?.trim() ? { clientId: v.clientId.trim() } : {}), ...(v.clientSecret?.trim() ? { clientSecret: v.clientSecret.trim() } : {}) };
      }
      almacen.ponerConfig({ oauth: o }); return { ok: true };
    }
    if (a === 'oauth' && M === 'POST' && ['google', 'microsoft'].includes(b)) {          // "Conectar con Google/Microsoft"
      const f = await oauth.iniciar(b, { cuentaId: cuerpo.cuentaId, alTerminar: id => { errores.delete(id); setTimeout(() => vigilar().catch(() => { }), 3000); } });
      return { ok: true, ...f };
    }
    if (a === 'oauth' && b === 'flujo' && M === 'GET') return oauth.estado(c) || { estado: 'desconocido' };

    if (a === 'correo') {
      if (!b && M === 'POST') {                              // añadir cuenta
        const email = String(cuerpo.email || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('email no válido');
        if (almacen.cuentas().some(x => x.email.toLowerCase() === email.toLowerCase())) throw new Error('esa cuenta ya está conectada');
        const pr = preset(email);
        const dom = email.split('@')[1];
        const base = { email, nombre: cuerpo.nombre || '', proveedor: pr?.nombre || 'Otro', usuario: cuerpo.usuario || '', avisos: true,
          imap: cuerpo.imap?.host ? cuerpo.imap : pr?.imap || { host: 'imap.' + dom, port: 993, secure: true },
          smtp: cuerpo.smtp?.host ? cuerpo.smtp : pr?.smtp || { host: 'smtp.' + dom, port: 465, secure: true } };
        if (pr?.soloOAuth) throw new Error(`${pr.nombre}: usa el botón "Conectar con Microsoft"`);
        if (!cuerpo.password) throw new Error('falta la contraseña de aplicación');
        const id = almacen.agregarCuenta({ ...base, auth: 'password' });
        almacen.guardarSecreto(id, String(cuerpo.password).replace(/\s+/g, ''));
        try { const r = await correo.probar(almacen.cuentas().find(x => x.id === id)); return { ok: true, id, ...r }; }
        catch (e) { almacen.quitarCuenta(id); throw new Error(`no pude entrar: ${e.responseText || e.message}${pr?.ayuda ? ' · ' + pr.ayuda : ''}`); }
      }
      const cu = almacen.cuentas().find(x => x.id === b);
      if (!cu) throw new Error('cuenta no encontrada');
      if (M === 'GET') return publicaCuenta(cu);
      if (c === 'probar' && M === 'POST') return correo.probar(cu);
      if (c === 'reconectar' && M === 'POST') {
        const p = String(cu.auth).replace(/^oauth-/, ''); if (!['google', 'microsoft'].includes(p)) throw new Error('esta cuenta usa contraseña');
        return { ok: true, ...(await oauth.iniciar(p, { cuentaId: cu.id })) };
      }
      if (M === 'PATCH') { almacen.actualizar(cu.id, { ...(typeof cuerpo.avisos === 'boolean' ? { avisos: cuerpo.avisos } : {}), ...(typeof cuerpo.nombre === 'string' ? { nombre: cuerpo.nombre } : {}) }); return publicaCuenta(cu); }
      if (M === 'DELETE') { almacen.quitarCuenta(cu.id); errores.delete(cu.id); return { ok: true }; }
    }
    if (a === 'servicio' && servicios.SERVICIOS.includes(b)) {
      if (M === 'PUT') {
        const t = String(cuerpo.token || '').trim(); if (!t) throw new Error('falta el token');
        almacen.guardarSecreto('srv:' + b, t);
        try { const quien = await servicios.probar(b); almacen.ponerServicio(b, { conectado: true, quien }); return { ok: true, quien }; }
        catch (e) { almacen.ponerServicio(b, null); throw new Error(`el token no funciona: ${e.message}`); }
      }
      if (M === 'POST' && c === 'probar') return { ok: true, quien: await servicios.probar(b) };
      if (M === 'DELETE') { almacen.ponerServicio(b, null); return { ok: true }; }
    }
    const e = new Error('ruta'); e.status = 404; throw e;
  }

  return { http, almacen, correo, servicios, vigilar };
}

module.exports = { crearConectores };
