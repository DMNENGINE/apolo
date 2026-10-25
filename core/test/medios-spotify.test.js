// Medios (vídeos para la R1) y Spotify (Web API): validaciones, login PKCE con callback de un solo uso, playlists y poner
// en la R1 por Spotify Connect, todo con un fetch falso. Sin red ni Python.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearNucleo } = require('../index');
const { crearMedios } = require('../medios');
const { crearSpotify } = require('../spotify');

function nucleo(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medios-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m', ...extra }));
  return crearNucleo({ dir, embedder: null, sinPlugins: true, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [] }) } });
}

test('medios: solo YouTube/Rumble, miniaturas solo de sus hosts, rutas y herramientas', async () => {
  const n = nucleo(), m = crearMedios({ nucleo: n });
  await assert.rejects(m.http('POST', ['v1', 'medios', 'stream'], { url: 'https://evil.example/v.mp4' }), /YouTube o Rumble/);
  await assert.rejects(m.http('GET', ['v1', 'medios', 'mini'], {}, { u: 'https://evil.example/a.jpg' }), /host no permitido/);
  await assert.rejects(m.http('GET', ['v1', 'medios', 'mini'], {}, { u: 'http://i.ytimg.com/vi/x/mq.jpg' }), /host no permitido/);   // solo https
  await assert.rejects(m.http('GET', ['v1', 'medios', 'buscar'], {}, { fuente: 'youtube', q: '  ' }), /falta q/);
  assert.deepStrictEqual(await m.http('GET', ['v1', 'medios', 'historial']), []);
  // proxy: una clave que no existe → 404
  let codigo = 0; m.proxy({ headers: {}, on() { } }, { writeHead: c => { codigo = c; }, end() { } }, 'nada');
  assert.strictEqual(codigo, 404);
  const H = n.herramientas?.porNombre || require('../herramientas').porNombre;
  assert.ok(H.r1_video && H.r1_musica);
  assert.strictEqual(H.r1_video.disponible(), false);          // sin R1 conectada no se ofrecen
});

test('spotify: config, login PKCE con state de un solo uso, playlists y poner en la R1 (Connect) o abrir allí', async () => {
  const n = nucleo();
  const llamadas = [];
  let dispositivos = [{ id: 'pc1', name: 'DESKTOP', type: 'Computer', is_active: true }];
  const fetch = async (url, o = {}) => {
    llamadas.push({ url, o });
    const r = (code, j) => ({ ok: code < 300, status: code, json: async () => j });
    if (url.endsWith('/api/token')) {
      const b = new URLSearchParams(o.body);
      if (b.get('grant_type') === 'authorization_code') { assert.ok(b.get('code_verifier')?.length > 40); return r(200, { access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }); }
      return r(200, { access_token: 'A2', expires_in: 3600 });
    }
    if (url.endsWith('/v1/me')) return r(200, { id: 'yo', display_name: 'Demon' });
    if (url.includes('/me/playlists')) return r(200, { items: [{ uri: 'spotify:playlist:abc', name: 'Gym', tracks: { total: 30 }, owner: { display_name: 'Demon' }, images: [{ url: 'https://i.scdn.co/x' }] }] });
    if (url.includes('/me/player/devices')) return r(200, { devices: dispositivos });
    if (url.includes('/me/player/play')) return { ok: true, status: 204, json: async () => null };
    return r(404, { error: { message: 'no' } });
  };
  let abierto = '';
  const sp = crearSpotify({ nucleo: n, puerto: () => 47999, fetch, abrir: u => { abierto = u; } });
  assert.deepStrictEqual(await sp.http('GET', ['v1', 'spotify', 'estado']), { configurado: false, vinculado: false, usuario: '', redirect: 'http://127.0.0.1:47999/spotify/callback' });
  await assert.rejects(sp.http('POST', ['v1', 'spotify', 'vincular']), /Client ID/);
  await assert.rejects(sp.http('PUT', ['v1', 'spotify', 'config'], { clientId: 'corto' }), /no válido/);
  await sp.http('PUT', ['v1', 'spotify', 'config'], { clientId: 'a'.repeat(32) });
  await assert.rejects(sp.http('GET', ['v1', 'spotify', 'playlists']), /no está vinculado/);
  await sp.http('POST', ['v1', 'spotify', 'vincular']);
  const u = new URL(abierto);
  assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
  assert.strictEqual(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:47999/spotify/callback');
  const state = u.searchParams.get('state');
  assert.strictEqual((await sp.callback({ state: 'otro', code: 'c' })).codigo, 400);
  const ok = await sp.callback({ state, code: 'c' });
  assert.strictEqual(ok.codigo, 200); assert.match(ok.html, /Demon/);
  assert.strictEqual((await sp.callback({ state, code: 'c' })).codigo, 400);          // el state no se puede reutilizar
  const e = await sp.http('GET', ['v1', 'spotify', 'estado']);
  assert.strictEqual(e.vinculado, true); assert.strictEqual(e.usuario, 'Demon');
  assert.ok(!JSON.stringify(e).includes('R1') && !JSON.stringify(e).includes('A1'));   // los tokens nunca salen por la API
  assert.strictEqual((fs.statSync(path.join(n.cfg.dir, 'spotify.json')).mode & 0o777) !== 0o666 || process.platform === 'win32', true);
  assert.deepStrictEqual(await sp.http('GET', ['v1', 'spotify', 'playlists']), [{ uri: 'spotify:playlist:abc', nombre: 'Gym', canciones: 30, dueno: 'Demon', img: 'https://i.scdn.co/x' }]);
  // poner: sin la R1 en Connect → que la R1 lo abra; con ella → play en su device_id
  await assert.rejects(sp.http('POST', ['v1', 'spotify', 'poner'], { uri: 'javascript:alert(1)' }), /no válida/);
  assert.deepStrictEqual(await sp.http('POST', ['v1', 'spotify', 'poner'], { uri: 'spotify:playlist:abc' }), { abrir: 'spotify:playlist:abc', motivo: 'el Spotify de la R1 no está activo: se abre allí' });
  dispositivos = [...dispositivos, { id: 'r1x', name: 'Rabbit R1', type: 'Smartphone', is_active: false }];
  assert.deepStrictEqual(await sp.http('POST', ['v1', 'spotify', 'poner'], { uri: 'spotify:playlist:abc' }), { ok: true, dispositivo: 'Rabbit R1' });
  const play = llamadas.find(l => l.url.includes('/me/player/play?device_id=r1x'));
  assert.deepStrictEqual(JSON.parse(play.o.body), { context_uri: 'spotify:playlist:abc' });
});
