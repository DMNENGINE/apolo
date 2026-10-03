# Guion — vídeo demo de APOLO v0.2.0

Formato: vertical 1080x1920, 60–75 s, voz en off (Fish Audio / edge-tts) + música. Versión horizontal de 2 min para YouTube/README con las mismas escenas más largas.
Regla: todo grabado de verdad, nada simulado. Usa gemma4:31b-cloud o qwen local en pantalla para dejar claro que "funciona con cualquier modelo".

| # | Seg | Plano | Voz en off |
|---|---|---|---|
| 1 | 0–3 | Primer plano del casco 3D en la isla despertando (bostezo → feliz) | "Este es APOLO. Tu agente. En tu PC." |
| 2 | 3–9 | Panel → Skills → Explorar → Instalar una skill → el antivirus la pone en cuarentena con el informe | "Instala cualquier skill de Claude, Codex o Cursor… y antes de usarla, la pasa por su antivirus." |
| 3 | 9–18 | Mission Control → Consejo: 4 columnas (gemma, qwen, ChatGPT, haiku) debatiendo → veredicto 100 % | "¿Dudas? Convoca un consejo: cuatro IAs debaten y votan en directo." |
| 4 | 18–26 | Turno de noche: se añaden 2 encargos, corte a negro "08:00", vídeo-resumen de la mañana | "Déjale trabajo antes de dormir. Por la mañana te enseña lo que hizo… en su propia rama, sin tocar la tuya." |
| 5 | 26–33 | Bloc de notas escribiéndose solo, borde rojo; mano mueve el ratón → se para al instante | "Usa tu ratón y teclado. Y si lo tocas tú, se para. Al momento." |
| 6 | 33–40 | Móvil: llega un permiso peligroso → PIN → aprobado; luego escritorio remoto | "Apruébale cosas desde el móvil. O controla tu PC desde el sofá." |
| 7 | 40–47 | El ojo ESP32 físico (o simulador) cambiando de gesto con un permiso; botón físico | "Y tiene cuerpo: un ojo de 25 dólares que te imprimes." |
| 8 | 47–54 | Overlay de OBS sobre un juego: el robot contesta al chat de Twitch | "Hasta de co-host en tus directos." |
| 9 | 54–62 | Wrapped: 3 tarjetas pasando rápido (horas ahorradas, modelo favorito, racha) | "Y cada semana, tu resumen para presumir." |
| 10 | 62–70 | Logo APOLO + "Open source · MIT · Cualquier modelo" + github.com/DMNENGINE/apolo | "APOLO. Open source. Gratis. Con el modelo que tú quieras." |

## Tomas que hay que grabar (checklist)
- [ ] Isla despertando (gesto bostezo) — 1080x1920 recortado
- [ ] Instalar una skill desde Explorar (p. ej. `frontend-design`) con el informe del escáner visible
- [ ] Consejo con 4 modelos (pregunta corta: "¿PLA o PETG para el casco del robot?")
- [ ] Turno de noche con 2 encargos en un repo de prueba + el vídeo-resumen generado
- [ ] Manos: Bloc de notas + pánico al mover el ratón
- [ ] Móvil: permiso con PIN + escritorio remoto (grabación de pantalla del móvil)
- [ ] Ojo (físico si ya está montado; si no, `tools/simulador-ojo.html`)
- [ ] Overlay OBS con chat de Twitch real
- [ ] Wrapped semanal (exportar MP4 desde la página Wrapped y usar 3 tarjetas)

## Textos para publicar
- **X / Threads**: "Hice mi propio agente de IA open source: instala cualquier skill de Claude/Codex/Cursor y la pasa por un antivirus, pone a 4 IAs a debatir, trabaja mientras duermes y tiene un ojo físico de 25 $. Funciona con cualquier modelo, también local. 👇 github.com/DMNENGINE/apolo"
- **Show HN**: "Show HN: APOLO – open-source personal agent with a skill antivirus, model council and a $25 printable eye"
- **Reddit** (r/LocalLLaMA, r/selfhosted, r/ClaudeAI, r/3Dprinting): adaptar el enfoque a cada uno — local/gratis, autoalojado, skills de Claude, el ojo imprimible.
