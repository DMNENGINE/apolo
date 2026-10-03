// Geometría de la isla (lógica pura, sin Electron): dónde va la ventana, hacia dónde se abre el panel,
// posición guardada por monitor y hit-testing de "parte visible". La usan main.js (require) y la isla (<script>, window.IslaGeo).
// Coordenadas en DIP (las de Electron: screen.*, setBounds). "barra" = la isla CERRADA (robot + texto), 340 x 95.
(function (root) {
  const BARRA_W = 340, BARRA_H = 95;           // #island cerrado: width 340 · #bar height calc(var(--robot) + 4px) con --robot 91px
  const VENT_W = 900, VENT_H = 640;            // ventana transparente: cabe la isla abierta con terminales (860) y el panel
  const ZONA_CENTRO = 0.15;                    // |centro - mitad| < 15 % del ancho → se abre centrada (como siempre arriba en el centro)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dentro = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

  // la barra no puede salirse del área de trabajo (sin barra de tareas)
  function barraDentro(barra, wa) {
    const w = barra.w || BARRA_W, h = barra.h || BARRA_H;
    return { x: Math.round(clamp(barra.x, wa.x, wa.x + wa.width - w)), y: Math.round(clamp(barra.y, wa.y, wa.y + wa.height - h)), w, h };
  }

  // hacia dónde se despliega: mitad inferior → hacia arriba; mitad derecha → crece a la izquierda; izquierda → a la derecha
  function direccion(barra, wa) {
    const fx = (barra.x + barra.w / 2 - wa.x) / wa.width, fy = (barra.y + barra.h / 2 - wa.y) / wa.height;
    return { h: Math.abs(fx - 0.5) < ZONA_CENTRO ? 'centro' : fx > 0.5 ? 'der' : 'izq', v: fy > 0.5 ? 'abajo' : 'arriba' };
  }

  // ventana (siempre dentro del área de trabajo) + dónde queda la barra dentro de ella + dirección de apertura
  function layout(barra, wa, tam) {
    tam = tam || {};
    const W = Math.min(tam.w || VENT_W, wa.width), H = Math.min(tam.h || VENT_H, wa.height);
    const b = barraDentro(barra, wa), { h, v } = direccion(b, wa);
    let x = h === 'izq' ? b.x : h === 'der' ? b.x + b.w - W : b.x + b.w / 2 - W / 2;
    let y = v === 'arriba' ? b.y : b.y + b.h - H;
    x = Math.round(clamp(x, wa.x, wa.x + wa.width - W)); y = Math.round(clamp(y, wa.y, wa.y + wa.height - H));
    return { ventana: { x, y, width: W, height: H }, barX: b.x - x, barY: b.y - y, h, v, barra: b };
  }

  // left (px dentro de la ventana) del panel de un ancho dado: anclado a la barra por el lado de su dirección, sin salirse
  function izquierdaPanel(lay, ancho) {
    const W = lay.ventana.width;
    const l = lay.h === 'izq' ? lay.barX : lay.h === 'der' ? lay.barX + BARRA_W - ancho : lay.barX + BARRA_W / 2 - ancho / 2;
    return Math.round(clamp(l, 0, Math.max(0, W - ancho)));
  }
  // alto máximo del panel abierto hacia su lado (arriba: lo que queda debajo; abajo: lo que queda encima)
  function altoMaxPanel(lay) { return lay.v === 'abajo' ? lay.barY + BARRA_H : lay.ventana.height - lay.barY; }

  // posición guardada: monitor + fracción (0..1) del hueco libre del área de trabajo → vale aunque cambie la resolución
  function aFraccion(barra, wa) {
    const lx = wa.width - (barra.w || BARRA_W), ly = wa.height - (barra.h || BARRA_H);
    return { fx: lx > 0 ? clamp((barra.x - wa.x) / lx, 0, 1) : 0.5, fy: ly > 0 ? clamp((barra.y - wa.y) / ly, 0, 1) : 0 };
  }
  function deFraccion(f, wa) {
    return barraDentro({ x: wa.x + (wa.width - BARRA_W) * clamp(+f.fx || 0, 0, 1), y: wa.y + (wa.height - BARRA_H) * clamp(+f.fy || 0, 0, 1) }, wa);
  }
  const POR_DEFECTO = { fx: 0.5, fy: 0 };       // arriba en el centro del monitor principal

  // el monitor guardado: por id; si no, uno con los mismos bounds (los id cambian a veces al reiniciar); si no existe → null
  function elegirMonitor(guardado, displays) {
    if (!guardado || !displays || !displays.length) return null;
    const mismo = (a, b) => a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    return displays.find(d => d.id === guardado.id) || displays.find(d => mismo(d.bounds, guardado.bounds)) || null;
  }
  // monitor de un punto: el que lo contiene o, si cae en un hueco entre pantallas, el más cercano
  function monitorDe(p, displays) {
    const c = displays.find(d => dentro(p, d.bounds));
    if (c) return c;
    const dist = r => Math.hypot(p.x - clamp(p.x, r.x, r.x + r.width), p.y - clamp(p.y, r.y, r.y + r.height));
    return displays.slice().sort((a, b) => dist(a.bounds) - dist(b.bounds))[0] || null;
  }
  const centroBarra = b => ({ x: b.x + (b.w || BARRA_W) / 2, y: b.y + (b.h || BARRA_H) / 2 });

  // ---------- hit-testing: ¿el punto cae sobre algo VISIBLE de la isla? ----------
  // d = { tag, fondo, imagen, bordeAncho, bordeColor, cursor, opacidad, marcado } (de getComputedStyle)
  const TRANSPARENTE = c => !c || c === 'transparent' || /^rgba\([^)]*,\s*0(\.0+)?\s*\)$/.test(String(c).replace(/\s+/g, ' '));
  const TAGS = /^(canvas|button|input|textarea|select|img|svg|path|rect|a|video)$/i;
  function esSolido(d) {
    if (!d) return false;
    if (d.marcado) return true;
    if (TAGS.test(d.tag || '')) return true;
    if (!TRANSPARENTE(d.fondo)) return true;
    if (d.imagen && d.imagen !== 'none') return true;
    if (parseFloat(d.bordeAncho) > 0 && !TRANSPARENTE(d.bordeColor)) return true;
    return d.cursor === 'pointer' || d.cursor === 'text';
  }
  // cadena = el elemento del punto y sus padres (hasta #island sin incluirlo): sólido si alguno lo es y ninguno es invisible
  function cadenaSolida(cadena) {
    if (!cadena || !cadena.length) return false;
    if (cadena.some(d => d.opacidad !== undefined && parseFloat(d.opacidad) < 0.05)) return false;
    return cadena.some(esSolido);
  }

  const IslaGeo = { BARRA_W, BARRA_H, VENT_W, VENT_H, POR_DEFECTO, barraDentro, direccion, layout, izquierdaPanel, altoMaxPanel,
    aFraccion, deFraccion, elegirMonitor, monitorDe, centroBarra, esSolido, cadenaSolida };
  if (typeof module !== 'undefined' && module.exports) module.exports = IslaGeo; else root.IslaGeo = IslaGeo;
})(this);
