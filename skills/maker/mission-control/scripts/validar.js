#!/usr/bin/env node
// Valida un mundo/1 de Mission Control antes de aplicarlo: catálogo, solapes, conexión andando, entradas libres, carteles y objetos en su sitio.
// Uso: node scripts/validar.js mundo.json   → informe; código de salida 1 si hay errores.
'use strict';
const fs = require('fs');

const TEMAS = ['mazmorra', 'nave', 'oficina', 'castillo', 'bosque', 'laboratorio', 'colmena', 'infierno', 'estacion'];
const SUELOS = ['piedra', 'tierra', 'madera', 'metal', 'hierba', 'alfombra', 'organico', 'roca', 'lava', 'rejilla'];
const ROLES = ['servidores', 'principal', 'subagentes', 'taller', 'mcp', 'modelos', 'biblioteca', 'decor'];
// tipo: [ancho, alto, bloquea, de pared]
const OBJ = { rack: [2, 2, 1], antorcha: [1, 1, 0, 1], orbe: [2, 2, 1], impresora: [3, 3, 1], mesa: [2, 1, 1], pc: [2, 2, 1], estanteria: [2, 2, 1], planta: [1, 1, 1],
  barril: [1, 1, 1], cofre: [1, 1, 1], telescopio: [1, 2, 1], cuadro: [2, 1, 0, 1], consola: [2, 1, 1], tanque: [1, 2, 1], sofa: [2, 1, 1], caja: [1, 1, 1], lampara: [1, 1, 0, 1], cables: [2, 1, 0],
  portal: [3, 3, 1], brazo: [1, 2, 1], alambique: [2, 1, 1], caldero: [1, 1, 1], ornitoptero: [3, 2, 1], tornillo: [2, 2, 1], maniqui: [1, 2, 1], caballete: [1, 2, 1], engranajes: [2, 2, 1],
  carro: [2, 2, 1], codice: [2, 1, 0, 1], banco: [2, 1, 1], vela: [1, 1, 1], vaina: [1, 2, 1], jaula: [2, 2, 1], holo: [1, 1, 1], brasero: [1, 1, 1], calaveras: [1, 1, 1],
  tuberias: [2, 1, 0, 1], tentaculos: [1, 1, 0], yunque: [2, 1, 1] };
const SERVIDOR = ['rack', 'vaina', 'jaula'];
const ESTILO = { muro: ['ladrillo', 'panel', 'azulejo', 'yeso', 'tronco', 'organico', 'roca'], luz: ['antorcha', 'neon', 'lampara', 'lava', 'bio'], nucleo: ['orbe', 'cerebro', 'cerebro-fuego'],
  pueblo: ['humanos', 'aliens', 'demonios', 'cientificos'], particulas: ['brasas', 'esporas', 'chispas', 'ninguna'], deco: ['mazmorra', 'nave', 'oficina', 'colmena', 'infierno'] };

