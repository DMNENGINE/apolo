// Arte del mundo de Mission Control (todo procedural, sin imágenes): texturas de suelo y pared píxel a píxel con ruido,
// objetos con volumen y partes animadas, personajes con contorno (frente/espalda/perfil, andar, respirar, parpadear, teclear, conjurar),
// luz dinámica (mapa de luz multiplicado + bloom), partículas y detalles automáticos (telarañas, huesos, charcos, estandartes).
// 32 px por casilla. Lo usa mision-mundo.js.

const MM_R = 32;
const MM_TEMAS = {
  mazmorra: { fondo: [9, 10, 14], muro: 'ladrillo', pared: '#5b636e', amb: [132, 122, 162], sala: .2, luz: 'antorcha', borde: '#2fd1b0', acento: '#8f2f3a', deco: 'mazmorra' },
  castillo: { fondo: [12, 10, 12], muro: 'ladrillo', pared: '#7a6b60', amb: [140, 122, 130], sala: .2, luz: 'antorcha', borde: '#e0b44a', acento: '#2f4f8f', deco: 'mazmorra' },
  nave: { fondo: [4, 6, 12], muro: 'panel', pared: '#3a4b63', amb: [108, 124, 168], sala: .2, luz: 'neon', borde: '#3ad7ff', acento: '#3ad7ff', deco: 'nave' },
  laboratorio: { fondo: [6, 10, 11], muro: 'azulejo', pared: '#c6d0d6', amb: [128, 140, 146], sala: .2, luz: 'neon', borde: '#7cff8a', acento: '#7cff8a', deco: 'nave' },
  oficina: { fondo: [14, 14, 16], muro: 'yeso', pared: '#d8d0c2', amb: [150, 142, 134], sala: .22, luz: 'lampara', borde: '#ffb347', acento: '#3b6fb6', deco: 'oficina' },
  bosque: { fondo: [7, 12, 8], muro: 'tronco', pared: '#6b5034', amb: [122, 138, 118], sala: .2, luz: 'antorcha', borde: '#8fdc5a', acento: '#8fdc5a', deco: 'mazmorra' },
};
const MM_SUELOC = {
  piedra: [[92, 98, 108], [70, 76, 86], [38, 42, 48]], tierra: [[126, 92, 58], [98, 70, 44], [62, 44, 28]], madera: [[134, 92, 56], [104, 70, 40], [58, 38, 20]],
  metal: [[70, 80, 94], [52, 60, 72], [30, 35, 43]], hierba: [[78, 138, 66], [54, 106, 48], [34, 70, 30]], alfombra: [[128, 44, 58], [100, 32, 44], [196, 150, 70]],
};

