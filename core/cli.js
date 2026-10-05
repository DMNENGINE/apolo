#!/usr/bin/env node
// CLI de APOLO.
//   apolo                         interactiva (estilo Claude Code): habla con el núcleo de la app o, si no está abierta, arranca uno en proceso
//   apolo "mensaje"               interactiva y empieza con ese mensaje
//   apolo -p "mensaje"            una respuesta y sale (para scripts; también si la entrada viene por tubería: cat log | apolo -p "resume")
//   -m modelo|alias   -C carpeta   -c (seguir la última de esta carpeta)   -r [id] (retomar)   --local (sin daemon)   --simple (CLI antigua)
'use strict';

const argv = process.argv.slice(2);
const bandera = (...f) => { for (const x of f) { const i = argv.indexOf(x); if (i >= 0) { argv.splice(i, 1); return true; } } return false; };
const valor = (...f) => { for (const x of f) { const i = argv.indexOf(x); if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv.splice(i, 2)[1]; if (i >= 0) { argv.splice(i, 1); return true; } } return undefined; };

if (bandera('-h', '--help', '--ayuda')) {
  console.log(`APOLO · CLI

  apolo [mensaje]              conversación interactiva
  apolo -p "mensaje"           responde y sale (admite entrada por tubería)
  -m, --modelo <x>             modelo o alias (gemma, haiku, ollama/qwen3.6…)
  -C, --carpeta <ruta>         carpeta de trabajo
  -c, --continuar              seguir la última conversación de esta carpeta
  -r, --retomar [id]           retomar una conversación (sin id: elegir)
  --local                      no usar el núcleo de la app (arranca uno en proceso)
  --simple                     la CLI antigua de líneas (gestión de skills/plugins)`);
  process.exit(0);
}
if (bandera('--simple')) { require('./cli-simple'); return; }

const imprimirSolo = bandera('-p', '--print');
const modelo = valor('-m', '--modelo');
const cwd = valor('-C', '--carpeta');
const continuar = bandera('-c', '--continuar');
const retomar = valor('-r', '--retomar');
const local = bandera('--local');
const mensaje = argv.join(' ').trim();
const path = require('path');
const { conectar } = require('./tui/conexion');

const leerEntrada = () => new Promise(ok => { let b = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d => b += d); process.stdin.on('end', () => ok(b)); });

(async () => {
  const con = await conectar({ local });
  const carpeta = cwd ? path.resolve(cwd) : process.cwd();

  if (imprimirSolo || !process.stdin.isTTY || !process.stdout.isTTY) {
    // modo una sola respuesta: el texto final a stdout, lo demás a stderr
    let texto = mensaje;
    if (!process.stdin.isTTY) { const e = (await leerEntrada()).trim(); if (e) texto = texto ? `${texto}\n\n<entrada>\n${e}\n</entrada>` : e; }
    if (!texto) { console.error('apolo -p: falta el mensaje'); process.exit(2); }
    let m = modelo;
    if (m && !m.includes('/')) { try { m = (await con.config()).alias?.[m.toLowerCase()] || m; } catch { } }
    const s = typeof retomar === 'string' ? await con.sesion(retomar) : await con.crearSesion({ modelo: m, cwd: carpeta, titulo: texto.slice(0, 60) });
    const err = t => process.stderr.write(`\x1b[90m${t}\x1b[0m\n`);
    con.bus.on('evento', e => {
      if (e.tipo !== 'permiso' || e.sesion !== s.id) return;
      if (con.modo === 'daemon') err(`⚠ ${e.herramienta}: ${e.resumen} → esperando permiso en la isla, el móvil o el Stream Deck…`);
      else { err(`✗ ${e.herramienta}: denegado (sin la app nadie puede aprobarlo; ábrela o usa la CLI interactiva)`); con.resolver(e.id, 'deny').catch(() => { }); }
    });
    let final = '', fallo = '';
    await con.enviar(s.id, texto, e => {
      if (e.tipo === 'herramienta') err(`● ${e.nombre}(${String(e.resumen || '').split('\n')[0].slice(0, 120)})`);
      else if (e.tipo === 'fin') final = e.texto || final;
      else if (e.tipo === 'texto') final = e.texto;
      else if (e.tipo === 'error') fallo = e.error;
    });
    if (final) process.stdout.write(final.trimEnd() + '\n');
    if (fallo) { process.stderr.write(`error: ${fallo}\n`); process.exitCode = 1; }
    con.cerrar(); setTimeout(() => process.exit(process.exitCode || 0), 50);
    return;
  }

  const { iniciarTUI } = require('./tui/app');
  await iniciarTUI(con, { modelo, cwd: carpeta, continuar, sesion: typeof retomar === 'string' ? retomar : undefined, retomarElegir: retomar === true, mensaje });
})().catch(e => { process.stderr.write(`apolo: ${e.message}\n`); process.exit(1); });
