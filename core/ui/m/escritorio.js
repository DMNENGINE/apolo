// APOLO móvil · Escritorio remoto: ver el PC en vivo y usar su ratón/teclado (core/escritorio/remoto.js).
// Flujo binario por fetch ([u32 L][u16 H][cabecera JSON][JPEG]) → lienzo; solo llegan los trozos que cambian (x,y,w,h).
// Gestos: toque = clic · mantener = clic derecho · dos dedos = scroll (o pellizco = zoom) · un dedo con zoom = mover la vista.
// Teclado del móvil = escribir; barra de teclas especiales (Esc, Tab, Ctrl/Alt/Mayús/Win fijables, flechas, Supr, combos).
// Requiere el permiso "Permitir escritorio remoto" que se da en el PC; cada sesión se aprueba en el PC o con PIN/huella.
'use strict';
IC.pantalla = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';
IC.teclado = '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>';

const ESC = { s: null, ctl: null, z: 1, tx: 0, ty: 0, mods: new Set(), cola: Promise.resolve(), monitor: +(LS.get('escMonitor', 0)) || 0, bytes: 0, monitores: [], fps: 0, kb: 0 };

function pintarEscBtn() {
  const c = document.getElementById('escBtn'); if (!c) return;
  c.innerHTML = E.yo?.escritorio ? `<button class="btn ancho" id="btEsc" style="margin-top:14px">${ic('pantalla')}${tr('Escritorio remoto')}</button>` : '';
  $('#btEsc')?.addEventListener('click', () => { vibrar(8); abrirEscritorio(); });
}

