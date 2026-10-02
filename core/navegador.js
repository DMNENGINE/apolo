// Control del navegador del usuario a través de la extensión (extension/, Chrome/Edge/Brave MV3).
// La extensión hace "long-poll" a GET /v1/navegador/esperar y devuelve cada resultado a POST /v1/navegador/resultado/:id.
// Seguridad: permiso POR SITIO (dominio; admite "siempre"), sitios protegidos (bancos, gestores de contraseñas…) bloqueados,
// clics/envíos delicados preguntan uno a uno, nunca se leen ni se escriben campos de contraseña (eso lo garantiza la extensión).
const fs = require('fs');
const path = require('path');
const { DELICADAS, MENSAJERIA } = require('./escritorio/control');

const BLOQUEADOS = ['banco', '\\bbank', 'paypal', 'zelle', 'venmo', 'cash\\.app', 'wallet', 'binance', 'coinbase', 'metamask', 'kraken',
  '1password', 'bitwarden', 'keepass', 'lastpass', 'dashlane', 'passwords\\.google', 'accounts\\.google\\.com/.*(signin|password)'];
const ESPERA_MS = 20_000;             // lo que se retiene un long-poll sin órdenes
const VIVO_MS = 45_000;               // sin preguntar en este tiempo → extensión desconectada

