---
name: diseno-dashboards-datos
description: Dashboards, paneles de administración, tablas de datos, gráficos, KPIs, filtros y acciones en bloque. Úsala al diseñar paneles, informes, backoffices o cualquier pantalla con muchos datos.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [dashboard, panel de control, panel de administración, admin, backoffice, kpi, métricas, gráfico, gráfica, chart, tabla de datos, data table, informe, reporte, analytics, estadísticas]
---

# Dashboards, tablas y gráficos

Un dashboard responde a preguntas. Antes de dibujar, escribe las **3–5 preguntas** que alguien viene a resolver ("¿vendemos más que el mes pasado?", "¿qué está fallando ahora?").

## Estructura de un dashboard
1. **Cabecera:** título, selector de periodo ("Últimos 30 días" con comparación al periodo anterior) y acciones (exportar, compartir).
2. **Fila de KPIs** (3–5 tarjetas): valor grande, etiqueta, variación con flecha y color **más** signo (+12 %), y opcionalmente un sparkline.
3. **Gráfico principal:** la tendencia más importante, a todo el ancho.
4. **Detalle:** desgloses (por canal, producto, región) y la tabla con los elementos que requieren acción.
- Lo más importante arriba a la izquierda. Máximo ~7–9 bloques por vista; el resto, en otras pestañas.
- Rejilla de 12 columnas; tarjetas con la misma altura por fila.

## Qué gráfico usar
| Pregunta | Gráfico |
|---|---|
| Evolución en el tiempo | **Líneas** (o área si importa el volumen) |
| Comparar categorías | **Barras** (horizontales si las etiquetas son largas), ordenadas por valor |
| Parte de un todo | Barra apilada al 100 %; quesito solo con ≤ 4 partes |
| Distribución | Histograma |
| Relación entre dos variables | Dispersión |
| Un valor frente a un objetivo | Barra de progreso o bala, no velocímetro |

- El eje Y de las barras empieza en 0. Pocas líneas de cuadrícula y suaves; etiquetas directas en vez de leyenda cuando quepan.
- Paleta por categorías de hasta ~6 colores distinguibles (también por luminancia, para quien no distingue colores); un color de resalte para lo que importa y el resto en gris.
- Tooltip al pasar el cursor con el valor exacto; estado vacío ("Sin datos en este periodo") y estado cargando (esqueleto).

## Tablas de datos
- Cabecera fija al hacer scroll; columnas ordenables con indicador ▲▼.
- **Números alineados a la derecha**, con cifras tabulares y la misma precisión; texto alineado a la izquierda.
- Altura de fila de 40–48 px (modo compacto opcional). Separación con líneas finas o filas alternas suaves, no ambas.
- Primera columna identificable (nombre o ID enlazado al detalle). Estados con insignias de color y texto.
- **Acciones en bloque:** casillas, y al seleccionar aparece una barra con "3 seleccionados · Archivar · Eliminar".
- Acciones por fila en un menú ⋯ o al pasar el cursor (con alternativa accesible por teclado).
- Filtros arriba como chips o desplegables, con "Limpiar filtros" y el número de resultados. La búsqueda filtra al escribir (con un retardo de ~300 ms).
- Paginación con el total ("1–50 de 1.240") para trabajo de gestión; scroll infinito solo para explorar.
- En móvil: no encojas la tabla; conviértela en tarjetas o deja 2–3 columnas clave con detalle al tocar.

## Rendimiento percibido
- Esqueletos en el sitio de cada bloque; carga por bloques independientes (un bloque lento no congela los demás).
- "Actualizado hace 2 min" y refresco manual. Los datos en vivo se marcan como tales.

## Errores típicos
- 20 KPIs sin jerarquía.
- Gráficos 3D, de radar o donuts de 9 colores.
- Variaciones solo en rojo o verde, sin signo.
- Tablas con números centrados.
- Filtros escondidos sin indicar que están activos.
