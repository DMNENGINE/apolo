// GENERADO desde app/ojos-catalogo.js; no editar.
// Símbolos del HUD dibujados con curvas y trazos; no dependen de fuentes ni texturas.
const SIMBOLOS = new Set(['sol', 'luna', 'estrella', 'gota', 'radar', 'anillos', 'diamante', 'flor', 'pixel', 'rayo', 'nube', 'infinito', 'reloj_arena', 'espiral', 'cubo', 'flecha', 'engranaje', 'cruz', 'fuego', 'nota']);
export function dibujarOjoCatalogo(c, radio, nombre, ahora, reducido, parpadeo = 0) {
  if (!SIMBOLOS.has(nombre)) return false;
  c.save(); c.scale(radio, radio);
  const apertura = Math.max(.015, 1 - Math.sin(parpadeo * Math.PI));
  c.beginPath(); c.rect(-1.2, -1.15 * apertura, 2.4, 2.3 * apertura); c.clip();
  c.strokeStyle = '#9effdd'; c.fillStyle = '#dcfff3'; c.lineWidth = .1; c.lineJoin = c.lineCap = 'round';
  const linea = puntos => { c.beginPath(); puntos.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke(); };
  const circulo = (x,y,r) => { c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.stroke(); };
  const giro = reducido ? 0 : Math.sin(ahora / 1000) * .08;
  switch(nombre) {
    case 'sol':
      c.strokeStyle='#ffe383'; circulo(0,0,.45);
      for(let i=0;i<8;i++){const a=i*Math.PI/4+giro;linea([[Math.cos(a)*.65,Math.sin(a)*.65],[Math.cos(a)*.9,Math.sin(a)*.9]]);} break;
    case 'luna':
      c.fillStyle='#c6ccff'; c.beginPath(); c.arc(0,0,.85,.35,Math.PI*1.8); c.quadraticCurveTo(-.15,.1,.8,.29); c.fill(); break;
    case 'estrella':
      c.fillStyle='#ffe889';c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?.38:.95;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();break;
    case 'gota':
      c.strokeStyle='#88d8ff';c.beginPath();c.moveTo(0,-.95);c.bezierCurveTo(-1,.15,-.6,.85,0,.85);c.bezierCurveTo(.6,.85,1,.15,0,-.95);c.stroke();break;
    case 'radar':
      circulo(0,0,.85);circulo(0,0,.45);linea([[-.95,0],[.95,0]]);linea([[0,-.95],[0,.95]]);linea([[0,0],[.65,-.55]]);break;
    case 'anillos':
      circulo(0,0,.75);c.beginPath();c.ellipse(0,0,1,.27,-.4,0,Math.PI*2);c.stroke();circulo(0,0,.18);break;
    case 'diamante':
      c.strokeStyle='#a6dfff';linea([[0,-.95],[.8,0],[0,.95],[-.8,0],[0,-.95],[0,.95]]);linea([[-.8,0],[.8,0]]);break;
    case 'flor':
      c.strokeStyle='#ffb4e6';for(let i=0;i<5;i++){const a=i*Math.PI*2/5; c.beginPath();c.ellipse(Math.cos(a)*.46,Math.sin(a)*.46,.4,.22,a,0,Math.PI*2);c.stroke();}circulo(0,0,.2);break;
    case 'pixel':
      for(let y=0;y<5;y++)for(let x=0;x<5;x++)if((x===0||x===4||y===0||y===4)||x===2&&y===2)c.fillRect(-.85+x*.35,-.85+y*.35,.25,.25);break;
    case 'rayo':
      c.fillStyle='#ffe783';c.beginPath();for(const [x,y] of [[.1,-1],[-.65,.15],[-.12,.15],[-.3,1],[.7,-.25],[.15,-.25]])c.lineTo(x,y);c.closePath();c.fill();break;
    case 'nube':
      c.beginPath();c.moveTo(-.8,.5);c.bezierCurveTo(-1,-.2,-.65,-.5,-.35,-.3);c.bezierCurveTo(-.3,-1,.6,-1,.65,-.3);c.bezierCurveTo(1,-.2,1,.5,.7,.5);c.closePath();c.stroke();break;
    case 'infinito':
      c.strokeStyle='#d6b5ff';c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-1.2,-1,-1.2,1,0,0);c.bezierCurveTo(1.2,-1,1.2,1,0,0);c.stroke();break;
    case 'reloj_arena':
      c.strokeStyle='#ffd8a0';linea([[-.65,-.85],[.65,-.85],[-.65,.85],[.65,.85],[-.65,-.85]]);linea([[-.65,.85],[.65,.85]]);circulo(0,.4,.08);break;
    case 'espiral':
      c.strokeStyle='#b5baff';c.beginPath();for(let i=0;i<80;i++){const a=i*.16,r=i/90;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.stroke();break;
    case 'cubo':
      linea([[0,-.9],[.8,-.45],[.8,.5],[0,.95],[-.8,.5],[-.8,-.45],[0,-.9],[0,0],[.8,-.45]]);linea([[-.8,-.45],[0,0],[0,.95]]);break;
    case 'flecha':
      c.strokeStyle='#a5e5ff';linea([[0,.85],[0,-.85],[-.55,-.25],[0,-.85],[.55,-.25]]);break;
    case 'engranaje':
      c.beginPath();for(let i=0;i<32;i++){const a=i*Math.PI/16,r=i%4<2?.9:.68;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.stroke();circulo(0,0,.3);break;
    case 'cruz':
      c.strokeStyle='#a3ffcf';linea([[-.65,0],[.65,0]]);linea([[0,-.65],[0,.65]]);circulo(0,0,.9);break;
    case 'fuego':
      c.fillStyle='#ffc077';c.beginPath();c.moveTo(0,-1);c.bezierCurveTo(.9,-.2,1,.8,.1,.9);c.bezierCurveTo(-1,1,-1,-.1,-.4,-.4);c.quadraticCurveTo(-.5,.15,0,-1);c.fill();break;
    case 'nota':
      c.strokeStyle='#ffbcfa';linea([[-.35,.55],[-.35,-.6],[.5,-.8],[.5,.35]]);circulo(-.55,.6,.25);circulo(.3,.4,.25);break;
  }
  c.restore();return true;
}
