# Motor de tareas: actualización de APOLO 0.2.9

La actualización conserva los datos, las sesiones y la configuración existentes. Las opciones nuevas tienen valores predeterminados en el código y pueden modificarse desde la API de configuración del escritorio. No se añadieron dependencias obligatorias al núcleo ni se activaron reservas de pago o trabajos nuevos en segundo plano.

## Cambios al trabajar

- Las herramientas devuelven estados diferenciados: éxito, error, denegado, incierto y desconocido. Los adaptadores antiguos siguen admitidos; un texto no demuestra por sí mismo que una acción tuvo éxito.
- Shell conserva su código de salida y trata un tiempo agotado como resultado incierto. Crear o editar archivos verifica los bytes escritos. Navegador y MCP aportan estado del protocolo o de la observación, sin certificar una operación de negocio por una frase de la página.
- Las ejecuciones y operaciones se registran en `ejecuciones/`. Las llamadas duplicadas no repiten sus efectos. Un bloqueo exclusivo impide que dos coordinadores ejecuten simultáneamente el mismo efecto en el mismo ámbito.
- Una operación interrumpida puede necesitar conciliación antes de repetirse. En el inspector de conversación, **Trabajo pendiente y ejecuciones** permite revisar el estado, conciliar un efecto y continuar. Hay que comprobar primero el archivo o servicio real; una confirmación no se deduce automáticamente.
- Al reanudar, los efectos ya terminados se consultan en el historial y no se repiten automáticamente. Cada acción nueva conserva sus controles de permiso actuales.
- Los mensajes adicionales se encolan por sesión. En el panel, escribir y enviar mientras trabaja añade una corrección; enviar con la caja vacía conserva la acción de detener. Las correcciones recibidas mientras piensa descartan las acciones antiguas aún no ejecutadas.
- Los streams muestran texto provisional. Un stream incompleto no entrega llamadas parciales a herramientas. Si un proveedor rechaza streaming, se utiliza JSON temporalmente para ese modelo; un 429 o 503 no desactiva la visión.
- Los grupos de herramientas expiran y se seleccionan bajo un presupuesto. `buscar_herramientas` permite descubrir y cargar otras. Solo las lecturas expresamente marcadas como independientes se paralelizan; no se confunde “lectura” con permiso para paralelizar cualquier operación.

## Estados y límites

`completada` cierra un turno sin errores o efectos pendientes conocidos. `requiere_verificacion` significa que hubo efectos sin evidencia suficiente del resultado final. `incompleta` identifica errores pendientes, estancamiento o un límite alcanzado. Una operación de un servicio externo puede requerir una consulta o revisión humana adicional; este motor no garantiza exactamente una ejecución en servicios que no ofrecen idempotencia o consulta de estado.

Los presupuestos de tokens y gasto reservan recursos antes de llamar al modelo y usan el consumo devuelto cuando está disponible. En ausencia de consumo se usan estimaciones conservadoras. Los precios se configuran por millón de tokens de entrada y salida, en una moneda consistente elegida por el operador. Un límite monetario necesita precios conocidos. Esto es un control de admisión del cliente, no un tope de facturación impuesto al proveedor.

Valores predeterminados relevantes:

```json
{
  "recuperacion": {
    "reintentos": 2,
    "esperaMs": 300,
    "maxEsperaMs": 60000,
    "reservas": [],
    "permitirNube": false
  },
  "presupuesto": {
    "maxTokens": 200000,
    "maxDuracionMs": 900000,
    "maxCosto": 0,
    "precios": {}
  },
  "contexto": {
    "maxTokens": 24000,
    "maxSalida": 8192,
    "reserva": 2048,
    "herramientasTokens": 6000,
    "porModelo": {}
  },
  "cola": { "max": 20 },
  "agente": { "repeticiones": 3, "lecturasParalelas": 3, "streaming": true },
  "enrutamiento": { "habilitado": false, "reglas": [] }
}
```

El ensamblador reserva como mínimo `maxSalida`, aunque `reserva` sea menor. Los límites de contexto deben ajustarse a cada modelo cuando se conozcan. Las esperas por permisos forman parte del plazo de ejecución. Las reservas se configuran expresamente: los datos de un modelo local no pasan automáticamente a un servicio de nube con la política predeterminada.

El enrutamiento requiere habilitar la configuración y crear una sesión con `enrutamiento: true`. Las reglas contienen `palabras` y `modelo`; no ejecutan expresiones ni código. No modifican la selección fija de las otras sesiones. Los perfiles de subagente admiten `modelo`, `herramientas` y `soloLectura` bajo `subagentes.perfiles`. El hijo hereda los límites compartidos y no amplía la lista de herramientas ni el permiso de escritura del padre. Los hijos siguen sin delegar por defecto. Las dependencias deben referirse a hijos propios que hayan terminado.

