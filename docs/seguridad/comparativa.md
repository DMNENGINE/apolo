# Seguridad: APOLO vs OpenClaw (borrador honesto)

Reglas de este documento: lo de **APOLO** está verificado en su código (con el archivo). Lo de **OpenClaw** solo se rellena con
afirmaciones verificables (enlace a su documentación o código, con fecha) y se marca «según su documentación». Donde aún no lo hemos
comprobado pone **por verificar**: no inventamos datos de otro proyecto.

| Aspecto | APOLO (verificado) | OpenClaw |
|---|---|---|
| API local | 127.0.0.1 + token en cabecera; Host permitido (anti DNS rebinding); Origin ajeno → 403 (`core/daemon.js`, `core/seguridad.js`) | por verificar |
| Permisos por acción | lectura sola; escribir/ejecutar/controlar pregunta; peligroso siempre pregunta (`core/permisos.js`) | por verificar |
| Reglas «permitir siempre» | por primera palabra normalizada; nunca para comandos encadenados/envueltos | por verificar |
| Detección de comandos peligrosos | patrones + normalización + ofuscación (`shared/peligro.js`) | por verificar |
| Secretos | bóveda DPAPI (Windows) / safeStorage; config solo con referencia (`core/boveda.js`) | por verificar («secretos» aparece como sección de su panel; falta ver cómo se guardan) |
| Redacción en registros | sí, patrones + valores conocidos | por verificar |
| Registro de auditoría | encadenado SHA-256, quién aprobó, verificación por API | por verificar («aprobaciones» aparece en su panel) |
| Kill switch | uno global (API, atajo, isla, móvil, Stream Deck, ojo), persiste hasta reanudar | por verificar |
| Skills/plugins de terceros | instalados desactivados + escáner; plugins en proceso aparte con `--permission` de Node; entorno sin claves | por verificar |
| Sandbox de SO | **no todavía** (pendiente Windows Sandbox / token restringido) | por verificar |
| Móvil | token por dispositivo con alcance limitado; PIN/passkey para lo peligroso | por verificar |
| Modelo de amenazas público | `SECURITY.md` | por verificar |

Pendiente antes de publicar: revisar la documentación pública de OpenClaw y rellenar la columna con enlaces y fecha de consulta.
