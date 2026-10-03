// Robot Companion · panel — FASE 9: Configuración → Auditoría (registro encadenado, filtro, verificar, exportar)
// y el kill switch global (banda fija en todas las páginas mientras dure el pánico + botón en la página). Globales SG_.
'use strict';
Object.assign(I18N.dic.en, {
  'Auditoría': 'Audit log',
  'Registro encadenado (cada línea lleva el hash de la anterior): qué se hizo con riesgo de escritura o más, quién lo aprobó y cómo acabó.': 'Chained log (each line carries the hash of the previous one): what was done with write risk or higher, who approved it and how it ended.',
  'Verificar integridad': 'Verify integrity', 'Exportar': 'Export', 'Buscar…': 'Search…', 'Todas': 'All', 'Cadena íntegra': 'Chain intact', 'Cadena ROTA': 'Chain BROKEN',
  'líneas': 'lines', 'Cuándo': 'When', 'Tipo': 'Type', 'Qué': 'What', 'Decisión': 'Decision', 'Quién': 'Who', 'Resultado': 'Result',
  'Sin entradas todavía.': 'No entries yet.', 'Pánico': 'Panic', 'PÁNICO: todo parado': 'PANIC: everything stopped', 'Reanudar': 'Resume',
  'Parar TODO': 'Stop EVERYTHING', 'Cancela todos los turnos, suelta el ratón/teclado, pausa tareas, turno de noche y stream, y deniega los permisos pendientes hasta que pulses Reanudar. También: Ctrl+Alt+Esc, la isla, el móvil, Stream Deck (Denegar 2 s) y el ojo (doble pulsación).':
    'Cancels every turn, releases mouse/keyboard, pauses tasks, night shift and stream, and denies pending permissions until you press Resume. Also: Ctrl+Alt+Esc, the island, the phone, Stream Deck (hold Deny 2 s) and the eye (double press).',
  '¿Parar TODO ahora?': 'Stop EVERYTHING now?', 'desde': 'since',
});
(AJUSTES.find(g => g[0] === 'Privacidad y seguridad') || AJUSTES[0])[1].push(['auditoria', 'Auditoría', 'escudo']);

// ---------- kill switch: banda fija ----------
let SG_estado = { activo: false };
function SG_banda() {
  let b = document.getElementById('sgBanda');
  if (!SG_estado.activo) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('div'); b.id = 'sgBanda';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;padding:8px 14px;background:var(--mal,#c33);color:#fff;font-weight:700';
    document.body.appendChild(b);
  }
  b.innerHTML = `<span>🛑 ${esc(tr('PÁNICO: todo parado'))} · ${esc(SG_estado.origen || '')} · ${esc(tr('desde'))} ${esc(fecha(SG_estado.desde))}</span><button class="btn mini" id="sgReanudar">${esc(tr('Reanudar'))}</button>`;
  b.querySelector('#sgReanudar').onclick = () => SG_reanudar();
}
async function SG_refrescar() { try { SG_estado = await api('GET', '/panico'); SG_banda(); } catch { } }
async function SG_activar() { if (!confirm(tr('¿Parar TODO ahora?'))) return; try { SG_estado = await api('POST', '/panico', { origen: 'panel' }); SG_banda(); } catch (e) { aviso(e.message, true); } }
async function SG_reanudar() { try { SG_estado = await api('POST', '/panico/reanudar', { quien: 'panel' }); SG_banda(); aviso(tr('Reanudar')); } catch (e) { aviso(e.message, true); } }
if (typeof TOKEN !== 'undefined' && TOKEN) { SG_refrescar(); setInterval(SG_refrescar, 5000); }

