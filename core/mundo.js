// Mundo de Mission Control: el mapa pixel-art donde se ven los agentes. Un JSON (mundo/1) con salas, pasillos y objetos de un catálogo.
// El de serie es la mazmorra; cada usuario puede describir el suyo y el modelo cerebro lo genera (se guarda en <dir>/mundo.json).
// /v1/mundo: GET → {mundo, propio} · PUT {mundo} → guardar · DELETE → volver al de serie · POST generar {descripcion} → {mundo} (sin guardar)
const fs = require('fs');
const path = require('path');

const ROLES = ['servidores', 'principal', 'subagentes', 'taller', 'mcp', 'modelos', 'biblioteca', 'decor'];
const SUELOS = ['piedra', 'tierra', 'madera', 'metal', 'hierba', 'alfombra'];
const TEMAS = ['mazmorra', 'nave', 'oficina', 'castillo', 'bosque', 'laboratorio'];
const OBJETOS = ['rack', 'antorcha', 'orbe', 'impresora', 'mesa', 'pc', 'estanteria', 'planta', 'barril', 'cofre', 'telescopio', 'cuadro', 'consola', 'tanque', 'sofa', 'caja', 'lampara', 'cables', 'portal', 'brazo', 'alambique', 'caldero', 'ornitoptero', 'tornillo', 'maniqui', 'caballete', 'engranajes', 'carro', 'codice', 'banco', 'vela'];

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
    return { id: txt(s.id, 30, `sala${i}`).replace(/[^\w-]/g, '') || `sala${i}`, nombre: txt(s.nombre, 40, 'Sala'), rol, ...rect(s), suelo: SUELOS.includes(s.suelo) ? s.suelo : 'piedra' };
  }).filter(Boolean);
  for (const rol of ['principal', 'subagentes']) if (!salas.some(s => s.rol === rol)) throw new Error(`falta una sala con rol "${rol}"`);
  return {
    formato: 'mundo/1', nombre: txt(m.nombre, 60, 'Mi mundo'), tema: TEMAS.includes(m.tema) ? m.tema : 'mazmorra', ancho, alto, salas,
    pasillos: (Array.isArray(m.pasillos) ? m.pasillos : []).slice(0, 30).map(rect),
    objetos: (Array.isArray(m.objetos) ? m.objetos : []).filter(o => OBJETOS.includes(o?.tipo)).slice(0, 120).map(o => ({ tipo: o.tipo, x: ent(o.x, 0, ancho - 1, 0), y: ent(o.y, 0, alto - 1, 0) })),
  };
}

const ESQUEMA = {
  type: 'object', required: ['nombre', 'tema', 'ancho', 'alto', 'salas', 'pasillos', 'objetos'],
  properties: {
    nombre: { type: 'string' }, tema: { type: 'string', enum: TEMAS }, ancho: { type: 'integer' }, alto: { type: 'integer' },
    salas: { type: 'array', items: { type: 'object', required: ['id', 'nombre', 'rol', 'x', 'y', 'w', 'h', 'suelo'], properties: {
      id: { type: 'string' }, nombre: { type: 'string' }, rol: { type: 'string', enum: ROLES }, x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' }, suelo: { type: 'string', enum: SUELOS } } } },
    pasillos: { type: 'array', items: { type: 'object', required: ['x', 'y', 'w', 'h'], properties: { x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' } } } },
    objetos: { type: 'array', items: { type: 'object', required: ['tipo', 'x', 'y'], properties: { tipo: { type: 'string', enum: OBJETOS }, x: { type: 'integer' }, y: { type: 'integer' } } } },
  },
};

function crearMundo({ cfg, generarJSON, modelo }) {
  const f = path.join(cfg.dir, 'mundo.json');
  const leer = () => { try { return validar(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return null; } };

  async function generar(descripcion, signal) {
    const d = txt(descripcion, 1500);
    if (!d) throw new Error('describe cómo quieres tu mundo');
    const { datos } = await generarJSON({ modelo: modelo(), signal, schema: ESQUEMA,
      system: 'Diseñas el mapa de un "Mission Control" en pixel-art visto desde arriba, donde viven los agentes de IA de un asistente. Coordenadas en casillas (tiles); (0,0) arriba a la izquierda. ' +
        'Tamaño: ancho entre 30 y 40, alto entre 18 y 24 (más grande se ve diminuto). Reglas: entre 3 y 7 salas rectangulares que NO se solapen, con al menos 2 casillas de hueco entre salas; pasillos rectangulares (ancho 2-4) que unan TODAS las salas (un pasillo toca o se mete 1 casilla en cada sala que une). ' +
        'Roles obligatorios, una sala cada uno: "principal" (el agente principal, la más central, con un objeto "orbe" en su centro), "subagentes" (la más grande: ahí trabajan los subagentes), "servidores" (racks: el núcleo y los plugins) y "taller" (tareas programadas y el turno de noche). ' +
        'Recomendada: "mcp" (el laboratorio donde se conjuran las herramientas MCP: 12-16 x 5-6, con un objeto "portal" (3x3) en el centro y dos "brazo" (1x2) a sus lados; puede llevar "alambique" y "caldero"). En temas antiguos, "subagentes" puede ser un taller de Leonardo (ornitoptero 3x2, tornillo 2x2, maniqui 1x2, engranajes 2x2, carro 2x2, caballete 1x2, banco 2x1, vela; codice en la pared). Otras salas: "biblioteca" (memoria) o "decor". Nombra las salas a juego con el tema y en el idioma de la descripción. ' +
        'Objetos: colócalos DENTRO de las salas (las antorchas/lámparas pueden ir en el borde superior de una sala o de un pasillo); 25-60 objetos en total; los racks ocupan 2x2 casillas, la impresora 3x3, el orbe 2x2, el resto 1-2 casillas: deja hueco. ' +
        'Elige suelos a juego con el tema (nave/laboratorio: metal; oficina: alfombra/madera; bosque: hierba; mazmorra/castillo: piedra/tierra).',
      prompt: `Descripción del usuario:\n${d}\n\nEjemplo de un mundo válido (la mazmorra de serie), para que veas proporciones y formato:\n${JSON.stringify(BASE)}` });
    return validar(datos);
  }

  async function http(M, p, cuerpo) {
    if (M === 'GET' && !p[2]) { const m = leer(); return { mundo: m || BASE, propio: !!m }; }
    if (M === 'PUT' && !p[2]) { const m = validar(cuerpo.mundo); fs.writeFileSync(f, JSON.stringify(m, null, 1)); return { mundo: m, propio: true }; }
    if (M === 'DELETE' && !p[2]) { fs.rmSync(f, { force: true }); return { mundo: BASE, propio: false }; }
    if (M === 'POST' && p[2] === 'generar') return { mundo: await generar(cuerpo.descripcion) };
    const e = new Error('no encontrado'); e.status = 404; throw e;
  }
  return { http, generar, leer };
}

module.exports = { crearMundo, validar, BASE, ROLES, SUELOS, TEMAS, OBJETOS };
