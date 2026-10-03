// Notas de reuniones: se inyecta SOLO cuando el usuario (o una regla suya) pide tomar notas en Google Meet / Teams web / Zoom web.
// Lee los subtítulos del DOM (hablante + texto), asigna un id estable a cada bloque y manda al service worker solo lo que cambió;
// el núcleo funde las actualizaciones parciales (core/reuniones.js fusionar). No toca audio ni micrófono.
// Indicador fijo "<nombre> está tomando notas" + Parar; si los subtítulos están apagados, ofrece activarlos (clic real desde el SW).
(() => {
  if (window.__apoloReunion) return;
  const host = location.hostname;
  const plataforma = /meet\.google\.com$/.test(host) ? 'meet' : /teams\.(microsoft|live)\.com$/.test(host) ? 'teams' : /(^|\.)zoom\.(us|com)$/.test(host) ? 'zoom' : 'otra';
  const ids = new WeakMap(); let nId = 0;
  const idDe = el => { if (!ids.has(el)) ids.set(el, `b${Date.now().toString(36)}${(++nId).toString(36)}`); return ids.get(el); };
  const txt = el => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const CAP = /caption|subt[ií]tul|legend|sous-titres|untertitel/i;

  function contenedor() {
    if (plataforma === 'meet') {
      return [...document.querySelectorAll('[role="region"][aria-label]')].find(e => CAP.test(e.getAttribute('aria-label'))) ||
        document.querySelector('[jsname="dsyhDe"], .a4cQT, .iOzk7');
    }
    if (plataforma === 'teams') return document.querySelector('[data-tid="closed-caption-renderer-wrapper"], [data-tid="closed-captions-renderer"], [data-tid="closed-caption-v2-window-wrapper"]');
    if (plataforma === 'zoom') return document.querySelector('#live-transcription-subtitle, .live-transcription-subtitle__box, [class*="live-transcription-subtitle"]');
    return null;
  }
  function entradas(c) {
    const out = [];
    if (plataforma === 'meet') {
      let els = [...c.querySelectorAll('.nMcdL, .TBMuR')];
      if (!els.length) {                                   // las clases cambian: cada entrada lleva el avatar (img) + nombre + texto
        const set = new Set();
        for (const img of c.querySelectorAll('img')) { let e = img.parentElement; while (e && e !== c && !(txt(e).length > 0 && (e.innerText || '').includes('\n'))) e = e.parentElement; if (e && e !== c) set.add(e); }
        els = [...set];
      }
      for (const e of els) {
        const h = e.querySelector('.NWpY1d, .KcIKyf, .zs7s8d, [data-self-name]');
        const t = e.querySelector('.bh44bd, .ygicle, .iTTPOb, .VbkSUe');
        let hablante = txt(h), texto = txt(t);
        if (!texto) { const l = (e.innerText || '').split('\n').map(x => x.trim()).filter(Boolean); hablante = hablante || l[0] || ''; texto = l.slice(hablante ? 1 : 0).join(' '); }
        if (texto) out.push({ el: e, hablante, texto });
      }
    } else if (plataforma === 'teams') {
      for (const e of c.querySelectorAll('.fui-ChatMessageCompact, [data-tid="closed-caption-message"], .ui-chat__item')) {
        const texto = txt(e.querySelector('[data-tid="closed-caption-text"]')) || txt(e); if (texto) out.push({ el: e, hablante: txt(e.querySelector('[data-tid="author"], .ui-chat__message__author')), texto });
      }
    } else if (plataforma === 'zoom') {
      for (const e of c.querySelectorAll('.live-transcription-subtitle__item, [class*="subtitle__item"]')) { const texto = txt(e); if (texto) out.push({ el: e, hablante: '', texto }); }
      if (!out.length && txt(c)) out.push({ el: c, hablante: '', texto: txt(c) });
    }
    return out;
  }
  // botón de subtítulos de la barra de la reunión (para ofrecer activarlos)
  function botonSubtitulos() {
    return [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')].find(b => {
      const a = b.getAttribute('aria-label') || '';
      return CAP.test(a) && (/(turn on|show|activar|mostrar|activer|einschalten)/i.test(a) || b.getAttribute('aria-pressed') === 'false');
    }) || null;
  }

  const R = window.__apoloReunion = { activo: false };
  let enviados = new Map(), pendientes = [], obs = null, temp = null, reloj = null, raiz = null, t0 = 0, subtitulos = null;

  function pintar(nombre) {
    if (!raiz) {
      raiz = document.createElement('div'); raiz.id = 'apolo-reunion';
      raiz.attachShadow({ mode: 'open' }).innerHTML = `<style>
        .et{position:fixed;bottom:88px;left:16px;z-index:2147483647;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);
          background:#0b0f0d;color:#e9fff2;border:1px solid #ff5a5a;border-radius:20px;padding:5px 6px 5px 12px;font:600 12.5px system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)}
        .p{width:9px;height:9px;border-radius:50%;background:#ff4040;animation:l 1.4s ease-in-out infinite;flex:none}
        @keyframes l{50%{opacity:.25}}
        .t{font-variant-numeric:tabular-nums;color:#9fb8a9;font-weight:500}
        .av{color:#ffd27a;font-weight:500}
        button{all:unset;cursor:pointer;border-radius:14px;padding:3px 10px;font:600 12px system-ui,sans-serif}
        .parar{background:#2a1414;color:#ffb3b3;border:1px solid #a33}.parar:hover{background:#3a1818}
        .act{background:#14261b;color:#9dffc4;border:1px solid #3ddc84}.act:hover{background:#1a3424}
        [hidden]{display:none}</style>
        <div class="et" role="status"><span class="p"></span><span class="n"></span><span class="t">00:00</span>
          <span class="av" hidden>Subtítulos apagados</span><button class="act" hidden>Activarlos</button><button class="parar">Parar</button></div>`;
      const s = raiz.shadowRoot;
      s.querySelector('.parar').onclick = () => { chrome.runtime.sendMessage({ tipo: 'reunion-parar', id: R.id }); R.parar(); };
      s.querySelector('.act').onclick = () => { const b = botonSubtitulos(); if (!b) return; const r = b.getBoundingClientRect(); chrome.runtime.sendMessage({ tipo: 'reunion-activar', x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); };
      document.documentElement.appendChild(raiz);
    }
    raiz.shadowRoot.querySelector('.n').textContent = `${nombre || 'APOLO'} está tomando notas`;
  }
  function marcarSubtitulos(on) {
    if (on === subtitulos) return;
    subtitulos = on;
    if (raiz) { const s = raiz.shadowRoot; s.querySelector('.av').hidden = on; s.querySelector('.act').hidden = on || !botonSubtitulos(); }
    chrome.runtime.sendMessage({ tipo: 'reunion-estado', id: R.id, subtitulos: on });
  }

  function escanear() {
    if (!R.activo) return;
    const c = contenedor();
    const es = c ? entradas(c) : [];
    marcarSubtitulos(!!c || !botonSubtitulos());           // sin contenedor y con botón "activar" → apagados
    const ahora = Date.now();
    for (const e of es) {
      const id = idDe(e.el);
      if (enviados.get(id) === e.hablante + '\u0000' + e.texto) continue;
      enviados.set(id, e.hablante + '\u0000' + e.texto);
      const p = pendientes.find(x => x.bloque === id);
      if (p) Object.assign(p, { hablante: e.hablante, texto: e.texto, t: ahora }); else pendientes.push({ bloque: id, hablante: e.hablante, texto: e.texto, t: ahora });
    }
    if (enviados.size > 400) enviados = new Map([...enviados].slice(-200));
    if (pendientes.length) { chrome.runtime.sendMessage({ tipo: 'reunion-subs', id: R.id, eventos: pendientes.splice(0) }); }
  }
  const pronto = () => { if (!temp) temp = setTimeout(() => { temp = null; escanear(); }, 700); };

  R.empezar = (id, nombre) => {
    R.id = id; R.activo = true; t0 = Date.now(); subtitulos = null;
    pintar(nombre);
    obs?.disconnect(); obs = new MutationObserver(pronto);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    clearInterval(reloj);
    reloj = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      if (raiz) raiz.shadowRoot.querySelector('.t').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      escanear();
    }, 1000);
    escanear();
    return { plataforma, subtitulos: subtitulos !== false, titulo: document.title };
  };
  R.parar = () => {
    if (R.activo) escanear();
    R.activo = false; obs?.disconnect(); obs = null; clearInterval(reloj); clearTimeout(temp); temp = null;
    raiz?.remove(); raiz = null;
    return { ok: true };
  };
  R.boton = () => { const b = botonSubtitulos(); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
})();
