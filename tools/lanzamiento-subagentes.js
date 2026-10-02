// Encarga el material de lanzamiento al núcleo del robot (gemma + 3 subagentes en paralelo), sin gastar Claude.
// Mientras trabaja, aprueba SOLO escritura de archivos dentro de lanzamiento/ y deniega todo lo demás
// (el usuario está dormido y no puede contestar permisos).
//   node tools/lanzamiento-subagentes.js [modelo]
const fs = require('fs'), path = require('path');
const T = fs.readFileSync(path.join(process.env.APPDATA, 'robot-companion', 'nucleo', 'token'), 'utf8').trim();
const H = { 'x-robot-token': T, 'content-type': 'application/json' };
const U = 'http://127.0.0.1:47900/v1';
const DIR = path.join(__dirname, '..', 'lanzamiento');
const modelo = process.argv[2] || 'ollama/gemma4:31b-cloud';
const tareaExtra = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : null;   // encargo distinto (mismo brief y mismo aprobador)
fs.mkdirSync(path.join(DIR, 'web'), { recursive: true });
const log = (...a) => console.log(new Date().toLocaleTimeString('es'), ...a);

const BRIEF = `PRODUCTO: "Robot Companion" — un compañero de escritorio para Windows con forma de casco robot 3D (visor HUD verde, ojos animados) que vive en una "isla" flotante arriba de la pantalla.
Qué hace DE VERDAD (no inventes nada más):
- Vigila tus sesiones de Claude Code (y Gemini CLI): ves en la isla qué hace cada terminal, subagentes, contexto usado y uso del plan.
- Permisos: cuando la IA quiere ejecutar algo, lo apruebas o deniegas desde la isla, el Stream Deck o un DM de Discord desde el móvil; detecta comandos peligrosos y los marca en rojo.
- Núcleo multi-modelo propio: habla con cualquier modelo (Ollama local como qwen/gemma, OpenAI, Anthropic, Gemini, OpenRouter) con las mismas herramientas, permisos y memoria.
- Memoria permanente compartida entre modelos (búsqueda por significado, 100% local) y compactación automática de conversaciones largas.
- Subagentes en paralelo y un tablero "Mission Control" para ver quién hace qué.
- Tareas programadas y "latidos" (avisa solo si hay algo).
- Ve la pantalla y puede usar ratón y teclado con permiso por encargo, borde rojo visible y botón de pánico (mueves el ratón y recuperas el control).
- Voz (hablarle y que responda), bot de Discord, panel web de control, Stream Deck.
- Personalidad propia: saluda, enseña la hora, guiña, se marea con ojos de remolino si lo tocas mucho, se duerme con Zzz.
- Importa memoria y personalidad desde OpenClaw.
- Privacidad: corre en tu PC, puede funcionar 100% local con Ollama; las claves nunca salen.
- Será open source (licencia MIT). Precio: gratis. Estado: lanzamiento próximo (beta). Plataforma: Windows.
Creador: Demon (marca DMN). Público: gente que usa agentes de IA (Claude Code, Gemini CLI, Ollama), devs, makers, streamers, entusiastas del setup.
REGLAS: todo en ESPAÑOL. No inventes cifras, testimonios, premios, usuarios ni enlaces reales (usa "#" como enlace). Nada de "el mejor del mundo".`;

