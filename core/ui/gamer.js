// Modo Gamer (#/gamer, Etapa J fase 1): interruptor, estado, cambios aplicados (se deshacen al apagar), revisión de solo lectura
// (Hz del monitor, HAGS, modo juego, inicio) y limpieza de cachés con tamaños y confirmación. API /v1/gamer. Globales con prefijo GM_.
'use strict';
P.mando = '<path d="M6 9h4M8 7v4M15 10h.01M18 8h.01"/><path d="M7 5h10a5 5 0 0 1 4.9 6l-1 5a3 3 0 0 1-5.3 1.3L14 15h-4l-1.6 2.3A3 3 0 0 1 3.1 16l-1-5A5 5 0 0 1 7 5z"/>';
NAV_APP.splice(Math.max(0, NAV_APP.findIndex(n => n[0] === 'wrapped')), 0, ['gamer', 'Modo Gamer', 'mando']);

Object.assign(I18N.dic.en, {
  'Modo Gamer': 'Gamer Mode', 'Solo optimizaciones reales y reversibles: todo se deshace al apagarlo, aunque APOLO se cierre a medias.': 'Only real, reversible optimizations: everything is undone when you turn it off, even if APOLO closes halfway.',
  'Activo': 'On', 'Apagado': 'Off', 'desde': 'since', 'Juego (proceso, opcional)': 'Game (process, optional)', 'p. ej. eurotrucks2.exe': 'e.g. eurotrucks2.exe',
  'Cambios aplicados': 'Applied changes', 'Se deshacen en orden inverso al apagar.': 'Undone in reverse order when you turn it off.', 'Sin cambios: ya estaba todo bien.': 'No changes: everything was already fine.',
  'Última sesión': 'Last session', 'cambios deshechos': 'changes undone', 'hecho': 'done', 'pendiente': 'pending', 'deshecho': 'undone', 'no deshecho': 'not undone',
  'Apps a pausar': 'Apps to pause', 'Nombres de proceso separados por comas. Vacío = no se pausa nada. Los procesos del sistema y APOLO nunca se tocan.': 'Process names separated by commas. Empty = nothing is paused. System processes and APOLO are never touched.',
  'Suspender (se reanudan al salir)': 'Suspend (resumed on exit)', 'Cerrar (pide confirmación, no se reabren)': 'Close (asks for confirmation, not reopened)', 'Guardar': 'Save', 'Guardado': 'Saved',
  'Revisión del PC': 'PC check', 'Solo lectura: no cambia nada.': 'Read only: changes nothing.', 'Monitores': 'Monitors', 'HAGS (GPU por hardware)': 'HAGS (hardware GPU scheduling)',
  'Modo juego de Windows': 'Windows Game Mode', 'Programas de inicio': 'Startup programs', 'activada': 'on', 'desactivada': 'off', 'activado': 'on', 'desactivado': 'off',
  'no disponible / por defecto': 'not available / default', 'Todo bien puesto.': 'All set correctly.', 'Ver lista': 'Show list', 'Revisar de nuevo': 'Check again',
  'Limpieza': 'Cleanup', 'Cachés que se regeneran solas. Los archivos en uso se saltan. Nunca durante la partida.': 'Caches that rebuild themselves. Files in use are skipped. Never during a game.',
  'Limpiar lo marcado': 'Clean selected', 'no existe': 'not found', '{n} archivos': '{n} files', 'Analizando…': 'Analyzing…', '¿Limpiar?': 'Clean up?',
  'Se borrará el contenido de: {z}. Total aprox. {t}.': 'The contents of {z} will be deleted. About {t} in total.', 'Liberados {t} ({n} archivos; {s} en uso saltados)': 'Freed {t} ({n} files; {s} in use skipped)',
  'Rendimiento': 'Performance', 'FPS reales con PresentMon (open source de Intel) + temperaturas': 'Real FPS with PresentMon (Intel open source) + temperatures',
  'descargado de la release oficial': 'downloaded from the official release', 'Falta PresentMon': 'PresentMon missing',
  'Lo necesitas para medir FPS. Se baja SOLO cuando pulses, de la release oficial de GitHub (GameTechDev/PresentMon).': 'You need it to measure FPS. It is downloaded ONLY when you click, from the official GitHub release (GameTechDev/PresentMon).',
  'Descargar PresentMon': 'Download PresentMon', '¿Descargar PresentMon {v}?': 'Download PresentMon {v}?',
  'Release oficial de GitHub ({a}, {t}). sha256 publicado: {s}. Se guarda en la carpeta de datos de APOLO y solo se ejecuta cuando mides.': 'Official GitHub release ({a}, {t}). Published sha256: {s}. Saved in APOLO\'s data folder and only run when you measure.',
  'no publicado': 'not published', 'PresentMon {v} listo · sha256 {s}': 'PresentMon {v} ready · sha256 {s}', 'quedan {s} s': '{s} s left', 'antes': 'before', 'Cancelar': 'Cancel',
  'Segundos por medición': 'Seconds per measurement', 'Medir ahora': 'Measure now', 'Antes/después': 'Before/after',
  'Antes/después: mide con el Modo Gamer apagado, lo activa y vuelve a medir el mismo tiempo. Juega igual en las dos (misma zona, misma acción).': 'Before/after: measures with Gamer Mode off, turns it on and measures again for the same time. Play the same way in both (same area, same action).',
  'Medir como administrador (Windows pedirá permiso)': 'Measure as administrator (Windows will ask)', 'Activar solo al jugar a pantalla completa': 'Turn on automatically when a game goes fullscreen',
  'Leer sensores': 'Read sensors', 'Historial': 'History', 'calor': 'heat', 'Compartir': 'Share', 'Aún no has medido nada.': 'Nothing measured yet.', 'Medición terminada': 'Measurement finished',
  'Midiendo SIN Modo Gamer… sigue jugando': 'Measuring WITHOUT Gamer Mode… keep playing', 'Midiendo… sigue jugando': 'Measuring… keep playing', 'Preparando…': 'Preparing…',
  'Midiendo SIN Modo Gamer': 'Measuring WITHOUT Gamer Mode', 'Activando el Modo Gamer…': 'Turning Gamer Mode on…', 'Midiendo CON Modo Gamer': 'Measuring WITH Gamer Mode', 'Midiendo': 'Measuring',
  'Reloj GPU': 'GPU clock', 'Potencia GPU': 'GPU power', 'sin NVIDIA': 'no NVIDIA', 'frec.': 'freq.',
  'Temperatura de CPU: zona térmica ACPI (aproximada). La real por núcleo la da LibreHardwareMonitor, que necesita administrador.': 'CPU temperature: ACPI thermal zone (approximate). Real per-core temperature needs LibreHardwareMonitor, which requires administrator.',
  'APOLO me subió los FPS y aquí está la prueba (medido con PresentMon)': 'APOLO raised my FPS and here is the proof (measured with PresentMon)', 'Imagen descargada: súbela donde quieras': 'Image downloaded: post it anywhere',
  'Medir FPS antes/después (PresentMon) llega en la fase 2.': 'Measuring FPS before/after (PresentMon) comes in phase 2.','Activando…': 'Turning on…', 'Restaurando…': 'Restoring…',
});