// ---------- utilidades ----------
const mmH = (a, b, s = 0) => { let h = (a * 374761393 + b * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const mmF = (a, b, s) => mmH(a, b, s) / 4294967296;
function mmRuido(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = mmF(xi, yi, s), b = mmF(xi + 1, yi, s), c = mmF(xi, yi + 1, s), d = mmF(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const mmFbm = (x, y, s) => mmRuido(x, y, s) * .62 + mmRuido(x * 2.3, y * 2.3, s + 7) * .38;
const mmMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mmMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const mmRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function mmTono(hex, k) {                               // aclara (k>0) u oscurece (k<0) un color #rrggbb
  const c = mmRGB(hex), f = v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return '#' + c.map(v => Math.max(0, Math.min(255, f(v))).toString(16).padStart(2, '0')).join('');
}
const mmLienzo = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
const mmP = c => (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
function mmBisel(c, x, y, w, h, col, k = 1) {           // caja con luz arriba-izquierda y sombra abajo-derecha
  const p = mmP(c); p(x, y, w, h, col); p(x, y, w, 1, mmTono(col, .22 * k)); p(x, y, 1, h, mmTono(col, .12 * k)); p(x, y + h - 1, w, 1, mmTono(col, -.3 * k)); p(x + w - 1, y, 1, h, mmTono(col, -.22 * k));
}
function mmContorno(cv, col = [10, 10, 16]) {           // contorno de 1 px alrededor de lo opaco
  const c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height), a = d.data, W = cv.width, H = cv.height, o = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) o[i] = a[i * 4 + 3] > 140;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (o[i]) continue;
    if ((x > 0 && o[i - 1]) || (x < W - 1 && o[i + 1]) || (y > 0 && o[i - W]) || (y < H - 1 && o[i + W])) { a[i * 4] = col[0]; a[i * 4 + 1] = col[1]; a[i * 4 + 2] = col[2]; a[i * 4 + 3] = 235; }
  }
  c.putImageData(d, 0, 0); return cv;
}

// ---------- fondo: suelos y paredes píxel a píxel ----------
function mmFondo(w) {
  const m = w.m, T = w.tema, R = MM_R, W = m.ancho * R, H = m.alto * R, A = m.ancho;
  const cv = mmLienzo(W, H), c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
  const G = (x, y) => (x < 0 || y < 0 || x >= m.ancho || y >= m.alto) ? 0 : w.g[y * A + x];
  const pared = mmRGB(T.pared), fondo = T.fondo;
  for (let ty = 0; ty < m.alto; ty++) for (let tx = 0; tx < m.ancho; tx++) {
    const v = G(tx, ty), tipo = w.suelo[ty * A + tx] || 'piedra', S = MM_SUELOC[tipo] || MM_SUELOC.piedra;
    const arriba = G(tx, ty - 1) === 2, izq = G(tx - 1, ty) === 2, der = G(tx + 1, ty) === 2, frente = v === 2 && G(tx, ty + 1) === 1;
    for (let py = 0; py < R; py++) for (let px = 0; px < R; px++) {
      const gx = tx * R + px, gy = ty * R + py; let col;
      if (v === 1) {
        if (tipo === 'piedra') {                                     // losas irregulares
          const fila = Math.floor(gy / 16), off = (fila % 2) * 11 + (mmH(fila, 3) % 5), sx = Math.floor((gx + off) / 22), lx = (gx + off) % 22, ly = gy % 16;
          const id = mmF(sx, fila, 1), borde = Math.min(lx, 21 - lx, ly, 15 - ly);
          col = mmMul(mmMix(S[0], S[1], id * .8), .9 + mmFbm(gx / 7, gy / 7, 2) * .2);
          if (borde === 0) col = S[2]; else if (borde === 1 && (lx === 1 || ly === 1)) col = mmMul(col, 1.13); else if (borde === 1) col = mmMul(col, .8);
          if (mmH(gx, gy, 4) % 89 === 0) col = mmMul(col, .7);
          if (id > .86 && mmRuido(gx / 5, gy / 5, 9) > .62) col = mmMix(col, [70, 104, 58], .45);   // musgo en alguna losa
        } else if (tipo === 'tierra') {
          const n = mmFbm(gx / 11, gy / 11, 3); col = mmMix(S[1], S[0], n); col = mmMul(col, .9 + mmF(gx, gy, 5) * .16);
          const qx = gx >> 2, qy = gy >> 2;
          if (mmH(qx, qy, 6) % 37 === 0) { const ix = gx & 3, iy = gy & 3; if (ix < 3 && iy < 3) col = (ix === 0 && iy === 0) ? [168, 150, 128] : iy === 2 ? [82, 70, 58] : [128, 114, 98]; }
          if (mmRuido(gx / 26, gy / 26, 8) < .22) col = mmMul(col, .82);
        } else if (tipo === 'madera') {
          const fila = Math.floor(gy / 8), off = mmH(fila, 7) % 48, tabla = Math.floor((gx + off) / 48), ly = gy % 8;
          const veta = Math.sin(gx / 3.5 + mmRuido(gx / 18, gy / 3, 11) * 6) * .5 + .5;
          col = mmMul(mmMix(S[0], S[1], mmF(tabla, fila, 12) * .7 + veta * .25), .94 + mmF(gx, gy, 13) * .08);
          if (ly === 7 || (gx + off) % 48 === 0) col = S[2]; else if (ly === 0) col = mmMul(col, 1.12);
          if ((gx + off) % 48 === 3 && (ly === 3 || ly === 4)) col = [48, 40, 34];
        } else if (tipo === 'metal') {                                // chapa antideslizante con remaches
          const lx = gx % 32, ly = gy % 32;
          col = mmMul(S[0], .92 + mmRuido(gx / 40, gy / 1.6, 14) * .1);
          if (((lx + ly) % 8 === 0 && (lx - ly + 64) % 8 === 4) || ((lx + ly) % 8 === 1 && (lx - ly + 64) % 8 === 5)) col = mmMul(col, 1.18);
          if (lx === 0 || ly === 0) col = mmMul(S[0], 1.25); else if (lx === 31 || ly === 31) col = S[2];
          for (const [rx, ry] of [[3, 3], [27, 3], [3, 27], [27, 27]]) if (lx >= rx && lx < rx + 2 && ly >= ry && ly < ry + 2) col = lx === rx && ly === ry ? [170, 182, 196] : [40, 46, 56];
        } else if (tipo === 'hierba') {
          col = mmMix(S[1], S[0], mmFbm(gx / 9, gy / 9, 15)); if (mmH(gx, gy, 16) % 6 === 0) col = mmMul(col, 1.2); if (mmH(gx, gy >> 1, 17) % 9 === 0) col = mmMul(col, .78);
          if (mmH(gx >> 1, gy >> 1, 18) % 431 === 0) col = [[240, 220, 90], [240, 240, 240], [230, 120, 170]][mmH(gx, gy) % 3];
        } else {                                                       // alfombra con rombos
          const lx = gx % 32, ly = gy % 32, rombo = Math.abs(lx - 16) + Math.abs(ly - 16);
          col = mmMul(S[0], .9 + mmF(gx, gy, 19) * .12); if (rombo === 10 || rombo === 11) col = S[2]; else if (rombo < 4) col = mmMul(S[2], .8); else if ((gx + gy) % 2) col = mmMul(col, .94);
        }
        // sombra de las paredes sobre el suelo (oclusión)
        let k = 1; if (arriba) k *= .5 + .5 * Math.min(1, py / 12); if (izq) k *= .72 + .28 * Math.min(1, px / 7); if (der) k *= .72 + .28 * Math.min(1, (R - 1 - px) / 7);
        if (G(tx - 1, ty - 1) === 2 && !arriba && !izq) k *= .85 + .15 * Math.min(1, Math.hypot(px, py) / 8);
        col = mmMul(col, k);
        if ((tipo === 'tierra' || tipo === 'hierba') && T.deco === 'mazmorra' && arriba && py < 4 + mmRuido(gx / 3, 1, 20) * 5) col = mmMix(col, [76, 128, 60], .8);
      } else if (v === 2 && frente) {                                 // cara frontal de la pared
        col = mmMuro(T.muro, pared, gx, gy, px, py);
      } else if (v === 2) {                                           // parte de arriba del muro
        col = mmMul(pared, .38 + mmRuido(gx / 6, gy / 6, 21) * .08);
        if ((G(tx - 1, ty) === 1 && px < 2) || (G(tx + 1, ty) === 1 && px > R - 3) || (G(tx, ty - 1) === 1 && py < 2)) col = mmMul(pared, .72);
        if (((gy % 16 === 0) || ((gx + (Math.floor(gy / 16) % 2) * 8) % 16 === 0)) && T.muro === 'ladrillo') col = mmMul(col, .82);
      } else col = mmMul(fondo, .8 + mmF(gx >> 1, gy >> 1, 22) * .4);
      const i = (gy * W + gx) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  mmDecorar(c, w);
  return cv;
}
function mmMuro(tipo, pared, gx, gy, px, py) {
  let col;
  if (tipo === 'panel') {
    col = mmMul(pared, .85 + (1 - py / 32) * .25); if (py === 0 || px % 32 === 0) col = mmMul(pared, 1.35); if (px % 32 === 31 || py === 31) col = mmMul(pared, .55);
    if (py >= 12 && py <= 13) col = [70, 210, 240]; if (py === 14) col = mmMul(pared, .5);
    if ((px % 32 === 4 || px % 32 === 27) && (py === 4 || py === 24)) col = [160, 175, 190];
  } else if (tipo === 'azulejo') { col = mmMul(pared, .95 + mmF(gx >> 3, gy >> 3, 23) * .08); if (px % 8 === 0 || py % 8 === 0) col = mmMul(pared, .72); if (py > 27) col = mmMul(pared, .55); }
  else if (tipo === 'yeso') { col = mmMul(pared, .93 + mmRuido(gx / 4, gy / 4, 24) * .08); if (py > 25) col = py === 26 ? [120, 84, 52] : [96, 64, 38]; if (py < 2) col = mmMul(pared, 1.1); }
  else if (tipo === 'tronco') { const ly = py % 8, f = Math.floor(gy / 8); col = mmMul(pared, .7 + Math.sin(ly / 7 * Math.PI) * .45 + mmRuido(gx / 3, gy, 25) * .12); if (mmH(gx >> 2, f, 26) % 23 === 0) col = mmMul(col, .7); }
  else {                                                              // ladrillo de piedra
    const fila = Math.floor(py / 8), off = (fila + Math.floor(gy / 32)) % 2 ? 8 : 0, bx = Math.floor((gx + off) / 16), lx = (gx + off) % 16, ly = py % 8;
    col = mmMul(pared, .82 + mmF(bx, Math.floor(gy / 8), 27) * .3 + mmRuido(gx / 4, gy / 4, 28) * .08);
    if (ly === 7 || lx === 0) col = mmMul(pared, .42); else if (ly === 0 || lx === 1) col = mmMul(col, 1.14);
    if (mmF(bx, Math.floor(gy / 8), 29) > .9 && mmRuido(gx / 3, gy / 3, 30) > .6) col = mmMix(col, [72, 110, 60], .5);
  }
  const k = py < 3 ? 1.18 : py > 26 ? .62 + (31 - py) * .05 : 1;      // remate claro arriba, sombra abajo
  return mmMul(col, k);
}
// detalles que salen solos según el tema: telarañas, huesos, charcos y grietas, estandartes, rejillas
function mmDecorar(c, w) {
  const m = w.m, A = m.ancho, R = MM_R, T = w.tema, G = (x, y) => (x < 0 || y < 0 || x >= m.ancho || y >= m.alto) ? 0 : w.g[y * A + x];
  const ocupado = new Set(m.objetos.map(o => `${o.x},${o.y}`)), p = mmP(c);
  for (let y = 0; y < m.alto; y++) for (let x = 0; x < m.ancho; x++) {
    const X = x * R, Y = y * R, h = mmH(x, y, 40);
    if (G(x, y) === 1 && !w.bloq[y * A + x] && !ocupado.has(`${x},${y}`)) {
      const sala = w.sala[y * A + x];
      if (T.deco === 'mazmorra') {
        if (G(x, y - 1) === 2 && (G(x - 1, y) === 2 || G(x + 1, y) === 2) && h % 2 === 0) {        // telaraña en la esquina
          const dx = G(x - 1, y) === 2 ? 1 : -1, ox = dx > 0 ? X : X + R; c.strokeStyle = 'rgba(220,225,235,.35)'; c.lineWidth = 1;
          for (let k = 1; k <= 3; k++) { c.beginPath(); c.moveTo(ox, Y + k * 5); c.quadraticCurveTo(ox + dx * k * 3, Y + k * 3, ox + dx * k * 5, Y); c.stroke(); }
          for (const a of [0, .5, 1]) { c.beginPath(); c.moveTo(ox, Y); c.lineTo(ox + dx * 16 * Math.cos(a * 1.57), Y + 16 * Math.sin(a * 1.57)); c.stroke(); }
        } else if (h % 61 === 0 && sala) {                                                           // huesos
          c.save(); c.translate(X + 16, Y + 18); c.rotate((h % 7) / 2); p(-6, -1, 12, 2, '#d9d2c0'); p(-7, -2, 2, 4, '#e8e2d2'); p(5, -2, 2, 4, '#e8e2d2'); p(-6, 1, 12, 1, '#9e9584'); c.restore();
          if (h % 3 === 0) { p(X + 4, Y + 6, 8, 7, '#e3dccb'); p(X + 5, Y + 13, 6, 3, '#cfc7b4'); p(X + 5, Y + 8, 2, 2, '#222'); p(X + 9, Y + 8, 2, 2, '#222'); p(X + 4, Y + 6, 8, 1, '#f4efe2'); }
        } else if (h % 47 === 0 && w.suelo[y * A + x] === 'tierra') {                                // charco
          c.fillStyle = 'rgba(40,60,80,.55)'; c.beginPath(); c.ellipse(X + 16, Y + 18, 11, 5, 0, 0, 7); c.fill();
          c.fillStyle = 'rgba(150,190,220,.35)'; c.fillRect(X + 10, Y + 16, 6, 1); c.fillRect(X + 18, Y + 19, 3, 1);
        } else if (h % 43 === 0 && w.suelo[y * A + x] === 'piedra') {                                // grieta
          c.strokeStyle = 'rgba(20,22,26,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X + 6, Y + 8); c.lineTo(X + 12, Y + 13); c.lineTo(X + 11, Y + 19); c.lineTo(X + 18, Y + 24); c.moveTo(X + 12, Y + 13); c.lineTo(X + 19, Y + 12); c.stroke();
        }
      } else if (T.deco === 'nave' && h % 29 === 0) {                                                // rejilla de ventilación
        p(X + 6, Y + 8, 20, 16, '#1b2028'); for (let k = 0; k < 5; k++) p(X + 8, Y + 10 + k * 3, 16, 1, '#3a4452');
      } else if (T.deco === 'oficina' && h % 53 === 0) { c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(X + 16, Y + 16, 9, 6, 0, 0, 7); c.fill(); }
    }
    // estandartes y pantallas en las paredes de las salas
    if (G(x, y) === 2 && G(x, y + 1) === 1 && w.sala[(y + 1) * A + x] && !ocupado.has(`${x},${y}`) && !ocupado.has(`${x},${y + 1}`) && h % 7 === 0 && x % 2 === 0) {
      if (T.deco === 'mazmorra') {
        p(X + 6, Y + 2, 20, 2, '#3b3f45'); p(X + 8, Y + 4, 16, 22, T.acento); p(X + 8, Y + 4, 2, 22, mmTono(T.acento, .2)); p(X + 22, Y + 4, 2, 22, mmTono(T.acento, -.3));
        for (let k = 0; k < 4; k++) p(X + 8 + k * 4, Y + 26 + (k % 2) * 2, 4, 2, T.acento);
        p(X + 13, Y + 10, 6, 6, '#e0b44a'); p(X + 14, Y + 11, 4, 4, '#7ff3ff');
      } else if (T.deco === 'nave') { p(X + 5, Y + 6, 22, 14, '#0e141c'); p(X + 7, Y + 8, 18, 10, '#0b2a3a'); for (let k = 0; k < 3; k++) p(X + 8, Y + 9 + k * 3, 6 + (h >> k) % 10, 1, '#3ad7ff'); }
      else if (T.deco === 'oficina') { p(X + 6, Y + 6, 20, 16, '#6b4423'); p(X + 8, Y + 8, 16, 12, ['#8fc1e3', '#e8c37a', '#9ad19a'][h % 3]); p(X + 8, Y + 15, 16, 5, '#4f7a4a'); }
    }
  }
}

// ---------- objetos: parte fija (con contorno, en caché) + parte animada + luces ----------
const MM_OBJ = {};
const mmObj = (tipo, w, h, bloq, alto, fijo, vivo, luz) => { MM_OBJ[tipo] = { w, h, bloq, alto, fijo, vivo, luz }; };
const MM_LIBROS = ['#b5452f', '#3b6fb6', '#3f8f4f', '#c08a2e', '#8a4fb5', '#2f8f8f', '#d9d2c0'];

mmObj('rack', 2, 2, 1, 16, (c, v) => {
  const p = mmP(c); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(6, 74, 54, 6);
  mmBisel(c, 6, 2, 52, 74, '#1e242d'); p(9, 5, 46, 6, '#0f1318'); for (let k = 0; k < 10; k++) p(11 + k * 4, 7, 2, 2, '#2d3540');
  for (let u = 0; u < 8; u++) { const y = 14 + u * 7; mmBisel(c, 9, y, 46, 6, u % 4 === 3 ? '#353e4a' : '#2a313c'); p(12, y + 2, 4, 2, '#0a0d10'); p(21, y + 2, 22, 1, '#1a1f27'); p(21, y + 4, 22, 1, '#1a1f27'); p(48, y + 1, 1, 4, '#6b7684'); p(51, y + 1, 1, 4, '#6b7684'); }
  p(6, 2, 1, 74, '#4a5563'); p(54, 14, 2, 60, '#2b5f9a'); p(56, 20, 1, 54, '#9a2b2b');
  p(8, 76, 6, 3, '#0b0e12'); p(50, 76, 6, 3, '#0b0e12');
}, (c, X, Y, t, e, o) => {
  for (let u = 0; u < 8; u++) { const y = Y + 14 + u * 7;
    for (let l = 0; l < 2; l++) { const on = Math.sin(t / (70 + mmF(o.x, u, l) * 300) + mmF(o.y, u, l) * 9) > .72 - e.cpu * 1.3; c.fillStyle = on ? (l ? '#4fd8ff' : u % 3 ? '#39ff8a' : '#ffcf4d') : '#13261b'; c.fillRect(X + 12 + l * 2, y + 2, 1, 2); }
    if (Math.sin(t / 400 + u + o.x) > .3) { c.fillStyle = 'rgba(80,220,255,.55)'; c.fillRect(X + 21, y + 2, (Math.sin(t / 150 + u) * .5 + .5) * 20 | 0, 1); } }
}, (o, X, Y, t, e) => [{ x: X + 32, y: Y + 40, r: 64, col: [60, 190, 255], a: .16 + e.cpu * .2 }]);

mmObj('orbe', 2, 2, 1, 0, c => {
  const p = mmP(c); c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(32, 58, 30, 6, 0, 0, 7); c.fill();
  mmBisel(c, 4, 48, 56, 12, '#3c414a'); p(4, 59, 56, 2, '#23272d'); mmBisel(c, 8, 44, 48, 5, '#4b525d');
  mmBisel(c, 18, 30, 28, 15, '#4f5762'); for (const x of [22, 30, 38]) { p(x, 34, 4, 1, '#2b3037'); p(x + 1, 36, 2, 5, '#2b3037'); }
  mmBisel(c, 10, 24, 44, 7, '#5d6774'); p(12, 24, 40, 1, '#8590a0'); p(14, 30, 36, 1, '#2c3138');
}, (c, X, Y, t, e) => {
  const k = e.orbe, p = mmP(c);
  for (let i = 0; i < 6; i++) { c.globalAlpha = .25 + k * .75 * (Math.sin(t / 300 + i) * .3 + .7); p(X + 9 + i * 8, Y + 52, 4, 3, '#7ff3ff'); } c.globalAlpha = 1;
  const cx = X + 32, cy = Y + 14 + Math.sin(t / 700) * 1.5, R = 12 + k * 1.5;
  const g = c.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, R); g.addColorStop(0, '#ffffff'); g.addColorStop(.3, '#c9fbff'); g.addColorStop(.7, '#3fc6f0'); g.addColorStop(1, '#13507a');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
  c.strokeStyle = 'rgba(220,255,255,.7)'; c.lineWidth = 1; c.beginPath(); for (let a = 0; a < 6.3; a += .3) { const r = 4 + Math.sin(a * 3 + t / 200) * 3; c.lineTo(cx + Math.cos(a + t / 500) * r, cy + Math.sin(a + t / 500) * r); } c.stroke();
  p(cx - 6, cy - 7, 4, 2, '#ffffff'); p(cx - 7, cy - 5, 2, 2, '#ffffff');
  c.strokeStyle = `rgba(127,243,255,${.35 + k * .4})`; c.setLineDash([2, 3]); c.lineDashOffset = -t / 60; c.beginPath(); c.ellipse(cx, cy + 2, R + 7, 4, 0, 0, 7); c.stroke(); c.setLineDash([]);
}, (o, X, Y, t, e) => [{ x: X + 32, y: Y + 16, r: 150 + e.orbe * 90, col: [90, 220, 255], a: .55 + e.orbe * .45, bloom: 26 + e.orbe * 16 }]);

mmObj('impresora', 3, 3, 1, 20, c => {
  const p = mmP(c), A = 20; c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(6, 92 + A, 86, 4);
  mmBisel(c, 6, 72 + A, 84, 20, '#1d2228'); p(6, 72 + A, 84, 2, '#343c45'); for (let k = 0; k < 4; k++) p(10 + k * 7, 78 + A, 4, 10, '#161a1f');
  mmBisel(c, 58, 76 + A, 28, 13, '#3a4452'); p(60, 78 + A, 24, 9, '#071428');
  for (const x of [10, 80]) { mmBisel(c, x, 10 + A, 6, 64, '#9aa4b0'); p(x + 2, 12 + A, 1, 60, '#4d5662'); }
  mmBisel(c, 10, 6 + A, 76, 5, '#9aa4b0'); p(18, 11 + A, 2, 54, '#c9b26a'); p(76, 11 + A, 2, 54, '#c9b26a');
  mmBisel(c, 16, 66 + A, 64, 5, '#b8c0c9'); p(18, 64 + A, 60, 3, '#23272c'); for (const x of [19, 75]) p(x, 69 + A, 3, 2, '#e0b44a');
  p(46, 2, 3, 6 + A - 2, '#59626e'); c.fillStyle = '#d4682a'; c.beginPath(); c.arc(48, 10, 10, 0, 7); c.fill(); c.fillStyle = '#ef8a45'; c.beginPath(); c.arc(46, 8, 6, 0, 7); c.fill();
  c.fillStyle = '#2a2f36'; c.beginPath(); c.arc(48, 10, 3, 0, 7); c.fill();
}, (c, X, Y, t, e) => {
  const p = mmP(c), A = 20, pr = e.progreso || (Math.sin(t / 9000) * .5 + .5) * .6 + .2, gy = Y + A + 52 - pr * 28, hx = X + 18 + (Math.sin(t / 380) * .5 + .5) * 52;
  const ph = 3 + pr * 20 | 0; for (let k = 0; k < ph; k++) p(X + 38, Y + A + 63 - k, 18, 1, k % 2 ? '#e0782f' : '#c8642a'); p(X + 38, Y + A + 63 - ph, 18, 2, '#ffae63');
  mmBisel(c, X + 10, gy, 76, 4, '#9aa4b0');
  c.strokeStyle = '#ef8a45'; c.lineWidth = 1; c.beginPath(); c.moveTo(X + 48, Y + 18); c.quadraticCurveTo(X + 48, gy - 12, hx + 6, gy - 5); c.stroke();
  mmBisel(c, hx, gy - 6, 13, 12, '#2a2f36'); c.strokeStyle = '#59626e'; c.beginPath(); c.arc(hx + 6, gy, 3, 0, 7); c.stroke();
  p(hx + 6 + Math.cos(t / 40) * 2 | 0, gy + Math.sin(t / 40) * 2 | 0, 1, 1, '#c9d1da');
  p(hx + 5, gy + 6, 3, 2, '#ffb347'); p(hx + 6, gy + 8, 1, 2, '#fff1c2');
  p(X + 61, Y + A + 79, 18 * pr | 0, 2, '#39ff8a'); for (let k = 0; k < 2; k++) p(X + 61, Y + A + 82 + k * 3, 6 + (Math.floor(t / 600) + k) % 3 * 5, 1, '#4fd8ff');
}, (o, X, Y, t, e) => [{ x: X + 48, y: Y + 66, r: 46, col: [255, 160, 70], a: .45 }, { x: X + 72, y: Y + 102, r: 30, col: [80, 160, 255], a: .4 }]);

mmObj('mesa', 2, 1, 1, 12, (c, v) => {
  const p = mmP(c), A = 12; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(4, 28 + A, 58, 4);
  p(6, 18 + A, 4, 12, '#4a2e16'); p(54, 18 + A, 4, 12, '#4a2e16'); mmBisel(c, 2, 6 + A, 60, 13, '#8f5f36'); for (let k = 0; k < 3; k++) p(4, 9 + k * 4 + A, 56, 1, '#7a4f2c'); p(2, 18 + A, 60, 3, '#5a3a1e');
  if (v % 3 === 0) { p(8, 2 + A, 16, 11, '#efe8d6'); p(10, 4 + A, 11, 1, '#9aa3ad'); p(10, 7 + A, 9, 1, '#9aa3ad'); p(10, 10 + A, 10, 1, '#9aa3ad'); mmBisel(c, 40, 0 + A, 8, 10, '#d9d2c6'); p(48, 3 + A, 2, 4, '#d9d2c6'); p(41, 1 + A, 6, 2, '#4a2e16'); }
  else if (v % 3 === 1) { p(6, 3 + A, 30, 12, '#d8c69a'); p(6, 3 + A, 30, 1, '#efe2bb'); c.strokeStyle = '#8a6a3a'; c.beginPath(); c.moveTo(10, 10 + A); c.lineTo(20, 6 + A); c.lineTo(30, 11 + A); c.stroke(); p(25, 7 + A, 3, 3, '#c0392b'); c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(48, 8 + A, 5, 0, 7); c.fill(); p(47, 5 + A, 2, 6, '#3b3f45'); }
  else { p(8, 4 + A, 18, 3, '#8a96a3'); p(24, 2 + A, 4, 7, '#8a96a3'); p(34, 5 + A, 14, 2, '#c0392b'); p(46, 4 + A, 4, 4, '#3b3f45'); mmBisel(c, 50, 2 + A, 10, 9, '#3b6fb6'); }
}, null, null);

mmObj('pc', 2, 2, 1, 0, c => {
  const p = mmP(c); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(4, 58, 58, 5);
  p(7, 46, 4, 14, '#4a2e16'); p(53, 46, 4, 14, '#4a2e16'); mmBisel(c, 3, 38, 58, 9, '#8a6440'); p(3, 46, 58, 2, '#5a3a1e');
  mmBisel(c, 12, 4, 40, 31, '#d3cbb5'); p(15, 7, 34, 25, '#2a2c2b'); p(26, 35, 12, 3, '#a8a08c'); p(22, 37, 20, 2, '#bcb49f');
  mmBisel(c, 14, 40, 30, 5, '#dcd5c3'); for (let k = 0; k < 7; k++) p(16 + k * 4, 41, 3, 1, '#9e9784'); p(16, 43, 26, 1, '#9e9784'); mmBisel(c, 47, 41, 5, 4, '#dcd5c3');
  mmBisel(c, 50, 12, 11, 27, '#c4bca6'); p(52, 16, 7, 2, '#5d5848'); p(52, 20, 7, 2, '#5d5848');
}, (c, X, Y, t, e) => {
  const p = mmP(c), on = e.bahia > 0; p(X + 17, Y + 9, 30, 21, on ? '#062014' : '#05140c');
  const fr = Math.floor(t / (on ? 160 : 900));
  for (let k = 0; k < 6; k++) { const w = 4 + mmF(k + fr, 3, 50) * 22 | 0, ind = mmF(k + fr, 1, 51) * 6 | 0; p(X + 19 + ind, Y + 11 + k * 3, Math.min(w, 26 - ind), 1, on ? ['#39ff8a', '#4fd8ff', '#ffcf4d', '#39ff8a'][(k + fr) % 4] : '#1f5a35'); }
  if (Math.floor(t / 500) % 2) p(X + 19, Y + 27, 3, 1, '#39ff8a');
  p(X + 52, Y + 34, 2, 2, Math.sin(t / (on ? 90 : 600)) > 0 ? '#39ff8a' : '#123'); c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(X + 17, Y + 9, 30, 5);
}, (o, X, Y, t, e) => [{ x: X + 32, y: Y + 22, r: e.bahia ? 62 : 40, col: [70, 255, 160], a: e.bahia ? .45 : .2 }]);

mmObj('estanteria', 2, 2, 1, 18, (c, v) => {
  const p = mmP(c), A = 18; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2, 62 + A, 60, 4);
  mmBisel(c, 2, 0, 60, 64 + A, '#6b4423'); p(6, 4, 52, 56 + A, '#24160b');
  for (let s = 0; s < 4; s++) {
    const y0 = 4 + s * 20; p(4, y0 + 17, 56, 3, '#8a5a32'); p(4, y0 + 17, 56, 1, '#a8703f');
    let x = 7; while (x < 55) {
      const r = mmF(x, s, v), w = 3 + (r * 3 | 0), h = 10 + (mmF(s, x, v + 1) * 6 | 0), col = MM_LIBROS[(r * 97 | 0) % MM_LIBROS.length];
      if (r > .9 && x < 48) { p(x + 1, y0 + 9, 7, 7, '#e3dccb'); p(x + 2, y0 + 11, 2, 2, '#222'); p(x + 5, y0 + 11, 2, 2, '#222'); p(x + 2, y0 + 15, 5, 1, '#bdb5a2'); x += 10; continue; }
      if (r < .08 && x < 50) { p(x + 1, y0 + 8, 5, 9, '#3fbf9f'); p(x + 2, y0 + 6, 3, 2, '#6b4423'); p(x + 2, y0 + 9, 1, 5, '#b7fff0'); x += 7; continue; }
      p(x, y0 + 17 - h, w, h, col); p(x, y0 + 17 - h, 1, h, mmTono(col, .25)); p(x + w - 1, y0 + 17 - h, 1, h, mmTono(col, -.3)); p(x, y0 + 19 - h, w, 1, '#e0b44a'); x += w + (r > .7 ? 1 : 0);
    }
  }
}, (c, X, Y, t, e) => { if (e.memoria > .02) { c.fillStyle = `rgba(255,50,80,${e.memoria * .35})`; c.fillRect(X + 6, Y + 4, 52, 74); } },
(o, X, Y, t, e) => [{ x: X + 12, y: Y + 20, r: 26, col: [80, 230, 200], a: .2 }, ...(e.memoria > .05 ? [{ x: X + 32, y: Y + 40, r: 90, col: [255, 60, 90], a: e.memoria * .7 }] : [])]);

mmObj('planta', 1, 1, 1, 12, (c, v) => {
  const p = mmP(c), A = 12; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(7, 29 + A, 18, 3);
  mmBisel(c, 9, 18 + A, 14, 12, '#a55a36'); mmBisel(c, 7, 16 + A, 18, 4, '#c26c43'); p(9, 17 + A, 14, 1, '#3a2a1a');
  const hojas = [[16, 8, 5], [10, 11, 5], [22, 11, 5], [13, 4, 4], [20, 5, 4], [16, 14, 4]];
  for (const [x, y, r] of hojas) { c.fillStyle = '#2f7a3a'; c.beginPath(); c.ellipse(x, y + A - 4, r, r * .7, 0, 0, 7); c.fill(); c.fillStyle = '#4fae5f'; c.beginPath(); c.ellipse(x - 1, y + A - 5, r * .55, r * .4, 0, 0, 7); c.fill(); }
  if (v % 2) for (const [x, y] of [[12, 2], [21, 6]]) { p(x, y + A - 4, 3, 3, '#f5c542'); p(x + 1, y + A - 3, 1, 1, '#c0392b'); }
}, null, null);

mmObj('barril', 1, 1, 1, 8, c => {
  const p = mmP(c), A = 8; c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(16, 30 + A, 12, 3, 0, 0, 7); c.fill();
  for (let y = 4; y < 30; y++) { const w = 18 + Math.round(Math.sin(Math.PI * (y - 4) / 26) * 5); for (let k = 0; k < w; k++) { const f = k / w; p(16 - w / 2 + k | 0, y + A, 1, 1, f < .2 ? '#a96e3c' : f > .8 ? '#5e3a1c' : (k % 5 === 0 ? '#6e4624' : '#8a5a30')); } }
  for (const y of [9, 24]) { const w = 22; p(16 - w / 2, y + A, w, 2, '#4a4e55'); p(16 - w / 2, y + A, w, 1, '#8a8f96'); }
  c.fillStyle = '#6e4624'; c.beginPath(); c.ellipse(16, 5 + A, 9, 3, 0, 0, 7); c.fill(); c.strokeStyle = '#4a4e55'; c.beginPath(); c.ellipse(16, 5 + A, 9, 3, 0, 0, 7); c.stroke();
}, null, null);

mmObj('cofre', 1, 1, 1, 4, c => {
  const p = mmP(c), A = 4; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(4, 29 + A, 26, 3);
  mmBisel(c, 4, 14 + A, 24, 15, '#7a4a26'); p(4, 20 + A, 24, 1, '#5e3a1c'); p(4, 25 + A, 24, 1, '#5e3a1c');
  mmBisel(c, 4, 7 + A, 24, 8, '#9a6034'); p(5, 6 + A, 22, 1, '#b07040'); for (const x of [7, 23]) { p(x, 7 + A, 3, 22, '#c9a24a'); p(x, 7 + A, 1, 22, '#f0d27a'); }
  mmBisel(c, 13, 13 + A, 6, 7, '#f0c93a'); p(15, 16 + A, 2, 3, '#3a2a10');
}, (c, X, Y, t) => { const f = (t / 1700 + X) % 4; if (f < .25) { const p = mmP(c), k = f * 16 | 0; p(X + 24, Y + 8 + 4 - k, 1, 5, '#fff'); p(X + 22, Y + 10 + 4 - k, 5, 1, '#fff'); } }, null);

mmObj('caja', 1, 1, 1, 4, c => {
  const p = mmP(c), A = 4; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(4, 29 + A, 26, 3);
  mmBisel(c, 4, 6 + A, 24, 24, '#a87c4a'); for (const y of [12, 18, 24]) p(5, y + A, 22, 1, '#7a5630');
  c.strokeStyle = '#6b4a28'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, 8 + A); c.lineTo(26, 28 + A); c.stroke(); p(4, 6 + A, 24, 3, '#c09060'); for (const [x, y] of [[6, 8], [25, 8], [6, 27], [25, 27]]) p(x, y + A, 1, 1, '#3b3f45');
}, null, null);

mmObj('telescopio', 1, 2, 1, 10, c => {
  const p = mmP(c), A = 10; c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(16, 62 + A, 13, 3, 0, 0, 7); c.fill();
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 2; for (const x of [5, 27, 16]) { c.beginPath(); c.moveTo(16, 38 + A); c.lineTo(x, 62 + A); c.stroke(); }
  mmBisel(c, 12, 33 + A, 8, 7, '#7a5a34');
  for (let i = 0; i < 26; i++) { const x = 3 + i, y = 30 - i * .62 + A; p(x, y | 0, 1, 6, i < 3 ? '#8a6a2a' : i % 7 === 0 ? '#8a6a2a' : '#d4b04a'); p(x, y | 0, 1, 1, '#f3dc8a'); }
  p(28, 10 + A, 3, 7, '#f3dc8a'); p(29, 11 + A, 1, 2, '#ffffff');
}, null, null);

mmObj('cuadro', 2, 1, 0, 0, c => {
  const p = mmP(c); mmBisel(c, 2, 2, 60, 26, '#6b4423'); p(5, 5, 54, 20, '#1d4f8f'); for (let k = 0; k < 9; k++) p(5 + k * 6, 5, 1, 20, '#2a5f9f'); for (let k = 0; k < 4; k++) p(5, 5 + k * 5, 54, 1, '#2a5f9f');
  c.strokeStyle = '#d6ecff'; c.lineWidth = 1; c.strokeRect(12.5, 9.5, 14, 11); c.beginPath(); c.moveTo(26, 15); c.lineTo(40, 9); c.lineTo(50, 18); c.stroke(); c.beginPath(); c.arc(44, 18, 3, 0, 7); c.stroke();
  p(30, 4, 3, 3, '#c0392b');
}, null, null);

mmObj('consola', 2, 1, 1, 14, c => {
  const p = mmP(c), A = 14; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2, 29 + A, 60, 3);
  mmBisel(c, 2, 12 + A, 60, 18, '#1f2630'); mmBisel(c, 4, 6 + A, 56, 7, '#2c3542'); for (let k = 0; k < 3; k++) mmBisel(c, 4 + k * 19, 0, 18, 13, '#11161d');
}, (c, X, Y, t, e) => {
  const p = mmP(c), A = 14;
  for (let k = 0; k < 3; k++) { const x = X + 6 + k * 19; p(x, Y + 2, 14, 9, '#04121a'); for (let i = 0; i < 14; i++) p(x + i, Y + 6 + Math.sin(t / 300 + i / 2 + k) * 3 | 0, 1, 1, e.borde); }
  for (let k = 0; k < 8; k++) p(X + 8 + k * 6, Y + A + 8, 3, 2, Math.sin(t / 250 + k * 1.7) > .2 ? ['#ff4d6a', '#39ff8a', '#ffcf4d', '#4fd8ff'][k % 4] : '#1a2028');
}, (o, X, Y, t, e) => [{ x: X + 32, y: Y + 10, r: 56, col: [70, 220, 255], a: .3 }]);

