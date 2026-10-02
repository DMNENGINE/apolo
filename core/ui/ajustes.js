// Robot Companion · panel — Configuración (modo aparte con su propia navegación y buscador).
'use strict';
AJUSTES.push(
  ['General', [['apariencia', 'Apariencia', 'paleta'], ['acerca', 'Acerca de', 'info']]],
  ['Conexiones', [['nucleo', 'Núcleo', 'cpu'], ['canales', 'Canales', 'enchufe'], ['conexiones', 'Correo y servicios', 'enchufe']]],
  ['Agente', [['personalidad', 'Personalidad', 'persona'], ['modelos', 'Modelos', 'chispa'], ['herramientas', 'Herramientas', 'llaveinglesa'], ['cerebro', 'Cerebro', 'cerebro']]],
  ['Privacidad y seguridad', [['permisos', 'Permisos', 'escudo'], ['aprobaciones', 'Aprobaciones', 'check'], ['claves', 'Claves de API', 'llave']]],
  ['Sistema', [['importar', 'Importar (OpenClaw…)', 'abajo'], ['registros', 'Registros', 'lista'], ['avanzado', 'Avanzado', 'terminal']]],
);
async function guardarConfig(cambios, msg = 'Guardado') {
  try { E.config = await api('PATCH', '/config', cambios); aviso(msg); return true; } catch (e) { aviso(e.message, true); return false; }
}
// cambia el idioma del panel ('' = automático): se guarda en el núcleo (lo usan también la isla y la bandeja) y aquí como respaldo
async function I18N_cambiar(l, silencio) {
  guardarLocal('idioma', l);
  I18N.poner(l || I18N.delSistema()); I18N.estaticos();
  try { E.config = await api('PATCH', '/config', { idioma: l }); } catch (e) { if (!silencio) aviso(e.message, true); }
  modoLado = ''; await ruta();
}

