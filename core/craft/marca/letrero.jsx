// Letrero de marca para la parte de arriba de los clips (EffectCraft, modelo de objetos estilo After Effects). MIT.
// Placa de cristal oscuro con borde cian brillante, nombre en blanco + cian con relieve y resplandor, destello que cruza
// el nombre y los iconos de redes (iconos.py) dando un saltito uno detrás de otro. Bucle de 6 s, fondo transparente.
// Uso: effectcraft-cli --empty script letrero.jsx  (variables: NOMBRE1, NOMBRE2, DIR_ICONOS, SALIDA_PROYECTO)
var NOMBRE1 = typeof NOMBRE1 !== 'undefined' ? NOMBRE1 : 'LAGC';
var NOMBRE2 = typeof NOMBRE2 !== 'undefined' ? NOMBRE2 : 'TRUCKS';
var DIR_ICONOS = typeof DIR_ICONOS !== 'undefined' ? DIR_ICONOS : 'D:/RobotCompanion/core/craft/marca/iconos';
var SALIDA_PROYECTO = typeof SALIDA_PROYECTO !== 'undefined' ? SALIDA_PROYECTO : 'D:/RobotCompanion/core/craft/marca/letrero.ecproj';
var REDES = ['youtube', 'tiktok', 'kick', 'instagram', 'facebook', 'discord'];

var W = 1080, H = 150, DUR = 6, FPS = 60;
var CIAN = [0.13, 0.9, 1], BLANCO = [1, 1, 1], NAVY = [0.02, 0.07, 0.13];
var comp = app.project.items.addComp('Letrero', W, H, 1, DUR, FPS);
var CY = 66;                                   // centro vertical de la placa
var PW = 1036, PH = 100;                       // placa

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

// 1. placa: degradado de azul noche a negro, casi opaca
var placa = comp.layers.addShape(); placa.name = 'Placa';
relleno(rectRedondo(placa, 'fondo', PW, PH, PH / 2), NAVY, 100);
placa.property('Transform').property('Position').setValue([W / 2, CY]);
placa.property('Transform').property('Opacity').setValue(90);
efecto(placa, 'Gradient Ramp', { 'Start of Ramp': [W / 2, CY - PH / 2], 'Start Color': [0.06, 0.2, 0.32], 'End of Ramp': [W / 2, CY + PH / 2], 'End Color': [0.0, 0.02, 0.05] });
efecto(placa, 'Drop Shadow', { 'Shadow Color': [0, 0, 0], 'Opacity': 70, 'Distance': 6, 'Softness': 18, 'Direction': 180 });

// 2. brillo de cristal: franja blanca suave en la mitad de arriba
var cristal = comp.layers.addShape(); cristal.name = 'Cristal';
relleno(rectRedondo(cristal, 'brillo', PW - 24, PH / 2 - 8, PH / 4), BLANCO, 9);
cristal.property('Transform').property('Position').setValue([W / 2, CY - PH / 4 + 2]);

// 3. borde cian con resplandor que respira (sube y baja en bucle)
var borde = comp.layers.addShape(); borde.name = 'Borde';
trazo(rectRedondo(borde, 'borde', PW, PH, PH / 2), CIAN, 4);
borde.property('Transform').property('Position').setValue([W / 2, CY]);
var glowB = efecto(borde, 'Glow', { 'Glow Threshold': 10, 'Glow Radius': 22, 'Glow Intensity': 1.6 });
var gi = glowB.property('Glow Intensity');
gi.setValueAtTime(0, 1.2); gi.setValueAtTime(DUR / 2, 2.4); gi.setValueAtTime(DUR, 1.2);

