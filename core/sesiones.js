// Sesiones persistentes: <dir>/sesiones/<id>.json (meta) + <id>.jsonl (mensajes).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function crearSesiones({ cfg }) {
  const dir = path.join(cfg.dir, 'sesiones'); fs.mkdirSync(dir, { recursive: true });
  const vivas = new Map();
  const F = (id, ext) => path.join(dir, `${id}.${ext}`);
  const valido = id => /^[a-z0-9-]{6,40}$/.test(id);

  function guardarMeta(s) {
    const { mensajes, ...meta } = s;
    fs.writeFileSync(F(s.id, 'json'), JSON.stringify(meta, null, 2));
  }
  function crear({ modelo, cwd, titulo, canal, tarea, padre, nombreAgente } = {}) {
    const s = {
      id: crypto.randomUUID().slice(0, 8), titulo: titulo || 'Nueva sesión', modelo: modelo || cfg.modeloPorDefecto,
      cwd: path.resolve(cwd || process.cwd()), canal: canal || 'api', tarea: tarea || undefined,
      padre: padre || undefined, nombreAgente: nombreAgente || undefined, creada: Date.now(), actualizada: Date.now(),
      uso: { entrada: 0, salida: 0 }, mensajes: [],
    };
    vivas.set(s.id, s); guardarMeta(s); fs.writeFileSync(F(s.id, 'jsonl'), '');
    return s;
  }
  function obtener(id) {
    if (!valido(id)) return null;
    if (vivas.has(id)) return vivas.get(id);
    try {
      const s = JSON.parse(fs.readFileSync(F(id, 'json'), 'utf8'));
      s.mensajes = fs.readFileSync(F(id, 'jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
      vivas.set(id, s); return s;
    } catch { return null; }
  }
  function agregar(s, m) {
    s.mensajes.push(m); s.actualizada = Date.now();
    fs.appendFileSync(F(s.id, 'jsonl'), JSON.stringify(m) + '\n');
  }
  function lista() {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.actualizada - a.actualizada);
  }
  function borrar(id) {
    if (!valido(id)) return false;
    vivas.delete(id);
    for (const e of ['json', 'jsonl']) try { fs.unlinkSync(F(id, e)); } catch { }
    return true;
  }
  return { crear, obtener, agregar, guardarMeta, lista, borrar };
}

module.exports = { crearSesiones };
