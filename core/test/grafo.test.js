// Grafo (heurística + extracción del modelo + explorar_grafo), línea de tiempo y privacidad (zip + borrar con doble confirmación) por la API.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { crearMemoria } = require('../memoria');
const { crearGrafo, HERRAMIENTA } = require('../grafo');
const { crearZip, crc32 } = require('../privacidad');

// nombres del directorio central de un zip
function nombresZip(z) {
  const fin = z.length - 22, n = z.readUInt16LE(fin + 10); let o = z.readUInt32LE(fin + 16); const l = [];
  for (let i = 0; i < n; i++) { const ln = z.readUInt16LE(o + 28), ex = z.readUInt16LE(o + 30), cm = z.readUInt16LE(o + 32); l.push(z.slice(o + 46, o + 46 + ln).toString()); o += 46 + ln + ex + cm; }
  return l;
}
const nuevo = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafo-')); const memoria = crearMemoria({ cfg: { dir } }); return { dir, memoria, grafo: crearGrafo({ cfg: { dir }, memoria }) }; };

test('heurística: nombres propios, herramientas conocidas, el usuario en el centro y poda al olvidar', () => {
  const { memoria, grafo } = nuevo();
  memoria.recordar({ texto: 'Tiene un taller de camiones llamado Power Truck Services en Miami', tipo: 'perfil' });
  const t = memoria.recordar({ texto: 'Su amigo Carlos tiene un Peterbilt 389 naranja llamado El Trueno', tipo: 'persona' });
  memoria.recordar({ texto: 'El Trueno lleva motor CAT', tipo: 'hecho' });
  memoria.recordar({ texto: 'La Raspberry Pi 5 corre el bot de Discord y usa Blender por MCP', tipo: 'hecho' });
  const d = grafo.datos();
  const n = Object.fromEntries(d.nodos.map(x => [x.nombre, x.tipo]));
  assert.strictEqual(n['Tú'], 'persona');
  assert.strictEqual(n['Carlos'], 'persona');
  assert.strictEqual(n['Miami'], 'lugar');
  assert.strictEqual(n['Raspberry Pi 5'], 'herramienta');
  assert.strictEqual(n['Discord'], 'herramienta');
  assert.ok(!('Raspberry' in n) && !('Trueno' in n), JSON.stringify(n));           // sin duplicados ("El Trueno" al empezar frase = la misma entidad)
  const tr = grafo.explorar('trueno');
  assert.strictEqual(tr.entidad.nombre, 'El Trueno');
  assert.strictEqual(tr.recuerdos.length, 2);
  assert.ok(['Carlos', 'CAT', 'Peterbilt 389'].every(x => tr.vecinos.some(v => v.nombre === x)));
  assert.ok(grafo.explorar('Power Truck Services').vecinos.some(v => v.id === 'usuario'));
  memoria.olvidar(t.id);
  assert.strictEqual(grafo.explorar('Carlos'), null);                              // sin recuerdos, la entidad se va
  assert.strictEqual(grafo.explorar('El Trueno').recuerdos.length, 1);
});

test('incorporar (modelo) afina tipos y relaciones; herramienta explorar_grafo', async () => {
  const { memoria, grafo } = nuevo();
  const a = memoria.recordar({ texto: 'Está construyendo un robot humanoide con MuJoCo', tipo: 'proyecto' });
  const b = memoria.recordar({ texto: 'Entrena al robot a caminar con Stable-Baselines3', tipo: 'hecho' });
  assert.ok(grafo.pendientesLLM().length === 2);
  const r = grafo.incorporar({
    entidades: [{ nombre: 'Robot humanoide', tipo: 'proyecto', recuerdos: [a.id, b.id] }, { nombre: 'Stable-Baselines3', tipo: 'herramienta', recuerdos: [b.id] }, { nombre: 'MuJoCo', tipo: 'herramienta', recuerdos: [a.id] }],
    relaciones: [{ de: 'usuario', a: 'Robot humanoide', tipo: 'construye' }, { de: 'Robot humanoide', a: 'MuJoCo', tipo: 'se simula en' }, { de: 'Fantasma', a: 'MuJoCo', tipo: 'x' }],
  }, [a.id, b.id]);
  assert.ok(r.nuevas === 1 && r.relaciones === 2, JSON.stringify(r));        // MuJoCo y Stable-Baselines3 ya los vio la heurística
  assert.strictEqual(grafo.pendientesLLM().length, 0);
  const out = await HERRAMIENTA.ejecutar({ entidad: 'robot humanoide' }, { memoria: Object.assign(memoria, { grafo }) });
  assert.match(out, /Robot humanoide \(proyecto\)/);
  assert.match(out, /MuJoCo \(herramienta\) · se simula en/);
  assert.match(out, /Tú \(persona\) · construye/);
  assert.match(out, /Stable-Baselines3/);
  assert.match(await HERRAMIENTA.ejecutar({ entidad: 'zzz' }, { memoria }), /No hay ninguna entidad/);
});

test('zip propio: CRC y deflate correctos', () => {
  const z = crearZip([{ nombre: 'a.txt', datos: 'hola '.repeat(200) }, { nombre: 'dir/b.json', datos: '{"x":1}' }]);
  assert.strictEqual(z.readUInt32LE(0), 0x04034b50);
  const n = z.readUInt16LE(26), comp = z.readUInt32LE(18);
  assert.strictEqual(z.slice(30, 30 + n).toString(), 'a.txt');
  assert.strictEqual(z.readUInt16LE(8), 8);
  const datos = zlib.inflateRawSync(z.slice(30 + n, 30 + n + comp)).toString();
  assert.strictEqual(datos, 'hola '.repeat(200));
  assert.strictEqual(z.readUInt32LE(14), crc32(Buffer.from(datos)));
  assert.strictEqual(z.readUInt32LE(z.length - 22), 0x06054b50);
  assert.strictEqual(z.readUInt16LE(z.length - 12), 2);
});

