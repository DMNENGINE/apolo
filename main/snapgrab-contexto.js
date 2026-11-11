// Consulta únicamente la ventana del clic: dirección accesible y copia visual.
const {spawn}=require('node:child_process');
const path=require('node:path');
function capturarContexto(dir,c){
  if(!/^\d+$/.test(String(c.hwnd||''))||String(c.hwnd)==='0')return Promise.reject(new Error('No se identificó la ventana del clic'));
  return new Promise((resolver,rechazar)=>{
    const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(dir,'tools','snapgrab-contexto.ps1'),'-Ventana',String(c.hwnd),'-X',String(Math.round(c.x||0)),'-Y',String(Math.round(c.y||0))],{windowsHide:true});
    let texto='',terminado=false;
    const fin=(e,r)=>{if(terminado)return;terminado=true;clearTimeout(limite);e?rechazar(e):resolver(r);};
    const limite=setTimeout(()=>{p.kill();fin(new Error('La ventana no respondió a la captura'));},12000);
    p.stdout.setEncoding('utf8');p.stdout.on('data',d=>{texto+=d;if(texto.length>24*1024*1024){p.kill();fin(new Error('La captura de la ventana es demasiado grande'));}});
    p.stderr.resume();p.on('error',e=>fin(e));
    p.on('close',codigo=>{try{if(codigo!==0)throw new Error('No se pudo consultar la ventana del clic');const r=JSON.parse(texto.trim());if(r.error)throw new Error(r.error);fin(null,r);}catch(e){fin(e);}});
  });
}
module.exports={capturarContexto};
