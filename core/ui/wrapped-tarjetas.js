// APOLO Wrapped · tarjetas verticales 1080x1920 (estilo "stories"): las usa el panel (iframe wrapped.html), la grabación del vídeo
// y las capturas PNG (core/wrapped.js). Sin librerías; el robot 3D es core/ui/robot3d.js.
// Datos: <script type="application/json" id="datos"> (grabación/PNG) o window.parent.WR_DATOS (panel).
// Modos por hash: #grabar (espera a empezar(), lo llama la grabación) · #quieto (PNG: sin animaciones) · normal (reproduce y se toca para avanzar).
// API: window.WR = { total, ir(i, quieto), siguiente(), anterior(), pausa(bool), recargar(datos) } · window.listo / empezar() / terminado (grabación)
(function () {
  'use strict';
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/wrapped-tarjetas\.js.*$/, '') || '/';
  const enPanel = (() => { try { return window.parent !== window && !!window.parent.WR_DATOS; } catch { return false; } })();
  const tr = (() => { try { if (enPanel && window.parent.tr) return window.parent.tr; } catch { } return window.tr || ((s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m)) : s)); })();
  const T = (s, v) => { let x = tr(s, v); if (v && v.n !== undefined && x.includes('|')) { const p = x.split('|'); x = (+v.n === 1 ? p[0] : p[1]).replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m)); } return x; };
  const locale = () => { try { return (enPanel ? window.parent.I18N : window.I18N)?.locale?.() || 'es'; } catch { return 'es'; } };
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, dec = 0) => Number(n || 0).toLocaleString(locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const modo = /quieto/.test(location.hash) ? 'quieto' : /grabar/.test(location.hash) ? 'grabar' : 'normal';

  function leerDatos() {
    const el = document.getElementById('datos');
    if (el) try { return JSON.parse(el.textContent); } catch { }
    try { return window.parent.WR_DATOS; } catch { return null; }
  }
  let D = leerDatos() || {};
  if (!enPanel && window.I18N && D.idioma) window.I18N.poner(D.idioma);

  // ---------- estilos ----------
  const css = `
  :root{--a:#2bdc7c;--a2:#9dffcb;--n:#000;--t:#f4f7f5;--s:#8b9a92}
  *{box-sizing:border-box}html,body{margin:0;height:100%;background:#000;overflow:hidden;-webkit-font-smoothing:antialiased}
  body{font-family:"Segoe UI Variable Display","Segoe UI",Inter,system-ui,-apple-system,sans-serif;color:var(--t);user-select:none}
  #esc{position:fixed;left:50%;top:50%;width:1080px;height:1920px;transform-origin:0 0;overflow:hidden;background:#020403}
  .fondo{position:absolute;inset:0;overflow:hidden;z-index:0}
  .fondo .b{position:absolute;width:900px;height:900px;border-radius:50%;filter:blur(140px);opacity:.42;background:var(--a);transition:transform 1.6s cubic-bezier(.6,0,.2,1),opacity 1.2s;will-change:transform}
  .fondo .b2{background:#0b4d2c;opacity:.7;width:1100px;height:1100px}
  .fondo .rej{position:absolute;left:-50%;right:-50%;bottom:-6%;height:46%;transform:perspective(700px) rotateX(64deg);transform-origin:50% 100%;
    background:linear-gradient(transparent 0 0),repeating-linear-gradient(90deg,color-mix(in srgb,var(--a) 26%,transparent) 0 2px,transparent 2px 90px),repeating-linear-gradient(0deg,color-mix(in srgb,var(--a) 22%,transparent) 0 2px,transparent 2px 90px);
    -webkit-mask:linear-gradient(transparent,#000 70%);mask:linear-gradient(transparent,#000 70%);animation:suelo 4s linear infinite;opacity:.55}
  @keyframes suelo{to{background-position:0 0,0 0,0 90px}}
  .fondo .ruido{position:absolute;inset:0;opacity:.09;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  .fondo .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 2px,transparent 2px 6px)}
  .barras{position:absolute;top:44px;left:48px;right:48px;display:flex;gap:10px;z-index:9}.barras i{flex:1;height:7px;border-radius:9px;background:rgba(255,255,255,.2);overflow:hidden}.barras i b{display:block;height:100%;width:0;background:#fff}
  .cab{position:absolute;top:84px;left:56px;right:56px;display:flex;align-items:center;justify-content:space-between;z-index:9;font-size:30px;letter-spacing:.22em;font-weight:800;text-transform:uppercase}
  .cab .logo{display:flex;align-items:center;gap:16px}.cab .logo i{width:22px;height:22px;border-radius:50%;background:var(--a);box-shadow:0 0 24px var(--a)}
  .cab .per{color:var(--s);font-weight:700}
  .marca{position:absolute;bottom:52px;left:0;right:0;text-align:center;z-index:9;font-size:30px;letter-spacing:.32em;font-weight:800;color:rgba(255,255,255,.55);text-transform:uppercase}
  .marca b{color:var(--a)}
  #robot{position:absolute;z-index:4;width:600px;height:600px;left:240px;top:520px;transition:all 1.1s cubic-bezier(.65,0,.2,1);filter:drop-shadow(0 0 60px color-mix(in srgb,var(--a) 45%,transparent))}
  #robot canvas,#robot svg{width:100%!important;height:100%!important;display:block}
  #robot.esquina{width:300px;height:300px;left:730px;top:150px}
  #robot.abajo{width:420px;height:420px;left:600px;top:1330px}
  #robot.izq{width:340px;height:340px;left:40px;top:1380px}
  #robot.oculto{opacity:0;transform:scale(.6)}
  #robot svg{animation:flota 3.4s ease-in-out infinite}@keyframes flota{50%{transform:translateY(-14px)}}
  .carta{position:absolute;inset:0;z-index:5;padding:230px 72px 150px;display:flex;flex-direction:column;opacity:0;pointer-events:none;transition:opacity .45s}
  .carta.on{opacity:1}
  .e{opacity:0;transform:translateY(60px)}
  .carta.on .e{animation:entra .9s calc(var(--d,0)*1s + .25s) both cubic-bezier(.2,.9,.2,1)}
  @keyframes entra{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
  .carta.on .zoom{animation:zoom 1s calc(var(--d,0)*1s + .2s) both cubic-bezier(.2,1.4,.3,1)}@keyframes zoom{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
  .ceja{font-size:38px;letter-spacing:.24em;font-weight:800;color:var(--a);text-transform:uppercase}
  .h{font-size:92px;line-height:.98;font-weight:900;letter-spacing:-.02em;margin:22px 0 0}
  .gigante{font-size:400px;line-height:.82;font-weight:900;letter-spacing:-.06em;color:var(--a);text-shadow:0 0 80px color-mix(in srgb,var(--a) 50%,transparent)}
  .gigante small{font-size:.32em;letter-spacing:-.02em;color:var(--t);text-shadow:none;margin-left:.1em}
  .sub{font-size:46px;line-height:1.2;color:#cfd9d3;font-weight:600;margin-top:20px}
  .sub b{color:var(--t)}
  .chip{display:inline-flex;align-items:center;gap:12px;font-size:32px;font-weight:800;padding:14px 28px;border-radius:99px;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14)}
  .chip.a{color:var(--a);border-color:color-mix(in srgb,var(--a) 60%,transparent);background:color-mix(in srgb,var(--a) 12%,transparent)}
  .chip.m{color:#ff8a8a;border-color:rgba(255,138,138,.4)}
  .panel{background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02));border:2px solid rgba(255,255,255,.1);border-radius:44px;padding:40px 46px;backdrop-filter:blur(8px)}
  .fila{display:flex;gap:26px}.fila>*{flex:1}
  .kpi b{display:block;font-size:110px;font-weight:900;letter-spacing:-.04em;line-height:1}.kpi>span{font-size:30px;color:var(--s);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .kpi.a b{color:var(--a)}
  .letrero{position:absolute;left:-40px;right:-40px;white-space:nowrap;font-size:170px;font-weight:900;letter-spacing:-.03em;line-height:1;color:transparent;-webkit-text-stroke:3px color-mix(in srgb,var(--a) 60%,transparent);opacity:.5;z-index:-1}
  .carta.on .letrero{animation:desliza 14s linear both}.carta.on .letrero.inv{animation-direction:reverse}@keyframes desliza{from{transform:translateX(0)}to{transform:translateX(-30%)}}
  /* portada */
  .c-portada{justify-content:flex-end;padding-bottom:230px}
  .c-portada .titulo{font-size:200px;line-height:.86;font-weight:900;letter-spacing:-.05em;text-transform:uppercase}
  .c-portada .titulo .ac{color:var(--a);text-shadow:0 0 90px color-mix(in srgb,var(--a) 60%,transparent)}
  .c-portada .w{display:inline-block;font-size:64px;font-weight:900;letter-spacing:.3em;color:#000;background:var(--a);padding:8px 26px;border-radius:14px;margin-top:26px;text-transform:uppercase}
  .pila{position:absolute;top:180px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:0;z-index:-1}
  .pila span{font-size:230px;font-weight:900;line-height:.86;letter-spacing:-.05em;text-transform:uppercase;color:transparent;-webkit-text-stroke:3px color-mix(in srgb,var(--a) 55%,transparent)}
  .pila span:nth-child(2){color:color-mix(in srgb,var(--a) 14%,transparent)}
  .carta.on .pila span{animation:pila 1.1s calc(var(--k)*.12s) both cubic-bezier(.2,.9,.2,1)}@keyframes pila{from{opacity:0;transform:translateY(-80px) scaleY(.6)}}
  /* anillo de ahorro */
  .anillo{width:300px;height:300px;flex:none}.anillo circle{fill:none;stroke-width:26}.anillo .f{stroke:rgba(255,255,255,.1)}.anillo .p{stroke:var(--a);stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;filter:drop-shadow(0 0 14px var(--a))}
  .carta.on .anillo .p{animation:anillo 1.8s .8s both cubic-bezier(.3,0,.2,1)}@keyframes anillo{from{stroke-dashoffset:var(--l)}}
  .desglose{margin-top:34px;padding:0 10px}.desglose div{display:flex;align-items:baseline;gap:20px;font-size:34px;padding:16px 0;border-bottom:2px solid rgba(255,255,255,.07)}.desglose span{flex:1;font-weight:700}.desglose em{font-style:normal;color:var(--s);font-size:28px}.desglose b{color:var(--a);min-width:130px;text-align:right}
  .explica{font-size:25px;line-height:1.4;color:#93a39a;margin-top:22px}
  /* calendario */
  .cal{display:grid;gap:14px;margin-top:40px}
  .cal i{aspect-ratio:1;border-radius:22%;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.06);position:relative}
  .cal i.on{background:var(--a);border-color:var(--a);box-shadow:0 0 30px color-mix(in srgb,var(--a) 60%,transparent)}
  .cal i em{position:absolute;inset:auto 0 -46px;text-align:center;font-style:normal;font-size:26px;color:var(--s);font-weight:700}
  .carta.on .cal i{animation:punto .5s calc(.6s + var(--k)*.06s) both cubic-bezier(.2,1.6,.4,1)}@keyframes punto{from{transform:scale(0)}}
  .cal.mini{gap:6px}.cal.mini i{border-radius:4px;border-width:0}.cal.mini i.on{box-shadow:none}
  .llama{width:250px;height:300px;color:var(--a);filter:drop-shadow(0 0 40px var(--a));margin-bottom:30px}.llama svg{width:100%;height:100%}.carta.on .llama{animation:llama 1.2s ease-in-out infinite alternate}@keyframes llama{to{transform:scale(1.06) rotate(-3deg)}}
  /* modelo */
  .modelo{font-weight:900;letter-spacing:-.04em;line-height:.9;word-break:break-word;color:var(--t);margin:30px 0 10px}
  .prov{width:180px;height:180px;border-radius:50%;display:grid;place-items:center;font-size:70px;font-weight:900;color:#000;background:var(--a);box-shadow:0 0 80px color-mix(in srgb,var(--a) 60%,transparent)}
  .rk{display:flex;align-items:center;gap:26px;margin:22px 0}
  .rk .n{font-size:84px;font-weight:900;width:90px;color:transparent;-webkit-text-stroke:3px var(--a);line-height:1}
  .rk .x{flex:1;min-width:0}.rk .x b{display:block;font-size:46px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rk .x small{font-size:28px;color:var(--s);font-weight:700;letter-spacing:.05em;text-transform:uppercase}
  .rk .bar{height:16px;border-radius:9px;background:rgba(255,255,255,.08);margin-top:12px;overflow:hidden}.rk .bar i{display:block;height:100%;width:var(--w);background:linear-gradient(90deg,var(--a),var(--a2));border-radius:9px}
  .carta.on .rk .bar i{animation:barra 1.2s calc(.6s + var(--k)*.18s) both cubic-bezier(.3,0,.2,1)}@keyframes barra{from{width:0}}
  .rk .c{font-size:54px;font-weight:900;color:var(--a);min-width:150px;text-align:right}
  .rk.uno .x b{font-size:62px}.rk.uno .n{color:var(--a);-webkit-text-stroke:0}
  /* ritmo */
  .reloj{width:780px;height:780px;margin:10px auto 0;display:block;flex:none}
  .reloj .bh{fill:color-mix(in srgb,var(--a) 30%,transparent)}.reloj .bh.pk{fill:var(--a);filter:drop-shadow(0 0 16px var(--a))}
  .carta.on .reloj .bh{animation:rb .7s calc(.4s + var(--k)*.04s) both cubic-bezier(.2,1.4,.4,1);transform-box:fill-box;transform-origin:50% 100%}.reloj .centro{fill:none;stroke:rgba(255,255,255,.12);stroke-width:3}@keyframes rb{from{transform:scaleY(0)}}
  .reloj text{fill:#8b9a92;font-size:30px;font-weight:800;text-anchor:middle;font-family:inherit}
  .personaje{font-size:132px;line-height:.9;font-weight:900;letter-spacing:-.04em;text-transform:uppercase}
  /* noche */
  .luna{width:230px;height:230px;border-radius:50%;box-shadow:inset -50px -10px 0 0 #eef6f0,0 0 120px rgba(220,255,235,.35);transform:rotate(-20deg)}
  .cita{font-size:60px;line-height:1.16;font-weight:800;letter-spacing:-.01em;position:relative;padding:20px 30px 0 120px;margin-top:70px}
  .cita::before{content:"“";position:absolute;left:0;top:-30px;font-size:220px;color:var(--a);line-height:1;font-family:Georgia,serif}
  .estrellas i{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;opacity:.7;animation:tit 2.6s ease-in-out infinite}@keyframes tit{50%{opacity:.15}}
  /* logro */
  .medalla{width:560px;height:620px;margin:40px auto 0;position:relative;display:grid;place-items:center}
  .medalla svg{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 70px color-mix(in srgb,var(--a) 60%,transparent))}
  .medalla .ico{position:relative;width:250px;height:250px;color:var(--a);filter:drop-shadow(0 0 30px var(--a))}.medalla .ico svg{width:100%;height:100%}
  .carta.on .medalla{animation:medalla 1.4s .3s both cubic-bezier(.2,1.5,.3,1)}@keyframes medalla{from{transform:scale(.2) rotate(-25deg);opacity:0}}
  .confeti i{position:absolute;top:-40px;width:18px;height:34px;border-radius:4px;opacity:0}
  .carta.on .confeti i{animation:cae var(--t) var(--d) linear both}@keyframes cae{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:1;transform:translate(var(--x),2100px) rotate(var(--r))}}
  .tit-logro{font-size:110px;font-weight:900;line-height:.95;letter-spacing:-.03em;text-align:center;margin-top:40px}
  .txt-logro{font-size:44px;line-height:1.3;color:#cfd9d3;text-align:center;margin-top:24px;font-weight:600}
  /* resumen */
  .c-resumen .rej2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px}
  .c-resumen .rej2 .panel{padding:34px 38px}.c-resumen .rej2 b{display:block;font-size:84px;font-weight:900;letter-spacing:-.04em;line-height:1.02;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .c-resumen .rej2 span{font-size:26px;color:var(--s);font-weight:800;letter-spacing:.12em;text-transform:uppercase}
  .c-resumen .rej2 .ac b{color:var(--a)}
  .c-resumen .ancho{grid-column:1/-1}
  .firma{margin-top:auto;display:flex;align-items:center;gap:30px;padding-right:330px}
  .firma b{font-size:60px;font-weight:900;letter-spacing:-.02em}.firma small{display:block;font-size:30px;color:var(--s);font-weight:700}
  .quieto *, .quieto *::before, .quieto *::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}
  .quieto .confeti{display:none}
  .toque{position:absolute;inset:0;z-index:20;display:flex}.toque div{flex:1;cursor:pointer}
  `;

  // ---------- utilidades de dibujo ----------
  const DIAS_SEM = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const HERR = { shell: 'Terminal', leer_archivo: 'Leer archivos', listar: 'Explorar carpetas', escribir_archivo: 'Escribir archivos', editar_archivo: 'Editar código', web: 'Buscar en la web', recordar: 'Recordar cosas',
    buscar_memoria: 'Buscar en la memoria', buscar_historial: 'Buscar en el historial', delegar: 'Subagentes', ver_pantalla: 'Ver la pantalla', usar_skill: 'Usar skills', programar_tarea: 'Programar tareas', consultar_consejo: 'Consejo de IAs',
    explorar_grafo: 'Explorar el grafo', navegador_leer: 'Leer webs', navegador_abrir: 'Abrir webs', navegador_clic: 'Clics en webs', navegador_escribir: 'Escribir en webs', clic: 'Clics', escribir: 'Teclear', tecla: 'Atajos de teclado' };
  const nombreHerr = n => T(HERR[n] || String(n).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()));
  const PROV = { ollama: 'OL', anthropic: 'AN', claudecode: 'CC', openai: 'AI', chatgpt: 'GP', gemini: 'GE', openrouter: 'OR', groq: 'GQ', deepseek: 'DS', xai: 'XA', mistral: 'MI' };
  const ICO = {
    fuego: '<path d="M12 22c4.4 0 7-2.9 7-6.6 0-3.4-2.2-5.6-3.6-7.6-.5 1.8-1.4 3-2.6 3.6.4-3.5-1-6.6-4.3-9.4.3 3.4-1.2 5.4-2.8 7.4C4.3 11.2 5 12.8 5 15.4 5 19.1 7.6 22 12 22z"/><path d="M12 22c-1.8 0-3-1.3-3-3.1 0-1.9 1.6-3.1 2.4-4.6.7 1.4 3.6 2.6 3.6 4.6 0 1.8-1.2 3.1-3 3.1z"/>',
    luna: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    rayo: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    chispa: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/>',
    persona: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
    cerebro: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    reloj: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    robot: '<rect x="4" y="8" width="16" height="12" rx="4"/><path d="M12 4v4M8.5 13h.01M15.5 13h.01M9 17h6"/>',
  };
  const icono = (n, cls = '') => `<svg class="ico-svg ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICO[n] || ICO.robot}</svg>`;
  const PERIODO = { semana: ['TU SEMANA', 'esta semana', 'semana anterior'], mes: ['TU MES', 'este mes', 'mes anterior'], 'año': ['TU AÑO', 'este año', 'año anterior'] };
  const per = () => PERIODO[D.periodo] || PERIODO.semana;
  const cuenta = (v, dec = 0, suf = '') => `<span data-cuenta="${+v || 0}" data-dec="${dec}">${num(modo === 'quieto' ? v : 0, dec)}</span>${suf}`;
  const varChip = v => (v === null || v === undefined ? '' : `<span class="chip ${v >= 0 ? 'a' : 'm'} e" style="--d:1.4">${v >= 0 ? '▲' : '▼'} ${Math.abs(v)}% ${esc(T('vs {x}', { x: T(per()[2]) }))}</span>`);
  const fechaCorta = t => new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

  // ---------- tarjetas ----------
  function tarjetas() {
    const L = [];
    const nombre = esc(D.nombre || 'APOLO');
    // 1 · portada
    L.push({ id: 'portada', s: 5, robot: ['', 'listo', 'saludo', T('¡HOLA!')], fondo: [[-200, 200], [500, 1300]], html: `
      <div class="pila">${[0, 1, 2, 3].map(k => `<span style="--k:${k}">${nombre}</span>`).join('')}</div>
      <div class="ceja e" style="--d:.2">${esc(T(per()[0]))} ${esc(T('CON'))}</div>
      <div class="titulo e" style="--d:.35"><span class="ac">${nombre}</span></div>
      <div><span class="w zoom" style="--d:.7">Wrapped</span></div>
      <div class="sub e" style="--d:1">${esc(fechaCorta(D.desde))} – ${esc(fechaCorta(D.hasta))} · ${esc(T('lo que hicimos juntos, en números'))}</div>` });
    // 2 · horas de agente + ahorradas
    const ah = D.ahorro || {}, pctAh = Math.min(1, (ah.horas || 0) / Math.max(1, (D.horasAgente || 0) + (ah.horas || 0)));
    const R = 120, Lc = 2 * Math.PI * R;
    L.push({ id: 'horas', s: 7, robot: ['esquina', 'trabajando', 'pensativo', ''], fondo: [[600, -200], [-300, 1200]], html: `
      <div class="ceja e">${esc(T(per()[1]))}</div>
      <div class="h e" style="--d:.15">${esc(T('trabajé para ti'))}</div>
      <div class="gigante e" style="--d:.3;margin-top:40px">${cuenta(D.horasAgente, (D.horasAgente || 0) < 10 ? 1 : 0)}<small>h</small></div>
      <div class="sub e" style="--d:.6">${esc(T('{t} turnos · {h} acciones con herramientas', { t: num(D.turnos), h: num(D.herramientas?.total) }))}</div>
      <div style="margin-top:28px">${varChip(D.vsAnterior?.horasAgente)}</div>
      <div class="panel e" style="--d:1;margin-top:90px;display:flex;align-items:center;gap:44px">
        <svg class="anillo" viewBox="0 0 300 300"><circle class="f" cx="150" cy="150" r="${R}"/><circle class="p" cx="150" cy="150" r="${R}" style="stroke-dasharray:${Lc};stroke-dashoffset:${Lc * (1 - Math.max(.04, pctAh))};--l:${Lc}"/></svg>
        <div><div class="ceja" style="font-size:30px">${esc(T('y te ahorré'))}</div><div style="font-size:150px;font-weight:900;letter-spacing:-.05em;line-height:1;color:var(--a)">~${cuenta(ah.horas, (ah.horas || 0) < 10 ? 1 : 0)}<small style="font-size:.4em;color:var(--t)"> h</small></div>
        <div class="explica">${esc(T('Estimación: minutos que te habría llevado cada acción a mano.'))}</div></div></div>
      <div class="desglose e" style="--d:1.3">${(ah.desglose || []).slice(0, 4).map(x => `<div><span>${esc(T(x.concepto))}</span><em>${num(x.cantidad)} × ${num(x.minUnidad, x.minUnidad % 1 ? 1 : 0)} min</em><b>${num(x.min / 60, 1)} h</b></div>`).join('')}</div>` });
    // 3 · constancia (racha + calendario)
    const cal = D.calendario || [];
    const semana = cal.length <= 7, mes = cal.length <= 31;
    const cols = semana ? 7 : mes ? 7 : 21;
    L.push({ id: 'racha', s: 6.5, robot: ['abajo', 'listo', 'celebrar', T('¡RACHA!')], fondo: [[300, 900], [-400, -200]], html: `
      <div class="ceja e">${esc(T('constancia'))}</div>
      <div class="fila e" style="--d:.2;align-items:flex-end;margin-top:20px"><div style="flex:none" class="llama">${icono('fuego')}</div>
        <div class="gigante" style="font-size:330px">${cuenta(D.racha?.mejor)}</div></div>
      <div class="h e" style="--d:.4;margin-top:0">${esc(T('{n} día seguido|{n} días seguidos', { n: D.racha?.mejor || 0 }))}</div>
      <div class="sub e" style="--d:.55">${esc(T('Activo {a} de {b} días', { a: D.diasActivos || 0, b: D.dias || 7 }))}${D.racha?.actual ? ` · ${esc(T('racha actual: {n}', { n: D.racha.actual }))}` : ''}</div>
      <div class="cal ${semana || mes ? '' : 'mini'} e" style="--d:.6;grid-template-columns:repeat(${cols},1fr);${semana ? '' : mes ? 'max-width:860px' : 'max-width:940px'}">
        ${cal.map((c, k) => `<i class="${c.on ? 'on' : ''}" style="--k:${Math.min(k, 40)}">${semana ? `<em>${esc(T(DIAS_SEM[new Date(c.d + 'T12:00').getDay()]).slice(0, 2))}</em>` : ''}</i>`).join('')}</div>
      <div class="fila e" style="--d:1;margin-top:${semana ? 120 : 60}px;padding-right:420px"><div class="kpi a"><b>${cuenta(D.sesiones)}</b><span>${esc(T('conversaciones'))}</span></div><div class="kpi"><b>${cuenta(D.mensajes)}</b><span>${esc(T('mensajes'))}</span></div></div>` });
    // 4 · modelo favorito
    const mf = D.modeloFavorito;
    if (mf) {
      const tam = Math.max(96, Math.min(230, Math.floor(1700 / Math.max(5, mf.nombre.length))));
      L.push({ id: 'modelo', s: 6, robot: ['esquina', 'listo', 'guino', ''], fondo: [[-300, 800], [600, 100]], html: `
        <div class="letrero" style="top:880px">${esc(mf.nombre)} · ${esc(mf.nombre)} · </div><div class="letrero inv" style="top:1060px">${esc(mf.nombre)} · ${esc(mf.nombre)} · </div>
        <div class="ceja e">${esc(T('tu modelo favorito'))}</div>
        <div class="prov zoom" style="--d:.3;margin-top:60px">${esc(PROV[mf.proveedor] || mf.proveedor.slice(0, 2).toUpperCase())}</div>
        <div class="modelo e" style="--d:.45;font-size:${tam}px">${esc(mf.nombre)}</div>
        <div class="sub e" style="--d:.6"><b>${cuenta(mf.pct, 0, '%')}</b> ${esc(T('de tus turnos'))} · ${esc(T('{n} turno|{n} turnos', { n: mf.turnos }))} · ${esc(mf.proveedor)}</div>
        <div style="margin-top:auto">${(D.modelos || []).slice(1, 4).map((m, k) => `<div class="rk e" style="--d:${1 + k * .15};--k:${k}"><div class="n">${k + 2}</div><div class="x"><b>${esc(m.nombre)}</b><small>${esc(m.proveedor)}</small><div class="bar"><i style="--w:${m.pct}%"></i></div></div><div class="c">${m.pct}%</div></div>`).join('')}</div>` });
    }
    // 5 · herramientas
    const top = D.herramientas?.top || [], maxU = Math.max(1, ...top.map(h => h.usos));
    L.push({ id: 'herramientas', s: 7, robot: ['esquina', 'trabajando', 'navegando', ''], fondo: [[500, 1000], [-200, 0]], html: `
      <div class="letrero" style="top:1180px">${esc(T('ACCIÓN'))} · ${esc(T('ACCIÓN'))} · ${esc(T('ACCIÓN'))}</div>
      <div class="ceja e">${esc(T('lo que más hice'))}</div>
      <div class="h e" style="--d:.15">${cuenta(D.herramientas?.total)} ${esc(T('acciones'))}</div>
      <div style="margin-top:50px">${top.length ? top.map((h, k) => `<div class="rk ${k ? '' : 'uno'} e" style="--d:${.35 + k * .15};--k:${k}"><div class="n">${k + 1}</div>
        <div class="x"><b>${esc(nombreHerr(h.nombre))}</b><small>${esc(T(h.categoria))}</small><div class="bar"><i style="--w:${Math.round(h.usos / maxU * 100)}%"></i></div></div><div class="c">${num(h.usos)}</div></div>`).join('')
        : `<div class="sub e">${esc(T('Aún no he usado herramientas. ¡Pídeme algo!'))}</div>`}</div>
      ${(D.skills || []).length ? `<div class="e" style="--d:1.3;margin-top:auto;display:flex;flex-wrap:wrap;gap:14px;padding-right:20px"><span class="ceja" style="font-size:28px;width:100%">${esc(T('skills'))}</span>${D.skills.slice(0, 4).map(s => `<span class="chip a">${esc(s.nombre)} · ${num(s.usos)}</span>`).join('')}</div>` : ''}` });
    // 6 · ritmo
    const hs = D.ritmo?.horas || Array(24).fill(0), maxH = Math.max(1, ...hs), pico = D.ritmo?.horaPico ?? 0;
    const barras = hs.map((v, h) => {
      const largo = 28 + Math.sqrt(v / maxH) * 200, r0 = 165;
      return `<g transform="rotate(${(h / 24) * 360} 380 380)"><rect class="bh ${h === pico && v ? 'pk' : ''}" x="367" y="${380 - r0 - largo}" width="26" height="${largo}" rx="13" style="--k:${h}"/></g>`;
    }).join('');
    L.push({ id: 'ritmo', s: 6.5, robot: ['oculto', 'reposo', 'reloj', ''], fondo: [[200, 400], [-100, 1300]], html: `
      <div class="ceja e">${esc(T('tu ritmo'))}</div>
      <div class="personaje e" style="--d:.2;margin-top:24px">${esc(T(D.ritmo?.personaje || 'Madrugador'))}</div>
      <svg class="reloj e" style="--d:.35;margin-top:40px" viewBox="0 0 760 760">${barras}
        ${[0, 6, 12, 18].map(h => { const a = (h / 24) * 2 * Math.PI - Math.PI / 2; return `<text x="${380 + Math.cos(a) * 112}" y="${391 + Math.sin(a) * 112}">${h}h</text>`; }).join('')}<circle class="centro" cx="380" cy="380" r="150"/></svg>
      <div class="fila e" style="--d:.9;margin-top:auto"><div class="panel kpi a"><b>${pad2(pico)}:00</b><span>${esc(T('tu hora pico'))}</span></div>
        <div class="panel kpi"><b style="font-size:84px">${esc(T(DIAS_SEM[D.ritmo?.diaFavorito ?? 1]))}</b><span>${esc(T('tu día fuerte'))}</span></div></div>` });
    // 7 · noche (turno + sueño) o memoria
    const noche = (D.turno?.noches || 0) + (D.sueno?.noches || 0);
    L.push({ id: 'noche', s: 7, robot: ['abajo', 'dormido', 'bostezo', ''], fondo: [[-300, -300], [700, 1500]], html: `
      <div class="estrellas">${Array.from({ length: 26 }, (_, k) => `<i style="left:${(k * 137) % 1040}px;top:${180 + (k * 211) % 900}px;animation-delay:${(k % 7) * .4}s"></i>`).join('')}</div>
      <div class="fila e" style="align-items:center"><div style="flex:none" class="luna"></div><div><div class="ceja">${esc(T(noche ? 'mientras dormías' : 'mi memoria'))}</div></div></div>
      ${noche ? `<div class="fila e" style="--d:.3;margin-top:60px"><div class="kpi a"><b>${cuenta(D.turno?.hechos)}</b><span>${esc(T('encargos nocturnos'))}</span></div><div class="kpi"><b>${cuenta(D.sueno?.noches)}</b><span>${esc(T('noches soñando'))}</span></div></div>
        <div class="fila e" style="--d:.45;margin-top:34px"><div class="kpi"><b>${cuenta(D.sueno?.patrones)}</b><span>${esc(T('patrones nuevos'))}</span></div><div class="kpi"><b>${cuenta(D.sueno?.fusionados)}</b><span>${esc(T('recuerdos ordenados'))}</span></div></div>`
        : `<div class="fila e" style="--d:.3;margin-top:60px"><div class="kpi a"><b>${cuenta(D.recuerdos?.nuevos)}</b><span>${esc(T('recuerdos nuevos'))}</span></div><div class="kpi"><b>${cuenta(D.recuerdos?.total)}</b><span>${esc(T('en total'))}</span></div></div>`}
      ${D.sueno?.frase ? `<div class="cita e" style="--d:.8">${esc(D.sueno.frase)}</div>` : `<div class="cita e" style="--d:.8">${esc(T('Te conozco un poco más cada día.'))}</div>`}` });
    // 8 · logro
    const lg = D.logro || { titulo: 'Primeros pasos', texto: '', icono: 'robot' };
    const colores = ['var(--a)', '#ffffff', '#ffd23d', '#62e7ff', 'var(--a2)'];
    L.push({ id: 'logro', s: 6, robot: ['izq', 'listo', 'celebrar', T('¡LOGRO!')], fondo: [[200, 300], [200, 1100]], html: `
      <div class="confeti">${Array.from({ length: 46 }, (_, k) => `<i style="left:${(k * 97) % 1080}px;background:${colores[k % 5]};--x:${((k * 53) % 300) - 150}px;--r:${(k * 77) % 720}deg;--t:${2.6 + (k % 5) * .5}s;--d:${.3 + (k % 9) * .15}s"></i>`).join('')}</div>
      <div class="ceja e" style="text-align:center">${esc(T('logro desbloqueado'))}</div>
      <div class="medalla"><svg viewBox="0 0 560 620"><defs><linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a2)"/><stop offset="1" stop-color="var(--a)"/></linearGradient></defs>
        <path d="M280 10 523 150v320L280 610 37 470V150z" fill="#06120b" stroke="url(#gm)" stroke-width="18"/><path d="M280 70 470 180v260L280 550 90 440V180z" fill="none" stroke="var(--a)" stroke-opacity=".35" stroke-width="4" stroke-dasharray="10 14"/></svg>
        <div class="ico">${icono(lg.icono)}</div></div>
      <div class="tit-logro e" style="--d:.9">${esc(T(lg.titulo))}</div>
      <div class="txt-logro e" style="--d:1.1">${esc(T(lg.texto))}</div>` });
    // 9 · resumen para compartir
    const th = (D.herramientas?.categorias || [])[0];
    L.push({ id: 'resumen', s: 7, robot: ['abajo', 'listo', 'guino', ''], fondo: [[-200, 100], [500, 1200]], html: `
      <div class="ceja e">${esc(T(per()[0]))} · ${esc(fechaCorta(D.desde))} – ${esc(fechaCorta(D.hasta))}</div>
      <div class="h e" style="--d:.1">${nombre} <span style="color:var(--a)">Wrapped</span></div>
      <div class="rej2">
        <div class="panel ac e" style="--d:.2"><span>${esc(T('horas de agente'))}</span><b>${num(D.horasAgente, (D.horasAgente || 0) < 10 ? 1 : 0)} h</b></div>
        <div class="panel e" style="--d:.3"><span>${esc(T('horas ahorradas'))}</span><b>~${num(ah.horas, (ah.horas || 0) < 10 ? 1 : 0)} h</b></div>
        <div class="panel e" style="--d:.4"><span>${esc(T('conversaciones'))}</span><b>${num(D.sesiones)}</b></div>
        <div class="panel ac e" style="--d:.5"><span>${esc(T('racha'))}</span><b>${num(D.racha?.mejor)} ${esc(T('días'))}</b></div>
        <div class="panel ancho e" style="--d:.6"><span>${esc(T('modelo favorito'))}</span><b>${esc(mf ? mf.nombre : '—')}</b></div>
        <div class="panel e" style="--d:.7"><span>${esc(T('lo que más uso'))}</span><b style="font-size:62px">${esc(th ? T(th.nombre) : '—')}</b></div>
        <div class="panel e" style="--d:.8"><span>${esc(T('automatizaciones'))}</span><b>${num((D.tareas?.total || 0) + (D.turno?.hechos || 0))}</b></div>
      </div>
      ${D.privado && D.privadoDatos?.proyectos?.length ? `<div class="sub e" style="--d:.9;font-size:34px">${esc(T('Proyectos'))}: <b>${D.privadoDatos.proyectos.map(p => esc(p.nombre)).join(' · ')}</b></div>` : ''}
      <div class="firma e" style="--d:1"><div><b>${esc(T('Tu agente, en tu PC.'))}</b><small>github.com/DMNENGINE/apolo</small></div></div>` });
    return L;
  }
  const pad2 = n => String(n).padStart(2, '0');

  // ---------- montaje ----------
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  const esc_ = document.createElement('div'); esc_.id = 'esc'; document.body.append(esc_);
  if (modo === 'quieto') document.body.classList.add('quieto');
  let L = [], actual = -1, t0 = 0, tCarta = 0, pausado = false, robot = null, raf = 0;

  function montar() {
    L = tarjetas();
    esc_.style.setProperty('--a', D.acento || '#2bdc7c');
    esc_.innerHTML = `<div class="fondo"><div class="b b2"></div><div class="b"></div><div class="rej"></div><div class="scan"></div><div class="ruido"></div></div>
      <div class="barras">${L.map(() => '<i><b></b></i>').join('')}</div>
      <div class="cab"><div class="logo"><i></i>${esc(D.nombre || 'APOLO')} Wrapped</div><div class="per">${esc(T(per()[0]))}</div></div>
      <div id="robot">${CASCO}</div>
      ${L.map((c, i) => `<section class="carta c-${c.id}" data-i="${i}">${c.html}</section>`).join('')}
      <div class="marca"><b>APOLO</b> · open source</div>
      ${modo === 'normal' ? '<div class="toque"><div data-t="-1"></div><div data-t="1"></div></div>' : ''}`;
    const toque = esc_.querySelector('.toque');
    if (toque) toque.addEventListener('click', e => { const d = +e.target.dataset.t; if (d) d > 0 ? WR.siguiente() : WR.anterior(); });
    if (robotCanvas) { const caja = esc_.querySelector('#robot'); caja.innerHTML = ''; caja.append(robotCanvas); }
    WR.total = L.length;
    escalar();
  }
  const CASCO = `<svg viewBox="0 0 64 64"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7584"/><stop offset=".55" stop-color="#3a414c"/><stop offset="1" stop-color="#1f242b"/></linearGradient></defs>
    <path d="M10 31C10 17 20 7 32 7s22 10 22 24v9c0 9-7 16-16 16H26c-9 0-16-7-16-16z" fill="url(#cg)"/><rect x="15" y="25" width="34" height="15" rx="7.5" fill="#05140b"/>
    <rect x="22.5" y="29.5" width="6" height="6" rx="2" fill="#2bdc7c"/><rect x="35.5" y="29.5" width="6" height="6" rx="2" fill="#2bdc7c"/></svg>`;
  function escalar() { const s = Math.min(innerWidth / 1080, innerHeight / 1920); esc_.style.transform = `translate(-50%,-50%) scale(${s})`; esc_.style.transformOrigin = '50% 50%'; }
  addEventListener('resize', escalar);

  function contar(carta, quieto) {
    for (const el of carta.querySelectorAll('[data-cuenta]')) {
      const fin = +el.dataset.cuenta, dec = +el.dataset.dec || 0;
      if (quieto || !fin) { el.textContent = num(fin, dec); continue; }
      const ini = performance.now() + 450, dur = 1400;
      const paso = ahora => { const p = Math.max(0, Math.min(1, (ahora - ini) / dur)), e = 1 - Math.pow(1 - p, 3); el.textContent = num(fin * e, dec); if (p < 1 && el.isConnected) requestAnimationFrame(paso); };
      requestAnimationFrame(paso);
    }
  }
  function ir(i, quieto = modo === 'quieto') {
    i = Math.max(0, Math.min(L.length - 1, i));
    const c = L[i];
    esc_.querySelectorAll('.carta').forEach(s => { s.classList.remove('on'); });
    const sec = esc_.querySelector(`.carta[data-i="${i}"]`);
    void sec.offsetWidth;                                   // reinicia las animaciones de entrada
    sec.classList.add('on');
    actual = i; tCarta = performance.now();
    const caja = esc_.querySelector('#robot'); caja.className = c.robot[0] || '';
    const bs = esc_.querySelectorAll('.fondo .b');
    bs[1].style.transform = `translate(${c.fondo[0][0]}px,${c.fondo[0][1]}px)`; bs[0].style.transform = `translate(${c.fondo[1][0]}px,${c.fondo[1][1]}px)`;
    esc_.querySelectorAll('.barras b').forEach((b, k) => { b.style.width = k < i ? '100%' : '0%'; });
    contar(sec, quieto);
    if (robot) { try { robot.setState(c.robot[1]); if (c.robot[2]) robot.gesto?.(c.robot[2], 2.6, c.robot[3] || undefined); } catch { } }
    try { window.parent.postMessage({ wrapped: 'carta', i, total: L.length }, '*'); } catch { }
  }
  function bucle() {
    cancelAnimationFrame(raf);
    const paso = () => {
      if (actual < 0) return;
      const c = L[actual], t = (performance.now() - tCarta) / 1000;
      const b = esc_.querySelectorAll('.barras b')[actual]; if (b) b.style.width = Math.min(100, t / c.s * 100) + '%';
      if (!pausado && t >= c.s) {
        if (actual < L.length - 1) ir(actual + 1);
        else if (modo === 'grabar') { window.terminado = true; return; }
        else { pausado = true; try { window.parent.postMessage({ wrapped: 'fin' }, '*'); } catch { } }
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
  }

  const WR = window.WR = {
    total: 0, ir: (i, quieto) => { ir(i, quieto); if (quieto) esc_.querySelectorAll('.barras b').forEach((b, k) => { b.style.width = k <= i ? '100%' : '0%'; }); },
    siguiente: () => { if (actual < L.length - 1) { pausado = false; ir(actual + 1); } },
    anterior: () => { pausado = false; ir(Math.max(0, actual - 1)); },
    pausa: v => { pausado = v; if (!v) tCarta = performance.now() - 0; },
    actual: () => actual,
    recargar: d => { D = d || leerDatos() || D; montar(); ir(0); if (modo !== 'quieto') bucle(); },
  };
  window.empezar = () => { window.terminado = false; pausado = false; ir(0); bucle(); };

  // robot 3D (si el navegador tiene WebGL); si no, se queda el casco SVG
  let robotCanvas = null;
  montar();
  (async () => {
    try {
      const m = await import(BASE + 'robot3d.js');
      robotCanvas = document.createElement('canvas');
      robot = m.createRobot(robotCanvas, BASE + 'casco.glb', { animacion: modo === 'quieto' ? 'raton' : 'vitrina', log: ['> wrapped', `> ${D.periodo || 'semana'}`] });
      const caja = esc_.querySelector('#robot'); caja.innerHTML = ''; caja.append(robotCanvas);
      robot.setFps?.(modo === 'quieto' ? 20 : 30);
      await new Promise(ok => setTimeout(ok, 1500));
    } catch (e) { console.warn('robot 3D no disponible', e); robot = null; }
    window.listo = true;
    if (modo === 'normal') window.empezar();
    else if (modo === 'quieto') ir(0, true);
  })();
})();
