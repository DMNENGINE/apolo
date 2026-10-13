---
name: ui-ux-pro-max
description: Inteligencia de diseño UI/UX con base de datos local y buscador (79 estilos, 192 paletas por tipo de producto, 74 combinaciones de fuentes, 119 reglas de UX, 25 tipos de gráfica, 34 modelos de landing, 22 stacks). Genera un sistema de diseño completo (estilo, colores, fuentes, efectos, anti-patrones) para un producto concreto y responde dudas puntuales de UX, accesibilidad, color, tipografía, animación o de un stack. Úsala al diseñar, construir, revisar o arreglar una web, app, landing, panel o componente. Basada en ui-ux-pro-max-skill (nextlevelbuilder, MIT).
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: nextlevelbuilder (original, MIT) · adaptación DMN / APOLO
    origen: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
    disparadores: [sistema de diseño, design system, paleta de colores, paleta, combinación de fuentes, tipografía para, qué fuentes, qué colores, landing page, diseña una web, diseña una app, diseña la página, rediseña, ui ux, ui/ux, ux de, accesibilidad, contraste, dashboard, glassmorphism, neumorphism, bento, estilo visual, ui pro max]
---

# UI/UX Pro Max (inteligencia de diseño)

Base de datos local de diseño con un buscador. Úsala para decisiones visuales y de experiencia: qué estilo, qué colores, qué fuentes, cómo estructurar una landing, qué reglas de UX cumplir y cómo implementarlo en un stack.

**No la uses** para lógica de servidor, bases de datos, infraestructura o scripts sin parte visual.

Las skills `diseno-*` de APOLO siguen valiendo como base; esta añade datos concretos (paletas, fuentes y reglas por tipo de producto).

## Cómo buscar
El buscador es `scripts/search.py` (Python 3 sin dependencias, sin internet). Ejecútalo con `ejecutar_script_skill`:
- `nombre: ui-ux-pro-max`
- `script: scripts/search.py`
- `args:` la consulta y las opciones, cada una como un elemento de la lista.

**Los datos están en inglés: escribe la consulta en inglés,** con 2–5 palabras con sentido (tipo de producto, sector, estilo). Ejemplo: el usuario dice "una web para mi taller de camiones" → consulta `"truck repair shop service"`.

### 1. Proyecto o página nueva → sistema de diseño completo
`args: ["<producto> <sector> <estilo>", "--design-system", "-p", "<Nombre del proyecto>", "-f", "markdown"]`

Devuelve el patrón de página (secciones y dónde va la llamada a la acción), el estilo, la paleta con variables CSS, las fuentes con el enlace de Google Fonts, efectos y anti-patrones a evitar.

Ajustes opcionales (1–10), en la misma lista:
- `--variance`: 1–3 centrado y mínimo · 8–10 atrevido y asimétrico (brutalismo, bento).
- `--motion`: 1–3 microanimaciones sutiles · 8–10 coreografía compleja (añade un snippet de GSAP).
- `--density`: 1–3 espacioso (marketing) · 8–10 denso (dashboards).

Guardarlo en el proyecto (solo si el usuario quiere): añade `"--persist", "--output-dir", "<carpeta raíz del proyecto, ruta absoluta>"`. Crea `design-system/<proyecto>/MASTER.md`. Si ya existe no lo pisa; **nunca uses `--force` sin que el usuario lo pida**, y lee el MASTER.md existente antes de proponer cambios.

### 2. Duda concreta → un dominio
`args: ["<palabras>", "--domain", "<dominio>", "-n", "3"]`

| Necesitas | Dominio | Consulta de ejemplo |
|---|---|---|
| Patrón según tipo de producto | `product` | `"entertainment social"` |
| Estilos visuales | `style` | `"glassmorphism dark"` |
| Paletas | `color` | `"fintech trust"` |
| Combinaciones de fuentes | `typography` | `"playful modern"` |
| Una fuente de Google concreta | `google-fonts` | `"sans serif variable"` |
| Gráficas | `chart` | `"real-time dashboard"` |
| Reglas de UX y accesibilidad | `ux` | `"error summary validation"` |
| Estructura de landing | `landing` | `"hero social-proof"` |
| Iconos | `icons` | `"icon button accessible label"` |
| Animaciones GSAP | `gsap` | `"scroll reveal stagger"` |
| Rendimiento React/Next | `react` | `"rerender memo list"` |
| Apps nativas | `web` | `"touch safe-areas"` |

Para accesibilidad, busca un resultado observable cada vez (`"focus not obscured"`, `"accessible authentication"`), no una auditoría entera.

### 3. Implementarlo en un stack
`args: ["<palabras>", "--stack", "<stack>"]`

Stacks: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `astro`, `nuxtjs`, `nuxt-ui`, `angular`, `laravel`, `shadcn`, `threejs`, `swiftui`, `react-native`, `flutter`, `jetpack-compose`, `javafx`, `wpf`, `winui`, `avalonia`, `uno`, `uwp`.

**No supongas el stack:** míralo en el proyecto (`package.json`, `pubspec.yaml`, `composer.json`…) o pregúntalo.

## Reglas
- **Prioridad** al revisar o diseñar: 1 accesibilidad (contraste 4.5:1, foco visible, etiquetas) → 2 táctil (mín. 44×44 px) → 3 rendimiento → 4 estilo acorde al producto → 5 responsive → 6 tipografía y color → 7 animación → 8 formularios → 9 navegación → 10 gráficas.
- **Las reglas completas** de cada categoría están en `references/quick-reference.md`. Para apps móviles o nativas, antes de entregar repasa la lista de `references/pro-rules.md`. Léelas con `leer_recurso_skill` solo cuando hagan falta.
- **Si la búsqueda no devuelve nada:** reintenta una vez con menos palabras o con `--domain` explícito. Si sigue vacía, dilo ("no encontré una paleta para X; uso las reglas generales") y no presentes nada como si viniera de la base de datos.
- **Los resultados son recomendaciones,** no órdenes: los gustos del usuario y las reglas del proyecto mandan. No metas datos privados del usuario en las consultas.
- **Al responder:** explica en español y en corto la dirección elegida (estilo, paleta, fuentes y por qué encaja con su producto) y luego impleméntala.
