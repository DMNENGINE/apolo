// Mission Control → vista "Mundo": un mapa pixel-art vivo (mundo/1 de /v1/mundo) donde cada agente es un personaje.
// APOLO es el mago del orbe; las conversaciones, aprendices a su lado; los subagentes van a su bahía; las tareas programadas, al taller;
// los plugins son goblins en la sala de servidores. Rayos del orbe a quien trabaja, burbujas (… ? ! ✓), HUD con CPU/RAM, E-STOP y pánico.
// Todo se dibuja con código (sin imágenes): tiles de 16 px en un canvas nativo que se escala en píxeles enteros.

const MM_T = 16;
const MM_TEMAS = {
  mazmorra: { fondo: '#0d0f14', pared: ['#4d5560', '#626b77', '#353b44', '#2a2f37'], luz: 'antorcha', borde: '#2fd1b0' },
  castillo: { fondo: '#0f0d10', pared: ['#6b5f58', '#82766d', '#4a413c', '#352e2a'], luz: 'antorcha', borde: '#e0b44a' },
  nave: { fondo: '#05070d', pared: ['#2c3a4d', '#3f5470', '#1d2735', '#141b26'], luz: 'neon', borde: '#3ad7ff' },
  laboratorio: { fondo: '#070b0c', pared: ['#9aa6ad', '#b8c3c9', '#6f7b82', '#4e585e'], luz: 'neon', borde: '#7cff8a' },
  oficina: { fondo: '#101114', pared: ['#c9c2b6', '#ddd6ca', '#9d968a', '#6f695f'], luz: 'lampara', borde: '#ffb347' },
  bosque: { fondo: '#08100a', pared: ['#4a3a28', '#5e4a33', '#33281b', '#251d14'], luz: 'antorcha', borde: '#8fdc5a' },
};
const MM_SUELO = {
  piedra: ['#565c65', '#4b5159', '#61676f', '#3f444b'], tierra: ['#7a5937', '#6c4e30', '#866440', '#5b4128'],
  madera: ['#7b5634', '#6a4a2c', '#8a6440', '#55391f'], metal: ['#3b4450', '#333b46', '#46505d', '#262c35'],
  hierba: ['#3d7537', '#356830', '#4a8a43', '#2b5527'], alfombra: ['#6b2f3a', '#5c2832', '#7a3843', '#4a1f28'],
};
const MM_ROPA = ['#3b6fb6', '#b5452f', '#3f8f4f', '#8a4fb5', '#c08a2e', '#2f8f8f', '#6b6b75', '#b54f7d'];
const MM_PELO = ['#3a2414', '#6b3e1f', '#c9a24a', '#1c1c1c', '#8b2f1f', '#d9d9d9'];
const MM_PIEL = ['#f1c7a0', '#d9a477', '#a8714a', '#7a4e2d'];
const mmHash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mmRnd = (x, y, k = 0) => (mmHash(`${x},${y},${k}`) % 1000) / 1000;
// footprint de cada objeto en casillas (ancho, alto) y si bloquea el paso
const MM_OBJ = { rack: [2, 3, 1], antorcha: [1, 1, 0], orbe: [2, 2, 1], impresora: [4, 4, 1], mesa: [2, 1, 1], pc: [2, 2, 1], estanteria: [2, 2, 1], planta: [1, 1, 1],
  barril: [1, 1, 1], cofre: [1, 1, 1], telescopio: [1, 2, 1], cuadro: [2, 1, 0], consola: [2, 1, 1], tanque: [1, 2, 1], sofa: [2, 1, 1], caja: [1, 1, 1], lampara: [1, 1, 0], cables: [2, 1, 0] };

// ---------- personajes: plantillas de 10×14 px ----------
const MM_CUERPO = ['...hhhh...', '..hhhhhh..', '..hssssh..', '..sesses..', '..ssssss..', '...ssss...', '..cccccc..', '.sccccccs.', '.sccbbccs.', '..cccccc..', '..cccccc..'];
const MM_PIERNAS = [['..pp..pp..', '..pp..pp..', '..oo..oo..'], ['..pp..pp..', '..pp...pp.', '..oo...oo.'], ['..pp..pp..', '.pp...pp..', '.oo...oo..']];
const MM_TUNICA = ['..cccccc..', '.cccccccc.', '.cccccccc.', '..oo..oo..'];
const MM_SOMBRERO = ['.....H....', '....HH....', '....HHH...', '...HHHH...', '..HHHHHH..', 'HHHHHHHHHH'];

