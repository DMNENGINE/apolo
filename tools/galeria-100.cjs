// Captura y valida las 100 animaciones en Edge headless; guarda diez hojas por familia.
// Uso: node tools/galeria-100.cjs [carpeta-salida]
// Hoja de gestos del robot: abre app/galeria.html en Edge headless (CDP), pone cada gesto y lo captura;
// luego compone todas las capturas en una sola imagen (canvas de la propia página).
//   node tools/galeria-robot.js [salida.png] [--fotos carpeta]   --fotos: además, un PNG transparente por gesto (para la web)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const args = process.argv.slice(2), iF = args.indexOf('--fotos');
const dirFotos = iF >= 0 ? args.splice(iF, 2)[1] : null;
const soloGaleria = args.includes('--solo-galeria');
const carpeta = path.resolve(args.filter(a=>!a.startsWith('--'))[0] || 'repair-backups/catalogo-100'); fs.mkdirSync(carpeta,{recursive:true});
const salida = path.join(carpeta,'vista-general.png');
// [gesto, etiqueta, opciones, ms de espera antes de capturar]
let GESTOS;


const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if(f.startsWith(path.join(RAIZ,'core','ui')+path.sep))r.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:");
  if (!f.startsWith(RAIZ)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); if (f.endsWith('app' + path.sep + 'robot.js')) {
 let codigo = d.toString().replace('evaluarAnimacionCasco(receta, (now - gestoIni) / Math.max(1, gestoHasta - gestoIni),', 'evaluarAnimacionCasco(receta, window.__fasePrueba ?? (now - gestoIni) / Math.max(1, gestoHasta - gestoIni),');
 codigo = codigo.replace('    renderer.render(scene, camera);', '    window.__pose = {id:receta?.id,piezas:piezas.map(p=>({nombre:p.nombre,v:[p.grupo.position.x-p.base.x,p.grupo.position.y-p.base.y,p.grupo.position.z-p.base.z,p.grupo.rotation.x,p.grupo.rotation.y,p.grupo.rotation.z]})),visor:bisagra.rotation.x,escala:head.scale.toArray()};renderer.render(scene,camera);');
 d=Buffer.from(codigo);
 } r.end(d); });
}).listen(0, '127.0.0.1');
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
const puerto = 9700 + Math.floor(Math.random() * 200);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${os.tmpdir()}/robot-edge-catalogo-${process.pid}-${Date.now()}`, '--window-size=300,300', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
(async () => {
  const fuente=fs.readFileSync(path.join(RAIZ,'app/animaciones-casco.js'),'utf8');
  const {ANIMACIONES_CASCO:catalogo,evaluarAnimacionCasco:evaluar}=await import('data:text/javascript;base64,'+Buffer.from(fuente).toString('base64'));
  const assert=require('node:assert/strict');
  GESTOS=soloGaleria?[]:catalogo.map(a=>[a.id,a.nombre,{secs:30},180]);
  let pag; for (let i = 0; i < 120 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
  if (!pag) throw new Error('Edge no abrió el puerto de depuración');
  const ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise(ok => ws.onopen = ok);
  let n = 0; const esp = new Map(), errores = [];
  ws.onmessage = m => {
    const j = JSON.parse(m.data);
    if (j.method === 'Runtime.exceptionThrown') errores.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
    esp.get(j.id)?.(j); esp.delete(j.id);
  };
  const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esp.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 300, height: 300, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/app/galeria.html` });
  await dormir(4000);
  if (dirFotos) {                                         // fondo transparente y sin etiqueta para las fotos sueltas
    fs.mkdirSync(dirFotos, { recursive: true });
    await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp('Runtime.evaluate', { expression: "document.documentElement.style.background='transparent'; document.body.style.background='transparent'; document.getElementById('t').style.display='none'" });
  }
  const fotos = []; const estados=[];
  await cdp('Runtime.evaluate',{expression:'window.__fasePrueba=.43;robot.setFps(15)'});
  for (const [g, et, op, ms] of GESTOS) {
    await cdp('Runtime.evaluate', { expression: `mostrar(${JSON.stringify(g)}, ${JSON.stringify(et)}, ${JSON.stringify(op)})` });
    await dormir(ms);
    const foto = (await cdp('Page.captureScreenshot', { format: 'png' })).result.data;
    fotos.push(foto);
    const pose=(await cdp('Runtime.evaluate',{expression:'window.__pose',returnByValue:true})).result.result.value;
    assert.equal(pose.id,g,'El render debe corresponder a la animación solicitada');
    assert.equal(pose.piezas.length,4);
    const esperado=evaluar(catalogo[fotos.length-1],.43);
    for(const pieza of pose.piezas) assert(pieza.v.every((v,i)=>Math.abs(v-esperado.piezas[pieza.nombre][i])<1e-6),g+': mecánica correcta');
    await cdp('Runtime.evaluate',{expression:"robot.setState('permiso')"});await dormir(120);
    const cancelada=(await cdp('Runtime.evaluate',{expression:'window.__pose',returnByValue:true})).result.result.value;
    assert.equal(cancelada.id,undefined,g+': permiso interrumpe');
    assert(cancelada.piezas.every(p=>p.v.every(v=>Math.abs(v)<1e-6)),g+': restitución completa');
    estados.push({id:g,validada:true});
    if(fotos.length%10===0)console.log('Capturadas y verificadas',fotos.length,'/100');
    if (dirFotos) fs.writeFileSync(path.join(dirFotos, `robot-${et.split(' ')[0].normalize('NFD').replace(/[^a-z0-9]/gi, '').toLowerCase()}.png`), Buffer.from(foto, 'base64'));
  }
  for(let familia=0;!soloGaleria&&familia<10;familia++) {
    const imagenes=fotos.slice(familia*10,familia*10+10);
    const r=await cdp('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const fotos=${JSON.stringify(imagenes)};const cv=document.createElement('canvas');cv.width=1500;cv.height=600;
      const x=cv.getContext('2d');x.fillStyle='#11151b';x.fillRect(0,0,1500,600);
      for(let i=0;i<fotos.length;i++){const im=new Image();im.src='data:image/png;base64,'+fotos[i];await im.decode();x.drawImage(im,i%5*300,Math.floor(i/5)*300);}
      return cv.toDataURL('image/png').split(',')[1];})()`});
    fs.writeFileSync(path.join(carpeta,`${String(familia+1).padStart(2,'0')}-${catalogo[familia*10].familia}.png`),Buffer.from(r.result.result.value,'base64'));
  }
  if(!soloGaleria)fs.writeFileSync(path.join(carpeta,'verificacion.json'),JSON.stringify({animaciones:estados,errores},null,2));
  if(errores.length)throw new Error(errores.join('\n'));
  // Prueba los controles de la galería interactiva real.
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  for(const pagina of ['app/galeria-100.html','core/ui/galeria-casco.html']) {
  await cdp('Page.navigate',{url:`http://127.0.0.1:${srv.address().port}/${pagina}`});await dormir(2500);
  const botones=(await cdp('Runtime.evaluate',{expression:"document.querySelectorAll('[data-id]').length",returnByValue:true})).result.result.value;
  assert.equal(botones,100);
  await cdp('Runtime.evaluate',{expression:"document.querySelector('[data-id=forma_nave]').click()"});await dormir(400);
  const titulo=(await cdp('Runtime.evaluate',{expression:"document.querySelector('#nombre').textContent",returnByValue:true})).result.result.value;
  assert.equal(titulo,'Forma de nave');
  await cdp('Runtime.evaluate',{expression:"document.querySelector('#parar').click()"});await dormir(200);
  assert.equal((await cdp('Runtime.evaluate',{expression:'robot.ocupado()',returnByValue:true})).result.result.value,false);
  fs.writeFileSync(path.join(carpeta,pagina.startsWith('core')?'galeria-panel.png':'galeria-interactiva.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
  if(errores.length)throw new Error(errores.join('\n'));
  }
  console.log('ok', carpeta, `(${GESTOS.length} gestos)`, '\nerrores JS:', errores.length ? errores.join('\n') : 'ninguno');
  ws.close(); edge.kill(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
