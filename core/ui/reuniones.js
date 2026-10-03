// Reuniones (#/reuniones, #/reuniones/<id>): APOLO toma notas de Meet/Teams/Zoom (subtítulos vía la extensión) o de cualquier
// llamada (audio local mic + sistema → Whisper), y al terminar resume: decisiones, tareas, preguntas abiertas y temas.
// Transcripción buscable con hablantes, crear tareas/recordatorios, enviar al móvil y exportar .md. Globales con prefijo RN_.
P.reunion = '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>';
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'dashboards'), 0, ['reuniones', 'Reuniones', 'reunion']);

Object.assign(I18N.dic.en, {
  'Reuniones': 'Meetings', 'APOLO toma notas de tus reuniones y llamadas, y al terminar te deja el resumen, las decisiones y las tareas.': 'APOLO takes notes of your meetings and calls, and when they end leaves you the summary, decisions and tasks.',
  'Notas en el navegador': 'Notes in the browser', 'Grabar audio local': 'Record local audio', 'Meet, Teams o Zoom web: lee los subtítulos en vivo (sin audio).': 'Meet, Teams or Zoom web: reads the live captions (no audio).',
  'Discord, Zoom de escritorio, llamadas…: tu micrófono ("yo") + el audio del PC ("ellos") → Whisper.': 'Discord, desktop Zoom, calls…: your mic ("me") + PC audio ("them") → Whisper.',
  'Tomando notas': 'Taking notes', 'Parar y resumir': 'Stop and summarize', 'Subtítulos apagados en la reunión': 'Captions are off in the meeting', 'Activarlos': 'Turn them on',
  'Siempre en Google Meet': 'Always in Google Meet', 'Empieza a tomar notas sola al entrar en una sala de Meet (con la extensión).': 'Starts taking notes by itself when you join a Meet room (with the extension).',
  'Aviso legal': 'Legal notice', 'Grabar o transcribir una conversación puede requerir el consentimiento de todos los participantes según tu país. Tú eres responsable de informarles.': 'Recording or transcribing a conversation may require every participant\'s consent depending on your country. You are responsible for informing them.',
  'Entendido, empezar': 'Understood, start', 'Título (opcional)': 'Title (optional)', 'Buscar en reuniones y transcripciones…': 'Search meetings and transcripts…', 'Buscar en la transcripción…': 'Search the transcript…',
  'Aún no hay reuniones. Abre una reunión de Meet y pulsa «Notas en el navegador», o graba una llamada.': 'No meetings yet. Open a Meet call and press «Notes in the browser», or record a call.',
  'Resumen': 'Summary', 'Decisiones': 'Decisions', 'Tareas': 'Tasks', 'Preguntas abiertas': 'Open questions', 'Temas': 'Topics', 'Transcripción': 'Transcript',
  'Crear tareas y recordatorios': 'Create tasks and reminders', 'Enviar al móvil': 'Send to phone', 'Exportar .md': 'Export .md', 'Resumir de nuevo': 'Summarize again', 'Borrar reunión': 'Delete meeting',
  '¿Borrar esta reunión?': 'Delete this meeting?', 'Se borran la transcripción y el resumen. Las tareas ya creadas se quedan.': 'The transcript and summary are deleted. Tasks already created stay.',
  'yo': 'me', 'ellos': 'them', 'grabando': 'recording', 'resumiendo': 'summarizing', 'lista': 'ready', 'error': 'error', 'subtítulos': 'captions', 'audio local': 'local audio',
  '{n} fragmentos': '{n} fragments', '{n} tareas': '{n} tasks', 'creada': 'created', 'Enviado al móvil': 'Sent to phone', '{n} tareas creadas': '{n} tasks created', 'Resumiendo…': 'Summarizing…',
  'Sin resumen todavía.': 'No summary yet.', 'El resumen, las decisiones y las tareas aparecen aquí al parar.': 'The summary, decisions and tasks show up here when you stop.', 'Esperando lo que se diga…': 'Waiting for someone to speak…', 'Nada coincide': 'Nothing matches', 'Volver': 'Back', 'sin fecha → mañana 9:00': 'no date → tomorrow 9:00',
});