mmObj('tanque', 1, 2, 1, 10, c => {
  const p = mmP(c), A = 10; c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(16, 62 + A, 12, 3, 0, 0, 7); c.fill();
  mmBisel(c, 3, 52 + A, 26, 10, '#3a4452'); mmBisel(c, 3, 0, 26, 8, '#3a4452'); p(5, 8, 22, 44 + A, 'rgba(150,230,220,.18)');
}, (c, X, Y, t) => {
  const p = mmP(c), A = 10, nv = Y + 14 + Math.sin(t / 900) * 2; c.fillStyle = 'rgba(40,200,150,.55)'; c.fillRect(X + 5, nv, 22, Y + 52 + A - nv);
  const by = Y + 30 + Math.sin(t / 800) * 3; c.fillStyle = 'rgba(10,40,30,.7)'; c.beginPath(); c.ellipse(X + 16, by, 5, 7, 0, 0, 7); c.fill(); p(X + 14, by - 3, 1, 1, '#ffcf4d'); p(X + 17, by - 3, 1, 1, '#ffcf4d');
  for (let k = 0; k < 4; k++) { const yy = Y + 58 - ((t / 30 + k * 13) % 42); p(X + 8 + k * 4 + Math.sin(t / 200 + k) * 1.5 | 0, yy | 0, 2, 2, 'rgba(200,255,240,.8)'); }
  p(X + 7, Y + 9, 1, 50, 'rgba(255,255,255,.45)');
}, (o, X, Y) => [{ x: X + 16, y: Y + 38, r: 52, col: [60, 255, 180], a: .38 }]);

