// Arañas digitales de APOLO: salen a la página, caminan por el texto y lo van "leyendo" (marcas neón).
// Lo inyecta sw.js (OPS.aranas). El análisis lo hace el núcleo (core/aranas.js); aquí solo se recoge el texto,
// se anima y se pintan las marcas que manda el núcleo. Nunca lee campos de contraseña ni formularios.
(() => {
  if (window.__apoloAranas) return;

  const NOMBRES = { lectora: 'LECTORA', ia: 'DETECTORA IA', codigo: 'CÓDIGO' };
  const BLOQUES = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,caption,summary,pre,article>div,section>div';
  const SALTAR = 'script,style,noscript,svg,canvas,input,textarea,select,button,[contenteditable],[aria-hidden="true"],#apolo-aranas';
  const PISTAS = {   // lo que la lectora marca al pasar (como en el vídeo: ISBN, DOI, enlaces…)
    lectora: [[/\b97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?\d\b/g, 'ISBN'], [/\b10\.\d{4,9}\/[^\s"<>]{3,60}/g, 'DOI'], [/\bPMID:?\s?\d{6,9}\b/g, 'PMID'],
      [/\bhttps?:\/\/[^\s"<>]{6,60}/g, 'URL'], [/\b(1[5-9]|20)\d{2}\b/g, 'AÑO'], [/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, 'EMAIL']],
    codigo: [[/\beval\s*\(/g, 'eval()'], [/\.innerHTML\s*=/g, 'innerHTML'], [/\b(exec|execSync|system|popen)\s*\(/g, 'exec'], [/shell\s*=\s*True/g, 'shell=True'],
      [/\bpickle\.loads?\b/g, 'pickle'], [/\b(password|passwd|secret|api_?key|token)\s*[:=]\s*['"][^'"]{4,}/gi, 'SECRETO'], [/\b(md5|sha1)\s*\(/gi, 'hash débil'],
      [/["'`]\s*(SELECT|INSERT|UPDATE|DELETE)\b[^"'`]*["'`]\s*\+/gi, 'SQL +'], [/\bdangerouslySetInnerHTML\b/g, 'XSS?'], [/\b(sk-|ghp_|AKIA|AIza)[A-Za-z0-9_-]{10,}/g, 'CLAVE']],
    ia: [],
  };

  // ---------- capa (shadow DOM): canvas a pantalla completa + HUD ----------
  const host = document.createElement('div'); host.id = 'apolo-aranas';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = `<style>
    canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none}
    #hud{position:fixed;top:12px;right:12px;min-width:210px;max-width:300px;font:600 11px/1.45 ui-monospace,Consolas,monospace;color:#d8f7ff;
      background:rgba(4,8,18,.86);border:1px solid #1d3550;border-radius:10px;padding:8px 10px;pointer-events:auto;box-shadow:0 6px 24px rgba(0,0,0,.5)}
    #hud b{letter-spacing:.08em;color:#7fe3ff}.f{display:flex;justify-content:space-between;gap:8px}.p{opacity:.8}
    button{all:unset;cursor:pointer;margin-top:6px;padding:2px 8px;border:1px solid #2b4a6a;border-radius:6px;color:#9fd8ff}
    button:hover{background:#12263d}.bar{height:3px;border-radius:2px;margin:2px 0 4px;background:#13243a;overflow:hidden}.bar i{display:block;height:100%}
  </style><canvas></canvas><div id="hud"><b>🕷 ARAÑAS DE APOLO</b><div id="l"></div><button id="x">Limpiar</button></div>`;
  (document.body || document.documentElement).appendChild(host);
  const cv = raiz.querySelector('canvas'), c = cv.getContext('2d'), hud = raiz.getElementById('l');
  let W = 0, H = 0, DPR = 1;
  const medir = () => { DPR = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; };
  medir(); addEventListener('resize', medir);

  const aranas = [], cajas = [], hilos = [];
  let ultimaRueda = 0, vivo = true, ultimo = performance.now();
  addEventListener('wheel', () => { ultimaRueda = performance.now(); }, { passive: true });
  addEventListener('keydown', e => { if (/Page|Arrow|Home|End|^ $/.test(e.key)) ultimaRueda = performance.now(); }, { passive: true });

  // ---------- texto de la página → bloques con sus líneas (coordenadas de documento) ----------
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
  function textoCodigo() {   // visor de GitHub y parecidos: el código vive en un textarea de solo lectura
    const ta = document.querySelector('#read-only-cursor-text-area, textarea[aria-label*="file content" i]');
    if (!ta || !ta.value) return null;
    let el = document.querySelector('.react-code-lines, [data-testid="code-lines"], .react-code-file-contents') || ta;
    while (el.parentElement && el.getBoundingClientRect().height < 200) el = el.parentElement;   // la caja visible del código
    return { el, texto: ta.value };
  }
  function bloquesDe(tipo) {
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
    // el contenido principal si la página lo marca (Wikipedia, blogs, docs); si no, toda la página
    const zona = [...document.querySelectorAll('main, article, [role=main], #content, #mw-content-text, .post-content, .entry-content')]
      .filter(e => (e.innerText || '').length > 500).sort((a, b) => b.innerText.length - a.innerText.length).pop() || document.body;
    for (const el of zona.querySelectorAll(BLOQUES)) {
      if (el.closest(SALTAR) || el.closest('nav,footer,header,aside,[role=navigation],[role=banner],.navbox,.mw-editsection,.reflist') && tipo !== 'lectora' || el.closest('nav,[role=navigation],.mw-editsection')) continue;
      if ([...vistos].some(v => v.contains(el))) continue;
      if (el.querySelector(BLOQUES.replace(/,?(article|section)>div/g, ''))) continue;   // solo bloques "hoja"
      const t = (el.innerText || '').replace(/\s+\n/g, '\n').trim();
      if (t.length < (tipo === 'ia' ? 120 : 3) || !visible(el)) continue;
      vistos.add(el); res.push({ el, texto: t, t: el.tagName === 'PRE' ? 'codigo' : 'texto' });
    }
    return res;
  }

  // ---------- la araña ----------
  // 8 patas de dos segmentos; cada punta se queda clavada hasta que el cuerpo se aleja y entonces da un paso (marcha alterna)
  const PATAS = [[0.95, 1.0], [0.35, 1.25], [-0.25, 1.25], [-0.85, 1.0]];
  function nuevaArana(tipo, color, x, y) {
    const a = { tipo, color, nombre: NOMBRES[tipo] || tipo.toUpperCase(), x, y, ang: Math.PI / 2, r: 9, vel: 900, ruta: [], hechos: 0, total: 1,
      patas: [], fase: 0, fuera: false, alpha: 0, lider: false, marcas: [] };
    for (let k = 0; k < 8; k++) a.patas.push({ px: x, py: y, sx: x, sy: y, t: 1 });
    const bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255];
    a.oscuro = (+bg[0] + +bg[1] + +bg[2]) / 3 < 90 && (bg[3] == null || +bg[3] > 0);
    aranas.push(a); return a;
  }
  function reposo(a, k) {
    const [f, s] = PATAS[k % 4], lado = k < 4 ? -1 : 1, R = a.r * 2.1, ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    const fx = f * R, sy = lado * s * R;
    return [a.x + ca * fx - sa * sy, a.y + sa * fx + ca * sy];
  }
  function moverArana(a, dt) {
    a.alpha = Math.min(1, a.alpha + dt * 2.5);
    const obj = a.ruta[0];
    let andando = false;
    if (obj) {
      const dx = obj.x - a.x, dy = obj.y - a.y, d = Math.hypot(dx, dy), paso = a.vel * dt;
      if (d > 0.5) { a.ang += (((Math.atan2(dy, dx) - a.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 14); andando = true; }
      if (d <= paso) { a.x = obj.x; a.y = obj.y; a.ruta.shift(); obj.al && obj.al(a); }
      else { a.x += dx / d * paso; a.y += dy / d * paso; }
    } else if (!a.fuera && a.vagar) {                        // sin trabajo: merodea cerca de su última marca
      if (Math.random() < dt * 0.6) a.ruta.push({ x: a.vagar.x + (Math.random() - .5) * 140, y: a.vagar.y + (Math.random() - .5) * 80 });
    }
    if (a.fuera) { a.alpha -= dt * 1.4; if (a.alpha <= 0) aranas.splice(aranas.indexOf(a), 1); }
    a.fase += dt * (andando ? 1 : 0.2);
    const grupo = Math.floor(a.fase * 7) % 2;
    a.patas.forEach((p, k) => {
      const [rx, ry] = reposo(a, k);
      if (p.t >= 1 && (k + (k < 4 ? 0 : 1)) % 2 === grupo && Math.hypot(rx - p.px, ry - p.py) > a.r * 1.2) {
        const lead = Math.min(1, a.vel / 1500) * a.r;
        p.sx = p.px; p.sy = p.py; p.tx = rx + Math.cos(a.ang) * lead; p.ty = ry + Math.sin(a.ang) * lead; p.t = 0;
      }
      if (p.t < 1) { p.t = Math.min(1, p.t + dt * 9); p.px = p.sx + (p.tx - p.sx) * p.t; p.py = p.sy + (p.ty - p.sy) * p.t; }
      if (Math.hypot(rx - p.px, ry - p.py) > a.r * 2.6) { p.px = rx; p.py = ry; p.t = 1; }   // muy rápido: la pata no se estira, se recoloca
    });
  }
  function dibujarArana(a, ox, oy) {
    const x = a.x - ox, y = a.y - oy;
    if (x < -60 || y < -60 || x > W + 60 || y > H + 60) return;
    c.save(); c.globalAlpha = Math.max(0, a.alpha); c.lineCap = 'round';
    const claro = !a.oscuro;
    for (const capa of claro ? [0, 1] : [1]) {
    c.strokeStyle = capa ? a.color : 'rgba(5,8,16,.75)'; c.fillStyle = a.color; c.shadowColor = capa ? a.color : 'transparent'; c.shadowBlur = capa ? 10 : 0; c.lineWidth = capa ? 1.4 : 3.4;
    a.patas.forEach((p, k) => {
      const lado = k < 4 ? -1 : 1, [f] = PATAS[k % 4];
      const bx = x + Math.cos(a.ang) * f * a.r * 0.35, by = y + Math.sin(a.ang) * f * a.r * 0.35;
      const tx = p.px - ox, ty = p.py - oy, mx = (bx + tx) / 2, my = (by + ty) / 2;
      const nx = -Math.sin(a.ang) * lado, ny = Math.cos(a.ang) * lado, lift = p.t < 1 ? Math.sin(p.t * Math.PI) * 4 : 0;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(mx + nx * a.r * 0.7, my + ny * a.r * 0.7 - a.r * 0.5 - lift); c.lineTo(tx, ty - lift * .3); c.stroke();
    });
    }
    c.strokeStyle = a.color; c.shadowColor = a.color; c.shadowBlur = 10; c.lineWidth = 1.4;
    c.translate(x, y); c.rotate(a.ang);
    c.beginPath(); c.ellipse(-a.r * 0.95, 0, a.r * 0.85, a.r * 0.62, 0, 0, Math.PI * 2); c.globalAlpha *= .35; c.fill(); c.globalAlpha = Math.max(0, a.alpha); c.stroke();
    c.beginPath(); c.arc(a.r * 0.15, 0, a.r * 0.42, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0; c.fillStyle = '#fff'; c.fillRect(a.r * 0.42, -2.2, 1.6, 1.6); c.fillRect(a.r * 0.42, 0.8, 1.6, 1.6);
    c.globalAlpha = Math.max(0, a.alpha) * (0.35 + 0.25 * Math.sin(performance.now() / 90));   // haz de escaneo
    c.beginPath(); c.moveTo(a.r * .6, 0); c.lineTo(a.r * 3.2, -a.r * .9); c.lineTo(a.r * 3.2, a.r * .9); c.closePath(); c.fill();
    c.restore();
  }

  // ---------- cajas (lo leído y lo marcado) ----------
  function caja(x, y, w, h, color, opts = {}) {
    const k = { x, y, w, h, color, t: performance.now(), fuerte: !!opts.fuerte, etiqueta: opts.etiqueta || '', fondo: opts.fondo };
    cajas.push(k); if (cajas.length > 4000) cajas.splice(0, cajas.length - 4000);
    return k;
  }
  function rectsDeFrase(el, re) {   // rectángulos (documento) de cada coincidencia dentro del bloque
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
  function rectBloque(el) { const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; }

  function dibujarCajas(ox, oy, ahora) {
    for (const k of cajas) {
      const x = k.x - ox, y = k.y - oy; if (y + k.h < -20 || y > H + 20) continue;
      const nace = Math.min(1, (ahora - k.t) / 220);
      c.save(); c.globalAlpha = nace;
      c.fillStyle = k.fondo || k.color; c.globalAlpha = nace * (k.fuerte ? 0.28 : 0.09); c.fillRect(x - 2, y - 1, (k.w + 4) * (k.fuerte ? 1 : nace), k.h + 2);
      c.globalAlpha = nace * (k.fuerte ? 0.95 : 0.35); c.strokeStyle = k.color; c.lineWidth = k.fuerte ? 1.6 : 1; c.shadowColor = k.color; c.shadowBlur = k.fuerte ? 8 : 0;
      c.strokeRect(x - 2.5, y - 1.5, (k.w + 5) * (k.fuerte ? 1 : nace), k.h + 3);
      if (k.etiqueta) {
        c.font = '700 10px ui-monospace,Consolas,monospace'; const tw = c.measureText(k.etiqueta).width + 8;
        c.shadowBlur = 0; c.globalAlpha = nace; c.fillStyle = k.color; c.fillRect(x - 2.5, y - 15, tw, 13);
        c.fillStyle = '#05070d'; c.fillText(k.etiqueta, x + 1.5, y - 5);
      }
      c.restore();
    }
  }
  function dibujarHilos(ox, oy) {   // telaraña: hilos de cada araña a sus últimas marcas
    c.save(); c.lineWidth = .8;
    for (const a of aranas) for (const m of a.marcas.slice(-4)) {
      c.globalAlpha = .28 * a.alpha; c.strokeStyle = a.color;
      c.beginPath(); c.moveTo(a.x - ox, a.y - oy); c.lineTo(m.x - ox, m.y - oy); c.stroke();
    }
    for (const h of hilos) { c.globalAlpha = .18; c.strokeStyle = h.color; c.beginPath(); c.moveTo(h.x1 - ox, h.y1 - oy); c.lineTo(h.x2 - ox, h.y2 - oy); c.stroke(); }
    c.restore();
  }

  function pintarHud() {
    const filas = new Map();
    for (const a of aranas) if (!a.fuera) filas.set(a.tipo, a);
    hud.innerHTML = [...filas.values()].map(a => {
      const pct = Math.round(100 * Math.min(1, a.hechos / Math.max(1, a.total)));
      return `<div class="f"><span style="color:${a.color}">● ${a.nombre}</span><span class="p">${a.estado || pct + '%'}</span></div><div class="bar"><i style="width:${pct}%;background:${a.color}"></i></div>`;
    }).join('') || '<div class="p">Escaneo terminado. Las marcas se quedan hasta que pulses Limpiar.</div>';
  }

  function frame(ahora) {
    if (!vivo) return;
    const dt = Math.min(0.05, (ahora - ultimo) / 1000); ultimo = ahora;
    for (const a of [...aranas]) moverArana(a, dt);
    const lider = aranas.find(a => a.lider && !a.fuera && a.ruta.length);
    if (lider && ahora - ultimaRueda > 2500) {                  // la página sigue a la araña líder
      const vy = lider.y - scrollY;
      if (vy > H * 0.68 || vy < H * 0.12) scrollBy(0, (vy - H * 0.42) * Math.min(1, dt * 4));
    }
    c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
    dibujarCajas(scrollX, scrollY, ahora); dibujarHilos(scrollX, scrollY);
    for (const a of aranas) dibujarArana(a, scrollX, scrollY);
    if (ahora - hudT > 250) { pintarHud(); hudT = ahora; }
    requestAnimationFrame(frame);
  }
  let hudT = 0;
  requestAnimationFrame(frame);

  // ---------- rutas ----------
  function puntoEntrada() { return { x: scrollX + W - 40, y: scrollY - 30 }; }   // bajan desde arriba a la derecha (donde vive la barra del navegador)
  function rutaLectura(lista, a, color, tipo) {
    const pistas = PISTAS[tipo] || [];
    let total = 0;
    lista.forEach(b => {
      let lin = lineasDe(b.el);
      if (!lin.length) {                                   // código pintado sin nodos de texto (visor de GitHub…): barrer la caja en filas
        const r = rectBloque(b.el); if (r.w < 5 || r.h < 5) return;
        lin = Array.from({ length: Math.min(40, Math.ceil(r.h / 22)) }, (_, k) => ({ x1: r.x + 8, x2: r.x + Math.min(r.w, 900) - 8, y: r.y + k * 22, h: 18 }));
      }
      const paso = Math.max(1, Math.ceil(lin.length / 6));
      lin.forEach((l, j) => {
        if (j % paso && j !== lin.length - 1) { a.ruta.push({ x: l.x1, y: l.y + l.h / 2, al: () => caja(l.x1, l.y, l.x2 - l.x1, l.h, color) }); total++; return; }
        a.ruta.push({ x: l.x1, y: l.y + l.h / 2 });
        a.ruta.push({ x: l.x2, y: l.y + l.h / 2, al: () => caja(l.x1, l.y, l.x2 - l.x1, l.h, color) }); total += 2;
      });
      if (pistas.length) a.ruta.push({ x: lin[lin.length - 1].x2, y: lin[lin.length - 1].y, al: ar => {
        for (const [re, et] of pistas) for (const r of rectsDeFrase(b.el, new RegExp(re.source, re.flags))) {
          caja(r.x, r.y, r.w, r.h, color, { fuerte: true, etiqueta: et }); ar.marcas.push({ x: r.x, y: r.y });
        }
      } });
      a.ruta.push({ al: ar => { ar.hechos++; } , x: lin[lin.length - 1].x2, y: lin[lin.length - 1].y + lin[lin.length - 1].h / 2 });
    });
    a.total = lista.length;
    const largo = a.ruta.reduce((s, p, i, r) => s + (i ? Math.hypot(p.x - r[i - 1].x, p.y - r[i - 1].y) : 0), 0);
    a.vel = Math.max(600, Math.min(2200, largo / 45));                    // ~40 s de paseo como mucho
    return total;
  }

  // ---------- API (la llama sw.js) ----------
  const COLORES = { lectora: '#3df2ff', ia: '#ff3df2', codigo: '#4dff88' };
  let bloquesVivos = [];
  window.__apoloAranas = {
    soltar({ tipo = 'lectora', color, cuantas, max = 120000 } = {}) {
      vivo = true; host.style.display = '';
      color = color || COLORES[tipo] || '#7fe3ff';
      const lista = bloquesDe(tipo);
      const base = bloquesVivos.length;
      lista.forEach((b, i) => { b.i = base + i; });
      bloquesVivos.push(...lista);
      const n = Math.max(1, Math.min(4, cuantas || (tipo === 'lectora' ? (lista.length > 40 ? 3 : 2) : 1)));
      const trozos = Array.from({ length: n }, (_, k) => lista.filter((_, i) => Math.floor(i * n / Math.max(1, lista.length)) === k));
      trozos.forEach((tr, k) => {
        const e = puntoEntrada(), a = nuevaArana(tipo, color, e.x - k * 60, e.y - k * 30);
        a.lider = k === 0;
        if (!tr.length) { a.ruta.push({ x: scrollX + W / 2, y: scrollY + H / 2 }); a.estado = 'nada que leer'; a.vagar = { x: scrollX + W / 2, y: scrollY + H / 2 }; return; }
        rutaLectura(tr, a, color, tipo);
        const ult = a.ruta[a.ruta.length - 1] || { x: scrollX + W / 2, y: scrollY + H / 2 };
        a.ruta.push({ x: ult.x, y: ult.y, al: ar => { ar.estado = 'leído ✓'; ar.vagar = { x: ar.x, y: ar.y }; } });
      });
      let usado = 0;
      const bloques = [];
      for (const b of lista) { if (usado > max) break; const t = b.texto.slice(0, 8000); usado += t.length; bloques.push({ i: b.i, t: b.t, texto: t }); }
      return { titulo: document.title, url: location.href, bloques, total: lista.length, cortado: usado > max, caracteres: lista.reduce((s, b) => s + b.texto.length, 0) };
    },
    marcar({ tipo, marcas = [], color } = {}) {
      color = color || COLORES[tipo] || '#ff3df2';
      let a = aranas.find(x => x.tipo === tipo && !x.fuera);
      if (!a) { const e = puntoEntrada(); a = nuevaArana(tipo, color, e.x, e.y); }
      a.ruta.length = 0; a.vel = 1100; a.estado = 'marcando'; a.hechos = 0; a.total = marcas.length || 1; a.lider = true;
      let ok = 0;
      for (const m of marcas) {
        const b = bloquesVivos.find(x => x.i === m.i); if (!b || !b.el.isConnected) continue;
        const col = m.color || color;
        let rs = [];
        if (m.frase) { const f = String(m.frase).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); try { rs = rectsDeFrase(b.el, new RegExp(f, 'gi')).slice(0, 1); } catch { } }
        if (!rs.length) rs = [rectBloque(b.el)];
        const r = rs[0];
        a.ruta.push({ x: r.x - 14, y: r.y + Math.min(r.h, 30) / 2 });
        a.ruta.push({ x: r.x + Math.min(r.w, 400), y: r.y + Math.min(r.h, 30) / 2, al: ar => {
          caja(r.x, r.y, r.w, r.h, col, { fuerte: true, etiqueta: m.etiqueta || '' }); ar.marcas.push({ x: r.x, y: r.y }); ar.hechos++;
          const prev = ar.marcas[ar.marcas.length - 2]; if (prev) hilos.push({ x1: prev.x, y1: prev.y, x2: r.x, y2: r.y, color: col });
        } });
        ok++;
      }
      a.ruta.push({ x: a.x, y: a.y, al: ar => { ar.estado = `${ok} marcas ✓`; ar.vagar = { x: ar.x, y: ar.y }; } });
      if (a.ruta.length > 1) { const p = a.ruta[a.ruta.length - 2]; a.ruta[a.ruta.length - 1].x = p.x; a.ruta[a.ruta.length - 1].y = p.y; }
      return { ok: true, marcadas: ok };
    },
    recoger({ tipo } = {}) {   // vuelven al casco: suben por la derecha y se desvanecen; las marcas se quedan
      for (const a of aranas) if (!tipo || a.tipo === tipo) { a.vagar = null; a.ruta = [{ x: scrollX + W - 30, y: scrollY - 40, al: ar => { ar.fuera = true; } }]; a.vel = 1400; a.lider = false; }
      return { ok: true };
    },
    siguiente() {   // libro / artículo por páginas: botón o enlace "siguiente"
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
