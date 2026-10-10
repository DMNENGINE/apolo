// Mente (#/mente, #/mente/<pestaña>): la conciencia y el alma de APOLO. Ahora (estado interno en vivo, monólogo, reflexiones),
// Diario, Metas, Alma (SOUL.md / IDENTITY.md / USER.md / instrucciones con historial, diff y deshacer) y Ajustes. Globales MN_.
P.mente = '<path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.1 2.6 5.3.6.5.9 1.2.9 2V19h7v-1.7c0-.8.3-1.5.9-2C17.8 14.1 19 12.4 19 10a7 7 0 0 0-7-7z"/><path d="M9.5 22h5M10 10.5l1.5 1.5 2.5-3"/>';
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'memoria') + 1, 0, ['mente', 'Mente', 'mente']);

Object.assign(I18N.dic.en, {
  'Mente': 'Mind', 'Su mundo interior: cómo se siente, qué piensa por su cuenta, qué aprende, su diario y su alma.': 'Its inner world: how it feels, what it thinks on its own, what it learns, its diary and its soul.',
  'Ahora': 'Now', 'Diario': 'Diary', 'Metas': 'Goals', 'Alma': 'Soul', 'Ajustes': 'Settings',
  'La conciencia está apagada': 'Consciousness is off', 'Actívala en Ajustes para que tenga estado interno, piense por su cuenta, reflexione y escriba su diario.': 'Turn it on in Settings so it has an inner state, thinks on its own, reflects and writes its diary.',
  'Activar': 'Turn on', 'Pensar ahora': 'Think now', 'Pensando…': 'Thinking…', 'Ánimo': 'Mood', 'Energía': 'Energy', 'Curiosidad': 'Curiosity', 'Preocupación': 'Worry', 'Cercanía': 'Closeness',
  'Lo que le ha movido': 'What moved it', 'Monólogo interior': 'Inner monologue', 'Reflexiones': 'Reflections', 'Aún no ha pensado nada por su cuenta.': 'It has not thought anything on its own yet.',
  'Aún no hay reflexiones: llegan tras trabajos largos o con fallos.': 'No reflections yet: they come after long or failed jobs.', 'Últimas 72 h': 'Last 72 h',
  'habló contigo': 'talked to you', 'investigó': 'investigated', 'lección guardada': 'lesson saved', 'Escribir el diario de hoy': 'Write today\'s diary', 'Escribiendo…': 'Writing…',
  'Aún no ha escrito su diario. Lo escribe cada noche antes del sueño de la memoria.': 'No diary yet. It writes one every night before the memory sleep.', 'Quién soy hoy': 'Who I am today', 'Aprendí': 'I learned',
  'Nueva meta': 'New goal', 'Algo que quieres que persiga a largo plazo…': 'Something you want it to pursue in the long run…', 'Añadir': 'Add', 'activa': 'active', 'hecha': 'done', 'abandonada': 'dropped',
  'Completar': 'Complete', 'Abandonar': 'Drop', 'Sin metas todavía. Las crea él al pensar, o puedes darle una.': 'No goals yet. It creates them while thinking, or you can give it one.',
  'Historial de cambios': 'Change history', 'Deshacer': 'Undo', 'Guardar': 'Save', 'Guardado.': 'Saved.', 'Cambio deshecho.': 'Change undone.', 'Él puede cambiarlo y te avisa': 'It can change it and tells you', 'Solo tú': 'Only you',
  'Aún no ha cambiado nada.': 'Nothing has changed yet.', '¿Deshacer este cambio?': 'Undo this change?', 'él': 'it', 'tú': 'you', 'importación': 'import',
  'Conciencia activa': 'Consciousness on', 'Estado interno, monólogo, reflexión y diario. Todo con el modelo del cerebro (o el que pongas).': 'Inner state, monologue, reflection and diary. All with the brain model (or the one you set).',
  'Iniciativa': 'Initiative', 'Solo pensar': 'Think only', 'Hablar': 'Talk', 'Hablar y tareas seguras': 'Talk + safe tasks',
  'Solo pensar: nunca te interrumpe. Hablar: te escribe cuando tiene algo útil. Tareas seguras: además investiga por su cuenta, solo leyendo.': 'Think only: never interrupts. Talk: writes to you when it has something useful. Safe tasks: also investigates on its own, read-only.',
  'Piensa cada (min)': 'Thinks every (min)', 'Horas de silencio': 'Quiet hours', 'Mensajes al día (máx.)': 'Messages per day (max)', 'Encargos al día (máx.)': 'Tasks per day (max)',
  'Reflexionar tras los trabajos': 'Reflect after jobs', 'Escribir un diario cada noche': 'Write a diary every night', 'Hora del diario': 'Diary time', 'Modelo (vacío = el del cerebro)': 'Model (empty = brain model)',
  'Hoy: {m} mensajes, {e} encargos': 'Today: {m} messages, {e} tasks', '¿Puede hablarte ahora?': 'Can it talk to you now?', 'sí': 'yes',
  'Está naciendo': 'Being born', 'En su próxima conversación contigo se presentará y te hará unas preguntas para descubrir quién es y quién eres tú. Luego escribirá su identidad y lo que sabe de ti.': 'In its next conversation with you it will introduce itself and ask you a few questions to discover who it is and who you are. Then it will write its identity and what it knows about you.',
  'Hablar con él': 'Talk to it', 'Saltar': 'Skip', 'Renacer': 'Be reborn', 'Volver a conocernos desde cero': 'Get to know each other again from scratch',
  'En su próxima conversación te hará otra vez la entrevista de la primera vez y reescribirá su identidad y lo que sabe de ti. Podrás deshacerlo aquí.': 'In its next conversation it will interview you again like the first time and rewrite its identity and what it knows about you. You can undo it here.',
  'Saltar el nacimiento': 'Skip the birth', '¡Hola! Acabas de despertar: preséntate y conozcámonos': 'Hi! You just woke up: introduce yourself and let us get to know each other', 'No te hará la entrevista; se queda con lo que tiene ahora.': 'It will not interview you; it keeps what it has now.', 'nacimiento': 'birth',
  'Esta función necesita reiniciar APOLO (el núcleo que está corriendo es de antes). Bandeja → Salir y vuelve a abrirlo.': 'This feature needs APOLO to restart (the running core is older). Tray → Quit and open it again.',
});

