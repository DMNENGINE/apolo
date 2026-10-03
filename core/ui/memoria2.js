// Memoria v2 (FASE 4): pestañas de la página Memoria → Recuerdos · Grafo · Línea de tiempo · Sueños · Privacidad.
// #/memoria[/grafo|/linea|/suenos|/privacidad]. Globales con prefijo MV_ (scope compartido con el resto de scripts del panel).

const MV_recuerdos = VISTAS.memoria;           // la vista de recuerdos de vistas.js, intacta
const MV_PEST = [['', 'Recuerdos', 'cerebro'], ['grafo', 'Grafo', 'enlace'], ['linea', 'Línea de tiempo', 'calendario'], ['suenos', 'Sueños', 'luna'], ['privacidad', 'Privacidad', 'candado']];
const MV_COLOR = { persona: '#2bdc7c', proyecto: '#f5b83d', lugar: '#5ab0ff', cosa: '#9aa6b2', herramienta: '#b48cff' };
const MV_TIPO_N = { persona: 'Personas', proyecto: 'Proyectos', lugar: 'Lugares', cosa: 'Cosas', herramienta: 'Herramientas' };

VISTAS.memoria = {
  sub: '',
  async pintar(v, sub) {
    this.salir();
    this.sub = MV_PEST.some(p => p[0] === (sub || '')) ? (sub || '') : '';
    v.innerHTML = `<div class="mv-pest pestanas">${MV_PEST.map(([k, t, i]) => `<a href="#/memoria${k ? '/' + k : ''}" class="${k === this.sub ? 'on' : ''}">${ic(i)}${tr(t)}</a>`).join('')}</div><div id="mvCuerpo"></div>`;
    const c = $('#mvCuerpo', v);
    if (!this.sub) return MV_recuerdos.pintar(c);
    return MV_SUB[this.sub].pintar(c);
  },
  salir() { for (const k in MV_SUB) MV_SUB[k].salir?.(); },
  alEvento(e) { if (this.sub) MV_SUB[this.sub].alEvento?.(e); },
};

const MV_SUB = {};

