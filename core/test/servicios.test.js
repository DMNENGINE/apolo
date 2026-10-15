// Servicios en línea: webs (HTTP), unidades systemd y apps de pm2 por SSH (una conexión por máquina), validación y avisos de caída.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearServicios, validar } = require('../servicios');

test('validar descarta lo peligroso o incompleto', () => {
  const c = validar({ grupos: [{ nombre: 'X', servicios: [{ id: 'a', url: 'https://a.com' }, { id: 'b', ssh: 'pi@1.2.3.4', unidad: 'x.service; rm -rf /' }, { id: 'c', ssh: 'evil host' }, { id: 'd', tcp: 'h:22' }, { id: 'e' }] }] });
  assert.deepStrictEqual(c.grupos[0].servicios.map(s => s.id), ['a', 'b', 'd']);
  assert.strictEqual(c.grupos[0].servicios[1].unidad, undefined);
});

test('revisa webs, systemd y pm2; avisa cuando algo cambia', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serv-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'servicios.json'), JSON.stringify({ grupos: [{ id: 'g', nombre: 'G', servicios: [
    { id: 'web', nombre: 'Web', url: 'https://ok.com' }, { id: 'rota', nombre: 'Rota', url: 'https://mal.com' },
    { id: 'bot', nombre: 'Bot', ssh: 'pi@pi', unidad: 'bot.service' }, { id: 'otro', nombre: 'Otro', ssh: 'pi@pi', unidad: 'otro.service' },
    { id: 'app', nombre: 'App', ssh: 'pi@pi', pm2: 'app' }, { id: 'vps', nombre: 'VPS', ssh: 'root@vps' }] }] }));
  let botActivo = 'active'; const llamadas = [], avisos = [];
  const ssh = async (d, cmd) => { llamadas.push(d); if (d === 'root@vps') return { salida: '' };
    return { salida: `APOLO-OK\n${botActivo}\ninactive\nAPOLO-PM2\n${JSON.stringify([{ name: 'app', pm2_env: { status: 'online' } }])}` }; };
  const fetch = async u => ({ status: /ok/.test(u) ? 200 : 502, body: null });
  const s = crearServicios({ cfg: { dir }, ssh, fetch, log: (n, x) => avisos.push(x) });
  let e = await s.revisar();
  assert.deepStrictEqual(Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.ok])), { web: true, rota: false, bot: true, otro: false, app: true, vps: false });
  assert.strictEqual(llamadas.filter(d => d === 'pi@pi').length, 1);            // una sola conexión para las tres cosas de la Pi
  assert.match(e.vps.detalle, /sin conexión/);
  botActivo = 'failed'; e = await s.revisar();
  assert.strictEqual(e.bot.ok, false); assert.deepStrictEqual(avisos, ['Bot se ha caído (failed)']);
  assert.deepStrictEqual((await s.http('GET', ['', 'servicios'], {})).grupos[0].servicios.length, 6);
});
