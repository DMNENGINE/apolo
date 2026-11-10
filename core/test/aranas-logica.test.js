const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {crearAranas,PY_DISCORD}=require('../aranas');
const {lotesDeBloques}=require('../aranas-analisis');
const {resumirServidor}=require('../aranas-discord');

function montar(t,{bloques=[],generar,fetch,ejecutarSsh,conectado=true,tabs}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apolo-aranas-test-'));
 t.after(()=>{if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('apolo-aranas-test-'))fs.rmSync(dir,{recursive:true,force:true});});
 const pedidos=[],eventos=[],prompts=[],bus=new EventEmitter();bus.on('aranas',e=>eventos.push(e));
 const cfg={dir,aranas:{informes:path.join(dir,'informes'),abrirInforme:false,discord:{ssh:'prueba@equipo'}}};
 const navegador={conectado:()=>conectado,protegido:()=>false,orden:async(op,args)=>{
  pedidos.push({op,args});if(op==='pestanas')return tabs || [{id:7,activa:true,titulo:'Documento',url:'https://ejemplo.test/doc'}];
  if(args.accion==='soltar')return{titulo:'Documento',url:'https://ejemplo.test/doc',bloques,completo:bloques.map(b=>b.texto).join('\n\n')};
  return{ok:true};
 }};
 const generarJSON=async x=>{prompts.push(x);return{datos:await(generar?generar(x):{seccion:'Parte',resumen:'Resumen comprobado',puntos:['Dato'],titular:'Documento',explicacion:'Explicación',hallazgos:[]})};};
 const R=crearAranas({cfg,bus,navegador,generarJSON,fetch,ejecutarSsh});
 return{R,dir,cfg,pedidos,eventos,prompts};
}
const refs=prompt=>[...prompt.matchAll(/\[(\d+)\]\n/g)].map(m=>Number(m[1]));
test('rechaza tipos y pestañas inexistentes, sin elegir otra por su cuenta',async t=>{
 const{R,pedidos}=montar(t);
 await assert.rejects(R.soltar({tipo:'inventada'}),/desconocido/);
 await assert.rejects(R.soltar({tipo:'lectora',pestana:99}),/ya no existe/);
 assert.equal(pedidos.filter(p=>p.op==='aranas').length,0);assert.deepEqual(R.trabajando(),[]);
});
test('el menú puede exigir que la pestaña coincida con la ventana original',async t=>{
 const{R}=montar(t);await assert.rejects(R.soltar({tipo:'lectora',tituloObjetivo:'Otra página - Chrome'}),/no coincide/);
});
test('la lectora no declara éxito sobre una página sin texto',async t=>{
 const{R,prompts}=montar(t);await assert.rejects(R.soltar({tipo:'lectora'}),{code:'SIN_TEXTO_DOM'});assert.equal(prompts.length,0);
});
test('los lotes conservan completo el inicio y el final de los bloques largos',()=>{
 const texto='A'.repeat(14000)+'FINAL';const unidades=lotesDeBloques([{i:6,texto}]).flat();
 assert.equal(unidades.map(u=>u.texto).join(''),texto);assert(unidades.every(u=>u.i===6));
});
test('IA analiza más de cuarenta párrafos y acota probabilidades',async t=>{
 const bloques=Array.from({length:80},(_,i)=>({i,t:'texto',texto:('Párrafo '+i+' ').repeat(28)+(i===79?'ULTIMO_PARRAFO':'')}));
 const{R,prompts}=montar(t,{bloques,generar:({prompt})=>({veredicto:'Estimación',parrafos:refs(prompt).map(i=>({i,prob:140,senales:['Estilo uniforme']}))})});
 const resultado=await R.soltar({tipo:'ia'});assert(prompts.some(p=>p.prompt.includes('ULTIMO_PARRAFO')));assert.match(resultado,/100%/);assert.match(resultado,/80 párrafos/);assert.match(resultado,/completa/);
});
test('IA informa cobertura incompleta si falla un lote',async t=>{
 let n=0;const{R}=montar(t,{bloques:[{i:0,t:'texto',texto:'x'.repeat(21000)}],generar:({prompt})=>{if(n++===1)throw new Error('modelo no disponible');return{veredicto:'Estimación',parrafos:refs(prompt).map(i=>({i,prob:20,senales:[]}))};}});
 assert.match(await R.soltar({tipo:'ia'}),/INCOMPLETA/);
});
test('código revisa la cola del bloque y descarta frases inventadas',async t=>{
 const{R,dir,pedidos}=montar(t,{bloques:[{i:4,t:'codigo',texto:'// código\n'.repeat(1000)+'eval(entrada);'}],generar:({prompt})=>({resumen:'Revisión',hallazgos:prompt.includes('eval(entrada);')?[{i:refs(prompt).at(-1),severidad:'alta',tipo:'eval',frase:'eval(entrada);',explicacion:'Entrada no validada',arreglo:'Validar y evitar eval'},{i:refs(prompt)[0],severidad:'alta',tipo:'inventado',frase:'NO_EXISTE()',explicacion:'Inventado',arreglo:'Nada'}]:[]})});
 const resultado=await R.soltar({tipo:'codigo'});assert.match(resultado,/1 hallazgos/);assert.match(resultado,/descartados/);
 const marcas=pedidos.find(p=>p.args?.accion==='marcar').args.marcas;assert.equal(marcas.length,1);assert.equal(marcas[0].i,4);
 const inf=R.informes()[0];assert(fs.readFileSync(inf.archivo,'utf8').includes('Validar y evitar eval'));assert(inf.archivo.startsWith(dir));
});
test('archivos locales funcionan sin navegador y sin cambiar de objetivo',async t=>{
 const{R,dir,pedidos}=montar(t,{conectado:false,generar:()=>({resumen:'Código local',hallazgos:[]})});
 const archivo=path.join(dir,'código con espacios.js');fs.writeFileSync(archivo,'function ejemplo(){return 1;}');
 await R.soltar({tipo:'codigo',archivo});assert.equal(pedidos.length,0);
 await assert.rejects(R.soltar({tipo:'lectora',archivo:path.join(dir,'documento.pdf')}),/formato/);
});
test('dos informes del mismo título no se sobreescriben',async t=>{
 const{R}=montar(t,{bloques:[{i:0,t:'texto',texto:'Documento de prueba con texto suficiente.'}]});
 await R.soltar({tipo:'lectora'});await R.soltar({tipo:'lectora'});const informes=R.informes();assert.equal(informes.length,2);assert.notEqual(informes[0].archivo,informes[1].archivo);assert.notEqual(informes[0].id,informes[1].id);
});
test('Discord resume todos los mensajes capturados, incluidos los largos',async()=>{
 const prompts=[],mensajes=Array.from({length:90},(_,i)=>({t:'2026-11-10 '+String(i).padStart(3,'0'),a:'Usuario',c:i===89?'FINAL_DISCORD '+ 'L'.repeat(1400):'Mensaje '+i,emb:[]}));
 const d=await resumirServidor({nombre:'Prueba',canales:[{nombre:'general',mensajes}]},{horas:24,JSONm:async(s,p)=>{prompts.push(p);return{resumen:'Actividad',pendientes:[],destacados:[],enlaces:['https://inventado.test']};}});
 assert.equal(d.analizados,90);assert(prompts.some(p=>p.includes('FINAL_DISCORD')));assert(prompts.some(p=>p.includes('L'.repeat(1400))));assert.deepEqual(d.enlaces,[]);
});
test('Discord distingue canales sin acceso de ausencia de actividad',async t=>{
 const{R}=montar(t,{ejecutarSsh:async()=>JSON.stringify({servidores:[{nombre:'Prueba',canales:[]}],errores:['403 canal']})});
 await assert.rejects(R.soltar({tipo:'discord'}),/no permitió leer/);
});
test('radar usa datos reales de la respuesta y no repite las novedades',async t=>{
 const fetch=async url=>({ok:true,json:async()=>String(url).includes('api.github.com')?{items:[{full_name:'equipo/real',html_url:'https://github.com/equipo/real',description:'Proyecto real',stargazers_count:10}]}:[]});
 const{R}=montar(t,{fetch,generar:()=>({titular:'Selección',top:[{nombre:'inventado',url:'https://inventado.test',porque:'No existe'}],tendencias:[]})});
 const primero=await R.soltar({tipo:'radar'});assert(primero.includes('equipo/real'));assert(!primero.includes('inventado.test'));
 assert.match(await R.soltar({tipo:'radar'}),/sin novedades/);
});
test('Discord pagina los mensajes recientes sin leer credenciales ni usar red',t=>{
 const {spawnSync}=require('node:child_process');
 const python=['python','python3'].find(p=>spawnSync(p,['--version'],{encoding:'utf8'}).status===0);
 if(!python){t.skip('No hay Python para la prueba del recolector remoto');return;}
 const cola=PY_DISCORD.slice(PY_DISCORD.indexOf('after ='));
 const simulado=`import json,time,urllib.parse
time.time=lambda:1800000000
+a={'horas':24,'maxCanales':1,'maxMensajes':150}
+errores=[]; rutas=[]
+corte=(int((time.time()-86400)*1000)-1420070400000)<<22
+datos=[{'id':str(corte+i),'author':{'username':'U'+str(i)},'timestamp':'2026-11-10T10:00','content':'L'*1400} for i in range(1,251)]
+def api(ruta):
+    rutas.append(ruta)
+    if ruta=='/users/@me/guilds':return [{'id':'1','name':'Prueba'}]
+    if ruta=='/guilds/1/channels':return [{'id':'2','name':'general','type':0}]
+    q=urllib.parse.parse_qs(urllib.parse.urlparse(ruta).query);antes=int(q.get('before',[str(corte+999)])[0]);limite=int(q['limit'][0])
+    return sorted([m for m in datos if int(m['id'])<antes],key=lambda m:int(m['id']),reverse=True)[:limite]
+`.replace(/^\+/gm,'');
 const r=spawnSync(python,['-c',simulado+'\n'+cola+"\nprint(json.dumps(rutas))"],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const lineas=r.stdout.trim().split('\n'),j=JSON.parse(lineas[0]),rutas=JSON.parse(lineas[1]);
 const mensajes=j.servidores[0].canales[0].mensajes;
 assert.equal(mensajes.length,150);assert.equal(mensajes[0].a,'U101');assert.equal(mensajes.at(-1).a,'U250');assert.equal(mensajes[0].c.length,1400);
 assert(rutas.some(r=>r.includes('&before=')));assert(rutas.some(r=>r.includes('limit=50')));
});

test('el menú encuentra la pestaña de la ventana pulsada aunque otra figure activa',async t=>{
 const{R,pedidos}=montar(t,{tabs:[{id:7,activa:true,titulo:'Otra',url:'https://ejemplo.test/otra'},{id:8,activa:false,titulo:'Documento',url:'https://ejemplo.test/doc'}],bloques:[{i:0,t:'texto',texto:'Texto local de prueba.'}]});
 await R.soltar({tipo:'lectora',tituloObjetivo:'Documento - Chrome'});
 assert.equal(pedidos.find(p=>p.op==='aranas').args.pestana,8);
});

test('el contexto de una aplicación se analiza sin enlace ni navegador',async t=>{
 const{R,prompts,pedidos}=montar(t,{conectado:false});
 const r=await R.soltar({tipo:'lectora',contexto:{texto:'Texto visible del documento de prueba.',titulo:'Editor',fuente:'texto visible de ventana'}});
 assert.equal(pedidos.length,0);assert(prompts.some(x=>x.prompt.includes('Texto visible del documento de prueba.')));assert(r.includes('Editor'));
});
 test('IA reconoce texto distribuido en fragmentos cortos',async t=>{
 const bloques=Array.from({length:20},(_,i)=>({i,t:'texto',texto:'Fragmento visible '+i}));
 const{R}=montar(t,{bloques,generar:({prompt})=>({veredicto:'Estimaci?n',parrafos:refs(prompt).map(i=>({i,prob:30,senales:[]}))})});
 assert.match(await R.soltar({tipo:'ia'}),/20 párrafos/);
});
