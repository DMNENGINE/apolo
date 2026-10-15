// Utilidades compartidas: dónde está APOLO (token, API, Electron) en Windows, macOS y Linux.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const datos = () => {
  const c = [process.env.APOLO_DATOS, process.env.APPDATA && path.join(process.env.APPDATA, 'robot-companion', 'nucleo'),
    path.join(os.homedir(), 'Library', 'Application Support', 'robot-companion', 'nucleo'), path.join(os.homedir(), '.config', 'robot-companion', 'nucleo')].filter(Boolean);
  return c.find(d => fs.existsSync(path.join(d, 'token'))) || null;
};
const token = () => { const d = datos(); if (!d) throw new Error('no encuentro los datos de APOLO (¿está instalado y abierto?)'); return fs.readFileSync(path.join(d, 'token'), 'utf8').trim(); };
const BASE = process.env.APOLO_URL || 'http://127.0.0.1:47900';
async function api(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + '/v1' + ruta, { method: metodo, headers: { 'x-robot-token': token(), 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j;
}
function electron() {
  const c = [process.env.APOLO_ELECTRON, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'APOLO', 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'),
    path.join(os.homedir(), '.local', 'share', 'apolo', 'node_modules', 'electron', 'dist', 'electron')].filter(Boolean);
  return c.find(f => fs.existsSync(f)) || null;
}
module.exports = { datos, token, api, electron, BASE };
