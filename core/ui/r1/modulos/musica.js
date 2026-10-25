// Música: tu Spotify en la R1. Arriba lo que suena (sesión multimedia leída por ApoloOS: R1.musica / evento 'musica'),
// abajo los controles, "Pon…" por voz (Spotify busca y reproduce) y, con la Web API vinculada (core/spotify), tus playlists,
// guardadas y recientes, que suenan directo en la R1 por Spotify Connect.
// rueda = elegir · toque = hacer · en una lista de canciones/playlists: toque = ponerla
const tiempo = ms => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let os, lista, sonando, tProg = 0, est = {}, sp = { vinculado: false }, vista = 'inicio', esperando = false;

function leer() { try { return JSON.parse(os.nativo?.musica?.() || '{}'); } catch { return {}; } }
function pintarSonando() {
  const e = est;
  if (!os.nativo?.musica) { sonando.innerHTML = '<p class="vacio" style="margin:8px">Actualiza ApoloOS para la música.</p>'; return; }
  if (e.permiso === false) { sonando.innerHTML = '<p class="mu-nada">Falta activar el permiso de ApoloOS para leer la música (se hace una vez desde el PC).</p>'; return; }
  if (!e.app) { sonando.innerHTML = `<p class="mu-nada">${e.spotify ? 'No suena nada. Pulsa «Pon…» y dile qué quieres oír.' : 'Spotify no está instalado en la R1.'}</p>`; return; }
  const pct = e.dur ? Math.min(100, (e.pos || 0) / e.dur * 100) : 0;
  sonando.innerHTML = `${e.arte ? `<img class="mu-arte" src="${e.arte}" alt="">` : '<span class="mu-arte mu-sin">♫</span>'}
    <div class="mu-info"><b>${os.esc(e.titulo || '—')}</b><small>${os.esc(e.artista || '')}</small>
    <div class="mu-barra"><i style="width:${pct.toFixed(1)}%"></i></div><small class="mu-t">${e.sonando ? '▶' : '❚❚'} ${tiempo(e.pos)} / ${tiempo(e.dur)}</small></div>`;
}
function tic() { if (est.sonando && est.dur) { est.pos = Math.min(est.dur, (est.pos || 0) + 1000); pintarSonando(); } }

function control(a) { os.nativo?.musicaControl?.(a); setTimeout(() => { est = leer(); pintarSonando(); pintarInicio(); }, 400); }
function filasInicio() {
  const f = [
    { id: 'pp', ico: est.sonando ? '❚❚' : '▶', titulo: est.sonando ? 'Pausa' : 'Reproducir', accion: () => control('alternar') },
    { id: 'sig', ico: '⏭', titulo: 'Siguiente', accion: () => control('siguiente') },
    { id: 'ant', ico: '⏮', titulo: 'Anterior', accion: () => control('anterior') },
    { id: 'pon', ico: '◉', titulo: 'Pon… (dictar)', sub: 'mantén el botón y di qué quieres oír', accion: dictar },
  ];
  if (sp.vinculado) f.push(
    { id: 'pl', ico: '☰', titulo: 'Mis playlists', accion: () => verLista('playlists') },
    { id: 'gu', ico: '♥', titulo: 'Canciones que me gustan', accion: () => verLista('guardadas') },
    { id: 're', ico: '↺', titulo: 'Escuchado hace poco', accion: () => verLista('recientes') },
  );
  else f.push({ id: 'vin', ico: '⚿', titulo: 'Vincular mi cuenta (playlists)', sub: sp.configurado ? 'se abre el login en el PC' : 'falta el Client ID de Spotify en el PC', accion: vincular });
  f.push({ id: 'app', ico: '⤢', titulo: 'Abrir la app de Spotify', sub: 'para iniciar sesión o explorar', accion: () => { if (!os.nativo?.abrirSpotify?.()) os.aviso('Spotify', 'Spotify no está instalado en la R1.'); } });
  return f;
}
function pintarInicio() { if (vista === 'inicio' && lista) lista.poner(filasInicio()); }

