// Mundo de Mission Control: el mapa pixel-art donde se ven los agentes. Un JSON (mundo/1) con salas, pasillos y objetos de un catálogo.
// El de serie es la mazmorra; cada usuario puede describir el suyo y el modelo cerebro lo genera (se guarda en <dir>/mundo.json).
// /v1/mundo: GET → {mundo, propio} · PUT {mundo} → guardar · DELETE → volver al de serie · POST generar {descripcion} → {mundo} (sin guardar)
const fs = require('fs');
const path = require('path');

const ROLES = ['servidores', 'principal', 'subagentes', 'taller', 'mcp', 'modelos', 'biblioteca', 'decor'];
const SUELOS = ['piedra', 'tierra', 'madera', 'metal', 'hierba', 'alfombra', 'organico', 'roca', 'lava', 'rejilla'];
const TEMAS = ['mazmorra', 'nave', 'oficina', 'castillo', 'bosque', 'laboratorio', 'colmena', 'infierno', 'estacion'];
const OBJETOS = ['rack', 'antorcha', 'orbe', 'impresora', 'mesa', 'pc', 'estanteria', 'planta', 'barril', 'cofre', 'telescopio', 'cuadro', 'consola', 'tanque', 'sofa', 'caja', 'lampara', 'cables', 'portal', 'brazo', 'alambique', 'caldero', 'ornitoptero', 'tornillo', 'maniqui', 'caballete', 'engranajes', 'carro', 'codice', 'banco', 'vela', 'vaina', 'jaula', 'holo', 'brasero', 'calaveras', 'tuberias', 'tentaculos', 'yunque'];

const BASE = {
  formato: 'mundo/1', nombre: 'Mazmorra de APOLO', tema: 'mazmorra', ancho: 37, alto: 26,
  salas: [
    { id: 'servidores', nombre: 'Sala de servidores', rol: 'servidores', x: 1, y: 1, w: 11, h: 8, suelo: 'metal' },
    { id: 'taller', nombre: 'Zona de la impresora 3D', rol: 'taller', x: 1, y: 11, w: 11, h: 9, suelo: 'piedra' },
    { id: 'principal', nombre: 'Área del agente principal de IA', rol: 'principal', x: 15, y: 6, w: 11, h: 10, suelo: 'piedra' },
    { id: 'subagentes', nombre: 'Taller de Leonardo · subagentes', rol: 'subagentes', x: 28, y: 1, w: 8, h: 14, suelo: 'madera' },
    { id: 'mcp', nombre: 'Laboratorio MCP', rol: 'mcp', x: 21, y: 20, w: 15, h: 5, suelo: 'piedra' },
  ],
  pasillos: [
    { x: 12, y: 3, w: 16, h: 2 }, { x: 19, y: 5, w: 3, h: 1 }, { x: 26, y: 10, w: 2, h: 2 }, { x: 5, y: 9, w: 2, h: 2 },
    { x: 12, y: 17, w: 21, h: 2 }, { x: 19, y: 16, w: 2, h: 1 }, { x: 31, y: 15, w: 2, h: 2 }, { x: 19, y: 19, w: 2, h: 7 }, { x: 28, y: 19, w: 2, h: 1 },
  ],
  objetos: [
    { tipo: 'rack', x: 2, y: 3 }, { tipo: 'rack', x: 5, y: 3 }, { tipo: 'rack', x: 8, y: 3 }, { tipo: 'rack', x: 2, y: 6 }, { tipo: 'rack', x: 5, y: 6 }, { tipo: 'rack', x: 8, y: 6 },
    { tipo: 'cables', x: 10, y: 6 },
    { tipo: 'impresora', x: 5, y: 13 }, { tipo: 'cuadro', x: 9, y: 10 }, { tipo: 'estanteria', x: 1, y: 12 }, { tipo: 'pc', x: 1, y: 17 }, { tipo: 'mesa', x: 9, y: 18 },
    { tipo: 'caja', x: 11, y: 12 }, { tipo: 'barril', x: 11, y: 15 },
    { tipo: 'orbe', x: 19, y: 10 }, { tipo: 'estanteria', x: 24, y: 6 }, { tipo: 'cofre', x: 15, y: 15 },
    { tipo: 'ornitoptero', x: 29, y: 3 }, { tipo: 'tornillo', x: 33, y: 3 }, { tipo: 'maniqui', x: 28, y: 7 }, { tipo: 'engranajes', x: 30, y: 7 },
    { tipo: 'caballete', x: 35, y: 6 }, { tipo: 'carro', x: 33, y: 9 }, { tipo: 'banco', x: 29, y: 13 }, { tipo: 'vela', x: 28, y: 5 }, { tipo: 'vela', x: 35, y: 12 },
    { tipo: 'codice', x: 28, y: 0 }, { tipo: 'codice', x: 33, y: 0 },
    { tipo: 'antorcha', x: 14, y: 2 }, { tipo: 'antorcha', x: 25, y: 2 }, { tipo: 'antorcha', x: 31, y: 0 }, { tipo: 'antorcha', x: 35, y: 0 },
    { tipo: 'antorcha', x: 16, y: 5 }, { tipo: 'antorcha', x: 23, y: 5 }, { tipo: 'antorcha', x: 2, y: 10 }, { tipo: 'antorcha', x: 8, y: 10 },
    { tipo: 'antorcha', x: 13, y: 16 }, { tipo: 'antorcha', x: 27, y: 16 }, { tipo: 'antorcha', x: 36, y: 7 }, { tipo: 'antorcha', x: 26, y: 9 }, { tipo: 'antorcha', x: 25, y: 19 }, { tipo: 'antorcha', x: 33, y: 19 }, { tipo: 'portal', x: 27, y: 21 }, { tipo: 'brazo', x: 25, y: 21 }, { tipo: 'brazo', x: 31, y: 21 }, { tipo: 'alambique', x: 21, y: 21 }, { tipo: 'caldero', x: 23, y: 23 }, { tipo: 'tanque', x: 34, y: 21 }, { tipo: 'estanteria', x: 32, y: 20 },
  ],
};

