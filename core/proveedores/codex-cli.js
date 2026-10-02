// Adaptador que usa Codex CLI (OpenAI) con la cuenta de ChatGPT del usuario (Plus/Pro/Team): sin API key.
// Igual que claude-cli: Codex corre como modelo "puro" (sin shell, plugins ni navegador propios, sandbox de solo lectura)
// y devuelve salida estructurada { texto, herramientas: [{ nombre, argsJson }] }; las herramientas las ejecuta el núcleo.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    texto: { type: 'string', description: 'Lo que le dices al usuario (vacío si solo llamas herramientas)' },
    herramientas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { nombre: { type: 'string' }, argsJson: { type: 'string', description: 'Argumentos como JSON' } },
        required: ['nombre', 'argsJson'],
      },
    },
  },
  required: ['texto', 'herramientas'],
};
// lo que Codex trae de serie y aquí sobra: las herramientas son las del núcleo (con sus permisos)
const SIN = ['shell_tool', 'plugins', 'apps', 'hooks', 'browser_use', 'browser_use_external', 'computer_use', 'memories'];

// Codex se instala con npm (codex.cmd); en Windows es más fiable lanzar su .js con node que el .cmd
let entrada;
function lanzador() {
  if (entrada !== undefined) return entrada;
  entrada = null;
  try {
    const raiz = (process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/c', 'npm root -g'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 })
      : execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 15_000 })).trim();
    const js = path.join(raiz, '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(js)) entrada = { cmd: 'node', pre: [js] };
  } catch { }
  return entrada;
}
const instalado = () => !!lanzador();
const olvidar = () => { entrada = undefined; };