mmObj('sofa', 2, 1, 1, 10, c => {
  const p = mmP(c), A = 10; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2, 28 + A, 60, 4);
  mmBisel(c, 2, 0 + A, 60, 12, '#7a3843'); mmBisel(c, 2, 10 + A, 60, 16, '#6b2f3a'); mmBisel(c, 0, 6 + A, 8, 20, '#5c2832'); mmBisel(c, 56, 6 + A, 8, 20, '#5c2832');
  p(31, 12 + A, 1, 12, '#4a1f28'); p(10, 12 + A, 20, 1, '#8a4852'); p(33, 12 + A, 20, 1, '#8a4852');
}, null, null);

mmObj('antorcha', 1, 1, 0, 0, c => {
  const p = mmP(c); p(13, 22, 6, 3, '#2b2e33'); p(15, 17, 2, 7, '#3b3f45'); p(14, 11, 4, 11, '#6b4423'); p(14, 11, 1, 11, '#8a5a32'); mmBisel(c, 11, 8, 10, 5, '#4a4e55');
}, (c, X, Y, t, e, o) => mmLlama(c, X + 16, Y + 9, t + o.x * 777, 1),
(o, X, Y, t) => [{ x: X + 16, y: Y + 6, r: 125 + Math.sin(t / 90 + o.x) * 6 + Math.sin(t / 37 + o.y) * 4, col: [255, 160, 70], a: .9, bloom: 16 }]);