function validar(m) {
  const err = [], av = [], E = t => err.push(t), A = t => av.push(t);
  if (m.formato !== 'mundo/1') A('falta "formato": "mundo/1"');
  if (!TEMAS.includes(m.tema)) E(`tema desconocido "${m.tema}" (usa: ${TEMAS.join(', ')})`);
  const W = m.ancho | 0, H = m.alto | 0;
  if (W < 24 || W > 96 || H < 16 || H > 54) E(`tamaño ${W}x${H} fuera de 24–96 × 16–54`);
  else if (W > 44 || H > 28) A(`${W}x${H} es grande: se verá pequeño (recomendado 36–40 × 20–26)`);
  for (const [k, v] of Object.entries(m.estilo || {})) {
    if (ESTILO[k] && !ESTILO[k].includes(v)) E(`estilo.${k} = "${v}" no existe (${ESTILO[k].join(', ')})`);
    else if (['pared', 'borde', 'acento', 'nucleoColor'].includes(k) && !/^#[0-9a-f]{6}$/i.test(v)) E(`estilo.${k} debe ser #rrggbb`);
    else if (['fondo', 'amb'].includes(k) && !(Array.isArray(v) && v.length === 3)) E(`estilo.${k} debe ser [r,g,b]`);
    else if (!ESTILO[k] && !['pared', 'borde', 'acento', 'nucleoColor', 'fondo', 'amb', 'sala'].includes(k)) A(`estilo.${k} no existe: se ignora`);
  }
  const salas = m.salas || [], pas = m.pasillos || [], obs = m.objetos || [];
  const dentro = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
  const roles = {}; for (const s of salas) { roles[s.rol] = (roles[s.rol] || 0) + 1;
    if (!ROLES.includes(s.rol)) E(`sala "${s.id}": rol "${s.rol}" no existe`);
    if (!SUELOS.includes(s.suelo)) E(`sala "${s.id}": suelo "${s.suelo}" no existe`);
    if (!dentro(s)) E(`sala "${s.id}" se sale del mapa`);
    if (s.rol !== 'decor' && (s.w < 5 || s.h < 5) && !(s.rol === 'mcp' && s.h >= 5)) A(`sala "${s.id}" es muy pequeña (${s.w}x${s.h})`);
    if (s.nombre && s.nombre.length * 7 + 24 > s.w * 32 - 8) A(`el cartel de "${s.id}" ("${s.nombre}") no cabe entero: acórtalo o ensancha la sala`); }
  for (const r of ['principal', 'subagentes']) if (!roles[r]) E(`falta la sala con rol "${r}"`);
  for (const r of ['servidores', 'taller', 'mcp']) if (!roles[r]) A(`no hay sala "${r}" (recomendada)`);
  for (const [r, n] of Object.entries(roles)) if (n > 1 && r !== 'decor') E(`hay ${n} salas con rol "${r}" (solo vale una)`);
  for (let i = 0; i < salas.length; i++) for (let j = i + 1; j < salas.length; j++) { const a = salas[i], b = salas[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h && a.rol !== 'decor' && b.rol !== 'decor') E(`las salas "${a.id}" y "${b.id}" se solapan`); }
  // rejilla como la dibuja el motor
  const g = new Uint8Array(W * H), sala = new Array(W * H), suelo = new Array(W * H), en = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const poner = (r, s, id) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (en(x, y)) { g[y * W + x] = 1; suelo[y * W + x] = s; if (id) sala[y * W + x] = id; } };
  for (const p of pas) { if (!dentro(p)) E(`pasillo ${JSON.stringify(p)} se sale del mapa`); poner(p, 'pasillo'); }
  for (const s of salas) poner(s, s.suelo, s.rol === 'decor' && !s.nombre ? (sala[s.y * W + s.x] || s.id) : s.id);
  const pared = (x, y) => en(x, y) && !g[y * W + x] && [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].some(([dx, dy]) => en(x + dx, y + dy) && g[(y + dy) * W + x + dx]);
  const bloq = new Uint8Array(W * H), ocup = new Map();
  for (const s of salas) if (s.suelo === 'lava') for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) if (en(x, y)) bloq[y * W + x] = 1;
  const nObj = {};
  for (const o of obs) {
    const d = OBJ[o.tipo]; if (!d) { E(`objeto "${o.tipo}" no existe`); continue; }
    nObj[o.tipo] = (nObj[o.tipo] || 0) + 1;
    const [w, h, b, mural] = d, celdas = [];
    for (let y = o.y; y < o.y + h; y++) for (let x = o.x; x < o.x + w; x++) celdas.push([x, y]);
    if (mural) { if (!celdas.every(([x, y]) => pared(x, y)) || !celdas.some(([x, y]) => en(x, y + 1) && g[(y + 1) * W + x])) A(`${o.tipo} en (${o.x},${o.y}) no está en una fila de pared justo encima de suelo`); continue; }
    if (!celdas.every(([x, y]) => en(x, y) && g[y * W + x])) { E(`${o.tipo} en (${o.x},${o.y}) cae fuera del suelo`); continue; }
    for (const [x, y] of celdas) { const k = y * W + x; if (b) { if (ocup.has(k)) E(`${o.tipo} en (${o.x},${o.y}) se monta sobre ${ocup.get(k)}`); ocup.set(k, `${o.tipo}(${o.x},${o.y})`); bloq[k] = 1; } }
    const s = salas.find(s => s.nombre && s.rol !== 'decor' && o.x >= s.x && o.x < s.x + s.w && o.y >= s.y && o.y < s.y + s.h);
    if (s && b && (s.rol === 'mcp' ? o.y + h - 1 === s.y + s.h - 1 : o.y === s.y)) A(`${o.tipo} en (${o.x},${o.y}) tapa el cartel de "${s.id}"`);
  }
  const P = salas.find(s => s.rol === 'principal');
  if (P && !obs.some(o => o.tipo === 'orbe' && o.x >= P.x && o.x < P.x + P.w && o.y >= P.y && o.y < P.y + P.h)) E('la sala principal no tiene "orbe"');
  const M = salas.find(s => s.rol === 'mcp'); if (M && !obs.some(o => o.tipo === 'portal')) A('la sala mcp no tiene "portal"');
  const S = salas.find(s => s.rol === 'servidores'), nServ = obs.filter(o => SERVIDOR.includes(o.tipo)).length;
  if (S && (nServ < 4 || nServ > 8)) A(`la sala de servidores tiene ${nServ} objetos servidor (mejor 4–6)`);
  // ¿se puede ir andando desde la principal a todas las salas esquivando lo que bloquea?
  if (P) {
    const ini = (() => { for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) if (!bloq[y * W + x]) return y * W + x; return -1; })();
    const visto = new Uint8Array(W * H), cola = ini >= 0 ? [ini] : []; if (ini >= 0) visto[ini] = 1;
    while (cola.length) { const i = cola.pop(), x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (en(nx, ny) && g[j] && !bloq[j] && !visto[j]) { visto[j] = 1; cola.push(j); } } }
    for (const s of salas) { if (s.rol === 'decor' && !s.nombre) continue; let ok = false; for (let y = s.y; y < s.y + s.h && !ok; y++) for (let x = s.x; x < s.x + s.w; x++) if (visto[y * W + x]) { ok = true; break; } if (!ok) E(`no se puede llegar andando a "${s.id}" desde la principal (falta pasillo o un objeto tapa la entrada)`); }
    let sueltas = 0; for (let i = 0; i < W * H; i++) if (g[i] && !bloq[i] && !visto[i]) sueltas++; if (sueltas > 3) A(`${sueltas} casillas de suelo quedan aisladas (zonas a las que nadie puede ir)`);
  }
  return { err, av, resumen: { tamaño: `${W}x${H}`, salas: salas.length, pasillos: pas.length, objetos: obs.length, servidores: nServ, tipos: nObj } };
}

if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('uso: node validar.js mundo.json'); process.exit(2); }
  let m; try { m = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('JSON no válido: ' + e.message); process.exit(1); }
  const r = validar(m);
  console.log(`Mundo «${m.nombre}» · ${JSON.stringify(r.resumen)}`);
  for (const e of r.err) console.log('ERROR  ' + e);
  for (const a of r.av) console.log('aviso  ' + a);
  console.log(r.err.length ? `\n${r.err.length} errores: corrígelos antes de aplicar.` : `\nOK: 0 errores${r.av.length ? `, ${r.av.length} avisos` : ''}.`);
  process.exit(r.err.length ? 1 : 0);
}
module.exports = { validar };
