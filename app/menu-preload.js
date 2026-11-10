// Puente del menú de APOLO (main/menu-apolo.js ↔ app/menu.html).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('menuApolo', {
  contexto: () => ipcRenderer.invoke('menu-apolo-contexto'),
  ejecutar: a => ipcRenderer.invoke('menu-apolo-ejecutar', a),
  guardar: a => ipcRenderer.invoke('menu-apolo-guardar', a),
  borrar: id => ipcRenderer.invoke('menu-apolo-borrar', id),
  cerrar: () => ipcRenderer.send('menu-apolo-cerrar'),
});
