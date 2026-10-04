// Reglas "Permitir siempre" de los hooks (reglas.json en userData). Bash/PowerShell = 1-2 primeras palabras; archivos = carpeta.
const fs = require('fs');
const path = require('path');

function crearReglas(archivo) {
  let rules = [];
  const cargar = () => { try { rules = JSON.parse(fs.readFileSync(archivo(), 'utf8')); } catch { rules = []; } };
  const guardar = () => fs.writeFileSync(archivo(), JSON.stringify(rules, null, 2));
  function ruleFor(tool, inp = {}) {
    if (tool === 'Bash' || tool === 'PowerShell') {
      const w = String(inp.command || '').trim().split(/\s+/);
      const pre = w[1] && !w[1].startsWith('-') ? `${w[0]} ${w[1]}` : w[0];
      return { tool, prefix: pre, label: `${tool}: ${pre} …` };
    }
    if (inp.file_path) {
      const dir = path.dirname(String(inp.file_path)).replace(/\\/g, '/');
      return { tool, prefix: dir, label: `${tool} en ${dir}` };
    }
    return { tool, prefix: '', label: tool };
  }
  function coincide(tool, inp = {}) {
    return rules.find(r => {
      if (r.tool !== tool) return false;
      if (tool === 'Bash' || tool === 'PowerShell') {
        const c = String(inp.command || '').trim();
        return c === r.prefix || c.startsWith(r.prefix + ' ');
      }
      if (r.prefix) return String(inp.file_path || '').replace(/\\/g, '/').startsWith(r.prefix + '/');
      return true;
    });
  }
  function agregar(tool, inp) {
    const r = ruleFor(tool, inp);
    if (!rules.some(x => x.tool === r.tool && x.prefix === r.prefix)) { rules.push(r); guardar(); }
  }
  return {
    cargar, coincide, agregar,
    lista: () => rules,
    quitar(i) { rules.splice(i, 1); guardar(); },
    quitarTodas() { rules = []; guardar(); },
  };
}

module.exports = { crearReglas };
