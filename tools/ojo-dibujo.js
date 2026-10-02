// Ojo de escritorio (FASE 7.1) — dibujo de los OJOS del casco en la pantalla redonda GC9A01 (240x240).
// FUENTE DE VERDAD del dibujo: firmware/ojo-esp32/src/ojos.cpp es su traducción línea a línea (mismos nombres,
// mismas constantes). Si cambias algo aquí, cámbialo allí. Lo usa tools/simulador-ojo.html para validar sin hardware.
// Estados y gestos = los de app/robot.js (reposo, trabajando, permiso, listo, error, dormido;
// feliz, triste, duda, sorpresa, guino, corazon, remolino, bostezo, reloj).
// El "lienzo" imita la API de LovyanGFX (fillCircle, fillEllipse, fillArc, drawWideLine…): en el ESP32 es un LGFX_Sprite.
(function (raiz) {
  'use strict';
  const W = 240, C = 120;
  const F_PEQUE = 2, F_MEDIA = 4, F_GRANDE = 7;              // = fonts::Font2 (16 px), Font4 (26 px), Font7 (7 segmentos, 48 px)
  const ESTADOS = {
    reposo:     { hue: 145, eye: 1,    glow: .5,  happy: 0, x: 0, sleep: 0 },
    trabajando: { hue: 195, eye: .9,   glow: 1.3, happy: 0, x: 0, sleep: 0 },
    permiso:    { hue: 40,  eye: 1.15, glow: 1.1, happy: 0, x: 0, sleep: 0 },
    listo:      { hue: 125, eye: 1,    glow: 1,   happy: 1, x: 0, sleep: 0 },
    error:      { hue: 0,   eye: 1,    glow: 1.1, happy: 0, x: 1, sleep: 0 },
    dormido:    { hue: 220, eye: 1,    glow: .12, happy: 0, x: 0, sleep: 1 },
  };
  const GESTOS = ['feliz', 'triste', 'duda', 'sorpresa', 'guino', 'corazon', 'remolino', 'bostezo', 'reloj'];
  const PI = Math.PI;

  // ---------- color ----------
  function rgb565(r, g, b) { return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }
  function hsl565(h, s, l) {                                  // h 0..360, s y l 0..100 (como hsl() de CSS)
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgb565(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
  }
  function mezcla(r1, g1, b1, r2, g2, b2, t) { return rgb565(Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t)); }
  const FONDO = rgb565(5, 8, 11);

  // ---------- el ojo ----------
  function crearOjos(g, rnd = Math.random) {
    const st = {
      estado: 'reposo', msg: '', hue: 145, eye: 1, glow: .5, happy: 0, x: 0, sleep: 0,
      gesto: '', gIni: 0, gHasta: 0, react: 0, prev: 'reposo', prevMsg: '',
      blink: 0, blinkT: 2, lx: 0, ly: 0, tx: 0, ty: 0, mx: 0, my: 0, mirarHasta: 0, sacadaT: 0,
      codigo: '', escuchando: false, camara: false, conectado: true, ahora: 0,
    };
    const BRILLOS = Array.from({ length: 10 }, (_, i) => ({ a: i * 2.4 + .3, d: .35 + ((i * 37) % 10) / 18, s: .5 + ((i * 53) % 10) / 10, p: i * 1.7 }));
    const activo = n => st.gesto === n && st.ahora < st.gHasta;

    function ponerEstado(nombre, msg = '') {
      if (!ESTADOS[nombre]) return;
      if (st.react > 0) { st.prev = nombre; st.prevMsg = msg; return; }
      st.estado = nombre; st.msg = msg;
    }
    function flash(nombre, msg, secs) {                      // reacción temporal y vuelve al estado real
      if (!ESTADOS[nombre]) return;
      if (st.react <= 0) { st.prev = st.estado; st.prevMsg = st.msg; }
      st.estado = nombre; st.msg = msg; st.react = secs;
    }
    function gesto(nombre, secs = 3, msg) {
      st.gesto = nombre; st.gIni = st.ahora; st.gHasta = st.ahora + secs * 1000;
      const base = st.react > 0 ? st.prev : st.estado;
      if (msg !== undefined) flash(base === 'dormido' ? 'reposo' : base, msg, secs);
    }
    function mirar(x, y, secs = 3) { st.mx = Math.max(-1, Math.min(1, x)); st.my = Math.max(-1, Math.min(1, y)); st.mirarHasta = st.ahora + secs * 1000; }

    // avanza la animación dt segundos (ms = reloj en milisegundos)
    function paso(ms, dt) {
      st.ahora = ms;
      const obj = ESTADOS[st.estado];
      const kh = 1 - Math.pow(.0003, dt), k = 1 - Math.pow(.02, dt);
      st.hue += (obj.hue - st.hue) * kh;
      for (const p of ['eye', 'glow', 'happy', 'x', 'sleep']) st[p] += (obj[p] - st[p]) * k;
      if (st.react > 0) { st.react -= dt; if (st.react <= 0) { st.estado = st.prev; st.msg = st.prevMsg; } }
      st.blinkT -= dt; if (st.blinkT < 0) { st.blink = 1; st.blinkT = rnd() < .2 ? .28 : 2.5 + rnd() * 4; }
      st.blink = Math.max(0, st.blink - dt * 7);
      // mirada: lo que mande el PC > leyendo (trabajando) > mira a su alrededor (reposo)
      let rapido = false;
      if (ms < st.mirarHasta) { st.tx = st.mx; st.ty = st.my; rapido = true; }
      else if (st.estado === 'trabajando') { st.tx = -.6 + .3 * Math.sin(ms / 400); st.ty = -.3; }
      else if (st.estado === 'dormido' || st.estado === 'permiso') { st.tx = 0; st.ty = st.estado === 'permiso' ? .1 : 0; }
      else if (activo('duda')) { st.tx = .5; st.ty = -.4; }
      else {
        st.sacadaT -= dt;
        if (st.sacadaT < 0) {                                 // sacadas: salta a otro punto, a veces vuelve al centro
          st.sacadaT = 1.2 + rnd() * 3;
          if (rnd() < .45) { st.tx = 0; st.ty = 0; } else { st.tx = (rnd() * 2 - 1) * .8; st.ty = (rnd() * 2 - 1) * .45; }
        }
        rapido = true;
      }
      const kk = 1 - Math.pow(rapido ? .00005 : .004, dt);
      st.lx += (st.tx - st.lx) * kk; st.ly += (st.ty - st.ly) * kk;
    }

    function nivel(ms) {
      let lvl = st.glow;
      if (st.estado === 'permiso') lvl *= .45 + .55 * (.5 + .5 * Math.sin(ms / 140));
      return lvl;
    }

    function arcoFeliz(ex, ey, er, col) {                     // ^  (contento / guiño)
      const w = er * .2;
      g.fillArc(ex, ey + er * .35, er * .65 - w / 2, er * .65 + w / 2, 207, 333, col);
    }
    function corazon(x, y, s, col) {
      const r = s * .42;
      g.fillCircle(x - s * .4, y - s * .35, r, col); g.fillCircle(x + s * .4, y - s * .35, r, col);
      g.fillTriangle(x - s * .8, y - s * .2, x + s * .8, y - s * .2, x, y + s * .62, col);
    }
    function estrella(x, y, s, col) {                         // destello de 4 puntas
      const t = s * .22;
      g.fillTriangle(x - t, y, x + t, y, x, y - s, col); g.fillTriangle(x - t, y, x + t, y, x, y + s, col);
      g.fillTriangle(x, y - t, x, y + t, x - s, y, col); g.fillTriangle(x, y - t, x, y + t, x + s, y, col);
    }

    function ojo(ex, ey, er, sd, ms) {
      const hue = st.hue;
      if (activo('remolino')) {                               // mareado: espirales que giran (cada ojo en un sentido)
        const col = hsl565((hue + 280) % 360, 100, 72), giro = ms / 140 * sd;
        let px = ex, py = ey;
        for (let t = .3; t < PI * 6; t += .3) {
          const r = er * .95 * t / (PI * 6), x = ex + Math.cos(t + giro) * r, y = ey + Math.sin(t + giro) * r;
          g.drawWideLine(px, py, x, y, er * .065, col); px = x; py = y;
        }
        return;
      }
      if (activo('corazon')) { const lat = 1 + .12 * Math.sin(ms / 120); corazon(ex, ey, er * .9 * lat, hsl565(335, 100, 66)); return; }
      if ((activo('guino') && sd > 0) || activo('feliz')) { arcoFeliz(ex, ey, er, hsl565(hue, 100, 70)); return; }
      if (activo('bostezo')) {                                // ojos apretados, rayita dormilona
        const col = hsl565(hue, 90, 70), k = er * .5;
        let px = ex - k, py = ey;
        for (let i = 1; i <= 8; i++) {
          const t = i / 8, x = ex - k + 2 * k * t, y = ey + 2 * (1 - t) * t * k * .35;
          g.drawWideLine(px, py, x, y, er * .085, col); px = x; py = y;
        }
        return;
      }
      // un gesto con ojos propios manda sobre los ojos del estado (contento ^^, error X, dormido)
      const deGesto = activo('sorpresa') || activo('duda') || activo('triste') || activo('guino');
      let esc = 1;
      if (activo('sorpresa')) esc = 1.25;
      if (activo('duda') && sd < 0) esc = .8;                 // un ojo más pequeño que el otro: ¿eh?
      if (st.x > .5 && !deGesto) {                            // error: X
        const col = hsl565(0, 100, 60), k = er * .55;
        g.drawWideLine(ex - k, ey - k, ex + k, ey + k, er * .1, col); g.drawWideLine(ex + k, ey - k, ex - k, ey + k, er * .1, col);
        return;
      }
      if (st.happy > .5 && !deGesto) { arcoFeliz(ex, ey, er, hsl565(hue, 100, 70)); return; }
      if (st.sleep > .5 && !deGesto) {                        // dormido: ojos cerrados ︶ ︶
        const w = er * .14;
        g.fillArc(ex, ey - er * .15, er * .6 - w / 2, er * .6 + w / 2, 27, 153, hsl565(hue, 60, 52));
        return;
      }
      const lid = Math.max(.06, 1 - Math.sin(st.blink * PI));
      const rx = er * st.eye * esc, ry = rx * lid, ky = st.eye * esc * lid;
      g.fillEllipse(ex, ey, rx * 1.1, ry * 1.1 + 1, rgb565(150, 132, 160));     // aro del ojo
      // iris: degradado vertical (azul noche → verde agua → rosa) línea a línea
      const ox = st.lx * er * .18, oy = st.ly * er * .14;
      for (let yy = -Math.floor(ry); yy <= Math.floor(ry); yy++) {
        const half = rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)));
        const t = Math.max(0, Math.min(1, ((yy / Math.max(1, ry)) * er - oy + er) / (2 * er)));
        let col;
        if (t < .45) col = mezcla(7, 8, 26, 18, 24, 56, t / .45);
        else if (t < .72) col = mezcla(18, 24, 56, 70, 215, 190, (t - .45) / .27);
        else col = mezcla(70, 215, 190, 245, 125, 175, (t - .72) / .28);
        g.drawFastHLine(ex - half, ey + yy, half * 2, col);
      }
      g.fillEllipse(ex + ox * esc, ey + (oy - er * .05) * ky, er * .52 * esc * st.eye, er * .52 * ky, rgb565(3, 3, 12));   // pupila
      for (const b of BRILLOS) {                              // purpurina que titila dentro del iris
        const tw = .5 + .5 * Math.sin(ms / 300 * b.s + b.p);
        if (tw < .35) continue;
        g.fillCircle(ex + (ox + Math.cos(b.a) * b.d * er) * esc, ey + (oy + Math.sin(b.a) * b.d * er * .9) * ky, 1 + tw, mezcla(60, 40, 70, 255, 230, 245, tw));
      }
      const h2x = st.lx * er * .07, h2y = st.ly * er * .05;    // reflejos blancos
      g.fillEllipse(ex + (-er * .3 + h2x) * esc, ey + (-er * .38 + h2y) * ky, er * .27 * esc, er * .24 * ky, rgb565(245, 245, 245));
      g.fillCircle(ex + (er * .38 + h2x) * esc, ey + (er * .28 + h2y) * ky, Math.max(1, er * .09 * Math.min(esc, ky * 1.2)), rgb565(245, 245, 245));
      if (lid > .5) {
        const t1 = .6 + .4 * Math.sin(ms / 250 + sd), t2 = .6 + .4 * Math.sin(ms / 330 + sd * 2);
        estrella(ex + (-er * .4 + ox) * esc, ey + (-er * .05 + oy) * ky, er * .14 * t1, rgb565(215, 170, 255));
        estrella(ex + (er * .15 + ox) * esc, ey + (er * .45 + oy) * ky, er * .12 * t2, rgb565(255, 170, 230));
      }
      if (activo('triste')) {                                 // párpado caído en diagonal (más bajo hacia fuera)
        const yIn = sd > 0 ? -er * .55 : -er * .05, yOut = sd > 0 ? -er * .05 : -er * .55;   // y del lado izquierdo / derecho del ojo
        const x0 = ex - er * 1.3, x1 = ex + er * 1.3, y0 = ey - er * 1.3;
        g.fillTriangle(x0, y0, x1, y0, x1, ey + yOut, FONDO); g.fillTriangle(x0, y0, x1, ey + yOut, x0, ey + yIn, FONDO);
        g.drawWideLine(ex - er * 1.05, ey + (sd > 0 ? -er * .5 : -er * .1), ex + er * 1.05, ey + (sd > 0 ? -er * .1 : -er * .5), er * .05, hsl565(hue, 80, 65));
      }
    }

    function flotar(txt, n, x0, periodo, ms) {               // Z dormido, ? dudando: suben y se desvanecen
      for (let i = 0; i < n; i++) {
        const f = ((ms / periodo) + i / n) % 1, al = Math.sin(f * PI);
        const px = x0 + f * 34 + Math.sin(f * 6 + i) * 5, py = 78 - f * 52;
        g.drawString(txt, px, py, f < .3 ? F_PEQUE : F_MEDIA, hsl565(st.hue, 100, 8 + 70 * al));
      }
    }

    function aro(lvl) {                                       // aro de luz en el borde redondo (el "brillo" del casco); encima de todo
      g.fillArc(C, C, 113, 120, 0, 360, hsl565(st.hue, 100, 6 + 34 * Math.min(1.2, lvl)));
      if (st.camara) g.fillArc(C, C, 106, 113, 0, 360, rgb565(230, 30, 30));
    }

    function dibujar(ms) {
      const hue = st.hue, lvl = nivel(ms);
      g.fillScreen(FONDO);
      if (st.codigo) {                                        // emparejando: el código que hay que escribir en el panel
        g.drawString('EMPAREJAR', C, 62, F_MEDIA, hsl565(40, 100, 70));
        g.drawString(st.codigo, C, 118, F_GRANDE, hsl565(40, 100, 60 + 10 * Math.sin(ms / 300)));
        g.drawString('Escribelo en el panel', C, 168, F_PEQUE, hsl565(40, 60, 70));
        g.drawString('Ajustes > Dispositivos', C, 188, F_PEQUE, hsl565(40, 40, 55));
        aro(lvl); return;
      }
      if (activo('reloj')) {                                  // la hora en grande en vez de los ojos
        const d = new Date(Date.now()), p2 = n => String(n).padStart(2, '0');
        const sep = Math.floor(ms / 500) % 2 ? ':' : ' ';
        g.drawString(`${p2(d.getHours())}${sep}${p2(d.getMinutes())}`, C, 108, F_GRANDE, hsl565(hue, 100, 70));
        const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
        g.drawString(`${DIAS[d.getDay()]} ${d.getDate()}`, C, 150, F_PEQUE, hsl565(hue, 100, 60));
      } else {
        const bx = st.lx * 10, by = st.ly * 8;               // la mirada también desplaza un poco los ojos (no hay cuello)
        for (const sd of [-1, 1]) ojo(C + sd * 54 + bx, 114 + by, 38, sd, ms);
      }
      if (st.sleep > .5 && ms >= st.gHasta) flotar('Z', 3, 150, 2600, ms);
      if (activo('duda')) flotar('?', 2, 160, 1400, ms);
      if (st.msg && (st.estado !== 'permiso' || Math.floor(ms / 450) % 2)) {
        const tw = g.textWidth(st.msg, F_PEQUE) + 14;
        g.fillRoundRect(C - tw / 2, 170, tw, 24, 6, rgb565(0, 0, 0));
        g.drawRoundRect(C - tw / 2, 170, tw, 24, 6, hsl565(hue, 100, 60));
        g.drawString(st.msg, C, 182, F_PEQUE, hsl565(hue, 100, 72));
      }
      aro(lvl);
      if (st.escuchando) {                                    // push-to-talk: punto rojo arriba
        g.fillCircle(C, 30, 7 + 2 * Math.sin(ms / 120), rgb565(240, 40, 40));
        g.drawString('TE ESCUCHO', C, 50, F_PEQUE, rgb565(240, 90, 90));
      } else if (st.camara) g.drawString('CAMARA', C, 34, F_PEQUE, rgb565(240, 60, 60));
      else if (!st.conectado) g.drawString('SIN CONEXION', C, 34, F_PEQUE, rgb565(120, 120, 130));
    }

    return { st, ponerEstado, flash, gesto, mirar, paso, dibujar, activo };
  }

  // lienzo para <canvas> con la misma API que el sprite de LovyanGFX que usa el firmware (colores RGB565)
  function lienzoCanvas(ctx) {
    const css = c => `rgb(${((c >> 11) & 31) * 255 / 31 | 0},${((c >> 5) & 63) * 255 / 63 | 0},${(c & 31) * 255 / 31 | 0})`;
    const FUENTE = { [F_PEQUE]: 'bold 14px Consolas, monospace', [F_MEDIA]: 'bold 24px Consolas, monospace', [F_GRANDE]: 'bold 50px "Courier New", monospace' };
    return {
      fillScreen(c) { ctx.fillStyle = css(c); ctx.fillRect(0, 0, W, W); },
      fillCircle(x, y, r, c) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.arc(x, y, Math.max(.5, r), 0, 2 * PI); ctx.fill(); },
      fillEllipse(x, y, rx, ry, c) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), 0, 0, 2 * PI); ctx.fill(); },
      fillArc(x, y, r0, r1, a0, a1, c) {                      // ángulos en grados, 0 = derecha, sentido horario (como LovyanGFX)
        ctx.fillStyle = css(c); ctx.beginPath();
        ctx.arc(x, y, r1, a0 * PI / 180, a1 * PI / 180); ctx.arc(x, y, Math.max(0, r0), a1 * PI / 180, a0 * PI / 180, true); ctx.closePath(); ctx.fill();
      },
      drawWideLine(x0, y0, x1, y1, r, c) { ctx.strokeStyle = css(c); ctx.lineWidth = r * 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); },
      fillTriangle(x0, y0, x1, y1, x2, y2, c) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill(); },
      drawFastHLine(x, y, w, c) { ctx.fillStyle = css(c); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1); },
      fillRoundRect(x, y, w, h, r, c) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); },
      drawRoundRect(x, y, w, h, r, c) { ctx.strokeStyle = css(c); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x + .5, y + .5, w - 1, h - 1, r); ctx.stroke(); },
      drawString(t, x, y, f, c) { ctx.font = FUENTE[f]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = css(c); ctx.fillText(t, x, y); },
      textWidth(t, f) { ctx.font = FUENTE[f]; return ctx.measureText(t).width; },
    };
  }

  const API = { crearOjos, lienzoCanvas, ESTADOS, GESTOS, hsl565, rgb565, W };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.OjoDibujo = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
