// Ajustes de la R1: volumen y brillo (toque para editar, la rueda cambia el valor, toque otra vez para salir),
// reconectar, el panel completo del PC (pesado) y los ajustes de Android.
const barra = (v, max) => { const n = Math.round(Math.max(0, Math.min(1, v / max)) * 10); return '█'.repeat(n) + '░'.repeat(10 - n); };

let os, lista, editando = '';

function leer() {
  const n = os.nativo;
  const a = n?.audio ? JSON.parse(n.audio()) : null, b = n?.brillo ? JSON.parse(n.brillo()) : null;
  return { a, b };
}
function pintar() {
  const { a, b } = leer(), sinNativo = 'actualiza ApoloOS para usarlo';
  lista.poner([
    { id: 'vol', ico: '♪', titulo: a ? `Volumen ${barra(a.volumen, a.max)}` : 'Volumen', der: a ? `${a.volumen}/${a.max}` : '', clase: editando === 'vol' ? 'editando' : '',
      sub: editando === 'vol' ? 'rueda: cambiar · toque: listo' : a ? 'toque para cambiar' : sinNativo, accion: () => editar('vol', !!a) },
    { id: 'bri', ico: '☀', titulo: b ? `Brillo ${barra(b.nivel, 255)}` : 'Brillo', der: b ? `${Math.round(b.nivel / 2.55)}%` : '', clase: editando === 'bri' ? 'editando' : '',
      sub: editando === 'bri' ? 'rueda: cambiar · toque: listo' : b ? `toque para cambiar${b.sistema ? '' : ' (solo en ApoloOS)'}` : sinNativo, accion: () => editar('bri', !!b) },
    { id: 'con', ico: '⟳', titulo: 'Reconectar con APOLO', sub: 'recarga la pantalla', accion: () => os.nativo?.reintentar?.() },
    { id: 'panel', ico: '▦', titulo: 'Panel completo del PC', sub: 'pesado: la web entera de escritorio', accion: () => os.nativo?.panel?.('') },
    { id: 'android', ico: '⚙', titulo: 'Ajustes de Android', sub: 'WiFi, Bluetooth, sistema', accion: () => os.nativo?.ajustesAndroid?.() },
    { id: 'info', ico: 'i', titulo: 'Acerca de ApoloOS', accion: () => {
      const v = os.nativo ? JSON.parse(os.nativo.config() || '{}') : {};
      os.aviso('ApoloOS', `Versión ${v.version || '?'} · nodo ${v.id || '?'}\nPC: ${v.pc || location.host}\nSistema por módulos sobre APOLO.`);
    } },
  ]);
}
function editar(que, posible) { if (!posible) return; editando = editando === que ? '' : que; pintar(); }

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-lista" style="top:4px"></div>';
    lista = os.crearLista(el.querySelector('.m-lista'));
    editando = '';
    pintar();
  },
  tecla(t) {
    if (editando && (t === 'arriba' || t === 'abajo')) {
      const d = t === 'abajo' ? 1 : -1;                 // abajo = subir (la rueda hacia ti)
      if (editando === 'vol') os.nativo.volumen(d);
      else { const b = JSON.parse(os.nativo.brillo()); os.nativo.ponerBrillo(Math.max(5, Math.min(255, b.nivel + d * 25))); }
      pintar();
      return true;
    }
    if (editando && t === 'doble') { editando = ''; pintar(); return true; }
    return lista?.tecla(t);
  },
  cerrar() { editando = ''; lista = null; },
};