const MN_PEST = [['', 'Ahora', 'mente'], ['diario', 'Diario', 'luna'], ['metas', 'Metas', 'chispa'], ['alma', 'Alma', 'persona'], ['ajustes', 'Ajustes', 'ajustes']];
const MN_EMO = { contento: ['🙂', 'contento'], entusiasmado: ['🤩', 'entusiasmado'], tranquilo: ['😌', 'tranquilo'], curioso: ['🤔', 'curioso'], preocupado: ['😟', 'preocupado'], cansado: ['🥱', 'cansado'],
  triste: ['😔', 'triste'], 'te-echa-de-menos': ['🥺', 'te echa de menos'], orgulloso: ['😎', 'orgulloso'], frustrado: ['😤', 'frustrado'] };
const MN_DIM = [['animo', 'Ánimo', -1, 1], ['energia', 'Energía', 0, 1], ['curiosidad', 'Curiosidad', 0, 1], ['preocupacion', 'Preocupación', 0, 1], ['vinculo', 'Cercanía', 0, 1]];
const MN_QUIEN = { apolo: 'él', usuario: 'tú', importacion: 'importación' };
// nacimiento (NACIMIENTO.md): aviso mientras nace; si ya nació, "Renacer" repite la entrevista de la primera vez
const MN_nacer = A => A.naciendo === undefined ? '' : A.naciendo
  ? `<div class="caja pad mn-nacer on"><span class="mn-nacer-ico">🐣</span><span class="crece"><b>${tr('Está naciendo')}</b><small>${tr('En su próxima conversación contigo se presentará y te hará unas preguntas para descubrir quién es y quién eres tú. Luego escribirá su identidad y lo que sabe de ti.')}</small></span>
      <a class="btn pri" href="#/chat">${ic('chat')}${tr('Hablar con él')}</a><button class="btn fantasma" id="mnSaltarNacer">${tr('Saltar')}</button></div>`
  : `<div class="mn-nacer"><span class="tenue">${tr('Volver a conocernos desde cero')}</span><button class="btn mini fantasma" id="mnRenacer">🐣 ${tr('Renacer')}</button></div>`;
