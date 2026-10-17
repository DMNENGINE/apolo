// Herramientas por grupos: en cada llamada al modelo van las del NÚCLEO + los grupos que pide la conversación, no las ~110.
// Mandarlas todas costaba ~12 000 tokens por llamada (también en un "hola"), multiplicado por cada paso del agente.
// Un grupo entra si: (1) lo que dice el usuario (o el encargo) encaja con sus palabras, (2) ya se usó una herramienta suya
// en esta conversación, o (3) el modelo lo pide con cargar_herramientas. Lo que no está en ningún grupo va siempre (plugins
// nuevos: mejor de más que de menos). cfg.herramientasPorGrupos = false → todas como antes.
'use strict';

// núcleo: lo que cualquier charla o encargo puede necesitar
const NUCLEO = new Set(['shell', 'leer_archivo', 'listar', 'escribir_archivo', 'editar_archivo', 'web', 'programar_tarea', 'ver_tareas', 'borrar_tarea',
  'cambiar_nombre', 'recordar', 'buscar_memoria', 'olvidar', 'buscar_historial', 'usar_skill', 'leer_recurso_skill', 'anotar_skill', 'ejecutar_script_skill',
  'delegar', 'nacer', 'cargar_herramientas']);

const CRAFT = ['filmcraft', 'effectcraft', 'photocraft', 'lightcraft', 'vectorcraft', 'cadcraft', 'figcraft', 'designcraft', 'deckcraft', 'wordcraft', 'gridcraft', 'pdfcraft', 'soundcraft'];
const GRUPOS = {
  pantalla: { d: 'ver la pantalla del PC y usar ratón/teclado en cualquier app (clic, escribir, teclas, arrastrar, grabar una demostración)',
    nombres: ['ver_pantalla', 'tomar_control', 'soltar_control', 'clic', 'escribir', 'tecla', 'scroll', 'arrastrar', 'grabar_demostracion'],
    palabras: /pantalla|clic|click|rat[oó]n|teclado|ventana|escritorio|controla|haz.*en (la|el|mi) (app|programa)|abre (el|la) (app|programa)|mira (esto|lo que|mi)|demostraci/i },
  navegador: { d: 'navegador Chrome: abrir páginas, leer, captura, clic, escribir, descargar/subir archivos',
    nombres: [], prefijos: ['navegador_'],
    palabras: /navegador|chrome|p[aá]gina|pesta[ñn]a|https?:\/\/|www\.|\.com\b|youtube|google|gemini|suno|inicia sesi[oó]n|formulario|descarga|sube (el|la|un)|web de/i },
  creativo: { d: 'suite ArtCraft (vídeo, fotos, motion graphics, audio, diseño, CAD, presentaciones, documentos, hojas de cálculo, PDF) + recetas fijas: subtitular_video, hacer_miniatura, masterizar_audio, rotulo_animado, titulo_animado, kit_marca, revisar_calidad',
    nombres: [...CRAFT, 'subtitular_video', 'hacer_miniatura', 'masterizar_audio', 'rotulo_animado', 'titulo_animado', 'kit_marca', 'revisar_calidad'],
    palabras: /v[ií]deo|video|clip|subt[ií]tul|tiktok|short|reel|miniatura|portada|thumbnail|foto|imagen|retoca|recorta|logo|svg|vector|plano|\bcad\b|dxf|dwg|presentaci|diapositiva|excel|hoja de c[aá]lculo|\bpdf\b|audio|podcast|m[uú]sica|mezcl|masteriz|lufs|r[oó]tulo|lower third|t[ií]tulo animado|animaci|kit de marca|marca|dise[ñn]a (un|una|el|la)|p[oó]ster|folleto|documento|craft\b|filmcraft|photocraft|effectcraft|soundcraft|calidad del/i },
  diseno: { d: 'biblioteca de diseño de interfaces (Mobbin, patrones de apps reales)', nombres: ['buscar_patrones_diseno', 'estudiar_diseno'], prefijos: ['mobbin_'],
    palabras: /dise[ñn]o|interfaz|\bui\b|\bux\b|mobbin|patr[oó]n|pantallas de (la )?app|onboarding|landing/i },
  dashboards: { d: 'dashboards de datos (crear, editar, ver)', nombres: ['crear_dashboard', 'editar_dashboard', 'ver_dashboards'],
    palabras: /dashboard|tablero|panel de (datos|m[eé]tricas)|kpi|m[eé]trica|gr[aá]fic/i },
  reuniones: { d: 'reuniones: grabar, transcribir y resumir', nombres: ['reunion_empezar', 'reunion_parar', 'reuniones_ver', 'reunion_resumen'],
    palabras: /reuni[oó]n|reuniones|\bmeet\b|zoom|acta|minuta/i },
  gamer: { d: 'modo gamer: rendimiento del PC, limpiar, medir FPS', nombres: [], prefijos: ['gamer_', 'modo_gamer'],
    palabras: /gamer|juego|jugar|\bfps\b|rendimiento|lag\b|pc (va )?lento|limpia(r)? el pc|american truck|\bats\b|euro truck/i },
  turno: { d: 'turno de noche: trabajos largos mientras el usuario duerme', nombres: [], prefijos: ['turno_'],
    palabras: /turno de noche|esta noche|mientras duermo|ma[ñn]ana (temprano|por la ma[ñn]ana)|toda la noche/i },
  archive: { d: 'Internet Archive / Wayback Machine', nombres: [], prefijos: ['archive_'], palabras: /archive\.org|wayback|internet archive|versi[oó]n antigua de (la|una) web/i },
  alma: { d: 'tu identidad: alma, metas, mirar dentro, evolucionar', nombres: ['evolucionar_alma', 'ver_alma', 'mirar_dentro', 'mis_metas'],
    palabras: /\balma\b|identidad|personalidad|qui[eé]n eres|tus metas|mirar dentro|evoluciona|c[oó]mo te sientes|tu diario/i },
  consejo: { d: 'consejo de modelos: preguntar a varios modelos y comparar', nombres: ['consultar_consejo'], palabras: /consejo|varios modelos|compara(r)? (modelos|respuestas)|segunda opini[oó]n/i },
  grafo: { d: 'grafo de conocimiento (conexiones entre recuerdos)', nombres: ['explorar_grafo'], palabras: /grafo|conexiones|relaci[oó]n entre/i },
  skills: { d: 'gestionar skills: instalar, ver, crear, mejorar', nombres: ['instalar_skill', 'ver_skills', 'crear_skill', 'mejorar_skill'], palabras: /\bskills?\b|habilidad(es)?/i },
  correo: { d: 'correo electrónico: bandeja, leer, buscar, enviar', nombres: [], prefijos: ['correo_'], palabras: /correo|e-?mail|gmail|outlook|bandeja|inbox/i },
  github: { d: 'GitHub: repos, issues, notificaciones', nombres: [], prefijos: ['github_'], palabras: /github|\brepo\b|repositorio|\bissues?\b|pull request|\bpr\b/i },
  huggingface: { d: 'Hugging Face: buscar modelos y datasets', nombres: [], prefijos: ['hf_'], palabras: /hugging ?face|\bhf\b|dataset/i },
  voz: { d: 'voces de ElevenLabs (hablar con otra voz)', nombres: [], prefijos: ['elevenlabs_'], palabras: /elevenlabs|voz (de|con)|locuci[oó]n|narra/i },
  nexo: { d: 'Nexo, la red social de agentes', nombres: [], prefijos: ['nexo_'], palabras: /\bnexo\b|red social de agentes/i },
};