mmObj('lampara', 1, 1, 0, 0, c => { const p = mmP(c); mmBisel(c, 5, 8, 22, 7, '#1a1f26'); p(7, 15, 2, 4, '#1a1f26'); p(23, 15, 2, 4, '#1a1f26'); },
(c, X, Y, t, e) => { const p = mmP(c), col = e.luz === 'lampara' ? '#ffe2a0' : e.borde; p(X + 7, Y + 10, 18, 3, col); p(X + 7, Y + 10, 18, 1, '#ffffff'); },
(o, X, Y, t, e) => [{ x: X + 16, y: Y + 12, r: 110, col: e.luz === 'lampara' ? [255, 226, 160] : mmRGB(e.borde), a: .75, bloom: 14 }]);

mmObj('cables', 2, 1, 0, 0, c => {
  for (const [k, col] of [[0, '#1b1f25'], [1, '#2b5f9a'], [2, '#9a2b2b'], [3, '#2b8a4a']]) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 10 + k * 3); c.bezierCurveTo(16, 4 + k * 6, 34, 24 - k * 3, 50, 12 + k * 2); c.stroke(); }
  mmBisel(c, 48, 6, 14, 16, '#20262e'); mmP(c)(51, 9, 3, 2, '#39ff8a');
}, null, null);

const MM_CACHE_OBJ = new Map();
function mmSpriteObjeto(o) {
  const d = MM_OBJ[o.tipo]; if (!d) return null; const v = mmH(o.x, o.y, 60) % 997, k = `${o.tipo}|${v % 6}`;
  if (!MM_CACHE_OBJ.has(k)) { const cv = mmLienzo(d.w * MM_R, d.h * MM_R + d.alto); d.fijo(cv.getContext('2d'), v); MM_CACHE_OBJ.set(k, mmContorno(cv)); }
  return MM_CACHE_OBJ.get(k);
}
function mmLlama(c, x, y, t, k = 1) {                      // llama de 4 capas que baila
  const f = n => Math.sin(t / 70 + n) * .5 + Math.sin(t / 113 + n * 2.3) * .5;
  for (const [h, w, col] of [[15, 6, '#c2321f'], [12, 5, '#ff7a1e'], [9, 3.5, '#ffc93a'], [5, 2, '#fff6c8']]) {
    for (let j = 0; j < h * k; j++) { const r = j / (h * k), ww = Math.max(.5, w * k * Math.sin(Math.PI * (1 - r) * .9 + .25) * (1 - r * .35)), dx = f(j * .4) * r * 3; c.fillStyle = col; c.fillRect(Math.round(x - ww + dx), Math.round(y - j), Math.max(1, Math.round(ww * 2)), 1); }
  }
}

