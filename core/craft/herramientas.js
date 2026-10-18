// Recetas fijas de la suite como herramientas del agente: en vez de improvisar comandos app por app, el modelo decide el
// contenido y la receta (probada) lo ejecuta igual cada vez. Todas leen el kit de marca.
//   kit_marca · revisar_calidad · hacer_miniatura (PhotoCraft) · masterizar_audio (SoundCraft) · rotulo_animado / titulo_animado (EffectCraft)
//   clips_medal: buscar/traer los clips del usuario en Medal (core/craft/medal.js)
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');

function crearHerramientasCraft({ mcpLocales, cfg }) {
  const kits = require('./kit').crearKits({ cfg });
  const miniaturas = require('./miniatura').crearMiniaturas({ mcpLocales, cfg });
  const audio = require('./audio').crearAudio({ mcpLocales, cfg });
  const marca = require('./marca');
  const kitDe = id => (id ? kits.obtener(id) : kits.obtener(kits.ids()[0]));
  const conEffectCraft = () => !!mcpLocales.obtener('effectcraft')?.activo;
  const destino = (a, ctx, nombre) => {
    const dir = a.carpeta ? path.resolve(ctx.cwd || os.homedir(), a.carpeta) : path.join(os.homedir(), 'Videos', 'APOLO', 'piezas');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, nombre);
  };
  // la pieza se renderiza en la caché (una por contenido) y se copia a donde la quiera el usuario
  const copiar = (origen, a, ctx, nombre) => { const d = destino(a, ctx, nombre); fs.copyFileSync(origen, d); return d; };
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pieza';
  const cache = n => path.join(cfg?.dir || path.join(os.homedir(), '.apolo'), 'craft', n);

  const ROTULO = {
    nombre: 'rotulo_animado', riesgo: 'escritura',
    descripcion: 'Rótulo animado (lower third) con EffectCraft y los colores/fuente del kit de marca: barra de acento que se despliega, placa con el NOMBRE y placa con el SUB (@usuario, cargo, "saludos a…"). '
      + 'Sale un WebM VP9 con transparencia (1080×300, 60 fps, al doble si escala 2) listo para ponerlo encima en FilmCraft (timeline.place en una pista de vídeo libre). Receta fija y probada.',
    parametros: { type: 'object', properties: {
      nombre: { type: 'string' }, sub: { type: 'string' }, duracion: { type: 'number', description: 's (2–10, por defecto 4)' },
      kit: { type: 'string' }, escala: { type: 'number', description: '1 (1080 de ancho) o 2 (nítido en 4K)' }, carpeta: { type: 'string' },
    }, required: ['nombre'] },
    resumen: a => String(a.nombre || ''),
    disponible: conEffectCraft,
    ejecutar: async (a, ctx = {}) => {
      const k = kitDe(a.kit);
      ctx.progreso?.('EffectCraft monta y renderiza el rótulo (~10 s)');
      const webm = await marca.asegurarRotulo({ nombre: a.nombre, sub: a.sub || '', duracion: a.duracion, escala: a.escala === 2 ? 2 : 1, colores: k?.colores, fuente: k?.fuente,
        carpeta: cache('rotulos'), mcpLocales, ffmpeg: cfg?.craft?.ffmpeg });
      return `Rótulo: ${copiar(webm, a, ctx, `rotulo-${slug(a.nombre)}.webm`)} (WebM con transparencia; en FilmCraft: media_import + timeline.place en una pista de vídeo encima; a escala 2 ponlo al 50 %)`;
    },
  };
  const TITULO = {
    nombre: 'titulo_animado', riesgo: 'escritura',
    descripcion: 'Título animado de 1–2 líneas con EffectCraft y los colores del kit (placas inclinadas que entran con golpe, destello que cruza el texto y salida). '
      + 'WebM VP9 con transparencia (1080×560, al doble si escala 2) para el principio de un vídeo. Receta fija y probada (la de los clips de LAGCTRUCKS).',
    parametros: { type: 'object', properties: {
      linea1: { type: 'string' }, linea2: { type: 'string' }, duracion: { type: 'number', description: 's (1,5–8, por defecto 3,5)' },
      kit: { type: 'string' }, escala: { type: 'number' }, carpeta: { type: 'string' },
    }, required: ['linea1'] },
    resumen: a => [a.linea1, a.linea2].filter(Boolean).join(' / '),
    disponible: conEffectCraft,
    ejecutar: async (a, ctx = {}) => {
      const k = kitDe(a.kit);
      ctx.progreso?.('EffectCraft monta y renderiza el título (~1 min)');
      const webm = await marca.asegurarTitulo({ linea1: String(a.linea1).toLocaleUpperCase('es'), linea2: String(a.linea2 || '').toLocaleUpperCase('es'), duracion: a.duracion,
        escala: a.escala === 2 ? 2 : 1, colores: k?.colores, carpeta: cache('titulos'), mcpLocales, ffmpeg: cfg?.craft?.ffmpeg });
      return `Título: ${copiar(webm, a, ctx, `titulo-${slug(a.linea1)}.webm`)} (WebM con transparencia; en FilmCraft: media_import + timeline.place encima del vídeo)`;
    },
  };

  const medal = require('./medal').crearMedal({ cfg });   // clips y capturas del usuario en Medal
  const HERRAMIENTAS = [kits.HERRAMIENTA, require('./calidad').crearHerramienta({ cfg, kits }), miniaturas.HERRAMIENTA, audio.HERRAMIENTA, ROTULO, TITULO, medal.HERRAMIENTA];
  return { kits, miniaturas, audio, medal, HERRAMIENTAS };
}

module.exports = { crearHerramientasCraft };
