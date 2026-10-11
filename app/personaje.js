// Personaje 3D animado (GLB con esqueleto + clips) como alternativa al casco en la isla. Misma API que createRobot
// (robot.js): setState, gesto, greet, poke, dizzy, rodar, hud, pushLog, lookAtClient, ocupado, setFps, destruir.
//   const p = createPersonaje(canvas, 'personajes/blueguy.glb');
// Los clips del GLB se llaman como en PERSONAJE_CLIPS (los genera Projects/neuro-diorama/blue_guy_isla.py):
//   Reposo Trabajando Duda Saludo Celebrar Feliz Triste Dormir Mareo Sorpresa Pensativo Bostezo Correr
// Encima de la animación: la cabeza sigue al cursor, parpadea (morph "parpadeo"), gira al mudarse y se sacude al tocarlo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// estado del casco → clip (y tono del brillo, igual que el casco)
const ESTADOS = {
  reposo:     { clip: 'Reposo',     hue: 145, glow: .5 },
  trabajando: { clip: 'Trabajando', hue: 195, glow: 1.3 },
  permiso:    { clip: 'Duda',       hue: 40,  glow: 1.1 },
  listo:      { clip: 'Feliz',      hue: 125, glow: 1 },
  error:      { clip: 'Triste',     hue: 0,   glow: 1.1 },
  dormido:    { clip: 'Dormir',     hue: 220, glow: .12 },
};
// gestos del casco → clip (null = solo movimiento de cabeza encima del clip del estado)
const GESTOS = {
  saludo: 'Saludo', celebrar: 'Celebrar', feliz: 'Feliz', corazon: 'Feliz', guino: 'Feliz', reloj: 'Saludo',
  triste: 'Triste', duda: 'Duda', bostezo: 'Bostezo', estornudo: 'Sorpresa', sorpresa: 'Sorpresa',
  pensativo: 'Pensativo', navegando: 'Trabajando', remolino: 'Mareo', correr: 'Correr', si: null, no: null, mirar: null,
};
const UNA_VEZ = new Set(['Sorpresa', 'Bostezo']);

