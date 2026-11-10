// Robot 3D (casco.glb) con HUD vivo en el visor. Uso:
//   const robot = createRobot(canvas, 'casco.glb', { animacion: 'raton' | 'vitrina', log }); robot.setState('trabajando'); robot.destruir();
//   raton (isla): sigue el cursor · vitrina (panel): mira a su alrededor y de vez en cuando da una vuelta
// FUENTE ÚNICA: core/ui/robot3d.js se genera desde aquí con `node tools/derivar-robot3d.js` (solo cambian los imports).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const STATES = {
  reposo:     { hue:145, speed:.4, glow:.5,  pspeed:1.2, eye:1,   happy:0, x:0, talk:0 },
  trabajando: { hue:195, speed:3,  glow:1.3, pspeed:4,   eye:.9,  happy:0, x:0, talk:1 },
  permiso:    { hue:40,  speed:.3, glow:1.1, pspeed:1.5, eye:1.15,happy:0, x:0, talk:0 },
  listo:      { hue:125, speed:.6, glow:1,   pspeed:2,   eye:1,   happy:1, x:0, talk:0 },
  error:      { hue:0,   speed:1,  glow:1.1, pspeed:6,   eye:1,   happy:0, x:1, talk:0 },
  dormido:    { hue:220, speed:.05,glow:.12, pspeed:.3,  eye:1,   happy:0, x:0, talk:0, sleep:1 },
};
for (const k in STATES) STATES[k].sleep = STATES[k].sleep || 0;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export function createRobot(canvas, glbUrl = 'casco.glb', opts = {}) {
  const vitrina = opts.animacion === 'vitrina';
  const movimientoSuave = matchMedia('(prefers-reduced-motion: reduce)');
  const temaOscuro = matchMedia('(prefers-color-scheme: dark)');
  let pupila = .52, microT = 0, microX = 0, microY = 0, vx = 0, vy = 0;
  let raf = 0, muerto = false, nextSpin = performance.now() + 7000, nextGestoV = performance.now() + 9000;
  let cur = { ...STATES.reposo }, target = STATES.reposo, stateName = 'reposo', message = '';
  const log = opts.log || ['> robot listo', 'esperando a Claude Code…'];
  let mx = 0, my = 0;
  let lastMove = -1e9, lpx = 0, lpy = 0;
  function lookAtClient(x, y) {                      // coordenadas relativas a la ventana (pueden estar fuera de ella)
    if (Math.abs(x - lpx) + Math.abs(y - lpy) > 3) { lastMove = performance.now(); lpx = x; lpy = y; }
    const r = canvas.getBoundingClientRect();
    mx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / 600));
    my = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / 450));
  }
  const onMove = e => lookAtClient(e.clientX, e.clientY);
  if (!vitrina) addEventListener('mousemove', onMove);

  // ---------- escena ----------
  // opts.pixelRatio / opts.antialias / opts.hudMax: para equipos con GPU modesta (la Rabbit R1); por defecto como siempre
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias !== false, alpha: true });
  renderer.setPixelRatio(opts.pixelRatio || Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);            // fondo transparente de verdad (sin bloom)            // mismo tono que la isla (el bloom no respeta transparencia)
  const scene = new THREE.Scene();
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x4a4f57, side: THREE.BackSide })));
    const panel = (x, y, z, w, h, c) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(-5, 0, 4, 3, 8, 0xe8ecf0); panel(5, 0, 4, 3, 8, 0xe8ecf0);
    panel(0, 5, 3, 8, 2, 0x8a9098); panel(0, -5, 3, 8, 2, 0x8a9098);
    panel(0, 0, 7, 7, 5, 0x6d737b);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, .02).texture;
  }
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 50);
  camera.position.set(0, 1.1, 5.4); camera.lookAt(0, -.02, 0);
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(0, 0, 5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xcfd6e0, 0xcfd6e0, .5));

  // sin postproceso (bloom): rompe la transparencia; el brillo lo pone un drop-shadow de CSS
  let hudListo = false;
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (hudListo) tamanoHud(w);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // ---------- HUD del visor ----------
  // resolución según lo que se ve: el visor ocupa ~45% del ancho del lienzo, así que con el robot pequeño (isla cerrada)
  // 512 px sobran; 1024 solo cuando es grande. Subir 1024×616 a la GPU en cada fotograma costaba ~80% de un núcleo.
  const HC = document.createElement('canvas');
  const hx = HC.getContext('2d');
  const hudTex = new THREE.CanvasTexture(HC); hudTex.flipY = false; hudTex.colorSpace = THREE.SRGBColorSpace;
  let K = 1;
  function tamanoHud(cssW) {
    const ancho = Math.min(opts.hudMax || 1024, cssW * Math.min(devicePixelRatio, 2) > 220 ? 1024 : 512);
    if (HC.width === ancho) return;
    HC.width = ancho; HC.height = Math.round(ancho * .9632 / 1.6); K = ancho / 1.6;
    hudTex.dispose(); hudTex.needsUpdate = true;               // three vuelve a reservar la textura con el tamaño nuevo
  }
  tamanoHud(canvas.clientWidth || 1); hudListo = true;
  const GLIT = Array.from({length:22}, () => ({ a:Math.random()*Math.PI, d:.35 + Math.random()*.55, s:.5 + Math.random(), p:Math.random()*6 }));
  let scroll = 0, blinkT = 2, blink = 0;
  const star4 = (c, x, y, s, col) => {
    c.fillStyle = col; c.beginPath();
    c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s);
    c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill();
  };
  // ---------- gestos: ojos especiales y movimientos de cabeza durante unos segundos ----------
  // ojos: remolino | guino | corazon | sorpresa | reloj (la hora en el visor)   cabeza: saludo | si | no | mirar
  let gesto = null, gestoHasta = 0, gestoIni = 0;
  const ESCENAS = new Set(['revision', 'estornudo_explosivo', 'montaje']);
  const gestoActivo = n => {
    if (performance.now() >= gestoHasta) return false;
    if (gesto === n) return true;
    const f = (performance.now() - gestoIni) / (gestoHasta - gestoIni);
    const cara = gesto === 'revision' ? 'concentrado' : gesto === 'montaje' ? (f > .4 && f < .8 ? 'duda' : 'curioso')
      : gesto === 'estornudo_explosivo' ? (f < .28 ? 'pensativo' : f < .48 ? 'estornudo' : 'sorpresa') : null;
    return n === cara;
  };
  function corazon(c, s, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(0, s * .35);
    c.bezierCurveTo(-s * 1.1, -s * .35, -s * .55, -s * 1.05, 0, -s * .45);
    c.bezierCurveTo(s * .55, -s * 1.05, s * 1.1, -s * .35, 0, s * .35); c.fill();
  }
  function drawEye(c, ex, ey, er, lx, ly, now, sd) {
    c.save(); c.translate(ex, ey);
    const hue = cur.hue;
    const calma = movimientoSuave.matches;
    if (gestoActivo('ilusionado')) {
      const latido = calma ? 1 : 1 + .06 * Math.sin(now / 230);
      star4(c, 0, 0, er * latido, hsl(45, 100, 74));
      star4(c, 0, 0, er * .48 * latido, '#ffffff');
      c.restore(); return;
    }
    if (gestoActivo('timido')) {
      c.strokeStyle = hsl(hue, 85, 75); c.lineWidth = er * .15; c.lineCap = 'round';
      c.beginPath(); c.arc(0, -er * .2, er * .65, Math.PI * .16, Math.PI * .84); c.stroke();
      c.fillStyle = 'rgba(255,115,175,.55)';
      c.beginPath(); c.ellipse(sd * er * .5, er * .65, er * .45, er * .16, -.15 * sd, 0, 7); c.fill();
      c.restore(); return;
    }
    if (gestoActivo('remolino')) {                          // mareado: espirales que giran (cada ojo en un sentido)
      c.rotate(now / 140 * sd);
      c.strokeStyle = hsl((hue + 280) % 360, 100, 72); c.lineWidth = er * .13; c.lineCap = 'round';
      c.beginPath();
      for (let t = 0; t < Math.PI * 6; t += .15) { const r = er * .95 * t / (Math.PI * 6); c.lineTo(Math.cos(t) * r, Math.sin(t) * r); }
      c.stroke(); c.restore(); return;
    }
    if (gestoActivo('navegando')) {                         // navegando: cada ojo es un globo terráqueo que gira
      const r = er * .82, col = hsl(198, 100, 66);
      c.strokeStyle = col; c.lineWidth = er * .1; c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
      c.lineWidth = er * .07;
      for (let i = 0; i < 2; i++) {                           // meridianos girando
        const w = Math.abs(Math.cos(now / 520 + i * Math.PI / 2)) * r;
        c.beginPath(); c.ellipse(0, 0, Math.max(w, .5), r, 0, 0, 7); c.stroke();
      }
      for (const k of [-.45, 0, .45]) { const yy = k * r, xx = Math.sqrt(r * r - yy * yy); c.beginPath(); c.moveTo(-xx, yy); c.lineTo(xx, yy); c.stroke(); }
      c.restore(); return;
    }
    if (gestoActivo('corazon')) {
      const lat = 1 + .12 * Math.sin(now / 120);
      corazon(c, er * .9 * lat, hsl(335, 100, 66)); c.restore(); return;
    }
    if (gestoActivo('guino') && sd > 0) {                   // guiño: el ojo derecho se cierra en ^
      c.strokeStyle = hsl(hue, 100, 70); c.lineWidth = er * .2; c.lineCap = 'round';
      c.beginPath(); c.arc(0, er * .35, er * .65, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      c.restore(); return;
    }
    if (gestoActivo('feliz') || gestoActivo('celebrar')) {   // ^ ^ contento
      c.strokeStyle = hsl(hue, 100, 70); c.lineWidth = er * .2; c.lineCap = 'round';
      c.beginPath(); c.arc(0, er * .35, er * .65, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      c.restore(); return;
    }
    if (gestoActivo('bostezo') || gestoActivo('estornudo')) {   // ojos apretados: > <  (bostezo: rayitas dormilonas)
      c.strokeStyle = hsl(hue, 90, 70); c.lineWidth = er * .17; c.lineCap = 'round'; c.lineJoin = 'round';
      const k = er * .5;
      c.beginPath();
      if (gestoActivo('estornudo')) { c.moveTo(-k * sd, -k * .7); c.lineTo(k * .4 * sd, 0); c.lineTo(-k * sd, k * .7); }
      else { c.moveTo(-k, 0); c.quadraticCurveTo(0, k * .35, k, 0); }
      c.stroke(); c.restore(); return;
    }
    // un gesto con ojos propios manda sobre los ojos del estado (contento ^^, error X, dormido)
    const ojosDeGesto = ['sorpresa', 'duda', 'triste', 'pensativo', 'guino', 'mirar', 'curioso', 'sospecha', 'concentrado', 'enfadado'].some(gestoActivo);
    if (gestoActivo('curioso')) c.scale(sd < 0 ? .88 : 1.12, sd < 0 ? .88 : 1.12);
    if (gestoActivo('sorpresa')) c.scale(1.25, 1.25);
    if (gestoActivo('duda') && sd < 0) c.scale(.8, .8);       // un ojo más pequeño que el otro: ¿eh?
    if (cur.x > .5 && !ojosDeGesto) {
      c.strokeStyle = hsl(0, 100, 60); c.lineWidth = er * .2; c.lineCap = 'round';
      const k = er * .55; c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, k); c.moveTo(k, -k); c.lineTo(-k, k); c.stroke();
      c.restore(); return;
    }
    if (cur.happy > .5 && !ojosDeGesto) {
      c.strokeStyle = hsl(hue, 100, 70); c.lineWidth = er * .2; c.lineCap = 'round';
      c.beginPath(); c.arc(0, er * .35, er * .65, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      c.restore(); return;
    }
    if (cur.sleep > .5 && !ojosDeGesto) {                  // dormido: ojos cerrados ︶ ︶
      c.strokeStyle = hsl(hue, 60, 65, .8); c.lineWidth = er * .14; c.lineCap = 'round';
      c.beginPath(); c.arc(0, -er * .15, er * .6, Math.PI * .15, Math.PI * .85); c.stroke();
      c.restore(); return;
    }
    // El iris conserva su forma: dos párpados curvos recortan la apertura.
    c.scale(cur.eye, cur.eye);
    const cierre = Math.sin(blink * Math.PI);
    const entornado = gestoActivo('concentrado') ? .5 : gestoActivo('sospecha') ? (sd > 0 ? .65 : .25) : gestoActivo('enfadado') ? .42 : 0;
    const borde = er * (1.12 - cierre * 1.12) * (1 - entornado);
    c.save(); c.beginPath();
    c.moveTo(-er * 1.2, -borde);
    c.quadraticCurveTo(0, -borde + cierre * borde * .32, er * 1.2, -borde);
    c.lineTo(er * 1.2, borde);
    c.quadraticCurveTo(0, borde - cierre * borde * .2, -er * 1.2, borde);
    c.closePath(); c.clip();
    c.strokeStyle = 'rgba(225,200,235,.6)'; c.lineWidth = er * .12;
    c.beginPath(); c.arc(0, 0, er * 1.04, 0, 7); c.stroke();
    c.save(); c.beginPath(); c.arc(0, 0, er, 0, 7); c.clip();
    const ox = lx * er * .18, oy = ly * er * .14;
    const ig = c.createLinearGradient(0, -er + oy, 0, er + oy);
    ig.addColorStop(0, '#07081a'); ig.addColorStop(.45, '#121838'); ig.addColorStop(.72, 'rgba(70,215,190,1)'); ig.addColorStop(1, 'rgba(245,125,175,1)');
    c.fillStyle = ig; c.fillRect(-er, -er, er * 2, er * 2);
    c.fillStyle = 'rgba(3,3,12,.88)'; c.beginPath(); c.arc(ox, oy - er * .05, er * pupila, 0, 7); c.fill();
    c.globalCompositeOperation = 'lighter';
    for (const g of GLIT) {
      const tw = .5 + .5 * Math.sin(now / 300 * g.s + g.p);
      c.fillStyle = `rgba(255,${200 + 55 * tw | 0},240,${.5 * tw})`;
      c.beginPath(); c.arc(ox + Math.cos(g.a) * g.d * er, oy + Math.sin(g.a) * g.d * er * .9, er * .03 * (1 + tw), 0, 7); c.fill();
    }
    c.globalCompositeOperation = 'source-over'; c.restore();
    const h2x = lx * er * .07, h2y = ly * er * .05;
    c.fillStyle = 'rgba(255,255,255,.95)';
    c.beginPath(); c.ellipse(-er * .3 + h2x, -er * .38 + h2y, er * .27, er * .24, 0, 0, 7); c.fill();
    c.beginPath(); c.arc(er * .38 + h2x, er * .28 + h2y, er * .09, 0, 7); c.fill();
    const t1 = .6 + .4 * Math.sin(now / 250 + sd), t2 = .6 + .4 * Math.sin(now / 330 + sd * 2);
    star4(c, -er * .4 + ox, -er * .05 + oy, er * .12 * t1, 'rgba(215,170,255,.95)');
    star4(c, er * .15 + ox, er * .45 + oy, er * .1 * t2, 'rgba(255,170,230,.95)');
    c.restore(); // termina el recorte de los párpados
    if (gestoActivo('enfadado') || gestoActivo('sospecha') || gestoActivo('concentrado')) {
      const pendiente = gestoActivo('enfadado') ? -sd * .35 : gestoActivo('sospecha') ? sd * .2 : 0;
      c.strokeStyle = hsl(gestoActivo('enfadado') ? 15 : hue, 95, 72);
      c.lineWidth = er * .13; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-er * .95, -er * .85 - pendiente * er);
      c.quadraticCurveTo(0, -er * .95, er * .95, -er * .85 + pendiente * er); c.stroke();
    }
    if (gestoActivo('triste')) {                             // párpado caído en diagonal (más bajo hacia fuera): cara de pena
      c.fillStyle = '#070a0e'; c.beginPath();
      c.moveTo(-er * 1.3, -er * 1.3); c.lineTo(er * 1.3, -er * 1.3);
      c.lineTo(er * 1.3, sd > 0 ? -er * .05 : -er * .55); c.lineTo(-er * 1.3, sd > 0 ? -er * .55 : -er * .05);
      c.fill();
      c.strokeStyle = hsl(hue, 80, 65, .9); c.lineWidth = er * .1; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-er * 1.05, sd > 0 ? -er * .5 : -er * .1); c.lineTo(er * 1.05, sd > 0 ? -er * .1 : -er * .5); c.stroke();
    }
    c.restore();
  }
  function drawHUD(now, lookX, lookY) {
    const c = hx, W = HC.width, H = HC.height, hue = cur.hue, now_s = now / 1000;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#05080b'); bg.addColorStop(1, '#0c1016');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2);
    const a = .8 * K, b = .43 * K;
    // terminal: las últimas líneas reales, desplazándose suave hacia arriba
    c.font = `${.052 * K}px Consolas, monospace`;
    const lh = .075 * K, rows = 12, frac = scroll % 1;
    const tail = log.slice(-rows - 1);
    tail.forEach((line, i) => {
      const y = -b + .1 * K + (i - (tail.length - rows)) * lh - frac * lh * (cur.speed > 1 ? 1 : 0);
      c.fillStyle = hsl(hue, 100, 68, i === tail.length - 1 ? .85 : .5); c.fillText(line.slice(0, 44), -a * .8, y);
    });
    if ((now / 500 | 0) % 2) { c.fillStyle = hsl(hue, 100, 70, .8); c.fillRect(-a * .8, b * .72, .03 * K, .05 * K); }
    c.save(); c.translate(a * .6, -b * .45);
    c.strokeStyle = hsl(hue, 100, 60, .65); c.lineWidth = .003 * K;
    for (const rr of [1, .66, .33]) { c.beginPath(); c.arc(0, 0, .12 * K * rr, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(-.14 * K, 0); c.lineTo(.14 * K, 0); c.moveTo(0, -.14 * K); c.lineTo(0, .14 * K); c.stroke();
    const sw = now_s * (1 + cur.speed); c.fillStyle = hsl(hue, 100, 55, .4);
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, .12 * K, sw, sw + .7); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = hsl(hue, 100, 60, .6);
    for (let i = 0; i < 18; i++) {
      const h = .02 * K + .09 * K * Math.abs(Math.sin(now_s * (2 + cur.speed) + i * .7) * Math.sin(i * 1.3 + now_s));
      c.fillRect(a * .45 + i * .016 * K, b * .15 - h, .009 * K, h);
    }
    if (gestoActivo('reloj')) {                              // la hora en grande en vez de los ojos
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const sep = (now / 500 | 0) % 2 ? ':' : ' ';
      c.textAlign = 'center'; c.fillStyle = hsl(hue, 100, 70); c.shadowColor = hsl(hue, 100, 55); c.shadowBlur = 24;
      c.font = `bold ${.3 * K}px Consolas, monospace`; c.fillText(`${p2(d.getHours())}${sep}${p2(d.getMinutes())}`, 0, .17 * K);
      c.shadowBlur = 0; c.font = `${.07 * K}px Consolas, monospace`; c.fillStyle = hsl(hue, 100, 70, .75);
      c.fillText(d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase(), 0, .3 * K);
      c.textAlign = 'left';
    } else for (const sd of [-1, 1]) drawEye(c, sd * .34 * K, .08 * K, .235 * K, lookX, lookY, now, sd);
    // símbolos flotando en el visor: Zzz dormido, ? dudando, … pensando
    const flotar = (txt, n, x0, tam, periodo) => {
      c.textAlign = 'center';
      for (let i = 0; i < n; i++) {
        const f = ((now / periodo) + i / n) % 1;               // 0→1: sube y se desvanece
        c.font = `bold ${tam * (.7 + f * .6)}px Consolas, monospace`;
        const al = Math.sin(f * Math.PI), px = x0 + f * .14 * K + Math.sin(f * 6 + i) * .02 * K, py = -.12 * K - f * .3 * K;
        c.lineWidth = .012 * K; c.strokeStyle = `rgba(0,0,0,${al * .8})`; c.strokeText(txt, px, py);
        c.fillStyle = hsl(hue, 100, 78, al); c.fillText(txt, px, py);
      }
      c.textAlign = 'left';
    };
    if (cur.sleep > .5 && performance.now() >= gestoHasta) flotar('Z', 3, .1 * K, .15 * K, 2600);
    if (gestoActivo('duda')) flotar('?', 2, .22 * K, .13 * K, 1400);
    if (gestoActivo('pensativo')) { c.fillStyle = hsl(hue, 90, 72, .9); for (let i = 0; i < 3; i++) if ((now / 380 | 0) % 4 > i) { c.beginPath(); c.arc(.2 * K + i * .075 * K, -.27 * K, .026 * K, 0, 7); c.fill(); } }
    if (message && (stateName !== 'permiso' || (now / 450 | 0) % 2)) {
      c.font = `bold ${.058 * K}px Consolas, monospace`; c.textAlign = 'center';
      const tw = c.measureText(message).width + .0375 * K;
      c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(-tw / 2, b * .52, tw, .09 * K);
      c.strokeStyle = hsl(hue, 100, 60, .95); c.lineWidth = .0047 * K; c.strokeRect(-tw / 2, b * .52, tw, .09 * K);
      c.fillStyle = hsl(hue, 100, 70); c.fillText(message, 0, b * .52 + .066 * K); c.textAlign = 'left';
    }
    c.fillStyle = 'rgba(0,0,0,.22)';
    const paso = Math.max(3, .00625 * K); for (let y = -H / 2; y < H / 2; y += paso) c.fillRect(-W / 2, y, W, paso * .375);
    const band = ((now_s * .4) % 1) * H * 1.3 - H * .65;
    c.fillStyle = hsl(hue, 100, 60, .07); c.fillRect(-W / 2, band, W, .08 * K);
    c.strokeStyle = hsl(hue, 100, 60, .9); c.lineWidth = .014 * K;
    c.strokeRect(-a * .97, -b * .95, a * 1.94, b * 1.9);
    hudTex.needsUpdate = true;
  }

  // ---------- materiales ----------
  const circuitU = { uTime: { value: 0 }, uSpeed: { value: 1 } };
  const circuitMat = new THREE.MeshStandardMaterial({ color: 0x051008, emissive: 0x40ff90, emissiveIntensity: 2, roughness: .4 });
  circuitMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, circuitU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;\nuniform float uTime, uSpeed;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float d = length(vP.xy * vec2(1., .8)) + vP.z * .15;
        float wave = pow(max(0., sin(d * 18. - uTime * uSpeed)), 10.);
        totalEmissiveRadiance *= .6 + 1.3 * wave;`);
  };
  const vozMat = new THREE.MeshStandardMaterial({ color: 0x020604, emissive: 0x40ff90, emissiveIntensity: .3 });
  const hudMat = new THREE.MeshBasicMaterial({ map: hudTex, color: 0xd0d0d0 });

  const head = new THREE.Group(); scene.add(head);
  const piezas = [];
  const suave01 = v => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
  const ventana = (f, a, b, c, d) => suave01((f - a) / (b - a)) * (1 - suave01((f - c) / (d - c)));
  function restaurarPiezas() {
    for (const p of piezas) { p.grupo.position.copy(p.base); p.grupo.rotation.set(0, 0, 0); }
  }
  // ---------- compuerta del visor (arañas): el visor se abre hacia arriba por una bisagra y deja ver el nido ----------
  const bisagra = new THREE.Group(); bisagra.position.set(0, .5, .32);
  let abierto = 0, abrirObj = 0, abrirHasta = 0;
  const nido = new THREE.Group(); nido.visible = false; nido.position.set(0, -.02, .5);
  {
    const fondo = new THREE.Mesh(new THREE.CircleGeometry(.74, 48), new THREE.MeshBasicMaterial({ color: 0x030008 }));
    fondo.scale.set(1.08, .66, 1); nido.add(fondo);
    const halo = new THREE.Mesh(new THREE.RingGeometry(.6, .76, 48), new THREE.MeshBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: .55 }));
    halo.scale.set(1.08, .66, 1); halo.position.z = .005; nido.add(halo); nido.userData.halo = halo;
    const hilos = new THREE.Group(); hilos.position.z = .01; nido.add(hilos);   // telaraña dentro del casco
    const mh = new THREE.LineBasicMaterial({ color: 0x9a7bff, transparent: true, opacity: .45 });
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; hilos.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * .78, Math.sin(a) * .48, 0)]), mh)); }
    for (let r = 1; r <= 4; r++) { const pts = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2, f = r / 4 * (.92 + (k % 2) * .08); pts.push(new THREE.Vector3(Math.cos(a) * .78 * f, Math.sin(a) * .48 * f, 0)); } hilos.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mh)); }
    const ojos = new THREE.Group(); ojos.position.z = .02; nido.add(ojos); nido.userData.ojos = ojos;   // ojos rojos que parpadean en la oscuridad
    const mo = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true });
    for (let k = 0; k < 7; k++) {
      const par = new THREE.Group(), x = (Math.random() - .5) * 1.1, y = (Math.random() - .5) * .55, r = .018 + Math.random() * .014;
      par.position.set(x, y, 0); par.userData.fase = Math.random() * 10;
      for (const dx of [-r * 1.6, r * 1.6]) { const o = new THREE.Mesh(new THREE.CircleGeometry(r, 10), mo); o.position.x = dx; par.add(o); }
      ojos.add(par);
    }
    const luz = new THREE.PointLight(0x9a40ff, 0, 2.5); luz.position.set(0, 0, .3); nido.add(luz); nido.userData.luz = luz;
  }
  head.add(nido); head.add(bisagra);
  new GLTFLoader().load(glbUrl, g => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const names = [o.name, o.parent ? o.parent.name : ''];
      const has = re => names.some(x => re.test(x));
      if (has(/^Pantalla/)) o.material = hudMat;
      else if (has(/^(Circuito|LedAuricular_[ID]|LuzMenton_-?1)$/)) o.material = circuitMat;
      else if (has(/^Voz_/)) o.material = vozMat;
    });
    head.add(g.scene);
    g.scene.updateMatrixWorld(true);
    // Agrupa cada pieza con sus luces; cada pivote queda en el centro de la pieza.
    for (const [nombre, patron, direccion] of [
      ['placa', /^PlacaSuperior$/, [0, .22, -.08]],
      ['izquierda', /^(Auricular_I|LedAuricular_I)$/, [-.4, .06, .05]],
      ['derecha', /^(Auricular_D|LedAuricular_D)$/, [.4, .06, .05]],
      ['menton', /^(Menton|Ventila|Lamina_\d+|Voz_\d+|LuzMenton_.*)$/, [0, -.3, .15]],
    ]) {
      const objetos = []; g.scene.traverse(o => { if (patron.test(o.name) && !patron.test(o.parent?.name || '')) objetos.push(o); });
      if (!objetos.length) continue;
      const grupo = new THREE.Group(), caja = new THREE.Box3();
      for (const o of objetos) caja.union(new THREE.Box3().setFromObject(o));
      grupo.position.copy(g.scene.worldToLocal(caja.getCenter(new THREE.Vector3())));
      g.scene.add(grupo); grupo.updateMatrixWorld(true);
      for (const o of objetos) grupo.attach(o);
      piezas.push({ nombre, grupo, base: grupo.position.clone(), direccion: new THREE.Vector3(...direccion) });
    }
    const visor = []; g.scene.traverse(o => { if (o.isMesh && /^(MarcoVisor|Pantalla)/.test(o.name + '|' + (o.parent?.name || '')) && !visor.includes(o)) visor.push(o); });
    for (const o of visor) bisagra.attach(o);                    // la bisagra conserva su posición: solo gira al abrir
  }, undefined, e => console.error('casco.glb', e));

  // ---------- bucle ----------
  let last = null, hxS = 0, hyS = 0, fps = 60, acc = 0, wob = 0, spin = 0, spinA = 0, react = 0, prevState = 'reposo', ultimoGlow = '';
  let elasticidad = 0, velocidadElastica = 0, impulso = 0;
  let inclinacionX = 0, inclinacionZ = 0, velocidadX = 0, velocidadZ = 0;
  let viajeX = 0, viajeY = 0, ultimoViaje = -Infinity, respiracionT = 0;
  const col = new THREE.Color();
  function frame(now) {
    if (muerto) return;
    raf = requestAnimationFrame(frame);
    if (last === null) last = now;
    const dt = Math.max(0, Math.min(.05, (now - last) / 1000));
    last = now;
    acc += dt; if (acc < 1 / fps) return;             // limitar fps cuando está pequeño
    const step = acc; acc = 0;
    const k = 1 - Math.pow(.02, step);
    for (const p in target) cur[p] += (target[p] - cur[p]) * (p === 'hue' ? 1 - Math.pow(.0003, step) : k);
    scroll += step * cur.speed;
    // parpadeo: a veces doble (pestañeo rápido dos veces)
    blinkT -= step; if (blinkT < 0) { blink = 1; blinkT = Math.random() < .2 ? .28 : 2.5 + Math.random() * 4; }
    blink = Math.max(0, blink - step * 7);
    let tx = mx, ty = my;
    const reading = stateName === 'trabajando' && now - lastMove > 2500;   // si mueves el ratón, te mira a ti
    if (reading) { tx = -.3 + .12 * Math.sin(now / 700); ty = .15; }
    if (vitrina) {                                    // panel: mira a su alrededor y de vez en cuando da una vuelta
      tx = Math.sin(now / 2600) * .8 + Math.sin(now / 1150) * .1; ty = Math.sin(now / 3400) * .35 - .05;
      if (now > nextSpin && stateName !== 'permiso') { spin = .75; nextSpin = now + 13000 + Math.random() * 9000; }
      // y hace gestos sueltos (el panel no tiene la "vida propia" de la isla)
      if (now > nextGestoV && stateName === 'reposo' && performance.now() >= gestoHasta) {
        const [g, secs] = [['guino', 1.4], ['corazon', 2.4], ['reloj', 4], ['saludo', 2.4], ['feliz', 2], ['sorpresa', 1.4], ['pensativo', 3.5]][Math.random() * 7 | 0];
        gesto = g; gestoIni = performance.now(); gestoHasta = gestoIni + secs * 1000;
        nextGestoV = now + 15000 + Math.random() * 15000;
      }
    }
    if (gestoActivo('curioso')) { tx = Math.sin((now - gestoIni) / 700) * .65; ty = -.12; }
    if (gestoActivo('sospecha')) { tx = .7; ty = .05; }
    if (gestoActivo('concentrado')) { tx = -.2; ty = .22; }
    if (gestoActivo('pensativo')) { tx = .55; ty = -.6; }                       // mira arriba a un lado, pensando
    // Microsacadas solo sin un objetivo concreto; nunca durante sueño o gestos.
    microT -= step;
    const libre = !vitrina && stateName === 'reposo' && now - lastMove > 1800 && now >= gestoHasta;
    if (microT <= 0) {
      microT = .4 + Math.random() * 1.6;
      microX = (Math.random() - .5) * .3; microY = (Math.random() - .5) * .2;
    }
    if (libre && !movimientoSuave.matches) { tx += microX; ty += microY; }
    // Integración en pasos pequeños: el muelle sigue estable también a 6 fps.
    const pasos = Math.ceil(step / .008), subpaso = step / pasos;
    for (let i = 0; i < pasos; i++) {
      const freno = movimientoSuave.matches ? 24 : 15;
      vx += ((tx - hxS) * 120 - vx * freno) * subpaso;
      vy += ((ty - hyS) * 120 - vy * freno) * subpaso;
      hxS += vx * subpaso; hyS += vy * subpaso;
    }
    const dilatacion = stateName === 'error' ? .32 : gestoActivo('sorpresa') ? .68 : temaOscuro.matches ? .61 : .48;
    pupila += (dilatacion - pupila) * (1 - Math.exp(-step * 4));
    wob *= Math.pow(.03, step); spin *= Math.pow(.25, step); spinA += spin * step * 14;
    if (react > 0) { react -= step; if (react <= 0) { stateName = prevState; target = STATES[prevState]; message = prevMsg; } }
    // movimientos de cabeza de los gestos (se suman a mirar el ratón); g = 0→1→0 a lo largo del gesto
    let gy = 0, gx = 0, gz = 0, gpy = 0;
    if (performance.now() < gestoHasta) {
      const t = (performance.now() - gestoIni) / 1000, f = Math.min(1, (performance.now() - gestoIni) / (gestoHasta - gestoIni)), g = Math.sin(f * Math.PI);
      if (gesto === 'saludo') gz = Math.sin(t * 9) * .22 * g;                 // ladea la cabeza de lado a lado, como saludando
      else if (gesto === 'si') gx = Math.sin(t * 11) * .2 * g;
      else if (gesto === 'no') gy = Math.sin(t * 10) * .35 * g;
      else if (gesto === 'mirar') gy = Math.sin(t * 1.6) * .75 * g;            // mira a un lado y al otro, curioso
      else if (gesto === 'reloj') gx = -.12 * g;                               // levanta la cara para enseñarte la hora
      else if (gesto === 'celebrar') { gpy = Math.abs(Math.sin(t * 9)) * .18 * g; gz = Math.sin(t * 4.5) * .12 * g; }   // da saltitos
      else if (gesto === 'triste') { gx = .26 * g; gy = Math.sin(t * 7) * .12 * g; }   // cabeza gacha y niega despacio
      else if (gesto === 'duda') gz = -.2 * g;                                 // ladea la cabeza: ¿?
      else if (gesto === 'bostezo') { gx = -.3 * Math.sin(Math.min(1, f * 1.4) * Math.PI); gz = .06 * g; }   // echa la cabeza atrás
      else if (gesto === 'revision') { gx = -.08 * g; gy = Math.sin(t * 1.5) * .08 * g; }
      else if (gesto === 'montaje') gz = -.17 * Math.sin(f * Math.PI);
      else if (gesto === 'estornudo_explosivo') {
        gx = f < .28 ? -.18 * suave01(f / .28) : f < .37 ? -.18 + .46 * suave01((f - .28) / .09) : .28 * (1 - suave01((f - .37) / .35));
      }
      else if (gesto === 'estornudo') { gx = f < .45 ? -.22 * (f / .45) : f < .55 ? .35 : .35 * (1 - (f - .55) / .45); if (f > .45 && f < .5) wob = Math.max(wob, .7); }
      else if (gesto === 'pensativo') gz = .1 * g;
      else if (gesto === 'navegando') { gy = Math.sin(t * 1.3) * .35 * g; gx = .08 * g + Math.sin(t * .65) * .06 * g; }   // recorre la página con la mirada
      else if (gesto === 'curioso') { gz = -.13 * g; gy = Math.sin(t * 1.7) * .12 * g; }
      else if (gesto === 'sospecha') { gz = .12 * g; gy = .12 * g; }
      else if (gesto === 'concentrado') gx = .1 * g;
      else if (gesto === 'ilusionado') { gx = -.13 * g; gpy = .035 * g; }
      else if (gesto === 'timido') { gx = .16 * g; gz = -.1 * g; }
      else if (gesto === 'enfadado') { gx = .08 * g; gz = Math.sin(t * 18) * .025 * g; }
      else if (gesto === 'feliz') gz = Math.sin(t * 5) * .08 * g;
    }
    // Un solo muelle absorbe los impulsos y vuelve a la forma original.
    const suave = movimientoSuave.matches;
    let formaObjetivo = 0;
    if (gestoActivo('celebrar')) {
      const t = (now - gestoIni) / 1000, f = Math.min(1, (now - gestoIni) / (gestoHasta - gestoIni));
      formaObjetivo = (.065 * Math.sin(t * 18 - Math.PI / 2)) * Math.sin(f * Math.PI);
    } else if (gestoActivo('saludo')) {
      const t = (now - gestoIni) / 1000, f = Math.min(1, (now - gestoIni) / (gestoHasta - gestoIni));
      formaObjetivo = Math.sin(t * 9) * .025 * Math.sin(f * Math.PI);
    }
    if (suave) {
      gx = gy = gz = gpy = spin = spinA = wob = 0;
      elasticidad = velocidadElastica = impulso = 0;
      inclinacionX = inclinacionZ = velocidadX = velocidadZ = 0;
      viajeX = viajeY = 0;
    } else {
      velocidadElastica += impulso; impulso = 0;
      const reciente = now - ultimoViaje < 140;
      for (let i = 0; i < pasos; i++) {
        velocidadElastica += ((formaObjetivo - elasticidad) * 190 - velocidadElastica * 17) * subpaso;
        elasticidad += velocidadElastica * subpaso;
        velocidadX += (((reciente ? viajeY : 0) - inclinacionX) * 95 - velocidadX * 13) * subpaso;
        velocidadZ += (((reciente ? -viajeX : 0) - inclinacionZ) * 95 - velocidadZ * 13) * subpaso;
        inclinacionX += velocidadX * subpaso; inclinacionZ += velocidadZ * subpaso;
      }
    }
    // Dos ritmos mezclados; al dormir la respiración se hace lenta y profunda.
    respiracionT += step * (1.1 - .48 * cur.sleep);
    const respiracion = Math.sin(respiracionT) * .78 + Math.sin(respiracionT * 1.73 + .6) * .22;
    const deformacion = Math.max(-.09, Math.min(.09, elasticidad));
    const escalaY = 1 + deformacion, escalaLateral = 1 / Math.sqrt(escalaY);
    head.scale.set(escalaLateral, escalaY, escalaLateral);
    // Las escenas no cambian la geometría: separan piezas y las devuelven a su transformación original.
    restaurarPiezas();
    let aperturaEscena = 0;
    const faseEscena = Math.max(0, Math.min(1, (now - gestoIni) / Math.max(1, gestoHasta - gestoIni)));
    if (ESCENAS.has(gesto) && now < gestoHasta && !suave && !abrirObj && abierto < .03) {
      const f = faseEscena;
      const separacion = gesto === 'revision' ? ventana(f, .04, .25, .65, .96)
        : gesto === 'estornudo_explosivo' ? ventana(f, .28, .37, .44, .84) : ventana(f, .04, .24, .5, .82);
      aperturaEscena = gesto === 'revision' ? separacion * .55 : 0;
      for (const p of piezas) {
        const tardio = p.nombre === 'derecha' && gesto !== 'revision';
        const amplitud = tardio ? ventana(f, gesto === 'montaje' ? .04 : .28, gesto === 'montaje' ? .24 : .37, .7, .98) : separacion;
        p.grupo.position.addScaledVector(p.direccion, amplitud);
        if (p.nombre === 'placa') p.grupo.rotation.x = -.18 * amplitud;
        if (p.nombre === 'menton') p.grupo.rotation.x = .12 * amplitud;
        if (tardio && gesto === 'montaje') p.grupo.rotation.z = Math.PI * ventana(f, .24, .4, .69, .95);
        if (tardio && gesto === 'estornudo_explosivo') p.grupo.rotation.z = Math.sin(f * 24) * .18 * amplitud;
      }
      bisagra.position.set(0, .5, .32 + (gesto === 'revision' ? 0 : separacion * .22));
    } else bisagra.position.set(0, .5, .32);
    // compuerta: se abre con un golpe seco (rebote) y se cierra despacio; dentro el nido late
    if (abrirHasta && performance.now() > abrirHasta) { abrirObj = 0; abrirHasta = 0; }
    abierto += (abrirObj - abierto) * (1 - Math.pow(abrirObj > abierto ? .0008 : .02, step));
    const temblor = abrirObj > abierto + .05 ? Math.sin(now / 18) * .03 : 0;
    bisagra.rotation.x = -1.5 * Math.max(abierto, aperturaEscena) + temblor;
    const aperturaVisual = Math.max(abierto, aperturaEscena);
    nido.visible = aperturaVisual > .03;
    if (nido.visible) {
      const pulso = .5 + .5 * Math.sin(now / 260);
      nido.userData.halo.material.opacity = (.35 + .4 * pulso) * aperturaVisual; nido.userData.luz.intensity = 2.2 * aperturaVisual * (.6 + .4 * pulso);
      for (const par of nido.userData.ojos.children) { const f = (now / 1000 + par.userData.fase) % 4; par.scale.y = f < .12 ? .15 : 1; par.position.x += Math.sin(now / 700 + par.userData.fase) * .0006; }
      if (abierto > .4) { gx += -.06 * abierto; wob = Math.max(wob, .08 * abierto); }
    }
    head.rotation.y = hxS * .38 * (1 - cur.sleep) + spinA + gy; head.rotation.x = hyS * .22 * (1 - cur.sleep) + cur.sleep * .32 + gx + inclinacionX;   // dormido: cabeza caída
    head.rotation.z = Math.sin(now / 45) * .2 * wob + gz + inclinacionZ;                   // sacudida al tocarlo
    // La base acompaña la deformación sin añadir geometría ni otro bucle.
    head.position.y = respiracion * (.04 + .02 * cur.sleep) * (suave ? .15 : 1)
      + (suave ? 0 : Math.abs(Math.sin(now / 90)) * .12 * wob + gpy + deformacion * .3);
    if (Math.abs(spin) < .02) spinA *= Math.pow(.02, step);
    col.setHSL(cur.hue / 360, 1, .55);
    let lvl = cur.glow;
    if (stateName === 'permiso') lvl *= .45 + .55 * (.5 + .5 * Math.sin(now / 140));
    if (stateName === 'error' && Math.random() < .12) lvl *= .2;
    const h = new Date().getHours();                 // de noche (23–6) en reposo brilla menos, para no molestar
    if ((h >= 23 || h < 6) && (stateName === 'reposo' || stateName === 'dormido')) lvl *= .6;
    circuitMat.emissive.copy(col); circuitMat.emissiveIntensity = 1.7 * lvl;
    circuitU.uTime.value = now / 1000; circuitU.uSpeed.value = cur.pspeed;
    vozMat.emissive.copy(col);
    vozMat.emissiveIntensity = .3 + cur.talk * 3 * Math.abs(Math.sin(now / 90));
    drawHUD(now, hxS * 1.4, hyS * 1.4);
    renderer.render(scene, camera);
    // solo si cambia de verdad (redondeado): reescribir el estilo en cada fotograma obliga a recalcular el drop-shadow
    const glow = `hsla(${Math.round(cur.hue)},100%,55%,${(.35 + .35 * Math.min(1, lvl)).toFixed(2)})`;
    if (glow !== ultimoGlow) { ultimoGlow = glow; canvas.style.setProperty('--glow', glow); }
  }
  raf = requestAnimationFrame(frame);

  let prevMsg = '';
  function flash(name, msg, secs) {                     // reacción temporal y vuelve al estado real
    if (react <= 0) { prevState = stateName; prevMsg = message; }
    stateName = name; target = STATES[name]; message = msg; react = secs;
  }
  // textos del visor traducidos si la página cargó core/ui/i18n.js (isla y panel); si no, en español
  const T = s => (typeof globalThis.tr === 'function' ? globalThis.tr(s) : s);
  const MSG_ESTADO = () => ({ permiso: T('¿PERMISO?'), listo: T('✓ TAREA COMPLETA'), error: T('✗ ERROR'), dormido: '' });
  return {
    lookAtClient,
    // Velocidad de arrastre en píxeles/segundo; caduca sola si dejan de llegar eventos.
    inercia(x = 0, y = 0) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      viajeX = Math.max(-.24, Math.min(.24, x / 6500));
      viajeY = Math.max(-.18, Math.min(.18, y / 6500));
      ultimoViaje = performance.now();
    },
    poke() { impulso = -.85; wob = 1; flash('listo', T('¡EY!'), 1.1); },
    hud(msg, secs = 3, st = 'trabajando') { flash(st, msg, secs); },
    // fuerza 1..3: cuantas más vueltas, más largo el mareo con ojos de remolino
    dizzy(fuerza = 1) {
      spin = Math.min(2.2, .9 + fuerza * .45); wob = .6;
      const secs = 2.6 + fuerza * 1.1;
      gesto = 'remolino'; gestoIni = performance.now(); gestoHasta = gestoIni + secs * 1000;
      flash('error', '@_@  ' + T(fuerza >= 3 ? '¡PARA, PARA!' : 'MAREADO'), secs);
    },
    greet(msg = T('¡HOLA! 👋')) { wob = .8; this.gesto('saludo', 2.4); flash('listo', msg, 2.8); },
    // gestos: ojos remolino|guino|corazon|sorpresa|reloj|feliz|triste|duda|bostezo|estornudo|pensativo
    //         cabeza saludo|si|no|mirar|celebrar (y la de cada gesto de ojos). msg !== undefined = cara despierta + ese texto
    gesto(nombre, secs = 3, msg) {
      if (ESCENAS.has(nombre) && (abrirObj || abierto > .03)) return;
      restaurarPiezas();
      gesto = nombre; gestoIni = performance.now(); gestoHasta = gestoIni + secs * 1000;
      const base = react > 0 ? prevState : stateName;
      if (msg !== undefined) flash(base === 'dormido' ? 'reposo' : base, msg, secs);
    },
    // Cancela una expresión decorativa sin cambiar el estado ni el mensaje real.
    cancelarGesto() { gesto = null; gestoHasta = 0; restaurarPiezas(); bisagra.position.set(0, .5, .32); },
    ocupado: () => performance.now() < gestoHasta || react > 0,
    // compuerta del visor: abre el casco (las arañas salen del nido) durante secs; cerrarCasco() lo cierra ya
    abrirCasco(secs = 4) { if (ESCENAS.has(gesto)) this.cancelarGesto(); abrirObj = 1; abrirHasta = performance.now() + secs * 1000; },
    cerrarCasco() { abrirObj = 0; abrirHasta = 0; },
    abierto: () => abierto,
    // se muda de monitor: rueda en la dirección del viaje (dir = 1 derecha, -1 izquierda)
    rodar(dir = 1) { const base = react > 0 ? prevState : stateName; spin = 1.7 * dir; wob = .35; this.inercia(dir * 1100, 0); impulso = -.45; flash(base === 'dormido' ? 'reposo' : base, '', 1.3); },
    setState(name, msg = '') {
      if (!STATES[name]) return;
      if (name !== 'reposo' && ESCENAS.has(gesto)) this.cancelarGesto();
      if (react > 0) { prevState = name; prevMsg = msg || MSG_ESTADO()[name] || ''; return; }
      stateName = name; target = STATES[name];
      message = msg || MSG_ESTADO()[name] || '';
    },
    pushLog(line) { log.push(String(line)); if (log.length > 60) log.shift(); scroll = 0; },
    setFps(v) { fps = v; },
    destruir() {                                       // libera el contexto WebGL (el panel monta y desmonta robots)
      muerto = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('mousemove', onMove);
      scene.traverse(o => { o.geometry?.dispose?.(); });
      hudTex.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
