// Entrenamiento de modelos en Proxmox (CT107 "entrenamiento", Soup + árbitro de GPU del host). Ver y controlar desde APOLO.
// - estado(): un script de SOLO LECTURA por ssh al host (root@192.168.1.102): GPU (nvidia-smi), árbitro (/run/lab-gpu-arbitro.json),
//   trabajos del CT107 (/srv/entrenamiento/jobs/*/estado.json) y el log del entrenamiento lanzado por APOLO (paso/total/loss).
//   Los tokens del árbitro NO se leen ni salen del host.
// - iniciar/parar/continuar: SIEMPRE por la entrada gestionada (cola.py = supervisor), nunca soup_cli directo: así la GPU cede
//   a Ollama/Blender (prioritarios) guardando checkpoint y reanuda sola. parar = SIGTERM al supervisor (guarda checkpoint).
// - vigilar(): sondea y avisa (isla/voz/móvil) cuando empieza, cede la GPU, reanuda, termina o falla.
'use strict';
const { spawn } = require('child_process');

const DIR = '/srv/entrenamiento';
const RUTA_OK = /^\/srv\/entrenamiento\/[\w./-]+$/;

// corre EN EL HOST (python3 -). Lee, no escribe nada.
const PY_ESTADO = String.raw`
import json, subprocess, os, glob
CT = int(os.environ.get('CT', '107'))
out = {}
try:
    q = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.used,memory.total,temperature.gpu,utilization.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=10).stdout.strip().split(', ')
    out['gpu'] = {'nombre': q[0], 'usada': int(q[1]), 'total': int(q[2]), 'temp': int(q[3]), 'uso': int(q[4])}
except Exception as e: out['gpu'] = {'error': str(e)[:120]}
try:
    a = json.load(open('/run/lab-gpu-arbitro.json'))
    out['arbitro'] = {'entrenamiento': a.get('entrenamiento'), 'prioritarios': a.get('prioritarios'), 'motivo': a.get('motivo'), 'trabajos': a.get('trabajos'), 'eventos': (a.get('eventos') or [])[-12:]}
except Exception as e: out['arbitro'] = {'error': str(e)[:120]}
out['ct'] = subprocess.run(['pct', 'status', str(CT)], capture_output=True, text=True).stdout.strip().replace('status: ', '')
CT_CODE = r'''
import json, glob, os, re
R = "/srv/entrenamiento"
jobs = []
for d in sorted(glob.glob(R + "/jobs/*/"), key=os.path.getmtime, reverse=True)[:10]:
    j = {"id": os.path.basename(d.rstrip("/"))}
    for n in ("estado", "arguments", "checkpoint"):
        try: j[n] = json.load(open(d + n + ".json"))
        except Exception: pass
    jobs.append(j)
log = {}
logs = sorted(glob.glob(R + "/apolo-logs/*.log"), key=os.path.getmtime)
if logs:
    f = logs[-1]; t = open(f, "rb"); t.seek(max(0, os.path.getsize(f) - 200000)); txt = t.read().decode("utf-8", "replace")
    pasos = re.findall(r"(\d+)/(\d+) \[", txt)
    perdidas = [(float(m.group(1)), float(m.group(2))) for m in re.finditer(r"'loss': '?([\d.e-]+)'?.*?'epoch': '?([\d.e-]+)", txt)]
    ev = [l.strip()[:200] for l in re.split(r"[\r\n]+", txt) if re.match(r"\s*(EN COLA|CEDIENDO|CHECKPOINT|REANUDANDO|INICIANDO|GPU LIBRE|Traceback|\w*Error)", l)]
    log = {"archivo": f, "mtime": os.path.getmtime(f), "paso": int(pasos[-1][0]) if pasos else None, "total": int(pasos[-1][1]) if pasos else None,
           "perdidas": perdidas[-200:], "eventos": ev[-15:], "cola": txt[-1500:]}
procs = os.popen("pgrep -x soup-cola; pgrep -x soup-worker").read().split()
print(json.dumps({"jobs": jobs, "log": log, "procesos": len(procs)}))
'''
try:
    r = subprocess.run(['pct', 'exec', str(CT), '--', 'python3', '-c', CT_CODE], capture_output=True, text=True, timeout=40)
    out.update(json.loads(r.stdout or '{}'))
except Exception as e: out['error_ct'] = str(e)[:200]
print(json.dumps(out))
`;

