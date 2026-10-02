// Robot Companion · i18n propio, sin librerías. Lo usan el panel (script clásico), la isla (app/index.html) y main.js (require).
// La CLAVE es el texto en español tal cual (estilo gettext): si falta una traducción se ve el español, nunca una clave rota.
//   tr('Guardar') · tr('{n} en total', { n: 5 }) · plural: tr('{n} permiso|{n} permisos', { n }) (con vars.n: 1 → la primera forma)
// Para añadir un idioma: I18N_IDIOMAS.fr = 'Français' y I18N_DIC.fr = { 'Guardar': 'Enregistrer', … } (las que falten salen en español).
// OJO: en el panel todo lo global va prefijado I18N_ (scope compartido entre scripts); tr/t son las únicas funciones cortas.
(function (raiz) {
  'use strict';
  const I18N_IDIOMAS = { es: 'Español', en: 'English' };
  const I18N_DIC = { es: {}, en: {} };          // es = el propio texto de la clave; en: más abajo (I18N_EN)
  let idioma = 'es';
  const faltan = new Set();                      // claves sin traducir vistas en esta sesión (para pruebas: I18N.faltan())

  // 'es-MX' → 'es'; cualquier otro idioma que no tengamos → inglés
  function normal(l) { l = String(l || '').toLowerCase().slice(0, 2); return I18N_DIC[l] ? l : 'en'; }
  function tr(clave, vars) {
    let s = clave;
    if (idioma !== 'es') {
      const x = I18N_DIC[idioma] && I18N_DIC[idioma][clave];
      if (typeof x === 'string') s = x; else if (clave) faltan.add(clave);
    }
    s = String(s ?? '');
    if (vars) {
      if (vars.n !== undefined && s.includes('|')) { const p = s.split('|'); s = +vars.n === 1 ? p[0] : p[1]; }
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    }
    return s;
  }
  function poner(l) {
    idioma = normal(l);
    if (typeof document !== 'undefined') document.documentElement.lang = idioma;
    return idioma;
  }
  // idioma del sistema (navegador / Electron)
  const delSistema = () => normal(typeof navigator !== 'undefined' ? navigator.language : 'es');
  const I18N = {
    tr, poner, normal, delSistema, idiomas: I18N_IDIOMAS, dic: I18N_DIC,
    idioma: () => idioma,
    locale: () => (idioma === 'es' ? 'es' : idioma === 'en' ? 'en-US' : idioma),
    faltan: () => [...faltan],
    // traduce los textos fijos del HTML: [data-i18n] (texto) y [data-i18n-attr="title,placeholder,aria-label"]
    estaticos(raizDom) {
      for (const el of (raizDom || document).querySelectorAll('[data-i18n]')) {
        if (el.dataset.i18nEs === undefined) el.dataset.i18nEs = el.textContent;
        el.textContent = tr(el.dataset.i18nEs);
      }
      for (const el of (raizDom || document).querySelectorAll('[data-i18n-attr]')) {
        for (const a of el.dataset.i18nAttr.split(',')) {
          const k = 'i18nEs' + a.replace(/(^|-)(\w)/g, (m, g, c) => c.toUpperCase());
          if (el.dataset[k] === undefined) el.dataset[k] = el.getAttribute(a) || '';
          el.setAttribute(a, tr(el.dataset[k]));
        }
      }
    },
  };

  // ---------- diccionario inglés ----------
  const I18N_EN = {
    // ===== panel · Dispositivos (core/ui/dispositivos.js, ojo de escritorio ESP32) =====
    'Dispositivos': 'Devices', 'El cuerpo físico del robot: el ojo de escritorio (ESP32 + pantalla redonda) y, más adelante, la Pi o el humanoide.': "The robot's physical body: the desk eye (ESP32 + round screen) and, later, the Pi or the humanoid.",
    'Aceptar dispositivos de la red': 'Accept devices from the network', 'Escuchando en el puerto {p} solo para la red local. Cada dispositivo necesita emparejarse una vez.': 'Listening on port {p} for the local network only. Each device must be paired once.',
    'Apagado: no se abre ningún puerto. Actívalo para conectar el ojo de escritorio.': 'Off: no port is opened. Turn it on to connect the desk eye.', 'Activar': 'Turn on', 'Desactivar': 'Turn off',
    'Emparejar': 'Pair', 'Código de la pantalla': 'Code on the screen', '{n} dispositivo(s) esperando: {x}': '{n} device(s) waiting: {x}',
    'Enciende el ojo: te enseña un código de 6 dígitos. Escríbelo aquí.': 'Turn on the eye: it shows a 6-digit code. Type it here.', 'Emparejados': 'Paired', 'conectado': 'connected', 'desconectado': 'disconnected',
    'Saludar': 'Say hi', 'Olvidar': 'Forget', 'Olvidar dispositivo': 'Forget device', 'Tendrá que emparejarse otra vez con un código nuevo.': 'It will have to pair again with a new code.',
    'Ninguno todavía. Sin hardware puedes probar con el simulador: tools/simulador-ojo.html': 'None yet. Without hardware you can try the simulator: tools/simulador-ojo.html',
    'Botón del ojo: corta = Permitir · mantener = Denegar (o hablar si no hay permiso) · doble = pánico. Los permisos peligrosos solo se aprueban en el PC.': "Eye button: short = Allow · hold = Deny (or talk if there's no permission) · double = panic. Dangerous permissions can only be approved on the PC.",
    'Son 6 dígitos': "It's 6 digits", '✓ {x} emparejado': '✓ {x} paired', 'pantalla': 'screen', 'boton': 'button', 'micro': 'mic', 'altavoz': 'speaker', 'camara': 'camera',
    // ===== panel · base (componentes, barra lateral, permisos, paleta, login) =====
    'unos segundos': 'a few seconds', 'en {x}': 'in {x}', 'hace {x}': '{x} ago', 'ahora': 'now', 'token no válido': 'invalid token',
    'Cerrar': 'Close', 'Cancelar': 'Cancel', 'Sí, hacerlo': 'Yes, do it', 'Aceptar': 'OK', 'código': 'code', 'Copiar': 'Copy', 'Copiado': 'Copied', 'No pude copiar': "Couldn't copy",
    'Casco': 'Helmet', 'Ámbar': 'Amber', 'Hielo': 'Ice', 'Magma': 'Magma', 'Violeta': 'Violet', 'Neón': 'Neon', 'Terminal': 'Terminal',
    'Leer archivo': 'Read file', 'Listar carpeta': 'List folder', 'Escribir archivo': 'Write file', 'Editar archivo': 'Edit file', 'Web': 'Web', 'Programar tarea': 'Schedule task',
    'Ver tareas': 'View tasks', 'Borrar tarea': 'Delete task', 'Recordar': 'Remember', 'Buscar en memoria': 'Search memory', 'Olvidar': 'Forget', 'Buscar historial': 'Search history', 'Subagente': 'Subagent',
    '> robot listo': '> robot ready', 'núcleo conectado…': 'core connected…', 'Peligro: {x}': 'Danger: {x}', 'Permiso · {x}': 'Permission · {x}', 'Permitir': 'Allow', 'Siempre': 'Always', 'Denegar': 'Deny',
    'Acción peligrosa': 'Dangerous action', '{n} permiso esperando|{n} permisos esperando': '{n} permission waiting|{n} permissions waiting',
    'Trabajando en {n} sesión|Trabajando en {n} sesiones': 'Working on {n} session|Working on {n} sessions', 'En reposo': 'Idle', 'permiso': 'permission',
    '⏰ TAREA': '⏰ TASK', '{m} pensando…': '{m} thinking…', '✓ respuesta lista': '✓ reply ready', '✓ LISTO': '✓ DONE', '✗ ERROR': '✗ ERROR',
    'Inicio': 'Home', 'Chat': 'Chat', 'Mission Control': 'Mission Control', 'Automatizaciones': 'Automations', 'Skills': 'Skills', 'Memoria': 'Memory', 'Uso': 'Usage',
    'Hoy': 'Today', 'Ayer': 'Yesterday', 'Esta semana': 'This week', 'Este mes': 'This month', 'Anteriores': 'Older',
    'Nada coincide.': 'Nothing matches.', 'Aún no hay conversaciones.': 'No conversations yet.', 'Volver': 'Back', 'Configuración': 'Settings', 'Buscar en la configuración…': 'Search settings…', 'núcleo': 'core',
    'Buscar (Ctrl+K)': 'Search (Ctrl+K)', 'Nueva conversación': 'New conversation', 'Conversaciones': 'Conversations', 'Filtrar': 'Filter', 'Filtrar conversaciones…': 'Filter conversations…', 'Tócame': 'Touch me',
    'Modelo por defecto (cámbialo en Configuración → Modelos)': 'Default model (change it in Settings → Models)', 'por defecto:': 'default:', 'Ir a': 'Go to', 'Acción': 'Action', 'Asistente de bienvenida': 'Welcome assistant',
    'Busca páginas, ajustes o conversaciones…': 'Search pages, settings or conversations…', 'Sin resultados': 'No results',
    'Pega el token del núcleo. Está en el archivo <code>token</code> de la carpeta de datos, o ábrelo desde el robot: bandeja → <b>Abrir panel de control</b>.': 'Paste the core token. It is in the <code>token</code> file in the data folder, or open the panel from the robot: tray → <b>Open control panel</b>.',
    'Entrar': 'Sign in',
    // ===== panel · inicio =====
    'Buenas noches': 'Good evening', 'Buenos días': 'Good morning', 'Buenas tardes': 'Good afternoon',
    'Tienes <b class="aviso-txt">{n} permiso</b> esperando.|Tienes <b class="aviso-txt">{n} permisos</b> esperando.': 'You have <b class="aviso-txt">{n} permission</b> waiting.|You have <b class="aviso-txt">{n} permissions</b> waiting.',
    'Estoy trabajando en {n} conversación.|Estoy trabajando en {n} conversaciones.': "I'm working on {n} conversation.|I'm working on {n} conversations.", 'Todo en calma. ¿Qué hacemos?': 'All quiet. What shall we do?',
    'Modelo por defecto': 'Default model', 'Conversaciones hoy': 'Conversations today', '{n} en total': '{n} in total', 'Tokens hoy': 'Tokens today', '{n} en 14 días': '{n} in 14 days',
    '{n} pausadas o hechas': '{n} paused or done', 'Recuerdos': 'Memories', '{n} de perfil': '{n} profile', 'Equipo': 'Computer', 'Canales': 'Channels', 'Ver': 'View', 'Próximas automatizaciones': 'Upcoming automations',
    'Todas': 'All', 'Nada programado. Pídele al robot “recuérdame…”.': 'Nothing scheduled. Ask the robot “remind me…”.', 'Uso · 14 días': 'Usage · 14 days', 'Detalle': 'Details', 'hoy': 'today',
    'Conversaciones recientes': 'Recent conversations', 'Actividad en vivo': 'Live activity', 'Registros': 'Logs', '{n} núcleos': '{n} cores', '{a} de {b}': '{a} of {b}', 'Disco {x}': 'Disk {x}',
    '{a} libres de {b}': '{a} free of {b}', 'Encendido {a} · núcleo {b}': 'Up {a} · core {b}', 'Sin actividad todavía.': 'No activity yet.',
    // ===== panel · chat =====
    'Esa conversación ya no existe': 'That conversation no longer exists', 'Renombrar': 'Rename', 'Borrar': 'Delete', 'Detalles': 'Details',
    'Escribe un mensaje…  (Enter envía · Shift+Enter nueva línea)': 'Type a message…  (Enter sends · Shift+Enter new line)', 'Carpeta de trabajo': 'Working folder', 'carpeta por defecto': 'default folder',
    'Enviar': 'Send', 'Renombrar conversación': 'Rename conversation', 'Guardar': 'Save', 'Borrar conversación': 'Delete conversation', '“{x}” se borrará para siempre.': '“{x}” will be deleted forever.',
    'Detener': 'Stop', '¿En qué te ayudo?': 'How can I help?', 'Hablas con <b>{m}</b>. Todos los modelos comparten memoria, herramientas y permisos.': "You're talking to <b>{m}</b>. All models share memory, tools and permissions.",
    'Revisa qué hay en mi carpeta de descargas y dime qué puedo borrar': "Check my downloads folder and tell me what I can delete", 'Recuérdame mañana a las 9 revisar los pedidos del taller': 'Remind me tomorrow at 9 to check the shop orders',
    '¿Qué sabes de mí?': 'What do you know about me?', 'Cada 30 min comprueba si 10.0.0.5 responde y avísame solo si falla': 'Every 30 min check whether 10.0.0.5 responds and only tell me if it fails',
    'Conversación resumida': 'Conversation summarized', '{n} recuerdo a la memoria|{n} recuerdos a la memoria': '{n} memory saved|{n} memories saved', 'conversación': 'conversation', 'pensando…': 'thinking…',
    'proveedor/modelo  (Enter)': 'provider/model  (Enter)', 'Atajos': 'Shortcuts', 'Recientes': 'Recent', 'Proveedores': 'Providers', 'ver modelos ›': 'see models ›', '{n} modelos': '{n} models', 'Ahora con {m}': 'Now using {m}',
    'Ruta donde el asistente lee, escribe y ejecuta': 'Path where the assistant reads, writes and runs things', 'Usar': 'Use', 'Conversación': 'Conversation', 'Modelo': 'Model', 'Canal': 'Channel', 'Creada': 'Created',
    'Mensajes': 'Messages', 'Carpeta': 'Folder', 'Entrada': 'Input', 'Salida': 'Output', 'Herramientas usadas': 'Tools used', 'Ninguna': 'None', 'Contexto': 'Context', 'Resúmenes': 'Summaries',
    'Resume lo antiguo (el modelo deja de verlo, solo su resumen) y guarda lo duradero en la memoria': 'Summarizes the old part (the model only sees the summary) and saves what lasts to memory',
    'Resumir ahora': 'Summarize now', 'Sesión': 'Session', 'Espera a que termine de trabajar': 'Wait until it finishes working', 'Resumiendo…': 'Summarizing…', 'Resumida: {a} → {b} tokens': 'Summarized: {a} → {b} tokens', '{n} a la memoria': '{n} to memory',
    // ===== panel · automatizaciones =====
    'Una vez': 'Once', 'Cada {n} min': 'Every {n} min', 'Recordatorios y trabajos que el robot hace solo. También se crean hablando: “cada lunes a las 8 revisa…”.': 'Reminders and jobs the robot does on its own. You can also create them by talking: “every Monday at 8 check…”.',
    'Nueva automatización': 'New automation', 'Activas': 'Active', 'Pausadas': 'Paused', 'Historial de ejecuciones': 'Run history', 'Automatización': 'Automation', 'Cuándo': 'When', 'Resultado': 'Result',
    'Todavía no se ha ejecutado ninguna.': 'None has run yet.', 'Nombre': 'Name', 'Programación': 'Schedule', 'Próxima': 'Next', 'Última': 'Last', 'Activa': 'Active', 'recordatorio': 'reminder', 'agente': 'agent', 'vigilancia': 'watch',
    'nunca': 'never', 'Ejecutar ahora': 'Run now', 'No hay automatizaciones aquí.': 'No automations here.', 'Activada': 'Enabled', 'Pausada': 'Paused', 'Ejecutando ahora…': 'Running now…', 'Borrar automatización': 'Delete automation',
    'No se podrá recuperar.': "It can't be recovered.", 'Tipo': 'Type', 'Recordatorio': 'Reminder', 'Agente (hace el trabajo)': 'Agent (does the work)', 'Revisar la Pi': 'Check the Pi', 'Mensaje del recordatorio': 'Reminder message',
    'Llamar al proveedor de frenos': 'Call the brake supplier', 'Repetir': 'Repeat', 'Cada N minutos': 'Every N minutes', 'Fecha y hora': 'Date and time', 'Expresión cron (minuto hora día mes díaSemana)': 'Cron expression (minute hour day month weekday)',
    'Ej: <code>0 8 * * 1-5</code> = laborables a las 8:00 · <code>*/30 * * * *</code> = cada 30 min': 'E.g. <code>0 8 * * 1-5</code> = weekdays at 8:00 · <code>*/30 * * * *</code> = every 30 min',
    'Minutos': 'Minutes', 'Solo avisar si hay algo': 'Only notify if there is something', 'Modo vigilancia: si no encuentra nada importante, no te molesta.': "Watch mode: if it finds nothing important, it won't bother you.",
    'Avisarme en': 'Notify me on', 'Isla': 'Island', 'Discord': 'Discord', 'Crear': 'Create', 'Escribe el texto': 'Write the text', 'Instrucción para el agente': 'Instruction for the agent', 'Automatización creada': 'Automation created',
    // ===== panel · memoria =====
    'Perfil': 'Profile', 'Preferencias': 'Preferences', 'Proyectos': 'Projects', 'Personas': 'People', 'Hechos': 'Facts',
    'perfil': 'profile', 'preferencia': 'preference', 'proyecto': 'project', 'persona': 'person', 'hecho': 'fact',
    'Lo que el robot sabe de ti. La comparten todos los modelos y canales. El <b>perfil</b> va siempre en el contexto; el resto entra solo cuando viene a cuento.': 'What the robot knows about you. Shared by every model and channel. The <b>profile</b> is always in context; the rest only comes in when relevant.',
    'Añadir recuerdo': 'Add memory', 'Todos': 'All', 'Buscar en la memoria…': 'Search memory…', 'guardado por {x}': 'saved by {x}', 'usado {n} vez|usado {n} veces': 'used {n} time|used {n} times', 'Editar': 'Edit',
    'Nada coincide con la búsqueda.': 'Nothing matches the search.', 'Aún vacía. Cuéntale cosas al robot y se irá llenando sola.': 'Still empty. Tell the robot things and it will fill up on its own.', 'Olvidar recuerdo': 'Forget memory', 'Olvidado': 'Forgotten',
    'Editar recuerdo': 'Edit memory', 'Nuevo recuerdo': 'New memory', 'Recuerdo': 'Memory', 'Prefiere respuestas cortas y en español': 'Prefers short answers in English', 'No guardes contraseñas ni claves: se rechazan.': "Don't save passwords or keys: they are rejected.",
    'Recuerdo {x}': 'Memory {x}', 'creado': 'created', 'actualizado': 'updated', 'reemplazado': 'replaced', 'duplicado': 'duplicate',
    // ===== panel · uso =====
    'Tokens del núcleo en todas las conversaciones y automatizaciones. El uso de Claude Code va aparte, en la isla.': 'Core tokens across all conversations and automations. Claude Code usage is separate, in the island.',
    '7 días': '7 days', '30 días': '30 days', '90 días': '90 days', '{n} días': '{n} days', 'Tokens por día': 'Tokens per day', 'Actividad · 26 semanas': 'Activity · 26 weeks', 'Menos': 'Less', 'Más': 'More',
    'Por modelo': 'By model', 'Proporción': 'Share', 'Sin uso en este periodo.': 'No usage in this period.',
    // ===== panel · mission control =====
    'Trabajando': 'Working', 'Listo': 'Done', 'Error': 'Error', 'Cancelado': 'Cancelled', 'En espera': 'Waiting', 'Quién está haciendo qué ahora mismo: conversaciones, tareas y los subagentes que lanzan. En vivo.': "Who's doing what right now: conversations, tasks and the subagents they launch. Live.",
    'Agentes': 'Agents', 'Detenido': 'Stopped', 'agentes principales': 'main agents', 'Subagentes': 'Subagents', 'activos ahora': 'active now', 'Esperando permiso': 'Waiting for permission', 'te necesitan': 'need you', 'nadie': 'nobody',
    'Terminados': 'Finished', 'últimas 6 h': 'last 6 h', 'Nadie trabajando ahora. Cuando un modelo use "delegar", sus subagentes aparecen aquí, cada uno con lo que está haciendo.': 'Nobody working now. When a model uses "delegate", its subagents show up here, each with what it is doing.',
    'Esperando tu decisión': 'Waiting for your decision', 'subagente': 'subagent', '{n} paso|{n} pasos': '{n} step|{n} steps', 'resumida': 'summarized', 'Abrir': 'Open',
    // ===== panel · skills =====
    'Limpia': 'Clean', 'Sin riesgos detectados': 'No risks found', 'El escáner no encontró nada sospechoso. Se puede usar con normalidad.': 'The scanner found nothing suspicious. It can be used normally.',
    'Revisar': 'Review', 'Revisar antes de usar': 'Review before using', 'Hay cosas que conviene mirar, pero nada claramente malicioso.': "There are things worth a look, but nothing clearly malicious.",
    'Cuarentena': 'Quarantine', 'En cuarentena': 'Quarantined', 'El escáner encontró patrones peligrosos. Está bloqueada hasta que la actives a mano asumiendo el riesgo.': 'The scanner found dangerous patterns. It stays blocked until you enable it by hand and accept the risk.',
    'Sin escanear': 'Not scanned', 'Todavía no se ha escaneado. Pulsa «Re-escanear».': 'Not scanned yet. Press «Re-scan».', 'Importada OpenClaw': 'Imported OpenClaw', 'Instalada': 'Installed',
    'Archivo .zip / .skill': '.zip / .skill file', 'Repositorio de GitHub': 'GitHub repository', 'Carpeta local': 'Local folder', '/ruta': '/path', 'No reconozco el formato': "I don't recognize the format", 'Instalar skill': 'Install skill', 'Skill': 'Skill',
    'Oficios que APOLO sabe hacer. Instala desde GitHub, una carpeta o un .zip; cada skill pasa por el escáner antes de poder usarse.': 'Trades APOLO knows. Install from GitHub, a folder or a .zip; every skill goes through the scanner before it can be used.',
    'Recargar': 'Reload', 'Carpeta, URL, .zip o owner/repo/ruta de GitHub': 'Folder, URL, .zip or GitHub owner/repo/path', 'Arrastra aquí un .zip / .skill o una URL': 'Drop a .zip / .skill or a URL here', 'Explorar:': 'Browse:',
    'Ver las de anthropics': "See anthropics' skills", 'Externas': 'External', 'Buscar skills…': 'Search skills…', 'Lista actualizada': 'List updated', 'Solo .zip o .skill': 'Only .zip or .skill',
    'Pega la ruta completa de {f} (p. ej. {r})': 'Paste the full path of {f} (e.g. {r})', 'El navegador no da la ruta de «{f}». Pega su ruta completa en la barra y pulsa Instalar.': "The browser doesn't expose the path of «{f}». Paste its full path in the bar and press Install.",
    'Instaladas': 'Installed', '{a} propias · {b} externas': '{a} own · {b} external', 'todas propias': 'all own', '{n} % del total': '{n} % of total', 'bloqueadas por el escáner': 'blocked by the scanner', 'ninguna': 'none',
    'Usos esta semana': 'Uses this week', 'Usos': 'Uses', 'últimos 7 días': 'last 7 days', 'en total': 'in total', 'Aún no hay skills': 'No skills yet',
    'Una skill es una carpeta con un <code>SKILL.md</code> que enseña a APOLO un oficio: rellenar PDFs, revisar código, publicar en Discord… Instala una y el escáner la revisa antes de activarla.': 'A skill is a folder with a <code>SKILL.md</code> that teaches APOLO a trade: filling PDFs, reviewing code, posting on Discord… Install one and the scanner checks it before enabling it.',
    'Probar con anthropics/skills': 'Try anthropics/skills', 'Desde una carpeta': 'From a folder', 'Nada en cuarentena. El escáner no ha bloqueado ninguna skill.': "Nothing quarantined. The scanner hasn't blocked any skill.",
    'No hay skills externas (Claude Code, Codex u OpenClaw).': 'No external skills (Claude Code, Codex or OpenClaw).', 'Ninguna skill coincide con el filtro.': 'No skill matches the filter.', 'Desactivar': 'Disable', 'Activar': 'Enable',
    'Sin descripción.': 'No description.', '{n} usos': '{n} uses', 'último {x}': 'last {x}', 'Activar una skill en cuarentena': 'Enable a quarantined skill',
    '<b>{s}</b> tiene {n} hallazgo peligroso.|<b>{s}</b> tiene {n} hallazgos peligrosos.': '<b>{s}</b> has {n} dangerous finding.|<b>{s}</b> has {n} dangerous findings.', 'El escáner la marcó en rojo.': 'The scanner flagged it red.',
    'Si la activas, APOLO podrá ejecutar lo que contiene con tus permisos. Hazlo solo si has leído el código y confías en el autor.': 'If you enable it, APOLO will be able to run what it contains with your permissions. Only do it if you have read the code and trust the author.',
    'Activar igualmente': 'Enable anyway', 'activada': 'enabled', 'desactivada': 'disabled', 'Escribe una carpeta, URL, .zip o owner/repo de GitHub': 'Enter a folder, URL, .zip or GitHub owner/repo', 'Instalando y escaneando…': 'Installing and scanning…',
    'El núcleo no devolvió la skill': "The core didn't return the skill", '{s} instalada pero EN CUARENTENA: revisa el informe del escáner': '{s} installed but QUARANTINED: check the scanner report', '{s} instalada · escáner: {x}': '{s} installed · scanner: {x}',
    'Hay {n} skills en {f}': 'There are {n} skills in {f}', 'Elige cuál instalar. Cada una pasa por el escáner.': 'Pick which one to install. Each goes through the scanner.', 'Filtrar…': 'Filter…', 'Detalle de la skill': 'Skill details',
    'Escáner': 'Scanner', 'Archivos': 'Files', 'Permisos': 'Permissions', 'Cargando SKILL.md…': 'Loading SKILL.md…', 'Sin SKILL.md': 'No SKILL.md', 'SKILL.md vacío.': 'Empty SKILL.md.', 'Qué significa': 'What it means', 'Hallazgos': 'Findings',
    'regla': 'rule', 'Aún sin escanear.': 'Not scanned yet.', 'Ningún hallazgo. Limpia.': 'No findings. Clean.', '{n} hallazgo|{n} hallazgos': '{n} finding|{n} findings', 'Solo SKILL.md.': 'Only SKILL.md.',
    'Lo que la skill dice que necesita (frontmatter <code>allowed-tools</code> / permisos). El escáner comprueba que no haga más de lo declarado.': 'What the skill says it needs (frontmatter <code>allowed-tools</code> / permissions). The scanner checks it does no more than declared.',
    'No declara permisos especiales.': 'Declares no special permissions.', 'Cerrar (Esc)': 'Close (Esc)', 'el escáner encontró patrones peligrosos': 'the scanner found dangerous patterns', 'Ver informe': 'See report', 'Estado': 'Status',
    'Inactiva': 'Inactive', '{n} esta semana': '{n} this week', 'Último uso': 'Last used', 'Re-escanear': 'Re-scan', 'Buscar actualización': 'Check for update', 'Vive en la carpeta de {x}; se gestiona desde allí': 'Lives in the {x} folder; managed from there',
    'Externa: no se borra desde aquí': "External: can't be deleted from here", 'Eliminar': 'Delete', 'Escaneando…': 'Scanning…', 'Buscando…': 'Searching…', 'Ya está al día': 'Already up to date',
    'Actualización de {s}': 'Update for {s}', 'Cambios respecto a la versión instalada. Al aplicar, se vuelve a escanear.': 'Changes compared with the installed version. Applying re-runs the scanner.', 'Aplicar actualización': 'Apply update',
    'No se pudo aplicar': "Couldn't apply", 'Actualizada': 'Updated', 'Eliminar skill': 'Delete skill', 'Se borra «{s}» y su carpeta. No se puede deshacer.': '«{s}» and its folder will be deleted. This cannot be undone.', 'Skill eliminada': 'Skill deleted',
    // ===== panel · configuración (navegación y páginas) =====
    'General': 'General', 'Apariencia': 'Appearance', 'Acerca de': 'About', 'Conexiones': 'Connections', 'Núcleo': 'Core', 'Correo y servicios': 'Email & services', 'Agente': 'Agent', 'Personalidad': 'Personality',
    'Modelos': 'Models', 'Herramientas': 'Tools', 'Cerebro': 'Brain', 'Privacidad y seguridad': 'Privacy & security', 'Aprobaciones': 'Approvals', 'Claves de API': 'API keys', 'Sistema': 'System',
    'Importar (OpenClaw…)': 'Import (OpenClaw…)', 'Avanzado': 'Advanced', 'Guardado': 'Saved',
    'Idioma, tema, color y modo del panel.': 'Language, theme, color and mode of the panel.', 'Idioma': 'Language', 'Panel, isla y menú de la bandeja. Automático = el de tu sistema ({x}).': 'Panel, island and tray menu. Automatic = your system language ({x}).',
    'Automático': 'Automatic', 'Asistente de primer arranque': 'First-run assistant', 'Idioma, nombre, modelo y canales en menos de 2 minutos.': 'Language, name, model and channels in under 2 minutes.', 'Abrir asistente': 'Open assistant',
    'Tema': 'Theme', 'Modo de color': 'Color mode', 'Modo': 'Mode', 'Sistema sigue el ajuste de tu equipo.': 'System follows your computer setting.', 'Claro': 'Light', 'Oscuro': 'Dark', 'Color de acento': 'Accent color',
    'El del tema': "The theme's", 'Vista previa': 'Preview',
    '<p>Así se verán las respuestas. <b>Negritas</b>, <code>código</code> y listas:</p><ul><li>Uno</li><li>Dos</li></ul>': '<p>This is how replies will look. <b>Bold</b>, <code>code</code> and lists:</p><ul><li>One</li><li>Two</li></ul>',
    'Tu asistente personal, en tu equipo, con el modelo que tú elijas.': 'Your personal assistant, on your computer, with the model you choose.', 'Licencia MIT': 'MIT license', 'Código abierto': 'Open source', 'Datos': 'Data',
    'Hecho a mano, desde cero.': 'Handmade, from scratch.', 'El proceso que corre los agentes, las herramientas, la memoria y las automatizaciones.': 'The process that runs the agents, tools, memory and automations.', 'Conexión': 'Connection',
    'Conectado': 'Connected', 'Dirección': 'Address', 'API HTTP + eventos en vivo (SSE). Solo escucha en este equipo.': 'HTTP API + live events (SSE). Only listens on this computer.', 'Token': 'Token',
    'Cualquier programa con este token controla el núcleo. No lo compartas.': "Any program with this token controls the core. Don't share it.", 'Abrir en otro navegador': 'Open in another browser',
    'Enlace con el token incluido (se borra de la barra al abrir).': 'Link with the token included (it is removed from the address bar on open).', 'Copiar enlace': 'Copy link', 'Equipo anfitrión': 'Host computer', 'encendido {x}': 'up {x}', '{x} usados': '{x} used',
    'Por dónde puedes hablar con el robot. Todos comparten memoria, permisos y modelos.': 'Where you can talk to the robot. They all share memory, permissions and models.', 'Actualizar': 'Refresh', 'Conectados': 'Connected',
    'El bot de Discord se configura desde la bandeja del robot: <b>Configurar Discord (abrir archivo)…</b> y luego <b>Reconectar Discord</b>. Su estado aparece arriba, en Conectados.': "The Discord bot is set up from the robot's tray: <b>Configure Discord (open file)…</b> then <b>Reconnect Discord</b>. Its status shows above, under Connected.",
    'Conectar otros agentes (MCP)': 'Connect other agents (MCP)',
    'Antigravity, Cursor, Claude Desktop, Claude Code… pueden usar al robot: avisarte, pedirte permiso por tus canales, la memoria y las tareas. Añade esto a su configuración MCP (cambia la ruta si instalaste en otra carpeta):': 'Antigravity, Cursor, Claude Desktop, Claude Code… can use the robot: notify you, ask you for permission over your channels, memory and tasks. Add this to their MCP config (change the path if you installed elsewhere):',
    'Desde cualquier canal: <code>gemma: mensaje</code> manda a un modelo concreto · <code>usa gpt</code> cambia el modelo por defecto de ese canal · <code>usa claude code</code> vuelve a Claude Code.': 'From any channel: <code>gemma: message</code> sends to a specific model · <code>usa gpt</code> changes that channel\'s default model · <code>usa claude code</code> goes back to Claude Code.',
    'activo': 'active', 'inactivo': 'inactive', 'respaldo': 'fallback', 'Panel web': 'Web panel', 'Este panel': 'This panel', 'API local': 'Local API', 'HTTP + SSE en 127.0.0.1': 'HTTP + SSE on 127.0.0.1',
    'Isla de escritorio': 'Desktop island', 'Voz': 'Voice', 'Destino:': 'Target:', 'destino:': 'target:', 'automático': 'automatic', 'Whisper cargado · Ctrl+Alt+Espacio': 'Whisper loaded · Ctrl+Alt+Space',
    'Whisper se carga al hablar · Ctrl+Alt+Espacio': 'Whisper loads when you speak · Ctrl+Alt+Space', 'Permitir / Denegar / Estado': 'Allow / Deny / Status', 'Hooks instalados: permisos y actividad en la isla': 'Hooks installed: permissions and activity in the island',
    'Instálalos desde la bandeja': 'Install them from the tray', 'Gemini CLI no está instalado (npm i -g @google/gemini-cli)': 'Gemini CLI is not installed (npm i -g @google/gemini-cli)', 'Sus hooks son experimentales y aún no funcionan en Windows': "Its hooks are experimental and don't work on Windows yet",
    'Hooks instalados': 'Hooks installed', 'conectando…': 'connecting…', 'conectado': 'connected', 'desconectado': 'disconnected', 'desactivado': 'disabled', 'apagado': 'off', 'iniciando': 'starting', 'error leyendo': 'read error', 'no disponible (¿Python?)': 'not available (Python?)',
    'esperando QR': 'waiting for QR', 'sin configurar': 'not configured', 'Preparando…': 'Preparing…', 'Mensaje de prueba enviado a tu chat': 'Test message sent to your chat', 'Desvincular WhatsApp': 'Unlink WhatsApp',
    'Se cierra la sesión de APOLO en tu WhatsApp (como cerrar WhatsApp Web).': "APOLO's session in your WhatsApp is closed (like closing WhatsApp Web).", 'Desvincular': 'Unlink', 'Pega el token que te dio @BotFather': 'Paste the token @BotFather gave you',
    'Comprobando…': 'Checking…', 'Conectar': 'Connect', '✓ Bot @{b} conectado. Ahora enlaza tu chat.': '✓ Bot @{b} connected. Now link your chat.', 'Mensaje de prueba enviado': 'Test message sent', 'Desconectar Telegram': 'Disconnect Telegram',
    'El robot dejará de usar ese bot (el bot sigue existiendo en tu Telegram).': 'The robot will stop using that bot (the bot still exists in your Telegram).', 'Desconectar': 'Disconnect', 'No disponible.': 'Not available.',
    '<span class="ok-txt">✓ Vinculado.</span> Escríbele en tu chat contigo mismo ("Tú" / "Mensaje para ti").': '<span class="ok-txt">✓ Linked.</span> Write to it in your chat with yourself ("You" / "Message yourself").', 'Probar': 'Test',
    '<b>En tu móvil:</b><br>WhatsApp → <b>Ajustes</b> → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b> → escanea este código.': '<b>On your phone:</b><br>WhatsApp → <b>Settings</b> → <b>Linked devices</b> → <b>Link a device</b> → scan this code.', 'Esperando…': 'Waiting…',
    'Háblale al robot desde WhatsApp y recibe permisos y avisos. Se vincula como <b>WhatsApp Web</b> escaneando un QR.': 'Talk to the robot from WhatsApp and get permissions and notices there. It links like <b>WhatsApp Web</b> by scanning a QR.',
    '⚠️ No es la API oficial de WhatsApp: va contra sus términos y existe un riesgo (bajo) de que bloqueen el número.': "⚠️ It's not the official WhatsApp API: it goes against their terms and there is a (low) risk of the number being banned.", 'Te recomendamos <b>un número secundario</b>.': 'We recommend <b>a secondary number</b>.',
    'Privacidad: APOLO solo lee y escribe en tu chat contigo mismo; nunca toca tus otras conversaciones.': 'Privacy: APOLO only reads and writes in your chat with yourself; it never touches your other conversations.', 'Vincular con QR': 'Link with QR',
    'Mensajes que te llegan': 'Incoming messages', 'Por defecto APOLO solo lee tu chat contigo mismo. Si lo activas, también leerá los mensajes que te mandan (no los grupos, salvo que los actives).': 'By default APOLO only reads your chat with yourself. If you turn this on, it will also read the messages people send you (not groups, unless you enable them).',
    'Apagado — solo mi chat conmigo mismo': 'Off — only my chat with myself', 'Avisarme y sugerir respuesta (yo apruebo antes de enviar)': 'Notify me and suggest a reply (I approve before sending)', 'Responder solo (y avisarme de lo que respondió)': 'Reply on its own (and tell me what it replied)',
    'Leer también los grupos': 'Also read groups', 'Ignorar estos números (separados por coma)': 'Ignore these numbers (comma separated)', 'Responder solo a estos números (vacío = a todos, nunca a grupos)': 'Only reply to these numbers (empty = everyone, never groups)',
    'Instrucciones para responder': 'Reply instructions', 'Máximo {n} respuestas automáticas por contacto y hora. Nunca responde solo a pagos, contraseñas, datos privados, citas o cosas urgentes: esas te las pregunta.': 'At most {n} automatic replies per contact per hour. It never answers payments, passwords, private data, appointments or urgent things on its own: it asks you first.',
    '✓ WhatsApp vinculado': '✓ WhatsApp linked',
    '<b>1.</b> Abre <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> en Telegram y escribe <code>/newbot</code>.': '<b>1.</b> Open <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> in Telegram and type <code>/newbot</code>.',
    '<b>2.</b> Ponle un nombre (ej. <i>Mi Robot</i>) y un usuario que acabe en <code>bot</code> (ej. <i>mirobot123_bot</i>).': '<b>2.</b> Give it a name (e.g. <i>My Robot</i>) and a username ending in <code>bot</code> (e.g. <i>myrobot123_bot</i>).',
    '<b>3.</b> Te dará un <b>token</b> (algo como <code>123456789:AAH…</code>). Pégalo aquí:': '<b>3.</b> It will give you a <b>token</b> (something like <code>123456789:AAH…</code>). Paste it here:',
    'Token del bot': 'Bot token', 'Se guarda cifrado en este equipo. Tu bot solo hablará contigo.': 'Stored encrypted on this computer. Your bot will only talk to you.',
    '<b>Último paso:</b> abre el enlace y pulsa <b>Iniciar</b> en Telegram para ligar el bot a tu chat.': '<b>Last step:</b> open the link and press <b>Start</b> in Telegram to bind the bot to your chat.', 'Abrir Telegram': 'Open Telegram', 'Quitar': 'Remove',
    'Enlazado con {x}': 'Linked with {x}', 'Enlazado': 'Linked', 'Háblale desde el móvil; aquí te llegan permisos y avisos cuando no estás en el PC.': "Talk to it from your phone; permissions and notices reach you there when you're away from the PC.", 'Enlazar otro chat': 'Link another chat', '✓ Telegram enlazado': '✓ Telegram linked',
    'Archivos que el robot lee en cada conversación, con cualquier modelo. Escribe en Markdown.': 'Files the robot reads in every conversation, with any model. Written in Markdown.', 'Restablecer': 'Reset', '{n} / {m} caracteres': '{n} / {m} characters',
    'Guardado. Se aplica desde el siguiente mensaje.': 'Saved. Applies from the next message.', '“{x}” volverá al texto original.': '“{x}” will go back to the original text.',
    'Identidad': 'Identity', 'Instrucciones': 'Instructions', 'Contexto del usuario': 'User context', 'Español': 'Español', 'English': 'English',
    'Quién es tu asistente: nombre, carácter, forma de hablar.': 'Who your assistant is: name, character, way of speaking.',
    'Cómo debe trabajar: reglas, costumbres, lo que nunca debe hacer.': 'How it should work: rules, habits, what it must never do.',
    'Datos fijos útiles: tus equipos, carpetas, servidores, proyectos.': 'Useful fixed facts: your computers, folders, servers, projects.',
    'Conecta cualquier proveedor. Las claves se guardan en este equipo y nunca se muestran.': 'Connect any provider. Keys are stored on this computer and never shown.', 'Añadir proveedor': 'Add provider',
    '¿Pagas ChatGPT Plus o Pro? Úsalo aquí sin API key: se conecta con tu cuenta a través de Codex CLI (de OpenAI).': 'Paying for ChatGPT Plus or Pro? Use it here without an API key: it connects with your account through Codex CLI (by OpenAI).',
    'Cuenta de ChatGPT': 'ChatGPT account', 'Conectar ChatGPT': 'Connect ChatGPT', 'Usar por defecto': 'Use as default', 'Por defecto': 'Default',
    'Se usa en conversaciones nuevas, tareas y canales sin modelo elegido. Formato <code>proveedor/modelo</code>.': 'Used in new conversations, tasks and channels with no model chosen. Format <code>provider/model</code>.',
    'Escribe <code>atajo: mensaje</code> en la isla, Discord o voz para hablar con ese modelo.': 'Type <code>shortcut: message</code> in the island, Discord or voice to talk to that model.', 'Atajo': 'Shortcut', 'Guardar atajos': 'Save shortcuts',
    'Tu cuenta de ChatGPT vía Codex CLI (arriba: Conectar ChatGPT)': 'Your ChatGPT account via Codex CLI (above: Connect ChatGPT)', 'CLI de Claude Code instalada en este equipo': 'Claude Code CLI installed on this computer', 'key (entorno)': 'key (env)',
    'key guardada': 'key saved', 'sin key': 'no key', 'es tu modelo por defecto': 'it is your default model', 'Codex instalado · falta iniciar sesión': 'Codex installed · sign-in pending', 'No conectado': 'Not connected', 'Reconectar': 'Reconnect',
    'Instalando Codex si hace falta (puede tardar un minuto)…': 'Installing Codex if needed (may take a minute)…', 'Reintentar': 'Retry', 'Probando…': 'Testing…', 'Proveedor': 'Provider', 'Nombre (sin espacios)': 'Name (no spaces)',
    'Compatible OpenAI': 'OpenAI compatible', 'URL base': 'Base URL', '•••••••• guardada — escribe para cambiarla': '•••••••• saved — type to change it', 'pega tu clave': 'paste your key',
    'Groq, DeepSeek, Mistral, LM Studio, vLLM, Together… cualquiera con API tipo OpenAI funciona.': 'Groq, DeepSeek, Mistral, LM Studio, vLLM, Together… anything with an OpenAI-style API works.', 'Nombre no válido': 'Invalid name', 'Proveedor eliminado': 'Provider removed',
    'atajo': 'shortcut', 'proveedor/modelo': 'provider/model',
    'El que lee tus avisos de Discord, los clasifica (urgente / normal / ruido), prepara respuestas y te hace el resumen del día.': 'The one that reads your Discord notices, sorts them (urgent / normal / noise), drafts replies and writes your daily summary.',
    'Modelo para clasificar avisos': 'Model to sort notices', 'Se usa con cada mensaje que llega. Mejor uno rápido y gratis.': 'Used for every incoming message. A fast, free one is best.', 'Modelo para resúmenes': 'Model for summaries',
    'Resumen del día, “¿dónde me quedé?” y preguntas sobre tu historial.': 'Daily summary, “where did I leave off?” and questions about your history.', 'Hora del resumen del día': 'Daily summary hour', 'Se hace si has usado el PC en los últimos 10 min.': 'Runs if you have used the PC in the last 10 min.',
    '⚠ Usa modelos de tu plan de Claude: cada aviso gasta un poco.': '⚠ Uses models from your Claude plan: each notice spends a little.', '✓ No gasta tu plan de Claude.': "✓ Doesn't spend your Claude plan.",
    'Usa <code>proveedor/modelo</code> (cualquiera de Modelos). <code>haiku</code> o <code>sonnet</code> a secas usan Claude Code como antes.': 'Use <code>provider/model</code> (any from Models). Plain <code>haiku</code> or <code>sonnet</code> use Claude Code as before.',
    'solo lectura': 'read only', 'escribe': 'writes', 'ejecuta': 'runs', 'según uso': 'depends on use', 'Lo que el agente puede hacer en tu equipo. Apaga lo que no quieras que use con ningún modelo.': "What the agent can do on your computer. Turn off what you don't want any model to use.",
    'Las que escriben o ejecutan piden permiso según tu modo en <a href="#/ajustes/permisos">Permisos</a>.': 'Those that write or run ask for permission according to your mode in <a href="#/ajustes/permisos">Permissions</a>.',
    'Cuándo debe preguntarte el robot antes de actuar.': 'When the robot must ask you before acting.',
    'Leer nunca pide permiso. Lo <b>peligroso</b> (borrados recursivos, push forzado, formatear…) pide permiso <b>siempre</b>, en cualquier modo.': 'Reading never asks. <b>Dangerous</b> things (recursive deletes, force push, formatting…) <b>always</b> ask, in any mode.',
    'Preguntar': 'Ask', 'Solo lectura': 'Read only', 'Dónde te pregunta': 'Where it asks you', 'Tarjeta en este panel, isla del escritorio, Stream Deck y Discord (si no estás en el PC).': "Card in this panel, desktop island, Stream Deck and Discord (if you're away from the PC).",
    'todos los canales': 'all channels', 'Reglas “Siempre”': '“Always” rules', 'Se crean al pulsar <b>Siempre</b> en un permiso. Quítalas para que vuelva a preguntar.': 'Created when you press <b>Always</b> on a permission. Remove them so it asks again.',
    'Herramienta': 'Tool', 'Aplica a': 'Applies to', 'todo': 'everything', 'Sin reglas permanentes.': 'No permanent rules.', 'Automático: solo preguntará lo peligroso': 'Automatic: it will only ask about dangerous things', 'Regla quitada': 'Rule removed',
    'Permitido': 'Allowed', 'Denegado': 'Denied', 'Historial de permisos de los últimos 30 días: qué pidió el robot y qué respondiste.': 'Permission history for the last 30 days: what the robot asked and what you answered.', 'Solicitud': 'Request', 'Decisión': 'Decision',
    'Respuesta en': 'Answered in', 'Sin aprobaciones registradas todavía.': 'No approvals recorded yet.',
    'Una sola clave para cientos de modelos.': 'One key for hundreds of models.', 'Se paga por uso aparte del plan de ChatGPT (para tu plan usa "Conectar ChatGPT").': 'Pay-as-you-go, separate from the ChatGPT plan (for your plan use "Connect ChatGPT").',
    'Se paga por uso aparte del plan de Claude.': 'Pay-as-you-go, separate from the Claude plan.', 'Gratis con límites diarios.': 'Free with daily limits.', 'Gratis con límites; muy rápido.': 'Free with limits; very fast.', 'Créditos gratis al registrarte.': 'Free credits when you sign up.',
    'Tiene clave de prueba gratis.': 'Has a free trial key.', 'Token con permiso "Make calls to Inference Providers".': 'Token with the "Make calls to Inference Providers" permission.', 'Consíguela en': 'Get it at',
    'Se guardan solo en este equipo (config del núcleo) y nunca se envían al navegador. También puedes usar variables de entorno.': 'Stored only on this computer (core config) and never sent to the browser. You can also use environment variables.',
    'Origen': 'Source', 'Variable de entorno': 'Environment variable', 'configurada': 'set', 'sin clave': 'no key', 'conseguir': 'get one', 'entorno': 'env', 'config': 'config', 'Cambiar': 'Change', 'Añadir': 'Add',
    'Las contraseñas y claves también se bloquean en la memoria del robot: nunca las guarda.': 'Passwords and keys are also blocked from the robot memory: it never saves them.', 'Quitar clave': 'Remove key', 'Se borrará la clave de {k}.': 'The {k} key will be deleted.',
    'Clave quitada': 'Key removed', 'Clave de {k}': '{k} key', 'pega la clave': 'paste the key', 'Clave guardada': 'Key saved', 'Lo que pasa en el núcleo, en vivo (últimas 1000 líneas).': "What's happening in the core, live (last 1000 lines).",
    'Todo': 'All', 'Avisos': 'Warnings', 'Errores': 'Errors', 'Reanudar': 'Resume', 'Pausar': 'Pause', 'Nada todavía.': 'Nothing yet.', 'Ajustes del agente para usuarios con experiencia.': 'Agent settings for experienced users.',
    'Pasos máximos por mensaje': 'Max steps per message', 'Cuántas veces puede usar herramientas antes de detenerse (1–200).': 'How many times it can use tools before stopping (1–200).', 'Carpeta de trabajo por defecto': 'Default working folder',
    'Dónde trabajan las conversaciones nuevas y las automatizaciones. Vacío = tu carpeta de usuario.': 'Where new conversations and automations work. Empty = your user folder.', 'Carpeta de datos': 'Data folder',
    'Configuración, sesiones, memoria, tareas y registros.': 'Config, sessions, memory, tasks and logs.', 'Sesión del panel': 'Panel session', 'Cerrar sesión': 'Sign out', 'Borra el token de este navegador.': 'Removes the token from this browser.',
    'Importar': 'Import', 'Trae la memoria, el SOUL, las automatizaciones, los agentes y las skills de otro asistente (OpenClaw). Pídele que genere <code>robot-migracion.json</code> y suéltalo aquí.': 'Bring the memory, SOUL, automations, agents and skills from another assistant (OpenClaw). Ask it to generate <code>robot-migracion.json</code> and drop it here.',
    'Suelta aquí robot-migracion.json': 'Drop robot-migracion.json here', 'o haz clic para elegirlo · máx. 8 MB · las claves y contraseñas se tapan solas': 'or click to pick it · max 8 MB · keys and passwords are masked automatically', 'Qué trae': "What's inside", 'externo': 'external',
    'Archivos (memoria, SOUL, USER…)': 'Files (memory, SOUL, USER…)', 'Se guardan tal cual. SOUL → identidad, USER → contexto; de la memoria se sacan recuerdos con el modelo del cerebro.': "Saved as is. SOUL → identity, USER → context; memories are extracted from the memory files with the brain's model.",
    'Se crean PAUSADAS: revísalas y actívalas en Automatizaciones (ejecutan herramientas).': 'Created PAUSED: review and enable them in Automations (they run tools).', 'Plantillas de subagente: el robot las usa con "delegar".': 'Subagent templates: the robot uses them with "delegate".',
    'Se guardan; de momento no se usan solas.': "Saved; for now they aren't used on their own.", 'Notas del exportador:': "Exporter's notes:", 'sin cambios': 'no changes', 'Recuerdos: {a} nuevos, {b} actualizados': 'Memories: {a} new, {b} updated',
    '{n} rechazados (secretos/inválidos)': '{n} rejected (secrets/invalid)', 'Automatizaciones creadas en pausa:': 'Automations created paused:', 'revisarlas': 'review them', 'Identidad detectada:': 'Detected identity:', 'Copia exacta en {x}': 'Exact copy in {x}',
    'Importaciones anteriores': 'Previous imports', '{a} recuerdos · {b} automatizaciones · {c} agentes': '{a} memories · {b} automations · {c} agents', 'Todavía no has importado nada.': "You haven't imported anything yet.",
    'Demasiado grande (máx. 8 MB)': 'Too big (max 8 MB)', 'no parece un robot-migracion.json': "doesn't look like a robot-migracion.json", 'No pude leerlo: {x}': "Couldn't read it: {x}", 'Importando… (el modelo lee la memoria, puede tardar)': 'Importing… (the model reads the memory, may take a while)', 'Importado': 'Imported',
    'Notificaciones, repos, issues y PRs. Crear o comentar pide permiso.': 'Notifications, repos, issues and PRs. Creating or commenting asks for permission.', 'Token personal (github_pat_… o ghp_…)': 'Personal token (github_pat_… or ghp_…)',
    'Buscar modelos, datasets y spaces.': 'Search models, datasets and spaces.', 'Token de acceso (hf_…)': 'Access token (hf_…)', 'Voces y generar audio (gasta créditos: pide permiso).': 'Voices and audio generation (spends credits: asks for permission).',
    'contraseña de aplicación': 'app password', 'avisos': 'notices', 'Conecta todas tus cuentas. Las contraseñas y tokens se guardan cifrados en este equipo.': 'Connect all your accounts. Passwords and tokens are stored encrypted on this computer.',
    '(sin cifrado del sistema disponible)': '(no system encryption available)', 'Conectar con Google': 'Connect with Google', 'Conectar con Microsoft': 'Connect with Microsoft', 'Otro correo': 'Other email', 'Correo': 'Email',
    'Lee y resume tus correos, te avisa de lo importante con tarjetas y prepara respuestas. <b>Nunca envía nada sin que lo apruebes.</b>': 'Reads and summarizes your email, flags what matters with cards and drafts replies. <b>It never sends anything without your approval.</b>',
    'Ninguna cuenta todavía. Gmail y Outlook/Hotmail: botón Conectar (inicias sesión en el navegador). Yahoo, iCloud o tu dominio: Otro correo.': 'No accounts yet. Gmail and Outlook/Hotmail: Connect button (you sign in in the browser). Yahoo, iCloud or your own domain: Other email.',
    'Servicios': 'Services', 'conseguir token': 'get a token', 'Credenciales OAuth': 'OAuth credentials', 'Las apps registradas en Google y Microsoft que usan los botones Conectar. Se hace una vez (guía: docs/oauth.md).': 'The apps registered with Google and Microsoft that the Connect buttons use. Done once (guide: docs/oauth.md).',
    'configurado': 'configured', 'Client ID y secreto de una app OAuth de tipo "Escritorio" en Google Cloud.': 'Client ID and secret of a "Desktop" OAuth app in Google Cloud.',
    'Application (client) ID de una app en Entra/Azure con flujos públicos y redirect http://localhost.': 'Application (client) ID of an Entra/Azure app with public flows and redirect http://localhost.', 'Guardar credenciales': 'Save credentials', 'Credenciales guardadas': 'Credentials saved',
    'Otro correo (contraseña de aplicación)': 'Other email (app password)', 'Contraseña de aplicación': 'App password', 'NO tu contraseña normal: una de aplicación': 'NOT your normal password: an app password',
    'Yahoo: Seguridad → contraseña de aplicación · iCloud: appleid.apple.com → Contraseñas de apps · Gmail también vale (myaccount.google.com/apppasswords), aunque es mejor Conectar con Google.': 'Yahoo: Security → app password · iCloud: appleid.apple.com → App-specific passwords · Gmail works too (myaccount.google.com/apppasswords), though Connect with Google is better.',
    'Servidor propio (dominio)': 'Own server (domain)', 'Usuario (si no es el correo)': 'Username (if not the email)', 'Conectando…': 'Connecting…', '✓ Conectado: {a} mensajes, {b} sin leer': '✓ Connected: {a} messages, {b} unread', 'Quitar cuenta': 'Remove account',
    'Se borra de este equipo (tu correo no se toca).': 'Removed from this computer (your mailbox is not touched).', '{a} mensajes · {b} sin leer': '{a} messages · {b} unread', 'Conectar {x}': 'Connect {x}', 'Consíguelo en {u}. Se guarda cifrado en este equipo.': 'Get it at {u}. Stored encrypted on this computer.',
    '✓ {x} conectado: {q}': '✓ {x} connected: {q}', 'Avisos activados': 'Notices on', 'Avisos desactivados': 'Notices off', 'Inicia sesión con Microsoft': 'Sign in with Microsoft', 'Inicia sesión con Google': 'Sign in with Google', 'Inicia sesión': 'Sign in',
    'Se abrió tu navegador para que inicies sesión y des permiso a APOLO.': 'Your browser opened so you can sign in and grant APOLO access.', '¿No se abrió?': "Didn't it open?", 'Ábrelo aquí': 'Open it here', '{x} conectado. Ya puedes cerrar.': '{x} connected. You can close this now.', '✓ {x} conectado': '✓ {x} connected',
    // ===== panel · asistente de bienvenida =====
    'Nombre': 'Name', 'Canales': 'Channels', '¡HOLA! 👋': 'HELLO! 👋', 'Saltar el asistente': 'Skip the assistant', 'Atrás': 'Back', 'Empezar a chatear': 'Start chatting', 'Terminar': 'Finish', 'Siguiente': 'Next',
    'Puedes volver al asistente desde Configuración → Apariencia.': 'You can come back to the assistant from Settings → Appearance.', 'Paso {a} de {b}': 'Step {a} of {b}', 'Hola. Vamos a dejarme listo.': "Hi. Let's get me ready.",
    'Cinco pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?': 'Five steps, under two minutes. First: which language do we speak?', 'El de tu sistema': 'Your system language', 'Inglés': 'English', 'Spanish': 'Spanish',
    'Sigue el idioma del sistema ({x})': 'Follows the system language ({x})', 'Se aplica al panel, a la isla del escritorio y al menú de la bandeja.': 'Applies to the panel, the desktop island and the tray menu.', '¿Cómo me llamo?': "What's my name?",
    'Es el nombre con el que te hablo en la isla, Telegram, WhatsApp y Discord. Puedes cambiarlo cuando quieras.': 'The name I use with you in the island, Telegram, WhatsApp and Discord. You can change it anytime.', 'Escribe un nombre…': 'Type a name…',
    'Pista: también puedes decírmelo hablando: «a partir de ahora te llamas …».': 'Tip: you can also tell me by talking: «from now on your name is …».', '¿Con qué cerebro pienso?': 'Which brain do I think with?',
    'He mirado qué hay en este equipo. Elige uno; luego puedes usar cualquier otro por conversación.': "I've checked what's on this computer. Pick one; later you can use any other per conversation.", 'Buscando Ollama, Claude Code, Codex, Gemini CLI y tus claves…': 'Looking for Ollama, Claude Code, Codex, Gemini CLI and your keys…',
    '{n} modelos en este PC · gratis y privado': '{n} models on this PC · free and private', 'No está en marcha en 127.0.0.1:11434': 'Not running on 127.0.0.1:11434', 'Instalar Ollama': 'Install Ollama', 'CLI instalada · usa tu plan de Claude': 'CLI installed · uses your Claude plan',
    'No encontré la CLI «claude»': "Couldn't find the «claude» CLI", 'Instalar Claude Code': 'Install Claude Code', 'Sesión iniciada · usa tu plan de ChatGPT': 'Signed in · uses your ChatGPT plan', 'Conecta tu cuenta de ChatGPT Plus/Pro': 'Connect your ChatGPT Plus/Pro account',
    'Clave en variable de entorno': 'Key in environment variable', 'Clave guardada': 'Key saved', 'hooks instalados': 'hooks installed', 'hooks: desde la bandeja': 'hooks: from the tray',
    'Encontré {n} opción lista para usar.|Encontré {n} opciones listas para usar.': 'I found {n} option ready to use.|I found {n} options ready to use.', 'No encontré ningún modelo listo. Lo más rápido: una clave gratis de Gemini o instalar Ollama.': "I didn't find any model ready. Quickest: a free Gemini key or installing Ollama.",
    'detectado': 'detected', 'Añadir una API key': 'Add an API key', 'Elegido:': 'Chosen:', 'Elige una opción para continuar (o sáltalo y hazlo luego en Configuración → Modelos).': 'Pick an option to continue (or skip it and do it later in Settings → Models).',
    'Inicia sesión en la ventana que se abrió': 'Sign in in the window that opened', 'Pega la clave primero': 'Paste the key first', 'Probando {m}…': 'Testing {m}…', '{m} responde': '{m} responds', '¿Me llevas en el bolsillo?': 'Take me in your pocket?',
    'Háblame desde el móvil y recibe ahí los permisos y avisos cuando no estés en el PC. Es opcional: puedes hacerlo más tarde.': "Talk to me from your phone and get permissions and notices there when you're away from the PC. Optional: you can do it later.", 'Mirando tus canales…': 'Checking your channels…',
    'Cada tarjeta se abre en una pestaña nueva; este asistente te espera aquí.': 'Each card opens in a new tab; this assistant waits for you here.', 'Tu propio bot con @BotFather. Lo más fácil y fiable.': 'Your own bot via @BotFather. The easiest and most reliable.',
    'Se vincula con un QR, como WhatsApp Web. Mejor con un número secundario.': 'Links with a QR, like WhatsApp Web. Best with a secondary number.', 'Un bot en tu servidor: permisos con botones y avisos.': 'A bot in your server: permissions with buttons and notices.', 'Configurar': 'Set up',
    '¡Todo listo!': 'All set!', '{n} está listo.': '{n} is ready.', 'Ya puedes hablarme desde aquí, la isla del escritorio o el móvil. Todos los canales comparten memoria y permisos.': 'You can now talk to me from here, the desktop island or your phone. Every channel shares memory and permissions.',
    'Para empezar': 'To get started', '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Espacio</kbd> para hablarme por voz.': '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Space</kbd> to talk to me by voice.', '<kbd>Ctrl</kbd>+<kbd>K</kbd> en el panel para encontrar cualquier cosa.': '<kbd>Ctrl</kbd>+<kbd>K</kbd> in the panel to find anything.',
    'Prueba: «recuérdame mañana a las 9 llamar al taller».': 'Try: «remind me tomorrow at 9 to call the shop».', 'o ir al inicio': 'or go to home', '¡LISTO!': 'DONE!',
    // ===== isla (app/) =====
    'sesiones': 'sessions', 'subagentes activos': 'active subagents', 'contexto máx.': 'max context', 'uso hoy': 'today', 'últimas 5 h': 'last 5 h', 'semana': 'week', 'Últimos 7 días': 'Last 7 days',
    'Voz del robot': 'Robot voice', 'Sonido': 'Sound', 'Mostrar / ocultar las terminales': 'Show / hide terminals', 'Pídele algo a Claude…  (en Proyecto: …)': 'Ask Claude something…  (in Project: …)', 'Hablar (Ctrl+Alt+Espacio)': 'Talk (Ctrl+Alt+Space)',
    'Ir a su ventana': 'Go to its window', 'Escríbele a esta terminal…': 'Write to this terminal…', 'Enviar a esta terminal': 'Send to this terminal', 'Toca una terminal para ver su conversación y escribirle desde aquí': 'Tap a terminal to see its conversation and write to it from here',
    '¡Para, para! Todo me da vueltas': "Stop, stop! Everything's spinning", '¡HOLA!': 'HELLO!', '¡ACHÍS!': 'ACHOO!', '¡BUENOS DÍAS!': 'GOOD MORNING!', '¡Buenos días!': 'Good morning!', 'Navegador': 'Browser', 'abre': 'opens', 'clic': 'click',
    'esperando {n} s': 'waiting {n} s', 'sesión iniciada': 'session started', '{x} falló': '{x} failed', 'subagente {x} terminó': 'subagent {x} finished', 'Permitido automáticamente': 'Allowed automatically', 'listo ✓': 'done ✓', 'terminado': 'finished',
    'Listo, terminé en {x}': 'Done, I finished in {x}', 'terminó con error': 'ended with an error', 'Algo falló en {x}': 'Something failed in {x}', '{x} cerrada': '{x} closed', 'denegado': 'denied', 'siempre': 'always', 'permitido': 'allowed',
    '✓ Regla guardada: la próxima vez no pregunto ({x})': "✓ Rule saved: next time I won't ask ({x})", 'remoto': 'remote', 'Mensaje de {x}': 'Message from {x}', '{a} te mencionó en {g}': '{a} mentioned you in {g}', 'urgente': 'urgent', 'Responder': 'Reply',
    'Enviar (como bot)': 'Send (as bot)', 'Copia la respuesta y abre Discord para que la mandes tú': 'Copies the reply and opens Discord so you send it yourself', 'Copiar y abrir': 'Copy and open', 'Descartar': 'Dismiss', 'Esto es importante': 'This matters',
    'Esto no me importa': "I don't care about this", 'URGENTE': 'URGENT', 'Urgente: {x}': 'Urgent: {x}', 'PENSANDO…': 'THINKING…', 'Respuesta': 'Reply', 'ACTUALIZANDO…': 'UPDATING…', 'Me actualizo. Vuelvo en un momento.': "Updating myself. I'll be right back.",
    'Te lo recuerdo mañana. También en la bandeja: Buscar actualizaciones.': "I'll remind you tomorrow. Also in the tray: Check for updates.", 'Actualización disponible': 'Update available', 'Hay una versión nueva de {x}.': 'There is a new version of {x}.', 'Actualizar ahora': 'Update now',
    'Más tarde': 'Later', '¡NOVEDADES!': "WHAT'S NEW!", 'Hay una actualización disponible. ¿Quieres instalarla?': 'There is an update available. Do you want to install it?', 'ENVIANDO…': 'SENDING…', 'TE ESCUCHO…': "I'M LISTENING…", 'NO TE ENTENDÍ': "DIDN'T GET THAT",
    'No entendí nada. Prueba otra vez (Ctrl+Alt+Espacio).': "I didn't catch anything. Try again (Ctrl+Alt+Space).", 'Entendido: {x}': 'Got it: {x}', '¿Esto es lo que dijiste? Revísalo y pulsa Enviar (confianza {n}%)': 'Is this what you said? Check it and press Send (confidence {n}%)',
    'RESPUESTA': 'REPLY', 'PELIGRO': 'DANGER', '¿PERMISO?': 'PERMISSION?', 'Claude necesita tu permiso': 'Claude needs your permission', 'Trabajando…': 'Working…', 'Tarea terminada': 'Task finished', 'Algo falló': 'Something failed', '{x} listo': '{x} ready',
    'esperando a Claude Code…': 'waiting for Claude Code…', '{n} sesión|{n} sesiones': '{n} session|{n} sessions', '{n} sesión trabajando|{n} sesiones trabajando': '{n} session working|{n} sessions working', 'No hay nada pendiente.': 'Nothing pending.',
    'Ventana de 5 h (límite aprendido del plan)': '5 h window (learned plan limit)', 'Ventana de 5 h. El % aparece cuando el robot aprenda tu límite (la primera vez que lo alcances) o si lo pones en limites.json': '5 h window. The % shows once the robot learns your limit (the first time you hit it) or if you set it in limites.json',
    '+{x} caché': '+{x} cache', '{m} mensajes · {o} escritos por Claude · {n} nuevos · {c} relectura de caché (total {t})': '{m} messages · {o} written by Claude · {n} new · {c} cache re-reads (total {t})', 'paso {n}': 'step {n}',
    'Ojo: {x}. Revísalo bien antes de permitir.': 'Careful: {x}. Check it well before allowing.', 'No volver a preguntar por esto': "Don't ask about this again", 'Terminales': 'Terminals', '{n} trabajando': '{n} working', 'contexto: {x} tokens ({p}%)': 'context: {x} tokens ({p}%)',
    'Clic: chatear con ella aquí · flecha: ir a su ventana': 'Click: chat with it here · arrow: go to its window', 'Sin sesiones de Claude Code todavía.': 'No Claude Code sessions yet.',
    'No encontré la ventana de esa terminal todavía (se detecta con el siguiente evento de la sesión).': "Couldn't find that terminal's window yet (it is detected with the session's next event).", 'Cargando…': 'Loading…',
    'Esta conversación es del núcleo: ábrela en el panel de control.': 'This conversation belongs to the core: open it in the control panel.', 'Sin mensajes todavía.': 'No messages yet.', 'trabajando…': 'working…', '{n} en cola': '{n} queued',
    'ejecutar un comando': 'run a command', 'editar {x}': 'edit {x}', 'crear {x}': 'create {x}', 'entrar a una web': 'open a website', 'usar {x}': 'use {x}', 'Cuidado. Claude quiere hacer algo peligroso: {x}': 'Careful. Claude wants to do something dangerous: {x}',
    'Necesito tu permiso para {x}': 'I need your permission to {x}', 'Voz activada': 'Voice on', 'Hola, estoy listo': "Hi, I'm ready", '¡EY!': 'HEY!', '¡PARA, PARA!': 'STOP, STOP!', 'MAREADO': 'DIZZY', '✓ TAREA COMPLETA': '✓ TASK DONE',
    'Mensaje vacío.': 'Empty message.', 'Aún no tengo el historial de esta terminal (llega con su próximo evento).': "I don't have this terminal's history yet (it arrives with its next event).", 'No encuentro la ventana de esa terminal todavía.': "I can't find that terminal's window yet.",
    'Está trabajando: se lo paso en cuanto termine.': "It's working: I'll pass it on as soon as it finishes.", 'Enviado.': 'Sent.', 'No pude escribir en su ventana.': "Couldn't write to its window.",
    // ===== panel: consejo de modelos (consejo.js) =====
    'Consejo': 'Council', '¿Qué quieres que debatan? Ej.: ¿Rust o Go para un servidor de juegos?': 'What should they debate? E.g.: Rust or Go for a game server?', 'Rondas de debate': 'Debate rounds',
    'Convocar al consejo': 'Summon the council', 'Consejos anteriores': 'Previous councils', 'no disponible': 'unavailable', 'No hay modelos configurados para el consejo.': 'No models are configured for the council.',
    'Escribe una pregunta': 'Write a question', 'Elige al menos un modelo': 'Pick at least one model', 'VEREDICTO': 'VERDICT', 'Pon a varias IAs a debatir': 'Make several AIs debate',
    'Todas responden a la vez, ven lo que dicen las demás, se corrigen… y un moderador da el veredicto.': 'They all answer at once, see what the others said, correct themselves… and a moderator gives the verdict.',
    'Ausente': 'Absent', 'Debatiendo…': 'Debating…', 'Pensando…': 'Thinking…', 'no respondió': 'did not answer', 'Debate {n}': 'Debate {n}', 'El moderador está votando…': 'The moderator is voting…',
    'Ronda de debate {n} de {t}': 'Debate round {n} of {t}', 'Ronda 1: todos responden a la vez': 'Round 1: everyone answers at once', 'Veredicto': 'Verdict', 'La pregunta': 'The question',
    'El moderador está leyendo a todos y contando votos…': 'The moderator is reading everyone and counting votes…', 'acuerdo': 'agreement', 'Veredicto del consejo': 'Council verdict', 'moderador': 'moderator',
    'Esto es lo que concluyen': 'This is what they conclude', 'Aún no has convocado ningún consejo.': "You haven't summoned any council yet.", 'A favor': 'For', 'Parcial': 'Partial', 'En contra': 'Against',
    'Mantiene': 'Holds', 'Se corrige': 'Corrects itself', 'Matiza': 'Nuances', 'en curso': 'running',
    // ===== panel: turno de noche (turno.js) =====
    'Turno de noche': 'Night shift', 'Parar': 'Stop', 'Empezar ahora': 'Start now', 'Nuevo encargo': 'New job', 'Ej.: Revisa los tests que fallan en el proyecto y arregla lo que puedas': 'E.g.: Check the failing tests in the project and fix what you can',
    'Modelo (opcional)': 'Model (optional)', 'Añadir a la cola': 'Add to queue', 'Horario': 'Schedule', 'Cola': 'Queue', 'arrastra para cambiar el orden': 'drag to reorder', 'Informes de la mañana': 'Morning reports',
    'Turno en marcha': 'Shift running', 'Preparando el informe y el vídeo…': 'Preparing the report and the video…', 'Escribe el encargo': 'Write the job', 'Encargo en la cola': 'Job queued', 'Dentro de la ventana nocturna': 'Inside the night window', 'Esperando a la noche': 'Waiting for the night',
    '{n} trabajando · {p} en cola': '{n} working · {p} queued', 'Empieza solo entre las {a} y las {b}': 'Starts on its own between {a} and {b}', '{n} espera tu permiso|{n} esperan tu permiso': '{n} waiting for your permission|{n} waiting for your permission',
    'Arrastrar': 'Drag', 'Aprobar y reintentar': 'Approve and retry', 'Informe': 'Report', '{n} encargos': '{n} jobs', '{n} hecho|{n} hechos': '{n} done|{n} done', '{n} pendiente|{n} pendientes': '{n} pending|{n} pending', '{n} para decidir': '{n} to decide', 'vídeo': 'video',
    'Grabando el vídeo…': 'Recording the video…', 'Solo animación HTML': 'HTML animation only', 'Vídeo desactivado': 'Video disabled', 'Sin vídeo': 'No video', 'Abrir animación': 'Open animation',
    'Guion de la narración': 'Narration script', 'ver sesión': 'view session', 'Grabando el vídeo… (~1 min)': 'Recording the video… (~1 min)', 'Regrabar': 'Re-record', 'Grabar vídeo': 'Record video',
    'Déjale encargos y los hace mientras duermes: cada uno en su propia sesión y, en proyectos git, en una rama aparte (nunca hace push). Por la mañana, informe y vídeo-resumen.': 'Leave it jobs and it does them while you sleep: each in its own session and, in git projects, on a separate branch (it never pushes). In the morning, a report and a video recap.',
    'Ventana nocturna': 'Night window', 'Empieza solo dentro de este horario si hay encargos en la cola.': 'Starts on its own within this window if there are queued jobs.', 'A la vez': 'At once', 'Encargos en paralelo.': 'Jobs in parallel.',
    'Hora a la que te avisa (la del resumen del día si está configurado).': 'When it notifies you (the daily summary time if set).', 'Vídeo-resumen': 'Video recap', 'Vertical, ~60 s, con el robot y los titulares.': 'Vertical, ~60 s, with the robot and the headlines.',
    'Parar el turno': 'Stop the shift', 'Se cancelan los encargos en curso (vuelven a la cola) y se hace el informe de lo terminado.': 'Running jobs are cancelled (back to the queue) and a report of what was finished is made.',
    'La cola está vacía. Añade encargos y se harán esta noche (o pulsa «Empezar ahora»).': 'The queue is empty. Add jobs and they will be done tonight (or press "Start now").',
    'Cuando termine un turno, aquí tendrás el informe de la mañana con su vídeo.': 'When a shift ends, its morning report and video will be here.', 'Espera tu permiso': 'Waiting for your permission',
    'Aprobado: vuelve a la cola': 'Approved: back to the queue', 'Vuelve a la cola': 'Back to the queue', 'Hecho': 'Done', 'listo': 'done', 'cancelado': 'cancelled', 'Pendiente': 'Pending', 'Necesito que decidas': 'I need you to decide', 'En cola': 'Queued',
    // ===== main.js (bandeja, diálogos, avisos) =====
    'Tienes la última versión.': 'You have the latest version.', 'Esta es una copia de desarrollo (git): actualízala con git pull.': 'This is a development copy (git): update it with git pull.',
    'No sé qué versión tienes: reinstala con el comando de una línea para recibir avisos.': "I don't know which version you have: reinstall with the one-line command to get notices.", 'No pude consultar GitHub: {x}': "Couldn't check GitHub: {x}", 'Actualizaciones': 'Updates',
    'No pude abrir el puerto {p}: {e}': "Couldn't open port {p}: {e}", 'Conecta un modelo para hablar conmigo': 'Connect a model to talk to me',
    'Ahora mismo no tengo ningún modelo de IA disponible. Lo más fácil:\n• **¿Pagas ChatGPT?** Bandeja → **Conectar ChatGPT**.\n• **¿Tienes Claude?** Instala Claude Code y ya está.\n• **Gratis:** una key de Gemini (aistudio.google.com) en Panel → Modelos.': "Right now I don't have any AI model available. The easiest options:\n• **Paying for ChatGPT?** Tray → **Connect ChatGPT**.\n• **Have Claude?** Install Claude Code and you're done.\n• **Free:** a Gemini key (aistudio.google.com) in Panel → Models.",
    'Para hablar conmigo necesito un modelo. Si pagas ChatGPT, pulsa Conectar ChatGPT en la bandeja.': 'To talk to me I need a model. If you pay for ChatGPT, click Connect ChatGPT in the tray.',
    'Tomo el control del ratón y teclado:': "I'm taking control of the mouse and keyboard:", 'Control devuelto:': 'Control returned:', 'Control del PC': 'PC control',
    'Hooks instalados.': 'Hooks installed.', 'Copia de seguridad:': 'Backup:', '(no había settings.json)': '(there was no settings.json)', 'Abre una sesión nueva de Claude Code para que los use.': 'Open a new Claude Code session so it uses them.', 'Hooks quitados.': 'Hooks removed.',
    'Hooks de Gemini CLI instalados.': 'Gemini CLI hooks installed.', 'Hooks de Gemini CLI quitados.': 'Gemini CLI hooks removed.', 'Abre una sesión nueva de Gemini CLI. Puedes comprobarlos con /hooks.': 'Open a new Gemini CLI session. You can check them with /hooks.',
    '✓ Hooks de Claude Code instalados': '✓ Claude Code hooks installed', 'Hooks NO instalados': 'Hooks NOT installed', 'Instalar hooks': 'Install hooks', 'Quitar hooks': 'Remove hooks', '✓ Hooks de Gemini CLI instalados': '✓ Gemini CLI hooks installed',
    'Gemini CLI: hooks no instalados': 'Gemini CLI: hooks not installed', '(CLI no encontrado)': '(CLI not found)', 'Quitar hooks de Gemini CLI': 'Remove Gemini CLI hooks', 'Instalar hooks de Gemini CLI': 'Install Gemini CLI hooks', 'Buscar actualizaciones': 'Check for updates',
    'Iniciar con Windows': 'Start with Windows', 'isla': 'island', 'Abrir panel de control': 'Open control panel', 'Conectar ChatGPT (tu plan, sin API key)': 'Connect ChatGPT (your plan, no API key)', 'Copiar token para la extensión del navegador': 'Copy token for the browser extension',
    'Abrir carpeta de la extensión': 'Open the extension folder', 'Configurar modelos (abrir config del núcleo)…': 'Configure models (open core config)…', 'Configurar Discord (abrir archivo)…': 'Configure Discord (open file)…', 'Reconectar Discord': 'Reconnect Discord',
    'Resumen del día ahora': 'Daily summary now', 'en pausa (cerca del límite del plan)': 'paused (near the plan limit)', 'Enviarme un aviso de prueba': 'Send me a test notice', '🤖 **Prueba:** así te llegarán los avisos del Robot Companion.': "🤖 **Test:** this is how Robot Companion's notices will reach you.",
    'Avisos de DMs': 'DM notices', 'Reglas "Permitir siempre" ({n})': '"Always allow" rules ({n})', 'quitar': 'remove', 'Quitar todas': 'Remove all', '(ninguna)': '(none)', 'Mover isla fuera del monitor principal': 'Move the island off the main monitor',
    'Volver la isla al monitor principal': 'Move the island back to the main monitor', 'Evento de prueba': 'Test event', 'Herramientas de desarrollo': 'Developer tools', 'Salir': 'Quit',
  };
  Object.assign(I18N_DIC.en, I18N_EN);

  if (typeof module !== 'undefined' && module.exports) module.exports = I18N;
  else {
    raiz.I18N = I18N; raiz.tr = tr;
    if (typeof raiz.t === 'undefined') raiz.t = tr;    // alias pedido: t('clave', {vars}); en el código usamos tr (hay muchas variables locales "t")
    // idioma inicial: el guardado en este navegador (rc.idioma) o el del sistema; el del núcleo (config.idioma) se aplica al arrancar
    let guardado = '';
    try { guardado = JSON.parse(localStorage.getItem('rc.idioma') || '""') || localStorage.getItem('robot-idioma') || ''; } catch { }
    poner(guardado || delSistema());
  }
})(typeof window !== 'undefined' ? window : globalThis);
