// Stream (#/stream): APOLO co-host de streaming. Conectar Twitch/YouTube, URL del overlay para OBS con vista previa,
// cerebro (modelo, frecuencia, personalidad, ficha pública), comentarista de juego, encuestas, moderación y registro.
// Datos: GET /v1/stream; en vivo, eventos 'stream' del SSE global. Globales con prefijo ST_. Traducciones aquí mismo.

P.emision = '<circle cx="12" cy="12" r="2.2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>';
NAV_APP.splice(4, 0, ['stream', 'Stream', 'emision']);

Object.assign(I18N.dic.en, {
  'Stream': 'Stream',
  'APOLO como co-host de tu directo: lee el chat de Twitch y YouTube, contesta con su voz, reacciona a subs y raids y sale en OBS como overlay. El chat es NO CONFIABLE: nunca ejecuta nada ni ve tu memoria.': 'APOLO as your live co-host: reads Twitch and YouTube chat, answers with its voice, reacts to subs and raids and shows up in OBS as an overlay. Chat is UNTRUSTED: it never runs anything or sees your memory.',
  'Que se calle': 'Shut up', 'Que hable': 'Let it talk', 'Pánico': 'Panic', 'Reanudar': 'Resume',
  'PÁNICO: APOLO está en silencio total y el overlay vacío.': 'PANIC: APOLO is fully silent and the overlay is empty.', 'APOLO está callado (sigue leyendo y moderando).': 'APOLO is muted (still reading and moderating).',
  'Plataformas': 'Platforms', 'Canal': 'Channel', 'Conectar': 'Connect', 'Desconectar': 'Disconnect', 'conectado': 'connected', 'conectando': 'connecting', 'desconectado': 'disconnected', 'error': 'error', 'no disponible': 'not available',
  'Escribir en el chat (opcional)': 'Write in chat (optional)', 'Usuario del bot': 'Bot username', 'OAuth del bot': 'Bot OAuth', 'Guardar': 'Save', 'Guardado': 'Saved',
  'Leer es anónimo (no hace falta cuenta). Para que conteste por escrito, crea una cuenta para el bot y pega su token OAuth (chat:read chat:edit). Guía en docs/stream.md.': 'Reading is anonymous (no account needed). To let it reply in writing, create a bot account and paste its OAuth token (chat:read chat:edit). Guide in docs/stream.md.',
  'URL o ID del directo': 'Live URL or ID', 'API key (leer)': 'API key (read)', 'Token OAuth (leer y escribir)': 'OAuth token (read and write)', 'Sondeo (s)': 'Polling (s)',
  'Cuota de YouTube: 10 000 unidades/día; cada lectura del chat gasta ~5. Con 15 s son ~1200/hora.': 'YouTube quota: 10,000 units/day; each chat read costs ~5. At 15 s that is ~1,200/hour.', 'unidades usadas': 'units used',
  'TikTok Live no tiene API oficial. El conector quedará como plugin opcional (pendiente).': 'TikTok Live has no official API. The connector will be an optional plugin (pending).', 'guardado': 'saved',
  'Overlay para OBS': 'OBS overlay', 'Horizontal 1920×1080': 'Landscape 1920×1080', 'Vertical 1080×1920': 'Portrait 1080×1920', 'Copiar': 'Copy', 'Nueva clave': 'New key',
  'La URL lleva una clave de SOLO LECTURA del overlay (no es tu token). Si se filtra, pulsa «Nueva clave» y vuelve a pegarla en OBS.': 'The URL carries a READ-ONLY overlay key (not your token). If it leaks, press "New key" and paste it into OBS again.',
  'Cómo añadirlo en OBS': 'How to add it in OBS',
  'En OBS: Fuentes → + → Navegador (Browser).': 'In OBS: Sources → + → Browser.', 'Pega la URL. Ancho 1920 y alto 1080 (o 1080 × 1920 para vertical).': 'Paste the URL. Width 1920 and height 1080 (or 1080 × 1920 for portrait).',
  'Marca «Controlar audio mediante OBS» para que su voz vaya al directo.': 'Tick "Control audio via OBS" so its voice goes to the stream.', 'Deja el CSS personalizado por defecto (fondo transparente). Pon la fuente encima del juego.': 'Leave the default custom CSS (transparent background). Put the source above the game.',
  'Si el robot no se ve: Ajustes de OBS → Avanzado → activa la aceleración por hardware de las fuentes de navegador.': 'If the robot does not show: OBS Settings → Advanced → enable browser source hardware acceleration.',
  'Bocadillo': 'Speech bubble', 'Subtítulos': 'Subtitles', 'Alertas': 'Alerts', 'Lo que hace el agente': 'What the agent is doing', 'Robot 3D': '3D robot', 'Color': 'Color',
  'Solo el nombre de la herramienta (p. ej. «Terminal»), nunca su contenido.': 'Only the tool name (e.g. "Terminal"), never its content.',
  'Vista previa': 'Preview', 'En vivo': 'Live', 'Demo': 'Demo', 'Fondo de juego': 'Game background', 'Probar': 'Test', 'Di algo…': 'Say something…', 'Decir': 'Say', 'Alerta de prueba': 'Test alert', 'Gestos': 'Gestures',
  'Cerebro': 'Brain', 'Modelo': 'Model', 'Responde como mucho cada (s)': 'Replies at most every (s)', 'A la misma persona cada (s)': 'Same person every (s)',
  'Comentar el chat general': 'Comment on general chat', 'Además de !apolo, de vez en cuando comenta algo del chat.': 'Besides !apolo, now and then it comments on chat.',
  'Hablar con voz': 'Speak with voice', 'Con la voz de la isla (Fish Audio o edge-tts). Necesita la app de escritorio.': 'With the island voice (Fish Audio or edge-tts). Needs the desktop app.',
  'Contestar también por escrito': 'Also reply in writing', 'Necesita el OAuth del bot.': 'Needs the bot OAuth.', 'Agradecer subs, raids y donaciones': 'Thank subs, raids and donations',
  'Personalidad': 'Personality', 'Ficha pública del stream': 'Public stream sheet', 'Lo ÚNICO que sabe de ti en directo: juego, horario, redes… Nada privado.': 'The ONLY thing it knows about you on stream: game, schedule, socials… Nothing private.',
  'Palabras bloqueadas (separadas por comas)': 'Blocked words (comma separated)', 'Ej.: Juego: Elden Ring · Directos L-V 20:00 · Discord en el panel': 'E.g.: Game: Elden Ring · Live Mon-Fri 8pm · Discord in the panel',
  'Comentarista de juego': 'Game commentator', 'Con un juego a pantalla completa, cada N minutos mira la pantalla con un modelo de visión local y lo comenta. Opcional.': 'With a full-screen game, every N minutes it looks at the screen with a local vision model and comments. Optional.',
  'Activado': 'Enabled', 'Cada (min)': 'Every (min)', 'Modelo de visión': 'Vision model', 'Comentar ahora': 'Comment now', 'Pantalla completa': 'Full screen', 'no': 'no',
  'Encuesta': 'Poll', 'Pregunta': 'Question', 'Opciones (una por línea)': 'Options (one per line)', 'Duración (s)': 'Duration (s)', 'Empezar': 'Start', 'Terminar': 'End', 'votos': 'votes',
  'El chat vota con !voto 1, 2, 3… (o solo el número). Los mods pueden lanzar una con !encuesta pregunta | a | b.': 'Chat votes with !vote 1, 2, 3… (or just the number). Mods can start one with !encuesta question | a | b.',
  'Moderación': 'Moderation', 'Todos': 'All', 'Preguntas': 'Questions', 'Filtrados': 'Filtered', 'Responder': 'Reply', 'Silenciar': 'Mute', 'Quitar silencio': 'Unmute', 'Silenciados': 'Muted',
  'Aún no hay mensajes. Conecta un canal o simula uno.': 'No messages yet. Connect a channel or simulate one.', 'Simular mensaje': 'Simulate message', 'usuario': 'user', 'mensaje del chat': 'chat message',
  'pregunta': 'question', 'respondido': 'answered', 'filtrado': 'filtered', 'silenciado': 'muted', 'oculto': 'hidden', 'gesto': 'gesture', 'inyeccion': 'injection', 'odio': 'hate', 'spam': 'spam', 'enlace': 'link',
  'Registro': 'Log', 'Nada todavía.': 'Nothing yet.', 'Comandos del chat': 'Chat commands',
  '!apolo <pregunta> · !gesto <nombre> · !voto <n> · mods: !callate, !habla, !encuesta': '!apolo <question> · !gesto <name> · !vote <n> · mods: !callate, !habla, !encuesta',
  'Próxima respuesta en {s} s': 'Next reply in {s} s', 'Lista para responder': 'Ready to reply', '{n} overlays conectados': '{n} overlays connected', 'Voz no disponible (abre la app de escritorio)': 'Voice not available (open the desktop app)',
  'Clave nueva: vuelve a pegar la URL en OBS': 'New key: paste the URL into OBS again', 'Silencio total activado': 'Full silence on',
});

