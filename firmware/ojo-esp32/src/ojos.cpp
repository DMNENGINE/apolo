// Traducción de tools/ojo-dibujo.js (ver el comentario de cabecera allí). Si cambias el dibujo, cambia los dos.
#include "ojos.h"
#include <Arduino.h>
#include <time.h>

static const int W = 240, C = 120;
static const float PI_F = 3.14159265f;

struct Obj { float hue, eye, glow, happy, x, sleep; };
static const Obj ESTADOS[N_ESTADOS] = {
  /* reposo     */ {145, 1,    .5f,  0, 0, 0},
  /* trabajando */ {195, .9f,  1.3f, 0, 0, 0},
  /* permiso    */ {40,  1.15f,1.1f, 0, 0, 0},
  /* listo      */ {125, 1,    1,    1, 0, 0},
  /* error      */ {0,   1,    1.1f, 0, 1, 0},
  /* dormido    */ {220, 1,    .12f, 0, 0, 1},
};
static const char* NOMBRES_ESTADO[N_ESTADOS] = {"reposo", "trabajando", "permiso", "listo", "error", "dormido"};
static const char* NOMBRES_GESTO[N_GESTOS] = {"", "feliz", "triste", "duda", "sorpresa", "guino", "corazon", "remolino", "bostezo", "reloj"};

int estadoDeNombre(const char* n) { for (int i = 0; i < N_ESTADOS; i++) if (!strcmp(n, NOMBRES_ESTADO[i])) return i; return -1; }
int gestoDeNombre(const char* n) { for (int i = 1; i < N_GESTOS; i++) if (!strcmp(n, NOMBRES_GESTO[i])) return i; return G_NINGUNO; }

// ---------- color ----------
static inline uint16_t rgb565(int r, int g, int b) { return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }
static uint16_t hsl565(float h, float s, float l) {          // h 0..360, s y l 0..100 (como hsl() de CSS)
  h = fmodf(fmodf(h, 360) + 360, 360); s /= 100; l /= 100;
  float a = s * fminf(l, 1 - l);
  auto f = [&](float n) { float k = fmodf(n + h / 30, 12); return l - a * fmaxf(-1, fminf(k - 3, fminf(9 - k, 1))); };
  return rgb565(lroundf(f(0) * 255), lroundf(f(8) * 255), lroundf(f(4) * 255));
}
static uint16_t mezcla(int r1, int g1, int b1, int r2, int g2, int b2, float t) {
  return rgb565(lroundf(r1 + (r2 - r1) * t), lroundf(g1 + (g2 - g1) * t), lroundf(b1 + (b2 - b1) * t));
}
static const uint16_t FONDO = rgb565(5, 8, 11);
static inline float rnd() { return esp_random() / 4294967296.0f; }
static inline float T(uint32_t ms) { return (float)(ms % 3600000UL); }   // floats sin perder precisión tras horas encendido

struct Brillo { float a, d, s, p; };
static Brillo BRILLOS[10];
static bool brillosListos = false;
static void prepararBrillos() {
  for (int i = 0; i < 10; i++) BRILLOS[i] = {i * 2.4f + .3f, .35f + ((i * 37) % 10) / 18.0f, .5f + ((i * 53) % 10) / 10.0f, i * 1.7f};
  brillosListos = true;
}

void Ojos::ponerEstado(int nombre, const char* msg) {
  if (nombre < 0 || nombre >= N_ESTADOS) return;
  if (st.react > 0) { st.prev = nombre; strlcpy(st.prevMsg, msg, sizeof st.prevMsg); return; }
  st.estado = nombre; strlcpy(st.msg, msg, sizeof st.msg);
}
void Ojos::flash(int nombre, const char* msg, float secs) {  // reacción temporal y vuelve al estado real
  if (nombre < 0 || nombre >= N_ESTADOS) return;
  if (st.react <= 0) { st.prev = st.estado; strlcpy(st.prevMsg, st.msg, sizeof st.prevMsg); }
  st.estado = nombre; strlcpy(st.msg, msg, sizeof st.msg); st.react = secs;
}
void Ojos::gesto(int nombre, float secs, const char* msg) {
  st.gesto = nombre; st.gIni = st.ahora; st.gHasta = st.ahora + (uint32_t)(secs * 1000);
  int base = st.react > 0 ? st.prev : st.estado;
  if (msg) flash(base == DORMIDO ? REPOSO : base, msg, secs);
}
void Ojos::mirar(float x, float y, float secs) {
  st.mx = fmaxf(-1, fminf(1, x)); st.my = fmaxf(-1, fminf(1, y)); st.mirarHasta = st.ahora + (uint32_t)(secs * 1000);
}

