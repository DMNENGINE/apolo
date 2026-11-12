const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {crearInstagram,publicacionInstagram,idMedia,mediosDePublicacion}=require('../../main/snapgrab-instagram');
const ejemplo={items:[{caption:{text:'Post de prueba'},carousel_media:[{media_type:1,image_versions2:{candidates:[{url:'https://scontent.cdninstagram.com/foto.jpg',width:1000,height:1000}]}},{media_type:2,video_versions:[{url:'https://video.cdninstagram.com/video.mp4',width:720,height:1280}]}]}]};
function montar(fetch){let url='';const opciones=[];const w={isDestroyed:()=>false,loadURL:async u=>{url=u},show(){},focus(){},close(){},once(){},webContents:{getURL:()=>url,setWindowOpenHandler(){},on(){}}};
 return {opciones,ig:crearInstagram({crearVentana:o=>{opciones.push(o);return w},obtenerSesion:()=>({fetch}),miniatura:()=>''})};}
test('identifica el post exacto y rechaza enlaces ajenos',()=>{
 assert.equal(publicacionInstagram('https://www.instagram.com/reel/DQJ9PrwAcXi/?igsh=publico').codigo,'DQJ9PrwAcXi');assert.equal(idMedia('BA'),'64');
 assert.equal(idMedia('B1LbfVPlwIA'),'2110901750722920960');assert.equal(idMedia('CCQQsCXjOaBfS3I2PpqsNkxElV9DXj61vzo5xs0'),'2346448800803776129');
 assert.equal(publicacionInstagram('https://falso.test/?instagram.com/p/Ab'),null);assert.equal(publicacionInstagram('https://www.instagram.com/accounts/login/'),null);
 assert.throws(()=>mediosDePublicacion({items:[{media_type:2,video_versions:[{url:'https://otra.test/video.mp4'}]}]}),/archivos/);
});
test('lee la publicación con una sesión propia sin exportar cookies',async()=>{
 const peticiones=[];const {ig,opciones}=montar(async(u,o)=>{peticiones.push({u,o});return u.includes('/info/')?Response.json(ejemplo):new Response('foto');});
 await ig.abrir('https://www.instagram.com/p/DQJ9PrwAcXi/');const r=await ig.leer('https://www.instagram.com/p/DQJ9PrwAcXi/').promesa;
 assert.equal(r.medios.length,2);assert(r.info.video&&r.info.fotos);assert.equal(opciones[0].webPreferences.partition,'persist:apolo-snapgrab-instagram');
 assert.equal(peticiones[0].o.credentials,'include');assert(!('Cookie' in peticiones[0].o.headers));
});
test('no confunde una sesión pendiente o un acceso bloqueado con un post borrado',async()=>{
 const {ig}=montar(async()=>new Response('',{status:401}));await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/inicia sesión/);
 await ig.abrir('https://www.instagram.com/p/Ab/');await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/Completa el inicio/);
 await assert.rejects(ig.leer('https://www.instagram.com/p/Otro/').promesa,/esta publicación/);
});
test('guarda solo los medios seleccionados y detecta una respuesta HTML de bloqueo',async t=>{
 const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'ig-snapgrab-'));t.after(()=>fs.rmSync(carpeta,{recursive:true,force:true}));
 const {ig}=montar(async u=>u.endsWith('.jpg')?new Response('foto-real',{headers:{'content-type':'image/jpeg'}}):new Response('<html>login</html>',{headers:{'content-type':'text/html'}}));
 const lectura=mediosDePublicacion(ejemplo);
 const r=await ig.descargar({lectura,carpeta,modo:'todo'}).promesa;assert.equal(r.archivos.length,1);assert(r.advertencia.includes('1 archivo'));assert.equal(fs.readFileSync(r.archivos[0],'utf8'),'foto-real');
 await assert.rejects(ig.descargar({lectura,carpeta:fs.mkdtempSync(path.join(carpeta,'video-')),modo:'video'}).promesa,/no entregó/);
});
test('cancelar interrumpe la petición de Instagram y no deja un archivo parcial',async t=>{
 const carpeta=fs.mkdtempSync(path.join(os.tmpdir(),'ig-cancelar-'));t.after(()=>fs.rmSync(carpeta,{recursive:true,force:true}));
 const {ig}=montar((_u,o)=>new Promise((_r,rechazar)=>o.signal.addEventListener('abort',()=>rechazar(new Error('abort')),{once:true})));
 const trabajo=ig.descargar({lectura:mediosDePublicacion(ejemplo),carpeta,modo:'fotos'});trabajo.cancelar();await assert.rejects(trabajo.promesa,/cancelada/);assert.equal(fs.readdirSync(carpeta).length,0);
});
test('cerrar Instagram primero y después limpiar SnapGrab no toca objetos destruidos',async()=>{
 const {EventEmitter}=require('node:events');const ventanas=[];
 class Ventana extends EventEmitter{constructor(){super();this.muerta=false;this.webContents={setWindowOpenHandler(){},on(){}};ventanas.push(this);}isDestroyed(){return this.muerta}async loadURL(){}show(){assert(!this.muerta)}focus(){}close(){if(this.muerta)throw new Error('Object has been destroyed');this.muerta=true;this.emit('closed');}}
 const ig=crearInstagram({crearVentana:()=>new Ventana()});
 await ig.abrir('https://www.instagram.com/p/Ab/');ventanas[0].close();assert.doesNotThrow(()=>{ig.cerrar();ig.cerrar();});
 await ig.abrir('https://www.instagram.com/p/Ab/');assert.equal(ventanas.length,2);ig.cerrar();assert(ventanas[1].muerta);
});
test('el cierre tardío de una ventana vieja no elimina la nueva',async()=>{
 const {EventEmitter}=require('node:events');const ventanas=[];
 class Ventana extends EventEmitter{constructor(){super();this.muerta=false;this.webContents={setWindowOpenHandler(){},on(){}};ventanas.push(this);}isDestroyed(){return this.muerta}async loadURL(){}show(){}focus(){}close(){this.muerta=true;}}
 const ig=crearInstagram({crearVentana:()=>new Ventana()});await ig.abrir('https://www.instagram.com/p/Ab/');ventanas[0].close();await ig.abrir('https://www.instagram.com/p/Ab/');ventanas[0].emit('closed');ig.cerrar();assert(ventanas[1].muerta);
});
test('cerrar durante la carga rechaza la apertura sin intentar mostrar la ventana destruida',async()=>{
 const {EventEmitter}=require('node:events');let terminar;
 const w=new EventEmitter();w.muerta=false;w.isDestroyed=()=>w.muerta;w.webContents={setWindowOpenHandler(){},on(){}};w.loadURL=()=>new Promise(r=>{terminar=r});w.show=()=>assert.fail('No debe mostrar la ventana cerrada');w.close=()=>{w.muerta=true;w.emit('closed')};
 const ig=crearInstagram({crearVentana:()=>w});const apertura=ig.abrir('https://www.instagram.com/p/Ab/');w.close();terminar();await assert.rejects(apertura,/se cerró/);assert.doesNotThrow(()=>ig.cerrar());
});
