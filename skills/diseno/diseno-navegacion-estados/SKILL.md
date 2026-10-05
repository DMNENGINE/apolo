---
name: diseno-navegacion-estados
description: Navegación y estados de la interfaz - barra de pestañas, menú lateral, cabeceras, modales y hojas, toasts y banners, carga (esqueletos, spinners, progreso), errores, confirmaciones de acciones destructivas y deshacer. Úsala al estructurar una app o web y al diseñar feedback del sistema.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [navegación, navigation, menú, menu, tab bar, barra de pestañas, sidebar, menú lateral, modal, diálogo, popup, toast, snackbar, notificación, banner, cargando, loading, skeleton, spinner, error, confirmación, eliminar]
---

# Navegación y estados

## Elegir la navegación
| Situación | Patrón |
|---|---|
| App móvil con 3–5 secciones principales | **Barra de pestañas inferior** (icono + texto, la activa resaltada) |
| Más de 5 secciones en móvil | 4 pestañas + "Más", o reorganiza |
| Web o app de escritorio con muchas secciones | **Barra lateral** (colapsable en iconos) + cabecera con búsqueda y cuenta |
| Web de contenido o marketing | Barra superior con 4–6 enlaces; en móvil, menú hamburguesa |
| Jerarquía profunda | Migas de pan (web) o pila con "Atrás" (móvil) |
- La sección actual siempre se distingue (color, peso, indicador y `aria-current`).
- Mismo orden y nombres en toda la app. Las acciones globales (buscar, crear) en el mismo sitio.
- En móvil, las acciones frecuentes en la zona inferior, al alcance del pulgar.

## Modales, hojas y páginas
- **Modal** solo para tareas cortas y enfocadas que bloquean (confirmar, un formulario breve). Título, contenido, acciones a la derecha o abajo (primaria + "Cancelar"); se cierra con Esc, con la X y tocando fuera (salvo si se perderían datos).
- **Hoja inferior** (bottom sheet) en móvil para opciones o detalles rápidos.
- Si tiene más de un paso o mucho contenido, es una **página**, no un modal. Nunca un modal sobre otro.
- Al abrir, el foco va al modal; al cerrar, vuelve al botón que lo abrió.

## Feedback del sistema
| Necesidad | Patrón |
|---|---|
| Confirmar algo que salió bien | **Toast** o snackbar breve (4–6 s), abajo o arriba, con "Deshacer" si aplica |
| Error que exige acción | Mensaje **en línea** junto a donde ocurre o un banner persistente, nunca un toast que desaparece |
| Estado global (sin conexión, modo prueba, pánico) | **Banner** fijo arriba |
| Cambios en segundo plano | Insignia o punto en la navegación |
- Los mensajes dicen **qué pasó y qué hacer**, en lenguaje humano y sin códigos: "No pudimos guardar: sin conexión. Lo reintentaremos al volver." en vez de "Error 503".

## Tiempos de espera (límites clásicos de respuesta)
- **< 0,1 s:** se siente instantáneo; no hace falta nada.
- **0,1–1 s:** sin indicador o con uno muy sutil (estado presionado en el botón).
- **1–10 s:** **esqueletos** con la forma del contenido (mejor que un spinner a pantalla completa); spinner dentro del botón que lanzó la acción.
- **> 10 s:** barra de progreso con porcentaje o pasos y tiempo estimado; deja seguir usando la app y avisa al terminar.
- Interfaz optimista para acciones que casi nunca fallan (me gusta, marcar como hecho): se actualiza al momento y se revierte si falla.

## Acciones destructivas
- **Mejor deshacer que preguntar:** borra y muestra "Elemento eliminado · Deshacer" durante unos segundos.
- Si es irreversible y grave: diálogo con título explícito ("¿Eliminar el proyecto «Web 2026»?"), las consecuencias en una frase y el botón rojo con el **verbo concreto** ("Eliminar proyecto"), nunca "Aceptar". Para lo crítico, pide escribir el nombre.
- Separa visualmente lo destructivo de lo habitual (al final de un menú o en una "zona de peligro").

## Errores y páginas especiales
- **404:** qué pasó + búsqueda + enlace al inicio.
- **Sin conexión:** contenido en caché si lo hay, aviso y reintento automático.
- **Sin permisos:** por qué y a quién pedir acceso.
- Errores de formulario: ver la skill de formularios.

## Errores típicos
- Hamburguesa en apps móviles con pocas secciones.
- Toasts para errores importantes.
- Spinners de pantalla completa en cada clic.
- "¿Estás seguro?" en todo (la gente acaba aceptando sin leer).
- Modales encadenados.
- Indicador de sección activa ausente.
