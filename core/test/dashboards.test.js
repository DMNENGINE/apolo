// Dashboards generados por el agente: JSONPath, normalizar/adaptar, fuentes con fetch/comando/modelo falsos, permiso de 'comando', caché y API.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../dashboards');

function nucleo(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-dash-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m', proveedores: { falso: { tipo: 'openai', baseUrl: 'http://127.0.0.1:9/v1', local: true } }, memoria: { embeddings: null }, permisos: { modo: 'preguntar' } }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, sinPlugins: true, ...extra });
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  return n;
}
const respuesta = (cuerpo, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });

test('JSONPath simple', () => {
  const o = { current: { temperature_2m: 21.4 }, items: [{ title: 'a', n: 1 }, { title: 'b', n: 2 }], 'raro key': { x: 5 } };
  assert.strictEqual(D.jsonPath(o, '$.current.temperature_2m'), 21.4);
  assert.strictEqual(D.jsonPath(o, 'items[1].title'), 'b');
  assert.strictEqual(D.jsonPath(o, 'items[-1].n'), 2);
  assert.deepStrictEqual(D.jsonPath(o, '$.items[*].title'), ['a', 'b']);
  assert.deepStrictEqual(D.jsonPath(o, 'items.n'), [1, 2]);
  assert.strictEqual(D.jsonPath(o, "$['raro key'].x"), 5);
  assert.strictEqual(D.jsonPath(o, 'no.existe'), undefined);
  assert.strictEqual(D.jsonPath(o, ''), o);
});

test('normalizar y adaptar a cada tipo', () => {
  assert.deepStrictEqual(D.normalizar('42'), { forma: 'numero', valor: 42 });
  assert.strictEqual(D.normalizar([1, 2, 3]).forma, 'serie');
  assert.strictEqual(D.normalizar({ a: 1, b: 2 }).forma, 'categorias');
  assert.strictEqual(D.normalizar('- uno\n- dos').forma, 'lista');
  const prs = D.normalizar([{ title: 'Arreglo X', html_url: 'https://github.com/a/b/pull/1', comments: 3 }, { title: 'Y', html_url: 'https://github.com/a/b/pull/2', comments: 0 }]);
  const l = D.adaptar(prs, 'lista');
  assert.strictEqual(l.forma, 'lista'); assert.strictEqual(l.items[0].texto, 'Arreglo X'); assert.match(l.items[0].url, /pull\/1/);
  assert.strictEqual(D.adaptar(prs, 'kpi').valor, 2);
  const k = D.adaptar({ forma: 'serie', x: ['a', 'b', 'c'], series: [{ nombre: '', valores: [1, 5, 9] }] }, 'kpi');
  assert.strictEqual(k.valor, 9); assert.strictEqual(k.anterior, 5);
  assert.strictEqual(D.adaptar({ forma: 'numero', valor: 63 }, 'progreso', { max: 200 }).max, 200);
  assert.strictEqual(D.adaptar({ forma: 'categorias', items: [{ etiqueta: 'x', valor: 1 }] }, 'tabla').filas[0][0], 'x');
  assert.strictEqual(D.adaptar({ forma: 'serie', x: ['1'], series: [{ valores: [3] }] }, 'mapa-calor').forma, 'calendario');
});

test('comandos: solo lectura', () => {
  assert.strictEqual(D.comandoSoloLectura('Get-Process | Measure-Object'), '');
  assert.strictEqual(D.comandoSoloLectura('git status --short'), '');
  assert.match(D.comandoSoloLectura('Remove-Item C:\\x'), /solo lectura/);
  assert.match(D.comandoSoloLectura('dir > salida.txt'), /redirecciones/);
  assert.match(D.comandoSoloLectura('git push'), /git solo/);
  assert.match(D.comandoSoloLectura('powershell -c "rm x"'), /envoltorio|peligroso/);
  assert.match(D.comandoSoloLectura('ls; rm -rf /'), /.+/);
});

test('crear con métricas del núcleo, http y caché por widget', async t => {
  let llamadas = 0;
  const n = nucleo(t, { fetchDashboards: async url => { llamadas++; assert.match(url, /open-meteo/); return respuesta({ current: { temperature_2m: 18.6 } }); } });
  const d = await n.dashboards.crear({ titulo: 'Mi panel', widgets: [
    { tipo: 'kpi', titulo: 'Tokens', fuente: 'nucleo:uso.tokens' },
    { tipo: 'barras', titulo: 'Modelos', fuente: 'nucleo:uso.modelos' },
    { tipo: 'mapa-calor', titulo: 'Actividad', fuente: 'nucleo:actividad' },
    { tipo: 'kpi', titulo: 'Madrid', fuente: 'http:https://api.open-meteo.com/v1/forecast?latitude=40.4&longitude=-3.7&current=temperature_2m', opciones: { ruta: '$.current.temperature_2m', unidad: '°C' } },
  ] }, { quien: 'usuario' });
  assert.strictEqual(d.id, 'mi-panel');
  assert.ok(d.widgets.every(w => w.pos && w.pos.x + w.pos.w <= 12), 'colocados en la rejilla');
  const r = await n.dashboards.datos(d.id);
  const madrid = d.widgets[3].id;
  assert.strictEqual(r.widgets[madrid].datos.valor, 18.6);
  assert.strictEqual(r.widgets[d.widgets[0].id].datos.forma, 'numero');
  assert.strictEqual(r.widgets[d.widgets[2].id].datos.forma, 'matriz');
  const r2 = await n.dashboards.datos(d.id);
  assert.strictEqual(llamadas, 1, 'la segunda vez sale de la caché');
  assert.ok(r2.widgets[madrid].cache);
  await assert.rejects(n.dashboards.crear({ titulo: 'x', widgets: [{ tipo: 'kpi', titulo: 'a', fuente: 'nucleo:inventada' }] }), /desconocida/);
  await assert.rejects(n.dashboards.crear({ titulo: 'x', widgets: [{ tipo: 'pastel', titulo: 'a', fuente: 'nucleo:memoria' }] }), /tipo/);
});