const GM_EST = { hecho: 'ok', deshecho: '', pendiente: 'aviso', error: 'mal', 'no deshecho': 'mal' };
const GM_FASES = ['preparando', 'antes', 'activando', 'despues', 'midiendo'];
const GM_FASE_TXT = { preparando: 'Preparando…', antes: 'Midiendo SIN Modo Gamer', activando: 'Activando el Modo Gamer…', despues: 'Midiendo CON Modo Gamer', midiendo: 'Midiendo' };
const GM_sens = s => {
  const g = s?.gpu, c = s?.cpu;
  const k = (cls, ico, t, v) => `<div class="kpi${cls}"><small>${ic(ico)}${tr(t)}</small><b>${v}</b></div>`;
  return (g ? k(g.throttleTermico || g.temp >= 87 ? ' mal' : '', 'rayo', 'GPU', `${g.temp ?? '—'} °C · ${g.uso ?? '—'} %`) + k('', 'grafica', 'Reloj GPU', `${g.reloj ?? '—'} MHz`) + k(g.throttlePotencia ? ' aviso' : '', 'enchufe', 'Potencia GPU', `${g.potencia != null ? Math.round(g.potencia) : '—'} W`) : k('', 'rayo', 'GPU', tr('sin NVIDIA')))
    + (c ? k(c.limitePasivo != null && c.limitePasivo < 100 ? ' mal' : '', 'cpu', 'CPU', `${c.uso ?? '—'} % · ${c.frecPct ?? '—'} % ${tr('frec.')}`) : '');
};
const GM_hora = s => (s ? new Date(s).toLocaleString(I18N.idioma() === 'en' ? 'en' : 'es', { dateStyle: 'short', timeStyle: 'short' }) : '');
const GM_cambios = cs => (cs?.length ? `<div class="gm-lista">${cs.map(c => `<div class="gm-fila"><span class="chip ${GM_EST[c.estado] || ''}">${esc(tr(c.estado))}</span><b>${esc(tr(c.titulo || c.tipo))}</b><small class="tenue">${esc(c.detalle || '')}${c.error ? ` · ${esc(c.error)}` : ''}</small></div>`).join('')}</div>`
  : `<p class="tenue">${tr('Sin cambios: ya estaba todo bien.')}</p>`);

