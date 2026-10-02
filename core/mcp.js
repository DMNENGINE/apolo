#!/usr/bin/env node
// Servidor MCP de Robot Companion (stdio, JSON-RPC 2.0, sin dependencias).
// Cualquier agente compatible con MCP (Antigravity, Cursor, Claude Desktop, Claude Code…) puede usar al robot:
// avisarte, pedirte permiso por tus canales, la memoria compartida, tareas y consultar a otros modelos.
// Es un cliente fino del núcleo: el núcleo (app de escritorio o `node daemon.js`) tiene que estar corriendo.
//   Config del cliente MCP:  { "command": "node", "args": ["<ruta>/core/mcp.js"] }
const fs = require('fs');
const path = require('path');
const { cargarConfig } = require('./config');
const { version } = require('./package.json');

const cfg = cargarConfig();
const BASE = `http://127.0.0.1:${cfg.puerto}/v1`;
const ORIGEN = process.env.ROBOT_MCP_ORIGEN || 'agente MCP';
const token = () => { try { return fs.readFileSync(path.join(cfg.dir, 'token'), 'utf8').trim(); } catch { return ''; } };
const log = (...a) => process.stderr.write(`[robot-mcp] ${a.join(' ')}\n`);

async function api(metodo, ruta, cuerpo, ms = 30_000) {
  let r;
  try {
    r = await fetch(BASE + ruta, { method: metodo, headers: { 'x-robot-token': token(), 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(ms) });
  } catch (e) { throw new Error(e.name === 'TimeoutError' ? 'el robot tardó demasiado' : 'el robot no está encendido (abre Robot Companion o `node daemon.js`)'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function consultar(modelo, pregunta) {
  const s = await api('POST', '/sesiones', { modelo: modelo || undefined, canal: 'mcp', titulo: `🔌 ${pregunta.slice(0, 50)}` });
  const r = await fetch(`${BASE}/sesiones/${s.id}/mensajes`, { method: 'POST', headers: { 'x-robot-token': token(), 'content-type': 'application/json' }, body: JSON.stringify({ texto: pregunta }), signal: AbortSignal.timeout(300_000) });
  const txt = await r.text();
  let final = '', error = '';
  for (const l of txt.split('\n')) if (l.startsWith('data: ')) { try { const e = JSON.parse(l.slice(6)); if (e.tipo === 'fin') final = e.texto; if (e.tipo === 'error') error = e.error; } catch { } }
  if (error) throw new Error(error);
  return `[${s.modelo}] ${final || '(sin respuesta)'}`;
}

const HERRAMIENTAS = [
  {
    name: 'robot_avisar', description: 'Avisa al usuario a través de su robot de escritorio (lo dice en voz alta en la isla) y por Discord en el móvil si es urgente o no está en el PC. Úsalo al terminar algo largo o si necesitas su atención.',
    inputSchema: { type: 'object', properties: { mensaje: { type: 'string' }, urgente: { type: 'boolean' } }, required: ['mensaje'] },
    run: async a => { const r = await api('POST', '/externo/aviso', { texto: a.mensaje, urgente: !!a.urgente, origen: ORIGEN }); return r.entregado ? 'Aviso entregado al usuario.' : 'Aviso registrado (la app de escritorio no está abierta).'; },
  },
  {
    name: 'robot_pedir_permiso', description: 'Pide permiso al usuario ANTES de hacer algo delicado (borrar, publicar, gastar, tocar producción). Le llega a la isla de escritorio, Discord y Stream Deck, y esta herramienta espera su respuesta (hasta 5 min). Respeta la respuesta: si es DENEGADO, no lo hagas.',
    inputSchema: { type: 'object', properties: { accion: { type: 'string', description: 'Qué vas a hacer, concreto (comando, archivo, etc.)' }, peligro: { type: 'string', description: 'Opcional: por qué es arriesgado' } }, required: ['accion'] },
    run: async a => { const r = await api('POST', '/externo/permiso', { resumen: a.accion, peligro: a.peligro || '', origen: ORIGEN }, 320_000); return r.permitido ? 'PERMITIDO por el usuario.' : `DENEGADO${r.motivo ? ` (${r.motivo})` : ''}. No lo hagas.`; },
  },
  {
    name: 'robot_recordar', description: 'Guarda un dato duradero sobre el usuario en la memoria compartida del robot (la usan todos sus modelos y canales). Un dato por llamada. Nunca contraseñas ni claves.',
    inputSchema: { type: 'object', properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: ['perfil', 'preferencia', 'proyecto', 'persona', 'hecho'] } }, required: ['texto'] },
    run: async a => { const r = await api('POST', '/memoria', { texto: a.texto, tipo: a.tipo || 'hecho' }); return `Recuerdo ${r.id} ${r.accion}.`; },
  },
  {
    name: 'robot_buscar_memoria', description: 'Busca en la memoria del robot lo que sabe del usuario (preferencias, proyectos, personas, datos).',
    inputSchema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] },
    run: async a => (await api('GET', '/memoria?q=' + encodeURIComponent(a.consulta))).slice(0, 15).map(m => `- [${m.tipo}] ${m.texto}`).join('\n') || 'No hay nada guardado sobre eso.',
  },
  {
    name: 'robot_programar', description: 'Programa un recordatorio para el usuario (tipo aviso) o una tarea que hará el robot con sus modelos (tipo agente). Usa UNO de: en ("YYYY-MM-DDTHH:mm" hora local), cron (5 campos) o cadaMin.',
    inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, tipo: { type: 'string', enum: ['aviso', 'agente'] }, texto: { type: 'string' }, en: { type: 'string' }, cron: { type: 'string' }, cadaMin: { type: 'number' }, soloSiHayAlgo: { type: 'boolean' } }, required: ['tipo', 'texto'] },
    run: async a => {
      const cuando = a.en ? { en: a.en } : a.cron ? { cron: a.cron } : a.cadaMin ? { cadaMin: a.cadaMin } : null;
      if (!cuando) throw new Error('indica en, cron o cadaMin');
      const accion = { tipo: a.tipo, texto: a.texto, ...(a.tipo === 'agente' ? { soloSiHayAlgo: !!a.soloSiHayAlgo } : {}) };
      const t = await api('POST', '/tareas', { nombre: a.nombre, cuando, accion, canal: 'isla' });
      return `Tarea ${t.id} creada; próxima: ${new Date(t.proxima).toLocaleString('es')}.`;
    },
  },
  {
    name: 'robot_ver_tareas', description: 'Lista los recordatorios y tareas programadas del robot.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => (await api('GET', '/tareas')).map(t => `${t.id} · ${t.activa ? 'activa' : 'pausada'} · ${t.nombre} · próxima ${t.proxima ? new Date(t.proxima).toLocaleString('es') : '—'}`).join('\n') || 'No hay tareas.',
  },
  {
    name: 'robot_borrar_tarea', description: 'Borra una tarea programada por su id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async a => { await api('DELETE', `/tareas/${encodeURIComponent(a.id)}`); return `Tarea ${a.id} borrada.`; },
  },
  {
    name: 'robot_consultar', description: 'Pregunta a otro modelo de IA del robot (segunda opinión, o un modelo local/gratis). modelo: "proveedor/modelo" (ej. ollama/gemma4:31b-cloud) o vacío para el de por defecto. El modelo puede usar las herramientas del robot (con permiso del usuario).',
    inputSchema: { type: 'object', properties: { pregunta: { type: 'string' }, modelo: { type: 'string' } }, required: ['pregunta'] },
    run: async a => consultar(a.modelo, a.pregunta),
  },
  {
    name: 'robot_estado', description: 'Estado del robot y del PC del usuario: modelo por defecto, permisos pendientes, CPU, memoria y disco.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const [e, s] = await Promise.all([api('GET', '/estado'), api('GET', '/sistema')]);
      const pct = (a, b) => Math.round((1 - a / b) * 100);
      return [`Robot Companion núcleo v${e.version} · modelo por defecto ${e.modeloPorDefecto} · permisos pendientes: ${e.permisos.length}`,
        `PC ${s.host}: CPU ${Math.round(s.cpu.uso * 100)}% · RAM ${pct(s.memoria.libre, s.memoria.total)}% · disco ${s.disco ? pct(s.disco.libre, s.disco.total) + '%' : '?'}`].join('\n');
    },
  },
];

