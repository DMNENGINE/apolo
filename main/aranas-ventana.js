// Ventana de arañas de APOLO: abre el enlace en una ventana propia (Chromium de Electron) y suelta ahí las arañas,
// sin depender de la extensión de Chrome. Misma capa que la extensión (extension/arana-motor.js + extension/aranas.js).
// Sesión aparte (persist:apolo-aranas): no comparte cookies con nada; no deja abrir ventanas nuevas.
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

function crearVentanaAranas({ dir }) {
  const ventanas = new Map();
  let n = 0;
  const codigo = () => fs.readFileSync(path.join(dir, 'extension', 'arana-motor.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(dir, 'extension', 'aranas.js'), 'utf8');
  const dormir = ms => new Promise(r => setTimeout(r, ms));

  function ventana(id) {
    const w = ventanas.get(id);
    if (!w || w.isDestroyed()) throw new Error('cerraste la ventana de arañas');
    return w;
  }
  async function esperarCarga(w, ms = 20_000) {
    const fin = Date.now() + ms;
    while (w.webContents.isLoading() && Date.now() < fin) await dormir(200);
    await dormir(900);                                             // las webs que pintan con JS
  }

  async function abrir(url) {
    const w = new BrowserWindow({
      width: 1280, height: 900, title: 'APOLO · Arañas', backgroundColor: '#05040a', autoHideMenuBar: true, show: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:apolo-aranas' },
    });
    const wc = w.webContents;
    wc.setUserAgent(wc.getUserAgent().replace(/\s(Electron|robot-companion|APOLO)\/\S+/gi, ''));   // algunas webs bloquean "Electron"
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.on('page-title-updated', (e, t) => { e.preventDefault(); w.setTitle(`🕷 APOLO · Arañas — ${t}`); });
    const id = `v:${++n}`;
    ventanas.set(id, w);
    w.on('closed', () => ventanas.delete(id));
    try { await w.loadURL(url); } catch (e) { if (!/ERR_ABORTED/.test(e.message) || !wc.getURL()) { w.destroy(); throw new Error(`no pude abrir ${url}: ${e.message}`); } }
    await esperarCarga(w);
    w.focus();
    return { id, url: wc.getURL(), titulo: wc.getTitle() };
  }

  async function accion(id, acc, args = {}) {
    const w = ventana(id), js = c => w.webContents.executeJavaScript(c, true);
    if (acc === 'esperar') { await esperarCarga(w); return { url: w.webContents.getURL(), titulo: w.webContents.getTitle() }; }
    if (acc === 'soltar' && !(await js('!!window.__apoloAranas'))) await js(codigo());
    const r = await js(`window.__apoloAranas ? window.__apoloAranas[${JSON.stringify(acc)}](${JSON.stringify(args)}) : { error: 'las arañas ya no están en esta página' }`);
    if (r && r.error) throw new Error(r.error);
    return r;
  }

  function cerrarTodas() { for (const w of ventanas.values()) if (!w.isDestroyed()) w.destroy(); ventanas.clear(); }
  return { abrir, accion, cerrarTodas };
}

module.exports = { crearVentanaAranas };
