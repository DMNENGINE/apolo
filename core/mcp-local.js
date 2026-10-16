// Servidores MCP locales (stdio): la suite ArtCraft (FilmCraft, PhotoCraft, CadCraft…) y cualquier otro `comando mcp`.
//  - Cada servidor es UNA herramienta del agente (`filmcraft`, `cadcraft`…): sin `herramienta` lista lo que ofrece (con filtro);
//    con `herramienta` + `args` la llama. Así una app con 330 herramientas (LightCraft) no llena el prompt de los modelos locales.
//  - Riesgo por llamada: lo que solo mira (list/inspect/get/render…) pasa solo; lo demás pregunta, y "siempre" vale para esa app.
//  - El proceso arranca al primer uso y se para tras cfg.mcpLocales.inactivoMin (30) sin uso — su estado en memoria se pierde,
//    por eso las instrucciones piden guardar el proyecto. El pánico los mata todos.
//  - La primera vez detecta la suite ArtCraft instalada (Program Files\*Craft\*-cli.exe) y la activa; "detectar" lo repite.
// Config: <datos>/mcp-locales.json  [{ id, nombre, comando, args[], activo, descripcion, origen, herramientas:[{name,description}], instrucciones }]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VERSION_MCP = '2025-06-18';
// apps de la suite ArtCraft (github.com/storytold): carpeta en Program Files, ejecutable <id>-cli.exe, args para modo sin ventana
const CRAFT = {
  filmcraft: { nombre: 'FilmCraft', carpeta: 'FilmCraft', descripcion: 'editor de vídeo (estilo Premiere): cortar, montar, títulos y subtítulos en pantalla, efectos, audio, exportar MP4' },
  effectcraft: { nombre: 'EffectCraft', carpeta: 'EffectCraft', descripcion: 'motion graphics y efectos (estilo After Effects): composiciones, capas, keyframes, render' },
  photocraft: { nombre: 'PhotoCraft', carpeta: 'PhotoCraft', descripcion: 'editor de fotos (estilo Photoshop): capas, retoque, recortes, texto, exportar PNG/JPG' },
  lightcraft: { nombre: 'LightCraft', carpeta: 'LightCraft', descripcion: 'revelado de fotos (estilo Lightroom): exposición, color, lotes de fotos, exportar' },
  vectorcraft: { nombre: 'VectorCraft', carpeta: 'VectorCraft', args: ['--headless'], descripcion: 'dibujo vectorial (estilo Illustrator): logos, iconos, SVG' },
  cadcraft: { nombre: 'CadCraft', carpeta: 'CADCraft', descripcion: 'CAD 2D/3D (estilo AutoCAD): planos, piezas, cotas, DXF/DWG/PDF' },
  figcraft: { nombre: 'FigCraft', carpeta: 'FigCraft', descripcion: 'diseño de interfaces (estilo Figma): pantallas, componentes, prototipos' },
  designcraft: { nombre: 'DesignCraft', carpeta: 'DesignCraft', descripcion: 'maquetación (estilo InDesign): páginas, pósters, folletos, PDF' },
  deckcraft: { nombre: 'DeckCraft', carpeta: 'DeckCraft', descripcion: 'presentaciones (estilo PowerPoint): diapositivas, exportar PPTX/PDF' },
  wordcraft: { nombre: 'WordCraft', carpeta: 'WordCraft', descripcion: 'procesador de texto (estilo Word): documentos, estilos, exportar DOCX/PDF' },
  gridcraft: { nombre: 'GridCraft', carpeta: 'GridCraft', descripcion: 'hoja de cálculo (estilo Excel): celdas, fórmulas, gráficos, XLSX/CSV' },
  pdfcraft: { nombre: 'PdfCraft', carpeta: 'PdfCraft', descripcion: 'lector y editor de PDF: páginas, texto, anotaciones, formularios, unir/dividir' },
  soundcraft: { nombre: 'SoundCraft', carpeta: 'SoundCraft', descripcion: 'estudio de audio (DAW): pistas, mezcla, efectos, exportar WAV/MP3' },
};
// nombres de herramientas MCP que solo miran: no piden permiso
const SOLO_MIRA = /^(list|inspect|get|find|query|read|search|describe|info|render|screenshot|ui_inspect|ui_elements|doc_inspect|doc_info|doc_list|project_inspect|sequence_inspect|command_list|list_commands|fonts?_list)|(_|^)(list|inspect|info|get|read|search|query|describe|preview|thumbnail)(_|$)/i;
// comandos "<algo>.list" / "x.inspect" dentro de command_run / execute: también solo miran
const CMD_MIRA = /\.(list|inspect|get|search|models|formats|used|controls)$|^(fonts|export\.formats|export\.presets\.list|transcript\.inspect|transcript\.search|graphics\.list|captions\.list)/i;

