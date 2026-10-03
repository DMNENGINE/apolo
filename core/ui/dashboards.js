// Dashboards (#/dashboards, #/dashboards/<id>): tableros que arma el agente (crear_dashboard) o el usuario.
// Gráficos propios en SVG sin librerías (línea, barras, sparkline, medidor, mapa de calor), con tooltips y rejilla 12 columnas
// arrastrable/redimensionable en modo edición. Un dashboard puede fijarse en Inicio. Datos: GET /v1/dashboards/:id/datos (caché por widget).
// Globales con prefijo DB_. Traducciones aquí mismo.

P.tablero = '<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>';
P.mover = '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>';
P.chincheta = '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>';
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'uso'), 0, ['dashboards', 'Dashboards', 'tablero']);

Object.assign(I18N.dic.en, {
  'Dashboards': 'Dashboards', 'Tableros vivos que arma APOLO a partir de una frase: tu uso, el tiempo, tus PRs, comandos… Se actualizan solos.': 'Live boards APOLO builds from a sentence: your usage, the weather, your PRs, commands… They refresh themselves.',
  'Nuevo dashboard': 'New dashboard', 'Pídeselo a APOLO': 'Ask APOLO', 'Vacío': 'Empty', 'Describe el panel que quieres': 'Describe the board you want',
  'Hazme un panel con mi uso de modelos, el tiempo en Madrid y mis PRs abiertas': 'Make me a board with my model usage, the weather in Madrid and my open PRs',
  'Panel de salud del equipo: CPU, RAM y mi actividad de la semana': 'Machine health board: CPU, RAM and my activity this week',
  'Resumen de mi día con mis automatizaciones y conversaciones recientes': 'Summary of my day with my automations and recent conversations',
  'Aún no hay dashboards. Pídele uno a APOLO con una frase:': 'No dashboards yet. Ask APOLO for one in a sentence:',
  'Editar': 'Edit', 'Listo': 'Done', 'Guardar': 'Save', 'Cancelar': 'Cancel', 'Actualizar': 'Refresh', 'Fijar en Inicio': 'Pin to Home', 'Fijado en Inicio': 'Pinned to Home', 'Quitar de Inicio': 'Unpin from Home',
  'Borrar dashboard': 'Delete dashboard', '¿Borrar este dashboard?': 'Delete this dashboard?', 'Se borra el tablero y su caché. Los datos de origen no se tocan.': 'The board and its cache are deleted. Source data is untouched.',
  'Añadir widget': 'Add widget', 'Editar widget': 'Edit widget', 'Quitar': 'Remove', 'Título': 'Title', 'Tipo': 'Type', 'Fuente': 'Source', 'Métrica': 'Metric', 'Refresco (s)': 'Refresh (s)',
  'Opciones (JSON)': 'Options (JSON)', 'URL (GET, JSON)': 'URL (GET, JSON)', 'Comando (solo lectura)': 'Command (read-only)', 'Herramienta': 'Tool', 'Instrucción para el modelo': 'Instruction for the model',
  'Confirmo que este comando se ejecute en mi PC cada vez que se refresque': 'I confirm this command runs on my PC on every refresh',
  'Confirmo que el panel lea esta dirección de mi red local': 'I confirm the board may read this local network address',
  'Arrastra los widgets por la cabecera y redimensiónalos por la esquina.': 'Drag widgets by their header and resize them from the corner.',
  'kpi': 'KPI', 'linea': 'line', 'barras': 'bars', 'tabla': 'table', 'lista': 'list', 'texto': 'text', 'progreso': 'gauge', 'mapa-calor': 'heatmap',
  'nucleo': 'APOLO', 'http': 'web (JSON)', 'comando': 'command', 'herramienta': 'connector', 'agente': 'AI summary',
  'actualizado {t}': 'updated {t}', 'Sin datos': 'No data', 'Necesita tu permiso': 'Needs your permission', 'datos antiguos': 'stale data', '{n} widgets': '{n} widgets', '1 widget': '1 widget',
  'entrada': 'input', 'salida': 'output', 'valor': 'value', 'Abrir': 'Open', 'Nada por ahora': 'Nothing for now', 'Cambios guardados': 'Changes saved', 'JSON no válido en opciones': 'Invalid JSON in options', 'Creado por APOLO': 'Created by APOLO', 'Creado por ti': 'Created by you',
  'vs. anterior': 'vs. previous', 'alto': 'high', 'muy alto': 'very high', 'Lu': 'Mo', 'Ma': 'Tu', 'Mi': 'We', 'Ju': 'Th', 'Vi': 'Fr', 'Sá': 'Sa', 'Do': 'Su',
  'Nombre del dashboard': 'Dashboard name', 'Crear': 'Create', 'Enviar a APOLO': 'Send to APOLO',
});

