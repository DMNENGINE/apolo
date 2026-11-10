// "Lo nuevo" tras actualizar: la primera vez que se abre una versión con entrada en novedades.json,
// la isla lo cuenta y el casco enseña sus animaciones una tras otra. Se marca como visto al enviarlo
// (si se cierra la app a mitad no vuelve a salir). Estado en <userData>/novedades-vistas.json.
'use strict';
const fs = require('fs');
const path = require('path');

function comparar(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

function crearNovedades({ userData, version, archivo = path.join(__dirname, '..', 'novedades.json') }) {
  const estado = path.join(userData, 'novedades-vistas.json');
  const leerVista = () => { try { return JSON.parse(fs.readFileSync(estado, 'utf8')).version || null; } catch { return null; } };
  function catalogo() { try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return {}; } }
  // Devuelve { version, es, en } si hay novedades de esta versión que el usuario aún no ha visto.
  function pendiente({ forzar = false } = {}) {
    const vista = leerVista(), entrada = catalogo()[version];
    if (!entrada || (!forzar && vista && comparar(vista, version) >= 0)) return null;
    return { version, es: entrada.es || null, en: entrada.en || entrada.es || null };
  }
  function marcar() {
    try { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(estado, JSON.stringify({ version, vista: new Date().toISOString() })); } catch { /* sin disco: se volverá a enseñar */ }
  }
  return { pendiente, marcar, comparar };
}

module.exports = { crearNovedades, comparar };
