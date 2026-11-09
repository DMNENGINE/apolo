// Dataset de APOLO para entrenar su propio modelo (formato chatml de Soup: {"messages":[...]}).
// Sale de las conversaciones de APOLO (nucleo/sesiones), con reglas estrictas:
//  - SOLO sesiones cuyas respuestas son de modelos con licencia que permite entrenar (por defecto Ollama: gemma/qwen/llama…).
//    Fuera Claude/Claude Code (condiciones de Anthropic), ChatGPT/OpenAI/Codex, Gemini y cualquier sesión que mezcle alguno.
//  - Fuera tareas automáticas, subagentes, conciencia, evaluaciones, consejos y respuestas vacías / "NADA" / de error.
//  - Claves y datos sensibles tapados (seguridad.redactar + correos, teléfonos y la ruta de usuario de Windows).
//  - Sin duplicados. Ventanas de varios turnos que caben en el contexto del entrenamiento.
// Resultado en <nucleo>/dataset/: apolo-train.jsonl, apolo-val.jsonl, muestra.json, resumen.json (para revisarlo antes de subirlo).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { redactar } = require('./seguridad');

const PERMITIDOS = ['ollama', 'lmstudio'];            // proveedores cuyas salidas se pueden usar para entrenar (pesos abiertos)
const CANALES_FUERA = new Set(['conciencia', 'eval', 'subagente', 'consejo', 'claude-code', 'tarea']);
const BASURA = /^\s*(NADA|nada\.?|ok\.?|vale\.?)\s*$|^error:|^\(sin respuesta\)/i;

function limpiar(t, home) {
  let s = redactar(String(t || ''));
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '[correo]')
    .replace(/\+\d{1,3}[\s-]?\d[\d\s-]{6,}\d|\d{3}[\s-]\d{3}[\s-]\d{3,4}/g, '[teléfono]');   // con prefijo o con separadores (los ids de pestaña no)
  if (home) s = s.split(home).join('C:\\Users\\usuario').split(home.replace(/\\/g, '/')).join('C:/Users/usuario');
  return s.replace(/\r/g, '').trim();
}

