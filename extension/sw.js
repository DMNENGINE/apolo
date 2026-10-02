// Extensión del robot: conecta este navegador con el núcleo (http://127.0.0.1:47900) por long-poll.
// El núcleo decide y pide los permisos (por sitio, acciones delicadas); aquí solo se ejecutan las órdenes.
// Nunca se lee ni se escribe un campo de contraseña o de tarjeta.
const VERSION = chrome.runtime.getManifest().version;
const NAV = (navigator.userAgentData?.brands || []).map(b => b.brand).find(b => !/not|chromium/i.test(b)) || 'Chrome';
const dormir = ms => new Promise(r => setTimeout(r, ms));
const leerCfg = () => chrome.storage.local.get({ puerto: 47900, token: '', activo: true });
let corriendo = false, ultimoEstado = '', nombre = 'Robot', instancia = '';

async function ponerEstado(e) {
  if (e === ultimoEstado) return;
  ultimoEstado = e;
  await chrome.storage.session.set({ estado: e, desde: Date.now() });
  const badge = { conectado: '', ocupado: '2º', apagado: 'off', 'sin-token': '!', token: '!', 'sin-robot': '…', error: '!' }[e] ?? '';
  chrome.action.setBadgeText({ text: badge });
  chrome.action.setBadgeBackgroundColor({ color: e === 'apagado' ? '#555' : '#d33' });
}
const api = (c, ruta, op = {}) => fetch(`http://127.0.0.1:${c.puerto}/v1/navegador/${ruta}`, {
  ...op, headers: { 'x-robot-token': c.token, 'x-cliente': 'navegador', 'x-instancia': instancia, 'x-navegador': NAV, 'x-version': VERSION, 'content-type': 'application/json', ...(op.headers || {}) },
});

// ---------- bucle principal (cada vuelta llama a chrome.storage: eso mantiene vivo el service worker) ----------
async function bucle() {
  if (corriendo) return;
  corriendo = true;
  try {
    let vueltas = 0;
    for (;;) {
      const c = await leerCfg();
      if (!instancia) { instancia = (await chrome.storage.local.get('instancia')).instancia || crypto.randomUUID(); chrome.storage.local.set({ instancia }); }
      if (!c.activo) { await ponerEstado('apagado'); return; }
      if (!c.token) { await ponerEstado('sin-token'); return; }
      let r;
      try { r = await api(c, 'esperar', { signal: AbortSignal.timeout(30_000) }); }
      catch { await ponerEstado('sin-robot'); await dormir(4000); continue; }
      if (r.status === 401) { await ponerEstado('token'); return; }
      if (!r.ok) { await ponerEstado('error'); await dormir(4000); continue; }
      const j = await r.json().catch(() => ({}));
      await ponerEstado(j.ocupado ? 'ocupado' : 'conectado');
      if (vueltas++ % 15 === 0) api(c, 'nombre').then(x => x.json()).then(j => { nombre = j.nombre || 'Robot'; }).catch(() => { });
      const ordenes = j.ordenes || [];
      for (const o of ordenes) ejecutar(o, c);
    }
  } finally { corriendo = false; }
}

async function ejecutar(o, c) {
  let r;
  try { r = { ok: true, datos: await OPS[o.op](o.args || {}) }; }
  catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
  await api(c, `resultado/${o.id}`, { method: 'POST', body: JSON.stringify(r) }).catch(() => { });
}

// ---------- utilidades de pestañas ----------
function esperarCarga(id, ms = 15_000) {
  return new Promise(ok => {
    let hecho = false;
    const fin = () => { if (hecho) return; hecho = true; chrome.tabs.onUpdated.removeListener(oir); clearTimeout(t); setTimeout(ok, 250); };
    const oir = (tid, info) => { if (tid === id && info.status === 'complete') fin(); };
    const t = setTimeout(fin, ms);
    chrome.tabs.onUpdated.addListener(oir);
    chrome.tabs.get(id).then(tab => { if (tab.status === 'complete') fin(); }).catch(fin);
  });
}
async function enPagina(id, func, args = []) {
  let res;
  try { [res] = await chrome.scripting.executeScript({ target: { tabId: id }, func, args }); }
  catch (e) { throw new Error(/cannot be scripted|chrome:\/\/|webstore|extensions gallery|Cannot access/i.test(e.message) ? 'esa página es interna del navegador y no se puede usar' : e.message); }
  const v = res && res.result;
  if (v && v.error) throw new Error(v.error);
  return v;
}
const marcar = id => enPagina(id, marcarPagina, [nombre]).catch(() => { });
async function grupoDelAgente() {
  const { grupo } = await chrome.storage.session.get('grupo');
  if (grupo != null) { try { await chrome.tabGroups.get(grupo); return grupo; } catch { } }
  return null;
}
async function meterEnGrupo(tabId) {
  try {
    let g = await grupoDelAgente();
    g = await chrome.tabs.group(g != null ? { tabIds: [tabId], groupId: g } : { tabIds: [tabId] });
    await chrome.tabGroups.update(g, { title: nombre, color: 'cyan' });
    await chrome.storage.session.set({ grupo: g });
  } catch { }
}

