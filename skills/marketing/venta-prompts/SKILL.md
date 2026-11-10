---
name: venta-prompts
description: La lógica para inventar y vender cosas en una página de ventas, empezando por páginas que venden prompts (o cualquier producto digital). Saca el ángulo del producto, fija precio y oferta, escribe el copy con el tamaño máximo por bloque, coloca el orden de las secciones y revisa el resultado con una checklist dura de conversión. Úsala al pedir una página de ventas, una landing para vender prompts, precios, una oferta, prueba social o revisar por qué no convierte una página.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [página de ventas, pagina de ventas, vender prompts, vendo prompts, vender mis prompts, prompts de pago, venta de prompts, landing de ventas, página de producto, pagina de producto, vender una plantilla, vender mi producto digital, how much should i charge, qué precio le pongo, que precio le pongo, fija el precio, oferta irresistible, por qué no convierte, por que no convierte, revisa mi landing]
---

# Vender en una página (páginas de prompts y productos digitales)

Una página de ventas hace **un trabajo**: que alguien que duda diga sí. No es un catálogo ni un folleto. Todo lo que no acerque ese sí, fuera.

Esta skill son las **reglas**. El diseño visual no está aquí: para eso están `diseno-web-marketing` (estructura y orden), `diseno-fundamentos` (medidas) y `ui-ux-pro-max` (paleta, fuentes, stack). Si no las tienes activas, esta skill funciona sola.

## Cómo se usa
1. Escribe la hoja de oferta con `references/oferta.md`: quién, qué cambia, precio, garantía, prueba, escasez **real**.
2. Escribe el copy con los topes de `references/copy.md`: titular ≤12 palabras, 1 CTA, 3–8 objeciones en el FAQ.
3. Monta las secciones en el orden de la hoja (la lista completa sale con `ejecutar_script_skill`, `script: scripts/checklist.py`, `args: ["secciones"]`).
4. Construye la página con el stack que el usuario ya tiene (`html-tailwind`, `nextjs`, `vite`…). **No inventes el stack:** míralo o pregúntalo.
5. Mide con `scripts/checklist.py` (abajo) y arregla lo que salga en `FALLOS`. No la entregues como terminada sin medir.
6. Si el usuario quiere guardarlo entre turnos, deja la hoja en la carpeta del proyecto (nunca en la memoria).

## Las 7 lecciones del producto
- **Un resultado, no una lista.** La página no vende "50 prompts": vende el trabajo hecho y el tiempo ahorrado. La lista de archivos es un detalle del final.
- **Una sola acción.** Un CTA repetido con el mismo texto; nada que compita (boletín, redes, otra compra).
- **Precio a la vista y con ancla.** El núcleo de precio va alto y redondo de entrada; el paquete de la plataforma con ancla tachada; el combo por encima. Si el precio no es público, es un lead magnet y no una página de ventas.
- **Un número honesto.** Ni inventes usuarios ni reseñas; si no hay prueba, no metas una sección de testimonios vacía: usa lo que puedas demostrar (prueba interna de la checklist con resultados reales, ejemplos del propio producto). Prueba falsa se paga.
- **Muestra el antes y el después.** Un fragmento, un resultado, una captura, la pregunta y la salida. Nada de "Imagina un mundo…".
- **Quita fricción.** Ningún campo más de los necesarios, ningún paso extra. 12 caracteres de cuenta, 3 de tarjeta si es posible.
- **Devuelve la garantía de acceso.** Los productos digitales ya no se pueden devolver sin copia, así que la promesa honesta es: acceso inmediato, contenido que funciona y actualizaciones durante N días. Nada de "devolución sin preguntas" que no puedas cumplir.

## Números del producto (usar salvo que el usuario diga otra cosa)
- Precio del paquete: **≥ 15× el precio de un uso individual equivalente** (~$0,13/prompt). El productor de la plataforma son 3–4 usos; el paquete da 50–100. Si a ese precio el margen entre ambos no se nota, la comparación de precio no es el argumento: usa **velocidad** y **consistencia**.
- El primer pago valida. Nunca piratees desde el minuto cero: un descuento de lanzamiento ("las primeras 100 copias a $X") es real porque el precio sube después, mientras "50 % de descuento" eterno se lee como mentira.
- Un descuento con cuenta atrás, solo si de verdad cambia algo al acabar el plazo. Si no cambia, fuera.

## Si no hay acceso de pago listo
- Sale igual con checkout propio (Stripe Checkout, Lemon Squeezy, Paddle, Gumroad) y un enlace que el usuario ya tenga; no inventes claves ni URLs de cobro.
- Si no hay cobro todavía: entrega la página con la zona de compra vacía y el aviso de qué falta, nunca un botón que no lleve a nada.

## Límites
- "Nunca dice" o "siempre lo hace": las promesas sobre otro modelo o producto (que un modelo no falle, que la plataforma no cambie un precio) no se pueden garantizar: no las escribas.
- No prometas una cifra de ventas ("venderás 1.000 copias"). Promete lo que controlas: el producto y el acceso.
