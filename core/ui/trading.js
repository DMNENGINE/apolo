// Mission Control → Trading: la sala del enjambre de DMN Trader en pixel-art. Cada agente es un trader en su mesa;
// una zona por equipo (la Pi central, el PC u otros nodos). Pensado para 300+ agentes: dibujo a ~12 fps y datos cada 5 s.
// Datos: GET /v1/trading/mapa (proxy a la central, core/trading.js). Los personajes son los de mision-mundo-arte.js (mmPJ).

const TR_W = 1100, TR_H = 740;
const TR_ROPA = { ema_cruce: '#3b6fb6', rsi_rev: '#8a4fb5', ruptura: '#c08a2e', bollinger: '#2f8f8f', impulso: '#b5452f' };
const TR_PANT = { '1m': '#30344a', '5m': '#3a4520', '15m': '#4a2a2a' };
const TR_SOMB = ['', '', 'gorra', 'casco', 'capucha'];
const trHash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

// caché propia de sprites ya escalados (20×38): con cientos de traders andando, la del Mundo (1.500) se vaciaría cada fotograma
const TR_SPR = new Map();
function trSprite(L, dir, f, anda) {
  const k = `${L.k}|${dir}|${f}|${anda ? 1 : 0}`;
  let cv = TR_SPR.get(k);
  if (!cv) {
    if (TR_SPR.size > 7000) TR_SPR.clear();
    cv = mmLienzo(20, 38); const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(mmPJ(L, dir, f, anda ? 'anda' : 'quieto', false), 0, 0, 20, 38);
    TR_SPR.set(k, cv);
  }
  return cv;
}

function trLook(a) {
  const base = String(a.nombre || '').split('-')[0], h = trHash(base);
  const L = { piel: MM_PIEL[h % 4], pelo: MM_PELO[(h >> 3) % 6], estilo: MM_ESTILO[(h >> 5) % 4], ropa: TR_ROPA[a.estrategia] || '#6b6b75',
    pantalon: TR_PANT[a.marco] || '#30344a' };
  const s = TR_SOMB[Math.min(a.generacion || 0, TR_SOMB.length - 1)];
  if (s) { L.sombrero = s; L.color = mmTono(L.ropa, -.25); }
  if (a.tendencia) L.gafas = '#9fd0ff';
  L.k = trHash(JSON.stringify(L));
  return L;
}