const ST_ESTADO_CON = { conectado: 'ok', conectando: 'aviso vivo', desconectado: '', error: 'mal', 'no disponible': '' };
const ST_ESTILO = `
.st-dos { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .st-dos { grid-template-columns: 1fr; } }
.st-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.st-banda { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--radio); margin-bottom: 16px; border: 1px solid var(--borde); background: var(--capa); }
.st-banda.mal { border-color: color-mix(in srgb, var(--mal) 60%, transparent); background: color-mix(in srgb, var(--mal) 10%, var(--capa)); color: var(--mal); font-weight: 600; }
.st-banda.aviso { border-color: color-mix(in srgb, var(--aviso) 50%, transparent); }
.st-plat { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--borde); }
.st-plat:first-child { border-top: 0; padding-top: 0; }
.st-plat .tit { display: flex; align-items: center; gap: 8px; font-weight: 650; }
.st-plat .tit small { font-weight: 400; color: var(--txt-3); margin-left: auto; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
.st-fila { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .st-fila > input { flex: 1; min-width: 140px; }
.st-plat details summary { cursor: pointer; color: var(--txt-2); font-size: 12px; }
.st-ayuda { color: var(--txt-3); font-size: 12px; margin: 0; }
.st-url { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; } .st-url input { flex: 1; font-family: ui-monospace, monospace; font-size: 11.5px; } .st-url b { width: 150px; flex: none; font-size: 12px; font-weight: 600; }
.st-pasos { margin: 6px 0 0; padding-left: 20px; color: var(--txt-2); font-size: 12.5px; } .st-pasos li { margin: 3px 0; }
.st-prev { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radio-s); overflow: hidden; background: repeating-conic-gradient(#1a1f25 0 25%, #232a31 0 50%) 0 0 / 22px 22px; border: 1px solid var(--borde); }
.st-prev.vertical { aspect-ratio: 9 / 16; max-height: 560px; width: auto; margin: 0 auto; }
.st-prev iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; background: transparent; }
.st-gestos { display: flex; flex-wrap: wrap; gap: 6px; } .st-gestos button { font-size: 12px; padding: 3px 9px; }
.st-campos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .st-campos label, .st-bloque label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--txt-2); }
.st-bloque { display: flex; flex-direction: column; gap: 10px; padding-top: 10px; } .st-bloque textarea { resize: vertical; min-height: 64px; font: inherit; }
.st-cola { max-height: 460px; overflow: auto; display: flex; flex-direction: column; }
.st-msg { display: flex; gap: 8px; align-items: flex-start; padding: 7px 4px; border-top: 1px solid var(--borde); font-size: 13px; }
.st-msg:first-child { border-top: 0; }
.st-msg .u { font-weight: 650; flex: none; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-msg .x { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--txt-1); }
.st-msg.filtrado .x, .st-msg.silenciado .x, .st-msg.oculto .x { color: var(--txt-3); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--txt-3) 60%, transparent); }
.st-msg .acc { display: none; gap: 4px; flex: none; } .st-msg:hover .acc { display: flex; } .st-msg .acc button { font-size: 11px; padding: 1px 7px; }
.st-reg { max-height: 260px; overflow: auto; font-family: ui-monospace, monospace; font-size: 11.5px; display: flex; flex-direction: column-reverse; }
.st-reg div { padding: 2px 0; color: var(--txt-2); } .st-reg .error { color: var(--mal); } .st-reg .aviso { color: var(--aviso); } .st-reg .ok { color: var(--txt-1); }
.st-enc .op { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-top: 6px; } .st-enc .bar { flex: 1; height: 8px; border-radius: 9px; background: var(--capa-3); overflow: hidden; } .st-enc .bar i { display: block; height: 100%; background: var(--acento); }
`;

