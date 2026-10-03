// Modo Gamer · limpieza segura: temporales y cachés de shaders (se regeneran solas). analizar() SOLO mide;
// limpiar(ids) borra SOLO las zonas elegidas, salta lo que esté en uso y nunca sigue enlaces/junctions.
const fs = require('fs');
const path = require('path');

function zonas(env) {
  const la = env.LOCALAPPDATA;
  return [
    { id: 'temp', nombre: 'Temporales (%TEMP%)', ruta: env.TEMP || env.TMP },
    { id: 'd3d', nombre: 'Caché de shaders DirectX', ruta: la && path.join(la, 'D3DSCache') },
    { id: 'nv-dx', nombre: 'Caché DirectX de NVIDIA', ruta: la && path.join(la, 'NVIDIA', 'DXCache') },
    { id: 'nv-gl', nombre: 'Caché OpenGL de NVIDIA', ruta: la && path.join(la, 'NVIDIA', 'GLCache') },
    { id: 'amd-dx', nombre: 'Caché DirectX de AMD', ruta: la && path.join(la, 'AMD', 'DxCache') },
  ].filter(z => z.ruta && path.isAbsolute(z.ruta) && path.parse(z.ruta).root !== path.resolve(z.ruta));   // nunca la raíz de un disco
}

async function medir(dir) {                                        // {bytes, archivos} sin seguir enlaces
  let bytes = 0, archivos = 0;
  const pila = [dir];
  while (pila.length) {
    const d = pila.pop();
    let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const r = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) pila.push(r);
      else if (e.isFile()) { try { bytes += (await fs.promises.lstat(r)).size; archivos++; } catch { } }
    }
  }
  return { bytes, archivos };
}

async function vaciar(dir, out) {                                  // borra el CONTENIDO (la carpeta raíz se queda)
  let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const r = path.join(dir, e.name);
    if (e.isSymbolicLink()) { out.saltados++; continue; }        // un junction en %TEMP% podría apuntar a cualquier sitio: no se toca
    if (e.isDirectory()) { await vaciar(r, out); try { await fs.promises.rmdir(r); } catch { } continue; }
    if (!e.isFile()) continue;
    try { const { size } = await fs.promises.lstat(r); await fs.promises.unlink(r); out.liberados += size; out.borrados++; }
    catch { out.saltados++; }                                     // en uso (EBUSY/EPERM): se salta
  }
}

function crearLimpieza({ entorno = process.env } = {}) {
  const lista = () => zonas(entorno);
  async function analizar() {
    return Promise.all(lista().map(async z => {
      const existe = fs.existsSync(z.ruta);
      return { ...z, existe, ...(existe ? await medir(z.ruta) : { bytes: 0, archivos: 0 }) };
    }));
  }
  async function limpiar(ids = []) {
    const elegidas = lista().filter(z => [].concat(ids).includes(z.id));
    const total = { liberados: 0, borrados: 0, saltados: 0, zonas: {} };
    for (const z of elegidas) {
      const out = { liberados: 0, borrados: 0, saltados: 0 };
      if (fs.existsSync(z.ruta)) await vaciar(z.ruta, out);
      total.zonas[z.id] = out;
      total.liberados += out.liberados; total.borrados += out.borrados; total.saltados += out.saltados;
    }
    return total;
  }
  return { analizar, limpiar, zonas: lista };
}

module.exports = { crearLimpieza };
