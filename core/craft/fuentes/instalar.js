// Instala las fuentes propias (Trueno) para el usuario actual si faltan: sin admin, en %LOCALAPPDATA%\Microsoft\Windows\Fonts
// + su entrada en HKCU (así las ven FilmCraft y el resto de apps). En macOS/Linux, ~/Library/Fonts o ~/.local/share/fonts.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const FUENTES = [['Trueno-Black.ttf', 'Trueno (TrueType)'], ['Trueno-Regular.ttf', 'Trueno Regular (TrueType)']];

function asegurarFuentes({ dirOrigen = __dirname, ejecutar = execFileSync } = {}) {
  const destino = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Fonts') : path.join(os.homedir(), '.local', 'share', 'fonts');
  const instaladas = [];
  for (const [archivo, nombre] of FUENTES) {
    const origen = path.join(dirOrigen, archivo), final = path.join(destino, archivo);
    if (!fs.existsSync(origen)) continue;
    const igual = fs.existsSync(final) && fs.statSync(final).size === fs.statSync(origen).size;
    if (igual) continue;
    fs.mkdirSync(destino, { recursive: true });
    fs.copyFileSync(origen, final);
    if (process.platform === 'win32') ejecutar('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', nombre, '/t', 'REG_SZ', '/d', final, '/f'], { windowsHide: true, stdio: 'ignore' });
    instaladas.push(archivo);
  }
  return instaladas;
}

module.exports = { asegurarFuentes, FUENTES };
