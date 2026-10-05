// Biblioteca de diseño (core/diseno.js): estudiar un tema (Mobbin y modelo con visión falsos), ficha en disco + memoria,
// buscar, aprendizaje nocturno (temario sin repetir) y la tarea programada que se crea/borra con la config.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearDiseno, TEMARIO } = require('../diseno');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diseno-'));
  const img = path.join(dir, 'x.webp'); fs.writeFileSync(img, 'RIFF....WEBP');
  const llamadas = [], recuerdos = [], pedidos = [];
  let conectado = true;
  const mcpRemotos = {
    conectado: () => conectado,
    llamar: async (id, h, args) => { llamadas.push([id, h, args]); return { texto: JSON.stringify({ screens: [{ app_name: 'N26', mobbin_url: 'https://mobbin.com/screens/a' }, { app_name: 'Chime', mobbin_url: 'https://mobbin.com/screens/b' }] }) + '\n(2 imagen(es) adjunta(s))', imagenes: [{ mime: 'image/webp', ruta: img }, { mime: 'image/webp', ruta: img }] }; },
  };
  const generarJSON = async o => { pedidos.push(o); return { datos: { nombre: 'Onboarding bancario', resumen: 'Pasos claros con progreso.', cuando_usar: 'Altas con KYC', estructura: ['título', 'stepper', 'CTA'], componentes: ['stepper', 'botón'], jerarquia_visual: 'título arriba', microcopy: ['Paso 1 de 4'], detalles: ['24px'], buenas_practicas: ['mostrar progreso'], errores_a_evitar: ['ocultar la longitud'], ejemplos: [{ indice: 1, que_destaca: 'stepper horizontal' }] } }; };
  const tareasL = [];
  const tareas = { internas: new Map(), registrarInterna: (n, f) => tareas.internas.set(n, f), lista: () => tareasL, crear: t => { const x = { id: 't' + tareasL.length, ...t }; tareasL.push(x); return x; }, borrar: id => { const i = tareasL.findIndex(t => t.id === id); if (i >= 0) tareasL.splice(i, 1); } };
  const d = crearDiseno({ cfg: { dir }, mcpRemotos, generarJSON, memoria: { recordar: r => recuerdos.push(r) }, tareas });
  return { d, dir, llamadas, recuerdos, pedidos, tareas, tareasL, desconectar: () => { conectado = false; } };
}

test('diseño: estudiar → ficha con referencias, memoria y búsqueda', async () => {
  const m = montar();
  const p = await m.d.estudiar('onboarding de un banco', { plataforma: 'ios', tipo: 'flujos', cuantas: 5 });
  assert.deepStrictEqual(m.llamadas[0], ['mobbin', 'search_flows', { query: 'onboarding de un banco', limit: 5, platform: 'ios' }]);
  assert.strictEqual(m.pedidos[0].imagenes.length, 2);
  assert.strictEqual(m.pedidos[0].modelo, 'ollama/gemma4:31b-cloud');
  assert.match(m.pedidos[0].prompt, /0: N26 · 1: Chime/);
  assert.deepStrictEqual(p.ejemplos[0], { indice: 1, que_destaca: 'stepper horizontal', app: 'Chime', mobbin_url: 'https://mobbin.com/screens/b' });
  const md = m.d.leerFicha(p.slug);
  assert.match(md, /# Onboarding bancario/); assert.match(md, /\*\*Chime\*\*: stepper horizontal — https:\/\/mobbin.com\/screens\/b/);
  assert.strictEqual(m.recuerdos[0].tipo, 'patron');
  assert.strictEqual(m.d.buscar('pantalla para abrir cuenta en el banco con onboarding')[0].slug, p.slug);
  assert.deepStrictEqual(m.d.buscar('reproductor de música'), []);
  // las secciones web no llevan plataforma
  await m.d.estudiar('página de precios', { tipo: 'secciones' });
  assert.deepStrictEqual(m.llamadas[1][2], { query: 'página de precios', limit: 8 });
  // la herramienta del agente devuelve la ficha
  const h = m.d.HERRAMIENTAS.find(x => x.nombre === 'buscar_patrones_diseno');
  assert.match(await h.ejecutar({ consulta: 'onboarding banco' }), /Onboarding bancario/);
  m.desconectar();
  await assert.rejects(m.d.estudiar('login'), /Mobbin no está conectado/);
  assert.strictEqual(m.d.HERRAMIENTAS.find(x => x.nombre === 'estudiar_diseno').disponible(), false);
});

test('diseño: aprendizaje nocturno sigue el temario sin repetir y la tarea se crea/borra con la config', async () => {
  const m = montar();
  m.d.programar(); assert.strictEqual(m.tareasL.length, 0);                    // apagado por defecto
  await m.d.http('PATCH', ['v1', 'diseno', 'config'], { aprendizaje: true, porNoche: 2 });
  assert.strictEqual(m.tareasL.length, 1);
  assert.deepStrictEqual(m.tareasL[0].accion, { tipo: 'interna', nombre: 'estudiar-diseno' });
  const texto = await m.tareas.internas.get('estudiar-diseno')();
  assert.match(texto, /estudié 2 patrón/);
  await m.tareas.internas.get('estudiar-diseno')();
  assert.deepStrictEqual(m.llamadas.map(l => l[2].query), TEMARIO.slice(0, 4).map(t => t[0]));
  await m.d.http('PATCH', ['v1', 'diseno', 'config'], { aprendizaje: false });
  assert.strictEqual(m.tareasL.length, 0);
});
