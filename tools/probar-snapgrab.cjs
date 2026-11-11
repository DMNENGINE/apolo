// Genera un vídeo propio y prueba SnapGrab sin cuentas ni contenido del usuario.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn,execFileSync}=require('node:child_process');
const raiz=path.resolve(__dirname,'..'),salida=path.resolve(process.argv[2]||path.join(raiz,'repair-backups','snapgrab'));
fs.mkdirSync(salida,{recursive:true});
const ffmpeg=execFileSync('python',['-c',"import sys;sys.path.insert(0,'tools/snapgrab');import grab;print(grab.FFMPEG or '')"],{cwd:raiz,encoding:'utf8',windowsHide:true}).trim();
if(!ffmpeg)throw new Error('Se necesita ffmpeg para generar el vídeo de prueba');
const video=path.join(salida,'video-prueba.mp4');
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x10251b:s=320x180:r=15','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video],{windowsHide:true});
const foto=path.join(salida,'foto-prueba.png');
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',video,'-frames:v','1',foto],{windowsHide:true});
for(const [nombre,color] of [['uno','0xd95465'],['dos','0x35c8f0'],['tres','0x3ddc84']])execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`color=c=${color}:s=320x180`,'-frames:v','1',path.join(salida,`foto-${nombre}.png`)],{windowsHide:true});
const html='<!doctype html><meta charset="utf-8"><base href="/album/"><meta property="og:image" content="../foto-uno.png"><img src="../foto-uno.png"><img src="../foto-dos.png" alt="Foto azul"><img src="../baja.png" srcset="../baja.png 200w, ../foto-tres.png 1200w" alt="Foto verde"><img data-src="../foto-dos.png"><img src="../pixel.png" width="1" height="1"><img src="javascript:alert(1)"><img width src="../foto-tres.png"><img src="http://[malformada/">';
const srv=http.createServer((req,res)=>{
 const ruta=new URL(req.url,'http://localhost').pathname;
 if(ruta==='/galeria.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(req.method==='HEAD'?'':html);}
 const nombre=path.basename(ruta);const f=['foto-prueba.png','foto-uno.png','foto-dos.png','foto-tres.png'].includes(nombre)?path.join(salida,nombre):ruta==='/video-prueba.mp4'?video:null;
 if(!f){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':f.endsWith('.png')?'image/png':'video/mp4','Content-Length':fs.statSync(f).size});if(req.method==='HEAD')res.end();else fs.createReadStream(f).pipe(res);
});
srv.listen(0,'127.0.0.1',()=>{
 const electron=path.join(raiz,'node_modules','electron','dist','electron.exe');
 const p=spawn(electron,[path.join(__dirname,'probar-snapgrab-electron.cjs')],{windowsHide:true,env:{...process.env,APOLO_SNAPGRAB_PRUEBA:salida,APOLO_SNAPGRAB_URL:`http://127.0.0.1:${srv.address().port}/video-prueba.mp4`},stdio:['ignore','pipe','pipe']});
 p.stdout.pipe(process.stdout);p.stderr.pipe(process.stderr);p.on('error',e=>{console.error(e);srv.close();process.exitCode=1;});p.on('close',c=>{srv.close();process.exitCode=c||0;});
});
