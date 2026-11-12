// Ventana de descargas integrada en la estética del menú de APOLO.
const {BrowserWindow,ipcMain,shell,app,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {paginaObjetivo,iniciarTrabajo,seleccionarFotos,urlPublicacion}=require('./snapgrab-motor');
const {crearInstagram,publicacionInstagram}=require('./snapgrab-instagram');
const {leerPerfilChrome}=require('./abrir-chrome');
let navegadorInstagram=null;
let ventana=null,estado=null,trabajo=null,registrado=false,captura=null,galeriaPrivada=null,lecturaInstagram=null,instagram=crearInstagram({navegador:()=>navegadorInstagram});
function estadoPublico(){return estado?{...estado,instagramEstado:instagram.estado?.()}:estado;}
function publicar(){if(ventana&&!ventana.isDestroyed())ventana.webContents.send('snapgrab-estado',estadoPublico());}
async function operacion(dir,accion,modo,extra={}){
  if(trabajo)throw new Error('Espera a que termine la operación actual');
  if(accion==='analizar'&&publicacionInstagram(estado.url)){
    accion='instagram';extra={...extra,abrir:!lecturaInstagram&&!instagram.preparado?.()};
  }
  const w=ventana;
  const carpeta=['descargar','guardar-fotos'].includes(accion)?fs.mkdtempSync(path.join(estado.carpeta,'descarga-')):estado.carpeta;
  const url=['galeria','guardar-fotos'].includes(accion)?(estado.paginaUrl||estado.url):estado.url;
  const evento=e=>{
    if(ventana!==w)return;
    estado={...estado,progreso:e.porcentaje??null,mensaje:e.texto||'Descargando…'};publicar();
  };
  let lectura=null,cancelado=false;
  const actual=accion==='instagram'&&extra.abrir?{
    promesa:Promise.resolve().then(async()=>{
      if(cancelado)throw new Error('Lectura cancelada');
      await instagram.abrir(url);
      if(cancelado)throw new Error('Lectura cancelada');
      lectura=instagram.leer(url,{esperar:true});return lectura.promesa;
    }),
    cancelar(){cancelado=true;lectura?.cancelar();}
  }:accion==='instagram'?instagram.leer(estado.url,extra):lecturaInstagram&&['descargar','guardar-fotos'].includes(accion)?instagram.descargar({lectura:lecturaInstagram,carpeta,modo:accion==='guardar-fotos'?'fotos':modo,imagenes:extra.imagenes,evento,convertir:archivos=>iniciarTrabajo({dir,url,accion:'convertir-audio',carpeta,archivos,evento})}):iniciarTrabajo({dir,url,accion,modo,carpeta,...extra,evento});
  const mensajes={analizar:'Analizando esta publicación…',instagram:'Leyendo la publicación desde Chrome…',galeria:'Buscando fotos de esta página…','guardar-fotos':'Guardando las fotos elegidas…'};
  trabajo=actual;estado={...estado,ocupado:true,progreso:null,error:'',errorMotor:'',mensaje:mensajes[accion]||'Descargando…'};publicar();
  try{
    const r=await actual.promesa;if(ventana!==w)return;
    if(accion==='instagram'){
      lecturaInstagram=r;const fotos=r.medios.filter(m=>m.tipo==='foto');galeriaPrivada={revision:require('node:crypto').randomUUID(),fotos};
      estado={...estado,info:r.info,instagramConectado:true,galeria:{revision:galeriaPrivada.revision,fotos:fotos.map(m=>({id:m.id,titulo:m.titulo,miniatura:m.miniatura,senalada:false})),aviso:''},mensaje:'Publicación leída desde tu Chrome. Elige qué guardar.'};
    }else if(accion==='galeria'){
      const fotos=(Array.isArray(r.fotos)?r.fotos:[]).slice(0,24).map((f,i)=>({...f,id:'foto-'+i,url:urlPublicacion(f.url)}));
      galeriaPrivada={revision:require('node:crypto').randomUUID(),fotos};
      estado={...estado,galeria:{revision:galeriaPrivada.revision,fotos:fotos.map(f=>({id:f.id,titulo:String(f.titulo||'Foto').slice(0,120),miniatura:/^data:image\/(jpeg|png|webp|gif|avif|bmp);base64,/.test(f.miniatura||'')?f.miniatura:'',senalada:f.url===estado.imagenUrl||f.url===estado.url&&!!estado.info?.fotos})),aviso:r.aviso||''},mensaje:fotos.length?'Marca las fotos que quieres guardar':'No se encontraron originales accesibles. Puedes guardar un recorte visible.'};
    }else estado=accion==='analizar'?{...estado,info:r,mensaje:'Elige qué quieres guardar'}:{...estado,archivos:r.archivos,mensaje:`Guardados ${r.archivos.length} archivo(s)${r.advertencia?' · '+r.advertencia:''}`,progreso:100};
  }catch(e){if(ventana===w)estado={...estado,error:e.message,errorMotor:'',mensaje:''};}
  finally{if(trabajo===actual)trabajo=null;if(ventana===w){estado={...estado,ocupado:false};publicar();}}
}
async function abrirSnapGrab({dir,navegador,contexto={},leerNativo,url,instagramVista}){
  const manual=url!==undefined;
  const enlace=manual?urlPublicacion(url):null;
  if(manual&&navegador?.protegido?.(enlace,''))throw new Error('Esta página está protegida y no se enviará al descargador');
  const pagina=manual?{url:enlace,paginaUrl:enlace,titulo:'Enlace pegado'}:await paginaObjetivo(navegador,contexto,leerNativo||((c)=>require('./snapgrab-contexto').capturarContexto(dir,c)));
  if(ventana&&!ventana.isDestroyed()){
    if(estado.url===pagina.url&&estado.hwnd===contexto.hwnd){ventana.show();ventana.focus();return {ok:true};}
    if(trabajo){ventana.show();ventana.focus();throw new Error('SnapGrab está trabajando sobre otra página. Termina o cancela esa operación antes de cambiar de objetivo');}
    ventana.close();
  }
  const carpeta=path.join(app.getPath('downloads'),'SnapGrab');fs.mkdirSync(carpeta,{recursive:true});
  navegadorInstagram=navegador;
  if(instagramVista)instagram=instagramVista;
  const {captura:imagen,...meta}=pagina;
  captura=imagen?nativeImage.createFromBuffer(Buffer.from(imagen,'base64')):null;
  if(captura?.isEmpty())captura=null;
  galeriaPrivada=null;lecturaInstagram=null;
  estado={...meta,chromeCuenta:leerPerfilChrome()?.cuenta||'',instagramDisponible:!!publicacionInstagram(pagina.url),hwnd:contexto.hwnd,tieneCaptura:!!captura,carpeta,ocupado:false,info:null,galeria:null,archivos:[],mensaje:pagina.url?'Preparando SnapGrab…':'Selecciona la foto que quieres guardar de esta ventana.',error:'',progreso:null};
  if(!registrado){
    registrado=true;require('./ipc-seguro').permitir(path.join(dir,'app','snapgrab.html'),'snapgrab-');
    ipcMain.handle('snapgrab-accion',async(e,a)=>{
      if(!ventana||ventana.isDestroyed()||e.sender!==ventana.webContents)throw new Error('Esta ventana de SnapGrab ya no está activa');
      if(a?.tipo==='estado')return estadoPublico();
      if(a?.tipo==='cerrar'){ventana.close();return;}
      if(a?.tipo==='cancelar'){trabajo?.cancelar();return;}
      if(a?.tipo==='carpeta')return shell.openPath(estado.carpeta);
      if(a?.tipo==='instagram-abrir'){
        if(trabajo)throw new Error('Espera a que termine la operación actual');
        return operacion(dir,'instagram',null,{abrir:true});
      }
      if(a?.tipo==='instagram-leer')return operacion(dir,'instagram');
      if(a?.tipo==='enlace'){
        const enlace=urlPublicacion(a.url);
        if(trabajo)throw new Error('Termina o cancela la operación actual antes de analizar otro enlace');
        if(navegador?.protegido?.(enlace,''))throw new Error('Esta página está protegida y no se enviará al descargador');
        captura=null;galeriaPrivada=null;lecturaInstagram=null;instagram.cerrar();
        estado={url:enlace,paginaUrl:enlace,chromeCuenta:leerPerfilChrome()?.cuenta||'',instagramDisponible:!!publicacionInstagram(enlace),titulo:'Enlace pegado',carpeta:estado.carpeta,tieneCaptura:false,info:null,galeria:null,archivos:[],ocupado:false,error:'',mensaje:'Preparando enlace…',progreso:null};publicar();
        return operacion(dir,'analizar');
      }
      if(a?.tipo==='galeria'){if(lecturaInstagram)return operacion(dir,'instagram');return operacion(dir,'galeria',null,{seleccionada:estado.imagenUrl});}
      if(a?.tipo==='guardar-fotos')return operacion(dir,'guardar-fotos',null,{imagenes:seleccionarFotos(galeriaPrivada,a.revision,a.ids)});
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
  const w=ventana=new BrowserWindow({width:640,height:640,minWidth:520,minHeight:460,frame:false,transparent:true,show:false,resizable:true,title:'APOLO · SnapGrab',webPreferences:{preload:path.join(dir,'app','snapgrab-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',e=>e.preventDefault());
  w.on('closed',()=>{if(ventana===w){trabajo?.cancelar();trabajo=null;ventana=null;estado=null;captura=null;galeriaPrivada=null;lecturaInstagram=null;instagram.cerrar();}});
  w.once('ready-to-show',()=>{if(ventana!==w||w.isDestroyed())return;w.show();if(!estado.url){publicar();return;}operacion(dir,'analizar').catch(e=>{if(ventana===w){estado={...estado,error:e.message,ocupado:false};publicar();}});});
  await w.loadFile(path.join(dir,'app','snapgrab.html'));return {ok:true};
}
module.exports={abrirSnapGrab};
