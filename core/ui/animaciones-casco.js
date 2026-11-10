// GENERADO desde app/animaciones-casco.js; no editar.
// Catálogo declarativo. Ojos, trayectos y mecánica se combinan sin añadir geometría.
const familias = [
  ['emociones', [
    ['alegria_radiante', 'Alegría radiante', 'sol', 'bote', 'ninguna'],
    ['orgullo_robot', 'Orgullo', 'ilusionado', 'erguir', 'antenas'],
    ['carino_suave', 'Cariño', 'corazon', 'mecer', 'ninguna'],
    ['risa_contagiosa', 'Carcajada', 'feliz', 'risa', 'acordeon'],
    ['verguenza_dulce', 'Vergüenza', 'timido', 'esconder', 'cofre'],
    ['asombro_cosmico', 'Asombro cósmico', 'estrella', 'retroceder', 'abanico'],
    ['serenidad', 'Serenidad', 'luna', 'respirar', 'ninguna'],
    ['determinacion', 'Determinación', 'concentrado', 'asentir', 'escudo'],
    ['melancolia', 'Melancolía', 'gota', 'agachar', 'ninguna'],
    ['alivio_profundo', 'Alivio', 'feliz', 'suspiro', 'visor'],
  ]],
  ['curiosidad', [
    ['buscar_pista', 'Buscar una pista', 'radar', 'barrer', 'antenas'],
    ['escuchar_izquierda', 'Escuchar a la izquierda', 'curioso', 'izquierda', 'balanza'],
    ['escuchar_derecha', 'Escuchar a la derecha', 'curioso', 'derecha', 'antenas'],
    ['inspeccionar_techo', 'Inspeccionar el techo', 'anillos', 'arriba', 'visor'],
    ['rastrear_suelo', 'Rastrear el suelo', 'radar', 'abajo', 'ninguna'],
    ['descubrir_secreto', 'Descubrir un secreto', 'diamante', 'acercar', 'cofre'],
    ['doble_comprobacion', 'Doble comprobación', 'sospecha', 'doble', 'ninguna'],
    ['seguir_mariposa', 'Seguir una mariposa', 'flor', 'ocho', 'abanico'],
    ['leer_entre_lineas', 'Leer entre líneas', 'pixel', 'leer', 'ninguna'],
    ['idea_repentina', 'Idea repentina', 'rayo', 'sobresalto', 'torre'],
  ]],
  ['descanso', [
    ['siesta_lunar', 'Siesta lunar', 'luna', 'cabecear', 'ninguna'],
    ['estiramiento_largo', 'Estiramiento largo', 'bostezo', 'estirar', 'acordeon'],
    ['respirar_nubes', 'Respirar nubes', 'nube', 'respirar', 'visor'],
    ['ojos_pesados', 'Ojos pesados', 'triste', 'cabecear', 'cofre'],
    ['despertar_estelar', 'Despertar estelar', 'estrella', 'despertar', 'flor'],
    ['sacudir_sueno', 'Sacudir el sueño', 'guino', 'sacudir', 'antenas'],
    ['meditar_infinito', 'Meditar', 'infinito', 'mecer', 'ninguna'],
    ['bostezo_en_cadena', 'Bostezos seguidos', 'bostezo', 'doble', 'visor'],
    ['acurrucarse', 'Acurrucarse', 'timido', 'encoger', 'esfera'],
    ['saludo_amanecer', 'Saludo al amanecer', 'sol', 'saludar', 'abanico'],
  ]],
  ['juegos', [
    ['pelota_imaginaria', 'Pelota imaginaria', 'anillos', 'rebote', 'rebotar'],
    ['equilibrio_imposible', 'Equilibrio imposible', 'sorpresa', 'equilibrio', 'balanza'],
    ['escondite', 'Escondite', 'guino', 'esconder', 'visor'],
    ['robot_pixel', 'Robot de píxeles', 'pixel', 'robotico', 'ninguna'],
    ['tictac_divertido', 'Tictac', 'reloj_arena', 'pendulo', 'reloj'],
    ['hacer_pirueta', 'Pirueta', 'ilusionado', 'pirueta', 'helice'],
    ['salto_rana', 'Salto de rana', 'feliz', 'salto', 'alas'],
    ['burbuja_curiosa', 'Burbuja curiosa', 'anillos', 'ocho', 'esfera'],
    ['guino_complice', 'Guiño cómplice', 'guino', 'ladeo', 'balanza'],
    ['aplauso_auriculares', 'Aplauso de auriculares', 'feliz', 'doble', 'aplauso'],
  ]],
  ['visor', [
    ['ventilar_visor', 'Ventilar el visor', 'nube', 'suspiro', 'visor'],
    ['mirar_por_rendija', 'Mirar por una rendija', 'sospecha', 'acercar', 'rendija'],
    ['saludo_del_nido', 'Saludo del nido', 'sorpresa', 'retroceder', 'cofre'],
    ['visor_mariposa', 'Visor mariposa', 'flor', 'mecer', 'aleteo'],
    ['escotilla_espacial', 'Escotilla espacial', 'cubo', 'erguir', 'visor'],
    ['visor_tictac', 'Visor tictac', 'reloj_arena', 'pendulo', 'rendija'],
    ['escaneo_vertical', 'Escaneo vertical', 'radar', 'arriba', 'escaneo'],
    ['escaneo_horizontal', 'Escaneo horizontal', 'flecha', 'barrer', 'rendija'],
    ['visor_fotografo', 'Visor fotógrafo', 'diamante', 'doble', 'obturador'],
    ['cerrar_con_guino', 'Cerrar con un guiño', 'guino', 'asentir', 'obturador'],
  ]],
  ['mantenimiento', [
    ['calibrar_antenas', 'Calibrar antenas', 'radar', 'robotico', 'antenas'],
    ['limpiar_pantalla', 'Limpiar la pantalla', 'gota', 'barrer', 'escaneo'],
    ['afinar_engranajes', 'Afinar engranajes', 'engranaje', 'doble', 'reparar'],
    ['prueba_suspension', 'Probar la suspensión', 'concentrado', 'rebote', 'acordeon'],
    ['revisar_auricular', 'Revisar un auricular', 'duda', 'izquierda', 'reparar'],
    ['cambiar_fusible', 'Cambiar un fusible', 'rayo', 'agachar', 'cofre'],
    ['alinear_placas', 'Alinear placas', 'cubo', 'robotico', 'torre'],
    ['equilibrar_motor', 'Equilibrar el motor', 'engranaje', 'equilibrio', 'balanza'],
    ['enfriar_circuitos', 'Enfriar circuitos', 'nube', 'suspiro', 'abanico'],
    ['autodiagnostico', 'Autodiagnóstico', 'cruz', 'leer', 'reloj'],
  ]],
  ['transformaciones', [
    ['forma_satelite', 'Forma satélite', 'radar', 'orbitar', 'satelite'],
    ['forma_nave', 'Forma de nave', 'flecha', 'vuelo', 'alas'],
    ['forma_esfera', 'Forma esférica', 'anillos', 'encoger', 'esfera'],
    ['forma_flor', 'Forma de flor', 'flor', 'despertar', 'flor'],
    ['forma_totem', 'Forma de tótem', 'cubo', 'estirar', 'torre'],
    ['forma_escudo', 'Forma de escudo', 'diamante', 'retroceder', 'escudo'],
    ['forma_helice', 'Forma de hélice', 'espiral', 'pirueta', 'helice'],
    ['forma_cometa', 'Forma de cometa', 'estrella', 'vuelo', 'cometa'],
    ['forma_acordeon', 'Forma de acordeón', 'nota', 'risa', 'acordeon'],
    ['forma_constelacion', 'Constelación de piezas', 'estrella', 'orbitar', 'orbita'],
  ]],
  ['espacio', [
    ['gravedad_cero', 'Gravedad cero', 'luna', 'flotar', 'orbita'],
    ['buscar_senal', 'Buscar una señal', 'radar', 'barrer', 'satelite'],
    ['lluvia_estrellas', 'Lluvia de estrellas', 'estrella', 'arriba', 'abanico'],
    ['aterrizaje_lunar', 'Aterrizaje lunar', 'luna', 'salto', 'rebotar'],
    ['agujero_gusano', 'Agujero de gusano', 'infinito', 'ocho', 'helice'],
    ['saludo_marciano', 'Saludo marciano', 'pixel', 'saludar', 'antenas'],
    ['eclipse', 'Eclipse', 'sol', 'encoger', 'obturador'],
    ['orbita_doble', 'Órbita doble', 'anillos', 'orbitar', 'satelite'],
    ['despegue', 'Despegue', 'fuego', 'vuelo', 'cometa'],
    ['brujula_galactica', 'Brújula galáctica', 'flecha', 'equilibrio', 'reloj'],
  ]],
  ['musica', [
    ['ritmo_suave', 'Ritmo suave', 'nota', 'mecer', 'ninguna'],
    ['bajo_robotico', 'Bajo robótico', 'pixel', 'bote', 'acordeon'],
    ['solo_bateria', 'Solo de batería', 'rayo', 'doble', 'aplauso'],
    ['vals_mecanico', 'Vals mecánico', 'corazon', 'ocho', 'balanza'],
    ['director_orquesta', 'Director de orquesta', 'concentrado', 'saludar', 'abanico'],
    ['escuchar_melodia', 'Escuchar una melodía', 'nota', 'izquierda', 'antenas'],
    ['campanillas', 'Campanillas', 'diamante', 'sacudir', 'reloj'],
    ['baile_disco', 'Baile disco', 'estrella', 'baile', 'aleteo'],
    ['caja_musical', 'Caja musical', 'nota', 'pirueta', 'cofre'],
    ['final_con_aplauso', 'Final con aplauso', 'ilusionado', 'salto', 'aplauso'],
  ]],
  ['magia', [
    ['levitar_placas', 'Levitar placas', 'infinito', 'flotar', 'torre'],
    ['ojos_de_cristal', 'Ojos de cristal', 'diamante', 'ladeo', 'ninguna'],
    ['portal_pequeno', 'Portal pequeño', 'espiral', 'acercar', 'visor'],
    ['truco_sombrero', 'Truco del sombrero', 'sorpresa', 'agachar', 'flor'],
    ['recomponer_hechizo', 'Recomponer un hechizo', 'rayo', 'robotico', 'orbita'],
    ['flor_encantada', 'Flor encantada', 'flor', 'estirar', 'aleteo'],
    ['corazon_flotante', 'Corazón flotante', 'corazon', 'flotar', 'escudo'],
    ['reloj_encantado', 'Reloj encantado', 'reloj_arena', 'ocho', 'reloj'],
    ['chispa_traviesa', 'Chispa traviesa', 'fuego', 'sobresalto', 'reparar'],
    ['gran_final', 'Gran final', 'sol', 'salto', 'orbita'],
  ]],
];

