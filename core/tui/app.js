// CLI interactiva estilo Claude Code: lo ya dicho queda en el historial de la terminal y abajo hay una zona viva
// (herramientas en curso, spinner, caja de texto, menús y permisos) que se redibuja en su sitio. Sin dependencias.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawn } = require('child_process');
const { c, ancho, cortar, rellenar, ajustar, anchoCar, quitarAnsi } = require('./texto');
const { renderMarkdown } = require('./markdown');
const { Editor } = require('./editor');
const mascota = require('./mascota');

const VERBOS = ['Pensando', 'Tramando', 'Cocinando', 'Calculando', 'Maquinando', 'Rumiando', 'Forjando', 'Destilando', 'Afinando', 'Ensamblando', 'Soldando', 'Calibrando', 'Tejiendo', 'Puliendo'];
const GIRO = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const NOMBRES = { shell: 'Shell', leer_archivo: 'Leer', escribir_archivo: 'Escribir', editar_archivo: 'Editar', listar: 'Listar', web: 'Web', delegar: 'Agente', recordar: 'Recordar', buscar_memoria: 'Memoria', ver_pantalla: 'Pantalla', usar_skill: 'Skill' };
const nombreH = n => NOMBRES[n] || (n.startsWith('navegador_') ? 'Navegador·' + n.slice(10) : n);

const COMANDOS = [
  ['/ayuda', 'comandos y atajos'], ['/modelo', 'cambiar de modelo (sin nada: elegir de la lista)'], ['/nueva', 'conversación nueva (también /clear)'],
  ['/sesiones', 'retomar una conversación anterior'], ['/compactar', 'resumir lo antiguo para liberar contexto'], ['/memoria', 'ver o buscar en la memoria: /memoria [texto]'],
  ['/tareas', 'tareas programadas'], ['/skills', 'skills instaladas'], ['/plugins', 'plugins instalados'], ['/uso', 'tokens de los últimos 7 días'],
  ['/cwd', 'carpeta de trabajo: /cwd <ruta>'], ['/estado', 'conexión, sesión y permisos'], ['/panico', 'PARAR todo (agentes, control del PC…)'], ['/reanudar', 'salir del pánico'],
  ['/limpiar', 'limpiar la pantalla'], ['/salir', 'cerrar la CLI'],
];
const ALIAS_CMD = { '/clear': '/nueva', '/help': '/ayuda', '/exit': '/salir', '/quit': '/salir', '/resume': '/sesiones', '/model': '/modelo', '/compact': '/compactar', '/cls': '/limpiar' };

function relTiempo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'ahora' : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
}
const miles = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
const cwdCorto = d => { const h = os.homedir(); return d && d.toLowerCase().startsWith(h.toLowerCase()) ? '~' + d.slice(h.length) : d; };

