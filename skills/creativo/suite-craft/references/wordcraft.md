# WordCraft — guía profesional (equivale a Word)

Procesador de textos: documentos con estilos, tablas, índices, encabezados/pies, referencias, combinación de correspondencia, control de cambios; guarda DOCX, PDF, ODT, RTF, HTML, MD, TXT, PNG. Apache-2.0 (github.com/storytold/wordcraft).

## Reglas de la app (verificadas)
- `type_text {text}` escribe en el cursor. **Para varios párrafos pasa `paragraphs:true`** y separa con `\n` (sin eso, todo cae en un solo párrafo). `text.newParagraph` crea uno nuevo.
- Formato: primero `select_text {text, occurrence}`, luego `execute para.style {style:"Heading 1"}` o `format.bold`, etc.
- Estilos integrados: Title, Subtitle, Heading 1–9, Normal, Quote, List Paragraph… Usa estilos, no formato manual: así sale el índice y la navegación.
- Posiciones `{story:"body", path:[bloque,…], off:byteOffset}` (bytes UTF-8: á = 2).
- `render_page {page}` para mirar; `save_document {path}` decide el formato por la extensión (.docx, .pdf…).
- Las ediciones de un agente pueden ir con control de cambios (ver docs/mcp.md "Tracked changes").

## Receta probada
```
new_document {}
type_text {"text":"Contrato de servicios\nEntre LAGCTRUCKS y el cliente.\nCláusulas\nEl servicio se presta mensualmente.","paragraphs":true}
select_text {"text":"Contrato de servicios"}   execute para.style {"style":"Title"}
select_text {"text":"Cláusulas"}               execute para.style {"style":"Heading 1"}
render_page {"page":1} → MIRAR
save_document {"path":"C:/…/contrato.docx"}   save_document {"path":"C:/…/contrato.pdf"}
```

## Comandos útiles
- Página: `layout.size {name:"A4"|"Letter"}`, `layout.margins {preset:"normal"}`, `layout.orientation`.
- Tablas: `insert.table {rows, cols, style}`, `table.insertRowBelow`…
- Índice: `references.toc {levels:3, title:"Índice"}` (requiere Heading 1–3).
- Imágenes: `insert.picture {path, width, alt}`; saltos `insert.pageBreak`.
- Encabezado/pie: comandos `hf.*` (número de página, logo).
- Busca más con `list_commands {query}` (mailings, footnotes, equation, smartArt, chart).

## Estándares profesionales
- A4 en España/Latinoamérica (Letter en EE. UU.); márgenes 2,5 cm.
- Cuerpo 11–12 pt, interlineado 1,15–1,5, espacio después de párrafo 6–8 pt; títulos con estilos jerárquicos.
- Contratos/legales: cláusulas numeradas, fecha y lugar, partes identificadas, espacio de firma; entrega PDF para firmar y DOCX para editar.
- CV: 1–2 páginas, secciones con Heading, sin tablas complejas (los ATS no las leen).
- Cartas: remitente, fecha, destinatario, asunto, cuerpo, despedida, firma.
- Revisa ortografía (comandos `review.*`) antes de entregar.

## Checklist
- [ ] Estilos aplicados (no negritas sueltas como títulos); `render_page` revisado.
- [ ] DOCX + PDF guardados y rutas dichas.
