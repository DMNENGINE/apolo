// Subagentes + registro de "quién está haciendo qué" (lo que pinta el Mission Control del panel).
// - lanzar(): crea una sesión hija (padre = sesión que delega) y la hace trabajar en una subtarea; devuelve su informe.
//   Varias llamadas a "delegar" en la misma respuesta corren en paralelo (lo hace el agente). Los hijos no pueden delegar.
// - Registro: sigue TODAS las sesiones que trabajan (principales y subagentes) a partir de los eventos del bus.
// cfg.subagentes = { max: subagentes a la vez por sesión }

const INSTRUCCION = tarea => [
  'Eres un SUBAGENTE: el agente principal te encarga una subtarea concreta. El usuario no lee esta conversación.',
  'Trabaja de forma autónoma con tus herramientas, sin hacer preguntas: si te falta algo, decide lo razonable y dilo en el informe.',
  'Termina con un INFORME FINAL claro y conciso (es lo único que verá el agente principal): qué hiciste, qué encontraste y datos concretos.',
  '', 'TAREA:', tarea,
].join('\n');

function crearSubagentes({ cfg, bus, sesiones, proveedores, enviar, cancelar }) {
  const runs = new Map();                                  // sesion.id -> estado visible
  const max = () => cfg.subagentes?.max || 4;
  const publico = r => ({ ...r });
  let pendienteEmitir = new Set(), timer = null;
  const emitir = r => {                                    // agrupa: como mucho ~4 avisos por segundo
    pendienteEmitir.add(r.id);
    if (!timer) timer = setTimeout(() => { timer = null; for (const id of pendienteEmitir) { const x = runs.get(id); if (x) bus.emit('agente', publico(x)); } pendienteEmitir = new Set(); }, 250);
  };

  function registro(s) {
    let r = runs.get(s.id);
    if (!r) {
      r = { id: s.id, padre: s.padre || null, nombre: s.nombreAgente || s.titulo, modelo: s.modelo, canal: s.canal, tarea: s.tarea ? true : undefined,
        estado: 'quieto', inicio: 0, fin: 0, pasos: 0, herramienta: null, ultimo: '', uso: { entrada: 0, salida: 0 } };
      runs.set(s.id, r);
    }
    return r;
  }

  bus.on('evento', e => {
    const s = sesiones.obtener(e.sesion); if (!s) return;
    const r = registro(s);
    if (e.tipo === 'inicio') Object.assign(r, { estado: 'trabajando', inicio: Date.now(), fin: 0, pasos: 0, herramienta: null, error: undefined, modelo: s.modelo, nombre: s.nombreAgente || s.titulo });
    else if (e.tipo === 'herramienta') { r.pasos++; r.herramienta = { nombre: e.nombre, resumen: String(e.resumen || '').slice(0, 160), desde: Date.now() }; }
    else if (e.tipo === 'resultado') r.herramienta = null;
    else if (e.tipo === 'texto') r.ultimo = String(e.texto).slice(0, 300);
    else if (e.tipo === 'compactacion') r.compactada = (r.compactada || 0) + 1;
    else if (e.tipo === 'fin') Object.assign(r, { estado: 'listo', fin: Date.now(), herramienta: null, uso: { ...e.uso }, ultimo: String(e.texto || r.ultimo).slice(0, 300) });
    else if (e.tipo === 'error') Object.assign(r, { estado: /cancelad/i.test(e.error) ? 'cancelado' : 'error', fin: Date.now(), herramienta: null, error: e.error });
    else return;
    emitir(r);
  });
  bus.on('permiso', p => { const r = p.sesion && runs.get(p.sesion); if (r) { r.esperando = p.id; emitir(r); } });
  bus.on('permiso-resuelto', p => { for (const r of runs.values()) if (r.esperando === p.id) { r.esperando = undefined; emitir(r); } });

  async function lanzar({ padre, tarea, nombre, modelo, signal }) {
    tarea = String(tarea || '').trim();
    if (!tarea) throw new Error('falta la tarea');
    if (padre.padre) throw new Error('un subagente no puede delegar');
    const activos = [...runs.values()].filter(r => r.padre === padre.id && r.estado === 'trabajando').length;
    if (activos >= max()) throw new Error(`ya hay ${activos} subagentes trabajando (máximo ${max()})`);
    const m = modelo ? (cfg.alias[String(modelo).toLowerCase()] || String(modelo)) : padre.modelo;
    proveedores.resolver(m);                               // lanza si el modelo no existe
    nombre = String(nombre || tarea).replace(/\s+/g, ' ').trim().slice(0, 40);
    const s = sesiones.crear({ modelo: m, cwd: padre.cwd, canal: 'subagente', titulo: `⤷ ${nombre}`, padre: padre.id, nombreAgente: nombre });
    registro(s);
    const parar = () => cancelar(s.id);
    signal?.addEventListener('abort', parar, { once: true });
    try { return { ok: true, sesion: s.id, nombre, texto: await enviar(s, INSTRUCCION(tarea)) }; }
    catch (e) { return { ok: false, sesion: s.id, nombre, texto: e.message }; }
    finally { signal?.removeEventListener('abort', parar); }
  }

  // lo que pinta el Mission Control: lo que trabaja ahora + lo terminado en las últimas 6 h (máx. 60)
  function lista() {
    const desde = Date.now() - 6 * 3600_000;
    return [...runs.values()].filter(r => r.estado === 'trabajando' || r.fin > desde)
      .sort((a, b) => (b.estado === 'trabajando') - (a.estado === 'trabajando') || (b.inicio - a.inicio)).slice(0, 60).map(publico);
  }

  return { lanzar, lista };
}

module.exports = { crearSubagentes };
