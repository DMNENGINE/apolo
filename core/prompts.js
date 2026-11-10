// Laboratorio de prompts (pestaña «Prompts» del panel). Crea prompts buenos, completos y con nombre de
// vendedor: parte del encargo real, elige el ángulo por el que se va a vender lo que sale, monta la estructura
// bloque a bloque y calibra el texto con un calibrador propio (sin modelo ni red) que cuenta lo que de verdad
// hace fallar un prompt: poco contexto, cero restricciones, cero formato de salida y las frases de relleno.
// El banco vive en <datos>/prompts/: un .md con frontmatter para leerlo cómodo y un .json con el mismo contenido.
'use strict';
const fs = require('fs');
const path = require('path');

const VERSION = 1;

// ---------- piezas del prompt: cada una con su hueco en el texto final ----------
const BLOQUES = [
  { id: 'rol', t: 'Rol y objetivo', d: 'Quién es y qué tipo de trabajo hace. Define el registro de todo lo que sigue.', ejemplo: 'Eres copywriter de tiendas de Etsy con 8 años experiencia. Escribes fichas que venden sin prometer lo que el producto no hace.' },
  { id: 'contexto', t: 'Contexto del negocio', d: 'Quién lo usa y para qué: público, canal, oferta y tono. Lo que un profesional sabría al empezar.', ejemplo: 'Tienda de lámparas de madera hechas a mano en Valencia. Compra gente de 30-45 que busca regalo; vendo por Etsy y en Instagram.' },
  { id: 'tarea', t: 'La tarea exacta', d: 'Un solo trabajo, con el verbo del resultado y en qué se nota que está bien.', ejemplo: 'Escribe el título y 5 viñetas de UNA ficha de producto nueva. Está bien si cabe en Etsy y no parece un anuncio genérico.' },
  { id: 'material', t: 'El material', d: 'Los datos, ejemplos y medidas que solo tiene el usuario. El usuario los aporta al usar el prompt (con ▮▮ marcamos el hueco).', ejemplo: 'Producto: ▮▮ nombre ▮▮. Material, medidas y precio: ▮▮ medidas ▮▮. Fortaleza concreta: ▮▮ qué la hace distinta ▮▮.' },
  { id: 'pasos', t: 'Cómo hacerlo', d: 'Los pasos en el orden en que se piensa el trabajo: lo que evita que el modelo improvise.', ejemplo: '1) Lee el material. 2) Escribe el título de 58-62 caracteres. 3) Cinco viñetas de máx. 12 palabras con un beneficio cada una. 4) Diez etiquetas que Etsy acepte.' },
  { id: 'restricciones', t: 'Restricciones', d: 'Los límites duros: longitud, idioma, precio, lo que no puede inventar o decir. Aquí se mete la honestidad comercial.', ejemplo: 'No inventes medidas ni certificaciones. Nada de «el mejor» ni emojis. Español de España. Precio siempre con IVA incluido.' },
  { id: 'formato', t: 'Formato de salida', d: 'El hueco exacto en el que entra la respuesta. Sin esto, cada vez sale de una forma.', ejemplo: 'Devuelve solo:\nTÍTULO: …\nVÍÑETAS: 5 líneas que empiecen por «- »\nETIQUETAS: 10 separadas por comas' },
  { id: 'ejemplo', t: 'Ejemplo (opcional)', d: 'Una salida que ya vale. Es lo que más sube la calidad; si no hay, se pone un micro-ejemplo del tono.', ejemplo: 'TÍTULO: Lámpara de mesa de olivo, hecha a mano, 32 cm\n- Luz cálida que no deslumbra a la hora de leer\n…' },
];

