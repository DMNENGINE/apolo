// Fase 3 · registro de lo que hizo el robot con tus manos: una carpeta por conversación
//   <dir>/capturas/<sesion>/NNN.jpg   capturas (ver_pantalla y la comprobación tras cada acción)
//   <dir>/capturas/<sesion>/acciones.jsonl   {n, t, tipo:'ver'|'accion', op, accion, imagen, ventana, cambio, nada}
// Las ventanas protegidas nunca dejan imagen. Todo se borra a las 24 h (escritorio/index.js limpiarViejas).
// Mission Control ("Lo que hizo") lo lee por /v1/capturas y puede exportar un time-lapse vertical MP4 con marca de agua APOLO
// (mismo grabador CDP + ffmpeg que el vídeo del turno de noche).
const fs = require('fs');
const path = require('path');

const escH = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seguro = id => String(id || '').replace(/[^\w-]/g, '').slice(0, 80);
const pad = n => String(n).padStart(3, '0');
const err = (m, status = 400) => Object.assign(new Error(m), { status });

function crearRegistroCapturas({ cfg, sesiones, video }) {
  const raiz = () => path.join(cfg.dir, 'capturas');
  const dirDe = id => { const s = seguro(id); if (!s) throw err('sesión'); return path.join(raiz(), s); };
  const contadores = new Map();
  const enCurso = new Map();                               // sesion -> promesa del vídeo

  // siguiente número de captura de la sesión → { n, archivo, ruta }
  function siguiente(id) {
    const d = dirDe(id); fs.mkdirSync(d, { recursive: true });
    let n = contadores.get(id);
    if (n == null) {
      n = 0;
      for (const f of fs.readdirSync(d)) { const m = f.match(/^(\d+)\.jpg$/); if (m) n = Math.max(n, +m[1]); }
      for (const e of entradas(id)) n = Math.max(n, e.n || 0);
    }
    n++; contadores.set(id, n);
    return { n, archivo: `${pad(n)}.jpg`, ruta: path.join(d, `${pad(n)}.jpg`) };
  }

  function anotar(id, e) {
    const d = dirDe(id); fs.mkdirSync(d, { recursive: true });
    const n = e.n ?? siguiente(id).n;
    const fila = { n, t: Date.now(), ...e };
    if (fila.imagen && !fs.existsSync(path.join(d, fila.imagen))) fila.imagen = null;
    fs.appendFileSync(path.join(d, 'acciones.jsonl'), JSON.stringify(fila) + '\n');
    return fila;
  }

  function entradas(id) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dirDe(id), 'acciones.jsonl'), 'utf8'); } catch { return []; }
    const d = dirDe(id);
    return txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
      .map(e => (e.imagen && !fs.existsSync(path.join(d, e.imagen)) ? { ...e, imagen: null } : e));
  }

  function titulo(id) { try { return sesiones?.obtener(id)?.titulo || ''; } catch { return ''; } }

  function lista() {
    let dirs = []; try { dirs = fs.readdirSync(raiz(), { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return []; }
    return dirs.map(d => {
      const es = entradas(d.name); if (!es.length) return null;
      const conImg = es.filter(e => e.imagen);
      let video = null; try { video = fs.statSync(path.join(raiz(), d.name, 'video.mp4')).mtimeMs; } catch { }
      return { sesion: d.name, titulo: titulo(d.name), acciones: es.filter(e => e.tipo === 'accion').length, capturas: conImg.length,
        inicio: es[0].t, fin: es.at(-1).t, portada: conImg.at(-1)?.imagen || null, video };
    }).filter(Boolean).sort((a, b) => b.fin - a.fin);
  }

  function borrar(id) { fs.rmSync(dirDe(id), { recursive: true, force: true }); contadores.delete(id); return { ok: true }; }

  // ---------- time-lapse vertical (1080x1920) ----------
  function paginaTimelapse(id, es, { nombre = 'APOLO' } = {}) {
    const fotos = es.filter(e => e.imagen);
    const dur = Math.max(0.6, Math.min(2.2, 24 / Math.max(1, fotos.length)));
    const segundos = 1.6 + fotos.length * dur + 1.8;
    const t0 = fotos[0]?.t || Date.now(), t1 = fotos.at(-1)?.t || t0;
    const mins = Math.max(1, Math.round((t1 - t0) / 60000));
    const datos = fotos.map((e, i) => ({ img: e.imagen, txt: e.tipo === 'ver' ? 'Mira la pantalla' : (e.accion || e.op || ''), cambio: e.cambio || '', nada: !!e.nada,
      hora: new Date(e.t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), i: i + 1 }));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escH(nombre)} · time-lapse</title><style>
  *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#07110c;color:#e8fff2;font-family:"Segoe UI",system-ui,sans-serif}
  .fondo{position:fixed;inset:0;background:radial-gradient(1200px 900px at 50% 30%,#0f2a1c 0,#07110c 60%)}
  .marca{position:fixed;top:70px;left:0;right:0;text-align:center;font-weight:800;letter-spacing:18px;font-size:64px;color:#34e07f;text-shadow:0 0 30px rgba(52,224,127,.45)}
  .sub{position:fixed;top:160px;left:0;right:0;text-align:center;font-size:30px;color:#9fd8b6;letter-spacing:2px}
  .marco{position:fixed;left:40px;right:40px;top:300px;height:820px;border-radius:28px;overflow:hidden;border:3px solid #1f6b43;box-shadow:0 0 60px rgba(52,224,127,.18);background:#000}
  .marco img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .25s}
  .marco img.on{opacity:1}
  .paso{position:fixed;left:60px;right:60px;top:1170px;font-size:54px;font-weight:700;line-height:1.2;min-height:200px}
  .cambio{position:fixed;left:60px;right:60px;top:1400px;font-size:34px;color:#9fd8b6;line-height:1.3}
  .cambio.mal{color:#ffb23d}
  .meta{position:fixed;left:60px;right:60px;top:1100px;font-size:28px;color:#5fae84;display:flex;justify-content:space-between}
  .barra{position:fixed;left:60px;right:60px;bottom:210px;height:10px;border-radius:6px;background:#12301f;overflow:hidden}
  .barra i{display:block;height:100%;width:0;background:#34e07f}
  .pie{position:fixed;bottom:110px;left:0;right:0;text-align:center;font-size:30px;color:#5fae84;letter-spacing:3px}
  .pie b{color:#34e07f}
  .agua{position:fixed;right:70px;top:1050px;font-size:22px;color:rgba(52,224,127,.55);font-weight:800;letter-spacing:6px}
  .portada,.cierre{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:#07110c;transition:opacity .4s}
  .portada h1,.cierre h1{font-size:96px;margin:0 0 20px;color:#34e07f;letter-spacing:10px}
  .portada p,.cierre p{font-size:40px;margin:8px 80px;color:#cfeedd}
  .oculto{opacity:0;pointer-events:none}
</style></head><body><div class="fondo"></div>
<div class="marca">${escH(nombre)}</div><div class="sub">TIME-LAPSE · LO QUE HIZO EN TU PC</div>
<div class="marco" id="marco">${datos.map((d, i) => `<img data-i="${i}" src="${escH(d.img)}">`).join('')}</div>
<div class="agua">${escH(nombre)}</div>
<div class="meta"><span id="num"></span><span id="hora"></span></div>
<div class="paso" id="paso"></div><div class="cambio" id="cambio"></div>
<div class="barra"><i id="barra"></i></div>
<div class="pie"><b>${escH(nombre)}</b> · open source</div>
<div class="portada" id="portada"><h1>${escH(nombre)}</h1><p>usó tu ratón y teclado</p><p>${datos.length} pasos · ${mins} min</p><p style="color:#5fae84;font-size:32px">${escH(titulo(id) || '')}</p></div>
<div class="cierre oculto" id="cierre"><h1>HECHO</h1><p>${datos.filter(d => d.txt !== 'Mira la pantalla').length} acciones comprobadas</p><p style="color:#5fae84">${escH(nombre)} · open source</p></div>
<script>
const D=${JSON.stringify(datos).replace(/</g, '\\u003c')}, DUR=${dur.toFixed(3)};
const imgs=[...document.querySelectorAll('#marco img')];
Promise.all(imgs.map(i=>i.decode?i.decode().catch(()=>{}):0)).then(()=>{window.listo=true});
if(!imgs.length) window.listo=true;
function ver(i){imgs.forEach((im,k)=>im.classList.toggle('on',k===i));const d=D[i];
  document.getElementById('paso').textContent=d.txt;const c=document.getElementById('cambio');c.textContent=d.nada?'⚠ no cambió nada':(d.cambio||'');c.className='cambio'+(d.nada?' mal':'');
  document.getElementById('num').textContent='PASO '+d.i+' / '+D.length;document.getElementById('hora').textContent=d.hora;
  document.getElementById('barra').style.width=((i+1)/D.length*100)+'%';}
window.empezar=function(){
  setTimeout(()=>{document.getElementById('portada').classList.add('oculto');let i=0;
    const sig=()=>{if(i>=D.length){document.getElementById('cierre').classList.remove('oculto');setTimeout(()=>{window.terminado=true},1800);return;}ver(i++);setTimeout(sig,DUR*1000);};sig();},1600);
};
if(!/grabar/.test(location.hash)) window.empezar();
</script></body></html>`;
    return { html, segundos, pasos: datos.length };
  }

  async function timelapse(id, opciones = {}) {
    const d = dirDe(id);
    const es = entradas(id);
    if (!es.some(e => e.imagen)) throw err('esta conversación no tiene capturas', 404);
    const nombre = opciones.nombre || cfg.nombre || 'APOLO';
    const { html, segundos, pasos } = paginaTimelapse(id, es, { nombre });
    fs.writeFileSync(path.join(d, 'video.html'), html);
    const v = video || require('../turno-video');
    const nav = v.buscarNavegador(opciones.navegador);
    if (!nav) return { ok: false, html: 'video.html', segundos, pasos, motivo: 'no encontré Chrome/Edge para grabar: abre video.html para verlo' };
    if (!(await v.hayFfmpeg(opciones.ffmpeg))) return { ok: false, html: 'video.html', segundos, pasos, motivo: 'ffmpeg no está en el PATH: abre video.html para verlo' };
    const t0 = Date.now();
    const r = await v.grabar({ dir: d, segundos, navegador: nav, ffmpeg: opciones.ffmpeg, ancho: opciones.ancho || 1080, alto: opciones.alto || 1920 });
    return { ok: true, mp4: 'video.mp4', segundos: r.segundos, frames: r.frames, pasos, ms: Date.now() - t0 };
  }

  // API /v1/capturas
  async function http(M, p, b = {}) {
    if (!p[2] && M === 'GET') return { sesiones: lista() };
    const id = seguro(p[2]); if (!id) throw err('ruta', 404);
    if (!p[3] && M === 'GET') return { sesion: id, titulo: titulo(id), entradas: entradas(id), video: fs.existsSync(path.join(dirDe(id), 'video.mp4')) };
    if (!p[3] && M === 'DELETE') return borrar(id);
    if (p[3] === 'video' && M === 'POST') {
      if (!enCurso.has(id)) enCurso.set(id, timelapse(id, b).finally(() => enCurso.delete(id)));
      const r = await enCurso.get(id);
      return { ...r, url: r.mp4 ? `/v1/capturas/${id}/video.mp4` : null };
    }
    if (p[3] && M === 'GET') {
      const f = decodeURIComponent(p[3]);
      if (!/^(\d{3,}(\.rejilla)?\.jpg|video\.mp4|video\.html)$/.test(f)) throw err('archivo', 404);
      const ruta = path.join(dirDe(id), f);
      if (!fs.existsSync(ruta)) throw err('no existe', 404);
      return { __archivo: ruta, ...(f === 'video.mp4' ? { nombre: `apolo-timelapse-${id.slice(0, 8)}.mp4` } : {}) };
    }
    throw err('ruta', 404);
  }

  return { siguiente, anotar, entradas, lista, borrar, timelapse, paginaTimelapse, http, dirDe };
}

module.exports = { crearRegistroCapturas };