export const ANIMACIONES_CASCO = Object.freeze(familias.flatMap(([familia, filas]) => filas.map(([id, nombre, ojos, trayecto, mecanica]) =>
  Object.freeze({ id, nombre, familia, ojos, trayecto, mecanica, escena: ['orbita','alas','esfera','torre','flor','escudo','satelite','cometa','cofre','helice'].includes(mecanica), segundos: mecanica === 'ninguna' ? 4.5 : 7 }))));
const porId = new Map(ANIMACIONES_CASCO.map(a => [a.id, a]));
export const buscarAnimacionCasco = id => porId.get(id) || null;
const suave = v => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };

// Pose absoluta respecto al montaje original: no acumula errores entre fotogramas.
export function evaluarAnimacionCasco(a, fase, reducido = false) {
  const f = Math.max(0, Math.min(1, fase)), e = suave(f / .2) * (1 - suave((f - .75) / .25));
  const t = f * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
  const p = { ojos: a.ojos, mirada: [0, 0], cabeza: [0, 0, 0], altura: 0, escala: 1, apertura: 0,
    visor: [0, 0, 0], piezas: { placa: [0, 0, 0, 0, 0, 0], izquierda: [0, 0, 0, 0, 0, 0], derecha: [0, 0, 0, 0, 0, 0], menton: [0, 0, 0, 0, 0, 0] } };
  if (reducido || !e) return p;
  const cabeceo = valor => { p.cabeza[0] = valor; };
  switch (a.trayecto) {
    case 'bote': p.altura = Math.abs(Math.sin(t * 2)) * .07; p.escala += .035 * Math.cos(t * 4); break;
    case 'erguir': cabeceo(-.16); p.altura = .04; break;
    case 'mecer': p.cabeza[2] = s * .15; break;
    case 'risa': p.cabeza[2] = Math.sin(t * 3) * .08; p.escala += Math.sin(t * 6) * .035; break;
    case 'esconder': cabeceo(.2); p.cabeza[1] = .22 * s; break;
    case 'retroceder': cabeceo(-.22); p.escala -= .025; break;
    case 'respirar': p.escala += s * .015; p.altura = s * .025; break;
    case 'asentir': cabeceo(Math.sin(t * 2) * .16); break;
    case 'agachar': cabeceo(.23); p.altura = -.035; break;
    case 'suspiro': cabeceo(-.14 * s); p.escala += .025 * s; break;
    case 'barrer': p.cabeza[1] = s * .35; p.mirada[0] = s * .8; break;
    case 'izquierda': p.cabeza[1] = -.3; p.cabeza[2] = -.12 * s; p.mirada[0] = -.7; break;
    case 'derecha': p.cabeza[1] = .3; p.cabeza[2] = .12 * s; p.mirada[0] = .7; break;
    case 'arriba': cabeceo(-.22); p.mirada[1] = -.8; break;
    case 'abajo': cabeceo(.2); p.mirada[1] = .7; break;
    case 'acercar': cabeceo(.08); p.escala += .04; p.mirada[0] = .3 * s; break;
    case 'doble': cabeceo(Math.sin(t * 3) * .13); p.cabeza[2] = Math.sin(t * 1.5) * .06; break;
    case 'ocho': p.cabeza[1] = s * .25; p.cabeza[2] = Math.sin(t * 2) * .12; p.mirada = [s * .7, Math.sin(t * 2) * .4]; break;
    case 'leer': p.mirada = [Math.sin(t * 3) * .7, .2]; cabeceo(.08); break;
    case 'sobresalto': cabeceo(-.2 * Math.sin(f * Math.PI)); p.altura = .065 * Math.sin(f * Math.PI); break;
    case 'cabecear': cabeceo(.16 + .1 * s); p.cabeza[2] = .06 * s; break;
    case 'estirar': cabeceo(-.16); p.escala += .06; p.altura = .035; break;
    case 'despertar': cabeceo(.15 * c); p.cabeza[2] = .08 * Math.sin(t * 2); break;
    case 'sacudir': p.cabeza[1] = Math.sin(t * 4) * .17; break;
    case 'encoger': cabeceo(.12); p.escala -= .06; break;
    case 'saludar': p.cabeza[2] = Math.sin(t * 2) * .2; break;
    case 'rebote': p.altura = Math.abs(Math.sin(t * 1.5)) * .07; p.escala -= Math.cos(t * 3) * .04; break;
    case 'equilibrio': p.cabeza[2] = s * .22; p.cabeza[1] = -.12 * s; break;
    case 'robotico': p.cabeza[1] = Math.tanh(Math.sin(t * 2) * 3) * .18; cabeceo(.08 * c); break;
    case 'pendulo': p.cabeza[2] = Math.sin(t * 2) * .18; break;
    case 'pirueta': p.cabeza[1] = .45 * s; p.cabeza[2] = .18 * c; break;
    case 'salto': p.altura = .09 * Math.sin(f * Math.PI); p.escala += .04 * s; break;
    case 'ladeo': p.cabeza[2] = -.2; p.mirada[0] = .4; break;
    case 'orbitar': p.cabeza[1] = .2 * s; cabeceo(.12 * c); break;
    case 'vuelo': cabeceo(-.18); p.cabeza[2] = .12 * s; p.altura = .05 * Math.sin(f * Math.PI); break;
    case 'flotar': p.altura = .04 * s; p.cabeza[2] = .08 * c; break;
    case 'baile': p.cabeza[2] = .16 * Math.sin(t * 3); p.cabeza[1] = .15 * s; p.altura = .04 * Math.abs(Math.sin(t * 3)); break;
  }
  const q = p.piezas, onda = Math.sin(t * 2);
  switch (a.mecanica) {
    case 'visor': p.apertura = .48; break;
    case 'rendija': p.apertura = .16 + .05 * s; break;
    case 'obturador': p.apertura = .38 * Math.pow(Math.sin(t), 2); break;
    case 'escaneo': p.apertura = .23; p.visor[0] = .045 * s; q.placa[1] = .08; break;
    case 'antenas': q.izquierda = [-.14, .07, 0, 0, 0, -.35]; q.derecha = [.14, .07, 0, 0, 0, .35]; break;
    case 'abanico': q.placa = [0, .12, -.03, -.3, 0, 0]; q.izquierda = [-.2, .02, 0, 0, 0, -.4]; q.derecha = [.2, .02, 0, 0, 0, .4]; break;
    case 'aleteo': q.izquierda = [-.15, 0, 0, 0, 0, onda * .5]; q.derecha = [.15, 0, 0, 0, 0, -onda * .5]; p.apertura = .1 * (1 + s); break;
    case 'acordeon': q.placa[1] = .1 * (1 + onda); q.menton[1] = -.09 * (1 + onda); break;
    case 'cofre': p.apertura = .42; q.placa[1] = .09; q.menton = [0, -.12, .06, .2, 0, 0]; break;
    case 'torre': q.placa = [0, .18, 0, -.1, .15 * s, 0]; q.menton[1] = -.16; q.izquierda[1] = .1; q.derecha[1] = -.1; break;
    case 'escudo': q.izquierda = [-.12, -.04, .16, 0, .4, 0]; q.derecha = [.12, -.04, .16, 0, -.4, 0]; q.menton[2] = .1; break;
    case 'balanza': q.izquierda = [-.1, .1 * s, 0, 0, 0, .25 * s]; q.derecha = [.1, -.1 * s, 0, 0, 0, -.25 * s]; break;
    case 'rebotar': q.placa[1] = Math.abs(onda) * .14; q.menton[1] = -Math.abs(s) * .1; break;
    case 'reparar': q.derecha = [.2, .04, .04, 0, 0, .65 * s]; q.placa[1] = .08; break;
    case 'reloj': q.izquierda = [-.14, 0, .02, .35 * s, 0, .3 * c]; q.derecha = [.14, 0, .02, -.35 * s, 0, -.3 * c]; break;
    case 'alas': q.izquierda = [-.24, -.02, -.05, 0, 0, -.8]; q.derecha = [.24, -.02, -.05, 0, 0, .8]; q.placa = [0, .06, -.08, -.4, 0, 0]; q.menton[2] = .12; break;
    case 'esfera': q.izquierda = [.08, -.02, -.07, 0, .35, 0]; q.derecha = [-.08, -.02, -.07, 0, -.35, 0]; q.placa[1] = -.04; q.menton[1] = .06; break;
    case 'flor': q.placa = [0, .18, 0, -.45, 0, 0]; q.menton = [0, -.14, .05, .4, 0, 0]; q.izquierda = [-.22, .04, 0, 0, 0, -.6]; q.derecha = [.22, .04, 0, 0, 0, .6]; p.apertura = .2; break;
    case 'helice': q.izquierda = [-.18, .08 * s, 0, .7 * s, 0, .5 * c]; q.derecha = [.18, -.08 * s, 0, -.7 * s, 0, -.5 * c]; q.placa[1] = .1; break;
    case 'cometa': q.placa = [0, .07, -.13, -.4, 0, 0]; q.menton = [0, -.05, .13, .35, 0, 0]; q.izquierda = [-.2, -.06, -.08, 0, 0, -.5]; q.derecha = [.2, -.06, -.08, 0, 0, .5]; break;
    case 'satelite': q.izquierda = [-.25, .1 * s, 0, 0, .5 * s, -.3]; q.derecha = [.25, -.1 * s, 0, 0, -.5 * s, .3]; q.placa = [0, .13, 0, -.25, 0, 0]; break;
    case 'orbita': q.izquierda = [-.22, .12 * s, .1 * c, .2 * s, 0, -.25]; q.derecha = [.22, -.12 * s, -.1 * c, -.2 * s, 0, .25]; q.placa = [.08 * s, .16, .06 * c, -.25, 0, 0]; q.menton = [-.06 * s, -.16, -.06 * c, .2, 0, 0]; break;
    case 'aplauso': q.izquierda = [.055 * (1 + onda), 0, .06, 0, 0, -.25 * onda]; q.derecha = [-.055 * (1 + onda), 0, .06, 0, 0, .25 * onda]; break;
  }
  p.cabeza = p.cabeza.map(v => v * e); p.mirada = p.mirada.map(v => v * e);
  p.altura *= e; p.escala = 1 + (p.escala - 1) * e; p.apertura *= e; p.visor = p.visor.map(v => v * e);
  for (const nombre in q) q[nombre] = q[nombre].map(v => v * e);
  return p;
}
