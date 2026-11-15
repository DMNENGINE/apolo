// Mission Control → entorno vivo: agua con ondas y reflejos, cascadas con espuma y bruma, árboles que se mecen (y sueltan
// pétalos si florecen), faroles que se balancean, estandartes que ondean, nenúfares que flotan y animales que pasean solos.
// Los objetos llevan `color` (#rrggbb) y los animales `especie`; todos son cuerpos de mision-fisica.js (se agarran y se lanzan).
// Se engancha a MC_MUNDO: aguaDibujar (encima del fondo) y vivoParticulas (desde particulas()).

const MV_ESPECIES = ['gato', 'perro', 'pajaro', 'conejo', 'lemur', 'bisonte', 'pez', 'tortuga'];
const mvCol = (o, def) => /^#[0-9a-f]{6}$/i.test(o?.color || '') ? o.color : def;

// ---------- cascada: 2×3, cae del muro a un remanso ----------
mmObj('cascada', 2, 3, 1, 0, c => {
  const p = mmP(c);
  for (const [x, w] of [[0, 12], [52, 12]]) for (let y = 0; y < 92; y += 10) { mmBisel(c, x + (y % 20 ? 1 : 0), y, w - 1, 11, y % 30 ? '#5b6168' : '#4a5057'); if (y % 20 === 0) p(x + 3, y + 3, 3, 2, '#3f6b3a'); }
  p(10, 0, 44, 84, '#1d4a6e');
  c.fillStyle = '#2a6a96'; c.beginPath(); c.ellipse(32, 86, 30, 9, 0, 0, 7); c.fill();
  c.fillStyle = '#1d4a6e'; c.beginPath(); c.ellipse(32, 87, 24, 6, 0, 0, 7); c.fill();
  for (const [x, y] of [[4, 84], [56, 82], [10, 92], [50, 92]]) { mmBisel(c, x - 4, y - 3, 9, 7, '#6b7178'); }
}, (c, X, Y, t, e, o) => {
  const ph = o.x * 31;
  for (let x = 12; x < 52; x += 2) {                                  // chorros: tiras que bajan a distinto ritmo
    const v = .09 + mmF(x, o.x, 70) * .05;
    for (let k = 0; k < 4; k++) { const y = ((t * v + mmF(x, k, 71) * 90 + ph) % 96) - 8, l = 10 + mmF(x, k, 72) * 14;
      c.fillStyle = k % 2 ? 'rgba(200,240,255,.55)' : 'rgba(120,200,240,.6)'; c.fillRect(X + x, Y + Math.max(0, y), 2, Math.max(0, Math.min(l, 82 - y))); }
  }
  c.fillStyle = 'rgba(230,250,255,.85)';                              // espuma abajo
  for (let i = 0; i < 9; i++) { const a = t / 260 + i * .7, r = 3 + Math.sin(t / 180 + i) * 1.5; c.beginPath(); c.ellipse(X + 14 + i * 4.5, Y + 82 + Math.sin(a) * 2, r, r * .6, 0, 0, 7); c.fill(); }
  c.strokeStyle = `rgba(200,240,255,${.35 + Math.sin(t / 300) * .15})`; c.lineWidth = 1;
  for (let k = 0; k < 2; k++) { const r = ((t / 25 + k * 14) % 28); c.beginPath(); c.ellipse(X + 32, Y + 88, 8 + r, 2 + r * .25, 0, 0, 7); c.stroke(); }
}, (o, X, Y, t) => [{ x: X + 32, y: Y + 80, r: 70, col: [140, 210, 255], a: .28 + Math.sin(t / 400) * .05 }]);

