// Mission Control → Trading: el centro de operaciones del enjambre de DMN Trader, hecho con el motor del Mundo
// (mision-mundo-arte.js: suelos y paredes con textura, muebles con volumen, luz dinámica, personajes con contorno).
// Cada trader va andando (por los pasillos, sin atravesar paredes) a la sala que le toca: opera sentado en la sala de traders,
// busca frente a la pizarra o en el atrio, estudia sus pérdidas en el laboratorio, descansa en la cafetería… El escuadrón
// LLM se reúne con el jefe de mesa y los 4 mejores tienen despacho. Datos: GET /v1/trading/mapa (proxy a la central).

const TR_R = MM_R, TR_E = 1.15;                          // casilla de 32 px; personajes a 1,15× (32×62)
const TR_ROPA = { ema_cruce: '#3b6fb6', rsi_rev: '#8a4fb5', ruptura: '#c08a2e', bollinger: '#2f8f8f', impulso: '#b5452f', rejilla: '#4f8a3a', llm: '#d6d9e0' };
const TR_PANT = { '1m': '#30344a', '5m': '#3a4520', '15m': '#4a2a2a' };
const TR_SOMB = ['', '', 'gorra', 'casco', 'capucha'];
const trHash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
Object.assign(P, {
  edificio: '<path d="M4 21V5l8-3v19M12 8h8v13M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>',
  trofeo: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 14v4M8 21h8M9 18h6"/>',
  estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
});

// ---------- el edificio (formato mundo/1, el mismo de los mundos de Mission Control) ----------
const TR_INFO = {
  pizarra: ['Pizarra de cotizaciones', 'Precios reales en vivo (Coinbase y Yahoo). Aquí estudian el mercado los que buscan entrada.', 'Piso 1 · ala oeste'],
  atrio: ['Atrio', 'Zona de espera junto a los ventanales: traders buscando la próxima oportunidad.', 'Piso 1 · entrada norte'],
  lab: ['Laboratorio de análisis', 'Autopsias: quien acaba de perder o quebrar estudia por qué y cambia su sistema.', 'Piso 1 · ala este'],
  traders: ['Sala de traders', 'Puestos de operación: quien tiene una posición abierta se sienta aquí. Pantalla verde = largo, roja = corto.', 'Piso 1 · centro'],
  reuniones: ['Sala de reuniones', 'El escuadrón LLM (gemma decide cada operación) con el jefe de mesa, que cada 2 h propone cambios validados en el simulador.', 'Piso 1 · ala este'],
  cafe: ['Cafetería', 'En pausa por una protección (pérdidas seguidas, racha mala), parados o sin conexión.', 'Piso 1 · ala este'],
  privadas: ['Oficinas privadas', 'Los 4 mejores traders del enjambre por R medio tienen despacho propio.', 'Piso 1 · ala sur'],
  servidores: ['Servidores', 'Un rack por equipo (la Pi central, el PC…) con su capital, operaciones y quiebras reales.', 'Piso 1 · sala técnica'],
  banos: ['Baños', 'Hasta los traders necesitan un descanso.', 'Piso 1 · ala sur'],
};
const TR_PUESTOS = [];                                   // mesas de 4 pantallas de la sala de traders
for (let f = 0; f < 5; f++) for (let k = 0; k < 7; k++) TR_PUESTOS.push({ tipo: 'tr_puesto', x: 2 + k * 5, y: 10 + f * 3 });
const TR_MAPA = {
  formato: 'mundo/1', nombre: 'Centro de operaciones', tema: 'nave', estilo: { borde: '#2fd1b0', acento: '#2fd1b0', amb: [118, 130, 168], sala: .26 }, ancho: 56, alto: 35,
  salas: [
    { id: 'pizarra', titulo: 'Pizarra', rol: 'pizarra', x: 1, y: 1, w: 14, h: 7, suelo: 'metal' },
    { id: 'atrio', titulo: 'Atrio', rol: 'atrio', x: 16, y: 1, w: 23, h: 7, suelo: 'piedra' },
    { id: 'lab', titulo: 'Laboratorio de análisis', rol: 'lab', x: 40, y: 1, w: 15, h: 7, suelo: 'metal' },
    { id: 'traders', titulo: 'Sala de traders', rol: 'principal', x: 1, y: 9, w: 38, h: 16, suelo: 'madera' },
    { id: 'reuniones', titulo: 'Sala de reuniones', rol: 'reuniones', x: 40, y: 9, w: 15, h: 7, suelo: 'alfombra' },
    { id: 'cafe', titulo: 'Cafetería', rol: 'cafe', x: 40, y: 17, w: 15, h: 8, suelo: 'madera' },
    { id: 'privadas', titulo: 'Oficinas privadas', rol: 'privadas', x: 1, y: 26, w: 18, h: 7, suelo: 'madera' },
    { id: 'servidores', titulo: 'Servidores', rol: 'servidores', x: 20, y: 26, w: 19, h: 7, suelo: 'rejilla' },
    { id: 'banos', titulo: 'Baños', rol: 'banos', x: 40, y: 26, w: 15, h: 7, suelo: 'metal' },
  ],
  pasillos: [{ x: 6, y: 8, w: 2, h: 1 }, { x: 26, y: 8, w: 2, h: 1 }, { x: 15, y: 3, w: 1, h: 2 }, { x: 39, y: 3, w: 1, h: 2 }, { x: 52, y: 8, w: 2, h: 1 },
    { x: 39, y: 11, w: 1, h: 2 }, { x: 39, y: 20, w: 1, h: 2 }, { x: 46, y: 16, w: 2, h: 1 }, { x: 9, y: 25, w: 2, h: 1 }, { x: 28, y: 25, w: 2, h: 1 },
    { x: 46, y: 25, w: 2, h: 1 }, { x: 28, y: 33, w: 3, h: 2 }],
  objetos: [
    // pizarra
    { tipo: 'tr_tv', x: 3, y: 2 }, { tipo: 'sofa', x: 4, y: 5 }, { tipo: 'sofa', x: 9, y: 5 }, { tipo: 'tr_mesita', x: 7, y: 5 }, { tipo: 'planta', x: 1, y: 6 }, { tipo: 'planta', x: 14, y: 6 },
    { tipo: 'lampara', x: 2, y: 0 }, { tipo: 'lampara', x: 12, y: 0 },
    // atrio
    ...[17, 21, 25, 29, 33].map(x => ({ tipo: 'tr_ventana', x, y: 0 })),
    { tipo: 'sofa', x: 19, y: 3 }, { tipo: 'sofa', x: 23, y: 3 }, { tipo: 'sofa', x: 31, y: 3 }, { tipo: 'sofa', x: 35, y: 3 }, { tipo: 'tr_mesita', x: 21, y: 4 }, { tipo: 'tr_mesita', x: 33, y: 4 },
    { tipo: 'holo', x: 27, y: 4 }, { tipo: 'planta', x: 16, y: 1 }, { tipo: 'planta', x: 38, y: 1 }, { tipo: 'planta', x: 16, y: 7 }, { tipo: 'planta', x: 38, y: 7 }, { tipo: 'planta', x: 25, y: 6 }, { tipo: 'planta', x: 30, y: 6 },
    // laboratorio
    { tipo: 'consola', x: 41, y: 1 }, { tipo: 'consola', x: 44, y: 1 }, { tipo: 'consola', x: 47, y: 1 }, { tipo: 'pc', x: 50, y: 1 }, { tipo: 'rack', x: 53, y: 1 },
    { tipo: 'tr_puesto', x: 41, y: 4 }, { tipo: 'tr_puesto', x: 47, y: 4 }, { tipo: 'planta', x: 40, y: 7 }, { tipo: 'planta', x: 54, y: 7 },
    // sala de traders
    ...TR_PUESTOS, { tipo: 'planta', x: 1, y: 9 }, { tipo: 'planta', x: 38, y: 9 }, { tipo: 'planta', x: 1, y: 24 }, { tipo: 'planta', x: 38, y: 24 }, { tipo: 'planta', x: 37, y: 16 },
    ...[3, 10, 17, 30, 35].map(x => ({ tipo: 'lampara', x, y: 8 })), { tipo: 'cuadro', x: 20, y: 8 },
    // reuniones
    { tipo: 'tr_pantalla', x: 45, y: 8 }, { tipo: 'tr_mesa_reu', x: 44, y: 11 }, { tipo: 'planta', x: 40, y: 15 }, { tipo: 'planta', x: 54, y: 15 }, { tipo: 'planta', x: 54, y: 9 },
    // cafetería
    { tipo: 'tr_barra', x: 43, y: 17 }, { tipo: 'tr_nevera', x: 51, y: 17 }, { tipo: 'tr_maquina', x: 53, y: 17 },
    ...[[43, 20], [47, 20], [51, 20], [45, 23], [49, 23]].map(([x, y]) => ({ tipo: 'tr_mesa_cafe', x, y })), { tipo: 'planta', x: 40, y: 24 }, { tipo: 'planta', x: 54, y: 24 }, { tipo: 'lampara', x: 48, y: 16 },
    // oficinas privadas
    ...[1, 5, 9, 13].map(x => ({ tipo: 'mesa', x: x + 1, y: 28 })), ...[4, 8, 12, 16].map(x => ({ tipo: 'tr_mampara', x, y: 27 })),
    ...[1, 5, 9, 13].map(x => ({ tipo: 'planta', x: x + 2, y: 26 })), { tipo: 'estanteria', x: 17, y: 26 },
    // servidores
    ...[21, 24, 27, 33, 36].map(x => ({ tipo: 'rack', x, y: 26 })), ...[21, 24, 27, 33, 36].map(x => ({ tipo: 'rack', x, y: 29 })), { tipo: 'consola', x: 30, y: 29 },
    // baños
    ...[40, 43, 46, 49].map(x => ({ tipo: 'tr_cabina', x: x + 1, y: 26 })), ...[27, 29, 31].map(y => ({ tipo: 'tr_lavabo', x: 54, y })), { tipo: 'planta', x: 40, y: 32 },
    // entrada
    { tipo: 'planta', x: 26, y: 32 }, { tipo: 'planta', x: 32, y: 32 },
  ],
};
// sitios donde alguien se sienta: [sala, x, y (casilla), mirando]
const TR_SITIOS = [];
for (const o of TR_PUESTOS) for (let k = 0; k < 4; k++) TR_SITIOS.push({ sala: 'traders', tx: o.x + k, ty: o.y + 1, dir: 'arriba', obj: o, k });
for (const o of TR_MAPA.objetos.filter(o => o.tipo === 'tr_puesto' && o.y === 4)) for (let k = 0; k < 4; k++) TR_SITIOS.push({ sala: 'lab', tx: o.x + k, ty: 5, dir: 'arriba', obj: o, k });
for (let k = 0; k < 7; k++) { TR_SITIOS.push({ sala: 'reuniones', tx: 44 + k, ty: 10, dir: 'abajo' }); TR_SITIOS.push({ sala: 'reuniones', tx: 44 + k, ty: 13, dir: 'arriba' }); }
for (const [x, y] of [[43, 20], [47, 20], [51, 20], [45, 23], [49, 23]]) { TR_SITIOS.push({ sala: 'cafe', tx: x - 1, ty: y, dir: 'lado', izq: false }); TR_SITIOS.push({ sala: 'cafe', tx: x + 1, ty: y, dir: 'lado', izq: true }); }
for (const x of [1, 5, 9, 13]) TR_SITIOS.push({ sala: 'privadas', tx: x + 2, ty: 29, dir: 'arriba' });

