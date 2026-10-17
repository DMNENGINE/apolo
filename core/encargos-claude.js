// Encargos a Claude Code: APOLO le pasa a Claude Code (la CLI del usuario, su plan) un trabajo de verdad — programar, arreglar,
// montar un proyecto, investigar a fondo — como un agente completo con sus propias herramientas, en la carpeta que toque.
// No bloquea: se lanza en segundo plano (`claude -p … --output-format stream-json`), y al terminar el resultado entra en la
// conversación de APOLO que lo pidió + aviso. Va con los hooks del usuario: la isla lo enseña en vivo, los permisos se
// contestan como siempre y el espejo (core/espejo-cc.js) lo guarda en el historial. "continuar" sigue la misma sesión (--resume).
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const MODELOS = { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' };
const INSTRUCCION = 'Te escribe APOLO, el asistente personal del usuario, con un encargo del usuario. Hazlo de principio a fin como harías en la terminal ' +
  '(investiga, programa, prueba). Al acabar, responde en español con un resumen corto y claro para el usuario: qué hiciste, dónde quedó y qué falta, si falta algo.';

function crearEncargosClaude({ cfg, sesiones, bus, log = () => { }, lanzar = spawn }) {
  const conf = () => ({ comando: 'claude', modelo: 'opus', permisos: 'auto', max: 2, minutos: 120, ...(cfg.claudeCode || {}) });
  const encargos = new Map();                          // id → { id, tarea, cwd, modelo, estado, sesionCC, inicio, fin, resultado, coste, sesionApolo }
  const vivos = () => [...encargos.values()].filter(e => e.estado === 'trabajando');

  // continuar: true (el último de esa conversación de APOLO) o el id de sesión de Claude Code a seguir; alTerminar(e): p. ej. responder por Discord
  function encargar({ tarea, cwd, modelo, continuar, sesionApolo, alTerminar }) {
    tarea = String(tarea || '').trim();
    if (!tarea) throw new Error('falta el encargo');
    const c = conf();
    if (vivos().length >= c.max) throw new Error(`Claude Code ya tiene ${vivos().length} encargos en marcha (máximo ${c.max}); espera a que acabe uno`);
    const previo = typeof continuar === 'string' ? continuar : continuar && sesionApolo?.encargoClaude?.sesionCC;
    const e = { id: `enc-${Date.now().toString(36)}`, tarea: tarea.slice(0, 300), cwd: path.resolve(cwd || sesionApolo?.encargoClaude?.cwd || os.homedir()),
      modelo: MODELOS[modelo] || c.modelo, estado: 'trabajando', inicio: Date.now(), sesionApolo: sesionApolo?.id || null, sesionCC: previo || null, pasos: 0 };
    if (!fs.existsSync(e.cwd)) throw new Error(`no existe la carpeta ${e.cwd}`);
    encargos.set(e.id, e);
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', e.modelo, '--permission-mode', c.permisos,
      '--append-system-prompt', INSTRUCCION, ...(previo ? ['--resume', previo] : [])];
    const env = { ...process.env }; delete env.ROBOT_INTERNAL;     // sin esto los hooks no saltan (la isla y el espejo no lo verían)
    let hijo;
    try { hijo = lanzar(c.comando, args, { cwd: e.cwd, env, windowsHide: true }); }
    catch (er) { e.estado = 'error'; e.resultado = er.message; encargos.set(e.id, e); throw new Error(`no pude lanzar Claude Code: ${er.message}`); }
    let buf = '', fin = null;
    hijo.stdout.on('data', d => {
      buf += d; let k;
      while ((k = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, k); buf = buf.slice(k + 1);
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.session_id && !e.sesionCC) e.sesionCC = j.session_id;
        if (j.type === 'assistant') e.pasos++;
        if (j.type === 'result') fin = j;
      }
    });
    let err = ''; hijo.stderr.on('data', d => { err = (err + d).slice(-2000); });
    const tope = setTimeout(() => { try { hijo.kill(); } catch { } }, c.minutos * 60_000);
    const terminar = (codigo) => {
      clearTimeout(tope);
      if (e.estado !== 'trabajando') return;
      e.fin = Date.now(); e.coste = fin?.total_cost_usd;
      const ok = fin && !fin.is_error;
      e.estado = ok ? 'listo' : 'error';
      e.resultado = String(fin?.result || err.trim() || `Claude Code salió con código ${codigo}`).slice(0, 6000);
      const s = e.sesionApolo && sesiones.obtener(e.sesionApolo);
      if (s) {
        s.encargoClaude = { sesionCC: e.sesionCC, cwd: e.cwd, t: e.fin };
        sesiones.agregar(s, { role: 'assistant', content: `${ok ? '✅ Claude Code terminó' : '❌ Claude Code no pudo terminar'} (${Math.round((e.fin - e.inicio) / 60000)} min):\n\n${e.resultado}`, t: e.fin, encargo: e.id });
        sesiones.guardarMeta(s);
      }
      bus?.emit('encargo-claude', publico(e));
      if (alTerminar) { try { alTerminar(publico(e)); } catch (er) { log('[encargos] alTerminar', er.message); } }
      else bus?.emit('aviso-externo', { origen: 'Claude Code', urgente: false, texto: `${ok ? '✅' : '❌'} ${e.tarea.slice(0, 80)} — ${e.resultado.split('\n').find(x => x.trim())?.slice(0, 200) || ''}` });
    };
    hijo.on('close', terminar);
    hijo.on('error', er => { err += er.message; terminar(-1); });
    hijo.stdin.on('error', () => { });
    hijo.stdin.end(tarea);                              // el encargo por stdin (la línea de comandos de Windows se queda corta)
    bus?.emit('encargo-claude', publico(e));
    return publico(e);
  }

  const publico = e => ({ ...e });
  const lista = () => [...encargos.values()].sort((a, b) => b.inicio - a.inicio).slice(0, 30).map(publico);

  const HERRAMIENTA = {
    nombre: 'encargar_a_claude', riesgo: 'escritura',
    descripcion: 'Encarga un TRABAJO DE VERDAD a Claude Code (el agente de programación del usuario, con su plan): programar o arreglar código, crear o cambiar un proyecto, '
      + 'una app o una web, investigar algo a fondo, tareas largas de varios pasos en el PC. Trabaja solo en segundo plano con sus propias herramientas; la isla lo enseña '
      + 'y al terminar su resumen llega a esta conversación. NO lo uses para preguntas rápidas, charla, buscar un dato o un precio (eso lo haces tú). '
      + 'continuar = true sigue el último encargo de esta conversación ("y añade también…").',
    parametros: { type: 'object', properties: {
      tarea: { type: 'string', description: 'el encargo completo, con todo el contexto que necesite (qué, dónde, cómo debe quedar)' },
      carpeta: { type: 'string', description: 'carpeta del proyecto (por defecto la del usuario: Claude Code ya conoce sus proyectos por su memoria)' },
      modelo: { type: 'string', enum: Object.keys(MODELOS), description: 'opus (por defecto, lo más capaz) · sonnet (más rápido) · haiku (cosas pequeñas)' },
      continuar: { type: 'boolean' },
    }, required: ['tarea'] },
    resumen: a => String(a.tarea || '').slice(0, 60),
    ejecutar: async (a, ctx = {}) => {
      const e = encargar({ tarea: a.tarea, cwd: a.carpeta ? path.resolve(ctx.cwd || os.homedir(), a.carpeta) : undefined, modelo: a.modelo, continuar: !!a.continuar, sesionApolo: ctx.sesion });
      return `Encargado a Claude Code (${e.modelo}, en ${e.cwd}). Está trabajando en segundo plano: la isla lo enseña y su resumen llegará a esta conversación al terminar. Díselo al usuario en una frase.`;
    },
  };

  return { encargar, lista, HERRAMIENTA };
}

module.exports = { crearEncargosClaude, INSTRUCCION };
