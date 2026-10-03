// Hero: el casco 3D real (casco.glb + three.js local). Te mira, hace gestos al hacer scroll y se acopla en una esquina.
// Sin WebGL o con «reducir movimiento» se queda el póster estático.
const bot = document.getElementById('bot'), canvas = document.getElementById('botc');
const perm = document.getElementById('perm');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lang = () => document.documentElement.lang;
const EN = { '¡HOLA! 👋': 'HI! 👋', '¡EY!': 'HEY!', '¿PERMISO?': 'PERMISSION?', '✓ TAREA COMPLETA': '✓ TASK DONE', '✗ ERROR': '✗ ERROR', 'MAREADO': 'DIZZY', '¡PARA, PARA!': 'STOP, STOP!' };
globalThis.tr = s => (lang() === 'en' ? EN[s] || s : s);
const M = {
  ok: { es: '✓ PERMITIDO', en: '✓ ALLOWED' }, no: { es: '✗ DENEGADO', en: '✗ DENIED' },
  hola: { es: '¡HOLA! 👋', en: 'HI! 👋' }, perm: { es: '¿PERMISO?', en: 'PERMISSION?' },
};
const m = k => M[k][lang() === 'en' ? 'en' : 'es'];

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

let robot = null;
async function start() {
  if (RM || !webgl()) return;
  try {
    await fetch('casco.glb', { cache: 'force-cache' });          // que el GLB esté en caché antes de pintar
    const { createRobot } = await import('./robot3d.js');
    robot = createRobot(canvas, 'casco.glb', { animacion: 'raton', log: ['> apolo online', 'claude code · listo', 'ollama/qwen3.6 · local', 'skills: 6 · limpias'] });
    setTimeout(() => { bot.classList.add('ready'); robot.greet(m('hola')); }, 700);
    wire();
  } catch (e) { console.warn('robot 3D no disponible', e); }
}

function wire() {
  // en táctil no hay mousemove: mira hacia donde tocas
  addEventListener('touchstart', e => { const t = e.touches[0]; t && robot.lookAtClient(t.clientX, t.clientY); }, { passive: true });
  bot.addEventListener('click', () => robot.poke());
  let hov = 0;
  bot.addEventListener('mouseenter', () => { if (performance.now() - hov > 4000) { hov = performance.now(); robot.gesto('feliz', 2); } });

  // gestos al llegar a cada sección
  let ultimo = performance.now() + 2500;                       // nada de gestos en cadena al cargar
  const io = new IntersectionObserver(es => es.forEach(x => {
    if (!x.isIntersecting || !robot) return;
    const ahora = performance.now();
    if (ahora - ultimo < 1800) return;
    ultimo = ahora;
    const g = x.target.dataset.gesto;
    if (g === 'permiso') robot.hud(m('perm'), 2.5, 'permiso');
    else if (g === 'remolino') robot.dizzy(1);
    else robot.gesto(g, 2.6);
  }), { threshold: .35 });
  document.querySelectorAll('.sec[data-gesto]').forEach(s => io.observe(s));

  // al salir del hero, el robot se acopla abajo a la derecha y te acompaña
  const slot = bot.parentElement;
  new IntersectionObserver(([x]) => {
    const dock = !x.isIntersecting;
    bot.classList.toggle('dock', dock);
    robot.setFps(dock ? 30 : 60);
  }, { threshold: 0 }).observe(slot);
}

// ---- tarjeta de permiso interactiva (funciona también sin 3D) ----
let ciclo = 0;
function resolver(si) {
  clearTimeout(ciclo);
  perm.classList.add(si ? 'ok' : 'no');
  if (robot) { if (si) robot.hud(m('ok'), 2, 'listo'); else { robot.gesto('no', 1.6); robot.hud(m('no'), 2, 'error'); } }
  ciclo = setTimeout(() => {
    perm.classList.add('hide');
    ciclo = setTimeout(() => { perm.classList.remove('ok', 'no', 'hide'); if (robot) robot.setState('permiso', m('perm')); ciclo = setTimeout(() => resolver(true), 9000); }, 3500);
  }, 1400);
}
perm.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) resolver(b.dataset.act === 'si'); });
if (!RM) setTimeout(() => { if (robot) robot.setState('permiso', m('perm')); ciclo = setTimeout(() => resolver(true), 9000); }, 3600);

if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 }); else setTimeout(start, 300);
