// Rutinas decorativas: no usan red, voz ni herramientas y no despiertan al robot.
const RUTINAS = [
  [['mirar', 2.5], ['curioso', 3], ['guino', 1.4]],
  [['pensativo', 2.8], ['concentrado', 2.5], ['ilusionado', 2]],
  [['bostezo', 2.2], ['timido', 2], ['feliz', 1.8]],
  [['curioso', 2.5], ['sospecha', 2.5], ['si', 1.5]],
];

const ESCENAS = [[['revision', 7], ['guino', 1.4]], [['estornudo_explosivo', 5.5], ['sorpresa', 1.5]], [['montaje', 7], ['timido', 1.8]]];

export function crearVidaCasco(azar = Math.random) {
  let pendiente = [], siguiente = 0, anterior = -1, activa = false;
  let normales = 0, proximaEscena = 0, ultimaEscena = -1;
  return {
    cancelar() {
      const estabaActiva = activa;
      pendiente = []; activa = false; siguiente = 0;
      return estabaActiva;
    },
    paso({ ahora, libre, ocupado }) {
      if (!libre || ocupado || ahora < siguiente) return null;
      if (!activa) {
        // Elige entre las otras rutinas: nunca repite la última secuencia.
        const opciones = RUTINAS.map((_, i) => i).filter(i => i !== anterior);
        if (normales >= 3 && ahora >= proximaEscena && (azar() < .35 || normales >= 5)) {
          const candidatas = ESCENAS.map((_, i) => i).filter(i => i !== ultimaEscena);
          ultimaEscena = candidatas[Math.min(candidatas.length - 1, Math.floor(azar() * candidatas.length))];
          pendiente = [...ESCENAS[ultimaEscena]]; normales = 0;
          proximaEscena = ahora + 240_000 + azar() * 180_000;
        } else {
          anterior = opciones[Math.min(opciones.length - 1, Math.floor(azar() * opciones.length))];
          pendiente = [...RUTINAS[anterior]]; normales++;
        }
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
  };
}
