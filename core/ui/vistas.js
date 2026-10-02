// Robot Companion · panel — vistas de la app: Inicio, Chat, Automatizaciones, Memoria, Uso.
'use strict';

// ================= INICIO =================
VISTAS.inicio = {
  async pintar(v) {
    const [sis, canales, tareas, regs, uso, mem] = await Promise.all([
      api('GET', '/sistema'), api('GET', '/canales'), api('GET', '/tareas'), api('GET', '/registros'), api('GET', '/uso?dias=14'), api('GET', '/memoria')]);
    const h = new Date().getHours(), saludo = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    const hoy = new Date().toISOString().slice(0, 10);
    const tokHoy = (uso.porDia[hoy]?.entrada || 0) + (uso.porDia[hoy]?.salida || 0);
    const sesHoy = E.sesiones.filter(s => grupoFecha(s.actualizada) === 'Hoy').length;
    const activas = tareas.filter(t => t.activa).sort((a, b) => a.proxima - b.proxima);
    const dias = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); dias.push([d, (uso.porDia[d]?.entrada || 0) + (uso.porDia[d]?.salida || 0)]); }
    const max = Math.max(1, ...dias.map(d => d[1]));
    const estadoTxt = E.pendientes.size ? `Tienes <b class="aviso-txt">${E.pendientes.size} permiso${E.pendientes.size > 1 ? 's' : ''}</b> esperando.` : E.trabajando.size ? `Estoy trabajando en ${E.trabajando.size} conversación${E.trabajando.size > 1 ? 'es' : ''}.` : 'Todo en calma. ¿Qué hacemos?';
    v.innerHTML = `<div class="pagina">
      <div class="saludo"><div class="robot-inicio" id="robotInicio" title="Tócame">${casco('casco-grande' + (E.pendientes.size ? ' permiso' : E.trabajando.size ? ' trabajando' : ''))}</div>
        <div class="crece"><h1>${saludo}</h1><p>${estadoTxt}</p></div>
        <a class="btn pri" href="#/chat">${ic('editar')}Nueva conversación</a></div>
      <div class="rejilla k">
        <div class="kpi"><small>${ic('chispa')}Modelo por defecto</small><b style="font-size:16px;margin-top:8px" class="flex">${avatar(E.config.modeloPorDefecto)}${esc(nombreModelo(E.config.modeloPorDefecto))}</b></div>
        <div class="kpi"><small>${ic('chat')}Conversaciones hoy</small><b>${sesHoy}</b><span>${E.sesiones.length} en total</span></div>
        <div class="kpi"><small>${ic('rayo')}Tokens hoy</small><b>${fmtK(tokHoy)}</b><span>${fmtK(Object.values(uso.porDia).reduce((n, d) => n + d.entrada + d.salida, 0))} en 14 días</span></div>
        <div class="kpi"><small>${ic('reloj')}Automatizaciones</small><b>${activas.length}</b><span>${tareas.length - activas.length} pausadas o hechas</span></div>
        <div class="kpi"><small>${ic('cerebro')}Recuerdos</small><b>${mem.length}</b><span>${mem.filter(m => m.tipo === 'perfil').length} de perfil</span></div>
      </div>
      <div class="rejilla" style="margin-top:12px">
        <section class="tarjeta"><header>${ic('monitor')}<span class="crece">Equipo</span><span class="chip ok"><span class="punto ok"></span>${esc(sis.host)}</span></header><div class="cuerpo" id="equipo"></div></section>
        <section class="tarjeta"><header>${ic('enchufe')}<span class="crece">Canales</span><a class="btn fantasma mini" href="#/ajustes/canales">Ver</a></header><div class="cuerpo lista-mini">
          ${canales.map(c => `<div>${ic(ICONO_CANAL[c.tipo] || 'enlace')}<span class="t">${esc(c.nombre)}<br><small class="tenue">${esc(c.detalle || '')}</small></span><span class="punto ${c.estado === 'activo' ? 'ok' : c.estado === 'respaldo' ? 'aviso' : ''}"></span></div>`).join('')}</div></section>
        <section class="tarjeta"><header>${ic('reloj')}<span class="crece">Próximas automatizaciones</span><a class="btn fantasma mini" href="#/auto">Todas</a></header><div class="cuerpo lista-mini">
          ${activas.slice(0, 6).map(t => `<div>${ic(t.accion.tipo === 'aviso' ? 'campana' : 'robot')}<span class="t">${esc(t.nombre)}</span><span class="tenue" style="font-size:12px">${hace(t.proxima)}</span></div>`).join('') || vacio('reloj', 'Nada programado. Pídele al robot “recuérdame…”.')}</div></section>
        <section class="tarjeta"><header>${ic('grafica')}<span class="crece">Uso · 14 días</span><a class="btn fantasma mini" href="#/uso">Detalle</a></header><div class="cuerpo">
          <div class="barras mini" style="height:90px">${dias.map(([d, n]) => `<div style="height:${n / max * 100}%" title="${d}: ${n.toLocaleString('es')} tokens"></div>`).join('')}</div>
          <div class="eje"><span>${dias[0][0].slice(5)}</span><span>hoy</span></div></div></section>
        <section class="tarjeta"><header>${ic('chat')}<span class="crece">Conversaciones recientes</span></header><div class="cuerpo lista-mini">
          ${E.sesiones.slice(0, 6).map(s => `<div>${avatar(s.modelo)}<a class="t" href="#/chat/${esc(s.id)}" style="color:var(--txt)">${esc(s.titulo)}</a><span class="tenue" style="font-size:12px">${hace(s.actualizada)}</span></div>`).join('') || vacio('chat', 'Aún no hay conversaciones.')}</div></section>
        <section class="tarjeta"><header>${ic('latido')}<span class="crece">Actividad en vivo</span><a class="btn fantasma mini" href="#/ajustes/registros">Registros</a></header><div class="cuerpo lista-mini" id="actividad"></div></section>
      </div></div>`;
    this.regs = regs.slice(-8).reverse();
    this.pintarActividad();
    const equipo = async () => {
      try {
        const s = await api('GET', '/sistema'); const el = $('#equipo'); if (!el) return;
        const m = 1 - s.memoria.libre / s.memoria.total, d = s.disco ? 1 - s.disco.libre / s.disco.total : 0;
        const barra = (t, p, det) => `<div style="margin-bottom:12px"><div class="flex"><span class="crece">${t}</span><b>${Math.round(p * 100)}%</b></div><div class="medidor ${p > .9 ? 'mal' : p > .75 ? 'aviso' : ''}"><i style="width:${p * 100}%"></i></div><small class="tenue">${det}</small></div>`;
        el.innerHTML = barra('CPU', s.cpu.uso, `${s.cpu.nucleos} núcleos · ${esc(s.cpu.modelo)}`) + barra('Memoria', m, `${fmtB(s.memoria.total - s.memoria.libre)} de ${fmtB(s.memoria.total)}`) +
          (s.disco ? barra(`Disco ${esc(s.disco.ruta)}`, d, `${fmtB(s.disco.libre)} libres de ${fmtB(s.disco.total)}`) : '') + `<small class="tenue">Encendido ${duracion(s.encendidoSeg)} · núcleo ${duracion(s.nucleoSeg)}</small>`;
      } catch { }
    };
    equipo(); this.t = setInterval(equipo, 4000);
    montarRobot($('#robotInicio'), 'vitrina', 60);
  },
  pintarActividad() {
    const el = $('#actividad'); if (!el) return;
    el.innerHTML = this.regs.map(l => `<div><span class="punto ${l.nivel === 'error' ? 'mal' : l.nivel === 'aviso' ? 'aviso' : 'ok'}"></span><span class="t" title="${esc(l.texto)}">${esc(l.texto)}</span><span class="tenue" style="font-size:11.5px">${hora(l.t)}</span></div>`).join('') || vacio('latido', 'Sin actividad todavía.');
  },
  alEvento(e) { if (e.tipo === 'registro') { this.regs.unshift(e); this.regs = this.regs.slice(0, 8); this.pintarActividad(); } },
  salir() { clearInterval(this.t); desmontarRobot($('#robotInicio')); },
};
const ICONO_CANAL = { web: 'mundo', api: 'api', isla: 'isla', discord: 'discord', voz: 'micro', streamdeck: 'teclas', claudecode: 'terminal', telegram: 'enviar', whatsapp: 'enviar' };

