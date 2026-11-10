// Motor de las arañas de APOLO (dibujo + comportamiento). FUENTE ÚNICA: extension/arana-motor.js;
// app/arana-motor.js es una copia exacta (la isla la importa). Se usa en la isla, en la página (extensión) y en la ventana de arañas de APOLO.
// Define globalThis.AranaMotor = { crear, mover, dibujar }.
(() => {
  if (globalThis.AranaMotor) return;
  // patas: [ángulo de salida respecto al frente, alcance]; 4 por lado, de delante a atrás
  const PATAS = [[0.5, 1.25], [1.15, 1.05], [1.95, 1.0], [2.55, 1.2]];
  const preferencia = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducida = a => a.reducido ?? preferencia?.matches ?? false;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function crear(tipo, color, x, y, opts = {}) {
    const a = { tipo, color, x, y, ang: opts.ang ?? Math.PI / 2, r: opts.r || 9, vel: opts.vel || 600, ruta: [], alpha: 0, fuera: false,
      semilla: Math.random() * 100, tiempo: 0, ciclo: 0, velocidad: 0, colgada: false, reducido: opts.reducido, sinPausas: !!opts.sinPausas, pausa: 0, proxPausa: rnd(1.5, 4), alzar: 0, temblor: 0, patas: [], hilo: null, marcas: [], hechos: 0, total: 1 };
    for (let k = 0; k < 8; k++) {
      const [px, py] = reposo(a, k);
      a.patas.push({ px, py, t: 1, sx: px, sy: py, tx: px, ty: py });
    }
    return a;
  }
  function reposo(a, k) {
    const lado = k < 4 ? -1 : 1, [ang, alc] = PATAS[k % 4], R = a.r * alc * 2.7;
    const t = a.ang + lado * ang;
    return [a.x + Math.cos(t) * R, a.y + Math.sin(t) * R];
  }
  // movimiento: corre a tirones, frena en seco, se queda quieta temblando y a veces levanta las patas delanteras (amenaza)
  function mover(a, dt) {
    dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    a.tiempo += dt;
    const suave = reducida(a), xAnterior = a.x, yAnterior = a.y;
    a.alpha = Math.max(0, Math.min(1, a.alpha + dt * (a.fuera ? -1.6 : 2.5)));
    const t = a.tiempo + a.semilla;
    const o = a.ruta[0];
    let andando = false;
    if (a.pausa > 0) { a.pausa -= dt; a.alzar = Math.min(1, a.alzar + dt * 5); }
    else {
      a.alzar = Math.max(0, a.alzar - dt * 4);
      if (o && o.espera > 0) o.espera -= dt;
      else if (o) {
        a.proxPausa -= dt;
        if (a.proxPausa <= 0 && !o.colgada && !a.fuera && !a.sinPausas && !suave) {
          a.pausa = a.animo === 'agresiva' ? rnd(.5, 1.3) : rnd(.25, .9); a.proxPausa = a.animo === 'agresiva' ? rnd(.4, 1.2) : rnd(1.6, 4.5); a.temblor = 1;
        }
        const tirones = suave || o.colgada || o.uniforme ? 1 : .45 + 1.05 * Math.pow(Math.max(0, Math.sin(t * 6.3)), .5) + .25 * Math.sin(t * 17);
        const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy), paso = (o.vel || a.vel) * tirones * dt;
        if (d > .5) {
          const obj = Math.atan2(dy, dx) + (suave || o.colgada ? 0 : Math.sin(t * 3.1) * .12 * Math.min(1, d / 80));   // zigzag nervioso
          a.ang += (((obj - a.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - Math.exp(-dt * 12));
        }
        if (o.r) a.r += (o.r - a.r) * (1 - Math.exp(-dt * 5));
        if (d <= paso) { a.x = o.x; a.y = o.y; if (o.r) a.r = o.r; a.ruta.shift(); o.al && o.al(a); }
        else { a.x += dx / d * paso; a.y += dy / d * paso; andando = !o.colgada; }
      } else if (a.vagar && !a.fuera && Math.random() < dt * .7) a.ruta.push({ x: a.vagar.x + rnd(-120, 120), y: a.vagar.y + rnd(-70, 70) });
    }
    a.temblor = Math.max(0, a.temblor - dt * 2);
    if (a.animo === 'agresiva' && a.pausa > 0) a.temblor = Math.max(a.temblor, .7);   // furiosa: no para de temblar
    const distancia = Math.hypot(a.x - xAnterior, a.y - yAnterior);
    a.velocidad += ((dt > 0 ? distancia / dt : 0) - a.velocidad) * (1 - Math.exp(-dt * 12));
    a.ciclo += distancia / Math.max(1, a.r * 2.4);
    a.salto = !suave && a.animo === 'contenta' ? Math.abs(Math.sin(t * 7)) * .5 : 0;
    const colgada = !!(a.hilo && (o?.colgada || a.ruta[0]?.colgada)); a.colgada = colgada;
    const grupo = Math.floor(a.ciclo) % 2;
    a.patas.forEach((p, k) => {
      let [rx, ry] = reposo(a, k);
      if (colgada || suave) {
        const ritmo = suave ? 0 : Math.sin(t * 7 + k * Math.PI / 2) * a.r * .24;
        rx += Math.cos(a.ang) * ritmo; ry += Math.sin(a.ang) * ritmo;
        const ajuste = 1 - Math.exp(-dt * 16);
        p.px += (rx - p.px) * ajuste; p.py += (ry - p.py) * ajuste; p.t = 1; return;
      }
      if (p.t >= 1 && (andando || Math.hypot(rx - p.px, ry - p.py) > a.r * 2) && (k + (k < 4 ? 0 : 1)) % 2 === grupo && Math.hypot(rx - p.px, ry - p.py) > a.r * 1.1) {
        p.sx = p.px; p.sy = p.py; p.tx = rx + Math.cos(a.ang) * a.r * .7; p.ty = ry + Math.sin(a.ang) * a.r * .7; p.t = 0;
      }
      if (p.t < 1) { p.t = Math.min(1, p.t + dt * Math.min(24, 8 + a.velocidad / Math.max(1, a.r * 7))); const e = p.t * p.t * (3 - 2 * p.t); p.px = p.sx + (p.tx - p.sx) * e; p.py = p.sy + (p.ty - p.sy) * e; }
      if (Math.hypot(rx - p.px, ry - p.py) > a.r * 4) { p.px = rx; p.py = ry; p.t = 1; }
    });
  }

  function dibujar(c, a, ox = 0, oy = 0, opts = {}) {
    const suave = reducida(a), now = a.tiempo + a.semilla;
    const balanceo = a.colgada && !suave ? Math.sin(now * 3.2) * a.r * .2 : 0;
    const x = a.x - ox + balanceo, y = a.y - oy - (a.salto || 0) * a.r * .9, r = a.r;
    const furia = a.animo === 'agresiva', feliz = a.animo === 'contenta';
    if (a.alpha <= 0 || x < -80 || y < -80 || x > (opts.W || 1e5) + 80 || y > (opts.H || 1e5) + 80) return;
    const tiembla = !suave && a.temblor > 0 ? Math.sin(now * 29) * a.temblor * .65 : 0;
    c.save(); c.globalAlpha = Math.max(0, Math.min(1, a.alpha)); c.lineCap = 'round'; c.lineJoin = 'round';
    if (a.hilo) { c.strokeStyle = a.color; c.globalAlpha *= .55; c.lineWidth = .8; c.beginPath(); c.moveTo(a.hilo.x - ox, a.hilo.y - oy); c.quadraticCurveTo((a.hilo.x - ox + x) / 2 + balanceo * .6, (a.hilo.y - oy + y) / 2, x, y - r * .3); c.stroke(); c.globalAlpha = Math.max(0, a.alpha); }
    // sombra
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(x - Math.cos(a.ang) * r * .5 + r * .15, y - Math.sin(a.ang) * r * .5 + r * .3, r * 1.5, r * .9, a.ang, 0, Math.PI * 2); c.fill();
    // patas: coxa → rodilla alta → tibia → punta; las delanteras se alzan al amenazar
    for (let k = 0; k < 8; k++) {
      const p = a.patas[k], lado = k < 4 ? -1 : 1, i = k % 4, [ang] = PATAS[i];
      const bx = x + Math.cos(a.ang + lado * ang) * r * .42 + tiembla, by = y + Math.sin(a.ang + lado * ang) * r * .42;
      let tx = p.px - ox, ty = p.py - oy;
      if (!suave && i === 0 && a.alzar > 0) { const al = a.alzar * (1 + .15 * Math.sin(now * 14)); tx += Math.cos(a.ang) * r * 1.4 * al; ty += Math.sin(a.ang) * r * 1.4 * al - r * 1.2 * al; }
      const lift = p.t < 1 ? Math.sin(p.t * Math.PI) * r * .45 : 0;
      const nx = Math.cos(a.ang + lado * Math.PI / 2), ny = Math.sin(a.ang + lado * Math.PI / 2);
      // rodillas dobladas hacia FUERA del cuerpo (vista desde arriba) y un poco hacia arriba al pisar
      const lx = tx - bx, ly = ty - by, L = Math.hypot(lx, ly) || 1, px = -ly / L * lado * -1, py = lx / L * lado * -1;
      const sx = (px * nx + py * ny) < 0 ? -1 : 1;                     // perpendicular del lado de fuera
      const k1x = bx + lx * .4 + px * sx * r * .9, k1y = by + ly * .4 + py * sx * r * .9 - lift;
      const k2x = bx + lx * .75 + px * sx * r * .35, k2y = by + ly * .75 + py * sx * r * .35 - lift * .6;
      for (const capa of [0, 1]) {
        c.strokeStyle = capa ? a.color : 'rgba(0,0,0,.85)'; c.shadowColor = a.color; c.shadowBlur = capa && r >= 9 ? 3 : 0;
        c.lineWidth = capa ? Math.max(1, r * .16) : Math.max(2.4, r * .34);
        c.beginPath(); c.moveTo(bx, by); c.lineTo(k1x, k1y); c.stroke();
        c.lineWidth = capa ? Math.max(.8, r * .1) : Math.max(1.8, r * .24);
        c.beginPath(); c.moveTo(k1x, k1y); c.lineTo(k2x, k2y); c.lineTo(tx, ty - lift * .2); c.stroke();
      }
      c.shadowBlur = 0; c.strokeStyle = a.color; c.lineWidth = .6; c.globalAlpha = Math.max(0, a.alpha) * .6;   // pelos
      for (let h = 1; h <= 3; h++) { const fx = bx + (k1x - bx) * h / 4, fy = by + (k1y - by) * h / 4; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + nx * r * .22, fy + ny * r * .22 - r * .12); c.stroke(); }
      c.globalAlpha = Math.max(0, a.alpha);
    }
    c.translate(x + tiembla, y); c.rotate(a.ang);
    // abdomen negro con borde neón y marca en forma de reloj de arena
    const resp = 1 + (suave ? 0 : .035 * Math.sin(now * 3));
    c.fillStyle = '#05040a'; c.strokeStyle = a.color; c.shadowColor = furia ? '#ff1f3d' : a.color; c.shadowBlur = furia && !suave ? 12 + 3 * Math.sin(now * 4) : 8; c.lineWidth = Math.max(1, r * .12);
    c.beginPath(); c.ellipse(-r * 1.25, 0, r * 1.15 * resp, r * .85 * resp, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.shadowBlur = 0; c.fillStyle = a.color; c.globalAlpha = Math.max(0, a.alpha) * (suave ? .7 : .65 + .15 * Math.sin(now * 3));
    c.beginPath(); c.moveTo(-r * 1.75, -r * .32); c.lineTo(-r * .85, -r * .32); c.lineTo(-r * 1.3, 0); c.lineTo(-r * .85, r * .32); c.lineTo(-r * 1.75, r * .32); c.lineTo(-r * 1.3, 0); c.closePath(); c.fill();
    c.globalAlpha = Math.max(0, a.alpha);
    // cefalotórax
    c.fillStyle = '#07060d'; c.shadowColor = a.color; c.shadowBlur = 8;
    c.beginPath(); c.ellipse(r * .1, 0, r * .62, r * .52, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    // colmillos (quelíceros) que se abren y cierran
    const mord = .25 + (suave ? 0 : (furia ? .45 : .25) * Math.max(0, Math.sin(now * (furia ? 10 : 5))));
    c.shadowBlur = 0; c.lineWidth = Math.max(1, r * .12);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(r * .62, s * r * .16); c.quadraticCurveTo(r * 1.05, s * r * (.3 + mord), r * .95, s * r * (.05 + mord * .2)); c.stroke(); }
    // 8 ojos rojos (2 grandes + 6 pequeños) que brillan y parpadean
    const parpadeo = !suave && ((now * .7) % 5) < .08 ? .1 : 1;
    const ojo = furia ? 1.45 : 1;
    c.fillStyle = feliz ? '#ffe36b' : '#ff1f3d'; c.shadowColor = c.fillStyle; c.shadowBlur = furia ? 14 : 8;
    for (const [ex, ey, er] of [[.42, -.14, .13], [.42, .14, .13], [.3, -.3, .07], [.3, .3, .07], [.22, -.08, .06], [.22, .08, .06], [.14, -.22, .05], [.14, .22, .05]]) {
      if (feliz && er > .1) {                                   // ojos grandes felices: ^ ^
        c.strokeStyle = '#ffe36b'; c.lineWidth = Math.max(1, r * .08); c.beginPath(); c.arc(r * ex, r * ey, r * er, Math.PI * .15, Math.PI * .85, true); c.stroke(); continue;
      }
      c.beginPath(); c.ellipse(r * ex, r * ey, r * er * ojo, r * er * ojo * parpadeo, 0, 0, Math.PI * 2); c.fill();
    }
    // haz de escaneo (rojo-color) cuando trabaja
    if (opts.haz || a.haz) {
      c.shadowBlur = 0; const g = c.createLinearGradient(r * .6, 0, r * 4.5, 0);
      g.addColorStop(0, a.color + 'aa'); g.addColorStop(1, a.color + '00'); c.fillStyle = g;
      c.globalAlpha = Math.max(0, a.alpha) * (suave ? .45 : .45 + .12 * Math.sin(now * 3));
      c.beginPath(); c.moveTo(r * .6, 0); c.lineTo(r * 4.5, -r * 1.3); c.lineTo(r * 4.5, r * 1.3); c.closePath(); c.fill();
    }
    c.restore();
  }
  globalThis.AranaMotor = { crear, mover, dibujar, reposo };
})();
