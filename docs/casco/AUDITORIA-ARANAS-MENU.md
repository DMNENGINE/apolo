# Revisión funcional de las arañas y del menú

## Qué hace cada araña y qué se corrigió

| Araña | Trabajo real | Correcciones |
|---|---|---|
| Lectora | Extrae el texto y lo resume por partes, con informe y referencias. | Rechaza páginas vacías, evita repetir páginas idénticas y comprueba los destinos al seguir páginas. Los informes ya no se sobrescriben por compartir título y minuto. |
| Detectora de IA | Estima señales de estilo; no prueba quién escribió el texto. | Analiza los párrafos por lotes, sin el recorte silencioso de cuarenta párrafos/1.200 caracteres. Informa cobertura y errores; no usa la estimación como una acusación de autoría. |
| Código | Revisa código y propone arreglos. | Recorre los bloques completos por fragmentos, en vez de quedarse con catorce bloques/6.000 caracteres. Solo conserva hallazgos con referencia válida, frase literal y arreglo. |
| Discord | Recoge actividad mediante el bot en la Pi y resume lo capturado. | Paginación desde lo reciente, límites de captura explícitos, mensajes sin el corte de 700 caracteres, resumen por lotes y errores de acceso separados de ausencia de actividad. Los pendientes son candidatos a revisar. |
| Radar | Consulta GitHub y Hugging Face y selecciona novedades. | Rechaza recomendaciones ajenas a los candidatos, no presenta vistos como nuevos y guarda la memoria de vistos después del informe. Tiene selección básica de respaldo si falla el modelo. |

Discord devuelve los mensajes de más reciente a más antiguo; el recolector usa
`before` para continuar hacia atrás, de acuerdo con la
[documentación oficial](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx#get-channel-messages).
El intervalo de días se aplica a los repos nuevos de GitHub; Hugging Face aporta
tendencias actuales, y «nuevo» distingue lo no visto por este radar.

La animación comparte el motor, pero cada tipo conserva su propia lista de
palabras y su progreso. Repetir un tipo retira su equipo anterior. El texto
enviado al análisis excluye formularios, zonas editables, contenido oculto y
la interfaz de las propias arañas.

## Ctrl + Alt + clic derecho

- La selección manda: un archivo no compatible o varios archivos nunca se
  sustituyen por la pestaña activa. Texto y código locales se leen directamente.
- El menú muestra por qué una araña no está disponible; las acciones
  predeterminadas usan las mismas condiciones que el grupo de arañas.
- La pestaña debe coincidir con la ventana donde se abrió el menú. Si se cerró
  una pestaña elegida, se rechaza la acción en vez de escoger otra.
- Los errores asíncronos llegan a la isla. Guardar y borrar actualiza el contexto.
- Los eventos de una ventana anterior no pueden actuar sobre el menú nuevo.
  El paso del ratón ya no reconstruye toda la lista de opciones.
- El gancho solo anuncia que está listo después de registrar el atajo; sus
  errores de arranque se notifican y permiten el reintento. El gancho termina
  al salir su proceso padre, para no dejar capturas activas tras reiniciar APOLO.

## Límites reales

La lectura directa admite archivos de texto y código. PDF, Word y RTF necesitan
un extractor adicional: se indican como no compatibles, sin simular un análisis
ni cambiar de objetivo. Un HTML local debe abrirse en el navegador.

El alcance de Discord depende de los permisos del bot y de los límites por canal
y servidor; el informe muestra lo capturado y lo resumido. No se ha accedido a
credenciales ni se ha hecho una prueba contra los servidores reales del usuario.
La calidad de las respuestas del modelo no se certifica con estas pruebas.

## Comprobaciones

- `node --test core/test/aranas-logica.test.js core/test/menu-apolo.test.js`:
  cinco roles, archivos locales, objetivos, errores, evidencias y navegación del menú.
- La paginación Python se ejecuta con una API falsa y reloj fijo; no lee secretos
  ni abre conexiones. Conserva los 150 mensajes recientes y sus textos completos.
- `node tools/galeria-aranas.cjs salida.png`: lectura visible, exclusión de campos
  editables, tres trabajos independientes y rutas de regreso al casco.
- Capturas del menú y comprobación de opciones habilitadas/deshabilitadas en
  `repair-backups/aranas-logica/`. El C# del gancho se compiló sin instalar otro gancho
  ni simular clics globales durante la prueba.
- Las API públicas de GitHub, modelos, espacios y artículos de Hugging Face
  respondieron HTTP 200 sin credenciales. La integración del núcleo se probó
  con respuestas controladas.
- Batería completa del núcleo: `cd core; npm test`.

Para usar la nueva l?gica en una extensi?n de Chrome ya cargada, recarga la
extensi?n y la p?gina donde estaban las ara?as.
