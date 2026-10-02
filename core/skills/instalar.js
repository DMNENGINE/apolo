// Instalador de skills. Fuentes:
//   carpeta local (con SKILL.md o con varias skills dentro) · archivo .zip/.skill · URL directa a un zip o a un SKILL.md
//   GitHub: "owner/repo[/ruta][@ref]", https://github.com/owner/repo[/tree/<ref>/<ruta>], …/blob/<ref>/<ruta>/SKILL.md, raw.githubusercontent.com
// Un "#nombre" al final elige una skill concreta si la fuente trae varias; sin él, se devuelven las opciones.
// Toda skill nueva queda DESACTIVADA y se escanea (escaner.js). actualizar(slug) muestra el diff antes de aplicar.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { leerSkill, buscarSkills, componerSkillMd, parsearSkillMd, listarArchivos, slugDe } = require('./formato');

const MAX_DESCARGA = 150 * 1024 * 1024, MAX_SKILL = 50 * 1024 * 1024, MAX_ARCHIVOS = 3000;
const ejecutar = (bin, args, o = {}) => new Promise((ok, mal) => execFile(bin, args, { windowsHide: true, timeout: 120_000, maxBuffer: 8e6, ...o }, (e, so, se) => (e ? mal(new Error(String(se || e.message).trim().slice(0, 300))) : ok(so))));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-skill-'));

// ---------- descomprimir (tar de Windows 10+ entiende zip; respaldo PowerShell / unzip) ----------
async function descomprimir(archivo, destino) {
  fs.mkdirSync(destino, { recursive: true });
  const intentos = process.platform === 'win32'
    ? [() => ejecutar(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archivo, '-C', destino]),
      () => { let z = archivo; if (!/\.zip$/i.test(z)) { z = archivo + '.zip'; fs.copyFileSync(archivo, z); }
        return ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${z.replace(/'/g, "''")}' -DestinationPath '${destino.replace(/'/g, "''")}' -Force`]); }]
    : [() => ejecutar('unzip', ['-q', '-o', archivo, '-d', destino]), () => ejecutar('tar', ['-xf', archivo, '-C', destino])];
  let err;
  for (const f of intentos) { try { await f(); limpiarEnlaces(destino); return destino; } catch (e) { err = e; } }
  throw new Error(`no pude descomprimir: ${err?.message}`);
}
// fuera enlaces simbólicos (un zip podría apuntar fuera de la carpeta)
function limpiarEnlaces(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isSymbolicLink()) fs.rmSync(f, { force: true }); else if (e.isDirectory()) limpiarEnlaces(f);
  }
}

