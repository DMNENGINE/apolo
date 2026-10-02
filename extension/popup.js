const $ = id => document.getElementById(id);
const TEXTOS = {
  conectado: 'Conectado al robot', ocupado: 'En espera: el robot ya está usando otro navegador', 'sin-robot': 'No encuentro el robot (¿está abierto?)', token: 'Token incorrecto',
  'sin-token': 'Falta el token', apagado: 'Desactivado', error: 'Error del robot',
};
async function pintar() {
  const { estado = '' } = await chrome.storage.session.get('estado');
  $('punto').className = 'p ' + estado;
  $('txt').textContent = TEXTOS[estado] || 'Conectando…';
}
(async () => {
  const c = await chrome.storage.local.get({ token: '', activo: true });
  $('token').value = c.token; $('activo').checked = c.activo;
  chrome.runtime.sendMessage({ tipo: 'nombre' }, r => { if (r && r.nombre && r.nombre !== 'Robot') $('nom').textContent = r.nombre; });
  pintar();
})();
$('guardar').onclick = async () => {
  await chrome.storage.local.set({ token: $('token').value.trim(), activo: $('activo').checked });
  chrome.runtime.sendMessage({ tipo: 'reconectar' });
  $('txt').textContent = 'Conectando…';
};
$('activo').onchange = () => chrome.storage.local.set({ activo: $('activo').checked });
chrome.storage.session.onChanged.addListener(pintar);
