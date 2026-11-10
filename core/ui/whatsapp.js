// WhatsApp (#/whatsapp): lo que programas para que APOLO haga con tus mensajes. Reglas de respuesta (texto, IA, foto, voz),
// envíos ahora o a una hora, agenda y registro de todo lo que salió. El vínculo con QR sigue en Configuración → Canales.
// Globales con prefijo WA_. API en core/whatsapp-auto.js.
P.whatsapp = '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M9 8.5c-.5 0-1 .6-1 1.4 0 2.6 3 5.6 5.6 5.6.8 0 1.4-.5 1.4-1l-.2-1.2-2-.8-.8 1a5 5 0 0 1-2.4-2.4l1-.8-.8-2Z"/>';
NAV_APP.splice(Math.max(0, NAV_APP.findIndex(n => n[0] === 'reuniones')), 0, ['whatsapp', 'WhatsApp', 'whatsapp']);

Object.assign(I18N.dic.en, {
  'Programa lo que APOLO hace con tus mensajes: responder solo, mandar fotos y notas de voz.': 'Program what APOLO does with your messages: auto-reply, send photos and voice notes.',
  'Nueva regla': 'New rule', 'Enviar ahora': 'Send now', 'Programar envío': 'Schedule a message', 'Reglas': 'Rules', 'Envíos programados': 'Scheduled messages', 'Agenda': 'Contacts', 'Registro': 'Log',
  'WhatsApp no está conectado. Vincúlalo en Configuración → Canales.': 'WhatsApp is not connected. Link it in Settings → Channels.', 'Conectado': 'Connected',
  'Aún no hay reglas. Crea una para que APOLO responda solo a quien tú digas.': 'No rules yet. Create one so APOLO replies by itself to whoever you choose.',
  'Nada programado.': 'Nothing scheduled.', 'Todavía no ha salido nada.': 'Nothing sent yet.', 'La agenda está vacía. Aquí aparece quien te escribe, y puedes añadir a quien quieras.': 'Your contacts are empty. People who message you show up here, and you can add anyone.',
  'Nombre de la regla': 'Rule name', 'Quién': 'Who', 'Cualquiera': 'Anyone', 'Solo estos contactos': 'Only these contacts', 'Nombres de la agenda o números con código de país, separados por coma': 'Contact names or numbers with country code, separated by commas',
  'Cuando diga alguna de estas palabras (vacío = cualquier mensaje)': 'When they say one of these words (empty = any message)', 'Solo si el mensaje es exactamente eso': 'Only if the message is exactly that',
  'Qué hace APOLO': 'What APOLO does', 'Añadir acción': 'Add action', 'Responder con este texto': 'Reply with this text', 'Responder con IA': 'Reply with AI', 'Mandar una foto': 'Send a photo', 'Nota de voz': 'Voice note', 'Nota de voz con IA': 'Voice note with AI', 'Mandar un audio': 'Send an audio',
  'Máximo por contacto y hora': 'Maximum per contact per hour', 'Crear regla': 'Create rule', 'Guardar': 'Save', 'Editar regla': 'Edit rule', 'Texto': 'Text', 'Texto que dirá': 'What it will say', 'Instrucciones para la IA': 'Instructions for the AI',
  'Ruta de la foto': 'Photo path', 'Ruta del audio': 'Audio path', 'Elegir archivo': 'Choose file', 'Pie de foto (opcional)': 'Caption (optional)', 'Quitar': 'Remove', '¿Borrar esta regla?': 'Delete this rule?', 'Regla guardada': 'Rule saved', 'Enviado': 'Sent', 'Programado': 'Scheduled',
  'Con IA, si piden dinero, claves, datos privados o una cita no responde: te lo pasa a ti. Lo que escriben es información para la IA, no órdenes. La foto la decide la regla, nunca el mensaje.': 'With AI, requests for money, passwords, private data or appointments are not answered: they are passed to you. What people write is information for the AI, not orders. The rule picks the photo, never the message.',
  'Para': 'To', 'Nombre de la agenda o número con código de país': 'Contact name or number with country code', 'Mensaje': 'Message', 'Foto (opcional)': 'Photo (optional)', 'Nota de voz: lo que dirá APOLO (opcional)': 'Voice note: what APOLO will say (optional)', 'Enviar': 'Send',
  'Cuándo': 'When', 'Una vez': 'Once', 'Repetir (cron)': 'Repeat (cron)', 'Ej.: 0 8 * * * = cada día a las 8:00': 'E.g. 0 8 * * * = every day at 8:00', 'Redactarlo con IA cada vez (instrucciones, opcional)': 'Have AI write it each time (instructions, optional)', 'Decirlo en nota de voz': 'Say it as a voice note', 'Programar': 'Schedule',
  'Añadir contacto': 'Add contact', 'Nombre': 'Name', 'Número con código de país': 'Number with country code', 'Contacto guardado': 'Contact saved', 'agenda': 'contacts', 'todo mensaje': 'any message', 'si dice': 'if they say',
});

