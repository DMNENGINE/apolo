const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { crearEjecuciones } = require('../ejecuciones');

test('ejecuciones: un incierto bloquea el efecto repetido, pero no para siempre si su ejecución ya no corre', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-ejec-')), cfg = { dir, ejecuciones: { bloqueoHoras: 6 } };
  const e = crearEjecuciones({ cfg }), s = { id: 'sesion1', tareaId: 'tarea-backup' };
  const c = n => ({ id: 'c' + n, name: 'shell', args: { comando: 'python backup.py' } });
  const r1 = e.iniciar(s, 'backup'); const o1 = e.empezar(r1, c(1), 'ejecucion');
  e.terminar(r1, o1, { estado: 'incierto', verificado: false, codigo: '' }); e.cerrar(r1, 'incompleta');
  const r2 = e.iniciar(s, 'backup');
  assert.throws(() => e.empezar(r2, c(2), 'ejecucion'), /incierta/, 'recién pasado: no se repite');
  const lock = path.join(dir, 'ejecuciones', 'bloqueos'), f = path.join(lock, fs.readdirSync(lock)[0]), viejo = (Date.now() - 7 * 3600000) / 1000;
  fs.utimesSync(f, viejo, viejo);
  const o2 = e.empezar(r2, c(3), 'ejecucion');
  assert.equal(o2.retomaIncierta, o1.id);
});
