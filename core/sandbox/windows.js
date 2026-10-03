// Sandbox en Windows: nivel "restringido" (jaula.cs: Job Object + token de integridad baja) y nivel "aislado" (Windows Sandbox).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const FUENTE = path.join(__dirname, 'jaula.cs');
const WSB = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsSandbox.exe');
// datos de APOLO que un proceso de integridad baja NO debe ni leer (token del daemon, config, bóveda…)
const SENSIBLES = ['token', 'config.json', 'boveda.json', 'boveda.key', 'reglas.json', 'movil.json', 'nodos.json', 'auditoria.jsonl', 'panico.json', 'stream/secretos.json', 'stream/clave'];

function disponible() {
  const aislado = fs.existsSync(WSB);
  return {
    restringido: true, aislado,
    motivoAislado: aislado ? '' : 'Windows Sandbox no está instalado (necesita Windows 10/11 Pro, Enterprise o Education y activar la característica "Espacio aislado de Windows" / Containers-DisposableClientVM)',
  };
}

// ---------- jaula: se compila una vez con Add-Type (sin dependencias) y se cachea por hash del fuente ----------
const compilando = new Map();
function jaula(dirCache) {
  const h = crypto.createHash('sha1').update(fs.readFileSync(FUENTE)).digest('hex').slice(0, 10);
  const exe = path.join(dirCache, `apolo-jaula-${h}.exe`);
  if (fs.existsSync(exe)) return Promise.resolve(exe);
  if (compilando.has(exe)) return compilando.get(exe);
  const pr = new Promise((ok, mal) => {
    fs.mkdirSync(dirCache, { recursive: true });
    const tmp = path.join(dirCache, `compilando-${process.pid}-${Date.now()}.exe`);
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      'Add-Type -TypeDefinition ([IO.File]::ReadAllText($env:APOLO_CS)) -OutputAssembly $env:APOLO_EXE -OutputType ConsoleApplication'],
    { windowsHide: true, env: { ...process.env, APOLO_CS: FUENTE, APOLO_EXE: tmp } });
    let err = ''; p.stdout.on('data', d => { err += d; }); p.stderr.on('data', d => { err += d; });
    p.on('error', e => mal(new Error(`no pude compilar la jaula del sandbox: ${e.message}`)));
    p.on('close', code => {
      if (code !== 0 || !fs.existsSync(tmp)) return mal(new Error(`no pude compilar la jaula del sandbox: ${err.trim().slice(0, 300)}`));
      try { if (fs.existsSync(exe)) fs.rmSync(tmp, { force: true }); else fs.renameSync(tmp, exe); } catch { }
      ok(exe);
    });
  });
  compilando.set(exe, pr);
  return pr.finally(() => compilando.delete(exe));
}
function etiquetar(exe, modo, rutas) {
  if (!rutas.length) return true;
  const r = spawnSync(exe, [`etiquetar=${modo}`, ...rutas], { windowsHide: true, encoding: 'utf8' });
  return r.status === 0;
}
// archivos de una ruta (o la ruta misma), hasta 3 niveles y 2000 entradas
function archivosDe(r, prof = 0, acc = []) {
  let st; try { st = fs.statSync(r); } catch { return acc; }
  acc.push(r);
  if (st.isDirectory() && prof < 3) for (const n of fs.readdirSync(r)) { if (acc.length > 2000) break; archivosDe(path.join(r, n), prof + 1, acc); }
  return acc;
}

