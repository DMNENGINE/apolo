// Rótulo animado (lower third) con los colores del kit: barra de acento que se despliega, placa oscura con el NOMBRE y una
// placa de acento con el SUBTÍTULO (@usuario, cargo, "saludos a…"). Entra en 0,5 s, se queda y sale hacia la izquierda.
// Fondo transparente. Uso: effectcraft-cli --empty script rotulo.jsx
// (variables: NOMBRE, SUB, DURACION, ESCALA, COLOR_ACENTO, COLOR_TEXTO, COLOR_FONDO, FUENTE, SALIDA_PROYECTO)
var NOMBRE = typeof NOMBRE !== 'undefined' ? NOMBRE : 'EL COMPA';
var SUB = typeof SUB !== 'undefined' ? SUB : '@lagctrucks';
var DURACION = typeof DURACION !== 'undefined' ? DURACION : 4;
var ESCALA = typeof ESCALA !== 'undefined' ? ESCALA : 1;
var COLOR_ACENTO = typeof COLOR_ACENTO !== 'undefined' ? COLOR_ACENTO : [0.13, 0.9, 1];
var COLOR_TEXTO = typeof COLOR_TEXTO !== 'undefined' ? COLOR_TEXTO : [1, 1, 1];
var COLOR_FONDO = typeof COLOR_FONDO !== 'undefined' ? COLOR_FONDO : [0.02, 0.07, 0.13];
var FUENTE = typeof FUENTE !== 'undefined' ? FUENTE : 'Trueno-Black';
var SALIDA_PROYECTO = typeof SALIDA_PROYECTO !== 'undefined' ? SALIDA_PROYECTO : 'D:/RobotCompanion/core/craft/marca/rotulo.ecproj';

var E = ESCALA, W = Math.round(1080 * E), H = Math.round(300 * E), DUR = DURACION, FPS = 60;
var ANCHO_MAX = typeof ANCHO_MAX !== 'undefined' ? ANCHO_MAX : 760;      // ancho máximo del texto (px a escala 1): lo fija la zona segura del kit
var X0 = 90 * E, MAXW = ANCHO_MAX * E, SAL = DUR - 0.4;
var tieneSub = SUB !== '';

var comp = app.project.items.addComp('Rotulo', W, H, 1, DUR, FPS);
function claves(prop, lista) { for (var i = 0; i < lista.length; i++) prop.setValueAtTime(lista[i][0], lista[i][1]); }
function efecto(capa, nombre, valores) {
  var e = capa.property('Effects').addProperty(nombre);
  for (var k in valores) { try { e.property(k).setValue(valores[k]); } catch (er) { writeLn('aviso: ' + nombre + '.' + k + ': ' + er); } }
  return e;
}
// rectángulo con el ancla en el borde izquierdo (para desplegarlo con la escala X)
function placa(nombre, ancho, alto, y, color, op) {
  var c = comp.layers.addShape(); c.name = nombre;
  var g = c.property('Contents').addProperty('ADBE Vector Group');
  var rc = g.property('Contents').addProperty('ADBE Vector Shape - Rect');
  rc.property('Size').setValue([ancho, alto]); rc.property('Roundness').setValue(6 * E);
  rc.property('Position').setValue([ancho / 2, 0]);
  var f = g.property('Contents').addProperty('ADBE Vector Graphic - Fill'); f.property('Color').setValue(color); f.property('Opacity').setValue(op);
  c.property('Transform').property('Anchor Point').setValue([0, 0]);
  c.property('Transform').property('Position').setValue([X0, y]);
  return c;
}
function texto(txt, tam, color, x, y) {
  var t = comp.layers.addText(txt); t.name = txt;
  var p = t.property('Source Text'), d = p.value;
  d.font = FUENTE; d.fontSize = tam; d.tracking = 20; d.fillColor = color; d.applyStroke = false;
  d.justification = ParagraphJustification.LEFT_JUSTIFY;
  p.setValue(d);
  var r = t.sourceRectAtTime(0, false);
  if (r.width > MAXW) { d.fontSize = tam * MAXW / r.width; p.setValue(d); r = t.sourceRectAtTime(0, false); }
  t.property('Transform').property('Anchor Point').setValue([r.left, r.top + r.height / 2]);
  t.property('Transform').property('Position').setValue([x, y]);
  return { capa: t, ancho: r.width, alto: r.height };
}

var Y1 = tieneSub ? H * 0.38 : H / 2, Y2 = H * 0.72;
var t1 = texto(NOMBRE, 84 * E, COLOR_TEXTO, X0 + 46 * E, Y1);
var t2 = tieneSub ? texto(SUB, 44 * E, COLOR_FONDO, X0 + 46 * E, Y2) : null;
var p1 = placa('Placa nombre', t1.ancho + 92 * E, t1.alto + 44 * E, Y1, COLOR_FONDO, 92);
var p2 = tieneSub ? placa('Placa sub', t2.ancho + 92 * E, t2.alto + 26 * E, Y2, COLOR_ACENTO, 100) : null;
var barra = placa('Barra', 14 * E, (tieneSub ? Y2 - Y1 + t2.alto + 26 * E : t1.alto + 44 * E) + 30 * E, tieneSub ? (Y1 + Y2) / 2 : Y1, COLOR_ACENTO, 100);
barra.property('Transform').property('Position').setValue([X0 - 22 * E, tieneSub ? (Y1 + Y2) / 2 : Y1]);
// orden: placas debajo de los textos
p1.moveAfter(t1.capa); if (p2) p2.moveAfter(t2.capa);

// barra: crece en vertical; placas: se despliegan de izquierda a derecha; textos: entran deslizando y se desvanecen al salir
claves(barra.property('Transform').property('Scale'), [[0, [100, 0]], [0.18, [100, 112]], [0.28, [100, 100]], [SAL + 0.15, [100, 100]], [DUR, [100, 0]]]);
function desplegar(capa, t0) { claves(capa.property('Transform').property('Scale'), [[0, [0, 100]], [t0, [0, 100]], [t0 + 0.24, [104, 100]], [t0 + 0.34, [100, 100]], [SAL, [100, 100]], [SAL + 0.3, [0, 100]], [DUR, [0, 100]]]); }
desplegar(p1, 0.12); if (p2) desplegar(p2, 0.22);
function entrar(capa, x, y, t0) {
  claves(capa.property('Transform').property('Position'), [[0, [x - 40 * E, y]], [t0, [x - 40 * E, y]], [t0 + 0.3, [x, y]], [SAL, [x, y]], [SAL + 0.25, [x - 60 * E, y]], [DUR, [x - 60 * E, y]]]);
  claves(capa.property('Transform').property('Opacity'), [[0, 0], [t0, 0], [t0 + 0.2, 100], [SAL, 100], [SAL + 0.2, 0], [DUR, 0]]);
}
entrar(t1.capa, X0 + 46 * E, Y1, 0.26); if (t2) entrar(t2.capa, X0 + 46 * E, Y2, 0.36);
efecto(p1, 'Drop Shadow', { 'Shadow Color': [0, 0, 0], 'Opacity': 70, 'Distance': 6 * E, 'Softness': 16 * E, 'Direction': 160 });
efecto(barra, 'Glow', { 'Glow Threshold': 20, 'Glow Radius': 16 * E, 'Glow Intensity': 1.2 });

writeLn('nombre ' + Math.round(t1.ancho) + ' px' + (t2 ? ' · sub ' + Math.round(t2.ancho) + ' px' : ''));
app.project.save(new File(SALIDA_PROYECTO));
'ok';
