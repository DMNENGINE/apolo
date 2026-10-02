// Navegador: cola long-poll con una extensión simulada, permiso por sitio, sitios protegidos y clics delicados.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { crearNavegador } = require('../navegador');

function montar({ decidir = () => true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'));
  const pedidos = [];
  const permisos = { pedir: async ({ h, args }) => { pedidos.push({ que: h.resumen(args), forzado: !!h.siemprePreguntar }); return { ok: decidir(h, args) }; } };
  const nav = crearNavegador({ cfg: { dir }, bus: new EventEmitter(), permisos, cancelarTurno: () => { } });
  const tabs = [{ id: 7, titulo: 'Inicio', url: 'https://ejemplo.com/', activa: true }];
  // extensión falsa: abre un long-poll, contesta las órdenes y vuelve a preguntar
  let vivo = true;
  const ext = async () => {
    while (vivo) {
      const ordenes = await new Promise(ok => {
        const res = new EventEmitter();
        res.writeHead = () => { }; res.end = b => ok(JSON.parse(b).ordenes);
        nav.esperar(new EventEmitter(), res, { navegador: 'Test' });
      });
      for (const o of ordenes) {
        const datos = {
          pestanas: () => tabs,
          leer: () => ({ titulo: 'Inicio', url: tabs[0].url, texto: 'hola', elementos: [{ ref: 1, tipo: 'botón', texto: 'Buscar' }, { ref: 2, tipo: 'botón', texto: 'Comprar ahora' }] }),
          clic: () => ({ texto: 'ok' }),
          abrir: () => { tabs.push({ id: 8, titulo: 'Nueva', url: o.args.url }); return { id: 8, titulo: 'Nueva', url: o.args.url }; },
        }[o.op]();
        nav.resultado(o.id, { ok: true, datos });
      }
    }
  };
  return { nav, pedidos, ext, parar: () => { vivo = false; } };
}

test('sin extensión conectada da un error claro', async () => {
  const { nav } = montar();
  await assert.rejects(nav.accion({ id: 's' }, 'pestanas'), /no está conectada/);
});

test('leer pide permiso por sitio una sola vez y clic delicado pregunta aparte', async () => {
  const m = montar(); m.ext();
  const s = { id: 's1' };
  const txt = await m.nav.accion(s, 'leer', {});
  assert.match(txt, /\[1\] botón "Buscar"/);
  const r1 = await m.nav.accion(s, 'clic', { ref: 1 });
  assert.match(r1, /NO cambió nada y "Buscar" sigue ahí/);   // misma página tras el clic = no funcionó
  assert.equal(m.pedidos.length, 1);                       // el sitio ya estaba aprobado
  assert.match(m.pedidos[0].que, /ejemplo\.com/);
  await m.nav.accion(s, 'clic', { ref: 2 });
  assert.equal(m.pedidos.length, 2);
  assert.ok(m.pedidos[1].forzado);                          // "Comprar" = delicado, siempre pregunta
  m.parar();
});

test('sitio protegido y denegaciones', async () => {
  const m = montar({ decidir: () => false }); m.ext();
  await assert.rejects(m.nav.accion({ id: 's2' }, 'abrir', { url: 'https://www.paypal.com/' }), /PROTEGIDO/);
  await assert.rejects(m.nav.accion({ id: 's2' }, 'abrir', { url: 'ejemplo.org' }), /DENEGADO/);
  m.parar();
});