// seis ángulos comerciales: deciden qué parte del resultado pesa en el texto
const ANGULOS = [
  { id: 'directo', t: 'Directo al grano', d: 'Para buscadores y anuncios: el resultado en la primera línea, sin adornos.', orden: ['rol', 'tarea', 'material', 'formato', 'restricciones', 'contexto', 'pasos', 'ejemplo'], disparadores: [/\bvende\s+prompts?\b/i, /\bp[aá]gina de ventas\b/i] },
  { id: 'problema', t: 'Dolor → solución', d: 'Para redes: empieza donde el comprador está atascado, termina en el resultado.', orden: ['rol', 'contexto', 'tarea', 'pasos', 'restricciones', 'formato', 'material', 'ejemplo'] },
  { id: 'autoridad', t: 'Experto y técnico', d: 'Para quien ya sabe: vocabulario del oficio, criterio y casos límite.', orden: ['rol', 'tarea', 'restricciones', 'material', 'pasos', 'formato', 'contexto', 'ejemplo'] },
  { id: 'opuesto', t: 'Contra-intuitivo', d: 'Para un ángulo que nadie usa: defiende la idea contraria con argumentos.', orden: ['rol', 'tarea', 'contexto', 'material', 'restricciones', 'pasos', 'formato', 'ejemplo'] },
  { id: 'historia', t: 'Historia y escena', d: 'Para marcas con alma: una escena concreta en vez de una lista de ventajas.', orden: ['rol', 'contexto', 'tarea', 'ejemplo', 'restricciones', 'formato', 'pasos', 'material'] },
  { id: 'numeros', t: 'Cifras y resultado', d: 'Para B2B y producto técnico: unidades, plazos y pruebas medibles.', orden: ['rol', 'tarea', 'material', 'restricciones', 'formato', 'contexto', 'pasos', 'ejemplo'] },
];

const FRASES_RELLENO = [
  'actua como', 'eres un experto en', 'experto en todo', 'imagina un mundo', 'imagina que',
  'lleva tu contenido al siguiente nivel', 'lleva tu negocio al siguiente nivel', 'desbloquea tu potencial',
  'sin limites', 'revoluciona', 'increible', 'nivel superior', 'proximo nivel', 'el mejor del mundo',
  'como si fueras un', 'magia pura', 'superpoderes',
];

const MEDIDAS = {
  palabrasObjecion: 12,        // la tarea cabe en 12 palabras y dice el resultado
  palabrasRol: 45,             // el rol es un rol, no una biografía
  minimoContexto: 12,          // palabras de contexto que valgan
  minimoRestriccion: 3,        // textos de restricción que valgan
  maxRelleno: 0,
};

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const palabras = s => String(s || '').trim().split(/\s+/).filter(Boolean);

