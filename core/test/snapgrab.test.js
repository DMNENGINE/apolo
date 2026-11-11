const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {paginaObjetivo,urlPublicacion,iniciarTrabajo}=require('../../main/snapgrab-motor');
test('SnapGrab usa la ventana del clic aunque otra pestaña figure activa',async()=>{
 const n={conectado:()=>true,orden:async()=>[{titulo:'Otra',url:'https://otra.test',activa:true},{titulo:'Reel elegido',url:'https://ejemplo.test/reel/123'}]};
 const r=await paginaObjetivo(n,{titulo:'Reel elegido - Google Chrome'});assert.equal(r.url,'https://ejemplo.test/reel/123');
});
test('SnapGrab no cambia a otra página ante duplicados, desconexión o sitio protegido',async()=>{
 const tabs=[{titulo:'Duplicada',url:'https://ejemplo.test/a'},{titulo:'Duplicada',url:'https://ejemplo.test/b'}];
 await assert.rejects(paginaObjetivo({conectado:()=>true,orden:async()=>tabs},{titulo:'Duplicada - Chrome'}),/Varias pestañas/);
 await assert.rejects(paginaObjetivo({conectado:()=>false},{}),/Windows/);
 await assert.rejects(paginaObjetivo({conectado:()=>true,orden:async()=>tabs.slice(0,1),protegido:()=>true},{titulo:'Duplicada'}),/protegida/);
 for(const u of ['file:///C:/archivo','javascript:alert(1)','https://usuario:clave@ejemplo.test'])assert.throws(()=>urlPublicacion(u));
});
test('SnapGrab identifica cualquier navegador desde Windows sin consultar la extensión',async()=>{
 const r=await paginaObjetivo({conectado:()=>false,orden:()=>{throw new Error('No se debe consultar')}},{hwnd:'123',titulo:'Foto - Otro navegador'},async()=>({url:'https://imagenes.test/foto.png',captura:'png',tipoCaptura:'imagen'}));
 assert.equal(r.url,'https://imagenes.test/foto.png');assert.equal(r.tipoCaptura,'imagen');
});
test('SnapGrab mantiene la foto visible disponible aunque no haya dirección ni extensión',async()=>{
 const r=await paginaObjetivo(undefined,{hwnd:'456',app:'navegador-desconocido',titulo:'Una foto'},async()=>({captura:'png',ancho:500,alto:300}));
 assert.equal(r.url,'');assert.equal(r.captura,'png');assert.equal(r.titulo,'Una foto');
});
test('una extensión conectada a otro navegador no bloquea el recorte de la ventana del clic',async()=>{
 const r=await paginaObjetivo({conectado:()=>true,orden:async()=>[{titulo:'Otra página',url:'https://otra.test'}]},{hwnd:'123',titulo:'Mi página'},async()=>({captura:'png'}));
 assert.equal(r.url,'');assert(r.captura);assert(!r.url.includes('otra.test'));
});
function procesoFalso(){const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.stdin=new PassThrough();p.pid=null;p.kill=()=>setImmediate(()=>p.emit('close',1));return p;}
test('SnapGrab procesa JSON fragmentado y confirma archivos existentes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snapgrab-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const archivo=path.join(dir,'vídeo.mp4');fs.writeFileSync(archivo,'fixture');const p=procesoFalso(),eventos=[];
 const trabajo=iniciarTrabajo({dir,url:'https://ejemplo.test/video',accion:'descargar',modo:'video',carpeta:dir,lanzar:()=>p,evento:e=>eventos.push(e)});
 const salida=JSON.stringify({evento:'resultado',archivos:[archivo]})+'\n';p.stdout.write('{"evento":"progreso","porcentaje":25}\n'+salida.slice(0,10));p.stdout.write(salida.slice(10));p.emit('close',0);
 assert.deepEqual((await trabajo.promesa).archivos,[archivo]);assert.equal(eventos[0].porcentaje,25);
});
test('SnapGrab rechaza éxito falso, archivos fuera del destino y modos desconocidos',async()=>{
 for(const archivos of [[],[__filename]]){const p=procesoFalso();const j=iniciarTrabajo({dir:__dirname,url:'https://ejemplo.test/',accion:'descargar',modo:'video',carpeta:path.join(os.tmpdir(),'otro-destino'),lanzar:()=>p});p.stdout.write(JSON.stringify({evento:'resultado',archivos})+'\n');p.emit('close',0);await assert.rejects(j.promesa,/archivos válidos/);}
 assert.throws(()=>iniciarTrabajo({url:'https://ejemplo.test/',accion:'descargar',modo:'inventado'}),/no válida/);
});
test('SnapGrab propaga errores reales del motor y permite cancelar',async()=>{
 const p=procesoFalso();const j=iniciarTrabajo({dir:__dirname,url:'https://ejemplo.test/',accion:'analizar',lanzar:()=>p});p.stdout.write('{"evento":"error","error":"Requiere sesión"}\n');p.emit('close',1);await assert.rejects(j.promesa,/Requiere sesión/);
 const c=procesoFalso();const k=iniciarTrabajo({dir:__dirname,url:'https://ejemplo.test/',accion:'analizar',lanzar:()=>c});k.cancelar();await assert.rejects(k.promesa,/cancelada/);
});
