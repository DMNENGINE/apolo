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

## Checklist
- [ ] `render_preview` de las páginas tocadas revisado.
- [ ] Guardado a una ruta nueva; ruta dicha al usuario.