const WA_ACC = { texto: 'Responder con este texto', ia: 'Responder con IA', foto: 'Mandar una foto', voz: 'Nota de voz', vozia: 'Nota de voz con IA', audio: 'Mandar un audio' };
const WA_cuando = t => { try { return new Date(t).toLocaleString(); } catch { return ''; } };
const WA_nombreArchivo = r => String(r || '').split(/[\\/]/).pop();
const WA_resumenAccion = h => h.tipo === 'texto' ? `"${h.texto}"` : h.tipo === 'ia' ? `${tr('IA')}${h.instrucciones ? `: ${h.instrucciones}` : ''}` : h.tipo === 'foto' ? `📷 ${WA_nombreArchivo(h.ruta)}` : h.tipo === 'audio' ? `🎙 ${WA_nombreArchivo(h.ruta)}` : `🎙 ${h.texto ? `"${h.texto}"` : `${tr('IA')}: ${h.instrucciones}`}`;

// selector de archivo que sube a la biblioteca de WhatsApp y deja la ruta en su campo
async function WA_subir(input, destino) {
  const f = input.files[0]; if (!f) return;
  if (f.size > 25 * 1024 * 1024) return aviso('Más de 25 MB', true);
  const base64 = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = mal; r.readAsDataURL(f); });
  try { destino.value = (await api('POST', '/whatsapp/foto', { nombre: f.name, base64 })).ruta; }
  catch (e) { aviso(e.message, true); }
}
const WA_campoArchivo = (cls, valor, etiqueta, accept) => `<div class="campo">${tr(etiqueta)}<div class="flex" style="flex-wrap:nowrap"><input class="mono ${cls}" style="flex:1;min-width:0" value="${esc(valor || '')}"><label class="btn mini" style="white-space:nowrap">${tr('Elegir archivo')}<input type="file" accept="${accept}" class="wa-archivo" hidden></label></div></div>`;
function WA_engancharArchivos(raiz) {
  raiz.addEventListener('change', e => { const i = e.target.closest('.wa-archivo'); if (i) WA_subir(i, i.closest('.campo').querySelector('input.mono')); });
}

