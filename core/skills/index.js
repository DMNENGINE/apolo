// Motor de skills: almacén + instalador + índice/selección (+ escáner, que vive en ./escaner.js).
//   crearSkills({ cfg, bus, generarJSON, embedder, modelo, escaner, tokenGithub })
//     modelo: () => 'proveedor/modelo' para las explicaciones del escáner
//     escaner: opcional (tests); si no, require('./escaner') perezoso
//     tokenGithub: () => token del conector de GitHub (opcional; nunca se imprime)
//     ejecutarEval: async ({modelo, texto, signal}) => respuesta (taller: evals en sesiones efímeras)
const path = require('path');
const { crearAlmacen } = require('./almacen');
const { crearInstalador } = require('./instalar');
const { crearIndice } = require('./indice');
const { crearTaller } = require('./taller');
const { crearMarketplace } = require('./marketplace');
const { slugDe } = require('./formato');

function crearSkills({ cfg, bus, generarJSON, embedder = null, modelo, escaner, tokenGithub, ejecutarEval, fetchMarketplace }) {
  const almacen = crearAlmacen({ cfg, bus });
  const elEscaner = () => {
    if (escaner) return escaner;
    const { crearEscaner } = require('./escaner');                // perezoso: lo escribe otro módulo
    return crearEscaner({ generarJSON, modelo: typeof modelo === 'function' ? modelo() : modelo || cfg.modeloPorDefecto });
  };
  const instalador = crearInstalador({ almacen, cfg, escaner: elEscaner, tokenGithub });
  const indice = crearIndice({ cfg, almacen, embedder });
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
    return f;
  }
  // ¿un script de esta skill debe preguntarse SIEMPRE? (sin permisos declarados o escaneo no verde)
  function motivoPreguntar(nombre) {
    const s = almacen.obtener(String(nombre || '')); if (!s) return 'skill desconocida';
    if (s.escaneo?.nivel !== 'verde') return `script de la skill "${s.slug}" (escaneo ${s.escaneo?.nivel || 'pendiente'})`;
    if (!s.permisos?.some(p => /^(ejecucion|ejecución|scripts?|\*)$/i.test(p))) return `script de la skill "${s.slug}" (no declara permiso de ejecución)`;
    return '';
  }

  return {
    almacen, instalador, indice, taller, marketplace, catalogo, ficha: id => marketplace.ficha(id), activa, rutaDentro, motivoPreguntar, publica,
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
