// Arañas digitales de APOLO en una página: caminan por el texto y lo "leen" (láser, letras que vuelan a la araña, esquinas HUD).
// Lo inyectan sw.js (extensión) o la ventana de arañas de APOLO (main.js), SIEMPRE después de arana-motor.js.
// El análisis lo hace el núcleo (core/aranas.js); aquí se recoge el texto COMPLETO, se anima y se pintan las marcas.
// Nunca lee campos de contraseña ni formularios.
(() => {
  if (window.__apoloAranas) return;
  const M = globalThis.AranaMotor;

  const NOMBRES = { lectora: 'LECTORA', ia: 'DETECTORA IA', codigo: 'CÓDIGO' };
  const COLORES = { lectora: '#3df2ff', ia: '#ff3df2', codigo: '#4dff88' };
  const BLOQUES = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,caption,summary,pre,article>div,section>div';
  const SALTAR = 'script,style,noscript,svg,canvas,input,textarea,select,button,[contenteditable],[aria-hidden="true"],#apolo-aranas';
  const PISTAS = {
    lectora: [[/\b97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?\d\b/g, 'ISBN'], [/\b10\.\d{4,9}\/[^\s"<>]{3,60}/g, 'DOI'], [/\bPMID:?\s?\d{6,9}\b/g, 'PMID'],
      [/\bhttps?:\/\/[^\s"<>]{6,60}/g, 'URL'], [/\b\d{1,3}\s?(d[ií]as|days|meses|months|a[ñn]os|years|horas)\b/gi, 'PLAZO'], [/(\d[\d.,]*\s?(€|\$|USD|EUR)|(€|\$)\s?\d[\d.,]*)/g, 'DINERO'], [/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, 'EMAIL']],
    codigo: [[/\beval\s*\(/g, 'eval()'], [/\.innerHTML\s*=/g, 'innerHTML'], [/\b(exec|execSync|system|popen)\s*\(/g, 'exec'], [/shell\s*=\s*True/g, 'shell=True'],
      [/\bpickle\.loads?\b/g, 'pickle'], [/\b(password|passwd|secret|api_?key|token)\s*[:=]\s*['"][^'"]{4,}/gi, 'SECRETO'], [/\b(md5|sha1)\s*\(/gi, 'hash débil'],
      [/["'`]\s*(SELECT|INSERT|UPDATE|DELETE)\b[^"'`]*["'`]\s*\+/gi, 'SQL +'], [/\bdangerouslySetInnerHTML\b/g, 'XSS?'], [/\b(sk-|ghp_|AKIA|AIza)[A-Za-z0-9_-]{10,}/g, 'CLAVE']],
    ia: [],
  };
  const GLIFOS = '01アイウエオカキクケコｱｲｳｴｵ#$%&@<>{}[]/\\=+*ABCDEF';

  // ---------- capa (shadow DOM): canvas + HUD ----------
  const host = document.createElement('div'); host.id = 'apolo-aranas';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = `<style>
    canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none}
    #hud{position:fixed;top:12px;right:12px;width:270px;font:600 11px/1.45 ui-monospace,Consolas,monospace;color:#d8f7ff;
      background:rgba(4,4,10,.9);border:1px solid #3a1f5a;border-radius:10px;padding:8px 10px;pointer-events:auto;box-shadow:0 0 0 1px #000,0 8px 30px rgba(120,0,200,.35)}
    #hud b{letter-spacing:.12em;color:#c79bff}.f{display:flex;justify-content:space-between;gap:8px}.p{opacity:.8}
    #tk{margin-top:6px;height:42px;overflow:hidden;color:#7fe3ff;opacity:.85;font-size:10px;white-space:pre-wrap;word-break:break-all;border-top:1px dashed #2a2a44;padding-top:4px}
    #n{font-size:10px;opacity:.7;margin-top:2px}
    button{all:unset;cursor:pointer;margin-top:6px;padding:2px 8px;border:1px solid #4a2b6a;border-radius:6px;color:#d0b0ff}
    button:hover{background:#1d1030}.bar{height:3px;border-radius:2px;margin:2px 0 4px;background:#16122a;overflow:hidden}.bar i{display:block;height:100%;transition:width .2s}
  </style><canvas></canvas><div id="hud"><b>🕷 ARAÑAS DE APOLO</b><div id="l"></div><div id="n"></div><div id="tk"></div><button id="x">Limpiar</button></div>`;
  (document.body || document.documentElement).appendChild(host);
  const cv = raiz.querySelector('canvas'), c = cv.getContext('2d'), hud = raiz.getElementById('l'), tk = raiz.getElementById('tk'), nEl = raiz.getElementById('n');
  let W = 0, H = 0, DPR = 1;
  const medir = () => { DPR = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; };
  medir(); addEventListener('resize', medir);

  const aranas = [], cajas = [], hilos = [], chispas = [], barridos = [];
  let ultimaRueda = 0, vivo = true, ultimo = performance.now(), leidos = 0, ticker = '', tickerObj = '';
  addEventListener('wheel', () => { ultimaRueda = performance.now(); }, { passive: true });
  addEventListener('keydown', e => { if (/Page|Arrow|Home|End|^ $/.test(e.key)) ultimaRueda = performance.now(); }, { passive: true });

  // ---------- texto de la página ----------
  const visible = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  function nodosTexto(el) {
    const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.data.trim() && !n.parentElement.closest(SALTAR)) ? 1 : 2 });
    for (let n; (n = w.nextNode());) out.push(n);
    return out;
  }
  function lineasDe(el) {
    const rr = [], r = document.createRange();
    for (const n of nodosTexto(el)) { r.selectNodeContents(n); for (const x of r.getClientRects()) if (x.width > 2 && x.height > 4) rr.push(x); }
    const lin = [];
    for (const x of rr) {
      const y = x.top + scrollY, l = lin.find(q => Math.abs(q.y - y) < 4);
      if (l) { l.x1 = Math.min(l.x1, x.left + scrollX); l.x2 = Math.max(l.x2, x.right + scrollX); l.h = Math.max(l.h, x.height); }
      else lin.push({ x1: x.left + scrollX, x2: x.right + scrollX, y, h: x.height });
    }
    return lin.sort((a, b) => a.y - b.y).slice(0, 60);
  }
  function textoCodigo() {
    const ta = document.querySelector('#read-only-cursor-text-area, textarea[aria-label*="file content" i]');
    if (!ta || !ta.value) return null;
    let el = document.querySelector('.react-code-lines, [data-testid="code-lines"], .react-code-file-contents') || ta;
    while (el.parentElement && el.getBoundingClientRect().height < 200) el = el.parentElement;
    return { el, texto: ta.value };
  }
  function zonaPrincipal() {
    return [...document.querySelectorAll('main, article, [role=main], #content, #mw-content-text, .post-content, .entry-content')]
      .filter(e => (e.innerText || '').length > 500).sort((a, b) => b.innerText.length - a.innerText.length).pop() || document.body;
  }
  // texto COMPLETO de la zona, en orden y sin el menú; si la zona se queda corta frente a la página entera, la página entera
  function textoCompleto(zona) {
    const limpio = t => String(t || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const z = limpio(zona.innerText), b = limpio(document.body.innerText);
    return z.length >= b.length * .6 ? { texto: z, de: zona === document.body ? 'página' : 'contenido principal', pagina: b.length } : { texto: b, de: 'página', pagina: b.length };
  }
  function bloquesDe(tipo, zona) {
    const res = [], vistos = new Set();
    if (tipo === 'codigo') {
      const gh = textoCodigo();
      if (gh) res.push({ el: gh.el, texto: gh.texto, t: 'codigo' });
      for (const el of document.querySelectorAll('pre, code, .blob-code-inner, .highlight, [class*="language-"]')) {
        if (el.closest('pre') && el.tagName !== 'PRE') continue;
        if ([...vistos].some(v => v.contains(el))) continue;
        const t = el.innerText || ''; if (t.trim().length < 25 || !visible(el)) continue;
        vistos.add(el); res.push({ el, texto: t, t: 'codigo' });
      }
      return res;
    }
    for (const el of zona.querySelectorAll(BLOQUES)) {
      if (el.closest(SALTAR) || el.closest('nav,[role=navigation],.mw-editsection') || (tipo === 'ia' && el.closest('footer,header,aside,.navbox,.reflist'))) continue;
      if ([...vistos].some(v => v.contains(el))) continue;
      if (el.querySelector(BLOQUES.replace(/,?(article|section)>div/g, ''))) continue;
      const t = (el.innerText || '').replace(/\s+\n/g, '\n').trim();
      if (t.length < (tipo === 'ia' ? 120 : 3) || !visible(el)) continue;
      vistos.add(el); res.push({ el, texto: t, t: el.tagName === 'PRE' ? 'codigo' : 'texto' });
    }
    return res;
  }

  // ---------- efectos ----------
  function caja(x, y, w, h, color, opts = {}) {
    const k = { x, y, w, h, color, t: performance.now(), fuerte: !!opts.fuerte, etiqueta: opts.etiqueta || '' };
    cajas.push(k); if (cajas.length > 5000) cajas.splice(0, cajas.length - 5000);
    return k;
  }
  function escanearLinea(l, color, a, texto) {      // láser que barre la línea + letras que salen volando hacia la araña
    barridos.push({ ...l, color, t: performance.now() });
    caja(l.x1, l.y, l.x2 - l.x1, l.h, color);
    const n = Math.min(9, 2 + ((l.x2 - l.x1) / 70) | 0);
    for (let i = 0; i < n; i++) chispas.push({ x: l.x1 + Math.random() * (l.x2 - l.x1), y: l.y + l.h / 2, a, color, ch: GLIFOS[Math.random() * GLIFOS.length | 0], t: 0, v: .6 + Math.random() * .8 });
    if (texto) tickerObj = texto;
    leidos++;
  }
  function rectsDeFrase(el, re) {
    const out = [], r = document.createRange();
    for (const n of nodosTexto(el)) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(n.data)) && out.length < 12) {
        r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const x = r.getBoundingClientRect(); if (x.width > 1) out.push({ x: x.left + scrollX, y: x.top + scrollY, w: x.width, h: x.height, txt: m[0] });
        if (!m[0].length) re.lastIndex++;
      }
    }
    return out;
  }
  const rectBloque = el => { const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; };

  function esquinas(x, y, w, h, l) {                  // marco HUD: solo las esquinas
    c.beginPath();
    c.moveTo(x, y + l); c.lineTo(x, y); c.lineTo(x + l, y); c.moveTo(x + w - l, y); c.lineTo(x + w, y); c.lineTo(x + w, y + l);
    c.moveTo(x + w, y + h - l); c.lineTo(x + w, y + h); c.lineTo(x + w - l, y + h); c.moveTo(x + l, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - l);
    c.stroke();
  }
  function dibujarCajas(ox, oy, ahora) {
    for (const k of cajas) {
      const x = k.x - ox, y = k.y - oy; if (y + k.h < -20 || y > H + 20) continue;
      const edad = (ahora - k.t) / 1000, nace = Math.min(1, edad / .22);
      const glitch = Math.random() < .004 ? (Math.random() - .5) * 6 : 0;
      c.save();
      c.fillStyle = k.color; c.globalAlpha = k.fuerte ? .22 + .08 * Math.sin(ahora / 300) : Math.max(.05, .16 - edad * .02);
      c.fillRect(x - 2 + glitch, y - 1, (k.w + 4) * nace, k.h + 2);
      c.strokeStyle = k.color; c.shadowColor = k.color; c.shadowBlur = k.fuerte ? 10 : 0; c.lineWidth = k.fuerte ? 1.6 : 1;
      c.globalAlpha = k.fuerte ? .95 : Math.max(.25, .7 - edad * .1);
      esquinas(x - 3 + glitch, y - 2, (k.w + 6) * nace, k.h + 4, Math.min(8, k.h / 2));
      if (k.fuerte) { c.globalAlpha = .4; c.strokeRect(x - 3, y - 2, k.w + 6, k.h + 4); }
      if (k.etiqueta) {
        c.font = '700 10px ui-monospace,Consolas,monospace'; const tw = c.measureText(k.etiqueta).width + 8;
        c.shadowBlur = 0; c.globalAlpha = nace; c.fillStyle = k.color; c.fillRect(x - 3, y - 16, tw, 13);
        c.fillStyle = '#05070d'; c.fillText(k.etiqueta, x + 1, y - 6);
      }
      c.restore();
    }
  }
  function dibujarBarridos(ox, oy, ahora) {
    for (let i = barridos.length - 1; i >= 0; i--) {
      const b = barridos[i], f = (ahora - b.t) / 380; if (f > 1) { barridos.splice(i, 1); continue; }
      const x = b.x1 - ox + (b.x2 - b.x1) * f, y = b.y - oy;
      c.save(); c.globalAlpha = 1 - f * .6; c.strokeStyle = b.color; c.shadowColor = b.color; c.shadowBlur = 16; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x, y + b.h + 3); c.stroke();
      const g = c.createLinearGradient(x - 60, 0, x, 0); g.addColorStop(0, b.color + '00'); g.addColorStop(1, b.color + '55');
      c.fillStyle = g; c.fillRect(x - 60, y, 60, b.h); c.restore();
    }
  }
  function dibujarChispas(ox, oy, dt) {
    c.save(); c.font = '700 11px ui-monospace,Consolas,monospace';
    for (let i = chispas.length - 1; i >= 0; i--) {
      const p = chispas[i]; p.t += dt * p.v * 1.4; if (p.t >= 1 || !p.a) { chispas.splice(i, 1); continue; }
      const e = p.t * p.t, dx = p.a.x - p.x, dy = p.a.y - p.y;
      const x = p.x + dx * e - ox + Math.sin(p.t * 9 + i) * 6 * (1 - p.t), y = p.y + dy * e - oy - Math.sin(p.t * Math.PI) * 30;
      c.globalAlpha = 1 - p.t * .7; c.fillStyle = p.color; c.shadowColor = p.color; c.shadowBlur = 6;
      if (Math.random() < .15) p.ch = GLIFOS[Math.random() * GLIFOS.length | 0];
      c.fillText(p.ch, x, y);
    }
    c.restore();
  }
  function dibujarHilos(ox, oy) {
    c.save(); c.lineWidth = .8;
    for (const a of aranas) {
      for (const m of a.marcas.slice(-4)) { c.globalAlpha = .3 * a.alpha; c.strokeStyle = a.color; c.beginPath(); c.moveTo(a.x - ox, a.y - oy); c.lineTo(m.x - ox, m.y - oy); c.stroke(); }
      if (a.rastro && a.rastro.length > 1) {          // hilo de seda que deja detrás
        c.globalAlpha = .22 * a.alpha; c.strokeStyle = a.color; c.beginPath(); c.moveTo(a.rastro[0].x - ox, a.rastro[0].y - oy);
        for (const p of a.rastro) c.lineTo(p.x - ox, p.y - oy); c.stroke();
      }
    }
    for (const h of hilos) { c.globalAlpha = .2; c.strokeStyle = h.color; c.beginPath(); c.moveTo(h.x1 - ox, h.y1 - oy); c.lineTo(h.x2 - ox, h.y2 - oy); c.stroke(); }
    c.restore();
  }

  let total = 0, hudT = 0;
  function pintarHud() {
    const filas = new Map();
    for (const a of aranas) if (!a.fuera) filas.set(a.tipo, a);
    hud.innerHTML = [...filas.values()].map(a => {
      const pct = Math.round(100 * Math.min(1, a.hechos / Math.max(1, a.total)));
      return `<div class="f"><span style="color:${a.color}">● ${NOMBRES[a.tipo] || a.tipo}</span><span class="p">${a.estado || pct + '%'}</span></div><div class="bar"><i style="width:${pct}%;background:${a.color}"></i></div>`;
    }).join('') || '<div class="p">Escaneo terminado. Las marcas se quedan hasta que pulses Limpiar.</div>';
    nEl.textContent = total ? `${leidos.toLocaleString()} líneas escaneadas · ${total.toLocaleString()} caracteres` : '';
    if (ticker.length < tickerObj.length || !tickerObj.startsWith(ticker)) ticker = tickerObj.startsWith(ticker) ? tickerObj.slice(0, ticker.length + 6) : tickerObj.slice(0, 6);
    tk.textContent = '> ' + ticker.slice(-150) + (Math.floor(performance.now() / 400) % 2 ? '▌' : '');
  }

  function frame(ahora) {
    if (!vivo) return;
    const dt = Math.min(0.05, (ahora - ultimo) / 1000); ultimo = ahora;
    for (const a of [...aranas]) {
      M.mover(a, dt);
      a.haz = !!a.ruta.length && !a.fuera;
      (a.rastro ||= []).push({ x: a.x, y: a.y }); if (a.rastro.length > 40) a.rastro.shift();
      if (a.fuera && a.alpha <= 0) aranas.splice(aranas.indexOf(a), 1);
    }
    const lider = aranas.find(a => a.lider && !a.fuera && a.ruta.length);
    if (lider && ahora - ultimaRueda > 2500) {
      const vy = lider.y - scrollY;
      if (vy > H * 0.68 || vy < H * 0.12) scrollBy(0, (vy - H * 0.42) * Math.min(1, dt * 4));
    }
    c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
    dibujarCajas(scrollX, scrollY, ahora); dibujarBarridos(scrollX, scrollY, ahora); dibujarHilos(scrollX, scrollY); dibujarChispas(scrollX, scrollY, dt);
    for (const a of aranas) M.dibujar(c, a, scrollX, scrollY, { W, H });
    if (ahora - hudT > 120) { pintarHud(); hudT = ahora; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- rutas ----------
  const entrada = () => ({ x: scrollX + W - 40, y: scrollY - 30 });   // bajan desde arriba a la derecha
  function rutaLectura(lista, a, color, tipo) {
    const pistas = PISTAS[tipo] || [];
    lista.forEach(b => {
      let lin = lineasDe(b.el);
      if (!lin.length) {
        const r = rectBloque(b.el); if (r.w < 5 || r.h < 5) { a.ruta.push({ x: a.x, y: a.y, al: ar => { ar.hechos++; } }); return; }
        lin = Array.from({ length: Math.min(40, Math.ceil(r.h / 22)) }, (_, k) => ({ x1: r.x + 8, x2: r.x + Math.min(r.w, 900) - 8, y: r.y + k * 22, h: 18 }));
      }
      const frases = b.texto.split('\n').filter(Boolean);
      const paso = Math.max(1, Math.ceil(lin.length / 6));
      lin.forEach((l, j) => {
        const trozo = frases[Math.min(frases.length - 1, Math.floor(j / lin.length * frases.length))] || '';
        if (j % paso && j !== lin.length - 1) { a.ruta.push({ x: l.x1, y: l.y + l.h / 2, al: ar => escanearLinea(l, color, ar, trozo) }); return; }
        a.ruta.push({ x: l.x1, y: l.y + l.h / 2 });
        a.ruta.push({ x: l.x2, y: l.y + l.h / 2, al: ar => escanearLinea(l, color, ar, trozo) });
      });
      const u = lin[lin.length - 1];
      a.ruta.push({ x: u.x2, y: u.y + u.h / 2, al: ar => {
        for (const [re, et] of pistas) for (const r of rectsDeFrase(b.el, new RegExp(re.source, re.flags))) { caja(r.x, r.y, r.w, r.h, color, { fuerte: true, etiqueta: et }); ar.marcas.push({ x: r.x, y: r.y }); }
        ar.hechos++;
      } });
    });
    a.total = lista.length;
    const largo = a.ruta.reduce((s, p, i, r) => s + (i ? Math.hypot(p.x - r[i - 1].x, p.y - r[i - 1].y) : 0), 0);
    a.vel = Math.max(450, Math.min(1600, largo / 50));
  }

  // ---------- API (sw.js o la ventana de arañas de APOLO) ----------
  let bloquesVivos = [];
  window.__apoloAranas = {
    soltar({ tipo = 'lectora', color, cuantas } = {}) {
      vivo = true; host.style.display = '';
      color = color || COLORES[tipo] || '#7fe3ff';
      const zona = zonaPrincipal();
      const lista = bloquesDe(tipo, zona);
      const base = bloquesVivos.length;
      lista.forEach((b, i) => { b.i = base + i; });
      bloquesVivos.push(...lista);
      const comp = textoCompleto(zona);
      total += comp.texto.length;
      const n = Math.max(1, Math.min(4, cuantas || (tipo === 'lectora' ? (lista.length > 40 ? 3 : 2) : 1)));
      const trozos = Array.from({ length: n }, (_, k) => lista.filter((_, i) => Math.floor(i * n / Math.max(1, lista.length)) === k));
      trozos.forEach((tr, k) => {
        const e = entrada(), a = M.crear(tipo, color, e.x - k * 60, e.y - k * 30, { r: 12 });
        aranas.push(a); a.lider = k === 0;
        if (!tr.length) { a.ruta.push({ x: scrollX + W / 2, y: scrollY + H / 2 }); a.estado = 'nada que leer'; a.vagar = { x: scrollX + W / 2, y: scrollY + H / 2 }; return; }
        rutaLectura(tr, a, color, tipo);
        const ult = a.ruta[a.ruta.length - 1] || { x: scrollX + W / 2, y: scrollY + H / 2 };
        a.ruta.push({ x: ult.x, y: ult.y, al: ar => { ar.estado = 'leído ✓'; ar.vagar = { x: ar.x, y: ar.y }; } });
      });
      const sumaBloques = lista.reduce((s, b) => s + b.texto.length, 0);
      return { titulo: document.title, url: location.href, bloques: lista.map(b => ({ i: b.i, t: b.t, texto: b.texto.slice(0, 20000) })), total: lista.length,
        completo: comp.texto, de: comp.de, caracteresPagina: comp.pagina, caracteresBloques: sumaBloques };
    },
    marcar({ tipo, marcas = [], color } = {}) {
      color = color || COLORES[tipo] || '#ff3df2';
      let a = aranas.find(x => x.tipo === tipo && !x.fuera);
      if (!a) { const e = entrada(); a = M.crear(tipo, color, e.x, e.y, { r: 12 }); aranas.push(a); }
      a.ruta.length = 0; a.vel = 900; a.estado = 'marcando'; a.hechos = 0; a.total = marcas.length || 1; a.lider = true; a.vagar = null;
      let ok = 0;
      for (const m of marcas) {
        let b = bloquesVivos.find(x => x.i === m.i);
        if ((!b || !b.el.isConnected) && m.frase) { const f = String(m.frase).replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase(); b = bloquesVivos.find(x => x.el.isConnected && x.texto.replace(/\s+/g, ' ').toLowerCase().includes(f)); }
        if (!b || !b.el.isConnected) continue;
        const col = m.color || color;
        let rs = [];
        if (m.frase) { const f = String(m.frase).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); try { rs = rectsDeFrase(b.el, new RegExp(f, 'gi')).slice(0, 1); } catch { } }
        if (!rs.length) rs = [rectBloque(b.el)];
        const r = rs[0];
        a.ruta.push({ x: r.x - 14, y: r.y + Math.min(r.h, 30) / 2 });
        a.ruta.push({ x: r.x + Math.min(r.w, 400), y: r.y + Math.min(r.h, 30) / 2, al: ar => {
          caja(r.x, r.y, r.w, r.h, col, { fuerte: true, etiqueta: m.etiqueta || '' }); ar.marcas.push({ x: r.x, y: r.y }); ar.hechos++;
          ar.pausa = .6; ar.temblor = 1;                    // se para encima y levanta las patas
          const prev = ar.marcas[ar.marcas.length - 2]; if (prev) hilos.push({ x1: prev.x, y1: prev.y, x2: r.x, y2: r.y, color: col });
          tickerObj = `[${m.etiqueta || 'MARCA'}] ${m.frase || b.texto.slice(0, 120)}`;
        } });
        ok++;
      }
      const ult = a.ruta[a.ruta.length - 1] || { x: a.x, y: a.y };
      a.ruta.push({ x: ult.x, y: ult.y, al: ar => { ar.estado = `${ok} marcas ✓`; ar.vagar = { x: ar.x, y: ar.y }; } });
      return { ok: true, marcadas: ok };
    },
    recoger({ tipo } = {}) {
      for (const a of aranas) if (!tipo || a.tipo === tipo) { a.vagar = null; a.pausa = 0; a.ruta = [{ x: scrollX + W - 30, y: scrollY - 40, al: ar => { ar.fuera = true; } }]; a.vel = 1100; a.lider = false; }
      return { ok: true };
    },
    siguiente() {
      const cand = [...document.querySelectorAll('a[rel~="next"], link[rel~="next"], a, button')].find(e =>
        (e.rel && /next/.test(e.rel)) || /^\s*(siguiente|next( page)?|p[aá]gina siguiente|continuar|›|»|>)\s*$/i.test(e.innerText || e.getAttribute('aria-label') || ''));
      if (!cand) return { url: null };
      const url = cand.href || null;
      if (url && /^https?:/.test(url)) { location.href = url; return { url }; }
      cand.click(); return { url: location.href, clic: true };
    },
    estado() { return { aranas: aranas.map(a => ({ tipo: a.tipo, estado: a.estado || '', pct: Math.round(100 * a.hechos / Math.max(1, a.total)), pendiente: a.ruta.length })) }; },
    limpiar() { vivo = false; host.remove(); delete window.__apoloAranas; return { ok: true }; },
  };
  raiz.getElementById('x').addEventListener('click', () => window.__apoloAranas.limpiar());
})();
