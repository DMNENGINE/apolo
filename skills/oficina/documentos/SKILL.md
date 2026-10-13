---
name: documentos
description: Crea y lee documentos de oficina — Word (.docx), Excel (.xlsx, con fórmulas, formatos y gráficos), PowerPoint (.pptx, 16:9, con imágenes y notas) y PDF — a partir de un JSON sencillo, y extrae el texto de cualquiera de ellos para resumirlo o responder preguntas. Úsala cuando pidan "hazme un Word / un Excel / una presentación / un PDF", un presupuesto, factura, informe, CV, carta, tabla de gastos, o "lee / resume este documento".
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [word, docx, excel, xlsx, hoja de cálculo, powerpoint, pptx, presentación, diapositivas, pdf, documento, informe, presupuesto, factura, currículum, curriculum, cv, carta, tabla de gastos, resume este documento, lee este documento, lee este pdf]
---

# Documentos (Word, Excel, PowerPoint, PDF)

Todo pasa por `scripts/doc.py` con `ejecutar_script_skill` (`nombre: documentos`, `script: scripts/doc.py`).

## Leer un documento
`args: ["leer", "<ruta absoluta del archivo>"]` → el texto (títulos con #, tablas con |, hojas de Excel separadas por tabuladores, diapositivas y notas, páginas del PDF). Úsalo para resumir, buscar datos o contestar preguntas sobre el archivo. Si es muy largo, añade un tercer argumento con el máximo de caracteres.

## Crear un documento
1. Escribe un JSON con `escribir_archivo` (por ejemplo junto al documento final, `…/presupuesto.json`). `escribir_archivo` crea las carpetas que falten; no uses la shell.
2. Ejecuta `args: ["crear", "<ruta del json>"]`. Devuelve la ruta y un resumen.
3. Dile al usuario dónde está (por defecto en `Documentos`, salvo que diga otra carpeta). Si no te dice nombre, ponle uno claro con la fecha.

La extensión de `"salida"` decide el formato.

### Word (.docx) y PDF (.pdf) — mismo formato
```json
{"salida": "C:/Users/<usuario>/Documents/Presupuesto El Trueno.docx", "titulo": "Power Truck Services",
 "bloques": [
  {"h1": "Presupuesto"}, {"p": "Trabajo en el **389 El Trueno**: cambio de *turbo*."},
  {"lista": ["Turbo nuevo", "Juntas"]}, {"numerada": ["Desmontar", "Cambiar", "Probar"]},
  {"tabla": {"cabecera": ["Concepto", "Precio"], "filas": [["Turbo", "1.800 $"], ["Mano de obra", "600 $"]]}},
  {"imagen": "C:/ruta/logo.png", "ancho_cm": 6}, {"cita": "Garantía de 6 meses."}, {"salto": true}, {"h2": "Condiciones"}]}
```
- `**negrita**` y `*cursiva*` dentro de los textos. Encabezados `h1`/`h2`/`h3`. `salto` = página nueva.
- PDF: opcional `"papel": "carta"` (por defecto A4). Word: opcional `"fuente"` y `"tamano"`.

### Excel (.xlsx)
```json
{"salida": ".../Ventas 2026.xlsx", "hojas": [
  {"nombre": "Ventas", "cabecera": ["Mes", "Ingresos", "Gastos", "Beneficio"],
   "filas": [["Ene", 12000, 8000, "=B2-C2"], ["Feb", 15000, 9000, "=B3-C3"]],
   "formatos": {"B": "#,##0 \"$\"", "D": "#,##0 \"$\""},
   "grafico": {"tipo": "barras", "titulo": "Ingresos y gastos", "col_categorias": 1, "cols_valores": [2, 3]}}]}
```
- Los números van como números (no como texto). Un texto que empieza por `=` es una **fórmula** (en inglés: `=SUM(B2:B13)`, `=AVERAGE(...)`, separador `,`).
- Las fórmulas se calculan al abrir el archivo en Excel: si lo vuelves a leer con `leer` antes de eso, salen vacías. No es un error.
- `grafico.tipo`: `barras` | `lineas` | `tarta`. Columnas numeradas desde 1. Cabecera en negrita, fija al hacer scroll y anchos automáticos.

### PowerPoint (.pptx, 16:9)
```json
{"salida": ".../ProtoForja.pptx", "titulo": "ProtoForja", "subtitulo": "De la idea al prototipo",
 "diapositivas": [
  {"titulo": "Qué hace", "puntos": ["Piezas reales", "  con enlaces de compra", "Caja 3D"], "imagen": "C:/ruta/caja.png", "notas": "Enseñar el ejemplo"},
  {"titulo": "Demo", "imagen": "C:/ruta/captura.png"}]}
```
- Un punto que empieza con dos espacios es un subpunto. Máximo ~6 puntos por diapositiva y frases cortas.
- Con `imagen` y `puntos` a la vez, el texto va a la izquierda y la imagen a la derecha. Solo `imagen`, a lo ancho.

## Reglas
- **No inventes datos** en documentos serios (facturas, presupuestos, informes): usa los que dio el usuario o los que leíste; si faltan, déjalo indicado ("[precio]") y díselo.
- **Facturas y presupuestos:** pon los totales con fórmulas en Excel, o calculados por ti en Word/PDF (revisa la suma).
- **Si falta una librería**, el script lo dice con el comando para instalarla (`python -m pip install --user …`): pide permiso y ejecútalo.
