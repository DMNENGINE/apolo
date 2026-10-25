// Motor de skills: almacén + instalador + índice/selección (+ escáner, que vive en ./escaner.js).
//   crearSkills({ cfg, bus, generarJSON, embedder, modelo, escaner, tokenGithub })
//     modelo: () => 'proveedor/modelo' para las explicaciones del escáner
//     escaner: opcional (tests); si no, require('./escaner') perezoso
//     tokenGithub: () => token del conector de GitHub (opcional; nunca se imprime)
//     ejecutarEval: async ({modelo, texto, signal}) => respuesta (taller: evals en sesiones efímeras)
const fs = require('fs');
const path = require('path');
const { crearAlmacen } = require('./almacen');
const { crearInstalador } = require('./instalar');
const { crearIndice } = require('./indice');
const { crearTaller } = require('./taller');
const { crearMarketplace } = require('./marketplace');
const { slugDe } = require('./formato');
const rutas = require('../rutas-seguras');

function crearSkills({ cfg, bus, generarJSON, embedder = null, modelo, escaner, tokenGithub, ejecutarEval, fetchMarketplace, canalesActivos }) {
  const almacen = crearAlmacen({ cfg, bus });
  const elEscaner = () => {
    if (escaner) return escaner;
    const { crearEscaner } = require('./escaner');                // perezoso: lo escribe otro módulo
    return crearEscaner({ generarJSON, modelo: typeof modelo === 'function' ? modelo() : modelo || cfg.modeloPorDefecto });
  };
  const instalador = crearInstalador({ almacen, cfg, escaner: elEscaner, tokenGithub });
  const indice = crearIndice({ cfg, almacen, embedder, canalesActivos });
  const taller = crearTaller({ cfg, bus, almacen, instalador, generarJSON, modelo, ejecutar: ejecutarEval });
  const marketplace = crearMarketplace({ cfg, fetch: fetchMarketplace || ((...a) => globalThis.fetch(...a)), tokenGithub });
  // catálogo con "instalada": misma fuente de origen (GitHub owner/repo/ruta) o mismo slug
  async function catalogo(o) {
    const c = await marketplace.catalogo(o), L = almacen.lista().filter(s => !s.externa);
    const norm = f => String(f || '').toLowerCase().replace(/^https?:\/\/github\.com\//, '').replace(/\/(tree|blob)\/[^/]+/, '').replace(/@.*$/, '').replace(/\/+$/, '');
    return { ...c, entradas: c.entradas.map(e => {
      if (e.tipo !== 'skill') return e;
      const s = L.find(x => (x.origen?.fuente && norm(x.origen.fuente) === norm(e.fuente)) || x.slug === slugDe(e.nombre));
      return s ? { ...e, instalada: s.slug } : e;
    }) };
  }

  // vista pública (API / panel)
  const publica = s => s && ({ slug: s.slug, nombre: s.nombre, descripcion: s.descripcion, activa: s.activa, origen: s.origen, externa: s.externa,
    version: s.version, escaneo: s.escaneo, firma: s.firma, usos: s.usos, ultimoUso: s.ultimoUso, permisos: s.permisos, archivos: s.archivos,
    disparadores: s.disparadores, modelos: s.modelos, canales: s.canales, licencia: s.licencia, autor: s.autor, sha: s.sha, fecha: s.fecha, borrador: s.borrador, evals: s.evals, mejorada: s.mejorada });

  // para las herramientas: la skill debe existir y estar activa
  function activa(nombre) {
    const s = almacen.obtener(String(nombre || '').trim());
    if (!s) throw new Error(`no hay ninguna skill "${nombre}" (usa ver_skills)`);
    if (!s.activa) throw new Error(`la skill "${s.slug}" está desactivada: el usuario debe activarla en el panel (Skills) o con /skill on ${s.slug}`);
    return s;
  }
  // ruta dentro de la carpeta de la skill (sin salir con ../ ni rutas absolutas)
  function rutaDentro(s, rel) {
    const r = String(rel || '').replace(/\\/g, '/');
    if (!r || path.isAbsolute(r) || /^[a-z]:/i.test(r) || r.split('/').includes('..')) throw new Error('ruta no válida: debe ser relativa a la carpeta de la skill y sin ".."');
    const f = path.resolve(s.dir, r);
    if (!f.startsWith(path.resolve(s.dir) + path.sep)) throw new Error('ruta fuera de la skill');
    const real = rutas.rutaReal(f), base = rutas.rutaReal(s.dir);
    if (!rutas.dentro(real, base) || real === base) throw new Error('ruta fuera de la skill (enlace)');
    return real;
  }
  // datos propios de la skill en <skill>/_datos/ (lo que aprende con el uso: sobrevive a las actualizaciones,
  // el escáner y la exportación no lo tocan). modo 'añadir' (al final) | 'reemplazar'
  function anotar(nombre, archivo, texto, modo = 'añadir') {
    const s = activa(nombre), a = String(archivo || '').trim();
    if (s.externa) throw new Error('la skill externa es de solo lectura; no se modifica desde APOLO');
    if (!/^[\w.-]{1,60}\.(md|txt|json|jsonl)$/i.test(a) || a.startsWith('.')) throw new Error('archivo no válido: un nombre simple .md, .txt, .json o .jsonl (sin carpetas)');
    const t = String(texto ?? ''); if (!t.trim()) throw new Error('texto vacío');
    const dir = rutaDentro(s, '_datos'), f = rutaDentro(s, `_datos/${a}`);
    if (!rutas.dentro(f, dir)) throw new Error('ruta fuera de los datos de la skill');
    fs.mkdirSync(dir, { recursive: true });
    if (rutaDentro(s, `_datos/${a}`) !== f) throw new Error('la ruta de la skill cambio antes de escribir');
    const antes = fs.existsSync(f) ? fs.statSync(f).size : 0;
    const anadir = modo !== 'reemplazar';
    if ((anadir ? antes : 0) + Buffer.byteLength(t) > 2 * 1024 * 1024) throw new Error('el archivo pasaría de 2 MB');
    if (anadir) fs.appendFileSync(f, (antes ? '\n' : '') + t.replace(/\s+$/, '') + '\n'); else fs.writeFileSync(f, t);
    return { ruta: `_datos/${a}`, bytes: fs.statSync(f).size };
  }
  // ¿un script de esta skill debe preguntarse SIEMPRE? (sin permisos declarados o escaneo no verde)
  function motivoPreguntar(nombre) {
    const s = almacen.obtener(String(nombre || '')); if (!s) return 'skill desconocida';
    if (s.escaneo?.nivel !== 'verde') return `script de la skill "${s.slug}" (escaneo ${s.escaneo?.nivel || 'pendiente'})`;
    if (!s.permisos?.some(p => /^(ejecucion|ejecución|scripts?|\*)$/i.test(p))) return `script de la skill "${s.slug}" (no declara permiso de ejecución)`;
    return '';
  }

  return {
    almacen, instalador, indice, taller, marketplace, catalogo, ficha: id => marketplace.ficha(id), activa, rutaDentro, anotar, motivoPreguntar, publica,
    lista: () => almacen.lista().map(publica),
    obtener: slug => { const s = almacen.obtener(slug); if (!s) return null; const c = almacen.contenido(s.slug); return { ...publica(s), contenido: c?.contenido || '' }; },
    instalar: (fuente, o) => instalador.instalar(fuente, o).then(r => (r.skill ? { skill: publica(r.skill) } : r)),
    instalarTexto: o => instalador.instalarTexto(o).then(publica),
    activar: (slug, on, o) => instalador.activar(slug, on, o).then(publica),
    escanear: slug => instalador.escanear(slug),
    actualizar: (slug, o) => instalador.actualizar(slug, o),
    borrar: slug => almacen.borrar(slug),
    seccion: o => indice.seccion(o),
  };
}

module.exports = { crearSkills };
