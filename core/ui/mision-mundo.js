// Mission Control → vista "Mundo": un mapa pixel-art vivo (mundo/1 de /v1/mundo) donde cada agente es un personaje.
// APOLO es el mago del orbe; las conversaciones, aprendices a su lado; los subagentes van a su bahía; las tareas programadas, al taller;
// los plugins son goblins en la sala de servidores. Rayos del orbe a quien trabaja, burbujas (… ? ! ✓), HUD con CPU/RAM, E-STOP y pánico.
// El dibujo (texturas, sprites, luz, partículas) vive en mision-mundo-arte.js.

const MM_ROPA = ['#3b6fb6', '#b5452f', '#3f8f4f', '#8a4fb5', '#c08a2e', '#2f8f8f', '#6b6b75', '#b54f7d'];
const MM_PELO = ['#3a2414', '#6b3e1f', '#c9a24a', '#1c1c1c', '#8b2f1f', '#d9d9d9'];
const MM_PIEL = ['#f1c7a0', '#d9a477', '#a8714a', '#7a4e2d'];
const MM_ESTILO = ['corto', 'largo', 'punta', 'mono'];
// avatar de cada modelo (inspirado en su identidad, no su logo): color, emblema del pecho y rasgos
const MM_CLAUDE = { piel: '#f1c7a0', sombrero: 'capucha', color: '#d97757', ropa: '#c15f3c', ropa2: '#f0e6dc', pantalon: '#5a3a2e', emblema: 'sol', emCol: '#f8ece0' };
const MM_MODELOS = {
  anthropic: ['Claude', MM_CLAUDE], claudecode: ['Claude Code', { ...MM_CLAUDE, gafas: '#39ff8a' }],
  openai: ['OpenAI', { piel: '#d9a477', estilo: 'corto', pelo: '#1c1c1c', ropa: '#10a37f', pantalon: '#22303a', emblema: 'nudo', emCol: '#ffffff', emCol2: '#bff3e2' }],
  chatgpt: ['ChatGPT', { piel: '#f1c7a0', sombrero: 'capucha', color: '#343541', ropa: '#202123', ropa2: '#10a37f', pantalon: '#2a2b32', emblema: 'nudo', emCol: '#ffffff', emCol2: '#10a37f' }],
  gemini: ['Gemini', { piel: '#f1c7a0', estilo: 'largo', pelo: '#6b5cf0', ropa: '#4b6bfb', capa: '#a46bf5', pantalon: '#2c3570', emblema: 'chispa', emCol: '#ffffff', emCol2: '#ffb3d9' }],
  ollama: ['Ollama', { especie: 'llama', ropa: '#f4f4f4' }],
  deepseek: ['DeepSeek', { piel: '#f1c7a0', estilo: 'punta', pelo: '#2b3fa8', ropa: '#4d6bfe', pantalon: '#1f2a66', emblema: 'ballena', emCol: '#ffffff', emCol2: '#9fb4ff' }],
  openrouter: ['OpenRouter', { piel: '#a8714a', estilo: 'mono', pelo: '#1c1c1c', ropa: '#6467f2', pantalon: '#2e2f6b', emblema: 'ruta', emCol: '#ffffff' }],
  cerebras: ['Cerebras', { piel: '#d9a477', sombrero: 'casco', color: '#3b3f45', ropa: '#f15a29', pantalon: '#3a2016', emblema: 'chip', emCol: '#ffffff', emCol2: '#ffd0c0' }],
  xai: ['Grok', { piel: '#f1c7a0', estilo: 'punta', pelo: '#e8e8e8', ropa: '#111111', pantalon: '#1c1c1c', emblema: 'x', emCol: '#ffffff' }],
  groq: ['Groq', { piel: '#d9a477', estilo: 'corto', pelo: '#3a2414', ropa: '#f55036', emblema: 'rayo', emCol: '#ffffff' }],
  mistral: ['Mistral', { piel: '#f1c7a0', estilo: 'corto', pelo: '#8b2f1f', ropa: '#fa520f', ropa2: '#ffd800', emblema: 'franjas', emCol: '#ffd800', emCol2: '#ff8205' }],
  perplexity: ['Perplexity', { piel: '#a8714a', sombrero: 'capucha', color: '#13343b', ropa: '#20808d', emblema: 'asterisco', emCol: '#ffffff' }],
  huggingface: ['Hugging Face', { piel: '#f1c7a0', estilo: 'mono', pelo: '#c9a24a', ropa: '#ffd21e', pantalon: '#3a3020', emblema: 'cara', emCol: '#ff9d00', emCol2: '#3a2a10' }],
  nvidia: ['NVIDIA', { piel: '#d9a477', estilo: 'corto', pelo: '#1c1c1c', ropa: '#1a1a1a', ropa2: '#76b900', emblema: 'ojo', emCol: '#76b900', emCol2: '#ffffff' }],
  qwen: ['Qwen', { piel: '#f1c7a0', estilo: 'largo', pelo: '#1c1c1c', ropa: '#615ced', emblema: 'chispa', emCol: '#ffffff' }],
  moonshot: ['Kimi', { piel: '#f1c7a0', estilo: 'corto', pelo: '#1c1c1c', ropa: '#16191e', emblema: 'luna', emCol: '#ffffff' }],
  lmstudio: ['LM Studio', { piel: '#d9a477', estilo: 'punta', pelo: '#4e2a8f', ropa: '#6b4ee6', emblema: 'chip', emCol: '#ffffff' }],
  opencode: ['opencode', { piel: '#f1c7a0', sombrero: 'capucha', color: '#2a2626', ropa: '#211e1e', emblema: 'llaves', emCol: '#f4f4f4', gafas: '#f4f4f4' }],
  antigravity: ['Antigravity', { piel: '#f1c7a0', estilo: 'largo', pelo: '#3a2414', ropa: '#1a73e8', capa: '#34a853', emblema: 'chispa', emCol: '#fbbc04', emCol2: '#ea4335', flota: true }],
};
// bots de Discord con personalidad (se reconocen por el nombre del servicio)
const MM_BOTS = [
  { re: /comman?der|comander/i, look: { piel: '#d9a477', estilo: 'corto', pelo: '#1c1c1c', ropa: '#4a5a2a', pantalon: '#3a4520', sombrero: 'gorra', color: '#3a4520', emblema: 'medalla', emCol: '#e0b44a', emCol2: '#c0392b' },
    frases: ['¡Firmes!', 'Patrulla completada. Sin novedad.', 'Discord bajo control.', '¡A sus órdenes, APOLO!', 'Revisando el perímetro del servidor.', 'Orden recibida.'] },
  { re: /ticket/i, look: { piel: '#f1c7a0', estilo: 'mono', pelo: '#6b3e1f', ropa: '#e8e8e8', ropa2: '#2b3a67', pantalon: '#2b3a67', emblema: 'ticket', emCol: '#ffcf4d', emCol2: '#2b3a67', gafas: '#9fd0ff' },
    frases: ['¿En qué puedo ayudar?', 'Ticket atendido ✓', 'Siguiente, por favor.', 'La cola de tickets está al día.', 'Abriendo un ticket nuevo…'] },
  { re: /apolo|robot|companion/i, look: { especie: 'robot', ropa: '#8a95a3', visor: '#7ff3ff' },
    frases: ['Bip bup.', 'Conectado a Discord.', 'Llevo tus mensajes a APOLO.', 'Sincronizando…', 'Ping: 42 ms. Todo bien.'] },
  { re: /fifa|brito|f[uú]tbol/i, look: { piel: '#a8714a', estilo: 'punta', pelo: '#1c1c1c', ropa: '#d62828', pantalon: '#f4f4f4', emblema: 'numero', emCol: '#ffffff', balon: true },
    frases: ['¡Gooool!', '¿Un partidito?', 'Brito FC al ataque.', 'Tiro… ¡al palo!', '¡Qué pase!'] },
];
function mmBot(nombre) { return MM_BOTS.find(b => b.re.test(nombre)) || { look: { piel: MM_PIEL[mmHash(nombre) % 4], estilo: 'corto', pelo: MM_PELO[mmHash(nombre) % 6], ropa: '#5865f2', sombrero: 'gorra', color: '#404eed', emblema: 'chispa', emCol: '#ffffff' }, frases: ['En línea.', 'Trabajando en Discord.'] }; }
// quiénes viven en el mundo según el tema: rasgos que se suman al avatar de cada uno (los modelos conservan sus colores y emblema)
const MM_PUEBLOS = {
  aliens: h => ({ piel: ['#8fd47a', '#a98be0', '#7fd1c4', '#c9d46f'][h % 4], ojosGrandes: true, antenas: h % 3 !== 0, estilo: 'calvo', barba: undefined }),
  demonios: h => ({ piel: ['#c0392b', '#a93226', '#d0442f'][h % 3], cuernos: true, cola: true, orejas: true, estilo: 'calvo' }),
  cientificos: h => ({ bata: '#eef2f5', gafas: h % 2 ? '#9fd0ff' : undefined, pelo: ['#eeeeee', '#9a9a9a', '#3a2414', '#c9a24a'][(h >>> 3) % 4] }),
};
const MM_JEFES = {
  aliens: { piel: '#9fd49a', ojosGrandes: true, estilo: 'calvo', ropa: '#5a2d82', ropa2: '#e0b44a', tunica: true, baston: true, capa: '#2d1a4a', emblema: 'chispa', emCol: '#7dff9a' },
  demonios: { piel: '#b0281e', cuernos: true, cola: true, orejas: true, estilo: 'calvo', ropa: '#5a0f0f', ropa2: '#e0b44a', tunica: true, baston: true, capa: '#1a0505', barba: '#2a0a0a' },
  cientificos: { piel: '#f1c7a0', estilo: 'punta', pelo: '#f4f4f4', bata: '#f4f8fb', gafas: '#9fd0ff', ropa: '#5d7290', pantalon: '#2c3a50', barba: '#e8e8e8' },
};
const MM_BICHOS = { aliens: { piel: '#7ad46a', ojosGrandes: true, antenas: true, estilo: 'calvo', ropa: '#3a2a5a', pantalon: '#1c1a28' },
  demonios: { piel: '#d0442f', cuernos: true, cola: true, orejas: true, estilo: 'calvo', ropa: '#2a1a1a', pantalon: '#1a1010' }, cientificos: { especie: 'robot', ropa: '#9aa6b4', visor: '#3ad7ff' } };
