// Arañas digitales en la isla: el casco abre su compuerta (robot.abrirCasco) y salen del nido: asoman, se descuelgan
// por su hilo, se quedan un momento amenazando y salen corriendo a tirones hacia el borde ("al navegador / a Discord / a GitHub").
// Al terminar vuelven corriendo, trepan por el hilo y se meten dentro. Dibujo y movimiento: arana-motor.js (copia de extension/).
// Canvas con pointer-events:none (el hit-test de la isla lo ignora: no bloquea clics).
import './arana-motor.js';
const M = globalThis.AranaMotor;
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';
document.body.appendChild(cv);
const c = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, anim = 0, ultimo = 0;
const medir = () => { DPR = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; };
medir(); addEventListener('resize', medir);
const aranas = [];

function frame(t) {
  const dt = Math.min(.05, (t - (ultimo || t)) / 1000); ultimo = t;
  for (const a of [...aranas]) { M.mover(a, dt); if (!a.ruta.length && !a.fuera && !a.vagar) a.fuera = true; if (a.fuera && a.alpha <= 0) aranas.splice(aranas.indexOf(a), 1); }
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  for (const a of aranas) M.dibujar(c, a, 0, 0, { W, H });
  if (aranas.length) anim = requestAnimationFrame(frame); else { anim = 0; ultimo = 0; c.clearRect(0, 0, W, H); }
}
const arrancar = () => { if (!anim) anim = requestAnimationFrame(frame); };

function bordeLejos(x, y, k) {                      // se reparten hacia bordes distintos
  const op = [[x + (k - 1) * 120, H + 40], [-40, y + k * 40], [W + 40, y + k * 30], [x + (k - 1) * 200, -40]];
  const orden = op.map((p, i) => [Math.hypot(p[0] - x, p[1] - y), i]).sort((a, b) => a[0] - b[0]);
  return op[orden[k % 3][1]];
}

// salen del nido: x,y = centro del visor (en píxeles de la ventana); tam = tamaño del robot en pantalla
export function salirDelCasco(x, y, color, n = 3, tam = 90) {
  const r = Math.max(4, Math.min(8, tam / 16));
  for (let k = 0; k < n; k++) {
    const ox = (k - (n - 1) / 2) * tam * .16, baja = tam * .45 + k * 10, [bx, by] = bordeLejos(x, y + baja, k);
    const a = M.crear('isla', color, x + ox * .4, y, { r: r * .2, ang: Math.PI / 2, vel: 220 });
    a.ruta = [
      { x: x + ox * .4, y, espera: .5 + k * .35 },                                        // espera a que la compuerta esté abierta
      { x: x + ox, y: y + tam * .12, vel: 40, r, al: ar => { ar.hilo = { x: ar.x, y: ar.y }; } },   // asoma del nido y crece
      { x: x + ox, y: y + baja, vel: 55, colgada: true },                                  // se descuelga por su hilo
      { x: x + ox * 1.6, y: y + baja + 6, vel: 90, al: ar => { ar.hilo = null; ar.pausa = .7; ar.temblor = 1; } },   // se suelta y amenaza
      { x: bx, y: by, vel: 260 + k * 50 },
    ];
    aranas.push(a);
  }
  arrancar();
}
// vuelven al nido
export function volverAlCasco(x, y, color, n = 2, tam = 90) {
  const r = Math.max(4, Math.min(8, tam / 16));
  for (let k = 0; k < n; k++) {
    const [bx, by] = bordeLejos(x, y + tam * .4, k + 1), ox = (k ? 1 : -1) * tam * .12;
    const a = M.crear('isla', color, bx, by, { r, vel: 300 });
    a.ruta = [
      { x: bx, y: by, espera: k * .4 },
      { x: x + ox, y: y + tam * .5, vel: 300, al: ar => { ar.hilo = { x: x + ox * .4, y: y + tam * .1 }; ar.pausa = .35; } },
      { x: x + ox * .4, y: y + tam * .1, vel: 60, colgada: true, r: r * .25 },               // trepa por el hilo y se encoge dentro
      { x: x, y: y, vel: 30, al: ar => { ar.hilo = null; ar.fuera = true; } },
    ];
    aranas.push(a);
  }
  arrancar();
}
