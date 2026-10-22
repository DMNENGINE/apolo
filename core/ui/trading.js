// Mission Control → Trading: el centro de operaciones del enjambre de DMN Trader en pixel-art (planta vista desde arriba).
// Cada trader va solo a la sala que le toca: opera sentado en la sala de traders, busca frente a la pizarra o en el atrio,
// estudia sus pérdidas en el laboratorio, descansa en la cafetería… El escuadrón LLM se reúne en la sala de reuniones con el
// jefe de mesa y los 5 mejores tienen oficina privada. Pensado para 350+ agentes: dibujo a ~12 fps y datos cada 5 s.
// Datos: GET /v1/trading/mapa (proxy a la central, core/trading.js). Los personajes son los de mision-mundo-arte.js (mmPJ).

const TR_W = 1160, TR_H = 800;
const TR_ROPA = { ema_cruce: '#3b6fb6', rsi_rev: '#8a4fb5', ruptura: '#c08a2e', bollinger: '#2f8f8f', impulso: '#b5452f', rejilla: '#4f8a3a', llm: '#d6d9e0' };
const TR_PANT = { '1m': '#30344a', '5m': '#3a4520', '15m': '#4a2a2a' };
const TR_SOMB = ['', '', 'gorra', 'casco', 'capucha'];
const trHash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
Object.assign(P, {
  edificio: '<path d="M4 21V5l8-3v19M12 8h8v13M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>',
  trofeo: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 14v4M8 21h8M9 18h6"/>',
  estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
});

const TR_SALAS = {
  pizarra: ['PIZARRA', 'Pizarra de cotizaciones', 'Precios reales en vivo (Coinbase y Yahoo). Aquí estudian el mercado los que buscan entrada.', 'Piso 1 · ala oeste'],
  atrio: ['ATRIO', 'Atrio', 'Zona de espera junto a los ventanales: traders buscando la próxima oportunidad.', 'Piso 1 · entrada norte'],
  lab: ['LABORATORIO DE ANÁLISIS', 'Laboratorio de análisis', 'Autopsias: quien acaba de perder o quebrar estudia por qué y cambia su sistema.', 'Piso 1 · ala este'],
  traders: ['SALA DE TRADERS', 'Sala de traders', 'Puestos de operación: quien tiene una posición abierta se sienta aquí. Monitor verde = largo, rojo = corto.', 'Piso 1 · centro'],
  reuniones: ['SALA DE REUNIONES', 'Sala de reuniones', 'El escuadrón LLM (gemma decide cada operación) y el jefe de mesa, que cada 2 h propone cambios validados en el simulador.', 'Piso 1 · ala este'],
  cafe: ['CAFETERÍA', 'Cafetería', 'En pausa por una protección (pérdidas seguidas, racha mala), parados o sin conexión.', 'Piso 1 · ala este'],
  privadas: ['OFICINAS PRIVADAS', 'Oficinas privadas', 'Los 5 mejores traders del enjambre por R medio tienen despacho propio.', 'Piso 1 · ala sur'],
  servidores: ['SERVIDORES', 'Servidores', 'Un rack por equipo (la Pi central, el PC…) con su capital, operaciones y quiebras reales.', 'Piso 1 · sótano técnico'],
  banos: ['BAÑOS', 'Baños', 'Hasta los traders necesitan un descanso.', 'Piso 1 · ala sur'],
};

// caché propia de sprites ya escalados (16×30): con cientos de traders, la del Mundo se vaciaría cada fotograma
const TR_SPR = new Map();
let trPresupuesto = Infinity;                            // sprites nuevos por fotograma: al abrir no congela la página
function trSprite(L, dir, f, anda) {
  const k = `${L.k}|${dir}|${f}|${anda ? 1 : 0}`;
  let cv = TR_SPR.get(k);
  if (!cv) {
    if (trPresupuesto-- <= 0) return TR_SPR.get(`${L.k}|abajo|0|0`) || null;
    if (TR_SPR.size > 7000) TR_SPR.clear();
    cv = mmLienzo(16, 30); const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(mmPJ(L, dir, f, anda ? 'anda' : 'quieto', false), 0, 0, 16, 30);
    TR_SPR.set(k, cv);
  }
  return cv;
}

function trLook(a) {
  const base = String(a.nombre || '').split('-')[a.estrategia === 'llm' ? 1 : 0], h = trHash(base);
  const L = { piel: MM_PIEL[h % 4], pelo: MM_PELO[(h >> 3) % 6], estilo: MM_ESTILO[(h >> 5) % 4], ropa: TR_ROPA[a.estrategia] || '#6b6b75',
    pantalon: TR_PANT[a.marco] || '#30344a' };
  const s = TR_SOMB[Math.min(a.generacion || 0, TR_SOMB.length - 1)];
  if (s && a.estrategia !== 'llm') { L.sombrero = s; L.color = mmTono(L.ropa, -.25); }
  if (a.tendencia || a.estrategia === 'llm') L.gafas = a.estrategia === 'llm' ? '#2fd1b0' : '#9fd0ff';
  L.k = trHash(JSON.stringify(L));
  return L;
}

