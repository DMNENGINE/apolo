// APOLO Wrapped: tu semana / mes / año con el asistente, con datos reales y en tarjetas verticales 1080x1920 para compartir.
//   datos({periodo, privado}) → números y categorías (por defecto NADA de textos de conversaciones; privado=true añade títulos y proyectos)
//   tarjetas: core/ui/wrapped-tarjetas.js las pinta (panel en iframe, grabación y PNG con el mismo código)
//   PNG por tarjeta (CDP Page.captureScreenshot) y vídeo MP4 (grabación CDP + ffmpeg de turno-video.js), marca de agua "APOLO · open source"
// Datos: <dir>/wrapped/<periodo>-<fecha>/ (video.html, video.mp4, tarjeta-N.png, datos.json)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DIAS = { semana: 7, mes: 30, año: 365, ano: 365 };
const pad = n => String(n).padStart(2, '0');
const diaLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const inicioDia = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const TURNO_MAX = 30 * 60_000;            // un turno del agente cuenta como mucho 30 min (si se quedó colgado no infla las horas)

// categorías de herramientas (lo único que sale en lo compartible)
const CATEGORIAS = [
  ['Terminal', /^shell$/], ['Archivos', /^(leer_archivo|listar|escribir_archivo|editar_archivo)$/], ['Web', /^(web|navegador_.*)$/],
  ['Memoria', /^(recordar|buscar_memoria|olvidar|buscar_historial|explorar_grafo)$/], ['Subagentes', /^delegar$/],
  ['Control del PC', /^(ver_pantalla|tomar_control|soltar_control|clic|escribir|tecla|scroll|arrastrar)$/], ['Skills', /skill/],
  ['Automatizaciones', /^(programar_tarea|ver_tareas|borrar_tarea|turno_.*)$/], ['Consejo', /^consultar_consejo$/], ['Correo', /^correo_/],
];
const categoria = n => (CATEGORIAS.find(([, re]) => re.test(n)) || ['Otras'])[0];
// minutos que te habría llevado hacerlo a mano (estimación conservadora, explicada en la tarjeta)
const MINUTOS = { Terminal: 2, Archivos: 3, Web: 3, Memoria: 0.5, Subagentes: 10, 'Control del PC': 1, Skills: 5, Automatizaciones: 1, Consejo: 0, Correo: 4, Otras: 1 };
const MIN_ENCARGO = 45, MIN_TAREA = 5, MIN_CONSEJO = 15;

