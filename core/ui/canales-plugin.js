// Configuración → Canales: tarjetas de los canales que son plugins del SDK (Slack, Matrix, Signal). Globales CP_.
// Flujo: instalar (del repo) → activar → configurar → vincular → probar. Los secretos (tokens, contraseña) se escriben en
// campos de contraseña, viajan una sola vez al plugin (POST /v1/plugins/:n/canales/:id/conectar) y él los guarda cifrados;
// el panel NUNCA los recibe de vuelta: solo ve "configurado".
const CP_DEF = {
  slack: {
    titulo: 'Slack', doc: 'docs/canales/slack.md',
    intro: 'Tu propia app de Slack por <b>Socket Mode</b>: no hace falta servidor público. Solo te contesta a ti, por mensaje directo.',
    campos: [
      { id: 'appToken', txt: 'Token de app (xapp-…)', secreto: true, ph: 'xapp-1-…' },
      { id: 'botToken', txt: 'Token de bot (xoxb-…)', secreto: true, ph: 'xoxb-…' },
    ],
    pasos: 'Crea la app con el manifest de <code>docs/canales/slack.md</code> (api.slack.com/apps → Create New App → From a manifest), instálala en tu espacio de trabajo y pega aquí los dos tokens.',
  },
  matrix: {
    titulo: 'Matrix', doc: 'docs/canales/matrix.md',
    intro: 'Una cuenta de Matrix <b>solo para el robot</b> que habla contigo en una sala privada. <b>Sin cifrado de extremo a extremo</b> en esta versión.',
    campos: [
      { id: 'homeserver', txt: 'Homeserver', ph: 'https://matrix.org' },
      { id: 'dueno', txt: 'Tu usuario (@tu:servidor)', ph: '@demon:matrix.org' },
      { id: 'usuario', txt: 'Usuario del bot', ph: 'apolo_bot' },
      { id: 'password', txt: 'Contraseña del bot', secreto: true, ph: '' },
      { id: 'token', txt: 'O su token de acceso (opcional)', secreto: true, ph: 'syt_…' },
    ],
    pasos: 'Crea una cuenta nueva para el robot (por ejemplo en app.element.io). La contraseña solo se usa para iniciar sesión: se guarda el token, cifrado.',
  },
  signal: {
    titulo: 'Signal', doc: 'docs/canales/signal.md',
    intro: 'Signal a través de <b>signal-cli</b> en este equipo (necesita Java). El plugin solo habla con <code>127.0.0.1</code> y solo atiende a tu número.',
    campos: [
      { id: 'url', txt: 'Dirección de signal-cli', ph: 'http://127.0.0.1:8080' },
      { id: 'cuenta', txt: 'Número del robot (signal-cli)', ph: '+34600111222' },
      { id: 'dueno', txt: 'Tu número', ph: '+34600333444' },
    ],
    pasos: 'Instala signal-cli, registra un número para el robot y arráncalo con <code>signal-cli -a +NUM daemon --http 127.0.0.1:8080</code>.',
  },
};
const CP_editando = {};

