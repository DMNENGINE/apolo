const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { guardarConfig } = require('../admin');
const { esOficial, entornoHijo } = require('../plugins');
const { crearEjecuciones } = require('../ejecuciones');

test('plugins: solo los que vienen con la app cuentan como oficiales; los de terceros siguen bloqueados sin modelo de permisos', () => {
  const app = path.resolve(__dirname, '..', '..', 'plugins');
  assert.equal(esOficial({ tipo: 'local', fuente: path.join(app, 'telegram') }), true);
  assert.equal(esOficial({ tipo: 'local', fuente: path.join(app, '..', 'plugins-falsos', 'x') }), false);
  assert.equal(esOficial({ tipo: 'local', fuente: app }), false, 'la carpeta raíz no es un plugin');
  assert.equal(esOficial({ tipo: 'github', fuente: 'alguien/telegram' }), false);
  assert.equal(esOficial(null), false);
  const viejo = { lectura: [], escritura: [], shell: false, node: '__no_existe__' };
  const ver = Object.getOwnPropertyDescriptor(process.versions, 'node');
  Object.defineProperty(process.versions, 'node', { value: '20.18.3', configurable: true });
  try {
    assert.throws(() => entornoHijo(viejo), /terceros/);
    assert.equal(entornoHijo({ ...viejo, oficial: true }).sandbox, false);
  } finally { Object.defineProperty(process.versions, 'node', ver); }
});

test('configuración: si falla la 2.ª clave, la 1.ª vuelve a como estaba en la bóveda', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-boveda-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ proveedores: { a: { tipo: 'openai' }, b: { tipo: 'openai' } } }));
  const datos = new Map([['proveedor:a', 'clave-a-vieja']]);
  const boveda = { leer: n => datos.get(n) ?? null, guardar(n, v) { if (n === 'proveedor:b') throw new Error('falla'); datos.set(n, v); }, borrar: n => datos.delete(n) };
  const cfg = { dir, proveedores: { a: { tipo: 'openai' }, b: { tipo: 'openai' } }, permisos: {}, boveda };
  assert.throws(() => guardarConfig(cfg, { proveedores: { a: { apiKey: 'clave-a-nueva' }, b: { apiKey: 'clave-b' } } }), e => e.status === 503);
  assert.equal(datos.get('proveedor:a'), 'clave-a-vieja');
  assert.equal(datos.has('proveedor:b'), false);
});

test('ejecuciones: la retención borra lo terminado antiguo y conserva lo incierto y lo reciente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-ejec-')), cfg = { dir, ejecuciones: { retencionDias: 30 } };
  const e = crearEjecuciones({ cfg }), s = { id: 'ses' };
  const vieja = e.iniciar(s, 'vieja'); e.cerrar(vieja, 'completada'); e.artefacto(vieja, 'texto');
  const incierta = e.iniciar(s, 'incierta'); const o = e.empezar(incierta, { id: 'x', name: 'shell', args: { c: 1 } }, 'ejecucion');
  e.terminar(incierta, o, { estado: 'incierto', verificado: false, codigo: '' }); e.cerrar(incierta, 'incompleta');
  const reciente = e.iniciar(s, 'reciente'); e.cerrar(reciente, 'completada');
  const base = path.join(dir, 'ejecuciones'), antiguo = (Date.now() - 40 * 86400000) / 1000;
  for (const r of [vieja, incierta]) fs.utimesSync(path.join(base, r.id + '.json'), antiguo, antiguo);
  crearEjecuciones({ cfg });
  assert.equal(fs.existsSync(path.join(base, vieja.id + '.json')), false);
  assert.equal(fs.existsSync(path.join(base, vieja.id)), false, 'sus artefactos también');
  assert.equal(fs.existsSync(path.join(base, incierta.id + '.json')), true);
  assert.equal(fs.existsSync(path.join(base, reciente.id + '.json')), true);
});
