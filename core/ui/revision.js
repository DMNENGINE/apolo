// Revisión de clips (#/revision): lo que el editor automático por lotes (core/craft/lotes.js) dejó editado. Cada clip se ve
// en su reproductor con el gancho, el estilo, las escenas, el chat de ese momento y las frases en las que Whisper dudó;
// el usuario decide Aprobar (→ carpeta aprobados) / Otro estilo (se rehace) / Descartar. Globales con prefijo RV_.
P.clip = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>';
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'reuniones'), 0, ['revision', 'Revisión', 'clip']);

Object.assign(I18N.dic.en, {
  'Revisión': 'Review', 'Clips editados solos a partir de tus streams. Míralos y decide: aprobar, otro estilo o descartar. Nada se publica sin tu aprobación.': 'Clips edited automatically from your streams. Watch them and decide: approve, another style or discard. Nothing is published without your approval.',
  'Buscar clips ahora': 'Look for clips now', 'Por revisar': 'To review', 'Aprobados': 'Approved', 'Descartados': 'Discarded', 'Todos': 'All',
  'Aprobar': 'Approve', 'Descartar': 'Discard', 'Otro estilo': 'Another style', 'Rehacer': 'Redo', 'Ver clip': 'Watch clip',
  'editando…': 'editing…', 'en cola': 'queued', 'revisar': 'to review', 'aprobado': 'approved', 'descartado': 'discarded', 'error': 'error',
  'Editando ahora': 'Editing now', '{n} en cola': '{n} queued', 'Whisper dudó en': 'Whisper was unsure about', 'Chat en ese momento': 'Chat at that moment',
  'Escenas': 'Scenes', 'Director': 'Director', 'ventanita': 'floating cam', 'sin diseños': 'no layouts', 'sonidos': 'sounds', 'No hay clips aquí.': 'No clips here.', 'Aún no hay fuentes configuradas.': 'No sources configured yet.', 'Buscando…': 'Looking…',
  '{n} clips nuevos': '{n} new clips', 'No hay streams nuevos': 'No new streams', 'Aprobado: está en la carpeta de aprobados': 'Approved: it is in the approved folder',
  'Se rehace con otro estilo': 'Being redone with another style', 'Descartado': 'Discarded',
  'Cambios y edición a mano': 'Changes and manual editing', 'Pedir cambio': 'Request change', 'Vibración de pantalla': 'Screen shake',
  'Quitarla': 'Remove it', 'Solo en un tramo': 'Only in a segment', 'En todo el clip (automática)': 'Whole clip (automatic)', 'de': 'from', 'a': 'to',
  'Intensidad': 'Intensity', '100 % = como está ahora': '100 % = as it is now', 'Aplicar': 'Apply', 'Línea de tiempo': 'Timeline',
  'Abrir en FilmCraft': 'Open in FilmCraft', 'Exportar lo retocado': 'Export the retouched version', 'retocado a mano': 'retouched by hand',
  'Se rehace con tus cambios': 'Being redone with your changes', 'Abriendo FilmCraft…': 'Opening FilmCraft…', 'Abierto en FilmCraft': 'Opened in FilmCraft',
  'Exportando lo retocado': 'Exporting the retouched version', 'Dale a ▶ primero': 'Press ▶ first', 'Pon desde y hasta (p. ej. 0:40 y 0:55)': 'Set from and to (e.g. 0:40 and 0:55)',
  'Escribe qué quieres cambiar': 'Write what you want to change', 'Entendiendo el pedido…': 'Understanding the request…', 'usar el momento del vídeo': 'use the video position',
  'Retoca y guarda (Ctrl+S) en FilmCraft, luego «Exportar lo retocado». Ojo: «Pedir cambio» y «Rehacer» montan el clip de nuevo y se pierde lo retocado a mano.':
    'Retouch and save (Ctrl+S) in FilmCraft, then “Export the retouched version”. Note: “Request change” and “Redo” rebuild the clip and manual retouches are lost.',
  'Ej.: que empiece con el trozo de 0:45 a 0:47 y luego el clip entero · quita la vibración menos de 0:40 a 0:55 · pon la cámara en ventanita de 0:30 a 0:40 · modo podcast de 1:00 a 1:15 · sin sonidos · dame otras ideas': 'E.g.: start with the 0:45–0:47 bit and then the whole clip · remove the shake except 0:40–0:55 · floating cam from 0:30 to 0:40 · podcast mode from 1:00 to 1:15 · no sounds · give me other ideas',
  'Dónde empieza y dónde termina': 'Where it starts and ends', 'Empieza en': 'Starts at', 'Termina en': 'Ends at', 'Clip entero': 'Whole clip',
  'Tiempos del vídeo tal como lo ves aquí': 'Times of the video as you see it here', 'Pon dónde empieza y dónde termina (p. ej. 0:00 y 1:37)': 'Set where it starts and ends (e.g. 0:00 and 1:37)',
  'Exportar en 4K': 'Export in 4K', '4K en cola': '4K queued', 'Reintentar 4K': 'Retry 4K', 'Exportando en 4K': 'Exporting in 4K',
  'recorte': 'trim', 'del original': 'of the original', 'recortando': 'trimming', 'quedan': 'left', 'lleva': 'running for', 'empezando': 'starting', 'transcribiendo': 'transcribing', 'eligiendo estilo': 'choosing style',
  'montando el avance': 'building the teaser', 'montando en FilmCraft': 'assembling in FilmCraft', 'cambios de escena': 'scene changes', 'vibración': 'shake',
  'subtítulos': 'subtitles', 'título, marca y emojis': 'title, brand and emojis', 'exportando': 'exporting', 'abriendo el proyecto': 'opening the project',
  'avance': 'teaser', 'al principio': 'at the start', 'Cambios': 'Changes', 'vibración': 'shake', 'quitada': 'removed', 'solo': 'only', 'al': 'at',
  'Calidad': 'Quality', 'todo bien': 'all good', '{n} error(es)': '{n} error(s)', '{n} aviso(s)': '{n} warning(s)', 'corregido solo': 'fixed automatically',
  'audio de estudio': 'studio audio', 'Portada': 'Cover', 'elige la que va con el vídeo': 'pick the one that goes with the video', 'Portada elegida': 'Cover selected',
  'Comentario en este momento del vídeo (p. ej.: el subtítulo dice Juan y es Chuy · sobra este emoji · sin zoom aquí · pon el nombre de Don Chuy)':
    'Comment at this moment of the video (e.g.: the subtitle says Juan but it is Chuy · this emoji is too much · no zoom here · show Don Chuy’s name)',
  '💬 En este momento': '💬 At this moment', 'Enviar {n} comentario(s)': 'Send {n} comment(s)', 'Escribe el comentario': 'Write the comment',
  'Se rehace con tus comentarios': 'Being redone with your comments', 'no encontré para corregir': 'could not find to fix', 'rótulos': 'lower thirds',
  'correcciones': 'corrections', 'emojis quitados': 'emojis removed', 'sin efectos': 'no effects', 'pico': 'peak',
  'sale': 'goes live', 'YouTube: sin cuota hoy, sigue mañana': 'YouTube: out of quota today, continues tomorrow', 'subtítulos EN': 'EN subtitles', 'versión EN': 'EN version', 'inglés: nada': 'English: nothing',
  'preparando': 'preparing', 'editando': 'editing', 'listo': 'done', 'subiendo': 'uploading', 'Títulos para redes': 'Titles for social media', 'Subir a YouTube': 'Upload to YouTube', 'Títulos es/en': 'ES/EN titles',
  'Enlace de su publicación (TikTok/YouTube) si no la encuentra': 'Link to its post (TikTok/YouTube) if it is not found',
  'Para que APOLO suba y programe los clips: en Google Cloud crea un proyecto, activa «YouTube Data API v3» y «YouTube Analytics API», crea un ID de cliente OAuth de tipo «App de escritorio» y pega aquí su JSON.':
    'For APOLO to upload and schedule clips: in Google Cloud create a project, enable “YouTube Data API v3” and “YouTube Analytics API”, create an OAuth client ID of type “Desktop app” and paste its JSON here.',
  'Guardar': 'Save', 'Conectar el canal de YouTube': 'Connect the YouTube channel', 'Esperando a que aceptes en el navegador…': 'Waiting for you to accept in the browser…',
  'Subir solo al aprobar': 'Upload automatically on approve', 'Programar a las mejores horas': 'Schedule at the best hours', 'Desconectar': 'Disconnect',
  'Estilos': 'Styles', 'Momentos': 'Moments', 'Diseños': 'Layouts', 'Horas': 'Hours', 'Mejores': 'Best', 'la media del canal': 'the channel average', 'con 5+ clips medidos ya decide estilos, títulos y horas': 'with 5+ measured clips it starts choosing styles, titles and hours',
  'Aún no hay clips publicados medidos. Mide una vez al día lo publicado en YouTube y TikTok y empareja cada publicación con su clip.': 'No published clips measured yet. Once a day it measures what was posted on YouTube and TikTok and matches each post with its clip.',
  'Publicación y aprendizaje': 'Publishing and learning', '{n} clips medidos': '{n} clips measured', 'diccionario': 'dictionary', 'Lo aprendido': 'What it learned', 'Midiendo…': 'Measuring…', 'Medir ahora': 'Measure now', 'última vez': 'last time',
  'Diccionario del canal': 'Channel dictionary', 'Lo que corriges en los subtítulos se aprende aquí y sale bien en los clips siguientes.': 'What you fix in the subtitles is learned here and comes out right in the next clips.',
  'como sale': 'as it comes out', 'como debe ser': 'as it should be', 'Añadir': 'Add', 'Reacción del chat': 'Chat reaction', 'risa': 'laughs', 'choque': 'crash', 'hype': 'hype', 'apoyo': 'support', 'charla': 'chat',
  'Activado': 'On', 'Desactivado': 'Off', 'Pega el JSON': 'Paste the JSON', 'Guardado': 'Saved', 'Acepta en el navegador que se abrió': 'Accept in the browser window that opened', 'Desconectado': 'Disconnected', 'Midiendo… (1–3 min)': 'Measuring… (1–3 min)',
  'Cargando Medal…': 'Loading Medal…', 'No encuentro Medal en este PC.': 'Medal is not installed on this PC.', 'Elegir de Medal': 'Pick from Medal', '{n} clips': '{n} clips',
  'Todos los juegos': 'All games', 'Buscar por título': 'Search by title', 'Más recientes': 'Newest', 'Más antiguos': 'Oldest', 'Más largos': 'Longest', 'Más vistos': 'Most viewed', 'Buscar': 'Search',
  'Formato': 'Format', 'Vertical, partida entera y fondo desenfocado': 'Vertical, whole game with blurred background', 'Vertical, zoom al centro': 'Vertical, zoom to the center', 'Horizontal, tal cual': 'Horizontal, as is',
  'Estilo': 'Style', 'Que elija APOLO': 'Let APOLO choose', 'Sin título': 'Untitled', 'Editar con APOLO': 'Edit with APOLO', 'No hay clips con eso.': 'No clips match.',
  'Trayendo el clip de Medal…': 'Fetching the clip from Medal…', 'APOLO lo está editando: sale en «Por revisar»': 'APOLO is editing it: it will show up in “To review”', 'recorte': 'trim', 'horizontal': 'horizontal', 'descargando': 'downloading',
  'Pon cómo sale y cómo debe ser': 'Write how it comes out and how it should be', 'Pega el enlace': 'Paste the link', 'En cola para YouTube': 'Queued for YouTube', 'Preparando títulos e inglés': 'Preparing titles and English', 'Vinculado: se mide en la próxima pasada': 'Linked: measured on the next pass',
});

