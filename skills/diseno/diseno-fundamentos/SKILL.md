---
name: diseno-fundamentos
description: Base de diseño de interfaces para cualquier pantalla, web o app (espaciado, rejilla, tipografía, color, jerarquía, estados, modo oscuro, tamaños táctiles). Úsala SIEMPRE que vayas a diseñar, maquetar o revisar una interfaz, antes de escribir HTML/CSS/SwiftUI/React.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: ['/\bdis[eé][ñn](a|ame|ar|ad|en|alo|amelo)\b/i', diseño de, interfaz, maqueta, maquetar, UI, UX, pantalla, landing, html, css, tailwind, swiftui, componente, redesign, rediseña]
---

# Fundamentos de diseño de interfaces

Reglas que funcionan en casi cualquier producto. Las skills específicas (formularios, onboarding, checkout, dashboards, web, navegación) se apoyan en esta.

## 1. Antes de pintar nada
1. **Una tarea principal por pantalla.** Escribe en una frase qué viene a hacer la persona. Todo lo que no ayude a eso baja de nivel o se va.
2. **Contenido real.** Diseña con textos y datos realistas (nombres largos, cifras grandes, listas vacías); el "Lorem ipsum" esconde problemas.
3. **Elige la plataforma** y respeta sus convenciones (iOS, Android, web de escritorio, web móvil). Lo familiar se usa sin pensar.
4. **Mobile first** en web: diseña a 360–390 px de ancho y amplía; no al revés.

## 2. Espaciado y rejilla
- Rejilla de **8 pt** (y 4 pt para ajustes finos). Escala útil: 4, 8, 12, 16, 24, 32, 48, 64.
- **Proximidad:** lo relacionado, junto (8–12); grupos distintos, separados (24–32). El espacio agrupa mejor que las líneas o las cajas.
- Márgenes laterales: 16 en móvil, 24 en tablet, y en escritorio un contenedor de 1120–1280 px como máximo.
- Ancho de lectura: **45–75 caracteres** por línea de texto corrido.
- Alinea todo a pocos ejes. Cada alineación nueva es ruido.

## 3. Tipografía
- Una familia (dos como mucho). Sans-serif del sistema o una neutra (Inter, SF Pro, Roboto).
- Escala con pocos pasos y saltos claros, por ejemplo 12 · 14 · 16 · 20 · 24 · 32 · 40.
- Texto base: **16 px en web**, 17 pt en iOS (tamaño Body por defecto); nunca menos de 12 px para nada legible.
- Interlineado: 1.4–1.6 en párrafos, 1.1–1.25 en títulos grandes.
- Jerarquía con **tamaño y peso** (400 / 600 / 700), no con colores al azar ni MAYÚSCULAS largas.
- Números que se comparan (precios, tablas): cifras tabulares (`font-variant-numeric: tabular-nums`).

## 4. Color
- **Tokens semánticos**, no colores sueltos: `fondo`, `superficie`, `texto`, `texto-2`, `borde`, `primario`, `exito`, `aviso`, `error`.
- Un solo color de acento para la acción principal. Si todo destaca, nada destaca (regla orientativa 60-30-10: fondo / superficies / acento).
- El color **nunca es la única señal**: acompáñalo de icono, texto o forma (errores, estados, gráficos).
- Contraste mínimo (WCAG AA): **4.5:1** texto normal, **3:1** texto grande (≥ 24 px, o ≥ 18,66 px en negrita) y elementos de interfaz o bordes de campos.
- **Modo oscuro:** no es invertir. Fondo casi negro, superficies elevadas un poco más claras, colores de acento algo menos saturados, y texto blanco al ~87 % y secundario al ~60 %.

## 5. Jerarquía visual
- Orden de lectura: título → dato o acción clave → apoyo. Se comprueba entornando los ojos: lo importante debe seguir viéndose.
- **Un botón primario por vista.** Las acciones secundarias van en estilo contorno o texto, y las destructivas en rojo y separadas.
- El tamaño, el peso, el color y la posición dan prioridad; usa los mínimos necesarios.

## 6. Componentes y estados
Todo elemento interactivo necesita sus estados: **normal, hover (escritorio), presionado, foco visible, deshabilitado, cargando**, y los de datos: **vacío, error, éxito**.
- Botones: verbo + objeto ("Crear proyecto", no "Aceptar"). Alto 44–48 px en táctil y radio coherente en toda la app.
- Área táctil mínima: **44×44 pt en iOS**, **48×48 dp en Android**; en web, como mínimo 24×24 px por WCAG 2.2, aunque lo recomendable para táctil es 44.
- Iconos: un mismo estilo y grosor; los que no son universales llevan texto.
- Radios, sombras y bordes de una misma escala (por ejemplo radios de 8 y 12, como mucho 3 niveles de elevación).

## 7. Movimiento
- Duraciones de 150–250 ms para cambios pequeños y 250–400 ms para paneles; entra con ease-out y sale con ease-in.
- La animación explica (de dónde viene y a dónde va algo); no decora.
- Respeta `prefers-reduced-motion`.

## 8. Lista final (repásala antes de entregar)
- [ ] ¿Se entiende en 5 s qué es y qué hacer?
- [ ] ¿Hay un solo primario y está donde llega el pulgar o la vista?
- [ ] ¿Espaciado en la escala de 8, alineaciones limpias?
- [ ] ¿Contraste AA, foco visible y áreas táctiles suficientes?
- [ ] ¿Estados vacío, cargando, error y deshabilitado diseñados?
- [ ] ¿Funciona con textos largos, en móvil y en modo oscuro?

Fuentes públicas de referencia (para ampliar, no copiar): Apple Human Interface Guidelines, Material Design 3, WCAG 2.2, Laws of UX.