// ================= GRAFO =================
MV_SUB.grafo = {
  async pintar(v) {
    this.v = v;
    const d = await api('GET', '/grafo');
    this.d = d; this.ocultos = this.ocultos || new Set();
    const cuenta = t => d.nodos.filter(n => n.tipo === t).length;
    v.innerHTML = `<div class="pagina ancha">${cabecera('Grafo de la memoria', 'Personas, proyectos, lugares, cosas y herramientas que salen en tus recuerdos y cómo se conectan. La heurística lo actualiza al momento y el sueño REM lo afina con el modelo. Arrastra para moverte, rueda para zoom, clic en un punto para ver sus recuerdos.',
      `<span class="chip">${tr('{n} entidades', { n: d.total.entidades })}</span><span class="chip">${tr('{n} relaciones', { n: d.total.relaciones })}</span>`)}
      <div class="mv-grafo">
        <div class="mv-lienzo caja"><canvas id="mvCanvas"></canvas>
          <div class="mv-filtros">${Object.keys(MV_COLOR).map(t => `<button class="mv-f ${this.ocultos.has(t) ? 'off' : ''}" data-t="${t}"><i style="background:${MV_COLOR[t]}"></i>${tr(MV_TIPO_N[t])} <span>${cuenta(t)}</span></button>`).join('')}</div>
          <div class="mv-buscar buscador-lado">${ic('buscar')}<input id="mvQ" placeholder="${tr('Buscar entidad…')}"></div>
          <div class="mv-zoom"><button class="btn icono" data-z="1.25" title="${tr('Acercar')}">${ic('mas')}</button><button class="btn icono" data-z="0.8" title="${tr('Alejar')}"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><button class="btn icono" data-z="0" title="${tr('Centrar')}">${ic('recargar')}</button></div>
          ${d.nodos.length < 2 ? `<div class="mv-vacio">${vacio('enlace', 'Aún no hay entidades. Se llenará solo a medida que el robot recuerde cosas.')}</div>` : ''}
        </div>
        <aside class="mv-detalle caja" id="mvDet"><div class="vacio">${ic('enlace')}${tr('Toca un punto del grafo para ver con qué está conectado y sus recuerdos.')}</div></aside>
      </div></div>`;
    this.montar();
    $('.mv-filtros', v).onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t; this.ocultos.has(t) ? this.ocultos.delete(t) : this.ocultos.add(t); b.classList.toggle('off'); this.calentar(); };
    $('.mv-zoom', v).onclick = e => { const b = e.target.closest('[data-z]'); if (!b) return; const z = +b.dataset.z; if (!z) this.encuadrar(); else this.zoomEn(this.W / 2, this.H / 2, z); };
    let tq; $('#mvQ', v).oninput = e => { clearTimeout(tq); tq = setTimeout(() => { const q = e.target.value.trim().toLowerCase(); if (!q) return; const n = this.nodos.find(x => x.nombre.toLowerCase().includes(q)); if (n) { this.enfocar(n); this.abrir(n); } }, 250); };
  },
  salir() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); this.ro = null; this.v = null; },
  montar() {
    const cv = $('#mvCanvas', this.v); if (!cv) return;
    this.cv = cv; this.ctx = cv.getContext('2d');
    const prev = new Map((this.nodos || []).map(n => [n.id, n]));
    this.nodos = this.d.nodos.map((n, i) => {
      const p = prev.get(n.id); const a = i * 2.399, r = 40 + 14 * Math.sqrt(i);
      return { ...n, x: p?.x ?? Math.cos(a) * r, y: p?.y ?? Math.sin(a) * r, vx: 0, vy: 0, r: n.id === 'usuario' ? 16 : 5 + Math.min(14, Math.sqrt(n.peso || 1) * 3.2), fijo: n.id === 'usuario' };
    });
    const por = new Map(this.nodos.map(n => [n.id, n]));
    this.aristas = this.d.aristas.map(a => ({ ...a, s: por.get(a.de), t: por.get(a.a) })).filter(a => a.s && a.t);
    this.vec = new Map(); for (const a of this.aristas) { for (const [x, y] of [[a.s, a.t], [a.t, a.s]]) { if (!this.vec.has(x.id)) this.vec.set(x.id, new Set()); this.vec.get(x.id).add(y.id); } }
    this.cam = this.cam || { x: 0, y: 0, z: 1 };
    this.ajustar(); this.ro = new ResizeObserver(() => { this.ajustar(); this.dibujar(); }); this.ro.observe(cv.parentElement);
    this.eventos(); this.calentar(); setTimeout(() => this.encuadrar(), 900);
  },
  ajustar() {
    const cv = this.cv, r = cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    this.W = r.width; this.H = r.height; cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  visible(n) { return !this.ocultos.has(n.tipo) || n.id === 'usuario'; },
  calentar() { this.alfa = 1; if (!this.raf) this.raf = requestAnimationFrame(() => this.paso()); },
  paso() {
    this.raf = 0; if (!this.v) return;
    const N = this.nodos.filter(n => this.visible(n)), A = this.aristas.filter(a => this.visible(a.s) && this.visible(a.t));
    const k = this.alfa;
    // repulsión (n² está bien para unos cientos de nodos)
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const a = N[i], b = N[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || .01;
      if (d2 > 250000) continue;
      const f = 2600 / d2 * k, d = Math.sqrt(d2); dx /= d; dy /= d;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    // muelles en las relaciones
    for (const a of A) {
      let dx = a.t.x - a.s.x, dy = a.t.y - a.s.y; const d = Math.sqrt(dx * dx + dy * dy) || .01, largo = a.s.id === 'usuario' || a.t.id === 'usuario' ? 130 : 80;
      const f = (d - largo) * 0.02 * k * Math.min(2, 1 + (a.peso - 1) * .2); dx /= d; dy /= d;
      a.s.vx += dx * f; a.s.vy += dy * f; a.t.vx -= dx * f; a.t.vy -= dy * f;
    }
    for (const n of N) {
      n.vx -= n.x * 0.004 * k; n.vy -= n.y * 0.004 * k;            // gravedad al centro
      if (n.fijo || n === this.arrastrado) { n.vx = n.vy = 0; if (n.id === 'usuario' && n !== this.arrastrado && !n.movido) { n.x *= .9; n.y *= .9; } continue; }
      n.vx *= .82; n.vy *= .82; n.x += Math.max(-30, Math.min(30, n.vx)); n.y += Math.max(-30, Math.min(30, n.vy));
    }
    this.alfa *= 0.985;
    this.dibujar();
    if (this.alfa > 0.02 || this.arrastrado) this.raf = requestAnimationFrame(() => this.paso());
  },
  dibujar() {
    const c = this.ctx, { x: cx, y: cy, z } = this.cam; if (!c) return;
    const css = getComputedStyle(document.documentElement), txt = css.getPropertyValue('--txt').trim() || '#ddd', txt3 = css.getPropertyValue('--txt-3').trim() || '#777', acento = css.getPropertyValue('--acento').trim() || '#2bdc7c';
    c.clearRect(0, 0, this.W, this.H);
    c.save(); c.translate(this.W / 2 + cx, this.H / 2 + cy); c.scale(z, z);
    const sel = this.sel, vec = sel ? this.vec.get(sel.id) || new Set() : null, hov = this.hover;
    for (const a of this.aristas) {
      if (!this.visible(a.s) || !this.visible(a.t)) continue;
      const on = sel && (a.s === sel || a.t === sel);
      c.strokeStyle = on ? acento : txt3; c.globalAlpha = sel ? (on ? .9 : .08) : Math.min(.55, .18 + a.peso * .08);
      c.lineWidth = (on ? 2 : 1) * Math.min(3, .6 + a.peso * .4) / Math.sqrt(z);
      c.beginPath(); c.moveTo(a.s.x, a.s.y); c.lineTo(a.t.x, a.t.y); c.stroke();
    }
    c.globalAlpha = 1;
    for (const n of this.nodos) {
      if (!this.visible(n)) continue;
      const tenue = sel && n !== sel && !vec.has(n.id);
      const col = n.id === 'usuario' ? acento : MV_COLOR[n.tipo] || '#999';
      c.globalAlpha = tenue ? .18 : 1;
      if (n === sel || n === hov || n.id === 'usuario') { c.shadowColor = col; c.shadowBlur = 18; }
      c.fillStyle = col; c.beginPath(); c.arc(n.x, n.y, n.r, 0, 6.283); c.fill(); c.shadowBlur = 0;
      if (n === sel) { c.strokeStyle = txt; c.lineWidth = 2 / z; c.beginPath(); c.arc(n.x, n.y, n.r + 4 / z, 0, 6.283); c.stroke(); }
      const etiqueta = n.r >= 9 || z > 1.35 || n === sel || n === hov || (vec && vec.has(n.id));
      if (etiqueta && !tenue) {
        c.font = `${n.id === 'usuario' ? 700 : 500} ${Math.max(10, 12 / Math.sqrt(z))}px ${css.getPropertyValue('--sans') || 'sans-serif'}`;
        c.fillStyle = txt; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(n.nombre, n.x, n.y + n.r + 4);
      }
    }
    c.restore(); c.globalAlpha = 1;
  },
  mundo(px, py) { return { x: (px - this.W / 2 - this.cam.x) / this.cam.z, y: (py - this.H / 2 - this.cam.y) / this.cam.z }; },
  enPunto(px, py) { const m = this.mundo(px, py); let mejor = null, md = Infinity; for (const n of this.nodos) { if (!this.visible(n)) continue; const d = Math.hypot(n.x - m.x, n.y - m.y); if (d < n.r + 6 / this.cam.z && d < md) { md = d; mejor = n; } } return mejor; },
  zoomEn(px, py, f) {
    const m = this.mundo(px, py), z = Math.max(.2, Math.min(5, this.cam.z * f));
    this.cam.z = z; this.cam.x = px - this.W / 2 - m.x * z; this.cam.y = py - this.H / 2 - m.y * z; this.dibujar();
  },
  encuadrar() {
    const N = this.nodos.filter(n => this.visible(n)); if (!N.length) return;
    const xs = N.map(n => n.x), ys = N.map(n => n.y), w = Math.max(...xs) - Math.min(...xs) + 80, h = Math.max(...ys) - Math.min(...ys) + 80;
    const z = Math.max(.25, Math.min(1.6, Math.min(this.W / w, this.H / h)));
    this.cam = { z, x: -((Math.max(...xs) + Math.min(...xs)) / 2) * z, y: -((Math.max(...ys) + Math.min(...ys)) / 2) * z }; this.dibujar();
  },
  enfocar(n) { const z = Math.max(this.cam.z, 1.3); this.cam = { z, x: -n.x * z, y: -n.y * z }; this.sel = n; this.dibujar(); },
  eventos() {
    const cv = this.cv; let ini = null, movido = false;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.onpointerdown = e => {
      const [px, py] = pos(e); cv.setPointerCapture(e.pointerId); movido = false;
      const n = this.enPunto(px, py);
      ini = { px, py, cx: this.cam.x, cy: this.cam.y, n };
      if (n) { this.arrastrado = n; this.calentar(); }
    };
    cv.onpointermove = e => {
      const [px, py] = pos(e);
      if (!ini) { const h = this.enPunto(px, py); if (h !== this.hover) { this.hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; this.dibujar(); } return; }
      if (Math.hypot(px - ini.px, py - ini.py) > 3) movido = true;
      if (ini.n) { const m = this.mundo(px, py); ini.n.x = m.x; ini.n.y = m.y; ini.n.movido = true; this.alfa = Math.max(this.alfa, .3); }
      else { this.cam.x = ini.cx + px - ini.px; this.cam.y = ini.cy + py - ini.py; cv.style.cursor = 'grabbing'; this.dibujar(); }
    };
    cv.onpointerup = e => {
      const n = ini?.n; this.arrastrado = null; ini = null; cv.style.cursor = 'grab';
      if (!movido) { if (n) this.abrir(n); else { this.sel = null; this.dibujar(); } }
    };
    cv.onwheel = e => { e.preventDefault(); const [px, py] = pos(e); this.zoomEn(px, py, e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  },
  async abrir(n) {
    this.sel = n; this.dibujar();
    const det = $('#mvDet'); if (!det) return;
    det.innerHTML = `<div class="vacio">${tr('Cargando…')}</div>`;
    try {
      const r = await api('GET', '/grafo/' + encodeURIComponent(n.id));
      det.innerHTML = `<div class="mv-ent"><i style="background:${n.id === 'usuario' ? 'var(--acento)' : MV_COLOR[r.entidad.tipo]}"></i><div><b>${esc(r.entidad.nombre)}</b><small>${esc(tr(MV_TIPO_N[r.entidad.tipo] || r.entidad.tipo))}${r.entidad.alias?.length ? ` · ${esc(r.entidad.alias.join(', '))}` : ''}</small></div></div>
        ${r.vecinos.length ? `<div class="seccion">${tr('Conectado con')} <span class="n">${r.vecinos.length}</span></div><div class="mv-vecinos">${r.vecinos.slice(0, 24).map(x => `<button class="chip" data-id="${esc(x.id)}" title="${esc(x.relacion)}"><i style="background:${MV_COLOR[x.tipo] || '#999'}"></i>${esc(x.nombre)}${x.relacion && x.relacion !== 'relacionado' ? ` <em>· ${esc(x.relacion)}</em>` : ''}</button>`).join('')}</div>` : ''}
        <div class="seccion">${tr('Recuerdos')} <span class="n">${r.recuerdos.length}</span></div>
        ${r.recuerdos.length ? r.recuerdos.map(m => `<div class="mv-rec"><span class="chip">${esc(tr(m.tipo))}</span> ${esc(m.texto)}</div>`).join('') : `<div class="tenue">${tr('Sin recuerdos directos.')}</div>`}`;
      det.onclick = e => { const b = e.target.closest('[data-id]'); if (!b) return; const x = this.nodos.find(y => y.id === b.dataset.id); if (x) { this.enfocar(x); this.abrir(x); } };
    } catch (e) { det.innerHTML = vacio('info', esc(e.message)); }
  },
};

// ================= LÍNEA DE TIEMPO =================
const MV_LT = { sesion: ['chat', 'Conversaciones'], tarea: ['reloj', 'Tareas'], turno: ['luna', 'Turnos de noche'], consejo: ['persona', 'Consejos'], sueno: ['cerebro', 'Sueños'], permiso: ['escudo', 'Permisos'], recuerdo: ['chispa', 'Recuerdos'], reunion: ['reunion', 'Reuniones'] };
MV_SUB.linea = {
  q: '', rango: '30', tipos: null, limite: 200,
  async pintar(v) {
    this.v = v;
    v.innerHTML = `<div class="pagina">${cabecera('Línea de tiempo', 'Todo lo que ha pasado con tu asistente, día a día: conversaciones, tareas, turnos de noche, consejos, sueños de la memoria, permisos y recuerdos nuevos.',
      seg('rango', [['1', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['365', '1 año'], ['0', 'Todo']], this.rango))}
      <div class="buscador-lado" style="margin:0 0 12px">${ic('buscar')}<input id="ltQ" placeholder="${tr('Buscar en conversaciones, tareas, informes…')}" value="${esc(this.q)}"></div>
      <div class="mv-tipos" id="ltTipos"></div>
      <div id="ltLista"><div class="vacio">${tr('Cargando…')}</div></div></div>`;
    enlazarControles(v, (id, val) => { if (id === 'rango') { this.rango = val; this.cargar(); } });
    let t; $('#ltQ', v).oninput = e => { clearTimeout(t); t = setTimeout(() => { this.q = e.target.value.trim(); this.cargar(); }, 300); };
    $('#ltTipos', v).onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      const todos = Object.keys(MV_LT); const s = new Set(this.tipos || todos);
      if (s.has(b.dataset.t) && s.size === todos.length) { this.tipos = [b.dataset.t]; } else { s.has(b.dataset.t) ? s.delete(b.dataset.t) : s.add(b.dataset.t); this.tipos = s.size && s.size < todos.length ? [...s] : null; }
      this.cargar();
    };
    $('#ltLista', v).onclick = e => { const b = e.target.closest('[data-mas]'); if (b) { this.limite += 300; this.cargar(); } };
    await this.cargar();
  },
  salir() { this.v = null; },
  async cargar() {
    if (!this.v) return;
    const dias = +this.rango, desde = dias ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - (dias - 1) * 864e5; })() : 0;
    const qs = new URLSearchParams({ desde, q: this.q, limite: this.limite }); if (this.tipos) qs.set('tipos', this.tipos.join(','));
    const r = await api('GET', '/linea?' + qs);
    const todos = await (this.tipos ? api('GET', '/linea?' + new URLSearchParams({ desde, q: this.q, limite: 1 })) : r);
    const act = new Set(this.tipos || Object.keys(MV_LT));
    $('#ltTipos').innerHTML = Object.entries(MV_LT).map(([k, [i, t]]) => `<button class="mv-f ${act.has(k) ? '' : 'off'}" data-t="${k}">${ic(i)}${tr(t)} <span>${todos.cuenta[k] || 0}</span></button>`).join('');
    const grupos = new Map();
    for (const e of r.eventos) { const d = new Date(e.t); d.setHours(0, 0, 0, 0); const k = d.getTime(); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const titulo = k => k === hoy.getTime() ? tr('Hoy') : k === hoy.getTime() - 864e5 ? tr('Ayer') : new Date(k).toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: new Date(k).getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
    const extra = e => {
      const x = e.extra || {};
      if (e.tipo === 'sesion') return `${avatar(x.modelo || '')}<span class="chip">${esc(nombreModelo(x.modelo))}</span><span class="chip">${tr('{n} mensaje|{n} mensajes', { n: x.mensajes })}</span>${x.herramientas ? `<span class="chip">${tr('{n} herramienta|{n} herramientas', { n: x.herramientas })}</span>` : ''}${x.canal && x.canal !== 'web' ? `<span class="chip">${esc(x.canal)}</span>` : ''}`;
      if (e.tipo === 'tarea') return `<span class="chip ${x.ok ? 'ok' : 'mal'}">${x.ok ? tr('ok') : tr('error')}</span>`;
      if (e.tipo === 'turno') return `<span class="chip ok">${tr('{a}/{b} hechos', { a: x.hechos ?? 0, b: x.encargos ?? 0 })}</span>${x.video ? `<span class="chip acento">${tr('vídeo')}</span>` : ''}`;
      if (e.tipo === 'consejo') return x.acuerdo != null ? `<span class="chip acento">${tr('{n}% de acuerdo', { n: x.acuerdo })}</span>` : '';
      if (e.tipo === 'sueno') return `<span class="chip">${tr('{n} fusionados', { n: x.fusionados })}</span><span class="chip">${tr('{n} olvidados', { n: x.olvidados })}</span><span class="chip acento">${tr('{n} patrones', { n: x.nuevos })}</span>${x.deshecho ? `<span class="chip aviso">${tr('deshecho')}</span>` : ''}`;
      if (e.tipo === 'permiso') return `<span class="chip ${x.decision === 'deny' ? 'mal' : 'ok'}">${esc(x.decision)}</span>${x.peligro ? `<span class="chip aviso">${esc(x.peligro)}</span>` : ''}`;
      if (e.tipo === 'recuerdo') return x.origen ? `<span class="chip">${esc(x.origen)}</span>` : '';
      return '';
    };
    $('#ltLista').innerHTML = r.eventos.length ? [...grupos].map(([k, l]) => `<div class="lt-dia"><div class="lt-cab"><b>${esc(titulo(k))}</b><span>${tr('{n} evento|{n} eventos', { n: l.length })}</span></div>
      ${l.map(e => `<a class="lt-ev t-${e.tipo}" href="${esc(e.ruta || '#/memoria/linea')}"><span class="lt-h">${hora(e.t)}</span><span class="lt-ic">${ic(MV_LT[e.tipo]?.[0] || 'info')}</span>
        <div class="lt-c"><b>${esc(tr(e.titulo))}</b>${e.detalle ? `<small>${esc(e.detalle)}</small>` : ''}<div class="lt-x">${extra(e)}${e.fin && e.fin - e.t > 60_000 ? `<span class="chip">${duracion(Math.round((e.fin - e.t) / 1000))}</span>` : ''}</div></div></a>`).join('')}</div>`).join('')
      + (r.total > r.eventos.length ? `<div style="text-align:center;margin:14px"><button class="btn" data-mas="1">${tr('Ver más ({n} en total)', { n: r.total })}</button></div>` : '')
      : vacio('calendario', this.q ? 'Nada coincide con la búsqueda.' : 'Nada en este periodo.');
  },
};

// ================= SUEÑOS =================
MV_SUB.suenos = {
  async pintar(v) {
    this.v = v;
    const d = await api('GET', '/sueno');
    this.d = d;
    v.innerHTML = `<div class="pagina">${cabecera('Sueños de la memoria', 'Cada noche la memoria duerme en tres fases: <b>ligera</b> (fusiona recuerdos repetidos y deja ir datos viejos sin usar), <b>REM</b> (conecta recuerdos, descubre patrones y alimenta el grafo) y <b>profunda</b> (condensa tu perfil sin perder datos). Antes de tocar nada guarda una copia: cada noche se puede deshacer.',
      `<button class="btn pri" id="svYa" ${d.enCurso ? 'disabled' : ''}>${ic('luna')}${tr(d.enCurso ? 'Soñando…' : 'Soñar ahora')}</button>`)}
      <div class="caja">${fila('Sueño nocturno', 'Se ejecuta solo cada noche con el modelo del cerebro (no gasta tu plan de Claude salvo que lo elijas).', sw('activo', d.config.activo !== false))}
        ${fila('Hora', 'Mejor de madrugada, cuando no usas el PC. El resumen llega con el briefing de la mañana.', `<input type="time" id="svHora" value="${esc(d.config.hora || '04:00')}">`)}</div>
      <div class="seccion">${tr('Noches')} <span class="n">${d.informes.length}</span></div>
      <div id="svLista">${d.informes.length ? d.informes.map(i => this.tarjeta(i)).join('') : vacio('luna', 'Aún no ha soñado. Pulsa «Soñar ahora» o espera a esta noche.')}</div></div>`;
    enlazarControles(v, async (id, val) => { if (id === 'activo') { await api('PATCH', '/sueno/config', { activo: val }); aviso(tr('Guardado')); } });
    $('#svHora', v).onchange = async e => { await api('PATCH', '/sueno/config', { hora: e.target.value }); aviso(tr('Guardado')); };
    $('#svYa', v).onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = `${ic('luna')}${tr('Soñando…')}`;
      try { const i = await api('POST', '/sueno'); aviso(i.resumen.split('\n')[0]); } catch (er) { aviso(er.message, true); }
      if (this.v) this.pintar(this.v);
    };
    v.onclick = async e => {
      const b = e.target.closest('[data-deshacer]'); if (!b) return;
      if (!await confirmar('Deshacer esta noche', 'La memoria vuelve a como estaba justo antes de este sueño (se pierde lo que se haya guardado después).', true)) return;
      try { const r = await api('POST', `/sueno/${b.dataset.deshacer}/deshacer`); aviso(tr('Memoria restaurada: {n} recuerdos', { n: r.recuerdos })); this.pintar(v); } catch (er) { aviso(er.message, true); }
    };
  },
  salir() { this.v = null; },
  alEvento(e) { if (e.tipo === 'sueno' && ['fin', 'deshecho'].includes(e.fase) && this.v) this.pintar(this.v); },
  tarjeta(i) {
    const n = i.fusionados.reduce((a, f) => a + f.borrados.length, 0);
    const lista = (t, l) => l.length ? `<div class="seccion">${tr(t)} <span class="n">${l.length}</span></div>${l.join('')}` : '';
    return `<details class="caja sv-noche ${i.deshecho ? 'deshecho' : ''}"><summary>
      <div class="sv-luna">${ic('luna')}</div>
      <div class="sv-t"><b>${esc(new Date(i.inicio).toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long' }))} · ${hora(i.inicio)}</b>
        <span>${esc(i.resumen.split('\n')[0])}</span>
        <div class="lt-x"><span class="chip">${tr('{n} fusionados', { n })}</span><span class="chip">${tr('{n} olvidados', { n: i.olvidados.length })}</span><span class="chip acento">${tr('{n} patrones', { n: i.nuevos.length })}</span>
          ${i.perfilCambiado ? `<span class="chip ok">${tr('perfil condensado')}</span>` : ''}${i.grafo?.nuevas ? `<span class="chip">${tr('+{n} en el grafo', { n: i.grafo.nuevas })}</span>` : ''}
          ${i.errores?.length ? `<span class="chip mal">${tr('{n} error|{n} errores', { n: i.errores.length })}</span>` : ''}${i.deshecho ? `<span class="chip aviso">${tr('deshecho')}</span>` : ''}<span class="chip">${esc(nombreModelo(i.modelo))} · ${((i.fin - i.inicio) / 1000).toFixed(1)} s</span></div></div></summary>
      <div class="sv-cuerpo">
        ${i.resumen.split('\n').length > 1 ? `<div class="md" style="white-space:pre-wrap">${esc(i.resumen)}</div>` : ''}
        ${lista('Patrones nuevos (REM)', i.nuevos.map(p => `<div class="mv-rec">${ic('chispa')} ${esc(p.texto)}</div>`))}
        ${lista('Fusionados (ligera)', i.fusionados.map(f => `<div class="mv-rec"><b>${esc(f.queda.texto)}</b>${f.borrados.map(b => `<div class="tenue">− ${esc(b.texto)}</div>`).join('')}</div>`))}
        ${lista('Olvidados (ligera)', i.olvidados.map(o => `<div class="mv-rec tenue">− ${esc(o.texto)} <small>(${esc(o.motivo)})</small></div>`))}
        ${i.perfilCambiado ? `<div class="seccion">${tr('Perfil (profunda)')}</div><div class="sv-perfil"><div><small>${tr('Antes')}</small>${i.perfilAntes.map(t => `<div class="mv-rec">${esc(t)}</div>`).join('')}</div><div><small>${tr('Después')}</small>${i.perfilDespues.map(t => `<div class="mv-rec">${esc(t)}</div>`).join('')}</div></div>` : ''}
        <div class="sv-fases">${Object.entries(i.fases || {}).map(([k, v]) => `<span class="chip ${/^error|rechazado/.test(v) ? 'aviso' : ''}">${esc(k)}: ${esc(v)}</span>`).join('')}</div>
        ${!i.deshecho ? `<div style="text-align:right;margin-top:10px"><button class="btn mal" data-deshacer="${esc(i.id)}">${ic('recargar')}${tr('Deshacer esta noche')}</button></div>` : ''}
      </div></details>`;
  },
};