const RV_ESTADO = { editando: ['aviso', 'editando…'], 'en cola': ['', 'en cola'], revisar: ['ok', 'revisar'], aprobado: ['ok', 'aprobado'], descartado: ['', 'descartado'], error: ['mal', 'error'] };
const RV_mmss = s => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}`) + `:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const RV_FILTROS = [['revisar', 'Por revisar'], ['aprobado', 'Aprobados'], ['descartado', 'Descartados'], ['todos', 'Todos']];
const RV_seg = v => { v = String(v || '').trim().replace(',', '.'); if (!v) return NaN; const p = v.split(':').map(Number); return p.reduce((a, x) => a * 60 + x, 0); };
function RV_ajustes(aj) {                                // resumen de los cambios pedidos, en corto
  if (!aj || !Object.keys(aj).length) return '';
  const tb = aj.temblor, out = [];
  if (tb === false) out.push(`${tr('vibración')} ${tr('quitada')}`);
  else if (tb) out.push(`${tr('vibración')}${tb.tramos ? ` ${tr('solo')} ${tb.tramos.map(([d, h]) => `${RV_mmss(d)}–${RV_mmss(h)}`).join(', ')}` : ''}${tb.intensidad != null ? ` ${tr('al')} ${tb.intensidad} %` : ''}`);
  if (Array.isArray(aj.avance)) out.push(`${tr('avance')} ${RV_mmss(aj.avance[0])}–${RV_mmss(aj.avance[1])} ${tr('al principio')}`);
  if (Array.isArray(aj.recorte)) out.push(`${tr('recorte')} ${RV_mmss(aj.recorte[0])}–${RV_mmss(aj.recorte[1])} ${tr('del original')}`);
  if (aj.estilo) out.push(`${tr('estilo')} ${aj.estilo}`);
  if (aj.colorSubs) out.push(tr('colores propios'));
  if (aj.emojis != null) out.push(aj.emojis ? tr('con emojis') : tr('sin emojis'));
  if (aj.banner === false) out.push(tr('sin banner'));
  if (aj.plataforma) out.push(`${tr('para')} ${aj.plataforma}`);
  if (aj.subtitulosFijos?.length) out.push(tr('subtítulos editados a mano ({n})', { n: aj.subtitulosFijos.length }));
  if (aj.correcciones?.length) out.push(`${tr('correcciones')}: ${aj.correcciones.map(x => `${x.mal} → ${x.bien}`).join(', ')}`);
  if (aj.rotulos?.length) out.push(`${tr('rótulos')}: ${aj.rotulos.map(x => `${x.nombre} ${RV_mmss(x.t)}`).join(', ')}`);
  if (aj.quitarEmojis?.length) out.push(`${tr('emojis quitados')}: ${aj.quitarEmojis.map(RV_mmss).join(', ')}`);
  if (aj.sinEfectos?.length) out.push(`${tr('sin efectos')}: ${aj.sinEfectos.map(([d, h]) => `${RV_mmss(d)}–${RV_mmss(h)}`).join(', ')}`);
  for (const [k, v] of Object.entries(aj)) if (!['temblor', 'avance', 'recorte', 'subtitulosFijos', 'estilo', 'colorSubs', 'emojis', 'banner', 'plataforma', 'correcciones', 'rotulos', 'quitarEmojis', 'sinEfectos'].includes(k)) out.push(`${k}: ${v === false ? 'no' : v === true ? 'sí' : Array.isArray(v) ? v.length : v}`);
  return out.join(' · ');
}
// control de calidad del clip: chip (OK / avisos / errores) y, desplegado, cada fallo con un enlace a su momento del vídeo
function RV_calidad(c) {
  const q = c.calidad; if (!q) return '';
  const med = q.medidas?.lufs != null ? ` · ${q.medidas.lufs.toFixed(1)} LUFS · ${tr('pico')} ${q.medidas.picoReal?.toFixed(1) ?? '—'} dBTP` : '';
  const chip = q.errores?.length ? `<span class="chip mal">${tr('Calidad')}: ${tr('{n} error(es)', { n: q.errores.length })}</span>`
    : q.avisos?.length ? `<span class="chip aviso">${tr('Calidad')}: ${tr('{n} aviso(s)', { n: q.avisos.length })}</span>` : `<span class="chip ok">${tr('Calidad')}: ${tr('todo bien')}</span>`;
  const items = [...(q.errores || []).map(x => ['mal', x]), ...(q.avisos || []).map(x => ['aviso', x])];
  const audio = c.audioPro ? `<span class="chip">🎧 ${tr('audio de estudio')}</span>` : '';
  const extra = `${q.arreglado?.length ? `<small class="tenue">${tr('corregido solo')}: ${esc(q.arreglado.join(', '))}</small>` : ''}${c.noCorregidas?.length ? `<small class="rv-error">${tr('no encontré para corregir')}: ${esc(c.noCorregidas.map(x => x.mal).join(', '))}</small>` : ''}`;
  if (!items.length) return `<div class="rv-calidad flex" style="gap:6px;flex-wrap:wrap;align-items:center">${chip}${audio}<small class="tenue">${esc(med.replace(/^ · /, ''))}</small>${extra}</div>`;
  return `<details class="rv-calidad"><summary>${chip}${audio}<small class="tenue">${esc(med.replace(/^ · /, ''))}</small></summary><ul>${items.map(([cls, x]) =>
    `<li class="${cls}">${x.s != null ? `<button class="rv-ir" data-a="ir" data-t="${x.s}">${RV_mmss(x.s)}</button> ` : ''}${esc(x.texto)}</li>`).join('')}</ul>${extra}</details>`;
}
// pestaña Estilo del editor: estilo de los subtítulos, colores propios, emojis, banner de arriba y la red para la que es el clip
const RV_REDES = [['', 'Todas'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['instagram', 'Instagram']];
const RV_COLORES = [['texto', 'Texto'], ['contorno', 'Contorno'], ['destacado', 'Palabras destacadas'], ['caja', 'Caja']];
function RV_estilo(c, estilos) {
  const aj = c.ajustes || {}, actual = aj.estilo || c.estilo, E = estilos.find(e => e.id === actual) || estilos[0] || { colores: {} };
  const propios = !!aj.colorSubs, col = { ...E.colores, ...(aj.colorSubs || {}) };
  const seg = (nombre, opciones, valor) => `<div class="rve-seg">${opciones.map(([v, t]) => `<label><input type="radio" name="${nombre}" value="${v}"${String(valor) === v ? ' checked' : ''}><span>${tr(t)}</span></label>`).join('')}</div>`;
  const punto = x => (x ? `<i style="background:${esc(x)}"></i>` : '');
  return `<div class="rve-estilo">
    <div class="rv-sub">${tr('Estilo de los subtítulos')}</div>
    <div class="rve-estilos">${estilos.map(e => `<label class="rve-est${e.id === actual ? ' on' : ''}" title="${esc(e.descripcion || '')}"><input type="radio" name="rve-est" value="${esc(e.id)}"${e.id === actual ? ' checked' : ''}>
      <span class="rve-puntos">${punto(e.colores?.texto)}${punto(e.colores?.contorno)}${punto(e.colores?.destacado)}</span><b>${esc(e.nombre)}</b></label>`).join('')}</div>
    <div class="rv-sub">${tr('Colores')}</div>
    <label class="rve-check"><input type="checkbox" class="rve-propios"${propios ? ' checked' : ''}> ${tr('Usar mis colores en vez de los del estilo')}</label>
    <div class="rve-colores"${propios ? '' : ' hidden'}>${RV_COLORES.map(([k, t]) => `<label class="rve-color" data-c="${k}"${k === 'caja' && !E.colores?.caja ? ' hidden' : ''}><input type="color" data-color="${k}" value="${esc(col[k] || '#ffffff')}"> ${tr(t)}</label>`).join('')}</div>
    <div class="rv-sub">${tr('Emojis')}</div>
    ${seg('rve-emojis', [['', 'Automático'], ['true', 'Sí'], ['false', 'No']], aj.emojis == null ? '' : String(aj.emojis))}
    <div class="rv-sub">${tr('Banner de arriba (nombre y redes)')}</div>
    ${seg('rve-banner', [['true', 'Con banner'], ['false', 'Sin banner']], String(aj.banner !== false))}
    <div class="rv-sub">${tr('¿Para qué red es este clip?')}</div>
    ${seg('rve-red', RV_REDES, aj.plataforma || '')}
    <small class="tenue">${tr('El banner lleva solo el logo de esa red (un logo de YouTube en un Reel de Facebook puede hundir el vídeo). «Todas» = los iconos de siempre.')}</small>
    <div class="rv-fila"><button class="btn pri" data-a="aplicarestilo">${tr('Aplicar y rehacer el vídeo')}</button></div>
  </div>`;
}
const RV_chipCalidad = c => { const q = c.calidad || {}; return q.errores?.length ? `<span class="chip mal">${tr('Calidad')}: ${tr('{n} error(es)', { n: q.errores.length })}</span>` : q.avisos?.length ? `<span class="chip aviso">${tr('Calidad')}: ${tr('{n} aviso(s)', { n: q.avisos.length })}</span>` : `<span class="chip ok">${tr('Calidad')}: ${tr('todo bien')}</span>`; };
// lo que se sabe de la edición: escenas, director, dudas de Whisper (con salto a su momento), chat, cambios pedidos, calidad
function RV_info(c, listo = true) {
  return `${c.escenas?.length ? `<small class="tenue">${tr('Escenas')}: ${c.escenas.map(s => `${esc(s.tipo)} ${RV_mmss(s.desde)}`).join(' · ')}${c.emojis ? ` · ${c.emojis} emojis` : ''}</small>` : ''}
    ${c.plan ? `<small class="tenue">🎬 ${tr('Director')}: ${(c.disenos || []).map(d => `${d.tipo === 'podcast' ? '🎙️ podcast' : '🪟 ' + tr('ventanita')} ${RV_mmss(d.desde)}–${RV_mmss(d.hasta)}`).join(' · ') || tr('sin diseños')}${c.sonidos ? ` · 🔊 ${c.sonidos} ${tr('sonidos')}` : ''}${(c.plan.emojis || []).length ? ` · ${c.plan.emojis.map(e => e.emoji).join('')}` : ''}</small>` : ''}
    ${c.dudas?.length ? `<div class="rv-dudas"><small>${tr('Whisper dudó en')}:</small> ${c.dudas.slice(0, 5).map(d => `<span><button class="rv-ir" data-a="ir" data-t="${d.s}">${RV_mmss(d.s)}</button> “${esc(d.texto)}”</span>`).join(' ')}</div>` : ''}
    ${c.chat?.length ? `<details class="rv-chat"><summary>${tr('Chat en ese momento')} (${c.chat.length})</summary>${c.chat.map(m => `<div>${esc(m)}</div>`).join('')}</details>` : ''}
    ${c.ajustes && Object.keys(c.ajustes).length ? `<div class="rv-ajustes">${tr('Cambios')}: ${esc(RV_ajustes(c.ajustes))}</div>` : ''}
    ${c.pedidos?.at(-1)?.respuesta ? `<div class="rv-respuesta">${esc(c.pedidos.at(-1).respuesta)}</div>` : ''}
    ${c.retocado ? `<span class="chip">${tr('retocado a mano')}</span>` : ''}
    ${listo ? RV_calidad(c) : ''}`;
}
// portadas hechas con PhotoCraft: la elegida va con el vídeo al aprobar y en el anuncio de Discord
function RV_portadas(c) {
  if (!c.portadas?.length) return '';
  const elegir = c.estado === 'revisar' || c.estado === 'aprobado' && c.portadas.length > 1;
  return `<div class="rv-portadas">${c.portadas.map((p, i) => `<button class="rv-portada${i === (c.portada || 0) ? ' si' : ''}" ${elegir ? `data-a="portada" data-i="${i}"` : 'disabled'} title="${esc(tr('Portada'))} ${i + 1}"><img alt="" data-portada="${esc(c.id)}" data-i="${i}"></button>`).join('')}
    ${c.portadas.length > 1 && c.estado === 'revisar' ? `<small>${tr('Portada')}: ${tr('elige la que va con el vídeo')}</small>` : ''}</div>`;
}
const RV_num = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0));
const RV_fecha = t => new Date(t).toLocaleString(I18N.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// lo que pasa con un aprobado después del 4K: Drive/Discord, YouTube (programado), títulos es/en, inglés y cómo le va
function RV_publicacion(c, L) {
  const p = c.publicado, y = c.youtube, en = c.en, m = c.metricas || {};
  const chips = [];
  if (p?.estado === 'listo') chips.push(`<span class="chip ok">Drive + Discord ✓</span>`);
  else if (p?.estado === 'subiendo' || p?.estado === 'en cola') chips.push(`<span class="chip aviso">Drive + Discord: ${esc(tr(p.estado))}</span>`);
  else if (p?.estado === 'error') chips.push(`<span class="chip mal" title="${esc(p.error || '')}">Drive + Discord: ${tr('error')}</span>`);
  if (y?.estado === 'listo') chips.push(`<a class="chip ok" href="${esc(y.url)}" target="_blank" rel="noopener">📺 YouTube ✓${y.publicarEn && y.publicarEn > Date.now() ? ` · ${tr('sale')} ${esc(RV_fecha(y.publicarEn))}` : ''}</a>`);
  else if (y?.estado === 'subiendo') chips.push(`<span class="chip aviso">📺 YouTube ${y.pct || 0} %</span>`);
  else if (y?.estado === 'en cola') chips.push(`<span class="chip">📺 YouTube: ${tr('en cola')}${y.publicarEn ? ` · ${esc(RV_fecha(y.publicarEn))}` : ''}</span>`);
  else if (y?.estado === 'esperando cuota') chips.push(`<span class="chip aviso" title="${esc(y.error || '')}">📺 ${tr('YouTube: sin cuota hoy, sigue mañana')}</span>`);
  else if (y?.estado === 'error') chips.push(`<span class="chip mal" title="${esc(y.error || '')}">📺 YouTube: ${tr('error')}</span>`);
  if (en?.estado === 'listo') chips.push(`<span class="chip${en.avisos?.length ? ' aviso' : ''}" title="${esc((en.avisos || []).join(' · '))}">🌎 ${en.srt ? tr('subtítulos EN') : ''}${en.mp4 ? ` + ${tr('versión EN')}` : ''}${!en.srt && !en.mp4 ? tr('inglés: nada') : ''}</span>`);
  else if (en?.estado) chips.push(`<span class="chip aviso">🌎 ${esc(tr(en.estado))}${en.pct ? ` ${en.pct} %` : ''}</span>`);
  const met = ['youtube', 'tiktok'].filter(k => m[k]).map(k => `<a href="${esc(m[k].url)}" target="_blank" rel="noopener" class="rv-met">${k === 'youtube' ? '📺' : '🎵'} 👁 ${RV_num(m[k].vistas)} · ❤ ${RV_num(m[k].likes)} · 💬 ${RV_num(m[k].comentarios)}${m[k].retencion != null ? ` · ⏱ ${m[k].retencion} %` : ''}</a>`).join('');
  const tx = c.textos ? `<details class="rv-textos"><summary>${tr('Títulos para redes')}</summary><div><b>ES</b> ${esc(c.textos.es?.titulo || '')}<br><small class="tenue">${esc(c.textos.es?.descripcion || '')}</small></div><div><b>EN</b> ${esc(c.textos.en?.titulo || '')}<br><small class="tenue">${esc(c.textos.en?.descripcion || '')}</small></div></details>` : '';
  const puedeYT = L?.youtube?.conectado && c.k4?.estado === 'listo' && !['listo', 'subiendo', 'en cola'].includes(y?.estado);
  return `<div class="rv-pub"><div class="flex" style="gap:6px;flex-wrap:wrap">${chips.join('')}</div>
    ${met ? `<div class="rv-mets">${met}</div>` : ''}${tx}
    <div class="rv-fila">${puedeYT ? `<button class="btn" data-a="youtube">📺 ${tr('Subir a YouTube')}</button>` : ''}${!c.textos && !['en cola', 'preparando', 'editando'].includes(en?.estado) ? `<button class="btn fantasma" data-a="redes">${tr('Títulos es/en')}</button>` : ''}
      <input type="text" class="rv-vurl" placeholder="${esc(tr('Enlace de su publicación (TikTok/YouTube) si no la encuentra'))}"><button class="btn fantasma" data-a="vincular">🔗</button></div></div>`;
}
// arriba de la lista: YouTube (conectar / subir solo), lo aprendido de las métricas y el diccionario del canal
function RV_panel(L, dic) {
  const y = L.youtube || {}, ap = L.aprendido;
  const yt = !y.configurado ? `<p class="tenue">${tr('Para que APOLO suba y programe los clips: en Google Cloud crea un proyecto, activa «YouTube Data API v3» y «YouTube Analytics API», crea un ID de cliente OAuth de tipo «App de escritorio» y pega aquí su JSON.')}</p>
      <textarea class="rv-ytjson" rows="3" placeholder='{"installed":{"client_id":"…","client_secret":"…"}}'></textarea><button class="btn" data-g="ytcliente">${tr('Guardar')}</button>`
    : !y.conectado ? `<button class="btn pri" data-g="ytconectar">📺 ${tr('Conectar el canal de YouTube')}</button>${y.conectando ? `<small class="tenue">${tr('Esperando a que aceptes en el navegador…')}</small>` : ''}`
      : `<div class="flex" style="gap:10px;flex-wrap:wrap;align-items:center"><span class="chip ok">📺 ${esc(y.canal?.titulo || 'YouTube')}</span>
        <label><input type="checkbox" class="rv-ytactivo" ${y.activo ? 'checked' : ''}> ${tr('Subir solo al aprobar')}</label>
        <label><input type="checkbox" class="rv-ytprog" ${y.programar !== false ? 'checked' : ''}> ${tr('Programar a las mejores horas')}</label>
        <button class="btn fantasma" data-g="ytdesconectar">${tr('Desconectar')}</button></div>`;
  const top = g => Object.entries(g || {}).filter(([, v]) => v.n >= 1).slice(0, 4).map(([k, v]) => `${esc(k)} <b>×${v.factor}</b> <small>(${v.n})</small>`).join(' · ') || '—';
  const apr = ap?.muestras ? `<div class="rv-apr"><div>${tr('Estilos')}: ${top(ap.estilos)}</div><div>${tr('Momentos')}: ${top(ap.momentos)}</div><div>${tr('Diseños')}: ${top(ap.disenos)}</div><div>${tr('Horas')}: ${top(ap.horas)}</div>
      ${ap.mejores?.length ? `<div>${tr('Mejores')}: ${ap.mejores.slice(0, 3).map(x => `“${esc(x.titulo || x.gancho || '')}” ${RV_num(x.vistas)}`).join(' · ')}</div>` : ''}<small class="tenue">×1 = ${tr('la media del canal')} · ${tr('con 5+ clips medidos ya decide estilos, títulos y horas')}</small></div>`
    : `<p class="tenue">${tr('Aún no hay clips publicados medidos. Mide una vez al día lo publicado en YouTube y TikTok y empareja cada publicación con su clip.')}</p>`;
  const dl = dic?.entradas || [];
  return `<details class="caja pad rv-panel"${RV_panelAbierto ? ' open' : ''}><summary><b>${tr('Publicación y aprendizaje')}</b> <small class="tenue">· YouTube ${y.conectado ? '✓' : '—'} · ${tr('{n} clips medidos', { n: ap?.muestras || 0 })} · ${tr('diccionario')}: ${dl.length}</small></summary>
    <h4>📺 YouTube</h4>${yt}
    <h4>📈 ${tr('Lo aprendido')} <button class="btn fantasma" data-g="medir" ${L.midiendo ? 'disabled' : ''}>${L.midiendo ? tr('Midiendo…') : tr('Medir ahora')}</button>${L.metricasEn ? ` <small class="tenue">${tr('última vez')}: ${esc(RV_fecha(L.metricasEn))}</small>` : ''}</h4>${apr}
    ${ap?.errores?.length ? `<small class="rv-error">${esc(ap.errores.join(' · '))}</small>` : ''}
    <h4>📖 ${tr('Diccionario del canal')}</h4><p class="tenue">${tr('Lo que corriges en los subtítulos se aprende aquí y sale bien en los clips siguientes.')}</p>
    <div class="rv-dic">${dl.map(x => `<span class="chip">${esc(x.mal)} → <b>${esc(x.bien)}</b> <button class="x" data-g="dicquitar" data-mal="${esc(x.mal)}">✕</button></span>`).join('') || `<small class="tenue">—</small>`}</div>
    <div class="rv-fila"><input type="text" class="rv-dmal" placeholder="${esc(tr('como sale'))}"><input type="text" class="rv-dbien" placeholder="${esc(tr('como debe ser'))}"><button class="btn" data-g="dicanadir">${tr('Añadir')}</button></div>
  </details>`;
}
let RV_panelAbierto = false;
// elegir un clip de Medal para que APOLO lo edite: filtros, formato, estilo y la rejilla con miniaturas
function RV_medal(M, estilos, f) {
  if (!M) return `<div class="caja pad rv-medal tenue">${tr('Cargando Medal…')}</div>`;
  if (!M.instalado && !M.clips.length) return `<div class="caja pad rv-medal">${tr('No encuentro Medal en este PC.')}</div>`;
  const ops = (l, v) => l.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<div class="caja pad rv-medal">
    <div class="flex rv-mcab"><b>🎮 ${tr('Elegir de Medal')}</b><small class="tenue">${tr('{n} clips', { n: M.total })}</small><button class="btn fantasma" data-m="cerrar">✕</button></div>
    <div class="rv-fila">
      <select class="rv-mjuego"><option value="">${tr('Todos los juegos')}</option>${ops(M.juegos.filter(j => j.clips).map(j => [j.juego, `${j.juego} (${j.clips})`]), f.juego)}</select>
      <input type="text" class="rv-mtexto" placeholder="${esc(tr('Buscar por título'))}" value="${esc(f.texto || '')}">
      <select class="rv-morden">${ops([['reciente', tr('Más recientes')], ['antiguo', tr('Más antiguos')], ['largo', tr('Más largos')], ['vistas', tr('Más vistos')]], f.orden || 'reciente')}</select>
      <button class="btn" data-m="filtrar">${tr('Buscar')}</button>
    </div>
    <div class="rv-fila">${tr('Formato')}: <select class="rv-mformato">${ops([['vertical', tr('Vertical, partida entera y fondo desenfocado')], ['recorte', tr('Vertical, zoom al centro')], ['horizontal', tr('Horizontal, tal cual')]], f.formato || 'vertical')}</select>
      ${tr('Estilo')}: <select class="rv-mestilo"><option value="">${tr('Que elija APOLO')}</option>${ops(estilos.map(e => [e.id, e.nombre]), f.estilo)}</select></div>
    <div class="rv-mrejilla">${M.clips.map(c => `<div class="rv-mclip">
      <div class="rv-mfoto"><img alt="" data-mini="${esc(c.id)}">${c.duracion ? `<span>${RV_mmss(c.duracion)}</span>` : ''}</div>
      <div class="rv-mtit" title="${esc(c.titulo)}">${esc(/^untitled/i.test(c.titulo) || !c.titulo ? tr('Sin título') : c.titulo)}</div>
      <small class="tenue">${esc(c.juego || '')} · ${c.fecha ? esc(RV_fecha(c.fecha)) : ''}</small>
      ${c.enRevision && !['descartado', 'error'].includes(c.enRevision.estado) ? `<span class="chip ok">${esc(tr(c.enRevision.estado))}</span>`
        : `<button class="btn pri" data-m="editar" data-id="${esc(c.id)}">✂️ ${tr('Editar con APOLO')}</button>`}
    </div>`).join('') || `<p class="tenue">${tr('No hay clips con eso.')}</p>`}</div>
  </div>`;
}
// comentarios anclados a un momento del vídeo (se acumulan aquí y se mandan juntos)
function RV_comentar(c, pendientes = []) {
  return `<div class="rv-comentar">
    <div class="rv-fila"><input type="text" class="rv-ctexto" placeholder="${esc(tr('Comentario en este momento del vídeo (p. ej.: el subtítulo dice Juan y es Chuy · sobra este emoji · sin zoom aquí · pon el nombre de Don Chuy)'))}">
      <button class="btn" data-a="comentar">${tr('💬 En este momento')}</button></div>
    <div class="rv-clista">${pendientes.map((x, i) => `<div><button class="rv-ir" data-a="ir" data-t="${x.t}">${RV_mmss(x.t)}</button><span>${esc(x.texto)}</span><button class="x" data-a="quitarcom" data-i="${i}" title="✕">✕</button></div>`).join('')}</div>
    ${pendientes.length ? `<div class="rv-fila"><button class="btn pri" data-a="enviarcom">${tr('Enviar {n} comentario(s)', { n: pendientes.length })}</button></div>` : ''}
  </div>`;
}
// tiempos del vídeo editado que ves (avance delante, recortado) ↔ tiempos del clip original (lo que se guarda); igual que vista() en lotes.js
function RV_vista(c) {
  const av = c.ajustes?.avance, rc = c.ajustes?.recorte, dur = c.fin - c.inicio;
  const dA = av ? av[1] - av[0] : 0, rd = rc ? rc[0] : 0, rh = rc ? rc[1] : dur;
  return { dA, rd, rh, dur, duracion: dA + rh - rd, aOrig: t => +(t < dA ? av[0] + t : t - dA + rd).toFixed(2), aVista: o => +(o - rd + dA).toFixed(2) };
}
function RV_cambios(c, abierto) {
  const v = RV_vista(c);
  const tb = c.ajustes?.temblor, t0 = tb?.tramos?.[0], tramo = t0 && [v.aVista(t0[0]), v.aVista(t0[1])];
  const modo = tb === false ? 'quitar' : tramo ? 'tramo' : tb ? 'intensidad' : 'tramo';
  const int = tb && tb.intensidad != null ? tb.intensidad : 100;
  return `<details class="rv-cambios"${abierto ? ' open' : ''}><summary>${tr('Cambios y edición a mano')}</summary>
    <textarea class="rv-pedido" placeholder="${esc(tr('Ej.: que empiece con el trozo de 0:45 a 0:47 y luego el clip entero · quita la vibración menos de 0:40 a 0:55 · pon la cámara en ventanita de 0:30 a 0:40 · modo podcast de 1:00 a 1:15 · sin sonidos · dame otras ideas'))}"></textarea>
    <div class="rv-fila"><button class="btn pri" data-a="pedir">${tr('Pedir cambio')}</button></div>
    <div class="rv-sub">${tr('Dónde empieza y dónde termina')}</div>
    <div class="rv-fila">${tr('Empieza en')} <input type="text" class="rv-rdesde" value="${RV_mmss(v.dA)}">
      <button class="btn fantasma" data-a="marcar" data-campo="rdesde" title="${esc(tr('usar el momento del vídeo'))}">⏱</button>
      ${tr('Termina en')} <input type="text" class="rv-rhasta" value="${RV_mmss(v.duracion)}">
      <button class="btn fantasma" data-a="marcar" data-campo="rhasta" title="${esc(tr('usar el momento del vídeo'))}">⏱</button></div>
    <div class="rv-fila"><button class="btn" data-a="recortar">${tr('Aplicar')}</button>${c.ajustes?.recorte ? `<button class="btn fantasma" data-a="sinrecorte">${tr('Clip entero')}</button>` : ''}
      <small class="tenue">${tr('Tiempos del vídeo tal como lo ves aquí')}</small></div>
    <div class="rv-sub">${tr('Vibración de pantalla')}</div>
    <div class="rv-fila"><select class="rv-estilo rv-vmodo">
        <option value="tramo"${modo === 'tramo' ? ' selected' : ''}>${tr('Solo en un tramo')}</option>
        <option value="quitar"${modo === 'quitar' ? ' selected' : ''}>${tr('Quitarla')}</option>
        <option value="intensidad"${modo === 'intensidad' ? ' selected' : ''}>${tr('En todo el clip (automática)')}</option></select>
      <span class="rv-tramo" ${modo === 'tramo' ? '' : 'hidden'}>${tr('de')} <input type="text" class="rv-desde" placeholder="0:40" value="${tramo ? RV_mmss(tramo[0]) : ''}">
        <button class="btn fantasma" data-a="marcar" data-campo="desde" title="${esc(tr('usar el momento del vídeo'))}">⏱</button>
        ${tr('a')} <input type="text" class="rv-hasta" placeholder="0:55" value="${tramo ? RV_mmss(tramo[1]) : ''}">
        <button class="btn fantasma" data-a="marcar" data-campo="hasta" title="${esc(tr('usar el momento del vídeo'))}">⏱</button></span></div>
    <div class="rv-fila rv-intfila" ${modo === 'quitar' ? 'hidden' : ''}>${tr('Intensidad')} <input type="range" class="rv-int" min="5" max="100" step="5" value="${int}"> <b class="rv-intv">${int} %</b>
      <small class="tenue">${tr('100 % = como está ahora')}</small></div>
    <div class="rv-fila"><button class="btn" data-a="vibracion">${tr('Aplicar')}</button></div>
    <div class="rv-sub">${tr('Línea de tiempo')}</div>
    <div class="rv-fila"><button class="btn" data-a="abrir">${tr('Abrir en FilmCraft')}</button><button class="btn" data-a="exportar">${tr('Exportar lo retocado')}</button></div>
    <small class="tenue">${tr('Retoca y guarda (Ctrl+S) en FilmCraft, luego «Exportar lo retocado». Ojo: «Pedir cambio» y «Rehacer» montan el clip de nuevo y se pierde lo retocado a mano.')}</small>
  </details>`;
}
// ── editor de subtítulos: cada subtítulo es un bloque en su línea de tiempo (arrastrar = mover, bordes = alargar/acortar)
// y una fila con sus tiempos y su texto. Tiempos del vídeo editado; el servidor los guarda en tiempos del clip original.
const RV_t = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const RV_ST_MIN = 0.2;                                   // duración mínima de un subtítulo (s)
const RV_ED = {
  // e = { id, lista, dA, duracion, px, sel, sucio, vid, caja } · caja = el editor del clip (.rve): dentro van .rve-pista
  // (línea de tiempo abajo, a todo lo ancho) y .rve-subs (las filas, en la pestaña Subtítulos)
  pintar(e) {
    const W = Math.max(1, e.duracion) * e.px, marcas = [];
    for (let s = 0; s <= e.duracion; s++) marcas.push(`<i style="left:${s * e.px}px" class="${s % 5 ? '' : 'g'}">${s % 5 ? '' : RV_mmss(s)}</i>`);
    e.caja.querySelector('.rve-pista').innerHTML = `
      <div class="rv-st"><div class="rv-stpista" style="width:${W}px">
        <div class="rv-stregla">${marcas.join('')}</div>
        ${e.dA ? `<div class="rv-stav" style="width:${e.dA * e.px}px" title="${esc(tr('Adelanto: copia de un trozo del clip; se edita en su sitio'))}"></div>` : ''}
        ${e.lista.map((x, i) => `<div class="rv-stb${i === e.sel ? ' sel' : ''}${x.adelanto ? ' av' : ''}" data-i="${i}" style="left:${x.s * e.px}px;width:${Math.max(4, (x.e - x.s) * e.px)}px" title="${esc(x.texto)}">
          ${x.adelanto ? '' : '<b class="h iz"></b>'}<span>${esc(x.texto)}</span>${x.adelanto ? '' : '<b class="h de"></b>'}</div>`).join('')}
        <div class="rv-stcab"></div></div></div>
      <div class="rv-fila">
        <button class="btn fantasma" data-st="play">⏯</button>
        <button class="btn fantasma" data-st="zoom-" title="${esc(tr('Alejar'))}">－</button><button class="btn fantasma" data-st="zoom+" title="${esc(tr('Acercar'))}">＋</button>
        <button class="btn" data-st="nuevo">${tr('＋ Subtítulo aquí')}</button>
        <button class="btn" data-st="dividir" ${e.sel == null ? 'disabled' : ''}>${tr('✂ Dividir')}</button>
        <button class="btn" data-st="unir" ${e.sel == null ? 'disabled' : ''}>${tr('⇥ Unir con el siguiente')}</button>
        <button class="btn mal" data-st="borrar" ${e.sel == null ? 'disabled' : ''}>${tr('Borrar')}</button>
        <small class="tenue rv-stsucio">${e.sucio ? tr('Cambios sin guardar') : tr('Clic en un bloque para ir a ese momento · arrastra para moverlo · tira de los bordes para cambiar cuándo entra y sale')}</small></div>`;
    e.caja.querySelector('.rve-subs').innerHTML = `
      <div class="rv-stlista">${e.lista.map((x, i) => `<div class="rv-stf${i === e.sel ? ' sel' : ''}${x.adelanto ? ' av' : ''}" data-i="${i}">
        <button class="rv-ir" data-st="ir" data-i="${i}">${RV_t(x.s)}</button>
        <input type="text" class="rv-sts" data-i="${i}" value="${RV_t(x.s)}" ${x.adelanto ? 'disabled' : ''}>
        <input type="text" class="rv-ste" data-i="${i}" value="${RV_t(x.e)}" ${x.adelanto ? 'disabled' : ''}>
        <input type="text" class="rv-stt" data-i="${i}" value="${esc(x.texto)}" ${x.adelanto ? `disabled title="${esc(tr('Adelanto: se edita en su sitio del clip'))}"` : ''}></div>`).join('')}</div>
      <div class="rv-fila"><button class="btn pri" data-st="guardar">${tr('Guardar y rehacer el vídeo')}</button>
        ${e.aMano ? `<button class="btn fantasma" data-st="restaurar">${tr('Volver a los automáticos')}</button>` : ''}</div>`;
    this.cabezal(e, true);
    const sc = e.caja.querySelector('.rv-st'), t = e.vid ? e.vid.currentTime : 0;
    if (e.scroll != null) sc.scrollLeft = e.scroll;      // al repintar (zoom, dividir…) la pista no salta
    if (e.scroll == null || t * e.px < sc.scrollLeft || t * e.px > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = t * e.px - sc.clientWidth / 3;
    sc.onscroll = () => { e.scroll = sc.scrollLeft; };
    sc.onpointerdown = ev => this.arrastrar(e, ev);
  },
  // un subtítulo cambió: se recoloca su bloque y su fila sin repintar todo (no pierde el foco del texto)
  refrescar(e, i) {
    const x = e.lista[i], b = e.caja.querySelector(`.rv-stb[data-i="${i}"]`);
    if (b) { b.style.left = x.s * e.px + 'px'; b.style.width = Math.max(4, (x.e - x.s) * e.px) + 'px'; b.querySelector('span').textContent = x.texto; b.title = x.texto; }
    const f = e.caja.querySelector(`.rv-stf[data-i="${i}"]`);
    if (f) {
      f.querySelector('.rv-ir').textContent = RV_t(x.s);
      for (const [cl, v] of [['.rv-sts', x.s], ['.rv-ste', x.e]]) { const inp = f.querySelector(cl); if (inp !== document.activeElement) inp.value = RV_t(v); }
    }
    this.sucio(e);
  },
  sucio(e) { e.sucio = true; const s = e.caja.querySelector('.rv-stsucio'); if (s) s.textContent = tr('Cambios sin guardar'); },
  elegir(e, i, ir) {
    e.sel = i; this.pintar(e);
    if (ir && e.vid && i != null) { e.vid.currentTime = e.lista[i].s + 0.01; }
    const f = e.caja.querySelector(`.rv-stf[data-i="${i}"]`), l = f?.parentElement;   // sin mover la página
    if (f && (f.offsetTop < l.scrollTop || f.offsetTop + f.offsetHeight > l.scrollTop + l.clientHeight)) l.scrollTop = f.offsetTop - l.clientHeight / 3;
  },
  // límites de un subtítulo: no pisa a sus vecinos ni entra en el adelanto
  limites(e, i) {
    const x = e.lista[i];
    const ant = e.lista.slice(0, i).filter(y => !y.adelanto).at(-1), sig = e.lista.slice(i + 1).find(y => !y.adelanto);
    return { min: Math.max(e.dA, ant ? ant.e : 0, x.adelanto ? 0 : e.dA), max: sig ? sig.s : e.duracion };
  },
  arrastrar(e, ev) {
    const pista = e.caja.querySelector('.rv-stpista'), r0 = pista.getBoundingClientRect(), t = (ev.clientX - r0.left) / e.px;
    const b = ev.target.closest('.rv-stb');
    if (!b) { if (e.vid) e.vid.currentTime = Math.max(0, Math.min(e.duracion, t)); return; }   // clic en la pista = ir ahí
    const i = +b.dataset.i, x = e.lista[i];
    if (e.sel !== i) { e.sel = i; e.caja.querySelectorAll('.rv-stb.sel, .rv-stf.sel').forEach(n => n.classList.remove('sel')); b.classList.add('sel'); e.caja.querySelector(`.rv-stf[data-i="${i}"]`)?.classList.add('sel'); e.caja.querySelectorAll('[data-st="dividir"],[data-st="unir"],[data-st="borrar"]').forEach(n => { n.disabled = false; }); }
    if (x.adelanto) { if (e.vid) e.vid.currentTime = x.s + 0.01; return; }
    const modo = ev.target.classList.contains('iz') ? 'iz' : ev.target.classList.contains('de') ? 'de' : 'mover';
    const { min, max } = this.limites(e, i), s0 = x.s, e0 = x.e, x0 = ev.clientX;
    let movido = false;
    b.setPointerCapture(ev.pointerId); ev.preventDefault();
    const mover = m => {
      const d = (m.clientX - x0) / e.px; if (Math.abs(m.clientX - x0) > 3) movido = true; if (!movido) return;
      const q = v => Math.round(v * 20) / 20;           // de 0,05 en 0,05 s
      if (modo === 'mover') { const len = e0 - s0, s = Math.min(max - len, Math.max(min, q(s0 + d))); x.s = +s.toFixed(2); x.e = +(s + len).toFixed(2); }
      if (modo === 'iz') x.s = +Math.min(x.e - RV_ST_MIN, Math.max(min, q(s0 + d))).toFixed(2);
      if (modo === 'de') x.e = +Math.max(x.s + RV_ST_MIN, Math.min(max, q(e0 + d))).toFixed(2);
      this.refrescar(e, i);
      if (e.vid) e.vid.currentTime = modo === 'de' ? Math.max(x.s, x.e - 0.3) : x.s + 0.01;
    };
    const soltar = () => { b.removeEventListener('pointermove', mover); b.removeEventListener('pointerup', soltar); if (!movido && e.vid) e.vid.currentTime = x.s + 0.01; };
    b.addEventListener('pointermove', mover); b.addEventListener('pointerup', soltar);
  },
  // cabezal + fila del subtítulo que se ve ahora; la pista sigue al vídeo mientras se reproduce
  cabezal(e, forzar) {
    if (!e.caja.isConnected) return false;
    const t = e.vid ? e.vid.currentTime : 0, cab = e.caja.querySelector('.rv-stcab'); if (!cab) return true;
    cab.style.left = t * e.px + 'px';
    const i = e.lista.findIndex(x => t >= x.s && t < x.e);
    if (i !== e.ahora || forzar) {
      e.ahora = i;
      e.caja.querySelectorAll('.rv-stf.ahora, .rv-stb.ahora').forEach(n => n.classList.remove('ahora'));
      const fila = i >= 0 && e.caja.querySelector(`.rv-stf[data-i="${i}"]`);
      if (fila) {
        fila.classList.add('ahora'); e.caja.querySelector(`.rv-stb[data-i="${i}"]`)?.classList.add('ahora');
        const l = fila.parentElement;                   // la lista sigue al vídeo (sin mover la página)
        if (e.vid && !e.vid.paused && (fila.offsetTop < l.scrollTop || fila.offsetTop + fila.offsetHeight > l.scrollTop + l.clientHeight)) l.scrollTop = fila.offsetTop - l.clientHeight / 3;
      }
    }
    // la pista sigue al vídeo mientras suena o si saltaste a otro momento (no mientras arrastras un bloque)
    const sc = e.caja.querySelector('.rv-st'), salto = e.tUlt != null && Math.abs(t - e.tUlt) > 1;
    e.tUlt = t;
    if (e.vid && (!e.vid.paused || salto) && (t * e.px < sc.scrollLeft || t * e.px > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = t * e.px - (salto ? sc.clientWidth / 3 : 40);
    return true;
  },
  accion(e, a, boton) {
    const L = e.lista, i = e.sel, t = e.vid ? e.vid.currentTime : 0;
    if (a === 'play') { if (e.vid) e.vid.paused ? e.vid.play() : e.vid.pause(); return; }
    if (a === 'zoom+' || a === 'zoom-') { e.px = Math.min(400, Math.max(15, e.px * (a === 'zoom+' ? 1.5 : 1 / 1.5))); e.scroll = null; return this.pintar(e); }
    if (a === 'ir') return this.elegir(e, +boton.dataset.i, true);
    if (a === 'nuevo') {
      if (t < e.dA) return aviso('Eso es el adelanto: ve al momento del clip', true);
      if (L.some(x => !x.adelanto && t >= x.s && t < x.e)) return aviso('Ahí ya hay un subtítulo: usa «Dividir» o mueve el vídeo a un hueco', true);
      const sig = L.find(x => !x.adelanto && x.s > t), fin = Math.min(t + 1.5, sig ? sig.s : e.duracion);
      if (fin - t < RV_ST_MIN) return aviso('No cabe: no hay hueco aquí', true);
      L.push({ s: +t.toFixed(2), e: +fin.toFixed(2), texto: '' }); L.sort((x, y) => x.s - y.s);
      this.sucio(e); this.elegir(e, L.findIndex(x => x.s === +t.toFixed(2) && !x.texto));
      e.caja.querySelector(`.rv-stt[data-i="${e.sel}"]`)?.focus();
      return;
    }
    if (i == null || L[i]?.adelanto) return;
    if (a === 'borrar') { L.splice(i, 1); this.sucio(e); return this.elegir(e, null); }
    if (a === 'dividir') {
      const x = L[i], corte = t > x.s + RV_ST_MIN && t < x.e - RV_ST_MIN ? t : (x.s + x.e) / 2, ws = x.texto.split(/\s+/).filter(Boolean);
      const mitad = Math.max(1, Math.round(ws.length * (corte - x.s) / (x.e - x.s)));
      L.splice(i, 1, { s: x.s, e: +corte.toFixed(2), texto: ws.slice(0, mitad).join(' ') }, { s: +corte.toFixed(2), e: x.e, texto: ws.slice(mitad).join(' ') });
      this.sucio(e); return this.elegir(e, i);
    }
    if (a === 'unir') {
      const j = L.findIndex((y, k) => k > i && !y.adelanto); if (j < 0) return aviso('No hay uno después', true);
      L.splice(i, j - i + 1, { s: L[i].s, e: L[j].e, texto: `${L[i].texto} ${L[j].texto}`.trim() });
      this.sucio(e); return this.elegir(e, i);
    }
  },
  // escribir en las filas: texto al momento; los tiempos al salir del campo (se ajustan a los vecinos)
  escribir(e, inp, final) {
    const i = +inp.dataset.i, x = e.lista[i]; if (!x || x.adelanto) return;
    if (inp.matches('.rv-stt')) { x.texto = inp.value; return this.refrescar(e, i); }
    if (!final) return;
    const v = RV_seg(inp.value), { min, max } = this.limites(e, i);
    if (!Number.isFinite(v)) { inp.value = RV_t(inp.matches('.rv-sts') ? x.s : x.e); return; }
    if (inp.matches('.rv-sts')) x.s = +Math.min(x.e - RV_ST_MIN, Math.max(min, v)).toFixed(2);
    else x.e = +Math.max(x.s + RV_ST_MIN, Math.min(max, v)).toFixed(2);
    inp.value = RV_t(inp.matches('.rv-sts') ? x.s : x.e);
    this.refrescar(e, i);
  },
};

// la versión 4K de un clip aprobado: en cola / exportando con % / lista (con su archivo) / error con reintento
function RV_k4(c) {
  const k = c.k4;
  if (!k) return `<button class="btn" data-a="4k">${tr('Exportar en 4K')}</button>`;
  if (k.estado === 'en cola') return `<span class="chip">${tr('4K en cola')}</span>`;
  if (k.estado === 'exportando') return `<span class="chip aviso">4K ${k.pct || 0} %</span><div class="rv-barra"><i style="width:${k.pct || 0}%"></i></div>${k.eta ? `<small class="tenue">${tr('quedan')} ~${RV_mmss(k.eta)}</small>` : ''}`;
  if (k.estado === 'listo') return `<span class="chip ok">4K ✓</span><small class="tenue rv-ruta">${esc(k.mp4)}</small>`;
  return `<span class="chip mal">4K: ${esc(tr('error'))}</span><small class="rv-error">${esc(k.error || '')}</small><button class="btn" data-a="4k">${tr('Reintentar 4K')}</button>`;
}
function RV_progreso(p) {
  if (!p) return esc(tr('editando…'));
  const pct = p.pct || 0, tiempo = p.desde ? Math.round((Date.now() - p.desde) / 1000) : null;
  return `<div class="rv-prog"><b>${pct} %</b><div class="rv-barra"><i style="width:${pct}%"></i></div><span>${esc(tr(p.fase || 'editando'))}</span>
    <small>${p.eta ? `${tr('quedan')} ~${RV_mmss(p.eta)}` : tiempo != null ? `${tr('lleva')} ${RV_mmss(tiempo)}` : ''}</small></div>`;
}
async function RV_blob(ruta) {
  const r = await fetch('/v1' + ruta, { headers: { 'x-robot-token': TOKEN } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return URL.createObjectURL(await r.blob());
}

VISTAS.revision = {
  filtro: 'revisar',
  async pintar(v, sub) {
    this.salir(); this.v = v; this.urls = this.urls || new Map();
    this.idEd = sub ? decodeURIComponent(sub) : null;    // #/revision/<clip> = editor de ese clip
    this.manejadores(v);
    if (this.idEd) {
      this.firmaEd = null;
      v.innerHTML = `<div class="rve" data-id="${esc(this.idEd)}"><div class="tenue pad">${tr('Cargando…')}</div></div>`;
      await this.cargar();
      this.reloj = setInterval(() => this.cargar(true), 3000);
      return;
    }
    v.innerHTML = `<div class="pagina">${cabecera('Revisión', 'Clips editados solos a partir de tus streams. Míralos y decide: aprobar, otro estilo o descartar. Nada se publica sin tu aprobación.',
      `<button class="btn" id="rvMedal">🎮 ${tr('Elegir de Medal')}</button><button class="btn" id="rvBuscar">${ic('buscar')}${tr('Buscar clips ahora')}</button>`)}
      <div id="rvEstado"></div>
      <div id="rvMedalCaja" hidden></div>
      <div id="rvPanel"></div>
      <div class="rv-filtros">${RV_FILTROS.map(([k, t]) => `<button class="btn ${k === this.filtro ? 'pri' : 'fantasma'}" data-f="${k}">${tr(t)} <span class="rv-n" data-n="${k}"></span></button>`).join('')}</div>
      <div id="rvLista"></div></div>`;
    await this.cargar();
    this.reloj = setInterval(() => this.cargar(true), 3000);
  },
  manejadores(v) {
    v.onclick = e => this.clic(e);
    v.onchange = e => {
      if (e.target.matches('.rv-sts, .rv-ste')) { const ed = this.editorDe(e.target); if (ed) RV_ED.escribir(ed, e.target, true); return; }
      if (e.target.matches('.rve-propios')) { $('.rve-colores', this.v).hidden = !e.target.checked; return; }
      if (e.target.matches('[name="rve-est"]')) {           // otro estilo: se marca y, si no usas tus colores, se ven los suyos
        $$('.rve-est', this.v).forEach(l => l.classList.toggle('on', l.contains(e.target)));
        const E = this.L?.estilos.find(x => x.id === e.target.value); if (!E?.colores) return;
        for (const inp of $$('[data-color]', this.v)) if (!$('.rve-propios', this.v).checked && E.colores[inp.dataset.color]) inp.value = E.colores[inp.dataset.color];
        $('.rve-color[data-c="caja"]', this.v).hidden = !E.colores.caja;
        return;
      }
      if (e.target.matches('.rv-ytactivo, .rv-ytprog')) {
        api('POST', '/revision/youtube', e.target.matches('.rv-ytactivo') ? { activo: e.target.checked } : { programar: e.target.checked })
          .then(() => aviso(e.target.checked ? 'Activado' : 'Desactivado')).catch(er => aviso(er.message, true));
        return;
      }
      if (e.target.matches('.rv-acc .rv-estilo')) e.target.closest('.rv-acc').querySelector('[data-a="rehacer"]').disabled = false;
      if (e.target.matches('.rv-vmodo')) {
        const box = e.target.closest('.rv-cambios');
        $('.rv-tramo', box).hidden = e.target.value !== 'tramo';
        $('.rv-intfila', box).hidden = e.target.value === 'quitar';
      }
    };
    v.oninput = e => {
      if (e.target.matches('.rv-int')) e.target.parentElement.querySelector('.rv-intv').textContent = e.target.value + ' %';
      if (e.target.matches('.rv-stt')) { const ed = this.editorDe(e.target); if (ed) RV_ED.escribir(ed, e.target, false); }
    };
    v.onkeydown = e => {
      if (e.key === 'Enter' && e.target.matches('.rv-ctexto')) { e.preventDefault(); e.target.closest('.rv-comentar').querySelector('[data-a="comentar"]').click(); }
      if (e.key === 'Enter' && e.target.matches('.rv-sts, .rv-ste, .rv-stt')) { e.preventDefault(); e.target.blur(); }
      // en el editor: espacio = reproducir/pausar, ← → = un segundo atrás/adelante (si no estás escribiendo)
      if (this.idEd && !e.target.matches('input, textarea, select, video, button') && !e.ctrlKey && !e.metaKey) {
        const vid = $('.rve-video video', v); if (!vid) return;
        if (e.key === ' ') { e.preventDefault(); vid.paused ? vid.play() : vid.pause(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); vid.currentTime = Math.max(0, vid.currentTime + (e.key === 'ArrowLeft' ? -1 : 1)); }
      }
    };
  },
  salir() {
    clearInterval(this.reloj); this.ed = null;
    for (const u of this.urlsVideo || []) URL.revokeObjectURL(u);
    this.urlsVideo = [];
  },
  async cargar(silencio) {
    let L; try { L = await api('GET', '/revision'); } catch (e) { if (!silencio) aviso(e.message, true); return; }
    if (this.idEd) { this.L = L; return this.pintarEditor(L, silencio); }
    const firma = JSON.stringify(L.clips.map(c => [c.id, c.estado, c.estilo, c.editado, c.k4?.estado, c.portada, c.portadas?.length, c.publicado?.estado, c.youtube?.estado, c.en?.estado, c.textos ? 1 : 0, c.metricas?.youtube?.at, c.metricas?.tiktok?.at])) + this.filtro;
    this.L = L;
    this.pintarEstado(L);
    this.pintarPanel(L);
    this.pintarProgreso(L);
    for (const [k] of RV_FILTROS) { const n = k === 'todos' ? L.clips.length : L.clips.filter(c => c.estado === k).length; const el = $(`[data-n="${k}"]`, this.v); if (el) el.textContent = n || ''; }
    if (silencio && firma === this.firma) return;        // nada cambió: no se repinta (no corta el vídeo que estás viendo)
    if (silencio && this.ocupado()) return;              // viendo un vídeo o escribiendo un cambio: se repinta luego
    this.firma = firma;
    $('#rvLista', this.v).innerHTML = this.lista(L);
    this.pintarProgreso(L);
    this.cargarPrevias();
  },
  // panel de publicación: solo se repinta si cambió algo y no estás escribiendo en él
  async pintarPanel(L, forzar) {
    const el = $('#rvPanel', this.v); if (!el) return;
    const firma = JSON.stringify([L.youtube, L.aprendido?.actualizado, L.metricasEn, L.midiendo, L.diccionario]);
    if (!forzar && (firma === this.firmaPanel || el.contains(document.activeElement))) return;
    this.firmaPanel = firma;
    let dic = null; try { dic = await api('GET', '/revision/diccionario'); } catch { }
    el.innerHTML = RV_panel(L, dic);
    $('.rv-panel', el).ontoggle = e => { RV_panelAbierto = e.target.open; };
  },
  async clicPanel(g) {
    const panel = $('#rvPanel', this.v);
    try {
      if (g.dataset.g === 'ytcliente') { const t = $('.rv-ytjson', panel).value.trim(); if (!t) return aviso('Pega el JSON', true); await api('POST', '/revision/youtube', { cliente: t }); aviso('Guardado'); }
      if (g.dataset.g === 'ytconectar') { await api('POST', '/revision/youtube/conectar'); aviso('Acepta en el navegador que se abrió'); }
      if (g.dataset.g === 'ytdesconectar') { await api('POST', '/revision/youtube/desconectar'); aviso('Desconectado'); }
      if (g.dataset.g === 'medir') { await api('POST', '/revision/metricas'); aviso('Midiendo… (1–3 min)'); }
      if (g.dataset.g === 'dicquitar') await api('POST', '/revision/diccionario', { quitar: g.dataset.mal });
      if (g.dataset.g === 'dicanadir') {
        const mal = $('.rv-dmal', panel).value.trim(), bien = $('.rv-dbien', panel).value.trim();
        if (!mal || !bien) return aviso('Pon cómo sale y cómo debe ser', true);
        await api('POST', '/revision/diccionario', { mal, bien });
      }
      document.activeElement?.blur?.();
      const L = await api('GET', '/revision'); this.L = L; await this.pintarPanel(L, true);
    } catch (er) { aviso(er.message, true); }
  },
  // ── elegir de Medal ──
  medalFiltro: { formato: 'vertical' },
  leerFiltroMedal() {
    const caja = $('#rvMedalCaja', this.v); if (!caja || caja.hidden) return;
    const v = sel => $(sel, caja)?.value || '';
    this.medalFiltro = { juego: v('.rv-mjuego'), texto: v('.rv-mtexto').trim(), orden: v('.rv-morden') || 'reciente', formato: v('.rv-mformato') || 'vertical', estilo: v('.rv-mestilo') };
  },
  async abrirMedal(recargar) {
    const caja = $('#rvMedalCaja', this.v);
    if (!recargar && !caja.hidden) { caja.hidden = true; return; }
    caja.hidden = false; caja.innerHTML = RV_medal(null);
    const f = this.medalFiltro, q = new URLSearchParams(Object.entries({ juego: f.juego, texto: f.texto, orden: f.orden, limite: 60 }).filter(([, x]) => x));
    try { this.M = await api('GET', `/revision/medal?${q}`); }
    catch (er) { caja.innerHTML = `<div class="caja pad rv-medal rv-error">${esc(er.message)}</div>`; return; }
    caja.innerHTML = RV_medal(this.M, this.L?.estilos || [], f);
    $('.rv-mtexto', caja).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); this.leerFiltroMedal(); this.abrirMedal(true); } };
    $('.rv-mjuego', caja).onchange = $('.rv-morden', caja).onchange = () => { this.leerFiltroMedal(); this.abrirMedal(true); };
    // miniaturas: de 6 en 6 (las de la nube las baja APOLO la primera vez y las guarda)
    const imgs = $$('[data-mini]', caja); let i = 0;
    const siguiente = async () => {
      while (i < imgs.length) {
        const img = imgs[i++], k = 'm:' + img.dataset.mini;
        try { if (!this.urls.has(k)) this.urls.set(k, await RV_blob(`/revision/medal/${encodeURIComponent(img.dataset.mini)}/miniatura`)); img.src = this.urls.get(k); } catch { img.classList.add('sin'); }
      }
    };
    await Promise.all(Array.from({ length: 6 }, siguiente));
  },
  async clicMedal(b) {
    if (b.dataset.m === 'cerrar') { $('#rvMedalCaja', this.v).hidden = true; return; }
    this.leerFiltroMedal();
    if (b.dataset.m === 'filtrar') return this.abrirMedal(true);
    if (b.dataset.m === 'editar') {
      const f = this.medalFiltro;
      b.disabled = true; aviso('Trayendo el clip de Medal…');
      try {
        await api('POST', '/revision/medal', { id: b.dataset.id, formato: f.formato || 'vertical', ...(f.estilo ? { estilo: f.estilo } : {}) });
        aviso('APOLO lo está editando: sale en «Por revisar»');
        b.outerHTML = `<span class="chip">${tr('en cola')}</span>`;
        this.filtro = 'revisar'; this.firma = null; await this.cargar();
      } catch (er) { aviso(er.message, true); b.disabled = false; }
    }
  },
  // barra de la tarjeta que se está editando: se actualiza sola (sin repintar la lista, no corta lo que estás viendo)
  pintarProgreso(L) {
    for (const c of L.clips.filter(x => x.estado === 'editando')) {
      const el = $(`.rv-clip[data-id="${CSS.escape(c.id)}"] .rv-hueco`, this.v); if (!el) continue;
      el.innerHTML = RV_progreso(c.progreso);
    }
    for (const c of L.clips.filter(x => x.k4?.estado === 'exportando')) {
      const el = $(`[data-k4="${CSS.escape(c.id)}"]`, this.v); if (el) el.innerHTML = RV_k4(c);
    }
  },
  ocupado() {
    const lista = $('#rvLista', this.v); if (!lista) return false;
    return $$('video', lista).some(x => !x.paused) || $$('.rv-cambios[open]', lista).length > 0 || lista.contains(document.activeElement);
  },
  pintarEstado(L) {
    const el = $('#rvEstado', this.v); if (!el) return;
    const es4k = /^4k:/.test(L.enCurso || ''), ed = L.enCurso && L.clips.find(c => c.id === L.enCurso.replace(/^4k:/, ''));
    if (es4k && ed) { el.innerHTML = `<div class="caja pad rv-trabajando"><span class="punto aviso"></span><b>${tr('Exportando en 4K')}:</b> ${esc(ed.titulo || ed.stream)} · #${ed.rank} · <b>${ed.k4?.pct || 0} %</b>${ed.k4?.eta ? ` · ${tr('quedan')} ~${RV_mmss(ed.k4.eta)}` : ''}${L.cola.length ? ` · ${tr('{n} en cola', { n: L.cola.length })}` : ''}</div>`; return; }
    el.innerHTML = !L.config.fuentes.length ? `<div class="caja pad tenue">${tr('Aún no hay fuentes configuradas.')}</div>`
      : ed || L.cola.length ? `<div class="caja pad rv-trabajando"><span class="punto aviso"></span>${ed ? `<b>${tr('Editando ahora')}:</b> ${esc(ed.titulo || ed.stream)} · #${ed.rank}${ed.progreso ? ` · ${esc(tr(ed.progreso.fase))} <b>${ed.progreso.pct || 0} %</b>${ed.progreso.eta ? ` · ${tr('quedan')} ~${RV_mmss(ed.progreso.eta)}` : ''}` : ''}` : ''}${L.cola.length ? ` · ${tr('{n} en cola', { n: L.cola.length })}` : ''}</div>` : '';
  },
  lista(L) {
    const clips = L.clips.filter(c => this.filtro === 'todos' || c.estado === this.filtro || (this.filtro === 'revisar' && ['editando', 'en cola', 'error'].includes(c.estado)));
    if (!clips.length) return `<div class="caja pad rv-vacio">${ic('clip')}<p>${tr('No hay clips aquí.')}</p></div>`;
    const grupos = new Map();
    for (const c of clips) { const k = `${c.fecha} · ${c.titulo || c.stream}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); }
    const opciones = L.estilos.map(e => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('');
    return [...grupos].map(([titulo, cs]) => `<h3 class="rv-grupo">${esc(titulo)}</h3><div class="rv-rejilla">${cs.map(c => {
      const [cls, txt] = RV_ESTADO[c.estado] || ['', c.estado];
      const listo = c.estado === 'revisar' || c.estado === 'aprobado';
      return `<div class="caja rv-clip" data-id="${esc(c.id)}">
        <div class="rv-medio">${listo ? `<img class="rv-previa" alt="" data-previa="${esc(c.id)}"><button class="rv-play" data-a="ver" title="${esc(tr('Ver clip'))}">▶</button>` : `<div class="rv-hueco">${esc(tr(txt))}</div>`}</div>
        <div class="rv-info">
          <div class="flex rv-cab"><b>#${c.rank}</b><span class="tenue">${RV_mmss(c.fin - c.inicio)} · ${c.fuente === 'medal' ? `🎮 Medal${c.formato && c.formato !== 'vertical' ? ` · ${esc(tr(c.formato))}` : ''}` : `${RV_mmss(c.inicio)} del stream`}</span><span class="chip ${cls}">${esc(tr(txt))}</span>${c.estilo ? `<span class="chip">${esc(c.estilo)}</span>` : ''}${c.momento?.tipo ? `<span class="chip" title="${esc(tr('Reacción del chat'))}">${{ risa: '😂', choque: '💥', hype: '🔥', apoyo: '💲', charla: '💬' }[c.momento.tipo] || '💬'} ${esc(tr(c.momento.tipo))}${c.momento.autores ? ` · ${c.momento.autores} 👤` : ''}</span>` : ''}</div>
          ${c.gancho ? `<div class="rv-gancho">${esc(c.gancho)}</div>` : ''}
          ${c.error ? `<div class="rv-error">${esc(c.error)}</div>` : ''}
          ${c.estado === 'revisar' ? (c.calidad ? `<div class="flex" style="gap:6px;flex-wrap:wrap">${RV_chipCalidad(c)}${c.ajustes?.subtitulosFijos ? `<span class="chip">✏️ ${tr('subtítulos a mano')}</span>` : ''}</div>` : '') : RV_info(c, listo)}
          ${c.estado === 'revisar' ? '' : listo ? RV_portadas(c) : ''}
          ${c.estado === 'aprobado' ? `<div class="rv-k4 flex" data-k4="${esc(c.id)}">${RV_k4(c)}</div>${RV_publicacion(c, L)}` : ''}
          ${c.diccionario ? `<small class="tenue">📖 ${tr('diccionario')}: ${c.diccionario}</small>` : ''}
          ${c.estado === 'revisar' || c.estado === 'error' ? `<div class="rv-acc flex">
            <a class="btn pri" href="#/revision/${encodeURIComponent(c.id)}">✏️ ${tr('Abrir editor')}</a>
            ${c.estado === 'revisar' ? `<button class="btn" data-a="aprobar">${ic('check')}${tr('Aprobar')}</button>` : ''}
            <button class="btn mal" data-a="descartar">${ic('x')}${tr('Descartar')}</button></div>` : ''}
        </div></div>`;
    }).join('')}</div>`).join('');
  },
  async cargarPrevias() {
    for (const img of $$('[data-previa]', this.v)) {
      const id = img.dataset.previa, k = 'p:' + id + (this.L.clips.find(c => c.id === id)?.editado || '');
      try { if (!this.urls.has(k)) this.urls.set(k, await RV_blob(`/revision/${encodeURIComponent(id)}/previa`)); img.src = this.urls.get(k); } catch { }
    }
    for (const img of $$('[data-portada]', this.v)) {
      const id = img.dataset.portada, c = this.L.clips.find(x => x.id === id), k = `po:${id}:${img.dataset.i}:${c?.editado || ''}:${c?.estado || ''}`;
      try { if (!this.urls.has(k)) this.urls.set(k, await RV_blob(`/revision/${encodeURIComponent(id)}/portada/${img.dataset.i}`)); img.src = this.urls.get(k); } catch { }
    }
  },
  // ▶ en la tarjeta: el vídeo editado (por fetch→blob, lleva el token)
  async verVideo(tarjeta, id, autoplay = true) {
    const medio = $('.rv-medio', tarjeta); medio.innerHTML = `<div class="rv-hueco">…</div>`;
    try {
      const url = await RV_blob(`/revision/${encodeURIComponent(id)}/video`);
      (this.urlsVideo = this.urlsVideo || []).push(url);  // pesan (cientos de MB): se sueltan al salir
      medio.innerHTML = `<video src="${url}" controls ${autoplay ? 'autoplay' : ''} playsinline></video>`;
    }
    catch (er) { medio.innerHTML = `<div class="rv-hueco">${esc(er.message)}</div>`; }
    return $('video', medio);
  },
  // ── editor de un clip (#/revision/<id>): cabecera con las decisiones, vídeo grande, pestañas al lado y la línea de tiempo
  // de los subtítulos abajo a todo lo ancho ──
  tab: 'subs',
  editorDe(el) { return el.closest('.rve') ? this.ed : null; },
  // los clips por los que se navega con ‹ ›: los pendientes, en el mismo orden que la lista
  pendientes(L) { return L.clips.filter(x => ['revisar', 'error', 'editando', 'en cola'].includes(x.estado)); },
  pintarEditor(L, silencio) {
    const raiz = $('.rve', this.v); if (!raiz) return;
    const c = L.clips.find(x => x.id === this.idEd);
    if (!c) { raiz.innerHTML = `<div class="rve-cab"><a class="btn fantasma" href="#/revision">← ${tr('Revisión')}</a></div><div class="caja pad rv-vacio">${tr('Ese clip ya no está en Revisión.')}</div>`; return; }
    const trabajando = ['editando', 'en cola'].includes(c.estado);
    const firma = JSON.stringify([trabajando, c.estado, c.editado, c.estilo, c.portada, c.portadas?.length]);
    if (silencio && firma === this.firmaEd) { if (trabajando) { const p = $('.rve-trab .rve-prog', raiz); if (p) p.innerHTML = c.estado === 'en cola' ? esc(tr('En cola: empieza cuando terminen los de delante')) : RV_progreso(c.progreso); } return; }
    // no se repinta encima de lo que estás haciendo (subtítulos sin guardar, escribiendo, comentarios sin enviar)
    if (silencio && !trabajando && (this.ed?.sucio || (raiz.contains(document.activeElement) && document.activeElement.matches('input, textarea')) || this.coms?.get(c.id)?.length)) return;
    this.firmaEd = firma;
    const lista = this.pendientes(L), i = lista.findIndex(x => x.id === c.id), ant = lista[i - 1], sig = lista[i + 1];
    const [cls, txt] = RV_ESTADO[c.estado] || ['', c.estado];
    const nav = (x, t, s) => x ? `<a class="btn fantasma" href="#/revision/${encodeURIComponent(x.id)}" title="${esc(tr(t))}">${s}</a>` : `<button class="btn fantasma" disabled>${s}</button>`;
    const TABS = [['subs', '✏️ ' + tr('Subtítulos')], ['estilo', '🎨 ' + tr('Estilo')], ['coms', '💬 ' + tr('Comentarios')], ['cambios', '🛠 ' + tr('Cambios')], ['portada', '🖼 ' + tr('Portada')], ['info', 'ℹ️ ' + tr('Info')]];
    raiz.innerHTML = `
      <div class="rve-cab">
        <a class="btn fantasma" href="#/revision">← ${tr('Revisión')}</a>
        <div class="rve-tit"><b>#${c.rank} · ${esc(c.gancho || c.titulo || c.stream)}</b>
          <small class="tenue">${esc(c.fecha)} · ${RV_mmss(c.fin - c.inicio)} · ${c.fuente === 'medal' ? '🎮 Medal' : `${RV_mmss(c.inicio)} ${tr('del stream')}`}</small></div>
        <span class="chip ${cls}">${esc(tr(txt))}</span>${c.estilo ? `<span class="chip">${esc(c.estilo)}</span>` : ''}${c.calidad ? RV_chipCalidad(c) : ''}
        ${c.ajustes?.plataforma ? `<span class="chip">${tr('para')} ${esc((RV_REDES.find(r => r[0] === c.ajustes.plataforma) || [, c.ajustes.plataforma])[1])}</span>` : ''}${c.ajustes?.banner === false ? `<span class="chip">${tr('sin banner')}</span>` : ''}
        <span class="rve-sp"></span>
        ${nav(ant, 'Clip anterior', '‹')}<span class="tenue rve-n">${i + 1} / ${lista.length}</span>${nav(sig, 'Clip siguiente', '›')}
        ${trabajando ? '' : `${c.estado === 'revisar' ? `<button class="btn pri" data-a="aprobar">${ic('check')}${tr('Aprobar')}</button>` : ''}
        <button class="btn mal" data-a="descartar">${ic('x')}${tr('Descartar')}</button>`}
      </div>
      ${trabajando ? `<div class="caja pad rve-trab"><div class="rve-prog">${c.estado === 'en cola' ? esc(tr('En cola: empieza cuando terminen los de delante')) : RV_progreso(c.progreso)}</div>
        <p class="tenue">${tr('APOLO está rehaciendo este clip. Cuando termine se abre aquí solo.')}</p></div>` : `
      <div class="rve-cuerpo">
        <div class="rve-video"><div class="rv-medio"><div class="rv-hueco">…</div></div></div>
        <div class="rve-lado">
          <div class="rve-tabs">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${t}</button>`).join('')}</div>
          <div class="rve-panel${this.tab === 'subs' ? ' on' : ''}" data-p="subs"><div class="rve-subs"><div class="tenue">${tr('Cargando…')}</div></div></div>
          <div class="rve-panel${this.tab === 'estilo' ? ' on' : ''}" data-p="estilo">${RV_estilo(c, L.estilos)}</div>
          <div class="rve-panel${this.tab === 'coms' ? ' on' : ''}" data-p="coms"><div data-coms="${esc(c.id)}">${RV_comentar(c, this.coms?.get(c.id))}</div>
            <small class="tenue">${tr('Pausa el vídeo donde algo está mal, escribe qué cambiar y añádelo. Al enviar, APOLO lo entiende y rehace el clip.')}</small></div>
          <div class="rve-panel${this.tab === 'cambios' ? ' on' : ''}" data-p="cambios">${RV_cambios(c, true)}</div>
          <div class="rve-panel${this.tab === 'portada' ? ' on' : ''}" data-p="portada">${RV_portadas(c) || `<div class="tenue">${tr('Este clip no tiene portadas.')}</div>`}</div>
          <div class="rve-panel${this.tab === 'info' ? ' on' : ''}" data-p="info">${c.error ? `<div class="rv-error">${esc(c.error)}</div>` : ''}${RV_info(c)}</div>
        </div>
      </div>
      <div class="rve-pista"></div>`}`;
    if (trabajando) return;
    this.cargarPrevias();
    this.abrirEditor(raiz, c);
  },
  async abrirEditor(raiz, c) {
    const vid = await this.verVideo(raiz, c.id, false);
    if (!vid || this.idEd !== c.id) return;
    vid.classList.add('rve-vid');
    let r; try { r = await api('GET', `/revision/${encodeURIComponent(c.id)}/subtitulos`); }
    catch (er) { $('.rve-subs', raiz).innerHTML = `<div class="rv-error">${esc(er.message)}</div>`; return; }
    if (!r.subtitulos.length) { $('.rve-subs', raiz).innerHTML = `<div class="tenue">${tr('Este clip no tiene subtítulos (.srt).')}</div>`; return; }
    const e = this.ed = { id: c.id, lista: r.subtitulos, dA: r.dA || 0, duracion: Math.max(r.duracion || 0, r.subtitulos.at(-1).e), aMano: r.aMano, px: 140, sel: null, sucio: false, caja: raiz, vid, scroll: null };
    RV_ED.pintar(e);
    const tic = () => { if (this.ed === e && RV_ED.cabezal(e)) requestAnimationFrame(tic); };
    requestAnimationFrame(tic);
  },
  async clicSubs(b) {
    const e = this.editorDe(b); if (!e) return;
    const a = b.dataset.st;
    if (a !== 'guardar' && a !== 'restaurar') return RV_ED.accion(e, a, b);
    if (a === 'guardar' && e.lista.some(x => !x.adelanto && !x.texto.trim())) return aviso('Hay subtítulos vacíos: escríbelos o bórralos', true);
    b.disabled = true;
    try {
      await api('POST', `/revision/${encodeURIComponent(e.id)}/subtitulos`, a === 'restaurar' ? { restaurar: true } : { subtitulos: e.lista });
      this.ed = null;
      aviso(a === 'restaurar' ? 'Se rehace con los subtítulos automáticos' : 'Guardado: se rehace el vídeo con tus subtítulos');
      this.firmaEd = null; await this.cargar();
    } catch (er) { aviso(er.message, true); b.disabled = false; }
  },
  // repinta solo la caja de comentarios de una tarjeta (sin tocar el vídeo que se está viendo)
  pintarComs(id) {
    const caja = $(`[data-coms="${CSS.escape(id)}"]`, this.v); if (!caja) return;
    caja.innerHTML = RV_comentar(this.L.clips.find(c => c.id === id), this.coms.get(id));
  },
  async clic(e) {
    // salir del editor (← Revisión, ‹ ›) con subtítulos sin guardar: primero un aviso, el segundo clic sale
    const enlace = e.target.closest('a[href^="#/revision"]');
    if (enlace && this.ed?.sucio && !this.avisadoSalir) { e.preventDefault(); this.avisadoSalir = true; return aviso('Tienes cambios sin guardar en los subtítulos. Vuelve a pulsar para salir sin guardarlos', true); }
    if (enlace) { this.avisadoSalir = false; return; }
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      this.tab = tb.dataset.tab;
      $$('.rve-tabs [data-tab]', this.v).forEach(b => b.classList.toggle('on', b === tb));
      $$('.rve-panel', this.v).forEach(p => p.classList.toggle('on', p.dataset.p === this.tab));
      return;
    }
    const f = e.target.closest('[data-f]');
    if (f) { this.filtro = f.dataset.f; this.firma = null; $$('[data-f]', this.v).forEach(b => b.className = 'btn ' + (b.dataset.f === this.filtro ? 'pri' : 'fantasma')); return this.cargar(); }
    if (e.target.closest('#rvBuscar')) {
      const b = e.target.closest('#rvBuscar'); b.disabled = true; aviso('Buscando…');
      try { const r = await api('POST', '/revision/revisar'); aviso(r.nuevos ? tr('{n} clips nuevos', { n: r.nuevos }) : 'No hay streams nuevos'); } catch (er) { aviso(er.message, true); }
      b.disabled = false; return this.cargar();
    }
    if (e.target.closest('#rvMedal')) return this.abrirMedal();
    const mb = e.target.closest('[data-m]'); if (mb) return this.clicMedal(mb);
    const g = e.target.closest('[data-g]'); if (g) return this.clicPanel(g);
    const st = e.target.closest('[data-st]'); if (st) return this.clicSubs(st);
    const a = e.target.closest('[data-a]'); if (!a) return;
    const tarjeta = a.closest('.rv-clip, .rve'); if (!tarjeta) return;
    const id = tarjeta.dataset.id;
    if (a.dataset.a === 'ver') { await this.verVideo(tarjeta, id); return; }
    if (a.dataset.a === 'marcar') {                      // ⏱ = el momento en que está el vídeo
      const vid = $('video', tarjeta); if (!vid) return aviso('Dale a ▶ primero', true);
      $('.rv-' + a.dataset.campo, tarjeta).value = RV_mmss(vid.currentTime);
      return;
    }
    if (a.dataset.a === 'ir') {                          // un fallo de calidad o un comentario → ese momento del vídeo
      const vid = $('video', tarjeta); if (!vid) return aviso('Dale a ▶ primero', true);
      vid.currentTime = Math.max(0, +a.dataset.t - 0.5); vid.pause();
      return;
    }
    this.coms = this.coms || new Map();
    if (a.dataset.a === 'comentar') {                    // 💬 = el comentario queda anclado al momento que se ve
      const vid = $('video', tarjeta); if (!vid) return aviso('Dale a ▶ primero', true);
      const caja = $('.rv-ctexto', tarjeta), texto = caja.value.trim(); if (!texto) return aviso('Escribe el comentario', true);
      vid.pause();
      this.coms.set(id, [...(this.coms.get(id) || []), { t: +vid.currentTime.toFixed(1), texto }].sort((x, y) => x.t - y.t));
      this.pintarComs(id); $('.rv-ctexto', tarjeta)?.focus();
      return;
    }
    if (a.dataset.a === 'quitarcom') { const l = [...(this.coms.get(id) || [])]; l.splice(+a.dataset.i, 1); this.coms.set(id, l); return this.pintarComs(id); }
    if (a.dataset.a === 'portada') {
      a.disabled = true;
      try { await api('POST', `/revision/${encodeURIComponent(id)}/portada`, { indice: +a.dataset.i }); aviso('Portada elegida'); this.firma = null; await this.cargar(); }
      catch (er) { aviso(er.message, true); a.disabled = false; }
      return;
    }
    // qué se manda: acción → [ruta, cuerpo]
    let ruta = a.dataset.a, cuerpo = {};
    if (ruta === 'rehacer') cuerpo = { estilo: $('.rv-acc .rv-estilo', tarjeta).value || undefined };
    if (ruta === 'pedir') {
      const pedido = $('.rv-pedido', tarjeta).value.trim(); if (!pedido) return aviso('Escribe qué quieres cambiar', true);
      ruta = 'modificar'; cuerpo = { pedido }; aviso('Entendiendo el pedido…');
    }
    if (ruta === 'vibracion') {
      const modo = $('.rv-vmodo', tarjeta).value, intensidad = +$('.rv-int', tarjeta).value;
      let temblor;
      if (modo === 'quitar') temblor = false;
      else if (modo === 'intensidad') temblor = { intensidad };
      else {
        const d = RV_seg($('.rv-desde', tarjeta).value), h = RV_seg($('.rv-hasta', tarjeta).value);
        if (!(h > d)) return aviso('Pon desde y hasta (p. ej. 0:40 y 0:55)', true);
        const v = RV_vista(this.L.clips.find(x => x.id === id));
        temblor = { tramos: [[v.aOrig(d), v.aOrig(h)]], intensidad };
      }
      ruta = 'modificar'; cuerpo = { ajustes: { temblor } };
    }
    if (ruta === 'recortar' || ruta === 'sinrecorte') {
      let recorte = null;
      if (ruta === 'recortar') {
        const v = RV_vista(this.L.clips.find(x => x.id === id));
        const d = RV_seg($('.rv-rdesde', tarjeta).value), h = RV_seg($('.rv-rhasta', tarjeta).value);
        if (!(h > d)) return aviso('Pon dónde empieza y dónde termina (p. ej. 0:00 y 1:37)', true);
        recorte = [d <= v.dA ? v.rd : v.aOrig(d), Math.min(v.dur, v.aOrig(h))];   // dentro del avance = el inicio de siempre
        if (recorte[1] - recorte[0] < 3) return aviso('Pon dónde empieza y dónde termina (p. ej. 0:00 y 1:37)', true);
        if (recorte[0] <= 0.05 && recorte[1] >= v.dur - 0.05) recorte = null;
      }
      ruta = 'modificar'; cuerpo = { ajustes: { recorte } };
    }
    if (ruta === 'enviarcom') {
      const comentarios = this.coms.get(id) || []; if (!comentarios.length) return;
      ruta = 'modificar'; cuerpo = { comentarios }; aviso('Entendiendo el pedido…');
    }
    if (ruta === 'aplicarestilo') {
      const c = this.L.clips.find(x => x.id === id), aj = c.ajustes || {}, val = n => $(`[name="${n}"]:checked`, tarjeta)?.value ?? '';
      const estilo = val('rve-est') || c.estilo, emojis = val('rve-emojis'), red = val('rve-red');
      const colorSubs = $('.rve-propios', tarjeta).checked
        ? Object.fromEntries($$('[data-color]', tarjeta).filter(i => !i.closest('[hidden]')).map(i => [i.dataset.color, i.value])) : null;
      const nuevos = { estilo, colorSubs, emojis: emojis === '' ? null : emojis === 'true', banner: val('rve-banner') === 'false' ? false : null, plataforma: red || null };
      const antes = { estilo: aj.estilo || c.estilo, colorSubs: aj.colorSubs || null, emojis: aj.emojis ?? null, banner: aj.banner === false ? false : null, plataforma: aj.plataforma || null };
      if (JSON.stringify(nuevos) === JSON.stringify(antes)) return aviso('No cambiaste nada', true);
      ruta = 'modificar'; cuerpo = { ajustes: nuevos };
    }
    if (ruta === 'vincular') { cuerpo = { url: $('.rv-vurl', tarjeta).value.trim() }; if (!cuerpo.url) return aviso('Pega el enlace', true); }
    if (ruta === 'abrir') aviso('Abriendo FilmCraft…');
    a.disabled = true;
    // en el editor, aprobar o descartar pasa solo al siguiente clip pendiente (o vuelve a la lista)
    const pasar = !!this.idEd && ['aprobar', 'descartar'].includes(ruta);
    const siguiente = pasar && (() => {
      const l = this.pendientes(this.L).filter(x => ['revisar', 'error'].includes(x.estado)), i = l.findIndex(x => x.id === id);
      return l[i + 1] || l[i - 1] || null;
    })();
    try {
      const r = await api('POST', `/revision/${encodeURIComponent(id)}/${ruta}`, cuerpo);
      if (cuerpo.comentarios) this.coms.delete(id);
      if (pasar) {
        aviso(ruta === 'aprobar' ? 'Aprobado: está en la carpeta de aprobados' : 'Descartado');
        this.ed = null; location.hash = siguiente ? `#/revision/${encodeURIComponent(siguiente.id)}` : '#/revision';
        return;
      }
      if (this.idEd) this.firmaEd = null;
      aviso(ruta === 'modificar' ? (r?.respuesta || (cuerpo.comentarios ? 'Se rehace con tus comentarios' : 'Se rehace con tus cambios'))
        : { aprobar: 'Aprobado: está en la carpeta de aprobados', rehacer: 'Se rehace con otro estilo', descartar: 'Descartado', abrir: 'Abierto en FilmCraft', exportar: 'Exportando lo retocado', '4k': '4K en cola',
          youtube: 'En cola para YouTube', redes: 'Preparando títulos e inglés', vincular: 'Vinculado: se mide en la próxima pasada' }[ruta]);
      if (ruta === 'abrir') { a.disabled = false; return; }
      this.firma = null; await this.cargar();
    } catch (er) { aviso(er.message, true); a.disabled = false; }
  },
};
