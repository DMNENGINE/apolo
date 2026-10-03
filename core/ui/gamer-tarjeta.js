// Tarjeta "Modo Gamer" para compartir (1080x1920, estilo Wrapped): +X FPS, antes/después, 1 % low, temperaturas, "medido con PresentMon".
// La usa core/gamer/bench.js (PNG por CDP) y el panel (vista previa en iframe). Datos: <script type="application/json" id="datos"> o window.parent.GM_TARJETA.
// window.listo = true cuando el robot 3D (core/ui/robot3d.js) ya pintó (o no hay WebGL y se queda el casco SVG).
(function () {
  'use strict';
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/gamer-tarjeta\.js.*$/, '') || '/';
  const leer = () => { const el = document.getElementById('datos'); if (el) try { return JSON.parse(el.textContent); } catch { } try { return window.parent.GM_TARJETA; } catch { return null; } };
  const D = leer() || {};
  if (window.I18N && D.idioma) try { window.I18N.poner(D.idioma); } catch { }
  const tr = window.tr || (s => s);
  const T = (s, v) => String(tr(s)).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  const loc = (() => { try { return window.I18N?.locale?.() || 'es'; } catch { return 'es'; } })();
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(+n) ? '—' : Number(n).toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }));
  if (window.I18N?.dic?.en) Object.assign(window.I18N.dic.en, {
    'MODO GAMER': 'GAMER MODE', 'BENCHMARK ANTES / DESPUÉS': 'BEFORE / AFTER BENCHMARK', 'FPS más': 'more FPS', 'FPS menos': 'fewer FPS', 'de {a} a {d} FPS de media ({p} %)': 'from {a} to {d} FPS average ({p} %)',
    'Antes': 'Before', 'Con {n}': 'With {n}', 'FPS medio': 'Avg FPS', '1 % low': '1% low', '0,1 % low': '0.1% low', 'Tirones': 'Stutters',
    'GPU máx.': 'GPU max', 'Uso GPU': 'GPU use', 'Uso CPU': 'CPU use', 'medido con PresentMon · {s} s + {s} s · mismo juego': 'measured with PresentMon · {s} s + {s} s · same game',
    'Sin mejora esta vez: el PC ya iba fino.': 'No gain this time: the PC was already tuned.', 'frenó por calor': 'thermal throttled',
  });

  const a = D.antes || {}, d = D.despues || {}, dl = D.delta || {}, nombre = D.nombre || 'APOLO';
  const sube = (dl.fps || 0) > 0.4;
  const gpuMax = Math.max(a.sensores?.gpu?.tempMax ?? -1, d.sensores?.gpu?.tempMax ?? -1);
  const throttle = !!(a.sensores?.gpu?.throttleTermico || d.sensores?.gpu?.throttleTermico);
  const juego = String(D.juego || 'juego').replace(/\.exe$/i, '');
  const fecha = D.fecha ? new Date(D.fecha).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const barra = (et, va, vd, dec = 0) => {
    const max = Math.max(va || 0, vd || 0, 1);
    return `<div class="fila"><div class="et">${esc(T(et))}</div>
      <div class="bar"><i style="width:${(100 * (va || 0) / max).toFixed(1)}%"></i><span>${num(va, dec)}</span></div>
      <div class="bar d"><i style="width:${(100 * (vd || 0) / max).toFixed(1)}%"></i><span>${num(vd, dec)}</span></div></div>`;
  };

  const css = `
  :root{--a:#2bdc7c;--t:#f4f7f5;--s:#8b9a92;--r:#ff6b5d}
  *{box-sizing:border-box}html,body{margin:0;height:100%;background:#000;overflow:hidden}
  body{font-family:"Segoe UI Variable Display","Segoe UI",Inter,system-ui,sans-serif;color:var(--t);-webkit-font-smoothing:antialiased}
  #esc{position:fixed;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:#020403;transform-origin:0 0}
  .b{position:absolute;border-radius:50%;filter:blur(150px)}
  .b1{width:1000px;height:1000px;left:-300px;top:-260px;background:var(--a);opacity:.32}.b2{width:1100px;height:1100px;right:-420px;bottom:-300px;background:#0b4d2c;opacity:.75}
  .rej{position:absolute;left:-50%;right:-50%;bottom:-6%;height:40%;transform:perspective(700px) rotateX(64deg);transform-origin:50% 100%;opacity:.5;
    background:repeating-linear-gradient(90deg,rgba(43,220,124,.25) 0 2px,transparent 2px 90px),repeating-linear-gradient(0deg,rgba(43,220,124,.2) 0 2px,transparent 2px 90px);
    -webkit-mask:linear-gradient(transparent,#000 70%);mask:linear-gradient(transparent,#000 70%)}
  .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 2px,transparent 2px 6px)}
  .cab{position:absolute;top:80px;left:64px;right:64px;display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;z-index:5}
  .cab .logo{display:flex;gap:16px;align-items:center}.cab .logo i{width:22px;height:22px;border-radius:50%;background:var(--a);box-shadow:0 0 24px var(--a)}.cab .f{color:var(--s)}
  #robot{position:absolute;right:30px;top:170px;width:380px;height:380px;z-index:4;filter:drop-shadow(0 0 50px rgba(43,220,124,.45))}
  #robot canvas,#robot svg{width:100%!important;height:100%!important;display:block}
  .cont{position:absolute;inset:0;padding:200px 64px 140px;z-index:5;display:flex;flex-direction:column}
  .ceja{font-size:30px;max-width:620px;font-weight:800;letter-spacing:.22em;color:var(--a);text-transform:uppercase}
  .juego{font-size:${juego.length <= 8 ? 104 : juego.length <= 12 ? 84 : juego.length <= 18 ? 60 : 46}px;line-height:.95;font-weight:900;letter-spacing:-.03em;text-transform:uppercase;margin-top:18px;max-width:640px;overflow-wrap:anywhere}
  .gig{margin-top:70px;font-size:330px;line-height:.8;font-weight:900;letter-spacing:-.06em;color:var(--a);text-shadow:0 0 90px rgba(43,220,124,.5)}
  .gig.mal{color:var(--t);text-shadow:none}
  .gig small{font-size:.3em;letter-spacing:-.01em;color:var(--t);text-shadow:none;margin-left:.12em}
  .sub{font-size:44px;font-weight:650;color:#cfd9d3;margin-top:26px}
  .leyenda{display:flex;gap:36px;margin:64px 0 18px;font-size:28px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--s)}
  .leyenda span{display:flex;align-items:center;gap:12px}.leyenda i{width:30px;height:16px;border-radius:5px;background:rgba(255,255,255,.28)}.leyenda .d i{background:var(--a)}
  .fila{display:grid;grid-template-columns:230px 1fr;grid-template-rows:auto auto;column-gap:26px;row-gap:10px;padding:20px 0;border-bottom:2px solid rgba(255,255,255,.07)}
  .fila .et{grid-row:span 2;font-size:34px;font-weight:800;align-self:center}
  .bar{position:relative;height:50px;border-radius:12px;background:rgba(255,255,255,.05);overflow:hidden}
  .bar i{position:absolute;inset:0 auto 0 0;background:rgba(255,255,255,.22);border-radius:12px}.bar.d i{background:linear-gradient(90deg,#1c9c58,var(--a))}
  .bar span{position:absolute;right:18px;top:50%;transform:translateY(-50%);font-size:32px;font-weight:900}.bar.d span{color:#03140a}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:46px}
  .kpi{background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.1);border-radius:28px;padding:26px 22px}
  .kpi b{display:block;font-size:62px;font-weight:900;letter-spacing:-.03em;line-height:1}.kpi span{font-size:23px;font-weight:800;letter-spacing:.08em;color:var(--s);text-transform:uppercase}
  .kpi.mal{border-color:rgba(255,107,93,.6)}.kpi.mal b{color:var(--r)}
  .pie{margin-top:auto;text-align:center;font-size:30px;font-weight:700;color:#a9b8b0}
  .marca{position:absolute;bottom:56px;left:0;right:0;text-align:center;font-size:30px;font-weight:800;letter-spacing:.32em;color:rgba(255,255,255,.55);text-transform:uppercase;z-index:5}.marca b{color:var(--a)}`;
  const casco = `<svg viewBox="0 0 64 64"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7584"/><stop offset=".55" stop-color="#3a414c"/><stop offset="1" stop-color="#1f242b"/></linearGradient></defs>
    <path d="M10 31C10 17 20 7 32 7s22 10 22 24v9c0 9-7 16-16 16H26c-9 0-16-7-16-16z" fill="url(#cg)"/><rect x="15" y="25" width="34" height="15" rx="7.5" fill="#05140b"/>
    <rect x="22.5" y="29.5" width="6" height="6" rx="2" fill="#2bdc7c"/><rect x="35.5" y="29.5" width="6" height="6" rx="2" fill="#2bdc7c"/></svg>`;
  const signo = n => (n > 0 ? '+' : n < 0 ? '−' : '±');
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  document.body.insertAdjacentHTML('beforeend', `<div id="esc"><div class="b b1"></div><div class="b b2"></div><div class="rej"></div><div class="scan"></div>
    <div class="cab"><div class="logo"><i></i>${esc(nombre)} · ${esc(T('MODO GAMER'))}</div><div class="f">${esc(fecha)}</div></div>
    <div id="robot">${casco}</div>
    <div class="cont">
      <div class="ceja">${esc(T('BENCHMARK ANTES / DESPUÉS'))}</div>
      <div class="juego">${esc(juego)}</div>
      <div class="gig${sube ? '' : ' mal'}">${signo(dl.fps || 0)}${num(Math.abs(dl.fps || 0), Math.abs(dl.fps || 0) < 10 ? 1 : 0)}<small>FPS</small></div>
      <div class="sub">${sube ? esc(T('de {a} a {d} FPS de media ({p} %)', { a: num(a.fps), d: num(d.fps), p: `${signo(dl.pct || 0)}${num(Math.abs(dl.pct || 0), 1)}` })) : esc(T('Sin mejora esta vez: el PC ya iba fino.'))}</div>
      <div class="leyenda"><span><i></i>${esc(T('Antes'))}</span><span class="d"><i></i>${esc(T('Con {n}', { n: nombre }))}</span></div>
      ${barra('FPS medio', a.fps, d.fps)}${barra('1 % low', a.low1, d.low1)}${barra('0,1 % low', a.low01, d.low01)}
      <div class="kpis">
        <div class="kpi${throttle || gpuMax >= 87 ? ' mal' : ''}"><b>${gpuMax >= 0 ? `${num(gpuMax)}°` : '—'}</b><span>${esc(T(throttle ? 'frenó por calor' : 'GPU máx.'))}</span></div>
        <div class="kpi"><b>${num(d.sensores?.gpu?.usoMedio)}%</b><span>${esc(T('Uso GPU'))}</span></div>
        <div class="kpi"><b>${num(d.sensores?.cpu?.usoMedio)}%</b><span>${esc(T('Uso CPU'))}</span></div>
        <div class="kpi"><b>${num(d.tirones, 1)}%</b><span>${esc(T('Tirones'))}</span></div>
      </div>
      <div class="pie">${esc(T('medido con PresentMon · {s} s + {s} s · mismo juego', { s: D.segundos || 60 }))}</div>
    </div>
    <div class="marca"><b>${esc(nombre)}</b> · open source</div></div>`);
  const ajustar = () => { const k = Math.min(innerWidth / 1080, innerHeight / 1920); const e = document.getElementById('esc'); e.style.transform = `translate(${(innerWidth - 1080 * k) / 2}px,${(innerHeight - 1920 * k) / 2}px) scale(${k})`; };
  ajustar(); addEventListener('resize', ajustar);

  (async () => {
    try {
      const m = await import(BASE + 'robot3d.js');
      const cv = document.createElement('canvas');
      const robot = m.createRobot(cv, BASE + 'casco.glb', { animacion: 'raton', log: ['> modo gamer', `> ${signo(dl.fps || 0)}${num(Math.abs(dl.fps || 0), 1)} fps`] });
      const caja = document.getElementById('robot'); caja.innerHTML = ''; caja.append(cv);
      robot.setFps?.(20); robot.setState?.(sube ? 'listo' : 'reposo');
      await new Promise(ok => setTimeout(ok, 1500));
    } catch (e) { console.warn('robot 3D no disponible', e); }
    window.listo = true;
  })();
})();
