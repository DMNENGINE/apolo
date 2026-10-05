// Biblioteca de diseño: APOLO aprende patrones de interfaz estudiando apps reales en Mobbin (MCP oficial).
//  estudiar(tema) → busca pantallas/flujos/secciones en Mobbin → un modelo con visión las MIRA → ficha del patrón
//  (estructura, componentes, jerarquía, textos, detalles, buenas prácticas, errores, qué copiar de cada app).
//  Se guarda la ficha (notas propias + enlaces a Mobbin), NO las capturas: las de Mobbin caducan y son suyas.
//  Antes de diseñar cualquier interfaz el agente consulta la biblioteca (buscar_patrones_diseno) y estudia lo que falte.
//  Aprende solo: tarea interna 'estudiar-diseno' que cada noche estudia los siguientes temas del temario (apagada por defecto).
// Archivos: <datos>/diseno/patrones/<slug>.md (+ .json) · <datos>/diseno/estado.json {estudiados:[tema]}
'use strict';
const fs = require('fs');
const path = require('path');

const TEMARIO = [
  ['onboarding con pasos de personalización', 'ios', 'flujos'], ['pantalla de login con biometría y acceso social', 'ios', 'pantallas'],
  ['registro de cuenta con validación de campos', 'ios', 'pantallas'], ['estado vacío con llamada a la acción', 'ios', 'pantallas'],
  ['ajustes de la app agrupados por secciones', 'ios', 'pantallas'], ['perfil de usuario con estadísticas', 'ios', 'pantallas'],
  ['checkout con selección de método de pago', 'ios', 'flujos'], ['paywall de suscripción con comparación de planes', 'ios', 'pantallas'],
  ['permiso de notificaciones explicado antes de pedirlo', 'ios', 'pantallas'], ['búsqueda con filtros y resultados recientes', 'ios', 'pantallas'],
  ['chat con un asistente de IA', 'ios', 'pantallas'], ['dashboard con tarjetas de métricas y gráficos', 'web', 'pantallas'],
  ['tabla de datos con filtros y acciones en bloque', 'web', 'pantallas'], ['página de precios con comparación de planes', 'web', 'secciones'],
  ['hero de landing con formulario de registro', 'web', 'secciones'], ['footer de web con enlaces agrupados', 'web', 'secciones'],
  ['panel de ajustes de una app web con navegación lateral', 'web', 'pantallas'], ['modal de confirmación de acción destructiva', 'web', 'pantallas'],
  ['notificaciones toast y banners de estado', 'web', 'pantallas'], ['onboarding de producto SaaS con checklist', 'web', 'flujos'],
  ['reproductor de música', 'ios', 'pantallas'], ['detalle de producto en tienda', 'ios', 'pantallas'], ['feed social con publicaciones', 'ios', 'pantallas'],
  ['calendario y agenda', 'ios', 'pantallas'], ['mapa con lista de lugares', 'ios', 'pantallas'], ['seguimiento de entrenamiento o salud', 'ios', 'pantallas'],
];
const HERR = { pantallas: 'search_screens', flujos: 'search_flows', secciones: 'search_sections' };

const ESQUEMA = {
  type: 'object',
  properties: {
    nombre: { type: 'string' }, resumen: { type: 'string' }, cuando_usar: { type: 'string' },
    estructura: { type: 'array', items: { type: 'string' } }, componentes: { type: 'array', items: { type: 'string' } },
    jerarquia_visual: { type: 'string' }, microcopy: { type: 'array', items: { type: 'string' } },
    detalles: { type: 'array', items: { type: 'string' } }, buenas_practicas: { type: 'array', items: { type: 'string' } },
    errores_a_evitar: { type: 'array', items: { type: 'string' } },
    ejemplos: { type: 'array', items: { type: 'object', properties: { indice: { type: 'number' }, que_destaca: { type: 'string' } }, required: ['indice', 'que_destaca'] } },
  },
  required: ['nombre', 'resumen', 'cuando_usar', 'estructura', 'componentes', 'jerarquia_visual', 'buenas_practicas', 'errores_a_evitar', 'ejemplos'],
};

const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'patron';
const sinAcentos = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set('de la el los las un una con y en para por del al que o a mi tu su se lo como pantalla app'.split(' '));
const palabras = t => sinAcentos(t).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.slice(0, 6));