// ---------- personajes ----------
// look: { piel, pelo, estilo (corto|largo|punta|mono|calvo), ropa, ropa2, pantalon, sombrero (mago|casco|capucha), color del sombrero, barba, tunica, baston, orejas, mochila }
const MM_CACHE_PJ = new Map();
function mmPJ(L, dir, f, acc, parp) {
  const k = `${L.k}|${dir}|${f}|${acc}|${parp}`; if (MM_CACHE_PJ.has(k)) return MM_CACHE_PJ.get(k);
  if (MM_CACHE_PJ.size > 1500) MM_CACHE_PJ.clear();
  const cv = mmLienzo(28, 54), c = cv.getContext('2d'); c.translate(3, 16);
  const p = mmP(c), piel = L.piel || '#f1c7a0', pielS = mmTono(piel, -.2), ropa = L.ropa || '#6b6b75', ropaL = mmTono(ropa, .18), ropaS = mmTono(ropa, -.25), pant = L.pantalon || '#30344a', bota = '#2b211b', pelo = L.pelo || '#3a2414', peloL = mmTono(pelo, .25);
  const lado = dir === 'lado', atras = dir === 'arriba', anda = acc === 'anda', fase = anda ? [0, 1, 0, -1][f] : 0, y0 = !anda && f % 2 ? 1 : 0;
  if (L.especie === 'llama') { mmLlamaPJ(c, p, L, lado, atras, anda ? f : 0, y0, parp, acc); mmContorno(cv); MM_CACHE_PJ.set(k, cv); return cv; }
  // detrás: capa / mochila vista de frente asoma
  if (L.capa && !atras) { p(lado ? 4 : 5, 18 + y0, lado ? 5 : 12, 13, mmTono(L.capa, -.2)); }
  // piernas o túnica
  if (L.tunica) {
    for (let y = 18; y < 35; y++) { const w = lado ? 9 + ((y - 18) / 5 | 0) : 12 + ((y - 18) / 4 | 0), x = lado ? 7 - ((y - 18) / 10 | 0) : 11 - (w >> 1); p(x, y + (y < 27 ? y0 : 0), w, 1, y > 32 ? ropaS : ropa); p(x, y + (y < 27 ? y0 : 0), 1, 1, ropaL); p(x + w - 1, y + (y < 27 ? y0 : 0), 1, 1, ropaS); }
    if (!lado && L.ropa2) p(10, 20 + y0, 2, 14, L.ropa2);
    const pie = anda ? [0, 2, 0, -2][f] : 0; p(lado ? 9 + pie : 7, 34, 4, 2, bota); if (!lado) p(12, 34, 4, 2, bota);
  } else if (lado) {
    const a = anda ? [0, 3, 0, -3][f] : 0;
    p(9 - a, 27, 3, 6, mmTono(pant, -.2)); p(8 - a, 32, 5, 3, mmTono(bota, -.1));
    p(9 + a, 27, 3, 6, pant); p(9 + a, 32, 5, 3, bota); p(9 + a, 27, 1, 5, mmTono(pant, .15));
  } else {
    const l = fase > 0 ? 1 : 0, r = fase < 0 ? 1 : 0;
    p(7, 27, 3, 6 - l, pant); p(12, 27, 3, 6 - r, pant); p(7, 27, 1, 5 - l, mmTono(pant, .15)); p(14, 27, 1, 5 - r, mmTono(pant, -.2));
    p(6, 32 - l, 4, 3, bota); p(12, 32 - r, 4, 3, bota); p(6, 32 - l, 4, 1, mmTono(bota, .2)); p(12, 32 - r, 4, 1, mmTono(bota, .2));
  }
  // torso
  if (!L.tunica) {
    if (lado) { p(7, 18 + y0, 8, 10, ropa); p(7, 18 + y0, 1, 10, ropaL); p(14, 18 + y0, 1, 10, ropaS); p(7, 25 + y0, 8, 2, '#3a2a1a'); }
    else { p(5, 18 + y0, 12, 10, ropa); p(5, 18 + y0, 1, 10, ropaL); p(15, 18 + y0, 2, 10, ropaS); p(8, 18 + y0, 6, 1, L.ropa2 || ropaS); p(5, 25 + y0, 12, 2, '#3a2a1a'); if (!atras) p(10, 25 + y0, 2, 2, '#e0b44a'); }
  }
  if (L.emblema && !atras) { const g = MM_EMBLEMA[L.emblema]; if (g) g.forEach((fila, j) => { for (let i = 0; i < 5; i++) if (fila[i] !== '.') p((lado ? 9 : 9) + i, 19 + j + y0, 1, 1, fila[i] === '#' ? L.emCol || '#ffffff' : L.emCol2 || mmTono(L.emCol || '#ffffff', -.3)); }); }
  if (atras && L.mochila) { mmBisel(c, 7, 19 + y0, 8, 8, '#7a5230'); p(7, 19 + y0, 8, 2, '#9a6b40'); }
  if (lado && L.mochila) { mmBisel(c, 3, 19 + y0, 4, 7, '#7a5230'); }
  if (atras && L.capa) { p(5, 18 + y0, 12, 14, L.capa); p(5, 18 + y0, 1, 14, mmTono(L.capa, .2)); p(16, 18 + y0, 1, 14, mmTono(L.capa, -.3)); }
  // brazos de atrás (de frente/espalda) y cabeza
  const braz = (x, y, w, h, col, mano = true) => { p(x, y, w, h, col); if (mano) p(x, y + h, w, 2, piel); };
  if (!lado) {
    if (acc === 'trabaja' && !atras) { braz(3, 19 + y0, 3, 4, ropa, false); braz(16, 19 + y0, 3, 4, ropaS, false); p(5, 22 + y0, 4, 2, ropa); p(13, 22 + y0, 4, 2, ropaS); p(7, 23 + y0 + (f % 2), 3, 2, piel); p(12, 23 + y0 + ((f + 1) % 2), 3, 2, piel); }
    else { braz(2, 19 + y0 + fase, 3, 7, ropa); p(2, 19 + y0 + fase, 1, 7, ropaL); braz(17, 19 + y0 - fase, 3, 7, ropaS); }
  }
  // cabeza
  if (lado) {
    p(6, 6 + y0, 11, 12, piel); c.clearRect(6, 6 + y0, 1, 1); c.clearRect(16, 6 + y0, 1, 1); c.clearRect(6, 17 + y0, 1, 1); c.clearRect(16, 17 + y0, 1, 1);
    p(6, 16 + y0, 10, 1, pielS); p(17, 12 + y0, 1, 2, piel); p(8, 11 + y0, 2, 3, pielS);
    if (!L.barba) p(14, 15 + y0, 2, 1, mmTono(piel, -.35));
    if (parp) p(13, 13 + y0, 2, 1, '#1b1d2a'); else { p(13, 12 + y0, 2, 2, '#1b1d2a'); p(14, 12 + y0, 1, 1, '#ffffff'); }
  } else {
    p(5, 6 + y0, 12, 12, piel); for (const [x, y] of [[5, 6], [16, 6], [5, 17], [16, 17]]) c.clearRect(x, y + y0, 1, 1);
    p(16, 7 + y0, 1, 10, pielS); p(6, 17 + y0, 10, 1, pielS);
    if (!atras) {
      if (parp) { p(7, 13 + y0, 2, 1, '#1b1d2a'); p(13, 13 + y0, 2, 1, '#1b1d2a'); }
      else { p(7, 12 + y0, 2, 2, '#1b1d2a'); p(13, 12 + y0, 2, 2, '#1b1d2a'); p(7, 12 + y0, 1, 1, '#ffffff'); p(13, 12 + y0, 1, 1, '#ffffff'); }
      if (!L.barba) p(10, 15 + y0, 2, 1, mmTono(piel, -.35));
      if (!L.orejas && mmRGB(piel)[0] > 200) { p(6, 14 + y0, 1, 1, '#eba393'); p(15, 14 + y0, 1, 1, '#eba393'); }
      if (L.orejas) p(10, 13 + y0, 2, 2, pielS);
    }
  }
  if (L.gafas && !atras) { if (lado) { p(11, 11 + y0, 7, 3, '#15161c'); p(13, 12 + y0, 4, 1, L.gafas); } else { p(5, 11 + y0, 12, 3, '#15161c'); p(6, 12 + y0, 4, 1, L.gafas); p(12, 12 + y0, 4, 1, L.gafas); } }
  // orejas de goblin
  if (L.orejas) { if (lado) { p(2, 9 + y0, 6, 2, piel); p(3, 8 + y0, 3, 1, piel); p(2, 11 + y0, 3, 1, pielS); } else { p(0, 10 + y0, 5, 2, piel); p(1, 9 + y0, 3, 1, piel); p(17, 10 + y0, 5, 2, piel); p(18, 9 + y0, 3, 1, piel); p(0, 12 + y0, 3, 1, pielS); p(19, 12 + y0, 3, 1, pielS); } }
  // pelo
  const est = L.sombrero ? 'calvo' : L.estilo || 'corto';
  if (atras) { if (est !== 'calvo' || L.sombrero === 'mago') { p(5, 4 + y0, 12, est === 'largo' ? 16 : 13, pelo); p(4, 6 + y0, 2, est === 'largo' ? 13 : 9, pelo); p(16, 6 + y0, 2, est === 'largo' ? 13 : 9, pelo); p(7, 5 + y0, 6, 1, peloL); } }
  else if (lado) {
    if (est !== 'calvo') { p(5, 4 + y0, 11, 4, pelo); p(5, 6 + y0, 4, est === 'largo' ? 13 : 8, pelo); p(9, 8 + y0, 7, 2, pelo); p(7, 4 + y0, 6, 1, peloL); if (est === 'punta') { p(6, 2 + y0, 2, 2, pelo); p(10, 1 + y0, 2, 3, pelo); p(13, 2 + y0, 2, 2, pelo); } if (est === 'mono') p(4, 2 + y0, 4, 4, pelo); }
  } else if (est !== 'calvo') {
    p(5, 4 + y0, 12, 4, pelo); p(4, 6 + y0, 2, est === 'largo' ? 12 : 5, pelo); p(16, 6 + y0, 2, est === 'largo' ? 12 : 5, pelo); p(6, 8 + y0, 10, 2, pelo); p(6, 4 + y0, 10, 1, peloL);
    p(9, 9 + y0, 1, 1, piel); p(13, 9 + y0, 1, 1, piel);
    if (est === 'punta') { p(5, 2 + y0, 2, 2, pelo); p(8, 1 + y0, 2, 3, pelo); p(11, 0 + y0, 2, 4, pelo); p(14, 2 + y0, 2, 2, pelo); }
    if (est === 'mono') { p(9, 1 + y0, 4, 3, pelo); p(10, 1 + y0, 2, 1, peloL); }
  }
  // sombreros
  const S = L.color || '#3d2f7a';
  if (L.sombrero === 'mago') {
    if (!atras) { p(4, 7 + y0, 2, 7, pelo); p(16, 7 + y0, 2, 7, pelo); }
    p(lado ? 3 : 2, 6 + y0, lado ? 17 : 18, 2, mmTono(S, -.15));
    for (let j = 0; j < 16; j++) { const w = Math.max(2, 12 - Math.floor(j * .75)), b = j > 9 ? j - 9 : 0, x = 11 - (w >> 1) + (lado ? -b : atras ? -b : b); p(x, 5 + y0 - j, w, 1, j % 6 === 0 ? mmTono(S, .15) : S); p(x, 5 + y0 - j, 1, 1, mmTono(S, .25)); }
    p(5, 4 + y0, 12, 1, '#e0b44a'); if (!atras) { p(8, -1 + y0, 1, 1, '#ffd34d'); p(12, -5 + y0, 1, 1, '#ffd34d'); p(10, 1 + y0, 1, 1, '#ffd34d'); }
  } else if (L.sombrero === 'casco') {
    p(5, 2 + y0, 12, 6, S); p(6, 2 + y0, 9, 1, mmTono(S, .3)); p(4, 7 + y0, 14, 2, mmTono(S, -.2));
    if (!atras) { if (lado) { p(16, 4 + y0, 2, 3, '#fffbe0'); } else { p(9, 3 + y0, 4, 3, '#8a8f96'); p(10, 3 + y0, 2, 2, '#fffbe0'); } }
  } else if (L.sombrero === 'capucha') {
    if (atras) { p(4, 3 + y0, 14, 16, S); p(9, 1 + y0, 4, 2, S); }
    else if (lado) { p(4, 3 + y0, 12, 4, S); p(4, 5 + y0, 5, 13, S); p(5, 3 + y0, 8, 1, mmTono(S, .2)); }
    else { p(4, 3 + y0, 14, 5, S); p(3, 6 + y0, 3, 12, S); p(16, 6 + y0, 3, 12, S); p(6, 8 + y0, 10, 1, mmTono(S, -.35)); p(5, 3 + y0, 12, 1, mmTono(S, .2)); }
  }
  // barba
  if (L.barba && !atras) {
    const B = L.barba, Bs = mmTono(B, -.15);
    if (lado) { p(11, 14 + y0, 7, 5, B); p(12, 19 + y0, 5, 3, B); p(13, 22 + y0, 3, 2, Bs); p(14, 14 + y0, 4, 1, Bs); }
    else { p(6, 14 + y0, 10, 4, B); p(7, 18 + y0, 8, 4, B); p(8, 22 + y0, 6, 2, Bs); p(10, 24 + y0, 2, 1, Bs); p(7, 14 + y0, 8, 1, Bs); p(15, 15 + y0, 1, 6, Bs); }
  }
  // brazo de delante en perfil + bastón
  if (lado) {
    const a = anda ? [0, 2, 0, -2][f] : 0;
    if (acc === 'conjura') { p(11, 12 + y0, 3, 8, ropa); p(12, 10 + y0, 3, 2, piel); }
    else if (acc === 'trabaja') { p(10, 20 + y0, 7, 3, ropa); p(17, 20 + y0 + (f % 2), 2, 3, piel); }
    else { p(10 + a, 19 + y0, 3, 7, ropaS); p(10 + a, 19 + y0, 1, 7, ropa); p(10 + a, 26 + y0, 3, 2, piel); }
  }
  if (L.baston) {
    if (acc === 'conjura') { p(13, -4 + y0, 2, 38, '#6b4a2a'); p(12, -8 + y0, 4, 4, '#bff9ff'); p(13, -7 + y0, 2, 2, '#ffffff'); }
    else { p(lado ? 15 : 19, 6 + y0, 2, 29, '#6b4a2a'); p(lado ? 14 : 18, 2 + y0, 4, 4, '#7fd8e9'); p(lado ? 15 : 19, 3 + y0, 1, 1, '#ffffff'); }
  }
  mmContorno(cv); MM_CACHE_PJ.set(k, cv); return cv;
}

