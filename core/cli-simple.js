#!/usr/bin/env node
// Chat de terminal con el núcleo (en proceso, sin daemon).
//   node cli-simple.js (o: apolo --simple) [-m proveedor/modelo] [-C carpeta] ["mensaje único"]
//   Comandos: /modelo x/y   /proveedores   /tareas   /memoria   /skills   /skill add <fuente> | on|off|rm|scan|update <slug>   /compactar   /nueva   /salir
//             /plugins   /plugin add <fuente> [--dev] | on|off <nombre> [--forzar] | rm|reload|scan <nombre>   /<comando de un plugin> [texto]
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
  if (c === '/skills') {
    const l = n.skills.lista(), col = { verde: '\x1b[32m', amarillo: '\x1b[33m', rojo: '\x1b[31m' };
    console.log(l.length ? l.map(x => `  ${x.activa ? '●' : '○'} ${x.slug}${x.externa ? gris(' [externa]') : ''} ${col[x.escaneo?.nivel] || ''}${x.escaneo?.nivel || 'sin escanear'}\x1b[0m · ${x.usos} usos · ${gris(x.descripcion.slice(0, 90))}`).join('\n') : '  (no hay skills)');
    return;
  }
  if (/^\/skill\s+(add|on|off|rm|scan|update)\b/.test(c)) {           // /skill add <fuente> · on|off|rm|scan|update <slug>
    const [, op, arg = ''] = c.match(/^\/skill\s+(\w+)\s*(.*)$/);
    try {
      if (op === 'add') {
        const r = await n.skills.instalar(arg.trim());
        if (r.opciones) console.log(`  la fuente trae ${r.opciones.length} skills; usa una de estas:\n` + r.opciones.map(o => `   /skill add ${o.fuente}`).join('\n'));
        else console.log(`  instalada ${r.skill.slug} (DESACTIVADA) · escaneo ${r.skill.escaneo?.nivel}: ${r.skill.escaneo?.resumen || ''}\n  actívala con /skill on ${r.skill.slug}`);
      } else if (op === 'on' || op === 'off') {
        const forzar = / --forzar$/.test(arg), slug = arg.replace(/ --forzar$/, '').trim();
        const x = await n.skills.activar(slug, op === 'on', { forzar });
        console.log(gris(`  ${x.slug}: ${x.activa ? 'activa' : 'desactivada'}`));
      } else if (op === 'rm') console.log(gris(n.skills.borrar(arg.trim()) ? '  borrada' : '  no existe'));
      else if (op === 'scan') { const r = await n.skills.escanear(arg.trim()); console.log(`  ${r.nivel}: ${r.resumen}\n${r.explicacion || ''}`); }
      else if (op === 'update') {
        const r = await n.skills.actualizar(arg.trim());
        if (r.alDia) console.log(gris('  ya está al día'));
        else if ((await preguntar(`${r.diff}\n  ¿Aplicar la actualización? [s/n]: `)).trim().toLowerCase().startsWith('s')) {
          const a = await n.skills.actualizar(arg.trim(), { aplicar: true }); console.log(gris(`  actualizada · escaneo ${a.escaneo?.nivel}`));
        }
      }
    } catch (e) { console.log(rojo(`  ${e.message}${e.status === 409 ? ' (añade --forzar)' : ''}`)); }
    return;
  }
  if (c === '/plugins') {
    const l = n.plugins.lista(), col = { verde: '\x1b[32m', amarillo: '\x1b[33m', rojo: '\x1b[31m' };
    console.log(l.length ? l.map(x => `  ${x.activo ? '●' : '○'} ${x.nombre} ${x.version}${x.dev ? gris(' [dev]') : ''} · ${x.roto ? rojo('ROTO') : x.estado} · ${col[x.escaneo?.nivel] || ''}${x.escaneo?.nivel || 'sin escanear'}\x1b[0m · ${gris((x.permisos.join(', ') || 'sin permisos') + ' · ' + x.descripcion.slice(0, 70))}`).join('\n') : '  (no hay plugins)');
    const cm = n.plugins.comandos(); if (cm.length) console.log(gris('  comandos: ' + cm.map(x => '/' + x.nombre).join(' ')));
    return;
  }
  if (/^\/plugin\s+(add|on|off|rm|reload|scan)\b/.test(c)) {         // /plugin add <fuente> [--dev] · on|off <nombre> [--forzar] · rm|reload|scan <nombre>
    const [, op, resto = ''] = c.match(/^\/plugin\s+(\w+)\s*(.*)$/);
    const forzar = /\s--forzar\b/.test(' ' + resto), dev = /\s--dev\b/.test(' ' + resto), arg = resto.replace(/\s*--(forzar|dev)\b/g, '').trim();
    try {
      if (op === 'add') {
        const r = await n.plugins.instalar(arg, { dev });
        if (r.opciones) console.log(`  la fuente trae ${r.opciones.length} plugins; elige con #nombre:\n` + r.opciones.map(o => `   /plugin add ${arg}#${o.nombre}`).join('\n'));
        else console.log(`  instalado ${r.plugin.nombre} ${r.plugin.version} (DESACTIVADO) · escaneo ${r.plugin.escaneo?.nivel}: ${r.plugin.escaneo?.resumen || ''}\n  permisos: ${r.plugin.permisos.join(', ') || 'ninguno'}\n  actívalo con /plugin on ${r.plugin.nombre}`);
      } else if (op === 'on' || op === 'off') { const x = await n.plugins.activar(arg, op === 'on', { forzar }); console.log(gris(`  ${x.nombre}: ${x.activo ? 'activo' : 'desactivado'}${x.registrados.herramientas.length ? ' · herramientas ' + x.registrados.herramientas.join(', ') : ''}`)); }
      else if (op === 'rm') { await n.plugins.borrar(arg); console.log(gris('  borrado')); }
      else if (op === 'reload') { const x = await n.plugins.recargar(arg); console.log(gris(`  ${x.nombre} recargado (${x.estado})`)); }
      else if (op === 'scan') { const r = await n.plugins.escanear(arg); console.log(`  ${r.nivel}: ${r.resumen}\n${r.explicacion || ''}`); }
    } catch (e) { console.log(rojo(`  ${e.message}${e.status === 409 && /ROJO/.test(e.message) ? ' (añade --forzar)' : ''}`)); }
    return;
  }
  const cmdPlugin = c.match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  if (cmdPlugin && n.plugins.comandos().some(x => x.nombre === cmdPlugin[1])) {
    try { console.log(await n.plugins.comando(cmdPlugin[1], cmdPlugin[2] || '', { canal: 'cli' })); } catch (e) { console.log(rojo(`  ${e.message}`)); }
    return;
  }
  if (c.startsWith('/modelo ')) { s.modelo = c.slice(8).trim(); n.sesiones.guardarMeta(s); console.log(gris(`  modelo: ${s.modelo}`)); return; }
  if (!c) return;
  await n.enviar(s, c, pintar).catch(() => { });
}

(async () => {
  if (unico) { await turno(unico); rl.close(); return; }
  console.log(gris(`Robot Companion · ${s.modelo} · ${s.cwd}\n/modelo x/y · /proveedores · /tareas · /memoria · /skills · /skill add|on|off|rm|scan|update · /plugins · /plugin add|on|off|rm|reload · /compactar · /nueva · /salir`));
  for (;;) await turno(await preguntar('\n› '));
})();
