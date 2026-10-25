// Admite el despliegue antiguo con copia local y el checkout completo del repo.
const fs = require('fs');
const path = require('path');
function cargarBot(dir = __dirname) {
  const local = path.join(dir, 'bot-discord.js');
  return require(fs.existsSync(local) ? local : path.join(dir, '..', 'bot-discord.js'));
}
module.exports = { cargarBot };
