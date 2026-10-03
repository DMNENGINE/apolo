# Marketplace de skills y plugins

Panel → **Skills → Explorar**. Es un catálogo que junta varias fuentes públicas que no necesitan clave:

| Fuente | Cómo se lee | Configuración |
|---|---|---|
| `anthropics/skills` (GitHub) | API `contents` para la lista de carpetas + `SKILL.md` de cada una por `raw.githubusercontent.com` (no gasta cuota de la API) | `skills.marketplaceAnthropic: false` la quita |
| Índices propios | Un JSON por URL con el formato de abajo | `skills.catalogos: ["https://…/indice.json", …]` (por defecto, el de APOLO: `marketplace/indice.json` de este repo en GitHub) |

- **Caché en disco de 6 h** en `<núcleo>/skills/_catalogo.json`. El botón «Actualizar» del panel la salta (`?refrescar=1`). Si una fuente falla, se quedan sus entradas de la última vez y el panel lo avisa.
- Si dos catálogos apuntan a la misma `fuente`, sale una sola entrada con las etiquetas unidas.
- **Instalar** usa la instalación de siempre (`POST /v1/skills/instalar` o `/v1/plugins/instalar` con `fuente`). Todo lo que llega entra **desactivado**, pasa por el **escáner** y por la **comprobación de firma**.

API: `GET /v1/skills/marketplace[?refrescar=1]` → `{entradas, fuentes, etiquetas, actualizado}` · `GET /v1/skills/marketplace/ficha?id=<id>` → `{entrada, texto}` (el `SKILL.md`, o el `README.md` en los plugins).

## Formato del índice (`apolo-marketplace/1`)

```json
{
  "formato": "apolo-marketplace/1",
  "nombre": "Marketplace de APOLO",
  "actualizado": "2026-10-02",
  "entradas": [
    {
      "nombre": "clima",
      "tipo": "plugin",
      "descripcion": "El tiempo de cualquier ciudad (Open-Meteo, sin clave).",
      "fuente": "DMNENGINE/apolo/plugins/clima",
      "autor": "DMN / APOLO",
      "etiquetas": ["tiempo", "utilidades"],
      "version": "1.0.0",
      "licencia": "MIT",
      "firma": { "autor": "DMN", "clavePublica": "<base64 de 32 bytes>" },
      "readme": "https://raw.githubusercontent.com/…/README.md",
      "web": "https://github.com/…"
    }
  ]
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `nombre` | sí | Nombre visible (≤ 80 caracteres). |
| `fuente` | sí | Lo mismo que se escribe en «Instalar»: `owner/repo/ruta[@ref]` de GitHub, URL a un `.zip` / `SKILL.md`, etc. |
| `descripcion` | no | Texto corto (≤ 1000). |
| `autor` | no | Autor **declarado** (informativo; lo que cuenta es la firma). |
| `etiquetas` | no | Lista de palabras para filtrar (se guardan en minúsculas, máx. 12). |
| `tipo` | no | `skill` (por defecto) o `plugin`. |
| `firma` | no | `{autor, clavePublica}`: avisa de que el paquete trae `FIRMA.json` de esa clave. El panel lo marca «Firmada»; la verificación de verdad se hace al instalar. |
| `version`, `licencia`, `readme`, `web` | no | Informativos. `readme`/`web` solo `https://`. |

También vale un array suelto de entradas. Las entradas sin `nombre` o sin `fuente` se ignoran; máximo 2000.

## Firma ed25519 (`FIRMA.json`)

```bash
node core/skills/firmar.js --generar mi-nombre            # → mi-nombre.clave (PRIVADA, no la subas) + clave pública en pantalla
node core/skills/firmar.js ruta/a/mi-skill --clave mi-nombre.clave --autor "Mi Nombre"
node core/skills/firmar.js --verificar ruta/a/mi-skill [--publica <base64>]
```

`FIRMA.json` = `{formato: "apolo-firma/1", autor, clavePublica, fecha, archivos: {ruta: sha256}, firma}`. La firma cubre el JSON canónico (claves ordenadas) de todo menos `firma`. Se excluyen `FIRMA.json`, `instalado.json`, `aprendizaje.jsonl`, `_versiones/`, `.git` y `node_modules`.

Al instalar o re-escanear (skills y plugins) se comprueba contra `skills.autoresConfianza: [{ "nombre": "…", "clavePublica": "…" }]`:

| Estado | Badge en el panel | Efecto |
|---|---|---|
| `verificada` | «Verificado por &lt;autor&gt;» (nombre de TU lista, no el declarado) | — |
| `desconocida` | «Firma de autor desconocido» | Firma correcta pero la clave no está en tu lista. |
| `sin-firma` | «Sin firma» | — |
| `invalida` | «Firma inválida» | **Cuarentena roja**: hallazgo crítico, se desactiva y activarla exige forzar. Archivo alterado, añadido o quitado, o firma que no cuadra. |

Si el taller de skills modifica una skill firmada (mejora aplicada o versión restaurada), se borra su `FIRMA.json`: ya no es la versión del autor.

## Reglas de proyecto como skills externas

Además de `~/.claude/skills`, `~/.codex/skills` y `<cwd>/.claude/skills`, se leen **en solo lectura** `<cwd>/.cursor/rules/*.mdc` (Cursor: `description`, `globs`, `alwaysApply`) y `<cwd>/AGENTS.md`. Se espejan como `SKILL.md` en `<núcleo>/skills/_reglas/<slug>/` (se rehacen si cambia el original) para que el índice y el escáner funcionen igual. `skills.reglasProyecto: false` lo apaga; `skills.cwdReglas` cambia la carpeta.

## Anti-exfiltración (`seguridad.exfil`)

`'preguntar'` (por defecto) · `'bloquear'` · `'off'`. La herramienta `web` (y `navegador_abrir`) pide permiso la **primera vez que envía datos** a un dominio que no se visitó en un turno anterior ni se aprobó con «siempre». Enviar datos = `POST/PUT/PATCH/DELETE`, o `GET` con ruta+consulta de más de 80 caracteres o que contenga texto que `leer_archivo` / `buscar_memoria` / `buscar_historial` devolvieron en este turno. Un `GET` simple a un dominio nuevo no pregunta. «Siempre» guarda la regla `{herramienta: "exfil", prefijo: <dominio>}` en `reglas.json`; vale también en modo auto (el modo auto no se salta esta pregunta). Estado en `<núcleo>/exfil.json`.
