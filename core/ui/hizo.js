// Mission Control · "Lo que hizo" (FASE 3): línea de tiempo de capturas + acción de cada vez que el robot usó tus manos,
// exportar time-lapse vertical MP4 (marca de agua APOLO) y "Enseñar con el ejemplo" (grabar demostración → skill borrador).
// Datos: GET /v1/capturas, /v1/capturas/:sesion, POST /v1/capturas/:sesion/video · GET/POST /v1/demo, /v1/demo/grabar|parar
// Eventos del SSE: 'demo' (estado de la grabación) y 'resultado' de herramientas de control (refresca la lista).
// Globales con prefijo LH_ (los ui/*.js comparten ámbito).

Object.assign(I18N.dic.en, {
  'Lo que hizo': 'What it did', 'Enseñar con el ejemplo': 'Teach by example',
  'Pulsa Grabar, haz la tarea una vez a tu ritmo y pulsa Parar: APOLO la convierte en una skill borrador (desactivada) con pasos por nombre de elemento. Nunca guarda lo que escribes en campos de contraseña ni en ventanas protegidas.':
    'Press Record, do the task once at your own pace and press Stop: APOLO turns it into a draft skill (disabled) with steps by element name. It never stores what you type in password fields or protected windows.',
  'Grabar': 'Record', 'Parar': 'Stop', 'GRABANDO': 'RECORDING', 'eventos': 'events', 'Nombre de la tarea (opcional)': 'Task name (optional)',
  '¿Grabar tu ratón y teclado hasta que pulses Parar (o Ctrl+Alt+Esc)? Se verá un borde rojo mientras graba.': 'Record your mouse and keyboard until you press Stop (or Ctrl+Alt+Esc)? A red border is shown while recording.',
  'Skill borrador creada: {x}': 'Draft skill created: {x}', 'Demostraciones': 'Demonstrations', '{n} pasos': '{n} steps', 'Revisar skill': 'Review skill',
  'Capturas y acciones de cada vez que APOLO usó tu ratón y teclado (se borran a las 24 h). Las ventanas protegidas nunca se guardan.':
    "Screenshots and actions from each time APOLO used your mouse and keyboard (deleted after 24 h). Protected windows are never stored.",
  'Todavía no hay nada. Cuando APOLO use ver_pantalla o tus manos, aquí verás cada paso con su captura.': 'Nothing yet. When APOLO uses ver_pantalla or your hands, each step shows up here with its screenshot.',
  'Exportar time-lapse': 'Export time-lapse', 'Generando vídeo…': 'Rendering video…', 'Descargar MP4': 'Download MP4', 'Miró la pantalla': 'Looked at the screen',
  'no cambió nada': 'nothing changed', 'acciones': 'actions', 'capturas': 'screenshots', 'Borrar': 'Delete', 'Paso {a} de {b}': 'Step {a} of {b}', 'sin captura': 'no screenshot',
});

const LH_css = document.createElement('style');
LH_css.textContent = `
.lh-demo{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.lh-demo input{flex:1;min-width:180px}
.lh-rec{display:inline-flex;align-items:center;gap:8px;color:#ff5d5d;font-weight:650}
.lh-rec i{width:10px;height:10px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 0 rgba(255,59,48,.6);animation:lhLat 1.4s infinite}
@keyframes lhLat{70%{box-shadow:0 0 0 9px rgba(255,59,48,0)}100%{box-shadow:0 0 0 0 rgba(255,59,48,0)}}
.lh-cuerpo{display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start}
@media (max-width:860px){.lh-cuerpo{grid-template-columns:1fr}}
.lh-ses{display:flex;flex-direction:column;gap:6px}
.lh-ses button{all:unset;cursor:pointer;padding:10px 12px;border-radius:var(--radio);border:1px solid var(--borde);background:var(--capa);display:block}
.lh-ses button.on{border-color:var(--acento,#34e07f)}
.lh-ses b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lh-ses small{color:var(--txt-3);font-size:11.5px}
.lh-visor{background:var(--capa);border:1px solid var(--borde);border-radius:var(--radio);overflow:hidden}
.lh-foto{position:relative;background:#000;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center}
.lh-foto img{max-width:100%;max-height:100%;object-fit:contain}
.lh-foto .tenue{color:#889}
.lh-info{padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.lh-info b{font-size:15px}
.lh-info .mal{color:#ffb23d}
.lh-ctrl{display:flex;gap:8px;align-items:center;padding:0 14px 12px;flex-wrap:wrap}
.lh-tira{display:flex;gap:6px;overflow-x:auto;padding:10px 14px;border-top:1px solid var(--borde)}
.lh-tira button{all:unset;cursor:pointer;flex:0 0 96px;height:54px;border-radius:6px;overflow:hidden;border:2px solid transparent;background:#111;position:relative}
.lh-tira button.on{border-color:var(--acento,#34e07f)}
.lh-tira button.nada{box-shadow:inset 0 -3px 0 #ffb23d}
.lh-tira img{width:100%;height:100%;object-fit:cover}
.lh-tira span{position:absolute;left:3px;top:2px;font-size:10px;background:rgba(0,0,0,.6);color:#fff;padding:0 4px;border-radius:3px}
`;
document.head.appendChild(LH_css);

