// Diseño (#/diseno, #/diseno/<slug>): biblioteca de patrones de interfaz que APOLO aprende estudiando apps reales en Mobbin
// (MCP oficial). Conectar Mobbin (OAuth), estudiar un tema, aprendizaje nocturno con temario, buscar y leer fichas. Globales DS_.
P.diseno = '<path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 3.5-3.5 3.5H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/>';
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'memoria'), 0, ['diseno', 'Diseño', 'diseno']);

Object.assign(I18N.dic.en, {
  'Diseño': 'Design', 'APOLO estudia apps reales en Mobbin y guarda los patrones que aprende. Los consulta antes de diseñar cualquier interfaz.': 'APOLO studies real apps on Mobbin and keeps the patterns it learns. It checks them before designing any interface.',
  'Mobbin conectado': 'Mobbin connected', 'Mobbin no está conectado': 'Mobbin is not connected', 'Conectar Mobbin': 'Connect Mobbin', 'Desconectar': 'Disconnect',
  'Se abre el navegador: entra con tu cuenta de Mobbin (plan Pro o superior) y autoriza a APOLO.': 'Your browser opens: sign in with your Mobbin account (Pro plan or higher) and authorize APOLO.',
  'Esperando la autorización en el navegador…': 'Waiting for authorization in the browser…', 'Estudiar un tema': 'Study a topic',
  'Una sola pantalla, flujo o sección, en lenguaje claro: «checkout con Apple Pay y código promocional»': 'A single screen, flow or section, in plain words: «checkout with Apple Pay and promo code»',
  'Estudiar': 'Study', 'Estudiando en Mobbin…': 'Studying on Mobbin…', 'pantallas': 'screens', 'flujos': 'flows', 'secciones': 'sections',
  'Aprender solo cada noche': 'Learn by itself every night', 'Estudia {n} temas nuevos del temario a las 3:30 y te lo cuenta en el briefing.': 'Studies {n} new topics from the syllabus at 3:30 and tells you in the briefing.',
  'Estudiar ahora': 'Study now', '{n} temas del temario por estudiar': '{n} syllabus topics left', 'Buscar en la biblioteca…': 'Search the library…',
  'La biblioteca está vacía. Conecta Mobbin y estudia el primer tema, o activa el aprendizaje nocturno.': 'The library is empty. Connect Mobbin and study the first topic, or turn on nightly learning.',
  'Aprendido: {n}': 'Learned: {n}', 'Esta función necesita reiniciar APOLO (el núcleo que está corriendo es de antes). Bandeja → Salir y vuelve a abrirlo.': 'This feature needs APOLO to restart (the running core is older). Tray → Quit and open it again.', 'Borrar patrón': 'Delete pattern', '¿Borrar este patrón?': 'Delete this pattern?', 'Biblioteca': 'Library', '{n} patrones': '{n} patterns',
});

const DS_fecha = t => new Date(t).toLocaleDateString(I18N.idioma() === 'en' ? 'en' : 'es', { day: 'numeric', month: 'short' });