function crearDataset({ cfg, nombre = () => 'APOLO' }) {
  const conf = () => ({ permitidos: PERMITIDOS, maxChars: 5500, val: 0.05, minEjemplos: 200, ...(cfg.dataset || {}) });
  const dirSes = () => path.join(cfg.dir, 'sesiones');
  const dirOut = () => { const d = path.join(cfg.dir, 'dataset'); fs.mkdirSync(d, { recursive: true }); return d; };

  function exportar() {
    const c = conf(), home = os.homedir();
    const system = c.system || `Eres ${nombre()}, el asistente personal de tu usuario en su PC. Respondes en español, directo, con su mismo tono, y usas tus herramientas cuando hace falta.`;
    const fuera = {}, contar = k => { fuera[k] = (fuera[k] || 0) + 1; };
    const ejemplos = [], vistos = new Set();
    let sesiones = 0, usadas = 0;
    const archivos = fs.existsSync(dirSes()) ? fs.readdirSync(dirSes()).filter(f => f.endsWith('.json')) : [];
    for (const f of archivos) {
      sesiones++;
      let m; try { m = JSON.parse(fs.readFileSync(path.join(dirSes(), f), 'utf8')); } catch { contar('ilegible'); continue; }
      if (String(m.id || '').startsWith('cc-') || m.externo) { contar('Claude Code (no se puede usar)'); continue; }
      if (m.tarea || m.padre || CANALES_FUERA.has(m.canal) || m.soloLectura) { contar('automática / subagente / interna'); continue; }
      const modelos = new Set([m.modelo, ...Object.keys(m.usoPorModelo || {})].filter(Boolean));
      const ALIAS_ABIERTOS = /^(gemma|qwen|llama|mistral|phi|beam)/i;   // alias de modelos de Ollama sin proveedor
      const prohibido = [...modelos].find(x => !(c.permitidos.includes(String(x).split('/')[0]) || (!String(x).includes('/') && ALIAS_ABIERTOS.test(x))));
      if (!modelos.size) { contar('sin modelo conocido'); continue; }
      if (prohibido) { contar(`modelo no permitido (${String(prohibido).split('/')[0]})`); continue; }
      const jl = path.join(dirSes(), f.replace(/\.json$/, '.jsonl'));
      if (!fs.existsSync(jl)) { contar('sin mensajes'); continue; }
      // turnos: mensaje del usuario → última respuesta con texto antes del siguiente mensaje del usuario
      const turnos = []; let cur = null;
      for (const l of fs.readFileSync(jl, 'utf8').split('\n')) {
        if (!l.trim()) continue;
        let x; try { x = JSON.parse(l); } catch { continue; }
        if (x.role === 'compactacion') continue;
        if (x.role === 'user') { if (cur && cur.a) turnos.push(cur); cur = { u: String(x.content || ''), a: '' }; }
        else if (x.role === 'assistant' && cur && typeof x.content === 'string' && x.content.trim()) cur.a = x.content;
      }
      if (cur && cur.a) turnos.push(cur);
      const buenos = turnos.filter(t => t.u.trim().length >= 2 && t.u.length < 4000 && !/\(Tarea automática/i.test(t.u) && t.a.trim().length >= 8 && !BASURA.test(t.a.trim()));
      if (!buenos.length) { contar('sin turnos útiles'); continue; }
      usadas++;
      // ventanas de varios turnos seguidos que caben en maxChars
      let win = [], largo = 0;
      const cerrar = () => {
        if (!win.length) return;
        const mensajes = [{ role: 'system', content: system }];
        for (const t of win) mensajes.push({ role: 'user', content: limpiar(t.u, home) }, { role: 'assistant', content: limpiar(t.a, home) });
        const h = crypto.createHash('sha1').update(JSON.stringify(mensajes.slice(1))).digest('hex');
        if (!vistos.has(h)) { vistos.add(h); ejemplos.push({ messages: mensajes, _sesion: m.id }); } else contar('duplicado');
        win = []; largo = 0;
      };
      for (const t of buenos) {
        const n = t.u.length + t.a.length;
        if (n > c.maxChars) { cerrar(); contar('turno demasiado largo'); continue; }
        if (largo + n > c.maxChars) cerrar();
        win.push(t); largo += n;
      }
      cerrar();
    }
    // separación entrenamiento / validación POR SESIÓN (una conversación no puede estar en los dos lados)
    const ses = [...new Set(ejemplos.map(e => e._sesion))].sort(() => Math.random() - .5);
    const nVal = Math.max(ejemplos.length >= 40 ? 1 : 0, Math.round(ses.length * c.val)), sVal = new Set(ses.slice(0, nVal));
    const train = ejemplos.filter(e => !sVal.has(e._sesion)), val = ejemplos.filter(e => sVal.has(e._sesion));
    const linea = e => JSON.stringify({ messages: e.messages });
    fs.writeFileSync(path.join(dirOut(), 'apolo-train.jsonl'), train.map(linea).join('\n') + '\n');
    fs.writeFileSync(path.join(dirOut(), 'apolo-val.jsonl'), val.map(linea).join('\n') + '\n');
    const muestra = [...ejemplos].sort(() => Math.random() - .5).slice(0, 25).map(e => e.messages);
    fs.writeFileSync(path.join(dirOut(), 'muestra.json'), JSON.stringify(muestra, null, 1));
    const caracteres = ejemplos.reduce((s, e) => s + e.messages.reduce((t, x) => t + x.content.length, 0), 0);
    const resumen = { fecha: Date.now(), sesiones, usadas, ejemplos: ejemplos.length, train: train.length, val: val.length, caracteres,
      fuera: Object.entries(fuera).sort((a, b) => b[1] - a[1]), permitidos: c.permitidos, suficiente: ejemplos.length >= c.minEjemplos, dir: dirOut() };
    fs.writeFileSync(path.join(dirOut(), 'resumen.json'), JSON.stringify(resumen, null, 1));
    return resumen;
  }
  const leer = n => { try { return JSON.parse(fs.readFileSync(path.join(dirOut(), n), 'utf8')); } catch { return null; } };
  async function http(M, p) {   // /v1/dataset
    if (M === 'GET' && !p[2]) return { resumen: leer('resumen.json'), muestra: leer('muestra.json') || [] };
    if (M === 'POST' && p[2] === 'exportar') { const r = exportar(); return { resumen: r, muestra: leer('muestra.json') || [] }; }
    throw Object.assign(new Error('ruta desconocida'), { status: 404 });
  }
  return { exportar, http, dir: dirOut };
}

module.exports = { crearDataset, limpiar, PERMITIDOS };
