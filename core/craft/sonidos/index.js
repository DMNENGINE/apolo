// Efectos de sonido propios (sonidos.py, sintetizados con numpy). Se generan una vez en la carpeta de datos.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = 1;                                     // súbela si cambia sonidos.py: se regeneran
function asegurar({ carpeta, python = 'python' }) {
  fs.mkdirSync(carpeta, { recursive: true });
  const marca = path.join(carpeta, `v${VERSION}.ok`);
  if (!fs.existsSync(marca)) {
    execFileSync(python, ['-I', path.join(__dirname, 'sonidos.py'), carpeta], { windowsHide: true, timeout: 120_000 });
    fs.writeFileSync(marca, String(Date.now()));
  }
  return nombre => path.join(carpeta, `${nombre}.wav`);
}
module.exports = { asegurar, VERSION };