const TAREA = `${BRIEF}

Eres el coordinador del material de lanzamiento. Usa la herramienta "delegar" TRES veces EN LA MISMA RESPUESTA (trabajan en paralelo). Copia el bloque PRODUCTO completo dentro de cada tarea (los subagentes no ven esta conversación):
1) nombre "web": crear con escribir_archivo la página de lanzamiento en la ruta "web/index.html": UN SOLO archivo HTML con CSS dentro (sin JS externo; Google Fonts permitido). Estética: fondo casi negro, acento verde neón #2bdc7c y ámbar, estilo HUD/terminal, moderna y limpia, responsive (móvil). Secciones: hero con eslogan + botón "Descargar beta" (#) y "Ver en GitHub" (#); qué es; funciones (tarjetas); cómo funciona en 3 pasos; seguridad y privacidad; open source; preguntas frecuentes; llamada final; pie. Un casco robot dibujado con CSS/SVG simple en el hero. Al terminar, informa solo la ruta y las secciones.
2) nombre "marketing": crear con escribir_archivo "marketing.md": plan de marketing completo de lanzamiento con presupuesto cero: posicionamiento y propuesta de valor, público objetivo (3 perfiles), mensajes clave y eslóganes (5 opciones), canales (Reddit, X, YouTube, TikTok, Discord, Product Hunt, Hacker News, comunidades de IA), plan en 3 fases (pre-lanzamiento 2 semanas, día del lanzamiento hora a hora, post-lanzamiento 4 semanas), textos listos para publicar (post de Reddit, hilo de X, descripción de Product Hunt), métricas a seguir y riesgos. Informa solo la ruta y un resumen de 3 líneas.
3) nombre "videos": crear con escribir_archivo "videos.md": 15 ideas de vídeo cortas (TikTok/Shorts/Reels) y 3 largas (YouTube). Para cada una: título, gancho de los primeros 3 segundos, guion breve por escenas, qué se ve en pantalla, texto en pantalla, música/ritmo sugerido, llamada a la acción y duración. Incluye ideas que muestren las animaciones del robot (ojos de remolino, saludar, la hora), el control de permisos desde el móvil, Mission Control con subagentes y "el robot usa el ratón". Informa solo la ruta y los títulos.
Cuando los tres terminen, responde con un resumen breve de qué archivos se crearon.`;

(async () => {
  const s = await (await fetch(`${U}/sesiones`, { method: 'POST', headers: H, body: JSON.stringify({ modelo, cwd: DIR, titulo: '🚀 Material de lanzamiento', canal: 'api' }) })).json();
  log('sesión', s.id, modelo, 'carpeta', DIR);
  // aprobador acotado: escuchar permisos en el SSE global
  const ctl = new AbortController();
  (async () => {
    const r = await fetch(`${U}/eventos`, { headers: H, signal: ctl.signal });
    const dec = new TextDecoder(); let b = '';
    for await (const ch of r.body) {
      b += dec.decode(ch); let i;
      while ((i = b.indexOf('\n\n')) >= 0) {
        const l = b.slice(0, i); b = b.slice(i + 2); if (!l.startsWith('data: ')) continue;
        let e; try { e = JSON.parse(l.slice(6)); } catch { continue; }
        if (e.tipo !== 'permiso') continue;
        const ruta = e.args?.ruta ? path.resolve(DIR, e.args.ruta) : '';
        const ok = ['escribir_archivo', 'editar_archivo'].includes(e.herramienta) && ruta && (ruta + path.sep).startsWith(DIR + path.sep) && !e.peligro;
        await fetch(`${U}/permisos/${e.id}`, { method: 'POST', headers: H, body: JSON.stringify({ decision: ok ? 'allow' : 'deny' }) });
        log(ok ? '✓ permitido' : '✗ denegado', e.herramienta, e.resumen?.slice(0, 100));
      }
    }
  })().catch(() => { });
  // el turno (SSE de la sesión)
  const t0 = Date.now();
  const r = await fetch(`${U}/sesiones/${s.id}/mensajes`, { method: 'POST', headers: H, body: JSON.stringify({ texto: tareaExtra ? `${BRIEF}\n\n${tareaExtra}` : TAREA }) });
  const dec = new TextDecoder(); let b = '';
  for await (const ch of r.body) {
    b += dec.decode(ch); let i;
    while ((i = b.indexOf('\n\n')) >= 0) {
      const l = b.slice(0, i); b = b.slice(i + 2); if (!l.startsWith('data: ')) continue;
      const e = JSON.parse(l.slice(6));
      if (e.tipo === 'herramienta') log('▸', e.nombre, String(e.resumen || '').slice(0, 80));
      else if (e.tipo === 'resultado') log('  ←', e.nombre, String(e.resultado).replace(/\s+/g, ' ').slice(0, 160));
      else if (e.tipo === 'fin') log('FIN', `${((Date.now() - t0) / 60000).toFixed(1)} min`, '\n' + e.texto);
      else if (e.tipo === 'error') log('ERROR', e.error);
    }
  }
  ctl.abort();
  for (const f of ['web/index.html', 'marketing.md', 'videos.md']) {
    const p = path.join(DIR, f); log(f, fs.existsSync(p) ? `${fs.statSync(p).size} bytes` : 'NO EXISTE');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
