// Ventana de la isla: transparente, siempre encima y atravesable salvo sobre lo visible (hit-testing en island.js).
// Posición: el usuario la arrastra a cualquier monitor y se guarda (geometría pura en shared/isla-geometria.js).
// Juego/vídeo a pantalla completa en su monitor → se va rodando a otro y vuelve al terminar.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const IslaGeo = require('../shared/isla-geometria.js');
const { fuera } = require('../core/rutas');

const RAIZ = path.join(__dirname, '..');

// alPantallaCompleta({completa, proceso}) → al núcleo (co-host: modo comentarista)
function crearIsla({ alPantallaCompleta }) {
  let win = null;
  // layIsla = { ventana, barX, barY (barra = isla cerrada, dentro de la ventana), h: izq|centro|der, v: arriba|abajo (hacia dónde se abre), barra (pantalla) }
  const ISLA_POS = () => path.join(app.getPath('userData'), 'isla-posicion.json');
  let layIsla = null, mudada = false, animMudanza = null, arrastre = null, layPend = null;
  const viva = () => win && !win.isDestroyed();

  function posGuardada() { try { return JSON.parse(fs.readFileSync(ISLA_POS(), 'utf8')); } catch { return null; } }
  function guardarPos(d, barra) {
    try { fs.writeFileSync(ISLA_POS(), JSON.stringify({ id: d.id, bounds: d.bounds, ...IslaGeo.aFraccion(barra, d.workArea) })); } catch (e) { console.error('[isla] no pude guardar la posición:', e.message); }
  }
  // monitor + fracción elegidos por el usuario; si ese monitor ya no existe → arriba en el centro del principal
  function sitioElegido() {
    const g = posGuardada(), d = IslaGeo.elegirMonitor(g, screen.getAllDisplays());
    return d ? { d, f: g } : { d: screen.getPrimaryDisplay(), f: IslaGeo.POR_DEFECTO };
  }
  function layoutElegido() { const { d, f } = sitioElegido(); return IslaGeo.layout(IslaGeo.deFraccion(f, d.workArea), d.workArea); }
  function layoutEn(d) { return IslaGeo.layout(IslaGeo.deFraccion(sitioElegido().f, d.workArea), d.workArea); }   // mismo sitio relativo en otro monitor
  function enviarLayout(lay) {
    if (viva()) win.webContents.send('isla-layout', { barX: lay.barX, barY: lay.barY, h: lay.h, v: lay.v, ancho: lay.ventana.width, alto: lay.ventana.height });
  }
  // cambia el anclaje dentro de la ventana y LUEGO mueve la ventana (la isla contesta 'isla-layout-ok' tras pintar) → la barra no salta
  function aplicarLayout(lay) {
    if (!viva()) return;
    layIsla = lay; enviarLayout(lay);
    clearTimeout(layPend); layPend = setTimeout(() => { layPend = null; ponerVentana(lay.ventana); }, 200);   // por si la isla no contesta
  }
  function ponerVentana(v) { if (viva()) win.setBounds(v); }
  function barraPantalla() { const b = win.getBounds(); return { x: b.x + layIsla.barX, y: b.y + layIsla.barY, w: IslaGeo.BARRA_W, h: IslaGeo.BARRA_H }; }
  function displayDeIsla() { return IslaGeo.monitorDe(IslaGeo.centroBarra(barraPantalla()), screen.getAllDisplays()) || screen.getPrimaryDisplay(); }

  function crearVentana() {
    layIsla = layoutElegido();                             // donde la dejó el usuario (o arriba en el centro del principal)
    win = new BrowserWindow({
      ...layIsla.ventana,
      frame: false, transparent: true, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: true,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(RAIZ, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true);
    win.setIgnoreMouseEvents(true, { forward: true });     // clics pasan a través salvo encima de lo VISIBLE de la isla (hit-testing en island.js)
    win.webContents.on('did-finish-load', () => enviarLayout(layIsla));
    win.loadFile(path.join(RAIZ, 'app', 'index.html'));
    return win;
  }

  // la isla decide (hit-testing) si el ratón está sobre algo visible: solo entonces la ventana deja de ser "atravesable"
  ipcMain.on('interactive', (_e, on) => { if (viva()) win.setIgnoreMouseEvents(!on, { forward: true }); });
  ipcMain.on('isla-layout-ok', () => { if (layPend) { clearTimeout(layPend); layPend = null; ponerVentana(layIsla.ventana); } });

  // arrastre: la isla avisa 'inicio' (pulsación larga en el robot o arrastrar la barra/cabecera) y 'fin' al soltar; aquí la ventana sigue al cursor
  ipcMain.on('isla-arrastre', (_e, fase) => {
    if (!viva()) return;
    if (fase !== 'inicio') return terminarArrastre();
    clearInterval(animMudanza); animMudanza = null;
    if (arrastre) clearInterval(arrastre.t);
    const p0 = screen.getCursorScreenPoint(), b0 = win.getBounds(), t0 = Date.now();
    let lx = p0.x, ly = p0.y;
    arrastre = { t: setInterval(() => {
      if (!viva() || Date.now() - t0 > 120_000) return terminarArrastre();      // seguro: nunca se queda pegada al cursor
      const c = screen.getCursorScreenPoint(); if (c.x === lx && c.y === ly) return;
      lx = c.x; ly = c.y;
      win.setBounds({ x: b0.x + c.x - p0.x, y: b0.y + c.y - p0.y, width: b0.width, height: b0.height });
    }, 16) };
  });
  function terminarArrastre() {
    if (!arrastre) return;
    clearInterval(arrastre.t); arrastre = null;
    if (!viva()) return;
    const d = displayDeIsla(), lay = IslaGeo.layout(barraPantalla(), d.workArea);     // dentro del área de trabajo + dirección de apertura nueva
    guardarPos(d, lay.barra); mudada = false;
    console.log(`[isla] colocada en el monitor ${d.id} (${lay.h}/${lay.v})`);
    aplicarLayout(lay);
  }

  function rodarA(d, destino) {
    if (!viva() || !d || arrastre) return;
    const lay2 = destino || layoutEn(d), desde = barraPantalla(), hasta = lay2.barra, t0 = Date.now(), DUR = 900;
    const { barX, barY } = layIsla, { width, height } = win.getBounds();
    win.webContents.send('mudanza', hasta.x > desde.x ? 1 : -1);          // el robot rueda en esa dirección
    clearInterval(animMudanza);
    // se mueve la BARRA (con el anclaje actual) y al llegar se re-ancla según el sitio nuevo; si los monitores no se tocan, salta igual
    animMudanza = setInterval(() => {
      if (!viva()) { clearInterval(animMudanza); return; }
      const k = Math.min(1, (Date.now() - t0) / DUR), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      win.setBounds({ x: Math.round(desde.x + (hasta.x - desde.x) * e) - barX, y: Math.round(desde.y + (hasta.y - desde.y) * e) - barY, width, height });
      if (k >= 1) { clearInterval(animMudanza); animMudanza = null; aplicarLayout(lay2); }
    }, 16);
  }
  function otroMonitor(excluir) {
    const otros = screen.getAllDisplays().filter(d => d.id !== excluir.id);
    // el más grande; a igualdad, el horizontal (la isla queda mejor arriba de una pantalla apaisada)
    return otros.sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height) || (b.bounds.width >= b.bounds.height) - (a.bounds.width >= a.bounds.height))[0];
  }
  function vigilarPantallaCompleta() {
    const p = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fuera(path.join(RAIZ, 'tools', 'pantalla-completa.ps1'))], { windowsHide: true });
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim().replace(/^﻿/, ''); buf = buf.slice(i + 1);
        let j; try { j = JSON.parse(l); } catch { continue; }
        try { alPantallaCompleta({ completa: !!j.completa, proceso: j.proceso || '' }); } catch { }
        if (!viva()) continue;
        if (j.completa) {
          const ocupado = screen.getDisplayMatching({ x: j.x, y: j.y, width: j.ancho, height: j.alto });
          if (ocupado.id === displayDeIsla().id) {
            const destino = otroMonitor(ocupado);
            if (destino && !arrastre) { mudada = true; console.log(`[isla] ${j.proceso} a pantalla completa → me voy al otro monitor`); rodarA(destino); }
          }
        } else if (mudada) {
          mudada = false;                                                    // vuelve al sitio que eligió el usuario (o al de por defecto)
          console.log('[isla] se acabó la pantalla completa → vuelvo'); rodarA(sitioElegido().d, layoutElegido());
        }
      }
    });
    p.on('exit', () => setTimeout(vigilarPantallaCompleta, 5000));          // si se cae, se relanza
    app.on('will-quit', () => { try { p.kill(); } catch { } });
  }
  // mover a mano (grabar vídeo en el principal): 'otro' = fuera del monitor principal, 'casa' = vuelve al sitio elegido,
  // 'reset' = olvida el sitio elegido y vuelve arriba en el centro del principal (bandeja "Volver la isla a su sitio")
  function mover(a) {
    const prim = screen.getPrimaryDisplay();
    mudada = false;
    if (a === 'reset') { try { fs.unlinkSync(ISLA_POS()); } catch { } }
    if (a === 'otro') { const d = otroMonitor(prim); if (d) rodarA(d); return; }
    rodarA(sitioElegido().d, layoutElegido());
  }
  // un monitor desconectado o con otra resolución: se recoloca (si el suyo ya no está → posición por defecto)
  function vigilarMonitores() {
    let t = null;
    const recolocar = () => { clearTimeout(t); t = setTimeout(() => { if (viva() && !arrastre && !animMudanza && !mudada) aplicarLayout(layoutElegido()); }, 600); };
    screen.on('display-removed', recolocar); screen.on('display-added', recolocar); screen.on('display-metrics-changed', recolocar);
  }

  return {
    crearVentana, mover, vigilarPantallaCompleta, vigilarMonitores,
    fueraDeSuSitio: () => viva() && !!layIsla && displayDeIsla().id !== sitioElegido().d.id,   // bandeja: "Traer la isla de vuelta"
  };
}

module.exports = { crearIsla };