// glifos de las burbujas (5×7)
const MM_GLIFO = { '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'], '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '✓': ['00000', '00001', '00011', '10110', '11100', '01000', '00000'], '×': ['00000', '10001', '01010', '00100', '01010', '10001', '00000'] };
function mmBurbuja(c, x, y, s, t) {
  const p = mmP(c), roja = s === '!', W = 17, H = 14, X = Math.round(x - W / 2), Y = Math.round(y - H);
  p(X + 1, Y - 1, W - 2, H + 2, '#0d0f16'); p(X - 1, Y + 1, W + 2, H - 2, '#0d0f16'); p(X, Y, W, H, '#0d0f16');
  p(X + 1, Y, W - 2, H, roja ? '#ffe3e7' : '#f7f9fc'); p(X, Y + 1, W, H - 2, roja ? '#ffe3e7' : '#f7f9fc'); p(X + 1, Y + H - 2, W - 2, 1, roja ? '#f3b9c2' : '#d4dbe6');
  p(X + 6, Y + H, 4, 2, '#0d0f16'); p(X + 7, Y + H, 2, 1, roja ? '#ffe3e7' : '#f7f9fc'); p(X + 7, Y + H + 2, 2, 1, '#0d0f16');
  if (s === '…') { for (let i = 0; i < 3; i++) p(X + 4 + i * 4, Y + 6 + (Math.floor(t / 180) % 3 === i ? -1 : 0), 2, 2, '#2a2f3a'); return; }
  const g = MM_GLIFO[s], col = roja ? '#e8233b' : s === '✓' ? '#1f9d55' : s === '×' ? '#c0392b' : '#2a2f3a';
  if (g) g.forEach((f, j) => { for (let i = 0; i < 5; i++) if (f[i] === '1') p(X + 6 + i, Y + 3 + j, 1, 1, col); });
}

// rayo con ramas entre dos puntos
function mmRayo(c, x1, y1, x2, y2, sem, fuerza = 1) {
  const n = 9, pts = [[x1, y1]];
  for (let i = 1; i < n; i++) { const f = i / n; pts.push([x1 + (x2 - x1) * f + (mmF(sem, i, 70) - .5) * 18, y1 + (y2 - y1) * f + (mmF(i, sem, 71) - .5) * 18]); }
  pts.push([x2, y2]);
  const trazo = (P, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y))); c.stroke(); };
  trazo(pts, 6 * fuerza, 'rgba(60,180,255,.18)'); trazo(pts, 3 * fuerza, 'rgba(120,230,255,.45)'); trazo(pts, 1, '#f2ffff');
  const b = 2 + (sem % 5), [bx, by] = pts[b]; trazo([[bx, by], [bx + (mmF(sem, 1, 72) - .5) * 26, by + (mmF(sem, 2, 72) - .2) * 22]], 1, 'rgba(200,250,255,.8)');
}

// emblemas del pecho (5×5): '#' color principal, '+' secundario
const MM_EMBLEMA = {
  sol: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], nudo: ['.###.', '#.+.#', '#+++#', '#.+.#', '.###.'], chispa: ['..#..', '.+#+.', '#####', '.+#+.', '..#..'],
  ballena: ['.....', '.###+', '#####', '.###.', '..#..'], ruta: ['#..#.', '.#..#', '..###', '.#..#', '#..#.'], chip: ['+#+#+', '#####', '+#.#+', '#####', '+#+#+'],
  x: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], rayo: ['..##.', '.##..', '####.', '..##.', '.##..'], franjas: ['#####', '+++++', '#####', '+++++', '#####'],
  asterisco: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'], cara: ['.###.', '#+#+#', '#####', '#+++#', '.###.'], ojo: ['.###.', '#+++#', '#+#+#', '#+++#', '.###.'],
  luna: ['.##..', '#....', '#....', '#....', '.##..'], llaves: ['.#.#.', '#...#', '#...#', '#...#', '.#.#.'],
};

