#!/usr/bin/env node
// Publica una skill en la Biblioteca DMN (repo DMNENGINE/apolo-skills) SIN filtrar nada privado.
//   node tools/publicar-skill.js <carpeta-skill> --repo D:\apolo-skills [--categoria creatividad] [--clave ~/.dmnengine/DMNENGINE.clave] [--forzar]
// Pasos: copia limpia (sin _datos, instalado.json, cachés) → LIMPIADOR (IPs privadas, rutas de usuario, correos, tokens y
// las palabras de ~/.dmnengine/privado.txt) → escáner de APOLO (verde) → plan de preparación válido → firma ed25519 → índice.
// Si el limpiador o el escáner encuentran algo, NO publica (salvo --forzar, y nunca con tokens). El commit/push se hace aparte.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerSkill, listarArchivos } = require('../core/skills/formato');
const { analizarEstatico } = require('../core/skills/escaner');
const { validar, leerPlan } = require('../core/skills/preparar');
const { firmar, verificar, AUTORES_OFICIALES } = require('../core/skills/firmar');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const origen = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : '';
const repo = path.resolve(arg('repo', 'D:/apolo-skills'));
const clave = arg('clave', path.join(os.homedir(), '.dmnengine', 'DMNENGINE.clave'));
const forzar = process.argv.includes('--forzar');
if (!origen || !fs.existsSync(path.join(origen, 'SKILL.md'))) { console.error('uso: node tools/publicar-skill.js <carpeta-skill> --repo <repo apolo-skills> [--categoria x] [--forzar]'); process.exit(2); }

const FUERA = /(^|\/)(_datos|_versiones|node_modules|__pycache__|\.git|\.venv|venv)(\/|$)|(^|\/)(instalado\.json|aprendizaje\.jsonl|FIRMA\.json|\.env.*|.*\.(pyc|log|part))$/i;
const TEXTO = /\.(md|txt|json|ya?ml|toml|ini|py|js|mjs|cjs|ts|ps1|sh|bat|cmd|html?|css|csv)$/i;