void Ojos::paso(uint32_t ms, float dt) {
  st.ahora = ms;
  const Obj& o = ESTADOS[st.estado];
  float kh = 1 - powf(.0003f, dt), k = 1 - powf(.02f, dt);
  st.hue += (o.hue - st.hue) * kh;
  st.eye += (o.eye - st.eye) * k; st.glow += (o.glow - st.glow) * k; st.happy += (o.happy - st.happy) * k;
  st.x += (o.x - st.x) * k; st.sleep += (o.sleep - st.sleep) * k;
  if (st.react > 0) { st.react -= dt; if (st.react <= 0) { st.estado = st.prev; strlcpy(st.msg, st.prevMsg, sizeof st.msg); } }
  st.blinkT -= dt; if (st.blinkT < 0) { st.blink = 1; st.blinkT = rnd() < .2f ? .28f : 2.5f + rnd() * 4; }
  st.blink = fmaxf(0, st.blink - dt * 7);
  // mirada: lo que mande el PC > leyendo (trabajando) > mira a su alrededor (reposo)
  bool rapido = false; float t = T(ms);
  if (ms < st.mirarHasta) { st.tx = st.mx; st.ty = st.my; rapido = true; }
  else if (st.estado == TRABAJANDO) { st.tx = -.6f + .3f * sinf(t / 400); st.ty = -.3f; }
  else if (st.estado == DORMIDO || st.estado == PERMISO) { st.tx = 0; st.ty = st.estado == PERMISO ? .1f : 0; }
  else if (activo(DUDA)) { st.tx = .5f; st.ty = -.4f; }
  else {
    st.sacadaT -= dt;
    if (st.sacadaT < 0) {                                    // sacadas: salta a otro punto, a veces vuelve al centro
      st.sacadaT = 1.2f + rnd() * 3;
      if (rnd() < .45f) { st.tx = 0; st.ty = 0; } else { st.tx = (rnd() * 2 - 1) * .8f; st.ty = (rnd() * 2 - 1) * .45f; }
    }
    rapido = true;
  }
  float kk = 1 - powf(rapido ? .00005f : .004f, dt);
  st.lx += (st.tx - st.lx) * kk; st.ly += (st.ty - st.ly) * kk;
}

float Ojos::nivel(uint32_t ms) {
  float lvl = st.glow;
  if (st.estado == PERMISO) lvl *= .45f + .55f * (.5f + .5f * sinf(T(ms) / 140));
  return lvl;
}

void Ojos::arcoFeliz(float ex, float ey, float er, uint16_t col) {   // ^  (contento / guiño)
  float w = er * .2f;
  g.fillArc(ex, ey + er * .35f, er * .65f - w / 2, er * .65f + w / 2, 207, 333, col);
}
void Ojos::corazon(float x, float y, float s, uint16_t col) {
  float r = s * .42f;
  g.fillCircle(x - s * .4f, y - s * .35f, r, col); g.fillCircle(x + s * .4f, y - s * .35f, r, col);
  g.fillTriangle(x - s * .8f, y - s * .2f, x + s * .8f, y - s * .2f, x, y + s * .62f, col);
}
void Ojos::estrella(float x, float y, float s, uint16_t col) {      // destello de 4 puntas
  float t = s * .22f;
  g.fillTriangle(x - t, y, x + t, y, x, y - s, col); g.fillTriangle(x - t, y, x + t, y, x, y + s, col);
  g.fillTriangle(x, y - t, x, y + t, x - s, y, col); g.fillTriangle(x, y - t, x, y + t, x + s, y, col);
}

