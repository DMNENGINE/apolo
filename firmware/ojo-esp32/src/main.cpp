// Ojo de escritorio de APOLO (FASE 7.1) — firmware ESP32-S3.
// - WiFi: portal cautivo de WiFiManager (red "APOLO-Ojo") donde también se pone la IP del PC y el puerto (47901).
//   Mantén el botón al encender (3 s) para borrar WiFi + emparejamiento.
// - WebSocket al núcleo (core/nodos): hola → (código de 6 dígitos en pantalla → lo escribes en el panel) → token en NVS.
// - Pantalla GC9A01: los ojos del casco (src/ojos.cpp = tools/ojo-dibujo.js) en un sprite 240x240 (doble búfer) a ~40 fps.
// - Botón: corta = Permitir · mantener = Denegar (si hay permiso) o HABLAR (si no lo hay) · doble = pánico.
// - Micro INMP441 + altavoz MAX98357A por I2S full-duplex a 16 kHz: PCM s16le mono por WS en los dos sentidos.
// - Cámara (XIAO Sense): solo cuando el PC la pide tras TU permiso; LED + aro rojo en pantalla mientras dispara.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <freertos/stream_buffer.h>
#include <sys/time.h>
#include "config.h"
#include "ojos.h"
#if CAMARA
#include <esp_camera.h>
#endif

// ---------- pantalla (LovyanGFX, GC9A01 por SPI) ----------
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_GC9A01 panel; lgfx::Bus_SPI bus; lgfx::Light_PWM luz;
 public:
  LGFX() {
    { auto c = bus.config();
      c.spi_host = SPI2_HOST; c.spi_mode = 0; c.freq_write = SPI_FREQ_TFT; c.freq_read = 16000000;
      c.pin_sclk = PIN_TFT_SCK; c.pin_mosi = PIN_TFT_MOSI; c.pin_miso = -1; c.pin_dc = PIN_TFT_DC; c.dma_channel = SPI_DMA_CH_AUTO;
      bus.config(c); panel.setBus(&bus); }
    { auto c = panel.config();
      c.pin_cs = PIN_TFT_CS; c.pin_rst = PIN_TFT_RST; c.pin_busy = -1;
      c.panel_width = 240; c.panel_height = 240; c.invert = true; c.rgb_order = false; c.bus_shared = false;
      panel.config(c); }
#if PIN_TFT_BL >= 0
    { auto c = luz.config(); c.pin_bl = PIN_TFT_BL; c.invert = false; c.freq = 44100; c.pwm_channel = 7; luz.config(c); panel.setLight(&luz); }
#endif
    setPanel(&panel);
  }
};
static LGFX tft;
static LGFX_Sprite spr(&tft);
static Lienzo lienzo(spr);
static Ojos ojos(lienzo);

// ---------- estado ----------
static Preferences prefs;
static WebSocketsClient wsc;
static String host, token, idNodo;
static uint16_t puerto = PUERTO_POR_DEFECTO;
static bool conectado = false, emparejado = false, hayPermiso = false;
static StreamBufferHandle_t sbAltavoz, sbMicro;
static volatile bool grabando = false, reproduciendo = false;
static uint32_t grabandoDesde = 0, fotoPedida = 0, ledHasta = 0;

