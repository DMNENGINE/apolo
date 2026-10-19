// Audio de estudio con SoundCraft (receta fija, probada): voz/mezcla del stream → paso alto, menos "caja", más presencia,
// de-esser, compresión suave → master con maximizer (techo −1,5: el maximizer limita picos de muestra, no el pico real) →
// bounce y ajuste de volumen hasta el objetivo (−14 LUFS ±0,5, pico real ≤ −1 dBTP), máx. 4 vueltas.
// Con música: va en su pista a −20 dB y BAJA sola cuando se habla (ducking por automatización de volumen).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CADENA_VOZ = [
  ['eq_7band', { hpf_on: 1, hpf_freq: 70, low_mid_freq: 300, low_mid_gain: -2, low_mid_q: 1, high_mid_freq: 4000, high_mid_gain: 2, high_mid_q: 0.9 }],
  ['de_esser', { freq: 6500, range: 6, threshold: -30 }],
  ['compressor', { threshold: -22, ratio: 2.5, attack: 15, release: 150, knee: 6, makeup: 2 }],
];

// tramos con voz (puro): palabras [{s,e}] → [[desde, hasta]] uniendo huecos cortos
function tramosVoz(palabras, { hueco = 1.2 } = {}) {
  const out = [];
  for (const p of [...(palabras || [])].sort((a, b) => a.s - b.s)) {
    if (out.length && p.s - out.at(-1)[1] <= hueco) out.at(-1)[1] = Math.max(out.at(-1)[1], p.e);
    else out.push([p.s, p.e]);
  }
  return out;
}
// puntos de automatización del ducking (puro): música a `base` dB y a `bajo` dB mientras se habla, con rampas
function puntosDucking(tramos, { base = -20, bajo = -32, rampa = 0.25, duracion = Infinity } = {}) {
  const pts = [[0, base]];
  for (const [d, h] of tramos) {
    const a = Math.max(0, d - rampa), b = Math.min(duracion, h + rampa);
    if (a > pts.at(-1)[0]) pts.push([a, base]); else pts.at(-1)[1] = base;
    pts.push([Math.max(a + 0.01, d), bajo], [h, bajo]);
    if (b > h) pts.push([b, base]);
  }
  return pts.map(([t, v]) => [+t.toFixed(3), v]);
}