// ---------- calibrador: puntúa el prompt montado y dice exactamente qué arreglar ----------
function calibrar(p) {
  const bloques = p.bloques || {};
  const texto = montar(p, p.angulo || 'directo').texto;
  const low = norm(texto);
  const t = norm(bloques.tarea || '');
  const problemas = [];
  const vista = [];

  // 1. la tarea (30): existe, es corta y dice el resultado
  const paTarea = palabras(bloques.tarea).length;
  if (!paTarea) problemas.push({ bloque: 'tarea', gravedad: 'alta', texto: 'Falta la tarea: sin un trabajo concreto, el modelo rellena con lo que le apetece.', arreglo: bloqueEjemplo('tarea') });
  else if (paTarea > MEDIDAS.palabrasObjecion) problemas.push({ bloque: 'tarea', gravedad: 'media', texto: `La tarea tiene ${paTarea} palabras: son dos tareas. Deja una y baja a ${MEDIDAS.palabrasObjecion} o menos.`, arreglo: bloques.tarea });
  const verbo = /\b(escribe|redacta|crea|genera|analiza|resume|traduce|disena|desarrolla|calcula|revisa|planifica|clasifica|extrae|convierte|haz|corrige|compara)\b/.test(t);
  if (paTarea && !verbo) problemas.push({ bloque: 'tarea', gravedad: 'media', texto: 'La tarea no empieza por un verbo de trabajo: el modelo no sabe qué entregar.', arreglo: `Escribe ${bloques.tarea || '…'}` });

  // 2. contexto (15)
  const paContexto = palabras(bloques.contexto).length;
  if (paContexto < MEDIDAS.minimoContexto) problemas.push({ bloque: 'contexto', gravedad: 'alta', texto: 'Falta contexto: sin público, canal y oferta el resultado sale genérico.', arreglo: bloqueEjemplo('contexto') });

  // 3. material (15): datos del usuario o huecos ▮▮
  if (palabras(bloques.material).length < 6 && !/▮/.test(texto)) problemas.push({ bloque: 'material', gravedad: 'alta', texto: 'No hay material ni huecos ▮▮: el prompt no puede usar los datos reales del usuario.', arreglo: bloqueEjemplo('material') });

  // 4. formato (15): el hueco de la respuesta
  const fmt = norm(bloques.formato || '');
  const tieneFormato = /\b(formato|devuelve|responde|salida|lista|tabla|json|titulo|vinetas|etiquetas|lineas|solo)\b/.test(fmt);
  if (!tieneFormato) problemas.push({ bloque: 'formato', gravedad: 'alta', texto: 'Falta el formato de salida: sin él, cada vez devuelve una forma distinta y no se puede copiar.', arreglo: bloqueEjemplo('formato') });

  // 5. restricciones (15)
  const rest = String(bloques.restricciones || '').split(/[.\n;•·]+/).map(x => x.trim()).filter(x => palabras(x).length >= 2);
  if (rest.length < MEDIDAS.minimoRestriccion) problemas.push({ bloque: 'restricciones', gravedad: 'media', texto: `Solo ${rest.length} restricción(es): pon al menos ${MEDIDAS.minimoRestriccion} límites duros (longitud, idioma, qué no inventar, qué no decir).`, arreglo: bloqueEjemplo('restricciones') });

  // 6. rol (10)
  const paRol = palabras(bloques.rol).length;
  if (!paRol) problemas.push({ bloque: 'rol', gravedad: 'baja', texto: 'Sin rol: el prompt responde como un asistente genérico en vez de como el profesional que lo haría.', arreglo: bloqueEjemplo('rol') });
  else if (paRol > MEDIDAS.palabrasRol) problemas.push({ bloque: 'rol', gravedad: 'baja', texto: `El rol tiene ${paRol} palabras: cuenta una biografía. Baja a ${MEDIDAS.palabrasRol} y quédate con el trabajo.`, arreglo: bloques.rol });

  // 7. relleno de marketing (0 tolerancia): se busca en los textos de los bloques, no en los títulos
  const textos = Object.values(bloques).map(norm).join(' \n ');
  const rellenos = FRASES_RELLENO.filter(f => textos.includes(norm(f)));
  for (const r of rellenos) problemas.push({ bloque: 'restricciones', gravedad: 'baja', texto: `Relleno que no da información: «${r}». Quítalo y pon un límite comprobable.`, arreglo: '' });

  // 8. ejemplo (informativo)
  if (!palabras(bloques.ejemplo).length) vista.push({ texto: 'Añadir un ejemplo de salida suele ser lo que más sube la calidad.', bloque: 'ejemplo' });

  // puntuación: se resta por gravedad y se acota
  const cuenta = g => problemas.filter(x => x.gravedad === g).length;
  let puntos = 100 - cuenta('alta') * 18 - cuenta('media') * 10 - cuenta('baja') * 4;
  if (puntos < 0) puntos = 0;
  const faltan = [];
  if (!paTarea) faltan.push('tarea');
  if (paContexto < MEDIDAS.minimoContexto) faltan.push('contexto');
  if (palabras(bloques.material).length < 6 && !/▮/.test(texto)) faltan.push('material');
  if (!tieneFormato) faltan.push('formato');
  return {
    version: VERSION,
    puntos,
    estado: puntos >= 80 && !problemas.some(x => x.gravedad === 'alta') ? 'listo' : puntos >= 50 ? 'mejorable' : 'flojo',
    problemas,
    avisos: vista,
    faltan,
    piezas: BLOQUES.map(b => ({ bloque: b.id, titulo: b.t, hay: !!palabras(bloques[b.id]).length, palabras: palabras(bloques[b.id]).length })),
    palabras: palabras(texto).length,
    caracteres: texto.length,
  };
}