function crearWrapped({ cfg, sesiones, tareas, turno, consejo, sueno, memoria, personalidad, historialPermisos }) {
  const dirSes = path.join(cfg.dir, 'sesiones');
  const cache = new Map();
  // mensajes de una sesión, compactos: rol, hora, herramienta, skill (sin textos)
  function compacto(id) {
    const f = path.join(dirSes, `${id}.jsonl`);
    let st; try { st = fs.statSync(f); } catch { return []; }
    const c = cache.get(id); if (c && c.m === st.mtimeMs) return c.l;
    const l = [];
    for (const x of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!x) continue; let m; try { m = JSON.parse(x); } catch { continue; }
      if (m.role === 'user') l.push({ r: 'u', t: m.t || 0 });
      else if (m.role === 'assistant') { l.push({ r: 'a', t: m.t || 0 }); for (const tc of m.toolCalls || []) if (tc.name === 'usar_skill' && tc.args?.nombre) l.push({ r: 's', t: m.t || 0, n: String(tc.args.nombre).slice(0, 40) }); }
      else if (m.role === 'tool') l.push({ r: 't', t: m.t || 0, n: m.name });
    }
    cache.set(id, { m: st.mtimeMs, l });
    return l;
  }

  function rango(periodo, ahora = Date.now()) {
    const n = DIAS[periodo] || 7;
    const hasta = ahora, desde = inicioDia(ahora - (n - 1) * 86400_000);
    return { periodo: DIAS[periodo] ? (periodo === 'ano' ? 'año' : periodo) : 'semana', dias: n, desde, hasta, antes: { desde: desde - n * 86400_000, hasta: desde - 1 } };
  }

  // métricas crudas de un intervalo
  function medir(desde, hasta) {
    const r = { agenteMs: 0, turnos: 0, sesiones: 0, mensajes: 0, herramientas: {}, skills: {}, modelos: {}, horas: Array(24).fill(0), semana: Array(7).fill(0), dias: new Set(), proyectos: {}, titulos: [], maxHerrSesion: 0 };
    for (const s of sesiones.lista()) {
      if (s.canal === 'eval' || (s.actualizada || 0) < desde || (s.creada || 0) > hasta) continue;
      const ms = compacto(s.id);
      let enRango = false, herrS = 0;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i]; if (m.t < desde || m.t > hasta) continue;
        if (m.r === 'u') {
          enRango = true;
          let fin = m.t; for (let j = i + 1; j < ms.length && ms[j].r !== 'u'; j++) fin = Math.max(fin, ms[j].t);
          r.agenteMs += Math.min(TURNO_MAX, Math.max(0, fin - m.t));
          r.turnos++;
          r.modelos[s.modelo] = (r.modelos[s.modelo] || 0) + 1;
          if (!s.tarea && !s.padre) { const d = new Date(m.t); r.horas[d.getHours()]++; r.semana[d.getDay()]++; r.dias.add(diaLocal(m.t)); r.mensajes++; }
        } else if (m.r === 't' && m.n) { r.herramientas[m.n] = (r.herramientas[m.n] || 0) + 1; herrS++; }
        else if (m.r === 's') r.skills[m.n] = (r.skills[m.n] || 0) + 1;
      }
      if (!enRango) continue;
      r.maxHerrSesion = Math.max(r.maxHerrSesion, herrS);
      if (!s.tarea && !s.padre) {
        r.sesiones++;
        r.titulos.push({ titulo: s.titulo, t: s.actualizada, herr: herrS });
        const p = path.basename(s.cwd || ''); if (p && !/^(system32|[a-z]:?)$/i.test(p)) r.proyectos[p] = (r.proyectos[p] || 0) + 1;
      }
    }
    const tl = tareas?.historial ? tareas.historial({ desde, hasta }) : [];
    for (const h of tl) r.dias.add(diaLocal(h.t));
    r.tareas = { total: tl.length, ok: tl.filter(h => h.ok).length, agente: tl.filter(h => h.tipo === 'agente').length };
    const cons = consejo ? consejo.historial(500).filter(c => c.creado >= desde && c.creado <= hasta) : [];
    r.consejos = { total: cons.length, acuerdo: cons.length ? Math.round(cons.reduce((a, c) => a + (c.acuerdo || 0), 0) / cons.length) : 0 };
    let encargos = 0, hechos = 0, noches = 0;
    for (const i of turno ? turno.informes(200) : []) if (i.creado >= desde && i.creado <= hasta) { noches++; encargos += i.encargos || 0; hechos += i.hecho || 0; }
    r.turno = { noches, encargos, hechos };
    const sus = sueno ? sueno.informes(400).filter(s => s.inicio >= desde && s.inicio <= hasta && !s.deshecho) : [];
    r.suenos = { noches: sus.length, fusionados: sus.reduce((a, s) => a + s.fusionados.reduce((b, f) => b + f.borrados.length, 0), 0), patrones: sus.reduce((a, s) => a + s.nuevos.length, 0), frase: (sus.find(s => s.frase) || {}).frase || '' };
    const mem = memoria ? memoria.lista() : [];
    r.recuerdos = { nuevos: mem.filter(m => (m.creada || 0) >= desde && (m.creada || 0) <= hasta).length, total: mem.length };
    const perm = historialPermisos ? historialPermisos.lista().filter(p => p.t >= desde && p.t <= hasta) : [];
    r.permisos = { total: perm.length, permitidos: perm.filter(p => p.decision !== 'deny').length, mediaEspera: perm.length ? Math.round(perm.reduce((a, p) => a + (p.espera || 0), 0) / perm.length / 1000) : 0 };
    return r;
  }

  function rachas(dias, desde, hasta) {
    let mejor = 0, act = 0;
    for (let t = inicioDia(desde); t <= hasta; t += 86400_000) {
      if (dias.has(diaLocal(t + 3600_000))) { act++; mejor = Math.max(mejor, act); } else act = 0;   // +1 h por los cambios de horario
    }
    let t = hasta, actual = 0;
    if (!dias.has(diaLocal(t))) t -= 86400_000;               // si hoy aún no, la racha sigue viva desde ayer
    while (dias.has(diaLocal(t))) { actual++; t -= 86400_000; }
    return { mejor: Math.max(mejor, actual), actual };
  }

  function personaje(horas) {
    const franjas = [['Búho nocturno', 'búho', [0, 1, 2, 3, 4, 5]], ['Madrugador', 'madrugador', [6, 7, 8, 9]], ['Máquina de mediodía', 'mediodia', [10, 11, 12, 13, 14]], ['Guerrero de la tarde', 'tarde', [15, 16, 17, 18, 19]], ['Turno de noche', 'noche', [20, 21, 22, 23]]];
    const suma = franjas.map(([n, k, hs]) => [n, k, hs.reduce((a, h) => a + horas[h], 0)]);
    const mejor = suma.sort((a, b) => b[2] - a[2])[0];
    const pico = horas.indexOf(Math.max(...horas));
    return { nombre: mejor[0], clave: mejor[1], pico };
  }

  function logros(m, extra) {
    const l = [];
    const add = (puntos, titulo, texto, icono) => l.push({ puntos, titulo, texto, icono });
    if (extra.racha.mejor >= 3) add(extra.racha.mejor * 3, `Racha de ${extra.racha.mejor} días`, `${extra.racha.mejor} días seguidos trabajando juntos. Imparable.`, 'fuego');
    if (m.turno.hechos) add(m.turno.hechos * 8, 'Trabajo mientras duermes', `${m.turno.hechos} encargo${m.turno.hechos === 1 ? '' : 's'} terminado${m.turno.hechos === 1 ? '' : 's'} de noche, sin que movieras un dedo.`, 'luna');
    if (m.maxHerrSesion >= 15) add(m.maxHerrSesion, 'Sesión maratón', `Una sola conversación con ${m.maxHerrSesion} herramientas encadenadas.`, 'rayo');
    if (Object.keys(m.modelos).length >= 3) add(Object.keys(m.modelos).length * 4, 'Políglota de IAs', `Trabajaste con ${Object.keys(m.modelos).length} modelos distintos. Ninguno es tu jefe.`, 'chispa');
    if (m.consejos.total) add(m.consejos.total * 6, 'Convocaste al consejo', `${m.consejos.total} debate${m.consejos.total === 1 ? '' : 's'} entre IAs con ${m.consejos.acuerdo}% de acuerdo medio.`, 'persona');
    if (m.suenos.patrones) add(m.suenos.patrones * 5, 'Memoria que sueña', `Mientras dormías descubrí ${m.suenos.patrones} patrón${m.suenos.patrones === 1 ? '' : 'es'} nuevo${m.suenos.patrones === 1 ? '' : 's'} sobre ti.`, 'cerebro');
    if (m.tareas.total >= 5) add(m.tareas.total * 1.5, 'Piloto automático', `${m.tareas.total} automatizaciones ejecutadas solas.`, 'reloj');
    if (extra.ahorroMin >= 60) add(extra.ahorroMin / 15, `${Math.round(extra.ahorroMin / 60)} h devueltas`, `Te ahorré unas ${Math.round(extra.ahorroMin / 60)} horas de trabajo manual.`, 'reloj');
    if (!l.length) add(1, 'Primeros pasos', 'Esto acaba de empezar. La próxima tarjeta será más grande.', 'robot');
    return l.sort((a, b) => b.puntos - a.puntos);
  }

  function datos({ periodo = 'semana', privado = false, ahora = Date.now() } = {}) {
    const R = rango(periodo, ahora);
    const m = medir(R.desde, R.hasta), prev = medir(R.antes.desde, R.antes.hasta);
    const herr = Object.entries(m.herramientas);
    const cats = {}; for (const [n, c] of herr) { const k = categoria(n); cats[k] = (cats[k] || 0) + c; }
    const totalHerr = herr.reduce((a, [, c]) => a + c, 0);
    // horas ahorradas: herramientas por categoría × minutos + encargos nocturnos + automatizaciones + consejos
    const ahorro = Object.entries(cats).map(([k, c]) => ({ concepto: k, cantidad: c, minUnidad: MINUTOS[k] ?? 1, min: c * (MINUTOS[k] ?? 1) })).filter(x => x.min > 0);
    if (m.turno.hechos) ahorro.push({ concepto: 'Encargos nocturnos', cantidad: m.turno.hechos, minUnidad: MIN_ENCARGO, min: m.turno.hechos * MIN_ENCARGO });
    if (m.tareas.agente) ahorro.push({ concepto: 'Automatizaciones con agente', cantidad: m.tareas.agente, minUnidad: MIN_TAREA, min: m.tareas.agente * MIN_TAREA });
    if (m.consejos.total) ahorro.push({ concepto: 'Consejos de modelos', cantidad: m.consejos.total, minUnidad: MIN_CONSEJO, min: m.consejos.total * MIN_CONSEJO });
    ahorro.sort((a, b) => b.min - a.min);
    const ahorroMin = Math.round(ahorro.reduce((a, x) => a + x.min, 0));
    const modelos = Object.entries(m.modelos).sort((a, b) => b[1] - a[1]);
    const totalTurnos = modelos.reduce((a, [, c]) => a + c, 0);
    const racha = rachas(m.dias, R.desde, R.hasta);
    const calendario = []; for (let t = R.desde; t <= R.hasta; t += 86400_000) { const d = diaLocal(t + 3600_000); if (!calendario.find(x => x.d === d)) calendario.push({ d, on: m.dias.has(d) }); }
    const pj = personaje(m.horas);
    const ls = logros(m, { racha, ahorroMin });
    const var_ = (a, b) => (b ? Math.round((a - b) / b * 100) : null);
    const nombreModelo = id => String(id || '').split('/').slice(1).join('/') || String(id || '');
    const r = {
      version: 1, generado: Date.now(), periodo: R.periodo, dias: R.dias, desde: R.desde, hasta: R.hasta, nombre: personalidad?.nombre?.() || 'APOLO', privado: !!privado, idioma: cfg.idioma || 'es',
      horasAgente: +(m.agenteMs / 3600_000).toFixed(1), minutosAgente: Math.round(m.agenteMs / 60_000), turnos: m.turnos, sesiones: m.sesiones, mensajes: m.mensajes,
      vsAnterior: { horasAgente: var_(m.agenteMs, prev.agenteMs), sesiones: var_(m.sesiones, prev.sesiones), herramientas: var_(totalHerr, Object.values(prev.herramientas).reduce((a, c) => a + c, 0)) },
      modeloFavorito: modelos[0] ? { id: modelos[0][0], nombre: nombreModelo(modelos[0][0]), proveedor: String(modelos[0][0]).split('/')[0], pct: Math.round(modelos[0][1] / totalTurnos * 100), turnos: modelos[0][1] } : null,
      modelos: modelos.slice(0, 5).map(([id, c]) => ({ id, nombre: nombreModelo(id), proveedor: String(id).split('/')[0], turnos: c, pct: Math.round(c / totalTurnos * 100) })),
      herramientas: { total: totalHerr, categorias: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ nombre: k, usos: c, pct: Math.round(c / totalHerr * 100) })),
        top: herr.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => ({ nombre: n, categoria: categoria(n), usos: c })) },
      skills: Object.entries(m.skills).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => ({ nombre: n, usos: c })),
      racha, diasActivos: m.dias.size, calendario,
      ritmo: { horas: m.horas, semana: m.semana, personaje: pj.nombre, clave: pj.clave, horaPico: pj.pico, diaFavorito: m.semana.indexOf(Math.max(...m.semana)) },
      tareas: m.tareas, consejos: m.consejos, turno: m.turno,
      sueno: { noches: m.suenos.noches, fusionados: m.suenos.fusionados, patrones: m.suenos.patrones, frase: privado ? m.suenos.frase : '' },
      recuerdos: m.recuerdos, permisos: m.permisos,
      ahorro: { minutos: ahorroMin, horas: +(ahorroMin / 60).toFixed(1), desglose: ahorro.slice(0, 8),
        explicacion: 'Estimación conservadora: cada acción del agente cuenta los minutos que te habría llevado a mano (terminal 2 min, archivo 3 min, búsqueda web 3 min, subagente 10 min, skill 5 min…), cada encargo nocturno terminado 45 min, cada automatización con agente 5 min y cada consejo de modelos 15 min.' },
      logro: ls[0], logros: ls.slice(0, 4),
    };
    if (!r.sueno.frase && m.suenos.noches) r.sueno.frase = `Esta noche aprendí ${m.suenos.patrones || 'algo'} cosa${m.suenos.patrones === 1 ? '' : 's'} nueva${m.suenos.patrones === 1 ? '' : 's'} sobre ti y ordené ${m.suenos.fusionados} recuerdo${m.suenos.fusionados === 1 ? '' : 's'}.`;
    if (privado) {
      r.privadoDatos = { titulos: m.titulos.sort((a, b) => b.herr - a.herr).slice(0, 5).map(x => x.titulo), proyectos: Object.entries(m.proyectos).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => ({ nombre: n, sesiones: c })) };
    }
    return r;
  }

  // ---------- archivos: página de las tarjetas, PNG y vídeo ----------
  const base = path.join(cfg.dir, 'wrapped');
  const dirDe = (periodo, privado) => path.join(base, `${periodo === 'ano' ? 'año' : periodo}-${diaLocal(Date.now())}${privado ? '-privado' : ''}`);
  function pagina(d, opciones = {}) {
    const json = JSON.stringify({ ...d, acento: opciones.acento || '#2bdc7c' }).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${d.nombre} Wrapped</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body>
<script type="application/json" id="datos">${json}</script>
<script src="/ui/i18n.js"></script><script src="/ui/wrapped-tarjetas.js"></script></body></html>`;
  }
  function preparar({ periodo = 'semana', privado = false, acento } = {}) {
    const d = datos({ periodo, privado });
    const dir = dirDe(d.periodo, privado); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'datos.json'), JSON.stringify(d, null, 2));
    fs.writeFileSync(path.join(dir, 'video.html'), pagina(d, { acento }));
    // limpia carpetas de más de 40 días
    try { for (const x of fs.readdirSync(base)) { const p = path.join(base, x); if (Date.now() - fs.statSync(p).mtimeMs > 40 * 86400_000) fs.rmSync(p, { recursive: true, force: true }); } } catch { }
    return { d, dir };
  }

  // PNG de una o todas las tarjetas (navegador headless por CDP, 1080x1920)
  async function png({ periodo, privado, acento, carta = null, opciones = {} } = {}) {
    const v = require('./turno-video');
    const { d, dir } = preparar({ periodo, privado, acento });
    const nav = v.buscarNavegador(opciones.navegador);
    if (!nav) throw new Error('no encontré Chrome/Edge para hacer las imágenes');
    const srv = await v.servidor(dir);
    const ses = await abrirCDP(nav, 1080, 1920);
    try {
      await ses.cdp('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/video.html#quieto` });
      await ses.esperar('window.listo === true', 20_000);
      const n = await ses.evaluar('window.WR.total');
      const cartas = carta === null || carta === undefined ? [...Array(n).keys()] : [Math.max(0, Math.min(n - 1, +carta))];
      const archivos = [];
      for (const i of cartas) {
        await ses.evaluar(`window.WR.ir(${i}, true)`);
        await new Promise(ok => setTimeout(ok, 900));          // que el robot 3D pinte su pose
        const r = await ses.cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
        const f = path.join(dir, `tarjeta-${pad(i + 1)}.png`);
        fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
        archivos.push(f);
      }
      return { dir, archivos, datos: d };
    } finally { ses.cerrar(); srv.close(); }
  }

  // vídeo MP4 vertical (reutiliza la grabación de turno-video: window.listo / empezar / terminado)
  async function video({ periodo, privado, acento, opciones = {} } = {}) {
    const v = require('./turno-video');
    const { d, dir } = preparar({ periodo, privado, acento });
    const nav = v.buscarNavegador(opciones.navegador);
    if (!nav) return { html: path.join(dir, 'video.html'), motivo: 'no encontré Chrome/Edge para grabar' };
    if (!(await v.hayFfmpeg(opciones.ffmpeg))) return { html: path.join(dir, 'video.html'), motivo: 'ffmpeg no está en el PATH' };
    const t0 = Date.now();
    const r = await v.grabar({ dir, segundos: 75, navegador: nav, ffmpeg: opciones.ffmpeg, ancho: opciones.ancho || 1080, alto: opciones.alto || 1920 });
    const final = path.join(dir, `apolo-wrapped-${d.periodo}.mp4`);
    fs.renameSync(r.mp4, final);
    return { mp4: final, segundos: r.segundos, frames: r.frames, ms: Date.now() - t0, dir, datos: d };
  }
  function ultimoVideo(periodo, privado) { const f = path.join(dirDe(periodo, privado), `apolo-wrapped-${periodo === 'ano' ? 'año' : periodo}.mp4`); return fs.existsSync(f) ? f : null; }

  // API /v1/wrapped (daemon → extensiones)
  const enCurso = new Map();
  async function http(M, p, b = {}, q = {}) {
    const periodo = DIAS[q.periodo || b.periodo] ? (q.periodo || b.periodo) : 'semana';
    const privado = String(q.privado ?? b.privado ?? '') === 'true' || b.privado === true;
    if (M === 'GET' && !p[2]) return datos({ periodo, privado });
    if (p[2] === 'video') {
      if (M === 'GET') { const f = ultimoVideo(periodo, privado); if (!f) throw Object.assign(new Error('aún no hay vídeo: genéralo con POST'), { status: 404 }); return { __archivo: f, nombre: path.basename(f) }; }
      if (M === 'POST') {
        const k = `${periodo}-${privado}`;
        if (!enCurso.has(k)) enCurso.set(k, video({ periodo, privado, acento: b.acento }).finally(() => enCurso.delete(k)));
        const r = await enCurso.get(k);
        return { ok: !!r.mp4, motivo: r.motivo, segundos: r.segundos, ms: r.ms, url: r.mp4 ? `/v1/wrapped/video?periodo=${encodeURIComponent(periodo)}&privado=${privado}` : null };
      }
    }
    if (p[2] === 'png' && (M === 'POST' || M === 'GET')) {
      const carta = q.carta ?? b.carta;
      const r = await png({ periodo, privado, acento: b.acento, carta: carta === undefined || carta === '' || carta === 'todas' ? null : +carta });
      if (r.archivos.length === 1) return { __archivo: r.archivos[0], nombre: `apolo-wrapped-${r.datos.periodo}-${path.basename(r.archivos[0])}` };
      const { crearZip } = require('./privacidad');
      const zip = path.join(r.dir, `apolo-wrapped-${r.datos.periodo}-tarjetas.zip`);
      fs.writeFileSync(zip, crearZip(r.archivos.map(f => ({ nombre: path.basename(f), datos: fs.readFileSync(f) }))));
      return { __archivo: zip, nombre: path.basename(zip) };
    }
    throw Object.assign(new Error('ruta'), { status: 404 });
  }
  return { datos, medir, preparar, png, video, http, pagina, categoria };
}

