// Verificación real de ventana + IPC + Python + archivos con un vídeo local ficticio.
const {app,BrowserWindow,nativeImage}=require('electron');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..'),salida=process.env.APOLO_SNAPGRAB_PRUEBA;
if(!salida)throw new Error('Este script necesita el lanzador probar-snapgrab.cjs');
app.setPath('userData',path.join(salida,'perfil-electron'));
app.setPath('downloads',salida);
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});
// Se renderiza para capturarla sin mostrar ventanas de prueba en el escritorio.
BrowserWindow.prototype.show=function(){};
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
const limite=setTimeout(()=>{console.error('Tiempo agotado en la prueba de SnapGrab');app.exit(1);},100000);
app.whenReady().then(async()=>{
 // Solo el ensayo redirige las búsquedas de Spotify a nuestro vídeo sintético.
 const procesos=require('node:child_process'),lanzarReal=procesos.spawn;
 procesos.spawn=(programa,args,opciones)=>{
  if(programa==='python'&&args[1]===path.join(raiz,'tools','snapgrab','puente.py'))args=[args[0],path.join(__dirname,'probar-spotify-puente.py'),...args.slice(2)];
  return lanzarReal(programa,args,opciones);
 };
 const {abrirSnapGrab}=require('../main/snapgrab');
 const url=process.env.APOLO_SNAPGRAB_URL;
 await abrirSnapGrab({dir:raiz,contexto:{titulo:'Vídeo de prueba - Chrome'},navegador:{conectado:()=>true,orden:async()=>[{titulo:'Vídeo de prueba',url}]}});
 let w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);const errores=[];w.webContents.on('console-message',(_e,n,m)=>{if(n===3)errores.push(m)});
 const js=code=>w.webContents.executeJavaScript(code);
 async function capturar(nombre){
  // La primera captura despierta el compositor de la ventana oculta.
  await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await esperar(250);
  fs.writeFileSync(path.join(salida,nombre),(await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 async function estadoListo(){for(let i=0;i<300;i++){const e=await js("window.snapgrab.accion({tipo:'estado'})");if(!e.ocupado&&(e.info||e.error||e.tieneCaptura&&!e.url))return e;await esperar(200);}throw new Error('No terminó el análisis');}
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
 // Pegar un enlace y pulsar Enter no debe enviarlo al prompt libre de APOLO.
 await m.webContents.executeJavaScript(`document.querySelector('#snap-url').value=${JSON.stringify(url)};document.querySelector('#snap-url').focus()`);
 await m.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await esperar(150);
 fs.writeFileSync(path.join(salida,'menu-enlace.png'),(await m.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 m.webContents.debugger.attach('1.3');
 await m.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r'}).catch(()=>{});
 if(!m.isDestroyed())await m.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13}).catch(()=>{});
 const abrirDesdeMenu=esperar(500);
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
 console.log('OK: MP4, MP3 y cancelación; comprobando captura nativa sin extensión');
 w.close();
 const fotoUrl=url.replace('video-prueba.mp4','foto-prueba.png');
 const p=spawn('powershell.exe',['-NoProfile','-STA','-File',path.join(__dirname,'probar-snapgrab-nativo.ps1'),'-Url',fotoUrl],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 try {
  const hwnd=await new Promise((resolve,reject)=>{let b='';p.stdout.setEncoding('utf8');p.stdout.on('data',d=>{b+=d;const l=b.split('\n').find(x=>x.trim().startsWith('{'));if(l)try{resolve(JSON.parse(l).hwnd)}catch{}});p.on('error',reject);p.on('close',()=>reject(new Error('La ventana ficticia no arrancó')));});
  const c={hwnd,x:50,y:50,app:'navegador-desconocido',titulo:'Foto en otro navegador'};
  const nativo=await require('../main/snapgrab-contexto').capturarContexto(raiz,c);
  fs.writeFileSync(path.join(salida,'resultado-nativo.json'),JSON.stringify({...nativo,captura:nativo.captura?'PNG omitido':''},null,2));
  assert.equal(nativo.url,fotoUrl,'Windows obtiene la dirección sin extensión');assert(nativo.captura,'Windows devuelve la ventana elegida');
  fs.writeFileSync(path.join(salida,'captura-nativa.png'),Buffer.from(nativo.captura,'base64'));
  await abrirSnapGrab({dir:raiz,navegador:{conectado:()=>false},contexto:c});w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);
  e=await estadoListo();assert(!e.error,e.error);assert(e.info.fotos);assert(!e.info.video);assert(e.tieneCaptura);
  await js("window.snapgrab.accion({tipo:'descargar',modo:'fotos'})");e=await estadoListo();assert(!e.error,e.error);assert.equal(path.extname(e.archivos[0]),'.png');assert(fs.statSync(e.archivos[0]).size>50);
  await esperar(350);await capturar('snapgrab-foto-sin-extension.png');w.close();
  // Incluso sin dirección se puede seleccionar y guardar la foto visible.
  await abrirSnapGrab({dir:raiz,navegador:{conectado:()=>false},contexto:{...c,titulo:'Sin dirección accesible'},leerNativo:async()=>({...nativo,url:'',imagenUrl:''})});
  w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);e=await estadoListo();assert(!e.error,e.error);assert(e.tieneCaptura);assert.equal(e.url,'');
  await js("document.querySelector('#foto-visible').click()");for(let i=0;i<30;i++){if(await js("!document.querySelector('#recorte').hidden"))break;await esperar(100);}
  await esperar(250);await capturar('snapgrab-recorte.png');
  const puntos=await js("(()=>{const c=document.querySelector('#vista'),r=c.getBoundingClientRect();return{x:r.x+20*r.width/c.width,y:r.y+20*r.height/c.height,dx:120*r.width/c.width,dy:90*r.height/c.height}})()");
  w.webContents.debugger.attach('1.3');
  await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:puntos.x,y:puntos.y,button:'left',buttons:1,clickCount:1});
  await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:puntos.x+puntos.dx,y:puntos.y+puntos.dy,button:'left',buttons:1});
  await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:puntos.x+puntos.dx,y:puntos.y+puntos.dy,button:'left',buttons:0,clickCount:1});
  w.webContents.debugger.detach();
  assert(await js("!document.querySelector('#guardar-recorte').disabled"),'Arrastrar habilita Guardar recorte');
  await js("document.querySelector('#guardar-recorte').click()");
  for(let i=0;i<30;i++){if(await js("document.querySelector('#recorte-estado').textContent.startsWith('Guardada:')"))break;await esperar(100);}
  assert(await js("document.querySelector('#recorte-estado').textContent.startsWith('Guardada:')"));
  const guardado=(await js("window.snapgrab.accion({tipo:'estado'})")).archivos[0];
  assert.deepEqual(nativeImage.createFromPath(guardado).getSize(),{width:120,height:90});
  await assert.rejects(js("window.snapgrab.accion({tipo:'guardar-imagen',recorte:{x:-1,y:0,width:10,height:10}})"),/recorte/);
  console.log('OK: Windows identifica la dirección sin extensión; descarga PNG y recorta la ventana sin URL');
  w.close();
  const album=url.replace('video-prueba.mp4','galeria.html'),senalada=url.replace('video-prueba.mp4','foto-dos.png');
  await abrirSnapGrab({dir:raiz,navegador:{conectado:()=>false},contexto:{...c,titulo:'Galería de prueba'},leerNativo:async()=>({...nativo,url:album,imagenUrl:senalada,tipoCaptura:'imagen'})});
  w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);e=await estadoListo();assert(!e.error,e.error);
  await esperar(150);assert(await js("document.querySelector('#foto-visible-texto').textContent.includes('esta foto')"));
  await js("window.snapgrab.accion({tipo:'galeria'})");e=await estadoListo();assert(!e.error,e.error);
  assert.equal(e.galeria.fotos.length,3);assert.equal(e.galeria.fotos.filter(f=>f.senalada).length,1);assert(e.galeria.fotos[0].senalada===true);
  assert(e.galeria.fotos.every(f=>f.miniatura.startsWith('data:image/jpeg;base64,')&&!f.url));
  await esperar(200);assert.equal(await js("document.querySelectorAll('#fotos input:checked').length"),1);
  await js("document.querySelector('#marcar-todas').click()");assert.equal(await js("document.querySelectorAll('#fotos input:checked').length"),3);
  await js("document.querySelector('#marcar-todas').click()");assert(await js("document.querySelector('#guardar-fotos').disabled"));
  await js("document.querySelectorAll('#fotos input')[0].click();document.querySelectorAll('#fotos input')[2].click();document.querySelector('#galeria').scrollIntoView({block:'start'})");
  await capturar('snapgrab-galeria.png');
  const revision=e.galeria.revision;
  await js("document.querySelector('#guardar-fotos').click()");
  for(let i=0;i<100;i++){e=await js("window.snapgrab.accion({tipo:'estado'})");if(!e.ocupado&&e.archivos.length===2)break;await esperar(100);}
  assert(!e.error,e.error);assert.equal(e.archivos.length,2);
  for(const [i,nombre] of ['dos','tres'].entries())assert(fs.readFileSync(e.archivos[i]).equals(fs.readFileSync(path.join(salida,`foto-${nombre}.png`))),'Solo se guardan los originales elegidos');
  await js("window.snapgrab.accion({tipo:'galeria'})");await assert.rejects(js(`window.snapgrab.accion({tipo:'guardar-fotos',revision:${JSON.stringify(revision)},ids:['foto-0']})`),/galería cambió/);
  const parcial=await require('../main/snapgrab-motor').iniciarTrabajo({dir:raiz,url:album,accion:'guardar-fotos',imagenes:[senalada,url.replace('video-prueba.mp4','no-existe.png')],carpeta:fs.mkdtempSync(path.join(salida,'parcial-'))}).promesa;
  assert.equal(parcial.archivos.length,1);assert.equal(parcial.fallos,1);assert(parcial.advertencia);
  console.log('OK: galería con miniaturas, foto señalada, selección de dos originales y rechazo de una revisión antigua');
  for(const [tipo,cantidad,guardadas] of [['track',1,1],['album',2,2],['playlist',3,2]]){
   w.close();
   await abrirSnapGrab({dir:raiz,navegador:{conectado:()=>false},contexto:{...c,titulo:'Spotify de prueba '+tipo},leerNativo:async()=>({...nativo,url:`https://open.spotify.com/${tipo}/Prueba123`,imagenUrl:''})});
   w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);e=await estadoListo();assert(!e.error,e.error);assert(e.info.audio);assert.equal(e.info.plataforma,'spotify');assert.equal(e.info.cantidad,cantidad);assert.equal(e.info.origenAudio,'YouTube');
   await esperar(200);assert(await js("!document.querySelector('[data-modo=audio]').disabled"));assert(await js("document.querySelector('[data-modo=video]').hidden"));assert(await js("document.querySelector('#musica').textContent.includes('YouTube')"));assert.equal(await js("document.querySelectorAll('#pistas li').length"),cantidad);
   if(tipo==='album')await capturar('snapgrab-spotify.png');
   await js(`window.snapgrab.accion({tipo:'descargar',modo:'${tipo==='track'?'audio':'todo'}'})`);e=await estadoListo();assert(!e.error,e.error);assert.equal(e.archivos.length,guardadas);assert.equal(new Set(e.archivos).size,guardadas);
   for(const f of e.archivos){assert.equal(path.extname(f),'.mp3');assert(fs.statSync(f).size>100);}
   if(tipo==='playlist')assert(e.mensaje.includes('1 pista(s) no se pudieron guardar'));
  }
  console.log('OK: Spotify canción, álbum y lista; MP3 real con búsqueda local de prueba y aviso de pista fallida');
  await js(`document.querySelector('#enlace').value=${JSON.stringify(fotoUrl)};document.querySelector('#enlace-form').requestSubmit()`);
  for(let i=0;i<150;i++){e=await js("window.snapgrab.accion({tipo:'estado'})");if(!e.ocupado&&e.url===fotoUrl&&e.info?.fotos)break;await esperar(100);}
  assert.equal(e.url,fotoUrl);assert(e.info.fotos);assert.equal(e.tieneCaptura,false);assert.equal(e.galeria,null);
  await esperar(200);assert(await js("document.querySelector('#musica').hidden"));assert(await js("document.querySelector('#galeria').hidden"));
  await capturar('snapgrab-enlace.png');
  console.log('OK: enlace pegado desde el menú con Enter y cambio de enlace dentro de SnapGrab');
 } finally {p.kill();}
 assert.equal(errores.length,0,errores.join('\n'));console.log('OK: ventana real, análisis, descarga MP4 y extracción MP3; capturas guardadas');clearTimeout(limite);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(limite);app.exit(1);});
