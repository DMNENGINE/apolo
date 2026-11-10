// Comprueba las prioridades y los tiempos sin abrir Electron ni esperar minutos.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, '../app/vida-casco.js'), 'utf8');
  const { crearVidaCasco } = await import('data:text/javascript;base64,' + Buffer.from(fuente).toString('base64'));
  const vida = crearVidaCasco(() => 0);
  const paso = (ahora, libre = true, ocupado = false) => vida.paso({ ahora, libre, ocupado });
  assert.equal(paso(0, false), null, 'Sin actividad si hay trabajo, sueño o interacción');
  assert.equal(paso(0, true, true), null, 'No pisa un gesto ocupado');
  assert.deepEqual(paso(0), { nombre: 'mirar', segundos: 2.5 });
  assert.equal(paso(2500), null, 'Respeta la pausa entre expresiones');
  assert.equal(paso(3100).nombre, 'curioso');
  assert.equal(paso(6700).nombre, 'guino');
  assert.equal(vida.terminarSiLista(8000), false);
  assert.equal(vida.terminarSiLista(8700), true);
  assert.equal(paso(10000).nombre, 'pensativo', 'No repite la rutina anterior');
  assert.equal(vida.cancelar(), true, 'Interrumpe una rutina activa');
  assert.equal(vida.cancelar(), false, 'Cancelar dos veces no pisa otro gesto');
  assert.equal(paso(11000).nombre, 'mirar', 'Tras cancelar empieza una rutina nueva');
  console.log('OK: prioridades, pausas, secuencias, variedad e interrupción');
})().catch(error => { console.error(error); process.exitCode = 1; });