// ---------- muebles en pixel-art (vista cenital) ----------
const trArte = {
  suelo(c, [x, y, w, h], a, b, t = 16) {
    c.fillStyle = a; c.fillRect(x, y, w, h);
    c.fillStyle = b;
    for (let yy = y; yy < y + h; yy += t) c.fillRect(x, yy, w, 1);
    for (let xx = x; xx < x + w; xx += t) c.fillRect(xx, y, 1, h);
  },
  muro(c, x, y, w, h) { c.fillStyle = '#14181f'; c.fillRect(x, y, w, h); c.fillStyle = '#3b4352'; c.fillRect(x + 1, y + 1, w - 2, h - 2); c.fillStyle = '#4b5466'; c.fillRect(x + 1, y + 1, w - 2, 2); },
  marco(c, [x, y, w, h], g = 6) { this.muro(c, x - g, y - g, w + 2 * g, g); this.muro(c, x - g, y + h, w + 2 * g, g); this.muro(c, x - g, y, g, h); this.muro(c, x + w, y, g, h); },
  puerta(c, x, y, w, h) { c.fillStyle = '#2a2f3a'; c.fillRect(x, y, w, h); c.fillStyle = '#8a6a44'; w > h ? c.fillRect(x + 2, y + Math.floor(h / 2) - 1, w - 4, 2) : c.fillRect(x + Math.floor(w / 2) - 1, y + 2, 2, h - 4); },
  cartel(c, cx, y, txt) {
    c.font = '700 11px monospace'; const w = Math.ceil(c.measureText(txt).width) + 26, x = Math.round(cx - w / 2);
    c.fillStyle = '#0b0f16'; c.fillRect(x, y, w, 20); c.strokeStyle = '#8a95a8'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w - 1, 19);
    c.fillStyle = '#1c2230'; c.fillRect(x + 2, y + 2, w - 4, 2);
    c.fillStyle = '#eef2f8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, cx, y + 11); c.textBaseline = 'alphabetic';
  },
  planta(c, x, y, s = 1) {
    c.fillStyle = '#5a3a22'; c.fillRect(x - 5 * s, y, 10 * s, 7 * s); c.fillStyle = '#7a5030'; c.fillRect(x - 5 * s, y, 10 * s, 2 * s);
    const hojas = [[0, -8, '#2f7d3a'], [-6, -5, '#3a9446'], [6, -5, '#3a9446'], [-3, -12, '#4caf50'], [4, -11, '#2f7d3a'], [0, -3, '#256b30'], [-8, -10, '#256b30'], [8, -9, '#4caf50']];
    for (const [dx, dy, col] of hojas) { c.fillStyle = col; c.fillRect(x + dx * s - 3 * s, y + dy * s - 2 * s, 6 * s, 5 * s); }
  },
  sofa(c, x, y, w = 44, h = 18, col = '#2b3240') {
    c.fillStyle = '#12151b'; c.fillRect(x - 1, y - 1, w + 2, h + 2); c.fillStyle = col; c.fillRect(x, y, w, h);
    c.fillStyle = mmTono(col, .15); c.fillRect(x + 4, y + 4, w - 8, h - 8); c.fillStyle = mmTono(col, -.2); c.fillRect(x + w / 2 - 1, y + 4, 2, h - 8);
  },
  mesita(c, x, y, w = 16, h = 16) { c.fillStyle = '#3a2a1c'; c.fillRect(x, y, w, h); c.fillStyle = '#5a4128'; c.fillRect(x + 2, y + 2, w - 4, h - 4); c.fillStyle = '#c8a46a'; c.fillRect(x + w / 2 - 2, y + h / 2 - 2, 4, 4); },
  monitor(c, x, y, w = 16, h = 11) { c.fillStyle = '#0a0d12'; c.fillRect(x, y, w, h); c.fillStyle = '#1b2c44'; c.fillRect(x + 1, y + 1, w - 2, h - 3); c.fillStyle = '#2a3140'; c.fillRect(x + w / 2 - 2, y + h - 1, 4, 3); },
  silla(c, x, y, col = '#262b36') { c.fillStyle = '#101319'; c.fillRect(x - 6, y - 1, 12, 10); c.fillStyle = col; c.fillRect(x - 5, y, 10, 8); c.fillStyle = mmTono(col, .2); c.fillRect(x - 5, y, 10, 2); },
  escritorio(c, x, y, w, h) { c.fillStyle = '#2a1d12'; c.fillRect(x - 1, y - 1, w + 2, h + 2); c.fillStyle = '#7a5838'; c.fillRect(x, y, w, h); c.fillStyle = '#8f6a45'; c.fillRect(x, y, w, 2); c.fillStyle = '#6a4b2f'; c.fillRect(x, y + h - 2, w, 2); },
  rack(c, x, y, w = 18, h = 34) {
    c.fillStyle = '#07090c'; c.fillRect(x - 1, y - 1, w + 2, h + 2); c.fillStyle = '#1a2029'; c.fillRect(x, y, w, h);
    for (let k = 4; k < h - 3; k += 5) { c.fillStyle = '#2a3342'; c.fillRect(x + 2, y + k, w - 4, 3); }
  },
  inodoro(c, x, y) { c.fillStyle = '#c9ced8'; c.fillRect(x - 5, y, 10, 6); c.fillStyle = '#e8ecf2'; c.fillRect(x - 4, y + 6, 8, 9); c.fillStyle = '#9aa3b2'; c.fillRect(x - 2, y + 9, 4, 4); },
};