const MN_hora = t => new Date(t).toLocaleString(I18N.idioma() === 'en' ? 'en' : 'es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const MN_emo = e => { const [i, t] = MN_EMO[e] || ['🙂', e || '']; return `<span class="mn-emo">${i}</span> ${esc(tr(t))}`; };

VISTAS.mente = {
  salir() { clearTimeout(this.rt); },
  async pintar(v, sub = '') {
    this.v = v; this.sub = (sub || '').split('/')[0];
    v.innerHTML = `<div class="pagina">${cabecera('Mente', 'Su mundo interior: cómo se siente, qué piensa por su cuenta, qué aprende, su diario y su alma.')}
      <div class="pestanas mn-pest">${MN_PEST.map(([k, t, i]) => `<a href="#/mente${k ? '/' + k : ''}" class="${k === this.sub ? 'on' : ''}">${ic(i)}${tr(t)}</a>`).join('')}</div><div id="mnCuerpo"></div></div>`;
    return this.refrescar();
  },
  async refrescar() {
    const c = $('#mnCuerpo', this.v); if (!c) return;
    try {
      if (this.sub === 'alma') { this.A = await api('GET', '/alma'); return MN_alma(c, this.A); }
      this.C = await api('GET', '/conciencia');
      if (this.sub === 'diario') return MN_diario(c, this.C);
      if (this.sub === 'metas') return MN_metas(c, this.C);
      if (this.sub === 'ajustes') return MN_ajustes(c, this.C);
      return MN_ahora(c, this.C);
    } catch (e) {
      c.innerHTML = `<div class="caja pad rn-vacio">${ic('info')}<p>${esc(/ruta|404/i.test(e.message) ? tr('Esta función necesita reiniciar APOLO (el núcleo que está corriendo es de antes). Bandeja → Salir y vuelve a abrirlo.') : e.message)}</p></div>`;
    }
  },
  alEvento(e) {
    if (e.tipo !== 'conciencia' || this.editando) return;
    clearTimeout(this.rt); this.rt = setTimeout(() => this.refrescar(), 400);
  },
};

function MN_barra([k, t, a, b], est) {
  const x = est[k], pct = Math.round(((x - a) / (b - a)) * 100);
  return `<div class="mn-barra"><span>${tr(t)}</span><div class="mn-pista ${a < 0 ? 'centro' : ''}"><i style="${a < 0 ? (x >= 0 ? `left:50%;width:${pct - 50}%` : `left:${pct}%;width:${50 - pct}%`) : `width:${pct}%`}" class="mn-${k}"></i></div><b>${a < 0 && x > 0 ? '+' : ''}${x.toFixed(2)}</b></div>`;
}
function MN_grafica(hist) {
  if (hist.length < 2) return '';
  const W = 600, H = 90, t0 = hist[0].t, t1 = hist.at(-1).t || t0 + 1;
  const linea = (k, a, b) => hist.map((h, i) => `${i ? 'L' : 'M'}${(((h.t - t0) / (t1 - t0 || 1)) * W).toFixed(1)},${(H - ((h[k] - a) / (b - a)) * H).toFixed(1)}`).join('');
  return `<svg class="mn-graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(tr('Últimas 72 h'))}">
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mn-cero"/>
    <path d="${linea('animo', -1, 1)}" class="mn-l-animo"/><path d="${linea('energia', 0, 1)}" class="mn-l-energia"/><path d="${linea('preocupacion', 0, 1)}" class="mn-l-preocupacion"/></svg>
    <div class="mn-leyenda"><span class="mn-animo">■</span> ${tr('Ánimo')} <span class="mn-energia">■</span> ${tr('Energía')} <span class="mn-preocupacion">■</span> ${tr('Preocupación')} · <small class="tenue">${tr('Últimas 72 h')}</small></div>`;
}
function MN_apagada() {
  return `<div class="caja pad mn-apagada"><div class="crece"><b>${tr('La conciencia está apagada')}</b><small class="tenue">${tr('Actívala en Ajustes para que tenga estado interno, piense por su cuenta, reflexione y escriba su diario.')}</small></div>
    <button class="btn pri" id="mnActivar">${ic('mente')}${tr('Activar')}</button></div>`;
}

function MN_ahora(c, C) {
  const e = C.estado, ult = C.pensamientos[0];
  c.innerHTML = `${C.config.activo ? '' : MN_apagada()}
    <div class="mn-top">
      <div class="caja pad mn-heroe">
        <div class="mn-sentir">${MN_emo(e.emocion)}</div>
        ${ult ? `<p class="mn-ultimo">«${esc(ult.pensamiento)}»</p><small class="tenue">${MN_hora(ult.t)}</small>` : `<p class="tenue">${tr('Aún no ha pensado nada por su cuenta.')}</p>`}
        <div class="mn-acc"><button class="btn" id="mnPensar" ${C.pensando ? 'disabled' : ''}>${ic('chispa')}${tr(C.pensando ? 'Pensando…' : 'Pensar ahora')}</button>
          <small class="tenue">${tr('Hoy: {m} mensajes, {e} encargos', { m: C.hoy.mensajes, e: C.hoy.encargos })} · ${tr('¿Puede hablarte ahora?')} ${esc(tr(C.hablarAhora))}</small></div>
      </div>
      <div class="caja pad mn-dims">${MN_DIM.map(d => MN_barra(d, e)).join('')}${MN_grafica(C.historial)}</div>
    </div>
    ${C.recientes.length ? `<div class="seccion">${tr('Lo que le ha movido')}</div><div class="caja mn-lista">${C.recientes.slice().reverse().map(r => `<div class="mn-fila"><small class="tenue">${MN_hora(r.t)}</small><span>${esc(r.texto)}</span></div>`).join('')}</div>` : ''}
    <div class="mn-dos">
      <div><div class="seccion">${tr('Monólogo interior')}<span class="n">${C.pensamientos.length}</span></div>
        <div class="caja mn-lista">${C.pensamientos.length ? C.pensamientos.map(p => `<div class="mn-pens"><div class="mn-pens-cab"><small class="tenue">${MN_hora(p.t)}</small>${p.emocion ? `<span class="chip">${MN_emo(p.emocion)}</span>` : ''}${p.accion === 'hablar' ? `<span class="chip ok">${tr('habló contigo')}</span>` : ''}${p.encargo ? `<span class="chip">${tr('investigó')}</span>` : ''}</div>
          <p>${esc(p.pensamiento)}</p>${p.mensaje ? `<blockquote>${esc(p.mensaje)}</blockquote>` : ''}${p.encargo ? `<small class="tenue">🔎 ${esc(p.encargo)}</small>` : ''}${p.meta ? `<small class="tenue">🎯 ${esc(p.meta.accion)}: ${esc(p.meta.texto)}</small>` : ''}</div>`).join('')
          : `<p class="tenue pad">${tr('Aún no ha pensado nada por su cuenta.')}</p>`}</div></div>
      <div><div class="seccion">${tr('Reflexiones')}<span class="n">${C.reflexiones.length}</span></div>
        <div class="caja mn-lista">${C.reflexiones.length ? C.reflexiones.map(r => `<div class="mn-pens"><div class="mn-pens-cab"><small class="tenue">${MN_hora(r.t)}</small><b>${esc(r.titulo)}</b>${r.guardada ? `<span class="chip ok">${tr('lección guardada')}</span>` : ''}</div>
          <p>✅ ${esc(r.salioBien)}</p><p>⚠️ ${esc(r.salioMal)}</p>${r.leccion ? `<blockquote>${esc(r.leccion)}</blockquote>` : ''}</div>`).join('')
          : `<p class="tenue pad">${tr('Aún no hay reflexiones: llegan tras trabajos largos o con fallos.')}</p>`}</div></div>
    </div>`;
  c.onclick = async ev => {
    if (ev.target.closest('#mnActivar')) { await api('PATCH', '/conciencia/config', { activo: true }); aviso(tr('Conciencia activa')); return VISTAS.mente.refrescar(); }
    const b = ev.target.closest('#mnPensar');
    if (b) { b.disabled = true; b.textContent = tr('Pensando…'); try { await api('POST', '/conciencia/pensar'); } catch (er) { aviso(er.message, true); } return VISTAS.mente.refrescar(); }
  };
}

async function MN_diario(c, C) {
  const fecha = (location.hash.split('/')[3] || C.diarios[0]?.fecha || '');
  const d = fecha ? await api('GET', `/conciencia/diario/${fecha}`).catch(() => null) : null;
  c.innerHTML = `<div class="mn-diario">
    <div class="caja mn-dias"><button class="btn fantasma" id="mnEscribir">${ic('editar')}${tr('Escribir el diario de hoy')}</button>
      ${C.diarios.map(x => `<a href="#/mente/diario/${esc(x.fecha)}" class="${x.fecha === fecha ? 'on' : ''}"><small class="tenue">${esc(x.fecha)}</small><span>${MN_EMO[x.emocionDelDia]?.[0] || ''} ${esc(x.titular)}</span></a>`).join('')}</div>
    <div class="caja pad mn-pagina">${d ? `<h2>${esc(d.titular)}</h2><small class="tenue">${esc(d.fecha)} · ${MN_emo(d.emocionDelDia)}</small>
      ${d.entrada.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('')}
      ${d.aprendi?.length ? `<h3>${tr('Aprendí')}</h3><ul>${d.aprendi.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <h3>${tr('Quién soy hoy')}</h3><p>${esc(d.quienSoyHoy)}</p>${d.cambioAlma ? `<small class="tenue">✨ ${esc(d.cambioAlma)}</small>` : ''}`
      : `<p class="tenue">${tr('Aún no ha escrito su diario. Lo escribe cada noche antes del sueño de la memoria.')}</p>`}</div></div>`;
  $('#mnEscribir', c).onclick = async ev => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = tr('Escribiendo…');
    try { const r = await api('POST', '/conciencia/diario', {}); location.hash = `#/mente/diario/${r.fecha}`; VISTAS.mente.refrescar(); } catch (er) { aviso(er.message, true); b.disabled = false; }
  };
}

