// Comprueba las prioridades y los tiempos sin abrir Electron ni esperar minutos.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const catalogo = fs.readFileSync(path.join(__dirname, '../app/animaciones-casco.js'), 'utf8');
  const fuente = fs.readFileSync(path.join(__dirname, '../app/vida-casco.js'), 'utf8').replace('./animaciones-casco.js', 'data:text/javascript;base64,' + Buffer.from(catalogo).toString('base64'));
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
  const rara = crearVidaCasco(() => 0);
  let reloj = 0;
  function rutinaCompleta() {
    const nombres = [];
    for (let i = 0; i < 5; i++) {
      if (rara.terminarSiLista(reloj)) return nombres;
      const accion = rara.paso({ahora:reloj, libre:true, ocupado:false});
      assert(accion); nombres.push(accion.nombre);
      reloj += accion.segundos * 1000 + 600;
    }
    assert.fail('La rutina no termina');
  }
  for (let i = 0; i < 3; i++) assert(!rutinaCompleta().includes('revision'));
  assert.equal(rutinaCompleta()[0], 'revision', 'La primera escena requiere tres rutinas normales');
  for (let i = 0; i < 6; i++) assert(!['revision','montaje','estornudo_explosivo'].includes(rutinaCompleta()[0]), 'Respeta el intervalo mínimo entre escenas');
  reloj += 240000;
  assert.equal(rutinaCompleta()[0], 'estornudo_explosivo', 'No repite la escena anterior');
  let semilla=731, relojCatalogo=0;
  const azar=()=>{semilla=(semilla*1664525+1013904223)>>>0;return semilla/4294967296};
  const extensa=crearVidaCasco(azar), usados=[];
  const lista=(await import('data:text/javascript;base64,'+Buffer.from(catalogo).toString('base64'))).ANIMACIONES_CASCO;
  const ids=new Set(lista.map(a=>a.id));
  for(let vuelta=0;vuelta<2000;vuelta++) {
    for(let paso=0;paso<5;paso++) {
      if(extensa.terminarSiLista(relojCatalogo)) break;
      const a=extensa.paso({ahora:relojCatalogo,libre:true,ocupado:false});assert(a);
      if(ids.has(a.nombre)) {
        assert(!usados.slice(-24).includes(a.nombre),'Evita repetir las últimas 24 animaciones del catálogo');
        usados.push(a.nombre);
      }
      relojCatalogo+=a.segundos*1000+600;
    }
    relojCatalogo+=300000;
  }
  assert.equal(new Set(usados).size,100,'La autonomía debe poder seleccionar las 100');
  console.log('OK: autonomía alcanza las 100 y evita las últimas 24');
  console.log('OK: prioridades, pausas, secuencias, variedad e interrupción');
})().catch(error => { console.error(error); process.exitCode = 1; });
