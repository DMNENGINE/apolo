// Compactación: cuando una conversación se hace larga, resume lo antiguo (va al system prompt) y guarda
// en la memoria permanente lo duradero que haya salido. El historial completo NO se borra: se añade a la
// sesión un marcador { role: 'compactacion', content: resumen, desde: índice del primer mensaje que se conserva }.
// cfg.compactar = { umbral: tokens aprox. a partir de los que se compacta, conservar: tokens recientes que se
//                   dejan tal cual, modelo: 'proveedor/modelo' para resumir (null = el de la sesión), porModelo: { id: umbral } }

const TIPOS = ['perfil', 'preferencia', 'proyecto', 'persona', 'hecho'];
const ESQUEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    recuerdos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: TIPOS } }, required: ['texto', 'tipo'] } },
  },
  required: ['resumen', 'recuerdos'],
};
const INSTRUCCIONES = [
  'Resumes una conversación entre un usuario y su asistente para que el asistente pueda continuarla SIN el texto original.',
  'En "resumen" (máx. ~300 palabras, en el idioma de la conversación) incluye: qué quiere el usuario, decisiones tomadas, datos concretos',
  '(rutas, nombres, números, comandos), qué se hizo ya y qué queda pendiente. Si hay un resumen previo, intégralo; no lo pierdas.',
  'En "recuerdos" pon SOLO datos duraderos que sirvan en conversaciones FUTURAS: quién es el usuario, sus preferencias, sus proyectos,',
  'personas de su vida, hechos estables. Frases cortas en tercera persona. Nada de tareas puntuales de hoy ni contraseñas/claves. Lista vacía si no hay.',
].join(' ');

const tokensAprox = x => Math.ceil((typeof x === 'string' ? x : JSON.stringify(x) || '').length / 3.5);
const corto = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + ` …[+${s.length - n}]` : s; };

// lo que ve el modelo: el último resumen + los mensajes desde su corte (sin marcadores ni marcas de tiempo)
function vista(mensajes) {
  let resumen = '', desde = 0;
  for (let i = mensajes.length - 1; i >= 0; i--) if (mensajes[i].role === 'compactacion') { resumen = mensajes[i].content; desde = mensajes[i].desde; break; }
  const lista = [];
  for (let i = desde; i < mensajes.length; i++) if (mensajes[i].role !== 'compactacion') { const { t, ...m } = mensajes[i]; lista.push(m); }
  return { resumen, desde, mensajes: lista };
}

// índice (absoluto) donde cortar: siempre al inicio de un mensaje del usuario, dejando ~`conservar` tokens recientes.
// Nunca corta el turno en curso (el último mensaje del usuario y lo que sigue). -1 si no hay nada antiguo que resumir.
function puntoDeCorte(mensajes, desde, conservar) {
  const usuarios = [];
  for (let i = desde; i < mensajes.length; i++) if (mensajes[i].role === 'user') usuarios.push(i);
  if (usuarios.length < 2) return -1;
  let corte = usuarios[usuarios.length - 1], cola = 0;
  for (let i = mensajes.length - 1; i >= corte; i--) cola += tokensAprox(mensajes[i]);
  for (let k = usuarios.length - 2; k >= 1; k--) {             // k >= 1: al menos un turno antiguo queda para resumir
    let extra = 0;
    for (let i = usuarios[k]; i < usuarios[k + 1]; i++) extra += tokensAprox(mensajes[i]);
    if (cola + extra > conservar) break;
    cola += extra; corte = usuarios[k];
  }
  return corte;
}

function transcripcion(mensajes, max = 60_000) {
  const lineas = [];
  for (const m of mensajes) {
    if (m.role === 'compactacion') continue;
    if (m.role === 'user') lineas.push(`USUARIO: ${corto(m.content, 3000)}`);
    else if (m.role === 'assistant') {
      if (m.content) lineas.push(`ASISTENTE: ${corto(m.content, 3000)}`);
      for (const c of m.toolCalls || []) lineas.push(`  (usa ${c.name} ${corto(JSON.stringify(c.args || {}), 300)})`);
    } else if (m.role === 'tool') lineas.push(`  → ${m.name}: ${corto(m.content, 600)}`);
  }
  let t = lineas.join('\n');
  if (t.length > max) t = t.slice(0, max * 0.3) + '\n…[parte intermedia omitida]…\n' + t.slice(-max * 0.7);
  return t;
}

function crearCompactador({ cfg, generarJSON, memoria, sesiones }) {
  const opciones = s => {
    const c = cfg.compactar || {};
    return { umbral: c.porModelo?.[s.modelo] || c.umbral || 24_000, conservar: c.conservar || 6_000, modelo: c.modelo || s.modelo };
  };
  const tamaño = (s, sys) => { const v = vista(s.mensajes); return tokensAprox(sys) + tokensAprox(v.resumen) + tokensAprox(v.mensajes); };
  const hace = (s, sys) => tamaño(s, sys) > opciones(s).umbral;

  async function compactar(s, { signal, forzar = false } = {}) {
    const o = opciones(s);
    const v = vista(s.mensajes);
    const corte = puntoDeCorte(s.mensajes, v.desde, forzar ? 0 : o.conservar);
    if (corte < 0) return null;
    const viejos = s.mensajes.slice(v.desde, corte);
    const antes = tokensAprox(v.resumen) + tokensAprox(v.mensajes);
    const prompt = (v.resumen ? `RESUMEN PREVIO:\n${v.resumen}\n\n` : '') + `CONVERSACIÓN A RESUMIR:\n${transcripcion(viejos)}`;
    const { datos: r } = await generarJSON({ modelo: o.modelo, system: INSTRUCCIONES, prompt, schema: ESQUEMA, signal });
    const resumen = String(r.resumen || '').trim();
    if (!resumen) throw new Error('el resumen salió vacío');
    const guardados = [];
    for (const x of r.recuerdos || []) {
      try { const m = memoria?.recordar({ texto: x.texto, tipo: x.tipo, origen: 'compactación' }); if (m) guardados.push(m.texto); } catch { }   // secretos, vacíos…: se ignoran
    }
    sesiones.agregar(s, { role: 'compactacion', content: resumen, desde: corte, recuerdos: guardados.length, t: Date.now() });
    s.compactaciones = (s.compactaciones || 0) + 1;
    const nv = vista(s.mensajes);
    return { antes, despues: tokensAprox(nv.resumen) + tokensAprox(nv.mensajes), resumidos: viejos.length, recuerdos: guardados };
  }

  return { compactar, hace, tamaño, opciones };
}

module.exports = { crearCompactador, vista, puntoDeCorte, tokensAprox, transcripcion };
