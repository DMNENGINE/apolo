---
name: ingenieria-inversa-pe
description: Ingeniería inversa de ejecutables de Windows (.exe/.dll) y ensamblados .NET con evidencia y sin ejecutar el objetivo. Distingue nativo de .NET, saca tipos y métodos del metadata, referencias, cadenas y huellas de ofuscador, y marca cuándo hace falta Ghidra/IDA/Hopper o el MCP de REA. Úsala cuando pidan "analiza esta dll", "descompila", "mira qué hace este exe", "es ofuscado", "por dónde empiezo con este binario" o "ingeniería inversa".
license: MIT
metadata:
  apolo:
    version: "1.0.0"
    autor: DMN / APOLO
    licencia: contenido propio; REA (morluto/rea) es MIT y aquí solo se cita
    disparadores: [analiza esta dll, analiza este exe, descompila, descompilar dll, ingenieria inversa, ingeniería inversa, reverse engineering, que hace este binario, es ofuscado, decompilar, deobfuscar, análisis de malware]
---

# Ingeniería inversa de PE y .NET

Analizar un binario es **reconstruir evidencia**: qué es, qué declara, qué importa, qué dice y de qué herramienta salió. Cada conclusión va con su prueba y con lo que **no** se puede afirmar. El README de REA lo dice igual: los resultados incluyen la evidencia y las limitaciones.

## Regla de oro
Nunca escribas "esta DLL hace X" sin poder señalar **dónde** lo viste (una cadena, un nombre de método, una importación, una referencia). Si no lo viste, dilo así y sigue con el siguiente paso.

## Paso 0: qué tienes delante

Ejecuta la bancada propia (no requiere instalar nada):

```
python -X utf8 "<carpeta de esta skill>\scripts\pe.py" tipo "<ruta>"
```

Devuelve `dotnet` o `nativo`, la arquitectura y cómo seguir. Después:

```
python -X utf8 "<carpeta>\scripts\pe.py" info "<ruta>"
```

`info` da: PE32/PE32+, x86/x64/ARM64, DLL o EXE, subsistema, secciones, firma Authenticode y la versión de CLR si es .NET.

## Caminos según el tipo

### A) Ensamblado .NET gestionado
1. `miembros` → tipos y métodos declarados por el propio ensamblado (lee las tablas TypeDef/MethodDef del metadata). Si una skill no debe juzgar nombres de métodos que no aparecen.
2. `refs` → ensamblados y versiones de los que depende: te dice la tecnología (WPF, ASP.NET, Newtonsoft…).
3. `cadenas --buscar=<palabra>` → busca en cadenas ASCII/UTF-16 y en el heap `#US` (las cadenas del IL).
4. Para código C# legible: `dotnet tool install -g ilspycmd` y `ilspycmd -p -o <carpeta> "<dll>"`. Si no está instalado, **dilo** y ofrece instalarlo (preguntando).
5. Objetos reales (.NET Framework legacy, mezcla nativa/gestionada): **REA MCP** (`npx rea-agents setup`) da sesiones con evidencia y trazado por función; es la mejor opción cuando necesitas "cómo funciona esto de punta a punta".

**Aviso importante (lo vi en pruebas reales):** las DLL del SDK de .NET moderno (Roslyn, por ejemplo) son **híbridas**: el metadata tiene cientos de métodos `InternalCall` implementados en nativo en la propia `.text`. En esas, los nombres del metadata no son legibles con un lector mínimo y el RVA del cuerpo del método no cae en ninguna sección. Si te sale "índice fuera del heap" o un RVA sin sección: **es una DLL híbrida o compilada con ReadyToRun, no está obfuscada**. Para esa sigue con Ghidra/REA, no intentes arreglar el lector.

### B) Nativo (o el cuerpo está en nativo)
1. **Antes de abrir un desensamblador**, mira si es ofuscado: `carcasa` (Costura, SmartAssembly, Themida, VMProtect, ConfuserEx, Eazfuscator…) y si quedaron `.pdb` con rutas.
2. `cadenas` → rutas, URL, claves y APIs de interés (`VirtualAlloc`, `CreateProcess`, `Crypt32`, `WinHttp`, `LoadLibrary`…). Son hipótesis, no pruebas: cada cadena se confirma mirando dónde se usa.
3. Desensamblador: **Ghidra** (gratis), **IDA** o **Hopper** si los tienes. Con ellos, el orden es: entrada → funciones que usan las cadenas → funciones que llaman a las de interés.
4. **REA** es el atajo cuando quieres que un agente recorra esa cadena por ti y te devuelva el pseudocódigo con su evidencia: `npx rea-agents setup` y luego se le pide la función o el comportamiento.
5. Si hay ofuscación comercial, **primero se desembala** (encontrar la OEP, volcar y arreglar importaciones con Scylla/DIE). Analizar el stub no dice nada del programa real.

## Cómo se escribe el informe
1. **Qué es**: tipo, arquitectura, tamaño, firma, fechas, si está firmado.
2. **Qué declara**: los 5–15 tipos o métodos más significativos con la prueba (fila/metadata) y las referencias.
3. **Qué datos maneja**: cadenas y APIs agrupadas por tema (red, credenciales, sistema de archivos, registro).
4. **De dónde salió**: huellas de ofuscador/empaquetador, compilador, PDB.
5. **Qué NO se puede afirmar** con lo analizado. Esta sección es obligatoria.
6. **Siguiente paso concreto**: qué abrir, qué función, con qué herramienta.

## Límites y cuidados
- **No ejecutes** el binario ni los scripts que traiga, ni siquiera con `--help`: analiza en estático.
- Trabaja **siempre** sobre un binario que el usuario posee o está autorizado a examinar. Dilo una vez y sigue; no repitas moralina en cada línea.
- Herramientas comerciales (IDA, Hopper, JEB): se usan con licencia propia; nunca claves, cracks ni activadores.
- Un binario firmado por un tercero no es tuyo para redistribuir: se analiza, no se publica.
- Si el usuario pide reconstruir un producto ajeno, deja claro qué partes son suyas y cuáles son de otros.