// ================= CHAT =================
VISTAS.chat = {
  sesion: null, modelo: null, cwd: null, enviando: false, ctl: null,
  async pintar(v, id) {
    desmontarRobot($('#robotChat'));
    this.sesion = id ? await api('GET', `/sesiones/${id}`).catch(() => null) : null;
    if (id && !this.sesion) { aviso('Esa conversación ya no existe', true); location.hash = '#/chat'; return; }
    const s = this.sesion;
    this.modelo = s ? s.modelo : (this.modelo || E.config.modeloPorDefecto);
    this.cwd = s ? s.cwd : (this.cwd || E.config.carpeta || '');
    const insp = leerLocal('inspector', true) && s;
    v.innerHTML = `<div class="chat"><div class="chat-principal">
      <div class="chat-cab"><span class="solo-movil" style="width:30px"></span>
        ${s ? avatar(s.modelo) : ''}<div class="titulo" id="titulo">${s ? esc(s.titulo) : 'Nueva conversación'} ${s ? `<span class="ruta">· ${esc(s.cwd)}</span>` : ''}</div>
        ${s ? `<button class="btn fantasma icono" id="renombrar" title="Renombrar">${ic('editar')}</button><button class="btn fantasma icono" id="borrar" title="Borrar">${ic('basura')}</button>
        <button class="btn fantasma icono" id="togInsp" title="Detalles">${ic('panel')}</button>` : ''}</div>
      <div class="hilo" id="hilo"><div class="hilo-int" id="msgs"></div></div>
      <div class="compositor-zona"><form class="compositor" id="comp">
        <textarea id="entrada" rows="1" placeholder="Escribe un mensaje…  (Enter envía · Shift+Enter nueva línea)"></textarea>
        <div class="barra"><button type="button" class="chip-btn" id="chipModelo">${avatar(this.modelo)}<span>${esc(nombreModelo(this.modelo))}</span>${ic('abajo')}</button>
          <button type="button" class="chip-btn" id="chipCarpeta" title="Carpeta de trabajo">${ic('carpeta')}<span>${esc(this.cwd ? this.cwd.split(/[\\/]/).filter(Boolean).pop() : 'carpeta por defecto')}</span></button>
          <button class="enviar" id="enviar" title="Enviar">${ic('enviar')}</button></div></form></div>
    </div>${insp ? '<aside class="inspector" id="insp"></aside>' : ''}</div>`;
    const entrada = $('#entrada');
    const ajustar = () => { entrada.style.height = 'auto'; entrada.style.height = Math.min(entrada.scrollHeight, 240) + 'px'; };
    entrada.oninput = ajustar;
    entrada.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#comp').requestSubmit(); } };
    $('#comp').onsubmit = e => { e.preventDefault(); this.ocupada() ? this.detener() : this.enviar(entrada.value); };
    $('#chipModelo').onclick = e => this.elegirModelo(e.currentTarget);
    $('#chipCarpeta').onclick = () => this.elegirCarpeta();
    if (s) {
      $('#renombrar').onclick = async () => {
        const t = await modal({ titulo: 'Renombrar conversación', cuerpo: `<input id="nt" style="width:100%" value="${esc(s.titulo)}">`, botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: m => $('#nt', m).value.trim() || false }] });
        if (t) { await api('PATCH', `/sesiones/${s.id}`, { titulo: t }); s.titulo = t; $('#titulo').firstChild.textContent = t + ' '; cargarSesiones(); }
      };
      $('#borrar').onclick = async () => { if (await confirmar('Borrar conversación', `“${s.titulo}” se borrará para siempre.`, true)) { await api('DELETE', `/sesiones/${s.id}`); cargarSesiones(); location.hash = '#/chat'; } };
      $('#togInsp').onclick = () => { guardarLocal('inspector', !leerLocal('inspector', true)); this.pintar(v, s.id); };
    }
    this.pintarMensajes();
    this.pintarInspector();
    this.estadoBoton();
    if (!s) entrada.focus();
  },
  ocupada() { return this.enviando || (this.sesion && E.trabajando.has(this.sesion.id)); },
  estadoBoton() {
    const b = $('#enviar'); if (!b) return;
    const o = this.ocupada();
    b.classList.toggle('parar', o); b.innerHTML = ic(o ? 'parar' : 'enviar'); b.title = o ? 'Detener' : 'Enviar';
  },
  pintarMensajes() {
    const m = $('#msgs'), s = this.sesion;
    if (!s) {
      m.innerHTML = `<div class="bienvenida"><div class="robot-bienvenida" id="robotChat" title="Tócame">${casco('casco-grande')}</div><h2>¿En qué te ayudo?</h2>
        <p>Hablas con <b>${esc(this.modelo)}</b>. Todos los modelos comparten memoria, herramientas y permisos.</p>
        <div class="sugerencias">${[
          ['carpeta', 'Revisa qué hay en mi carpeta de descargas y dime qué puedo borrar'],
          ['reloj', 'Recuérdame mañana a las 9 revisar los pedidos del taller'],
          ['cerebro', '¿Qué sabes de mí?'],
          ['latido', 'Cada 30 min comprueba si 10.0.0.5 responde y avísame solo si falla'],
        ].map(([i, t]) => `<button data-sug="${esc(t)}">${ic(i)}<span>${esc(t)}</span></button>`).join('')}</div></div>`;
      m.onclick = e => { const b = e.target.closest('[data-sug]'); if (b) this.enviar(b.dataset.sug); };
      montarRobot($('#robotChat'), 'vitrina', 60);
      return;
    }
    m.onclick = null; m.innerHTML = '';
    this.bloque = null;
    const resultados = Object.fromEntries(s.mensajes.filter(x => x.role === 'tool').map(x => [x.toolCallId, x.content]));
    let ultimoIA = null;
    for (const x of s.mensajes) {
      if (x.role === 'compactacion') { this.resumida(x.content, x.recuerdos); ultimoIA = null; }
      else if (x.role === 'user') { this.yo(x.content); ultimoIA = null; }
      else if (x.role === 'assistant') {
        if (x.content) this.texto(x.content, x.t);
        for (const c of x.toolCalls || []) this.paso(c.id, c.name, resumenArgs(c.args), resultados[c.id] ?? null);
        ultimoIA = x;
      }
    }
    if (ultimoIA && !E.trabajando.has(s.id)) this.pie({ entrada: s.uso.entrada, salida: s.uso.salida }, true);
    if (E.trabajando.has(s.id)) this.pensando(true);
    this.abajo(true);
  },
  bloqueIA() {
    if (this.bloque && this.bloque.isConnected) return this.bloque;
    const el = document.createElement('div'); el.className = 'm-ia';
    el.innerHTML = `${avatar(this.sesion?.modelo || this.modelo)}<div class="cont"><div class="quien"><b>${esc(nombreModelo(this.sesion?.modelo || this.modelo))}</b></div></div>`;
    this.antesDePensando(el); this.bloque = el; return el;
  },
  antesDePensando(el) { const p = $('#msgs .pensando'); p ? p.before(el) : $('#msgs').append(el); },
  // separador: lo de arriba ya no lo ve el modelo, solo su resumen (desplegable)
  resumida(resumen, recuerdos) {
    const el = document.createElement('details'); el.className = 'm-resumida';
    el.innerHTML = `<summary><span>${ic('cerebro')} Conversación resumida${recuerdos ? ` · ${recuerdos} recuerdo${recuerdos > 1 ? 's' : ''} a la memoria` : ''}</span></summary><div class="md"></div>`;
    $('.md', el).innerHTML = md(resumen || '');
    this.antesDePensando(el); this.bloque = null;
  },
  yo(t) { const el = document.createElement('div'); el.className = 'm-yo'; el.textContent = t; this.antesDePensando(el); this.bloque = null; },
  texto(t) { const c = $('.cont', this.bloqueIA()); const d = document.createElement('div'); d.className = 'md'; d.innerHTML = md(t); c.append(d); },
  paso(id, nombre, resumen, resultado) {
    let el = id && document.getElementById('p-' + id);
    if (!el) {
      const c = $('.cont', this.bloqueIA());
      let pasos = c.lastElementChild?.classList.contains('pasos') ? c.lastElementChild : null;
      if (!pasos) { pasos = document.createElement('div'); pasos.className = 'pasos'; c.append(pasos); }
      el = document.createElement('details'); el.className = 'paso corriendo'; if (id) el.id = 'p-' + id;
      el.innerHTML = `<summary>${ic(ICONO_HERR[nombre] || 'llaveinglesa')}<span class="n">${esc(NOMBRE_HERR[nombre] || nombre)}</span><span class="r">${esc(resumen)}</span><span class="e">${ic('reloj')}</span></summary><pre></pre>`;
      pasos.append(el);
    }
    if (resultado !== null && resultado !== undefined) {
      const fallo = /^(error|DENEGADO)/.test(resultado);
      el.className = 'paso ' + (fallo ? 'fallo' : 'ok');
      $('.e', el).innerHTML = ic(fallo ? 'x' : 'check');
      $('pre', el).textContent = resultado;
    }
  },
  pie(uso, final) {
    const c = this.bloque && $('.cont', this.bloque); if (!c || $('.pie-msg', c)) return;
    const texto = $$('.md', c).map(x => x.innerText).join('\n\n');
    const d = document.createElement('div'); d.className = 'pie-msg';
    d.innerHTML = `<span>${fmtK(uso.entrada)} ↑ · ${fmtK(uso.salida)} ↓ tokens${final ? ' (conversación)' : ''}</span><button class="btn fantasma mini" data-copiar="${esc(texto)}">${ic('copiar')}Copiar</button>`;
    c.append(d);
  },
  pensando(si) {
    let p = $('#msgs .pensando');
    if (si && !p) { p = document.createElement('div'); p.className = 'pensando'; p.innerHTML = `${avatar(this.sesion?.modelo || this.modelo)}<span class="puntos"><i></i><i></i><i></i></span><span>pensando…</span>`; $('#msgs').append(p); }
    if (!si && p) p.remove();
  },
  abajo(forzar) { const h = $('#hilo'); if (!h) return; if (forzar || h.scrollHeight - h.scrollTop - h.clientHeight < 140) h.scrollTop = h.scrollHeight; },
  evento(e) {
    if (!$('#msgs')) return;
    if (e.tipo === 'inicio') this.pensando(true);
    else if (e.tipo === 'texto') this.texto(e.texto);
    else if (e.tipo === 'herramienta') this.paso(e.id, e.nombre, e.resumen || resumenArgs(e.args), null);
    else if (e.tipo === 'resultado') this.paso(e.id, e.nombre, '', e.resultado);
    else if (e.tipo === 'compactacion') { this.recargar(); return; }
    else if (e.tipo === 'aviso') { const c = $('.cont', this.bloqueIA()); c.insertAdjacentHTML('beforeend', `<div class="md tenue">${esc(e.texto)}</div>`); }
    else if (e.tipo === 'error') { this.pensando(false); const c = $('.cont', this.bloqueIA()); c.insertAdjacentHTML('beforeend', `<div class="md mal-txt">${ic('x')} ${esc(e.error)}</div>`); }
    else if (e.tipo === 'fin') { this.pensando(false); this.pie(e.uso, true); if (this.sesion) this.sesion.uso = e.uso; this.pintarInspector(); }
    this.estadoBoton(); this.abajo();
  },
  alEvento(e) {
    // el turno que envía esta página llega dos veces (su flujo + el SSE global, que puede ir con retraso): el global se ignora hasta su fin
    if (e.sesion && e.sesion === this.propia) { if (e.tipo === 'fin' || e.tipo === 'error') this.propia = null; }
    else if (e.sesion && this.sesion && e.sesion === this.sesion.id && !this.enviando && e.tipo !== 'control') this.evento(e);
    if (e.tipo === 'inicio' || e.tipo === 'fin') this.estadoBoton();
  },
  async enviar(texto) {
    texto = String(texto || '').trim(); if (!texto || this.enviando) return;
    this.enviando = true;                                // ya, antes de cualquier await: un doble disparo no envía dos veces
    try {
      if (!this.sesion) {
        const s = await api('POST', '/sesiones', { modelo: this.modelo, cwd: this.cwd || undefined, canal: 'web' });
        this.sesion = { ...s, mensajes: [] };
        history.replaceState(null, '', `#/chat/${s.id}`);
        desmontarRobot($('#robotChat'));
        $('#msgs').innerHTML = ''; $('#msgs').onclick = null;
        $('#titulo').textContent = texto.slice(0, 60);
      }
      $('#entrada').value = ''; $('#entrada').style.height = 'auto';
      this.yo(texto); this.pensando(true); this.abajo(true);
      this.estadoBoton();
      const id = this.sesion.id;
      this.propia = id;                                  // los eventos de este turno ya llegan por el flujo: el SSE global los ignora hasta su 'fin'
      cargarSesiones();
      this.ctl = new AbortController();
      await flujo('POST', `/sesiones/${id}/mensajes`, { texto }, e => { if (this.sesion?.id === id) this.evento(e); }, this.ctl.signal);
    } catch (e) { if (e.name !== 'AbortError') aviso(e.message, true); this.pensando(false); }
    finally { this.enviando = false; this.estadoBoton(); cargarSesiones(); }
  },
  async detener() { if (this.sesion) await api('POST', `/sesiones/${this.sesion.id}/cancelar`).catch(() => { }); },
  elegirModelo(ancla) {
    const c = E.config, alias = Object.entries(c.alias);
    const recientes = [...new Set(E.sesiones.map(s => s.modelo))].slice(0, 6);
    const op = (m, extra = '') => `<div class="op" data-v="${esc(m)}">${avatar(m)}<span>${esc(nombreModelo(m))}</span><small>${esc(extra || m.split('/')[0])}</small></div>`;
    const p = popover(ancla, `<input placeholder="proveedor/modelo  (Enter)" id="mLibre">
      <div class="grupo">Atajos</div>${alias.map(([a, m]) => op(m, a)).join('')}
      ${recientes.length ? `<div class="grupo">Recientes</div>${recientes.map(m => op(m)).join('')}` : ''}
      <div class="grupo">Proveedores</div>${Object.keys(c.proveedores).map(k => `<div class="op" data-v="__ver:${esc(k)}">${avatar(k + '/')}<span>${esc(k)}</span><small>ver modelos ›</small></div>`).join('')}`, async val => {
      if (val.startsWith('__ver:')) {
        const k = val.slice(6), r = await api('GET', `/proveedores/${k}/modelos`);
        if (!r.ok) return aviso(r.error, true);
        popover(ancla, `<div class="grupo">${esc(k)} · ${r.modelos.length} modelos</div>${r.modelos.slice(0, 150).map(m => op(`${k}/${m}`)).join('')}`, v2 => this.cambiarModelo(v2));
        return;
      }
      this.cambiarModelo(val);
    });
    const inp = $('#mLibre', p); inp.focus();
    inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.includes('/')) { p.remove(); this.cambiarModelo(inp.value.trim()); } };
  },
  async cambiarModelo(m) {
    this.modelo = m;
    $('#chipModelo').innerHTML = `${avatar(m)}<span>${esc(nombreModelo(m))}</span>${ic('abajo')}`;
    if (this.sesion) { await api('PATCH', `/sesiones/${this.sesion.id}`, { modelo: m }); this.sesion.modelo = m; cargarSesiones(); this.pintarInspector(); aviso(`Ahora con ${m}`); }
  },
  async elegirCarpeta() {
    const r = await modal({ titulo: 'Carpeta de trabajo', cuerpo: `<div class="campo">Ruta donde el asistente lee, escribe y ejecuta<input id="cw" class="mono" value="${esc(this.cwd)}" placeholder="C:\\Users\\…"></div>`, botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Usar', cls: 'pri', valor: m => $('#cw', m).value.trim() }] });
    if (r === null || r === undefined) return;
    this.cwd = r;
    $('#chipCarpeta span').textContent = r ? r.split(/[\\/]/).filter(Boolean).pop() : 'carpeta por defecto';
    if (this.sesion && r) { const s = await api('PATCH', `/sesiones/${this.sesion.id}`, { cwd: r }); this.sesion.cwd = s.cwd; this.pintarInspector(); }
  },
  salir() { desmontarRobot($('#robotChat')); },
  pintarInspector() {
    const el = $('#insp'), s = this.sesion; if (!el || !s) return;
    const usos = {};
    for (const m of s.mensajes || []) for (const c of m.toolCalls || []) usos[c.name] = (usos[c.name] || 0) + 1;
    el.innerHTML = `<h3>Conversación</h3><dl><dt>Modelo</dt><dd>${esc(s.modelo)}</dd><dt>Canal</dt><dd>${esc(s.canal)}</dd><dt>Creada</dt><dd>${fecha(s.creada)}</dd><dt>Mensajes</dt><dd>${(s.mensajes || []).filter(m => m.role === 'user').length}</dd><dt>Carpeta</dt><dd class="mono">${esc(s.cwd)}</dd></dl>
      <h3>Tokens</h3><dl><dt>Entrada</dt><dd>${(s.uso?.entrada || 0).toLocaleString('es')}</dd><dt>Salida</dt><dd>${(s.uso?.salida || 0).toLocaleString('es')}</dd></dl>
      <h3>Herramientas usadas</h3><dl>${Object.entries(usos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<dt>${esc(NOMBRE_HERR[k] || k)}</dt><dd>${n}</dd>`).join('') || '<dt class="tenue">Ninguna</dt><dd></dd>'}</dl>
      <h3>Contexto</h3><dl><dt>Resúmenes</dt><dd>${(s.mensajes || []).filter(m => m.role === 'compactacion').length}</dd></dl>
      <button class="btn mini" id="compactar" title="Resume lo antiguo (el modelo deja de verlo, solo su resumen) y guarda lo duradero en la memoria">${ic('cerebro')}Resumir ahora</button>
      <h3>Id</h3><dl><dt>Sesión</dt><dd class="mono">${esc(s.id)}</dd></dl>`;
    $('#compactar', el).onclick = async () => {
      if (this.ocupada()) return aviso('Espera a que termine de trabajar', true);
      const b = $('#compactar', el); b.disabled = true; b.textContent = 'Resumiendo…';
      try {
        const r = await api('POST', `/sesiones/${s.id}/compactar`);
        aviso(r.ok ? `Resumida: ${fmtK(r.antes)} → ${fmtK(r.despues)} tokens${r.recuerdos.length ? ` · ${r.recuerdos.length} a la memoria` : ''}` : r.motivo, !r.ok);
        await this.recargar();
      } catch (e) { aviso(e.message, true); b.disabled = false; }
    };
  },
  // vuelve a pedir la sesión al núcleo y repinta (tras resumirla)
  async recargar() {
    const id = this.sesion?.id; if (!id) return;
    try { const s = await api('GET', `/sesiones/${id}`); if (this.sesion?.id !== id) return; this.sesion = s; this.pintarMensajes(); this.pintarInspector(); } catch { }
  },
};
function resumenArgs(a = {}) { return a.comando || a.ruta || a.url || a.texto || a.consulta || a.id || (Object.keys(a).length ? JSON.stringify(a).slice(0, 140) : ''); }

// ================= AUTOMATIZACIONES =================
VISTAS.auto = {
  filtro: 'todas',
  async pintar(v) {
    const l = await api('GET', '/tareas');
    const cuando = c => c.en ? `Una vez · ${fecha(new Date(c.en).getTime())}` : c.cadaMin ? `Cada ${c.cadaMin} min` : `Cron <code>${esc(c.cron)}</code>`;
    const f = { todas: l, activas: l.filter(t => t.activa), pausadas: l.filter(t => !t.activa) };
    const hist = l.filter(t => t.ultima).sort((a, b) => b.ultima - a.ultima);
    const lista = this.filtro === 'historial' ? [] : f[this.filtro];
    v.innerHTML = `<div class="pagina">${cabecera('Automatizaciones', 'Recordatorios y trabajos que el robot hace solo. También se crean hablando: “cada lunes a las 8 revisa…”.', `<button class="btn pri" id="nueva">${ic('mas')}Nueva automatización</button>`)}
      <div class="pestanas">${[['todas', 'Todas'], ['activas', 'Activas'], ['pausadas', 'Pausadas'], ['historial', 'Historial de ejecuciones']].map(([k, t]) => `<button data-f="${k}" class="${this.filtro === k ? 'on' : ''}">${t}<span class="n">${k === 'historial' ? hist.length : f[k].length}</span></button>`).join('')}</div>
      <div class="caja tabla-env">${this.filtro === 'historial'
        ? (hist.length ? `<table class="tabla"><tr><th>Automatización</th><th>Cuándo</th><th>Resultado</th></tr>${hist.map(t => `<tr><td><b>${esc(t.nombre)}</b></td><td class="suave">${fecha(t.ultima)}</td><td class="suave" style="max-width:520px">${esc((t.ultimoResultado || '').slice(0, 220))}</td></tr>`).join('')}</table>` : vacio('reloj', 'Todavía no se ha ejecutado ninguna.'))
        : (lista.length ? `<table class="tabla"><tr><th style="width:34px"></th><th>Nombre</th><th>Programación</th><th>Próxima</th><th>Última</th><th class="der">Activa</th><th></th></tr>
          ${lista.map(t => `<tr data-id="${esc(t.id)}"><td><span class="punto ${t.activa ? 'ok' : ''}"></span></td>
            <td><b>${esc(t.nombre)}</b><div class="flex" style="margin-top:3px"><span class="chip">${t.accion.tipo === 'aviso' ? 'recordatorio' : 'agente'}</span>${t.accion.soloSiHayAlgo ? '<span class="chip acento">vigilancia</span>' : ''}<span class="chip">${ic(ICONO_CANAL[t.canal] || 'isla')}${esc(t.canal)}</span>${t.accion.modelo ? `<span class="chip">${esc(nombreModelo(t.accion.modelo))}</span>` : ''}</div></td>
            <td class="suave">${cuando(t.cuando)}</td><td>${t.activa && t.proxima ? `<span title="${fecha(t.proxima)}">${hace(t.proxima)}</span>` : '<span class="tenue">—</span>'}</td>
            <td class="suave" title="${esc(t.ultimoResultado || '')}">${t.ultima ? `${t.ultimoResultado?.startsWith('error') ? `<span class="mal-txt">${ic('x')}</span>` : `<span class="ok-txt">${ic('check')}</span>`} ${hace(t.ultima)}` : '<span class="tenue">nunca</span>'}</td>
            <td class="der">${sw('act:' + t.id, t.activa)}</td>
            <td class="der" style="white-space:nowrap"><button class="btn fantasma icono" data-x="ejecutar" title="Ejecutar ahora">${ic('play')}</button><button class="btn fantasma icono" data-x="borrar" title="Borrar">${ic('basura')}</button></td></tr>`).join('')}</table>`
          : vacio('reloj', 'No hay automatizaciones aquí.'))}</div></div>`;
    $('.pestanas', v).onclick = e => { const b = e.target.closest('[data-f]'); if (b) { this.filtro = b.dataset.f; this.pintar(v); } };
    $('#nueva').onclick = () => this.nueva(v);
    enlazarControles(v, async (id, val) => { if (id.startsWith('act:')) { await api('PATCH', `/tareas/${id.slice(4)}`, { activa: val }); aviso(val ? 'Activada' : 'Pausada'); this.pintar(v); } });
    v.onclick = async e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      const id = b.closest('tr').dataset.id;
      if (b.dataset.x === 'ejecutar') { await api('POST', `/tareas/${id}/ejecutar`); aviso('Ejecutando ahora…'); setTimeout(() => this.pintar(v), 1500); }
      if (b.dataset.x === 'borrar' && await confirmar('Borrar automatización', 'No se podrá recuperar.', true)) { await api('DELETE', `/tareas/${id}`); this.pintar(v); }
    };
  },
  async nueva(v) {
    const ahora = new Date(Date.now() + 3600e3); ahora.setMinutes(0, 0, 0);
    const local = new Date(ahora - ahora.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const r = await modal({
      titulo: 'Nueva automatización', ancho: 600,
      cuerpo: `<div class="campo">Tipo ${seg('tipo', [['aviso', 'Recordatorio'], ['agente', 'Agente (hace el trabajo)']], 'aviso')}</div>
        <div class="campo">Nombre<input id="nNombre" placeholder="Revisar la Pi"></div>
        <div class="campo"><span id="lblTexto">Mensaje del recordatorio</span><textarea id="nTexto" rows="3" placeholder="Llamar al proveedor de frenos"></textarea></div>
        <div class="campo">Cuándo ${seg('modo', [['en', 'Una vez'], ['cron', 'Repetir'], ['cadaMin', 'Cada N minutos']], 'en')}</div>
        <div class="campo" data-m="en">Fecha y hora<input type="datetime-local" id="nEn" value="${local}"></div>
        <div class="campo" data-m="cron" hidden>Expresión cron (minuto hora día mes díaSemana)<input id="nCron" class="mono" value="0 8 * * 1-5"><small class="tenue">Ej: <code>0 8 * * 1-5</code> = laborables a las 8:00 · <code>*/30 * * * *</code> = cada 30 min</small></div>
        <div class="campo" data-m="cadaMin" hidden>Minutos<input type="number" id="nCada" min="1" value="30"></div>
        <div data-a hidden><div class="campo">Modelo<input id="nModelo" list="dlMod" value="${esc(E.config.modeloPorDefecto)}"><datalist id="dlMod">${modelosConocidos().map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
          <div class="fila-a" style="padding:6px 0;border:0"><div class="t"><b>Solo avisar si hay algo</b><small>Modo vigilancia: si no encuentra nada importante, no te molesta.</small></div><div class="c">${sw('solo', false)}</div></div></div>
        <div class="campo">Avisarme en ${seg('canal', [['isla', 'Isla'], ['discord', 'Discord']], 'isla')}</div>`,
      botones: [{ txt: 'Cancelar', valor: null }, {
        txt: 'Crear', cls: 'pri', valor: m => {
          const g = k => $(`[data-seg="${k}"] .on`, m)?.dataset.v;
          const modo = g('modo'), tipo = g('tipo');
          const texto = $('#nTexto', m).value.trim(); if (!texto) { aviso('Escribe el texto', true); return false; }
          const cuando = modo === 'en' ? { en: $('#nEn', m).value } : modo === 'cron' ? { cron: $('#nCron', m).value.trim() } : { cadaMin: +$('#nCada', m).value };
          const accion = { tipo, texto };
          if (tipo === 'agente') Object.assign(accion, { modelo: $('#nModelo', m).value.trim(), soloSiHayAlgo: $('[data-sw="solo"]', m).getAttribute('aria-checked') === 'true', cwd: E.config.carpeta || undefined });
          return { nombre: $('#nNombre', m).value.trim() || undefined, cuando, accion, canal: g('canal') };
        },
      }],
      alAbrir: m => enlazarControles(m, (id, val) => {
        if (id === 'modo') $$('[data-m]', m).forEach(x => { x.hidden = x.dataset.m !== val; });
        if (id === 'tipo') { $('[data-a]', m).hidden = val !== 'agente'; $('#lblTexto', m).textContent = val === 'agente' ? 'Instrucción para el agente' : 'Mensaje del recordatorio'; }
      }),
    });
    if (!r) return;
    try { await api('POST', '/tareas', r); aviso('Automatización creada'); this.pintar(v); } catch (e) { aviso(e.message, true); }
  },
};

// ================= MEMORIA =================
const TIPOS_MEM = [['perfil', 'Perfil', 'persona'], ['preferencia', 'Preferencias', 'chispa'], ['proyecto', 'Proyectos', 'carpeta'], ['persona', 'Personas', 'persona'], ['hecho', 'Hechos', 'info']];
VISTAS.memoria = {
  tipo: 'todos', q: '',
  async pintar(v) {
    const todas = await api('GET', '/memoria');
    const l = this.q ? await api('GET', '/memoria?q=' + encodeURIComponent(this.q)) : todas;
    const vis = l.filter(m => this.tipo === 'todos' || m.tipo === this.tipo).sort((a, b) => b.actualizada - a.actualizada);
    v.innerHTML = `<div class="pagina">${cabecera('Memoria', 'Lo que el robot sabe de ti. La comparten todos los modelos y canales. El <b>perfil</b> va siempre en el contexto; el resto entra solo cuando viene a cuento.', `<button class="btn pri" id="nuevo">${ic('mas')}Añadir recuerdo</button>`)}
      <div class="pestanas"><button data-t="todos" class="${this.tipo === 'todos' ? 'on' : ''}">Todos<span class="n">${todas.length}</span></button>${TIPOS_MEM.map(([k, t]) => `<button data-t="${k}" class="${this.tipo === k ? 'on' : ''}">${t}<span class="n">${todas.filter(m => m.tipo === k).length}</span></button>`).join('')}</div>
      <div class="buscador-lado" style="margin:0 0 14px">${ic('buscar')}<input id="qM" placeholder="Buscar en la memoria…" value="${esc(this.q)}"></div>
      <div class="caja">${vis.length ? vis.map(m => `<div class="fila-a" data-id="${esc(m.id)}"><span class="av" style="background:var(--capa-3);color:var(--acento)">${ic((TIPOS_MEM.find(x => x[0] === m.tipo) || [])[2] || 'info')}</span>
          <div class="t"><b style="font-weight:500">${esc(m.texto)}</b><small>${esc(m.tipo)} · ${m.origen ? `guardado por ${esc(m.origen)} · ` : ''}${hace(m.actualizada)}${m.usos ? ` · usado ${m.usos} ${m.usos === 1 ? 'vez' : 'veces'}` : ''}</small></div>
          <div class="c"><button class="btn fantasma icono" data-x="editar" title="Editar">${ic('editar')}</button><button class="btn fantasma icono" data-x="olvidar" title="Olvidar">${ic('basura')}</button></div></div>`).join('')
        : vacio('cerebro', this.q ? 'Nada coincide con la búsqueda.' : 'Aún vacía. Cuéntale cosas al robot y se irá llenando sola.')}</div></div>`;
    $('.pestanas', v).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { this.tipo = b.dataset.t; this.pintar(v); } };
    let t; $('#qM').oninput = e => { clearTimeout(t); t = setTimeout(async () => { this.q = e.target.value.trim(); await this.pintar(v); const q = $('#qM'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 280); };
    $('#nuevo').onclick = () => this.editar(v, null);
    v.onclick = async e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      const id = b.closest('[data-id]').dataset.id, m = todas.find(x => x.id === id);
      if (b.dataset.x === 'olvidar' && await confirmar('Olvidar recuerdo', m.texto, true)) { await api('DELETE', `/memoria/${id}`); aviso('Olvidado'); this.pintar(v); }
      if (b.dataset.x === 'editar') this.editar(v, m);
    };
  },
  async editar(v, m) {
    const r = await modal({
      titulo: m ? 'Editar recuerdo' : 'Nuevo recuerdo',
      cuerpo: `<div class="campo">Recuerdo<textarea id="mt" rows="3" placeholder="Prefiere respuestas cortas y en español">${esc(m?.texto || '')}</textarea></div>
        <div class="campo">Tipo ${seg('tipo', TIPOS_MEM.map(([k, t]) => [k, t]), m?.tipo || 'hecho')}</div><small class="tenue">No guardes contraseñas ni claves: se rechazan.</small>`,
      botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: x => ({ texto: $('#mt', x).value.trim(), tipo: $('[data-seg="tipo"] .on', x).dataset.v }) }],
      alAbrir: x => enlazarControles(x),
    });
    if (!r || !r.texto) return;
    try { const res = await api('POST', '/memoria', { ...r, reemplaza: m?.id }); aviso(`Recuerdo ${res.accion}`); this.pintar(v); } catch (e) { aviso(e.message, true); }
  },
};

// ================= USO =================
VISTAS.uso = {
  dias: 30,
  async pintar(v) {
    const [u, u182] = await Promise.all([api('GET', `/uso?dias=${this.dias}`), api('GET', '/uso?dias=182')]);
    const modelos = Object.entries(u.porModelo).sort((a, b) => (b[1].entrada + b[1].salida) - (a[1].entrada + a[1].salida));
    const ent = modelos.reduce((n, [, m]) => n + m.entrada, 0), sal = modelos.reduce((n, [, m]) => n + m.salida, 0), total = ent + sal;
    const serie = []; for (let i = this.dias - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); serie.push([d, (u.porDia[d]?.entrada || 0) + (u.porDia[d]?.salida || 0)]); }
    const max = Math.max(1, ...serie.map(d => d[1]));
    // mapa de calor de 26 semanas
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0); inicio.setDate(inicio.getDate() - 181 - inicio.getDay());
    const celdas = [], vals = [];
    for (let d = new Date(inicio); d <= new Date(); d.setDate(d.getDate() + 1)) { const k = d.toISOString().slice(0, 10); const n = (u182.porDia[k]?.entrada || 0) + (u182.porDia[k]?.salida || 0); celdas.push([k, n]); if (n) vals.push(n); }
    vals.sort((a, b) => a - b);
    const q = p => vals[Math.floor(p * (vals.length - 1))] || 0;
    const nivel = n => (!n ? 0 : n <= q(.25) ? 1 : n <= q(.5) ? 2 : n <= q(.8) ? 3 : 4);
    v.innerHTML = `<div class="pagina">${cabecera('Uso', 'Tokens del núcleo en todas las conversaciones y automatizaciones. El uso de Claude Code va aparte, en la isla.', seg('dias', [['7', '7 días'], ['30', '30 días'], ['90', '90 días']], String(this.dias)))}
      <div class="rejilla k"><div class="kpi"><small>${ic('rayo')}Tokens</small><b>${fmtK(total)}</b><span>${this.dias} días</span></div>
        <div class="kpi"><small>${ic('enviar')}Entrada</small><b>${fmtK(ent)}</b><span>${total ? Math.round(ent / total * 100) : 0}%</span></div>
        <div class="kpi"><small>${ic('abajo')}Salida</small><b>${fmtK(sal)}</b><span>${total ? Math.round(sal / total * 100) : 0}%</span></div>
        <div class="kpi"><small>${ic('chat')}Conversaciones</small><b>${u.sesiones}</b><span>${modelos.length} modelos</span></div></div>
      <div class="seccion">Tokens por día</div>
      <div class="caja pad"><div class="barras">${serie.map(([d, n]) => `<div style="height:${n / max * 100}%" title="${d}: ${n.toLocaleString('es')} tokens"></div>`).join('')}</div><div class="eje"><span>${serie[0][0]}</span><span>hoy</span></div></div>
      <div class="seccion">Actividad · 26 semanas</div>
      <div class="caja pad"><div class="mapa-calor">${celdas.map(([k, n]) => `<i data-n="${nivel(n)}" title="${k}: ${n.toLocaleString('es')} tokens"></i>`).join('')}</div>
        <div class="flex tenue" style="justify-content:flex-end;font-size:11px;margin-top:8px">Menos <span class="mapa-calor" style="grid-template-rows:12px">${[0, 1, 2, 3, 4].map(n => `<i data-n="${n}"></i>`).join('')}</span> Más</div></div>
      <div class="seccion">Por modelo</div>
      <div class="caja tabla-env">${modelos.length ? `<table class="tabla"><tr><th>Modelo</th><th>Conversaciones</th><th>Entrada</th><th>Salida</th><th style="width:28%">Proporción</th></tr>
        ${modelos.map(([k, m]) => { const t = m.entrada + m.salida; return `<tr><td><div class="flex">${avatar(k)}<span class="mono">${esc(k)}</span></div></td><td>${m.sesiones}</td><td>${fmtK(m.entrada)}</td><td>${fmtK(m.salida)}</td>
          <td><div class="flex"><div class="medidor crece" style="margin:0"><i style="width:${total ? t / total * 100 : 0}%"></i></div><b style="min-width:52px;text-align:right">${fmtK(t)}</b></div></td></tr>`; }).join('')}</table>` : vacio('grafica', 'Sin uso en este periodo.')}</div></div>`;
    enlazarControles(v, (id, val) => { if (id === 'dias') { this.dias = +val; this.pintar(v); } });
  },
};