// ¿tiene Codex instalado y sesión iniciada?
function estado() {
  const l = lanzador();
  if (!l) return { instalado: false, sesion: false };
  try {
    const out = execFileSync(l.cmd, [...l.pre, 'login', 'status'], { encoding: 'utf8', windowsHide: true, timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { instalado: true, sesion: !/not logged in/i.test(out), detalle: out.trim().split('\n')[0] };
  } catch (e) {
    const t = String(e.stdout || '') + String(e.stderr || '');
    return { instalado: true, sesion: false, detalle: t.trim().split('\n')[0] || e.message };
  }
}

function transcribir(mensajes) {
  return mensajes.map(m => {
    if (m.role === 'user') return `### USUARIO\n${m.content}`;
    if (m.role === 'tool') return `### RESULTADO de ${m.name} (${m.toolCallId})\n${m.content}${m.imagenes?.length ? '\n(Venía una captura que por esta vía no puedes ver: guíate por la lista de elementos.)' : ''}`;
    const calls = (m.toolCalls || []).map(c => `→ llamaste ${c.name}(${JSON.stringify(c.args)}) [${c.id}]`).join('\n');
    return `### TÚ\n${m.content || ''}${calls ? '\n' + calls : ''}`;
  }).join('\n\n');
}

module.exports = (cfg) => ({
  chat({ model, system, mensajes, herramientas, signal }) {
    const l = lanzador();
    if (!l) return Promise.reject(new Error('Codex CLI no está instalado. Panel → Modelos → ChatGPT → Conectar.'));
    const lista = (herramientas || []).map(h => `- ${h.nombre}: ${h.descripcion}\n  parámetros: ${JSON.stringify(h.parametros)}`).join('\n');
    const prompt = `${system || ''}\n\nSÍ TIENES HERRAMIENTAS, pero no como tools nativas: las usas pidiéndolas en el campo "herramientas" de tu salida ` +
      `(nombre + argsJson con los parámetros en JSON). Un programa las ejecuta y te devuelve el resultado en el siguiente turno ` +
      `como "### RESULTADO". No ejecutes comandos tú mismo ni leas archivos: pide la herramienta. Cuando ya tengas la respuesta final, deja "herramientas" vacío.\n` +
      `HERRAMIENTAS:\n${lista || '(ninguna)'}\n\n=== CONVERSACIÓN ===\n${transcribir(mensajes)}\n\n(Responde al último mensaje. Si necesitas datos, pide herramientas.)`;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robot-codex-'));
    const fEsq = path.join(tmp, 'esquema.json'), fOut = path.join(tmp, 'salida.json');
    fs.writeFileSync(fEsq, JSON.stringify(ESQUEMA));
    const args = [...l.pre, 'exec', '--skip-git-repo-check', '--ephemeral', '--ignore-rules', '--sandbox', 'read-only', '--color', 'never',
      '--json', '--output-schema', fEsq, '-o', fOut, '-C', tmp, ...SIN.flatMap(f => ['--disable', f])];
    if (model && model !== 'default') args.push('-m', model);
    args.push('-');                                              // el prompt va por stdin (sin límite de longitud de la línea de comandos)

    return new Promise((ok, mal) => {
      const hijo = spawn(l.cmd, args, { cwd: tmp, windowsHide: true, env: { ...process.env, ROBOT_INTERNAL: '1' } });
      let out = '', err = '';
      const fin = (f) => { clearTimeout(t); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } f(); };
      const t = setTimeout(() => { hijo.kill(); }, cfg.timeoutMs || 300_000);
      hijo.stdout.on('data', d => { out += d; });
      hijo.stderr.on('data', d => { err += d; });
      hijo.on('error', e => fin(() => mal(new Error(`codex: ${e.message}`))));
      hijo.on('close', code => {
        const eventos = out.split('\n').map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
        const uso = eventos.filter(e => e.type === 'turn.completed').map(e => e.usage || {}).pop() || {};
        const fallo = eventos.find(e => e.type === 'turn.failed' || e.type === 'error');
        let texto = ''; try { texto = fs.readFileSync(fOut, 'utf8'); } catch { }
        if (!texto) {
          const m = eventos.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').pop();
          texto = m?.item?.text || '';
        }
        if (!texto) {
          const msg = fallo?.error?.message || fallo?.message || err.trim().split('\n').pop() || `salió con código ${code}`;
          return fin(() => mal(new Error(/log ?in|auth|401/i.test(msg) ? `ChatGPT: no hay sesión iniciada en Codex (Panel → Modelos → ChatGPT → Conectar). ${msg}` : `codex: ${msg}`)));
        }
        let r; try { r = JSON.parse(texto); } catch { r = { texto, herramientas: [] }; }
        fin(() => ok({
          texto: r.texto || '',
          toolCalls: (r.herramientas || []).map((h, i) => {
            let a; try { a = JSON.parse(h.argsJson || '{}'); } catch { a = {}; }
            return { id: `cx_${Date.now()}_${i}`, name: h.nombre, args: a };
          }),
          uso: { entrada: uso.input_tokens || 0, salida: uso.output_tokens || 0 },
        }));
      });
      hijo.stdin.end(prompt);
      signal?.addEventListener('abort', () => hijo.kill(), { once: true });
    });
  },
  async modelos() { return ['default']; },   // 'default' = el modelo que Codex elige para su plan; se puede escribir otro (chatgpt/<modelo>)
});
module.exports.estado = estado;
module.exports.instalado = instalado;
module.exports.olvidar = olvidar;
// versión que no bloquea (la usa la comprobación periódica del núcleo, que corre dentro de Electron)
module.exports.estadoAsync = () => new Promise(ok => {
  const l = lanzador();
  if (!l) return ok({ instalado: false, sesion: false });
  require('child_process').execFile(l.cmd, [...l.pre, 'login', 'status'], { encoding: 'utf8', windowsHide: true, timeout: 20_000 }, (e, out, err) => {
    const t = String(out || '') + String(err || '');
    ok({ instalado: true, sesion: !e && !/not logged in/i.test(t), detalle: t.trim().split('\n')[0] });
  });
});

// "Conectar ChatGPT" en un clic: instala Codex con npm si falta y abre su inicio de sesión (navegador) en una ventana aparte
module.exports.conectar = () => new Promise((ok, mal) => {
  const abrirLogin = () => {
    const l = lanzador();
    if (!l) return mal(new Error('No pude instalar Codex CLI (¿está Node.js instalado?)'));
    const p = spawn(l.cmd, [...l.pre, 'login'], { detached: true, stdio: 'ignore', windowsHide: false });
    p.unref();
    ok({ paso: 'login', mensaje: 'Se abrió el inicio de sesión de ChatGPT en tu navegador. Entra con tu cuenta y vuelve aquí.' });
  };
  if (lanzador()) return abrirLogin();
  const cmd = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'npm install -g @openai/codex --no-audit --no-fund']] : ['npm', ['install', '-g', '@openai/codex']];
  require('child_process').execFile(cmd[0], cmd[1], { windowsHide: true, timeout: 300_000 }, e => {
    olvidar();
    if (e && !lanzador()) return mal(new Error('npm no pudo instalar Codex: ' + e.message));
    abrirLogin();
  });
});
