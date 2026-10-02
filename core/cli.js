#!/usr/bin/env node
// Chat de terminal con el núcleo (en proceso, sin daemon).
//   node cli.js [-m proveedor/modelo] [-C carpeta] ["mensaje único"]
//   Comandos: /modelo x/y   /proveedores   /tareas   /memoria   /compactar   /nueva   /salir
//   (las tareas programadas se ejecutan en el daemon / la app, no en el CLI)
const readline = require('readline');
const { crearNucleo } = require('./index');

const argv = process.argv.slice(2);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const modelo = opt('-m'), cwd = opt('-C');
const unico = argv.join(' ').trim();

const n = crearNucleo();
let s = n.sesiones.crear({ modelo, cwd, canal: 'cli' });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = q => new Promise(ok => rl.question(q, ok));
const gris = t => `\x1b[90m${t}\x1b[0m`, amarillo = t => `\x1b[33m${t}\x1b[0m`, rojo = t => `\x1b[31m${t}\x1b[0m`;

n.bus.on('permiso', async req => {
  const r = (await preguntar(amarillo(`\n⚠ ${req.herramienta}: ${req.resumen}${req.peligro ? rojo(`  [PELIGRO: ${req.peligro}]`) : ''}\n  ¿Permitir? [s]í / [a]siempre / [n]o: `))).trim().toLowerCase();
  n.permisos.resolver(req.id, r.startsWith('a') ? 'always' : r.startsWith('s') || r.startsWith('y') ? 'allow' : 'deny');
});

function pintar(e) {
  if (e.tipo === 'texto') console.log(`\n${e.texto}`);
  else if (e.tipo === 'herramienta') console.log(gris(`  ▸ ${e.nombre} ${e.resumen}`));
  else if (e.tipo === 'resultado') console.log(gris(`    ${e.resultado.split('\n').slice(0, 3).join(' ⏎ ').slice(0, 160)}`));
  else if (e.tipo === 'error') console.log(rojo(`✖ ${e.error}`));
  else if (e.tipo === 'compactacion') console.log(gris(`  [conversación resumida: ${e.antes} → ${e.despues} tokens · ${e.recuerdos.length} recuerdos guardados]`));
  else if (e.tipo === 'aviso') console.log(amarillo(`  ${e.texto}`));
  else if (e.tipo === 'fin') console.log(gris(`  [${s.modelo} · ${e.uso.entrada}↑ ${e.uso.salida}↓ tokens]`));
}

async function turno(texto) {
  const c = texto.trim();
  if (c === '/salir') { rl.close(); process.exit(0); }
  if (c === '/proveedores') { n.proveedores.disponibles().forEach(p => console.log(`  ${p.listo ? '●' : '○'} ${p.nombre} (${p.tipo})`)); return; }
  if (c === '/tareas') { const l = n.tareas.lista(); console.log(l.length ? l.map(t => `  ${t.activa ? '●' : '○'} ${t.id} ${t.nombre} · ${n.tareas.describir(t.cuando)}${t.proxima ? ' · ' + new Date(t.proxima).toLocaleString('es') : ''}`).join('\n') : '  (no hay tareas)'); return; }
  if (c === '/memoria') { const l = n.memoria.lista(); console.log(l.length ? l.map(m => `  ${m.id} · ${m.tipo} · ${m.texto}`).join('\n') : '  (memoria vacía)'); return; }
  if (c === '/nueva') { s = n.sesiones.crear({ modelo: s.modelo, cwd: s.cwd, canal: 'cli' }); console.log(gris('  sesión nueva')); return; }
  if (c === '/compactar') {
    try { const r = await n.compactador.compactar(s, { forzar: true }); n.sesiones.guardarMeta(s); console.log(gris(r ? `  resumida: ${r.antes} → ${r.despues} tokens · ${r.recuerdos.length} recuerdos guardados` : '  no hay nada antiguo que resumir')); }
    catch (e) { console.log(gris(`  no se pudo: ${e.message}`)); }
    return;
  }
  if (c.startsWith('/modelo ')) { s.modelo = c.slice(8).trim(); n.sesiones.guardarMeta(s); console.log(gris(`  modelo: ${s.modelo}`)); return; }
  if (!c) return;
  await n.enviar(s, c, pintar).catch(() => { });
}

(async () => {
  if (unico) { await turno(unico); rl.close(); return; }
  console.log(gris(`Robot Companion · ${s.modelo} · ${s.cwd}\n/modelo x/y · /proveedores · /tareas · /memoria · /compactar · /nueva · /salir`));
  for (;;) await turno(await preguntar('\n› '));
})();
