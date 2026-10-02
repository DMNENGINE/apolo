// Control del escritorio (Windows). Fase 1: ver la pantalla (captura + elementos de la ventana activa por UI Automation).
// Fase 3: la misma mirada sirve para COMPROBAR tras cada acción (control.js) y alimenta el registro de capturas (registro.js);
// si la ventana apenas expone elementos, la imagen lleva una rejilla numerada (set-of-marks) para elegir celda → coordenadas.
// cfg.escritorio = { ancho: px de la imagen, bloqueadas: [regex de títulos/procesos donde el robot NO mira ni actúa],
//                    vision: { activo: true, minElementos: 4, columnas: 16 } }
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const BLOQUEADAS = ['banco', '\\bbank', 'paypal', 'zelle', 'venmo', 'cash ?app', 'wallet', 'binance', 'coinbase', 'metamask', 'kraken',
  '1password', 'bitwarden', 'keepass', 'lastpass', 'dashlane', 'administrador de contrase', 'password manager', 'credential manager'];

// sesion.id -> { t, monitor, escala, origen:{x,y}, imagen:{ancho,alto}, rejilla:{cols,filas}|null, elementos } (para los clics de la fase 2)
// origen/escala = el marco de la ÚLTIMA IMAGEN que vio el modelo: sus x,y y las de la lista se refieren a ella
const recientes = new Map();

function bloqueada(cfg, ventana) {
  const lista = cfg.escritorio?.bloqueadas || BLOQUEADAS;
  const txt = `${ventana?.titulo || ''} ${ventana?.proceso || ''}`;
  return lista.find(p => { try { return new RegExp(p, 'i').test(txt); } catch { return false; } }) || null;
}

