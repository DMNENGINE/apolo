// Memorias de los agentes de programación: detecta Claude Code / Codex / Gemini / OpenClaw / un agente desconocido (~/.deepseek),
// tapa claves, no relee lo que no cambió, reintenta si el modelo falla y avisa la primera vez. Modelo falso, home falso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearMemoriasAgentes } = require('../memorias-agentes');

function escribir(raiz, rel, texto) { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texto); return f; }

function preparar() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'magentes-')), home = path.join(raiz, 'home'), datos = path.join(raiz, 'datos');
  escribir(home, '.claude/projects/D--Proyecto/memory/user_perfil.md', 'Se llama Alex y tiene un taller de camiones. Clave: sk-abcdefghijklmnopqrstuvwx');
  escribir(home, '.claude/CLAUDE.md', 'Responde siempre en español.');
  escribir(home, '.claude/projects/D--Proyecto/abc.jsonl', '{"no":"es memoria"}');
  escribir(home, '.codex/AGENTS.md', 'El usuario usa Windows 11.');
  escribir(home, '.openclaw/workspace/USER.md', 'Alex prefiere respuestas cortas.');
  escribir(home, '.deepseek/memory/notas.md', 'Alex está aprendiendo Rust.');
  escribir(home, '.npm/MEMORY.md', 'no es un agente');
  fs.mkdirSync(datos, { recursive: true });
  return { home, datos };
}

test('memorias de agentes: detecta, absorbe, tapa claves, no relee y avisa', async () => {
  const { home, datos } = preparar();
  const prompts = [], guardados = [], avisos = [];
  const m = crearMemoriasAgentes({
    cfg: { dir: datos }, home, modelo: () => 'x/y',
    memoria: { recordar: x => { guardados.push(x); return { accion: 'creada' }; } },
    bus: { emit: (ev, d) => avisos.push([ev, d]), on() { } },
    generarJSON: async ({ prompt }) => { prompts.push(prompt); return { datos: { hechos: [{ texto: 'Se llama Alex', tipo: 'perfil' }], identidad: '' } }; },
  });
  const ids = m.detectar().map(a => a.id).sort();
  assert.deepStrictEqual(ids, ['claude-code', 'codex', 'deepseek', 'openclaw']);
  const cc = m.detectar().find(a => a.id === 'claude-code');
  assert.strictEqual(cc.archivos.length, 2, 'CLAUDE.md + memory/*.md, no los .jsonl');

  const r = await m.leer();
  assert.strictEqual(r.leidos, 5);
  assert.strictEqual(prompts.length, 4, 'un trozo por agente');
  assert.ok(prompts.every(p => !p.includes('sk-abcdef')), 'la clave se tapa antes de mandarla');
  assert.ok(prompts.some(p => p.includes('Rust')), 'el agente desconocido (~/.deepseek) también se lee');
  assert.ok(guardados.every(g => /^memoria de /.test(g.origen)));
  assert.strictEqual(avisos.filter(([e]) => e === 'aviso-externo').length, 1, 'avisa la primera vez');

  const r2 = await m.leer();
  assert.strictEqual(r2.leidos, 0, 'lo que no cambió no se vuelve a mandar');
  assert.strictEqual(prompts.length, 4);

  escribir(home, '.codex/AGENTS.md', 'El usuario usa Windows 11 y Linux.');
  const r3 = await m.leer();
  assert.strictEqual(r3.leidos, 1, 'solo el archivo cambiado');
});

test('memorias de agentes: si el modelo falla no marca el archivo y lo reintenta', async () => {
  const { home, datos } = preparar();
  let falla = true, llamadas = 0;
  const m = crearMemoriasAgentes({
    cfg: { dir: datos, memoriasAgentes: { ignorar: ['codex', 'openclaw', 'deepseek'] } }, home, modelo: () => 'x/y',
    memoria: { recordar: () => ({ accion: 'creada' }) }, bus: { emit() { }, on() { } },
    generarJSON: async () => { llamadas++; if (falla) throw new Error('ollama no responde'); return { datos: { hechos: [], identidad: '' } }; },
  });
  const r = await m.leer();
  assert.strictEqual(r.leidos, 0);
  assert.match(r.errores[0], /ollama no responde/);
  falla = false;
  const r2 = await m.leer();
  assert.strictEqual(r2.leidos, 2, 'se reintenta en la siguiente vuelta');
  assert.strictEqual(llamadas, 2);
  const g = await m.http('GET', []);
  assert.ok(g.agentes.every(a => a.id === 'claude-code'), 'ignorar quita agentes');
  assert.ok(g.agentes[0].archivos.every(x => x.leido));
});
