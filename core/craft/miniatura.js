// Miniaturas / portadas con PhotoCraft (receta fija, probada): fotograma con la cara más expresiva → franja oscura difuminada
// → título en 2 líneas con la fuente y los colores del kit (contorno + sombra) → letrero de la marca arriba → JPG + .pcraft.
// Variantes con otros momentos y otros colores para elegir en Revisión. PhotoCraft solo lee/escribe dentro de la carpeta del
// usuario: se trabaja en la carpeta temporal y se copia al destino.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { BASE } = require('./kit');

// ── momentos (puro): caras grandes en la zona de la cara + volumen alto (gritos, risas) → los n mejores, separados ──
function elegirMomentos(an, { n = 3, zona = 'cara', separacion = 4, margen = 2, evitar = [] } = {}) {
  const caras = an?.caras?.[zona] || Object.values(an?.caras || {})[0] || [];
  const z = an?.zonas?.[zona], ancho = z ? z[2] - z[0] : an?.ancho || 1080;
  const dur = an?.duracion || (caras.at(-1)?.[0] ?? 0) + 1, pa = an?.pasoAudio || 0.2, au = an?.audio || [];
  const dbs = au.filter(Number.isFinite).sort((a, b) => a - b), mediana = dbs.length ? dbs[dbs.length >> 1] : -30;
  const dbEn = t => { const xs = au.slice(Math.max(0, Math.floor((t - 0.4) / pa)), Math.ceil((t + 0.4) / pa) + 1); return xs.length ? Math.max(...xs) : mediana; };
  const cands = caras.filter(([t, l]) => l.length && t >= margen && t <= dur - margen && !evitar.some(([a, b]) => t >= a && t <= b))
    .map(([t, l]) => ({ t, puntos: 100 * l[0][2] / ancho + 4 * Math.max(0, dbEn(t) - mediana) + 10 * (l[0][3] || 0) }))
    .sort((a, b) => b.puntos - a.puntos);
  const out = [];
  for (const c of cands) { if (out.every(o => Math.abs(o.t - c.t) >= separacion)) out.push(c); if (out.length >= n) break; }
  // sin caras (o pocas): repartidos por el clip
  for (let i = 1; out.length < n && i <= n; i++) { const t = +(dur * i / (n + 1)).toFixed(2); if (out.every(o => Math.abs(o.t - t) >= separacion / 2)) out.push({ t, puntos: 0 }); }
  return out.slice(0, n).map(o => +o.t.toFixed(2));
}

// colores de cada variante: [línea 1, línea 2]
const VARIANTES = [['primario', 'acento'], ['acento', 'primario'], ['resaltado', 'primario']];

// 2 líneas equilibradas (máx. ~5 palabras: una miniatura no se lee si hay más)
function lineas(texto) {
  const ps = String(texto || '').toLocaleUpperCase('es').replace(/[^\p{L}\d¡!¿?%$ ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  if (ps.length < 2) return [ps.join(' ')];
  let mejor = 1, dif = Infinity;
  for (let i = 1; i < ps.length; i++) { const d = Math.abs(ps.slice(0, i).join(' ').length - ps.slice(i).join(' ').length); if (d < dif) { dif = d; mejor = i; } }
  return [ps.slice(0, mejor).join(' '), ps.slice(mejor).join(' ')];
}

const correr = (cmd, args, timeout = 120_000) => new Promise((ok, mal) => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 << 20 },
  (e, out, err) => (e ? mal(new Error(`${path.basename(cmd)}: ${String(err || e.message).trim().slice(-300)}`)) : ok(out))));

