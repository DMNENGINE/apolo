// Voz del robot (proceso principal):
// - TTS: 1) Fish Audio (si hay key y voz en %APPDATA%\robot-companion\voz.json) 2) edge-tts (Microsoft, voz del idioma)
//   3) null → la isla usa la voz de Windows. Todo en mp3 con caché por texto.
// - Oído: Whisper (servidor Python persistente, bajo demanda) con respaldo en el reconocedor de Windows (listen.ps1).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { fuera } = require('../core/rutas');

const VOZ_TTS_IDIOMA = { es: { voz: 'es-ES-AlvaroNeural', rate: '+8%', pitch: '+12Hz' }, en: { voz: 'en-US-AndrewNeural', rate: '+6%', pitch: '+8Hz' } };
const RAIZ = path.join(__dirname, '..');

// nombre() = nombre del compañero (para el vocabulario de Whisper)
function crearVoz({ dirDatos, idioma, nombre = () => 'APOLO' }) {
  const VOZ_CFG = () => { try { return JSON.parse(fs.readFileSync(path.join(dirDatos(), 'voz.json'), 'utf8')); } catch { return {}; } };
  let fishCaidoHasta = 0;                                       // si Fish falla, 5 min con edge-tts antes de reintentar
  async function ttsFish(cfg, text, f) {
    if (!cfg.apiKey || !cfg.voz || Date.now() < fishCaidoHasta) return false;
    try {
      const r = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json', model: cfg.modelo || 's2.1-pro-free' },
        body: JSON.stringify({ text, reference_id: cfg.voz, format: 'mp3' }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch (e) { console.error('[voz] Fish Audio falló:', e.message); fishCaidoHasta = Date.now() + 300_000; return false; }
  }
  const edgeTts = (text, f, VOZ_TTS = VOZ_TTS_IDIOMA.es) => new Promise(ok => {
    const p = spawn('python', ['-m', 'edge_tts', '--voice', VOZ_TTS.voz, '--rate=' + VOZ_TTS.rate, '--pitch=' + VOZ_TTS.pitch, '--text', text, '--write-media', f], { windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch { } ok(null); }, 12_000);
    p.on('error', () => { clearTimeout(t); ok(null); });
    p.on('exit', c => { clearTimeout(t); ok(c === 0 && fs.existsSync(f) ? f : null); });
  });
  async function generarTts(text) {
    text = String(text || '').slice(0, 600); if (!text.trim()) return null;
    const dir = path.join(os.tmpdir(), 'robot-tts'); try { fs.mkdirSync(dir, { recursive: true }); } catch { }
    const vc = VOZ_CFG();
    const VOZ_TTS = VOZ_TTS_IDIOMA[idioma()] || VOZ_TTS_IDIOMA.es;     // edge-tts con la voz del idioma elegido
    const firma = vc.apiKey && vc.voz ? 'fish' + vc.voz + (vc.modelo || '') : VOZ_TTS.voz + VOZ_TTS.rate + VOZ_TTS.pitch;
    const f = path.join(dir, crypto.createHash('sha1').update(firma + text).digest('hex').slice(0, 16) + '.mp3');
    if (fs.existsSync(f)) return f;
    if (await ttsFish(vc, text, f)) return f;
    const fe = path.join(dir, crypto.createHash('sha1').update(VOZ_TTS.voz + VOZ_TTS.rate + VOZ_TTS.pitch + text).digest('hex').slice(0, 16) + '.mp3');
    if (fs.existsSync(fe)) return fe;
    return edgeTts(text, fe, VOZ_TTS);
  }

  // ---------- Whisper (servidor Python persistente); respaldo: reconocedor de Windows ----------
  // vocabulario (initial_prompt): palabras fijas + nombre del compañero + tus proyectos + voz.json "vocabulario": [..]
  // (medido con 36 frases: 13,7 % → 10,5 % de palabras mal solo con las fijas; los nombres propios son lo que más falla)
  const FIJAS = ['Claude', 'ChatGPT', 'Gemma', 'Gemini', 'Telegram', 'WhatsApp', 'Discord', 'Stream Deck', 'Mission Control', 'Modo Gamer', 'panel', 'sesión', 'proyecto', 'terminal', 'memoria', 'tarea', 'resumen', 'consejo'];
  function vocabulario() {
    let proyectos = [], propias = [];
    try { proyectos = Object.keys(JSON.parse(fs.readFileSync(path.join(dirDatos(), 'proyectos.json'), 'utf8')).proyectos || {}); } catch { }
    try { propias = VOZ_CFG().vocabulario || []; } catch { }
    const todas = [...new Set([nombre(), ...propias, ...FIJAS, ...proyectos].map(x => String(x || '').trim()).filter(Boolean))];
    return todas.join(', ').slice(0, 600) + '.';   // initial_prompt: corto (Whisper usa como mucho ~224 tokens)
  }
  let whisper = null, whisperReady = false, whisperWait = null, whisperBuf = '';
  function startWhisper() {
    try {
      whisper = spawn('python', [fuera(path.join(RAIZ, 'tools', 'whisper_srv.py'))], { windowsHide: true, env: { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONIOENCODING: 'utf-8',
        ROBOT_WHISPER_IDIOMA: idioma() || 'es', ROBOT_WHISPER_PROMPT: vocabulario() } });
    } catch { return; }
    whisper.stdout.setEncoding('utf8');
    whisper.stdout.on('data', d => {
      whisperBuf += d; let i;
      while ((i = whisperBuf.indexOf('\n')) >= 0) {
        const line = whisperBuf.slice(0, i).trim(); whisperBuf = whisperBuf.slice(i + 1);
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.ready) { whisperReady = true; console.log('[whisper] listo en', j.device, j.model); continue; }
        if (whisperWait) { const w = whisperWait; whisperWait = null; w(j); }
      }
    });
    whisper.on('exit', () => { whisperReady = false; whisper = null; });
  }
  // Whisper bajo demanda: se carga al pulsar el micro (o Ctrl+Alt+Espacio) y se descarga tras 2 min sin usarlo (~660 MB)
  let whisperApagar = null;
  function whisperListo(ms = 25_000) {
    if (whisperReady) return Promise.resolve(true);
    if (!whisper) startWhisper();
    return new Promise(ok => { const t0 = Date.now(); const iv = setInterval(() => { if (whisperReady || !whisper || Date.now() - t0 > ms) { clearInterval(iv); ok(whisperReady); } }, 100); });
  }
  function apagarWhisperLuego() { clearTimeout(whisperApagar); whisperApagar = setTimeout(() => { try { whisper && whisper.kill(); console.log('[whisper] descargado (sin uso)'); } catch { } }, 120_000); }
  // notas de voz (Telegram / WhatsApp / móvil / ojo): una a una por la misma instancia de Whisper
  let colaWhisper = Promise.resolve();
  function transcribirArchivo(ruta) {
    const tarea = colaWhisper.then(async () => {
      if (!await whisperListo(60_000)) return { text: '', error: 'Whisper no está disponible (¿Python y faster-whisper instalados?)' };
      apagarWhisperLuego();
      while (whisperWait) await new Promise(ok => setTimeout(ok, 200));          // si estás usando el micro, espera
      return new Promise(ok => { whisperWait = ok; whisper.stdin.write('file ' + ruta + '\n'); setTimeout(() => { if (whisperWait === ok) { whisperWait = null; ok({ text: '', error: 'tiempo agotado' }); } }, 120_000); });
    });
    colaWhisper = tarea.catch(() => { });
    return tarea;
  }
  const listenWhisper = () =>
    new Promise(ok => { whisperWait = ok; whisper.stdin.write('listen\n'); setTimeout(() => { if (whisperWait === ok) { whisperWait = null; ok({ text: '', conf: 0 }); } }, 30000); });
  const listenWindows = () => (process.platform !== 'win32' ? Promise.resolve({ text: '', conf: 0, error: 'sin Whisper: bandeja → Instalar voz y micrófono' }) : new Promise(ok => execFile('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fuera(path.join(RAIZ, 'tools', 'listen.ps1'))],
    { windowsHide: true, timeout: 15000 }, (err, out) => { try { ok(JSON.parse(String(out).trim())); } catch { ok({ text: '', conf: 0, error: err ? err.message : 'sin respuesta' }); } })));
  // micrófono de la isla: Whisper si carga, si no el reconocedor de Windows
  async function escuchar() { const ok = await whisperListo(); apagarWhisperLuego(); return ok && !whisperWait ? listenWhisper() : listenWindows(); }

  // vocabulario propio (voz.json "vocabulario"); al cambiarlo se descarga Whisper: lo usa la próxima vez que se cargue
  function leerVocabulario() { return (VOZ_CFG().vocabulario || []).map(String); }
  function guardarVocabulario(lista) {
    const v = [...new Set((Array.isArray(lista) ? lista : String(lista || '').split(/[,\n]/)).map(x => String(x).trim()).filter(Boolean))].slice(0, 80).map(x => x.slice(0, 60));
    const f = path.join(dirDatos(), 'voz.json');
    let c = {}; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
    c.vocabulario = v; fs.writeFileSync(f, JSON.stringify(c, null, 2));
    try { whisper && whisper.kill(); } catch { }
    return v;
  }

  return {
    generarTts, transcribirArchivo, escuchar, leerVocabulario, guardarVocabulario,
    whisperCargado: () => whisperReady,
    cerrar() { try { whisper && whisper.kill(); } catch { } },
  };
}

module.exports = { crearVoz };
