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

test('aprender de los otros agentes: resume lo nuevo de cada sesión, sin Claude Code instalado, y no repite', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'acc2-')), hace = Date.now() - 3600_000;
  const guardados = [], prompts = [];
  let msgs = [{ rol: 'USUARIO', texto: 'Quiero que el bot de Discord avise cuando empiece el stream de los sábados', t: hace }, { rol: 'ASISTENTE', texto: 'Hecho.', t: hace + 1 }];
  const lector = { id: 'codex', nombre: 'Codex', sesiones: async () => [{ clave: 'c1', mtime: hace + (msgs.length > 2 ? 5 : 0), leer: async () => ({ msgs, cwd: 'D:\bot' }) }] };
  const a = crearAprenderCC({
    cfg: { dir: path.join(raiz, 'datos'), aprenderClaude: { dir: path.join(raiz, 'no-existe') } }, lectores: [lector],
    memoria: { recordar: x => guardados.push(x) },
    generarJSON: async ({ prompt, system }) => { prompts.push({ prompt, system }); return { datos: { resumen: 'Avisos del stream.', recuerdos: [{ texto: 'El usuario hace stream los sábados.', tipo: 'hecho' }] } }; },
    modelo: () => 'x/y',
  });
  assert.deepStrictEqual(await a.aprender(), { sesiones: 1, recuerdos: 1, porAgente: { Codex: 1 } });
  assert.match(prompts[0].system, /con Codex/);
  assert.strictEqual(guardados[0].origen, 'codex');
  assert.strictEqual(a.resumenes({ desde: 0 })[0].agente, 'Codex');
  assert.deepStrictEqual(await a.aprender(), { sesiones: 0, recuerdos: 0 }, 'sin cambios no vuelve a leer');
  msgs = [...msgs, { rol: 'USUARIO', texto: 'Y que también avise en Telegram con el enlace del directo', t: hace + 2 }];
  await a.aprender();
  assert.strictEqual(prompts.length, 2);
  assert.ok(prompts[1].prompt.includes('Telegram') && !prompts[1].prompt.includes('sábados'), 'solo manda los mensajes nuevos');
});

test('lectores de conversaciones: Codex, Gemini CLI, Qwen Code y opencode', async () => {
  const { crearLectores } = require('../conversaciones-agentes');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lect-'));
  const escribir = (rel, lineas) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lineas.map(x => JSON.stringify(x)).join('\n')); };
  escribir('.codex/sessions/2026/10/29/rollout-x.jsonl', [
    { type: 'session_meta', payload: { cwd: 'D:\Proyecto' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>ruido</environment_context>' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'arregla el login' }] }, timestamp: '2026-10-29T10:00:00Z' },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Listo' }] } },
    { type: 'response_item', payload: { type: 'function_call' } }]);
  fs.mkdirSync(path.join(home, '.gemini/tmp/proy'), { recursive: true }); fs.writeFileSync(path.join(home, '.gemini/tmp/proy/.project_root'), 'd:\proy');
  escribir('.gemini/tmp/proy/chats/session-1.jsonl', [
    { sessionId: 's' }, { $set: { messages: [{ id: 'a', type: 'user', content: [{ text: '<session_context>x' }] }] } },
    { id: 'b', type: 'user', content: [{ text: 'hazme un juego' }], timestamp: '2026-10-29T10:00:00Z' }, { id: 'c', type: 'gemini', content: 'Vale', timestamp: '2026-10-29T10:00:01Z' }]);
  escribir('.qwen/projects/p/chats/u1.jsonl', [
    { type: 'system', cwd: 'C:\q' }, { type: 'user', provenance: 'real_user', message: { parts: [{ text: 'compílalo' }] } },
    { type: 'assistant', message: { parts: [{ text: 'pienso', thought: true }, { text: 'Compilado' }] } }]);
  escribir('.qwen/projects/p/chats/u1.ledger.jsonl', [{ x: 1 }]);
  const sql = [];
  const oc = { correr: async q => { sql.push(q); return /from session/.test(q) ? 'aviso\n[{"id":"ses_1","directory":"C:/oc","time_updated":5}]'
    : JSON.stringify([{ rol: 'user', texto: 'hola opencode', t: 1 }, { rol: 'assistant', texto: 'parte 1', t: 2 }, { rol: 'assistant', texto: 'parte 2', t: 3 }]); } };
  const [cx, gm, qw, op] = crearLectores({ home, opencode: oc });
  const leer = async l => { const s = await l.sesiones({ desde: 0 }); assert.strictEqual(s.length, 1, l.nombre); return s[0].leer(); };
  const rc = await leer(cx); assert.deepStrictEqual(rc.msgs.map(m => m.rol + ':' + m.texto), ['USUARIO:arregla el login', 'ASISTENTE:Listo']); assert.strictEqual(rc.cwd, 'D:\Proyecto');
  const rg = await leer(gm); assert.deepStrictEqual(rg.msgs.map(m => m.texto), ['hazme un juego', 'Vale']); assert.strictEqual(rg.cwd, 'd:\proy');
  const rq = await leer(qw); assert.deepStrictEqual(rq.msgs.map(m => m.texto), ['compílalo', 'Compilado']);
  const ro = await leer(op); assert.deepStrictEqual(ro.msgs.map(m => m.texto), ['hola opencode', 'parte 1\nparte 2']); assert.strictEqual(ro.cwd, 'C:/oc');
  assert.ok(sql[1].includes("session_id = 'ses_1'"));
});