async function apiEsc(M, ruta, cuerpo) {
  const r = await fetch('/v1/escritorio' + ruta, { method: M, headers: { 'x-dispositivo': E.token, 'x-escritorio': ESC.s?.sesion || '', ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(tr(j.error || `HTTP ${r.status}`)); e.status = r.status; throw e; }
  return j;
}

async function abrirEscritorio() {
  let info; try { info = await apiEsc('GET', ''); } catch (e) { return toast(e.message, true); }
  if (info.ocupado) return toast(tr('Otro móvil está usando el escritorio remoto'), true);
  ESC.monitores = info.monitores || [];
  if (info.sesion) { ESC.s = { sesion: info.sesion.id, hasta: info.sesion.hasta }; return montarVisor(); }
  let cuerpo = {}, espera = null;
  if (info.aprobacion === 'pin') {
    const prueba = await pruebaEscritorio(); if (!prueba) return;
    cuerpo = { prueba };
  } else {
    espera = document.createElement('div'); espera.className = 'velo';
    espera.innerHTML = `<div class="hoja"><div class="asa"></div><h2>${tr('Esperando aprobación')}</h2><p class="sub">${tr('Acepta en el PC la petición de escritorio remoto.')}</p><div style="display:grid;place-items:center;padding:18px"><span class="giro"></span></div></div>`;
    $('#hojas').append(espera);
  }
  try { ESC.s = await apiEsc('POST', '/sesion', cuerpo); ESC.monitores = ESC.s.monitores || ESC.monitores; vibrar([15, 30, 15]); montarVisor(); }
  catch (e) { toast(e.message, true); }
  finally { espera?.remove(); }
}
async function pruebaEscritorio() {
  const conHuella = passkeyPosible() && (E.yo?.passkeys || 0) > 0;
  if (conHuella) {
    try {
      const r = await apiEsc('POST', '/reto', {});
      const a = await navigator.credentials.get({ publicKey: { challenge: desB64u(r.reto), allowCredentials: r.credenciales.map(id => ({ type: 'public-key', id: desB64u(id) })), userVerification: 'required', timeout: 60000 } });
      return { tipo: 'passkey', reto: r.reto, id: a.id, clientDataJSON: b64u(a.response.clientDataJSON), authenticatorData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature) };
    } catch (e) { if (e.name !== 'NotAllowedError') toast(e.message, true); }
  }
  const pin = await pedirPin(tr('Escritorio remoto'), tr('Escribe tu PIN para ver y controlar el PC'));
  return pin ? { tipo: 'pin', pin } : null;
}

// ---------- visor ----------
const TECLAS = [['esc', 'Esc'], ['tab', 'Tab'], ['ctrl', 'Ctrl', 1], ['alt', 'Alt', 1], ['shift', '⇧', 1], ['win', '⊞', 1], ['left', '←'], ['up', '↑'], ['down', '↓'], ['right', '→'],
  ['backspace', '⌫'], ['delete', 'Supr'], ['enter', '↵'], ['ctrl+c', 'Ctrl+C'], ['ctrl+v', 'Ctrl+V'], ['ctrl+z', 'Ctrl+Z'], ['alt+tab', 'Alt+Tab'], ['alt+f4', 'Alt+F4']];
function montarVisor() {
  cerrarVisor(false);
  const v = document.createElement('div'); v.className = 'esc'; v.id = 'esc';
  v.innerHTML = `<div class="esc-cab">
      <button class="btn-ic" id="escX" aria-label="${tr('Cerrar')}">${ic('x')}</button>
      <div class="seg" id="escMon"></div>
      <span class="esc-info" id="escInfo"></span>
      <button class="btn-ic" id="escTec" aria-label="${tr('Teclado')}">${ic('teclado')}</button></div>
    <div class="esc-esc" id="escEsc"><div class="esc-capa" id="escCapa"><canvas id="escLienzo" width="16" height="9"></canvas></div>
      <div class="esc-msg" id="escMsg">${tr('Conectando…')}</div></div>
    <div class="esc-teclas" id="escTeclas">${TECLAS.map(([k, t, mod]) => `<button data-k="${k}" class="${mod ? 'mod' : ''}">${esc(t)}</button>`).join('')}</div>
    <input id="escIn" class="esc-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" aria-label="${tr('Teclado')}">`;
  document.body.append(v);
  document.body.classList.add('con-esc');
  ESC.z = 1; ESC.tx = 0; ESC.ty = 0; ESC.mods.clear();
  pintarMonitores();
  $('#escX').onclick = () => cerrarVisor(true);
  $('#escMon').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; ESC.monitor = +b.dataset.m; LS.set('escMonitor', ESC.monitor); pintarMonitores(); ESC.z = 1; ESC.tx = ESC.ty = 0; aplicarVista(); abrirFlujo(); };
  $('#escTeclas').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; vibrar(6); tecla(b.dataset.k, b); };
  $('#escTec').onclick = () => { const i = $('#escIn'); i.value = SENT; i.focus(); };
  prepararTeclado($('#escIn'));
  prepararGestos($('#escEsc'));
  addEventListener('resize', aplicarVista);
  ESC.reloj = setInterval(pintarInfo, 1000);
  abrirFlujo();
}
function pintarMonitores() {
  const c = $('#escMon'); if (!c) return;
  const ms = ESC.monitores.length ? ESC.monitores : [{ n: 1 }];
  c.innerHTML = ms.map(m => `<button data-m="${m.n}" class="${m.n === ESC.monitor ? 'on' : ''}" title="${m.ancho ? `${m.ancho}×${m.alto}` : ''}">${m.n}${m.primario ? '★' : ''}</button>`).join('');
}
function pintarInfo() {
  const i = $('#escInfo'); if (!i || !ESC.s) return;
  const rest = Math.max(0, Math.round((ESC.s.hasta - Date.now()) / 1000));
  i.textContent = `${ESC.fps} fps · ${(ESC.bytes / 1024).toFixed(0)} KB/s · ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
  ESC.fps = 0; ESC.bytes = 0;
}
function cerrarVisor(borrar) {
  ESC.ctl?.abort(); ESC.ctl = null;
  clearInterval(ESC.reloj);
  removeEventListener('resize', aplicarVista);
  $('#esc')?.remove(); document.body.classList.remove('con-esc');
  if (borrar && ESC.s) apiEsc('DELETE', '/sesion').catch(() => { });
  if (borrar) ESC.s = null;
}
function msg(t) { const m = $('#escMsg'); if (m) { m.textContent = t || ''; m.hidden = !t; } }

async function abrirFlujo() {
  ESC.ctl?.abort();
  const ctl = ESC.ctl = new AbortController();
  const lienzo = $('#escLienzo'), cx = lienzo.getContext('2d');
  const ancho = Math.min(2560, Math.max(960, Math.round(Math.max(screen.width, screen.height) * (devicePixelRatio || 1))));
  msg(tr('Conectando…'));
  try {
    const r = await fetch(`/v1/escritorio/flujo?monitor=${ESC.monitor}&ancho=${ancho}`, { headers: { 'x-dispositivo': E.token, 'x-escritorio': ESC.s.sesion }, signal: ctl.signal });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(tr(j.error || `HTTP ${r.status}`)), { status: r.status }); }
    const lector = r.body.getReader();
    let buf = new Uint8Array(0);
    for (;;) {
      const { value, done } = await lector.read(); if (done) break;
      const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
      ESC.bytes += value.length;
      while (buf.length >= 6) {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), L = dv.getUint32(0), H = dv.getUint16(4);
        if (buf.length < 4 + L) break;
        const cab = JSON.parse(new TextDecoder().decode(buf.subarray(6, 6 + H))), jpg = buf.slice(6 + H, 4 + L);
        buf = buf.slice(4 + L);
        if (cab.evento === 'listo') { ESC.monitores = cab.monitores || []; pintarMonitores(); continue; }
        if (!cab.W) continue;
        if (ESC.monitor !== cab.mon) { ESC.monitor = cab.mon; pintarMonitores(); }   // 0 = principal → el que eligió el PC
        if (lienzo.width !== cab.W || lienzo.height !== cab.H) { lienzo.width = cab.W; lienzo.height = cab.H; aplicarVista(); }
        const bmp = await createImageBitmap(new Blob([jpg], { type: 'image/jpeg' }));
        cx.drawImage(bmp, cab.x, cab.y); bmp.close?.();
        ESC.fps++; ESC.tapadas = cab.tapadas || [];
        msg(cab.aviso ? tr(cab.aviso) : '');
      }
    }
    if (ctl.signal.aborted) return;
    throw new Error(tr('La sesión terminó'));
  } catch (e) {
    if (ctl.signal.aborted) return;
    const viva = await apiEsc('GET', '').then(i => i.sesion).catch(() => null);
    if (viva && document.visibilityState === 'visible') { msg(tr('Reconectando…')); setTimeout(() => ESC.ctl === ctl && abrirFlujo(), 1500); return; }
    toast(viva ? e.message : tr('Escritorio remoto terminado'), !viva ? false : true);
    cerrarVisor(false); ESC.s = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (!$('#esc') || !ESC.s) return;
  if (document.visibilityState === 'hidden') { ESC.ctl?.abort(); ESC.ctl = null; } else abrirFlujo();
});

// ---------- vista: encajar + zoom/pan ----------
function aplicarVista() {
  const ca = $('#escCapa'), l = $('#escLienzo'), es = $('#escEsc'); if (!ca || !es) return;
  const W = es.clientWidth, H = es.clientHeight, r = Math.min(W / l.width, H / l.height);
  const w = l.width * r, h = l.height * r;
  l.style.width = w + 'px'; l.style.height = h + 'px';
  const bx = (W - w * ESC.z), by = (H - h * ESC.z);       // límites del desplazamiento
  ESC.tx = ESC.z <= 1 ? bx / 2 : Math.min(0, Math.max(bx, ESC.tx));
  ESC.ty = ESC.z <= 1 ? by / 2 : (h * ESC.z <= H ? by / 2 : Math.min(0, Math.max(by, ESC.ty)));
  ca.style.transform = `translate(${ESC.tx}px, ${ESC.ty}px) scale(${ESC.z})`;
}
function aNormal(px, py) {
  const r = $('#escLienzo').getBoundingClientRect();
  const x = (px - r.left) / r.width, y = (py - r.top) / r.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x: +x.toFixed(5), y: +y.toFixed(5) } : null;
}

// ---------- acciones ----------
let ultimoLatido = 0;
function enviar(o) {
  ESC.cola = ESC.cola.then(() => apiEsc('POST', '/accion', o)).catch(e => {
    if (e.status === 410) { toast(tr('Escritorio remoto terminado'), true); cerrarVisor(false); ESC.s = null; }
    else toast(e.message, true);
  });
}
function latido() { if (Date.now() - ultimoLatido > 30_000) { ultimoLatido = Date.now(); enviar({ op: 'latido' }); } }
function tecla(k, b) {
  if (['ctrl', 'alt', 'shift', 'win'].includes(k) && b) {           // modificadores fijables (uno o varios) para la siguiente tecla
    if (ESC.mods.has(k)) { ESC.mods.delete(k); if (k === 'win' && !ESC.mods.size) enviar({ op: 'tecla', combo: 'win' }); }
    else ESC.mods.add(k);
    $$('#escTeclas .mod').forEach(x => x.classList.toggle('on', ESC.mods.has(x.dataset.k)));
    return;
  }
  const combo = [...ESC.mods, k].join('+');
  ESC.mods.clear(); $$('#escTeclas .mod').forEach(x => x.classList.remove('on'));
  enviar({ op: 'tecla', combo });
}

const SENT = '··';
function prepararTeclado(i) {
  let comp = false;
  const procesar = () => {
    const v = i.value; if (v === SENT) return;
    if (v.startsWith(SENT)) {
      const t = v.slice(SENT.length);
      if (t.length === 1 && ESC.mods.size && /^[a-z0-9]$/i.test(t)) tecla(t.toLowerCase());
      else if (t) enviar({ op: 'escribir', texto: t });
    } else if (SENT.startsWith(v)) { for (let k = 0; k < SENT.length - v.length; k++) enviar({ op: 'tecla', combo: 'backspace' }); }
    else { const t = v.replace(/·/g, ''); if (t) enviar({ op: 'escribir', texto: t }); }
    i.value = SENT; try { i.setSelectionRange(SENT.length, SENT.length); } catch { }
  };
  i.addEventListener('compositionstart', () => { comp = true; });
  i.addEventListener('compositionend', () => { comp = false; procesar(); });
  i.addEventListener('input', () => { if (!comp) procesar(); });
  i.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); procesar(); enviar({ op: 'tecla', combo: 'enter' }); }
    else if (e.key === 'Tab') { e.preventDefault(); enviar({ op: 'tecla', combo: 'tab' }); }
  });
}

function prepararGestos(el) {
  let t0 = null, largo = null, movido = false, modo = null, d0 = 0, z0 = 1, m0 = null, scrollAcum = 0, txy0 = null;
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const medio = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    clearTimeout(largo);
    if (e.touches.length === 1) {
      const t = e.touches[0]; t0 = { x: t.clientX, y: t.clientY, t: Date.now(), usado: false }; movido = false; txy0 = { x: ESC.tx, y: ESC.ty };
      largo = setTimeout(() => { if (movido || !t0) return; const p = aNormal(t0.x, t0.y); if (p) { vibrar(25); enviar({ op: 'clic', ...p, boton: 'der' }); } t0.usado = true; }, 550);
    } else if (e.touches.length === 2) {
      t0 = null; modo = null; d0 = dist(e.touches[0], e.touches[1]); z0 = ESC.z; m0 = medio(e.touches[0], e.touches[1]); scrollAcum = 0; txy0 = { x: ESC.tx, y: ESC.ty };
    }
  }, { passive: false });
  el.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && t0) {
      const t = e.touches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
      if (!movido && Math.hypot(dx, dy) > 10) { movido = true; clearTimeout(largo); }
      if (movido && ESC.z > 1) { ESC.tx = txy0.x + dx; ESC.ty = txy0.y + dy; aplicarVista(); latido(); }
    } else if (e.touches.length === 2 && m0) {
      const d = dist(e.touches[0], e.touches[1]), m = medio(e.touches[0], e.touches[1]), ratio = d / d0;
      if (!modo) modo = Math.abs(ratio - 1) > 0.08 ? 'zoom' : Math.abs(m.y - m0.y) > 12 ? 'scroll' : null;
      if (modo === 'zoom') {
        const z = Math.min(5, Math.max(1, z0 * ratio)), es = el.getBoundingClientRect();
        // el punto bajo el centro de los dedos se queda debajo de los dedos
        const px = m0.x - es.left, py = m0.y - es.top;
        ESC.tx = px - (px - txy0.x) * z / z0 + (m.x - m0.x); ESC.ty = py - (py - txy0.y) * z / z0 + (m.y - m0.y); ESC.z = z;
        aplicarVista(); latido();
      } else if (modo === 'scroll') {
        const dy = m.y - m0.y - scrollAcum, paso = 36;
        if (Math.abs(dy) >= paso) {
          const n = Math.trunc(dy / paso); scrollAcum += n * paso;
          const p = aNormal(m.x, m.y) || aNormal(m0.x, m0.y);
          if (p) enviar({ op: 'scroll', ...p, cantidad: -n });      // dedos hacia arriba = bajar la página
        }
      }
    }
  }, { passive: false });
  el.addEventListener('touchend', e => {
    e.preventDefault();
    clearTimeout(largo);
    if (t0 && !movido && !t0.usado && !e.touches.length && Date.now() - t0.t < 550) {
      const p = aNormal(t0.x, t0.y); if (p) { vibrar(6); enviar({ op: 'clic', ...p }); }
    }
    if (!e.touches.length) { t0 = null; m0 = null; }
  }, { passive: false });
  // ratón (escritorio / pruebas): clic = clic, botón derecho = clic derecho, rueda = scroll
  el.addEventListener('click', e => { const p = aNormal(e.clientX, e.clientY); if (p) enviar({ op: 'clic', ...p }); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); const p = aNormal(e.clientX, e.clientY); if (p) enviar({ op: 'clic', ...p, boton: 'der' }); });
  el.addEventListener('wheel', e => { e.preventDefault(); const p = aNormal(e.clientX, e.clientY); if (p) enviar({ op: 'scroll', ...p, cantidad: Math.sign(e.deltaY) * 3 }); }, { passive: false });
}