// ---------- árbol: 2×2 con copa alta que se mece; florece si lleva color ----------
mmObj('arbol', 2, 2, 1, 44, (c, v, o) => {
  const p = mmP(c), A = 44;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(32, A + 58, 26, 7, 0, 0, 7); c.fill();
  p(27, A + 18, 10, 42, '#5a3a22'); p(27, A + 18, 3, 42, '#7a5232'); p(35, A + 18, 2, 42, '#3e2716');
  p(21, A + 56, 8, 4, '#5a3a22'); p(35, A + 56, 9, 4, '#5a3a22'); p(30, A + 30, 2, 6, '#3e2716');
}, (c, X, Y, t, e, o) => {
  const base = mvCol(o, '#3f8f4f'), flor = !!o.color, sw = Math.sin(t / 1100 + o.x * 1.7) * 2.2 + Math.sin(t / 470 + o.y) * .6;
  const hojas = [[32, 30, 24, 0], [16, 40, 15, .3], [48, 40, 15, .3], [24, 18, 15, .7], [42, 18, 15, .7], [32, 8, 13, 1], [20, 50, 11, .1], [44, 50, 11, .1]];
  for (const [x, y, r, k] of hojas) { const dx = sw * (1.2 - y / 60);
    c.fillStyle = mmTono(base, -.28); c.beginPath(); c.ellipse(X + x + dx, Y + y + 3, r, r * .78, 0, 0, 7); c.fill();
    c.fillStyle = base; c.beginPath(); c.ellipse(X + x + dx - 1, Y + y, r * .9, r * .7, 0, 0, 7); c.fill();
    c.fillStyle = mmTono(base, .22); c.beginPath(); c.ellipse(X + x + dx - 4, Y + y - 4, r * .45, r * .32, 0, 0, 7); c.fill(); }
  if (flor) for (let i = 0; i < 14; i++) { const x = mmF(i, o.x, 80) * 52 + 6, y = mmF(i, o.y, 81) * 48 + 4; c.fillStyle = i % 3 ? '#fff0f6' : mmTono(base, .35); c.fillRect(X + x + sw * (1.2 - y / 60) | 0, Y + y | 0, 2, 2); }
}, null);

// ---------- farol colgante: se balancea y titila ----------
mmObj('farol', 1, 1, 0, 0, c => { const p = mmP(c); p(15, 0, 2, 6, '#2a2a2a'); }, (c, X, Y, t, e, o) => {
  const a = Math.sin(t / 760 + o.x * 2.1) * .16, col = mvCol(o, '#c0392b'), fl = .85 + Math.sin(t / 90 + o.y) * .08 + Math.sin(t / 37 + o.x) * .05;
  c.save(); c.translate(X + 16, Y + 2); c.rotate(a);
  c.fillStyle = '#2a2a2a'; c.fillRect(-1, 0, 2, 8);
  c.fillStyle = '#d9a43a'; c.fillRect(-6, 8, 12, 3); c.fillRect(-5, 25, 10, 3);
  c.fillStyle = col; c.beginPath(); c.ellipse(0, 18, 8, 9, 0, 0, 7); c.fill();
  c.fillStyle = `rgba(255,220,140,${fl})`; c.beginPath(); c.ellipse(0, 18, 4.5, 6, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-8, 15, 16, 1); c.fillRect(-8, 21, 16, 1);
  c.fillStyle = '#d9a43a'; c.fillRect(-1, 28, 2, 5);
  c.restore();
}, (o, X, Y, t) => [{ x: X + 16 + Math.sin(t / 760 + o.x * 2.1) * 3, y: Y + 22, r: 96 + Math.sin(t / 90 + o.y) * 5, col: [255, 190, 110], a: .7, bloom: 12 }]);

// ---------- estandarte: tela que ondea colgada de una barra ----------
mmObj('bandera', 1, 2, 0, 0, c => { const p = mmP(c); mmBisel(c, 1, 2, 30, 4, '#6b4423'); p(0, 1, 3, 6, '#d9a43a'); p(29, 1, 3, 6, '#d9a43a'); }, (c, X, Y, t, e, o) => {
  const col = mvCol(o, '#2f6fb0'), osc = mmTono(col, -.3), cla = mmTono(col, .35);
  for (let y = 0; y < 50; y++) {
    const k = y / 50, dx = Math.sin(t / 380 - y / 7 + o.x) * 2.2 * k, w = 24 - (y > 42 ? (y - 42) * (y % 2 ? 1.6 : 1.4) : 0);
    if (w <= 0) continue;
    c.fillStyle = Math.sin(t / 380 - y / 7 + o.x) > .6 ? cla : y % 9 === 0 ? osc : col; c.fillRect(X + 4 + dx | 0, Y + 6 + y, w, 1);
    if (y === 2 || y === 40) { c.fillStyle = '#d9a43a'; c.fillRect(X + 4 + dx | 0, Y + 6 + y, w, 2); }
  }
  const dx = Math.sin(t / 380 - 22 / 7 + o.x) * 2.2 * .45;                    // emblema: círculo con ondas
  c.strokeStyle = cla; c.lineWidth = 1.5; c.beginPath(); c.arc(X + 16 + dx, Y + 28, 7, 0, 7); c.stroke();
  c.beginPath(); c.arc(X + 14 + dx, Y + 27, 3, Math.PI, 0); c.arc(X + 18 + dx, Y + 29, 3, Math.PI, 0, true); c.stroke();
}, null);