VISTAS.trading = {
  async pintar(v) {
    this.v = v; this.datos = null; this.burbujas = new Map(); this.antes = new Map(); this.sel = null; this.salaSel = null; this.cajas = []; this.pj = new Map(); this.labHasta = new Map();
    v.innerHTML = `<div class="pagina mision ancha tr-mc">
      <div class="tr-cab">
        <div class="tr-logo">${ic('edificio')}<div><b>MISSION CONTROL</b><span>${tr('CENTRO DE OPERACIONES')}</span></div></div>
        <p>${tr('Cada trader va por libre a la sala que toca — opera sentado en la sala de traders, busca frente a la pizarra o en el atrio, estudia sus pérdidas en el laboratorio.')}</p>
        <div class="tr-ley"><span><i style="background:#2fd1b0"></i>${tr('Punto turquesa')} = Pi</span><span><i style="background:#c77dff"></i>${tr('Morado')} = PC</span></div>
      </div>
      ${typeof CJ_pestanas === 'function' ? CJ_pestanas('trading') : ''}
      <div class="tr-cuerpo">
        <div class="tr-izq">
          <div class="tr-kpis" id="trKpis"></div>
          <div class="tr-sala"><canvas id="trCanvas"></canvas><div id="trTip" class="tr-tip" hidden></div></div>
        </div>
        <aside class="tr-lado">
          <div class="tr-card" id="trFicha"></div>
          <div class="tr-card"><div class="tr-tit">${tr('CONTROL')}</div>
            <div class="tr-ctl"><label>${tr('Agentes')} <input id="trN" type="number" min="1" max="2000" value="50"></label>
            <label>${tr('Mercados')} <select id="trMerc"><option value="cripto,acciones">Cripto + Acc</option><option value="cripto">Cripto</option><option value="acciones">Acciones</option></select></label>
            <label>${tr('Hasta')} <input id="trHasta" placeholder="07:00"></label></div>
            <div class="tr-bot"><button class="btn" id="trIniciar">${ic('rayo')}${tr('Empezar / cambiar')}</button><button class="btn" id="trParar">■ ${tr('Parar')}</button></div>
            <p class="tr-central" id="trCentral"></p></div>
          <div class="tr-card"><div class="tr-tit">${ic('trofeo')}${tr('MEJORES AGENTES')}</div><div id="trTop"></div></div>
          <details class="tr-card"><summary class="tr-tit">${tr('LECCIONES')}</summary><div id="trLec" class="tr-lec"></div></details>
        </aside>
      </div></div>`;
    this.cv = $('#trCanvas', v); this.c = this.cv.getContext('2d');
    this.cv.onmousemove = e => this.raton(e); this.cv.onmouseleave = () => { $('#trTip', v).hidden = true; };
    this.cv.onclick = e => {
      const a = this.agenteEn(e);
      if (a) { this.sel = a; this.salaSel = null; this.ficha(a); return; }
      const s = this.salaEn(e); this.sel = null; this.salaSel = s; this.fichaSala(s);
    };
    $('#trIniciar', v).onclick = async () => {
      try { await api('POST', '/trading/iniciar', { agentes: +$('#trN', v).value, mercados: $('#trMerc', v).value.split(','), hasta: $('#trHasta', v).value || null, capital: 1, meta: 100 }); aviso(tr('Enjambre en marcha')); this.cargar(); }
      catch (er) { aviso(er.message, true); } };
    $('#trParar', v).onclick = async () => { try { await api('POST', '/trading/parar', {}); aviso(tr('Enjambre parado')); this.cargar(); } catch (er) { aviso(er.message, true); } };
    this.fichaSala(null);
    await this.cargar();
    clearInterval(this.t); this.t = setInterval(() => !document.hidden && this.cargar(), 5000);
    let ult = 0; const bucle = ts => { if (!this.v) return; if (ts - ult > 80) { ult = ts; this.dibujar(ts / 1000); } this.raf = requestAnimationFrame(bucle); };
    this.raf = requestAnimationFrame(bucle);
  },
  salir() { clearInterval(this.t); cancelAnimationFrame(this.raf); this.v = null; },

  async cargar() {
    let d;
    try { d = await api('GET', '/trading/mapa'); }
    catch (er) { $('#trKpis', this.v).innerHTML = `<div class="tr-kpi"><small>${ic('info')}DMN Trader</small><b>—</b><span>${esc(er.message)}</span></div>`; return; }
    if (!this.v) return;
    const ahora = performance.now() / 1000;
    for (const n of d.nodos) for (const a of n.agentes || []) {                   // burbuja cuando cambia lo último que hizo
      const k = n.nodo + ':' + a.id, prev = this.antes.get(k);
      if (prev !== undefined && prev !== a.ultimo && a.ultimo) {
        const em = (a.ultimo.match(/(✅|❌|🟢|🔴|⏸)/) || [])[1] || (a.estado === 'quebrado' ? '💀' : /meta/.test(a.ultimo) ? '🏆' : a.estrategia === 'llm' ? '💬' : null);
        if (em) this.burbujas.set(k, { em, hasta: ahora + 4 });
        if (em === '❌' || em === '💀') this.labHasta.set(k, ahora + 90);   // tras perder, al laboratorio un rato
      }
      this.antes.set(k, a.ultimo);
    }
    this.datos = d;
    const todos = d.nodos.flatMap(n => (n.agentes || []).map(a => ({ ...a, nodo: n.nodo })));
    this.top = todos.filter(a => a.r_medio != null && a.trades >= 3).sort((a, b) => b.r_medio - a.r_medio).slice(0, 8);
    this.privados = new Set(todos.filter(a => a.estrategia !== 'llm' && a.r_medio != null && a.trades >= 3).sort((a, b) => b.r_medio - a.r_medio).slice(0, 5).map(a => a.nodo + ':' + a.id));
    this.actualizarPJ(d, ahora);
    const loc = d.nodos.find(n => n.local) || d.nodos[0] || { kpis: {} }, k = loc.kpis || {};
    $('#trKpis', this.v).innerHTML = [
      ['persona', 'AGENTES', d.total.agentes, d.nodos.map(n => `${n.nodo === 'pi' ? 'Pi' : n.nodo === 'pc' ? 'Pc' : n.nodo} ${(n.agentes || []).length}`).join(' · ')],
      ['rayo', 'OPERACIONES', d.total.trades, k.trades ? `${Math.round((k.ganados || 0) / k.trades * 100)} % ${tr('ganadas')} (${loc.nodo})` : '—'],
      ['grafica', 'R. MEDIO', k.r_medio != null ? (k.r_medio > 0 ? '+' : '') + k.r_medio.toFixed(2) : '—', `${tr('generación')} ${k.generacion || 0}`],
      ['estrella', 'METAS', d.total.metas, `${tr('mejor capital')} ${(k.max_equity || 0).toFixed(3)} $ / ${k.meta || 100} $`],
      ['escudo', 'QUIEBRAS', d.total.quiebras, k.activo ? `${tr('ciclo')} ${k.tick_s}s` : tr('parado')],
    ].map(([i, t, n, s]) => `<div class="tr-kpi"><small>${ic(i)}${tr(t)}</small><b>${n}</b><span>${esc(s)}</span></div>`).join('');
    $('#trTop', this.v).innerHTML = this.top.length ? this.top.map(a => `<div class="tr-top" data-ag="${esc(a.nodo)}:${a.id}"><i style="background:${TR_ROPA[a.estrategia] || '#888'};box-shadow:0 0 0 2px ${a.nodo === 'pi' ? '#2fd1b0' : '#c77dff'}"></i>
      <div><b>${esc(a.nombre)}</b><span>${a.estrategia} · ${a.marco} · ${a.nodo}</span></div><em class="${a.r_medio > 0 ? 'ok' : 'mal'}">${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R</em><small>${a.trades}</small></div>`).join('')
      : `<p class="sutil">${tr('Aún sin operaciones suficientes.')}</p>`;
    $('#trTop', this.v).onclick = e => { const r = e.target.closest('[data-ag]'); if (!r) return; const [nd, id] = r.dataset.ag.split(':'); const a = todos.find(x => x.nodo === nd && x.id === +id); if (a) { this.sel = a; this.salaSel = null; this.ficha(a); } };
    $('#trLec', this.v).innerHTML = (d.lecciones || []).slice(0, 14).map(l => `<div class="tr-l"><span class="sutil">${new Date(l.ts * 1000).toLocaleTimeString()} · ${esc(l.tipo)}</span><br>${esc(l.texto)}</div>`).join('') || `<p class="sutil">${tr('Aún sin lecciones.')}</p>`;
    $('#trCentral', this.v).innerHTML = `<b>${tr('Central')}:</b> ${esc(d._central || '—')} · ${d.nodos.map(n => `${n.nodo} <span style="color:${n.local || n.en_linea ? '#5dff9b' : '#ff6b6b'}">●</span>`).join(' ')}`;
    if (k.n) $('#trN', this.v).value = k.n;
    if (this.sel) { const a = todos.find(x => x.nodo === this.sel.nodo && x.id === this.sel.id); if (a) this.ficha(a, true); }
    else this.fichaSala(this.salaSel);
  },

  // ---------- la planta ----------
  plano() {
    if (this._plano) return this._plano;
    const S = {
      pizarra: [18, 18, 300, 150], atrio: [330, 18, 432, 150], lab: [774, 18, 368, 172],
      traders: [18, 182, 744, 404], reuniones: [774, 202, 368, 170], cafe: [774, 384, 368, 202],
      privadas: [18, 600, 420, 156], servidores: [450, 600, 330, 156], banos: [792, 600, 350, 156],
    };
    // puestos de la sala de traders: mesas de 3 pantallas, 7 columnas × 5 filas (105 sitios) + una fila de mesas sueltas en la pared
    S.sitios = [];
    const [tx, ty] = S.traders;
    for (let f = 0; f < 5; f++) for (let k = 0; k < 7; k++) {
      const x = tx + 62 + k * 96, y = ty + 44 + f * 72;
      for (let s = 0; s < 3; s++) S.sitios.push({ x: x + 13 + s * 26, y: y + 44, mx: x + 5 + s * 26, my: y + 2, sala: 'traders', ocupa: null });
    }
    for (let f = 0; f < 5; f++) S.sitios.push({ x: tx + 28, y: ty + 88 + f * 72, mx: tx + 20, my: ty + 46 + f * 72, sala: 'traders', ocupa: null });
    // laboratorio: 3 mesas de análisis con 3 pantallas
    const [lx, ly] = S.lab;
    for (let k = 0; k < 3; k++) for (let s = 0; s < 2; s++) S.sitios.push({ x: lx + 40 + k * 104 + s * 34, y: ly + 128, mx: lx + 30 + k * 104 + s * 34, my: ly + 82, sala: 'lab', ocupa: null });
    // sala de reuniones: mesa larga, 6 sillas por lado
    const [rx, ry] = S.reuniones;
    S.mesaReu = [rx + 84, ry + 92, 214, 30];
    for (let s = 0; s < 6; s++) {
      S.sitios.push({ x: rx + 102 + s * 36, y: ry + 92, sala: 'reuniones', dir: 'abajo', ocupa: null });
      S.sitios.push({ x: rx + 102 + s * 36, y: ry + 150, sala: 'reuniones', dir: 'arriba', ocupa: null });
    }
    // oficinas privadas: 5 despachos con mesa
    const [ox, oy] = S.privadas;
    S.despachos = [];
    for (let k = 0; k < 5; k++) { const x = ox + 10 + k * 82; S.despachos.push([x, oy + 34, 74, 112]); S.sitios.push({ x: x + 37, y: oy + 108, mx: x + 29, my: oy + 62, sala: 'privadas', ocupa: null, despacho: k }); }
    // cafetería: mesas redondas con 4 sillas
    const [cx, cy] = S.cafe;
    S.mesasCafe = [[cx + 70, cy + 92], [cx + 170, cy + 92], [cx + 70, cy + 160], [cx + 170, cy + 160], [cx + 268, cy + 160]];
    for (const [mx, my] of S.mesasCafe) for (const [dx, dy, dir] of [[-20, 0, 'lado'], [20, 0, 'lado'], [0, -18, 'abajo'], [0, 26, 'arriba']]) S.sitios.push({ x: mx + dx, y: my + dy + 8, sala: 'cafe', dir, izq: dx > 0, ocupa: null });
    S.entrada = [600, TR_H - 22];
    this._plano = S;
    return S;
  },
  fondo() {
    if (this._fondo) return this._fondo;
    const S = this.plano(), W = TR_W, H = TR_H, cv = mmLienzo(W, H), c = cv.getContext('2d'), A = trArte;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0c111b'; c.fillRect(0, 0, W, H);
    // pasillos (todo el interior) y salas
    A.suelo(c, [12, 12, 1136, 750], '#262b35', '#2b313c', 20);
    const suelos = { pizarra: ['#2b303a', '#323844'], atrio: ['#33383f', '#3a4048'], lab: ['#2a2f3a', '#313744'], traders: ['#30353f', '#363c47'], reuniones: ['#2e333d', '#353b46'],
      cafe: ['#3a3631', '#423d37'], privadas: ['#2c313b', '#333944'], servidores: ['#1d222a', '#232933'], banos: ['#c8ccd2', '#b9bec6'] };
    for (const [k, r] of Object.entries(S)) if (suelos[k]) A.suelo(c, r, suelos[k][0], suelos[k][1], k === 'banos' ? 12 : 16);
    for (const k of Object.keys(suelos)) A.marco(c, S[k], 6);
    A.marco(c, [12, 12, 1136, 750], 8);
    // puertas
    A.puerta(c, 140, 168, 40, 14); A.puerta(c, 520, 168, 40, 14); A.puerta(c, 762, 120, 12, 36); A.puerta(c, 762, 262, 12, 40); A.puerta(c, 762, 470, 12, 40);
    A.puerta(c, 940, 190, 40, 12); A.puerta(c, 940, 372, 40, 12); A.puerta(c, 200, 586, 40, 14); A.puerta(c, 590, 586, 40, 14); A.puerta(c, 940, 586, 40, 14);
    // entrada principal
    c.fillStyle = '#0c111b'; c.fillRect(560, 756, 80, 16); A.puerta(c, 568, 754, 64, 10);
    c.fillStyle = '#20252e'; c.fillRect(560, 766, 80, 16); c.font = '700 10px monospace'; c.textAlign = 'center'; c.fillStyle = '#c9d2e0'; c.fillText('↑  ENTRADA  ↑', 600, 794);
    A.planta(c, 540, 772, 1.2); A.planta(c, 660, 772, 1.2);
    // --- pizarra: sofás frente a la pantalla
    { const [x, y, w] = S.pizarra; A.sofa(c, x + 60, y + 108, 54, 20); A.sofa(c, x + 186, y + 108, 54, 20); A.mesita(c, x + 142, y + 110, 16, 14); A.planta(c, x + 18, y + 120); A.planta(c, x + w - 18, y + 120); }
    // --- atrio: ventanales, sofás, mesas y plantas
    { const [x, y, w, h] = S.atrio;
      for (let k = 0; k < 8; k++) { c.fillStyle = '#16324a'; c.fillRect(x + 70 + k * 38, y - 6, 34, 10); c.fillStyle = '#3f7fae'; c.fillRect(x + 72 + k * 38, y - 4, 30, 3); }
      A.sofa(c, x + 110, y + 50, 46, 18); A.sofa(c, x + 270, y + 50, 46, 18); A.sofa(c, x + 160, y + 96, 18, 40); A.sofa(c, x + 270, y + 96, 18, 40); A.mesita(c, x + 210, y + 104, 18, 22);
      A.planta(c, x + 26, y + 40, 1.4); A.planta(c, x + w - 26, y + 40, 1.4); A.planta(c, x + 130, y + 118); A.planta(c, x + 330, y + 118); A.planta(c, x + 26, y + h - 16); }
    // --- laboratorio: pantallas de pared y mesas con 3 monitores, armario de servidores
    { const [x, y, w, h] = S.lab;
      for (let k = 0; k < 3; k++) { c.fillStyle = '#0a0d12'; c.fillRect(x + 26 + k * 104, y + 34, 92, 30); c.fillStyle = '#12233a'; c.fillRect(x + 28 + k * 104, y + 36, 88, 26); }
      for (let k = 0; k < 3; k++) A.escritorio(c, x + 24 + k * 104, y + 84, 82, 24);
      A.rack(c, x + w - 34, y + 36, 22, 60); A.planta(c, x + w - 24, y + h - 18); A.planta(c, x + 14, y + h - 18); }
    // --- sala de traders: mesas de 3 pantallas (las pantallas se pintan en vivo)
    { const [x, y, w, h] = S.traders;
      for (let f = 0; f < 5; f++) for (let k = 0; k < 7; k++) A.escritorio(c, x + 62 + k * 96, y + 50 + f * 72, 80, 20);
      for (let f = 0; f < 5; f++) A.escritorio(c, x + 14, y + 52 + f * 72, 28, 18);
      for (const s of S.sitios.filter(s => s.sala === 'traders')) A.silla(c, s.x, s.y - 12);
      A.planta(c, x + w - 16, y + 30); A.planta(c, x + w - 16, y + h - 20); A.planta(c, x + 16, y + h - 14); A.planta(c, x + w / 2, y + h - 12); }
    // --- reuniones: pantalla de pared, mesa larga, sillas
    { const [x, y, w, h] = S.reuniones; const [mx, my, mw, mh] = S.mesaReu;
      c.fillStyle = '#0a0d12'; c.fillRect(x + 130, y + 30, 120, 34); c.fillStyle = '#132a40'; c.fillRect(x + 132, y + 32, 116, 30);
      c.strokeStyle = '#4fa3ff'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i <= 110; i += 5) { const yy = y + 52 - Math.sin(i / 14) * 8 - i / 14; i ? c.lineTo(x + 135 + i, yy) : c.moveTo(x + 135 + i, yy); } c.stroke();
      for (const s of S.sitios.filter(s => s.sala === 'reuniones')) A.silla(c, s.x, s.dir === 'abajo' ? s.y - 26 : s.y - 10, '#1f2a3a');
      A.escritorio(c, mx, my, mw, mh); A.silla(c, mx - 12, my + 10, '#3a2a1c');
      A.planta(c, x + 18, y + h - 18); A.planta(c, x + w - 18, y + h - 18); A.planta(c, x + w - 18, y + 36); }
    // --- cafetería: barra con cafetera, nevera y máquina, mesas redondas
    { const [x, y, w, h] = S.cafe;
      c.fillStyle = '#2a1d12'; c.fillRect(x + 150, y + 30, 150, 22); c.fillStyle = '#6b6f78'; c.fillRect(x + 152, y + 32, 146, 18);
      for (let k = 0; k < 4; k++) { c.fillStyle = '#c0c4cc'; c.fillRect(x + 160 + k * 18, y + 34, 10, 10); }
      c.fillStyle = '#1b2230'; c.fillRect(x + 310, y + 28, 24, 40); c.fillStyle = '#4fd1ff'; c.fillRect(x + 313, y + 32, 18, 26);
      c.fillStyle = '#d8dce4'; c.fillRect(x + 338, y + 28, 22, 44); c.fillStyle = '#9aa3b2'; c.fillRect(x + 356, y + 40, 2, 10);
      for (const [mx, my] of S.mesasCafe) { c.fillStyle = '#3a2a1c'; c.beginPath(); c.arc(mx, my, 15, 0, 7); c.fill(); c.fillStyle = '#c49a64'; c.beginPath(); c.arc(mx, my, 13, 0, 7); c.fill(); }
      for (const s of S.sitios.filter(s => s.sala === 'cafe')) A.silla(c, s.x, s.y - 12, '#5a3d28');
      A.planta(c, x + 18, y + h - 16); A.planta(c, x + w - 18, y + h - 16); }
    // --- oficinas privadas: despachos con mampara de cristal
    for (const [x, y, w, h] of S.despachos) {
      c.fillStyle = '#5d7a99'; c.fillRect(x, y, 2, h); c.fillRect(x + w - 2, y, 2, h); c.fillRect(x, y, w, 2);
      c.fillStyle = 'rgba(120,170,220,.12)'; c.fillRect(x + 2, y + 2, w - 4, h - 4);
      A.escritorio(c, x + 12, y + 30, 50, 20); A.silla(c, x + 37, y + 62); A.planta(c, x + w - 12, y + h - 12, .8);
    }
    // --- servidores: filas de racks
    { const [x, y] = S.servidores; for (let k = 0; k < 2; k++) for (let r = 0; r < 6; r++) A.rack(c, x + 18 + r * 26, y + 40 + k * 56, 20, 44); A.planta(c, x + 312, y + 140); }
    // --- baños: cabinas, inodoros, lavabos
    { const [x, y, w, h] = S.banos;
      for (let k = 0; k < 4; k++) { const bx = x + 20 + k * 52; c.fillStyle = '#7c8594'; c.fillRect(bx, y + 24, 2, 56); c.fillRect(bx + 48, y + 24, 2, 56); c.fillStyle = '#9a6a3a'; c.fillRect(bx + 8, y + 78, 34, 4); A.inodoro(c, bx + 25, y + 34); }
      for (let k = 0; k < 3; k++) { c.fillStyle = '#e8ecf2'; c.fillRect(x + w - 34, y + 30 + k * 34, 18, 22); c.fillStyle = '#9aa3b2'; c.fillRect(x + w - 28, y + 36 + k * 34, 6, 8); }
      c.fillStyle = '#5a6270'; c.font = '700 14px sans-serif'; c.textAlign = 'center'; c.fillText('🚹 🚺', x + 120, y + 124); }
    // carteles
    for (const [k, r] of Object.entries(TR_SALAS)) { const s = S[k]; A.cartel(c, s[0] + s[2] / 2, s[1] + (k === 'traders' || k === 'reuniones' || k === 'cafe' ? 10 : 6), r[0]); }
    this._fondo = cv;
    return cv;
  },

  // ---------- a qué sala va cada uno ----------
  zonaDe(a, n, ahora) {
    const on = n.local || n.en_linea, k = n.nodo + ':' + a.id, h = trHash(k);
    if (!on || ['parado', 'retirado', 'en pausa'].includes(a.estado) || (n.kpis && n.kpis.activo === false)) return 'cafe';
    if (a.estrategia === 'llm') return 'reuniones';
    if (a.estado === 'quebrado' || (this.labHasta.get(k) || 0) > ahora) return 'lab';
    if (this.privados && this.privados.has(k)) return 'privadas';
    if (a.estado === 'en posición') return 'traders';
    if ((h + Math.floor(ahora / 90)) % 60 === 0) return 'banos';
    return h % 6 === 0 ? 'pasillo' : h % 2 ? 'atrio' : 'pizarra';
  },
  puntoEn(z, semilla) {
    const S = this.plano(), s = (semilla * 9301 + 49297) % 233280, s2 = (semilla * 7 * 9301 + 12345) % 233280;
    const zonas = { atrio: [S.atrio[0] + 40, S.atrio[1] + 70, S.atrio[2] - 80, 70], pizarra: [S.pizarra[0] + 30, S.pizarra[1] + 92, S.pizarra[2] - 60, 50],
      pasillo: [S.traders[0] + 50, S.traders[1] + 36, S.traders[2] - 80, S.traders[3] - 50], lab: [S.lab[0] + 30, S.lab[1] + 140, S.lab[2] - 80, 24],
      cafe: [S.cafe[0] + 30, S.cafe[1] + 70, S.cafe[2] - 60, 110], reuniones: [S.reuniones[0] + 30, S.reuniones[1] + 60, 50, 90],
      privadas: [S.privadas[0] + 20, S.privadas[1] + 140, S.privadas[2] - 40, 10], banos: [S.banos[0] + 30, S.banos[1] + 96, 200, 40],
      traders: [S.traders[0] + 50, S.traders[1] + 36, S.traders[2] - 80, S.traders[3] - 50] };
    const [x, y, w, h] = zonas[z] || zonas.atrio;
    let px = x + s / 233280 * w, py = y + s2 / 233280 * h;
    if (z === 'pasillo' || z === 'traders') { py = S.traders[1] + 112 + Math.floor(s2 / 233280 * 5) * 72 - 8; }   // por los pasillos entre filas de mesas
    return [px, py];
  },
  actualizarPJ(d, ahora) {
    const S = this.plano(), vivos = new Set();
    for (const st of S.sitios) if (st.ocupa && !this.pj.get(st.ocupa)) st.ocupa = null;
    for (const n of d.nodos) for (const a of n.agentes || []) {
      const k = n.nodo + ':' + a.id; vivos.add(k);
      let p = this.pj.get(k);
      if (!p) { const [x, y] = this.pj.size < 20 || !this._yaCargo ? this.puntoEn('atrio', trHash(k)) : S.entrada; p = { x, y, tx: x, ty: y, zona: null }; this.pj.set(k, p); }
      p.a = a; p.n = n; p.k = k;
      const z = this.zonaDe(a, n, ahora), mover = z !== p.zona || (['atrio', 'pizarra', 'pasillo'].includes(z) && Math.random() < .06) || (z === 'cafe' && !p.sitio && Math.random() < .03);
      if (!mover) continue;
      if (p.sitio && p.sitio.sala !== z) { p.sitio.ocupa = null; p.sitio = null; }
      if (['traders', 'lab', 'reuniones', 'privadas', 'cafe'].includes(z) && !p.sitio) {
        const libres = S.sitios.filter(s => s.sala === z && !s.ocupa);
        p.sitio = (z === 'privadas' ? libres[0] : libres[trHash(k) % Math.max(1, libres.length)]) || null;
        if (p.sitio) p.sitio.ocupa = k;
      }
      const [tx, ty] = p.sitio ? [p.sitio.x, p.sitio.y] : this.puntoEn(z, trHash(k) + Math.floor(ahora / 9) * 13);
      p.tx = tx; p.ty = ty; p.zona = z;
    }
    for (const k of [...this.pj.keys()]) if (!vivos.has(k)) { const p = this.pj.get(k); if (p.sitio) p.sitio.ocupa = null; this.pj.delete(k); }
    this._yaCargo = true;
  },

  dibujar(t) {
    const d = this.datos; if (!d) return;
    const W = TR_W, H = TR_H, c = this.c;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    c.imageSmoothingEnabled = false;
    const S = this.plano(), ahora = performance.now() / 1000, dt = Math.min(.2, ahora - (this.tAnt || ahora)); this.tAnt = ahora;
    c.drawImage(this.fondo(), 0, 0);
    trPresupuesto = 40;
    this.pizarra(c, [S.pizarra[0] + 20, S.pizarra[1] + 32, S.pizarra[2] - 40, 64], d.precios || []);
    this.racks(c, S.servidores, d.nodos, t);
    // pantallas: verdes/rojas según la posición de quien está sentado; las del laboratorio, gráficas en rojo
    for (const st of S.sitios) {
      if (st.mx == null) continue;
      const p = st.ocupa && this.pj.get(st.ocupa), corto = p && /corto|🔴/.test(p.a.ultimo || '');
      const col = !p ? null : st.sala === 'lab' ? '#ff9b6b' : corto ? '#ff6b6b' : '#5dff9b';
      trArte.monitor(c, st.mx, st.my, 16, 12);
      if (col) {
        c.fillStyle = st.sala === 'lab' ? '#2a1a14' : corto ? '#2a0d12' : '#0d2a18'; c.fillRect(st.mx + 1, st.my + 1, 14, 9);
        c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
        for (let i = 0; i <= 12; i += 2) { const yy = st.my + 6 + Math.sin(i * .7 + t * 3 + st.mx) * 1.5 + (corto ? i / 6 : -i / 6); i ? c.lineTo(st.mx + 2 + i, yy) : c.moveTo(st.mx + 2 + i, yy); }
        c.stroke();
      }
    }
    // el jefe de mesa preside la reunión
    { const [mx, my] = S.mesaReu, L = this._jefeL || (this._jefeL = (() => { const L = { piel: MM_PIEL[1], pelo: MM_PELO[2], estilo: MM_ESTILO[1], ropa: '#1d2433', pantalon: '#1d2433', gafas: '#ffcf4d' }; L.k = 'jefe'; return L; })());
      const sj = trSprite(L, 'lado', 0, false); if (sj) c.drawImage(sj, mx - 22, my - 10); c.font = '700 8px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffcf4d'; c.fillText('JEFE', mx - 14, my - 13); }
    // personajes: andan hacia su destino; de detrás hacia delante
    const lista = [...this.pj.values()];
    for (const p of lista) {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy), v = 70 * dt;
      if (dist > 1.5) { p.x += dx / dist * Math.min(v, dist); p.y += dy / dist * Math.min(v, dist); p.anda = true; if (Math.abs(dx) > .5) p.izq = dx < 0; p.dir = Math.abs(dx) > Math.abs(dy) ? 'lado' : dy < 0 ? 'arriba' : 'abajo'; }
      else { p.anda = false; p.dir = p.sitio ? (p.sitio.dir || 'arriba') : p.zona === 'pizarra' ? 'arriba' : 'abajo'; if (p.sitio && p.sitio.dir === 'lado') p.izq = !p.sitio.izq; }
    }
    lista.sort((a, b) => a.y - b.y);
    this.cajas = [];
    for (const p of lista) {
      const a = p.a, L = trLook(a), quebrado = a.estado === 'quebrado', sel = this.sel && this.sel.id === a.id && this.sel.nodo === p.n.nodo;
      const f = p.anda ? Math.floor(t * 8 + trHash(p.k)) % 4 : 0, sp = trSprite(L, p.dir, f, p.anda);
      if (!sp) continue;
      const ew = 16, eh = 30, x = Math.round(p.x - ew / 2), y = Math.round(p.y - eh + 4);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 3, y + eh - 3, ew - 6, 3);
      c.globalAlpha = quebrado ? .65 : 1;
      if (p.dir === 'lado' && p.izq) { c.save(); c.translate(x + ew, y); c.scale(-1, 1); c.drawImage(sp, 0, 0); c.restore(); } else c.drawImage(sp, x, y);
      c.globalAlpha = 1;
      c.fillStyle = p.n.nodo === 'pi' ? '#2fd1b0' : '#c77dff'; c.fillRect(x + ew - 3, y + 1, 3, 3);      // de qué equipo es
      if ((a.metas || 0) > 0) { c.fillStyle = '#ffcf4d'; c.fillRect(x + 4, y - 2, 8, 2); c.fillRect(x + 4, y - 4, 2, 2); c.fillRect(x + 7, y - 4, 2, 2); c.fillRect(x + 10, y - 4, 2, 2); }
      if (p.zona === 'privadas' && !p.anda) { c.font = '700 7px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffcf4d'; c.fillText(a.nombre, p.x, p.y + 12); }
      if (sel) { c.strokeStyle = '#ffcf4d'; c.lineWidth = 1; c.strokeRect(x - 2, y - 4, ew + 4, eh + 6); c.font = '700 8px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.fillText(a.nombre, p.x, y - 7); }
      const b = this.burbujas.get(p.k) || (p.zona === 'lab' && Math.floor(t + trHash(p.k)) % 5 === 0 ? { em: '🧠', hasta: ahora + 1 } : null);
      if (b && b.hasta > ahora) { c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(x + 10, y - 12, 14, 12); c.font = '9px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(b.em, x + 17, y - 3); }
      this.cajas.push({ x: x - 2, y: y - 2, w: ew + 4, h: eh + 4, a: { ...a, nodo: p.n.nodo } });
    }
    this.cajas.reverse();                                  // el de delante gana al pasar el ratón
    // ocupación de cada sala
    this.cuenta = {};
    for (const p of lista) { const z = p.zona === 'pasillo' ? 'traders' : p.zona; this.cuenta[z] = (this.cuenta[z] || 0) + 1; }
    c.font = '700 9px monospace'; c.textAlign = 'right';
    for (const z of Object.keys(TR_SALAS)) { const r = S[z]; if (!this.cuenta[z]) continue; c.fillStyle = 'rgba(11,15,22,.8)'; c.fillRect(r[0] + r[2] - 34, r[1] + r[3] - 16, 30, 13); c.fillStyle = '#9fb3c8'; c.fillText(`👤${this.cuenta[z]}`, r[0] + r[2] - 7, r[1] + r[3] - 6); }
    if (this.salaSel) { const r = S[this.salaSel]; c.strokeStyle = '#2fd1b0'; c.lineWidth = 2; c.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); }
  },
  pizarra(c, [x, y, w, h], pr) {                         // la pantalla de pared con las cotizaciones reales
    c.fillStyle = '#05070a'; c.fillRect(x - 3, y - 3, w + 6, h + 6); c.fillStyle = '#dfe6ef'; c.fillRect(x, y, w, h);
    if (!pr.length) return;
    const cols = Math.ceil(pr.length / 3), cw = (w - 8) / cols;
    pr.forEach((p, i) => {
      const xx = x + 5 + (i % cols) * cw, yy = y + 3 + Math.floor(i / cols) * 20, up = (p.cambio_pct || 0) >= 0;
      c.font = '700 8px monospace'; c.textAlign = 'left'; c.fillStyle = p.abierto ? '#1d2636' : '#8a94a3'; c.fillText(p.simbolo.replace('-USD', ''), xx, yy + 8);
      c.fillStyle = p.abierto ? (up ? '#13893f' : '#c62c3a') : '#8a94a3'; c.font = '8px monospace';
      c.fillText(`${up ? '▲' : '▼'}${Math.abs(p.cambio_pct || 0).toFixed(1)}%`, xx, yy + 17);
    });
  },
  racks(c, [x, y, w, h], nodos, t) {                     // una ficha por equipo sobre sus racks, con los números reales
    nodos.slice(0, 2).forEach((nd, i) => {
      const k = nd.kpis || {}, ag = nd.agentes || [], on = nd.local || nd.en_linea, rx = x + 12 + i * 160, ry = y + 32;
      for (let r = 0; r < 6; r++) for (let l = 0; l < 3; l++) { c.fillStyle = on && (Math.floor(t * 3 + l * 1.7 + r + i) % 3) ? '#5dff9b' : '#1d3a26'; c.fillRect(x + 22 + r * 26 + l * 5, y + 44 + i * 56, 3, 2); }
      if (on) for (let r = 0; r < 6; r++) { c.fillStyle = Math.floor(t * 5 + r * 3 + i) % 4 ? '#4fa3ff' : '#123'; c.fillRect(x + 22 + r * 26, y + 58 + i * 56, 2, 2); }
      const ops = ag.reduce((s, a) => s + (a.trades || 0), 0), qui = ag.reduce((s, a) => s + (a.quiebras || 0), 0);
      const cap = ag.reduce((s, a) => s + (a.equity || 0), 0), ini = (k.capital || 1) * ag.length;
      const bx = x + 176, by = ry + i * 56;
      c.fillStyle = 'rgba(8,11,16,.92)'; c.fillRect(bx, by, 148, 50); c.strokeStyle = on ? (nd.nodo === 'pi' ? '#2fd1b0' : '#c77dff') : '#7a3030'; c.lineWidth = 1; c.strokeRect(bx + .5, by + .5, 147, 49);
      c.font = '700 9px monospace'; c.textAlign = 'left'; c.fillStyle = '#d6e6e2'; c.fillText(`${String(nd.nodo).toUpperCase()} · ${ag.length} ${on ? '' : '· OFF'}`, bx + 5, by + 12);
      c.font = '8px monospace'; c.fillStyle = cap >= ini ? '#5dff9b' : '#ff7b7b'; c.fillText(`${cap.toFixed(2)}$ (${cap - ini >= 0 ? '+' : ''}${(cap - ini).toFixed(3)})`, bx + 5, by + 24);
      c.fillStyle = '#9fb3c8'; c.fillText(`${ops} op · R ${k.r_medio != null ? k.r_medio.toFixed(2) : '—'}`, bx + 5, by + 35); c.fillText(`${qui} quiebras · gen ${k.generacion ?? 0}`, bx + 5, by + 45);
    });
  },

  // ---------- ratón y fichas ----------
  pos(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) * this.cv.width / r.width, (e.clientY - r.top) * this.cv.height / r.height]; },
  agenteEn(e) { const [x, y] = this.pos(e); return (this.cajas.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || {}).a || null; },
  salaEn(e) { const [x, y] = this.pos(e), S = this.plano(); return Object.keys(TR_SALAS).find(k => { const [rx, ry, rw, rh] = S[k]; return x >= rx && x < rx + rw && y >= ry && y < ry + rh; }) || null; },
  raton(e) {
    const a = this.agenteEn(e), tip = $('#trTip', this.v);
    if (!a) { tip.hidden = true; this.cv.style.cursor = this.salaEn(e) ? 'pointer' : ''; return; }
    this.cv.style.cursor = 'pointer';
    tip.innerHTML = `<b>${esc(a.nombre)}</b> · ${esc(a.nodo)}<br>${a.estrategia} · ${a.marco} · ${tr('gen')} ${a.generacion}<br>${tr('capital')} ${(a.equity ?? 0).toFixed(4)} $ (${(a.pnl_pct ?? 0).toFixed(1)}%) · ${tr('máx')} ${(a.max_equity ?? 0).toFixed(3)} $<br>${a.trades} ${tr('operaciones')} · ${a.ganados} ${tr('ganadas')} · ${a.quiebras || 0} ${tr('quiebras')}${a.r_medio != null ? ` · ${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R` : ''}<br><span class="sutil">${esc(a.estado)} · ${esc(a.ultimo || '')}</span>`;
    const r = this.cv.parentElement.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 240) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; tip.hidden = false;
  },
  fichaSala(z) {
    const el = $('#trFicha', this.v); if (!el || this.sel) return;
    const d = this.datos, todos = [...this.pj.values()];
    const en = z ? todos.filter(p => (p.zona === 'pasillo' ? 'traders' : p.zona) === z).map(p => p.a) : todos.map(p => p.a);
    const cap = en.reduce((s, a) => s + (a.equity || 0), 0), mx = en.reduce((s, a) => Math.max(s, a.max_equity || 0), 0);
    const rs = en.filter(a => a.r_medio != null), r = rs.length ? rs.reduce((s, a) => s + a.r_medio, 0) / rs.length : null;
    const [, nombre, desc, ubic] = z ? TR_SALAS[z] : [null, 'Mission Control · Piso 1', 'Oficina principal: análisis, coordinación y operaciones del enjambre. Haz clic en una sala o en un trader.', 'Centro de la ciudad'];
    el.innerHTML = `<div class="tr-tit tr-ed">${ic('edificio')}<div>${tr(z ? 'SALA' : 'EDIFICIO / OFICINA')}<span>${esc(tr(nombre))}</span></div></div>
      <div class="tr-fk"><div><small>${tr('Capital')}</small><b>${cap.toFixed(2)} $</b></div><div><small>${tr('Máximo')}</small><b>${mx.toFixed(3)} $</b></div>
      <div><small>Traders</small><b>${en.length}${d ? ` <span class="sutil">(${en.filter(a => a.estado === 'en posición').length} ${tr('operando')})</span>` : ''}</b></div>
      <div><small>R</small><b class="${(r || 0) > 0 ? 'ok' : 'mal'}">${r != null ? (r > 0 ? '+' : '') + r.toFixed(2) : '—'}</b></div></div>
      <p class="tr-desc">${esc(tr(desc))}</p><p class="tr-ubi">${ic('pin')}${tr('Ubicación')}: <span>${esc(tr(ubic))}</span></p>`;
  },
  async ficha(a, refresco) {
    const el = $('#trFicha', this.v); if (!el) return;
    const pie = `<p class="tr-desc">${a.estrategia} · ${tr('velas de')} ${a.marco} · ${tr('riesgo')} ${a.riesgo_pct}%${a.tendencia ? ' · ' + tr('solo a favor de tendencia') : ''}</p>`;
    let extra = '';
    const local = (this.datos?.nodos || []).find(n => n.nodo === a.nodo)?.local;
    if (local && !refresco) {
      try {
        const d = await api('GET', `/trading/agente/${a.id}`);
        if (!this.v || !this.sel || this.sel.id !== a.id) return;
        const g = d.genoma;
        extra = `<p class="sutil">stop ${g.stop_atr} ATR · ${tr('objetivo')} ${g.rr}R · ${tr('máx')} ${g.max_barras} ${tr('velas')} · BE ${g.be_en_r || 'no'} · ${tr('entrada')} ${g.entrada || 'mercado'} · ${tr('tramos')} ${g.tramos || 1}${g.trail_r ? ' · trailing ' + g.trail_r + 'R' : ''}${g.filtro_ia ? ' · IA ≥ ' + g.filtro_ia : ''}</p>` +
          `<div class="tr-tit">${tr('Intentos')}</div>` + d.intentos_lista.slice(0, 5).map(i => `<div class="sutil">#${i.id} · máx ${(+i.max_equity).toFixed(3)} $ · ${i.trades} trades · ${esc(i.resultado || tr('en curso'))}${i.causa ? ' · ' + esc(i.causa) : ''}</div>`).join('') +
          `<div class="tr-tit">${tr('Lo que aprendió')}</div>` + (d.lecciones.slice(0, 5).map(l => `<div class="tr-l">${esc(l.texto)}</div>`).join('') || `<p class="sutil">—</p>`);
        this.extra = extra;
      } catch { extra = ''; }
    } else if (refresco) extra = this.extra || '';
    el.innerHTML = `<div class="tr-tit tr-ed">${ic('persona')}<div>${esc(a.nombre)}<span>${esc(a.nodo)} · ${tr('gen')} ${a.generacion}</span></div></div>
      <div class="tr-fk"><div><small>${tr('Capital')}</small><b>${(a.equity ?? 0).toFixed(4)} $</b></div><div><small>${tr('Máximo')}</small><b>${(a.max_equity ?? 0).toFixed(3)} $</b></div>
      <div><small>Trades</small><b>${a.trades} <span class="sutil">(${a.ganados}✔)</span></b></div><div><small>R</small><b class="${(a.r_medio || 0) > 0 ? 'ok' : 'mal'}">${a.r_medio != null ? a.r_medio.toFixed(2) : '—'}</b></div></div>
      ${pie}<p class="tr-desc">${esc(a.estado)} · ${esc(a.ultimo || '')}</p>${extra}`;
  },
};