// sesión CDP mínima con un navegador headless propio
async function abrirCDP(navegador, ancho, alto) {
  const puerto = 9100 + Math.floor(Math.random() * 380);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-wr-'));
  const nav = spawn(navegador, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, `--window-size=${ancho},${alto}`, '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  const dormir = ms => new Promise(ok => setTimeout(ok, ms));
  let pag; for (let i = 0; i < 60 && !pag; i++) { await dormir(250); try { pag = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find(x => x.type === 'page'); } catch { } }
  if (!pag) { try { nav.kill(); } catch { } throw new Error('el navegador headless no arrancó'); }
  const ws = new WebSocket(pag.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('CDP no conecta')); });
  let n = 0; const esp = new Map();
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && esp.has(j.id)) { esp.get(j.id)(j); esp.delete(j.id); } };
  const cdp = (method, params = {}) => new Promise(ok => { const id = ++n; esp.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
  const evaluar = async expr => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const esperar = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluar(expr)) return true; await dormir(200); } throw new Error(`la página no respondió (${expr})`); };
  return { cdp, evaluar, esperar, cerrar() { try { ws.close(); } catch { } try { nav.kill(); } catch { } setTimeout(() => { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { } }, 800).unref?.(); } };
}

module.exports = { crearWrapped, categoria, MINUTOS, abrirCDP };
