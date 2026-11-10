# Fricción y vuelta a medir: por qué una página de ventas no convierte

La mitad de las "páginas que no venden" no tienen un problema de diseño ni de copy: tienen un problema de **pasos**. Se mide, no se opina.

## Lo que se mide (y su umbral)
- **Clics hasta pagar:** del botón "Comprar" al dinero, contar clics, campos y pantallas. 2 campos y 1 pantalla es el objetivo; cada campo extra es una caída.
- **Campos:** correo y pago, nada más. Nada de teléfono ni dirección si el producto es digital.
- **Acciones a la vista:** cada bloque tiene **una** acción; el header solo lleva el CTA y lo mínimo (política, muestra). Si hay boletín, chat, "sígueme" y otros botones en la misma pantalla que comprar, se compite y se pierde.
- **Scroll hasta el precio:** en móvil, el precio y el botón deben estar como mucho a 3–4 scrolls. Un precio bajo la mitad de la página es un precio que la mayoría no ve.
- **Mensaje inicial:** el hero sin scroll, en móvil: titular legible a 32 px mínimo, **CTA sin scroll**, producto enseñado en el segundo scroll.
- **Una promesa por párrafo:** si un párrafo tiene tres ideas, no se lee ninguna.
- **Vocabulario:** la misma palabra que usa la búsqueda del comprador (si buscó "prompts para vender", la página dice eso; "pack de plantillas inteligentes" es ruido).
- **Tapa:** los formularios con 6 campos, "Contáctanos" para un producto de autoservicio, el precio escondido, la cuenta atrás fake, los saltos de scroll sin motivo, los pop-ups al segundo, el hero en carrusel, la imagen sin texto que no dice qué vende.

## Checklist dura (la que decide si la página sale)
Se comprueba en la página construida, no en el papel. Vale para cualquier modelo: una página no se da por terminada sin que estas 10 frases sean verdad.

1. El titular dice **qué obtengo en qué tiempo** y se lee en una línea en móvil.
2. Hay **un solo CTA**, con el mismo texto, visible sin scroll.
3. El **precio exacto** aparece antes de la mitad de la página; el precio de verdad es el que se enseña.
4. Hay **un producto real a la vista** (fragmento, salida, captura), no una ilustración inventada.
5. La **muestra** enseña el antes/después con lo que se compra.
6. Las **objeciones reales** de compra están en el FAQ, con respuestas secas.
7. La **garantía** es una que se puede cumplir (acceso y arreglo), no un número inventado.
8. La sección de prueba social, **si existe, es verificable**; si no hay testimonios, no hay sección.
9. **Cero lunares de ambigüedad:** "desde $X", "gratis", "*", "incluye" sin lista, "contratar" sin precio, "idéntico a" que no se puede comprobar.
10. **En móvil**: un botón de 44×44 px, texto incrustado 16 px mínimo, el precio y el CTA seguidos, y nada de dos CTAs de distinto texto en la misma pantalla.

## Cómo se mide con esta skill
- Para la lista de secciones: `scripts/checklist.py` con el argumento `secciones`. Devuelve el orden a construir, en 1 línea.
- Para la revisión real: `scripts/checklist.py <ruta o url>`. Lee el HTML servido, puntúa lo medible (título, palabras del titular, número de botones, precio a la vista, secciones, salto por cada 1000 palabras, frases de relleno) y devuelve **1 línea JSON**: `{"url":…,"puntos":0-100,"fallos":[…],"avisos":[…],"leido":…}`. Si `puntos` < 70 o hay `fallos`, la página no está lista: se corrige y se vuelve a medir.
- Lo que el script no puede ver (la página cargada en el navegador, una captura en móvil, un anuncio con su destino), se comprueba con la extensión de APOLO (`navegador_abrir` + `navegador_leer`/`navegador_captura`) o con `ver_pantalla`. **Nunca afirmar "convierte/mide bien" sin haber vuelto a leer la página.**

## Después de publicar (lo que se mide para cambiar, no para adivinar)
- Una sola métrica principal: **compras / visitas de la página de ventas**. No "visitas", no "me gusta".
- Se cambia **una cosa por semana** (titular o precio u oferta, nunca las tres): si cambias dos, no sabes qué funcionó.
- Si hay tráfico y pocas compras, el problema suele estar en el precio o en la promesa; si no hay clics al botón, en el titular y la prueba; si hay clics y no pagos, en el checkout, no en la página.

## Reglas que no se saltan
- No prometer resultados de venta ("venderás X"), ni testimonios, cifras o logos inventados.
- No usar escasez ni cuenta atrás que no sea real.
- La página y el checkout dicen el mismo precio, la misma moneda y la misma garantía.
