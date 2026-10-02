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
  // ---------- skills (core/skills): instrucciones especializadas instaladas por el usuario ----------
  {
    nombre: 'usar_skill', riesgo: 'lectura',
    descripcion: 'Carga las instrucciones completas (SKILL.md) de una skill de "SKILLS DISPONIBLES". Úsala ANTES de hacer una tarea que encaje con una skill, y sigue sus pasos.',
    parametros: { type: 'object', properties: { nombre: { type: 'string', description: 'nombre (slug) de la skill' } }, required: ['nombre'] },
    resumen: a => a.nombre,
    ejecutar: async (a, ctx) => {
      if (!ctx.skills) return 'error: las skills no están disponibles aquí';
      const s = ctx.skills.activa(a.nombre), c = ctx.skills.almacen.contenido(s.slug);
      ctx.skills.almacen.contarUso(s.slug);
      const extra = [c.referencias.length ? `Referencias (leer_recurso_skill): ${c.referencias.join(', ')}` : '', c.scripts.length ? `Scripts (ejecutar_script_skill): ${c.scripts.join(', ')}` : '',
        c.recursos.length ? `Recursos: ${c.recursos.slice(0, 40).join(', ')}` : ''].filter(Boolean).join('\n');
      return recortar(`SKILL "${s.slug}" (carpeta ${s.dir})\n${extra ? extra + '\n' : ''}\n${c.cuerpo.trim()}`);
    },
  },
  {
    nombre: 'leer_recurso_skill', riesgo: 'lectura',
    descripcion: 'Lee un archivo de una skill activa (references/…, assets/…, scripts/… o cualquier ruta relativa a su carpeta).',
    parametros: { type: 'object', properties: { nombre: { type: 'string' }, ruta: { type: 'string', description: 'ruta relativa dentro de la skill, p. ej. references/api.md' } }, required: ['nombre', 'ruta'] },
    resumen: a => `${a.nombre}: ${a.ruta}`,
    ejecutar: async (a, ctx) => {
      if (!ctx.skills) return 'error: las skills no están disponibles aquí';
      const s = ctx.skills.activa(a.nombre), f = ctx.skills.rutaDentro(s, a.ruta);
      if (!fs.existsSync(f)) return `error: no existe ${a.ruta} en la skill ${s.slug}`;
      if (fs.statSync(f).isDirectory()) return fs.readdirSync(f).join('\n') || '(vacía)';
      const b = fs.readFileSync(f);
      if (b.subarray(0, 8000).includes(0)) return `[archivo binario de ${b.length} bytes: ${f}]`;
      return recortar(b.toString('utf8'));
    },
  },
  {
    nombre: 'ejecutar_script_skill', riesgo: 'ejecucion',
    siemprePreguntar: (a, ctx) => ctx?.skills?.motivoPreguntar(a.nombre) || '',
    clavePermiso: a => `skill:${a.nombre}/${String(a.script || '').replace(/\\/g, '/')}`,
    descripcion: 'Ejecuta un script de una skill activa (python .py, node .js/.mjs, PowerShell .ps1, bash .sh) con la carpeta de la skill como directorio de trabajo. ' +
      'args = lista de argumentos (usa rutas absolutas para archivos del usuario). Pide permiso.',
    parametros: {
      type: 'object',
      properties: { nombre: { type: 'string' }, script: { type: 'string', description: 'ruta relativa, p. ej. scripts/convertir.py' }, args: { type: 'array', items: { type: 'string' } }, timeoutSeg: { type: 'number' } },
      required: ['nombre', 'script'],
    },
    resumen: a => `${a.nombre}: ${a.script} ${(Array.isArray(a.args) ? a.args : []).join(' ')}`.trim(),
    ejecutar: (a, ctx) => new Promise(ok => {
      if (!ctx.skills) return ok('error: las skills no están disponibles aquí');
      let s, f;
      try {
        s = ctx.skills.activa(a.nombre); f = ctx.skills.rutaDentro(s, a.script);
        if (!fs.existsSync(f) && !/[\\/]/.test(a.script)) f = ctx.skills.rutaDentro(s, `scripts/${a.script}`);
        if (!fs.existsSync(f)) return ok(`error: no existe ${a.script} en la skill ${s.slug}`);
      } catch (e) { return ok(`error: ${e.message}`); }
      const ext = path.extname(f).toLowerCase(), args = (Array.isArray(a.args) ? a.args : a.args ? [a.args] : []).map(String);
      const win = process.platform === 'win32';
      const cmd = { '.py': [win ? 'python' : 'python3', [f, ...args]], '.js': [process.execPath, [f, ...args]], '.mjs': [process.execPath, [f, ...args]], '.cjs': [process.execPath, [f, ...args]],
        '.ps1': [win ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f, ...args]], '.sh': ['bash', [f, ...args]] }[ext];
      if (!cmd) return ok(`error: tipo de script no soportado (${ext || 'sin extensión'})`);
      const p = spawn(cmd[0], cmd[1], { cwd: s.dir, windowsHide: true,               // ELECTRON_RUN_AS_NODE: dentro de la app, execPath es Electron
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8', SKILL_DIR: s.dir, APOLO_CWD: ctx.cwd || '' } });
      let out = '';
      p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
      const t = setTimeout(() => { p.kill(); out += '\n[cancelado por tiempo]'; }, Math.min(a.timeoutSeg || 120, 600) * 1000);
      ctx.signal?.addEventListener('abort', () => p.kill(), { once: true });
      p.on('close', code => { clearTimeout(t); ok(recortar(`${out.trim()}\n[código de salida ${code}]`)); });
      p.on('error', e => { clearTimeout(t); ok(`error: ${e.message}`); });
    }),
  },
  {
    nombre: 'instalar_skill', riesgo: 'escritura',
    descripcion: 'Instala una skill desde una carpeta, un .zip/.skill, una URL o GitHub ("owner/repo/ruta" o la URL de github.com). ' +
      'Queda DESACTIVADA y se escanea: informa al usuario del resultado del escaneo; él la activa. Si la fuente trae varias, devuelve la lista para elegir.',
    parametros: { type: 'object', properties: { fuente: { type: 'string' } }, required: ['fuente'] },
    resumen: a => a.fuente,
    ejecutar: async (a, ctx) => {
      if (!ctx.skills) return 'error: las skills no están disponibles aquí';
      const r = await ctx.skills.instalar(a.fuente);
      if (r.opciones) return `La fuente trae ${r.opciones.length} skills; vuelve a llamar con la fuente de la que quieras:\n` + r.opciones.map(o => `- ${o.fuente} — ${o.descripcion.slice(0, 120)}`).join('\n');
      const s = r.skill, e = s.escaneo || {};
      return `Skill "${s.slug}" instalada y DESACTIVADA. Escaneo: ${e.nivel || '?'}${e.resumen ? ' — ' + e.resumen : ''}${e.explicacion ? '\n' + e.explicacion : ''}\n` +
        `${(e.hallazgos || []).slice(0, 8).map(h => `· [${h.gravedad}] ${h.archivo}:${h.linea} ${h.regla}`).join('\n')}\nEl usuario puede activarla en el panel (Skills) o con /skill on ${s.slug}.`;
    },
  },
  {
    nombre: 'ver_skills', riesgo: 'lectura',
    descripcion: 'Lista las skills instaladas (activas y desactivadas) con su descripción y el resultado del escaneo.',
    parametros: { type: 'object', properties: {} },
    resumen: () => '',
    ejecutar: async (a, ctx) => (ctx.skills ? ctx.skills.lista().map(s => `${s.activa ? '●' : '○'} ${s.slug}${s.externa ? ' [externa]' : ''} · escaneo ${s.escaneo?.nivel || 'pendiente'} · ${s.usos} usos · ${s.descripcion.slice(0, 160)}`).join('\n') || '(no hay skills instaladas)' : 'error: las skills no están disponibles aquí'),
  },
  // ---------- taller de skills (core/skills/taller.js) ----------
  {
    nombre: 'crear_skill', riesgo: 'escritura',
    descripcion: 'Convierte lo que habéis hecho en esta conversación en una skill reutilizable (borrador DESACTIVADO que el usuario revisa y activa). ' +
      'Redacta tú las instrucciones a partir de los pasos que FUNCIONARON: cuándo usarla, pasos concretos, comprobaciones y errores a evitar. Úsala cuando el usuario lo pida ("crea/guarda una skill con esto", "enséñate a hacer X").',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'nombre corto en minúsculas con guiones, ej. "renombrar-fotos"' },
        descripcion: { type: 'string', description: 'qué hace y CUÁNDO usarla (1-2 frases; es lo que decide si se elige)' },
        instrucciones: { type: 'string', description: 'cuerpo del SKILL.md en Markdown: pasos numerados, comandos/herramientas usados, comprobaciones' },
        scripts: { type: 'array', description: 'opcional: archivos de apoyo', items: { type: 'object', properties: { ruta: { type: 'string', description: 'ej. scripts/limpiar.py o references/notas.md' }, contenido: { type: 'string' } }, required: ['ruta', 'contenido'] } },
        disparadores: { type: 'array', items: { type: 'string' }, description: 'opcional: palabras o /regex/ que la activan' },
        pruebas: { type: 'array', description: 'opcional: casos de prueba para evals', items: { type: 'object', properties: { pregunta: { type: 'string' }, debeContener: { type: 'array', items: { type: 'string' } }, criterio: { type: 'string' } }, required: ['pregunta'] } },
      },
      required: ['nombre', 'descripcion', 'instrucciones'],
    },
    resumen: a => `${a.nombre}: ${String(a.descripcion || '').slice(0, 120)}${a.scripts?.length ? ` (+${a.scripts.length} archivos)` : ''}`,
    ejecutar: async (a, ctx) => {
      if (!ctx.skills?.taller) return 'error: el taller de skills no está disponible aquí';
      const s = await ctx.skills.taller.crear({ ...a, sesion: ctx.sesion?.id }), e = s.escaneo || {};
      return `Skill "${s.slug}" creada como BORRADOR (desactivada) en ${s.dir}. Escaneo: ${e.nivel || 'pendiente'} — ${e.resumen || ''}\n` +
        `${(e.hallazgos || []).slice(0, 6).map(h => `· [${h.gravedad}] ${h.archivo}:${h.linea} ${h.regla}`).join('\n')}\nEl usuario puede revisarla y activarla en el panel (Skills) o con /skill on ${s.slug}.`;
    },
  },
  {
    nombre: 'mejorar_skill', riesgo: 'escritura',
    descripcion: 'Propone una versión mejorada del SKILL.md de una skill a partir de los fallos registrados al usarla (devuelve el diff). Con aplicar=true la aplica (guarda la versión anterior y la re-escanea); aplica solo si el usuario lo aprueba.',
    parametros: { type: 'object', properties: { nombre: { type: 'string' }, aplicar: { type: 'boolean', description: 'true = aplicar la propuesta (solo con permiso del usuario)' } }, required: ['nombre'] },
    resumen: a => `${a.nombre}${a.aplicar ? ' (aplicar)' : ' (propuesta)'}`,
    ejecutar: async (a, ctx) => {
      if (!ctx.skills?.taller) return 'error: el taller de skills no está disponible aquí';
      const r = await ctx.skills.taller.mejorar(String(a.nombre || ''), { aplicar: !!a.aplicar, signal: ctx.signal });
      if (!r.propuesta) return r.motivo || 'sin propuesta';
      if (!r.diff) return 'La propuesta es idéntica a la versión actual: nada que cambiar.';
      return `${r.aplicado ? `APLICADA (versión anterior guardada: ${r.versionAnterior}; escaneo ${r.escaneo?.nivel})` : 'PROPUESTA (sin aplicar)'} para "${r.slug}":\n` +
        `${r.cambios.map(c => `- ${c}`).join('\n')}\n\nDiff:\n${recortar(r.diff).slice(0, 8000)}`;
    },
  },
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
// herramientas de fuera del núcleo (conectores de la app: correo, GitHub…). h.disponible() = si se ofrecen al modelo ahora
function registrar(lista) {
  for (const h of lista) {
    const i = HERRAMIENTAS.findIndex(x => x.nombre === h.nombre);
    if (i >= 0) HERRAMIENTAS[i] = h; else HERRAMIENTAS.push(h);
    porNombre[h.nombre] = h;
  }
}
module.exports = { HERRAMIENTAS, porNombre, registrar };