VISTAS.diseno = {
  salir() { clearInterval(this.sondeo); },
  async pintar(v, sub) {
    this.salir(); this.v = v;
    if (sub) return this.ficha(v, sub);
    let D, M;
    try { [D, M] = await Promise.all([api('GET', '/diseno'), api('GET', '/mcp-remotos').catch(() => ({ servidores: [] }))]); }
    catch (e) {                                              // núcleo de antes de la biblioteca de diseño (la app no se reinició)
      v.innerHTML = `<div class="pagina">${cabecera('Diseño', 'APOLO estudia apps reales en Mobbin y guarda los patrones que aprende. Los consulta antes de diseñar cualquier interfaz.')}
        <div class="caja pad rn-vacio">${ic('info')}<p>${esc(/ruta|404/i.test(e.message) ? tr('Esta función necesita reiniciar APOLO (el núcleo que está corriendo es de antes). Bandeja → Salir y vuelve a abrirlo.') : e.message)}</p></div></div>`;
      return;
    }
    this.D = D;
    const mb = M.servidores.find(s => s.id === 'mobbin') || {};
    v.innerHTML = `<div class="pagina">${cabecera('Diseño', 'APOLO estudia apps reales en Mobbin y guarda los patrones que aprende. Los consulta antes de diseñar cualquier interfaz.')}
      <div class="caja pad ds-mobbin">
        <div class="crece"><b>${D.mobbin ? `<span class="punto ok"></span> ${tr('Mobbin conectado')}` : `<span class="punto"></span> ${tr('Mobbin no está conectado')}`}</b>
          <small class="tenue">${D.mobbin ? esc((mb.herramientas || []).join(' · ')) : tr('Se abre el navegador: entra con tu cuenta de Mobbin (plan Pro o superior) y autoriza a APOLO.')}</small></div>
        ${D.mobbin ? `<button class="btn fantasma" id="dsDesc">${tr('Desconectar')}</button>` : `<button class="btn pri" id="dsCon">${ic('enlace')}${tr('Conectar Mobbin')}</button>`}
      </div>
      <div class="caja pad ds-estudiar">
        <div class="seccion" style="margin-top:0">${tr('Estudiar un tema')}</div>
        <div class="ds-fila"><input id="dsTema" class="crece" placeholder="${esc(tr('Una sola pantalla, flujo o sección, en lenguaje claro: «checkout con Apple Pay y código promocional»'))}" ${D.mobbin ? '' : 'disabled'}>
          <select id="dsPlat" ${D.mobbin ? '' : 'disabled'}><option value="ios">iOS</option><option value="web">Web</option></select>
          <select id="dsTipo" ${D.mobbin ? '' : 'disabled'}>${['pantallas', 'flujos', 'secciones'].map(t => `<option value="${t}">${tr(t)}</option>`).join('')}</select>
          <button class="btn pri" id="dsEst" ${D.mobbin ? '' : 'disabled'}>${ic('chispa')}${tr('Estudiar')}</button></div>
        <div class="ds-regla"><div class="crece"><b>${tr('Aprender solo cada noche')}</b><small class="tenue">${tr('Estudia {n} temas nuevos del temario a las 3:30 y te lo cuenta en el briefing.', { n: D.config.porNoche })} · ${tr('{n} temas del temario por estudiar', { n: D.pendientes })}</small></div>
          <button class="btn fantasma" id="dsYa" ${D.mobbin ? '' : 'disabled'}>${tr('Estudiar ahora')}</button>${sw('aprendizaje', D.config.aprendizaje, D.mobbin ? '' : 'disabled')}</div>
      </div>
      <div class="seccion">${tr('Biblioteca')}<span class="n">${D.patrones.length}</span></div>
      <div class="rn-busca">${ic('buscar')}<input id="dsQ" placeholder="${esc(tr('Buscar en la biblioteca…'))}"></div>
      <div id="dsLista">${this.lista(D.patrones)}</div></div>`;
    v.onclick = async e => {
      if (e.target.closest('#dsCon')) return DS_conectar(e.target.closest('#dsCon'));
      if (e.target.closest('#dsDesc')) { await api('POST', '/mcp-remotos/mobbin/desconectar'); return this.pintar(v); }
      if (e.target.closest('#dsEst')) return DS_estudiar(e.target.closest('#dsEst'));
      if (e.target.closest('#dsYa')) { const b = e.target.closest('#dsYa'); b.disabled = true; b.textContent = tr('Estudiando en Mobbin…'); try { const r = await api('POST', '/diseno/estudiar-ya'); aviso(r.resultado || 'OK'); } catch (er) { aviso(er.message, true); } return this.pintar(v); }
      const s = e.target.closest('[data-sw="aprendizaje"]');
      if (s && !s.disabled) { const on = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', on); try { await api('PATCH', '/diseno/config', { aprendizaje: on }); } catch (er) { aviso(er.message, true); } }
    };
    $('#dsTema', v).onkeydown = e => { if (e.key === 'Enter') $('#dsEst', v).click(); };
    $('#dsQ', v).oninput = e => {
      const q = e.target.value.trim().toLowerCase();
      $('#dsLista', v).innerHTML = this.lista(this.D.patrones.filter(p => !q || `${p.nombre} ${p.tema} ${p.resumen} ${(p.apps || []).join(' ')}`.toLowerCase().includes(q)));
    };
  },
  lista(ps) {
    if (!ps.length) return `<div class="caja pad rn-vacio">${ic('diseno')}<p>${tr('La biblioteca está vacía. Conecta Mobbin y estudia el primer tema, o activa el aprendizaje nocturno.')}</p></div>`;
    return `<div class="ds-grid">${ps.map(p => `<a class="caja ds-item" href="#/diseno/${esc(p.slug)}">
      <div class="rn-item-cab"><b>${esc(p.nombre)}</b><span class="chip">${esc(p.plataforma === 'web' ? 'Web' : 'iOS')} · ${tr(p.tipo)}</span></div>
      <p class="rn-item-res">${esc(p.resumen)}</p>
      <small class="tenue">${DS_fecha(p.estudiado)} · ${esc((p.apps || []).slice(0, 5).join(', '))}</small></a>`).join('')}</div>`;
  },
  async ficha(v, slug) {
    const f = await api('GET', `/diseno/${encodeURIComponent(slug)}`);
    v.innerHTML = `<div class="pagina"><div class="cab-pag"><div><a href="#/diseno" class="tenue db-volver">${ic('izq')}${tr('Diseño')}</a></div>
      <div class="flex"><button class="btn fantasma icono mal" id="dsDel" title="${tr('Borrar patrón')}">${ic('basura')}</button></div></div>
      <div class="caja pad ds-ficha md">${md(f.markdown)}</div></div>`;
    $('#dsDel', v).onclick = async () => { if (!confirm(tr('¿Borrar este patrón?'))) return; await api('DELETE', `/diseno/${encodeURIComponent(slug)}`); location.hash = '#/diseno'; };
    v.querySelectorAll('.ds-ficha a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  },
};

async function DS_conectar(b) {
  b.disabled = true; b.textContent = tr('Esperando la autorización en el navegador…');
  try {
    const { flujo } = await api('POST', '/mcp-remotos/mobbin/conectar', {});
    const V = VISTAS.diseno; clearInterval(V.sondeo);
    V.sondeo = setInterval(async () => {
      const f = await api('GET', `/mcp-remotos/flujo/${flujo}`).catch(() => ({ estado: 'error', error: 'sin respuesta' }));
      if (f.estado === 'esperando') return;
      clearInterval(V.sondeo);
      if (f.estado === 'conectado') aviso(tr('Mobbin conectado')); else aviso(f.error || f.estado, true);
      if (E.vista === V) V.pintar(V.v);
    }, 1500);
  } catch (e) { aviso(e.message, true); b.disabled = false; b.textContent = tr('Conectar Mobbin'); }
}

async function DS_estudiar(b) {
  const v = VISTAS.diseno.v, tema = $('#dsTema', v).value.trim(); if (!tema) return $('#dsTema', v).focus();
  b.disabled = true; const antes = b.innerHTML; b.textContent = tr('Estudiando en Mobbin…');
  try {
    const r = await api('POST', '/diseno/estudiar', { tema, plataforma: $('#dsPlat', v).value, tipo: $('#dsTipo', v).value });
    aviso(tr('Aprendido: {n}', { n: r.nombre })); location.hash = `#/diseno/${r.slug}`;
  } catch (e) { aviso(e.message, true); b.disabled = false; b.innerHTML = antes; }
}
