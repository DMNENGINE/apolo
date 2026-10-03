// Modo Gamer fase 2: PresentMon (CLI open source de Intel, github.com/GameTechDev/PresentMon) → FPS, 1 % low, frametimes.
// - buscar(): <datos>/gamer/bin, cfg.gamer.presentmon, APOLO_PRESENTMON. NUNCA se descarga solo: descargar() lo llama el panel cuando el usuario pulsa.
// - capturar(): PresentMon --process_id <pid> --output_file <csv> --timed N. Usa ETW → necesita ADMIN o estar en el grupo
//   "Usuarios del registro de rendimiento" / "Performance Log Users" (SID S-1-5-32-559). Sin eso sale con código 6 "access denied" → error ACCESO
//   con la solución; opción admin:true = lo lanza con UAC (Start-Process -Verb RunAs), una petición por captura.
// - parsearCSV()/metricas(): el CSV cambia entre versiones (1.x MsBetweenPresents, 2.x FrameTime, columnas en otro orden, NA…) → se buscan por nombre.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'GameTechDev/PresentMon';
const ASSET = /^PresentMon-(\d+(?:\.\d+)+)-x64\.exe$/i;
const MAX_BYTES = 30 << 20;
const COL_FT = ['frametime', 'msbetweenpresents', 'msbetweendisplaychange'];   // orden de preferencia
const GRUPO_SID = 'S-1-5-32-559';
const err = (m, codigo, status = 400) => Object.assign(new Error(m), { codigo, status });

// salida de PresentMon: a veces UTF-16LE (consola de Windows) → texto normal
function texto(buf) {
  if (!buf || !buf.length) return '';
  if (typeof buf === 'string') return buf;
  const muestra = buf.subarray(0, 400), ceros = muestra.filter(b => b === 0).length;
  return (ceros > muestra.length / 4 ? buf.toString('utf16le') : buf.toString('utf8')).replace(/^﻿/, '');
}

