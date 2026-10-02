// Fase 3 · macros POR DEMOSTRACIÓN: el usuario pulsa Grabar, hace la tarea una vez y pulsa Parar → APOLO la convierte
// en una skill BORRADOR del taller (desactivada y escaneada) con pasos por NOMBRE de elemento, no por coordenadas.
//
// Cómo: manos.ps1 instala un gancho de bajo nivel (WH_MOUSE_LL / WH_KEYBOARD_LL) SOLO mientras graba y emite eventos
//   {evento:'demo', tipo:'clic'|'scroll'|'tecla', ventana:{titulo,proceso}, elemento|foco:{tipo,nombre,id,password}, texto|combo|secreto}
//   {evento:'demo-fin', motivo}   (Ctrl+Alt+Esc o el ayudante se cerró)
// Privacidad: NUNCA se guarda lo tecleado en un campo de contraseña ni en ventanas protegidas (bancos, gestores…): queda
// "el usuario escribe aquí su secreto". Los eventos crudos no se guardan; solo los pasos agrupados.
// Seguridad: empezar a grabar pide permiso SIEMPRE (herramienta) o confirmación explícita (panel). Mientras graba hay
// indicador visible (overlay de la app + panel) y nadie puede tomar el control del ratón; máx. cfg.escritorio.demo.maxMin (10).
// Eventos del bus: 'evento' {tipo:'demo', estado:'grabando'|'parada'|'skill', ...}
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { bloqueada } = require('./index');

const PROPIA = /\bAPOLO\b|Robot Companion|127\.0\.0\.1:47\d\d\d|localhost:47\d\d\d/i;     // el panel/isla: sus clics (Grabar/Parar) no son la tarea
const err = (m, status = 400) => Object.assign(new Error(m), { status });
const mismaVentana = (a, b) => a && b && a.titulo === b.titulo && a.proceso === b.proceso;
const mismoCampo = (a, b) => (a?.nombre || '') === (b?.nombre || '') && (a?.tipo || '') === (b?.tipo || '') && (a?.id || '') === (b?.id || '');

// eventos crudos → pasos de alto nivel
function agrupar(eventos, { cfg = {} } = {}) {
  const pasos = [];
  let ventana = null, protegidaAvisada = null;
  const ultimo = () => pasos[pasos.length - 1];
  for (const ev of eventos) {
    if (!ev || !ev.tipo) continue;
    const v = ev.ventana || ventana;
    if (v && !mismaVentana(v, ventana)) {
      ventana = { titulo: v.titulo || '', proceso: v.proceso || '' };
      pasos.push({ tipo: 'ventana', titulo: ventana.titulo, proceso: ventana.proceso, t: ev.t });
    }
    if (v && bloqueada(cfg, v)) {                          // ventana protegida: no se graba nada de lo que pase dentro
      if (protegidaAvisada !== v.titulo) { pasos.push({ tipo: 'protegida', titulo: v.titulo, t: ev.t }); protegidaAvisada = v.titulo; }
      continue;
    }
    protegidaAvisada = null;
    if (ev.tipo === 'clic') {
      const el = ev.elemento && (ev.elemento.nombre || ev.elemento.id) ? { tipo: ev.elemento.tipo || '', nombre: ev.elemento.nombre || '', id: ev.elemento.id || '' } : null;
      const u = ultimo();
      if (u?.tipo === 'clic' && !u.doble && ev.t - u.t < 500 && (u.boton || 'izq') === (ev.boton || 'izq') && Math.abs(u.x - ev.x) < 6 && Math.abs(u.y - ev.y) < 6) { u.doble = true; u.t = ev.t; continue; }
      pasos.push({ tipo: 'clic', boton: ev.boton || 'izq', elemento: el, x: ev.x, y: ev.y, t: ev.t });
    } else if (ev.tipo === 'scroll') {
      const u = ultimo(), c = ev.delta > 0 ? -1 : 1;       // delta>0 = rueda hacia arriba
      if (u?.tipo === 'scroll' && Math.sign(u.cantidad) === c) { u.cantidad += c; u.t = ev.t; } else pasos.push({ tipo: 'scroll', cantidad: c, t: ev.t });
    } else if (ev.tipo === 'tecla') {
      const campo = ev.foco ? { tipo: ev.foco.tipo || '', nombre: ev.foco.nombre || '', id: ev.foco.id || '' } : null;
      const u = ultimo();
      if (ev.secreto || ev.foco?.password) {
        if (!(u?.tipo === 'escribir' && u.secreto && mismoCampo(u.campo, campo))) pasos.push({ tipo: 'escribir', secreto: true, campo, t: ev.t });
        continue;
      }
      if (typeof ev.texto === 'string' && ev.texto) {
        if (u?.tipo === 'escribir' && !u.secreto && mismoCampo(u.campo, campo)) { u.texto += ev.texto; u.t = ev.t; } else pasos.push({ tipo: 'escribir', texto: ev.texto, campo, t: ev.t });
      } else if (ev.combo) {
        if (/^(backspace|retroceso)$/.test(ev.combo) && u?.tipo === 'escribir' && !u.secreto && u.texto) { u.texto = u.texto.slice(0, -1); if (!u.texto) pasos.pop(); continue; }
        pasos.push({ tipo: 'tecla', combo: ev.combo, t: ev.t });
      }
    }
  }
  // fuera los pasos del propio panel al principio (pulsar Grabar) y al final (pulsar Parar)
  const esPropio = p => p.tipo === 'ventana' ? PROPIA.test(`${p.titulo} ${p.proceso}`) : false;
  const propios = new Set(); let enPropia = false;
  pasos.forEach((p, i) => { if (p.tipo === 'ventana') enPropia = esPropio(p); if (enPropia) propios.add(i); });
  let ini = 0, fin = pasos.length;
  while (ini < fin && propios.has(ini)) ini++;
  while (fin > ini && propios.has(fin - 1)) fin--;
  const res = pasos.slice(ini, fin);
  while (res.length && res[res.length - 1].tipo === 'ventana') res.pop();
  return res;
}