VISTAS.gamer = {
  claves: 'gamer juego juegos fps rendimiento energia energía hz monitor hags limpieza cache caché shaders inicio',
  salir() { clearInterval(this.t); clearInterval(this.tr_); this.t = this.tr_ = null; },
  async pintar(v) {
    this.salir(); this.v = v;
    v.innerHTML = `<div class="pagina">${cabecera('Modo Gamer', 'Solo optimizaciones reales y reversibles: todo se deshace al apagarlo, aunque APOLO se cierre a medias.', `<button class="btn" id="gmRev">${ic('recargar')}${tr('Revisar de nuevo')}</button>`)}
      <div id="gmEstado" class="caja pad"><p class="tenue">${tr('Analizando…')}</p></div>
      <div class="seccion">${tr('Revisión del PC')}</div><div id="gmRevision"><p class="tenue">${tr('Analizando…')}</p></div>
      <div class="seccion">${tr('Limpieza')}</div><div id="gmLimpieza" class="caja pad"><p class="tenue">${tr('Analizando…')}</p></div>
      <div class="seccion">${tr('Rendimiento')}<small class="tenue"> · ${tr('FPS reales con PresentMon (open source de Intel) + temperaturas')}</small></div><div id="gmRend" class="caja pad"><p class="tenue">${tr('Analizando…')}</p></div></div>`;
    v.onclick = e => this.clic(e);
    await this.cargar(true);
    this.limpieza();
    this.t = setInterval(() => this.cargar(false), 5000);
    this.rend(); this.tr_ = setInterval(() => { if (this.midiendo || ++this.k % 5 === 0) this.rend(); }, 1000); this.k = 0;
  },
  async cargar(conRevision) {
    try {
      const G = await api('GET', `/gamer${conRevision ? '' : '?revision=0'}`);
      this.G = G; this.pintarEstado(G);
      if (conRevision) this.pintarRevision(G.revision);
    } catch (e) { if (conRevision) aviso(e.message, true); }
  },
  pintarEstado(G) {
    const box = $('#gmEstado', this.v); if (!box) return;
    const e = G.estado, foco = document.activeElement?.id;
    if (this.ocupado || (foco === 'gmJuego' || foco === 'gmCerrar') && box.dataset.activo === String(e.activo)) return;   // no pisar lo que escribes
    box.dataset.activo = String(e.activo);
    const ult = !e.activo && G.ultima ? `<small class="tenue">${tr('Última sesión')}: ${GM_hora(G.ultima.desde)} → ${GM_hora(G.ultima.hasta)} · ${G.ultima.cambios.filter(c => c.estado === 'deshecho').length} ${tr('cambios deshechos')}</small>` : '';
    box.innerHTML = `<div class="gm-cab"><div>${ic('mando')}<b>${tr('Modo Gamer')}</b> <span class="chip ${e.activo ? 'ok' : ''}">${tr(e.activo ? 'Activo' : 'Apagado')}${e.activo ? ` · ${esc(e.juego || '')} ${tr('desde')} ${GM_hora(e.desde)}` : ''}</span></div>${sw('gamer', e.activo)}</div>
      ${e.activo ? '' : `<label class="gm-campo"><small>${tr('Juego (proceso, opcional)')}</small><input id="gmJuego" placeholder="${esc(tr('p. ej. eurotrucks2.exe'))}" value="${esc(this.juego || '')}"></label>`}
      ${e.activo ? `<div class="seccion">${tr('Cambios aplicados')}<small class="tenue"> · ${tr('Se deshacen en orden inverso al apagar.')}</small></div>${GM_cambios(e.cambios)}` : ult}
      <details class="gm-conf"><summary>${tr('Apps a pausar')}</summary>
        <p class="tenue">${tr('Nombres de proceso separados por comas. Vacío = no se pausa nada. Los procesos del sistema y APOLO nunca se tocan.')}</p>
        <input id="gmCerrar" value="${esc((G.config.cerrar || []).join(', '))}" placeholder="OneDrive.exe, Dropbox.exe">
        <select id="gmModo"><option value="suspender"${G.config.modo !== 'cerrar' ? ' selected' : ''}>${tr('Suspender (se reanudan al salir)')}</option><option value="cerrar"${G.config.modo === 'cerrar' ? ' selected' : ''}>${tr('Cerrar (pide confirmación, no se reabren)')}</option></select>
        <button class="btn mini" id="gmGuardar">${tr('Guardar')}</button></details>`;
    const j = $('#gmJuego', box); if (j) j.oninput = ev => { this.juego = ev.target.value.trim(); };
  },
  pintarRevision(r) {
    const box = $('#gmRevision', this.v); if (!box) return;
    if (!r || r.error) { box.innerHTML = `<p class="tenue">${esc(r?.error || '')}</p>`; return; }
    const mon = (r.monitores || []).map(m => `<div>${esc(m.ancho)}×${esc(m.alto)} · <b>${esc(m.actualHz)} Hz</b> / ${esc(m.maxHz)} Hz</div>`).join('') || '—';
    const malHz = (r.monitores || []).some(m => m.aviso);
    box.innerHTML = `<div class="rejilla k">
        <div class="kpi${malHz ? ' aviso' : ''}"><small>${ic('monitor')}${tr('Monitores')}</small><span style="font-size:13px;color:var(--txt)">${mon}</span></div>
        <div class="kpi${r.hags.activo === false ? ' aviso' : ''}"><small>${ic('rayo')}${tr('HAGS (GPU por hardware)')}</small><b style="font-size:17px">${tr(r.hags.texto)}</b></div>
        <div class="kpi${r.modoJuego.activo ? '' : ' aviso'}"><small>${ic('mando')}${tr('Modo juego de Windows')}</small><b style="font-size:17px">${tr(r.modoJuego.texto)}</b></div>
        <div class="kpi${(r.inicio || []).length > 12 ? ' aviso' : ''}"><small>${ic('reloj')}${tr('Programas de inicio')}</small><b>${(r.inicio || []).length}</b></div></div>
      <div class="caja pad" style="margin-top:10px">${r.avisos.length ? `<ul class="gm-avisos">${r.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : `<p>${ic('check')} ${tr('Todo bien puesto.')}</p>`}
        ${(r.inicio || []).length ? `<details><summary>${tr('Programas de inicio')} · ${tr('Ver lista')}</summary><div class="gm-lista">${r.inicio.map(i => `<div class="gm-fila"><b>${esc(i.nombre)}</b><small class="tenue">${esc(i.origen)} · ${esc(String(i.comando || '').slice(0, 140))}</small></div>`).join('')}</div></details>` : ''}</div>`;
  },
  async limpieza() {
    const box = $('#gmLimpieza', this.v); if (!box) return;
    try {
      const { zonas } = await api('GET', '/gamer/limpieza');
      this.zonas = zonas;
      box.innerHTML = `<p class="tenue" style="margin-top:0">${tr('Cachés que se regeneran solas. Los archivos en uso se saltan. Nunca durante la partida.')}</p>
        <div class="gm-lista">${zonas.map(z => `<label class="gm-fila"><input type="checkbox" class="gmZ" value="${esc(z.id)}" ${z.existe && z.bytes ? '' : 'disabled'}><b>${esc(tr(z.nombre))}</b>
          <small class="tenue">${z.existe ? `${fmtB(z.bytes)} · ${tr('{n} archivos', { n: z.archivos })}` : tr('no existe')}</small></label>`).join('')}</div>
        <button class="btn pri" id="gmLimpiar" style="margin-top:10px">${ic('basura')}${tr('Limpiar lo marcado')}</button>`;
    } catch (e) { box.innerHTML = `<p class="tenue">${esc(e.message)}</p>`; }
  },

  // ---------- Rendimiento (fase 2): PresentMon, medidor en vivo, benchmark antes/después, historial y compartir ----------
  async rend() {
    if (!$('#gmRend', this.v)) return;
    try { const R = await api('GET', '/gamer/rendimiento'); this.R = R; this.pintarRend(R); }
    catch (e) { $('#gmRend', this.v).innerHTML = `<p class="tenue">${esc(e.message)}</p>`; }
  },
  pintarRend(R) {
    const box = $('#gmRend', this.v); if (!box) return;
    const v = R.vivo || {}, corre = GM_FASES.includes(v.fase);
    const antes = this.midiendo; this.midiendo = corre;
    if (antes && !corre && v.fase === 'listo') { aviso(tr('Medición terminada')); this.cargar(false); }
    if (corre || !box.dataset.pintado || antes !== corre || this.sucio) {
      const foco = document.activeElement?.id;
      if (!corre && box.dataset.pintado && (foco === 'gmRendJuego' || foco === 'gmSeg') && !this.sucio) return this.pintarHist(R);
      this.sucio = false; box.dataset.pintado = '1';
      const pm = R.presentmon || {};
      const cab = pm.instalado
        ? `<div class="gm-fila">${ic('check')}<b>PresentMon ${esc(pm.version || '')}</b><small class="tenue">${esc(pm.fuente === 'apolo' ? tr('descargado de la release oficial') : pm.exe || '')}${pm.sha256 ? ` · sha256 ${esc(pm.sha256.slice(0, 16))}…` : ''}</small></div>`
        : `<div class="gm-fila"><span class="chip aviso">${tr('Falta PresentMon')}</span><small class="tenue">${tr('Lo necesitas para medir FPS. Se baja SOLO cuando pulses, de la release oficial de GitHub (GameTechDev/PresentMon).')}</small>
           <button class="btn pri mini" id="gmPmBajar">${ic('abajo')}${tr('Descargar PresentMon')}</button></div>`;
      const viv = corre ? `<div class="gm-vivo"><div><small>${esc(tr(GM_FASE_TXT[v.fase] || v.fase))}${v.juego ? ` · ${esc(v.juego)}` : ''}</small><b>${v.fps ?? '—'}<em> FPS</em></b>
          <small>${v.restante != null ? tr('quedan {s} s', { s: v.restante }) : ''}${v.antes ? ` · ${tr('antes')}: ${v.antes.fps} FPS` : ''}</small></div>
          <div class="rejilla k">${GM_sens(v.sensores)}</div><button class="btn mini" id="gmCancelar">${ic('parar')}${tr('Cancelar')}</button></div>` : '';
      const err = !corre && v.fase === 'error' ? `<p class="gm-error">${ic('info')} ${esc(v.error || '')}</p>` : '';
      box.innerHTML = `${cab}${viv}${err}
        ${corre ? '' : `<div class="gm-medir">
          <label class="gm-campo"><small>${tr('Juego (proceso, opcional)')}</small><input id="gmRendJuego" placeholder="${esc(v.ultimaPantalla || tr('p. ej. eurotrucks2.exe'))}" value="${esc(this.juego || '')}"></label>
          <label class="gm-campo"><small>${tr('Segundos por medición')}</small><select id="gmSeg">${[30, 60, 120].map(s => `<option${s === (this.seg || 60) ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
          <button class="btn" id="gmMedir" ${pm.instalado ? '' : 'disabled'}>${ic('latido')}${tr('Medir ahora')}</button>
          <button class="btn pri" id="gmBench" ${pm.instalado ? '' : 'disabled'}>${ic('grafica')}${tr('Antes/después')}</button></div>
          <p class="tenue" style="margin:6px 0 0">${tr('Antes/después: mide con el Modo Gamer apagado, lo activa y vuelve a medir el mismo tiempo. Juega igual en las dos (misma zona, misma acción).')}</p>
          <div class="gm-fila" style="margin-top:10px"><label class="gm-fila"><input type="checkbox" id="gmAdmin" ${R.config?.presentmonAdmin ? 'checked' : ''}>${tr('Medir como administrador (Windows pedirá permiso)')}</label>
            <label class="gm-fila"><input type="checkbox" id="gmAuto" ${R.config?.auto ? 'checked' : ''}>${tr('Activar solo al jugar a pantalla completa')}</label>
            <button class="btn mini" id="gmSens">${ic('cpu')}${tr('Leer sensores')}</button></div><div id="gmSensBox"></div>`}
        <div class="seccion" style="margin-top:14px">${tr('Historial')}</div><div id="gmHist"></div>`;
      const j = $('#gmRendJuego', box); if (j) j.oninput = ev => { this.juego = ev.target.value.trim(); };
      const sg = $('#gmSeg', box); if (sg) sg.onchange = ev => { this.seg = +ev.target.value; };
    }
    this.pintarHist(R);
  },
  pintarHist(R) {
    const h = $('#gmHist', this.v); if (!h) return;
    const firma = JSON.stringify(R.historial.map(x => x.id)); if (h.dataset.f === firma) return; h.dataset.f = firma;
    h.innerHTML = R.historial.length ? `<div class="gm-lista">${R.historial.map(x => {
      const d = x.delta?.fps, signo = d > 0 ? '+' : '';
      return `<div class="gm-fila gm-hist"><small class="tenue">${GM_hora(x.fecha)}</small><b>${esc(String(x.juego || '').replace(/\.exe$/i, ''))}</b>
        ${x.tipo === 'bench' ? `<span>${x.antes} → <b>${x.fps}</b> FPS</span><span class="chip ${d > 0 ? 'ok' : ''}">${signo}${d} FPS (${signo}${x.delta.pct} %)</span>` : `<span><b>${x.fps}</b> FPS</span>`}
        <small class="tenue">1 % low ${x.low1}</small>${x.alertas?.length ? `<span class="chip mal" title="${esc(x.alertas.join('\n'))}">${tr('calor')}</span>` : ''}
        ${x.tipo === 'bench' ? `<button class="btn mini" data-gm-comp="${esc(x.id)}">${ic('enlace')}${tr('Compartir')}</button>` : ''}</div>`;
    }).join('')}</div>` : `<p class="tenue">${tr('Aún no has medido nada.')}</p>`;
  },
  async clicRend(e) {
    const t = id => e.target.closest(id);
    const cuerpo = () => ({ juego: this.juego || undefined, segundos: this.seg || 60 });
    if (t('#gmPmBajar')) {
      const b = t('#gmPmBajar'); b.disabled = true;
      try {
        const r = await api('GET', '/gamer/presentmon/release');
        const ok = await confirmar(tr('¿Descargar PresentMon {v}?', { v: r.version }), tr('Release oficial de GitHub ({a}, {t}). sha256 publicado: {s}. Se guarda en la carpeta de datos de APOLO y solo se ejecuta cuando mides.', { a: r.archivo, t: fmtB(r.bytes), s: r.sha256 || tr('no publicado') }));
        if (ok) { const d = await api('POST', '/gamer/presentmon/descargar', { confirmar: true }); aviso(tr('PresentMon {v} listo · sha256 {s}', { v: d.version, s: d.sha256.slice(0, 16) + '…' })); this.sucio = true; }
      } catch (er) { aviso(er.message, true); }
      b.disabled = false; this.rend(); return true;
    }
    if (t('#gmMedir') || t('#gmBench')) {
      const bench = !!t('#gmBench');
      try { await api('POST', bench ? '/gamer/bench' : '/gamer/medir', cuerpo()); aviso(tr(bench ? 'Midiendo SIN Modo Gamer… sigue jugando' : 'Midiendo… sigue jugando')); }
      catch (er) { aviso(er.message, true); }
      this.sucio = true; this.rend(); return true;
    }
    if (t('#gmCancelar')) { try { await api('POST', '/gamer/cancelar', {}); } catch (er) { aviso(er.message, true); } this.sucio = true; this.rend(); return true; }
    if (t('#gmAdmin') || t('#gmAuto')) {
      const el = e.target;
      try { await api('PATCH', '/gamer/config', el.id === 'gmAuto' ? { auto: el.checked } : { presentmonAdmin: el.checked }); aviso(tr('Guardado')); } catch (er) { aviso(er.message, true); }
      return true;
    }
    if (t('#gmSens')) {
      const box = $('#gmSensBox', this.v); box.innerHTML = `<p class="tenue">${tr('Analizando…')}</p>`;
      try { const s = await api('GET', '/gamer/sensores'); box.innerHTML = `<div class="rejilla k" style="margin-top:10px">${GM_sens(s)}</div><p class="tenue">${tr('Temperatura de CPU: zona térmica ACPI (aproximada). La real por núcleo la da LibreHardwareMonitor, que necesita administrador.')}</p>`; }
      catch (er) { box.innerHTML = `<p class="tenue">${esc(er.message)}</p>`; }
      return true;
    }
    const c = t('[data-gm-comp]');
    if (c) {
      const txt = c.innerHTML; c.disabled = true; c.innerHTML = `${ic('recargar', 'gira')}${tr('Preparando…')}`;
      try {
        const r = await fetch(`/v1/gamer/bench/${encodeURIComponent(c.dataset.gmComp)}/png`, { method: 'POST', headers: { 'x-robot-token': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ idioma: I18N.idioma() }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        const blob = await r.blob(), f = new File([blob], `apolo-gamer-${c.dataset.gmComp}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: 'APOLO · Modo Gamer', text: tr('APOLO me subió los FPS y aquí está la prueba (medido con PresentMon)') });
        else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = f.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30_000); aviso(tr('Imagen descargada: súbela donde quieras')); }
      } catch (er) { if (er.name !== 'AbortError') aviso(er.message, true); }
      c.disabled = false; c.innerHTML = txt; return true;
    }
    return false;
  },
  async clic(e) {
    if (await this.clicRend(e)) return;
    const s = e.target.closest('[data-sw="gamer"]');
    if (s && !this.ocupado) {
      const on = s.getAttribute('aria-checked') !== 'true';
      this.ocupado = true; s.disabled = true; aviso(tr(on ? 'Activando…' : 'Restaurando…'));
      try { await api('POST', on ? '/gamer/activar' : '/gamer/desactivar', on ? { juego: this.juego || undefined } : {}); }
      catch (er) { aviso(er.message, true); }
      this.ocupado = false; return this.cargar(false);
    }
    if (e.target.closest('#gmRev')) { $('#gmRevision', this.v).innerHTML = `<p class="tenue">${tr('Analizando…')}</p>`; this.cargar(true); this.limpieza(); return; }
    if (e.target.closest('#gmGuardar')) {
      const cerrar = $('#gmCerrar', this.v).value.split(',').map(x => x.trim()).filter(Boolean);
      try { await api('PATCH', '/gamer/config', { cerrar, modo: $('#gmModo', this.v).value }); aviso(tr('Guardado')); $('#gmCerrar', this.v).blur(); this.cargar(false); }
      catch (er) { aviso(er.message, true); }
      return;
    }
    if (e.target.closest('#gmLimpiar')) {
      const ids = [...this.v.querySelectorAll('.gmZ:checked')].map(x => x.value); if (!ids.length) return;
      const el = this.zonas.filter(z => ids.includes(z.id));
      const ok = await confirmar(tr('¿Limpiar?'), tr('Se borrará el contenido de: {z}. Total aprox. {t}.', { z: el.map(z => tr(z.nombre)).join(', '), t: fmtB(el.reduce((n, z) => n + z.bytes, 0)) }), true);
      if (!ok) return;
      const b = $('#gmLimpiar', this.v); b.disabled = true;
      try { const r = await api('POST', '/gamer/limpieza', { ids }); aviso(tr('Liberados {t} ({n} archivos; {s} en uso saltados)', { t: fmtB(r.liberados), n: r.borrados, s: r.saltados })); }
      catch (er) { aviso(er.message, true); }
      this.limpieza();
    }
  },
};
