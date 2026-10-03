// Geometría de la isla: dirección de apertura, ventana dentro del área de trabajo con 3 monitores, posición guardada y hit-testing.
const test = require('node:test');
const assert = require('node:assert');
const G = require('../../shared/isla-geometria.js');

// los 3 monitores del usuario: principal 2560x1440, derecha 1920x1080, vertical 1080x1920 a la izquierda (x negativa)
const PRIN = { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1392 } };
const DER = { id: 2, bounds: { x: 2560, y: 0, width: 1920, height: 1080 }, workArea: { x: 2560, y: 0, width: 1920, height: 1032 } };
const VERT = { id: 3, bounds: { x: -1080, y: -300, width: 1080, height: 1920 }, workArea: { x: -1080, y: -300, width: 1080, height: 1872 } };
const MONS = [PRIN, DER, VERT];
const barra = (x, y) => ({ x, y, w: G.BARRA_W, h: G.BARRA_H });
const contiene = (wa, r) => r.x >= wa.x && r.y >= wa.y && r.x + r.width <= wa.x + wa.width && r.y + r.height <= wa.y + wa.height;

test('dirección de apertura según la zona del monitor', () => {
  const wa = PRIN.workArea;
  assert.deepStrictEqual(G.direccion(barra(1110, 0), wa), { h: 'centro', v: 'arriba' });       // por defecto: arriba centro
  assert.deepStrictEqual(G.direccion(barra(2200, 1290), wa), { h: 'der', v: 'abajo' });
  assert.deepStrictEqual(G.direccion(barra(20, 1290), wa), { h: 'izq', v: 'abajo' });
  assert.deepStrictEqual(G.direccion(barra(20, 30), wa), { h: 'izq', v: 'arriba' });
  assert.deepStrictEqual(G.direccion(barra(2200, 30), wa), { h: 'der', v: 'arriba' });
});

test('la ventana queda SIEMPRE dentro del área de trabajo y la barra no se mueve', () => {
  for (const d of MONS) {
    const wa = d.workArea;
    for (const fx of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) for (const fy of [0, 0.2, 0.49, 0.51, 0.8, 1]) {
      const b = G.deFraccion({ fx, fy }, wa), L = G.layout(b, wa);
      assert.ok(contiene(wa, L.ventana), `ventana fuera en monitor ${d.id} fx=${fx} fy=${fy}`);
      assert.deepStrictEqual({ x: L.ventana.x + L.barX, y: L.ventana.y + L.barY }, { x: b.x, y: b.y });
      assert.ok(L.barX >= 0 && L.barX + G.BARRA_W <= L.ventana.width && L.barY >= 0 && L.barY + G.BARRA_H <= L.ventana.height);
      // el panel abierto (540 o 860) cabe en la ventana y toca la barra por su lado
      for (const ancho of [340, 540, 860]) {
        const l = G.izquierdaPanel(L, ancho);
        assert.ok(l >= 0 && l + ancho <= L.ventana.width, `panel ${ancho} fuera (monitor ${d.id})`);
      }
    }
  }
});

test('anclajes: izquierda crece a la derecha, derecha crece a la izquierda, abajo se abre hacia arriba', () => {
  const wa = PRIN.workArea;
  const izq = G.layout(barra(40, 40), wa);
  assert.strictEqual(G.izquierdaPanel(izq, 860), izq.barX);                       // borde izquierdo fijo
  const der = G.layout(barra(2560 - 340 - 40, 1392 - 95), wa);
  assert.strictEqual(der.v, 'abajo');
  assert.strictEqual(G.izquierdaPanel(der, 860) + 860, der.barX + G.BARRA_W);       // borde derecho fijo
  assert.strictEqual(der.barY + G.BARRA_H, der.ventana.height);                    // la barra abajo del todo de la ventana
  assert.strictEqual(G.altoMaxPanel(der), der.ventana.height);
  const def = G.layout(G.deFraccion(G.POR_DEFECTO, wa), wa);                      // por defecto = como antes (900 centrada arriba)
  assert.deepStrictEqual(def.ventana, { x: 830, y: 0, width: 900, height: 640 });
  assert.strictEqual(G.izquierdaPanel(def, 340), 280);
});