// estilos propios de la vista (una sola vez)
(() => {
  const st = document.createElement('style');
  st.textContent = `.tr-mc{--tr-fondo:#0b1220;--tr-card:#0f1828;--tr-borde:#22314a;--tr-acento:#2fd1b0}
  .tr-cab{display:flex;align-items:center;gap:22px;background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:10px;padding:12px 18px;margin-bottom:10px}
  .tr-logo{display:flex;align-items:center;gap:12px;padding-right:22px;border-right:1px solid var(--tr-borde)}.tr-logo .i{width:38px;height:38px;color:var(--tr-acento)}
  .tr-logo b{display:block;font:800 22px/1 system-ui;letter-spacing:.06em;color:var(--tr-acento)}.tr-logo span{font-size:11px;letter-spacing:.14em;opacity:.7}
  .tr-cab p{flex:1;margin:0;font-size:13px;opacity:.85}.tr-ley{display:flex;gap:16px;font-size:11px;opacity:.85;border:1px solid var(--tr-borde);border-radius:6px;padding:6px 10px}
  .tr-ley i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
  .tr-cuerpo{display:grid;grid-template-columns:1fr 300px;gap:14px;align-items:start}
  .tr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
  .tr-kpi{background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:8px;padding:10px 14px}.tr-kpi small{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.06em;opacity:.8}
  .tr-kpi small .i{width:16px;height:16px}.tr-kpi b{display:block;font:700 26px/1.2 system-ui;margin:4px 0 2px}.tr-kpi span{font-size:11px;opacity:.65}
  .tr-sala{position:relative;background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:10px;padding:6px;overflow:auto;max-height:calc(100vh - 230px)}
  .tr-sala canvas{width:100%;image-rendering:pixelated;display:block}
  .tr-tip{position:absolute;z-index:3;background:rgba(10,14,20,.96);border:1px solid var(--tr-acento);border-radius:6px;padding:8px 10px;font-size:12px;pointer-events:none;max-width:240px}
  .tr-lado{display:flex;flex-direction:column;gap:12px}.tr-card{background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:10px;padding:14px}
  .tr-tit{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.05em;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--tr-borde)}
  .tr-tit .i{width:18px;height:18px;color:var(--tr-acento)}.tr-ed .i{width:28px;height:28px}.tr-ed span{display:block;font-weight:400;letter-spacing:0;opacity:.75;font-size:12px}
  summary.tr-tit{cursor:pointer;margin:0}
  .tr-ctl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px}.tr-ctl label{font-size:11px;opacity:.8}.tr-ctl input,.tr-ctl select{width:100%}
  .tr-bot{display:flex;gap:8px}.tr-bot .btn{flex:1;justify-content:center}.tr-central{font-size:11px;opacity:.8;margin:8px 0 0}
  .tr-lec{max-height:320px;overflow:auto;margin-top:8px}.tr-l{font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .tr-fk{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:6px 0 10px}.tr-fk small{display:block;opacity:.6;font-size:11px}.tr-fk b{font-size:16px}
  .tr-desc{font-size:12px;opacity:.85;margin:6px 0;padding-top:8px;border-top:1px solid var(--tr-borde)}.tr-ubi{display:flex;align-items:center;gap:6px;font-size:12px;margin:6px 0 0}.tr-ubi .i{width:14px;height:14px}.tr-ubi span{color:var(--tr-acento)}
  .tr-top{display:grid;grid-template-columns:14px 1fr auto 22px;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--tr-borde);cursor:pointer}
  .tr-top i{width:12px;height:12px;border-radius:50%}.tr-top b{display:block;font-size:13px}.tr-top span{font-size:11px;opacity:.65}.tr-top em{font-style:normal;font-weight:700}.tr-top small{opacity:.6;text-align:right}
  .tr-top:hover{background:rgba(47,209,176,.06)}
  @media (max-width:1200px){.tr-cuerpo{grid-template-columns:1fr}.tr-kpis{grid-template-columns:repeat(3,1fr)}.tr-cab{flex-wrap:wrap}}`;
  document.head.appendChild(st);
})();
