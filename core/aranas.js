// Arañas digitales de APOLO: salen del casco y rastrean.
//  - lectora  (cian):    camina por el texto de la página (o un libro de varias páginas) y lo guarda completo en .txt + resumen
//  - ia       (magenta): marca los párrafos que parecen escritos por una IA (estimación, no prueba)
//  - codigo   (verde):   busca fallos de seguridad en el código de la página (inyecciones, secretos, eval…) y cómo arreglarlos
//  - discord  (violeta): lee los servidores donde está el bot CONTROL-COMANDER (REST desde la Pi; el token nunca sale de la Pi)
//  - radar    (ámbar):   lo último y lo que sube en GitHub y Hugging Face (repos, modelos, spaces, papers), solo lo nuevo
// Las 3 primeras usan la extensión del navegador (extension/aranas.js, la animación); el análisis lo hace el cerebro (generarJSON).
// Informes en Descargas/APOLO arañas/*.txt. Bus 'aranas' {fase:'salen'|'vuelven', tipo, color} → la isla anima la salida del casco.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const TIPOS = {
  lectora: { color: '#3df2ff', nombre: 'Lectora', web: true },
  ia: { color: '#ff3df2', nombre: 'Detectora de IA', web: true },
  codigo: { color: '#4dff88', nombre: 'De código', web: true },
  discord: { color: '#8b7bff', nombre: 'De Discord', web: false },
  radar: { color: '#ffb020', nombre: 'Radar GitHub + Hugging Face', web: false },
};
const SEV = { critica: '#ff3355', alta: '#ff8a00', media: '#ffd400', baja: '#4dff88' };
const TEMAS_RADAR = ['llm', 'ai-agents', 'mcp', 'text-to-speech', 'speech-recognition', 'robotics', 'computer-vision', 'trading-bot', '3d'];
const INTERESES = 'agentes de IA y asistentes de escritorio, modelos locales (Ollama), voz (TTS/STT), robótica y robots humanoides, visión por ordenador, trading y memecoins, 3D/Blender e impresión 3D, edición de vídeo y clips, MCP y herramientas para Claude Code';

const ahoraTxt = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}${z(d.getMinutes())}`; };
const limpio = s => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const dominio = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// script que corre EN LA PI: lee el token del bot de su .env y devuelve los mensajes recientes en JSON (stdout)
const PY_DISCORD = String.raw`
import sys, json, base64, os, time, urllib.request, urllib.error
a = json.loads(base64.b64decode(sys.argv[1]).decode())
tok = None
for l in open(os.path.expanduser(a.get('env') or '~/control-commander/.env'), encoding='utf-8'):
    if l.startswith('DISCORD_BOT_TOKEN='): tok = l.split('=', 1)[1].strip().strip('"').strip("'")
if not tok: print(json.dumps({'error': 'no hay DISCORD_BOT_TOKEN en el .env'})); sys.exit(0)
errores = []
def api(p):
    for _ in range(5):
        req = urllib.request.Request('https://discord.com/api/v10' + p, headers={'Authorization': 'Bot ' + tok, 'User-Agent': 'DiscordBot (apolo-aranas, 1.0)'})
        try: return json.load(urllib.request.urlopen(req, timeout=20))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                try: time.sleep(float(json.load(e).get('retry_after', 1)) + 0.25)
                except Exception: time.sleep(1.5)
                continue
            if e.code in (401, 403, 404): errores.append('%s %s' % (e.code, p.split('?')[0])); return None
            raise
    return None
after = (int((time.time() - a['horas'] * 3600) * 1000) - 1420070400000) << 22
srv = (a.get('servidor') or '').lower(); can = (a.get('canal') or '').lower().lstrip('#')
out = []
for g in api('/users/@me/guilds') or []:
    if srv and srv != g['id'] and srv not in g['name'].lower(): continue
    canales = [c for c in (api('/guilds/%s/channels' % g['id']) or []) if c.get('type') in (0, 5)]
    canales.sort(key=lambda c: c.get('position', 0))
    if can: canales = [c for c in canales if can == c['id'] or can in c['name'].lower()]
    gc = []
    for c in canales[:a.get('maxCanales', 40)]:
        msgs, desde = [], after
        while len(msgs) < a.get('maxMensajes', 200):
            lote = api('/channels/%s/messages?limit=100&after=%d' % (c['id'], desde))
            if not lote: break
            lote.sort(key=lambda m: int(m['id']))
            for m in lote:
                au = m.get('author') or {}
                msgs.append({'a': au.get('global_name') or au.get('username') or '?', 'bot': bool(au.get('bot')), 't': (m.get('timestamp') or '')[:16].replace('T', ' '),
                             'c': (m.get('content') or '')[:700], 'adj': len(m.get('attachments') or []), 'emb': [e.get('title') for e in (m.get('embeds') or []) if e.get('title')][:2]})
            desde = int(lote[-1]['id'])
            if len(lote) < 100: break
        if msgs: gc.append({'id': c['id'], 'nombre': c['name'], 'mensajes': msgs})
    out.append({'id': g['id'], 'nombre': g['name'], 'canales': gc})