test('API: /v1/grafo, /v1/linea, /v1/privacidad (exportar zip y borrar con doble confirmación)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f4api-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'x/y', memoria: { embeddings: null }, proveedores: { x: { tipo: 'openai', baseUrl: 'http://127.0.0.1:9/v1', local: true } } }));
  fs.writeFileSync(path.join(dir, 'config.json.secreto'), 'no');
  const { iniciar } = require('../daemon');
  const { nucleo: n, servidor, puerto, token } = await iniciar({ dir, puerto: 0, sinTareas: true, sinPlugins: true });
  t.after(() => { servidor.closeAllConnections?.(); servidor.close(); });
  const api = async (m, ruta, cuerpo) => { const r = await fetch(`http://127.0.0.1:${puerto}/v1${ruta}`, { method: m, headers: { 'x-robot-token': token, 'content-type': 'application/json' }, body: cuerpo && JSON.stringify(cuerpo) }); return { r, j: (r.headers.get('content-type') || '').includes('json') ? await r.json() : null }; };
  n.memoria.recordar({ texto: 'Su amigo Carlos vive en Miami', tipo: 'persona' });
  const s = n.sesiones.crear({ modelo: 'x/y', titulo: 'Plan del taller' });
  n.sesiones.agregar(s, { role: 'user', content: 'Hazme el presupuesto del Peterbilt', t: Date.now() - 5000 });
  n.sesiones.agregar(s, { role: 'assistant', content: 'Listo, aquí está.', t: Date.now() - 1000 });
  fs.appendFileSync(path.join(dir, 'tareas_historial.jsonl'), JSON.stringify({ t: Date.now() - 3600_000, fin: Date.now() - 3500_000, id: 't1', nombre: 'Revisar correo', tipo: 'agente', ok: true, resultado: 'NADA' }) + '\n');

  const g = await api('GET', '/grafo');
  assert.ok(g.j.nodos.some(x => x.nombre === 'Carlos'));
  assert.strictEqual((await api('GET', '/grafo/carlos')).j.entidad.tipo, 'persona');
  assert.strictEqual((await api('GET', '/grafo/nadie')).r.status, 404);

  const l = (await api('GET', '/linea')).j;
  assert.deepStrictEqual(Object.keys(l.cuenta).sort(), ['recuerdo', 'sesion', 'tarea']);
  const q = (await api('GET', '/linea?q=peterbilt')).j;
  assert.strictEqual(q.eventos.length, 1);
  assert.strictEqual(q.eventos[0].tipo, 'sesion');
  assert.match(q.eventos[0].detalle, /Peterbilt/);
  assert.strictEqual((await api('GET', `/linea?tipos=tarea&desde=${Date.now() - 7200_000}`)).j.eventos[0].titulo, 'Revisar correo');
  assert.strictEqual((await api('GET', `/linea?desde=${Date.now() + 1000}`)).j.eventos.length, 0);

  // exportar: zip descargable sin config ni token
  const ex = await fetch(`http://127.0.0.1:${puerto}/v1/privacidad/exportar`, { method: 'POST', headers: { 'x-robot-token': token } });
  assert.strictEqual(ex.headers.get('content-type'), 'application/zip');
  assert.match(ex.headers.get('content-disposition'), /attachment; filename="apolo-datos-/);
  const nombres = nombresZip(Buffer.from(await ex.arrayBuffer()));
  for (const x of ['LEEME.txt', 'memoria.json', 'grafo.json', `sesiones/${s.id}.jsonl`, 'tareas_historial.jsonl', 'personalidad/identidad.md']) assert.ok(nombres.includes(x), x + ' en ' + nombres);
  assert.ok(!nombres.some(x => /config\.json|^token$|conectores/.test(x)), nombres.join(','));

  // borrar: paso 1 da código; con código malo o sin la frase no borra; con todo bien, sí
  const p1 = (await api('POST', '/privacidad/borrar', {})).j;
  assert.strictEqual(p1.paso, 1); assert.strictEqual(p1.seBorra.recuerdos, 1); assert.strictEqual(p1.seBorra.sesiones, 1);
  assert.strictEqual((await api('POST', '/privacidad/borrar', { codigo: 'XXXXXX', frase: 'BORRAR TODO' })).r.status, 403);
  assert.strictEqual((await api('POST', '/privacidad/borrar', { codigo: p1.codigo, frase: 'borrar' })).r.status, 400);
  assert.strictEqual(n.memoria.lista().length, 1);
  const p2 = (await api('POST', '/privacidad/borrar', { codigo: p1.codigo, frase: 'borrar todo' })).j;
  assert.ok(p2.ok);
  assert.strictEqual(n.memoria.lista().length, 0);
  assert.strictEqual(n.sesiones.lista().length, 0);
  assert.strictEqual((await api('GET', '/grafo')).j.nodos.length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'config.json')) && fs.existsSync(path.join(dir, 'token')));
  assert.strictEqual((await api('POST', '/privacidad/borrar', { codigo: p1.codigo, frase: 'BORRAR TODO' })).r.status, 409);   // el código no sirve dos veces
});
