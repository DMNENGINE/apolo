// Mission Control → Trading: la sala del enjambre de DMN Trader en pixel-art. Cada agente es un trader en su mesa;
// una zona por equipo (la Pi central, el PC u otros nodos). Pensado para 300+ agentes: dibujo a ~12 fps y datos cada 5 s.
// Datos: GET /v1/trading/mapa (proxy a la central, core/trading.js). Los personajes son los de mision-mundo-arte.js (mmPJ).

const TR_CW = 104, TR_CH = 96, TR_COLS = 10, TR_M = 16, TR_CAB = 74, TR_TICK = 58;
const TR_ROPA = { ema_cruce: '#3b6fb6', rsi_rev: '#8a4fb5', ruptura: '#c08a2e', bollinger: '#2f8f8f', impulso: '#b5452f' };
const TR_PANT = { '1m': '#30344a', '5m': '#3a4520', '15m': '#4a2a2a' };
const TR_SOMB = ['', '', 'gorra', 'casco', 'capucha'];
const trHash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

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
    this.v = v; this.datos = null; this.burbujas = new Map(); this.antes = new Map(); this.sel = null; this.cajas = [];
    v.innerHTML = `<div class="pagina mision ancha">${cabecera('Mission Control', 'El enjambre de agentes de trading: cada trader opera solo con microoperaciones simuladas, aprende de cada pérdida y evoluciona. Una zona por equipo.')}
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
      }
      this.antes.set(k, a.ultimo);
    }
    this.datos = d;
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

  // ---------- dibujo: una planta de oficinas por equipo, un despacho por trader ----------
  dibujar(t) {
    const d = this.datos; if (!d) return;
    const nodos = d.nodos.filter(n => (n.agentes || []).length);
    const W = TR_COLS * TR_CW + TR_M * 2;
    let H = TR_M + TR_TICK; for (const n of nodos) H += TR_CAB + Math.ceil(n.agentes.length / TR_COLS) * TR_CH + TR_M;
    H = Math.max(H, 260);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    const c = this.c; c.imageSmoothingEnabled = false;
    c.fillStyle = '#0e1218'; c.fillRect(0, 0, W, H);
    this.cajas = [];
    this.pizarra(c, W, d.precios || []);
    let y0 = TR_M + TR_TICK;
    const ahora = performance.now() / 1000;
    for (const n of nodos) {
      const filas = Math.ceil(n.agentes.length / TR_COLS), alto = TR_CAB + filas * TR_CH;
      const on = n.local || n.en_linea, k = n.kpis || {};
      for (let y = y0; y < y0 + alto; y += 8) for (let x = TR_M / 2; x < W - TR_M / 2; x += 8) { c.fillStyle = ((x + y) / 8) % 2 ? '#1a2230' : '#1c2533'; c.fillRect(x, y, 8, 8); }
      c.strokeStyle = on ? '#2fd1b0' : '#7a3030'; c.globalAlpha = .55; c.lineWidth = 2; c.strokeRect(TR_M / 2 + 1, y0 + 1, W - TR_M - 2, alto - 2); c.globalAlpha = 1;
      mmCartel(c, W / 2, y0 + 6, `${String(n.nodo).toUpperCase()} · ${n.agentes.length} TRADERS${k.activo === false ? ' · PARADO' : ''}${!on ? ' · SIN CONEXIÓN' : ''}`, { borde: on ? '#2fd1b0' : '#c0392b', max: W - 40 });
      // panel de la planta: resultados reales del equipo
      const tot = n.agentes.reduce((x, a) => x + (a.equity || 0), 0), cap = (k.capital || 1) * n.agentes.length;
      const ops = n.agentes.reduce((x, a) => x + (a.trades || 0), 0), gan = n.agentes.reduce((x, a) => x + (a.ganados || 0), 0);
      const qui = n.agentes.reduce((x, a) => x + (a.quiebras || 0), 0), met = n.agentes.reduce((x, a) => x + (a.metas || 0), 0), mejor = Math.max(0, ...n.agentes.map(a => a.max_equity || 0));
      const verde = tot >= cap ? '#5dff9b' : '#ff7b7b';
      const items = [['CAPITAL', `${tot.toFixed(2)} $`, verde], ['P&L', `${tot - cap >= 0 ? '+' : ''}${(tot - cap).toFixed(3)} $`, verde],
        ['OPERACIONES', `${ops}`, '#d6e6e2'], ['ACIERTO', ops ? `${Math.round(gan / ops * 100)}%` : '—', '#d6e6e2'], ['QUIEBRAS', `${qui}`, qui ? '#ff9b6b' : '#d6e6e2'],
        ['METAS', `${met}`, met ? '#ffcf4d' : '#d6e6e2'], ['MEJOR', `${mejor.toFixed(2)} $`, '#d6e6e2'], ['GENERACIÓN', `${k.generacion ?? 0}`, '#d6e6e2']];
      const pw = (W - TR_M * 2 - 20) / items.length;
      items.forEach(([et, v, col], i) => { const x = TR_M + 10 + i * pw; c.fillStyle = '#0b0f14'; c.fillRect(x, y0 + 38, pw - 6, 28); c.fillStyle = '#5f6b7a'; c.font = '7px monospace'; c.textAlign = 'left'; c.fillText(et, x + 5, y0 + 47); c.fillStyle = col; c.font = '700 11px monospace'; c.fillText(v, x + 5, y0 + 61); });
      n.agentes.forEach((a, i) => {
        const x = TR_M + (i % TR_COLS) * TR_CW, y = y0 + TR_CAB + Math.floor(i / TR_COLS) * TR_CH;
        this.oficina(c, a, n, x, y, t, ahora, k.capital || 1, on);
        this.cajas.push({ x, y, w: TR_CW, h: TR_CH, a: { ...a, nodo: n.nodo } });
      });
      y0 += alto + TR_M;
    }
  },
  pizarra(c, W, pr) {                                     // pantalla de pared con cotizaciones reales
    const y = TR_M / 2, h = TR_TICK - 10;
    c.fillStyle = '#05070a'; c.fillRect(TR_M / 2, y, W - TR_M, h); c.strokeStyle = '#2b3442'; c.lineWidth = 1; c.strokeRect(TR_M / 2 + .5, y + .5, W - TR_M - 1, h - 1);
    if (!pr.length) return;
    const cols = Math.ceil(pr.length / 2), cw = (W - TR_M - 8) / cols;
    pr.forEach((p, i) => {
      const x = TR_M / 2 + 6 + (i % cols) * cw, yy = y + 4 + (i >= cols ? 22 : 0), up = (p.cambio_pct || 0) >= 0;
      c.font = '700 8px monospace'; c.textAlign = 'left'; c.fillStyle = p.abierto ? '#9fb3c8' : '#4c5664'; c.fillText(p.simbolo.replace('-USD', ''), x, yy + 8);
      c.fillStyle = p.abierto ? (up ? '#5dff9b' : '#ff6b6b') : '#5a6470'; c.font = '8px monospace';
      const pv = p.precio >= 1000 ? p.precio.toFixed(0) : p.precio >= 1 ? p.precio.toFixed(2) : p.precio.toFixed(4);
      c.fillText(`${pv} ${up ? '▲' : '▼'}${Math.abs(p.cambio_pct || 0).toFixed(1)}%`, x, yy + 18);
    });
  },
  oficina(c, a, n, x, y, t, ahora, cap, on) {
    const quebrado = a.estado === 'quebrado', parado = !on || ['parado', 'retirado'].includes(a.estado) || (n.kpis && n.kpis.activo === false);
    const pos = a.estado === 'en posición', corto = /corto/.test(a.ultimo || ''), sel = this.sel && this.sel.id === a.id && this.sel.nodo === n.nodo;
    const fase = (trHash(a.nombre) % 7) * .3;
    // despacho: suelo, mampara de cristal y puerta
    c.fillStyle = '#202a38'; c.fillRect(x + 3, y + 3, TR_CW - 6, TR_CH - 6);
    c.fillStyle = 'rgba(120,170,220,.22)'; c.fillRect(x + 3, y + 3, TR_CW - 6, 3); c.fillRect(x + 3, y + 3, 3, TR_CH - 6); c.fillRect(x + TR_CW - 6, y + 3, 3, TR_CH - 6);
    c.fillStyle = '#3a4a5e'; c.fillRect(x + 3, y + TR_CH - 6, TR_CW - 6, 3); c.fillStyle = '#202a38'; c.fillRect(x + TR_CW / 2 - 9, y + TR_CH - 6, 18, 3);
    if (sel) { c.strokeStyle = '#ffcf4d'; c.lineWidth = 2; c.strokeRect(x + 2, y + 2, TR_CW - 4, TR_CH - 4); }
    // trader sentado mirando su monitor
    const L = trLook(a), f = parado ? 0 : Math.floor((t * 2 + fase) % 4);
    c.globalAlpha = parado ? .45 : quebrado ? .6 : 1;
    c.drawImage(mmPJ(L, 'lado', f, 'quieto', Math.sin(t * .7 + fase) > .97), x + 8, y + 18);
    c.globalAlpha = 1;
    if ((a.metas || 0) > 0) { c.fillStyle = '#ffcf4d'; c.fillRect(x + 14, y + 28, 14, 3); for (const k of [0, 5, 10]) c.fillRect(x + 14 + k, y + 25, 4, 3); }
    // mesa y monitor con la gráfica REAL de su capital (últimas horas)
    c.fillStyle = '#4a3a2c'; c.fillRect(x + 32, y + 58, 66, 5); c.fillStyle = '#2c2118'; c.fillRect(x + 34, y + 63, 3, 12); c.fillRect(x + 93, y + 63, 3, 12);
    const mx = x + 36, my = y + 14, mw = 60, mh = 38;
    c.fillStyle = '#0a0d12'; c.fillRect(mx - 2, my - 2, mw + 4, mh + 4); c.fillStyle = '#2a2f37'; c.fillRect(mx + mw / 2 - 2, my + mh + 2, 4, 4);
    const eq = a.equity ?? cap, gana = eq >= cap, colG = gana ? '#5dff9b' : '#ff7b7b';
    c.fillStyle = quebrado ? (Math.floor(t * 3) % 2 ? '#3a0a0a' : '#1a0505') : parado ? '#0b0d10' : '#07121e'; c.fillRect(mx, my, mw, mh);
    const cv = a.curva || [];
    if (cv.length > 1 && !parado) {
      const lo = Math.min(cap * .98, ...cv), hi = Math.max(cap * 1.02, ...cv), py = v => my + mh - 4 - (v - lo) / (hi - lo || 1) * (mh - 14);
      c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 1; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(mx, py(cap)); c.lineTo(mx + mw, py(cap)); c.stroke(); c.setLineDash([]);
      c.strokeStyle = colG; c.beginPath();
      cv.forEach((v, i) => { const xx = mx + 2 + i / (cv.length - 1) * (mw - 4); if (i) c.lineTo(xx, py(v)); else c.moveTo(xx, py(v)); }); c.stroke();
    } else if (!parado && !quebrado) { c.fillStyle = 'rgba(120,180,255,.35)'; c.fillRect(mx + ((t * 12 + fase * 9) % mw), my, 1, mh); }
    c.font = '700 8px monospace'; c.textAlign = 'left'; c.fillStyle = colG; c.fillText(`${eq.toFixed(eq < 10 ? 3 : 2)}$`, mx + 3, my + 9);
    c.textAlign = 'right'; c.fillText(`${(a.pnl_pct ?? 0) >= 0 ? '+' : ''}${(a.pnl_pct ?? 0).toFixed(1)}%`, mx + mw - 3, my + 9);
    if (pos) { const sym = ((a.ultimo || '').match(/([A-Z]{2,5})(-USD)?/) || [])[1] || ''; c.textAlign = 'left'; c.fillStyle = corto ? '#ff6b6b' : '#5dff9b'; c.font = '7px monospace'; c.fillText(`${sym} ${corto ? '▼' : '▲'}`, mx + 3, my + mh - 3); }
    if (quebrado) { c.textAlign = 'center'; c.fillStyle = '#ff5252'; c.font = '700 9px monospace'; c.fillText('QUIEBRA', mx + mw / 2, my + mh / 2 + 6); }
    // LED de estado sobre la mesa
    c.fillStyle = parado ? '#333' : quebrado ? '#ff3b3b' : pos ? (corto ? '#ff6b6b' : '#5dff9b') : (Math.floor(t * 2 + fase) % 2 ? '#3f8fff' : '#1d3a66'); c.fillRect(x + 86, y + 55, 4, 3);
    // placa: nombre y números reales
    c.textAlign = 'left'; c.font = '700 8px monospace'; c.fillStyle = sel ? '#ffffff' : '#c6d2e0'; c.fillText(String(a.nombre || '').slice(0, 13), x + 8, y + 80);
    c.font = '7px monospace'; c.fillStyle = '#7f8ea3';
    c.fillText(`${a.trades}op ${a.ganados}ok ${a.quiebras || 0}q${a.metas ? ' ' + a.metas + 'meta' : ''}`, x + 8, y + 89);
    if (a.r_medio != null && a.trades >= 3) { c.textAlign = 'right'; c.fillStyle = a.r_medio > 0 ? '#5dff9b' : '#ff7b7b'; c.fillText(`${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R`, x + TR_CW - 8, y + 89); }
    const b = this.burbujas.get(n.nodo + ':' + a.id);
    if (b && b.hasta > ahora) {
      c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(x + 20, y + 4, 16, 14); c.fillRect(x + 23, y + 18, 3, 3);
      c.font = '10px sans-serif'; c.textAlign = 'center'; c.fillText(b.em, x + 28, y + 15);
    }
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
