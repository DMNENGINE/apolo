# Herramientas de ingeniería inversa (qué tienes, qué falta y qué se instala)

## La bancada propia (siempre disponible)
`scripts/pe.py` — Python 3 puro, sin dependencias, lectura estática. Subcomandos: `info`, `tipo`, `miembros`, `refs`, `cadenas`, `carcasa`, `importaciones`.
No ejecuta el binario ni usa la red. Es el punto de partida y la fuente de evidencia.

## Lo que hay en el PC del usuario (comprobado)
| Herramienta | Estado | Para qué |
|---|---|---|
| Node.js 24 | **sí** | requisito de `npx rea-agents` |
| .NET SDK 8 y 9 | **sí** | `dotnet tool install -g ilspycmd` para C# legible |
| ilspycmd | **no** | descompilar .NET a proyecto C# |
| Ghidra | **no** | pseudocódigo de binarios nativos (gratis) |
| IDA Pro / Hopper | **no** | pseudocódigo de calidad comercial (licencia propia) |
| dnSpy / dotPeek | **no** | depurar y leer .NET de forma interactiva |
| diec / Scylla | **no** | detectar y quitar protectores (packers) |

## Instalaciones recomendadas (preguntando antes)
```
dotnet tool install -g ilspycmd          # descompilador .NET oficial, se instala en ~/.dotnet/tools
npx rea-agents setup                      # MCP de REA: setup interactivo (elige agente y ajustes)
```
- **REA** (morluto/rea, MIT): MCP de ingeniería inversa para binarios nativos, .NET, JS/Electron, APK, firmware… Sitio: rea.tools. Su fuerza: cada resultado lleva evidencia y limitaciones. Para nativo usa un motor que ya tengas (Ghidra/IDA/Hopper) o instala Hopper con aprobación.
- **Ghidra** (solo si el usuario lo pide): gratuito, requiere JDK. Es la opción sin licencia para nativo.

## Cómo se usan juntas
1. `pe.py` decide el tipo y recoge la evidencia barata (cadenas, miembros, referencias).
2. Si es .NET y **no** es híbrido: `ilspycmd -p -o <carpeta> <dll>` y se lee el C#.
3. Si es nativo o híbrido: una sesión de REA sobre la función concreta, o Ghidra a mano.
4. Las hipótesis de las cadenas se confirman **en el desensamblado**, nunca en la cadena sola.

## Lo que la bancada no hace (y por eso existe REA)
- No desensambla instrucciones ni reconstruye pseudocódigo.
- No resuelve la tabla de importaciones completa (solo nombres de DLL y cadenas de API).
- No deshace ofuscaciones ni desembala protectores.
- No interpreta metadata de ensamblados híbridos/ReadyToRun (ver la advertencia del SKILL.md).
