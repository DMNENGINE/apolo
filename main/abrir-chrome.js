// Usar el perfil elegido, sin leer cookies ni abrir un perfil de depuración.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function leerPerfilChrome(){
  try{const c=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/snapgrab/chrome-perfil.json'),'utf8'));if(/^(Default|Profile [0-9]+)$/.test(c.perfil))return {perfil:c.perfil,cuenta:String(c.cuenta||''),instancia:String(c.instancia||'')};}catch{}
  return null;
}
function vincularPerfilChrome(instancia){
  if(!/^[a-z0-9-]{8,80}$/i.test(instancia))return;
  const archivo=path.join(__dirname,'../tools/snapgrab/chrome-perfil.json');
  const c=JSON.parse(fs.readFileSync(archivo,'utf8'));c.instancia=instancia;fs.writeFileSync(archivo,JSON.stringify(c,null,2)+'\n','utf8');
}
function abrirChrome(url,{existe=fs.existsSync,lanzar=spawn,entorno=process.env,perfil=leerPerfilChrome()?.perfil}={}){
  if(perfil&&!/^(Default|Profile [0-9]+)$/.test(perfil))throw new Error('Perfil de Chrome no válido');
  const bases=[entorno.PROGRAMFILES,entorno['PROGRAMFILES(X86)'],entorno.LOCALAPPDATA].filter(Boolean);
  const ejecutable=bases.map(b=>path.join(b,'Google','Chrome','Application','chrome.exe')).find(existe);
  if(!ejecutable)throw new Error('No se encontró Google Chrome instalado');
  return new Promise((resolver,rechazar)=>{
    const p=lanzar(ejecutable,[...(perfil?['--profile-directory='+perfil]:[]),url],{detached:true,windowsHide:true,stdio:'ignore'});
    p.once('error',rechazar);p.once('spawn',()=>{p.unref();resolver({ok:true});});
  });
}
module.exports={abrirChrome,leerPerfilChrome,vincularPerfilChrome};
