// Firma ed25519 de skills y plugins (node:crypto, sin dependencias).
//   FIRMA.json (en la raíz de la carpeta) = { formato: 'apolo-firma/1', autor, clavePublica, fecha, archivos: {ruta: sha256}, firma }
//   La firma (base64) cubre el JSON canónico (claves ordenadas) de todo lo demás. Se excluyen FIRMA.json y los datos
//   privados de APOLO (instalado.json, aprendizaje.jsonl, _versiones), .git y node_modules.
//   Verificar: firma correcta + hashes iguales + sin archivos de más/de menos. Estados:
//     'verificada'  firma buena y la clave está en cfg.skills.autoresConfianza ([{nombre, clavePublica}])
//     'desconocida' firma buena pero de una clave que no es de confianza
//     'sin-firma'   no hay FIRMA.json
//     'invalida'    FIRMA.json roto, firma mala o archivos alterados → cuarentena roja
//
// CLI:
//   node core/skills/firmar.js --generar [nombre] [--salida carpeta]     par de claves → <nombre>.clave (privada, PEM) + clave pública en pantalla
//   node core/skills/firmar.js <carpeta> --clave <privada.pem> [--autor "Nombre"]
//   node core/skills/firmar.js --verificar <carpeta> [--publica <base64>]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { listarArchivos } = require('./formato');

const ARCHIVO = 'FIRMA.json', FORMATO = 'apolo-firma/1';
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');   // cabecera DER de una clave pública ed25519 (32 bytes detrás)

