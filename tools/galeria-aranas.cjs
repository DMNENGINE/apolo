// Captura el motor y las rutas reales de salida y regreso de las arañas.
// Hoja de gestos del robot: abre app/galeria.html en Edge headless (CDP), pone cada gesto y lo captura;
// luego compone todas las capturas en una sola imagen (canvas de la propia página).
//   node tools/galeria-robot.js [salida.png] [--fotos carpeta]   --fotos: además, un PNG transparente por gesto (para la web)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const args = process.argv.slice(2), iF = args.indexOf('--fotos');
const dirFotos = iF >= 0 ? args.splice(iF, 2)[1] : null;
const salida = args[0] || path.join(os.tmpdir(), 'galeria-robot.png');
// [gesto, etiqueta, opciones, ms de espera antes de capturar]


const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(RAIZ)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); if(args.includes('--antes') && /arana-motor\.js$/.test(f))d=fs.readFileSync(path.join(RAIZ,'repair-backups/aranas-pulido/arana-antes.js')); r.end(d); });
}).listen(0, '127.0.0.1');
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
const puerto = 9700 + Math.floor(Math.random() * 200);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${os.tmpdir()}/aranas-${process.pid}-${Date.now()}`, '--window-size=300,300', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
(async () => {
  let pag; for (let i = 0; i < 100 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
  const ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise(ok => ws.onopen = ok);
  let n = 0; const esp = new Map(), errores = [];
  ws.onmessage = m => {
    const j = JSON.parse(m.data);
    if (j.method === 'Runtime.exceptionThrown') errores.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
    esp.get(j.id)?.(j); esp.delete(j.id);
  };
  const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esp.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1120, height: 820, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate',{url:`http://127.0.0.1:${srv.address().port}/app/galeria-aranas.html`});
  await dormir(1800);
  const evaluar=async expression=>(await cdp('Runtime.evaluate',{expression,returnByValue:true})).result.result.value;
  require('assert/strict').equal(await evaluar('estadosAranas.length'),8);
  const foto=await cdp('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(salida,Buffer.from(foto.result.data,'base64'));
  if(!args.includes('--antes')) {
    await evaluar("document.querySelector('#salir').click()");await dormir(1600);
    fs.writeFileSync(salida.replace('.png','-salida.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    await dormir(3000);
    await evaluar("window.retornos=[];const original=AranaMotor.crear;AranaMotor.crear=(...args)=>{const a=original(...args);retornos.push(a);return a};document.querySelector('#volver').click()");await dormir(1200);
    fs.writeFileSync(salida.replace('.png','-regreso.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    const retorno=await evaluar("retornos.map(a=>{while(a.tiempo<4.6&&!a.fuera)AranaMotor.mover(a,1/60);return {fuera:a.fuera,t:a.tiempo,r:a.r}})");
    require('assert/strict').equal(retorno.length,2);
    require('assert/strict')(retorno.every(a=>a.fuera&&a.r<=2),'Deben entrar en el nido antes de cerrar el visor');
    console.log('Retorno al nido',JSON.stringify(retorno));
  }
  if(!args.includes('--antes')) {
    await evaluar("document.body.innerHTML='<main style=\"max-width:850px;margin:40px auto\"><h1>Documento local de prueba</h1><p>'+('Las arañas de APOLO recorren palabras y señalan el texto leído. Esta prueba usa contenido local sin abrir páginas externas. ').repeat(12)+'</p></main>'");
    await cdp('Runtime.evaluate',{expression:fs.readFileSync(path.join(RAIZ,'extension','aranas.js'),'utf8')});
    const lectura=await evaluar("__apoloAranas.soltar({tipo:'lectora',cuantas:1})");
    require('assert/strict')(lectura.total>0 && lectura.completo.includes('Documento local de prueba'));
    let progreso;
    for(let i=0;i<40;i++) {
      await dormir(250);progreso=(await evaluar('__apoloAranas.estado()')).aranas[0];
      if(progreso?.pct>0)break;
      require('assert/strict').notEqual(progreso?.estado,'leído ✓','No puede dar por leído texto que queda arriba');
    }
    require('assert/strict')(progreso?.pct>0,'Debe recorrer palabras aunque la entrada quede debajo del texto');
    fs.writeFileSync(salida.replace('.png','-lectora.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    require('assert/strict').equal((await evaluar('__apoloAranas.estado()')).aranas.length,1);
    require('assert/strict').equal((await evaluar('__apoloAranas.recoger({})')).ok,true);
    console.log('OK: extensión sobre texto local, extracción y recogida');
  }
  if(errores.length)throw new Error(errores.join('\n'));
  console.log('OK: ocho poses, salida y regreso sin errores JavaScript',salida);
  ws.close(); edge.kill(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