// ---------- limpiador ----------
const privadas = (() => { try { return fs.readFileSync(path.join(os.homedir(), '.dmnengine', 'privado.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')); } catch { return []; } })();
const REGLAS = [
  [/\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g, 'IP de tu red'],
  [/[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b|Default\b|<)[^\\/\s"'`]+/gi, 'ruta con tu usuario de Windows'],
  [/\/home\/(?!user\b)[a-z0-9_-]+/gi, 'ruta con un usuario de Linux'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, 'correo'],
  [/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_\w{30,}|xox[abprs]-[\w-]{10,}|AIza[\w-]{30,}|hf_[A-Za-z0-9]{30,}|[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27,})\b/g, 'TOKEN'],
  [/\b(?:ssh|scp)\s+(?!usuario@|user@)[\w.-]+@[\w.-]+/g, 'acceso ssh'],
];
function limpiar(dir) {
  const hallazgos = [];
  for (const rel of listarArchivos(dir, 5000)) {
    if (!TEXTO.test(rel)) continue;
    const lineas = fs.readFileSync(path.join(dir, rel), 'utf8').split(/\r?\n/);
    lineas.forEach((l, i) => {
      for (const [re, tipo] of REGLAS) for (const m of l.matchAll(re)) if (!/noreply@|@example\.|@anthropic\.com/i.test(m[0])) hallazgos.push({ rel, n: i + 1, tipo, txt: m[0] });
      for (const p of privadas) if (l.toLowerCase().includes(p.toLowerCase())) hallazgos.push({ rel, n: i + 1, tipo: 'palabra privada', txt: p });
    });
  }
  return hallazgos;
}

// ---------- copia limpia ----------
const s = leerSkill(origen);
const destino = path.join(repo, 'skills', s.slug);
if (path.resolve(destino) !== origen) {
  fs.rmSync(destino, { recursive: true, force: true });
  for (const rel of listarArchivos(origen, 5000)) {
    if (FUERA.test(rel.replace(/\\/g, '/'))) continue;
    fs.mkdirSync(path.dirname(path.join(destino, rel)), { recursive: true });
    fs.copyFileSync(path.join(origen, rel), path.join(destino, rel));
  }
} else fs.rmSync(path.join(destino, 'FIRMA.json'), { force: true });

let malo = false;
const h = limpiar(destino);
if (h.length) {
  console.log(`\n✖ LIMPIADOR: ${h.length} cosas privadas en ${s.slug}:`);
  for (const x of h.slice(0, 40)) console.log(`  ${x.rel}:${x.n}  [${x.tipo}]  ${x.tipo === 'TOKEN' ? x.txt.slice(0, 6) + '…' : x.txt}`);
  if (!forzar || h.some(x => x.tipo === 'TOKEN')) malo = true;
} else console.log('✔ limpiador: nada privado');

const esc = analizarEstatico(destino);
console.log(`${esc.nivel === 'verde' ? '✔' : '✖'} escáner: ${esc.nivel} · ${esc.resumen}`);
for (const x of esc.hallazgos.filter(x => x.gravedad !== 'baja').slice(0, 20)) console.log(`  ${x.gravedad} ${x.regla} ${x.archivo}:${x.linea} ${x.texto.slice(0, 100)}`);
if (esc.nivel === 'rojo' || (esc.nivel === 'amarillo' && !forzar)) malo = true;

const plan = leerPlan(destino);
let requisitos = {};
if (plan) {
  const v = validar(plan);
  if (v.errores.length) { console.log('✖ preparar.json:', v.errores.join('; ')); malo = true; } else console.log(`✔ preparar.json válido${v.avisos.length ? ` (${v.avisos.length} avisos)` : ''}`);
  const r = plan.requisitos || {}, bytes = (plan.pasos || []).reduce((n, p) => n + (p.bytes || 0), 0);
  requisitos = { ...(r.gpu?.vramGB ? { vramGB: r.gpu.vramGB } : {}), ...(r.ramGB ? { ramGB: r.ramGB } : {}), ...(r.discoGB ? { discoGB: r.discoGB } : {}), ...(bytes ? { descargaGB: Math.round(bytes / 1024 ** 3 * 10) / 10 } : {}) };
}
if (malo) { console.log(`\nNO se publica ${s.slug}. Arregla lo de arriba (o --forzar si es un falso positivo; nunca con tokens).`); process.exit(1); }

// ---------- firma + índice ----------
firmar(destino, clave, { autor: 'DMNENGINE' });
const f = verificar(destino, AUTORES_OFICIALES);
if (f.estado !== 'verificada') { console.log('✖ la firma no verifica:', f.motivo || f.estado); process.exit(1); }
console.log('✔ firmada por DMNENGINE');

const fIdx = path.join(repo, 'indice.json');
const idx = fs.existsSync(fIdx) ? JSON.parse(fs.readFileSync(fIdx, 'utf8')) : { formato: 'apolo-marketplace/1', nombre: 'Biblioteca DMN', entradas: [] };
const nueva = {
  nombre: s.slug, tipo: 'skill', descripcion: s.descripcion, fuente: `DMNENGINE/apolo-skills/skills/${s.slug}`, autor: 'DMNENGINE',
  version: s.apolo.version || '1.0.0', licencia: s.licencia || 'MIT', categoria: arg('categoria', (idx.entradas.find(e => e.nombre === s.slug) || {}).categoria || 'general'),
  etiquetas: ['oficial'], ...(plan && (plan.pasos || []).length ? { preparacion: true } : {}), ...(plan ? { requisitos } : {}),
  ...(plan?.requisitos?.externos?.length ? { necesita: plan.requisitos.externos.map(x => x.nombre) } : {}), web: `https://github.com/DMNENGINE/apolo-skills/tree/main/skills/${s.slug}`,
};
idx.entradas = [...idx.entradas.filter(e => e.nombre !== s.slug), nueva].sort((a, b) => a.nombre.localeCompare(b.nombre));
idx.actualizado = new Date().toISOString().slice(0, 10);
fs.writeFileSync(fIdx, JSON.stringify(idx, null, 2) + '\n');
console.log(`✔ índice: ${idx.entradas.length} skills · ${s.slug} v${nueva.version}\n\nListo para commit en ${repo}`);
