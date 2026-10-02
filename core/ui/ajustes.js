// Robot Companion · panel — Configuración (modo aparte con su propia navegación y buscador).
'use strict';
AJUSTES.push(
  ['General', [['apariencia', 'Apariencia', 'paleta'], ['acerca', 'Acerca de', 'info']]],
  ['Conexiones', [['nucleo', 'Núcleo', 'cpu'], ['canales', 'Canales', 'enchufe']]],
  ['Agente', [['personalidad', 'Personalidad', 'persona'], ['modelos', 'Modelos', 'chispa'], ['herramientas', 'Herramientas', 'llaveinglesa'], ['cerebro', 'Cerebro', 'cerebro']]],
  ['Privacidad y seguridad', [['permisos', 'Permisos', 'escudo'], ['aprobaciones', 'Aprobaciones', 'check'], ['claves', 'Claves de API', 'llave']]],
  ['Sistema', [['importar', 'Importar (OpenClaw…)', 'abajo'], ['registros', 'Registros', 'lista'], ['avanzado', 'Avanzado', 'terminal']]],
);
async function guardarConfig(cambios, msg = 'Guardado') {
  try { E.config = await api('PATCH', '/config', cambios); aviso(msg); return true; } catch (e) { aviso(e.message, true); return false; }
}

