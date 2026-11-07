# PdfCraft — guía profesional (equivale a Acrobat Pro)

Leer y editar PDF: texto, páginas, unir/dividir, marcas de agua, encabezados, formularios, firmas, redacción (tachado seguro), OCR, comprimir, PDF/A, accesibilidad, exportar a Office. Apache-2.0 (github.com/storytold/pdfcraft).

## Reglas de la app (verificadas)
- `doc_open {path}` → `{doc: 1}`; pasa ese `doc` a todo lo demás. Páginas 1-based.
- Las ediciones quedan en memoria hasta `doc_save {doc, path}` (guarda a otra ruta para no pisar el original). `edit_undo` deshace.
- Comprobar: `doc_info`, `text_extract {doc, page}`, `text_find`, `page_render` / `render_preview {doc, page}`.
- **Número de página visible** = `doc_header_footer {doc, footer_center:"<<1/n>>", start_number}`. Marcadores: `<<1>>` página, `<<n>>` total, `<<1 of n>>`, `<<1/n>>`, fechas `<<yyyy-mm-dd>>`, Bates `<<Bates Number#6#1#PREFIJO#SUFIJO>>`; `replace:true` sustituye los existentes. `page_number` es otra cosa (etiquetas de página) y pide `from`.

## Recetas
- **Marca de agua**: `doc_watermark {doc, text:"BORRADOR", opacity:0.2}` → `doc_save` (probado).
- **Unir**: `doc_combine {paths:[…], out}`. **Dividir**: `doc_split {doc, every:N | bookmarks | max_mb, out_dir}`. **Extraer páginas**: `page_extract {doc, pages:"1-3", out}`.
- **Reordenar/rotar/borrar**: `page_move`, `page_rotate`, `page_delete`, `page_insert_file`.
- **Añadir texto/imagen**: `page_add_text {doc, page, text, rect|at, size, color}`, `page_add_image`. Editar texto existente: `text_edit`.
- **Formularios**: `form_fields {doc}` → `form_fill {doc, values:{campo:valor}}`; detectar campos en un PDF plano `form_detect_fields`.
- **Redactar datos sensibles (de verdad)**: `redact_mark {doc, find:"…"|pattern|rect}` → `redact_apply {doc}` → `doc_audit_redactions`. Tapar con un rectángulo negro NO es redactar.
- **Quitar metadatos ocultos**: `doc_hidden_info` → `doc_remove_hidden`.
- **Proteger**: `doc_protect {doc, open_password, permissions_password, printing, copy}`.
- **Firmar**: `sign_id_create` / `sign_windows_ids` → `sign_document {doc, id, reason, rect, page}`.
- **OCR** de escaneados: `ocr_recognize {doc, language:"spa", dpi:300}`.
- **Comprimir**: `doc_reduce {doc, path}` o `doc_optimize`. **PDF/A** (archivo): `pdfa_convert` + `pdfa_verify`.
- **A Word/Excel**: `doc_export_office {doc, path:"….docx"}`. Texto plano: `doc_export_text`.
- **Comparar versiones**: `doc_compare` + `doc_compare_report`.

## Estándares profesionales
- Nunca sobrescribas el original: guarda `<nombre>_editado.pdf`.
- Antes de enviar algo con datos personales: redacción real + quitar metadatos + verificar con `text_find` que el dato ya no está.
- Para imprenta: `print_readiness` (fuentes incrustadas, imágenes ≥ 300 ppp, CMYK).
- Para enviar por correo: < 10 MB (`doc_reduce`).
- Accesibilidad: `accessibility_check` y `accessibility_autotag_apply` en documentos públicos.

## Novedades (noviembre 2026)
Versión v0.19 (todo instalado y al día 2026-11-07). ✔ = probado de verdad por MCP; lo demás sale del catálogo de comandos.
- ✔ `text_word_count {doc, pages?}` (palabras y caracteres por página) y ✔ `text_styles {doc}` (fuentes y tamaños usados, de mayor a menor) — probados.
- `bookmark_from_text_styles {doc, levels:[estilo de text_styles…]}`: marcadores automáticos a partir de los títulos de un PDF sin etiquetas.
- **OCR revisable**: `ocr_words` (cada palabra con caja, confianza y "sospechosa") → `ocr_review_apply {corrections}`; `ocr_recognize` acepta `deskew`, `denoise`, `binarize`, `auto_rotate`, `engine`, `strategy`, `region`. `page_enhance_scan` limpia páginas escaneadas sin perder el texto OCR.
- `doc_bates_multi` (numeración Bates en varios PDF), `attachment_add`/`attachment_delete`, `page_reverse`, `page_duplicate {at}`, `comments_copy`/`comments_paste` entre documentos, `bookmark_export/import/copy`, `form_add_field_table` (rejilla de campos), `layer_set`, `xfa_to_static`, `standards_remove_id`, `model_add`/`model_render` (3D PRC).
- `doc_optimize` acepta `preset`, `compatibility`, `object_streams`, `mono`; `doc_header_footer` acepta `font` y `shrink`; `page_add_text` acepta `aligns` y `char_spacing`.
## Checklist
- [ ] `render_preview` de las páginas tocadas revisado.
- [ ] Guardado a una ruta nueva; ruta dicha al usuario.