VISTAS.trading = {
  async pintar(v) {
    this.v = v; this.datos = null; this.burbujas = new Map(); this.antes = new Map(); this.sel = null; this.cajas = []; this.pj = new Map(); this.labHasta = new Map();
    v.innerHTML = `<div class="pagina mision ancha">${cabecera('Mission Control', 'El edificio del enjambre: cada trader va por libre a la sala que toca — opera sentado en el parqué, busca en el atrio frente a la pizarra, estudia sus pérdidas en el laboratorio. Punto turquesa = Pi, morado = PC.')}
      ${typeof CJ_pestanas === 'function' ? CJ_pestanas('trading') : ''}
      <div class="rejilla k" id="trKpis"></div>
      <div class="tr-cuerpo">
        <div class="tr-sala tarjeta"><canvas id="trCanvas"></canvas><div id="trTip" class="tr-tip" hidden></div></div>
        <aside class="tr-lado">
          <div class="tarjeta" id="trFicha"></div>
          <div class="tarjeta"><div class="seccion">${tr('Control')}</div>
            <div class="tr-ctl"><label>${tr('Agentes')} <input id="trN" type="number" min="1" max="2000" value="50"></label>
            <label>${tr('Mercados')} <select id="trMerc"><option value="cripto,acciones">Cripto + acciones</option><option value="cripto">Cripto</option><option value="acciones">Acciones</option></select></label>
            <label>${tr('Hasta')} <input id="trHasta" placeholder="07:00"></label></div>
            <div class="flex"><button class="btn" id="trIniciar">${ic('rayo')}${tr('Empezar / cambiar')}</button><button class="btn" id="trParar">${tr('Parar')}</button></div>
            <p class="sutil" id="trCentral"></p></div>
          <div class="tarjeta"><div class="seccion">${tr('Mejores agentes')}</div><div id="trTop"></div></div>
          <div class="tarjeta"><div class="seccion">${tr('Lecciones')}</div><div id="trLec" class="tr-lec"></div></div>
        </aside>
      </div></div>`;
    this.cv = $('#trCanvas', v); this.c = this.cv.getContext('2d');
    this.cv.onmousemove = e => this.raton(e); this.cv.onmouseleave = () => { $('#trTip', v).hidden = true; };
    this.cv.onclick = e => { const a = this.agenteEn(e); if (a) { this.sel = a; this.ficha(a); } };
    $('#trIniciar', v).onclick = async () => {
      try { await api('POST', '/trading/iniciar', { agentes: +$('#trN', v).value, mercados: $('#trMerc', v).value.split(','), hasta: $('#trHasta', v).value || null, capital: 1, meta: 100 }); aviso(tr('Enjambre en marcha')); this.cargar(); }
      catch (er) { aviso(er.message, true); } };
    $('#trParar', v).onclick = async () => { try { await api('POST', '/trading/parar', {}); aviso(tr('Enjambre parado')); this.cargar(); } catch (er) { aviso(er.message, true); } };
    this.ficha(null);
    await this.cargar();
    clearInterval(this.t); this.t = setInterval(() => !document.hidden && this.cargar(), 5000);
    let ult = 0; const bucle = ts => { if (!this.v) return; if (ts - ult > 80) { ult = ts; this.dibujar(ts / 1000); } this.raf = requestAnimationFrame(bucle); };
    this.raf = requestAnimationFrame(bucle);
  },
  salir() { clearInterval(this.t); cancelAnimationFrame(this.raf); this.v = null; },

  async cargar() {
    let d;
    try { d = await api('GET', '/trading/mapa'); }
    catch (er) { $('#trKpis', this.v).innerHTML = `<div class="kpi aviso"><small>${ic('info')}DMN Trader</small><b>—</b><span>${esc(er.message)}</span></div>`; return; }
    if (!this.v) return;
    const ahora = performance.now() / 1000;
    for (const n of d.nodos) for (const a of n.agentes || []) {                   // burbuja cuando cambia lo último que hizo
      const k = n.nodo + ':' + a.id, prev = this.antes.get(k);
      if (prev !== undefined && prev !== a.ultimo && a.ultimo) {
        const em = (a.ultimo.match(/^(✅|❌|🟢|🔴)/) || [])[1] || (a.estado === 'quebrado' ? '💀' : /meta/.test(a.ultimo) ? '🏆' : null);
        if (em) this.burbujas.set(k, { em, hasta: ahora + 4 });
        if (em === '❌' || em === '💀') this.labHasta.set(k, ahora + 90);   // tras perder, al laboratorio un rato
      }
      this.antes.set(k, a.ultimo);
    }
    this.datos = d;
    this.actualizarPJ(d, ahora);
    const loc = d.nodos.find(n => n.local) || d.nodos[0] || { kpis: {} }, k = loc.kpis || {};
    $('#trKpis', this.v).innerHTML = [
      ['robot', 'Agentes', d.total.agentes, d.nodos.map(n => `${n.nodo} ${(n.agentes || []).length}`).join(' · ')],
      ['rayo', 'Operaciones', d.total.trades, k.trades ? `${Math.round((k.ganados || 0) / k.trades * 100)} % ${tr('aciertos')} (${loc.nodo})` : '—'],
      ['grafica', 'R medio', k.r_medio != null ? (k.r_medio > 0 ? '+' : '') + k.r_medio.toFixed(2) : '—', `${tr('generación')} ${k.generacion || 0}`],
      ['chispa', 'Metas', d.total.metas, `${tr('mejor capital')} ${(k.max_equity || 0).toFixed(3)} $ / ${k.meta || 100} $`],
      ['escudo', 'Quiebras', d.total.quiebras, k.activo ? `${tr('ciclo')} ${k.tick_s}s` : tr('parado')],
    ].map(([i, t, n, s]) => `<div class="kpi"><small>${ic(i)}${tr(t)}</small><b>${n}</b><span>${esc(s)}</span></div>`).join('');
    const todos = d.nodos.flatMap(n => (n.agentes || []).map(a => ({ ...a, nodo: n.nodo })));
    this.top = todos.filter(a => a.r_medio != null && a.trades >= 3).sort((a, b) => b.r_medio - a.r_medio).slice(0, 10);
    $('#trTop', this.v).innerHTML = this.top.length ? `<table class="tabla"><tbody>${this.top.map((a, i) => `<tr data-ag="${esc(a.nodo)}:${a.id}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${esc(a.nombre)}</b><br><span class="sutil">${a.estrategia} · ${a.marco} · ${a.nodo}</span></td><td class="${a.r_medio > 0 ? 'ok' : 'mal'}">${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R</td><td class="sutil">${a.trades}</td></tr>`).join('')}</tbody></table>` : `<p class="sutil">${tr('Aún sin operaciones suficientes.')}</p>`;
    $('#trTop', this.v).onclick = e => { const r = e.target.closest('[data-ag]'); if (!r) return; const [nd, id] = r.dataset.ag.split(':'); const a = todos.find(x => x.nodo === nd && x.id === +id); if (a) { this.sel = a; this.ficha(a); } };
    $('#trLec', this.v).innerHTML = (d.lecciones || []).slice(0, 14).map(l => `<div class="tr-l"><span class="sutil">${new Date(l.ts * 1000).toLocaleTimeString()} · ${esc(l.tipo)}</span><br>${esc(l.texto)}</div>`).join('') || `<p class="sutil">${tr('Aún sin lecciones.')}</p>`;
    $('#trCentral', this.v).textContent = `${tr('Central')}: ${d._central || '—'} · ${d.nodos.map(n => `${n.nodo} ${n.local ? '●' : n.en_linea ? '●' : '○'}`).join('  ')}`;
    if (k.n) $('#trN', this.v).value = k.n;
    if (this.sel) { const a = todos.find(x => x.nodo === this.sel.nodo && x.id === this.sel.id); if (a) this.ficha(a, true); }
  },

  // ---------- el edificio: un mapa libre como el Mundo; cada trader camina a la sala que toca según lo que hace ----------
  // Parqué (opera sentado) · Atrio frente a la pizarra (busca) · Laboratorio (acaba de perder / quebró) · Trofeos (metas) ·
  // Cafetería (parado o sin conexión) · Servidores (un rack por equipo con sus datos reales)
  salas(W, H) {
    if (this._salas && this._salas.W === W) return this._salas;
    const d = { W, H,
      pizarra: [16, 10, W - 32, 54],
      parque: [16, 76, 690, 420], atrio: [16, 508, 690, H - 520],
      lab: [722, 76, W - 738, 200], trofeos: [722, 288, W - 738, 150], cafe: [722, 450, W - 738, 150], servidores: [722, 612, W - 738, H - 624] };
    d.mesas = [];
    const [px, py, pw] = d.parque, cols = 14, rows = 8, mw = (pw - 20) / cols;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) d.mesas.push({ x: px + 10 + k * mw + mw / 2, y: py + 34 + r * 48, ocupa: null });
    this._salas = d; this._fondo = null;
    return d;
  },
  fondo(W, H) {                                          // lo que no se mueve, pintado una vez
    if (this._fondo) return this._fondo;
    const S = this.salas(W, H), cv = mmLienzo(W, H), c = cv.getContext('2d');
    c.fillStyle = '#0b0f15'; c.fillRect(0, 0, W, H);
    const suelo = ([x, y, w, h], a, b, t = 8) => { for (let yy = y; yy < y + h; yy += t) for (let xx = x; xx < x + w; xx += t) { c.fillStyle = ((xx + yy) / t) % 2 ? a : b; c.fillRect(xx, yy, Math.min(t, x + w - xx), Math.min(t, y + h - yy)); } };
    const sala = (r, a, b, nombre, borde) => {
      suelo(r, a, b); c.strokeStyle = '#2b3646'; c.lineWidth = 4; c.strokeRect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4);
      c.fillStyle = a; c.fillRect(r[0] + r[2] / 2 - 18, r[1] + r[3] - 4, 36, 4);    // puerta
      if (nombre) mmCartel(c, r[0] + r[2] / 2, r[1] + 6, nombre, { borde, max: r[2] - 10 });
    };
    sala(S.parque, '#1a2230', '#1c2533', 'PARQUÉ DE OPERACIONES', '#2fd1b0');
    sala(S.atrio, '#22262e', '#252a33', 'ATRIO · BUSCANDO OPORTUNIDADES', '#3f8fff');
    sala(S.lab, '#1d1a2a', '#201c2e', 'LABORATORIO DE AUTOPSIAS', '#a46bf5');
    sala(S.trofeos, '#2a2414', '#2e2816', 'SALA DE TROFEOS', '#ffcf4d');
    sala(S.cafe, '#2a1f18', '#2e221a', 'CAFETERÍA', '#c08a2e');
    sala(S.servidores, '#12161c', '#14191f', 'SERVIDORES', '#2fd1b0');
    // mesas del laboratorio, vitrinas de trofeos, mesas de la cafetería
    const [lx, ly, lw] = S.lab; for (let k = 0; k < 3; k++) { c.fillStyle = '#3d3552'; c.fillRect(lx + 30 + k * (lw - 60) / 2.4, ly + 90, 70, 24); c.fillStyle = '#a46bf5'; c.fillRect(lx + 40 + k * (lw - 60) / 2.4, ly + 94, 14, 8); }
    const [tx, ty, tw] = S.trofeos; for (let k = 0; k < 5; k++) { const x = tx + 24 + k * (tw - 48) / 4.5; c.fillStyle = '#4a3a1a'; c.fillRect(x, ty + 40, 40, 20); c.fillStyle = '#ffcf4d'; c.fillRect(x + 14, ty + 30, 12, 12); c.fillRect(x + 17, ty + 42, 6, 4); }
    const [cx, cy, cw] = S.cafe; for (let k = 0; k < 3; k++) { c.fillStyle = '#5a3d28'; c.beginPath(); c.arc(cx + 50 + k * (cw - 80) / 2.2, cy + 80, 16, 0, 7); c.fill(); }
    c.fillStyle = '#3a2a1e'; c.fillRect(cx + cw - 70, cy + 34, 50, 14); c.fillStyle = '#c0c0c0'; c.fillRect(cx + cw - 60, cy + 26, 10, 10);   // cafetera
    // mesas del parqué (el monitor se pinta en vivo)
    for (const m of S.mesas) { c.fillStyle = '#4a3a2c'; c.fillRect(m.x - 18, m.y + 4, 36, 8); c.fillStyle = '#2c2118'; c.fillRect(m.x - 16, m.y + 12, 3, 6); c.fillRect(m.x + 13, m.y + 12, 3, 6); }
    this._fondo = cv;
    return cv;
  },
  zonaDe(a, n, ahora) {
    const on = n.local || n.en_linea, parado = !on || ['parado', 'retirado'].includes(a.estado) || (n.kpis && n.kpis.activo === false);
    const k = n.nodo + ':' + a.id;
    if (parado) return 'cafe';
    if (a.estado === 'quebrado' || (this.labHasta.get(k) || 0) > ahora) return 'lab';
    if (a.estado === 'en posición') return 'parque';
    if ((a.metas || 0) > 0 && (trHash(k) % 3 === 0)) return 'trofeos';
    return 'atrio';
  },
  puntoEn(r, semilla) {
    const [x, y, w, h] = r, s = semilla * 9301 + 49297;
    return [x + 20 + (s % 233280) / 233280 * (w - 40), y + 40 + ((s * 7) % 233280) / 233280 * (h - 54)];
  },
  actualizarPJ(d, ahora) {
    const S = this.salas(TR_W, TR_H), vivos = new Set();
    for (const m of S.mesas) if (m.ocupa && !this.pj.get(m.ocupa)) m.ocupa = null;
    for (const n of d.nodos) for (const a of n.agentes || []) {
      const k = n.nodo + ':' + a.id; vivos.add(k);
      let p = this.pj.get(k);
      if (!p) { const [x, y] = this.puntoEn(S.atrio, trHash(k)); p = { x, y, tx: x, ty: y, f: 0, izq: false, zona: null }; this.pj.set(k, p); }
      p.a = a; p.n = n; p.k = k;
      const z = this.zonaDe(a, n, ahora);
      if (z !== p.zona || (z === 'atrio' && Math.random() < .08) || (z === 'cafe' && Math.random() < .03)) {
        if (p.mesa && z !== 'parque') { p.mesa.ocupa = null; p.mesa = null; }
        if (z === 'parque' && !p.mesa) { p.mesa = S.mesas.find(m => !m.ocupa) || null; if (p.mesa) p.mesa.ocupa = k; }
        const [tx, ty] = z === 'parque' && p.mesa ? [p.mesa.x, p.mesa.y - 10] : this.puntoEn(S[z], trHash(k) + Math.floor(ahora / 7) * (z === 'atrio' ? 13 : 1));
        p.tx = tx; p.ty = ty; p.zona = z;
      }
    }
    for (const k of [...this.pj.keys()]) if (!vivos.has(k)) { const p = this.pj.get(k); if (p.mesa) p.mesa.ocupa = null; this.pj.delete(k); }
  },
  dibujar(t) {
    const d = this.datos; if (!d) return;
    const W = TR_W, H = TR_H, c = this.c;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    c.imageSmoothingEnabled = false;
    const S = this.salas(W, H), ahora = performance.now() / 1000, dt = Math.min(.2, ahora - (this.tAnt || ahora)); this.tAnt = ahora;
    c.drawImage(this.fondo(W, H), 0, 0);
    this.pizarra(c, S.pizarra, d.precios || []);
    this.racks(c, S.servidores, d.nodos, t);
    // monitores del parqué: verde/rojo según la posición de quien está sentado
    for (const m of S.mesas) {
      const p = m.ocupa && this.pj.get(m.ocupa), corto = p && /corto/.test(p.a.ultimo || '');
      c.fillStyle = '#0a0d12'; c.fillRect(m.x - 10, m.y - 6, 20, 11);
      c.fillStyle = p ? (corto ? '#3a0d12' : '#0d3a1c') : '#0c1420'; c.fillRect(m.x - 9, m.y - 5, 18, 9);
      if (p) { c.strokeStyle = corto ? '#ff6b6b' : '#5dff9b'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i <= 16; i += 2) { const yy = m.y - 1 + Math.sin(i * .6 + t * 4 + m.x) * 2 + (corto ? i / 8 : -i / 8); i ? c.lineTo(m.x - 8 + i, yy) : c.moveTo(m.x - 8 + i, yy); } c.stroke(); }
    }
    // personajes: andan hacia su destino; de detrás hacia delante
    const lista = [...this.pj.values()];
    for (const p of lista) {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy), v = 55 * dt;
      if (dist > 1.5) { p.x += dx / dist * Math.min(v, dist); p.y += dy / dist * Math.min(v, dist); p.anda = true; if (Math.abs(dx) > .5) p.izq = dx < 0; p.dir = Math.abs(dx) > Math.abs(dy) ? 'lado' : dy < 0 ? 'arriba' : 'abajo'; }
      else { p.anda = false; p.dir = p.zona === 'parque' ? 'arriba' : 'abajo'; }
    }
    lista.sort((a, b) => a.y - b.y);
    this.cajas = [];
    for (const p of lista) {
      const a = p.a, L = trLook(a), parado = p.zona === 'cafe', quebrado = a.estado === 'quebrado', sel = this.sel && this.sel.id === a.id && this.sel.nodo === p.n.nodo;
      const f = p.anda ? Math.floor(t * 8 + trHash(p.k)) % 4 : 0;
      const sp = trSprite(L, p.dir, f, p.anda);
      const ew = 20, eh = 38, x = Math.round(p.x - ew / 2), y = Math.round(p.y - eh + 6);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 3, y + eh - 3, ew - 6, 3);
      c.globalAlpha = quebrado ? .65 : parado ? .8 : 1;
      if (p.dir === 'lado' && p.izq) { c.save(); c.translate(x + ew, y); c.scale(-1, 1); c.drawImage(sp, 0, 0); c.restore(); } else c.drawImage(sp, x, y);
      c.globalAlpha = 1;
      c.fillStyle = p.n.nodo === 'pi' ? '#2fd1b0' : '#c77dff'; c.fillRect(x + ew - 4, y + 2, 3, 3);       // de qué equipo es
      if ((a.metas || 0) > 0) { c.fillStyle = '#ffcf4d'; c.fillRect(x + 6, y - 2, 9, 2); c.fillRect(x + 6, y - 4, 2, 2); c.fillRect(x + 10, y - 4, 2, 2); c.fillRect(x + 13, y - 4, 2, 2); }
      if (sel) { c.strokeStyle = '#ffcf4d'; c.lineWidth = 1; c.strokeRect(x - 2, y - 4, ew + 4, eh + 6); c.font = '700 8px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.fillText(a.nombre, p.x, y - 7); }
      const b = this.burbujas.get(p.k) || (p.zona === 'lab' && Math.floor(t + trHash(p.k)) % 5 === 0 ? { em: '🧠', hasta: ahora + 1 } : null);
      if (b && b.hasta > ahora) { c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(x + 12, y - 12, 14, 12); c.font = '9px sans-serif'; c.textAlign = 'center'; c.fillText(b.em, x + 19, y - 3); }
      this.cajas.push({ x: x - 2, y: y - 2, w: ew + 4, h: eh + 4, a: { ...a, nodo: p.n.nodo } });
    }
    this.cajas.reverse();                                  // el de delante gana al pasar el ratón
    // rótulo de ocupación de cada sala
    c.font = '8px monospace'; c.textAlign = 'right'; c.fillStyle = '#7f8ea3';
    const cuenta = z => lista.filter(p => p.zona === z).length;
    for (const [z, r] of [['parque', S.parque], ['atrio', S.atrio], ['lab', S.lab], ['trofeos', S.trofeos], ['cafe', S.cafe]]) c.fillText(`${cuenta(z)}`, r[0] + r[2] - 10, r[1] + r[3] - 8);
  },
  pizarra(c, [x, y, w, h], pr) {                         // la pizarra de pared con las cotizaciones reales
    c.fillStyle = '#05070a'; c.fillRect(x, y, w, h); c.strokeStyle = '#2b3442'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (!pr.length) return;
    const cols = Math.ceil(pr.length / 2), cw = (w - 12) / cols;
    pr.forEach((p, i) => {
      const xx = x + 8 + (i % cols) * cw, yy = y + 6 + (i >= cols ? 24 : 0), up = (p.cambio_pct || 0) >= 0;
      c.font = '700 9px monospace'; c.textAlign = 'left'; c.fillStyle = p.abierto ? '#9fb3c8' : '#4c5664'; c.fillText(p.simbolo.replace('-USD', ''), xx, yy + 9);
      c.fillStyle = p.abierto ? (up ? '#5dff9b' : '#ff6b6b') : '#5a6470'; c.font = '9px monospace';
      const pv = p.precio >= 1000 ? p.precio.toFixed(0) : p.precio >= 1 ? p.precio.toFixed(2) : p.precio.toFixed(4);
      c.fillText(`${pv} ${up ? '▲' : '▼'}${Math.abs(p.cambio_pct || 0).toFixed(1)}%`, xx, yy + 20);
    });
  },
  racks(c, [x, y, w, h], nodos, t) {                     // un rack por equipo con sus números reales
    const n = Math.max(1, nodos.length), rw = Math.min(170, (w - 20) / n - 8);
    nodos.forEach((nd, i) => {
      const rx = x + 12 + i * (rw + 8), ry = y + 30, rh = h - 38, k = nd.kpis || {}, ag = nd.agentes || [], on = nd.local || nd.en_linea;
      c.fillStyle = '#20262e'; c.fillRect(rx, ry, rw, rh); c.strokeStyle = on ? '#2fd1b0' : '#7a3030'; c.lineWidth = 1; c.strokeRect(rx + .5, ry + .5, rw - 1, rh - 1);
      for (let l = 0; l < 6; l++) { c.fillStyle = on && (Math.floor(t * 3 + l * 1.7 + i) % 3) ? '#5dff9b' : '#1d3a26'; c.fillRect(rx + 6 + l * 6, ry + 6, 3, 3); }
      const ops = ag.reduce((s, a) => s + (a.trades || 0), 0), gan = ag.reduce((s, a) => s + (a.ganados || 0), 0), qui = ag.reduce((s, a) => s + (a.quiebras || 0), 0);
      const cap = ag.reduce((s, a) => s + (a.equity || 0), 0), ini = (k.capital || 1) * ag.length;
      c.font = '700 9px monospace'; c.textAlign = 'left'; c.fillStyle = '#d6e6e2'; c.fillText(`${String(nd.nodo).toUpperCase()} · ${ag.length}`, rx + 48, ry + 11);
      c.font = '8px monospace'; c.fillStyle = cap >= ini ? '#5dff9b' : '#ff7b7b'; c.fillText(`${cap.toFixed(2)}$ (${cap - ini >= 0 ? '+' : ''}${(cap - ini).toFixed(3)})`, rx + 6, ry + 26);
      c.fillStyle = '#9fb3c8'; c.fillText(`${ops} op · ${ops ? Math.round(gan / ops * 100) : 0}% ✔`, rx + 6, ry + 38); c.fillText(`${qui} quiebras · gen ${k.generacion ?? 0}`, rx + 6, ry + 50);
      if (rh > 64) { c.fillStyle = on ? '#5f6b7a' : '#ff7b7b'; c.fillText(on ? `ciclo ${k.tick_s ?? '—'}s` : 'SIN CONEXIÓN', rx + 6, ry + 62); }
    });
  },

  // ---------- ratón y ficha ----------
  agenteEn(e) {
    const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) * this.cv.width / r.width, y = (e.clientY - r.top) * this.cv.height / r.height;
    return (this.cajas.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || {}).a || null;
  },
  raton(e) {
    const a = this.agenteEn(e), tip = $('#trTip', this.v);
    if (!a) { tip.hidden = true; this.cv.style.cursor = ''; return; }
    this.cv.style.cursor = 'pointer';
    tip.innerHTML = `<b>${esc(a.nombre)}</b> · ${esc(a.nodo)}<br>${a.estrategia} · ${a.marco} · ${tr('gen')} ${a.generacion}<br>${tr('capital')} ${(a.equity ?? 0).toFixed(4)} $ (${(a.pnl_pct ?? 0).toFixed(1)}%) · ${tr('máx')} ${(a.max_equity ?? 0).toFixed(3)} $<br>${a.trades} ${tr('operaciones')} · ${a.ganados} ${tr('ganadas')} · ${a.quiebras || 0} ${tr('quiebras')} · ${a.metas || 0} ${tr('metas')}${a.r_medio != null ? ` · ${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R` : ''}<br><span class="sutil">${esc(a.estado)} · ${esc(a.ultimo || '')}</span>`;
    const r = this.cv.parentElement.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 230) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; tip.hidden = false;
  },
  async ficha(a, refresco) {
    const el = $('#trFicha', this.v); if (!el) return;
    if (!a) { el.innerHTML = `<div class="seccion">${tr('Agente')}</div><p class="sutil">${tr('Haz clic en un trader para ver su sistema, sus intentos y lo que aprendió.')}</p>`; return; }
    const pie = `<p class="sutil">${a.estrategia} · ${tr('velas de')} ${a.marco} · ${tr('riesgo')} ${a.riesgo_pct}%${a.tendencia ? ' · ' + tr('solo a favor de tendencia') : ''}</p>`;
    let extra = '';
    const local = (this.datos?.nodos || []).find(n => n.nodo === a.nodo)?.local;
    if (local && !refresco) {
      try {
        const d = await api('GET', `/trading/agente/${a.id}`);
        if (!this.v || !this.sel || this.sel.id !== a.id) return;
        const g = d.genoma;
        extra = `<p class="sutil">stop ${g.stop_atr} ATR · ${tr('objetivo')} ${g.rr}R · ${tr('vol')} ${g.vol_min_pct}–${g.vol_max_pct}% · ${tr('máx')} ${g.max_barras} ${tr('velas')} · BE ${g.be_en_r || 'no'} · ${tr('ventaja')} ${g.min_ventaja}×</p>` +
          `<div class="seccion">${tr('Intentos')}</div>` + d.intentos_lista.slice(0, 5).map(i => `<div class="sutil">#${i.id} · máx ${(+i.max_equity).toFixed(3)} $ · ${i.trades} trades · ${esc(i.resultado || tr('en curso'))}${i.causa ? ' · ' + esc(i.causa) : ''}</div>`).join('') +
          `<div class="seccion">${tr('Lo que aprendió')}</div>` + (d.lecciones.slice(0, 5).map(l => `<div class="tr-l">${esc(l.texto)}</div>`).join('') || `<p class="sutil">—</p>`);
        this.extra = extra;
      } catch { extra = ''; }
    } else if (refresco) extra = this.extra || '';
    el.innerHTML = `<div class="seccion">${esc(a.nombre)} <span class="sutil">· ${esc(a.nodo)} · ${tr('gen')} ${a.generacion}</span></div>
      <div class="tr-fk"><div><small>${tr('Capital')}</small><b>${(a.equity ?? 0).toFixed(4)} $</b></div><div><small>${tr('Máximo')}</small><b>${(a.max_equity ?? 0).toFixed(3)} $</b></div>
      <div><small>Trades</small><b>${a.trades} <span class="sutil">(${a.ganados}✔)</span></b></div><div><small>R</small><b class="${(a.r_medio || 0) > 0 ? 'ok' : 'mal'}">${a.r_medio != null ? a.r_medio.toFixed(2) : '—'}</b></div></div>
      ${pie}<p>${esc(a.estado)} · ${esc(a.ultimo || '')}</p>${extra}`;
  },
};

// estilos propios de la vista (una sola vez)
(() => {
  const st = document.createElement('style');
  st.textContent = `.tr-cuerpo{display:grid;grid-template-columns:1fr 330px;gap:14px;align-items:start}
  .tr-sala{position:relative;padding:8px;overflow:auto;max-height:calc(100vh - 260px)}
  .tr-sala canvas{width:100%;image-rendering:pixelated;display:block}
  .tr-tip{position:absolute;z-index:3;background:rgba(10,14,20,.95);border:1px solid #2fd1b0;border-radius:6px;padding:8px 10px;font-size:12px;pointer-events:none;max-width:230px}
  .tr-lado{display:flex;flex-direction:column;gap:12px}.tr-lado .tarjeta{padding:12px}
  .tr-ctl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px}.tr-ctl label{font-size:11px;opacity:.8}.tr-ctl input,.tr-ctl select{width:100%}
  .tr-lec{max-height:320px;overflow:auto}.tr-l{font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .tr-fk{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}.tr-fk small{display:block;opacity:.6;font-size:10px}.tr-fk b{font-size:15px}
  #trTop tr{cursor:pointer}
  @media (max-width:1100px){.tr-cuerpo{grid-template-columns:1fr}}`;
  document.head.appendChild(st);
})();
