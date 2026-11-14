// Skills → pestaña «Biblioteca DMN»: skills oficiales (repo DMNENGINE/apolo-skills, firmadas) que se preparan solas.
// API: GET /v1/skills/marketplace (entradas con origen 'biblioteca') · instalar = la instalación de siempre ·
//      GET/POST /v1/skills/:slug/preparar (+ /cancelar) · progreso por eventos {tipo:'skills', accion:'preparar'}.
// Globales con prefijo BIB_ (los ui/*.js comparten ámbito).
'use strict';

Object.assign(I18N.dic.en, {
  'Biblioteca DMN': 'DMN Library', 'Skills oficiales de APOLO: firmadas, revisadas y listas para usar. Las que necesitan modelos o programas se preparan solas.': 'Official APOLO skills: signed, reviewed and ready to use. The ones that need models or programs set themselves up.',
  'Se prepara sola': 'Sets itself up', 'Preparar': 'Set up', 'Lista': 'Ready', 'Preparar todo': 'Set up everything', 'Preparar igualmente': 'Set up anyway',
  'Preparando…': 'Setting up…', 'Cancelar preparación': 'Cancel setup', 'Tu equipo': 'Your computer', 'Necesita': 'Needs', 'Pasos': 'Steps',
  'Hecho': 'Done', 'Pendiente': 'Pending', 'Descargará {x}': 'Will download {x}', 'Nada que descargar': 'Nothing to download', 'Se guarda en': 'Saved in',
  'La biblioteca aún no está disponible': 'The library is not available yet', 'Todas las categorías': 'All categories', 'Sin GPU NVIDIA': 'No NVIDIA GPU',
  '¡{s} está lista para usar!': '{s} is ready to use!', 'La preparación falló: {e}': 'Setup failed: {e}', 'Preparación cancelada': 'Setup cancelled',
  'Esta skill no necesita preparación.': 'This skill needs no setup.', 'Todo listo: esta skill ya puede usarse.': 'All set: this skill can be used now.',
  'Revisa antes de seguir': 'Check before continuing', 'Cambiar carpeta': 'Change folder', 'Carpeta guardada': 'Folder saved', 'Avisos': 'Warnings', 'Activa la skill para usarla': 'Enable the skill to use it',
});

const BIB_bytes = n => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' GB' : n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(0) + ' MB' : n > 0 ? (n / 1024).toFixed(0) + ' KB' : '0');
const BIB_TIPO = { programa: 'terminal', git: 'github', python: 'llaveinglesa', descarga: 'disco', ollama: 'cerebro', config: 'ajustes' };

