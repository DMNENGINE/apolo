const campos = ['presupuesto', 'recuperacion', 'contexto', 'cola', 'agente', 'enrutamiento', 'subagentes'];
function validarCampo(nombre, valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('configuracion invalida: ' + nombre);
  if (nombre === 'subagentes') {
    for (const k of Object.keys(valor)) if (!['max', 'perfiles'].includes(k)) throw new Error('ajuste de subagentes desconocido');
    if (valor.max !== undefined && (!Number.isInteger(valor.max) || valor.max < 1 || valor.max > 8)) throw new Error('limite de subagentes invalido');
    if (valor.perfiles) for (const [id, p] of Object.entries(valor.perfiles)) {
      if (!/^[a-z][\w-]{0,30}$/.test(id) || !p || typeof p !== 'object' || Array.isArray(p)) throw new Error('perfil invalido');
      if (Object.keys(p).some(k => !['modelo', 'herramientas', 'soloLectura'].includes(k)) || (p.modelo && !/^[\w-]+\/.+/.test(p.modelo)) || (p.soloLectura !== undefined && typeof p.soloLectura !== 'boolean') || (p.herramientas && (!Array.isArray(p.herramientas) || p.herramientas.some(h => typeof h !== 'string' || !/^[\w-]+$/.test(h))))) throw new Error('capacidades de perfil invalidas');
    }
    return JSON.parse(JSON.stringify(valor));
  }
  const rangos = { maxTokens: [1, 10000000], maxSalida: [128, 32768], maxDuracionMs: [100, 3600000], maxCosto: [0, 10000], reintentos: [0, 5], esperaMs: [0, 60000], maxEsperaMs: [0, 300000], reserva: [128, 32768], max: [1, 100], lecturasParalelas: [1, 8], repeticiones: [2, 10], herramientasTokens: [1024, 20000] };
  const permitidos = { presupuesto: ['maxTokens', 'maxDuracionMs', 'maxCosto', 'precios'], recuperacion: ['reintentos', 'esperaMs', 'maxEsperaMs', 'reservas', 'permitirNube'], contexto: ['maxTokens', 'maxSalida', 'reserva', 'porModelo', 'herramientasTokens'], cola: ['max'], agente: ['lecturasParalelas', 'repeticiones', 'streaming'], enrutamiento: ['habilitado', 'reglas'] };
  for (const [k, v] of Object.entries(valor)) {
    if (!permitidos[nombre].includes(k)) throw new Error('ajuste desconocido: ' + nombre + '.' + k);
    if (rangos[k] && (!Number.isFinite(v) || v < rangos[k][0] || v > rangos[k][1] || (k !== 'maxCosto' && !Number.isInteger(v)))) throw new Error('limite invalido: ' + k);
    if (['permitirNube', 'streaming', 'habilitado'].includes(k) && typeof v !== 'boolean') throw new Error('se requiere booleano: ' + k);
    if (k === 'reglas' && (!Array.isArray(v) || v.length > 20 || v.some(r => !r || !/^[\w-]+\/.+/.test(r.modelo) || !Array.isArray(r.palabras) || !r.palabras.length || r.palabras.some(p => typeof p !== 'string' || !p.trim() || p.length > 100)))) throw new Error('reglas de enrutamiento invalidas');
    if (k === 'reservas' && (!Array.isArray(v) || v.length > 5 || v.some(x => typeof x !== 'string' || !/^[\w-]+\/.+/.test(x)))) throw new Error('reservas invalidas');
    if (['porModelo', 'precios'].includes(k)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('mapa invalido');
      for (const [id, p] of Object.entries(v)) {
        if (!/^[\w-]+\/.+/.test(id)) throw new Error('modelo invalido');
        if (k === 'porModelo' && (!Number.isInteger(p) || p < 4096 || p > 1000000)) throw new Error('contexto invalido');
        if (k === 'precios' && (!p || !Number.isFinite(p.entrada) || !Number.isFinite(p.salida) || p.entrada < 0 || p.salida < 0)) throw new Error('precios invalidos');
      }
    }
  }
  return JSON.parse(JSON.stringify(valor));
}
module.exports = { campos, validarCampo };
