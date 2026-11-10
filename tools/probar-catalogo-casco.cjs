// Prueba el catálogo completo y sus límites sin GPU ni Electron.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, '../app/animaciones-casco.js'), 'utf8');
  const { ANIMACIONES_CASCO: lista, buscarAnimacionCasco, evaluarAnimacionCasco: evaluar } = await import('data:text/javascript;base64,' + Buffer.from(fuente).toString('base64'));
  assert.equal(lista.length, 100);
  assert.equal(new Set(lista.map(a => a.id)).size, 100, 'Cien identificadores únicos');
  assert.equal(new Set(lista.map(a => [a.ojos,a.trayecto,a.mecanica].join('|'))).size, 100, 'Cien combinaciones de comportamiento distintas');
  assert.equal(new Set(lista.map(a => a.familia)).size, 10);
  for (const familia of new Set(lista.map(a => a.familia))) assert.equal(lista.filter(a => a.familia === familia).length, 10);
  const neutra = p => {
    assert(p.cabeza.every(v => v === 0)); assert(p.mirada.every(v => v === 0));
    assert.equal(p.altura, 0); assert.equal(p.escala, 1); assert.equal(p.apertura, 0);
    assert(p.visor.every(v => v === 0));
    assert(Object.values(p.piezas).every(v => v.every(n => n === 0)));
  };
  const firmas = new Set();
  for (const a of lista) {
    assert.equal(buscarAnimacionCasco(a.id), a);
    const muestras = [];
    for (let i = 0; i <= 100; i++) {
      const p = evaluar(a, i / 100);
      assert([...p.cabeza,...p.mirada,p.altura,p.escala,p.apertura,...p.visor,...Object.values(p.piezas).flat()].every(Number.isFinite), a.id + ': pose finita');
      assert(p.cabeza.every(v => Math.abs(v) <= .5));
      assert(p.escala >= .9 && p.escala <= 1.1);
      assert(p.apertura >= 0 && p.apertura <= .55);
      assert(Object.values(p.piezas).every(v => v.slice(0,3).every(n => Math.abs(n) <= .3) && v.slice(3).every(n => Math.abs(n) <= 1)));
      neutra(evaluar(a, i / 100, true));
      if (i % 20 === 0) muestras.push(p);
    }
    neutra(evaluar(a, 0)); neutra(evaluar(a, 1)); neutra(evaluar(a, 2));
    firmas.add(JSON.stringify(muestras));
  }
  assert.equal(firmas.size, 100, 'Las trayectorias muestreadas también deben ser distintas');
  assert.equal(buscarAnimacionCasco('no-existe'), null);
  console.log('OK: 100 animaciones, 10 familias, trayectorias únicas, 10 100 poses acotadas, retorno y movimiento reducido');
})().catch(e => { console.error(e); process.exitCode = 1; });
