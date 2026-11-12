// Instagram en el Chrome del usuario: las credenciales permanecen dentro del navegador.
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
function crearInstagram({abrirExterno,navegador=()=>null,obtenerSesion,miniatura,leerPerfil,vincularPerfil}={}){
  leerPerfil ||= ()=>require('./abrir-chrome').leerPerfilChrome();
  vincularPerfil ||= id=>require('./abrir-chrome').vincularPerfilChrome(id);
  abrirExterno ||= url=>require('./abrir-chrome').abrirChrome(url);
  obtenerSesion ||= ()=>({fetch:(url,opciones)=>require('electron').net.fetch(url,{...opciones,credentials:'omit'})});
  miniatura ||= b=>{const n=require('electron').nativeImage.createFromBuffer(b);if(n.isEmpty())return '';const t=n.getSize(),escala=Math.min(1,200/t.width,140/t.height);return 'data:image/jpeg;base64,'+n.resize({width:Math.max(1,Math.round(t.width*escala)),height:Math.max(1,Math.round(t.height*escala))}).toJPEG(60).toString('base64');};
  const puente=()=>typeof navegador==='function'?navegador():navegador;
  const esChrome=n=>!n.estado?.().navegador||/chrome/i.test(n.estado().navegador);
  let marcaDestino=null, apertura=null;
  const vinculado=n=>!!n?.estado?.().instancia&&n.estado().instancia===leerPerfil()?.instancia;
  function estadoConexion(){
    const n=puente();
    if(!n?.conectado?.())return {paso:'conexion',mensaje:'La extensión de APOLO no está conectada. Conéctala en el Chrome de la cuenta elegida.'};
    if(!esChrome(n))return {paso:'navegador',mensaje:'La conexión activa pertenece a otro navegador. Conecta APOLO desde tu Chrome.'};
    if(!marcaDestino&&!vinculado(n))return {paso:'perfil',mensaje:'Pulsa el botón de tu cuenta Chrome para abrir y leer esta publicación con ese perfil.'};
    return {paso:'listo',mensaje:'Chrome conectado. Se intentará leer con la cuenta del perfil elegido.'};
  }
  async function pestana(n,p){
    const tabs=await n.orden('pestanas');
    const marcadas=tabs.filter(t=>publicacionInstagram(t.url)?.codigo===p.codigo&&marcaDestino&&(new URL(t.url).hash==='#apolo-snapgrab='+marcaDestino||t.destinoInstagram?.codigo===p.codigo&&t.destinoInstagram?.marca===marcaDestino));
    if(marcadas.length&&n.estado?.().instancia){try{vincularPerfil(n.estado().instancia);}catch{ /* La lectura marcada sigue siendo válida aunque no se guarde el vínculo. */ }}
    // Una pestaña nueva tras nuestra apertura también identifica el destino si Instagram quitó la marca.
    const nuevas=apertura&&apertura.codigo===p.codigo&&(apertura.confirmada!=null||Date.now()-apertura.fecha<45000)&&apertura.instancia===n.estado?.().instancia
      ?tabs.filter(t=>(apertura.confirmada!=null?t.id===apertura.confirmada:!apertura.ids.has(t.id))&&publicacionInstagram(t.url)?.codigo===p.codigo):[];
    if(nuevas.length===1)apertura.confirmada=nuevas[0].id;
    const candidatas=marcadas.length?marcadas:vinculado(n)?tabs.filter(t=>publicacionInstagram(t.url)?.codigo===p.codigo):nuevas;
    const activas=candidatas.filter(t=>t.activa);
    if(activas.length===1)return activas[0];
    if(candidatas.length===1)return candidatas[0];
    if(candidatas.length>1)throw new Error('Hay varias pestañas con esa publicación; activa la que quieres usar en Chrome');
    return null;
  }
  async function abrir(url){
    const p=publicacionInstagram(url);if(!p)throw new Error('Abre un post o reel de Instagram para conectar esta función');
    apertura=null;
    const n=puente();
    if(n?.conectado?.()&&esChrome(n)){
      try{const tabs=await n.orden('pestanas');apertura={codigo:p.codigo,fecha:Date.now(),instancia:n.estado?.().instancia,ids:new Set(tabs.map(t=>t.id))};}catch{ /* La marca sigue siendo la comprobación principal. */ }
    }
    const marca=require('node:crypto').randomUUID();
    const r=await abrirExterno(p.url+'#apolo-snapgrab='+marca);marcaDestino=marca;return r;
  }
  function leer(url,{esperar=false}={}){
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),45000);
    const promesa=(async()=>{
      const p=publicacionInstagram(url);if(!p)throw new Error('Esta función necesita un post o reel de Instagram');
      if(esperar){const limite=Date.now()+10000;while(Date.now()<limite&&!abort.signal.aborted){const n=puente();if(n?.conectado?.()&&esChrome(n)){const t=await pestana(n,p);if(t)break;}await new Promise(r=>setTimeout(r,500));}}
      if(abort.signal.aborted)throw new Error('Lectura cancelada');
      const n=puente();
      if(!n?.conectado?.()||!esChrome(n))throw new Error('Abre Instagram en Chrome con tu cuenta y conecta la extensión de APOLO en ese Chrome para Leer publicación');
      if(!marcaDestino&&!vinculado(n))throw new Error('Pulsa Abrir en Chrome para seleccionar la pestaña del perfil elegido antes de leer');
      const t=await pestana(n,p);if(!t)throw new Error('Chrome abrió la publicación, pero la conexión activa no permite identificar esa pestaña en el perfil elegido. Puede pertenecer a otro perfil o haberse perdido la marca de apertura; abrir el enlace no confirma la conexión de la extensión.');
      let datos;
      try{datos=await n.orden('instagram',{pestana:t.id,codigo:p.codigo},30000);}catch(e){
        if(/OPS\[o\.op\].*not a function|OPERACION_NO_SOPORTADA.*instagram|operación.*desconocida/i.test(e.message)){
          const version=n.estado?.().version;
          throw new Error('La conexión activa de APOLO no ofrece la función de lectura de Instagram. Comprueba que corresponda al Chrome del perfil elegido.'+(version?' Versión anunciada por esa conexión: '+version+'.':''));
        }
        throw e;
      }
      if(abort.signal.aborted)throw new Error('Lectura cancelada');
      const lectura=mediosDePublicacion(datos);
      for(const m of lectura.medios.filter(m=>m.tipo==='foto').slice(0,12))try{
        const r=await obtenerSesion().fetch(m.vista||m.url,{credentials:'omit',signal:abort.signal});
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
          const r=await obtenerSesion().fetch(m.url,{credentials:'omit',signal:abort.signal});
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
  return {abrir,leer,descargar,estado:estadoConexion,preparado:()=>estadoConexion().paso==='listo',cerrar(){marcaDestino=null;apertura=null; /* Chrome pertenece al usuario. */ }};
}
module.exports={crearInstagram,publicacionInstagram,idMedia,mediosDePublicacion};
