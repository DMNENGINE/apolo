// Lee exclusivamente la ventana que recibió el atajo, sin usar el portapapeles.
const path = require('node:path');
const { spawn } = require('node:child_process');
function capturarVentana(dir, contexto) {
  if (!/^\d+$/.test(String(contexto.hwnd || ''))) return Promise.reject(new Error('No se pudo identificar la ventana pulsada'));
  return new Promise((resolver,rechazar) => {
    const hijo=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(dir,'tools','leer-ventana.ps1'),'-Ventana',String(contexto.hwnd),'-X',String(Math.round(contexto.x||0)),'-Y',String(Math.round(contexto.y||0))],{windowsHide:true});
    let salida='',fallo='',terminado=false;
    const fin=(error,valor)=>{if(terminado)return;terminado=true;clearTimeout(limite);error?rechazar(error):resolver(valor)};
    const limite=setTimeout(()=>{hijo.kill();fin(new Error('La aplicación no respondió a la lectura de su ventana'));},8000);
    hijo.stdout.setEncoding('utf8');hijo.stdout.on('data',d=>{salida+=d;if(salida.length>512000){hijo.kill();fin(new Error('La ventana devolvió demasiado contenido'));}});
    hijo.stderr.on('data',d=>{fallo+=d;});hijo.on('error',e=>fin(e));
    hijo.on('close',codigo=>{
      try {
        if(codigo!==0)throw new Error('No se pudo leer la ventana elegida'+(fallo.trim()?': '+fallo.trim().slice(-200):''));
        const datos=JSON.parse(salida.trim());
        if(datos.error)throw new Error(datos.error);
        if(!datos.texto?.trim())throw new Error('La aplicación no ofrece texto accesible en la ventana pulsada; puede tratarse de una imagen o un visor');
        fin(null,datos);
      } catch(e){fin(e);}
    });
  });
}
module.exports={capturarVentana};