function detectarCraft(raices) {
  const out = [];
  const bases = raices || (process.platform === 'win32'
    ? [process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)
    : ['/usr/local/bin', '/usr/bin', '/opt']);
  for (const [id, k] of Object.entries(CRAFT)) {
    for (const b of bases) {
      const exe = path.join(b, k.carpeta, `${id}-cli${process.platform === 'win32' ? '.exe' : ''}`);
      const plano = path.join(b, `${id}-cli`);
      const ruta = fs.existsSync(exe) ? exe : fs.existsSync(plano) ? plano : null;
      if (ruta) { out.push({ id, nombre: k.nombre, comando: ruta, args: ['mcp', ...(k.args || [])], descripcion: k.descripcion, origen: 'craft' }); break; }
    }
  }
  return out;
}

function crearMcpLocales({ cfg, bus, registrar, quitar, lanzar = spawn, detectar = detectarCraft, log = () => { } }) {
  const dir = cfg.dir, F = path.join(dir, 'mcp-locales.json');
  const conf = () => ({ inactivoMin: 30, timeoutSeg: 600, ...(cfg.mcpLocales || {}) });
  let lista = null;
  try { lista = JSON.parse(fs.readFileSync(F, 'utf8')); } catch { }
  const guardar = () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(F, JSON.stringify(lista, null, 2)); };
  const obtener = id => lista.find(x => x.id === id);
  if (!Array.isArray(lista)) {                         // primera vez: la suite ArtCraft instalada entra activa
    lista = [];
    try { for (const s of detectar()) lista.push({ ...s, activo: true, herramientas: [] }); } catch (e) { log('[mcp-local] detectar:', e.message); }
    guardar();
  }

  const vivos = new Map();                             // id → { p, pendientes: Map, buf, siguiente, iniciado, temp, instrucciones }

  function arrancar(s) {
    let v = vivos.get(s.id);
    if (v) return v;
    const p = lanzar(s.comando, s.args || [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: { ...process.env, ...(s.env || {}) } });
    v = { p, pendientes: new Map(), buf: '', siguiente: 1, iniciado: null };
    vivos.set(s.id, v);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', d => {
      v.buf += d;
      let i;
      while ((i = v.buf.indexOf('\n')) >= 0) {
        const linea = v.buf.slice(0, i).trim(); v.buf = v.buf.slice(i + 1);
        if (!linea) continue;
        let m; try { m = JSON.parse(linea); } catch { continue; }
        const pend = m.id != null && v.pendientes.get(m.id);
        if (pend) { v.pendientes.delete(m.id); clearTimeout(pend.t); m.error ? pend.mal(new Error(`${s.nombre}: ${m.error.message || JSON.stringify(m.error)}`)) : pend.ok(m.result); }
      }
    });
    const morir = motivo => {
      if (vivos.get(s.id) !== v) return;
      vivos.delete(s.id); clearTimeout(v.temp);
      for (const pend of v.pendientes.values()) { clearTimeout(pend.t); pend.mal(new Error(`${s.nombre} se cerró (${motivo})`)); }
      v.pendientes.clear();
    };
    p.on('exit', c => morir(`código ${c}`));
    p.on('error', e => { morir(e.message); log('[mcp-local]', s.id, e.message); });
    p.stdin.on('error', () => { });
    return v;
  }

  function rpc(s, metodo, params, { timeoutSeg } = {}) {
    const v = arrancar(s);
    const id = v.siguiente++;
    return new Promise((ok, mal) => {
      const t = setTimeout(() => { v.pendientes.delete(id); mal(new Error(`${s.nombre}: sin respuesta en ${timeoutSeg || conf().timeoutSeg} s (${metodo})`)); }, (timeoutSeg || conf().timeoutSeg) * 1000);
      t.unref?.();
      v.pendientes.set(id, { ok, mal, t });
      v.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: metodo, params: params || {} }) + '\n');
    });
  }

  async function iniciar(s) {
    const v = arrancar(s);
    if (!v.iniciado) {
      v.iniciado = (async () => {
        const r = await rpc(s, 'initialize', { protocolVersion: VERSION_MCP, capabilities: {}, clientInfo: { name: 'APOLO', version: '1' } }, { timeoutSeg: 60 });
        v.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        if (r?.instructions && r.instructions !== s.instrucciones) { s.instrucciones = String(r.instructions).slice(0, 4000); guardar(); }
        return r;
      })();
      v.iniciado.catch(() => { v.iniciado = null; });
    }
    await v.iniciado;
    clearTimeout(v.temp);                              // se apaga solo tras un rato sin uso
    v.temp = setTimeout(() => parar(s.id, 'inactivo'), conf().inactivoMin * 60_000); v.temp.unref?.();
    return v;
  }

  async function refrescarHerramientas(id) {
    const s = obtener(id); if (!s) throw new Error(`no existe el servidor ${id}`);
    await iniciar(s);
    const r = await rpc(s, 'tools/list', {}, { timeoutSeg: 60 });
    s.herramientas = (r.tools || []).map(t => ({ name: t.name, description: String(t.description || '').slice(0, 600), inputSchema: t.inputSchema || { type: 'object', properties: {} } }));
    s.probado = Date.now(); guardar(); registrarDe(s);
    return s.herramientas;
  }

  // resultado MCP → texto o { texto, imagenes } (imágenes a <datos>/capturas/mcp, como los MCP remotos)
  function convertir(id, res) {
    const textos = [], imagenes = [];
    const dirImg = path.join(dir, 'capturas', 'mcp');
    for (const c of res?.content || []) {
      if (c.type === 'text') textos.push(c.text);
      else if (c.type === 'image' && c.data) {
        fs.mkdirSync(dirImg, { recursive: true });
        const ext = /png/.test(c.mimeType) ? 'png' : /webp/.test(c.mimeType) ? 'webp' : 'jpg';
        const ruta = path.join(dirImg, `${id}-${Date.now()}-${imagenes.length}.${ext}`);
        fs.writeFileSync(ruta, Buffer.from(c.data, 'base64')); imagenes.push({ mime: c.mimeType || 'image/png', ruta });
      } else if (c.type === 'resource' && c.resource?.text) textos.push(c.resource.text);
      else if (c.type === 'resource_link') textos.push(`${c.name || ''} ${c.uri}`);
    }
    if (res?.structuredContent && !textos.length) textos.push(JSON.stringify(res.structuredContent));
    const crudo = textos.join('\n');
    const texto = (res?.isError ? '⚠ ' : '') + (crudo.length > 30_000 ? crudo.slice(0, 30_000) + `\n…[recortado, ${crudo.length - 30_000} caracteres más: pide algo más concreto o usa un filtro]` : crudo || '(sin texto)')
      + (imagenes.length ? `\n(${imagenes.length} imagen(es) adjunta(s): ${imagenes.map(i => i.ruta).join(', ')})` : '');
    return imagenes.length ? { texto, imagenes } : texto;
  }

  async function llamar(id, nombre, args = {}) {
    const s = obtener(id); if (!s) throw new Error(`no existe el servidor ${id}`);
    await iniciar(s);
    return rpc(s, 'tools/call', { name: nombre, arguments: args || {} });
  }

  function listar(s, filtro) {
    const hs = s.herramientas || [];
    const f = String(filtro || '').toLowerCase();
    const sel = f ? hs.filter(h => (h.name + ' ' + h.description).toLowerCase().includes(f)) : hs;
    const cab = `${s.nombre}: ${sel.length}${f ? ` de ${hs.length}` : ''} herramientas. Llama con {"herramienta": "<nombre>", "args": {…}}; {"esquema": "<nombre>"} da sus parámetros.`;
    const ins = !f && s.instrucciones ? `\nINSTRUCCIONES DE ${s.nombre.toUpperCase()}:\n${s.instrucciones}\n` : '';
    return `${cab}${ins}\n` + sel.slice(0, 120).map(h => `- ${h.name}: ${h.description.split('\n')[0].slice(0, 160)}`).join('\n')
      + (sel.length > 120 ? `\n…y ${sel.length - 120} más: usa "buscar"` : '');
  }

  const soloMira = a => {
    if (!a?.herramienta) return true;                                   // listar / esquema
    const n = String(a.herramienta);
    const cmd = String(a.args?.id || a.args?.command || a.args?.comando || '');
    if (/^(command_run|run_command|execute|execute_command)$/i.test(n)) return CMD_MIRA.test(cmd);
    if (/^(command_batch|batch|script|run_script)$/i.test(n)) return false;
    return SOLO_MIRA.test(n);
  };

  const registradas = new Map();                       // id → nombre de la herramienta
  function registrarDe(s) {
    if (registradas.has(s.id)) { quitar([registradas.get(s.id)]); registradas.delete(s.id); }
    if (!s.activo) return;
    const nombre = s.id.replace(/[^\w-]/g, '_').slice(0, 64);
    registrar([{
      nombre, servicio: `mcp-local:${s.id}`,
      riesgo: a => (soloMira(a) ? 'lectura' : 'escritura'),
      clavePermiso: () => s.id,                        // "Permitir siempre" vale para toda la app
      descripcion: `[${s.nombre}] ${s.descripcion || 'servidor MCP local'}. Sin "herramienta" lista sus herramientas (filtra con "buscar"); `
        + `"esquema" da los parámetros de una; "herramienta" + "args" la ejecuta. Trabaja sin ventana: guarda/exporta a un archivo para que el usuario vea el resultado.`,
      parametros: { type: 'object', properties: {
        herramienta: { type: 'string', description: 'nombre exacto de la herramienta del servidor' },
        args: { type: 'object', description: 'argumentos de esa herramienta' },
        buscar: { type: 'string', description: 'filtro al listar' },
        esquema: { type: 'string', description: 'herramienta de la que quieres ver los parámetros' },
      } },
      resumen: a => (a.herramienta ? `${a.herramienta}${a.args?.id ? ' ' + a.args.id : ''}` : a.esquema ? `esquema ${a.esquema}` : `listar${a.buscar ? ' ' + a.buscar : ''}`),
      disponible: () => !!obtener(s.id)?.activo,
      ejecutar: async (a = {}) => {
        if (!s.herramientas?.length || (!a.herramienta && !a.esquema && Date.now() - (s.probado || 0) > 864e5)) await refrescarHerramientas(s.id);
        if (a.esquema) {
          const h = s.herramientas.find(x => x.name === a.esquema);
          return h ? `${h.name}: ${h.description}\nparámetros: ${JSON.stringify(h.inputSchema)}` : `no existe "${a.esquema}". ${listar(s, a.esquema)}`;
        }
        if (!a.herramienta) return listar(s, a.buscar);
        if (!s.herramientas.some(x => x.name === a.herramienta)) return `no existe la herramienta "${a.herramienta}" en ${s.nombre}. ${listar(s, a.herramienta.split(/[._]/)[0])}`;
        bus?.emit('mcp-local', { id: s.id, herramienta: a.herramienta });
        return convertir(s.id, await llamar(s.id, a.herramienta, a.args || {}));
      },
    }]);
    registradas.set(s.id, nombre);
  }
  for (const s of lista) registrarDe(s);

  function parar(id, motivo = 'parado') {
    const v = vivos.get(id); if (!v) return false;
    vivos.delete(id); clearTimeout(v.temp);
    for (const pend of v.pendientes.values()) { clearTimeout(pend.t); pend.mal(new Error(`${id} ${motivo}`)); }
    try { v.p.stdin.end(); } catch { }
    setTimeout(() => { try { v.p.kill(); } catch { } }, 3000).unref?.();
    return true;
  }
  const matarTodo = () => { let n = 0; for (const id of [...vivos.keys()]) { const v = vivos.get(id); vivos.delete(id); try { v.p.kill(); } catch { } n++; } return n; };
  bus?.on('panico', () => matarTodo());

  function volverADetectar() {
    let nuevos = 0;
    for (const d of detectar()) {
      const s = obtener(d.id);
      if (!s) { lista.push({ ...d, activo: true, herramientas: [] }); nuevos++; registrarDe(lista[lista.length - 1]); }
      else if (s.origen === 'craft' && s.comando !== d.comando) { s.comando = d.comando; registrarDe(s); }
    }
    guardar(); return nuevos;
  }

  function agregar({ id, nombre, comando, args = [], descripcion = '', env }) {
    if (!/^[a-z0-9-]{1,30}$/.test(id || '')) throw Object.assign(new Error('id no válido (a-z, 0-9, -)'), { status: 400 });
    if (!comando) throw Object.assign(new Error('falta el comando'), { status: 400 });
    if (obtener(id)) throw Object.assign(new Error('ya existe'), { status: 409 });
    const s = { id, nombre: nombre || id, comando, args, descripcion, origen: 'manual', activo: true, herramientas: [], ...(env ? { env } : {}) };
    lista.push(s); guardar(); registrarDe(s); return s;
  }
  function activar(id, activo) { const s = obtener(id); if (!s) return false; s.activo = !!activo; if (!activo) parar(id); guardar(); registrarDe(s); return true; }
  function borrar(id) { const i = lista.findIndex(x => x.id === id); if (i < 0) return false; parar(id); activar(id, false); lista.splice(i, 1); guardar(); return true; }
  const estado = () => lista.map(s => ({ id: s.id, nombre: s.nombre, descripcion: s.descripcion, comando: s.comando, args: s.args, origen: s.origen, activo: !!s.activo,
    vivo: vivos.has(s.id), herramientas: (s.herramientas || []).length }));

  async function httpApi(M, p, b = {}) {     // /v1/mcp-locales
    if (M === 'GET' && !p[2]) return { servidores: estado() };
    if (M === 'POST' && p[2] === 'detectar') return { nuevos: volverADetectar(), servidores: estado() };
    if (M === 'POST' && !p[2]) return agregar(b);
    if (M === 'POST' && p[2] && p[3] === 'probar') return { herramientas: (await refrescarHerramientas(p[2])).map(h => h.name) };
    if (M === 'POST' && p[2] && p[3] === 'parar') return { ok: parar(p[2]) };
    if (M === 'PATCH' && p[2]) return { ok: activar(p[2], b.activo) };
    if (M === 'DELETE' && p[2]) return { ok: borrar(p[2]) };
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  return { estado, llamar, convertir, refrescarHerramientas, parar, matarTodo, agregar, activar, borrar, detectar: volverADetectar, http: httpApi, obtener, CRAFT };
}

module.exports = { crearMcpLocales, detectarCraft, CRAFT };
