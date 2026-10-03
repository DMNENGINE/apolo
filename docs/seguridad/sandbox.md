# Sandbox para skills y plugins de terceros (Etapa H)

Código: `core/sandbox/` (`index.js` elección + orquestación, `windows.js`, `jaula.cs`, `otros.js`). Tests: `core/test/sandbox.test.js`.
Afecta a **scripts de skills** (`ejecutar_script_skill`) y al **`shell` de plugins**. No afecta al shell del propio agente
(ese ya pasa por permisos) ni al proceso Node de cada plugin (que sigue con el modelo de permisos de Node 20+, ver `core/plugins`).

## Qué nivel se usa

`cfg.seguridad.sandbox = { porDefecto: 'auto', porSkill: { <slug> | 'plugin:<nombre>': nivel }, memoriaMB: 512, cpu: 50, procesos: 1, protegerLectura: [], sinSoporte: 'avisar' }`

| Situación | Nivel |
|---|---|
| `auto` + firma **verificada** (autor en `cfg.skills.autoresConfianza`) + escaneo **verde** | normal |
| `auto` + plugin en desarrollo local (`dev`) | normal |
| `auto` + cualquier otra cosa (sin firma, firma desconocida, escaneo amarillo/pendiente/rojo) | restringido |
| El usuario elige un nivel en el panel (Skills → detalle → «Sandbox de sus scripts») o en `porSkill` | ese nivel |
| Escaneo **rojo** | nunca normal (como mínimo restringido) |
| `aislado` sin Windows Sandbox instalado | restringido (con aviso) |
| macOS / Linux | normal con aviso claro (o bloqueado si `sinSoporte: 'bloquear'`) |

Cada ejecución apunta en la auditoría encadenada una línea `tipo: "sandbox"` (nivel, motivo, avisos) y su `resultado`
(código + mensajes de la jaula, p. ej. «memoria: superó el límite → matado»). La salida que ve el modelo termina con `[sandbox: <nivel>] <motivo>`.
El **pánico** mata todo lo que corre en sandbox (`matarTodo()`: jaulas → `KILL_ON_JOB_CLOSE` arrastra a los hijos; VMs de Windows Sandbox con taskkill).

## Qué protege cada nivel (verificado en Windows 11 Home, 2026-10-03)

| Ataque del script | normal | restringido | aislado (Windows Sandbox) |
|---|---|---|---|
Leyenda: ✅ protege · ❌ no protege · ⚠️ parcial. «(teoría)» = comportamiento documentado de Windows que NO hemos probado aquí; el resto se probó con scripts reales (Node, Python y PowerShell).

| Robar claves del **entorno** (variables `*KEY*`, `*TOKEN*`…) | ✅ entorno limpio | ✅ | ✅ (teoría) |
| **Escribir** en tu perfil / Documentos / `%TEMP%` / instalar en `Run` (HKCU) | ❌ | ✅ bloqueado (EPERM) — integridad baja (registro: teoría) | ✅ (VM desechable) |
| Modificar la propia skill instalada | ❌ | ✅ trabaja en una copia temporal | ✅ copia en solo lectura |
| Crear procesos (lanzar `cmd`, `notepad`, descargadores…) | ❌ | ✅ bloqueado (`procesos: 1`); con más, todos dentro del job y mueren con él | ✅ dentro de la VM |
| Dejar procesos vivos después de terminar | ❌ | ✅ mueren al acabar el principal (verificado con un nieto `detached`) | ✅ la VM se apaga |
| Comerse la RAM / la CPU | ❌ (solo tiempo máximo) | ✅ job: memoria (matado, código 137), CPU con tope duro (50 %), tiempo (124) | ✅ RAM de la VM |
| Leer el **portapapeles**, cambiar ajustes de pantalla/sistema, apagar Windows | ❌ | ✅ restricciones de UI del job (teoría) | ✅ portapapeles desactivado (teoría) |
| Mandar mensajes a ventanas de APOLO u otras apps (UIPI) | ❌ | ✅ integridad baja no puede «escribir hacia arriba» (teoría) | ✅ |
| Leer el **token del daemon**, `config.json`, la bóveda… de APOLO | ❌ | ✅ etiqueta *NO_READ_UP* en esos archivos (`protegerLectura` añade más) | ✅ no están en la VM |
| **Leer** el resto de tus archivos (Documentos, `~/.ssh`, `~/.claude/.credentials.json`, cookies…) | ❌ | ❌ **NO** — integridad baja no bloquea lectura | ✅ solo ve la skill |
| Usar la **red** (exfiltrar lo leído, descargar cosas) | ❌ | ❌ **NO** — integridad baja no toca la red | ✅ red apagada salvo permiso |
| Hablar con el daemon de APOLO en `127.0.0.1` | ❌ | ⚠️ puede conectar; `<datos>/token` no lo puede leer (probado), pero `~/.claude/robot-companion.token` sí, salvo que lo añadas a `protegerLectura` | ✅ (red apagada) |
| Exploits del kernel / escape de VM | ❌ | ❌ | ⚠️ frontera de Hyper-V (la más fuerte disponible) |

