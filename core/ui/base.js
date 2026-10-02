// Robot Companion · panel — base: utilidades, iconos, API, componentes, estructura, router.
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtK = n => { n = n || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n); };
const fmtB = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return `${n.toFixed(i > 2 ? 1 : 0)} ${u[i]}`; };
const fecha = t => (t ? new Date(t).toLocaleString(I18N.locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const hora = t => new Date(t).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' });
const hace = t => {
  if (!t) return '—';
  const s = (Date.now() - t) / 1000, f = s < 0;
  const a = Math.abs(s);
  const txt = a < 45 ? tr('unos segundos') : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return f ? tr('en {x}', { x: txt }) : a < 45 ? tr('ahora') : tr('hace {x}', { x: txt });
};
const duracion = s => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };
const guardarLocal = (k, v) => { try { localStorage.setItem('rc.' + k, JSON.stringify(v)); } catch { } };
const leerLocal = (k, d) => { try { const v = localStorage.getItem('rc.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };

// ---------- iconos (trazos propios, 24×24) ----------
const P = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cerebro: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>',
  grafica: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  enviar: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  parar: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  der: '<path d="m9 6 6 6-6 6"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  izq: '<path d="m15 6-6 6 6 6"/>',
  carpeta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  enchufe: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  llaveinglesa: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3-6.5-6.5L5 10l1.3 1.3a4 4 0 0 0 5-5L10 5l3-3z"/>',
  rayo: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  paleta: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.5-1.5-1.5-1.5-3 0-1 .8-1.5 1.8-1.5H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  play: '<path d="M7 4.5v15L19.5 12z"/>',
  pausa: '<path d="M8 5v14M16 5v14"/>',
  recargar: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  terminal: '<path d="m5 8 4 4-4 4M12 17h7"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
  mundo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  archivo: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  chispa: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  teclas: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  disco: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  memoria: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 7v10M11 7v10M15 7v10M3 20h18M3 4h18"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M2 13h3M19 13h3"/>',
  discord: '<path d="M7 7.5c3-1.3 7-1.3 10 0l1.5 9c-1.6 1.2-3.2 1.7-4.5 2l-1-1.8M7 7.5l-1.5 9c1.6 1.2 3.2 1.7 4.5 2l1-1.8M7 16c3.2 1.5 6.8 1.5 10 0"/><circle cx="9.5" cy="12.5" r="1"/><circle cx="14.5" cy="12.5" r="1"/>',
  isla: '<rect x="6" y="3" width="12" height="5" rx="2.5"/><rect x="2" y="11" width="20" height="10" rx="2"/>',
  api: '<path d="M8 6 3 12l5 6M16 6l5 6-5 6M14 4l-4 16"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  latido: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  mas2: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  salir: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
  enlace: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  pieza: '<path d="M4 7.5h4.2a2.3 2.3 0 1 1 4.6 0H17v4.2a2.3 2.3 0 1 1 0 4.6V20.5H4z"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.info}</svg>`;

// casco del robot (firma visual)
const casco = (cls = '') => `<svg class="casco ${cls}" viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7584"/><stop offset=".55" stop-color="#3a414c"/><stop offset="1" stop-color="#1f242b"/></linearGradient></defs>
  <path d="M10 31C10 17 20 7 32 7s22 10 22 24v9c0 9-7 16-16 16H26c-9 0-16-7-16-16z" fill="url(#cg)"/>
  <path d="M16 18c3-5 9-8 16-8" stroke="#9aa4b2" stroke-width="1.6" fill="none" opacity=".55" stroke-linecap="round"/>
  <rect class="visor" x="15" y="25" width="34" height="15" rx="7.5"/>
  <rect x="17" y="27" width="30" height="11" rx="5.5" fill="none" stroke="var(--acento)" stroke-opacity=".35"/>
  <rect class="ojo" x="22.5" y="29.5" width="6" height="6" rx="2"/><rect class="ojo" x="35.5" y="29.5" width="6" height="6" rx="2"/>
  <rect class="brillo" x="30" y="2.5" width="4" height="5" rx="1.5"/>
  <path d="M22 50h20" stroke="#11151a" stroke-width="2" stroke-linecap="round"/></svg>`;

// proveedor → color y siglas para avatares
const PROV = { chatgpt: ['#10a37f', '#fff', 'GP'], ollama: ['#f2f2f2', '#111', 'OL'], claudecode: ['#d97757', '#fff', 'CC'], anthropic: ['#d97757', '#fff', 'AN'], openai: ['#10a37f', '#fff', 'AI'], gemini: ['#4b7bff', '#fff', 'GE'], openrouter: ['#6467f2', '#fff', 'OR'] };
// logos de cada proveedor (core/ui/logos, LobeHub Icons MIT): [archivo, fondo, color]; color = null → logo a color (img)
const LOGO = {
  chatgpt: ['openai', '#10a37f', '#fff'], openai: ['openai', '#fff', '#000'], claudecode: ['claude-color', '#f5f0e8', null], anthropic: ['anthropic', '#f0eee6', '#141413'],
  gemini: ['gemini-color', '#fff', null], openrouter: ['openrouter-color', '#fff', null], ollama: ['ollama', '#fff', '#000'], deepseek: ['deepseek-color', '#fff', null],
  xai: ['grok', '#000', '#fff'], groq: ['groq', '#f55036', '#fff'], mistral: ['mistral-color', '#fff', null], together: ['together-color', '#fff', null],
  perplexity: ['perplexity-color', '#fff', null], cerebras: ['cerebras-color', '#fff', null], fireworks: ['fireworks-color', '#fff', null], moonshot: ['kimi-color', '#0d0d0d', null],
  zai: ['zai', '#fff', '#000'], qwen: ['qwen-color', '#fff', null], nvidia: ['nvidia-color', '#fff', null], huggingface: ['huggingface-color', '#fff', null],
  cohere: ['cohere-color', '#fff', null], lmstudio: ['lmstudio', '#1d1d1f', '#fff'],
};
const avatar = (modelo = '') => {
  const p = modelo.split('/')[0], l = LOGO[p];
  if (l) {
    const [f, bg, fg] = l, url = `logos/${f}.svg`;
    return fg ? `<span class="av av-logo" style="background:${bg}" title="${esc(modelo)}"><i style="background:${fg};-webkit-mask:url(${url}) center/contain no-repeat;mask:url(${url}) center/contain no-repeat"></i></span>`
      : `<span class="av av-logo" style="background:${bg}" title="${esc(modelo)}"><img src="${url}" alt=""></span>`;
  }
  const [bg, fg, s] = PROV[p] || ['#59636f', '#fff', p.slice(0, 2).toUpperCase() || '?'];
  return `<span class="av" style="background:${bg};color:${fg}" title="${esc(modelo)}">${esc(s)}</span>`;
};
const nombreModelo = m => String(m || '').split('/').slice(1).join('/') || m;

// ---------- token y API ----------
let TOKEN = leerLocal('token', '');
if (!TOKEN) { try { TOKEN = localStorage.getItem('robot-token') || ''; if (TOKEN) guardarLocal('token', TOKEN); } catch { } }   // token del panel v1
const mHash = location.hash.match(/token=([a-f0-9]{16,})/i);
if (mHash) { TOKEN = mHash[1]; guardarLocal('token', TOKEN); history.replaceState(null, '', location.pathname + '#' + ((location.hash.match(/^#(\/[\w/-]+)/) || [])[1] || '/inicio')); }   // "#/agentes&token=…" abre esa página

async function api(metodo, ruta, cuerpo) {
  const r = await fetch('/v1' + ruta, { method: metodo, headers: { 'x-robot-token': TOKEN, 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (r.status === 401) { pantallaLogin(); throw new Error(tr('token no válido')); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function flujo(metodo, ruta, cuerpo, alEvento, senal) {
  const r = await fetch('/v1' + ruta, { method: metodo, signal: senal, headers: { 'x-robot-token': TOKEN, 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
  const lector = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const b = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const l of b.split('\n')) if (l.startsWith('data: ')) { try { alEvento(JSON.parse(l.slice(6))); } catch { } }
    }
  }
}

// ---------- componentes ----------
// los componentes pasan sus textos por tr(): si el texto es una clave conocida sale traducido; si no (datos, ya traducido), tal cual
function aviso(texto, mal = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (mal ? ' mal' : '');
  el.innerHTML = `${ic(mal ? 'x' : 'check')}<div>${esc(tr(String(texto ?? '')))}</div>`;
  $('#avisos').append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, mal ? 6500 : 3200);
}
function modal({ titulo, cuerpo = '', botones = [{ txt: 'Cerrar', valor: null }], ancho, alAbrir }) {
  return new Promise(ok => {
    const v = document.createElement('div'); v.className = 'velo';
    v.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${ancho ? `style="width:min(${ancho}px,100%)"` : ''}><header>${esc(tr(titulo))}</header><div class="cuerpo">${tr(cuerpo)}</div>
      <footer>${botones.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(tr(b.txt))}</button>`).join('')}</footer></div>`;
    const cerrar = valor => { v.remove(); document.removeEventListener('keydown', tecla); ok(valor); };
    const tecla = e => { if (e.key === 'Escape') cerrar(null); };
    v.addEventListener('mousedown', e => { if (e.target === v) cerrar(null); });
    v.querySelector('footer').onclick = e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const def = botones[+b.dataset.i];
      const val = typeof def.valor === 'function' ? def.valor(v) : def.valor;
      if (val === false) return;                          // validación fallida: no cerrar
      cerrar(val);
    };
    document.addEventListener('keydown', tecla);
    document.body.append(v);
    alAbrir?.(v);
    ($('input,textarea,select', v) || $('.btn.pri', v))?.focus();
  });
}
const confirmar = (titulo, texto, peligro) => modal({ titulo, cuerpo: `<p class="suave" style="margin:0">${esc(tr(texto))}</p>`, botones: [{ txt: 'Cancelar', valor: null }, { txt: peligro ? 'Sí, hacerlo' : 'Aceptar', cls: peligro ? 'mal pri' : 'pri', valor: true }] }).then(v => v === true);
function popover(ancla, html, alClic) {
  $$('.pop').forEach(p => p.remove());
  const p = document.createElement('div'); p.className = 'pop'; p.innerHTML = html;
  document.body.append(p);
  const r = ancla.getBoundingClientRect(), alto = p.offsetHeight;
  p.style.left = Math.min(r.left, innerWidth - p.offsetWidth - 10) + 'px';
  p.style.top = (r.bottom + 6 + alto > innerHeight ? Math.max(10, r.top - alto - 6) : r.bottom + 6) + 'px';
  const fuera = e => { if (!p.contains(e.target) && e.target !== ancla) { p.remove(); document.removeEventListener('mousedown', fuera); } };
  setTimeout(() => document.addEventListener('mousedown', fuera));
  p.onclick = e => { const o = e.target.closest('[data-v]'); if (o) { p.remove(); document.removeEventListener('mousedown', fuera); alClic(o.dataset.v, o); } };
  return p;
}
const sw = (id, on, extra = '') => `<button class="sw" role="switch" aria-checked="${!!on}" data-sw="${esc(id)}" ${extra}></button>`;
const seg = (id, ops, val) => `<div class="seg" data-seg="${esc(id)}">${ops.map(([v, t]) => `<button type="button" data-v="${esc(v)}" class="${v === val ? 'on' : ''}">${esc(tr(t))}</button>`).join('')}</div>`;
const fila = (titulo, desc, control) => `<div class="fila-a"><div class="t"><b>${tr(titulo)}</b>${desc ? `<small>${tr(desc)}</small>` : ''}</div><div class="c">${control}</div></div>`;
const vacio = (icono, texto) => `<div class="vacio">${ic(icono)}${tr(texto)}</div>`;
const cabecera = (titulo, desc, acciones = '') => `<div class="cab-pag"><div><h1>${esc(tr(titulo))}</h1>${desc ? `<p>${tr(desc)}</p>` : ''}</div><div class="flex">${acciones}</div></div>`;
// activa interruptores y segmentados dentro de un contenedor
function enlazarControles(raiz, alCambiar) {
  raiz.addEventListener('click', e => {
    const s = e.target.closest('[data-sw]');
    if (s) { const v = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', v); alCambiar?.(s.dataset.sw, v, s); return; }
    const b = e.target.closest('[data-seg] button');
    if (b) { const g = b.parentElement; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); alCambiar?.(g.dataset.seg, b.dataset.v, b); }
  });
}

// ---------- markdown seguro ----------
function md(t) {
  const partes = String(t || '').split(/```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g);
  let html = '';
  for (let i = 0; i < partes.length; i++) {
    if (i % 3 === 1) continue;
    if (i % 3 === 2) { html += `<div class="bloque-cod"><header><span>${esc(partes[i - 1] || tr('código'))}</span><button class="btn fantasma mini" data-copiar>${ic('copiar')}${tr('Copiar')}</button></header><pre><code>${esc(partes[i].replace(/\n$/, ''))}</code></pre></div>`; continue; }
    let lista = null;
    for (const l of esc(partes[i]).split('\n')) {
      const ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/), it = ul || ol;
      const tipo = ul ? 'ul' : ol ? 'ol' : null;
      if (lista && lista !== tipo) { html += `</${lista}>`; lista = null; }
      if (tipo && !lista) { html += `<${tipo}>`; lista = tipo; }
      let x = (it ? it[1] : l)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      const h = x.match(/^#{1,4}\s+(.*)/), q = x.match(/^&gt;\s?(.*)/);
      if (it) html += `<li>${x}</li>`;
      else if (h) html += `<h3>${h[1]}</h3>`;
      else if (q) html += `<blockquote>${q[1]}</blockquote>`;
      else if (x.trim()) html += `<p>${x}</p>`;
    }
    if (lista) html += `</${lista}>`;
  }
  return html;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copiar]'); if (!b) return;
  const txt = b.dataset.copiar || b.closest('.bloque-cod')?.querySelector('code')?.textContent || '';
  navigator.clipboard?.writeText(txt).then(() => aviso('Copiado'), () => aviso('No pude copiar', true));
});

// ---------- tema ----------
const TEMAS = { casco: ['Casco', '#2bdc7c'], ambar: ['Ámbar', '#f5a524'], hielo: ['Hielo', '#5ab0ff'], magma: ['Magma', '#ff6a3d'], violeta: ['Violeta', '#a78bfa'], rosa: ['Neón', '#ff5fa2'], terminal: ['Terminal', '#39ff8f'] };
const ACENTOS = ['#2bdc7c', '#22c3a6', '#5ab0ff', '#7c8cff', '#a78bfa', '#ff5fa2', '#ff6a3d', '#f5a524', '#e6d34a', '#c7ced6'];
function aplicarTema() {
  const t = leerLocal('tema', { tema: 'casco', modo: 'oscuro', acento: null });
  const raiz = document.documentElement;
  raiz.dataset.tema = t.tema; raiz.dataset.modo = t.modo;
  const ac = t.acento || TEMAS[t.tema]?.[1] || '#2bdc7c';
  raiz.style.setProperty('--acento', ac);
  raiz.style.setProperty('--acento-2', `color-mix(in srgb, ${ac} 82%, #000)`);
  raiz.style.setProperty('--sobre-acento', ['#c7ced6', '#e6d34a', '#f5a524', '#2bdc7c', '#39ff8f', '#22c3a6'].includes(ac) ? '#050a07' : '#fff');
  return t;
}
aplicarTema();

// ---------- estado compartido ----------
const E = { config: null, estado: null, pendientes: new Map(), trabajando: new Set(), sesiones: [], oyentes: new Set(), vista: null };
// nombres bonitos de las herramientas; el Proxy los devuelve ya traducidos (NOMBRE_HERR[x] || x sigue funcionando)
const NOMBRE_HERR = new Proxy({ shell: 'Terminal', leer_archivo: 'Leer archivo', listar: 'Listar carpeta', escribir_archivo: 'Escribir archivo', editar_archivo: 'Editar archivo', web: 'Web', programar_tarea: 'Programar tarea', ver_tareas: 'Ver tareas', borrar_tarea: 'Borrar tarea', recordar: 'Recordar', buscar_memoria: 'Buscar en memoria', olvidar: 'Olvidar', buscar_historial: 'Buscar historial', delegar: 'Subagente' },
  { get: (o, k) => (typeof k === 'string' && o[k] ? tr(o[k]) : undefined) });
const ICONO_HERR = { shell: 'terminal', leer_archivo: 'archivo', listar: 'carpeta', escribir_archivo: 'editar', editar_archivo: 'editar', web: 'mundo', programar_tarea: 'reloj', ver_tareas: 'reloj', borrar_tarea: 'reloj', recordar: 'cerebro', buscar_memoria: 'cerebro', olvidar: 'cerebro', buscar_historial: 'buscar', delegar: 'robot' };
function modelosConocidos() {
  const c = E.config; if (!c) return [];
  return [...new Set([c.modeloPorDefecto, ...Object.values(c.alias), ...E.sesiones.map(s => s.modelo)])].filter(Boolean);
}

// ---------- robot 3D (el mismo casco de la isla) ----------
E.robots = new Set();
const logRobot = [tr('> robot listo'), tr('núcleo conectado…')];
function estadoActual() { return E.pendientes.size ? 'permiso' : E.trabajando.size ? 'trabajando' : 'reposo'; }
// monta un robot 3D en el contenedor (que ya tiene el casco SVG de respaldo); devuelve el robot o null
function montarRobot(caja, animacion, fps = 60) {
  if (!caja) return null;
  if (!window.Robot3D) { addEventListener('robot3d-listo', () => { if (caja.isConnected && !caja._robot) caja._robot = montarRobot(caja, animacion, fps); }, { once: true }); return null; }
  try {
    const cv = document.createElement('canvas'); cv.className = 'robot3d';
    const r = window.Robot3D.crear(cv, animacion, logRobot);
    caja.innerHTML = ''; caja.append(cv); caja._robot = r;
    r.setFps(fps); r.setState(estadoActual());
    cv.addEventListener('click', () => r.poke());
    E.robots.add(r);
    const d = r.destruir; r.destruir = () => { E.robots.delete(r); d(); };
    return r;
  } catch (e) { console.warn('robot 3D no disponible:', e.message); return null; }   // sin WebGL: se queda el SVG
}
function desmontarRobot(caja) { if (caja?._robot) { caja._robot.destruir(); caja._robot = null; } }
function robotsLog(linea) { logRobot.push(linea); if (logRobot.length > 60) logRobot.shift(); for (const r of E.robots) r.pushLog(linea); }
function robotsEstado() { const s = estadoActual(); for (const r of E.robots) r.setState(s); }
function robotsFlash(msg, st) { for (const r of E.robots) r.hud(msg, 2.5, st); }

// ---------- permisos flotantes ----------
function pintarPermisos() {
  const caja = $('#permisos'); caja.innerHTML = '';
  for (const p of E.pendientes.values()) {
    const el = document.createElement('div');
    el.className = 'perm' + (p.peligro ? ' peligro' : '');
    el.innerHTML = `<div class="t">${ic(p.peligro ? 'escudo' : ICONO_HERR[p.herramienta] || 'escudo')}${p.peligro ? tr('Peligro: {x}', { x: esc(p.peligro) }) : tr('Permiso · {x}', { x: esc(NOMBRE_HERR[p.herramienta] || p.herramienta) })}<small>${hace(p.creado)}</small></div>
      <pre>${esc(p.resumen)}</pre>
      <div class="flex"><button class="btn pri" data-d="allow">${ic('check')}${tr('Permitir')}</button>${p.peligro ? '' : `<button class="btn" data-d="always">${tr('Siempre')}</button>`}<button class="btn mal" data-d="deny" style="margin-left:auto">${tr('Denegar')}</button></div>`;
    el.onclick = async e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      if (p.peligro && b.dataset.d === 'allow' && !(await confirmar('Acción peligrosa', `${p.peligro}: ${p.resumen}`, true))) return;
      try { await api('POST', `/permisos/${p.id}`, { decision: b.dataset.d }); } catch (er) { aviso(er.message, true); }
    };
    caja.append(el);
  }
  const n = E.pendientes.size;
  $$('[data-cuenta-perm]').forEach(x => { x.hidden = !n; x.textContent = n; });
  actualizarEstadoRobot();
}
function actualizarEstadoRobot() {
  robotsEstado();
  const c = $('#cascoLado'), t = $('#estadoTxt'); if (!t) return;
  const estado = E.pendientes.size ? 'permiso' : E.trabajando.size ? 'trabajando' : '';
  if (c) c.className.baseVal = `casco ${estado}`;
  $('#estadoTxt').textContent = E.pendientes.size ? tr('{n} permiso esperando|{n} permisos esperando', { n: E.pendientes.size }) : E.trabajando.size ? tr('Trabajando en {n} sesión|Trabajando en {n} sesiones', { n: E.trabajando.size }) : tr('En reposo');
}

// ---------- eventos en vivo ----------
let flujoGlobal = null;
function conectarEventos() {
  flujoGlobal?.abort(); flujoGlobal = new AbortController();
  const marcar = ok => { const p = $('#puntoConexion'); if (p) p.className = 'punto ' + (ok ? 'ok' : 'mal'); };
  marcar(true);
  flujo('GET', '/eventos', undefined, e => {
    if (e.tipo === 'permiso') { E.pendientes.set(e.id, e); pintarPermisos(); robotsLog(`? ${tr('permiso')}: ${NOMBRE_HERR[e.herramienta] || e.herramienta}`); }
    else if (e.tipo === 'permiso-resuelto') { E.pendientes.delete(e.id); pintarPermisos(); }
    else if (e.tipo === 'tarea') { robotsLog(`⏰ ${e.tarea.nombre}`); robotsFlash(tr('⏰ TAREA'), 'listo'); }
    if (e.tipo === 'tarea') aviso(`${e.tarea.nombre}: ${String(e.texto).slice(0, 140)}`, e.subtipo === 'error');
    else if (e.sesion && e.tipo) {
      if (e.tipo === 'inicio') { E.trabajando.add(e.sesion); robotsLog(`> ${tr('{m} pensando…', { m: nombreModelo(e.modelo) })}`); }
      if (e.tipo === 'herramienta') robotsLog(`> ${NOMBRE_HERR[e.nombre] || e.nombre} ${String(e.resumen || '').slice(0, 30)}`);
      if (e.tipo === 'fin' || e.tipo === 'error') E.trabajando.delete(e.sesion);
      if (e.tipo === 'fin') { robotsLog(tr('✓ respuesta lista')); if (!E.trabajando.size && !E.pendientes.size) robotsFlash(tr('✓ LISTO'), 'listo'); }
      if (e.tipo === 'error') { robotsLog(`✗ ${String(e.error).slice(0, 34)}`); robotsFlash(tr('✗ ERROR'), 'error'); }
      if (e.tipo === 'inicio' || e.tipo === 'fin' || e.tipo === 'error') { cargarSesiones(); actualizarEstadoRobot(); }
    }
    for (const o of E.oyentes) { try { o(e); } catch { } }
  }, flujoGlobal.signal).catch(() => { }).finally(() => { if (!flujoGlobal.signal.aborted) { marcar(false); setTimeout(conectarEventos, 3000); } });
}

// ---------- barra lateral ----------
const NAV_APP = [['inicio', 'Inicio', 'inicio'], ['chat', 'Chat', 'chat'], ['agentes', 'Mission Control', 'robot'], ['auto', 'Automatizaciones', 'reloj'], ['skills', 'Skills', 'pieza'], ['memoria', 'Memoria', 'cerebro'], ['uso', 'Uso', 'grafica']];
function grupoFecha(t) {
  const d = new Date(t), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = (hoy - new Date(d).setHours(0, 0, 0, 0)) / 86400000;
  return dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : dias < 7 ? 'Esta semana' : dias < 31 ? 'Este mes' : 'Anteriores';
}
let filtroSes = '';
function pintarSesionesLado() {
  const caja = $('#ladoSesiones'); if (!caja) return;
  const actual = (location.hash.match(/^#\/chat\/([\w-]+)/) || [])[1];
  const l = E.sesiones.filter(s => !s.padre).filter(s => !filtroSes || (s.titulo + ' ' + s.modelo).toLowerCase().includes(filtroSes)).slice(0, 120);
  let g = '', html = '';
  for (const s of l) {
    const gg = grupoFecha(s.actualizada);
    if (gg !== g) { html += `<div class="lado-grupo">${tr(gg)}</div>`; g = gg; }
    html += `<a class="lado-ses ${s.id === actual ? 'on' : ''}" href="#/chat/${esc(s.id)}"><b>${E.trabajando.has(s.id) ? '<span class="punto ok vivo"></span>' : ''}${s.tarea ? ic('reloj') : ''}${esc(s.titulo)}</b><small>${esc(nombreModelo(s.modelo))} · ${hace(s.actualizada)}</small></a>`;
  }
  caja.innerHTML = html || `<div class="tenue" style="padding:8px 10px;font-size:12px">${tr(filtroSes ? 'Nada coincide.' : 'Aún no hay conversaciones.')}</div>`;
}
let cargando = null;
function cargarSesiones() {
  clearTimeout(cargando);
  cargando = setTimeout(async () => { try { E.sesiones = await api('GET', '/sesiones'); pintarSesionesLado(); } catch { } }, 150);
}

function pintarLado(modo) {
  const lado = $('#lado');
  desmontarRobot($('#robotLado')); desmontarRobot($('#robotMarca'));
  if (modo === 'ajustes') {
    lado.innerHTML = `<div class="lado-cab"><a class="btn fantasma mini" href="#/inicio">${ic('izq')}${tr('Volver')}</a><span class="tenue" style="margin-left:auto;font-size:11px">ESC</span></div>
      <div style="padding:0 14px 8px;font-size:17px;font-weight:650">${tr('Configuración')}</div>
      <div class="buscador-lado">${ic('buscar')}<input id="buscaAjustes" placeholder="${tr('Buscar en la configuración…')}"></div>
      <div class="lado-scroll" id="navAjustes"></div>
      <div class="lado-pie"><span class="tenue" style="font-size:11px">Robot Companion · ${tr('núcleo')} v${esc(E.estado?.version || '')}</span></div>`;
    pintarNavAjustes('');
    $('#buscaAjustes').oninput = e => pintarNavAjustes(e.target.value);
    return;
  }
  lado.innerHTML = `<div class="lado-cab"><a class="marca" href="#/inicio" style="color:var(--txt);text-decoration:none"><span class="robot-marca" id="robotMarca">${casco()}</span><span>${esc(E.estado?.nombre && E.estado.nombre !== 'Robot' ? E.estado.nombre : 'Robot Companion')}</span></a>
      <button class="btn fantasma icono" id="btnPaleta" title="${tr('Buscar (Ctrl+K)')}">${ic('buscar')}</button><a class="btn fantasma icono" href="#/chat" title="${tr('Nueva conversación')}">${ic('editar')}</a></div>
    <nav class="lado-nav">${NAV_APP.map(([r, t, i]) => `<a href="#/${r}" data-r="${r}">${ic(i)}<span>${tr(t)}</span>${r === 'inicio' ? '<span class="cuenta" data-cuenta-perm hidden></span>' : ''}</a>`).join('')}</nav>
    <div class="lado-sec">${tr('Conversaciones')}<button class="btn fantasma icono mini" id="btnBuscaSes" title="${tr('Filtrar')}">${ic('buscar')}</button></div>
    <div class="buscador-lado" id="cajaBuscaSes" hidden>${ic('buscar')}<input id="buscaSes" placeholder="${tr('Filtrar conversaciones…')}"></div>
    <div class="lado-scroll" id="ladoSesiones"></div>
    <div class="lado-pie"><div class="estado-robot"><div class="robot-lado" id="robotLado" title="${tr('Tócame')}">${casco('').replace('class="casco ', 'id="cascoLado" class="casco ')}</div><div><span id="estadoTxt">${tr('En reposo')}</span><small title="${tr('Modelo por defecto (cámbialo en Configuración → Modelos)')}"><span class="punto ok" id="puntoConexion" style="display:inline-block;margin-right:5px;vertical-align:1px"></span>${tr('por defecto:')} ${esc(nombreModelo(E.config?.modeloPorDefecto))}</small></div></div>
      <a class="btn fantasma icono" href="#/ajustes/apariencia" title="${tr('Configuración')}">${ic('ajustes')}</a></div>`;
  $('#btnPaleta').onclick = abrirPaleta;
  $('#btnBuscaSes').onclick = () => { const c = $('#cajaBuscaSes'); c.hidden = !c.hidden; if (!c.hidden) $('#buscaSes').focus(); else { filtroSes = ''; pintarSesionesLado(); } };
  $('#buscaSes').oninput = e => { filtroSes = e.target.value.trim().toLowerCase(); pintarSesionesLado(); };
  pintarSesionesLado(); pintarPermisos();
  montarRobot($('#robotLado'), 'raton', 30);
  montarRobot($('#robotMarca'), 'vitrina', 24);
}

// ---------- paleta de comandos (Ctrl+K) ----------
function abrirPaleta() {
  if ($('.paleta')) return;
  const acciones = [
    ...NAV_APP.map(([r, t, i]) => ({ t: tr(t), i, sub: tr('Ir a'), go: `#/${r}` })),
    { t: tr('Nueva conversación'), i: 'editar', sub: tr('Acción'), go: '#/chat' },
    { t: tr('Asistente de bienvenida'), i: 'chispa', sub: tr('Acción'), go: '#/bienvenida' },
    ...(typeof SK_paleta === 'function' ? SK_paleta() : []),
    ...AJUSTES.flatMap(([, items]) => items.map(([r, t, i]) => ({ t: tr(t), i, sub: tr('Configuración'), go: `#/ajustes/${r}` }))),
    ...E.sesiones.slice(0, 40).map(s => ({ t: s.titulo, i: 'chat', sub: nombreModelo(s.modelo), go: `#/chat/${s.id}` })),
  ];
  const v = document.createElement('div'); v.className = 'velo';
  v.innerHTML = `<div class="modal paleta"><input placeholder="${tr('Busca páginas, ajustes o conversaciones…')}"><div class="res"></div></div>`;
  document.body.append(v);
  const inp = $('input', v), res = $('.res', v);
  let sel = 0, lista = [];
  const pintar = () => {
    const q = inp.value.trim().toLowerCase();
    lista = acciones.filter(a => !q || (a.t + ' ' + a.sub).toLowerCase().includes(q)).slice(0, 40);
    sel = Math.min(sel, Math.max(0, lista.length - 1));
    res.innerHTML = lista.map((a, i) => `<div class="op ${i === sel ? 'sel' : ''}" data-i="${i}">${ic(a.i)}<span>${esc(a.t)}</span><small>${esc(a.sub)}</small></div>`).join('') || `<div class="vacio">${tr('Sin resultados')}</div>`;
  };
  const cerrar = () => { v.remove(); document.removeEventListener('keydown', tecla); };
  const ir = a => { cerrar(); if (a) location.hash = a.go; };
  const tecla = e => {
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, lista.length - 1); pintar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); pintar(); e.preventDefault(); }
    else if (e.key === 'Enter') ir(lista[sel]);
  };
  inp.oninput = () => { sel = 0; pintar(); };
  res.onclick = e => { const o = e.target.closest('[data-i]'); if (o) ir(lista[+o.dataset.i]); };
  v.addEventListener('mousedown', e => { if (e.target === v) cerrar(); });
  document.addEventListener('keydown', tecla);
  pintar(); inp.focus();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirPaleta(); }
  if (e.key === 'Escape' && location.hash.startsWith('#/ajustes') && !$('.velo') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) location.hash = '#/inicio';
});

// ---------- login ----------
function pantallaLogin() {
  $('#app').hidden = true;
  let l = $('#login');
  if (!l) {
    l = document.createElement('div'); l.id = 'login'; l.className = 'login';
    l.innerHTML = `<div style="width:84px;margin:0 auto">${casco('casco-grande')}</div><h1 style="margin:14px 0 6px">Robot Companion</h1>
      <p class="suave">${tr('Pega el token del núcleo. Está en el archivo <code>token</code> de la carpeta de datos, o ábrelo desde el robot: bandeja → <b>Abrir panel de control</b>.')}</p>
      <form><input type="password" placeholder="token" autocomplete="off" required><button class="btn pri">${tr('Entrar')}</button></form>`;
    document.body.append(l);
    $('form', l).onsubmit = e => { e.preventDefault(); TOKEN = $('input', l).value.trim(); guardarLocal('token', TOKEN); l.remove(); arrancar(); };
  }
}

// ---------- router ----------
const VISTAS = {};          // las rellenan vistas.js y ajustes.js
const AJUSTES = [];         // [grupo, [[ruta, título, icono], …]]
function pintarNavAjustes(q) {
  q = q.trim().toLowerCase();
  const actual = (location.hash.match(/^#\/ajustes\/([\w-]+)/) || [])[1];
  $('#navAjustes').innerHTML = AJUSTES.map(([g, items]) => {
    const f = items.filter(([r, t]) => !q || tr(t).toLowerCase().includes(q) || t.toLowerCase().includes(q) || tr(g).toLowerCase().includes(q) || (VISTAS['ajustes/' + r]?.claves || '').includes(q));
    return f.length ? `<div class="lado-sec" style="padding-left:10px">${tr(g)}</div><nav class="lado-nav" style="padding:0">${f.map(([r, t, i]) => `<a href="#/ajustes/${r}" class="${r === actual ? 'on' : ''}">${ic(i)}<span>${tr(t)}</span></a>`).join('')}</nav>` : '';
  }).join('') || `<div class="tenue" style="padding:10px">${tr('Nada coincide.')}</div>`;
}
let modoLado = '';
async function ruta() {
  if (!TOKEN) return pantallaLogin();
  document.body.classList.remove('menu');
  const h = location.hash.replace(/^#\/?/, '') || 'inicio';
  const [seccion, sub] = h.split('/');
  document.body.classList.toggle('modo-bienvenida', seccion === 'bienvenida');   // el asistente ocupa toda la pantalla
  const modo = seccion === 'ajustes' ? 'ajustes' : 'app';
  if (modo !== modoLado) { modoLado = modo; pintarLado(modo); }
  if (modo === 'ajustes') pintarNavAjustes($('#buscaAjustes')?.value || '');
  else { $$('.lado-nav a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === seccion)); pintarSesionesLado(); }
  const clave = modo === 'ajustes' ? `ajustes/${sub || 'apariencia'}` : seccion;
  const vista = VISTAS[clave] || VISTAS.inicio;
  E.vista?.salir?.(); E.oyentes.clear();
  E.vista = vista;
  const v = $('#vista'); v.scrollTop = 0;
  try { await vista.pintar(v, sub); if (vista.alEvento) E.oyentes.add(vista.alEvento.bind(vista)); }
  catch (e) { if (TOKEN) v.innerHTML = `<div class="pagina">${vacio('info', esc(e.message))}</div>`; }
}
async function arrancar() {
  if (!TOKEN) return pantallaLogin();
  try {
    [E.estado, E.config, E.sesiones] = await Promise.all([api('GET', '/estado'), api('GET', '/config'), api('GET', '/sesiones')]);
    if (E.config.idioma) { I18N.poner(E.config.idioma); guardarLocal('idioma', E.config.idioma); }   // el idioma elegido en el núcleo manda
    else { const l = leerLocal('idioma', ''); I18N.poner(l || I18N.delSistema()); }
    $('#app').hidden = false;
    for (const p of E.estado.permisos) E.pendientes.set(p.id, p);
    // primer arranque: el asistente de bienvenida se abre solo hasta que se termina o se salta (config.bienvenida)
    if (E.config.bienvenida !== true && !/^#\/bienvenida/.test(location.hash) && !sessionStorage.getItem('rc.bienvenida-saltada')) history.replaceState(null, '', '#/bienvenida');
    modoLado = ''; conectarEventos(); ruta();
  } catch (e) { if (TOKEN) aviso(e.message, true); }
}
window.addEventListener('hashchange', ruta);
document.addEventListener('DOMContentLoaded', arrancar);