## Contexto y memoria

El presupuesto incluye instrucciones, historial, descripciones y esquemas de herramientas, imágenes y espacio de salida. Las salidas largas se guardan como artefactos redactados privados de la sesión y pueden leerse por partes con `leer_resultado`. El contexto puede podar herramientas de un solo turno sin borrar el historial ni cortar parejas de llamadas y resultados.

Los recuerdos nuevos del agente incorporan procedencia asignada por el programa: sesión, fecha, clase de fuente, proyecto, usuario cuando exista, confianza y vigencia opcional. Los cambios conservan versiones del texto anterior. La confianza es una clasificación de origen, no una probabilidad aprendida de que el contenido sea verdadero.

El contenido de archivos, páginas y herramientas externas no se promociona como información fiable del usuario. Los recuerdos recuperados no se guardan de nuevo como evidencia independiente. Los recuerdos antiguos sin procedencia se conservan como memoria global heredada; no se borran ni se reclasifican como si conociéramos su origen. El sueño y el grafo globales no consolidan automáticamente los recuerdos nuevos con ámbito de proyecto. El historial reutiliza el índice de archivos sin cambios y filtra por proyecto y usuario.

## API del escritorio

Requiere el token maestro y las mismas comprobaciones de Host/Origin de la API existente:

- `POST /v1/sesiones/:id/mensajes`: admite cola y devuelve SSE con aceptación/progreso/resultado.
- `POST /v1/sesiones/:id/corregir` con `{ "texto": "..." }`: aplica la corrección en un punto seguro.
- `GET /v1/sesiones/:id/ejecuciones`: consulta los registros de esa sesión.
- `POST /v1/sesiones/:id/reanudar` con `{}` o `{ "entrada": "id-pendiente" }`: reanuda con nuevos permisos; no asume que una entrada interrumpida sigue autorizada.
- `POST /v1/sesiones/:id/conciliar` con `{ "ejecucion": "...", "operacion": "...", "decision": "confirmada" }` o `no_ocurrio`.
- `PATCH /v1/config`: admite presupuestos, recuperación, contexto, colas, enrutamiento y perfiles de subagente, con validación.

Corrección activa, reanudación y conciliación se reservan al escritorio. Las entradas de dispositivos se vuelven a autenticar antes de admitir trabajo y antes de ejecutar herramientas. Los eventos incluyen identidad de ejecución; el consumo puede verse por el modelo realmente utilizado. Los errores y fragmentos de texto pasan por la redacción de secretos.

## Banco de evaluación

`node tools/evaluar-agentes.cjs --listar` muestra 60 casos en seis familias. Son fixtures de archivos, páginas/documentos simulados, continuidad, memoria y seguridad. No equivalen a manejar una aplicación real de Windows ni a navegar por un servicio real.

`node tools/evaluar-agentes.cjs --autoprueba` comprueba el propio banco con un generador de resultados de referencia; ese generador no es APOLO ni OpenClaw. El verificador inspecciona los archivos finales y conserva originales/protegidos. Decir “hecho” no aprueba una tarea. La autoprueba no consume APIs.

Para un agente real se proporciona un módulo de adaptador que exporta `ejecutar({caso, directorio, politica})`. El adaptador recibe la tarea y el directorio aislado, sin el resultado esperado. Puede devolver tokens y coste. Invocación explícita:

```text
node tools/evaluar-agentes.cjs --adaptador ./mi-adaptador.cjs --permitir-adaptador --modelo proveedor/modelo --version VERSION --presupuesto ./limites.json --repeticiones 3 --salida resultado-nuevo.json
node tools/evaluar-agentes.cjs --comparar resultado-apolo.json resultado-openclaw.json
```

El adaptador es código del operador y puede usar red o APIs de pago: no se ejecuta implícitamente. El arnés no es un sandbox de sistema operativo. Debe usarse en un entorno de prueba, con versiones fijadas, mismo modelo, corpus, repeticiones, presupuesto y permisos equivalentes. Las fixtures de referencia no son comparables con un agente real. El informe incluye tasas, intervalos, mediana, percentil 95 y coste cuando está disponible; la comparación pareada limita sus conclusiones a esos casos.

No se incluye una afirmación de superioridad frente a OpenClaw ni una validación de servicios externos con credenciales reales. Para evaluar escritorio/navegador reales hace falta añadir esos entornos y sus verificadores independientes; los casos simulados se identifican como tales.
