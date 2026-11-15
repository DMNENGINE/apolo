// Estudio de vídeo (#/estudio-video): web local (estudio.py sobre ComfyUI) que el panel muestra en un iframe.
// De dónde sale, por orden: cfg.estudioVideo { python, script, puerto } → el estudio propio de la PC del autor (si existe)
// → la skill estudio-creativo de la Biblioteca DMN (scripts/estudio.py + el Python de ComfyUI que deja al prepararse).
// La pestaña sale si hay estudio o si la skill está instalada (entonces explica qué falta); si no, no sale.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PROPIO = () => ({ python: path.join(os.homedir(), 'ComfyUI', 'venv', 'Scripts', 'python.exe'), script: 'D:\\modelo-virtual\\video\\estudio\\estudio.py', puerto: 8190 });
const existe = f => !!f && fs.existsSync(f);

function conf(cfg = {}) {
  if (cfg.estudioVideo) return { puerto: 8190, ...cfg.estudioVideo, origen: 'config' };
  const propio = PROPIO();
  if (existe(propio.python) && existe(propio.script)) return { ...propio, origen: 'propio' };
  const dir = path.join(cfg.dir || '', 'skills', 'estudio-creativo');
  let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(dir, '_datos', 'config.json'), 'utf8').replace(/^\uFEFF/, '')); } catch { }
  return { python: c.comfy_python || '', script: path.join(dir, 'scripts', 'estudio.py'), puerto: Number(c.estudio_puerto) || 8190, origen: 'skill', skill: existe(path.join(dir, 'SKILL.md')) };
}
const disponible = cfg => { const c = conf(cfg); return existe(c.python) && existe(c.script); };

// Para el panel: ¿sale la pestaña? y, si no hay estudio, qué le falta al usuario.
function estado(cfg) {
  const c = conf(cfg);
  if (existe(c.python) && existe(c.script)) return { disponible: true, visible: true };
  if (c.origen !== 'skill' || !c.skill) return { disponible: false, visible: c.origen === 'config', motivo: c.origen === 'config' ? 'Las rutas de estudioVideo en config.json no existen.' : '' };
  if (!existe(c.script)) return { disponible: false, visible: true, motivo: 'Tu skill estudio-creativo es antigua: actualízala (la 1.1.0 trae el estudio).' };
  return { disponible: false, visible: true, motivo: 'Falta preparar estudio-creativo: Skills → Biblioteca DMN → estudio-creativo → Preparar.' };
}

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
  throw Error('No arrancó estudio.py; revisa el Python de ComfyUI (vuelve a preparar estudio-creativo).');
}

let enCurso = null;
async function abrir(cfg) {
  const c = conf(cfg);
  if (!disponible(cfg)) throw Object.assign(Error(estado(cfg).motivo || 'El estudio de vídeo no está instalado en esta PC.'), { status: 404 });
  if (!enCurso) enCurso = arrancar(c).finally(() => { enCurso = null; });
  await enCurso;
  return { url: `http://127.0.0.1:${c.puerto}/` };
}

module.exports = { abrir, disponible, estado, conf };
