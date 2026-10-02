// FASE 3 · manos de verdad, todo con manos y ojos FALSOS (no se mueve ni se captura nada de verdad):
// mirar → actuar → comprobar, registro de capturas + time-lapse, rejilla (set-of-marks) y macros por demostración.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { agrupar } = require('../escritorio/demo');
const { fusionar } = require('../escritorio/comprobar');

const escanerFalso = { async escanear() { return { nivel: 'verde', hallazgos: [], resumen: 'limpia', explicacion: '' }; } };
const MON = [{ n: 1, x: 100, y: 0, ancho: 2560, alto: 1440, primario: true }];

function entorno(t, { config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-m3-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, escritorio: { comprobar: { activo: true, ms: 0 } }, ...config }));
  const ordenes = [];
  // estado del "escritorio" falso: lo que devuelven info (manos) y la captura (ojos)
  const pc = { ventana: { titulo: 'Sin título - Bloc de notas', proceso: 'notepad' }, foco: { tipo: 'Document', nombre: 'Texto', password: false }, rejilla: false,
    elementos: [{ tipo: 'Button', nombre: 'Guardar', x: 300, y: 100, ancho: 40, alto: 20 }, { tipo: 'Edit', nombre: 'Buscar', valor: '', x: 500, y: 100, ancho: 100, alto: 20 }] };
  const manos = async o => { ordenes.push(o); if (!['info', 'armar', 'desarmar', 'grabar', 'parar'].includes(o.op) && pc.tras) { pc.tras(); pc.tras = null; } return o.op === 'info' ? { ok: true, ventana: pc.ventana, foco: pc.foco, enPunto: null, cursor: [0, 0] } : { ok: true }; };
  const ojos = async a => {
    if (!a.sinImagen) fs.writeFileSync(a.salida, 'jpg falso');
    const imagen = a.sinImagen ? null : { ruta: a.salida, ancho: 1280, alto: 720 };
    if (imagen && pc.rejilla && a.rejillaSiMenos > 0) { const r = a.salida.replace(/\.jpg$/, '.rejilla.jpg'); fs.writeFileSync(r, 'rejilla'); imagen.rejilla = { ruta: r, cols: 16, filas: 9 }; }
    return { monitores: MON, monitor: 1, escala: 2, ventana: pc.ventana, imagen, elementos: pc.elementos.map((e, i) => ({ id: i + 1, ...e })) };
  };
  const video = { buscarNavegador: () => 'edge-falso', hayFfmpeg: async () => true,
    grabar: async ({ dir: d, segundos }) => { fs.writeFileSync(path.join(d, 'video.mp4'), 'mp4'); return { segundos: Math.round(segundos), frames: 30 }; } };
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, manos, ojos, videoCapturas: video, escaner: escanerFalso, embedder: null, sinPlugins: true });
  const s = n.sesiones.crear({ cwd: dir });
  t.after(() => n.control.soltarTodo('fin del test'));
  return { n, s, dir, pc, ordenes, acciones: () => ordenes.filter(o => !['info', 'armar', 'desarmar', 'grabar', 'parar'].includes(o.op)) };
}
const textoDe = r => (typeof r === 'string' ? r : r.texto);

