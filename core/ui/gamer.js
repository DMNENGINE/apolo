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
  'Medir FPS antes/después (PresentMon) llega en la fase 2.': 'Measuring FPS before/after (PresentMon) comes in phase 2.', 'Activando…': 'Turning on…', 'Restaurando…': 'Restoring…',
});

const GM_EST = { hecho: 'ok', deshecho: '', pendiente: 'aviso', error: 'mal', 'no deshecho': 'mal' };
const GM_hora = s => (s ? new Date(s).toLocaleString(I18N.idioma() === 'en' ? 'en' : 'es', { dateStyle: 'short', timeStyle: 'short' }) : '');
const GM_cambios = cs => (cs?.length ? `<div class="gm-lista">${cs.map(c => `<div class="gm-fila"><span class="chip ${GM_EST[c.estado] || ''}">${esc(tr(c.estado))}</span><b>${esc(tr(c.titulo || c.tipo))}</b><small class="tenue">${esc(c.detalle || '')}${c.error ? ` · ${esc(c.error)}` : ''}</small></div>`).join('')}</div>`
  : `<p class="tenue">${tr('Sin cambios: ya estaba todo bien.')}</p>`);

VISTAS.gamer = {
  claves: 'gamer juego juegos fps rendimiento energia energía hz monitor hags limpieza cache caché shaders inicio',
  salir() { clearInterval(this.t); this.t = null; },
  async pintar(v) {
    this.salir(); this.v = v;
    v.innerHTML = `<div class="pagina">${cabecera('Modo Gamer', 'Solo optimizaciones reales y reversibles: todo se deshace al apagarlo, aunque APOLO se cierre a medias.', `<button class="btn" id="gmRev">${ic('recargar')}${tr('Revisar de nuevo')}</button>`)}
      <div id="gmEstado" class="caja pad"><p class="tenue">${tr('Analizando…')}</p></div>
      <div class="seccion">${tr('Revisión del PC')}</div><div id="gmRevision"><p class="tenue">${tr('Analizando…')}</p></div>
      <div class="seccion">${tr('Limpieza')}</div><div id="gmLimpieza" class="caja pad"><p class="tenue">${tr('Analizando…')}</p></div>
      <p class="tenue" style="margin-top:14px">${tr('Medir FPS antes/después (PresentMon) llega en la fase 2.')}</p></div>`;
    v.onclick = e => this.clic(e);
    await this.cargar(true);
    this.limpieza();
    this.t = setInterval(() => this.cargar(false), 5000);
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
  async clic(e) {
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
