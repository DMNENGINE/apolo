// Estudio de vídeo (#/estudio-video): servicio local propio del usuario (estudio.py sobre ComfyUI) que el panel muestra en un iframe.
// Solo existe en las PCs que lo tienen instalado: disponible() mira que estén el Python y el script; si no, la pestaña no sale.
// Rutas en cfg.estudioVideo { python, script, puerto }; por defecto, las de la PC donde se hizo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const conf = (cfg = {}) => ({
  python: path.join(os.homedir(), 'ComfyUI', 'venv', 'Scripts', 'python.exe'),
  script: 'D:\\modelo-virtual\\video\\estudio\\estudio.py',
  puerto: 8190,
  ...(cfg.estudioVideo || {}),
});
const disponible = cfg => { const c = conf(cfg); return fs.existsSync(c.python) && fs.existsSync(c.script); };

function salud(puerto) {
  return new Promise((ok, mal) => {
    const req = http.get(`http://127.0.0.1:${puerto}/health`, { timeout: 1000 }, res => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => { try { if (JSON.parse(b).service !== 'apolo-video-studio') throw Error(`Puerto ${puerto} ocupado por otro servicio`); ok(); } catch (e) { mal(e); } });
    });
    req.on('timeout', () => req.destroy(Error('tiempo agotado'))); req.on('error', mal);
  });
}
const noResponde = e => ['ECONNREFUSED', 'ECONNRESET'].includes(e.code);

async function arrancar(c) {
  try { await salud(c.puerto); return; } catch (e) { if (!noResponde(e)) throw e; }
  const hijo = spawn(c.python, ['-X', 'utf8', c.script], { windowsHide: true, detached: true, stdio: 'ignore' });
  let fallo; hijo.on('error', e => fallo = e); hijo.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (fallo) throw fallo;
    try { await salud(c.puerto); return; } catch (e) { if (!noResponde(e)) throw e; }
  }
  throw Error('No arrancó estudio.py; revisa el Python de ComfyUI.');
}

let enCurso = null;
async function abrir(cfg) {
  const c = conf(cfg);
  if (!disponible(cfg)) throw Object.assign(Error('El estudio de vídeo no está instalado en esta PC'), { status: 404 });
  if (!enCurso) enCurso = arrancar(c).finally(() => { enCurso = null; });
  await enCurso;
  return { url: `http://127.0.0.1:${c.puerto}/` };
}

module.exports = { abrir, disponible };
