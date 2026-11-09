// Ventana de arañas de APOLO: abre el enlace en una ventana propia (Chromium de Electron) y suelta ahí las arañas,
// sin depender de la extensión de Chrome. Misma capa que la extensión (extension/arana-motor.js + extension/aranas.js).
// Dos vistas en la misma ventana: la PÁGINA (con las arañas) y, al terminar, el INFORME en un panel a la derecha.
// La ventana se ensancha para el panel: la página conserva su ancho, así las marcas no se descolocan.
// En el informe, pinchar una trampa / algo a tu favor (apolo-arana://ir?f=frase) lleva la página y las arañas a esa frase.
// Sesión aparte (persist:apolo-aranas): no comparte cookies con nada; no deja abrir ventanas nuevas.
const { BaseWindow, WebContentsView, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const PANEL = 480;

function crearVentanaAranas({ dir }) {
  const ventanas = new Map();
  let n = 0;
  const codigo = () => fs.readFileSync(path.join(dir, 'extension', 'arana-motor.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(dir, 'extension', 'aranas.js'), 'utf8');
  const dormir = ms => new Promise(r => setTimeout(r, ms));

  function ventana(id) {
    const v = ventanas.get(id);
    if (!v || v.win.isDestroyed()) throw new Error('cerraste la ventana de arañas');
    return v;
  }
  function colocar(v) {
    const { width, height } = v.win.getContentBounds();
    const pw = v.informe ? Math.min(PANEL, Math.round(width * .45)) : 0;
    v.pagina.setBounds({ x: 0, y: 0, width: width - pw, height });
    if (v.informe) v.informe.setBounds({ x: width - pw, y: 0, width: pw, height });
  }
  async function esperarCarga(wc, ms = 20_000) {
    const fin = Date.now() + ms;
    while (wc.isLoading() && Date.now() < fin) await dormir(200);
    await dormir(900);                                             // las webs que pintan con JS
  }
  const preparar = wc => {
    wc.setUserAgent(wc.getUserAgent().replace(/\s(Electron|robot-companion|APOLO)\/\S+/gi, ''));   // algunas webs bloquean "Electron"
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  };

  async function abrir(url) {
    const win = new BaseWindow({ width: 1280, height: 900, title: '🕷 APOLO · Arañas', backgroundColor: '#05040a', autoHideMenuBar: true, show: true });
    try { win.setMenu?.(null); } catch { }
    const pagina = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:apolo-aranas' } });
    win.contentView.addChildView(pagina);
    const id = `v:${++n}`, v = { win, pagina, informe: null };
    ventanas.set(id, v);
    colocar(v);
    win.on('resize', () => colocar(v));
    win.on('closed', () => { ventanas.delete(id); try { pagina.webContents.close(); } catch { } try { v.informe?.webContents.close(); } catch { } });
    const wc = pagina.webContents;
    preparar(wc);
    wc.on('page-title-updated', (_e, t) => { if (!win.isDestroyed()) win.setTitle(`🕷 APOLO · Arañas — ${t}`); });
    try { await wc.loadURL(url); } catch (e) { if (!/ERR_ABORTED/.test(e.message) || !wc.getURL()) { win.destroy(); throw new Error(`no pude abrir ${url}: ${e.message}`); } }
    await esperarCarga(wc);
    win.focus();
    return { id, url: wc.getURL(), titulo: wc.getTitle() };
  }

  // el informe en la misma ventana: panel a la derecha (la ventana crece para no tapar ni reflujar la página)
  async function mostrarInforme(v, archivo) {
    if (!v.informe) {
      const b = v.win.getBounds(), area = screen.getDisplayMatching(b).workArea;
      const ancho = Math.min(b.width + PANEL, area.width), x = Math.max(area.x, Math.min(b.x, area.x + area.width - ancho));
      v.informe = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false } });
      v.win.contentView.addChildView(v.informe);
      v.win.setBounds({ x, y: b.y, width: ancho, height: b.height });
      const wcI = v.informe.webContents;
      wcI.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
      wcI.on('will-navigate', (e, url) => {
        if (url.startsWith('apolo-arana://')) {                       // ir a la frase en la página
          e.preventDefault();
          const f = new URL(url).searchParams.get('f') || '';
          v.pagina.webContents.executeJavaScript(`window.__apoloAranas && window.__apoloAranas.ir(${JSON.stringify({ frase: f })})`, true).catch(() => { });
        } else if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); }
        else if (url.startsWith('file:')) { e.preventDefault(); shell.openPath(decodeURIComponent(new URL(url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))); }
      });
    }
    colocar(v);
    await v.informe.webContents.loadFile(archivo);
    return { ok: true };
  }

  async function accion(id, acc, args = {}) {
    const v = ventana(id), wc = v.pagina.webContents, js = c => wc.executeJavaScript(c, true);
    if (acc === 'esperar') { await esperarCarga(wc); return { url: wc.getURL(), titulo: wc.getTitle() }; }
    if (acc === 'informe') return mostrarInforme(v, args.archivo);
    if (acc === 'soltar' && !(await js('!!window.__apoloAranas'))) await js(codigo());
    const r = await js(`window.__apoloAranas ? window.__apoloAranas[${JSON.stringify(acc)}](${JSON.stringify(args)}) : { error: 'las arañas ya no están en esta página' }`);
    if (r && r.error) throw new Error(r.error);
    return r;
  }

  function cerrarTodas() { for (const v of ventanas.values()) if (!v.win.isDestroyed()) v.win.destroy(); ventanas.clear(); }
  return { abrir, accion, cerrarTodas };
}

module.exports = { crearVentanaAranas };