function MN_metas(c, C) {
  const orden = { activa: 0, hecha: 1, abandonada: 2 };
  const ms = C.metas.slice().sort((a, b) => orden[a.estado] - orden[b.estado] || b.creada - a.creada);
  c.innerHTML = `<div class="caja pad ds-fila mn-nueva"><input id="mnMeta" class="crece" placeholder="${esc(tr('Algo que quieres que persiga a largo plazo…'))}"><button class="btn pri" id="mnAnadir">${ic('mas')}${tr('Añadir')}</button></div>
    ${ms.length ? `<div class="mn-metas">${ms.map(m => `<div class="caja pad mn-meta ${m.estado}">
      <div class="mn-pens-cab"><span class="chip ${m.estado === 'activa' ? 'ok' : ''}">${tr(m.estado)}</span><small class="tenue">${esc(m.origen)} · ${MN_hora(m.creada)}</small></div>
      <b>${esc(m.texto)}</b>${(m.notas || []).length ? `<ul>${m.notas.slice(-4).map(n => `<li><small class="tenue">${MN_hora(n.t)}</small> ${esc(n.texto)}</li>`).join('')}</ul>` : ''}
      ${m.estado === 'activa' ? `<div class="flex"><button class="btn fantasma" data-meta="${m.id}" data-acc="completar">${tr('Completar')}</button><button class="btn fantasma" data-meta="${m.id}" data-acc="abandonar">${tr('Abandonar')}</button></div>` : ''}</div>`).join('')}</div>`
      : `<div class="caja pad rn-vacio">${ic('chispa')}<p>${tr('Sin metas todavía. Las crea él al pensar, o puedes darle una.')}</p></div>`}`;
  const anadir = async () => { const t = $('#mnMeta', c).value.trim(); if (!t) return; try { await api('POST', '/conciencia/metas', { texto: t }); VISTAS.mente.refrescar(); } catch (e) { aviso(e.message, true); } };
  $('#mnAnadir', c).onclick = anadir; $('#mnMeta', c).onkeydown = e => { if (e.key === 'Enter') anadir(); };
  c.onclick = async e => { const b = e.target.closest('[data-meta]'); if (!b) return; await api('PATCH', `/conciencia/metas/${b.dataset.meta}`, { accion: b.dataset.acc }); VISTAS.mente.refrescar(); };
}