void Ojos::ojo(float ex, float ey, float er, int sd, uint32_t ms) {
  float hue = st.hue, tm = T(ms);
  if (activo(REMOLINO)) {                                    // mareado: espirales que giran (cada ojo en un sentido)
    uint16_t col = hsl565(fmodf(hue + 280, 360), 100, 72); float giro = tm / 140 * sd;
    float px = ex, py = ey;
    for (float t = .3f; t < PI_F * 6; t += .3f) {
      float r = er * .95f * t / (PI_F * 6), x = ex + cosf(t + giro) * r, y = ey + sinf(t + giro) * r;
      g.drawWideLine(px, py, x, y, er * .065f, col); px = x; py = y;
    }
    return;
  }
  if (activo(CORAZON)) { float lat = 1 + .12f * sinf(tm / 120); corazon(ex, ey, er * .9f * lat, hsl565(335, 100, 66)); return; }
  if ((activo(GUINO) && sd > 0) || activo(FELIZ)) { arcoFeliz(ex, ey, er, hsl565(hue, 100, 70)); return; }
  if (activo(BOSTEZO)) {                                     // ojos apretados, rayita dormilona
    uint16_t col = hsl565(hue, 90, 70); float k = er * .5f;
    float px = ex - k, py = ey;
    for (int i = 1; i <= 8; i++) {
      float t = i / 8.0f, x = ex - k + 2 * k * t, y = ey + 2 * (1 - t) * t * k * .35f;
      g.drawWideLine(px, py, x, y, er * .085f, col); px = x; py = y;
    }
    return;
  }
  // un gesto con ojos propios manda sobre los ojos del estado (contento ^^, error X, dormido)
  bool deGesto = activo(SORPRESA) || activo(DUDA) || activo(TRISTE) || activo(GUINO);
  float esc = 1;
  if (activo(SORPRESA)) esc = 1.25f;
  if (activo(DUDA) && sd < 0) esc = .8f;                     // un ojo más pequeño que el otro: ¿eh?
  if (st.x > .5f && !deGesto) {                              // error: X
    uint16_t col = hsl565(0, 100, 60); float k = er * .55f;
    g.drawWideLine(ex - k, ey - k, ex + k, ey + k, er * .1f, col); g.drawWideLine(ex + k, ey - k, ex - k, ey + k, er * .1f, col);
    return;
  }
  if (st.happy > .5f && !deGesto) { arcoFeliz(ex, ey, er, hsl565(hue, 100, 70)); return; }
  if (st.sleep > .5f && !deGesto) {                          // dormido: ojos cerrados
    float w = er * .14f;
    g.fillArc(ex, ey - er * .15f, er * .6f - w / 2, er * .6f + w / 2, 27, 153, hsl565(hue, 60, 52));
    return;
  }
  float lid = fmaxf(.06f, 1 - sinf(st.blink * PI_F));
  float rx = er * st.eye * esc, ry = rx * lid, ky = st.eye * esc * lid;
  g.fillEllipse(ex, ey, rx * 1.1f, ry * 1.1f + 1, rgb565(150, 132, 160));   // aro del ojo
  // iris: degradado vertical (azul noche → verde agua → rosa) línea a línea
  float ox = st.lx * er * .18f, oy = st.ly * er * .14f;
  int lim = (int)floorf(ry);
  for (int yy = -lim; yy <= lim; yy++) {
    float half = rx * sqrtf(fmaxf(0, 1 - (yy * yy) / (ry * ry)));
    float t = fmaxf(0, fminf(1, ((yy / fmaxf(1, ry)) * er - oy + er) / (2 * er)));
    uint16_t col;
    if (t < .45f) col = mezcla(7, 8, 26, 18, 24, 56, t / .45f);
    else if (t < .72f) col = mezcla(18, 24, 56, 70, 215, 190, (t - .45f) / .27f);
    else col = mezcla(70, 215, 190, 245, 125, 175, (t - .72f) / .28f);
    g.drawFastHLine(ex - half, ey + yy, half * 2, col);
  }
  g.fillEllipse(ex + ox * esc, ey + (oy - er * .05f) * ky, er * .52f * esc * st.eye, er * .52f * ky, rgb565(3, 3, 12));   // pupila
  for (const Brillo& b : BRILLOS) {                          // purpurina que titila dentro del iris
    float tw = .5f + .5f * sinf(tm / 300 * b.s + b.p);
    if (tw < .35f) continue;
    g.fillCircle(ex + (ox + cosf(b.a) * b.d * er) * esc, ey + (oy + sinf(b.a) * b.d * er * .9f) * ky, 1 + tw, mezcla(60, 40, 70, 255, 230, 245, tw));
  }
  float h2x = st.lx * er * .07f, h2y = st.ly * er * .05f;   // reflejos blancos
  g.fillEllipse(ex + (-er * .3f + h2x) * esc, ey + (-er * .38f + h2y) * ky, er * .27f * esc, er * .24f * ky, rgb565(245, 245, 245));
  g.fillCircle(ex + (er * .38f + h2x) * esc, ey + (er * .28f + h2y) * ky, fmaxf(1, er * .09f * fminf(esc, ky * 1.2f)), rgb565(245, 245, 245));
  if (lid > .5f) {
    float t1 = .6f + .4f * sinf(tm / 250 + sd), t2 = .6f + .4f * sinf(tm / 330 + sd * 2);
    estrella(ex + (-er * .4f + ox) * esc, ey + (-er * .05f + oy) * ky, er * .14f * t1, rgb565(215, 170, 255));
    estrella(ex + (er * .15f + ox) * esc, ey + (er * .45f + oy) * ky, er * .12f * t2, rgb565(255, 170, 230));
  }
  if (activo(TRISTE)) {                                      // párpado caído en diagonal (más bajo hacia fuera)
    float yIn = sd > 0 ? -er * .55f : -er * .05f, yOut = sd > 0 ? -er * .05f : -er * .55f;
    float x0 = ex - er * 1.3f, x1 = ex + er * 1.3f, y0 = ey - er * 1.3f;
    g.fillTriangle(x0, y0, x1, y0, x1, ey + yOut, FONDO); g.fillTriangle(x0, y0, x1, ey + yOut, x0, ey + yIn, FONDO);
    g.drawWideLine(ex - er * 1.05f, ey + (sd > 0 ? -er * .5f : -er * .1f), ex + er * 1.05f, ey + (sd > 0 ? -er * .1f : -er * .5f), er * .05f, hsl565(hue, 80, 65));
  }
}

