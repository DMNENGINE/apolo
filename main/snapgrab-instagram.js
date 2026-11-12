// Sesión propia de Instagram: Electron conserva sus cookies; no se exportan ni se leen archivos de sesión.
const fs=require('node:fs'),path=require('node:path');
function publicacionInstagram(valor){
  let u;try{u=new URL(valor);}catch{return null;}
  if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.username||u.password)return null;
  const m=/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(u.pathname);
  if(!m)return null;return {codigo:m[1],url:`https://www.instagram.com/p/${m[1]}/`};
}
function idMedia(codigo){
  const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let n=0n;
  for(const c of codigo.slice(0,11)){const i=abc.indexOf(c);if(i<0)throw new Error('Identificador de Instagram no válido');n=n*64n+BigInt(i);}
  return String(n);
}
function recursoInstagram(valor){
  try{const u=new URL(valor);return u.protocol==='https:'&&!u.username&&!u.password&&['cdninstagram.com','fbcdn.net','instagram.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:null;}catch{return null;}
}
function mediosDePublicacion(datos){
  const post=datos?.items?.[0];if(!post)throw new Error('Instagram no entregó la publicación para esta cuenta');
  const lista=post.carousel_media||[post],medios=[];
  for(const [i,m] of lista.slice(0,20).entries()){
    const videos=(m.video_versions||[]).filter(v=>recursoInstagram(v.url)).sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0));
    const fotos=(m.image_versions2?.candidates||[]).filter(v=>recursoInstagram(v.url)).sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0));
    const video=Number(m.media_type)===2;
    const recurso=video?videos[0]:fotos[0];if(!recurso)continue;
    medios.push({id:'ig-'+i,tipo:video?'video':'foto',url:recursoInstagram(recurso.url),vista:fotos[0]?recursoInstagram(fotos[0].url):null,titulo:`${video?'Vídeo':'Foto'} ${i+1}`,miniatura:''});
  }
  if(!medios.length)throw new Error('La cuenta puede ver el post, pero Instagram no expone archivos descargables');
  return {medios,info:{plataforma:'instagram',titulo:String(post.caption?.text||'Publicación de Instagram').slice(0,140),cantidad:medios.length,video:medios.some(m=>m.tipo==='video'),fotos:medios.some(m=>m.tipo==='foto'),audio:medios.some(m=>m.tipo==='video')}};
}
async function leerLimitado(res,maximo){
  const lector=res.body.getReader(),trozos=[];let n=0;
  try{while(true){const {done,value}=await lector.read();if(done)break;n+=value.length;if(n>maximo)throw new Error('El archivo supera el tamaño permitido');trozos.push(Buffer.from(value));}}finally{await lector.cancel().catch(()=>{});}
  return Buffer.concat(trozos);
}
function crearInstagram({crearVentana,obtenerSesion,miniatura}={}){
  crearVentana ||= opciones=>new(require('electron').BrowserWindow)(opciones);
  obtenerSesion ||= ()=>require('electron').session.fromPartition('persist:apolo-snapgrab-instagram');
  miniatura ||= b=>{const n=require('electron').nativeImage.createFromBuffer(b);if(n.isEmpty())return '';const t=n.getSize(),escala=Math.min(1,200/t.width,140/t.height);return 'data:image/jpeg;base64,'+n.resize({width:Math.max(1,Math.round(t.width*escala)),height:Math.max(1,Math.round(t.height*escala))}).toJPEG(60).toString('base64');};
  let ventana=null;
  async function abrir(url){
    const p=publicacionInstagram(url);if(!p)throw new Error('Abre un post o reel de Instagram para conectar esta función');
    if(!ventana||ventana.isDestroyed()){
      ventana=crearVentana({width:1050,height:800,title:'Instagram · APOLO',autoHideMenuBar:true,backgroundColor:'#080d11',webPreferences:{partition:'persist:apolo-snapgrab-instagram',nodeIntegration:false,contextIsolation:true,sandbox:true}});
      ventana.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      ventana.webContents.on('will-navigate',(e,destino)=>{try{const u=new URL(destino);if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname))e.preventDefault();}catch{e.preventDefault();}});
    }
    await ventana.loadURL(p.url);ventana.show();ventana.focus();return {ok:true};
  }
  function leer(url){
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),45000);
    const promesa=(async()=>{
      const p=publicacionInstagram(url);if(!p)throw new Error('Esta función necesita un post o reel de Instagram');
      if(!ventana||ventana.isDestroyed())throw new Error('Pulsa Abrir Instagram e inicia sesión en esa ventana');
      const abierta=publicacionInstagram(ventana.webContents.getURL());
      if(!abierta||abierta.codigo!==p.codigo)throw new Error('Inicia sesión y vuelve a pulsar Abrir Instagram para mostrar esta publicación');
      const ses=obtenerSesion();
      const res=await ses.fetch(`https://www.instagram.com/api/v1/media/${idMedia(p.codigo)}/info/`,{credentials:'include',headers:{'X-IG-App-ID':'936619743392459','Referer':p.url},signal:abort.signal});
      if([401,403].includes(res.status))throw new Error('Instagram todavía no acepta esta sesión. Completa el inicio de sesión en su ventana y pulsa Leer publicación');
      if(res.status===429)throw new Error('Instagram ha limitado las solicitudes. Espera antes de volver a intentarlo');
      if(!res.ok)throw new Error(`Instagram no permite leer la publicación con esta cuenta (HTTP ${res.status})`);
      let datos;try{datos=JSON.parse((await leerLimitado(res,3*1024*1024)).toString('utf8'));}catch{throw new Error('Instagram no devolvió datos de la publicación. Comprueba el inicio de sesión');}
      const lectura=mediosDePublicacion(datos);
      // Solo se transportan archivos multimedia; nunca cookies ni cabeceras de autenticación.
      for(const m of lectura.medios.filter(m=>m.tipo==='foto').slice(0,12))try{
        const r=await ses.fetch(m.vista||m.url,{credentials:'include',signal:abort.signal});
        if(r.ok)m.miniatura=miniatura(await leerLimitado(r,2*1024*1024));
      }catch{}
      if(abort.signal.aborted)throw new Error('Lectura cancelada');
      return {...lectura,codigo:p.codigo};
    })().finally(()=>clearTimeout(timer));
    return {promesa,cancelar:()=>abort.abort()};
  }
  function descargar({lectura,carpeta,modo,imagenes,evento=()=>{},convertir}){
    const abort=new AbortController();let conversion=null;
    const timer=setTimeout(()=>abort.abort(),1800000);
    const promesa=(async()=>{
      if(!['video','fotos','todo','audio'].includes(modo))throw new Error('Modo de Instagram no válido');
      const candidatos=lectura.medios.filter(m=>(!imagenes||imagenes.includes(m.url))&&(modo==='todo'||modo==='fotos'&&m.tipo==='foto'||['video','audio'].includes(modo)&&m.tipo==='video'));
      if(!candidatos.length)throw new Error('Esta publicación no contiene archivos de ese tipo');
      const archivos=[];let fallos=0;
      for(const [i,m] of candidatos.entries()){
        if(abort.signal.aborted)throw new Error('Descarga cancelada');
        let parcial;
        try{
          const r=await obtenerSesion().fetch(m.url,{credentials:'include',signal:abort.signal});
          if(!r.ok)throw new Error('Archivo no disponible');
          const mime=r.headers.get('content-type')||'';
          if(/text\/html|application\/json/.test(mime))throw new Error('Instagram no devolvió el archivo');
          const ext=m.tipo==='video'?'.mp4':mime.includes('png')?'.png':mime.includes('webp')?'.webp':'.jpg';
          const archivo=path.join(carpeta,`instagram-${i+1}${ext}`);parcial=archivo+'.part';
          const f=await fs.promises.open(parcial,'wx');let bytes=0;
          try{for await(const trozo of r.body){bytes+=trozo.length;if(bytes>256*1024*1024)throw new Error('Archivo mayor de 256 MB');await f.writeFile(trozo);}if(!bytes)throw new Error('Archivo vacío');}finally{await f.close();}
          await fs.promises.rename(parcial,archivo);archivos.push(archivo);
        }catch(e){if(parcial)await fs.promises.unlink(parcial).catch(()=>{});if(abort.signal.aborted)throw new Error('Descarga cancelada');fallos++;}
        evento({porcentaje:Math.round((i+1)*100/candidatos.length),texto:`Instagram: archivo ${i+1} de ${candidatos.length}`});
      }
      if(!archivos.length)throw new Error('Instagram no entregó los archivos. Pulsa Leer publicación para renovar sus enlaces');
      if(abort.signal.aborted)throw new Error('Descarga cancelada');
      if(modo==='audio'){conversion=convertir(archivos);const r=await conversion.promesa;return {...r,advertencia:fallos?`${fallos} archivo(s) no se pudieron guardar`:''};}
      return {archivos,advertencia:fallos?`${fallos} archivo(s) no se pudieron guardar`:''};
    })().finally(()=>clearTimeout(timer));
    return {promesa,cancelar(){abort.abort();conversion?.cancelar();}};
  }
  return {abrir,leer,descargar,cerrar(){ventana?.close();ventana=null;}};
}
module.exports={crearInstagram,publicacionInstagram,idMedia,mediosDePublicacion};