function mmPintarPersonaje(c, x, y, p, frame, izq, t) {
  const L = p.look, col = { h: L.pelo, s: L.piel, e: '#15161a', c: L.ropa, b: L.ropa2 || '#3a2a1a', p: L.pantalon || '#2c2f3a', o: '#1f1a17' };
  const filas = [...MM_CUERPO, ...(L.tunica ? MM_TUNICA : MM_PIERNAS[frame])];
  c.save(); c.translate(Math.round(x) - 5, Math.round(y) - 14); c.scale(2, 2); if (izq) { c.translate(10, 0); c.scale(-1, 1); }   // al doble: 20×28 px, los pies en y+14
  const bob = frame ? 1 : 0;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(1, 14, 8, 2);                    // sombra
  filas.forEach((f, j) => { for (let i = 0; i < 10; i++) { const k = f[i]; if (k === '.') continue; c.fillStyle = col[k]; c.fillRect(i, j + (j < 11 ? -bob : 0) , 1, 1); } });
  if (L.orejas) { c.fillStyle = L.piel; c.fillRect(0, 2 - bob, 2, 2); c.fillRect(8, 2 - bob, 2, 2); }
  if (L.casco) { c.fillStyle = L.casco; c.fillRect(2, -1 - bob, 6, 2); c.fillRect(1, 1 - bob, 8, 1); }
  if (L.capucha) { c.fillStyle = L.capucha; c.fillRect(1, -1 - bob, 8, 2); c.fillRect(1, 1 - bob, 1, 5); c.fillRect(8, 1 - bob, 1, 5); }
  if (L.barba) { c.fillStyle = L.barba; c.fillRect(2, 4 - bob, 6, 2); c.fillRect(3, 6 - bob, 4, 2); c.fillRect(4, 8 - bob, 2, 1); }
  if (L.mago) { c.fillStyle = L.mago; MM_SOMBRERO.forEach((f, j) => { for (let i = 0; i < 10; i++) if (f[i] === 'H') c.fillRect(i, j - 5 - bob, 1, 1); }); c.fillStyle = '#ffd34d'; c.fillRect(5, -3 - bob, 1, 1); }
  if (L.baston) {                                                         // bastón con la punta encendida
    c.fillStyle = '#6b4a2a'; c.fillRect(10, 1 - bob, 1, 13);
    c.fillStyle = p.trabajando ? (Math.sin(t / 90) > 0 ? '#e9ffff' : '#7ff3ff') : '#7fb8c9'; c.fillRect(9, -1 - bob, 3, 2);
  }
  c.restore();
}

