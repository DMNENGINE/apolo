import { ANIMACIONES_CASCO } from './animaciones-casco.js';
// Vida autónoma del casco: recorre TODO el catálogo (100 animaciones) en un mazo barajado, sin repetir ninguna
// hasta haberlas hecho todas. Las escenas largas se intercalan como mucho cada 5–8 min. No usan red, voz ni herramientas.
// El mazo se guarda (guardar/cargar) para que tras reiniciar APOLO siga por donde iba.
const EXTRA_ESCENAS = [['revision', 7], ['estornudo_explosivo', 5.5], ['montaje', 7]];
const TODAS = [
  ...ANIMACIONES_CASCO.map(a => ({ id: a.id, segundos: a.segundos, escena: !!a.escena })),
  ...EXTRA_ESCENAS.filter(([id]) => !ANIMACIONES_CASCO.some(a => a.id === id)).map(([id, segundos]) => ({ id, segundos, escena: true })),
];
const POR_ID = new Map(TODAS.map(a => [a.id, a]));
const CIERRE_ESCENA = ['guino', 1.4];

export function crearVidaCasco(azar = Math.random, { cargar = () => null, guardar = () => { } } = {}) {
  const barajar = () => {
    const m = TODAS.map(a => a.id);
    for (let i = m.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [m[i], m[j]] = [m[j], m[i]]; }
    return m;
  };
  let mazo = [];
  try { const g = cargar(); if (Array.isArray(g)) mazo = g.filter(id => POR_ID.has(id)); } catch { }
  if (!mazo.length) mazo = barajar();
  let pendiente = [], siguiente = 0, activa = false, proximaEscena = 0;
  const persistir = () => { try { guardar(mazo); } catch { } };
  // saca la siguiente del mazo; si toca escena y aún no es su hora, coge la primera cotidiana (la escena espera su turno)
  function sacar(ahora) {
    if (!mazo.length) mazo = barajar();
    let i = 0;
    if (POR_ID.get(mazo[0]).escena && ahora < proximaEscena) {
      i = mazo.findIndex(id => !POR_ID.get(id).escena);
      if (i < 0) i = 0;                                      // solo quedan escenas: adelante
    }
    const a = POR_ID.get(mazo.splice(i, 1)[0]);
    if (a.escena) proximaEscena = ahora + 300_000 + azar() * 180_000;
    persistir();
    return a;
  }
  return {
    cancelar() {
      const estabaActiva = activa;
      pendiente = []; activa = false; siguiente = 0;
      return estabaActiva;
    },
    paso({ ahora, libre, ocupado }) {
      if (!libre || ocupado || ahora < siguiente) return null;
      if (!activa) {
        if (!proximaEscena) proximaEscena = ahora + 120_000;   // la primera escena a los ~2 min
        const a = sacar(ahora);
        pendiente = a.escena ? [[a.id, a.segundos], CIERRE_ESCENA] : [[a.id, a.segundos]];
        activa = true;
      }
      const [nombre, segundos] = pendiente.shift();
      siguiente = ahora + segundos * 1000 + 600;
      return { nombre, segundos };
    },
    terminarSiLista(ahora) {
      if (activa && !pendiente.length && ahora >= siguiente) { activa = false; return true; }
      return false;
    },
    quedan: () => mazo.length,
    total: TODAS.length,
  };
}
