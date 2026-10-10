// Micrófono y notas de voz SIN Python: whisper.cpp (whisper-cli.exe) + grabadora propia (tools/grabar.ps1, waveIn).
// La primera vez descarga el programa (~9 MB, GitHub) y el modelo (small q5_1, ~190 MB, Hugging Face) a <datos>/whisper,
// en segundo plano. Solo Windows x64 (los binarios oficiales); en otros sistemas disponible() = false.
//   const w = crearWhisperCpp({ dir: () => carpeta, idioma, vocabulario })
//   w.preparar()                     → Promise<bool> (descarga si falta; una sola vez a la vez)
//   w.escuchar()                     → {text, conf} | {text:'', conf:0, error}
//   w.transcribir(ruta)              → {text, conf, idioma} (ogg/opus/m4a necesitan ffmpeg en el PATH)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { fuera } = require('../core/rutas');

const VERSION = 'b5454';
const ZIP = `https://github.com/ggml-org/whisper.cpp/releases/download/${VERSION}/whisper-bin-x64.zip`;
const MODELOS = {
  small: { archivo: 'ggml-small-q5_1.bin', bytes: 190085487 },
  base: { archivo: 'ggml-base-q5_1.bin', bytes: 59707625 },
};
const URL_MODELO = f => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${f}`;
const DIRECTOS = /\.(wav|mp3|flac)$/i;                         // lo que whisper-cli decodifica solo (miniaudio)
const RAIZ = path.join(__dirname, '..');

async function bajar(url, destino, bytes) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} al descargar ${path.basename(destino)}`);
  const tmp = destino + '.part';
  const out = fs.createWriteStream(tmp);
  try {
    for await (const trozo of r.body) if (!out.write(trozo)) await new Promise(ok => out.once('drain', ok));
  } finally { await new Promise(ok => out.end(ok)); }
  if (bytes && fs.statSync(tmp).size !== bytes) { fs.rmSync(tmp, { force: true }); throw new Error(`descarga incompleta de ${path.basename(destino)}`); }
  fs.renameSync(tmp, destino);
}