// 4. nombre (en su propia composición, para usarlo también de máscara del destello): NOMBRE1 en blanco y NOMBRE2 en cian,
// Trueno Black con contorno oscuro, relieve y resplandor
var pre = app.project.items.addComp('Nombre', W, H, 1, DUR, FPS);
function texto(txt, color, x) {
  var t = pre.layers.addText(txt); t.name = txt;
  var p = t.property('Source Text'), d = p.value;
  d.font = 'Trueno-Black'; d.fontSize = 80; d.tracking = 30; d.fillColor = color;
  d.applyStroke = true; d.strokeColor = [0.0, 0.04, 0.09]; d.strokeWidth = 7; d.strokeOverFill = false;
  d.justification = ParagraphJustification.LEFT_JUSTIFY;
  p.setValue(d);
  var r = t.sourceRectAtTime(0, false);
  t.property('Transform').property('Anchor Point').setValue([r.left, r.top + r.height / 2]);
  t.property('Transform').property('Position').setValue([x, CY]);
  efecto(t, 'Bevel Alpha', { 'Edge Thickness': 2.2, 'Light Angle': -45, 'Light Intensity': 0.55 });
  efecto(t, 'Drop Shadow', { 'Shadow Color': [0, 0, 0], 'Opacity': 80, 'Distance': 4, 'Softness': 6, 'Direction': 160 });
  return { capa: t, ancho: r.width };
}
var X0 = 58;
var t1 = texto(NOMBRE1, BLANCO, X0);
var t2 = texto(NOMBRE2, CIAN, X0 + t1.ancho + 4);
efecto(t2.capa, 'Glow', { 'Glow Threshold': 40, 'Glow Radius': 14, 'Glow Intensity': 0.9 });
var finTexto = X0 + t1.ancho + 4 + t2.ancho;

var nombre = comp.layers.add(pre); nombre.name = 'Nombre';

// 5. destello: una franja de luz inclinada y desenfocada que cruza el nombre dos veces por bucle, recortada con la forma
// del nombre (máscara alfa con otra copia de la composición)
var mascara = comp.layers.add(pre); mascara.name = 'Nombre (máscara)';
var luz = comp.layers.addShape(); luz.name = 'Destello';
relleno(rectRedondo(luz, 'franja', 46, 260, 0), BLANCO, 100);
efecto(luz, 'Gaussian Blur', { 'Blurriness': 16 });
var lt = luz.property('Transform');
lt.property('Rotation').setValue(22);
lt.property('Opacity').setValue(85);
var lp = lt.property('Position');
// entre pasadas se queda quieta fuera del nombre (a la derecha) y salta al principio justo antes de la siguiente
var IZQ = [X0 - 120, CY], DER = [finTexto + 120, CY];
var claves = [[0, IZQ], [0.6, IZQ], [1.35, DER], [3.5, DER], [3.55, IZQ], [3.6, IZQ], [4.35, DER], [DUR, DER]];
for (var k = 0; k < claves.length; k++) lp.setValueAtTime(claves[k][0], claves[k][1]);
luz.setTrackMatte(mascara, TrackMatteType.ALPHA);
try { luz.blendingMode = BlendingMode.ADD; } catch (er) { writeLn('aviso: modo de fusión: ' + er); }

// 6. iconos a la derecha; cada 6 s dan un saltito en ola (escala 100 → 122 → 100) uno detrás de otro
var LADO = 58, HUECO = 12;
var xIcono = W - 44 - (REDES.length * LADO + (REDES.length - 1) * HUECO) + LADO / 2;
for (var j = 0; j < REDES.length; j++) {
  var f = app.project.importFile(new ImportOptions(new File(DIR_ICONOS + '/' + REDES[j] + '.png')));
  var ic = comp.layers.add(f); ic.name = REDES[j];
  var esc = 100 * LADO / f.width;
  var tr = ic.property('Transform');
  tr.property('Position').setValue([xIcono + j * (LADO + HUECO), CY]);
  var s = tr.property('Scale'), t0 = 2.2 + j * 0.12;
  s.setValueAtTime(0, [esc, esc]); s.setValueAtTime(t0, [esc, esc]);
  s.setValueAtTime(t0 + 0.12, [esc * 1.22, esc * 1.22]); s.setValueAtTime(t0 + 0.3, [esc * 0.96, esc * 0.96]); s.setValueAtTime(t0 + 0.42, [esc, esc]);
  efecto(ic, 'Drop Shadow', { 'Shadow Color': [0, 0, 0], 'Opacity': 75, 'Distance': 3, 'Softness': 8, 'Direction': 160 });
}
writeLn('texto hasta x=' + Math.round(finTexto) + ' · iconos desde x=' + Math.round(xIcono - LADO / 2));
app.project.save(new File(SALIDA_PROYECTO));
'ok';