function crearEntrenamiento({ cfg, bus, ssh: sshX, ahora = () => Date.now() }) {
  const conf = () => ({ ssh: 'root@192.168.1.102', ct: 107, usuario: 'trainer', config: `${DIR}/soup-python.yaml`, ui: 'http://192.168.1.206:7860', vigilar: true, ...(cfg.entrenamiento || {}) });
  const ssh = sshX || ((host, args, stdin) => new Promise((ok, mal) => {
    const p = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, ...args], { windowsHide: true });
    let o = '', e = '';
    const t = setTimeout(() => { p.kill(); mal(new Error('Proxmox no respondió a tiempo')); }, 60_000);
    p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; });
    p.on('error', er => { clearTimeout(t); mal(er); });
    p.on('close', c => { clearTimeout(t); c === 0 ? ok(o) : mal(new Error(`ssh ${host}: ${e.trim().slice(-300) || 'código ' + c}`)); });
    p.stdin.end(stdin || '');
  }));

  let ultimo = null, ultimoT = 0;
  async function estado({ fresco = false } = {}) {
    if (!fresco && ultimo && ahora() - ultimoT < 8000) return ultimo;
    const c = conf();
    const crudo = await ssh(c.ssh, ['env', `CT=${Number(c.ct)}`, 'python3', '-'], PY_ESTADO);
    const d = JSON.parse(String(crudo).trim().split('\n').pop());
    const activo = (d.jobs || []).find(j => ['waiting', 'loading', 'running', 'checkpointing', 'paused'].includes(j.estado?.phase) && d.procesos > 0) || null;
    const perd = d.log?.perdidas || [];
    d.resumen = {
      fase: activo ? activo.estado.phase : 'parado', trabajo: activo?.id || null,
      paso: d.log?.paso ?? activo?.estado?.step ?? null, total: d.log?.total ?? null,
      loss: perd.length ? perd[perd.length - 1][0] : null, epoca: perd.length ? perd[perd.length - 1][1] : null,
      gpuDe: d.arbitro?.entrenamiento ? 'entrenamiento' : d.arbitro?.prioritarios ? 'prioritario (Ollama/Blender…)' : 'libre',
      motivo: d.arbitro?.motivo || '', ui: c.ui,
    };
    ultimo = d; ultimoT = ahora();
    return d;
  }

  const comillas = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
  async function lanzar({ config, resume } = {}) {
    const c = conf();
    config = config || c.config;
    if (!RUTA_OK.test(config) || (resume && !RUTA_OK.test(resume))) throw new Error('ruta no permitida (solo dentro de /srv/entrenamiento)');
    const e = await estado({ fresco: true });
    if (e.procesos > 0) throw new Error(`ya hay un entrenamiento en marcha (${e.resumen.fase})`);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const cmd = `mkdir -p ${DIR}/apolo-logs && cd ${DIR} && HF_HOME=${DIR}/cache/huggingface setsid nohup /opt/Soup/.venv/bin/python cola.py --config ${comillas(config)} --yes${resume ? ` --resume ${comillas(resume)}` : ''} > apolo-logs/${ts}.log 2>&1 < /dev/null &`;
    // en segundo plano EN EL HOST: pct exec retiene la sesión ssh mientras vive el hijo
    await ssh(c.ssh, ['bash', '-c', comillas(`nohup pct exec ${Number(c.ct)} -- su - ${c.usuario} -c ${comillas(cmd)} > /dev/null 2>&1 < /dev/null &`)]);
    ultimo = null;
    bus?.emit('entrenamiento', { accion: resume ? 'continuar' : 'iniciar' });
    return { ok: true, log: `${DIR}/apolo-logs/${ts}.log`, config, resume: resume || null };
  }
  async function iniciar(a = {}) { return lanzar({ config: a.config }); }
  async function continuar() {
    const e = await estado({ fresco: true });
    const j = (e.jobs || []).find(x => ['cancelled', 'paused', 'failed'].includes(x.estado?.phase) && (x.estado?.checkpoint || x.checkpoint?.checkpoint));
    if (!j) throw new Error('no hay ningún entrenamiento parado con checkpoint para continuar');
    const args = Array.isArray(j.arguments) ? j.arguments : [];
    const i = args.indexOf('--config');
    return lanzar({ config: i >= 0 ? args[i + 1] : undefined, resume: j.estado.checkpoint || j.checkpoint.checkpoint });
  }
  async function parar() {
    const c = conf();
    await ssh(c.ssh, ['pct', 'exec', String(Number(c.ct)), '--', 'pkill', '-TERM', '-x', 'soup-cola']).catch(er => { if (!/código 1/.test(er.message)) throw er; });
    ultimo = null;
    bus?.emit('entrenamiento', { accion: 'parar' });
    return { ok: true, texto: 'Pedido parar: si estaba entrenando, termina el paso actual, guarda un checkpoint completo y libera la GPU (se puede continuar luego).' };
  }

  // ---------- vigilancia: avisa de los cambios de fase ----------
  let faseAntes = null, temporizador = null;
  const TEXTOS = { running: '🧠 El entrenamiento está en marcha en Proxmox.', paused: '⏸ El entrenamiento cedió la GPU a una tarea prioritaria (checkpoint guardado). Seguirá solo.',
    completed: '✅ El entrenamiento terminó.', failed: '❌ El entrenamiento falló. Mira el panel → Entrenamiento.', cancelled: '⏹ Entrenamiento parado (checkpoint guardado, puedes continuarlo).' };
  async function vigilar() {
    if (conf().vigilar === false) return;
    let siguiente = 5 * 60_000;
    try {
      const e = await estado({ fresco: true });
      const j = (e.jobs || [])[0], fase = e.procesos > 0 ? (j?.estado?.phase || 'waiting') : (j?.estado?.phase || 'parado');
      if (faseAntes && fase !== faseAntes && TEXTOS[fase]) {
        const extra = e.resumen.paso != null && e.resumen.total ? ` Paso ${e.resumen.paso}/${e.resumen.total}${e.resumen.loss != null ? `, loss ${e.resumen.loss.toFixed(3)}` : ''}.` : '';
        bus?.emit('aviso-externo', { texto: TEXTOS[fase] + extra, urgente: fase === 'failed' || fase === 'completed', origen: 'Entrenamiento' });
      }
      faseAntes = fase;
      if (e.procesos > 0) siguiente = 60_000;
      bus?.emit('evento', { tipo: 'entrenamiento', resumen: e.resumen });
    } catch { siguiente = 10 * 60_000; }
    temporizador = setTimeout(vigilar, siguiente); temporizador.unref?.();
  }
  function empezarVigilancia() { if (!temporizador) { temporizador = setTimeout(vigilar, 15_000); temporizador.unref?.(); } }
  bus?.on?.('entrenamiento', () => { clearTimeout(temporizador); temporizador = setTimeout(vigilar, 8000); temporizador.unref?.(); });

  async function http(M, p, b = {}) {   // /v1/entrenamiento
    if (M === 'GET' && !p[2]) return await estado({ fresco: true });
    if (M === 'POST' && p[2] === 'iniciar') return await iniciar(b);
    if (M === 'POST' && p[2] === 'parar') return await parar();
    if (M === 'POST' && p[2] === 'continuar') return await continuar();
    throw Object.assign(new Error('ruta desconocida'), { status: 404 });
  }
  return { estado, iniciar, parar, continuar, http, empezarVigilancia, conf };
}