// ---------- CSV ----------
function partir(l) {                                              // CSV sencillo con comillas opcionales
  if (!l.includes('"')) return l.split(',');
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

// → { columna, filas: [{ft, app, pid, swap}], aplicaciones } ; tolera BOM, \r\n, líneas a medias (captura en vivo) y "NA"
function parsearCSV(txt, { pid = null } = {}) {
  const lineas = String(txt || '').replace(/^﻿/, '').split(/\r?\n/);
  const i0 = lineas.findIndex(l => /(^|,)\s*"?application"?\s*,/i.test(l));
  if (i0 < 0) return { columna: null, filas: [], aplicaciones: [] };
  const cab = partir(lineas[i0]).map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = COL_FT.find(c => cab.includes(c));
  if (!col) return { columna: null, filas: [], aplicaciones: [] };
  const iFt = cab.indexOf(col), iApp = cab.indexOf('application'), iPid = cab.indexOf('processid'), iSw = cab.indexOf('swapchainaddress');
  const filas = [];
  for (const l of lineas.slice(i0 + 1)) {
    if (!l.trim()) continue;
    const c = partir(l);
    if (c.length < cab.length) continue;                         // línea cortada (el archivo se está escribiendo)
    const ft = parseFloat(c[iFt]);
    if (!Number.isFinite(ft) || ft <= 0 || ft > 5000) continue;   // NA, 0, pausas absurdas (>5 s)
    const p = iPid >= 0 ? +c[iPid] : null;
    if (pid && p && p !== +pid) continue;
    filas.push({ ft, app: iApp >= 0 ? c[iApp] : '', pid: p, swap: iSw >= 0 ? c[iSw] : '' });
  }
  // varias swapchains (launcher + juego, overlay…): se queda la que más frames tiene
  const cuenta = new Map(); for (const f of filas) cuenta.set(f.swap, (cuenta.get(f.swap) || 0) + 1);
  const mejor = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { columna: cab[iFt], filas: filas.filter(f => f.swap === mejor), aplicaciones: [...new Set(filas.map(f => f.app).filter(Boolean))] };
}

const r1 = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
// 1 % low = FPS medio del 1 % de frames MÁS LENTOS (definición de CapFrameX/GN); p99 = percentil 99 del frametime (rango más cercano)
function metricas(fts) {
  const n = fts.length;
  if (!n) return { frames: 0, segundos: 0, fps: null, low1: null, low01: null, ftMedio: null, ftP99: null, tirones: null };
  const total = fts.reduce((a, b) => a + b, 0), media = total / n;
  const ord = [...fts].sort((a, b) => b - a);                    // de más lento a más rápido
  const lento = pct => { const k = Math.max(1, Math.ceil(n * pct)); const s = ord.slice(0, k); return 1000 / (s.reduce((a, b) => a + b, 0) / k); };
  const asc = [...ord].reverse(), p99 = asc[Math.min(n - 1, Math.ceil(0.99 * n) - 1)];
  return {
    frames: n, segundos: r1(total / 1000), fps: r1(1000 / media), low1: r1(lento(0.01)), low01: r1(lento(0.001)),
    ftMedio: r1(media, 2), ftP99: r1(p99, 2), tirones: r1(100 * fts.filter(f => f > 2 * media).length / n, 2),
  };
}
// FPS del último segundo (medidor en vivo)
function fpsVivo(fts) {
  let s = 0, k = 0;
  for (let i = fts.length - 1; i >= 0 && s < 1000; i--) { s += fts[i]; k++; }
  return k && s ? r1(1000 * k / s) : null;
}

// ---------- instancia ----------
function crearPresentMon({ cfg, fetchFn = globalThis.fetch, lanzar = spawn, entorno = process.env } = {}) {
  const dirBin = path.join(cfg.dir, 'gamer', 'bin'), fMeta = path.join(dirBin, 'presentmon.json');
  const leerMeta = () => { try { return JSON.parse(fs.readFileSync(fMeta, 'utf8')); } catch { return null; } };
  const existe = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

  function buscar() {
    const meta = leerMeta();
    const cands = [cfg.gamer?.presentmon, entorno.APOLO_PRESENTMON, meta?.archivo && path.join(dirBin, meta.archivo)];
    try { cands.push(...fs.readdirSync(dirBin).filter(f => /^presentmon.*\.exe$/i.test(f)).sort().reverse().map(f => path.join(dirBin, f))); } catch { }
    const exe = cands.filter(Boolean).find(existe);
    if (!exe) return { instalado: false };
    const v = ASSET.exec(path.basename(exe))?.[1] || (meta && path.join(dirBin, meta.archivo) === exe ? meta.version : null);
    return { instalado: true, exe, version: v, sha256: meta && path.join(dirBin, meta.archivo) === exe ? meta.sha256 : null, fuente: exe.startsWith(dirBin) ? 'apolo' : 'propio' };
  }

  // info de la última release oficial (para enseñarla ANTES de bajar): versión, tamaño, sha256 publicado por GitHub
  async function release() {
    const r = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'APOLO' } });
    if (!r.ok) throw err(`GitHub respondió ${r.status}`, 'RED', 502);
    const j = await r.json();
    const a = (j.assets || []).find(x => ASSET.test(x.name));
    if (!a) throw err('la release oficial no trae el .exe de la CLI', 'SIN_EXE', 502);
    const u = new URL(a.browser_download_url);
    if (u.hostname !== 'github.com' || !u.pathname.startsWith(`/${REPO}/releases/download/`)) throw err('URL de descarga inesperada', 'URL', 502);
    return { version: ASSET.exec(a.name)[1], tag: j.tag_name, archivo: a.name, bytes: a.size, url: a.browser_download_url, sha256: /^sha256:([0-9a-f]{64})$/i.exec(a.digest || '')?.[1]?.toLowerCase() || null, pagina: j.html_url };
  }

  // SOLO cuando el usuario pulsa "Descargar PresentMon" (POST con confirmar:true)
  async function descargar() {
    const inf = await release();
    if (inf.bytes > MAX_BYTES) throw err('el .exe es sospechosamente grande', 'TAMANO');
    const r = await fetchFn(inf.url, { headers: { 'user-agent': 'APOLO' }, redirect: 'follow' });
    if (!r.ok) throw err(`descarga: HTTP ${r.status}`, 'RED', 502);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES || (inf.bytes && buf.length !== inf.bytes)) throw err('el tamaño no coincide con la release', 'TAMANO', 502);
    if (buf[0] !== 0x4d || buf[1] !== 0x5a) throw err('no es un ejecutable de Windows', 'FORMATO', 502);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (inf.sha256 && sha !== inf.sha256) throw err(`sha256 no coincide (${sha} ≠ ${inf.sha256})`, 'SHA', 502);
    fs.mkdirSync(dirBin, { recursive: true });
    const f = path.join(dirBin, inf.archivo);
    fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
    const meta = { version: inf.version, archivo: inf.archivo, bytes: buf.length, sha256: sha, shaVerificado: !!inf.sha256, url: inf.url, fecha: new Date().toISOString() };
    fs.writeFileSync(fMeta, JSON.stringify(meta, null, 2));
    return { ...meta, exe: f };
  }

  // captura de N s sobre un pid → {metricas, columna, aplicacion}; enVivo(fps) ~1 vez/s leyendo el CSV mientras se escribe
  async function capturar({ pid, segundos = 60, csv, admin = false, enVivo, senal } = {}) {
    const pm = buscar();
    if (!pm.instalado) throw err('PresentMon no está instalado: pulsa "Descargar PresentMon" en el panel Modo Gamer', 'NO_INSTALADO', 409);
    pid = parseInt(pid, 10); segundos = Math.max(5, Math.min(600, parseInt(segundos, 10) || 60));
    if (!pid) throw err('falta el pid del juego');
    fs.mkdirSync(path.dirname(csv), { recursive: true });
    try { fs.unlinkSync(csv); } catch { }
    const args = ['--process_id', String(pid), '--output_file', csv, '--timed', String(segundos), '--terminate_after_timed', '--no_console_stats',
      '--session_name', 'APOLO_PresentMon', '--stop_existing_session', '--v2_metrics'];
    const p = admin
      ? lanzar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$p = Start-Process -FilePath '${pm.exe.replace(/'/g, "''")}' -ArgumentList '${args.map(a => `"${a}"`).join(' ').replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode`], { windowsHide: true })
      : lanzar(pm.exe, args, { windowsHide: true });
    const err1 = [], out1 = [];
    p.stderr?.on('data', d => err1.push(d)); p.stdout?.on('data', d => out1.push(d));
    const vivo = enVivo && setInterval(() => { try { const { filas } = parsearCSV(fs.readFileSync(csv, 'utf8'), { pid }); enVivo(fpsVivo(filas.map(f => f.ft)), filas.length); } catch { } }, 1000);
    const corte = setTimeout(() => { try { p.kill(); } catch { } }, (segundos + 25) * 1000);
    const parar = () => { try { p.kill(); } catch { } };
    senal?.addEventListener?.('abort', parar);
    const codigo = await new Promise(ok => { p.on('exit', c => ok(c)); p.on('error', e => { err1.push(Buffer.from(e.message)); ok(-1); }); });
    clearTimeout(corte); if (vivo) clearInterval(vivo); senal?.removeEventListener?.('abort', parar);
    const msg = (texto(Buffer.concat(err1.map(b => (Buffer.isBuffer(b) ? b : Buffer.from(b))))) + ' ' + texto(Buffer.concat(out1.map(b => (Buffer.isBuffer(b) ? b : Buffer.from(b)))))).replace(/\s+/g, ' ').trim();
    if (codigo === 6 || /access denied|acceso denegado/i.test(msg)) {
      throw err('PresentMon necesita permisos de ETW: o mides "como administrador" (te saldrá el aviso de Windows) o añades tu usuario una vez al grupo ' +
        `"Usuarios del registro de rendimiento" (PowerShell admin: Add-LocalGroupMember -SID ${GRUPO_SID} -Member $env:USERNAME) y cierras sesión.`, 'ACCESO', 403);
    }
    let txt = ''; try { txt = fs.readFileSync(csv, 'utf8'); } catch { }
    const r = parsearCSV(txt, { pid });
    if (!r.filas.length) throw err(senal?.aborted ? 'medición cancelada' : `PresentMon no vio frames del proceso ${pid} (¿está en primer plano y renderizando?)${msg ? `: ${msg.slice(0, 200)}` : ''}`, 'SIN_FRAMES', 422);
    return { metricas: metricas(r.filas.map(f => f.ft)), columna: r.columna, aplicacion: r.filas[0].app || r.aplicaciones[0] || null, csv, version: pm.version };
  }

  return { buscar, release, descargar, capturar, dirBin };
}

module.exports = { crearPresentMon, parsearCSV, metricas, fpsVivo, texto, GRUPO_SID };