// ---------- Apariencia ----------
VISTAS['ajustes/apariencia'] = {
  claves: 'tema color modo oscuro claro acento',
  pintar(v) {
    const t = leerLocal('tema', { tema: 'casco', modo: 'oscuro', acento: null });
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Apariencia', 'Tema, color y modo del panel. Se guarda en este navegador.')}
      <div class="seccion">Tema</div><div class="caja pad"><div class="temas">${Object.entries(TEMAS).map(([k, [n, c]]) => `<button data-tema="${k}" class="${t.tema === k ? 'on' : ''}"><i style="background:${c}"></i><i style="background:#2a313a"></i>${n}</button>`).join('')}</div></div>
      <div class="seccion">Modo de color</div><div class="caja">${fila('Modo', 'Sistema sigue el ajuste de tu equipo.', seg('modo', [['sistema', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']], t.modo))}</div>
      <div class="seccion">Color de acento</div><div class="caja pad"><div class="colores">${ACENTOS.map(c => `<button data-ac="${c}" style="background:${c}" class="${(t.acento || TEMAS[t.tema][1]) === c ? 'on' : ''}" title="${c}"></button>`).join('')}
        <button data-ac="" title="El del tema" style="background:conic-gradient(#2bdc7c,#5ab0ff,#ff5fa2,#f5a524,#2bdc7c)"></button></div></div>
      <div class="seccion">Vista previa</div><div class="caja pad"><div class="m-ia">${avatar(E.config.modeloPorDefecto)}<div class="cont"><div class="quien"><b>${esc(nombreModelo(E.config.modeloPorDefecto))}</b></div><div class="md"><p>Así se verán las respuestas. <b>Negritas</b>, <code>código</code> y listas:</p><ul><li>Uno</li><li>Dos</li></ul></div></div></div></div></div>`;
    const set = cambio => { guardarLocal('tema', { ...leerLocal('tema', t), ...cambio }); aplicarTema(); this.pintar(v); };
    v.onclick = e => {
      const tm = e.target.closest('[data-tema]'); if (tm) return set({ tema: tm.dataset.tema, acento: null });
      const ac = e.target.closest('[data-ac]'); if (ac) return set({ acento: ac.dataset.ac || null });
    };
    enlazarControles(v, (id, val) => { if (id === 'modo') set({ modo: val }); });
  },
};

// ---------- Acerca de ----------
VISTAS['ajustes/acerca'] = {
  async pintar(v) {
    const s = await api('GET', '/sistema');
    v.innerHTML = `<div class="pagina estrecha" style="text-align:center">${cabecera('Acerca de', '')}
      <div class="robot-acerca" id="robotAcerca" title="Tócame">${casco('casco-grande')}</div>
      <h2 style="margin:12px 0 2px;font-size:24px">Robot Companion</h2><p class="suave" style="margin:0">Tu asistente personal, en tu equipo, con el modelo que tú elijas.</p>
      <div class="flex" style="justify-content:center;margin:14px 0 26px"><span class="chip acento">núcleo v${esc(E.estado.version)}</span><span class="chip">Licencia MIT</span><span class="chip">Código abierto</span></div>
      <div class="caja" style="text-align:left">${fila('Equipo', '', `<span class="mono">${esc(s.host)}</span>`)}${fila('Sistema', '', esc(s.so))}${fila('Node.js', '', esc(s.node))}${fila('Datos', '', `<span class="mono" style="word-break:break-all">${esc(s.datos)}</span>`)}</div>
      <p class="tenue" style="margin-top:22px;font-size:12px">Hecho a mano, desde cero. © ${new Date().getFullYear()}</p></div>`;
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
      <div class="seccion">Conexión <span class="chip ok" style="margin-left:auto"><span class="punto ok"></span>Conectado</span></div>
      <div class="caja">${fila('Dirección', 'API HTTP + eventos en vivo (SSE). Solo escucha en este equipo.', `<input readonly class="mono" value="${esc(url)}/v1">`)}
        ${fila('Token', 'Cualquier programa con este token controla el núcleo. No lo compartas.', `<input readonly type="password" value="${esc(TOKEN)}"><button class="btn icono" data-copiar="${esc(TOKEN)}" title="Copiar">${ic('copiar')}</button>`)}
        ${fila('Abrir en otro navegador', 'Enlace con el token incluido (se borra de la barra al abrir).', `<button class="btn" data-copiar="${esc(url)}/#token=${esc(TOKEN)}">${ic('enlace')}Copiar enlace</button>`)}</div>
      <div class="seccion">Equipo anfitrión <span class="chip" style="margin-left:auto">encendido ${duracion(s.encendidoSeg)}</span></div>
      <div class="caja pad" id="host"></div></div>`;
    const pintarHost = async () => {
      const x = await api('GET', '/sistema').catch(() => null); const el = $('#host'); if (!x || !el) return;
      const m = 1 - x.memoria.libre / x.memoria.total, d = x.disco ? 1 - x.disco.libre / x.disco.total : 0;
      const col = (t, p, a, b) => `<div><small class="tenue">${t}</small><b style="display:block;font-size:20px">${Math.round(p * 100)}%</b><div class="medidor ${p > .9 ? 'mal' : p > .75 ? 'aviso' : ''}"><i style="width:${p * 100}%"></i></div><small class="tenue">${a}</small><br><small class="tenue">${b}</small></div>`;
      el.innerHTML = `<div class="flex" style="margin-bottom:14px"><span class="av" style="background:var(--capa-3);color:var(--acento)">${ic('monitor')}</span><div class="crece"><b>${esc(x.host)}</b><br><small class="tenue">${esc(x.so)} · ${esc(x.arquitectura)} · Node ${esc(x.node)} · PID ${x.pid} · ${esc(x.ips.join(', '))}</small></div></div>
        <div class="rejilla" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px">${col('CPU', x.cpu.uso, `${x.cpu.nucleos} núcleos`, esc(x.cpu.modelo))}${col('Memoria', m, `${fmtB(x.memoria.total - x.memoria.libre)} usados`, `${fmtB(x.memoria.libre)} libres de ${fmtB(x.memoria.total)}`)}
        ${x.disco ? col(`Disco ${esc(x.disco.ruta)}`, d, `${fmtB(x.disco.total - x.disco.libre)} usados`, `${fmtB(x.disco.libre)} libres de ${fmtB(x.disco.total)}`) : ''}</div>`;
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
    const futuros = [['telegram', 'Telegram', 'Bot oficial: háblale desde el móvil.'], ['whatsapp', 'WhatsApp', 'Mensajes desde WhatsApp.'], ['correo', 'Correo', 'Lee y redacta correos.']];
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Canales', 'Por dónde puedes hablar con el robot. Todos comparten memoria, permisos y modelos.', `<button class="btn" id="rec">${ic('recargar')}Actualizar</button>`)}
      <div class="seccion">Conectados <span class="n">${l.filter(c => c.estado === 'activo').length}</span></div>
      <div class="caja">${l.map(c => fila(`<span class="flex">${ic(ICONO_CANAL[c.tipo] || 'enlace')}${esc(c.nombre)}</span>`, esc(c.detalle || ''),
        `<span class="chip ${c.estado === 'activo' ? 'ok' : c.estado === 'respaldo' ? 'aviso' : ''}"><span class="punto ${c.estado === 'activo' ? 'ok' : c.estado === 'respaldo' ? 'aviso' : ''}"></span>${esc(c.estado)}</span>`)).join('')}</div>
      <div class="seccion">Próximamente</div>
      <div class="caja">${futuros.map(([k, n, d]) => fila(`<span class="flex">${ic(k === 'correo' ? 'archivo' : 'enviar')}${n}</span>`, d, '<span class="chip">en camino</span>')).join('')}</div>
      <div class="seccion">Conectar otros agentes (MCP)</div>
      <p class="seccion-ayuda">Antigravity, Cursor, Claude Desktop, Claude Code… pueden usar al robot: avisarte, pedirte permiso por tus canales, la memoria y las tareas. Añade esto a su configuración MCP (cambia la ruta si instalaste en otra carpeta):</p>
      <div class="bloque-cod"><header><span>mcp_config.json</span><button class="btn fantasma mini" data-copiar>${ic('copiar')}Copiar</button></header><pre><code>${esc(JSON.stringify({ mcpServers: { 'robot-companion': { command: 'node', args: ['D:/RobotCompanion/core/mcp.js'], env: { ROBOT_MCP_ORIGEN: 'Antigravity' } } } }, null, 2))}</code></pre></div>
      <p class="tenue" style="font-size:12px;margin-top:14px">Desde cualquier canal: <code>gemma: mensaje</code> manda a un modelo concreto · <code>usa gpt</code> cambia el modelo por defecto de ese canal · <code>usa claude code</code> vuelve a Claude Code.</p></div>`;
    $('#rec').onclick = () => this.pintar(v);
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
      <div class="pestanas">${l.map(x => `<button data-a="${x.id}" class="${x.id === a.id ? 'on' : ''}">${ic(x.id === 'identidad' ? 'persona' : x.id === 'instrucciones' ? 'lista' : 'carpeta')}${esc(x.titulo)}</button>`).join('')}</div>
      <div class="flex" style="margin-bottom:10px"><div class="crece"><b>${esc(a.titulo)}</b> <span class="tenue">— ${esc(a.ayuda)}</span><br><small class="tenue mono">${esc(a.ruta)}</small></div>
        <button class="btn" id="prev">${ic('ojo')}${this.vista ? 'Editar' : 'Vista previa'}</button><button class="btn" id="rest">Restablecer</button><button class="btn pri" id="guardar">Guardar</button></div>
      ${this.vista ? `<div class="caja pad md" style="min-height:420px">${md(a.contenido)}</div>` : `<textarea class="editor" id="ed" spellcheck="false">${esc(a.contenido)}</textarea>`}
      <small class="tenue" id="cuenta"></small></div>`;
    const ed = $('#ed');
    const cuenta = () => { if (ed) $('#cuenta').textContent = `${ed.value.length.toLocaleString('es')} / 20.000 caracteres`; };
    if (ed) { ed.oninput = () => { a.contenido = ed.value; cuenta(); }; cuenta(); ed.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('#guardar').click(); } }; }
    $('.pestanas', v).onclick = e => { const b = e.target.closest('[data-a]'); if (b) { this.actual = b.dataset.a; this.vista = false; this.pintar(v); } };
    $('#prev').onclick = () => { this.vista = !this.vista; this.pintar(v); };
    $('#guardar').onclick = async () => { try { await api('PUT', `/personalidad/${a.id}`, { contenido: ed ? ed.value : a.contenido }); aviso('Guardado. Se aplica desde el siguiente mensaje.'); } catch (e) { aviso(e.message, true); } };
    $('#rest').onclick = async () => { if (await confirmar('Restablecer', `“${a.titulo}” volverá al texto original.`, true)) { await api('POST', `/personalidad/${a.id}/restablecer`); this.pintar(v); } };
  },
};

// ---------- Modelos ----------
VISTAS['ajustes/modelos'] = {
  claves: 'proveedor ollama openai anthropic gemini openrouter alias atajo por defecto',
  async pintar(v) {
    const c = E.config = await api('GET', '/config');
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Modelos', 'Conecta cualquier proveedor. Las claves se guardan en este equipo y nunca se muestran.', `<button class="btn" id="anadir">${ic('mas')}Añadir proveedor</button>`)}
      <div class="seccion">Por defecto</div>
      <div class="caja">${fila('Modelo por defecto', 'Se usa en conversaciones nuevas, tareas y canales sin modelo elegido. Formato <code>proveedor/modelo</code>.', `<input id="defM" class="mono" list="dlM" value="${esc(c.modeloPorDefecto)}"><datalist id="dlM">${modelosConocidos().map(m => `<option value="${esc(m)}">`).join('')}</datalist><button class="btn pri" id="gDef">Guardar</button>`)}</div>
      <div class="seccion">Atajos <span class="n">${Object.keys(c.alias).length}</span></div><p class="seccion-ayuda">Escribe <code>atajo: mensaje</code> en la isla, Discord o voz para hablar con ese modelo.</p>
      <div class="caja" id="alias">${Object.entries(c.alias).map(([a, m]) => this.filaAlias(a, m)).join('')}</div>
      <div class="flex" style="margin-top:8px"><button class="btn" id="masAlias">${ic('mas')}Atajo</button><button class="btn pri" id="gAlias">Guardar atajos</button></div>
      <div class="seccion">Proveedores <span class="n">${Object.keys(c.proveedores).length}</span></div>
      <div class="caja">${Object.entries(c.proveedores).map(([k, p]) => {
        const listo = p.tipo === 'claude-cli' || p.local || p.tieneKey;
        return `<div class="fila-a" data-p="${esc(k)}">${avatar(k + '/')}<div class="t"><b>${esc(k)}</b><small>${p.tipo === 'claude-cli' ? 'CLI de Claude Code instalada en este equipo' : `${esc(p.tipo)} · ${esc(p.baseUrl || '')}`}</small><div class="lista tenue" style="font-size:11.5px;margin-top:4px"></div></div>
          <div class="c"><span class="chip ${listo ? 'ok' : ''}">${p.tipo === 'claude-cli' ? 'CLI' : p.local ? 'local' : p.tieneKey ? (p.keyDeEntorno ? 'key (entorno)' : 'key guardada') : 'sin key'}</span>
          <button class="btn mini" data-x="probar">Probar</button>${p.tipo !== 'claude-cli' ? `<button class="btn mini" data-x="editar">${ic('editar')}</button>` : ''}</div></div>`;
      }).join('')}</div></div>`;
    $('#gDef').onclick = () => guardarConfig({ modeloPorDefecto: $('#defM').value.trim() });
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
      b.disabled = true; b.textContent = 'Probando…';
      const r = await api('GET', `/proveedores/${k}/modelos`).catch(er => ({ ok: false, error: er.message }));
      b.disabled = false; b.textContent = 'Probar';
      $('.lista', f).innerHTML = r.ok ? `<span class="ok-txt">✓ ${r.modelos.length} modelos</span> · ${r.modelos.slice(0, 40).map(m => `<code>${esc(m)}</code>`).join(' ')}${r.modelos.length > 40 ? ' …' : ''}` : `<span class="mal-txt">✗ ${esc(r.error)}</span>`;
    };
  },
  filaAlias: (a, m) => `<div class="fila-a"><input class="a" placeholder="atajo" value="${esc(a)}" style="width:150px"><span class="tenue">→</span><input class="m mono crece" placeholder="proveedor/modelo" value="${esc(m)}"><button class="btn fantasma icono" data-x="quitar">${ic('x')}</button></div>`,
  async proveedor(v, k) {
    const p = k ? E.config.proveedores[k] : null;
    const r = await modal({
      titulo: k ? `Proveedor · ${k}` : 'Añadir proveedor',
      cuerpo: `${k ? '' : `<div class="campo">Nombre (sin espacios)<input id="pn" placeholder="groq"></div><div class="campo">Tipo ${seg('tipo', [['openai', 'Compatible OpenAI'], ['anthropic', 'Anthropic'], ['gemini', 'Gemini']], 'openai')}</div>`}
        <div class="campo">URL base<input id="pu" class="mono" value="${esc(p?.baseUrl || '')}" placeholder="https://api.groq.com/openai/v1"></div>
        ${p?.local ? '' : `<div class="campo">API key<input id="pk" type="password" autocomplete="off" placeholder="${p?.tieneKey ? '•••••••• guardada — escribe para cambiarla' : 'pega tu clave'}"></div>`}
        <small class="tenue">Groq, DeepSeek, Mistral, LM Studio, vLLM, Together… cualquiera con API tipo OpenAI funciona.</small>`,
      botones: [...(k && !['openai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'claudecode'].includes(k) ? [{ txt: 'Eliminar', cls: 'mal', valor: 'borrar' }] : []), { txt: 'Cancelar', valor: null }, {
        txt: 'Guardar', cls: 'pri', valor: m => {
          const nombre = k || $('#pn', m).value.trim().toLowerCase();
          if (!/^[\w-]+$/.test(nombre)) { aviso('Nombre no válido', true); return false; }
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
      <div class="flex" style="margin-top:12px"><span class="crece ${c.gastaPlan ? 'aviso-txt' : 'ok-txt'}">${c.gastaPlan ? '⚠ Usa modelos de tu plan de Claude: cada aviso gasta un poco.' : '✓ No gasta tu plan de Claude.'}</span><button class="btn pri" id="g">Guardar</button></div>
      <p class="tenue" style="font-size:12px;margin-top:14px">Usa <code>proveedor/modelo</code> (cualquiera de Modelos). <code>haiku</code> o <code>sonnet</code> a secas usan Claude Code como antes.</p></div>`;
    $('#g').onclick = async () => {
      try { await api('PATCH', '/cerebro', { modelo: $('#cm').value, modeloResumen: $('#cr').value, resumenHora: +$('#ch').value }); aviso('Guardado'); this.pintar(v); } catch (e) { aviso(e.message, true); }
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
        `${esc(h.descripcion.slice(0, 190))}${h.descripcion.length > 190 ? '…' : ''}`, `<span class="chip ${RIESGO[h.riesgo][0]}">${RIESGO[h.riesgo][1]}</span>${sw(h.nombre, h.activa)}`)).join('')}</div>
      <p class="tenue" style="font-size:12px;margin-top:12px">Las que escriben o ejecutan piden permiso según tu modo en <a href="#/ajustes/permisos">Permisos</a>.</p></div>`;
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
        ${fila('Dónde te pregunta', 'Tarjeta en este panel, isla del escritorio, Stream Deck y Discord (si no estás en el PC).', '<span class="chip ok">todos los canales</span>')}</div>
      <div class="seccion">Reglas “Siempre” <span class="n">${reglas.length}</span></div><p class="seccion-ayuda">Se crean al pulsar <b>Siempre</b> en un permiso. Quítalas para que vuelva a preguntar.</p>
      <div class="caja tabla-env">${reglas.length ? `<table class="tabla"><tr><th>Herramienta</th><th>Aplica a</th><th></th></tr>${reglas.map((r, i) => `<tr><td><span class="flex">${ic(ICONO_HERR[r.herramienta] || 'llaveinglesa')}${esc(NOMBRE_HERR[r.herramienta] || r.herramienta)}</span></td><td class="mono">${esc(r.herramienta === 'shell' ? `${r.prefijo} …` : r.prefijo === '*' ? 'todo' : r.prefijo)}</td><td class="der"><button class="btn mini mal" data-i="${i}">Quitar</button></td></tr>`).join('')}</table>` : vacio('escudo', 'Sin reglas permanentes.')}</div></div>`;
    enlazarControles(v, (id, val) => { if (id === 'modo') guardarConfig({ permisos: { modo: val } }, val === 'auto' ? 'Automático: solo preguntará lo peligroso' : 'Guardado'); });
    v.onclick = async e => { const b = e.target.closest('[data-i]'); if (b) { await api('DELETE', `/reglas/${b.dataset.i}`); aviso('Regla quitada'); this.pintar(v); } };
  },
};

// ---------- Aprobaciones ----------
VISTAS['ajustes/aprobaciones'] = {
  claves: 'historial permitido denegado',
  async pintar(v) {
    const l = await api('GET', '/aprobaciones');
    const D = { allow: ['ok', 'Permitido'], always: ['ok', 'Siempre'], deny: ['mal', 'Denegado'] };
    v.innerHTML = `<div class="pagina">${cabecera('Aprobaciones', 'Historial de permisos de los últimos 30 días: qué pidió el robot y qué respondiste.')}
      <div class="caja tabla-env">${l.length ? `<table class="tabla"><tr><th>Cuándo</th><th>Herramienta</th><th>Solicitud</th><th>Decisión</th><th>Respuesta en</th></tr>
        ${l.map(x => `<tr><td class="suave" style="white-space:nowrap">${fecha(x.t)}</td><td><span class="flex">${ic(ICONO_HERR[x.herramienta] || 'llaveinglesa')}${esc(NOMBRE_HERR[x.herramienta] || x.herramienta)}</span>${x.peligro ? `<span class="chip mal">${esc(x.peligro)}</span>` : ''}</td>
          <td class="mono" style="max-width:420px;word-break:break-all">${esc(x.resumen)}</td><td><span class="chip ${(D[x.decision] || ['', x.decision])[0]}">${(D[x.decision] || ['', x.decision])[1]}</span>${x.motivo && x.decision === 'deny' ? `<br><small class="tenue">${esc(x.motivo)}</small>` : ''}</td><td class="suave">${Math.max(1, Math.round(x.espera / 1000))} s</td></tr>`).join('')}</table>`
        : vacio('check', 'Sin aprobaciones registradas todavía.')}</div></div>`;
  },
};

// ---------- Claves ----------
VISTAS['ajustes/claves'] = {
  claves: 'api key secreto token openai anthropic gemini',
  async pintar(v) {
    const c = E.config = await api('GET', '/config');
    const conKey = Object.entries(c.proveedores).filter(([, p]) => !p.local && p.tipo !== 'claude-cli');
    v.innerHTML = `<div class="pagina">${cabecera('Claves de API', 'Se guardan solo en este equipo (config del núcleo) y nunca se envían al navegador. También puedes usar variables de entorno.')}
      <div class="caja tabla-env"><table class="tabla"><tr><th>Proveedor</th><th>Estado</th><th>Origen</th><th>Variable de entorno</th><th></th></tr>
        ${conKey.map(([k, p]) => `<tr data-k="${esc(k)}"><td><span class="flex">${avatar(k + '/')}<b>${esc(k)}</b></span></td>
          <td>${p.tieneKey ? '<span class="chip ok">configurada</span>' : '<span class="chip">sin clave</span>'}</td><td class="suave">${p.tieneKey ? (p.keyDeEntorno ? 'entorno' : 'config') : '—'}</td>
          <td class="mono tenue">${esc(p.env || '—')}</td><td class="der" style="white-space:nowrap"><button class="btn mini" data-x="poner">${p.tieneKey ? 'Cambiar' : 'Añadir'}</button>${p.tieneKey && !p.keyDeEntorno ? ` <button class="btn mini mal" data-x="quitar">Quitar</button>` : ''}</td></tr>`).join('')}</table></div>
      <p class="tenue" style="font-size:12px;margin-top:12px">${ic('candado')} Las contraseñas y claves también se bloquean en la memoria del robot: nunca las guarda.</p></div>`;
    v.onclick = async e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      const k = b.closest('[data-k]').dataset.k;
      if (b.dataset.x === 'quitar') { if (await confirmar('Quitar clave', `Se borrará la clave de ${k}.`, true) && await guardarConfig({ proveedores: { [k]: { apiKey: '' } } }, 'Clave quitada')) this.pintar(v); return; }
      const key = await modal({ titulo: `Clave de ${k}`, cuerpo: `<div class="campo">API key<input id="kk" type="password" autocomplete="off" placeholder="pega la clave"></div>`, botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: m => $('#kk', m).value.trim() || false }] });
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
      `${seg('nivel', [['todo', 'Todo'], ['aviso', 'Avisos'], ['error', 'Errores']], this.nivel)}<button class="btn" id="pausa">${ic(this.pausa ? 'play' : 'pausa')}${this.pausa ? 'Reanudar' : 'Pausar'}</button>`)}
      <div class="consola" id="con"></div></div>`;
    enlazarControles(v, (id, val) => { if (id === 'nivel') { this.nivel = val; this.pintarLineas(); } });
    $('#pausa').onclick = () => { this.pausa = !this.pausa; this.pintar(v); };
    this.pintarLineas();
  },
  linea: l => `<div><time>${new Date(l.t).toLocaleTimeString('es')}</time><span class="o">${esc(l.origen)}</span><span class="n-${l.nivel}">${esc(l.texto)}</span></div>`,
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
      <div class="flex" style="margin-top:12px;justify-content:flex-end"><button class="btn pri" id="g">Guardar</button></div>
      <div class="seccion">Sesión del panel</div>
      <div class="caja">${fila('Cerrar sesión', 'Borra el token de este navegador.', `<button class="btn mal" id="salir">${ic('salir')}Cerrar sesión</button>`)}</div></div>`;
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
        ${ic('abajo')}<div style="margin-top:8px"><b>Suelta aquí robot-migracion.json</b><br><small class="tenue">o haz clic para elegirlo · máx. 8 MB · las claves y contraseñas se tapan solas</small></div>
        <input type="file" id="arch" accept=".json,application/json" hidden></label>
      ${d ? `<div class="seccion">Qué trae <span class="n">${esc(d.origen || 'externo')}</span></div>
        <div class="caja">${[
          ['Archivos (memoria, SOUL, USER…)', n(d.archivos), 'Se guardan tal cual. SOUL → identidad, USER → contexto; de la memoria se sacan recuerdos con el modelo del cerebro.'],
          ['Automatizaciones', n(d.automatizaciones), 'Se crean PAUSADAS: revísalas y actívalas en Automatizaciones (ejecutan herramientas).'],
          ['Agentes', n(d.agentes), 'Plantillas de subagente: el robot las usa con "delegar".'],
          ['Skills', n(d.skills), 'Se guardan; de momento no se usan solas.'],
        ].map(([t, c, s]) => fila(`${t} · ${c}`, s, '')).join('')}</div>
        ${d.notas ? `<p class="seccion-ayuda">Notas del exportador: ${esc(String(d.notas).slice(0, 400))}</p>` : ''}
        <div class="flex" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="cancelar">Cancelar</button><button class="btn pri" id="go">${ic('check')}Importar</button></div>` : ''}
      ${r ? `<div class="seccion">Resultado</div><div class="caja pad">
        <p>✅ Personalidad: ${r.personalidad.length ? r.personalidad.join(', ') : 'sin cambios'} · Recuerdos: ${r.creados} nuevos, ${r.actualizados} actualizados${r.rechazados ? `, ${r.rechazados} rechazados (secretos/inválidos)` : ''}</p>
        <p>⏸️ Automatizaciones creadas en pausa: ${r.tareas.length}${r.tareas.length ? ` — <a href="#/auto">revisarlas</a>` : ''} · 🤖 Agentes: ${r.agentes.join(', ') || '0'} · 📚 Skills: ${r.skills.length}</p>
        ${r.identidad ? `<p class="tenue">Identidad detectada: ${esc(r.identidad)}</p>` : ''}
        ${r.errores.length ? `<p class="mal-txt">${r.errores.map(esc).join('<br>')}</p>` : ''}
        <small class="tenue mono">Copia exacta en ${esc(r.backup)}</small></div>` : ''}
      <div class="seccion">Importaciones anteriores <span class="n">${hist.length}</span></div>
      <div class="caja">${hist.length ? hist.slice(0, 10).map(h => fila(`${esc(h.origen)} · ${esc(String(h.backup).split(/[\\/]/).pop())}`, `${h.creados ?? '?'} recuerdos · ${h.tareas?.length ?? 0} automatizaciones · ${h.agentes?.length ?? 0} agentes`, '')).join('') : vacio('abajo', 'Todavía no has importado nada.')}</div></div>`;
    const leerArchivo = async f => {
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return aviso('Demasiado grande (máx. 8 MB)', true);
      try {
        const j = JSON.parse(await f.text());
        if (!j.archivos && !j.automatizaciones && !j.agentes && !j.skills) throw new Error('no parece un robot-migracion.json');
        this.datos = j; this.res = null; this.pintar(v);
      } catch (e) { aviso(`No pude leerlo: ${e.message}`, true); }
    };
    $('#arch').onchange = e => leerArchivo(e.target.files[0]);
    const z = $('#zona');
    z.ondragover = e => { e.preventDefault(); z.style.borderColor = 'var(--acento)'; };
    z.ondragleave = () => { z.style.borderColor = ''; };
    z.ondrop = e => { e.preventDefault(); z.style.borderColor = ''; leerArchivo(e.dataTransfer.files[0]); };
    if ($('#cancelar')) $('#cancelar').onclick = () => { this.datos = null; this.pintar(v); };
    if ($('#go')) $('#go').onclick = async () => {
      const b = $('#go'); b.disabled = true; b.textContent = 'Importando… (el modelo lee la memoria, puede tardar)';
      try { this.res = await api('POST', '/importar', this.datos); this.datos = null; aviso('Importado'); }
      catch (e) { aviso(e.message, true); }
      this.pintar(v);
    };
  },
};
