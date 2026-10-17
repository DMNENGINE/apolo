// Título animado del principio de los clips (EffectCraft, modelo de objetos estilo After Effects). MIT.
// Dos líneas en placas inclinadas: la 1.ª blanca sobre cristal oscuro con borde cian, la 2.ª oscura sobre cian brillante.
// Entran de lados opuestos con rebote y golpe de escala, un destello cruza el texto, y salen al final. Fondo transparente.
// Uso: effectcraft-cli --empty script titulo.jsx  (variables: LINEA1, LINEA2, DURACION, ESCALA, SALIDA_PROYECTO)
var LINEA1 = typeof LINEA1 !== 'undefined' ? LINEA1 : 'CAOS TOTAL';
var LINEA2 = typeof LINEA2 !== 'undefined' ? LINEA2 : 'ENTRE CAMIONEROS';
var DURACION = typeof DURACION !== 'undefined' ? DURACION : 3.5;
var ESCALA = typeof ESCALA !== 'undefined' ? ESCALA : 1;
var SALIDA_PROYECTO = typeof SALIDA_PROYECTO !== 'undefined' ? SALIDA_PROYECTO : 'D:/RobotCompanion/core/craft/marca/titulo.ecproj';

// colores del kit de marca (0..1); sin kit, los de LAGCTRUCKS
var COLOR_ACENTO = typeof COLOR_ACENTO !== 'undefined' ? COLOR_ACENTO : [0.13, 0.9, 1];
var COLOR_TEXTO = typeof COLOR_TEXTO !== 'undefined' ? COLOR_TEXTO : [1, 1, 1];
var COLOR_FONDO = typeof COLOR_FONDO !== 'undefined' ? COLOR_FONDO : [0.02, 0.07, 0.13];

var E = ESCALA, W = Math.round(1080 * E), H = Math.round(560 * E), DUR = DURACION, FPS = 60;
var CIAN = COLOR_ACENTO, BLANCO = COLOR_TEXTO, NAVY = COLOR_FONDO, TINTA = [0.0, 0.04, 0.09];
var ANCHO_MAX = typeof ANCHO_MAX !== 'undefined' ? ANCHO_MAX : 900;      // ancho máximo del texto (px a escala 1): lo fija la zona segura del kit
var MAXW = ANCHO_MAX * E, TAM = 118 * E, ROT = -3;
var dos = LINEA2 !== '';
var Y1 = dos ? H / 2 - 82 * E : H / 2, Y2 = H / 2 + 82 * E;
var SAL = DUR - 0.32;                               // empieza la salida

var comp = app.project.items.addComp('Titulo', W, H, 1, DUR, FPS);
function rectRedondo(capa, nombre, w, h, r) {
  var g = capa.property('Contents').addProperty('ADBE Vector Group'); g.name = nombre;
  var rc = g.property('Contents').addProperty('ADBE Vector Shape - Rect');
  rc.property('Size').setValue([w, h]); rc.property('Roundness').setValue(r);
  return g;
}
function relleno(g, color, op) { var f = g.property('Contents').addProperty('ADBE Vector Graphic - Fill'); f.property('Color').setValue(color); if (op != null) f.property('Opacity').setValue(op); return f; }
function trazo(g, color, ancho) { var s = g.property('Contents').addProperty('ADBE Vector Graphic - Stroke'); s.property('Color').setValue(color); s.property('Stroke Width').setValue(ancho); return s; }
function efecto(capa, nombre, valores) {
  var e = capa.property('Effects').addProperty(nombre);
  for (var k in valores) { try { e.property(k).setValue(valores[k]); } catch (er) { writeLn('aviso: ' + nombre + '.' + k + ': ' + er); } }
  return e;
}
function claves(prop, lista) { for (var i = 0; i < lista.length; i++) prop.setValueAtTime(lista[i][0], lista[i][1]); }
// movimiento en línea recta entre claves (la curva automática se pasa de largo y descoloca las placas)
function recto(prop) {
  for (var i = 1; i <= prop.numKeys; i++) {
    try { prop.setSpatialAutoBezierAtKey(i, false); prop.setSpatialContinuousAtKey(i, false); } catch (er) { }
    try { prop.setSpatialTangentsAtKey(i, [0, 0, 0], [0, 0, 0]); } catch (er) { }
    try { prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR); } catch (er) { writeLn('aviso: interpolación: ' + er); }
  }
}

