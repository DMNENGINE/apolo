// Avisos de actualización: compara la versión instalada (instalado.json, lo escribe install.ps1)
// con el último commit de GitHub. En una copia de desarrollo (con .git) no hace nada.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const REPO = 'DMNENGINE/apolo', RAMA = 'main';
const API = `https://api.github.com/repos/${REPO}`;
const INSTALADOR = `https://raw.githubusercontent.com/${REPO}/${RAMA}/install.ps1`;
const CADA_MS = 6 * 3600_000;

// Dos caminos, misma interfaz { iniciar, comprobar, posponer, actualizar, esDesarrollo, pendiente }:
//  - instalación .exe (código dentro de app.asar): electron-updater + GitHub Releases (latest.yml, descarga diferencial,
//    instala al cerrar sin admin). Es lo estándar para NSIS y no depende de Node/Python en el PC del usuario.
//  - instalación de una línea (install.ps1, sin asar): comparar el commit instalado (instalado.json) con main y relanzar install.ps1.
function crearActualizador(o) {
  if (/[\\/]app\.asar$/.test(o.dirApp || '')) return crearActualizadorExe(o);
  return crearActualizadorGit(o);
}

function crearActualizadorExe({ dirDatos, avisar, log = console.log }) {
  const fPospuesto = path.join(dirDatos, 'actualizacion-pospuesta.json');
  let au = null, ultima = null, descargada = false, timer = null;
  try {
    ({ autoUpdater: au } = require('electron-updater'));
    au.autoDownload = false; au.autoInstallOnAppQuit = true;
    au.logger = { info: () => { }, warn: m => log('[actualizador]', m), error: m => log('[actualizador]', String(m).split('\n')[0]), debug: () => { } };
  } catch (e) { log('[actualizador] electron-updater no disponible:', e.message); }
  const notas = n => (Array.isArray(n) ? n.map(x => x.note || '').join('\n') : String(n || ''))
    .replace(/<[^>]+>/g, '\n').split('\n').map(l => l.replace(/^[-*•\s]+/, '').trim()).filter(Boolean).slice(0, 6);

  async function comprobar(forzar = false) {
    if (!au) return { estado: 'error', error: 'electron-updater no disponible' };
    try {
      const r = await au.checkForUpdates();
      const info = r && r.updateInfo;
      const nueva = r && (r.isUpdateAvailable ?? (info && info.version !== require('electron').app.getVersion()));
      if (!nueva) { ultima = null; return { estado: 'al-dia' }; }
      ultima = { sha: 'v' + info.version, version: info.version, cambios: notas(info.releaseNotes), fecha: info.releaseDate || '' };
      let pospuesto = null; try { pospuesto = JSON.parse(fs.readFileSync(fPospuesto, 'utf8')); } catch { }
      const callado = pospuesto && pospuesto.sha === ultima.sha && Date.now() < pospuesto.hasta;
      if (forzar || !callado) avisar(ultima);
      return { estado: 'nueva', ...ultima };
    } catch (e) { log('[actualizador]', e.message); return { estado: 'error', error: e.message.split('\n')[0] }; }
  }
  function posponer(horas = 24) {
    if (!ultima) return;
    try { fs.writeFileSync(fPospuesto, JSON.stringify({ sha: ultima.sha, hasta: Date.now() + horas * 3600_000 })); } catch { }
  }
  // descarga (diferencial si se puede) y reinicia con el instalador en silencio; los datos (%APPDATA%) no se tocan.
  // progreso({fase:'descargando'|'instalando'|'error', pct?, error?}) → la isla lo enseña (antes no se veía nada ~1-3 min
  // mientras bajaban ~95 MB y los errores solo iban al registro: los usuarios creían que no hacía nada)
  let enCurso = false;
  async function actualizar(progreso = () => { }) {
    if (!au) return progreso({ fase: 'error', error: 'electron-updater no disponible' });
    if (enCurso) return;                                       // un segundo clic no lanza otra descarga
    enCurso = true;
    const alProgreso = p => progreso({ fase: 'descargando', pct: Math.round(p.percent || 0) });
    au.on('download-progress', alProgreso);
    try {
      if (!ultima) { const r = await comprobar(true); if (r.estado !== 'nueva') throw new Error(r.estado === 'al-dia' ? 'ya tienes la última versión' : r.error || 'no encuentro la actualización'); }
      progreso({ fase: 'descargando', pct: 0 });
      if (!descargada) { await au.downloadUpdate(); descargada = true; }
      progreso({ fase: 'instalando' });
      setTimeout(() => au.quitAndInstall(true, true), 1500);  // que la isla llegue a decir "instalando"
    } catch (e) {
      log('[actualizador]', e.message); enCurso = false;
      progreso({ fase: 'error', error: String(e.message || e).split('\n')[0], manual: `https://github.com/${REPO}/releases/latest` });
    } finally { au.removeListener('download-progress', alProgreso); }
  }
  function iniciar() {
    if (!au) return;
    setTimeout(() => comprobar(), 60_000);
    timer = setInterval(() => comprobar(), CADA_MS); timer.unref?.();
  }
  return { iniciar, comprobar, posponer, actualizar, esDesarrollo: false, pendiente: () => ultima, modo: 'exe' };
}

