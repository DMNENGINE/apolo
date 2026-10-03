// Nodos de hardware (FASE 7): el "ojo de escritorio" ESP32 y, más adelante, la Pi o el humanoide.
// Servidor WebSocket propio (core/nodos/ws.js, sin dependencias) en un puerto APARTE (cfg.nodos.puerto, 47901):
//   - la API del daemon (47900) sigue cerrada a la LAN; aquí solo entran IPs privadas de la LAN (o cfg.nodos.permitidos)
//   - cada nodo se empareja UNA vez: muestra un código de 6 dígitos en su pantalla, lo escribes en el panel
//     (POST /v1/nodos/emparejar {codigo}) y recibe un token propio (aquí solo se guarda su sha256)
// No es un plugin del SDK: los plugins corren en un proceso hijo con la red bloqueada (no pueden abrir un puerto)
// y esto necesita el bus y permisos.resolver en directo (botón Permitir/Denegar/pánico).
//
// Protocolo (JSON en frames de texto; audio/fotos en frames binarios entre un "-inicio" y su "-fin"):
//   nodo → PC  hola {id, nombre, version, modelo, capacidades[], token?} · boton {pulsacion: corta|larga|doble}
//              audio-inicio {frecuencia:16000, bits:16, canales:1} · <binario PCM s16le> · audio-fin
//              foto-inicio {bytes} · <binario JPEG> · foto-fin · foto-error {motivo}
//   PC → nodo  emparejar {codigo} · emparejado {token, nombre} · bienvenido {nombre, epoch, tz} · rechazado {motivo}
//              estado {estado, msg} · flash {estado, msg, segundos} · gesto {gesto, segundos, msg?} · mirar {x, y, segundos}
//              permiso {id, resumen, peligro} · audio-inicio {frecuencia} · <binario> · audio-fin · foto · oido {texto}
//
// Bus (entrada): 'evento' (sesiones), 'permiso', 'permiso-resuelto', 'aviso-externo', 'control',
//   'nodo-estado' {estado, msg, segundos?} (p. ej. main.js con las sesiones de Claude Code), 'nodo-gesto' {gesto, segundos, msg?},
//   'nodo-reproducir' {pcm: Buffer | ruta, nodo?}
// Bus (salida): 'nodo' {tipo: conectado|desconectado|emparejando|emparejado|borrado, id, nombre}, 'nodo-audio' {nodo, nombre, ruta, ms},
//   'nodo-texto' {nodo, texto} (si hay transcriptor), 'panico' {origen}
// main.js (conectarOjo): nucleo.nodos.transcriptor = ruta → texto, enruta 'nodo-texto'
//   como si fuera voz de la isla; y tras generar el TTS: nucleo.nodos.reproducirArchivo(mp3).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ws = require('./ws');

const POR_DEFECTO = {
  puerto: 47901,
  permitidos: [],              // vacío = cualquier IP privada de la LAN; o lista de IPs / CIDR ("192.168.1.0/24")
  permitirLoopback: true,      // 127.0.0.1 (el simulador); los tests lo apagan para probar el rechazo
  dormirMin: 3,                // sin actividad → ojos dormidos
  permitirPeligrosos: false,   // un permiso PELIGROSO no se aprueba con el botón del ojo: solo en el PC/panel/Stream Deck
  maxAudioSeg: 30,
  ffmpeg: 'ffmpeg',
};
const ESTADOS = ['reposo', 'trabajando', 'permiso', 'listo', 'error', 'dormido'];
const GESTOS = ['feliz', 'triste', 'duda', 'sorpresa', 'guino', 'corazon', 'remolino', 'bostezo', 'reloj'];
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const igualesHex = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// texto para la pantalla: las fuentes del ESP32 son ASCII → sin tildes ni ¿¡, mayúsculas, corto
function textoPantalla(s, max = 22) {
  return String(s || '').replace(/✓/g, 'OK').replace(/✗/g, 'X').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'N').replace(/[¿¡]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);
}

