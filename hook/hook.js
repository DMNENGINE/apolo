#!/usr/bin/env node
// Relé que el CLI de agentes (Claude Code, Gemini CLI…) ejecuta en cada evento de hook.
// Lee el JSON de stdin y se lo pasa a la app por HTTP local (127.0.0.1).
//   node hook.js <Evento>                  Claude Code (formato nativo del robot)
//   node hook.js <Evento> --motor=gemini   Gemini CLI (se traduce con motores.js)
//
// Regla de oro: NUNCA bloquear al agente.
//  - Si la app no está abierta, la conexión falla al instante y salimos con 0 sin imprimir nada.
//  - Solo los permisos esperan respuesta (Permitir/Denegar desde el robot).
//    Si nadie contesta a tiempo, salimos sin imprimir y el agente pregunta en la terminal como siempre.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47823;
const DECISION_BUDGET_MS = 110_000;   // el hook tiene timeout 120 s
const FIRE_BUDGET_MS = 1_500;
const MAX_FIELD = 2000;
const DROPPED = ['tool_response', 'llm_request', 'llm_response'];    // pueden ser enormes y el robot no los usa

if (process.env.ROBOT_INTERNAL) process.exit(0);   // llamadas internas del robot: no son sesiones tuyas
const event = process.argv[2] || '';
const motor = (process.argv.find(a => a.startsWith('--motor=')) || '--motor=claude').slice(8);
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', run);
setTimeout(() => process.exit(0), DECISION_BUDGET_MS + 2000).unref();   // red de seguridad

function trim(v) {
  if (typeof v === 'string') return v.length > MAX_FIELD ? v.slice(0, MAX_FIELD) + '…' : v;
  if (Array.isArray(v)) return v.map(trim);
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = trim(v[k]); }
  return v;
}

function enviar(token, data) {
  const waits = data.hook_event_name === 'PermissionRequest';
  const body = JSON.stringify(data);
  return new Promise(ok => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/event', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-robot-token': token },
      timeout: waits ? DECISION_BUDGET_MS : FIRE_BUDGET_MS,
    }, res => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', c => { out += c; });
      res.on('end', () => ok(out.trim()));
    });
    req.on('error', () => ok(null));               // app cerrada -> el agente sigue como si nada
    req.on('timeout', () => { req.destroy(); ok(null); });
    req.end(body);
  });
}

async function run() {
  let data;
  try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  for (const k of DROPPED) delete data[k];
  data = trim(data);
  let token = '';
  try { token = fs.readFileSync(path.join(os.homedir(), '.claude', 'robot-companion.token'), 'utf8').trim(); } catch { process.exit(0); }   // app nunca abierta
  data.hook_event_name = data.hook_event_name || event;

  if (motor === 'gemini') {
    const { traducirGemini, salidaGemini } = require('./motores');
    for (const ev of traducirGemini(data)) {
      ev._ppid = process.ppid;
      const out = await enviar(token, ev);
      if (out === null) process.exit(0);              // la app no está
      if (ev.hook_event_name === 'PermissionRequest') { const s = salidaGemini(out); if (s) process.stdout.write(s + '\n'); }
    }
    process.exit(0);
  }

  data._ppid = process.ppid;                       // para encontrar la ventana de la terminal
  const out = await enviar(token, data);
  if (data.hook_event_name === 'PermissionRequest' && out) process.stdout.write(out + '\n');
  process.exit(0);
}
