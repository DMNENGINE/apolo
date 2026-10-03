// Skills → pestaña «Explorar»: marketplace (catálogo agregado de anthropics/skills + índices JSON de cfg.skills.catalogos).
// API: GET /v1/skills/marketplace[?refrescar=1] · GET /v1/skills/marketplace/ficha?id= · instalar = la instalación de siempre.
// También: badge de firma ed25519 (MK_firma) que usan las tarjetas y el detalle de skills.js.
// Globales con prefijo MK_ (los ui/*.js comparten ámbito).
'use strict';

Object.assign(I18N.dic.en, {
  'Instaladas': 'Installed', 'Explorar': 'Explore', 'Buscar en el catálogo…': 'Search the catalog…', 'Todas': 'All', 'Plugins': 'Plugins',
  'Actualizar': 'Refresh', 'Cargando el catálogo…': 'Loading the catalog…', 'Instalar': 'Install', 'Instalada': 'Installed', 'Abrir': 'Open',
  'Ver ficha': 'View details', 'Firmada': 'Signed', 'Plugin': 'Plugin', 'Ninguna entrada coincide.': 'No entry matches.',
  'actualizado {x}': 'updated {x}', 'caché de {n} h': '{n} h cache', 'falló: {e}': 'failed: {e}', 'Fuente': 'Source', 'Autor': 'Author', 'Licencia': 'License',
  'Catálogo actualizado': 'Catalog updated', 'Sin ficha': 'No details', 'Instalando…': 'Installing…', '{s} instalado (desactivado, escaneado)': '{s} installed (disabled, scanned)',
  'Todo lo que instalas entra desactivado y pasa por el escáner y la comprobación de firma.': 'Everything you install starts disabled and goes through the scanner and the signature check.',
  'Verificado por {a}': 'Verified by {a}', 'Sin firma': 'Unsigned', 'Firma inválida': 'Invalid signature', 'Firma de autor desconocido': 'Signature from unknown author',
  'Catálogos': 'Catalogs', 'Ver en GitHub': 'View on GitHub', 'Todas las etiquetas': 'All tags',
});

// badge de firma: verificada / desconocida / inválida / sin firma
function MK_firma(f, corto) {
  const e = f?.estado || 'sin-firma';
  const [cls, ico, t] = e === 'verificada' ? ['ok', 'check', tr('Verificado por {a}', { a: f.autor || '?' })]
    : e === 'invalida' ? ['mal', 'candado', tr('Firma inválida')]
      : e === 'desconocida' ? ['aviso', 'llave', tr('Firma de autor desconocido')] : ['', 'llave', tr('Sin firma')];
  if (corto && e === 'sin-firma') return '';
  return `<span class="chip mk-firma ${cls}" title="${esc(f?.motivo || t)}">${ic(ico)}${esc(t)}</span>`;
}