const BIB = {
  datos: null, cat: '', c: null, modalCuerpo: null, slugModal: null,
  async pintar(c, refrescar) {
    this.c = c;
    if (!this.datos || refrescar) {
      c.innerHTML = `<div class="pensando">${tr('Cargando el catálogo…')}<span class="puntos"><i></i><i></i><i></i></span></div>`;
      try { this.datos = await api('GET', '/skills/marketplace' + (refrescar ? '?refrescar=1' : '')); }
      catch (er) { c.innerHTML = `<div class="caja">${vacio('info', esc(er.message))}</div>`; return; }
    }
    if (this.c !== c || !c.isConnected) return;
    const fuente = (this.datos.fuentes || []).find(f => f.id === 'biblioteca');
    const lista = this.entradas();
    const cats = [...new Set(lista.map(e => e.categoria).filter(Boolean))].sort();
    c.innerHTML = `<div class="caja bib-cab">
        <div class="bib-tit">${ic('chispa')}<div><b>${tr('Biblioteca DMN')}</b><small>${tr('Skills oficiales de APOLO: firmadas, revisadas y listas para usar. Las que necesitan modelos o programas se preparan solas.')}</small></div></div>
        <button class="btn" id="bibRefrescar">${ic('recargar')}${tr('Actualizar')}</button></div>
      ${cats.length ? `<div class="mk-etiquetas">${[['', tr('Todas las categorías'), lista.length], ...cats.map(k => [k, k, lista.filter(e => e.categoria === k).length])]
        .map(([v, t, n]) => `<button class="chip-btn ${this.cat === v ? 'on' : ''}" data-bib-cat="${esc(v)}">${esc(t)} <span class="n">${n}</span></button>`).join('')}</div>` : ''}
      <div id="bibLista">${lista.length ? `<div class="sk-rejilla">${lista.filter(e => !this.cat || e.categoria === this.cat).map(e => this.tarjeta(e)).join('')}</div>`
        : `<div class="caja">${vacio('chispa', esc(fuente?.error ? `${tr('La biblioteca aún no está disponible')} (${fuente.error})` : tr('La biblioteca aún no está disponible')))}</div>`}</div>`;
    $('#bibRefrescar', c).onclick = () => this.pintar(c, true);
    c.onclick = e => this.clic(e);
  },
  entradas() { return (this.datos?.entradas || []).filter(e => e.origen === 'biblioteca' || (e.catalogos || []).includes('biblioteca')).sort((a, b) => a.nombre.localeCompare(b.nombre)); },
  tarjeta(e) {
    const r = e.requisitos || {}, inst = e.instalada;
    const req = [r.vramGB ? `<span class="chip" title="${tr('Necesita')}">${ic('cpu')}GPU ${r.vramGB} GB</span>` : '', r.discoGB ? `<span class="chip">${ic('disco')}${r.discoGB} GB</span>` : '',
      e.preparacion ? `<span class="chip ok">${ic('rayo')}${tr('Se prepara sola')}</span>` : ''].join('');
    return `<article class="sk-tarjeta mk-tarjeta bib-tarjeta" data-bib="${esc(e.id)}" tabindex="0">
      <div class="sk-cab"><span class="sk-ico" style="--h:${SK_tono(e.nombre)}">${esc(SK_siglas(e.nombre))}</span>
        <div class="sk-nom"><b>${esc(e.nombre)}</b><small>${esc(e.categoria || 'DMN')}${e.version ? ` · v${esc(String(e.version).replace(/^v/, ''))}` : ''}</small></div>
        <span class="chip ok" title="DMNENGINE">${ic('check')}${tr('Oficial')}</span></div>
      <p class="sk-desc">${esc(e.descripcion || tr('Sin descripción.'))}</p>
      <div class="mk-tags">${req}</div>
      <div class="sk-pie"><span class="crece"></span>
        ${inst ? `${e.preparacion ? `<button class="btn mini" data-bib-preparar="${esc(inst)}">${ic('rayo')}${tr('Preparar')}</button>` : ''}<button class="btn mini" data-bib-abrir="${esc(inst)}">${ic('check')}${tr('Instalada')}</button>`
          : `<button class="btn mini pri" data-bib-instalar="${esc(e.id)}">${ic('mas')}${tr('Instalar')}</button>`}</div>
    </article>`;
  },
  async clic(ev) {
    const cat = ev.target.closest('[data-bib-cat]');
    if (cat) { this.cat = cat.dataset.bibCat; return this.pintar(this.c); }
    const ins = ev.target.closest('[data-bib-instalar]');
    if (ins) { ev.stopPropagation(); return this.instalar(this.entradas().find(e => e.id === ins.dataset.bibInstalar), ins); }
    const pr = ev.target.closest('[data-bib-preparar]');
    if (pr) { ev.stopPropagation(); return this.preparar(pr.dataset.bibPreparar); }
    const ab = ev.target.closest('[data-bib-abrir]');
    if (ab) { ev.stopPropagation(); VISTAS.skills.ponerModo('inst'); return VISTAS.skills.abrir(ab.dataset.bibAbrir); }
    const t = ev.target.closest('.bib-tarjeta');
    if (t) MK.ficha(this.entradas().find(e => e.id === t.dataset.bib));
  },
  async instalar(e, boton) {
    if (!e) return;
    const txt = boton?.innerHTML;
    if (boton) { boton.disabled = true; boton.innerHTML = `<span class="punto ok vivo"></span>${tr('Instalando…')}`; }
    try {
      const r = await api('POST', '/skills/instalar', { fuente: e.fuente });
      const s = r.skill; if (!s) throw new Error(tr('El núcleo no devolvió la skill'));
      aviso(tr('{s} instalado (desactivado, escaneado)', { s: s.nombre || s.slug }), s.escaneo?.nivel === 'rojo');
      this.datos = null; MK.datos = null;
      if (this.c?.isConnected) await this.pintar(this.c);
      if (e.preparacion) this.preparar(s.slug);
    } catch (er) { aviso(er.message, true); }
    finally { if (boton?.isConnected) { boton.disabled = false; boton.innerHTML = txt; } }
  },

  // ---------- ventana de preparación ----------
  async preparar(slug) {
    this.slugModal = slug;
    await modal({
      titulo: `${tr('Preparar')} · ${slug}`, ancho: 720, cuerpo: `<div class="pensando">${tr('Cargando…')}<span class="puntos"><i></i><i></i><i></i></span></div>`,
      botones: [{ txt: 'Cerrar', valor: null }],
      alAbrir: m => { this.modalCuerpo = $('.cuerpo', m) || m.querySelector('section') || m; this.refrescarModal(); },
    });
    this.modalCuerpo = null; this.slugModal = null;
  },
  async refrescarModal() {
    const b = this.modalCuerpo; if (!b?.isConnected) return;
    let d; try { d = await api('GET', `/skills/${encodeURIComponent(this.slugModal)}/preparar`); } catch (er) { b.innerHTML = `<div class="caja">${vacio('info', esc(er.message))}</div>`; return; }
    this.diag = d;
    b.innerHTML = this.pintarDiag(d);
    b.onclick = ev => this.clicModal(ev);
  },
  pintarDiag(d) {
    if (!d.tienePlan) return `<div class="caja">${vacio('check', tr('Esta skill no necesita preparación.'))}</div>`;
    const eq = d.equipo || {}, req = d.requisitos || {}, t = d.trabajo, corriendo = t?.estado === 'preparando';
    const fila = (ico, nombre, valor, ok) => `<div class="bib-eq"><span>${ic(ico)}${esc(nombre)}</span><b>${esc(valor)}</b>${ok == null ? '' : `<span class="punto ${ok ? 'ok' : 'mal'}"></span>`}</div>`;
    const vram = eq.gpu ? `${eq.gpu.nombre} · ${eq.gpu.vramGB.toFixed(1)} GB` : tr('Sin GPU NVIDIA');
    return `
      ${d.errores?.length ? `<div class="caja mal"><b>${tr('Revisa antes de seguir')}</b><ul>${d.errores.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${d.problemas?.length ? `<div class="caja aviso"><b>${tr('Revisa antes de seguir')}</b><ul>${d.problemas.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="bib-eqs"><small class="tenue">${tr('Tu equipo')}</small>
        ${fila('cpu', 'GPU', vram + (req.gpu?.vramGB ? ` / ${req.gpu.vramGB} GB` : ''), req.gpu?.vramGB ? !!eq.gpu && eq.gpu.vramGB + 0.3 >= req.gpu.vramGB : null)}
        ${fila('memoria', 'RAM', `${(eq.ramGB || 0).toFixed(0)} GB${req.ramGB ? ` / ${req.ramGB} GB` : ''}`, req.ramGB ? eq.ramGB + 0.5 >= req.ramGB : null)}
        ${fila('disco', tr('Disco libre'), eq.discoLibreGB != null ? `${eq.discoLibreGB.toFixed(0)} GB` : '?', null)}</div>
      <div class="bib-pasos"><small class="tenue">${tr('Pasos')}</small>
        ${d.pasos.map(p => {
          const activo = corriendo && t.paso === p.id, pg = activo ? t.progreso : null;
          const pct = pg?.total ? Math.min(100, Math.round(pg.bytes / pg.total * 100)) : null;
          return `<div class="bib-paso ${p.estado} ${activo ? 'activo' : ''}" data-paso="${esc(p.id)}">
            <span class="ico">${ic(BIB_TIPO[p.tipo] || 'pieza')}</span>
            <div class="crece"><b>${esc(p.nombre)}</b><small>${esc(p.detalle || '')}${p.bytes ? ` · ${BIB_bytes(p.bytes)}` : ''}</small>
              ${activo ? `<div class="bib-barra"><i style="width:${pct ?? 5}%"></i></div><small class="tenue bib-linea">${esc(pg?.fase || pg?.linea || '')}${pct != null ? ` · ${pct}% · ${BIB_bytes(pg.bytes)} / ${BIB_bytes(pg.total)}` : ''}</small>` : ''}</div>
            <span class="chip ${p.estado === 'hecho' ? 'ok' : activo ? 'aviso' : ''}">${activo ? `<span class="punto ok vivo"></span>${tr('Preparando…')}` : p.estado === 'hecho' ? tr('Hecho') : tr('Pendiente')}</span></div>`;
        }).join('')}</div>
      ${d.avisos?.length ? `<details class="bib-avisos"><summary>${tr('Avisos')} (${d.avisos.length})</summary><ul>${d.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <div class="bib-pie"><small class="tenue">${d.descargaBytes ? tr('Descargará {x}', { x: BIB_bytes(d.descargaBytes) }) : tr('Nada que descargar')} · ${tr('Se guarda en')}</small>
        ${corriendo ? `<code>${esc(d.carpetas?.base || '')}</code>` : `<div class="bib-dir"><input id="bibDir" value="${esc(d.carpetas?.base || '')}" spellcheck="false"><button class="btn mini" data-bib-dir>${ic('carpeta')}${tr('Cambiar carpeta')}</button></div>`}
        ${t?.estado === 'error' ? `<div class="caja mal">${esc(tr('La preparación falló: {e}', { e: t.error || '' }))}</div>` : ''}
        ${d.listo ? `<div class="caja ok">${ic('check')}${tr('Todo listo: esta skill ya puede usarse.')}</div>`
          : corriendo ? `<button class="btn mal" data-bib-cancelar>${ic('parar')}${tr('Cancelar preparación')}</button>`
            : d.errores?.length ? '' : `<button class="btn pri" data-bib-go="${d.problemas?.length ? '1' : ''}">${ic('rayo')}${tr(d.problemas?.length ? 'Preparar igualmente' : 'Preparar todo')}</button>`}</div>`;
  },
  async clicModal(ev) {
    if (ev.target.closest('[data-bib-dir]')) {
      const v = $('#bibDir', this.modalCuerpo)?.value.trim() || '';
      try { await api('PATCH', '/config', { skills: { dirRecursos: v } }); aviso(tr('Carpeta guardada')); } catch (er) { aviso(er.message, true); }
      return this.refrescarModal();
    }
    const go = ev.target.closest('[data-bib-go]');
    if (go) {
      go.disabled = true;
      try { await api('POST', `/skills/${encodeURIComponent(this.slugModal)}/preparar`, { forzar: go.dataset.bibGo === '1' }); } catch (er) { aviso(er.message, true); }
      return this.refrescarModal();
    }
    if (ev.target.closest('[data-bib-cancelar]')) { try { await api('POST', `/skills/${encodeURIComponent(this.slugModal)}/preparar/cancelar`); } catch (er) { aviso(er.message, true); } }
  },
  // eventos del núcleo: progreso en vivo (sin pedir el diagnóstico en cada trozo) y aviso al terminar
  alEvento(e) {
    if (e.accion !== 'preparar') return;
    if (e.estado === 'listo') aviso(tr('¡{s} está lista para usar!', { s: e.slug }));
    else if (e.estado === 'error') aviso(tr('La preparación falló: {e}', { e: e.error || '' }), true);
    else if (e.estado === 'cancelado') aviso(tr('Preparación cancelada'));
    if (!this.modalCuerpo?.isConnected || e.slug !== this.slugModal || !this.diag) return;
    if (e.estado === 'progreso' && this.diag.trabajo?.estado === 'preparando') {
      this.diag.trabajo = { ...this.diag.trabajo, paso: e.paso, progreso: e.progreso };
      clearTimeout(this.t); this.t = setTimeout(() => { if (this.modalCuerpo?.isConnected) this.modalCuerpo.innerHTML = this.pintarDiag(this.diag); }, 120);
      return;
    }
    this.refrescarModal();
  },
};
