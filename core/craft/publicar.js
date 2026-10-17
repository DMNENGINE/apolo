// Publica un clip 4K aprobado para que el streamer lo descargue: lo sube a Google Drive (rclone), saca un enlace de "cualquiera
// con el enlace" y lo anuncia en un canal privado de Discord (embed con portada, texto para redes y botones de descarga).
// Config (lotes.json → discordClips): { canal, token: archivo con el token del bot, rclone, rcloneConfig, remoto: 'gdrive:LAGC Clips',
//   hashtags: '#... #...', borrarLocal: true → el 4K local se borra en cuanto Drive confirma el mismo tamaño (libera disco) }
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const API = 'https://discord.com/api/v10';

function crearPublicador({ conf, ejecutar = execFile, pedir = globalThis.fetch, log = () => { } }) {
  const sh = (cmd, args, timeout = 600_000) => new Promise((ok, mal) =>
    ejecutar(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 << 20, encoding: 'utf8' }, (e, out, err) => (e ? mal(new Error(`${path.basename(cmd)}: ${(err || e.message).toString().trim().slice(0, 300)}`)) : ok(String(out || '')))));
  const rclone = (...args) => { const k = conf(); return sh(k.rclone || 'rclone', [...(k.rcloneConfig ? ['--config', k.rcloneConfig] : []), ...args], 3_600_000); };
  const activo = () => !!(conf()?.canal && conf()?.token);

  async function subirDrive(c) {
    const k = conf(), remoto = `${(k.remoto || 'gdrive:LAGC Clips').replace(/\/$/, '')}/${c.fecha}/${path.basename(c.k4.mp4)}`;
    const bytes = fs.statSync(c.k4.mp4).size;
    await rclone('copyto', c.k4.mp4, remoto);
    const enlace = (await rclone('link', remoto)).trim();
    const id = (enlace.match(/[?&]id=([\w-]+)/) || enlace.match(/\/d\/([\w-]+)/) || [])[1];
    if (!id) throw new Error(`rclone no devolvió un enlace de Drive: ${enlace.slice(0, 200)}`);
    return { id, remoto, bytes, ver: `https://drive.google.com/file/d/${id}/view`, descargar: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` };
  }

  async function portada(c) {
    const jpg = path.join(os.tmpdir(), `portada-${process.pid}-${Date.now()}.jpg`);
    try { await sh(conf().ffmpeg || 'ffmpeg', ['-y', '-v', 'error', '-ss', '4', '-i', c.k4.mp4, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', jpg], 120_000); return jpg; }
    catch (e) { log('[publicar] portada', e.message); return null; }
  }

  async function anunciar(c, drive) {
    const k = conf(), token = fs.readFileSync(k.token, 'utf8').trim();
    const bytes = drive.bytes || (fs.existsSync(c.k4.mp4) ? fs.statSync(c.k4.mp4).size : 0);
    const mb = Math.round(bytes / 1048576), dur = Math.round(c.fin - c.inicio);
    const titulo = c.tituloClip || c.gancho || `Clip ${c.rank}`;
    const texto = [c.gancho, k.hashtags || '#lagctrucks #camioneros #troqueros #americantrucksimulator #simulador'].filter(Boolean).join(' ');
    const jpg = fs.existsSync(c.k4.mp4) ? await portada(c) : null;
    const cuerpo = {
      embeds: [{ title: `🎬 ${titulo}`.slice(0, 256), color: 0x00d9ff,
        description: `Texto para redes:\n\`\`\`${texto.slice(0, 900)}\`\`\``,
        fields: [{ name: 'Duración', value: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`, inline: true },
          { name: 'Calidad', value: `4K vertical${mb ? ` · ${mb} MB` : ''}`, inline: true },
          { name: 'Stream', value: `[${String(c.titulo || c.stream).replace(/\s*\((portrait|vertical)\)\s*/i, '').trim().slice(0, 80)}](https://www.youtube.com/watch?v=${c.stream})`, inline: true }],
        ...(jpg ? { image: { url: 'attachment://portada.jpg' } } : {}),
        footer: { text: `${c.fecha} · clip ${c.rank} · estilo ${c.estilo || '-'}` } }],
      components: [{ type: 1, components: [
        { type: 2, style: 5, label: 'Descargar 4K', emoji: { name: '⬇️' }, url: drive.descargar },
        { type: 2, style: 5, label: 'Ver en Drive', emoji: { name: '▶️' }, url: drive.ver }] }],
      allowed_mentions: { parse: [] },
    };
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(cuerpo));
    if (jpg) { fd.append('files[0]', new Blob([fs.readFileSync(jpg)], { type: 'image/jpeg' }), 'portada.jpg'); try { fs.rmSync(jpg, { force: true }); } catch { } }
    const r = await pedir(`${API}/channels/${k.canal}/messages`, { method: 'POST', headers: { Authorization: `Bot ${token}`, 'User-Agent': 'DiscordBot (robot-companion, 1)' }, body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Discord ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
    return d.id;
  }

  // sube (si no estaba ya en Drive) y anuncia; devuelve lo que hay que guardar en c.publicado
  async function publicar(c) {
    if (!activo()) throw new Error('falta discordClips.canal / token en lotes.json');
    const yaEnDrive = c.publicado?.drive?.id;
    if (!yaEnDrive && (!c.k4?.mp4 || !fs.existsSync(c.k4.mp4))) throw new Error('el clip no tiene el 4K exportado');
    const drive = yaEnDrive ? c.publicado.drive : await subirDrive(c);
    const mensaje = await anunciar(c, drive);
    let borrado = false;
    if (conf().borrarLocal && fs.existsSync(c.k4.mp4)) {
      const remoto = JSON.parse(await rclone('lsjson', drive.remoto))[0];
      if (remoto && remoto.Size === fs.statSync(c.k4.mp4).size) { fs.rmSync(c.k4.mp4, { force: true }); borrado = true; }
      else log('[publicar] el tamaño en Drive no cuadra; no se borra', c.k4.mp4);
    }
    return { estado: 'listo', drive, mensaje, hecho: Date.now(), ...(borrado ? { borradoLocal: true } : {}) };
  }

  return { publicar, activo };
}

module.exports = { crearPublicador };
