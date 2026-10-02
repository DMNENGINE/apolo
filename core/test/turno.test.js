// Turno de noche: cola, worktree git en rama aparte (sin tocar la del usuario), permisos para la mañana, informe, vídeo HTML y entrega.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { enVentana } = require('../turno');

const git = (cwd, ...a) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=prueba', '-c', 'user.email=p@x', ...a], { cwd, encoding: 'utf8', windowsHide: true }).trim();
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// modelo falso: en un encargo escribe NOTAS.md y luego informa; si se le pide el informe matutino devuelve el JSON
async function entorno(t) {
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      const j = JSON.parse(b);
      const sys = j.messages.find(m => m.role === 'system')?.content || '';
      let msg;
      if (/INFORME MATUTINO/.test(sys)) msg = { role: 'assistant', content: JSON.stringify({ titular: 'Noche productiva', hecho: ['Notas escritas en el repo'], pendiente: ['La carpeta suelta necesita permiso'], necesitoQueDecidas: [], guion: 'Buenos días, esto hice.', escenas: [{ titulo: 'Notas listas', texto: 'Escribí NOTAS.md' }] }) };
      else {
        const tool = j.messages.filter(m => m.role === 'tool').at(-1);
        msg = tool ? { role: 'assistant', content: `INFORME: HECHO ${tool.content.slice(0, 60)}` }
          : { role: 'assistant', content: null, tool_calls: [{ id: 'w1', type: 'function', function: { name: 'escribir_archivo', arguments: JSON.stringify({ ruta: 'NOTAS.md', contenido: 'hola desde el turno\n' }) } }] };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => { srv.closeAllConnections?.(); srv.close(); });
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'turno-'));
  const dir = path.join(raiz, 'nucleo'); fs.mkdirSync(dir);
  const ahora = new Date(Date.now() - 2 * 60_000);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, local: true } },
    memoria: { embeddings: null }, turno: { informe: hhmm(ahora), desde: '01:00', hasta: '07:00' },
  }));
  // regla "siempre" existente: escribir dentro de la carpeta de datos (donde viven los worktrees)
  fs.writeFileSync(path.join(dir, 'reglas.json'), JSON.stringify([{ herramienta: 'escribir_archivo', prefijo: path.resolve(dir) }]));
  // repo git del "usuario" con un commit en main
  const repo = path.join(raiz, 'proyecto'); fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(repo, 'README.md'), '# proyecto\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'inicio');
  const suelta = path.join(raiz, 'suelta'); fs.mkdirSync(suelta);
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, sinPlugins: true, video: { grabar: false } });
  t.after(() => n.turno.detener());
  return { n, dir, repo, suelta };
}

test('ventana horaria (también cruzando la medianoche)', () => {
  const d = (h, m) => { const x = new Date(); x.setHours(h, m, 0, 0); return x; };
  assert.ok(enVentana('01:00', '07:00', d(3, 0)));
  assert.ok(!enVentana('01:00', '07:00', d(7, 0)));
  assert.ok(enVentana('23:00', '06:00', d(23, 30)) && enVentana('23:00', '06:00', d(2, 0)));
  assert.ok(!enVentana('23:00', '06:00', d(12, 0)));
});