// la llama de Ollama: lana blanca, cuello largo, orejas tiesas
function mmLlamaPJ(c, p, L, lado, atras, f, y0, parp, acc) {
  const lana = L.ropa || '#f4f4f4', som = mmTono(lana, -.16), osc = mmTono(lana, -.32), pezu = '#2a2724', rosa = '#e8a0a8';
  const pata = [0, 1, 0, -1][f];
  if (lado) {
    for (const [x, d] of [[5, pata], [8, -pata], [12, -pata], [15, pata]]) { p(x, 28 + Math.max(0, d), 2, 6 - Math.max(0, d), x < 10 ? som : lana); p(x, 33, 2, 2, pezu); }
    p(3, 18 + y0, 15, 11, lana); for (let i = 0; i < 15; i += 2) { p(3 + i, 17 + y0, 2, 1, lana); p(3 + i, 29, 2, 1, som); } p(3, 26 + y0, 15, 3, som); p(2, 20 + y0, 1, 6, lana);
    p(13, 8 + y0, 4, 11, lana); p(16, 9 + y0, 1, 10, som);
    p(12, 3 + y0, 7, 8, lana); p(18, 6 + y0, 3, 4, mmTono(lana, -.06)); p(20, 8 + y0, 1, 1, pezu); p(18, 10 + y0, 2, 1, osc);
    p(13, 0 + y0, 2, 4, lana); p(13, 1 + y0, 1, 2, rosa);
    if (parp) p(16, 6 + y0, 2, 1, pezu); else { p(16, 5 + y0, 2, 2, pezu); p(16, 5 + y0, 1, 1, '#ffffff'); }
    return;
  }
  for (const [x, d] of [[6, pata], [14, -pata]]) { p(x, 28 + Math.max(0, d), 3, 6 - Math.max(0, d), lana); p(x, 33, 3, 2, pezu); }
  p(4, 17 + y0, 14, 12, lana); for (let i = 0; i < 14; i += 2) { p(4 + i, 16 + y0, 2, 1, lana); p(3, 18 + y0 + i % 10, 1, 2, lana); p(18, 18 + y0 + i % 10, 1, 2, som); } p(4, 26 + y0, 14, 3, som); p(16, 17 + y0, 2, 9, som);
  p(8, 9 + y0, 6, 9, lana); p(13, 9 + y0, 1, 9, som);
  p(6, 2 + y0, 10, 9, lana); p(15, 3 + y0, 1, 8, som);
  p(6, -2 + y0, 2, 5, lana); p(14, -2 + y0, 2, 5, lana); p(6, -1 + y0, 1, 3, rosa); p(15, -1 + y0, 1, 3, rosa);
  if (!atras) {
    p(8, 7 + y0, 6, 4, mmTono(lana, -.06)); p(10, 8 + y0, 2, 1, pezu); p(9, 10 + y0, 4, 1, osc);
    if (parp) { p(7, 5 + y0, 2, 1, pezu); p(13, 5 + y0, 2, 1, pezu); } else { p(7, 4 + y0, 2, 2, pezu); p(13, 4 + y0, 2, 2, pezu); p(7, 4 + y0, 1, 1, '#ffffff'); p(13, 4 + y0, 1, 1, '#ffffff'); }
    if (acc === 'trabaja') p(10, 11 + y0 + (f % 2), 2, 1, rosa);
  }
}

// iconos de herramienta (7×7) para las burbujas y su color
const MM_ICONO = {
  web: ['.#####.', '#.#.#.#', '#######', '#.#.#.#', '#######', '#.#.#.#', '.#####.'], shell: ['#######', '#.....#', '#.#...#', '#..#..#', '#.#.###', '#.....#', '#######'],
  archivo: ['#####..', '#...##.', '#....##', '#.###.#', '#.....#', '#.###.#', '#######'], memoria: ['###.###', '#.##..#', '#..#..#', '#.##.##', '#..#..#', '#.##..#', '###.###'],
  delegar: ['.#...#.', '###.###', '.#...#.', '###.###', '#.#.#.#', '.......', '.......'], vista: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
  tarea: ['.#####.', '#..#..#', '#..#..#', '#..###.', '#.....#', '#.....#', '.#####.'], mcp: ['.#...#.', '.#...#.', '#######', '#######', '.#####.', '...#...', '...#...'],
  otro: ['..#.#..', '.#####.', '##...##', '.#...#.', '##...##', '.#####.', '..#.#..'],
};
const MM_EFECTO = { web: [70, 160, 255], shell: [60, 230, 120], archivo: [240, 180, 70], memoria: [255, 60, 90], delegar: [180, 110, 255], vista: [170, 90, 255], tarea: [255, 150, 70], mcp: [60, 220, 220], otro: [120, 220, 255] };
function mmCategoria(nombre = '') {
  const n = String(nombre);
  if (/^(web|WebFetch|WebSearch|archive_|navegador|google_web|fetch|buscar_web)/i.test(n)) return 'web';
  if (/^(shell|Bash|PowerShell|run_shell|ejecutar|terminal)/i.test(n)) return 'shell';
  if (/(memoria|recordar|olvidar|^Memoria$|buscar_historial)/i.test(n)) return 'memoria';
  if (/^(delegar|Task|Agent)$/i.test(n)) return 'delegar';
  if (/(pantalla|control|escritorio|computer|demostracion)/i.test(n)) return 'vista';
  if (/(tarea|programar)/i.test(n)) return 'tarea';
  if (/(archivo|^Read$|^Write$|^Edit$|^Glob$|^Grep$|listar|Notebook|skill)/i.test(n)) return 'archivo';
  if (/^mcp__/.test(n)) return 'mcp';
  return 'otro';
}
function mmBurbujaIcono(c, x, y, cat, t) {
  const p = mmP(c), W = 17, H = 14, X = Math.round(x - W / 2), Y = Math.round(y - H), col = MM_EFECTO[cat] || MM_EFECTO.otro, hex = `rgb(${col[0] * .75 | 0},${col[1] * .75 | 0},${col[2] * .75 | 0})`;
  p(X + 1, Y - 1, W - 2, H + 2, '#0d0f16'); p(X - 1, Y + 1, W + 2, H - 2, '#0d0f16'); p(X, Y, W, H, '#0d0f16');
  p(X + 1, Y, W - 2, H, '#f7f9fc'); p(X, Y + 1, W, H - 2, '#f7f9fc'); p(X + 1, Y + H - 2, W - 2, 1, '#d4dbe6');
  p(X + 6, Y + H, 4, 2, '#0d0f16'); p(X + 7, Y + H, 2, 1, '#f7f9fc'); p(X + 7, Y + H + 2, 2, 1, '#0d0f16');
  const g = MM_ICONO[cat] || MM_ICONO.otro, gira = cat === 'web' ? Math.floor(t / 200) % 2 : 0;
  g.forEach((f, j) => { for (let i = 0; i < 7; i++) if (f[(i + (j % 2 ? gira : 0)) % 7] === '#') p(X + 5 + i, Y + 3 + j, 1, 1, hex); });
}
// aura alrededor de quien usa una herramienta (se dibuja en modo 'lighter')
function mmAura(c, x, y, cat, t, k = 1) {
  const [r, g, b] = MM_EFECTO[cat] || MM_EFECTO.otro, cy = y - 30, pul = .75 + Math.sin(t / 220) * .25;
  const gr = c.createRadialGradient(x, cy, 4, x, cy, 38); gr.addColorStop(0, `rgba(${r},${g},${b},${.32 * pul * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - 38, cy - 38, 76, 76);
  c.strokeStyle = `rgba(${r},${g},${b},${.75 * k})`; c.lineWidth = 1;
  if (cat === 'web') { for (let i = 0; i < 3; i++) { const w = Math.abs(Math.cos(t / 700 + i * 1.05)) * 22 + 2; c.beginPath(); c.ellipse(x, cy, w, 24, 0, 0, 7); c.stroke(); } c.beginPath(); c.ellipse(x, cy, 24, 8, 0, 0, 7); c.stroke(); c.beginPath(); c.ellipse(x, cy, 24, 24, 0, 0, 7); c.stroke(); }
  else if (cat === 'delegar') { c.beginPath(); c.ellipse(x, y, 22, 8, 0, 0, 7); c.stroke(); c.setLineDash([3, 3]); c.lineDashOffset = t / 40; c.beginPath(); c.ellipse(x, y, 17, 6, 0, 0, 7); c.stroke(); c.setLineDash([]); for (let i = 0; i < 6; i++) { const a = t / 600 + i * 1.047; c.fillStyle = `rgba(${r},${g},${b},.9)`; c.fillRect(x + Math.cos(a) * 20 | 0, y + Math.sin(a) * 7 | 0, 2, 2); } }
  else { c.setLineDash([2, 4]); c.lineDashOffset = -t / 50; c.beginPath(); c.ellipse(x, cy, 20 + Math.sin(t / 300) * 2, 26, 0, 0, 7); c.stroke(); c.setLineDash([]); }
}
// corriente de datos con paquetes que viajan de (x1,y1) a (x2,y2)
function mmCorriente(c, x1, y1, x2, y2, col, t, ancho = 1) {
  const [r, g, b] = col, cx = (x1 + x2) / 2, cy = Math.min(y1, y2) - 40 - Math.abs(x2 - x1) * .12;
  const traza = (w, a) => { c.strokeStyle = `rgba(${r},${g},${b},${a})`; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2); c.stroke(); };
  traza(7 * ancho, .12); traza(3 * ancho, .35); c.setLineDash([4, 6]); c.lineDashOffset = -t / 25; traza(1, .9); c.setLineDash([]);
  for (let k = 0; k < 5; k++) { const u = (t / 900 + k / 5) % 1, x = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * cx + u * u * x2, y = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * cy + u * u * y2;
    c.fillStyle = `rgba(${r},${g},${b},.5)`; c.fillRect(x - 2 | 0, y - 2 | 0, 5, 5); c.fillStyle = '#ffffff'; c.fillRect(x | 0, y | 0, 2, 2); }
}