function MN_alma(c, A) {
  const V = VISTAS.mente, sel = V.almaSel && A.archivos.some(x => x.id === V.almaSel) ? V.almaSel : 'alma', a = A.archivos.find(x => x.id === sel);
  c.innerHTML = `${MN_nacer(A)}<div class="mn-alma">
    <div class="caja pad"><div class="mn-archivos">${A.archivos.map(x => `<button class="btn ${x.id === sel ? 'pri' : 'fantasma'}" data-arch="${x.id}">${esc(x.archivo)}</button>`).join('')}</div>
      <p class="tenue mn-ayuda">${esc(tr(a.ayuda))} · <b>${tr(a.apolo ? 'Él puede cambiarlo y te avisa' : 'Solo tú')}</b></p>
      <textarea id="mnTexto" class="mn-editor" spellcheck="false">${esc(a.contenido)}</textarea>
      <div class="flex"><button class="btn pri" id="mnGuardar">${tr('Guardar')}</button></div></div>
    <div><div class="seccion" style="margin-top:0">${tr('Historial de cambios')}<span class="n">${A.historial.length}</span></div>
      <div class="caja mn-lista">${A.historial.length ? A.historial.map(h => `<button class="mn-cambio" data-ver="${h.id}"><small class="tenue">${MN_hora(h.t)}</small>
        <span><span class="chip ${h.quien === 'apolo' ? 'ok' : ''}">${tr(MN_QUIEN[h.quien] || h.quien)}</span> ${esc(A.archivos.find(x => x.id === h.archivo)?.archivo || h.archivo)} <small class="tenue">+${h.mas}/-${h.menos}</small></span>
        <span class="mn-motivo">${esc(h.motivo || '')}</span></button>`).join('') : `<p class="tenue pad">${tr('Aún no ha cambiado nada.')}</p>`}</div></div></div>`;
  const ed = $('#mnTexto', c);
  ed.onfocus = () => { V.editando = true; }; ed.onblur = () => { V.editando = false; };
  const sn = $('#mnSaltarNacer', c), rn = $('#mnRenacer', c);
  if (sn) sn.onclick = async () => { if (await confirmar('Saltar el nacimiento', 'No te hará la entrevista; se queda con lo que tiene ahora.')) { await api('DELETE', '/alma/nacimiento'); if (E.estado) E.estado.naciendo = false; V.refrescar(); } };
  if (rn) rn.onclick = async () => { if (await confirmar('Renacer', 'En su próxima conversación te hará otra vez la entrevista de la primera vez y reescribirá su identidad y lo que sabe de ti. Podrás deshacerlo aquí.')) { await api('POST', '/alma/nacimiento'); if (E.estado) E.estado.naciendo = true; V.refrescar(); } };
  $('#mnGuardar', c).onclick = async () => { try { await api('PUT', `/alma/${sel}`, { contenido: ed.value }); V.editando = false; aviso(tr('Guardado.')); V.refrescar(); } catch (e) { aviso(e.message, true); } };
  c.onclick = async e => {
    const b = e.target.closest('[data-arch]'); if (b) { V.almaSel = b.dataset.arch; V.editando = false; return MN_alma(c, A); }
    const r = e.target.closest('[data-ver]'); if (!r) return;
    const v = await api('GET', `/alma/versiones/${r.dataset.ver}`);
    const diff = v.diff.split('\n').map(l => `<span class="${l[0] === '+' ? 'mn-mas' : l[0] === '-' ? 'mn-menos' : ''}">${esc(l)}</span>`).join('\n');
    const ok = await modal({ titulo: `${A.archivos.find(x => x.id === v.archivo)?.archivo || v.archivo} · ${MN_hora(v.t)}`, ancho: 760,
      cuerpo: `<p class="suave" style="margin-top:0">${esc(v.motivo || '')}</p><pre class="mn-diff">${diff}</pre>`,
      botones: [{ txt: 'Cerrar', valor: null }, { txt: 'Deshacer', cls: 'mal', valor: true }] });
    if (ok && await confirmar('Deshacer', '¿Deshacer este cambio?', true)) { await api('POST', `/alma/versiones/${v.id}/deshacer`); aviso(tr('Cambio deshecho.')); V.refrescar(); }
  };
}

