const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { destino, transporte, error } = require('./trading');
const { escribirAtomico } = require('./persistencia');
function validarInicio(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['agentes', 'capital', 'meta', 'mercados', 'hasta', 'modo', 'duracionMin', 'perdidaMaxPct'].includes(k))) throw error('Parametros de trading desconocidos');
  if (b.modo !== 'simulado') throw error('Solo se admite el autopiloto simulado');
  const x = { ...b, mercados: [...(Array.isArray(b.mercados) ? b.mercados : [])] };
  for (const [k, min, max, entero] of [['agentes', 1, 2000, true], ['capital', 0.01, 1000000], ['meta', 0.01, 100000000], ['duracionMin', 1, 1440, true], ['perdidaMaxPct', 0.1, 100]]) if (!Number.isFinite(x[k]) || x[k] < min || x[k] > max || (entero && !Number.isInteger(x[k]))) throw error('Limite invalido: ' + k);
  if (!x.mercados.length || x.mercados.length > 2 || new Set(x.mercados).size !== x.mercados.length || x.mercados.some(m => !['cripto', 'acciones'].includes(m))) throw error('Mercados invalidos');
  if (x.hasta != null && (typeof x.hasta !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.hasta))) throw error('Horario invalido (HH:mm)');
  x.hasta = x.hasta || null; return x;
}
function crearTrading({ nucleo: n, fetch: fetchPrueba, intervaloMs = 5000, ahora = Date.now }) {
  const f = path.join(n.cfg.dir, 'trading-autopiloto.json');
  let estado = { estado: 'parado', modo: 'simulado' }, ocupado = false, supervisor = false, epoca = 0, parada, observadoActivo = false, capacidadCentral = false;
  try { const x = JSON.parse(fs.readFileSync(f, 'utf8')); if (x.estado && x.modo === 'simulado') estado = x; } catch {}
  const guardar = () => escribirAtomico(f, JSON.stringify(estado, null, 2));
  const auditar = (decision, resultado, resumen) => n.auditoria?.registrar({ tipo: 'trading', herramienta: 'trading', quien: 'panel/autopiloto', decision, resultado, resumen });
  const publico = () => ({ ...JSON.parse(JSON.stringify(estado)), centralActiva: observadoActivo, capacidadCentral, contrato: 'apolo-trading/1' });
  const central = () => destino(n.cfg.dir, { boveda: n.cfg.boveda });
  const llamada = transporte(n, fetchPrueba);
  const local = mapa => { const nodo = mapa.nodos.find(x => x.local); if (!nodo || typeof nodo.kpis.activo !== 'boolean') throw error('La central no identifica su nodo local y estado activo', 502); return nodo; };
  const capital = nodo => nodo.agentes.reduce((s, a) => { if (!Number.isFinite(a.equity) || a.equity < 0) throw error('Capital de agente no verificable', 502); return s + a.equity; }, 0);
  const mismoPlan = (nodo, p) => nodo.kpis.capital === p.capital && nodo.kpis.meta === p.meta && ((nodo.kpis.hasta_solicitado !== undefined ? nodo.kpis.hasta_solicitado : nodo.kpis.hasta) || null) === p.hasta && Array.isArray(nodo.kpis.mercados) && JSON.stringify([...nodo.kpis.mercados].sort()) === JSON.stringify([...p.mercados].sort());
  const soportaGuardia = mapa => mapa.modo === 'simulado' && Array.isArray(mapa.capacidades) && mapa.capacidades.includes('dmn-guardia/1');
  function destinoActual() {
    const d = central();
    // No enviar el token de una central nueva a la URL de una ejecucion antigua.
    if (estado.central && d.url !== estado.central) throw error('Cambio la central: parada anterior no confirmada', 409);
    return d;
  }
  function parar(motivo = 'usuario') {
    epoca++;
    for (const p of n.permisos.pendientes?.() || []) if (p.origen === 'trading') n.permisos.resolver?.(p.id, 'deny', 'Trading detenido', 'parada');
    if (parada) return parada;
    parada = (async () => {
      estado = { ...estado, estado: 'parando', motivo, actualizada: ahora(), confirmada: false }; guardar();
      try {
        const d = destinoActual(); await llamada('POST', 'parar', null, d);
        const mapa = await llamada('GET', 'mapa', null, d), nodo = local(mapa);
        if (nodo.kpis.activo) throw error('La central sigue activa; parada no confirmada', 502);
        if (soportaGuardia(mapa) && nodo.kpis.parada_confirmada !== true) throw error('Hay posiciones pendientes en la central; parada no confirmada', 502);
        observadoActivo = false; estado.estado = 'parado'; estado.confirmada = true; estado.actualizada = ahora(); guardar(); auditar('parar', 'ok', motivo); return publico();
      } catch (e) { estado.estado = 'parada_no_confirmada'; estado.confirmada = false; guardar(); auditar('parar', 'desconocido', motivo); throw e; }
    })().finally(() => { parada = null; });
    return parada;
  }
  async function iniciar(b) {
    const parametros = validarInicio(b);
    if (ocupado || supervisor || parada || ['activo', 'iniciando', 'parando', 'incierto', 'parada_no_confirmada'].includes(estado.estado)) throw error('Hay una ejecucion o efecto pendiente; para y verifica antes de iniciar', 409);
    if (n.panico?.activo()) throw error('Panico activo: no se puede iniciar trading', 403);
    ocupado = true; const turno = epoca;
    try {
      const d = central(), huella = crypto.createHash('sha256').update(JSON.stringify([d.url, parametros])).digest('hex');
      const permiso = await n.permisos.pedirExterno({ origen: 'trading', peligro: 'Autopiloto de trading simulado', resumen: `AUTOPILOTO SIMULADO en ${d.url}: ${JSON.stringify(parametros)}. Solo el nodo local de esa central; no dinero real.`, esperaMs: 300000 });
      if (!permiso.ok) throw error('Autopiloto no autorizado', 403);
      const comprobar = () => { if (epoca !== turno || n.panico?.activo() || central().url !== d.url || central().token !== d.token) throw error('La autoridad o central cambio durante el arranque', 409); };
      comprobar();
      const previo = await llamada('GET', 'mapa', null, d); const nodo = local(previo);
      if (!soportaGuardia(previo)) throw error('Actualiza la central: requiere modo simulado y guardia persistente dmn-guardia/1', 409);
      if (nodo.kpis.activo) throw error('El enjambre ya esta activo; detenlo antes de cambiar su configuracion', 409);
      comprobar();
      estado = { estado: 'iniciando', modo: 'simulado', central: d.url, parametros, huella, inicio: ahora(), vence: ahora() + parametros.duracionMin * 60000, confirmada: false }; guardar();
      try {
        await llamada('POST', 'iniciar', parametros, d); comprobar();
        const mapa = await llamada('GET', 'mapa', null, d), actual = local(mapa), g = mapa.guardia; comprobar();
        if (!actual.kpis.activo || actual.agentes.length !== parametros.agentes || !mismoPlan(actual, parametros)) throw error('La central no confirma el plan y numero de agentes autorizados', 502);
        if (!soportaGuardia(mapa) || g?.estado !== 'activo' || typeof g.sesion !== 'string' || !g.sesion || !Number.isFinite(g.vence) || g.vence * 1000 <= ahora() || g.vence * 1000 > ahora() + parametros.duracionMin * 60000 + 60000 || g.perdidaMaxPct !== parametros.perdidaMaxPct || g.capitalInicial !== parametros.agentes * parametros.capital) throw error('La central no confirma los limites persistentes autorizados', 502);
        estado.sesionCentral = g.sesion;
        estado.capitalInicial = parametros.capital * parametros.agentes;
        if (capital(actual) <= estado.capitalInicial * (1 - parametros.perdidaMaxPct / 100)) throw error('El enjambre ya alcanzo el limite de perdida', 502);
        observadoActivo = true; estado.estado = 'activo'; estado.confirmada = true; guardar(); auditar('iniciar', 'ok', 'Autopiloto simulado autorizado ' + huella); return publico();
      } catch (e) {
        if (e.code === 'CIERRES_PENDIENTES') { estado.estado = 'esperando_cierres'; estado.motivo = 'cierres pendientes del mercado'; estado.confirmada = false; guardar(); auditar('iniciar', 'pendiente', 'Capital conservado; no se envia otra parada'); throw e; }
        estado.estado = 'incierto'; guardar(); auditar('iniciar', 'desconocido', 'No se repite automaticamente el arranque'); try { await parar('arranque incierto'); } catch {} throw e;
      }
    } finally { ocupado = false; }
  }
  async function vigilar() {
    if (supervisor || ocupado || parada || !['activo', 'iniciando', 'incierto', 'parada_no_confirmada', 'parando'].includes(estado.estado)) return;
    supervisor = true;
    try {
      if (n.panico?.activo() || estado.estado !== 'activo' || ahora() >= estado.vence) return await parar(n.panico?.activo() ? 'panico' : estado.estado !== 'activo' ? 'recuperacion' : 'duracion maxima');
      const mapa = await llamada('GET', 'mapa', null, destinoActual()), nodo = local(mapa);
      if (!nodo.kpis.activo) { observadoActivo = false; estado.estado = 'parado'; estado.confirmada = true; guardar(); return; }
      if (!soportaGuardia(mapa) || mapa.guardia?.sesion !== estado.sesionCentral || mapa.guardia?.estado !== 'activo' || nodo.agentes.length !== estado.parametros.agentes || !mismoPlan(nodo, estado.parametros) || capital(nodo) <= estado.capitalInicial * (1 - estado.parametros.perdidaMaxPct / 100)) await parar('limite de perdida o cambio del enjambre');
    } catch { if (estado.estado === 'activo') { try { await parar('supervision no disponible'); } catch {} } }
    finally { supervisor = false; }
  }
  // ---------- piloto con DINERO REAL (lo ejecuta el motor; aquí solo se autoriza, se limita y se pausa) ----------
  // Pausar no pide nada. Activar o cambiar límites: límites válidos + frase de confirmación + sin pánico + aprobación
  // explícita del usuario (pedirExterno: isla/móvil/Discord, nunca automática) + comprobación de lo aplicado + auditoría.
  let realVisto = false;                                        // ¿se ha visto el piloto real activo? (para el pánico)
  async function realEstado() {
    const r = await llamada('GET', 'piloto', null, null, {}), c = r.cfg; realVisto = c.activo;
    return { activo: c.activo, limites: { por_op_sol: c.por_op_sol, perdida_max_sol: c.perdida_max_sol, max_ops_dia: c.max_ops_dia, reserva_sol: c.reserva_sol },
      orden: r.orden || null, motivo: r.motivo || null, aviso: r.error || null, saldo: r.saldo ?? null, saldoInicio: r.saldo_inicio ?? null,
      ops: (r.ops || []).slice(-20), log: (r.log || []).slice(-30), errorCfg: c.error_cfg || null, panico: !!n.panico?.activo() };
  }
  async function realPausar(motivo) {
    await llamada('POST', 'piloto/config', { activo: false });
    const r = await realEstado(); if (r.activo) throw error('El motor no confirma la pausa del piloto real', 502);
    auditar('real-pausar', 'ok', `Piloto real en pausa (${motivo})`); return r;
  }
  async function realConfig(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw error('Parametros del piloto real invalidos');
    if (b.activo === false) return realPausar('usuario');
    if (b.activo !== true) throw error('activo debe ser true o false');
    if (b.confirmacion !== 'ACTIVO DINERO REAL') throw error('Escribe exactamente "ACTIVO DINERO REAL" para confirmar', 400);
    if (n.panico?.activo()) throw error('Panico activo: no se puede activar dinero real', 403);
    const l = b.limites || {};
    for (const [k, min, max, entero] of [['por_op_sol', 0.005, 0.1], ['perdida_max_sol', 0.001, 10], ['max_ops_dia', 1, 50, true], ['reserva_sol', 0, 1]])
      if (typeof l[k] !== 'number' || !Number.isFinite(l[k]) || l[k] < min || l[k] > max || (entero && !Number.isInteger(l[k]))) throw error(`${k} debe estar entre ${min} y ${max}`);
    const limites = { por_op_sol: l.por_op_sol, perdida_max_sol: l.perdida_max_sol, max_ops_dia: l.max_ops_dia, reserva_sol: l.reserva_sol };
    const permiso = await n.permisos.pedirExterno({ origen: 'trading', peligro: 'DINERO REAL', resumen: `ACTIVAR EL PILOTO CON DINERO REAL (GMGN): ${limites.por_op_sol} SOL por operación, pérdida máxima ${limites.perdida_max_sol} SOL (se apaga solo), ${limites.max_ops_dia} operaciones/día, reserva ${limites.reserva_sol} SOL. Puedes perder ese dinero.`, esperaMs: 5 * 60_000 });
    if (!permiso.ok) { auditar('real-activar', 'denegado', 'Activación del piloto real no autorizada'); throw error('Activacion del piloto real no autorizada', 403); }
    if (n.panico?.activo()) throw error('Panico activo: no se puede activar dinero real', 403);
    await llamada('POST', 'piloto/config', { ...limites, activo: true });
    const r = await realEstado();
    if (!r.activo || Object.keys(limites).some(k => r.limites[k] !== limites[k])) { await realPausar('limites no confirmados').catch(() => { }); throw error('El motor no aplicó exactamente esos límites: piloto real en pausa', 502); }
    auditar('real-activar', 'ok', `Piloto real activo: ${JSON.stringify(limites)}`); return r;
  }
  const panico = () => {
    epoca++; if (observadoActivo || ['activo', 'iniciando', 'incierto', 'parando', 'parada_no_confirmada'].includes(estado.estado)) parar('panico').catch(() => {});
    // el pánico también pausa el dinero real (la gestión de lo abierto sigue): si el motor del paquete corre aquí o se vio activo
    let paquete = false; try { paquete = !!central().paquete; } catch { }
    if (realVisto || paquete) realPausar('panico').catch(() => {});
  };
  n.bus.on('panico', panico);
  const timer = setInterval(() => vigilar(), intervaloMs); timer.unref?.();
  return { iniciar, parar, vigilar, estado: publico, realEstado, realConfig, realPausar, cerrar: () => { clearInterval(timer); n.bus.removeListener('panico', panico); },
    async http(M, p, b, q = {}) {
      const ruta = p.slice(2).join('/') || 'mapa';
      if (ruta === 'autopiloto' && M === 'GET') return publico();
      if (ruta === 'iniciar' && M === 'POST') return iniciar(b);
      if (ruta === 'parar' && M === 'POST') return parar();
      if (ruta === 'real' && M === 'GET') return realEstado();
      if (ruta === 'real' && M === 'POST') return realConfig(b);
      if (ruta.startsWith('piloto')) throw error('El piloto real se maneja con /v1/trading/real', 404);
      if (M !== 'GET') throw error('Ruta de trading no permitida', 404);
      const r = await llamada(M, ruta, null, null, q);
      if (ruta === 'mapa') { observadoActivo = !!r.nodos.find(x => x.local)?.kpis.activo; capacidadCentral = soportaGuardia(r); r._autopiloto = publico(); }
      return r;
    } };
}
module.exports = { crearTrading, validarInicio };
