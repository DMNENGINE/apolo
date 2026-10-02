// Herramientas del agente. riesgo: lectura (se permite sola) | escritura | ejecucion (pasan por permisos).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MAX = 20_000;
const recortar = s => (s.length > MAX ? s.slice(0, MAX) + `\n…[recortado, ${s.length - MAX} caracteres más]` : s);
const ruta = (ctx, r) => path.resolve(ctx.cwd, String(r || '.'));

const HERRAMIENTAS = [
  {
    nombre: 'shell', riesgo: 'ejecucion',
    descripcion: `Ejecuta un comando en ${process.platform === 'win32' ? 'PowerShell' : 'bash'} y devuelve la salida.`,
    parametros: { type: 'object', properties: { comando: { type: 'string' }, timeoutSeg: { type: 'number' } }, required: ['comando'] },
    resumen: a => a.comando,
    ejecutar: (a, ctx) => new Promise(ok => {
      const [bin, args] = process.platform === 'win32'
        ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', a.comando]]
        : ['bash', ['-lc', a.comando]];
      const p = spawn(bin, args, { cwd: ctx.cwd, windowsHide: true });
      let out = '';
      p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
      const t = setTimeout(() => { p.kill(); out += '\n[cancelado por tiempo]'; }, Math.min(a.timeoutSeg || 120, 600) * 1000);
      ctx.signal?.addEventListener('abort', () => p.kill(), { once: true });
      p.on('close', code => { clearTimeout(t); ok(recortar(`${out.trim()}\n[código de salida ${code}]`)); });
      p.on('error', e => { clearTimeout(t); ok(`error: ${e.message}`); });
    }),
  },
  {
    nombre: 'leer_archivo', riesgo: 'lectura',
    descripcion: 'Lee un archivo de texto. Opcional: desde (línea, 1 = primera) y lineas.',
    parametros: { type: 'object', properties: { ruta: { type: 'string' }, desde: { type: 'number' }, lineas: { type: 'number' } }, required: ['ruta'] },
    resumen: a => a.ruta,
    ejecutar: async (a, ctx) => {
      const lineas = fs.readFileSync(ruta(ctx, a.ruta), 'utf8').split('\n');
      const ini = Math.max(1, a.desde || 1), fin = Math.min(lineas.length, ini - 1 + (a.lineas || 2000));
      return recortar(lineas.slice(ini - 1, fin).map((l, i) => `${ini + i}\t${l}`).join('\n') + (fin < lineas.length ? `\n…(${lineas.length} líneas en total)` : ''));
    },
  },
  {
    nombre: 'listar', riesgo: 'lectura',
    descripcion: 'Lista el contenido de una carpeta.',
    parametros: { type: 'object', properties: { ruta: { type: 'string' } } },
    resumen: a => a.ruta || '.',
    ejecutar: async (a, ctx) => recortar(fs.readdirSync(ruta(ctx, a.ruta), { withFileTypes: true })
      .map(e => (e.isDirectory() ? `${e.name}/` : e.name)).join('\n') || '(vacía)'),
  },
  {
    nombre: 'escribir_archivo', riesgo: 'escritura',
    descripcion: 'Crea o sobrescribe un archivo con el contenido dado.',
    parametros: { type: 'object', properties: { ruta: { type: 'string' }, contenido: { type: 'string' } }, required: ['ruta', 'contenido'] },
    resumen: a => a.ruta,
    ejecutar: async (a, ctx) => {
      const f = ruta(ctx, a.ruta);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, a.contenido);
      return `escrito ${f} (${Buffer.byteLength(a.contenido)} bytes)`;
    },
  },
  {
    nombre: 'editar_archivo', riesgo: 'escritura',
    descripcion: 'Reemplaza un texto exacto (debe aparecer una sola vez) por otro dentro de un archivo.',
    parametros: { type: 'object', properties: { ruta: { type: 'string' }, buscar: { type: 'string' }, reemplazar: { type: 'string' } }, required: ['ruta', 'buscar', 'reemplazar'] },
    resumen: a => a.ruta,
    ejecutar: async (a, ctx) => {
      const f = ruta(ctx, a.ruta);
      const txt = fs.readFileSync(f, 'utf8');
      const n = txt.split(a.buscar).length - 1;
      if (n !== 1) return `error: el texto aparece ${n} veces (debe ser 1)`;
      fs.writeFileSync(f, txt.replace(a.buscar, () => a.reemplazar));
      return `editado ${f}`;
    },
  },
  {
    nombre: 'web', riesgo: 'lectura',
    descripcion: 'Descarga una página web y devuelve su texto.',
    parametros: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    resumen: a => a.url,
    ejecutar: async (a, ctx) => {
      if (!/^https?:\/\//i.test(a.url)) return 'error: solo http(s)';
      const r = await fetch(a.url, { signal: ctx.signal, headers: { 'user-agent': 'RobotCompanion/0.1' } });
      const html = await r.text();
      const txt = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
      return recortar(`[HTTP ${r.status}] ${txt}`);
    },
  },
  {
    nombre: 'programar_tarea',
    riesgo: a => (a.tipo === 'agente' ? 'escritura' : 'lectura'),       // un recordatorio no pide permiso; un agente programado sí
    descripcion: 'Programa un recordatorio (tipo aviso) o una tarea que hará un agente (tipo agente). ' +
      'Usa UNO de: en (fecha-hora local "YYYY-MM-DDTHH:mm", una vez), cron (5 campos "min hora día mes díaSemana", repetir; díaSemana 0=domingo) o cadaMin (cada N minutos). ' +
      'soloSiHayAlgo=true: el agente solo avisa si encuentra algo importante (para vigilar cosas).',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'nombre corto' },
        tipo: { type: 'string', enum: ['aviso', 'agente'] },
        texto: { type: 'string', description: 'aviso: el mensaje a recordar. agente: la instrucción que ejecutará' },
        en: { type: 'string' }, cron: { type: 'string' }, cadaMin: { type: 'number' },
        soloSiHayAlgo: { type: 'boolean' },
      },
      required: ['tipo', 'texto'],
    },
    resumen: a => `${a.tipo} "${a.nombre || a.texto}" · ${a.en || a.cron || (a.cadaMin ? 'cada ' + a.cadaMin + ' min' : '?')}`,
    ejecutar: async (a, ctx) => {
      const cuando = a.en ? { en: a.en } : a.cron ? { cron: a.cron } : a.cadaMin ? { cadaMin: a.cadaMin } : null;
      if (!cuando) return 'error: falta en, cron o cadaMin';
      const accion = { tipo: a.tipo, texto: a.texto };
      if (a.tipo === 'agente') Object.assign(accion, { modelo: ctx.sesion.modelo, cwd: ctx.sesion.cwd, soloSiHayAlgo: !!a.soloSiHayAlgo });
      const t = ctx.tareas.crear({ nombre: a.nombre, cuando, accion, canal: ctx.sesion.canal === 'discord' ? 'discord' : 'isla' });
      return `tarea ${t.id} creada (${ctx.tareas.describir(cuando)}); próxima: ${new Date(t.proxima).toLocaleString('es')}`;
    },
  },
  {
    nombre: 'ver_tareas', riesgo: 'lectura',
    descripcion: 'Lista las tareas y recordatorios programados.',
    parametros: { type: 'object', properties: {} },
    resumen: () => '',
    ejecutar: async (a, ctx) => ctx.tareas.lista().map(t => `${t.id} · ${t.activa ? '●' : '○'} ${t.nombre} · ${t.accion.tipo} · ${ctx.tareas.describir(t.cuando)}` +
      `${t.proxima ? ' · próxima ' + new Date(t.proxima).toLocaleString('es') : ''}${t.ultimoResultado ? ' · última: ' + t.ultimoResultado.slice(0, 80) : ''}`).join('\n') || '(no hay tareas)',
  },
  {
    nombre: 'borrar_tarea', riesgo: 'lectura',
    descripcion: 'Borra una tarea programada por su id (usa ver_tareas para ver los ids).',
    parametros: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    resumen: a => a.id,
    ejecutar: async (a, ctx) => (ctx.tareas.borrar(a.id) ? `tarea ${a.id} borrada` : `no existe la tarea ${a.id}`),
  },
  {
    nombre: 'cambiar_nombre', riesgo: 'lectura',
    descripcion: 'Cambia TU nombre (el del compañero/asistente) cuando el usuario te pone o te cambia el nombre. ' +
      'Se guarda en tu identidad y la isla, el panel y los avisos pasan a usarlo.',
    parametros: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
    resumen: a => a.nombre,
    ejecutar: async (a, ctx) => `ahora te llamas ${ctx.personalidad.ponerNombre(a.nombre)}`,
  },
  {
    nombre: 'recordar', riesgo: 'lectura',
    descripcion: 'Guarda en la memoria permanente un dato útil sobre el usuario para futuras conversaciones (con cualquier modelo o canal). ' +
      'Úsalo SIN que te lo pidan cuando el usuario cuente algo duradero: quién es, sus preferencias, proyectos, personas, decisiones. ' +
      'Un dato por llamada, en una frase clara. tipo: perfil (quién es) | preferencia | proyecto | persona | hecho. ' +
      'Para corregir un recuerdo pasa su id en "reemplaza". Nunca guardes contraseñas ni claves.',
    parametros: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        tipo: { type: 'string', enum: ['perfil', 'preferencia', 'proyecto', 'persona', 'hecho'] },
        reemplaza: { type: 'string', description: 'id del recuerdo a corregir (opcional)' },
      },
      required: ['texto'],
    },
    resumen: a => `${a.tipo || 'hecho'}: ${a.texto}`,
    ejecutar: async (a, ctx) => { const m = ctx.memoria.recordar({ ...a, origen: ctx.sesion.modelo }); return `recuerdo ${m.id} ${m.accion}`; },
  },
  {
    nombre: 'buscar_memoria', riesgo: 'lectura',
    descripcion: 'Busca en la memoria permanente datos guardados sobre el usuario.',
    parametros: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] },
    resumen: a => a.consulta,
    ejecutar: async (a, ctx) => (await ctx.memoria.buscarH(a.consulta, { limite: 10 })).map(m => `${m.id} · ${m.tipo} · ${m.texto}`).join('\n') || '(nada guardado sobre eso)',
  },
  {
    nombre: 'olvidar', riesgo: 'lectura',
    descripcion: 'Borra un recuerdo de la memoria permanente por su id (cuando el usuario lo pida o el dato ya no es cierto).',
    parametros: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    resumen: a => a.id,
    ejecutar: async (a, ctx) => (ctx.memoria.olvidar(a.id) ? `recuerdo ${a.id} borrado` : `no existe el recuerdo ${a.id}`),
  },
  {
    nombre: 'buscar_historial', riesgo: 'lectura',
    descripcion: 'Busca en las conversaciones pasadas (últimos 30 días) lo que se habló sobre algo.',
    parametros: { type: 'object', properties: { consulta: { type: 'string' }, dias: { type: 'number' } }, required: ['consulta'] },
    resumen: a => a.consulta,
    ejecutar: async (a, ctx) => require('./memoria').buscarHistorial({ cfg: ctx.cfg, consulta: a.consulta, dias: a.dias || 30 })
      .filter(r => r.sesion !== ctx.sesion.id)
      .map(r => `[${new Date(r.t).toLocaleString('es')} · ${r.rol === 'user' ? 'usuario' : 'asistente'}] ${r.texto}`).join('\n') || '(no encontré nada)',
  },
  {
    nombre: 'ver_pantalla',                              // pide permiso (una captura puede enseñar cosas privadas); admite "siempre".
    riesgo: (a, s) => (s?.controlando ? 'lectura' : 'pantalla'),   // con el control concedido, mirar no vuelve a preguntar
    descripcion: 'Mira la pantalla del usuario: devuelve una captura del monitor (como imagen) y la lista de botones/campos/menús de la ventana activa ' +
      'con su posición [x,y] en la imagen. Úsalo cuando necesites saber qué hay en pantalla. Si tu modelo no ve imágenes, guíate por la lista.',
    parametros: {
      type: 'object',
      properties: {
        monitor: { type: 'number', description: '0 = el de la ventana activa (por defecto); 1..N = ese monitor' },
        imagen: { type: 'boolean', description: 'false = solo la lista de elementos (más rápido y barato)' },
      },
    },
    resumen: a => (a.imagen === false ? 'elementos de la ventana activa' : `captura${a.monitor ? ` del monitor ${a.monitor}` : ''}`),
    ejecutar: (a, ctx) => require('./escritorio').verPantalla({ cfg: ctx.cfg, sesion: ctx.sesion, monitor: a.monitor || 0, imagen: a.imagen !== false }),
  },
  {
    nombre: 'tomar_control', riesgo: 'control', siemprePreguntar: () => 'control del ratón y el teclado',
    descripcion: 'Pide al usuario el control de SU ratón y teclado durante unos minutos para un encargo concreto (se aprueba una vez). ' +
      'Necesario antes de clic/escribir/tecla/scroll/arrastrar. Si el usuario mueve el ratón o pulsa una tecla, recupera el control y tu turno se detiene. ' +
      'Las acciones delicadas (enviar, borrar, comprar, pagar, publicar…) piden permiso aparte. Suelta el control con soltar_control al terminar.',
    parametros: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'qué vas a hacer, en una frase que el usuario entienda' }, minutos: { type: 'number', description: '1-30, por defecto 5' } },
      required: ['motivo'],
    },
    resumen: a => `${a.motivo} (${a.minutos || 5} min)`,
    ejecutar: async (a, ctx) => {
      const r = await ctx.control.tomar(ctx.sesion, { motivo: a.motivo, minutos: a.minutos });
      return `Control concedido durante ${r.minutos} min. Flujo: ver_pantalla → acción (clic/escribir/tecla/scroll usando el #elemento o x,y de la imagen) → ver_pantalla para comprobar. Al acabar, soltar_control.`;
    },
  },
  {
    nombre: 'soltar_control', riesgo: 'lectura',
    descripcion: 'Devuelve el ratón y el teclado al usuario (úsalo en cuanto termines el encargo).',
    parametros: { type: 'object', properties: {} },
    resumen: () => 'devolver el control',
    ejecutar: async (a, ctx) => (ctx.control.soltar(ctx.sesion.id, 'terminado') ? 'control devuelto al usuario' : 'no tenías el control'),
  },
  ...[
    ['clic', 'Hace clic en un elemento (#id de ver_pantalla, preferible) o en x,y de la imagen.', {
      elemento: { type: 'number', description: 'id del elemento en la última ver_pantalla' }, x: { type: 'number' }, y: { type: 'number' },
      boton: { type: 'string', enum: ['izq', 'der', 'medio'] }, doble: { type: 'boolean' } }, [], a => `${a.doble ? 'doble ' : ''}clic ${a.elemento ? '#' + a.elemento : `${a.x},${a.y}`}`],
    ['escribir', 'Escribe texto con el teclado. Si das elemento o x,y, primero hace clic ahí para darle el foco. Nunca escribe en campos de contraseña.', {
      texto: { type: 'string' }, elemento: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' } }, ['texto'], a => `"${String(a.texto || '').slice(0, 60)}"`],
    ['tecla', 'Pulsa una tecla o combinación: "enter", "esc", "tab", "ctrl+s", "alt+tab", "ctrl+shift+t", "f5", "win"…', {
      combo: { type: 'string' } }, ['combo'], a => a.combo],
    ['scroll', 'Rueda del ratón: cantidad positiva = abajo, negativa = arriba (en "muescas"). Opcionalmente sobre un elemento o x,y.', {
      cantidad: { type: 'number' }, elemento: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' } }, ['cantidad'], a => `${a.cantidad}`],
    ['arrastrar', 'Arrastra con el botón izquierdo desde (elemento o x,y) hasta (elemento2 o x2,y2).', {
      elemento: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, elemento2: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }, [], a => 'arrastrar'],
  ].map(([nombre, descripcion, properties, required, resumen]) => ({
    nombre, riesgo: 'lectura',                         // el permiso es el del encargo (tomar_control) + los delicados, que pregunta el control
    descripcion: `${descripcion} Requiere tomar_control. Las coordenadas x,y son píxeles de la imagen de ver_pantalla.`,
    parametros: { type: 'object', properties, required },
    resumen,
    ejecutar: (a, ctx) => ctx.control.accion(ctx.sesion, nombre, a),
  })),
  // ---------- navegador del usuario (extensión): permiso por sitio dentro del módulo ----------
  ...[
    ['pestanas', 'Lista las pestañas abiertas en el navegador del usuario (id, título, url). Las marcadas [tuya] las abriste tú.', {}, [], () => 'pestañas'],
    ['abrir', 'Abre una dirección en el navegador del usuario (por defecto en una pestaña nueva de tu grupo). Pide permiso por sitio.', {
      url: { type: 'string' }, nueva: { type: 'boolean', description: 'false = en la última pestaña que usaste' } }, ['url'], a => a.url],
    ['leer', 'Lee una pestaña: texto de la página y lista numerada de enlaces/botones/campos para actuar. Por defecto, la última que usaste o la activa.', {
      pestana: { type: 'number' }, max: { type: 'number', description: 'máx. caracteres de texto (8000 por defecto)' } }, [], a => `pestaña ${a.pestana ?? 'actual'}`],
    ['captura', 'Captura de imagen de una pestaña (la pone visible). Útil si la página es muy visual; para actuar usa los números de navegador_leer.', {
      pestana: { type: 'number' } }, [], a => `pestaña ${a.pestana ?? 'actual'}`],
    ['clic', 'Hace clic en un elemento por su número de navegador_leer y devuelve una COMPROBACIÓN de qué cambió en la página. Si dice que no cambió nada, el clic NO funcionó. Los clics delicados (enviar, comprar, borrar…) piden permiso.', {
      ref: { type: 'number' }, pestana: { type: 'number' } }, ['ref'], a => `[${a.ref}]`],
    ['escribir', 'Escribe en un campo por su número de navegador_leer (nunca en contraseñas). enviar=true pulsa Enter / envía el formulario.', {
      ref: { type: 'number' }, texto: { type: 'string' }, enviar: { type: 'boolean' }, borrar: { type: 'boolean', description: 'false = añade al texto que ya hay' }, pestana: { type: 'number' } },
      ['ref', 'texto'], a => `[${a.ref}] "${String(a.texto || '').slice(0, 60)}"${a.enviar ? ' + Enter' : ''}`],
    ['scroll', 'Desplaza la página: cantidad en pantallas (positivo = abajo, negativo = arriba).', {
      cantidad: { type: 'number' }, pestana: { type: 'number' } }, ['cantidad'], a => `${a.cantidad}`],
    ['esperar', 'Espera unos segundos (1-60) y vuelve a leer la pestaña. Úsalo cuando la página está cargando o generando algo (p. ej. "Creando tu imagen"): NO des el resultado por hecho hasta verlo.', {
      segundos: { type: 'number' }, pestana: { type: 'number' } }, ['segundos'], a => `${a.segundos} s`],
    ['descargar', 'Descarga a la PC del usuario (carpeta Descargas) una imagen de la página, por su número imgN de navegador_leer. Devuelve la ruta.', {
      imagen: { type: 'string', description: 'img1, img2…' }, nombre: { type: 'string', description: 'nombre del archivo sin extensión (opcional)' }, pestana: { type: 'number' } },
      ['imagen'], a => `${a.imagen}${a.nombre ? ' → ' + a.nombre : ''}`],
    ['subir', 'Sube un archivo de la PC a la web: ref = el campo de subida (campo-file), el botón "Subir" o la zona de "arrastrar aquí" de navegador_leer. ' +
      'NO hagas antes clic en botones de subir (abren la ventana de archivos de Windows, que no puedes usar): llama directamente a navegador_subir. Siempre pide permiso.', {
      ruta: { type: 'string' }, ref: { type: 'number' }, pestana: { type: 'number' } }, ['ruta', 'ref'], a => `${a.ruta} → [${a.ref}]`],
    ['volver', 'Vuelve a la página anterior (botón Atrás) en la pestaña.', { pestana: { type: 'number' } }, [], () => 'atrás'],
  ].map(([op, descripcion, properties, required, resumen]) => ({
    nombre: `navegador_${op}`, riesgo: 'lectura',          // el permiso se pide por sitio dentro de core/navegador.js
    descripcion: `${descripcion} Funciona con la extensión del robot instalada en Chrome/Edge.`,
    parametros: { type: 'object', properties, required },
    resumen,
    ejecutar: (a, ctx) => (ctx.navegador ? ctx.navegador.accion(ctx.sesion, op, a) : 'error: el navegador no está disponible aquí'),
  })),
  {
    nombre: 'delegar', riesgo: 'lectura',            // lo que haga el subagente pasa por permisos igual que lo tuyo
    descripcion: 'Encarga una subtarea a un SUBAGENTE independiente (contexto limpio, mismas herramientas y permisos) y devuelve su informe final. ' +
      'Si llamas a "delegar" varias veces en la MISMA respuesta, los subagentes trabajan EN PARALELO. Úsalo para trabajo largo o separable ' +
      '(investigar varias cosas a la vez, revisar varias carpetas, comparar opciones…), no para cosas triviales que haces tú en un paso. ' +
      'El subagente no ve esta conversación: la tarea debe llevar todo el contexto necesario.',
    parametros: {
      type: 'object',
      properties: {
        tarea: { type: 'string', description: 'qué tiene que hacer y qué debe devolver, con todo el contexto' },
        nombre: { type: 'string', description: 'nombre corto para verlo en el panel, ej. "revisar logs"' },
        modelo: { type: 'string', description: 'opcional: alias o proveedor/modelo; por defecto el tuyo' },
        agente: { type: 'string', description: 'opcional: nombre de un agente guardado (ver "AGENTES GUARDADOS" en tus instrucciones); aporta sus instrucciones y su modelo' },
      },
      required: ['tarea', 'nombre'],
    },
    resumen: a => `${a.nombre || 'subagente'}${a.modelo ? ` (${a.modelo})` : ''}: ${String(a.tarea || '').slice(0, 120)}`,
    ejecutar: async (a, ctx) => {
      if (!ctx.subagentes) return 'error: los subagentes no están disponibles aquí';
      let tarea = a.tarea, modelo = a.modelo;
      if (a.agente) {                                       // plantilla importada (OpenClaw…): sus instrucciones van delante de la tarea
        const p = require('./importador').leerAgentes(ctx.cfg).find(x => x.nombre.toLowerCase() === String(a.agente).toLowerCase());
        if (!p) return `error: no hay ningún agente guardado llamado "${a.agente}"`;
        tarea = `INSTRUCCIONES DEL AGENTE "${p.nombre}":\n${p.instrucciones}\n\n${a.tarea}`;
        modelo = modelo || p.modelo;
      }
      const r = await ctx.subagentes.lanzar({ padre: ctx.sesion, tarea, nombre: a.nombre || a.agente, modelo, signal: ctx.signal });
      return r.ok ? `[subagente "${r.nombre}" terminó]\n${r.texto || '(sin informe)'}` : `error: subagente "${r.nombre}": ${r.texto}`;
    },
  },
];

const porNombre = Object.fromEntries(HERRAMIENTAS.map(h => [h.nombre, h]));
module.exports = { HERRAMIENTAS, porNombre };