const comillas = t => `«${String(t || '').replace(/\s+/g, ' ').trim().slice(0, 80)}»`;
const nombreEl = e => (e ? `${e.tipo ? `${e.tipo} ` : ''}${comillas(e.nombre || e.id)}${e.id && e.nombre ? ` (AutomationId ${e.id})` : ''}` : null);

// pasos → lista Markdown robusta (por nombre de elemento; las coordenadas solo como última pista)
function pasosMarkdown(pasos) {
  const l = [];
  for (const p of pasos) {
    if (p.tipo === 'ventana') l.push(`Pon delante la ventana ${comillas(p.titulo)} (proceso \`${p.proceso}\`). Si no está abierta, ábrela; si el título cambia un poco (otro documento), vale la del mismo programa.`);
    else if (p.tipo === 'protegida') l.push(`El usuario hizo algo en una ventana PROTEGIDA (${comillas(p.titulo)}) que no se grabó: pídele que lo haga él y espera a que te diga que ha terminado.`);
    else if (p.tipo === 'clic') {
      const que = p.elemento ? nombreEl(p.elemento) : null;
      const como = `${p.doble ? 'Doble clic' : 'Clic'}${p.boton === 'der' ? ' derecho' : p.boton === 'medio' ? ' central' : ''}`;
      l.push(que ? `${como} en ${que}: búscalo por su NOMBRE en ver_pantalla (no por posición).`
        : `${como} en una zona sin elemento accesible (estaba en ~${p.x},${p.y} de la pantalla): usa ver_pantalla y la rejilla para encontrar lo equivalente.`);
    } else if (p.tipo === 'escribir') {
      const donde = p.campo && (p.campo.nombre || p.campo.id) ? ` en ${nombreEl(p.campo)}` : '';
      l.push(p.secreto ? `Aquí el usuario escribió una CONTRASEÑA/secreto${donde}: NO la escribas tú; pídele que la escriba él.`
        : `Escribe ${JSON.stringify(p.texto)}${donde}.`);
    } else if (p.tipo === 'tecla') l.push(`Pulsa \`${p.combo}\`.`);
    else if (p.tipo === 'scroll') l.push(`Rueda del ratón ${Math.abs(p.cantidad)} muesca(s) hacia ${p.cantidad > 0 ? 'abajo' : 'arriba'}.`);
  }
  return l.map((x, i) => `${i + 1}. ${x}`).join('\n');
}