// ejecutar = execFile (inyectable en tests)
function crearAudio({ mcpLocales, cfg, ejecutar = execFile }) {
  const correr = (cmd, args, timeout = 600_000) => new Promise((ok, mal) => ejecutar(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 << 20 },
    (e, out, err) => (e ? mal(new Error(`${path.basename(cmd)}: ${String(err || e.message).trim().slice(-300)}`)) : ok(out))));
  const ffmpeg = () => cfg?.craft?.ffmpeg || 'ffmpeg';
  async function sc(nombre, args) {
    const r = await mcpLocales.llamar('soundcraft', nombre, args, { timeoutSeg: 1800 });
    const txt = (r?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (r?.isError) throw new Error(`SoundCraft ${nombre}${args?.command ? ' ' + args.command : ''}: ${txt.slice(0, 300)}`);
    try { return JSON.parse(txt); } catch { return txt; }
  }
  const ex = (command, params = {}) => sc('execute', { command, params });

  // entrada (audio o vídeo) → WAV masterizado. Devuelve { wav, lufs, picoReal, vueltas }
  async function masterizar({ entrada, salida, lufs = -14, picoMax = -1, musica, palabras, progreso = () => { } }) {
    if (!mcpLocales.obtener('soundcraft')?.activo) throw new Error('SoundCraft no está instalado o está desactivado (Configuración → Apps MCP locales)');
    if (!fs.existsSync(entrada)) throw new Error(`no existe ${entrada}`);
    if (!salida) throw new Error('falta la ruta de salida del WAV');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-audio-'));
    try {
      progreso('extrayendo el audio');
      const voz = path.join(tmp, 'voz.wav');
      await correr(ffmpeg(), ['-v', 'error', '-y', '-i', entrada, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s24le', voz]);
      progreso('mezcla en SoundCraft');
      await sc('new_session', { name: 'master', sample_rate: 48000 });
      await ex('track.new', { name: 'Voz', format: 'stereo' });
      await sc('import_audio', { path: voz, track: 'Voz' });
      for (const [i, [plugin, params]] of CADENA_VOZ.entries()) await ex('mix.insert', { track: 'Voz', slot: i, plugin, params });
      const pistas = ['Voz'];
      if (musica && fs.existsSync(musica)) {
        const mus = path.join(tmp, 'musica.wav');
        await correr(ffmpeg(), ['-v', 'error', '-y', '-i', musica, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s24le', mus]);
        await ex('track.new', { name: 'Musica', format: 'stereo' });
        await sc('import_audio', { path: mus, track: 'Musica' });
        // la automatización manda sobre el fader: el ducking sube/baja la música alrededor de cada tramo con voz
        for (const [t, v] of puntosDucking(tramosVoz(palabras))) await ex('automation.set_point', { track: 'Musica', param: 'volume', at: { seconds: t }, value: v });
        pistas.push('Musica');
      }
      const master = (await ex('track.new', { kind: 'master', format: 'stereo' }))?.tracks?.[0] ?? 'Master 1';
      let techo = Math.min(-0.5, picoMax - 0.5);
      await ex('mix.insert', { track: master, slot: 0, plugin: 'maximizer', params: { threshold: -3, ceiling: techo, release: 80 } });
      let r = null, vueltas = 0;
      for (; vueltas < 4; vueltas++) {
        progreso(`ajustando a ${lufs} LUFS (vuelta ${vueltas + 1})`);
        r = await sc('bounce_mix', { path: path.join(tmp, `b${vueltas}.wav`) });
        const dif = lufs - r.lufs, picoMal = r.true_peak_db > picoMax;
        if (Math.abs(dif) <= 0.5 && !picoMal) break;
        if (Math.abs(dif) > 0.5) await ex('mix.volume', { tracks: ['Voz'], delta_db: +dif.toFixed(2) });
        if (picoMal) { techo = Math.max(-6, techo - (r.true_peak_db - picoMax + 0.2)); await ex('mix.insert_param', { track: master, slot: 0, param: 'ceiling', value: +techo.toFixed(2) }); }
      }
      fs.mkdirSync(path.dirname(salida), { recursive: true });
      fs.copyFileSync(path.join(tmp, `b${Math.min(vueltas, 3)}.wav`), salida);
      try { await ex('session.close', {}); } catch { }
      return { wav: salida, lufs: +r.lufs.toFixed(1), picoReal: +r.true_peak_db.toFixed(1), vueltas: Math.min(vueltas + 1, 4), pistas };
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
  }

  // vídeo + WAV nuevo → vídeo con el audio cambiado (la imagen se copia tal cual, sin recomprimir)
  async function aplicarAVideo(video, wav, salida) {
    const parcial = salida + '.tmp.mp4';
    await correr(ffmpeg(), ['-v', 'error', '-y', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', parcial]);
    fs.renameSync(parcial, salida);
    return salida;
  }

  const HERRAMIENTA = {
    nombre: 'masterizar_audio', riesgo: 'escritura',
    descripcion: 'Audio de estudio con SoundCraft (receta fija y probada): limpia y masteriza la voz/mezcla de un vídeo o audio (paso alto, menos "caja", presencia, de-esser, compresión suave, maximizer) '
      + 'y la deja en el objetivo de redes (−14 LUFS, pico real ≤ −1 dBTP; o el del kit). Con "musica", la pone debajo y BAJA sola cuando se habla (ducking). '
      + 'Si la entrada es un vídeo, devuelve el vídeo con el audio nuevo (la imagen no se recomprime).',
    parametros: { type: 'object', properties: {
      entrada: { type: 'string', description: 'vídeo o audio' },
      musica: { type: 'string', description: 'música de fondo opcional (se baja sola bajo la voz)' },
      salida: { type: 'string', description: 'ruta de salida (por defecto "<nombre> (master).wav/.mp4" junto a la entrada)' },
      lufs: { type: 'number', description: 'objetivo de sonoridad (−14 redes, −16 podcast, −23 emisión)' },
      kit: { type: 'string', description: 'kit de marca del que salen los objetivos' },
    }, required: ['entrada'] },
    resumen: a => path.basename(String(a.entrada || '')),
    disponible: () => !!mcpLocales.obtener('soundcraft')?.activo,
    ejecutar: async (a, ctx = {}) => {
      const k = a.kit ? require('./kit').crearKits({ cfg }).obtener(a.kit) : null;
      const ent = path.resolve(ctx.cwd || os.homedir(), String(a.entrada || ''));
      const esVideo = /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(ent);
      const base = path.join(path.dirname(ent), `${path.basename(ent, path.extname(ent))} (master)`);
      const salida = a.salida ? path.resolve(ctx.cwd || os.homedir(), a.salida) : base + (esVideo ? '.mp4' : '.wav');
      let palabras = null;
      if (a.musica) {                                   // los tramos con voz salen de Whisper (para el ducking)
        ctx.progreso?.('transcribiendo para saber cuándo se habla');
        try { palabras = (await require('./subtitular').transcribir(ent, { python: cfg?.craft?.python, modelo: cfg?.craft?.whisper || 'large-v3', gpu: cfg?.craft?.gpu !== false }))?.palabras || null; } catch { }
      }
      const r = await masterizar({ entrada: ent, salida: esVideo ? base + '.wav' : salida, lufs: a.lufs ?? k?.audio?.lufs ?? -14, picoMax: k?.audio?.picoMax ?? -1,
        musica: a.musica && path.resolve(ctx.cwd || os.homedir(), a.musica), palabras, progreso: t => ctx.progreso?.(t) });
      if (esVideo) { await aplicarAVideo(ent, r.wav, salida); try { fs.rmSync(r.wav, { force: true }); } catch { } }
      return `Masterizado: ${salida}\n${r.lufs} LUFS · pico real ${r.picoReal} dBTP · ${r.vueltas} vuelta(s) de ajuste${r.pistas.includes('Musica') ? ' · música con ducking bajo la voz' : ''}`;
    },
  };

  return { masterizar, aplicarAVideo, HERRAMIENTA };
}

module.exports = { crearAudio, tramosVoz, puntosDucking, CADENA_VOZ };
