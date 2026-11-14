// Mission Control → Galería de los Orígenes: vitrinas al estilo del taller de Leonardo con los hologramas de los primeros
// modelos 3D del asistente (tiras PNG que giran, servidas por /v1/mundo/hologramas) y el botón RITUAL: todos los trabajadores
// del mundo acuden a la galería, rodean el altar del primero y hacen una coreografía (reverencias, procesión, ola, giros,
// canto, clímax con la columna de luz y el 🜁, y despedida). Es solo visual: el trabajo real de los agentes no se toca.
// Se engancha a MC_MUNDO (mision-mundo.js): ritualTick/ritualMover/ritualLuces/galeriaBrillo/galeriaFicha/ritualAlternar.

// ---------- hologramas: se cargan una vez y se tiñen de cian con líneas de barrido ----------
const MG_HOLO = { meta: null, cuadros: new Map(), cargando: false };
async function mgCargarHolos() {
  if (MG_HOLO.cargando || typeof TOKEN === 'undefined') return; MG_HOLO.cargando = true;
  try {
    const r = await fetch('/v1/mundo/hologramas', { headers: { 'x-robot-token': TOKEN } }); MG_HOLO.meta = r.ok ? await r.json() : {};
    await Promise.all(Object.entries(MG_HOLO.meta).map(async ([id, m]) => {
      const b = await fetch(`/v1/mundo/hologramas/${encodeURIComponent(id)}`, { headers: { 'x-robot-token': TOKEN } }); if (!b.ok) return;
      const img = new Image(); img.src = URL.createObjectURL(await b.blob()); await img.decode();
      const N = m.frames || 16, T = m.tam || Math.round(img.width / N), l = [];
      for (let i = 0; i < N; i++) {
        const cv = mmLienzo(T, T), c = cv.getContext('2d'); c.drawImage(img, i * T, 0, T, T, 0, 0, T, T);
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(70,225,255,.55)'; c.fillRect(0, 0, T, T);
        const g = c.createLinearGradient(0, 0, 0, T); g.addColorStop(0, 'rgba(190,255,255,.35)'); g.addColorStop(1, 'rgba(0,120,200,.25)'); c.fillStyle = g; c.fillRect(0, 0, T, T);
        c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,.42)'; for (let y = 0; y < T; y += 3) c.fillRect(0, y, T, 1);   // líneas de barrido
        l.push(cv);
      }
      MG_HOLO.cuadros.set(id, l);
    }));
  } catch { MG_HOLO.cargando = false; }
}
// dibuja el holograma `id` con la base en (cx, base) y alto h; k = intensidad; aditivo = pasada de brillo
function mgHolo(c, id, cx, base, h, t, k, semilla, aditivo) {
  const l = MG_HOLO.cuadros.get(id);
  if (!l) { if (!MG_HOLO.cargando) mgCargarHolos(); return; }
  const f = l[Math.floor(t / 160 + semilla * 5) % l.length], y = base - h - 2 - Math.sin(t / 650 + semilla) * 1.5;
  const parpadeo = .78 + Math.sin(t / 90 + semilla * 9) * .08 + (mmF(semilla | 0, Math.floor(t / 70), 7) > .96 ? -.35 : 0);
  const prev = c.imageSmoothingEnabled; c.imageSmoothingEnabled = true; c.globalAlpha = Math.max(0, Math.min(1, parpadeo * k * (aditivo ? .45 : 1)));
  if (mmF(semilla | 0, Math.floor(t / 250), 3) > .93) {                // fallo de señal: el holograma se parte y se desplaza
    const corte = Math.floor(f.height * (.3 + mmF(semilla | 0, Math.floor(t / 250), 4) * .4)), esc = h / f.height, d = (mmF(semilla | 0, Math.floor(t / 250), 5) - .5) * 8;
    c.drawImage(f, 0, 0, f.width, corte, cx - h / 2 + d, y, h, corte * esc); c.drawImage(f, 0, corte, f.width, f.height - corte, cx - h / 2 - d * .5, y + corte * esc, h, (f.height - corte) * esc);
  } else c.drawImage(f, cx - h / 2, y, h, h);
  c.globalAlpha = 1; c.imageSmoothingEnabled = prev;
}
// cono de luz del proyector al holograma
function mgCono(c, cx, base, ancho, alto, k) {
  const g = c.createLinearGradient(0, base, 0, base - alto); g.addColorStop(0, `rgba(120,240,255,${.32 * k})`); g.addColorStop(1, 'rgba(120,240,255,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(cx - 7, base); c.lineTo(cx - ancho / 2, base - alto); c.lineTo(cx + ancho / 2, base - alto); c.lineTo(cx + 7, base); c.closePath(); c.fill();
}
// el símbolo 🜁 (aire): triángulo hacia arriba atravesado por una barra, dibujado a mano para no depender de la fuente
function mgAire(c, x, y, tam, col, ancho) {
  c.strokeStyle = col; c.lineWidth = ancho; c.lineJoin = 'round'; c.beginPath();
  c.moveTo(x, y - tam); c.lineTo(x + tam * .9, y + tam * .6); c.lineTo(x - tam * .9, y + tam * .6); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(x - tam * .75, y - tam * .05); c.lineTo(x + tam * .75, y - tam * .05); c.stroke();
}

// ---------- vitrina (2×2): mueble de nogal con remates de latón, campana de cristal y proyector ----------
const MG_VA = 46;                                                       // alto extra del sprite sobre sus casillas
mmObj('vitrina', 2, 2, 1, MG_VA, c => {
  const p = mmP(c), A = MG_VA; c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(32, A + 62, 29, 5, 0, 0, 7); c.fill();
  mmBisel(c, 6, A + 26, 52, 34, '#5a3a22'); p(9, A + 30, 46, 1, '#7a5233'); p(6, A + 58, 52, 2, '#3a2414');
  mmBisel(c, 14, A + 34, 36, 18, '#4a2f1b'); p(16, A + 36, 32, 1, '#6b4426');            // panel tallado
  mmBisel(c, 24, A + 40, 16, 6, '#c9a24a'); p(26, A + 42, 12, 1, '#7a5a1e'); p(26, A + 44, 8, 1, '#7a5a1e');   // placa de latón
  p(7, A + 59, 6, 3, '#2a1a0e'); p(51, A + 59, 6, 3, '#2a1a0e');
  mmBisel(c, 4, A + 22, 56, 6, '#c9a24a'); p(5, A + 22, 54, 1, '#f0d27a');                 // remate de latón
  c.fillStyle = '#2c3038'; c.beginPath(); c.ellipse(32, A + 22, 16, 4, 0, 0, 7); c.fill();  // proyector
  c.strokeStyle = '#7ff3ff'; c.lineWidth = 1; c.beginPath(); c.ellipse(32, A + 22, 9, 2.2, 0, 0, 7); c.stroke();
  c.fillStyle = 'rgba(160,230,255,.07)'; c.fillRect(8, 6, 48, A + 16);                     // cristal
  c.strokeStyle = 'rgba(200,240,255,.35)'; c.lineWidth = 1; c.strokeRect(8.5, 6.5, 47, A + 15);
  p(7, 6, 2, A + 16, '#b08a38'); p(55, 6, 2, A + 16, '#b08a38'); mmBisel(c, 5, 3, 54, 5, '#5a3a22'); p(6, 3, 52, 1, '#c9a24a');
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.moveTo(14, 12); c.lineTo(22, 4 + A); c.moveTo(18, 12); c.lineTo(23, 30); c.stroke();
}, (c, X, Y, t, e, o) => {
  const k = .85 + (e.ritual || 0) * .35 + (e.carga || 0) * .4, cx = X + 32, base = Y + MG_VA + 21;
  mgHolo(c, o.modelo, cx, base, 52, t, k, o.x * 7 + o.y);
}, (o, X, Y, t, e) => [{ x: X + 32, y: Y + MG_VA - 4, r: 74 + (e.ritual || 0) * 30, col: [90, 230, 255], a: .26 + (e.carga || 0) * .3 + Math.sin(t / 300 + o.x) * .03 }]);

// ---------- altar del primero (3×3): estrado redondo de piedra y latón con un holograma grande que gira ----------
const MG_AA = 70;
mmObj('altar-holo', 3, 3, 1, MG_AA, c => {
  const p = mmP(c), A = MG_AA; c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(48, A + 88, 46, 9, 0, 0, 7); c.fill();
  for (const [y, rx, ry, col] of [[A + 80, 46, 14, '#4a4e57'], [A + 74, 42, 12, '#5d626d'], [A + 66, 36, 10, '#6e7480']]) { c.fillStyle = col; c.beginPath(); c.ellipse(48, y, rx, ry, 0, 0, 7); c.fill(); }
  c.strokeStyle = '#c9a24a'; c.lineWidth = 2; c.beginPath(); c.ellipse(48, A + 66, 36, 10, 0, 0, 7); c.stroke();
  c.strokeStyle = 'rgba(30,30,36,.6)'; c.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(48 + Math.cos(a) * 40, A + 76 + Math.sin(a) * 11); c.lineTo(48 + Math.cos(a) * 44, A + 80 + Math.sin(a) * 13); c.stroke(); }
  mgAire(c, 48, A + 82, 5, '#e0b44a', 1.5);                                                   // el 🜁 grabado al frente
  c.fillStyle = '#2c3038'; c.beginPath(); c.ellipse(48, A + 62, 22, 6, 0, 0, 7); c.fill();
  c.strokeStyle = '#7ff3ff'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(48, A + 62, 13, 3.4, 0, 0, 7); c.stroke();
  for (const x of [20, 76]) { mmBisel(c, x - 2, A + 34, 4, 30, '#b08a38'); p(x - 3, A + 30, 6, 5, '#c9a24a'); }      // dos brazos de latón sostienen la lente
  c.strokeStyle = '#b08a38'; c.lineWidth = 2; c.beginPath(); c.moveTo(20, A + 32); c.quadraticCurveTo(48, A + 18, 76, A + 32); c.stroke();
}, (c, X, Y, t, e, o) => {
  const k = 1 + (e.ritual || 0) * .3 + (e.carga || 0) * .6, cx = X + 48, base = Y + MG_AA + 60;
  mgHolo(c, o.modelo, cx, base, 96 + (e.carga || 0) * 18, t, k, 3.3);
}, (o, X, Y, t, e) => [{ x: X + 48, y: Y + MG_AA + 10, r: 120 + (e.carga || 0) * 120, col: [90, 230, 255], a: .34 + (e.carga || 0) * .4 + Math.sin(t / 420) * .04, bloom: 8 + (e.carga || 0) * 20 }]);