// estilo: ajustes finos del tema (paleta, muros, núcleo, quiénes viven ahí, partículas); todo opcional y en lista blanca
const ESTILO = { muro: ['ladrillo', 'panel', 'azulejo', 'yeso', 'tronco', 'organico', 'roca'], luz: ['antorcha', 'neon', 'lampara', 'lava', 'bio'],
  nucleo: ['orbe', 'cerebro', 'cerebro-fuego'], pueblo: ['humanos', 'aliens', 'demonios', 'cientificos'], particulas: ['brasas', 'esporas', 'chispas', 'ninguna'],
  deco: ['mazmorra', 'nave', 'oficina', 'colmena', 'infierno'] };
function validarEstilo(e) {
  if (!e || typeof e !== 'object') return undefined;
  const o = {}, HEX = /^#[0-9a-f]{6}$/i;
  for (const [k, l] of Object.entries(ESTILO)) if (l.includes(e[k])) o[k] = e[k];
  for (const k of ['pared', 'borde', 'acento', 'nucleoColor']) if (HEX.test(String(e[k] || ''))) o[k] = e[k];
  for (const k of ['fondo', 'amb']) if (Array.isArray(e[k]) && e[k].length === 3 && e[k].every(n => Number.isInteger(n) && n >= 0 && n <= 255)) o[k] = e[k];
  if (typeof e.sala === 'number' && isFinite(e.sala)) o.sala = Math.max(0, Math.min(.5, e.sala));
  return Object.keys(o).length ? o : undefined;
}
const ent = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const txt = (v, max, def = '') => String(v ?? def).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) || def;