// textos en su propia composición (para usarla también de máscara del destello); el tamaño se ajusta para que quepa
var pre = app.project.items.addComp('Textos', W, H, 1, DUR, FPS);
function texto(txt, color, y, borde) {
  var t = pre.layers.addText(txt); t.name = txt;
  var p = t.property('Source Text'), d = p.value;
  d.font = 'Trueno-Black'; d.fontSize = TAM; d.tracking = 10; d.fillColor = color;
  d.applyStroke = borde; if (borde) { d.strokeColor = TINTA; d.strokeWidth = 8 * E; d.strokeOverFill = false; }
  d.justification = ParagraphJustification.CENTER_JUSTIFY;
  p.setValue(d);
  var r = t.sourceRectAtTime(0, false);
  if (r.width > MAXW) { d.fontSize = TAM * MAXW / r.width; p.setValue(d); r = t.sourceRectAtTime(0, false); }
  t.property('Transform').property('Anchor Point').setValue([r.left + r.width / 2, r.top + r.height / 2]);
  t.property('Transform').property('Position').setValue([W / 2, y]);
  t.property('Transform').property('Rotation').setValue(ROT);
  return { capa: t, ancho: r.width, alto: r.height };
}
var t1 = texto(LINEA1, BLANCO, Y1, true);
var t2 = dos ? texto(LINEA2, NAVY, Y2, false) : null;
// golpe de escala al entrar (160 → 94 → 100) y aparición
function golpe(capa, t0) {
  claves(capa.property('Transform').property('Scale'), [[0, [160, 160]], [t0, [160, 160]], [t0 + 0.12, [94, 94]], [t0 + 0.22, [100, 100]], [SAL, [100, 100]], [DUR, [70, 70]]]);
  claves(capa.property('Transform').property('Opacity'), [[0, 0], [t0, 0], [t0 + 0.06, 100], [SAL, 100], [SAL + 0.14, 0], [DUR, 0]]);
}
golpe(t1.capa, 0.18);
efecto(t1.capa, 'Drop Shadow', { 'Shadow Color': [0, 0, 0], 'Opacity': 85, 'Distance': 5 * E, 'Softness': 8 * E, 'Direction': 160 });
if (t2) { golpe(t2.capa, 0.36); efecto(t2.capa, 'Bevel Alpha', { 'Edge Thickness': 1.5, 'Light Angle': -45, 'Light Intensity': 0.4 }); }

// placas inclinadas que entran de lados opuestos con rebote
function placa(nombre, ancho, alto, y, colorFondo, opFondo, colorBorde, desde, t0, salida) {
  var c = comp.layers.addShape(); c.name = nombre;
  var g = rectRedondo(c, 'placa', ancho, alto, 18 * E);
  relleno(g, colorFondo, opFondo);
  if (colorBorde) trazo(g, colorBorde, 5 * E);
  var tr = c.property('Transform');
  tr.property('Rotation').setValue(ROT);
  claves(tr.property('Position'), [[0, [desde, y]], [t0, [desde, y]], [t0 + 0.2, [W / 2 + (desde < 0 ? 26 : -26) * E, y]], [t0 + 0.32, [W / 2, y]],
    [SAL, [W / 2, y]], [DUR, [salida, y]]]);
  recto(tr.property('Position'));
  efecto(c, 'Drop Shadow', { 'Shadow Color': [0, 0, 0], 'Opacity': 70, 'Distance': 8 * E, 'Softness': 22 * E, 'Direction': 170 });
  return c;
}
var pad = 70 * E;
var p1 = placa('Placa 1', t1.ancho + pad, t1.alto + 46 * E, Y1, NAVY, 92, CIAN, -W, 0.0, W * 2);
efecto(p1, 'Gradient Ramp', { 'Start of Ramp': [W / 2, Y1 - 70 * E], 'Start Color': [0.06, 0.2, 0.32], 'End of Ramp': [W / 2, Y1 + 70 * E], 'End Color': [0.0, 0.02, 0.05] });
var g1 = efecto(p1, 'Glow', { 'Glow Threshold': 10, 'Glow Radius': 20 * E, 'Glow Intensity': 1.4 });
if (t2) {
  var p2 = placa('Placa 2', t2.ancho + pad, t2.alto + 40 * E, Y2, CIAN, 100, null, W * 2, 0.16, -W);
  var g2 = efecto(p2, 'Glow', { 'Glow Threshold': 30, 'Glow Radius': 26 * E, 'Glow Intensity': 0.8 });
  claves(g2.property('Glow Intensity'), [[0, 0.8], [0.5, 0.8], [0.62, 2.6], [0.9, 0.9], [DUR, 0.9]]);   // fogonazo al encajar
}
claves(g1.property('Glow Intensity'), [[0, 1.4], [0.34, 1.4], [0.44, 3], [0.7, 1.4], [DUR / 2 + 0.4, 2], [DUR, 1.4]]);

var textos = comp.layers.add(pre); textos.name = 'Textos';

// destello: franja de luz inclinada que cruza los textos (recortada con su forma)
var mascara = comp.layers.add(pre); mascara.name = 'Textos (máscara)';
var luz = comp.layers.addShape(); luz.name = 'Destello';
relleno(rectRedondo(luz, 'franja', 70 * E, H * 1.3, 0), BLANCO, 100);
efecto(luz, 'Gaussian Blur', { 'Blurriness': 20 * E });
var lt = luz.property('Transform');
lt.property('Rotation').setValue(20);
lt.property('Opacity').setValue(80);
var anchoMax = Math.max(t1.ancho, t2 ? t2.ancho : 0);
var IZQ = [W / 2 - anchoMax / 2 - 160 * E, H / 2], DER = [W / 2 + anchoMax / 2 + 160 * E, H / 2];
claves(lt.property('Position'), [[0, IZQ], [0.7, IZQ], [1.35, DER], [DUR, DER]]);
recto(lt.property('Position'));
luz.setTrackMatte(mascara, TrackMatteType.ALPHA);
try { luz.blendingMode = BlendingMode.ADD; } catch (er) { writeLn('aviso: modo de fusión: ' + er); }

writeLn('linea1 ' + Math.round(t1.ancho) + ' px' + (t2 ? ' · linea2 ' + Math.round(t2.ancho) + ' px' : ''));
app.project.save(new File(SALIDA_PROYECTO));
'ok';
