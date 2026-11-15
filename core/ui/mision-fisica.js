// Mission Control → física del mundo: todo se mueve. Cada objeto es un cuerpo con masa, rozamiento y rebote; los personajes
// empujan lo ligero al andar; con el ratón se agarra cualquier cosa (objeto o personaje), se levanta, se arrastra y se lanza.
// Los objetos chocan entre sí y con las paredes, caen y botan levantando polvo, se tambalean y se ponen de pie solos;
// lo que cae en lava se hunde y reaparece en su sitio. Las posiciones se recuerdan por mundo (localStorage, solo este equipo);
// el botón ⟲ ORDENAR los devuelve a su sitio. Es solo visual: el trabajo real de los agentes no se toca.
// Se engancha a MC_MUNDO (mision-mundo.js): fisicaIniciar/fisicaPaso/fisicaDibujar/fisicaAbajo/fisicaPersonaje/fisicaOrdenar.

const MF_CERO = { dx: 0, dy: 0, z: 0, ang: 0 };
// masa (≈ kg de juguete). > MF_PESADO: los personajes no lo mueven andando (con el ratón, sí)
const MF_MASA = { planta: 3, barril: 6, caja: 4, cofre: 8, calaveras: 2, vela: 1, holo: 4, brasero: 8, caldero: 10, lampara: 1, antorcha: 1, cuadro: 2, codice: 2,
  cables: 2, maniqui: 6, caballete: 4, telescopio: 6, banco: 10, sofa: 14, mesa: 12, consola: 16, pc: 12, carro: 12, yunque: 40, engranajes: 20, tornillo: 30,
  impresora: 40, rack: 50, estanteria: 30, tanque: 30, vaina: 25, jaula: 25, alambique: 14, ornitoptero: 20, brazo: 25, orbe: 60, portal: 80, vitrina: 40,
  'altar-holo': 80, tuberias: 10, tentaculos: 10 };
const MF_PESADO = 20, MF_G = 1400, MF_PJ_MASA = 8;
const MF_SUELTOS = new Set(['animal', 'nenufar']);                 // sin bloquear el paso pero sueltos (no van pegados a la pared)
const MF_ANIMAL = { gato: [3, 42], perro: [5, 60], pajaro: [1, 30], conejo: [2, 48], lemur: [2, 55], bisonte: [60, 16], pez: [1, 26], tortuga: [4, 7] };   // [masa, velocidad]
const mfOX = o => o.x * MM_R + (o.f ? o.f.dx : 0);                 // esquina del objeto ya movido (para luces, partículas, rayos)
const mfOY = o => o.y * MM_R + (o.f ? o.f.dy : 0);