test('comando: permiso explícito al crear, firma y ejecución', async t => {
  const ejecutados = [];
  const n = nucleo(t, { comandoDashboards: async cmd => { ejecutados.push(cmd); return '{"libres": 12}'; } });
  const w = { tipo: 'kpi', titulo: 'Libres', fuente: 'comando:Get-Thing', opciones: { ruta: 'libres' } };
  // desde el panel sin confirmar → rechazado
  await assert.rejects(n.dashboards.crear({ titulo: 'C', widgets: [w] }, { quien: 'usuario' }), /confirmación/);
  // el agente: pide permiso (siempre pregunta, aunque el modo sea auto)
  n.cfg.permisos.modo = 'auto';
  const s = n.sesiones.crear({ modelo: 'falso/m', canal: 'test' });
  const pedidos = [];
  n.bus.on('permiso', p => { pedidos.push(p); n.permisos.resolver(p.id, 'allow'); });
  const d = await n.dashboards.crear({ titulo: 'C', widgets: [w] }, { sesion: s, quien: 'agente' });
  assert.strictEqual(pedidos.length, 1); assert.match(pedidos[0].resumen, /Get-Thing/);
  const r = await n.dashboards.datos(d.id);
  assert.strictEqual(r.widgets[d.widgets[0].id].datos.valor, 12);
  assert.deepStrictEqual(ejecutados, ['Get-Thing']);
  // cambiar el comando a mano en el archivo (sin permiso) → no se ejecuta
  const f = path.join(n.cfg.dir, 'dashboards', `${d.id}.json`), j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.widgets[0].fuente = 'comando:Get-Otra'; fs.writeFileSync(f, JSON.stringify(j));
  const r2 = await n.dashboards.datos(d.id, { forzar: true });
  assert.match(r2.widgets[d.widgets[0].id].error, /permiso/); assert.strictEqual(ejecutados.length, 1);
  // denegado → no se crea
  n.bus.removeAllListeners('permiso'); n.bus.on('permiso', p => n.permisos.resolver(p.id, 'deny'));
  await assert.rejects(n.dashboards.crear({ titulo: 'D', widgets: [{ ...w, fuente: 'comando:Get-Date' }] }, { sesion: s }), /DENEGADO/);
  await assert.rejects(n.dashboards.crear({ titulo: 'E', widgets: [{ ...w, fuente: 'comando:Remove-Item x' }] }, { sesion: s }), /solo lectura/);
});

test('agente: modelo barato, refresco mínimo 15 min y herramientas crear/editar/ver', async t => {
  const n = nucleo(t);
  let llamadas = 0;
  n.generarJSON = async ({ modelo, schema }) => { llamadas++; assert.ok(modelo); return schema.required[0] === 'items' ? { items: ['uno', 'dos'] } : { texto: 'Resumen corto.' }; };
  const s = n.sesiones.crear({ modelo: 'falso/m', canal: 'test' });
  const H = Object.fromEntries(D.HERRAMIENTAS.map(h => [h.nombre, h]));
  const ctx = { cfg: n.cfg, sesion: s };
  const out = await H.crear_dashboard.ejecutar({ titulo: 'Resumen', fijar: true, widgets: [{ tipo: 'texto', titulo: 'Hoy', fuente: 'agente:resume mi día', refrescoSeg: 60 }] }, ctx);
  assert.match(out, /dashboard creado: resumen/);
  const d = n.dashboards.obtener('resumen');
  assert.strictEqual(d.widgets[0].refrescoSeg, 900, 'mínimo 15 min');
  assert.ok(d.fijado);
  const r = await n.dashboards.datos('resumen'); assert.strictEqual(r.widgets[d.widgets[0].id].datos.texto, 'Resumen corto.');
  await n.dashboards.datos('resumen', { forzar: true }); assert.strictEqual(llamadas, 1, 'forzar no vuelve a gastar antes de 60 s');
  const e = await H.editar_dashboard.ejecutar({ id: 'resumen', añadir: [{ tipo: 'lista', titulo: 'Ideas', fuente: 'agente:3 ideas', opciones: { usar: [d.widgets[0].id] } }] }, ctx);
  assert.match(e, /Ideas/);
  const v = await H.ver_dashboards.ejecutar({ id: 'resumen', datos: true }, ctx);
  assert.match(v, /uno/);
  // API HTTP
  const lista = await n.dashboards.http('GET', ['v1', 'dashboards'], {}, {});
  assert.strictEqual(lista.dashboards.length, 1); assert.ok(lista.metricas['uso.tokens']);
  const p = await n.dashboards.http('PATCH', ['v1', 'dashboards', 'resumen'], { widgets: lista.dashboards[0].widgets.map(w => ({ ...w, pos: { ...w.pos, x: 6, w: 6 } })) }, {});
  assert.ok(p.widgets.every(w => w.pos.x === 6));
  assert.deepStrictEqual(await n.dashboards.http('DELETE', ['v1', 'dashboards', 'resumen'], {}, {}), { ok: true });
});
