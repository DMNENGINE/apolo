// APOLO Wrapped en el panel (#/wrapped): reproductor de tarjetas (iframe wrapped.html, mismo código que el vídeo y los PNG),
// periodo semana/mes/año, interruptor de detalles privados, PNG por tarjeta / todas (zip), vídeo MP4 y Compartir.
// Globales con prefijo WP_. Datos: GET /v1/wrapped?periodo=&privado=
const WP_PER = [['semana', 'Semana'], ['mes', 'Mes'], ['año', 'Año']];

VISTAS.wrapped = {
  periodo: 'semana', privado: false, carta: 0, total: 9,
  async pintar(v) {
    this.v = v;
    v.innerHTML = `<div class="pagina ancha wp">${cabecera('Wrapped', 'Tu resumen con el asistente, con datos reales: horas de agente, horas ahorradas, racha, modelo favorito, herramientas, logros… En tarjetas verticales listas para compartir.',
      `${seg('periodo', WP_PER, this.periodo)}`)}
      <div class="wp-grid">
        <div class="wp-movil"><div class="wp-marco"><iframe id="wpFrame" title="Wrapped"></iframe></div>
          <div class="wp-nav"><button class="btn icono" id="wpAnt" title="${tr('Anterior')}">${ic('izq')}</button><span id="wpPos">1 / 9</span><button class="btn icono" id="wpPausa" title="${tr('Pausa')}">${ic('pausa')}</button><button class="btn icono" id="wpSig" title="${tr('Siguiente')}">${ic('der')}</button></div></div>
        <div class="wp-lado">
          <div class="caja wp-acciones">
            <button class="btn pri" id="wpCompartir">${ic('enlace')}${tr('Compartir')}</button>
            <button class="btn" id="wpPng">${ic('abajo')}${tr('PNG de esta tarjeta')}</button>
            <button class="btn" id="wpTodas">${ic('abajo')}${tr('Todas las tarjetas (.zip)')}</button>
            <button class="btn" id="wpVideo">${ic('play')}${tr('Vídeo MP4')}</button>
          </div>
          <div class="caja">${fila('Incluir más detalles', 'Por defecto lo compartible solo lleva números y categorías. Actívalo para añadir la frase real del sueño y los nombres de tus proyectos.', sw('privado', this.privado))}</div>
          <div id="wpDatos"></div>
        </div>
      </div></div>`;
    enlazarControles(v, (id, val) => {
      if (id === 'periodo') { this.periodo = val; this.cargar(); }
      if (id === 'privado') { this.privado = val; this.cargar(); }
    });
    this.oyente = e => { if (e.data?.wrapped === 'carta') { this.carta = e.data.i; this.total = e.data.total; const p = $('#wpPos'); if (p) p.textContent = `${e.data.i + 1} / ${e.data.total}`; } };
    addEventListener('message', this.oyente);
    const W = () => $('#wpFrame')?.contentWindow?.WR;
    $('#wpAnt', v).onclick = () => W()?.anterior();
    $('#wpSig', v).onclick = () => W()?.siguiente();
    $('#wpPausa', v).onclick = e => { this.pausado = !this.pausado; W()?.pausa(this.pausado); e.currentTarget.innerHTML = ic(this.pausado ? 'play' : 'pausa'); };
    $('#wpPng', v).onclick = e => this.bajar(e.currentTarget, 'png', { carta: this.carta });
    $('#wpTodas', v).onclick = e => this.bajar(e.currentTarget, 'png', {});
    $('#wpVideo', v).onclick = e => this.video(e.currentTarget);
    $('#wpCompartir', v).onclick = e => this.compartir(e.currentTarget);
    await this.cargar();
  },
  salir() { removeEventListener('message', this.oyente); this.v = null; },
  acento() { return getComputedStyle(document.documentElement).getPropertyValue('--acento').trim() || '#2bdc7c'; },
  qs(extra = {}) { return new URLSearchParams({ periodo: this.periodo, privado: this.privado, ...extra }); },
  async cargar() {
    const d = await api('GET', '/wrapped?' + this.qs());
    d.acento = this.acento();
    window.WR_DATOS = d; this.d = d;
    const f = $('#wpFrame');
    const W = f?.contentWindow?.WR;
    if (!f.getAttribute('src')) f.src = 'wrapped.html';   // la primera vez el iframe arranca ya con WR_DATOS puesto
    else if (W?.recargar) W.recargar(d);
    this.pintarDatos(d);
  },
  pintarDatos(d) {
    const caja = $('#wpDatos'); if (!caja) return;
    const h = (n, dec = 1) => Number(n || 0).toLocaleString(I18N.locale(), { maximumFractionDigits: dec });
    caja.innerHTML = `<div class="rejilla k" style="margin-top:12px">
        <div class="kpi"><small>${ic('robot')}${tr('Horas de agente')}</small><b>${h(d.horasAgente)} h</b><span>${tr('{n} turnos', { n: d.turnos })}</span></div>
        <div class="kpi"><small>${ic('reloj')}${tr('Horas ahorradas')}</small><b>~${h(d.ahorro.horas)} h</b><span>${tr('estimación')}</span></div>
        <div class="kpi"><small>${ic('chat')}${tr('Conversaciones')}</small><b>${d.sesiones}</b><span>${tr('{n} días activos', { n: d.diasActivos })}</span></div>
        <div class="kpi"><small>${ic('rayo')}${tr('Racha')}</small><b>${d.racha.mejor}</b><span>${tr('actual: {n}', { n: d.racha.actual })}</span></div></div>
      <div class="seccion">${tr('Cómo calculo las horas ahorradas')}</div>
      <div class="caja pad"><p class="tenue" style="margin:0 0 10px">${tr(d.ahorro.explicacion)}</p>
        ${d.ahorro.desglose.length ? `<table class="tabla"><tr><th>${tr('Concepto')}</th><th>${tr('Cantidad')}</th><th>${tr('Min/unidad')}</th><th>${tr('Total')}</th></tr>${d.ahorro.desglose.map(x => `<tr><td>${esc(tr(x.concepto))}</td><td>${x.cantidad}</td><td>${x.minUnidad}</td><td><b>${h(x.min / 60)} h</b></td></tr>`).join('')}</table>` : `<div class="tenue">${tr('Aún sin acciones en este periodo.')}</div>`}</div>
      <div class="seccion">${tr('Qué sale en lo compartible')}</div>
      <div class="caja pad tenue" style="font-size:12.5px">${d.privado ? tr('Con detalles: números, categorías, la frase real del sueño y los nombres de tus proyectos. Nunca textos de conversaciones.') : tr('Solo números y categorías (horas, conteos, modelo, tipos de herramienta). Nada de textos de conversaciones ni nombres de proyectos.')}</div>`;
  },
  async bajar(b, tipo, extra) {
    const txt = b.innerHTML; b.disabled = true; b.innerHTML = `${ic('recargar', 'gira')}${tr('Generando…')}`;
    try { await MV_bajar('POST', `/wrapped/${tipo}?` + this.qs(extra.carta !== undefined ? { carta: extra.carta } : {}), { acento: this.acento() }, `apolo-wrapped.${extra.carta !== undefined ? 'png' : 'zip'}`); }
    catch (e) { aviso(e.message, true); }
    b.disabled = false; b.innerHTML = txt;
  },
  async video(b) {
    const txt = b.innerHTML; b.disabled = true; b.innerHTML = `${ic('recargar', 'gira')}${tr('Grabando el vídeo (~1 min)…')}`;
    try {
      const r = await api('POST', '/wrapped/video?' + this.qs(), { acento: this.acento() });
      if (!r.ok) throw new Error(r.motivo || tr('no se pudo grabar'));
      await MV_bajar('GET', '/wrapped/video?' + this.qs(), undefined, `apolo-wrapped-${this.periodo}.mp4`);
      aviso(tr('Vídeo listo ({n} s)', { n: r.segundos }));
    } catch (e) { aviso(e.message, true); }
    b.disabled = false; b.innerHTML = txt;
  },
  // Compartir: en móvil/navegadores con Web Share comparte la imagen; si no, la descarga
  async compartir(b) {
    const txt = b.innerHTML; b.disabled = true; b.innerHTML = `${ic('recargar', 'gira')}${tr('Preparando…')}`;
    try {
      const r = await fetch('/v1/wrapped/png?' + this.qs({ carta: this.total - 1 }), { method: 'POST', headers: { 'x-robot-token': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ acento: this.acento() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const blob = await r.blob(), archivo = new File([blob], `apolo-wrapped-${this.periodo}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: 'APOLO Wrapped', text: tr('Mi {p} con APOLO, el agente open source que vive en mi PC', { p: tr(this.periodo) }) });
      else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = archivo.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30_000); aviso(tr('Imagen descargada: súbela donde quieras')); }
    } catch (e) { if (e.name !== 'AbortError') aviso(e.message, true); }
    b.disabled = false; b.innerHTML = txt;
  },
};