// ---------- nenúfar: flota en el agua ----------
mmObj('nenufar', 1, 1, 0, 0, c => { }, (c, X, Y, t, e, o) => {
  const b = Math.sin(t / 900 + o.x * 3) * 1.2;
  c.fillStyle = '#2f7a3a'; c.beginPath(); c.ellipse(X + 16, Y + 20 + b, 11, 6, 0, .35, 6.1); c.lineTo(X + 16, Y + 20 + b); c.fill();
  c.fillStyle = '#4fae5f'; c.beginPath(); c.ellipse(X + 15, Y + 19 + b, 7, 3.5, 0, .4, 6); c.lineTo(X + 15, Y + 19 + b); c.fill();
  if (mmH(o.x, o.y, 82) % 2) { const f = mvCol(o, '#f28cb8'); c.fillStyle = f; for (let i = 0; i < 5; i++) { const a = i * 1.26 + t / 3000; c.beginPath(); c.ellipse(X + 18 + Math.cos(a) * 3, Y + 16 + b + Math.sin(a) * 1.5, 2.5, 1.6, a, 0, 7); c.fill(); } c.fillStyle = '#ffe27a'; c.fillRect(X + 17, Y + 15 + b | 0, 2, 2); }
}, null);

// ---------- animales: se mueven solos (mision-fisica.js les da la IA de paseo) ----------
mmObj('animal', 1, 1, 0, 8, c => { }, (c, X, Y, t, e, o) => {
  const f = o.f || {}, sp = MV_ESPECIES.includes(o.especie) ? o.especie : 'gato', izq = f.izq ? -1 : 1, anda = Math.hypot(f.vx || 0, f.vy || 0) > 12, pata = anda ? Math.sin(t / 70) * 2 : 0;
  const col = mvCol(o, { gato: '#e09a4a', perro: '#a86b3c', pajaro: '#4a9ad9', conejo: '#e8e2d8', lemur: '#d8cfc0', bisonte: '#f2efe8', pez: '#ff8a3a', tortuga: '#5f8f4f' }[sp]);
  const cx = X + 16, cy = Y + 8 + 28, P = (x, y, w, h, k) => { c.fillStyle = k; c.fillRect(cx + x * izq - (izq < 0 ? w : 0), cy + y, w, h); };
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx, cy + 2, sp === 'bisonte' ? 22 : 8, sp === 'bisonte' ? 6 : 3, 0, 0, 7); c.fill();
  if (sp === 'pez') { const b = Math.sin(t / 200 + o.x) * 3; P(-6, -4 + b * .2, 10, 5, col); P(4, -5, 4, 7, mmTono(col, -.2)); P(-5, -3, 2, 1, '#ffffff'); P(-4, -3, 1, 1, '#000'); return; }
  if (sp === 'bisonte') {                                              // grande, peludo y lento
    const r = Math.sin(t / 900) * 1.5; P(-20, -26 + r, 36, 22, col); P(-18, -30 + r, 30, 6, mmTono(col, .05)); P(-24, -22 + r, 8, 12, col);
    for (const x of [-16, -6, 4, 12]) P(x, -6, 5, 6 + (x % 2 ? pata : -pata), mmTono(col, -.15));
    P(-26, -24 + r, 3, 3, '#1c1c1c'); P(-22, -30 + r, 3, 4, '#c9a24a'); P(-14, -30 + r, 3, 4, '#c9a24a'); P(12, -24 + r, 6, 8, '#8b6a4a'); return;
  }
  if (sp === 'tortuga') { P(-7, -7, 14, 7, mmTono(col, -.25)); P(-6, -9, 12, 3, col); P(-10, -5, 4, 3, '#8fb47a'); P(-6, -1, 3, 2 + pata * .3, '#8fb47a'); P(4, -1, 3, 2 - pata * .3, '#8fb47a'); P(-10, -5, 1, 1, '#000'); return; }
  if (sp === 'pajaro') { const vuela = (f.z || 0) > 2, al = vuela ? Math.sin(t / 50) * 4 : 0; P(-4, -8, 9, 6, col); P(-7, -10, 5, 5, col); P(-9, -8, 2, 1, '#f5c542'); P(-6, -9, 1, 1, '#000'); P(-1, -9 - al, 5, 2 + Math.abs(al) * .5, mmTono(col, -.25)); P(4, -6, 3, 2, mmTono(col, -.3)); if (!vuela) { P(-2, -2, 1, 2, '#c08a2e'); P(1, -2, 1, 2, '#c08a2e'); } return; }
  // cuadrúpedos pequeños: gato, perro, conejo, lemur
  const larg = sp === 'perro' ? 14 : 12, alto = sp === 'conejo' ? 7 : 6, salto = sp === 'conejo' && anda ? Math.abs(Math.sin(t / 110)) * 4 : 0;
  P(-larg / 2, -8 - alto + 4 - salto, larg, alto, col);
  P(-larg / 2 - 5, -12 - salto, 7, 7, col); P(-larg / 2 - 4, -10 - salto, 1, 1, '#1c1c1c'); P(-larg / 2 - 6, -8 - salto, 2, 1, mmTono(col, -.4));
  if (sp === 'gato') { P(-larg / 2 - 5, -14 - salto, 2, 2, col); P(-larg / 2 - 1, -14 - salto, 2, 2, col); P(larg / 2, -12 - salto + Math.sin(t / 300) * 2, 2, 7, col); }
  if (sp === 'perro') { P(-larg / 2 - 2, -12 - salto, 3, 5, mmTono(col, -.3)); P(larg / 2, -10 - salto, 3, 2 + Math.abs(Math.sin(t / 90)) * 2, col); }
  if (sp === 'conejo') { P(-larg / 2 - 4, -19 - salto, 2, 7, col); P(-larg / 2 - 1, -19 - salto, 2, 7, col); P(larg / 2 - 1, -8 - salto, 3, 3, '#ffffff'); }
  if (sp === 'lemur') { P(-larg / 2 - 8, -15 - salto, 5, 6, col); P(-larg / 2, -15 - salto, 5, 6, col); P(-larg / 2 - 4, -10 - salto, 2, 2, '#2a5a2a'); for (let k = 0; k < 4; k++) P(larg / 2 + k, -12 - k * 2 - salto, 2, 2, k % 2 ? '#3a3030' : col); }
  if (!salto) for (const x of [-larg / 2 + 1, larg / 2 - 3]) P(x, -4, 2, 4 + (x < 0 ? pata : -pata), mmTono(col, -.2));
}, null);

