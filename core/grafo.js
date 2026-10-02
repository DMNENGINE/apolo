// Grafo de la memoria: entidades (personas, proyectos, lugares, cosas, herramientas) y sus relaciones, sacadas de los recuerdos.
// Dos fuentes: una heurística barata (nombres propios, herramientas conocidas, co-apariciones) que corre siempre,
// y la extracción con modelo (generarJSON) que hace el sueño REM de forma incremental (sueno.js → incorporar()).
// Datos: <dir>/grafo.json { entidades: {id: {...}}, relaciones: [{de, a, tipo, peso, recuerdos, fuente}], heur: {recuerdo: hash}, llm: {recuerdo: hash} }
// El nodo 'usuario' (Tú) es el centro: lo que es perfil/preferencia/proyecto suyo cuelga de él.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normal } = require('./memoria');

const TIPOS = ['persona', 'proyecto', 'lugar', 'cosa', 'herramienta'];
const hash = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
const slug = s => normal(s).replace(/[^a-z0-9ñ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

// herramientas y tecnologías conocidas (minúsculas, sin acentos) → tipo herramienta
const HERRAMIENTAS = new Set(('blender ollama python node nodejs docker git github gitlab discord telegram whatsapp slack raspberry mujoco three.js threejs claude gemma qwen chatgpt gemini openai ' +
  'anthropic codex ffmpeg vscode cursor electron linux windows ubuntu arduino esp32 platformio kicad fusion freecad cura prusaslicer ender stream deck streamdeck obs premiere davinci resolve ' +
  'photoshop figma notion obsidian excel word powershell bash rust go java javascript typescript react vue svelte unity unreal godot whisper mysql postgres sqlite redis nginx cloudflare vercel ' +
  'aws azure gcp firebase supabase stripe paypal shopify wordpress youtube tiktok instagram twitter spotify steam ats openclaw antigravity apolo').split(' '));
// palabras que, delante de un nombre propio, indican lugar
const PREP_LUGAR = /\b(en|desde|de|cerca de)\s*$/i;
const LUGARES = new Set('usa españa mexico cuba miami madrid barcelona texas florida california europa nueva york londres paris tokio habana'.split(' '));
const NO_ENTIDAD = new Set(('el la los las un una de del y o en es su sus le lo al por para con sin que se mi tu yo él ella ellos usuario prefiere tiene usa quiere le gusta ' +
  'lunes martes miércoles jueves viernes sábado domingo enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre hoy ayer mañana ' +
  'the a an and or of in on to is its he she they user prefers likes').split(' '));

function crearGrafo({ cfg, memoria }) {
  const f = path.join(cfg.dir, 'grafo.json');
  let g = vacio(), mtime = 0;
  function vacio() { return { version: 1, entidades: {}, relaciones: [], heur: {}, llm: {} }; }
  const sync = () => { try { const m = fs.statSync(f).mtimeMs; if (m !== mtime) { g = { ...vacio(), ...JSON.parse(fs.readFileSync(f, 'utf8')) }; mtime = m; } } catch { } };
  const guardar = () => { fs.writeFileSync(f, JSON.stringify(g)); try { mtime = fs.statSync(f).mtimeMs; } catch { } };
  sync();

  // ---------- entidades ----------
  function buscarEntidad(nombre) {
    const s = slug(nombre); if (!s) return null;
    const sin = s.replace(/^(el|la|los|las|the)-/, '');                     // "El Trueno" ~ "Trueno"
    const variantes = [...new Set([s, sin, `el-${sin}`, `la-${sin}`, `los-${sin}`, `las-${sin}`])];
    for (const v of variantes) if (g.entidades[v]) return g.entidades[v];
    const junto = sin.replace(/-/g, '');                                     // "RobotCompanion" ~ "Robot Companion"
    const pegado = Object.values(g.entidades).find(e => e.id.replace(/-/g, '') === junto); if (pegado) return pegado;
    return Object.values(g.entidades).find(e => e.alias?.some(a => variantes.includes(slug(a)))) || null;
  }
  function asegurar(nombre, tipo, fuente) {
    nombre = String(nombre || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!nombre) return null;
    let e = buscarEntidad(nombre);
    if (!e) {
      const id = slug(nombre); if (!id || id.length < 2) return null;
      e = g.entidades[id] = { id, nombre, tipo: TIPOS.includes(tipo) ? tipo : 'cosa', alias: [], recuerdos: [], fuente, creada: Date.now(), actualizada: Date.now() };
    } else {
      if (fuente === 'llm' && TIPOS.includes(tipo) && e.fuente !== 'llm') { e.tipo = tipo; e.fuente = 'llm'; }   // el modelo afina el tipo de la heurística
      if (nombre !== e.nombre && !e.alias.includes(nombre) && slug(nombre) !== e.id) e.alias = [...e.alias, nombre].slice(-6);
      e.actualizada = Date.now();
    }
    return e;
  }
  function enlazar(de, a, tipo, recuerdo, fuente) {
    if (!de || !a || de.id === a.id) return null;
    const [x, y] = de.id < a.id ? [de.id, a.id] : [a.id, de.id];          // no dirigido: una arista por par
    let r = g.relaciones.find(r => r.de === x && r.a === y);
    if (!r) { r = { de: x, a: y, tipo: tipo || 'relacionado', peso: 0, recuerdos: [], fuente }; g.relaciones.push(r); }
    else if (tipo && tipo !== 'relacionado' && (r.tipo === 'relacionado' || fuente === 'llm')) r.tipo = String(tipo).slice(0, 40);
    if (recuerdo && !r.recuerdos.includes(recuerdo)) { r.recuerdos.push(recuerdo); r.peso = r.recuerdos.length; }
    else if (!recuerdo) r.peso = Math.max(r.peso, 1);
    return r;
  }
  const usuario = () => g.entidades.usuario || (g.entidades.usuario = { id: 'usuario', nombre: 'Tú', tipo: 'persona', alias: ['usuario', 'yo'], recuerdos: [], fuente: 'sistema', creada: Date.now(), actualizada: Date.now() });
  const marcar = (e, id) => { if (e && id && !e.recuerdos.includes(id)) e.recuerdos.push(id); };

  // ---------- heurística barata ----------
  // candidatos: herramientas conocidas, nombres propios (secuencias en Mayúscula que no abren frase), entidades ya conocidas
  function candidatos(texto) {
    const out = new Map();
    const add = (nombre, tipo) => { const k = slug(nombre); if (k && k.length > 1 && !NO_ENTIDAD.has(normal(nombre))) if (!out.has(k) || out.get(k).tipo === 'cosa') out.set(k, { nombre, tipo }); };
    const n = normal(texto);
    // escrito como en el texto si aparece así ("MuJoCo"), si no Capitalizado
    const original = p => { const i = n.indexOf(p); const o = i >= 0 ? texto.slice(i, i + p.length) : ''; return o && normal(o) === p && /[A-Z]/.test(o) ? o : p === 'threejs' ? 'three.js' : p.length <= 3 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1); };
    for (const w of n.split(/[^a-z0-9ñ.]+/)) { const p = w.replace(/\.$/, ''); if (HERRAMIENTAS.has(p)) add(original(p), 'herramienta'); }
    if (/raspberry pi/.test(n)) add(/raspberry pi 5/.test(n) ? 'Raspberry Pi 5' : 'Raspberry Pi', 'herramienta');
    if (/stream deck/.test(n)) add('Stream Deck', 'herramienta');
    // Nombres propios: "Ruedas Grandes", "El Trueno", "MuJoCo", "Pi 5"
    const re = /(?:^|[^\wÁÉÍÓÚÑáéíóúñ])((?:[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.-]*|[A-Z]{2,}[\w-]*)(?:\s+(?:de\s+|del\s+|la\s+|el\s+)?(?:[A-ZÁÉÍÓÚÑ0-9][\wÁÉÍÓÚÑáéíóúñ.-]*))*)/g;
    let m;
    while ((m = re.exec(texto))) {
      let nombre = m[1].split(/\.\s+/)[0].replace(/[.-]+$/, '');          // "Miami. Directo" → "Miami"
      const ini = m.index + m[0].indexOf(m[1]);
      const antes = texto.slice(0, ini);
      const abreFrase = !antes.trim() || /[.!?:]\s*$/.test(antes);
      const palabras = nombre.split(/\s+/);
      if (abreFrase && palabras.length === 1 && !/[A-Z].*[A-Z]/.test(nombre.slice(1))) continue;     // "Tiene…" al empezar frase no es entidad (salvo CamelCase/SIGLAS)
      if (abreFrase && palabras.length > 1 && NO_ENTIDAD.has(normal(palabras[0]))) nombre = palabras.slice(1).join(' ');
      else if (abreFrase && palabras.length > 2 && /^(de|del)$/i.test(palabras[1])) nombre = palabras.slice(2).join(' ');   // "Propietario de Power Truck…" → "Power Truck…"
      if (!nombre || nombre.length < 2 || NO_ENTIDAD.has(normal(nombre))) continue;
      const nn = normal(nombre);
      const tipo = HERRAMIENTAS.has(nn) ? 'herramienta' : LUGARES.has(nn) || (PREP_LUGAR.test(antes.slice(-14)) && /\b(vive|vivo|desde|ciudad|está en|esta en)\b/i.test(antes.slice(-20))) ? 'lugar' : 'cosa';
      add(nombre, tipo);
    }
    // entidades que ya existen (por nombre o alias) aunque vengan en minúsculas
    for (const e of Object.values(g.entidades)) {
      if (e.id === 'usuario') continue;
      for (const nom of [e.nombre, ...(e.alias || [])]) { const k = normal(nom); if (k.length >= 3 && new RegExp(`(^|[^a-z0-9ñ])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9ñ]|$)`).test(n)) { add(e.nombre, e.tipo); break; } }
    }
    // "Raspberry" dentro de "Raspberry Pi 5": queda el más largo (con el tipo más concreto de los dos)
    const l = [...out.values()];
    const palabras = c => ` ${normal(c.nombre).replace(/[^a-z0-9ñ]+/g, ' ').trim()} `;
    return l.filter(c => !l.some(o => {
      if (o === c || palabras(o).length <= palabras(c).length || !palabras(o).includes(palabras(c))) return false;
      if (o.tipo === 'cosa' && c.tipo !== 'cosa') o.tipo = c.tipo;
      return true;
    }));
  }
  function tipoPorRecuerdo(m, c, i, total) {
    if (c.tipo !== 'cosa') return c.tipo;
    if (m.tipo === 'persona' && i === 0) return 'persona';
    if (m.tipo === 'proyecto' && i === 0) return 'proyecto';
    if (/\b(taller|empresa|tienda|negocio|shop)\b/i.test(m.texto) && total <= 3) return 'lugar';
    return 'cosa';
  }
  function procesarHeuristica(m) {
    const cs = candidatos(m.texto);
    const ents = cs.map((c, i) => asegurar(c.nombre, tipoPorRecuerdo(m, c, i, cs.length), 'heur')).filter(Boolean);
    for (const e of ents) marcar(e, m.id);
    const u = usuario();
    if (['perfil', 'preferencia', 'proyecto'].includes(m.tipo)) {
      marcar(u, m.id);
      for (const e of ents) enlazar(u, e, m.tipo === 'proyecto' ? 'trabaja en' : m.tipo === 'preferencia' ? 'le gusta' : 'tiene', m.id, 'heur');
    }
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) enlazar(ents[i], ents[j], 'relacionado', m.id, 'heur');
    g.heur[m.id] = hash(m.texto);
    return ents.length;
  }

  // poda lo que apunta a recuerdos que ya no existen; las entidades sin recuerdos se van (salvo Tú)
  function podar(vivos) {
    for (const e of Object.values(g.entidades)) e.recuerdos = e.recuerdos.filter(id => vivos.has(id));
    for (const r of g.relaciones) { r.recuerdos = r.recuerdos.filter(id => vivos.has(id)); r.peso = r.recuerdos.length; }
    for (const [id, e] of Object.entries(g.entidades)) if (id !== 'usuario' && !e.recuerdos.length) delete g.entidades[id];
    g.relaciones = g.relaciones.filter(r => r.peso > 0 && g.entidades[r.de] && g.entidades[r.a]);
    for (const k of ['heur', 'llm']) for (const id of Object.keys(g[k])) if (!vivos.has(id)) delete g[k][id];
  }

  // pasa la heurística por los recuerdos nuevos o cambiados (barato: se llama al pedir el grafo)
  function actualizar() {
    sync();
    const lista = memoria.lista(), vivos = new Set(lista.map(m => m.id));
    let n = 0;
    const cambiados = lista.filter(m => g.heur[m.id] !== hash(m.texto));
    if (cambiados.length) {             // un recuerdo editado: se quita de todo y se vuelve a procesar
      const ids = new Set(cambiados.map(m => m.id));
      for (const e of Object.values(g.entidades)) e.recuerdos = e.recuerdos.filter(id => !ids.has(id) || g.llm[id] === hash(lista.find(m => m.id === id)?.texto));
    }
    for (const m of cambiados) n += procesarHeuristica(m);
    const antes = Object.keys(g.entidades).length + g.relaciones.length;
    podar(vivos);
    if (n || cambiados.length || antes !== Object.keys(g.entidades).length + g.relaciones.length) guardar();
    return { procesados: cambiados.length };
  }

  // ---------- extracción con modelo (la llama el sueño REM) ----------
  // recuerdos que el modelo aún no ha visto (o cambiaron)
  function pendientesLLM(limite = 40) { sync(); return memoria.lista().filter(m => g.llm[m.id] !== hash(m.texto)).slice(-limite); }
  // datos = { entidades: [{nombre, tipo, recuerdos:[id]}], relaciones: [{de, a, tipo, recuerdos?:[id]}] }; vistos = ids procesados
  function incorporar(datos = {}, vistos = []) {
    actualizar();                                   // primero la heurística: así las relaciones encuentran lo ya conocido
    const lista = memoria.lista(), vivos = new Set(lista.map(m => m.id));
    let nuevas = 0, rel = 0;
    const antes = new Set(Object.keys(g.entidades));
    for (const x of (datos.entidades || []).slice(0, 80)) {
      const nom = String(x?.nombre || '').trim();
      if (!nom || NO_ENTIDAD.has(normal(nom))) continue;
      const esYo = /^(el )?usuario$|^yo$|^t[uú]$/i.test(nom);
      const e = esYo ? usuario() : asegurar(nom, x.tipo, 'llm');
      if (!e) continue;
      for (const id of [].concat(x.recuerdos || [])) if (vivos.has(id)) marcar(e, id);
      if (!antes.has(e.id)) nuevas++;
    }
    for (const r of (datos.relaciones || []).slice(0, 120)) {
      const pick = n => (/^(el )?usuario$|^yo$|^t[uú]$/i.test(String(n || '').trim()) ? usuario() : buscarEntidad(n));
      const de = pick(r?.de), a = pick(r?.a);
      if (!de || !a) continue;
      const ids = [].concat(r.recuerdos || []).filter(id => vivos.has(id));
      if (!ids.length) { const comun = de.recuerdos.find(id => a.recuerdos.includes(id)) || de.recuerdos[0] || a.recuerdos[0]; if (comun) ids.push(comun); }
      for (const id of ids) enlazar(de, a, r.tipo, id, 'llm');
      if (!ids.length) continue;
      rel++;
    }
    for (const id of vistos) { const m = lista.find(x => x.id === id); if (m) g.llm[id] = hash(m.texto); }
    podar(vivos); guardar();
    return { nuevas, relaciones: rel };
  }

  // ---------- consultas ----------
  function datos({ min = 0 } = {}) {
    actualizar();
    const nodos = Object.values(g.entidades).map(e => ({ id: e.id, nombre: e.nombre, tipo: e.tipo, peso: e.recuerdos.length, fuente: e.fuente }));
    const aristas = g.relaciones.filter(r => r.peso >= min).map(r => ({ de: r.de, a: r.a, tipo: r.tipo, peso: r.peso }));
    return { nodos, aristas, total: { entidades: nodos.length, relaciones: aristas.length, recuerdos: memoria.lista().length } };
  }
  function explorar(nombre) {
    actualizar();
    let e = buscarEntidad(nombre);
    if (!e) {                                     // parecido: contiene el texto
      const q = normal(nombre);
      e = Object.values(g.entidades).filter(x => normal(x.nombre).includes(q) || x.alias?.some(a => normal(a).includes(q))).sort((a, b) => b.recuerdos.length - a.recuerdos.length)[0];
    }
    if (!e) return null;
    const lista = memoria.lista();
    const vecinos = g.relaciones.filter(r => r.de === e.id || r.a === e.id).map(r => {
      const o = g.entidades[r.de === e.id ? r.a : r.de];
      return { id: o.id, nombre: o.nombre, tipo: o.tipo, relacion: r.tipo, peso: r.peso };
    }).sort((a, b) => b.peso - a.peso);
    const recuerdos = e.recuerdos.map(id => lista.find(m => m.id === id)).filter(Boolean).map(m => ({ id: m.id, texto: m.texto, tipo: m.tipo, actualizada: m.actualizada }));
    return { entidad: { id: e.id, nombre: e.nombre, tipo: e.tipo, alias: e.alias }, vecinos, recuerdos };
  }
  function borrarTodo() { g = vacio(); guardar(); }
  function resumen() { sync(); return { entidades: Object.keys(g.entidades).length, relaciones: g.relaciones.length }; }

  return { actualizar, datos, explorar, incorporar, pendientesLLM, candidatos, borrarTodo, resumen, TIPOS };
}

