const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {destinoArana}=require('../../main/menu-aranas');
function montar(t,{soltar=async()=> 'Informe de prueba',capturarTexto,abrirSnapGrab}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apolo-menu-test-'));
 t.after(()=>{if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('apolo-menu-test-'))fs.rmSync(dir,{recursive:true,force:true});});
 const handlers=new Map(),on=new Map(),ventanas=[],mensajes=[],pedidos=[];
 class Ventana extends EventEmitter{
  constructor(opciones){super();this.opciones=opciones;this.webContents=new EventEmitter();this.muerta=false;ventanas.push(this);}
  isDestroyed(){return this.muerta}destroy(){this.muerta=true}setAlwaysOnTop(){}loadFile(){}show(){}moveTop(){}focus(){}isFocused(){return true}
 }
 const electron={BrowserWindow:Ventana,ipcMain:{handle:(n,f)=>handlers.set(n,f),on:(n,f)=>on.set(n,f)},screen:{screenToDipPoint:p=>p,getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1280,height:720}})},shell:{openExternal:async()=>{}}};
 const modulo={exports:{}},n={cfg:{},aranas:{soltar:async a=>{pedidos.push(a);return soltar(a)}},navegador:{conectado:()=>true}};
 const requireFalso=id=>id==='electron'?electron:id==='./ipc-seguro'?{permitir(){}}:id==='./snapgrab'&&abrirSnapGrab?{abrirSnapGrab}:id.startsWith('./')?require(path.resolve(__dirname,'../../main',id)):require(id);
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../main/menu-apolo.js'),'utf8'),{module:modulo,exports:modulo.exports,require:requireFalso,process,console,setTimeout,clearTimeout});
 const menu=modulo.exports.crearMenuApolo({dir:path.resolve(__dirname,'../..'),datos:()=>dir,nucleo:()=>n,capturarTexto,handleText:async texto=>{mensajes.push(texto);return{ok:true}},panelUrl:r=>'http://localhost/#/'+r,decir:t=>mensajes.push(t),log:()=>{}});
 const abrir=c=>{menu.abrir({x:1200,y:680,app:'explorer',seleccion:[],...c});return ventanas.at(-1)};
 const invocar=(canal,a,v=ventanas.at(-1))=>handlers.get('menu-apolo-'+canal)({sender:v.webContents},a);
 t.after(()=>menu.parar());return{dir,n,menu,abrir,invocar,ventanas,mensajes,pedidos};
}
test('una selección múltiple nunca se sustituye por la pestaña activa',t=>{
 const{abrir,invocar,n}=montar(t);abrir({seleccion:['D:/uno.js','D:/dos.js']});const c=invocar('contexto');
 assert.equal(c.aranas.codigo.disponible,false);assert.throws(()=>destinoArana('codigo',c,n),/único archivo/);
});
test('el menú acepta un enlace de SnapGrab sin navegador ni ventana identificada',async t=>{
 let pedido;const {abrir,invocar}=montar(t,{abrirSnapGrab:async a=>{pedido=a;return {ok:true};}});
 abrir({app:'notepad',hwnd:undefined});const r=await invocar('ejecutar',{tipo:'snapgrab',url:'spotify:track:Ab123'});
 assert.equal(r.ok,true);assert.equal(pedido.url,'https://open.spotify.com/track/Ab123');
});
test('un enlace inválido no cierra el menú ni ejecuta una petición a APOLO',async t=>{
 const {abrir,invocar,mensajes}=montar(t);const w=abrir({});const r=await invocar('ejecutar',{tipo:'snapgrab',url:'javascript:alert(1)'});
 assert.equal(r.ok,false);assert.equal(w.muerta,false);assert.equal(mensajes.length,0);
});
test('un archivo de código se entrega como archivo al núcleo',async t=>{
 const{dir,abrir,invocar,pedidos,mensajes}=montar(t,{soltar:async()=> 'Informe de prueba\nCOBERTURA INCOMPLETA'});const archivo=path.join(dir,'código con espacios.js');fs.writeFileSync(archivo,'const a=1');
 abrir({seleccion:[archivo]});await invocar('ejecutar',{tipo:'arana',arana:'codigo'});
 assert.equal(pedidos.length,1);assert.equal(pedidos[0].archivo,archivo);assert.equal(pedidos[0].url,undefined);assert(mensajes.some(m=>m.includes('COBERTURA INCOMPLETA')));
});
test('PDF no compatible muestra el motivo y no ejecuta otra pestaña',async t=>{
 const{abrir,invocar,pedidos,mensajes}=montar(t);abrir({seleccion:['D:/documento.pdf']});
 assert.equal(invocar('contexto').aranas.lectora.disponible,false);
 const r=await invocar('ejecutar',{tipo:'arana',arana:'lectora'});assert.equal(r.ok,false);assert.equal(pedidos.length,0);assert(mensajes.some(m=>/Formato/.test(m)));
});
test('el contexto del navegador se conserva y los rechazos asíncronos se muestran',async t=>{
 const{abrir,invocar,pedidos,mensajes}=montar(t,{soltar:async()=>{throw new Error('La pestaña se cerró')}});
 abrir({app:'chrome',titulo:'Documento - Google Chrome'});const r=await invocar('ejecutar',{tipo:'arana',arana:'ia'});
 assert.equal(pedidos[0].tituloObjetivo,'Documento - Google Chrome');assert.equal(r.ok,false);assert(mensajes.some(m=>m.includes('La pestaña se cerró')));
});
test('eventos de un menú anterior no ejecutan ni cierran el nuevo',t=>{
 const{abrir,invocar}=montar(t);const vieja=abrir({}),nueva=abrir({app:'chrome'});
 vieja.emit('blur');assert.equal(nueva.isDestroyed(),false);
 assert.throws(()=>invocar('ejecutar',{tipo:'prompt',texto:'Algo'},vieja),/ya no está activo/);
 assert.equal(nueva.isDestroyed(),false);
});
test('guardar y borrar una acción actualiza el contexto del menú',t=>{
 const{abrir,invocar}=montar(t);abrir({});const g=invocar('guardar',{texto:'Mi acción de prueba'});
 assert(invocar('contexto').acciones.some(a=>a.id===g.accion.id));invocar('borrar',g.accion.id);assert(!invocar('contexto').acciones.some(a=>a.id===g.accion.id));
});
test('prompt vacío no se envía y la ventana queda dentro del monitor',t=>{
 const{abrir,invocar,mensajes}=montar(t);const v=abrir({});const r=invocar('ejecutar',{tipo:'prompt',texto:'  '});
 return Promise.resolve(r).then(r=>{assert.equal(r.ok,false);assert.equal(mensajes.length,0);assert(!v.muerta);assert(v.opciones.x+v.opciones.width<=1280);assert(v.opciones.y+v.opciones.height<=720)});
});