function mmPueblo(look, id, pueblo) {
  const f = MM_PUEBLOS[pueblo]; if (!f || look.especie) return look;
  const r = { ...look, ...f(mmHash(id)) }; if (pueblo !== 'cientificos' && r.sombrero === 'capucha') delete r.sombrero;
  return r;
}
const MM_SERVIDOR = ['rack', 'vaina', 'jaula'];                       // objetos que hacen de rack de servicios
const mmProveedor = modelo => String(modelo || '').split('/')[0].toLowerCase();
function mmLookModelo(prov, tipo) {
  const m = MM_MODELOS[prov] || MM_MODELOS[{ anthropic: 'anthropic', 'claude-cli': 'claudecode', 'codex-cli': 'chatgpt', gemini: 'gemini' }[tipo]];
  if (m) return { ...m[1] };
  const h = mmHash(prov);
  return { piel: MM_PIEL[h % 4], estilo: MM_ESTILO[(h >>> 3) % 4], pelo: MM_PELO[(h >>> 5) % 6], ropa: MM_ROPA[(h >>> 7) % 8], emblema: 'chispa', emCol: '#ffffff' };
}
const mmNombreModelo = (prov, tipo) => (MM_MODELOS[prov] || [])[0] || prov;
const mmHash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const MC_MUNDO = {
  async montar(caja, mc) {
    this.mc = mc; this.caja = caja; this.ents = new Map(); this.ticker = []; this.log = []; this.parts = []; this.pestana = this.pestana || 'ticker';
    this.est = { cpu: 0, ram: 0, ramTot: 0, orbe: 0, progreso: 0, bahia: 0, memoria: 0, mcp: 0, panico: false, luz: 'antorcha', borde: '#2fd1b0' };
    const r = await api('GET', '/mundo').catch(() => null);
    if (!r || !this.caja) return;
    this.propio = r.propio; this.cargar(r.mundo);
    this.cargarDatos(); clearInterval(this.tDatos); this.tDatos = setInterval(() => this.cargarDatos(), 2500);
    clearInterval(this.tLento); this.tLento = setInterval(() => this.cargarLento(), 30000); this.cargarLento();
  },
  salir() { cancelAnimationFrame(this.raf); this.raf = 0; clearInterval(this.tDatos); clearInterval(this.tLento); this.caja = null; },
  cargar(m) {
    this.m = m; const tema = { nucleo: 'orbe', pueblo: 'humanos', particulas: 'brasas', ...(MM_TEMAS[m.tema] || MM_TEMAS.mazmorra), ...(m.estilo || {}) }; this.tema = tema;
    Object.assign(this.est, { luz: tema.luz, borde: tema.borde, nucleo: tema.nucleo, nucleoRGB: mmRGB(tema.nucleoColor || '#5fd8ff') });
    const R = MM_R, W = m.ancho * R, H = m.alto * R; this.W = W; this.H = H;
    // rejilla: 0 vacío · 1 suelo · 2 pared; y qué sala/suelo tiene cada casilla
    const g = new Uint8Array(m.ancho * m.alto), suelo = new Array(m.ancho * m.alto), sala = new Array(m.ancho * m.alto);
    const en = (x, y) => x >= 0 && y >= 0 && x < m.ancho && y < m.alto;
    const poner = (rc, s, id) => { for (let y = rc.y; y < rc.y + rc.h; y++) for (let x = rc.x; x < rc.x + rc.w; x++) if (en(x, y)) { const i = y * m.ancho + x; g[i] = 1; suelo[i] = s; if (id) sala[i] = id; } };
    const sueloPasillo = { nave: 'metal', laboratorio: 'metal', oficina: 'madera', bosque: 'hierba' }[m.tema] || 'tierra';
    for (const p of m.pasillos) poner(p, sueloPasillo);
    for (const s of m.salas) poner(s, s.suelo, s.id);
    for (let y = 0; y < m.alto; y++) for (let x = 0; x < m.ancho; x++) if (!g[y * m.ancho + x]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (en(x + dx, y + dy) && g[(y + dy) * m.ancho + x + dx] === 1) { g[y * m.ancho + x] = 2; dy = dx = 2; }
    }
    this.g = g; this.suelo = suelo; this.sala = sala;
    this.bloq = new Uint8Array(m.ancho * m.alto);
    for (const o of m.objetos) { const d = MM_OBJ[o.tipo]; if (d?.bloq) for (let y = o.y; y < o.y + d.h; y++) for (let x = o.x; x < o.x + d.w; x++) if (en(x, y)) this.bloq[y * m.ancho + x] = 1; }
    this.lavaLuz = [];                                                // la lava no se pisa y alumbra
    for (let i = 0; i < g.length; i++) if (g[i] === 1 && suelo[i] === 'lava') { this.bloq[i] = 1; const x = i % m.ancho, y = Math.floor(i / m.ancho); if ((x + y * 2) % 3 === 0) this.lavaLuz.push({ x: x * R + R / 2, y: y * R + R / 2, f: Math.random() * 6 }); }
    this.porRol = Object.fromEntries(m.salas.map(s => [s.rol, s]));
    this.orbe = m.objetos.find(o => o.tipo === 'orbe') || (() => { const s = this.porRol.principal; return { x: s.x + (s.w >> 1) - 1, y: s.y + (s.h >> 1) - 1 }; })();
    this.fondo = mmFondo(this);
    document.fonts?.load('700 16px Silkscreen').then(() => { if (this.m === m) this.fondo = mmFondo(this); }).catch(() => {});   // los carteles del suelo usan la fuente pixel
    const po = m.objetos.find(o => o.tipo === 'portal'); this.portal = po ? { x: po.x * R + 48, y: po.y * R + 16 } : null; this.est.portal = this.portal;
    // luz: mapa a media resolución (se suaviza al escalar) y viñeta fija
    this.luz = mmLienzo(W >> 1, H >> 1); this.lc = this.luz.getContext('2d');
    this.vin = mmLienzo(W, H); const vc = this.vin.getContext('2d'), gv = vc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .58);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,.38)'); vc.fillStyle = gv; vc.fillRect(0, 0, W, H);
    this.dom(); this.ents.clear(); this.parts = []; this.poblar(); this.repartirRacks();
    if (!this.raf) this.raf = requestAnimationFrame(t => this.cuadro(t));
  },
  dom() {
    const m = this.m, px = v => `${(v / m.ancho * 100).toFixed(3)}%`, py = v => `${(v / m.alto * 100).toFixed(3)}%`, s = this.porRol;
    this.caja.style.setProperty('--mm-borde', this.tema.borde);
    this.caja.innerHTML = `<div class="mm">
      <div class="mm-barra mm-arriba"><span class="mm-dato" data-d="cpu">CPU —</span><span class="mm-dato" data-d="ram">RAM —</span><span class="mm-dato" data-d="tok">TOKENS —</span>
        <span class="mm-titulo">MISSION CONTROL</span><span class="mm-dato mm-status" data-d="status">STATUS: —</span>
        <span class="mm-pest"><button data-p="ticker" class="${this.pestana === 'ticker' ? 'on' : ''}">TICKER</button><button data-p="log" class="${this.pestana === 'log' ? 'on' : ''}">LOG</button></span></div>
      <div class="mm-mapa" style="aspect-ratio:${m.ancho}/${m.alto}"><canvas width="${this.W}" height="${this.H}"></canvas>
        <div class="mm-nombres"></div>
        <div class="mm-ticker"><div class="mm-lineas"></div></div>
        <div class="mm-holo mv-holo" hidden></div>
      </div>
      <div class="mm-barra mm-abajo"><span class="mm-dato"><span>CPU</span><i data-b="cpu"><b></b></i></span><span class="mm-dato"><span>RAM</span><i data-b="ram"><b></b></i></span>
        <span class="mm-dato" data-d="agentes">AGENTES —</span><span class="mm-hueco"></span>
        <button class="mm-btn rojo" data-a="estop" title="${tr('Detiene todos los agentes que están trabajando ahora')}">E-STOP</button>
        <button class="mm-btn rojo fuerte" data-a="panico" title="${tr('Pánico: corta todo (agentes, control del ratón, tareas) hasta que reanudes')}">PÁNICO</button>
        <button class="mm-btn ic" data-a="editar" title="${tr('Crear o cambiar tu mundo')}">⚙</button>
        <button class="mm-btn ic" data-a="pausa" title="${tr('Pausar la animación')}">${this.pausa ? '▶' : '❚❚'}</button></div>
    </div>`;
    this.cv = $('canvas', this.caja); this.c = this.cv.getContext('2d'); this.c.imageSmoothingEnabled = false;
    this.capaNombres = $('.mm-nombres', this.caja);
    this.cv.onclick = e => this.clic(e);
    this.cv.onmousemove = e => { const p = this.punto(e); const h = this.enPunto(p.x, p.y); this.cv.style.cursor = h ? 'pointer' : 'default'; this.encima = h?.p || null; };
    this.cv.onmouseleave = () => { this.encima = null; };
    $('.mm-pest', this.caja).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; this.pestana = b.dataset.p; $$('.mm-pest button', this.caja).forEach(x => x.classList.toggle('on', x === b)); this.pintarTicker(); };
    $('.mm-abajo', this.caja).onclick = e => { const b = e.target.closest('[data-a]'); if (b) this.accion(b.dataset.a, b); };
    this.pintarTicker();
  },
  // ---------- datos ----------
  async cargarDatos() {
    if (!this.caja) return;
    try {
      const [s, p] = await Promise.all([api('GET', '/sistema'), api('GET', '/panico').catch(() => ({}))]);
      this.est.cpu = s.cpu.uso; this.est.ramTot = s.memoria.total; this.est.ram = 1 - s.memoria.libre / s.memoria.total; this.est.panico = !!p.activo; this.hud();
    } catch { }
  },
  async cargarLento() {
    if (!this.caja) return;
    try {
      const [pl, ta, tu, es, ca, mr] = await Promise.all([api('GET', '/plugins').catch(() => ({ plugins: [] })), api('GET', '/tareas').catch(() => []), api('GET', '/turno').catch(() => null),
        api('GET', '/estado').catch(() => null), api('GET', '/canales').catch(() => []), api('GET', '/mcp-remotos').catch(() => null)]);
      this.mcpServ = mr?.servidores || []; MM_MCP_IDS = this.mcpServ.filter(x => x.conectado).map(x => x.id);
      const sv = await api('GET', '/servicios').catch(() => null); if (sv) { this.serv = sv; this.repartirRacks(); }
      this.modelos = (es?.proveedores || []).filter(x => x.listo).map(x => ({ id: x.nombre, tipo: x.tipo }));
      for (const c of ca || []) if (c.tipo === 'motor' && c.estado === 'activo' && !this.modelos.some(x => x.id === c.id)) this.modelos.push({ id: c.id, tipo: 'motor', puente: true });
      this.plugins = (pl.plugins || []).filter(x => x.activo).slice(0, 8); this.tareas = (ta || []).filter(x => x.activa); this.turno = tu;
      const hechos = tu?.turno?.encargos?.filter?.(x => x.estado === 'hecho').length, total = tu?.turno?.encargos?.length;
      this.est.progreso = total ? hechos / total : 0;
      this.poblar(); this.hud();
    } catch { }
  },
  // los grupos de servicios del usuario van a los racks en orden (de arriba abajo, de izquierda a derecha)
  repartirRacks() {
    const racks = (this.m?.objetos || []).filter(o => MM_SERVIDOR.includes(o.tipo)).sort((a, b) => a.y - b.y || a.x - b.x), mapa = new Map(), est = this.serv?.estado || {};
    (this.serv?.grupos || []).slice(0, racks.length).forEach((g, i) => mapa.set(`${racks[i].x},${racks[i].y}`, { grupo: g, rack: racks[i],
      items: g.servicios.map(s => ({ ...s, ok: est[s.id] ? est[s.id].ok : true, pendiente: !est[s.id], ...(est[s.id] || {}) })) }));
    this.est.racks = mapa;
  },
  alEvento(e) {
    if (!this.caja) return;
    if (e.tipo === 'servicios' && this.serv) {
      const antes = this.serv.estado || {}; this.serv.estado = e.estado; this.serv.revisado = e.revisado; this.repartirRacks();
      for (const g of this.serv.grupos) for (const s of g.servicios) { const a = antes[s.id], n = e.estado[s.id]; if (a && n && a.ok !== n.ok) this.ordenApolo(n.ok ? `${s.nombre} vuelve a estar en línea.` : `¡${s.nombre} se ha caído!`); if (a && n && a.ok !== n.ok) this.apuntar('ticker', `${s.nombre}: ${n.ok ? tr('vuelve a estar en línea') : tr('caído') + ' (' + n.detalle + ')'}`, n.ok ? '' : 'error'); }
      this.poblar(); return;
    }
    if (e.tipo === 'agente' && e.agente) {
      const a = e.agente, prev = this.mc.agentes.get(a.id);
      if (a.herramienta && a.herramienta.nombre !== prev?.herramienta?.nombre) this.apuntar('ticker', `${a.nombre || a.id}: ${NOMBRE_HERR[a.herramienta.nombre] || a.herramienta.nombre} ${a.herramienta.resumen || ''}`);
      else if (!prev && a.estado === 'trabajando') this.apuntar('ticker', `${a.nombre || a.id}: ${a.padre ? tr('subagente en marcha') : tr('empieza')}`);
      else if (prev?.estado === 'trabajando' && a.estado !== 'trabajando') this.apuntar('ticker', `${a.nombre || a.id}: ${a.estado === 'listo' ? tr('terminado') : a.estado}`);
      if (a.esperando && !prev?.esperando) this.apuntar('ticker', `${a.nombre || a.id}: ${tr('esperando tu permiso')}`, 'aviso');
      const nom = String(a.nombre || a.id).replace(/^⏰\s*/, '').slice(0, 26), mod = mmNombreModelo(mmProveedor(a.modelo));
      if (!prev && a.estado === 'trabajando') this.ordenApolo(a.padre ? `¡${nom}, al taller de Leonardo!` : a.tarea ? `¡A trabajar en «${nom}»!` : `¡${mod}, encárgate de «${nom}»!`);
      else if (prev?.estado === 'trabajando' && a.estado === 'listo') this.ordenApolo(`¡Bien hecho, ${nom}!`);
      else if (prev?.estado === 'trabajando' && a.estado === 'error') this.ordenApolo(`${nom} ha fallado… lo reviso.`);
      if (a.esperando && !prev?.esperando) this.ordenApolo(`¡Demon! «${nom}» necesita tu permiso.`);
      queueMicrotask(() => this.poblar());
    } else if (e.tipo === 'registro') this.apuntar('log', `${e.origen}: ${e.texto}`, e.nivel);
    else if (e.tipo === 'memoria-uso') { this.est.memoria = 1; const n = Array.isArray(e.recuerdos) ? e.recuerdos.length : +e.recuerdos || 0; this.apuntar('ticker', `APOLO ${e.accion === 'escribir' ? tr('guardó en') : tr('consultó')} ${tr('la memoria')}${n ? ` (${n})` : ''}`); }
  },
  apuntar(donde, texto, nivel) {
    const l = this[donde]; l.unshift({ t: Date.now(), texto: String(texto).replace(/\s+/g, ' ').slice(0, 140), nivel }); if (l.length > 60) l.pop();
    if (donde === this.pestana) this.pintarTicker();
  },
  pintarTicker() {
    const el = this.caja && $('.mm-lineas', this.caja); if (!el) return;
    const l = this[this.pestana];
    el.innerHTML = l.length ? l.slice(0, 40).map(x => `<div class="${x.nivel || ''}"><span>${hora(x.t)}</span> ${esc(x.texto)}</div>`).join('') : `<div class="tenue">${tr(this.pestana === 'ticker' ? 'Sin actividad todavía…' : 'Sin registros todavía…')}</div>`;
  },
  hud() {
    if (!this.caja) return;
    const e = this.est, ags = [...this.mc.agentes.values()], vivos = ags.filter(a => a.estado === 'trabajando'), esperan = ags.filter(a => a.esperando).length;
    const tok = ags.reduce((s, a) => s + (a.uso ? a.uso.entrada + a.uso.salida : 0), 0);
    const pon = (d, h) => $$(`[data-d="${d}"]`, this.caja).forEach(x => { x.innerHTML = h; });
    pon('cpu', `CPU ${(e.cpu * 100).toFixed(0)}%`); pon('ram', `RAM ${(e.ram * e.ramTot / 1e9).toFixed(1)}/${(e.ramTot / 1e9).toFixed(0)} GB`); pon('tok', `TOKENS 6H ${fmtK(tok)}`);
    pon('agentes', `AGENTES ${vivos.length}${esperan ? ` · <em>${esperan} ESPERAN</em>` : ''}`);
    const st = e.panico ? 'PÁNICO' : esperan ? 'ESPERANDO' : vivos.length ? 'ACTIVO' : 'EN ESPERA';
    pon('status', `STATUS: <b class="${e.panico ? 'mal' : esperan ? 'aviso' : vivos.length ? 'ok' : ''}">${st}</b>`);
    pon('estado', `STATUS:<br><b class="${vivos.length ? 'ok' : ''}">${vivos.length ? 'ACTIVO' : 'EN ESPERA'}</b>`);
    const tu = this.turno, prox = (this.tareas || []).map(t => t.proxima).filter(Boolean).sort()[0];
    pon('taller', tu?.activo ? `TURNO NOCHE:<br><b class="ok">${Math.round(e.progreso * 100)}%</b>` : `TAREAS: ${(this.tareas || []).length}<br>${prox ? `PRÓXIMA ${new Date(prox).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })}` : '—'}`);
    $$('[data-b]', this.caja).forEach(i => { const v = { cpu: e.cpu, ram: e.ram, orbe: e.orbe }[i.dataset.b] ?? 0; i.firstChild.style.width = `${Math.round(Math.min(1, v) * 100)}%`; });
    const pb = $('[data-a="panico"]', this.caja); if (pb) pb.textContent = e.panico ? 'REANUDAR' : 'PÁNICO';
    this.caja.classList.toggle('mm-panico', e.panico);
  },
  // ---------- quién vive en el mundo ----------
  poblar() {
    if (!this.m) return;
    const quiere = new Map(), ahora = Date.now(), R = MM_R;
    const look = (id, extra = {}) => { const h = mmHash(id); return { ropa: MM_ROPA[h % MM_ROPA.length], pelo: MM_PELO[(h >>> 4) % MM_PELO.length], piel: MM_PIEL[(h >>> 8) % MM_PIEL.length], estilo: MM_ESTILO[(h >>> 10) % 4],
      ...((h >>> 12) % 4 === 0 ? { sombrero: 'capucha', color: MM_ROPA[(h >>> 14) % MM_ROPA.length] } : {}), ...((h >>> 16) % 3 === 0 ? { capa: MM_ROPA[(h >>> 18) % MM_ROPA.length] } : {}), mochila: (h >>> 20) % 2 === 0, ...extra }; };
    quiere.set('apolo', { tipo: 'apolo', nombre: 'APOLO', sala: 'principal', look: { ropa: '#4b3a8f', ropa2: '#e0b44a', pelo: '#d9d9d9', piel: '#f1c7a0', barba: '#eeeeee', sombrero: 'mago', color: '#3d2f7a', tunica: true, baston: true, capa: '#7a1f3d' } });
    // bots de Discord (del grupo de servicios de bots): pasean; si su servicio cae, van a la sala de servidores
    const est = this.serv?.estado || {};
    for (const g of this.serv?.grupos || []) for (const sv of g.servicios) {
      if (!/bot/i.test(g.nombre + ' ' + g.id) && !/bots?/i.test(sv.nombre)) continue;
      const b = mmBot(sv.nombre), ok = est[sv.id] ? est[sv.id].ok : true;
      quiere.set('b:' + sv.id, { tipo: 'bot', servicio: sv, online: ok, estadoServ: est[sv.id], frases: b.frases, nombre: sv.nombre, sala: ok ? '*' : (this.porRol.servidores ? 'servidores' : '*'), look: { ...b.look } });
    }
    // cada modelo pasea por su sala; cuando un agente lo usa, el modelo EN PERSONA va a hacer esa tarea (y vuelve al acabar)
    const mods = (this.modelos || []).slice(0, 14);
    const salaDe = a => a.padre ? 'subagentes' : a.tarea ? (this.porRol.taller ? 'taller' : 'principal') : 'principal';
    const nombreAg = a => String(a.nombre || a.id).replace(/^⏰\s*/, '');
    const activos = [...this.mc.agentes.values()].filter(a => a.estado === 'trabajando' || a.esperando || (a.fin && ahora - a.fin < 25000))
      .sort((a, b) => (b.estado === 'trabajando') - (a.estado === 'trabajando') || (a.inicio - b.inicio));
    const encarna = new Map(); for (const a of activos) { const p = mmProveedor(a.modelo); if (mods.some(x => x.id === p) && !encarna.has(p)) encarna.set(p, a); }
    const yaEn = new Set([...encarna.values()].map(a => a.id));
    mods.forEach((md, i) => {
      const a = encarna.get(md.id), nm = mmNombreModelo(md.id, md.tipo) === md.id && md.id.length < 4 ? md.id.toUpperCase() : mmNombreModelo(md.id, md.tipo);
      quiere.set('m:' + md.id, { tipo: 'modelo', modelo: md, fila: i, nombreModelo: nm, agente: a || null, nombre: a ? (nombreAg(a).toLowerCase().startsWith(nm.toLowerCase()) ? nombreAg(a) : `${nm} · ${nombreAg(a)}`) : nm, sala: a ? salaDe(a) : '*', look: mmLookModelo(md.id, md.tipo) });
    });
    for (const a of activos) {
      if (yaEn.has(a.id)) continue;                                    // ese lo hace el modelo en persona
      const sala = salaDe(a);
      quiere.set('a:' + a.id, { tipo: 'agente', agente: a, nombre: nombreAg(a), sala, nace: a.padre ? 'principal' : null,
        look: { ...mmLookModelo(mmProveedor(a.modelo)), ...(a.tarea && !mmLookModelo(mmProveedor(a.modelo)).especie ? { sombrero: 'casco', color: '#f5c542' } : {}), ...(a.padre ? { mochila: true } : {}) } });
    }
    if (this.porRol.servidores) (this.plugins || []).forEach(p => quiere.set('p:' + p.nombre, { tipo: 'plugin', plugin: p, nombre: p.nombre, sala: 'servidores', look: { piel: '#7ab04f', pelo: '#4e7f33', estilo: 'calvo', ropa: '#6b4f2c', pantalon: '#4a3820', orejas: true } }));
    if (this.porRol.taller) (this.tareas || []).slice(0, 3).forEach(t => quiere.set('t:' + t.id, { tipo: 'tarea', tarea: t, nombre: t.nombre, sala: 'taller', look: look(t.id, { sombrero: 'casco', color: '#e8ecef', ropa: '#5d6b4a', pantalon: '#3a4030', capa: null, mochila: false }) }));
    const pueblo = this.tema.pueblo;
    if (pueblo && pueblo !== 'humanos') for (const [id, q] of quiere) {
      if (q.tipo === 'apolo') q.look = { ...MM_JEFES[pueblo] };
      else if (q.tipo === 'plugin') q.look = { ...MM_BICHOS[pueblo] };
      else q.look = mmPueblo(q.look, id, pueblo);
    }
    for (const [id, e] of this.ents) if (!quiere.has(id)) { if (!e.sale) e.sale = ahora; }
    for (const [id, q] of quiere) {
      const e = this.ents.get(id);
      if (e) {
        Object.assign(e, { agente: q.agente, plugin: q.plugin, tarea: q.tarea, modelo: q.modelo, nombre: q.nombre, online: q.online, estadoServ: q.estadoServ }); if (q.fijo) e.fijo = q.fijo; e.sale = 0;
        if (e.tipo === 'bot' && e.online === false && !e.avisoCaido) { e.avisoCaido = true; this.decir(e, '…me he caído', 4000); } else if (e.online) e.avisoCaido = false;
        if (e.sala !== q.sala && e.tipo !== 'apolo') { e.sala = q.sala; e.ruta = []; e.espera = 0; }                 // le toca ir a otra sala: sale ya
        continue;
      }
      q.look.k = mmHash(JSON.stringify(q.look));
      const t = q.fijo ? null : (this.porRol[q.nace] && this.porRol[q.sala] ? this.puntoEn(this.porRol[q.nace]) : q.sala === '*' ? this.puntoLibre() : this.puntoEn(this.porRol[q.sala] || this.porRol.principal));
      const p = q.fijo || { x: t.x * R + R / 2, y: t.y * R + R * .8 };
      this.ents.set(id, { id, ...q, x: p.x, y: p.y, ruta: [], espera: Math.random() * 2000, frame: 0, dir: q.fijo?.dir || (q.fijo ? 'lado' : 'abajo'), izq: !!q.fijo?.izq, nace: ahora, parpHasta: 0, proxParp: ahora + Math.random() * 4000 });
    }
    for (const [id, e] of this.ents) if (e.sale && ahora - e.sale > 1500) { this.ents.delete(id); this.etiqueta(e, true); }
    this.hud();
  },
  // una casilla libre cualquiera del mapa (salas y pasillos) para pasear
  puntoLibre() {
    for (let k = 0; k < 80; k++) { const i = Math.floor(Math.random() * this.g.length); if (this.g[i] === 1 && !this.bloq[i]) return { x: i % this.m.ancho, y: Math.floor(i / this.m.ancho) }; }
    return this.puntoEn(this.porRol.principal);
  },
  puntoEn(s) {
    for (let k = 0; k < 40; k++) {
      const x = s.x + 1 + Math.floor(Math.random() * Math.max(1, s.w - 2)), y = s.y + 1 + Math.floor(Math.random() * Math.max(1, s.h - 2)), i = y * this.m.ancho + x;
      if (this.g[i] === 1 && !this.bloq[i]) return { x, y };
    }
    return { x: s.x + (s.w >> 1), y: s.y + (s.h >> 1) };
  },
  // camino por las casillas libres (BFS; el mapa es pequeño)
  camino(a, b) {
    const A = this.m.ancho, ini = a.y * A + a.x, fin = b.y * A + b.x, prev = new Int32Array(this.g.length).fill(-1), cola = [ini]; prev[ini] = ini;
    while (cola.length) { const i = cola.shift(); if (i === fin) break;
      for (const d of [1, -1, A, -A]) { const j = i + d; if (j < 0 || j >= this.g.length || prev[j] !== -1 || (d === 1 && j % A === 0) || (d === -1 && i % A === 0)) continue;
        if (this.g[j] !== 1 || (this.bloq[j] && j !== fin)) continue; prev[j] = i; cola.push(j); } }
    if (prev[fin] === -1) return [];
    const r = []; for (let i = fin; i !== ini; i = prev[i]) r.push({ x: i % A, y: Math.floor(i / A) }); return r.reverse();
  },
  mover(e, dt, t) {
    const R = MM_R, ahora = Date.now();
    if (ahora > e.proxParp) { e.parpHasta = ahora + 130; e.proxParp = ahora + 2500 + Math.random() * 4000; }
    if (e.tipo === 'apolo') return this.moverApolo(e, dt, t);
    if (e.fijo) { e.x = e.fijo.x; e.y = e.fijo.y; if (e.fijo.dir) { e.dir = e.fijo.dir; e.izq = e.fijo.izq; } e.acc = e.trabajando ? (e.tipo === 'apolo' ? 'conjura' : 'trabaja') : 'quieto'; e.frame = e.acc === 'trabaja' ? Math.floor(t / 220) % 2 : Math.floor(t / 700) % 2; return; }
    const ocupado = e.trabajando && !e.agente?.esperando;
    if (!e.ruta.length) {
      e.espera -= dt;
      e.acc = ocupado || (e.tipo === 'plugin' && (mmHash(e.id) + Math.floor(t / 4000)) % 2) ? 'trabaja' : 'quieto';
      e.frame = e.acc === 'trabaja' ? Math.floor(t / 220) % 2 : Math.floor(t / 700) % 2;
      if (e.acc === 'trabaja' && e.dir === 'arriba') e.dir = 'abajo';
      if (e.espera > 0) return;
      const libre = e.sala === '*', s = libre ? null : this.porRol[e.sala] || this.porRol.principal, dest = libre ? this.puntoLibre() : this.puntoEn(s);   // '*': todo el mapa
      e.ruta = this.camino({ x: Math.floor(e.x / R), y: Math.floor((e.y - 4) / R) }, dest);
      const aqui = this.sala[Math.floor((e.y - 4) / R) * this.m.ancho + Math.floor(e.x / R)];
      if (!e.ruta.length && s && aqui !== s.id) { e.x = dest.x * R + R / 2; e.y = dest.y * R + R * .8; e.nace = Date.now(); }   // sin pasillo hasta su sala: aparece allí
      e.espera = (ocupado ? 3000 : 1500) + Math.random() * (ocupado ? 6000 : 4000);
      return;
    }
    this.andar(e, dt);
  },
  andar(e, dt) {
    const R = MM_R, n = e.ruta[0], tx = n.x * R + R / 2, ty = n.y * R + R * .8, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), v = (e.tipo === 'plugin' ? 40 : e.tipo === 'modelo' && e.agente ? 105 : e.tipo === 'modelo' ? 44 : e.tipo === 'apolo' ? (e.prisa ? 110 : 50) : 56) * dt / 1000;   // a su tarea van con prisa; en su sala pasean
    if (d <= v) { e.x = tx; e.y = ty; e.ruta.shift(); } else { e.x += dx / d * v; e.y += dy / d * v; }
    if (Math.abs(dx) > Math.abs(dy)) { e.dir = 'lado'; e.izq = dx < 0; } else if (Math.abs(dy) > .5) e.dir = dy < 0 ? 'arriba' : 'abajo';
    e.acc = 'anda'; e.paso = (e.paso || 0) + dt; e.frame = Math.floor(e.paso / 130) % 4;
    if (e.frame !== e.ultFrame && e.frame % 2 === 1 && this.parts.length < 500) this.parts.push({ x: e.x + (Math.random() - .5) * 6, y: e.y, vx: (Math.random() - .5) * 10, vy: -6, vida: 0, max: 500, tam: 2, col: '170,160,140', tipo: 'polvo' });
    e.ultFrame = e.frame;
  },
  // APOLO, el jefe: si hay trabajo va al orbe a conjurar; si no, patrulla las salas y comenta lo que ve
  moverApolo(e, dt, t) {
    const R = MM_R, ahora = Date.now(), o = this.orbe, puesto = { x: o.x - 1, y: o.y + 2 }, aqui = { x: Math.floor(e.x / R), y: Math.floor((e.y - 4) / R) };
    if (ahora > e.proxParp) { e.parpHasta = ahora + 130; e.proxParp = ahora + 2500 + Math.random() * 4000; }
    if (e.trabajando) {
      if (aqui.x === puesto.x && aqui.y === puesto.y && !e.ruta.length) { e.acc = 'conjura'; e.dir = 'lado'; e.izq = false; e.frame = Math.floor(t / 700) % 2; e.destino = null; return; }
      if (!e.ruta.length || e.destino !== 'orbe') { e.ruta = this.camino(aqui, puesto); e.destino = 'orbe'; e.prisa = true; if (!e.ruta.length) { e.x = puesto.x * R + R / 2; e.y = puesto.y * R + R * .8; return; } }
      return this.andar(e, dt);
    }
    e.prisa = false;
    if (e.ruta.length) return this.andar(e, dt);
    if (e.destino && e.destino !== 'orbe') { this.decir(e, this.comentario(e.destino)); e.destino = null; e.espera = 6000 + Math.random() * 5000; }
    else if (e.destino === 'orbe') { e.destino = null; e.espera = 3000; }
    e.acc = 'quieto'; e.frame = Math.floor(t / 700) % 2; e.espera = (e.espera ?? 2000) - dt;
    if (e.espera > 0) return;
    const roles = Object.keys(this.porRol).filter(r => r !== e.ultimaSala), rol = roles[Math.floor(Math.random() * roles.length)];
    e.ultimaSala = rol; e.destino = rol; e.ruta = this.camino(aqui, this.puntoEn(this.porRol[rol]));
    if (!e.ruta.length) e.espera = 3000;
  },
  comentario(rol) {
    const est = this.serv?.estado || {}, todos = (this.serv?.grupos || []).flatMap(g => g.servicios), caidos = todos.filter(s => est[s.id] && !est[s.id].ok);
    const ags = [...this.mc.agentes.values()], uno = l => l[Math.floor(Math.random() * l.length)];
    if (rol === 'servidores') return todos.length ? (caidos.length ? `${todos.length - caidos.length}/${todos.length} en línea… ¡${caidos[0].nombre} sigue caído!` : `${todos.length}/${todos.length} servicios en línea. Bien.`) : uno(['Los servidores zumban tranquilos.', 'CPU al ' + Math.round(this.est.cpu * 100) + '%. Todo en orden.']);
    if (rol === 'taller') { const prox = (this.tareas || []).map(x => x.proxima).filter(Boolean).sort()[0]; return prox ? `Próxima tarea a las ${new Date(prox).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })}.` : 'El taller está listo para lo que venga.'; }
    if (rol === 'subagentes') return uno(['Bonitos inventos, Leonardo.', '¿Quién ha tocado el ornitóptero?', 'Aquí trabajan mis subagentes.']);
    if (rol === 'mcp') return uno(['El portal está en calma.', `${(this.mcpServ || []).filter(s => s.conectado).length} servidores MCP listos para conjurar.`, 'Que nadie toque las runas.']);
    if (rol === 'principal') { const hechos = ags.filter(a => a.fin && Date.now() - a.fin < 6 * 3600e3).length; return hechos ? `${hechos} encargos terminados hoy. Buen equipo.` : uno(['Todo en orden.', 'El orbe está tranquilo.', 'Esperando órdenes de Demon.']); }
    return uno(['Todo en orden.', 'Sigo de ronda.']);
  },
  // bocadillo de texto sobre un personaje (HTML: nítido); APOLO habla de uno en uno
  decir(e, texto, ms = 3800) {
    if (!e || !this.capaNombres) return;
    if (!e.dice) { e.dice = document.createElement('span'); e.dice.className = 'mm-dice' + (e.tipo === 'apolo' ? ' jefe' : ''); this.capaNombres.append(e.dice); }
    e.dice.textContent = texto; e.diceHasta = Date.now() + ms; e.dice.hidden = false;
  },
  ordenApolo(texto) {
    const a = this.ents.get('apolo'); if (!a) return;
    const ahora = Date.now(); if (a.diceHasta && ahora < a.diceHasta - 1500) { (this.colaApolo ||= []).push(texto); if (this.colaApolo.length > 3) this.colaApolo.shift(); return; }
    this.decir(a, texto);
  },
  // ---------- dibujo ----------
  cuadro(t) {
    this.raf = 0; if (!this.caja || !this.cv?.isConnected) return;
    const dt = Math.min(100, t - (this.tAnt || t));
    if (dt < 28 && this.tAnt) { this.raf = requestAnimationFrame(x => this.cuadro(x)); return; }   // ~35 fps: de sobra y gasta menos
    this.tAnt = t;
    if (!this.pausa) this.dibujar(t, dt);
    this.raf = requestAnimationFrame(x => this.cuadro(x));
  },
  dibujar(t, dt) {
    const c = this.c, e = this.est, R = MM_R, ahora = Date.now(), vivos = [...this.mc.agentes.values()].filter(a => a.estado === 'trabajando');
    e.orbe += ((vivos.length ? Math.min(1, .5 + vivos.length * .15) : .1) - e.orbe) * Math.min(1, dt / 600);
    e.memoria *= Math.exp(-dt / 900); e.bahia = vivos.filter(a => a.padre).length;
    const conjura = vivos.find(a => a.herramienta && mmEsMcp(a.herramienta.nombre));             // alguien usa una herramienta MCP: el laboratorio se activa
    if (conjura) { this.ultConjuro = { txt: mmEtiquetaMcp(conjura.herramienta.nombre), t: Date.now() }; }
    const activoMcp = this.ultConjuro && Date.now() - this.ultConjuro.t < 2500;
    e.mcp += ((activoMcp ? 1 : 0) - e.mcp) * Math.min(1, dt / (activoMcp ? 350 : 900));

    const enUso = new Set(vivos.map(a => mmProveedor(a.modelo)));
    for (const x of this.ents.values()) { x.trabajando = x.agente ? x.agente.estado === 'trabajando' : x.tipo === 'apolo' ? vivos.length > 0 : x.tipo === 'modelo' ? enUso.has(x.modelo.id) || (x.modelo.puente && false) : false; this.mover(x, dt, t); }
    c.globalCompositeOperation = 'source-over'; c.drawImage(this.fondo, 0, 0);
    const luces = [], borde = this.tema.borde, carteles = [], s = this.porRol;
    for (const g of (e.racks || new Map()).values()) { const n = g.items.filter(x => x.ok).length, mal = n < g.items.length;
      const dR = MM_OBJ[g.rack.tipo]; carteles.push(mmCartel(c, (g.rack.x + dR.w / 2) * R, (g.rack.y + dR.h) * R + 2, `${g.grupo.nombre.toUpperCase().split(" ")[0].slice(0, 9)} ${n}/${g.items.length}`, { borde: mal ? '#ff3b5c' : '#3dff8a', max: 60, brillo: mal ? .5 + Math.sin(t / 200) * .5 : 0 })); }
    if (s.servidores && [...(e.racks || new Map()).values()].some(g => g.items.some(x => !x.ok))) {   // alarma: luz roja que gira en la sala
      const sx = (s.servidores.x + s.servidores.w / 2) * R, sy = (s.servidores.y + 1.2) * R, a = t / 300;
      luces.push({ x: sx + Math.cos(a) * 40, y: sy + Math.sin(a) * 20 + 60, r: 150, col: [255, 40, 60], a: .45, bloom: 10 }); }
    if (s.taller) { const prox = (this.tareas || []).map(x => x.proxima).filter(Boolean).sort()[0], tu = this.turno;
      carteles.push(mmCartel(c, (s.taller.x + s.taller.w / 2) * R, (s.taller.y + s.taller.h - 1) * R + 6, tu?.activo ? `TURNO DE NOCHE ${Math.round(e.progreso * 100)}%` : `TAREAS ${(this.tareas || []).length}${prox ? ' · PRÓXIMA ' + new Date(prox).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' }) : ''}`, { borde, max: s.taller.w * R })); }
    if (s.mcp) { const vivo = e.mcp > .25 && this.ultConjuro;
      carteles.push(mmCartel(c, (s.mcp.x + s.mcp.w / 2) * R, (s.mcp.y + s.mcp.h - 1) * R + 6, vivo ? '✦ ' + this.ultConjuro.txt.toUpperCase() : (s.mcp.nombre || 'LABORATORIO MCP').toUpperCase(), { borde: vivo ? '#c85aff' : borde, max: s.mcp.w * R, brillo: vivo ? .6 + Math.sin(t / 160) * .4 : 0 })); }
    // objetos de pared primero; luego lo que está en el suelo y los personajes, ordenados por su base
    const cosas = [];
    for (const o of this.m.objetos) { const d = MM_OBJ[o.tipo]; if (!d) continue; const X = o.x * R, Y = o.y * R - d.alto; cosas.push({ o, d, X, Y, base: d.bloq ? (o.y + d.h) * R - 2 : -1 }); if (d.luz) luces.push(...d.luz(o, X, Y, t, e)); }
    for (const p of this.ents.values()) cosas.push({ p, base: p.y });
    for (const l of this.lavaLuz || []) luces.push({ x: l.x, y: l.y, r: 70, col: [255, 110, 40], a: .32 + Math.sin(t / 400 + l.f) * .08 });
    for (const k of carteles) luces.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, r: Math.max(60, k.w * .7), col: [200, 230, 225], a: .22 });
    for (const sa of this.m.salas) if (sa.nombre && sa.rol !== 'mcp') luces.push({ x: (sa.x + sa.w / 2) * R, y: sa.y * R + 18, r: 80, col: [200, 230, 225], a: .18 });
    cosas.sort((a, b) => a.base - b.base);
    for (const k of cosas) {
      if (k.o) { c.drawImage(mmSpriteObjeto(k.o), k.X, k.Y); k.d.vivo?.(c, k.X, k.Y, t, e, k.o); continue; }
      const p = k.p, alfa = p.sale ? Math.max(0, 1 - (ahora - p.sale) / 1500) : Math.min(1, (ahora - p.nace) / 500);
      c.globalAlpha = alfa;
      c.fillStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(p.x, p.y, 13, 5, 0, 0, 7); c.fill();
      if (this.sel?.p === p || this.encima === p) { c.strokeStyle = this.tema.borde; c.lineWidth = 1; c.globalAlpha = alfa * (.6 + Math.sin(t / 200) * .3); c.beginPath(); c.ellipse(p.x, p.y, 18, 7, 0, 0, 7); c.stroke(); c.globalAlpha = alfa; }
      const sp = mmPJ(p.look, p.dir, p.frame, p.acc || 'quieto', ahora < p.parpHasta);
      const E = p.tipo === 'apolo' ? 1.8 : 1.5, lev = p.look.flota ? 9 + Math.sin(t / 420) * 3 : 0, bx = Math.round(p.x - 14 * E), by = Math.round(p.y - 50 * E - lev);                       // a 1,5×: el tamaño de la referencia
      if (p.dir === 'lado' && p.izq) { c.save(); c.translate(bx + 28 * E, by); c.scale(-1, 1); c.drawImage(sp, 0, 0, 28 * E, 54 * E); c.restore(); } else c.drawImage(sp, bx, by, 28 * E, 54 * E);
      c.globalAlpha = 1;
      if (p.look.balon) {                                             // el balón va por delante de sus pies
        const b = p.balon || (p.balon = { x: p.x + 10, y: p.y }), fx = p.x + (p.dir === 'lado' ? (p.izq ? -12 : 12) : 6), fy = p.y + (p.dir === 'abajo' ? 6 : p.dir === 'arriba' ? -4 : 1);
        b.x += (fx - b.x) * .18; b.y += (fy - b.y) * .18; const bote = p.acc === 'anda' ? Math.abs(Math.sin(t / 140)) * 5 : 0;
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(b.x, b.y + 1, 4, 1.5, 0, 0, 7); c.fill();
        c.fillStyle = '#f4f4f4'; c.beginPath(); c.arc(b.x, b.y - 3 - bote, 3.5, 0, 7); c.fill(); c.fillStyle = '#1c1c1c'; c.fillRect(b.x - 1 | 0, b.y - 4 - bote | 0, 2, 2); c.fillRect(b.x + 1 | 0, b.y - 2 - bote | 0, 1, 1); }
      if (p.tipo === 'bot' && p.online && Date.now() > (p.proxFrase ||= Date.now() + 4000 + Math.random() * 12000)) { this.decir(p, p.frases[Math.floor(Math.random() * p.frases.length)], 3200); p.proxFrase = Date.now() + 14000 + Math.random() * 22000; }
      if (this.colaApolo?.length && p.tipo === 'apolo' && !(p.diceHasta > Date.now())) this.decir(p, this.colaApolo.shift());
      const cat = p.agente?.herramienta ? mmCategoria(p.agente.herramienta.nombre) : null; p.cat = cat;
      if (cat) luces.push({ x: p.x, y: p.y - 30, r: 90, col: MM_EFECTO[cat], a: .55 });
      if (p.tipo === 'modelo' && p.trabajando) luces.push({ x: p.x, y: p.y - 30, r: 60, col: mmRGB(p.look.color || p.look.ropa || '#ffffff'), a: .35 });
      if (p.look.sombrero === 'casco' && p.dir !== 'arriba') luces.push({ x: p.x + (p.dir === 'lado' ? (p.izq ? -9 : 9) : 0), y: p.y - 66, r: 46, col: [255, 240, 190], a: .45 });
      if (p.tipo === 'apolo') luces.push({ x: p.x, y: p.y - 40, r: 70, col: [255, 210, 120], a: .3 });          // el jefe lleva su propia luz
      if (p.look.baston) luces.push({ x: p.x + (p.acc === 'conjura' ? 0 : 7), y: p.y - (p.acc === 'conjura' ? 104 : 80), r: p.trabajando ? 70 : 34, col: [130, 240, 255], a: p.trabajando ? .7 : .35, bloom: p.trabajando ? 10 : 0 });
    }
    // luz: ambiente + salas + fuentes → se multiplica sobre la escena
    const L = this.lc, A = this.tema.amb, lw = this.luz.width, lh = this.luz.height;
    L.globalCompositeOperation = 'source-over'; L.fillStyle = `rgb(${A[0]},${A[1]},${A[2]})`; L.fillRect(0, 0, lw, lh);
    L.globalCompositeOperation = 'lighter';
    L.fillStyle = `rgba(255,236,210,${this.tema.sala})`; for (const s of this.m.salas) L.fillRect(s.x * R / 2, s.y * R / 2, s.w * R / 2, s.h * R / 2);
    const rayos = this.rayos(t);
    for (const r of rayos) luces.push({ x: r[2], y: r[3], r: 40, col: [140, 230, 255], a: .6 });
    for (const l of luces) { const g = L.createRadialGradient(l.x / 2, l.y / 2, 0, l.x / 2, l.y / 2, l.r / 2); g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${l.a})`); g.addColorStop(.45, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${l.a * .38})`); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect((l.x - l.r) / 2, (l.y - l.r) / 2, l.r, l.r); }
    if (e.panico) { L.globalCompositeOperation = 'source-over'; L.fillStyle = `rgba(255,40,60,${.12 + Math.sin(t / 300) * .06})`; L.fillRect(0, 0, lw, lh); }
    c.globalCompositeOperation = 'multiply'; c.imageSmoothingEnabled = true; c.drawImage(this.luz, 0, 0, this.W, this.H); c.imageSmoothingEnabled = false;
    // brillo (bloom), rayos y partículas: suman luz
    c.globalCompositeOperation = 'lighter';
    for (const l of luces) if (l.bloom) { const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.bloom); g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},.55)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(l.x - l.bloom, l.y - l.bloom, l.bloom * 2, l.bloom * 2); }
    for (const r of rayos) mmRayo(c, r[0], r[1], r[2], r[3], r[4], r[5], e.nucleoRGB);
    if (String(e.nucleo).startsWith('cerebro')) {                     // el cerebro chisporrotea siempre: arcos cortos alrededor
      const ox = this.orbe.x * R + 32, oy = this.orbe.y * R + 12, n = 3 + Math.round(e.orbe * 3);
      for (let i = 0; i < n; i++) { const a = mmF(this.semilla, i, 90) * 6.28, d = 50 + mmF(i, this.semilla, 91) * 50; mmRayo(c, ox, oy, ox + Math.cos(a) * d, oy + Math.sin(a) * d * .7, this.semilla + i * 7, .5 + e.orbe * .4, e.nucleoRGB); }
    }
    const ob = { x: this.orbe.x * R + 32, y: this.orbe.y * R + 14 }, libros = this.m.objetos.filter(o => o.tipo === 'estanteria');
    for (const p of this.ents.values()) {
      if (p.sale) continue;
      if (p.cat) {
        mmAura(c, p.x, p.y, p.cat, t);
        if (p.cat === 'web') mmCorriente(c, ob.x, ob.y, p.x, p.y - 34, MM_EFECTO.web, t, 1.2);
        else if (p.cat === 'mcp' && this.portal) mmCorriente(c, p.x, p.y - 34, this.portal.x, this.portal.y + 40, MM_EFECTO.mcp, t, 1.1);
        else if (p.cat === 'memoria' && libros.length) { const l = libros.reduce((a, b) => Math.hypot(a.x * R - p.x, a.y * R - p.y) < Math.hypot(b.x * R - p.x, b.y * R - p.y) ? a : b); mmCorriente(c, l.x * R + 32, l.y * R + 10, p.x, p.y - 34, MM_EFECTO.memoria, t); e.memoria = Math.max(e.memoria, .7); }
      }
      if (p.agente?.esperando) { c.strokeStyle = `rgba(255,60,90,${.5 + Math.sin(t / 150) * .4})`; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, 20, 8, 0, 0, 7); c.stroke(); }
      if (p.tipo === 'modelo' && p.trabajando) mmCorriente(c, p.x, p.y - 40, ob.x, ob.y, mmRGB(p.look.emCol2 && p.look.especie !== 'llama' ? p.look.ropa : p.look.color || p.look.ropa || '#7ff3ff'), t, .7);
    }
    this.particulas(c, t, dt);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.vin, 0, 0);
    for (const p of this.ents.values()) { this.burbuja(c, p, t); this.etiqueta(p); }
    if (this.sel) this.seguirHolo();
  },
  rayos(t) {
    const o = this.orbe, R = MM_R, ox = o.x * R + 32, oy = o.y * R + 14, r = [];
    if (!this.semilla || t - this.tRayo > 85) { this.semilla = (Math.random() * 1e6) | 0; this.tRayo = t; }
    let k = 0;
    for (const p of this.ents.values()) { if (!p.trabajando || p.tipo === 'apolo' || p.tipo === 'modelo' || p.sale || p.cat === 'web' || p.cat === 'memoria' || p.cat === 'mcp') continue; r.push([ox, oy, p.x, p.y - 33, this.semilla + k++ * 13, 1]); }
    const a = this.ents.get('apolo'); if (a?.trabajando && a.acc === 'conjura') r.push([a.x, a.y - 104, ox - 8, oy - 4, this.semilla + 99, .7]);
    return r;
  },
  particulas(c, t, dt) {
    const P = this.parts, R = MM_R, e = this.est;
    if (P.length < 480) {
      for (const o of this.m.objetos) {
        if (o.tipo === 'antorcha' && Math.random() < dt / 260) P.push({ x: o.x * R + 16 + (Math.random() - .5) * 4, y: o.y * R + 2, vx: (Math.random() - .5) * 8, vy: -18 - Math.random() * 14, vida: 0, max: 900 + Math.random() * 700, tam: 1, col: '255,170,70', tipo: 'brasa' });
        else if (o.tipo === 'orbe' && Math.random() < dt / (120 - e.orbe * 80)) { const a = Math.random() * 6.28; P.push({ x: o.x * R + 32 + Math.cos(a) * 14, y: o.y * R + 14 + Math.sin(a) * 14, vx: Math.cos(a) * 10, vy: -8 - Math.random() * 10, vida: 0, max: 1200, tam: 1, col: '150,240,255', tipo: 'chispa' }); }
        else if (o.tipo === 'caldero' && Math.random() < dt / 500) P.push({ x: o.x * R + 10 + Math.random() * 12, y: o.y * R + 10, vx: (Math.random() - .5) * 4, vy: -12, vida: 0, max: 1600, tam: 2, col: '170,255,190', tipo: 'mota' });
        else if (o.tipo === 'portal' && e.mcp > .3 && Math.random() < dt / 40 && this.portal) { const a = Math.random() * 6.28, v = 20 + Math.random() * 40; P.push({ x: this.portal.x, y: this.portal.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, vida: 0, max: 450, tam: 1, col: Math.random() < .5 ? '255,220,255' : '170,250,255', tipo: 'chispa' }); }
        else if (o.tipo === 'impresora' && Math.random() < dt / 700) P.push({ x: o.x * R + 20 + Math.random() * 56, y: o.y * R + 50, vx: (Math.random() - .5) * 30, vy: -10, vida: 0, max: 400, tam: 1, col: '255,200,90', tipo: 'brasa' });
      }
      const amb = this.tema.particulas, cada = amb === 'esporas' ? 90 : amb === 'chispas' ? 160 : 300;
      if (amb !== 'ninguna' && Math.random() < dt / cada) { const s = this.m.salas[Math.random() * this.m.salas.length | 0];
        P.push({ x: (s.x + Math.random() * s.w) * R, y: (s.y + Math.random() * s.h) * R, vx: (Math.random() - .5) * (amb === 'chispas' ? 30 : 4), vy: amb === 'brasas' ? -8 - Math.random() * 8 : -2 - Math.random() * 3, vida: 0, max: amb === 'chispas' ? 700 : 5000, tam: amb === 'esporas' ? 2 : 1,
          col: amb === 'esporas' ? '140,255,160' : amb === 'chispas' ? '130,220,255' : this.tema.luz === 'lava' ? '255,150,60' : '230,220,200', tipo: amb === 'chispas' ? 'chispa' : 'mota' }); }
      if (this.lavaLuz?.length && Math.random() < dt / 120) { const l = this.lavaLuz[Math.random() * this.lavaLuz.length | 0]; P.push({ x: l.x + (Math.random() - .5) * 20, y: l.y, vx: (Math.random() - .5) * 6, vy: -14 - Math.random() * 10, vida: 0, max: 1400, tam: 1, col: '255,170,60', tipo: 'brasa' }); }
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.vida += dt; if (q.vida > q.max) { P.splice(i, 1); continue; }
      q.x += q.vx * dt / 1000 + (q.tipo === 'brasa' ? Math.sin((q.vida + i * 50) / 120) * .25 : 0); q.y += q.vy * dt / 1000;
      const f = 1 - q.vida / q.max, a = q.tipo === 'mota' ? Math.sin(f * Math.PI) * .35 : q.tipo === 'polvo' ? f * .35 : f;
      if (q.tipo === 'polvo') { c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgba(${q.col},${a})`; c.beginPath(); c.arc(q.x, q.y - 1, 2 + (1 - f) * 3, 0, 7); c.fill(); c.globalCompositeOperation = 'lighter'; continue; }
      c.fillStyle = `rgba(${q.col},${a})`; c.fillRect(Math.round(q.x), Math.round(q.y), q.tam, q.tam);
      if (q.tipo !== 'mota') { c.fillStyle = `rgba(${q.col},${a * .25})`; c.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3); }
    }
  },
  burbuja(c, p, t) {
    const a = p.agente; let s = null;
    if (p.tipo === 'bot' && p.online === false) s = '×'; else if (a?.esperando) s = '!'; else if (a && a.estado !== 'trabajando') s = a.estado === 'listo' ? '✓' : '×';
    else if (a?.herramienta) s = 'icono'; else if (p.trabajando && p.tipo !== 'apolo' && p.tipo !== 'modelo') s = '…';
    if (!s) return;
    const alto = (p.look.sombrero === 'mago' ? (p.acc === 'conjura' ? 100 : 92) : p.look.sombrero ? 70 : 66) * (p.tipo === 'apolo' ? 1.2 : 1);
    c.globalAlpha = p.sale ? Math.max(0, 1 - (Date.now() - p.sale) / 1500) : 1;
    const by = p.y - alto - (p.look.flota ? 10 : 0) + (s === '!' ? Math.round(Math.sin(t / 110)) : 0);
    if (s === 'icono') mmBurbujaIcono(c, p.x + 10, by, mmCategoria(a.herramienta.nombre), t); else mmBurbuja(c, p.x + 10, by, s, t); c.globalAlpha = 1;
  },
  // nombre encima de agentes y subagentes (HTML: nítido a cualquier tamaño)
  etiqueta(p, quitar) {
    if (quitar) { p.dice?.remove(); }
    if (p.dice) { const vivo = Date.now() < p.diceHasta; p.dice.hidden = !vivo; if (vivo) { const alto = (p.look.sombrero === 'mago' ? 100 : 74) * (p.tipo === 'apolo' ? 1.2 : 1) + 22; p.dice.style.left = `${(p.x / this.W * 100).toFixed(2)}%`; p.dice.style.top = `${((p.y - alto) / this.H * 100).toFixed(2)}%`; } }
    if (!p.el && (quitar || (p.tipo !== 'agente' && p.tipo !== 'modelo' && p.tipo !== 'apolo' && p.tipo !== 'bot'))) return;
    if (p.el && p.el.dataset.n !== p.nombre) { p.el.textContent = p.nombre.length > 28 ? p.nombre.slice(0, 27) + '…' : p.nombre; p.el.dataset.n = p.nombre; }
    if (quitar) { p.el?.remove(); return; }
    if (!p.el) { p.el = document.createElement('span'); p.el.className = 'mm-nombre' + (p.tipo === 'modelo' ? ' modelo' : p.tipo === 'apolo' ? ' jefe' : p.tipo === 'bot' ? ' bot' : ''); if (p.tipo === 'modelo') p.el.style.setProperty('--c', p.look.especie ? '#f4f4f4' : p.look.ropa); p.el.textContent = p.nombre.length > 22 ? p.nombre.slice(0, 21) + '…' : p.nombre; this.capaNombres.append(p.el); }
    const alto = ((p.look.sombrero === 'mago' ? 100 : p.look.especie ? 82 : 74) + (p.look.flota ? 12 : 0)) * (p.tipo === 'apolo' ? 1.2 : 1);
    const abajo = p.tipo === 'modelo' && !p.agente && this.porRol.modelos && this.sala[Math.floor((p.y - 4) / MM_R) * this.m.ancho + Math.floor(p.x / MM_R)] === this.porRol.modelos.id;                                   // en su sala, el nombre va a los pies como una placa
    p.el.style.left = `${((p.x - (abajo ? 0 : 4)) / this.W * 100).toFixed(2)}%`; p.el.style.top = `${((abajo ? p.y + 12 + (p.fila % 2) * 12 : p.y - alto) / this.H * 100).toFixed(2)}%`;
    p.el.style.opacity = p.sale ? Math.max(0, 1 - (Date.now() - p.sale) / 1500) : 1;
  },
  // ---------- interacción ----------
  punto(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H }; },
  enPunto(x, y) {
    let mejor = null, md = 20;
    for (const p of this.ents.values()) { const d = Math.hypot(p.x - x, p.y - 30 - y); if (d < md + 8) { md = d; mejor = { p }; } }
    if (mejor) return mejor;
    for (const o of this.m.objetos) { const d = MM_OBJ[o.tipo]; if (d && ['orbe', 'rack', 'vaina', 'jaula', 'impresora', 'estanteria', 'portal'].includes(o.tipo) && x >= o.x * MM_R && x < (o.x + d.w) * MM_R && y >= o.y * MM_R - d.alto && y < (o.y + d.h) * MM_R) return { o }; }
    return null;
  },
  clic(e) { const p = this.punto(e), h = this.enPunto(p.x, p.y); if (!h) return this.cerrarHolo(); this.abrirHolo(h); },
  abrirHolo(h) {
    const det = $('.mm-holo', this.caja), ags = [...this.mc.agentes.values()], vivos = ags.filter(a => a.estado === 'trabajando');
    let col = this.tema.borde, cab, cuerpo = '';
    const fila = (k, v) => `<div class="mm-fila"><span>${tr(k)}</span><b>${v}</b></div>`;
    if (h.p?.agente) {
      const a = h.p.agente; col = a.esperando ? '#ff4d6a' : a.padre ? '#7fd1ff' : a.tarea ? '#f5c542' : '#a58bff';
      cab = [h.p.tipo === 'modelo' ? String(a.nombre || a.id) : h.p.nombre, `${h.p.tipo === 'modelo' ? h.p.nombreModelo + ' · ' : ''}${nombreModelo(a.modelo)}${a.padre ? ` · ${tr('subagente')}` : a.tarea ? ` · ${tr('tarea programada')}` : a.canal ? ` · ${a.canal}` : ''}`];
      cuerpo = fila('Estado', tr(a.esperando ? 'Esperando tu permiso' : (ESTADO_AG[a.estado] || ESTADO_AG.quieto)[1])) +
        (a.herramienta ? fila('Haciendo', `${esc(NOMBRE_HERR[a.herramienta.nombre] || a.herramienta.nombre)} <small>${esc(String(a.herramienta.resumen || '').slice(0, 120))}</small>`) : a.ultimo ? fila('Último', esc(String(a.ultimo).slice(0, 160))) : '') +
        fila('Tiempo', a.inicio ? cronoTxt((a.fin || Date.now()) - a.inicio) : '—') + fila('Pasos', a.pasos || 0) + (a.uso?.entrada ? fila('Tokens', fmtK(a.uso.entrada + a.uso.salida)) : '') +
        `<div class="mm-acc">${a.estado === 'trabajando' ? `<button class="btn mini mal" data-parar="${esc(a.id)}">${ic('parar')}${tr('Detener')}</button>` : ''}<a class="btn mini" href="#/chat/${esc(a.id)}">${tr('Abrir')} ${ic('der')}</a></div>`;
    } else if (h.p?.tipo === 'apolo' || h.o?.tipo === 'orbe') {
      col = '#7ff3ff'; cab = ['APOLO', tr('Agente orquestador')];
      cuerpo = fila('Trabajando', vivos.filter(a => !a.padre).length) + fila('Subagentes', vivos.filter(a => a.padre).length) + fila('Esperan permiso', ags.filter(a => a.esperando).length) +
        fila('Terminados (6 h)', ags.filter(a => a.fin).length);
    } else if (h.p?.tipo === 'modelo') {
      const md = h.p.modelo, usan = vivos.filter(a => mmProveedor(a.modelo) === md.id); col = h.p.look.especie ? '#f4f4f4' : h.p.look.ropa;
      cab = [h.p.nombre, md.puente ? tr('Puente conectado') : `${tr('Modelo conectado')} · ${md.id}`];
      cuerpo = fila('Estado', usan.length ? `<span style="color:#4dff8f">${tr('trabajando')}</span>` : tr('disponible')) + fila('Agentes usándolo', usan.length) +
        (usan.length ? `<div class="mm-txt">${usan.slice(0, 5).map(a => esc(String(a.nombre || a.id))).join('<br>')}</div>` : '') +
        fila('Terminados (6 h)', ags.filter(a => a.fin && mmProveedor(a.modelo) === md.id).length);
    } else if (h.p?.tipo === 'bot') {
      const st = h.p.estadoServ; col = h.p.online === false ? '#ff4d6a' : '#5865f2';
      cab = [h.p.nombre, tr('Bot de Discord')];
      cuerpo = fila('Estado', h.p.online === false ? `<span style="color:#ff6b7d">${tr('caído')}</span>` : `<span style="color:#4dff8f">${tr('en línea')}</span>`) +
        (st ? fila('Detalle', esc(st.detalle || '')) + fila('Desde', st.desde ? new Date(st.desde).toLocaleString(I18N.locale()) : '—') : '') +
        `<div class="mm-txt">«${esc(h.p.frases[0])}»</div>`;
    } else if (h.p?.tipo === 'plugin') { col = '#8fdc5a'; cab = [h.p.nombre, `plugin ${h.p.plugin.version || ''}`]; cuerpo = `<div class="mm-txt">${esc(h.p.plugin.descripcion || '')}</div>${fila('Permisos', esc((h.p.plugin.permisos || []).join(', ') || '—'))}`; }
    else if (h.p?.tipo === 'tarea') { const t = h.p.tarea; col = '#f5c542'; cab = [h.p.nombre, tr('Tarea programada')]; cuerpo = `<div class="mm-txt">${esc(String(t.accion?.texto || '').slice(0, 260))}</div>${fila('Próxima', t.proxima ? new Date(t.proxima).toLocaleString(I18N.locale()) : '—')}${fila('Último resultado', esc(String(t.ultimoResultado || '—').slice(0, 80)))}`; }
    else if (MM_SERVIDOR.includes(h.o?.tipo) && this.est.racks?.get(`${h.o.x},${h.o.y}`)) {
      const g = this.est.racks.get(`${h.o.x},${h.o.y}`), n = g.items.filter(x => x.ok).length; col = n < g.items.length ? '#ff4d6a' : '#3dff8a';
      cab = [g.grupo.nombre, tr('{a} de {b} en línea', { a: n, b: g.items.length })];
      cuerpo = g.items.map(s => `<div class="mm-fila"><span style="color:${s.pendiente ? '#8ea4b8' : s.ok ? '#4dff8f' : '#ff6b7d'}">● ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:inherit">${esc(s.nombre)}</a>` : esc(s.nombre)}</span><b>${s.pendiente ? tr('comprobando…') : s.ok ? (s.ms ? s.ms + ' ms' : esc(s.detalle || 'ok')) : esc(s.detalle || tr('caído'))}</b></div>`).join('') +
        `<div class="mm-acc"><button class="btn mini" data-serv="revisar">${ic('recargar')}${tr('Revisar ahora')}</button><button class="btn mini" data-serv="editar">${ic('editar')}${tr('Editar servicios')}</button></div>`;
    }
    else if (MM_SERVIDOR.includes(h.o?.tipo)) { cab = [tr('Núcleo'), tr('Sala de servidores')]; cuerpo = fila('CPU', `${Math.round(this.est.cpu * 100)}%`) + fila('RAM', `${(this.est.ram * this.est.ramTot / 1e9).toFixed(1)} / ${(this.est.ramTot / 1e9).toFixed(0)} GB`) + fila('Plugins activos', (this.plugins || []).length); }
    else if (h.o?.tipo === 'impresora') { col = '#ff8a3d'; cab = [tr('Taller'), tr('Turno de noche y tareas')]; const tu = this.turno; cuerpo = fila('Turno de noche', tu?.activo ? `${Math.round(this.est.progreso * 100)}%` : tr('parado')) + fila('En cola', tu?.cola?.length || 0) + fila('Tareas activas', (this.tareas || []).length) + `<div class="mm-acc"><a class="btn mini" href="#/turno">${tr('Turno de noche')} ${ic('der')}</a></div>`; }
    else if (h.o?.tipo === 'portal') {
      col = '#c85aff'; cab = [tr('Laboratorio MCP'), tr('Donde se conjuran las herramientas MCP')];
      const usando = vivos.filter(a => a.herramienta && mmEsMcp(a.herramienta.nombre));
      cuerpo = fila('Ahora', usando.length ? esc(mmEtiquetaMcp(usando[0].herramienta.nombre)) : tr('en reposo')) + (usando.length ? fila('Quién', esc(String(usando[0].nombre || usando[0].id))) : '') +
        `<div class="mm-txt">${(this.mcpServ || []).map(s => `${s.conectado ? '●' : '○'} <b>${esc(s.nombre)}</b> · ${s.herramientas.length} ${tr('herramientas')}`).join('<br>') || tr('Sin servidores MCP remotos. Claude Code y otros agentes también usan MCP: sus llamadas mcp__… se conjuran aquí.')}</div>`;
    }
    else if (h.o?.tipo === 'estanteria') { col = '#ff5c7a'; cab = [tr('Memoria'), tr('Biblioteca')]; cuerpo = `<div class="mm-txt">${tr('Brilla en rojo cuando APOLO lee o guarda recuerdos.')}</div><div class="mm-acc"><a class="btn mini" href="#/memoria/grafo">${tr('Ver el grafo')} ${ic('der')}</a></div>`; }
    if (!cab) return;
    this.sel = h; det.hidden = false; det.classList.remove('on', 'sale'); det.style.setProperty('--holo', col);
    det.innerHTML = `<div class="mv-holo-c"><div class="mv-holo-cab" style="--i:0"><div class="mv-ent"><i style="background:${col}"></i><div><b>${esc(cab[0])}</b><small>${esc(cab[1])}</small></div></div><button class="mv-holo-x">×</button></div><div class="mv-holo-cuerpo" style="--i:1">${cuerpo}</div></div>`;
    void det.offsetWidth; det.classList.add('on'); this.posHolo = null; this.seguirHolo();
    det.onclick = async ev => {
      if (ev.target.closest('.mv-holo-x')) return this.cerrarHolo();
      const sb = ev.target.closest('[data-serv]');
      if (sb?.dataset.serv === 'revisar') { sb.disabled = true; try { const r = await api('POST', '/servicios/revisar', {}); this.serv = r; this.repartirRacks(); this.abrirHolo(this.sel || h); } catch (er) { aviso(er.message, true); } return; }
      if (sb?.dataset.serv === 'editar') return this.editarServicios();
      const b = ev.target.closest('[data-parar]'); if (!b) return; b.disabled = true;
      try { await api('POST', `/sesiones/${b.dataset.parar}/cancelar`); aviso(tr('Detenido')); } catch (er) { aviso(er.message, true); b.disabled = false; }
    };
  },
  seguirHolo() {
    const det = this.caja && $('.mm-holo', this.caja); if (!det || det.hidden || !this.sel) return;
    const h = this.sel, d = h.o && MM_OBJ[h.o.tipo], px = h.p ? h.p.x : (h.o.x + d.w / 2) * MM_R, py = h.p ? h.p.y - 36 : h.o.y * MM_R + 8;
    const caja = det.parentElement, W = caja.clientWidth, H = caja.clientHeight, k = W / this.W, sx = px * k, sy = py * k, cw = det.offsetWidth, ch = det.offsetHeight;
    let x = sx + 34; if (x + cw > W - 8) x = sx - 34 - cw; x = Math.max(8, Math.min(W - cw - 8, x));
    const y = Math.max(8, Math.min(H - ch - 8, sy - ch * .35));
    const q = this.posHolo || (this.posHolo = { x, y }); q.x += (x - q.x) * .25; q.y += (y - q.y) * .25;
    det.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
    if (h.p && !this.ents.has(h.p.id)) this.cerrarHolo();
  },
  cerrarHolo() {
    const det = this.caja && $('.mm-holo', this.caja); this.sel = null; if (!det || det.hidden) return;
    det.classList.add('sale'); setTimeout(() => { if (det.classList.contains('sale')) { det.hidden = true; det.classList.remove('on', 'sale'); } }, 260);
  },
  async accion(a, b) {
    if (a === 'pausa') { this.pausa = !this.pausa; b.textContent = this.pausa ? '▶' : '❚❚'; return; }
    if (a === 'estop') {
      const vivos = [...this.mc.agentes.values()].filter(x => x.estado === 'trabajando' && !x.padre);
      if (!vivos.length) return aviso(tr('No hay agentes trabajando'));
      if (!b.classList.contains('arma')) { b.classList.add('arma'); b.textContent = tr('¿SEGURO?'); setTimeout(() => { b.classList.remove('arma'); b.textContent = 'E-STOP'; }, 3000); return; }
      b.classList.remove('arma'); b.textContent = 'E-STOP';
      await Promise.all(vivos.map(x => api('POST', `/sesiones/${x.id}/cancelar`).catch(() => null)));
      this.apuntar('ticker', tr('E-STOP: {n} agentes detenidos', { n: vivos.length }), 'aviso'); return;
    }
    if (a === 'panico') {
      try { if (this.est.panico) await api('POST', '/panico/reanudar', {}); else await api('POST', '/panico', { origen: 'mission-control' }); } catch (er) { return aviso(er.message, true); }
      return this.cargarDatos();
    }
    if (a === 'editar') return this.editor();
  },
  async editarServicios() {
    const actual = await api('GET', '/servicios').catch(() => ({ grupos: [] }));
    const r = await modal({ titulo: 'Tus servicios en línea', ancho: 720,
      cuerpo: `<p class="suave" style="margin-top:0">${tr('Cada grupo es un rack de la sala de servidores (hasta 8 servicios por rack). Un servicio puede ser una web (url), una unidad systemd o una app de pm2 en una máquina por SSH con clave (ssh + unidad / pm2), la máquina sola (ssh) o un puerto (tcp "host:puerto").')}</p>
        <textarea id="svJson" rows="18" style="width:100%;font-family:var(--mono, monospace);font-size:12px">${esc(JSON.stringify({ grupos: actual.grupos }, null, 1))}</textarea>`,
      botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: v => { try { return JSON.parse($('#svJson', v).value); } catch (e) { aviso(tr('JSON no válido: ') + e.message, true); return false; } } }] });
    if (!r) return;
    try { this.serv = await api('PUT', '/servicios', r); this.repartirRacks(); aviso(tr('Servicios guardados')); setTimeout(() => this.cargarLento(), 4000); } catch (er) { aviso(er.message, true); }
  },
  // ---------- crea tu mundo ----------
  async editor() {
    let nuevo = null;
    const r = await modal({ titulo: 'Tu mundo de Mission Control', ancho: 620,
      cuerpo: `<p class="suave" style="margin-top:0">${tr('Describe cómo quieres que sea y APOLO lo dibuja: una nave espacial, una oficina, un castillo, un laboratorio… Siempre tendrá la sala del agente principal (con su orbe), la bahía de subagentes, los servidores y el taller.')}</p>
        <textarea id="mmDesc" rows="4" style="width:100%" placeholder="${tr('Ej.: una estación espacial con el puente de mando en el centro, un hangar enorme para los subagentes, la sala de reactores y un laboratorio')}"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn pri" id="mmGen">${ic('chispa')}${tr('Generar con APOLO')}</button>
          <button class="btn" id="mmExp">${ic('abajo')}${tr('Exportar JSON')}</button><label class="btn">${ic('arriba')}${tr('Importar JSON')}<input type="file" id="mmImp" accept=".json,application/json" hidden></label></div>
        <div id="mmPre" style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px"></div>
        <div id="mmEst" class="suave"></div>
        ${this.propio ? `<p class="suave" style="margin-bottom:0">${tr('Ahora usas tu propio mundo.')}</p>` : ''}`,
      botones: [...(this.propio ? [{ txt: 'Volver al original', valor: 'reset' }] : []), { txt: 'Cancelar', valor: null }, { txt: 'Guardar', cls: 'pri', valor: () => nuevo ? 'guardar' : (aviso(tr('Genera o importa un mundo primero'), true), false) }],
      alAbrir: v => {
        const est = $('#mmEst', v);
        const probar = m => { nuevo = m; this.cargar(m); est.innerHTML = `${ic('check')} ${tr('Listo: «{n}». Lo ves detrás; pulsa Guardar para quedártelo.', { n: esc(m.nombre) })}`; };
        $('#mmGen', v).onclick = async e => {
          const d = $('#mmDesc', v).value.trim(); if (!d) return aviso(tr('Describe tu mundo primero'), true);
          e.target.disabled = true; est.textContent = tr('APOLO está diseñando tu mundo… (puede tardar un minuto)');
          try { probar((await api('POST', '/mundo/generar', { descripcion: d })).mundo); } catch (er) { est.textContent = er.message; } finally { e.target.disabled = false; }
        };
        api('GET', '/mundo/presets').then(l => { $('#mmPre', v).innerHTML = l.map(x => `<button class="btn mini" data-pre="${esc(x.id)}">${esc(x.nombre)}</button>`).join(''); }).catch(() => {});
        $('#mmPre', v).onclick = async e => { const b = e.target.closest('[data-pre]'); if (!b) return; try { probar((await api('GET', '/mundo/presets/' + encodeURIComponent(b.dataset.pre))).mundo); } catch (er) { est.textContent = er.message; } };
        $('#mmExp', v).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(nuevo || this.m, null, 1)], { type: 'application/json' })); a.download = 'mundo-apolo.json'; a.click(); };
        $('#mmImp', v).onchange = async e => { try { const m = JSON.parse(await e.target.files[0].text()); if (!m.salas) throw new Error(tr('no es un mundo de APOLO')); probar(m); } catch (er) { est.textContent = er.message; } };
      } });
    if (r === 'guardar' && nuevo) { const x = await api('PUT', '/mundo', { mundo: nuevo }); this.propio = true; this.cargar(x.mundo); aviso(tr('Mundo guardado')); }
    else if (r === 'reset') { const x = await api('DELETE', '/mundo'); this.propio = false; this.cargar(x.mundo); }
    else if (nuevo) { const x = await api('GET', '/mundo'); this.cargar(x.mundo); }   // cancelado: vuelve el que había
  },
};