function crearMiniaturas({ mcpLocales, cfg }) {
  const ffmpeg = () => cfg?.craft?.ffmpeg || 'ffmpeg';
  async function pc(nombre, args) {
    const r = await mcpLocales.llamar('photocraft', nombre, args);
    const txt = (r?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (r?.isError) throw new Error(`PhotoCraft ${nombre}${args?.id ? ' ' + args.id : ''}: ${txt.slice(0, 300)}`);
    try { return JSON.parse(txt); } catch { return txt; }
  }
  const cmd = (id, params = {}) => pc('command_run', { id, params });

  async function fotograma(video, t, salida) {
    await correr(ffmpeg(), ['-v', 'error', '-y', '-ss', String(Math.max(0, t)), '-i', video, '-frames:v', '1', salida]);
    return salida;
  }
  // un fotograma del letrero animado (con transparencia) para ponerlo arriba de la portada
  async function letreroPng(mov, salida) {
    await correr(ffmpeg(), ['-v', 'error', '-y', '-ss', '1.5', '-i', mov, '-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba', salida]);
    return salida;
  }

  // una portada: imagen de fondo + título + letrero → { jpg, pcraft }
  async function componer({ fondo, texto, kit, salida, variante = 0, letrero, ancho, alto, franja }) {
    if (!mcpLocales.obtener('photocraft')?.activo) throw new Error('PhotoCraft no está instalado o está desactivado (Configuración → Apps MCP locales)');
    const k = { ...BASE, ...(kit || {}), colores: { ...BASE.colores, ...(kit?.colores || {}) } };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-mini-'));
    try {
      const W = ancho || 1080, H = alto || 1920, e = Math.min(W, H) / 1080, vertical = H > W;
      await pc('doc_new', { width: W, height: H });
      try {
        if (!vertical) await cmd('layer.newFillLayer.solidColor', { color: k.colores.fondo });
        await pc('doc_place', { path: fondo, fit: true, center: [W / 2, H / 2] });
        // franja oscura difuminada detrás del título (en vertical, entre la cara y la cabina; en horizontal, abajo)
        const [f0, f1] = franja || (vertical ? [Math.round(H * 0.365), Math.round(H * 0.6)] : [Math.round(H * 0.55), H]);
        await cmd('select.rect', { x: 0, y: f0, width: W, height: f1 - f0 });
        await cmd('select.modify.feather', { radius: Math.round(70 * e) });          // el feather de select.rect no hace nada
        const banda = await cmd('layer.newFillLayer.solidColor', { color: '#000000' });
        await cmd('layer.setProps', { layer: banda?.layer, opacity: 0.6, name: 'Franja' });
        await cmd('select.deselect', {});
        // título
        const [l1, l2] = lineas(texto), cols = VARIANTES[variante % VARIANTES.length].map(c => k.colores[c]);
        const maxW = W * (vertical ? 0.86 : 0.9), cy = (f0 + f1) / 2;
        let tam = Math.round((vertical ? 150 : 130) * e);
        const capas = [];
        const lin = l2 ? [[l1, cy - 0.14 * tam], [l2, cy + 0.86 * tam]] : [[l1, cy + 0.36 * tam]];
        for (const [i, [txt, y]] of lin.entries()) {
          const r = await cmd('type.create', { x: Math.round(W / 2), y: Math.round(y), text: txt, font: k.fuente?.familia || 'Trueno', size: tam, color: cols[i] || cols[0], align: 'center', name: `Titulo${i + 1}` });
          capas.push({ layer: r.layer, bounds: r.bounds });
        }
        // la línea más ancha manda: las dos a la misma escala para que quepan
        const masAncha = Math.max(...capas.map(c => (c.bounds ? c.bounds[2] - c.bounds[0] : 0)));
        if (masAncha > maxW) {
          const p = +(100 * maxW / masAncha).toFixed(1);
          for (const c of capas) await cmd('edit.transform', { layer: c.layer, scaleX: p, scaleY: p });
          tam = Math.round(tam * p / 100);
        }
        const estilo = [{ kind: 'stroke', params: { size: Math.max(6, Math.round(tam * 0.09)), position: 'outside', color: k.colores.contorno } },
          { kind: 'dropShadow', params: { distance: Math.round(12 * e), size: Math.round(14 * e), opacity: 80, color: '#000000' } }];
        for (const c of capas) await cmd('layer.layerStyle.replace', { layer: c.layer, effects: estilo });
        if (letrero && fs.existsSync(letrero) && vertical) await pc('doc_place', { path: letrero, center: [W / 2, Math.round(75 * e)] });
        const jpgTmp = path.join(tmp, 'portada.jpg'), pcTmp = path.join(tmp, 'portada.pcraft');
        await pc('doc_save', { path: pcTmp });
        await pc('doc_save', { path: jpgTmp, quality: 90 });
        fs.mkdirSync(path.dirname(salida), { recursive: true });
        const jpg = salida.replace(/\.(jpe?g|png)$/i, '') + '.jpg', pcraft = salida.replace(/\.(jpe?g|png)$/i, '') + '.pcraft';
        fs.copyFileSync(jpgTmp, jpg); fs.copyFileSync(pcTmp, pcraft);
        return { jpg, pcraft };
      } finally { try { await pc('doc_close', { force: true }); } catch { } }
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
  }

  // varias portadas de un clip: los mejores momentos de cara (análisis del director) × colores del kit
  async function deClip({ video, an, texto, kit, carpeta, nombre, n, evitar, letrero, progreso = () => { } }) {
    const cuantas = n ?? kit?.miniatura?.variantes ?? 3;
    const momentos = elegirMomentos(an || {}, { n: cuantas, evitar });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-fot-'));
    const out = [];
    try {
      let png = null;
      if (letrero) try { png = await letreroPng(letrero, path.join(tmp, 'letrero.png')); } catch { }
      for (const [i, t] of momentos.entries()) {
        progreso(i, momentos.length);
        const f = await fotograma(video, t, path.join(tmp, `f${i}.png`));
        const r = await componer({ fondo: f, texto, kit, variante: i, letrero: png, salida: path.join(carpeta, `${nombre} - portada ${i + 1}.jpg`), franja: kit?.miniatura?.franja });
        out.push({ t, variante: i, ...r });
      }
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
    return out;
  }

  const HERRAMIENTA = {
    nombre: 'hacer_miniatura', riesgo: 'escritura',
    descripcion: 'Miniatura/portada profesional con PhotoCraft (receta fija y probada): fondo (imagen o fotograma de un vídeo), franja oscura difuminada, título en 2 líneas con la fuente y colores del kit de marca, contorno grueso y sombra, letrero de la marca. '
      + 'formato vertical (1080×1920, portada TikTok/Shorts/Reels) o youtube (1280×720). Guarda JPG + .pcraft (con capas, para retocar). Para un vídeo sin segundo, elige solo los momentos con la cara más expresiva (variantes).',
    parametros: { type: 'object', properties: {
      texto: { type: 'string', description: 'título corto (3–6 palabras)' },
      imagen: { type: 'string', description: 'imagen de fondo' },
      video: { type: 'string', description: 'o un vídeo: se saca el fotograma' },
      segundo: { type: 'number', description: 'segundo del vídeo (si no, los mejores momentos de cara)' },
      variantes: { type: 'number', description: 'cuántas portadas (1–3, por defecto 1 con imagen/segundo, 3 con vídeo)' },
      formato: { type: 'string', enum: ['vertical', 'youtube'] },
      kit: { type: 'string', description: 'kit de marca (por defecto el primero)' },
      salida: { type: 'string', description: 'ruta del JPG (por defecto junto al original)' },
    }, required: ['texto'] },
    resumen: a => String(a.texto || '').slice(0, 40),
    disponible: () => !!mcpLocales.obtener('photocraft')?.activo,
    ejecutar: async (a, ctx = {}) => {
      const kits = require('./kit').crearKits({ cfg }), kit = kits.obtener(a.kit || kits.ids()[0]);
      const base = path.resolve(ctx.cwd || os.homedir(), String(a.imagen || a.video || ''));
      if (!fs.existsSync(base)) throw new Error(`no existe ${base}`);
      const yt = a.formato === 'youtube', dims = yt ? { ancho: 1280, alto: 720 } : {};
      const salida = a.salida ? path.resolve(ctx.cwd || os.homedir(), a.salida) : path.join(path.dirname(base), `${path.basename(base, path.extname(base))} - portada.jpg`);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-fot-'));
      try {
        let tiempos = [null];
        if (a.video) {
          if (a.segundo != null) tiempos = [+a.segundo];
          else {
            const zonas = kit?.video?.zonas || {};
            let an = null; try { an = await require('./director').analizar(base, Object.keys(zonas).length ? zonas : {}, { python: cfg?.craft?.python }); } catch { }
            tiempos = elegirMomentos(an || {}, { n: Math.min(3, Math.max(1, a.variantes || 3)) });
          }
        }
        const hechas = [];
        for (const [i, t] of tiempos.slice(0, Math.min(3, Math.max(1, a.variantes || tiempos.length))).entries()) {
          ctx.progreso?.(`portada ${i + 1}/${tiempos.length}`);
          const fondo = a.video ? await fotograma(base, t, path.join(tmp, `f${i}.png`)) : base;
          const dest = tiempos.length > 1 ? salida.replace(/\.(jpe?g|png)$/i, '') + ` ${i + 1}.jpg` : salida;
          hechas.push(await componer({ fondo, texto: a.texto, kit, variante: i, salida: dest, ...dims }));
        }
        return { texto: hechas.map(h => `Portada: ${h.jpg} (capas: ${h.pcraft})`).join('\n'), imagenes: hechas.map(h => ({ mime: 'image/jpeg', ruta: h.jpg })) };
      } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
    },
  };

  return { componer, deClip, fotograma, HERRAMIENTA };
}

module.exports = { crearMiniaturas, elegirMomentos, lineas, VARIANTES };
