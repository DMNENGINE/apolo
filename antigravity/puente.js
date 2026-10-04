#!/usr/bin/env node
// Puente Robot Companion → Antigravity.
// Lo arranca EL AGENTE de Antigravity (así hereda las variables que Antigravity da a sus agentes para usar agentapi):
//   Start-Process node -ArgumentList '<carpeta de APOLO>/antigravity/puente.js' -WindowStyle Hidden
// Escucha los encargos del robot ("antigravity: …" desde la isla, Discord o voz) y los convierte en conversaciones
// nuevas de Antigravity. La respuesta vuelve al robot por MCP (robot_avisar).
// No lee archivos internos de Antigravity: solo usa lo que Antigravity pone en el entorno de su agente.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const LOG = path.join(os.tmpdir(), 'robot-antigravity-puente.log');
const log = (...a) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${a.join(' ')}\n`);

if (!process.env.ANTIGRAVITY_LS_ADDRESS) {
  log('no arrancado: falta ANTIGRAVITY_LS_ADDRESS (hay que pedírselo al AGENTE de Antigravity, no ejecutarlo en una terminal normal)');
  console.error('Este puente lo tiene que arrancar el agente de Antigravity (falta ANTIGRAVITY_LS_ADDRESS).');
  process.exit(1);
}
const AGENTAPI = process.env.ANTIGRAVITY_AGENTAPI_EXE
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity', 'resources', 'bin', 'language_server.exe');
const MODELO = process.env.ROBOT_AG_MODELO || 'flash';           // flash_lite | flash | pro

// núcleo del robot
const datos = process.env.NUCLEO_HOME || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'robot-companion', 'nucleo');
let puerto = 47900; try { puerto = JSON.parse(fs.readFileSync(path.join(datos, 'config.json'), 'utf8')).puerto || 47900; } catch { }
const BASE = `http://127.0.0.1:${puerto}/v1`;
const token = () => fs.readFileSync(path.join(datos, 'token'), 'utf8').trim();

function agentapi(args) {
  return new Promise(ok => execFile(AGENTAPI, ['agentapi', ...args], { windowsHide: true, timeout: 60_000, maxBuffer: 4 << 20 }, (err, out) => {
    let j = null; try { j = JSON.parse(out); } catch { }
    ok(j || { error: err ? err.message : 'salida no válida' });
  }));
}
async function avisar(texto, urgente = false) {
  try { await fetch(`${BASE}/externo/aviso`, { method: 'POST', headers: { 'x-robot-token': token(), 'content-type': 'application/json' }, body: JSON.stringify({ texto, urgente, origen: 'Antigravity' }) }); } catch { }
}

async function encargar(e) {
  const prompt = `${e.texto}\n\n---\n(Encargo del usuario enviado desde su robot de escritorio, Robot Companion, vía ${e.origen}. ` +
    'Cuando termines, usa la herramienta MCP robot_avisar con un resumen breve del resultado (el usuario puede no estar mirando Antigravity). ' +
    'Antes de algo delicado — borrar, publicar, gastar, tocar producción — usa robot_pedir_permiso y respeta la respuesta.)';
  const r = await agentapi(['new-conversation', `--model=${MODELO}`, `--title=🤖 ${e.texto.slice(0, 50)}`, prompt]);
  const id = r?.response?.newConversation?.conversationId;
  if (id) { log('encargo', id, e.texto.slice(0, 80)); return; }
  log('error', JSON.stringify(r).slice(0, 300));
  await avisar(`No pude encargarlo a Antigravity: ${String(r.error || 'error').slice(0, 200)}`, true);
  if (/Unavailable|Unauthenticated|CSRF|connection/i.test(String(r.error))) {          // Antigravity se cerró o reinició
    log('Antigravity ya no responde; el puente se cierra'); process.exit(0);
  }
}

async function escuchar() {
  for (;;) {
    try {
      const r = await fetch(`${BASE}/eventos`, { headers: { 'x-robot-token': token(), 'x-cliente': 'antigravity' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      log('conectado al robot');
      const lector = r.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const b = buf.slice(0, i); buf = buf.slice(i + 2);
          for (const l of b.split('\n')) {
            if (!l.startsWith('data: ')) continue;
            let e; try { e = JSON.parse(l.slice(6)); } catch { continue; }
            if (e.tipo === 'motor' && e.motor === 'antigravity') encargar(e);
          }
        }
      }
    } catch (e) { log('sin conexión con el robot:', e.message); }
    await new Promise(r => setTimeout(r, 5000));
  }
}

log(`puente iniciado (modelo ${MODELO})`);
escuchar();
