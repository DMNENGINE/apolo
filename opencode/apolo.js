// Plugin de APOLO para opencode (https://opencode.ai): opencode como "motor" del robot, igual que Claude Code o Gemini CLI.
// Se instala copiándolo a ~/.config/opencode/plugins/apolo.js (bandeja de APOLO → "Instalar en opencode").
//
//  - Permisos: opencode publica "permission.asked" → se manda a APOLO (isla, Stream Deck, móvil, ojo, reglas "Permitir siempre",
//    avisos de peligro) y la decisión vuelve a opencode. Si contestas antes en la terminal de opencode, la tarjeta se retira sola.
//  - Actividad: prompt, herramientas y fin de turno mueven el casco y la lista de terminales de la isla.
//
// Regla de oro (como hook/hook.js): NUNCA bloquear a opencode. Si APOLO no está abierto, todo falla al momento y en silencio;
// si nadie contesta a tiempo, opencode sigue preguntando en su terminal como siempre.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'

const PUERTO = +process.env.APOLO_HOOK_PUERTO || 47823        // el puerto lo cambian solo las pruebas
const ESPERA_PERMISO_MS = 110_000
const ESPERA_EVENTO_MS = 1_500
const MAX = 2000

const recorta = v => typeof v === 'string' ? (v.length > MAX ? v.slice(0, MAX) + '…' : v)
  : Array.isArray(v) ? v.map(recorta)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorta(x)])) : v

function token() {
  if (process.env.APOLO_HOOK_TOKEN) return process.env.APOLO_HOOK_TOKEN   // pruebas
  try { return readFileSync(join(homedir(), '.claude', 'robot-companion.token'), 'utf8').trim() } catch { return '' }
}

async function enviar(ev, { senal, espera = ESPERA_EVENTO_MS } = {}) {
  const t = token(); if (!t) return null
  const ctl = new AbortController()
  const tiempo = setTimeout(() => ctl.abort(), espera)
  const cortar = () => ctl.abort()
  senal?.addEventListener('abort', cortar)
  try {
    const r = await fetch(`http://127.0.0.1:${PUERTO}/event`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-robot-token': t },
      body: JSON.stringify(recorta(ev)), signal: ctl.signal,
    })
    return (await r.text()).trim()
  } catch { return null } finally { clearTimeout(tiempo); senal?.removeEventListener('abort', cortar) }
}

// herramienta de opencode → nombre/entrada de Claude Code (los que entiende la isla, las reglas y el detector de peligro)
export function herramienta(nombre, a = {}) {
  switch (nombre) {
    case 'bash': return ['Bash', { command: a.command, description: a.description }]
    case 'write': return ['Write', { file_path: a.filePath, content: a.content }]
    case 'edit': return ['Edit', { file_path: a.filePath, old_string: a.oldString, new_string: a.newString }]
    case 'apply_patch': case 'patch': return ['Edit', { file_path: a.filePath || '(parche)', patch: a.patchText || a.patch }]
    case 'read': return ['Read', { file_path: a.filePath }]
    case 'glob': return ['Glob', { pattern: a.pattern }]
    case 'grep': return ['Grep', { pattern: a.pattern }]
    case 'list': return ['Glob', { pattern: a.path || '.' }]
    case 'webfetch': return ['WebFetch', { url: a.url }]
    case 'websearch': return ['WebSearch', { query: a.query }]
    case 'task': return ['Task', { description: a.description, prompt: a.prompt }]
    case 'todowrite': case 'todoread': return ['TodoWrite', {}]
    default: return [nombre, a]
  }
}

// petición de permiso de opencode → herramienta/entrada de Claude Code
export function permiso(p) {
  const m = p.metadata || {}, pat = p.patterns || []
  switch (p.permission) {
    case 'bash': return ['Bash', { command: m.command || pat.join(' ') }]
    case 'edit': return ['Edit', { file_path: m.filepath || pat[0], diff: m.diff }]
    case 'webfetch': return ['WebFetch', { url: m.url || pat[0] }]
    case 'websearch': return ['WebSearch', { query: m.query || pat[0] }]
    case 'external_directory': return ['Read', { file_path: (m.patterns || pat).join(', '), fuera_del_proyecto: true }]
    case 'read': return ['Read', { file_path: m.filepath || pat[0] }]
    case 'doom_loop': return ['Bucle', { aviso: 'opencode cree que el agente está en bucle (misma herramienta repetida)', ...m }]
    default: return [p.permission, { patrones: pat.join(', '), ...m }]
  }
}

