const fs = require('fs');
const path = require('path');
const banco = require('../core/evaluacion');
const args = process.argv.slice(2), valor = k => args[args.indexOf(k) + 1];
(async () => {
  if (args.includes('--listar')) { console.log(JSON.stringify(banco.casos(), null, 2)); return; }
  if (args.includes('--comparar')) { const i = args.indexOf('--comparar'); console.log(JSON.stringify(banco.comparar(JSON.parse(fs.readFileSync(args[i + 1])), JSON.parse(fs.readFileSync(args[i + 2]))), null, 2)); return; }
  let adaptador, nombre, presupuesto = null;
  if (args.includes('--autoprueba')) { adaptador = banco.fixture; nombre = 'fixture (no es APOLO ni OpenClaw)'; }
  else {
    if (!args.includes('--permitir-adaptador') || !args.includes('--adaptador')) throw new Error('se requiere --adaptador archivo.cjs y --permitir-adaptador; puede usar red o consumir APIs');
    if (!args.includes('--modelo') || !args.includes('--version') || !args.includes('--presupuesto')) throw new Error('se requiere --modelo, --version y --presupuesto limites.json');
    presupuesto = require('../core/config-motor').validarCampo('presupuesto', JSON.parse(fs.readFileSync(path.resolve(valor('--presupuesto')), 'utf8')));
    if (!presupuesto.maxTokens || !presupuesto.maxDuracionMs) throw new Error('presupuesto requiere maxTokens y maxDuracionMs');
    const modulo = require(path.resolve(valor('--adaptador'))); adaptador = modulo.ejecutar || modulo; nombre = valor('--adaptador');
  }
  const repeticiones = args.includes('--repeticiones') ? Number(valor('--repeticiones')) : 1;
  if (!Number.isInteger(repeticiones) || repeticiones < 1 || repeticiones > 10) throw new Error('repeticiones debe ser 1..10');
  const r = await banco.ejecutar({ adaptador, nombre, presupuesto, repeticiones, modo: args.includes('--autoprueba') ? 'fixture' : 'adaptador', modelo: args.includes('--modelo') ? valor('--modelo') : null, version: args.includes('--version') ? valor('--version') : null });
  if (args.includes('--salida')) fs.writeFileSync(path.resolve(valor('--salida')), JSON.stringify(r, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ plataforma: r.plataforma, tipo: r.tipo, total: r.total, correctos: r.correctos, tasa: r.tasa, medianaMs: r.medianaMs, p95Ms: r.p95Ms, costoTotal: r.costoTotal }, null, 2));
  if (r.correctos !== r.total) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