async function CP_pintar(caja) {
  if (!caja) return;
  const pl = await api('GET', '/plugins').catch(() => ({ plugins: [] }));
  const nombres = Object.keys(CP_DEF);
  const estados = await Promise.all(nombres.map(async n => {
    const p = (pl.plugins || []).find(x => x.nombre === n);
    const e = p && p.activo && p.estado === 'activo' ? await api('POST', `/plugins/${n}/canales/${n}/estado`, {}).catch(er => ({ error: er.message })) : null;
    return { n, p, e };
  }));
  caja.innerHTML = estados.map(({ n, p, e }) => `<div class="seccion" id="canal-${n}">${CP_DEF[n].titulo} <span class="tenue" style="font-size:11px">· ${tr('plugin')}</span></div>
    <div class="caja" data-cp="${n}">${CP_html(n, p, e)}</div>`).join('');
  caja.onclick = e => { const b = e.target.closest('button[data-cpa]'); if (b) CP_accion(caja, b.closest('[data-cp]').dataset.cp, b.dataset.cpa, b); };
  const ancla = (location.hash.match(/^#\/ajustes\/canales\/(\w+)/) || [])[1];
  if (ancla && CP_DEF[ancla]) setTimeout(() => document.getElementById('canal-' + ancla)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

const CP_chip = t => `<span class="chip ${t === 'conectado' ? 'ok' : /reintentando|no válido|no responde/.test(t || '') ? 'aviso' : ''}"><span class="punto ${t === 'conectado' ? 'ok' : ''}"></span>${esc(tr(t || ''))}</span>`;

function CP_html(n, p, e) {
  const d = CP_DEF[n], btn = (a, txt, cls = '') => `<button class="btn mini ${cls}" data-cpa="${a}">${tr(txt)}</button>`;
  const intro = `<div style="padding:14px 16px;line-height:1.6">${tr(d.intro)} <span class="tenue">${tr('Guía:')} <code>${d.doc}</code></span></div>`;
  if (!p) return intro + fila('Estado', 'No instalado.', `<button class="btn pri" data-cpa="instalar">${tr('Instalar')}</button>`);
  if (p.roto) return intro + fila('Estado', esc(tr('Roto:') + ' ' + p.roto), btn('activar', 'Reactivar'));
  if (!p.activo || p.estado !== 'activo') {
    const esc_ = p.escaneo?.nivel && p.escaneo.nivel !== 'verde' ? ` · ${tr('escaneo')}: ${esc(tr(p.escaneo.nivel))}` : '';
    return intro + fila('Estado', esc(tr(p.activo ? p.estado : 'Instalado, desactivado')) + esc_, btn('activar', 'Activar', 'pri'));
  }
  if (!e || e.error) return intro + fila('Estado', esc(e?.error || tr('No responde')), btn('recargar', 'Reiniciar'));
  if (!e.configurado || CP_editando[n]) {
    const valor = c => (c.secreto ? '' : esc(e[c.id] || (c.id === 'url' ? e.url || '' : '')));
    return intro + `<div style="padding:0 16px 8px" class="tenue">${tr(d.pasos)}</div>`
      + d.campos.map(c => fila(c.txt, c.secreto ? (e.configurado ? 'Ya guardado (no se muestra). Déjalo vacío para conservarlo.' : 'Se guarda cifrado en este equipo.') : '',
        `<input data-campo="${c.id}" class="mono" ${c.secreto ? 'type="password" autocomplete="off"' : ''} placeholder="${esc(c.ph)}" value="${valor(c)}">`)).join('')
      + fila('', '', `${CP_editando[n] ? btn('cancelar', 'Cancelar') : ''}<button class="btn pri" data-cpa="conectar">${tr('Conectar')}</button>`);
  }
  let que = '';
  if (n === 'slack') que = e.enlazado ? tr('Enlazado con {x}', { x: esc(e.usuario || '') }) + (e.equipo ? ` · ${esc(e.equipo)}` : '')
    : tr('<b>Último paso:</b> en Slack, abre un mensaje directo con la app y mándale este código:') + ` <code style="font-size:15px">${esc(e.codigo || '')}</code>`;
  if (n === 'matrix') que = e.enlazado ? tr('Enlazado con {x}', { x: esc(e.dueno || '') }) + ` · ${esc(e.cuenta || '')}`
    : tr('<b>Último paso:</b> acepta en tu cliente de Matrix la invitación de {x} a la sala «APOLO».', { x: esc(e.cuenta || '') });
  if (n === 'signal') que = e.enlazado ? tr('Enlazado con {x}', { x: esc(e.dueno || '') })
    : tr('<b>Último paso:</b> escríbele cualquier cosa al número {x} desde tu Signal.', { x: esc(e.cuenta || '') });
  return fila(`<span class="flex">${ic('enviar')}${d.titulo}</span>`, `${e.enlazado ? '<span class="ok-txt">✓</span> ' : ''}${que}`, CP_chip(e.estado))
    + fila('', '', `${btn('prueba', 'Probar')}${n === 'slack' ? btn('enlace', 'Nuevo código') : ''}${btn('editar', 'Cambiar datos')}${btn('desconectar', 'Desconectar', 'mal')}`);
}

async function CP_accion(caja, n, a, b) {
  const tarjeta = caja.querySelector(`[data-cp="${n}"]`), canal = (accion, datos = {}) => api('POST', `/plugins/${n}/canales/${n}/${accion}`, datos);
  try {
    if (a === 'instalar') {
      b.disabled = true; b.textContent = tr('Instalando…');
      await api('POST', `/plugins/oficial/${n}`);
      a = 'activar';
    }
    if (a === 'activar') {
      try { await api('PATCH', `/plugins/${n}`, { activo: true }); }
      catch (er) {
        if (!await modal({ titulo: tr('Activar {x}', { x: CP_DEF[n].titulo }), cuerpo: esc(er.message), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Activar igualmente', cls: 'mal', valor: true }] })) return CP_pintar(caja);
        await api('PATCH', `/plugins/${n}`, { activo: true, forzar: true });
      }
      await new Promise(ok => setTimeout(ok, 600));
    }
    if (a === 'recargar') await api('POST', `/plugins/${n}/recargar`);
    if (a === 'editar') CP_editando[n] = true;
    if (a === 'cancelar') delete CP_editando[n];
    if (a === 'conectar') {
      const datos = {};
      tarjeta.querySelectorAll('[data-campo]').forEach(i => { if (i.value.trim()) datos[i.dataset.campo] = i.value.trim(); });
      b.disabled = true; b.textContent = tr('Comprobando…');
      try { await canal('conectar', datos); }
      finally { tarjeta.querySelectorAll('input[type=password]').forEach(i => { i.value = ''; }); }   // no se quedan en la página
      delete CP_editando[n];
      aviso(tr('✓ {x} conectado', { x: CP_DEF[n].titulo }));
    }
    if (a === 'prueba') { await canal('prueba'); return aviso('Mensaje de prueba enviado'); }
    if (a === 'enlace') await canal('enlace');
    if (a === 'desconectar') {
      if (!await modal({ titulo: tr('Desconectar {x}', { x: CP_DEF[n].titulo }), cuerpo: tr('El robot dejará de usar este canal y borrará sus credenciales de este equipo.'), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Desconectar', cls: 'mal', valor: true }] })) return;
      await canal('desconectar');
    }
  } catch (er) { aviso(er.message, true); }
  CP_pintar(caja);
}
