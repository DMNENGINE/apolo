// Almacén de conexiones: %APPDATA%\robot-companion\conectores.json.
// Los secretos (contraseñas de aplicación, tokens) van cifrados con el cifrado del sistema (Electron safeStorage = DPAPI en Windows).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function crearAlmacen({ dir, cifrar, descifrar, log = console.log }) {
  const f = path.join(dir, 'conectores.json');
  let d = { config: {}, cuentas: [], servicios: {}, secretos: {} };
  try { d = { ...d, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { }
  const guardar = () => { fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 2)); fs.renameSync(f + '.tmp', f); };
  const cifrado = !!cifrar;
  if (!cifrado) log('[conectores] sin cifrado del sistema: los secretos se guardan solo codificados');

  const enc = s => (cifrar ? 'dpapi:' + cifrar(String(s)).toString('base64') : 'plano:' + Buffer.from(String(s)).toString('base64'));
  const dec = s => {
    if (!s) return '';
    if (s.startsWith('dpapi:')) return descifrar ? descifrar(Buffer.from(s.slice(6), 'base64')) : '';
    if (s.startsWith('plano:')) return Buffer.from(s.slice(6), 'base64').toString('utf8');
    return '';
  };

  return {
    cifrado,
    config: () => d.config,
    ponerConfig(c) { d.config = { ...d.config, ...c }; guardar(); },
    cuentas: () => d.cuentas,
    agregarCuenta(c) {
      const id = 'c_' + crypto.randomBytes(5).toString('hex');
      d.cuentas.push({ ...c, id, creada: new Date().toISOString() }); guardar();
      return id;
    },
    actualizar(id, cambios) { const c = d.cuentas.find(x => x.id === id); if (c) { Object.assign(c, cambios); guardar(); } },
    quitarCuenta(id) { d.cuentas = d.cuentas.filter(c => c.id !== id); delete d.secretos[id]; guardar(); },
    servicio: k => d.servicios[k] || null,
    ponerServicio(k, v) { if (v) d.servicios[k] = { ...d.servicios[k], ...v }; else { delete d.servicios[k]; delete d.secretos['srv:' + k]; } guardar(); },
    secreto: id => dec(d.secretos[id]),
    guardarSecreto(id, s) { d.secretos[id] = enc(s); guardar(); },
  };
}

module.exports = { crearAlmacen };