const DB_FUENTE_IC = { nucleo: 'robot', http: 'mundo', comando: 'terminal', herramienta: 'pieza', agente: 'chispa' };
const DB_TIPOS = ['kpi', 'linea', 'barras', 'tabla', 'lista', 'texto', 'progreso', 'mapa-calor'];
const DB_ROW = 64, DB_GAP = 12;
const DB_serie = i => `var(--s${(i % 8) + 1})`;
function DB_num(v, unidad, corto = true) {
  if (!Number.isFinite(v)) return '—';
  const L = I18N.locale(), a = Math.abs(v);
  const s = corto && a >= 1e4 ? fmtK(v) : v.toLocaleString(L, { maximumFractionDigits: a < 10 && !Number.isInteger(v) ? 1 : 0 });
  return !unidad ? s : /^[%°]/.test(unidad) ? s + unidad : `${s} ${unidad}`;
}
const DB_esFecha = x => /^\d{4}-\d{2}-\d{2}/.test(String(x));
const DB_x = x => (DB_esFecha(x) ? new Date(String(x).slice(0, 10) + 'T12:00').toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' }) : String(x));
// tooltip único
function DB_tip(html, e) {
  let t = $('#dbTip'); if (!t) { t = document.createElement('div'); t.id = 'dbTip'; t.className = 'db-tip'; document.body.append(t); }
  if (!html) { t.hidden = true; return; }
  t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w / 2)) + 'px';
  t.style.top = (e.clientY - h - 14 < 8 ? e.clientY + 18 : e.clientY - h - 14) + 'px';
}
const DB_tipFila = (color, nombre, valor) => `<div class="db-tip-f">${color ? `<i style="background:${color}"></i>` : ''}<span>${esc(nombre)}</span><b>${valor}</b></div>`;
function DB_escala(max) { if (max <= 0) return [1, [0, 0.5, 1]]; const p = 10 ** Math.floor(Math.log10(max)), m = max / p, paso = (m <= 1 ? 0.25 : m <= 2 ? 0.5 : m <= 5 ? 1 : 2) * p, tope = Math.ceil(max / paso) * paso; const t = []; for (let v = 0; v <= tope + 1e-9; v += paso) t.push(v); return [tope, t.length > 5 ? t.filter((_, i) => i % 2 === 0) : t]; }