// ---------- página Auditoría ----------
VISTAS['ajustes/auditoria'] = {
  claves: 'auditoria auditoría registro hash cadena integridad panico pánico kill switch seguridad',
  filtro: { q: '', tipo: '', decision: '' },
  async pintar(v) {
    const f = this.filtro;
    const qs = new URLSearchParams(Object.entries(f).filter(([, x]) => x)).toString();
    const d = await api('GET', '/auditoria' + (qs ? '?' + qs : ''));
    const D = { allow: 'ok', always: 'ok', deny: 'mal', activar: 'mal', reanudar: 'ok' };
    const fila = l => `<tr><td class="suave" style="white-space:nowrap">${fecha(l.t)}<br><small class="tenue mono">#${l.n}</small></td><td>${esc(l.tipo)}${l.herramienta ? `<br><small class="mono">${esc(l.herramienta)}</small>` : ''}</td>
      <td class="mono" style="max-width:420px;word-break:break-all">${esc(l.resumen || l.detalle || (l.ref ? `→ #${l.ref}` : ''))}${l.peligro ? ` <span class="chip mal">${esc(l.peligro)}</span>` : ''}</td>
      <td>${l.decision ? `<span class="chip ${D[l.decision] || ''}">${esc(l.decision)}</span>` : ''}${l.motivo ? `<br><small class="tenue">${esc(l.motivo)}</small>` : ''}</td><td class="suave">${esc(l.quien || l.origen || '')}</td><td>${l.resultado ? `<span class="chip ${l.resultado === 'ok' ? 'ok' : 'mal'}">${esc(l.resultado)}</span>` : ''}</td></tr>`;
    v.innerHTML = `<div class="pagina">${cabecera('Auditoría', 'Registro encadenado (cada línea lleva el hash de la anterior): qué se hizo con riesgo de escritura o más, quién lo aprobó y cómo acabó.',
      `<button class="btn" id="sgVer">${ic('escudo')}${tr('Verificar integridad')}</button><button class="btn" id="sgExp">${ic('abajo')}${tr('Exportar')}</button>`)}
      <div class="caja" style="display:flex;gap:12px;align-items:center;margin-bottom:16px;border-color:var(--mal)"><div style="flex:1"><b>${tr('Pánico')}</b><p class="tenue" style="margin:4px 0 0;font-size:12px">${tr('Cancela todos los turnos, suelta el ratón/teclado, pausa tareas, turno de noche y stream, y deniega los permisos pendientes hasta que pulses Reanudar. También: Ctrl+Alt+Esc, la isla, el móvil, Stream Deck (Denegar 2 s) y el ojo (doble pulsación).')}</p></div>
        ${SG_estado.activo ? `<button class="btn" id="sgRe">${tr('Reanudar')}</button>` : `<button class="btn mal" id="sgPan">${tr('Parar TODO')}</button>`}</div>
      <div id="sgRes"></div>
      <div class="flex" style="gap:8px;margin-bottom:12px"><input id="sgQ" placeholder="${esc(tr('Buscar…'))}" value="${esc(f.q)}" style="flex:1">
        <select id="sgT">${['', 'accion', 'resultado', 'externo', 'panico', 'seguridad'].map(x => `<option value="${x}" ${f.tipo === x ? 'selected' : ''}>${esc(x || tr('Todas'))}</option>`).join('')}</select>
        <select id="sgD">${['', 'allow', 'always', 'deny'].map(x => `<option value="${x}" ${f.decision === x ? 'selected' : ''}>${esc(x || tr('Todas'))}</option>`).join('')}</select></div>
      <div class="caja tabla-env">${d.lineas.length ? `<table class="tabla"><tr><th>${tr('Cuándo')}</th><th>${tr('Tipo')}</th><th>${tr('Qué')}</th><th>${tr('Decisión')}</th><th>${tr('Quién')}</th><th>${tr('Resultado')}</th></tr>${d.lineas.map(fila).join('')}</table>` : vacio('escudo', 'Sin entradas todavía.')}</div></div>`;
    const $$ = s => v.querySelector(s);
    let t = null;
    $$('#sgQ').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; this.pintar(v); }, 350); };
    $$('#sgT').onchange = e => { f.tipo = e.target.value; this.pintar(v); };
    $$('#sgD').onchange = e => { f.decision = e.target.value; this.pintar(v); };
    if ($$('#sgPan')) $$('#sgPan').onclick = async () => { await SG_activar(); this.pintar(v); };
    if ($$('#sgRe')) $$('#sgRe').onclick = async () => { await SG_reanudar(); this.pintar(v); };
    $$('#sgVer').onclick = async () => {
      const r = await api('GET', '/auditoria/verificar');
      $$('#sgRes').innerHTML = `<div class="st-banda ${r.ok ? '' : 'mal'}" style="margin-bottom:12px">${ic(r.ok ? 'check' : 'escudo')}<span>${tr(r.ok ? 'Cadena íntegra' : 'Cadena ROTA')} · ${r.total} ${tr('líneas')}${r.ok ? '' : ` · #${esc(r.primeraRota || '')} ${esc(r.motivo || '')}`}</span></div>`;
    };
    $$('#sgExp').onclick = async () => {
      const r = await fetch('/v1/auditoria/exportar', { headers: { 'x-robot-token': TOKEN } });
      if (!r.ok) return aviso(`HTTP ${r.status}`, true);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `apolo-auditoria-${new Date().toISOString().slice(0, 10)}.jsonl`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
  },
};