test('el atajo identifica una aplicación por su ventana sin pedir URL',async t=>{
 let objetivo;
 const{abrir,invocar,pedidos}=montar(t,{capturarTexto:async c=>{objetivo=c;return{texto:'Texto de la aplicación seleccionada',fuente:'texto visible'};}});
 abrir({app:'notepad',titulo:'Documento sin guardar',hwnd:'12345',x:220,y:230});
 await invocar('ejecutar',{tipo:'arana',arana:'lectora'});
 assert.equal(objetivo.hwnd,'12345');assert.equal(objetivo.x,220);assert(pedidos[0].contexto.texto.includes('aplicación seleccionada'));assert.equal(pedidos[0].url,undefined);
});
 test('si falla el DOM del navegador usa solo la ventana del atajo',async t=>{
 let n=0,capturas=0;
 const{abrir,invocar,pedidos}=montar(t,{soltar:async()=>{if(n++===0){const e=new Error('No pude extraer el DOM');e.code='SIN_TEXTO_DOM';throw e;}return 'Analizado';},capturarTexto:async()=>{capturas++;return{texto:'Texto accesible de la pestaña'};}});
 abrir({app:'chrome',titulo:'Documento - Chrome',hwnd:'9876'});await invocar('ejecutar',{tipo:'arana',arana:'lectora'});
 assert.equal(capturas,1);assert.equal(pedidos.length,2);assert(pedidos[1].contexto.texto.includes('Texto accesible'));
});