function crearWhisperCpp({ dir, idioma = () => 'es', vocabulario = () => '', modelo = () => 'small' }) {
  const disponible = process.platform === 'win32' && process.arch === 'x64';
  const rutas = () => {
    const d = dir(), m = MODELOS[modelo()] || MODELOS.small;
    return { d, exe: path.join(d, 'bin', 'whisper-cli.exe'), modelo: path.join(d, m.archivo), m };
  };
  const listo = () => { if (!disponible) return false; const r = rutas(); return fs.existsSync(r.exe) && fs.existsSync(r.modelo); };

  let preparando = null, falloHasta = 0;                        // si la descarga falla, 5 min antes de reintentar
  function preparar() {
    if (!disponible) return Promise.resolve(false);
    if (listo()) return Promise.resolve(true);
    if (Date.now() < falloHasta) return Promise.resolve(false);
    return preparando ||= (async () => {
      const r = rutas();
      fs.mkdirSync(r.d, { recursive: true });
      if (!fs.existsSync(r.exe)) {
        console.log('[whisper.cpp] descargando el programa…');
        const zip = path.join(r.d, 'whisper.zip'), tmp = path.join(r.d, 'zip');
        await bajar(ZIP, zip);
        fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
        // el tar.exe de Windows 10/11 abre .zip (el de Git, si va antes en el PATH, no: toma "C:" por un host remoto)
        const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
        await new Promise((ok, mal) => execFile(tar, ['-xf', zip, '-C', tmp], { windowsHide: true }, e => e ? mal(new Error('no se pudo descomprimir: ' + e.message)) : ok()));
        const rel = path.join(tmp, 'Release'), bin = path.join(r.d, 'bin');
        fs.mkdirSync(bin, { recursive: true });
        for (const f of fs.readdirSync(rel)) if (f === 'whisper-cli.exe' || /^(whisper|ggml.*)\.dll$/i.test(f)) fs.copyFileSync(path.join(rel, f), path.join(bin, f));
        fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
      }
      if (!fs.existsSync(r.modelo)) {
        console.log(`[whisper.cpp] descargando el modelo ${r.m.archivo} (~${Math.round(r.m.bytes / 1e6)} MB)…`);
        await bajar(URL_MODELO(r.m.archivo), r.modelo, r.m.bytes);
      }
      console.log('[whisper.cpp] listo');
      return listo();
    })().catch(e => { console.error('[whisper.cpp]', e.message); falloHasta = Date.now() + 300_000; return false; }).finally(() => { preparando = null; });
  }

  // whisper-cli → JSON completo (tokens con probabilidad): conf = media de p sin los tokens especiales
  function cli(audio, lengua) {
    const r = rutas();
    const base = path.join(os.tmpdir(), `robot-whisper-${process.pid}-${Date.now()}`);
    const args = ['-m', r.modelo, '-f', audio, '-l', lengua, '-np', '-ojf', '-of', base,
      '-t', String(Math.min(8, os.cpus().length || 4))];
    const voc = vocabulario(); if (voc) args.push('--prompt', voc);
    return new Promise((ok, mal) => execFile(r.exe, args, { windowsHide: true, timeout: 120_000 }, err => {
      let j; try { j = JSON.parse(fs.readFileSync(base + '.json', 'utf8')); } catch { }
      try { fs.rmSync(base + '.json', { force: true }); } catch { }
      if (!j) return mal(new Error('whisper.cpp: ' + (err ? err.message.split('\n')[0] : 'sin resultado')));
      const segs = j.transcription || [];
      const toks = segs.flatMap(s => s.tokens || []).filter(t => !/^\[_/.test(t.text));
      ok({
        text: segs.map(s => s.text).join('').trim(),
        conf: toks.length ? Math.round(toks.reduce((a, t) => a + (t.p || 0), 0) / toks.length * 100) / 100 : 0,
        idioma: j.result?.language || lengua,
      });
    }));
  }

  // ogg/opus (Telegram, WhatsApp) y m4a: whisper-cli no los abre → a WAV con ffmpeg si lo hay
  function aWav(ruta) {
    if (DIRECTOS.test(ruta)) return Promise.resolve({ ruta, borrar: false });
    const wav = path.join(os.tmpdir(), `robot-whisper-${process.pid}-${Date.now()}.wav`);
    return new Promise((ok, mal) => execFile('ffmpeg', ['-loglevel', 'error', '-y', '-i', ruta, '-ar', '16000', '-ac', '1', wav], { windowsHide: true, timeout: 60_000 },
      e => e ? mal(new Error(e.code === 'ENOENT' ? 'este formato de audio necesita ffmpeg (o la voz con Python)' : 'ffmpeg: ' + e.message.split('\n')[0])) : ok({ ruta: wav, borrar: true })));
  }

  async function transcribir(ruta) {
    if (!await preparar()) return { text: '', conf: 0, error: 'whisper.cpp no está disponible' };
    let a;
    try {
      a = await aWav(ruta);
      const app = (idioma() || 'es').slice(0, 2);
      const r = await cli(a.ruta, 'auto');
      // los audios cortos confunden idiomas parecidos (es/pt/gl): si salió otro, se repite en el de la app y gana el más seguro
      if (r.idioma && r.idioma !== app) { const r2 = await cli(a.ruta, app); if (r2.conf >= r.conf) return r2; }
      return r;
    } catch (e) { return { text: '', conf: 0, error: e.message }; }
    finally { if (a?.borrar) try { fs.rmSync(a.ruta, { force: true }); } catch { } }
  }

  // ---------- grabadora persistente (tools/grabar.ps1): se arranca al usar el micro y se cierra tras 2 min sin uso ----------
  let rec = null, recListo = null, espera = null, buf = '', apagar = null;
  function grabadora() {
    if (rec) return recListo;
    rec = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fuera(path.join(RAIZ, 'tools', 'grabar.ps1'))], { windowsHide: true });
    recListo = new Promise(ok => {
      rec.stdout.setEncoding('utf8');
      rec.stdout.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          let j; try { j = JSON.parse(linea); } catch { continue; }
          if (j.listo) { ok(true); continue; }
          if (espera) { const w = espera; espera = null; w(j); }
        }
      });
      rec.on('error', () => ok(false));
      rec.on('exit', () => { ok(false); rec = null; if (espera) { const w = espera; espera = null; w({ error: 'la grabadora se cerró' }); } });
    });
    return recListo;
  }
  function apagarLuego() { clearTimeout(apagar); apagar = setTimeout(() => { try { rec && rec.kill(); } catch { } }, 120_000); apagar.unref?.(); }

  async function escuchar() {
    if (!listo()) { preparar(); return { text: '', conf: 0, error: 'descargando el reconocimiento de voz, prueba en un minuto' }; }
    if (espera || !await grabadora()) return { text: '', conf: 0, error: 'no se pudo usar el micrófono' };
    apagarLuego();
    const wav = path.join(os.tmpdir(), `robot-mic-${process.pid}-${Date.now()}.wav`);
    const g = await new Promise(ok => { espera = ok; rec.stdin.write('grabar ' + wav + '\n'); });
    if (g.error) return { text: '', conf: 0, error: g.error };
    if (!g.ok) return { text: '', conf: 0 };
    try { const r = await cli(wav, (idioma() || 'es').slice(0, 2)); return { text: r.text, conf: r.conf }; }
    catch (e) { return { text: '', conf: 0, error: e.message }; }
    finally { try { fs.rmSync(wav, { force: true }); } catch { } }
  }

  return { disponible, listo, preparar, escuchar, transcribir, cerrar() { try { rec && rec.kill(); } catch { } } };
}

module.exports = { crearWhisperCpp };
