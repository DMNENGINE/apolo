// Comprueba texto visible y excluye campos editables con Edge headless.
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
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(0, '127.0.0.1');
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
const puerto = 9700 + Math.floor(Math.random() * 200);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${os.tmpdir()}/extraccion-${process.pid}-${Date.now()}`, '--window-size=300,300', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate',{url:`http://127.0.0.1:${srv.address().port}/app/galeria-aranas.html`});await dormir(700);
  const evaluar=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true});if(r.result.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result.result.value;};
  const motor=fs.readFileSync(path.join(RAIZ,'extension/aranas.js'),'utf8');
  const antiguo=args.includes('--antes')?fs.readFileSync(path.join(RAIZ,'repair-backups/aranas-contexto/extension-antes.js'),'utf8'):null;
  const fragmento='CONTENIDO_VISIBLE Una página corriente contiene información que la araña debe leer sin pedir una dirección. ';
  const casos=[
    {nombre:'div y span',html:'<div id="contenido">'+('<div><span>'+fragmento+'</span></div>').repeat(8)+'</div>'},
    {nombre:'readonly',html:'<div contenteditable="false">'+fragmento.repeat(8)+'</div><div contenteditable="true">PRIVADO_FICTICIO</div>'},
    {nombre:'display contents',html:'<div style="display:contents"><span>'+fragmento.repeat(8)+'</span></div>'},
    {nombre:'shadow abierto',html:'<mi-documento></mi-documento>',preparar:"document.querySelector('mi-documento').attachShadow({mode:'open'}).innerHTML='<span>CONTENIDO_VISIBLE Texto dentro de un componente abierto que debe poder leerse correctamente.</span>'"}
  ];
  const assert=require('node:assert/strict'),resultados=[];
  for(const caso of casos){
    await evaluar("window.__apoloAranas?.limpiar?.()");
    await evaluar('document.body.innerHTML='+JSON.stringify('<h1>Prueba de extracción: '+caso.nombre+'</h1>'+caso.html));
    if(caso.preparar)await evaluar(caso.preparar);
    await evaluar(args.includes('--antes')?antiguo:motor);
    const r=await evaluar("__apoloAranas.soltar({tipo:'lectora',cuantas:1})");
    resultados.push({caso:caso.nombre,caracteres:r.completo.length,bloques:r.bloques.length});
    if(!args.includes('--antes')){
      assert(r.completo.includes('CONTENIDO_VISIBLE'),caso.nombre+': lee el texto visible');assert(r.bloques.some(b=>b.texto.includes('CONTENIDO_VISIBLE')),caso.nombre+': crea bloques analizables');
      assert(!r.completo.includes('PRIVADO_FICTICIO'));assert(!r.bloques.some(b=>b.texto.includes('PRIVADO_FICTICIO')));
    }
    if(caso.nombre==='readonly')fs.writeFileSync(salida,Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
  }
  if(!args.includes('--antes')){
    await evaluar("window.__apoloAranas.limpiar();window.__apoloAranas={version:'antigua',limpiar(){window.actualizada=true;delete window.__apoloAranas}};");await evaluar(motor);
    assert(await evaluar('window.actualizada && !!__apoloAranas.extraer'),'Actualiza una inyección antigua');
  }
  if(errores.length)throw new Error(errores.join('\n'));
  fs.writeFileSync(salida+'.json',JSON.stringify(resultados,null,2));console.log(JSON.stringify(resultados));
  ws.close(); edge.kill(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