// JSON con claves ordenadas (la firma no depende del orden en el archivo)
const canonico = v => (Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}` : JSON.stringify(v));

function hashes(dir) {
  const out = {};
  for (const a of listarArchivos(dir, 20000)) if (a !== ARCHIVO) out[a] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, a))).digest('hex');
  return out;
}

// ---------- claves ----------
function generarClaves() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return { privada: privateKey.export({ type: 'pkcs8', format: 'pem' }), publica: publicaB64(publicKey) };
}
const publicaB64 = k => k.export({ type: 'spki', format: 'der' }).subarray(SPKI_ED25519.length).toString('base64');
// clave pública: base64 de los 32 bytes (lo que imprime --generar), PEM o "ed25519:<base64>"
function clavePublica(x) {
  if (x && typeof x === 'object' && x.type) return x;
  const t = String(x || '').trim().replace(/^ed25519:/i, '');
  if (/BEGIN PUBLIC KEY/.test(t)) return crypto.createPublicKey(t);
  const raw = Buffer.from(t, 'base64');
  if (raw.length !== 32) throw new Error('clave pública ed25519 no válida (32 bytes en base64)');
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw]), format: 'der', type: 'spki' });
}
const normPublica = x => { try { return publicaB64(clavePublica(x)); } catch { return ''; } };
// clave privada: objeto, PEM, ruta a un archivo PEM o base64 de PKCS8 DER
function clavePrivada(x) {
  if (x && typeof x === 'object' && x.type) return x;
  let t = String(x || '').trim();
  if (!/BEGIN/.test(t) && t && fs.existsSync(t)) t = fs.readFileSync(t, 'utf8').trim();
  if (/BEGIN/.test(t)) return crypto.createPrivateKey(t);
  return crypto.createPrivateKey({ key: Buffer.from(t, 'base64'), format: 'der', type: 'pkcs8' });
}

// ---------- firmar ----------
function firmar(dir, privada, { autor = '', fecha = new Date().toISOString() } = {}) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`no existe la carpeta ${dir}`);
  const kp = clavePrivada(privada);
  if (kp.asymmetricKeyType !== 'ed25519') throw new Error('la clave no es ed25519');
  const datos = { formato: FORMATO, autor: String(autor || ''), clavePublica: publicaB64(crypto.createPublicKey(kp)), fecha, archivos: hashes(dir) };
  if (!Object.keys(datos.archivos).length) throw new Error('la carpeta está vacía');
  const firma = crypto.sign(null, Buffer.from(canonico(datos)), kp).toString('base64');
  const out = { ...datos, firma };
  fs.writeFileSync(path.join(dir, ARCHIVO), JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---------- verificar ----------
function verificar(dir, autores = []) {
  const f = path.join(dir, ARCHIVO);
  if (!fs.existsSync(f)) return { estado: 'sin-firma' };
  const mal = motivo => ({ estado: 'invalida', motivo });
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return mal('FIRMA.json no es JSON válido'); }
  if (!j || j.formato !== FORMATO || typeof j.firma !== 'string' || !j.archivos || typeof j.archivos !== 'object') return mal('FIRMA.json con formato desconocido');
  const { firma, ...datos } = j;
  let k; try { k = clavePublica(j.clavePublica); } catch (e) { return mal(e.message); }
  let ok = false; try { ok = crypto.verify(null, Buffer.from(canonico(datos)), k, Buffer.from(firma, 'base64')); } catch { }
  if (!ok) return mal('la firma no corresponde al contenido de FIRMA.json');
  const ahora = hashes(dir), alterados = [], faltan = [], sobran = [];
  for (const [a, h] of Object.entries(j.archivos)) { if (!(a in ahora)) faltan.push(a); else if (ahora[a] !== h) alterados.push(a); }
  for (const a of Object.keys(ahora)) if (!(a in j.archivos)) sobran.push(a);
  if (alterados.length || faltan.length || sobran.length) {
    const p = [alterados.length && `alterados: ${alterados.slice(0, 5).join(', ')}`, faltan.length && `faltan: ${faltan.slice(0, 5).join(', ')}`, sobran.length && `añadidos sin firmar: ${sobran.slice(0, 5).join(', ')}`].filter(Boolean);
    return { ...mal(`los archivos no coinciden con la firma (${p.join('; ')})`), alterados, faltan, sobran };
  }
  const pub = publicaB64(k), confianza = (autores || []).find(a => a && normPublica(a.clavePublica) === pub);
  const base = { clave: pub.slice(0, 12), autorDeclarado: String(j.autor || ''), fechaFirma: j.fecha || null, archivos: Object.keys(j.archivos).length };
  return confianza ? { estado: 'verificada', autor: String(confianza.nombre || j.autor || 'autor de confianza'), ...base }
    : { estado: 'desconocida', motivo: 'firma correcta pero la clave no está en tus autores de confianza', ...base };
}

module.exports = { ARCHIVO, FORMATO, firmar, verificar, generarClaves, clavePublica, normPublica, hashes, canonico };

// ---------- CLI ----------
if (require.main === module) {
  const a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i >= 0 ? a.splice(i, 2)[1] : undefined; };
  try {
    if (a.includes('--generar')) {
      a.splice(a.indexOf('--generar'), 1);
      const salida = opt('--salida') || process.cwd(), nombre = a[0] || 'apolo-autor';
      const { privada, publica } = generarClaves();
      const fp = path.join(salida, `${nombre}.clave`);
      if (fs.existsSync(fp)) throw new Error(`ya existe ${fp} (no lo sobrescribo)`);
      fs.writeFileSync(fp, privada, { mode: 0o600 });
      console.log(`Clave PRIVADA guardada en ${fp} (no la compartas ni la subas al repo).`);
      console.log(`Clave PÚBLICA: ${publica}`);
      console.log(`Para confiar en ella, en config.json → skills.autoresConfianza: [{ "nombre": "${nombre}", "clavePublica": "${publica}" }]`);
    } else if (a.includes('--verificar')) {
      a.splice(a.indexOf('--verificar'), 1);
      const pub = opt('--publica');
      const r = verificar(path.resolve(a[0] || '.'), pub ? [{ nombre: 'clave indicada', clavePublica: pub }] : []);
      console.log(JSON.stringify(r, null, 2));
      process.exitCode = r.estado === 'invalida' ? 2 : r.estado === 'sin-firma' ? 1 : 0;
    } else {
      const clave = opt('--clave'), autor = opt('--autor');
      if (!a[0] || !clave) throw new Error('uso: node core/skills/firmar.js <carpeta> --clave <privada.pem> [--autor "Nombre"]  ·  --generar [nombre]  ·  --verificar <carpeta>');
      const r = firmar(path.resolve(a[0]), clave, { autor });
      console.log(`Firmados ${Object.keys(r.archivos).length} archivos → ${path.join(path.resolve(a[0]), ARCHIVO)} (clave ${r.clavePublica.slice(0, 12)}…)`);
    }
  } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
}
