// Puente del menú de APOLO (main/menu-apolo.js ↔ app/menu.html): solo estas tres cosas.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('menuApolo', {
  contexto: () => ipcRenderer.invoke('menu-apolo-contexto'),
  ejecutar: a => ipcRenderer.invoke('menu-apolo-ejecutar', a),
  cerrar: () => ipcRenderer.send('menu-apolo-cerrar'),
});
