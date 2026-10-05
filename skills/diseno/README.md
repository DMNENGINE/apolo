# Skills de diseño de APOLO

Paquete abierto (MIT) de 9 skills para que cualquier agente diseñe interfaces con criterio profesional. Funcionan en APOLO y en cualquier herramienta que lea el formato estándar `SKILL.md` (Claude Code, Codex…).

| Skill | Para qué |
|---|---|
| `diseno-fundamentos` | La base: espaciado de 8, tipografía, color y contraste, jerarquía, estados, modo oscuro, áreas táctiles |
| `diseno-accesibilidad` | WCAG 2.2 AA en la práctica: contraste, teclado, foco, lectores de pantalla, formularios |
| `diseno-formularios-acceso` | Login, registro, OTP, recuperar contraseña, passkeys, validación |
| `diseno-onboarding` | Primera experiencia, personalización, pedir permisos, checklists, estados vacíos |
| `diseno-checkout-pagos` | Carrito, checkout, pago exprés, confirmación, paywalls y suscripciones |
| `diseno-dashboards-datos` | Dashboards, KPIs, qué gráfico usar, tablas de datos, filtros y acciones en bloque |
| `diseno-web-marketing` | Landing pages, hero, prueba social, página de precios, FAQ, footer |
| `diseno-navegacion-estados` | Navegación, modales, toasts, carga (esqueletos y progreso), errores, acciones destructivas |
| `diseno-revision` | Proceso completo y autocrítica: referencias → construir → capturar → revisar con heurísticas |

## Instalar

- **APOLO:** Panel → Skills → Explorar → busca «diseño» → Instalar → Activar. Desde la CLI: `apolo --simple` y `/skill add DMNENGINE/apolo/skills/diseno/diseno-fundamentos` (una por skill).
- **Claude Code:** copia las carpetas a `~/.claude/skills/`.

APOLO carga sola la skill adecuada según lo que pidas (`metadata.apolo.disparadores`: «diséñame el login» → formularios-acceso + fundamentos).

## Origen del contenido

Texto propio, escrito a partir de **guías públicas**: Apple Human Interface Guidelines, Material Design 3, WCAG 2.2 (W3C), WAI-ARIA Authoring Practices, las 10 heurísticas de usabilidad de Jakob Nielsen y Laws of UX. No contiene capturas, textos ni datos de servicios de pago (Mobbin u otros).

Si tienes una cuenta de **Mobbin** (Pro o superior), APOLO puede además estudiar ejemplos reales con **tu** cuenta (Panel → Diseño → Conectar Mobbin). Ese aprendizaje queda en tu PC y no forma parte de este paquete.

## Contribuir

Una skill = una carpeta con `SKILL.md`. Reglas: contenido propio o con licencia libre, reglas concretas y comprobables (medidas, umbrales, orden), sección «Errores típicos» y disparadores que no salten con temas que no son de diseño.
