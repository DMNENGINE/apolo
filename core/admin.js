// Funciones del panel de control: configuración editable (sin exponer claves), uso agregado.
const fs = require('fs');
const path = require('path');

// copia de la config apta para el navegador: las API keys nunca salen, solo si están puestas
const FLAGS_PLUGINS = ['discordComoPlugin'];   // Telegram y WhatsApp ya son siempre plugin   // se aplican al reiniciar la app
function configPublica(cfg) {
  const proveedores = {};
  for (const [k, p] of Object.entries(cfg.proveedores)) {
    const { apiKey, apiKeyRef, ...resto } = p;
    proveedores[k] = { ...resto, tieneKey: !!apiKey && apiKey !== 'ollama', keyDeEntorno: !!(p.env && process.env[p.env]), enBoveda: !!apiKeyRef };
  }
  return { herramientasOff: cfg.herramientasOff || [], modeloPorDefecto: cfg.modeloPorDefecto, alias: cfg.alias, permisos: cfg.permisos, maxPasos: cfg.maxPasos, puerto: cfg.puerto, carpeta: cfg.carpeta || '', proveedores, dir: cfg.dir,
    idioma: cfg.idioma || '', bienvenida: cfg.bienvenida === true, isla: cfg.isla || { estilo: 'glass', fondo: '', borde: '', bordeAncho: 1 },
    // canales como plugins (flags de la app) y por qué el de Discord no puede arrancar (modo Pi / bot local), si es el caso
    plugins: { ...Object.fromEntries(FLAGS_PLUGINS.map(k => [k, !!(cfg.plugins && cfg.plugins[k])])), discordBloqueado: (cfg.plugins && cfg.plugins.discord && cfg.plugins.discord.bloqueado) || '' } };      // idioma '' = automático (el del sistema); bienvenida = asistente de primer arranque hecho
}