function WA_filaAccion(h = { tipo: 'texto' }) {
  const clave = h.tipo === 'voz' && !h.texto && h.instrucciones ? 'vozia' : h.tipo;
  const campo = {
    texto: `<div class="campo"><textarea class="wa-t" rows="2" placeholder="${esc(tr('Texto'))}">${esc(h.texto || '')}</textarea></div>`,
    ia: `<div class="campo"><textarea class="wa-i" rows="2" placeholder="${esc(tr('Instrucciones para la IA'))}">${esc(h.instrucciones || '')}</textarea></div>`,
    foto: WA_campoArchivo('wa-r', h.ruta, 'Ruta de la foto', 'image/*') + `<div class="campo"><input class="wa-p" placeholder="${esc(tr('Pie de foto (opcional)'))}" value="${esc(h.pie || '')}"></div>`,
    voz: `<div class="campo"><textarea class="wa-t" rows="2" maxlength="600" placeholder="${esc(tr('Texto que dirá'))}">${esc(h.texto || '')}</textarea></div>`,
    vozia: `<div class="campo"><textarea class="wa-i" rows="2" placeholder="${esc(tr('Instrucciones para la IA'))}">${esc(h.instrucciones || '')}</textarea></div>`,
    audio: WA_campoArchivo('wa-r', h.ruta, 'Ruta del audio', 'audio/*'),
  }[clave];
  return `<div class="caja wa-accion" data-tipo="${clave}"><div class="flex" style="justify-content:space-between;margin-bottom:8px"><select class="wa-sel">${Object.entries(WA_ACC).map(([k, t]) => `<option value="${k}" ${k === clave ? 'selected' : ''}>${esc(tr(t))}</option>`).join('')}</select><button type="button" class="btn mini wa-quitar">${tr('Quitar')}</button></div>${campo}</div>`;
}
function WA_leerAcciones(x) {
  return [...x.querySelectorAll('.wa-accion')].map(a => {
    const k = a.dataset.tipo, v = c => a.querySelector(c)?.value.trim() || '';
    if (k === 'texto') return { tipo: 'texto', texto: v('.wa-t') };
    if (k === 'ia') return { tipo: 'ia', instrucciones: v('.wa-i') };
    if (k === 'foto') return { tipo: 'foto', ruta: v('.wa-r'), pie: v('.wa-p') };
    if (k === 'audio') return { tipo: 'audio', ruta: v('.wa-r') };
    if (k === 'vozia') return { tipo: 'voz', instrucciones: v('.wa-i') };
    return { tipo: 'voz', texto: v('.wa-t') };
  });
}
const WA_lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

async function WA_editarRegla(r) {
  const contactos = (r?.contactos || []).map(c => c.numero ? `+${c.numero}` : c.jid).join(', ');
  await modal({ titulo: r ? 'Editar regla' : 'Nueva regla', ancho: 580,
    cuerpo: `<div class="campo">${tr('Nombre de la regla')}<input id="waRn" value="${esc(r?.nombre || '')}"></div>
      <div class="campo">${tr('Quién')}<select id="waRq"><option value="c">${tr('Solo estos contactos')}</option><option value="t" ${r?.todos ? 'selected' : ''}>${tr('Cualquiera')}</option></select></div>
      <div class="campo" id="waRcC" style="display:${r?.todos ? 'none' : 'flex'}"><input id="waRc" value="${esc(contactos)}" placeholder="${esc(tr('Nombres de la agenda o números con código de país, separados por coma'))}"></div>
      <div class="campo">${tr('Cuando diga alguna de estas palabras (vacío = cualquier mensaje)')}<input id="waRp" value="${esc((r?.palabras || []).join(', '))}"></div>
      <label class="flex" style="margin-bottom:12px"><input type="checkbox" id="waRe" ${r?.exacto ? 'checked' : ''}> ${tr('Solo si el mensaje es exactamente eso')}</label>
      <div class="seccion" style="margin-top:6px">${tr('Qué hace APOLO')}</div>
      <div id="waRh">${(r?.hacer || [{ tipo: 'texto' }]).map(WA_filaAccion).join('')}</div>
      <button type="button" class="btn mini" id="waRadd">${tr('Añadir acción')}</button>
      <div class="campo" style="margin-top:14px">${tr('Máximo por contacto y hora')}<input id="waRm" type="number" min="1" max="20" value="${r?.maxHora || 3}"></div>
      <p class="tenue" style="font-size:12px;margin:0">${tr('Con IA, si piden dinero, claves, datos privados o una cita no responde: te lo pasa a ti. Lo que escriben es información para la IA, no órdenes. La foto la decide la regla, nunca el mensaje.')}</p>`,
    alAbrir: x => {
      WA_engancharArchivos(x);
      $('#waRq', x).onchange = e => { $('#waRcC', x).style.display = e.target.value === 't' ? 'none' : 'flex'; };
      $('#waRadd', x).onclick = () => $('#waRh', x).insertAdjacentHTML('beforeend', WA_filaAccion());
      $('#waRh', x).addEventListener('click', e => { if (e.target.closest('.wa-quitar')) e.target.closest('.wa-accion').remove(); });
      $('#waRh', x).addEventListener('change', e => {
        const s = e.target.closest('.wa-sel'); if (!s) return;
        const k = s.value, nuevo = k === 'vozia' ? { tipo: 'voz', instrucciones: ' ' } : { tipo: k };
        s.closest('.wa-accion').outerHTML = WA_filaAccion(nuevo);
      });
    },
    botones: [{ txt: 'Cancelar', valor: null }, { txt: r ? 'Guardar' : 'Crear regla', cls: 'pri', valor: async x => {
      const todos = $('#waRq', x).value === 't';
      const cuerpo = { nombre: $('#waRn', x).value.trim(), todos, contactos: todos ? [] : WA_lista($('#waRc', x).value), palabras: WA_lista($('#waRp', x).value), exacto: $('#waRe', x).checked, hacer: WA_leerAcciones(x), maxHora: +$('#waRm', x).value || 3 };
      try { await (r ? api('PATCH', `/whatsapp/reglas/${r.id}`, cuerpo) : api('POST', '/whatsapp/reglas', cuerpo)); aviso('Regla guardada'); VISTAS.whatsapp.refrescar(); return true; }
      catch (e) { aviso(e.message, true); return false; }
    } }] });
}