// deja un mundo dentro de los límites; lo que no encaja se recorta o se descarta (nunca falla por un detalle del modelo)
function validar(m) {
  if (!m || typeof m !== 'object') throw new Error('el mundo debe ser un objeto JSON');
  const ancho = ent(m.ancho, 24, 96, 64), alto = ent(m.alto, 16, 54, 36);
  const rect = r => { const x = ent(r.x, 0, ancho - 1, 1), y = ent(r.y, 0, alto - 1, 1); return { x, y, w: ent(r.w, 1, ancho - x, 6), h: ent(r.h, 1, alto - y, 6) }; };
  const vistos = new Set();
  const salas = (Array.isArray(m.salas) ? m.salas : []).slice(0, 12).map((s, i) => {
    const rol = ROLES.includes(s.rol) ? s.rol : 'decor';
    if (rol !== 'decor' && vistos.has(rol)) return null; vistos.add(rol);
    return { id: txt(s.id, 30, `sala${i}`).replace(/[^\w-]/g, '') || `sala${i}`, nombre: rol === 'decor' && !String(s.nombre || '').trim() ? '' : txt(s.nombre, 40, 'Sala'), rol, ...rect(s), suelo: SUELOS.includes(s.suelo) ? s.suelo : 'piedra' };
  }).filter(Boolean);
  for (const rol of ['principal', 'subagentes']) if (!salas.some(s => s.rol === rol)) throw new Error(`falta una sala con rol "${rol}"`);
  const estilo = validarEstilo(m.estilo);
  return {
    formato: 'mundo/1', nombre: txt(m.nombre, 60, 'Mi mundo'), tema: TEMAS.includes(m.tema) ? m.tema : 'mazmorra', ...(estilo ? { estilo } : {}), ancho, alto, salas,
    pasillos: (Array.isArray(m.pasillos) ? m.pasillos : []).slice(0, 30).map(rect),
    objetos: (Array.isArray(m.objetos) ? m.objetos : []).filter(o => OBJETOS.includes(o?.tipo)).slice(0, 120).map(o => ({ tipo: o.tipo, x: ent(o.x, 0, ancho - 1, 0), y: ent(o.y, 0, alto - 1, 0) })),
  };
}

