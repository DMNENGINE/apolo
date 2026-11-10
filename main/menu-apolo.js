// Menú de APOLO: Ctrl + Alt + clic derecho en cualquier parte (tools/menu-gancho.ps1) abre junto al cursor su caja de herramientas.
// - Prompt libre arriba: lo que escribas va a APOLO junto con lo que tengas seleccionado (o la app en la que estás).
// - Acciones predeterminadas según el tipo de selección (main/menu-acciones.js) + las tuyas (userData/menu-acciones.json).
// - "Recientes": las que más usas salen primero. Arañas, páginas de APOLO y de los plugins activos.
// Ventana propia (app/menu.html) sin marco, transparente y encima de todo; se cierra al perder el foco o con Esc.
const { BrowserWindow, ipcMain, screen, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ACCIONES } = require('./menu-acciones');

const EXT = {
  video: /\.(mp4|mov|mkv|webm|avi|m4v)$/i, imagen: /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/i, audio: /\.(mp3|wav|m4a|flac|ogg|aac)$/i,
  codigo: /\.(js|mjs|cjs|ts|tsx|jsx|py|ps1|bat|cmd|sh|c|cc|cpp|h|hpp|cs|java|go|rs|php|rb|lua|kt|swift|sql|lua|gd)$/i,
  texto: /\.(txt|md|html?|csv|log|json|xml|rtf|pdf|docx?)$/i,
};

