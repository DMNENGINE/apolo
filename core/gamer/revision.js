// Modo Gamer · revisión de SOLO LECTURA: lo que sí importa para jugar (frecuencia del monitor, HAGS, modo juego, programas de inicio).
// Nunca cambia nada: solo devuelve datos y avisos en lenguaje claro.
const HAGS = ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode'];   // 2 = activado, 1 = desactivado
const MODO_JUEGO = ['HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled'];         // 0 = apagado; sin valor = activado (por defecto)

function crearRevision({ so }) {
  const leer = async (fn, ...a) => { try { return { v: await fn(...a) }; } catch (e) { return { error: e.message }; } };
  async function revisar() {
    const [mon, hags, mj, ini] = await Promise.all([leer(so.gamerMonitores), leer(so.gamerLeerRegistro, ...HAGS), leer(so.gamerLeerRegistro, ...MODO_JUEGO), leer(so.gamerInicio)]);
    const avisos = [];
    const monitores = (mon.v || []).map(m => {
      const aviso = m.maxHz > m.actualHz + 5 ? `Tu monitor ${m.nombre || ''} (${m.ancho}x${m.alto}) admite ${m.maxHz} Hz y está a ${m.actualHz} Hz: súbelo en Configuración › Pantalla › Pantalla avanzada.`.replace('  ', ' ') : '';
      if (aviso) avisos.push(aviso);
      return { ...m, aviso };
    });
    const hv = hags.v ?? null;
    const hagsR = { valor: hv, activo: hv === 2 ? true : hv === 1 ? false : null, texto: hv === 2 ? 'activada' : hv === 1 ? 'desactivada' : 'no disponible / por defecto' };
    if (hagsR.activo === false) avisos.push('La programación de GPU acelerada por hardware (HAGS) está desactivada: con una GPU moderna suele ir mejor activada (Configuración › Pantalla › Gráficos; pide reiniciar).');
    const mv = mj.v ?? null;
    const modoJuego = { valor: mv, activo: mv !== 0, texto: mv === 0 ? 'desactivado' : 'activado' };
    if (!modoJuego.activo) avisos.push('El modo juego de Windows está desactivado: actívalo en Configuración › Juegos › Modo de juego.');
    const inicio = ini.v || [];
    if (inicio.length > 12) avisos.push(`Hay ${inicio.length} programas que arrancan con Windows: revisa cuáles necesitas (Administrador de tareas › Aplicaciones de arranque).`);
    return { t: Date.now(), monitores, hags: hagsR, modoJuego, inicio, avisos, errores: Object.fromEntries(Object.entries({ monitores: mon, hags, modoJuego: mj, inicio: ini }).filter(([, r]) => r.error).map(([k, r]) => [k, r.error])) };
  }
  return { revisar };
}

module.exports = { crearRevision };
