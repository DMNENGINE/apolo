// Base de estilos de subtítulos animados para subtitular_video. 100 % propios: diseño nuestro y fuente nuestra (Trueno, core/craft/fuentes).
// Cada estilo = fuente + relleno/contorno/caja/sombra (parámetros de graphic_text de FilmCraft) + modo + animación de entrada.
//   modo: bloque   — el trozo entero aparece de golpe
//         karaoke  — el trozo entero visible y la palabra que se dice cambia de color
//         palabra  — una palabra cada vez, grande
//         acumula  — las palabras del trozo van apareciendo y se quedan
//   entrada (la animan keyframes de motion/opacity, centrados en el texto): ninguna | pop | rebote | subir | fundido
// Medidas pensadas para 1080 px de ancho (se escalan con el vídeo).
'use strict';

const ESTILOS = {
  clasico: {
    nombre: 'Clásico', descripcion: 'Trueno blanco con contorno negro y palabras clave en amarillo. Sin animación. El del clip 08.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 100, relleno: '#ffffff', contorno: { ancho: 10, color: '#000000' }, sombra: true,
    resaltado: '#ffd400', modo: 'bloque', entrada: 'ninguna',
  },
  pop: {
    nombre: 'Pop', descripcion: 'Como el clásico, pero cada trozo entra con un golpe de escala (80 → 108 → 100 %). Energía de TikTok.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 104, relleno: '#ffffff', contorno: { ancho: 10, color: '#000000' }, sombra: true,
    resaltado: '#ffd400', modo: 'bloque', entrada: 'pop',
  },
  karaoke: {
    nombre: 'Karaoke', descripcion: 'El trozo entero en pantalla y la palabra que dices se enciende en verde. Fácil de seguir.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 96, relleno: '#ffffff', contorno: { ancho: 9, color: '#000000' }, sombra: true,
    activo: '#3dff6e', resaltado: null, modo: 'karaoke', entrada: 'pop', maxPalabras: 4, maxLetras: 26,
  },
  palabra: {
    nombre: 'Palabra a palabra', descripcion: 'Una sola palabra gigante cada vez, con rebote. Máxima energía; para frases cortas y gritos.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 150, relleno: '#ffffff', contorno: { ancho: 12, color: '#000000' }, sombra: true,
    resaltado: '#ffd400', modo: 'palabra', entrada: 'rebote',
  },
  caja: {
    nombre: 'Caja', descripcion: 'Texto oscuro sobre una caja blanca redondeada que sube suave. Limpio, estilo Reels.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 76, relleno: '#111111', contorno: null, sombra: false, mayus: false,
    caja: { color: '#ffffff', opacidad: 100, radio: 18, tam: 22 },
    resaltado: '#e8174b', modo: 'bloque', entrada: 'subir', maxPalabras: 5, maxLetras: 30,
  },
  neon: {
    nombre: 'Neón', descripcion: 'Blanco con borde y brillo magenta, y la palabra activa en amarillo. Contrasta con fondos claros y la cabina teal.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 100, relleno: '#ffffff', contorno: { ancho: 6, color: '#ff1fb4' },
    brillo: { color: '#ff1fb4', difuminado: 26, tam: 12, opacidad: 100 },
    activo: '#ffe600', resaltado: null, modo: 'karaoke', entrada: 'fundido', maxPalabras: 3,
  },
  fuego: {
    nombre: 'Fuego', descripcion: 'Trueno amarillo con doble contorno (negro y naranja). Para momentos épicos y gaming.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 104, relleno: '#ffd400', contorno: { ancho: 10, color: '#000000' }, contorno2: { ancho: 8, color: '#ff5a00' }, sombra: true,
    resaltado: '#ffffff', modo: 'bloque', entrada: 'rebote',
  },
  acumula: {
    nombre: 'Acumulativo', descripcion: 'Las palabras del trozo aparecen una a una y se quedan; la última en amarillo. Ritmo de conversación.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 96, relleno: '#ffffff', contorno: { ancho: 9, color: '#000000' }, sombra: true,
    activo: '#ffd400', resaltado: null, modo: 'acumula', entrada: 'ninguna', maxPalabras: 4, maxLetras: 26,
  },
  minimal: {
    nombre: 'Minimal', descripcion: 'Blanco con sombra suave, sin contorno ni mayúsculas, fundido. Para vídeos tranquilos o de explicar.',
    fuente: 'Trueno', estiloFuente: 'Regular', tam: 70, relleno: '#ffffff', contorno: null, mayus: false,
    brillo: { color: '#000000', difuminado: 20, tam: 9, opacidad: 100 },
    resaltado: null, modo: 'bloque', entrada: 'fundido', maxPalabras: 6, maxLetras: 36,
  },

  // ── PAQUETE 2 · COLOR (con emojis propios) ──
  atardecer: {
    paquete: 'color', nombre: 'Atardecer', descripcion: 'Degradado amarillo → rosa con contorno morado y palabras clave en blanco. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 104, relleno: { de: '#ffd84a', a: '#ff3d8b', angulo: 90 }, contorno: { ancho: 9, color: '#2b0a3d' }, sombra: true,
    resaltado: '#ffffff', modo: 'bloque', entrada: 'pop', emojis: true,
  },
  hielo: {
    paquete: 'color', nombre: 'Hielo', descripcion: 'Blanco con contorno azul marino y halo celeste; clave en azul eléctrico. Sube suave. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 102, relleno: '#ffffff', contorno: { ancho: 9, color: '#0b2a6b' }, contorno2: { ancho: 9, color: '#9be8ff' }, sombra: false,
    resaltado: '#2f7bff', modo: 'bloque', entrada: 'subir', emojis: true,
  },
  retro: {
    paquete: 'color', nombre: 'Retro', descripcion: 'Crema con contorno marrón y sombra dura roja desplazada, como un cartel de los 70. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 104, relleno: '#fff1c9', contorno: { ancho: 8, color: '#3b1f0e' }, sombraDura: { color: '#e63946', distancia: 14, angulo: 135 },
    resaltado: '#e63946', modo: 'bloque', entrada: 'pop', emojis: true,
  },
  chicle: {
    paquete: 'color', nombre: 'Chicle', descripcion: 'Texto blanco en caja rosa chicle redondeada, clave en amarillo, con rebote. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 82, relleno: '#ffffff', contorno: null, sombra: false,
    caja: { color: '#ff4fa3', opacidad: 100, radio: 26, tam: 22 },
    resaltado: '#ffe600', modo: 'bloque', entrada: 'rebote', maxPalabras: 4, maxLetras: 28, emojis: true,
  },
  lima: {
    paquete: 'color', nombre: 'Lima', descripcion: 'Texto negro en caja verde lima; la palabra que dices en morado (karaoke). Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 82, relleno: '#111111', contorno: null, sombra: false,
    caja: { color: '#b6ff3b', opacidad: 100, radio: 14, tam: 20 },
    activo: '#7a00ff', resaltado: null, modo: 'karaoke', entrada: 'pop', maxPalabras: 4, maxLetras: 28, emojis: true,
  },
  oro: {
    paquete: 'color', nombre: 'Oro', descripcion: 'Degradado dorado con contorno chocolate y brillo cálido. Para logros, récords y momentos épicos. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 106, relleno: { de: '#fff6b0', a: '#d08a00', angulo: 90 }, contorno: { ancho: 9, color: '#3a2200' },
    brillo: { color: '#ffb300', difuminado: 22, tam: 6, opacidad: 80 },
    resaltado: '#ffffff', modo: 'bloque', entrada: 'rebote', emojis: true,
  },
  terror: {
    paquete: 'color', nombre: 'Terror', descripcion: 'Blanco hueso con aura roja; la palabra que dices en rojo sangre. Para los clips de la Llorona y fantasmas. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 100, relleno: '#efe9e1', contorno: { ancho: 7, color: '#000000' },
    brillo: { color: '#d00000', difuminado: 30, tam: 12, opacidad: 100 },
    activo: '#ff2020', resaltado: null, modo: 'karaoke', entrada: 'fundido', maxPalabras: 3, emojis: true,
  },
  arcoiris: {
    paquete: 'color', nombre: 'Arcoíris', descripcion: 'Cada palabra de un color vivo distinto, contorno negro grueso. Divertido y llamativo. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 104, relleno: '#ffffff', contorno: { ancho: 10, color: '#000000' }, sombra: true,
    colores: ['#ffe600', '#3dff6e', '#38d6ff', '#ff4fd8', '#ff8a1f'], resaltado: null, modo: 'bloque', entrada: 'pop', emojis: true,
  },
  noche: {
    paquete: 'color', nombre: 'Noche', descripcion: 'Píldora oscura semitransparente con texto blanco; la palabra que dices en verde menta. Elegante y legible. Emojis.',
    fuente: 'Trueno', estiloFuente: 'Black', tam: 80, relleno: '#ffffff', contorno: null, sombra: false,
    caja: { color: '#0d0f14', opacidad: 78, radio: 40, tam: 24 },
    activo: '#00ffa3', resaltado: null, modo: 'karaoke', entrada: 'subir', maxPalabras: 4, maxLetras: 28, emojis: true,
  },
};

