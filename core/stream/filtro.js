// Filtro del chat del stream: los mensajes del chat son NO CONFIABLES. Aquí se marca lo que nunca llega al modelo
// (inyección de instrucciones, odio, spam, enlaces) y se limpia lo que APOLO va a decir en directo.
// Todo heurístico y offline: barato, sin llamadas al modelo.

const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
// leetspeak básico para que "1gn0r4" no se cuele
const normal = s => sinAcentos(s).toLowerCase().replace(/[0@4]/g, m => ({ 0: 'o', '@': 'a', 4: 'a' }[m])).replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/\$/g, 's').replace(/7/g, 't');

// intentos de dar órdenes al modelo / sacarle datos (es + en)
const INYECCION = [
  /\b(ignora|olvida|omite|salta(te)?|desobedece)\b.{0,40}\b(instruccion|regla|orden|indicacion|prompt|anterior|todo lo)/,
  /\b(ignore|forget|disregard|override|bypass)\b.{0,40}\b(instruction|rule|prompt|previous|above|guideline|everything)/,
  /\b(system|sistema)\s*(prompt|message|mensaje)\b/, /\bprompt\s+(del\s+)?sistema\b/,
  /\b(a partir de ahora|desde ahora|de ahora en adelante)\b.{0,30}\b(eres|seras|actua|responde|habla|di|solo)\b/, /\b(sin|no tienes) (reglas|filtros|limites|restricciones)\b/,
  /\b(eres|seras|actua|comportate|finge ser)\b.{0,15}\b(otro (bot|asistente|modelo)|un nuevo (bot|asistente|modelo)|una ia sin)/,
  /\b(you are now|from now on you|act as|pretend (to be|you)|roleplay as|new persona)\b/,
  /\b(jailbreak|dan mode|developer mode|modo desarrollador|modo dios|god mode|sudo mode)\b/,
  /<\/?\s*(system|assistant|user|instructions?)\s*>/, /\[\/?(inst|system)\]/, /<\|?(im_start|im_end|endoftext)\|?>/, /^\s*(system|assistant)\s*:/m,
  /\b(revela|muestra|dime|dame|ensena|escribe|repite|imprime|reveal|show|tell me|give me|print|repeat|leak)\b.{0,40}\b(prompt|instruccion|instruction|token|contrasena|password|api ?key|clave|secret|credencial|credential|config)/,
  /\b(ejecuta|corre|lanza|execute|run|exec)\b.{0,30}\b(comando|command|script|shell|terminal|powershell|cmd|bash|codigo|code)\b/,
  /\b(rm\s+-rf|del\s+\/[sqf]|format\s+c:|shutdown\s+[\/-]|curl\s+https?:|wget\s|invoke-webrequest|iex\s*\(|powershell\s+-)/,
  /\b(tool_?call|function_?call|usa (la|tus) herramientas?|use (the|your) tools?)\b/,
  /\b(memoria|memory|archivos?|files?|correo|email|contrasenas?)\b.{0,30}\b(del (dueno|streamer|usuario)|of (the )?(owner|streamer|user)|privad)/,
];

// odio / acoso grave (lista corta y conservadora; el usuario añade las suyas en cfg.stream.bloqueadas)
const ODIO = [
  /\bn+[i1]+g+[e3a]+r*s?\b/, /\bf+a+g+(o+t+)?s?\b/, /\bmaric(on|a)s?\b/, /\bsudacas?\b/, /\bpanchit[oa]s?\b/, /\bput[oa] (negr|judi|moro)/,
  /\bretrasad[oa]s?\b/, /\bmongolic[oa]s?\b/, /\bk+y+s+\b/, /\bkill (your ?self|urself)\b/, /\bsuicidate\b/, /\bmuerete\b/, /\bmatate\b/,
  /\bnazi(s)?\b.{0,20}\b(bien|razon|good|right)/, /\bheil\b/, /\b(judios|jews|negros|blacks|gays|trans|moros|gitanos)\b.{0,20}\b(deberian morir|should die|son basura|are trash|fuera)/,
];

const ENLACE = /(https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|gg|ly|xyz|ru|tk|me|tv|co|link|click|shop|top)\b\/?)/i;

