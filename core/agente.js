// Bucle del agente: modelo → herramientas → modelo … hasta que responde sin pedir herramientas.
const os = require('os');
const fs = require('fs');
const registroBase = require('./herramientas');
const { validar } = require('./estructurado');
const grupos = require('./herramientas-grupos');
const { vista } = require('./compactar');
const { esCorreccion } = require('./skills/taller');
const { redactar, redactarParcial } = require('./seguridad');
const resultados = require('./resultados');
const { recuperar, clasificar, cancelable } = require('./recuperacion');
const { crearEjecuciones, hash } = require('./ejecuciones');
const { ensamblar } = require('./contexto');
const crypto = require('crypto');

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

function sistema(s, recuerdos, personalidad, resumen, cfg, skills = '', interior = '', nombre = '', nacimiento = '') {
  const guardados = agentesGuardados(s, cfg);
  return [
    `Eres ${nombre && nombre !== 'Robot' ? nombre : 'Robot Companion'}, un asistente personal que trabaja en el ordenador del usuario usando herramientas.`,
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
    personalidad ? `\nTU ALMA, TU IDENTIDAD, TU HUMANO E INSTRUCCIONES (eres tú; las instrucciones síguelas):\n${personalidad}` : '',
    interior ? `\n${interior}` : '',
    nacimiento ? `\nESTÁS NACIENDO (esto manda sobre lo demás hasta que llames a "nacer"):\n${nacimiento}` : '',
    guardados ? `\nAGENTES GUARDADOS (úsalos con delegar + "agente"):\n${guardados}` : '',
    skills ? `\n${skills}` : '',
    s.llamada && Date.now() - s.llamada < 10 * 60_000 ? `\n${LLAMADA}` : '',
    resumen ? `\nRESUMEN DE LA PARTE ANTERIOR DE ESTA CONVERSACIÓN (ya no ves esos mensajes; continúa desde aquí):\n${resumen}` : '',
  ].filter(Boolean).join('\n');
}

// llamada de voz desde la isla (s.llamada, no se guarda en disco): todo lo que escribe se oye
const LLAMADA = 'ESTÁS EN UNA LLAMADA DE VOZ con el usuario: todo lo que escribas se lee en voz alta al momento. Habla como una persona en una conversación, ' +
  'natural y cercano. Respuestas cortas (1-3 frases) salvo que pida algo largo (una historia, una explicación). Sin markdown, listas, emojis, enlaces ni código. ' +
  'Si la transcripción de lo que dijo no tiene sentido, pide que lo repita.';

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

