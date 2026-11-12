const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {crearInstagram,publicacionInstagram,idMedia,mediosDePublicacion}=require('../../main/snapgrab-instagram');
const ejemplo={items:[{caption:{text:'Post de prueba'},carousel_media:[{media_type:1,image_versions2:{candidates:[{url:'https://scontent.cdninstagram.com/foto.jpg',width:1000,height:1000}]}},{media_type:2,video_versions:[{url:'https://video.cdninstagram.com/video.mp4',width:720,height:1280}]}]}]};
function montar(fetch){let url='';const pedidos=[];
 const n={conectado:()=>true,estado:()=>({navegador:'Google Chrome'}),orden:async(op,args)=>{
  pedidos.push({op,args});if(op==='pestanas')return url?[{id:10,url,activa:true}]:[];
  if(op==='abrir'){url=args.url;return {ok:true};}
  if(op==='instagram'){const r=await fetch('https://www.instagram.com/info/',{credentials:'include',headers:{}});if(!r.ok)throw new Error('Inicia sesion en Chrome');return r.json();}
 }};
 return {pedidos,n,ig:crearInstagram({abrirExterno:async u=>{url=u;return {ok:true}},navegador:n,obtenerSesion:()=>({fetch}),miniatura:()=>''})};}

test('identifica el post exacto y rechaza enlaces ajenos',()=>{
 assert.equal(publicacionInstagram('https://www.instagram.com/reel/DQJ9PrwAcXi/?igsh=publico').codigo,'DQJ9PrwAcXi');assert.equal(idMedia('BA'),'64');
 assert.equal(idMedia('B1LbfVPlwIA'),'2110901750722920960');assert.equal(idMedia('CCQQsCXjOaBfS3I2PpqsNkxElV9DXj61vzo5xs0'),'2346448800803776129');
 assert.equal(publicacionInstagram('https://falso.test/?instagram.com/p/Ab'),null);assert.equal(publicacionInstagram('https://www.instagram.com/accounts/login/'),null);
 assert.throws(()=>mediosDePublicacion({items:[{media_type:2,video_versions:[{url:'https://otra.test/video.mp4'}]}]}),/archivos/);
});
test('lee la publicación desde Chrome sin exportar cookies',async()=>{
 const peticiones=[];const {ig,pedidos}=montar(async(u,o)=>{peticiones.push({u,o});return u.includes('/info/')?Response.json(ejemplo):new Response('foto');});
 await ig.abrir('https://www.instagram.com/p/DQJ9PrwAcXi/');const r=await ig.leer('https://www.instagram.com/p/DQJ9PrwAcXi/').promesa;
 assert.equal(r.medios.length,2);assert(r.info.video&&r.info.fotos);assert.equal(pedidos.find(p=>p.op==='instagram').args.pestana,10);
 assert.equal(peticiones[0].o.credentials,'include');assert(!('Cookie' in peticiones[0].o.headers));
});
test('no confunde una sesión pendiente o un acceso bloqueado con un post borrado',async()=>{
 const {ig}=montar(async()=>new Response('',{status:401}));await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/Abrir en Chrome/);
 await ig.abrir('https://www.instagram.com/p/Ab/');await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/Inicia sesion/);
 await assert.rejects(ig.leer('https://www.instagram.com/p/Otro/').promesa,/perfil elegido/);
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
test('abrir fuera de Electron no exige conexión y cerrar SnapGrab no cierra Chrome',async()=>{
 const enlaces=[];let cerradas=0;const ig=crearInstagram({abrirExterno:async url=>{enlaces.push(url);return {ok:true,close:()=>cerradas++}}});
 await ig.abrir('https://www.instagram.com/reel/Ab/');ig.cerrar();ig.cerrar();assert.equal(new URL(enlaces[0]).pathname,'/p/Ab/');assert(new URL(enlaces[0]).hash.startsWith('#apolo-snapgrab='));assert.equal(cerradas,0);
 await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/extensión/);
});
test('abre Chrome sin cambiar el perfil ni usar una consola',async()=>{
 const {abrirChrome}=require('../../main/abrir-chrome'),{EventEmitter}=require('node:events');let pedido;
 await abrirChrome('https://www.instagram.com/p/Ab/',{perfil:null,entorno:{PROGRAMFILES:'C:/Navegadores'},existe:()=>true,lanzar:(exe,args,opciones)=>{pedido={exe,args,opciones};const p=new EventEmitter();p.unref=()=>{};queueMicrotask(()=>p.emit('spawn'));return p;}});
 assert.deepEqual(pedido.args,['https://www.instagram.com/p/Ab/']);assert.equal(pedido.opciones.shell,undefined);assert(pedido.opciones.windowsHide);
});
test('fija el perfil elegido con profile-directory sin crear otro perfil',async()=>{
 const {abrirChrome}=require('../../main/abrir-chrome'),{EventEmitter}=require('node:events');let args;
 await abrirChrome('https://www.instagram.com/p/Ab/',{perfil:'Profile 2',entorno:{PROGRAMFILES:'C:/Navegadores'},existe:()=>true,lanzar:(_exe,a)=>{args=a;const p=new EventEmitter();p.unref=()=>{};queueMicrotask(()=>p.emit('spawn'));return p;}});
 assert.deepEqual(args,['--profile-directory=Profile 2','https://www.instagram.com/p/Ab/']);assert(!args.some(a=>a.startsWith('--user-data-dir')));
 assert.throws(()=>abrirChrome('https://www.instagram.com/',{perfil:'../../otro'}),/Perfil/);
});
test('no lee el mismo post abierto en otra cuenta sin la marca de la apertura elegida',async()=>{
 let enlace;const n={conectado:()=>true,estado:()=>({navegador:'Google Chrome'}),orden:async()=>[{id:3,url:'https://www.instagram.com/p/Ab/',activa:true}]};
 const ig=crearInstagram({navegador:n,abrirExterno:async u=>{enlace=u;return {ok:true};}});await ig.abrir('https://www.instagram.com/p/Ab/');await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/perfil elegido/);assert(new URL(enlace).hash);
});
test('no usa una cuenta de otro navegador ni selecciona una pestaña duplicada al azar',async()=>{
 let enlace;const n={conectado:()=>true,estado:()=>({navegador:'Microsoft Edge'}),orden:()=>assert.fail('No debe leer Edge')};const ig=crearInstagram({navegador:n,abrirExterno:async u=>{enlace=u}});await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/Chrome/);
 await ig.abrir('https://www.instagram.com/p/Ab/');n.estado=()=>({navegador:'Google Chrome'});n.orden=async()=>[{id:1,url:enlace},{id:2,url:enlace}];await assert.rejects(ig.leer('https://www.instagram.com/p/Ab/').promesa,/varias pestañas/);
});
test('la extensión devuelve solo medios y detecta una navegación durante la lectura',async()=>{
 const vm=require('node:vm');const location={hostname:'www.instagram.com',pathname:'/p/Ab/',origin:'https://www.instagram.com'};let opciones;
 const datos={...ejemplo,token:'NO_EXPORTAR'};const leer=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../extension/instagram.js'),'utf8')+';leerInstagramEnPestana',{location,AbortSignal,fetch:async(_u,o)=>{opciones=o;return Response.json(datos);}});
 const r=await leer('Ab');assert(!JSON.stringify(r).includes('NO_EXPORTAR'));assert.equal(opciones.credentials,'include');assert(!('Cookie' in opciones.headers));assert.equal(r.items[0].carousel_media.length,2);
 location.pathname='/p/Otro/';await assert.rejects(leer('Ab'),/ya no muestra/);
});
