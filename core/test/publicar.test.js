// Publicador de clips (core/craft/publicar.js): rclone falso + Discord falso → sube a Drive, saca el enlace y anuncia en el canal.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearPublicador } = require('../craft/publicar');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publicar-'));
  const mp4 = path.join(dir, '2026-10-15 AAA 01 - pop 4K.mp4'), token = path.join(dir, 'token');
  fs.writeFileSync(mp4, Buffer.alloc(3 * 1048576)); fs.writeFileSync(token, 'TOKEN\n');
  const llamadas = [], mensajes = [];
  const ejecutar = (cmd, args, o, cb) => {
    llamadas.push([cmd, ...args]);
    if (cmd === 'rclone' && args.includes('lsjson')) return cb(null, JSON.stringify([{ Size: 3 * 1048576 }]), '');
    if (cmd === 'rclone' && args.includes('link')) return cb(null, 'https://drive.google.com/open?id=ABC_123-x\n', '');
    if (cmd === 'ffmpeg') { fs.writeFileSync(args.at(-1), 'jpg'); return cb(null, '', ''); }
    cb(null, '', '');
  };
  const pedir = async (url, o) => { mensajes.push({ url, o, cuerpo: JSON.parse(o.body.get('payload_json')), foto: o.body.get('files[0]') }); return { ok: true, json: async () => ({ id: 'M1' }) }; };
  const conf = { canal: '999', token, rclone: 'rclone', rcloneConfig: 'r.conf', remoto: 'gdrive:LAGC Clips/' };
  const p = crearPublicador({ conf: () => conf, ejecutar, pedir });
  const clip = { id: 'x', rank: 1, fecha: '2026-10-15', stream: 'AAA', titulo: 'Camioneros (Portrait)', gancho: 'CAOS TOTAL', estilo: 'pop', inicio: 0, fin: 150, k4: { estado: 'listo', mp4 } };
  return { p, clip, llamadas, mensajes, conf };
}

test('publicar: sube a Drive, enlaza y anuncia en el canal con portada y botones', async () => {
  const { p, clip, llamadas, mensajes } = montar();
  const r = await p.publicar(clip);
  assert.deepStrictEqual(llamadas[0], ['rclone', '--config', 'r.conf', 'copyto', clip.k4.mp4, 'gdrive:LAGC Clips/2026-10-15/2026-10-15 AAA 01 - pop 4K.mp4']);
  assert.strictEqual(r.estado, 'listo'); assert.strictEqual(r.mensaje, 'M1'); assert.strictEqual(r.drive.id, 'ABC_123-x');
  const m = mensajes[0];
  assert.strictEqual(m.url, 'https://discord.com/api/v10/channels/999/messages');
  assert.strictEqual(m.o.headers.Authorization, 'Bot TOKEN');
  const e = m.cuerpo.embeds[0];
  assert.match(e.title, /CAOS TOTAL/); assert.match(e.description, /CAOS TOTAL #lagctrucks/);
  assert.strictEqual(e.fields[0].value, '2:30'); assert.match(e.fields[1].value, /3 MB/);
  assert.strictEqual(e.image.url, 'attachment://portada.jpg'); assert.ok(m.foto);
  assert.deepStrictEqual(m.cuerpo.components[0].components.map(b => b.url), [
    'https://drive.usercontent.google.com/download?id=ABC_123-x&export=download&confirm=t', 'https://drive.google.com/file/d/ABC_123-x/view']);
});

test('publicar: si ya estaba en Drive solo vuelve a anunciar; sin config o sin 4K falla claro', async () => {
  const { p, clip, llamadas, conf } = montar();
  clip.publicado = { estado: 'error', drive: { id: 'YA', ver: 'v', descargar: 'd' } };
  await p.publicar(clip);
  assert.ok(!llamadas.some(l => l[0] === 'rclone'), 'no se resube');
  await p.publicar({ ...clip, k4: { mp4: 'no-existe.mp4' } });   // ya en Drive: no hace falta el archivo local
  await assert.rejects(p.publicar({ ...clip, publicado: null, k4: { mp4: 'no-existe.mp4' } }), /4K/);
  delete conf.canal; assert.strictEqual(p.activo(), false);
  await assert.rejects(p.publicar(clip), /discordClips/);
});

test('publicar: con borrarLocal, el 4K se borra solo si Drive tiene el mismo tamaño', async () => {
  const { p, clip, conf } = montar();
  conf.borrarLocal = true;
  const r = await p.publicar(clip);
  assert.strictEqual(r.borradoLocal, true); assert.ok(!fs.existsSync(clip.k4.mp4));
  assert.strictEqual(r.drive.bytes, 3 * 1048576);
  const otro = montar(); otro.conf.borrarLocal = true; fs.appendFileSync(otro.clip.k4.mp4, 'x');
  const r2 = await otro.p.publicar(otro.clip);
  assert.ok(!r2.borradoLocal && fs.existsSync(otro.clip.k4.mp4), 'tamaño distinto: se queda');
});