function crearDiseno({ cfg, mcpRemotos, generarJSON, memoria, tareas, bus }) {
  const dir = path.join(cfg.dir, 'diseno'), dirP = path.join(dir, 'patrones'), fEstado = path.join(dir, 'estado.json');
  const leerEstado = () => { try { return { estudiados: [], ...JSON.parse(fs.readFileSync(fEstado, 'utf8')) }; } catch { return { estudiados: [] }; } };
  const conf = () => ({ modeloVision: 'ollama/gemma4:31b-cloud', porNoche: 3, cron: '30 3 * * *', aprendizaje: false, cuantas: 8, ...(cfg.diseno || {}), ...(leerEstado().config || {}) });
  const guardarEstado = e => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fEstado, JSON.stringify(e, null, 2)); };

  function lista() {
    let fs_ = []; try { fs_ = fs.readdirSync(dirP).filter(f => f.endsWith('.json')); } catch { }
    return fs_.map(f => { try { return JSON.parse(fs.readFileSync(path.join(dirP, f), 'utf8')); } catch { return null; } }).filter(Boolean)
      .sort((a, b) => b.estudiado - a.estudiado);
  }

  function aMarkdown(p) {
    const L = (t, xs) => xs?.length ? `\n## ${t}\n${xs.map(x => `- ${x}`).join('\n')}\n` : '';
    return `# ${p.nombre}\n\n> ${p.resumen}\n\n**Tema estudiado:** ${p.tema} · **Plataforma:** ${p.plataforma} · **Tipo:** ${p.tipo} · **Estudiado:** ${new Date(p.estudiado).toISOString().slice(0, 10)}\n\n` +
      `## Cuándo usarlo\n${p.cuando_usar}\n` + L('Estructura (de arriba abajo / paso a paso)', p.estructura) + L('Componentes', p.componentes) +
      `\n## Jerarquía visual\n${p.jerarquia_visual}\n` + L('Textos (microcopy) que funcionan', p.microcopy) + L('Detalles (espaciado, color, tipografía, estados)', p.detalles) +
      L('Buenas prácticas', p.buenas_practicas) + L('Errores a evitar', p.errores_a_evitar) +
      `\n## Referencias (Mobbin)\n${(p.ejemplos || []).map(e => `- **${e.app || '?'}**: ${e.que_destaca}${e.mobbin_url ? ` — ${e.mobbin_url}` : ''}`).join('\n')}\n`;
  }

  async function estudiar(tema, { plataforma = 'ios', tipo = 'pantallas', cuantas, modelo, signal } = {}) {
    tema = String(tema || '').trim(); if (!tema) throw new Error('falta el tema');
    if (!mcpRemotos.conectado('mobbin')) throw Object.assign(new Error('Mobbin no está conectado: conéctalo en el panel (Configuración → Servicios MCP) o con /conectar mobbin en la CLI'), { status: 409 });
    if (!HERR[tipo]) throw new Error('tipo: pantallas | flujos | secciones');
    const c = conf(), n = Math.max(3, Math.min(12, +cuantas || c.cuantas));
    const args = { query: tema, limit: n, ...(tipo !== 'secciones' ? { platform: plataforma === 'web' ? 'web' : 'ios' } : {}) };
    const r = await mcpRemotos.llamar('mobbin', HERR[tipo], args);
    let meta = []; try { const j = JSON.parse(r.texto.replace(/\n\(\d+ imagen.*$/s, '')); meta = j.screens || j.flows || j.sections || []; } catch { }
    if (!r.imagenes.length) throw new Error(`Mobbin no devolvió imágenes para «${tema}»: ${r.texto.slice(0, 200)}`);
    const imagenes = r.imagenes.slice(0, 12).map(x => ({ mime: x.mime, datos: fs.readFileSync(x.ruta).toString('base64') }));
    const listaApps = meta.map((m, i) => `${i}: ${m.app_name || m.title || '?'}`).join(' · ');
    const { datos } = await generarJSON({
      modelo: modelo || c.modeloVision, imagenes, signal, schema: ESQUEMA,
      system: 'Eres un diseñador de producto sénior. Estudias capturas reales de apps líderes para extraer el PATRÓN de diseño que comparten y enseñárselo a otro diseñador. Mira de verdad las imágenes: describe lo que se ve, no inventes. Escribe en español, concreto y accionable (medidas aproximadas, orden de elementos, textos reales). No copies marcas: extrae principios.',
      prompt: `Tema: «${tema}» (${tipo}, ${args.platform || 'web'}). Te paso ${imagenes.length} capturas en este orden: ${listaApps || '(sin nombres)'}.\n` +
        'Devuelve la ficha del patrón: nombre corto, resumen (1-2 frases), cuándo usarlo, estructura (zonas o pasos en orden), componentes, jerarquía visual, microcopy (textos reales que veas y por qué funcionan), detalles visuales (espaciado, tamaños, color, tipografía, estados), buenas prácticas, errores a evitar y para 3-5 capturas qué destaca (indice = posición en la lista).',
    });
    const estudiado = Date.now();
    const p = {
      ...datos, tema, plataforma: args.platform || 'web', tipo, estudiado, modelo: modelo || c.modeloVision, fuente: 'mobbin',
      ejemplos: (datos.ejemplos || []).map(e => ({ ...e, app: meta[e.indice]?.app_name || meta[e.indice]?.title || null, mobbin_url: meta[e.indice]?.mobbin_url || null })),
      apps: [...new Set(meta.map(m => m.app_name || m.title).filter(Boolean))],
    };
    p.slug = slug(`${p.plataforma}-${p.nombre}`);
    fs.mkdirSync(dirP, { recursive: true });
    fs.writeFileSync(path.join(dirP, p.slug + '.json'), JSON.stringify(p, null, 2));
    fs.writeFileSync(path.join(dirP, p.slug + '.md'), aMarkdown(p));
    try { memoria?.recordar({ texto: `Patrón de diseño «${p.nombre}» (${p.plataforma}): ${p.resumen} Ficha en la biblioteca de diseño: ${p.slug}.`, tipo: 'patron', origen: 'mobbin' }); } catch { }
    const e = leerEstado(); if (!e.estudiados.includes(tema)) e.estudiados.push(tema); guardarEstado(e);
    bus?.emit('evento', { tipo: 'diseno', accion: 'estudiado', slug: p.slug, nombre: p.nombre });
    return p;
  }

  function buscar(consulta, max = 3) {
    const q = palabras(consulta);
    const puntos = p => {
      const texto = palabras(`${p.nombre} ${p.tema} ${p.resumen} ${p.cuando_usar} ${(p.componentes || []).join(' ')}`);
      const t = new Set(texto);
      return q.reduce((s, w) => s + (t.has(w) ? 1 : 0), 0) / Math.max(1, q.length);
    };
    return lista().map(p => ({ p, s: puntos(p) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, max).map(x => x.p);
  }
  const leerFicha = s => { try { return fs.readFileSync(path.join(dirP, slug(s) + '.md'), 'utf8'); } catch { return null; } };

  // aprendizaje autónomo: los siguientes temas del temario que aún no ha estudiado
  async function estudiarNoche() {
    const c = conf(); if (!mcpRemotos.conectado('mobbin')) return null;
    const hechos = new Set(leerEstado().estudiados), temario = [...(c.temario || []).map(t => Array.isArray(t) ? t : [t, 'ios', 'pantallas']), ...TEMARIO];
    const toca = temario.filter(([t]) => !hechos.has(t)).slice(0, c.porNoche);
    const ok = [];
    for (const [t, plat, tipo] of toca) { try { ok.push((await estudiar(t, { plataforma: plat, tipo })).nombre); } catch (e) { console.log('[diseño]', t, e.message); } }
    return ok.length ? `Esta noche estudié ${ok.length} patrón(es) de diseño en Mobbin: ${ok.join(', ')}.` : null;
  }
  tareas?.registrarInterna?.('estudiar-diseno', estudiarNoche);
  function programar() {           // la crea el daemon (como el sueño): una sola tarea, con el horario de cfg.diseno
    if (!tareas) return;
    const c = conf(), ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === 'estudiar-diseno');
    if (!c.aprendizaje) { if (ya) tareas.borrar(ya.id); return; }
    if (ya && ya.cuando?.cron === c.cron) return;
    if (ya) tareas.borrar(ya.id);
    tareas.crear({ nombre: 'Estudiar diseño en Mobbin', cuando: { cron: c.cron }, accion: { tipo: 'interna', nombre: 'estudiar-diseno' } });
  }

  const HERRAMIENTAS = [
    {
      nombre: 'buscar_patrones_diseno', riesgo: 'lectura',
      descripcion: 'Biblioteca de diseño de APOLO (patrones aprendidos de apps reales en Mobbin). ÚSALA ANTES de diseñar o maquetar cualquier interfaz (web, app, panel, landing, dashboard, formulario…): devuelve las fichas de los patrones relevantes (estructura, componentes, textos, detalles, errores a evitar). Si no hay nada útil, estudia el tema con estudiar_diseno.',
      parametros: { type: 'object', properties: { consulta: { type: 'string', description: 'qué vas a diseñar, p. ej. "pantalla de login" o "página de precios"' } }, required: ['consulta'] },
      resumen: a => a.consulta,
      ejecutar: async a => {
        const r = buscar(a.consulta);
        const mb = mcpRemotos.conectado('mobbin');
        if (!r.length) return `No hay patrones sobre «${a.consulta}» en la biblioteca (${lista().length} en total: ${lista().map(p => p.nombre).join(', ') || 'vacía'}). ${mb ? 'Estúdialo AHORA con estudiar_diseno (un tema concreto) y diseña siguiendo esa ficha.' : 'Mobbin no está conectado: diseña con tu criterio.'}`;
        const nota = mb ? 'Si ninguna ficha es EXACTAMENTE lo que vas a diseñar (p. ej. es un onboarding y tú haces un login), estudia antes ese tema con estudiar_diseno.' : '';
        return (nota ? nota + '\n\n' : '') + r.map(p => leerFicha(p.slug)).join('\n\n---\n\n').slice(0, 24_000);
      },
    },
    {
      nombre: 'estudiar_diseno', riesgo: 'lectura',
      descripcion: 'Estudia un patrón de diseño en Mobbin (capturas reales de apps líderes): busca ejemplos, los mira con un modelo con visión y guarda la ficha del patrón en la biblioteca de diseño para siempre. Úsalo cuando vayas a diseñar algo que no está en la biblioteca, o cuando el usuario te pida aprender/estudiar un tipo de pantalla. Un tema = una pantalla, flujo o sección concreta.',
      parametros: { type: 'object', properties: {
        tema: { type: 'string', description: 'una sola pantalla/flujo/sección en lenguaje claro, p. ej. "checkout con Apple Pay y código promocional"' },
        plataforma: { type: 'string', enum: ['ios', 'web'] }, tipo: { type: 'string', enum: ['pantallas', 'flujos', 'secciones'] },
      }, required: ['tema'] },
      resumen: a => `${a.tema} (${a.plataforma || 'ios'}, ${a.tipo || 'pantallas'})`,
      disponible: () => mcpRemotos.conectado('mobbin'),
      ejecutar: async (a, ctx) => {
        const p = await estudiar(a.tema, { plataforma: a.plataforma, tipo: a.tipo, signal: ctx?.signal });
        return `Aprendido y guardado en la biblioteca: «${p.nombre}» (apps: ${p.apps.join(', ')}).\n\n${aMarkdown(p)}`;
      },
    },
  ];

  async function http(M, p, b = {}, q = {}) {         // /v1/diseno
    if (M === 'GET' && !p[2]) return { patrones: lista().map(({ slug: s, nombre, resumen, tema, plataforma, tipo, estudiado, apps }) => ({ slug: s, nombre, resumen, tema, plataforma, tipo, estudiado, apps })), mobbin: mcpRemotos.conectado('mobbin'), config: conf(), pendientes: TEMARIO.filter(([t]) => !leerEstado().estudiados.includes(t)).length };
    if (M === 'GET' && p[2] === 'buscar') return { patrones: buscar(q.q || '', 5).map(x => x.slug) };
    if (M === 'GET' && p[2]) { const f = leerFicha(p[2]); if (!f) throw Object.assign(new Error('no existe'), { status: 404 }); return { slug: p[2], markdown: f }; }
    if (M === 'POST' && p[2] === 'estudiar') { const r = await estudiar(b.tema, b); return { slug: r.slug, nombre: r.nombre }; }
    if (M === 'POST' && p[2] === 'estudiar-ya') return { resultado: await estudiarNoche() };
    if (M === 'PATCH' && p[2] === 'config') {
      const e = leerEstado(), c = { ...(e.config || {}) };
      if (typeof b.aprendizaje === 'boolean') c.aprendizaje = b.aprendizaje;
      if (Number.isFinite(+b.porNoche) && b.porNoche !== undefined) c.porNoche = Math.max(1, Math.min(10, +b.porNoche));
      if (typeof b.modeloVision === 'string' && b.modeloVision.includes('/')) c.modeloVision = b.modeloVision.trim();
      if (typeof b.cron === 'string' && /^[\d*/,\- ]{9,40}$/.test(b.cron)) c.cron = b.cron.trim();
      e.config = c; guardarEstado(e); programar();
      return { config: conf() };
    }
    if (M === 'DELETE' && p[2]) { let ok = false; for (const ext of ['.md', '.json']) try { fs.unlinkSync(path.join(dirP, slug(p[2]) + ext)); ok = true; } catch { } return { ok }; }
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  return { estudiar, buscar, lista, leerFicha, estudiarNoche, programar, http, HERRAMIENTAS, TEMARIO };
}

module.exports = { crearDiseno, TEMARIO };