test('monitor vertical estrecho: el panel ancho se desplaza para caber', () => {
  const wa = VERT.workArea, L = G.layout(barra(-1040, 900), wa);                   // izquierda del vertical, mitad inferior
  assert.strictEqual(L.h, 'izq'); assert.strictEqual(L.v, 'abajo');
  assert.ok(contiene(wa, L.ventana));
  const l = G.izquierdaPanel(L, 860);
  assert.ok(l >= 0 && l + 860 <= L.ventana.width);
  const chico = { x: 0, y: 0, width: 800, height: 600 }, Lc = G.layout(barra(500, 500), chico);   // pantalla menor que la ventana
  assert.deepStrictEqual(Lc.ventana, { x: 0, y: 0, width: 800, height: 600 });
});

test('barra arrastrada fuera del área se recoloca dentro', () => {
  const L = G.layout(barra(4400, -50), DER.workArea);
  assert.deepStrictEqual({ x: L.barra.x, y: L.barra.y }, { x: 2560 + 1920 - 340, y: 0 });
});

test('posición guardada: fracción ida y vuelta, monitor por id o por bounds, o null si ya no existe', () => {
  const b = barra(2900, 700), f = G.aFraccion(b, DER.workArea), b2 = G.deFraccion(f, DER.workArea);
  assert.deepStrictEqual({ x: b2.x, y: b2.y }, { x: 2900, y: 700 });
  assert.strictEqual(G.elegirMonitor({ id: 2 }, MONS), DER);
  assert.strictEqual(G.elegirMonitor({ id: 99, bounds: { ...VERT.bounds } }, MONS), VERT);
  assert.strictEqual(G.elegirMonitor({ id: 99, bounds: { x: 9999, y: 0, width: 10, height: 10 } }, MONS), null);
  assert.strictEqual(G.elegirMonitor(null, MONS), null);
});

test('monitorDe: contiene el punto o el más cercano (huecos entre pantallas)', () => {
  assert.strictEqual(G.monitorDe({ x: -500, y: 1500 }, MONS), VERT);
  assert.strictEqual(G.monitorDe({ x: 3000, y: 500 }, MONS), DER);
  assert.strictEqual(G.monitorDe({ x: 3000, y: 1300 }, MONS), DER);               // debajo del de la derecha (hueco) → el más cercano
  assert.strictEqual(G.monitorDe(G.centroBarra(barra(1000, 10)), MONS), PRIN);
});

test('hit-testing: solo cuentan las partes visibles', () => {
  const T = 'rgba(0, 0, 0, 0)';
  const div = (x = {}) => ({ tag: 'DIV', fondo: T, imagen: 'none', bordeAncho: '0px', bordeColor: T, cursor: 'auto', opacidad: '1', ...x });
  assert.strictEqual(G.cadenaSolida([div(), div()]), false);                                   // hueco de #panel / #izq
  assert.strictEqual(G.cadenaSolida([div(), div({ fondo: 'rgba(8, 10, 14, 0.74)' })]), true);   // texto dentro de una tarjeta
  assert.strictEqual(G.cadenaSolida([div({ tag: 'CANVAS' })]), true);                          // el robot
  assert.strictEqual(G.cadenaSolida([div({ tag: 'BUTTON' })]), true);
  assert.strictEqual(G.cadenaSolida([div({ bordeAncho: '1px', bordeColor: 'rgba(255, 255, 255, 0.08)' })]), true);   // pill
  assert.strictEqual(G.cadenaSolida([div({ bordeAncho: '1px', bordeColor: 'transparent' })]), false);
  assert.strictEqual(G.cadenaSolida([div({ marcado: true })]), true);                          // data-solido (menús/popovers)
  assert.strictEqual(G.cadenaSolida([div({ fondo: 'rgb(0,0,0)' }), div({ opacidad: '0' })]), false);   // panel cerrándose (opacidad 0)
  assert.strictEqual(G.cadenaSolida([]), false);                                              // fuera de la ventana / body
});