let RN_cols = {};                                           // color por hablante en orden de aparición (sin choques entre los primeros 8)
const RN_COL = n => { if (!RN_cols[n]) RN_cols[n] = `var(--s${(Object.keys(RN_cols).length % 8) + 1})`; return RN_cols[n]; };
const RN_mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const RN_ESTADO = { grabando: 'mal', resumiendo: 'aviso', lista: 'ok', error: 'mal' };
const RN_hablante = h => (h === 'yo' || h === 'ellos' ? tr(h) : h);
const RN_resaltar = (t, q) => { const e = esc(t); if (!q) return e; const i = e.toLowerCase().indexOf(esc(q).toLowerCase()); return i < 0 ? e : `${e.slice(0, i)}<mark>${e.slice(i, i + esc(q).length)}</mark>${e.slice(i + esc(q).length)}`; };

async function RN_empezar(fuente) {
  const v = await modal({ titulo: fuente === 'audio' ? 'Grabar audio local' : 'Notas en el navegador', ancho: 520,
    cuerpo: `<div class="rn-legal">${ic('escudo')}<div><b>${tr('Aviso legal')}</b><p>${tr('Grabar o transcribir una conversación puede requerir el consentimiento de todos los participantes según tu país. Tú eres responsable de informarles.')}</p></div></div>
      <p class="suave">${tr(fuente === 'audio' ? 'Discord, Zoom de escritorio, llamadas…: tu micrófono ("yo") + el audio del PC ("ellos") → Whisper.' : 'Meet, Teams o Zoom web: lee los subtítulos en vivo (sin audio).')}</p>
      <div class="campo">${tr('Título (opcional)')}<input id="rnT"></div>`,
    botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Entendido, empezar', cls: 'pri', valor: x => ({ titulo: $('#rnT', x).value.trim() }) }] });
  if (!v) return;
  try { await api('POST', '/reuniones', { fuente, titulo: v.titulo || undefined }); VISTAS.reuniones.refrescar(); }
  catch (e) { aviso(e.message, true); }
}

VISTAS.reuniones = {
  async pintar(v, sub) {
    this.salir(); this.v = v;
    if (sub) return this.detalle(v, sub);
    const L = await api('GET', '/reuniones' + (this.q ? `?q=${encodeURIComponent(this.q)}` : ''));
    this.L = L;
    v.innerHTML = `<div class="pagina">${cabecera('Reuniones', 'APOLO toma notas de tus reuniones y llamadas, y al terminar te deja el resumen, las decisiones y las tareas.')}
      <div id="rnActiva"></div>
      <div class="rn-modos">
        <button class="caja rn-modo" data-f="navegador" ${L.activa ? 'disabled' : ''}>${ic('mundo')}<b>${tr('Notas en el navegador')}</b><small>${tr('Meet, Teams o Zoom web: lee los subtítulos en vivo (sin audio).')}</small></button>
        <button class="caja rn-modo" data-f="audio" ${L.activa ? 'disabled' : ''}>${ic('micro')}<b>${tr('Grabar audio local')}</b><small>${tr('Discord, Zoom de escritorio, llamadas…: tu micrófono ("yo") + el audio del PC ("ellos") → Whisper.')}</small></button>
      </div>
      <div class="caja pad rn-regla"><div><b>${tr('Siempre en Google Meet')}</b><small class="tenue">${tr('Empieza a tomar notas sola al entrar en una sala de Meet (con la extensión).')}</small></div>${sw('siempreMeet', L.config.siempreMeet)}</div>
      <div class="rn-busca">${ic('buscar')}<input id="rnQ" placeholder="${esc(tr('Buscar en reuniones y transcripciones…'))}" value="${esc(this.q || '')}"></div>
      <div id="rnLista">${this.lista(L.reuniones)}</div></div>`;
    this.pintarActiva(L.activa);
    v.onclick = async e => {
      const m = e.target.closest('.rn-modo'); if (m && !m.disabled) return RN_empezar(m.dataset.f);
      const s = e.target.closest('[data-sw="siempreMeet"]');
      if (s) { const on = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', on); try { await api('PATCH', '/reuniones/config', { siempreMeet: on }); } catch (er) { aviso(er.message, true); } }
      if (e.target.closest('#rnParar')) { e.target.closest('#rnParar').disabled = true; api('POST', '/reuniones/parar').catch(er => aviso(er.message, true)); }
      if (e.target.closest('#rnAct')) api('POST', '/reuniones/activar-subtitulos').catch(er => aviso(er.message, true));
    };
    let t; $('#rnQ', v).oninput = e => { clearTimeout(t); t = setTimeout(async () => { this.q = e.target.value.trim(); const r = await api('GET', '/reuniones' + (this.q ? `?q=${encodeURIComponent(this.q)}` : '')); $('#rnLista', v).innerHTML = this.lista(r.reuniones); }, 250); };
  },
  lista(rs) {
    if (!rs.length) return this.q ? `<p class="tenue">${tr('Nada coincide')}</p>` : `<div class="caja pad rn-vacio">${ic('reunion')}<p>${tr('Aún no hay reuniones. Abre una reunión de Meet y pulsa «Notas en el navegador», o graba una llamada.')}</p></div>`;
    return `<div class="rn-lista">${rs.map(r => `<a class="caja rn-item" href="#/reuniones/${esc(r.id)}">
      <div class="rn-item-cab"><b>${esc(r.titulo)}</b><span class="chip ${RN_ESTADO[r.estado] || ''}">${tr(r.estado)}</span></div>
      <small class="tenue">${new Date(r.inicio).toLocaleString(I18N.idioma() === 'en' ? 'en' : 'es', { dateStyle: 'medium', timeStyle: 'short' })}${r.fin ? ` · ${Math.max(1, Math.round((r.fin - r.inicio) / 60000))} min` : ''} · ${tr(r.fuente === 'audio' ? 'audio local' : 'subtítulos')}${r.plataforma ? ` ${esc(r.plataforma)}` : ''} · ${tr('{n} fragmentos', { n: r.segmentos })}${r.tareas ? ` · ${tr('{n} tareas', { n: r.tareas })}` : ''}</small>
      ${r.resumen ? `<p class="rn-item-res">${esc(r.resumen)}</p>` : ''}
      ${r.temas.length ? `<div class="flex">${r.temas.slice(0, 6).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}</a>`).join('')}</div>`;
  },
  pintarActiva(a) {
    const el = $('#rnActiva', this.v); if (!el) return;
    clearInterval(this.reloj);
    if (!a) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="caja rn-activa"><span class="rn-rec"></span><div class="crece"><b>${tr('Tomando notas')}: ${esc(a.titulo)}</b>
      <small class="tenue"><span id="rnReloj">${RN_mmss(Date.now() - a.inicio)}</span> · ${tr(a.fuente === 'audio' ? 'audio local' : 'subtítulos')} · ${tr('{n} fragmentos', { n: a.segmentos })}</small>
      ${a.subtitulos === false ? `<div class="rn-aviso">${ic('info')}${tr('Subtítulos apagados en la reunión')} <button class="btn" id="rnAct">${tr('Activarlos')}</button></div>` : ''}</div>
      <a class="btn" href="#/reuniones/${esc(a.id)}">${ic('lista')}${tr('Transcripción')}</a><button class="btn mal pri" id="rnParar">${ic('parar')}${tr('Parar y resumir')}</button></div>`;
    this.reloj = setInterval(() => { const r = $('#rnReloj', this.v); if (r) r.textContent = RN_mmss(Date.now() - a.inicio); }, 1000);
  },
  async refrescar() { if (this.v && E.vista === this) { if (this.id) this.detalle(this.v, this.id); else this.pintar(this.v); } },

  async detalle(v, id) {
    this.id = id;
    const r = this.r = await api('GET', `/reuniones/${encodeURIComponent(id)}`);
    const R = r.resumen, cre = r.tareasCreadas || {};
    const hablantes = [...new Set(r.segmentos.map(s => s.hablante))]; RN_cols = {};
    const bloque = (t, xs) => (xs?.length ? `<div class="seccion">${tr(t)}<span class="n">${xs.length}</span></div><ul class="rn-ul">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
    v.innerHTML = `<div class="pagina"><div class="cab-pag"><div><a href="#/reuniones" class="tenue db-volver">${ic('izq')}${tr('Reuniones')}</a><h1>${esc(r.titulo)}</h1>
        <p>${new Date(r.inicio).toLocaleString(I18N.idioma() === 'en' ? 'en' : 'es', { dateStyle: 'full', timeStyle: 'short' })}${r.fin ? ` · ${Math.max(1, Math.round((r.fin - r.inicio) / 60000))} min` : ''} · ${tr(r.fuente === 'audio' ? 'audio local' : 'subtítulos')}${r.plataforma ? ` ${esc(r.plataforma)}` : ''} <span class="chip ${RN_ESTADO[r.estado] || ''}">${tr(r.estado)}</span></p></div>
        <div class="flex">${r.estado === 'grabando' ? `<button class="btn mal pri" id="rnParar">${ic('parar')}${tr('Parar y resumir')}</button>` : `
          <button class="btn" id="rnEnv" ${R ? '' : 'disabled'}>${ic('movil')}${tr('Enviar al móvil')}</button><button class="btn" id="rnMd">${ic('archivo')}${tr('Exportar .md')}</button>
          <button class="btn fantasma icono" id="rnRes" title="${tr('Resumir de nuevo')}" ${r.segmentos.length ? '' : 'disabled'}>${ic('recargar')}</button><button class="btn fantasma icono mal" id="rnDel" title="${tr('Borrar reunión')}">${ic('basura')}</button>`}</div></div>
      ${r.avisos?.length ? `<div class="rn-aviso">${ic('info')}${esc(r.avisos.slice(-2).join(' · '))}</div>` : ''}
      <div class="rn-det">
        <div class="caja pad rn-res">${R ? `<div class="seccion" style="margin-top:0">${tr('Resumen')}</div><p class="rn-txt">${esc(R.resumen)}</p>
          ${bloque('Decisiones', R.decisiones)}
          ${R.tareas.length ? `<div class="seccion">${tr('Tareas')}<span class="n">${R.tareas.length}</span></div><div class="rn-tareas">${R.tareas.map((t, i) => `<label class="rn-tarea"><input type="checkbox" data-i="${i}" ${cre[i] ? 'checked disabled' : 'checked'}><span><b>${esc(t.quien ? RN_hablante(t.quien) : '')}</b>${t.quien ? ' · ' : ''}${esc(t.que)}<small class="tenue"> · ${esc(t.cuando || tr('sin fecha → mañana 9:00'))}</small>${cre[i] ? ` <span class="chip ok">${ic('check')}${tr('creada')}</span>` : ''}</span></label>`).join('')}</div>
            <button class="btn pri" id="rnTar" ${R.tareas.every((_, i) => cre[i]) ? 'disabled' : ''}>${ic('reloj')}${tr('Crear tareas y recordatorios')}</button>` : ''}
          ${bloque('Preguntas abiertas', R.preguntasAbiertas)}
          ${R.temas.length ? `<div class="seccion">${tr('Temas')}</div><div class="flex">${R.temas.map(x => `<span class="chip acento">${esc(x)}</span>`).join('')}</div>` : ''}`
          : r.estado === 'grabando' ? `<div class="flex"><span class="rn-rec"></span><b>${tr('Tomando notas')}…</b></div><p class="tenue">${tr('El resumen, las decisiones y las tareas aparecen aquí al parar.')}</p>`
          : `<p class="tenue">${tr(r.estado === 'resumiendo' ? 'Resumiendo…' : 'Sin resumen todavía.')}</p>`}</div>
        <div class="caja rn-trans"><div class="rn-trans-cab"><b>${tr('Transcripción')}</b><div class="flex">${hablantes.map(h => `<span class="chip" style="border-color:${RN_COL(h)}"><span class="rn-pt" style="background:${RN_COL(h)}"></span>${esc(RN_hablante(h))}</span>`).join('')}</div>
          <div class="rn-busca">${ic('buscar')}<input id="rnTq" placeholder="${esc(tr('Buscar en la transcripción…'))}"></div></div><div id="rnSegs" class="rn-segs"></div></div>
      </div></div>`;
    this.pintarSegs();
    $('#rnTq', v).oninput = e => this.pintarSegs(e.target.value.trim());
    v.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      try {
        if (b.id === 'rnParar') { b.disabled = true; await api('POST', '/reuniones/parar'); }
        if (b.id === 'rnRes') { b.classList.add('girando'); await api('POST', `/reuniones/${encodeURIComponent(id)}/resumir`); }
        if (b.id === 'rnTar') { const indices = [...v.querySelectorAll('.rn-tarea input:checked:not(:disabled)')].map(x => +x.dataset.i); const x = await api('POST', `/reuniones/${encodeURIComponent(id)}/tareas`, { indices }); aviso(tr('{n} tareas creadas', { n: x.creadas.length })); }
        if (b.id === 'rnEnv') { await api('POST', `/reuniones/${encodeURIComponent(id)}/enviar`); aviso('Enviado al móvil'); return; }
        if (b.id === 'rnMd') { const x = await api('GET', `/reuniones/${encodeURIComponent(id)}/exportar`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x.md], { type: 'text/markdown' })); a.download = x.nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
        if (b.id === 'rnDel') { if (await confirmar('¿Borrar esta reunión?', 'Se borran la transcripción y el resumen. Las tareas ya creadas se quedan.', true)) { await api('DELETE', `/reuniones/${encodeURIComponent(id)}`); location.hash = '#/reuniones'; } return; }
        if (['rnRes', 'rnTar'].includes(b.id)) this.detalle(v, id);
      } catch (er) { aviso(er.message, true); b.classList.remove('girando'); b.disabled = false; }
    };
  },
  pintarSegs(q = this.tq || '') {
    this.tq = q; const el = $('#rnSegs', this.v); if (!el || !this.r) return;
    const ql = q.toLowerCase();
    const segs = this.r.segmentos.filter(s => !ql || s.texto.toLowerCase().includes(ql) || String(s.hablante).toLowerCase().includes(ql));
    el.innerHTML = segs.length ? segs.map(s => `<div class="rn-seg"><span class="rn-t">${RN_mmss(s.t)}</span><div><b style="color:${RN_COL(s.hablante)}">${esc(RN_hablante(s.hablante))}</b><p>${RN_resaltar(s.texto, q)}</p></div></div>`).join('')
      : `<p class="tenue" style="padding:14px">${tr(q ? 'Nada coincide' : 'Esperando lo que se diga…')}</p>`;
  },
  alEvento(e) {
    if (e.tipo !== 'reunion') return;
    if (this.id && e.id === this.id) {
      if (e.accion === 'segmento' && e.segmento && this.r) {
        const segs = this.r.segmentos, s = e.segmento;
        const i = segs.findIndex(x => (s.bloque && x.bloque === s.bloque) || (!s.bloque && x.t === s.t && x.fuente === s.fuente));
        if (i >= 0) segs[i] = s; else { segs.push(s); segs.sort((a, b) => a.t - b.t); }
        const abajo = (() => { const el = $('#rnSegs', this.v); return el && el.scrollTop + el.clientHeight >= el.scrollHeight - 30; })();
        this.pintarSegs(); if (abajo) { const el = $('#rnSegs', this.v); el.scrollTop = el.scrollHeight; }
      } else if (e.accion !== 'segmento') clearTimeout(this.rt), this.rt = setTimeout(() => this.refrescar(), 300);
    } else if (!this.id && e.accion !== 'segmento') { clearTimeout(this.rt); this.rt = setTimeout(() => this.refrescar(), 300); }
    else if (!this.id && e.accion === 'segmento' && this.L?.activa) { this.L.activa.segmentos++; }
  },
  salir() { clearInterval(this.reloj); this.id = null; this.r = null; },
};