// ================= PRIVACIDAD =================
MV_SUB.privacidad = {
  async pintar(v) {
    const d = await api('GET', '/privacidad');
    const n = d.inventario;
    v.innerHTML = `<div class="pagina">${cabecera('Privacidad', 'Tus datos son tuyos y viven en este PC. Llévatelos cuando quieras o bórralos de un golpe.')}
      <div class="rejilla k"><div class="kpi"><small>${ic('cerebro')}${tr('Recuerdos')}</small><b>${n.recuerdos}</b></div><div class="kpi"><small>${ic('chat')}${tr('Conversaciones')}</small><b>${n.sesiones}</b></div>
        <div class="kpi"><small>${ic('enlace')}${tr('Entidades')}</small><b>${n.entidades}</b></div><div class="kpi"><small>${ic('luna')}${tr('Sueños')}</small><b>${n.suenos}</b></div></div>
      <div class="seccion">${tr('Exportar')}</div>
      <div class="caja">${fila('Exportar todo (.zip)', 'Memoria, grafo, personalidad, conversaciones, sueños, consejos, informes del turno de noche, tareas e historiales. No incluye la configuración ni las claves de API.', `<button class="btn pri" id="pvExp">${ic('abajo')}${tr('Exportar')}</button>`)}</div>
      <div class="seccion" style="color:var(--mal)">${tr('Zona peligrosa')}</div>
      <div class="caja pv-peligro">${fila('Borrar todo', 'Borra recuerdos, grafo, conversaciones, sueños, consejos, informes e historiales. Se quedan la configuración, las claves, las reglas de permisos, las skills, los plugins y las automatizaciones. No se puede deshacer: exporta antes.', `<button class="btn mal" id="pvBorrar">${ic('basura')}${tr('Borrar todo…')}</button>`)}</div></div>`;
    $('#pvExp', v).onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try { await MV_bajar('POST', '/privacidad/exportar', {}, 'apolo-datos.zip'); aviso(tr('Exportación descargada')); } catch (er) { aviso(er.message, true); }
      b.disabled = false;
    };
    $('#pvBorrar', v).onclick = () => this.borrar(v);
  },
  async borrar(v) {
    let p1; try { p1 = await api('POST', '/privacidad/borrar', {}); } catch (e) { return aviso(e.message, true); }
    const s = p1.seBorra;
    const r = await modal({
      titulo: 'Borrar todo',
      cuerpo: `<p class="suave" style="margin-top:0">${tr('Se va a borrar para siempre:')}</p>
        <ul class="pv-lista"><li>${tr('{n} recuerdos', { n: s.recuerdos })}</li><li>${tr('{n} conversaciones', { n: s.sesiones })}</li><li>${tr('{n} entidades del grafo', { n: s.entidades })}</li><li>${tr('sueños, consejos, informes del turno e historiales')}</li></ul>
        <p class="tenue">${tr('Se queda: {x}.', { x: tr(p1.seQueda) })}</p>
        <div class="campo">${tr('Paso 1 · escribe este código: {c}', { c: `<b class="mono" style="color:var(--mal);letter-spacing:2px">${esc(p1.codigo)}</b>` })}<input id="pvCod" autocomplete="off" class="mono"></div>
        <div class="campo">${tr('Paso 2 · escribe {f}', { f: `<b>${esc(p1.frase)}</b>` })}<input id="pvFrase" autocomplete="off"></div>`,
      botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Borrar todo', cls: 'mal pri', valor: x => ({ codigo: $('#pvCod', x).value.trim(), frase: $('#pvFrase', x).value.trim() }) }],
    });
    if (!r) return;
    try { const x = await api('POST', '/privacidad/borrar', r); if (x.ok) { aviso(tr('Todo borrado')); E.sesiones = []; pintarSesionesLado?.(); this.pintar(v); } } catch (e) { aviso(e.message, true); }
  },
};

// descarga binaria de la API (zip, png, mp4) con el token
async function MV_bajar(metodo, ruta, cuerpo, nombre) {
  const r = await fetch('/v1' + ruta, { method: metodo, headers: { 'x-robot-token': TOKEN, 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
  const disp = r.headers.get('content-disposition') || '', m = /filename="([^"]+)"/.exec(disp);
  const blob = await r.blob(), url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = m ? m[1] : nombre; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return blob;
}
