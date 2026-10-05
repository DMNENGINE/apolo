---
name: diseno-checkout-pagos
description: Comercio y pagos - carrito, checkout, métodos de pago, confirmación de pedido, paywalls y pantallas de suscripción in-app. Úsala al diseñar flujos de compra, pago, planes o suscripciones.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [checkout, carrito, cesta, pago, pagar, payment, apple pay, google pay, tarjeta de crédito, suscripción, subscription, paywall, plan premium, compra, pedido, ecommerce, tienda]
---

# Carrito, checkout y suscripciones

Cada paso de más pierde compradores. La regla es **menos pasos, cero sorpresas y mucha confianza**.

## Carrito
- Producto con imagen, nombre, variante (talla, color), cantidad editable y precio. "Eliminar" con deshacer.
- **Resumen siempre visible**: subtotal, envío (o "calculado en el siguiente paso"), impuestos, **total**.
- Código promocional como enlace desplegable ("¿Tienes un código?"), no como campo grande que invite a ir a buscarlo.
- Botón primario único: "Tramitar pedido". Debajo, los métodos exprés.

## Checkout
- **Pago exprés arriba** (Apple Pay / Google Pay / PayPal o la cartera local) y el formulario completo debajo.
- **Compra como invitado** permitida; ofrece crear cuenta al final ("Guarda tus datos para la próxima").
- Orden: contacto → envío → pago → revisar. En móvil, una sección por paso con progreso; en escritorio puede ser una página con el resumen fijo a la derecha.
- Dirección con autocompletado; "facturación igual que envío" marcado por defecto (no pidas dos veces lo mismo).
- Tarjeta: un solo campo inteligente o campos de número / caducidad / CVC con el teclado numérico, detección del tipo de tarjeta y `autocomplete="cc-number"`, etc. Explica el CVC con un icono de ayuda.
- Coste de envío y plazos **antes** del pago, nunca en la última pantalla.
- Señales de confianza discretas: candado, "Pago seguro", logos de métodos, política de devoluciones en una línea.
- Botón final con el importe: **"Pagar 49,90 €"**. Estado de procesando que bloquea el doble pago.

## Confirmación
- "¡Pedido confirmado!" + número de pedido + qué pasa ahora (email enviado, fecha estimada) + seguimiento.
- Un siguiente paso útil (ver pedido, seguir comprando), sin venta agresiva.

## Errores de pago
- Mensaje concreto y sin culpa: "Tu banco rechazó la tarjeta. Prueba otra o contacta con tu banco." Conserva todo lo escrito.
- Si hace falta verificación bancaria (3-D Secure), avisa de que se abrirá y vuelve al mismo sitio.

## Paywall / suscripción in-app
- Arriba: el **beneficio** en una frase y 3–4 ventajas con iconos.
- Planes en tarjetas seleccionables; el recomendado marcado ("Más popular", "Ahorra 40 %"). Precio anual mostrado también como precio mensual equivalente.
- **Transparencia obligatoria** (y exigida por las tiendas de apps): precio total, periodo, que se renueva sola, cuándo se cobra la prueba gratuita y cómo cancelar. Enlace a **"Restaurar compras"**, términos y privacidad.
- Botón: "Empezar 7 días gratis" con el texto del cobro debajo ("Luego 39,99 €/año. Cancela cuando quieras").
- Cierre (X) visible. Los paywalls tramposos acaban en reseñas de 1 estrella y en rechazos de la tienda.

## Errores típicos
- Gastos que aparecen al final.
- Registro obligatorio antes de pagar.
- Formularios de 15 campos en una pantalla móvil.
- Botón "Siguiente" genérico en el último paso.
- Paywall sin precio claro o sin forma de cerrarlo.
