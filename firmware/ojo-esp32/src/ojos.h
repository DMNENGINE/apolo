// Ojos del casco para la pantalla redonda GC9A01. Traducción línea a línea de tools/ojo-dibujo.js
// (la fuente de verdad, que también usa el simulador tools/simulador-ojo.html). Mismos nombres y constantes.
#pragma once
#define LGFX_USE_V1
#include <LovyanGFX.hpp>

enum { F_PEQUE = 2, F_MEDIA = 4, F_GRANDE = 7 };

// lienzo con la misma API que el lienzo de <canvas> del simulador (floats → enteros de LovyanGFX)
class Lienzo {
 public:
  explicit Lienzo(LGFX_Sprite& s) : s(s) {}
  void fillScreen(uint16_t c) { s.fillScreen(c); }
  void fillCircle(float x, float y, float r, uint16_t c) { s.fillCircle(lroundf(x), lroundf(y), r < .5f ? 0 : lroundf(r), c); }
  void fillEllipse(float x, float y, float rx, float ry, uint16_t c) { s.fillEllipse(lroundf(x), lroundf(y), rx < 1 ? 1 : lroundf(rx), ry < 1 ? 1 : lroundf(ry), c); }
  void fillArc(float x, float y, float r0, float r1, float a0, float a1, uint16_t c) { s.fillArc(lroundf(x), lroundf(y), lroundf(r0 < 0 ? 0 : r0), lroundf(r1), a0, a1, c); }
  void drawWideLine(float x0, float y0, float x1, float y1, float r, uint16_t c) { s.drawWideLine(x0, y0, x1, y1, r, c); }
  void fillTriangle(float x0, float y0, float x1, float y1, float x2, float y2, uint16_t c) {
    s.fillTriangle(lroundf(x0), lroundf(y0), lroundf(x1), lroundf(y1), lroundf(x2), lroundf(y2), c);
  }
  void drawFastHLine(float x, float y, float w, uint16_t c) { s.drawFastHLine(lroundf(x), lroundf(y), lroundf(w), c); }
  void fillRoundRect(float x, float y, float w, float h, float r, uint16_t c) { s.fillRoundRect(lroundf(x), lroundf(y), lroundf(w), lroundf(h), lroundf(r), c); }
  void drawRoundRect(float x, float y, float w, float h, float r, uint16_t c) { s.drawRoundRect(lroundf(x), lroundf(y), lroundf(w), lroundf(h), lroundf(r), c); }
  void drawString(const char* t, float x, float y, int f, uint16_t c) {
    fuente(f); s.setTextDatum(textdatum_t::middle_center); s.setTextColor(c); s.drawString(t, lroundf(x), lroundf(y));
  }
  float textWidth(const char* t, int f) { fuente(f); return s.textWidth(t); }

 private:
  void fuente(int f) { s.setFont(f == F_GRANDE ? &fonts::Font7 : f == F_MEDIA ? &fonts::Font4 : &fonts::Font2); }
  LGFX_Sprite& s;
};

enum Estado { REPOSO, TRABAJANDO, PERMISO, LISTO, ERROR_, DORMIDO, N_ESTADOS };
enum Gesto { G_NINGUNO, FELIZ, TRISTE, DUDA, SORPRESA, GUINO, CORAZON, REMOLINO, BOSTEZO, RELOJ, N_GESTOS };

int estadoDeNombre(const char* n);   // -1 si no existe
int gestoDeNombre(const char* n);    // G_NINGUNO si no existe

struct EstadoOjos {
  int estado = REPOSO; char msg[40] = "";
  float hue = 145, eye = 1, glow = .5f, happy = 0, x = 0, sleep = 0;
  int gesto = G_NINGUNO; uint32_t gIni = 0, gHasta = 0;
  float react = 0; int prev = REPOSO; char prevMsg[40] = "";
  float blink = 0, blinkT = 2, lx = 0, ly = 0, tx = 0, ty = 0, mx = 0, my = 0, sacadaT = 0;
  uint32_t mirarHasta = 0, ahora = 0;
  char codigo[8] = "";
  bool escuchando = false, camara = false, conectado = true;
};

class Ojos {
 public:
  explicit Ojos(Lienzo& g) : g(g) {}
  EstadoOjos st;
  void ponerEstado(int nombre, const char* msg = "");
  void flash(int nombre, const char* msg, float secs);
  void gesto(int nombre, float secs = 3, const char* msg = nullptr);   // msg != nullptr → cara despierta + ese texto
  void mirar(float x, float y, float secs = 3);
  void paso(uint32_t ms, float dt);
  void dibujar(uint32_t ms);
  bool activo(int n) const { return st.gesto == n && st.ahora < st.gHasta; }

 private:
  Lienzo& g;
  float nivel(uint32_t ms);
  void aro(float lvl);
  void arcoFeliz(float ex, float ey, float er, uint16_t col);
  void corazon(float x, float y, float s, uint16_t col);
  void estrella(float x, float y, float s, uint16_t col);
  void ojo(float ex, float ey, float er, int sd, uint32_t ms);
  void flotar(const char* txt, int n, float x0, float periodo, uint32_t ms);
};
