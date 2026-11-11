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
const { destinoArana, disponibilidadAranas } = require('./menu-aranas');

const EXT = {
  video: /\.(mp4|mov|mkv|webm|avi|m4v)$/i, imagen: /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/i, audio: /\.(mp3|wav|m4a|flac|ogg|aac)$/i,
  codigo: /\.(js|mjs|cjs|ts|tsx|jsx|py|ps1|bat|cmd|sh|c|cc|cpp|h|hpp|cs|java|go|rs|php|rb|lua|kt|swift|sql|lua|gd)$/i,
  texto: /\.(txt|md|html?|csv|log|json|xml|rtf|pdf|docx?)$/i,
};

function crearMenuApolo({ dir, datos, nucleo, handleText, panelUrl, decir, capturarTexto, log = console.log }) {
  // registro corto para depurar (el menú no tiene consola): %TEMP%/apolo-menu.log
  const traza = (...a) => { try { fs.appendFileSync(path.join(require('os').tmpdir(), 'apolo-menu.log'), `${new Date().toISOString().slice(11, 23)} ${a.join(' ')}
`); } catch { } };
  let hijo = null, ventana = null, contexto = null, reintentos = 0, apagado = false;
  const fUser = () => path.join(datos(), 'menu-acciones.json');
  const leerUser = () => { try { const u=JSON.parse(fs.readFileSync(fUser(),'utf8'));return {...u,acciones:Array.isArray(u.acciones)?u.acciones:[],usos:u.usos&&typeof u.usos==='object'?u.usos:{}}; } catch { return { acciones: [], usos: {} }; } };
  const guardarUser = u => { try { fs.writeFileSync(fUser(), JSON.stringify(u, null, 2)); } catch (e) { log('[menú APOLO]', e.message); throw e; } };

  function arrancar() {
    if (process.platform !== 'win32' || apagado) return;
    if (nucleo()?.cfg?.menuApolo?.activo === false) return;
    hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'tools', 'menu-gancho.ps1'), '-Padre', String(process.pid)], { windowsHide: true });
    let buf = '';
    hijo.stdout.setEncoding('utf8');
    hijo.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!l.startsWith('{')) continue;
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.evento === 'listo') { reintentos = 0; log('[menú APOLO] listo: Ctrl+Alt+clic derecho'); }
        else if (j.evento === 'menu') { traza('clic', j.app, j.clase, j.x, j.y); abrir(j); }
      }
    });
    hijo.stderr.on('data', d => log('[menú APOLO]', String(d).trim().slice(0, 300)));
    hijo.on('error', e => log('[menú APOLO] No se pudo iniciar el gancho:', e.message));
    hijo.on('close', () => { hijo = null; if (!apagado) setTimeout(arrancar, Math.min(60_000, 2000 * 2 ** reintentos++)).unref?.(); });
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
    const acciones = todas.filter(a => tipos.has(a.cuando || 'siempre')).map(a => ({ id: a.id, arana: a.arana, ic: a.ic || '⭐', t: a.t, d: a.d || '', cuando: a.cuando, propia: !!a.propia, usos: u.usos?.[a.id] || 0 }));
    let plugins = []; try { plugins = (nucleo()?.plugins?.vistas?.() || []).map(v => ({ ruta: `p/${v.plugin}/${v.nombre}`, titulo: v.titulo })); } catch { }
    const unico = objetivo.length === 1 && !esDir(objetivo[0]) ? objetivo[0] : null;
    const resultado = { app:c.app,titulo:c.titulo,hwnd:c.hwnd,x:c.x,y:c.y,carpeta:c.carpeta,seleccion:sel,objetivo,tipos:[...tipos],navegador,archivo:unico,acciones,plugins };
    resultado.aranas = disponibilidadAranas(resultado,nucleo());
    return resultado;
  }

  function abrir(c) {
    contexto = modelo(c);
    const p = screen.screenToDipPoint ? screen.screenToDipPoint({ x: c.x, y: c.y }) : { x: c.x, y: c.y };
    const area = screen.getDisplayNearestPoint(p).workArea, W = Math.min(360,area.width), H = Math.min(560,area.height);
    const x = Math.round(Math.min(Math.max(area.x, p.x + 4), area.x + area.width - W)), y = Math.round(Math.min(Math.max(area.y, p.y + 4), area.y + area.height - H));
    if (ventana && !ventana.isDestroyed()) ventana.destroy();
    ventana = new BrowserWindow({ x, y, width: W, height: H, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
      backgroundColor: '#00000000', webPreferences: { preload: path.join(dir, 'app', 'menu-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const propia = ventana;
    ventana.setAlwaysOnTop(true, 'pop-up-menu');
    ventana.loadFile(path.join(dir, 'app', 'menu.html'));
    // Windows puede no darle el foco a la primera: durante el primer medio segundo perder el foco no lo cierra (y lo vuelve a pedir)
    let desde = 0;
    ventana.once('ready-to-show', () => { if (ventana !== propia || propia.isDestroyed()) return; ventana.show(); ventana.moveTop(); ventana.focus(); desde = Date.now(); traza('mostrado', x, y, 'foco', ventana.isFocused()); });
    ventana.webContents.on('console-message', (_e, nivel, msg, linea) => traza('consola', nivel, msg, 'línea', linea));
    ventana.webContents.on('preload-error', (_e, p, err) => traza('preload-error', p, err && err.message));
    ventana.on('blur', () => {
      if (ventana !== propia) return;
      traza('blur', Date.now() - desde, 'ms');
      if (Date.now() - desde < 700) { setTimeout(() => { if (ventana === propia && !propia.isDestroyed()) { propia.moveTop(); propia.focus(); } }, 60); return; }
      cerrar();
    });
  }
  function cerrar() { if (ventana && !ventana.isDestroyed()) { traza('cerrar'); ventana.destroy(); } ventana = null; }

  // ---------- ejecutar ----------
  const lista = c => c.objetivo.map(p => `"${p}"`).join(', ') || '(nada seleccionado)';
  const plantilla = (t, c) => String(t).replace(/\{seleccion\}/g, lista(c)).replace(/\{carpeta\}/g, c.carpeta ? `"${c.carpeta}"` : 'esa carpeta')
    .replace(/\{archivo\}/g, c.archivo ? `"${c.archivo}"` : lista(c)).replace(/\{app\}/g, c.app || 'la app').replace(/\{titulo\}/g, c.titulo || '');
  const contextoTexto = c => c.objetivo.length ? `\n\n(Seleccionado en el Explorador: ${lista(c)})` : c.app ? `\n\n(Estoy en ${c.app}${c.titulo ? `: "${c.titulo}"` : ''})` : '';
  function contar(id) { const u = leerUser(); u.usos = u.usos || {}; u.usos[id] = (u.usos[id] || 0) + 1; guardarUser(u); }

  async function arana(tipo,c) {
    const n=nucleo(),destino=destinoArana(tipo,c,n);
    const deVentana=async()=>{
      const datos=await (capturarTexto||((ctx)=>require('./menu-captura').capturarVentana(dir,ctx)))(c);
      if(!datos.texto?.trim())throw new Error('No se pudo extraer texto visible de la ventana pulsada');
      return n.aranas.soltar({tipo,contexto:{texto:datos.texto,titulo:c.titulo||c.app,app:c.app,fuente:datos.fuente||'texto visible de ventana'}},null);
    };
    decir?.(`🕷 Analizando ${c.archivo || c.titulo || c.app || 'el contexto elegido'}…`);
    let resultado;
    if(destino.ventana)resultado=await deVentana();
    else try {resultado=await n.aranas.soltar(destino,null);}
    catch(e){if(e.code==='SIN_TEXTO_DOM'&&c.hwnd)resultado=await deVentana();else throw e;}
    decir?.(String(resultado));return resultado;
  }
  async function ejecutar(a) {
    const c = contexto || { objetivo: [] };
    if (!a || typeof a !== 'object') return {ok:false,error:'Acción no válida'};
    if (a.tipo === 'prompt' && !String(a.texto || '').trim()) return {ok:false,error:'Escribe una petición'};
    if (!['prompt','panel','arana','accion','snapgrab'].includes(a.tipo)) return {ok:false,error:'Acción desconocida'};
    if (a.tipo==='snapgrab' && !c.navegador && !c.hwnd) return {ok:false,error:'No se identificó la ventana del clic'};
    if (a.tipo==='panel' && (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(a.ruta || '') || a.ruta.includes('..'))) return {ok:false,error:'Página no válida'};
    if (a.tipo==='accion' && !c.acciones?.some(x=>x.id===a.id)) return {ok:false,error:'Esa acción no corresponde a la selección actual'};
    cerrar();
    try {
      if (a.tipo === 'snapgrab') return await require('./snapgrab').abrirSnapGrab({dir,navegador:nucleo()?.navegador,contexto:c});
      if (a.tipo === 'prompt') { contar('prompt'); return await handleText(String(a.texto).trim() + contextoTexto(c), 'isla'); }
      if (a.tipo === 'panel') { contar('panel:' + a.ruta); return await shell.openExternal(panelUrl(a.ruta)); }
      if (a.tipo === 'arana') { contar('arana:' + a.arana); return await arana(a.arana, c); }
      if (a.tipo === 'accion') {
        const x = [...ACCIONES, ...(leerUser().acciones || [])].find(y => y.id === a.id); if (!x) return;
        contar(x.id);
        if (x.tipo === 'arana') return await arana(x.arana, c);
        return await handleText(plantilla(x.prompt,c)+contextoTexto(c),'isla');
      }
    } catch (e) { log('[menú APOLO]', e.message); decir?.('No pude completar la acción: '+e.message); return {ok:false,error:e.message}; }
  }
  // guardar lo escrito como acción propia (para el tipo de selección actual)
  function guardarAccion({ texto, titulo }) {
    const c = contexto || { tipos: ['siempre'], objetivo: [] }, u = leerUser();
    const cuando = ['video', 'imagen', 'audio', 'codigo', 'texto', 'carpeta', 'archivos', 'navegador'].find(t => (c.tipos || []).includes(t)) || 'siempre';
    const prompt = c.objetivo.length ? `${String(texto).trim()}\n\nAplícalo a {seleccion}.` : String(texto).trim();
    const accion = { id: 'u-' + require('node:crypto').randomUUID(), ic: '⭐', t: String(titulo || texto).trim().slice(0, 48), d: 'tu acción', cuando, prompt };
    u.acciones = [...(u.acciones || []), accion]; guardarUser(u);
    return { ok: true, accion, cuando };
  }
  function borrarAccion(id) { const u=leerUser();u.acciones=(u.acciones||[]).filter(a=>a.id!==id);guardarUser(u);if(contexto)contexto=modelo({...contexto});return {ok:true}; }

  require('./ipc-seguro').permitir(path.join(dir, 'app', 'menu.html'), 'menu-apolo-');   // la página del menú solo usa sus canales
  const validarOrigen = e => { if (!ventana || ventana.isDestroyed() || e.sender !== ventana.webContents) throw new Error('Este menú ya no está activo'); };
  ipcMain.handle('menu-apolo-contexto', e => { validarOrigen(e);return contexto; });
  ipcMain.handle('menu-apolo-ejecutar', (e, a) => {validarOrigen(e);return ejecutar(a);});
  ipcMain.handle('menu-apolo-guardar', (e, a) => { validarOrigen(e);if(!String(a?.texto||'').trim())throw new Error('Escribe una acción antes de guardarla');const r = guardarAccion(a); if (contexto) contexto = { ...contexto, acciones: modelo({ ...contexto }).acciones }; return r; });
  ipcMain.handle('menu-apolo-borrar', (e, id) => {validarOrigen(e);return borrarAccion(id);});
  ipcMain.on('menu-apolo-cerrar', e => {if(ventana&&!ventana.isDestroyed()&&e.sender===ventana.webContents)cerrar();});

  return { arrancar, abrir, parar: () => { apagado = true; try { hijo?.kill(); } catch { } cerrar(); } };
}

module.exports = { crearMenuApolo };