// ---------- muebles propios de la oficina (se registran en el catálogo del Mundo) ----------
(() => {
  const p0 = c => mmP(c);
  mmObj('tr_puesto', 4, 1, 1, 18, c => {                       // mesa larga con 4 pantallas (la imagen de cada pantalla va en vivo)
    const p = p0(c), A = 18; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(4, 30 + A, 120, 4);
    for (const x of [6, 60, 64, 118]) p(x, 18 + A, 4, 12, '#2b2f38');
    mmBisel(c, 2, 6 + A, 124, 14, '#3a4252'); p(2, 18 + A, 124, 3, '#232833'); p(4, 8 + A, 120, 1, '#4c5668');
    for (let k = 0; k < 4; k++) { const x = 5 + k * 31; mmBisel(c, x, 0, 26, 18, '#10141b'); p(x + 11, 18, 4, 5, '#1e232c'); p(x + 8, A + 9, 10, 3, '#cfd5de'); p(x + 9, A + 10, 8, 1, '#8f97a3'); }
  }, (c, X, Y, t, e, o) => {
    const p = mmP(c);
    for (let k = 0; k < 4; k++) {
      const x = X + 7 + k * 31, y = Y + 2, q = o.ocup?.[k], col = !q ? null : q === 'lab' ? '#ff9b5a' : q === 'corto' ? '#ff5470' : '#3dff8a';
      p(x, y, 22, 13, col ? '#06100c' : '#0b1220');
      if (!col) { p(x + 2, y + 2, 6, 1, '#1d2a3c'); continue; }
      c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i <= 20; i += 2) { const yy = y + 7 + Math.sin(i * .5 + t / 400 + k + o.x) * 2.5 + (q === 'corto' ? i / 7 : -i / 7); i ? c.lineTo(x + 1 + i, yy) : c.moveTo(x + 1 + i, yy); }
      c.stroke(); p(x + 1, y + 1, 4, 1, col);
    }
  }, (o, X, Y) => (o.ocup || []).map((q, k) => q && { x: X + 18 + k * 31, y: Y + 10, r: 46, col: q === 'corto' ? [255, 80, 110] : q === 'lab' ? [255, 160, 90] : [60, 255, 140], a: .38 }).filter(Boolean));
  mmObj('tr_tv', 9, 2, 1, 14, c => {                           // pizarra de cotizaciones sobre pies
    const p = p0(c), A = 14; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(20, 62 + A, 250, 4);
    p(60, 52 + A, 6, 12, '#2b2f38'); p(222, 52 + A, 6, 12, '#2b2f38'); mmBisel(c, 4, 0, 280, 56 + A, '#141922'); p(8, 4, 272, 48 + A, '#e9eef5');
  }, (c, X, Y, t, e) => {
    const pr = e.precios || [], p = mmP(c); if (!pr.length) return;
    const cols = Math.ceil(pr.length / 3), cw = 268 / cols;
    c.textBaseline = 'alphabetic';
    pr.forEach((q, i) => {
      const xx = X + 12 + (i % cols) * cw, yy = Y + 8 + Math.floor(i / cols) * 20, up = (q.cambio_pct || 0) >= 0;
      c.font = '700 9px monospace'; c.textAlign = 'left'; c.fillStyle = q.abierto ? '#1d2636' : '#8a94a3'; c.fillText(q.simbolo.replace('-USD', ''), xx, yy + 8);
      c.fillStyle = q.abierto ? (up ? '#13893f' : '#c62c3a') : '#8a94a3'; c.font = '8px monospace'; c.fillText(`${up ? '▲' : '▼'}${Math.abs(q.cambio_pct || 0).toFixed(1)}%`, xx, yy + 17);
    });
    p(X + 8, Y + 4, 272, 2, 'rgba(255,255,255,.5)');
  }, (o, X, Y) => [{ x: X + 144, y: Y + 34, r: 170, col: [220, 235, 255], a: .5 }]);
  mmObj('tr_ventana', 3, 1, 0, 0, c => {
    const p = p0(c); mmBisel(c, 2, 4, 92, 24, '#2a3240'); const g = c.createLinearGradient(0, 6, 0, 26); g.addColorStop(0, '#5aa8e0'); g.addColorStop(1, '#1d4f7a');
    c.fillStyle = g; c.fillRect(5, 7, 86, 18); p(47, 7, 2, 18, '#2a3240'); p(5, 15, 86, 1, 'rgba(255,255,255,.18)'); p(10, 9, 14, 2, 'rgba(255,255,255,.45)');
  }, null, (o, X, Y) => [{ x: X + 48, y: Y + 40, r: 120, col: [150, 200, 255], a: .45 }]);
  mmObj('tr_pantalla', 4, 1, 0, 0, c => { mmBisel(c, 4, 2, 120, 28, '#10141b'); mmP(c)(7, 5, 114, 22, '#0a1a2c'); },
    (c, X, Y, t) => { c.strokeStyle = '#4fa3ff'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i <= 108; i += 4) { const yy = Y + 20 - Math.sin(i / 14 + t / 1500) * 6 - i / 18; i ? c.lineTo(X + 10 + i, yy) : c.moveTo(X + 10 + i, yy); } c.stroke(); },
    (o, X, Y) => [{ x: X + 64, y: Y + 22, r: 110, col: [80, 160, 255], a: .4 }]);
  mmObj('tr_mesa_reu', 7, 2, 1, 10, c => {
    const p = p0(c), A = 10; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(6, 58 + A, 212, 5);
    mmBisel(c, 2, 4 + A, 220, 52, '#6b4423'); p(6, 8 + A, 212, 44, '#7a5030'); p(6, 8 + A, 212, 2, '#9a6a40');
    for (let k = 0; k < 7; k++) { mmBisel(c, 14 + k * 30, 10 + A, 14, 9, '#c9ced8'); mmBisel(c, 14 + k * 30, 40 + A, 14, 9, '#e8e2d2'); }
  }, null, null);
  mmObj('tr_mesita', 1, 1, 1, 4, c => { const p = p0(c); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(4, 28, 24, 3); mmBisel(c, 4, 8, 24, 20, '#4a3424'); p(12, 12, 6, 5, '#e8e2d2'); p(13, 13, 4, 2, '#6b4423'); }, null, null);
  mmObj('tr_mesa_cafe', 1, 1, 1, 6, c => {
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(16, 30, 12, 3, 0, 0, 7); c.fill(); mmP(c)(14, 18, 4, 12, '#3a2a1c');
    c.fillStyle = '#3a2a1c'; c.beginPath(); c.ellipse(16, 14, 14, 9, 0, 0, 7); c.fill(); c.fillStyle = '#c49a64'; c.beginPath(); c.ellipse(16, 13, 12, 7, 0, 0, 7); c.fill(); mmP(c)(12, 9, 5, 4, '#f4efe2');
  }, null, null);
  mmObj('tr_barra', 5, 1, 1, 16, c => {
    const p = p0(c), A = 16; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2, 30 + A, 156, 3); mmBisel(c, 2, 8 + A, 156, 22, '#4a3424'); p(2, 8 + A, 156, 4, '#8a95a8');
    for (let k = 0; k < 3; k++) { mmBisel(c, 14 + k * 40, 0, 20, 22, '#c0c4cc'); p(18 + k * 40, 4, 12, 6, '#2a2f38'); p(20 + k * 40, 14, 8, 4, '#3a2a1c'); }
    for (let k = 0; k < 6; k++) p(124 + k * 5, 4 + A, 3, 4, '#f4efe2');
  }, (c, X, Y, t) => { for (let k = 0; k < 3; k++) if (Math.floor(t / 700 + k) % 3 === 0) { c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(X + 22 + k * 40, Y - 6 - (t / 80 % 6), 2, 4); } }, null);
  mmObj('tr_nevera', 1, 2, 1, 14, c => { const p = p0(c); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2, 74, 28, 4); mmBisel(c, 2, 0, 28, 76, '#dfe3ea'); p(4, 30, 24, 1, '#9aa3b2'); p(24, 10, 2, 14, '#7c8594'); p(24, 36, 2, 14, '#7c8594'); }, null, null);
  mmObj('tr_maquina', 1, 2, 1, 14, c => { const p = p0(c); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2, 74, 28, 4); mmBisel(c, 2, 0, 28, 76, '#1b2230'); p(5, 4, 16, 50, '#0b1724'); for (let y = 0; y < 5; y++) for (let x = 0; x < 2; x++) p(7 + x * 7, 7 + y * 9, 5, 6, ['#ff5470', '#ffcf4d', '#3dff8a', '#4fa3ff'][(x + y) % 4]); p(23, 10, 4, 20, '#2a3342'); },
    null, (o, X, Y) => [{ x: X + 13, y: Y + 30, r: 50, col: [80, 200, 255], a: .35 }]);
  mmObj('tr_cabina', 2, 2, 1, 12, c => {
    const p = p0(c); mmBisel(c, 2, 0, 4, 66, '#7c8594'); mmBisel(c, 58, 0, 4, 66, '#7c8594'); mmBisel(c, 2, 0, 60, 4, '#8f98a8');
    mmBisel(c, 22, 10, 20, 10, '#e8ecf2'); c.fillStyle = '#f4f6fa'; c.beginPath(); c.ellipse(32, 30, 9, 11, 0, 0, 7); c.fill(); c.fillStyle = '#c9ced8'; c.beginPath(); c.ellipse(32, 31, 5, 7, 0, 0, 7); c.fill();
    mmBisel(c, 8, 60, 48, 6, '#9a6a3a');
  }, null, null);
  mmObj('tr_lavabo', 1, 1, 1, 8, c => { const p = p0(c); mmBisel(c, 4, 6, 24, 22, '#e8ecf2'); p(8, 12, 16, 10, '#b9c2d0'); p(14, 6, 4, 6, '#9aa3b2'); }, null, null);
  mmObj('tr_mampara', 1, 4, 1, 12, c => { const p = p0(c); c.fillStyle = 'rgba(150,200,240,.22)'; c.fillRect(12, 0, 8, 140); p(12, 0, 2, 140, '#8fb3d6'); p(18, 0, 2, 140, '#5d7a99'); p(12, 0, 8, 3, '#b8d4ee'); }, null, null);
})();

