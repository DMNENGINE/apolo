---
name: diseno-accesibilidad
description: Accesibilidad práctica (WCAG 2.2 nivel AA) para webs y apps - contraste, teclado, foco, lectores de pantalla, formularios, tamaños táctiles, movimiento. Úsala al diseñar o revisar cualquier interfaz y siempre que se hable de accesibilidad, a11y, contraste o lectores de pantalla.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [accesibilidad, accesible, a11y, wcag, contraste, lector de pantalla, screen reader, aria, voiceover, talkback, teclado]
---

# Accesibilidad (WCAG 2.2 AA) sin teoría

Accesible = lo pueden usar personas que no ven bien, no oyen, no usan ratón o se cansan pronto. Casi siempre también mejora la experiencia de todos.

## Percibir
- **Contraste:** texto normal ≥ **4.5:1**; texto grande (≥ 24 px, o ≥ 18,66 px en negrita) ≥ **3:1**; iconos, bordes de campos y estados de foco ≥ **3:1** contra lo que tienen al lado.
- **No solo color:** un error se marca con texto e icono, no solo en rojo. Las series de un gráfico se distinguen también por forma o etiqueta.
- **Texto alternativo:** imágenes informativas con `alt` que diga lo que aportan; las decorativas con `alt=""`. Los iconos sin texto llevan `aria-label`.
- **Texto ampliable:** hasta el 200 % sin perder contenido; en móvil, respeta Dynamic Type / el tamaño de fuente del sistema. Nada de alturas fijas en contenedores de texto.
- **Reflujo:** a 320 px de ancho no debe haber scroll horizontal (salvo tablas o mapas).
- Vídeo con subtítulos; audio con transcripción.

## Operar
- **Todo con teclado:** Tab llega a cada control en orden lógico; Enter/Espacio activan; Esc cierra modales y menús. Sin trampas de foco (salvo dentro de un modal abierto, donde el foco debe quedarse).
- **Foco visible** siempre (anillo de 2 px con contraste ≥ 3:1). Nunca `outline: none` sin sustituto. Que el foco no quede tapado por cabeceras pegajosas ni banners (2.4.11).
- **Áreas táctiles:** mínimo 24×24 px en web (2.5.8) y lo recomendable 44×44; en iOS 44 pt y en Android 48 dp, con separación entre objetivos.
- **Arrastrar tiene alternativa** con un clic o toque (2.5.7): por ejemplo botones ↑/↓ para reordenar.
- **Tiempo:** si algo caduca, avisa y deja ampliarlo. Los carruseles que se mueven solos llevan pausa.
- **Enlace "Saltar al contenido"** al principio de páginas con mucha navegación.

## Entender
- Idioma de la página declarado (`<html lang="es">`).
- Etiquetas visibles en los campos (el placeholder no es una etiqueta). Instrucciones antes del campo, no solo en un tooltip.
- **Errores:** dicen qué falló y cómo arreglarlo, junto al campo; se anuncian (`aria-live` o `aria-describedby` + `aria-invalid`).
- **Autenticación accesible (3.3.8):** no exijas resolver puzzles ni memorizar; deja **pegar contraseñas**, gestores de contraseñas, passkeys o enlaces mágicos.
- **No pedir dos veces lo mismo (3.3.7):** autocompleta datos ya dados en el flujo (por ejemplo la dirección de envío como facturación).
- La ayuda (chat, contacto) en el mismo sitio en todas las páginas (3.2.6).
- Navegación y nombres coherentes en toda la app.

## Robusto (código)
- HTML semántico primero: `button` para acciones, `a` para navegar, `label for`, `fieldset/legend`, `nav`, `main`, `h1…h6` en orden.
- ARIA solo cuando el HTML no basta, y bien: `aria-expanded`, `aria-controls`, `aria-current="page"`, `role="dialog"` + `aria-modal="true"` + título.
- Componentes propios (pestañas, menús, combobox) siguiendo los patrones del ARIA Authoring Practices Guide.
- `prefers-reduced-motion`: quita parallax y animaciones grandes.

## Revisión rápida (10 minutos)
1. Recorre la pantalla solo con Tab y Enter.
2. Comprueba el contraste de texto, bordes de campos y foco.
3. Zoom al 200 % y ancho de 320 px.
4. Lector de pantalla (VoiceOver, TalkBack o NVDA): ¿cada control dice qué es y qué hace?
5. Provoca errores en los formularios y escucha si se anuncian.