// ---------- clics y teclas REALES (chrome.debugger → isTrusted=true): muchas webs ignoran los eventos simulados ----------
// Chrome enseña la barra "… está depurando este navegador" mientras está enganchado; se suelta a los 20 s sin actividad.
const enganchadas = new Map();        // tabId -> temporizador de soltar
chrome.debugger.onDetach.addListener(({ tabId }) => { clearTimeout(enganchadas.get(tabId)); enganchadas.delete(tabId); });
async function real(tabId) {
  const enganchar = () => chrome.debugger.attach({ tabId }, '1.3').catch(e => { if (!/already attached/i.test(e.message)) throw e; });
  if (!enganchadas.has(tabId)) await enganchar();
  clearTimeout(enganchadas.get(tabId));
  enganchadas.set(tabId, setTimeout(() => { enganchadas.delete(tabId); chrome.debugger.detach({ tabId }).catch(() => { }); }, 20_000));
  // Chrome puede soltarlo por su cuenta (navegación, otra extensión…): se vuelve a enganchar y se reintenta una vez
  return async (method, params = {}) => {
    try { return await chrome.debugger.sendCommand({ tabId }, method, params); }
    catch (e) { if (!/not attached/i.test(e.message)) throw e; await enganchar(); return chrome.debugger.sendCommand({ tabId }, method, params); }
  };
}
async function clicReal(tabId, x, y) {
  const cdp = await real(tabId);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await dormir(40);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
async function teclaReal(tabId, key, code, vk, extra = {}) {
  const cdp = await real(tabId);
  await cdp('Input.dispatchKeyEvent', { type: extra.text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, ...extra });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: extra.modifiers || 0 });
}

