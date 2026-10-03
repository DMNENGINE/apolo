// Bóveda de secretos (FASE 9): <nucleo>/boveda.json con cada valor cifrado.
//   Windows → DPAPI (CurrentUser) vía PowerShell [Security.Cryptography.ProtectedData], sin dependencias. Solo tu usuario de Windows
//             en ESTE equipo lo descifra; otro usuario, otro PC o una copia del archivo no sirven.
//   Electron (otros SO) → safeStorage inyectable (Keychain en macOS, libsecret/kwallet en Linux).
//   Sin nada de eso → AES-256-GCM con clave en <nucleo>/boveda.key (0600). Es solo ofuscación: lo decimos en SECURITY.md.
// En Windows usamos DPAPI también dentro de Electron: así el daemon/CLI en node puro lee las mismas claves.
// Los valores nunca salen por la API ni a los registros (seguridad.registrarSecreto → redacción automática).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { registrarSecreto, olvidarSecreto } = require('./seguridad');

const FORMATO = 'apolo-boveda/1';

// lote de buffers en una sola llamada a PowerShell (~0,3-0,6 s)
const PS_DPAPI = [
  "$ErrorActionPreference='Stop'",
  'Add-Type -AssemblyName System.Security',
  '$e = [Console]::In.ReadToEnd() | ConvertFrom-Json',
  "$s = [Security.Cryptography.DataProtectionScope]::CurrentUser",
  "$ent = [Text.Encoding]::UTF8.GetBytes('apolo-boveda')",
  '$r = @()',
  "foreach ($d in @($e.datos)) { $b = [Convert]::FromBase64String($d); if ($e.op -eq 'cifrar') { $x = [Security.Cryptography.ProtectedData]::Protect($b, $ent, $s) } else { $x = [Security.Cryptography.ProtectedData]::Unprotect($b, $ent, $s) }; $r += [Convert]::ToBase64String($x) }",
  "[Console]::Out.Write((ConvertTo-Json -Compress -InputObject @($r)))",
].join('; ');
function cifradorDpapi() {
  const lote = (op, bufs) => {
    if (!bufs.length) return [];
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_DPAPI],
      { input: JSON.stringify({ op, datos: bufs.map(b => b.toString('base64')) }), windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
    const r = JSON.parse(String(out).trim() || '[]');
    return (Array.isArray(r) ? r : [r]).map(x => Buffer.from(String(x), 'base64'));
  };
  return { nombre: 'dpapi', cifrar: bufs => lote('cifrar', bufs), descifrar: bufs => lote('descifrar', bufs) };
}
// Electron: require('electron').safeStorage (solo cuando isEncryptionAvailable())
function cifradorSafeStorage(ss) {
  return { nombre: 'safeStorage', cifrar: bufs => bufs.map(b => ss.encryptString(b.toString('utf8'))), descifrar: bufs => bufs.map(b => Buffer.from(ss.decryptString(b), 'utf8')) };
}
function cifradorArchivo(dir) {
  const fk = path.join(dir, 'boveda.key');
  let k; try { k = Buffer.from(fs.readFileSync(fk, 'utf8').trim(), 'base64'); } catch { }
  if (!k || k.length !== 32) { k = crypto.randomBytes(32); fs.writeFileSync(fk, k.toString('base64'), { mode: 0o600 }); }
  return {
    nombre: 'archivo',
    cifrar: bufs => bufs.map(b => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv); const x = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), x]); }),
    descifrar: bufs => bufs.map(b => { const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); }),
  };
}
function cifradorPorDefecto(dir, { safeStorage } = {}) {
  const forzado = process.env.APOLO_BOVEDA;
  if (forzado === 'archivo') return cifradorArchivo(dir);
  if (process.platform === 'win32' && forzado !== 'safeStorage') return cifradorDpapi();
  if (safeStorage?.isEncryptionAvailable?.()) return cifradorSafeStorage(safeStorage);
  return cifradorArchivo(dir);
}

function crearBoveda({ dir, cifrador } = {}) {
  const f = path.join(dir, 'boveda.json');
  let datos = { formato: FORMATO, metodo: null, entradas: {} };
  try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (d && d.entradas) datos = d; } catch { }
  let cif = cifrador || null;
  const c = () => cif || (cif = cifradorPorDefecto(dir));
  let cache = null;                                             // nombre → valor en claro (solo en memoria)
  const guardarDisco = () => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(datos, null, 2), { mode: 0o600 }); fs.renameSync(tmp, f); };

  function cargar() {
    if (cache) return cache;
    cache = new Map();
    const nombres = Object.keys(datos.entradas); if (!nombres.length) return cache;
    if (datos.metodo && datos.metodo !== c().nombre) throw new Error(`la bóveda se cifró con ${datos.metodo} y aquí solo hay ${c().nombre}`);
    const claros = c().descifrar(nombres.map(n => Buffer.from(datos.entradas[n], 'base64')));
    nombres.forEach((n, i) => { const v = claros[i].toString('utf8'); cache.set(n, v); registrarSecreto(v); });
    return cache;
  }
  function leer(nombre) { try { return cargar().get(String(nombre)) ?? null; } catch (e) { error = e.message; return null; } }
  function guardar(nombre, valor) {
    nombre = String(nombre); valor = String(valor ?? '');
    if (!/^[\w:.@-]{1,100}$/.test(nombre)) throw new Error('nombre de secreto no válido');
    if (!valor) return borrar(nombre);
    cargar();
    const [x] = c().cifrar([Buffer.from(valor, 'utf8')]);
    datos.metodo = c().nombre; datos.entradas[nombre] = x.toString('base64');
    guardarDisco(); const viejo = cache.get(nombre); if (viejo && viejo !== valor) olvidarSecreto(viejo);
    cache.set(nombre, valor); registrarSecreto(valor);
    return true;
  }
  function borrar(nombre) {
    if (!(nombre in datos.entradas)) return false;
    delete datos.entradas[nombre]; guardarDisco();
    if (cache) { olvidarSecreto(cache.get(nombre)); cache.delete(nombre); }
    return true;
  }
  let error = '';
  return { leer, guardar, borrar, tiene: n => n in datos.entradas, nombres: () => Object.keys(datos.entradas), metodo: () => datos.metodo || c().nombre, error: () => error, archivo: f };
}

// ¿el texto de config es una referencia a la bóveda? "boveda:proveedor:openai"
const REF = /^boveda:([\w:.@-]{1,100})$/;

module.exports = { crearBoveda, cifradorDpapi, cifradorSafeStorage, cifradorArchivo, cifradorPorDefecto, REF };