// herramienta del agente
const HERRAMIENTA = {
  nombre: 'explorar_grafo', riesgo: 'lectura',
  descripcion: 'Explora el grafo de la memoria: dado el nombre de una persona, proyecto, lugar, cosa o herramienta, devuelve con qué está relacionada y los recuerdos que la mencionan. ' +
    'Útil para "¿qué sabes de X?", "¿qué tiene que ver X con Y?" o para tener contexto de un proyecto.',
  parametros: { type: 'object', properties: { entidad: { type: 'string', description: 'nombre de la entidad (p. ej. "El Trueno", "Raspberry Pi", "robot")' } }, required: ['entidad'] },
  resumen: a => a.entidad,
  ejecutar: async (a, ctx) => {
    const gr = ctx.memoria?.grafo; if (!gr) return 'error: el grafo no está disponible';
    const r = gr.explorar(String(a.entidad || ''));
    if (!r) return `No hay ninguna entidad parecida a "${a.entidad}" en el grafo. Prueba buscar_memoria.`;
    return [`${r.entidad.nombre} (${r.entidad.tipo})${r.entidad.alias?.length ? ` · también: ${r.entidad.alias.join(', ')}` : ''}`,
      r.vecinos.length ? `Relacionado con:\n${r.vecinos.slice(0, 15).map(v => `- ${v.nombre} (${v.tipo}) · ${v.relacion} · peso ${v.peso}`).join('\n')}` : 'Sin relaciones.',
      r.recuerdos.length ? `Recuerdos:\n${r.recuerdos.slice(0, 12).map(m => `- [${m.id}·${m.tipo}] ${m.texto}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
};

module.exports = { crearGrafo, HERRAMIENTA, slug, TIPOS };
