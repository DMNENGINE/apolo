// APOLO-MANOS: el modelo propio que usa herramientas (entrenado en el Proxmox con core/remoto/manos/generar-manos.py).
// Lo que ve aquí tiene que ser IGUAL que en su entrenamiento: las mismas herramientas compactas y el mismo system.
// Si cambias algo, regenera core/remoto/manos/herramientas.json con `node core/manos.js` y reentrena.
const HERRAMIENTAS_MANOS = ['listar', 'leer_archivo', 'shell', 'web', 'buscar_memoria', 'recordar', 'buscar_historial', 'programar_tarea', 'ver_tareas',
  'navegador_abrir', 'navegador_pestanas', 'ver_skills'];

const corta = t => { t = String(t || ''); const m = t.match(/^.{20,}?[.!?](\s|$)/); return (m ? m[0] : t).trim().slice(0, 220); };
function limpia(p) {
  if (!p || typeof p !== 'object') return p;
  const o = Array.isArray(p) ? [] : {};
  for (const [k, v] of Object.entries(p)) o[k] = k === 'description' ? corta(v).slice(0, 120) : (typeof v === 'object' ? limpia(v) : v);
  return o;
}
// la herramienta tal cual la vio en el entrenamiento (descripción = su primera frase; parámetros con descripciones cortas)
const compacta = h => ({ ...h, descripcion: corta(h.descripcion), parametros: limpia(h.parametros) });

function ahoraManos(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// IGUAL que SYSTEM_MANOS de core/remoto/manos/generar-manos.py
const sistemaManos = (d) => 'Eres APOLO, el asistente personal de tu usuario en su PC (Windows). Usa tus herramientas para hacer lo que te pide y respóndele ' +
  `en español, directo y breve, contando SOLO lo que digan los resultados. Ahora (hora local): ${ahoraManos(d)}.`;

module.exports = { HERRAMIENTAS_MANOS, compacta, sistemaManos };

if (require.main === module) {          // node core/manos.js → regenera las herramientas del entrenamiento
  const { HERRAMIENTAS } = require('./herramientas');
  const tools = HERRAMIENTAS_MANOS.map(n => { const h = compacta(HERRAMIENTAS.find(x => x.nombre === n)); return { type: 'function', function: { name: n, description: h.descripcion, parameters: h.parametros } }; });
  require('fs').writeFileSync(require('path').join(__dirname, 'remoto', 'manos', 'herramientas.json'), JSON.stringify(tools, null, 1));
  console.log('herramientas.json:', tools.length);
}
