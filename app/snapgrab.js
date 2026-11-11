const $=s=>document.querySelector(s);
function pintar(e){
  $('#titulo').textContent=e.info?.titulo||e.titulo||'Contenido';$('#url').textContent=e.url||'';
  $('#detalle').textContent=e.info?`${e.info.plataforma} · ${e.info.cantidad} elemento(s)`:e.url?'Análisis de la publicación':'Imagen de la ventana · sin extensión';
  $('#foto-visible').hidden=!e.tieneCaptura;
  $('#estado').textContent=e.error||e.mensaje||'';$('#estado').classList.toggle('error',!!e.error);
  const p=$('#progreso');p.hidden=!e.ocupado;if(e.progreso==null)p.removeAttribute('value');else p.value=e.progreso;
  $('#cancelar').hidden=!e.ocupado;$('#reintentar').disabled=!!e.ocupado||!e.url;
  for(const b of document.querySelectorAll('[data-modo]'))b.disabled=!!e.ocupado||!e.info||(b.dataset.modo==='fotos'&&!e.info.fotos)||(['video','audio'].includes(b.dataset.modo)&&!e.info.video);
  $('#ruta').textContent=e.carpeta?`Se guarda en ${e.carpeta}`:'';
  $('#resultado').textContent=e.archivos?.length?`${e.archivos.length} archivo(s) guardados`:e.ocupado?'Trabajando…':'Listo para esta página';
}
async function ejecutar(a){try{await window.snapgrab.accion(a);}catch(e){$('#estado').textContent=e.message;$('#estado').classList.add('error');}}
for(const tipo of ['cerrar','cancelar','carpeta'])$('#'+tipo).onclick=()=>ejecutar({tipo});
$('#reintentar').onclick=()=>ejecutar({tipo:'analizar'});
for(const b of document.querySelectorAll('[data-modo]'))b.onclick=()=>ejecutar({tipo:'descargar',modo:b.dataset.modo});
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