const bloqueEjemplo = id => (BLOQUES.find(b => b.id === id) || {}).ejemplo || '';

// ---------- montar: los bloques en el orden del ángulo, con los huecos ▮▮ respetados ----------
function montar(p, angulo) {
  const a = ANGULOS.find(x => x.id === angulo) || ANGULOS[0];
  const bloques = p.bloques || {};
  const secciones = [];
  if (p.nombre) secciones.push(`# ${p.nombre}`);
  if (p.para) secciones.push(`> ${p.para}`);
  for (const id of a.orden) {
    const b = BLOQUES.find(x => x.id === id);
    const v = String(bloques[id] || '').trim();
    if (!v) continue;
    secciones.push(`## ${b.t.toUpperCase()}\n${v}`);
  }
  const texto = secciones.join('\n\n') + '\n';
  return { angulo: a.id, texto, caracteres: texto.length, palabras: palabras(texto).length };
}

// ---------- crear: rellena los huecos con lo que se sabe y ordena por el ángulo ----------
const CONTEXTO_TIPO = {
  landing: { rol: 'Eres copywriter y diseñador de landing pages de producto con experiencia vendiendo online.', tarea: 'Escribe la landing de venta que convierte en compra.', material: 'Producto: ▮▮ qué es ▮▮. Precio: ▮▮. Para quién: ▮▮. Qué le cambia: ▮▮.', formato: 'Devuelve por secciones: HERO, PRUEBA, EJEMPLO, PRECIOS, FAQ. Cada sección con su texto final y su versión corta.' },
  redes: { rol: 'Eres creador de contenido de redes que vende sin parecer un anuncio.', tarea: 'Escribe las piezas del calendario con su gancho.', contexto: 'Canal: ▮▮. Audiencia: ▮▮. Producto: ▮▮.', formato: 'Tabla: DÍA | GANCHO | TEXTO | CTA. Un gancho de máx. 10 palabras por pieza.' },
  foto: { rol: 'Eres director de fotografía de producto.', tarea: 'Describe la configuración de la foto y el encargo para el modelo de imagen.', material: 'Producto: ▮▮. Escena: ▮▮. Luz: ▮▮.', formato: 'Devuelve: PROMPT DE IMAGEN (un párrafo), CÁMARA, LUZ, ENCUADRE, 2 VARIANTES.' },
  codigo: { rol: 'Eres programador senior, claro y directo, que entrega código que corre a la primera.', tarea: 'Escribe el código que resuelve el encargo.', material: 'Lenguaje y versión: ▮▮. Entorno: ▮▮. RESTRICCIÓN técnica: ▮▮.', formato: 'Devuelve UN bloque de código completo y, debajo, cómo probarlo en dos líneas.' },
  email: { rol: 'Eres redactor de correo que escribe como una persona, no como una marca.', tarea: 'Escribe el correo completo con asunto y una sola llamada a la acción.', material: 'Sobre qué: ▮▮. Al lector le pasa: ▮▮.', formato: 'ASUNTO: …\nCUERPO: … (máx. 140 palabras)\nCTA: una sola, con el texto exacto del botón.' },
  tema: { rol: 'Eres profesor que explica sin dar por sabido nada.', tarea: 'Explica el tema con un ejemplo resuelto y un error típico.', material: 'Tema: ▮▮. Nivel: ▮▮.', formato: 'Ideas (máx. 5) · EJEMPLO resuelto paso a paso · ERROR TÍPICO · 3 PREGUNTAS de repaso.' },
  otro: {},
};

