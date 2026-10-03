// Estudio de Avatares de APOLO: una RECETA (JSON pequeño) → SVG determinista. Diseño propio: 16 siluetas, 5 estilos de ojos
// (el primero = los ojos anime del casco de APOLO), accesorios, mejillas y fondo. El mismo código pinta el panel, la isla,
// la app móvil, el overlay de streaming, el Wrapped y el daemon (Node), así que la misma receta se ve idéntica en todas partes.
// UMD sin dependencias: en el navegador deja window.AvatarSVG; en Node, module.exports.
//   svg(receta, {estado, animado, tam, id, imagen})   → string <svg>
//   pose(estado)                                        → pose pura (ojos, escala, mirar, alerta, zzz…) — testeable
//   validar(receta) → {ok, errores, receta}   normalizar(receta) → receta completa   aleatoria(semilla) → receta
//   PRESETS (12) · FORMAS (16) · OJOS · ACCESORIOS · FONDOS · ESTADOS · PALETA
//   aPNG(svg, tam) → Promise<Blob>  (solo navegador: el PNG lo hace el canvas del panel; en Node no hay rasterizador sin dependencias)
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else raiz.AvatarSVG = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 1;
  const FORMAS = ['circulo', 'cuadrado', 'pildora', 'hexagono', 'gota', 'nube', 'escudo', 'estrella', 'corazon', 'trebol', 'flor', 'rombo', 'triangulo', 'burbuja', 'casco', 'blob'];
  const OJOS = ['casco', 'puntos', 'capsulas', 'pixel', 'felices'];
  const ACCESORIOS = ['ninguno', 'antena', 'auriculares', 'visor', 'gorra'];
  const FONDOS = ['transparente', 'color', 'degradado'];
  const ESTADOS = ['reposo', 'trabajando', 'permiso', 'listo', 'error', 'dormido'];
  const PALETA = ['#2bdc7c', '#22c3a6', '#7ee8fa', '#5ab0ff', '#7c8cff', '#a78bfa', '#ff5fa2', '#ff8fab', '#ff6a3d', '#f5a524', '#ffd84d', '#9be15d', '#f2efe9', '#c7ced6', '#3b4452', '#1d232b'];
  const ALERTA = '#f5a524', ROJO = '#ff4d5e';

  // ---------- utilidades ----------
  const n1 = x => String(Math.round(x * 10) / 10 || 0);                 // números cortos y estables (sin -0)
  const HEX = /^#[0-9a-f]{6}$/i;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mezcla = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const luz = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const contraste = (a, b) => { const x = luz(a), y = luz(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function azar(semilla) {                                                // mulberry32: mismo número → misma secuencia en todas partes
    let a = (semilla >>> 0) || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // polígono con esquinas redondeadas (curva cuadrática en cada vértice)
  function poliRedondo(pts, r) {
    const N = pts.length, a = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i], ant = pts[(i - 1 + N) % N], sig = pts[(i + 1) % N];
      const hacia = (q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), k = Math.min(d, L / 2) / L; return [p[0] + dx * k, p[1] + dy * k]; };
      const e = hacia(ant, r), s = hacia(sig, r);
      a.push(`${i ? 'L' : 'M'}${n1(e[0])} ${n1(e[1])}Q${n1(p[0])} ${n1(p[1])} ${n1(s[0])} ${n1(s[1])}`);
    }
    return a.join('') + 'Z';
  }
  const regular = (k, cx, cy, R, rot = -90, r2 = null) => {
    const pts = [], tot = r2 ? k * 2 : k;
    for (let i = 0; i < tot; i++) { const ang = (rot + i * 360 / tot) * Math.PI / 180, rr = r2 && i % 2 ? r2 : R; pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]); }
    return pts;
  };
  // curva cerrada suave por los puntos (Catmull-Rom → Bézier): el blob
  function suave(pts) {
    const N = pts.length; let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
    }
    return d + 'Z';
  }
  const circ = (x, y, r) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}"/>`;
  const estrella4 = (x, y, s, color, extra = '') => `<path${extra} d="M${n1(x)} ${n1(y - s)}Q${n1(x + s * .18)} ${n1(y - s * .18)} ${n1(x + s)} ${n1(y)}Q${n1(x + s * .18)} ${n1(y + s * .18)} ${n1(x)} ${n1(y + s)}Q${n1(x - s * .18)} ${n1(y + s * .18)} ${n1(x - s)} ${n1(y)}Q${n1(x - s * .18)} ${n1(y - s * .18)} ${n1(x)} ${n1(y - s)}Z" fill="${color}"/>`;

  // ---------- siluetas (viewBox 200×200) ----------
  // el: la silueta (sin relleno; sirve de cuerpo y de clipPath) · cara: centro de los ojos, separación y tamaño
  // cima: dónde van antena/gorra · lados: dónde van los auriculares · variante: la silueta va en el color variante y `encima` en el del cuerpo
  function silueta(forma, semilla) {
    switch (forma) {
      case 'cuadrado': return { el: '<rect x="32" y="40" width="136" height="136" rx="42"/>', cara: { x: 100, y: 106, sep: 27, r: 15 }, cima: { x: 100, y: 40 }, lados: { i: 32, d: 168, y: 104 } };
      case 'pildora': return { el: '<rect x="50" y="24" width="100" height="164" rx="50"/>', cara: { x: 100, y: 96, sep: 22, r: 13 }, cima: { x: 100, y: 24 }, lados: { i: 50, d: 150, y: 92 } };
      case 'hexagono': return { el: `<path d="${poliRedondo(regular(6, 100, 108, 80, -90), 20)}"/>`, cara: { x: 100, y: 108, sep: 25, r: 14 }, cima: { x: 100, y: 33 }, lados: { i: 33, d: 167, y: 108 } };
      case 'gota': return { el: '<path d="M95 31Q100 22 105 31C118 52 164 88 164 126A64 64 0 0 1 36 126C36 88 82 52 95 31Z"/>', cara: { x: 100, y: 128, sep: 24, r: 14 }, cima: { x: 100, y: 25 }, lados: { i: 36, d: 164, y: 124 } };
      case 'nube': return { el: `${circ(70, 112, 40)}${circ(108, 90, 48)}${circ(142, 118, 36)}<rect x="40" y="110" width="124" height="62" rx="31"/>`, cara: { x: 104, y: 124, sep: 25, r: 14 }, cima: { x: 108, y: 42 }, lados: { i: 30, d: 178, y: 122 } };
      case 'escudo': return { el: '<path d="M100 28C128 40 148 44 166 44C166 106 148 154 100 184C52 154 34 106 34 44C52 44 72 40 100 28Z"/>', cara: { x: 100, y: 96, sep: 26, r: 14 }, cima: { x: 100, y: 30 }, lados: { i: 36, d: 164, y: 78 } };
      case 'estrella': return { el: `<path d="${poliRedondo(regular(5, 100, 112, 88, -90, 58), 14)}"/>`, cara: { x: 100, y: 116, sep: 21, r: 12 }, cima: { x: 100, y: 30 }, lados: { i: 44, d: 156, y: 100 } };
      case 'corazon': return { el: '<path d="M100 178C58 152 26 122 26 84C26 58 46 40 70 40C84 40 94 47 100 57C106 47 116 40 130 40C154 40 174 58 174 84C174 122 142 152 100 178Z"/>', cara: { x: 100, y: 98, sep: 26, r: 14 }, cima: { x: 100, y: 52 }, lados: { i: 27, d: 173, y: 86 } };
      case 'trebol': return { el: `${circ(100, 70, 40)}${circ(140, 110, 40)}${circ(100, 150, 40)}${circ(60, 110, 40)}${circ(100, 110, 44)}`, cara: { x: 100, y: 110, sep: 23, r: 13 }, cima: { x: 100, y: 30 }, lados: { i: 20, d: 180, y: 110 } };
      case 'flor': {
        let p = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2; p += circ(100 + Math.cos(a) * 58, 108 + Math.sin(a) * 58, 27); }
        return { el: p + circ(100, 108, 60), variante: true, encima: circ(100, 108, 56), cara: { x: 100, y: 108, sep: 22, r: 13 }, cima: { x: 100, y: 52 }, lados: { i: 44, d: 156, y: 108 } };
      }
      case 'rombo': return { el: `<path d="${poliRedondo([[100, 22], [178, 108], [100, 194], [22, 108]], 28)}"/>`, cara: { x: 100, y: 106, sep: 23, r: 13 }, cima: { x: 100, y: 34 }, lados: { i: 34, d: 166, y: 108 } };
      case 'triangulo': return { el: `<path d="${poliRedondo([[100, 22], [182, 172], [18, 172]], 26)}"/>`, cara: { x: 100, y: 130, sep: 23, r: 13 }, cima: { x: 100, y: 36 }, lados: { i: 44, d: 156, y: 140 } };
      case 'burbuja': return { el: '<rect x="28" y="32" width="144" height="120" rx="46"/><path d="M60 138L46 186Q45 190 49 188L110 146Z"/>', cara: { x: 100, y: 92, sep: 27, r: 15 }, cima: { x: 100, y: 32 }, lados: { i: 28, d: 172, y: 92 } };
      case 'casco': return {
        el: '<path d="M100 30C150 30 172 66 172 108V132C172 157 154 174 128 174H72C46 174 28 157 28 132V108C28 66 50 30 100 30Z"/><rect x="16" y="90" width="20" height="50" rx="10"/><rect x="164" y="90" width="20" height="50" rx="10"/>',
        visor: true, cara: { x: 100, y: 110, sep: 27, r: 15 }, cima: { x: 100, y: 30 }, lados: { i: 16, d: 184, y: 115 },
      };
      case 'blob': {
        const r = azar(semilla * 2654435761 + 7), N = 9, pts = [];
        for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / N + (r() - .5) * .35, R = 62 + r() * 18; pts.push([100 + Math.cos(a) * R, 108 + Math.sin(a) * R * .96]); }
        const cima = Math.min(...pts.map(p => p[1]));
        return { el: `<path d="${suave(pts)}"/>`, cara: { x: 100, y: 106, sep: 24, r: 14 }, cima: { x: 100, y: Math.max(cima + 4, 36) }, lados: { i: 36, d: 164, y: 108 } };
      }
      default: return { el: circ(100, 108, 72), cara: { x: 100, y: 104, sep: 26, r: 15 }, cima: { x: 100, y: 36 }, lados: { i: 28, d: 172, y: 108 } };
    }
  }

  // ---------- receta ----------
  const ojosPorDefecto = (cuerpo, estilo, visor) => {
    if (estilo === 'casco') return '#46d7be';
    if (visor) return '#7dffc4';
    return luz(cuerpo) > .3 ? '#1d232b' : '#f4f6f8';
  };
  const POR_DEFECTO = { v: VERSION, tipo: 'forma', forma: 'circulo', semilla: 1, cuerpo: '#2bdc7c', ojos: 'casco', colorOjos: '', mejillas: false, accesorio: 'ninguno', colorAccesorio: '#3b4452', fondo: { tipo: 'transparente', c1: '#10241a', c2: '#2bdc7c' } };
  function normalizar(r) {
    r = r && typeof r === 'object' ? r : {};
    const o = { v: VERSION, tipo: r.tipo === 'ia' ? 'ia' : 'forma' };
    o.forma = FORMAS.includes(r.forma) ? r.forma : POR_DEFECTO.forma;
    o.semilla = Number.isInteger(r.semilla) && r.semilla >= 0 && r.semilla < 2 ** 31 ? r.semilla : 1;
    o.cuerpo = HEX.test(r.cuerpo || '') ? r.cuerpo.toLowerCase() : POR_DEFECTO.cuerpo;
    o.ojos = OJOS.includes(r.ojos) ? r.ojos : POR_DEFECTO.ojos;
    o.colorOjos = HEX.test(r.colorOjos || '') ? r.colorOjos.toLowerCase() : ojosPorDefecto(o.cuerpo, o.ojos, o.forma === 'casco');
    o.mejillas = r.mejillas === true;
    o.accesorio = ACCESORIOS.includes(r.accesorio) ? r.accesorio : 'ninguno';
    o.colorAccesorio = HEX.test(r.colorAccesorio || '') ? r.colorAccesorio.toLowerCase() : POR_DEFECTO.colorAccesorio;
    const f = r.fondo && typeof r.fondo === 'object' ? r.fondo : {};
    o.fondo = { tipo: FONDOS.includes(f.tipo) ? f.tipo : 'transparente', c1: HEX.test(f.c1 || '') ? f.c1.toLowerCase() : POR_DEFECTO.fondo.c1, c2: HEX.test(f.c2 || '') ? f.c2.toLowerCase() : POR_DEFECTO.fondo.c2 };
    if (o.tipo === 'ia') { const id = r.ia && String(r.ia.id || ''); if (/^[a-z0-9-]{6,48}$/.test(id)) o.ia = { id }; else o.tipo = 'forma'; }
    if (typeof r.nombre === 'string' && r.nombre.trim()) o.nombre = r.nombre.trim().slice(0, 32);
    return o;
  }
  // validación estricta (lo que llega por la API): dice qué está mal en vez de arreglarlo en silencio
  function validar(r) {
    const e = [];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, errores: ['la receta debe ser un objeto'], receta: null };
    let tam = 0; try { tam = JSON.stringify(r).length; } catch { e.push('receta no serializable'); }
    if (tam > 2048) e.push('receta demasiado grande (máx. 2 KB)');
    if (r.tipo !== undefined && !['forma', 'ia'].includes(r.tipo)) e.push('tipo: forma | ia');
    if (r.forma !== undefined && !FORMAS.includes(r.forma)) e.push(`forma desconocida: ${String(r.forma).slice(0, 20)}`);
    if (r.ojos !== undefined && !OJOS.includes(r.ojos)) e.push(`ojos: ${OJOS.join(' | ')}`);
    if (r.accesorio !== undefined && !ACCESORIOS.includes(r.accesorio)) e.push(`accesorio: ${ACCESORIOS.join(' | ')}`);
    for (const k of ['cuerpo', 'colorOjos', 'colorAccesorio']) if (r[k] !== undefined && r[k] !== '' && !HEX.test(String(r[k]))) e.push(`${k}: color #rrggbb`);
    if (r.semilla !== undefined && !(Number.isInteger(r.semilla) && r.semilla >= 0 && r.semilla < 2 ** 31)) e.push('semilla: entero ≥ 0');
    if (r.mejillas !== undefined && typeof r.mejillas !== 'boolean') e.push('mejillas: true | false');
    if (r.fondo !== undefined) {
      if (!r.fondo || typeof r.fondo !== 'object') e.push('fondo: objeto {tipo, c1, c2}');
      else {
        if (r.fondo.tipo !== undefined && !FONDOS.includes(r.fondo.tipo)) e.push(`fondo.tipo: ${FONDOS.join(' | ')}`);
        for (const k of ['c1', 'c2']) if (r.fondo[k] !== undefined && !HEX.test(String(r.fondo[k]))) e.push(`fondo.${k}: color #rrggbb`);
      }
    }
    if (r.tipo === 'ia' && !/^[a-z0-9-]{6,48}$/.test(String(r.ia?.id || ''))) e.push('ia.id no válido');
    if (r.nombre !== undefined && typeof r.nombre !== 'string') e.push('nombre: texto');
    return e.length ? { ok: false, errores: e, receta: null } : { ok: true, errores: [], receta: normalizar(r) };
  }
  function aleatoria(semilla = Date.now()) {
    const r = azar(semilla), de = a => a[Math.floor(r() * a.length)];
    const cuerpo = de(PALETA.slice(0, 14));
    const ojos = de(OJOS), forma = de(FORMAS);
    let colorOjos = ojos === 'casco' ? de(['#46d7be', '#7dffc4', '#5ab0ff', '#ff8fab', '#ffd84d']) : ojosPorDefecto(cuerpo, ojos, forma === 'casco');
    const acc = r() < .45 ? 'ninguno' : de(ACCESORIOS.slice(1));
    let colorAccesorio = de(PALETA); if (contraste(colorAccesorio, cuerpo) < 1.6) colorAccesorio = luz(cuerpo) > .3 ? '#1d232b' : '#f2efe9';
    const tf = de(FONDOS), c1 = de(['#0d1a14', '#101828', '#1a1030', '#24120c', '#f2efe9', '#e8f4ff']);
    return normalizar({ forma, semilla: Math.floor(r() * 1e6), cuerpo, ojos, colorOjos, mejillas: r() < .4, accesorio: acc, colorAccesorio, fondo: { tipo: tf, c1, c2: mezcla(cuerpo, c1, .55) } });
  }

  // ---------- estado → pose (pura) ----------
  // Los MISMOS estados que el casco 3D: reposo / trabajando / permiso / listo / error / dormido
  const POSES = {
    reposo: { ojos: 'normal', escala: 1, mirar: 'centro', parpadeo: true, alerta: false, zzz: false, chispas: false, mov: 'flota' },
    trabajando: { ojos: 'normal', escala: .92, mirar: 'escanear', parpadeo: true, alerta: false, zzz: false, chispas: false, mov: 'trabaja' },
    permiso: { ojos: 'normal', escala: 1.3, mirar: 'centro', parpadeo: false, alerta: true, zzz: false, chispas: false, mov: 'pulso' },
    listo: { ojos: 'felices', escala: 1, mirar: 'centro', parpadeo: false, alerta: false, zzz: false, chispas: true, mov: 'salto' },
    error: { ojos: 'x', escala: 1, mirar: 'centro', parpadeo: false, alerta: false, zzz: false, chispas: false, mov: 'tiembla' },
    dormido: { ojos: 'cerrados', escala: 1, mirar: 'centro', parpadeo: false, alerta: false, zzz: true, chispas: false, mov: 'respira' },
  };
  function pose(estado) { const e = ESTADOS.includes(estado) ? estado : 'reposo'; return { estado: e, ...POSES[e] }; }

  // ---------- ojos ----------
  function ojo(estilo, x, y, r, col, fondoCara, P, u, lado) {
    const sw = r * .3, linea = (d, c = col) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${n1(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (P.ojos === 'cerrados') return linea(`M${n1(x - r)} ${n1(y)}Q${n1(x)} ${n1(y + r * .75)} ${n1(x + r)} ${n1(y)}`);
    if (P.ojos === 'felices') return linea(`M${n1(x - r)} ${n1(y + r * .35)}Q${n1(x)} ${n1(y - r * 1.05)} ${n1(x + r)} ${n1(y + r * .35)}`);
    if (P.ojos === 'x') { const k = r * .72; return linea(`M${n1(x - k)} ${n1(y - k)}L${n1(x + k)} ${n1(y + k)}M${n1(x + k)} ${n1(y - k)}L${n1(x - k)} ${n1(y + k)}`, ROJO); }
    const s = P.escala; r *= s;
    const cls = P.parpadeo ? ' class="ojo"' : '';
    switch (estilo) {
      case 'casco': {                                   // los ojos del casco de APOLO: anillo, degradado noche → color → rosa, pupila, brillos y destello
        const R = r * 1.12;
        return `<g${cls}><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(R * 1.06)}" fill="none" stroke="#e1c8eb" stroke-opacity=".6" stroke-width="${n1(R * .12)}"/>
<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(R)}" fill="url(#${u}-io)"/>
<circle cx="${n1(x)}" cy="${n1(y - R * .05)}" r="${n1(R * .52)}" fill="#03030c" fill-opacity=".88"/>
<ellipse cx="${n1(x - R * .3)}" cy="${n1(y - R * .38)}" rx="${n1(R * .27)}" ry="${n1(R * .24)}" fill="#fff" fill-opacity=".95"/>
${circ(x + R * .38, y + R * .28, R * .09).replace('/>', ' fill="#fff"/>')}
${estrella4(x - R * .4, y - R * .02, R * .14, '#d7aaff', ' class="destello"')}${estrella4(x + R * .16, y + R * .46, R * .1, '#ffaae6', ' class="destello d2"')}</g>`;
      }
      case 'capsulas': {
        const w = r * .95, h = r * 2.05;
        return `<g${cls}><rect x="${n1(x - w / 2)}" y="${n1(y - h / 2)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(w / 2)}" fill="${col}"/>
<rect x="${n1(x - w * .22)}" y="${n1(y - h * .36)}" width="${n1(w * .26)}" height="${n1(h * .26)}" rx="${n1(w * .13)}" fill="#fff" fill-opacity="${luz(col) > .5 ? .55 : .85}"/></g>`;
      }
      case 'pixel': {
        const c = r * .54, g = r * .08, filas = 4, cols = 3, x0 = x - (cols * c + (cols - 1) * g) / 2, y0 = y - (filas * c + (filas - 1) * g) / 2;
        let o = '';
        for (let f = 0; f < filas; f++) for (let k = 0; k < cols; k++) {
          if ((f === 0 || f === filas - 1) && k !== 1) continue;
          const brillo = f === 1 && k === 0;
          o += `<rect x="${n1(x0 + k * (c + g))}" y="${n1(y0 + f * (c + g))}" width="${n1(c)}" height="${n1(c)}" rx="${n1(c * .18)}" fill="${brillo ? mezcla(col, '#ffffff', .65) : col}"/>`;
        }
        return `<g${cls}>${o}</g>`;
      }
      case 'felices': {                                 // semicírculos (cúpula rellena, base plana)
        const yb = y + r * .45;
        return `<g${cls}><path d="M${n1(x - r)} ${n1(yb)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(x + r)} ${n1(yb)}Q${n1(x)} ${n1(yb + r * .22)} ${n1(x - r)} ${n1(yb)}Z" fill="${col}"/>
<ellipse cx="${n1(x - r * .35)}" cy="${n1(yb - r * .55)}" rx="${n1(r * .2)}" ry="${n1(r * .14)}" fill="#fff" fill-opacity="${luz(col) > .5 ? .5 : .8}"/></g>`;
      }
      default: {                                        // puntos
        return `<g${cls}><ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(r * .66)}" ry="${n1(r * .86)}" fill="${col}"/>
${circ(x - r * .22, y - r * .34, r * .22).replace('/>', ` fill="#fff" fill-opacity="${luz(col) > .5 ? .55 : .9}"/>`)}</g>`;
      }
    }
  }

  // ---------- accesorios ----------
  function accesorio(tipo, S, col, cuerpo, u) {
    const { cima, lados, cara } = S, osc = mezcla(col, '#000000', .3), cl = mezcla(col, '#ffffff', .35);
    if (tipo === 'antena') {
      const x = cima.x, y = cima.y + 4, top = y - 32;
      return `<g class="antena"><path d="M${n1(x)} ${n1(y)}V${n1(top + 6)}" stroke="${mezcla(cuerpo, '#000000', .35)}" stroke-width="6" stroke-linecap="round"/>
<circle class="bola" cx="${n1(x)}" cy="${n1(top)}" r="9.5" fill="${col}"/><circle cx="${n1(x - 2.6)}" cy="${n1(top - 2.6)}" r="2.4" fill="#fff" fill-opacity=".75"/></g>`;
    }
    if (tipo === 'auriculares') {
      const { i, d, y } = lados, arco = Math.min(cima.y - 14, y - 70);
      return `<g><path d="M${n1(i + 2)} ${n1(y - 8)}C${n1(i - 2)} ${n1(arco)} ${n1(d + 2)} ${n1(arco)} ${n1(d - 2)} ${n1(y - 8)}" fill="none" stroke="${osc}" stroke-width="7" stroke-linecap="round"/>
<rect x="${n1(i - 10)}" y="${n1(y - 22)}" width="20" height="44" rx="10" fill="${col}"/><rect x="${n1(i - 4)}" y="${n1(y - 14)}" width="6" height="28" rx="3" fill="${cl}" fill-opacity=".7"/>
<rect x="${n1(d - 10)}" y="${n1(y - 22)}" width="20" height="44" rx="10" fill="${col}"/><rect x="${n1(d - 2)}" y="${n1(y - 14)}" width="6" height="28" rx="3" fill="${cl}" fill-opacity=".7"/></g>`;
    }
    if (tipo === 'visor') {
      const w = (cara.sep + cara.r * 2.1) * 2, h = cara.r * 3.1, x = cara.x - w / 2, y = cara.y - h / 2;
      return `<g><rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(h / 2)}" fill="${col}" fill-opacity=".26" stroke="${col}" stroke-opacity=".85" stroke-width="2.6"/>
<path d="M${n1(x + h * .45)} ${n1(y + h * .28)}H${n1(x + w * .42)}" stroke="#fff" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/></g>`;
    }
    if (tipo === 'gorra') {
      const x = cima.x, y = cima.y + 22;
      return `<g transform="rotate(-9 ${n1(x)} ${n1(y)})"><path d="M${n1(x - 46)} ${n1(y)}C${n1(x - 46)} ${n1(y - 44)} ${n1(x + 46)} ${n1(y - 44)} ${n1(x + 46)} ${n1(y)}Z" fill="${col}"/>
<path d="M${n1(x + 30)} ${n1(y - 3)}Q${n1(x + 72)} ${n1(y - 6)} ${n1(x + 78)} ${n1(y + 4)}Q${n1(x + 60)} ${n1(y + 9)} ${n1(x + 30)} ${n1(y + 4)}Z" fill="${osc}"/>
<path d="M${n1(x - 46)} ${n1(y)}H${n1(x + 46)}" stroke="${osc}" stroke-width="4" stroke-linecap="round"/>
<circle cx="${n1(x)}" cy="${n1(y - 33)}" r="4.5" fill="${osc}"/><path d="M${n1(x - 26)} ${n1(y - 20)}Q${n1(x - 18)} ${n1(y - 30)} ${n1(x - 6)} ${n1(y - 32)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/></g>`;
    }
    return '';
  }

  // ---------- animación (CSS dentro del SVG, con nombres únicos por avatar) ----------
  function estilos(u, P) {
    const mov = {
      flota: `@keyframes ${u}-m{50%{transform:translateY(-3px)}}.${u} .cuerpo{animation:${u}-m 3.6s ease-in-out infinite}`,
      trabaja: `@keyframes ${u}-m{25%{transform:translateY(-2px) rotate(-1.5deg)}75%{transform:translateY(-2px) rotate(1.5deg)}}.${u} .cuerpo{animation:${u}-m 1.6s ease-in-out infinite}`,
      pulso: `@keyframes ${u}-m{50%{transform:scale(1.035)}}.${u} .cuerpo{animation:${u}-m .9s ease-in-out infinite}`,
      salto: `@keyframes ${u}-m{0%,60%,100%{transform:translateY(0)}20%{transform:translateY(-9px)}40%{transform:translateY(0) scale(1.03,.97)}}.${u} .cuerpo{animation:${u}-m 1.8s ease-in-out infinite}`,
      tiembla: `@keyframes ${u}-m{0%,60%,100%{transform:translateX(0)}10%,30%,50%{transform:translateX(-3px)}20%,40%{transform:translateX(3px)}}.${u} .cuerpo{animation:${u}-m 1.6s ease-in-out infinite}`,
      respira: `@keyframes ${u}-m{50%{transform:scale(1.025,.985)}}.${u} .cuerpo{animation:${u}-m 4.5s ease-in-out infinite}`,
    }[P.mov];
    return `<style>.${u} .cuerpo,.${u} .ojo,.${u} .destello,.${u} .bola,.${u} .zz,.${u} .chispa{transform-box:fill-box;transform-origin:50% 50%}.${u} .cuerpo{transform-origin:50% 100%}${mov}`
      + (P.parpadeo ? `@keyframes ${u}-p{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}.${u} .ojo{animation:${u}-p 4.8s infinite}` : '')
      + (P.mirar === 'escanear' ? `@keyframes ${u}-e{0%,100%{transform:translateX(-6px)}50%{transform:translateX(6px)}}.${u} .mira{animation:${u}-e 2.2s ease-in-out infinite}` : '')
      + `@keyframes ${u}-d{50%{opacity:.35;transform:scale(.6)}}.${u} .destello{animation:${u}-d 1.8s ease-in-out infinite}.${u} .d2{animation-delay:-.9s}`
      + `@keyframes ${u}-b{50%{opacity:.55}}.${u} .bola{animation:${u}-b ${P.mov === 'trabaja' ? '.5s' : '2.4s'} ease-in-out infinite}`
      + (P.alerta ? `@keyframes ${u}-h{50%{opacity:.25;stroke-width:5}}.${u} .halo{animation:${u}-h 1s ease-in-out infinite}` : '')
      + (P.zzz ? `@keyframes ${u}-z{0%{opacity:0;transform:translate(0,6px) scale(.7)}30%{opacity:1}100%{opacity:0;transform:translate(10px,-18px) scale(1.15)}}.${u} .zz{animation:${u}-z 3s ease-out infinite}.${u} .zz.z2{animation-delay:-1.5s}` : '')
      + (P.chispas ? `@keyframes ${u}-c{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1)}}.${u} .chispa{animation:${u}-c 1.4s ease-in-out infinite}.${u} .chispa.c2{animation-delay:-.7s}` : '')
      + `@media (prefers-reduced-motion:reduce){.${u} *{animation:none!important}}</style>`;
  }

  // ---------- SVG ----------
  function svg(receta, op = {}) {
    const R = normalizar(receta), P = pose(op.estado);
    const animado = op.animado !== false, tam = op.tam ? ` width="${+op.tam | 0}" height="${+op.tam | 0}"` : '';
    const u = op.id ? String(op.id).replace(/[^\w-]/g, '') : 'av' + hash(JSON.stringify(R) + P.estado + (animado ? 1 : 0)).toString(36);
    const S = silueta(R.forma, R.semilla);
    let colOjos = R.colorOjos;
    if (P.alerta) colOjos = contraste(ALERTA, S.visor ? '#0a0f14' : R.cuerpo) >= 1.8 ? ALERTA : '#8a3b00';
    const variante = luz(R.cuerpo) > .45 ? mezcla(R.cuerpo, '#ffffff', .45) : mezcla(R.cuerpo, '#ffffff', .3);
    const defs = [];
    // degradado del ojo del casco: noche → color de ojos → rosa APOLO
    defs.push(`<linearGradient id="${u}-io" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07081a"/><stop offset=".45" stop-color="#121838"/><stop offset=".72" stop-color="${colOjos}"/><stop offset="1" stop-color="${mezcla(colOjos, '#f57daf', .65)}"/></linearGradient>`);
    defs.push(`<radialGradient id="${u}-bri" cx=".32" cy=".22" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
    defs.push(`<linearGradient id="${u}-som" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>`);
    defs.push(`<clipPath id="${u}-cl">${S.el}</clipPath>`);
    let fondo = '';
    if (R.fondo.tipo === 'color') fondo = `<rect width="200" height="200" fill="${R.fondo.c1}"/>`;
    if (R.fondo.tipo === 'degradado') {
      defs.push(`<linearGradient id="${u}-fd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${R.fondo.c1}"/><stop offset="1" stop-color="${R.fondo.c2}"/></linearGradient>`);
      fondo = `<rect width="200" height="200" fill="url(#${u}-fd)"/>`;
    }
    const c = S.cara, sep = c.sep * (P.escala > 1 ? 1.06 : 1);
    // cuerpo (o imagen del Personaje IA)
    let cuerpo;
    if (R.tipo === 'ia' && op.imagen) {
      defs.push(`<clipPath id="${u}-ci"><circle cx="100" cy="104" r="80"/></clipPath>`);
      cuerpo = `<image href="${String(op.imagen).replace(/["<>&]/g, '')}" x="20" y="24" width="160" height="160" clip-path="url(#${u}-ci)" preserveAspectRatio="xMidYMid slice"/>`
        + `<circle cx="100" cy="104" r="80" fill="none" stroke="${R.cuerpo}" stroke-width="4"/>`;
    } else {
      const caraVisor = S.visor ? `<rect x="${n1(c.x - c.sep - c.r * 2.3)}" y="${n1(c.y - c.r * 2.15)}" width="${n1((c.sep + c.r * 2.3) * 2)}" height="${n1(c.r * 4.3)}" rx="${n1(c.r * 2)}" fill="#0a0f14"/>`
        + `<rect x="${n1(c.x - c.sep - c.r * 2.3)}" y="${n1(c.y - c.r * 2.15)}" width="${n1((c.sep + c.r * 2.3) * 2)}" height="${n1(c.r * 4.3)}" rx="${n1(c.r * 2)}" fill="none" stroke="${colOjos}" stroke-opacity=".35" stroke-width="2"/>`
        + `<path d="M${n1(c.x - 14)} 44H${n1(c.x + 14)}" stroke="${mezcla(R.cuerpo, '#000000', .3)}" stroke-width="4" stroke-linecap="round"/>` : '';
      const ojos = [-1, 1].map(l => ojo(R.ojos, c.x + l * sep, c.y, c.r, colOjos, R.cuerpo, P, u, l)).join('');
      const mej = R.mejillas && !S.visor ? [-1, 1].map(l => `<ellipse cx="${n1(c.x + l * (sep + c.r * .55))}" cy="${n1(c.y + c.r * 1.45)}" rx="${n1(c.r * .62)}" ry="${n1(c.r * .34)}" fill="#ff7aa8" fill-opacity=".5"/>`).join('') : '';
      cuerpo = `<g fill="${S.variante ? variante : R.cuerpo}">${S.el}</g>${S.encima ? `<g fill="${R.cuerpo}">${S.encima}</g>` : ''}`
        + `<g clip-path="url(#${u}-cl)"><rect width="200" height="200" fill="url(#${u}-bri)"/><rect width="200" height="200" fill="url(#${u}-som)"/></g>`
        + caraVisor + `<g class="mira">${ojos}</g>` + mej;
    }
    const acc = R.accesorio !== 'ninguno' ? accesorio(R.accesorio, S, R.colorAccesorio, R.cuerpo, u) : '';
    const accDetras = R.accesorio === 'antena' || R.accesorio === 'auriculares';
    const halo = P.alerta ? `<circle class="halo" cx="100" cy="106" r="90" fill="none" stroke="${ALERTA}" stroke-width="3" stroke-opacity=".9"/>` : '';
    const zzz = P.zzz ? `<text class="zz" x="140" y="62" font-family="Segoe UI,system-ui,sans-serif" font-weight="800" font-size="30" fill="${luz(R.cuerpo) > .3 && R.fondo.tipo === 'transparente' ? mezcla(R.cuerpo, '#000000', .4) : '#cfe3ff'}">z</text><text class="zz z2" x="162" y="40" font-family="Segoe UI,system-ui,sans-serif" font-weight="800" font-size="20" fill="${luz(R.cuerpo) > .3 && R.fondo.tipo === 'transparente' ? mezcla(R.cuerpo, '#000000', .4) : '#cfe3ff'}">z</text>` : '';
    const chispas = P.chispas ? estrella4(34, 50, 12, '#ffd84d', ' class="chispa"') + estrella4(170, 66, 9, '#ffffff', ' class="chispa c2"') + estrella4(162, 160, 8, '#7dffc4', ' class="chispa"') : '';
    const sombra = `<ellipse cx="100" cy="190" rx="${n1(R.forma === 'pildora' ? 40 : 54)}" ry="6" fill="#000" fill-opacity="${R.fondo.tipo === 'transparente' ? .14 : .22}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"${tam} class="avatar-svg ${u}" role="img" aria-label="avatar">`
      + (animado ? estilos(u, P) : '') + `<defs>${defs.join('')}</defs>${fondo}`
      + `<g transform="translate(100 108) scale(.9) translate(-100 -108)">${sombra}${halo}<g class="cuerpo">${accDetras ? acc : ''}${cuerpo}${accDetras ? '' : acc}</g>${zzz}${chispas}</g></svg>`;
  }

  const dataUri = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  // ---------- presets propios (12) ----------
  const PRESETS = [
    { nombre: 'APOLO', forma: 'casco', cuerpo: '#c7ced6', ojos: 'casco', colorOjos: '#46d7be', accesorio: 'ninguno', fondo: { tipo: 'degradado', c1: '#07110c', c2: '#1d4a33' } },
    { nombre: 'Menta', forma: 'circulo', cuerpo: '#2bdc7c', ojos: 'puntos', colorOjos: '#10261a', mejillas: true, fondo: { tipo: 'transparente' } },
    { nombre: 'Panal', forma: 'hexagono', cuerpo: '#f5a524', ojos: 'pixel', colorOjos: '#3a2400', accesorio: 'antena', colorAccesorio: '#3b4452', fondo: { tipo: 'color', c1: '#1b1408' } },
    { nombre: 'Nimbo', forma: 'nube', cuerpo: '#f2efe9', ojos: 'felices', colorOjos: '#3b4452', mejillas: true, fondo: { tipo: 'degradado', c1: '#5ab0ff', c2: '#7ee8fa' } },
    { nombre: 'Gota', forma: 'gota', cuerpo: '#7ee8fa', ojos: 'capsulas', colorOjos: '#0d2230', fondo: { tipo: 'color', c1: '#0c1a22' } },
    { nombre: 'Magma', forma: 'estrella', cuerpo: '#ff6a3d', ojos: 'casco', colorOjos: '#ffd84d', fondo: { tipo: 'degradado', c1: '#1f0904', c2: '#5a1a0a' } },
    { nombre: 'Lila', forma: 'blob', semilla: 7, cuerpo: '#a78bfa', ojos: 'puntos', colorOjos: '#1d1530', accesorio: 'auriculares', colorAccesorio: '#ff5fa2', fondo: { tipo: 'transparente' } },
    { nombre: 'Latido', forma: 'corazon', cuerpo: '#ff5fa2', ojos: 'felices', colorOjos: '#3a0a20', mejillas: true, fondo: { tipo: 'color', c1: '#ffe3ee' } },
    { nombre: 'Trébol', forma: 'trebol', cuerpo: '#9be15d', ojos: 'puntos', colorOjos: '#16260b', accesorio: 'gorra', colorAccesorio: '#3b4452', fondo: { tipo: 'transparente' } },
    { nombre: 'Girasol', forma: 'flor', cuerpo: '#ffd84d', ojos: 'capsulas', colorOjos: '#3a2a00', mejillas: true, fondo: { tipo: 'degradado', c1: '#132a1a', c2: '#2c6b3c' } },
    { nombre: 'Guardián', forma: 'escudo', cuerpo: '#5ab0ff', ojos: 'casco', colorOjos: '#7dffc4', accesorio: 'visor', colorAccesorio: '#2bdc7c', fondo: { tipo: 'color', c1: '#0b1422' } },
    { nombre: 'Píxel', forma: 'burbuja', cuerpo: '#7c8cff', ojos: 'pixel', colorOjos: '#ffffff', accesorio: 'antena', colorAccesorio: '#ffd84d', fondo: { tipo: 'transparente' } },
  ].map(normalizar);

  // ---------- PNG (solo navegador): SVG → canvas → Blob ----------
  function aPNG(s, tam = 1024) {
    return new Promise((ok, mal) => {
      if (typeof document === 'undefined') return mal(new Error('aPNG solo funciona en el navegador'));
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = cv.height = tam;
        cv.getContext('2d').drawImage(img, 0, 0, tam, tam);
        cv.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo crear el PNG'))), 'image/png');
      };
      img.onerror = () => mal(new Error('no se pudo dibujar el SVG'));
      img.src = dataUri(s.replace(/<style>[\s\S]*?<\/style>/, ''));
    });
  }

  return { VERSION, FORMAS, OJOS, ACCESORIOS, FONDOS, ESTADOS, PALETA, PRESETS, svg, pose, validar, normalizar, aleatoria, dataUri, aPNG, hash, contraste, _silueta: silueta };
});
