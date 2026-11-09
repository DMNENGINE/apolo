// Generador de ejemplos para el dataset de APOLO con un modelo ABIERTO (qwen3:8b del Ollama de Proxmox; Apache 2.0).
// - Preguntas reales del usuario (sus mensajes a APOLO y a Claude Code: el texto es SUYO): solo preguntas/charla, nada de órdenes
//   de "haz X en el PC" (sin herramientas aprendería a decir "hecho" sin hacerlo); el maestro descarta las que dependen del contexto.
// - Preguntas nuevas sobre sus temas (memoria de APOLO), escritas por el maestro imitando su forma de escribir.
// - Respuestas escritas por el maestro COMO APOLO: su alma (SOUL/IDENTITY/USER) + ejemplos reales de cómo contesta.
// NUNCA entra texto de Claude ni de ChatGPT. Todo se guarda poco a poco en <nucleo>/dataset/generado.jsonl (reanudable).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { limpiar } = require('./dataset');

const PREG = /\?|^(qu[eé]|c[oó]mo|por ?qu[eé]|cu[aá]l|cu[aá]nto|d[oó]nde|qui[eé]n|explica|expl[ií]came|dime|h[aá]blame|habla|cu[eé]ntame|opinas|crees|sabes|recomi[eé]nda|ay[uú]dame a (entender|pensar|decidir)|compara|diferencia)/i;
const ACCION = /(arregla|instala|crea|haz|abre|ejecuta|borra|mueve|copia|edita|cambia|pon|sube|publica|commit|push|corre|lanza|reinicia|descarga|escribe el|modifica|implementa|a[ñn]ade|quita)\b/i;
const RUIDO = /<command-|<local-command|Caveat:|\[Request interrupted|tool_result|<system-reminder|^\s*\/|<entrada>|Responde solo/;
const MALA = /<think>|como (modelo de lenguaje|una ia|inteligencia artificial),? no|as an ai|no tengo acceso a internet|ya (lo )?he (hecho|creado|guardado|abierto|instalado|subido|publicado)|listo, ya (est[aá]|lo)/i;
const hash = t => crypto.createHash('sha1').update(String(t).toLowerCase().replace(/\W+/g, ' ').trim()).digest('hex').slice(0, 16);

function crearGenerador({ cfg, bus, dataset, fetch: fetchX = globalThis.fetch }) {
  const conf = () => ({ url: 'http://127.0.0.1:11434', modelo: 'qwen3:14b', objetivo: 1200, notaMinima: 4, ...((cfg.dataset || {}).maestro || {}) });
  const dir = () => dataset.dir();
  const archivo = () => path.join(dir(), 'generado.jsonl');
  let estado = { activo: false, fase: 'parado', hechas: 0, objetivo: 0, error: '', desde: 0 }, parar = false;
  const emitir = () => bus?.emit('evento', { tipo: 'dataset', estado });

  async function chat(messages, { json = false, max = 500, temp = .7 } = {}) {
    const c = conf();
    const r = await fetchX(`${c.url}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(240_000),
      body: JSON.stringify({ model: c.modelo, think: false, stream: false, keep_alive: '5m', messages, ...(json ? { format: 'json' } : {}), options: { num_predict: max, temperature: temp } }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`maestro ${r.status}: ${t.slice(0, 160)}`);
    const j = JSON.parse(t); return String(j.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  const leerJSON = async (messages, max = 900) => { const t = await chat(messages, { json: true, max, temp: .5 }); try { return JSON.parse(t); } catch { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } };

  function alma() {
    const p = path.join(cfg.dir, 'personalidad'), leer = n => { try { return fs.readFileSync(path.join(p, n), 'utf8'); } catch { return ''; } };
    return ['SOUL.md', 'IDENTITY.md', 'USER.md'].map(n => leer(n).trim()).filter(Boolean).join('\n\n').slice(0, 3500);
  }
  function mensajesUsuario() {                          // sus mensajes (APOLO + Claude Code), sin tareas automáticas
    const d = path.join(cfg.dir, 'sesiones'), out = [];
    if (!fs.existsSync(d)) return out;
    for (const f of fs.readdirSync(d).filter(f => f.endsWith('.jsonl'))) {
      let m; try { m = JSON.parse(fs.readFileSync(path.join(d, f.replace(/\.jsonl$/, '.json')), 'utf8')); } catch { continue; }
      if (m.tarea || (m.padre && !String(m.id).startsWith('cc-'))) continue;
      for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
        if (!l.includes('"role":"user"')) continue;
        let x; try { x = JSON.parse(l); } catch { continue; }
        const t = String(x.content || '').trim();
        if (t.length >= 4 && t.length <= 1200 && !RUIDO.test(t) && !/Tarea autom/.test(t)) out.push(t);
      }
    }
    return out;
  }
  function memorias() {
    try { return JSON.parse(fs.readFileSync(path.join(cfg.dir, 'memoria.json'), 'utf8')).filter(m => ['proyecto', 'hecho', 'preferencia', 'perfil', 'persona', 'patron'].includes(m.tipo)).map(m => String(m.texto)); }
    catch { return []; }
  }
  function ejemplosReales() {                           // cómo contesta APOLO de verdad (del dataset exportado: solo modelos abiertos)
    try {
      const l = fs.readFileSync(path.join(dir(), 'apolo-train.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x).messages);
      return l.filter(m => m.length === 3 && m[2].content.length < 700).sort(() => Math.random() - .5).slice(0, 3).flatMap(m => [m[1], m[2]]);
    } catch { return []; }
  }

  const hechas = () => { try { return fs.readFileSync(archivo(), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

  async function generar({ objetivo } = {}) {
    if (estado.activo) throw new Error('ya está generando');
    const c = conf(); objetivo = Math.max(20, Math.min(Number(objetivo) || c.objetivo, 5000));
    parar = false;
    const previas = hechas(), ya = new Set(previas.map(x => hash(x.pregunta)));
    estado = { activo: true, fase: 'preparando', hechas: previas.length, objetivo, error: '', desde: Date.now(), descartadas: 0 }; emitir();
    (async () => {
      try {
        const sys = `${alma()}\n\nREGLAS AL RESPONDER: eres APOLO hablando con tu usuario. Español natural, cercano y directo, con su mismo tono; respuestas útiles y concretas, como en un chat: normalmente 2-8 frases, SIN títulos (#), sin emojis de lista ✅❌ y sin plantillas de chatbot; listas solo si de verdad ayudan. Si no conoces algo (un nombre, producto o proyecto raro), dilo claramente y pregunta: jamás te lo inventes. ` +
          'No tienes herramientas en esta conversación: NUNCA digas que has hecho, abierto, creado o comprobado algo; si para responder haría falta mirar algo en el PC o en internet, dilo y explica cómo lo harías. No inventes precios, fechas ni datos actuales.';
        const ejemplos = ejemplosReales();
        // 1) preguntas reales: filtro rápido + el maestro descarta las que dependen del contexto
        const DEICTICO = /\b(eso|esto|esta|este|esa|ese|aqu[ií]|ah[ií]|entonces|ya|lo que|la cosa|captura|pantalla|arriba|abajo|isla|apolo|app|panel|ventana|bot|servidor|repo|archivo|carpeta|c[oó]digo|error|bug|script|pi|proxmox|discord|el de|la de)\b/i;
        const reales = [...new Set(mensajesUsuario().filter(t => PREG.test(t) && t.length >= 15 && t.length <= 260 && !DEICTICO.test(t) && !ACCION.test(t) && !/[A-Z]:\\|https?:\/\/|```|\.(js|py|ts|json|ps1|cpp|md)\b/.test(t)))].filter(t => !ya.has(hash(t)));
        const cola = [];
        estado.fase = 'eligiendo tus preguntas'; emitir();
        for (const t of reales) {
          if (parar) break;
          try {
            const r = (await chat([{ role: 'system', content: 'Respondes solo SI o NO.' }, { role: 'user', content: `¿Este mensaje se puede contestar bien SIN ver la conversación anterior ni el ordenador del usuario (es una pregunta general o de opinión, se entiende sola y no nombra cosas que no conoces)?\n\n"${t.replace(/\s+/g, ' ')}"` }], { max: 4, temp: 0 })).toUpperCase();
            if (r.startsWith('SI') || r.startsWith('SÍ')) cola.push({ fuente: 'tuya', pregunta: t });
          } catch (e) { estado.error = e.message; }
        }
        // 2) preguntas nuevas sobre sus temas, con su forma de escribir
        const estilo = mensajesUsuario().filter(t => t.length < 160).sort(() => Math.random() - .5).slice(0, 14);
        const mem = memorias().sort(() => Math.random() - .5);
        estado.fase = 'escribiendo preguntas de tus temas'; emitir();
        for (let i = 0; cola.length + previas.length < objetivo && !parar && i < 400; i++) {
          const temas = mem.length ? mem.slice((i * 5) % mem.length, (i * 5) % mem.length + 5) : [];
          try {
            const r = await leerJSON([{ role: 'system', content: 'Escribes mensajes que este usuario le mandaría a su asistente APOLO. Imita su forma de escribir (informal, español, con sus faltas típicas y su jerga) pero que se entiendan. Variedad: preguntas, dudas, opiniones, charla, peticiones de explicación o consejo. Cada mensaje tiene que entenderse SOLO (sin "eso", "lo de antes", ni nombres de cosas privadas que el asistente no pueda conocer). Nada de pedir acciones en el PC.' },
              { role: 'user', content: `Así escribe:\n${estilo.map(t => '- ' + t.replace(/\s+/g, ' ')).join('\n')}\n\nCosas de su vida y proyectos (úsalas de inspiración, sin datos privados exactos):\n${temas.map(t => '- ' + limpiar(t).slice(0, 220)).join('\n') || '- tecnología, IA, camiones, impresión 3D, juegos'}\n\nDevuelve JSON {"mensajes":["...", ...]} con 10 mensajes distintos.` }], 1200);
            for (const t of r.mensajes || []) if (typeof t === 'string' && t.length > 6 && !ya.has(hash(t))) { ya.add(hash(t)); cola.push({ fuente: 'sus temas', pregunta: t }); }
          } catch (e) { estado.error = e.message; }
          if (cola.length + previas.length >= objetivo) break;
        }
        // 3) respuestas como APOLO
        estado.fase = 'respondiendo como APOLO'; emitir();
        for (const q of cola) {
          if (parar || estado.hechas >= objetivo) break;
          try {
            const resp = await chat([{ role: 'system', content: sys }, ...ejemplos, { role: 'user', content: limpiar(q.pregunta) }], { max: 550 });
            if (resp.length < 15 || MALA.test(resp) || /^#{1,4}\s/m.test(resp)) { estado.descartadas++; continue; }
            let nota = 5;
            try {
              const j = await leerJSON([{ role: 'system', content: 'Eres un revisor exigente de datos de entrenamiento. Puntúas la respuesta de un asistente llamado APOLO.' },
                { role: 'user', content: `PREGUNTA: ${q.pregunta}\n\nRESPUESTA: ${resp}\n\nDevuelve JSON {"inventa": true si afirma datos o explica cosas que probablemente no existen o no puede saber, "plantilla": true si parece un folleto de chatbot (títulos, listas de ventajas), "nota": 1-5 (5 = útil, correcta, natural y con personalidad)}` }], 120);
              nota = j.inventa || j.plantilla ? 1 : Number(j.nota) || 0;
            } catch { nota = 0; }
            if (nota < conf().notaMinima) { estado.descartadas++; continue; }
            fs.appendFileSync(archivo(), JSON.stringify({ fuente: q.fuente, pregunta: limpiar(q.pregunta), respuesta: limpiar(resp), modelo: conf().modelo, nota, t: Date.now() }) + '\n');
            estado.hechas++; estado.error = '';
          } catch (e) { estado.error = e.message; await new Promise(r => setTimeout(r, 5000)); }
          if (estado.hechas % 5 === 0) emitir();
        }
        estado.fase = parar ? 'parado' : 'terminado';
        bus?.emit('aviso-externo', { texto: `🧪 Dataset de APOLO: ${estado.hechas} ejemplos generados con ${conf().modelo}${parar ? ' (parado)' : ''}. Revísalos en el panel → Entrenamiento.`, urgente: false, origen: 'Entrenamiento' });
      } catch (e) { estado.fase = 'error'; estado.error = e.message; }
      estado.activo = false; emitir();
    })();
    return estado;
  }
  return { generar, parar: () => { parar = true; return estado; }, estado: () => estado, hechas };
}

module.exports = { crearGenerador };