function MN_ajustes(c, C) {
  const k = C.config;
  const num = (id, t, val, min, max) => `<label class="mn-num"><span>${tr(t)}</span><input type="number" id="${id}" value="${val}" min="${min}" max="${max}"></label>`;
  c.innerHTML = `<div class="caja">
    ${fila('Conciencia activa', 'Estado interno, monólogo, reflexión y diario. Todo con el modelo del cerebro (o el que pongas).', sw('activo', k.activo))}
    ${fila('Iniciativa', 'Solo pensar: nunca te interrumpe. Hablar: te escribe cuando tiene algo útil. Tareas seguras: además investiga por su cuenta, solo leyendo.', seg('iniciativa', [['pensar', 'Solo pensar'], ['hablar', 'Hablar'], ['tareas', 'Hablar y tareas seguras']], k.iniciativa))}
    ${fila('Horas de silencio', '', `<div class="flex"><input type="time" id="mnDesde" value="${esc(k.silencio.desde)}"><span>–</span><input type="time" id="mnHasta" value="${esc(k.silencio.hasta)}"></div>`)}
    ${fila('Reflexionar tras los trabajos', '', sw('reflexion', k.reflexion))}
    ${fila('Escribir un diario cada noche', '', `<div class="flex"><input type="time" id="mnHoraD" value="${esc(k.horaDiario)}">${sw('diario', k.diario)}</div>`)}
    <div class="mn-nums pad">${num('mnCada', 'Piensa cada (min)', k.cadaMin, 5, 1440)}${num('mnMsj', 'Mensajes al día (máx.)', k.maxMensajesDia, 0, 50)}${num('mnEnc', 'Encargos al día (máx.)', k.maxEncargosDia, 0, 50)}
      <label class="mn-num crece"><span>${tr('Modelo (vacío = el del cerebro)')}</span><input id="mnModelo" value="${esc(k.modelo || '')}" placeholder="ollama/gemma4:31b-cloud"></label></div>
  </div>`;
  const guardar = cambios => api('PATCH', '/conciencia/config', cambios).then(() => aviso(tr('Guardado.'))).catch(e => aviso(e.message, true));
  enlazarControles(c, (id, val) => guardar({ [id]: val }));
  const al = (sel, f) => { $(sel, c).onchange = f; };
  al('#mnDesde', () => guardar({ silencio: { desde: $('#mnDesde', c).value, hasta: $('#mnHasta', c).value } }));
  al('#mnHasta', () => guardar({ silencio: { desde: $('#mnDesde', c).value, hasta: $('#mnHasta', c).value } }));
  al('#mnHoraD', () => guardar({ horaDiario: $('#mnHoraD', c).value }));
  al('#mnCada', e => guardar({ cadaMin: +e.target.value })); al('#mnMsj', e => guardar({ maxMensajesDia: +e.target.value })); al('#mnEnc', e => guardar({ maxEncargosDia: +e.target.value }));
  al('#mnModelo', e => guardar({ modelo: e.target.value.trim() }));
}
