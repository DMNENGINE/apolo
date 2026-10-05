---
name: diseno-onboarding
description: Onboarding y primeros pasos - bienvenida, personalización, pedir permisos (notificaciones, ubicación, cámara), checklists de configuración, tours y estados vacíos que enseñan. Úsala al diseñar la primera experiencia de una app o producto.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [onboarding, bienvenida, primeros pasos, primer uso, tutorial, tour, walkthrough, permisos, notificaciones push, checklist de configuración, estado vacío, empty state]
---

# Onboarding y primera experiencia

**Objetivo:** que la persona llegue cuanto antes al primer momento de valor (el "ajá"), no enseñarle todas las funciones.

## Elige el tipo
| Tipo | Cuándo | Ojo |
|---|---|---|
| **Sin onboarding** | El producto se entiende solo | La mejor opción si se puede |
| **Personalización** (2–5 preguntas) | Las respuestas cambian de verdad lo que verá | Cada pregunta debe tener efecto visible; deja saltarla |
| **Configuración guiada / checklist** | Producto complejo (SaaS, banca, domótica) | Progreso visible y que se pueda dejar a medias |
| **Pantallas de presentación** (carrusel) | Casi nunca | Se saltan; si existen, máx. 3 y con "Saltar" |
| **Ayuda contextual** (tooltips en el momento) | Funciones que se descubren usando | Una a la vez, en el momento en que sirve, descartable |

## Personalización
- Una pregunta por pantalla, con respuestas en tarjetas o chips grandes (selección múltiple si aplica).
- Progreso arriba (barra o "2 de 4") y "Atrás" disponible.
- Resultado inmediato: "Hemos preparado tu plan con…" y se ve aplicado.
- Explica por qué preguntas cosas personales ("Para calcular tus calorías").

## Pedir permisos (notificaciones, ubicación, cámara, contactos…)
1. **Nunca al abrir la app.** Pídelo cuando la persona hace algo que lo necesita.
2. **Pantalla previa propia** que explique el beneficio concreto ("Te avisamos cuando llegue tu pedido"), con "Activar" y "Ahora no". El aviso del sistema solo sale si dice que sí: así, si lo rechaza, puedes volver a pedirlo más adelante.
3. Si lo deniega: la función sigue funcionando a medias y hay un camino a Ajustes ("Activar en Ajustes").

## Checklist de configuración
- Lista vertical de 3–6 pasos con estados (hecho ✓, actual, pendiente) y una sola acción destacada: el siguiente paso.
- Gradiente de meta: empieza con uno ya hecho ("Cuenta creada ✓") para que avanzar motive.
- Accesible desde el inicio hasta completarla, y descartable.

## Estados vacíos que enseñan
Toda lista o pantalla de contenido necesita su estado vacío:
- Ilustración o icono discreto + **qué aparecerá aquí** + **una acción** para llenarlo ("Aún no tienes proyectos · Crear proyecto").
- Opcional: datos de ejemplo o plantilla para empezar.
- Distingue el vacío de la primera vez, el vacío por filtros ("Nada coincide · Quitar filtros") y el vacío por error.

## Medir
- Tasa de finalización por paso: el paso con más abandono es el siguiente a simplificar.
- Tiempo hasta el primer valor.

## Errores típicos
- 5 pantallas de carrusel antes de dejar entrar.
- Registro obligatorio antes de mostrar nada útil (si se puede, deja probar primero).
- Pedir todos los permisos de golpe al inicio.
- Tour que tapa la interfaz y no se puede cerrar.
- Preguntas de personalización que no cambian nada.
