// Comprueba el motor compartido sin leer páginas ni activar las arañas reales.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const fuente = fs.readFileSync('extension/arana-motor.js', 'utf8');
assert.equal(fuente, fs.readFileSync('app/arana-motor.js', 'utf8'), 'La copia de la isla debe coincidir');
function motor() {
  let semilla = 17; const matematicas = Object.create(Math);
  matematicas.random = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);
  const contexto = vm.createContext({ Math: matematicas, performance: { now: () => 0 } });
  vm.runInContext(fuente, contexto); return contexto.AranaMotor;
}
const M = motor(), a = M.crear('lectora', '#3df2ff', 10, 20);
assert.equal(new Set(a.patas.map(p => p.px + ',' + p.py)).size, 8, 'Nace con ocho apoyos separados');
a.patas.forEach((p,k) => { const r = M.reposo(a,k); assert(Math.hypot(p.px-r[0],p.py-r[1]) < 1e-9); });
const trepadora = M.crear('isla','#ffffff',0,120,{vel:60,sinPausas:true});
trepadora.hilo={x:0,y:0};trepadora.ruta=[{x:0,y:0,colgada:true}];
for(let i=0;i<60;i++) M.mover(trepadora,1/60);
assert(Math.sin(trepadora.ang)<-.9,'Al subir debe mirar hacia el nido');
assert(trepadora.colgada);
function recorrer(fps) {
  const m=motor(), ara=m.crear('isla','#ffffff',0,0,{vel:120,sinPausas:true});
  ara.proxPausa=0;ara.ruta=[{x:1000,y:0}];
  for(let i=0;i<fps*2;i++)m.mover(ara,1/fps);
  assert.equal(ara.pausa,0,'Las rutas del casco no sufren pausas aleatorias');return ara;
}
assert(Math.abs(recorrer(30).x-recorrer(60).x)<8,'El avance debe ser comparable a 30 y 60 fps');
const final=M.crear('isla','#ffffff',0,0,{sinPausas:true});let llegadas=0;
final.ruta=[{x:0,y:0,r:2,al:()=>llegadas++}];M.mover(final,.016);M.mover(final,.016);
assert.equal(final.r,2,'Se encoge completamente al entrar');assert.equal(llegadas,1);
final.fuera=true;for(let i=0;i<100;i++)M.mover(final,.05);assert.equal(final.alpha,0);
const suave=M.crear('lectora','#ffffff',0,0,{reducido:true});suave.animo='contenta';suave.ruta=[{x:60,y:0}];
for(let i=0;i<120;i++)M.mover(suave,1/60);
assert.equal(suave.salto,0);assert.equal(suave.pausa,0);
assert([suave.x,suave.y,suave.ang,...suave.patas.flatMap(p=>[p.px,p.py])].every(Number.isFinite));
console.log('OK: apoyos, trepado, cadencia, rutas sin pausas, encogimiento, callbacks, fundido y movimiento reducido');