function crearMenuApolo({ dir, datos, nucleo, handleText, panelUrl, decir, log = console.log }) {
  let hijo = null, ventana = null, contexto = null, reintentos = 0, apagado = false;
  const fUser = () => path.join(datos(), 'menu-acciones.json');
  const leerUser = () => { try { return JSON.parse(fs.readFileSync(fUser(), 'utf8')); } catch { return { acciones: [], usos: {} }; } };
  const guardarUser = u => { try { fs.writeFileSync(fUser(), JSON.stringify(u, null, 2)); } catch (e) { log('[menú APOLO]', e.message); } };

  function arrancar() {
    if (process.platform !== 'win32' || apagado) return;
    if (nucleo()?.cfg?.menuApolo?.activo === false) return;
    hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'tools', 'menu-gancho.ps1')], { windowsHide: true });
    let buf = '';
    hijo.stdout.setEncoding('utf8');
    hijo.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!l.startsWith('{')) continue;
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.evento === 'listo') { reintentos = 0; log('[menú APOLO] listo: Ctrl+Alt+clic derecho'); }
        else if (j.evento === 'menu') abrir(j);
      }
    });
    hijo.stderr.on('data', d => log('[menú APOLO]', String(d).trim().slice(0, 300)));
    hijo.on('exit', () => { hijo = null; if (!apagado) setTimeout(arrancar, Math.min(60_000, 2000 * 2 ** reintentos++)).unref?.(); });
  }

  // ---------- qué hay seleccionado y qué ofrecer ----------
  function modelo(c) {
    const sel = (c.seleccion || []).filter(Boolean), objetivo = sel.length ? sel : (c.carpeta ? [c.carpeta] : []);
    const esDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
    const tipos = new Set();
    for (const p of objetivo) {
      if (esDir(p)) { tipos.add('carpeta'); continue; }
      for (const [k, re] of Object.entries(EXT)) if (re.test(p)) tipos.add(k);
    }
    if (objetivo.length) tipos.add('archivos');
    const navegador = /chrome|msedge|brave|firefox|opera/i.test(c.app || '');
    if (navegador) tipos.add('navegador');
    tipos.add('siempre');
    const u = leerUser(), todas = [...ACCIONES, ...(u.acciones || []).map(a => ({ ...a, propia: true }))];
    const acciones = todas.filter(a => tipos.has(a.cuando || 'siempre')).map(a => ({ id: a.id, ic: a.ic || '⭐', t: a.t, d: a.d || '', cuando: a.cuando, propia: !!a.propia, usos: u.usos?.[a.id] || 0 }));
    let plugins = []; try { plugins = (nucleo()?.plugins?.vistas?.() || []).map(v => ({ ruta: `p/${v.plugin}/${v.nombre}`, titulo: v.titulo })); } catch { }
    const unico = objetivo.length === 1 && !esDir(objetivo[0]) ? objetivo[0] : null;
    return { app: c.app, titulo: c.titulo, carpeta: c.carpeta, seleccion: sel, objetivo, tipos: [...tipos], navegador, archivo: unico, acciones, plugins };
  }

  function abrir(c) {
    contexto = modelo(c);
    const p = screen.screenToDipPoint ? screen.screenToDipPoint({ x: c.x, y: c.y }) : { x: c.x, y: c.y };
    const area = screen.getDisplayNearestPoint(p).workArea, W = 360, H = 560;
    const x = Math.round(Math.min(Math.max(area.x, p.x + 4), area.x + area.width - W)), y = Math.round(Math.min(Math.max(area.y, p.y + 4), area.y + area.height - H));
    if (ventana && !ventana.isDestroyed()) ventana.destroy();
    ventana = new BrowserWindow({ x, y, width: W, height: H, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
      backgroundColor: '#00000000', webPreferences: { preload: path.join(dir, 'app', 'menu-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    ventana.setAlwaysOnTop(true, 'pop-up-menu');
    ventana.loadFile(path.join(dir, 'app', 'menu.html'));
    // Windows puede no darle el foco a la primera: durante el primer medio segundo perder el foco no lo cierra (y lo vuelve a pedir)
    let desde = 0;
    ventana.once('ready-to-show', () => { ventana.show(); ventana.moveTop(); ventana.focus(); desde = Date.now(); });
    ventana.on('blur', () => {
      if (Date.now() - desde < 700) { setTimeout(() => { if (ventana && !ventana.isDestroyed()) { ventana.moveTop(); ventana.focus(); } }, 60); return; }
      cerrar();
    });
  }
  function cerrar() { if (ventana && !ventana.isDestroyed()) ventana.destroy(); ventana = null; }

  // ---------- ejecutar ----------
  const lista = c => c.objetivo.map(p => `"${p}"`).join(', ') || '(nada seleccionado)';
  const plantilla = (t, c) => String(t).replace(/\{seleccion\}/g, lista(c)).replace(/\{carpeta\}/g, c.carpeta ? `"${c.carpeta}"` : 'esa carpeta')
    .replace(/\{archivo\}/g, c.archivo ? `"${c.archivo}"` : lista(c)).replace(/\{app\}/g, c.app || 'la app').replace(/\{titulo\}/g, c.titulo || '');
  const contextoTexto = c => c.objetivo.length ? `\n\n(Seleccionado en el Explorador: ${lista(c)})` : c.app ? `\n\n(Estoy en ${c.app}${c.titulo ? `: "${c.titulo}"` : ''})` : '';
  const archivoUrl = p => 'file:///' + String(p).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
  function contar(id) { const u = leerUser(); u.usos = u.usos || {}; u.usos[id] = (u.usos[id] || 0) + 1; guardarUser(u); }

  function arana(tipo, c) {
    const n = nucleo(); if (!n?.aranas) return;
    const archivo = c.archivo && (tipo === 'lectora' || tipo === 'ia' ? EXT.texto.test(c.archivo) : tipo === 'codigo' ? EXT.codigo.test(c.archivo) : false) ? c.archivo : null;
    decir?.(`🕷 Suelto la araña ${tipo}…`);
    return n.aranas.soltar({ tipo, ...(archivo ? { url: archivoUrl(archivo) } : {}) }, null).then(r => decir?.(String(r).split('\n')[0]), e => decir?.(`🕷 ${e.message}`));
  }
  async function ejecutar(a) {
    const c = contexto || { objetivo: [] };
    cerrar();
    try {
      if (a.tipo === 'prompt') { contar('prompt'); return handleText(String(a.texto).trim() + contextoTexto(c), 'isla'); }
      if (a.tipo === 'panel') { contar('panel:' + a.ruta); return shell.openExternal(panelUrl(a.ruta)); }
      if (a.tipo === 'arana') { contar('arana:' + a.arana); return arana(a.arana, c); }
      if (a.tipo === 'accion') {
        const x = [...ACCIONES, ...(leerUser().acciones || [])].find(y => y.id === a.id); if (!x) return;
        contar(x.id);
        if (x.tipo === 'arana') return arana(x.arana, c);
        return handleText(plantilla(x.prompt, c), 'isla');
      }
    } catch (e) { log('[menú APOLO]', e.message); }
  }
  // guardar lo escrito como acción propia (para el tipo de selección actual)
  function guardarAccion({ texto, titulo }) {
    const c = contexto || { tipos: ['siempre'], objetivo: [] }, u = leerUser();
    const cuando = ['video', 'imagen', 'audio', 'codigo', 'texto', 'carpeta', 'archivos', 'navegador'].find(t => (c.tipos || []).includes(t)) || 'siempre';
    const prompt = c.objetivo.length ? `${String(texto).trim()}\n\nAplícalo a {seleccion}.` : String(texto).trim();
    const accion = { id: 'u-' + Date.now().toString(36), ic: '⭐', t: String(titulo || texto).trim().slice(0, 48), d: 'tu acción', cuando, prompt };
    u.acciones = [...(u.acciones || []), accion]; guardarUser(u);
    return { ok: true, accion, cuando };
  }
  function borrarAccion(id) { const u = leerUser(); u.acciones = (u.acciones || []).filter(a => a.id !== id); guardarUser(u); return { ok: true }; }

  ipcMain.handle('menu-apolo-contexto', () => contexto);
  ipcMain.handle('menu-apolo-ejecutar', (_e, a) => ejecutar(a));
  ipcMain.handle('menu-apolo-guardar', (_e, a) => { const r = guardarAccion(a); if (contexto) contexto = { ...contexto, acciones: modelo({ ...contexto }).acciones }; return r; });
  ipcMain.handle('menu-apolo-borrar', (_e, id) => borrarAccion(id));
  ipcMain.on('menu-apolo-cerrar', () => cerrar());

  return { arrancar, parar: () => { apagado = true; try { hijo?.kill(); } catch { } cerrar(); } };
}

module.exports = { crearMenuApolo };