const ESQUEMA = {
  type: 'object', required: ['nombre', 'tema', 'ancho', 'alto', 'salas', 'pasillos', 'objetos'],
  properties: {
    nombre: { type: 'string' }, tema: { type: 'string', enum: TEMAS }, ancho: { type: 'integer' }, alto: { type: 'integer' }, estilo: { type: 'object' },
    salas: { type: 'array', items: { type: 'object', required: ['id', 'nombre', 'rol', 'x', 'y', 'w', 'h', 'suelo'], properties: {
      id: { type: 'string' }, nombre: { type: 'string' }, rol: { type: 'string', enum: ROLES }, x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' }, suelo: { type: 'string', enum: SUELOS } } } },
    pasillos: { type: 'array', items: { type: 'object', required: ['x', 'y', 'w', 'h'], properties: { x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' } } } },
    objetos: { type: 'array', items: { type: 'object', required: ['tipo', 'x', 'y'], properties: { tipo: { type: 'string', enum: OBJETOS }, x: { type: 'integer' }, y: { type: 'integer' } } } },
  },
};

function crearMundo({ cfg, generarJSON, modelo }) {
  const f = path.join(cfg.dir, 'mundo.json');
  const leer = () => { try { return validar(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return null; } };

  // el catálogo y el validador de la skill mission-control: el modelo diseña con lo mismo que usa la skill
  const CATALOGO = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'skills', 'maker', 'mission-control', 'references', 'catalogo.md'), 'utf8'); } catch { return ''; } })();
  const validarSkill = (() => { try { return require('../skills/maker/mission-control/scripts/validar').validar; } catch { return null; } })();
  const EJEMPLO = (() => { try { return fs.readFileSync(path.join(__dirname, 'mundos', 'infierno.json'), 'utf8'); } catch { return JSON.stringify(BASE); } })();

  // genera un mundo desde una descripción, una imagen de referencia (data URL) o las dos; si el validador de la skill encuentra
  // errores (salas a las que no se llega, objetos inventados…) se los devuelve al modelo una vez para que los arregle
  async function generar(descripcion, signal, imagen) {
    const d = txt(descripcion, 3000);
    let img = null;
    if (imagen) { const mm = String(imagen).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/); if (!mm) throw new Error('la imagen debe ser PNG, JPG o WebP'); img = { mime: mm[1], datos: mm[2] }; }
    if (!d && !img) throw new Error('describe cómo quieres tu mundo o sube una imagen de referencia');
    const system = 'Diseñas el mapa de un "Mission Control" en pixel-art visto desde arriba, donde viven los agentes de IA de un asistente. Coordenadas en casillas (tiles); (0,0) arriba a la izquierda. ' +
      'Sigue AL PIE DE LA LETRA este catálogo: solo esos temas, claves de estilo, suelos y tipos de objeto, con sus tamaños, y sus reglas de distribución.\n\n' + CATALOGO;
    const pedir = img ? `Recrea la IMAGEN adjunta como mundo: misma distribución de salas (posición relativa), misma paleta (pon los colores en "estilo"), mismo núcleo, mismo pueblo y los objetos icónicos traducidos al catálogo. Nombres de sala tal como se leen en la imagen.${d ? `\nIndicaciones extra del usuario: ${d}` : ''}`
      : `Descripción del usuario:\n${d}`;
    let prompt = `${pedir}\n\nEjemplo de un mundo válido (proporciones y formato):\n${EJEMPLO}`, ultimo = null;
    for (let intento = 0; intento < 2; intento++) {
      const { datos } = await generarJSON({ modelo: modelo(), signal, schema: ESQUEMA, system, prompt, imagenes: img ? [img] : undefined });
      ultimo = validar(datos);
      const errs = validarSkill ? validarSkill(ultimo).err : [];
      if (!errs.length) return ultimo;
      prompt = `${pedir}\n\nTu mundo anterior tiene estos errores; corrígelos y devuelve el mundo completo:\n- ${errs.slice(0, 12).join('\n- ')}\n\nMundo anterior:\n${JSON.stringify(ultimo)}`;
    }
    return ultimo;                                                     // con algún aviso, pero válido para el motor
  }

  const dirPresets = path.join(__dirname, 'mundos');
  const dirUsuario = path.join(cfg.dir, 'mundos');                 // la galería del usuario (la skill mission-control guarda aquí)
  const de = d => { let l = []; try { l = fs.readdirSync(d).filter(x => x.endsWith('.json')); } catch { }
    return l.map(x => { try { return { id: x.slice(0, -5).replace(/[^\w-]/g, ''), mundo: validar(JSON.parse(fs.readFileSync(path.join(d, x), 'utf8'))) }; } catch { return null; } }).filter(Boolean); };
  const presets = () => { const vistos = new Set(), l = [{ id: 'mazmorra', mundo: BASE }, ...de(dirPresets), ...de(dirUsuario)]; return l.filter(x => !vistos.has(x.id) && vistos.add(x.id)); };
  async function http(M, p, cuerpo) {
    if (M === 'GET' && !p[2]) { const m = leer(); return { mundo: m || BASE, propio: !!m }; }
    if (M === 'GET' && p[2] === 'presets') { const l = presets(); if (p[3]) { const x = l.find(y => y.id === p[3]); if (!x) { const e = new Error('no existe'); e.status = 404; throw e; } return { mundo: x.mundo }; } return l.map(x => ({ id: x.id, nombre: x.mundo.nombre, tema: x.mundo.tema })); }
    if (M === 'PUT' && !p[2]) { const m = validar(cuerpo.mundo); fs.writeFileSync(f, JSON.stringify(m, null, 1)); return { mundo: m, propio: true }; }
    if (M === 'DELETE' && !p[2]) { fs.rmSync(f, { force: true }); return { mundo: BASE, propio: false }; }
    if (M === 'POST' && p[2] === 'generar') return { mundo: await generar(cuerpo.descripcion, undefined, cuerpo.imagen) };
    const e = new Error('no encontrado'); e.status = 404; throw e;
  }
  return { http, generar, leer };
}

module.exports = { crearMundo, validar, BASE, ROLES, SUELOS, TEMAS, OBJETOS, ESTILO };
