// Rutas del servidor local (127.0.0.1:47823, con la clave del hook) para el Stream Deck y otros mandos físicos:
//   POST /escuchar            micrófono de la isla (como Ctrl+Alt+Espacio)
//   POST /panel?ruta=/uso     abre el panel de control en esa página
//   POST /texto {texto}       mensaje rápido al robot (mismo enrutado que la isla; la respuesta sale en la isla)
//   POST /panico?a=reanudar   sin "a" = activar el pánico; a=alternar = activar o reanudar según esté
//   POST /gamer               Modo Gamer: alterna activar/desactivar
//   POST /enfocar             trae al frente la terminal que pide permiso (o la última que habló)
// El estado de las teclas sale de GET /state (main.js stateForDevices).

// d = { getWin, getNucleo, abrirPanel, handleText, focusTerminal, ultimaSesion }
function crearDispositivos(d) {
  const leerCuerpo = req => new Promise(ok => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 64 * 1024) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } });
  });
  const responder = (res, code, obj) => { res.writeHead(code, obj ? { 'content-type': 'application/json' } : undefined); res.end(obj ? JSON.stringify(obj) : undefined); };

  // devuelve true si la ruta era suya
  function atender(req, res) {
    if (req.method !== 'POST') return false;
    const u = new URL(req.url, 'http://x'), ruta = u.pathname, win = d.getWin(), n = d.getNucleo();
    if (ruta === '/escuchar') {
      if (win && !win.isDestroyed()) win.webContents.send('listen-key');
      responder(res, 200); return true;
    }
    if (ruta === '/panel') {
      const r = String(u.searchParams.get('ruta') || '').replace(/[^\w/-]/g, '').slice(0, 60);
      d.abrirPanel(r && r !== '/inicio' ? (r.startsWith('/') ? r : '/' + r) : '');
      responder(res, n ? 200 : 503); return true;
    }
    if (ruta === '/texto') {
      leerCuerpo(req).then(async b => {
        const texto = String(b.texto || '').trim().slice(0, 2000);
        if (!texto) return responder(res, 400, { error: 'texto vacío' });
        try { const r = await d.handleText(texto, 'isla'); responder(res, 200, { ok: true, msg: (r && r.msg) || '' }); }
        catch (e) { responder(res, 500, { error: e.message }); }
      });
      return true;
    }
    if (ruta === '/panico') {
      if (!n || !n.panico) { responder(res, 503); return true; }
      const a = u.searchParams.get('a') || 'activar';
      const activo = n.panico.activo();
      if (a === 'reanudar' || (a === 'alternar' && activo)) n.panico.reanudar('streamdeck');
      else n.panico.activar('streamdeck');
      responder(res, 200, { activo: n.panico.activo() }); return true;
    }
    if (ruta === '/gamer') {
      if (!n || !n.gamer) { responder(res, 503); return true; }
      const activo = !!(n.gamer.estado && n.gamer.estado().activo);
      Promise.resolve(n.gamer.http('POST', ['v1', 'gamer', activo ? 'desactivar' : 'activar'], {}, {}))
        .then(() => responder(res, 200, { activo: !activo }), e => responder(res, 500, { error: e.message }));
      return true;
    }
    if (ruta === '/enfocar') {
      const sid = d.ultimaSesion();
      if (!sid) { responder(res, 404); return true; }
      Promise.resolve(d.focusTerminal(sid)).then(ok => responder(res, ok ? 200 : 409));   // 409 = sesión conocida pero sin ventana localizada
      return true;
    }
    return false;
  }
  return { atender };
}

module.exports = { crearDispositivos };
