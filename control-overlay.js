// Aviso visible mientras el robot controla el ratón/teclado: borde rojo en TODOS los monitores + etiqueta.
// Ventanas transparentes, que no reciben clics ni roban el foco (el robot escribe en la ventana que tenga el foco)
// y excluidas de las capturas (setContentProtection) para que el modelo no vea el borde en ver_pantalla.
const { BrowserWindow, screen, globalShortcut } = require('electron');

const html = (motivo, principal, grabando) => grabando ? `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;font:600 14px Segoe UI,system-ui,sans-serif}
  .b{position:fixed;inset:0;border:3px dashed #ff3b30;animation:l 1.2s steps(2) infinite}
  @keyframes l{50%{border-color:rgba(255,59,48,.35)}}
  .t{position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(20,0,0,.86);color:#fff;border:1px solid #ff3b30;
     border-radius:10px;padding:8px 16px;max-width:70%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.5)}
  .t small{display:block;font-weight:400;color:#ffb3ad;margin-top:3px}
</style><div class="b"></div>${principal ? `<div class="t">⏺ APOLO está GRABANDO tu demostración${motivo ? ` · ${motivo.replace(/[<&>]/g, '')}` : ''}
  <small>Haz la tarea a tu ritmo · pulsa Parar en el panel o Ctrl+Alt+Esc para terminar</small></div>` : ''}` : `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;font:600 14px Segoe UI,system-ui,sans-serif}
  .b{position:fixed;inset:0;border:4px solid #ff3b30;box-shadow:inset 0 0 26px rgba(255,59,48,.55);animation:l 1.6s ease-in-out infinite}
  @keyframes l{50%{border-color:#ff7a70;box-shadow:inset 0 0 40px rgba(255,59,48,.8)}}
  .t{position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(20,0,0,.86);color:#fff;border:1px solid #ff3b30;
     border-radius:10px;padding:8px 16px;max-width:70%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.5)}
  .t small{display:block;font-weight:400;color:#ffb3ad;margin-top:3px}
</style><div class="b"></div>${principal ? `<div class="t">🤖 El robot está usando tu ratón y teclado${motivo ? ` · ${motivo.replace(/[<&>]/g, '')}` : ''}
  <small>Mueve el ratón, pulsa cualquier tecla o Ctrl+Alt+Esc para recuperar el control</small></div>` : ''}`;

function crearOverlay({ alPanico }) {
  let ventanas = [];
  function mostrar(motivo, { grabando = false } = {}) {
    ocultar();
    const prim = screen.getPrimaryDisplay().id;
    for (const d of screen.getAllDisplays()) {
      const w = new BrowserWindow({
        x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
        frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true,
        alwaysOnTop: true, hasShadow: false, show: false, webPreferences: { sandbox: true, contextIsolation: true },
      });
      w.setAlwaysOnTop(true, 'screen-saver');
      w.setIgnoreMouseEvents(true);
      w.setContentProtection(true);
      w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html(motivo, d.id === prim, grabando)));
      w.once('ready-to-show', () => w.showInactive());
      ventanas.push(w);
    }
    try { globalShortcut.register('Control+Alt+Escape', () => alPanico('Ctrl+Alt+Esc', { grabando })); } catch { }
  }
  function ocultar() {
    for (const w of ventanas) if (!w.isDestroyed()) w.destroy();
    ventanas = [];
    try { globalShortcut.unregister('Control+Alt+Escape'); } catch { }
  }
  return { mostrar, ocultar };
}

module.exports = { crearOverlay };