// copia temporal etiquetada "Low" (el único sitio donde el script puede escribir) + endurecer lo sensible contra lectura
async function prepararRestringido({ dirOrigen, dirCache, dirDatos, protegerLectura = [] }) {
  const exe = await jaula(dirCache);
  const proteger = [...(dirDatos ? SENSIBLES.map(f => path.join(dirDatos, f)) : []),
    ...protegerLectura.map(x => String(x).replace(/^~(?=[\\/]|$)/, os.homedir())).flatMap(x => archivosDe(path.resolve(x)))].filter(f => fs.existsSync(f));
  etiquetar(exe, 'nolectura', proteger);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-sb-'));
  if (!etiquetar(exe, 'baja', [root])) { fs.rmSync(root, { recursive: true, force: true }); throw new Error('no pude etiquetar la carpeta de trabajo con integridad baja'); }
  const cwd = path.join(root, dirOrigen ? path.basename(dirOrigen) : 'trabajo'), tmp = path.join(root, 'tmp');
  if (dirOrigen) fs.cpSync(dirOrigen, cwd, { recursive: true, filter: s => !/[\\/]\.git([\\/]|$)/.test(s) }); else fs.mkdirSync(cwd);
  fs.mkdirSync(tmp);
  return { jaula: exe, root, cwd, tmp, limpiar: () => { try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { } } };
}
function lanzarRestringido({ jaula: exe, bin, args, cwd, env, limites }) {
  const l = limites || {};
  return spawn(exe, [`mem=${l.memoriaMB || 512}`, `cpu=${l.cpu ?? 50}`, `procs=${l.procesos || 1}`, `seg=${l.seg || 120}`, 'baja=1', `cwd=${cwd}`, '--', bin, ...args],
    { cwd, windowsHide: true, env });
}