const OPS = {
  async pestanas() {
    const [act] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const g = await grupoDelAgente();
    return (await chrome.tabs.query({})).map(t => ({ id: t.id, titulo: t.title || '', url: t.url || t.pendingUrl || '', activa: !!act && t.id === act.id, delAgente: g != null && t.groupId === g }));
  },
  async abrir({ url, pestana }) {
    const t = pestana != null ? await chrome.tabs.update(pestana, { url, active: true }) : await chrome.tabs.create({ url, active: true });
    if (pestana == null) await meterEnGrupo(t.id);
    await esperarCarga(t.id);
    const f = await chrome.tabs.get(t.id); marcar(f.id);
    return { id: f.id, titulo: f.title || '', url: f.url || url };
  },
  async leer({ pestana, max }) {
    await esperarCarga(pestana, 8000); marcar(pestana);
    return enPagina(pestana, leerPagina, [max || 8000]);
  },
  async captura({ pestana }) {
    const t = await chrome.tabs.update(pestana, { active: true });
    await esperarCarga(pestana, 8000); await dormir(350);
    return { imagen: await chrome.tabs.captureVisibleTab(t.windowId, { format: 'jpeg', quality: 70 }) };
  },
  async clic({ pestana, ref }) {
    const antes = (await chrome.tabs.get(pestana)).url;
    marcar(pestana);
    let r;
    try {                                                   // clic real; si no se puede enganchar (DevTools abierto…), el simulado
      const p = await enPagina(pestana, puntoRef, [ref]);
      if (p.tapado) throw new Error(`el elemento [${ref}] está tapado por "${p.tapado}" (cierra ese menú/ventana antes)`);
      await clicReal(pestana, p.x, p.y);
      const z = await chrome.tabs.getZoom(pestana).catch(() => 0);
      r = { texto: p.texto, diag: `real en ${p.x},${p.y} · viewport ${p.vw}x${p.vh} · zoom ${z} · dpr ${p.dpr}` };
    } catch (e) { if (/no encuentro|protegido|tapado/.test(e.message)) throw e; r = { ...await enPagina(pestana, clicRef, [ref]), diag: `simulado (el real falló: ${e.message})` }; }
    await dormir(700);
    const t = await chrome.tabs.get(pestana);
    if (t.status === 'loading') await esperarCarga(pestana);
    const ahora = (await chrome.tabs.get(pestana)).url;
    return { ...r, navego: ahora !== antes, url: ahora };
  },
  async escribir({ pestana, ref, texto, enviar, borrar }) {
    marcar(pestana);
    let r;
    try {                                                   // tecleo real: clic en el campo, (Ctrl+A) e insertar texto, Enter
      const p = await enPagina(pestana, puntoRef, [ref, true]);
      if (p.select) throw new Error('select');
      await clicReal(pestana, p.x, p.y); await dormir(80);
      if (borrar !== false) await teclaReal(pestana, 'a', 'KeyA', 65, { modifiers: 2, commands: ['selectAll'] });
      const cdp = await real(pestana);
      if (texto) await cdp('Input.insertText', { text: texto });
      if (enviar) { await dormir(150); await teclaReal(pestana, 'Enter', 'Enter', 13, { text: '\r' }); }
      r = { texto: p.texto, real: true };
    } catch (e) { if (/no encuentro|protegido/.test(e.message)) throw e; r = await enPagina(pestana, escribirRef, [ref, texto, !!enviar, borrar !== false]); }
    if (enviar) { await dormir(600); const t = await chrome.tabs.get(pestana); if (t.status === 'loading') await esperarCarga(pestana); }
    return r;
  },
  async descargar({ pestana, img }) {
    const r = await enPagina(pestana, fuenteImagen, [img]);
    if (r.dataUrl) { const [cab, datos] = r.dataUrl.split(','); return { mime: (cab.match(/data:([^;]+)/) || [])[1] || 'image/png', base64: datos, url: r.src || '' }; }
    const resp = await fetch(r.src, { credentials: 'include' });
    if (!resp.ok) throw new Error(`no pude bajar la imagen (${resp.status})`);
    const buf = new Uint8Array(await resp.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { mime: resp.headers.get('content-type') || 'image/png', base64: btoa(bin), url: r.src };
  },
  async subir({ pestana, ref, nombre, mime, datos }) {
    marcar(pestana);
    return enPagina(pestana, subirArchivo, [ref, nombre, mime, datos]);
  },
  async scroll({ pestana, cantidad }) { marcar(pestana); return enPagina(pestana, scrollPagina, [cantidad]); },
  async volver({ pestana }) {
    await chrome.tabs.goBack(pestana); await esperarCarga(pestana);
    const t = await chrome.tabs.get(pestana); return { titulo: t.title, url: t.url };
  },
};

// ---------- funciones que se inyectan en la página (autocontenidas) ----------
function leerPagina(max) {
  const SEL = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],' +
    '[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true]';
  const visible = el => {
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el); return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };
  const limpiar = t => String(t || '').replace(/\s+/g, ' ').trim();
  document.querySelectorAll('[data-robot-ref]').forEach(e => e.removeAttribute('data-robot-ref'));
  const elementos = []; let ref = 0;
  for (const el of document.querySelectorAll(SEL)) {
    if (elementos.length >= 250) break;
    const esArchivo = el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'file';
    if ((!visible(el) && !esArchivo) || el.closest('#robot-companion-marca')) continue;
    const tag = el.tagName.toLowerCase(), tipoIn = (el.getAttribute('type') || '').toLowerCase(), role = el.getAttribute('role');
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    const secreto = tipoIn === 'password' || /password|cc-/.test(ac);
    const texto = limpiar(el.getAttribute('aria-label') || (tag !== 'select' && !secreto ? el.innerText : '') || el.getAttribute('placeholder') ||
      el.getAttribute('title') || el.getAttribute('alt') || (['submit', 'button'].includes(tipoIn) ? el.value : '') || el.getAttribute('name') || '').slice(0, 80);
    const tipo = secreto ? 'campo-protegido (contraseña/tarjeta: NO TOCAR)' : role ||
      ({ a: 'enlace', button: 'botón', select: 'lista', textarea: 'campo-texto', summary: 'desplegable' }[tag] || (tag === 'input' ? `campo-${tipoIn || 'text'}` : el.isContentEditable ? 'editor' : tag));
    let extra = '';
    if (!secreto && tag === 'input' && !['submit', 'button', 'checkbox', 'radio'].includes(tipoIn) && el.value) extra = `valor: ${el.value.slice(0, 60)}`;
    if (['checkbox', 'radio'].includes(tipoIn) || ['checkbox', 'switch', 'radio'].includes(role)) extra = (el.checked || el.getAttribute('aria-checked') === 'true') ? 'marcado' : 'sin marcar';
    if (tag === 'a') { try { const u = new URL(el.href); extra = u.host === location.host ? u.pathname.slice(0, 60) : u.host; } catch { } }
    if (tag === 'select') extra = `opción: ${el.options[el.selectedIndex]?.text || ''}; hay: ${[...el.options].slice(0, 8).map(o => o.text.trim()).join(' | ')}`;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') extra += (extra ? ', ' : '') + 'desactivado';
    el.setAttribute('data-robot-ref', ++ref);
    elementos.push({ ref, tipo, texto, extra });
  }
  const texto = String(document.body?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, max);
  document.querySelectorAll('[data-robot-img]').forEach(e => e.removeAttribute('data-robot-img'));
  const imagenes = [...document.images].filter(i => i.naturalWidth >= 200 && i.naturalHeight >= 150 && visible(i)).slice(0, 12)
    .map((i, k) => { i.setAttribute('data-robot-img', k + 1); return `[img${k + 1}] ${i.naturalWidth}x${i.naturalHeight}${i.alt ? ` "${limpiar(i.alt).slice(0, 80)}"` : ''}`; });
  return { titulo: document.title, url: location.href, elementos, texto, imagenes };
}

