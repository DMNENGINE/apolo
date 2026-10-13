const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearAprenderCC } = require('../aprender-cc');

const linea = (o) => JSON.stringify(o) + '\n';

test('aprender de Claude Code: resume, guarda recuerdos, tapa secretos y no relee lo ya aprendido', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-')), cc = path.join(raiz, 'projects', 'D--Proyecto'), datos = path.join(raiz, 'datos');
  fs.mkdirSync(cc, { recursive: true });
  const f = path.join(cc, 'abc.jsonl'), hace = Date.now() - 3600_000;
  fs.writeFileSync(f,
    linea({ type: 'user', cwd: 'D:\\Proyecto', timestamp: new Date(hace).toISOString(), message: { content: 'Haz el modo llamada en la isla. Mi clave es sk-abcdefghijklmnopqrstuvwx <system-reminder>ruido</system-reminder>' } }) +
    linea({ type: 'user', isMeta: true, message: { content: 'meta que no cuenta' } }) +
    linea({ type: 'user', message: { content: [{ type: 'tool_result', content: 'salida de herramienta' }] } }) +
    linea({ type: 'assistant', timestamp: new Date(hace + 60_000).toISOString(), message: { content: [{ type: 'text', text: 'Hecho: botón del teléfono.' }, { type: 'tool_use', name: 'Edit' }] } }));
  const past = new Date(Date.now() - 3600_000); fs.utimesSync(f, past, past);
  const guardados = [], prompts = [];
  const a = crearAprenderCC({
    cfg: { dir: datos, aprenderClaude: { dir: path.join(raiz, 'projects') } },
    memoria: { recordar: x => guardados.push(x) },
    generarJSON: async ({ prompt }) => { prompts.push(prompt); return { datos: { resumen: 'Hicieron el modo llamada.', recuerdos: [{ texto: 'El usuario quiere hablar con APOLO como en una llamada.', tipo: 'preferencia' }, { texto: 'token: abcdefghijk', tipo: 'hecho' }] } }; },
    modelo: () => 'x/y',
  });
  const r = await a.aprender();
  assert.deepStrictEqual(r, { sesiones: 1, recuerdos: 1 });
  assert.ok(!prompts[0].includes('sk-abcdef') && prompts[0].includes('[secreto]'), 'la clave se tapa antes de mandarla');
  assert.ok(!/ruido|meta que no cuenta|salida de herramienta/.test(prompts[0]));
  assert.ok(prompts[0].includes('CLAUDE: Hecho: botón del teléfono.'));
  assert.strictEqual(guardados[0].origen, 'claude-code');
  const res = a.resumenes({ desde: Date.now() - 86400_000 });
  assert.strictEqual(res.length, 1); assert.strictEqual(res[0].proyecto, 'D:\\Proyecto');
  // segunda pasada sin cambios: no vuelve a leer nada
  assert.deepStrictEqual(await a.aprender(), { sesiones: 0, recuerdos: 0 });
  assert.strictEqual(prompts.length, 1);
});
