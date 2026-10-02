// Turno de noche (#/turno): cola de encargos arrastrable, estado en vivo, ventana horaria e informes matutinos con su vídeo.
// Datos: GET /v1/turno, eventos 'turno-noche' del SSE global (llevan el estado completo). Globales con prefijo TN_.

const TN_ESTADO = { pendiente: ['', 'En cola'], trabajando: ['ok vivo', 'Trabajando'], hecho: ['ok', 'Hecho'], espera: ['aviso', 'Espera tu permiso'], error: ['mal', 'Error'], cancelado: ['', 'Cancelado'] };
const TN_dur = (a, b) => (a && b ? cronoTxt(b - a) : '');

VISTAS.turno = {
  d: null, abierto: null, videos: new Map(),
  async pintar(v) {
    this.v = v;
    this.d = await api('GET', '/turno');
    const c = this.d.config;
    v.innerHTML = `<div class="pagina tn">${cabecera('Turno de noche', 'Déjale encargos y los hace mientras duermes: cada uno en su propia sesión y, en proyectos git, en una rama aparte (nunca hace push). Por la mañana, informe y vídeo-resumen.',
      `<button class="btn mal" id="tnParar" hidden>${ic('parar')}${tr('Parar')}</button><button class="btn pri" id="tnEmpezar">${ic('luna')}${tr('Empezar ahora')}</button>`)}
      <div class="tn-estado" id="tnEstado"></div>
      <div class="tn-dos">
        <div class="tarjeta"><header>${ic('mas')}<span class="crece">${tr('Nuevo encargo')}</span></header><div class="cuerpo tn-form">
          <textarea id="tnTexto" rows="3" placeholder="${esc(tr('Ej.: Revisa los tests que fallan en el proyecto y arregla lo que puedas'))}"></textarea>
          <div class="tn-campos"><label>${tr('Carpeta')}<input id="tnCwd" value="${esc(E.config?.carpeta || '')}" placeholder="D:\\Proyectos\\mi-app"></label>
            <label>${tr('Modelo (opcional)')}<input id="tnModelo" list="tnModelos" placeholder="${esc(nombreModelo(c.modelo || E.config?.modeloPorDefecto || ''))}"></label>
            <datalist id="tnModelos">${Object.keys(E.config?.alias || {}).map(a => `<option value="${esc(a)}">`).join('')}</datalist></div>
          <div class="flex" style="justify-content:flex-end"><button class="btn pri" id="tnAgregar">${ic('mas')}${tr('Añadir a la cola')}</button></div></div></div>
        <div class="tarjeta"><header>${ic('reloj')}<span class="crece">${tr('Horario')}</span></header><div class="cuerpo tn-horario">
          ${fila('Ventana nocturna', 'Empieza solo dentro de este horario si hay encargos en la cola.', `<input type="time" id="tnDesde" value="${esc(c.desde)}"> – <input type="time" id="tnHasta" value="${esc(c.hasta)}">`)}
          ${fila('A la vez', 'Encargos en paralelo.', seg('paralelo', [['1', '1'], ['2', '2']], String(c.paralelo)))}
          ${fila('Informe', 'Hora a la que te avisa (la del resumen del día si está configurado).', `<input type="time" id="tnInforme" value="${esc(c.informe)}">`)}
          ${fila('Vídeo-resumen', 'Vertical, ~60 s, con el robot y los titulares.', sw('video', c.video !== false))}
        </div></div>
      </div>
      <div class="seccion">${tr('Cola')} <span class="n" id="tnN"></span><span class="tenue" style="text-transform:none;letter-spacing:0;font-weight:400">${tr('arrastra para cambiar el orden')}</span></div>
      <div id="tnCola"></div>
      <div class="seccion">${tr('Informes de la mañana')}</div>
      <div id="tnInformes"></div></div>`;
    this.pintarEstado(); this.pintarCola(); this.pintarInformes();
    $('#tnAgregar').onclick = () => this.agregar();
    $('#tnTexto').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.agregar(); };
    $('#tnEmpezar').onclick = async () => { try { const r = await api('POST', '/turno/empezar'); if (!r.ok) aviso(r.motivo, true); else aviso(tr('Turno en marcha')); } catch (e) { aviso(e.message, true); } };
    $('#tnParar').onclick = async () => { if (await confirmar('Parar el turno', 'Se cancelan los encargos en curso (vuelven a la cola) y se hace el informe de lo terminado.', true)) api('POST', '/turno/parar').catch(e => aviso(e.message, true)); };
    const conf = async b => { try { this.d.config = (await api('PATCH', '/turno/config', b)).config; aviso(tr('Guardado')); } catch (e) { aviso(e.message, true); } };
    for (const [id, k] of [['tnDesde', 'desde'], ['tnHasta', 'hasta'], ['tnInforme', 'informe']]) $('#' + id).onchange = e => conf({ [k]: e.target.value });
    enlazarControles(v, (id, val) => { if (id === 'paralelo') conf({ paralelo: +val }); if (id === 'video') conf({ video: val }); });
    v.addEventListener('click', e => this.clic(e));
    this.arrastre();
  },
  salir() { this.v = null; for (const u of this.videos.values()) URL.revokeObjectURL(u); this.videos.clear(); },
  alEvento(e) {
    if (e.tipo !== 'turno-noche' || !this.v || !this.d) return;
    Object.assign(this.d, e.estado);
    this.pintarEstado(); this.pintarCola();
    if (['informe', 'video', 'fin', 'entregado'].includes(e.fase)) api('GET', '/turno').then(d => { this.d = d; this.pintarInformes(); }).catch(() => { });
  },
  async agregar() {
    const texto = $('#tnTexto').value.trim();
    if (!texto) return aviso(tr('Escribe el encargo'), true);
    try {
      await api('POST', '/turno', { texto, cwd: $('#tnCwd').value.trim() || undefined, modelo: $('#tnModelo').value.trim() || undefined });
      $('#tnTexto').value = ''; aviso(tr('Encargo en la cola'));
      this.d = await api('GET', '/turno'); this.pintarEstado(); this.pintarCola();
    } catch (e) { aviso(e.message, true); }
  },
  pintarEstado() {
    const d = this.d, caja = $('#tnEstado'); if (!caja) return;
    const pend = d.cola.filter(e => e.estado === 'pendiente').length, trab = d.cola.filter(e => e.estado === 'trabajando').length;
    const esp = d.cola.filter(e => e.estado === 'espera').length;
    caja.className = 'tn-estado ' + (d.activo ? 'activo' : '');
    caja.innerHTML = `<div class="tn-luna">${ic(d.activo ? 'rayo' : 'luna')}</div>
      <div><b>${d.activo ? tr('Turno en marcha') : d.ventana.ahora ? tr('Dentro de la ventana nocturna') : tr('Esperando a la noche')}</b>
      <small>${d.activo ? (trab || pend ? tr('{n} trabajando · {p} en cola', { n: trab, p: pend }) : tr('Preparando el informe y el vídeo…')) : tr('Empieza solo entre las {a} y las {b}', { a: d.ventana.desde, b: d.ventana.hasta }) + (pend ? ` · ${tr('{n} en cola', { n: pend })}` : '')}</small></div>
      ${esp ? `<span class="chip aviso">${ic('escudo')}${tr('{n} espera tu permiso|{n} esperan tu permiso', { n: esp })}</span>` : ''}`;
    $('#tnEmpezar').hidden = d.activo; $('#tnParar').hidden = !d.activo;
    $('#tnN').textContent = d.cola.length;
  },
  pintarCola() {
    const caja = $('#tnCola'); if (!caja) return;
    const l = this.d.cola;
    caja.innerHTML = l.length ? `<div class="tn-lista">${l.map(e => {
      const [cls, txt] = TN_ESTADO[e.estado] || TN_ESTADO.pendiente, mover = e.estado === 'pendiente';
      return `<div class="tn-enc ${e.estado}" data-id="${esc(e.id)}" ${mover ? 'draggable="true"' : ''}>
        <span class="tn-asa" title="${tr('Arrastrar')}">${mover ? ic('menu') : ''}</span>
        <div class="tn-cuerpo"><div class="tn-l1"><span class="mc-estado"><span class="punto ${cls}"></span>${tr(txt)}</span>
            ${e.modelo ? `<span class="chip">${esc(nombreModelo(e.modelo))}</span>` : ''}${e.rama ? `<span class="chip acento" title="${esc(e.repo || '')}">${ic('enlace')}${esc(e.rama)}</span>` : ''}
            ${e.cambios ? `<span class="tenue">${esc(e.cambios.trim())}</span>` : ''}<span class="tenue tn-dur">${TN_dur(e.inicio, e.fin)}</span></div>
          <div class="tn-txt">${esc(e.texto)}</div>
          <div class="tn-cwd">${ic('carpeta')}${esc(e.cwd)}</div>
          ${e.error ? `<div class="tn-err">${ic('x')}${esc(e.error)}</div>` : ''}${e.nota ? `<div class="tenue">${esc(e.nota)}</div>` : ''}
          ${e.permisos?.length ? `<div class="tn-perms">${e.permisos.map(p => `<div>${ic('escudo')}<b>${esc(NOMBRE_HERR[p.herramienta] || p.herramienta)}</b><code>${esc(p.resumen)}</code>${p.peligro ? `<span class="chip mal">${esc(p.peligro)}</span>` : ''}</div>`).join('')}</div>` : ''}
        </div>
        <div class="tn-acc">
          ${e.estado === 'espera' ? `<button class="btn mini pri" data-tnreintentar="${esc(e.id)}" data-aprobar="1">${ic('check')}${tr('Aprobar y reintentar')}</button>` : ''}
          ${['error', 'cancelado', 'hecho', 'espera'].includes(e.estado) ? `<button class="btn mini" data-tnreintentar="${esc(e.id)}">${tr('Reintentar')}</button>` : ''}
          ${e.sesion ? `<a class="btn mini fantasma" href="#/chat/${esc(e.sesion)}">${tr('Abrir')} ${ic('der')}</a>` : ''}
          <button class="btn mini fantasma icono" data-tnborrar="${esc(e.id)}" title="${tr('Quitar')}">${ic('x')}</button></div>
      </div>`;
    }).join('')}</div>` : vacio('luna', 'La cola está vacía. Añade encargos y se harán esta noche (o pulsa «Empezar ahora»).');
  },
  pintarInformes() {
    const caja = $('#tnInformes'); if (!caja) return;
    const l = this.d.informes || [];
    caja.innerHTML = l.length ? l.map(i => `<div class="tn-inf ${this.abierto === i.id ? 'abierto' : ''}" data-inf="${esc(i.id)}">
      <button class="tn-inf-cab" data-tnabrir="${esc(i.id)}">${ic('sol')}<div><b>${esc(i.titular || tr('Informe'))}</b><small>${new Date(i.creado).toLocaleString()} · ${tr('{n} encargos', { n: i.encargos })}</small></div>
        <span class="chip ok">${tr('{n} hecho|{n} hechos', { n: i.hecho })}</span><span class="chip">${tr('{n} pendiente|{n} pendientes', { n: i.pendiente })}</span>${i.decidir ? `<span class="chip aviso">${tr('{n} para decidir', { n: i.decidir })}</span>` : ''}
        ${i.video?.estado === 'listo' ? `<span class="chip acento">${ic('play')}${tr('vídeo')}</span>` : ''}${ic('abajo', 'tn-flecha')}</button>
      <div class="tn-inf-det" id="tnDet-${esc(i.id)}"></div></div>`).join('') : vacio('sol', 'Cuando termine un turno, aquí tendrás el informe de la mañana con su vídeo.');
    if (this.abierto) this.detalle(this.abierto);
  },
  async detalle(id) {
    const caja = $(`#tnDet-${CSS.escape(id)}`); if (!caja) return;
    let i; try { i = await api('GET', `/turno/informes/${id}`); } catch (e) { caja.innerHTML = vacio('x', esc(e.message)); return; }
    const lista = (t, a, cls) => `<div class="tn-col ${cls}"><h4>${tr(t)} <span class="n">${a.length}</span></h4>${a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="tenue">—</div>`}</div>`;
    const vid = i.video || {};
    caja.innerHTML = `<div class="tn-inf-cuerpo">
      <div class="tn-video">${vid.estado === 'listo' ? `<video id="tnVid-${esc(id)}" controls playsinline></video>`
        : `<div class="tn-video-vacio">${ic(vid.estado === 'grabando' ? 'reloj' : 'monitor')}<span>${vid.estado === 'grabando' ? tr('Grabando el vídeo…') : vid.estado === 'solo-html' ? esc(vid.motivo || tr('Solo animación HTML')) : vid.estado === 'desactivado' ? tr('Vídeo desactivado') : esc(vid.motivo || tr('Sin vídeo'))}</span></div>`}
        <div class="flex">${vid.html ? `<button class="btn mini" data-tnhtml="${esc(id)}">${ic('monitor')}${tr('Abrir animación')}</button>` : ''}
          <button class="btn mini fantasma" data-tnvideo="${esc(id)}">${ic('recargar')}${tr(vid.estado === 'listo' ? 'Regrabar' : 'Grabar vídeo')}</button></div></div>
      <div class="tn-listas">${lista('Hecho', i.hecho, 'ok')}${lista('Pendiente', i.pendiente, 'info')}${lista('Necesito que decidas', i.necesitoQueDecidas, 'aviso')}
        ${i.guion ? `<div class="tn-guion"><h4>${ic('micro')}${tr('Guion de la narración')}</h4><p>${esc(i.guion)}</p></div>` : ''}
        <div class="tn-encs">${i.encargos.map(e => `<div><span class="punto ${(TN_ESTADO[e.estado] || TN_ESTADO.pendiente)[0]}"></span>${esc(e.texto.split('\n')[0].slice(0, 90))}${e.rama ? ` <code>${esc(e.rama)}</code>` : ''}${e.sesion ? ` <a href="#/chat/${esc(e.sesion)}">${tr('ver sesión')}</a>` : ''}</div>`).join('')}</div></div></div>`;
    if (vid.estado === 'listo') this.cargarVideo(id);
  },
  async cargarVideo(id) {
    const el = $(`#tnVid-${CSS.escape(id)}`); if (!el) return;
    try {
      if (!this.videos.has(id)) {
        const r = await fetch(`/v1/turno/informes/${encodeURIComponent(id)}/archivo/video.mp4`, { headers: { 'x-robot-token': TOKEN } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        this.videos.set(id, URL.createObjectURL(await r.blob()));
      }
      el.src = this.videos.get(id);
    } catch (e) { el.replaceWith(Object.assign(document.createElement('div'), { className: 'tenue', textContent: e.message })); }
  },
  async clic(e) {
    const b = e.target.closest('[data-tnborrar],[data-tnreintentar],[data-tnabrir],[data-tnhtml],[data-tnvideo]'); if (!b) return;
    try {
      if (b.dataset.tnborrar) { await api('DELETE', `/turno/${b.dataset.tnborrar}`); }
      else if (b.dataset.tnreintentar) { await api('POST', `/turno/${b.dataset.tnreintentar}/reintentar`, { aprobar: !!b.dataset.aprobar }); aviso(tr(b.dataset.aprobar ? 'Aprobado: vuelve a la cola' : 'Vuelve a la cola')); }
      else if (b.dataset.tnabrir) { this.abierto = this.abierto === b.dataset.tnabrir ? null : b.dataset.tnabrir; this.pintarInformes(); return; }
      else if (b.dataset.tnhtml) {
        const r = await fetch(`/v1/turno/informes/${encodeURIComponent(b.dataset.tnhtml)}/archivo/video.html`, { headers: { 'x-robot-token': TOKEN } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        window.open(URL.createObjectURL(new Blob([await r.text()], { type: 'text/html' })), '_blank'); return;
      }
      else if (b.dataset.tnvideo) { await api('POST', `/turno/informes/${b.dataset.tnvideo}/video`); this.videos.delete(b.dataset.tnvideo); aviso(tr('Grabando el vídeo… (~1 min)')); return; }
      this.d = await api('GET', '/turno'); this.pintarEstado(); this.pintarCola();
    } catch (er) { aviso(er.message, true); }
  },
  // arrastrar para ordenar (solo los pendientes)
  arrastre() {
    let arr = null;
    const caja = $('#tnCola');
    caja.addEventListener('dragstart', e => { arr = e.target.closest('.tn-enc[draggable]'); if (arr) { arr.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; } });
    caja.addEventListener('dragend', () => { arr?.classList.remove('arrastrando'); arr = null; });
    caja.addEventListener('dragover', e => {
      if (!arr) return; e.preventDefault();
      const sobre = e.target.closest('.tn-enc'); if (!sobre || sobre === arr) return;
      const r = sobre.getBoundingClientRect();
      sobre.parentNode.insertBefore(arr, e.clientY > r.top + r.height / 2 ? sobre.nextSibling : sobre);
    });
    caja.addEventListener('drop', async e => {
      e.preventDefault();
      const ids = $$('.tn-enc', caja).map(x => x.dataset.id);
      try { await api('PATCH', '/turno/orden', { ids }); } catch (er) { aviso(er.message, true); }
    });
  },
};