// ---------- herramientas del agente ----------
const INSTANCIAS = new WeakMap();
const conR = f => async (a, ctx) => { const R = INSTANCIAS.get(ctx?.cfg); if (!R) return 'error: el entrenamiento no está disponible aquí'; try { return await f(R, a || {}); } catch (e) { return `error: ${e.message}`; } };
const fmt = e => {
  const r = e.resumen, g = e.gpu || {};
  return [`Estado: ${r.fase}${r.trabajo ? ` (trabajo ${r.trabajo.slice(0, 8)})` : ''}`,
    r.paso != null ? `Progreso: paso ${r.paso}${r.total ? `/${r.total} (${Math.round(100 * r.paso / r.total)} %)` : ''}${r.epoca != null ? `, época ${r.epoca.toFixed(2)}` : ''}${r.loss != null ? `, loss ${r.loss.toFixed(4)}` : ''}` : '',
    g.nombre ? `GPU ${g.nombre}: ${g.usada}/${g.total} MiB, ${g.temp} °C, ${g.uso} % · la tiene: ${r.gpuDe}${r.motivo ? ` (${r.motivo})` : ''}` : '',
    `Últimos trabajos: ${(e.jobs || []).slice(0, 4).map(j => `${j.id.slice(0, 8)} ${j.estado?.phase || '?'}`).join(' · ') || 'ninguno'}`,
    `Interfaz Soup: ${r.ui}`].filter(Boolean).join('\n');
};
const HERRAMIENTAS = [
  { nombre: 'entrenamiento_estado', riesgo: 'lectura', parametros: { type: 'object', properties: {} }, resumen: () => '',
    descripcion: 'Estado del entrenamiento de modelos en Proxmox (CT107, Soup): fase, paso/total, loss, quién tiene la GPU (el entrenamiento cede ante Ollama/Blender), últimos trabajos.',
    ejecutar: conR(async R => fmt(await R.estado({ fresco: true }))) },
  { nombre: 'entrenamiento_iniciar', riesgo: 'escritura', parametros: { type: 'object', properties: { config: { type: 'string', description: 'yaml en /srv/entrenamiento (por defecto soup-python.yaml)' } } },
    resumen: a => a.config || 'configuración por defecto',
    descripcion: 'Empieza un entrenamiento en Proxmox por la cola gestionada (espera turno de GPU; cede y reanuda solo). Solo si el usuario lo pide.',
    ejecutar: conR(async (R, a) => { const r = await R.iniciar(a); return `Entrenamiento lanzado con ${r.config}. Espera turno de GPU y avisaré de los cambios. Log: ${r.log}`; }) },
  { nombre: 'entrenamiento_parar', riesgo: 'escritura', parametros: { type: 'object', properties: {} }, resumen: () => '',
    descripcion: 'Para el entrenamiento en curso guardando un checkpoint completo (se puede continuar luego con entrenamiento_continuar).',
    ejecutar: conR(async R => (await R.parar()).texto) },
  { nombre: 'entrenamiento_continuar', riesgo: 'escritura', parametros: { type: 'object', properties: {} }, resumen: () => '',
    descripcion: 'Continúa el último entrenamiento parado desde su checkpoint.',
    ejecutar: conR(async R => { const r = await R.continuar(); return `Continuando desde ${r.resume}. Log: ${r.log}`; }) },
];
function crear(o) { const R = crearEntrenamiento(o); INSTANCIAS.set(o.cfg, R); return R; }
module.exports = { crearEntrenamiento: crear, HERRAMIENTAS, PY_ESTADO };
