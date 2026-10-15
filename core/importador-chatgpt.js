// Importar el export oficial de ChatGPT (Ajustes → Controles de datos → Exportar datos → carpeta descomprimida).
// El panel lee los conversations-*.json EN EL NAVEGADOR y manda solo lo tuyo, compacto:
//   { formato: 'chatgpt-export/1', conversaciones: [{ t: título, f: 'AAAA-MM-DD', u: [tus mensajes (≤800 caracteres)] }] }
// Las respuestas de ChatGPT no se usan (ni se guardan); las conversaciones marcadas "no recordar" ya vienen fuera.
// Qué hace (en segundo plano, se puede pausar y continuar aunque se reinicie APOLO):
//   1) copia en <dir>/importado/chatgpt/<fecha>/conversaciones.json (secretos tapados)
//   2) agrupa por fecha en trozos y el modelo del cerebro saca hechos duraderos → memoria (deduplica; el grafo los coge solo)
//   3) progreso en _estado.json; al terminar, _resultado.json (lo lista el historial de importaciones)
const fs = require('fs');
const path = require('path');
const { tapar } = require('./importador');

const TROZO = 20_000;
const MAX_MSG = 800;
const MAX_CONV = 10_000;
const MAX_HECHOS = 15;
const REINTENTOS = 2;
const ESQUEMA = {
  type: 'object',
  properties: { hechos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: ['perfil', 'preferencia', 'proyecto', 'persona', 'hecho'] } }, required: ['texto', 'tipo'] } } },
  required: ['hechos'],
};

// valida y recorta lo que manda el panel; ordena de lo más viejo a lo más nuevo (lo nuevo actualiza lo viejo en la memoria)
function normalizar(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, MAX_CONV).map(c => ({
    t: tapar(String(c?.t || '').replace(/\s+/g, ' ').trim()).slice(0, 120),
    f: /^\d{4}-\d{2}-\d{2}$/.test(c?.f) ? c.f : '0000-00-00',
    u: (Array.isArray(c?.u) ? c.u : []).filter(x => typeof x === 'string').map(x => tapar(x.replace(/\s+/g, ' ').trim()).slice(0, MAX_MSG)).filter(Boolean).slice(0, 300),
  })).filter(c => c.u.length).sort((a, b) => a.f.localeCompare(b.f));
}

function trocear(convs) {
  const trozos = []; let act = '';
  for (const c of convs) {
    const b = `### ${c.f} · ${c.t || 'sin título'}\n${c.u.map(x => `- ${x}`).join('\n')}\n\n`.slice(0, TROZO);
    if (act && act.length + b.length > TROZO) { trozos.push(act); act = ''; }
    act += b;
  }
  if (act) trozos.push(act);
  return trozos;
}