// ---------- personajes ----------
function trLook(a) {
  const base = String(a.nombre || '').split('-')[a.estrategia === 'llm' ? 1 : 0], h = trHash(base);
  const L = { piel: MM_PIEL[h % 4], pelo: MM_PELO[(h >> 3) % 6], estilo: MM_ESTILO[(h >> 5) % 4], ropa: TR_ROPA[a.estrategia] || '#6b6b75', pantalon: TR_PANT[a.marco] || '#30344a' };
  const s = TR_SOMB[Math.min(a.generacion || 0, TR_SOMB.length - 1)];
  if (a.estrategia === 'llm') { L.ropa2 = '#2fd1b0'; L.gafas = '#2fd1b0'; L.emblema = 'chispa'; L.emCol = '#2fd1b0'; }
  else if (s) { L.sombrero = s; L.color = mmTono(L.ropa, -.25); }
  if (a.tendencia) L.gafas = '#9fd0ff';
  L.k = trHash(JSON.stringify(L));
  return L;
}
const TR_SPR = new Map();
let trPresupuesto = Infinity;                            // sprites nuevos por fotograma: al abrir no congela la página
function trSprite(L, dir, f, acc) {
  const k = `${L.k}|${dir}|${f}|${acc}`;
  let cv = TR_SPR.get(k);
  if (!cv) {
    if (trPresupuesto-- <= 0) return TR_SPR.get(`${L.k}|abajo|0|quieto`) || null;
    if (TR_SPR.size > 4500) TR_SPR.clear();
    cv = mmLienzo(Math.round(28 * TR_E), Math.round(54 * TR_E)); const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(mmPJ(L, dir, f, acc, false), 0, 0, cv.width, cv.height);
    TR_SPR.set(k, cv);
  }
  return cv;
}

