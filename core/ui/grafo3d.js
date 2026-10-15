// Grafo de la memoria en 3D: espacio libre (girar en todos los ejes, desplazarse, volar con WASD/QE), esferas con halo,
// estrellas, etiquetas HTML y vuelo de cámara al tocar un punto. Lo usa MV_SUB.grafo (memoria2.js) vía window.Grafo3D.
import * as THREE from './vendor/three.module.min.js';

function crear(caja, { nodos, aristas, visible, linea, colores, acento, alTocar }) {
  const css = getComputedStyle(document.documentElement);
  const fondoCss = getComputedStyle(caja).backgroundColor !== 'rgba(0, 0, 0, 0)' ? getComputedStyle(caja).backgroundColor : (css.getPropertyValue('--capa').trim() || getComputedStyle(document.body).backgroundColor || '#0b0d10');
  const fondo = new THREE.Color(); try { fondo.setStyle(fondoCss); } catch { fondo.set('#0b0d10'); }
  const oscuro = fondo.r * .3 + fondo.g * .59 + fondo.b * .11 < .5;
  const mezcla = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setClearColor(fondo);
  const cv = renderer.domElement; cv.className = 'mv-3d'; cv.tabIndex = 0;
  caja.prepend(cv);
  const capaEt = document.createElement('div'); capaEt.className = 'mv-etiquetas'; caja.appendChild(capaEt);

  const escena = new THREE.Scene();
  escena.fog = new THREE.FogExp2(fondo, oscuro ? 0.0011 : 0.0009);
  const cam = new THREE.PerspectiveCamera(45, 1, 1, 20000);
  cam.position.set(0, 160, 820);
  const objetivo = new THREE.Vector3();
  escena.add(new THREE.AmbientLight(0xffffff, oscuro ? .55 : .9));
  const luz = new THREE.PointLight(0xffffff, oscuro ? 2.2 : 1.2, 0, 0); escena.add(luz);

  // estrellas
  {
    const n = 1800, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1800 + Math.random() * 3000); p.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    escena.add(new THREE.Points(g, new THREE.PointsMaterial({ color: oscuro ? 0x8fa3b8 : 0x6b7785, size: 2, sizeAttenuation: false, transparent: true, opacity: oscuro ? .55 : .35, fog: false })));
  }

  // ---------- nodos ----------
  const N = nodos.length;
  const colorDe = n => new THREE.Color(n.id === 'usuario' ? acento : colores[n.tipo] || '#999');
  const radio = n => n.id === 'usuario' ? 14 : 3.5 + Math.min(11, Math.sqrt(n.peso || 1) * 2.4);
  // esfera "orbe": núcleo de luz interior que se mueve como plasma, aura en el borde (fresnel), brillo de cristal,
  // y 'brillo' por nodo (InstancedBufferAttribute) que la enciende por dentro cuando le llega un impulso
  const geoEsfera = new THREE.SphereGeometry(1, 32, 22);
  const brillo = new Float32Array(Math.max(1, N));
  geoEsfera.setAttribute('brillo', new THREE.InstancedBufferAttribute(brillo, 1));
  const rojez = new Float32Array(Math.max(1, N));
  geoEsfera.setAttribute('rojez', new THREE.InstancedBufferAttribute(rojez, 1));
  const matEsfera = new THREE.ShaderMaterial({
    uniforms: { tiempo: { value: 0 }, fondo: { value: fondo }, niebla: { value: oscuro ? 0.0011 : 0.0009 }, oscuro: { value: oscuro ? 1 : 0 }, lejos: { value: 0 } },
    vertexShader: `
      attribute float brillo; attribute float rojez;
      varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vB; varying float vDist; varying vec3 vP; varying float vR;
      void main() {
        vR = rojez;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        vC = instanceColor; vB = brillo; vP = position; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float tiempo; uniform vec3 fondo; uniform float niebla; uniform float oscuro; uniform float lejos;
      varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vB; varying float vDist; varying vec3 vP; varying float vR;
      float plasma(vec3 p) {
        return sin(p.x * 3.1 + tiempo * 1.3) * sin(p.y * 2.7 - tiempo * 1.1) * sin(p.z * 3.3 + tiempo * 0.9)
             + 0.5 * sin(p.x * 6.0 - p.z * 5.0 + tiempo * 2.0);
      }
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float borde = pow(1.0 - ndv, 2.6);
        float centro = pow(ndv, 2.2);
        float rem = 0.5 + 0.35 * plasma(vP * 1.2);
        vec3 col = vC * (0.22 + 0.95 * centro * rem) + vC * vC * 0.25 * centro;                  // núcleo de luz que se mueve
        col += mix(vC, vec3(1.0), 0.25) * borde * 1.7;                                       // aura en el borde
        vec3 l = normalize(vec3(-0.45, 0.6, 1.0));
        col += vec3(1.0) * pow(max(dot(reflect(-l, n), v), 0.0), 48.0) * 0.45;   // brillo de cristal
        vec3 luz = mix(mix(vC, vec3(1.0), 0.55), vec3(1.0, 0.18, 0.26), clamp(vR, 0.0, 1.0));   // APOLO la tocó: luz roja
        col += luz * vB * (0.35 + 1.25 * centro * (0.7 + 0.6 * rem)); // el impulso la enciende por dentro
        col += luz * vB * borde * 0.8;
        col *= 1.0 + lejos * 0.55;                                      // de lejos brillan más: si no, se apagan
        float f = 1.0 - exp(-niebla * niebla * vDist * vDist);
        gl_FragColor = vec4(mix(col, fondo, f * 0.85), 1.0);
      }`,
  });
  const esferas = new THREE.InstancedMesh(geoEsfera, matEsfera, Math.max(1, N));
  esferas.setColorAt(0, new THREE.Color('#ffffff'));          // crea instanceColor antes de compilar (USE_INSTANCING_COLOR)
  esferas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  escena.add(esferas);
  // halos: un punto con brillo por nodo (shader propio: tamaño por nodo, se atenúa con la distancia)
  const hPos = new Float32Array(N * 3), hCol = new Float32Array(N * 3), hTam = new Float32Array(N);
  const hGeo = new THREE.BufferGeometry();
  hGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3)); hGeo.setAttribute('color', new THREE.BufferAttribute(hCol, 3)); hGeo.setAttribute('tam', new THREE.BufferAttribute(hTam, 1));
  const halos = new THREE.Points(hGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: mezcla, vertexColors: true,
    uniforms: { escala: { value: 1 }, fuerza: { value: oscuro ? .9 : .45 } },
    vertexShader: 'attribute float tam; varying vec3 vC; uniform float escala; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = tam > 0.0 ? max(5.0, tam * escala * 300.0 / -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; uniform float fuerza; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * fuerza; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }',
  }));
  escena.add(halos);

  // ---------- líneas ----------
  const A = aristas.length;
  const lPos = new Float32Array(A * 6), lCol = new Float32Array(A * 6);
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3)); lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
  const lineas = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: mezcla }));
  escena.add(lineas);
  esferas.frustumCulled = halos.frustumCulled = lineas.frustumCulled = false;   // se mueven cada fotograma
  const cTenue = new THREE.Color(css.getPropertyValue('--txt-3').trim() || '#777');

  // ---------- impulsos nerviosos: viajan por las conexiones; al llegar el nodo destella y a veces dispara más (cascada) ----------
  const MAX_IMP = 260, ESTELA = 14;
  const iPos = new Float32Array(MAX_IMP * ESTELA * 3), iCol = new Float32Array(MAX_IMP * ESTELA * 3), iTam = new Float32Array(MAX_IMP * ESTELA);
  const iGeo = new THREE.BufferGeometry();
  iGeo.setAttribute('position', new THREE.BufferAttribute(iPos, 3)); iGeo.setAttribute('color', new THREE.BufferAttribute(iCol, 3)); iGeo.setAttribute('tam', new THREE.BufferAttribute(iTam, 1));
  const impulsosMalla = new THREE.Points(iGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: mezcla, vertexColors: true,
    uniforms: { escala: { value: 1 } },
    vertexShader: 'attribute float tam; varying vec3 vC; uniform float escala; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = tam > 0.0 ? max(5.0, tam * escala * 300.0 / -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float nucleo = smoothstep(0.35, 0.0, d); float a = pow(max(0.0, 1.0 - d), 2.0) + nucleo; if (a < 0.02) discard; gl_FragColor = vec4(mix(vC * 1.5, vec3(1.0), nucleo * 0.7), min(1.0, a)); }',
  }));
  impulsosMalla.frustumCulled = false;
  escena.add(impulsosMalla);
  const cImp = new THREE.Color(acento).lerp(new THREE.Color('#ffffff'), oscuro ? .35 : 0);
  const impulsos = [];                                   // { l, desde (nodo), t, gen, rojo }
  const cRojo = new THREE.Color('#ff2d4a');
  let vivas = [], porNodo = new Map(), acumulado = 0;
  function disparar(l, desde, gen = 0, rojo = false) {
    if (!l || (impulsos.length >= MAX_IMP && !rojo)) return;
    if (impulsos.length >= MAX_IMP) impulsos.splice(impulsos.findIndex(p => !p.rojo), 1);   // los rojos (APOLO de verdad) tienen prioridad
    impulsos.push({ l, desde, t: 0, gen, rojo });
  }
  function dispararDesde(n, cuantos, gen = 0, salvo = null, rojo = false) {
    const ls = (porNodo.get(n.id) || []).filter(l => l !== salvo);
    for (let i = 0; i < cuantos && ls.length; i++) disparar(ls.splice(Math.floor(Math.random() * ls.length), 1)[0], n, gen, rojo);
  }
  function pulsar(dt) {
    // en reposo: chispas sueltas por la red; con algo seleccionado, ese nodo "piensa" más
    acumulado += dt * (sel ? 30 : 20);
    while (acumulado >= 1 && vivas.length) {
      acumulado--;
      if (sel && Math.random() < .65) dispararDesde(sel, 1);
      else { const l = vivas[Math.floor(Math.random() * vivas.length)]; disparar(l, Math.random() < .5 ? l.s : l.t); }
    }
    for (let i = impulsos.length - 1; i >= 0; i--) {
      const p = impulsos[i], a = p.desde.p3, hasta = p.desde === p.l.s ? p.l.t : p.l.s, b = hasta.p3;
      const largo = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
      p.t += dt * 200 / largo * (1 + p.gen * .15);
      if (p.t >= 1 || !linea(p.l)) {
        impulsos.splice(i, 1);
        if (p.t >= 1) {
          if (!p.rojo) hasta.flash = Math.min(1.4, (hasta.flash || 0) + .9);
          if (p.rojo) { hasta.rojo = 1.5; if (p.gen < 2 && hasta.id !== 'usuario') dispararDesde(hasta, 2, p.gen + 1, p.l, true); }
          else if (p.gen < 4 && Math.random() < (hasta.id === 'usuario' ? .35 : .6)) dispararDesde(hasta, Math.random() < .35 ? 2 : 1, p.gen + 1, p.l);
        }
      }
    }
    // al buffer: cabeza grande y estela que se apaga
    iTam.fill(0);
    impulsos.forEach((p, i) => {
      const a = p.desde.p3, b = (p.desde === p.l.s ? p.l.t : p.l.s).p3;
      const fuerza = (1 - p.gen * .14) * (p.rojo ? 1.6 : 1), cc = p.rojo ? cRojo : cImp;
      for (let k = 0; k < ESTELA; k++) {
        const t = Math.max(0, p.t - k * .016), j = i * ESTELA + k, desv = 1 - k / ESTELA;
        iPos[j * 3] = a.x + (b.x - a.x) * t; iPos[j * 3 + 1] = a.y + (b.y - a.y) * t; iPos[j * 3 + 2] = a.z + (b.z - a.z) * t;
        const br = fuerza * desv * (oscuro ? 1 : .9);
        iCol[j * 3] = cc.r * br; iCol[j * 3 + 1] = cc.g * br; iCol[j * 3 + 2] = cc.b * br;
        iTam[j] = (k === 0 ? 64 : 42 * desv) * fuerza;
      }
    });
    iGeo.attributes.position.needsUpdate = iGeo.attributes.color.needsUpdate = iGeo.attributes.tam.needsUpdate = true;
  }
  const cAcento = new THREE.Color(acento);

  // ---------- posiciones iniciales: esfera de Fibonacci, lo importante más cerca del centro ----------
  const orden = [...nodos].sort((a, b) => b.importancia - a.importancia);
  orden.forEach((n, i) => {
    if (n.p3) return;
    if (n.id === 'usuario') { n.p3 = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }; return; }
    const y = 1 - 2 * ((i + .5) / orden.length), r = Math.sqrt(1 - y * y), t = i * 2.39996, R = 60 + 22 * Math.sqrt(i);
    n.p3 = { x: Math.cos(t) * r * R, y: y * R, z: Math.sin(t) * r * R, vx: 0, vy: 0, vz: 0 };
  });

  let alfa = 1, sel = null, hover = null, vecSel = new Set(), aislado = null;
  const visibleBase = visible, lineaBase = linea;
  const activo = n => n.activoHasta > performance.now();
  visible = n => aislado ? n === aislado || !!vec.get(aislado.id)?.has(n.id) : visibleBase(n) || activo(n);
  linea = l => aislado ? l.s === aislado || l.t === aislado : lineaBase(l) || ((activo(l.s) || activo(l.t)) && visible(l.s) && visible(l.t) && (l.s.id === 'usuario' || l.t.id === 'usuario'));
  const vec = new Map();
  for (const a of aristas) for (const [x, y] of [[a.s, a.t], [a.t, a.s]]) { if (!vec.has(x.id)) vec.set(x.id, new Set()); vec.get(x.id).add(y.id); }

  function simular() {
    const V = nodos.filter(visible), L = aristas.filter(linea), k = alfa;
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      const a = V[i].p3, b = V[j].p3; let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const d2 = dx * dx + dy * dy + dz * dz || .01;
      if (d2 > 360000) continue;
      const d = Math.sqrt(d2), f = 5200 / d2 * k; dx /= d; dy /= d; dz /= d;
      a.vx -= dx * f; a.vy -= dy * f; a.vz -= dz * f; b.vx += dx * f; b.vy += dy * f; b.vz += dz * f;
    }
    for (const l of L) {
      const a = l.s.p3, b = l.t.p3; let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || .01;
      const largo = l.s.id === 'usuario' || l.t.id === 'usuario' ? 170 : 75, f = (d - largo) * .018 * k * Math.min(2, 1 + (l.peso - 1) * .2);
      dx /= d; dy /= d; dz /= d; a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
    for (const n of V) {
      const p = n.p3;
      if (n === aislado) { p.vx = p.vy = p.vz = 0; continue; }                     // aislado: quieto, lo demás se ordena a su alrededor
      if (n.id === 'usuario') { p.x *= .9; p.y *= .9; p.z *= .9; p.vx = p.vy = p.vz = 0; continue; }
      const cx = aislado ? aislado.p3.x : 0, cy = aislado ? aislado.p3.y : 0, cz = aislado ? aislado.p3.z : 0;
      p.vx -= (p.x - cx) * .003 * k; p.vy -= (p.y - cy) * .003 * k; p.vz -= (p.z - cz) * .003 * k;
      p.vx *= .8; p.vy *= .8; p.vz *= .8;
      const lim = 30; p.x += Math.max(-lim, Math.min(lim, p.vx)); p.y += Math.max(-lim, Math.min(lim, p.vy)); p.z += Math.max(-lim, Math.min(lim, p.vz));
    }
    alfa *= .99;
  }

  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), esc = new THREE.Vector3();
  const cBlanco = new THREE.Color('#ffffff');
  let solos = new Set(), lejos = 0, ahora = 0;                                   // visibles sin ninguna línea visible: tienen vida propia
  function volcar(t = 0) {
    const tenue = new THREE.Color().copy(fondo);
    solos = new Set(nodos.filter(n => visible(n) && !porNodo.has(n.id)).map(n => n.id));
    vivas = []; porNodo = new Map();
    nodos.forEach((n, i) => {
      const vis = visible(n), p = n.p3, r = vis ? radio(n) * (n === sel ? 1.35 : n === hover ? 1.15 : 1) : 0;
      m4.compose(v3.set(p.x, p.y, p.z), q0, esc.set(r, r, r)); esferas.setMatrixAt(i, m4);
      const c = colorDe(n), fl = Math.min(1, n.flash || 0);
      const apagado = !aislado && ((sel && n !== sel && !vecSel.has(n.id)) || n.antes);
      if (apagado) c.lerp(tenue, sel && n !== sel && !vecSel.has(n.id) ? .78 : .45);
      const ro = Math.min(1, n.rojo || 0); if (ro > .01) c.lerp(cRojo, ro * .85); rojez[i] = ro;
      esferas.setColorAt(i, c);
      const respira = solos.has(n.id) ? .18 + .16 * Math.sin(t * .0016 + i * 1.7) : 0;
      brillo[i] = Math.min(1.8, fl * 1.2 + respira + ro * 1.2);
      hPos.set([p.x, p.y, p.z], i * 3); hCol.set([c.r, c.g, c.b], i * 3);
      hTam[i] = vis ? r * (n === sel ? 7 : n.id === 'usuario' ? 6 : 4.2) * (apagado ? .5 : 1) * (1 + fl * 1.6 + (solos.has(n.id) ? .5 + .4 * Math.sin(t * .0016 + i * 1.7) : 0)) : 0;
    });
    esferas.instanceMatrix.needsUpdate = true; if (esferas.instanceColor) esferas.instanceColor.needsUpdate = true;
    geoEsfera.attributes.brillo.needsUpdate = geoEsfera.attributes.rojez.needsUpdate = true;
    hGeo.attributes.position.needsUpdate = hGeo.attributes.color.needsUpdate = hGeo.attributes.tam.needsUpdate = true;
    let k = 0;
    for (const l of aristas) {
      const vis = linea(l), a = l.s.p3, b = l.t.p3;
      if (vis) { vivas.push(l); for (const n of [l.s, l.t]) { if (!porNodo.has(n.id)) porNodo.set(n.id, []); porNodo.get(n.id).push(l); } }
      const on = sel && (l.s === sel || l.t === sel), aTu = l.s.id === 'usuario' || l.t.id === 'usuario';
      const fuerza = (!vis ? 0 : on ? 1 : sel ? .05 : aTu ? .1 : Math.min(.55, .16 + l.peso * .09)) * (1 + lejos * .8);
      const c = (on ? cAcento : cTenue);
      if (vis) lPos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6); else lPos.fill(0, k * 6, k * 6 + 6);   // oculta = longitud cero (la niebla aditiva las haría asomar)
      // con mezcla aditiva el "alfa" va en el color; en tema claro se aclara hacia el fondo
      const r = oscuro ? c.r * fuerza : c.r + (fondo.r - c.r) * (1 - fuerza), g = oscuro ? c.g * fuerza : c.g + (fondo.g - c.g) * (1 - fuerza), bl = oscuro ? c.b * fuerza : c.b + (fondo.b - c.b) * (1 - fuerza);
      lCol.set([r, g, bl, r, g, bl], k * 6); k++;
    }
    lGeo.attributes.position.needsUpdate = lGeo.attributes.color.needsUpdate = true;
  }

  // ---------- etiquetas HTML (nítidas): Tú, lo seleccionado y sus vecinos, y lo más importante cercano ----------
  const pool = [];
  function etiquetas() {
    const W = caja.clientWidth, H = caja.clientHeight;
    const cand = nodos.filter(n => visible(n) && (aislado || n.id === 'usuario' || n === sel || n === hover || vecSel.has(n.id) || n.top));
    const conDist = cand.map(n => ({ n, d: cam.position.distanceTo(v3.set(n.p3.x, n.p3.y, n.p3.z)) }))
      .sort((a, b) => (b.n === sel || b.n === hover) - (a.n === sel || a.n === hover) || (b.n.importancia / b.d) - (a.n.importancia / a.d)).slice(0, sel ? 50 : 34);
    let i = 0; const puestas = [];
    for (const { n, d } of conDist) {
      v3.set(n.p3.x, n.p3.y, n.p3.z).project(cam);
      if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) continue;
      const fuerteYa = n === sel || n === hover || n.id === 'usuario';
      const tam = Math.max(10, Math.min(16, 9000 / d)), sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * H + radio(n) * 300 / d + 4, an = n.nombre.length * tam * .56;
      if (!fuerteYa && puestas.some(p => Math.abs(p.x - sx) < (p.an + an) / 2 && Math.abs(p.y - sy) < tam + 2)) continue;   // no pisar otra etiqueta
      puestas.push({ x: sx, y: sy, an });
      const el = pool[i] || (pool[i] = capaEt.appendChild(document.createElement('span'))); i++;
      const fuerte = fuerteYa;
      el.textContent = n.nombre;
      el.className = fuerte ? 'fuerte' : '';
      el.style.opacity = fuerte ? 1 : Math.max(.25, Math.min(.95, 520 / d));
      el.style.fontSize = tam + 'px';
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translateX(-50%)`;
      el.style.display = '';
    }
    for (; i < pool.length; i++) pool[i].style.display = 'none';
  }

  // ---------- cámara: trackball (todos los ejes), desplazar, zoom, volar con teclado ----------
  let ultimoToque = performance.now(), vuelo = null;
  const tecl = new Set();
  const despierta = () => { ultimoToque = performance.now(); };
  function rotar(dx, dy) {
    const ojo = v3.copy(cam.position).sub(objetivo);
    const der = new THREE.Vector3().crossVectors(cam.up, ojo).normalize(), arriba = cam.up.clone().normalize();
    const mov = der.multiplyScalar(-dx).add(arriba.multiplyScalar(dy));
    const ang = mov.length() * .005; if (!ang) return;
    const eje = new THREE.Vector3().crossVectors(mov, ojo).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(eje, ang);
    ojo.applyQuaternion(q); cam.up.applyQuaternion(q);
    cam.position.copy(objetivo).add(ojo); cam.lookAt(objetivo);
  }
  function desplazar(dx, dy) {
    const dist = cam.position.distanceTo(objetivo), f = dist * .0016;
    const der = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), arr = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
    const m = der.multiplyScalar(-dx * f).add(arr.multiplyScalar(dy * f));
    cam.position.add(m); objetivo.add(m);
  }
  function acercar(f) {
    const ojo = v3.copy(cam.position).sub(objetivo); const l = Math.max(12, Math.min(6000, ojo.length() * f));
    cam.position.copy(objetivo).add(ojo.setLength(l));
  }
  const punteros = new Map(); let ini = null, pellizco = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function enPunto(px, py) {
    esferas.boundingSphere = null;                       // se recalcula: los nodos se mueven
    ndc.set(px / caja.clientWidth * 2 - 1, -(py / caja.clientHeight) * 2 + 1); rc.setFromCamera(ndc, cam);
    const h = rc.intersectObject(esferas, false).filter(x => x.instanceId !== undefined && visible(nodos[x.instanceId]));
    return h.length ? nodos[h[0].instanceId] : null;
  }
  cv.oncontextmenu = e => e.preventDefault();
  cv.onpointerdown = e => {
    cv.focus({ preventScroll: true }); cv.setPointerCapture(e.pointerId); despierta(); vuelo = null;
    punteros.set(e.pointerId, pos(e));
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pellizco = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; ini = null; return; }
    const [px, py] = pos(e); ini = { px, py, x: px, y: py, pan: e.button === 2 || e.shiftKey || e.button === 1, boton: e.button, movido: false };
    if (e.pointerType === 'touch') { const yo = ini; yo.largo = setTimeout(() => { if (ini === yo && !yo.movido && punteros.size === 1) { yo.hecho = true; aislar(enPunto(px, py)); } }, 550); }
  };
  cv.onpointermove = e => {
    const p = pos(e);
    if (punteros.has(e.pointerId)) punteros.set(e.pointerId, p);
    if (pellizco && punteros.size === 2) {
      const [a, b] = [...punteros.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      acercar(pellizco.d / (d || 1)); desplazar(c[0] - pellizco.c[0], c[1] - pellizco.c[1]); pellizco = { d, c }; despierta(); return;
    }
    if (!ini) { const h = enPunto(...p); if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; } return; }
    const dx = p[0] - ini.x, dy = p[1] - ini.y; ini.x = p[0]; ini.y = p[1];
    if (Math.hypot(p[0] - ini.px, p[1] - ini.py) > 4) ini.movido = true;
    if (ini.movido) { cv.style.cursor = 'grabbing'; ini.pan ? desplazar(dx, dy) : rotar(dx, dy); despierta(); }
  };
  cv.onpointerup = cv.onpointercancel = e => {
    punteros.delete(e.pointerId); if (punteros.size < 2) pellizco = null;
    if (ini) clearTimeout(ini.largo);
    if (ini && !ini.movido && !ini.hecho && e.type === 'pointerup') { const n = enPunto(ini.px, ini.py); ini.boton === 2 ? aislar(n) : alTocar(n); }
    ini = null; cv.style.cursor = hover ? 'pointer' : 'grab';
  };
  cv.onwheel = e => { e.preventDefault(); acercar(e.deltaY > 0 ? 1.12 : 1 / 1.12); despierta(); vuelo = null; };
  cv.addEventListener('keydown', e => { if (e.code === 'Escape' && aislado) aislar(null); });
  cv.onkeydown = e => { if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ShiftLeft|ShiftRight)$/.test(e.code)) { tecl.add(e.code); e.preventDefault(); despierta(); vuelo = null; } };
  cv.onkeyup = e => tecl.delete(e.code);
  cv.onblur = () => tecl.clear();
  function teclado(dt) {
    if (!tecl.size) return;
    const vel = (tecl.has('ShiftLeft') || tecl.has('ShiftRight') ? 900 : 300) * dt;
    const fr = new THREE.Vector3(); cam.getWorldDirection(fr);
    const der = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), arr = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
    const m = new THREE.Vector3();
    if (tecl.has('KeyW') || tecl.has('ArrowUp')) m.add(fr); if (tecl.has('KeyS') || tecl.has('ArrowDown')) m.sub(fr);
    if (tecl.has('KeyD') || tecl.has('ArrowRight')) m.add(der); if (tecl.has('KeyA') || tecl.has('ArrowLeft')) m.sub(der);
    if (tecl.has('KeyE')) m.add(arr); if (tecl.has('KeyQ')) m.sub(arr);
    if (!m.lengthSq()) return;
    m.setLength(vel); cam.position.add(m); objetivo.add(m);
  }
  const registroEl = document.createElement('div'); registroEl.className = 'mv-actividad'; caja.appendChild(registroEl);
  const porId = new Map(nodos.map(n => [n.id, n]));
  function actividad({ accion, entidades = [] } = {}) {
    const ns = entidades.map(id => porId.get(id)).filter(Boolean);
    const tu = porId.get('usuario');
    const fin = performance.now() + 12000;
    ns.forEach((n, k) => {
      n.activoHasta = fin;
      setTimeout(() => {                                      // escalonado: se ve el recorrido
        const l = aristas.find(a => (a.s === tu && a.t === n) || (a.t === tu && a.s === n));
        if (l && tu) disparar(l, tu, 0, true); else { n.rojo = 1.5; dispararDesde(n, 2, 1, null, true); }
      }, 80 + k * 90);
    });
    if (tu) tu.rojo = 1.2;
    const linea = document.createElement('div');
    linea.innerHTML = `<b>${accion === 'escribir' ? '✎ APOLO guardó' : '◉ APOLO leyó'}</b> ${ns.slice(0, 6).map(n => n.nombre).join(' · ') || '(recuerdos sin entidades)'}${ns.length > 6 ? ` +${ns.length - 6}` : ''}`;
    registroEl.prepend(linea);
    while (registroEl.children.length > 4) registroEl.lastChild.remove();
    setTimeout(() => linea.classList.add('fuera'), 9000); setTimeout(() => linea.remove(), 10500);
    alfa = Math.max(alfa, .2);
  }
  const chip = document.createElement('button'); chip.className = 'mv-aislado'; chip.hidden = true; caja.appendChild(chip);
  chip.onclick = () => aislar(null);
  function aislar(n) {
    if (n && n === aislado) n = null;
    aislado = n;
    chip.hidden = !n; if (n) chip.textContent = `◉ ${n.nombre} · ${vec.get(n.id)?.size || 0}  ✕`;
    if (n) {
      for (const id of vec.get(n.id) || []) { const o = nodos.find(x => x.id === id); if (o) { const d = new THREE.Vector3().randomDirection().multiplyScalar(70 + Math.random() * 60); Object.assign(o.p3, { x: n.p3.x + d.x, y: n.p3.y + d.y, z: n.p3.z + d.z, vx: 0, vy: 0, vz: 0 }); } }
      alfa = Math.max(alfa, .8); alTocar(n); n.flash = 1.4;
      setTimeout(() => { if (aislado === n) { dispararDesde(n, 10); volarA(new THREE.Vector3(n.p3.x, n.p3.y, n.p3.z), 320); } }, 350);
      setTimeout(() => { if (aislado === n) encuadrar(n.p3); }, 1900);
    } else { alfa = Math.max(alfa, .5); alTocar(null); setTimeout(encuadrar, 300); }
  }
  function volarA(p, dist) {
    const dir = new THREE.Vector3().copy(cam.position).sub(objetivo).normalize();
    vuelo = { t: 0, inicio: performance.now(), o0: objetivo.clone(), o1: p.clone(), c0: cam.position.clone(), c1: p.clone().add(dir.multiplyScalar(dist)) };
  }

  // ---------- bucle ----------
  let raf = 0, antes = performance.now(), vivo = true;
  function tamaño() {
    const w = caja.clientWidth, h = caja.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cam.aspect = w / h; cam.updateProjectionMatrix(); halos.material.uniforms.escala.value = impulsosMalla.material.uniforms.escala.value = h / 900 * (renderer.getPixelRatio());
  }
  const ro = new ResizeObserver(tamaño); ro.observe(caja); tamaño();
  function bucle(t) {
    if (!vivo) return;
    raf = requestAnimationFrame(bucle);
    const dt = Math.min(.05, (t - antes) / 1000); antes = t;
    if (alfa > .015) { simular(); if (nodos.length < 300) simular(); }
    teclado(dt);
    if (vuelo) {
      vuelo.t = Math.min(1, (t - vuelo.inicio) / 700); const s = vuelo.t * vuelo.t * (3 - 2 * vuelo.t);
      objetivo.lerpVectors(vuelo.o0, vuelo.o1, s); cam.position.lerpVectors(vuelo.c0, vuelo.c1, s); if (vuelo.t >= 1) vuelo = null;
    } else if (t - ultimoToque > 9000 && !sel) {        // en reposo gira despacio
      const ojo = v3.copy(cam.position).sub(objetivo).applyAxisAngle(cam.up, dt * .06); cam.position.copy(objetivo).add(ojo);
    }
    cam.lookAt(objetivo); cam.updateMatrixWorld();
    luz.position.copy(cam.position);
    for (const n of nodos) { if (n.flash) n.flash = n.flash > .01 ? n.flash * Math.exp(-dt * 3.5) : 0; if (n.rojo) n.rojo = n.rojo > .01 ? n.rojo * Math.exp(-dt * 1.2) : 0; }
    ahora = t;
    for (const id of solos) if (Math.random() < dt * .22) { const n = nodos.find(x => x.id === id); if (n) n.flash = 1.3; }   // se encienden solos de vez en cuando
    matEsfera.uniforms.tiempo.value = t / 1000;
    const dCam = cam.position.distanceTo(objetivo);
    lejos = Math.max(0, Math.min(1, (dCam - 600) / 1600));
    matEsfera.uniforms.lejos.value = lejos;
    const densidad = (oscuro ? 0.0011 : 0.0009) * Math.max(.2, Math.min(1, 650 / dCam));   // la niebla acompaña al zoom
    matEsfera.uniforms.niebla.value = densidad; escena.fog.density = densidad;
    halos.material.uniforms.fuerza.value = (oscuro ? .9 : .45) * (1 + lejos * .45);
    volcar(t); pulsar(dt); renderer.render(escena, cam); etiquetas();
  }
  raf = requestAnimationFrame(bucle);

  function encuadrar(centro) {
    const V = nodos.filter(visible); if (!V.length) return;
    const c = new THREE.Vector3(); if (centro) c.set(centro.x, centro.y, centro.z); else { for (const n of V) c.add(v3.set(n.p3.x, n.p3.y, n.p3.z)); c.divideScalar(V.length); }
    let r = 0; for (const n of V) r = Math.max(r, c.distanceTo(v3.set(n.p3.x, n.p3.y, n.p3.z)));
    volarA(c, Math.max(160, r * 2.5));
  }
  setTimeout(encuadrar, 1600);

  return {
    refrescar() { alfa = Math.max(alfa, .5); },
    seleccionar(n) { sel = n; vecSel = n ? vec.get(n.id) || new Set() : new Set(); if (n) { n.flash = 1.4; setTimeout(() => sel === n && dispararDesde(n, 8), 60); } if (n) for (const id of vecSel) { const o = nodos.find(x => x.id === id); if (o && !o.top && !o.colocado3) { const d = new THREE.Vector3().randomDirection().multiplyScalar(55); Object.assign(o.p3, { x: n.p3.x + d.x, y: n.p3.y + d.y, z: n.p3.z + d.z }); o.colocado3 = true; } } alfa = Math.max(alfa, .25); },
    enfocar(n) { if (n) volarA(new THREE.Vector3(n.p3.x, n.p3.y, n.p3.z), 200); },
    zoom(f) { acercar(1 / f); despierta(); },
    encuadrar,
    aislar, actividad,
    destruir() { chip.remove(); registroEl.remove(); vivo = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); hGeo.dispose(); lGeo.dispose(); iGeo.dispose(); geoEsfera.dispose(); matEsfera.dispose(); cv.remove(); capaEt.remove(); },
  };
}

window.Grafo3D = { crear };
window.dispatchEvent(new Event('grafo3d-listo'));