Object.assign(MC_MUNDO, {
  // ---------- cuerpos ----------
  fisicaIniciar() {
    const R = MM_R, guard = this.fisicaLeer();
    this.cuerpos = [];
    this.m.objetos.forEach((o, i) => {
      const d = MM_OBJ[o.tipo]; if (!d) return;
      const w = d.w * R, h = d.h * R, fw = Math.max(16, w * .8), fh = Math.max(12, Math.min(h * .55, h - 6));
      // footprint (caja en el suelo) relativa a la esquina del objeto: la parte de abajo del dibujo
      const an = o.tipo === 'animal' ? MF_ANIMAL[o.especie] || MF_ANIMAL.gato : null;
      const f = o.f = { dx: 0, dy: 0, z: 0, ang: 0, vx: 0, vy: 0, vz: 0, va: 0, i, masa: an ? an[0] : MF_MASA[o.tipo] || (o.tipo === 'nenufar' ? 1 : 10),
        fx: (w - fw) / 2, fy: h - fh - 2, fw, fh, pared: !d.bloq && !MF_SUELTOS.has(o.tipo), libre: MF_SUELTOS.has(o.tipo), hundido: 0, quieto: true, vel: an ? an[1] : 0, ia: Math.random() * 2000 };
      if (an && o.especie === 'bisonte') { f.fw = 52; f.fh = 18; f.fx = -10; f.fy = h - 20; }
      const g = guard?.[i]; if (g && o.tipo === g[3]) { f.dx = g[0]; f.dy = g[1]; f.libre = !!g[2]; }
      this.cuerpos.push(o);
    });
    this.fisSucio = true; this.fisicaRejilla();
  },
  fisicaLeer() { try { return JSON.parse(localStorage.getItem('rc.mm.fis.' + (this.m?.nombre || '')) || 'null'); } catch { return null; } },
  fisicaGuardar() {
    try {
      const k = 'rc.mm.fis.' + (this.m?.nombre || ''), v = {};
      for (const o of this.cuerpos || []) { const f = o.f; if (Math.abs(f.dx) > .5 || Math.abs(f.dy) > .5 || f.libre) v[f.i] = [Math.round(f.dx), Math.round(f.dy), f.libre ? 1 : 0, o.tipo]; }
      if (Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k);
    } catch { }
  },
  fisicaOrdenar() {
    for (const o of this.cuerpos || []) { const f = o.f; f.volver = true; f.vx = f.vy = 0; f.quieto = false; }
    try { localStorage.removeItem('rc.mm.fis.' + (this.m?.nombre || '')); } catch { }
  },
  // caja del suelo de un objeto en coordenadas del mapa
  fisCaja(o) { const f = o.f, X = o.x * MM_R + f.dx + f.fx, Y = o.y * MM_R + f.dy + f.fy; return { x: X, y: Y, w: f.fw, h: f.fh }; },
  fisLibreEn(x, y) { const R = MM_R, A = this.m.ancho, gx = Math.floor(x / R), gy = Math.floor(y / R); return gx >= 0 && gy >= 0 && gx < A && gy < this.m.alto && this.g[gy * A + gx] === 1; },
  fisCabe(b) { return this.fisLibreEn(b.x + 1, b.y + 1) && this.fisLibreEn(b.x + b.w - 1, b.y + 1) && this.fisLibreEn(b.x + 1, b.y + b.h - 1) && this.fisLibreEn(b.x + b.w - 1, b.y + b.h - 1); },
  fisEnLava(b) { return this.fisSuelo(b.x + b.w / 2, b.y + b.h / 2) === 'lava'; },
  fisEnAgua(b) { return this.fisSuelo(b.x + b.w / 2, b.y + b.h / 2) === 'agua'; },
  fisSuelo(x, y) { const R = MM_R, A = this.m.ancho, gx = Math.floor(x / R), gy = Math.floor(y / R); return gx >= 0 && gy >= 0 && gx < A && gy < this.m.alto && this.g[gy * A + gx] === 1 ? this.suelo[gy * A + gx] : null; },
  // la orilla más cercana (suelo que se pisa) a un punto: para lo que cae al agua
  fisOrilla(x, y) {
    const R = MM_R, A = this.m.ancho, cx = Math.floor(x / R), cy = Math.floor(y / R);
    for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const gx = cx + dx, gy = cy + dy, i = gy * A + gx;
      if (gx >= 0 && gy >= 0 && gx < A && gy < this.m.alto && this.g[i] === 1 && !this.bloq[i]) return { x: gx * R + R / 2, y: gy * R + R * .8 };
    }
    const q = this.puntoLibre(); return { x: q.x * R + R / 2, y: q.y * R + R * .8 };
  },
  fisSalpicar(x, y, n = 10) { if (!this.parts || this.parts.length > 520) return; for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - .5) * 14, y, vx: (Math.random() - .5) * 70, vy: -30 - Math.random() * 50, vida: 0, max: 500 + Math.random() * 300, tam: 2, col: '190,230,255', tipo: 'chispa' }); },
  // casillas bloqueadas para los caminos: según dónde están ahora los objetos (y la lava)
  fisicaRejilla() {
    const A = this.m.ancho, R = MM_R, bl = new Uint8Array(this.g.length);
    for (let i = 0; i < bl.length; i++) if (this.g[i] === 1 && (this.suelo[i] === 'lava' || this.suelo[i] === 'agua')) bl[i] = 1;
    for (const o of this.cuerpos) {
      if (o.f.pared && !o.f.libre) continue; if (o.f.hundido) continue;
      const b = this.fisCaja(o), x0 = Math.floor((b.x + 4) / R), x1 = Math.floor((b.x + b.w - 4) / R), y0 = Math.floor((b.y + 4) / R), y1 = Math.floor((b.y + b.h - 4) / R);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < A && y < this.m.alto) bl[y * A + x] = 1;
    }
    this.bloq = bl; this.fisSucio = false;
  },
  // ---------- paso de simulación ----------
  fisicaPaso(dt, t) {
    if (!this.cuerpos) return;
    const s = Math.min(dt, 50) / 1000, R = MM_R;
    let alguno = false;
    // los personajes que andan empujan lo ligero
    for (const p of this.ents.values()) {
      if (p.sale || p.agarrado || (p.z || 0) > 4) continue;
      const pvx = (p.x - (p.px ?? p.x)) / Math.max(s, 1e-3), pvy = (p.y - (p.py ?? p.y)) / Math.max(s, 1e-3); p.px = p.x; p.py = p.y;
      for (const o of this.cuerpos) {
        const f = o.f; if (f.masa > MF_PESADO || (f.pared && !f.libre) || f.hundido || f.z > 6) continue;
        const b = this.fisCaja(o), cx = Math.max(b.x, Math.min(p.x, b.x + b.w)), cy = Math.max(b.y, Math.min(p.y, b.y + b.h)), dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
        if (d > 7) continue;
        const nx = d > .01 ? -dx / d : (pvx || 1) / (Math.hypot(pvx, pvy) || 1), ny = d > .01 ? -dy / d : pvy / (Math.hypot(pvx, pvy) || 1), k = MF_PJ_MASA / (MF_PJ_MASA + f.masa);
        const vn = pvx * nx + pvy * ny; if (vn <= 0 && d > .01) continue;
        f.vx += nx * Math.max(vn, 30) * k * 1.6; f.vy += ny * Math.max(vn, 30) * k * 1.6; f.va += (Math.random() - .5) * 2 * k; f.quieto = false; f.libre = true;
      }
    }
    for (const o of this.cuerpos) {
      const f = o.f;
      if (f.hundido) { f.hundido += dt; if (f.hundido > 2600) { Object.assign(f, { dx: 0, dy: 0, z: 0, vx: 0, vy: 0, vz: 0, ang: 0, va: 0, hundido: 0, libre: false, nace: t }); this.fisSucio = true; } continue; }
      if (f === this.agarre?.f) { this.fisArrastrar(o, s); alguno = true; continue; }
      if (o.tipo === 'animal' && !f.volver) this.fisAnimal(o, f, dt, s);
      if (f.volver) {                                                   // ⟲ ORDENAR: muelle hasta casa
        f.dx += -f.dx * Math.min(1, s * 6); f.dy += -f.dy * Math.min(1, s * 6); f.z += -f.z * Math.min(1, s * 6); f.ang *= Math.exp(-s * 8);
        if (Math.abs(f.dx) + Math.abs(f.dy) + f.z < .6) { f.dx = f.dy = f.z = f.ang = 0; f.volver = false; f.libre = false; f.quieto = true; this.fisSucio = true; }
        alguno = true; continue;
      }
      if (f.quieto && !f.z && !f.vz) continue;
      alguno = true;
      // altura: gravedad y botes
      if (f.z > 0 || f.vz) {
        f.vz -= MF_G * s; f.z += f.vz * s;
        if (f.z <= 0) {
          f.z = 0;
          if (f.vz < -160) { this.fisPolvo(o, Math.min(14, -f.vz / 40)); if (f.masa >= MF_PESADO) this.temblor = Math.max(this.temblor || 0, Math.min(6, f.masa / 12)); f.vz = -f.vz * (f.masa > 30 ? .18 : .38); f.va += (Math.random() - .5) * f.vz * .01; }
          else f.vz = 0;
        }
      }
      // rozamiento: en el suelo frena mucho, en el aire casi nada
      if (f.flota) { f.vx += Math.sin(t / 2300 + f.i) * 10 * s; f.vy += Math.cos(t / 3100 + f.i * 2) * 6 * s; f.quieto = false; }   // la corriente lo lleva despacio
      const roz = f.z > 0 ? .4 : f.flota ? 1.3 : 5 + f.masa * .05; f.vx *= Math.exp(-roz * s); f.vy *= Math.exp(-roz * s);
      // movimiento por ejes contra las paredes
      for (const eje of ['x', 'y']) {
        const v = eje === 'x' ? f.vx : f.vy; if (!v) continue;
        const ant = f['d' + eje], cabia = this.fisCabe(this.fisCaja(o)); f['d' + eje] += v * s;
        if (cabia && !this.fisCabe(this.fisCaja(o))) { f['d' + eje] = ant; if (eje === 'x') f.vx = -f.vx * .35; else f.vy = -f.vy * .35; f.va += v * .004; if (Math.abs(v) > 220) this.fisPolvo(o, 4); }
      }
      // tambaleo: el ángulo se va a 0 como un muelle
      f.va += (-f.ang * 60 - f.va * 7) * s; f.ang += f.va * s; f.ang = Math.max(-1.2, Math.min(1.2, f.ang));
      if (Math.hypot(f.vx, f.vy) > 4) this.fisSucio = true;
      if (!f.z && !f.vz && !f.flota && o.tipo !== 'animal' && Math.hypot(f.vx, f.vy) < 3 && Math.abs(f.ang) < .01 && Math.abs(f.va) < .05) { f.vx = f.vy = f.va = f.ang = 0; f.quieto = true; this.fisGuardarPronto = true; }
      if (!f.z) {                                                       // agua: lo ligero flota (y lo arrastra la corriente); lo pesado se hunde
        const b = this.fisCaja(o), agua = this.fisEnAgua(b);
        if (agua && !f.flota) { this.fisSalpicar(b.x + b.w / 2, b.y + b.h / 2, f.masa > 10 ? 16 : 8); if (f.masa > 30 && o.especie !== 'bisonte') { f.hundido = 1; f.vx = f.vy = 0; this.fisSucio = true; continue; } f.flota = true; }
        else if (!agua && f.flota) f.flota = false;
      }
      if (!f.z && this.fisEnLava(this.fisCaja(o))) { f.hundido = 1; f.vx = f.vy = 0; this.fisSucio = true; this.fisPolvo(o, 10, '255,140,40', 'brasa'); }
    }
    this.fisChoques();
    if (this.fisSucio && t - (this.tRejilla || 0) > 350) { this.tRejilla = t; this.fisicaRejilla(); }
    if (this.fisGuardarPronto && !alguno) { this.fisGuardarPronto = false; this.fisicaGuardar(); }
    if (this.temblor) { this.temblor = this.temblor < .2 ? 0 : this.temblor * Math.exp(-s * 10);
      if (this.cv) this.cv.style.transform = this.temblor ? `translate(${((Math.random() - .5) * this.temblor).toFixed(1)}px,${((Math.random() - .5) * this.temblor).toFixed(1)}px)` : ''; }
  },
  // choques entre objetos (cajas del suelo): se separan según la masa y se reparten la velocidad
  fisChoques() {
    const L = this.cuerpos.filter(o => !o.f.hundido && (!o.f.pared || o.f.libre));
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
      const A = L[a].f, B = L[b].f; if (A.quieto && B.quieto) continue; if (Math.abs(A.z - B.z) > 24) continue;
      const ba = this.fisCaja(L[a]), bb = this.fisCaja(L[b]), ox = Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x), oy = Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y);
      if (ox <= 0 || oy <= 0) continue;
      const fijoA = A === this.agarre?.f ? 0 : 1 / A.masa, fijoB = B === this.agarre?.f ? 0 : 1 / B.masa, sum = fijoA + fijoB; if (!sum) continue;
      const ejeX = ox < oy, sep = ejeX ? ox : oy, sg = ejeX ? (ba.x + ba.w / 2 < bb.x + bb.w / 2 ? -1 : 1) : (ba.y + ba.h / 2 < bb.y + bb.h / 2 ? -1 : 1);
      const k = ejeX ? 'x' : 'y', antA = A['d' + k], antB = B['d' + k], cabeA = this.fisCabe(ba), cabeB = this.fisCabe(bb);
      A['d' + k] += sg * sep * fijoA / sum; B['d' + k] -= sg * sep * fijoB / sum;
      if (cabeA && !this.fisCabe(this.fisCaja(L[a]))) A['d' + k] = antA;
      if (cabeB && !this.fisCabe(this.fisCaja(L[b]))) B['d' + k] = antB;
      const va = A['v' + k], vb = B['v' + k], rel = va - vb; if (rel * -sg >= 0) continue;          // ya se separan
      const j = -(1 + .3) * rel / sum; A['v' + k] += j * fijoA; B['v' + k] -= j * fijoB;
      A.quieto = B.quieto = false; A.libre = B.libre = true; this.fisSucio = true;
      if (Math.abs(rel) > 200) this.fisPolvo(L[Math.abs(va) > Math.abs(vb) ? b : a], 3);
    }
  },
  fisPolvo(o, n, col = '170,160,140', tipo = 'polvo') {
    if (!this.parts || this.parts.length > 520) return;
    const b = this.fisCaja(o);
    for (let i = 0; i < n; i++) this.parts.push({ x: b.x + Math.random() * b.w, y: b.y + b.h - 2, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * (tipo === 'brasa' ? 40 : 18), vida: 0, max: 400 + Math.random() * 400, tam: tipo === 'brasa' ? 1 : 2, col, tipo });
  },
  // ---------- animales: pasean solos; los peces solo por el agua y el resto la esquiva (salvo los pájaros, que vuelan) ----------
  fisAnimal(o, f, dt, s) {
    if (f.hundido) return;
    const sp = o.especie, enAgua = this.fisEnAgua(this.fisCaja(o));
    f.ia -= dt;
    if (f.ia <= 0) {
      if (Math.random() < .35 && !(enAgua && sp !== 'pez')) { f.obj = null; f.ia = 1500 + Math.random() * 3500; }
      else {
        let a = Math.random() * 6.28;
        if (enAgua && sp !== 'pez') { const q = this.fisOrilla(mfOX(o) + 16, mfOY(o) + 24); a = Math.atan2(q.y - mfOY(o) - 24, q.x - mfOX(o) - 16); }
        const v = f.vel * (.6 + Math.random() * .6); f.obj = { vx: Math.cos(a) * v, vy: Math.sin(a) * v * .8 }; f.ia = 800 + Math.random() * 2200;
        if (sp === 'pajaro' && Math.random() < .4 && !f.z) { f.vz = 260; f.obj.vx *= 3; f.obj.vy *= 3; f.ia = 900; }
      }
    }
    if (f.obj) {
      const b = this.fisCaja(o), nx = b.x + b.w / 2 + Math.sign(f.obj.vx) * 14, ny = b.y + b.h / 2 + Math.sign(f.obj.vy) * 10, sig = this.fisSuelo(nx, ny);
      const malo = sig === null || sig === 'lava' || (sp === 'pez' ? sig !== 'agua' : sig === 'agua' && !enAgua && !(sp === 'pajaro' && f.z > 4));
      if (malo) { f.obj.vx = -f.obj.vx; f.obj.vy = -f.obj.vy; }
      const k = Math.min(1, s * (f.z > 0 ? 2 : 6)); f.vx += (f.obj.vx - f.vx) * k; f.vy += (f.obj.vy - f.vy) * k; f.quieto = false;
      if (sp === 'conejo' && !f.z && !f.vz && Math.random() < s * 3) f.vz = 110;
    }
    if (Math.abs(f.vx) > 3) f.izq = f.vx < 0;
  },
  // ---------- ratón: agarrar, arrastrar, lanzar ----------
  fisicaAbajo(ev) {
    if (!this.cuerpos || ev.button !== 0) return false;
    const pt = this.punto(ev);
    // personaje primero (están delante), luego el objeto de más adelante bajo el cursor
    let pj = null, md = 26; for (const p of this.ents.values()) { if (p.sale) continue; const d = Math.hypot(p.x - pt.x, p.y - 34 - (p.z || 0) - pt.y); if (d < md) { md = d; pj = p; } }
    let ob = null;
    if (!pj) for (const o of this.cuerpos) {
      const d = MM_OBJ[o.tipo], f = o.f; if (f.hundido) continue;
      const X = mfOX(o), Y = mfOY(o) - d.alto - f.z;
      if (pt.x >= X && pt.x < X + d.w * MM_R && pt.y >= Y && pt.y < Y + d.h * MM_R + d.alto && (!ob || mfOY(o) > mfOY(ob))) ob = o;
    }
    if (!pj && !ob) return false;
    this.agarre = { p: pj, o: ob, f: ob?.f, ox: pt.x - (pj ? pj.x : mfOX(ob)), oy: pt.y - (pj ? pj.y : mfOY(ob)), x: pt.x, y: pt.y, vx: 0, vy: 0, t: performance.now(), x0: pt.x, y0: pt.y, movio: false };
    if (ob) { ob.f.quieto = false; ob.f.volver = false; ob.f.libre = true; }
    if (pj) { pj.agarrado = true; pj.vuelo = null; pj.ruta = []; }
    try { this.cv.setPointerCapture(ev.pointerId); } catch { }
    this.cv.style.cursor = 'grabbing';
    return true;
  },
  fisicaMover(ev) {
    const a = this.agarre; if (!a) return;
    const pt = this.punto(ev), ahora = performance.now(), ds = Math.max(1, ahora - a.t) / 1000;
    a.vx = a.vx * .6 + (pt.x - a.x) / ds * .4; a.vy = a.vy * .6 + (pt.y - a.y) / ds * .4; a.x = pt.x; a.y = pt.y; a.t = ahora;
    if (Math.hypot(pt.x - a.x0, pt.y - a.y0) > 4) a.movio = true;
  },
  fisicaArriba() {
    const a = this.agarre; if (!a) return false;
    this.agarre = null; this.cv.style.cursor = 'default';
    const cap = (v, m) => Math.max(-m, Math.min(m, v)), vx = cap(a.vx, 1400), vy = cap(a.vy, 1400);
    if (a.o) { const f = a.o.f; f.vx = vx / Math.sqrt(f.masa / 6 + .5); f.vy = vy / Math.sqrt(f.masa / 6 + .5); f.vz = 60 + Math.hypot(vx, vy) * .12; f.va += vx * .003; f.quieto = false; this.fisSucio = true; }
    if (a.p) { const p = a.p; p.agarrado = false; p.vuelo = { vx: vx * .8, vy: vy * .8, vz: 80 + Math.hypot(vx, vy) * .1 }; }
    return a.movio;
  },
  fisArrastrar(o, s) {
    const a = this.agarre, f = o.f, tx = a.x - a.ox - o.x * MM_R, ty = a.y - a.oy - o.y * MM_R;
    f.z += (Math.min(22, 8 + f.masa * .1) - f.z) * Math.min(1, s * 12); f.vz = 0;
    const ax = f.dx, ay = f.dy, k = Math.min(1, s * (30 / Math.sqrt(f.masa / 6 + .5)));
    let cabia = this.fisCabe(this.fisCaja(o)); f.dx += (tx - f.dx) * k; if (cabia && !this.fisCabe(this.fisCaja(o))) f.dx = ax;
    cabia = this.fisCabe(this.fisCaja(o)); f.dy += (ty - f.dy) * k; if (cabia && !this.fisCabe(this.fisCaja(o))) f.dy = ay;
    f.vx = (f.dx - ax) / s; f.vy = (f.dy - ay) / s;
    f.ang += ((cap => Math.max(-cap, Math.min(cap, -f.vx * .0015)))(.5) - f.ang) * Math.min(1, s * 10); f.va = 0;
    this.fisSucio = true;
  },
  // personajes agarrados o lanzados (los llama mover() antes que nada; true = ya se ha movido)
  fisicaPersonaje(p, dt, t) {
    const s = Math.min(dt, 50) / 1000;
    if (p.agarrado && this.agarre?.p === p) {
      p.x += (this.agarre.x - this.agarre.ox - p.x) * Math.min(1, s * 18); p.y += (this.agarre.y - this.agarre.oy + 20 - p.y) * Math.min(1, s * 18);
      p.z = (p.z || 0) + (20 - (p.z || 0)) * Math.min(1, s * 12);
      p.acc = 'quieto'; p.dir = 'abajo'; p.frame = Math.floor(t / 90) % 2; p.colgando = Math.sin(t / 110) * .25; return true;
    }
    if (!p.vuelo) { p.colgando = 0; return false; }
    const v = p.vuelo, ax = p.x, ay = p.y;
    v.vz -= MF_G * s; p.z = (p.z || 0) + v.vz * s;
    p.x += v.vx * s; if (!this.fisLibreEn(p.x, p.y - 2)) { p.x = ax; v.vx = -v.vx * .4; }
    p.y += v.vy * s; if (!this.fisLibreEn(p.x, p.y - 2)) { p.y = ay; v.vy = -v.vy * .4; }
    p.colgando = Math.max(-1, Math.min(1, v.vx * .002)); p.acc = 'quieto'; p.frame = Math.floor(t / 70) % 2;
    if (p.z <= 0) {
      p.z = 0;
      if (v.vz < -220) { v.vz = -v.vz * .3; v.vx *= .5; v.vy *= .5; this.parts.length < 520 && [0, 1, 2, 3].forEach(() => this.parts.push({ x: p.x + (Math.random() - .5) * 12, y: p.y, vx: (Math.random() - .5) * 50, vy: -12, vida: 0, max: 500, tam: 2, col: '170,160,140', tipo: 'polvo' })); }
      else if (this.fisSuelo(p.x, p.y - 2) === 'agua') { this.fisSalpicar(p.x, p.y - 4, 18); const q = this.fisOrilla(p.x, p.y - 2); p.x = q.x; p.y = q.y; p.vuelo = null; p.colgando = 0; p.ruta = []; p.espera = 1400; p.nace = Date.now(); this.decir(p, ['¡Splash!', '¡Al agua no!', 'Estoy empapado…', '¡Qué fría!'][Math.floor(Math.random() * 4)], 2200); }
      else { p.vuelo = null; p.colgando = 0; p.ruta = []; p.espera = 900; if (!this.fisLibreEn(p.x, p.y - 2)) { const q = this.puntoLibre(); p.x = q.x * MM_R + MM_R / 2; p.y = q.y * MM_R + MM_R * .8; } if (Math.random() < .5) this.decir(p, ['¡Eh!', '¡Uf!', '¡Ay!', 'Mareado…', '¡Otra vez!'][Math.floor(Math.random() * 5)], 1800); }
    }
    return true;
  },
  // ---------- dibujo de un objeto movido (sombra en el aire, tambaleo) ----------
  fisicaDibujar(c, k, t, e) {
    const o = k.o, f = o.f || MF_CERO, sp = mmSpriteObjeto(o); if (!sp) return;
    let alfa = 1;
    if (f.hundido) { alfa = Math.max(0, 1 - f.hundido / 1500); if (!alfa) return; }
    else if (f.nace && t - f.nace < 600) alfa = (t - f.nace) / 600;
    if (f.z > 1 || f.ang) {
      const b = this.fisCaja(o), r = Math.max(.35, 1 - f.z / 120);
      c.fillStyle = `rgba(0,0,0,${.32 * r})`; c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h - 2, b.w / 2 * r, Math.max(3, b.h / 3) * r, 0, 0, 7); c.fill();
    }
    c.globalAlpha = alfa;
    let hund = f.hundido ? Math.min(1, f.hundido / 1500) * 24 : 0;
    if (f.flota && o.especie !== 'pez' && o.tipo !== 'nenufar') {          // flotando: medio hundido, se mece y hace ondas
      hund += Math.min(10, 3 + f.masa * .3) + Math.sin(t / 420 + f.i) * 1.5;
      const b = this.fisCaja(o), r = ((t / 30 + f.i * 9) % 24);
      c.strokeStyle = `rgba(200,240,255,${.45 * (1 - r / 24)})`; c.lineWidth = 1; c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h - 2, b.w / 2 + r, 3 + r * .3, 0, 0, 7); c.stroke();
    }
    if (f.ang) {
      const cx = k.X + sp.width / 2, cy = k.Y + sp.height;
      c.save(); c.translate(cx, cy + hund); c.rotate(f.ang); c.drawImage(sp, -sp.width / 2, -sp.height); k.d.vivo?.(c, -sp.width / 2, -sp.height, t, e, o); c.restore();
    } else { c.drawImage(sp, k.X, k.Y + hund); k.d.vivo?.(c, k.X, k.Y + hund, t, e, o); }
    c.globalAlpha = 1;
    if (this.agarre?.o === o) { c.strokeStyle = this.tema.borde; c.globalAlpha = .55 + Math.sin(t / 150) * .25; c.lineWidth = 1; const b = this.fisCaja(o); c.strokeRect(b.x - .5, b.y - .5, b.w + 1, b.h + 1); c.globalAlpha = 1; }
  },
});
