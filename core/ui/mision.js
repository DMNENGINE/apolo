// Mission Control: quién está haciendo qué ahora mismo — conversaciones, tareas y sus subagentes, en vivo.
// Datos: GET /v1/agentes + eventos 'agente' del SSE global (el núcleo los agrupa ~4/s).

const ESTADO_AG = {
  trabajando: ['ok vivo', 'Trabajando'], listo: ['ok', 'Listo'], error: ['mal', 'Error'], cancelado: ['aviso', 'Cancelado'], quieto: ['', 'En espera'],
};
const cronoTxt = ms => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
};

VISTAS.agentes = {
  agentes: new Map(), t: null, cola: null,
  async pintar(v) {
    this.v = v;
    const l = await api('GET', '/agentes');
    this.agentes = new Map(l.map(a => [a.id, a]));
    v.innerHTML = `<div class="pagina mision">${cabecera('Mission Control', 'Quién está haciendo qué ahora mismo: conversaciones, tareas y los subagentes que lanzan. En vivo.')}
      <div class="rejilla k" id="mcKpis"></div>
      <div class="seccion">Agentes</div>
      <div id="mcLista"></div></div>`;
    v.onclick = async e => {
      const b = e.target.closest('[data-parar]'); if (!b) return;
      b.disabled = true;
      try { await api('POST', `/sesiones/${b.dataset.parar}/cancelar`); aviso('Detenido'); } catch (er) { aviso(er.message, true); b.disabled = false; }
    };
    this.repintar();
    clearInterval(this.t);
    this.t = setInterval(() => this.relojes(), 1000);        // solo los cronómetros; el resto llega por eventos
  },
  salir() { clearInterval(this.t); clearTimeout(this.cola); this.v = null; },
  alEvento(e) {
    if (e.tipo !== 'agente' || !e.agente) return;
    this.agentes.set(e.agente.id, e.agente);
    if (!this.cola) this.cola = setTimeout(() => { this.cola = null; this.repintar(); }, 150);
  },
  repintar() {
    if (!this.v || !$('#mcLista')) return;
    const todos = [...this.agentes.values()];
    const vivos = todos.filter(a => a.estado === 'trabajando');
    const hijosVivos = vivos.filter(a => a.padre).length;
    const esperando = todos.filter(a => a.esperando).length;
    const hechos = todos.filter(a => a.estado !== 'trabajando' && a.fin).length;
    $('#mcKpis').innerHTML = [
      ['rayo', 'Trabajando', vivos.length - hijosVivos, 'agentes principales'],
      ['robot', 'Subagentes', hijosVivos, 'activos ahora'],
      ['escudo', 'Esperando permiso', esperando, esperando ? 'te necesitan' : 'nadie'],
      ['check', 'Terminados', hechos, 'últimas 6 h'],
    ].map(([i, t, n, s]) => `<div class="kpi${t === 'Esperando permiso' && n ? ' aviso' : ''}"><small>${ic(i)}${t}</small><b>${n}</b><span>${s}</span></div>`).join('');

    // árbol: principales (y huérfanos cuyo padre ya no está en la lista) con sus hijos debajo
    const porPadre = new Map();
    for (const a of todos) if (a.padre && this.agentes.has(a.padre)) { if (!porPadre.has(a.padre)) porPadre.set(a.padre, []); porPadre.get(a.padre).push(a); }
    const raices = todos.filter(a => !a.padre || !this.agentes.has(a.padre))
      .sort((a, b) => (b.estado === 'trabajando') - (a.estado === 'trabajando') || (b.inicio - a.inicio));
    $('#mcLista').innerHTML = raices.length
      ? raices.map(a => {
        const hijos = (porPadre.get(a.id) || []).sort((x, y) => x.inicio - y.inicio);
        return `<div class="mc-grupo">${this.tarjeta(a, false)}${hijos.length ? `<div class="mc-hijos">${hijos.map(h => this.tarjeta(h, true)).join('')}</div>` : ''}</div>`;
      }).join('')
      : vacio('robot', 'Nadie trabajando ahora. Cuando un modelo use "delegar", sus subagentes aparecen aquí, cada uno con lo que está haciendo.');
  },
  tarjeta(a, hijo) {
    const [cls, txt] = a.esperando ? ['aviso vivo', 'Esperando permiso'] : (ESTADO_AG[a.estado] || ESTADO_AG.quieto);
    const vivo = a.estado === 'trabajando';
    const actividad = a.esperando ? `${ic('escudo')}<span>Esperando tu decisión</span>`
      : a.herramienta ? `${ic(ICONO_HERR[a.herramienta.nombre] || 'llaveinglesa')}<b>${esc(NOMBRE_HERR[a.herramienta.nombre] || a.herramienta.nombre)}</b><span>${esc(a.herramienta.resumen)}</span>`
      : a.error ? `${ic('x')}<span>${esc(a.error)}</span>`
      : a.ultimo ? `${ic('chat')}<span>${esc(a.ultimo.replace(/\s+/g, ' '))}</span>`
      : vivo ? `${ic('chispa')}<span>pensando…</span>` : '';
    return `<div class="mc-tarjeta ${hijo ? 'hijo' : ''} ${vivo ? 'vivo' : ''} ${a.esperando ? 'espera' : ''}" data-id="${esc(a.id)}">
      <div class="mc-cab">${avatar(a.modelo)}
        <div class="mc-nombre"><b>${hijo ? '' : a.tarea ? ic('reloj') : ''}${esc(a.nombre || a.id)}</b><small>${esc(nombreModelo(a.modelo))}${hijo ? ' · subagente' : a.canal ? ` · ${esc(a.canal)}` : ''}</small></div>
        <span class="mc-estado"><span class="punto ${cls}"></span>${txt}</span>
      </div>
      <div class="mc-act">${actividad}</div>
      <div class="mc-pie"><span data-crono="${a.inicio}" data-fin="${a.fin || ''}">${a.inicio ? cronoTxt((a.fin || Date.now()) - a.inicio) : '—'}</span>
        <span>${a.pasos || 0} paso${a.pasos === 1 ? '' : 's'}</span>${a.uso?.entrada ? `<span>${fmtK(a.uso.entrada + a.uso.salida)} tokens</span>` : ''}${a.compactada ? `<span>${ic('cerebro')}resumida</span>` : ''}
        <span class="mc-acc">${vivo ? `<button class="btn mini mal" data-parar="${esc(a.id)}">${ic('parar')}Detener</button>` : ''}<a class="btn mini fantasma" href="#/chat/${esc(a.id)}">Abrir ${ic('der')}</a></span></div>
    </div>`;
  },
  relojes() {
    for (const el of $$('[data-crono]')) {
      const ini = +el.dataset.crono; if (!ini || el.dataset.fin) continue;
      el.textContent = cronoTxt(Date.now() - ini);
    }
  },
};
