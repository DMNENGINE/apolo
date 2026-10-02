// Pines y ajustes del ojo. Cambia aquí si cableas distinto (tabla completa en docs/ojo/README.md).
#pragma once

#if defined(PLACA_XIAO_S3)
  #define MODELO_PLACA      "xiao-esp32s3-sense"
  // pantalla GC9A01 (SPI)
  #define PIN_TFT_SCK       7    // D8
  #define PIN_TFT_MOSI      9    // D10
  #define PIN_TFT_CS        2    // D1
  #define PIN_TFT_DC        3    // D2
  #define PIN_TFT_RST      -1    // RST de la pantalla a 3V3 (o al EN de la placa)
  #define PIN_TFT_BL       -1    // BL a 3V3 (siempre encendida)
  // I2S compartido: el micro y el amplificador usan el mismo BCLK/WS (full-duplex, 16 kHz)
  #define PIN_I2S_BCLK      4    // D3  → INMP441 SCK + MAX98357A BCLK
  #define PIN_I2S_WS        5    // D4  → INMP441 WS  + MAX98357A LRC
  #define PIN_MIC_SD        6    // D5  ← INMP441 SD
  #define PIN_AMP_DIN       43   // D6  → MAX98357A DIN
  // botones (a GND, pull-up interno)
  #define PIN_BOTON         1    // D0  Permitir / Denegar / pánico / hablar
  #define PIN_BOTON_HABLAR  44   // D7  opcional: push-to-talk dedicado (-1 si no lo montas)
  // LED de aviso de cámara: el LED naranja de la placa (GPIO21, activo en bajo) + aro rojo en pantalla
  #define PIN_LED_CAMARA    21
  #define LED_CAMARA_ON     LOW
  // cámara OV2640 de la placa Sense
  #define CAMARA            1
  #define CAM_PWDN -1
  #define CAM_RESET -1
  #define CAM_XCLK 10
  #define CAM_SIOD 40
  #define CAM_SIOC 39
  #define CAM_Y9 48
  #define CAM_Y8 11
  #define CAM_Y7 12
  #define CAM_Y6 14
  #define CAM_Y5 16
  #define CAM_Y4 18
  #define CAM_Y3 17
  #define CAM_Y2 15
  #define CAM_VSYNC 38
  #define CAM_HREF 47
  #define CAM_PCLK 13
#else  // PLACA_DEVKIT_S3: ESP32-S3-DevKitC-1
  #define MODELO_PLACA      "esp32s3-devkitc-1"
  #define PIN_TFT_SCK       12
  #define PIN_TFT_MOSI      11
  #define PIN_TFT_CS        10
  #define PIN_TFT_DC        9
  #define PIN_TFT_RST       14
  #define PIN_TFT_BL        13
  #define PIN_I2S_BCLK      4
  #define PIN_I2S_WS        5
  #define PIN_MIC_SD        6
  #define PIN_AMP_DIN       7
  #define PIN_BOTON         0    // el botón BOOT de la placa sirve para probar
  #define PIN_BOTON_HABLAR  -1
  #define PIN_LED_CAMARA    21   // LED rojo externo con resistencia de 330 Ω
  #define LED_CAMARA_ON     HIGH
  #define CAMARA            0
#endif

// ---------- ajustes ----------
#define SPI_FREQ_TFT        80000000   // baja a 40 MHz si ves rayas con cables largos
#define FPS_OBJETIVO        40
#define AUDIO_HZ            16000
#define MAX_GRABACION_MS    30000
#define PUERTO_POR_DEFECTO  47901
#define RED_PORTAL          "APOLO-Ojo"   // red WiFi del portal de configuración
#define MS_LARGA            700           // mantener = Denegar (si hay permiso) · hablar (si no lo hay)
#define MS_EMPEZAR_HABLAR   350
#define MS_DOBLE            350