// ---------- objetos ----------
function mmObjeto(c, o, t, est) {
  const X = o.x * MM_T, Y = o.y * MM_T, r = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(X + x, Y + y, w, h); };
  switch (o.tipo) {
    case 'rack': {
      r(3, 2, 26, 46, '#141920'); r(4, 3, 24, 44, '#262e38'); r(4, 3, 24, 2, '#3a4552');
      for (let k = 0; k < 8; k++) { r(6, 7 + k * 5, 20, 4, '#1b2129'); r(6, 7 + k * 5, 20, 1, '#323c48');
        for (let l = 0; l < 4; l++) { const on = Math.sin(t / (90 + mmRnd(o.x, k, l) * 400) + mmRnd(o.y, k, l) * 9) > 1 - est.cpu * 1.6 - .25;
          r(8 + l * 3, 9 + k * 5, 1, 1, on ? (l % 3 ? '#38ff7a' : '#3ab8ff') : '#16301f'); } r(22, 9 + k * 5, 3, 1, '#0d1116'); }
      r(3, 48, 26, 1, 'rgba(0,0,0,.4)'); break;
    }
    case 'antorcha': case 'lampara': {
      const neon = o.tipo === 'lampara' || est.luz !== 'antorcha';
      if (neon) { r(5, 4, 6, 3, '#1a1f26'); r(6, 6, 4, 2, est.luz === 'lampara' ? '#ffe2a0' : est.borde); break; }
      r(7, 7, 2, 7, '#5a3b20'); r(6, 6, 4, 2, '#3b3f45');
      const f = Math.floor(t / 110 + mmRnd(o.x, o.y) * 3) % 3;
      r(6, 2 + (f === 1), 4, 4, '#ff8a1e'); r(7, 1 + (f === 2), 2, 3, '#ffd23f'); r(7 + (f === 0 ? 1 : 0), 0 + f % 2, 1, 2, '#fff6c2'); break;
    }
    case 'orbe': {
      r(2, 18, 28, 12, '#3a4048'); r(4, 16, 24, 4, '#4f5761'); r(1, 28, 30, 4, '#2c3138'); r(4, 20, 24, 1, '#626b76');
      r(6, 22, 4, 2, '#1f8a8a'); r(22, 22, 4, 2, '#1f8a8a'); r(14, 24, 4, 2, est.orbe > .3 ? '#7ff3ff' : '#1f8a8a');
      const pul = .6 + est.orbe * .4 + Math.sin(t / 260) * .1, R = 8 + est.orbe * 1.5;
      const g = c.createRadialGradient(X + 16, Y + 9, 1, X + 16, Y + 9, R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.35, `rgba(150,250,255,${pul})`); g.addColorStop(1, 'rgba(40,160,220,.15)');
      c.fillStyle = g; c.beginPath(); c.arc(X + 16, Y + 9, R, 0, 7); c.fill();
      for (let k = 0; k < 3; k++) { const a = t / 400 + k * 2.1; r(16 + Math.round(Math.cos(a) * 5) - 1, 9 + Math.round(Math.sin(a) * 4), 2, 1, '#e8ffff'); }
      break;
    }
    case 'impresora': {
      const p = est.progreso;
      r(4, 6, 56, 56, '#20262e'); r(6, 8, 52, 52, '#3a434e'); r(10, 12, 44, 40, '#151a20');
      r(10, 12, 2, 40, '#6b7682'); r(52, 12, 2, 40, '#6b7682'); r(10, 18, 44, 2, '#8a96a3');
      const hx = 14 + Math.round((Math.sin(t / 380) * .5 + .5) * 30); r(hx, 16, 8, 6, '#c0c7cf'); r(hx + 3, 22, 2, 3, '#ff8a3d');
      r(14, 46, 36, 3, '#5d6773');
      const h = Math.round(4 + p * 14); r(26, 46 - h, 12, h, '#e0782f'); r(26, 46 - h, 12, 2, '#ffae63'); r(36, 46 - h, 2, h, '#a9531d');
      r(40, 54, 14, 6, '#0d2016'); r(42, 56, 10 * Math.min(1, p) | 0, 2, '#38ff7a');
      r(6, 8, 52, 2, '#56616e'); break;
    }
    case 'mesa': r(1, 4, 30, 8, '#7a5230'); r(1, 4, 30, 2, '#9a6b40'); r(3, 12, 2, 4, '#4a3018'); r(27, 12, 2, 4, '#4a3018'); r(8, 2, 8, 4, '#e9e4d6'); r(9, 3, 6, 1, '#9aa'); r(20, 3, 5, 3, '#3b6fb6'); break;
    case 'pc': {
      r(1, 18, 30, 6, '#6a4a2c'); r(1, 18, 30, 2, '#8a6440'); r(5, 2, 22, 16, '#bfb9a8'); r(7, 4, 18, 11, '#0b1a10');
      const on = est.bahia > 0; for (let k = 0; k < 4; k++) { const w = 4 + Math.floor(mmRnd(k, Math.floor(t / 300)) * 12); r(8, 5 + k * 2.5 | 0, on ? w : 3, 1, on ? '#38ff7a' : '#1d4d2a'); }
      r(13, 16, 6, 2, '#8d8778'); r(9, 20, 14, 2, '#d6d0c0'); break;
    }
    case 'estanteria': {
      r(1, 0, 30, 32, '#5a3b20'); r(3, 2, 26, 28, '#2d1e10'); const brilla = est.memoria;
      for (let k = 0; k < 3; k++) { r(3, 10 + k * 9, 26, 2, '#7a5230'); for (let l = 0; l < 8; l++) r(4 + l * 3, 3 + k * 9 + (l % 3 === 0), 2, 7 - (l % 3 === 0), ['#b5452f', '#3b6fb6', '#3f8f4f', '#c08a2e', '#8a4fb5'][(l + k) % 5]); }
      if (brilla > .02) { c.fillStyle = `rgba(255,60,90,${brilla * .5})`; c.fillRect(X + 3, Y + 2, 26, 28); } break;
    }
    case 'planta': r(4, 10, 8, 6, '#8a4b2a'); r(4, 10, 8, 1, '#a65d36'); r(7, 2, 2, 8, '#3f8f4f'); r(3, 4, 4, 3, '#4fae5f'); r(9, 3, 4, 3, '#4fae5f'); r(5, 1, 6, 3, '#62c472'); break;
    case 'barril': r(3, 3, 10, 12, '#7a4a26'); r(3, 5, 10, 1, '#3b3f45'); r(3, 12, 10, 1, '#3b3f45'); r(4, 3, 8, 1, '#9a6034'); r(3, 15, 10, 1, 'rgba(0,0,0,.4)'); break;
    case 'cofre': r(2, 6, 12, 9, '#7a4a26'); r(2, 6, 12, 3, '#9a6034'); r(2, 9, 12, 1, '#c9a24a'); r(7, 9, 2, 3, '#ffd34d'); break;
    case 'caja': r(2, 4, 12, 11, '#9a7444'); r(2, 4, 12, 1, '#b88d55'); r(2, 9, 12, 1, '#6b4f2c'); r(7, 4, 1, 11, '#6b4f2c'); break;
    case 'telescopio': r(7, 10, 2, 20, '#5a3b20'); r(3, 28, 10, 2, '#4a3018'); r(2, 4, 12, 4, '#c9a24a'); r(0, 4, 3, 4, '#8a6a2a'); r(13, 3, 2, 6, '#e8d28a'); break;
    case 'cuadro': r(1, 2, 30, 13, '#5a3b20'); r(2, 3, 28, 11, '#1d4f8f'); for (let k = 0; k < 4; k++) r(4 + k * 6, 5 + (k % 2) * 3, 5, 1, '#9fd0ff'); r(5, 11, 20, 1, '#9fd0ff'); break;
    case 'consola': { r(1, 4, 30, 10, '#1a1f26'); r(1, 4, 30, 2, '#2c3440'); for (let k = 0; k < 3; k++) r(3 + k * 10, 7, 8, 5, Math.sin(t / 200 + k) > 0 ? est.borde : '#0e3a40'); break; }
    case 'tanque': { r(2, 0, 12, 30, '#2b3a44'); r(3, 1, 10, 28, '#0f2a2e'); const nv = 8 + Math.sin(t / 900) * 2; r(3, nv, 10, 29 - nv, '#1fae8a'); for (let k = 0; k < 3; k++) r(5 + k * 3, 26 - ((t / 40 + k * 9) % 18 | 0), 1, 1, '#9fffe0'); break; }
    case 'sofa': r(0, 4, 32, 10, '#6b2f3a'); r(0, 2, 32, 4, '#7a3843'); r(0, 4, 3, 10, '#5c2832'); r(29, 4, 3, 10, '#5c2832'); break;
    case 'cables': for (let k = 0; k < 4; k++) { r(0, 8 + k * 2, 32, 1, ['#1b1f25', '#2b5f9a', '#9a2b2b', '#2b8a4a'][k]); } r(26, 5, 6, 10, '#20262e'); break;
  }
}

