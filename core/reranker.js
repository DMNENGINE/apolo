// Reranker de la memoria (Qwen3-Reranker-0.6B, tools/rerank_srv.py): reordena los candidatos de la búsqueda híbrida
// leyendo consulta y recuerdo juntos. Ligero y prescindible:
//   - proceso Python bajo demanda; solo GPU y solo si hay ≥ 2 GB de VRAM libres (Ollama/ComfyUI tienen prioridad)
//   - la 1.ª búsqueda no espera a que cargue (~10 s): usa la híbrida y lo deja cargando para las siguientes
//   - cada llamada tiene 900 ms; si no llega, la híbrida de siempre. 3 fallos seguidos = 10 min sin reranker
//   - se descarga tras 10 min sin uso. Solo se usa con cfg.memoria.reranker = true (ver abajo por qué).
//   const rr = crearReranker(cfg); await rr.reordenar(consulta, textos) → [puntuación 0-1] | null
const path = require('path');
const { spawn, execFile } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'tools', 'rerank_srv.py');
const fuera = p => { try { return require('./rutas').fuera(p); } catch { return p; } };   // fuera del asar si lo hay

function crearReranker(cfg = {}) {
  // OPT-IN (cfg.memoria.reranker = true). Apagado por defecto: con 2.567 recuerdos la híbrida ya acertaba en las pruebas
  // (2026-11-01) y con la GPU ocupada (ComfyUI al 95 %) cada mensaje esperaría el tope de 900 ms sin ganar nada.
  // También apagado a mano o bajo `node --test` (un proceso Python vivo dejaría colgado el test).
  if (cfg.memoria?.reranker !== true || process.env.APOLO_SIN_RERANKER || process.env.NODE_TEST_CONTEXT) return null;
  let proc = null, listo = false, buf = '', id = 0, pausaHasta = 0, fallos = 0, apagar = null, arrancando = false, salidaEnganchada = false;
  const esperas = new Map();

  const vramLibre = () => new Promise(ok => execFile('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 4000 },
    (e, out) => ok(e ? 0 : parseInt(String(out).trim().split(/\r?\n/)[0], 10) || 0)));
  const pausar = ms => { pausaHasta = Date.now() + ms; };
  function descargar() { try { proc && proc.kill(); } catch { } }
  function apagarLuego() { clearTimeout(apagar); apagar = setTimeout(descargar, 600_000); apagar.unref?.(); }

  async function arrancar() {
    if (proc || arrancando || Date.now() < pausaHasta) return;
    arrancando = true;
    try {
      if (await vramLibre() < 2000) { pausar(120_000); return; }
      const p = proc = spawn('python', [fuera(SCRIPT)], { windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', TRANSFORMERS_VERBOSITY: 'error' } });
      buf = '';
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.ready) { listo = true; apagarLuego(); continue; }
          const w = esperas.get(j.id); if (w) { esperas.delete(j.id); w(j); }
        }
      });
      p.stderr.on('data', () => { });
      const fin = () => {
        if (proc !== p) return;
        if (!listo) pausar(600_000);                         // no arrancó (sin Python/torch/CUDA o sin el modelo): 10 min
        proc = null; listo = false;
        for (const w of esperas.values()) w({}); esperas.clear();
      };
      p.on('error', fin); p.on('exit', fin);
      p.stdin.on('error', () => { });
      // (NO hacer unref de los pipes: en Windows Node aborta al salir con "UV_HANDLE_CLOSING"; se mata al salir)
      if (!salidaEnganchada) { salidaEnganchada = true; process.once('exit', descargar); }
    } finally { arrancando = false; }
  }

  async function reordenar(consulta, textos, { timeout = 900 } = {}) {
    if (!textos?.length || Date.now() < pausaHasta) return null;
    if (!listo) { arrancar(); return null; }
    apagarLuego();
    return new Promise(ok => {
      const n = ++id;
      const t = setTimeout(() => { esperas.delete(n); if (++fallos >= 3) { fallos = 0; pausar(600_000); descargar(); } ok(null); }, timeout);
      esperas.set(n, r => {
        clearTimeout(t);
        if (Array.isArray(r.scores) && r.scores.length === textos.length) { fallos = 0; ok(r.scores); } else ok(null);
      });
      try { proc.stdin.write(JSON.stringify({ id: n, q: String(consulta).slice(0, 1000), docs: textos }) + '\n'); }
      catch { esperas.delete(n); clearTimeout(t); ok(null); }
    });
  }

  return { reordenar, precargar: arrancar, cerrar: descargar, estado: () => ({ listo, pausado: Date.now() < pausaHasta }) };
}

module.exports = { crearReranker };
