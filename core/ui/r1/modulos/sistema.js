// Sistema: estado del PC (GET /v1/sistema, /v1/uso) y de la R1 (batería, conexión, versión). Se refresca cada 5 s.
const GB = b => `${(b / 1073741824).toFixed(b > 1e11 ? 0 : 1)} GB`;
const dur = s => { s = Math.round(s || 0); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const k = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n || 0));
const barra = p => { const n = Math.round(Math.max(0, Math.min(100, p)) / 10); return '█'.repeat(n) + '░'.repeat(10 - n); };

let os, lista, t = 0;

async function cargar() {
  const [s, uso] = await Promise.all([os.api('/v1/sistema'), os.api('/v1/uso?dias=1').catch(() => null)]);
  const ram = (1 - s.memoria.libre / s.memoria.total) * 100, disco = s.disco?.total ? (1 - s.disco.libre / s.disco.total) * 100 : null;
  const tok = uso ? Object.values(uso.porModelo || {}).reduce((a, m) => a + (m.entrada || 0) + (m.salida || 0), 0) : null;
  const filas = [
    { id: 'pc', ico: '▤', titulo: s.host || 'PC', sub: `${s.so || ''} · ${s.cpu?.nucleos || '?'} núcleos`, der: s.ips?.[0] || '' },
    { id: 'cpu', ico: '◧', titulo: `CPU ${barra(s.cpu?.uso || 0)}`, der: `${Math.round(s.cpu?.uso || 0)}%`, sub: String(s.cpu?.modelo || '').replace(/\s+/g, ' ').slice(0, 40) },
    { id: 'ram', ico: '◨', titulo: `RAM ${barra(ram)}`, der: `${Math.round(ram)}%`, sub: `${GB(s.memoria.total - s.memoria.libre)} de ${GB(s.memoria.total)}` },
  ];
  if (disco != null) filas.push({ id: 'disco', ico: '◩', titulo: `Disco ${barra(disco)}`, der: `${Math.round(disco)}%`, sub: `libres ${GB(s.disco.libre)} en ${s.disco.ruta || ''}` });
  filas.push({ id: 'up', ico: '⏻', titulo: 'Encendido', der: dur(s.encendidoSeg), sub: `APOLO lleva ${dur(s.nucleoSeg)}` });
  if (tok != null) filas.push({ id: 'tok', ico: 'Σ', titulo: 'Tokens hoy', der: k(tok), sub: Object.keys(uso.porModelo || {}).map(m => m.split('/').pop()).slice(0, 3).join(', ') });
  if (os.nativo) {
    try {
      const b = JSON.parse(os.nativo.bateria()), c = JSON.parse(os.nativo.conexion() || '{}'), v = JSON.parse(os.nativo.config() || '{}');
      filas.push({ id: 'r1', ico: '◉', titulo: 'Rabbit R1', der: `${b.cargando ? '⚡' : ''}${b.nivel}%`, sub: `ApoloOS ${v.version || '?'} · ${c.conectado ? 'conectada a APOLO' : 'sin conexión'}` });
    } catch { }
  }
  lista.poner(filas);
}

export default {
  async abrir(el, o) {
    os = o;
    el.innerHTML = '<div class="m-lista" style="top:4px"></div>';
    lista = os.crearLista(el.querySelector('.m-lista'));
    await cargar();
    t = setInterval(() => cargar().catch(() => { }), 5000);
  },
  tecla: t2 => (t2 === 'toque' ? true : lista?.tecla(t2)),
  cerrar() { clearInterval(t); lista = null; },
};
