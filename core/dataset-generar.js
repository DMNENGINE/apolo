// Generación del dataset de APOLO EN PROXMOX (nada depende del PC): APOLO prepara el material una vez (preguntas del usuario,
// su estilo, memorias, alma y los ejemplos reales; todo redactado), lo sube al CT107 junto a core/remoto/generar-dataset.py
// y lo lanza allí como proceso propio (nohup, usuario trainer). El maestro es un modelo ABIERTO del Ollama del CT100.
// APOLO solo MIRA el progreso por ssh cuando el PC está encendido. Nunca entra texto de Claude ni de ChatGPT.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { limpiar } = require('./dataset');

const REMOTO = '/srv/entrenamiento/apolo';
const PREG = /\?|^(qu[eé]|c[oó]mo|por ?qu[eé]|cu[aá]l|cu[aá]nto|d[oó]nde|qui[eé]n|explica|expl[ií]came|dime|h[aá]blame|habla|cu[eé]ntame|opinas|crees|sabes|recomi[eé]nda|compara|diferencia)/i;
const ACCION = /(arregla|instala|crea|haz|abre|ejecuta|borra|mueve|copia|edita|cambia|pon|sube|publica|commit|push|corre|lanza|reinicia|descarga|escribe el|modifica|implementa|a[ñn]ade|quita)\b/i;
const DEICTICO = /\b(eso|esto|esta|este|esa|ese|aqu[ií]|ah[ií]|entonces|ya|lo que|la cosa|captura|pantalla|arriba|abajo|isla|apolo|app|panel|ventana|bot|servidor|repo|archivo|carpeta|c[oó]digo|error|bug|script|pi|proxmox|discord|el de|la de)\b/i;
const RUIDO = /<command-|<local-command|Caveat:|\[Request interrupted|tool_result|<system-reminder|^\s*\/|<entrada>|Responde solo|Tarea autom/;

function crearGenerador({ cfg, bus, dataset, ssh: sshX }) {
  const conf = () => ({ ssh: 'root@192.168.1.102', ct: 107, usuario: 'trainer', url: 'http://192.168.1.86:11434', modelo: 'qwen3:8b', objetivo: 600, identidad: 150, recuerdos: 2000, notaMinima: 4,
    ...(cfg.entrenamiento || {}).ssh ? { ssh: cfg.entrenamiento.ssh } : {}, ...((cfg.dataset || {}).maestro || {}) });
  const ssh = sshX || ((host, args, stdin) => new Promise((ok, mal) => {
    const p = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, ...args], { windowsHide: true });
    let o = '', e = '';
    const t = setTimeout(() => { p.kill(); mal(new Error('Proxmox no respondió a tiempo')); }, 120_000);
    p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; });
    p.on('error', er => { clearTimeout(t); mal(er); });
    p.on('close', c => { clearTimeout(t); c === 0 ? ok(o) : mal(new Error(`ssh: ${e.trim().slice(-300) || 'código ' + c}`)); });
    p.stdin.end(stdin || '');
  }));
  const ct = c => String(Number(c.ct));
  const comillas = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

  // ---------- material (se prepara en el PC con sus datos; luego todo corre en Proxmox) ----------
  function material() {
    const d = path.join(cfg.dir, 'sesiones'), mensajes = [];
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).filter(f => f.endsWith('.jsonl'))) {
      let m; try { m = JSON.parse(fs.readFileSync(path.join(d, f.replace(/\.jsonl$/, '.json')), 'utf8')); } catch { continue; }
      if (m.tarea || (m.padre && !String(m.id).startsWith('cc-'))) continue;
      for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
        if (!l.includes('"role":"user"')) continue;
        let x; try { x = JSON.parse(l); } catch { continue; }
        const t = String(x.content || '').trim();
        if (t.length >= 4 && t.length <= 1200 && !RUIDO.test(t)) mensajes.push(t);
      }
    }
    const preguntas = [...new Set(mensajes.filter(t => PREG.test(t) && t.length >= 15 && t.length <= 260 && !DEICTICO.test(t) && !ACCION.test(t) && !/[A-Z]:\\|https?:\/\/|```|\.(js|py|ts|json|ps1|cpp|md)\b/.test(t)))].map(t => limpiar(t));
    const estilo = [...new Set(mensajes.filter(t => t.length < 160))].sort(() => Math.random() - .5).slice(0, 80).map(t => limpiar(t).replace(/\s+/g, ' '));
    let memorias = [], recuerdos = [];
    try {
      const todas = JSON.parse(fs.readFileSync(path.join(cfg.dir, 'memoria.json'), 'utf8'));
      memorias = todas.filter(m => ['proyecto', 'hecho', 'preferencia', 'perfil', 'persona', 'patron'].includes(m.tipo)).map(m => limpiar(m.texto).slice(0, 240));
      // lo que APOLO "es" y sabe de su usuario (no detalles técnicos de código): perfil, personas, preferencias y patrones primero,
      // luego proyectos y hechos que más usa. Así esos recuerdos pasan a los pesos del modelo.
      const TECNICO = /[\\/][\w.-]+\.(js|py|ts|json|md|ps1|cpp|h|html|css)\b|`|\b\w+\(\)|\b(commit|endpoint|api\/|v1\/|npm|pip|regex|gotcha)\b|[A-Z]:\\/i;
      const PRIO = { perfil: 0, persona: 1, preferencia: 2, patron: 3, proyecto: 4, hecho: 5 };
      recuerdos = todas.filter(m => m.tipo in PRIO && m.texto && m.texto.length >= 20 && m.texto.length <= 400 && !TECNICO.test(m.texto))
        .filter(m => PRIO[m.tipo] <= 3 || (m.usos || 0) > 0)
        .sort((a, b) => PRIO[a.tipo] - PRIO[b.tipo] || (b.usos || 0) - (a.usos || 0))
        .slice(0, 1400).map(m => ({ t: limpiar(m.texto), tipo: m.tipo }));
    } catch { }
    const per = path.join(cfg.dir, 'personalidad'), leer = n => { try { return fs.readFileSync(path.join(per, n), 'utf8').trim(); } catch { return ''; } };
    const alma = ['SOUL.md', 'IDENTITY.md', 'USER.md'].map(leer).filter(Boolean).join('\n\n').slice(0, 3500);
    // ejemplos reales (solo modelos abiertos) del exportador
    const r = dataset.exportar();
    const leerJl = n => { try { return fs.readFileSync(path.join(dataset.dir(), n), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).messages); } catch { return []; } };
    const reales_train = leerJl('apolo-train.jsonl'), reales_val = leerJl('apolo-val.jsonl');
    const ejemplos = reales_train.filter(m => m.length === 3 && m[2].content.length < 700).map(m => [m[1].content, m[2].content]).slice(0, 40);
    return { creado: Date.now(), system: reales_train[0]?.[0]?.content || 'Eres APOLO, el asistente personal de tu usuario.', alma, preguntas, estilo, memorias, recuerdos, ejemplos, reales_train, reales_val, resumenReales: r };
  }

  async function subir() {
    const c = conf(), m = material();
    const tmp = path.join(os.tmpdir(), `apolo-material-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(m));
    const py = fs.readFileSync(path.join(__dirname, 'remoto', 'generar-dataset.py'), 'utf8');
    try {
      // al host por stdin y de ahí al CT107 con pct push (dueño trainer)
      await ssh(c.ssh, ['bash', '-c', comillas(`cat > /tmp/apolo-material.json`)], fs.readFileSync(tmp));
      await ssh(c.ssh, ['bash', '-c', comillas(`cat > /tmp/apolo-generar.py`)], py);
      await ssh(c.ssh, ['bash', '-c', comillas(`pct exec ${ct(c)} -- install -d -o ${c.usuario} -g ${c.usuario} ${REMOTO} && pct push ${ct(c)} /tmp/apolo-material.json ${REMOTO}/material.json --perms 0640 && pct push ${ct(c)} /tmp/apolo-generar.py ${REMOTO}/generar-dataset.py --perms 0750 && pct exec ${ct(c)} -- chown ${c.usuario}: ${REMOTO}/material.json ${REMOTO}/generar-dataset.py && rm -f /tmp/apolo-material.json /tmp/apolo-generar.py`)]);
    } finally { fs.rmSync(tmp, { force: true }); }
    return { preguntas: m.preguntas.length, recuerdos: m.recuerdos.length, estilo: m.estilo.length, reales: m.reales_train.length + m.reales_val.length, alma: m.alma.length };
  }

  let cache = null, cacheT = 0;
  async function estadoRemoto() {
    if (cache && Date.now() - cacheT < 5000) return cache;
    const c = conf();
    const py = `import json,os\nd='${REMOTO}'\ne={}\ntry: e=json.load(open(d+'/estado.json'))\nexcept Exception: pass\ng=[]\ntry: g=[json.loads(l) for l in open(d+'/generado.jsonl',encoding='utf-8') if l.strip()]\nexcept Exception: pass\nimport random\nvivo=bool(e.get('pid')) and os.path.exists('/proc/%s'%e.get('pid'))\ne['activo']=bool(e.get('activo')) and vivo\nprint(json.dumps({'estado':e,'muestra':random.sample(g,min(12,len(g))),'total':len(g)},ensure_ascii=False))`;
    const out = await ssh(c.ssh, ['pct', 'exec', ct(c), '--', 'python3', '-c', comillas(py)]);
    cache = JSON.parse(String(out).trim().split('\n').pop()); cacheT = Date.now();
    return cache;
  }

  async function generar({ objetivo } = {}) {
    const c = conf();
    const e = await estadoRemoto().catch(() => null);
    if (e?.estado?.activo) throw new Error('ya está generando en Proxmox');
    const sub = await subir();
    objetivo = Math.max(20, Math.min(Number(objetivo) || c.objetivo, 5000));
    const cmd = `cd ${REMOTO} && setsid nohup /usr/bin/python3 generar-dataset.py --dir ${REMOTO} --objetivo ${objetivo} --url ${comillas(c.url)} --modelo ${comillas(c.modelo)} --nota ${Number(c.notaMinima)} --identidad ${Number(c.identidad)} --recuerdos ${Number(c.recuerdos)} > generar.log 2>&1 < /dev/null &`;
    // en segundo plano EN EL HOST: pct exec retiene la sesión ssh mientras vive el hijo
    await ssh(c.ssh, ['bash', '-c', comillas(`nohup pct exec ${ct(c)} -- su - ${c.usuario} -c ${comillas(cmd)} > /dev/null 2>&1 < /dev/null &`)]);
    cache = null;
    bus?.emit('evento', { tipo: 'dataset' });
    return { ok: true, objetivo, subido: sub, maestro: `${c.modelo} (Proxmox)` };
  }
  async function parar() {
    const c = conf();
    await ssh(c.ssh, ['pct', 'exec', ct(c), '--', 'su', '-', c.usuario, '-c', comillas(`touch ${REMOTO}/parar`)]);
    cache = null;
    return { ok: true, texto: 'Pedido parar: termina el ejemplo en curso y monta el dataset con lo que haya.' };
  }
  return {
    generar, parar, subir,
    estado: async () => (await estadoRemoto().catch(er => ({ estado: { fase: 'sin conexión', error: er.message } }))).estado,
    hechas: async () => (await estadoRemoto().catch(() => ({ muestra: [] }))).muestra,
  };
}

module.exports = { crearGenerador, REMOTO };
