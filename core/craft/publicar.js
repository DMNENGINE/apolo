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

// kitDe(c) → kit de marca del clip (hashtags y color del anuncio); sin kit, los de lotes.json o los de siempre
function crearPublicador({ conf, ejecutar = execFile, pedir = globalThis.fetch, log = () => { }, kitDe = () => null }) {
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

  // un archivo más junto al vídeo en Drive (portada, subtítulos en inglés, versión en inglés) → enlace de descarga
  async function subirJunto(drive, local, sufijo) {
    if (!local || !fs.existsSync(local)) return null;
    const remoto = drive.remoto.replace(/\.mp4$/i, '') + sufijo;
    await rclone('copyto', local, remoto);
    const enlace = (await rclone('link', remoto)).trim();
    const id = (enlace.match(/[?&]id=([\w-]+)/) || enlace.match(/\/d\/([\w-]+)/) || [])[1];
    return id ? { id, remoto, descargar: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` } : null;
  }
  // la portada elegida también a Drive, junto al vídeo (para ponerla de portada en TikTok/Shorts)
  const subirPortada = (c, drive) => subirJunto(drive, c.portadas?.[c.portada || 0]?.jpg, ' - portada.jpg');

  async function portada(c) {
    const jpg = path.join(os.tmpdir(), `portada-${process.pid}-${Date.now()}.jpg`);
    try { await sh(conf().ffmpeg || 'ffmpeg', ['-y', '-v', 'error', '-ss', '4', '-i', c.k4.mp4, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', jpg], 120_000); return jpg; }
    catch (e) { log('[publicar] portada', e.message); return null; }
  }

  async function anunciar(c, drive, portadaDrive, extras = {}) {
    const k = conf(), token = fs.readFileSync(k.token, 'utf8').trim();
    const bytes = drive.bytes || (fs.existsSync(c.k4.mp4) ? fs.statSync(c.k4.mp4).size : 0);
    const mb = Math.round(bytes / 1048576), dur = Math.round(c.fin - c.inicio);
    const titulo = c.tituloClip || c.gancho || `Clip ${c.rank}`;
    const kit = kitDe(c);
    const hashtags = k.hashtags || kit?.hashtags || '#lagctrucks #camioneros #troqueros #americantrucksimulator #simulador';
    const texto = [c.textos?.es?.titulo || c.gancho, hashtags].filter(Boolean).join(' ');
    const textoEn = c.textos?.en?.titulo && c.textos.en.titulo !== c.textos?.es?.titulo ? [c.textos.en.titulo, kit?.hashtagsEn || hashtags].join(' ') : '';
    const yt = ['en cola', 'subiendo', 'listo'].includes(c.youtube?.estado) ? c.youtube : null;   // APOLO lo sube a YouTube: que el streamer no lo suba a mano
    // la portada elegida en Revisión (PhotoCraft); si no hay, un fotograma del 4K
    const elegida = c.portadas?.[c.portada || 0]?.jpg;
    const propia = elegida && fs.existsSync(elegida);
    const hecha = propia ? elegida : fs.existsSync(c.k4.mp4) ? await portada(c) : null;
    const jpg = hecha && fs.existsSync(hecha) ? hecha : null;
    const color = /^#[0-9a-f]{6}$/i.test(kit?.colores?.acento || '') ? parseInt(kit.colores.acento.slice(1), 16) : 0x00d9ff;
    const cuerpo = {
      embeds: [{ title: `🎬 ${titulo}`.slice(0, 256), color,
        description: `Texto para redes:\n\`\`\`${texto.slice(0, 900)}\`\`\``
          + (textoEn ? `\nEn inglés (cuentas en inglés / EE. UU.):\n\`\`\`${textoEn.slice(0, 600)}\`\`\`` : '')
          + (yt ? `\n📺 **YouTube: ya lo sube APOLO** (${yt.publicarEn ? `se publica <t:${Math.floor(yt.publicarEn / 1000)}:f>` : 'publicado'}) — no lo subas a YouTube a mano.` : ''),
        fields: [{ name: 'Duración', value: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`, inline: true },
          { name: 'Calidad', value: `4K vertical${mb ? ` · ${mb} MB` : ''}`, inline: true },
          { name: 'Stream', value: `[${String(c.titulo || c.stream).replace(/\s*\((portrait|vertical)\)\s*/i, '').trim().slice(0, 80)}](https://www.youtube.com/watch?v=${c.stream})`, inline: true }],
        ...(jpg ? { image: { url: 'attachment://portada.jpg' } } : {}),
        footer: { text: `${c.fecha} · clip ${c.rank} · estilo ${c.estilo || '-'}` } }],
      components: [{ type: 1, components: [
        { type: 2, style: 5, label: 'Descargar 4K', emoji: { name: '⬇️' }, url: drive.descargar },
        { type: 2, style: 5, label: 'Ver en Drive', emoji: { name: '▶️' }, url: drive.ver },
        ...(portadaDrive ? [{ type: 2, style: 5, label: 'Descargar portada', emoji: { name: '🖼️' }, url: portadaDrive.descargar }] : []),
        ...(extras.en ? [{ type: 2, style: 5, label: 'Versión en inglés', emoji: { name: '🇺🇸' }, url: extras.en.descargar }] : []),
        ...(extras.srtEn ? [{ type: 2, style: 5, label: 'Subtítulos EN (.srt)', emoji: { name: '💬' }, url: extras.srtEn.descargar }] : [])] }],
      allowed_mentions: { parse: [] },
    };
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(cuerpo));
    if (jpg) { fd.append('files[0]', new Blob([fs.readFileSync(jpg)], { type: 'image/jpeg' }), 'portada.jpg'); if (!propia) try { fs.rmSync(jpg, { force: true }); } catch { } }
    const r = await pedir(`${API}/channels/${k.canal}/messages`, { method: 'POST', headers: { Authorization: `Bot ${token}`, 'User-Agent': 'DiscordBot (robot-companion, 1)' }, body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Discord ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
    return d.id;
  }

  // borra el 4K local si Drive tiene el mismo tamaño (libera disco); true si se borró
  async function liberar(c) {
    const drive = c.publicado?.drive;
    if (!drive?.remoto || !c.k4?.mp4 || !fs.existsSync(c.k4.mp4)) return false;
    const remoto = JSON.parse(await rclone('lsjson', drive.remoto))[0];
    if (remoto && remoto.Size === fs.statSync(c.k4.mp4).size) { fs.rmSync(c.k4.mp4, { force: true }); return true; }
    log('[publicar] el tamaño en Drive no cuadra; no se borra', c.k4.mp4);
    return false;
  }
  // el 4K de vuelta desde Drive (para subir a YouTube un clip cuyo 4K local ya se borró)
  async function traer(c, destino) {
    if (!c.publicado?.drive?.remoto) throw new Error('el clip no está en Drive');
    await rclone('copyto', c.publicado.drive.remoto, destino);
    return destino;
  }

  // sube (si no estaba ya en Drive) y anuncia; devuelve lo que hay que guardar en c.publicado.
  // borrarLocal: false → el 4K se queda (p. ej. aún falta subirlo a YouTube) y se borra luego con liberar()
  async function publicar(c, { borrarLocal = conf().borrarLocal } = {}) {
    if (!activo()) throw new Error('falta discordClips.canal / token en lotes.json');
    const yaEnDrive = c.publicado?.drive?.id;
    if (!yaEnDrive && (!c.k4?.mp4 || !fs.existsSync(c.k4.mp4))) throw new Error('el clip no tiene el 4K exportado');
    const drive = yaEnDrive ? c.publicado.drive : await subirDrive(c);
    let portadaDrive = c.publicado?.portadaDrive || null;
    if (!portadaDrive) try { portadaDrive = await subirPortada(c, drive); } catch (e) { log('[publicar] portada a Drive', e.message); }
    const extras = { ...(c.publicado?.extras || {}) };
    for (const [k, local, sufijo] of [['srtEn', c.en?.srt, ' - EN.srt'], ['en', c.en?.mp4, ' - EN.mp4']]) {
      if (!extras[k] && local) try { extras[k] = await subirJunto(drive, local, sufijo); } catch (e) { log('[publicar]', k, e.message); }
      if (!extras[k]) delete extras[k];
    }
    const mensaje = await anunciar(c, drive, portadaDrive, extras);
    const borrado = borrarLocal ? await liberar({ ...c, publicado: { drive } }) : false;
    return { estado: 'listo', drive, mensaje, hecho: Date.now(), ...(portadaDrive ? { portadaDrive } : {}), ...(Object.keys(extras).length ? { extras } : {}), ...(borrado ? { borradoLocal: true } : {}) };
  }

  return { publicar, activo, liberar, traer };
}

module.exports = { crearPublicador };
