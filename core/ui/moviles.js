// Robot Companion · panel — Configuración → Dispositivos → "App móvil": activar el acceso de móviles de la LAN,
// "Conectar móvil" (QR con código de un solo uso, 5 min) y la lista de móviles emparejados (renombrar, revocar, push de prueba).
// API: /v1/movil (core/movil.js). Globales con prefijo MOVIL_.
'use strict';
const MOVIL_UI = {
  async pintar(caja) {
    if (!caja) return;
    let d; try { d = await api('GET', '/movil'); } catch (e) { caja.innerHTML = `<p class="tenue">${esc(e.message)}</p>`; return; }
    const chips = m => [m.bloqueado ? `<span class="chip mal">${tr('bloqueado')}</span>` : '', m.passkeys ? `<span class="chip ok">${tr('huella')}</span>` : '', m.push ? `<span class="chip ok">${tr('push')}</span>` : ''].join('');
    caja.innerHTML = `<div class="seccion">${tr('App móvil')}</div>
      <div class="caja">${fila('Acceso de móviles en la red local', d.activo
        ? tr('Activo: los móviles de tu Wi-Fi pueden abrir la app (solo /m/) con su propio token. Nada más de la red entra.')
        : tr('Apagado: ningún móvil de la red puede entrar.'),
        `${sw('movAct', d.activo)}`)}
        ${fila('Conectar móvil', tr('Enseña un QR de un solo uso (5 min). El móvil elige un PIN y recibe su propio token; el maestro nunca sale de aquí.'),
        `<button class="btn pri" id="movQr">${ic('movil')}${tr('Conectar móvil')}</button>`)}
        ${fila('URL pública (HTTPS)', tr('Opcional. Si entras por Tailscale o un túnel con Access, el QR apuntará aquí (huella, push y voz necesitan HTTPS).'),
        `<input id="movUrl" class="mono" placeholder="https://pc.tailnet.ts.net" value="${esc(d.urlMovil || '')}" style="width:220px"><button class="btn" id="movUrlOk">${tr('Guardar')}</button>`)}</div>
      <div class="seccion">${tr('Móviles emparejados')} <span class="n">${d.dispositivos.length}</span></div>
      <div class="caja" id="movLista">${d.dispositivos.length ? d.dispositivos.map(m => fila(`<span class="flex">${ic('movil')}${esc(m.nombre)}</span>`,
        esc([m.so, m.ip, tr('visto {x}', { x: hace(m.ultimo) })].filter(Boolean).join(' — ')),
        `${chips(m)}${m.push ? `<button class="btn fantasma mini" data-mov="push" data-id="${esc(m.id)}">${tr('Probar aviso')}</button>` : ''}
         <button class="btn fantasma mini" data-mov="nombre" data-id="${esc(m.id)}">${tr('Renombrar')}</button>
         <button class="btn fantasma mini mal-txt" data-mov="revocar" data-id="${esc(m.id)}">${tr('Revocar')}</button>`)).join('')
        : `<p class="tenue" style="padding:12px 14px;margin:0">${tr('Ninguno todavía.')}</p>`}</div>
      <p class="tenue" style="font-size:12px;margin-top:10px">${tr('En http por la red local funcionan el chat, los permisos (lo peligroso con PIN), las tarjetas y el turno. La huella, los avisos push y la voz necesitan HTTPS: túnel de Cloudflare con Access o Tailscale (docs/movil.md).')}</p>`;
    $('[data-sw="movAct"]', caja).onclick = async e => {
      const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
      try { await api('PATCH', '/movil/config', { activo: on }); aviso(on ? 'Acceso de móviles activado' : 'Acceso de móviles desactivado'); } catch (er) { aviso(er.message, true); }
      this.pintar(caja);
    };
    $('#movQr', caja).onclick = () => this.qr(caja, d);
    $('#movUrlOk', caja).onclick = async () => {
      try { await api('PATCH', '/movil/config', { urlMovil: $('#movUrl', caja).value.trim() }); aviso('Guardado'); this.pintar(caja); } catch (e) { aviso(e.message, true); }
    };
    $('#movLista', caja).onclick = async e => {
      const b = e.target.closest('[data-mov]'); if (!b) return;
      const id = encodeURIComponent(b.dataset.id), m = d.dispositivos.find(x => x.id === b.dataset.id);
      if (b.dataset.mov === 'push') { const r = await api('POST', `/movil/dispositivos/${id}/push-prueba`).catch(er => ({ error: er.message })); aviso(r.ok ? 'Aviso enviado' : (r.error || 'El servicio push no lo aceptó'), !r.ok); return; }
      if (b.dataset.mov === 'nombre') {
        const nombre = await modal({ titulo: 'Renombrar móvil', cuerpo: `<input id="movNom" maxlength="40" value="${esc(m?.nombre || '')}" style="width:100%">`, botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: v => $('#movNom', v).value.trim() || false }] });
        if (nombre) { await api('PATCH', `/movil/dispositivos/${id}`, { nombre }).catch(er => aviso(er.message, true)); this.pintar(caja); }
        return;
      }
      if (!await modal({ titulo: 'Revocar móvil', cuerpo: tr('{x} dejará de tener acceso al momento. Para volver a usarlo tendrá que escanear un QR nuevo.', { x: esc(m?.nombre || '') }), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Revocar', cls: 'mal', valor: true }] })) return;
      await api('DELETE', `/movil/dispositivos/${id}`).catch(er => aviso(er.message, true));
      this.pintar(caja);
    };
  },
  async qr(caja, d) {
    if (!d.activo) {
      const ok = await modal({ titulo: 'Activar el acceso de móviles', cuerpo: `<p class="suave" style="margin:0">${tr('Para que el móvil llegue hasta aquí por tu Wi-Fi hay que activar el acceso de móviles. Solo se abre la app móvil y solo con un token de dispositivo; el resto sigue cerrado.')}</p>`,
        botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Activar y seguir', cls: 'pri', valor: true }] });
      if (!ok) return;
      try { await api('PATCH', '/movil/config', { activo: true }); } catch (e) { return aviso(e.message, true); }
    }
    let ip = (d.lan[0] || {}).ip, c, fin = false;
    const n0 = d.dispositivos.length;
    const nuevo = async () => { try { c = await api('POST', '/movil/emparejar', { ip }); } catch (e) { aviso(e.message, true); return false; } return true; };
    if (!await nuevo()) return;
    const cuerpo = () => `<div class="mq">
        <div class="mq-qr">${c.svg}</div>
        <div class="mq-tx"><ol class="mq-pasos"><li>${tr('Abre la cámara del móvil y apunta al código.')}</li><li>${tr('Toca el enlace, elige un nombre y un PIN.')}</li><li>${tr('Listo: añádela a la pantalla de inicio.')}</li></ol>
          ${d.lan.length > 1 ? `<div class="mq-ips">${seg('movIp', d.lan.map(x => [x.ip, `${x.ip}`]), ip)}</div>` : ''}
          <div class="mq-url mono" title="${esc(c.url)}">${esc(c.url.replace(/#par=.*/, '#par=…'))}</div>
          <div class="mq-pie"><span class="punto aviso"></span><span id="mqCuenta"></span></div></div></div>`;
    modal({ titulo: 'Conectar móvil', ancho: 620, cuerpo: cuerpo(), botones: [{ txt: 'Nuevo código', valor: () => { nuevo().then(ok => { if (ok) pintarCuerpo(); }); return false; } }, { txt: 'Cerrar', cls: 'pri', valor: null }],
      alAbrir: v => { MOVIL_UI.v = v; } }).then(() => { fin = true; this.pintar(caja); });
    const v = MOVIL_UI.v;
    const pintarCuerpo = () => { const b = $('.cuerpo', v); if (b) { b.innerHTML = cuerpo(); enlazarIps(); } };
    const enlazarIps = () => { const g = $('[data-seg="movIp"]', v); if (g) g.onclick = async e => { const b = e.target.closest('button'); if (!b) return; ip = b.dataset.v; if (await nuevo()) pintarCuerpo(); }; };
    enlazarIps();
    const tic = async () => {
      if (fin || !v.isConnected) return;
      const s = Math.max(0, Math.round((c.expira - Date.now()) / 1000));
      const cu = $('#mqCuenta', v); if (cu) cu.textContent = s ? tr('Caduca en {m}:{s}', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') }) : tr('Caducado: pide un código nuevo');
      if (s % 2 === 0) {
        const x = await api('GET', '/movil').catch(() => null);
        if (x && x.dispositivos.length > n0 && !fin) {
          const m = x.dispositivos[x.dispositivos.length - 1];
          const b = $('.cuerpo', v);
          if (b) b.innerHTML = `<div class="mq-ok">${ic('check')}<b>${tr('{x} conectado', { x: esc(m.nombre) })}</b><span class="tenue">${tr('Ya puedes usar la app desde el móvil.')}</span></div>`;
          fin = true; return;
        }
      }
      setTimeout(tic, 1000);
    };
    tic();
  },
};
