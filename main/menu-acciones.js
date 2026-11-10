// Acciones predeterminadas del menú de APOLO. Cada una: id, icono, título, detalle, `cuando` (qué tiene que haber seleccionado)
// y `prompt` (lo que se le pide a APOLO; plantillas: {seleccion} {carpeta} {archivo} {app} {titulo}) o un `tipo` especial.
// cuando: video | imagen | audio | codigo | texto | carpeta | archivos (cualquier selección) | navegador | siempre
// Las del usuario se guardan aparte (userData/menu-acciones.json) y usan el mismo formato.
const ACCIONES = [
  // vídeo
  { id: 'v-subtitular', ic: '💬', t: 'Subtitular este vídeo', d: 'subtítulos animados listos para redes', cuando: 'video', prompt: 'Subtitula {seleccion} con tus herramientas de vídeo (subtitular_video), estilo que encaje, y guárdalo al lado.' },
  { id: 'v-portada', ic: '🖼', t: 'Hacer una portada', d: 'miniatura con el mejor momento', cuando: 'video', prompt: 'Hazme una portada/miniatura para {seleccion} (hacer_miniatura) y guárdala al lado.' },
  { id: 'v-clips', ic: '✂', t: 'Sacar clips verticales', d: 'los mejores momentos en 9:16', cuando: 'video', prompt: 'Saca los mejores momentos de {seleccion} como clips verticales 9:16 con subtítulos y guárdalos en una carpeta "clips" al lado.' },
  { id: 'v-mp4', ic: '🗜', t: 'Convertir a MP4 ligero', d: 'H.264, buena calidad, menos peso', cuando: 'video', prompt: 'Convierte {seleccion} a MP4 H.264 ligero (ffmpeg, calidad visual alta) y deja el original intacto.' },
  // imagen
  { id: 'i-mejorar', ic: '✨', t: 'Mejorar / ampliar imágenes', d: 'más nitidez y resolución', cuando: 'imagen', prompt: 'Mejora y amplía {seleccion} (usa tu plugin de realce si está activo) y guarda las versiones mejoradas al lado.' },
  { id: 'i-fondo', ic: '🪄', t: 'Quitar el fondo', d: 'PNG con transparencia', cuando: 'imagen', prompt: 'Quita el fondo de {seleccion} y guarda PNG transparentes al lado.' },
  { id: 'i-redes', ic: '📐', t: 'Adaptar para redes', d: '1:1, 4:5 y 9:16', cuando: 'imagen', prompt: 'Haz versiones 1:1, 4:5 y 9:16 de {seleccion} para redes, sin deformar, y guárdalas en una carpeta "redes" al lado.' },
  // audio
  { id: 'a-transcribir', ic: '📝', t: 'Transcribir', d: 'texto de lo que se dice', cuando: 'audio', prompt: 'Transcribe {seleccion} y guarda el texto al lado en .txt.' },
  { id: 'a-master', ic: '🎚', t: 'Masterizar el audio', d: 'volumen de estudio (-14 LUFS)', cuando: 'audio', prompt: 'Masteriza {seleccion} (masterizar_audio) y guarda la versión masterizada al lado.' },
  // código
  { id: 'c-explicar', ic: '🔎', t: 'Explicar este código', d: 'qué hace y cómo', cuando: 'codigo', prompt: 'Explícame qué hace {seleccion}, cómo está organizado y qué partes son delicadas.' },
  { id: 'c-revisar', ic: '🛡', t: 'Revisar fallos (araña de código)', d: 'seguridad y bugs', cuando: 'codigo', tipo: 'arana', arana: 'codigo' },
  { id: 'c-tests', ic: '🧪', t: 'Escribir tests', d: 'pruebas para lo importante', cuando: 'codigo', prompt: 'claude: Escribe tests para {seleccion} cubriendo lo importante, ejecútalos y dime el resultado.' },
  // texto / documentos
  { id: 't-leer', ic: '📖', t: 'Leer entero (araña lectora)', d: 'resumen completo y trampas', cuando: 'texto', tipo: 'arana', arana: 'lectora' },
  { id: 't-traducir', ic: '🌐', t: 'Traducir al inglés', d: 'guarda la traducción al lado', cuando: 'texto', prompt: 'Traduce {seleccion} al inglés manteniendo el formato y guarda la traducción al lado.' },
  { id: 't-ia', ic: '🤖', t: '¿Lo escribió una IA?', d: 'detectora de IA', cuando: 'texto', tipo: 'arana', arana: 'ia' },
  // carpeta / selección
  { id: 'f-video', ic: '🎬', t: 'Crear un vídeo con esto', d: 'monta lo mejor', cuando: 'carpeta', prompt: 'Crea un vídeo con el contenido de {seleccion}: elige lo mejor, móntalo con tus herramientas de vídeo (FilmCraft, subtítulos, música si hay) y guárdalo en {carpeta}. Cuéntame qué has hecho.' },
  { id: 'f-programa', ic: '💻', t: 'Crear un programa con esto', d: 'Claude Code lo construye', cuando: 'archivos', prompt: 'claude: Crea un programa a partir de lo que hay en {seleccion}. Mira primero qué contiene, propón qué programa tiene sentido, constrúyelo en una carpeta nueva al lado y explícame cómo usarlo.' },
  { id: 'f-ordenar', ic: '🗂', t: 'Proponer cómo ordenarlo', d: 'sin mover nada sin tu OK', cuando: 'carpeta', prompt: 'Mira {seleccion} y propónme cómo ordenarlo (carpetas, nombres, duplicados). No muevas nada sin que te lo apruebe.' },
  { id: 'f-duplicados', ic: '👯', t: 'Buscar duplicados', d: 'archivos repetidos', cuando: 'carpeta', prompt: 'Busca archivos duplicados en {seleccion} (por contenido, no solo por nombre) y enséñame la lista. No borres nada.' },
  { id: 'f-zip', ic: '📦', t: 'Copia de seguridad (zip)', d: 'zip con fecha al lado', cuando: 'archivos', prompt: 'Haz un zip de {seleccion} con la fecha en el nombre y guárdalo al lado.' },
  { id: 'f-resumir', ic: '📝', t: 'Resumir lo que hay', d: '', cuando: 'archivos', prompt: 'Mira {seleccion} y hazme un resumen claro de lo que contiene.' },
  { id: 'f-aprender', ic: '🧠', t: 'Que APOLO lo aprenda', d: 'lo guarda en su memoria', cuando: 'archivos', prompt: 'Lee {seleccion} y guarda en tu memoria lo importante (qué es, para qué sirve, datos clave).' },
  // navegador
  { id: 'n-resumir', ic: '📰', t: 'Resumir esta página', d: 'la pestaña activa', cuando: 'navegador', prompt: 'Lee la pestaña activa de mi navegador y hazme un resumen claro.' },
  { id: 'n-lectora', ic: '🕷', t: 'Soltar la lectora en esta pestaña', d: 'la lee entera', cuando: 'navegador', tipo: 'arana', arana: 'lectora' },
  // siempre
  { id: 's-pantalla', ic: '👀', t: '¿Qué hay en mi pantalla?', d: 'APOLO mira y te cuenta', cuando: 'siempre', prompt: 'Mira mi pantalla ahora mismo (en {app}: "{titulo}") y dime qué ves y si puedo hacer algo mejor.' },
  { id: 's-entreno', ic: '🧬', t: '¿Cómo va tu nacimiento?', d: 'el entrenamiento en Proxmox', cuando: 'siempre', prompt: '¿Cómo va el entrenamiento de tu modelo propio?' },
];
module.exports = { ACCIONES };
