// Sesiones persistentes: <dir>/sesiones/<id>.json (meta) + <id>.jsonl (mensajes).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function crearSesiones({ cfg }) {
  const dir = path.join(cfg.dir, 'sesiones'); fs.mkdirSync(dir, { recursive: true });
  const vivas = new Map();
  const borradas = new Set();
  const F = (id, ext) => path.join(dir, `${id}.${ext}`);
  const valido = id => /^[a-z0-9-]{6,40}$/.test(id);

  function guardarMeta(s) {
    if (borradas.has(s.id)) return;
    if (!valido(s.id)) throw new Error('id de sesion invalido');
    const { mensajes, ...meta } = s;
    require('./persistencia').escribirAtomico(F(s.id, 'json'), JSON.stringify(meta, null, 2));
  }
  function crear({ modelo, cwd, titulo, canal, tarea, padre, nombreAgente, enrutamiento } = {}) {
    const s = {
      id: crypto.randomUUID().slice(0, 8), titulo: titulo || 'Nueva sesión', modelo: modelo || cfg.modeloPorDefecto,
      cwd: path.resolve(cwd || process.cwd()), canal: canal || 'api', tarea: tarea || undefined,
      padre: padre || undefined, nombreAgente: nombreAgente || undefined, creada: Date.now(), actualizada: Date.now(),
      uso: { entrada: 0, salida: 0 }, mensajes: [],
      ...(enrutamiento === true ? { enrutamiento: true } : {}),
    };
    vivas.set(s.id, s); guardarMeta(s); fs.writeFileSync(F(s.id, 'jsonl'), '');
    return s;
  }
  function obtener(id) {
    if (!valido(id)) return null;
    if (vivas.has(id)) return vivas.get(id);
    try {
      const s = JSON.parse(fs.readFileSync(F(id, 'json'), 'utf8'));
      if (s.id !== id) return null;
      const archivo = F(id, 'jsonl'), bytes = fs.readFileSync(archivo), original = bytes.toString('utf8');
      const validas = [], corruptas = [];
      s.mensajes = [];
      original.split('\n').forEach((linea, i) => {
        if (!linea.trim()) return;
        try { const m = JSON.parse(linea); if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('entrada invalida'); s.mensajes.push(m); validas.push(linea); }
        catch { corruptas.push(i + 1); }
      });
      if (corruptas.length) {
        // Copia exacta antes de reparar: los siguientes append nunca quedan pegados a una linea truncada.
        const evidencia = archivo + '.corrupto-' + crypto.randomUUID();
        fs.writeFileSync(evidencia, bytes, { flag: 'wx' });
        require('./persistencia').escribirAtomico(archivo, validas.join('\n') + (validas.length ? '\n' : ''));
        s.recuperacion = { lineas: corruptas, evidencia: path.basename(evidencia) };
      } else if (original && !original.endsWith('\n')) fs.appendFileSync(archivo, '\n');
      vivas.set(id, s); return s;
    } catch { return null; }
  }
  function agregar(s, m) {
    if (borradas.has(s.id)) throw new Error('sesion eliminada');
    if (!valido(s.id)) throw new Error('id de sesion invalido');
    fs.appendFileSync(F(s.id, 'jsonl'), JSON.stringify(m) + '\n');
    s.mensajes.push(m); s.actualizada = Date.now();
  }
  // conversación que viene de fuera (espejo de Claude Code): id y fechas propios; meta se mezcla con la que hubiera y
  // los mensajes nuevos se añaden sin tocar "actualizada" (la pone quien llama, con la hora real del último mensaje)
  function espejar(meta, nuevos = []) {
    if (!valido(meta.id)) throw new Error(`id no válido: ${meta.id}`);
    let previa = vivas.get(meta.id);
    if (!previa) try { previa = JSON.parse(fs.readFileSync(F(meta.id, 'json'), 'utf8')); } catch { previa = null; }
    const { mensajes: _m, ...antes } = previa || { creada: meta.creada || Date.now(), uso: { entrada: 0, salida: 0 } };
    const s = { ...antes, ...meta };
    guardarMeta(s);
    if (nuevos.length || !previa) fs.appendFileSync(F(s.id, 'jsonl'), nuevos.map(m => JSON.stringify(m) + '\n').join(''));
    const viva = vivas.get(s.id);
    if (viva) Object.assign(viva, s, { mensajes: [...viva.mensajes, ...nuevos] });
    return s;
  }
  function lista() {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.actualizada - a.actualizada);
  }
  function borrar(id) {
    if (!valido(id)) return false;
    borradas.add(id);
    vivas.delete(id);
    for (const e of ['json', 'jsonl']) try { fs.unlinkSync(F(id, e)); } catch { }
    return true;
  }
  return { crear, obtener, agregar, guardarMeta, espejar, lista, borrar };
}

module.exports = { crearSesiones };