// aplica cambios del panel a la config en memoria y en config.json
function guardarConfig(cfg, cambios) {
  const f = path.join(cfg.dir, 'config.json');
  let disco = {}; try { disco = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
  if (typeof cambios.modeloPorDefecto === 'string' && cambios.modeloPorDefecto.includes('/')) cfg.modeloPorDefecto = disco.modeloPorDefecto = cambios.modeloPorDefecto.trim();
  if (Number.isInteger(cambios.maxPasos) && cambios.maxPasos >= 1 && cambios.maxPasos <= 200) cfg.maxPasos = disco.maxPasos = cambios.maxPasos;
  if (typeof cambios.carpeta === 'string') cfg.carpeta = disco.carpeta = cambios.carpeta.trim();
  if (typeof cambios.idioma === 'string' && /^([a-z]{2})?$/.test(cambios.idioma)) cfg.idioma = disco.idioma = cambios.idioma;
  if (typeof cambios.bienvenida === 'boolean') cfg.bienvenida = disco.bienvenida = cambios.bienvenida;
  if (cambios.isla && typeof cambios.isla === 'object') {           // apariencia de la nube flotante
    const i = cfg.isla = { estilo: 'glass', fondo: '', borde: '', bordeAncho: 1, ...(cfg.isla || {}) }, c = cambios.isla;
    const hex = x => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x);
    if (['glass', 'liquid', 'solido'].includes(c.estilo)) i.estilo = c.estilo;
    if (c.fondo === '' || hex(c.fondo)) i.fondo = c.fondo;
    if (c.borde === '' || hex(c.borde)) i.borde = c.borde;
    if (Number.isFinite(c.bordeAncho) && c.bordeAncho >= 0 && c.bordeAncho <= 4) i.bordeAncho = c.bordeAncho;
    disco.isla = i;
  }
  if (cambios.permisos && ['preguntar', 'auto', 'solo-lectura'].includes(cambios.permisos.modo)) {
    cfg.permisos.modo = cambios.permisos.modo; disco.permisos = { ...disco.permisos, modo: cambios.permisos.modo };
  }
  if (Array.isArray(cambios.herramientasOff)) {
    const validas = new Set(require('./herramientas').HERRAMIENTAS.map(h => h.nombre));
    cfg.herramientasOff = disco.herramientasOff = cambios.herramientasOff.filter(x => validas.has(x));
  }
  if (cambios.alias && typeof cambios.alias === 'object') {
    const limpio = {};
    for (const [k, v] of Object.entries(cambios.alias)) if (/^[\w.-]{1,30}$/.test(k) && typeof v === 'string' && v.includes('/')) limpio[k.toLowerCase()] = v.trim();
    cfg.alias = disco.alias = limpio;
  }
  if (cambios.proveedores && typeof cambios.proveedores === 'object') {
    disco.proveedores = disco.proveedores || {};
    for (const [k, v] of Object.entries(cambios.proveedores)) {
      if (!/^[\w-]{1,30}$/.test(k) || !v || typeof v !== 'object') continue;
      if (v === null || v.borrar) { delete cfg.proveedores[k]; delete disco.proveedores[k]; continue; }
      const p = cfg.proveedores[k] || (cfg.proveedores[k] = { tipo: ['openai', 'anthropic', 'gemini', 'claude-cli', 'codex-cli', 'responses'].includes(v.tipo) ? v.tipo : 'openai' });
      const d = disco.proveedores[k] || (disco.proveedores[k] = {});
      if (!d.tipo) d.tipo = p.tipo;
      if (typeof v.baseUrl === 'string' && /^https?:\/\//.test(v.baseUrl)) p.baseUrl = d.baseUrl = v.baseUrl.trim().replace(/\/+$/, '');
      if (typeof v.apiKey === 'string') {                     // FASE 9: a la bóveda (DPAPI); en config.json solo la referencia
        const clave = v.apiKey.trim(); p.apiKey = clave;
        if (cfg.boveda && clave && !p.local && !['ollama', 'lm-studio'].includes(clave)) {
          try { cfg.boveda.guardar(`proveedor:${k}`, clave); d.apiKey = ''; d.apiKeyRef = p.apiKeyRef = `boveda:proveedor:${k}`; }
          catch { d.apiKey = clave; }                              // sin bóveda: como antes
        } else {
          d.apiKey = clave;
          if (!clave) { try { cfg.boveda?.borrar(`proveedor:${k}`); } catch { } delete d.apiKeyRef; delete p.apiKeyRef; }   // '' = quitar la clave
        }
      }
      if (typeof v.local === 'boolean') p.local = d.local = v.local;
    }
  }
  if (cambios.plugins && typeof cambios.plugins === 'object') {
    for (const k of FLAGS_PLUGINS) if (typeof cambios.plugins[k] === 'boolean') {
      cfg.plugins = cfg.plugins || {}; cfg.plugins[k] = cambios.plugins[k];
      disco.plugins = { ...(disco.plugins || {}), [k]: cambios.plugins[k] };
    }
  }
  fs.writeFileSync(f, JSON.stringify(disco, null, 2));
  return configPublica(cfg);
}

// uso por modelo y por día a partir de las sesiones guardadas
function uso(sesiones, dias = 30) {
  const desde = Date.now() - dias * 86400_000;
  const porModelo = {}, porDia = {};
  let sesionesN = 0;
  for (const s of sesiones.lista()) {
    if ((s.actualizada || 0) < desde) continue;
    sesionesN++;
    const e = s.uso?.entrada || 0, o = s.uso?.salida || 0;
    const m = porModelo[s.modelo] || (porModelo[s.modelo] = { entrada: 0, salida: 0, sesiones: 0 });
    m.entrada += e; m.salida += o; m.sesiones++;
    const dia = new Date(s.actualizada).toISOString().slice(0, 10);
    const d = porDia[dia] || (porDia[dia] = { entrada: 0, salida: 0 });
    d.entrada += e; d.salida += o;
  }
  return { dias, sesiones: sesionesN, porModelo, porDia };
}

module.exports = { configPublica, guardarConfig, uso };
