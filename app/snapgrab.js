const $=s=>document.querySelector(s);
let galeria=null,marcadas=new Set(),ocupado=false,pistasMostradas='',enlaceActual=null;
function actualizarSeleccion(){
  const n=marcadas.size;$('#cuenta-fotos').textContent=n?`${n} foto(s) marcada(s)`:'Ninguna marcada';
  $('#guardar-fotos').textContent=n?`Guardar ${n} foto(s)`:'Guardar selección';$('#guardar-fotos').disabled=ocupado||!n;
  $('#marcar-todas').disabled=ocupado||!galeria?.fotos.length;
  $('#marcar-todas').textContent=galeria?.fotos.length===n&&n?'Desmarcar todas':'Marcar todas';
  for(const c of document.querySelectorAll('#fotos input')){c.checked=marcadas.has(c.value);c.disabled=ocupado;}
}
function pintarGaleria(g){
  if(!g&&galeria){galeria=null;marcadas.clear();$('#galeria').hidden=true;$('#fotos').replaceChildren();}
  if(g&&g.revision!==galeria?.revision){
    galeria=g;marcadas=new Set(g.fotos.filter(f=>f.senalada).map(f=>f.id));$('#fotos').replaceChildren();
    for(const f of g.fotos){
      const l=document.createElement('label');l.className='foto';
      const c=document.createElement('input');c.type='checkbox';c.value=f.id;c.setAttribute('aria-label',f.titulo);c.onchange=()=>{c.checked?marcadas.add(f.id):marcadas.delete(f.id);actualizarSeleccion();};l.append(c);
      if(f.miniatura){const img=document.createElement('img');img.src=f.miniatura;img.alt='';img.loading='lazy';l.append(img);}else{const v=document.createElement('span');v.className='sin-miniatura';v.textContent='▧';l.append(v);}
      const t=document.createElement('span');t.className='leyenda';t.textContent=f.titulo;l.append(t);
      if(f.senalada){const s=document.createElement('span');s.className='senalada';s.textContent='Foto señalada';l.append(s);}
      $('#fotos').append(l);
    }
    $('#galeria').hidden=false;$('#nota-galeria').textContent=g.aviso||(!g.fotos.length?'No hay fotos originales accesibles en esta página. Puedes guardar un recorte.':'Selecciona las fotos que quieras conservar.');
  }
  actualizarSeleccion();
}
function pintar(e){
  ocupado=!!e.ocupado;
  $('#instagram').hidden=!e.instagramDisponible;$('#instagram-abrir').disabled=ocupado;$('#instagram-leer').disabled=ocupado;
  $('#instagram-estado').textContent=e.instagramConectado?'Publicación leída con la sesión de APOLO.':'';
  $('#analizar-enlace').disabled=ocupado;
  if(enlaceActual!==e.url){enlaceActual=e.url;if(document.activeElement!==$('#enlace'))$('#enlace').value=e.url||'';$('#recorte').hidden=true;foto=null;zona=null;inicio=null;}
  const spotify=e.info?.plataforma==='spotify';
  const opciones=$('#opciones-descarga'),referencia=spotify?$('#foto-visible'):$('#estado');
  if(opciones.nextElementSibling!==referencia)referencia.before(opciones);
  $('#musica').hidden=!spotify;
  if(spotify){
    $('#aviso-musica').textContent=e.info.avisoAudio;
    $('#limite-musica').textContent=`${e.info.cantidad} pista(s) accesible(s) · hasta ${e.info.limitePistas} por trabajo`;
    const clave=JSON.stringify(e.info.pistas||[]);if(clave!==pistasMostradas){pistasMostradas=clave;$('#pistas').replaceChildren();for(const p of e.info.pistas||[]){const li=document.createElement('li');li.textContent=p;$('#pistas').append(li);}}
  }
  $('#titulo-audio').textContent=spotify?'♫ Guardar MP3':'♫ Solo audio';$('#ayuda-audio').textContent=spotify?'Buscar en YouTube y convertir':'Guardar como MP3';
  $('#titulo-todo').textContent=spotify?'♫ Audio del álbum / lista':'↓ Todo';$('#ayuda-todo').textContent=spotify?'Hasta 20 pistas por trabajo':'Fotos y vídeo disponibles';
  $('#titulo').textContent=e.info?.titulo||e.titulo||'Contenido';$('#url').textContent=e.url||'';
  $('#detalle').textContent=e.info?`${e.info.plataforma} · ${e.info.cantidad} elemento(s)`:e.url?'Análisis de la publicación':'Imagen de la ventana · sin extensión';
  $('#foto-visible').hidden=!e.tieneCaptura;
  const fotoSenalada=e.tipoCaptura==='imagen';
  $('#foto-visible-texto').textContent=fotoSenalada?'▧ Guardar esta foto visible':'✂ Guardar una imagen visible';
  $('#foto-visible-ayuda').textContent=fotoSenalada?'Foto detectada bajo el clic · puedes ajustar sus bordes':'Sin extensión · selecciona la foto dentro de esta ventana';
  const recomendacion=spotify?'Spotify reconocido: revisa las pistas antes de guardar el audio.':fotoSenalada?'Foto señalada: su copia visible está lista para guardar.':e.info?.video&&!e.info.fotos?'Vídeo reconocido: puedes guardar el vídeo o extraer su audio.':e.info?.fotos&&!e.info.video?'Foto reconocida: puedes guardar el original o elegir en la galería.':'';
  $('#recomendacion').textContent=recomendacion;$('#recomendacion').hidden=!recomendacion;
  $('#abrir-galeria').disabled=ocupado||!(e.paginaUrl||e.url);$('#abrir-galeria').textContent=e.galeria?'↻ Actualizar fotos de esta página':'▧ Ver fotos de esta página';
  $('#estado').textContent=e.error||e.mensaje||'';$('#estado').classList.toggle('error',!!e.error);
  const p=$('#progreso');p.hidden=!e.ocupado;if(e.progreso==null)p.removeAttribute('value');else p.value=e.progreso;
  $('#cancelar').hidden=!e.ocupado;$('#reintentar').disabled=!!e.ocupado||!e.url;
  for(const b of document.querySelectorAll('[data-modo]')){const m=b.dataset.modo;b.hidden=spotify&&(['video','fotos'].includes(m)||m==='todo'&&e.info.cantidad===1);b.disabled=ocupado||!e.info||(m==='fotos'&&!e.info.fotos)||(m==='video'&&!e.info.video)||(m==='audio'&&!e.info.video&&!e.info.audio);b.classList.toggle('recomendada',spotify?m==='audio':m==='video'&&!!e.info?.video&&!e.info?.fotos||m==='fotos'&&!!e.info?.fotos&&!e.info?.video);}
  pintarGaleria(e.galeria);
  $('#ruta').textContent=e.carpeta?`Se guarda en ${e.carpeta}`:'';
  $('#resultado').textContent=e.archivos?.length?`${e.archivos.length} archivo(s) guardados`:e.ocupado?'Trabajando…':'Listo para esta página';
}
async function ejecutar(a){try{await window.snapgrab.accion(a);}catch(e){$('#estado').textContent=e.message;$('#estado').classList.add('error');}}
for(const tipo of ['cerrar','cancelar','carpeta'])$('#'+tipo).onclick=()=>ejecutar({tipo});
$('#reintentar').onclick=()=>ejecutar({tipo:'analizar'});
for(const b of document.querySelectorAll('[data-modo]'))b.onclick=()=>ejecutar({tipo:'descargar',modo:b.dataset.modo});
$('#enlace-form').onsubmit=e=>{e.preventDefault();ejecutar({tipo:'enlace',url:$('#enlace').value.trim()});};
$('#instagram-abrir').onclick=()=>ejecutar({tipo:'instagram-abrir'});
$('#instagram-leer').onclick=()=>ejecutar({tipo:'instagram-leer'});
$('#abrir-galeria').onclick=()=>ejecutar({tipo:'galeria'});
$('#marcar-todas').onclick=()=>{marcadas=marcadas.size===galeria.fotos.length?new Set():new Set(galeria.fotos.map(f=>f.id));actualizarSeleccion();};
$('#guardar-fotos').onclick=()=>ejecutar({tipo:'guardar-fotos',revision:galeria.revision,ids:[...marcadas]});
let foto=null,zona=null,inicio=null;
const vista=$('#vista'),ctx=vista.getContext('2d');
function dibujar(){
  if(!foto)return;ctx.clearRect(0,0,vista.width,vista.height);ctx.drawImage(foto,0,0);
  if(zona){ctx.strokeStyle='#3ddc84';ctx.lineWidth=Math.max(2,vista.width/350);ctx.strokeRect(zona.x,zona.y,zona.width,zona.height);}
  $('#guardar-recorte').disabled=!zona||zona.width<2||zona.height<2;
}
function punto(e){const r=vista.getBoundingClientRect();return{x:Math.max(0,Math.min(vista.width,Math.round((e.clientX-r.left)*vista.width/r.width))),y:Math.max(0,Math.min(vista.height,Math.round((e.clientY-r.top)*vista.height/r.height)))};}
$('#foto-visible').onclick=async()=>{
  try{const r=await window.snapgrab.accion({tipo:'captura'});foto=new Image();foto.src=r.imagen;await foto.decode();vista.width=r.width;vista.height=r.height;zona=r.tipo==='imagen'?{x:0,y:0,width:r.width,height:r.height}:null;
    $('#recorte').hidden=false;$('#recorte-estado').textContent='';$('#instruccion').textContent=r.tipo==='imagen'?'Esta es la imagen del clic. Puedes guardarla o ajustar el recorte.':'Arrastra sobre la foto para seleccionar qué guardar.';dibujar();$('#recorte').scrollIntoView({block:'nearest'});
  }catch(e){$('#estado').textContent=e.message;}
};
vista.onpointerdown=e=>{inicio=punto(e);vista.setPointerCapture(e.pointerId);zona=null;};
vista.onpointermove=e=>{if(!inicio)return;const p=punto(e);zona={x:Math.min(p.x,inicio.x),y:Math.min(p.y,inicio.y),width:Math.abs(p.x-inicio.x),height:Math.abs(p.y-inicio.y)};dibujar();};
vista.onpointerup=()=>{inicio=null;dibujar();};vista.onpointercancel=()=>{inicio=null;};
$('#cerrar-recorte').onclick=()=>{$('#recorte').hidden=true;};
$('#guardar-recorte').onclick=async()=>{try{const r=await window.snapgrab.accion({tipo:'guardar-imagen',recorte:zona});$('#recorte-estado').textContent='Guardada: '+r.archivo;}catch(e){$('#recorte-estado').textContent=e.message;}};
window.snapgrab.escuchar(pintar);
window.snapgrab.accion({tipo:'estado'}).then(pintar).catch(e=>{$('#estado').textContent=e.message;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')ejecutar({tipo:'cerrar'});});