test('comprobar: tras cada acción dice qué cambió (ventana, elementos nuevos, valores) con #id estables', async t => {
  const { n, s, pc } = entorno(t);
  const v = await n.control.ver(s, {});
  assert.match(v.texto, /#1 Button "Guardar"/);
  await n.control.tomar(s, { motivo: 'guardar el documento' });
  // el clic abre el diálogo "Guardar como": cambia la ventana y aparece un botón nuevo
  pc.tras = () => { pc.ventana = { titulo: 'Guardar como', proceso: 'notepad' }; pc.elementos = [...pc.elementos, { tipo: 'Button', nombre: 'Cancelar', x: 700, y: 400, ancho: 60, alto: 20 }]; };
  const r = await n.control.accion(s, 'clic', { elemento: 1 });
  assert.strictEqual(typeof r, 'string');                                    // hubo cambios → sin imagen (diff barato)
  assert.match(r, /clic en "Guardar"/);
  assert.match(r, /COMPROBACIÓN/);
  assert.match(r, /ventana: "Sin título - Bloc de notas" → "Guardar como"/);
  assert.match(r, /NUEVOS \(1\): #3 Button "Cancelar"/);
  assert.doesNotMatch(r, /NO cambió/);
  // escribir cambia el valor de un campo → CAMBIARON
  pc.tras = () => { pc.elementos = pc.elementos.map(e => (e.nombre === 'Buscar' ? { ...e, valor: 'informe' } : e)); };
  const r2 = await n.control.accion(s, 'escribir', { texto: 'informe', elemento: 2 });
  assert.match(r2, /CAMBIARON: Edit "Buscar" = "informe" \(antes ""\)/);
  // el #3 nuevo sigue valiendo para la siguiente acción (ids estables)
  const r3 = await n.control.accion(s, 'clic', { elemento: 3 });
  // nada cambió → aviso claro + captura adjunta
  assert.strictEqual(typeof r3, 'object');
  assert.match(r3.texto, /⚠ COMPROBACIÓN.*NO cambió nada/);
  assert.strictEqual(r3.imagenes.length, 1);
  // ver:true adjunta la captura aunque haya cambios
  pc.tras = () => { pc.ventana = { titulo: 'Bloc de notas', proceso: 'notepad' }; };
  const r4 = await n.control.accion(s, 'tecla', { combo: 'esc', ver: true });
  assert.strictEqual(r4.imagenes.length, 1);
});

test('registro de capturas por sesión: NNN.jpg + acciones.jsonl, API y time-lapse vertical', async t => {
  const { n, s, pc } = entorno(t);
  await n.control.ver(s, {});
  await n.control.tomar(s, { motivo: 'x' });
  pc.tras = () => { pc.ventana = { titulo: 'Otra', proceso: 'notepad' }; };
  await n.control.accion(s, 'clic', { elemento: 1 });
  await n.control.accion(s, 'tecla', { combo: 'ctrl+s' });
  const d = n.capturas.dirDe(s.id);
  assert.deepStrictEqual(fs.readdirSync(d).filter(f => f.endsWith('.jpg')).sort(), ['001.jpg', '002.jpg', '003.jpg']);
  const es = n.capturas.entradas(s.id);
  assert.deepStrictEqual(es.map(e => e.tipo), ['ver', 'accion', 'accion']);
  assert.match(es[1].accion, /clic en "Guardar"/);
  assert.match(es[1].cambio, /ventana → Otra/);
  assert.strictEqual(es[2].nada, true);
  // API /v1/capturas
  const http = n.extensiones.capturas.http;
  const l = await http('GET', ['v1', 'capturas'], {});
  assert.strictEqual(l.sesiones[0].sesion, s.id);
  assert.strictEqual(l.sesiones[0].acciones, 2);
  assert.strictEqual((await http('GET', ['v1', 'capturas', s.id, '002.jpg'], {})).__archivo, path.join(d, '002.jpg'));
  await assert.rejects(http('GET', ['v1', 'capturas', s.id, '..%2Fconfig.json'], {}), /archivo/);
  const v = await http('POST', ['v1', 'capturas', s.id, 'video'], {});
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.url, `/v1/capturas/${s.id}/video.mp4`);
  const html = fs.readFileSync(path.join(d, 'video.html'), 'utf8');
  assert.match(html, /width:1080px;height:1920px/);
  assert.match(html, /APOLO/);                                            // marca de agua
  assert.match(html, /003\.jpg/);
  assert.strictEqual((await http('GET', ['v1', 'capturas', s.id, 'video.mp4'], {})).nombre.endsWith('.mp4'), true);
});

test('ventanas protegidas: tras la acción no se mira ni se guarda la captura', async t => {
  const { n, s, pc } = entorno(t);
  await n.control.ver(s, {});
  await n.control.tomar(s, { motivo: 'x' });
  pc.tras = () => { pc.ventana = { titulo: 'PayPal - Iniciar sesión', proceso: 'chrome' }; };
  const r = await n.control.accion(s, 'clic', { elemento: 1 });
  assert.match(r, /PROTEGIDA/);
  const d = n.capturas.dirDe(s.id);
  assert.deepStrictEqual(fs.readdirSync(d).filter(f => f.endsWith('.jpg')), ['001.jpg']);   // solo la de antes
  assert.strictEqual(n.capturas.entradas(s.id).at(-1).imagen, null);
});

test('visión sin accesibilidad: rejilla numerada y clic por celda → coordenadas de pantalla', async t => {
  const { n, s, pc, acciones } = entorno(t);
  pc.rejilla = true; pc.elementos = [];
  const v = await n.control.ver(s, {});
  assert.match(v.texto, /REJILLA numerada de 16×9/);
  assert.match(v.imagenes[0].ruta, /\.rejilla\.jpg$/);                       // al modelo le llega la de la rejilla
  await n.control.tomar(s, { motivo: 'jugar' });
  const r = await n.control.accion(s, 'clic', { celda: 18 });
  assert.match(textoDe(r), /clic en la celda 18/);
  const c = acciones()[0];
  // celda 18 = columna 2, fila 2 → centro (120,120) px de imagen 1280x720 · escala 2 · origen del monitor (100,0)
  assert.deepStrictEqual([c.x, c.y], [340, 240]);
  await assert.rejects(n.control.accion(s, 'clic', { celda: 999 }), /entre 1 y 144/);
});

test('fusionar: los elementos que siguen conservan su #, los nuevos reciben números nuevos', () => {
  const antes = [{ id: 1, tipo: 'Button', nombre: 'A', x: 0, y: 0, ancho: 10, alto: 10 }, { id: 2, tipo: 'Button', nombre: 'B', x: 50, y: 0, ancho: 10, alto: 10 }];
  const ahora = [{ tipo: 'Button', nombre: 'B', x: 60, y: 5, ancho: 10, alto: 10 }, { tipo: 'Button', nombre: 'C', x: 0, y: 0, ancho: 10, alto: 10 }];
  const d = fusionar(antes, ahora);
  assert.deepStrictEqual(d.elementos.map(e => `${e.nombre}#${e.id}`), ['B#2', 'C#3']);
  assert.deepStrictEqual(d.fuera.map(e => e.nombre), ['A']);
});

test('agrupar demostración: ventanas, clics por elemento, texto agrupado, contraseñas NUNCA, panel recortado', () => {
  const N = { titulo: 'Sin título - Bloc de notas', proceso: 'notepad' }, P = { titulo: 'APOLO · Panel', proceso: 'msedge' };
  const campo = { tipo: 'Edit', nombre: 'Usuario' }, clave = { tipo: 'Edit', nombre: 'Contraseña', password: true };
  const ev = [
    { tipo: 'clic', ventana: P, elemento: { tipo: 'Button', nombre: 'Grabar' }, x: 1, y: 1, t: 1 },
    { tipo: 'clic', ventana: N, elemento: { tipo: 'MenuItem', nombre: 'Archivo' }, x: 10, y: 10, t: 1000 },
    { tipo: 'clic', ventana: N, elemento: { tipo: 'MenuItem', nombre: 'Archivo' }, x: 11, y: 10, t: 1200 },   // doble clic
    { tipo: 'tecla', ventana: N, foco: campo, texto: 'h', t: 2000 }, { tipo: 'tecla', ventana: N, foco: campo, texto: 'o', t: 2010 },
    { tipo: 'tecla', ventana: N, foco: campo, texto: 'x', t: 2020 }, { tipo: 'tecla', ventana: N, foco: campo, combo: 'backspace', t: 2030 },
    { tipo: 'tecla', ventana: N, foco: campo, texto: 'la', t: 2040 },
    { tipo: 'tecla', ventana: N, foco: clave, secreto: true, t: 3000 }, { tipo: 'tecla', ventana: N, foco: clave, texto: 'NO-DEBE-SALIR', t: 3010 },
    { tipo: 'tecla', ventana: N, foco: campo, combo: 'ctrl+s', t: 4000 },
    { tipo: 'tecla', ventana: { titulo: 'Mi banco online', proceso: 'chrome' }, foco: campo, texto: '1234', t: 4500 },
    { tipo: 'clic', ventana: P, elemento: { tipo: 'Button', nombre: 'Parar' }, x: 1, y: 1, t: 5000 },
  ];
  const p = agrupar(ev, { cfg: {} });
  assert.deepStrictEqual(p.map(x => x.tipo), ['ventana', 'clic', 'escribir', 'escribir', 'tecla', 'ventana', 'protegida']);
  assert.strictEqual(p[1].doble, true);
  assert.strictEqual(p[2].texto, 'hola');
  assert.strictEqual(p[3].secreto, true);
  assert.ok(!JSON.stringify(p).includes('NO-DEBE-SALIR'));
  assert.ok(!JSON.stringify(p).includes('1234'));
  assert.ok(!JSON.stringify(p).includes('Grabar') && !JSON.stringify(p).includes('Parar'));
});

test('grabar demostración: confirmación explícita, sin control a la vez, y al parar → skill BORRADOR desactivada', async t => {
  const { n, ordenes } = entorno(t);
  n.generarJSON = async () => ({ datos: { nombre: 'Guardar nota', descripcion: 'Guarda la nota del Bloc de notas con un título. Úsala cuando pidan guardar notas.', disparadores: ['guarda la nota'] } });
  await assert.rejects(n.extensiones.demo.http('POST', ['v1', 'demo', 'grabar'], {}), /confirma/);
  const e = await n.extensiones.demo.http('POST', ['v1', 'demo', 'grabar'], { confirmo: true, nombre: 'nota' });
  assert.strictEqual(e.grabando, true);
  assert.ok(ordenes.some(o => o.op === 'grabar'));
  const otra = n.sesiones.crear({ cwd: os.tmpdir() });
  await assert.rejects(n.control.tomar(otra, { motivo: 'y' }), /grabando una demostración/);
  const N = { titulo: 'Sin título - Bloc de notas', proceso: 'notepad' };
  n.control._evento({ evento: 'demo', tipo: 'clic', ventana: N, elemento: { tipo: 'Document', nombre: 'Texto' }, x: 5, y: 5, t: 1 });
  for (const c of 'hola') n.control._evento({ evento: 'demo', tipo: 'tecla', ventana: N, foco: { tipo: 'Document', nombre: 'Texto' }, texto: c, t: 2 });
  n.control._evento({ evento: 'demo', tipo: 'tecla', ventana: N, foco: { tipo: 'Edit', nombre: 'Clave', password: true }, secreto: true, t: 3 });
  n.control._evento({ evento: 'demo', tipo: 'tecla', ventana: N, foco: { tipo: 'Document', nombre: 'Texto' }, combo: 'ctrl+s', t: 4 });
  const r = await n.extensiones.demo.http('POST', ['v1', 'demo', 'parar'], {});
  assert.ok(ordenes.some(o => o.op === 'parar'));
  assert.strictEqual(r.pasos.length, 5);
  assert.ok(r.skill?.slug);
  const sk = n.skills.almacen.obtener(r.skill.slug);
  assert.strictEqual(sk.activa, false);                                       // borrador: el usuario la revisa y activa
  const md = fs.readFileSync(path.join(sk.dir, 'SKILL.md'), 'utf8');
  assert.match(md, /Document «Texto»/);
  assert.match(md, /Escribe "hola"/);
  assert.match(md, /CONTRASEÑA\/secreto/);
  assert.match(md, /Pulsa `ctrl\+s`/);
  assert.match(md, /por su NOMBRE/);
  assert.strictEqual((await n.extensiones.demo.http('GET', ['v1', 'demo'], {})).grabando, false);
  // ya no graba → el control vuelve a estar disponible
  await n.control.tomar(otra, { motivo: 'y' });
});

test('grabar_demostracion (herramienta): empezar pregunta SIEMPRE, parar no', () => {
  const { porNombre } = require('../herramientas');
  const h = porNombre.grabar_demostracion;
  assert.ok(h.siemprePreguntar({ accion: 'empezar' }));
  assert.strictEqual(h.siemprePreguntar({ accion: 'parar' }), null);
  assert.strictEqual(h.riesgo({ accion: 'parar' }), 'lectura');
  assert.ok(porNombre.clic.parametros.properties.celda && porNombre.clic.parametros.properties.ver);
});