function dominioDe(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

function crearNavegador({ cfg, bus, permisos, cancelarTurno }) {
  const cola = [];                    // órdenes sin entregar
  const enVuelo = new Map();          // id -> { ok, mal, t, sesion }
  let esperando = null;               // res del long-poll abierto
  let visto = 0, info = {};
  let n = 0;
  const ultimaSesion = { id: null };  // quién usó el navegador por última vez (para el botón "Detener" de la página)

  const conectado = () => Date.now() - visto < VIVO_MS;
  const protegido = (url, titulo = '') => {
    const lista = cfg.navegador?.bloqueados || BLOQUEADOS, txt = `${url} ${titulo}`;
    return lista.find(p => { try { return new RegExp(p, 'i').test(txt); } catch { return false; } }) || null;
  };

  function entregar() {
    if (!esperando || !cola.length) return;
    const res = esperando; esperando = null; clearTimeout(res._t);
    const lote = cola.splice(0, cola.length);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ordenes: lote }));
  }

  // ---------- lado de la extensión ----------
  // un solo navegador a la vez: el primero que conecta es el "dueño" hasta que deja de preguntar; los demás esperan sin órdenes
  let dueno = null;
  function esperar(req, res, datos = {}) {
    const inst = String(datos.instancia || datos.navegador || '?');
    if (dueno && inst !== dueno && conectado()) {
      const t = setTimeout(() => { try { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ordenes":[],"ocupado":true}'); } catch { } }, ESPERA_MS);
      t.unref?.(); res.on('close', () => clearTimeout(t));
      return;
    }
    dueno = inst;
    visto = Date.now(); info = { ...info, ...datos };
    if (esperando) { clearTimeout(esperando._t); try { esperando.writeHead(200, { 'content-type': 'application/json' }); esperando.end('{"ordenes":[]}'); } catch { } }
    esperando = res;
    res._t = setTimeout(() => { if (esperando === res) { esperando = null; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ordenes":[]}'); } visto = Date.now(); }, ESPERA_MS);
    res._t.unref?.();
    res.on('close', () => { if (esperando === res) { clearTimeout(res._t); esperando = null; } });
    entregar();
  }
  function resultado(id, r) {
    visto = Date.now();
    const p = enVuelo.get(id); if (!p) return false;
    enVuelo.delete(id); clearTimeout(p.t);
    r && r.ok ? p.ok(r.datos) : p.mal(new Error((r && r.error) || 'la extensión no pudo hacerlo'));
    return true;
  }
  function detener(motivo = 'el usuario pulsó Detener en la página') {
    if (ultimaSesion.id && cancelarTurno) cancelarTurno(ultimaSesion.id);
    bus.emit('evento', { tipo: 'aviso', sesion: ultimaSesion.id, texto: `Navegador: ${motivo}` });
    return !!ultimaSesion.id;
  }

  // ---------- lado del agente ----------
  function orden(op, args = {}, ms = 30_000) {
    if (!conectado()) return Promise.reject(new Error('la extensión del navegador no está conectada. Pide al usuario que la instale/abra Chrome (carpeta extension/ del robot) y pegue el token.'));
    const id = `n${Date.now().toString(36)}${(++n).toString(36)}`;
    return new Promise((ok, mal) => {
      const t = setTimeout(() => { enVuelo.delete(id); mal(new Error(`el navegador no respondió a "${op}" a tiempo`)); }, ms);
      enVuelo.set(id, { ok, mal, t });
      cola.push({ id, op, args }); entregar();
    });
  }

  async function permisoSitio(s, url, titulo) {
    const dom = dominioDe(url);
    const prot = protegido(url, titulo);
    if (prot) throw new Error(`"${dom}" es un sitio PROTEGIDO (coincide con "${prot}"): no lo uso. Pide al usuario que lo haga él.`);
    if (!dom) return;                                   // about:blank, nueva pestaña…
    if (!s._sitios) Object.defineProperty(s, '_sitios', { value: new Set(), enumerable: false });
    if (s._sitios.has(dom)) return;
    const h = { nombre: 'navegador', riesgo: 'navegador', resumen: () => `usar ${dom} en tu navegador (leer y actuar en la página)` };
    const p = await permisos.pedir({ h, args: { dominio: dom }, sesion: s });
    if (!p.ok) throw new Error(`DENEGADO: el usuario no permite usar ${dom}`);
    s._sitios.add(dom);
  }
  async function delicada(s, que) {
    const h = { nombre: 'navegador_delicada', riesgo: 'navegador', resumen: () => que, siemprePreguntar: () => 'acción delicada en el navegador' };
    const p = await permisos.pedir({ h, args: {}, sesion: s });
    if (!p.ok) throw new Error(`DENEGADO por el usuario: ${que}`);
  }

  // pestaña objetivo: la indicada, si no la última que usó esta sesión, si no la activa
  async function pestana(s, id) {
    const tabs = await orden('pestanas');
    const t = tabs.find(x => x.id === Number(id)) || (id == null && tabs.find(x => x.id === s._pestana)) || (id == null && tabs.find(x => x.activa));
    if (!t) throw new Error(id != null ? `no existe la pestaña ${id} (usa navegador_pestanas)` : 'no hay ninguna pestaña abierta');
    return t;
  }
  const recordar = (s, t) => { if (!('_pestana' in s)) Object.defineProperty(s, '_pestana', { value: t.id, writable: true, enumerable: false }); else s._pestana = t.id; ultimaSesion.id = s.id; };
  const elementos = new Map();       // `${sesion}:${pestana}` -> [{ref, texto}] (para detectar clics delicados)
  const textos = new Map();          // `${sesion}:${pestana}` -> texto de la última lectura (para comprobar si algo cambió)
  const lineas = t => new Set(String(t || '').split(/\n+/).map(x => x.trim()).filter(x => x.length > 2));
  const listaElementos = els => els.map(e => `[${e.ref}] ${e.tipo}${e.texto ? ` "${e.texto}"` : ''}${e.extra ? ` (${e.extra})` : ''}`);

  // tras actuar (clic, enviar, subir) espera un poco, vuelve a leer y dice QUÉ cambió: el modelo no puede dar por hecho
  // algo que no ha visto (antes decía "ya aprobé los créditos" sin mirar y el botón seguía ahí)
  async function comprobar(s, t, { urlAntes, quien }) {
    const clave = `${s.id}:${t.id}`, antes = textos.get(clave), elsAntes = elementos.get(clave) || [];
    await new Promise(r => setTimeout(r, Number(cfg.navegador?.comprobarMs) || 1800));
    let r;
    try { r = await orden('leer', { pestana: t.id, max: 4000 }); }
    catch (e) { return `\nCOMPROBACIÓN: no pude volver a leer la página (${e.message}). NO digas que se hizo hasta verlo con navegador_leer.`; }
    elementos.set(clave, r.elementos); textos.set(clave, r.texto);
    const viejas = lineas(antes), nuevas = [...lineas(r.texto)].filter(x => !viejas.has(x));
    const fuera = antes == null ? [] : [...viejas].filter(x => !lineas(r.texto).has(x));
    const sigue = quien && r.elementos.some(e => (e.texto || '') === quien) && elsAntes.some(e => (e.texto || '') === quien);
    const cambioUrl = urlAntes && r.url !== urlAntes;
    const nada = antes != null && !cambioUrl && !nuevas.length && !fuera.length;
    const cab = nada
      ? `⚠ COMPROBACIÓN: la página NO cambió nada${sigue ? ` y "${quien}" sigue ahí` : ''}. Lo más probable es que NO haya funcionado. NO le digas al usuario que está hecho: reintenta, mira con navegador_captura o pregúntale.`
      : `COMPROBACIÓN (${((Number(cfg.navegador?.comprobarMs) || 1800) / 1000).toFixed(1)} s después):${cambioUrl ? ` la dirección cambió a ${r.url}.` : ''}` +
        (nuevas.length ? `\nTEXTO NUEVO: ${nuevas.slice(0, 10).join(' · ').slice(0, 900)}` : '') +
        (fuera.length ? `\nYA NO ESTÁ: ${fuera.slice(0, 6).join(' · ').slice(0, 400)}` : '') +
        (sigue ? `\nOJO: "${quien}" sigue en la página; puede que el clic no hiciera efecto.` : '') +
        '\nCuenta al usuario solo lo que se ve aquí; si algo se está generando, usa navegador_esperar hasta verlo terminado.';
    return `\n${cab}\n\nELEMENTOS AHORA (los números cambiaron, usa estos):\n${listaElementos(r.elementos).join('\n')}`;
  }

  const acciones = {
    async pestanas(s) {
      const tabs = await orden('pestanas');
      return tabs.map(t => `${t.id}${t.activa ? ' (activa)' : ''}${t.delAgente ? ' [tuya]' : ''} · ${t.titulo} · ${t.url}`).join('\n') || '(sin pestañas)';
    },
    async abrir(s, a) {
      let url = String(a.url || '').trim();
      if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
      if (!/^https?:/i.test(url)) throw new Error('solo abro direcciones http(s)');
      await permisoSitio(s, url, '');
      const t = await orden('abrir', { url, pestana: a.nueva === false ? (s._pestana ?? null) : null, grupo: cfg.nombreGrupo || null }, 45_000);
      recordar(s, t);
      return `Abierta en la pestaña ${t.id}: ${t.titulo} · ${t.url}\nUsa navegador_leer para ver su contenido.`;
    },
    async leer(s, a) {
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      const r = await orden('leer', { pestana: t.id, max: Math.min(Number(a.max) || 8000, 20000) });
      recordar(s, t); elementos.set(`${s.id}:${t.id}`, r.elementos); textos.set(`${s.id}:${t.id}`, r.texto);
      return [`PESTAÑA ${t.id} · ${r.titulo} · ${r.url}`, '', 'ELEMENTOS (usa el número en navegador_clic / navegador_escribir):',
        ...listaElementos(r.elementos),
        ...(r.imagenes ? ['', `IMÁGENES GRANDES EN LA PÁGINA: ${r.imagenes.length ? r.imagenes.join(' · ') : 'ninguna'}`] : []),
        '', 'TEXTO DE LA PÁGINA:', r.texto].join('\n');
    },
    async captura(s, a) {
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      const r = await orden('captura', { pestana: t.id });
      recordar(s, t);
      const dir = path.join(cfg.dir, 'capturas'); fs.mkdirSync(dir, { recursive: true });
      const ruta = path.join(dir, `nav-${Date.now()}.jpg`);
      fs.writeFileSync(ruta, Buffer.from(String(r.imagen).replace(/^data:[^,]+,/, ''), 'base64'));
      return { texto: `Captura de la pestaña ${t.id} (${t.titulo}). Para actuar usa los números de navegador_leer.`, imagenes: [{ mime: 'image/jpeg', ruta }] };
    },
    async clic(s, a) {
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      const e = (elementos.get(`${s.id}:${t.id}`) || []).find(x => x.ref === Number(a.ref));
      if (e && DELICADAS.test(e.texto || '')) await delicada(s, `clic en "${e.texto}" en ${dominioDe(t.url)}`);
      const r = await orden('clic', { pestana: t.id, ref: Number(a.ref) });
      recordar(s, t);
      return `Clic en [${a.ref}] ${r.texto || ''}${r.diag ? ` [${r.diag}]` : ''}.` + await comprobar(s, t, { urlAntes: t.url, quien: e && e.texto });
    },
    async escribir(s, a) {
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      if (a.enviar && MENSAJERIA.test(`${t.url} ${t.titulo}`)) await delicada(s, `escribir y ENVIAR "${String(a.texto).slice(0, 80)}" en ${dominioDe(t.url)}`);
      const r = await orden('escribir', { pestana: t.id, ref: Number(a.ref), texto: String(a.texto ?? ''), enviar: !!a.enviar, borrar: a.borrar !== false });
      recordar(s, t);
      return `Escrito en [${a.ref}] ${r.texto || ''}${a.enviar ? ' y pulsado Enter' : ''}.` + (a.enviar ? await comprobar(s, t, { urlAntes: t.url }) : '');
    },
    async scroll(s, a) {
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      const r = await orden('scroll', { pestana: t.id, cantidad: Number(a.cantidad) || 1 });
      recordar(s, t);
      return `Desplazado. Posición ${r.y}/${r.alto} px.`;
    },
    async esperar(s, a) {                              // las páginas que generan (IA, cargas lentas): esperar y volver a leer
      const seg = Math.max(1, Math.min(Number(a.segundos) || 10, 60));
      await new Promise(r => setTimeout(r, seg * 1000));
      return `(esperé ${seg} s)
` + await acciones.leer(s, a);
    },
    async descargar(s, a) {
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      const n = Number(String(a.imagen ?? '').replace(/\D/g, ''));
      if (!n) throw new Error('indica "imagen": el número imgN que da navegador_leer');
      const r = await orden('descargar', { pestana: t.id, img: n }, 60_000);
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[String(r.mime).split(';')[0]] || '.png';
      const dir = cfg.navegador?.descargas || path.join(require('os').homedir(), 'Downloads');
      fs.mkdirSync(dir, { recursive: true });
      const base = String(a.nombre || `imagen-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`).replace(/[\\/:*?"<>|]+/g, '-').replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 80);
      const ruta = path.join(dir, base + ext);
      fs.writeFileSync(ruta, Buffer.from(r.base64, 'base64'));
      recordar(s, t);
      return `Imagen guardada en ${ruta} (${Math.round(fs.statSync(ruta).size / 1024)} KB). Para subirla a otra web usa navegador_subir con esa ruta.`;
    },
    async subir(s, a) {
      const ruta = path.resolve(s.cwd || require('os').homedir(), String(a.ruta || ''));
      if (!fs.existsSync(ruta) || !fs.statSync(ruta).isFile()) throw new Error(`no existe el archivo ${ruta}`);
      const tam = fs.statSync(ruta).size;
      if (tam > 25 * 1024 * 1024) throw new Error('el archivo pasa de 25 MB');
      const t = await pestana(s, a.pestana);
      await permisoSitio(s, t.url, t.titulo);
      await delicada(s, `subir tu archivo "${path.basename(ruta)}" (${Math.round(tam / 1024)} KB) a ${dominioDe(t.url)}`);
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.pdf': 'application/pdf' }[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
      const r = await orden('subir', { pestana: t.id, ref: Number(a.ref), nombre: path.basename(ruta), mime, datos: fs.readFileSync(ruta).toString('base64') }, 60_000);
      recordar(s, t);
      return `${r.texto}.` + await comprobar(s, t, { urlAntes: t.url });
    },
    async volver(s, a) {
      const t = await pestana(s, a.pestana);
      const r = await orden('volver', { pestana: t.id });
      recordar(s, t);
      return `Atrás: ${r.titulo} · ${r.url}`;
    },
  };

  return {
    esperar, resultado, detener,
    estado: () => ({ conectado: conectado(), ...info, pendientes: enVuelo.size }),
    accion: (s, op, a) => acciones[op](s, a || {}),
    dominioDe, protegido,
  };
}

module.exports = { crearNavegador, dominioDe };
