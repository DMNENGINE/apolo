// Bucle del agente: modelo → herramientas → modelo … hasta que responde sin pedir herramientas.
const os = require('os');
const fs = require('fs');
const { HERRAMIENTAS, porNombre } = require('./herramientas');
const { vista } = require('./compactar');
const { esCorreccion } = require('./skills/taller');
const { redactar } = require('./seguridad');

// cfg.idioma ('es'|'en'|…): idioma por defecto de las respuestas
const IDIOMAS = { es: 'español', en: 'inglés (English)', pt: 'portugués', fr: 'francés', it: 'italiano', de: 'alemán', ca: 'catalán', gl: 'gallego', eu: 'euskera', nl: 'neerlandés', ru: 'ruso', zh: 'chino', ja: 'japonés', ko: 'coreano', ar: 'árabe' };
const lineaIdioma = cfg => {
  const c = String(cfg?.idioma || '').trim(), n = IDIOMAS[c.toLowerCase().slice(0, 2)] || c;
  return n ? `Responde por defecto en ${n}, claro y breve, salvo que el usuario te escriba en otro idioma (entonces usa el suyo).` : 'Responde en el idioma del usuario, claro y breve.';
};

function ahoraLocal() {
  const d = new Date(), p = n => String(n).padStart(2, '0'), off = -d.getTimezoneOffset();
  const dia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()];
  return `${dia} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())} (UTC${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)})`;
}

// plantillas de subagente importadas (OpenClaw…): una línea por agente. A los subagentes no se les listan (no delegan)
function agentesGuardados(s, cfg) {
  if (s.padre || !cfg) return '';
  return require('./importador').leerAgentes(cfg).slice(0, 20).map(a => `- ${a.nombre}: ${a.descripcion || '(sin descripción)'}`).join('\n');
}

function sistema(s, recuerdos, personalidad, resumen, cfg, skills = '') {
  const guardados = agentesGuardados(s, cfg);
  return [
    'Eres Robot Companion, un asistente personal que trabaja en el ordenador del usuario usando herramientas.',
    `${lineaIdioma(cfg)} Usa herramientas cuando hagan falta; no inventes resultados.`,
    'Si una herramienta es denegada, no la repitas igual: explica o busca otra vía.',
    'NUNCA digas que algo está hecho (aprobado, enviado, subido, generado, en cola…) si no lo has VISTO en el resultado de una herramienta. ' +
    'En el navegador y en el PC (clic/escribir/tecla/scroll/arrastrar), tras cada acción lee la COMPROBACIÓN: si dice que NO cambió nada, no funcionó; ' +
    'nunca afirmes que lo hiciste sin haberlo comprobado. Ve paso a paso y no te adelantes.',
    `Sistema: ${os.type()} ${os.release()} (${process.platform}). Carpeta de trabajo: ${s.cwd}.`,
    `Ahora (hora local): ${ahoraLocal()}. Usa esta hora para programar tareas.`,
    'Tienes memoria permanente compartida con otros modelos: usa "recordar" cuando el usuario cuente algo duradero sobre él (sin avisar de que lo guardas salvo que pregunte), ' +
    '"buscar_memoria" o "buscar_historial" si necesitas algo que no está abajo, y corrige con "reemplaza" lo que haya cambiado.',
    recuerdos ? `LO QUE SABES DEL USUARIO (memoria):\n${recuerdos}` : 'Memoria: aún no sabes nada del usuario.',
    personalidad ? `\nPERSONALIDAD E INSTRUCCIONES DEL USUARIO (síguelas):\n${personalidad}` : '',
    guardados ? `\nAGENTES GUARDADOS (úsalos con delegar + "agente"):\n${guardados}` : '',
    skills ? `\n${skills}` : '',
    resumen ? `\nRESUMEN DE LA PARTE ANTERIOR DE ESTA CONVERSACIÓN (ya no ves esos mensajes; continúa desde aquí):\n${resumen}` : '',
  ].filter(Boolean).join('\n');
}