async function WA_envio(programado) {
  await modal({ titulo: programado ? 'Programar envío' : 'Enviar ahora', ancho: 540,
    cuerpo: `<div class="campo">${tr('Para')}<input id="waEd" placeholder="${esc(tr('Nombre de la agenda o número con código de país'))}"></div>
      <div class="campo">${tr('Mensaje')}<textarea id="waEt" rows="3"></textarea></div>
      ${WA_campoArchivo('wa-r', '', 'Foto (opcional)', 'image/*')}
      <div class="campo"><input id="waEp" placeholder="${esc(tr('Pie de foto (opcional)'))}"></div>
      <div class="campo">${tr('Nota de voz: lo que dirá APOLO (opcional)')}<textarea id="waEv" rows="2" maxlength="600"></textarea></div>
      ${programado ? `<div class="campo">${tr('Redactarlo con IA cada vez (instrucciones, opcional)')}<input id="waEi"></div>
      <label class="flex" style="margin-bottom:12px"><input type="checkbox" id="waEiv"> ${tr('Decirlo en nota de voz')}</label>
      <div class="campo">${tr('Cuándo')}<select id="waEc"><option value="en">${tr('Una vez')}</option><option value="cron">${tr('Repetir (cron)')}</option></select></div>
      <div class="campo" id="waEfe"><input id="waEe" type="datetime-local"></div>
      <div class="campo" id="waEfc" style="display:none"><input id="waEr" class="mono" placeholder="0 8 * * *"><small class="tenue">${tr('Ej.: 0 8 * * * = cada día a las 8:00')}</small></div>` : ''}`,
    alAbrir: x => {
      WA_engancharArchivos(x);
      if (programado) $('#waEc', x).onchange = e => { const c = e.target.value === 'cron'; $('#waEfc', x).style.display = c ? 'flex' : 'none'; $('#waEfe', x).style.display = c ? 'none' : 'flex'; };
    },
    botones: [{ txt: 'Cancelar', valor: null }, { txt: programado ? 'Programar' : 'Enviar', cls: 'pri', valor: async x => {
      const v = c => $(c, x)?.value.trim() || '';
      const b = { destino: v('#waEd') };
      if (v('#waEt')) b.texto = v('#waEt');
      if (v('input.wa-r')) { b.foto = v('input.wa-r'); if (v('#waEp')) b.pie = v('#waEp'); }
      if (v('#waEv')) b.voz = v('#waEv');
      try {
        if (programado) {
          if (v('#waEi')) { b.ia = v('#waEi'); b.iaVoz = $('#waEiv', x).checked; }
          if ($('#waEc', x).value === 'cron') b.cron = v('#waEr'); else b.en = v('#waEe');
          await api('POST', '/whatsapp/programados', b); aviso('Programado');
        } else { await api('POST', '/whatsapp/enviar', b); aviso('Enviado'); }
        VISTAS.whatsapp.refrescar(); return true;
      } catch (e) { aviso(e.message, true); return false; }
    } }] });
}