// ---------- nivel aislado: Windows Sandbox ----------
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// .wsb: carpetas mapeadas (skill en SOLO LECTURA, salida escribible), red apagada salvo permiso, sin portapapeles/audio/vídeo/impresoras
function generarWsb({ mapeos, red = false, memoriaMB = 2048, comando }) {
  return ['<Configuration>', `  <Networking>${red ? 'Enable' : 'Disable'}</Networking>`, '  <vGPU>Disable</vGPU>', '  <ClipboardRedirection>Disable</ClipboardRedirection>',
    '  <AudioInput>Disable</AudioInput>', '  <VideoInput>Disable</VideoInput>', '  <PrinterRedirection>Disable</PrinterRedirection>', '  <ProtectedClient>Enable</ProtectedClient>',
    `  <MemoryInMB>${Math.max(1024, memoriaMB | 0)}</MemoryInMB>`, '  <MappedFolders>',
    ...mapeos.map(m => `    <MappedFolder><HostFolder>${xml(m.host)}</HostFolder><SandboxFolder>${xml(m.guest)}</SandboxFolder><ReadOnly>${m.soloLectura ? 'true' : 'false'}</ReadOnly></MappedFolder>`),
    '  </MappedFolders>', `  <LogonCommand><Command>${xml(comando)}</Command></LogonCommand>`, '</Configuration>', ''].join('\r\n');
}
const psq = s => `'${String(s).replace(/'/g, "''")}'`;
function ejecutarAislado({ bin, args = [], dirOrigen, env = {}, timeoutSeg = 120, signal, red = false, registrar }) {
  return new Promise((ok) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-wsb-')), skill = path.join(root, 'skill'), salida = path.join(root, 'salida');
    fs.mkdirSync(salida); if (dirOrigen) fs.cpSync(dirOrigen, skill, { recursive: true }); else fs.mkdirSync(skill);
    const G = 'C:\\apolo', mapeos = [{ host: skill, guest: `${G}\\skill`, soloLectura: true }, { host: salida, guest: `${G}\\salida`, soloLectura: false }];
    // intérprete: PowerShell/cmd vienen en la VM; node/python se mapean en solo lectura desde el equipo
    let gbin = bin; const b = path.basename(String(bin)).toLowerCase();
    if (!/^(powershell|pwsh|cmd)(\.exe)?$/.test(b)) {
      let real = path.isAbsolute(bin) ? bin : (spawnSync('where.exe', [bin], { encoding: 'utf8', windowsHide: true }).stdout || '').split(/\r?\n/)[0].trim();
      if (!real || !fs.existsSync(real)) { fs.rmSync(root, { recursive: true, force: true }); return ok({ salida: `[sandbox] aislado: no encuentro el intérprete "${bin}" para mapearlo en la VM`, codigo: -1 }); }
      mapeos.push({ host: path.dirname(real), guest: `${G}\\int`, soloLectura: true }); gbin = `${G}\\int\\${path.basename(real)}`;
    }
    const remap = a => (dirOrigen && String(a).startsWith(dirOrigen) ? `${G}\\trabajo` + String(a).slice(dirOrigen.length) : String(a));
    const envPs = Object.entries(env).filter(([k]) => /^(ELECTRON_RUN_AS_NODE|PYTHONIOENCODING|SKILL_DIR|APOLO_CWD)$/.test(k))
      .map(([k, v]) => `$env:${k}=${psq(k === 'SKILL_DIR' ? `${G}\\trabajo` : v)}`).join('\r\n');
    const runner = ['$ErrorActionPreference = "Continue"', `Copy-Item ${psq(`${G}\\skill`)} ${psq(`${G}\\trabajo`)} -Recurse -Force`, `Set-Location ${psq(`${G}\\trabajo`)}`, envPs,
      `& ${psq(gbin)} ${args.map(a => psq(remap(a))).join(' ')} *> ${psq(`${G}\\salida\\salida.txt`)}`,
      `[IO.File]::WriteAllText(${psq(`${G}\\salida\\codigo.txt`)}, [string]$LASTEXITCODE)`, 'shutdown.exe /s /t 0', ''].join('\r\n');
    fs.writeFileSync(path.join(salida, 'ejecutar.ps1'), '\ufeff' + runner);
    const wsb = path.join(root, 'apolo.wsb');
    fs.writeFileSync(wsb, generarWsb({ mapeos, red, comando: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${G}\\salida\\ejecutar.ps1` }));
    const matarVM = () => { spawnSync('taskkill.exe', ['/F', '/IM', 'WindowsSandboxRemoteSession.exe', '/IM', 'WindowsSandboxClient.exe', '/IM', 'WindowsSandbox.exe'], { windowsHide: true }); };
    let hecho = false, iv = null;
    const quitar = registrar ? registrar(() => terminar('[sandbox] aislado: cancelado (pánico)', -1, true)) : () => { };
    function terminar(extra, codigo, matar) {
      if (hecho) return; hecho = true; clearInterval(iv); quitar(); if (matar) matarVM();
      let out = ''; try { out = fs.readFileSync(path.join(salida, 'salida.txt'), 'utf8').replace(/^\ufeff/, ''); } catch { }
      setTimeout(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { } }, 5000);
      ok({ salida: `${out}${extra ? '\n' + extra : ''}`, codigo });
    }
    let p; try { p = spawn(WSB, [wsb], { windowsHide: true, detached: false }); } catch (e) { return terminar(`[sandbox] aislado: no pude abrir Windows Sandbox: ${e.message}`, -1); }
    p.on('error', e => terminar(`[sandbox] aislado: no pude abrir Windows Sandbox: ${e.message}`, -1));
    const limite = Date.now() + (Math.min(timeoutSeg, 600) + 120) * 1000;     // +2 min de arranque de la VM
    iv = setInterval(() => {
      const fc = path.join(salida, 'codigo.txt');
      if (fs.existsSync(fc)) { const c = parseInt(fs.readFileSync(fc, 'utf8').replace(/^\ufeff/, ''), 10); return terminar('', Number.isFinite(c) ? c : -1, false); }
      if (Date.now() > limite) terminar('[sandbox] aislado: tiempo agotado → VM cerrada', 124, true);
    }, 1000);
    signal?.addEventListener('abort', () => terminar('[sandbox] aislado: cancelado', -1, true), { once: true });
  });
}

module.exports = { disponible, jaula, etiquetar, prepararRestringido, lanzarRestringido, ejecutarAislado, generarWsb, SENSIBLES };