const LH_icono = { ver: 'ojo', clic: 'llaveinglesa', escribir: 'teclas', tecla: 'teclas', scroll: 'abajo', arrastrar: 'der', mover: 'der' };

VISTAS.hizo = {
  sesiones: [], actual: null, entradas: [], i: 0, fotos: new Map(), demo: { grabando: false }, t: null, juego: null, cola: null,
  async pintar(v) {
    this.v = v;
    $$('.lado-nav a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === 'agentes'));   // es parte de Mission Control
    v.innerHTML = `<div class="pagina lh">${cabecera('Mission Control', 'Quién está haciendo qué ahora mismo: conversaciones, tareas y los subagentes que lanzan. En vivo.')}
      ${typeof CJ_pestanas === 'function' ? CJ_pestanas('hizo') : ''}
      <div class="tarjeta"><div class="cuerpo"><div class="seccion" style="margin-top:0">${ic('robot')}${tr('Enseñar con el ejemplo')}</div>
        <p class="tenue">${tr('Pulsa Grabar, haz la tarea una vez a tu ritmo y pulsa Parar: APOLO la convierte en una skill borrador (desactivada) con pasos por nombre de elemento. Nunca guarda lo que escribes en campos de contraseña ni en ventanas protegidas.')}</p>
        <div class="lh-demo" id="lhDemo"></div><div id="lhDemos"></div></div></div>
      <div class="seccion">${tr('Lo que hizo')}</div>
      <p class="tenue">${tr('Capturas y acciones de cada vez que APOLO usó tu ratón y teclado (se borran a las 24 h). Las ventanas protegidas nunca se guardan.')}</p>
      <div id="lhCuerpo"></div></div>`;
    v.onclick = e => this.clic(e);
    await Promise.all([this.cargarDemo(), this.cargarLista()]);
    clearInterval(this.t); this.t = setInterval(() => this.reloj(), 1000);
  },
  salir() {
    clearInterval(this.t); clearInterval(this.juego); clearTimeout(this.cola); this.v = null;
    for (const u of this.fotos.values()) URL.revokeObjectURL(u); this.fotos.clear();
  },
  alEvento(e) {
    if (e.tipo === 'demo') { this.cargarDemo(); return; }
    if (e.tipo === 'resultado' && /^(ver_pantalla|clic|escribir|tecla|scroll|arrastrar)$/.test(e.nombre || '') && !this.cola)
      this.cola = setTimeout(() => { this.cola = null; this.cargarLista(true); }, 800);
  },

  // ---------- grabar demostración ----------
  async cargarDemo() {
    try { this.demo = await api('GET', '/demo'); } catch { this.demo = { grabando: false, demos: [] }; }
    this.pintarDemo();
  },
  pintarDemo() {
    if (!this.v || !$('#lhDemo')) return;
    const d = this.demo;
    $('#lhDemo').innerHTML = d.grabando
      ? `<span class="lh-rec"><i></i>${tr('GRABANDO')}${d.nombre ? ` · ${esc(d.nombre)}` : ''}</span><span class="tenue" id="lhCrono"></span>
         <span class="tenue">${d.eventos || 0} ${tr('eventos')}</span><button class="btn mal" data-lh="parar">${ic('parar')}${tr('Parar')}</button>`
      : `<input id="lhNombre" placeholder="${esc(tr('Nombre de la tarea (opcional)'))}"><button class="btn pri" data-lh="grabar">${ic('play')}${tr('Grabar')}</button>`;
    const l = (d.demos || []).slice(0, 5);
    $('#lhDemos').innerHTML = l.length ? `<div class="seccion">${tr('Demostraciones')}</div>` + l.map(x => `<div class="flex" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--borde)">
        <span><b>${esc(x.skill?.nombre || x.nombre || x.id)}</b> <small class="tenue">· ${tr('{n} pasos', { n: x.pasos })} · ${hace(x.fin)}</small>${x.errorSkill ? ` <small class="tenue">· ${esc(x.errorSkill)}</small>` : ''}</span>
        ${x.skill ? `<a class="btn mini fantasma" href="#/skills">${tr('Revisar skill')} ${ic('der')}</a>` : ''}</div>`).join('') : '';
    this.reloj();
  },
  reloj() {
    const c = $('#lhCrono'); if (!c || !this.demo.grabando) return;
    c.textContent = cronoTxt(Date.now() - this.demo.inicio);
  },

  // ---------- lista de sesiones y visor ----------
  async cargarLista(suave) {
    const r = await api('GET', '/capturas').catch(() => ({ sesiones: [] }));
    this.sesiones = r.sesiones;
    if (!this.actual || !this.sesiones.some(s => s.sesion === this.actual)) this.actual = this.sesiones[0]?.sesion || null;
    if (this.actual) await this.cargarSesion(this.actual, suave); else this.pintarCuerpo();
  },
  async cargarSesion(id, suave) {
    const r = await api('GET', `/capturas/${encodeURIComponent(id)}`).catch(() => ({ entradas: [] }));
    const seguir = suave && this.actual === id && this.i >= this.entradas.length - 1;
    this.actual = id; this.entradas = r.entradas || []; this.video = r.video;
    if (!suave || seguir || this.i >= this.entradas.length) this.i = Math.max(0, this.entradas.length - 1);
    this.pintarCuerpo();
  },
  async foto(nombre) {
    const k = `${this.actual}/${nombre}`;
    if (!this.fotos.has(k)) {
      const r = await fetch(`/v1/capturas/${encodeURIComponent(this.actual)}/${nombre}`, { headers: { 'x-robot-token': TOKEN } });
      if (!r.ok) return null;
      this.fotos.set(k, URL.createObjectURL(await r.blob()));
    }
    return this.fotos.get(k);
  },
  pintarCuerpo() {
    if (!this.v || !$('#lhCuerpo')) return;
    if (!this.sesiones.length) { $('#lhCuerpo').innerHTML = vacio('monitor', 'Todavía no hay nada. Cuando APOLO use ver_pantalla o tus manos, aquí verás cada paso con su captura.'); return; }
    $('#lhCuerpo').innerHTML = `<div class="lh-cuerpo"><div class="lh-ses">${this.sesiones.map(s => `<button data-lhs="${esc(s.sesion)}" class="${s.sesion === this.actual ? 'on' : ''}">
        <b>${esc(s.titulo || s.sesion.slice(0, 8))}</b><small>${s.acciones} ${tr('acciones')} · ${s.capturas} ${tr('capturas')} · ${hace(s.fin)}</small></button>`).join('')}</div>
      <div class="lh-visor"><div class="lh-foto" id="lhFoto"></div><div class="lh-info" id="lhInfo"></div>
        <div class="lh-ctrl"><button class="btn mini" data-lh="ant">${ic('izq')}</button><button class="btn mini" data-lh="play">${ic(this.juego ? 'pausa' : 'play')}</button><button class="btn mini" data-lh="sig">${ic('der')}</button>
          <span class="tenue" id="lhPaso"></span><span style="flex:1"></span>
          <span id="lhVideo">${this.video ? this.botonDescarga() : ''}</span>
          <button class="btn mini pri" data-lh="video">${ic('rayo')}${tr('Exportar time-lapse')}</button>
          <button class="btn mini fantasma" data-lh="borrar">${ic('basura')}</button></div>
        <div class="lh-tira" id="lhTira"></div></div></div>`;
    this.pintarTira(); this.verPaso();
  },
  async pintarTira() {
    const t = $('#lhTira'); if (!t) return;
    t.innerHTML = this.entradas.map((e, i) => `<button data-lhi="${i}" class="${i === this.i ? 'on' : ''} ${e.nada ? 'nada' : ''}" title="${esc(e.accion || '')}"><span>${i + 1}</span>${e.imagen ? '' : `<small class="tenue" style="display:block;padding:20px 4px;font-size:10px">${tr('sin captura')}</small>`}</button>`).join('');
    const sesion = this.actual;
    for (const [i, e] of this.entradas.entries()) {
      if (!e.imagen) continue;
      const u = await this.foto(e.imagen); if (sesion !== this.actual || !u) return;
      const b = t.querySelector(`[data-lhi="${i}"]`); if (b && !b.querySelector('img')) b.insertAdjacentHTML('beforeend', `<img src="${u}" alt="">`);
    }
  },
  async verPaso() {
    const e = this.entradas[this.i]; if (!e) return;
    $$('#lhTira [data-lhi]').forEach(b => b.classList.toggle('on', +b.dataset.lhi === this.i));
    const tira = $('#lhTira'), on = $('#lhTira [data-lhi].on');      // solo la tira (scrollIntoView movía toda la página)
    if (tira && on) tira.scrollLeft = on.offsetLeft - tira.offsetLeft - tira.clientWidth / 2 + on.clientWidth / 2;
    $('#lhPaso').textContent = tr('Paso {a} de {b}', { a: this.i + 1, b: this.entradas.length });
    $('#lhInfo').innerHTML = `<b>${ic(LH_icono[e.op] || (e.tipo === 'ver' ? 'ojo' : 'llaveinglesa'))} ${esc(e.tipo === 'ver' ? tr('Miró la pantalla') : e.accion || e.op || '')}</b>
      ${e.cambio || e.nada ? `<span class="${e.nada ? 'mal' : 'tenue'}">${esc(e.nada ? '⚠ ' + tr('no cambió nada') : e.cambio)}</span>` : ''}
      <small class="tenue">${esc(e.ventana || '')} · ${new Date(e.t).toLocaleTimeString()}</small>`;
    const u = e.imagen ? await this.foto(e.imagen) : null;
    if (this.entradas[this.i] !== e || !$('#lhFoto')) return;
    $('#lhFoto').innerHTML = u ? `<img src="${u}" alt="">` : `<span class="tenue">${tr('sin captura')}</span>`;
  },
  botonDescarga() { return `<button class="btn mini" data-lh="descargar">${ic('abajo')}${tr('Descargar MP4')}</button>`; },
  async descargar() {
    const r = await fetch(`/v1/capturas/${encodeURIComponent(this.actual)}/video.mp4`, { headers: { 'x-robot-token': TOKEN } });
    if (!r.ok) return aviso(`HTTP ${r.status}`, true);
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `apolo-timelapse-${this.actual.slice(0, 8)}.mp4`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  },

  async clic(e) {
    const s = e.target.closest('[data-lhs]'); if (s) { clearInterval(this.juego); this.juego = null; return this.cargarSesion(s.dataset.lhs); }
    const t = e.target.closest('[data-lhi]'); if (t) { this.i = +t.dataset.lhi; return this.verPaso(); }
    const b = e.target.closest('[data-lh]'); if (!b) return;
    const q = b.dataset.lh;
    if (q === 'ant' || q === 'sig') { this.i = Math.max(0, Math.min(this.entradas.length - 1, this.i + (q === 'sig' ? 1 : -1))); return this.verPaso(); }
    if (q === 'play') {
      if (this.juego) { clearInterval(this.juego); this.juego = null; b.innerHTML = ic('play'); return; }
      if (this.i >= this.entradas.length - 1) this.i = 0;
      b.innerHTML = ic('pausa'); this.verPaso();
      this.juego = setInterval(() => { if (this.i >= this.entradas.length - 1) { clearInterval(this.juego); this.juego = null; b.innerHTML = ic('play'); return; } this.i++; this.verPaso(); }, 1200);
      return;
    }
    if (q === 'descargar') return this.descargar();
    if (q === 'borrar') {
      if (!confirm(tr('Borrar') + '?')) return;
      await api('DELETE', `/capturas/${encodeURIComponent(this.actual)}`).catch(er => aviso(er.message, true));
      this.actual = null; return this.cargarLista();
    }
    if (q === 'video') {
      b.disabled = true; const txt = b.innerHTML; b.innerHTML = `${ic('reloj')}${tr('Generando vídeo…')}`;
      try {
        const r = await api('POST', `/capturas/${encodeURIComponent(this.actual)}/video`, {});
        if (r.ok) { $('#lhVideo').innerHTML = this.botonDescarga(); this.descargar(); } else aviso(r.motivo || 'error', true);
      } catch (er) { aviso(er.message, true); }
      b.disabled = false; b.innerHTML = txt; return;
    }
    if (q === 'grabar') {
      if (!confirm(tr('¿Grabar tu ratón y teclado hasta que pulses Parar (o Ctrl+Alt+Esc)? Se verá un borde rojo mientras graba.'))) return;
      b.disabled = true;
      try { this.demo = { ...this.demo, ...(await api('POST', '/demo/grabar', { confirmo: true, nombre: $('#lhNombre')?.value || '' })) }; } catch (er) { aviso(er.message, true); }
      return this.pintarDemo();
    }
    if (q === 'parar') {
      b.disabled = true;
      try { const r = await api('POST', '/demo/parar', {}); aviso(r.skill ? tr('Skill borrador creada: {x}', { x: r.skill.slug }) : (r.errorSkill || tr('Parar')), !r.skill); }
      catch (er) { aviso(er.message, true); }
      return this.cargarDemo();
    }
  },
};
