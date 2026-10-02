// Privacidad: exportar todo a un .zip y "borrar todo" con doble confirmación.
//   exportar → memoria, vectores no (se rehacen), grafo, personalidad, sesiones, sueños (informes), consejos, informes del turno,
//              tareas e historiales. NUNCA config.json (claves), token ni conectores.
//   borrar   → paso 1: POST {} devuelve un código y qué se va a borrar (caduca en 2 min);
//              paso 2: POST { codigo, frase: 'BORRAR TODO' } lo borra. La config, las claves y las automatizaciones se quedan.
// zip propio sin dependencias (deflate de zlib + CRC32).
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// ---------- zip ----------
const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function fechaDos(d = new Date()) {
  return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
// archivos: [{ nombre, datos: Buffer|string, fecha? }] → Buffer del zip
function crearZip(archivos) {
  const partes = [], central = [];
  let off = 0;
  for (const a of archivos) {
    const datos = Buffer.isBuffer(a.datos) ? a.datos : Buffer.from(String(a.datos), 'utf8');
    const nombre = Buffer.from(a.nombre.replace(/\\/g, '/'), 'utf8');
    const comp = zlib.deflateRawSync(datos, { level: 6 });
    const usar = comp.length < datos.length ? comp : datos, metodo = usar === comp ? 8 : 0;
    const crc = crc32(datos), { hora, dia } = fechaDos(a.fecha);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(metodo, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(dia, 12); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(usar.length, 18); loc.writeUInt32LE(datos.length, 22);
    loc.writeUInt16LE(nombre.length, 26); loc.writeUInt16LE(0, 28);
    partes.push(loc, nombre, usar);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(metodo, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(usar.length, 20); cen.writeUInt32LE(datos.length, 24);
    cen.writeUInt16LE(nombre.length, 28); cen.writeUInt32LE(off, 42);
    central.push(cen, nombre);
    off += 30 + nombre.length + usar.length;
  }
  const tamCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10); fin.writeUInt32LE(tamCentral, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, ...central, fin]);
}

// qué entra en la exportación (rutas relativas a cfg.dir); las carpetas se recorren enteras salvo binarios pesados
const EXPORTAR = ['memoria.json', 'grafo.json', 'personalidad', 'sesiones', 'suenos', 'consejos', 'turno/informes', 'turno/estado.json', 'tareas.json', 'tareas_historial.jsonl', 'permisos_historial.jsonl', 'agentes.json', 'wrapped'];
const SALTAR = /\.(mp4|jpg|jpeg|png|webm|bak\.json)$|[\\/]_frames[\\/]|[\\/]worktrees[\\/]/i;
// qué se borra con "borrar todo" (la config, el token, las claves, las reglas, las skills y las automatizaciones se quedan)
const BORRAR = ['memoria.json', 'memoria_vec.json', 'grafo.json', 'sesiones', 'suenos', 'consejos', 'turno/informes', 'tareas_historial.jsonl', 'permisos_historial.jsonl', 'capturas', 'wrapped', 'importado', 'nodos-audio'];

function recorrer(base, rel, out, max = 400 * 1024 * 1024) {
  const f = path.join(base, rel);
  let st; try { st = fs.statSync(f); } catch { return; }
  if (st.isDirectory()) { for (const x of fs.readdirSync(f)) recorrer(base, path.join(rel, x), out, max); return; }
  if (SALTAR.test(f) || out.tam + st.size > max) return;
  out.tam += st.size; out.l.push({ nombre: rel.replace(/\\/g, '/'), ruta: f, fecha: st.mtime });
}

function crearPrivacidad({ cfg, memoria, grafo, sesiones, personalidad, registro, bus }) {
  let pendiente = null;          // { codigo, expira }
  const log = t => registro?.add?.('aviso', 'privacidad', t);

  function exportar({ destino } = {}) {
    const out = { l: [], tam: 0 };
    for (const r of EXPORTAR) recorrer(cfg.dir, r, out);
    const archivos = out.l.map(a => ({ nombre: a.nombre, datos: fs.readFileSync(a.ruta), fecha: a.fecha }));
    archivos.unshift({ nombre: 'LEEME.txt', datos: `Exportación de tus datos de APOLO (${new Date().toISOString()}).\n` +
      'memoria.json = recuerdos · grafo.json = entidades y relaciones · personalidad/ = identidad, instrucciones y contexto · sesiones/ = conversaciones (json + jsonl)\n' +
      'suenos/ = informes del sueño · consejos/ · turno/ = informes del turno de noche · tareas*.json(l) · permisos_historial.jsonl\n' +
      'No incluye config.json, claves de API, tokens ni conectores.\n' });
    const zip = crearZip(archivos);
    const carpeta = destino || path.join(os.tmpdir(), 'apolo-exportaciones');
    fs.mkdirSync(carpeta, { recursive: true });
    for (const x of fs.readdirSync(carpeta)) { const p = path.join(carpeta, x); try { if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) fs.unlinkSync(p); } catch { } }   // limpia las de hace > 1 h
    const d = new Date(), nombre = `apolo-datos-${d.toISOString().slice(0, 10)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.zip`;
    const ruta = path.join(carpeta, nombre);
    fs.writeFileSync(ruta, zip);
    log(`exportación creada (${archivos.length} archivos, ${Math.round(zip.length / 1024)} KB)`);
    return { ruta, nombre, archivos: archivos.length, bytes: zip.length };
  }

  function inventario() {
    const n = { recuerdos: memoria.lista().length, sesiones: sesiones.lista().length, entidades: grafo?.resumen?.().entidades || 0 };
    const contar = r => { try { return fs.readdirSync(path.join(cfg.dir, r)).length; } catch { return 0; } };
    try { n.suenos = fs.readdirSync(path.join(cfg.dir, 'suenos')).filter(f => f.endsWith('.json') && !f.endsWith('.bak.json')).length; } catch { n.suenos = 0; }
    n.consejos = contar('consejos'); n.informesTurno = contar('turno/informes');
    return n;
  }
  // paso 1: código; paso 2: código + frase exacta
  function borrar({ codigo, frase } = {}) {
    if (!codigo) {
      pendiente = { codigo: crypto.randomBytes(3).toString('hex').toUpperCase(), expira: Date.now() + 120_000 };
      return { paso: 1, codigo: pendiente.codigo, expira: pendiente.expira, frase: 'BORRAR TODO', seBorra: inventario(),
        seQueda: 'configuración, claves de API, reglas de permisos, skills, plugins y automatizaciones' };
    }
    if (!pendiente || Date.now() > pendiente.expira) throw Object.assign(new Error('el código caducó: empieza otra vez'), { status: 409 });
    if (String(codigo).toUpperCase() !== pendiente.codigo) throw Object.assign(new Error('código incorrecto'), { status: 403 });
    if (String(frase || '').trim().toUpperCase() !== 'BORRAR TODO') throw Object.assign(new Error('escribe exactamente BORRAR TODO'), { status: 400 });
    pendiente = null;
    const antes = inventario();
    for (const s of sesiones.lista()) sesiones.borrar(s.id);
    memoria.borrarTodo();
    grafo?.borrarTodo?.();
    for (const r of BORRAR) try { fs.rmSync(path.join(cfg.dir, r), { recursive: true, force: true }); } catch { }
    fs.mkdirSync(path.join(cfg.dir, 'sesiones'), { recursive: true });
    for (const k of ['contexto']) personalidad?.restablecer?.(k);       // el contexto puede tener datos personales; identidad e instrucciones se quedan
    log(`BORRADO TOTAL: ${JSON.stringify(antes)}`);
    bus?.emit('evento', { tipo: 'privacidad', accion: 'borrado' });
    return { paso: 2, ok: true, borrado: antes };
  }

  // API /v1/privacidad (daemon → extensiones)
  async function http(M, p, b = {}) {
    if (M === 'GET' && !p[2]) return { inventario: inventario(), exportar: EXPORTAR, borrar: BORRAR };
    if (M === 'POST' && p[2] === 'exportar') { const r = exportar(); return b.info ? r : { __archivo: r.ruta, nombre: r.nombre }; }
    if (M === 'POST' && p[2] === 'borrar') return borrar(b);
    throw Object.assign(new Error('ruta'), { status: 404 });
  }
  return { exportar, borrar, inventario, http };
}

module.exports = { crearPrivacidad, crearZip, crc32 };
