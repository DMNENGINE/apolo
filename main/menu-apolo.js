// Menú de APOLO: Ctrl + Alt + clic derecho en cualquier parte (tools/menu-gancho.ps1) abre junto al cursor una "caja de
// herramientas" con todo lo que APOLO sabe hacer, usando lo que hay seleccionado (carpeta/archivos del Explorador):
// crear un vídeo o un programa con eso, soltar arañas, leer/revisar archivos y abrir las páginas de APOLO y de sus plugins.
// Ventana propia (app/menu.html) sin marco, transparente y encima de todo; se cierra al perder el foco o con Esc.
const { BrowserWindow, ipcMain, screen, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEXTO = /\.(txt|md|html?|csv|log|json|xml|rtf)$/i;
const CODIGO = /\.(js|mjs|cjs|ts|tsx|jsx|py|ps1|bat|cmd|sh|c|cc|cpp|h|hpp|cs|java|go|rs|php|rb|lua|kt|swift|sql)$/i;
const MEDIA = /\.(mp4|mov|mkv|webm|avi|mp3|wav|m4a|png|jpe?g|webp|gif)$/i;

function crearMenuApolo({ dir, nucleo, handleText, panelUrl, decir, log = console.log }) {
  let hijo = null, ventana = null, contexto = null, reintentos = 0, apagado = false;

  function arrancar() {
    if (process.platform !== 'win32' || apagado) return;
    if (nucleo()?.cfg?.menuApolo?.activo === false) return;
    const ps1 = path.join(dir, 'tools', 'menu-gancho.ps1');
    hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], { windowsHide: true });
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
    hijo.on('exit', () => {
      hijo = null;
      if (apagado) return;
      const espera = Math.min(60_000, 2000 * 2 ** reintentos++);
      setTimeout(arrancar, espera).unref?.();
    });
  }

  // ---------- qué ofrecer según lo seleccionado ----------
  function plugins() {
    try { return (nucleo()?.plugins?.vistas?.() || []).map(v => ({ ruta: `p/${v.plugin}/${v.nombre}`, titulo: v.titulo })); } catch { return []; }
  }
  function modelo(c) {
    const sel = (c.seleccion || []).filter(Boolean), objetivo = sel.length ? sel : (c.carpeta ? [c.carpeta] : []);
    const esDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
    const unArchivo = sel.length === 1 && !esDir(sel[0]) ? sel[0] : null;
    return {
      app: c.app, titulo: c.titulo, carpeta: c.carpeta, seleccion: sel, objetivo,
      hayMedia: objetivo.some(p => MEDIA.test(p) || esDir(p)),
      texto: unArchivo && TEXTO.test(unArchivo) ? unArchivo : null,
      codigo: unArchivo && CODIGO.test(unArchivo) ? unArchivo : null,
      navegador: /chrome|msedge|brave|firefox|opera/i.test(c.app || ''),
      plugins: plugins(),
    };
  }

  function abrir(c) {
    contexto = modelo(c);
    const p = screen.screenToDipPoint ? screen.screenToDipPoint({ x: c.x, y: c.y }) : { x: c.x, y: c.y };
    const area = screen.getDisplayNearestPoint(p).workArea, W = 340, H = 520;
    const x = Math.round(Math.min(Math.max(area.x, p.x + 4), area.x + area.width - W)), y = Math.round(Math.min(Math.max(area.y, p.y + 4), area.y + area.height - H));
    if (ventana && !ventana.isDestroyed()) ventana.destroy();
    ventana = new BrowserWindow({ x, y, width: W, height: H, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
      backgroundColor: '#00000000', webPreferences: { preload: path.join(dir, 'app', 'menu-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    ventana.setAlwaysOnTop(true, 'pop-up-menu');
    ventana.loadFile(path.join(dir, 'app', 'menu.html'));
    ventana.once('ready-to-show', () => { ventana.show(); ventana.focus(); });
    ventana.on('blur', () => cerrar());
  }
  function cerrar() { if (ventana && !ventana.isDestroyed()) ventana.destroy(); ventana = null; }

  const lista = c => c.objetivo.map(p => `"${p}"`).join(', ');
  const archivoUrl = p => 'file:///' + String(p).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
  async function ejecutar(a) {
    const c = contexto || { objetivo: [] };
    cerrar();
    try {
      switch (a.tipo) {
        case 'video': return handleText(`Crea un vídeo con el contenido de ${lista(c)}: elige lo mejor, móntalo con tus herramientas de vídeo (FilmCraft, subtítulos, música si hay) y guárdalo en ${c.carpeta || 'esa carpeta'}. Cuéntame qué has hecho.`, 'isla');
        case 'programa': return handleText(`claude: Crea un programa a partir de lo que hay en ${lista(c)}. Mira primero qué contiene, propón qué programa tiene sentido, constrúyelo en una carpeta nueva al lado y explícame cómo usarlo.`, 'isla');
        case 'aprender': return handleText(`Lee ${lista(c)} y guarda en tu memoria lo importante (qué es, para qué sirve, datos clave).`, 'isla');
        case 'resumir': return handleText(`Lee ${lista(c)} y hazme un resumen claro de lo que contiene.`, 'isla');
        case 'ordenar': return handleText(`Mira la carpeta "${c.carpeta || c.objetivo[0]}" y propónme cómo ordenarla (carpetas, nombres, duplicados). No muevas nada sin que te lo apruebe.`, 'isla');
        case 'arana': {
          const n = nucleo(); if (!n?.aranas) return;
          const archivo = a.arana === 'lectora' ? c.texto : a.arana === 'codigo' ? c.codigo : a.arana === 'ia' ? c.texto : null;
          const args = { tipo: a.arana, ...(archivo ? { url: archivoUrl(archivo) } : {}) };
          decir?.(`🕷 Suelto la araña ${a.arana}…`);
          return n.aranas.soltar(args, null).then(r => decir?.(String(r).split('\n')[0]), e => decir?.(`🕷 ${e.message}`));
        }
        case 'panel': return shell.openExternal(panelUrl(a.ruta));
        case 'hablar': return handleText(a.texto, 'isla');
      }
    } catch (e) { log('[menú APOLO]', e.message); }
  }

  ipcMain.handle('menu-apolo-contexto', () => contexto);
  ipcMain.handle('menu-apolo-ejecutar', (_e, a) => ejecutar(a));
  ipcMain.on('menu-apolo-cerrar', () => cerrar());

  return { arrancar, parar: () => { apagado = true; try { hijo?.kill(); } catch { } cerrar(); }, abrirPrueba: c => abrir(c) };
}

module.exports = { crearMenuApolo };
