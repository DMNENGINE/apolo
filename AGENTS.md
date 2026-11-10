# AGENTS.md — APOLO (Robot Companion)

Instrucciones para agentes de programación (Codex, Claude Code, Gemini…) que trabajen en este repo.
Habla y escribe comentarios en **español**. El usuario es Demon.

## Reglas
- **Nunca `git push`** ni `--amend`. Commits locales sí, pequeños y con mensaje en español que diga qué y por qué.
- Hay **varias sesiones trabajando a la vez** en este repo: antes de editar, `git status`; no reviertas ni formatees cambios que no sean tuyos; en el commit mete **solo tus cambios** (si un archivo ya tenía cambios ajenos, usa `git add -p`).
- No leas ni imprimas secretos: `%APPDATA%\robot-companion\` (tokens, bóveda, discord.json, voz.json…), `.env`, claves de proveedores.
- La app que usa el usuario **no corre desde aquí**: corre desde `%LOCALAPPDATA%\APOLO`. Para que vea un cambio: copia los archivos tocados a esa carpeta (misma ruta relativa) y reinicia la app (ver "Reiniciar APOLO"). Si el archivo instalado es distinto del de `HEAD`, no lo sobrescribas entero: aplica solo tu cambio.
- Tests del núcleo: `cd core && npm test` (Node ≥ 22). Si un test falla por algo que no tocaste, dilo, no lo "arregles" a ciegas.
- Comprueba lo que haces **mirándolo** (capturas headless, ver abajo) antes de decir que está hecho.

## Mapa rápido
- `main.js` + `main/` → Electron (isla, bandeja, hooks, voz). `preload.js` → puente IPC.
- `app/` → la **isla** (ventana flotante): `index.html`, `island.js`, `robot.js` (casco 3D), `fx.js`, `aranas.js`, `arana-motor.js`.
- `core/` → el núcleo (agente, herramientas, API HTTP :47900, panel web en `core/ui/`).
- `extension/` → extensión de Chrome. `web/` → landing.

## El casco (robot 3D)
**Fuente única: `app/robot.js`** (three.js). Copias GENERADAS, no las edites a mano:
- `core/ui/robot3d.js` (panel) y `web/robot3d.js` (landing) → `node tools/derivar-robot3d.js` después de cada cambio en `app/robot.js` (solo cambian los imports).

Modelo:
- `app/casco.glb` (= `core/ui/casco.glb` = `web/casco.glb`, mismo archivo). Fuente: `casco_robot.blend` (Blender **3.6.5**).
- Mallas que usa el código (por nombre): `MarcoVisor`, `Pantalla` (lleva el HUD: textura canvas), `PlacaSuperior`, `Auricular_I/D`, `LedAuricular_I/D`, `Menton`, `Ventila`, `Lamina_0..4`, `Voz_0..3` (se iluminan al hablar), `LuzMenton_*`, `Cabeza`, `Circuito` (emisivo con onda animada por shader).
- Si cambias el .blend: booleanos en modo EXACT con `use_self` y `hole_tolerant`; corta la ventila antes que el visor; un solo mapa UV antes de exportar glTF; conserva los nombres de malla de arriba o el código deja de encontrarlas.

API de `createRobot(canvas, 'casco.glb', { animacion: 'raton' | 'vitrina' })`:
- Estados: `setState('reposo'|'trabajando'|'permiso'|'listo'|'error'|'dormido', msg?)` → color, brillo, ojos, velocidad.
- Gestos: `gesto(nombre, segundos, msg?)` con: `remolino guino corazon sorpresa reloj feliz triste duda bostezo estornudo pensativo navegando saludo si no mirar celebrar`. Además `greet()`, `poke()`, `dizzy(n)`, `rodar(dir)`, `hud(msg)`.
- **Compuerta del visor** (arañas): `abrirCasco(segundos)` / `cerrarCasco()`; el visor gira en una bisagra (`bisagra`, rotación X) y dentro hay un `nido` (telaraña, ojos rojos, luz violeta).
- Rendimiento: `setFps(n)` (reposo 15, trabajando 24, dormido 6). El canvas es transparente, **sin bloom** (el brillo es un drop-shadow CSS). Cada fotograma cuenta: la ventana de la isla es transparente y siempre encima; no añadas postproceso ni sombras caras.
- La isla (`app/island.js`) usa un proxy `robot` (reenvía al casco o a un personaje 3D si el usuario eligió otro) y llama a `casco.*` directamente para cosas exclusivas del casco.

Probar el casco sin abrir la app (headless, sin GPU):
1. Crea una página temporal en `app/` (bórrala al terminar) con el importmap de `app/index.html` (`three` → `../node_modules/three/build/three.module.js`, `three/addons/` → `../node_modules/three/examples/jsm/`), un `<canvas>` y `import { createRobot } from './robot.js'`.
2. Sírvela con un servidor estático desde la raíz del repo y ábrela con Edge headless `--use-angle=swiftshader --enable-unsafe-swiftshader` + CDP (`Page.captureScreenshot`) para sacar capturas antes/después.
3. Hoja de todos los gestos: `node tools/galeria-robot.js salida.png` (usa `app/galeria.html`).
En Git Bash usa `MSYS_NO_PATHCONV=1` si pasas rutas que empiezan por `/`.

## Reiniciar APOLO (para probar en la app real)
En PowerShell: mata solo los `electron.exe` cuya línea de comandos contenga `AppData\Local\APOLO`, **espera** a que el puerto 47900 quede libre y entonces `Start-Process "$env:LOCALAPPDATA\APOLO\node_modules\electron\dist\electron.exe" "$env:LOCALAPPDATA\APOLO"`. Si lo lanzas antes de que muera la anterior, el bloqueo de instancia única la cierra y APOLO queda caído. Nunca mates todos los node/chrome del sistema.
