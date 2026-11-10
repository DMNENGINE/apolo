// Espectáculo de novedades: el casco enseña las animaciones del catálogo una tras otra.
// Se pausa mientras no se pueda (trabajo, permiso, pánico, modo Gamer, arañas…) y al volver
// repite la animación que se cortó. Lógica pura: la isla le da reproducir/cancelar/puede.
export function crearEspectaculo({ animaciones, reproducir, cancelar, puede, alPaso, alFin, ahora = () => Date.now(), pausa = 700 }) {
  let i = 0, activo = false, siguiente = 0, enCurso = null;
  const total = animaciones.length;
  return {
    empezar(desde = 0) { i = Math.max(0, Math.min(desde, total)); activo = true; siguiente = 0; enCurso = null; },
    parar(motivo = 'parado') {
      if (!activo) return false;
      activo = false; if (enCurso) cancelar(); enCurso = null;
      alFin?.({ completo: false, motivo, vistas: i, total });
      return true;
    },
    get activo() { return activo; },
    get indice() { return i; },
    total,
    tick() {
      if (!activo) return;
      const t = ahora();
      if (!puede()) {
        if (enCurso) { cancelar(); enCurso = null; i = Math.max(0, i - 1); }   // se repite la que se cortó
        siguiente = t + 1500;
        return;
      }
      if (t < siguiente) return;
      enCurso = null;
      if (i >= total) { activo = false; alFin?.({ completo: true, motivo: 'fin', vistas: i, total }); return; }
      const a = animaciones[i++];
      enCurso = a;
      reproducir(a);
      alPaso?.(a, i, total);
      siguiente = t + (Number(a.segundos) || 3) * 1000 + pausa;
    },
  };
}