// ---------- gráficos ----------
// tamaño útil (sin el padding del contenedor)
function DB_tam(el) { const c = getComputedStyle(el); return [el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight), el.clientHeight - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)]; }
function DB_sparkline(valores, w, h, color = 'var(--acento)') {
  if (!valores?.length || valores.length < 2) return '';
  const max = Math.max(...valores), min = Math.min(0, ...valores), r = max - min || 1;
  const pt = valores.map((v, i) => [i / (valores.length - 1) * (w - 2) + 1, h - 2 - (v - min) / r * (h - 4)]);
  const d = pt.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg class="db-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}L${w - 1},${h}L1,${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${pt.at(-1)[0]}" cy="${pt.at(-1)[1]}" r="2.6" fill="${color}"/></svg>`;
}
function DB_ejes(W, H, m, tope, ticks, x, unidad) {
  const y = v => m.t + (H - m.t - m.b) * (1 - v / tope);
  const n = x.length, cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 64))));
  const xs = i => m.l + (n === 1 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (n - 1));
  return { y, xs, svg: ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="db-grid"/><text x="${m.l - 6}" y="${y(t) + 3.5}" class="db-eje" text-anchor="end">${DB_num(t, '', true)}</text>`).join('') +
    x.map((v, i) => (i % cada === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < cada) ? `<text x="${xs(i)}" y="${H - 4}" class="db-eje" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(DB_x(v))}</text>` : '').join('') };
}
function DB_linea(el, d, o) {
  const S = d.series.filter(s => s.valores?.length), x = d.x || [], uno = S.length === 1;
  const [W, H0] = DB_tam(el), H = H0 - (uno ? 0 : 22); if (W < 40 || H < 40) return;
  const max = Math.max(0, ...S.flatMap(s => s.valores.filter(Number.isFinite))), [tope, ticks] = DB_escala(max);
  const m = { l: Math.max(28, String(DB_num(tope)).length * 7 + 10), r: 10, t: 8, b: 20 };
  const e = DB_ejes(W, H, m, tope, ticks, x, o.unidad || d.unidad);
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  const lineas = S.map((s, k) => {
    const c = uno ? 'var(--acento)' : DB_serie(k);
    const p = s.valores.map((v, i) => `${i ? 'L' : 'M'}${e.xs(i).toFixed(1)},${e.y(v || 0).toFixed(1)}`).join('');
    return (uno ? `<path d="${p}L${e.xs(s.valores.length - 1)},${e.y(0)}L${e.xs(0)},${e.y(0)}Z" fill="url(#${gid})"/>` : '') + `<path d="${p}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const leyenda = uno ? '' : `<div class="db-ley">${S.map((s, k) => `<span><i style="background:${DB_serie(k)}"></i>${esc(tr(s.nombre || ''))}</span>`).join('')}</div>`;
  el.innerHTML = `${leyenda}<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="db-svg"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--acento)" stop-opacity=".28"/><stop offset="1" stop-color="var(--acento)" stop-opacity="0"/></linearGradient></defs>
    ${e.svg}${lineas}<line class="db-cruz" y1="${m.t}" y2="${H - m.b}" x1="-9" x2="-9"/>${S.map((s, k) => `<circle class="db-punto" r="4" cx="-9" cy="-9" fill="${uno ? 'var(--acento)' : DB_serie(k)}"/>`).join('')}
    <rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent" class="db-hit"/></svg>`;
  const svg = $('svg', el), cruz = $('.db-cruz', svg), puntos = $$('.db-punto', svg), n = x.length;
  $('.db-hit', svg).onpointermove = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
    svg.classList.add('hover');
    const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / ((W - m.l - m.r) / Math.max(1, n - 1)))));
    cruz.setAttribute('x1', e.xs(i)); cruz.setAttribute('x2', e.xs(i));
    puntos.forEach((p, k) => { p.setAttribute('cx', e.xs(i)); p.setAttribute('cy', e.y(S[k].valores[i] || 0)); });
    DB_tip(`<div class="db-tip-x">${esc(DB_x(x[i]))}</div>${S.map((s, k) => DB_tipFila(uno ? 'var(--acento)' : DB_serie(k), tr(s.nombre || o.serie || '') || tr('valor'), DB_num(s.valores[i], o.unidad || d.unidad, false))).join('')}`, ev);
  };
  $('.db-hit', svg).onpointerleave = () => { DB_tip(''); svg.classList.remove('hover'); cruz.setAttribute('x1', -9); cruz.setAttribute('x2', -9); puntos.forEach(p => p.setAttribute('cx', -9)); };
}
function DB_columnas(el, d, o) {
  const S = d.series, x = d.x, n = x.length, apilar = S.length > 1;
  const [W, H0] = DB_tam(el), H = H0 - (apilar ? 22 : 0); if (W < 40 || H < 40) return;
  const tot = x.map((_, i) => S.reduce((a, s) => a + Math.max(0, s.valores[i] || 0), 0));
  const [tope, ticks] = DB_escala(Math.max(0, ...tot));
  const m = { l: Math.max(28, String(DB_num(tope)).length * 7 + 10), r: 4, t: 8, b: 20 };
  const e = DB_ejes(W, H, m, tope, ticks, x);
  const ancho = (W - m.l - m.r) / n, bw = Math.max(2, Math.min(42, ancho - 2));
  let barras = '';
  x.forEach((_, i) => {
    let base = 0; const cx = m.l + ancho * i + (ancho - bw) / 2;
    S.forEach((s, k) => {
      const v = Math.max(0, s.valores[i] || 0); if (!v) return;
      const y0 = e.y(base), y1 = e.y(base + v), alto = Math.max(1, y0 - y1 - (apilar && base ? 2 : 0)), top = k === S.length - 1 || !apilar, rad = top ? Math.min(4, bw / 2, alto) : 0;
      barras += `<path d="M${cx},${y1 + alto}V${y1 + rad}Q${cx},${y1} ${cx + rad},${y1}H${cx + bw - rad}Q${cx + bw},${y1} ${cx + bw},${y1 + rad}V${y1 + alto}Z" fill="${apilar ? DB_serie(k) : 'var(--acento)'}" data-i="${i}" class="db-bar"/>`;
      base += v;
    });
  });
  const leyenda = apilar ? `<div class="db-ley">${S.map((s, k) => `<span><i style="background:${DB_serie(k)}"></i>${esc(tr(s.nombre || ''))}</span>`).join('')}</div>` : '';
  el.innerHTML = `${leyenda}<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="db-svg">${e.svg}${barras}${x.map((_, i) => `<rect x="${m.l + ancho * i}" y="0" width="${ancho}" height="${H - m.b}" fill="transparent" data-i="${i}" class="db-hitc"/>`).join('')}</svg>`;
  $$('.db-hitc', el).forEach(r => {
    r.onpointermove = ev => { const i = +r.dataset.i; $$('.db-bar', el).forEach(b => b.classList.toggle('apagada', b.dataset.i !== String(i)));
      DB_tip(`<div class="db-tip-x">${esc(DB_x(x[i]))}</div>${S.map((s, k) => DB_tipFila(apilar ? DB_serie(k) : 'var(--acento)', tr(s.nombre || '') || tr('valor'), DB_num(s.valores[i], o.unidad || d.unidad, false))).join('')}`, ev); };
    r.onpointerleave = () => { DB_tip(''); $$('.db-bar', el).forEach(b => b.classList.remove('apagada')); };
  });
}
function DB_categorias(el, d, o) {
  const items = d.items.slice(0, +o.limite || 12), max = Math.max(1, ...items.map(i => i.valor || 0));
  el.innerHTML = `<div class="db-hb">${items.map(i => `<div class="db-hb-f" title="${esc(i.etiqueta)}: ${esc(DB_num(i.valor, o.unidad || d.unidad, false))}"><div class="db-hb-t"><span>${esc(tr(String(i.etiqueta)))}</span><b>${DB_num(i.valor, o.unidad || d.unidad)}</b></div><div class="db-hb-b"><i style="width:${Math.max(1.5, (i.valor || 0) / max * 100)}%"></i></div></div>`).join('') || `<div class="tenue">${tr('Sin datos')}</div>`}</div>`;
}
function DB_kpi(el, d, o) {
  const u = o.unidad ?? d.unidad, delta = Number.isFinite(d.anterior) && d.anterior !== 0 ? (d.valor - d.anterior) / Math.abs(d.anterior) : null;
  const [W, H] = DB_tam(el), espacioSpark = H > 70 && d.serie?.length > 1;
  el.innerHTML = `<div class="db-kpi"><div class="db-kpi-v">${Number.isFinite(d.valor) ? `${esc(DB_num(d.valor, '', true))}${u ? `<small>${esc(u)}</small>` : ''}` : esc(d.texto || '—')}</div>
    <div class="db-kpi-s">${delta !== null ? `<span class="db-delta ${delta >= 0 ? 'sube' : 'baja'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(Math.abs(delta) < .1 ? 1 : 0)}%</span> <span class="tenue">${tr('vs. anterior')}</span>` : d.detalle ? `<span class="tenue">${esc(d.detalle)}</span>` : ''}</div>
    ${espacioSpark ? DB_sparkline(d.serie, Math.max(60, W), Math.min(46, H - 54)) : ''}</div>`;
}
function DB_progreso(el, d, o) {
  const max = +o.max || d.max || 100, p = Math.max(0, Math.min(1, (d.valor || 0) / max)), u = o.unidad ?? d.unidad ?? '';
  const nivel = p >= .9 ? 'mal' : p >= .75 ? 'aviso' : '', c = nivel ? `var(--${nivel})` : 'var(--acento)';
  const [W, H] = DB_tam(el), R = Math.max(26, Math.min(W / 2 - 10, H - 30)), cx = W / 2, cy = R + 8, L = Math.PI * R;
  el.innerHTML = `<div class="db-gauge"><svg width="${W}" height="${cy + 6}" aria-hidden="true"><path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}" class="db-gauge-f" stroke-width="${Math.max(7, R / 6)}"/>
    <path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}" fill="none" stroke="${c}" stroke-width="${Math.max(7, R / 6)}" stroke-linecap="round" stroke-dasharray="${L * p} ${L}"/></svg>
    <div class="db-gauge-v" style="top:${cy - Math.min(R * .55, 34)}px">${esc(DB_num(d.valor, u === '%' ? '%' : '', false))}${u && u !== '%' ? `<small>${esc(u)}</small>` : ''}${nivel ? `<span class="chip ${nivel}">${ic('info')}${tr(nivel === 'mal' ? 'muy alto' : 'alto')}</span>` : ''}</div></div>`;
}
function DB_calor(el, d, o) {
  if (d.forma === 'matriz') {
    const vals = d.valores.flat(), max = Math.max(1, ...vals);
    const nivel = v => (!v ? 0 : Math.min(4, Math.ceil(v / max * 4)));
    const dias = d.filas.length === 7 && d.filas[0] === 'L' ? ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(x => tr(x)) : d.filas;
    el.innerHTML = `<div class="db-matriz" style="grid-template-columns:auto repeat(${d.columnas.length},minmax(6px,1fr))">${d.valores.map((f, i) => `<span class="db-m-l">${esc(dias[i])}</span>${f.map((v, j) => `<i data-n="${nivel(v)}" data-t="${esc(dias[i])} · ${esc(d.columnas[j])}:00 — ${v}"></i>`).join('')}`).join('')}
      <span></span>${d.columnas.map((c, j) => `<span class="db-m-c">${j % 6 === 0 ? esc(c) : ''}</span>`).join('')}</div>`;
  } else {
    const L = d.dias.slice(-371), primero = new Date(String(L[0]?.[0]).slice(0, 10) + 'T12:00'), hueco = ((primero.getDay() + 6) % 7) || 0;
    const v = L.map(x => x[1]).filter(x => x > 0).sort((a, b) => a - b), q = p => v[Math.floor(p * (v.length - 1))] || 0;
    const nivel = n => (!n ? 0 : n <= q(.25) ? 1 : n <= q(.5) ? 2 : n <= q(.8) ? 3 : 4);
    el.innerHTML = `<div class="db-cal">${'<i class="vacia"></i>'.repeat(hueco)}${L.map(([k, n]) => `<i data-n="${nivel(n)}" data-t="${esc(DB_x(k))} — ${esc(DB_num(n, o.unidad || d.unidad, false))}"></i>`).join('')}</div>`;
  }
  el.onpointermove = ev => { const c = ev.target.closest('i[data-t]'); DB_tip(c ? esc(c.dataset.t) : '', ev); };
  el.onpointerleave = () => DB_tip('');
}
function DB_pintarDatos(el, w, r) {
  const o = w.opciones || {}, d = r?.datos;
  if (!r) { el.innerHTML = '<div class="db-esqueleto"></div>'; return; }
  if (!d) { el.innerHTML = `<div class="db-error">${ic(r.permiso ? 'candado' : 'info')}<span>${esc(r.permiso ? tr('Necesita tu permiso') : r.error || tr('Sin datos'))}</span></div>`; return; }
  try {
    if (w.tipo === 'kpi' && d.forma === 'numero') return DB_kpi(el, d, o);
    if (w.tipo === 'progreso' && d.forma === 'progreso') return DB_progreso(el, d, o);
    if (w.tipo === 'linea' && d.forma === 'serie') return DB_linea(el, d, o);
    if (w.tipo === 'barras' && d.forma === 'serie') return DB_columnas(el, d, o);
    if ((w.tipo === 'barras' || d.forma === 'categorias') && d.forma === 'categorias') return DB_categorias(el, d, o);
    if (w.tipo === 'mapa-calor' && (d.forma === 'matriz' || d.forma === 'calendario')) return DB_calor(el, d, o);
    if (d.forma === 'lista') {
      el.innerHTML = d.items.length ? `<div class="db-lista">${d.items.map(i => { const ext = /^https?:/.test(i.url || ''); const t = `<span class="t">${esc(i.texto)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>${i.valor != null ? `<b>${esc(DB_num(+i.valor) !== '—' ? DB_num(+i.valor) : i.valor)}</b>` : i.t ? `<span class="tenue">${hace(i.t)}</span>` : ''}`;
        return i.url && (ext || i.url.startsWith('#/')) ? `<a href="${esc(i.url)}" ${ext ? 'target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>` : `<div>${t}</div>`; }).join('')}</div>` : `<div class="db-error">${ic('check')}${tr('Nada por ahora')}</div>`;
      return;
    }
    if (d.forma === 'tabla') { el.innerHTML = `<div class="db-tabla"><table class="tabla"><tr>${d.columnas.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${d.filas.map(f => `<tr>${f.map(c => `<td>${typeof c === 'number' ? DB_num(c, '', false) : esc(String(c))}</td>`).join('')}</tr>`).join('')}</table></div>`; return; }
    if (d.forma === 'texto') { el.innerHTML = `<div class="db-texto">${md(d.texto)}</div>`; return; }
    if (d.forma === 'numero') return DB_kpi(el, d, o);
    el.innerHTML = `<pre class="db-texto mono">${esc(JSON.stringify(d, null, 1).slice(0, 2000))}</pre>`;
  } catch (e) { el.innerHTML = `<div class="db-error">${esc(e.message)}</div>`; }
}

// ---------- rejilla: colisiones y compactado (estilo gridstack) ----------
const DB_choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function DB_ordenar(ws, fijo) {
  const otros = ws.filter(w => w !== fijo).sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x), puestos = fijo ? [fijo] : [];
  for (const w of otros) {
    w.pos.y = 0;
    while (puestos.some(p => DB_choca(w.pos, p.pos))) w.pos.y++;
    puestos.push(w);
  }
}

// ---------- tablero montado en un contenedor (página o Inicio) ----------
function DB_montar(cont, dash, { compacto = false } = {}) {
  const t = { dash, datos: {}, editando: false, timer: null, ro: null };
  const dibujarWidget = w => {
    const r = t.datos[w.id], tf = (w.fuente.match(/^(\w+):/) || [])[1];
    return `<section class="db-w db-t-${w.tipo}${t.solos?.has(w.id) ? ' solo' : ''}" data-id="${esc(w.id)}" style="grid-column:${w.pos.x + 1} / span ${w.pos.w};grid-row:${w.pos.y + 1} / span ${w.pos.h}">
      <header><span class="db-w-t" title="${esc(w.titulo)}">${esc(w.titulo)}</span>
        ${r?.viejo ? `<span class="punto aviso" title="${tr('datos antiguos')}: ${esc(r.error || '')}"></span>` : ''}
        <span class="db-w-f" title="${esc(tr(tf))} · ${esc(w.fuente.slice(0, 160))}${r?.t ? ' · ' + tr('actualizado {t}', { t: hace(r.t) }) : ''}">${ic(DB_FUENTE_IC[tf] || 'info')}</span>
        <span class="db-w-ed"><button class="btn icono fantasma mini" data-ed="${esc(w.id)}" title="${tr('Editar widget')}">${ic('editar')}</button><button class="btn icono fantasma mini" data-qt="${esc(w.id)}" title="${tr('Quitar')}">${ic('x')}</button></span></header>
      <div class="db-w-c"></div><i class="db-rs" title="↘"></i></section>`;
  };
  function pintar() {
    const ws = [...t.dash.widgets].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    const filas = Math.max(1, ...ws.map(w => w.pos.y + w.pos.h));
    // en el móvil los pequeños van de dos en dos: el impar de cada tanda ocupa el ancho entero
    let tanda = 0; t.solos = new Set();
    ws.forEach((w, i) => { const peq = w.tipo === 'kpi' || w.tipo === 'progreso'; tanda = peq ? tanda + 1 : 0; const sig = ws[i + 1]; if (peq && tanda % 2 === 1 && !(sig && (sig.tipo === 'kpi' || sig.tipo === 'progreso'))) t.solos.add(w.id); });
    cont.innerHTML = `<div class="db-rej ${t.editando ? 'editando' : ''} ${compacto ? 'compacto' : ''}" style="--filas:${filas}">${ws.map(dibujarWidget).join('')}</div>`;
    pintarDatos();
    enlazar();
  }
  function pintarDatos(ids) {
    for (const w of t.dash.widgets) {
      if (ids && !ids.includes(w.id)) continue;
      const el = $(`.db-w[data-id="${CSS.escape(w.id)}"] .db-w-c`, cont); if (el) DB_pintarDatos(el, w, t.datos[w.id]);
    }
  }
  // una petición por widget, en paralelo: cada uno se pinta en cuanto llega (una web lenta no congela el resto)
  async function cargar(forzar = false) {
    await Promise.all(t.dash.widgets.filter(w => w.id).map(async w => {
      try {
        const r = await api('GET', `/dashboards/${encodeURIComponent(t.dash.id)}/datos?widget=${encodeURIComponent(w.id)}${forzar ? '&forzar=1' : ''}`), x = r.widgets[w.id];
        if (!x || t.muerto || (x.t === t.datos[w.id]?.t && x.error === t.datos[w.id]?.error)) return;
        t.datos[w.id] = x;
        if (t.arrastrando) return;
        const s = $(`.db-w[data-id="${CSS.escape(w.id)}"]`, cont); if (s) s.outerHTML = dibujarWidget(w);
        pintarDatos([w.id]);
      } catch (e) { if (!t.muerto) console.warn(e); }
    }));
  }
  function enlazar() {
    const rej = $('.db-rej', cont); if (!rej) return;
    rej.onclick = async e => {
      const ed = e.target.closest('[data-ed]'), qt = e.target.closest('[data-qt]');
      if (ed) { const w = t.dash.widgets.find(x => x.id === ed.dataset.ed); const n = await DB_formWidget(w); if (n) { Object.assign(w, n); t.sucio = true; pintar(); } }
      if (qt) { t.dash.widgets = t.dash.widgets.filter(x => x.id !== qt.dataset.qt); DB_ordenar(t.dash.widgets.map(x => x)); t.sucio = true; pintar(); }
    };
    rej.onpointerdown = e => {
      if (!t.editando || e.button !== 0) return;
      const rs = e.target.closest('.db-rs'), hd = e.target.closest('.db-w > header');
      if ((!rs && !hd) || e.target.closest('button')) return;
      const s = e.target.closest('.db-w'), w = t.dash.widgets.find(x => x.id === s.dataset.id);
      const R = rej.getBoundingClientRect(), colW = (R.width - DB_GAP * 11) / 12 + DB_GAP, filaH = DB_ROW + DB_GAP;
      const ini = { ...w.pos }, x0 = e.clientX, y0 = e.clientY;
      s.setPointerCapture(e.pointerId); s.classList.add('arrastrando'); t.arrastrando = true; e.preventDefault();
      const mover = ev => {
        const dx = Math.round((ev.clientX - x0) / colW), dy = Math.round((ev.clientY - y0) / filaH);
        if (rs) { w.pos.w = Math.max(2, Math.min(12 - w.pos.x, ini.w + dx)); w.pos.h = Math.max(1, Math.min(10, ini.h + dy)); }
        else { w.pos.x = Math.max(0, Math.min(12 - w.pos.w, ini.x + dx)); w.pos.y = Math.max(0, ini.y + dy); }
        s.style.transform = rs ? '' : `translate(${ev.clientX - x0}px, ${ev.clientY - y0}px)`;
        if (rs) { s.style.gridColumn = `${w.pos.x + 1} / span ${w.pos.w}`; s.style.gridRow = `${w.pos.y + 1} / span ${w.pos.h}`; }
        DB_ordenar(t.dash.widgets, w);
        for (const o of t.dash.widgets) { if (o === w) continue; const el = $(`.db-w[data-id="${CSS.escape(o.id)}"]`, rej); if (el) el.style.gridRow = `${o.pos.y + 1} / span ${o.pos.h}`; }
        let fant = $('.db-fantasma', rej); if (!fant) { fant = document.createElement('div'); fant.className = 'db-fantasma'; rej.append(fant); }
        fant.style.gridColumn = `${w.pos.x + 1} / span ${w.pos.w}`; fant.style.gridRow = `${w.pos.y + 1} / span ${w.pos.h}`;
      };
      const soltar = () => { s.removeEventListener('pointermove', mover); t.arrastrando = false; DB_ordenar(t.dash.widgets); t.sucio = true; pintar(); };
      s.addEventListener('pointermove', mover); s.addEventListener('pointerup', soltar, { once: true }); s.addEventListener('pointercancel', soltar, { once: true });
    };
  }
  let rT = null;
  t.ro = new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(() => { if (!t.arrastrando) pintarDatos(); }, 120); });
  t.ro.observe(cont);
  pintar(); cargar();
  t.timer = setInterval(() => { if (!document.hidden && !t.editando) cargar(); }, 15000);
  return Object.assign(t, {
    pintar, cargar,
    editar(on) { t.editando = on; pintar(); },
    async guardar() { const d = await api('PATCH', `/dashboards/${encodeURIComponent(t.dash.id)}`, { widgets: t.dash.widgets, confirmo: !!t.confirmo }); t.dash = d; t.sucio = false; t.confirmo = false; pintar(); cargar(); return d; },
    destruir() { t.muerto = true; clearInterval(t.timer); t.ro?.disconnect(); DB_tip(''); },
  });
}

// ---------- formulario de widget ----------
let DB_metricas = {};
async function DB_formWidget(w) {
  const nuevo = !w; w = w || { tipo: 'kpi', titulo: '', fuente: 'nucleo:uso.tokens', refrescoSeg: 60, opciones: {} };
  const tf = (w.fuente.match(/^(\w+):/) || [])[1] || 'nucleo', val = w.fuente.replace(/^\w+:/, '');
  const optsM = Object.entries(DB_metricas).map(([k, d]) => `<option value="${esc(k)}" ${tf === 'nucleo' && val === k ? 'selected' : ''}>${esc(k)} — ${esc(tr(d))}</option>`).join('');
  return modal({ titulo: nuevo ? 'Añadir widget' : 'Editar widget', ancho: 600,
    cuerpo: `<div class="db-form"><div class="campo">${tr('Título')}<input id="dbT" value="${esc(w.titulo)}"></div>
      <div class="campo">${tr('Tipo')}<select id="dbTipo">${DB_TIPOS.map(x => `<option value="${x}" ${x === w.tipo ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select></div>
      <div class="campo">${tr('Fuente')}<select id="dbF">${['nucleo', 'http', 'herramienta', 'agente', 'comando'].map(x => `<option value="${x}" ${x === tf ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select></div>
      <div class="campo">${tr('Refresco (s)')}<input id="dbR" type="number" min="15" value="${esc(w.refrescoSeg)}"></div>
      <div class="campo ancho" id="dbVal"></div>
      <label class="ancho flex db-conf" id="dbConf" hidden><input type="checkbox" id="dbC"> <span></span></label>
      <div class="campo ancho">${tr('Opciones (JSON)')}<textarea id="dbO" rows="3" class="mono" placeholder='{"ruta": "$.current.temperature_2m", "unidad": "°C"}'>${esc(Object.keys(w.opciones || {}).length ? JSON.stringify(w.opciones) : '')}</textarea></div></div>`,
    alAbrir: v => {
      const pinta = () => {
        const f = $('#dbF', v).value, actual = f === tf ? val : '';
        $('#dbVal', v).innerHTML = f === 'nucleo' ? `${tr('Métrica')}<select id="dbV">${optsM}</select>` :
          f === 'agente' ? `${tr('Instrucción para el modelo')}<textarea id="dbV" rows="2">${esc(actual)}</textarea>` :
            `${tr(f === 'http' ? 'URL (GET, JSON)' : f === 'comando' ? 'Comando (solo lectura)' : 'Herramienta')}<input id="dbV" class="${f === 'comando' ? 'mono' : ''}" value="${esc(actual)}" placeholder="${f === 'http' ? 'https://api.open-meteo.com/v1/forecast?latitude=40.42&longitude=-3.70&current=temperature_2m' : f === 'herramienta' ? 'clima' : 'Get-Date -Format HH:mm'}">`;
        const conf = $('#dbConf', v), privada = f === 'http' && /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(actual);
        conf.hidden = !(f === 'comando' || privada); $('span', conf).textContent = tr(f === 'comando' ? 'Confirmo que este comando se ejecute en mi PC cada vez que se refresque' : 'Confirmo que el panel lea esta dirección de mi red local');
      };
      $('#dbF', v).onchange = pinta; v.addEventListener('input', e => { if (e.target.id === 'dbV' && $('#dbF', v).value === 'http') { const c = $('#dbConf', v); c.hidden = !/^https?:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(e.target.value); $('span', c).textContent = tr('Confirmo que el panel lea esta dirección de mi red local'); } });
      pinta();
    },
    botones: [{ txt: 'Cancelar', valor: null }, { txt: nuevo ? 'Añadir widget' : 'Guardar', cls: 'pri', valor: v => {
      let opciones = {}; const ot = $('#dbO', v).value.trim();
      if (ot) { try { opciones = JSON.parse(ot); } catch { aviso('JSON no válido en opciones', true); return false; } }
      const f = $('#dbF', v).value, valor = $('#dbV', v).value.trim(); if (!valor) return false;
      const c = !$('#dbConf', v).hidden;
      if (c && !$('#dbC', v).checked) { $('#dbConf', v).classList.add('falta'); return false; }
      return { tipo: $('#dbTipo', v).value, titulo: $('#dbT', v).value.trim() || tr($('#dbTipo', v).value), fuente: `${f}:${valor}`, refrescoSeg: +$('#dbR', v).value || 60, opciones, _confirmo: c };
    } }] });
}

// pedirle el dashboard a APOLO: abre el chat y envía la frase
async function DB_pedir(texto) {
  if (!texto) return;
  location.hash = '#/chat';
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 100)); if (E.vista === VISTAS.chat && $('#entrada')) break; }
  VISTAS.chat.enviar?.(texto);
}
const DB_SUGERENCIAS = ['Hazme un panel con mi uso de modelos, el tiempo en Madrid y mis PRs abiertas', 'Panel de salud del equipo: CPU, RAM y mi actividad de la semana', 'Resumen de mi día con mis automatizaciones y conversaciones recientes'];

function DB_miniatura(d) {
  const filas = Math.max(4, ...d.widgets.map(w => w.pos.y + w.pos.h));
  return `<div class="db-mini" style="grid-template-rows:repeat(${filas},1fr)">${d.widgets.map(w => `<i class="db-mini-${w.tipo}" style="grid-column:${w.pos.x + 1} / span ${w.pos.w};grid-row:${w.pos.y + 1} / span ${w.pos.h}"></i>`).join('')}</div>`;
}

VISTAS.dashboards = {
  async pintar(v, sub) {
    this.salir();
    const L = await api('GET', '/dashboards'); DB_metricas = L.metricas || {};
    if (sub) return this.detalle(v, L.dashboards.find(d => d.id === sub) || await api('GET', `/dashboards/${encodeURIComponent(sub)}`));
    const sug = DB_SUGERENCIAS.map(s => `<button class="chip-btn" data-sug="${esc(s)}">${ic('chispa')}<span>${esc(tr(s))}</span></button>`).join('');
    v.innerHTML = `<div class="pagina ancha">${cabecera('Dashboards', 'Tableros vivos que arma APOLO a partir de una frase: tu uso, el tiempo, tus PRs, comandos… Se actualizan solos.', `<button class="btn pri" id="dbNuevo">${ic('mas')}${tr('Nuevo dashboard')}</button>`)}
      ${L.dashboards.length ? `<div class="db-cartas">${L.dashboards.map(d => `<a class="db-carta" href="#/dashboards/${esc(d.id)}">${DB_miniatura(d)}<div class="db-carta-t"><b>${esc(d.titulo)}</b>${d.fijado ? `<span class="chip acento">${ic('chincheta')}${tr('Inicio')}</span>` : ''}</div>
        <small class="tenue">${tr(d.widgets.length === 1 ? '1 widget' : '{n} widgets', { n: d.widgets.length })} · ${tr(d.creador === 'agente' ? 'Creado por APOLO' : 'Creado por ti')} · ${hace(d.actualizado)}</small></a>`).join('')}</div>
        <div class="seccion">${tr('Pídeselo a APOLO')}</div><div class="flex">${sug}</div>`
        : `<div class="caja db-vacio">${ic('tablero')}<p>${tr('Aún no hay dashboards. Pídele uno a APOLO con una frase:')}</p><div class="flex" style="justify-content:center">${sug}</div></div>`}</div>`;
    v.onclick = e => { const s = e.target.closest('[data-sug]'); if (s) DB_pedir(tr(s.dataset.sug)); };
    $('#dbNuevo', v).onclick = () => this.nuevo();
  },
  async nuevo() {
    const r = await modal({ titulo: 'Nuevo dashboard', ancho: 560,
      cuerpo: `<div class="campo">${tr('Describe el panel que quieres')}<textarea id="dbP" rows="3" placeholder="${esc(tr(DB_SUGERENCIAS[0]))}"></textarea></div><div class="campo">${tr('Nombre del dashboard')} (${tr('Vacío')})<input id="dbN"></div>`,
      botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Vacío', valor: v => ({ vacio: $('#dbN', v).value.trim() || tr('Nuevo dashboard') }) }, { txt: 'Enviar a APOLO', cls: 'pri', valor: v => ({ pedir: $('#dbP', v).value.trim() || tr(DB_SUGERENCIAS[0]) }) }] });
    if (r?.pedir) return DB_pedir(r.pedir);
    if (r?.vacio) { const d = await api('POST', '/dashboards', { titulo: r.vacio, widgets: [] }); location.hash = `#/dashboards/${d.id}`; }
  },
  detalle(v, d) {
    v.innerHTML = `<div class="pagina ancha"><div class="cab-pag db-cab"><div><a href="#/dashboards" class="tenue db-volver">${ic('izq')}${tr('Dashboards')}</a><h1>${esc(d.titulo)}</h1>${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ''}</div>
      <div class="flex" id="dbAcc"></div></div><p class="seccion-ayuda db-ayuda-ed" hidden>${tr('Arrastra los widgets por la cabecera y redimensiónalos por la esquina.')}</p><div id="dbCont"></div></div>`;
    const t = this.t = DB_montar($('#dbCont', v), d);
    const acciones = () => {
      $('#dbAcc', v).innerHTML = t.editando
        ? `<button class="btn" id="dbAdd">${ic('mas')}${tr('Añadir widget')}</button><button class="btn fantasma" id="dbCan">${tr('Cancelar')}</button><button class="btn pri" id="dbOk">${ic('check')}${tr('Guardar')}</button>`
        : `<button class="btn fantasma icono" id="dbRef" title="${tr('Actualizar')}">${ic('recargar')}</button><button class="btn ${t.dash.fijado ? 'acento-on' : ''}" id="dbFij">${ic('chincheta')}${tr(t.dash.fijado ? 'Fijado en Inicio' : 'Fijar en Inicio')}</button><button class="btn" id="dbEd">${ic('editar')}${tr('Editar')}</button><button class="btn fantasma icono mal" id="dbDel" title="${tr('Borrar dashboard')}">${ic('basura')}</button>`;
      $('.db-ayuda-ed', v).hidden = !t.editando;
    };
    acciones();
    $('#dbAcc', v).onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      try {
        if (b.id === 'dbRef') { b.classList.add('girando'); await t.cargar(true); b.classList.remove('girando'); }
        if (b.id === 'dbEd') { this.copia = JSON.stringify(t.dash.widgets); t.editar(true); }
        if (b.id === 'dbCan') { t.dash.widgets = JSON.parse(this.copia); t.editar(false); }
        if (b.id === 'dbOk') { await t.guardar(); t.editar(false); aviso('Cambios guardados'); }
        if (b.id === 'dbAdd') { const n = await DB_formWidget(); if (n) { n.pos = { x: 0, y: Math.max(0, ...t.dash.widgets.map(w => w.pos.y + w.pos.h)), w: { kpi: 3, progreso: 3, lista: 4, texto: 4, 'mapa-calor': 12 }[n.tipo] || 6, h: { kpi: 2, progreso: 2, texto: 3, 'mapa-calor': 3 }[n.tipo] || 4 }; t.dash.widgets.push(n); t.pintar(); } }
        if (b.id === 'dbFij') { t.dash = await api('PATCH', `/dashboards/${encodeURIComponent(t.dash.id)}`, { fijado: !t.dash.fijado }); }
        if (b.id === 'dbDel') { if (await confirmar('¿Borrar este dashboard?', 'Se borra el tablero y su caché. Los datos de origen no se tocan.', true)) { await api('DELETE', `/dashboards/${encodeURIComponent(t.dash.id)}`); location.hash = '#/dashboards'; return; } }
        acciones();
      } catch (er) { aviso(er.message, true); }
    };
  },
  alEvento(e) { if (e.tipo === 'dashboard' && this.t && e.id === this.t.dash.id && e.accion === 'guardado' && !this.t.editando) api('GET', `/dashboards/${encodeURIComponent(e.id)}`).then(d => { this.t.dash = d; this.t.pintar(); this.t.cargar(); }).catch(() => { }); },
  salir() { this.t?.destruir?.(); this.t = null; DB_tip(''); },
};

// el formulario devuelve _confirmo: lo pasamos al tablero activo al guardar
const DB_formOriginal = DB_formWidget;
DB_formWidget = async w => { const r = await DB_formOriginal(w); if (r && r._confirmo && VISTAS.dashboards.t) VISTAS.dashboards.t.confirmo = true; if (r) delete r._confirmo; return r; };

// ---------- dashboard fijado en Inicio ----------
(() => {
  const pintarIni = VISTAS.inicio.pintar, salirIni = VISTAS.inicio.salir;
  let turno = 0;
  VISTAS.inicio.pintar = async function (v, ...a) {
    const mio = ++turno;                                 // si Inicio se repinta mientras esperamos, solo monta el último
    this.dbT?.destruir(); this.dbT = null;
    await pintarIni.call(this, v, ...a);
    try {
      const L = await api('GET', '/dashboards'), d = L.dashboards.find(x => x.fijado); if (!d || !v.isConnected || mio !== turno) return;
      const k = $('.rejilla.k', v); if (!k) return;
      $$('.db-inicio-sec', v).forEach(x => x.remove());
      const s = document.createElement('div'); s.className = 'db-inicio-sec';
      s.innerHTML = `<div class="seccion">${ic('chincheta')}${esc(d.titulo)}<a class="btn fantasma mini" style="margin-left:auto" href="#/dashboards/${esc(d.id)}">${tr('Abrir')}</a></div><div class="db-inicio"></div>`;
      k.after(s);
      this.dbT = DB_montar($('.db-inicio', s), d, { compacto: true });
    } catch { }
  };
  VISTAS.inicio.salir = function () { this.dbT?.destruir(); this.dbT = null; return salirIni?.call(this); };
})();
