# Craft Anything — guía (entender cualquier software y recrearlo)

Analiza cómo funciona un programa, una web, una app Android/.NET/Java/Electron o un formato de archivo **con evidencias**, y ayuda a construir uno propio. Apache-2.0 (github.com/storytold/craft-anything). v0.5.0, ~320 herramientas por conjuntos.

## Reglas de la app (verificadas 2026-11-07)
- Empieza con `core_session_show` y `core_investigation_show`. Por defecto está en **clean-room** (no lee el código interno del objetivo, solo observa su comportamiento): lo correcto para recrear algo sin copiarlo.
- Al principio solo están las **Essentials** (36). Activa lo que haga falta: `list_toolsets` → `enable_toolset {id}`: `browser` (webs), `native` (programas .exe), `managed` (.NET), `android`/`adb` (apps y móvil conectado), `javascript` (Electron), `formats` (formatos de archivo), `runtime`/`frida` (programas en marcha), `application` (comparar y reconstruir), `projects`, `build`.
- Abre el objetivo con `core_target_open` (**ruta absoluta**) o, con `browser`, `web_site_open`.
- Pide resúmenes primero y pagina para el detalle. Cita los ids de evidencia y separa lo observado de lo deducido.
- Lleva la memoria de la investigación: `core_brief_write`, `core_plan_update`, `core_hypothesis_record`, `core_finding_record` (con ids de evidencia) y `core_handoff_write` al final de cada turno. Informe: `core_report_write` / `core_report_save`.
- ⚠ Lo que ejecuta código, toca un móvil o instrumenta procesos (`runtime`, `frida`, `adb`): pide permiso al usuario y explica qué vas a hacer. Solo sobre software propio o con permiso del dueño; nunca para saltarse licencias o protecciones.

## Uso típico
- "¿Cómo funciona esta web/app?" → `enable_toolset browser` → `web_site_open` → capturas y estados de página → hallazgos con evidencia → informe.
- "Hazme algo como X" → investiga el comportamiento (clean-room) → informe con requisitos → construye el proyecto nuevo con tus herramientas de código → `rebuild_check` para comparar el resultado con el original.