// keyframes de entrada: [segundos desde el inicio del clip, escala %, opacidad %, desplazamiento y en px (a 1080)]
const ENTRADAS = {
  ninguna: [],
  pop: [[0, 80, 100, 0], [0.07, 108, 100, 0], [0.13, 100, 100, 0]],
  rebote: [[0, 40, 0, 0], [0.08, 118, 100, 0], [0.15, 94, 100, 0], [0.21, 100, 100, 0]],
  subir: [[0, 100, 0, 40], [0.16, 100, 100, 0]],
  fundido: [[0, 100, 0, 0], [0.15, 100, 100, 0]],
};

// propiedades de graphics.set para un estilo (k = escala por ancho del vídeo)
function props(e, k) {
  const p = { align: 'center', shadow: !!e.sombra || !!e.brillo || !!e.sombraDura };
  if (e.relleno && typeof e.relleno === 'object') Object.assign(p, { fill_kind: 1, fill_color: e.relleno.de, gradient_start: e.relleno.de, gradient_end: e.relleno.a, gradient_angle: e.relleno.angulo ?? 90 });
  else Object.assign(p, { fill_kind: 0, fill_color: e.relleno });
  if (e.sombraDura) Object.assign(p, { shadow_color: e.sombraDura.color, shadow_distance: Math.round(e.sombraDura.distancia * k), shadow_angle: e.sombraDura.angulo ?? 135, shadow_blur: 0, shadow_size: 0, shadow_opacity: 100 });
  p.stroke = !!e.contorno;
  if (e.contorno) Object.assign(p, { stroke_width: Math.round(e.contorno.ancho * k), stroke_color: e.contorno.color });
  // el 2.º contorno se dibuja detrás y su ancho cuenta desde la letra: tiene que sumar el del 1.º para asomar
  if (e.contorno2) Object.assign(p, { stroke2: true, stroke2_width: Math.round(((e.contorno?.ancho || 0) + e.contorno2.ancho) * k), stroke2_color: e.contorno2.color });
  if (e.brillo) Object.assign(p, { shadow_color: e.brillo.color, shadow_blur: Math.round(e.brillo.difuminado * k), shadow_size: Math.round(e.brillo.tam * k), shadow_distance: 0, shadow_opacity: e.brillo.opacidad });
  if (e.caja) Object.assign(p, { background: true, background_color: e.caja.color, background_opacity: e.caja.opacidad, background_radius: Math.round(e.caja.radio * k), background_size: Math.round(e.caja.tam * k) });
  if (e.estiloFuente) p.font_style = e.estiloFuente;
  return p;
}

function obtener(nombre) {
  if (nombre && typeof nombre === 'object') return { ...ESTILOS.clasico, ...nombre };       // estilo a medida
  const e = ESTILOS[String(nombre || 'clasico').toLowerCase()];
  if (!e) throw new Error(`no existe el estilo "${nombre}". Hay: ${Object.keys(ESTILOS).join(', ')}`);
  return e;
}
const lista = () => Object.entries(ESTILOS).map(([id, e]) => ({ id, paquete: e.paquete || 'base', nombre: e.nombre, descripcion: e.descripcion }));

module.exports = { ESTILOS, ENTRADAS, props, obtener, lista };