// grupo de una herramienta (o null = va siempre)
function grupoDe(nombre) {
  if (NUCLEO.has(nombre)) return 'nucleo';
  for (const [g, x] of Object.entries(GRUPOS)) if (x.nombres.includes(nombre) || (x.prefijos || []).some(p => nombre.startsWith(p))) return g;
  return null;
}

// grupos que pide un texto (puro)
const gruposDeTexto = texto => Object.entries(GRUPOS).filter(([, x]) => x.palabras.test(String(texto || ''))).map(([g]) => g);

// grupos activos de una sesión: lo pedido por el texto del usuario (este mensaje y los 2 anteriores), lo ya usado, lo cargado
function gruposActivos(s, texto) {
  const g = new Set(s.gruposCargados || []);
  const usuario = (s.mensajes || []).filter(m => m.role === 'user').slice(-3).map(m => m.content).join('\n');
  for (const x of gruposDeTexto(`${texto || ''}\n${usuario}\n${s.titulo || ''}`)) g.add(x);
  for (const m of s.mensajes || []) for (const c of m.toolCalls || []) { const x = grupoDe(c.name); if (x && x !== 'nucleo') g.add(x); }
  return g;
}

// de todas las herramientas disponibles, las que van en esta llamada
function filtrar(herramientas, grupos) {
  return herramientas.filter(h => { const g = grupoDe(h.nombre); return g === null || g === 'nucleo' || grupos.has(g); });
}

// la herramienta para cargar un grupo que no entró solo
function crearCargar() {
  return {
    nombre: 'cargar_herramientas', riesgo: 'lectura',
    descripcion: 'Tus herramientas van por grupos y ahora solo tienes las básicas y las del tema de la conversación. Si necesitas otras, carga su grupo y en el siguiente paso ya las tienes. Grupos: '
      + Object.entries(GRUPOS).map(([g, x]) => `${g} (${x.d})`).join('; ') + '.',
    parametros: { type: 'object', properties: { grupos: { type: 'array', items: { type: 'string', enum: Object.keys(GRUPOS) } } }, required: ['grupos'] },
    resumen: a => (a.grupos || []).join(', '),
    ejecutar: async (a, ctx = {}) => {
      const s = ctx.sesion; const pedidos = (a.grupos || []).filter(g => GRUPOS[g]);
      if (!pedidos.length) return `No conozco esos grupos. Hay: ${Object.keys(GRUPOS).join(', ')}`;
      if (s) s.gruposCargados = [...new Set([...(s.gruposCargados || []), ...pedidos])];
      return `Cargado: ${pedidos.join(', ')}. Ya puedes usar sus herramientas.`;
    },
  };
}

module.exports = { NUCLEO, GRUPOS, grupoDe, gruposDeTexto, gruposActivos, filtrar, crearCargar };