Object.assign(MC_MUNDO, {
  // ondas, reflejos y destellos sobre las casillas de agua (el fondo es fijo; esto se mueve)
  aguaDibujar(c, t) {
    const L = this.agua; if (!L?.length) return;
    const A = this.m.ancho, R = MM_R;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const i of L) {
      const x = (i % A) * R, y = Math.floor(i / A) * R, s = i * 7;
      for (let k = 0; k < 3; k++) {
        const fx = (mmF(i, k, 90) * 28 + t / (60 + k * 25)) % 36 - 4, fy = 6 + k * 10 + Math.sin(t / 700 + s + k) * 2, w = 5 + mmF(k, i, 91) * 7;
        c.fillStyle = `rgba(120,200,255,${.12 + Math.sin(t / 500 + s + k * 2) * .06})`; c.fillRect(x + Math.max(0, fx) | 0, y + fy | 0, Math.min(w, R - Math.max(0, fx)) | 0, 1);
      }
      if (mmH(i, Math.floor(t / 420), 92) % 23 === 0) { c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + mmF(i, 1, 93) * 28 | 0, y + mmF(i, 2, 93) * 28 | 0, 2, 1); }
    }
    c.restore();
  },
  // partículas del entorno: bruma de las cascadas y pétalos de los árboles en flor
  vivoParticulas(dt) {
    const P = this.parts; if (!P || P.length > 470) return;
    for (const o of this.m.objetos) {
      if (o.tipo === 'cascada' && Math.random() < dt / 90) P.push({ x: mfOX(o) + 14 + Math.random() * 36, y: mfOY(o) + 86, vx: (Math.random() - .5) * 20, vy: -10 - Math.random() * 16, vida: 0, max: 900, tam: 2, col: '210,240,255', tipo: 'mota' });
      else if (o.tipo === 'arbol' && o.color && Math.random() < dt / 700) P.push({ x: mfOX(o) + 10 + Math.random() * 44, y: mfOY(o) - 30 + Math.random() * 30, vx: 6 + Math.random() * 10, vy: 10 + Math.random() * 8, vida: 0, max: 3500, tam: 2, col: '255,190,215', tipo: 'petalo' });
    }
  },
});
