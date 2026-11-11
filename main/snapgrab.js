// Ventana de descargas integrada en la estética del menú de APOLO.
const {BrowserWindow,ipcMain,shell,app,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {paginaObjetivo,iniciarTrabajo}=require('./snapgrab-motor');
let ventana=null,estado=null,trabajo=null,registrado=false,captura=null;
function publicar(){if(ventana&&!ventana.isDestroyed())ventana.webContents.send('snapgrab-estado',estado);}
async function operacion(dir,accion,modo){
  if(trabajo)throw new Error('Espera a que termine la operación actual');
  const w=ventana;
  const carpeta=accion==='descargar'?fs.mkdtempSync(path.join(estado.carpeta,'descarga-')):estado.carpeta;
  const actual=iniciarTrabajo({dir,url:estado.url,accion,modo,carpeta,evento:e=>{
    if(ventana!==w)return;
    estado={...estado,progreso:e.porcentaje??null,mensaje:e.texto||'Descargando…'};publicar();
  }});
  trabajo=actual;estado={...estado,ocupado:true,progreso:null,error:'',mensaje:accion==='analizar'?'Analizando esta publicación…':'Descargando…'};publicar();
  try{
    const r=await actual.promesa;if(ventana!==w)return;
    estado=accion==='analizar'?{...estado,info:r,mensaje:'Elige qué quieres guardar'}:{...estado,archivos:r.archivos,mensaje:`Guardados ${r.archivos.length} archivo(s)`,progreso:100};
  }catch(e){if(ventana===w)estado={...estado,error:e.message,mensaje:''};}
  finally{if(trabajo===actual)trabajo=null;if(ventana===w){estado={...estado,ocupado:false};publicar();}}
}
async function abrirSnapGrab({dir,navegador,contexto,leerNativo}){
  const pagina=await paginaObjetivo(navegador,contexto,leerNativo||((c)=>require('./snapgrab-contexto').capturarContexto(dir,c)));
  if(ventana&&!ventana.isDestroyed()){
    if(estado.url===pagina.url&&estado.hwnd===contexto.hwnd){ventana.show();ventana.focus();return {ok:true};}
    if(trabajo){ventana.show();ventana.focus();throw new Error('SnapGrab está trabajando sobre otra página. Termina o cancela esa operación antes de cambiar de objetivo');}
    ventana.close();
  }
  const carpeta=path.join(app.getPath('downloads'),'SnapGrab');fs.mkdirSync(carpeta,{recursive:true});
  const {captura:imagen,...meta}=pagina;
  captura=imagen?nativeImage.createFromBuffer(Buffer.from(imagen,'base64')):null;
  if(captura?.isEmpty())captura=null;
  estado={...meta,hwnd:contexto.hwnd,tieneCaptura:!!captura,carpeta,ocupado:false,info:null,archivos:[],mensaje:pagina.url?'Preparando SnapGrab…':'Selecciona la foto que quieres guardar de esta ventana.',error:'',progreso:null};
  if(!registrado){
    registrado=true;require('./ipc-seguro').permitir(path.join(dir,'app','snapgrab.html'),'snapgrab-');
    ipcMain.handle('snapgrab-accion',async(e,a)=>{
      if(!ventana||ventana.isDestroyed()||e.sender!==ventana.webContents)throw new Error('Esta ventana de SnapGrab ya no está activa');
      if(a?.tipo==='estado')return estado;
      if(a?.tipo==='cerrar'){ventana.close();return;}
      if(a?.tipo==='cancelar'){trabajo?.cancelar();return;}
      if(a?.tipo==='carpeta')return shell.openPath(estado.carpeta);
      if(a?.tipo==='captura'){
        if(!captura)throw new Error('Windows no permitió capturar esta ventana');
        return {imagen:captura.toDataURL(),...captura.getSize(),tipo:estado.tipoCaptura};
      }
      if(a?.tipo==='guardar-imagen'){
        if(!captura)throw new Error('No hay una imagen capturada');
        let imagen=captura;const tam=imagen.getSize();
        if(a.recorte){const {x,y,width,height}=a.recorte;
          if(![x,y,width,height].every(Number.isInteger)||x<0||y<0||width<2||height<2||x+width>tam.width||y+height>tam.height)throw new Error('Selecciona un recorte dentro de la imagen');
          imagen=imagen.crop({x,y,width,height});
        }else if(estado.tipoCaptura!=='imagen')throw new Error('Selecciona primero la zona que quieres guardar');
        const destino=fs.mkdtempSync(path.join(estado.carpeta,'foto-')),archivo=path.join(destino,'imagen.png');
        fs.writeFileSync(archivo,imagen.toPNG());estado={...estado,archivos:[archivo],mensaje:'Imagen guardada'};publicar();return {archivo};
      }
      if(a?.tipo==='analizar')return operacion(dir,'analizar');
      if(a?.tipo==='descargar'&&estado.info)return operacion(dir,'descargar',a.modo);
      throw new Error('Acción de SnapGrab no válida');
    });
  }
  const w=ventana=new BrowserWindow({width:640,height:590,minWidth:520,minHeight:460,frame:false,transparent:true,show:false,resizable:true,title:'APOLO · SnapGrab',webPreferences:{preload:path.join(dir,'app','snapgrab-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',e=>e.preventDefault());
  w.on('closed',()=>{if(ventana===w){trabajo?.cancelar();trabajo=null;ventana=null;estado=null;captura=null;}});
  w.once('ready-to-show',()=>{if(ventana!==w||w.isDestroyed())return;w.show();if(!estado.url){publicar();return;}operacion(dir,'analizar').catch(e=>{if(ventana===w){estado={...estado,error:e.message,ocupado:false};publicar();}});});
  await w.loadFile(path.join(dir,'app','snapgrab.html'));return {ok:true};
}
module.exports={abrirSnapGrab};
