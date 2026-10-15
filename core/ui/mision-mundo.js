// Mission Control → vista "Mundo": un mapa pixel-art vivo (mundo/1 de /v1/mundo) donde cada agente es un personaje.
// APOLO es el mago del orbe; las conversaciones, aprendices a su lado; los subagentes van a su bahía; las tareas programadas, al taller;
// los plugins son goblins en la sala de servidores. Rayos del orbe a quien trabaja, burbujas (… ? ! ✓), HUD con CPU/RAM, E-STOP y pánico.
// El dibujo (texturas, sprites, luz, partículas) vive en mision-mundo-arte.js.

const MM_ROPA = ['#3b6fb6', '#b5452f', '#3f8f4f', '#8a4fb5', '#c08a2e', '#2f8f8f', '#6b6b75', '#b54f7d'];
const MM_PELO = ['#3a2414', '#6b3e1f', '#c9a24a', '#1c1c1c', '#8b2f1f', '#d9d9d9'];
const MM_PIEL = ['#f1c7a0', '#d9a477', '#a8714a', '#7a4e2d'];
const MM_ESTILO = ['corto', 'largo', 'punta', 'mono'];
const mmHash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const MC_MUNDO = {
  async montar(caja, mc) {
    this.mc = mc; this.caja = caja; this.ents = new Map(); this.ticker = []; this.log = []; this.parts = []; this.pestana = this.pestana || 'ticker';
    this.est = { cpu: 0, ram: 0, ramTot: 0, orbe: 0, progreso: 0, bahia: 0, memoria: 0, panico: false, luz: 'antorcha', borde: '#2fd1b0' };
    const r = await api('GET', '/mundo').catch(() => null);
    if (!r || !this.caja) return;
    this.propio = r.propio; this.cargar(r.mundo);
    this.cargarDatos(); clearInterval(this.tDatos); this.tDatos = setInterval(() => this.cargarDatos(), 2500);
    clearInterval(this.tLento); this.tLento = setInterval(() => this.cargarLento(), 30000); this.cargarLento();
  },
  salir() { cancelAnimationFrame(this.raf); this.raf = 0; clearInterval(this.tDatos); clearInterval(this.tLento); this.caja = null; },
  cargar(m) {
    this.m = m; const tema = MM_TEMAS[m.tema] || MM_TEMAS.mazmorra; this.tema = tema; this.est.luz = tema.luz; this.est.borde = tema.borde;
    const R = MM_R, W = m.ancho * R, H = m.alto * R; this.W = W; this.H = H;
    // rejilla: 0 vacío · 1 suelo · 2 pared; y qué sala/suelo tiene cada casilla
    const g = new Uint8Array(m.ancho * m.alto), suelo = new Array(m.ancho * m.alto), sala = new Array(m.ancho * m.alto);
    const en = (x, y) => x >= 0 && y >= 0 && x < m.ancho && y < m.alto;
    const poner = (rc, s, id) => { for (let y = rc.y; y < rc.y + rc.h; y++) for (let x = rc.x; x < rc.x + rc.w; x++) if (en(x, y)) { const i = y * m.ancho + x; g[i] = 1; suelo[i] = s; if (id) sala[i] = id; } };
    const sueloPasillo = { nave: 'metal', laboratorio: 'metal', oficina: 'madera', bosque: 'hierba' }[m.tema] || 'tierra';
    for (const p of m.pasillos) poner(p, sueloPasillo);
    for (const s of m.salas) poner(s, s.suelo, s.id);
    for (let y = 0; y < m.alto; y++) for (let x = 0; x < m.ancho; x++) if (!g[y * m.ancho + x]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (en(x + dx, y + dy) && g[(y + dy) * m.ancho + x + dx] === 1) { g[y * m.ancho + x] = 2; dy = dx = 2; }
    }
    this.g = g; this.suelo = suelo; this.sala = sala;
    this.bloq = new Uint8Array(m.ancho * m.alto);
    for (const o of m.objetos) { const d = MM_OBJ[o.tipo]; if (d?.bloq) for (let y = o.y; y < o.y + d.h; y++) for (let x = o.x; x < o.x + d.w; x++) if (en(x, y)) this.bloq[y * m.ancho + x] = 1; }
    this.porRol = Object.fromEntries(m.salas.map(s => [s.rol, s]));
    this.orbe = m.objetos.find(o => o.tipo === 'orbe') || (() => { const s = this.porRol.principal; return { x: s.x + (s.w >> 1) - 1, y: s.y + (s.h >> 1) - 1 }; })();
    this.fondo = mmFondo(this);
    // luz: mapa a media resolución (se suaviza al escalar) y viñeta fija
    this.luz = mmLienzo(W >> 1, H >> 1); this.lc = this.luz.getContext('2d');
    this.vin = mmLienzo(W, H); const vc = this.vin.getContext('2d'), gv = vc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .58);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,.38)'); vc.fillStyle = gv; vc.fillRect(0, 0, W, H);
    this.dom(); this.ents.clear(); this.parts = []; this.poblar();
    if (!this.raf) this.raf = requestAnimationFrame(t => this.cuadro(t));
  },
  dom() {
    const m = this.m, px = v => `${(v / m.ancho * 100).toFixed(3)}%`, py = v => `${(v / m.alto * 100).toFixed(3)}%`, s = this.porRol;
    this.caja.style.setProperty('--mm-borde', this.tema.borde);
    this.caja.innerHTML = `<div class="mm">
      <div class="mm-barra mm-arriba"><span class="mm-dato" data-d="cpu">CPU —</span><span class="mm-dato" data-d="ram">RAM —</span><span class="mm-dato" data-d="tok">TOKENS —</span>
        <span class="mm-titulo">MISSION CONTROL</span><span class="mm-dato mm-status" data-d="status">STATUS: —</span>
        <span class="mm-pest"><button data-p="ticker" class="${this.pestana === 'ticker' ? 'on' : ''}">TICKER</button><button data-p="log" class="${this.pestana === 'log' ? 'on' : ''}">LOG</button></span></div>
      <div class="mm-mapa" style="aspect-ratio:${m.ancho}/${m.alto}"><canvas width="${this.W}" height="${this.H}"></canvas>
        ${m.salas.filter(x => x.nombre).map(x => `<div class="mm-placa" style="left:${px(x.x + x.w / 2)};top:${py(x.y + .15)}">${esc(x.nombre).toUpperCase()}</div>`).join('')}
        ${s.servidores ? `<div class="mm-panel" style="left:${px(s.servidores.x + s.servidores.w - 2.3)};top:${py(s.servidores.y + 2.6)}"><div>CPU <i data-b="cpu"><b></b></i></div><div>RAM <i data-b="ram"><b></b></i></div></div>` : ''}
        ${s.taller ? `<div class="mm-panel" style="left:${px(s.taller.x + s.taller.w - 3.6)};top:${py(s.taller.y + 2.2)}"><div class="mm-c" data-d="taller">TAREAS:<br>—</div></div>` : ''}
        <div class="mm-nombres"></div>
        <div class="mm-ticker"><div class="mm-lineas"></div></div>
        <div class="mm-holo mv-holo" hidden></div>
      </div>
      <div class="mm-barra mm-abajo"><span class="mm-dato"><span>CPU</span><i data-b="cpu"><b></b></i></span><span class="mm-dato"><span>RAM</span><i data-b="ram"><b></b></i></span>
        <span class="mm-dato" data-d="agentes">AGENTES —</span><span class="mm-hueco"></span>
        <button class="mm-btn rojo" data-a="estop" title="${tr('Detiene todos los agentes que están trabajando ahora')}">E-STOP</button>
        <button class="mm-btn rojo fuerte" data-a="panico" title="${tr('Pánico: corta todo (agentes, control del ratón, tareas) hasta que reanudes')}">PÁNICO</button>
        <button class="mm-btn ic" data-a="editar" title="${tr('Crear o cambiar tu mundo')}">⚙</button>
        <button class="mm-btn ic" data-a="pausa" title="${tr('Pausar la animación')}">${this.pausa ? '▶' : '❚❚'}</button></div>
    </div>`;
    this.cv = $('canvas', this.caja); this.c = this.cv.getContext('2d'); this.c.imageSmoothingEnabled = false;
    this.capaNombres = $('.mm-nombres', this.caja);
    this.cv.onclick = e => this.clic(e);
    this.cv.onmousemove = e => { const p = this.punto(e); const h = this.enPunto(p.x, p.y); this.cv.style.cursor = h ? 'pointer' : 'default'; this.encima = h?.p || null; };
    this.cv.onmouseleave = () => { this.encima = null; };
    $('.mm-pest', this.caja).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; this.pestana = b.dataset.p; $$('.mm-pest button', this.caja).forEach(x => x.classList.toggle('on', x === b)); this.pintarTicker(); };
    $('.mm-abajo', this.caja).onclick = e => { const b = e.target.closest('[data-a]'); if (b) this.accion(b.dataset.a, b); };
    this.pintarTicker();
  },
  // ---------- datos ----------
  async cargarDatos() {
    if (!this.caja) return;
    try {
      const [s, p] = await Promise.all([api('GET', '/sistema'), api('GET', '/panico').catch(() => ({}))]);
      this.est.cpu = s.cpu.uso; this.est.ramTot = s.memoria.total; this.est.ram = 1 - s.memoria.libre / s.memoria.total; this.est.panico = !!p.activo; this.hud();
    } catch { }
  },
  async cargarLento() {
    if (!this.caja) return;
    try {
      const [pl, ta, tu] = await Promise.all([api('GET', '/plugins').catch(() => ({ plugins: [] })), api('GET', '/tareas').catch(() => []), api('GET', '/turno').catch(() => null)]);
      this.plugins = (pl.plugins || []).filter(x => x.activo).slice(0, 8); this.tareas = (ta || []).filter(x => x.activa); this.turno = tu;
      const hechos = tu?.turno?.encargos?.filter?.(x => x.estado === 'hecho').length, total = tu?.turno?.encargos?.length;
      this.est.progreso = total ? hechos / total : 0;
      this.poblar(); this.hud();
    } catch { }
  },
  alEvento(e) {
    if (!this.caja) return;
    if (e.tipo === 'agente' && e.agente) {
      const a = e.agente, prev = this.mc.agentes.get(a.id);
      if (a.herramienta && a.herramienta.nombre !== prev?.herramienta?.nombre) this.apuntar('ticker', `${a.nombre || a.id}: ${NOMBRE_HERR[a.herramienta.nombre] || a.herramienta.nombre} ${a.herramienta.resumen || ''}`);
      else if (!prev && a.estado === 'trabajando') this.apuntar('ticker', `${a.nombre || a.id}: ${a.padre ? tr('subagente en marcha') : tr('empieza')}`);
      else if (prev?.estado === 'trabajando' && a.estado !== 'trabajando') this.apuntar('ticker', `${a.nombre || a.id}: ${a.estado === 'listo' ? tr('terminado') : a.estado}`);
      if (a.esperando && !prev?.esperando) this.apuntar('ticker', `${a.nombre || a.id}: ${tr('esperando tu permiso')}`, 'aviso');
      queueMicrotask(() => this.poblar());
    } else if (e.tipo === 'registro') this.apuntar('log', `${e.origen}: ${e.texto}`, e.nivel);
    else if (e.tipo === 'memoria-uso') { this.est.memoria = 1; this.apuntar('ticker', `APOLO ${e.accion === 'escribir' ? tr('guardó en') : tr('consultó')} ${tr('la memoria')} (${(e.recuerdos || []).length})`); }
  },
  apuntar(donde, texto, nivel) {
    const l = this[donde]; l.unshift({ t: Date.now(), texto: String(texto).replace(/\s+/g, ' ').slice(0, 140), nivel }); if (l.length > 60) l.pop();
    if (donde === this.pestana) this.pintarTicker();
  },
  pintarTicker() {
    const el = this.caja && $('.mm-lineas', this.caja); if (!el) return;
    const l = this[this.pestana];
    el.innerHTML = l.length ? l.slice(0, 40).map(x => `<div class="${x.nivel || ''}"><span>${hora(x.t)}</span> ${esc(x.texto)}</div>`).join('') : `<div class="tenue">${tr(this.pestana === 'ticker' ? 'Sin actividad todavía…' : 'Sin registros todavía…')}</div>`;
  },
  hud() {
    if (!this.caja) return;
    const e = this.est, ags = [...this.mc.agentes.values()], vivos = ags.filter(a => a.estado === 'trabajando'), esperan = ags.filter(a => a.esperando).length;
    const tok = ags.reduce((s, a) => s + (a.uso ? a.uso.entrada + a.uso.salida : 0), 0);
    const pon = (d, h) => $$(`[data-d="${d}"]`, this.caja).forEach(x => { x.innerHTML = h; });
    pon('cpu', `CPU ${(e.cpu * 100).toFixed(0)}%`); pon('ram', `RAM ${(e.ram * e.ramTot / 1e9).toFixed(1)}/${(e.ramTot / 1e9).toFixed(0)} GB`); pon('tok', `TOKENS 6H ${fmtK(tok)}`);
    pon('agentes', `AGENTES ${vivos.length}${esperan ? ` · <em>${esperan} ESPERAN</em>` : ''}`);
    const st = e.panico ? 'PÁNICO' : esperan ? 'ESPERANDO' : vivos.length ? 'ACTIVO' : 'EN ESPERA';
    pon('status', `STATUS: <b class="${e.panico ? 'mal' : esperan ? 'aviso' : vivos.length ? 'ok' : ''}">${st}</b>`);
    pon('estado', `STATUS:<br><b class="${vivos.length ? 'ok' : ''}">${vivos.length ? 'ACTIVO' : 'EN ESPERA'}</b>`);
    const tu = this.turno, prox = (this.tareas || []).map(t => t.proxima).filter(Boolean).sort()[0];
    pon('taller', tu?.activo ? `TURNO NOCHE:<br><b class="ok">${Math.round(e.progreso * 100)}%</b>` : `TAREAS: ${(this.tareas || []).length}<br>${prox ? `PRÓXIMA ${new Date(prox).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })}` : '—'}`);
    $$('[data-b]', this.caja).forEach(i => { const v = { cpu: e.cpu, ram: e.ram, orbe: e.orbe }[i.dataset.b] ?? 0; i.firstChild.style.width = `${Math.round(Math.min(1, v) * 100)}%`; });
    const pb = $('[data-a="panico"]', this.caja); if (pb) pb.textContent = e.panico ? 'REANUDAR' : 'PÁNICO';
    this.caja.classList.toggle('mm-panico', e.panico);
  },
  // ---------- quién vive en el mundo ----------
  poblar() {
    if (!this.m) return;
    const quiere = new Map(), ahora = Date.now(), R = MM_R;
    const look = (id, extra = {}) => { const h = mmHash(id); return { ropa: MM_ROPA[h % MM_ROPA.length], pelo: MM_PELO[(h >>> 4) % MM_PELO.length], piel: MM_PIEL[(h >>> 8) % MM_PIEL.length], estilo: MM_ESTILO[(h >>> 10) % 4],
      ...((h >>> 12) % 4 === 0 ? { sombrero: 'capucha', color: MM_ROPA[(h >>> 14) % MM_ROPA.length] } : {}), ...((h >>> 16) % 3 === 0 ? { capa: MM_ROPA[(h >>> 18) % MM_ROPA.length] } : {}), mochila: (h >>> 20) % 2 === 0, ...extra }; };
    quiere.set('apolo', { tipo: 'apolo', nombre: 'APOLO', sala: 'principal', look: { ropa: '#4b3a8f', ropa2: '#e0b44a', pelo: '#d9d9d9', piel: '#f1c7a0', barba: '#eeeeee', sombrero: 'mago', color: '#3d2f7a', tunica: true, baston: true },
      fijo: { x: this.orbe.x * R - 22, y: (this.orbe.y + 2) * R + 6 } });
    for (const a of this.mc.agentes.values()) {
      const vivo = a.estado === 'trabajando' || a.esperando;
      if (!vivo && !(a.fin && ahora - a.fin < 25000)) continue;
      const sala = a.padre ? 'subagentes' : a.tarea ? (this.porRol.taller ? 'taller' : 'principal') : 'principal';
      quiere.set('a:' + a.id, { tipo: 'agente', agente: a, nombre: String(a.nombre || a.id).replace(/^⏰\s*/, ''), sala, nace: a.padre ? 'principal' : null,
        look: look(a.id, a.tarea ? { sombrero: 'casco', color: '#f5c542', ropa: '#3b6fb6', pantalon: '#3b6fb6', capa: null, mochila: false } : a.padre ? {} : { tunica: true, ropa: '#3f5fb0', ropa2: '#9fd0ff', sombrero: 'mago', color: '#2f4a8f', capa: null, mochila: false }) });
    }
    if (this.porRol.servidores) (this.plugins || []).forEach(p => quiere.set('p:' + p.nombre, { tipo: 'plugin', plugin: p, nombre: p.nombre, sala: 'servidores', look: { piel: '#7ab04f', pelo: '#4e7f33', estilo: 'calvo', ropa: '#6b4f2c', pantalon: '#4a3820', orejas: true } }));
    if (this.porRol.taller) (this.tareas || []).slice(0, 3).forEach(t => quiere.set('t:' + t.id, { tipo: 'tarea', tarea: t, nombre: t.nombre, sala: 'taller', look: look(t.id, { sombrero: 'casco', color: '#e8ecef', ropa: '#5d6b4a', pantalon: '#3a4030', capa: null, mochila: false }) }));
    for (const [id, e] of this.ents) if (!quiere.has(id)) { if (!e.sale) e.sale = ahora; }
    for (const [id, q] of quiere) {
      const e = this.ents.get(id);
      if (e) { Object.assign(e, { agente: q.agente, plugin: q.plugin, tarea: q.tarea, nombre: q.nombre }); e.sale = 0; continue; }
      q.look.k = mmHash(JSON.stringify(q.look));
      const t = q.fijo ? null : (this.porRol[q.nace] && this.porRol[q.sala] ? this.puntoEn(this.porRol[q.nace]) : this.puntoEn(this.porRol[q.sala] || this.porRol.principal));
      const p = q.fijo || { x: t.x * R + R / 2, y: t.y * R + R * .8 };
      this.ents.set(id, { id, ...q, x: p.x, y: p.y, ruta: [], espera: Math.random() * 2000, frame: 0, dir: q.fijo ? 'lado' : 'abajo', izq: false, nace: ahora, parpHasta: 0, proxParp: ahora + Math.random() * 4000 });
    }
    for (const [id, e] of this.ents) if (e.sale && ahora - e.sale > 1500) { this.ents.delete(id); this.etiqueta(e, true); }
    this.hud();
  },
  puntoEn(s) {
    for (let k = 0; k < 40; k++) {
      const x = s.x + 1 + Math.floor(Math.random() * Math.max(1, s.w - 2)), y = s.y + 1 + Math.floor(Math.random() * Math.max(1, s.h - 2)), i = y * this.m.ancho + x;
      if (this.g[i] === 1 && !this.bloq[i]) return { x, y };
    }
    return { x: s.x + (s.w >> 1), y: s.y + (s.h >> 1) };
  },
  // camino por las casillas libres (BFS; el mapa es pequeño)
  camino(a, b) {
    const A = this.m.ancho, ini = a.y * A + a.x, fin = b.y * A + b.x, prev = new Int32Array(this.g.length).fill(-1), cola = [ini]; prev[ini] = ini;
    while (cola.length) { const i = cola.shift(); if (i === fin) break;
      for (const d of [1, -1, A, -A]) { const j = i + d; if (j < 0 || j >= this.g.length || prev[j] !== -1 || (d === 1 && j % A === 0) || (d === -1 && i % A === 0)) continue;
        if (this.g[j] !== 1 || (this.bloq[j] && j !== fin)) continue; prev[j] = i; cola.push(j); } }
    if (prev[fin] === -1) return [];
    const r = []; for (let i = fin; i !== ini; i = prev[i]) r.push({ x: i % A, y: Math.floor(i / A) }); return r.reverse();
  },
  mover(e, dt, t) {
    const R = MM_R, ahora = Date.now();
    if (ahora > e.proxParp) { e.parpHasta = ahora + 130; e.proxParp = ahora + 2500 + Math.random() * 4000; }
    if (e.fijo) { e.x = e.fijo.x; e.y = e.fijo.y; e.acc = e.trabajando ? 'conjura' : 'quieto'; e.frame = Math.floor(t / 700) % 2; return; }
    const ocupado = e.trabajando && !e.agente?.esperando;
    if (!e.ruta.length) {
      e.espera -= dt;
      e.acc = ocupado || (e.tipo === 'plugin' && (mmHash(e.id) + Math.floor(t / 4000)) % 2) ? 'trabaja' : 'quieto';
      e.frame = e.acc === 'trabaja' ? Math.floor(t / 220) % 2 : Math.floor(t / 700) % 2;
      if (e.acc === 'trabaja' && e.dir === 'arriba') e.dir = 'abajo';
      if (e.espera > 0) return;
      const s = this.porRol[e.sala] || this.porRol.principal, dest = this.puntoEn(s);
      e.ruta = this.camino({ x: Math.floor(e.x / R), y: Math.floor((e.y - 4) / R) }, dest);
      const aqui = this.sala[Math.floor((e.y - 4) / R) * this.m.ancho + Math.floor(e.x / R)];
      if (!e.ruta.length && aqui !== s.id) { e.x = dest.x * R + R / 2; e.y = dest.y * R + R * .8; e.nace = Date.now(); }   // sin pasillo hasta su sala: aparece allí
      e.espera = (ocupado ? 3000 : 1500) + Math.random() * (ocupado ? 6000 : 4000);
      return;
    }
    const n = e.ruta[0], tx = n.x * R + R / 2, ty = n.y * R + R * .8, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), v = (e.tipo === 'plugin' ? 40 : 56) * dt / 1000;
    if (d <= v) { e.x = tx; e.y = ty; e.ruta.shift(); } else { e.x += dx / d * v; e.y += dy / d * v; }
    if (Math.abs(dx) > Math.abs(dy)) { e.dir = 'lado'; e.izq = dx < 0; } else if (Math.abs(dy) > .5) e.dir = dy < 0 ? 'arriba' : 'abajo';
    e.acc = 'anda'; e.paso = (e.paso || 0) + dt; e.frame = Math.floor(e.paso / 130) % 4;
    if (e.frame !== e.ultFrame && e.frame % 2 === 1 && this.parts.length < 500) this.parts.push({ x: e.x + (Math.random() - .5) * 6, y: e.y, vx: (Math.random() - .5) * 10, vy: -6, vida: 0, max: 500, tam: 2, col: '170,160,140', tipo: 'polvo' });
    e.ultFrame = e.frame;
  },
  // ---------- dibujo ----------
  cuadro(t) {
    this.raf = 0; if (!this.caja || !this.cv?.isConnected) return;
    const dt = Math.min(100, t - (this.tAnt || t));
    if (dt < 28 && this.tAnt) { this.raf = requestAnimationFrame(x => this.cuadro(x)); return; }   // ~35 fps: de sobra y gasta menos
    this.tAnt = t;
    if (!this.pausa) this.dibujar(t, dt);
    this.raf = requestAnimationFrame(x => this.cuadro(x));
  },
  dibujar(t, dt) {
    const c = this.c, e = this.est, R = MM_R, ahora = Date.now(), vivos = [...this.mc.agentes.values()].filter(a => a.estado === 'trabajando');
    e.orbe += ((vivos.length ? Math.min(1, .5 + vivos.length * .15) : .1) - e.orbe) * Math.min(1, dt / 600);
    e.memoria *= Math.exp(-dt / 900); e.bahia = vivos.filter(a => a.padre).length;
    for (const x of this.ents.values()) { x.trabajando = x.agente ? x.agente.estado === 'trabajando' : x.tipo === 'apolo' ? vivos.length > 0 : false; this.mover(x, dt, t); }
    c.globalCompositeOperation = 'source-over'; c.drawImage(this.fondo, 0, 0);
    // objetos de pared primero; luego lo que está en el suelo y los personajes, ordenados por su base
    const luces = [], cosas = [];
    for (const o of this.m.objetos) { const d = MM_OBJ[o.tipo]; if (!d) continue; const X = o.x * R, Y = o.y * R - d.alto; cosas.push({ o, d, X, Y, base: d.bloq ? (o.y + d.h) * R - 2 : -1 }); if (d.luz) luces.push(...d.luz(o, X, Y, t, e)); }
    for (const p of this.ents.values()) cosas.push({ p, base: p.y });
    cosas.sort((a, b) => a.base - b.base);
    for (const k of cosas) {
      if (k.o) { c.drawImage(mmSpriteObjeto(k.o), k.X, k.Y); k.d.vivo?.(c, k.X, k.Y, t, e, k.o); continue; }
      const p = k.p, alfa = p.sale ? Math.max(0, 1 - (ahora - p.sale) / 1500) : Math.min(1, (ahora - p.nace) / 500);
      c.globalAlpha = alfa;
      c.fillStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(p.x, p.y, 13, 5, 0, 0, 7); c.fill();
      if (this.sel?.p === p || this.encima === p) { c.strokeStyle = this.tema.borde; c.lineWidth = 1; c.globalAlpha = alfa * (.6 + Math.sin(t / 200) * .3); c.beginPath(); c.ellipse(p.x, p.y, 18, 7, 0, 0, 7); c.stroke(); c.globalAlpha = alfa; }
      const sp = mmPJ(p.look, p.dir, p.frame, p.acc || 'quieto', ahora < p.parpHasta);
      const E = 1.5, bx = Math.round(p.x - 14 * E), by = Math.round(p.y - 50 * E);                       // a 1,5×: el tamaño de la referencia
      if (p.dir === 'lado' && p.izq) { c.save(); c.translate(bx + 28 * E, by); c.scale(-1, 1); c.drawImage(sp, 0, 0, 28 * E, 54 * E); c.restore(); } else c.drawImage(sp, bx, by, 28 * E, 54 * E);
      c.globalAlpha = 1;
      if (p.look.sombrero === 'casco' && p.dir !== 'arriba') luces.push({ x: p.x + (p.dir === 'lado' ? (p.izq ? -9 : 9) : 0), y: p.y - 66, r: 46, col: [255, 240, 190], a: .45 });
      if (p.look.baston) luces.push({ x: p.x + (p.acc === 'conjura' ? 0 : 6), y: p.y - (p.acc === 'conjura' ? 87 : 66), r: p.trabajando ? 70 : 34, col: [130, 240, 255], a: p.trabajando ? .7 : .35, bloom: p.trabajando ? 10 : 0 });
    }
    // luz: ambiente + salas + fuentes → se multiplica sobre la escena
    const L = this.lc, A = this.tema.amb, lw = this.luz.width, lh = this.luz.height;
    L.globalCompositeOperation = 'source-over'; L.fillStyle = `rgb(${A[0]},${A[1]},${A[2]})`; L.fillRect(0, 0, lw, lh);
    L.globalCompositeOperation = 'lighter';
    L.fillStyle = `rgba(255,236,210,${this.tema.sala})`; for (const s of this.m.salas) L.fillRect(s.x * R / 2, s.y * R / 2, s.w * R / 2, s.h * R / 2);
    const rayos = this.rayos(t);
    for (const r of rayos) luces.push({ x: r[2], y: r[3], r: 40, col: [140, 230, 255], a: .6 });
    for (const l of luces) { const g = L.createRadialGradient(l.x / 2, l.y / 2, 0, l.x / 2, l.y / 2, l.r / 2); g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${l.a})`); g.addColorStop(.45, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${l.a * .38})`); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect((l.x - l.r) / 2, (l.y - l.r) / 2, l.r, l.r); }
    if (e.panico) { L.globalCompositeOperation = 'source-over'; L.fillStyle = `rgba(255,40,60,${.12 + Math.sin(t / 300) * .06})`; L.fillRect(0, 0, lw, lh); }
    c.globalCompositeOperation = 'multiply'; c.imageSmoothingEnabled = true; c.drawImage(this.luz, 0, 0, this.W, this.H); c.imageSmoothingEnabled = false;
    // brillo (bloom), rayos y partículas: suman luz
    c.globalCompositeOperation = 'lighter';
    for (const l of luces) if (l.bloom) { const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.bloom); g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},.55)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(l.x - l.bloom, l.y - l.bloom, l.bloom * 2, l.bloom * 2); }
    for (const r of rayos) mmRayo(c, r[0], r[1], r[2], r[3], r[4], r[5]);
    this.particulas(c, t, dt);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.vin, 0, 0);
    for (const p of this.ents.values()) { this.burbuja(c, p, t); this.etiqueta(p); }
    if (this.sel) this.seguirHolo();
  },
  rayos(t) {
    const o = this.orbe, R = MM_R, ox = o.x * R + 32, oy = o.y * R + 14, r = [];
    if (!this.semilla || t - this.tRayo > 85) { this.semilla = (Math.random() * 1e6) | 0; this.tRayo = t; }
    let k = 0;
    for (const p of this.ents.values()) { if (!p.trabajando || p.tipo === 'apolo' || p.sale) continue; r.push([ox, oy, p.x, p.y - 33, this.semilla + k++ * 13, 1]); }
    const a = this.ents.get('apolo'); if (a?.trabajando) r.push([a.x, a.y - 90, ox - 8, oy - 4, this.semilla + 99, .6]);
    return r;
  },
  particulas(c, t, dt) {
    const P = this.parts, R = MM_R, e = this.est;
    if (P.length < 480) {
      for (const o of this.m.objetos) {
        if (o.tipo === 'antorcha' && Math.random() < dt / 260) P.push({ x: o.x * R + 16 + (Math.random() - .5) * 4, y: o.y * R + 2, vx: (Math.random() - .5) * 8, vy: -18 - Math.random() * 14, vida: 0, max: 900 + Math.random() * 700, tam: 1, col: '255,170,70', tipo: 'brasa' });
        else if (o.tipo === 'orbe' && Math.random() < dt / (120 - e.orbe * 80)) { const a = Math.random() * 6.28; P.push({ x: o.x * R + 32 + Math.cos(a) * 14, y: o.y * R + 14 + Math.sin(a) * 14, vx: Math.cos(a) * 10, vy: -8 - Math.random() * 10, vida: 0, max: 1200, tam: 1, col: '150,240,255', tipo: 'chispa' }); }
        else if (o.tipo === 'impresora' && Math.random() < dt / 700) P.push({ x: o.x * R + 20 + Math.random() * 56, y: o.y * R + 50, vx: (Math.random() - .5) * 30, vy: -10, vida: 0, max: 400, tam: 1, col: '255,200,90', tipo: 'brasa' });
      }
      if (Math.random() < dt / 300) { const s = this.m.salas[Math.random() * this.m.salas.length | 0]; P.push({ x: (s.x + Math.random() * s.w) * R, y: (s.y + Math.random() * s.h) * R, vx: (Math.random() - .5) * 4, vy: -2 - Math.random() * 3, vida: 0, max: 5000, tam: 1, col: '230,220,200', tipo: 'mota' }); }
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.vida += dt; if (q.vida > q.max) { P.splice(i, 1); continue; }
      q.x += q.vx * dt / 1000 + (q.tipo === 'brasa' ? Math.sin((q.vida + i * 50) / 120) * .25 : 0); q.y += q.vy * dt / 1000;
      const f = 1 - q.vida / q.max, a = q.tipo === 'mota' ? Math.sin(f * Math.PI) * .35 : q.tipo === 'polvo' ? f * .35 : f;
      if (q.tipo === 'polvo') { c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgba(${q.col},${a})`; c.beginPath(); c.arc(q.x, q.y - 1, 2 + (1 - f) * 3, 0, 7); c.fill(); c.globalCompositeOperation = 'lighter'; continue; }
      c.fillStyle = `rgba(${q.col},${a})`; c.fillRect(Math.round(q.x), Math.round(q.y), q.tam, q.tam);
      if (q.tipo !== 'mota') { c.fillStyle = `rgba(${q.col},${a * .25})`; c.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3); }
    }
  },
  burbuja(c, p, t) {
    const a = p.agente; let s = null;
    if (a?.esperando) s = '!'; else if (a && a.estado !== 'trabajando') s = a.estado === 'listo' ? '✓' : '×';
    else if (a?.herramienta) s = '?'; else if (p.trabajando && p.tipo !== 'apolo') s = '…';
    if (!s) return;
    const alto = p.look.sombrero === 'mago' ? (p.acc === 'conjura' ? 100 : 92) : p.look.sombrero ? 70 : 66;
    c.globalAlpha = p.sale ? Math.max(0, 1 - (Date.now() - p.sale) / 1500) : 1;
    mmBurbuja(c, p.x + 10, p.y - alto + (s === '!' ? Math.round(Math.sin(t / 110)) : 0), s, t); c.globalAlpha = 1;
  },
  // nombre encima de agentes y subagentes (HTML: nítido a cualquier tamaño)
  etiqueta(p, quitar) {
    if (!p.el && (quitar || p.tipo !== 'agente')) return;
    if (quitar) { p.el?.remove(); return; }
    if (!p.el) { p.el = document.createElement('span'); p.el.className = 'mm-nombre'; p.el.textContent = p.nombre.length > 22 ? p.nombre.slice(0, 21) + '…' : p.nombre; this.capaNombres.append(p.el); }
    const alto = p.look.sombrero === 'mago' ? 100 : 74;
    p.el.style.left = `${((p.x - 4) / this.W * 100).toFixed(2)}%`; p.el.style.top = `${((p.y - alto) / this.H * 100).toFixed(2)}%`;
    p.el.style.opacity = p.sale ? Math.max(0, 1 - (Date.now() - p.sale) / 1500) : 1;
  },
  // ---------- interacción ----------
  punto(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H }; },
  enPunto(x, y) {
    let mejor = null, md = 20;
    for (const p of this.ents.values()) { const d = Math.hypot(p.x - x, p.y - 30 - y); if (d < md + 8) { md = d; mejor = { p }; } }
    if (mejor) return mejor;
    for (const o of this.m.objetos) { const d = MM_OBJ[o.tipo]; if (d && ['orbe', 'rack', 'impresora', 'estanteria'].includes(o.tipo) && x >= o.x * MM_R && x < (o.x + d.w) * MM_R && y >= o.y * MM_R - d.alto && y < (o.y + d.h) * MM_R) return { o }; }
    return null;
  },
  clic(e) { const p = this.punto(e), h = this.enPunto(p.x, p.y); if (!h) return this.cerrarHolo(); this.abrirHolo(h); },
  abrirHolo(h) {
    const det = $('.mm-holo', this.caja), ags = [...this.mc.agentes.values()], vivos = ags.filter(a => a.estado === 'trabajando');
    let col = this.tema.borde, cab, cuerpo = '';
    const fila = (k, v) => `<div class="mm-fila"><span>${tr(k)}</span><b>${v}</b></div>`;
    if (h.p?.tipo === 'agente') {
      const a = h.p.agente; col = a.esperando ? '#ff4d6a' : a.padre ? '#7fd1ff' : a.tarea ? '#f5c542' : '#a58bff';
      cab = [h.p.nombre, `${nombreModelo(a.modelo)}${a.padre ? ` · ${tr('subagente')}` : a.tarea ? ` · ${tr('tarea programada')}` : a.canal ? ` · ${a.canal}` : ''}`];
      cuerpo = fila('Estado', tr(a.esperando ? 'Esperando tu permiso' : (ESTADO_AG[a.estado] || ESTADO_AG.quieto)[1])) +
        (a.herramienta ? fila('Haciendo', `${esc(NOMBRE_HERR[a.herramienta.nombre] || a.herramienta.nombre)} <small>${esc(String(a.herramienta.resumen || '').slice(0, 120))}</small>`) : a.ultimo ? fila('Último', esc(String(a.ultimo).slice(0, 160))) : '') +
        fila('Tiempo', a.inicio ? cronoTxt((a.fin || Date.now()) - a.inicio) : '—') + fila('Pasos', a.pasos || 0) + (a.uso?.entrada ? fila('Tokens', fmtK(a.uso.entrada + a.uso.salida)) : '') +
        `<div class="mm-acc">${a.estado === 'trabajando' ? `<button class="btn mini mal" data-parar="${esc(a.id)}">${ic('parar')}${tr('Detener')}</button>` : ''}<a class="btn mini" href="#/chat/${esc(a.id)}">${tr('Abrir')} ${ic('der')}</a></div>`;
    } else if (h.p?.tipo === 'apolo' || h.o?.tipo === 'orbe') {
      col = '#7ff3ff'; cab = ['APOLO', tr('Agente orquestador')];
      cuerpo = fila('Trabajando', vivos.filter(a => !a.padre).length) + fila('Subagentes', vivos.filter(a => a.padre).length) + fila('Esperan permiso', ags.filter(a => a.esperando).length) +
        fila('Terminados (6 h)', ags.filter(a => a.fin).length);
    } else if (h.p?.tipo === 'plugin') { col = '#8fdc5a'; cab = [h.p.nombre, `plugin ${h.p.plugin.version || ''}`]; cuerpo = `<div class="mm-txt">${esc(h.p.plugin.descripcion || '')}</div>${fila('Permisos', esc((h.p.plugin.permisos || []).join(', ') || '—'))}`; }
    else if (h.p?.tipo === 'tarea') { const t = h.p.tarea; col = '#f5c542'; cab = [h.p.nombre, tr('Tarea programada')]; cuerpo = `<div class="mm-txt">${esc(String(t.accion?.texto || '').slice(0, 260))}</div>${fila('Próxima', t.proxima ? new Date(t.proxima).toLocaleString(I18N.locale()) : '—')}${fila('Último resultado', esc(String(t.ultimoResultado || '—').slice(0, 80)))}`; }
    else if (h.o?.tipo === 'rack') { cab = [tr('Núcleo'), tr('Sala de servidores')]; cuerpo = fila('CPU', `${Math.round(this.est.cpu * 100)}%`) + fila('RAM', `${(this.est.ram * this.est.ramTot / 1e9).toFixed(1)} / ${(this.est.ramTot / 1e9).toFixed(0)} GB`) + fila('Plugins activos', (this.plugins || []).length); }
    else if (h.o?.tipo === 'impresora') { col = '#ff8a3d'; cab = [tr('Taller'), tr('Turno de noche y tareas')]; const tu = this.turno; cuerpo = fila('Turno de noche', tu?.activo ? `${Math.round(this.est.progreso * 100)}%` : tr('parado')) + fila('En cola', tu?.cola?.length || 0) + fila('Tareas activas', (this.tareas || []).length) + `<div class="mm-acc"><a class="btn mini" href="#/turno">${tr('Turno de noche')} ${ic('der')}</a></div>`; }
    else if (h.o?.tipo === 'estanteria') { col = '#ff5c7a'; cab = [tr('Memoria'), tr('Biblioteca')]; cuerpo = `<div class="mm-txt">${tr('Brilla en rojo cuando APOLO lee o guarda recuerdos.')}</div><div class="mm-acc"><a class="btn mini" href="#/memoria/grafo">${tr('Ver el grafo')} ${ic('der')}</a></div>`; }
    if (!cab) return;
    this.sel = h; det.hidden = false; det.classList.remove('on', 'sale'); det.style.setProperty('--holo', col);
    det.innerHTML = `<div class="mv-holo-c"><div class="mv-holo-cab" style="--i:0"><div class="mv-ent"><i style="background:${col}"></i><div><b>${esc(cab[0])}</b><small>${esc(cab[1])}</small></div></div><button class="mv-holo-x">×</button></div><div class="mv-holo-cuerpo" style="--i:1">${cuerpo}</div></div>`;
    void det.offsetWidth; det.classList.add('on'); this.posHolo = null; this.seguirHolo();
    det.onclick = async ev => {
      if (ev.target.closest('.mv-holo-x')) return this.cerrarHolo();
      const b = ev.target.closest('[data-parar]'); if (!b) return; b.disabled = true;
      try { await api('POST', `/sesiones/${b.dataset.parar}/cancelar`); aviso(tr('Detenido')); } catch (er) { aviso(er.message, true); b.disabled = false; }
    };
  },
  seguirHolo() {
    const det = this.caja && $('.mm-holo', this.caja); if (!det || det.hidden || !this.sel) return;
    const h = this.sel, d = h.o && MM_OBJ[h.o.tipo], px = h.p ? h.p.x : (h.o.x + d.w / 2) * MM_R, py = h.p ? h.p.y - 36 : h.o.y * MM_R + 8;
    const caja = det.parentElement, W = caja.clientWidth, H = caja.clientHeight, k = W / this.W, sx = px * k, sy = py * k, cw = det.offsetWidth, ch = det.offsetHeight;
    let x = sx + 34; if (x + cw > W - 8) x = sx - 34 - cw; x = Math.max(8, Math.min(W - cw - 8, x));
    const y = Math.max(8, Math.min(H - ch - 8, sy - ch * .35));
    const q = this.posHolo || (this.posHolo = { x, y }); q.x += (x - q.x) * .25; q.y += (y - q.y) * .25;
    det.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
    if (h.p && !this.ents.has(h.p.id)) this.cerrarHolo();
  },
  cerrarHolo() {
    const det = this.caja && $('.mm-holo', this.caja); this.sel = null; if (!det || det.hidden) return;
    det.classList.add('sale'); setTimeout(() => { if (det.classList.contains('sale')) { det.hidden = true; det.classList.remove('on', 'sale'); } }, 260);
  },
  async accion(a, b) {
    if (a === 'pausa') { this.pausa = !this.pausa; b.textContent = this.pausa ? '▶' : '❚❚'; return; }
    if (a === 'estop') {
      const vivos = [...this.mc.agentes.values()].filter(x => x.estado === 'trabajando' && !x.padre);
      if (!vivos.length) return aviso(tr('No hay agentes trabajando'));
      if (!b.classList.contains('arma')) { b.classList.add('arma'); b.textContent = tr('¿SEGURO?'); setTimeout(() => { b.classList.remove('arma'); b.textContent = 'E-STOP'; }, 3000); return; }
      b.classList.remove('arma'); b.textContent = 'E-STOP';
      await Promise.all(vivos.map(x => api('POST', `/sesiones/${x.id}/cancelar`).catch(() => null)));
      this.apuntar('ticker', tr('E-STOP: {n} agentes detenidos', { n: vivos.length }), 'aviso'); return;
    }
    if (a === 'panico') {
      try { if (this.est.panico) await api('POST', '/panico/reanudar', {}); else await api('POST', '/panico', { origen: 'mission-control' }); } catch (er) { return aviso(er.message, true); }
      return this.cargarDatos();
    }
    if (a === 'editar') return this.editor();
  },
  // ---------- crea tu mundo ----------
  async editor() {
    let nuevo = null;
    const r = await modal({ titulo: 'Tu mundo de Mission Control', ancho: 620,
      cuerpo: `<p class="suave" style="margin-top:0">${tr('Describe cómo quieres que sea y APOLO lo dibuja: una nave espacial, una oficina, un castillo, un laboratorio… Siempre tendrá la sala del agente principal (con su orbe), la bahía de subagentes, los servidores y el taller.')}</p>
        <textarea id="mmDesc" rows="4" style="width:100%" placeholder="${tr('Ej.: una estación espacial con el puente de mando en el centro, un hangar enorme para los subagentes, la sala de reactores y un laboratorio')}"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn pri" id="mmGen">${ic('chispa')}${tr('Generar con APOLO')}</button>
          <button class="btn" id="mmExp">${ic('abajo')}${tr('Exportar JSON')}</button><label class="btn">${ic('arriba')}${tr('Importar JSON')}<input type="file" id="mmImp" accept=".json,application/json" hidden></label></div>
        <div id="mmEst" class="suave"></div>
        ${this.propio ? `<p class="suave" style="margin-bottom:0">${tr('Ahora usas tu propio mundo.')}</p>` : ''}`,
      botones: [...(this.propio ? [{ txt: 'Volver al original', valor: 'reset' }] : []), { txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: () => nuevo ? 'guardar' : (aviso(tr('Genera o importa un mundo primero'), true), false) }],
      alAbrir: v => {
        const est = $('#mmEst', v);
        const probar = m => { nuevo = m; this.cargar(m); est.innerHTML = `${ic('check')} ${tr('Listo: «{n}». Lo ves detrás; pulsa Guardar para quedártelo.', { n: esc(m.nombre) })}`; };
        $('#mmGen', v).onclick = async e => {
          const d = $('#mmDesc', v).value.trim(); if (!d) return aviso(tr('Describe tu mundo primero'), true);
          e.target.disabled = true; est.textContent = tr('APOLO está diseñando tu mundo… (puede tardar un minuto)');
          try { probar((await api('POST', '/mundo/generar', { descripcion: d })).mundo); } catch (er) { est.textContent = er.message; } finally { e.target.disabled = false; }
        };
        $('#mmExp', v).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(nuevo || this.m, null, 1)], { type: 'application/json' })); a.download = 'mundo-apolo.json'; a.click(); };
        $('#mmImp', v).onchange = async e => { try { const m = JSON.parse(await e.target.files[0].text()); if (!m.salas) throw new Error(tr('no es un mundo de APOLO')); probar(m); } catch (er) { est.textContent = er.message; } };
      } });
    if (r === 'guardar' && nuevo) { const x = await api('PUT', '/mundo', { mundo: nuevo }); this.propio = true; this.cargar(x.mundo); aviso(tr('Mundo guardado')); }
    else if (r === 'reset') { const x = await api('DELETE', '/mundo'); this.propio = false; this.cargar(x.mundo); }
    else if (nuevo) { const x = await api('GET', '/mundo'); this.cargar(x.mundo); }   // cancelado: vuelve el que había
  },
};
