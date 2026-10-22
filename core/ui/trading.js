// Mission Control → Trading: la sala del enjambre de DMN Trader en pixel-art. Cada agente es un trader en su mesa;
// una zona por equipo (la Pi central, el PC u otros nodos). Pensado para 300+ agentes: dibujo a ~12 fps y datos cada 5 s.
// Datos: GET /v1/trading/mapa (proxy a la central, core/trading.js). Los personajes son los de mision-mundo-arte.js (mmPJ).

const TR_CW = 48, TR_CH = 66, TR_COLS = 16, TR_M = 16, TR_CAB = 44;
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

  // ---------- dibujo ----------
  dibujar(t) {
    const d = this.datos; if (!d) return;
    const nodos = d.nodos.filter(n => (n.agentes || []).length);
    const W = TR_COLS * TR_CW + TR_M * 2;
    let H = TR_M; for (const n of nodos) H += TR_CAB + Math.ceil(n.agentes.length / TR_COLS) * TR_CH + TR_M;
    H = Math.max(H, 220);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    const c = this.c; c.imageSmoothingEnabled = false;
    // suelo de parqué oscuro con brillo de monitores
    for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) { c.fillStyle = ((x + y) / 16) % 2 ? '#141a22' : '#171e27'; c.fillRect(x, y, 16, 16); }
    this.cajas = [];
    let y0 = TR_M;
    const ahora = performance.now() / 1000;
    for (const n of nodos) {
      const filas = Math.ceil(n.agentes.length / TR_COLS), alto = TR_CAB + filas * TR_CH;
      c.fillStyle = 'rgba(40,60,80,.18)'; c.fillRect(TR_M / 2, y0 - 6, W - TR_M, alto + 6);
      c.strokeStyle = n.local || n.en_linea ? '#2fd1b0' : '#5a3a3a'; c.globalAlpha = .5; c.strokeRect(TR_M / 2 + .5, y0 - 5.5, W - TR_M - 1, alto + 5); c.globalAlpha = 1;
      const k = n.kpis || {};
      mmCartel(c, W / 2, y0, `${String(n.nodo).toUpperCase()} · ${n.agentes.length} TRADERS${k.activo === false ? ' · PARADO' : ''}${!n.local && !n.en_linea ? ' · SIN CONEXIÓN' : ''}`, { borde: n.local || n.en_linea ? '#2fd1b0' : '#c0392b', max: W - 40 });
      n.agentes.forEach((a, i) => {
        const x = TR_M + (i % TR_COLS) * TR_CW, y = y0 + TR_CAB + Math.floor(i / TR_COLS) * TR_CH;
        this.trader(c, a, n, x, y, t, ahora);
        this.cajas.push({ x, y, w: TR_CW, h: TR_CH, a: { ...a, nodo: n.nodo } });
      });
      y0 += alto + TR_M;
    }
  },
  trader(c, a, n, x, y, t, ahora) {
    const quebrado = a.estado === 'quebrado', parado = ['parado', 'retirado'].includes(a.estado) || (n.kpis && n.kpis.activo === false);
    const pos = a.estado === 'en posición', corto = /corto/.test(a.ultimo || ''), sel = this.sel && this.sel.id === a.id && this.sel.nodo === n.nodo;
    const fase = (trHash(a.nombre) % 7) * .3;
    // personaje (detrás de la mesa)
    const L = trLook(a), f = parado ? 0 : Math.floor((t * 2 + fase) % 4);
    const sp = mmPJ(L, 'abajo', f, 'quieto', Math.sin(t * .7 + fase) > .97);
    c.globalAlpha = parado ? .45 : quebrado ? .6 : 1;
    c.drawImage(sp, x + 10, y - 2);
    c.globalAlpha = 1;
    if ((a.metas || 0) > 0) { c.fillStyle = '#ffcf4d'; c.fillRect(x + 17, y + 10, 14, 3); for (const k of [0, 5, 10]) c.fillRect(x + 17 + k, y + 7, 4, 3); }   // corona
    // mesa + monitor
    c.fillStyle = '#3a2c22'; c.fillRect(x + 4, y + 38, 40, 14); c.fillStyle = '#4a3a2c'; c.fillRect(x + 4, y + 38, 40, 3); c.fillStyle = '#21180f'; c.fillRect(x + 6, y + 52, 3, 8); c.fillRect(x + 39, y + 52, 3, 8);
    const sx = x + 12, sy = y + 40, sw = 24, sh = 10;
    c.fillStyle = '#0a0d12'; c.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
    let col = '#0c2340';
    if (quebrado) col = Math.floor(t * 3) % 2 ? '#5a0f0f' : '#2a0606'; else if (pos) col = corto ? '#3a0d12' : '#0d3a1c'; else if (parado) col = '#0b0d10';
    c.fillStyle = col; c.fillRect(sx, sy, sw, sh);
    if (!parado && !quebrado) {
      c.strokeStyle = pos ? (corto ? '#ff6b6b' : '#5dff9b') : '#3f8fff'; c.lineWidth = 1; c.beginPath();
      for (let k = 0; k <= sw; k += 2) { const yy = sy + sh / 2 + Math.sin((k + t * 8 + fase * 10) * .5) * (pos ? 3 : 1.5) * (pos && !corto ? 1 : -1) + (pos ? (corto ? k / sw * 3 : -k / sw * 3) : 0); k ? c.lineTo(sx + k, yy) : c.moveTo(sx + k, yy); }
      c.stroke();
      if (!pos) { c.fillStyle = 'rgba(120,180,255,.35)'; c.fillRect(sx + ((t * 12 + fase * 9) % sw), sy, 1, sh); }
    } else if (quebrado) { c.fillStyle = '#ff5252'; c.font = '700 8px monospace'; c.textAlign = 'center'; c.fillText('X', sx + sw / 2, sy + 8); }
    if (pos) { c.fillStyle = corto ? 'rgba(255,80,80,.10)' : 'rgba(80,255,140,.10)'; c.fillRect(x + 2, y + 30, 44, 26); }
    // nombre corto y resultado
    c.font = '7px monospace'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = sel ? '#ffffff' : '#7f8ea3'; c.fillText(String(a.nombre || '').slice(0, 10), x + TR_CW / 2, y + 63);
    if (a.r_medio != null && a.trades >= 3) { c.fillStyle = a.r_medio > 0 ? '#5dff9b' : '#ff7b7b'; c.fillText((a.r_medio > 0 ? '+' : '') + a.r_medio.toFixed(1) + 'R', x + TR_CW / 2, y + 8); }
    if (sel) { c.strokeStyle = '#ffcf4d'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, TR_CW - 1, TR_CH - 1); }
    const b = this.burbujas.get(n.nodo + ':' + a.id);
    if (b && b.hasta > ahora) {
      const by = y - 4 - Math.min(1, (b.hasta - ahora)) * 2;
      c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(x + 28, by - 10, 16, 14); c.fillRect(x + 31, by + 4, 3, 3);
      c.font = '10px sans-serif'; c.textAlign = 'center'; c.fillText(b.em, x + 36, by + 1);
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
    tip.innerHTML = `<b>${esc(a.nombre)}</b> · ${esc(a.nodo)}<br>${a.estrategia} · ${a.marco} · ${tr('gen')} ${a.generacion}<br>${tr('capital')} ${(a.equity ?? 0).toFixed(4)} $ · ${a.trades} ${tr('trades')}${a.r_medio != null ? ` · ${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R` : ''}<br><span class="sutil">${esc(a.estado)} · ${esc(a.ultimo || '')}</span>`;
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