async function verLista(que) {
  vista = que;
  const TIT = { playlists: 'Mis playlists', guardadas: 'Me gustan', recientes: 'Recientes' };
  lista.poner([{ id: 'c', ico: '…', titulo: 'Cargando…' }], false);
  try {
    const L = await os.api(`/v1/spotify/${que}`);
    if (vista !== que) return;
    lista.poner([{ id: 'atras', ico: '←', titulo: `Volver · ${TIT[que]}`, accion: () => { vista = 'inicio'; lista.poner(filasInicio(), false); } },
      ...(que === 'guardadas' ? [{ id: 'todas', ico: '⤮', titulo: 'Poner todas (aleatorio)', accion: () => poner('spotify:collection') }] : []),
      ...L.map(x => ({ id: x.uri, ico: '♫', titulo: x.nombre, sub: x.artista || (x.canciones != null ? `${x.canciones} canciones${x.dueno ? ' · ' + x.dueno : ''}` : x.dueno || ''), accion: () => poner(x.uri) }))], false);
  } catch (e) { vista = 'inicio'; lista.poner(filasInicio(), false); os.aviso('Spotify', e.message); }
}
async function poner(uri) {
  os.toast('Poniendo…');
  try {
    const r = await os.api('/v1/spotify/poner', { method: 'POST', body: JSON.stringify({ uri }) });
    if (r.abrir) { os.nativo?.musicaUri?.(r.abrir); os.toast('Abriendo en Spotify…'); } else os.toast(`Sonando en ${r.dispositivo || 'la R1'}`);
  } catch (e) { if (!os.nativo?.musicaUri?.(uri)) os.aviso('No se pudo', e.message); }
}
async function vincular() {
  if (!sp.configurado) return os.aviso('Vincular Spotify', `Falta crear la app en developer.spotify.com (gratis) y poner su Client ID en APOLO.\nRedirect URI: ${sp.redirect || 'http://127.0.0.1:47900/spotify/callback'}`);
  try { await os.api('/v1/spotify/vincular', { method: 'POST' }); os.aviso('Vincular Spotify', 'Se abrió el login de Spotify en el navegador del PC: acepta allí y vuelve.'); }
  catch (e) { os.aviso('No se pudo', e.message); }
}
async function dictar() {
  if (!os.nativo?.musicaPoner) return os.aviso('Música', 'Actualiza ApoloOS en la R1.');
  try { await os.api(`/v1/nodos/${encodeURIComponent(await os.miNodo())}/modo`, { method: 'POST', body: JSON.stringify({ modo: 'dictado' }) }); }
  catch (e) { return os.aviso('Pon…', e.message); }
  esperando = true;
  os.carta({ titulo: '¿Qué pongo?', texto: 'Mantén el botón y dilo.\nEj.: "Bad Bunny", "rock de los 80", "mi playlist de gym"', opciones: [['Cancelar', cancelar]] });
}
function cancelar() {
  esperando = false;
  os.miNodo().then(id => os.api(`/v1/nodos/${encodeURIComponent(id)}/modo`, { method: 'POST', body: '{"modo":null}' })).catch(() => { });
}

export default {
  async abrir(el, o) {
    os = o; vista = 'inicio';
    el.innerHTML = '<section class="mu-sonando"></section><div class="m-lista mu-lista"></div>';
    sonando = el.querySelector('.mu-sonando');
    lista = os.crearLista(el.querySelector('.mu-lista'));
    est = leer(); pintarSonando(); lista.poner(filasInicio());
    sp = await os.api('/v1/spotify/estado').catch(() => ({ vinculado: false }));
    pintarInicio();
    tProg = setInterval(tic, 1000);
  },
  tecla: t => lista?.tecla(t),
  alPtt(fase) { if (fase === 'fin' && esperando) { os.cerrarCarta(); os.toast('Buscando en Spotify…', 4); return true; } return false; },
  nodo(m) {
    if (m.tipo !== 'dictado' || !esperando) return;
    esperando = false;
    if (m.texto) { os.nativo.musicaPoner(m.texto); os.toast(`Poniendo «${m.texto.slice(0, 30)}»…`, 5); } else os.toast('No te entendí');
  },
  // la parte nativa avisa cada vez que cambia lo que suena (R1recibe('musica')): r1.js lo reenvía aquí
  musica(e) { est = e; pintarSonando(); pintarInicio(); },
  evento(e) { if (e.tipo === 'spotify') os.api('/v1/spotify/estado').then(s => { sp = s; pintarInicio(); }).catch(() => { }); },
  cerrar() { clearInterval(tProg); if (esperando) cancelar(); lista = null; },
};