// centro del elemento (en píxeles CSS del viewport) para el clic real; para escribir, rechaza contraseñas/tarjetas
function puntoRef(ref, paraEscribir) {
  const el = document.querySelector(`[data-robot-ref="${ref}"]`);
  if (!el) return { error: `no encuentro el elemento [${ref}]: la página cambió; vuelve a usar navegador_leer` };
  const t = (el.getAttribute('type') || '').toLowerCase(), ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (paraEscribir && (t === 'password' || /password|cc-/.test(ac))) return { error: 'es un campo protegido (contraseña/tarjeta): no escribo ahí. Pide al usuario que lo rellene él.' };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  // ¿qué hay de verdad en ese punto? (overlays, menús abiertos…)
  const encima = document.elementFromPoint(x, y);
  const tapado = encima && encima !== el && !el.contains(encima) && !encima.contains(el) && !encima.closest('#robot-companion-marca')
    ? String(encima.getAttribute('aria-label') || encima.innerText || encima.tagName).replace(/\s+/g, ' ').trim().slice(0, 50) : '';
  return { x: Math.round(x), y: Math.round(y), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, tapado, select: el.tagName === 'SELECT',
    texto: String(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
}

function clicRef(ref) {
  const el = document.querySelector(`[data-robot-ref="${ref}"]`);
  if (!el) return { error: `no encuentro el elemento [${ref}]: la página cambió; vuelve a usar navegador_leer` };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('mousedown', o));
  if (el.focus) el.focus();
  el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('mouseup', o));
  el.click();
  return { texto: String(el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
}

function escribirRef(ref, texto, enviar, borrar) {
  const el = document.querySelector(`[data-robot-ref="${ref}"]`);
  if (!el) return { error: `no encuentro el elemento [${ref}]: la página cambió; vuelve a usar navegador_leer` };
  const t = (el.getAttribute('type') || '').toLowerCase(), ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (t === 'password' || /password|cc-/.test(ac)) return { error: 'es un campo protegido (contraseña/tarjeta): no escribo ahí. Pide al usuario que lo rellene él.' };
  el.scrollIntoView({ block: 'center' }); if (el.focus) el.focus();
  const avisar = () => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  if (el.tagName === 'SELECT') {
    const op = [...el.options].find(o => o.text.trim().toLowerCase() === String(texto).trim().toLowerCase() || o.value === texto);
    if (!op) return { error: `la lista no tiene la opción "${texto}"` };
    el.value = op.value; avisar();
  } else if (el.isContentEditable) {
    if (borrar) { document.execCommand('selectAll'); document.execCommand('delete'); }
    document.execCommand('insertText', false, texto);
  } else if ('value' in el) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, (borrar ? '' : el.value) + texto);
    avisar();
  } else return { error: 'ese elemento no admite texto' };
  if (enviar) {
    const k = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const sigue = el.dispatchEvent(new KeyboardEvent('keydown', k));
    el.dispatchEvent(new KeyboardEvent('keypress', k)); el.dispatchEvent(new KeyboardEvent('keyup', k));
    if (sigue && el.form) { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); }
  }
  return { texto: String(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '').slice(0, 60) };
}

async function fuenteImagen(i) {
  const el = document.querySelector(`[data-robot-img="${i}"]`);
  if (!el) return { error: `no encuentro la imagen img${i}: vuelve a usar navegador_leer` };
  const src = el.currentSrc || el.src;
  if (/^(blob|data):/.test(src)) {
    const b = await (await fetch(src)).blob();
    return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok({ dataUrl: fr.result }); fr.readAsDataURL(b); });
  }
  return { src };
}