// respuesta de APOLO (formato hook de Claude Code) → "once" | "reject" | null (nadie contestó)
export function decision(salida) {
  if (!salida) return null
  try { const d = JSON.parse(salida)?.hookSpecificOutput?.decision; return d ? (d.behavior === 'allow' ? 'once' : 'reject') : null } catch { return null }
}

export const ApoloPlugin = async ({ client, directory }) => {
  if (process.env.ROBOT_INTERNAL) return {}
  const pid = process.pid                                   // opencode mismo: la isla sube por sus padres hasta la terminal
  const base = sid => ({ session_id: `opencode:${sid || '?'}`, cwd: directory, _motor: 'opencode', _ppid: pid })
  const abiertos = new Map()                                // permiso de opencode → AbortController de su petición a APOLO
  const paradas = new Map()                                 // sesión → último "Stop" enviado

  async function preguntar(p) {
    const [tool_name, tool_input] = permiso(p)
    const ctl = new AbortController(); abiertos.set(p.id, ctl)
    const salida = await enviar({ ...base(p.sessionID), hook_event_name: 'PermissionRequest', tool_name, tool_input }, { senal: ctl.signal, espera: ESPERA_PERMISO_MS })
    const yaContestado = !abiertos.has(p.id)                // lo contestaron en la terminal de opencode
    abiertos.delete(p.id)
    const r = decision(salida)
    if (!r || yaContestado) return
    try {
      await client.postSessionIdPermissionsPermissionId({ path: { id: p.sessionID, permissionID: p.id }, body: { response: r } })
    } catch { }
  }

  return {
    event: async ({ event: e }) => {
      const x = e.properties || {}
      if (e.type === 'permission.asked') { preguntar(x); return }
      if (e.type === 'permission.replied') {                // contestado en opencode: retirar la tarjeta de la isla
        const id = x.requestID || x.permissionID || x.id
        const ctl = abiertos.get(id); if (ctl) { abiertos.delete(id); ctl.abort() }
        return
      }
      if (e.type === 'session.idle' || (e.type === 'session.status' && x.status?.type === 'idle')) {
        const ult = paradas.get(x.sessionID) || 0               // llegan los dos eventos: un solo "Stop"
        if (Date.now() - ult < 3000) return
        paradas.set(x.sessionID, Date.now())
        enviar({ ...base(x.sessionID), hook_event_name: 'Stop' })
        return
      }
      if (e.type === 'session.error') { enviar({ ...base(x.sessionID), hook_event_name: 'StopFailure', error: String(x.error?.data?.message || x.error?.name || 'error') }); return }
      if (e.type === 'session.created' && !x.info?.parentID) enviar({ ...base(x.info?.id), hook_event_name: 'SessionStart', titulo: x.info?.title })
    },
    'chat.message': async (entrada, salida) => {
      const texto = (salida.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n')
      enviar({ ...base(entrada.sessionID), hook_event_name: 'UserPromptSubmit', prompt: texto, _proyecto: basename(directory || '') })
    },
    'tool.execute.before': async (entrada, salida) => {
      const [tool_name, tool_input] = herramienta(entrada.tool, salida.args)
      enviar({ ...base(entrada.sessionID), hook_event_name: 'PreToolUse', tool_name, tool_input })
    },
    'tool.execute.after': async entrada => {
      const [tool_name, tool_input] = herramienta(entrada.tool, entrada.args)
      enviar({ ...base(entrada.sessionID), hook_event_name: 'PostToolUse', tool_name, tool_input })
    },
  }
}

// formato v1 de opencode: solo cuenta el export por defecto (con el formato antiguo cada export se cargaría como plugin)
export default { id: 'apolo', server: ApoloPlugin }