test('turno: worktree en rama aparte, permiso para la mañana, informe, vídeo HTML y aviso', async t => {
  const { n, dir, repo, suelta } = await entorno(t);
  const avisos = [], fases = [];
  n.bus.on('aviso-externo', a => avisos.push(a));
  n.bus.on('evento', e => { if (e.tipo === 'turno-noche') fases.push(e.fase); });
  let pidioPermiso = 0; n.bus.on('permiso', () => pidioPermiso++);   // el turno NO despierta a nadie
  const e1 = n.turno.agregar({ texto: 'Escribe unas notas del proyecto', cwd: repo });
  const e2 = n.turno.agregar({ texto: 'Escribe notas en la carpeta suelta', cwd: suelta });
  assert.deepStrictEqual(n.turno.ordenar([e2.id, e1.id]), [e2.id, e1.id]);
  n.turno.ordenar([e1.id]);                                              // vuelve a primero
  const r = n.turno.empezar();
  assert.ok(r.ok);
  assert.strictEqual(n.turno.empezar().ok, false);                      // ya está en marcha
  const inf = await r.promesa;
  assert.strictEqual(pidioPermiso, 0);
  const est = n.turno.estado();
  const a = est.cola.find(e => e.id === e1.id), b = est.cola.find(e => e.id === e2.id);
  // encargo 1: hecho en un worktree, rama con un commit, la rama del usuario intacta y el worktree quitado
  assert.strictEqual(a.estado, 'hecho');
  assert.match(a.rama, /^apolo\/turno-\d{8}-escribe-unas-notas-del-proyecto$/);
  assert.strictEqual(a.commits, 1);
  assert.deepStrictEqual(a.archivos, ['NOTAS.md']);
  assert.strictEqual(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.ok(!fs.existsSync(path.join(repo, 'NOTAS.md')));
  assert.strictEqual(git(repo, 'status', '--porcelain'), '');
  assert.strictEqual(git(repo, 'show', `${a.rama}:NOTAS.md`), 'hola desde el turno');
  assert.match(git(repo, 'log', '-1', '--format=%an|%s', a.rama), /^APOLO \(turno de noche\)\|APOLO turno de noche: Escribe unas notas/);
  assert.strictEqual(git(repo, 'worktree', 'list').split('\n').length, 1);
  // encargo 2: sin regla → el permiso queda para la mañana (espera), sin pedírselo a nadie
  assert.strictEqual(b.estado, 'espera');
  assert.strictEqual(b.permisos.length, 1);
  assert.strictEqual(b.permisos[0].herramienta, 'escribir_archivo');
  assert.ok(!fs.existsSync(path.join(suelta, 'NOTAS.md')));
  // informe: lo del modelo + lo que hay que decidir sale solo (permiso y rama)
  assert.strictEqual(inf.titular, 'Noche productiva');
  assert.ok(inf.necesitoQueDecidas.some(x => /Permiso pendiente/.test(x)));
  assert.ok(inf.necesitoQueDecidas.some(x => x.includes(a.rama)));
  assert.strictEqual(inf.video.estado, 'solo-html');
  const html = fs.readFileSync(path.join(dir, 'turno', 'informes', inf.id, 'video.html'), 'utf8');
  assert.match(html, /Noche productiva/); assert.match(html, /Notas listas/); assert.match(html, /startsWith\('http'\)/);
  // entregado (la hora del informe ya pasó) por el canal de avisos
  assert.ok(inf.entregado);
  assert.strictEqual(avisos.length, 1);
  assert.match(avisos[0].texto, /Turno de noche[\s\S]*Noche productiva/);
  assert.ok(fases.includes('inicio') && fases.includes('informe') && fases.includes('fin'));
  // API: lista de informes y archivo del vídeo
  const api = await n.extensiones.turno.http('GET', ['v1', 'turno'], {});
  assert.strictEqual(api.informes[0].id, inf.id);
  assert.match((await n.extensiones.turno.http('GET', ['v1', 'turno', 'informes', inf.id, 'archivo', 'video.html'])).__archivo, /video\.html$/);
  await assert.rejects(n.extensiones.turno.http('GET', ['v1', 'turno', 'informes', inf.id, 'archivo', '..%2Fx']), /no encontrado/);

  // por la mañana: reintentar aprobando → ahora sí escribe (solo para ese encargo)
  n.turno.reintentar(e2.id, { aprobar: true });
  const r2 = n.turno.empezar();
  await r2.promesa;
  assert.strictEqual(n.turno.estado().cola.find(e => e.id === e2.id).estado, 'hecho');
  assert.strictEqual(fs.readFileSync(path.join(suelta, 'NOTAS.md'), 'utf8'), 'hola desde el turno\n');
  assert.strictEqual(n.permisos.reglas().length, 1);                  // no se creó ninguna regla "siempre" nueva
});

test('turno: herramientas, borrar y validación', async t => {
  const { n, suelta } = await entorno(t);
  const H = require('../herramientas').porNombre;
  const txt = await H.turno_agregar.ejecutar({ texto: 'revisa los logs' }, { turno: n.turno, cwd: suelta });
  assert.match(txt, /Encargo añadido/);
  assert.match(await H.turno_ver.ejecutar({}, { turno: n.turno }), /\[pendiente\] revisa los logs/);
  const id = n.turno.estado().cola[0].id;
  assert.ok(n.turno.borrar(id));
  assert.match(await H.turno_empezar.ejecutar({}, { turno: n.turno }), /No empezó: no hay encargos/);
  assert.throws(() => n.turno.agregar({ texto: '' }), /falta el texto/);
  assert.throws(() => n.turno.configurar({ desde: '25h' }), /HH:MM/);
  assert.strictEqual(n.turno.configurar({ paralelo: 9 }).paralelo, 4);
});