// borra lo que tenga más de 24 h: capturas sueltas (fase 1) y las de las carpetas por sesión (registro de la fase 3)
function limpiarViejas(dir, horas = 24) {
  const limite = Date.now() - horas * 3600_000;
  let nombres = []; try { nombres = fs.readdirSync(dir); } catch { return; }
  for (const f of nombres) {
    const fp = path.join(dir, f);
    try {
      const st = fs.statSync(fp);
      if (st.isDirectory()) {
        limpiarViejas(fp, horas);
        if (!fs.readdirSync(fp).some(x => /\.(jpg|mp4)$/i.test(x)) && st.mtimeMs < limite) fs.rmSync(fp, { recursive: true, force: true });
      } else if (st.mtimeMs < limite) fs.unlinkSync(fp);
    } catch { }
  }
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

// "ojos" por defecto: pantalla.ps1. Los tests inyectan unos falsos con la misma forma de respuesta.
async function ojosPs({ salida, monitor = 0, ancho = 1280, elementos = true, sinImagen = false, rejillaSiMenos = 0, columnas = 16 }) {
  const args = ['-Salida', salida, '-Monitor', String(monitor | 0), '-Ancho', String(ancho), '-Elementos', elementos ? '1' : '0'];
  if (sinImagen) args.push('-SinImagen');
  if (rejillaSiMenos > 0) args.push('-RejillaSiMenos', String(rejillaSiMenos | 0), '-Columnas', String(columnas | 0));
  return ejecutarPs(args);
}

const UTILES = x => x.nombre && !['Text', 'Image'].includes(x.tipo);

// mira una vez: captura + elementos ya filtrados al monitor capturado. No toca `recientes`.
// → { prot, ventana, monitores, monitor, origen, escala, imagen:{ruta,ancho,alto,rejilla?}, elementos (coords de PANTALLA), errorElementos }
async function mirar({ cfg, sesion, monitor = 0, imagen = true, elementos = true, ojos, ruta }) {
  if (process.platform !== 'win32' && !ojos) throw new Error('ver la pantalla solo está disponible en Windows por ahora');
  const dir = path.join(cfg.dir, 'capturas'); fs.mkdirSync(dir, { recursive: true }); limpiarViejas(dir);
  const salida = ruta || path.join(dir, `${sesion?.id || 'x'}-${Date.now()}.jpg`);
  const vis = cfg.escritorio?.vision || {};
  const r = await (ojos || ojosPs)({ salida, monitor, ancho: cfg.escritorio?.ancho || 1280, elementos, sinImagen: !imagen,
    rejillaSiMenos: imagen && elementos && vis.activo !== false ? (vis.minElementos ?? 4) : 0, columnas: vis.columnas || 16 });
  const prot = bloqueada(cfg, r.ventana);
  if (prot) {                                            // ventana sensible: ni imagen ni valores de campos, y nada se guarda
    for (const f of [r.imagen?.ruta, r.imagen?.rejilla?.ruta]) { try { if (f) fs.unlinkSync(f); } catch { } }
    return { prot, ventana: r.ventana, monitores: r.monitores, monitor: r.monitor, imagen: null, elementos: [] };
  }
  const m = (r.monitores || []).find(x => x.n === r.monitor) || { x: 0, y: 0 };
  const e = r.escala || 1;
  const els = (r.elementos || []).filter(x => {               // solo lo que cae dentro del monitor capturado
    const cx = (x.x + x.ancho / 2 - m.x) / e, cy = (x.y + x.alto / 2 - m.y) / e;
    return !r.imagen || (cx >= 0 && cy >= 0 && cx <= r.imagen.ancho && cy <= r.imagen.alto);
  });
  return { prot: null, ventana: r.ventana, monitores: r.monitores || [], monitor: r.monitor, origen: { x: m.x, y: m.y }, escala: e, imagen: r.imagen || null,
    elementos: els, errorElementos: r.errorElementos, utiles: els.filter(UTILES).length };
}

// línea de un elemento en el marco (origen/escala) de la imagen que tiene el modelo
const lineaElemento = (x, marco) => {
  const cx = Math.round((x.x + x.ancho / 2 - marco.origen.x) / marco.escala), cy = Math.round((x.y + x.alto / 2 - marco.origen.y) / marco.escala);
  return `#${x.id} ${x.tipo} "${x.nombre}"${x.valor ? ` = "${x.valor}"` : ''}${x.activo === false ? ' (desactivado)' : ''}${x.foco ? ' (con foco)' : ''} [${cx},${cy}]`;
};

function textoRejilla(rj) {
  return `La ventana apenas expone elementos accesibles: la imagen adjunta lleva una REJILLA numerada de ${rj.cols}×${rj.filas} celdas ` +
    '(la 1 arriba a la izquierda, de izquierda a derecha y fila a fila). Para actuar puedes pasar "celda": N en clic/escribir/scroll/arrastrar ' +
    '(apunta al centro de esa celda); para afinar, usa x,y de la imagen.';
}

// marco de referencia para recientes a partir de una mirada
const marcoDe = v => ({ monitor: v.monitor, escala: v.escala, origen: v.origen, imagen: v.imagen ? { ancho: v.imagen.ancho, alto: v.imagen.alto } : null,
  rejilla: v.imagen?.rejilla ? { cols: v.imagen.rejilla.cols, filas: v.imagen.rejilla.filas } : null });

// devuelve { texto, imagenes: [{ mime, ruta }], vista } para el agente (vista = lo que vio, para el registro)
async function verPantalla({ cfg, sesion, monitor = 0, imagen = true, elementos = true, ojos, ruta }) {
  const v = await mirar({ cfg, sesion, monitor, imagen, elementos, ojos, ruta });
  if (v.prot) {
    recientes.delete(sesion?.id);
    return { texto: `La ventana activa ("${v.ventana?.titulo}") está PROTEGIDA (coincide con "${v.prot}"): por seguridad no la miro ni actúo en ella. Pide al usuario que lo haga él.`, imagenes: [], vista: v };
  }
  const rj = v.imagen?.rejilla || null;
  const els = v.elementos.map((x, i) => ({ ...x, id: x.id ?? i + 1 }));
  if (sesion) recientes.set(sesion.id, { t: Date.now(), ...marcoDe(v), elementos: els });

  const lineas = [
    `Monitores: ${v.monitores.map(x => `${x.n}${x.primario ? ' (principal)' : ''} ${x.ancho}x${x.alto}`).join(' · ')}. Capturado: monitor ${v.monitor}.`,
    `Ventana activa: "${v.ventana.titulo}" (${v.ventana.proceso}).`,
  ];
  if (v.imagen) lineas.push(`Imagen adjunta de ${v.imagen.ancho}x${v.imagen.alto} px (escala 1:${v.escala}). Las coordenadas [x,y] de abajo son píxeles DE LA IMAGEN (centro del elemento).`);
  if (rj) lineas.push(textoRejilla(rj));
  if (els.length) {
    lineas.push(`Elementos de la ventana activa (${els.length}):`);
    for (const x of els) lineas.push(lineaElemento(x, v));
  } else if (elementos) lineas.push(v.errorElementos ? `(no pude leer los elementos: ${v.errorElementos})` : '(la ventana activa no expone elementos: guíate por la imagen)');
  const img = rj?.ruta || v.imagen?.ruta;
  return { texto: lineas.join('\n'), imagenes: img ? [{ mime: 'image/jpeg', ruta: img }] : [], vista: v };
}

module.exports = { verPantalla, mirar, marcoDe, recientes, bloqueada, lineaElemento, textoRejilla, limpiarViejas, BLOQUEADAS };
