// Entrenamiento (#/entrenamiento): el entrenamiento de modelos en Proxmox (CT107, Soup) visto y controlado desde APOLO.
// GPU, quién la tiene (el entrenamiento cede ante Ollama/Blender guardando checkpoint), progreso, curva de loss, trabajos y eventos.
// Datos: GET /v1/entrenamiento (+ evento 'entrenamiento' del SSE). Globales con prefijo EN_.
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'turno') + 1, 0, ['entrenamiento', 'Entrenamiento', 'cerebro']);

const EN_FASE = { parado: ['', 'Parado'], waiting: ['aviso', 'En cola (esperando GPU)'], loading: ['ok vivo', 'Cargando el modelo'], running: ['ok vivo', 'Entrenando'],
  checkpointing: ['aviso', 'Guardando checkpoint'], paused: ['aviso', 'Cedió la GPU (seguirá solo)'], completed: ['ok', 'Terminado'], failed: ['mal', 'Falló'], cancelled: ['', 'Parado (con checkpoint)'] };
const EN_hora = t => t ? new Date(t * 1000).toLocaleString() : '';

function EN_curva(perd) {                                // curva de loss en SVG propio
  if (!perd || perd.length < 2) return `<p class="tenue" style="padding:10px">${tr('La curva aparece cuando el entrenamiento empieza a registrar la loss.')}</p>`;
  const W = 640, H = 170, P = 26, ys = perd.map(p => p[0]), min = Math.min(...ys), max = Math.max(...ys), r = (max - min) || 1;
  const pts = perd.map((p, i) => [P + (W - 2 * P) * i / (perd.length - 1), H - P - (H - 2 * P) * (p[0] - min) / r]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><path d="${d} L${pts.at(-1)[0]} ${H - P} L${P} ${H - P} Z" fill="var(--s1,#3df2ff)" opacity=".12"/>
    <path d="${d}" fill="none" stroke="var(--s1,#3df2ff)" stroke-width="2"/><text x="${P}" y="14" font-size="11" fill="currentColor" opacity=".6">loss ${max.toFixed(3)} → ${ys.at(-1).toFixed(3)}</text>
    <text x="${W - P}" y="${H - 6}" font-size="11" fill="currentColor" opacity=".6" text-anchor="end">${tr('época')} ${perd.at(-1)[1].toFixed(2)}</text></svg>`;
}

VISTAS.entrenamiento = {
  d: null, reloj: null,
  async pintar(v) {
    this.v = v;
    v.innerHTML = `<div class="pagina en">${cabecera('Entrenamiento', 'Tu entrenador de modelos en Proxmox (Soup, CT107). Cuando Ollama o Blender necesitan la GPU, el entrenamiento guarda un checkpoint, la cede y sigue solo después.',
      `<a class="btn" id="enUi" target="_blank" rel="noopener">${ic('enlace')}${tr('Abrir Soup')}</a><button class="btn" id="enContinuar">${ic('play')}${tr('Continuar')}</button><button class="btn mal" id="enParar">${ic('parar')}${tr('Parar')}</button><button class="btn pri" id="enIniciar">${ic('chispa')}${tr('Empezar')}</button>`)}
      <div id="enCuerpo"><p class="tenue" style="padding:16px">${tr('Preguntando a Proxmox…')}</p></div></div>`;
    $('#enIniciar').onclick = () => this.accion('iniciar', 'Empezar el entrenamiento', 'Entra en la cola de la GPU con la configuración por defecto (soup-python.yaml). Puede tardar horas; cede la GPU solo cuando haga falta.');
    $('#enParar').onclick = () => this.accion('parar', 'Parar el entrenamiento', 'Termina el paso actual, guarda un checkpoint completo y libera la GPU. Podrás continuarlo.', true);
    $('#enContinuar').onclick = () => this.accion('continuar', 'Continuar el entrenamiento', 'Sigue el último entrenamiento parado desde su checkpoint.');
    await this.refrescar();
    this.reloj = setInterval(() => this.refrescar(), 15000);
  },
  async accion(que, titulo, texto, peligro) {
    if (!(await confirmar(titulo, texto, peligro))) return;
    try { const r = await api('POST', '/entrenamiento/' + que); aviso(r.texto || tr('Hecho')); setTimeout(() => this.refrescar(), 3000); } catch (e) { aviso(e.message, true); }
  },
  async refrescar() {
    if (!this.v) return;
    try { this.d = await api('GET', '/entrenamiento'); } catch (e) { $('#enCuerpo', this.v).innerHTML = `<p class="mal" style="padding:16px">${esc(e.message)}</p>`; return; }
    const d = this.d, r = d.resumen || {}, g = d.gpu || {}, [cls, fase] = EN_FASE[r.fase] || ['', r.fase];
    $('#enUi', this.v).href = r.ui || '#';
    $('#enParar', this.v).hidden = !d.procesos; $('#enIniciar', this.v).hidden = !!d.procesos;
    const pct = r.paso != null && r.total ? Math.round(100 * r.paso / r.total) : null, vram = g.total ? Math.round(100 * g.usada / g.total) : 0;
    const kpi = (t, val, sub) => `<div class="tarjeta"><div class="cuerpo"><div class="tenue" style="font-size:12px">${tr(t)}</div><div style="font-size:22px;font-weight:700">${val}</div>${sub || ''}</div></div>`;
    const barra = (p, c) => `<div style="height:6px;border-radius:3px;background:var(--linea,#ffffff14);margin-top:6px;overflow:hidden"><i style="display:block;height:100%;width:${p}%;background:${c}"></i></div>`;
    $('#enCuerpo', this.v).innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:6px 0 14px">
        ${kpi('Estado', `<span class="punto ${cls}"></span> ${esc(tr(fase))}`, r.motivo ? `<div class="tenue" style="font-size:12px">${esc(r.motivo)}</div>` : '')}
        ${kpi('Progreso', pct != null ? `${pct} %` : '—', pct != null ? `<div class="tenue" style="font-size:12px">${tr('paso')} ${r.paso}/${r.total}${r.epoca != null ? ` · ${tr('época')} ${r.epoca.toFixed(2)}` : ''}</div>${barra(pct, 'var(--s1,#3df2ff)')}` : '')}
        ${kpi('Loss', r.loss != null ? r.loss.toFixed(4) : '—')}
        ${kpi('GPU', g.total ? `${(g.usada / 1024).toFixed(1)} / ${(g.total / 1024).toFixed(1)} GB` : '—', g.total ? `<div class="tenue" style="font-size:12px">${esc(g.nombre || '')} · ${g.temp} °C · ${g.uso} %</div>${barra(vram, vram > 85 ? '#ff4d4d' : '#3ddc84')}` : '')}
        ${kpi('La GPU la tiene', esc(tr(r.gpuDe || '—')))}
      </div>
      <div class="tarjeta"><header>${ic('grafica')}<span class="crece">${tr('Curva de aprendizaje')}</span></header><div class="cuerpo">${EN_curva(d.log?.perdidas)}</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin-top:10px">
        <div class="tarjeta"><header>${ic('lista')}<span class="crece">${tr('Trabajos')}</span></header><div class="cuerpo">
          ${(d.jobs || []).map(j => { const [c2, f2] = EN_FASE[j.estado?.phase] || ['', j.estado?.phase || '?']; const cfgArg = (j.arguments || [])[(j.arguments || []).indexOf('--config') + 1] || '';
            return `<div class="fila-c" style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--linea,#ffffff10)"><span class="punto ${c2}"></span><b style="font-family:monospace">${esc(j.id.slice(0, 8))}</b><span class="crece">${esc(tr(f2))}</span><span class="tenue" style="font-size:12px">${esc(cfgArg.split('/').pop())} · ${esc(EN_hora(j.estado?.time))}</span></div>`; }).join('') || `<p class="tenue">${tr('Todavía no hay trabajos')}</p>`}
        </div></div>
        <div class="tarjeta"><header>${ic('reloj')}<span class="crece">${tr('Árbitro de la GPU')}</span></header><div class="cuerpo" style="max-height:260px;overflow:auto">
          ${(d.arbitro?.eventos || []).slice().reverse().map(e => `<div style="font-size:13px;padding:3px 0"><span class="tenue">${esc(new Date(e.hora * 1000).toLocaleTimeString())}</span> ${esc(e.texto)}</div>`).join('') || `<p class="tenue">${tr('Sin eventos')}</p>`}
        </div></div>
      </div>
      ${d.log?.cola ? `<div class="tarjeta" style="margin-top:10px"><header>${ic('terminal')}<span class="crece">${tr('Salida del entrenamiento')}</span><span class="tenue" style="font-size:12px">${esc((d.log.archivo || '').split('/').pop())}</span></header><div class="cuerpo"><pre style="max-height:220px;overflow:auto;font-size:12px;white-space:pre-wrap">${esc(d.log.cola.replace(/\r/g, '\n').split('\n').filter(Boolean).slice(-25).join('\n'))}</pre></div></div>` : ''}`;
  },
  alEvento(e) { if (e.tipo === 'entrenamiento' && this.v) { clearTimeout(this.t); this.t = setTimeout(() => this.refrescar(), 500); } },
  salir() { clearInterval(this.reloj); this.v = null; },
};