VISTAS.trading = {
  async pintar(v) {
    this.v = v; this.datos = null; this.burbujas = new Map(); this.antes = new Map(); this.sel = null; this.salaSel = null; this.cajas = []; this.pj = new Map(); this.labHasta = new Map();
    this.mundo(); this.est = { borde: '#2fd1b0', luz: 'neon', bahia: 1, precios: [] };
    v.innerHTML = `<div class="pagina mision ancha tr-mc">
      <div class="tr-cab">
        <div class="tr-logo">${ic('edificio')}<div><b>MISSION CONTROL</b><span>${tr('CENTRO DE OPERACIONES')}</span></div></div>
        <p>${tr('Cada trader va por libre a la sala que toca — opera sentado en la sala de traders, busca frente a la pizarra o en el atrio, estudia sus pérdidas en el laboratorio.')}</p>
        <div class="tr-ley"><span><i style="background:#2fd1b0"></i>${tr('Punto turquesa')} = Pi</span><span><i style="background:#c77dff"></i>${tr('Morado')} = PC</span></div>
      </div>
      ${typeof CJ_pestanas === 'function' ? CJ_pestanas('trading') : ''}
      <div class="tr-kpis" id="trKpis"></div>
      <div class="tr-sala"><canvas id="trCanvas" width="${this.W}" height="${this.H}"></canvas><div id="trTip" class="tr-tip" hidden></div></div>
      <div class="tr-abajo">
        <div class="tr-card" id="trFicha"></div>
        <div class="tr-card"><div class="tr-tit">${tr('CONTROL')}</div>
          <div class="tr-ctl"><label>${tr('Agentes')} <input id="trN" type="number" min="1" max="2000" value="50"></label>
          <label>${tr('Mercados')} <select id="trMerc"><option value="cripto,acciones">Cripto + Acc</option><option value="cripto">Cripto</option><option value="acciones">Acciones</option></select></label>
          <label>${tr('Hasta')} <input id="trHasta" placeholder="07:00"></label></div>
          <div class="tr-bot"><button class="btn" id="trIniciar">${ic('rayo')}${tr('Empezar / cambiar')}</button><button class="btn" id="trParar">■ ${tr('Parar')}</button></div>
          <p class="tr-central" id="trCentral"></p></div>
        <div class="tr-card"><div class="tr-tit">${ic('trofeo')}${tr('MEJORES AGENTES')}</div><div id="trTop"></div></div>
        <div class="tr-card"><div class="tr-tit">${tr('LECCIONES')}</div><div id="trLec" class="tr-lec"></div></div>
      </div></div>`;
    this.cv = $('#trCanvas', v); this.c = this.cv.getContext('2d'); this.c.imageSmoothingEnabled = false;
    this.cv.onmousemove = e => this.raton(e); this.cv.onmouseleave = () => { $('#trTip', v).hidden = true; };
    this.cv.onclick = e => {
      const a = this.agenteEn(e);
      if (a) { this.sel = a; this.salaSel = null; this.ficha(a); return; }
      this.sel = null; this.salaSel = this.salaEn(e); this.fichaSala(this.salaSel);
    };
    $('#trIniciar', v).onclick = async () => {
      try { await api('POST', '/trading/iniciar', { agentes: +$('#trN', v).value, mercados: $('#trMerc', v).value.split(','), hasta: $('#trHasta', v).value || null, capital: 1, meta: 100 }); aviso(tr('Enjambre en marcha')); this.cargar(); }
      catch (er) { aviso(er.message, true); } };
    $('#trParar', v).onclick = async () => { try { await api('POST', '/trading/parar', {}); aviso(tr('Enjambre parado')); this.cargar(); } catch (er) { aviso(er.message, true); } };
    this.fichaSala(null);
    await this.cargar();
    clearInterval(this.t); this.t = setInterval(() => !document.hidden && this.cargar(), 5000);
    let ult = 0; const bucle = ts => { if (!this.v) return; if (ts - ult > 66) { ult = ts; this.dibujar(ts); } this.raf = requestAnimationFrame(bucle); };
    this.raf = requestAnimationFrame(bucle);
  },
  salir() { clearInterval(this.t); cancelAnimationFrame(this.raf); this.v = null; },

  // ---------- el mundo: estructura, fondo, luz y rejilla para andar ----------
  mundo() {
    if (this.w) return;
    const w = mmEstructura(TR_MAPA), R = TR_R, A = TR_MAPA.ancho;
    this.w = w; this.W = w.W; this.H = w.H;
    this.fondo = mmFondo(w);
    document.fonts?.load('700 16px Silkscreen').then(() => { this.fondo = mmFondo(w); }).catch(() => {});
    this.luz = mmLienzo(this.W >> 1, this.H >> 1); this.lc = this.luz.getContext('2d');
    this.vin = mmLienzo(this.W, this.H); const vc = this.vin.getContext('2d'), gv = vc.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * .4, this.W / 2, this.H / 2, Math.hypot(this.W, this.H) * .6);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,.32)'); vc.fillStyle = gv; vc.fillRect(0, 0, this.W, this.H);
    this.pasa = i => w.g[i] === 1 && !w.bloq[i];
    this.sitios = TR_SITIOS.map(s => ({ ...s, x: s.tx * R + R / 2, y: s.ty * R + R - 4, ocupa: null }));
    const asiento = new Set(TR_SITIOS.map(s => s.ty * A + s.tx));
    this.libres = {};                                      // casillas libres de cada sala para pasear
    for (const s of TR_MAPA.salas) { const l = []; for (let y = s.y + 1; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) { const i = y * A + x; if (this.pasa(i) && !asiento.has(i)) l.push(i); } this.libres[s.id] = l; }
    this.libres.pasillo = this.libres.traders.filter(i => { const y = Math.floor(i / A); return (y - 9) % 3 === 0; });   // pasillos entre filas de mesas
    this.entrada = { x: 29 * R + 16, y: 34 * R + 20 };
  },
  // camino por la rejilla (BFS) entre dos puntos en píxeles → lista de puntos
  camino(x0, y0, x1, y1) {
    const R = TR_R, A = TR_MAPA.ancho, H = TR_MAPA.alto, w = this.w;
    const a = Math.min(H - 1, Math.max(0, Math.floor(y0 / R))) * A + Math.min(A - 1, Math.max(0, Math.floor(x0 / R))), b = Math.floor(y1 / R) * A + Math.floor(x1 / R);
    if (a === b) return [[x1, y1]];
    const prev = new Int32Array(A * H).fill(-1), cola = [a]; prev[a] = a;
    const ok = i => i === b || (w.g[i] === 1 && !w.bloq[i]);
    for (let q = 0; q < cola.length; q++) {
      const i = cola[q]; if (i === b) break;
      const x = i % A;
      for (const j of [i - A, i + A, x > 0 ? i - 1 : -1, x < A - 1 ? i + 1 : -1]) if (j >= 0 && j < A * H && prev[j] < 0 && ok(j)) { prev[j] = i; cola.push(j); }
    }
    if (prev[b] < 0) return [[x1, y1]];
    const ruta = []; for (let i = b; i !== a; i = prev[i]) ruta.push([(i % A) * R + R / 2, Math.floor(i / A) * R + R - 6]);
    ruta.reverse(); ruta[ruta.length - 1] = [x1, y1];
    return ruta;
  },

  async cargar() {
    let d;
    try { d = await api('GET', '/trading/mapa'); }
    catch (er) { $('#trKpis', this.v).innerHTML = `<div class="tr-kpi"><small>${ic('info')}DMN Trader</small><b>—</b><span>${esc(er.message)}</span></div>`; return; }
    if (!this.v) return;
    const ahora = performance.now() / 1000;
    for (const n of d.nodos) for (const a of n.agentes || []) {                   // burbuja cuando cambia lo último que hizo
      const k = n.nodo + ':' + a.id, prev = this.antes.get(k);
      if (prev !== undefined && prev !== a.ultimo && a.ultimo) {
        const em = (a.ultimo.match(/(✅|❌|🟢|🔴|⏸)/) || [])[1] || (a.estado === 'quebrado' ? '💀' : /meta/.test(a.ultimo) ? '🏆' : a.estrategia === 'llm' ? '💬' : null);
        if (em) this.burbujas.set(k, { em, hasta: ahora + 4 });
        if (em === '❌' || em === '💀') this.labHasta.set(k, ahora + 90);   // tras perder, al laboratorio un rato
      }
      this.antes.set(k, a.ultimo);
    }
    this.datos = d; this.est.precios = d.precios || [];
    const todos = d.nodos.flatMap(n => (n.agentes || []).map(a => ({ ...a, nodo: n.nodo })));
    this.top = todos.filter(a => a.r_medio != null && a.trades >= 3).sort((a, b) => b.r_medio - a.r_medio).slice(0, 6);
    this.privados = new Set(todos.filter(a => a.estrategia !== 'llm' && a.r_medio != null && a.trades >= 3).sort((a, b) => b.r_medio - a.r_medio).slice(0, 4).map(a => a.nodo + ':' + a.id));
    this.actualizarPJ(d, ahora);
    const loc = d.nodos.find(n => n.local) || d.nodos[0] || { kpis: {} }, k = loc.kpis || {};
    $('#trKpis', this.v).innerHTML = [
      ['persona', 'AGENTES', d.total.agentes, d.nodos.map(n => `${n.nodo === 'pi' ? 'Pi' : n.nodo === 'pc' ? 'Pc' : n.nodo} ${(n.agentes || []).length}`).join(' · ')],
      ['rayo', 'OPERACIONES', d.total.trades, k.trades ? `${Math.round((k.ganados || 0) / k.trades * 100)} % ${tr('ganadas')} (${loc.nodo})` : '—'],
      ['grafica', 'R. MEDIO', k.r_medio != null ? (k.r_medio > 0 ? '+' : '') + k.r_medio.toFixed(2) : '—', `${tr('generación')} ${k.generacion || 0}`],
      ['estrella', 'METAS', d.total.metas, `${tr('mejor capital')} ${(k.max_equity || 0).toFixed(3)} $ / ${k.meta || 100} $`],
      ['escudo', 'QUIEBRAS', d.total.quiebras, k.activo ? `${tr('ciclo')} ${k.tick_s}s` : tr('parado')],
    ].map(([i, t, n, s]) => `<div class="tr-kpi"><small>${ic(i)}${tr(t)}</small><b>${n}</b><span>${esc(s)}</span></div>`).join('');
    $('#trTop', this.v).innerHTML = this.top.length ? this.top.map(a => `<div class="tr-top" data-ag="${esc(a.nodo)}:${a.id}"><i style="background:${TR_ROPA[a.estrategia] || '#888'};box-shadow:0 0 0 2px ${a.nodo === 'pi' ? '#2fd1b0' : '#c77dff'}"></i>
      <div><b>${esc(a.nombre)}</b><span>${a.estrategia} · ${a.marco} · ${a.nodo}</span></div><em class="${a.r_medio > 0 ? 'ok' : 'mal'}">${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R</em><small>${a.trades}</small></div>`).join('')
      : `<p class="sutil">${tr('Aún sin operaciones suficientes.')}</p>`;
    $('#trTop', this.v).onclick = e => { const r = e.target.closest('[data-ag]'); if (!r) return; const [nd, id] = r.dataset.ag.split(':'); const a = todos.find(x => x.nodo === nd && x.id === +id); if (a) { this.sel = a; this.salaSel = null; this.ficha(a); } };
    $('#trLec', this.v).innerHTML = (d.lecciones || []).slice(0, 14).map(l => `<div class="tr-l"><span class="sutil">${new Date(l.ts * 1000).toLocaleTimeString()} · ${esc(l.tipo)}</span><br>${esc(l.texto)}</div>`).join('') || `<p class="sutil">${tr('Aún sin lecciones.')}</p>`;
    $('#trCentral', this.v).innerHTML = `<b>${tr('Central')}:</b> ${esc(d._central || '—')} · ${d.nodos.map(n => `${n.nodo} <span style="color:${n.local || n.en_linea ? '#5dff9b' : '#ff6b6b'}">●</span>`).join(' ')}`;
    if (k.n) $('#trN', this.v).value = k.n;
    if (this.sel) { const a = todos.find(x => x.nodo === this.sel.nodo && x.id === this.sel.id); if (a) this.ficha(a, true); }
    else this.fichaSala(this.salaSel);
  },

  // ---------- a qué sala va cada uno ----------
  zonaDe(a, n, ahora) {
    const on = n.local || n.en_linea, k = n.nodo + ':' + a.id, h = trHash(k);
    if (!on || ['parado', 'retirado', 'en pausa'].includes(a.estado) || (n.kpis && n.kpis.activo === false)) return 'cafe';
    if (a.estrategia === 'llm') return 'reuniones';
    if (a.estado === 'quebrado' || (this.labHasta.get(k) || 0) > ahora) return 'lab';
    if (this.privados && this.privados.has(k)) return 'privadas';
    if (a.estado === 'en posición') return 'traders';
    if ((h + Math.floor(ahora / 90)) % 60 === 0) return 'banos';
    return h % 6 === 0 ? 'pasillo' : h % 2 ? 'atrio' : 'pizarra';
  },
  casilla(z, semilla) {
    const l = this.libres[z] || this.libres.atrio, i = l[semilla % l.length], A = TR_MAPA.ancho;
    return [(i % A) * TR_R + 6 + (semilla >> 4) % 20, Math.floor(i / A) * TR_R + 20 + (semilla >> 8) % 8];
  },
  actualizarPJ(d, ahora) {
    const vivos = new Set();
    for (const st of this.sitios) if (st.ocupa && !this.pj.get(st.ocupa)) st.ocupa = null;
    for (const n of d.nodos) for (const a of n.agentes || []) {
      const k = n.nodo + ':' + a.id; vivos.add(k);
      let p = this.pj.get(k);
      if (!p) {
        const z0 = this.zonaDe(a, n, ahora), [x, y] = this._yaCargo ? [this.entrada.x, this.entrada.y] : this.casilla(z0 === 'traders' ? 'pasillo' : z0, trHash(k));
        p = { x, y, ruta: [], zona: null }; this.pj.set(k, p);
      }
      p.a = a; p.n = n; p.k = k;
      const z = this.zonaDe(a, n, ahora), pasea = ['atrio', 'pizarra', 'pasillo', 'banos'].includes(z);
      if (z === p.zona && !(pasea && Math.random() < .05) && !(z === 'cafe' && !p.sitio && Math.random() < .03)) continue;
      if (p.sitio && p.sitio.sala !== z) { p.sitio.ocupa = null; p.sitio = null; }
      if (['traders', 'lab', 'reuniones', 'privadas', 'cafe'].includes(z) && !p.sitio) {
        const libres = this.sitios.filter(s => s.sala === z && !s.ocupa);
        p.sitio = libres.length ? (z === 'privadas' ? libres[0] : libres[trHash(k) % libres.length]) : null;
        if (p.sitio) p.sitio.ocupa = k;
      }
      const [tx, ty] = p.sitio ? [p.sitio.x, p.sitio.y] : this.casilla(z === 'traders' ? 'pasillo' : z, trHash(k) + Math.floor(ahora / 7) * 131);
      p.ruta = this.camino(p.x, p.y, tx, ty); p.zona = z;
    }
    for (const k of [...this.pj.keys()]) if (!vivos.has(k)) { const p = this.pj.get(k); if (p.sitio) p.sitio.ocupa = null; this.pj.delete(k); }
    this._yaCargo = true;
  },

  dibujar(t) {
    const d = this.datos; if (!d || !this.w) return;
    const c = this.c, R = TR_R, ahora = performance.now() / 1000, dt = Math.min(.2, ahora - (this.tAnt || ahora)), e = this.est; this.tAnt = ahora;
    trPresupuesto = 50;
    // qué pantalla está encendida y de qué color
    for (const o of TR_MAPA.objetos) if (o.tipo === 'tr_puesto') o.ocup = [null, null, null, null];
    for (const st of this.sitios) if (st.obj && st.ocupa) { const p = this.pj.get(st.ocupa); if (p && !p.ruta.length) st.obj.ocup[st.k] = st.sala === 'lab' ? 'lab' : /corto|🔴/.test(p.a.ultimo || '') ? 'corto' : 'largo'; }
    // mover
    for (const p of this.pj.values()) {
      if (p.ruta.length) {
        const [tx, ty] = p.ruta[0], dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy), v = 95 * dt;
        if (dist <= v) { p.x = tx; p.y = ty; p.ruta.shift(); } else { p.x += dx / dist * v; p.y += dy / dist * v; }
        p.anda = true; if (Math.abs(dx) > .5) p.izq = dx < 0; p.dir = Math.abs(dx) > Math.abs(dy) ? 'lado' : dy < 0 ? 'arriba' : 'abajo';
      } else { p.anda = false; p.dir = p.sitio ? p.sitio.dir : p.zona === 'pizarra' ? 'arriba' : 'abajo'; if (p.sitio?.dir === 'lado') p.izq = p.sitio.izq; }
    }
    c.globalCompositeOperation = 'source-over'; c.drawImage(this.fondo, 0, 0);
    const luces = [], cosas = [];
    for (const o of TR_MAPA.objetos) { const dO = MM_OBJ[o.tipo]; if (!dO) continue; const X = o.x * R, Y = o.y * R - dO.alto; cosas.push({ o, d: dO, X, Y, base: dO.bloq ? (o.y + dO.h) * R - 2 : -1 }); if (dO.luz) luces.push(...dO.luz(o, X, Y, t, e)); }
    for (const p of this.pj.values()) cosas.push({ p, base: p.y });
    cosas.push({ jefe: true, base: 12 * R + 20 });
    cosas.sort((a, b) => a.base - b.base);
    this.cajas = [];
    const ew = Math.round(28 * TR_E), eh = Math.round(54 * TR_E);
    for (const k of cosas) {
      if (k.o) { const sp = mmSpriteObjeto(k.o); if (sp) c.drawImage(sp, k.X, k.Y); k.d.vivo?.(c, k.X, k.Y, t, e, k.o); continue; }
      if (k.jefe) {                                        // el jefe de mesa preside la reunión
        const L = this._jefeL || (this._jefeL = (() => { const L = { piel: MM_PIEL[1], pelo: MM_PELO[5], estilo: 'corto', ropa: '#1d2433', ropa2: '#c9a24a', pantalon: '#1d2433', gafas: '#ffcf4d', barba: '#d9d9d9' }; L.k = 'jefe-mesa'; return L; })());
        const sp = trSprite(L, 'lado', 0, 'trabaja'); if (sp) { c.drawImage(sp, 43 * R - 10, 12 * R + 20 - 50 * TR_E); }
        mmCartel(c, 43 * R + 6, 12 * R - 46, 'JEFE', { borde: '#ffcf4d', max: 60 }); luces.push({ x: 43 * R, y: 12 * R, r: 70, col: [255, 210, 120], a: .35 });
        continue;
      }
      const p = k.p, a = p.a, L = trLook(a), quieto = !p.anda, sentado = quieto && p.sitio;
      const f = p.anda ? Math.floor(t / 120 + trHash(p.k)) % 4 : Math.floor(t / 400 + trHash(p.k)) % 2;
      const sp = trSprite(L, p.dir, f, p.anda ? 'anda' : sentado && p.sitio.sala !== 'cafe' ? 'trabaja' : 'quieto');
      if (!sp) continue;
      const bx = Math.round(p.x - ew / 2), by = Math.round(p.y - 50 * TR_E);
      c.fillStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(p.x, p.y, 11, 4, 0, 0, 7); c.fill();
      const sel = this.sel && this.sel.id === a.id && this.sel.nodo === p.n.nodo;
      if (sel || this.encima === p) { c.strokeStyle = '#ffcf4d'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(p.x, p.y, 15, 6, 0, 0, 7); c.stroke(); }
      c.globalAlpha = a.estado === 'quebrado' ? .6 : 1;
      if (p.dir === 'lado' && p.izq) { c.save(); c.translate(bx + ew, by); c.scale(-1, 1); c.drawImage(sp, 0, 0); c.restore(); } else c.drawImage(sp, bx, by);
      c.globalAlpha = 1;
      c.fillStyle = '#0a0d12'; c.fillRect(bx + ew / 2 - 3, by + 8, 6, 6); c.fillStyle = p.n.nodo === 'pi' ? '#2fd1b0' : '#c77dff'; c.fillRect(bx + ew / 2 - 2, by + 9, 4, 4);   // equipo
      if ((a.metas || 0) > 0) { c.fillStyle = '#ffcf4d'; c.fillRect(bx + 10, by + 4, 12, 3); }
      if (p.zona === 'privadas' && sentado) { c.font = '700 9px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffcf4d'; c.fillText(a.nombre, p.x, p.y + 14); }
      if (a.estrategia === 'llm') luces.push({ x: p.x, y: p.y - 30, r: 50, col: [47, 209, 176], a: .3 });
      const b = this.burbujas.get(p.k) || (p.zona === 'lab' && sentado && Math.floor(t / 1000 + trHash(p.k)) % 5 === 0 ? { em: '🧠', hasta: ahora + 1 } : null);
      if (b && b.hasta > ahora) { c.fillStyle = 'rgba(255,255,255,.95)'; c.fillRect(bx + ew - 6, by + 4, 18, 16); c.fillStyle = 'rgba(255,255,255,.95)'; c.fillRect(bx + ew - 4, by + 20, 4, 3); c.font = '12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#000'; c.fillText(b.em, bx + ew + 3, by + 17); }
      this.cajas.push({ x: bx, y: by + 10, w: ew, h: eh - 10, p, a: { ...a, nodo: p.n.nodo } });
    }
    this.cajas.reverse();                                  // el de delante gana al pasar el ratón
    // racks de los equipos: un cartel por nodo con sus números
    d.nodos.slice(0, 2).forEach((nd, i) => {
      const k = nd.kpis || {}, ag = nd.agentes || [], on = nd.local || nd.en_linea, cap = ag.reduce((s, a) => s + (a.equity || 0), 0), ini = (k.capital || 1) * ag.length;
      const ops = ag.reduce((s, a) => s + (a.trades || 0), 0), x = (i ? 34 : 22) * R + 16, y = 32 * R - 10;
      mmCartel(c, x, y, `${String(nd.nodo).toUpperCase()} ${ag.length} · ${cap.toFixed(2)}$ · ${ops} OP`, { borde: !on ? '#ff3b5c' : cap >= ini ? '#3dff8a' : '#ffcf4d', max: 260 });
      if (on) luces.push({ x, y: 28 * R, r: 150, col: nd.nodo === 'pi' ? [47, 209, 176] : [199, 125, 255], a: .35 });
    });
    // luz: ambiente + salas + fuentes → se multiplica sobre la escena (como el Mundo)
    const Lc = this.lc, Am = this.w.tema.amb, lw = this.luz.width, lh = this.luz.height;
    Lc.globalCompositeOperation = 'source-over'; Lc.fillStyle = `rgb(${Am[0]},${Am[1]},${Am[2]})`; Lc.fillRect(0, 0, lw, lh);
    Lc.globalCompositeOperation = 'lighter'; Lc.fillStyle = `rgba(255,236,210,${this.w.tema.sala})`;
    for (const s of TR_MAPA.salas) Lc.fillRect(s.x * R / 2, s.y * R / 2, s.w * R / 2, s.h * R / 2);
    for (const l of luces) { if (!Number.isFinite(l.a)) l.a = .35; const g = Lc.createRadialGradient(l.x / 2, l.y / 2, 0, l.x / 2, l.y / 2, l.r / 2); g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${l.a})`); g.addColorStop(.45, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${l.a * .38})`); g.addColorStop(1, 'rgba(0,0,0,0)'); Lc.fillStyle = g; Lc.fillRect((l.x - l.r) / 2, (l.y - l.r) / 2, l.r, l.r); }
    c.globalCompositeOperation = 'multiply'; c.imageSmoothingEnabled = true; c.drawImage(this.luz, 0, 0, this.W, this.H); c.imageSmoothingEnabled = false;
    c.globalCompositeOperation = 'lighter';
    for (const l of luces) if (l.bloom) { const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.bloom); g.addColorStop(0, `rgba(${l.col[0]},${l.col[1]},${l.col[2]},.55)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(l.x - l.bloom, l.y - l.bloom, l.bloom * 2, l.bloom * 2); }
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.vin, 0, 0);
    for (const s of TR_MAPA.salas) mmCartel(c, (s.x + s.w / 2) * R, s.y * R + 4, s.titulo.toUpperCase(), { borde: this.salaSel === s.id ? '#ffcf4d' : '#2fd1b0', max: s.w * R - 8 });
    // ocupación de cada sala y sala elegida
    this.cuenta = {};
    for (const p of this.pj.values()) { const z = p.zona === 'pasillo' ? 'traders' : p.zona; this.cuenta[z] = (this.cuenta[z] || 0) + 1; }
    c.font = '700 11px monospace'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    for (const s of TR_MAPA.salas) { const n = this.cuenta[s.id]; if (!n) continue; const X = (s.x + s.w) * R - 6, Y = (s.y + s.h) * R - 6; c.fillStyle = 'rgba(8,11,16,.85)'; c.fillRect(X - 44, Y - 14, 46, 18); c.fillStyle = '#c9d7e6'; c.fillText(`👤 ${n}`, X - 2, Y); }
    if (this.salaSel) { const s = TR_MAPA.salas.find(x => x.id === this.salaSel); c.strokeStyle = '#2fd1b0'; c.lineWidth = 3; c.strokeRect(s.x * R + 1.5, s.y * R + 1.5, s.w * R - 3, s.h * R - 3); }
  },

  // ---------- ratón y fichas ----------
  pos(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) * this.cv.width / r.width, (e.clientY - r.top) * this.cv.height / r.height]; },
  agenteEn(e) { const [x, y] = this.pos(e); const b = this.cajas.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h); this.encima = b?.p || null; return b?.a || null; },
  salaEn(e) { const [x, y] = this.pos(e), R = TR_R; return (TR_MAPA.salas.find(s => x >= s.x * R && x < (s.x + s.w) * R && y >= s.y * R && y < (s.y + s.h) * R) || {}).id || null; },
  raton(e) {
    const a = this.agenteEn(e), tip = $('#trTip', this.v);
    if (!a) { tip.hidden = true; this.cv.style.cursor = this.salaEn(e) ? 'pointer' : ''; return; }
    this.cv.style.cursor = 'pointer';
    tip.innerHTML = `<b>${esc(a.nombre)}</b> · ${esc(a.nodo)}<br>${a.estrategia} · ${a.marco} · ${tr('gen')} ${a.generacion}<br>${tr('capital')} ${(a.equity ?? 0).toFixed(4)} $ (${(a.pnl_pct ?? 0).toFixed(1)}%) · ${tr('máx')} ${(a.max_equity ?? 0).toFixed(3)} $<br>${a.trades} ${tr('operaciones')} · ${a.ganados} ${tr('ganadas')} · ${a.quiebras || 0} ${tr('quiebras')}${a.r_medio != null ? ` · ${a.r_medio > 0 ? '+' : ''}${a.r_medio.toFixed(2)}R` : ''}<br><span class="sutil">${esc(a.estado)} · ${esc(a.ultimo || '')}</span>`;
    const r = this.cv.parentElement.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 250) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; tip.hidden = false;
  },
  fichaSala(z) {
    const el = $('#trFicha', this.v); if (!el || this.sel) return;
    const todos = [...this.pj.values()];
    const en = z ? todos.filter(p => (p.zona === 'pasillo' ? 'traders' : p.zona) === z).map(p => p.a) : todos.map(p => p.a);
    const cap = en.reduce((s, a) => s + (a.equity || 0), 0), mx = en.reduce((s, a) => Math.max(s, a.max_equity || 0), 0);
    const rs = en.filter(a => a.r_medio != null), r = rs.length ? rs.reduce((s, a) => s + a.r_medio, 0) / rs.length : null;
    const [nombre, desc, ubic] = z ? TR_INFO[z] : ['Mission Control · Piso 1', 'Oficina principal: análisis, coordinación y operaciones del enjambre. Haz clic en una sala o en un trader.', 'Centro de la ciudad'];
    el.innerHTML = `<div class="tr-tit tr-ed">${ic('edificio')}<div>${tr(z ? 'SALA' : 'EDIFICIO / OFICINA')}<span>${esc(tr(nombre))}</span></div></div>
      <div class="tr-fk"><div><small>${tr('Capital')}</small><b>${cap.toFixed(2)} $</b></div><div><small>${tr('Máximo')}</small><b>${mx.toFixed(3)} $</b></div>
      <div><small>Traders</small><b>${en.length} <span class="sutil">(${en.filter(a => a.estado === 'en posición').length} ${tr('operando')})</span></b></div>
      <div><small>R</small><b class="${(r || 0) > 0 ? 'ok' : 'mal'}">${r != null ? (r > 0 ? '+' : '') + r.toFixed(2) : '—'}</b></div></div>
      <p class="tr-desc">${esc(tr(desc))}</p><p class="tr-ubi">${ic('pin')}${tr('Ubicación')}: <span>${esc(tr(ubic))}</span></p>`;
  },
  async ficha(a, refresco) {
    const el = $('#trFicha', this.v); if (!el) return;
    const pie = `<p class="tr-desc">${a.estrategia} · ${tr('velas de')} ${a.marco} · ${tr('riesgo')} ${a.riesgo_pct}%${a.tendencia ? ' · ' + tr('solo a favor de tendencia') : ''}</p>`;
    let extra = '';
    const local = (this.datos?.nodos || []).find(n => n.nodo === a.nodo)?.local;
    if (local && !refresco) {
      try {
        const d = await api('GET', `/trading/agente/${a.id}`);
        if (!this.v || !this.sel || this.sel.id !== a.id) return;
        const g = d.genoma;
        extra = `<p class="sutil">stop ${g.stop_atr} ATR · ${tr('objetivo')} ${g.rr}R · ${tr('máx')} ${g.max_barras} ${tr('velas')} · BE ${g.be_en_r || 'no'} · ${tr('entrada')} ${g.entrada || 'mercado'} · ${tr('tramos')} ${g.tramos || 1}${g.trail_r ? ' · trailing ' + g.trail_r + 'R' : ''}${g.filtro_ia ? ' · IA ≥ ' + g.filtro_ia : ''}</p>` +
          `<div class="tr-tit">${tr('Intentos')}</div>` + d.intentos_lista.slice(0, 5).map(i => `<div class="sutil">#${i.id} · máx ${(+i.max_equity).toFixed(3)} $ · ${i.trades} trades · ${esc(i.resultado || tr('en curso'))}${i.causa ? ' · ' + esc(i.causa) : ''}</div>`).join('') +
          `<div class="tr-tit">${tr('Lo que aprendió')}</div>` + (d.lecciones.slice(0, 5).map(l => `<div class="tr-l">${esc(l.texto)}</div>`).join('') || `<p class="sutil">—</p>`);
        this.extra = extra;
      } catch { extra = ''; }
    } else if (refresco) extra = this.extra || '';
    el.innerHTML = `<div class="tr-tit tr-ed">${ic('persona')}<div>${esc(a.nombre)}<span>${esc(a.nodo)} · ${tr('gen')} ${a.generacion}</span></div></div>
      <div class="tr-fk"><div><small>${tr('Capital')}</small><b>${(a.equity ?? 0).toFixed(4)} $</b></div><div><small>${tr('Máximo')}</small><b>${(a.max_equity ?? 0).toFixed(3)} $</b></div>
      <div><small>Trades</small><b>${a.trades} <span class="sutil">(${a.ganados}✔)</span></b></div><div><small>R</small><b class="${(a.r_medio || 0) > 0 ? 'ok' : 'mal'}">${a.r_medio != null ? a.r_medio.toFixed(2) : '—'}</b></div></div>
      ${pie}<p class="tr-desc">${esc(a.estado)} · ${esc(a.ultimo || '')}</p>${extra}`;
  },
};

