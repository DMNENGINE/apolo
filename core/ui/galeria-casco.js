// GENERADO desde app/galeria-100.js; no editar.
import { createRobot } from './robot3d.js';
import { ANIMACIONES_CASCO as catalogo } from './animaciones-casco.js';
const robot = createRobot(document.querySelector('canvas'));robot.setFps(24);
let indice=0,temporizador=0;
window.robot=robot;window.catalogo=catalogo;
function reproducir(i){
 clearTimeout(temporizador);indice=(i+catalogo.length)%catalogo.length;const a=catalogo[indice];
 robot.cancelarGesto();robot.setState('reposo');robot.gesto(a.id,a.segundos);
 document.querySelector('#nombre').textContent=a.nombre;
 document.querySelector('#detalle').textContent=`${indice+1}/100 · ${a.familia} · ${a.segundos} segundos`;
 document.querySelectorAll('[data-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===a.id)));
 if(document.querySelector('#sucesion').checked)temporizador=setTimeout(()=>reproducir(indice+1),(a.segundos+1)*1000);
}
for(const familia of new Set(catalogo.map(a=>a.familia))){
 const h=document.createElement('h2');h.textContent=familia[0].toUpperCase()+familia.slice(1);document.querySelector('#familias').append(h);
 const lista=document.createElement('div');lista.className='lista';
 catalogo.forEach((a,i)=>{if(a.familia!==familia)return;const b=document.createElement('button');b.dataset.id=a.id;b.textContent=a.nombre;b.setAttribute('aria-pressed','false');b.onclick=()=>reproducir(i);lista.append(b)});
 document.querySelector('#familias').append(lista);
}
document.querySelector('#repetir').onclick=()=>reproducir(indice);
document.querySelector('#siguiente').onclick=()=>reproducir(indice+1);
document.querySelector('#azar').onclick=()=>reproducir(Math.floor(Math.random()*100));
document.querySelector('#parar').onclick=()=>{clearTimeout(temporizador);document.querySelector('#sucesion').checked=false;robot.cancelarGesto()};
document.querySelector('#sucesion').onchange=()=>{if(document.querySelector('#sucesion').checked)reproducir(indice);else clearTimeout(temporizador)};
addEventListener('pagehide',()=>{clearTimeout(temporizador);robot.destruir()});
