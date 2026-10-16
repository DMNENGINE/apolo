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
  'Escenas': 'Scenes', 'No hay clips aquí.': 'No clips here.', 'Aún no hay fuentes configuradas.': 'No sources configured yet.', 'Buscando…': 'Looking…',
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
  'Ej.: que empiece con el trozo de 0:45 a 0:47 y luego el clip entero · quita la vibración menos de 0:40 a 0:55 · quita el título · sin emojis': 'E.g.: start with the 0:45–0:47 bit and then the whole clip · remove the shake except 0:40–0:55 · remove the title · no emojis',
  'avance': 'teaser', 'al principio': 'at the start', 'Cambios': 'Changes', 'vibración': 'shake', 'quitada': 'removed', 'solo': 'only', 'al': 'at',
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
  for (const [k, v] of Object.entries(aj)) if (k !== 'temblor' && k !== 'avance') out.push(`${k}: ${v === false ? 'no' : v === true ? 'sí' : v}`);
  return out.join(' · ');
}
function RV_cambios(c) {
  const tb = c.ajustes?.temblor, tramo = tb?.tramos?.[0];
  const modo = tb === false ? 'quitar' : tramo ? 'tramo' : tb ? 'intensidad' : 'tramo';
  const int = tb && tb.intensidad != null ? tb.intensidad : 100;
  return `<details class="rv-cambios"><summary>${tr('Cambios y edición a mano')}</summary>
    <textarea class="rv-pedido" placeholder="${esc(tr('Ej.: que empiece con el trozo de 0:45 a 0:47 y luego el clip entero · quita la vibración menos de 0:40 a 0:55 · quita el título · sin emojis'))}"></textarea>
    <div class="rv-fila"><button class="btn pri" data-a="pedir">${tr('Pedir cambio')}</button></div>
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
      <div class="rv-filtros">${RV_FILTROS.map(([k, t]) => `<button class="btn ${k === this.filtro ? 'pri' : 'fantasma'}" data-f="${k}">${tr(t)} <span class="rv-n" data-n="${k}"></span></button>`).join('')}</div>
      <div id="rvLista"></div></div>`;
    v.onclick = e => this.clic(e);
    v.onchange = e => {
      if (e.target.matches('.rv-acc .rv-estilo')) e.target.closest('.rv-acc').querySelector('[data-a="rehacer"]').disabled = false;
      if (e.target.matches('.rv-vmodo')) {
        const box = e.target.closest('.rv-cambios');
        $('.rv-tramo', box).hidden = e.target.value !== 'tramo';
        $('.rv-intfila', box).hidden = e.target.value === 'quitar';
      }
    };
    v.oninput = e => { if (e.target.matches('.rv-int')) e.target.parentElement.querySelector('.rv-intv').textContent = e.target.value + ' %'; };
    await this.cargar();
    this.reloj = setInterval(() => this.cargar(true), 6000);
  },
  salir() { clearInterval(this.reloj); },
  async cargar(silencio) {
    let L; try { L = await api('GET', '/revision'); } catch (e) { if (!silencio) aviso(e.message, true); return; }
    const firma = JSON.stringify(L.clips.map(c => [c.id, c.estado, c.estilo, c.editado])) + this.filtro;
    this.L = L;
    this.pintarEstado(L);
    for (const [k] of RV_FILTROS) { const n = k === 'todos' ? L.clips.length : L.clips.filter(c => c.estado === k).length; const el = $(`[data-n="${k}"]`, this.v); if (el) el.textContent = n || ''; }
    if (silencio && firma === this.firma) return;        // nada cambió: no se repinta (no corta el vídeo que estás viendo)
    if (silencio && this.ocupado()) return;              // viendo un vídeo o escribiendo un cambio: se repinta luego
    this.firma = firma;
    $('#rvLista', this.v).innerHTML = this.lista(L);
    this.cargarPrevias();
  },
  ocupado() {
    const lista = $('#rvLista', this.v); if (!lista) return false;
    return $$('video', lista).some(x => !x.paused) || $$('.rv-cambios[open]', lista).length > 0 || lista.contains(document.activeElement);
  },
  pintarEstado(L) {
    const el = $('#rvEstado', this.v); if (!el) return;
    const ed = L.enCurso && L.clips.find(c => c.id === L.enCurso);
    el.innerHTML = !L.config.fuentes.length ? `<div class="caja pad tenue">${tr('Aún no hay fuentes configuradas.')}</div>`
      : ed || L.cola.length ? `<div class="caja pad rv-trabajando"><span class="punto aviso"></span>${ed ? `<b>${tr('Editando ahora')}:</b> ${esc(ed.titulo || ed.stream)} · #${ed.rank}` : ''}${L.cola.length ? ` · ${tr('{n} en cola', { n: L.cola.length })}` : ''}</div>` : '';
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
          <div class="flex rv-cab"><b>#${c.rank}</b><span class="tenue">${RV_mmss(c.fin - c.inicio)} · ${RV_mmss(c.inicio)} del stream</span><span class="chip ${cls}">${esc(tr(txt))}</span>${c.estilo ? `<span class="chip">${esc(c.estilo)}</span>` : ''}</div>
          ${c.gancho ? `<div class="rv-gancho">${esc(c.gancho)}</div>` : ''}
          ${c.escenas?.length ? `<small class="tenue">${tr('Escenas')}: ${c.escenas.map(s => `${esc(s.tipo)} ${RV_mmss(s.desde)}`).join(' · ')}${c.emojis ? ` · ${c.emojis} emojis` : ''}</small>` : ''}
          ${c.dudas?.length ? `<div class="rv-dudas"><small>${tr('Whisper dudó en')}:</small> ${c.dudas.slice(0, 5).map(d => `<span>“${esc(d.texto)}” <i>${RV_mmss(d.s)}</i></span>`).join(' ')}</div>` : ''}
          ${c.chat?.length ? `<details class="rv-chat"><summary>${tr('Chat en ese momento')} (${c.chat.length})</summary>${c.chat.map(m => `<div>${esc(m)}</div>`).join('')}</details>` : ''}
          ${c.error ? `<div class="rv-error">${esc(c.error)}</div>` : ''}
          ${c.ajustes && Object.keys(c.ajustes).length ? `<div class="rv-ajustes">${tr('Cambios')}: ${esc(RV_ajustes(c.ajustes))}</div>` : ''}
          ${c.pedidos?.at(-1)?.respuesta ? `<div class="rv-respuesta">${esc(c.pedidos.at(-1).respuesta)}</div>` : ''}
          ${c.retocado ? `<span class="chip">${tr('retocado a mano')}</span>` : ''}
          ${c.estado === 'revisar' || c.estado === 'error' ? `<div class="rv-acc flex">
            ${c.estado === 'revisar' ? `<button class="btn pri" data-a="aprobar">${ic('check')}${tr('Aprobar')}</button>` : ''}
            <select class="rv-estilo"><option value="">${tr('Otro estilo')}…</option>${opciones}</select><button class="btn" data-a="rehacer">${tr('Rehacer')}</button>
            <button class="btn mal" data-a="descartar">${ic('x')}${tr('Descartar')}</button></div>${RV_cambios(c)}` : ''}
        </div></div>`;
    }).join('')}</div>`).join('');
  },
  async cargarPrevias() {
    for (const img of $$('[data-previa]', this.v)) {
      const id = img.dataset.previa, k = 'p:' + id + (this.L.clips.find(c => c.id === id)?.editado || '');
      try { if (!this.urls.has(k)) this.urls.set(k, await RV_blob(`/revision/${encodeURIComponent(id)}/previa`)); img.src = this.urls.get(k); } catch { }
    }
  },
  async clic(e) {
    const f = e.target.closest('[data-f]');
    if (f) { this.filtro = f.dataset.f; this.firma = null; $$('[data-f]', this.v).forEach(b => b.className = 'btn ' + (b.dataset.f === this.filtro ? 'pri' : 'fantasma')); return this.cargar(); }
    if (e.target.closest('#rvBuscar')) {
      const b = e.target.closest('#rvBuscar'); b.disabled = true; aviso('Buscando…');
      try { const r = await api('POST', '/revision/revisar'); aviso(r.nuevos ? tr('{n} clips nuevos', { n: r.nuevos }) : 'No hay streams nuevos'); } catch (er) { aviso(er.message, true); }
      b.disabled = false; return this.cargar();
    }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const tarjeta = a.closest('.rv-clip'), id = tarjeta.dataset.id;
    if (a.dataset.a === 'ver') {
      const medio = $('.rv-medio', tarjeta); medio.innerHTML = `<div class="rv-hueco">…</div>`;
      try { const url = await RV_blob(`/revision/${encodeURIComponent(id)}/video`); medio.innerHTML = `<video src="${url}" controls autoplay playsinline></video>`; }
      catch (er) { medio.innerHTML = `<div class="rv-hueco">${esc(er.message)}</div>`; }
      return;
    }
    if (a.dataset.a === 'marcar') {                      // ⏱ = el momento en que está el vídeo
      const vid = $('video', tarjeta); if (!vid) return aviso('Dale a ▶ primero', true);
      $(a.dataset.campo === 'desde' ? '.rv-desde' : '.rv-hasta', tarjeta).value = RV_mmss(vid.currentTime);
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
        temblor = { tramos: [[d, h]], intensidad };
      }
      ruta = 'modificar'; cuerpo = { ajustes: { temblor } };
    }
    if (ruta === 'abrir') aviso('Abriendo FilmCraft…');
    a.disabled = true;
    try {
      const r = await api('POST', `/revision/${encodeURIComponent(id)}/${ruta}`, cuerpo);
      aviso(ruta === 'modificar' ? (r?.respuesta || 'Se rehace con tus cambios')
        : { aprobar: 'Aprobado: está en la carpeta de aprobados', rehacer: 'Se rehace con otro estilo', descartar: 'Descartado', abrir: 'Abierto en FilmCraft', exportar: 'Exportando lo retocado' }[ruta]);
      if (ruta === 'abrir') { a.disabled = false; return; }
      this.firma = null; await this.cargar();
    } catch (er) { aviso(er.message, true); a.disabled = false; }
  },
};
