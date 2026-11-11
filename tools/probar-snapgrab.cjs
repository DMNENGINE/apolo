// Genera un vídeo propio y prueba SnapGrab sin cuentas ni contenido del usuario.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn,execFileSync}=require('node:child_process');
const raiz=path.resolve(__dirname,'..'),salida=path.resolve(process.argv[2]||path.join(raiz,'repair-backups','snapgrab'));
fs.mkdirSync(salida,{recursive:true});
const ffmpeg=execFileSync('python',['-c',"import sys;sys.path.insert(0,'tools/snapgrab');import grab;print(grab.FFMPEG or '')"],{cwd:raiz,encoding:'utf8',windowsHide:true}).trim();
if(!ffmpeg)throw new Error('Se necesita ffmpeg para generar el vídeo de prueba');
const video=path.join(salida,'video-prueba.mp4');
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x10251b:s=320x180:r=15','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video],{windowsHide:true});
const srv=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':fs.statSync(video).size});fs.createReadStream(video).pipe(res);});
srv.listen(0,'127.0.0.1',()=>{
 const electron=path.join(raiz,'node_modules','electron','dist','electron.exe');
 const p=spawn(electron,[path.join(__dirname,'probar-snapgrab-electron.cjs')],{windowsHide:true,env:{...process.env,APOLO_SNAPGRAB_PRUEBA:salida,APOLO_SNAPGRAB_URL:`http://127.0.0.1:${srv.address().port}/video-prueba.mp4`},stdio:['ignore','pipe','pipe']});
 p.stdout.pipe(process.stdout);p.stderr.pipe(process.stderr);p.on('error',e=>{console.error(e);srv.close();process.exitCode=1;});p.on('close',c=>{srv.close();process.exitCode=c||0;});
});