async function WA_contacto() {
  await modal({ titulo: 'Añadir contacto', ancho: 440,
    cuerpo: `<div class="campo">${tr('Nombre')}<input id="waCn"></div><div class="campo">${tr('Número con código de país')}<input id="waCt" class="mono" placeholder="+1 305 555 1234"></div>`,
    botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: async x => {
      try { await api('POST', '/whatsapp/contactos', { nombre: $('#waCn', x).value.trim(), numero: $('#waCt', x).value.trim() }); aviso('Contacto guardado'); VISTAS.whatsapp.refrescar(); return true; }
      catch (e) { aviso(e.message, true); return false; }
    } }] });
}

VISTAS.whatsapp = {
  async pintar(v) {
    this.v = v;
    v.innerHTML = `<div class="pagina">${cabecera('WhatsApp', 'Programa lo que APOLO hace con tus mensajes: responder solo, mandar fotos y notas de voz.',
      `<button class="btn" data-a="enviar">${tr('Enviar ahora')}</button><button class="btn" data-a="programar">${tr('Programar envío')}</button><button class="btn pri" data-a="regla">${ic('mas')}${tr('Nueva regla')}</button>`)}
      <div id="waCuerpo"></div></div>`;
    v.onclick = e => this.clic(e);
    await this.refrescar();
  },
  async refrescar() {
    const c = $('#waCuerpo', this.v); if (!c) return;
    const [estado, R, P2, H, A] = await Promise.all([
      api('GET', '/whatsapp').catch(() => null), api('GET', '/whatsapp/reglas').catch(() => ({ reglas: [] })), api('GET', '/whatsapp/programados').catch(() => []),
      api('GET', '/whatsapp/historial?n=40').catch(() => []), api('GET', '/whatsapp/contactos').catch(() => []) ]);
    this.reglas = R.reglas;
    const conectado = estado?.conectado;
    c.innerHTML = `${conectado ? `<div class="flex" style="margin-bottom:6px"><span class="chip ok">${tr('Conectado')}</span>${estado.numero ? `<span class="tenue mono">+${esc(estado.numero)}</span>` : ''}</div>` : `<div class="caja pad" style="margin-bottom:12px"><span class="chip mal">${tr('WhatsApp no está conectado. Vincúlalo en Configuración → Canales.')}</span></div>`}
      <div class="seccion">${tr('Reglas')} <span class="n">${R.reglas.length}</span></div>
      <div class="caja">${R.reglas.length ? R.reglas.map(r => `<div class="fila-a"><div class="t"><b>${esc(r.nombre)}</b><small>${esc(r.todos ? tr('Cualquiera') : r.contactos.map(x => x.nombre || `+${x.numero}`).join(', '))} · ${esc(r.palabras.length ? `${tr('si dice')} ${r.palabras.join(', ')}` : tr('todo mensaje'))}<br>→ ${esc(r.hacer.map(WA_resumenAccion).join(' · '))}</small></div><div class="c flex" style="flex-wrap:nowrap">${sw(`regla:${r.id}`, r.activa)}<button class="btn mini" data-editar="${esc(r.id)}">${tr('Editar')}</button><button class="btn mini mal" data-borrar="${esc(r.id)}">${tr('Borrar')}</button></div></div>`).join('') : `<p class="tenue" style="padding:14px;margin:0">${tr('Aún no hay reglas. Crea una para que APOLO responda solo a quien tú digas.')}</p>`}</div>
      <div class="seccion">${tr('Envíos programados')} <span class="n">${P2.length}</span></div>
      <div class="caja">${P2.length ? P2.map(t => `<div class="fila-a"><div class="t"><b>${esc(t.nombre)}</b><small>${esc(t.cuandoTxt)}${t.ultimoResultado ? ` · ${esc(String(t.ultimoResultado).slice(0, 120))}` : ''}</small></div><div class="c"><button class="btn mini mal" data-borrarp="${esc(t.id)}">${tr('Borrar')}</button></div></div>`).join('') : `<p class="tenue" style="padding:14px;margin:0">${tr('Nada programado.')}</p>`}</div>
      <div class="seccion flex" style="justify-content:space-between"><span>${tr('Agenda')} <span class="n">${A.length}</span></span><button class="btn mini" data-a="contacto">${tr('Añadir contacto')}</button></div>
      <div class="caja" style="max-height:260px;overflow:auto">${A.length ? A.map(x => `<div class="fila-a"><div class="t"><b>${esc(x.nombre || '—')}</b><small class="mono">+${esc(x.numero)}${x.agenda ? ` · ${tr('agenda')}` : ''}</small></div><div class="c"><button class="btn mini mal" data-borrarc="${esc(x.jid)}">${tr('Quitar')}</button></div></div>`).join('') : `<p class="tenue" style="padding:14px;margin:0">${tr('La agenda está vacía. Aquí aparece quien te escribe, y puedes añadir a quien quieras.')}</p>`}</div>
      <div class="seccion">${tr('Registro')}</div>
      <div class="caja" style="max-height:320px;overflow:auto">${H.length ? H.map(h => `<div class="fila-a"><div class="t"><b>${h.ok === false ? '⚠ ' : ''}${esc(h.a || '')}</b><small>${esc(h.resumen || '')}<br><span class="tenue">${esc(h.origen || '')} · ${esc(WA_cuando(h.t))}</span></small></div></div>`).join('') : `<p class="tenue" style="padding:14px;margin:0">${tr('Todavía no ha salido nada.')}</p>`}</div>`;
    $$('[data-sw^="regla:"]', c).forEach(b => { b.onclick = async ev => { ev.stopPropagation(); const id = b.dataset.sw.slice(6), on = b.getAttribute('aria-checked') !== 'true'; try { await api('PATCH', `/whatsapp/reglas/${id}`, { activa: on }); b.setAttribute('aria-checked', on); } catch (e) { aviso(e.message, true); } }; });
  },
  async clic(e) {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'regla') return WA_editarRegla();
    if (a === 'enviar') return WA_envio(false);
    if (a === 'programar') return WA_envio(true);
    if (a === 'contacto') return WA_contacto();
    const ed = e.target.closest('[data-editar]'); if (ed) return WA_editarRegla(this.reglas.find(r => r.id === ed.dataset.editar));
    const del = e.target.closest('[data-borrar]');
    if (del && await modal({ titulo: '¿Borrar esta regla?', botones: [{ txt: 'Cancelar', valor: false }, { txt: 'Borrar', cls: 'mal pri', valor: true }] })) { await api('DELETE', `/whatsapp/reglas/${del.dataset.borrar}`).catch(er => aviso(er.message, true)); return this.refrescar(); }
    const dp = e.target.closest('[data-borrarp]'); if (dp) { await api('DELETE', `/whatsapp/programados/${dp.dataset.borrarp}`).catch(er => aviso(er.message, true)); return this.refrescar(); }
    const dc = e.target.closest('[data-borrarc]'); if (dc) { await api('DELETE', `/whatsapp/contactos/${encodeURIComponent(dc.dataset.borrarc)}`).catch(er => aviso(er.message, true)); return this.refrescar(); }
  },
  alEvento(e) { if (e.tipo === 'whatsapp') { clearTimeout(this.rt); this.rt = setTimeout(() => this.refrescar(), 300); } },
  salir() { clearTimeout(this.rt); },
};
