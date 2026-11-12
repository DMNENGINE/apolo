// Abrir con el perfil que Chrome gestione; no leer perfiles ni crear uno de depuración.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function abrirChrome(url,{existe=fs.existsSync,lanzar=spawn,entorno=process.env}={}){
  const bases=[entorno.PROGRAMFILES,entorno['PROGRAMFILES(X86)'],entorno.LOCALAPPDATA].filter(Boolean);
  const ejecutable=bases.map(b=>path.join(b,'Google','Chrome','Application','chrome.exe')).find(existe);
  if(!ejecutable)throw new Error('No se encontró Google Chrome instalado');
  return new Promise((resolver,rechazar)=>{
    const p=lanzar(ejecutable,[url],{detached:true,windowsHide:true,stdio:'ignore'});
    p.once('error',rechazar);p.once('spawn',()=>{p.unref();resolver({ok:true});});
  });
}
module.exports={abrirChrome};
