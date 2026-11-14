# Biblioteca DMN

Skills oficiales de APOLO en el repo público [DMNENGINE/apolo-skills](https://github.com/DMNENGINE/apolo-skills): firmadas por DMNENGINE, escaneadas y, si lo necesitan, con **preparación automática**. En el panel: **Skills → Biblioteca DMN**.

## Piezas

| Pieza | Dónde |
|---|---|
| Fuente del catálogo (siempre activa; `skills.bibliotecaDMN: false` la quita, `skills.urlBiblioteca` la cambia) | `core/skills/marketplace.js` |
| Motor de preparación (`preparar.json`, `apolo-preparar/1`) | `core/skills/preparar.js` |
| API | `GET/POST /v1/skills/:slug/preparar`, `POST /v1/skills/:slug/preparar/cancelar` |
| Panel (pestaña + ventana de preparación con progreso) | `core/ui/biblioteca.js` |
| Publicar una skill (limpiador + escáner + plan + firma + índice) | `tools/publicar-skill.js` |
| Clave oficial | `AUTORES_OFICIALES` en `core/skills/firmar.js`; privada en `~/.dmnengine/DMNENGINE.clave` (nunca en el repo) |
| Palabras prohibidas al publicar | `~/.dmnengine/privado.txt` (una por línea) |

## preparar.json

```json
{ "formato": "apolo-preparar/1",
  "requisitos": { "so": ["win32"], "gpu": { "fabricante": "nvidia", "vramGB": 8 }, "ramGB": 16, "discoGB": 45 },
  "pasos": [
    { "id": "python", "tipo": "programa", "programa": "python" },
    { "id": "comfyui", "tipo": "git", "repo": "https://github.com/…", "ref": "v0.45.3", "destino": "{{apps}}/ComfyUI" },
    { "id": "torch", "tipo": "python", "venv": "{{apps}}/ComfyUI/venv", "paquetes": ["torch"], "indice": "https://download.pytorch.org/whl/cu128", "soloIndice": true },
    { "id": "modelo", "tipo": "descarga", "url": "https://huggingface.co/…", "destino": "{{modelos}}/checkpoints/x.safetensors", "sha256": "…", "bytes": 123 },
    { "id": "llm", "tipo": "ollama", "modelo": "qwen3:8b" },
    { "id": "config", "tipo": "config", "valores": { "comfy_url": "http://127.0.0.1:8288", "comfy_dir": "{{apps}}/ComfyUI" } } ] }
```

- Sin comandos libres. Programas de lista cerrada (`PROGRAMAS`), hosts de descarga/git/pip de lista cerrada, destinos dentro de `{{apps}}`, `{{modelos}}` o `{{datos}}`.
- `{{apps}}` y `{{modelos}}` son compartidos (por defecto `%LOCALAPPDATA%\APOLO-recursos`, cambiable con `skills.dirRecursos`).
- Descargas reanudables (`.part` + Range) y comprobadas con sha256. Cada paso hecho queda en `<skill>/_datos/preparacion.json`.
- El escáner pone **rojo** un `preparar.json` con pasos no permitidos.
- En `SKILL.md`, `usar_skill` sustituye `{{apps}}`, `{{modelos}}`, `{{skill}}`, `{{datos}}` y `{{config.<clave>}}`.

## Publicar

```
node tools/publicar-skill.js <carpeta-skill> --repo D:\apolo-skills --categoria creatividad
cd D:\apolo-skills && git add -A && git commit -m "…" && git push
```

No publica si encuentra IPs de la red, rutas con tu usuario, correos, tokens, accesos ssh o palabras de `privado.txt`, ni si el escáner no da verde.
