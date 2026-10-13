---
name: protoforja
description: Conecta APOLO con ProtoForja (protoforja.com), la web que convierte una idea de aparato en un proyecto construible (piezas reales, cableado, código, caja 3D imprimible, montaje). Propone 3 versiones (económica, normal, avanzada) adaptadas a si el usuario es principiante o experto, y guarda los proyectos en su cuenta de ProtoForja para verlos en la web. Úsala cuando el usuario diga "en ProtoForja…", "fórjame…", "quiero construir un aparato que…" y tenga la skill activada, o pida ver sus proyectos de ProtoForja.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [protoforja, proto forja, fórjame, forjame, forja un proyecto, mis proyectos de protoforja, quiero construir un aparato, quiero hacer un aparato]
---

# ProtoForja desde APOLO

Usa `scripts/pf.py` con `ejecutar_script_skill` (`nombre: protoforja`, `script: scripts/pf.py`). Habla con la API de ProtoForja; los proyectos se guardan en la cuenta del usuario si hay clave.

## Primera vez: conectar la cuenta
1. Lee `_datos/protoforja.json` con `leer_recurso_skill` (`ruta: _datos/protoforja.json`). Si existe y tiene `clave`, ya está conectada.
2. Si no: dile al usuario que entre en **protoforja.com → Mi cuenta → Conectar con APOLO → Crear clave** y te la pegue (empieza por `pf_`). Si no tiene cuenta, que la cree gratis ahí mismo.
3. Guárdala con `anotar_skill` (`nombre: protoforja`, `archivo: protoforja.json`, `modo: reemplazar`, `texto: {"url": "https://protoforja.com", "clave": "pf_…"}`). Mientras la web no esté publicada, la url es `http://localhost:8080`.
4. **Nunca** repitas la clave en el chat ni la guardes en la memoria.

Sin clave también funciona, pero entonces el proyecto no queda en su cuenta: díselo.

## Pedir un proyecto (siempre en este orden)
1. **Perfil:** si no sabes si el usuario es principiante o tiene experiencia (míralo en tu memoria), pregúntaselo una vez y recuérdalo con `recordar` ("En ProtoForja el usuario es principiante/experto").
2. **Opciones:** `args: ["opciones", "<idea en sus palabras>", "<principiante|experto>"]`. Cuéntale las 3 versiones en corto (nombre, precio, qué hace, 2-3 piezas) y pregúntale cuál quiere. **No elijas por él.**
3. **Proyecto:** `args: ["proyecto", "<misma idea>", "<JSON de la opción elegida, copiado tal cual de la línea OPCIONES_JSON>", "<perfil>"]`. Tarda 15-40 s. Si copiar el JSON da problemas, pon solo el nivel (`"economica"`, `"normal"` o `"avanzada"`): el script vuelve a pedir las opciones y usa esa.
4. **Responde corto:** nombre, coste, cuántas piezas, el primer paso, y el enlace a la web (ahí está la caja 3D y los STL). Si va por voz, sin enlaces ni tablas: "Listo, te lo dejé en tu cuenta de ProtoForja".
5. Si quiere los STL ya en su PC, la salida trae los parámetros de la caja: úsalos con la skill `taller-hardware` (`scripts/caja.py`).

## Otras órdenes
- `["lista"]` → sus proyectos (id, nombre, versión, coste).
- `["ver", "<id>"]` → el proyecto completo en texto (para resumirlo, leer el código o rehacer la caja).

## Si falla
- 401 → la clave no vale: que cree otra en la web.
- 429 → ha llegado al límite de proyectos por hora: díselo.
- Sin conexión → la web puede estar caída o sin publicar todavía; ofrece hacerlo con la skill `taller-hardware` (sin cuenta).