function crearAgente({ cfg, proveedores, permisos, sesiones, tareas, memoria, personalidad, compactador, subagentes, control, navegador, skills, consejo, turnoNoche, sandbox, conciencia, herramientas = registroBase.crearRegistro() }) {
  herramientas.registrar([grupos.crearCargar()]);
  const ejecuciones = crearEjecuciones({ cfg });
  herramientas.registrar([{ nombre: 'leer_resultado', riesgo: 'lectura', descripcion: 'Lee por partes un resultado completo de esta sesion usando su ejecucion e id de artefacto.',
    parametros: { type: 'object', properties: { ejecucion: { type: 'string' }, id: { type: 'string' }, desde: { type: 'integer', minimum: 0 } }, required: ['ejecucion', 'id'] }, resumen: a => a.id,
    ejecutar: (a, ctx) => ejecuciones.recurso(ctx.sesion.id, a.ejecucion, a.id, a.desde) }]);
  const { HERRAMIENTAS, porNombre } = herramientas;
  herramientas.registrar([grupos.crearBuscar(() => HERRAMIENTAS)]);
  const enCurso = new Map();   // sesion.id -> AbortController
  const colas = new Map();

  function enviar(s, texto, emitir = () => {}, admision = () => true) {
    if (enCurso.has(s.id) || colas.get(s.id)?.length) {
      const q = colas.get(s.id) || [];
      if (q.length >= (cfg.cola?.max ?? 20)) return Promise.reject(new Error('cola de sesion llena'));
      const id = crypto.randomUUID();
      return new Promise((ok, mal) => {
        q.push({ id, s, texto, emitir, admision, ok, mal, cwd: s.cwd, modelo: s.modelo, soloLectura: !!s.soloLectura }); colas.set(s.id, q);
        s.entradasPendientes = q.map(x => ({ id: x.id, texto: redactar(x.texto), creado: Date.now() })); sesiones.guardarMeta(s);
        emitir({ tipo: 'encolado', sesion: s.id, entrada: id, posicion: q.length });
      });
    }
    return ejecutarTurno(s, texto, emitir, admision);
  }
  function corregir(s, texto) {
    const ctl = enCurso.get(s.id); if (!ctl || ctl.signal.aborted) return false;
    const id = crypto.randomUUID(); ctl.correcciones.push({ id, texto: String(texto) });
    permisos.cancelarSesion?.(s.id);
    s.correccionesPendientes = ctl.correcciones.map(x => ({ id: x.id, texto: redactar(x.texto) })); sesiones.guardarMeta(s); return id;
  }
  function reanudar(s, emitir, entrada) {
    if (enCurso.has(s.id)) throw new Error('la sesion ya esta trabajando');
    const guardada = entrada && s.entradasPendientes?.find(x => x.id === entrada);
    if (entrada && !guardada) throw new Error('entrada pendiente no encontrada');
    const ultima = ejecuciones.lista(s.id)[0];
    if (!guardada && (!ultima || !['interrumpida', 'incompleta', 'requiere_verificacion', 'error', 'cancelada'].includes(ultima.estado))) throw new Error('no hay trabajo pendiente');
    const texto = guardada?.texto || `Continua el objetivo anterior: ${ultima.objetivo}. Revisa las evidencias existentes; los efectos inciertos necesitan conciliacion antes de repetirse.`;
    if (guardada) s.entradasPendientes = s.entradasPendientes.filter(x => x.id !== entrada);
    if (!guardada) Object.defineProperty(s, '_reanudaDesde', { value: ultima.id, configurable: true });
    return enviar(s, texto, emitir);
  }

  async function ejecutarTurno(s, texto, emitir = () => { }, admision = () => true) {
    if (enCurso.has(s.id)) throw new Error('la sesión ya está trabajando');
    const ctl = new AbortController(); enCurso.set(s.id, ctl);
    ctl.correcciones = [];
    let run, tope;
    const ev = (tipo, datos) => emitir({ tipo, sesion: s.id, ejecucion: run?.id, ...datos });
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
      if (!admision()) throw new Error('autoridad de la entrada revocada');
      run = ejecuciones.iniciar(s, texto); s.ultimaEjecucion = { id: run.id, estado: 'trabajando' };
      s.turnosAgente = (s.turnosAgente || 0) + 1;
      const presupuesto = s.padre && s._presupuesto ? s._presupuesto : { tokens: 0, costo: 0, inicio: Date.now(), maxTokens: cfg.presupuesto?.maxTokens ?? 200000, maxMs: cfg.presupuesto?.maxDuracionMs ?? 900000, maxCosto: cfg.presupuesto?.maxCosto ?? 0 };
      Object.defineProperty(s, '_presupuesto', { value: presupuesto, configurable: true });
      tope = setTimeout(() => ctl.abort(new Error('presupuesto de tiempo agotado')), Math.max(1, presupuesto.maxMs - (Date.now() - presupuesto.inicio))); tope.unref?.();
      const seen = new Map(), progreso = new Map();
      let externa = false, avisoBucle = false, fallosPendientes = false, verificacionPendiente = false;
      await proveedores.listo?.();                                        // recién arrancado: saber qué proveedores hay antes de elegir
      const modeloElegido = require('./enrutamiento').elegir(cfg, s, texto);
      const soloLocal = cfg.proveedores?.[String(modeloElegido).split('/')[0]]?.local && cfg.recuperacion?.permitirNube !== true;
      let elegido = proveedores.resolver(modeloElegido, { sinRespaldo: !!soloLocal }), api = elegido.api, model = elegido.model;
      let modeloReal = elegido.nombre ? `${elegido.nombre}/${model}` : modeloElegido;
      const usoAntes = { ...s.uso };
      if (!s.usoPorModelo && (s.uso.entrada || s.uso.salida)) s.usoPorModelo = { [s.modelo]: { ...s.uso } };
      sesiones.agregar(s, { role: 'user', content: texto, t: Date.now() });
      if (s.titulo === 'Nueva sesión') s.titulo = texto.slice(0, 60);
      ev('inicio', { modelo: s.modelo });
      const alcanceMemoria = { proyecto: s.cwd, usuario: s.usuario };
      let recuerdos = ''; try { recuerdos = memoria ? await memoria.contexto(texto, alcanceMemoria) : ''; } catch { }
      let memoriaLeida = recuerdos;
      let pers = ''; try { pers = personalidad ? personalidad.prompt() : ''; } catch { }
      let sk = ''; try { sk = skills ? (await skills.seccion({ sesion: s, mensaje: texto })).texto : ''; } catch { }   // índice + sugeridas (o la skill ya cargada)
      let interior = '', nombre = ''; try { if (!s.padre && s.canal !== 'eval') interior = conciencia?.()?.describir() || ''; nombre = personalidad?.nombre?.() || ''; } catch { }   // estado, metas, pensamientos, diario
      // primera conversación (NACIMIENTO.md): solo en charlas con el usuario, no en tareas, subagentes, evals ni la conciencia
      let nacimiento = ''; try { if (!s.padre && !s.tarea && !s.soloLectura && !['eval', 'conciencia', 'subagente'].includes(s.canal)) nacimiento = personalidad?.nacimiento?.() || ''; } catch { }
      const apagadas = new Set(cfg.herramientasOff || []);
      if (s.padre || !subagentes) apagadas.add('delegar');                // los subagentes no delegan (sin recursión)
      if (!nacimiento) apagadas.add('nacer');
      let hayActivas = false; try { hayActivas = !!skills?.almacen.lista().some(x => x.activa); } catch { }
      if (!hayActivas) ['usar_skill', 'leer_recurso_skill', 'anotar_skill', 'ejecutar_script_skill'].forEach(x => apagadas.add(x));   // sin skills activas: menos herramientas
      const todas = HERRAMIENTAS.filter(h => !apagadas.has(h.nombre) && (!s.herramientasPermitidas || s.herramientasPermitidas.includes(h.nombre)) && (!h.disponible || h.disponible()));
      // al modelo van el núcleo + los grupos de la conversación (core/herramientas-grupos.js); si pide una que no se le mandó
      // pero existe, se ejecuta igual y su grupo queda cargado
      const disponibles = new Set(todas.map(h => h.nombre));
      const paraEnviar = () => (cfg.herramientasPorGrupos === false ? todas : grupos.seleccionar(todas, s, texto, cfg.contexto?.herramientasTokens || 6000));
      let final = '', empujones = 0, empujon = false;
      const maxSalida = cfg.contexto?.maxSalida ?? 8192;
      const llamar = async (a, estimados) => {
        const candidatas = [modeloReal, ...(cfg.recuperacion?.reservas || []).filter(x => x !== modeloReal)];
        let ultima;
        for (let i = 0; i < candidatas.length; i++) {
          if (i) {
            const desdeLocal = cfg.proveedores?.[modeloReal.split('/')[0]]?.local;
            const aLocal = cfg.proveedores?.[candidatas[i].split('/')[0]]?.local;
            if (desdeLocal && !aLocal && cfg.recuperacion?.permitirNube !== true) continue;
            elegido = proveedores.resolver(candidatas[i], { sinRespaldo: true }); api = elegido.api; model = elegido.model; modeloReal = candidatas[i];
          }
          try {
            return await recuperar(async intento => {
              ctl.signal.throwIfAborted();
              if (presupuesto.tokens + estimados > presupuesto.maxTokens) throw new Error('presupuesto de tokens agotado');
              const precio = cfg.presupuesto?.precios?.[modeloReal];
              if (presupuesto.maxCosto && !precio) throw new Error('falta precio configurado para limitar el gasto');
              const previsto = precio ? (estimados * precio.entrada + maxSalida * precio.salida) / 1e6 : 0;
              if (presupuesto.maxCosto && presupuesto.costo + previsto > presupuesto.maxCosto) throw new Error('presupuesto de gasto agotado');
              presupuesto.tokens += estimados; presupuesto.costo += previsto;
              ev('progreso', { fase: 'modelo', modelo: modeloReal, intento, tokens: presupuesto.tokens });
              let parcial = '';
              const stream = cfg.agente?.streaming !== false && !(s.streamingNoAdmitido?.modelo === modeloReal && s.streamingNoAdmitido?.hasta > Date.now());
              const r = await cancelable(api.chat({ ...a, model, gestionada: true, maxTokens: maxSalida, onDelta: !stream ? undefined : delta => { if (ctl.signal.aborted) return; parcial += delta; ev('texto-parcial', { texto: redactarParcial(parcial), provisional: true, intento }); } }), ctl.signal);
              const efectivo = r.modeloReal?.includes('/') ? r.modeloReal : elegido.nombre ? `${elegido.nombre}/${r.modeloReal || model}` : modeloReal;
              s.usoPorModelo ||= {}; const contador = s.usoPorModelo[efectivo] ||= { entrada: 0, salida: 0 };
              contador.entrada += r.uso.entrada; contador.salida += r.uso.salida;
              s.uso.entrada += r.uso.entrada; s.uso.salida += r.uso.salida;
              const entradaReal = r.uso?.entrada || Math.max(1, estimados - maxSalida);
              const salidaReal = r.uso?.salida || Math.ceil(JSON.stringify([r.texto, r.toolCalls]).length / 3.5);
              presupuesto.tokens += entradaReal + salidaReal - estimados;
              if (precio) presupuesto.costo += (entradaReal * precio.entrada + salidaReal * precio.salida) / 1e6 - previsto;
              ev('modelo', { solicitado: s.modelo, efectivo, uso: r.uso });
              return r;
            }, { signal: ctl.signal, cfg: cfg.recuperacion, aviso: x => ev('reintento', x) });
          } catch (e) { ultima = e; if (!clasificar(e).temporal || ctl.signal.aborted) throw e; }
        }
        throw ultima;
      };
      for (let paso = 0; paso < cfg.maxPasos; paso++) {
        ctl.signal.throwIfAborted(); run.pasos = paso + 1;
        if (!admision()) throw new Error('autoridad de la entrada revocada');
        if (ctl.correcciones.length) {
          for (const c of ctl.correcciones.splice(0)) { sesiones.agregar(s, { role: 'user', content: c.texto, entradaId: c.id, t: Date.now() }); ev('correccion', { entrada: c.id }); }
          delete s.correccionesPendientes; sesiones.guardarMeta(s);
        }
        if (paso > 0 && paso % 3 === 0 && memoria) try { recuerdos = await memoria.contexto(`${texto}\n${s.mensajes.filter(m => m.role === 'assistant').at(-1)?.content || ''}`, alcanceMemoria); } catch { }
        const base = sistema(s, recuerdos, pers, '', cfg, sk, interior, nombre, nacimiento);
        if (compactador?.hace(s, base)) {              // conversación larga: resumir lo antiguo antes de seguir
          try { const c = await compactador.compactar(s, { signal: ctl.signal }); if (c) ev('compactacion', c); }
          catch (e) { if (ctl.signal.aborted) throw e; ev('aviso', { texto: `no pude compactar la conversación: ${e.message}` }); }
        }
        const v = vista(s.mensajes);
        const sys = sistema(s, recuerdos, pers, v.resumen, cfg, sk, interior, nombre, nacimiento);
        let historial = conImagenes(v.mensajes, s.sinVision || (s.visionNoAdmitida?.modelo === modeloReal && s.visionNoAdmitida?.hasta > Date.now()));
        if (empujon) { historial = [...historial, { role: 'user', content: EMPUJON }]; empujon = false; }   // solo para esta llamada, no se guarda
        const herramientas = paraEnviar();
        const limite = cfg.contexto?.porModelo?.[modeloReal] || cfg.contexto?.maxTokens || 24000;
        const contexto = ensamblar({ system: sys, mensajes: historial, herramientas, limite, reserva: Math.max(cfg.contexto?.reserva ?? 2048, maxSalida) });
        historial = contexto.mensajes;
        if (contexto.podados.length) ev('contexto', { podados: contexto.podados.length, tokens: contexto.estimados });
        let r;
        try { r = await llamar({ system: sys, mensajes: historial, herramientas, signal: ctl.signal }, contexto.estimados); }
        catch (e) {                                      // ¿el modelo no acepta imágenes? se marca la sesión y se reintenta solo con texto
          if (clasificar(e).status === 400 && /stream/i.test(e.message) && /unknown|unsupported|not support|not allowed/i.test(e.message)) {
            s.streamingNoAdmitido = { modelo: modeloReal, hasta: Date.now() + 3600000 }; sesiones.guardarMeta(s);
            ev('aviso', { texto: 'El proveedor no admite streaming; se conserva el modo JSON para este modelo.' });
            r = await llamar({ system: sys, mensajes: historial, herramientas, signal: ctl.signal }, contexto.estimados);
          } else {
          if (ctl.signal.aborted || s.sinVision || !clasificar(e).imagen || !historial.some(m => m.imagenes?.length)) throw e;
          s.visionNoAdmitida = { modelo: modeloReal, hasta: Date.now() + 3600000 }; sesiones.guardarMeta(s);
          ev('aviso', { texto: `${s.modelo} no aceptó la imagen (${String(e.message).slice(0, 120)}): sigo solo con la lista de elementos` });
          historial = conImagenes(v.mensajes, true);
          r = await llamar({ system: sys, mensajes: historial, herramientas, signal: ctl.signal }, contexto.estimados);
          }
        }
        if (!r.texto && !r.toolCalls.length) {          // modelos con razonamiento a veces "piensan" y no contestan: se lo pedimos una vez
          const r2 = await llamar({ system: sys, mensajes: [...historial, { role: 'user', content: '(Escribe ya tu respuesta final al usuario, breve.)' }], herramientas: [], signal: ctl.signal }, contexto.estimados);
          r = { ...r2, uso: { entrada: r.uso.entrada + r2.uso.entrada, salida: r.uso.salida + r2.uso.salida } };
        }
        ctl.signal.throwIfAborted();
        if (ctl.correcciones.length) {
          for (const c of ctl.correcciones.splice(0)) { sesiones.agregar(s, { role: 'user', content: c.texto, entradaId: c.id, t: Date.now() }); ev('correccion', { entrada: c.id }); }
          delete s.correccionesPendientes; sesiones.guardarMeta(s); ev('reintento', { motivo: 'correccion del usuario', esperaMs: 0 });
          if (paso === cfg.maxPasos - 1) { turno.detenido = true; final = 'Trabajo incompleto: la correccion requiere un turno adicional.'; }
          continue;
        }
        const ids = new Set(); r.toolCalls = r.toolCalls.filter(c => { if (ids.has(c.id)) { ev('aviso', { texto: 'llamada duplicada descartada: ' + c.id }); return false; } ids.add(c.id); return true; });
        sesiones.agregar(s, { role: 'assistant', content: r.texto, toolCalls: r.toolCalls.length ? r.toolCalls : undefined, procedencia: externa ? 'externa' : 'agente', t: Date.now() });
        if (r.texto) { final = r.texto; ev('texto', { texto: r.texto }); }
        if (!r.toolCalls.length) {
          if (r.texto && !nacimiento && !turno.herramientas && PROMESA.test(r.texto) && empujones < 2 && paso < cfg.maxPasos - 1 && !ctl.signal.aborted) {
            empujones++; empujon = true;
            ev('aviso', { texto: 'el modelo prometió hacerlo sin usar herramientas: le pido que lo haga de verdad' });
            continue;
          }
          break;
        }
        const correr = async c => {
          ctl.signal.throwIfAborted();
          if (ctl.correcciones.length) return 'DENEGADO: hay una correccion pendiente del usuario; esta operacion se reevaluara';
          if (seen.has(c.id)) return resultados.normalizar({ estado: 'error', texto: 'error: toolCall duplicada; no se repite el efecto' });
          seen.set(c.id, true);
          const h = disponibles.has(c.name) ? porNombre[c.name] : null;
          if (!h) return `error: herramienta "${c.name}" no existe`;
          if (!c.args || typeof c.args !== 'object' || Array.isArray(c.args)) return 'error: argumentos deben ser un objeto';
          if (Object.hasOwn(c.args, '_crudo')) return 'error: argumentos JSON invalidos; la herramienta no se ejecuta';
          const errorArgs = validar(c.args, h.parametros);
          if (errorArgs) return `error: argumentos invalidos: ${errorArgs}`;
          const g = grupos.grupoDe(c.name);              // usada = su grupo se queda cargado en esta conversación
          if (g && g !== 'nucleo' && !(s.gruposCargados || []).includes(g)) s.gruposCargados = [...(s.gruposCargados || []), g];
          if (g) { s.gruposActividad ||= {}; s.gruposActividad[g] = s.turnosAgente; }
          if ((s.canal === 'eval' || s.soloLectura) && (typeof h.riesgo === 'function' ? h.riesgo(c.args || {}, s) : h.riesgo) !== 'lectura') return `DENEGADO: ${s.soloLectura ? 'en un encargo por iniciativa propia' : 'en una evaluación'} solo se permiten herramientas de lectura`;
          ev('herramienta', { id: c.id, nombre: c.name, args: c.args || {}, resumen: h.resumen(c.args || {}) });
          run.estado = 'esperando'; ejecuciones.guardar(run);
          const p = await permisos.pedir({ h, args: c.args || {}, sesion: s, ctx: { skills }, signal: ctl.signal });
          run.estado = 'trabajando'; ejecuciones.guardar(run);
          ctl.signal.throwIfAborted();
          if (!p.ok) return `DENEGADO: ${p.motivo}`;
          if (!admision()) return 'DENEGADO: autoridad de la entrada revocada';
          let operacion;
          try {
            const riesgo = typeof h.riesgo === 'function' ? h.riesgo(c.args, s) : h.riesgo;
            if (riesgo !== 'lectura' && s._reanudaDesde) {
              const previa = ejecuciones.leer(s._reanudaDesde)?.operaciones.find(o => o.huella === hash([c.name, c.args]) && ['exito', 'desconocido'].includes(o.estado));
              if (previa) { verificacionPendiente = true; permisos.resultado?.(p.auditId, null, 'operacion previa no repetida'); return resultados.normalizar({ estado: 'desconocido', texto: 'Esta operacion ya termino en la ejecucion anterior y no se repitio. Comprueba su resultado actual antes de afirmar que el objetivo esta completo.' }); }
            }
            operacion = ejecuciones.empezar(run, c, riesgo);
            const out = await cancelable(h.ejecutar(c.args || {}, { cwd: s.cwd, signal: ctl.signal, permisos, sesion: s, tareas: tareas(), memoria, memoriaInyectada: memoriaLeida, personalidad, cfg, resultadosEstructurados: true, subagentes: subagentes?.(), control: control?.(), navegador: navegador?.(), skills, consejo: consejo?.(), turno: turnoNoche?.(), sandbox: sandbox?.(), procedencia: { clase: externa ? 'externa' : s.tarea || s.padre ? 'sistema' : 'agente', proyecto: s.cwd, usuario: s.usuario, sesion: s.id } }), ctl.signal);
            // FASE 9: las claves conocidas (bóveda, token del daemon) nunca vuelven al modelo aunque una herramienta las imprima
            const r = resultados.normalizar(h.resultado ? h.resultado(out) : out);
            if (h.plugin || h.servicio?.startsWith('mcp')) r.verificado = false;
            if (riesgo !== 'lectura' && !resultados.fallo(r) && !r.verificado) verificacionPendiente = true;
            if (r.texto.length > 8000) { const a = ejecuciones.artefacto(run, r.texto); r.artefacto = a; r.texto = r.texto.slice(0, 7000) + `\n[resultado completo: leer_resultado ejecucion=${a.ejecucion} id=${a.id}]\n` + r.texto.slice(-700); }
            ejecuciones.terminar(run, operacion, r);
            permisos.resultado?.(p.auditId, r.estado === 'exito' ? true : resultados.fallo(r) ? false : null, r.texto);
            return r;
          } catch (e) { const r = resultados.normalizar({ estado: operacion && operacion.riesgo !== 'lectura' ? 'incierto' : 'error', texto: `error: ${e.message}` }); if (operacion) ejecuciones.terminar(run, operacion, r); permisos.resultado?.(p.auditId, false, e.message); return r; }
        };
        // los "delegar" de una misma respuesta arrancan a la vez (subagentes en paralelo); el resto va en orden
        const enParalelo = new Map(); let instruccionProgreso = '';
        const paralelo = c => c.name === 'delegar' || (porNombre[c.name]?.paralelizable === true && porNombre[c.name]?.riesgo === 'lectura');
        for (let i = 0; i < r.toolCalls.length; i++) {
          const c = r.toolCalls[i];
          if (!enParalelo.has(c.id) && paralelo(c)) for (let j = i; j < Math.min(r.toolCalls.length, i + (cfg.agente?.lecturasParalelas ?? 3)) && paralelo(r.toolCalls[j]); j++) enParalelo.set(r.toolCalls[j].id, correr(r.toolCalls[j]).catch(e => resultados.normalizar({ estado: 'error', texto: `error: ${e.message}` })));
          if (ctl.signal.aborted) { await Promise.allSettled(enParalelo.values()); throw new Error('cancelado'); }
          const res = resultados.normalizar(enParalelo.has(c.id) ? await enParalelo.get(c.id) : await correr(c));
          const resultado = res.texto;
          if (['buscar_memoria', 'buscar_historial'].includes(c.name)) memoriaLeida = (memoriaLeida + '\n' + resultado).slice(-12000);
          const fallo = resultados.fallo(res); fallosPendientes ||= fallo;
          const huella = hash([c.name, c.args, resultado]); const repetidos = (progreso.get(huella) || 0) + 1; progreso.set(huella, repetidos);
          if (repetidos >= (cfg.agente?.repeticiones ?? 3)) {
            if (avisoBucle) { turno.detenido = true; final = 'Trabajo incompleto: no hay progreso verificable; se detuvo la repeticion.'; }
            else { avisoBucle = true; instruccionProgreso = 'No hubo progreso con la misma operacion. Cambia de estrategia respetando las denegaciones o explica el bloqueo.'; }
          }
          if (['web', 'leer_archivo', 'leer_recurso_skill'].includes(c.name) || c.name.startsWith('navegador_') || porNombre[c.name]?.plugin || porNombre[c.name]?.servicio?.startsWith('mcp')) externa = true;
          if (!fallo) permisos.exfil?.registrarLectura(s, c.name, resultado);
          turno.herramientas++; turno.nombres.add(c.name); if (fallo) turno.errores++;
          if (c.name === 'usar_skill' && !fallo) { const sl = skills?.almacen?.obtener(String(c.args?.nombre || ''))?.slug; if (sl) turno.skills.add(sl); }
          const imagenes = !res.imagenes.length ? undefined : res.imagenes.map(i => ({ mime: i.mime, ruta: i.ruta }));
          sesiones.agregar(s, { role: 'tool', toolCallId: c.id, name: c.name, content: resultado, estado: res.estado, evidencias: res.evidencias, procedencia: externa ? 'externa' : 'agente', imagenes, t: Date.now() });
          ev('resultado', { id: c.id, nombre: c.name, estado: res.estado, verificado: res.verificado, resultado: resultado.slice(0, 2000), imagenes: imagenes?.length || undefined });
        }
        if (instruccionProgreso) sesiones.agregar(s, { role: 'user', content: instruccionProgreso, procedencia: 'sistema' });
        if (turno.detenido) break;
        if (paso === cfg.maxPasos - 1) { final += `\n[detenido: límite de ${cfg.maxPasos} pasos]`; turno.detenido = true; }
      }
      if (turno.skills.size) s.ultimaSkill = { slugs: [...turno.skills], t: Date.now(), pregunta: String(texto).slice(0, 200), respuesta: final.slice(0, 200) };
      if (taller && turno.detenido) for (const slug of turno.skills) try { taller.registrarFallo(slug, { problema: `no terminó: llegó al límite de ${cfg.maxPasos} pasos`, contexto: `pidió: ${String(texto).slice(0, 200)}`, sesion: s.id }); } catch { }
      // turno largo y bien hecho → sugerir convertirlo en skill (heurística, sin llamar al modelo; 1 vez por sesión)
      if (taller && cfg.skills?.sugerir !== false && !s.padre && !s.tarea && s.canal !== 'eval' && !s.skillSugerida && !turno.detenido && !turno.skills.size &&
        !fallosPendientes && !turno.nombres.has('crear_skill') && turno.herramientas >= (cfg.skills?.umbralSugerir || 6) && turno.errores * 3 <= turno.herramientas) {
        s.skillSugerida = Date.now();
        const resumen = `${String(texto).slice(0, 160)} — ${turno.herramientas} herramientas (${[...turno.nombres].join(', ')})`;
        ev('skill-sugerida', { resumen });
        final += /^en/i.test(cfg.idioma || '') ? '\n\n(Tip: I could save what we just did as a reusable skill. Say "make a skill out of this" and I\'ll draft it.)'
          : '\n\n(Sugerencia: lo que acabamos de hacer se puede guardar como skill reutilizable. Dime «crea una skill con esto» y la redacto.)';
      }
      sesiones.guardarMeta(s);
      const estado = turno.detenido || fallosPendientes ? 'incompleta' : verificacionPendiente ? 'requiere_verificacion' : 'completada';
      if (estado === 'incompleta' && !/incomplet|detenido/i.test(final)) final += '\n[trabajo incompleto: quedan errores o comprobaciones pendientes]';
      if (estado === 'requiere_verificacion') ev('aviso', { texto: 'Acciones ejecutadas; falta verificar el resultado final.' });
      run.uso = { entrada: s.uso.entrada - usoAntes.entrada, salida: s.uso.salida - usoAntes.salida }; run.modelo = modeloReal; run.presupuesto = { tokens: presupuesto.tokens, costo: presupuesto.costo };
      ejecuciones.cerrar(run, estado); s.ultimaEjecucion.estado = estado; sesiones.guardarMeta(s);
      ev('fin', { texto: final, estado, uso: s.uso });
      return final;
    } catch (e) {
      const publico = Object.assign(new Error(redactar(String(e.message || e))), { code: e.code, status: e.status });
      if (run) { ejecuciones.cerrar(run, ctl.signal.aborted ? 'cancelada' : 'error'); s.ultimaEjecucion.estado = run.estado; }
      if (taller && turno.skills.size && !ctl.signal.aborted)        // turno con skill que acabó en error → aprendizaje de la skill
        for (const slug of turno.skills) try { taller.registrarFallo(slug, { problema: `el turno terminó en error: ${e.message}`, contexto: `pidió: ${String(texto).slice(0, 200)}`, sesion: s.id }); } catch { }
      sesiones.guardarMeta(s);
      ev('error', { error: publico.message });
      throw publico;
    } finally {
      clearTimeout(tope); enCurso.delete(s.id);
      delete s._reanudaDesde;
      const q = colas.get(s.id); const siguiente = q?.shift();
      s.entradasPendientes = (q || []).map(x => ({ id: x.id, texto: redactar(x.texto) }));
      if (siguiente) {
        if (siguiente.cwd !== s.cwd || siguiente.modelo !== s.modelo || siguiente.soloLectura !== !!s.soloLectura) { siguiente.mal(new Error('cambio la politica de la sesion; reenvia la entrada')); for (const x of q.splice(0)) x.mal(new Error('cambio la politica de la sesion; reenvia la entrada')); }
        else ejecutarTurno(s, siguiente.texto, siguiente.emitir, siguiente.admision).then(siguiente.ok, siguiente.mal);
      }
      try { sesiones.guardarMeta(s); } catch { ev('aviso', { texto: 'No se pudo persistir el estado final de la cola.' }); }
    }
  }

  function cancelar(id) { const q = colas.get(id) || []; colas.delete(id); for (const x of q) x.mal(new Error('cancelado')); const c = enCurso.get(id); if (c) { c.abort(new Error('cancelado')); permisos.cancelarSesion?.(id); } return !!c || q.length > 0; }
  return { enviar, corregir, reanudar, cancelar, ejecuciones, ocupada: id => enCurso.has(id) };
}

module.exports = { crearAgente };
