const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function panel(api) {
  const els = new Map(), esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ctx = vm.createContext({ MM_R: 32, P: {}, VISTAS: {}, mmObj() {}, URL, AbortController, performance, tr: x => x, esc, ic: () => '', api,
    document: { createElement: () => ({}), head: { appendChild() {} } }, $: s => { if (!els.has(s)) els.set(s, {}); return els.get(s); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/trading.js'), 'utf8'), ctx);
  const vista = ctx.VISTAS.trading; vista.v = {}; vista.ciclo = 1; vista.detalles = new Map();
  return { ctx, vista, els };
}
const agente = (nodo = 'pi') => ({ id: 1, nodo, nombre: 'fixture', estrategia: '<b>remoto</b>', marco: '1m', riesgo_pct: 1, trades: 0, ganados: 0, estado: 'parado' });
test('trading UI: texto remoto se escapa y enlaces solo HTTP(S)', async () => {
  const p = panel(); await p.vista.ficha(agente());
  assert.ok(p.els.get('#trFicha').innerHTML.includes('&lt;b&gt;remoto&lt;/b&gt;'));
  assert.equal(vm.runInContext('trEnlace("javascript:alert(1)")', p.ctx), '#');
  assert.equal(vm.runInContext('trEnlace("https://u:p@x.invalid")', p.ctx), '#');
  assert.equal(vm.runInContext('trEnlace("https://noticia.invalid/x")', p.ctx), 'https://noticia.invalid/x');
});
test('trading UI: salir durante una consulta fallida no toca otra vista', async () => {
  let rechazar; const p = panel(() => new Promise((ok, mal) => { rechazar = mal; }));
  const carga = p.vista.cargar(); p.vista.v = null; rechazar(new Error('sin red')); await carga;
  assert.equal(p.els.size, 0); assert.equal(p.vista.carga, null);
});
test('trading UI: no solapa el sondeo y descarta respuestas de un ciclo anterior', async () => {
  let resolver, llamadas = 0; const p = panel(() => { llamadas++; return new Promise(ok => { resolver = ok; }); });
  const a = p.vista.cargar(); await p.vista.cargar(); assert.equal(llamadas, 1);
  p.vista.ciclo++; resolver({}); await a; assert.equal(p.els.size, 0);
});
test('trading UI: detalles vinculados a nodo e id, sin mezclar cache', async () => {
  let resolver; const p = panel(() => new Promise(ok => { resolver = ok; }));
  p.vista.datos = { nodos: [{ nodo: 'pi', local: true }, { nodo: 'pc', local: false }] };
  p.vista.sel = agente('pi'); const carga = p.vista.ficha(p.vista.sel);
  p.vista.sel = agente('pc');
  resolver({ genoma: { entrada: '<b>genoma</b>' }, intentos_lista: [], lecciones: [] }); await carga;
  assert.equal(p.els.get('#trFicha').innerHTML, undefined); assert.equal(p.vista.detalles.size, 0);
  p.vista.detalles.set(JSON.stringify(['pi', 1]), 'SOLO_PI');
  await p.vista.ficha(p.vista.sel, true); assert.ok(!p.els.get('#trFicha').innerHTML.includes('SOLO_PI'));
});