// estilos propios de la vista (una sola vez)
(() => {
  const st = document.createElement('style');
  st.textContent = `  .pagina.tr-mc{max-width:none}
  .tr-mc{--tr-card:#0f1828;--tr-borde:#22314a;--tr-acento:#2fd1b0}
  .tr-cab{display:flex;align-items:center;gap:22px;background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:10px;padding:12px 18px;margin-bottom:10px}
  .tr-logo{display:flex;align-items:center;gap:12px;padding-right:22px;border-right:1px solid var(--tr-borde)}.tr-logo .i{width:38px;height:38px;color:var(--tr-acento)}
  .tr-logo b{display:block;font:800 22px/1 system-ui;letter-spacing:.06em;color:var(--tr-acento);white-space:nowrap}.tr-logo span{font-size:11px;letter-spacing:.14em;opacity:.7}
  .tr-cab p{flex:1;margin:0;font-size:13px;opacity:.85}.tr-ley{display:flex;gap:16px;font-size:11px;opacity:.85;border:1px solid var(--tr-borde);border-radius:6px;padding:6px 10px;white-space:nowrap}
  .tr-ley i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
  .tr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
  .tr-kpi{background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:8px;padding:10px 14px}.tr-kpi small{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.06em;opacity:.8}
  .tr-kpi small .i{width:16px;height:16px}.tr-kpi b{display:block;font:700 26px/1.2 system-ui;margin:4px 0 2px}.tr-kpi span{font-size:11px;opacity:.65}
  .tr-sala{position:relative;background:#05080d;border:1px solid var(--tr-borde);border-radius:10px;padding:6px;margin-bottom:12px}
  .tr-sala canvas{width:100%;height:auto;image-rendering:pixelated;display:block;border-radius:6px}
  .tr-tip{position:absolute;z-index:3;background:rgba(10,14,20,.96);border:1px solid var(--tr-acento);border-radius:6px;padding:8px 10px;font-size:12px;pointer-events:none;max-width:250px}
  .tr-abajo{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:start}.tr-card{background:var(--tr-card);border:1px solid var(--tr-borde);border-radius:10px;padding:14px}
  .tr-tit{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.05em;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--tr-borde)}
  .tr-tit .i{width:18px;height:18px;color:var(--tr-acento)}.tr-ed .i{width:28px;height:28px}.tr-ed span{display:block;font-weight:400;letter-spacing:0;opacity:.75;font-size:12px}
  .tr-ctl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px}.tr-ctl label{font-size:11px;opacity:.8}.tr-ctl input,.tr-ctl select{width:100%}
  .tr-bot{display:flex;gap:8px}.tr-bot .btn{flex:1;justify-content:center}.tr-central{font-size:11px;opacity:.8;margin:8px 0 0}
  .tr-lec{max-height:300px;overflow:auto}.tr-l{font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .tr-fk{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:6px 0 10px}.tr-fk small{display:block;opacity:.6;font-size:11px}.tr-fk b{font-size:16px}
  .tr-desc{font-size:12px;opacity:.85;margin:6px 0;padding-top:8px;border-top:1px solid var(--tr-borde)}.tr-ubi{display:flex;align-items:center;gap:6px;font-size:12px;margin:6px 0 0}.tr-ubi .i{width:14px;height:14px}.tr-ubi span{color:var(--tr-acento)}
  .tr-top{display:grid;grid-template-columns:14px 1fr auto 22px;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid var(--tr-borde);cursor:pointer}
  .tr-top i{width:12px;height:12px;border-radius:50%}.tr-top b{display:block;font-size:13px}.tr-top span{font-size:11px;opacity:.65}.tr-top em{font-style:normal;font-weight:700}.tr-top small{opacity:.6;text-align:right}
  .tr-top:hover{background:rgba(47,209,176,.06)}
  @media (max-width:1300px){.tr-abajo{grid-template-columns:1fr 1fr}.tr-kpis{grid-template-columns:repeat(3,1fr)}.tr-cab{flex-wrap:wrap}}`;
  document.head.appendChild(st);
})();
