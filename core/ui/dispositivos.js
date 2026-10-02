// Robot Companion · panel — Configuración → Dispositivos (nodos de hardware: el ojo de escritorio ESP32…).
// Emparejar = escribir el código de 6 dígitos que enseña la pantalla del ojo. API: /v1/nodos (core/nodos).
'use strict';
(AJUSTES.find(([g]) => g === 'Conexiones') || AJUSTES[0])[1].push(['dispositivos', 'Dispositivos', 'ojo']);

VISTAS['ajustes/dispositivos'] = {
  claves: 'dispositivos ojo esp32 hardware nodos emparejar pantalla gc9a01 robot físico',
  async pintar(v) {
    clearInterval(this.t);
    let d; try { d = await api('GET', '/nodos'); } catch (e) { v.innerHTML = `<div class="pagina estrecha">${cabecera('Dispositivos')}<p class="tenue">${esc(e.message)}</p></div>`; return; }
    const chip = n => n.conectado ? `<span class="chip ok"><span class="punto ok"></span>${tr('conectado')}</span>` : `<span class="chip">${tr('desconectado')}</span>`;
    v.innerHTML = `<div class="pagina estrecha">${cabecera('Dispositivos', 'El cuerpo físico del robot: el ojo de escritorio (ESP32 + pantalla redonda) y, más adelante, la Pi o el humanoide.')}
      <div id="movilSec"></div>
      <div class="seccion">${tr('Ojo de escritorio')}</div>
      <div class="caja">${fila('Aceptar dispositivos de la red', d.activo
        ? tr('Escuchando en el puerto {p} solo para la red local. Cada dispositivo necesita emparejarse una vez.', { p: d.puerto })
        : tr('Apagado: no se abre ningún puerto. Actívalo para conectar el ojo de escritorio.'),
        `<button class="btn ${d.activo ? '' : 'pri'}" id="dispAct">${tr(d.activo ? 'Desactivar' : 'Activar')}</button>`)}</div>
      <div class="seccion">${tr('Emparejar')}</div>
      <div class="caja">${fila('Código de la pantalla', d.esperando.length
        ? tr('{n} dispositivo(s) esperando: {x}', { n: d.esperando.length, x: esc(d.esperando.map(e => `${e.nombre} (${e.ip})`).join(', ')) })
        : tr('Enciende el ojo: te enseña un código de 6 dígitos. Escríbelo aquí.'),
        `<input id="dispCod" class="mono" inputmode="numeric" maxlength="6" placeholder="000000" style="width:110px"><button class="btn pri" id="dispEmp">${tr('Emparejar')}</button>`)}</div>
      <div class="seccion">${tr('Emparejados')} <span class="n">${d.nodos.length}</span></div>
      <div class="caja" id="dispLista">${d.nodos.length ? d.nodos.map(n => fila(`<span class="flex">${ic('ojo')}${esc(n.nombre)}</span>`,
        esc([n.modelo, n.version && 'v' + n.version, n.ip, (n.capacidades || []).map(c => tr(c)).join(' · ')].filter(Boolean).join(' — ')),
        `${chip(n)}<button class="btn fantasma mini" data-disp="gesto" data-id="${esc(n.id)}" ${n.conectado ? '' : 'disabled'}>${tr('Saludar')}</button>
         <button class="btn fantasma mini" data-disp="olvidar" data-id="${esc(n.id)}">${tr('Olvidar')}</button>`)).join('')
        : `<p class="tenue" style="padding:12px 14px;margin:0">${tr('Ninguno todavía. Sin hardware puedes probar con el simulador: tools/simulador-ojo.html')}</p>`}</div>
      <p class="tenue" style="font-size:12px;margin-top:12px">${tr('Botón del ojo: corta = Permitir · mantener = Denegar (o hablar si no hay permiso) · doble = pánico. Los permisos peligrosos solo se aprueban en el PC.')}</p></div>`;
    MOVIL_UI.pintar($('#movilSec'));
    $('#dispAct').onclick = async () => {
      try { await api('POST', '/nodos/activar', { activo: !d.activo }); } catch (e) { aviso(e.message, true); }
      this.pintar(v);
    };
    const emparejar = async () => {
      const codigo = $('#dispCod').value.replace(/\D/g, '');
      if (codigo.length !== 6) return aviso('Son 6 dígitos', true);
      try { const r = await api('POST', '/nodos/emparejar', { codigo }); aviso(tr('✓ {x} emparejado', { x: r.nodo.nombre })); this.pintar(v); }
      catch (e) { aviso(e.message, true); }
    };
    $('#dispEmp').onclick = emparejar;
    $('#dispCod').onkeydown = e => { if (e.key === 'Enter') emparejar(); };
    $('#dispLista').onclick = async e => {
      const b = e.target.closest('[data-disp]'); if (!b) return;
      if (b.dataset.disp === 'gesto') { await api('POST', `/nodos/${encodeURIComponent(b.dataset.id)}/gesto`, { gesto: 'feliz' }).catch(er => aviso(er.message, true)); return; }
      if (!await modal({ titulo: 'Olvidar dispositivo', cuerpo: tr('Tendrá que emparejarse otra vez con un código nuevo.'), botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Olvidar', cls: 'mal', valor: true }] })) return;
      await api('DELETE', `/nodos/${encodeURIComponent(b.dataset.id)}`).catch(er => aviso(er.message, true));
      this.pintar(v);
    };
    // refresco suave mientras la página está abierta (conectado / esperando), sin pisar lo que escribes
    this.t = setInterval(async () => {
      if (!document.body.contains(v) || !location.hash.includes('dispositivos')) return clearInterval(this.t);
      if (document.activeElement?.id === 'dispCod') return;
      const n = await api('GET', '/nodos').catch(() => null);
      if (n && JSON.stringify([n.activo, n.esperando.length, n.nodos.map(x => [x.id, x.conectado])]) !== JSON.stringify([d.activo, d.esperando.length, d.nodos.map(x => [x.id, x.conectado])])) this.pintar(v);
    }, 3000);
  },
  salir() { clearInterval(this.t); },
};
