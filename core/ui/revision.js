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
});

const RV_ESTADO = { editando: ['aviso', 'editando…'], 'en cola': ['', 'en cola'], revisar: ['ok', 'revisar'], aprobado: ['ok', 'aprobado'], descartado: ['', 'descartado'], error: ['mal', 'error'] };
const RV_mmss = s => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}`) + `:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const RV_FILTROS = [['revisar', 'Por revisar'], ['aprobado', 'Aprobados'], ['descartado', 'Descartados'], ['todos', 'Todos']];
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
    v.onchange = e => { if (e.target.matches('.rv-estilo')) e.target.closest('.rv-acc').querySelector('[data-a="rehacer"]').disabled = false; };
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
    this.firma = firma;
    $('#rvLista', this.v).innerHTML = this.lista(L);
    this.cargarPrevias();
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
          ${c.estado === 'revisar' || c.estado === 'error' ? `<div class="rv-acc flex">
            ${c.estado === 'revisar' ? `<button class="btn pri" data-a="aprobar">${ic('check')}${tr('Aprobar')}</button>` : ''}
            <select class="rv-estilo"><option value="">${tr('Otro estilo')}…</option>${opciones}</select><button class="btn" data-a="rehacer">${tr('Rehacer')}</button>
            <button class="btn mal" data-a="descartar">${ic('x')}${tr('Descartar')}</button></div>` : ''}
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
    a.disabled = true;
    try {
      const cuerpo = a.dataset.a === 'rehacer' ? { estilo: $('.rv-estilo', tarjeta).value || undefined } : {};
      await api('POST', `/revision/${encodeURIComponent(id)}/${a.dataset.a}`, cuerpo);
      aviso({ aprobar: 'Aprobado: está en la carpeta de aprobados', rehacer: 'Se rehace con otro estilo', descartar: 'Descartado' }[a.dataset.a]);
      this.firma = null; await this.cargar();
    } catch (er) { aviso(er.message, true); a.disabled = false; }
  },
};