**Resumen honesto**: *restringido* evita que un script de terceros **cambie** tu equipo, se quede residente o se coma los recursos,
pero **no** evita que **lea** tus archivos y los mande por red. Para código en el que no confías nada, usa *aislado*.
Si quieres blindar más archivos contra lectura en restringido: `protegerLectura: ["~/.ssh", "~/.claude/.credentials.json", "~/.claude/robot-companion.token"]`
(se les pone la etiqueta *Medium + NO_READ_UP*; APOLO y tus programas normales siguen leyéndolos; una reescritura «atómica» por renombrado la quita, por eso se reaplica en cada ejecución).

## Cómo funciona

**Restringido** (`jaula.cs`, compilado una vez con `Add-Type -OutputType ConsoleApplication` y cacheado por hash en `<datos>/sandbox/`):
1. Copia la skill a `%TEMP%\apolo-sb-XXXX\<slug>` con etiqueta **Low** heredable (el único sitio escribible) y `TEMP/TMP` dentro.
2. Job Object: `JOB_MEMORY`, `ACTIVE_PROCESS`, `CPU_RATE_CONTROL` (hard cap), `KILL_ON_JOB_CLOSE`, `DIE_ON_UNHANDLED_EXCEPTION`, restricciones de UI; puerto de finalización para enterarse de memoria/procesos.
3. Token propio con `CreateRestrictedToken(DISABLE_MAX_PRIVILEGE)` + `TokenIntegrityLevel = S-1-16-4096` → `CreateProcessAsUser` suspendido → al job → reanudar. Sin admin.
4. Si el principal termina, `TerminateJobObject` se lleva lo que quede. Si APOLO mata la jaula (tiempo, cancelar, pánico), el handle del job se cierra y muere todo.

Compatibilidad comprobada: Node, Python 3.12 (instalación de usuario) y PowerShell 5.1 corren bien a integridad baja.
Puede fallar: Python de la Microsoft Store (alias de ejecución) o venvs (lanzan un segundo proceso → sube `procesos`), programas que escriben en su carpeta de instalación o en el registro.

**Aislado** (Windows Sandbox): genera un `.wsb` con la skill en **solo lectura**, una carpeta de salida escribible, `Networking=Disable` (salvo `red`),
sin portapapeles/audio/vídeo/impresoras, `ProtectedClient`. PowerShell/cmd vienen en la VM; Node/Python se mapean en solo lectura desde el equipo.
Un script `ejecutar.ps1` copia la skill, ejecuta, escribe `salida.txt` + `codigo.txt` y apaga la VM. Arranque ≈ 20–60 s; solo una VM a la vez (límite de Windows).
**No verificado en este equipo** (Windows 11 Home no trae Windows Sandbox): el `.wsb` está cubierto por tests; la ejecución real queda pendiente de un equipo Pro.

## Pendiente
- AppContainer (sin admin) como nivel intermedio que **sí** bloquea lectura del perfil y red, sin VM.
- Meter el proceso Node de los plugins (no solo su `shell`) en un Job Object.
- macOS (`sandbox-exec`) y Linux (`bubblewrap` + cgroups).
- Probar el nivel aislado en un Windows Pro/Enterprise.
