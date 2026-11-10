// Rutinas decorativas: no usan red, voz ni herramientas y no despiertan al robot.
const RUTINAS = [
  [['mirar', 2.5], ['curioso', 3], ['guino', 1.4]],
  [['pensativo', 2.8], ['concentrado', 2.5], ['ilusionado', 2]],
  [['bostezo', 2.2], ['timido', 2], ['feliz', 1.8]],
  [['curioso', 2.5], ['sospecha', 2.5], ['si', 1.5]],
];

export function crearVidaCasco(azar = Math.random) {
  let pendiente = [], siguiente = 0, anterior = -1, activa = false;
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
        anterior = opciones[Math.min(opciones.length - 1, Math.floor(azar() * opciones.length))];
        pendiente = [...RUTINAS[anterior]]; activa = true;
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
