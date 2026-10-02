// Control del escritorio (Windows). Fase 1: ver la pantalla (captura + elementos de la ventana activa por UI Automation).
// Las capturas se guardan en <dir>/capturas (se borran a las 24 h) y el modelo las recibe como imagen adjunta.
// cfg.escritorio = { ancho: px de la imagen, bloqueadas: [regex de títulos/procesos donde el robot NO mira ni actúa] }
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const BLOQUEADAS = ['banco', '\\bbank', 'paypal', 'zelle', 'venmo', 'cash ?app', 'wallet', 'binance', 'coinbase', 'metamask', 'kraken',
  '1password', 'bitwarden', 'keepass', 'lastpass', 'dashlane', 'administrador de contrase', 'password manager', 'credential manager'];

const recientes = new Map();          // sesion.id -> { t, monitor, escala, origen:{x,y}, elementos } (para los clics de la fase 2)

function bloqueada(cfg, ventana) {
  const lista = cfg.escritorio?.bloqueadas || BLOQUEADAS;
  const txt = `${ventana?.titulo || ''} ${ventana?.proceso || ''}`;
  return lista.find(p => { try { return new RegExp(p, 'i').test(txt); } catch { return false; } }) || null;
}

function limpiarViejas(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (Date.now() - fs.statSync(fp).mtimeMs > 24 * 3600_000) fs.unlinkSync(fp);
    }
  } catch { }
}

function ejecutarPs(args, timeout = 20_000) {
  return new Promise((ok, mal) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'pantalla.ps1'), ...args],
      { windowsHide: true, timeout, maxBuffer: 8 << 20, encoding: 'utf8' }, (err, out, errOut) => {
        if (err) return mal(new Error((errOut || err.message).trim().split('\n')[0]));
        try { ok(JSON.parse(out.trim().replace(/^﻿/, ''))); } catch { mal(new Error('salida no válida del capturador')); }
      });
  });
}

// devuelve { texto, imagenes: [{ mime, ruta }] } para el agente
async function verPantalla({ cfg, sesion, monitor = 0, imagen = true, elementos = true }) {
  if (process.platform !== 'win32') throw new Error('ver la pantalla solo está disponible en Windows por ahora');
  const dir = path.join(cfg.dir, 'capturas'); fs.mkdirSync(dir, { recursive: true }); limpiarViejas(dir);
  const ruta = path.join(dir, `${sesion?.id || 'x'}-${Date.now()}.jpg`);
  const args = ['-Salida', ruta, '-Monitor', String(monitor | 0), '-Ancho', String(cfg.escritorio?.ancho || 1280), '-Elementos', elementos ? '1' : '0'];
  if (!imagen) args.push('-SinImagen');
  let r = await ejecutarPs(args);
  const prot = bloqueada(cfg, r.ventana);
  if (prot) {                                            // ventana sensible: ni imagen ni valores de campos
    try { if (r.imagen) fs.unlinkSync(r.imagen.ruta); } catch { }
    recientes.delete(sesion?.id);
    return { texto: `La ventana activa ("${r.ventana.titulo}") está PROTEGIDA (coincide con "${prot}"): por seguridad no la miro ni actúo en ella. Pide al usuario que lo haga él.`, imagenes: [] };
  }
  const m = r.monitores.find(x => x.n === r.monitor) || { x: 0, y: 0 };
  const e = r.escala || 1;
  const aImg = (x, y) => [Math.round((x - m.x) / e), Math.round((y - m.y) / e)];
  const els = (r.elementos || []).filter(x => {               // solo lo que cae dentro del monitor capturado
    const [cx, cy] = aImg(x.x + x.ancho / 2, x.y + x.alto / 2);
    return !r.imagen || (cx >= 0 && cy >= 0 && cx <= r.imagen.ancho && cy <= r.imagen.alto);
  });
  if (sesion) recientes.set(sesion.id, { t: Date.now(), monitor: r.monitor, escala: e, origen: { x: m.x, y: m.y }, elementos: els });

  const lineas = [
    `Monitores: ${r.monitores.map(x => `${x.n}${x.primario ? ' (principal)' : ''} ${x.ancho}x${x.alto}`).join(' · ')}. Capturado: monitor ${r.monitor}.`,
    `Ventana activa: "${r.ventana.titulo}" (${r.ventana.proceso}).`,
  ];
  if (r.imagen) lineas.push(`Imagen adjunta de ${r.imagen.ancho}x${r.imagen.alto} px (escala 1:${e}). Las coordenadas [x,y] de abajo son píxeles DE LA IMAGEN (centro del elemento).`);
  if (els.length) {
    lineas.push(`Elementos de la ventana activa (${els.length}):`);
    for (const x of els) {
      const [cx, cy] = aImg(x.x + x.ancho / 2, x.y + x.alto / 2);
      lineas.push(`#${x.id} ${x.tipo} "${x.nombre}"${x.valor ? ` = "${x.valor}"` : ''}${x.activo === false ? ' (desactivado)' : ''}${x.foco ? ' (con foco)' : ''} [${cx},${cy}]`);
    }
  } else if (elementos) lineas.push(r.errorElementos ? `(no pude leer los elementos: ${r.errorElementos})` : '(la ventana activa no expone elementos: guíate por la imagen)');
  return { texto: lineas.join('\n'), imagenes: r.imagen ? [{ mime: 'image/jpeg', ruta: r.imagen.ruta }] : [] };
}

module.exports = { verPantalla, recientes, bloqueada, BLOQUEADAS };
