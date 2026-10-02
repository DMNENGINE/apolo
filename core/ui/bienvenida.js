// Asistente de primer arranque (#/bienvenida): idioma → nombre → modelo → canales → listo, en menos de 2 minutos.
// Se abre solo mientras config.bienvenida no sea true (base.js → arrancar) y desde Configuración → Apariencia o Ctrl+K.
// La voz no tiene endpoint en el núcleo (vive en la app de escritorio) → ese paso se salta; queda como consejo en "listo".
// OJO: scripts clásicos con scope global compartido → lo global va prefijado BV_.
'use strict';

const BV_PASOS = [['idioma', 'Idioma', 'mundo'], ['nombre', 'Nombre', 'persona'], ['modelo', 'Modelo', 'chispa'], ['canales', 'Canales', 'enchufe'], ['listo', 'Listo', 'check']];
const BV_NOMBRES = ['APOLO', 'Nova', 'Atlas', 'Orión', 'Robi'];
// proveedores que se ofrecen para pegar una clave en el paso de modelo (los gratis primero)
const BV_CLAVES = ['gemini', 'groq', 'openrouter', 'openai', 'anthropic', 'deepseek', 'mistral', 'xai'];

VISTAS.bienvenida = {
  paso: 0, nombre: '', det: null, elegido: null, prueba: null,
  async pintar(v) {
    this.v = v; this.paso = 0; this.det = null; this.prueba = null; this.elegido = null;
    try { this.nombre = (await api('GET', '/identidad')).nombre || ''; } catch { this.nombre = E.estado?.nombre || ''; }
    v.innerHTML = `<div class="bv"><div class="bv-fondo"></div>
      <header class="bv-top"><span class="bv-marca">${ic('robot')}<b id="bvMarca"></b></span><nav class="bv-pasos" id="bvPasos"></nav><button class="btn fantasma mini" id="bvSaltar"></button></header>
      <section class="bv-tarjeta">
        <div class="bv-robot"><div class="bv-robot-caja" id="bvRobot" title="${tr('Tócame')}">${casco('casco-grande')}</div><div class="bv-suelo"></div><div class="bv-confeti" id="bvConfeti"></div></div>
        <div class="bv-cont"><div class="bv-paso" id="bvPaso"></div>
          <footer class="bv-pie"><button class="btn" id="bvAtras"></button><span class="crece"></span><button class="btn pri bv-sig" id="bvSig"></button></footer></div>
      </section></div>`;
    $('#bvSaltar').onclick = () => this.terminar('#/inicio', true);
    $('#bvAtras').onclick = () => this.ir(this.paso - 1);
    $('#bvSig').onclick = () => this.siguiente();
    this.tecla = e => { if (e.key === 'Enter' && !e.shiftKey && !/TEXTAREA|SELECT/.test(e.target.tagName) && !$('.velo')) { e.preventDefault(); this.siguiente(); } };
    document.addEventListener('keydown', this.tecla);
    this.robot = montarRobot($('#bvRobot'), 'vitrina', 60);
    this.ir(0);
    setTimeout(() => this.gesto('saludo', 2.6, tr('¡HOLA! 👋')), 900);
  },
  salir() {
    document.removeEventListener('keydown', this.tecla); clearTimeout(this.tHud);
    desmontarRobot($('#bvRobot')); this.robot = null; this.v = null;
    modoLado = '';                                     // la barra lateral se repinta (puede haber cambiado el idioma o el nombre)
  },
  // gesto del robot 3D (si hay WebGL); si aún no montó, se reintenta al montarse
  gesto(n, s, msg) { const r = $('#bvRobot')?._robot; if (r) { r.setFps(60); r.gesto(n, s, msg); } },
  hud(msg, s = 2.5, st = 'listo') { const r = $('#bvRobot')?._robot; if (r) r.hud(msg, s, st); },

  // ---------- navegación ----------
  ir(i) {
    if (!this.v) return;
    this.paso = Math.max(0, Math.min(BV_PASOS.length - 1, i));
    const [clave] = BV_PASOS[this.paso];
    $('#bvMarca').textContent = this.nombre && this.nombre !== 'Robot' ? this.nombre : 'Robot Companion';
    $('#bvSaltar').textContent = tr(this.paso === BV_PASOS.length - 1 ? 'Cerrar' : 'Saltar el asistente');
    $('#bvPasos').innerHTML = BV_PASOS.map(([k, t, ico], n) => `<span class="bv-pp ${n < this.paso ? 'hecho' : n === this.paso ? 'on' : ''}">${n < this.paso ? ic('check') : `<i>${n + 1}</i>`}<span>${tr(t)}</span></span>`).join('<span class="bv-linea"></span>');
    $('#bvAtras').innerHTML = `${ic('izq')}${tr('Atrás')}`;
    $('#bvAtras').style.visibility = this.paso === 0 || clave === 'listo' ? 'hidden' : '';
    $('#bvSig').innerHTML = clave === 'listo' ? `${ic('chat')}${tr('Empezar a chatear')}` : `${tr(this.paso === BV_PASOS.length - 2 ? 'Terminar' : 'Siguiente')}${ic('der')}`;
    const p = $('#bvPaso'); p.classList.remove('entra'); void p.offsetWidth; p.classList.add('entra');
    p.innerHTML = this['paso_' + clave]();
    this['enlazar_' + clave]?.(p);
  },
  async siguiente() {
    const [clave] = BV_PASOS[this.paso], b = $('#bvSig');
    if (b.disabled) return;
    b.disabled = true;
    try {
      if (clave === 'nombre') await this.guardarNombre();
      if (clave === 'modelo' && this.elegido && this.elegido !== E.config.modeloPorDefecto) {
        E.config = await api('PATCH', '/config', { modeloPorDefecto: this.elegido });
      }
      if (clave === 'listo') return this.terminar('#/chat');
      this.ir(this.paso + 1);
      if (BV_PASOS[this.paso][0] === 'listo') this.celebrar();
    } catch (e) { aviso(e.message, true); }
    finally { if (b.isConnected) b.disabled = false; }
  },
  async terminar(destino, saltado) {
    try { E.config = await api('PATCH', '/config', { bienvenida: true }); } catch { }
    try { sessionStorage.setItem('rc.bienvenida-saltada', '1'); } catch { }
    if (saltado) aviso(tr('Puedes volver al asistente desde Configuración → Apariencia.'));
    location.hash = destino;
  },

  // ---------- 1. idioma ----------
  paso_idioma() {
    const actual = E.config.idioma || '', sis = I18N.delSistema();
    const BANDERA = { es: 'ES', en: 'EN' };
    return `<small class="bv-eti">${tr('Paso {a} de {b}', { a: 1, b: BV_PASOS.length })}</small>
      <h1>${tr('Hola. Vamos a dejarme listo.')}</h1>
      <p class="bv-sub">${tr('Cinco pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?')}</p>
      <div class="bv-opciones bv-idiomas">${Object.entries(I18N.idiomas).map(([k, n]) => `<button class="bv-op ${actual === k ? 'on' : ''}" data-idioma="${k}">
          <span class="bv-ico bv-sigla">${BANDERA[k] || k.toUpperCase()}</span><span class="crece"><b>${esc(n)}</b><small>${k === sis ? tr('El de tu sistema') : k === 'es' ? 'Spanish' : 'Inglés'}</small></span>${ic('check', 'bv-marca-ok')}</button>`).join('')}
        <button class="bv-op ${actual === '' ? 'on' : ''}" data-idioma=""><span class="bv-ico">${ic('monitor')}</span><span class="crece"><b>${tr('Automático')}</b><small>${tr('Sigue el idioma del sistema ({x})', { x: I18N.idiomas[sis] })}</small></span>${ic('check', 'bv-marca-ok')}</button></div>
      <p class="bv-nota">${tr('Se aplica al panel, a la isla del escritorio y al menú de la bandeja.')}</p>`;
  },
  enlazar_idioma(p) {
    p.onclick = async e => {
      const b = e.target.closest('[data-idioma]'); if (!b) return;
      const l = b.dataset.idioma;
      guardarLocal('idioma', l); I18N.poner(l || I18N.delSistema()); I18N.estaticos();
      try { E.config = await api('PATCH', '/config', { idioma: l }); } catch (er) { aviso(er.message, true); }
      this.ir(this.paso);
      this.hud(I18N.idioma() === 'es' ? '¡HOLA!' : 'HELLO!', 1.6);
    };
  },

  // ---------- 2. nombre ----------
  paso_nombre() {
    const n = this.nombre && this.nombre !== 'Robot' ? this.nombre : '';
    return `<small class="bv-eti">${tr('Paso {a} de {b}', { a: 2, b: BV_PASOS.length })}</small>
      <h1>${tr('¿Cómo me llamo?')}</h1>
      <p class="bv-sub">${tr('Es el nombre con el que te hablo en la isla, Telegram, WhatsApp y Discord. Puedes cambiarlo cuando quieras.')}</p>
      <input class="bv-input" id="bvNombre" maxlength="40" value="${esc(n)}" placeholder="${tr('Escribe un nombre…')}" autocomplete="off" spellcheck="false">
      <div class="bv-chips">${BV_NOMBRES.map(x => `<button class="chip-btn" data-nombre="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <p class="bv-nota">${tr('Pista: también puedes decírmelo hablando: «a partir de ahora te llamas …».')}</p>`;
  },
  enlazar_nombre(p) {
    const inp = $('#bvNombre', p);
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
    inp.oninput = () => { clearTimeout(this.tHud); this.tHud = setTimeout(() => inp.value.trim() && this.hud(inp.value.trim().toUpperCase().slice(0, 14), 2.2), 350); };
    p.onclick = e => { const b = e.target.closest('[data-nombre]'); if (b) { inp.value = b.dataset.nombre; inp.oninput(); inp.focus(); } };
  },
  async guardarNombre() {
    const n = ($('#bvNombre')?.value || '').trim();
    if (!n || n === this.nombre) return;
    const r = await api('PATCH', '/identidad', { nombre: n });
    this.nombre = r.nombre || n;
    if (E.estado) E.estado.nombre = this.nombre;
    this.gesto('feliz', 1.8, this.nombre.toUpperCase().slice(0, 14));
  },

  // ---------- 3. modelo ----------
  paso_modelo() {
    return `<small class="bv-eti">${tr('Paso {a} de {b}', { a: 3, b: BV_PASOS.length })}</small>
      <h1>${tr('¿Con qué cerebro pienso?')}</h1>
      <p class="bv-sub">${tr('He mirado qué hay en este equipo. Elige uno; luego puedes usar cualquier otro por conversación.')}</p>
      <div id="bvModelos">${this.det ? this.htmlModelos() : `<div class="bv-buscando"><span class="puntos"><i></i><i></i><i></i></span>${tr('Buscando Ollama, Claude Code, Codex, Gemini CLI y tus claves…')}</div>`}</div>`;
  },
  async enlazar_modelo(p) {
    p.onclick = e => this.clicModelo(e);
    if (!this.det) { this.gesto('pensativo', 3); await this.detectar(); } else this.repintarModelos();
  },
  async detectar() {
    const [est, cfg, ol, cg, canales] = await Promise.all([
      api('GET', '/estado').catch(() => ({ proveedores: [] })), api('GET', '/config').catch(() => E.config),
      api('GET', '/proveedores/ollama/modelos').catch(e => ({ ok: false, error: e.message })),
      api('GET', '/chatgpt').catch(() => null), api('GET', '/canales').catch(() => [])]);
    E.config = cfg;
    const listo = n => (est.proveedores || []).find(x => x.nombre === n)?.listo;
    const canal = id => canales.find(c => c.id === id || c.tipo === id || (c.nombre || '').toLowerCase().startsWith(id));
    const chat = (ol.modelos || []).filter(m => !/embed|bge|nomic|minilm/i.test(m));
    const ops = [];
    const def = cfg.modeloPorDefecto || '';
    // 1) Ollama local (gratis, privado)
    ops.push({ id: 'ollama', nombre: 'Ollama', desc: ol.ok ? tr('{n} modelos en este PC · gratis y privado', { n: chat.length }) : tr('No está en marcha en 127.0.0.1:11434'), ok: ol.ok && chat.length > 0,
      modelos: chat.map(m => 'ollama/' + m), valor: ol.ok && chat.length ? (def.startsWith('ollama/') && chat.includes(def.slice(7)) ? def : 'ollama/' + chat[0]) : null, enlace: ol.ok ? null : ['https://ollama.com/download', tr('Instalar Ollama')] });
    // 2) Claude Code (tu plan de Claude)
    const cc = listo('claudecode');
    ops.push({ id: 'claudecode', nombre: 'Claude Code', desc: cc ? tr('CLI instalada · usa tu plan de Claude') : tr('No encontré la CLI «claude»'), ok: !!cc,
      modelos: ['claudecode/sonnet', 'claudecode/haiku', 'claudecode/opus'], valor: cc ? (def.startsWith('claudecode/') ? def : 'claudecode/sonnet') : null, enlace: cc ? null : ['https://claude.com/claude-code', tr('Instalar Claude Code')] });
    // 3) ChatGPT vía Codex CLI (tu plan de ChatGPT, sin API key)
    ops.push({ id: 'chatgpt', nombre: 'ChatGPT (Codex)', desc: cg?.sesion ? tr('Sesión iniciada · usa tu plan de ChatGPT') : cg?.instalado ? tr('Codex instalado · falta iniciar sesión') : tr('Conecta tu cuenta de ChatGPT Plus/Pro'), ok: !!cg?.sesion,
      modelos: ['chatgpt/default'], valor: cg?.sesion ? 'chatgpt/default' : null, conectar: !cg?.sesion });
    // 4) proveedores con clave guardada
    for (const [k, pr] of Object.entries(cfg.proveedores || {})) {
      if (!pr.tieneKey || pr.local || ['claude-cli', 'codex-cli'].includes(pr.tipo)) continue;
      const alias = Object.values(cfg.alias || {}).find(m => m.startsWith(k + '/'));
      ops.push({ id: k, nombre: k, desc: tr(pr.keyDeEntorno ? 'Clave en variable de entorno' : 'Clave guardada'), ok: true, modelos: [def.startsWith(k + '/') ? def : alias || k + '/auto'], valor: def.startsWith(k + '/') ? def : alias || k + '/auto' });
    }
    // detectados que no son modelos (información)
    const gem = canal('gemini');
    this.extra = [gem && { n: 'Gemini CLI', ok: gem.estado === 'activo' || !/no está instalado|not installed/i.test(gem.detalle || ''), d: gem.estado === 'activo' ? tr('hooks instalados') : tr('hooks: desde la bandeja') }].filter(Boolean);
    this.det = ops;
    const actual = ops.find(o => o.ok && o.valor === def) || ops.find(o => o.ok && def.startsWith(o.id + '/'));
    this.elegido = actual ? (actual.valor || def) : (ops.find(o => o.ok)?.valor || null);
    if ($('#bvModelos')) { this.repintarModelos(); this.gesto(ops.some(o => o.ok) ? 'feliz' : 'duda', 2); }
  },
  htmlModelos() {
    const ops = this.det, hay = ops.filter(o => o.ok).length;
    const sel = this.elegido;
    const filaOp = o => {
      const on = o.ok && sel && (sel === o.valor || o.modelos.includes(sel));
      const lista = o.ok && o.modelos.length > 1 ? `<select class="bv-sel" data-prov="${esc(o.id)}">${o.modelos.slice(0, 60).map(m => `<option value="${esc(m)}" ${m === (on ? sel : o.valor) ? 'selected' : ''}>${esc(nombreModelo(m))}</option>`).join('')}</select>` : '';
      return `<div class="bv-op bv-mod ${on ? 'on' : ''} ${o.ok ? '' : 'apagada'}" data-mod="${esc(o.id)}">${avatar(o.id + '/')}
        <span class="crece"><b>${esc(o.nombre)}</b><small>${esc(o.desc)}</small></span>
        ${lista}${o.ok ? `<span class="chip ok"><span class="punto ok"></span>${tr('detectado')}</span>` : o.conectar ? `<button class="btn mini" data-cg>${tr('Conectar')}</button>` : o.enlace ? `<a class="btn mini" href="${o.enlace[0]}" target="_blank" rel="noopener">${esc(o.enlace[1])}</a>` : ''}${ic('check', 'bv-marca-ok')}</div>`;
    };
    const opcionesClave = BV_CLAVES.filter(k => E.config.proveedores[k] && !E.config.proveedores[k].tieneKey);
    return `<div class="bv-resumen ${hay ? 'ok' : 'aviso'}">${ic(hay ? 'check' : 'info')}${hay ? tr('Encontré {n} opción lista para usar.|Encontré {n} opciones listas para usar.', { n: hay }) : tr('No encontré ningún modelo listo. Lo más rápido: una clave gratis de Gemini o instalar Ollama.')}
        ${(this.extra || []).map(x => `<span class="chip ${x.ok ? 'ok' : ''}">${esc(x.n)} · ${esc(x.d)}</span>`).join('')}</div>
      <div class="bv-opciones">${ops.map(filaOp).join('')}</div>
      <details class="bv-clave" ${hay ? '' : 'open'}><summary>${ic('llave')}${tr('Añadir una API key')}</summary>
        <div class="bv-clave-f"><select id="bvProv">${opcionesClave.map(k => `<option value="${k}">${esc(k)}</option>`).join('')}</select>
          <input id="bvKey" type="password" autocomplete="off" placeholder="${tr('pega la clave')}"><button class="btn" id="bvGKey">${tr('Guardar')}</button></div>
        <div id="bvDonde">${opcionesClave[0] ? enlaceClave(opcionesClave[0], E.config.proveedores[opcionesClave[0]]) : ''}</div></details>
      <div class="bv-probar"><span class="crece" id="bvPrueba">${sel ? `${tr('Elegido:')} <code>${esc(sel)}</code>` : tr('Elige una opción para continuar (o sáltalo y hazlo luego en Configuración → Modelos).')}</span>
        <button class="btn" id="bvProbar" ${sel ? '' : 'disabled'}>${ic('rayo')}${tr('Probar')}</button></div>`;
  },
  async clicModelo(e) {
    if (e.target.closest('select')) return;
    if (e.target.closest('[data-cg]')) {                                   // ChatGPT: abre el login de Codex y espera la sesión
      const b = e.target.closest('[data-cg]'); b.disabled = true; b.textContent = tr('Preparando…');
      const r = await api('POST', '/chatgpt/conectar').catch(er => ({ ok: false, error: er.message }));
      if (!r.ok) { b.disabled = false; b.textContent = tr('Reintentar'); return aviso(r.error, true); }
      aviso(tr(r.mensaje || 'Inicia sesión en la ventana que se abrió'));
      for (let i = 0; i < 60 && this.v; i++) {
        await new Promise(ok => setTimeout(ok, 3000));
        const c = await api('GET', '/chatgpt').catch(() => null);
        if (c?.sesion) { this.det = null; this.elegido = 'chatgpt/default'; await this.detectar(); this.elegido = 'chatgpt/default'; this.repintarModelos(); return; }
      }
      return;
    }
    if (e.target.closest('#bvGKey')) {                                   // guardar una clave nueva y volver a detectar
      const k = $('#bvProv').value, key = $('#bvKey').value.trim();
      if (!k || !key) return aviso(tr('Pega la clave primero'), true);
      try { E.config = await api('PATCH', '/config', { proveedores: { [k]: { apiKey: key } } }); aviso(tr('Clave guardada')); }
      catch (er) { return aviso(er.message, true); }
      await this.detectar();
      const o = this.det.find(x => x.id === k); if (o) { this.elegido = o.valor; this.repintarModelos(); this.probar(); }
      return;
    }
    if (e.target.closest('#bvProbar')) return this.probar();
    const f = e.target.closest('[data-mod]'); if (!f) return;
    const o = this.det.find(x => x.id === f.dataset.mod); if (!o || !o.ok) return;
    this.elegido = $('select', f)?.value || o.valor; this.prueba = null;
    this.repintarModelos();
  },
  repintarModelos() {
    const c = $('#bvModelos'); if (!c || !this.det) return;
    const abierto = $('.bv-clave', c)?.open;
    c.innerHTML = this.htmlModelos();
    if (abierto) $('.bv-clave', c).open = true;
    $$('.bv-sel', c).forEach(s => { s.onchange = () => { this.elegido = s.value; this.prueba = null; this.repintarModelos(); }; });
    const pv = $('#bvProv', c); if (pv) pv.onchange = () => { $('#bvDonde').innerHTML = enlaceClave(pv.value, E.config.proveedores[pv.value]); };
  },
  // "Probar": pide la lista de modelos al proveedor (conexión + clave) sin gastar tokens
  async probar() {
    const m = this.elegido; if (!m) return;
    const b = $('#bvProbar'), out = $('#bvPrueba'); if (!b) return;
    b.disabled = true; out.innerHTML = `<span class="punto ok vivo"></span> ${tr('Probando {m}…', { m: esc(m) })}`;
    const prov = m.split('/')[0];
    const r = await api('GET', `/proveedores/${prov}/modelos`).catch(er => ({ ok: false, error: er.message }));
    if (!b.isConnected) return;
    b.disabled = false;
    out.innerHTML = r.ok ? `<span class="ok-txt">✓ ${tr('{m} responde', { m: `<code>${esc(m)}</code>` })}</span> · ${tr('{n} modelos', { n: r.modelos.length })}` : `<span class="mal-txt">✗ ${esc(r.error)}</span>`;
    this.gesto(r.ok ? 'si' : 'no', 1.4, r.ok ? '✓ OK' : '✗');
  },

  // ---------- 4. canales ----------
  paso_canales() {
    return `<small class="bv-eti">${tr('Paso {a} de {b}', { a: 4, b: BV_PASOS.length })}</small>
      <h1>${tr('¿Me llevas en el bolsillo?')}</h1>
      <p class="bv-sub">${tr('Háblame desde el móvil y recibe ahí los permisos y avisos cuando no estés en el PC. Es opcional: puedes hacerlo más tarde.')}</p>
      <div class="bv-opciones" id="bvCanales"><div class="bv-buscando"><span class="puntos"><i></i><i></i><i></i></span>${tr('Mirando tus canales…')}</div></div>
      <p class="bv-nota">${tr('Cada tarjeta se abre en una pestaña nueva; este asistente te espera aquí.')}</p>`;
  },
  async enlazar_canales() {
    const l = await api('GET', '/canales').catch(() => []);
    const est = id => l.find(c => c.id === id || c.tipo === id);
    const C = [['telegram', 'Telegram', 'enviar', 'Tu propio bot con @BotFather. Lo más fácil y fiable.'],
      ['whatsapp', 'WhatsApp', 'chat', 'Se vincula con un QR, como WhatsApp Web. Mejor con un número secundario.'],
      ['discord', 'Discord', 'discord', 'Un bot en tu servidor: permisos con botones y avisos.']];
    const c = $('#bvCanales'); if (!c) return;
    c.innerHTML = C.map(([k, n, i, d]) => {
      const e = est(k), on = e?.estado === 'activo';
      return `<div class="bv-op bv-canal ${on ? 'on' : ''}"><span class="bv-ico">${ic(i)}</span><span class="crece"><b>${n}</b><small>${tr(d)}</small></span>
        ${on ? `<span class="chip ok"><span class="punto ok"></span>${tr('conectado')}</span>` : `<a class="btn mini" href="#/ajustes/canales/${k}" target="_blank" rel="noopener">${tr('Configurar')} ${ic('der')}</a>`}</div>`;
    }).join('');
  },

  // ---------- 5. listo ----------
  paso_listo() {
    const n = this.nombre && this.nombre !== 'Robot' ? this.nombre : 'Robot';
    return `<small class="bv-eti">${tr('¡Todo listo!')}</small>
      <h1>${tr('{n} está listo.', { n: esc(n) })}</h1>
      <p class="bv-sub">${tr('Ya puedes hablarme desde aquí, la isla del escritorio o el móvil. Todos los canales comparten memoria y permisos.')}</p>
      <div class="bv-hecho">
        <div>${ic('mundo')}<span>${tr('Idioma')}</span><b>${esc(E.config.idioma ? I18N.idiomas[E.config.idioma] : tr('Automático'))}</b></div>
        <div>${ic('persona')}<span>${tr('Nombre')}</span><b>${esc(n)}</b></div>
        <div>${ic('chispa')}<span>${tr('Modelo')}</span><b class="mono">${esc(E.config.modeloPorDefecto)}</b></div>
      </div>
      <div class="bv-consejos"><b>${tr('Para empezar')}</b>
        <span>${ic('micro')}${tr('<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Espacio</kbd> para hablarme por voz.')}</span>
        <span>${ic('buscar')}${tr('<kbd>Ctrl</kbd>+<kbd>K</kbd> en el panel para encontrar cualquier cosa.')}</span>
        <span>${ic('reloj')}${tr('Prueba: «recuérdame mañana a las 9 llamar al taller».')}</span></div>
      <a class="bv-ir-inicio" href="#/inicio" id="bvInicio">${tr('o ir al inicio')}</a>`;
  },
  enlazar_listo(p) {
    $('#bvInicio', p).onclick = e => { e.preventDefault(); this.terminar('#/inicio'); };
    api('PATCH', '/config', { bienvenida: true }).then(c => { E.config = c; }).catch(() => { });
  },
  celebrar() {
    this.gesto('celebrar', 3.2, tr('¡LISTO!'));
    const c = $('#bvConfeti'); if (!c) return;
    const col = ['var(--acento)', '#ffd25a', '#7fe3ff', '#ff7ad9', '#b58cff'];
    c.innerHTML = Array.from({ length: 42 }, (_, i) => `<i style="--x:${(Math.random() * 2 - 1) * 180}px;--y:${-90 - Math.random() * 170}px;--r:${Math.random() * 720 - 360}deg;--d:${(i % 7) * 40}ms;background:${col[i % col.length]}"></i>`).join('');
    setTimeout(() => { if (c.isConnected) c.innerHTML = ''; }, 2600);
  },
};