// ---------- el mundo ----------
const MC_MUNDO = {
  async montar(caja, mc) {
    this.mc = mc; this.caja = caja; this.ents = new Map(); this.ticker = []; this.log = []; this.pestana = this.pestana || 'ticker';
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
    const W = m.ancho * MM_T, H = m.alto * MM_T; this.W = W; this.H = H;
    // rejilla: 0 vacío · 1 suelo · 2 pared; y qué sala/suelo tiene cada casilla
    const g = new Uint8Array(m.ancho * m.alto), suelo = new Array(m.ancho * m.alto), sala = new Array(m.ancho * m.alto);
    const poner = (rc, s, id) => { for (let y = rc.y; y < rc.y + rc.h; y++) for (let x = rc.x; x < rc.x + rc.w; x++) if (x >= 0 && y >= 0 && x < m.ancho && y < m.alto) { const i = y * m.ancho + x; g[i] = 1; suelo[i] = suelo[i] && sala[i] ? suelo[i] : s; if (id) sala[i] = id; } };
    const sueloPasillo = { nave: 'metal', laboratorio: 'metal', oficina: 'madera', bosque: 'hierba' }[m.tema] || 'tierra';
    for (const p of m.pasillos) poner(p, sueloPasillo);
    for (const s of m.salas) poner(s, s.suelo, s.id);
    const en = (x, y) => x >= 0 && y >= 0 && x < m.ancho && y < m.alto;
    for (let y = 0; y < m.alto; y++) for (let x = 0; x < m.ancho; x++) if (!g[y * m.ancho + x]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (en(x + dx, y + dy) && g[(y + dy) * m.ancho + x + dx] === 1) { g[y * m.ancho + x] = 2; dy = dx = 2; }
    }
    this.g = g; this.suelo = suelo; this.sala = sala;
    this.bloq = new Uint8Array(m.ancho * m.alto);
    for (const o of m.objetos) { const [w, h, b] = MM_OBJ[o.tipo] || [1, 1, 1]; if (b) for (let y = o.y; y < o.y + h; y++) for (let x = o.x; x < o.x + w; x++) if (en(x, y)) this.bloq[y * m.ancho + x] = 1; }
    this.porRol = Object.fromEntries(m.salas.map(s => [s.rol, s]));
    this.orbe = m.objetos.find(o => o.tipo === 'orbe') || (() => { const s = this.porRol.principal; return { x: s.x + (s.w >> 1) - 1, y: s.y + (s.h >> 1) - 1 }; })();
    this.fondo = this.pintarFondo();
    this.dom(); this.ents.clear(); this.poblar();
    if (!this.raf) this.raf = requestAnimationFrame(t => this.cuadro(t));
  },
  pintarFondo() {
    const m = this.m, cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
    const c = cv.getContext('2d'), [pB, pL, pS, pO] = this.tema.pared;
    c.fillStyle = this.tema.fondo; c.fillRect(0, 0, this.W, this.H);
    const G = (x, y) => (x < 0 || y < 0 || x >= m.ancho || y >= m.alto) ? 0 : this.g[y * m.ancho + x];
    for (let y = 0; y < m.alto; y++) for (let x = 0; x < m.ancho; x++) {
      const v = G(x, y), X = x * MM_T, Y = y * MM_T;
      if (v === 1) {
        const tipo = this.suelo[y * m.ancho + x] || 'piedra', [a, b, cl, os] = MM_SUELO[tipo] || MM_SUELO.piedra;
        c.fillStyle = a; c.fillRect(X, Y, MM_T, MM_T);
        if (tipo === 'piedra') { c.fillStyle = os; c.fillRect(X, Y + 15, 16, 1); c.fillRect(X + (y % 2 ? 7 : 15), Y, 1, 16); c.fillStyle = cl; c.fillRect(X + 1, Y + 1, 5, 1); c.fillStyle = b; c.fillRect(X + 9, Y + 9, 4, 3); }
        else if (tipo === 'metal') { c.fillStyle = os; c.fillRect(X, Y, 16, 1); c.fillRect(X, Y, 1, 16); c.fillStyle = cl; c.fillRect(X + 1, Y + 1, 14, 1); c.fillStyle = '#5d6876'; c.fillRect(X + 2, Y + 2, 1, 1); c.fillRect(X + 13, Y + 13, 1, 1); c.fillRect(X + 13, Y + 2, 1, 1); c.fillRect(X + 2, Y + 13, 1, 1); }
        else if (tipo === 'madera') { c.fillStyle = os; for (let k = 0; k < 4; k++) c.fillRect(X, Y + k * 4 + 3, 16, 1); c.fillRect(X + ((x * 7 + y * 3) % 12) + 2, Y, 1, 4); c.fillStyle = cl; c.fillRect(X + 3, Y + 5, 6, 1); }
        else if (tipo === 'alfombra') { c.fillStyle = b; if ((x + y) % 2) c.fillRect(X + 4, Y + 4, 8, 8); c.fillStyle = cl; c.fillRect(X + 7, Y + 7, 2, 2); }
        else for (let k = 0; k < 7; k++) { c.fillStyle = [b, cl, os][k % 3]; c.fillRect(X + Math.floor(mmRnd(x, y, k) * 15), Y + Math.floor(mmRnd(y, x, k) * 15), tipo === 'hierba' ? 1 : 2, tipo === 'hierba' ? 2 : 1); }
        // musgo donde la tierra/hierba toca la pared
        if ((tipo === 'tierra' || tipo === 'hierba') && this.tema.luz === 'antorcha') {
          c.fillStyle = '#4c8a3a';
          if (G(x, y - 1) === 2) for (let k = 0; k < 16; k += 2) c.fillRect(X + k, Y, 2, 1 + Math.floor(mmRnd(x, k) * 3));
          if (G(x - 1, y) === 2) for (let k = 0; k < 16; k += 3) c.fillRect(X, Y + k, 1 + Math.floor(mmRnd(y, k) * 2), 2);
          if (G(x + 1, y) === 2) for (let k = 0; k < 16; k += 3) c.fillRect(X + 15 - Math.floor(mmRnd(k, y) * 2), Y + k, 2, 2);
        }
        if (G(x, y - 1) === 2) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(X, Y, 16, 3); }   // sombra bajo la pared
      } else if (v === 2) {
        if (G(x, y + 1) === 1) {                                       // cara frontal de la pared (ladrillos)
          c.fillStyle = pB; c.fillRect(X, Y, 16, 16);
          c.fillStyle = pO; for (let k = 0; k < 4; k++) { c.fillRect(X, Y + k * 4 + 3, 16, 1); c.fillRect(X + ((k + y) % 2 ? 4 : 11), Y + k * 4, 1, 3); }
          c.fillStyle = pL; c.fillRect(X, Y, 16, 2); for (let k = 0; k < 4; k++) c.fillRect(X + ((k + y) % 2 ? 5 : 12), Y + k * 4, 3, 1);
          c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(X, Y + 13, 16, 3);
        } else {                                                        // parte de arriba de la pared
          c.fillStyle = pS; c.fillRect(X, Y, 16, 16); c.fillStyle = pO;
          c.fillRect(X + (y % 2 ? 0 : 8), Y + 7, 8, 1); c.fillRect(X + (y % 2 ? 8 : 0), Y + 15, 8, 1);
          c.fillStyle = pB;
          if (G(x - 1, y) === 1) c.fillRect(X, Y, 2, 16); if (G(x + 1, y) === 1) c.fillRect(X + 14, Y, 2, 16); if (G(x, y - 1) === 1) c.fillRect(X, Y, 16, 2);
        }
      }
    }
    return cv;
  },
  dom() {
    const m = this.m, pct = (v, tot) => `${(v / tot * 100).toFixed(3)}%`;
    this.caja.style.setProperty('--mm-borde', this.tema.borde);
    this.caja.innerHTML = `<div class="mm">
      <div class="mm-barra mm-arriba"><span class="mm-dato" data-d="cpu">CPU —</span><span class="mm-dato" data-d="ram">RAM —</span><span class="mm-dato" data-d="tok">TOKENS —</span>
        <span class="mm-titulo">MISSION CONTROL</span><span class="mm-dato mm-status" data-d="status">STATUS: —</span>
        <span class="mm-pest"><button data-p="ticker" class="${this.pestana === 'ticker' ? 'on' : ''}">TICKER</button><button data-p="log" class="${this.pestana === 'log' ? 'on' : ''}">LOG</button></span></div>
      <div class="mm-mapa" style="aspect-ratio:${m.ancho}/${m.alto}"><canvas width="${this.W}" height="${this.H}"></canvas>
        ${m.salas.filter(s => s.rol !== 'decor' || s.nombre).map(s => `<div class="mm-placa" style="left:${pct((s.x + s.w / 2) * MM_T, this.W)};top:${pct(s.y * MM_T + 4, this.H)}">${esc(s.nombre).toUpperCase()}</div>`).join('')}
        ${this.porRol.servidores ? `<div class="mm-panel" style="left:${pct((this.porRol.servidores.x + this.porRol.servidores.w - 2.3) * MM_T, this.W)};top:${pct((this.porRol.servidores.y + 2.6) * MM_T, this.H)}"><div>CPU <i data-b="cpu"><b></b></i></div><div>RAM <i data-b="ram"><b></b></i></div></div>` : ''}
        <div class="mm-panel" style="left:${pct((this.porRol.principal.x + .4) * MM_T, this.W)};top:${pct((this.porRol.principal.y + 1.6) * MM_T, this.H)}"><div class="mm-c">AGENTE<br>ORQUESTADOR</div><i data-b="orbe" class="seg"><b></b></i></div>
        <div class="mm-panel" style="left:${pct((this.porRol.principal.x + this.porRol.principal.w - 3.4) * MM_T, this.W)};top:${pct((this.porRol.principal.y + 1.6) * MM_T, this.H)}"><div class="mm-c" data-d="estado">STATUS:<br>—</div></div>
        ${this.porRol.taller ? `<div class="mm-panel" style="left:${pct((this.porRol.taller.x + this.porRol.taller.w - 3.6) * MM_T, this.W)};top:${pct((this.porRol.taller.y + 2.2) * MM_T, this.H)}"><div class="mm-c" data-d="taller">TAREAS:<br>—</div></div>` : ''}
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
    this.cv.onmousemove = e => { const p = this.punto(e); this.cv.style.cursor = this.enPunto(p.x, p.y) ? 'pointer' : 'default'; };
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
      if (a.herramienta && a.herramienta.nombre !== prev?.herramienta?.nombre) this.apuntar('ticker', `${a.nombre || a.id}: ${NOMBRE_HERR?.[a.herramienta.nombre] || a.herramienta.nombre} ${a.herramienta.resumen || ''}`);
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
    const quiere = new Map(), ahora = Date.now();
    const look = (id, extra = {}) => { const h = mmHash(id); return { ropa: MM_ROPA[h % MM_ROPA.length], pelo: MM_PELO[(h >> 4) % MM_PELO.length], piel: MM_PIEL[(h >> 8) % MM_PIEL.length], ropa2: '#3a2a1a', capucha: (h >> 12) % 4 === 0 ? MM_ROPA[(h >> 14) % MM_ROPA.length] : null, ...extra }; };
    quiere.set('apolo', { tipo: 'apolo', nombre: 'APOLO', sala: 'principal', look: { ropa: '#4b3a8f', ropa2: '#2c2160', pelo: '#d9d9d9', piel: '#f1c7a0', barba: '#e8e8e8', mago: '#3d2f7a', tunica: true, baston: true }, fijo: { x: this.orbe.x - 1.3, y: this.orbe.y + 1.1 } });
    for (const a of this.mc.agentes.values()) {
      const vivo = a.estado === 'trabajando' || a.esperando;
      if (!vivo && !(a.fin && ahora - a.fin < 25000)) continue;
      const sala = a.padre ? 'subagentes' : a.tarea ? (this.porRol.taller ? 'taller' : 'principal') : 'principal';
      quiere.set('a:' + a.id, { tipo: 'agente', agente: a, nombre: String(a.nombre || a.id).replace(/^⏰\s*/, ''), sala, nace: a.padre ? 'principal' : null,
        look: look(a.id, a.tarea ? { casco: '#f5c542', ropa: '#c06a2a' } : a.padre ? {} : { tunica: true, ropa: '#3f5fb0', mago: '#2f4a8f' }) });
    }
    if (this.porRol.servidores) (this.plugins || []).forEach(p => quiere.set('p:' + p.nombre, { tipo: 'plugin', plugin: p, nombre: p.nombre, sala: 'servidores', look: { piel: '#6fae4a', pelo: '#4e7f33', ropa: '#5b4632', ropa2: '#3a2a1a', orejas: true } }));
    if (this.porRol.taller) (this.tareas || []).slice(0, 3).forEach(t => quiere.set('t:' + t.id, { tipo: 'tarea', tarea: t, nombre: t.nombre, sala: 'taller', look: look(t.id, { casco: '#d8dde3', ropa: '#5d6b4a' }) }));
    for (const [id, e] of this.ents) if (!quiere.has(id)) { if (!e.sale) e.sale = ahora; }
    for (const [id, q] of quiere) {
      const e = this.ents.get(id);
      if (e) { Object.assign(e, { agente: q.agente, plugin: q.plugin, tarea: q.tarea, nombre: q.nombre }); e.sale = 0; continue; }
      const nacer = this.porRol[q.nace] && this.porRol[q.sala] ? this.puntoEn(this.porRol[q.nace]) : null;
      const p = q.fijo || nacer || this.puntoEn(this.porRol[q.sala] || this.porRol.principal);
      this.ents.set(id, { id, ...q, x: p.x * MM_T + 3, y: p.y * MM_T, ruta: [], espera: Math.random() * 2000, frame: 0, izq: false, nace: ahora });
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
  mover(e, dt) {
    if (e.fijo) { e.x = e.fijo.x * MM_T + 3; e.y = e.fijo.y * MM_T; e.frame = 0; return; }
    const ocupado = e.agente?.estado === 'trabajando' && !e.agente.esperando;
    if (!e.ruta.length) {
      e.espera -= dt; e.frame = 0;
      if (e.espera > 0) return;
      const s = this.porRol[e.sala] || this.porRol.principal, dest = this.puntoEn(s);
      e.ruta = this.camino({ x: Math.round((e.x - 3) / MM_T), y: Math.round(e.y / MM_T) }, dest);
      e.espera = (ocupado ? 2500 : 1500) + Math.random() * (ocupado ? 5000 : 4000);
      return;
    }
    const n = e.ruta[0], tx = n.x * MM_T + 3, ty = n.y * MM_T, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), v = (e.tipo === 'plugin' ? 22 : 30) * dt / 1000;
    if (d <= v) { e.x = tx; e.y = ty; e.ruta.shift(); } else { e.x += dx / d * v; e.y += dy / d * v; if (Math.abs(dx) > .5) e.izq = dx < 0; }
    e.paso = (e.paso || 0) + dt; e.frame = 1 + Math.floor(e.paso / 160) % 2;
  },
  // ---------- dibujo ----------
  cuadro(t) {
    this.raf = 0; if (!this.caja || !this.cv?.isConnected) return;
    const dt = Math.min(100, t - (this.tAnt || t)); this.tAnt = t;
    if (!this.pausa) {
      const c = this.c, e = this.est, vivos = [...this.mc.agentes.values()].filter(a => a.estado === 'trabajando');
      e.orbe += ((vivos.length ? Math.min(1, .5 + vivos.length * .15) : .08) - e.orbe) * Math.min(1, dt / 600);
      e.memoria *= Math.exp(-dt / 900); e.bahia = vivos.filter(a => a.padre).length;
      for (const x of this.ents.values()) { x.trabajando = x.agente ? x.agente.estado === 'trabajando' : x.tipo === 'apolo' ? vivos.length > 0 : false; this.mover(x, dt); }
      c.drawImage(this.fondo, 0, 0);
      // objetos y personajes ordenados por su base (lo de abajo tapa lo de arriba)
      const cosas = [...this.m.objetos.map(o => ({ o, base: (o.y + (MM_OBJ[o.tipo]?.[1] || 1)) * MM_T - (MM_OBJ[o.tipo]?.[2] ? 0 : 99) })), ...[...this.ents.values()].map(p => ({ p, base: p.y + 14 }))].sort((a, b) => a.base - b.base);
      for (const k of cosas) {
        if (k.o) { mmObjeto(c, k.o, t, e); continue; }
        const p = k.p; c.globalAlpha = p.sale ? Math.max(0, 1 - (Date.now() - p.sale) / 1500) : Math.min(1, (Date.now() - p.nace) / 500);
        mmPintarPersonaje(c, p.x, p.y, p, p.frame, p.izq, t); c.globalAlpha = 1;
      }
      this.rayos(c, t);
      this.luces(c, t);
      for (const p of this.ents.values()) { this.burbuja(c, p, t); this.etiqueta(p); }
      if (e.panico) { c.fillStyle = `rgba(255,30,60,${.10 + Math.sin(t / 300) * .05})`; c.fillRect(0, 0, this.W, this.H); }
      if (this.sel) this.seguirHolo();
    }
    this.raf = requestAnimationFrame(x => this.cuadro(x));
  },
  rayos(c, t) {
    const o = this.orbe, ox = o.x * MM_T + 16, oy = o.y * MM_T + 9;
    if (!this.semilla || t - this.tRayo > 90) { this.semilla = Math.random() * 1e6; this.tRayo = t; }
    let k = 0;
    for (const p of this.ents.values()) {
      if (!p.trabajando || p.tipo === 'apolo' || p.sale) continue;
      const tx = p.x + 5, ty = p.y - 2, n = 7, pts = [[ox, oy]];
      for (let i = 1; i < n; i++) { const f = i / n; pts.push([ox + (tx - ox) * f + (mmRnd(this.semilla, k, i) - .5) * 14, oy + (ty - oy) * f + (mmRnd(k, this.semilla, i) - .5) * 14]); }
      pts.push([tx, ty]); k++;
      for (const [w, col] of [[3, 'rgba(90,220,255,.35)'], [1, '#e9ffff']]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(x, y)); c.stroke(); }
    }
    const a = this.ents.get('apolo');                              // del bastón al orbe cuando trabaja
    if (a?.trabajando) { const sx = a.x + 16, sy = a.y - 16; c.strokeStyle = 'rgba(150,250,255,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx, sy); for (let i = 1; i <= 4; i++) c.lineTo(sx + (ox - sx) * i / 4 + (i < 4 ? (mmRnd(this.semilla, i) - .5) * 6 : 0), sy + (oy - sy) * i / 4); c.stroke(); }
  },
  luces(c, t) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const brillo = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const o of this.m.objetos) {
      if (o.tipo === 'antorcha' || o.tipo === 'lampara') { const neon = o.tipo === 'lampara' || this.est.luz !== 'antorcha'; brillo(o.x * MM_T + 8, o.y * MM_T + 6, 30, neon ? 'rgba(120,220,255,A)' : 'rgba(255,150,50,A)', (.22 + Math.sin(t / 130 + o.x) * .04).toFixed(3)); }
      else if (o.tipo === 'orbe') brillo(o.x * MM_T + 16, o.y * MM_T + 9, 40 + this.est.orbe * 30, 'rgba(90,220,255,A)', (.18 + this.est.orbe * .3).toFixed(3));
      else if (o.tipo === 'consola' || o.tipo === 'tanque') brillo(o.x * MM_T + 12, o.y * MM_T + 10, 22, 'rgba(60,255,200,A)', '.12');
    }
    c.restore();
  },
  burbuja(c, p, t) {
    const a = p.agente; let s = null, col = '#15161a';
    if (a?.esperando) { s = '!'; col = '#e8233b'; } else if (a && a.estado !== 'trabajando') s = a.estado === 'listo' ? '✓' : '×';
    else if (a?.herramienta) s = '?'; else if (p.trabajando) s = '…';
    if (!s) return;
    const x = Math.round(p.x) + 9, y = Math.round(p.y) - (p.look.mago ? 34 : 26) + (s === '!' ? Math.round(Math.sin(t / 120)) : 0);
    c.fillStyle = '#10131a'; c.fillRect(x - 1, y - 1, 11, 10); c.fillStyle = s === '!' ? '#ffe9ec' : '#f4f7fb'; c.fillRect(x, y, 9, 8); c.fillRect(x + 2, y + 8, 2, 2);
    c.fillStyle = col; c.font = '8px Silkscreen, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (s === '…') for (let i = 0; i < 3; i++) c.fillRect(x + 2 + i * 2, y + 4 + (Math.floor(t / 200) % 3 === i ? -1 : 0), 1, 1);
    else c.fillText(s, x + 5, y + 4.5);
  },
  // nombre encima de agentes y subagentes (HTML: nítido a cualquier tamaño)
  etiqueta(p, quitar) {
    if (!p.el && (quitar || p.tipo !== 'agente')) return;
    if (quitar) { p.el?.remove(); return; }
    if (!p.el) { p.el = document.createElement('span'); p.el.className = 'mm-nombre'; p.el.textContent = p.nombre.length > 22 ? p.nombre.slice(0, 21) + '…' : p.nombre; this.capaNombres.append(p.el); }
    p.el.style.left = `${((p.x + 5) / this.W * 100).toFixed(2)}%`; p.el.style.top = `${((p.y - (p.look.mago ? 36 : 28)) / this.H * 100).toFixed(2)}%`;
    p.el.style.opacity = p.sale ? Math.max(0, 1 - (Date.now() - p.sale) / 1500) : 1;
  },
  // ---------- interacción ----------
  punto(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H }; },
  enPunto(x, y) {
    let mejor = null, md = 14;
    for (const p of this.ents.values()) { const d = Math.hypot(p.x + 5 - x, p.y - y); if (d < md + 4) { md = d; mejor = { p }; } }
    if (mejor) return mejor;
    for (const o of this.m.objetos) { const [w, h] = MM_OBJ[o.tipo] || [1, 1]; if (['orbe', 'rack', 'impresora', 'estanteria'].includes(o.tipo) && x >= o.x * MM_T && x < (o.x + w) * MM_T && y >= o.y * MM_T && y < (o.y + h) * MM_T) return { o }; }
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
        (a.herramienta ? fila('Haciendo', `${esc(NOMBRE_HERR?.[a.herramienta.nombre] || a.herramienta.nombre)} <small>${esc(String(a.herramienta.resumen || '').slice(0, 120))}</small>`) : a.ultimo ? fila('Último', esc(String(a.ultimo).slice(0, 160))) : '') +
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
    const h = this.sel, px = h.p ? h.p.x + 5 : (h.o.x + (MM_OBJ[h.o.tipo]?.[0] || 1) / 2) * MM_T, py = h.p ? h.p.y - 4 : h.o.y * MM_T + 8;
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
