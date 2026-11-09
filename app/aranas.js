// Arañas digitales en la isla: salen de dentro del casco (bajan colgadas de su hilo y se van corriendo hacia el borde,
// "al navegador / a Discord / a GitHub") y vuelven al casco cuando terminan. Mismo dibujo que extension/aranas.js.
// Canvas propio con pointer-events:none (el hit-test de la isla lo ignora: no bloquea clics).
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';
document.body.appendChild(cv);
const c = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, anim = 0, ultimo = 0;
const medir = () => { DPR = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; };
medir(); addEventListener('resize', medir);
const aranas = [];
const PATAS = [[0.95, 1.0], [0.35, 1.25], [-0.25, 1.25], [-0.85, 1.0]];

function nueva(x, y, color, ruta, escala = 1) {
  const a = { x, y, color, ang: Math.PI / 2, r: 6 * escala, ruta, vel: 260, alpha: 0, hilo: null, patas: [], fase: 0, fin: false };
  for (let k = 0; k < 8; k++) a.patas.push({ px: x, py: y, t: 1 });
  aranas.push(a); arrancar(); return a;
}
function reposo(a, k) {
  const [f, s] = PATAS[k % 4], lado = k < 4 ? -1 : 1, R = a.r * 2.1, ca = Math.cos(a.ang), sa = Math.sin(a.ang);
  return [a.x + ca * f * R - sa * lado * s * R, a.y + sa * f * R + ca * lado * s * R];
}
function mover(a, dt) {
  const o = a.ruta[0];
  if (o && o.espera > 0) { o.espera -= dt; }
  else if (o) {
    const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy), paso = (o.vel || a.vel) * dt;
    if (d > 0.5 && !o.colgada) a.ang += (((Math.atan2(dy, dx) - a.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 10);
    if (o.r) a.r += (o.r - a.r) * Math.min(1, dt * 4);
    if (d <= paso) { a.x = o.x; a.y = o.y; a.ruta.shift(); o.al && o.al(a); } else { a.x += dx / d * paso; a.y += dy / d * paso; }
  } else a.fin = true;
  a.alpha = a.fin ? a.alpha - dt * 3 : Math.min(1, a.alpha + dt * 3);
  if (a.ruta[0]?.colgada) { a.patas.forEach((p, k) => { const [rx, ry] = reposo(a, k); p.px += (rx - p.px) * .3; p.py += (ry - p.py + Math.sin(a.fase * 8 + k) * 2) * .3; }); a.fase += dt; return; }
  a.fase += dt;
  const grupo = Math.floor(a.fase * 9) % 2;
  a.patas.forEach((p, k) => {
    const [rx, ry] = reposo(a, k);
    if (p.t >= 1 && (k + (k < 4 ? 0 : 1)) % 2 === grupo && Math.hypot(rx - p.px, ry - p.py) > a.r * 1.1) { p.sx = p.px; p.sy = p.py; p.tx = rx + Math.cos(a.ang) * a.r * .6; p.ty = ry + Math.sin(a.ang) * a.r * .6; p.t = 0; }
    if (p.t < 1) { p.t = Math.min(1, p.t + dt * 10); p.px = p.sx + (p.tx - p.sx) * p.t; p.py = p.sy + (p.ty - p.sy) * p.t; }
  });
}
function dibujar(a) {
  c.save(); c.globalAlpha = Math.max(0, a.alpha); c.strokeStyle = a.color; c.fillStyle = a.color; c.shadowColor = a.color; c.shadowBlur = 8; c.lineWidth = Math.max(1, a.r / 6); c.lineCap = 'round';
  if (a.hilo) { c.globalAlpha *= .6; c.lineWidth = .8; c.beginPath(); c.moveTo(a.hilo.x, a.hilo.y); c.lineTo(a.x, a.y); c.stroke(); c.globalAlpha = Math.max(0, a.alpha); c.lineWidth = Math.max(1, a.r / 6); }
  a.patas.forEach((p, k) => {
    const lado = k < 4 ? -1 : 1, [f] = PATAS[k % 4];
    const bx = a.x + Math.cos(a.ang) * f * a.r * .35, by = a.y + Math.sin(a.ang) * f * a.r * .35, mx = (bx + p.px) / 2, my = (by + p.py) / 2;
    const nx = -Math.sin(a.ang) * lado, ny = Math.cos(a.ang) * lado;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(mx + nx * a.r * .7, my + ny * a.r * .7 - a.r * .5); c.lineTo(p.px, p.py); c.stroke();
  });
  c.translate(a.x, a.y); c.rotate(a.ang);
  c.beginPath(); c.ellipse(-a.r * .95, 0, a.r * .85, a.r * .62, 0, 0, Math.PI * 2); c.globalAlpha *= .35; c.fill(); c.globalAlpha = Math.max(0, a.alpha); c.stroke();
  c.beginPath(); c.arc(a.r * .15, 0, a.r * .42, 0, Math.PI * 2); c.fill();
  c.restore();
}
function frame(t) {
  const dt = Math.min(.05, (t - (ultimo || t)) / 1000); ultimo = t;
  for (const a of [...aranas]) { mover(a, dt); if (a.fin && a.alpha <= 0) aranas.splice(aranas.indexOf(a), 1); }
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  for (const a of aranas) dibujar(a);
  if (aranas.length) anim = requestAnimationFrame(frame); else { anim = 0; ultimo = 0; c.clearRect(0, 0, W, H); }
}
function arrancar() { if (!anim) anim = requestAnimationFrame(frame); }

// borde más cercano hacia el que se van (fuera de la ventana)
function bordeLejos(x, y) {
  const op = [[x, -30], [x, H + 30], [-30, y], [W + 30, y]];
  const d = op.map(([px, py]) => Math.hypot(px - x, py - y) + (py > H ? 40 : 0));
  return op[d.indexOf(Math.min(...d))];
}

// salen del casco: aparecen pequeñas en el visor, crecen, bajan por su hilo y corren hacia el borde
export function salirDelCasco(x, y, color, n = 3) {
  for (let k = 0; k < n; k++) {
    const ox = (k - (n - 1) / 2) * 14, baja = 34 + k * 9, [bx, by] = bordeLejos(x + ox * 3, y + baja);
    const a = nueva(x + ox * .3, y, color, [
      { x: x + ox * .3, y, espera: k * .28 },
      { x: x + ox, y: y + baja, vel: 70, colgada: true, r: 6, al: ar => { ar.hilo = null; } },
      { x: x + ox * 2.2, y: y + baja + 10, vel: 120, espera: .15 },
      { x: bx, y: by, vel: 300 + k * 40 },
    ], .25);
    a.hilo = { x: x + ox * .3, y };
  }
}
// vuelven: entran por el borde, corren al casco, suben por el hilo y se encogen dentro
export function volverAlCasco(x, y, color, n = 2) {
  for (let k = 0; k < n; k++) {
    const [bx, by] = bordeLejos(x + (k ? 60 : -60), y + 40);
    const a = nueva(bx, by, color, [
      { x: bx, y: by, espera: k * .35 },
      { x: x + (k ? 10 : -10), y: y + 36, vel: 320, al: ar => { ar.hilo = { x, y }; } },
      { x: x, y: y + 4, vel: 60, colgada: true, r: 1.5, al: ar => { ar.hilo = null; } },
    ]);
  }
}