const MK = {
  datos: null, q: '', etiqueta: '', tipo: 'todos', c: null, cargando: false,
  async pintar(c, refrescar) {
    this.c = c;
    if (!this.datos || refrescar) {
      c.innerHTML = `<div class="pensando">${tr('Cargando el catálogo…')}<span class="puntos"><i></i><i></i><i></i></span></div>`;
      try { this.datos = await api('GET', '/skills/marketplace' + (refrescar ? '?refrescar=1' : '')); if (refrescar) aviso(tr('Catálogo actualizado')); }
      catch (er) { c.innerHTML = `<div class="caja">${vacio('info', esc(er.message))}</div>`; return; }
    }
    if (this.c !== c || !c.isConnected) return;
    c.innerHTML = `<div class="mk-barra">
        <div class="sk-busca mk-busca">${ic('buscar')}<input id="mkQ" placeholder="${tr('Buscar en el catálogo…')}" value="${esc(this.q)}" autocomplete="off" spellcheck="false"></div>
        ${seg('mkTipo', [['todos', 'Todas'], ['skill', 'Skills'], ['plugin', 'Plugins']], this.tipo)}
        <button class="btn" id="mkRefrescar">${ic('recargar')}${tr('Actualizar')}</button></div>
      <div class="mk-etiquetas" id="mkEtiq"></div>
      <div id="mkLista"></div>
      <div class="mk-fuentes" id="mkFuentes"></div>`;
    $('#mkQ', c).oninput = e => { this.q = e.target.value.trim().toLowerCase(); this.repintar(); };
    $('[data-seg="mkTipo"]', c).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      this.tipo = b.dataset.v; $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); this.repintar();
    };
    $('#mkRefrescar', c).onclick = () => this.pintar(c, true);
    c.onclick = e => this.clic(e);
    this.repintar();
  },
  filtradas() {
    return (this.datos?.entradas || []).filter(e => (this.tipo === 'todos' || e.tipo === this.tipo) && (!this.etiqueta || e.etiquetas.includes(this.etiqueta))
      && (!this.q || `${e.nombre} ${e.descripcion} ${e.autor} ${e.etiquetas.join(' ')} ${e.fuente}`.toLowerCase().includes(this.q)))
      .sort((a, b) => (b.etiquetas.includes('recomendada') - a.etiquetas.includes('recomendada')) || a.nombre.localeCompare(b.nombre));
  },
  repintar() {
    const c = this.c; if (!c || !$('#mkLista', c)) return;
    const d = this.datos || { entradas: [], etiquetas: [], fuentes: [] };
    $('#mkEtiq', c).innerHTML = [['', tr('Todas las etiquetas'), d.entradas.length], ...d.etiquetas.slice(0, 16).map(x => [x.etiqueta, x.etiqueta, x.n])]
      .map(([v, t, n]) => `<button class="chip-btn ${this.etiqueta === v ? 'on' : ''}" data-etiq="${esc(v)}"><span>${esc(t)}</span><span class="sk-n">${n}</span></button>`).join('');
    const f = this.filtradas();
    $('#mkLista', c).innerHTML = f.length ? `<div class="sk-rejilla">${f.map(e => this.tarjeta(e)).join('')}</div>` : `<div class="caja">${vacio('buscar', 'Ninguna entrada coincide.')}</div>`;
    $('#mkFuentes', c).innerHTML = `<span class="tenue">${ic('mundo')}${tr('Catálogos')}:</span>` + d.fuentes.map(x => `<a class="chip ${x.error ? 'aviso' : ''}" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" title="${esc(x.error ? tr('falló: {e}', { e: x.error }) : x.url)}">${esc(x.nombre)} · ${x.n}${x.error ? ' · ⚠' : ''}</a>`).join('')
      + (d.actualizado ? `<span class="tenue">${tr('actualizado {x}', { x: hace(d.actualizado) })} · ${tr('caché de {n} h', { n: d.cacheHoras || 6 })}</span>` : '')
      + `<span class="tenue mk-nota">${ic('escudo')}${tr('Todo lo que instalas entra desactivado y pasa por el escáner y la comprobación de firma.')}</span>`;
  },
  tarjeta(e) {
    const inst = e.instalada;
    return `<article class="sk-tarjeta mk-tarjeta" data-mk="${esc(e.id)}" tabindex="0">
      <div class="sk-cab"><span class="sk-ico" style="--h:${SK_tono(e.nombre)}">${esc(SK_siglas(e.nombre))}</span>
        <div class="sk-nom"><b>${esc(e.nombre)}</b><small>${esc(e.autor || e.fuente.split('/')[0])}${e.version ? ` · v${esc(String(e.version).replace(/^v/, ''))}` : ''}</small></div>
        ${e.tipo === 'plugin' ? `<span class="chip">${ic('pieza')}${tr('Plugin')}</span>` : ''}</div>
      <p class="sk-desc">${esc(e.descripcion || tr('Sin descripción.'))}</p>
      <div class="mk-tags">${e.etiquetas.slice(0, 5).map(t => `<span class="chip ${t === 'recomendada' || t === 'oficial' ? 'ok' : ''}">${esc(t)}</span>`).join('')}${e.firma ? `<span class="chip ok" title="${esc(e.firma.autor || '')}">${ic('llave')}${tr('Firmada')}</span>` : ''}</div>
      <div class="sk-pie"><code class="crece mk-fuente" title="${esc(e.fuente)}">${esc(e.fuente)}</code>
        ${inst ? `<button class="btn mini" data-mk-abrir="${esc(inst)}" data-tipo="${e.tipo}">${ic('check')}${tr('Instalada')}</button>` : `<button class="btn mini pri" data-mk-instalar="${esc(e.id)}">${ic('mas')}${tr('Instalar')}</button>`}</div>
    </article>`;
  },
  entrada(id) { return (this.datos?.entradas || []).find(e => e.id === id); },
  async clic(ev) {
    const et = ev.target.closest('[data-etiq]');
    if (et) { this.etiqueta = et.dataset.etiq; this.repintar(); return; }
    const ins = ev.target.closest('[data-mk-instalar]');
    if (ins) { ev.stopPropagation(); return this.instalar(this.entrada(ins.dataset.mkInstalar), ins); }
    const ab = ev.target.closest('[data-mk-abrir]');
    if (ab) { ev.stopPropagation(); if (ab.dataset.tipo === 'plugin') location.hash = '#/plugins'; else VISTAS.skills.abrir(ab.dataset.mkAbrir); return; }
    const t = ev.target.closest('.mk-tarjeta');
    if (t) this.ficha(this.entrada(t.dataset.mk));
  },
  async instalar(e, boton) {
    if (!e) return;
    const txt = boton?.innerHTML;
    if (boton) { boton.disabled = true; boton.innerHTML = `<span class="punto ok vivo"></span>${tr('Instalando…')}`; }
    try {
      if (e.tipo === 'plugin') {
        const r = await api('POST', '/plugins/instalar', { fuente: e.fuente });
        aviso(tr('{s} instalado (desactivado, escaneado)', { s: r.plugin?.nombre || e.nombre }), r.plugin?.escaneo?.nivel === 'rojo');
      } else await VISTAS.skills.instalar(e.fuente);
      this.datos = null; if (this.c?.isConnected) await this.pintar(this.c);
    } catch (er) { aviso(er.message, true); }
    finally { if (boton?.isConnected) { boton.disabled = false; boton.innerHTML = txt; } }
  },
  async ficha(e) {
    if (!e) return;
    let instalar = false;
    const pintarCuerpo = (texto, error) => `<div class="mk-ficha-datos">
        <div><small>${tr('Fuente')}</small><code>${esc(e.fuente)}</code></div>${e.autor ? `<div><small>${tr('Autor')}</small><b>${esc(e.autor)}</b></div>` : ''}${e.licencia ? `<div><small>${tr('Licencia')}</small><b>${esc(e.licencia)}</b></div>` : ''}
        ${e.web ? `<div><a href="${esc(e.web)}" target="_blank" rel="noopener noreferrer">${ic('mundo')}${tr('Ver en GitHub')}</a></div>` : ''}</div>
      <div class="mk-tags" style="margin:8px 0 12px">${e.etiquetas.map(t => `<span class="chip">${esc(t)}</span>`).join('')}${e.firma ? `<span class="chip ok">${ic('llave')}${tr('Firmada')} · ${esc(e.firma.autor || '')}</span>` : ''}</div>
      ${texto ? `<div class="md sk-md mk-md">${md(String(texto).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''))}</div>` : error ? `<div class="caja">${vacio('info', esc(error))}</div>` : `<div class="pensando">${tr('Cargando…')}<span class="puntos"><i></i><i></i><i></i></span></div>`}`;
    const r = await modal({
      titulo: e.nombre, ancho: 760, cuerpo: pintarCuerpo(),
      botones: [{ txt: 'Cerrar', valor: null }, ...(e.instalada ? [] : [{ txt: tr('Instalar'), cls: 'pri', valor: 'instalar' }])],
      alAbrir: m => {
        api('GET', '/skills/marketplace/ficha?id=' + encodeURIComponent(e.id))
          .then(f => { const b = $('.cuerpo', m) || m.querySelector('section') || m; if (b.isConnected) b.innerHTML = pintarCuerpo(f.texto, f.error || (!f.texto && tr('Sin ficha'))); })
          .catch(er => { const b = $('.cuerpo', m) || m.querySelector('section') || m; if (b.isConnected) b.innerHTML = pintarCuerpo('', er.message); });
      },
    });
    instalar = r === 'instalar';
    if (instalar) this.instalar(e, $(`[data-mk-instalar="${CSS.escape(e.id)}"]`));
  },
};