export function createPersonaje(canvas, glbUrl, opts = {}) {
  let raf = 0, muerto = false, fps = 30, acc = 0, last = performance.now();
  let estado = 'reposo', gesto = '', gestoIni = 0, gestoHasta = 0, react = 0, prevEstado = 'reposo';
  let mx = 0, my = 0, hx = 0, hy = 0, wob = 0, spin = 0, spinA = 0, yawObj = 0, yaw = 0;
  let blink = 0, blinkT = 2;

  // ---------- globo de texto (el casco lo pinta en su visor; aquí va encima de la cabeza) ----------
  const globo = document.createElement('div');
  globo.style.cssText = 'position:absolute;left:50%;top:-4px;transform:translate(-50%,-100%);padding:2px 7px;border-radius:9px;'
    + 'background:rgba(10,14,20,.82);color:#e8fff2;font:600 10px system-ui,sans-serif;white-space:nowrap;pointer-events:none;'
    + 'opacity:0;transition:opacity .25s;max-width:220px;overflow:hidden;text-overflow:ellipsis';
  canvas.parentElement?.appendChild(globo);
  let globoT = 0;
  const decir = (msg, secs = 2.5) => {
    if (!msg) return;
    globo.textContent = String(msg); globo.style.opacity = '1';
    clearTimeout(globoT); globoT = setTimeout(() => { globo.style.opacity = '0'; }, secs * 1000);
  };

  // ---------- escena ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a4250, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1.5, 2.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, .8); rim.position.set(2, 1.5, -2); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 1, .05, 30);
  // encuadre: cuerpo entero (pies incluidos) con margen arriba para los saltos y los brazos alzados
  camera.position.set(0, 1.05, 4.6); camera.lookAt(0, .9, 0);
  const pivote = new THREE.Group(); scene.add(pivote);

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let mixer = null, acciones = {}, actual = null, cabeza = null, cuello = null, morphs = [];
  new GLTFLoader().load(glbUrl, g => {
    if (muerto) return;
    pivote.add(g.scene);
    // encuadre según la altura del personaje (cuerpo entero, margen arriba para saltos y brazos alzados)
    // caja con la piel YA deformada por el esqueleto (la geometría en crudo está en el espacio de enlace)
    g.scene.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    g.scene.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); caja.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    if (caja.isEmpty()) caja.setFromObject(g.scene);
    const alto = Math.max(.5, caja.max.y - caja.min.y);
    camera.position.set(0, caja.min.y + alto * .59, alto * 2.6); camera.lookAt(0, caja.min.y + alto * .5, 0);
    g.scene.traverse(o => {
      if (o.isBone && o.name === 'head') cabeza = o;
      if (o.isBone && o.name === 'neck_01') cuello = o;
      if (o.isMesh && o.morphTargetDictionary && 'parpadeo' in o.morphTargetDictionary) morphs.push(o);
      if (o.isMesh) o.frustumCulled = false;            // el esqueleto se sale de la caja original al animar
    });
    mixer = new THREE.AnimationMixer(g.scene);
    for (const c of g.animations) {
      const a = mixer.clipAction(c);
      if (UNA_VEZ.has(c.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      acciones[c.name] = a;
    }
    reproducir(clipDeseado(), 0);
  }, undefined, e => console.warn('[personaje] no se pudo cargar', glbUrl, e));

  function reproducir(nombre, fundido = .3) {
    const a = acciones[nombre] || acciones.Reposo;
    if (!a || a === actual) return;
    a.reset().setEffectiveWeight(1).play();
    if (actual) actual.crossFadeTo(a, fundido, false);
    actual = a;
  }
  const gestoActivo = () => performance.now() < gestoHasta;
  function clipDeseado() {
    if (gestoActivo() && GESTOS[gesto]) return GESTOS[gesto];
    return (ESTADOS[estado] || ESTADOS.reposo).clip;
  }

  // ---------- bucle ----------
  function frame(now) {
    if (muerto) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(.1, (now - last) / 1000)); last = now;
    acc += dt; if (acc < 1 / fps) return;
    const step = acc; acc = 0;
    if (react > 0) { react -= step; if (react <= 0) estado = prevEstado; }
    if (mixer) {
      // la cabeza y el cuello vuelven a la pose de la animación ANTES de animar: el giro hacia el cursor se suma
      // siempre sobre esa base (si un clip no trae pista de ese hueso, sin esto el giro se acumulaba y daba vueltas)
      for (const b of [cabeza, cuello]) if (b && b.userData.base) b.quaternion.copy(b.userData.base);
      reproducir(clipDeseado());
      mixer.update(step);
      for (const b of [cabeza, cuello]) if (b) (b.userData.base ||= new THREE.Quaternion()).copy(b.quaternion);
    }
    // cabeza: sigue al cursor (dormido no), más los movimientos de los gestos que no tienen clip
    const dormido = estado === 'dormido' && !gestoActivo();
    const k = 1 - Math.pow(.004, step);
    hx += ((dormido ? 0 : mx) - hx) * k; hy += ((dormido ? 0 : my) - hy) * k;
    let gy = 0, gx = 0;
    if (gestoActivo()) {
      const t = (performance.now() - gestoIni) / 1000, f = (performance.now() - gestoIni) / (gestoHasta - gestoIni), s = Math.sin(f * Math.PI);
      if (gesto === 'si') gx = Math.sin(t * 11) * .25 * s;
      else if (gesto === 'no') gy = Math.sin(t * 10) * .4 * s;
      else if (gesto === 'mirar') gy = Math.sin(t * 1.6) * .8 * s;
    }
    if (cabeza && cuello) {
      pivote.updateMatrixWorld(true);
      // límites: como mucho ~25° de lado y ~12° arriba/abajo entre cuello y cabeza
      const yawT = Math.max(-.45, Math.min(.45, hx * .45 + gy)), pitchT = Math.max(-.22, Math.min(.22, hy * .22 + gx));
      girarMundo(cuello, yawT * .35, pitchT * .35);
      girarMundo(cabeza, yawT * .65, pitchT * .65);
    }
    // parpadeo (dormido: ojos cerrados)
    blinkT -= step; if (blinkT < 0) { blink = 1; blinkT = Math.random() < .2 ? .28 : 2.5 + Math.random() * 4; }
    blink = Math.max(0, blink - step * 7);
    const cerrado = dormido ? 1 : Math.min(1, blink * 1.6);
    for (const m of morphs) m.morphTargetInfluences[m.morphTargetDictionary.parpadeo] = cerrado;
    // vueltas (mareo / mudanza) y sacudida al tocarlo
    wob *= Math.pow(.03, step); spin *= Math.pow(.25, step); spinA += spin * step * 14;
    if (Math.abs(spin) < .02) spinA *= Math.pow(.02, step);
    yaw += (yawObj - yaw) * (1 - Math.pow(.01, step));
    pivote.rotation.y = spinA + yaw;
    pivote.rotation.z = Math.sin(now / 45) * .12 * wob;
    pivote.position.y = Math.abs(Math.sin(now / 90)) * .06 * wob;
    renderer.render(scene, camera);
    const e = ESTADOS[estado] || ESTADOS.reposo;
    canvas.style.setProperty('--glow', `hsla(${e.hue},100%,55%,${(.35 + .35 * Math.min(1, e.glow)).toFixed(2)})`);
  }
  // rota un hueso en ejes del MUNDO (yaw alrededor de Y, pitch alrededor de X) sobre la pose de la animación
  const _p = new THREE.Quaternion(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function girarMundo(hueso, yawR, pitchR) {
    hueso.parent.getWorldQuaternion(_p);
    _q.setFromEuler(_e.set(pitchR, yawR, 0, 'YXZ'));
    // local' = P⁻¹ · Q · P · local
    hueso.quaternion.premultiply(_p.clone().invert().multiply(_q).multiply(_p));
  }
  raf = requestAnimationFrame(frame);

  function lookAtClient(x, y) {
    const r = canvas.getBoundingClientRect();
    mx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / 600));
    my = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / 450));
  }
  const onMove = e => lookAtClient(e.clientX, e.clientY);
  addEventListener('mousemove', onMove);
  function flash(nombre, msg, secs) {
    if (react <= 0) prevEstado = estado;
    estado = nombre; react = secs; decir(msg, secs);
  }
  const T = s => (typeof globalThis.tr === 'function' ? globalThis.tr(s) : s);
  const MSG = () => ({ permiso: T('¿PERMISO?'), listo: T('✓ TAREA COMPLETA'), error: T('✗ ERROR') });

  return {
    esPersonaje: true,
    lookAtClient,
    poke() { wob = 1; this.gesto('sorpresa', 1.1); decir(T('¡EY!'), 1.1); },
    hud(msg, secs = 3, st = 'trabajando') { flash(st, msg, secs); },
    dizzy(fuerza = 1) {
      spin = Math.min(2.2, .9 + fuerza * .45); wob = .6;
      const secs = 2.6 + fuerza * 1.1;
      this.gesto('remolino', secs); decir('@_@  ' + T(fuerza >= 3 ? '¡PARA, PARA!' : 'MAREADO'), secs);
    },
    greet(msg = T('¡HOLA! 👋')) { wob = .8; this.gesto('saludo', 2.6); decir(msg, 2.8); },
    gesto(nombre, secs = 3, msg) {
      gesto = nombre; gestoIni = performance.now(); gestoHasta = gestoIni + secs * 1000;
      if (actual && GESTOS[nombre] && UNA_VEZ.has(GESTOS[nombre])) { const a = acciones[GESTOS[nombre]]; if (a === actual) a.reset().play(); }
      if (msg) decir(msg, secs);
    },
    ocupado: () => gestoActivo() || react > 0,
    // se muda de monitor: corre hacia ese lado y luego vuelve a mirar al frente
    rodar(dir = 1) {
      yawObj = 1.1 * dir; this.gesto('correr', 1.3);
      setTimeout(() => { yawObj = 0; }, 1300);
    },
    setState(nombre, msg = '') {
      if (!ESTADOS[nombre]) return;
      if (react > 0) { prevEstado = nombre; return; }
      estado = nombre;
      const m = msg || MSG()[nombre]; if (m) decir(m, 3);
    },
    pushLog() { },                                     // el casco lo enseña en su visor; el personaje no tiene visor
    setFps(v) { fps = v; },
    destruir() {
      muerto = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('mousemove', onMove);
      clearTimeout(globoT); globo.remove();
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); });
      renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