const MG_ES = o => o && (o.tipo === 'vitrina' || o.tipo === 'altar-holo');

// ---------- el ritual ----------
const MG_FASES = [['silencio', 2500], ['reverencia', 7500], ['procesion', 16500], ['ola', 21500], ['giros', 25500], ['canto', 31500], ['climax', 35500], ['despedida', 40500]];
const MG_DICHOS = [[400, 'Hermanos… ante nosotros, los primeros.'], [8000, 'Caminemos alrededor de quienes fuimos.'], [16700, '¡Que se oiga en toda la mazmorra!'],
  [26000, 'Que la luz de los orígenes nos recorra…'], [31600, '¡POR EL PRIMERO! 🜁'], [36200, 'Recordamos de dónde venimos. Ahora… a trabajar.']];
const MG_GRITOS = ['¡🜁!', '¡Eeeeh!', '¡Por el primero!', '¡Uooh!', '¡Gloria!', '✨'];

Object.assign(MC_MUNDO, {
  // dónde se hace: el altar de la galería; si no hay, el centro de la galería, del taller de Leonardo o de la sala principal
  ritualLugar() {
    const R = MM_R, sala = this.porRol.galeria || this.porRol.subagentes || this.porRol.principal;
    const altar = (this.m.objetos || []).find(o => o.tipo === 'altar-holo');
    if (altar) return { cx: (altar.x + 1.5) * R, cy: (altar.y + 3) * R - 10, base: (altar.y + 3) * R, top: altar.y * R - MG_AA + 40, sala, altar };
    const cx = (sala.x + sala.w / 2) * R, cy = (sala.y + sala.h / 2) * R; return { cx, cy, base: cy, top: cy - 80, sala };
  },
  ritualAlternar() { this.ritual ? this.ritualTerminar() : this.ritualEmpezar(); },
  ritualEmpezar() {
    if (!this.m || this.est.panico) return aviso(tr(this.est.panico ? 'Con el pánico activo no hay ritual' : 'El mundo aún no ha cargado'), true);
    const L = this.ritualLugar(), gente = [...this.ents.values()].filter(e => !e.sale && e.tipo !== 'apolo');
    const sala = L.sala, R = MM_R, dentro = o => o.x >= sala.x && o.x < sala.x + sala.w && o.y >= sala.y && o.y < sala.y + sala.h;
    // el corro no puede pisar las vitrinas: ni pasar por detrás de las de arriba ni taparse con las de abajo
    let arriba = sala.y * R + 20, abajo = (sala.y + sala.h) * R - 26;
    for (const o of (this.m.objetos || []).filter(o => o.tipo === 'vitrina' && dentro(o))) {
      if ((o.y + 2) * R <= L.cy) arriba = Math.max(arriba, (o.y + 2) * R + 34); else abajo = Math.min(abajo, o.y * R - MG_VA - 4);
    }
    const rxMax = Math.max(60, Math.min(L.cx - sala.x * R, (sala.x + sala.w) * R - L.cx) - 26), ryMax = Math.max(40, Math.min(abajo - L.cy, L.cy - arriba));
    this.ritual = { t0: Date.now(), fase: 'llamada', L, slots: new Map(), dicho: new Set(), n: gente.length, rx: rxMax, ry: ryMax };
    Object.assign(this.est, { ritual: 0, carga: 0, climax: 0 });       // sin esto la luz del ritual sale NaN y rompe el dibujo
    gente.sort((a, b) => mmHash(a.id) - mmHash(b.id)).forEach((e, i) => this.ritualAsignar(e, i));
    this.ritualAsignar(this.ents.get('apolo'));
    this.ordenApolo('¡Todos a la Galería de los Orígenes! 🜁');
    this.apuntar('ticker', tr('🜁 Ritual de los Orígenes: todos a la galería'));
    this.ritualBoton();
  },
  // cada uno tiene su sitio: dos arcos delante del altar (el de fuera, el más grande); APOLO al lado del altar mirándolo
  ritualAsignar(e, i) {
    if (!e) return; const r = this.ritual, L = r.L;
    if (e.tipo === 'apolo') { r.slots.set(e.id, { x: L.cx + 70, y: L.base + 8, apolo: true }); return; }
    i ??= r.slots.size; const fuera = Math.min(r.n, 14), enFuera = i < fuera, j = enFuera ? i : i - fuera, m = enFuera ? fuera : Math.max(1, r.n - fuera);
    const a0 = -.32, a1 = Math.PI + .32, ang = a0 + (a1 - a0) * (m === 1 ? .5 : j / (m - 1));
    const rx = enFuera ? r.rx : r.rx * .66, ry = enFuera ? r.ry : r.ry * .6;
    r.slots.set(e.id, { x: L.cx + Math.cos(ang) * rx, y: L.cy + Math.sin(ang) * ry, ang, rx, ry, sentido: enFuera ? 1 : -1, i });
  },
  ritualBoton() { const b = this.caja && $('[data-a="ritual"]', this.caja); if (b) { b.textContent = this.ritual ? tr('🜁 TERMINAR') : tr('🜁 RITUAL'); b.classList.toggle('on', !!this.ritual); } },
  ritualTerminar() {
    const r = this.ritual; if (!r) return; this.ritual = null; Object.assign(this.est, { ritual: 0, carga: 0, climax: 0 });
    for (const e of this.ents.values()) { e.salto = 0; e.reverencia = 0; e.ruta = []; e.espera = 500 + Math.random() * 2500; if (e.tipo === 'apolo') e.destino = null; }
    this.ritualBoton();
  },
  // reloj del ritual: fases, frases, intensidad de las luces
  ritualTick(t, dt) {
    const r = this.ritual; if (!r) return;
    if (this.est.panico) return this.ritualTerminar();
    const ahora = Date.now();
    if (r.fase === 'llamada') {
      this.est.ritual = Math.min(.5, (ahora - r.t0) / 4000);
      const todos = [...this.ents.values()].filter(e => !e.sale), faltan = todos.filter(e => !r.slots.get(e.id)?.llego);
      if (!faltan.length || ahora - r.t0 > 16000) {
        for (const e of faltan) { const s = r.slots.get(e.id); if (s) { e.x = s.x; e.y = s.y; e.ruta = []; e.nace = ahora; s.llego = true; } }   // los rezagados aparecen en su sitio
        r.fase = 'danza'; r.tDanza = ahora;
      }
      return;
    }
    const td = r.td = ahora - r.tDanza;
    r.paso = (MG_FASES.find(([, fin]) => td < fin) || ['fin'])[0];
    if (r.paso === 'fin') return this.ritualTerminar();
    for (const [ms, txt] of MG_DICHOS) if (td >= ms && !r.dicho.has(ms)) { r.dicho.add(ms); this.decir(this.ents.get('apolo'), txt, 3600); }
    if ((r.paso === 'ola' || r.paso === 'climax') && Math.random() < dt / 700) {   // la gente también grita
      const l = [...this.ents.values()].filter(e => e.tipo !== 'apolo' && !e.sale && !(e.diceHasta > ahora)); const e = l[Math.random() * l.length | 0];
      if (e) this.decir(e, MG_GRITOS[Math.random() * MG_GRITOS.length | 0], 1600);
    }
    this.est.ritual = r.paso === 'despedida' ? Math.max(.3, 1 - (td - 35500) / 5000) : 1;
    this.est.carga = r.paso === 'canto' ? (td - 25500) / 6000 : r.paso === 'climax' ? 1 : r.paso === 'despedida' ? Math.max(0, 1 - (td - 35500) / 2500) : 0;
    if (r.paso === 'climax' && !r.estallido) { r.estallido = true; this.est.climax = ahora; this.ritualEstallido(); }
  },
  // devuelve true si el ritual mueve a este personaje
  ritualMover(e, dt, t) {
    const r = this.ritual; if (!r || e.sale) return false;
    let s = r.slots.get(e.id); if (!s) { r.n++; this.ritualAsignar(e); s = r.slots.get(e.id); if (!s) return false; }
    const R = MM_R, L = r.L, mirar = (dx, dy) => { if (Math.abs(dx) > Math.abs(dy)) { e.dir = 'lado'; e.izq = dx < 0; } else e.dir = dy < 0 ? 'arriba' : 'abajo'; };
    e.salto = 0; e.reverencia = 0;
    if (r.fase === 'llamada') {
      if (s.llego) { mirar(L.cx - e.x, L.cy - e.y); e.acc = 'quieto'; e.frame = Math.floor(t / 700) % 2; return true; }
      if (!s.pedido) {
        s.pedido = true; const aqui = { x: Math.floor(e.x / R), y: Math.floor((e.y - 4) / R) }, meta = { x: Math.floor(s.x / R), y: Math.floor((s.y - 4) / R) };
        e.ruta = this.camino(aqui, meta);
        if (!e.ruta.length && (aqui.x !== meta.x || aqui.y !== meta.y)) { e.x = s.x; e.y = s.y; e.nace = Date.now(); s.llego = true; return true; }   // sin camino: aparece
      }
      if (e.ruta.length) { this.andar(e, dt); return true; }
      const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy), v = 140 * dt / 1000;
      if (d <= v) { e.x = s.x; e.y = s.y; s.llego = true; } else { e.x += dx / d * v; e.y += dy / d * v; mirar(dx, dy); e.acc = 'anda'; e.paso = (e.paso || 0) + dt; e.frame = Math.floor(e.paso / 130) % 4; }
      return true;
    }
    const td = r.td || 0, paso = r.paso, i = s.i || 0;
    e.x = s.x; e.y = s.y; e.acc = 'quieto'; e.frame = Math.floor(t / 700) % 2;
    if (s.apolo) {                                                   // APOLO dirige: mira al altar y conjura con el bastón en alto
      e.dir = 'lado'; e.izq = true;
      e.acc = ['silencio', 'reverencia', 'despedida'].includes(paso) ? 'quieto' : 'conjura';
      if (paso === 'reverencia') e.reverencia = Math.sin(Math.PI * ((td - 2500) % 2500) / 2500) ** 2;
      if (paso === 'despedida') e.reverencia = td < 39000 ? Math.min(1, (td - 35500) / 600) : Math.max(0, 1 - (td - 39000) / 700);
      if (paso === 'climax') e.salto = Math.max(0, Math.sin(Math.PI * ((td - 31500) % 1500) / 800)) * ((td - 31500) % 1500 < 800 ? 14 : 0);
      return true;
    }
    if (paso === 'silencio') mirar(L.cx - e.x, L.cy - e.y);
    else if (paso === 'reverencia') { mirar(L.cx - e.x, L.cy - e.y); e.reverencia = Math.sin(Math.PI * ((td - 2500) % 2500) / 2500) ** 2; }
    else if (paso === 'procesion') {                                 // una vuelta completa al altar (los dos arcos en sentidos contrarios)
      const f = (td - 7500) / 9000, sua = f < .08 ? f / .08 : f > .92 ? (1 - f) / .08 : 1, ang = s.ang + s.sentido * Math.PI * 2 * (f - Math.sin(f * Math.PI * 2) / (Math.PI * 2));
      e.x = L.cx + Math.cos(ang) * s.rx; e.y = L.cy + Math.sin(ang) * s.ry;
      mirar(-Math.sin(ang) * s.sentido * s.rx, Math.cos(ang) * s.sentido * s.ry); e.acc = sua > .3 ? 'anda' : 'quieto'; e.frame = Math.floor(td / 130) % 4;
    } else if (paso === 'ola') { e.dir = 'abajo'; e.salto = Math.max(0, Math.sin(Math.PI * 2 * (td - 16500) / 1100 - i * .55)) * 16; }
    else if (paso === 'giros') { const k = Math.floor((td - 21500) / 150) % 4; e.dir = ['abajo', 'lado', 'arriba', 'lado'][k]; e.izq = k === 3; e.salto = Math.abs(Math.sin(Math.PI * (td - 21500) / 600)) * 6; }
    else if (paso === 'canto') { mirar(L.cx - e.x, L.cy - e.y); e.acc = 'trabaja'; e.frame = Math.floor(td / 220 + i) % 2; e.reverencia = Math.max(0, Math.sin(td / 500 + i * .4)) * .25; }
    else if (paso === 'climax') { mirar(L.cx - e.x, L.cy - e.y); e.acc = 'trabaja'; e.frame = Math.floor(td / 160) % 2; const w = (td - 31500) % 1500; e.salto = w < 800 ? Math.sin(Math.PI * w / 800) * 22 : 0; }
    else if (paso === 'despedida') { mirar(L.cx - e.x, L.cy - e.y); e.reverencia = td < 39000 ? Math.min(1, (td - 35500) / 600) : Math.max(0, 1 - (td - 39000) / 700); }
    return true;
  },
  ritualEstallido() {
    const L = this.ritual.L, P = this.parts;
    for (let k = 0; k < 90; k++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 160; P.push({ x: L.cx, y: L.top + 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .7 - 30, vida: 0, max: 900 + Math.random() * 900, tam: Math.random() < .3 ? 2 : 1, col: Math.random() < .6 ? '140,245,255' : '255,220,120', tipo: 'chispa' }); }
  },
  ritualLuces(luces, t) {
    const r = this.ritual, e = this.est; if (!r) return; const L = r.L;
    const ca = e.carga || 0, ri = e.ritual || 0;
    luces.push({ x: L.cx, y: L.cy - 20, r: 180 + ca * 160, col: [90, 230, 255], a: .18 + ri * .2 + ca * .35 });
    if (e.climax) { const k = Math.max(0, 1 - (Date.now() - e.climax) / 2200); if (k) luces.push({ x: L.cx, y: L.top + 30, r: 520, col: [200, 250, 255], a: .9 * k, bloom: 60 * k }); }
  },
  // pasada aditiva (después de la luz): brillo de los hologramas siempre; durante el ritual, runas, rayos, columna y el 🜁
  galeriaBrillo(c, t) {
    const R = MM_R, e = this.est, vit = (this.m?.objetos || []).filter(MG_ES);
    for (const o of vit) {
      const d = MM_OBJ[o.tipo], X = o.x * R, Y = o.y * R - d.alto, grande = o.tipo === 'altar-holo';
      const cx = X + (grande ? 48 : 32), base = Y + (grande ? MG_AA + 60 : MG_VA + 21), h = grande ? 96 + (e.carga || 0) * 18 : 52, k = 1 + (e.ritual || 0) * .5 + (e.carga || 0);
      mgCono(c, cx, base, h * .8, h * .9, Math.min(1.4, .55 * k)); mgHolo(c, o.modelo, cx, base, h, t, Math.min(1.6, .9 * k), grande ? 3.3 : o.x * 7 + o.y, true);
      if (grande) {                                                   // anillos que orbitan al primero
        for (let n = 0; n < 2; n++) { c.strokeStyle = `rgba(120,240,255,${.25 + (e.carga || 0) * .45})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(cx, base - h * (.35 + n * .3), 30 + n * 8 + (e.carga || 0) * 10, 6 + n * 2, Math.sin(t / 900 + n) * .15, 0, 7); c.stroke();
          const a = t / (700 - n * 200) + n * 3; c.fillStyle = 'rgba(220,255,255,.9)'; c.fillRect(cx + Math.cos(a) * (30 + n * 8 + (e.carga || 0) * 10) - 1, base - h * (.35 + n * .3) + Math.sin(a) * (6 + n * 2) - 1, 2, 2); }
      }
    }
    const r = this.ritual; if (!r) return; const L = r.L;
    // círculo de runas en el suelo
    c.save(); c.setLineDash([6, 9]); c.lineWidth = 2;
    for (const [k, sg] of [[1, 1], [.7, -1]]) { c.lineDashOffset = sg * t / 40; c.strokeStyle = `rgba(110,240,255,${.25 * (e.ritual || 0) + .3 * (e.carga || 0)})`; c.beginPath(); c.ellipse(L.cx, L.cy, r.rx * k + 18, r.ry * k + 12, 0, 0, 7); c.stroke(); }
    c.restore();
    if (r.fase !== 'danza') return;
    // canto y clímax: cada vitrina manda su luz al primero
    if (e.carga > .05) for (const o of vit) if (o.tipo === 'vitrina') mmCorriente(c, o.x * R + 32, o.y * R - MG_VA + 20, L.cx, L.top + 30, [110, 240, 255], t, .5 + e.carga);
    if (e.carga > .2) for (const p of this.ents.values()) if (!p.sale && Math.random() < e.carga * .05) this.parts.push({ x: p.x + (Math.random() - .5) * 20, y: p.y - 10, vx: 0, vy: -30 - Math.random() * 30, vida: 0, max: 900, tam: 1, col: '140,245,255', tipo: 'chispa' });
    if (e.climax) {
      const dt = Date.now() - e.climax, k = Math.max(0, 1 - Math.max(0, dt - 3200) / 1500);
      if (k > 0) {                                                    // la columna de luz
        const w = 34 + Math.sin(t / 60) * 6, g = c.createLinearGradient(L.cx - w, 0, L.cx + w, 0);
        g.addColorStop(0, 'rgba(120,240,255,0)'); g.addColorStop(.5, `rgba(220,255,255,${.75 * k})`); g.addColorStop(1, 'rgba(120,240,255,0)'); c.fillStyle = g; c.fillRect(L.cx - w, 0, w * 2, L.top + 60);
        for (let n = 0; n < 3; n++) { const f = ((dt + n * 450) % 1400) / 1400; c.strokeStyle = `rgba(160,250,255,${(1 - f) * .8 * k})`; c.lineWidth = 3 * (1 - f) + 1; c.beginPath(); c.ellipse(L.cx, L.cy, 20 + f * r.rx * 1.6, 8 + f * r.ry * 1.4, 0, 0, 7); c.stroke(); }
        const y = Math.max(46, L.top - 50) + Math.sin(t / 300) * 3, tam = 22 + Math.min(1, dt / 500) * 10 + Math.sin(t / 140) * 2;   // el 🜁 sobre todos
        mgAire(c, L.cx, y, tam + 6, `rgba(120,240,255,${.35 * k})`, 10); mgAire(c, L.cx, y, tam, `rgba(255,236,170,${.95 * k})`, 4);
      }
    }
  },
  // ficha al tocar una vitrina
  galeriaFicha(o) {
    const m = MG_HOLO.meta?.[o.modelo] || {}, nombre = m.nombre || o.modelo || tr('Vitrina vacía');
    return ['#5fe9ff', [nombre, tr('Galería de los Orígenes')],
      `<div class="mm-txt">${o.tipo === 'altar-holo' ? tr('El primer cuerpo de APOLO, de cuando despertó en la Raspberry Pi 5 (marzo de 2026).') : tr('Uno de los primeros modelos 3D del equipo de APOLO MISION CONTROL (marzo de 2026).')}</div>` +
      `<div class="mm-acc"><button class="btn mini" data-ritual>${this.ritual ? tr('Terminar el ritual') : tr('🜁 Empezar el ritual')}</button></div>`];
  },
});