// ---------- JSON-RPC por stdio ----------
const enviar = m => process.stdout.write(JSON.stringify(m) + '\n');
const responder = (id, result) => enviar({ jsonrpc: '2.0', id, result });
const fallar = (id, code, message) => enviar({ jsonrpc: '2.0', id, error: { code, message } });

async function manejar(m) {
  if (m.id === undefined) return;                                // notificación (initialized, cancelled…)
  switch (m.method) {
    case 'initialize':
      return responder(m.id, {
        protocolVersion: m.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'robot-companion', version },
        instructions: 'Robot Companion es el asistente de escritorio del usuario. Usa robot_pedir_permiso antes de acciones delicadas y robot_avisar al terminar trabajos largos.',
      });
    case 'ping': return responder(m.id, {});
    case 'tools/list': return responder(m.id, { tools: HERRAMIENTAS.map(({ run, ...h }) => h) });
    case 'tools/call': {
      const h = HERRAMIENTAS.find(x => x.name === m.params?.name);
      if (!h) return fallar(m.id, -32602, `herramienta desconocida: ${m.params?.name}`);
      try { return responder(m.id, { content: [{ type: 'text', text: String(await h.run(m.params.arguments || {})) }] }); }
      catch (e) { return responder(m.id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }); }
    }
    default: return fallar(m.id, -32601, `método no soportado: ${m.method}`);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l) continue;
    let m; try { m = JSON.parse(l); } catch { fallar(null, -32700, 'JSON inválido'); continue; }
    manejar(m).catch(e => log('error', e.message));
  }
});
process.stdin.on('end', () => process.exit(0));
log(`listo · núcleo en ${BASE} · origen "${ORIGEN}"`);