VISTAS.stream = {
  d: null, v: null, filtro: 'todos', previa: { demo: true, fondo: true, formato: 'horizontal' },
  async pintar(v) {
    this.v = v;
    if (!document.getElementById('st-estilo')) { const s = document.createElement('style'); s.id = 'st-estilo'; s.textContent = ST_ESTILO; document.head.appendChild(s); }
    this.d = await api('GET', '/stream');
    const c = this.d.config;
    v.innerHTML = `<div class="pagina st">${cabecera('Stream', 'APOLO como co-host de tu directo: lee el chat de Twitch y YouTube, contesta con su voz, reacciona a subs y raids y sale en OBS como overlay. El chat es NO CONFIABLE: nunca ejecuta nada ni ve tu memoria.',
      `<button class="btn" id="stCallar"></button><button class="btn mal pri" id="stPanico">${ic('parar')}${tr('Pánico')}</button>`)}
      <div id="stBanda"></div>
      <div class="st-dos"><div class="st-col">
        <div class="tarjeta"><header>${ic('emision')}<span class="crece">${tr('Plataformas')}</span></header><div class="cuerpo" id="stPlat"></div></div>
        <div class="tarjeta"><header>${ic('monitor')}<span class="crece">${tr('Overlay para OBS')}</span><small class="tenue" id="stOverlays"></small></header><div class="cuerpo">
          <div id="stUrls"></div>
          <p class="st-ayuda">${tr('La URL lleva una clave de SOLO LECTURA del overlay (no es tu token). Si se filtra, pulsa «Nueva clave» y vuelve a pegarla en OBS.')}</p>
          <details style="margin-top:8px"><summary>${tr('Cómo añadirlo en OBS')}</summary><ol class="st-pasos">
            <li>${tr('En OBS: Fuentes → + → Navegador (Browser).')}</li><li>${tr('Pega la URL. Ancho 1920 y alto 1080 (o 1080 × 1920 para vertical).')}</li>
            <li>${tr('Marca «Controlar audio mediante OBS» para que su voz vaya al directo.')}</li><li>${tr('Deja el CSS personalizado por defecto (fondo transparente). Pon la fuente encima del juego.')}</li>
            <li>${tr('Si el robot no se ve: Ajustes de OBS → Avanzado → activa la aceleración por hardware de las fuentes de navegador.')}</li></ol></details>
          <div style="margin-top:6px">
            ${fila('Bocadillo', '', sw('ov:bocadillo', c.overlay.bocadillo))}${fila('Subtítulos', '', sw('ov:subtitulos', c.overlay.subtitulos))}${fila('Alertas', '', sw('ov:alertas', c.overlay.alertas))}
            ${fila('Lo que hace el agente', 'Solo el nombre de la herramienta (p. ej. «Terminal»), nunca su contenido.', sw('ov:agente', c.overlay.agente))}${fila('Robot 3D', '', sw('ov:robot', c.overlay.robot))}
            ${fila('Color', '', `<input type="color" id="stColor" value="${esc(c.overlay.color)}" style="width:44px;height:28px;padding:2px">`)}
          </div></div></div>
        <div class="tarjeta"><header>${ic('ojo')}<span class="crece">${tr('Vista previa')}</span>
          ${seg('pv-modo', [['demo', 'Demo'], ['vivo', 'En vivo']], this.previa.demo ? 'demo' : 'vivo')}${seg('pv-formato', [['horizontal', '16:9'], ['vertical', '9:16']], this.previa.formato)}</header><div class="cuerpo">
          <div class="st-prev" id="stPrev"></div>
          <div class="flex" style="margin-top:8px;gap:8px"><label class="flex" style="gap:6px;font-size:12px">${sw('pv-fondo', this.previa.fondo)}${tr('Fondo de juego')}</label></div>
          <div class="seccion" style="margin-top:14px">${tr('Probar')}</div>
          <div class="st-fila"><input id="stDecir" placeholder="${esc(tr('Di algo…'))}"><button class="btn" id="stDecirB">${ic('play')}${tr('Decir')}</button></div>
          <div class="st-fila" style="margin-top:8px"><span class="tenue" style="font-size:12px">${tr('Alerta de prueba')}</span>${['sub', 'regalo', 'raid', 'bits', 'donacion', 'seguidor'].map(t => `<button class="btn" data-alerta="${t}" style="font-size:12px;padding:3px 9px">${t}</button>`).join('')}</div>
          <div class="seccion" style="margin-top:12px">${tr('Gestos')}</div><div class="st-gestos">${this.d.gestosDisponibles.map(g => `<button class="btn" data-gesto="${g}">${esc(g)}</button>`).join('')}</div>
        </div></div>
      </div><div class="st-col">
        <div class="tarjeta"><header>${ic('chispa')}<span class="crece">${tr('Cerebro')}</span><small class="tenue" id="stFaltan"></small></header><div class="cuerpo">
          <div class="st-campos"><label>${tr('Modelo')}<input id="stModelo" list="stModelos" value="${esc(c.modelo)}"></label>
            <datalist id="stModelos">${['ollama/gemma4:31b-cloud', 'ollama/qwen3.6', ...Object.values(E.config?.alias || {})].filter((x, i, a) => a.indexOf(x) === i).map(a => `<option value="${esc(a)}">`).join('')}</datalist>
            <label>${tr('Responde como mucho cada (s)')}<input type="number" id="stCada" min="5" max="600" value="${c.cadaSeg}"></label>
            <label>${tr('A la misma persona cada (s)')}<input type="number" id="stPorU" min="0" max="3600" value="${c.porUsuarioSeg}"></label></div>
          <div style="margin:8px -16px 0">
            ${fila('Comentar el chat general', 'Además de !apolo, de vez en cuando comenta algo del chat.', sw('reaccionar', c.reaccionar))}
            ${fila('Hablar con voz', 'Con la voz de la isla (Fish Audio o edge-tts). Necesita la app de escritorio.', sw('voz', c.voz))}
            ${fila('Contestar también por escrito', 'Necesita el OAuth del bot.', sw('escribirEnChat', c.escribirEnChat))}
            ${fila('Agradecer subs, raids y donaciones', '', sw('agradecer', c.agradecer))}</div>
          <div class="st-bloque">
            <label>${tr('Personalidad')}<textarea id="stPers" rows="3">${esc(c.personalidad)}</textarea></label>
            <label>${tr('Ficha pública del stream')} <small class="tenue">${tr('Lo ÚNICO que sabe de ti en directo: juego, horario, redes… Nada privado.')}</small><textarea id="stFicha" rows="3" placeholder="${esc(tr('Ej.: Juego: Elden Ring · Directos L-V 20:00 · Discord en el panel'))}">${esc(c.ficha)}</textarea></label>
            <label>${tr('Palabras bloqueadas (separadas por comas)')}<input id="stBloq" value="${esc((c.bloqueadas || []).join(', '))}"></label>
            <div class="flex" style="justify-content:space-between"><small class="tenue">${tr('Comandos del chat')}: ${esc(tr('!apolo <pregunta> · !gesto <nombre> · !voto <n> · mods: !callate, !habla, !encuesta'))}</small><button class="btn pri" id="stGuardar">${tr('Guardar')}</button></div>
          </div></div></div>
        <div class="tarjeta"><header>${ic('monitor')}<span class="crece">${tr('Comentarista de juego')}</span><small class="tenue" id="stPant"></small></header><div class="cuerpo">
          <p class="st-ayuda">${tr('Con un juego a pantalla completa, cada N minutos mira la pantalla con un modelo de visión local y lo comenta. Opcional.')}</p>
          <div style="margin:4px -16px 0">${fila('Activado', '', sw('com:activo', c.comentarista.activo))}</div>
          <div class="st-campos"><label>${tr('Cada (min)')}<input type="number" id="stComMin" min="1" max="60" value="${c.comentarista.cadaMin}"></label><label>${tr('Modelo de visión')}<input id="stComMod" value="${esc(c.comentarista.modelo)}"></label></div>
          <div class="flex" style="justify-content:flex-end;margin-top:8px"><button class="btn" id="stComentar">${ic('ojo')}${tr('Comentar ahora')}</button></div></div></div>
        <div class="tarjeta"><header>${ic('lista')}<span class="crece">${tr('Encuesta')}</span></header><div class="cuerpo" id="stEnc"></div></div>
        <div class="tarjeta"><header>${ic('escudo')}<span class="crece">${tr('Moderación')}</span>${seg('filtro', [['todos', 'Todos'], ['preguntas', 'Preguntas'], ['filtrados', 'Filtrados']], this.filtro)}</header><div class="cuerpo">
          <div class="st-cola" id="stCola"></div>
          <div id="stSil" style="margin-top:8px"></div>
          <details style="margin-top:8px"><summary class="tenue" style="cursor:pointer;font-size:12px">${tr('Simular mensaje')}</summary>
            <div class="st-fila" style="margin-top:6px"><input id="stSimU" placeholder="${esc(tr('usuario'))}" style="max-width:130px;flex:none"><input id="stSimT" placeholder="${esc(tr('mensaje del chat'))}"><button class="btn" id="stSimB">${ic('chat')}</button></div></details>
        </div></div>
        <div class="tarjeta"><header>${ic('lista')}<span class="crece">${tr('Registro')}</span></header><div class="cuerpo"><div class="st-reg" id="stReg"></div></div></div>
      </div></div></div>`;
    this.pintarTodo();
    this.enlazar();
  },
  salir() { this.v = null; clearInterval(this.reloj); },
  pintarTodo() { this.pintarBanda(); this.pintarPlat(); this.pintarUrls(); this.pintarPrevia(); this.pintarEnc(); this.pintarCola(); this.pintarSil(); this.pintarReg(); this.pintarFaltan(); },
  url(formato, extra = '') { return `${location.origin}/stream/overlay?clave=${encodeURIComponent(this.d.clave)}${formato === 'vertical' ? '&formato=vertical' : ''}${extra}`; },
  pintarBanda() {
    const d = this.d, b = $('#stBanda'); if (!b) return;
    b.innerHTML = d.panico ? `<div class="st-banda mal">${ic('parar')}${tr('PÁNICO: APOLO está en silencio total y el overlay vacío.')}</div>` : d.callado ? `<div class="st-banda aviso">${ic('info')}${tr('APOLO está callado (sigue leyendo y moderando).')}</div>` : !d.voz && d.config.voz ? `<div class="st-banda">${ic('info')}<span class="tenue">${tr('Voz no disponible (abre la app de escritorio)')}</span></div>` : '';
    const cb = $('#stCallar'); cb.innerHTML = d.panico ? `${ic('play')}${tr('Reanudar')}` : d.callado ? `${ic('play')}${tr('Que hable')}` : `${ic('pausa')}${tr('Que se calle')}`;
    $('#stPanico').hidden = d.panico;
    const o = $('#stOverlays'); if (o) o.textContent = tr('{n} overlays conectados', { n: d.overlays });
  },
  pintarFaltan() { const f = $('#stFaltan'); if (f) f.textContent = this.d.faltan ? tr('Próxima respuesta en {s} s', { s: this.d.faltan }) : tr('Lista para responder'); const p = $('#stPant'); if (p) p.textContent = `${tr('Pantalla completa')}: ${this.d.pantalla?.completa ? esc(this.d.pantalla.proceso || '✓') : tr('no')}`; },
  pintarPlat() {
    const d = this.d, c = d.config, k = d.conexiones;
    const tit = (n, e) => `<div class="tit"><span class="punto ${ST_ESTADO_CON[e.estado] || ''}"></span>${n}<span class="chip">${esc(tr(e.estado))}</span><small>${esc(e.detalle || '')}</small></div>`;
    const btn = (p, on) => on ? `<button class="btn" data-desc="${p}">${tr('Desconectar')}</button>` : `<button class="btn pri" data-con="${p}">${tr('Conectar')}</button>`;
    $('#stPlat').innerHTML = `
      <div class="st-plat">${tit('Twitch', k.twitch)}
        <div class="st-fila"><input id="stTwCanal" placeholder="${esc(tr('Canal'))} (ibai, https://twitch.tv/…)" value="${esc(c.twitch.canal)}">${btn('twitch', k.twitch.activo)}</div>
        <details><summary>${tr('Escribir en el chat (opcional)')} ${d.secretos.twitchOauth ? `<span class="chip ok">OAuth ${tr('guardado')}</span>` : ''}</summary>
          <p class="st-ayuda" style="margin:6px 0">${tr('Leer es anónimo (no hace falta cuenta). Para que conteste por escrito, crea una cuenta para el bot y pega su token OAuth (chat:read chat:edit). Guía en docs/stream.md.')}</p>
          <div class="st-fila"><input id="stTwUser" placeholder="${esc(tr('Usuario del bot'))}" value="${esc(c.twitch.usuario)}"><input id="stTwOauth" type="password" autocomplete="off" placeholder="${esc(tr('OAuth del bot'))}${d.secretos.twitchOauth ? ' ••••••' : ''}"><button class="btn" id="stTwGuardar">${tr('Guardar')}</button></div></details></div>
      <div class="st-plat">${tit('YouTube', k.youtube)}
        <div class="st-fila"><input id="stYtVideo" placeholder="${esc(tr('URL o ID del directo'))}" value="${esc(c.youtube.video)}"><input id="stYtSeg" type="number" min="5" max="120" value="${c.youtube.minSeg}" title="${esc(tr('Sondeo (s)'))}" style="max-width:70px;flex:none">${btn('youtube', k.youtube.activo)}</div>
        <details><summary>${tr('API key (leer)')} / OAuth ${d.secretos.youtubeKey ? '<span class="chip ok">key ✓</span>' : ''} ${d.secretos.youtubeOauth ? '<span class="chip ok">OAuth ✓</span>' : ''}</summary>
          <div class="st-fila" style="margin-top:6px"><input id="stYtKey" type="password" autocomplete="off" placeholder="${esc(tr('API key (leer)'))}"><input id="stYtOauth" type="password" autocomplete="off" placeholder="${esc(tr('Token OAuth (leer y escribir)'))}"><button class="btn" id="stYtGuardar">${tr('Guardar')}</button></div>
          <p class="st-ayuda" style="margin-top:6px">${tr('Cuota de YouTube: 10 000 unidades/día; cada lectura del chat gasta ~5. Con 15 s son ~1200/hora.')}${k.youtube.unidades ? ` · ${k.youtube.unidades} ${tr('unidades usadas')}` : ''}</p></details></div>
      <div class="st-plat">${tit('TikTok Live', k.tiktok)}<p class="st-ayuda">${tr('TikTok Live no tiene API oficial. El conector quedará como plugin opcional (pendiente).')}</p></div>`;
  },
  pintarUrls() {
    $('#stUrls').innerHTML = [['horizontal', 'Horizontal 1920×1080'], ['vertical', 'Vertical 1080×1920']].map(([f, t]) => `<div class="st-url"><b>${tr(t)}</b><input readonly value="${esc(this.url(f))}"><button class="btn icono" data-copiar="${esc(this.url(f))}" title="${esc(tr('Copiar'))}">${ic('copiar')}</button></div>`).join('')
      + `<div class="flex" style="justify-content:flex-end"><button class="btn" id="stClave">${ic('llave')}${tr('Nueva clave')}</button></div>`;
  },
  pintarPrevia() {
    const caja = $('#stPrev'); if (!caja) return;
    const p = this.previa, vert = p.formato === 'vertical';
    caja.classList.toggle('vertical', vert);
    const W = vert ? 1080 : 1920, H = vert ? 1920 : 1080;
    const src = this.url(p.formato, (p.demo ? '&demo=1' : '') + (p.fondo ? '&fondo=juego' : ''));
    caja.innerHTML = `<iframe src="${esc(src)}" width="${W}" height="${H}" allow="autoplay" title="overlay"></iframe>`;
    const ajustar = () => { const f = caja.querySelector('iframe'); if (f) f.style.transform = `scale(${caja.clientWidth / W})`; };
    ajustar(); requestAnimationFrame(ajustar);
    if (!this.ro) { this.ro = new ResizeObserver(() => { const f = $('#stPrev iframe'); if (f) f.style.transform = `scale(${$('#stPrev').clientWidth / (+f.width)})`; }); }
    this.ro.disconnect(); this.ro.observe(caja);
  },
  pintarEnc() {
    const e = this.d.encuesta, caja = $('#stEnc'); if (!caja) return;
    if (e) {
      const total = e.opciones.reduce((s, o) => s + o.votos, 0);
      caja.innerHTML = `<div class="st-enc"><b>${esc(e.pregunta)}</b>${e.opciones.map((o, i) => `<div class="op"><span>${i + 1}. ${esc(o.texto)}</span><span class="bar"><i style="width:${total ? Math.round(o.votos / total * 100) : 0}%"></i></span><span class="tenue">${o.votos}</span></div>`).join('')}
        <div class="flex" style="justify-content:space-between;margin-top:10px"><small class="tenue">${total} ${tr('votos')}</small><button class="btn mal" id="stEncFin">${tr('Terminar')}</button></div></div>`;
      return;
    }
    caja.innerHTML = `<div class="st-bloque" style="padding-top:0"><label>${tr('Pregunta')}<input id="stEncP" placeholder="¿…?"></label><label>${tr('Opciones (una por línea)')}<textarea id="stEncO" rows="3"></textarea></label>
      <div class="flex" style="justify-content:space-between;gap:8px"><label style="flex-direction:row;align-items:center;gap:6px">${tr('Duración (s)')}<input type="number" id="stEncS" value="90" min="15" max="600" style="width:80px"></label><button class="btn pri" id="stEncIni">${tr('Empezar')}</button></div>
      <p class="st-ayuda">${tr('El chat vota con !voto 1, 2, 3… (o solo el número). Los mods pueden lanzar una con !encuesta pregunta | a | b.')}</p></div>`;
  },
  pintarCola() {
    const caja = $('#stCola'); if (!caja) return;
    const f = this.filtro;
    const l = this.d.cola.filter(m => f === 'todos' || (f === 'preguntas' ? m.estado === 'pregunta' || m.estado === 'respondido' : ['filtrado', 'silenciado', 'oculto'].includes(m.estado))).slice(-120).reverse();
    const chip = m => m.estado === 'ok' ? '' : `<span class="chip ${m.estado === 'filtrado' ? 'mal' : m.estado === 'respondido' ? 'ok' : m.estado === 'pregunta' ? 'acento' : ''}">${esc(tr(m.estado))}${m.motivo ? ' · ' + esc(tr(m.motivo)) : ''}</span>`;
    caja.innerHTML = l.length ? l.map(m => `<div class="st-msg ${esc(m.estado)}" data-id="${esc(m.id)}"><span class="u" style="${m.color ? `color:${esc(m.color)}` : ''}" title="${esc(m.plataforma)}">${esc(m.usuario)}</span><span class="x">${esc(m.texto)} ${chip(m)}</span>
      <span class="acc">${['ok', 'pregunta'].includes(m.estado) ? `<button class="btn" data-resp="${esc(m.id)}">${tr('Responder')}</button>` : ''}<button class="btn mal" data-sil="${esc(m.login)}">${tr('Silenciar')}</button></span></div>`).join('')
      : `<div class="tenue" style="padding:10px;font-size:12px">${tr('Aún no hay mensajes. Conecta un canal o simula uno.')}</div>`;
  },
  pintarSil() {
    const s = this.d.silenciados, caja = $('#stSil'); if (!caja) return;
    caja.innerHTML = s.length ? `<small class="tenue">${tr('Silenciados')}:</small> ${s.map(l => `<span class="chip">${esc(l)} <a href="#" data-desil="${esc(l)}" title="${esc(tr('Quitar silencio'))}">×</a></span>`).join(' ')}` : '';
  },
  pintarReg() {
    const caja = $('#stReg'); if (!caja) return;
    caja.innerHTML = this.d.registro.length ? this.d.registro.slice(-150).map(l => `<div class="${esc(l.nivel)}">${new Date(l.t).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${esc(l.texto)}</div>`).reverse().join('') : `<div class="tenue">${tr('Nada todavía.')}</div>`;
  },
  async refrescar() { try { this.d = await api('GET', '/stream'); this.pintarBanda(); this.pintarPlat(); this.pintarEnc(); this.pintarCola(); this.pintarSil(); this.pintarReg(); this.pintarFaltan(); } catch { } },
  async llamar(M, ruta, cuerpo, ok) { try { const r = await api(M, '/stream' + ruta, cuerpo); if (r && r.config) { this.d = r; } if (ok) aviso(tr(ok)); return r; } catch (e) { aviso(e.message, true); } },
  enlazar() {
    const v = this.v;
    this.reloj = setInterval(() => { if (this.d.faltan > 0) { this.d.faltan--; this.pintarFaltan(); } }, 1000);
    $('#stCallar').onclick = async () => { if (this.d.panico) await this.llamar('POST', '/reanudar', {}); else await this.llamar('POST', '/callar', { callado: !this.d.callado }); this.pintarBanda(); };
    $('#stPanico').onclick = async () => { await this.llamar('POST', '/panico', {}, 'Silencio total activado'); this.pintarBanda(); this.pintarEnc(); };
    $('#stColor').onchange = e => this.llamar('PATCH', '/config', { overlay: { color: e.target.value } }, 'Guardado');
    $('#stDecirB').onclick = () => { const t = $('#stDecir').value.trim(); if (t) this.llamar('POST', '/decir', { texto: t }).then(() => { $('#stDecir').value = ''; }); };
    $('#stDecir').onkeydown = e => { if (e.key === 'Enter') $('#stDecirB').click(); };
    $('#stGuardar').onclick = () => this.llamar('PATCH', '/config', { modelo: $('#stModelo').value.trim(), cadaSeg: +$('#stCada').value, porUsuarioSeg: +$('#stPorU').value, personalidad: $('#stPers').value, ficha: $('#stFicha').value,
      bloqueadas: $('#stBloq').value.split(',').map(s => s.trim()).filter(Boolean) }, 'Guardado');
    $('#stComMin').onchange = e => this.llamar('PATCH', '/config', { comentarista: { cadaMin: +e.target.value } }, 'Guardado');
    $('#stComMod').onchange = e => this.llamar('PATCH', '/config', { comentarista: { modelo: e.target.value.trim() } }, 'Guardado');
    $('#stComentar').onclick = async () => { const r = await this.llamar('POST', '/comentar', {}); if (r && !r.ok) aviso(r.motivo || 'no', true); };
    $('#stSimB').onclick = () => { const t = $('#stSimT').value.trim(); if (t) this.llamar('POST', '/simular', { usuario: $('#stSimU').value.trim() || 'tester', texto: t }).then(() => { $('#stSimT').value = ''; }); };
    $('#stSimT').onkeydown = e => { if (e.key === 'Enter') $('#stSimB').click(); };
    enlazarControles(v, (id, val) => {
      if (id.startsWith('ov:')) return this.llamar('PATCH', '/config', { overlay: { [id.slice(3)]: val } }, 'Guardado');
      if (id === 'com:activo') return this.llamar('PATCH', '/config', { comentarista: { activo: val } }, 'Guardado');
      if (['reaccionar', 'voz', 'escribirEnChat', 'agradecer'].includes(id)) return this.llamar('PATCH', '/config', { [id]: val }, 'Guardado');
      if (id === 'pv-modo') { this.previa.demo = val === 'demo'; return this.pintarPrevia(); }
      if (id === 'pv-formato') { this.previa.formato = val; return this.pintarPrevia(); }
      if (id === 'pv-fondo') { this.previa.fondo = val; return this.pintarPrevia(); }
      if (id === 'filtro') { this.filtro = val; return this.pintarCola(); }
    });
    v.addEventListener('click', async e => {
      const t = e.target.closest('button, a'); if (!t) return;
      if (t.dataset.con) {
        const p = t.dataset.con;
        const b = p === 'twitch' ? { plataforma: p, canal: $('#stTwCanal').value.trim() } : { plataforma: p, video: $('#stYtVideo').value.trim(), minSeg: +$('#stYtSeg').value };
        if (await this.llamar('POST', '/conectar', b)) this.pintarPlat();
      } else if (t.dataset.desc) { if (await this.llamar('POST', '/desconectar', { plataforma: t.dataset.desc })) this.pintarPlat(); }
      else if (t.id === 'stTwGuardar') {
        const o = $('#stTwOauth').value.trim();
        await this.llamar('POST', '/secretos', o ? { twitchOauth: o } : {});
        try { await api('POST', '/stream/conectar', { plataforma: 'twitch', canal: $('#stTwCanal').value.trim(), usuario: $('#stTwUser').value.trim() }); aviso(tr('Guardado')); } catch (x) { aviso(x.message, true); }
        this.refrescar();
      } else if (t.id === 'stYtGuardar') {
        const b = {}; const k = $('#stYtKey').value.trim(), o = $('#stYtOauth').value.trim(); if (k) b.youtubeKey = k; if (o) b.youtubeOauth = o;
        await this.llamar('POST', '/secretos', b, 'Guardado'); this.pintarPlat();
      } else if (t.id === 'stClave') { await this.llamar('POST', '/clave', {}, 'Clave nueva: vuelve a pegar la URL en OBS'); this.pintarUrls(); this.pintarPrevia(); }
      else if (t.dataset.alerta) this.llamar('POST', '/alerta', { tipo: t.dataset.alerta });
      else if (t.dataset.gesto) this.llamar('POST', '/gesto', { gesto: t.dataset.gesto });
      else if (t.dataset.resp) { t.disabled = true; await this.llamar('POST', `/mensajes/${encodeURIComponent(t.dataset.resp)}/responder`, {}); t.disabled = false; }
      else if (t.dataset.sil) { await this.llamar('POST', '/silenciar', { login: t.dataset.sil }); this.pintarCola(); this.pintarSil(); }
      else if (t.dataset.desil) { e.preventDefault(); await this.llamar('POST', '/silenciar', { login: t.dataset.desil, silenciar: false }); this.pintarSil(); }
      else if (t.id === 'stEncIni') {
        const ops = $('#stEncO').value.split('\n').map(s => s.trim()).filter(Boolean);
        const r = await this.llamar('POST', '/encuesta', { pregunta: $('#stEncP').value.trim(), opciones: ops, segundos: +$('#stEncS').value });
        if (r) { this.d.encuesta = r.encuesta; this.pintarEnc(); }
      } else if (t.id === 'stEncFin') { await this.llamar('DELETE', '/encuesta'); this.d.encuesta = null; this.pintarEnc(); }
    });
  },
  alEvento(e) {
    if (e.tipo !== 'stream' || !this.v || !this.d) return;
    const d = this.d;
    if (e.sub === 'chat') { d.cola.push(...e.mensajes); if (d.cola.length > 300) d.cola.splice(0, d.cola.length - 300); clearTimeout(this.tCola); this.tCola = setTimeout(() => this.pintarCola(), 250); }
    else if (e.sub === 'registro') { d.registro.push(e.linea); if (d.registro.length > 300) d.registro.shift(); this.pintarReg(); }
    else if (e.sub === 'estado-msg') { const m = d.cola.find(x => x.id === e.id); if (m) { m.estado = e.estado; this.pintarCola(); } }
    else if (e.sub === 'encuesta') { d.encuesta = e.encuesta; if (!document.activeElement?.closest?.('#stEnc')) this.pintarEnc(); }
    else if (e.sub === 'dicho') { d.faltan = d.config.cadaSeg; this.pintarFaltan(); }
    else if (e.sub === 'pantalla') { d.pantalla = e.pantalla; this.pintarFaltan(); }
    else if (e.sub === 'conexion' || e.sub === 'estado') { clearTimeout(this.tRef); this.tRef = setTimeout(() => this.refrescar(), 300); }
  },
};