function subirArchivo(ref, nombre, mime, datos) {
  const el = document.querySelector(`[data-robot-ref="${ref}"]`);
  if (!el) return { error: `no encuentro el elemento [${ref}]: vuelve a usar navegador_leer` };
  const bin = atob(datos), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], nombre, { type: mime }), dt = new DataTransfer(); dt.items.add(file);
  // 1) el propio campo o uno dentro  2) un campo de subida de la página que acepte este tipo (suelen estar ocultos y los abre el botón "Subir")
  const acepta = i => { const a = (i.getAttribute('accept') || '').toLowerCase(); return !a || a.split(',').some(x => { x = x.trim(); return x === mime || (x.endsWith('/*') && mime.startsWith(x.slice(0, -1))) || nombre.toLowerCase().endsWith(x); }); };
  const input = el.matches('input[type=file]') ? el : el.querySelector('input[type=file]') || [...document.querySelectorAll('input[type=file]')].filter(acepta).pop();
  if (input) {
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    return { texto: `archivo "${nombre}" puesto en el campo de subida` };
  }
  // sin campo: se simula arrastrar y soltar el archivo. Si el elemento está en un menú flotante, se suelta en el centro de la página
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const enMenu = el.closest('[role=menu],[role=dialog],[role=listbox]');
  const destino = enMenu ? document.elementFromPoint(innerWidth * 0.35, innerHeight * 0.5) || document.body : el;
  const r = destino.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  for (const t of ['dragenter', 'dragover', 'drop']) destino.dispatchEvent(new DragEvent(t, o));
  return { texto: `archivo "${nombre}" soltado sobre ${enMenu ? 'la zona principal de la página' : 'el elemento'} (no había campo de subida)` };
}

function scrollPagina(cantidad) {
  window.scrollBy({ top: cantidad * innerHeight * 0.85, behavior: 'instant' });
  return { y: Math.round(scrollY), alto: document.documentElement.scrollHeight };
}

// marco y etiqueta "<nombre> está usando esta pestaña" + botón Detener; se quita solo a los 10 s sin actividad
function marcarPagina(nombre) {
  let m = document.getElementById('robot-companion-marca');
  if (!m) {
    m = document.createElement('div'); m.id = 'robot-companion-marca';
    m.attachShadow({ mode: 'open' }).innerHTML = `<style>
      .borde{position:fixed;inset:0;pointer-events:none;z-index:2147483646;box-shadow:inset 0 0 0 3px #3ddc84,inset 0 0 24px rgba(61,220,132,.45);animation:p 1.6s ease-in-out infinite}
      @keyframes p{50%{box-shadow:inset 0 0 0 3px #3ddc84,inset 0 0 8px rgba(61,220,132,.2)}}
      .et{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;
        background:#0b0f0d;color:#e9fff2;border:1px solid #3ddc84;border-radius:20px;padding:5px 6px 5px 14px;font:600 12.5px system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)}
      .p{width:8px;height:8px;border-radius:50%;background:#3ddc84}
      button{all:unset;cursor:pointer;background:#2a1414;color:#ffb3b3;border:1px solid #a33;border-radius:14px;padding:3px 10px;font:600 12px system-ui,sans-serif}
      button:hover{background:#3a1818}</style>
      <div class="borde"></div><div class="et"><span class="p"></span><span class="n"></span><button>Detener</button></div>`;
    m.shadowRoot.querySelector('button').onclick = () => { chrome.runtime.sendMessage({ tipo: 'detener' }); m.remove(); };
    document.documentElement.appendChild(m);
  }
  m.shadowRoot.querySelector('.n').textContent = `${nombre} está usando esta pestaña`;
  clearTimeout(window.__robotMarcaT);
  window.__robotMarcaT = setTimeout(() => m.remove(), 10_000);
}

// ---------- eventos ----------
chrome.runtime.onMessage.addListener((msg, _s, responder) => {
  if (msg && msg.tipo === 'detener') leerCfg().then(c => api(c, 'detener', { method: 'POST', body: '{}' })).catch(() => { });
  if (msg && msg.tipo === 'reconectar') { ultimoEstado = ''; bucle(); responder({ ok: true }); }
  if (msg && msg.tipo === 'nombre') responder({ nombre });
});
chrome.alarms.create('vivo', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => bucle());
chrome.runtime.onStartup.addListener(bucle);
chrome.runtime.onInstalled.addListener(bucle);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local') { ultimoEstado = ''; bucle(); } });
bucle();
