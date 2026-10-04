# Instalador de Windows (.exe)

## Construir

```powershell
npm install
npm run dist          # → dist/APOLO-Setup-<version>.exe + latest.yml + .blockmap  (~96 MB, ~3 min)
npm run dist:dir      # solo la carpeta dist/win-unpacked (para probar sin instalar)
npm run icono         # regenera build/icon.ico y build/icon.png desde core/ui/m/icono-512.png (Python + Pillow)
```

Configuración en `package.json` → `build`; personalización NSIS en `build/installer.nsh`.

- **Por usuario, sin admin**: `%LOCALAPPDATA%\Programs\APOLO` (se puede cambiar la carpeta). Accesos en Inicio y Escritorio.
- **Autoarranque opcional**: el instalador pregunta y deja `autoarranque.txt` (`1`/`0`) junto a `APOLO.exe`; `main.js` lo aplica en el primer arranque. Luego se cambia desde la bandeja.
- **Desinstalar**: quita los hooks de Claude Code / Gemini CLI (`tools/quitar-hooks.js`, con copia de seguridad), quita el autoarranque y **pregunta** si borrar `%APPDATA%\robot-companion` (en silencioso, `/S`, NO se borra). En una actualización no pregunta nada.
- **Silencioso**: `APOLO-Setup-x.y.z.exe /S [/D=C:\ruta]`.

## Rutas dentro de la app instalada

El código va en `resources/app.asar`. Lo que usan procesos externos se desempaqueta en `resources/app.asar.unpacked` (`asarUnpack`): `hook/`, `core/` (scripts .ps1, SDK de plugins, panel), `shared/`, `tools/` (.ps1/.py), `extension/`, `streamdeck/`, `plugins/`. En el código, `core/rutas.js` → `fuera(ruta)` convierte `…\app.asar\…` en `…\app.asar.unpacked\…` (en desarrollo y en el one-liner no cambia nada).

- **Hooks**: `node "<…>/app.asar.unpacked/hook/hook.js" <Evento>` si hay Node en el PATH; si no, `hook/hook.cmd`, que ejecuta `hook.js` con el propio `APOLO.exe` (`ELECTRON_RUN_AS_NODE=1`). Los hooks antiguos (copia de desarrollo `RobotCompanion/`, one-liner `APOLO/` o .exe) se reconocen y se sustituyen al reinstalarlos.
- **Extensión**: bandeja → *Abrir carpeta de la extensión* abre la carpeta desempaquetada → *Cargar descomprimida*.
- **Stream Deck**: `resources\app.asar.unpacked\streamdeck\instalar.ps1`.
- **Voz (Whisper / edge-tts)**: no va en el .exe (Python + ~300 MB). Bandeja → *Instalar voz y micrófono (Python + Whisper)* abre `tools/instalar-voz.ps1` en una ventana visible.

## Actualizaciones

- **.exe** → `electron-updater` + GitHub Releases. `actualizador.js` detecta que corre desde `app.asar` y usa `latest.yml` del último release: avisa en la isla, descarga (diferencial con el `.blockmap`) e instala al reiniciar, por usuario y sin admin. Elegido por ser el camino estándar de NSIS, no depender de Node/Python en el PC del usuario y verificar el sha512 del instalador.
- **One-liner** (`install.ps1`) → igual que antes: compara el commit instalado (`instalado.json`) con `main` y relanza `install.ps1`. Las dos instalaciones comparten datos (`%APPDATA%\robot-companion`) y no deben ejecutarse a la vez (mismo puerto 47823).
- **Publicar**: subir un tag `vX.Y.Z` igual a `version` de `package.json` → `.github/workflows/release.yml` construye y publica el release con `latest.yml`.

## Firma de código

Preparado, sin certificado todavía. electron-builder firma solo si existen estas variables (local o secretos del repo):

| Variable | Qué es |
|---|---|
| `CSC_LINK` | ruta, URL o base64 del certificado `.pfx` (OV/EV de code signing) |
| `CSC_KEY_PASSWORD` | contraseña del `.pfx` |

Sin firma, SmartScreen avisa ("Windows protegió tu PC" → Más información → Ejecutar de todas formas) hasta que el instalador gane reputación. Alternativas a valorar: certificado EV (reputación inmediata, requiere token HSM → firma en la nube tipo Azure Trusted Signing con `win.azureSignOptions`).

### Opción barata para el lanzamiento: Azure Trusted Signing (~10 US$/mes)

Decidido el 2026-10-05: se firma al lanzar, no antes. Pasos cuando toque (comprueba antes nombre y precio actuales en Azure, Microsoft los ha ido cambiando):

1. Cuenta de Azure → crear un recurso **Trusted Signing** (cuenta de firma) → **validación de identidad** (individual o empresa; tarda días).
2. Crear un **perfil de certificado** (Public Trust) en esa cuenta.
3. Crear una aplicación en Entra ID (cliente + secreto) con el rol **Trusted Signing Certificate Profile Signer** sobre la cuenta.
4. En `package.json` → `build.win`, añadir:
   ```json
   "azureSignOptions": {
     "publisherName": "<nombre validado>",
     "endpoint": "https://<región>.codesigning.azure.net",
     "codeSigningAccountName": "<cuenta>",
     "certificateProfileName": "<perfil>"
   }
   ```
5. Variables (local o secretos del repo para `release.yml`): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
6. `npm run dist` y comprobar: clic derecho en el `.exe` → Propiedades → **Firmas digitales**.

## Pruebas sin tocar la instalación real

```powershell
APOLO-Setup-x.y.z.exe /S /D=C:\temp\apolo-prueba
$env:NUCLEO_HOME='C:\temp\nucleo'; $env:APOLO_PUERTO='47972'     # config.json del núcleo con {"puerto":47973}
C:\temp\apolo-prueba\APOLO.exe --user-data-dir=C:\temp\ud
```

Ojo: el primer arranque escribe la clave de autoarranque `electron.app.APOLO` en `HKCU\…\Run` (la quita el desinstalador).