// imágenes de las herramientas (capturas): al modelo solo le llegan las 2 últimas, leídas del disco en base64;
// las antiguas se cambian por una nota para no gastar tokens. sinVision = el modelo no ve imágenes: ninguna.
const MAX_IMAGENES = 2;
// "voy a comprobar…", "me encargo", "generaré…": anuncia una acción en vez de hacerla (gemma lo hace a menudo y el turno acaba sin hacer nada)
const PROMESA = /\b(voy a|vamos a|ahora mismo|enseguida|d[eé]jame|procedo a|me encargo|me pongo|empiezo (a|con|ya)|en un momento|a continuaci[oó]n|comprobar[eé]|revisar[eé]|generar[eé]|crear[eé]|har[eé]|buscar[eé]|abrir[eé]|preparar[eé]|retomo|retomamos)\b/i;
const EMPUJON = '(SISTEMA: Acabas de decir que vas a hacer algo, pero NO has llamado a ninguna herramienta, así que no ha pasado nada. ' +
  'Hazlo AHORA llamando a las herramientas necesarias, paso a paso, y no respondas al usuario hasta tener el resultado real. ' +
  'Si de verdad no puedes hacerlo con tus herramientas, dilo claramente en vez de prometerlo.)';

function conImagenes(mensajes, sinVision) {
  let quedan = sinVision ? 0 : MAX_IMAGENES;
  const out = mensajes.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (!m.imagenes?.length) continue;
    const { imagenes, ...resto } = m;
    if (quedan > 0) {
      const leidas = [];
      for (const img of imagenes) { try { leidas.push({ mime: img.mime, datos: fs.readFileSync(img.ruta).toString('base64') }); } catch { } }
      if (leidas.length) { quedan--; out[i] = { ...resto, imagenes: leidas }; continue; }
      out[i] = { ...resto, content: `${resto.content}\n[la captura ya no está disponible]` };
    } else out[i] = { ...resto, content: `${resto.content}\n[${sinVision ? 'imagen no enviada: este modelo no ve imágenes' : 'captura antigua omitida'}]` };
  }
  return out;
}

