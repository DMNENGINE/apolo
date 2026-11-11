const $=s=>document.querySelector(s);
function pintar(e){
  $('#titulo').textContent=e.info?.titulo||e.titulo||'Contenido';$('#url').textContent=e.url||'';
  $('#detalle').textContent=e.info?`${e.info.plataforma} · ${e.info.cantidad} elemento(s)`:'Análisis de la publicación';
  $('#estado').textContent=e.error||e.mensaje||'';$('#estado').classList.toggle('error',!!e.error);
  const p=$('#progreso');p.hidden=!e.ocupado;if(e.progreso==null)p.removeAttribute('value');else p.value=e.progreso;
  $('#cancelar').hidden=!e.ocupado;$('#reintentar').disabled=!!e.ocupado;
  for(const b of document.querySelectorAll('[data-modo]'))b.disabled=!!e.ocupado||!e.info||(b.dataset.modo==='fotos'&&!e.info.fotos)||(['video','audio'].includes(b.dataset.modo)&&!e.info.video);
  $('#ruta').textContent=e.carpeta?`Se guarda en ${e.carpeta}`:'';
  $('#resultado').textContent=e.archivos?.length?`${e.archivos.length} archivo(s) guardados`:e.ocupado?'Trabajando…':'Listo para esta página';
}
async function ejecutar(a){try{await window.snapgrab.accion(a);}catch(e){$('#estado').textContent=e.message;$('#estado').classList.add('error');}}
for(const tipo of ['cerrar','cancelar','carpeta'])$('#'+tipo).onclick=()=>ejecutar({tipo});
$('#reintentar').onclick=()=>ejecutar({tipo:'analizar'});
for(const b of document.querySelectorAll('[data-modo]'))b.onclick=()=>ejecutar({tipo:'descargar',modo:b.dataset.modo});
window.snapgrab.escuchar(pintar);
window.snapgrab.accion({tipo:'estado'}).then(pintar).catch(e=>{$('#estado').textContent=e.message;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')ejecutar({tipo:'cerrar'});});
