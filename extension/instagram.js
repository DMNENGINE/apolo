// Se serializa dentro de la pestaña: no lee cookies, campos de acceso ni tokens.
function destinoInstagramSnapgrab(valor){
  try{const u=new URL(valor),m=/^#apolo-snapgrab=([a-z0-9-]{8,80})$/i.exec(u.hash),p=/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(u.pathname);
    return u.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(u.hostname)&&m&&p?{marca:m[1],codigo:p[1]}:null;
  }catch{return null;}
}
async function registrarDestinoInstagram(tabId,url){
  const destino=destinoInstagramSnapgrab(url);if(!destino)return;
  const {destinosInstagram={}}=await chrome.storage.session.get('destinosInstagram');destinosInstagram[tabId]=destino;
  const claves=Object.keys(destinosInstagram);for(const k of claves.slice(0,Math.max(0,claves.length-64)))delete destinosInstagram[k];
  await chrome.storage.session.set({destinosInstagram});
}
async function leerInstagramEnPestana(codigo){
  if(!/^[A-Za-z0-9_-]+$/.test(codigo))throw new Error('Publicación no válida');
  const post=()=>{
    if(!['www.instagram.com','instagram.com'].includes(location.hostname))return null;
    return /^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname)?.[1];
  };
  if(post()!==codigo)throw new Error('La pestaña ya no muestra la publicación elegida');
  const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let id=0n;
  for(const c of codigo.slice(0,11))id=id*64n+BigInt(abc.indexOf(c));
  const r=await fetch(location.origin+'/api/v1/media/'+id+'/info/',{credentials:'include',headers:{'X-IG-App-ID':'936619743392459'},signal:AbortSignal.timeout(25000)});
  if([401,403].includes(r.status))throw new Error('Inicia sesión en Instagram en este Chrome y vuelve a Leer publicación');
  if(r.status===429)throw new Error('Instagram ha limitado las solicitudes; espera antes de reintentarlo');
  if(!r.ok)throw new Error('Instagram no permite leer esta publicación (HTTP '+r.status+')');
  const j=await r.json();if(post()!==codigo)throw new Error('La pestaña cambió durante la lectura; vuelve al post elegido');
  const p=j.items?.[0];if(!p)throw new Error('Instagram no entregó archivos accesibles para esta cuenta');
  const limpiar=m=>({media_type:m.media_type,image_versions2:{candidates:(m.image_versions2?.candidates||[]).slice(0,10).map(v=>({url:v.url,width:v.width,height:v.height}))},video_versions:(m.video_versions||[]).slice(0,10).map(v=>({url:v.url,width:v.width,height:v.height}))});
  return {items:[{caption:{text:String(p.caption?.text||'Publicación de Instagram').slice(0,140)},carousel_media:(p.carousel_media||[p]).slice(0,20).map(limpiar)}]};
}
