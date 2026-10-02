// Consejo de modelos: respuestas en paralelo, ronda de debate, veredicto con votos, ausentes y Mission Control.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// proveedor OpenAI-compatible falso: el "modelo" decide la respuesta; "roto" devuelve 429; el moderador devuelve JSON
async function servidor(t, { espera = 250 } = {}) {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', async () => {
      const j = JSON.parse(b); pedidos.push({ ...j, t: Date.now() });
      const sys = j.messages.find(m => m.role === 'system')?.content || '';
      const ult = j.messages.filter(m => m.role === 'user').at(-1)?.content || '';
      if (j.model === 'roto') { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'rate limit' } })); }
      let content;
      if (/MODERADOR/.test(sys)) {
        content = JSON.stringify({ respuesta: 'La capital de Australia es Canberra.', acuerdo: 90, titular: 'Canberra gana por goleada',
          votos: [{ modelo: 'falso/m1', voto: 'a favor', motivo: 'dijo Canberra' }, { modelo: 'm2', voto: 'a favor', motivo: 'se corrigió' }] });
      } else {
        await new Promise(ok => setTimeout(ok, espera));
        if (/RONDA DE DEBATE/.test(ult)) content = j.model === 'm2' ? 'POSTURA: corrijo\nTenían razón: es Canberra, no Sídney.' : 'POSTURA: mantengo\nCanberra.';
        else content = j.model === 'm2' ? 'Sídney.' : 'Canberra.';
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => { srv.closeAllConnections?.(); srv.close(); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-consejo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, local: true } },
    memoria: { embeddings: null }, consejo: { miembros: ['falso/m1', 'falso/m2'], rondas: 1, moderador: 'falso/mod' },
  }));
  const { crearNucleo } = require('../index');
  return { n: crearNucleo({ dir, sinPlugins: true }), pedidos, dir };
}

test('consejo: responden en paralelo, debaten, el moderador vota y un 429 queda ausente', async t => {
  const { n, pedidos } = await servidor(t);
  const fases = [], agentes = [];
  n.bus.on('evento', e => { if (e.tipo === 'consejo') fases.push(e.fase); });
  n.bus.on('agente', a => agentes.push(a));
  const t0 = Date.now();
  const r = await n.consejo.consultar({ pregunta: '¿Capital de Australia?', miembros: ['falso/m1', 'falso/m2', 'falso/roto'] });
  const ms = Date.now() - t0;
  assert.ok(ms < 1400, `tardó ${ms} ms: no fue en paralelo`);                // 2 rondas de 250 ms + moderador
  assert.strictEqual(r.estado, 'listo');
  assert.strictEqual(r.rondas.length, 2);
  assert.deepStrictEqual(r.rondas[0].map(x => x.modelo).sort(), ['falso/m1', 'falso/m2']);
  const m2 = r.rondas[1].find(x => x.modelo === 'falso/m2');
  assert.strictEqual(m2.postura, 'corrijo');
  assert.match(m2.texto, /Canberra/); assert.doesNotMatch(m2.texto, /POSTURA/);
  // en el debate cada uno ve SOLO a los otros
  const deb = pedidos.filter(p => /RONDA DE DEBATE/.test(p.messages.at(-1).content));
  assert.strictEqual(deb.length, 2);
  const debM1 = deb.find(p => p.model === 'm1').messages.at(-1).content;
  assert.match(debM1, /### m2\nSídney/); assert.doesNotMatch(debM1, /### m1/);
  // ausente
  const roto = r.miembros.find(m => m.modelo === 'falso/roto');
  assert.strictEqual(roto.estado, 'ausente'); assert.match(roto.motivo, /429/);
  // veredicto: votos con nombres exactos (m2 llegó sin proveedor y se casa igual), acuerdo mezclado con el calculado
  assert.strictEqual(r.veredicto.respuesta, 'La capital de Australia es Canberra.');
  assert.deepStrictEqual(r.veredicto.votos.map(v => [v.modelo, v.voto]), [['falso/m1', 'a favor'], ['falso/m2', 'a favor']]);
  assert.strictEqual(r.veredicto.acuerdo, 95);
  assert.match(r.texto, /Consejo de 2 modelos[\s\S]*acuerdo 95%[\s\S]*Ausentes:\*\* roto/);
  assert.deepStrictEqual([fases[0], fases.at(-1)], ['inicio', 'fin']);
  assert.ok(fases.includes('ronda') && fases.includes('veredicto'));
  // Mission Control: el consejo y sus miembros como hijos
  await new Promise(ok => setTimeout(ok, 300));
  const lista = n.subagentes.lista();
  const padre = lista.find(a => a.id === r.sesion);
  assert.ok(padre && padre.estado === 'listo');
  const hijos = lista.filter(a => a.padre === r.sesion);
  assert.strictEqual(hijos.length, 3);
  assert.strictEqual(hijos.find(h => h.modelo === 'falso/roto').estado, 'error');
  // historial y sesión del consejo con el veredicto
  assert.strictEqual(n.consejo.historial()[0].id, r.id);
  assert.match(n.sesiones.obtener(r.sesion).mensajes.at(-1).content, /Canberra/);
});

test('consejo: sin debate (rondas 0), herramienta consultar_consejo y cancelación', async t => {
  const { n } = await servidor(t, { espera: 150 });
  const r = await n.consejo.consultar({ pregunta: 'hola', rondas: 0 });
  assert.strictEqual(r.rondas.length, 1);
  assert.deepStrictEqual(r.miembros.map(m => m.modelo), ['falso/m1', 'falso/m2']);   // los de cfg.consejo.miembros
  // herramienta
  const h = require('../herramientas').porNombre.consultar_consejo;
  assert.ok(h);
  const txt = await h.ejecutar({ pregunta: 'otra', rondas: 0 }, { consejo: n.consejo, signal: new AbortController().signal });
  assert.match(txt, /Consejo de 2 modelos/);
  // cancelar a mitad
  const p = n.consejo.consultar({ pregunta: 'larga' });
  await new Promise(ok => setTimeout(ok, 50));
  const vivo = n.consejo.enCurso()[0];
  assert.ok(n.agente.cancelar(vivo.sesion));                 // "Detener" de Mission Control también lo para
  await assert.rejects(p, /cancelad/);
  assert.strictEqual(n.consejo.obtener(vivo.id).estado, 'cancelado');
  // sin pregunta
  await assert.rejects(n.consejo.consultar({ pregunta: ' ' }), /falta la pregunta/);
});

test('consejo: ningún miembro disponible → error claro', async t => {
  const { n } = await servidor(t);
  await assert.rejects(n.consejo.consultar({ pregunta: 'x', miembros: ['falso/roto'] }), /ningún miembro respondió/);
  await assert.rejects(n.consejo.consultar({ pregunta: 'x', miembros: ['noexiste/zz'] }), /ningún miembro respondió[\s\S]*no configurado/);
});
