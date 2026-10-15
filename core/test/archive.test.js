// Internet Archive: búsqueda, metadatos, lectura por trozos y búsqueda dentro del libro, Wayback, reintentos y descarga.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearArchive } = require('../archive');

const META = { metadata: { identifier: 'libro1', title: 'Don Quijote', creator: 'Cervantes', date: '1876', mediatype: 'texts' },
  files: [{ name: '__ia_thumb.jpg', source: 'original' }, { name: 'libro1.pdf', source: 'original', format: 'PDF', size: '2000000' }, { name: 'libro1_djvu.txt', source: 'derivative', format: 'DjVuTXT', size: '30000' }] };
const LIBRO = 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme. ' + 'x'.repeat(30_000) + ' Fin con la Mancha otra vez.';

function falso(rutas) {
  const pedidas = [];
  const fetch = async url => {
    pedidas.push(url);
    for (const [patron, r] of rutas) if (patron.test(url)) {
      const v = typeof r === 'function' ? r(url) : r;
      const cuerpo = typeof v.cuerpo === 'string' ? v.cuerpo : JSON.stringify(v.cuerpo);
      return { status: v.status || 200, ok: (v.status || 200) < 400, url: v.url || url, text: async () => cuerpo, arrayBuffer: async () => Buffer.from(cuerpo) };
    }
    return { status: 404, ok: false, url, text: async () => '' };
  };
  return { fetch, pedidas };
}
const sinEspera = async () => {};

test('buscar arma la consulta y lista resultados', async () => {
  const { fetch, pedidas } = falso([[/advancedsearch/, { cuerpo: { response: { numFound: 2, docs: [{ identifier: 'libro1', title: 'Don Quijote', year: 1876, mediatype: 'texts', creator: ['Cervantes'], downloads: 99 }] } } }]]);
  const a = crearArchive({ fetch, espera: sinEspera });
  const r = await a.buscar({ consulta: 'quijote', tipo: 'texts', desde: 1800, hasta: 1900 });
  assert.match(r, /libro1 · texts · Don Quijote \(1876\) — Cervantes · 99 descargas/);
  const q = decodeURIComponent(pedidas[0]).replace(/\+/g, ' ');
  assert.match(q, /quijote AND mediatype:texts AND year:\[1800 TO 1900\]/);
});

test('ver muestra datos y archivos útiles, sin miniaturas', async () => {
  const { fetch } = falso([[/metadata\/libro1/, { cuerpo: META }]]);
  const r = await crearArchive({ fetch, espera: sinEspera }).ver({ id: 'libro1' });
  assert.match(r, /autor: Cervantes/);
  assert.match(r, /libro1\.pdf · PDF · 2\.0 MB/);
  assert.doesNotMatch(r, /__ia_thumb/);
  await assert.rejects(crearArchive({ fetch }).ver({ id: '../etc' }), /id no válido/);
});

test('leer por trozos y buscar dentro del libro (el texto se baja una vez)', async () => {
  const { fetch, pedidas } = falso([[/metadata\/libro1/, { cuerpo: META }], [/download\/libro1\/libro1_djvu\.txt/, { cuerpo: LIBRO }]]);
  const a = crearArchive({ fetch, espera: sinEspera });
  const r1 = await a.leer({ id: 'libro1' });
  assert.match(r1, /caracteres 0–20000 de \d+; sigue con desde=20000/);
  assert.match(r1, /En un lugar de la Mancha/);
  const r2 = await a.leer({ id: 'libro1', desde: 20000 });
  assert.match(r2, /; fin\]/);
  const r3 = await a.leer({ id: 'libro1', buscar: 'mancha' });
  assert.match(r3, /primeras 2/);
  assert.strictEqual(pedidas.filter(u => /download/.test(u)).length, 1);
});

test('reintenta cuando archive.org está caído y al final lo dice claro', async () => {
  let n = 0;
  const { fetch } = falso([[/metadata/, () => (++n < 3 ? { status: 503, cuerpo: '' } : { cuerpo: META })]]);
  assert.match(await crearArchive({ fetch, espera: sinEspera }).HERRAMIENTAS.find(h => h.nombre === 'archive_ver').ejecutar({ id: 'libro1' }), /Don Quijote/);
  const caido = falso([[/metadata/, { cuerpo: '<title>Internet Archive: Temporarily Offline</title>' }]]);
  const r = await crearArchive({ fetch: caido.fetch, espera: sinEspera }).HERRAMIENTAS.find(h => h.nombre === 'archive_ver').ejecutar({ id: 'libro1' });
  assert.match(r, /^error: archive\.org está temporalmente fuera de servicio/);
});

test('wayback: captura más cercana y lista de capturas', async () => {
  const { fetch, pedidas } = falso([
    [/cdx\/search/, { cuerpo: [['urlkey', 'timestamp', 'original'], ['com,x)/', '19990208003341', 'http://x.com/']] }],
    [/web\.archive\.org\/web\/2001id_/, { cuerpo: '<html><title>X</title><script>no</script><p>Hola &amp; adiós</p></html>', url: 'https://web.archive.org/web/20010105123456id_/http://x.com/' }],
  ]);
  const a = crearArchive({ fetch, espera: sinEspera });
  const r = await a.wayback({ url: 'x.com', fecha: '2001' });
  assert.match(r, /Wayback 2001-01-05/);
  assert.match(r, /Hola & adiós/);
  assert.doesNotMatch(r, /no/);
  assert.match(await a.wayback({ url: 'x.com', listar: true }), /1999-02-08 · 19990208003341/);
  assert.match(pedidas.find(u => /cdx/.test(u)), /collapse=timestamp%3A6/);
});

test('guardar baja el texto a la carpeta de APOLO, respeta el límite y puede recordarlo', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { fetch } = falso([[/metadata\/libro1/, { cuerpo: META }], [/download\/libro1\/libro1_djvu\.txt/, { cuerpo: LIBRO }]]);
  const recuerdos = [];
  const ctx = { cfg: { dir }, memoria: { recordar: h => { recuerdos.push(h); return { id: 'm1', accion: 'creado' }; } } };
  const a = crearArchive({ fetch, espera: sinEspera });
  const r = await a.guardar({ id: 'libro1', recordar: true }, ctx);
  assert.match(r, /guardado .*libro1_djvu\.txt.*recuerdo m1/);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'archive', 'libro1', 'libro1_djvu.txt'), 'utf8'), LIBRO);
  assert.match(recuerdos[0].texto, /«Don Quijote» de Cervantes \(1876\) \[libro1\]/);
  assert.match(await a.guardar({ id: 'libro1', archivo: 'libro1.pdf', max_mb: 1 }, ctx), /pesa 2\.0 MB/);
});
