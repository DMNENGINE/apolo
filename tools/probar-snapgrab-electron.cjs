// Verificación real de ventana + IPC + Python + archivos con un vídeo local ficticio.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..'),salida=process.env.APOLO_SNAPGRAB_PRUEBA;
if(!salida)throw new Error('Este script necesita el lanzador probar-snapgrab.cjs');
app.setPath('userData',path.join(salida,'perfil-electron'));
app.setPath('downloads',salida);
app.disableHardwareAcceleration();
// Se renderiza para capturarla sin mostrar ventanas de prueba en el escritorio.
BrowserWindow.prototype.show=function(){};
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
const limite=setTimeout(()=>{console.error('Tiempo agotado en la prueba de SnapGrab');app.exit(1);},100000);
app.whenReady().then(async()=>{
 const {abrirSnapGrab}=require('../main/snapgrab');
 const url=process.env.APOLO_SNAPGRAB_URL;
 await abrirSnapGrab({dir:raiz,contexto:{titulo:'Vídeo de prueba - Chrome'},navegador:{conectado:()=>true,orden:async()=>[{titulo:'Vídeo de prueba',url}]}});
 const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);const errores=[];w.webContents.on('console-message',(_e,n,m)=>{if(n===3)errores.push(m)});
 const js=code=>w.webContents.executeJavaScript(code);
 async function capturar(nombre){
  // La primera captura despierta el compositor de la ventana oculta.
  await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await esperar(250);
  fs.writeFileSync(path.join(salida,nombre),(await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 async function estadoListo(){for(let i=0;i<300;i++){const e=await js("window.snapgrab.accion({tipo:'estado'})");if(!e.ocupado&&(e.info||e.error))return e;await esperar(200);}throw new Error('No terminó el análisis');}
 let e=await estadoListo();assert(!e.error,e.error);assert(e.info.video);assert(!e.info.fotos);
 await esperar(300);assert(await js("document.querySelector('#estado').textContent.includes('Elige')"));await capturar('snapgrab.png');
 // Mismo menú e IPC que usa Ctrl+Alt+clic derecho, con contexto ficticio.
 const {crearMenuApolo}=require('../main/menu-apolo');
 const menu=crearMenuApolo({dir:raiz,datos:()=>salida,nucleo:()=>({navegador:{conectado:()=>true,orden:async()=>[{titulo:'Vídeo de prueba',url}]}}),handleText:async()=>{},panelUrl:r=>'http://localhost/'+r,log:()=>{}});
 menu.abrir({x:20,y:20,app:'chrome',titulo:'Vídeo de prueba - Chrome',seleccion:[]});
 const m=BrowserWindow.getAllWindows().find(x=>x!==w);m.webContents.setBackgroundThrottling(false);
 for(let i=0;i<100;i++){try{if(await m.webContents.executeJavaScript("document.querySelector('#l')?.textContent.includes('SnapGrab')"))break;}catch{}await esperar(50);}
 assert(await m.webContents.executeJavaScript("document.querySelector('#l').textContent.includes('SnapGrab')"));
 await m.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await esperar(250);
 fs.writeFileSync(path.join(salida,'menu-snapgrab.png'),(await m.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 // El menú se destruye al ejecutar: su promesa IPC puede desaparecer con él.
 const abrirDesdeMenu=m.webContents.executeJavaScript("window.menuApolo.ejecutar({tipo:'snapgrab'})").catch(()=>{});
 await Promise.race([abrirDesdeMenu,esperar(500)]);
 assert.equal(BrowserWindow.getAllWindows().length,1);menu.parar();
 for(const modo of ['video','audio']){
  await js(`window.snapgrab.accion({tipo:'descargar',modo:'${modo}'})`);e=await estadoListo();assert(!e.error,e.error);assert(e.archivos.length);
  for(const f of e.archivos){assert(fs.statSync(f).size>100);assert.equal(path.extname(f),modo==='audio'?'.mp3':'.mp4');}
  await esperar(350);assert(await js("document.querySelector('#estado').textContent.includes('Guardados')"));await capturar(`snapgrab-${modo}.png`);
 }
 // Una cancelación termina también el Python hijo; la ventana vuelve a estar disponible.
 const inicio=js("window.snapgrab.accion({tipo:'analizar'})");await esperar(20);await js("window.snapgrab.accion({tipo:'cancelar'})");await inicio;
 e=await estadoListo();assert.match(e.error,/cancelada/);
 assert.equal(errores.length,0,errores.join('\n'));console.log('OK: ventana real, análisis, descarga MP4 y extracción MP3; capturas guardadas');clearTimeout(limite);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(limite);app.exit(1);});