function instrucciones({ nombre, pasos, notas = '', fecha = new Date() }) {
  return `# ${nombre}

Macro aprendida POR DEMOSTRACIÓN el ${fecha.toLocaleString('es')}: el usuario la hizo una vez delante de APOLO.

## Cómo ejecutarla
- Necesitas el control del PC: pide \`tomar_control\` con un motivo claro.
- Antes de cada paso usa \`ver_pantalla\` y localiza el elemento por su NOMBRE (y tipo); las coordenadas cambian entre pantallas.
- Tras cada acción lee la COMPROBACIÓN. Si dice que no cambió nada o la ventana no es la esperada, PARA y díselo al usuario.
- Si un elemento no aparece en la lista (app sin accesibilidad), usa la rejilla de la captura (\`celda\`).
- Las acciones delicadas (enviar, borrar, comprar…) piden permiso aparte: es normal.
- Al acabar, \`soltar_control\` y cuenta solo lo que hayas VISTO hecho.
${notas ? `\n## Notas\n${notas}\n` : ''}
## Pasos
${pasosMarkdown(pasos)}
`;
}

function crearDemo({ cfg, bus, permisos, control, taller, generarJSON, modelo }) {
  const dirDemos = () => { const d = path.join(cfg.dir, 'demos'); fs.mkdirSync(d, { recursive: true }); return d; };
  let actual = null;                                        // { id, nombre, inicio, eventos:[], sesion, timer, quitar }
  const emitir = (estado, extra = {}) => bus?.emit('evento', { tipo: 'demo', estado, ...extra });
  const estado = () => (actual ? { grabando: true, id: actual.id, nombre: actual.nombre, inicio: actual.inicio, eventos: actual.eventos.length, hasta: actual.hasta } : { grabando: false });

  // origen: 'panel' (el usuario pulsó Grabar y confirmó) | 'herramienta' (el agente ya pidió permiso con siemprePreguntar) | 'pedir' (pregunta aquí)
  async function empezar({ nombre = '', sesion = null, origen = 'panel', confirmo = false } = {}) {
    if (actual) throw err('ya se está grabando una demostración', 409);
    if (process.platform !== 'win32' && !control.simulado) throw err('grabar demostraciones solo está disponible en Windows por ahora');
    if (control.estado().length) throw err('el robot tiene ahora el control del ratón: espera a que lo suelte', 409);
    if (origen === 'panel' && confirmo !== true) throw err('confirma que quieres grabar (confirmo: true)');
    if (origen === 'pedir') {                              // 'herramienta' ya preguntó en el agente (siemprePreguntar)
      const h = { nombre: 'grabar_demostracion', riesgo: 'control', resumen: () => `grabar lo que hagas con ratón y teclado${nombre ? ` («${nombre}»)` : ''}`,
        siemprePreguntar: () => 'grabar tu ratón y teclado (macro por demostración)' };
      const p = await permisos.pedir({ h, args: {}, sesion });
      if (!p.ok) throw err('DENEGADO por el usuario: no se graba', 403);
    }
    const maxMin = Math.min(Math.max(Number(cfg.escritorio?.demo?.maxMin) || 10, 1), 30);
    const id = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
    const yo = { id, nombre: String(nombre || '').trim().slice(0, 80), inicio: Date.now(), hasta: Date.now() + maxMin * 60_000, eventos: [], sesion: sesion?.id || null };
    yo.quitar = control.alEventoManos(j => {
      if (actual !== yo) return;
      if (j.evento === 'demo') { if (yo.eventos.length < 5000) yo.eventos.push({ ...j, evento: undefined, t: j.t || Date.now() }); if (yo.eventos.length % 10 === 1) emitir('grabando', estado()); }
      else if (j.evento === 'demo-fin') parar({ motivo: j.motivo || 'Ctrl+Alt+Esc' }).catch(() => { });
    });
    actual = yo;
    control.retener(true);
    try { await control.orden({ op: 'grabar' }); }
    catch (e) { yo.quitar(); actual = null; control.retener(false); throw err(`no pude empezar a grabar: ${e.message}`, 500); }
    yo.timer = setTimeout(() => parar({ motivo: `límite de ${maxMin} min` }).catch(() => { }), maxMin * 60_000); yo.timer.unref?.();
    emitir('grabando', estado());
    return estado();
  }

  // para la grabación y (si generar !== false) crea la skill borrador. → { id, pasos, skill?, motivo }
  async function parar({ motivo = 'parada', generar = true, nombre } = {}) {
    const yo = actual; if (!yo) throw err('no se está grabando nada', 409);
    actual = null; clearTimeout(yo.timer); yo.quitar?.();
    try { await control.orden({ op: 'parar' }); } catch { }
    control.retener(false);
    const pasos = agrupar(yo.eventos, { cfg });
    const demo = { id: yo.id, nombre: nombre || yo.nombre, inicio: yo.inicio, fin: Date.now(), motivo, eventos: yo.eventos.length, pasos, sesion: yo.sesion, skill: null };
    emitir('parada', { id: demo.id, pasos: pasos.length, motivo });
    if (generar && pasos.some(p => p.tipo !== 'ventana')) {
      try { demo.skill = await crearSkill(demo); } catch (e) { demo.errorSkill = e.message; }
    } else if (generar) demo.errorSkill = 'no se grabó ninguna acción';
    fs.writeFileSync(path.join(dirDemos(), `${demo.id}.json`), JSON.stringify(demo, null, 2));
    if (demo.skill) emitir('skill', { id: demo.id, slug: demo.skill.slug });
    return demo;
  }

  // el modelo (cerebro) pone nombre, descripción, disparadores y notas; si falla, se hace sin él
  async function crearSkill(demo) {
    let meta = {};
    if (generarJSON) {
      try {
        const r = await generarJSON({
          modelo: typeof modelo === 'function' ? modelo() : modelo,
          system: 'Conviertes una tarea grabada en el PC (pasos de alto nivel) en una skill reutilizable. Responde en español.',
          prompt: `Nombre propuesto por el usuario: ${demo.nombre || '(ninguno)'}\nPasos grabados:\n${pasosMarkdown(demo.pasos)}\n\n` +
            'Devuelve: nombre (corto, 2-5 palabras), descripcion (qué hace y CUÁNDO usarla, 1-2 frases), disparadores (3-6 frases que diría el usuario) ' +
            'y notas (qué textos tecleados parecen datos variables que habría que preguntar, y precauciones; Markdown breve).',
          schema: { type: 'object', properties: { nombre: { type: 'string' }, descripcion: { type: 'string' }, disparadores: { type: 'array', items: { type: 'string' } }, notas: { type: 'string' } }, required: ['nombre', 'descripcion'] },
        });
        meta = r?.datos || {};
      } catch { meta = {}; }
    }
    const nombre = String(demo.nombre || meta.nombre || `Demostración ${demo.id.slice(0, 10)}`).trim();
    const vent = demo.pasos.find(p => p.tipo === 'ventana');
    const descripcion = String(meta.descripcion || `Repite en el PC una tarea que el usuario enseñó por demostración${vent ? ` (en ${vent.proceso})` : ''}: ${demo.pasos.length} pasos.`).trim();
    const s = await taller.crear({ nombre, descripcion, instrucciones: instrucciones({ nombre, pasos: demo.pasos, notas: meta.notas || '' }),
      disparadores: Array.isArray(meta.disparadores) ? meta.disparadores : [], sesion: demo.sesion });
    return { slug: s.slug, nombre, nivel: s.escaneo?.nivel || null };
  }

  function lista(n = 20) {
    try {
      return fs.readdirSync(dirDemos()).filter(f => f.endsWith('.json')).sort().reverse().slice(0, n).map(f => {
        try { const d = JSON.parse(fs.readFileSync(path.join(dirDemos(), f), 'utf8')); return { id: d.id, nombre: d.nombre, inicio: d.inicio, fin: d.fin, pasos: d.pasos.length, skill: d.skill, errorSkill: d.errorSkill }; } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }
  function leer(id) {
    if (!/^[\w-]+$/.test(String(id || ''))) throw err('demo', 404);
    try { return JSON.parse(fs.readFileSync(path.join(dirDemos(), `${id}.json`), 'utf8')); } catch { throw err('no existe', 404); }
  }

  // API /v1/demo
  async function http(M, p, b = {}) {
    if (!p[2] && M === 'GET') return { ...estado(), demos: lista() };
    if (p[2] === 'grabar' && M === 'POST') return empezar({ nombre: b.nombre, origen: 'panel', confirmo: b.confirmo === true });
    if (p[2] === 'parar' && M === 'POST') return parar({ motivo: 'parada desde el panel', generar: b.generar !== false, nombre: b.nombre });
    if (p[2] && M === 'GET') return leer(p[2]);
    throw err('ruta', 404);
  }

  return { empezar, parar, estado, lista, leer, http, grabando: () => !!actual };
}

module.exports = { crearDemo, agrupar, pasosMarkdown, instrucciones };
