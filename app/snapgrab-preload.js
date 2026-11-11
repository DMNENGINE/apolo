const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('snapgrab',{
  accion:a=>ipcRenderer.invoke('snapgrab-accion',a),
  escuchar:fn=>{const recibir=(_e,d)=>fn(d);ipcRenderer.on('snapgrab-estado',recibir);return()=>ipcRenderer.removeListener('snapgrab-estado',recibir);}
});
