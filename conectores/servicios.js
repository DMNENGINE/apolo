// Servicios con token o API key: GitHub, Hugging Face y ElevenLabs.
// Consultar = lectura. Crear o gastar (issues, comentarios, generar audio con créditos) = pide permiso.
const fs = require('fs');
const os = require('os');
const path = require('path');

const recortar = (s, n = 15_000) => (s.length > n ? s.slice(0, n) + '\n…[recortado]' : s);

function crearServicios({ almacen }) {
  const tok = k => { const t = almacen.secreto('srv:' + k); if (!t) throw new Error(`${k} no está conectado (Panel → Configuración → Conexiones)`); return t; };
  async function pedir(url, { metodo = 'GET', headers = {}, cuerpo, binario = false } = {}) {
    const r = await fetch(url, { method: metodo, headers: { 'user-agent': 'APOLO', ...headers, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`); }
    return binario ? Buffer.from(await r.arrayBuffer()) : r.status === 204 ? null : r.json();
  }

  // ---------- GitHub (token personal: github.com/settings/tokens) ----------
  const gh = (ruta, o = {}) => pedir('https://api.github.com' + ruta, { ...o, headers: { authorization: 'Bearer ' + tok('github'), accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  // ---------- Hugging Face (token: huggingface.co/settings/tokens) ----------
  const hf = (ruta, o = {}) => pedir('https://huggingface.co' + ruta, { ...o, headers: { authorization: 'Bearer ' + tok('huggingface') } });
  // ---------- ElevenLabs (API key: elevenlabs.io → Profile → API keys) ----------
  const el = (ruta, o = {}) => pedir('https://api.elevenlabs.io' + ruta, { ...o, headers: { 'xi-api-key': tok('elevenlabs') } });

  // probar = comprobar el token y saber de quién es
  const PROBAR = {
    github: async () => { const u = await gh('/user'); return `@${u.login}`; },
    huggingface: async () => { const u = await hf('/api/whoami-v2'); return `@${u.name}`; },
    elevenlabs: async () => { const s = await el('/v1/user/subscription'); return `${s.tier} · ${s.character_count}/${s.character_limit} caracteres`; },
  };

  const herramientas = [
    // GitHub
    { nombre: 'github_notificaciones', servicio: 'github', riesgo: 'lectura', descripcion: 'Notificaciones de GitHub sin leer (issues, PRs, menciones, revisiones).',
      parametros: { type: 'object', properties: {} }, resumen: () => 'notificaciones de GitHub',
      ejecutar: async () => { const n = await gh('/notifications?per_page=30'); return n.map(x => `- [${x.repository.full_name}] ${x.subject.type}: ${x.subject.title} (${x.reason})`).join('\n') || '(nada nuevo)'; } },
    { nombre: 'github_repos', servicio: 'github', riesgo: 'lectura', descripcion: 'Tus repositorios de GitHub, los más recientes primero.',
      parametros: { type: 'object', properties: { max: { type: 'number' } } }, resumen: () => 'repos de GitHub',
      ejecutar: async a => { const r = await gh(`/user/repos?sort=updated&per_page=${Math.min(a.max || 20, 100)}`); return r.map(x => `- ${x.full_name}${x.private ? ' (privado)' : ''} ★${x.stargazers_count} · ${x.description || ''}`).join('\n'); } },
    { nombre: 'github_issues', servicio: 'github', riesgo: 'lectura', descripcion: 'Issues y pull requests de un repositorio (owner/repo).',
      parametros: { type: 'object', properties: { repo: { type: 'string' }, estado: { type: 'string', enum: ['open', 'closed', 'all'] } }, required: ['repo'] },
      resumen: a => `issues de ${a.repo}`,
      ejecutar: async a => { const r = await gh(`/repos/${a.repo}/issues?state=${a.estado || 'open'}&per_page=30`); return r.map(x => `#${x.number} ${x.pull_request ? '[PR] ' : ''}${x.title} · @${x.user.login} · ${x.comments} comentarios`).join('\n') || '(ninguno)'; } },
    { nombre: 'github_leer_issue', servicio: 'github', riesgo: 'lectura', descripcion: 'Lee un issue o PR con sus comentarios.',
      parametros: { type: 'object', properties: { repo: { type: 'string' }, numero: { type: 'number' } }, required: ['repo', 'numero'] },
      resumen: a => `${a.repo}#${a.numero}`,
      ejecutar: async a => {
        const [i, cs] = await Promise.all([gh(`/repos/${a.repo}/issues/${a.numero}`), gh(`/repos/${a.repo}/issues/${a.numero}/comments?per_page=30`)]);
        return recortar(`#${i.number} ${i.title} (${i.state}) · @${i.user.login}\n\n${i.body || ''}\n\n${cs.map(c => `--- @${c.user.login}:\n${c.body}`).join('\n\n')}`);
      } },
    { nombre: 'github_buscar', servicio: 'github', riesgo: 'lectura', descripcion: 'Busca en GitHub: repositorios, issues o código.',
      parametros: { type: 'object', properties: { q: { type: 'string' }, tipo: { type: 'string', enum: ['repositories', 'issues', 'code'] } }, required: ['q'] },
      resumen: a => `buscar en GitHub "${a.q}"`,
      ejecutar: async a => {
        const t = a.tipo || 'repositories', r = await gh(`/search/${t}?q=${encodeURIComponent(a.q)}&per_page=15`);
        return r.items.map(x => t === 'code' ? `- ${x.repository.full_name}/${x.path}` : t === 'issues' ? `- ${x.repository_url.split('/repos/')[1]}#${x.number} ${x.title}` : `- ${x.full_name} ★${x.stargazers_count} · ${x.description || ''}`).join('\n') || '(nada)';
      } },
    { nombre: 'github_crear_issue', servicio: 'github', riesgo: 'escritura', descripcion: 'Crea un issue en un repositorio. Pide permiso.',
      parametros: { type: 'object', properties: { repo: { type: 'string' }, titulo: { type: 'string' }, cuerpo: { type: 'string' } }, required: ['repo', 'titulo'] },
      resumen: a => `crear issue en ${a.repo}: "${a.titulo}"`,
      ejecutar: async a => { const i = await gh(`/repos/${a.repo}/issues`, { metodo: 'POST', cuerpo: { title: a.titulo, body: a.cuerpo || '' } }); return `creado #${i.number}: ${i.html_url}`; } },
    { nombre: 'github_comentar', servicio: 'github', riesgo: 'escritura', descripcion: 'Comenta en un issue o PR. Pide permiso.',
      parametros: { type: 'object', properties: { repo: { type: 'string' }, numero: { type: 'number' }, texto: { type: 'string' } }, required: ['repo', 'numero', 'texto'] },
      resumen: a => `comentar en ${a.repo}#${a.numero}: ${a.texto.slice(0, 200)}`,
      ejecutar: async a => { const c = await gh(`/repos/${a.repo}/issues/${a.numero}/comments`, { metodo: 'POST', cuerpo: { body: a.texto } }); return `comentado: ${c.html_url}`; } },

    // Hugging Face
    { nombre: 'hf_buscar', servicio: 'huggingface', riesgo: 'lectura', descripcion: 'Busca en Hugging Face modelos, datasets o spaces (los más descargados/populares primero).',
      parametros: { type: 'object', properties: { q: { type: 'string' }, tipo: { type: 'string', enum: ['models', 'datasets', 'spaces'] }, max: { type: 'number' } }, required: ['q'] },
      resumen: a => `buscar en Hugging Face "${a.q}"`,
      ejecutar: async a => {
        const t = a.tipo || 'models', orden = t === 'spaces' ? 'likes' : 'downloads';
        const r = await hf(`/api/${t}?search=${encodeURIComponent(a.q)}&limit=${Math.min(a.max || 10, 30)}&sort=${orden}&direction=-1`);
        return r.map(x => `- ${x.id}${x.pipeline_tag ? ` [${x.pipeline_tag}]` : ''} · ⬇${x.downloads ?? '-'} ♥${x.likes ?? 0}`).join('\n') || '(nada)';
      } },
    { nombre: 'hf_info', servicio: 'huggingface', riesgo: 'lectura', descripcion: 'Información de un modelo/dataset/space de Hugging Face (tarea, licencia, archivos, tarjeta).',
      parametros: { type: 'object', properties: { repo: { type: 'string' }, tipo: { type: 'string', enum: ['models', 'datasets', 'spaces'] } }, required: ['repo'] },
      resumen: a => `Hugging Face ${a.repo}`,
      ejecutar: async a => {
        const x = await hf(`/api/${a.tipo || 'models'}/${a.repo}`);
        return recortar(JSON.stringify({ id: x.id, tarea: x.pipeline_tag, licencia: x.cardData?.license, descargas: x.downloads, likes: x.likes, etiquetas: x.tags?.slice(0, 20), archivos: x.siblings?.slice(0, 40).map(s => s.rfilename) }, null, 1));
      } },

    // ElevenLabs
    { nombre: 'elevenlabs_voces', servicio: 'elevenlabs', riesgo: 'lectura', descripcion: 'Voces disponibles en la cuenta de ElevenLabs y caracteres restantes.',
      parametros: { type: 'object', properties: {} }, resumen: () => 'voces de ElevenLabs',
      ejecutar: async () => {
        const [v, s] = await Promise.all([el('/v1/voices'), el('/v1/user/subscription')]);
        return `Saldo: ${s.character_count}/${s.character_limit} caracteres usados\n` + v.voices.map(x => `- ${x.name} (${x.voice_id}) · ${x.labels ? Object.values(x.labels).join(', ') : ''}`).join('\n');
      } },
    { nombre: 'elevenlabs_hablar', servicio: 'elevenlabs', riesgo: 'escritura', descripcion: 'Genera un audio MP3 con una voz de ElevenLabs y lo guarda en Descargas. Gasta créditos: pide permiso.',
      parametros: { type: 'object', properties: { texto: { type: 'string' }, voz: { type: 'string', description: 'voice_id o nombre de la voz' }, nombreArchivo: { type: 'string' } }, required: ['texto', 'voz'] },
      resumen: a => `audio ElevenLabs (${a.texto.length} caracteres, voz ${a.voz}): "${a.texto.slice(0, 120)}"`,
      ejecutar: async a => {
        let id = a.voz;
        if (!/^[A-Za-z0-9]{18,}$/.test(id)) { const v = (await el('/v1/voices')).voices.find(x => x.name.toLowerCase().includes(String(a.voz).toLowerCase())); if (!v) throw new Error(`no encuentro la voz "${a.voz}"`); id = v.voice_id; }
        const mp3 = await el(`/v1/text-to-speech/${id}?output_format=mp3_44100_128`, { metodo: 'POST', cuerpo: { text: a.texto, model_id: 'eleven_multilingual_v2' }, binario: true });
        const f = path.join(os.homedir(), 'Downloads', (a.nombreArchivo || `apolo-voz-${Date.now()}`).replace(/[^\w.-]+/g, '_').replace(/\.mp3$/i, '') + '.mp3');
        fs.writeFileSync(f, mp3);
        return `guardado: ${f} (${Math.round(mp3.length / 1024)} KB)`;
      } },
  ];
  return { herramientas, probar: async k => PROBAR[k](), SERVICIOS: Object.keys(PROBAR) };
}

module.exports = { crearServicios };
