// Linux (fase 1: terminales de Claude Code). Lo demás (ver la pantalla, manos, flujo, grabadora, Modo Gamer) sigue sin
// implementar: viene de sin-soporte.js con un mensaje claro. Plan completo en docs/portabilidad.md.
//
// destino de una sesión = { tmux: { pane, socket }, x11, nombre }
//  - tmux (lo fiable, también en Wayland): el hook manda TMUX_PANE y TMUX; las sesiones que abre APOLO van SIEMPRE dentro
//    de tmux, así luego se les puede escribir. Se escribe con load-buffer + paste-buffer -p (pegado entre corchetes: los
//    saltos de línea no envían el mensaje a medias) y después Enter.
//  - X11 sin tmux: WINDOWID de la terminal (xterm, konsole, xfce4-terminal… la ponen) + xdotool type. En Wayland no hay forma
//    estándar de escribir en otra ventana: se abre una sesión nueva (hablar.js ya lo hace cuando escribir falla).
const fs = require('fs');
const { execFile, spawn, spawnSync } = require('child_process');
const base = require('./sin-soporte')('linux');

const cacheCmd = new Map();
const hay = c => { if (!cacheCmd.has(c)) cacheCmd.set(c, spawnSync('sh', ['-c', `command -v ${c}`], { stdio: 'ignore' }).status === 0); return cacheCmd.get(c); };
const correr = (cmd, args, timeout = 8000) => new Promise((ok, mal) => execFile(cmd, args, { timeout }, (e, out, err) => (e ? mal(new Error(String(err || e.message).trim().split('\n')[0])) : ok(String(out || '').trim()))));
const grafico = () => !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const x11 = () => !!process.env.DISPLAY && process.env.XDG_SESSION_TYPE !== 'wayland';
// -S <socket> del servidor tmux de esa sesión (TMUX = "socket,pid,sesión")
const tmuxArgs = d => (d.tmux && d.tmux.socket ? ['-S', d.tmux.socket] : []);

async function localizarTerminal(ev) {
  const t = (ev && ev._term) || {};
  const d = {};
  if (t.tmuxPane && hay('tmux')) d.tmux = { pane: String(t.tmuxPane), socket: String(t.tmux || '').split(',')[0] || null };
  if (/^\d+$/.test(String(t.windowId || '')) && x11()) d.x11 = String(t.windowId);
  if (!d.tmux && !d.x11) return null;
  d.nombre = d.tmux ? 'tmux' : 'terminal';
  return d;
}

async function escribirEnTerminal({ destino, archivo, timeout = 15_000 }) {
  const d = destino || {};
  if (d.tmux && hay('tmux')) {
    const b = `apolo-${process.pid}-${Date.now()}`;
    await correr('tmux', [...tmuxArgs(d), 'load-buffer', '-b', b, archivo], timeout);
    await correr('tmux', [...tmuxArgs(d), 'paste-buffer', '-p', '-d', '-b', b, '-t', d.tmux.pane], timeout);
    await new Promise(ok => setTimeout(ok, 150));
    await correr('tmux', [...tmuxArgs(d), 'send-keys', '-t', d.tmux.pane, 'Enter'], timeout);
    return 'OK tmux';
  }
  if (d.x11 && x11() && hay('xdotool')) {
    const texto = fs.readFileSync(archivo, 'utf8').replace(/\r?\n/g, ' ');           // en X11 un salto de línea enviaría a medias
    await correr('xdotool', ['windowactivate', '--sync', d.x11], timeout);
    await correr('xdotool', ['type', '--delay', '2', '--clearmodifiers', '--', texto], timeout);
    await correr('xdotool', ['key', '--clearmodifiers', 'Return'], timeout);
    return 'OK x11';
  }
  throw Object.assign(new Error('no sé escribir en esa terminal (sin tmux ni X11 con xdotool)'), { codigo: 'SO_NO_SOPORTADO' });
}

async function enfocarTerminal(destino) {
  const d = destino || {};
  try {
    if (d.x11 && x11()) {
      if (hay('xdotool')) { await correr('xdotool', ['windowactivate', d.x11]); return true; }
      if (hay('wmctrl')) { await correr('wmctrl', ['-ia', d.x11]); return true; }
    }
    // tmux: al menos se selecciona su ventana/panel dentro de tmux (qué ventana del escritorio lo muestra no se sabe)
    if (d.tmux && hay('tmux')) { await correr('tmux', [...tmuxArgs(d), 'select-window', '-t', d.tmux.pane]); await correr('tmux', [...tmuxArgs(d), 'select-pane', '-t', d.tmux.pane]); return !!d.x11; }
  } catch { }
  return false;
}

// emulador de terminal: el elegido por el sistema (x-terminal-emulator en Debian/Ubuntu) o el primero que haya.
// Cada uno pide el directorio y el comando a su manera.
const EMULADORES = [
  ['x-terminal-emulator', (dir, c) => ['-e', ...c]],
  ['gnome-terminal', (dir, c) => ['--working-directory', dir, '--', ...c]],
  ['konsole', (dir, c) => ['--workdir', dir, '-e', ...c]],
  ['xfce4-terminal', (dir, c) => ['--working-directory', dir, '-x', ...c]],
  ['kitty', (dir, c) => ['--directory', dir, ...c]],
  ['alacritty', (dir, c) => ['--working-directory', dir, '-e', ...c]],
  ['wezterm', (dir, c) => ['start', '--cwd', dir, '--', ...c]],
  ['foot', (dir, c) => ['--working-directory', dir, ...c]],
  ['xterm', (dir, c) => ['-e', ...c]],
];
// args = ['claude', 'mensaje'] → dentro de tmux (sesión apolo-…) para poder escribirle después
function abrirTerminal(dir, args = []) {
  if (!grafico()) throw Object.assign(new Error('no hay escritorio gráfico (DISPLAY / WAYLAND_DISPLAY) para abrir una terminal'), { codigo: 'SO_NO_SOPORTADO' });
  const em = EMULADORES.find(([c]) => hay(c));
  if (!em) throw Object.assign(new Error('no encuentro ningún emulador de terminal (gnome-terminal, konsole, xterm…)'), { codigo: 'SO_NO_SOPORTADO' });
  const cmd = hay('tmux') ? ['tmux', 'new-session', '-s', `apolo-${Date.now().toString(36)}`, '-c', dir, '--', ...args] : args;
  const p = spawn(em[0], em[1](dir, cmd), { cwd: dir, detached: true, stdio: 'ignore' });
  p.on('error', () => { });
  p.unref();
  return { emulador: em[0], tmux: hay('tmux') };
}

module.exports = { ...base, nombre: 'linux', terminal: true, localizarTerminal, enfocarTerminal, escribirEnTerminal, abrirTerminal, _hay: hay };