function crear(entrada = {}) {
  const tipo = String(entrada.tipo || 'otro');
  const base = CONTEXTO_TIPO[tipo] || CONTEXTO_TIPO.otro;
  const idea = String(entrada.idea || '').trim();
  // el contexto nace del encargo real: si no, todos los prompts saldrían con el contexto genérico del tipo
  const contextoAuto = base.contexto && !entrada.contexto && !idea ? base.contexto
    : idea ? `Encargo: ${idea}.${base.contexto ? ` Contexto: ${base.contexto}` : ''}` : '';
  const bloques = {
    rol: String(entrada.rol || base.rol || bloqueEjemplo('rol')),
    contexto: String(entrada.contexto || contextoAuto || bloqueEjemplo('contexto')),
    tarea: String(entrada.tarea || base.tarea || (idea || bloqueEjemplo('tarea'))),
    material: String(entrada.material || base.material || bloqueEjemplo('material')),
    pasos: String(entrada.pasos || bloqueEjemplo('pasos')),
    restricciones: String(entrada.restricciones || bloqueEjemplo('restricciones')),
    formato: String(entrada.formato || base.formato || bloqueEjemplo('formato')),
    ejemplo: String(entrada.ejemplo || ''),
  };
  const angulo = ANGULOS.some(a => a.id === entrada.angulo) ? entrada.angulo : 'directo';
  const p = {
    version: VERSION,
    nombre: String(entrada.nombre || (idea ? idea.slice(0, 60) : 'Prompt nuevo')),
    para: String(entrada.para || '').trim(),
    tipo, angulo, bloques,
    creado: null, favorito: false,
  };
  return { ...p, medida: calibrar(p), texto: montar(p, angulo) };
}

// mejora: para cada problema, sube la versión del bloque (o pone el ejemplo si está vacío) y vuelve a calibrar
function mejorar(p) {
  const m = calibrar(p);
  const bloques = { ...(p.bloques || {}) };
  const cambios = [];
  for (const pr of m.problemas) {
    if (!pr.bloque) continue;
    const actual = String(bloques[pr.bloque] || '');
    const ej = bloqueEjemplo(pr.bloque);
    if (!actual.trim()) { bloques[pr.bloque] = ej; cambios.push(`${pr.bloque}: puesto el texto base`); }
    else if (pr.arreglo && norm(pr.arreglo) !== norm(actual) && !/relleno/i.test(pr.texto)) { bloques[pr.bloque] = pr.arreglo; cambios.push(`${pr.bloque}: corregido`); }
  }
  if (m.problemas.some(x => /relleno/i.test(x.texto))) for (const f of FRASES_RELLENO) bloques.restricciones = String(bloques.restricciones || '').replace(new RegExp(f, 'gi'), '').trim();
  const q = { ...p, bloques, angulo: ANGULOS.some(a => a.id === p.angulo) ? p.angulo : 'directo' };
  const medida = calibrar(q);
  return { ...q, medida, texto: montar(q, q.angulo), cambios };
}