// ---------- descargas ----------
async function descargar(url, { headers = {}, signal } = {}) {
  const r = await fetch(url, { headers: { 'user-agent': 'APOLO-skills', ...headers }, signal: signal || AbortSignal.timeout(120_000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} al descargar ${url.replace(/[?#].*$/, '')}${r.status === 403 || r.status === 429 ? ' (límite de la API de GitHub: conecta tu token en Conexiones)' : ''}`);
  const len = +r.headers.get('content-length') || 0;
  if (len > MAX_DESCARGA) throw new Error('descarga demasiado grande');
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > MAX_DESCARGA) throw new Error('descarga demasiado grande');
  return { buf: b, tipo: r.headers.get('content-type') || '' };
}
const esZip = b => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

// ---------- GitHub ----------
function parsearGithub(f) {
  let m = f.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/#]+)(?:\/([^#]*))?)?\/?(?:#(.+))?$/i);
  if (m) return { owner: m[1], repo: m[2], ref: m[3] || '', ruta: limpiaRel(m[4] || ''), nombre: m[5] || '' };
  m = f.match(/^https?:\/\/raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\/([^/]+)\/(.+)$/i);
  if (m) return { owner: m[1], repo: m[2], ref: m[3], ruta: limpiaRel(m[4]), nombre: '' };
  m = f.match(/^([\w.-]+)\/([\w.-]+)((?:\/[^@#\s]+)*)(?:@([^#\s]+))?(?:#(.+))?$/);
  if (m && !/^\./.test(m[1])) return { owner: m[1], repo: m[2], ruta: limpiaRel(m[3] || ''), ref: m[4] || '', nombre: m[5] || '' };
  return null;
}
const limpiaRel = r => String(r).replace(/\\/g, '/').split('/').filter(p => p && p !== '.' && p !== '..').join('/').replace(/\/?(SKILL|skill)\.md$/, '');

function crearInstalador({ almacen, cfg, escaner, tokenGithub }) {
  const sk = () => cfg.skills || {};
  const ghHeaders = () => {
    let t = sk().githubToken || '';
    if (!t && sk().usarTokenGithub !== false) { try { t = tokenGithub?.() || ''; } catch { } }
    return { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(t ? { authorization: 'Bearer ' + t } : {}) };
  };

  // fuente → { raiz (carpeta temporal o local), base (para describir el origen), sha?, limpiar }
  async function traer(fuente) {
    let f = String(fuente || '').trim(), nombre = '';
    if (!f) throw new Error('falta la fuente');
    const h = f.lastIndexOf('#');
    if (h > 0 && !fs.existsSync(f) && (fs.existsSync(f.slice(0, h)) || /^https?:/i.test(f))) { nombre = f.slice(h + 1).trim(); f = f.slice(0, h).trim(); }
    // local
    if (fs.existsSync(f)) {
      const abs = path.resolve(f), st = fs.statSync(abs);
      if (st.isDirectory()) return { raiz: abs, base: { tipo: 'local', fuente: abs }, nombre, limpiar: () => { } };
      if (/\.(zip|skill)$/i.test(abs) || esZip(fs.readFileSync(abs).subarray(0, 4))) {
        const t = tmp(); await descomprimir(abs, path.join(t, 'x'));
        return { raiz: path.join(t, 'x'), base: { tipo: 'zip', fuente: abs }, nombre, limpiar: () => fs.rmSync(t, { recursive: true, force: true }) };
      }
      if (/\.md$/i.test(abs)) return { raiz: path.dirname(abs), base: { tipo: 'local', fuente: path.dirname(abs) }, nombre, limpiar: () => { } };
      throw new Error('archivo no reconocido (usa una carpeta, .zip, .skill o SKILL.md)');
    }
    const gh = parsearGithub(fuente.trim());
    if (gh) return traerGithub({ ...gh, nombre: gh.nombre || nombre });
    if (/^https?:\/\//i.test(f)) {
      const { buf } = await descargar(f);
      const t = tmp();
      if (esZip(buf)) { fs.writeFileSync(path.join(t, 'a.zip'), buf); await descomprimir(path.join(t, 'a.zip'), path.join(t, 'x')); }
      else {
        const txt = buf.toString('utf8');
        if (!/^\uFEFF?---\s*\r?\n/.test(txt)) { fs.rmSync(t, { recursive: true, force: true }); throw new Error('la URL no es un zip ni un SKILL.md con frontmatter'); }
        const n = slugDe(parsearSkillMd(txt).datos.name) || 'skill';
        fs.mkdirSync(path.join(t, 'x', n), { recursive: true }); fs.writeFileSync(path.join(t, 'x', n, 'SKILL.md'), txt);
      }
      return { raiz: path.join(t, 'x'), base: { tipo: 'url', fuente: f }, nombre, limpiar: () => fs.rmSync(t, { recursive: true, force: true }) };
    }
    throw new Error(`no entiendo la fuente "${fuente}" (carpeta, .zip, URL u owner/repo de GitHub)`);
  }

  async function traerGithub({ owner, repo, ref, ruta, nombre }) {
    const api = `https://api.github.com/repos/${owner}/${repo}`;
    let sha = '';
    try {
      const r = await fetch(`${api}/commits/${encodeURIComponent(ref || 'HEAD')}`, { headers: { ...ghHeaders(), accept: 'application/vnd.github.sha', 'user-agent': 'APOLO-skills' }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 404) throw new Error(`GitHub: no encuentro ${owner}/${repo}${ref ? '@' + ref : ''}`);
      if (r.ok) sha = (await r.text()).trim();
      else if (r.status === 403 || r.status === 429) throw new Error('límite de la API de GitHub alcanzado: conecta tu token de GitHub en Conexiones o espera una hora');
    } catch (e) { if (/GitHub|límite/.test(e.message)) throw e; }
    const { buf } = await descargar(`${api}/zipball/${encodeURIComponent(sha || ref || 'HEAD')}`, { headers: ghHeaders() });
    const t = tmp();
    try {
      fs.writeFileSync(path.join(t, 'repo.zip'), buf);
      await descomprimir(path.join(t, 'repo.zip'), path.join(t, 'x'));
      const tops = fs.readdirSync(path.join(t, 'x')).filter(x => fs.statSync(path.join(t, 'x', x)).isDirectory());
      const top = path.join(t, 'x', tops.length === 1 ? tops[0] : '');
      if (!sha && tops.length === 1) sha = tops[0].split('-').pop();
      const raiz = path.join(top, ruta);
      if (!raiz.startsWith(top) || !fs.existsSync(raiz)) throw new Error(`la ruta "${ruta}" no existe en ${owner}/${repo}`);
      return { raiz, repoRaiz: top, base: { tipo: 'github', owner, repo, ref: ref || '', ruta, fuente: `${owner}/${repo}` }, sha, nombre, limpiar: () => fs.rmSync(t, { recursive: true, force: true }) };
    } catch (e) { fs.rmSync(t, { recursive: true, force: true }); throw e; }
  }

  // qué skill de la fuente se instala: una sola → esa; varias → la de "nombre" o la lista de opciones
  function elegir(tr) {
    const dirs = buscarSkills(tr.raiz);
    if (!dirs.length) throw new Error('no hay ningún SKILL.md en la fuente');
    const info = dirs.map(d => ({ d, s: leerSkill(d) })).filter(x => x.s);
    if (tr.nombre) {
      const q = slugDe(tr.nombre);
      const x = info.find(x => x.s.slug === q || slugDe(path.basename(x.d)) === q || x.s.nombre.toLowerCase() === tr.nombre.toLowerCase());
      if (!x) throw new Error(`la fuente no trae ninguna skill "${tr.nombre}" (hay: ${info.map(x => x.s.nombre).slice(0, 30).join(', ')})`);
      return x;
    }
    if (info.length === 1) return info[0];
    return {
      opciones: info.map(x => {
        const rel = path.relative(tr.repoRaiz || tr.raiz, x.d).split(path.sep).join('/');
        const b = tr.base;
        const fuente = b.tipo === 'github' ? `${b.owner}/${b.repo}/${rel}${b.ref ? '@' + b.ref : ''}` : b.tipo === 'local' ? path.join(b.fuente, rel) : `${b.fuente}#${x.s.nombre}`;
        return { nombre: x.s.nombre, slug: x.s.slug, descripcion: x.s.descripcion.slice(0, 300), ruta: rel, fuente };
      }),
    };
  }
  const origenDe = (tr, d) => {
    const b = tr.base;
    if (b.tipo === 'github') { const rel = path.relative(tr.repoRaiz, d).split(path.sep).join('/'); return { ...b, ruta: rel, fuente: `${b.owner}/${b.repo}/${rel}${b.ref ? '@' + b.ref : ''}` }; }
    if (b.tipo === 'local') return { ...b, fuente: d };
    return { ...b, nombre: leerSkill(d)?.nombre };
  };

  function comprobarTamano(d) {
    const fs_ = listarArchivos(d, MAX_ARCHIVOS + 1);
    if (fs_.length > MAX_ARCHIVOS) throw new Error(`la skill tiene demasiados archivos (> ${MAX_ARCHIVOS})`);
    const total = fs_.reduce((n, a) => n + fs.statSync(path.join(d, a)).size, 0);
    if (total > MAX_SKILL) throw new Error(`la skill es demasiado grande (${Math.round(total / 1048576)} MB)`);
  }
  const copiar = (de, a) => fs.cpSync(de, a, { recursive: true, filter: s => { const b = path.basename(s); return b !== '.git' && b !== 'instalado.json' && !fs.lstatSync(s).isSymbolicLink(); } });
  function hashCarpeta(d) {
    const h = crypto.createHash('sha256');
    for (const a of listarArchivos(d, MAX_ARCHIVOS)) h.update(a + '\0').update(fs.readFileSync(path.join(d, a))).update('\0');
    return h.digest('hex').slice(0, 16);
  }

  // ---------- escaneo ----------
  async function escanear(slug) {
    const s = almacen.obtener(slug); if (!s) throw new Error(`no existe la skill "${slug}"`);
    let r;
    try {
      const e = typeof escaner === 'function' ? escaner() : escaner;
      if (!e) throw new Error('el escáner no está disponible');
      r = await e.escanear(s.dir);
      r = { nivel: ['verde', 'amarillo', 'rojo'].includes(r?.nivel) ? r.nivel : 'amarillo', hallazgos: Array.isArray(r?.hallazgos) ? r.hallazgos.slice(0, 200) : [], resumen: String(r?.resumen || ''), explicacion: String(r?.explicacion || '') };
    } catch (e) { r = { nivel: 'amarillo', hallazgos: [], resumen: `no se pudo escanear: ${e.message}`, explicacion: '', error: true }; }
    r.fecha = Date.now();
    const cambios = { escaneo: r };
    if (r.nivel === 'rojo' && s.activa) cambios.activa = false;           // un escaneo rojo la apaga
    almacen.actualizarEstado(s.slug, cambios);
    return r;
  }

  // ---------- instalar ----------
  async function instalar(fuente, { reemplazar = false } = {}) {
    const tr = await traer(fuente);
    try {
      const x = elegir(tr);
      if (x.opciones) return { opciones: x.opciones };
      comprobarTamano(x.d);
      const origen = origenDe(tr, x.d);
      const ya = almacen.lista().find(s => !s.externa && (s.slug === x.s.slug || (s.origen?.fuente && s.origen.fuente === origen.fuente)));
      if (ya && !reemplazar) throw new Error(`la skill "${ya.slug}" ya está instalada (usa actualizar)`);
      const slug = ya ? ya.slug : almacen.libre(x.s.slug || 'skill');
      const destino = path.join(almacen.dir, slug);
      if (ya) fs.rmSync(destino, { recursive: true, force: true });
      copiar(x.d, destino);
      almacen.escribirInstalado(slug, { origen, sha: tr.sha || null, hash: hashCarpeta(destino), version: x.s.apolo.version || '', fecha: Date.now(), activa: false, escaneo: null, usos: 0, ultimoUso: null });
      almacen.avisar('instalada', slug);
      await escanear(slug);
      return { skill: almacen.obtener(slug) };
    } finally { tr.limpiar(); }
  }

  // skill creada a partir de texto (importador de OpenClaw, taller)
  async function instalarTexto({ nombre, descripcion = '', contenido = '', origen = 'importado' }) {
    const slug = almacen.libre(slugDe(nombre) || 'skill');
    const d = path.join(almacen.dir, slug); fs.mkdirSync(d, { recursive: true });
    const txt = /^\uFEFF?---\s*\r?\n/.test(contenido) ? contenido : componerSkillMd({ name: slug, description: String(descripcion || `Skill importada (${nombre})`).replace(/\s+/g, ' ').slice(0, 1000) }, contenido);
    fs.writeFileSync(path.join(d, 'SKILL.md'), txt);
    almacen.escribirInstalado(slug, { origen: { tipo: 'importado', fuente: String(origen) }, sha: null, hash: hashCarpeta(d), version: '', fecha: Date.now(), activa: false, escaneo: null, usos: 0, ultimoUso: null });
    almacen.avisar('instalada', slug);
    await escanear(slug);
    return almacen.obtener(slug);
  }

  async function activar(slug, activa, { forzar = false } = {}) {
    let s = almacen.obtener(slug); if (!s) throw new Error(`no existe la skill "${slug}"`);
    if (activa && !s.escaneo) { await escanear(s.slug); s = almacen.obtener(s.slug); }
    if (activa && s.escaneo?.nivel === 'rojo' && !forzar) { const e = new Error('el escaneo es ROJO: para activarla igualmente confirma con forzar'); e.status = 409; throw e; }
    return almacen.actualizarEstado(s.slug, { activa: !!activa });
  }

  // ---------- actualizar: trae el origen, calcula el diff y (si aplicar) lo sustituye ----------
  async function actualizar(slug, { aplicar = false } = {}) {
    const s = almacen.obtener(slug); if (!s) throw new Error(`no existe la skill "${slug}"`);
    if (s.externa) throw new Error('es una skill externa: se actualiza desde su propia app');
    const o = s.origen || {};
    if (!['github', 'local', 'zip', 'url'].includes(o.tipo)) throw new Error('esta skill no tiene un origen desde el que actualizar');
    const fuente = o.tipo === 'github' ? `${o.owner}/${o.repo}/${o.ruta}${o.ref ? '@' + o.ref : ''}` : o.fuente;
    const tr = await traer(fuente);
    try {
      if (!tr.nombre) tr.nombre = (o.tipo === 'github' || o.tipo === 'local') && buscarSkills(tr.raiz).length === 1 ? '' : (o.nombre || s.nombre);
      const x = elegir(tr);
      if (x.opciones) throw new Error('el origen ahora trae varias skills');
      const diff = diffCarpetas(s.dir, x.d);
      if (!diff || !aplicar) return { diff, aplicado: false, alDia: !diff, sha: tr.sha || null };
      comprobarTamano(x.d);
      for (const a of fs.readdirSync(s.dir)) if (a !== 'instalado.json') fs.rmSync(path.join(s.dir, a), { recursive: true, force: true });
      copiar(x.d, s.dir);
      almacen.escribirInstalado(s.slug, { sha: tr.sha || null, hash: hashCarpeta(s.dir), version: x.s.apolo.version || '', actualizada: Date.now() });
      const r = await escanear(s.slug);
      if (r.nivel !== 'verde' && almacen.obtener(s.slug)?.activa) almacen.actualizarEstado(s.slug, { activa: false });   // cambió y no es verde: a revisar
      return { diff, aplicado: true, escaneo: r, sha: tr.sha || null };
    } finally { tr.limpiar(); }
  }

  return { instalar, instalarTexto, escanear, activar, actualizar, traer, elegir };
}

// ---------- diff de texto entre dos carpetas ----------
const esBinario = b => b.subarray(0, 8000).includes(0);
function diffLineas(a, b, ctx = 2) {
  const n = a.length, m = b.length, ops = [];
  if (n * m > 4e6) { a.forEach(l => ops.push('-' + l)); b.forEach(l => ops.push('+' + l)); }
  else {
    const T = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = a[i] === b[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { ops.push(' ' + a[i]); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) ops.push('-' + a[i++]); else ops.push('+' + b[j++]); }
    while (i < n) ops.push('-' + a[i++]); while (j < m) ops.push('+' + b[j++]);
  }
  const ver = ops.map(() => false);
  ops.forEach((o, k) => { if (o[0] !== ' ') for (let d = -ctx; d <= ctx; d++) if (ops[k + d] !== undefined) ver[k + d] = true; });
  const out = []; let salto = false;
  ops.forEach((o, k) => { if (ver[k]) { out.push(o); salto = false; } else if (!salto) { out.push('…'); salto = true; } });
  return out.join('\n');
}
function diffCarpetas(viejo, nuevo, max = 60_000) {
  const A = new Set(listarArchivos(viejo)), B = new Set(listarArchivos(nuevo)), partes = [];
  for (const f of [...new Set([...A, ...B])].sort()) {
    if (!B.has(f)) { partes.push(`--- ${f} (borrado)`); continue; }
    const bb = fs.readFileSync(path.join(nuevo, f));
    if (!A.has(f)) { partes.push(`+++ ${f} (nuevo)\n` + (esBinario(bb) ? '[binario]' : bb.toString('utf8').split(/\r?\n/).map(l => '+' + l).join('\n'))); continue; }
    const ab = fs.readFileSync(path.join(viejo, f));
    if (ab.equals(bb)) continue;
    if (esBinario(ab) || esBinario(bb)) { partes.push(`*** ${f} (binario cambiado)`); continue; }
    partes.push(`*** ${f}\n` + diffLineas(ab.toString('utf8').split(/\r?\n/), bb.toString('utf8').split(/\r?\n/)));
  }
  const t = partes.join('\n\n');
  return t.length > max ? t.slice(0, max) + '\n…[diff recortado]' : t;
}

module.exports = { crearInstalador, parsearGithub, descomprimir, diffCarpetas, diffLineas };