function crearImportadorChatGPT({ cfg, memoria, generarJSON, modelo, bus }) {
  const base = path.join(cfg.dir, 'importado', 'chatgpt');
  let trabajo = null;                                          // { dir, parar }
  const leerEstado = d => { try { return JSON.parse(fs.readFileSync(path.join(d, '_estado.json'), 'utf8')); } catch { return null; } };
  const guardarEstado = (d, e) => fs.writeFileSync(path.join(d, '_estado.json'), JSON.stringify(e, null, 2));

  function pendiente() {                                       // la última importación sin terminar
    try {
      for (const s of fs.readdirSync(base).sort().reverse()) {
        const e = leerEstado(path.join(base, s));
        if (e && !e.terminado) return e;
      }
    } catch { }
    return null;
  }

  function estado() {
    if (trabajo) return { ...leerEstado(trabajo.dir), corriendo: true };
    const p = pendiente();
    return p ? { ...p, corriendo: false } : null;
  }

  function empezar(entrada = {}) {
    if (trabajo) throw new Error('ya hay una importación de ChatGPT en marcha');
    if (entrada.formato !== 'chatgpt-export/1') throw new Error('formato desconocido (se esperaba chatgpt-export/1)');
    const convs = normalizar(entrada.conversaciones);
    if (!convs.length) throw new Error('no hay mensajes tuyos que importar');
    const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const dir = path.join(base, sello);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'conversaciones.json'), JSON.stringify(convs));
    const e = {
      origen: 'chatgpt', backup: dir, conversaciones: convs.length, mensajes: convs.reduce((s, c) => s + c.u.length, 0),
      desde: convs[0].f, hasta: convs[convs.length - 1].f, total: trocear(convs).length, hecho: 0,
      creados: 0, actualizados: 0, rechazados: 0, errores: [], personalidad: [], tareas: [], agentes: [], skills: [],
      terminado: false, empezado: Date.now(),
    };
    guardarEstado(dir, e);
    lanzar(dir);
    return { ...e, corriendo: true };
  }

  function continuar() {
    if (trabajo) throw new Error('ya está en marcha');
    const p = pendiente();
    if (!p) throw new Error('no hay ninguna importación de ChatGPT a medias');
    lanzar(p.backup);
    return { ...p, corriendo: true };
  }

  function pausar() { if (trabajo) trabajo.parar = true; return !!trabajo; }

  function lanzar(dir) {
    const t = { dir, parar: false };
    trabajo = t;
    t.promesa = (async () => {
      const trozos = trocear(JSON.parse(fs.readFileSync(path.join(dir, 'conversaciones.json'), 'utf8')));
      const e = leerEstado(dir);
      e.pausado = false; e.total = trozos.length;
      for (let i = e.hecho; i < trozos.length && !t.parar; i++) {
        let r = null, ultimo;
        for (let k = 0; k <= REINTENTOS && !r && !t.parar; k++) {
          try {
            r = (await generarJSON({
              modelo: modelo(),
              system: 'Extraes datos para la memoria de un asistente personal. Respondes en español.',
              prompt: 'Son mensajes que el USUARIO escribió a ChatGPT (solo los suyos, no las respuestas), agrupados por conversación con su fecha y título. ' +
                'Extrae SOLO hechos duraderos y útiles sobre el USUARIO: quién es, a qué se dedica, cómo le gusta que le hablen, preferencias, proyectos, negocios, personas de su vida, equipos y servidores. ' +
                'Ignora: preguntas sueltas de cultura general, textos que pide escribir o traducir para otros, contenido de terceros que pega (artículos, letras, código), datos que caducan, contraseñas, claves, teléfonos y direcciones exactas. ' +
                'Si algo es de hace tiempo y pudo cambiar, pon el año ("En 2024 tenía…"). Cada hecho en una frase clara en tercera persona ("Se llama…", "Prefiere…"). ' +
                `Máximo ${MAX_HECHOS}; si no hay nada duradero, devuelve la lista vacía.\n\n` + trozos[i],
              schema: ESQUEMA,
            })).datos;
          } catch (err) { ultimo = err; }
        }
        if (t.parar) break;
        if (!r) {                                              // el modelo no responde: se pausa aquí y se puede continuar luego
          e.errores = [...e.errores, `trozo ${i + 1}: ${String(ultimo?.message || ultimo).slice(0, 200)}`].slice(-10);
          e.pausado = true;
          break;
        }
        for (const h of (r.hechos || []).slice(0, MAX_HECHOS)) {
          try { const m = memoria.recordar({ texto: h.texto, tipo: h.tipo, origen: 'importado de chatgpt' }); m.accion === 'creada' ? e.creados++ : e.actualizados++; }
          catch { e.rechazados++; }                            // secretos, vacíos, demasiado largos
        }
        e.hecho = i + 1;
        guardarEstado(dir, e);
        bus?.emit?.('importar-chatgpt', { hecho: e.hecho, total: e.total, creados: e.creados });
      }
      if (t.parar) e.pausado = true;
      if (e.hecho >= trozos.length) {
        e.terminado = true; e.pausado = false; e.terminadoEn = Date.now();
        fs.writeFileSync(path.join(dir, '_resultado.json'), JSON.stringify(e, null, 2));
      }
      guardarEstado(dir, e);
    })().catch(err => {
      const e = leerEstado(dir);
      if (e) { e.errores = [...(e.errores || []), String(err.message).slice(0, 200)].slice(-10); e.pausado = true; guardarEstado(dir, e); }
    }).finally(() => { if (trabajo === t) trabajo = null; });
  }

  // para los tests: espera a que acabe el trabajo en marcha
  const esperar = () => trabajo?.promesa || Promise.resolve();
  return { empezar, continuar, pausar, estado, esperar };
}

module.exports = { crearImportadorChatGPT, normalizar, trocear };
