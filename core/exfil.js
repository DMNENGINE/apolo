// Protección anti-exfiltración (FASE 9). cfg.seguridad.exfil = 'preguntar' (por defecto) | 'bloquear' | 'off'.
// La herramienta `web` (y `navegador_abrir`) pide permiso la PRIMERA vez que se ENVÍAN DATOS a un dominio que no se
// visitó en un turno anterior ni se aprobó con "siempre" (regla {herramienta:'exfil', prefijo:<dominio>} en reglas.json).
//   Enviar datos = POST/PUT/PATCH/DELETE, o GET cuya ruta+query pase de 80 caracteres, o que lleve trozos de texto que
//   leer_archivo / buscar_memoria / buscar_historial devolvieron EN ESTE TURNO.
//   Un GET simple a un dominio nuevo no pregunta (y lo apunta como visitado; cuenta como "conocido" desde el turno siguiente,
//   para que una inyección no pueda "visitar" y exfiltrar en el mismo turno).
const fs = require('fs');
const path = require('path');

const LECTORES = new Set(['leer_archivo', 'buscar_memoria', 'buscar_historial']);
const LARGO = 80, MAX_LEIDO = 400_000, MAX_DOMINIOS = 5000;
const HERRAMIENTAS = new Set(['web', 'navegador_abrir']);

const dominioDe = url => { try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; } };
const normal = t => String(t || '').toLowerCase().replace(/\s+/g, ' ');
const decodificar = t => { try { return decodeURIComponent(String(t).replace(/\+/g, ' ')); } catch { return String(t).replace(/\+/g, ' '); } };

// ¿la URL / el envío lleva datos? → motivo ('' si no)
function datosSalientes({ url, metodo = 'GET', cuerpo = '' }, leido = '') {
  const m = String(metodo || 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return `petición ${m}${cuerpo ? ` con ${Buffer.byteLength(String(cuerpo))} bytes` : ''}`;
  let u; try { u = new URL(String(url)); } catch { return ''; }
  const resto = u.pathname + u.search;
  if (resto.length > LARGO) return `URL con ${resto.length} caracteres de ruta/consulta (posibles datos)`;
  if (leido) {
    const lei = normal(leido);
    const piezas = resto.split(/[/?&=#;]+/).map(decodificar).map(normal).map(x => x.trim()).filter(x => x.length >= 8);
    for (const p of piezas) {
      if (lei.includes(p)) return `la URL contiene texto leído en este turno («${p.slice(0, 40)}»)`;
      const w = p.split(' ');                                                        // ventanas de 4 palabras (≥16 caracteres)
      for (let i = 0; i + 4 <= w.length; i++) { const v = w.slice(i, i + 4).join(' '); if (v.length >= 16 && lei.includes(v)) return `la URL contiene texto leído en este turno («${v.slice(0, 40)}»)`; }
    }
  }
  return '';
}

function crearExfil({ cfg }) {
  const f = path.join(cfg.dir, 'exfil.json');
  let est = { visitados: {} }; try { est = { visitados: {}, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { }
  const guardar = () => { try { fs.writeFileSync(f, JSON.stringify(est, null, 1)); } catch { } };
  const turnos = new WeakMap();                           // sesión → { turno, leido }
  let n = 0;
  const modo = () => { const v = cfg.seguridad?.exfil; return v === false || v === 'off' || v === 'no' ? 'off' : v === 'bloquear' ? 'bloquear' : 'preguntar'; };

  function nuevoTurno(s) { const t = { turno: `${Date.now().toString(36)}-${++n}`, leido: '' }; if (s) turnos.set(s, t); return t.turno; }
  const turnoDe = s => (s && (turnos.get(s) || (nuevoTurno(s), turnos.get(s))));
  function registrarLectura(s, herramienta, texto) {
    if (!s || !LECTORES.has(herramienta) || /^(error|DENEGADO)\b/.test(String(texto))) return;
    const t = turnoDe(s); t.leido = (t.leido + '\n' + String(texto)).slice(-MAX_LEIDO);
  }
  function marcarVisitado(dom, turno = null) {
    if (!dom) return;
    const v = est.visitados[dom];
    if (v && (v.turno === null || v.turno === turno)) return;
    if (v && turno !== null) return;                       // ya conocido de un turno anterior: no se rebaja
    est.visitados[dom] = { t: Date.now(), turno };
    const ks = Object.keys(est.visitados);
    if (ks.length > MAX_DOMINIOS) for (const k of ks.sort((a, b) => est.visitados[a].t - est.visitados[b].t).slice(0, ks.length - MAX_DOMINIOS)) delete est.visitados[k];
    guardar();
  }
  // conocido = visitado en un turno ANTERIOR (o aprobado una vez; turno null)
  const conocido = (dom, turno) => { const v = est.visitados[dom]; return !!v && (v.turno === null || v.turno !== turno); };

  // → null (nada que preguntar) | { dominio, motivo, url, modo }
  function evaluar({ h, args = {}, sesion }) {
    if (!h || !HERRAMIENTAS.has(h.nombre) || modo() === 'off') return null;
    const url = args.url, dom = dominioDe(url); if (!dom) return null;
    const t = turnoDe(sesion);
    const motivo = datosSalientes({ url, metodo: h.nombre === 'web' ? args.metodo : 'GET', cuerpo: args.cuerpo }, t?.leido);
    if (!motivo) { marcarVisitado(dom, t?.turno ?? null); return null; }
    if (conocido(dom, t?.turno)) return null;
    return { dominio: dom, motivo, url: String(url).slice(0, 300), modo: modo(), turno: t?.turno ?? null };
  }
  return { evaluar, nuevoTurno, registrarLectura, marcarVisitado, conocido, modo, visitados: () => ({ ...est.visitados }) };
}

module.exports = { crearExfil, datosSalientes, dominioDe, LECTORES };