// corrección con el texto devuelto por el modelo (borrador que el usuario pega y el calibrador revisa)
function arreglarPorTexto(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const extraer = etiqueta => {
    const re = new RegExp(`^#{0,2}\\s*${etiqueta}[:\\s]*\\n?`, 'im');
    const i = t.search(re); if (i < 0) return { valor: '', resumen: 'no aparece el bloque' };
    const resto = t.slice(i).replace(re, '').split(/\n#{1,3}\s/)[0];
    const valor = resto.trim();
    return { valor, resumen: valor ? '' : 'vacío' };
  };
  const claves = { rol: 'ROL Y OBJETIVO', contexto: 'CONTEXTO DEL NEGOCIO', tarea: 'LA TAREA EXACTA', material: 'EL MATERIAL', pasos: 'CÓMO HACERLO', restricciones: 'RESTRICCIONES', formato: 'FORMATO DE SALIDA', ejemplo: 'EJEMPLO \\(OPCIONAL\\)|EJEMPLO' };
  const bloques = {}, notas = [];
  for (const [k, et] of Object.entries(claves)) {
    const r = extraer(et);
    if (r.valor) bloques[k] = r.valor; else notas.push(`${k}: ${r.resumen}`);
  }
  const nombre = (t.match(/^\s*#\s+(.+)$/m) || [])[1] || '';
  const p = { version: VERSION, nombre: nombre.trim() || 'Prompt reparado', para: '', tipo: 'otro', angulo: 'directo', bloques };
  return { ...p, medida: calibrar(p), texto: montar(p, 'directo'), notas };
}

// ---------- banco (persistente) ----------
const FCRM = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/;
const aMarkdown = p => {
  const meta = { formato: 'apolo-prompt/1', id: p.id, nombre: p.nombre, tipo: p.tipo, angulo: p.angulo, favorito: !!p.favorito, creado: p.creado, puntos: p.medida?.puntos ?? 0 };
  const cuerpo = montar(p, p.angulo).texto;
  return `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${cuerpo}`;
};

function crearPrompts({ cfg, generarJSON, proveedores, modelo = () => cfg.modeloPorDefecto, bus } = {}) {
  const dir = path.join(cfg.dir, 'prompts');
  const disponible = () => { try { fs.mkdirSync(dir, { recursive: true }); return true; } catch { return false; } };
  const idDe = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'prompt';

  // Una pregunta suelta a un modelo: generarJSON necesita un esquema, y aquí solo devuelve texto que el usuario
  // copia tal cual (sin herramientas, sin bucle de agente). Se elige el proveedor más específico del modelo.
  async function charlar({ system, prompt }) {
    const mid = typeof modelo === 'function' ? modelo() : modelo;
    if (!proveedores?.resolver) throw Object.assign(new Error('no hay proveedores en este núcleo'), { status: 501 });
    const { api, model } = proveedores.resolver(mid);       // elige el proveedor que toca (y el respaldo si el modelo no está)
    const r = await api.chat({ model, system, mensajes: [{ role: 'user', content: prompt }], herramientas: [], maxTokens: 2000 });
    const texto = (r && (r.texto ?? r.content)) || '';
    if (!String(texto).trim()) throw Object.assign(new Error('el modelo devolvió vacío: llama a «corregir» otra vez o cambia de modelo'), { status: 502 });
    return { texto: String(texto), modelo: mid };
  }

  function lista() {
    if (!disponible()) return [];
    const out = [];
    for (const f of fs.readdirSync(dir)) {
      if (!/\.json$/i.test(f)) continue;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (p && p.id) out.push({ id: p.id, nombre: p.nombre, tipo: p.tipo, angulo: p.angulo, favorito: !!p.favorito, creado: p.creado || 0, puntos: p.medida?.puntos ?? calibrar(p).puntos, palabras: p.medida?.palabras ?? 0, vista: fs.existsSync(path.join(dir, `${p.id}.vista.html`)) });
      } catch { }
    }
    return out.sort((a, b) => (b.favorito - a.favorito) || (b.creado - a.creado) || a.nombre.localeCompare(b.nombre));
  }

  function obtener(id) {
    const f = path.join(dir, `${idDe(id)}.json`);
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  }

  function guardar(p) {
    if (!disponible()) throw Object.assign(new Error('no puedo escribir en la carpeta de prompts'), { status: 500 });
    const id = idDe(p.id || p.nombre);
    const medida = calibrar(p);
    const reg = { ...p, id, version: VERSION, creado: p.creado || Date.now(), medida, texto: montar(p, p.angulo).texto };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(reg, null, 1), 'utf8');
    fs.writeFileSync(path.join(dir, `${id}.md`), aMarkdown(reg), 'utf8');
    bus?.emit('evento', { tipo: 'prompts', accion: 'guardado', id });
    return reg;
  }

  function borrar(id) {
    const k = idDe(id);
    for (const ext of ['json', 'md', 'vista.html']) { try { fs.unlinkSync(path.join(dir, `${k}.${ext}`)); } catch { } }
    bus?.emit('evento', { tipo: 'prompts', accion: 'borrado', id: k });
    return true;
  }

  const rutaVista = (id) => { const f = path.join(dir, `${idDe(id)}.vista.html`); return fs.existsSync(f) ? f : null; };

  const favorito = (id) => { const p = obtener(id); if (!p) throw Object.assign(new Error('no existe'), { status: 404 }); return guardar({ ...p, favorito: !p.favorito }); };

  // corrección con el modelo: reescribe el borrador bloque a bloque y la respuesta vuelve a pasar por el calibrador
  async function corregir({ texto } = {}) {
    if (!String(texto || '').trim()) throw Object.assign(new Error('falta el borrador (texto)'), { status: 400 });
    const { texto: devuelto, modelo: usado } = await charlar({
      system: 'Eres ingeniero de prompts de APOLO. Reescribes un prompt flojo para que cualquier modelo saque siempre un resultado bueno. ' +
        'Reglas: la tarea es UN solo trabajo y empieza por un verbo; el contexto dice público, canal, oferta y tono; el material son los datos que solo tiene el usuario, con los huecos marcados ▮▮ ' +
        '(no los inventes); las restricciones son límites duros y comprobables (longitud, idioma, qué no inventar, qué no decir); el formato es el hueco exacto de la respuesta. ' +
        'Prohibido el relleno de marketing («actúa como un experto», «lleva tu negocio al siguiente nivel», emojis). Escribe en el idioma del borrador. ' +
        'Devuelve SOLO esto, con esos títulos en mayúsculas y nada más:\n' +
        '## ROL Y OBJETIVO\n## CONTEXTO DEL NEGOCIO\n## LA TAREA EXACTA\n## EL MATERIAL\n## CÓMO HACERLO\n## RESTRICCIONES\n## FORMATO DE SALIDA\n## EJEMPLO (OPCIONAL)',
      prompt: `<borrador>\n${String(texto).slice(0, 6000)}\n</borrador>`,
    });
    const r = arreglarPorTexto(devuelto);
    return { ...r, modelo: usado };
  }

  // el daemon llama a la extensión con la ruta SIN /v1 (['prompts', …], como diseno.js): se normaliza aquí igual
  async function http(M, p, b = {}, q = {}) {
    if (p[0] === 'v1') p = p.slice(1);
    const acc = `${M} ${p.join('/')}`;
    if (M === 'GET' && p.length === 1) return { prompts: lista(), medidas: MEDIDAS, bloques: BLOQUES, angulos: ANGULOS, tipos: Object.keys(CONTEXTO_TIPO), version: VERSION };
    if (M === 'POST' && p[1] === 'crear') { const q = crear(b || {}); return { ...q, texto: montar(q, q.angulo).texto }; }
    if (M === 'POST' && p[1] === 'medir') return { medida: calibrar(b || {}), texto: montar(b || {}, b.angulo).texto };
    if (M === 'POST' && p[1] === 'mejorar') { const q = mejorar(b || {}); return { ...q, texto: montar(q, q.angulo).texto }; }
    if (M === 'POST' && p[1] === 'reparar') return arreglarPorTexto(b && b.texto);
    if (M === 'POST' && p[1] === 'corregir') return corregir(b || {});
    if (M === 'POST' && p[1] === 'guardar') {
      if (!b || !b.bloques) throw Object.assign(new Error('falta el prompt (bloques)'), { status: 400 });
      return guardar(b);
    }
    if (M === 'GET' && p[1] === 'texto' && p[2]) { const x = obtener(decodeURIComponent(p[2])); if (!x) return { error: 'no existe' }; return { id: x.id, nombre: x.nombre, texto: montar(x, x.angulo).texto }; }
    if (M === 'GET' && p[1] && p.length === 2) { const x = obtener(decodeURIComponent(p[1])); if (!x) throw Object.assign(new Error('no existe'), { status: 404 }); return x; }
    if (M === 'DELETE' && p[1]) return { borrado: borrar(decodeURIComponent(p[1])) };
    if (M === 'POST' && p[1] === 'favorito' && p[2]) return favorito(decodeURIComponent(p[2]));
    throw Object.assign(new Error(`ruta desconocida: ${acc}`), { status: 404 });
  }

  return { calibrar, crear, mejorar, montar, BLOQUES, ANGULOS, lista, obtener, guardar, borrar, rutaVista, http, dir };
}

module.exports = { crearPrompts, calibrar, crear, mejorar, montar, BLOQUES, ANGULOS, FRASES_RELLENO, MEDIDAS };
