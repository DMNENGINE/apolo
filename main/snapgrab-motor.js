// Motor sin Electron: protocolo JSON, descargas aisladas y cancelación real del proceso.
const {spawn} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const MODOS = ['video','fotos','todo','audio'];
function urlPublicacion(valor) {
  const spotify=/^spotify:(track|album|playlist|artist):([a-z0-9]+)$/i.exec(String(valor||'').trim());
  if(spotify)valor=`https://open.spotify.com/${spotify[1].toLowerCase()}/${spotify[2]}`;
  let u;try {u=new URL(valor);}catch {throw new Error('No se pudo identificar la dirección de esta página');}
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('SnapGrab necesita una página web http(s)');
  return u.href;
}
async function paginaObjetivo(navegador, contexto, leerNativo) {
  let nativo={},falloNativo;
  if(leerNativo&&contexto.hwnd)try {nativo=await leerNativo(contexto);}catch(e){falloNativo=e;}
  const elegido=nativo.imagenUrl||nativo.url;
  if(elegido){
    const url=urlPublicacion(elegido);
    if(navegador?.protegido?.(url,contexto.titulo)||nativo.url&&navegador?.protegido?.(nativo.url,contexto.titulo))throw new Error('Esta página está protegida y no se enviará al descargador');
    return {...nativo,titulo:contexto.titulo||contexto.app,url,paginaUrl:nativo.url?urlPublicacion(nativo.url):url};
  }
  if(!navegador?.conectado?.()){
    if(nativo.captura)return {...nativo,titulo:contexto.titulo||contexto.app,url:''};
    throw falloNativo||new Error('Windows no pudo obtener la dirección ni la imagen de esa ventana');
  }
  try {
  const tabs=await navegador.orden('pestanas');
  const normal=t=>String(t||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  const titulo=normal(contexto.titulo);
  const candidatas=tabs.filter(t=>t.titulo && titulo.includes(normal(t.titulo)));
  // Nunca descargar la pestaña de otra ventana por ser la primera de la lista.
  if(candidatas.length!==1)throw new Error(candidatas.length?'Varias pestañas tienen ese título; cierra las duplicadas y vuelve a abrir el menú':'La página del clic no coincide con las pestañas conectadas a APOLO');
  const t=candidatas[0];
  if(navegador.protegido?.(t.url,t.titulo))throw new Error('Esta página está protegida y no se enviará al descargador');
  return {...nativo,titulo:t.titulo,url:urlPublicacion(t.url),paginaUrl:urlPublicacion(t.url)};
  }catch(e){
    if(/protegida/.test(e.message))throw e;
    if(nativo.captura)return {...nativo,titulo:contexto.titulo||contexto.app,url:'',aviso:'No se pudo leer la dirección. Puedes guardar una imagen de esta ventana.'};
    throw e;
  }
}
function iniciarTrabajo({dir,url,accion,modo,carpeta,imagenes,archivos,seleccionada,evento=()=>{},lanzar=spawn,limiteMs}) {
  url=urlPublicacion(url);
  if(!['analizar','descargar','galeria','guardar-fotos','convertir-audio'].includes(accion)||accion==='descargar'&&!MODOS.includes(modo))throw new Error('Operación de SnapGrab no válida');
  // Argumentos separados: ni URL ni nombres de archivo pasan por una consola.
  const hijo=lanzar('python',['-u',path.join(dir,'tools','snapgrab','puente.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'}});
  let cancelado=false,finalizado=false,buf='',resultado,error,temporizador;
  const promesa=new Promise((resolver,rechazar)=>{
    const fin=e=>{if(finalizado)return;finalizado=true;clearTimeout(temporizador);e?rechazar(e):resolver(resultado);};
    temporizador=setTimeout(()=>{error=new Error('SnapGrab superó el tiempo de espera');matar();},limiteMs??(['analizar','galeria'].includes(accion)?90000:1800000));
    const recibir=d=>{
      buf+=d;
      if(buf.length>1024*1024){error=new Error('SnapGrab devolvió una respuesta demasiado grande');matar();return;}
      let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;
        let j;try {j=JSON.parse(l);}catch{error=new Error('Respuesta de SnapGrab no válida');continue;}
        if(j.evento==='resultado')resultado=j;
        else if(j.evento==='error')error=new Error(String(j.error||'No se pudo descargar').slice(0,500));
        else if(j.evento==='progreso')evento(j);
      }
    };
    hijo.stdout.setEncoding('utf8');hijo.stdout.on('data',recibir);
    // No registrar salida del extractor: puede contener URL temporales o datos de sesión.
    hijo.stderr.resume();hijo.stdin.on('error',()=>{});
    hijo.on('error',e=>fin(new Error(e.code==='ENOENT'?'Python no está disponible para SnapGrab':e.message)));
    hijo.on('close',codigo=>{
      if(cancelado)return fin(new Error('Descarga cancelada'));
      if(error)return fin(error);
      if(codigo!==0||!resultado)return fin(new Error('SnapGrab no pudo completar la operación; comprueba Python y yt-dlp'));
      if(['descargar','guardar-fotos','convertir-audio'].includes(accion)){
        const raiz=path.resolve(carpeta);
        if(!Array.isArray(resultado.archivos)||!resultado.archivos.length||resultado.archivos.some(f=>{
          if(typeof f!=='string')return true;const r=path.relative(raiz,path.resolve(f));return r.startsWith('..')||path.isAbsolute(r)||!fs.existsSync(f);
        }))return fin(new Error('SnapGrab no devolvió archivos válidos en la carpeta de descarga'));
      }
      fin();
    });
    hijo.stdin.end(JSON.stringify({url,accion,modo,carpeta,imagenes,archivos,seleccionada})+'\n');
  });
  function matar(){
    if(finalizado)return;
    if(process.platform==='win32'&&hijo.pid){
      const t=lanzar('taskkill',['/PID',String(hijo.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});t.on('error',()=>hijo.kill());
    }else hijo.kill();
  }
  return {promesa,cancelar(){if(!finalizado){cancelado=true;matar();}}};
}
function seleccionarFotos(galeria,revision,ids){
  if(!galeria||revision!==galeria.revision)throw new Error('La galería cambió. Selecciona de nuevo las fotos');
  if(!Array.isArray(ids)||!ids.length||ids.length>24||new Set(ids).size!==ids.length)throw new Error('Selecciona entre una y 24 fotos distintas');
  return ids.map(id=>{const f=galeria.fotos.find(f=>f.id===id);if(!f)throw new Error('Esa foto no pertenece a la galería actual');return urlPublicacion(f.url);});
}
module.exports={urlPublicacion,paginaObjetivo,iniciarTrabajo,seleccionarFotos,MODOS};