// ---------- audio I2S full-duplex (BCLK/WS compartidos) ----------
static void iniciarAudio() {
  i2s_config_t c = {};
  c.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX);
  c.sample_rate = AUDIO_HZ; c.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;   // el INMP441 da 24 bits en huecos de 32
  c.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT; c.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  c.dma_buf_count = 6; c.dma_buf_len = 256; c.use_apll = false; c.tx_desc_auto_clear = true;
  i2s_driver_install(I2S_NUM_0, &c, 0, nullptr);
  i2s_pin_config_t p = {};
  p.mck_io_num = I2S_PIN_NO_CHANGE; p.bck_io_num = PIN_I2S_BCLK; p.ws_io_num = PIN_I2S_WS;
  p.data_out_num = PIN_AMP_DIN; p.data_in_num = PIN_MIC_SD;
  i2s_set_pin(I2S_NUM_0, &p);
  sbAltavoz = xStreamBufferCreate(48 * 1024, 1);
  sbMicro = xStreamBufferCreate(16 * 1024, 1);
}
// tarea en el núcleo 0: altavoz (PCM 16 bits → estéreo 32 bits) y micro (32 bits → 16 bits, canal con señal)
static void tareaAudio(void*) {
  static int16_t pcm[256]; static int32_t marco[512];
  for (;;) {
    bool hizo = false;
    size_t n = xStreamBufferReceive(sbAltavoz, pcm, sizeof pcm, 0);
    if (n >= 2) {
      size_t m = n / 2;
      for (size_t i = 0; i < m; i++) { int32_t v = (int32_t)pcm[i] << 16; marco[2 * i] = v; marco[2 * i + 1] = v; }
      size_t w; i2s_write(I2S_NUM_0, marco, m * 8, &w, portMAX_DELAY); hizo = true;
    }
    if (grabando) {
      size_t r = 0; i2s_read(I2S_NUM_0, marco, sizeof marco, &r, pdMS_TO_TICKS(40));
      size_t m = r / 8; int64_t e0 = 0, e1 = 0;
      for (size_t i = 0; i < m; i++) { e0 += abs(marco[2 * i] >> 16); e1 += abs(marco[2 * i + 1] >> 16); }
      int canal = e1 > e0 ? 1 : 0;                           // el INMP441 (L/R a GND) habla por uno; el otro queda a cero
      for (size_t i = 0; i < m; i++) { int32_t v = marco[2 * i + canal] >> 14; pcm[i] = (int16_t)constrain(v, -32768, 32767); }
      if (m) xStreamBufferSend(sbMicro, pcm, m * 2, 0);
      hizo = true;
    }
    if (!hizo) vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ---------- cámara ----------
#if CAMARA
static bool camaraLista = false;
static bool iniciarCamara() {
  if (camaraLista) return true;
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0; c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = CAM_Y2; c.pin_d1 = CAM_Y3; c.pin_d2 = CAM_Y4; c.pin_d3 = CAM_Y5; c.pin_d4 = CAM_Y6; c.pin_d5 = CAM_Y7; c.pin_d6 = CAM_Y8; c.pin_d7 = CAM_Y9;
  c.pin_xclk = CAM_XCLK; c.pin_pclk = CAM_PCLK; c.pin_vsync = CAM_VSYNC; c.pin_href = CAM_HREF;
  c.pin_sccb_sda = CAM_SIOD; c.pin_sccb_scl = CAM_SIOC; c.pin_pwdn = CAM_PWDN; c.pin_reset = CAM_RESET;
  c.xclk_freq_hz = 20000000; c.pixel_format = PIXFORMAT_JPEG; c.frame_size = FRAMESIZE_SVGA; c.jpeg_quality = 12; c.fb_count = 1;
  c.fb_location = CAMERA_FB_IN_PSRAM; c.grab_mode = CAMERA_GRAB_LATEST;
  camaraLista = esp_camera_init(&c) == ESP_OK;
  return camaraLista;
}
#endif
static void led(bool on) { if (PIN_LED_CAMARA >= 0) digitalWrite(PIN_LED_CAMARA, on ? LED_CAMARA_ON : !LED_CAMARA_ON); }
static void hacerFoto() {
#if CAMARA
  if (!iniciarCamara()) { wsc.sendTXT("{\"tipo\":\"foto-error\",\"motivo\":\"no arranca la camara\"}"); return; }
  camera_fb_t* fb = esp_camera_fb_get();
  if (fb) esp_camera_fb_return(fb);                          // descarta el primero (exposición)
  fb = esp_camera_fb_get();
  if (!fb) { wsc.sendTXT("{\"tipo\":\"foto-error\",\"motivo\":\"captura fallida\"}"); return; }
  char cab[64]; snprintf(cab, sizeof cab, "{\"tipo\":\"foto-inicio\",\"bytes\":%u}", (unsigned)fb->len); wsc.sendTXT(cab);
  for (size_t off = 0; off < fb->len; off += 8192) wsc.sendBIN(fb->buf + off, min((size_t)8192, fb->len - off));
  wsc.sendTXT("{\"tipo\":\"foto-fin\"}");
  esp_camera_fb_return(fb);
#else
  wsc.sendTXT("{\"tipo\":\"foto-error\",\"motivo\":\"este ojo no tiene camara\"}");
#endif
}

// ---------- push-to-talk ----------
static void empezarHablar() {
  if (!emparejado || grabando) return;
  xStreamBufferReset(sbAltavoz); reproduciendo = false;        // si estaba hablando el PC, se calla
  xStreamBufferReset(sbMicro);
  wsc.sendTXT("{\"tipo\":\"audio-inicio\",\"frecuencia\":16000,\"bits\":16,\"canales\":1}");
  grabando = true; grabandoDesde = millis(); ojos.st.escuchando = true;
}
static void enviarMicro() {
  static uint8_t trozo[2048];
  size_t n;
  while ((n = xStreamBufferReceive(sbMicro, trozo, sizeof trozo, 0)) > 0) wsc.sendBIN(trozo, n);
}
static void pararHablar() {
  if (!grabando) return;
  grabando = false; delay(45); enviarMicro();
  wsc.sendTXT("{\"tipo\":\"audio-fin\"}");
  ojos.st.escuchando = false; ojos.gesto(DUDA, 2.5f, "PENSANDO...");
}

// ---------- WebSocket ----------
static void enviarHola() {
  JsonDocument d;
  d["tipo"] = "hola"; d["id"] = idNodo; d["nombre"] = prefs.getString("nombre", "Ojo de APOLO"); d["version"] = OJO_VERSION; d["modelo"] = MODELO_PLACA;
  JsonArray cap = d["capacidades"].to<JsonArray>();
  cap.add("pantalla"); cap.add("boton"); cap.add("micro"); cap.add("altavoz");
  if (CAMARA) cap.add("camara");
  if (token.length()) d["token"] = token;
  String s; serializeJson(d, s); wsc.sendTXT(s);
}
static void alMensaje(const char* txt, size_t len) {
  JsonDocument d; if (deserializeJson(d, txt, len)) return;
  const char* tipo = d["tipo"] | "";
  if (!strcmp(tipo, "emparejar")) { strlcpy(ojos.st.codigo, d["codigo"] | "", sizeof ojos.st.codigo); emparejado = false; }
  else if (!strcmp(tipo, "rechazado")) { token = ""; prefs.remove("token"); }
  else if (!strcmp(tipo, "emparejado")) { token = (const char*)(d["token"] | ""); prefs.putString("token", token); ojos.st.codigo[0] = 0; ojos.gesto(CORAZON, 2.5f, "EMPAREJADO"); }
  else if (!strcmp(tipo, "bienvenido")) {
    emparejado = true; ojos.st.codigo[0] = 0;
    long epoch = d["epoch"] | 0L, tzMin = d["tz"] | 0L;
    if (epoch > 1700000000L) { timeval tv = {epoch, 0}; settimeofday(&tv, nullptr); }
    char tz[24]; snprintf(tz, sizeof tz, "UTC%+ld:%02ld", -tzMin / 60, labs(tzMin) % 60); setenv("TZ", tz, 1); tzset();   // POSIX: signo al revés
    ojos.gesto(FELIZ, 1.5f, d["asistente"] | "HOLA");
  }
  else if (!strcmp(tipo, "estado")) { int e = estadoDeNombre(d["estado"] | ""); hayPermiso = e == PERMISO; ojos.ponerEstado(e, d["msg"] | ""); }
  else if (!strcmp(tipo, "flash")) ojos.flash(estadoDeNombre(d["estado"] | ""), d["msg"] | "", d["segundos"] | 2.0f);
  else if (!strcmp(tipo, "gesto")) { int g = gestoDeNombre(d["gesto"] | ""); if (g) ojos.gesto(g, d["segundos"] | 3.0f, d["msg"].is<const char*>() ? (const char*)d["msg"] : nullptr); }
  else if (!strcmp(tipo, "mirar")) ojos.mirar(d["x"] | 0.0f, d["y"] | 0.0f, d["segundos"] | 3.0f);
  else if (!strcmp(tipo, "permiso")) { hayPermiso = true; ojos.mirar(0, .2f, 2); }
  else if (!strcmp(tipo, "audio-inicio")) { xStreamBufferReset(sbAltavoz); reproduciendo = true; }
  else if (!strcmp(tipo, "audio-fin")) reproduciendo = false;
  else if (!strcmp(tipo, "oido")) { const char* t = d["texto"] | ""; if (*t) ojos.gesto(FELIZ, 2.5f, t); }
  else if (!strcmp(tipo, "foto")) { fotoPedida = millis(); ojos.st.camara = true; led(true); }   // aviso visible ~0.8 s antes de disparar
}
static void alEvento(WStype_t t, uint8_t* p, size_t len) {
  switch (t) {
    case WStype_CONNECTED: conectado = true; ojos.st.conectado = true; enviarHola(); break;
    case WStype_DISCONNECTED: conectado = false; emparejado = false; ojos.st.conectado = false; if (grabando) { grabando = false; ojos.st.escuchando = false; } break;
    case WStype_TEXT: alMensaje((const char*)p, len); break;
    case WStype_BIN: if (reproduciendo) xStreamBufferSend(sbAltavoz, p, len & ~1u, 0); break;
    default: break;
  }
}

// ---------- botones ----------
struct Boton { int pin; bool abajo = false; uint32_t desde = 0, ultimoCambio = 0; bool consumido = false; explicit Boton(int p) : pin(p) {} };
static Boton boton{PIN_BOTON}, botonHablar{PIN_BOTON_HABLAR};
static uint32_t clicPendiente = 0;
static void enviarBoton(const char* p) { if (!emparejado) return; char b[48]; snprintf(b, sizeof b, "{\"tipo\":\"boton\",\"pulsacion\":\"%s\"}", p); wsc.sendTXT(b); }
static bool leer(Boton& b) {                                   // con antirrebote; devuelve true si cambió
  if (b.pin < 0) return false;
  bool a = digitalRead(b.pin) == LOW; uint32_t ms = millis();
  if (a == b.abajo || ms - b.ultimoCambio < 25) return false;
  b.abajo = a; b.ultimoCambio = ms; if (a) { b.desde = ms; b.consumido = false; }
  return true;
}
static void botones() {
  uint32_t ms = millis();
  bool cambio = leer(boton);
  if (boton.abajo && !boton.consumido) {
    uint32_t t = ms - boton.desde;
    if (hayPermiso && t > MS_LARGA) { enviarBoton("larga"); boton.consumido = true; clicPendiente = 0; }
    else if (!hayPermiso && t > MS_EMPEZAR_HABLAR && emparejado) { empezarHablar(); boton.consumido = true; clicPendiente = 0; }
  }
  if (cambio && !boton.abajo) {                                // soltado
    if (grabando) pararHablar();
    else if (!boton.consumido) {
      if (clicPendiente && ms - clicPendiente < MS_DOBLE) { enviarBoton("doble"); clicPendiente = 0; }
      else clicPendiente = ms;
    }
  }
  if (clicPendiente && !boton.abajo && ms - clicPendiente >= MS_DOBLE) { enviarBoton("corta"); clicPendiente = 0; }
  if (leer(botonHablar)) { if (botonHablar.abajo) empezarHablar(); else pararHablar(); }
  if (grabando && ms - grabandoDesde > MAX_GRABACION_MS) pararHablar();
}

// ---------- WiFi + ajustes ----------
static void pantallaTexto(const char* a, const char* b, const char* c2 = "") {
  spr.fillScreen(0); lienzo.fillArc(120, 120, 113, 120, 0, 360, 0x0400);
  lienzo.drawString(a, 120, 86, F_MEDIA, 0x07E8); lienzo.drawString(b, 120, 122, F_PEQUE, 0xFFFF); lienzo.drawString(c2, 120, 146, F_PEQUE, 0xAD55);
  spr.pushSprite(0, 0);
}
static void configurarWiFi() {
  prefs.begin("apolo", false);
  // botón pulsado al encender durante 3 s → borra WiFi y emparejamiento
  pinMode(PIN_BOTON, INPUT_PULLUP);
  if (digitalRead(PIN_BOTON) == LOW) {
    pantallaTexto("BORRAR?", "Sigue pulsando 3 s", "para borrar WiFi y token");
    uint32_t t = millis(); while (digitalRead(PIN_BOTON) == LOW && millis() - t < 3000) delay(10);
    if (millis() - t >= 3000) { WiFiManager wm; wm.resetSettings(); prefs.clear(); pantallaTexto("BORRADO", "Reiniciando..."); delay(800); ESP.restart(); }
  }
  host = prefs.getString("host", ""); puerto = prefs.getUShort("puerto", PUERTO_POR_DEFECTO); token = prefs.getString("token", "");
  char sPuerto[8]; snprintf(sPuerto, sizeof sPuerto, "%u", puerto);
  WiFiManager wm;
  WiFiManagerParameter pHost("host", "IP del PC con APOLO (ej. 192.168.1.31)", host.c_str(), 40);
  WiFiManagerParameter pPuerto("puerto", "Puerto de nodos", sPuerto, 6);
  wm.addParameter(&pHost); wm.addParameter(&pPuerto);
  wm.setConfigPortalTimeout(600);
  wm.setAPCallback([](WiFiManager*) { pantallaTexto("CONFIGURAR", "Conectate a la WiFi", RED_PORTAL); });
  bool guardar = false; wm.setSaveParamsCallback([&guardar]() { guardar = true; });
  wm.setSaveConfigCallback([&guardar]() { guardar = true; });
  if (!host.length()) wm.setBreakAfterConfig(true);
  pantallaTexto("WIFI", "Conectando...");
  bool ok = host.length() ? wm.autoConnect(RED_PORTAL) : wm.startConfigPortal(RED_PORTAL);
  if (guardar || !host.length()) {
    host = pHost.getValue(); puerto = (uint16_t)atoi(pPuerto.getValue()); if (!puerto) puerto = PUERTO_POR_DEFECTO;
    prefs.putString("host", host); prefs.putUShort("puerto", puerto);
  }
  if (!ok || !host.length()) { pantallaTexto("SIN WIFI", "Reiniciando..."); delay(1500); ESP.restart(); }
}

void setup() {
  Serial.begin(115200);
  tft.init(); tft.setBrightness(200);
  spr.setColorDepth(16); spr.setPsram(false);
  if (!spr.createSprite(240, 240)) { spr.setPsram(true); spr.createSprite(240, 240); }   // 115 KB: mejor en RAM interna (más rápido)
  if (PIN_LED_CAMARA >= 0) { pinMode(PIN_LED_CAMARA, OUTPUT); led(false); }
  if (PIN_BOTON_HABLAR >= 0) pinMode(PIN_BOTON_HABLAR, INPUT_PULLUP);
  uint8_t mac[6]; WiFi.macAddress(mac);
  char id[20]; snprintf(id, sizeof id, "ojo-%02x%02x%02x", mac[3], mac[4], mac[5]); idNodo = id;
  configurarWiFi();
  WiFi.setSleep(false);                                        // menos latencia en el audio
  iniciarAudio();
  xTaskCreatePinnedToCore(tareaAudio, "audio", 6144, nullptr, 5, nullptr, 0);
  wsc.begin(host.c_str(), puerto, "/");
  wsc.onEvent(alEvento);
  wsc.setReconnectInterval(3000);
  wsc.enableHeartbeat(15000, 4000, 2);
  ojos.st.conectado = false;
}

void loop() {
  static uint32_t ultimo = millis();
  wsc.loop();
  botones();
  if (grabando) enviarMicro();
  if (fotoPedida && millis() - fotoPedida > 800) { hacerFoto(); fotoPedida = 0; ledHasta = millis() + 1500; }
  if (ledHasta && millis() > ledHasta) { ledHasta = 0; led(false); ojos.st.camara = false; }
  uint32_t ms = millis();
  if (ms - ultimo < 1000 / FPS_OBJETIVO) return;
  float dt = fminf(.05f, (ms - ultimo) / 1000.0f); ultimo = ms;
  ojos.paso(ms, dt);
  ojos.dibujar(ms);
  spr.pushSprite(0, 0);                                        // el sprite es el búfer de atrás: la pantalla nunca ve el dibujo a medias
}
