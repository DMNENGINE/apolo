// Voz del robot (proceso principal):
// - TTS: 1) Fish Audio (si hay key y voz en %APPDATA%\robot-companion\voz.json) 2) voz local OmniVoice en la GPU
//   (tools/tts_srv.py, si existe <datos>/tts/venv y hay VRAM libre) 3) voz neural de Edge (main/edge-tts.js, sin Python;
//   si falla, el paquete Python edge-tts) 4) null → la isla usa la voz de Windows. Todo en mp3 con caché por texto.
// - Oído: 1) Whisper en Python (servidor persistente, bajo demanda) si está instalado 2) whisper.cpp (main/whisper-cpp.js,
//   sin Python: se descarga solo) 3) el reconocedor de Windows (listen.ps1).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { fuera } = require('../core/rutas');
const { sintetizar } = require('./edge-tts');
const { crearWhisperCpp } = require('./whisper-cpp');

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
  // voz de Edge desde Node (sin Python); si falla (red, proxy…), el paquete Python edge-tts si está instalado
  const edgeTts = (text, f, VOZ_TTS = VOZ_TTS_IDIOMA.es) => sintetizar(text, f, VOZ_TTS).then(() => f, e => {
    console.error('[voz] edge-tts nativo falló:', e.message);
    return edgeTtsPython(text, f, VOZ_TTS);
  });
  const edgeTtsPython = (text, f, VOZ_TTS) => new Promise(ok => {
    const p = spawn('python', ['-m', 'edge_tts', '--voice', VOZ_TTS.voz, '--rate=' + VOZ_TTS.rate, '--pitch=' + VOZ_TTS.pitch, '--text', text, '--write-media', f], { windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch { } ok(null); }, 12_000);
    p.on('error', () => { clearTimeout(t); ok(null); });
    p.on('exit', c => { clearTimeout(t); ok(c === 0 && fs.existsSync(f) ? f : null); });
  });
  // ---------- Voz local: OmniVoice (k2-fsa, Apache-2.0) en la GPU, sin internet (tools/tts_srv.py) ----------
  // Usa el venv <datos>/tts/venv (con --system-site-packages: reutiliza el torch global sin tocarlo). Pensada para no
  // estorbar a Ollama/ComfyUI: solo arranca con ≥ 4,5 GB de VRAM libres (pico real ~4 GB), la 1.ª frase (mientras carga, ~15 s) sale por
  // edge-tts, cada frase tiene 8 s o va por edge-tts, 2 lentas seguidas = se apaga 5 min, y se descarga tras 5 min sin uso.
  // La voz es fija: <datos>/tts/voz-apolo.wav (+ .txt); para cambiarla, pon ahí otro wav de 3-10 s. voz.json "vozLocal": false la apaga.
  const TTS_DIR = () => path.join(dirDatos(), 'tts');
  const ttsPython = () => path.join(TTS_DIR(), 'venv', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  const MODELO_LOCAL_CACHE = path.join(process.env.HF_HOME || path.join(os.homedir(), '.cache', 'huggingface'), 'hub', 'models--k2-fsa--OmniVoice');
  let local = null, localListo = false, localBuf = '', localId = 0, localApagar = null, localFalloHasta = 0, localLentas = 0;
  const localEsperas = new Map();
  const localDisponible = () => VOZ_CFG().vozLocal !== false && fs.existsSync(ttsPython());
  const vramLibre = () => new Promise(ok => execFile('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 },
    (e, out) => ok(e ? 0 : parseInt(String(out).trim().split(/\r?\n/)[0], 10) || 0)));
  // GPU trabajando para otro (ComfyUI generando ≈ 95 %): la voz local tardaría 6-7 s → edge-tts directo. Se mira como
  // mucho cada 15 s y solo cuando NO estamos generando nosotros (si no, el 85 % sería nuestro).
  let gpuMirada = 0, gpuOcupadaUlt = false;
  const gpuOcupada = () => {
    if (Date.now() - gpuMirada < 15_000 || localEsperas.size) return Promise.resolve(gpuOcupadaUlt);
    gpuMirada = Date.now();
    return new Promise(ok => execFile('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 3000 },
      (e, out) => ok(gpuOcupadaUlt = !e && (parseInt(String(out).trim().split(/\r?\n/)[0], 10) || 0) >= 85)));
  };
  function apagarLocal(motivo, pausaMs = 0) {
    if (pausaMs) localFalloHasta = Date.now() + pausaMs;
    if (local) { console.log('[voz] voz local descargada:', motivo); try { local.kill(); } catch { } }
  }
  function apagarLocalLuego() { clearTimeout(localApagar); localApagar = setTimeout(() => apagarLocal('5 min sin uso'), 300_000); localApagar.unref?.(); }
  let arrancando = false;
  async function arrancarLocal() {
    if (local || arrancando || !localDisponible() || Date.now() < localFalloHasta) return;
    arrancando = true;
    try {
      const libre = await vramLibre();
      if (libre < 4500) { localFalloHasta = Date.now() + 60_000; console.log(`[voz] GPU con ${libre} MB libres: voz local en pausa`); return; }
      const env = { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', ROBOT_TTS_DIR: TTS_DIR() };
      if (fs.existsSync(MODELO_LOCAL_CACHE)) env.HF_HUB_OFFLINE = '1';          // ya descargado: sin consultar internet al cargar
      const p = local = spawn(ttsPython(), [fuera(path.join(RAIZ, 'tools', 'tts_srv.py'))], { windowsHide: true, env });
      localBuf = '';
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', d => {
        localBuf += d; let i;
        while ((i = localBuf.indexOf('\n')) >= 0) {
          const line = localBuf.slice(0, i).trim(); localBuf = localBuf.slice(i + 1);
          let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.ready) { localListo = true; console.log('[voz] voz local lista (OmniVoice)'); apagarLocalLuego(); continue; }
          const w = localEsperas.get(j.id); if (w) { localEsperas.delete(j.id); w(j); }
        }
      });
      p.stderr.on('data', () => { });                                         // barras de progreso de transformers
      const fin = () => {
        if (local !== p) return;
        if (!localListo) localFalloHasta = Date.now() + 300_000;              // no arrancó: 5 min con edge-tts
        local = null; localListo = false;
        for (const w of localEsperas.values()) w({ ok: false }); localEsperas.clear();
      };
      p.on('error', fin); p.on('exit', fin);
    } finally { arrancando = false; }
  }
  async function ttsLocal(text, f) {
    if (!localDisponible()) return false;
    if (!localListo) { arrancarLocal(); return false; }                       // esta frase por edge-tts; la siguiente ya en local
    apagarLocalLuego();
    if (await gpuOcupada()) return false;                                    // GPU ocupada por otro: no esperar, edge-tts
    return new Promise(ok => {
      const id = ++localId;
      const t = setTimeout(() => {
        localEsperas.delete(id); console.error('[voz] voz local tardó > 8 s (¿GPU ocupada?): edge-tts');
        if (++localLentas >= 2) { localLentas = 0; apagarLocal('GPU ocupada', 300_000); }
        ok(false);
      }, 8000);
      localEsperas.set(id, r => { clearTimeout(t); if (r.ok) localLentas = 0; ok(!!r.ok && fs.existsSync(f)); });
      try { local.stdin.write(JSON.stringify({ id, texto: text, salida: f, idioma: idioma() || 'es' }) + '\n'); }
      catch { localEsperas.delete(id); clearTimeout(t); ok(false); }
    });
  }

  async function generarTts(text) {
    text = String(text || '').slice(0, 600); if (!text.trim()) return null;
    const dir = path.join(os.tmpdir(), 'robot-tts'); try { fs.mkdirSync(dir, { recursive: true }); } catch { }
    const vc = VOZ_CFG();
    const VOZ_TTS = VOZ_TTS_IDIOMA[idioma()] || VOZ_TTS_IDIOMA.es;     // edge-tts con la voz del idioma elegido
    const firma = vc.apiKey && vc.voz ? 'fish' + vc.voz + (vc.modelo || '') : VOZ_TTS.voz + VOZ_TTS.rate + VOZ_TTS.pitch;
    const f = path.join(dir, crypto.createHash('sha1').update(firma + text).digest('hex').slice(0, 16) + '.mp3');
    if (fs.existsSync(f)) return f;
    if (await ttsFish(vc, text, f)) return f;
    if (localDisponible()) {                                            // voz local (misma voz siempre; caché propia)
      let refMs = 0; try { refMs = fs.statSync(path.join(TTS_DIR(), 'voz-apolo.wav')).mtimeMs; } catch { }
      const fl = path.join(dir, crypto.createHash('sha1').update('omnivoice' + refMs + (idioma() || 'es') + text).digest('hex').slice(0, 16) + '.mp3');
      if (fs.existsSync(fl)) return fl;
      if (await ttsLocal(text, fl)) return fl;
    }
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
  // sin Python (o sin faster-whisper): whisper.cpp; el modelo se elige en voz.json "whisperModelo": "small" | "base"
  const wcpp = crearWhisperCpp({ dir: () => path.join(dirDatos(), 'whisper'), idioma, vocabulario, modelo: () => VOZ_CFG().whisperModelo || 'small' });
  let sinPython = false;                                        // el Whisper de Python se cerró sin arrancar: no reintentar
  let whisper = null, whisperReady = false, whisperWait = null, whisperBuf = '';
  function startWhisper() {
    try {
      whisper = spawn('python', [fuera(path.join(RAIZ, 'tools', 'whisper_srv.py'))], { windowsHide: true, env: { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONIOENCODING: 'utf-8',
        ROBOT_WHISPER_IDIOMA: idioma() || 'es', ROBOT_WHISPER_PROMPT: vocabulario() } });
    } catch { sinPython = true; return; }
    whisper.on('error', () => { sinPython = true; whisperReady = false; whisper = null; });   // sin python en el PATH (no llega 'exit')
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
    whisper.on('exit', () => {
      if (!whisperReady && !sinPython) { sinPython = true; console.log('[whisper] sin Whisper de Python: se usa whisper.cpp'); }
      whisperReady = false; whisper = null;
    });
  }
  // Whisper bajo demanda: se carga al pulsar el micro (o Ctrl+Alt+Espacio) y se descarga tras 2 min sin usarlo (~660 MB)
  let whisperApagar = null;
  function whisperListo(ms = 25_000) {
    if (whisperReady) return Promise.resolve(true);
    if (sinPython) return Promise.resolve(false);
    if (!whisper) startWhisper();
    return new Promise(ok => { const t0 = Date.now(); const iv = setInterval(() => { if (whisperReady || !whisper || Date.now() - t0 > ms) { clearInterval(iv); ok(whisperReady); } }, 100); });
  }
  function apagarWhisperLuego() { clearTimeout(whisperApagar); whisperApagar = setTimeout(() => { try { whisper && whisper.kill(); console.log('[whisper] descargado (sin uso)'); } catch { } }, 120_000); }
  // notas de voz (Telegram / WhatsApp / móvil / ojo): una a una por la misma instancia de Whisper
  let colaWhisper = Promise.resolve();
  function transcribirArchivo(ruta) {
    const tarea = colaWhisper.then(async () => {
      if (!await whisperListo(60_000)) {
        if (wcpp.disponible) return wcpp.transcribir(ruta);
        return { text: '', error: 'Whisper no está disponible (¿Python y faster-whisper instalados?)' };
      }
      apagarWhisperLuego();
      while (whisperWait) await new Promise(ok => setTimeout(ok, 200));          // si estás usando el micro, espera
      return new Promise(ok => { whisperWait = ok; whisper.stdin.write('file ' + ruta + '\n'); setTimeout(() => { if (whisperWait === ok) { whisperWait = null; ok({ text: '', error: 'tiempo agotado' }); } }, 120_000); });
    });
    colaWhisper = tarea.catch(() => { });
    return tarea;
  }
  // reuniones: trozo de audio de "ellos" → [{ini, fin, hablante: 'persona N', texto}] (misma cola que las notas de voz).
  // {segmentos: null} si no hay Whisper de Python o faltan los modelos de hablantes: core/reuniones usa la vía de siempre.
  function transcribirHablantes(ruta, reunion) {
    const tarea = colaWhisper.then(async () => {
      if (!await whisperListo(60_000)) return { segmentos: null, error: 'Whisper de Python no disponible' };
      apagarWhisperLuego();
      while (whisperWait) await new Promise(ok => setTimeout(ok, 200));
      return new Promise(ok => {
        whisperWait = ok; whisper.stdin.write('hablantes ' + JSON.stringify({ ruta, reunion: String(reunion || '') }) + '\n');
        setTimeout(() => { if (whisperWait === ok) { whisperWait = null; ok({ segmentos: null, error: 'tiempo agotado' }); } }, 120_000);
      });
    });
    colaWhisper = tarea.catch(() => { });
    return tarea;
  }
  const listenWhisper = modo =>
    new Promise(ok => { whisperWait = ok; whisper.stdin.write(modo === 'llamada' ? 'listen rapido\n' : 'listen\n'); setTimeout(() => { if (whisperWait === ok) { whisperWait = null; ok({ text: '', conf: 0 }); } }, 30000); });
  const listenWindows = () => (process.platform !== 'win32' ? Promise.resolve({ text: '', conf: 0, error: 'sin Whisper: bandeja → Instalar voz y micrófono' }) : new Promise(ok => execFile('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fuera(path.join(RAIZ, 'tools', 'listen.ps1'))],
    { windowsHide: true, timeout: 15000 }, (err, out) => { try { ok(JSON.parse(String(out).trim())); } catch { ok({ text: '', conf: 0, error: err ? err.message : 'sin respuesta' }); } })));
  // micrófono de la isla: Whisper de Python si carga; si no whisper.cpp; mientras se descarga (o sin él), el reconocedor de Windows
  // modo 'llamada' (llamada de la isla): corta tras menos silencio y transcribe con beam 1 (≈2× más rápido)
  async function escuchar(modo) {
    arrancarLocal();                                              // mientras hablas, se carga la voz local para la respuesta
    const ok = await whisperListo(); apagarWhisperLuego();
    if (ok && !whisperWait) return listenWhisper(modo);
    if (wcpp.disponible && wcpp.listo()) return wcpp.escuchar();
    if (wcpp.disponible) wcpp.preparar();
    return listenWindows();
  }
  // al arrancar: si no hay Whisper de Python, se baja whisper.cpp en segundo plano para que el micro ya esté listo
  if (wcpp.disponible && !wcpp.listo()) setTimeout(() => execFile('python', ['-c', 'import faster_whisper, sounddevice'], { windowsHide: true, timeout: 30_000 },
    e => { if (e) { sinPython = true; wcpp.preparar(); } }), 20_000).unref?.();

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
    generarTts, transcribirArchivo, transcribirHablantes, escuchar, leerVocabulario, guardarVocabulario,
    whisperCargado: () => whisperReady || (sinPython && wcpp.listo()),
    cerrar() { try { whisper && whisper.kill(); } catch { } apagarLocal('cierre'); wcpp.cerrar(); },
  };
}

module.exports = { crearVoz };
