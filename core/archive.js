// Internet Archive (archive.org) para el agente: buscar, ver un elemento, leer libros por trozos, la Wayback Machine y guardar a disco.
// APIs públicas sin clave. archive.org a veces responde 5xx o "Temporarily Offline": se reintenta y si sigue, se dice claro.
const fs = require('fs');
const path = require('path');

const UA = 'APOLO/0.2 (+https://github.com/DMNENGINE/apolo)';
const TROZO = 20_000;
const TIPOS = ['texts', 'audio', 'movies', 'software', 'image', 'web', 'collection', 'data', 'etree'];
const idValido = id => /^[A-Za-z0-9._-]{1,200}$/.test(String(id || ''));
const mb = b => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const limpiarHtml = h => String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const uno = v => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));

function crearArchive({ fetch: f = globalThis.fetch, espera = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const textos = new Map();                                 // caché de los últimos libros leídos (id/archivo → texto)

  async function pedir(url, { signal, intentos = 3, crudo = false } = {}) {
    let ultimo = '';
    for (let i = 0; i < intentos; i++) {
      if (i) await espera(800 * i);
      let r;
      try { r = await f(url, { signal, redirect: 'follow', headers: { 'user-agent': UA } }); }
      catch (e) { if (signal?.aborted) throw e; ultimo = e.message; continue; }
      if (r.status === 404) throw new Error('no existe (404)');
      if (r.status === 403) throw new Error('acceso restringido (403): suele ser un libro de préstamo controlado o un elemento privado');
      if (r.status === 429) { ultimo = 'archive.org pide ir más despacio (429)'; await espera(3000); continue; }
      if (r.status >= 500) { ultimo = `archive.org falló (HTTP ${r.status})`; continue; }
      const txt = await r.text();
      if (/<title>Internet Archive: Temporarily Offline<\/title>/i.test(txt)) { ultimo = 'archive.org está temporalmente fuera de servicio'; continue; }
      return crudo ? { txt, url: r.url || url, status: r.status } : txt;
    }
    throw new Error(`${ultimo || 'sin respuesta'}; prueba otra vez en un rato`);
  }
  const json = async (url, o) => { const t = await pedir(url, o); try { return JSON.parse(t); } catch { throw new Error('archive.org devolvió algo que no es JSON'); } };

  async function buscar(a, ctx = {}) {
    const partes = [String(a.consulta || '').trim() || '*'];
    if (a.tipo && TIPOS.includes(a.tipo)) partes.push(`mediatype:${a.tipo}`);
    if (a.desde || a.hasta) partes.push(`year:[${parseInt(a.desde) || 0} TO ${parseInt(a.hasta) || 9999}]`);
    if (a.idioma) partes.push(`language:(${String(a.idioma).replace(/[()]/g, '')})`);
    const filas = Math.min(50, Math.max(1, parseInt(a.limite) || 15)), pagina = Math.max(1, parseInt(a.pagina) || 1);
    const q = new URLSearchParams({ q: partes.join(' AND '), rows: filas, page: pagina, output: 'json' });
    for (const c of ['identifier', 'title', 'year', 'mediatype', 'creator', 'downloads']) q.append('fl[]', c);
    if (a.orden !== 'relevancia') q.append('sort[]', 'downloads desc');
    const d = await json(`https://archive.org/advancedsearch.php?${q}`, ctx);
    const docs = d.response?.docs || [], total = d.response?.numFound || 0;
    if (!docs.length) return `(nada en archive.org para «${a.consulta}»)`;
    return `${total} resultados en archive.org (página ${pagina}, ${docs.length}):\n` + docs.map(x =>
      `${x.identifier} · ${uno(x.mediatype)} · ${uno(x.title).slice(0, 140)}${x.year ? ` (${x.year})` : ''}${x.creator ? ` — ${uno(x.creator).slice(0, 60)}` : ''}${x.downloads ? ` · ${x.downloads} descargas` : ''}`).join('\n') +
      '\n\nPara ver uno: archive_ver(id). Para leer un libro: archive_leer(id).';
  }

  async function metadatos(id, ctx) {
    if (!idValido(id)) throw new Error('id no válido (es el identificador de archive.org, ej. "donquijote00cervuoft")');
    const d = await json(`https://archive.org/metadata/${id}`, ctx);
    if (!d || !d.metadata) throw new Error(`no existe ningún elemento "${id}" en archive.org`);
    return d;
  }

  async function ver(a, ctx = {}) {
    const d = await metadatos(a.id, ctx), m = d.metadata;
    const files = (d.files || []).filter(x => x.source === 'original' || /djvu\.txt$|\.txt$|\.pdf$|\.epub$|\.mp3$|\.mp4$/i.test(x.name))
      .filter(x => !/^__ia_thumb|_meta\.xml$|_files\.xml$|_reviews\.xml$|\.sqlite$|_archive\.torrent$/i.test(x.name));
    const restringido = m['access-restricted-item'] === 'true' || m['access-restricted-item'] === true;
    return [
      `${m.identifier} · ${uno(m.mediatype)} · ${uno(m.title)}`,
      m.creator && `autor: ${uno(m.creator)}`, m.date && `fecha: ${uno(m.date)}`, m.language && `idioma: ${uno(m.language)}`,
      m.collection && `colecciones: ${uno(m.collection)}`, restringido && 'ACCESO RESTRINGIDO: préstamo controlado, el texto completo no se puede descargar',
      m.description && `descripción: ${limpiarHtml(uno(m.description)).slice(0, 1500)}`,
      `página: https://archive.org/details/${m.identifier}`,
      `archivos (${files.length}):`, ...files.slice(0, 40).map(x => `  ${x.name} · ${x.format || ''}${x.size ? ` · ${mb(+x.size)}` : ''}`),
      files.length > 40 && `  …y ${files.length - 40} más`,
    ].filter(Boolean).join('\n');
  }

  // el texto de un libro: el _djvu.txt (OCR) o el .txt que tenga
  async function texto(id, archivo, ctx) {
    const clave = `${id}/${archivo || ''}`;
    if (textos.has(clave)) return textos.get(clave);
    let nombre = archivo;
    if (!nombre) {
      const d = await metadatos(id, ctx), fs_ = d.files || [];
      nombre = (fs_.find(x => /_djvu\.txt$/i.test(x.name)) || fs_.find(x => /\.txt$/i.test(x.name) && !/_meta|_files|_reviews/i.test(x.name)))?.name;
      if (!nombre) throw new Error(`"${id}" no tiene texto legible (ni _djvu.txt ni .txt). Mira sus archivos con archive_ver`);
    }
    const t = (await pedir(`https://archive.org/download/${id}/${encodeURIComponent(nombre).replace(/%2F/g, '/')}`, ctx)).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    textos.set(clave, { t, nombre });
    while (textos.size > 6) textos.delete(textos.keys().next().value);
    return textos.get(clave);
  }

  async function leer(a, ctx = {}) {
    if (!idValido(a.id)) return 'error: id no válido';
    const { t, nombre } = await texto(a.id, a.archivo, ctx);
    if (a.buscar) {
      // el OCR parte frases entre líneas y con guiones: las palabras se buscan separadas por cualquier espacio/salto
      const palabras = String(a.buscar).trim().split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const re = new RegExp(palabras.join('[\\s\\-¬]+'), 'gi'), trozos = [];
      for (let m; (m = re.exec(t)) && trozos.length < 15;)
        trozos.push(`[pos ${m.index}] …${t.slice(Math.max(0, m.index - 250), m.index + m[0].length + 250).replace(/\s+/g, ' ')}…`);
      return trozos.length ? `«${a.buscar}» en ${nombre} (${t.length} caracteres), primeras ${trozos.length}:\n${trozos.join('\n\n')}\n\nPara leer alrededor: archive_leer(id, desde=pos)` : `«${a.buscar}» no aparece en ${nombre}`;
    }
    const desde = Math.max(0, Math.min(t.length, parseInt(a.desde) || 0)), cuanto = Math.min(40_000, Math.max(1000, parseInt(a.caracteres) || TROZO));
    const hasta = Math.min(t.length, desde + cuanto);
    return `[${nombre}: caracteres ${desde}–${hasta} de ${t.length}${hasta < t.length ? `; sigue con desde=${hasta}` : '; fin'}]\n${t.slice(desde, hasta)}`;
  }

  async function wayback(a, ctx = {}) {
    let url = String(a.url || '').trim();
    if (!url) return 'error: falta url';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    const fecha = String(a.fecha || '').replace(/\D/g, '').slice(0, 14);
    if (a.listar) {
      const q = new URLSearchParams({ url: url.replace(/^https?:\/\//i, ''), output: 'json', limit: Math.min(200, parseInt(a.limite) || 40), filter: 'statuscode:200', collapse: `timestamp:${a.por === 'dia' ? 8 : a.por === 'anio' ? 4 : 6}` });
      if (fecha) q.set('from', fecha.slice(0, 4));
      const filas = await json(`https://web.archive.org/cdx/search/cdx?${q}`, ctx);
      if (!filas.length) return `(la Wayback Machine no tiene capturas de ${url})`;
      return `capturas de ${url} (una por ${a.por || 'mes'}):\n` + filas.slice(1).map(r => `${r[1].slice(0, 4)}-${r[1].slice(4, 6)}-${r[1].slice(6, 8)} · ${r[1]} · ${r[2]}`).join('\n') +
        '\n\nPara verla: archive_wayback(url, fecha=<timestamp>)';
    }
    // /web/<fecha>id_/<url> redirige a la captura más cercana; id_ = la página original sin la barra de la Wayback
    const r = await pedir(`https://web.archive.org/web/${fecha || '2'}id_/${url}`, { ...ctx, crudo: true });
    const ts = (r.url.match(/\/web\/(\d{8,14})/) || [])[1];
    const txt = limpiarHtml(r.txt);
    return `[Wayback ${ts ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : '(fecha desconocida)'} · ${url} · https://web.archive.org/web/${ts || fecha || ''}/${url}]\n` +
      (txt.length > TROZO ? txt.slice(0, TROZO) + `\n…[recortado, ${txt.length - TROZO} caracteres más]` : txt || '(la captura no tiene texto)');
  }

  async function guardar(a, ctx = {}) {
    const d = await metadatos(a.id, ctx), m = d.metadata, files = d.files || [];
    let elegidos;
    if (a.archivo) elegidos = files.filter(x => x.name === a.archivo);
    else elegidos = [files.find(x => /_djvu\.txt$/i.test(x.name)) || files.find(x => x.source === 'original' && !/\.(xml|sqlite|torrent)$|^__ia_thumb/i.test(x.name))].filter(Boolean);
    if (!elegidos.length) return `error: no encuentro ${a.archivo ? `"${a.archivo}"` : 'un archivo principal'} en ${a.id}; mira la lista con archive_ver`;
    const max = (parseFloat(a.max_mb) || 500) * 1e6, x = elegidos[0];
    if (+x.size > max) return `error: ${x.name} pesa ${mb(+x.size)} (más que el límite de ${mb(max)}); pásale max_mb si de verdad lo quieres`;
    const dir = path.join(ctx.cfg?.dir || '.', 'archive', a.id);
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, path.basename(x.name));
    const r = await f(`https://archive.org/download/${a.id}/${encodeURIComponent(x.name).replace(/%2F/g, '/')}`, { signal: ctx.signal, redirect: 'follow', headers: { 'user-agent': UA } });
    if (!r.ok) return `error: la descarga falló (HTTP ${r.status})${r.status === 403 ? ': acceso restringido' : ''}`;
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    let extra = '';
    if (a.recordar && ctx.memoria) {
      const rec = ctx.memoria.recordar({ tipo: 'hecho', texto: `El usuario guardó de archive.org «${uno(m.title).slice(0, 160)}»${m.creator ? ` de ${uno(m.creator).slice(0, 80)}` : ''}${m.date ? ` (${uno(m.date)})` : ''} [${a.id}] en ${destino}`, origen: 'archive.org' });
      extra = `; recuerdo ${rec.id} ${rec.accion}`;
    }
    return `guardado ${destino} (${mb(fs.statSync(destino).size)})${extra}`;
  }

  const ok = fn => async (a, ctx) => { try { return await fn(a || {}, ctx || {}); } catch (e) { if (ctx?.signal?.aborted) throw e; return `error: ${e.message}`; } };
  const HERRAMIENTAS = [
    {
      nombre: 'archive_buscar', riesgo: 'lectura',
      descripcion: 'Busca en Internet Archive (archive.org): millones de libros, textos, audio, música, vídeo, películas, software y colecciones de dominio público. ' +
        'Devuelve id, tipo, título, año y autor. Admite sintaxis de búsqueda de archive.org (title:"…", creator:…, subject:…).',
      parametros: { type: 'object', properties: {
        consulta: { type: 'string' },
        tipo: { type: 'string', enum: TIPOS, description: 'texts = libros/documentos, movies = vídeo, audio, software…' },
        desde: { type: 'integer', description: 'año mínimo' }, hasta: { type: 'integer', description: 'año máximo' },
        idioma: { type: 'string', description: 'ej. Spanish, English' },
        orden: { type: 'string', enum: ['descargas', 'relevancia'] },
        limite: { type: 'integer' }, pagina: { type: 'integer' },
      }, required: ['consulta'] },
      resumen: a => `${a.consulta}${a.tipo ? ` (${a.tipo})` : ''}`,
      ejecutar: ok(buscar),
    },
    {
      nombre: 'archive_ver', riesgo: 'lectura',
      descripcion: 'Muestra los datos de un elemento de archive.org (título, autor, fecha, descripción, colecciones) y la lista de sus archivos.',
      parametros: { type: 'object', properties: { id: { type: 'string', description: 'identificador del elemento' } }, required: ['id'] },
      resumen: a => a.id,
      ejecutar: ok(ver),
    },
    {
      nombre: 'archive_leer', riesgo: 'lectura',
      descripcion: 'Lee el texto completo de un libro o documento de archive.org por trozos (desde/caracteres), o busca una palabra dentro (buscar) y devuelve los pasajes con su posición.',
      parametros: { type: 'object', properties: {
        id: { type: 'string' }, archivo: { type: 'string', description: 'opcional: un .txt concreto del elemento' },
        desde: { type: 'integer', description: 'carácter por el que empezar (0 por defecto)' }, caracteres: { type: 'integer', description: 'cuántos (20000 por defecto, máx. 40000)' },
        buscar: { type: 'string', description: 'texto a buscar dentro del libro' },
      }, required: ['id'] },
      resumen: a => `${a.id}${a.buscar ? ` «${a.buscar}»` : a.desde ? ` desde ${a.desde}` : ''}`,
      ejecutar: ok(leer),
    },
    {
      nombre: 'archive_wayback', riesgo: 'lectura',
      descripcion: 'Wayback Machine: devuelve el texto de una web tal como era en una fecha (la captura más cercana), o con listar=true la lista de capturas que existen.',
      parametros: { type: 'object', properties: {
        url: { type: 'string' }, fecha: { type: 'string', description: 'AAAA, AAAAMM, AAAAMMDD o un timestamp completo; sin fecha = la más antigua' },
        listar: { type: 'boolean' }, por: { type: 'string', enum: ['dia', 'mes', 'anio'] }, limite: { type: 'integer' },
      }, required: ['url'] },
      resumen: a => `${a.url}${a.fecha ? ` @${a.fecha}` : ''}${a.listar ? ' (capturas)' : ''}`,
      ejecutar: ok(wayback),
    },
    {
      nombre: 'archive_guardar', riesgo: 'escritura',
      descripcion: 'Descarga un archivo de un elemento de archive.org a la carpeta de APOLO (por defecto su texto o su archivo original). Con recordar=true lo apunta en la memoria.',
      parametros: { type: 'object', properties: {
        id: { type: 'string' }, archivo: { type: 'string', description: 'opcional: nombre exacto del archivo (ver archive_ver)' },
        max_mb: { type: 'number', description: 'límite de tamaño, 500 por defecto' }, recordar: { type: 'boolean' },
      }, required: ['id'] },
      resumen: a => `${a.id}${a.archivo ? `/${a.archivo}` : ''}`,
      ejecutar: ok(guardar),
    },
  ];
  return { HERRAMIENTAS, buscar, ver, leer, wayback, guardar };
}

module.exports = { crearArchive, HERRAMIENTAS: crearArchive().HERRAMIENTAS };
