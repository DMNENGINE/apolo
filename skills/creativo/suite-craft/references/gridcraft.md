# GridCraft — guía profesional (equivale a Excel)

Hoja de cálculo: datos, fórmulas, tablas, gráficos, tablas dinámicas, filtros, formato condicional; abre/guarda XLSX, CSV, TSV, JSON, HTML. Apache-2.0 (github.com/storytold/gridcraft).

## Reglas de la app (verificadas)
- Notación A1 (`"B2"`, `"A1:D10"`, `"Hoja2!A1:B3"`).
- `write_range {range:"A1", values:[[…],[…]]}` escribe un bloque 2D desde esa celda; texto que empieza por `=` es fórmula.
- `read_range {range}` devuelve los valores CALCULADOS: úsalo para comprobar que las fórmulas dan lo esperado.
- `evaluate_formula {formula}` prueba una fórmula sin tocar la hoja.
- `format_range {range, bold, fillColor, fontColor, numberFormat, horizontalAlign, borders, wrapText}`.
- `create_table`, `insert_chart {range, type, title}`, `sort_range {keys:["B desc"]}`, `filter`.
- `list_functions {search}` da la firma de cada función; `execute_command` corre cualquier comando (`data.removeDuplicates`, `pivot.*`, `home.*`…).
- `new_workbook {}` abre otro libro (no hace falta si el actual está vacío).

## Receta probada
```
write_range {"range":"A1","values":[["Mes","Vistas"],["Jul",120],["Ago",340],["Sep",610],["Total","=SUM(B2:B4)"]]}
format_range {"range":"A1:B1","bold":true,"fillColor":"#0b1d3a","fontColor":"#ffffff"}
format_range {"range":"B2:B5","numberFormat":"#,##0"}
insert_chart {"range":"A1:B4","type":"column","title":"Vistas"}
read_range {"range":"B5"}   → 1070 (comprobar)
save_workbook {"path":"C:/…/vistas.xlsx"}
```

## Buenas prácticas profesionales
- Datos en formato tabla: una fila por registro, una columna por campo, encabezado en la fila 1, sin celdas combinadas ni filas vacías dentro. Conviértelo en tabla (`create_table`).
- Separa entradas, cálculos y resultados (hojas distintas o zonas marcadas); supuestos en celdas, nunca números escritos dentro de fórmulas.
- Fórmulas: `XLOOKUP`/`INDEX+MATCH` antes que `VLOOKUP`; `SUMIFS`/`COUNTIFS` para totales con condiciones; referencias absolutas `$A$1` donde toque; `IFERROR` para mostrar limpio.
- Formatos: moneda `"#,##0.00 €"` o `"$#,##0.00"`, porcentaje `"0.0%"`, fechas `"dd/mm/yyyy"`.
- Gráficos: columnas para comparar categorías, línea para series temporales, circular solo con ≤ 5 partes.
- Presupuestos/facturas: subtotal, impuesto en celda propia (tasa como supuesto), total; bloquea fórmulas.
- Comprueba siempre los totales con `read_range` antes de entregar.

## Novedades (noviembre 2026)
Versión v0.17 (todo instalado y al día 2026-11-07). ✔ = probado de verdad por MCP; lo demás sale del catálogo de comandos.
- ✔ **Macros sin código**: `macro.save {name, steps:[{type:"command", id, params}, {type:"repeat"…}, {type:"if"…}]}` → `macro.run {name}` (probado: B1:B3 = A×2 + suma). Una macro que falla se deshace entera. Pasos útiles: `range.setValues {range, values}`, `cell.set {cell, input}`; `range.fill` ajusta las referencias desde la celda activa (dio #CIRC!: no lo uses en macros). `macro.record` graba lo que haces.
- Controles: `insert.button {at, text, macro | command}`, `insert.slider`, `insert.spinButton`, `control.press {id}`.
- ✔ `insert.equation {latex, at}` (ecuación LaTeX como objeto).
- Varios libros/ventanas: `list_windows`; todas las herramientas aceptan `doc`/`window`. Ojo: la sesión ya trae "Book1" vacío y `new_workbook` crea "Book2".
- `write_range {parse:false}` guarda textos tal cual (fechas dd.mm.yyyy, ceros a la izquierda).
- Fórmulas: `formulas.traceError`, `selectPrecedents/Dependents`, `convertToNumber`; Solver con modelos guardables.
- `python.set {cell, code}` crea celdas Python, pero sin motor de Python se quedan en `#BLOCKED!`: no las uses para entregar resultados.
## Checklist
- [ ] Fórmulas verificadas con `read_range` (sin `#REF!`, `#DIV/0!`).
- [ ] Encabezados formateados, números con formato; XLSX guardado (CSV solo si lo piden: pierde fórmulas y formato).