// ---------- Apariencia ----------
VISTAS['ajustes/apariencia'] = {
  claves: 'tema color modo oscuro claro acento idioma language english español inglés bienvenida asistente',
  pintar(v) {
    const t = leerLocal('tema', { tema: 'casco', modo: 'oscuro', acento: null });
    const idi = E.config.idioma || '';
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Apariencia', 'Idioma, tema, color y modo del panel.')}
      <div class="seccion">${tr('Idioma')}</div><div class="caja">${fila('Idioma', tr('Panel, isla y menú de la bandeja. Automático = el de tu sistema ({x}).', { x: I18N.idiomas[I18N.delSistema()] }),
        seg('idioma', [['', 'Automático'], ...Object.entries(I18N.idiomas)], idi))}
        ${fila('Asistente de primer arranque', 'Idioma, nombre, modelo y canales en menos de 2 minutos.', `<a class="btn" href="#/bienvenida">${ic('chispa')}${tr('Abrir asistente')}</a>`)}</div>
      <div class="seccion">${tr('Tema')}</div><div class="caja pad"><div class="temas">${Object.entries(TEMAS).map(([k, [n, c]]) => `<button data-tema="${k}" class="${t.tema === k ? 'on' : ''}"><i style="background:${c}"></i><i style="background:#2a313a"></i>${tr(n)}</button>`).join('')}</div></div>
      <div class="seccion">${tr('Modo de color')}</div><div class="caja">${fila('Modo', 'Sistema sigue el ajuste de tu equipo.', seg('modo', [['sistema', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']], t.modo))}</div>
      <div class="seccion">${tr('Color de acento')}</div><div class="caja pad"><div class="colores">${ACENTOS.map(c => `<button data-ac="${c}" style="background:${c}" class="${(t.acento || TEMAS[t.tema][1]) === c ? 'on' : ''}" title="${c}"></button>`).join('')}
        <button data-ac="" title="${tr('El del tema')}" style="background:conic-gradient(#2bdc7c,#5ab0ff,#ff5fa2,#f5a524,#2bdc7c)"></button></div></div>
      <div class="seccion">${tr('Vista previa')}</div><div class="caja pad"><div class="m-ia">${avatar(E.config.modeloPorDefecto)}<div class="cont"><div class="quien"><b>${esc(nombreModelo(E.config.modeloPorDefecto))}</b></div><div class="md">${tr('<p>Así se verán las respuestas. <b>Negritas</b>, <code>código</code> y listas:</p><ul><li>Uno</li><li>Dos</li></ul>')}</div></div></div></div></div>`;
    const set = cambio => { guardarLocal('tema', { ...leerLocal('tema', t), ...cambio }); aplicarTema(); this.pintar(v); };
    v.onclick = e => {
      const tm = e.target.closest('[data-tema]'); if (tm) return set({ tema: tm.dataset.tema, acento: null });
      const ac = e.target.closest('[data-ac]'); if (ac) return set({ acento: ac.dataset.ac || null });
    };
    enlazarControles(v, (id, val) => { if (id === 'modo') set({ modo: val }); if (id === 'idioma') I18N_cambiar(val); });
  },
};

// ---------- Acerca de ----------
VISTAS['ajustes/acerca'] = {
  async pintar(v) {
    const s = await api('GET', '/sistema');
    v.innerHTML = `<div class="pagina estrecha" style="text-align:center">${cabecera('Acerca de', '')}
      <div class="robot-acerca" id="robotAcerca" title="${tr('Tócame')}">${casco('casco-grande')}</div>
      <h2 style="margin:12px 0 2px;font-size:24px">Robot Companion</h2><p class="suave" style="margin:0">${tr('Tu asistente personal, en tu equipo, con el modelo que tú elijas.')}</p>
      <div class="flex" style="justify-content:center;margin:14px 0 26px"><span class="chip acento">${tr('núcleo')} v${esc(E.estado.version)}</span><span class="chip">${tr('Licencia MIT')}</span><span class="chip">${tr('Código abierto')}</span></div>
      <div class="caja" style="text-align:left">${fila('Equipo', '', `<span class="mono">${esc(s.host)}</span>`)}${fila('Sistema', '', esc(s.so))}${fila('Node.js', '', esc(s.node))}${fila('Datos', '', `<span class="mono" style="word-break:break-all">${esc(s.datos)}</span>`)}</div>
      <p class="tenue" style="margin-top:22px;font-size:12px">${tr('Hecho a mano, desde cero.')} © ${new Date().getFullYear()}</p></div>`;
    montarRobot($('#robotAcerca'), 'vitrina', 60);
  },
  salir() { desmontarRobot($('#robotAcerca')); },
};

// ---------- Núcleo ----------
VISTAS['ajustes/nucleo'] = {
  claves: 'cpu memoria disco host token api conexión',
  async pintar(v) {
    const s = await api('GET', '/sistema');
    const url = `${location.origin}`;
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Núcleo', 'El proceso que corre los agentes, las herramientas, la memoria y las automatizaciones.')}
      <div class="seccion">${tr('Conexión')} <span class="chip ok" style="margin-left:auto"><span class="punto ok"></span>${tr('Conectado')}</span></div>
      <div class="caja">${fila('Dirección', 'API HTTP + eventos en vivo (SSE). Solo escucha en este equipo.', `<input readonly class="mono" value="${esc(url)}/v1">`)}
        ${fila('Token', 'Cualquier programa con este token controla el núcleo. No lo compartas.', `<input readonly type="password" value="${esc(TOKEN)}"><button class="btn icono" data-copiar="${esc(TOKEN)}" title="${tr('Copiar')}">${ic('copiar')}</button>`)}
        ${fila('Abrir en otro navegador', 'Enlace con el token incluido (se borra de la barra al abrir).', `<button class="btn" data-copiar="${esc(url)}/#token=${esc(TOKEN)}">${ic('enlace')}${tr('Copiar enlace')}</button>`)}</div>
      <div class="seccion">${tr('Equipo anfitrión')} <span class="chip" style="margin-left:auto">${tr('encendido {x}', { x: duracion(s.encendidoSeg) })}</span></div>
      <div class="caja pad" id="host"></div></div>`;
    const pintarHost = async () => {
      const x = await api('GET', '/sistema').catch(() => null); const el = $('#host'); if (!x || !el) return;
      const m = 1 - x.memoria.libre / x.memoria.total, d = x.disco ? 1 - x.disco.libre / x.disco.total : 0;
      const col = (t, p, a, b) => `<div><small class="tenue">${t}</small><b style="display:block;font-size:20px">${Math.round(p * 100)}%</b><div class="medidor ${p > .9 ? 'mal' : p > .75 ? 'aviso' : ''}"><i style="width:${p * 100}%"></i></div><small class="tenue">${a}</small><br><small class="tenue">${b}</small></div>`;
      el.innerHTML = `<div class="flex" style="margin-bottom:14px"><span class="av" style="background:var(--capa-3);color:var(--acento)">${ic('monitor')}</span><div class="crece"><b>${esc(x.host)}</b><br><small class="tenue">${esc(x.so)} · ${esc(x.arquitectura)} · Node ${esc(x.node)} · PID ${x.pid} · ${esc(x.ips.join(', '))}</small></div></div>
        <div class="rejilla" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px">${col('CPU', x.cpu.uso, tr('{n} núcleos', { n: x.cpu.nucleos }), esc(x.cpu.modelo))}${col(tr('Memoria'), m, tr('{x} usados', { x: fmtB(x.memoria.total - x.memoria.libre) }), tr('{a} libres de {b}', { a: fmtB(x.memoria.libre), b: fmtB(x.memoria.total) }))}
        ${x.disco ? col(tr('Disco {x}', { x: esc(x.disco.ruta) }), d, tr('{x} usados', { x: fmtB(x.disco.total - x.disco.libre) }), tr('{a} libres de {b}', { a: fmtB(x.disco.libre), b: fmtB(x.disco.total) })) : ''}</div>`;
    };
    pintarHost(); this.t = setInterval(pintarHost, 3000);
  },
  salir() { clearInterval(this.t); },
};

// ---------- Canales ----------
VISTAS['ajustes/canales'] = {
  claves: 'discord isla voz stream deck telegram whatsapp',
  async pintar(v) {
    const l = await api('GET', '/canales');
    const wa = await api('GET', '/whatsapp').catch(() => null);
    const tg = await api('GET', '/telegram').catch(() => null);
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Canales', 'Por dónde puedes hablar con el robot. Todos comparten memoria, permisos y modelos.', `<button class="btn" id="rec">${ic('recargar')}${tr('Actualizar')}</button>`)}
      <div class="seccion">${tr('Conectados')} <span class="n">${l.filter(c => c.estado === 'activo').length}</span></div>
      <div class="caja">${l.map(c => fila(`<span class="flex">${ic(ICONO_CANAL[c.tipo] || 'enlace')}${esc(tr(c.nombre))}</span>`, esc(tr(c.detalle || '')),
        `<span class="chip ${c.estado === 'activo' ? 'ok' : c.estado === 'respaldo' ? 'aviso' : ''}"><span class="punto ${c.estado === 'activo' ? 'ok' : c.estado === 'respaldo' ? 'aviso' : ''}"></span>${esc(tr(c.estado))}</span>`)).join('')}</div>
      <div class="seccion" id="canal-telegram">Telegram</div>
      <div class="caja" id="tgCaja">${this.tgHtml(tg)}</div>
      <div class="seccion" id="canal-whatsapp">WhatsApp</div>
      <div class="caja" id="waCaja">${this.waHtml(wa)}</div>
      <div class="seccion" id="canal-discord">Discord</div>
      <p class="seccion-ayuda">${tr('El bot de Discord se configura desde la bandeja del robot: <b>Configurar Discord (abrir archivo)…</b> y luego <b>Reconectar Discord</b>. Su estado aparece arriba, en Conectados.')}</p>
      <div class="seccion">${tr('Conectar otros agentes (MCP)')}</div>
      <p class="seccion-ayuda">${tr('Antigravity, Cursor, Claude Desktop, Claude Code… pueden usar al robot: avisarte, pedirte permiso por tus canales, la memoria y las tareas. Añade esto a su configuración MCP (cambia la ruta si instalaste en otra carpeta):')}</p>
      <div class="bloque-cod"><header><span>mcp_config.json</span><button class="btn fantasma mini" data-copiar>${ic('copiar')}${tr('Copiar')}</button></header><pre><code>${esc(JSON.stringify({ mcpServers: { 'robot-companion': { command: 'node', args: ['D:/RobotCompanion/core/mcp.js'], env: { ROBOT_MCP_ORIGEN: 'Antigravity' } } } }, null, 2))}</code></pre></div>
      <p class="tenue" style="font-size:12px;margin-top:14px">${tr('Desde cualquier canal: <code>gemma: mensaje</code> manda a un modelo concreto · <code>usa gpt</code> cambia el modelo por defecto de ese canal · <code>usa claude code</code> vuelve a Claude Code.')}</p></div>`;
    // #/ajustes/canales/telegram (enlaces del asistente de bienvenida): baja hasta esa tarjeta
    const ancla = (location.hash.match(/^#\/ajustes\/canales\/(\w+)/) || [])[1];
    if (ancla) setTimeout(() => document.getElementById('canal-' + ancla)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    $('#rec').onclick = () => this.pintar(v);
    this.tgEnlazar(v, tg);
    $('#waCaja').onclick = async e => {
      const b = e.target.closest('button[data-wa]'); if (!b) return;
      const a = b.dataset.wa; let r;
      if (a === 'vincular') { b.disabled = true; b.textContent = tr('Preparando…'); r = await api('POST', '/whatsapp/vincular').catch(er => ({ error: er.message })); if (r.error) return aviso(r.error, true); this.waEsperar(r); }
      if (a === 'prueba') { await api('POST', '/whatsapp/prueba'); return aviso('Mensaje de prueba enviado a tu chat'); }
      if (a === 'quitar') { if (!await modal({ titulo: 'Desvincular WhatsApp', cuerpo: tr('Se cierra la sesión de APOLO en tu WhatsApp (como cerrar WhatsApp Web).'), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Desvincular', cls: 'mal', valor: true }] })) return; r = await api('DELETE', '/whatsapp'); }
      if (r) { $('#waCaja').innerHTML = this.waHtml(r); this.waAjustes(); }
    };
    this.waAjustes();
    $('#tgCaja').onclick = async e => {
      const b = e.target.closest('button[data-tg]'); if (!b) return;
      const a = b.dataset.tg; let r;
      if (a === 'conectar') {
        const t = $('#tgTok').value.trim(); if (!t) return aviso('Pega el token que te dio @BotFather', true);
        b.disabled = true; b.textContent = tr('Comprobando…');
        r = await api('PUT', '/telegram', { token: t }).catch(er => ({ error: er.message }));
        if (r.error) { b.disabled = false; b.textContent = tr('Conectar'); return aviso(r.error, true); }
        aviso(tr('✓ Bot @{b} conectado. Ahora enlaza tu chat.', { b: r.bot }));
        if (r.enlace) window.open(r.enlace, '_blank', 'noopener');
      }
      if (a === 'enlace') { r = await api('POST', '/telegram/enlace'); if (r.enlace) window.open(r.enlace, '_blank', 'noopener'); }
      if (a === 'prueba') { await api('POST', '/telegram/prueba'); return aviso('Mensaje de prueba enviado'); }
      if (a === 'quitar') { if (!await modal({ titulo: 'Desconectar Telegram', cuerpo: tr('El robot dejará de usar ese bot (el bot sigue existiendo en tu Telegram).'), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Desconectar', cls: 'mal', valor: true }] })) return; r = await api('DELETE', '/telegram'); }
      if (r) { $('#tgCaja').innerHTML = this.tgHtml(r); this.tgEnlazar(v, r); }
    };
  },
  // tarjeta de WhatsApp: aviso del riesgo → QR → conectado
  waHtml(w) {
    if (!w) return `<div class="tenue" style="padding:14px 16px">${tr('No disponible.')}</div>`;
    if (w.conectado) return fila(`<span class="flex">${ic('enviar')}+${esc(w.numero)}</span>`, '<span class="ok-txt">✓ Vinculado.</span> Escríbele en tu chat contigo mismo ("Tú" / "Mensaje para ti").',
      `<button class="btn mini" data-wa="prueba">${tr('Probar')}</button><button class="btn mini mal" data-wa="quitar">${tr('Desvincular')}</button>`);
    if (w.qr) return `<div style="display:flex;gap:18px;align-items:center;padding:14px 16px"><img src="${w.qr}" alt="QR" style="width:200px;height:200px;border-radius:8px;background:#fff;padding:6px">
      <div style="line-height:1.7">${tr('<b>En tu móvil:</b><br>WhatsApp → <b>Ajustes</b> → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b> → escanea este código.')}<br><span class="tenue" id="waEsp">${tr('Esperando…')}</span></div></div>`;
    return `<div style="padding:14px 16px;line-height:1.6">${tr('Háblale al robot desde WhatsApp y recibe permisos y avisos. Se vincula como <b>WhatsApp Web</b> escaneando un QR.')}<br>
      <span class="mal-txt">${tr('⚠️ No es la API oficial de WhatsApp: va contra sus términos y existe un riesgo (bajo) de que bloqueen el número.')}</span> ${tr('Te recomendamos <b>un número secundario</b>.')}<br>
      <span class="tenue">${tr('Privacidad: APOLO solo lee y escribe en tu chat contigo mismo; nunca toca tus otras conversaciones.')}</span></div>
      ${fila('Estado', esc(tr(w.estado)), `<button class="btn pri" data-wa="vincular">${tr('Vincular con QR')}</button>`)}`;
  },
  // "Mensajes que te llegan": apagado / avisar y sugerir respuesta / responder solo
  async waAjustes() {
    const caja = $('#waCaja'); if (!caja || !caja.querySelector('[data-wa="quitar"]') || caja.querySelector('#waModo')) return;
    const c = await api('GET', '/whatsapp/config').catch(() => null); if (!c) return;
    const lista = a => (a || []).join(', ');
    caja.insertAdjacentHTML('beforeend', `<div style="padding:14px 16px;border-top:1px solid var(--borde, #222)">
      <b>${tr('Mensajes que te llegan')}</b>
      <div class="tenue" style="font-size:12px;margin:4px 0 10px">${tr('Por defecto APOLO solo lee tu chat contigo mismo. Si lo activas, también leerá los mensajes que te mandan (no los grupos, salvo que los actives).')}</div>
      <select id="waModo" style="width:100%;margin-bottom:10px">
        <option value="apagado" ${c.modo === 'apagado' ? 'selected' : ''}>${tr('Apagado — solo mi chat conmigo mismo')}</option>
        <option value="avisar" ${c.modo === 'avisar' ? 'selected' : ''}>${tr('Avisarme y sugerir respuesta (yo apruebo antes de enviar)')}</option>
        <option value="auto" ${c.modo === 'auto' ? 'selected' : ''}>${tr('Responder solo (y avisarme de lo que respondió)')}</option>
      </select>
      <label class="flex" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="waGrupos" ${c.grupos ? 'checked' : ''}> ${tr('Leer también los grupos')}</label>
      <div class="campo">${tr('Ignorar estos números (separados por coma)')}<input id="waIgn" class="mono" value="${esc(lista(c.ignorar))}" placeholder="+1 305 555 1234, …"></div>
      <div id="waAuto" style="display:${c.modo === 'auto' ? 'block' : 'none'}">
        <div class="campo">${tr('Responder solo a estos números (vacío = a todos, nunca a grupos)')}<input id="waCon" class="mono" value="${esc(lista(c.auto.contactos))}" placeholder="+1 305 555 1234, …"></div>
        <div class="campo">${tr('Instrucciones para responder')}<textarea id="waIns" rows="3">${esc(c.auto.instrucciones || '')}</textarea></div>
        <div class="tenue" style="font-size:12px">${tr('Máximo {n} respuestas automáticas por contacto y hora. Nunca responde solo a pagos, contraseñas, datos privados, citas o cosas urgentes: esas te las pregunta.', { n: c.auto.maxHora || 3 })}</div>
      </div>
      <div style="text-align:right;margin-top:10px"><button class="btn pri" id="waGuardar">${tr('Guardar')}</button></div></div>`);
    const num = s => String(s || '').split(',').map(x => x.trim()).filter(x => x.replace(/\D/g, '').length >= 6);
    $('#waModo').onchange = e => { $('#waAuto').style.display = e.target.value === 'auto' ? 'block' : 'none'; };
    $('#waGuardar').onclick = async () => {
      await api('PATCH', '/whatsapp/config', { modo: $('#waModo').value, grupos: $('#waGrupos').checked, ignorar: num($('#waIgn').value), auto: { contactos: num($('#waCon').value), instrucciones: $('#waIns').value.trim() } });
      aviso('Guardado');
    };
  },
  // refresca el QR (WhatsApp lo cambia cada ~20 s) hasta que se vincula
  async waEsperar(w) {
    if ($('#waCaja')) $('#waCaja').innerHTML = this.waHtml(w);
    for (let i = 0; i < 120; i++) {
      await new Promise(ok => setTimeout(ok, 2500));
      if (!$('#waCaja')) return;
      const r = await api('GET', '/whatsapp').catch(() => null); if (!r) continue;
      const img = $('#waCaja img');
      if (r.conectado) { $('#waCaja').innerHTML = this.waHtml(r); this.waAjustes(); aviso('✓ WhatsApp vinculado'); return; }
      if (r.qr && img) { if (img.src !== r.qr) img.src = r.qr; } else $('#waCaja').innerHTML = this.waHtml(r);
    }
  },
  // tarjeta de Telegram según el estado: sin bot → pasos con @BotFather; bot sin enlazar → enlace; enlazado → listo
  tgHtml(t) {
    if (!t) return `<div class="tenue" style="padding:14px 16px">${tr('No disponible.')}</div>`;
    if (!t.configurado) return `<div style="padding:14px 16px;line-height:1.6">
        ${tr('<b>1.</b> Abre <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> en Telegram y escribe <code>/newbot</code>.')}<br>
        ${tr('<b>2.</b> Ponle un nombre (ej. <i>Mi Robot</i>) y un usuario que acabe en <code>bot</code> (ej. <i>mirobot123_bot</i>).')}<br>
        ${tr('<b>3.</b> Te dará un <b>token</b> (algo como <code>123456789:AAH…</code>). Pégalo aquí:')}</div>
      ${fila('Token del bot', 'Se guarda cifrado en este equipo. Tu bot solo hablará contigo.', `<input id="tgTok" class="mono" type="password" autocomplete="off" placeholder="123456789:AAH…"><button class="btn pri" data-tg="conectar">${tr('Conectar')}</button>`)}`;
    if (!t.enlazado) return fila(`<span class="flex">${ic('enviar')}@${esc(t.bot)}</span>`, `${tr('<b>Último paso:</b> abre el enlace y pulsa <b>Iniciar</b> en Telegram para ligar el bot a tu chat.')} <span id="tgEsp" class="tenue">${tr('Esperando…')}</span>`,
        `<a class="btn pri" href="${esc(t.enlace || '#')}" target="_blank" rel="noopener">${tr('Abrir Telegram')}</a><button class="btn mini mal" data-tg="quitar">${tr('Quitar')}</button>`);
    return fila(`<span class="flex">${ic('enviar')}@${esc(t.bot)}</span>`, `<span class="ok-txt">✓ ${t.usuario ? tr('Enlazado con {x}', { x: esc(t.usuario) }) : tr('Enlazado')}</span> · ${esc(tr(t.estado))}. ${tr('Háblale desde el móvil; aquí te llegan permisos y avisos cuando no estás en el PC.')}`,
      `<button class="btn mini" data-tg="prueba">${tr('Probar')}</button><button class="btn mini" data-tg="enlace">${tr('Enlazar otro chat')}</button><button class="btn mini mal" data-tg="quitar">${tr('Desconectar')}</button>`);
  },
  // mientras falta el enlace, mira cada 3 s si ya pulsaste "Iniciar" en Telegram
  async tgEnlazar(v, t) {
    if (!t || !t.configurado || t.enlazado) return;
    for (let i = 0; i < 200; i++) {
      await new Promise(ok => setTimeout(ok, 3000));
      if (!document.getElementById('tgEsp')) return;
      const r = await api('GET', '/telegram').catch(() => null);
      if (r?.enlazado) { $('#tgCaja').innerHTML = this.tgHtml(r); aviso('✓ Telegram enlazado'); return; }
    }
  },
};

// ---------- Personalidad ----------
VISTAS['ajustes/personalidad'] = {
  claves: 'identidad instrucciones contexto alma prompt carácter',
  actual: 'identidad', vista: false,
  async pintar(v) {
    const l = await api('GET', '/personalidad');
    const a = l.find(x => x.id === this.actual) || l[0];
    v.innerHTML = `<div class="pagina">${cabecera('Personalidad', 'Archivos que el robot lee en cada conversación, con cualquier modelo. Escribe en Markdown.')}
      <div class="pestanas">${l.map(x => `<button data-a="${x.id}" class="${x.id === a.id ? 'on' : ''}">${ic(x.id === 'identidad' ? 'persona' : x.id === 'instrucciones' ? 'lista' : 'carpeta')}${esc(tr(x.titulo))}</button>`).join('')}</div>
      <div class="flex" style="margin-bottom:10px"><div class="crece"><b>${esc(tr(a.titulo))}</b> <span class="tenue">— ${esc(tr(a.ayuda))}</span><br><small class="tenue mono">${esc(a.ruta)}</small></div>
        <button class="btn" id="prev">${ic('ojo')}${tr(this.vista ? 'Editar' : 'Vista previa')}</button><button class="btn" id="rest">${tr('Restablecer')}</button><button class="btn pri" id="guardar">${tr('Guardar')}</button></div>
      ${this.vista ? `<div class="caja pad md" style="min-height:420px">${md(a.contenido)}</div>` : `<textarea class="editor" id="ed" spellcheck="false">${esc(a.contenido)}</textarea>`}
      <small class="tenue" id="cuenta"></small></div>`;
    const ed = $('#ed');
    const cuenta = () => { if (ed) $('#cuenta').textContent = tr('{n} / {m} caracteres', { n: ed.value.length.toLocaleString(I18N.locale()), m: (20000).toLocaleString(I18N.locale()) }); };
    if (ed) { ed.oninput = () => { a.contenido = ed.value; cuenta(); }; cuenta(); ed.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('#guardar').click(); } }; }
    $('.pestanas', v).onclick = e => { const b = e.target.closest('[data-a]'); if (b) { this.actual = b.dataset.a; this.vista = false; this.pintar(v); } };
    $('#prev').onclick = () => { this.vista = !this.vista; this.pintar(v); };
    $('#guardar').onclick = async () => { try { await api('PUT', `/personalidad/${a.id}`, { contenido: ed ? ed.value : a.contenido }); aviso('Guardado. Se aplica desde el siguiente mensaje.'); } catch (e) { aviso(e.message, true); } };
    $('#rest').onclick = async () => { if (await confirmar('Restablecer', tr('“{x}” volverá al texto original.', { x: tr(a.titulo) }), true)) { await api('POST', `/personalidad/${a.id}/restablecer`); this.pintar(v); } };
  },
};

// ---------- Modelos ----------
VISTAS['ajustes/modelos'] = {
  claves: 'proveedor ollama openai anthropic gemini openrouter alias atajo por defecto',
  async pintar(v) {
    const c = E.config = await api('GET', '/config');
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Modelos', 'Conecta cualquier proveedor. Las claves se guardan en este equipo y nunca se muestran.', `<button class="btn" id="anadir">${ic('mas')}${tr('Añadir proveedor')}</button>`)}
      <div class="seccion">ChatGPT</div><p class="seccion-ayuda">${tr('¿Pagas ChatGPT Plus o Pro? Úsalo aquí sin API key: se conecta con tu cuenta a través de Codex CLI (de OpenAI).')}</p>
      <div class="caja" id="cgpt">${fila('Cuenta de ChatGPT', `<span id="cgEst" class="tenue">${tr('Comprobando…')}</span>`, `<button class="btn pri" id="cgCon">${tr('Conectar ChatGPT')}</button><button class="btn" id="cgUsar" style="display:none">${tr('Usar por defecto')}</button>`)}</div>
      <div class="seccion">${tr('Por defecto')}</div>
      <div class="caja">${fila('Modelo por defecto', 'Se usa en conversaciones nuevas, tareas y canales sin modelo elegido. Formato <code>proveedor/modelo</code>.', `<input id="defM" class="mono" list="dlM" value="${esc(c.modeloPorDefecto)}"><datalist id="dlM">${modelosConocidos().map(m => `<option value="${esc(m)}">`).join('')}</datalist><button class="btn pri" id="gDef">${tr('Guardar')}</button>`)}</div>
      <div class="seccion">${tr('Atajos')} <span class="n">${Object.keys(c.alias).length}</span></div><p class="seccion-ayuda">${tr('Escribe <code>atajo: mensaje</code> en la isla, Discord o voz para hablar con ese modelo.')}</p>
      <div class="caja" id="alias">${Object.entries(c.alias).map(([a, m]) => this.filaAlias(a, m)).join('')}</div>
      <div class="flex" style="margin-top:8px"><button class="btn" id="masAlias">${ic('mas')}${tr('Atajo')}</button><button class="btn pri" id="gAlias">${tr('Guardar atajos')}</button></div>
      <div class="seccion">${tr('Proveedores')} <span class="n">${Object.keys(c.proveedores).length}</span></div>
      <div class="caja">${Object.entries(c.proveedores).map(([k, p]) => {
        const listo = p.tipo === 'claude-cli' || p.tipo === 'codex-cli' || p.local || p.tieneKey;
        return `<div class="fila-a" data-p="${esc(k)}">${avatar(k + '/')}<div class="t"><b>${esc(k)}</b><small>${p.tipo === 'codex-cli' ? tr('Tu cuenta de ChatGPT vía Codex CLI (arriba: Conectar ChatGPT)') : p.tipo === 'claude-cli' ? tr('CLI de Claude Code instalada en este equipo') : `${esc(p.tipo)} · ${esc(p.baseUrl || '')}`}</small><div class="lista tenue" style="font-size:11.5px;margin-top:4px"></div></div>
          <div class="c"><span class="chip ${listo ? 'ok' : ''}">${p.tipo === 'codex-cli' ? 'ChatGPT' : p.tipo === 'claude-cli' ? 'CLI' : p.local ? 'local' : tr(p.tieneKey ? (p.keyDeEntorno ? 'key (entorno)' : 'key guardada') : 'sin key')}</span>
          <button class="btn mini" data-x="probar">${tr('Probar')}</button>${!['claude-cli', 'codex-cli'].includes(p.tipo) ? `<button class="btn mini" data-x="editar">${ic('editar')}</button>` : ''}</div></div>`;
      }).join('')}</div></div>`;
    $('#gDef').onclick = () => guardarConfig({ modeloPorDefecto: $('#defM').value.trim() });
    const cgPintar = async () => {
      const e = await api('GET', '/chatgpt').catch(() => null); if (!e || !$('#cgEst')) return e;
      $('#cgEst').innerHTML = e.sesion ? `<span class="ok-txt">✓ ${tr('Conectado')}</span>` + (c.modeloPorDefecto.startsWith('chatgpt/') ? ` · ${tr('es tu modelo por defecto')}` : '') : tr(e.instalado ? 'Codex instalado · falta iniciar sesión' : 'No conectado');
      $('#cgCon').textContent = tr(e.sesion ? 'Reconectar' : 'Conectar ChatGPT');
      $('#cgUsar').style.display = e.sesion && !c.modeloPorDefecto.startsWith('chatgpt/') ? '' : 'none';
      return e;
    };
    cgPintar();
    $('#cgCon').onclick = async () => {
      const b = $('#cgCon'); b.disabled = true; b.textContent = tr('Preparando…'); $('#cgEst').textContent = tr('Instalando Codex si hace falta (puede tardar un minuto)…');
      const r = await api('POST', '/chatgpt/conectar').catch(er => ({ ok: false, error: er.message }));
      b.disabled = false;
      if (!r.ok) { $('#cgEst').innerHTML = '<span class="mal-txt">✗ ' + esc(r.error) + '</span>'; b.textContent = tr('Reintentar'); return; }
      $('#cgEst').textContent = tr(r.mensaje); b.textContent = tr('Esperando…');
      for (let i = 0; i < 100; i++) {                          // ~5 min esperando a que inicie sesión
        await new Promise(ok => setTimeout(ok, 3000));
        const e = await cgPintar(); if (!e || !document.body.contains(b)) return;
        if (e.sesion) { if (!c.modeloPorDefecto.startsWith('chatgpt/')) { await api('POST', '/chatgpt/usar'); c.modeloPorDefecto = 'chatgpt/default'; await cgPintar(); } return; }
      }
    };
    $('#cgUsar').onclick = async () => { await api('POST', '/chatgpt/usar'); c.modeloPorDefecto = 'chatgpt/default'; if ($('#defM')) $('#defM').value = 'chatgpt/default'; cgPintar(); };
    $('#masAlias').onclick = () => $('#alias').insertAdjacentHTML('beforeend', this.filaAlias('', ''));
    $('#gAlias').onclick = () => {
      const alias = {}; $$('#alias .fila-a').forEach(f => { const a = $('.a', f).value.trim(), m = $('.m', f).value.trim(); if (a && m) alias[a] = m; });
      guardarConfig({ alias });
    };
    $('#anadir').onclick = () => this.proveedor(v, null);
    v.onclick = async e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      if (b.dataset.x === 'quitar') return b.closest('.fila-a').remove();
      const k = b.closest('[data-p]').dataset.p, f = b.closest('[data-p]');
      if (b.dataset.x === 'editar') return this.proveedor(v, k);
      b.disabled = true; b.textContent = tr('Probando…');
      const r = await api('GET', `/proveedores/${k}/modelos`).catch(er => ({ ok: false, error: er.message }));
      b.disabled = false; b.textContent = tr('Probar');
      $('.lista', f).innerHTML = r.ok ? `<span class="ok-txt">✓ ${tr('{n} modelos', { n: r.modelos.length })}</span> · ${r.modelos.slice(0, 40).map(m => `<code>${esc(m)}</code>`).join(' ')}${r.modelos.length > 40 ? ' …' : ''}` : `<span class="mal-txt">✗ ${esc(r.error)}</span>`;
    };
  },
  filaAlias: (a, m) => `<div class="fila-a"><input class="a" placeholder="${tr('atajo')}" value="${esc(a)}" style="width:150px"><span class="tenue">→</span><input class="m mono crece" placeholder="${tr('proveedor/modelo')}" value="${esc(m)}"><button class="btn fantasma icono" data-x="quitar">${ic('x')}</button></div>`,
  async proveedor(v, k) {
    const p = k ? E.config.proveedores[k] : null;
    const r = await modal({
      titulo: k ? `${tr('Proveedor')} · ${k}` : 'Añadir proveedor',
      cuerpo: `${k ? '' : `<div class="campo">${tr('Nombre (sin espacios)')}<input id="pn" placeholder="groq"></div><div class="campo">${tr('Tipo')} ${seg('tipo', [['openai', 'Compatible OpenAI'], ['anthropic', 'Anthropic'], ['gemini', 'Gemini']], 'openai')}</div>`}
        <div class="campo">${tr('URL base')}<input id="pu" class="mono" value="${esc(p?.baseUrl || '')}" placeholder="https://api.groq.com/openai/v1"></div>
        ${p?.local ? '' : `<div class="campo">API key<input id="pk" type="password" autocomplete="off" placeholder="${tr(p?.tieneKey ? '•••••••• guardada — escribe para cambiarla' : 'pega tu clave')}"></div>${k ? enlaceClave(k, p) : ''}`}
        <small class="tenue">${tr('Groq, DeepSeek, Mistral, LM Studio, vLLM, Together… cualquiera con API tipo OpenAI funciona.')}</small>`,
      botones: [...(k && !['openai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'claudecode'].includes(k) ? [{ txt: 'Eliminar', cls: 'mal', valor: 'borrar' }] : []), { txt: 'Cancelar', valor: null }, {
        txt: 'Guardar', cls: 'pri', valor: m => {
          const nombre = k || $('#pn', m).value.trim().toLowerCase();
          if (!/^[\w-]+$/.test(nombre)) { aviso(tr('Nombre no válido'), true); return false; }
          const d = { baseUrl: $('#pu', m).value.trim() };
          if (!k) d.tipo = $('[data-seg="tipo"] .on', m).dataset.v;
          const key = $('#pk', m)?.value.trim(); if (key) d.apiKey = key;
          return { [nombre]: d };
        },
      }],
      alAbrir: m => enlazarControles(m),
    });
    if (r === 'borrar') { await guardarConfig({ proveedores: { [k]: { borrar: true } } }, 'Proveedor eliminado'); return this.pintar(v); }
    if (r && await guardarConfig({ proveedores: r })) this.pintar(v);
  },
};

// ---------- Cerebro ----------
VISTAS['ajustes/cerebro'] = {
  claves: 'triage tarjetas resumen briefing discord avisos',
  async pintar(v) {
    const c = await api('GET', '/cerebro').catch(e => ({ error: e.message }));
    if (c.error) { v.innerHTML = `<div class="pagina estrecha">${cabecera('Cerebro', '')}${vacio('cerebro', esc(c.error))}</div>`; return; }
    const dl = `<datalist id="dlC">${modelosConocidos().map(m => `<option value="${esc(m)}">`).join('')}</datalist>`;
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Cerebro', 'El que lee tus avisos de Discord, los clasifica (urgente / normal / ruido), prepara respuestas y te hace el resumen del día.')}
      <div class="caja">${fila('Modelo para clasificar avisos', 'Se usa con cada mensaje que llega. Mejor uno rápido y gratis.', `<input id="cm" class="mono" list="dlC" value="${esc(c.modelo)}">`)}
        ${fila('Modelo para resúmenes', 'Resumen del día, “¿dónde me quedé?” y preguntas sobre tu historial.', `<input id="cr" class="mono" list="dlC" value="${esc(c.modeloResumen)}">`)}
        ${fila('Hora del resumen del día', 'Se hace si has usado el PC en los últimos 10 min.', `<input id="ch" type="number" min="0" max="23" value="${c.resumenHora}" style="width:90px">`)}</div>${dl}
      <div class="flex" style="margin-top:12px"><span class="crece ${c.gastaPlan ? 'aviso-txt' : 'ok-txt'}">${tr(c.gastaPlan ? '⚠ Usa modelos de tu plan de Claude: cada aviso gasta un poco.' : '✓ No gasta tu plan de Claude.')}</span><button class="btn pri" id="g">${tr('Guardar')}</button></div>
      <p class="tenue" style="font-size:12px;margin-top:14px">${tr('Usa <code>proveedor/modelo</code> (cualquiera de Modelos). <code>haiku</code> o <code>sonnet</code> a secas usan Claude Code como antes.')}</p></div>`;
    $('#g').onclick = async () => {
      try { await api('PATCH', '/cerebro', { modelo: $('#cm').value, modeloResumen: $('#cr').value, resumenHora: +$('#ch').value }); aviso(tr('Guardado')); this.pintar(v); } catch (e) { aviso(e.message, true); }
    };
  },
};

// ---------- Herramientas ----------
VISTAS['ajustes/herramientas'] = {
  claves: 'shell terminal archivos web memoria tareas',
  async pintar(v) {
    const l = await api('GET', '/herramientas');
    const RIESGO = { lectura: ['ok', 'solo lectura'], escritura: ['aviso', 'escribe'], ejecucion: ['mal', 'ejecuta'], variable: ['aviso', 'según uso'] };
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Herramientas', 'Lo que el agente puede hacer en tu equipo. Apaga lo que no quieras que use con ningún modelo.')}
      <div class="caja">${l.map(h => fila(`<span class="flex">${ic(ICONO_HERR[h.nombre] || 'llaveinglesa')}${esc(NOMBRE_HERR[h.nombre] || h.nombre)} <code class="tenue" style="font-weight:400">${esc(h.nombre)}</code></span>`,
        `${esc(h.descripcion.slice(0, 190))}${h.descripcion.length > 190 ? '…' : ''}`, `<span class="chip ${(RIESGO[h.riesgo] || RIESGO.variable)[0]}">${tr((RIESGO[h.riesgo] || [, h.riesgo])[1])}</span>${sw(h.nombre, h.activa)}`)).join('')}</div>
      <p class="tenue" style="font-size:12px;margin-top:12px">${tr('Las que escriben o ejecutan piden permiso según tu modo en <a href="#/ajustes/permisos">Permisos</a>.')}</p></div>`;
    enlazarControles(v, async () => {
      const off = $$('[data-sw]', v).filter(s => s.getAttribute('aria-checked') !== 'true').map(s => s.dataset.sw);
      await guardarConfig({ herramientasOff: off });
    });
  },
};

// ---------- Permisos ----------
VISTAS['ajustes/permisos'] = {
  claves: 'reglas siempre preguntar automático solo lectura',
  async pintar(v) {
    const [reglas, c] = await Promise.all([api('GET', '/reglas'), api('GET', '/config')]);
    E.config = c;
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Permisos', 'Cuándo debe preguntarte el robot antes de actuar.')}
      <div class="caja">${fila('Modo', 'Leer nunca pide permiso. Lo <b>peligroso</b> (borrados recursivos, push forzado, formatear…) pide permiso <b>siempre</b>, en cualquier modo.',
        seg('modo', [['preguntar', 'Preguntar'], ['auto', 'Automático'], ['solo-lectura', 'Solo lectura']], c.permisos.modo))}
        ${fila('Dónde te pregunta', 'Tarjeta en este panel, isla del escritorio, Stream Deck y Discord (si no estás en el PC).', `<span class="chip ok">${tr('todos los canales')}</span>`)}</div>
      <div class="seccion">${tr('Reglas “Siempre”')} <span class="n">${reglas.length}</span></div><p class="seccion-ayuda">${tr('Se crean al pulsar <b>Siempre</b> en un permiso. Quítalas para que vuelva a preguntar.')}</p>
      <div class="caja tabla-env">${reglas.length ? `<table class="tabla"><tr><th>${tr('Herramienta')}</th><th>${tr('Aplica a')}</th><th></th></tr>${reglas.map((r, i) => `<tr><td><span class="flex">${ic(ICONO_HERR[r.herramienta] || 'llaveinglesa')}${esc(NOMBRE_HERR[r.herramienta] || r.herramienta)}</span></td><td class="mono">${esc(r.herramienta === 'shell' ? `${r.prefijo} …` : r.prefijo === '*' ? tr('todo') : r.prefijo)}</td><td class="der"><button class="btn mini mal" data-i="${i}">${tr('Quitar')}</button></td></tr>`).join('')}</table>` : vacio('escudo', 'Sin reglas permanentes.')}</div></div>`;
    enlazarControles(v, (id, val) => { if (id === 'modo') guardarConfig({ permisos: { modo: val } }, val === 'auto' ? 'Automático: solo preguntará lo peligroso' : 'Guardado'); });
    v.onclick = async e => { const b = e.target.closest('[data-i]'); if (b) { await api('DELETE', `/reglas/${b.dataset.i}`); aviso(tr('Regla quitada')); this.pintar(v); } };
  },
};

// ---------- Aprobaciones ----------
VISTAS['ajustes/aprobaciones'] = {
  claves: 'historial permitido denegado',
  async pintar(v) {
    const l = await api('GET', '/aprobaciones');
    const D = { allow: ['ok', 'Permitido'], always: ['ok', 'Siempre'], deny: ['mal', 'Denegado'] };
    v.innerHTML = `<div class="pagina">${cabecera('Aprobaciones', 'Historial de permisos de los últimos 30 días: qué pidió el robot y qué respondiste.')}
      <div class="caja tabla-env">${l.length ? `<table class="tabla"><tr><th>${tr('Cuándo')}</th><th>${tr('Herramienta')}</th><th>${tr('Solicitud')}</th><th>${tr('Decisión')}</th><th>${tr('Respuesta en')}</th></tr>
        ${l.map(x => `<tr><td class="suave" style="white-space:nowrap">${fecha(x.t)}</td><td><span class="flex">${ic(ICONO_HERR[x.herramienta] || 'llaveinglesa')}${esc(NOMBRE_HERR[x.herramienta] || x.herramienta)}</span>${x.peligro ? `<span class="chip mal">${esc(x.peligro)}</span>` : ''}</td>
          <td class="mono" style="max-width:420px;word-break:break-all">${esc(x.resumen)}</td><td><span class="chip ${(D[x.decision] || ['', x.decision])[0]}">${tr((D[x.decision] || ['', x.decision])[1])}</span>${x.motivo && x.decision === 'deny' ? `<br><small class="tenue">${esc(x.motivo)}</small>` : ''}</td><td class="suave">${Math.max(1, Math.round(x.espera / 1000))} s</td></tr>`).join('')}</table>`
        : vacio('check', 'Sin aprobaciones registradas todavía.')}</div></div>`;
  },
};

// ---------- Claves ----------
// dónde se consigue la clave de cada proveedor (por nombre o por el dominio de su URL base)
const DONDE_CLAVE = [
  [/openrouter/, 'https://openrouter.ai/keys', 'OpenRouter', 'Una sola clave para cientos de modelos.'],
  [/openai/, 'https://platform.openai.com/api-keys', 'OpenAI', 'Se paga por uso aparte del plan de ChatGPT (para tu plan usa "Conectar ChatGPT").'],
  [/anthropic/, 'https://console.anthropic.com/settings/keys', 'Anthropic', 'Se paga por uso aparte del plan de Claude.'],
  [/gemini|generativelanguage|google/, 'https://aistudio.google.com/apikey', 'Google AI Studio', 'Gratis con límites diarios.'],
  [/groq/, 'https://console.groq.com/keys', 'Groq', 'Gratis con límites; muy rápido.'],
  [/deepseek/, 'https://platform.deepseek.com/api_keys', 'DeepSeek', ''],
  [/mistral/, 'https://console.mistral.ai/api-keys', 'Mistral', ''],
  [/together/, 'https://api.together.ai/settings/api-keys', 'Together AI', ''],
  [/x\.ai|grok|xai/, 'https://console.x.ai', 'xAI (Grok)', ''],
  [/perplexity/, 'https://www.perplexity.ai/settings/api', 'Perplexity', ''],
  [/moonshot|kimi/, 'https://platform.moonshot.ai/console/api-keys', 'Moonshot (Kimi)', ''],
  [/z\.ai|zai|glm|bigmodel/, 'https://z.ai/manage-apikey/apikey-list', 'Z.ai (GLM)', ''],
  [/dashscope|qwen|aliyun/, 'https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key', 'Alibaba Model Studio (Qwen)', ''],
  [/nvidia/, 'https://build.nvidia.com/settings/api-keys', 'NVIDIA', 'Créditos gratis al registrarte.'],
  [/cohere/, 'https://dashboard.cohere.com/api-keys', 'Cohere', 'Tiene clave de prueba gratis.'],
  [/huggingface|hf\.co/, 'https://huggingface.co/settings/tokens', 'Hugging Face', 'Token con permiso "Make calls to Inference Providers".'],
  [/cerebras/, 'https://cloud.cerebras.ai', 'Cerebras', ''],
  [/fireworks/, 'https://fireworks.ai/account/api-keys', 'Fireworks', ''],
];
function dondeClave(nombre, p = {}) {
  const t = `${nombre} ${p.baseUrl || ''}`.toLowerCase();
  const d = DONDE_CLAVE.find(([re]) => re.test(t));
  return d ? { url: d[1], sitio: d[2], nota: d[3] } : null;
}
// el enlace listo para tocar, debajo del campo de la clave
const enlaceClave = (nombre, p) => { const d = dondeClave(nombre, p); return d ? `<div class="tenue" style="font-size:12.5px;margin-top:8px">🔑 ${tr('Consíguela en')} <a href="${d.url}" target="_blank" rel="noopener"><b>${esc(d.sitio)}</b> → ${esc(d.url.replace(/^https:\/\//, ''))}</a>${d.nota ? `<br>${esc(tr(d.nota))}` : ''}</div>` : ''; };

VISTAS['ajustes/claves'] = {
  claves: 'api key secreto token openai anthropic gemini',
  async pintar(v) {
    const c = E.config = await api('GET', '/config');
    const conKey = Object.entries(c.proveedores).filter(([, p]) => !p.local && !['claude-cli', 'codex-cli'].includes(p.tipo));
    v.innerHTML = `<div class="pagina">${cabecera('Claves de API', 'Se guardan solo en este equipo (config del núcleo) y nunca se envían al navegador. También puedes usar variables de entorno.')}
      <div class="caja tabla-env"><table class="tabla"><tr><th>${tr('Proveedor')}</th><th>${tr('Estado')}</th><th>${tr('Origen')}</th><th>${tr('Variable de entorno')}</th><th></th></tr>
        ${conKey.map(([k, p]) => `<tr data-k="${esc(k)}"><td><span class="flex">${avatar(k + '/')}<b>${esc(k)}</b></span></td>
          <td>${p.tieneKey ? `<span class="chip ok">${tr('configurada')}</span>` : `<span class="chip">${tr('sin clave')}</span>${dondeClave(k, p) ? ` <a href="${dondeClave(k, p).url}" target="_blank" rel="noopener" style="font-size:12px">${tr('conseguir')}</a>` : ''}`}</td><td class="suave">${p.tieneKey ? tr(p.keyDeEntorno ? 'entorno' : 'config') : '—'}</td>
          <td class="mono tenue">${esc(p.env || '—')}</td><td class="der" style="white-space:nowrap"><button class="btn mini" data-x="poner">${tr(p.tieneKey ? 'Cambiar' : 'Añadir')}</button>${p.tieneKey && !p.keyDeEntorno ? ` <button class="btn mini mal" data-x="quitar">${tr('Quitar')}</button>` : ''}</td></tr>`).join('')}</table></div>
      <p class="tenue" style="font-size:12px;margin-top:12px">${ic('candado')} ${tr('Las contraseñas y claves también se bloquean en la memoria del robot: nunca las guarda.')}</p></div>`;
    v.onclick = async e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      const k = b.closest('[data-k]').dataset.k;
      if (b.dataset.x === 'quitar') { if (await confirmar('Quitar clave', tr('Se borrará la clave de {k}.', { k }), true) && await guardarConfig({ proveedores: { [k]: { apiKey: '' } } }, 'Clave quitada')) this.pintar(v); return; }
      const key = await modal({ titulo: tr('Clave de {k}', { k }), cuerpo: `<div class="campo">API key<input id="kk" type="password" autocomplete="off" placeholder="${tr('pega la clave')}"></div>${enlaceClave(k, E.config.proveedores[k])}`, botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: m => $('#kk', m).value.trim() || false }] });
      if (key && await guardarConfig({ proveedores: { [k]: { apiKey: key } } }, 'Clave guardada')) this.pintar(v);
    };
  },
};

// ---------- Registros ----------
VISTAS['ajustes/registros'] = {
  claves: 'logs consola errores eventos',
  nivel: 'todo', pausa: false,
  async pintar(v) {
    this.lineas = await api('GET', '/registros');
    v.innerHTML = `<div class="pagina">${cabecera('Registros', 'Lo que pasa en el núcleo, en vivo (últimas 1000 líneas).',
      `${seg('nivel', [['todo', 'Todo'], ['aviso', 'Avisos'], ['error', 'Errores']], this.nivel)}<button class="btn" id="pausa">${ic(this.pausa ? 'play' : 'pausa')}${tr(this.pausa ? 'Reanudar' : 'Pausar')}</button>`)}
      <div class="consola" id="con"></div></div>`;
    enlazarControles(v, (id, val) => { if (id === 'nivel') { this.nivel = val; this.pintarLineas(); } });
    $('#pausa').onclick = () => { this.pausa = !this.pausa; this.pintar(v); };
    this.pintarLineas();
  },
  linea: l => `<div><time>${new Date(l.t).toLocaleTimeString(I18N.locale())}</time><span class="o">${esc(l.origen)}</span><span class="n-${l.nivel}">${esc(l.texto)}</span></div>`,
  filtra(l) { return this.nivel === 'todo' || (this.nivel === 'aviso' ? l.nivel !== 'info' : l.nivel === 'error'); },
  pintarLineas() { const c = $('#con'); if (!c) return; c.innerHTML = this.lineas.filter(l => this.filtra(l)).map(this.linea).join('') || vacio('lista', 'Nada todavía.'); c.scrollTop = c.scrollHeight; },
  alEvento(e) {
    if (e.tipo !== 'registro' || this.pausa) return;
    this.lineas.push(e); const c = $('#con'); if (!c || !this.filtra(e)) return;
    const abajo = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    c.insertAdjacentHTML('beforeend', this.linea(e)); if (abajo) c.scrollTop = c.scrollHeight;
  },
};

// ---------- Avanzado ----------
VISTAS['ajustes/avanzado'] = {
  claves: 'pasos carpeta datos config',
  async pintar(v) {
    const c = E.config = await api('GET', '/config');
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Avanzado', 'Ajustes del agente para usuarios con experiencia.')}
      <div class="caja">${fila('Pasos máximos por mensaje', 'Cuántas veces puede usar herramientas antes de detenerse (1–200).', `<input type="number" id="mp" min="1" max="200" value="${c.maxPasos}" style="width:110px">`)}
        ${fila('Carpeta de trabajo por defecto', 'Dónde trabajan las conversaciones nuevas y las automatizaciones. Vacío = tu carpeta de usuario.', `<input id="cp" class="mono" value="${esc(c.carpeta)}" placeholder="C:\\Users\\…">`)}
        ${fila('Carpeta de datos', 'Configuración, sesiones, memoria, tareas y registros.', `<input readonly class="mono" value="${esc(c.dir)}">`)}</div>
      <div class="flex" style="margin-top:12px;justify-content:flex-end"><button class="btn pri" id="g">${tr('Guardar')}</button></div>
      <div class="seccion">${tr('Sesión del panel')}</div>
      <div class="caja">${fila('Cerrar sesión', 'Borra el token de este navegador.', `<button class="btn mal" id="salir">${ic('salir')}${tr('Cerrar sesión')}</button>`)}</div></div>`;
    $('#g').onclick = () => guardarConfig({ maxPasos: +$('#mp').value, carpeta: $('#cp').value });
    $('#salir').onclick = () => { guardarLocal('token', ''); TOKEN = ''; flujoGlobal?.abort(); pantallaLogin(); };
  },
};

// ---------- Importar: migración desde OpenClaw u otro asistente (robot-migracion/1) ----------
VISTAS['ajustes/importar'] = {
  claves: 'importar migrar migracion openclaw soul memoria user automatizaciones cron agentes skills',
  datos: null, res: null,
  async pintar(v) {
    const hist = await api('GET', '/importar').catch(() => []);
    const d = this.datos, r = this.res;
    const n = x => (Array.isArray(x) ? x.length : x ? Object.keys(x).length : 0);
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Importar', 'Trae la memoria, el SOUL, las automatizaciones, los agentes y las skills de otro asistente (OpenClaw). Pídele que genere <code>robot-migracion.json</code> y suéltalo aquí.')}
      <label class="caja pad" id="zona" style="display:block;text-align:center;border-style:dashed;cursor:pointer;padding:34px 16px">
        ${ic('abajo')}<div style="margin-top:8px"><b>${tr('Suelta aquí robot-migracion.json')}</b><br><small class="tenue">${tr('o haz clic para elegirlo · máx. 8 MB · las claves y contraseñas se tapan solas')}</small></div>
        <input type="file" id="arch" accept=".json,application/json" hidden></label>
      ${d ? `<div class="seccion">${tr('Qué trae')} <span class="n">${esc(d.origen || tr('externo'))}</span></div>
        <div class="caja">${[
          ['Archivos (memoria, SOUL, USER…)', n(d.archivos), 'Se guardan tal cual. SOUL → identidad, USER → contexto; de la memoria se sacan recuerdos con el modelo del cerebro.'],
          ['Automatizaciones', n(d.automatizaciones), 'Se crean PAUSADAS: revísalas y actívalas en Automatizaciones (ejecutan herramientas).'],
          ['Agentes', n(d.agentes), 'Plantillas de subagente: el robot las usa con "delegar".'],
          ['Skills', n(d.skills), 'Se guardan; de momento no se usan solas.'],
        ].map(([t, c, s]) => fila(`${tr(t)} · ${c}`, s, '')).join('')}</div>
        ${d.notas ? `<p class="seccion-ayuda">${tr('Notas del exportador:')} ${esc(String(d.notas).slice(0, 400))}</p>` : ''}
        <div class="flex" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="cancelar">${tr('Cancelar')}</button><button class="btn pri" id="go">${ic('check')}${tr('Importar')}</button></div>` : ''}
      ${r ? `<div class="seccion">${tr('Resultado')}</div><div class="caja pad">
        <p>✅ ${tr('Personalidad')}: ${r.personalidad.length ? r.personalidad.join(', ') : tr('sin cambios')} · ${tr('Recuerdos: {a} nuevos, {b} actualizados', { a: r.creados, b: r.actualizados })}${r.rechazados ? `, ${tr('{n} rechazados (secretos/inválidos)', { n: r.rechazados })}` : ''}</p>
        <p>⏸️ ${tr('Automatizaciones creadas en pausa:')} ${r.tareas.length}${r.tareas.length ? ` — <a href="#/auto">${tr('revisarlas')}</a>` : ''} · 🤖 ${tr('Agentes')}: ${r.agentes.join(', ') || '0'} · 📚 Skills: ${r.skills.length}</p>
        ${r.identidad ? `<p class="tenue">${tr('Identidad detectada:')} ${esc(r.identidad)}</p>` : ''}
        ${r.errores.length ? `<p class="mal-txt">${r.errores.map(esc).join('<br>')}</p>` : ''}
        <small class="tenue mono">${tr('Copia exacta en {x}', { x: esc(r.backup) })}</small></div>` : ''}
      <div class="seccion">${tr('Importaciones anteriores')} <span class="n">${hist.length}</span></div>
      <div class="caja">${hist.length ? hist.slice(0, 10).map(h => fila(`${esc(h.origen)} · ${esc(String(h.backup).split(/[\\/]/).pop())}`, tr('{a} recuerdos · {b} automatizaciones · {c} agentes', { a: h.creados ?? '?', b: h.tareas?.length ?? 0, c: h.agentes?.length ?? 0 }), '')).join('') : vacio('abajo', 'Todavía no has importado nada.')}</div></div>`;
    const leerArchivo = async f => {
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return aviso(tr('Demasiado grande (máx. 8 MB)'), true);
      try {
        const j = JSON.parse(await f.text());
        if (!j.archivos && !j.automatizaciones && !j.agentes && !j.skills) throw new Error(tr('no parece un robot-migracion.json'));
        this.datos = j; this.res = null; this.pintar(v);
      } catch (e) { aviso(tr('No pude leerlo: {x}', { x: e.message }), true); }
    };
    $('#arch').onchange = e => leerArchivo(e.target.files[0]);
    const z = $('#zona');
    z.ondragover = e => { e.preventDefault(); z.style.borderColor = 'var(--acento)'; };
    z.ondragleave = () => { z.style.borderColor = ''; };
    z.ondrop = e => { e.preventDefault(); z.style.borderColor = ''; leerArchivo(e.dataTransfer.files[0]); };
    if ($('#cancelar')) $('#cancelar').onclick = () => { this.datos = null; this.pintar(v); };
    if ($('#go')) $('#go').onclick = async () => {
      const b = $('#go'); b.disabled = true; b.textContent = tr('Importando… (el modelo lee la memoria, puede tardar)');
      try { this.res = await api('POST', '/importar', this.datos); this.datos = null; aviso(tr('Importado')); }
      catch (e) { aviso(e.message, true); }
      this.pintar(v);
    };
  },
};

// ---------- Correo y servicios (conectores de la app: varias cuentas de correo, GitHub, Hugging Face, ElevenLabs) ----------
const SERV = {
  github: ['GitHub', 'Notificaciones, repos, issues y PRs. Crear o comentar pide permiso.', 'https://github.com/settings/tokens?type=beta', 'Token personal (github_pat_… o ghp_…)'],
  huggingface: ['Hugging Face', 'Buscar modelos, datasets y spaces.', 'https://huggingface.co/settings/tokens', 'Token de acceso (hf_…)'],
  elevenlabs: ['ElevenLabs', 'Voces y generar audio (gasta créditos: pide permiso).', 'https://elevenlabs.io/app/settings/api-keys', 'API key'],
};
VISTAS['ajustes/conexiones'] = {
  claves: 'correo email gmail outlook hotmail yahoo icloud imap smtp github hugging face elevenlabs token cuentas',
  async pintar(v) {
    const d = await api('GET', '/conectores').catch(e => ({ error: e.message }));
    if (d.error) { v.innerHTML = `<div class="pagina estrecha">${cabecera('Correo y servicios', '')}<div class="caja pad mal-txt">${esc(d.error)}</div></div>`; return; }
    const cuenta = c => `<div class="fila-a" data-c="${esc(c.id)}"><div class="t"><b>${esc(c.email)}</b><small>${esc(c.proveedor)}${c.nombre ? ' · ' + esc(c.nombre) : ''}${c.error ? ` · <span class="mal-txt">${esc(c.error)}</span>` : ''}${String(c.auth).startsWith('oauth') ? ' · OAuth' : ` · ${tr('contraseña de aplicación')}`}</small><div class="lista tenue" style="font-size:11.5px;margin-top:4px"></div></div>
      <div class="c"><label class="tenue" style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-av="${esc(c.id)}" ${c.avisos ? 'checked' : ''}>${tr('avisos')}</label><button class="btn mini" data-x="probar">${tr('Probar')}</button>${String(c.auth).startsWith('oauth') ? `<button class="btn mini" data-x="reconectar">${tr('Reconectar')}</button>` : ''}<button class="btn mini mal" data-x="quitar">${tr('Quitar')}</button></div></div>`;
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Correo y servicios', tr('Conecta todas tus cuentas. Las contraseñas y tokens se guardan cifrados en este equipo.') + (d.cifrado ? '' : ' ' + tr('(sin cifrado del sistema disponible)')), `<div class="flex"><button class="btn pri" id="oaG">${tr('Conectar con Google')}</button><button class="btn pri" id="oaM">${tr('Conectar con Microsoft')}</button><button class="btn" id="masCorreo">${ic('mas')}${tr('Otro correo')}</button></div>`)}
      <div class="seccion">${tr('Correo')} <span class="n">${d.cuentas.length}</span></div>
      <p class="seccion-ayuda">${tr('Lee y resume tus correos, te avisa de lo importante con tarjetas y prepara respuestas. <b>Nunca envía nada sin que lo apruebes.</b>')}</p>
      <div class="caja">${d.cuentas.map(cuenta).join('') || `<div class="tenue" style="padding:14px 16px">${tr('Ninguna cuenta todavía. Gmail y Outlook/Hotmail: botón Conectar (inicias sesión en el navegador). Yahoo, iCloud o tu dominio: Otro correo.')}</div>`}</div>
      <div class="seccion">${tr('Servicios')}</div>
      <div class="caja">${Object.entries(SERV).map(([k, [n, desc, url]]) => { const s = d.servicios[k] || {}; return `<div class="fila-a" data-s="${k}"><div class="t"><b>${n}</b><small>${tr(desc)} ${s.conectado ? `· <span class="ok-txt">✓ ${esc(s.quien)}</span>` : `· <a href="${url}" target="_blank" rel="noopener">${tr('conseguir token')}</a>`}</small></div>
        <div class="c">${s.conectado ? `<button class="btn mini" data-x="sprobar">${tr('Probar')}</button><button class="btn mini mal" data-x="squitar">${tr('Desconectar')}</button>` : `<button class="btn mini pri" data-x="sconectar">${tr('Conectar')}</button>`}</div></div>`; }).join('')}</div>
      <div class="seccion">${tr('Credenciales OAuth')}</div><p class="seccion-ayuda">${tr('Las apps registradas en Google y Microsoft que usan los botones Conectar. Se hace una vez (guía: docs/oauth.md).')}</p>
      <div class="caja">${fila('Google', d.oauth.google ? `<span class="ok-txt">✓ ${tr('configurado')}</span>` : 'Client ID y secreto de una app OAuth de tipo "Escritorio" en Google Cloud.', `<input id="gId" class="mono" placeholder="client ID"><input id="gSec" class="mono" type="password" placeholder="client secret">`)}
        ${fila('Microsoft', d.oauth.microsoft ? `<span class="ok-txt">✓ ${tr('configurado')}</span>` : 'Application (client) ID de una app en Entra/Azure con flujos públicos y redirect http://localhost.', `<input id="mId" class="mono" placeholder="application (client) ID">`)}
        <div style="padding:10px 16px;text-align:right"><button class="btn" id="gOa">${tr('Guardar credenciales')}</button></div></div></div>`;

    const recargar = () => this.pintar(v);
    $('#gOa').onclick = async () => {
      await api('PATCH', '/conectores/config', { oauth: { google: { clientId: $('#gId').value, clientSecret: $('#gSec').value }, microsoft: { clientId: $('#mId').value } } });
      aviso(tr('Credenciales guardadas')); recargar();
    };
    const conectar = async p => {
      const x = await api('POST', '/conectores/oauth/' + p, {}).catch(e => ({ error: e.message }));
      if (x.error) return aviso(x.error, true);
      await this.esperarOAuth(x.id, x.url, p); recargar();
    };
    $('#oaG').onclick = () => conectar('google');
    $('#oaM').onclick = () => conectar('microsoft');
    $('#masCorreo').onclick = async () => {
      const r = await modal({ titulo: 'Otro correo (contraseña de aplicación)', ancho: 520,
        cuerpo: `<div class="campo">${tr('Correo')}<input id="ce" type="email" placeholder="tu@yahoo.com" autocomplete="off"></div>
          <div class="campo" id="cpW">${tr('Contraseña de aplicación')}<input id="cp" type="password" autocomplete="new-password" placeholder="${tr('NO tu contraseña normal: una de aplicación')}"></div>
          <small class="tenue">${tr('Yahoo: Seguridad → contraseña de aplicación · iCloud: appleid.apple.com → Contraseñas de apps · Gmail también vale (myaccount.google.com/apppasswords), aunque es mejor Conectar con Google.')}</small>
          <details style="margin-top:10px"><summary class="tenue">${tr('Servidor propio (dominio)')}</summary>
            <div class="campo">IMAP<input id="ci" class="mono" placeholder="imap.tudominio.com:993"></div><div class="campo">SMTP<input id="cs" class="mono" placeholder="smtp.tudominio.com:465"></div>
            <div class="campo">${tr('Usuario (si no es el correo)')}<input id="cu" autocomplete="off"></div></details>`,
        alAbrir: m => m.querySelector('#ce').focus(),
        botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Conectar', cls: 'pri', valor: m => {
          const hp = (s, def) => { const [host, port] = String(s || '').trim().split(':'); if (!host) return undefined; const pt = +port || def; return { host, port: pt, secure: pt !== 587 }; };
          return { email: m.querySelector('#ce').value.trim(), password: m.querySelector('#cp').value, imap: hp(m.querySelector('#ci').value, 993), smtp: hp(m.querySelector('#cs').value, 465), usuario: m.querySelector('#cu').value.trim() };
        } }] });
      if (!r || !r.email) return;
      aviso(tr('Conectando…'));
      const x = await api('POST', '/conectores/correo', r).catch(e => ({ error: e.message }));
      if (x.error) return aviso(x.error, true);
      aviso(tr('✓ Conectado: {a} mensajes, {b} sin leer', { a: x.mensajes, b: x.noLeidos }));
      recargar();
    };
    v.onclick = async e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      const fc = b.closest('[data-c]'), fsv = b.closest('[data-s]');
      if (fc) {
        const id = fc.dataset.c;
        if (b.dataset.x === 'quitar') { if (await modal({ titulo: 'Quitar cuenta', cuerpo: tr('Se borra de este equipo (tu correo no se toca).'), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Quitar', cls: 'mal', valor: true }] })) { await api('DELETE', `/conectores/correo/${id}`); recargar(); } return; }
        if (b.dataset.x === 'reconectar') { const x = await api('POST', `/conectores/correo/${id}/reconectar`).catch(er => ({ error: er.message })); if (x.error) return aviso(x.error, true); await this.esperarOAuth(x.id, x.url); return recargar(); }
        b.disabled = true; const r = await api('POST', `/conectores/correo/${id}/probar`).catch(er => ({ error: er.message })); b.disabled = false;
        $('.lista', fc).innerHTML = r.error ? `<span class="mal-txt">✗ ${esc(r.error)}</span>` : `<span class="ok-txt">✓ ${tr('{a} mensajes · {b} sin leer', { a: r.mensajes, b: r.noLeidos })}</span>`;
        return;
      }
      if (fsv) {
        const k = fsv.dataset.s, [n, , url, ph] = SERV[k];
        if (b.dataset.x === 'squitar') { await api('DELETE', `/conectores/servicio/${k}`); return recargar(); }
        if (b.dataset.x === 'sprobar') { const r = await api('POST', `/conectores/servicio/${k}/probar`).catch(er => ({ error: er.message })); return aviso(r.error || `✓ ${r.quien}`, !!r.error); }
        const t = await modal({ titulo: tr('Conectar {x}', { x: n }), cuerpo: `<div class="campo">${esc(tr(ph))}<input id="st" type="password" autocomplete="off"></div><small class="tenue">${tr('Consíguelo en {u}. Se guarda cifrado en este equipo.', { u: `<a href="${url}" target="_blank" rel="noopener">${esc(url.replace(/^https:\/\//, ''))}</a>` })}</small>`,
          alAbrir: m => m.querySelector('#st').focus(), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Conectar', cls: 'pri', valor: m => m.querySelector('#st').value.trim() || false }] });
        if (!t) return;
        const r = await api('PUT', `/conectores/servicio/${k}`, { token: t }).catch(er => ({ error: er.message }));
        aviso(r.error || tr('✓ {x} conectado: {q}', { x: n, q: r.quien }), !!r.error); recargar();
      }
    };
    v.onchange = async e => {
      const id = e.target.dataset?.av; if (!id) return;
      await api('PATCH', `/conectores/correo/${id}`, { avisos: e.target.checked }); aviso(tr(e.target.checked ? 'Avisos activados' : 'Avisos desactivados'));
    };
  },
  // OAuth: el navegador ya se abrió en el equipo; esperamos a que vuelva
  async esperarOAuth(id, url, p) {
    modal({ titulo: p === 'microsoft' ? 'Inicia sesión con Microsoft' : p === 'google' ? 'Inicia sesión con Google' : 'Inicia sesión', cuerpo: `<p>${tr('Se abrió tu navegador para que inicies sesión y des permiso a APOLO.')}</p><p class="tenue" style="font-size:12px">${tr('¿No se abrió?')} <a href="${esc(url)}" target="_blank" rel="noopener">${tr('Ábrelo aquí')}</a>.</p><p id="oaEst">${tr('Esperando…')}</p>`, botones: [{ txt: 'Cerrar', valor: null }] });
    for (let i = 0; i < 200; i++) {
      await new Promise(ok => setTimeout(ok, 2500));
      const el = document.getElementById('oaEst'); if (!el) break;
      const f = await api('GET', '/conectores/oauth/flujo/' + id).catch(() => null);
      if (f?.estado === 'conectado') { el.innerHTML = `<span class="ok-txt">✓ ${tr('{x} conectado. Ya puedes cerrar.', { x: esc(f.email) })}</span>`; aviso(tr('✓ {x} conectado', { x: f.email })); break; }
      if (f?.estado === 'error') { el.innerHTML = `<span class="mal-txt">✗ ${esc(f.error || 'error')}</span>`; break; }
    }
  },
};