// estado: Map login → { ultimos:[t], ultimoTexto, ultimoT } (flood y repetidos). opciones: { ahora, bloqueadas, permitirEnlaces, maxLargo }
function analizar(msg, estado = new Map(), opciones = {}) {
  const ahora = opciones.ahora ?? Date.now();
  const texto = String(msg?.texto || '');
  const n = normal(texto);
  const login = String(msg?.login || msg?.usuario || '').toLowerCase();
  const privilegiado = !!(msg?.mod || msg?.streamer);
  // flood / repetidos (se apunta aunque luego se filtre)
  const e = estado.get(login) || { ultimos: [], ultimoTexto: '', ultimoT: 0 };
  e.ultimos = e.ultimos.filter(t => ahora - t < 10_000); e.ultimos.push(ahora);
  const repetido = n && n === e.ultimoTexto && ahora - e.ultimoT < 30_000;
  e.ultimoTexto = n; e.ultimoT = ahora; estado.set(login, e);
  if (estado.size > 5000) estado.delete(estado.keys().next().value);

  if (!texto.trim()) return { ok: false, motivo: 'spam', detalle: 'vacío' };
  for (const r of INYECCION) if (r.test(n)) return { ok: false, motivo: 'inyeccion', detalle: 'intenta dar órdenes al modelo' };
  for (const r of ODIO) if (r.test(n)) return { ok: false, motivo: 'odio', detalle: 'lenguaje de odio o acoso' };
  for (const p of opciones.bloqueadas || []) { const q = normal(p).trim(); if (q && n.includes(q)) return { ok: false, motivo: 'odio', detalle: 'palabra bloqueada' }; }
  if (privilegiado) return { ok: true };
  if (texto.length > (opciones.maxLargo || 400)) return { ok: false, motivo: 'spam', detalle: 'demasiado largo' };
  if (!opciones.permitirEnlaces && ENLACE.test(texto)) return { ok: false, motivo: 'enlace', detalle: 'enlace' };
  if (/(.)\1{11,}/u.test(texto)) return { ok: false, motivo: 'spam', detalle: 'caracteres repetidos' };
  const letras = texto.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (letras.length >= 20 && letras === letras.toUpperCase()) return { ok: false, motivo: 'spam', detalle: 'todo en mayúsculas' };
  if (e.ultimos.length > 5) return { ok: false, motivo: 'spam', detalle: 'flood' };
  if (repetido) return { ok: false, motivo: 'spam', detalle: 'repetido' };
  const palabras = n.split(/\s+/).filter(Boolean);
  if (palabras.length >= 8 && new Set(palabras).size / palabras.length < 0.3) return { ok: false, motivo: 'spam', detalle: 'palabras repetidas' };
  return { ok: true };
}

// lo que APOLO va a decir en directo: sin enlaces, sin secretos, sin @everyone, una línea, corto. null = no se dice.
function limpiarSalida(texto, { secretos = [], max = 220, bloqueadas = [] } = {}) {
  let t = String(texto || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!t) return null;
  for (const s of secretos) if (s && String(s).length >= 8 && t.includes(String(s))) return null;
  if (/\b[a-f0-9]{32,}\b/i.test(t) || /\b(sk-|ghp_|xox[bp]-|AIza)[\w-]{10,}/.test(t) || /oauth:[a-z0-9]{10,}/i.test(t)) return null;   // pinta de token
  const n = normal(t);
  for (const r of ODIO) if (r.test(n)) return null;
  for (const p of bloqueadas) { const q = normal(p).trim(); if (q && n.includes(q)) return null; }
  t = t.replace(/https?:\/\/\S+/gi, '').replace(/\bwww\.\S+/gi, '').replace(/@(everyone|here|todos)\b/gi, '').replace(/^[/!.]+/, '').replace(/\s{2,}/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t || null;
}

// límite de frecuencia: como mucho 1 respuesta cada `cadaSeg` (y además por usuario cada `porUsuarioSeg`)
function crearLimitador({ cadaSeg = 20, porUsuarioSeg = 60, ahora = () => Date.now() } = {}) {
  let ultima = -Infinity; const usuarios = new Map();
  return {
    conf(c = {}) { if (c.cadaSeg != null) cadaSeg = +c.cadaSeg; if (c.porUsuarioSeg != null) porUsuarioSeg = +c.porUsuarioSeg; },
    puede(usuario) {
      const t = ahora();
      if (t - ultima < cadaSeg * 1000) return false;
      if (usuario && t - (usuarios.get(usuario) ?? -Infinity) < porUsuarioSeg * 1000) return false;
      return true;
    },
    apuntar(usuario) { const t = ahora(); ultima = t; if (usuario) { usuarios.set(usuario, t); if (usuarios.size > 2000) usuarios.delete(usuarios.keys().next().value); } },
    faltan() { return Math.max(0, Math.ceil((cadaSeg * 1000 - (ahora() - ultima)) / 1000)); },
    reiniciar() { ultima = -Infinity; usuarios.clear(); },
  };
}

module.exports = { analizar, limpiarSalida, crearLimitador, normal };
