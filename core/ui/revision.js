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
  if (aj.correcciones?.length) out.push(`${tr('correcciones')}: ${aj.correcciones.map(x => `${x.mal} → ${x.bien}`).join(', ')}`);
  if (aj.rotulos?.length) out.push(`${tr('rótulos')}: ${aj.rotulos.map(x => `${x.nombre} ${RV_mmss(x.t)}`).join(', ')}`);
  if (aj.quitarEmojis?.length) out.push(`${tr('emojis quitados')}: ${aj.quitarEmojis.map(RV_mmss).join(', ')}`);
  if (aj.sinEfectos?.length) out.push(`${tr('sin efectos')}: ${aj.sinEfectos.map(([d, h]) => `${RV_mmss(d)}–${RV_mmss(h)}`).join(', ')}`);
  for (const [k, v] of Object.entries(aj)) if (!['temblor', 'avance', 'recorte', 'correcciones', 'rotulos', 'quitarEmojis', 'sinEfectos'].includes(k)) out.push(`${k}: ${v === false ? 'no' : v === true ? 'sí' : Array.isArray(v) ? v.length : v}`);
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
function RV_cambios(c) {
  const v = RV_vista(c);
  const tb = c.ajustes?.temblor, t0 = tb?.tramos?.[0], tramo = t0 && [v.aVista(t0[0]), v.aVista(t0[1])];
  const modo = tb === false ? 'quitar' : tramo ? 'tramo' : tb ? 'intensidad' : 'tramo';
  const int = tb && tb.intensidad != null ? tb.intensidad : 100;
  return `<details class="rv-cambios"><summary>${tr('Cambios y edición a mano')}</summary>
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
  async pintar(v) {
    this.salir(); this.v = v; this.urls = this.urls || new Map();
    v.innerHTML = `<div class="pagina">${cabecera('Revisión', 'Clips editados solos a partir de tus streams. Míralos y decide: aprobar, otro estilo o descartar. Nada se publica sin tu aprobación.',
      `<button class="btn" id="rvBuscar">${ic('buscar')}${tr('Buscar clips ahora')}</button>`)}
      <div id="rvEstado"></div>
      <div id="rvPanel"></div>
      <div class="rv-filtros">${RV_FILTROS.map(([k, t]) => `<button class="btn ${k === this.filtro ? 'pri' : 'fantasma'}" data-f="${k}">${tr(t)} <span class="rv-n" data-n="${k}"></span></button>`).join('')}</div>
      <div id="rvLista"></div></div>`;
    v.onclick = e => this.clic(e);
    v.onchange = e => {
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
    v.oninput = e => { if (e.target.matches('.rv-int')) e.target.parentElement.querySelector('.rv-intv').textContent = e.target.value + ' %'; };
    v.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('.rv-ctexto')) { e.preventDefault(); e.target.closest('.rv-comentar').querySelector('[data-a="comentar"]').click(); } };
    await this.cargar();
    this.reloj = setInterval(() => this.cargar(true), 3000);
  },
  salir() { clearInterval(this.reloj); },
  async cargar(silencio) {
    let L; try { L = await api('GET', '/revision'); } catch (e) { if (!silencio) aviso(e.message, true); return; }
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
          <div class="flex rv-cab"><b>#${c.rank}</b><span class="tenue">${RV_mmss(c.fin - c.inicio)} · ${RV_mmss(c.inicio)} del stream</span><span class="chip ${cls}">${esc(tr(txt))}</span>${c.estilo ? `<span class="chip">${esc(c.estilo)}</span>` : ''}${c.momento?.tipo ? `<span class="chip" title="${esc(tr('Reacción del chat'))}">${{ risa: '😂', choque: '💥', hype: '🔥', apoyo: '💲', charla: '💬' }[c.momento.tipo] || '💬'} ${esc(tr(c.momento.tipo))}${c.momento.autores ? ` · ${c.momento.autores} 👤` : ''}</span>` : ''}</div>
          ${c.gancho ? `<div class="rv-gancho">${esc(c.gancho)}</div>` : ''}
          ${c.escenas?.length ? `<small class="tenue">${tr('Escenas')}: ${c.escenas.map(s => `${esc(s.tipo)} ${RV_mmss(s.desde)}`).join(' · ')}${c.emojis ? ` · ${c.emojis} emojis` : ''}</small>` : ''}
          ${c.plan ? `<small class="tenue">🎬 ${tr('Director')}: ${(c.disenos || []).map(d => `${d.tipo === 'podcast' ? '🎙️ podcast' : '🪟 ' + tr('ventanita')} ${RV_mmss(d.desde)}–${RV_mmss(d.hasta)}`).join(' · ') || tr('sin diseños')}${c.sonidos ? ` · 🔊 ${c.sonidos} ${tr('sonidos')}` : ''}${(c.plan.emojis || []).length ? ` · ${c.plan.emojis.map(e => e.emoji).join('')}` : ''}</small>` : ''}
          ${c.dudas?.length ? `<div class="rv-dudas"><small>${tr('Whisper dudó en')}:</small> ${c.dudas.slice(0, 5).map(d => `<span>“${esc(d.texto)}” <i>${RV_mmss(d.s)}</i></span>`).join(' ')}</div>` : ''}
          ${c.chat?.length ? `<details class="rv-chat"><summary>${tr('Chat en ese momento')} (${c.chat.length})</summary>${c.chat.map(m => `<div>${esc(m)}</div>`).join('')}</details>` : ''}
          ${c.error ? `<div class="rv-error">${esc(c.error)}</div>` : ''}
          ${c.ajustes && Object.keys(c.ajustes).length ? `<div class="rv-ajustes">${tr('Cambios')}: ${esc(RV_ajustes(c.ajustes))}</div>` : ''}
          ${c.pedidos?.at(-1)?.respuesta ? `<div class="rv-respuesta">${esc(c.pedidos.at(-1).respuesta)}</div>` : ''}
          ${c.retocado ? `<span class="chip">${tr('retocado a mano')}</span>` : ''}
          ${listo ? RV_calidad(c) : ''}
          ${listo ? RV_portadas(c) : ''}
          ${c.estado === 'aprobado' ? `<div class="rv-k4 flex" data-k4="${esc(c.id)}">${RV_k4(c)}</div>${RV_publicacion(c, L)}` : ''}
          ${c.diccionario ? `<small class="tenue">📖 ${tr('diccionario')}: ${c.diccionario}</small>` : ''}
          ${c.estado === 'revisar' || c.estado === 'error' ? `<div class="rv-acc flex">
            ${c.estado === 'revisar' ? `<button class="btn pri" data-a="aprobar">${ic('check')}${tr('Aprobar')}</button>` : ''}
            <select class="rv-estilo"><option value="">${tr('Otro estilo')}…</option>${opciones}</select><button class="btn" data-a="rehacer">${tr('Rehacer')}</button>
            <button class="btn mal" data-a="descartar">${ic('x')}${tr('Descartar')}</button></div>
            ${c.estado === 'revisar' ? `<div data-coms="${esc(c.id)}">${RV_comentar(c, this.coms?.get(c.id))}</div>` : ''}${RV_cambios(c)}` : ''}
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
  // repinta solo la caja de comentarios de una tarjeta (sin tocar el vídeo que se está viendo)
  pintarComs(id) {
    const caja = $(`[data-coms="${CSS.escape(id)}"]`, this.v); if (!caja) return;
    caja.innerHTML = RV_comentar(this.L.clips.find(c => c.id === id), this.coms.get(id));
  },
  async clic(e) {
    const f = e.target.closest('[data-f]');
    if (f) { this.filtro = f.dataset.f; this.firma = null; $$('[data-f]', this.v).forEach(b => b.className = 'btn ' + (b.dataset.f === this.filtro ? 'pri' : 'fantasma')); return this.cargar(); }
    if (e.target.closest('#rvBuscar')) {
      const b = e.target.closest('#rvBuscar'); b.disabled = true; aviso('Buscando…');
      try { const r = await api('POST', '/revision/revisar'); aviso(r.nuevos ? tr('{n} clips nuevos', { n: r.nuevos }) : 'No hay streams nuevos'); } catch (er) { aviso(er.message, true); }
      b.disabled = false; return this.cargar();
    }
    const g = e.target.closest('[data-g]'); if (g) return this.clicPanel(g);
    const a = e.target.closest('[data-a]'); if (!a) return;
    const tarjeta = a.closest('.rv-clip'); if (!tarjeta) return;
    const id = tarjeta.dataset.id;
    if (a.dataset.a === 'ver') {
      const medio = $('.rv-medio', tarjeta); medio.innerHTML = `<div class="rv-hueco">…</div>`;
      try { const url = await RV_blob(`/revision/${encodeURIComponent(id)}/video`); medio.innerHTML = `<video src="${url}" controls autoplay playsinline></video>`; }
      catch (er) { medio.innerHTML = `<div class="rv-hueco">${esc(er.message)}</div>`; }
      return;
    }
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
    if (ruta === 'vincular') { cuerpo = { url: $('.rv-vurl', tarjeta).value.trim() }; if (!cuerpo.url) return aviso('Pega el enlace', true); }
    if (ruta === 'abrir') aviso('Abriendo FilmCraft…');
    a.disabled = true;
    try {
      const r = await api('POST', `/revision/${encodeURIComponent(id)}/${ruta}`, cuerpo);
      if (cuerpo.comentarios) this.coms.delete(id);
      aviso(ruta === 'modificar' ? (r?.respuesta || (cuerpo.comentarios ? 'Se rehace con tus comentarios' : 'Se rehace con tus cambios'))
        : { aprobar: 'Aprobado: está en la carpeta de aprobados', rehacer: 'Se rehace con otro estilo', descartar: 'Descartado', abrir: 'Abierto en FilmCraft', exportar: 'Exportando lo retocado', '4k': '4K en cola',
          youtube: 'En cola para YouTube', redes: 'Preparando títulos e inglés', vincular: 'Vinculado: se mide en la próxima pasada' }[ruta]);
      if (ruta === 'abrir') { a.disabled = false; return; }
      this.firma = null; await this.cargar();
    } catch (er) { aviso(er.message, true); a.disabled = false; }
  },
};
