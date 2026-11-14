// Plugin de APOLO para DeepSeek Harness (Cordis, mitad HOST): DeepSeek pasa por APOLO como Claude Code, Codex u opencode.
// Escucha el canal `session/event` (el mismo que usa DeepSeek para guardar sus sesiones) y manda cada paso a APOLO
// (http://127.0.0.1:47823/event, formato de hook de Claude Code, _motor 'deepseek'):
//   user/message (del usuario) → UserPromptSubmit · tool/call → PreToolUse · turn/end → Stop (con la última respuesta)
// Con eso APOLO lo ve en vivo (isla, Mission Control, casco) y aprende de la sesión al momento, no a la noche.
// Los permisos NO pasan por aquí: los decide el preajuste de permisos de DeepSeek.
// Regla de oro: NUNCA bloquear ni romper a DeepSeek. Si APOLO no está abierto, todo falla al momento y en silencio.
// Lo instala APOLO (main/hooks-config.js deepseek()) en ~/.dsh/profiles/desktop/node_modules/apolo-puente.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const name = 'apolo-puente'
const PUERTO = +process.env.APOLO_HOOK_PUERTO || 47823
const MAX = 2000

const recorta = v => typeof v === 'string' ? (v.length > MAX ? v.slice(0, MAX) + '…' : v)
  : Array.isArray(v) ? v.map(recorta)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorta(x)])) : v

function token() {
  if (process.env.APOLO_HOOK_TOKEN) return process.env.APOLO_HOOK_TOKEN
  try { return readFileSync(join(homedir(), '.claude', 'robot-companion.token'), 'utf8').trim() } catch { return '' }
}

async function enviar(ev) {
  const t = token(); if (!t) return
  try {
    await fetch(`http://127.0.0.1:${PUERTO}/event`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-robot-token': t },
      body: JSON.stringify(recorta(ev)), signal: AbortSignal.timeout(1500),
    })
  } catch { }
}

const textoDe = partes => (partes || []).filter(p => p?.type === 'text' && p.text).map(p => p.text).join('\n').trim()
const args = a => { if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}') } catch { return { argumentos: String(a || '') } } }

// herramienta de DeepSeek Harness → nombre/entrada de Claude Code (lo que entienden la isla y el detector de peligro)
export function herramienta(nombre, a = {}) {
  switch (nombre) {
    case 'pwsh': case 'bash': case 'shell': return ['Bash', { command: a.command, description: a.description }]
    case 'write': return ['Write', { file_path: a.path || a.filePath || a.file_path, content: a.content }]
    case 'edit': case 'patch': return ['Edit', { file_path: a.path || a.filePath || a.file_path }]
    case 'read': case 'read_image': return ['Read', { file_path: a.path || a.filePath || a.file_path }]
    case 'grep': return ['Grep', { pattern: a.pattern }]
    case 'glob': case 'list': return ['Glob', { pattern: a.pattern || a.path || '.' }]
    case 'web_search': case 'websearch': return ['WebSearch', { query: a.query }]
    case 'web_fetch': case 'webfetch': return ['WebFetch', { url: a.url }]
    default: return [nombre, a]
  }
}

// evento de la sesión → evento de hook para APOLO (null = no se manda). `estado` guarda la última respuesta por sesión.
export function traducir(sesion, ev, estado = new Map()) {
  const sid = sesion?.id || '?', d = ev?.data || {}
  if (sesion?.delegationDepth > 0 || sesion?.meta?.delegationDepth > 0) return null      // subagentes de DeepSeek: solo la sesión principal
  const cwd = sesion?.cwd || sesion?.meta?.cwd || d.meta?.cwd || estado.get(`cwd:${sid}`) || ''
  if (cwd) estado.set(`cwd:${sid}`, cwd)
  const base = { session_id: `deepseek:${sid}`, cwd, _motor: 'deepseek', _ppid: process.pid }
  switch (ev?.type) {
    case 'user/message': {
      if (d.source?.kind && d.source.kind !== 'user') return null
      const t = textoDe(d.content); return t ? { ...base, hook_event_name: 'UserPromptSubmit', prompt: t } : null
    }
    case 'assistant/message': { const t = textoDe(d.message?.content); if (t) estado.set(`ult:${sid}`, t); return null }
    case 'tool/call': { const [tool_name, tool_input] = herramienta(d.name, args(d.arguments)); return { ...base, hook_event_name: 'PreToolUse', tool_name, tool_input } }
    case 'turn/end': {
      const ult = estado.get(`ult:${sid}`) || ''; estado.delete(`ult:${sid}`)
      const k = d.reason?.kind
      if (k && k !== 'completed') return { ...base, hook_event_name: 'StopFailure', error: String(d.reason?.error?.message || k), last_assistant_message: ult }
      return { ...base, hook_event_name: 'Stop', last_assistant_message: ult }
    }
    default: return null
  }
}

function apply(ctx) {
  if (process.env.ROBOT_INTERNAL) return
  const estado = new Map()
  ctx.on('session/event', (sesion, ev) => {
    try { const x = traducir(sesion, ev, estado); if (x) enviar(x) } catch { }   // jamás romper el registro de DeepSeek
  })
}

export { apply, name }
