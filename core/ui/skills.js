// Skills: instaladas y externas (Claude Code / Codex / OpenClaw), instalador, escáner "antivirus de skills", actualizaciones.
// API: GET/POST/PATCH/DELETE /v1/skills… + evento SSE {tipo:'skills'}.
// OJO: scripts clásicos con scope global compartido → todo lo global va prefijado SK_.
'use strict';

const SK_NIVEL = {
  verde: ['ok', 'Limpia', 'escudo', 'Sin riesgos detectados', 'El escáner no encontró nada sospechoso. Se puede usar con normalidad.'],
  amarillo: ['aviso', 'Revisar', 'escudo', 'Revisar antes de usar', 'Hay cosas que conviene mirar, pero nada claramente malicioso.'],
  rojo: ['mal', 'Cuarentena', 'candado', 'En cuarentena', 'El escáner encontró patrones peligrosos. Está bloqueada hasta que la actives a mano asumiendo el riesgo.'],
  nada: ['', 'Sin escanear', 'escudo', 'Sin escanear', 'Todavía no se ha escaneado. Pulsa «Re-escanear».'],
};
const SK_nivel = s => SK_NIVEL[s?.escaneo?.nivel] ? s.escaneo.nivel : 'nada';
const SK_niv = n => SK_NIVEL[n].map((x, i) => (i === 1 || i >= 3 ? tr(x) : x));   // la fila del nivel con sus textos traducidos
const SK_ORIGEN = o => {
  const t = String(o || '').toLowerCase();
  if (/claude/.test(t)) return ['Claude Code', 'terminal', 'cc'];
  if (/codex/.test(t)) return ['Codex', 'api', 'cx'];
  if (/openclaw|import/.test(t)) return [tr('Importada OpenClaw'), 'enlace', 'oc'];
  if (/cursor/.test(t)) return ['Cursor', 'archivo', 'cx'];
  if (/agents/.test(t)) return ['AGENTS.md', 'archivo', 'cx'];
  return [tr('Instalada'), 'pieza', 'in'];
};
// usos: número, {total, semana} o lista de fechas → {total, semana|null}
const SK_usos = s => {
  const u = s?.usos;
  if (Array.isArray(u)) { const d = Date.now() - 7 * 864e5; return { total: u.length, semana: u.filter(x => +new Date(x) >= d).length }; }
  if (u && typeof u === 'object') return { total: u.total ?? u.semana ?? 0, semana: u.semana ?? u.ultimos7 ?? null };
  return { total: +u || 0, semana: null };
};
// permisos / archivos pueden llegar como lista, objeto o texto
const SK_items = x => {
  if (!x) return [];
  if (Array.isArray(x)) return x.map(i => (i && typeof i === 'object' ? Object.entries(i).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ') : String(i)));
  if (typeof x === 'object') return Object.entries(x).filter(([, v]) => v !== false && v != null).map(([k, v]) => (v === true ? k : `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`));
  return [String(x)];
};
const SK_GRAV = g => { const t = String(g || '').toLowerCase(); return /cr[ií]t|alta|high|grave|rojo/.test(t) ? 'mal' : /media|medium|amar|warn/.test(t) ? 'aviso' : ''; };
const SK_PESO = g => (/cr[ií]t/i.test(g) ? -1 : { mal: 0, aviso: 1, '': 2 }[SK_GRAV(g)]);
const SK_tono = slug => { let h = 0; for (const c of String(slug)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// Etapa H: nivel de sandbox con que correrán sus scripts (lo calcula el núcleo: firma + escaneo + cfg.seguridad.sandbox)
const SK_SB = { normal: ['', 'Sin sandbox'], restringido: ['aviso', 'Restringido'], aislado: ['ok', 'Aislado'], bloqueado: ['mal', 'Bloqueado'] };
const SK_sb = s => { const d = s?.sandbox; if (!d || !SK_SB[d.nivel]) return ''; const [c, t] = SK_SB[d.nivel];
  return `<span class="chip sk-sb ${c}" title="${esc(d.motivo + (d.avisos?.length ? ' · ' + d.avisos.join(' · ') : ''))}">${ic('escudo')}${tr(t)}</span>`; };
const SK_siglas = n => String(n || '?').replace(/[-_]+/g, ' ').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const SK_tipoFuente = f => {
  f = f.trim(); if (!f) return '';
  if (/\.(zip|skill)$/i.test(f)) return ['archivo', tr('Archivo .zip / .skill')];
  if (/^https?:\/\//i.test(f)) return ['mundo', /github\.com/i.test(f) ? tr('Repositorio de GitHub') : 'URL'];
  if (/^[a-z]:[\\/]|^[\\/]|^~|^\.\.?[\\/]/i.test(f)) return ['carpeta', tr('Carpeta local')];
  if (/^[\w.-]+\/[\w.-]+(\/.*)?$/.test(f)) return ['mundo', 'GitHub owner/repo' + (f.split('/').length > 2 ? tr('/ruta') : '')];
  return ['info', tr('No reconozco el formato')];
};
let SK_cache = null, SK_pidiendo = false;
function SK_paleta() {
  if (!SK_cache && !SK_pidiendo && TOKEN) { SK_pidiendo = true; api('GET', '/skills').then(r => { SK_cache = r.skills || []; }).catch(() => { }).finally(() => { SK_pidiendo = false; }); }
  return [{ t: tr('Instalar skill'), i: 'pieza', sub: tr('Acción'), go: '#/skills' },
    ...(SK_cache || []).map(s => ({ t: s.nombre || s.slug, i: 'pieza', sub: 'Skill', go: `#/skills/${encodeURIComponent(s.slug)}` }))];
}

VISTAS.skills = {
  lista: [], filtro: 'todas', q: '', abierta: null, det: null, pest: 'doc', cola: null, modo: 'inst',
  async pintar(v, sub) {
    this.v = v; this.abierta = null; this.det = null;
    if (sub === 'explorar') { this.modo = 'exp'; sub = null; }
    const r = await api('GET', '/skills');
    this.lista = SK_cache = r.skills || [];
    v.innerHTML = `<div class="pagina sk-pag">${cabecera('Skills', 'Oficios que APOLO sabe hacer. Instala desde GitHub, una carpeta o un .zip; cada skill pasa por el escáner antes de poder usarse.', `<button class="btn" id="skRecargar">${ic('recargar')}${tr('Recargar')}</button>`)}
      <div class="pestanas sk-modo">${[['inst', 'Instaladas', 'pieza'], ['exp', 'Explorar', 'mundo']].map(([k, t, i]) => `<button data-modo="${k}" class="${this.modo === k ? 'on' : ''}">${ic(i)}${tr(t)}</button>`).join('')}</div>
      <div id="mkExplorar" hidden></div>
      <div class="sk-inst">
      <div class="rejilla k" id="skKpis"></div>
      <div class="caja sk-instalar" id="skInstalar">
        <div class="sk-ins-fila">
          <div class="sk-ins-campo">${ic('pieza')}<input id="skFuente" placeholder="${tr('Carpeta, URL, .zip o owner/repo/ruta de GitHub')}" autocomplete="off" spellcheck="false"><span class="chip" id="skTipo" hidden></span></div>
          <button class="btn pri" id="skBtnIns">${ic('mas')}${tr('Instalar skill')}</button>
        </div>
        <div class="sk-ins-pie"><span class="tenue">${ic('archivo')}${tr('Arrastra aquí un .zip / .skill o una URL')}</span>
          <span class="sk-mercados"><span class="tenue">${tr('Explorar:')}</span>
            <a class="chip-btn" href="https://github.com/anthropics/skills" target="_blank" rel="noopener noreferrer">${ic('mundo')}<span>anthropics/skills</span></a>
            <a class="chip-btn" href="https://skillry.dev" target="_blank" rel="noopener noreferrer">${ic('mundo')}<span>skillry.dev</span></a>
            <button class="chip-btn" data-rellenar="anthropics/skills">${ic('mas')}<span>${tr('Ver las de anthropics')}</span></button></span></div>
      </div>
      <div class="sk-barra">${seg('skFiltro', [['todas', 'Todas'], ['activas', 'Activas'], ['cuarentena', 'Cuarentena'], ['externas', 'Externas']], this.filtro)}
        <div class="sk-busca">${ic('buscar')}<input id="skQ" placeholder="${tr('Buscar skills…')}" value="${esc(this.q)}"></div></div>
      <div id="skLista"></div></div></div>`;
    this.enlazar(v);
    this.repintar();
    this.ponerModo(this.modo);
    if (sub) this.abrir(decodeURIComponent(sub));
  },
  // pestañas Instaladas / Explorar (marketplace en ui/mercado.js)
  ponerModo(m) {
    if (!this.v) return;
    this.modo = m;
    $$('[data-modo]', this.v).forEach(b => b.classList.toggle('on', b.dataset.modo === m));
    $('.sk-inst', this.v).hidden = m !== 'inst';
    const c = $('#mkExplorar', this.v); c.hidden = m !== 'exp';
    if (m === 'exp' && typeof MK !== 'undefined') MK.pintar(c);
  },
  salir() {
    clearTimeout(this.cola); document.removeEventListener('keydown', this.tecla); this.v = null;
    document.removeEventListener('dragover', this.arrastre); document.removeEventListener('drop', this.soltar); document.removeEventListener('dragleave', this.fuera);
  },
  alEvento(e) {
    if (e.tipo !== 'skills') return;
    clearTimeout(this.cola);
    this.cola = setTimeout(() => this.recargar(), 250);
  },
  async recargar() {
    if (!this.v) return;
    try { const r = await api('GET', '/skills'); this.lista = SK_cache = r.skills || []; this.repintar(); if (this.abierta) this.cargarDetalle(this.abierta, true); }
    catch (er) { aviso(er.message, true); }
  },

  enlazar(v) {
    const inp = $('#skFuente', v), tipo = $('#skTipo', v);
    inp.oninput = () => { const t = SK_tipoFuente(inp.value); tipo.hidden = !t; if (t) tipo.innerHTML = `${ic(t[0])}${esc(t[1])}`; };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); this.instalar(inp.value); } };
    $('#skBtnIns', v).onclick = () => this.instalar(inp.value);
    $('#skRecargar', v).onclick = () => this.recargar().then(() => aviso(tr('Lista actualizada')));
    $('#skQ', v).oninput = e => { this.q = e.target.value.trim().toLowerCase(); this.repintar(); };
    $('[data-seg="skFiltro"]', v).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      this.filtro = b.dataset.v; $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); this.repintar();
    };
    v.onclick = e => {
      const mo = e.target.closest('[data-modo]');
      if (mo) { this.ponerModo(mo.dataset.modo); return; }
      if (e.target.closest('#mkExplorar')) return;      // el marketplace tiene su propio manejador
      const rel = e.target.closest('[data-rellenar]');
      if (rel) { inp.value = rel.dataset.rellenar; inp.oninput(); inp.focus(); return; }
      const s = e.target.closest('.sk-tarjeta [data-sw]');
      if (s) { e.stopPropagation(); this.alternar(s.dataset.sw, s.getAttribute('aria-checked') !== 'true', s); return; }
      const t = e.target.closest('.sk-tarjeta');
      if (t) { this.abrir(t.dataset.slug); return; }
      const vac = e.target.closest('[data-enfocar]');
      if (vac) { inp.focus(); }
    };
    // arrastrar y soltar en toda la página → resalta la barra de instalar
    const caja = $('#skInstalar', v);
    this.arrastre = e => { if (!this.v) return; e.preventDefault(); caja.classList.add('soltando'); };
    this.fuera = e => { if (!e.relatedTarget) caja.classList.remove('soltando'); };
    this.soltar = e => {
      if (!this.v) return;
      e.preventDefault(); caja.classList.remove('soltando');
      const f = e.dataTransfer.files?.[0];
      if (f) {
        if (!/\.(zip|skill)$/i.test(f.name)) return aviso(tr('Solo .zip o .skill'), true);
        // el navegador no expone la ruta del archivo y la API instala por ruta → pedir la ruta completa
        inp.value = ''; inp.placeholder = tr('Pega la ruta completa de {f} (p. ej. {r})', { f: f.name, r: `C:\\Users\\…\\${f.name}` });
        inp.focus(); inp.oninput();
        return aviso(tr('El navegador no da la ruta de «{f}». Pega su ruta completa en la barra y pulsa Instalar.', { f: f.name }));
      }
      const txt = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n')[0].trim();
      if (txt) { inp.value = txt; inp.oninput(); inp.focus(); }
    };
    document.addEventListener('dragover', this.arrastre); document.addEventListener('drop', this.soltar); document.addEventListener('dragleave', this.fuera);
    this.tecla = e => { if (e.key === 'Escape' && this.abierta && !$('.velo')) this.cerrar(); };
    document.addEventListener('keydown', this.tecla);
  },

  filtradas() {
    return this.lista.filter(s => {
      if (this.filtro === 'activas' && !s.activa) return false;
      if (this.filtro === 'cuarentena' && SK_nivel(s) !== 'rojo') return false;
      if (this.filtro === 'externas' && !s.externa) return false;
      return !this.q || `${s.nombre} ${s.slug} ${s.descripcion} ${SK_ORIGEN(s.origen)[0]}`.toLowerCase().includes(this.q);
    }).sort((a, b) => (b.activa - a.activa) || (SK_usos(b).total - SK_usos(a).total) || String(a.nombre || a.slug).localeCompare(b.nombre || b.slug));
  },
  repintar() {
    if (!this.v || !$('#skLista')) return;
    const L = this.lista, rojas = L.filter(s => SK_nivel(s) === 'rojo').length, act = L.filter(s => s.activa).length;
    const u = L.map(SK_usos), conSemana = u.some(x => x.semana !== null);
    const usos = u.reduce((a, x) => a + (conSemana ? x.semana || 0 : x.total), 0);
    const ext = L.filter(s => s.externa).length;
    $('#skKpis').innerHTML = [
      ['pieza', 'Instaladas', L.length, ext ? tr('{a} propias · {b} externas', { a: L.length - ext, b: ext }) : tr('todas propias')],
      ['rayo', 'Activas', act, L.length ? tr('{n} % del total', { n: Math.round(act / L.length * 100) }) : '—'],
      ['candado', 'En cuarentena', rojas, tr(rojas ? 'bloqueadas por el escáner' : 'ninguna'), rojas ? ' mal' : ''],
      ['grafica', conSemana ? 'Usos esta semana' : 'Usos', fmtK(usos), tr(conSemana ? 'últimos 7 días' : 'en total')],
    ].map(([i, t, n, s, c = '']) => `<div class="kpi${c}"><small>${ic(i)}${tr(t)}</small><b>${n}</b><span>${s}</span></div>`).join('');
    const cuenta = { todas: L.length, activas: act, cuarentena: rojas, externas: ext };
    $$('[data-seg="skFiltro"] button').forEach(b => { b.innerHTML = `${esc(b.textContent.replace(/\s*\d+$/, ''))} <span class="sk-n">${cuenta[b.dataset.v]}</span>`; });
    const f = this.filtradas();
    if (!L.length) {
      $('#skLista').innerHTML = `<div class="sk-vacio">${ic('pieza')}<h2>${tr('Aún no hay skills')}</h2>
        <p>${tr('Una skill es una carpeta con un <code>SKILL.md</code> que enseña a APOLO un oficio: rellenar PDFs, revisar código, publicar en Discord… Instala una y el escáner la revisa antes de activarla.')}</p>
        <div class="flex" style="justify-content:center"><button class="btn pri" data-rellenar="anthropics/skills">${ic('mas')}${tr('Probar con anthropics/skills')}</button><button class="btn" data-enfocar>${ic('carpeta')}${tr('Desde una carpeta')}</button></div></div>`;
      return;
    }
    $('#skLista').innerHTML = f.length ? `<div class="sk-rejilla">${f.map(s => this.tarjeta(s)).join('')}</div>`
      : `<div class="caja">${vacio(this.filtro === 'cuarentena' ? 'escudo' : 'buscar', this.filtro === 'cuarentena' && !this.q ? 'Nada en cuarentena. El escáner no ha bloqueado ninguna skill.' : this.filtro === 'externas' && !this.q ? 'No hay skills externas (Claude Code, Codex u OpenClaw).' : 'Ninguna skill coincide con el filtro.')}</div>`;
  },
  tarjeta(s) {
    const n = SK_nivel(s), [cls, txt] = SK_niv(n), [org, oi, oc] = SK_ORIGEN(s.origen), u = SK_usos(s);
    const hall = s.escaneo?.hallazgos?.length || 0;
    return `<article class="sk-tarjeta nv-${n} ${s.activa ? 'on' : ''} ${this.abierta === s.slug ? 'sel' : ''}" data-slug="${esc(s.slug)}" tabindex="0">
      <div class="sk-cab"><span class="sk-ico" style="--h:${SK_tono(s.slug)}">${esc(SK_siglas(s.nombre || s.slug))}</span>
        <div class="sk-nom"><b>${esc(s.nombre || s.slug)}</b><small>${esc(s.slug)}${s.version ? ` · v${esc(String(s.version).replace(/^v/, ''))}` : ''}</small></div>
        ${sw(s.slug, s.activa, `title="${tr(s.activa ? 'Desactivar' : 'Activar')}"`)}</div>
      <p class="sk-desc">${esc(s.descripcion || tr('Sin descripción.'))}</p>
      <div class="sk-pie"><span class="chip sk-org ${oc}">${ic(oi)}${esc(org)}</span>
        <span class="sk-sem ${cls}"><span class="punto ${cls}"></span>${txt}${hall && n !== 'verde' ? ` · ${hall}` : ''}</span>${typeof MK_firma === 'function' ? MK_firma(s.firma, true) : ''}${SK_sb(s)}
        <span class="sk-usos" title="${tr('{n} usos', { n: u.total })}${s.ultimoUso ? ' · ' + tr('último {x}', { x: esc(fecha(s.ultimoUso)) }) : ''}">${ic('latido')}${fmtK(u.semana ?? u.total)}${s.ultimoUso ? ` · ${hace(+new Date(s.ultimoUso))}` : ''}</span></div>
    </article>`;
  },

  async alternar(slug, activar, boton) {
    const s = this.lista.find(x => x.slug === slug); if (!s) return;
    let forzar = false;
    if (activar && SK_nivel(s) === 'rojo') {
      const h = [...(s.escaneo?.hallazgos || [])].sort((a, b) => SK_PESO(a.gravedad) - SK_PESO(b.gravedad));
      const ok = await modal({
        titulo: 'Activar una skill en cuarentena', ancho: 520,
        cuerpo: `<div class="sk-alerta mal">${ic('candado')}<div>${tr('<b>{s}</b> tiene {n} hallazgo peligroso.|<b>{s}</b> tiene {n} hallazgos peligrosos.', { s: esc(s.nombre || s.slug), n: h.length })}<br><span class="suave">${esc(s.escaneo?.resumen || tr('El escáner la marcó en rojo.'))}</span></div></div>
          ${h.slice(0, 4).map(x => `<div class="sk-hmini"><span class="chip ${SK_GRAV(x.gravedad)}">${esc(x.gravedad || '—')}</span><code>${esc(x.archivo)}:${esc(x.linea)}</code><span class="suave">${esc(x.regla)}</span></div>`).join('')}
          <p class="suave" style="margin:12px 0 0">${tr('Si la activas, APOLO podrá ejecutar lo que contiene con tus permisos. Hazlo solo si has leído el código y confías en el autor.')}</p>`,
        botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Activar igualmente', cls: 'mal pri', valor: true }],
      });
      if (ok !== true) { boton?.setAttribute('aria-checked', 'false'); return; }
      forzar = true;
    }
    boton?.setAttribute('aria-checked', String(activar));
    try {
      await api('PATCH', `/skills/${encodeURIComponent(slug)}`, forzar ? { activa: activar, forzar: true } : { activa: activar });
      s.activa = activar; aviso(`${s.nombre || slug}: ${tr(activar ? 'activada' : 'desactivada')}`);
      this.repintar(); if (this.abierta === slug) this.pintarDetalle();
    } catch (er) { boton?.setAttribute('aria-checked', String(!activar)); aviso(er.message, true); }
  },

  async instalar(fuente) {
    fuente = String(fuente || '').trim();
    if (!fuente) { $('#skFuente')?.focus(); return aviso(tr('Escribe una carpeta, URL, .zip o owner/repo de GitHub'), true); }
    const b = $('#skBtnIns'), txt = b?.innerHTML;
    if (b) { b.disabled = true; b.innerHTML = `<span class="punto ok vivo"></span>${tr('Instalando y escaneando…')}`; }
    try {
      const r = await api('POST', '/skills/instalar', { fuente });
      if (r.opciones?.length) {
        const elegida = await this.elegir(fuente, r.opciones);
        if (elegida) return await this.instalar(elegida);
        return;
      }
      const s = r.skill; if (!s) throw new Error(tr('El núcleo no devolvió la skill'));
      const n = SK_nivel(s);
      aviso(n === 'rojo' ? tr('{s} instalada pero EN CUARENTENA: revisa el informe del escáner', { s: s.nombre || s.slug }) : tr('{s} instalada · escáner: {x}', { s: s.nombre || s.slug, x: SK_niv(n)[1].toLowerCase() }), n === 'rojo');
      const inp = $('#skFuente'); if (inp) { inp.value = ''; inp.oninput(); }
      await this.recargar();
      this.abrir(s.slug, n === 'verde' ? 'doc' : 'seg');
    } catch (er) { aviso(er.message, true); }
    finally { if (b && b.isConnected) { b.disabled = false; b.innerHTML = txt; } }
  },
  elegir(fuente, ops) {
    return modal({
      titulo: tr('Hay {n} skills en {f}', { n: ops.length, f: fuente }), ancho: 620,
      cuerpo: `<p class="suave" style="margin:0 0 10px">${tr('Elige cuál instalar. Cada una pasa por el escáner.')}</p>
        <div class="sk-buscaop">${ic('buscar')}<input placeholder="${tr('Filtrar…')}"></div>
        <div class="sk-opciones">${ops.map((o, i) => `<button type="button" class="sk-op" data-i="${i}"><span class="sk-ico" style="--h:${SK_tono(o.nombre || o.ruta)}">${esc(SK_siglas(o.nombre || o.ruta.split('/').pop()))}</span>
          <span class="crece"><b>${esc(o.nombre || o.ruta.split('/').pop())}</b><small>${esc(o.descripcion || '')}</small><code>${esc(o.ruta)}</code></span>${ic('der')}</button>`).join('')}</div>`,
      botones: [{ txt: 'Cancelar', valor: null }],
      alAbrir: m => {
        const inp = $('.sk-buscaop input', m);
        inp.oninput = () => { const q = inp.value.toLowerCase(); $$('.sk-op', m).forEach(b => { b.hidden = q && !b.textContent.toLowerCase().includes(q); }); };
        $('.sk-opciones', m).onclick = e => {
          const b = e.target.closest('.sk-op'); if (!b) return;
          $('footer [data-i]', m).click();               // cierra el modal (valor null)…
          setTimeout(() => this.instalar(ops[+b.dataset.i].ruta));   // …y reenvía con la fuente concreta
        };
      },
    }).then(() => null);
  },

  // ---------- detalle (panel lateral) ----------
  abrir(slug, pest) {
    if (!this.v) return;
    this.abierta = slug; this.pest = pest || 'doc';
    history.replaceState(null, '', '#/skills/' + encodeURIComponent(slug));
    $$('.sk-tarjeta').forEach(t => t.classList.toggle('sel', t.dataset.slug === slug));
    let c = $('#skCajon');
    if (!c) {
      this.v.insertAdjacentHTML('beforeend', `<div class="sk-fondo" id="skFondo"></div><aside class="sk-cajon" id="skCajon" role="dialog" aria-label="${tr('Detalle de la skill')}"></aside>`);
      c = $('#skCajon'); $('#skFondo').onclick = () => this.cerrar();
      c.onclick = e => this.clicDetalle(e);
      c.onchange = async e => {                                   // Etapa H: nivel de sandbox por skill
        if (e.target.id !== 'skSandbox' || !this.det) return;
        try { const r = await api('PATCH', `/skills/${encodeURIComponent(this.det.slug)}`, { sandbox: e.target.value }); if (r.skill) { this.det = { ...this.det, sandbox: r.skill.sandbox }; const i = this.lista.findIndex(x => x.slug === this.det.slug); if (i >= 0) this.lista[i] = { ...this.lista[i], sandbox: r.skill.sandbox }; } this.repintar(); this.pintarDetalle(); }
        catch (x) { aviso(x.message, true); }
      };
      requestAnimationFrame(() => { c.classList.add('abierto'); $('#skFondo')?.classList.add('abierto'); });
    }
    const s = this.lista.find(x => x.slug === slug);
    this.det = s ? { ...s } : null;
    this.pintarDetalle(true);
    this.cargarDetalle(slug);
  },
  cerrar() {
    this.abierta = null; this.det = null;
    history.replaceState(null, '', '#/skills');
    $$('.sk-tarjeta.sel').forEach(t => t.classList.remove('sel'));
    const c = $('#skCajon'), f = $('#skFondo');
    c?.classList.remove('abierto'); f?.classList.remove('abierto');
    setTimeout(() => { if (!this.abierta) { c?.remove(); f?.remove(); } }, 200);
  },
  async cargarDetalle(slug, silencioso) {
    try {
      const d = await api('GET', `/skills/${encodeURIComponent(slug)}`);
      if (this.abierta !== slug) return;
      this.det = d.skill || d; this.pintarDetalle();
    } catch (er) {
      if (this.abierta !== slug) return;
      if (!this.det) { $('#skCajon').innerHTML = `<div class="sk-det-cab"><div class="crece"></div><button class="btn fantasma icono" data-acc="cerrar">${ic('x')}</button></div>${vacio('info', esc(er.message))}`; }
      else if (!silencioso) aviso(er.message, true);
    }
  },
  pintarDetalle(cargando) {
    const c = $('#skCajon'), s = this.det; if (!c || !s) return;
    const n = SK_nivel(s), [cls, txt, , titN, expN] = SK_niv(n), [org, oi, oc] = SK_ORIGEN(s.origen), u = SK_usos(s);
    const h = [...(s.escaneo?.hallazgos || [])].sort((a, b) => SK_PESO(a.gravedad) - SK_PESO(b.gravedad));
    const arch = Array.isArray(s.archivos) ? s.archivos : SK_items(s.archivos), perm = SK_items(s.permisos);
    const pest = [['doc', 'SKILL.md', 'archivo', ''], ['seg', tr('Escáner'), 'escudo', h.length || ''], ['arch', tr('Archivos'), 'carpeta', arch.length || ''], ['perm', tr('Permisos'), 'llave', perm.length || '']];
    let cuerpo = '';
    if (this.pest === 'doc') {
      const md0 = String(s.contenido || '').replace(/^---\n[\s\S]*?\n---\n?/, '');   // fuera el frontmatter (ya se ve arriba)
      cuerpo = s.contenido == null ? (cargando ? `<div class="pensando"><span class="puntos"><i></i><i></i><i></i></span>${tr('Cargando SKILL.md…')}</div>` : vacio('archivo', 'Sin SKILL.md'))
        : `<div class="md sk-md">${md(md0) || `<p class="tenue">${tr('SKILL.md vacío.')}</p>`}</div>`;
    } else if (this.pest === 'seg') {
      cuerpo = `<div class="sk-informe ${cls}"><div class="sk-inf-ico">${ic(SK_NIVEL[n][2])}</div><div class="crece"><b>${titN}</b>
          <p>${esc(s.escaneo?.resumen || expN)}</p></div>${s.escaneo?.fecha ? `<small class="tenue">${esc(hace(+new Date(s.escaneo.fecha)))}</small>` : ''}</div>
        ${s.escaneo?.explicacion ? `<div class="seccion">${tr('Qué significa')}</div><div class="caja pad md sk-expl">${md(s.escaneo.explicacion)}</div>` : ''}
        <div class="seccion">${tr('Hallazgos')} <span class="n">${h.length}</span></div>
        ${h.length ? `<div class="sk-hallazgos">${h.map(x => `<div class="sk-hall ${SK_GRAV(x.gravedad)}"><div class="sk-hall-cab"><span class="chip ${SK_GRAV(x.gravedad)}">${esc(x.gravedad || '—')}</span><b>${esc(x.regla || tr('regla'))}</b><code class="crece">${esc(x.archivo || '')}${x.linea ? ':' + esc(x.linea) : ''}</code></div>${x.texto ? `<pre>${esc(x.texto)}</pre>` : ''}</div>`).join('')}</div>`
          : `<div class="caja">${vacio('check', n === 'nada' ? 'Aún sin escanear.' : 'Ningún hallazgo. Limpia.')}</div>`}`;
    } else if (this.pest === 'arch') {
      const conH = {}; for (const x of h) conH[x.archivo] = (conH[x.archivo] || 0) + 1;
      cuerpo = arch.length ? `<div class="caja sk-archivos">${arch.map(a => {
        const ruta = typeof a === 'string' ? a : a.ruta || a.nombre || a.archivo || JSON.stringify(a), tam = typeof a === 'object' ? a.tam ?? a.bytes ?? a.tamano : null;
        return `<div>${ic(/\/$/.test(ruta) ? 'carpeta' : 'archivo')}<code class="crece">${esc(ruta)}</code>${conH[ruta] ? `<span class="chip ${SK_GRAV(h.find(x => x.archivo === ruta).gravedad)}">${tr('{n} hallazgo|{n} hallazgos', { n: conH[ruta] })}</span>` : ''}${tam != null ? `<small class="tenue">${fmtB(+tam)}</small>` : ''}</div>`;
      }).join('')}</div>` : `<div class="caja">${vacio('carpeta', 'Solo SKILL.md.')}</div>`;
    } else {
      cuerpo = `<p class="seccion-ayuda" style="margin:0 0 10px">${tr('Lo que la skill dice que necesita (frontmatter <code>allowed-tools</code> / permisos). El escáner comprueba que no haga más de lo declarado.')}</p>
        ${perm.length ? `<div class="caja sk-permisos">${perm.map(p => `<div>${ic('llave')}<code>${esc(p)}</code></div>`).join('')}</div>` : `<div class="caja">${vacio('llave', 'No declara permisos especiales.')}</div>`}`;
    }
    c.innerHTML = `<div class="sk-det-cab"><span class="sk-ico grande" style="--h:${SK_tono(s.slug)}">${esc(SK_siglas(s.nombre || s.slug))}</span>
        <div class="crece"><h2>${esc(s.nombre || s.slug)}</h2><div class="flex"><span class="chip sk-org ${oc}">${ic(oi)}${esc(org)}</span>${s.version ? `<span class="chip">v${esc(String(s.version).replace(/^v/, ''))}</span>` : ''}<span class="sk-sem ${cls}"><span class="punto ${cls}"></span>${txt}</span>${typeof MK_firma === 'function' ? MK_firma(s.firma) : ''}</div></div>
        <button class="btn fantasma icono" data-acc="cerrar" title="${tr('Cerrar (Esc)')}">${ic('x')}</button></div>
      <p class="sk-det-desc">${esc(s.descripcion || '')}</p>
      ${n === 'rojo' && this.pest !== 'seg' ? `<button class="sk-alerta sk-alerta-btn" data-pest="seg">${ic('candado')}<span class="crece"><b>${tr('En cuarentena')}</b> · ${esc(s.escaneo?.resumen || tr('el escáner encontró patrones peligrosos'))}</span><span class="tenue">${tr('Ver informe')} ${ic('der')}</span></button>` : ''}
      <div class="sk-det-datos"><div><small>${tr('Estado')}</small><span class="flex">${sw('det', s.activa)}<b>${tr(s.activa ? 'Activa' : 'Inactiva')}</b></span></div>
        <div><small>${tr('Usos')}</small><b>${fmtK(u.total)}${u.semana != null ? ` <span class="tenue">· ${tr('{n} esta semana', { n: u.semana })}</span>` : ''}</b></div>
        <div><small>${tr('Último uso')}</small><b>${s.ultimoUso ? esc(hace(+new Date(s.ultimoUso))) : tr('nunca')}</b></div>
        <div><small>${tr('Sandbox de sus scripts')}</small><span class="flex"><select id="skSandbox" title="${tr('auto: sin sandbox solo si está firmada por un autor de confianza y el escaneo es verde')}">${['auto', 'normal', 'restringido', 'aislado'].map(k => `<option value="${k}" ${(s.sandbox?.pedido || 'auto') === k ? 'selected' : ''}>${tr({ auto: 'Automático', normal: 'Normal (sin sandbox)', restringido: 'Restringido', aislado: 'Aislado (Windows Sandbox)' }[k])}</option>`).join('')}</select>${SK_sb(s)}</span></div></div>
      <div class="sk-det-acc"><button class="btn" data-acc="escanear">${ic('escudo')}${tr('Re-escanear')}</button><button class="btn" data-acc="actualizar">${ic('recargar')}${tr('Buscar actualización')}</button>
        ${s.externa ? `<span class="tenue sk-ext" title="${tr('Vive en la carpeta de {x}; se gestiona desde allí', { x: esc(org) })}">${ic('candado')}${tr('Externa: no se borra desde aquí')}</span>` : `<button class="btn mal" data-acc="eliminar" style="margin-left:auto">${ic('basura')}${tr('Eliminar')}</button>`}</div>
      <div class="pestanas sk-pest">${pest.map(([k, t, i, nn]) => `<button data-pest="${k}" class="${this.pest === k ? 'on' : ''}">${ic(i)}${t}${nn !== '' ? ` <span class="n">${nn}</span>` : ''}</button>`).join('')}</div>
      <div class="sk-det-cuerpo">${cuerpo}</div>`;
  },
  async clicDetalle(e) {
    const p = e.target.closest('[data-pest]');
    if (p) { this.pest = p.dataset.pest; this.pintarDetalle(); return; }
    if (e.target.closest('[data-sw="det"]')) { const b = e.target.closest('[data-sw]'); return this.alternar(this.det.slug, b.getAttribute('aria-checked') !== 'true', b); }
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const s = this.det, slug = encodeURIComponent(s.slug);
    if (b.dataset.acc === 'cerrar') return this.cerrar();
    const txt = b.innerHTML, ocupar = t => { b.disabled = true; b.innerHTML = `<span class="punto ok vivo"></span>${t}`; }, soltar = () => { if (b.isConnected) { b.disabled = false; b.innerHTML = txt; } };
    try {
      if (b.dataset.acc === 'escanear') {
        ocupar(tr('Escaneando…'));
        const r = await api('POST', `/skills/${slug}/escanear`);
        const n = r.escaneo?.nivel || r.skill?.escaneo?.nivel || r.nivel;
        aviso(`${tr('Escáner')}: ${SK_NIVEL[n] ? SK_niv(n)[1].toLowerCase() : tr('terminado')}`, n === 'rojo');
        this.pest = 'seg'; await this.recargar();
      } else if (b.dataset.acc === 'actualizar') {
        ocupar(tr('Buscando…'));
        const r = await api('POST', `/skills/${slug}/actualizar`, {});
        soltar();
        const diff = typeof r.diff === 'string' ? r.diff : r.diff ? JSON.stringify(r.diff, null, 2) : '';
        if (!diff.trim()) return aviso(tr('Ya está al día'));
        const ok = await modal({
          titulo: tr('Actualización de {s}', { s: s.nombre || s.slug }), ancho: 760,
          cuerpo: `<p class="suave" style="margin:0 0 10px">${tr('Cambios respecto a la versión instalada. Al aplicar, se vuelve a escanear.')}</p><pre class="sk-diff">${SK_diff(diff)}</pre>`,
          botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Aplicar actualización', cls: 'pri', valor: true }],
        });
        if (ok !== true) return;
        const r2 = await api('POST', `/skills/${slug}/actualizar`, { aplicar: true });
        aviso(r2.aplicado === false ? 'No se pudo aplicar' : 'Actualizada', r2.aplicado === false);
        await this.recargar();
      } else if (b.dataset.acc === 'eliminar') {
        if (!(await confirmar('Eliminar skill', tr('Se borra «{s}» y su carpeta. No se puede deshacer.', { s: s.nombre || s.slug }), true))) return;
        await api('DELETE', `/skills/${slug}`);
        aviso('Skill eliminada'); this.cerrar(); await this.recargar();
      }
    } catch (er) { aviso(er.message, true); }
    finally { soltar(); }
  },
};
function SK_diff(t) {
  return String(t).split('\n').map(l => {
    const c = /^(\+\+\+|---)/.test(l) ? 'f' : l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : l.startsWith('@@') ? 'h' : '';
    return `<span class="${c}">${esc(l) || ' '}</span>`;
  }).join('');
}