// ¿puede entrar esta IP? loopback (si se permite) + LAN privada, o solo la lista
function ipPermitida(ip, opc) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return opc.permitirLoopback !== false;
  const lista = opc.permitidos || [];
  if (lista.length) return lista.some(p => enCidr(ip, String(p)));
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)) return true;      // IPv6 local
  return false;
}
function enCidr(ip, regla) {
  if (!regla.includes('/')) return ip === regla;
  const [base, bits] = regla.split('/'); const n = +bits;
  const num = x => x.split('.').reduce((a, b) => (a << 8) + (+b & 255), 0) >>> 0;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(base) || !(n >= 0 && n <= 32)) return false;
  const m = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
  return (num(ip) & m) === (num(base) & m);
}

function wav(pcm, frecuencia = 16000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(frecuencia, 24);
  h.writeUInt32LE(frecuencia * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function crearNodos({ nucleo }) {
  const { cfg, bus, permisos } = nucleo;
  const opc = () => ({ ...POR_DEFECTO, ...(cfg.nodos || {}) });
  const fDatos = path.join(cfg.dir, 'nodos.json');
  let datos = { activo: null, nodos: [] };
  try { datos = { ...datos, ...JSON.parse(fs.readFileSync(fDatos, 'utf8')) }; } catch { }
  const guardar = () => { try { fs.writeFileSync(fDatos, JSON.stringify(datos, null, 2), { mode: 0o600 }); } catch { } };
  const reg = (nivel, titulo, detalle = '') => { try { nucleo.registro?.add(nivel, titulo, detalle); } catch { } };

  const conexiones = new Map();        // id de nodo → {ws, nodo, ip, audio, foto, ultimo:{estado,msg}}
  const pendientes = new Map();        // código → {ws, id, nombre, ip, caduca, info}
  let srv = null, puertoReal = null, timer = null;
  let fallos = [];                     // intentos de emparejar fallidos (fuerza bruta)

  // ---------- estado agregado (lo mismo que mueve al robot de la isla) ----------
  const trabajando = new Map();        // sesión → herramienta actual
  let externo = null;                  // {estado, msg, hasta}: de main.js (sesiones de Claude Code)
  let ultimaActividad = Date.now(), dormido = false;
  // permisos que NO son del núcleo (hooks de Claude Code en main.js): api.permisosExternos = { pendientes(), resolver(id, decision, via) }
  function externos() { try { return (api.permisosExternos?.pendientes?.() || []).map(p => ({ ...p, externo: true })); } catch { return []; } }
  function estadoActual() {
    const pend = permisos.pendientes();
    if (pend.length || externos().length) return { estado: 'permiso', msg: 'PERMISO?' };
    if (externo && Date.now() < externo.hasta && externo.estado === 'permiso') return { estado: 'permiso', msg: textoPantalla(externo.msg || 'PERMISO?') };
    if (trabajando.size) { const h = [...trabajando.values()].filter(Boolean).pop(); return { estado: 'trabajando', msg: textoPantalla(h || '') }; }
    if (externo && Date.now() < externo.hasta && ESTADOS.includes(externo.estado)) return { estado: externo.estado, msg: textoPantalla(externo.msg) };
    if (Date.now() - ultimaActividad > opc().dormirMin * 60_000) return { estado: 'dormido', msg: '' };
    return { estado: 'reposo', msg: '' };
  }
  function difundir(msg) { for (const c of conexiones.values()) c.ws.enviarJSON(msg); }
  function refrescar() {
    const e = estadoActual();
    if (e.estado === 'dormido') dormido = true;
    for (const c of conexiones.values()) {
      if (c.ultimo && c.ultimo.estado === e.estado && c.ultimo.msg === e.msg) continue;
      c.ultimo = e; c.ws.enviarJSON({ tipo: 'estado', ...e });
    }
  }
  function actividad() {
    ultimaActividad = Date.now();
    if (dormido) { dormido = false; difundir({ tipo: 'gesto', gesto: 'bostezo', segundos: 2.5 }); }   // se despierta bostezando
  }
  function primerPermiso() {
    const pend = [...permisos.pendientes(), ...externos()].sort((a, b) => (a.creado || 0) - (b.creado || 0));
    return pend[0] || null;
  }
  // resolver uno del núcleo o uno externo (Claude Code); "via" = nombre del nodo
  function resolverP(p, decision, via) {
    if (!p.externo) return permisos.resolver(p.id, decision, decision === 'deny' ? `denegado desde ${via}` : undefined, `nodo:${via}`);
    try { return !!api.permisosExternos?.resolver?.(p.id, decision, via); } catch { return false; } finally { refrescar(); }
  }

  const oyentes = {
    evento: e => {
      if (!e || !e.sesion) return;
      if (e.tipo === 'inicio') { actividad(); trabajando.set(e.sesion, ''); }
      else if (e.tipo === 'herramienta') { if (trabajando.has(e.sesion)) trabajando.set(e.sesion, e.nombre); }
      else if (e.tipo === 'fin' || e.tipo === 'error') {
        if (!trabajando.delete(e.sesion)) return;
        actividad();
        const s = nucleo.sesiones?.obtener?.(e.sesion);
        if (s && s.padre) return refrescar();                // un subagente que acaba no es "tarea completa"
        if (e.tipo === 'fin') difundir({ tipo: 'flash', estado: 'listo', msg: 'LISTO', segundos: 3 });
        else difundir({ tipo: 'flash', estado: 'error', msg: 'ERROR', segundos: 4 });
      }
      refrescar();
    },
    permiso: p => {
      actividad();
      difundir({ tipo: 'permiso', id: p.id, resumen: textoPantalla(p.resumen, 60), peligro: !!p.peligro });
      difundir({ tipo: 'gesto', gesto: 'duda', segundos: 2 });
      refrescar();
    },
    'permiso-resuelto': () => refrescar(),
    // permisos externos (hooks de Claude Code): main.js avisa al aparecer ('nodo-permiso') y al resolverse/caducar ('nodo-refrescar')
    'nodo-permiso': p => { if (p && p.id !== undefined) oyentes.permiso(p); },
    'nodo-refrescar': () => refrescar(),
    'aviso-externo': () => { actividad(); difundir({ tipo: 'gesto', gesto: 'sorpresa', segundos: 1.5 }); refrescar(); },
    'nodo-estado': e => {
      if (!e || !ESTADOS.includes(e.estado)) return;
      actividad();
      if (e.flash) { externo = null; difundir({ tipo: 'flash', estado: e.estado, msg: textoPantalla(e.msg || ''), segundos: Math.min(10, +e.segundos || 3) }); return refrescar(); }
      externo ={ estado: e.estado, msg: e.msg || '', hasta: Date.now() + (e.segundos || 600) * 1000 };
      refrescar();
    },
    'nodo-gesto': e => { if (e && GESTOS.includes(e.gesto)) difundir({ tipo: 'gesto', gesto: e.gesto, segundos: Math.min(10, +e.segundos || 3), ...(e.msg !== undefined ? { msg: textoPantalla(e.msg) } : {}) }); },
    'nodo-reproducir': e => {
      if (!e) return;
      if (Buffer.isBuffer(e.pcm)) reproducir(e.nodo || null, e.pcm).catch(() => { });
      else if (e.ruta) reproducirArchivo(e.ruta, e.nodo || null).catch(() => { });
    },
  };
  for (const [ev, f] of Object.entries(oyentes)) bus.on(ev, f);

  // ---------- botón físico ----------
  function boton(c, pulsacion) {
    const p = primerPermiso();
    const nombre = c.nodo.nombre;
    if (pulsacion === 'doble') return panico(`nodo:${c.nodo.id}`);
    if (pulsacion === 'corta') {
      if (!p) { c.ws.enviarJSON({ tipo: 'gesto', gesto: 'feliz', segundos: 1.5, msg: textoPantalla(nucleo.personalidad?.nombre?.() || 'HOLA') }); actividad(); return refrescar(); }
      if (p.peligro && (p.externo || !opc().permitirPeligrosos)) {      // los de Claude Code peligrosos: NUNCA desde el ojo
        c.ws.enviarJSON({ tipo: 'flash', estado: 'permiso', msg: 'PELIGROSO: EN EL PC', segundos: 3 });
        c.ws.enviarJSON({ tipo: 'gesto', gesto: 'duda', segundos: 3 });
        return;
      }
      resolverP(p, 'allow', nombre);
      reg('info', `permiso ${p.id}`, `permitido desde ${nombre}`);
      difundir({ tipo: 'flash', estado: 'listo', msg: 'PERMITIDO', segundos: 1.5 });
      return;
    }
    if (pulsacion === 'larga' && p) {
      resolverP(p, 'deny', nombre);
      reg('info', `permiso ${p.id}`, `denegado desde ${nombre}`);
      difundir({ tipo: 'flash', estado: 'error', msg: 'DENEGADO', segundos: 1.5 });
    }
  }
  // pánico (doble pulsación): deniega todo lo pendiente, suelta el control del PC y cancela los turnos en marcha
  function panico(origen) {
    if (nucleo.panico?.activar) {                              // FASE 9: kill switch unificado (core/panico.js) — hace todo lo de abajo y más
      for (const p of externos()) resolverP(p, 'deny', 'pánico');
      nucleo.panico.activar(origen);
      difundir({ tipo: 'flash', estado: 'error', msg: 'PANICO: TODO PARADO', segundos: 3 });
      return true;
    }
    for (const p of permisos.pendientes()) permisos.resolver(p.id, 'deny', 'pánico');
    for (const p of externos()) resolverP(p, 'deny', 'pánico');
    try { nucleo.control?.soltarTodo?.('pánico desde el ojo'); } catch { }
    for (const id of [...trabajando.keys()]) { try { nucleo.agente?.cancelar?.(id); } catch { } }
    bus.emit('panico', { origen });
    reg('aviso', 'pánico', `desde ${origen}`);
    difundir({ tipo: 'flash', estado: 'error', msg: 'PANICO: TODO PARADO', segundos: 3 });
    return true;
  }

  // ---------- audio entrante (push-to-talk) ----------
  const carpetaAudio = path.join(cfg.dir, 'nodos-audio');
  async function audioFin(c) {
    const a = c.audio; c.audio = null;
    if (!a || !a.bytes) return;
    const pcm = Buffer.concat(a.partes);
    fs.mkdirSync(carpetaAudio, { recursive: true });
    try { for (const f of fs.readdirSync(carpetaAudio)) { const r = path.join(carpetaAudio, f); if (Date.now() - fs.statSync(r).mtimeMs > 3600_000) fs.unlinkSync(r); } } catch { }
    const ruta = path.join(carpetaAudio, `${c.nodo.id}-${Date.now()}.wav`);
    fs.writeFileSync(ruta, wav(pcm, a.frecuencia));
    const ms = Math.round(pcm.length / 2 / a.frecuencia * 1000);
    actividad();
    bus.emit('nodo-audio', { nodo: c.nodo.id, nombre: c.nodo.nombre, ruta, ms });
    if (typeof api.transcriptor === 'function') {           // lo pone main.js (transcribirArchivo → whisper_srv)
      try {
        const texto = String(await api.transcriptor(ruta) || '').trim();
        c.ws.enviarJSON({ tipo: 'oido', texto: textoPantalla(texto, 60) });
        if (texto) bus.emit('nodo-texto', { nodo: c.nodo.id, nombre: c.nodo.nombre, texto });
      } catch (e) { c.ws.enviarJSON({ tipo: 'oido', texto: '' }); reg('aviso', 'nodo-audio', e.message); }
    }
    return ruta;
  }

  // ---------- audio saliente (TTS): PCM s16le mono 16 kHz, a ritmo de tiempo real (el ESP32 tiene un búfer pequeño) ----------
  async function reproducir(id, pcm, frecuencia = 16000) {
    const destinos = id ? [conexiones.get(id)].filter(Boolean) : [...conexiones.values()].filter(c => c.nodo.capacidades?.includes('altavoz'));
    if (!destinos.length) return false;
    for (const c of destinos) c.ws.enviarJSON({ tipo: 'audio-inicio', frecuencia, bits: 16, canales: 1 });
    const trozo = 4096, porSeg = frecuencia * 2, ini = Date.now();
    for (let off = 0; off < pcm.length; off += trozo) {
      const adelanto = off / porSeg * 1000 - (Date.now() - ini);     // ~1 s de margen por delante
      if (adelanto > 1000) await new Promise(ok => setTimeout(ok, adelanto - 1000));
      for (const c of destinos) c.ws.enviarBinario(pcm.subarray(off, off + trozo));
    }
    for (const c of destinos) c.ws.enviarJSON({ tipo: 'audio-fin' });
    return true;
  }
  // cualquier audio (mp3 del TTS, wav…) → PCM 16 kHz con ffmpeg (está en el PATH del usuario)
  function reproducirArchivo(ruta, id = null) {
    return new Promise((ok, mal) => {
      const p = spawn(opc().ffmpeg, ['-v', 'error', '-i', ruta, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], { windowsHide: true });
      const partes = []; p.stdout.on('data', d => partes.push(d)); p.on('error', mal);
      p.on('close', code => code === 0 ? reproducir(id, Buffer.concat(partes)).then(ok, mal) : mal(new Error(`ffmpeg salió con ${code}`)));
    });
  }

  // ---------- cámara: siempre con permiso (pantalla del ojo con aro rojo + LED mientras dispara) ----------
  async function foto(id) {
    const c = conexiones.get(id);
    if (!c) throw Object.assign(new Error('ese nodo no está conectado'), { status: 404 });
    if (!c.nodo.capacidades?.includes('camara')) throw Object.assign(new Error('ese nodo no tiene cámara'), { status: 400 });
    const r = await permisos.pedirExterno({ resumen: `Hacer una foto con la cámara de ${c.nodo.nombre}`, origen: c.nodo.nombre, esperaMs: 120_000 });
    if (!r.ok) throw Object.assign(new Error('permiso denegado'), { status: 403 });
    return new Promise((ok, mal) => {
      const t = setTimeout(() => { c.esperaFoto = null; mal(new Error('el nodo no mandó la foto a tiempo')); }, 15_000);
      c.esperaFoto = { ok: b => { clearTimeout(t); ok(b); }, mal: e => { clearTimeout(t); mal(e); } };
      c.ws.enviarJSON({ tipo: 'foto' });
    }).then(jpg => {
      const dir = path.join(cfg.dir, 'capturas'); fs.mkdirSync(dir, { recursive: true });
      const ruta = path.join(dir, `ojo-${c.nodo.id}-${Date.now()}.jpg`); fs.writeFileSync(ruta, jpg);
      reg('info', `foto de ${c.nodo.nombre}`, ruta);
      return { ruta, bytes: jpg.length };
    });
  }

  // ---------- conexiones ----------
  function nuevoCodigo() { let c; do { c = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); } while (pendientes.has(c)); return c; }
  function publico(n) {
    const c = conexiones.get(n.id);
    return { id: n.id, nombre: n.nombre, modelo: n.modelo || '', version: n.version || '', capacidades: n.capacidades || [], creado: n.creado,
      conectado: !!c, ip: c?.ip || n.ultimaIp || '', ultimoVisto: c ? Date.now() : n.ultimoVisto || 0 };
  }
  function conectar(c) {                                     // nodo autenticado
    const viejo = conexiones.get(c.nodo.id);
    if (viejo && viejo.ws !== c.ws) viejo.ws.cerrar(4000, 'otra conexión del mismo nodo');
    conexiones.set(c.nodo.id, c);
    c.nodo.ultimaIp = c.ip; c.nodo.ultimoVisto = Date.now(); guardar();
    const d = new Date();
    c.ws.enviarJSON({ tipo: 'bienvenido', nombre: c.nodo.nombre, asistente: textoPantalla(nucleo.personalidad?.nombre?.() || 'APOLO'), epoch: Math.floor(d.getTime() / 1000), tz: -d.getTimezoneOffset() });
    c.ultimo = null; refrescar();
    const p = primerPermiso();
    if (p) c.ws.enviarJSON({ tipo: 'permiso', id: p.id, resumen: textoPantalla(p.resumen, 60), peligro: !!p.peligro });
    bus.emit('nodo', { tipo: 'conectado', id: c.nodo.id, nombre: c.nodo.nombre });
    reg('info', `nodo ${c.nodo.nombre}`, `conectado desde ${c.ip}`);
  }

  function alConectar(sock, ip) {
    const c = { ws: sock, ip, nodo: null, codigo: null, audio: null, foto: null, esperaFoto: null };
    const limite = setTimeout(() => { if (!c.nodo) sock.cerrar(4001, 'sin hola'); }, 10_000); limite.unref?.();
    sock.on('texto', t => {
      let m; try { m = JSON.parse(t); } catch { return sock.cerrar(1003, 'JSON inválido'); }
      if (!m || typeof m.tipo !== 'string') return;
      if (!c.nodo) {                                         // aún sin autenticar: solo vale "hola"
        if (m.tipo !== 'hola' || c.codigo) return;
        const id = String(m.id || '').replace(/[^\w-]/g, '').slice(0, 40);
        if (!id) return sock.cerrar(1008, 'falta id');
        const info = { id, nombre: String(m.nombre || id).replace(/[^\w .-]/g, '').slice(0, 40) || id, version: String(m.version || '').slice(0, 20),
          modelo: String(m.modelo || '').slice(0, 40), capacidades: (Array.isArray(m.capacidades) ? m.capacidades : []).map(String).slice(0, 10) };
        const guardado = datos.nodos.find(n => n.id === id);
        if (guardado && m.token && igualesHex(sha(m.token), guardado.tokenHash)) {
          clearTimeout(limite);
          Object.assign(guardado, { version: info.version, modelo: info.modelo, capacidades: info.capacidades });
          c.nodo = guardado; return conectar(c);
        }
        if (pendientes.size >= 5) return sock.cerrar(1013, 'demasiados emparejamientos a la vez');
        clearTimeout(limite);
        c.codigo = nuevoCodigo(); c.info = info;
        pendientes.set(c.codigo, { c, caduca: Date.now() + 5 * 60_000 });
        if (m.token) sock.enviarJSON({ tipo: 'rechazado', motivo: 'token no válido: vuelve a emparejar' });
        sock.enviarJSON({ tipo: 'emparejar', codigo: c.codigo });
        bus.emit('nodo', { tipo: 'emparejando', id, nombre: info.nombre, ip });
        reg('info', `nodo ${info.nombre}`, `quiere emparejarse desde ${ip}`);
        const t2 = setTimeout(() => { if (!c.nodo) { pendientes.delete(c.codigo); sock.cerrar(4002, 'código caducado'); } }, 5 * 60_000); t2.unref?.();
        return;
      }
      c.nodo.ultimoVisto = Date.now();
      if (m.tipo === 'boton' && ['corta', 'larga', 'doble'].includes(m.pulsacion)) return boton(c, m.pulsacion);
      if (m.tipo === 'audio-inicio') {
        const f = [8000, 16000, 22050, 24000, 44100, 48000].includes(+m.frecuencia) ? +m.frecuencia : 16000;
        c.audio = { frecuencia: f, partes: [], bytes: 0 }; c.foto = null; return;
      }
      if (m.tipo === 'audio-fin') return void audioFin(c).catch(e => reg('aviso', 'nodo-audio', e.message));
      if (m.tipo === 'foto-inicio') { c.foto = { partes: [], bytes: 0, max: Math.min(+m.bytes || 0, 2e6) }; c.audio = null; return; }
      if (m.tipo === 'foto-fin') { const f = c.foto; c.foto = null; if (f && c.esperaFoto) { c.esperaFoto.ok(Buffer.concat(f.partes)); c.esperaFoto = null; } return; }
      if (m.tipo === 'foto-error') { if (c.esperaFoto) { c.esperaFoto.mal(new Error(String(m.motivo || 'error de cámara'))); c.esperaFoto = null; } return; }
    });
    sock.on('binario', b => {
      if (!c.nodo) return sock.cerrar(1008, 'sin emparejar');
      if (c.audio) {
        const max = opc().maxAudioSeg * c.audio.frecuencia * 2;
        if (c.audio.bytes + b.length <= max) { c.audio.partes.push(b); c.audio.bytes += b.length; }
      } else if (c.foto && c.foto.bytes + b.length <= 2e6) { c.foto.partes.push(b); c.foto.bytes += b.length; }
    });
    sock.on('cerrar', () => {
      clearTimeout(limite);
      if (c.codigo) pendientes.delete(c.codigo);
      if (c.esperaFoto) c.esperaFoto.mal(new Error('el nodo se desconectó'));
      if (c.nodo && conexiones.get(c.nodo.id) === c) {
        conexiones.delete(c.nodo.id); c.nodo.ultimoVisto = Date.now(); guardar();
        bus.emit('nodo', { tipo: 'desconectado', id: c.nodo.id, nombre: c.nodo.nombre });
      }
    });
  }

  function emparejar(codigo) {
    codigo = String(codigo || '').replace(/\D/g, '');
    const ahora = Date.now(); fallos = fallos.filter(t => ahora - t < 10 * 60_000);
    if (fallos.length >= 10) throw Object.assign(new Error('demasiados intentos: espera unos minutos'), { status: 429 });
    const p = pendientes.get(codigo);
    if (!p || p.caduca < ahora || !p.c.ws.abierta) { fallos.push(ahora); throw Object.assign(new Error('código incorrecto o caducado'), { status: 400 }); }
    pendientes.delete(codigo);
    const { c } = p, info = c.info;
    const token = crypto.randomBytes(24).toString('hex');
    datos.nodos = datos.nodos.filter(n => n.id !== info.id);
    const nodo = { ...info, tokenHash: sha(token), creado: ahora };
    datos.nodos.push(nodo); guardar();
    c.codigo = null; c.nodo = nodo;
    c.ws.enviarJSON({ tipo: 'emparejado', token, nombre: nodo.nombre });
    bus.emit('nodo', { tipo: 'emparejado', id: nodo.id, nombre: nodo.nombre });
    conectar(c);
    return publico(nodo);
  }
  function borrar(id) {
    const i = datos.nodos.findIndex(n => n.id === id); if (i < 0) return false;
    datos.nodos.splice(i, 1); guardar();
    const c = conexiones.get(id); if (c) c.ws.cerrar(4003, 'olvidado desde el panel');
    bus.emit('nodo', { tipo: 'borrado', id });
    return true;
  }

  // ---------- servidor ----------
  const crudos = new Set();                                                // sockets WebSocket abiertos (identificados o no)
  function iniciar(puerto) {
    if (srv) return Promise.resolve(puertoReal);
    const o = opc();
    srv = http.createServer((req, res) => {
      if (!ipPermitida(req.socket.remoteAddress, opc())) { res.writeHead(403); return res.end(); }
      res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8', upgrade: 'websocket' }); res.end('Nodos de APOLO: conecta por WebSocket\n');
    });
    srv.on('upgrade', (req, socket, head) => {
      crudos.add(socket); socket.on('close', () => crudos.delete(socket));    // server.close() no espera a los sockets ya "subidos": hay que destruirlos a mano
      const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (!ipPermitida(ip, opc())) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); reg('aviso', 'nodos', `conexión rechazada de ${ip}`); return; }
      // FASE 9 (cross-site WebSocket hijacking): un ESP32 no manda Origin; una web cualquiera sí → solo el simulador local (file:// = "null" o localhost)
      const og = String(req.headers.origin || '');
      if (og && og !== 'null' && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(og)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); reg('aviso', 'nodos', `conexión web rechazada (origen ${og.slice(0, 80)})`); return; }
      const sock = ws.aceptar(req, socket, head, { maxBytes: 1024 * 1024 });
      if (sock) alConectar(sock, ip);
    });
    timer = setInterval(() => { refrescar(); for (const c of conexiones.values()) c.ws.ping(); }, 20_000); timer.unref?.();
    return new Promise((ok, mal) => {
      srv.once('error', e => { srv = null; clearInterval(timer); mal(e); });
      srv.listen(puerto ?? o.puerto, '0.0.0.0', () => { puertoReal = srv.address().port; ok(puertoReal); });
    });
  }
  function cerrar() {
    clearInterval(timer);
    for (const c of conexiones.values()) c.ws.cerrar(1001, 'el núcleo se apaga');
    for (const p of pendientes.values()) p.c.ws.cerrar(1001, 'el núcleo se apaga');
    conexiones.clear(); pendientes.clear();
    for (const so of crudos) so.destroy(); crudos.clear();                  // sin esto, close() se queda colgado en Node 22
    const s = srv; srv = null; puertoReal = null;
    return new Promise(ok => (s ? (s.closeAllConnections?.(), s.close(() => ok())) : ok()));
  }
  function apagarOyentes() { for (const [ev, f] of Object.entries(oyentes)) bus.off(ev, f); }
  const activo = () => datos.activo ?? !!cfg.nodos?.activo;

  // API del daemon: /v1/nodos (vía nucleo.extensiones.nodos.http)
  async function httpApi(M, p, body) {
    if (M === 'GET' && !p[2]) return { activo: activo(), escuchando: !!srv, puerto: puertoReal || opc().puerto, nodos: datos.nodos.map(publico),
      esperando: [...pendientes.values()].map(x => ({ id: x.c.info.id, nombre: x.c.info.nombre, ip: x.c.ip, caduca: x.caduca })) };
    if (M === 'POST' && p[2] === 'emparejar') return { ok: true, nodo: emparejar(body.codigo) };
    if (M === 'POST' && p[2] === 'activar') {
      datos.activo = !!body.activo; guardar();
      if (datos.activo) await iniciar(); else await cerrar();
      return { activo: datos.activo, escuchando: !!srv, puerto: puertoReal || opc().puerto };
    }
    const n = p[2] && datos.nodos.find(x => x.id === p[2]);
    if (p[2] && !n) throw Object.assign(new Error('nodo desconocido'), { status: 404 });
    if (M === 'DELETE' && n) return { ok: borrar(n.id) };
    if (M === 'PATCH' && n) { if (typeof body.nombre === 'string' && body.nombre.trim()) { n.nombre = body.nombre.trim().slice(0, 40); guardar(); } return publico(n); }
    if (M === 'POST' && n && p[3] === 'gesto') {
      const c = conexiones.get(n.id); if (!c) throw Object.assign(new Error('no está conectado'), { status: 409 });
      if (GESTOS.includes(body.gesto)) c.ws.enviarJSON({ tipo: 'gesto', gesto: body.gesto, segundos: 3 });
      else if (ESTADOS.includes(body.estado)) c.ws.enviarJSON({ tipo: 'flash', estado: body.estado, msg: textoPantalla(body.msg || ''), segundos: 3 });
      else throw Object.assign(new Error('gesto o estado desconocido'), { status: 400 });
      return { ok: true };
    }
    if (M === 'POST' && n && p[3] === 'foto') return foto(n.id);
    throw Object.assign(new Error('ruta'), { status: 404 });
  }

  const api = {
    iniciar, cerrar, apagarOyentes, activo, http: httpApi, emparejar, borrar, panico, foto, reproducir, reproducirArchivo, estadoActual,
    lista: () => datos.nodos.map(publico), conectados: () => [...conexiones.keys()],
    enviar: (id, msg) => { const c = conexiones.get(id); return c ? c.ws.enviarJSON(msg) : false; },
    puerto: () => puertoReal,
    transcriptor: null,          // main.js: ruta → texto (whisper_srv vía transcribirArchivo)
    permisosExternos: null,      // main.js: { pendientes: () => [{id, resumen, peligro, creado}], resolver: (id, decision, via) => bool } (hooks de Claude Code)
  };
  return api;
}

module.exports = { crearNodos, ipPermitida, enCidr, textoPantalla, wav, ESTADOS, GESTOS };
