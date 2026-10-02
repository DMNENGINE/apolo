// Bolitas de energía (partículas) sobre toda la ventana + sonidos sintetizados (sin archivos).
const cv = document.getElementById('fx'), c = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; }
addEventListener('resize', resize); resize();

const parts = [];
export const COLORS = {
  trabajando: ['#35c8f0', '#7fe3ff', '#2b8cff'], permiso: ['#ffb020', '#ffd36b'], listo: ['#3ddc84', '#a6ff7a', '#35c8f0', '#ffd36b', '#ff7ad9'],
  error: ['#ff4d4d', '#ff8a5c'], reposo: ['#3ddc84', '#7fe3ff'],
};
const pick = a => a[Math.random() * a.length | 0];

// kind: 'burst' (explota con gravedad), 'float' (sube flotando), 'ring' (anillo que se expande), 'star' (titila quieta)
export function emit(x, y, n, colors, kind = 'burst') {
  for (let i = 0; i < n; i++) {
    const a = kind === 'ring' ? i / n * Math.PI * 2 : Math.random() * Math.PI * 2;
    const sp = kind === 'burst' ? 60 + Math.random() * 220 : kind === 'ring' ? 90 : kind === 'float' ? 12 + Math.random() * 25 : 0;
    parts.push({
      // el anillo nace ya alrededor del robot (no encima de la cara); las flotantes, en su borde
      x: kind === 'star' ? Math.random() * W : x + Math.cos(a) * (kind === 'ring' ? 34 : kind === 'float' ? 22 : 0),
      y: kind === 'star' ? Math.random() * H * .6 : y + Math.sin(a) * (kind === 'ring' ? 34 : kind === 'float' ? 22 : 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'burst' ? 80 : kind === 'float' ? 20 : 0),
      g: kind === 'burst' ? 260 : 0, r: kind === 'star' ? .6 + Math.random() * 1.2 : kind === 'float' ? 1.5 + Math.random() * 2.5 : 2 + Math.random() * 3.5,
      life: 0, max: kind === 'star' ? 1.5 + Math.random() * 2 : kind === 'float' ? 1.6 + Math.random() : .9 + Math.random() * .8,
      col: pick(colors), kind, ph: Math.random() * 6,
    });
  }
}
let last = performance.now(), sucio = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  // sin partículas no se toca el lienzo: cada clearRect marca la ventana transparente para recomponer (60 veces/s = CPU en el proceso de GPU)
  if (!parts.length && !sucio) return;
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  sucio = parts.length > 0;
  if (!parts.length) return;
  c.globalCompositeOperation = 'lighter';
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; p.vx *= p.kind === 'burst' ? .985 : 1;
    if (p.kind === 'float') p.vx += Math.sin(now / 300 + p.ph) * 8 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const k = 1 - p.life / p.max;
    const a = p.kind === 'star' ? Math.sin(p.life / p.max * Math.PI) * (.6 + .4 * Math.sin(now / 120 + p.ph)) : k;
    const r = p.r * (p.kind === 'ring' ? 1 : .6 + .4 * k);
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
    g.addColorStop(0, p.col); g.addColorStop(.35, p.col + '88'); g.addColorStop(1, p.col + '00');
    c.globalAlpha = Math.max(0, a); c.fillStyle = g;
    c.beginPath(); c.arc(p.x, p.y, r * 3.2, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.globalAlpha = Math.max(0, a) * .8;
    c.beginPath(); c.arc(p.x, p.y, r * .45, 0, 7); c.fill();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
requestAnimationFrame(frame);

// ---------- sonidos ----------
let ctx = null, muted = false;
try { muted = localStorage.getItem('robot-mute') === '1'; } catch { }
export const sound = {
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('robot-mute', muted ? '1' : '0'); } catch { } return muted; },
  play(name) {
    if (muted) return;
    try {
      ctx = ctx || new AudioContext();
      const seq = {
        blip:  [['sine', 1046, .04, .025]],
        hola:  [['triangle', 523, .09, .05], ['triangle', 659, .09, .05], ['triangle', 784, .09, .05], ['triangle', 1046, .16, .05]],
        listo: [['sine', 784, .1, .06], ['sine', 1046, .1, .06], ['sine', 1318, .22, .06]],
        permiso: [['triangle', 880, .12, .07], ['triangle', 660, .18, .07]],
        error: [['sawtooth', 220, .14, .04], ['sawtooth', 165, .22, .04]],
        poke:  [['square', 420, .05, .025], ['square', 300, .06, .025]],
        mareo: [['sine', 600, .08, .04], ['sine', 450, .08, .04], ['sine', 330, .08, .04], ['sine', 250, .14, .04]],
        abrir: [['sine', 520, .05, .02], ['sine', 780, .07, .02]],
        bostezo: [['sine', 520, .3, .03], ['sine', 440, .3, .03], ['sine', 330, .45, .03]],
        alarma: [['square', 880, .12, .035], ['square', 660, .12, .035], ['square', 880, .12, .035], ['square', 660, .2, .035]],
      }[name];
      if (!seq) return;
      let t = ctx.currentTime;
      for (const [type, f, d, v] of seq) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + .02); t += d * .85;
      }
    } catch { }
  },
};
