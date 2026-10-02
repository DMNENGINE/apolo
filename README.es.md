<p align="center">
  <img src="docs/media/banner.png" alt="APOLO — compañero de IA para el escritorio" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Español</b>
</p>

**APOLO** es un compañero de escritorio de código abierto: un robot 3D animado que vive arriba de tu pantalla. Vigila, aprueba y dirige a tus agentes de IA: **Claude Code**, **Gemini CLI** y su propio **núcleo multi-modelo** (Ollama, OpenAI, Anthropic, Gemini, OpenRouter…).

Tú mandas. Cada acción delicada te pide permiso desde la isla flotante, Discord, el Stream Deck o el móvil.

## ✨ Qué hace

- 🏝️ **Isla flotante** siempre visible: terminales activas, subagentes, código en vivo, uso del plan y contexto.
- 🛡️ **Permisos** con un clic: permitir, denegar o "permitir siempre". Los comandos peligrosos piden doble confirmación.
- 🧠 **Núcleo multi-modelo propio**: agente con herramientas, memoria semántica persistente, tareas programadas, subagentes en paralelo y Mission Control.
- 🌐 **Usa el navegador** (extensión para Chrome/Edge/Brave) con permiso por sitio; nunca toca contraseñas ni tarjetas.
- 🖥️ **Ve la pantalla y usa ratón y teclado** con permiso por encargo, borde rojo visible y botón de pánico.
- 🗣️ **Voz neural** y órdenes por micrófono (Whisper) o por texto.
- 🔌 **Integraciones**: Telegram, WhatsApp y Discord (permisos con botones desde el móvil), correo (Gmail, Outlook y más), GitHub, Hugging Face, ElevenLabs, panel web, servidor MCP, Stream Deck y hooks de Gemini CLI.
- 🤖 **Personalidad**: más de 20 gestos animados.

## 🚀 Instalación

### Instalación en una línea (recomendada)

Abre **PowerShell** y ejecuta:

```powershell
irm https://raw.githubusercontent.com/DMNENGINE/apolo/main/install.ps1 | iex
```

Instala lo que falte (Node.js, Electron, Python y la voz), deja APOLO en `%LOCALAPPDATA%\APOLO`, crea accesos directos en el menú Inicio y el Escritorio, y lo arranca. Para actualizar, ejecútalo otra vez; tus datos de `%APPDATA%` se conservan.

### Instalación manual

Requisitos: Windows 10/11 y [Node.js](https://nodejs.org) 20+.

```powershell
git clone https://github.com/DMNENGINE/apolo.git
cd apolo
npm install
npm start
```

Después, en el icono de la bandeja:

1. **Instalar hooks** para conectar Claude Code.
2. **Abrir panel de control** para elegir modelos y claves.
3. Opcional: **Copiar token para la extensión** y cargar `extension/` en `chrome://extensions` (modo desarrollador → Cargar descomprimida).

Voz neural (opcional): `pip install edge-tts`.

> Próximamente: instalador `.exe`.

Arquitectura, seguridad y hoja de ruta: consulta el [README en inglés](README.md).

## 📄 Licencia

[MIT](LICENSE) © DMNENGINE
