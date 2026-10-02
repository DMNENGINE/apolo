// Consejo de modelos (vista de Mission Control, #/consejo): varias IAs responden a la vez, debaten ronda a ronda y un moderador vota.
// Columnas por modelo, una tarjeta por ronda, y el veredicto con el % de acuerdo y las barras de votos. Pensada para grabar vídeo.
// Datos: GET /v1/consejo (candidatos + historial), POST /v1/consejo (SSE), eventos 'consejo' del SSE global (instantánea completa).
// Globales con prefijo CJ_ (los scripts del panel comparten ámbito).

const CJ_VOTO = { 'a favor': ['ok', 'A favor', 'check'], parcial: ['aviso', 'Parcial', 'info'], 'en contra': ['mal', 'En contra', 'x'] };
const CJ_POSTURA = { mantengo: ['acento', 'Mantiene'], corrijo: ['aviso', 'Se corrige'], matizo: ['', 'Matiza'] };
// nombre para mostrar: el modelo, o el proveedor si el modelo es genérico (chatgpt/default → ChatGPT)
const CJ_nombre = m => { const [p, ...r] = String(m || '').split('/'), x = r.join('/'); return /^(default|auto)$/i.test(x) ? ({ chatgpt: 'ChatGPT', claudecode: 'Claude Code' }[p] || p) : x || m; };
const CJ_pestanas = actual => `<div class="pestanas cj-pest">
  <button data-ir="#/agentes" class="${actual === 'agentes' ? 'on' : ''}">${ic('robot')}${tr('Agentes')}</button>
  <button data-ir="#/consejo" class="${actual === 'consejo' ? 'on' : ''}">${ic('persona')}${tr('Consejo')}</button>
  <button data-ir="#/hizo" class="${actual === 'hizo' ? 'on' : ''}">${ic('monitor')}${tr('Lo que hizo')}</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('.cj-pest [data-ir]'); if (b) location.hash = b.dataset.ir; });

VISTAS.consejo = {
  actual: null, elegidos: null, rondas: 1, t: null,
  async pintar(v) {
    this.v = v;
    $$('.lado-nav a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === 'agentes'));   // es parte de Mission Control
    const d = await api('GET', '/consejo');
    this.candidatos = d.candidatos; this.historial = d.historial;
    if (!this.elegidos) this.elegidos = new Set(d.candidatos.filter(c => c.ok).map(c => c.modelo));
    if (d.enCurso.length) this.actual = d.enCurso[0];
    else if (!this.actual && d.historial[0]) { try { this.actual = await api('GET', `/consejo/${d.historial[0].id}`); } catch { } }
    v.innerHTML = `<div class="pagina cj">${cabecera('Mission Control', 'Quién está haciendo qué ahora mismo: conversaciones, tareas y los subagentes que lanzan. En vivo.')}
      ${CJ_pestanas('consejo')}
      <div class="cj-nuevo tarjeta"><div class="cuerpo">
        <textarea id="cjPregunta" rows="2" placeholder="${esc(tr('¿Qué quieres que debatan? Ej.: ¿Rust o Go para un servidor de juegos?'))}"></textarea>
        <div class="cj-opciones"><div class="cj-miembros" id="cjMiembros"></div>
          <div class="flex"><span class="tenue">${tr('Rondas de debate')}</span>${seg('rondas', [['0', '0'], ['1', '1'], ['2', '2']], String(this.rondas))}
          <button class="btn pri" id="cjIr">${ic('rayo')}${tr('Convocar al consejo')}</button></div></div>
      </div></div>
      <div id="cjArena"></div>
      <div class="seccion">${tr('Consejos anteriores')}</div><div id="cjHist"></div></div>`;
    this.pintarMiembros(); this.pintarArena(); this.pintarHist();
    enlazarControles(v, (id, val) => { if (id === 'rondas') this.rondas = +val; });
    $('#cjIr').onclick = () => this.convocar();
    $('#cjPregunta').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.convocar(); };
    v.addEventListener('click', async e => {
      const m = e.target.closest('[data-cjm]');
      if (m && !m.disabled) { const x = m.dataset.cjm; this.elegidos.has(x) ? this.elegidos.delete(x) : this.elegidos.add(x); this.pintarMiembros(); return; }
      const h = e.target.closest('[data-cjh]');
      if (h) { try { this.actual = await api('GET', `/consejo/${h.dataset.cjh}`); this.pintarArena(); $('#cjArena').scrollIntoView({ behavior: 'smooth' }); } catch (er) { aviso(er.message, true); } return; }
      const c = e.target.closest('[data-cjcancelar]');
      if (c) { c.disabled = true; try { await api('POST', `/consejo/${c.dataset.cjcancelar}/cancelar`); } catch (er) { aviso(er.message, true); } }
    });
    clearInterval(this.t); this.t = setInterval(() => this.relojes(), 1000);
  },
  salir() { clearInterval(this.t); this.v = null; },
  pintarMiembros() {
    $('#cjMiembros').innerHTML = this.candidatos.map(c => `<button class="cj-m ${this.elegidos.has(c.modelo) && c.ok ? 'on' : ''}" data-cjm="${esc(c.modelo)}" ${c.ok ? '' : `disabled title="${esc(c.motivo || '')}"`}>
      ${avatar(c.modelo)}<span>${esc(CJ_nombre(c.modelo))}</span>${c.ok ? '' : `<small>${tr('no disponible')}</small>`}</button>`).join('') ||
      `<span class="tenue">${tr('No hay modelos configurados para el consejo.')}</span>`;
  },
  async convocar() {
    const pregunta = $('#cjPregunta').value.trim();
    if (!pregunta) return aviso(tr('Escribe una pregunta'), true);
    const miembros = [...this.elegidos];
    if (!miembros.length) return aviso(tr('Elige al menos un modelo'), true);
    $('#cjIr').disabled = true;
    this.actual = null;
    try {
      await flujo('POST', '/consejo', { pregunta, miembros, rondas: this.rondas }, e => {
        if (e.tipo === 'consejo') this.alEvento(e);
        if (e.tipo === 'consejo-error') aviso(e.error, true);
      });
      $('#cjPregunta') && ($('#cjPregunta').value = '');
      try { this.historial = (await api('GET', '/consejo')).historial; this.pintarHist(); } catch { }
    } catch (er) { aviso(er.message, true); }
    finally { const b = $('#cjIr'); if (b) b.disabled = false; }
  },
  alEvento(e) {
    if (e.tipo !== 'consejo' || !e.consejo || !this.v) return;
    if (this.actual && this.actual.id !== e.consejo.id && this.actual.estado === 'trabajando') return;   // no saltar de un consejo vivo a otro
    const nuevo = !this.actual || this.actual.id !== e.consejo.id;
    this.actual = e.consejo;
    this.pintarArena(nuevo);
    if (e.fase === 'veredicto') { robotsFlash(tr('VEREDICTO'), 'listo'); }
  },
  pintarArena() {
    const caja = $('#cjArena'); if (!caja) return;
    const r = this.actual;
    if (!r) { caja.innerHTML = `<div class="cj-vacio">${ic('persona')}<b>${tr('Pon a varias IAs a debatir')}</b><span>${tr('Todas responden a la vez, ven lo que dicen las demás, se corrigen… y un moderador da el veredicto.')}</span></div>`; return; }
    const vivo = r.estado === 'trabajando';
    const nR = r.rondas.length;
    const col = m => {
      const rondas = r.rondas.map((l, i) => [i, l.find(x => x.modelo === m.modelo)]).filter(([, x]) => x);
      const pensando = m.estado === 'pensando';
      const est = m.estado === 'ausente' ? ['mal', tr('Ausente')] : m.estado === 'cancelado' ? ['aviso', tr('Cancelado')] : pensando ? ['ok vivo', m.ronda ? tr('Debatiendo…') : tr('Pensando…')] : m.estado === 'listo' ? ['ok', tr('Listo')] : ['', tr('En espera')];
      const voto = r.veredicto?.votos?.find(v => v.modelo === m.modelo);
      return `<div class="cj-col ${pensando ? 'vivo' : ''} ${m.estado === 'ausente' ? 'ausente' : ''} ${voto ? 'v-' + CJ_VOTO[voto.voto]?.[0] : ''}">
        <header>${avatar(m.modelo)}<div><b>${esc(CJ_nombre(m.modelo))}</b><small>${esc(m.modelo.split('/')[0])}</small></div>
          <span class="mc-estado"><span class="punto ${est[0]}"></span>${est[1]}</span></header>
        <div class="cj-rondas">
          ${m.estado === 'ausente' ? `<div class="cj-ausente">${ic('x')}<span>${esc(m.motivo || tr('no respondió'))}</span></div>` : ''}
          ${rondas.map(([i, x]) => `<div class="cj-r">
            <div class="cj-r-cab"><span>${i === 0 ? tr('Respuesta') : tr('Debate {n}', { n: i })}</span>
              ${x.postura ? `<span class="chip ${CJ_POSTURA[x.postura]?.[0] || ''}">${tr(CJ_POSTURA[x.postura]?.[1] || x.postura)}</span>` : ''}<small>${(x.ms / 1000).toFixed(1)} s</small></div>
            <div class="md cj-txt">${md(x.texto)}</div></div>`).join('')}
          ${pensando ? `<div class="cj-r cj-escribiendo"><div class="cj-r-cab"><span>${m.ronda ? tr('Debate {n}', { n: m.ronda }) : tr('Respuesta')}</span></div><div class="cj-puntos"><i></i><i></i><i></i></div></div>` : ''}
        </div>
        ${voto ? `<footer class="cj-voto ${CJ_VOTO[voto.voto]?.[0] || ''}">${ic(CJ_VOTO[voto.voto]?.[2] || 'info')}<b>${tr(CJ_VOTO[voto.voto]?.[1] || voto.voto)}</b><span>${esc(voto.motivo)}</span></footer>` : ''}
      </div>`;
    };
    const fase = vivo ? (r.fase === 'votando' ? tr('El moderador está votando…') : nR > 1 ? tr('Ronda de debate {n} de {t}', { n: nR - 1, t: r.rondasPedidas }) : tr('Ronda 1: todos responden a la vez')) : r.estado === 'listo' ? tr('Veredicto') : r.estado === 'cancelado' ? tr('Cancelado') : tr('Error');
    caja.innerHTML = `<div class="cj-arena ${vivo ? 'vivo' : ''}">
      <div class="cj-pregunta"><small>${ic('chat')}${tr('La pregunta')}</small><h2>${esc(r.pregunta)}</h2>
        <div class="cj-fase"><span class="punto ${vivo ? 'ok vivo' : r.estado === 'listo' ? 'ok' : 'mal'}"></span>${esc(fase)}
          <span class="tenue" data-cjcrono="${r.creado}" data-fin="${r.fin || ''}">${cronoTxt((r.fin || Date.now()) - r.creado)}</span>
          ${vivo ? `<button class="btn mini mal" data-cjcancelar="${esc(r.id)}">${ic('parar')}${tr('Detener')}</button>` : ''}
          <a class="btn mini fantasma" href="#/chat/${esc(r.sesion)}">${tr('Abrir')} ${ic('der')}</a></div></div>
      <div class="cj-cols" style="--n:${r.miembros.length}">${r.miembros.map(col).join('')}</div>
      ${r.veredicto ? this.veredicto(r) : r.estado === 'error' ? `<div class="cj-veredicto mal">${ic('x')} ${esc(r.error || '')}</div>` : r.fase === 'votando' ? `<div class="cj-veredicto cj-votando"><div class="cj-puntos"><i></i><i></i><i></i></div>${tr('El moderador está leyendo a todos y contando votos…')}</div>` : ''}
    </div>`;
  },
  veredicto(r) {
    const v = r.veredicto, total = v.votos.length || 1;
    const cuenta = k => v.votos.filter(x => x.voto === k).length;
    const barras = ['a favor', 'parcial', 'en contra'].map(k => {
      const n = cuenta(k), [cls, txt] = CJ_VOTO[k];
      return `<div class="cj-barra ${cls}"><span>${tr(txt)}</span><div><i style="width:${(n / total * 100).toFixed(0)}%"></i></div><b>${n}</b></div>`;
    }).join('');
    const a = Math.max(0, Math.min(100, v.acuerdo | 0));
    return `<div class="cj-veredicto">
      <div class="cj-v-cab"><div class="cj-anillo" style="--p:${a}"><b>${a}%</b><small>${tr('acuerdo')}</small></div>
        <div class="cj-v-tit"><small>${ic('check')}${tr('Veredicto del consejo')}${v.moderador ? ` · ${tr('moderador')}: ${esc(CJ_nombre(v.moderador))}` : ''}</small>
          <h3>${esc(v.titular || tr('Esto es lo que concluyen'))}</h3>
          <div class="cj-barras">${barras}</div></div></div>
      <div class="md cj-v-txt">${md(v.respuesta)}</div>
      ${v.votos.length ? `<div class="cj-v-votos">${v.votos.map(x => `<span class="cj-chipvoto ${CJ_VOTO[x.voto]?.[0] || ''}" title="${esc(x.motivo)}">${avatar(x.modelo)}${esc(CJ_nombre(x.modelo))} ${ic(CJ_VOTO[x.voto]?.[2] || 'info')}</span>`).join('')}</div>` : ''}
      ${v.aviso ? `<div class="tenue">${esc(v.aviso)}</div>` : ''}
    </div>`;
  },
  pintarHist() {
    const caja = $('#cjHist'); if (!caja) return;
    caja.innerHTML = this.historial.length ? `<div class="cj-hist">${this.historial.map(h => `<button class="cj-h" data-cjh="${esc(h.id)}">
      <span class="cj-h-av">${h.miembros.slice(0, 5).map(m => avatar(m.modelo)).join('')}</span>
      <b>${esc(h.pregunta)}</b><small>${hace(h.creado)}</small>
      ${h.acuerdo !== undefined && h.acuerdo !== null ? `<span class="chip ${h.acuerdo >= 70 ? 'ok' : h.acuerdo >= 40 ? 'aviso' : 'mal'}">${h.acuerdo}%</span>` : `<span class="chip">${tr(h.estado === 'trabajando' ? 'en curso' : h.estado)}</span>`}</button>`).join('')}</div>`
      : vacio('persona', 'Aún no has convocado ningún consejo.');
  },
  relojes() {
    for (const el of $$('[data-cjcrono]')) { if (el.dataset.fin) continue; el.textContent = cronoTxt(Date.now() - +el.dataset.cjcrono); }
  },
};
