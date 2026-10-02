// Adaptador que usa la CLI `claude` que el usuario ya tiene instalada (su propia cuenta/plan).
// La CLI no expone tool-calling nativo con herramientas externas, así que pedimos salida estructurada
// { texto, herramientas: [{ nombre, argsJson }] } y el núcleo ejecuta las herramientas.
const { execFile } = require('child_process');
const os = require('os');

const ESQUEMA = {
  type: 'object',
  properties: {
    texto: { type: 'string', description: 'Lo que le dices al usuario (vacío si solo llamas herramientas)' },
    herramientas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nombre: { type: 'string' }, argsJson: { type: 'string', description: 'Argumentos como JSON' } },
        required: ['nombre', 'argsJson'],
      },
    },
  },
  required: ['texto', 'herramientas'],
};

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
    const lista = (herramientas || []).map(h => `- ${h.nombre}: ${h.descripcion}\n  parámetros: ${JSON.stringify(h.parametros)}`).join('\n');
    const sys = `${system || ''}\n\nSÍ TIENES HERRAMIENTAS, pero no como tools nativas: las usas pidiéndolas en el campo "herramientas" de tu salida ` +
      `(nombre + argsJson con los parámetros en JSON). Un programa las ejecuta y te devuelve el resultado en el siguiente turno ` +
      `como "### RESULTADO". Nunca digas que no tienes acceso: pide la herramienta. Cuando ya tengas la respuesta final, deja "herramientas" vacío.\n` +
      `HERRAMIENTAS:\n${lista}`;
    const args = ['-p', `${transcribir(mensajes)}\n\n(Responde al último mensaje. Si necesitas datos, pide herramientas.)`, '--model', model || 'haiku', '--output-format', 'json', '--no-session-persistence',
      '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--system-prompt', sys, '--json-schema', JSON.stringify(ESQUEMA)];
    return new Promise((ok, mal) => {
      const hijo = execFile(cfg.comando || 'claude', args, {
        cwd: os.tmpdir(), timeout: 300_000, maxBuffer: 16 << 20, windowsHide: true,
        env: { ...process.env, ROBOT_INTERNAL: '1' },
      }, (err, out) => {
        let j; try { j = JSON.parse(out); } catch { return mal(new Error(`claude CLI: ${err ? err.message : 'salida no válida'}`)); }
        if (j.is_error) return mal(new Error(`claude CLI: ${j.result || 'error'}`));
        const r = j.structured_output || { texto: j.result || '', herramientas: [] };
        ok({
          texto: r.texto || '',
          toolCalls: (r.herramientas || []).map((h, i) => {
            let a; try { a = JSON.parse(h.argsJson || '{}'); } catch { a = {}; }
            return { id: `cc_${Date.now()}_${i}`, name: h.nombre, args: a };
          }),
          uso: { entrada: j.usage?.input_tokens || 0, salida: j.usage?.output_tokens || 0 },
        });
      });
      signal?.addEventListener('abort', () => hijo.kill(), { once: true });
    });
  },
  async modelos() { return ['haiku', 'sonnet', 'opus']; },
});