void Ojos::flotar(const char* txt, int n, float x0, float periodo, uint32_t ms) {   // Z dormido, ? dudando
  for (int i = 0; i < n; i++) {
    float f = fmodf(T(ms) / periodo + (float)i / n, 1), al = sinf(f * PI_F);
    float px = x0 + f * 34 + sinf(f * 6 + i) * 5, py = 78 - f * 52;
    g.drawString(txt, px, py, f < .3f ? F_PEQUE : F_MEDIA, hsl565(st.hue, 100, 8 + 70 * al));
  }
}

void Ojos::aro(float lvl) {                                  // aro de luz en el borde redondo (el "brillo" del casco); encima de todo
  g.fillArc(C, C, 113, 120, 0, 360, hsl565(st.hue, 100, 6 + 34 * fminf(1.2f, lvl)));
  if (st.camara) g.fillArc(C, C, 106, 113, 0, 360, rgb565(230, 30, 30));
}

void Ojos::dibujar(uint32_t ms) {
  if (!brillosListos) prepararBrillos();
  float hue = st.hue, lvl = nivel(ms), tm = T(ms);
  g.fillScreen(FONDO);
  if (st.codigo[0]) {                                        // emparejando: el código que hay que escribir en el panel
    g.drawString("EMPAREJAR", C, 62, F_MEDIA, hsl565(40, 100, 70));
    g.drawString(st.codigo, C, 118, F_GRANDE, hsl565(40, 100, 60 + 10 * sinf(tm / 300)));
    g.drawString("Escribelo en el panel", C, 168, F_PEQUE, hsl565(40, 60, 70));
    g.drawString("Ajustes > Dispositivos", C, 188, F_PEQUE, hsl565(40, 40, 55));
    aro(lvl); return;
  }
  if (activo(RELOJ)) {                                       // la hora en grande en vez de los ojos
    time_t ahora = time(nullptr); struct tm d; localtime_r(&ahora, &d);
    char hora[8]; snprintf(hora, sizeof hora, (ms / 500) % 2 ? "%02d:%02d" : "%02d %02d", d.tm_hour, d.tm_min);
    g.drawString(hora, C, 108, F_GRANDE, hsl565(hue, 100, 70));
    static const char* DIAS[7] = {"DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"};
    char fecha[20]; snprintf(fecha, sizeof fecha, "%s %d", DIAS[d.tm_wday], d.tm_mday);
    g.drawString(fecha, C, 150, F_PEQUE, hsl565(hue, 100, 60));
  } else {
    float bx = st.lx * 10, by = st.ly * 8;                   // la mirada también desplaza un poco los ojos (no hay cuello)
    for (int sd = -1; sd <= 1; sd += 2) ojo(C + sd * 54 + bx, 114 + by, 38, sd, ms);
  }
  if (st.sleep > .5f && ms >= st.gHasta) flotar("Z", 3, 150, 2600, ms);
  if (activo(DUDA)) flotar("?", 2, 160, 1400, ms);
  if (st.msg[0] && (st.estado != PERMISO || (ms / 450) % 2)) {
    float tw = g.textWidth(st.msg, F_PEQUE) + 14;
    g.fillRoundRect(C - tw / 2, 170, tw, 24, 6, rgb565(0, 0, 0));
    g.drawRoundRect(C - tw / 2, 170, tw, 24, 6, hsl565(hue, 100, 60));
    g.drawString(st.msg, C, 182, F_PEQUE, hsl565(hue, 100, 72));
  }
  aro(lvl);
  if (st.escuchando) {                                       // push-to-talk: punto rojo arriba
    g.fillCircle(C, 30, 7 + 2 * sinf(tm / 120), rgb565(240, 40, 40));
    g.drawString("TE ESCUCHO", C, 50, F_PEQUE, rgb565(240, 90, 90));
  } else if (st.camara) g.drawString("CAMARA", C, 34, F_PEQUE, rgb565(240, 60, 60));
  else if (!st.conectado) g.drawString("SIN CONEXION", C, 34, F_PEQUE, rgb565(120, 120, 130));
}