print(json.dumps({'servidores': out, 'errores': errores[:20]}, ensure_ascii=False))
`;

function crearAranas({ cfg, bus, navegador, permisos, generarJSON, modelo, secreto = () => null, fetch: fetchX = globalThis.fetch, ejecutarSsh }) {
  const conf = () => cfg.aranas || {};
  const dirDatos = () => { const d = path.join(cfg.dir, 'aranas'); fs.mkdirSync(d, { recursive: true }); return d; };
  const dirInformes = () => { const d = conf().informes || path.join(os.homedir(), 'Downloads', 'APOLO arañas'); fs.mkdirSync(d, { recursive: true }); return d; };
  const indiceRuta = () => path.join(dirDatos(), 'informes.json');
  const leerIndice = () => { try { return JSON.parse(fs.readFileSync(indiceRuta(), 'utf8')); } catch { return []; } };
  const corriendo = new Map();   // tipo -> { desde, detalle }

  function guardarInforme(tipo, titulo, texto, extra = {}) {
    const archivo = path.join(dirInformes(), `${ahoraTxt()} ${tipo} ${limpio(titulo) || tipo}.txt`);
    fs.writeFileSync(archivo, texto, 'utf8');
    const ind = leerIndice();
    ind.unshift({ id: `${Date.now().toString(36)}`, tipo, titulo, archivo, fecha: Date.now(), ...extra });
    fs.writeFileSync(indiceRuta(), JSON.stringify(ind.slice(0, 80), null, 1));
    return archivo;
  }
  const JSONm = async (system, prompt, schema) => (await generarJSON({ modelo: conf().modelo || modelo?.(), system, prompt, schema })).datos;
  const salen = (tipo, donde) => bus.emit('aranas', { fase: 'salen', tipo, color: TIPOS[tipo].color, nombre: TIPOS[tipo].nombre, donde });
  const vuelven = (tipo, resumen) => bus.emit('aranas', { fase: 'vuelven', tipo, color: TIPOS[tipo].color, nombre: TIPOS[tipo].nombre, resumen });

  // ---------- arañas de página (extensión) ----------
  async function pestanaObjetivo(id) {
    const tabs = await navegador.orden('pestanas');
    const t = (id != null && tabs.find(x => x.id === Number(id))) || tabs.find(x => x.activa) || tabs[0];
    if (!t) throw new Error('no hay ninguna pestaña abierta');
    if (!/^https?:|^file:/.test(t.url || '')) throw new Error(`la pestaña activa (${t.url || 'vacía'}) es interna del navegador: abre la página que quieres escanear`);
    const prot = navegador.protegido(t.url, t.titulo);
    if (prot) throw new Error(`"${dominio(t.url)}" es un sitio protegido (banco, contraseñas…): ahí no suelto arañas`);
    return t;
  }
  async function permisoSitio(s, url) {
    if (!s || !permisos) return;                          // desde el panel/isla lo pidió el usuario con un clic
    const dom = dominio(url); if (!dom) return;
    if (!s._sitios) Object.defineProperty(s, '_sitios', { value: new Set(), enumerable: false });
    if (s._sitios.has(dom)) return;
    const h = { nombre: 'navegador', riesgo: 'navegador', resumen: () => `soltar arañas en ${dom} (leer la página)` };
    const p = await permisos.pedir({ h, args: { dominio: dom }, sesion: s });
    if (!p.ok) throw new Error(`DENEGADO: el usuario no permite leer ${dom}`);
    s._sitios.add(dom);
  }
  const orden = (pestana, accion, args = {}, ms = 30_000) => navegador.orden('aranas', { pestana, accion, ...args }, ms);
  const recogerLuego = (pestana, tipo, ms = 9000) => { const t = setTimeout(() => { orden(pestana, 'recoger', { tipo }).catch(() => { }); vuelven(tipo); }, ms); t.unref?.(); };
  const lista = b => b.map(x => `[${x.i}] ${x.texto.replace(/\s+/g, ' ').slice(0, 1200)}`);
  const recorte = (lineas, max) => { const out = []; let n = 0; for (const l of lineas) { if (n + l.length > max) break; out.push(l); n += l.length; } return out.join('\n'); };

  async function lectora(t, a, s) {
    const paginas = Math.max(1, Math.min(Number(a.paginas) || 1, 20));
    const partes = [], todos = [];
    let r, pest = t.id;
    for (let p = 0; p < paginas; p++) {
      r = await orden(pest, 'soltar', { tipo: 'lectora', color: TIPOS.lectora.color });
      partes.push(`\n\n===== ${r.titulo} — ${r.url} =====\n\n` + r.bloques.map(b => b.texto).join('\n\n'));
      todos.push(...r.bloques.map(b => ({ ...b, pagina: p + 1 })));
      if (p + 1 >= paginas) break;
      await new Promise(ok => setTimeout(ok, Math.min(30_000, 2500 + r.bloques.length * 120)));   // que se vea el paseo antes de pasar página
      const sig = await orden(pest, 'siguiente').catch(() => ({ url: null }));
      if (!sig.url) { partes.push('\n\n(no encontré botón de "siguiente": fin)'); break; }
      await new Promise(ok => setTimeout(ok, 1500)); await orden(pest, 'esperar', {}, 20_000).catch(() => { });
    }
    const textoTodo = partes.join('').trim();
    const ultimas = todos.filter(b => b.pagina === (todos[todos.length - 1]?.pagina || 1));
    let d = { resumen: '', ideas: [], datos: [], marcas: [] };
    try {
      d = await JSONm('Eres la araña lectora de APOLO. Lees el texto completo de una página o libro y lo resumes en español, sin inventar nada que no esté en el texto.',
        `TÍTULO: ${r.titulo}\nURL: ${r.url}\nPÁGINAS LEÍDAS: ${partes.length}\n${a.consulta ? `LO QUE BUSCA EL USUARIO: ${a.consulta}\n` : ''}\nTEXTO (bloques numerados de la última página; antes van las anteriores):\n` +
        (partes.length > 1 ? recorte(textoTodo.split('\n').filter(Boolean).slice(0, 400), 9000) : '(una sola página)') + '\n\nBLOQUES DE LA ÚLTIMA PÁGINA:\n' + recorte(lista(ultimas), partes.length > 1 ? 12000 : 20000) +
        '\n\nDevuelve: resumen (5-8 frases), ideas clave, datos concretos (ISBN, DOI, fechas, nombres, cifras, enlaces) y hasta 8 marcas = pasajes importantes de la última página (i del bloque + frase exacta corta copiada del texto + etiqueta de 1-3 palabras).',
        { type: 'object', properties: { resumen: { type: 'string' }, ideas: { type: 'array', items: { type: 'string' } },
          datos: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string' }, valor: { type: 'string' } }, required: ['tipo', 'valor'] } },
          marcas: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, frase: { type: 'string' }, etiqueta: { type: 'string' } }, required: ['i', 'etiqueta'] } } }, required: ['resumen'] });
    } catch (e) { d.resumen = `(no pude resumir: ${e.message})`; }
    await orden(pest, 'marcar', { tipo: 'lectora', marcas: (d.marcas || []).slice(0, 8).map(m => ({ ...m, etiqueta: String(m.etiqueta || '').toUpperCase().slice(0, 24) })) }).catch(() => { });
    recogerLuego(pest, 'lectora');
    const informe = [`ARAÑA LECTORA · ${r.titulo}`, r.url, `${new Date().toLocaleString('es')} · ${partes.length} página(s) · ${textoTodo.length.toLocaleString('es')} caracteres${r.cortado ? ' (página muy larga: recortada)' : ''}`,
      '', 'RESUMEN', d.resumen, '', 'IDEAS CLAVE', ...(d.ideas || []).map(x => `• ${x}`), '', 'DATOS', ...(d.datos || []).map(x => `• ${x.tipo}: ${x.valor}`), '', '='.repeat(60), 'TEXTO COMPLETO', textoTodo].join('\n');
    const archivo = guardarInforme('lectora', r.titulo, informe, { url: r.url });
    return `🕷 La araña lectora leyó "${r.titulo}" (${partes.length} página(s), ${textoTodo.length.toLocaleString('es')} caracteres).\n\n${d.resumen}\n` +
      ((d.ideas || []).length ? `\nIdeas clave:\n${d.ideas.slice(0, 6).map(x => `• ${x}`).join('\n')}\n` : '') + `\nTexto completo guardado en: ${archivo}`;
  }

  async function ia(t, a) {
    const r = await orden(t.id, 'soltar', { tipo: 'ia', color: TIPOS.ia.color });
    const parr = r.bloques.filter(b => b.t === 'texto' && b.texto.length >= 120).slice(0, 40);
    if (!parr.length) { recogerLuego(t.id, 'ia', 3000); return `🕷 La detectora de IA no encontró párrafos largos que analizar en "${r.titulo}".`; }
    const d = await JSONm('Eres la araña detectora de texto generado por IA de APOLO. Estimas, párrafo a párrafo, la probabilidad (0-100) de que lo haya escrito un modelo de lenguaje. ' +
      'Señales: frases genéricas y equilibradas, muletillas típicas ("en resumen", "es importante destacar", "sumérgete", "delve", "en el mundo actual"), listas de tres, cero errores ni opiniones concretas, tono de folleto, ausencia de datos verificables o vivencias. ' +
      'Señales humanas: detalles personales, erratas, humor, opiniones fuertes, datos específicos, ritmo irregular. Sé prudente: es una ESTIMACIÓN, nunca una prueba.',
      `PÁGINA: ${r.titulo} (${r.url})\n\nPÁRRAFOS:\n${recorte(lista(parr), 26000)}\n\nDevuelve la probabilidad de cada párrafo (i), las señales que viste (cortas) y un veredicto global.`,
      { type: 'object', properties: { veredicto: { type: 'string' }, global: { type: 'integer' },
        parrafos: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, prob: { type: 'integer' }, senales: { type: 'array', items: { type: 'string' } } }, required: ['i', 'prob'] } } }, required: ['veredicto', 'parrafos'] });
    const ps = (d.parrafos || []).filter(p => parr.some(b => b.i === p.i));
    const marcas = ps.filter(p => p.prob >= 40).map(p => ({ i: p.i, etiqueta: `${p.prob >= 60 ? 'IA' : '¿IA?'} ${p.prob}%`, color: p.prob >= 60 ? TIPOS.ia.color : '#ffb020' }));
    await orden(t.id, 'marcar', { tipo: 'ia', marcas }).catch(() => { });
    recogerLuego(t.id, 'ia');
    const global = Number.isFinite(d.global) ? d.global : Math.round(ps.reduce((s, p) => s + p.prob, 0) / Math.max(1, ps.length));
    const informe = [`ARAÑA DETECTORA DE IA · ${r.titulo}`, r.url, new Date().toLocaleString('es'), '', `PROBABILIDAD GLOBAL: ${global}% (estimación, no prueba)`, d.veredicto, '',
      ...ps.map(p => { const b = parr.find(x => x.i === p.i); return `[${p.prob}%] ${(p.senales || []).join(' · ')}\n   «${b.texto.replace(/\s+/g, ' ').slice(0, 220)}…»`; })].join('\n');
    const archivo = guardarInforme('ia', r.titulo, informe, { url: r.url, global });
    return `🕷 Detectora de IA en "${r.titulo}": ${global}% de probabilidad global de texto generado por IA (es una estimación, no una prueba).\n${d.veredicto}\n` +
      `${marcas.filter(m => m.etiqueta.startsWith('IA')).length} de ${parr.length} párrafos marcados en magenta en la página.\nInforme: ${archivo}`;
  }

  async function codigo(t, a) {
    const r = await orden(t.id, 'soltar', { tipo: 'codigo', color: TIPOS.codigo.color });
    const bl = r.bloques.filter(b => b.t === 'codigo').slice(0, 14);
    if (!bl.length) { recogerLuego(t.id, 'codigo', 3000); return `🕷 La araña de código no encontró bloques de código en "${r.titulo}".`; }
    const d = await JSONm('Eres la araña de código de APOLO: revisas código para encontrar fallos de SEGURIDAD y bugs graves (defensivo: explicas el riesgo y cómo arreglarlo, nunca escribes exploits). ' +
      'Mira: inyección SQL/comandos, XSS, eval/exec con datos externos, deserialización insegura, secretos o claves en el código, criptografía débil, rutas sin validar (path traversal), SSRF, CORS abierto, falta de autenticación, condiciones de carrera, dependencias peligrosas.' +
      ' No inventes: si el código está bien, dilo.',
      `PÁGINA: ${r.titulo} (${r.url})\n${a.consulta ? `FOCO: ${a.consulta}\n` : ''}\nBLOQUES DE CÓDIGO:\n${recorte(bl.map(b => `[${b.i}]\n${b.texto.slice(0, 6000)}`), 30000)}\n\n` +
      'Devuelve el lenguaje, un resumen y los hallazgos (i del bloque, severidad critica|alta|media|baja, tipo corto, frase exacta del código donde está, explicación y arreglo).',
      { type: 'object', properties: { lenguaje: { type: 'string' }, resumen: { type: 'string' },
        hallazgos: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, severidad: { type: 'string', enum: ['critica', 'alta', 'media', 'baja'] }, tipo: { type: 'string' },
          frase: { type: 'string' }, explicacion: { type: 'string' }, arreglo: { type: 'string' } }, required: ['i', 'severidad', 'tipo', 'explicacion'] } } }, required: ['resumen', 'hallazgos'] });
    const hs = (d.hallazgos || []).filter(h => bl.some(b => b.i === h.i));
    await orden(t.id, 'marcar', { tipo: 'codigo', marcas: hs.map(h => ({ i: h.i, frase: h.frase, color: SEV[h.severidad] || SEV.media, etiqueta: `${h.severidad.toUpperCase()} · ${String(h.tipo).slice(0, 22)}` })) }).catch(() => { });
    recogerLuego(t.id, 'codigo', 12_000);
    const orden2 = ['critica', 'alta', 'media', 'baja'];
    hs.sort((x, y) => orden2.indexOf(x.severidad) - orden2.indexOf(y.severidad));
    const informe = [`ARAÑA DE CÓDIGO · ${r.titulo}`, r.url, new Date().toLocaleString('es'), `Lenguaje: ${d.lenguaje || '?'} · ${bl.length} bloques`, '', d.resumen, '',
      ...hs.map(h => `[${h.severidad.toUpperCase()}] ${h.tipo}\n   Dónde: ${h.frase || `bloque ${h.i}`}\n   Riesgo: ${h.explicacion}\n   Arreglo: ${h.arreglo || '-'}\n`)].join('\n');
    const archivo = guardarInforme('codigo', r.titulo, informe, { url: r.url, hallazgos: hs.length });
    const cuenta = orden2.map(s => [s, hs.filter(h => h.severidad === s).length]).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ');
    return `🕷 Araña de código en "${r.titulo}" (${d.lenguaje || 'código'}, ${bl.length} bloques): ${hs.length ? cuenta : 'sin fallos claros'}.\n${d.resumen}\n` +
      hs.slice(0, 5).map(h => `• [${h.severidad}] ${h.tipo}: ${h.explicacion}`).join('\n') + `\nInforme con los arreglos: ${archivo}`;
  }

  // ---------- araña de Discord (bot CONTROL-COMANDER en la Pi) ----------
  const sshPorDefecto = (host, args) => new Promise((ok, mal) => {
    const p = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, 'python3', '-', args], { windowsHide: true });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill(); mal(new Error('la Pi tardó demasiado (3 min)')); }, 180_000);
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(t); mal(e); });
    p.on('close', code => { clearTimeout(t); code === 0 ? ok(out) : mal(new Error(`ssh ${host} salió con ${code}: ${err.trim().slice(-300)}`)); });
    p.stdin.end(PY_DISCORD);
  });
  async function discord(a) {
    const dc = conf().discord || {};
    const host = dc.ssh || 'dmn@192.168.1.127';
    const horas = Math.max(1, Math.min(Number(a.horas) || 24, 168));
    const args = Buffer.from(JSON.stringify({ horas, servidor: a.servidor || '', canal: a.canal || '', env: dc.env, maxCanales: dc.maxCanales || 40, maxMensajes: dc.maxMensajes || 200 })).toString('base64');
    const crudo = await (ejecutarSsh || sshPorDefecto)(host, args);
    let j; try { j = JSON.parse(String(crudo).trim().split('\n').pop()); } catch { throw new Error(`respuesta rara de la Pi: ${String(crudo).slice(0, 200)}`); }
    if (j.error) throw new Error(j.error);
    const srvs = j.servidores || [];
    if (!srvs.length) return `🕷 La araña de Discord no encontró servidores${a.servidor ? ` que casen con "${a.servidor}"` : ''} donde esté el bot.`;
    const volcado = [], informes = [];
    for (const g of srvs) {
      const n = g.canales.reduce((s, c) => s + c.mensajes.length, 0);
      volcado.push(`\n######## ${g.nombre} (${n} mensajes, últimas ${horas} h)`);
      for (const c of g.canales) { volcado.push(`\n## #${c.nombre}`); for (const m of c.mensajes) volcado.push(`[${m.t}] ${m.a}${m.bot ? ' (bot)' : ''}: ${m.c}${m.adj ? ` [${m.adj} adjunto(s)]` : ''}${m.emb.length ? ` [embed: ${m.emb.join(' / ')}]` : ''}`); }
      if (!n) { informes.push({ g, d: null, n }); continue; }
      const lineas = []; for (const c of g.canales) for (const m of c.mensajes.slice(-60)) if (!m.bot || m.c) lineas.push(`#${c.nombre} [${m.t.slice(11)}] ${m.a}: ${m.c.replace(/\s+/g, ' ').slice(0, 300)}`);
      let d = null;
      try {
        d = await JSONm('Eres la araña de Discord de APOLO: resumes la actividad reciente de un servidor de Discord para su dueño, en español. Sin inventar: solo lo que está en los mensajes.',
          `SERVIDOR: ${g.nombre}\n${a.consulta ? `LO QUE BUSCA EL USUARIO: ${a.consulta}\n` : ''}MENSAJES (últimas ${horas} h, de más viejo a más nuevo):\n${recorte(lineas.slice(-500).reverse(), 22000).split('\n').reverse().join('\n')}\n\n` +
          'Devuelve: resumen, temas, pendientes (preguntas o pedidos SIN respuesta, quién y en qué canal), destacados (lo importante o lo que encaja con lo que busca) y enlaces útiles.',
          { type: 'object', properties: { resumen: { type: 'string' }, temas: { type: 'array', items: { type: 'string' } },
            pendientes: { type: 'array', items: { type: 'object', properties: { canal: { type: 'string' }, quien: { type: 'string' }, que: { type: 'string' } }, required: ['que'] } },
            destacados: { type: 'array', items: { type: 'object', properties: { canal: { type: 'string' }, quien: { type: 'string' }, texto: { type: 'string' } }, required: ['texto'] } },
            enlaces: { type: 'array', items: { type: 'string' } } }, required: ['resumen'] });
      } catch (e) { d = { resumen: `(no pude resumir: ${e.message})` }; }
      informes.push({ g, d, n });
    }
    const txt = [`ARAÑA DE DISCORD · ${new Date().toLocaleString('es')} · últimas ${horas} h${a.consulta ? ` · busca: ${a.consulta}` : ''}`,
      ...informes.map(({ g, d, n }) => [`\n==== ${g.nombre} · ${n} mensajes ====`, d ? d.resumen : '(sin actividad)', ...(d?.temas || []).map(x => `• tema: ${x}`),
        ...(d?.pendientes || []).map(p => `⚠ pendiente ${p.canal ? `#${p.canal.replace(/^#/, '')} ` : ''}${p.quien ? `(${p.quien}) ` : ''}${p.que}`),
        ...(d?.destacados || []).map(p => `★ ${p.canal ? `#${p.canal.replace(/^#/, '')} ` : ''}${p.quien ? `${p.quien}: ` : ''}${p.texto}`), ...(d?.enlaces || []).map(x => `🔗 ${x}`)].join('\n')),
      ...(j.errores?.length ? ['\nSin acceso (permisos del bot): ' + j.errores.join(', ')] : []), '\n' + '='.repeat(60), 'MENSAJES', ...volcado].join('\n');
    const total = informes.reduce((s, x) => s + x.n, 0);
    const archivo = guardarInforme('discord', a.servidor || `${srvs.length} servidores`, txt, { mensajes: total });
    return `🕷 La araña de Discord recorrió ${srvs.length} servidor(es) · ${total} mensajes de las últimas ${horas} h.\n` +
      informes.filter(x => x.d).map(({ g, d }) => `\n**${g.nombre}**: ${d.resumen}${(d.pendientes || []).length ? `\n  ⚠ ${d.pendientes.length} sin responder: ${d.pendientes.slice(0, 3).map(p => p.que).join(' · ')}` : ''}`).join('') +
      `\n\nInforme completo: ${archivo}`;
  }

  // ---------- araña radar (GitHub + Hugging Face) ----------
  async function getJSON(url, headers = {}) {
    const r = await fetchX(url, { headers: { 'user-agent': 'APOLO-aranas', accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw Object.assign(new Error(`${r.status} en ${new URL(url).hostname}`), { status: r.status });
    return r.json();
  }
  async function radar(a) {
    const rc = conf().radar || {};
    const dias = Math.max(1, Math.min(Number(a.dias) || rc.dias || 7, 60));
    const fecha = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
    const tokGH = secreto('srv:github'), tokHF = secreto('srv:huggingface');
    const hGH = tokGH ? { authorization: `Bearer ${tokGH}` } : {}, hHF = tokHF ? { authorization: `Bearer ${tokHF}` } : {};
    const temas = (Array.isArray(a.temas) && a.temas.length ? a.temas : rc.temas || TEMAS_RADAR).slice(0, tokGH ? 14 : 8);
    const items = [], avisos = [];
    const gh = async (q, n, etiqueta) => {
      try {
        const j = await getJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${n}`, hGH);
        for (const x of j.items || []) items.push({ id: `gh:${x.full_name}`, fuente: 'GitHub', etiqueta, nombre: x.full_name, url: x.html_url, desc: x.description || '', n: x.stargazers_count, unidad: '★', lang: x.language || '', creado: x.created_at });
      } catch (e) { avisos.push(`GitHub (${etiqueta}): ${e.message}${e.status === 403 ? ' — límite de búsquedas; conecta GitHub en Configuración para más' : ''}`); }
    };
    await gh(`created:>${fecha}`, 15, 'top nuevos');
    for (const tm of temas) await gh(`topic:${tm} created:>${fecha}`, 5, tm);
    const hf = async (ruta, tipo, n) => {
      try {
        const j = await getJSON(`https://huggingface.co/api/${ruta}`, hHF);
        for (const x of (Array.isArray(j) ? j : []).slice(0, n)) {
          if (tipo === 'paper') { const p = x.paper || {}; items.push({ id: `hfp:${p.id}`, fuente: 'HF papers', etiqueta: 'paper', nombre: x.title || p.title, url: `https://huggingface.co/papers/${p.id}`, desc: (p.summary || '').slice(0, 300), n: p.upvotes || 0, unidad: '▲' }); continue; }
          const base = tipo === 'model' ? '' : `${tipo}s/`;
          items.push({ id: `hf${tipo[0]}:${x.id}`, fuente: `HF ${tipo}`, etiqueta: x.pipeline_tag || x.sdk || tipo, nombre: x.id, url: `https://huggingface.co/${base}${x.id}`, desc: (x.tags || []).filter(t => !/^(region|license|endpoints|autotrain|arxiv)/.test(t)).slice(0, 6).join(', '), n: x.likes || 0, unidad: '♥', tendencia: x.trendingScore, creado: x.createdAt });
        }
      } catch (e) { avisos.push(`Hugging Face (${tipo}): ${e.message}`); }
    };
    await Promise.all([hf('models?sort=trendingScore&limit=25', 'model', 25), hf('spaces?sort=trendingScore&limit=15', 'space', 15),
      hf('datasets?sort=trendingScore&limit=8', 'dataset', 8), hf('daily_papers?limit=12', 'paper', 12)]);
    // solo lo nuevo de verdad: lo que ya enseñó otra vuelta se marca como visto
    const vistoRuta = path.join(dirDatos(), 'radar-visto.json');
    let visto = {}; try { visto = JSON.parse(fs.readFileSync(vistoRuta, 'utf8')); } catch { }
    const unicos = [...new Map(items.map(x => [x.id, x])).values()];
    for (const x of unicos) { x.nuevo = !visto[x.id]; if (!visto[x.id]) visto[x.id] = Date.now(); }
    const corte = Date.now() - 90 * 864e5; for (const k of Object.keys(visto)) if (visto[k] < corte) delete visto[k];
    fs.writeFileSync(vistoRuta, JSON.stringify(visto));
    if (!unicos.length) throw new Error(`no pude traer nada (${avisos.join(' · ')})`);
    const nuevos = unicos.filter(x => x.nuevo);
    const candidatos = (nuevos.length >= 8 ? nuevos : unicos).slice(0, 140);
    let d = { titular: '', top: [], tendencias: [] };
    try {
      d = await JSONm('Eres la araña radar de APOLO: cada día revisas lo nuevo de GitHub y Hugging Face y eliges lo que de verdad le sirve al usuario. Español, directo, sin hype. No inventes repos: solo de la lista.',
        `INTERESES DEL USUARIO: ${rc.intereses || INTERESES}\n${a.consulta ? `HOY BUSCA: ${a.consulta}\n` : ''}\nLISTA (fuente · nombre · métrica · descripción · url):\n` +
        candidatos.map(x => `${x.fuente} · ${x.nombre} · ${x.n}${x.unidad}${x.lang ? ` · ${x.lang}` : ''} · ${x.desc.slice(0, 160)} · ${x.url}`).join('\n') +
        '\n\nDevuelve: un titular de una frase, el top 10 (nombre EXACTO de la lista, url, por qué le sirve en una frase, categoría) y 3-5 tendencias que se ven.',
        { type: 'object', properties: { titular: { type: 'string' }, tendencias: { type: 'array', items: { type: 'string' } },
          top: { type: 'array', items: { type: 'object', properties: { nombre: { type: 'string' }, url: { type: 'string' }, porque: { type: 'string' }, categoria: { type: 'string' } }, required: ['nombre', 'porque'] } } }, required: ['titular', 'top'] });
    } catch (e) { d.titular = `(no pude elegir: ${e.message})`; }
    const top = (d.top || []).map(t => ({ ...t, x: unicos.find(u => u.nombre === t.nombre || u.url === t.url) })).filter(t => t.x).slice(0, 10);
    const grupos = {}; for (const x of unicos) (grupos[x.fuente] ||= []).push(x);
    const txt = [`ARAÑA RADAR · ${new Date().toLocaleString('es')} · últimos ${dias} días · ${unicos.length} cosas (${nuevos.length} nuevas desde la última vuelta)`, '', d.titular, '',
      'TOP PARA TI', ...top.map((t, k) => `${k + 1}. ${t.x.nombre} (${t.x.fuente}, ${t.x.n}${t.x.unidad})${t.categoria ? ` [${t.categoria}]` : ''}\n   ${t.porque}\n   ${t.x.url}`),
      '', 'TENDENCIAS', ...(d.tendencias || []).map(x => `• ${x}`), ...(avisos.length ? ['', 'AVISOS', ...avisos] : []),
      ...Object.entries(grupos).flatMap(([f, xs]) => ['', `==== ${f} ====`, ...xs.sort((p, q) => q.n - p.n).map(x => `${x.nuevo ? '🆕 ' : '   '}${x.nombre} · ${x.n}${x.unidad}${x.etiqueta ? ` · ${x.etiqueta}` : ''}\n      ${x.desc.slice(0, 200)}\n      ${x.url}`)])].join('\n');
    const archivo = guardarInforme('radar', `${dias} dias`, txt, { cosas: unicos.length, nuevas: nuevos.length });
    return `🕷 Radar (GitHub + Hugging Face, últimos ${dias} días): ${unicos.length} cosas, ${nuevos.length} nuevas desde la última vuelta.\n${d.titular}\n\n` +
      top.map((t, k) => `${k + 1}. ${t.x.nombre} (${t.x.n}${t.x.unidad}) — ${t.porque}\n   ${t.x.url}`).join('\n') +
      ((d.tendencias || []).length ? `\n\nTendencias: ${d.tendencias.join(' · ')}` : '') + (avisos.length ? `\n(avisos: ${avisos.slice(0, 3).join(' · ')})` : '') + `\n\nInforme completo: ${archivo}`;
  }

  // ---------- soltar ----------
  async function soltar(a = {}, s = null) {
    const tipo = TIPOS[a.tipo] ? a.tipo : 'lectora';
    if (corriendo.has(tipo)) throw new Error(`la araña ${TIPOS[tipo].nombre} ya está trabajando`);
    corriendo.set(tipo, { desde: Date.now() });
    try {
      if (TIPOS[tipo].web) {
        if (!navegador?.conectado?.()) throw new Error('la extensión del navegador no está conectada (Chrome con la extensión de APOLO, versión 0.4.0 o más nueva)');
        if (a.url) {                                     // un enlace: se abre en una pestaña nueva y ahí se sueltan
          let url = String(a.url).trim(); if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
          if (!/^https?:/i.test(url)) throw new Error('solo abro direcciones http(s)');
          if (navegador.protegido(url, '')) throw new Error(`"${dominio(url)}" es un sitio protegido: ahí no suelto arañas`);
          await permisoSitio(s, url);
          const nt = await navegador.orden('abrir', { url, pestana: null, grupo: cfg.nombreGrupo || null }, 45_000);
          a = { ...a, pestana: nt.id };
          await new Promise(ok => setTimeout(ok, 1200));
        }
        const t = await pestanaObjetivo(a.pestana);
        await permisoSitio(s, t.url);
        salen(tipo, dominio(t.url));
        try { return await ({ lectora, ia, codigo })[tipo](t, a, s); }
        catch (e) { orden(t.id, 'recoger', { tipo }).catch(() => { }); vuelven(tipo); throw e; }
      }
      salen(tipo, tipo === 'discord' ? 'Discord' : 'GitHub + Hugging Face');
      try { const r = tipo === 'discord' ? await discord(a) : await radar(a); vuelven(tipo, r.split('\n')[0]); return r; }
      catch (e) { vuelven(tipo); throw e; }
    } finally { corriendo.delete(tipo); }
  }

  async function http(M, p, b = {}, q = {}) {   // /v1/aranas
    if (M === 'GET' && !p[2]) return { tipos: TIPOS, trabajando: [...corriendo.keys()], informes: leerIndice().slice(0, 40), extension: !!navegador?.conectado?.() };
    if (M === 'GET' && p[2] === 'informe') {
      const inf = leerIndice().find(x => x.id === (q.id || p[3]));
      if (!inf || !fs.existsSync(inf.archivo)) throw Object.assign(new Error('no existe'), { status: 404 });
      return { ...inf, texto: fs.readFileSync(inf.archivo, 'utf8').slice(0, 400_000) };
    }
    if (M === 'POST' && !p[2]) return { resultado: await soltar(b, null) };
    throw Object.assign(new Error('ruta desconocida'), { status: 404 });
  }

  return { soltar, http, tipos: TIPOS, informes: leerIndice, trabajando: () => [...corriendo.keys()] };
}

// ---------- herramientas del agente ----------
const INSTANCIAS = new WeakMap();
const HERRAMIENTAS = [
  {
    nombre: 'arana_soltar',
    descripcion: 'Suelta una ARAÑA DIGITAL de APOLO (salen del casco y rastrean). tipo: ' +
      '"lectora" = camina por el texto de la página abierta en el navegador y la guarda entera en .txt con resumen (paginas: 2-20 para libros/artículos con botón "siguiente"); ' +
      '"ia" = marca en la página los párrafos que parecen escritos por IA (estimación); ' +
      '"codigo" = revisa el código de la página (GitHub, docs, foros) buscando fallos de seguridad y cómo arreglarlos; ' +
      '"discord" = lee los servidores donde está el bot CONTROL-COMANDER (servidor, canal, horas, consulta) y resume temas, preguntas sin responder y destacados; ' +
      '"radar" = lo nuevo y en tendencia de GitHub y Hugging Face (repos, modelos, spaces, papers) elegido para el usuario (dias, temas, consulta). ' +
      'Las de página usan la pestaña activa (o "pestana") del navegador con la extensión. Tardan de 10 s a 2 min.',
    parametros: { type: 'object', properties: {
      tipo: { type: 'string', enum: Object.keys(TIPOS) },
      url: { type: 'string', description: 'enlace a abrir y escanear (si no, la pestaña activa)' },
      pestana: { type: 'number', description: 'id de pestaña (opcional; si no, la activa)' },
      paginas: { type: 'integer', description: 'lectora: cuántas páginas seguir con "siguiente" (1-20)' },
      consulta: { type: 'string', description: 'qué busca el usuario (foco del resumen)' },
      servidor: { type: 'string', description: 'discord: nombre o id del servidor (vacío = todos)' },
      canal: { type: 'string', description: 'discord: nombre o id del canal' },
      horas: { type: 'integer', description: 'discord: horas hacia atrás (1-168, por defecto 24)' },
      dias: { type: 'integer', description: 'radar: días hacia atrás (por defecto 7)' },
      temas: { type: 'array', items: { type: 'string' }, description: 'radar: topics de GitHub (llm, mcp, robotics…)' } }, required: ['tipo'] },
    // las de página piden permiso por sitio dentro; discord lee mensajes privados de servidores → pregunta (admite "siempre")
    riesgo: a => (a?.tipo === 'discord' ? 'escritura' : 'lectura'),
    resumen: a => `araña ${a.tipo}${a.servidor ? ` · ${a.servidor}` : ''}${a.consulta ? ` · ${a.consulta}` : ''}`,
    ejecutar: async (a, ctx) => {
      const R = INSTANCIAS.get(ctx?.cfg); if (!R) return 'error: las arañas no están disponibles aquí';
      try { return await R.soltar(a || {}, ctx?.sesion || null); } catch (e) { return `error: ${e.message}`; }
    },
  },
  {
    nombre: 'aranas_informes', riesgo: 'lectura',
    descripcion: 'Lista los últimos informes de las arañas (tipo, título, archivo .txt) o, con id, devuelve el texto de uno.',
    parametros: { type: 'object', properties: { id: { type: 'string' }, tipo: { type: 'string' } } },
    resumen: a => a.id || a.tipo || '',
    ejecutar: async (a, ctx) => {
      const R = INSTANCIAS.get(ctx?.cfg); if (!R) return 'error: las arañas no están disponibles aquí';
      const l = R.informes().filter(x => !a.tipo || x.tipo === a.tipo);
      if (a.id) { const x = l.find(y => y.id === a.id); if (!x) return `error: no existe el informe ${a.id}`; try { return fs.readFileSync(x.archivo, 'utf8').slice(0, 20_000); } catch (e) { return `error: ${e.message}`; } }
      return l.slice(0, 20).map(x => `${x.id} · ${x.tipo} · ${x.titulo} · ${new Date(x.fecha).toLocaleString('es')}\n  ${x.archivo}`).join('\n') || '(todavía no hay informes)';
    },
  },
];
function crear(opciones) { const R = crearAranas(opciones); INSTANCIAS.set(opciones.cfg, R); return R; }

module.exports = { crearAranas: crear, HERRAMIENTAS, TIPOS, PY_DISCORD };