function crearActualizadorGit({ dirApp, dirDatos, avisar, log = console.log, instalador = INSTALADOR }) {   // instalador: otra URL solo en pruebas
  const esDesarrollo = fs.existsSync(path.join(dirApp, '.git'));
  const fInstalado = path.join(dirApp, 'instalado.json');
  const fPospuesto = path.join(dirDatos, 'actualizacion-pospuesta.json');
  let ultima = null, timer = null;

  const instalado = () => { try { return JSON.parse(fs.readFileSync(fInstalado, 'utf8')).sha || null; } catch { return null; } };
  const get = async url => {
    const r = await fetch(url, { headers: { 'user-agent': 'APOLO-actualizador', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.json();
  };

  // forzar = buscar aunque se haya pospuesto (desde la bandeja)
  async function comprobar(forzar = false) {
    if (esDesarrollo) return { estado: 'desarrollo' };
    const actual = instalado();
    if (!actual) return { estado: 'desconocido' };                // instalado a mano, sin install.ps1
    try {
      const head = await get(`${API}/commits/${RAMA}`);
      if (head.sha === actual) { ultima = null; return { estado: 'al-dia' }; }
      let cambios = [];
      try {
        const cmp = await get(`${API}/compare/${actual}...${head.sha}`);
        cambios = (cmp.commits || []).map(c => String(c.commit.message).split('\n')[0]).reverse().slice(0, 6);
      } catch { }
      ultima = { sha: head.sha, cambios, fecha: head.commit?.committer?.date || '' };
      let pospuesto = null; try { pospuesto = JSON.parse(fs.readFileSync(fPospuesto, 'utf8')); } catch { }
      const callado = pospuesto && pospuesto.sha === head.sha && Date.now() < pospuesto.hasta;
      if (forzar || !callado) avisar(ultima);
      return { estado: 'nueva', ...ultima };
    } catch (e) { log('[actualizador]', e.message); return { estado: 'error', error: e.message }; }
  }

  function posponer(horas = 24) {
    if (!ultima) return;
    try { fs.writeFileSync(fPospuesto, JSON.stringify({ sha: ultima.sha, hasta: Date.now() + horas * 3600_000 })); } catch { }
  }

  // ejecuta install.ps1 en una ventana visible: cierra APOLO, actualiza y lo vuelve a abrir.
  // Se lanza con WMI (Win32_Process.Create) y no como hijo: APOLO puede correr dentro de un "job" de Windows que mata a sus
  // hijos al cerrarse, e install.ps1 empieza cerrando APOLO → el actualizador moría con él y APOLO quedaba cerrado sin actualizar.
  let enCurso = false;
  function actualizar(progreso = () => { }) {
    if (enCurso) return; enCurso = true;
    const script = path.join(os.tmpdir(), 'apolo-actualizar.ps1');
    fs.writeFileSync(script, [
      "$Host.UI.RawUI.WindowTitle = 'Actualizando APOLO'",
      "Write-Host 'Actualizando APOLO... (no cierres esta ventana)' -ForegroundColor Green",
      `try { irm ${instalador} | iex; Start-Sleep 3 }`,
      "catch { Write-Host ''; Write-Host ('No se pudo actualizar: ' + $_.Exception.Message) -ForegroundColor Red; Read-Host 'Pulsa Enter para cerrar' }",
    ].join('\r\n'), 'utf8');
    const linea = `cmd.exe /c start "Actualizando APOLO" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${script}"`;
    const ps = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${linea.replace(/'/g, "''")}' }; $r.ReturnValue`;
    progreso({ fase: 'abriendo' });
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20_000 }, (err, out) => {
      if (!err && String(out).trim() === '0') return;        // en marcha: install.ps1 cerrará APOLO y lo volverá a abrir
      enCurso = false;
      log('[actualizador] no pude lanzar install.ps1:', err ? err.message : String(out).trim());
      progreso({ fase: 'error', error: 'no pude abrir el actualizador', manual: `irm ${instalador} | iex` });
    });
  }

  function iniciar() {
    if (esDesarrollo) { log('[actualizador] copia de desarrollo (.git): sin avisos'); return; }
    setTimeout(() => comprobar(), 60_000);                       // un minuto después de arrancar
    timer = setInterval(() => comprobar(), CADA_MS); timer.unref?.();
  }

  return { iniciar, comprobar, posponer, actualizar, esDesarrollo, pendiente: () => ultima };
}

module.exports = { crearActualizador };