async function iniciarTUI(con, opciones = {}) {
  const out = process.stdout, inp = process.stdin;
  const cols = () => Math.max(30, out.columns || 80), filas = () => Math.max(10, out.rows || 24);
  const dirCli = path.join(con.dir, 'cli'); try { fs.mkdirSync(dirCli, { recursive: true }); } catch { }
  const fHist = path.join(dirCli, 'historial.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(fHist, 'utf8')); } catch { }
  const ed = new Editor(hist);
  const guardarHist = () => { try { fs.writeFileSync(fHist, JSON.stringify(ed.historial.slice(-500))); } catch { } };

  let cfgPub = {}; try { cfgPub = await con.config(); } catch { }
  const alias = cfgPub.alias || {};
  const modoPerm = () => cfgPub.permisos?.modo || 'preguntar';

  // ── sesión ──
  let ses;
  if (opciones.sesion) { try { ses = await con.sesion(opciones.sesion); } catch { } }
  if (!ses && opciones.continuar) {
    const l = (await con.sesiones()).filter(s => s.canal === 'cli' && !s.padre && path.resolve(s.cwd || '') === path.resolve(opciones.cwd || process.cwd()));
    if (l[0]) ses = await con.sesion(l[0].id);
  }
  if (!ses) ses = await con.crearSesion({ modelo: resolverModelo(opciones.modelo), cwd: opciones.cwd || process.cwd() });

  function resolverModelo(m) { if (!m) return undefined; m = m.trim(); return m.includes('/') ? m : alias[m.toLowerCase()] || m; }

  // ── estado de la pantalla ──
  let cerrado = false;
  let ocupado = false, t0 = 0, verbo = VERBOS[0], giro = 0, tokTurno = 0;
  const cola = [];                                   // mensajes escritos mientras trabaja
  const vivas = new Map();                           // herramientas en curso
  const hijos = new Map();                           // subagentes de esta sesión
  const permisos = [];                               // permisos pendientes de esta sesión (el primero se muestra)
  let selPerm = 0, menu = null, selector = null, pista = '', pistaHasta = 0, ultimoCtrlC = 0, ultimoEsc = 0, verAtajos = false;
  let ultimoResultado = null, conectado = true;
  // casco animado: la bienvenida vive en la zona viva (se mueve) hasta que sale lo primero; luego queda fija en el historial
  let cabecera = false, felizHasta = 0, errorHasta = 0, ultimaTecla = Date.now();
  const T0 = Date.now(), ahoraAnim = () => Date.now() - T0;
  function estadoMascota() {
    if (permisos.length) return 'permiso';
    if (ocupado) return 'trabajando';
    if (Date.now() < errorHasta) return 'error';
    if (Date.now() < felizHasta) return 'feliz';
    if (Date.now() - ultimaTecla > 120_000) return 'dormido';
    return ed.texto ? 'escribiendo' : 'reposo';
  }
  const mirarA = () => { const { col } = ed.filaCol(); return Math.max(-1, Math.min(1, (col + 2) / Math.max(10, cols() - 8) * 2 - 1)); };
  const pegados = new Map(); let nPegado = 0;
  let altoPrev = 0, filaCursorPrev = 0, anchosPrev = [], colCursorPrev = 0, anchoPrev = cols();

  const ponerPista = (t, ms = 2500) => { pista = t; pistaHasta = Date.now() + ms; setTimeout(() => dibujar(), ms + 20); };

  // ── zona viva ──
  function cajaEntrada(W) {
    const t = ed.texto;
    const modo = t.startsWith('!') ? 'shell' : t.startsWith('#') ? 'memoria' : 'normal';
    const colBorde = modo === 'shell' ? c.morado : modo === 'memoria' ? c.azul : c.tenue;
    const prompt = modo === 'shell' ? c.morado('! ') : modo === 'memoria' ? c.azul('# ') : c.blanco('> ');
    const interior = W - 4;                          // "│ " + contenido + " │"
    const util = interior - 2;                       // menos el prompt
    const filasV = []; let cursor = { fila: 0, col: 2 };
    const cuerpo = modo === 'normal' ? t : t.slice(1);
    const posC = modo === 'normal' ? ed.pos : Math.max(0, ed.pos - 1);
    let k = 0;                                        // índice en `cuerpo`
    const logicas = cuerpo.split('\n');
    logicas.forEach((ln, li) => {
      let fila = '', w = 0;
      const empuja = () => { filasV.push(fila); fila = ''; w = 0; };
      for (const ch of ln) {
        const cw = anchoCar(ch.codePointAt(0));
        if (w + cw > util) empuja();
        if (k === posC) cursor = { fila: filasV.length, col: 2 + w };
        fila += ch; w += cw; k += ch.length;
      }
      if (k === posC) { if (w >= util) { empuja(); cursor = { fila: filasV.length, col: 2 }; } else cursor = { fila: filasV.length, col: 2 + w }; }
      empuja(); k += 1;                               // el \n
    });
    // las líneas con texto pegado grande se muestran en otro color
    const pintar = s => s.replace(/\[Pegado #\d+ \+\d+ líneas\]/g, m => c.acento2(m));
    const vacio = !t;
    const maxFilas = Math.max(3, filas() - 10);
    let desde = 0;
    if (filasV.length > maxFilas) desde = Math.min(Math.max(0, cursor.fila - maxFilas + 1), filasV.length - maxFilas);
    const vis = filasV.slice(desde, desde + maxFilas);
    const lineas = [colBorde('╭' + '─'.repeat(W - 2) + '╮')];
    vis.forEach((f, i) => {
      const pre = i === 0 && desde === 0 ? prompt : '  ';
      let contenido = vacio && i === 0 ? c.tenue(cortar(ocupado ? 'Escribe para ponerlo en cola…' : 'Escribe un mensaje · / comandos · @ archivos · ! shell · # recordar', util)) : pintar(f);
      lineas.push(colBorde('│') + ' ' + pre + rellenar(contenido, util) + ' ' + colBorde('│'));
    });
    lineas.push(colBorde('╰' + '─'.repeat(W - 2) + '╯'));
    return { lineas, cursor: { fila: 1 + cursor.fila - desde, col: 2 + cursor.col } };
  }

  function cajaPermiso(W) {
    const p = permisos[0];
    const peligro = !!p.peligro;
    const col = peligro ? c.rojo : c.amarillo;
    const L = [col('╭' + '─'.repeat(W - 2) + '╮')];
    const fila = s => L.push(col('│') + ' ' + rellenar(cortar(s, W - 4), W - 4) + ' ' + col('│'));
    fila(c.negrita(`${peligro ? '⚠ ' : ''}¿Permitir ${nombreH(p.herramienta)}?`) + (permisos.length > 1 ? c.tenue(`  (+${permisos.length - 1} en espera)`) : ''));
    fila('');
    const res = String(p.resumen || p.args?.comando || '').split('\n');
    for (const l of res.slice(0, 8)) for (const x of ajustar(c.blanco(l), W - 6)) fila('  ' + x);
    if (res.length > 8) fila(c.tenue(`  … ${res.length - 8} líneas más`));
    if (peligro) { fila(''); fila(c.rojo(`  PELIGRO: ${p.peligro}`)); }
    fila('');
    const ops = peligro ? ['Sí, esta vez', 'No (Esc)'] : ['Sí', `Sí, y no volver a preguntar por ${nombreH(p.herramienta)} así`, 'No (Esc)'];
    ops.forEach((o, i) => fila((i === selPerm ? c.acento('❯ ') : '  ') + (i === selPerm ? c.acento(`${i + 1}. ${o}`) : `${i + 1}. ${o}`)));
    L.push(col('╰' + '─'.repeat(W - 2) + '╯'));
    L.push(c.tenue('  ↑↓ + Enter · 1-' + ops.length + ' · también puedes contestar en la isla, el móvil o el Stream Deck'));
    return L;
  }

  function cajaSelector(W) {
    const s = selector, L = [c.tenue('╭' + '─'.repeat(W - 2) + '╮')];
    const fila = t => L.push(c.tenue('│') + ' ' + rellenar(cortar(t, W - 4), W - 4) + ' ' + c.tenue('│'));
    fila(c.negrita(s.titulo)); fila('');
    const max = Math.max(3, Math.min(12, filas() - 10));
    const ini = Math.max(0, Math.min(s.sel - Math.floor(max / 2), s.items.length - max));
    s.items.slice(ini, ini + max).forEach((it, k) => {
      const i = ini + k, act = i === s.sel;
      fila((act ? c.acento('❯ ') : '  ') + (act ? c.acento(it.etiqueta) : it.etiqueta) + (it.desc ? c.tenue('  ' + it.desc) : ''));
    });
    if (s.items.length > max) fila(c.tenue(`  ${s.sel + 1}/${s.items.length}`));
    L.push(c.tenue('╰' + '─'.repeat(W - 2) + '╯'));
    L.push(c.tenue('  ↑↓ elegir · Enter aceptar · Esc cancelar'));
    return L;
  }

  function lineaEstado(W) {
    if (pista && Date.now() < pistaHasta) return [c.tenue('  ' + pista)];
    const izq = verAtajos || ocupado ? '' : cabecera ? c.tenue('  ? atajos') : '  ' + mascota.mini(estadoMascota(), ahoraAnim()) + c.tenue(estadoMascota() === 'dormido' ? ' zzz' : ' ? atajos');
    const m = modoPerm();
    const modo = m === 'auto' ? c.amarillo('⏵⏵ permisos automáticos') : m === 'solo-lectura' ? c.azul('⏸ solo lectura') : '';
    const der = [modo, conectado ? '' : c.rojo('● sin conexión con el núcleo'), c.tenue(ses.modelo), c.tenue(cortar(cwdCorto(ses.cwd), 34))].filter(Boolean).join(c.tenue(' · '));
    const hueco = W - 1 - ancho(izq) - ancho(der);
    const L = [hueco >= 1 ? izq + ' '.repeat(hueco) + der : cortar(izq + '  ' + der, W - 1)];
    if (verAtajos) {
      const a = [['/ comandos', '@ archivo', '! shell'], ['# recordar', 'Esc interrumpir', 'Ctrl+O ver resultado'], ['\\⏎ o Alt+⏎ nueva línea', 'Ctrl+L limpiar', 'Ctrl+C salir']];
      for (const f of a) L.push(c.tenue('  ' + f.map(x => rellenar(x, 26)).join('')));
    }
    return L;
  }

  function zonaViva() {
    const W = cols();
    const L = cabecera ? lineasBienvenida() : [];
    // herramientas y subagentes en curso
    if (ocupado) {
      for (const h of vivas.values()) L.push(cortar(`${(giro % 2) ? c.tenue('●') : c.blanco('●')} ${c.negrita(nombreH(h.nombre))}${c.tenue('(' + (h.resumen || '').split('\n')[0] + ')')}`, W - 1));
      for (const a of hijos.values()) if (a.estado === 'trabajando') L.push(cortar(c.tenue(`  ⤷ ${a.nombre || a.id} · ${a.herramienta ? nombreH(a.herramienta) : 'pensando'} · ${a.pasos || 0} pasos`), W - 1));
      const seg = Math.floor((Date.now() - t0) / 1000);
      const tiempo = seg >= 60 ? `${Math.floor(seg / 60)}m ${seg % 60}s` : `${seg}s`;
      L.push(mascota.mini(estadoMascota(), ahoraAnim()) + ' ' + c.acento(GIRO[giro % GIRO.length] + ' ' + verbo + '…') + c.tenue(` (${tiempo}${tokTurno ? ' · ' + miles(tokTurno) + ' tokens' : ''} · esc para interrumpir)`));
    }
    for (const q of cola) L.push(cortar(c.tenue('  ⧗ en cola: ') + q.replace(/\n/g, ' ⏎ '), W - 1));
    L.push('');
    let cursor = null;
    if (permisos.length) L.push(...cajaPermiso(W));
    else if (selector) L.push(...cajaSelector(W));
    else {
      const caja = cajaEntrada(W);
      cursor = { fila: L.length + caja.cursor.fila, col: caja.cursor.col };
      L.push(...caja.lineas);
      if (menu?.items.length) {
        const max = 8, ini = Math.max(0, Math.min(menu.sel - 4, menu.items.length - max));
        menu.items.slice(ini, ini + max).forEach((it, k) => {
          const act = ini + k === menu.sel;
          L.push(cortar('  ' + (act ? c.acento(rellenar(it.etiqueta, 22)) : c.blanco(rellenar(it.etiqueta, 22))) + c.tenue(it.desc || ''), W - 1));
        });
      } else L.push(...lineaEstado(W));
    }
    // nunca más alto que la terminal (si no, el cursor no puede volver arriba)
    const maxAlto = filas() - 1;
    if (L.length > maxAlto) { const quitar = L.length - maxAlto; L.splice(0, quitar); if (cursor) cursor.fila -= quitar; }
    return { L, cursor };
  }

  let pendiente = [];                                // líneas a imprimir arriba en el próximo dibujo
  let programado = false;
  function dibujar() {
    if (cerrado) return;
    const W = cols();
    const { L, cursor } = zonaViva();
    let s = '\x1b[?2026h\x1b[?25l\r';
    // si la terminal se estrechó, las líneas viejas ocupan más filas
    let subir = filaCursorPrev;
    if (W !== anchoPrev) {
      subir = 0;
      for (let i = 0; i < filaCursorPrev && i < anchosPrev.length; i++) subir += Math.max(1, Math.ceil(anchosPrev[i] / W));
      subir += Math.floor(colCursorPrev / W);
    }
    if (subir) s += `\x1b[${subir}A`;
    s += '\x1b[J';
    if (cabecera && pendiente.length) { pendiente.unshift(...lineasBienvenida(ahoraAnim(), 'reposo')); cabecera = false; return dibujar(); }
    for (const l of pendiente) s += l + '\x1b[0m\x1b[K\r\n';
    pendiente = [];
    s += L.join('\r\n');
    const fc = cursor ? cursor.fila : L.length - 1;
    const arriba = L.length - 1 - fc;
    if (arriba) s += `\x1b[${arriba}A`;
    s += '\r' + (cursor && cursor.col ? `\x1b[${cursor.col}C` : '');
    if (cursor) s += '\x1b[?25h';
    s += '\x1b[?2026l';
    out.write(s);
    filaCursorPrev = fc; colCursorPrev = cursor ? cursor.col : 0; anchosPrev = L.map(ancho); anchoPrev = W; altoPrev = L.length;
  }
  const redibujar = () => { if (!programado) { programado = true; setImmediate(() => { programado = false; dibujar(); }); } };
  function imprimir(...lineas) { pendiente.push(...lineas.flat()); redibujar(); }

  // ── bloques de salida ──
  const W0 = () => cols() - 1;
  function imprimirUsuario(t) {
    const ls = t.split('\n'); const out2 = [''];
    ls.slice(0, 12).forEach((l, i) => ajustar(l, W0() - 2).forEach((x, j) => out2.push(c.tenue((i === 0 && j === 0 ? '> ' : '  ') + x))));
    if (ls.length > 12) out2.push(c.tenue(`  … ${ls.length - 12} líneas más`));
    imprimir(out2);
  }
  function imprimirTexto(t) {
    const ls = renderMarkdown(t, W0() - 2);
    imprimir('', ...ls.map((l, i) => (i === 0 ? c.blanco('● ') : '  ') + l));
  }
  function imprimirHerramienta(h, resultado) {
    const err = /^(error|✖|denegad|no permitido|permiso denegado)/i.test(resultado.trim());
    const cab = `${err ? c.rojo('●') : c.acento('●')} ${c.negrita(nombreH(h.nombre))}${c.tenue('(' + cortar(String(h.resumen || '').split('\n')[0], W0() - 12) + ')')}`;
    const L = ['', cab];
    if (h.nombre === 'editar_archivo' && !err && h.args?.buscar != null) {
      const a = String(h.args.buscar).split('\n'), b = String(h.args.reemplazar ?? '').split('\n');
      const d = [...a.slice(0, 6).map(x => c.fondo(c.rojo('- ' + x), 60, 25, 25)), ...(a.length > 6 ? [c.tenue(`  … ${a.length - 6} más`)] : []),
        ...b.slice(0, 6).map(x => c.fondo(c.verde('+ ' + x), 20, 50, 25)), ...(b.length > 6 ? [c.tenue(`  … ${b.length - 6} más`)] : [])];
      d.forEach((x, i) => L.push((i === 0 ? c.tenue('  ⎿  ') : '     ') + cortar(x, W0() - 6)));
    } else {
      const r = resultado.replace(/\r/g, '').split('\n').filter((x, i, arr) => x.trim() || i < arr.length - 1);
      const max = 4;
      r.slice(0, max).forEach((x, i) => L.push((i === 0 ? c.tenue('  ⎿  ') : '     ') + (err ? c.rojo(cortar(x, W0() - 6)) : c.tenue(cortar(x, W0() - 6)))));
      if (!r.length) L.push(c.tenue('  ⎿  (sin salida)'));
      if (r.length > max) L.push(c.tenue(`     … +${r.length - max} ${r.length - max === 1 ? 'línea' : 'líneas'} (ctrl+o para verlo entero)`));
    }
    imprimir(L);
  }

  function lineasBienvenida(t = ahoraAnim(), estado = estadoMascota()) {
    const W = Math.min(cols() - 1, 72);
    const caja = ls => [c.acento('╭' + '─'.repeat(W - 2) + '╮'), ...ls.map(l => c.acento('│') + ' ' + rellenar(cortar(l, W - 4), W - 4) + ' ' + c.acento('│')), c.acento('╰' + '─'.repeat(W - 2) + '╯')];
    const k = mascota.casco(estado, t, mirarA());
    const dormido = estado === 'dormido';
    return caja([
      `${k[0]} ${c.negrita('✻ Bienvenido a ' + con.nombre)}`,
      `${k[1]} ${c.tenue(dormido ? 'zzz… escribe algo para despertarlo' : '/ayuda para comandos · ? atajos')}`,
      `${k[2]} ${c.tenue(con.modo === 'daemon' ? 'conectado al núcleo de la app' : 'núcleo en proceso (la app no está abierta)')}`,
      k[3],
      `${c.tenue('carpeta:')} ${cwdCorto(ses.cwd)}`,
      `${c.tenue('modelo: ')} ${ses.modelo}`,
    ]);
  }
  function bienvenida() { cabecera = true; dibujar(); }

  // ── turnos ──
  function expandir(t) {
    t = t.replace(/\[Pegado #(\d+) \+\d+ líneas\]/g, (m, k) => pegados.get(+k) ?? m);
    const adj = [];
    for (const m of t.matchAll(/(^|\s)@("[^"]+"|\S+)/g)) {
      const ruta = m[2].replace(/^"|"$/g, ''), abs = path.resolve(ses.cwd, ruta);
      try {
        const st = fs.statSync(abs);
        if (st.isDirectory()) adj.push(`<carpeta ruta="${ruta}">\n${fs.readdirSync(abs).slice(0, 200).join('\n')}\n</carpeta>`);
        else if (st.size <= 200_000) adj.push(`<archivo ruta="${ruta}">\n${fs.readFileSync(abs, 'utf8')}\n</archivo>`);
        else adj.push(`(el archivo ${ruta} pesa ${Math.round(st.size / 1024)} KB: léelo por partes con leer_archivo)`);
      } catch { }
    }
    return adj.length ? `${t}\n\n${adj.join('\n\n')}` : t;
  }

  async function turno(texto) {
    imprimirUsuario(texto);
    ocupado = true; t0 = Date.now(); tokTurno = 0; verbo = VERBOS[Math.floor(Math.random() * VERBOS.length)];
    vivas.clear();
    const usoAntes = (ses.uso?.entrada || 0) + (ses.uso?.salida || 0);
    const tic = setInterval(() => { giro++; dibujar(); }, 120);
    let huboError = false;
    try {
      await con.enviar(ses.id, expandir(texto), e => {
        if (e.sesion && e.sesion !== ses.id) return;
        if (e.tipo === 'texto') imprimirTexto(e.texto);
        else if (e.tipo === 'herramienta') { vivas.set(e.id, e); if (Math.random() < 0.3) verbo = VERBOS[Math.floor(Math.random() * VERBOS.length)]; }
        else if (e.tipo === 'resultado') { const h = vivas.get(e.id) || e; vivas.delete(e.id); ultimoResultado = { h, texto: e.resultado }; imprimirHerramienta(h, String(e.resultado || '')); }
        else if (e.tipo === 'aviso') imprimir(c.amarillo(`  ⚠ ${e.texto}`));
        else if (e.tipo === 'compactacion') imprimir('', c.tenue(`  ✻ conversación resumida: ${miles(e.antes)} → ${miles(e.despues)} tokens · ${e.recuerdos?.length || 0} recuerdos guardados`));
        else if (e.tipo === 'skill-sugerida') imprimir(c.tenue(`  ✻ esto podría ser una skill: ${e.resumen || ''}`));
        else if (e.tipo === 'error' && (huboError = !/cancelad|abort/i.test(e.error), true)) imprimir('', c.rojo(/cancelad|abort/i.test(e.error) ? '  ⎿  Interrumpido. ¿Qué hago ahora?' : `● Error: ${e.error}`));
        else if (e.tipo === 'fin') { ses.uso = e.uso; tokTurno = (e.uso.entrada + e.uso.salida) - usoAntes; }
      });
    } catch (e) { huboError = true; imprimir('', c.rojo(`● ${e.message}`)); }
    clearInterval(tic);
    ocupado = false; vivas.clear();
    if (huboError) errorHasta = Date.now() + 3000; else felizHasta = Date.now() + 2500;
    for (const [id, a] of hijos) if (a.estado !== 'trabajando') hijos.delete(id);
    const seg = Math.round((Date.now() - t0) / 1000);
    if (seg >= 20) imprimir(c.tenue(`  ✻ ${seg >= 60 ? Math.floor(seg / 60) + 'm ' + (seg % 60) + 's' : seg + 's'}${tokTurno ? ' · ' + miles(tokTurno) + ' tokens' : ''}`));
    if (seg >= 30) out.write('\x07');                 // aviso al terminar algo largo
    dibujar();
    if (cola.length) { const t = cola.splice(0).join('\n\n'); turno(t); }
  }

  // ── comandos ──
  async function comando(linea) {
    const [cab0, ...resto] = linea.trim().split(/\s+/); const arg = resto.join(' ');
    const cab = ALIAS_CMD[cab0] || cab0;
    const lista = (titulo, filas2) => imprimir('', c.negrita(titulo), ...(filas2.length ? filas2 : [c.tenue('  (nada)')]));
    try {
      switch (cab) {
        case '/ayuda':
          return imprimir('', c.negrita('Comandos'), ...COMANDOS.map(([k, d]) => `  ${c.acento(rellenar(k, 12))} ${c.tenue(d)}`), '',
            c.negrita('Atajos'), ...[['Enter', 'enviar (mientras trabaja: a la cola)'], ['\\ + Enter · Alt+Enter · Ctrl+J', 'nueva línea'], ['Esc', 'interrumpir · Esc Esc borra lo escrito'],
              ['↑ ↓', 'historial'], ['@ruta', 'adjuntar un archivo (Tab completa)'], ['! comando', 'ejecutar en tu terminal'], ['# texto', 'guardar en la memoria'],
              ['Ctrl+O', 'ver entero el último resultado'], ['Ctrl+L', 'limpiar la pantalla'], ['Ctrl+C ×2 · Ctrl+D', 'salir']].map(([k, d]) => `  ${c.acento(rellenar(k, 30))} ${c.tenue(d)}`));
        case '/salir': return salir();
        case '/limpiar': out.write('\x1b[2J\x1b[3J\x1b[H'); filaCursorPrev = 0; return dibujar();
        case '/nueva': ses = await con.crearSesion({ modelo: ses.modelo, cwd: ses.cwd }); hijos.clear(); out.write('\x1b[2J\x1b[3J\x1b[H'); filaCursorPrev = 0; bienvenida(); return;
        case '/modelo': {
          if (arg) { ses = await con.cambiarSesion(ses.id, { modelo: resolverModelo(arg) }); return imprimir(c.tenue(`  ⎿  modelo: ${ses.modelo}`)); }
          const vistos = new Set(), items = [];
          const add = (v, etiqueta, desc) => { if (v && v.includes('/') && !vistos.has(v)) { vistos.add(v); items.push({ valor: v, etiqueta, desc }); } };
          add(ses.modelo, ses.modelo, 'actual');
          add(cfgPub.modeloPorDefecto || con.estado?.modeloPorDefecto, cfgPub.modeloPorDefecto || con.estado?.modeloPorDefecto, 'por defecto');
          for (const [k, v] of Object.entries(alias)) add(v, `${k}`, v);
          try { for (const s of (await con.sesiones()).slice(0, 80)) add(s.modelo, s.modelo, 'usado hace poco'); } catch { }
          return abrirSelector('Elige el modelo de esta conversación', items, async it => { ses = await con.cambiarSesion(ses.id, { modelo: it.valor }); imprimir(c.tenue(`  ⎿  modelo: ${ses.modelo}`)); });
        }
        case '/sesiones': {
          const l = (await con.sesiones()).filter(s => !s.padre && !s.tarea && s.id !== ses.id).slice(0, 60);
          if (!l.length) return imprimir(c.tenue('  ⎿  no hay otras conversaciones'));
          return abrirSelector('Retomar una conversación', l.map(s => ({ valor: s.id, etiqueta: cortar(s.titulo || s.id, 46), desc: `${relTiempo(s.actualizada)} · ${s.canal} · ${s.modelo}` })), async it => {
            ses = await con.sesion(it.valor); hijos.clear();
            const ms = (ses.mensajes || []).filter(m => (m.role === 'user' || m.role === 'assistant') && m.content).slice(-10);
            imprimir('', c.tenue(`  ── retomando «${ses.titulo}» (${(ses.mensajes || []).length} mensajes) ──`));
            for (const m of ms) m.role === 'user' ? imprimirUsuario(String(m.content)) : imprimirTexto(String(m.content));
          });
        }
        case '/compactar': {
          imprimir(c.tenue('  ✻ resumiendo…'));
          const r = await con.compactar(ses.id);
          return imprimir(c.tenue(r.ok ? `  ⎿  ${miles(r.antes)} → ${miles(r.despues)} tokens · ${r.recuerdos?.length || 0} recuerdos guardados` : `  ⎿  ${r.motivo || 'no hacía falta'}`));
        }
        case '/memoria': {
          const r0 = await con.memoria(arg); const l = Array.isArray(r0) ? r0 : (r0.resultados || r0.memorias || []);
          return lista(arg ? `Memoria · «${arg}»` : 'Memoria', l.slice(0, 40).map(m => `  ${c.tenue(rellenar(m.tipo || '', 11))} ${cortar(m.texto, W0() - 14)}`));
        }
        case '/tareas': {
          const l = await con.tareas();
          return lista('Tareas programadas', l.map(t => `  ${t.activa ? c.acento('●') : c.tenue('○')} ${t.nombre}${t.proxima ? c.tenue(' · ' + new Date(t.proxima).toLocaleString('es')) : ''}`));
        }
        case '/skills': {
          const l = await con.skills(); const col = { verde: c.verde, amarillo: c.amarillo, rojo: c.rojo };
          return lista('Skills', l.map(x => `  ${x.activa ? c.acento('●') : c.tenue('○')} ${rellenar(x.slug, 28)} ${(col[x.escaneo?.nivel] || c.tenue)(x.escaneo?.nivel || '—')} ${c.tenue(cortar(x.descripcion || '', 50))}`));
        }
        case '/plugins': {
          const l = await con.plugins();
          return lista('Plugins', l.map(x => `  ${x.activo ? c.acento('●') : c.tenue('○')} ${x.nombre} ${c.tenue(x.version + ' · ' + (x.roto ? 'ROTO' : x.estado))}`));
        }
        case '/uso': {
          const u = await con.uso();
          const filas2 = Object.entries(u.porModelo || {}).sort((a, b) => (b[1].entrada + b[1].salida) - (a[1].entrada + a[1].salida))
            .map(([m, v]) => `  ${rellenar(cortar(m, 34), 35)} ${c.tenue('↑')}${rellenar(miles(v.entrada), 7)} ${c.tenue('↓')}${rellenar(miles(v.salida), 7)} ${c.tenue(v.sesiones + ' ses.')}`);
          return lista(`Uso · últimos ${u.dias} días · ${u.sesiones} sesiones`, filas2);
        }
        case '/cwd': {
          if (!arg) return imprimir(c.tenue(`  ⎿  ${ses.cwd}`));
          const d = path.resolve(ses.cwd, arg.replace(/^~(?=$|[\\/])/, os.homedir()));
          if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return imprimir(c.rojo(`  ⎿  no existe: ${d}`));
          ses = await con.cambiarSesion(ses.id, { cwd: d }); return imprimir(c.tenue(`  ⎿  carpeta: ${ses.cwd}`));
        }
        case '/estado':
          return lista('Estado', [`  ${c.tenue('conexión')}  ${con.modo === 'daemon' ? `daemon ${con.base}` : 'en proceso'}${conectado ? '' : c.rojo(' (eventos caídos)')}`,
            `  ${c.tenue('sesión  ')}  ${ses.id} · ${ses.titulo}`, `  ${c.tenue('modelo  ')}  ${ses.modelo}`, `  ${c.tenue('carpeta ')}  ${ses.cwd}`,
            `  ${c.tenue('permisos')}  ${modoPerm()}`, `  ${c.tenue('tokens  ')}  ↑${miles(ses.uso?.entrada || 0)} ↓${miles(ses.uso?.salida || 0)} en esta conversación`]);
        case '/panico': await con.panico(); return imprimir(c.rojo('  ■ PÁNICO: todo parado. /reanudar para seguir.'));
        case '/reanudar': await con.reanudar(); return imprimir(c.acento('  ▶ reanudado'));
        default: return imprimir(c.rojo(`  ⎿  comando desconocido: ${cab0}`) + c.tenue('  (/ayuda)'));
      }
    } catch (e) { imprimir(c.rojo(`  ⎿  ${e.message}`)); }
  }

  function abrirSelector(titulo, items, alElegir) { if (!items.length) return; selector = { titulo, items, sel: 0, alElegir }; dibujar(); }

  function shellLocal(cmd) {
    imprimir('', c.morado('! ') + c.blanco(cmd));
    const esWin = process.platform === 'win32';
    const p = spawn(esWin ? 'powershell.exe' : (process.env.SHELL || '/bin/sh'), esWin ? ['-NoProfile', '-Command', cmd] : ['-c', cmd], { cwd: ses.cwd });
    let salida = '';
    p.stdout.on('data', d => salida += d); p.stderr.on('data', d => salida += d);
    p.on('close', code => {
      const ls = salida.replace(/\r/g, '').trimEnd().split('\n');
      const mostrar = ls.slice(-30);
      if (ls.length > 30) imprimir(c.tenue(`  ⎿  … ${ls.length - 30} líneas antes`));
      imprimir(...mostrar.map((l, i) => (i === 0 && ls.length <= 30 ? c.tenue('  ⎿  ') : '     ') + cortar(l, W0() - 6)));
      if (code) imprimir(c.rojo(`     (código ${code})`));
      ultimoResultado = { h: { nombre: 'shell', resumen: cmd }, texto: salida };
    });
  }

  // ── autocompletado ──
  function actualizarMenu() {
    const t = ed.texto;
    if (/^\/\S*$/.test(t) && ed.pos === t.length) {
      const q = t.toLowerCase();
      const items = COMANDOS.filter(([k]) => k.startsWith(q)).map(([k, d]) => ({ etiqueta: k, desc: d, valor: k }));
      menu = items.length && !(items.length === 1 && items[0].valor === t) ? { tipo: 'cmd', items, sel: Math.min(menu?.tipo === 'cmd' ? menu.sel : 0, items.length - 1) } : null;
      return;
    }
    const { ini, texto: w } = ed.palabraActual();
    if (w.startsWith('@')) {
      const q = w.slice(1).replace(/^"/, '');
      const dirRel = q.includes('/') || q.includes('\\') ? q.replace(/[^\\/]*$/, '') : '';
      const base = q.slice(dirRel.length).toLowerCase();
      let items = [];
      try {
        items = fs.readdirSync(path.resolve(ses.cwd, dirRel || '.'), { withFileTypes: true })
          .filter(d => !d.name.startsWith('.') || base.startsWith('.')).filter(d => d.name.toLowerCase().includes(base) && !['node_modules', '.git'].includes(d.name))
          .sort((a, b) => (b.name.toLowerCase().startsWith(base) - a.name.toLowerCase().startsWith(base)) || (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name))
          .slice(0, 30).map(d => { const v = (dirRel + d.name).replace(/\\/g, '/') + (d.isDirectory() ? '/' : ''); return { etiqueta: '@' + v, desc: d.isDirectory() ? 'carpeta' : '', valor: v, ini }; });
      } catch { }
      menu = items.length ? { tipo: 'archivo', items, sel: Math.min(menu?.tipo === 'archivo' ? menu.sel : 0, items.length - 1) } : null;
      return;
    }
    menu = null;
  }
  function aplicarMenu() {
    const it = menu.items[menu.sel];
    if (menu.tipo === 'cmd') { ed.poner(it.valor + (['/modelo', '/memoria', '/cwd'].includes(it.valor) ? ' ' : '')); }
    else {
      const v = /\s/.test(it.valor) ? `"${it.valor}"` : it.valor;
      ed.texto = ed.texto.slice(0, it.ini) + '@' + v + (it.valor.endsWith('/') ? '' : ' ') + ed.texto.slice(ed.pos); ed.pos = it.ini + 1 + v.length + (it.valor.endsWith('/') ? 0 : 1);
    }
    menu = null; actualizarMenu();
  }

  // ── permisos ──
  const esMio = id => id === ses.id || hijos.has(id);
  function nuevoPermiso(p) {
    if (!esMio(p.sesion) || permisos.some(x => x.id === p.id)) return;
    permisos.push(p); if (permisos.length === 1) selPerm = 0;
    out.write('\x07'); dibujar();
  }
  async function contestar(i) {
    const p = permisos[0]; if (!p) return;
    const peligro = !!p.peligro;
    const decision = peligro ? (i === 0 ? 'allow' : 'deny') : ['allow', 'always', 'deny'][i];
    permisos.shift(); selPerm = 0;
    imprimir(c.tenue(`  ${decision === 'deny' ? c.rojo('✗') : c.acento('✓')} ${nombreH(p.herramienta)}: ${decision === 'allow' ? 'permitido' : decision === 'always' ? 'permitido siempre' : 'denegado'}`));
    try { await con.resolver(p.id, decision); } catch (e) { imprimir(c.rojo(`  ⎿  ${e.message}`)); }
    dibujar();
  }
  con.bus.on('evento', e => {
    if (e.tipo === 'permiso') nuevoPermiso(e);
    else if (e.tipo === 'permiso-resuelto') {
      const k = permisos.findIndex(x => x.id === e.id);
      if (k >= 0) { const p = permisos.splice(k, 1)[0]; if (k === 0) selPerm = 0; if (e.quien && e.quien !== 'cli') imprimir(c.tenue(`  ${e.decision === 'deny' ? '✗' : '✓'} ${nombreH(p.herramienta)}: ${e.decision === 'deny' ? 'denegado' : 'permitido'} desde ${e.quien}`)); dibujar(); }
    } else if (e.tipo === 'agente' && e.agente) {
      const a = e.agente;
      if (a.padre === ses.id) { hijos.set(a.id, a); if (ocupado) redibujar(); }
    }
  });
  con.bus.on('conexion', ok => { conectado = ok; if (ok) con.pendientes().then(l => l.forEach(nuevoPermiso)).catch(() => { }); redibujar(); });
  con.pendientes().then(l => l.forEach(nuevoPermiso)).catch(() => { });

  // ── teclado ──
  function salir() {
    if (cerrado) return; cerrado = true;
    guardarHist();
    pendiente = []; menu = null;
    out.write('\r' + (filaCursorPrev ? `\x1b[${filaCursorPrev}A` : '') + '\x1b[J' + '\x1b[?2004l\x1b[?25h');
    out.write(c.tenue(`Conversación ${ses.id} guardada · retómala con: apolo -r ${ses.id}`) + '\n');
    try { inp.setRawMode(false); } catch { }
    con.cerrar(); process.exit(0);
  }

  async function enviarLinea() {
    let t = ed.texto;
    if (!t.trim()) return;
    ed.guardarEnHistorial(t); ed.vaciar(); menu = null; guardarHist();
    const tt = t.trim();
    if (tt.startsWith('/') && !tt.startsWith('//')) { dibujar(); return comando(tt); }
    if (tt.startsWith('!')) { dibujar(); return shellLocal(tt.slice(1).trim()); }
    if (tt.startsWith('#')) {
      const r = tt.slice(1).trim(); dibujar();
      try { await con.recordar(r); imprimir('', c.azul('# ') + r, c.tenue('  ⎿  guardado en la memoria')); } catch (e) { imprimir(c.rojo(`  ⎿  ${e.message}`)); }
      return;
    }
    if (ocupado) { cola.push(t); return dibujar(); }
    turno(t);
  }

  let pegando = false, bufPegado = '', rafaga = false;
  function pegar(s) {
    s = s.replace(/\r\n?/g, '\n');
    const n = s.split('\n').length;
    if (s.length > 800 || n > 12) { nPegado++; pegados.set(nPegado, s); ed.insertar(`[Pegado #${nPegado} +${n} líneas]`); }
    else ed.insertar(s);
  }

  inp.prependListener('data', d => { if (!pegando && d.length > 3 && !String(d).startsWith('\x1b')) { rafaga = true; setImmediate(() => { rafaga = false; }); } });
  readline.emitKeypressEvents(inp, { escapeCodeTimeout: 25 });   // sin esto un Esc suelto espera a la siguiente tecla
  inp.setRawMode(true); inp.resume();
  out.write('\x1b[?2004h');                          // pegado entre corchetes: lo pegado no se envía al llegar al Enter
  process.on('exit', () => { try { out.write('\x1b[?2004l\x1b[?25h'); } catch { } });
  out.on('resize', () => dibujar());

  inp.on('keypress', async (s, k = {}) => {
    if (cerrado) return;
    ultimaTecla = Date.now();
    if (k.name === 'paste-start') { pegando = true; bufPegado = ''; return; }
    if (k.name === 'paste-end') { pegando = false; if (!permisos.length && !selector) { pegar(bufPegado); actualizarMenu(); } bufPegado = ''; return dibujar(); }
    if (pegando) { bufPegado += k.name === 'return' || k.name === 'enter' ? '\n' : (s || ''); return; }
    const nombre = k.name, ctrl = k.ctrl, meta = k.meta;

    if (ctrl && nombre === 'c') {
      if (permisos.length) return contestar(permisos[0].peligro ? 1 : 2);
      if (ed.texto) { ed.vaciar(); menu = null; return dibujar(); }
      if (ocupado) { con.cancelar(ses.id).catch(() => { }); return; }
      if (Date.now() - ultimoCtrlC < 2000) return salir();
      ultimoCtrlC = Date.now(); return ponerPista('Pulsa Ctrl+C otra vez para salir', 2000);
    }
    if (ctrl && nombre === 'd' && !ed.texto) return salir();
    if (ctrl && nombre === 'l') { out.write('\x1b[2J\x1b[3J\x1b[H'); filaCursorPrev = 0; return dibujar(); }
    if (ctrl && nombre === 'o') {
      if (!ultimoResultado) return;
      const r = String(ultimoResultado.texto || '').replace(/\r/g, '').split('\n');
      return imprimir('', c.negrita(`${nombreH(ultimoResultado.h.nombre)}(${cortar(String(ultimoResultado.h.resumen || ''), W0() - 20)})`), ...r.map(l => c.tenue('  │ ') + l));
    }

    // permiso abierto: solo se contesta
    if (permisos.length) {
      const nOps = permisos[0].peligro ? 2 : 3;
      if (nombre === 'up') selPerm = (selPerm + nOps - 1) % nOps;
      else if (nombre === 'down' || nombre === 'tab') selPerm = (selPerm + 1) % nOps;
      else if (nombre === 'return') return contestar(selPerm);
      else if (nombre === 'escape') return contestar(nOps - 1);
      else if (/^[1-3]$/.test(s) && +s <= nOps) return contestar(+s - 1);
      else if (s === 's' || s === 'y') return contestar(0);
      else if (s === 'a' && nOps === 3) return contestar(1);
      else if (s === 'n') return contestar(nOps - 1);
      return dibujar();
    }
    if (selector) {
      const n = selector.items.length;
      if (nombre === 'up') selector.sel = (selector.sel + n - 1) % n;
      else if (nombre === 'down' || nombre === 'tab') selector.sel = (selector.sel + 1) % n;
      else if (nombre === 'pageup') selector.sel = Math.max(0, selector.sel - 10);
      else if (nombre === 'pagedown') selector.sel = Math.min(n - 1, selector.sel + 10);
      else if (nombre === 'escape') selector = null;
      else if (nombre === 'return') { const sel = selector; selector = null; dibujar(); try { await sel.alElegir(sel.items[sel.sel]); } catch (e) { imprimir(c.rojo(`  ⎿  ${e.message}`)); } }
      return dibujar();
    }

    if (nombre === 'escape') {
      if (menu) { menu = null; return dibujar(); }
      if (verAtajos) { verAtajos = false; return dibujar(); }
      if (ocupado) { con.cancelar(ses.id).catch(() => { }); cola.length = 0; return dibujar(); }
      if (ed.texto) {
        if (Date.now() - ultimoEsc < 800) { ed.vaciar(); return dibujar(); }
        ultimoEsc = Date.now(); return ponerPista('Esc otra vez para borrar lo escrito', 800);
      }
      return;
    }
    if (menu && (nombre === 'up' || nombre === 'down')) { const n = menu.items.length; menu.sel = (menu.sel + (nombre === 'up' ? n - 1 : 1)) % n; return dibujar(); }
    if (menu && nombre === 'tab') { aplicarMenu(); return dibujar(); }
    if (nombre === 'return' && !meta && !rafaga) {
      if (menu) {
        if (menu.tipo === 'archivo') { aplicarMenu(); return dibujar(); }
        ed.poner(menu.items[menu.sel].valor); menu = null;
      }
      if (ed.pos > 0 && ed.texto[ed.pos - 1] === '\\') { ed.borrarAtras(); ed.insertar('\n'); return dibujar(); }
      await enviarLinea(); return dibujar();
    }
    if ((nombre === 'return' && (meta || rafaga)) || nombre === 'enter' || (ctrl && nombre === 'j')) ed.insertar('\n');
    else if (nombre === 'backspace') { if (meta || ctrl) ed.borrarPalabra(); else ed.borrarAtras(); }
    else if (nombre === 'delete') ed.borrarDelante();
    else if (nombre === 'left') { if (ctrl || meta) ed.pos = ed.palabraAtras(); else ed.izquierda(); }
    else if (nombre === 'right') { if (ctrl || meta) ed.pos = ed.palabraDelante(); else ed.derecha(); }
    else if (nombre === 'home' || (ctrl && nombre === 'a')) ed.inicioLinea();
    else if (nombre === 'end' || (ctrl && nombre === 'e')) ed.finLinea();
    else if (meta && nombre === 'b') ed.pos = ed.palabraAtras();
    else if (meta && nombre === 'f') ed.pos = ed.palabraDelante();
    else if (ctrl && nombre === 'w') ed.borrarPalabra();
    else if (ctrl && nombre === 'u') ed.borrarHastaInicio();
    else if (ctrl && nombre === 'k') ed.borrarHastaFin();
    else if (nombre === 'up') ed.arriba();
    else if (nombre === 'down') ed.abajo();
    else if (nombre === 'tab') { }
    else if (s === '?' && !ed.texto) { verAtajos = !verAtajos; return dibujar(); }
    else if (s && !ctrl && !(meta && s.length === 1 && nombre)) {
      const limpio = s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/\r/g, '\n');
      if (limpio) ed.insertar(limpio);
    } else return;
    actualizarMenu(); dibujar();
  });

  let firmaAnim = '';
  const relojAnim = setInterval(() => {
    if (cerrado || ocupado || pegando) return;
    const t = ahoraAnim(), e = estadoMascota();
    const firma = cabecera ? mascota.casco(e, t, mirarA()).join('') : mascota.mini(e, t);
    if (firma !== firmaAnim) { firmaAnim = firma; dibujar(); }
  }, 90);
  relojAnim.unref?.();
  bienvenida();
  if (opciones.retomarElegir) comando('/sesiones');
  else if (opciones.mensaje) turno(opciones.mensaje);
}

module.exports = { iniciarTUI };