function crearAgente({ cfg, proveedores, permisos, sesiones, tareas, memoria, personalidad, compactador, subagentes, control, navegador, skills, consejo, turnoNoche }) {
  const enCurso = new Map();   // sesion.id -> AbortController

  async function enviar(s, texto, emitir = () => { }) {
    if (enCurso.has(s.id)) throw new Error('la sesión ya está trabajando');
    const ctl = new AbortController(); enCurso.set(s.id, ctl);
    const ev = (tipo, datos) => emitir({ tipo, sesion: s.id, ...datos });
    const turno = { herramientas: 0, errores: 0, nombres: new Set(), skills: new Set() };   // para el taller (sugerir skill / registrar fallos)
    permisos.exfil?.nuevoTurno(s);                     // anti-exfiltración: lo leído cuenta solo dentro de este turno
    const taller = skills?.taller;
    // ¿el usuario corrige justo después de un turno que usó una skill? → se apunta como fallo de esa skill
    if (taller && s.ultimaSkill) {
      const u = s.ultimaSkill; delete s.ultimaSkill;
      if (Date.now() - u.t < 30 * 60_000 && esCorreccion(texto))
        for (const slug of u.slugs) try { taller.registrarFallo(slug, { problema: `el usuario corrigió: ${String(texto).slice(0, 300)}`, contexto: `pidió: ${u.pregunta} | respondí: ${u.respuesta}`, sesion: s.id }); } catch { }
    }
    try {
      const { api, model } = proveedores.resolver(s.modelo);
      sesiones.agregar(s, { role: 'user', content: texto, t: Date.now() });
      if (s.titulo === 'Nueva sesión') s.titulo = texto.slice(0, 60);
      ev('inicio', { modelo: s.modelo });
      let recuerdos = ''; try { recuerdos = memoria ? await memoria.contexto(texto) : ''; } catch { }
      let pers = ''; try { pers = personalidad ? personalidad.prompt() : ''; } catch { }
      let sk = ''; try { sk = skills ? (await skills.seccion({ sesion: s, mensaje: texto })).texto : ''; } catch { }   // índice + sugeridas (o la skill ya cargada)
      const apagadas = new Set(cfg.herramientasOff || []);
      if (s.padre || !subagentes) apagadas.add('delegar');                // los subagentes no delegan (sin recursión)
      let hayActivas = false; try { hayActivas = !!skills?.almacen.lista().some(x => x.activa); } catch { }
      if (!hayActivas) ['usar_skill', 'leer_recurso_skill', 'ejecutar_script_skill'].forEach(x => apagadas.add(x));   // sin skills activas: menos herramientas
      const herramientas = HERRAMIENTAS.filter(h => !apagadas.has(h.nombre) && (!h.disponible || h.disponible()));
      const disponibles = new Set(herramientas.map(h => h.nombre));
      let final = '', empujones = 0, empujon = false;
      for (let paso = 0; paso < cfg.maxPasos; paso++) {
        const base = sistema(s, recuerdos, pers, '', cfg, sk);
        if (compactador?.hace(s, base)) {              // conversación larga: resumir lo antiguo antes de seguir
          try { const c = await compactador.compactar(s, { signal: ctl.signal }); if (c) ev('compactacion', c); }
          catch (e) { if (ctl.signal.aborted) throw e; ev('aviso', { texto: `no pude compactar la conversación: ${e.message}` }); }
        }
        const v = vista(s.mensajes);
        const sys = sistema(s, recuerdos, pers, v.resumen, cfg, sk);
        let historial = conImagenes(v.mensajes, s.sinVision);
        if (empujon) { historial = [...historial, { role: 'user', content: EMPUJON }]; empujon = false; }   // solo para esta llamada, no se guarda
        let r;
        try { r = await api.chat({ model, system: sys, mensajes: historial, herramientas, signal: ctl.signal }); }
        catch (e) {                                      // ¿el modelo no acepta imágenes? se marca la sesión y se reintenta solo con texto
          if (ctl.signal.aborted || s.sinVision || !historial.some(m => m.imagenes?.length)) throw e;
          s.sinVision = true; sesiones.guardarMeta(s);
          ev('aviso', { texto: `${s.modelo} no aceptó la imagen (${String(e.message).slice(0, 120)}): sigo solo con la lista de elementos` });
          historial = conImagenes(v.mensajes, true);
          r = await api.chat({ model, system: sys, mensajes: historial, herramientas, signal: ctl.signal });
        }
        if (!r.texto && !r.toolCalls.length) {          // modelos con razonamiento a veces "piensan" y no contestan: se lo pedimos una vez
          const r2 = await api.chat({ model, system: sys, mensajes: [...historial, { role: 'user', content: '(Escribe ya tu respuesta final al usuario, breve.)' }], herramientas: [], signal: ctl.signal });
          r = { ...r2, uso: { entrada: r.uso.entrada + r2.uso.entrada, salida: r.uso.salida + r2.uso.salida } };
        }
        s.uso.entrada += r.uso.entrada; s.uso.salida += r.uso.salida;
        sesiones.agregar(s, { role: 'assistant', content: r.texto, toolCalls: r.toolCalls.length ? r.toolCalls : undefined, t: Date.now() });
        if (r.texto) { final = r.texto; ev('texto', { texto: r.texto }); }
        if (!r.toolCalls.length) {
          if (r.texto && !turno.herramientas && PROMESA.test(r.texto) && empujones < 2 && paso < cfg.maxPasos - 1 && !ctl.signal.aborted) {
            empujones++; empujon = true;
            ev('aviso', { texto: 'el modelo prometió hacerlo sin usar herramientas: le pido que lo haga de verdad' });
            continue;
          }
          break;
        }
        const correr = async c => {
          const h = disponibles.has(c.name) ? porNombre[c.name] : null;
          if (!h) return `error: herramienta "${c.name}" no existe`;
          if (s.canal === 'eval' && (typeof h.riesgo === 'function' ? h.riesgo(c.args || {}, s) : h.riesgo) !== 'lectura') return 'DENEGADO: en una evaluación solo se permiten herramientas de lectura';
          ev('herramienta', { id: c.id, nombre: c.name, args: c.args || {}, resumen: h.resumen(c.args || {}) });
          const p = await permisos.pedir({ h, args: c.args || {}, sesion: s, ctx: { skills } });
          if (!p.ok) return `DENEGADO: ${p.motivo}`;
          try {
            const out = await h.ejecutar(c.args || {}, { cwd: s.cwd, signal: ctl.signal, sesion: s, tareas: tareas(), memoria, personalidad, cfg, subagentes: subagentes?.(), control: control?.(), navegador: navegador?.(), skills, consejo: consejo?.(), turno: turnoNoche?.() });
            // FASE 9: las claves conocidas (bóveda, token del daemon) nunca vuelven al modelo aunque una herramienta las imprima
            const r = out && typeof out === 'object' ? { texto: redactar(String(out.texto || ''), { patrones: false }), imagenes: out.imagenes || [] } : redactar(String(out), { patrones: false });   // {texto, imagenes} = resultado con capturas
            permisos.resultado?.(p.auditId, !/^(error|DENEGADO)\b/.test(typeof r === 'string' ? r : r.texto), typeof r === 'string' ? r : r.texto);
            return r;
          } catch (e) { permisos.resultado?.(p.auditId, false, e.message); return `error: ${e.message}`; }
        };
        // los "delegar" de una misma respuesta arrancan a la vez (subagentes en paralelo); el resto va en orden
        const enParalelo = new Map(r.toolCalls.filter(c => c.name === 'delegar' && disponibles.has('delegar')).map(c => [c.id, correr(c)]));
        for (const c of r.toolCalls) {
          if (ctl.signal.aborted) { await Promise.allSettled(enParalelo.values()); throw new Error('cancelado'); }
          const res = enParalelo.has(c.id) ? await enParalelo.get(c.id) : await correr(c);
          const resultado = typeof res === 'string' ? res : res.texto;
          const fallo = /^(error|DENEGADO)\b/.test(resultado);
          if (!fallo) permisos.exfil?.registrarLectura(s, c.name, resultado);
          turno.herramientas++; turno.nombres.add(c.name); if (fallo) turno.errores++;
          if (c.name === 'usar_skill' && !fallo) { const sl = skills?.almacen?.obtener(String(c.args?.nombre || ''))?.slug; if (sl) turno.skills.add(sl); }
          const imagenes = typeof res === 'string' || !res.imagenes.length ? undefined : res.imagenes.map(i => ({ mime: i.mime, ruta: i.ruta }));
          sesiones.agregar(s, { role: 'tool', toolCallId: c.id, name: c.name, content: resultado, imagenes, t: Date.now() });
          ev('resultado', { id: c.id, nombre: c.name, resultado: resultado.slice(0, 2000), imagenes: imagenes?.length || undefined });
        }
        if (paso === cfg.maxPasos - 1) { final += `\n[detenido: límite de ${cfg.maxPasos} pasos]`; turno.detenido = true; }
      }
      if (turno.skills.size) s.ultimaSkill = { slugs: [...turno.skills], t: Date.now(), pregunta: String(texto).slice(0, 200), respuesta: final.slice(0, 200) };
      if (taller && turno.detenido) for (const slug of turno.skills) try { taller.registrarFallo(slug, { problema: `no terminó: llegó al límite de ${cfg.maxPasos} pasos`, contexto: `pidió: ${String(texto).slice(0, 200)}`, sesion: s.id }); } catch { }
      // turno largo y bien hecho → sugerir convertirlo en skill (heurística, sin llamar al modelo; 1 vez por sesión)
      if (taller && cfg.skills?.sugerir !== false && !s.padre && !s.tarea && s.canal !== 'eval' && !s.skillSugerida && !turno.detenido && !turno.skills.size &&
        !turno.nombres.has('crear_skill') && turno.herramientas >= (cfg.skills?.umbralSugerir || 6) && turno.errores * 3 <= turno.herramientas) {
        s.skillSugerida = Date.now();
        const resumen = `${String(texto).slice(0, 160)} — ${turno.herramientas} herramientas (${[...turno.nombres].join(', ')})`;
        ev('skill-sugerida', { resumen });
        final += /^en/i.test(cfg.idioma || '') ? '\n\n(Tip: I could save what we just did as a reusable skill. Say "make a skill out of this" and I\'ll draft it.)'
          : '\n\n(Sugerencia: lo que acabamos de hacer se puede guardar como skill reutilizable. Dime «crea una skill con esto» y la redacto.)';
      }
      sesiones.guardarMeta(s);
      ev('fin', { texto: final, uso: s.uso });
      return final;
    } catch (e) {
      if (taller && turno.skills.size && !ctl.signal.aborted)        // turno con skill que acabó en error → aprendizaje de la skill
        for (const slug of turno.skills) try { taller.registrarFallo(slug, { problema: `el turno terminó en error: ${e.message}`, contexto: `pidió: ${String(texto).slice(0, 200)}`, sesion: s.id }); } catch { }
      sesiones.guardarMeta(s);
      ev('error', { error: e.message });
      throw e;
    } finally { enCurso.delete(s.id); }
  }

  function cancelar(id) { const c = enCurso.get(id); if (c) c.abort(new Error('cancelado')); return !!c; }
  return { enviar, cancelar, ocupada: id => enCurso.has(id) };
}

module.exports = { crearAgente };
