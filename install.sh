#!/usr/bin/env bash
# APOLO - instalador de una linea para Linux (Ubuntu/Debian; tambien Fedora y Arch)
#   curl -fsSL https://raw.githubusercontent.com/DMNENGINE/apolo/main/install.sh | bash
# Descarga APOLO en ~/.local/share/APOLO, instala Node.js si falta (sin sudo, en la carpeta de APOLO), las dependencias
# (Electron incluido), crea el acceso en el menu de aplicaciones y lo arranca.
# Volver a ejecutarlo = actualizar (tus datos viven en ~/.config/robot-companion y no se tocan).
# Opcional (recomendado): tmux (escribir en las sesiones de Claude Code), xdotool (X11), Python 3 + pip (voz).
set -euo pipefail

REPO="DMNENGINE/apolo"
RAMA="main"
DIR="${APOLO_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/APOLO}"
NODE_MIN=20

verde() { printf '\n\033[32m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
aviso() { printf '    \033[33m! %s\033[0m\n' "$*"; }
tiene() { command -v "$1" >/dev/null 2>&1; }

printf '\n   \033[32mAPOLO - AI desktop companion\033[0m\n   github.com/%s\n' "$REPO"
tiene curl || { echo "Falta curl (sudo apt install curl)"; exit 1; }
tiene tar || { echo "Falta tar"; exit 1; }

# ---------- 1. Node.js (>= 20): el del sistema o uno propio en $DIR/.node (sin sudo) ----------
verde "Node.js"
NODE_DIR="$DIR/.node"
version_node() { "$1" -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }
if tiene node && [ "$(version_node node)" -ge "$NODE_MIN" ] 2>/dev/null; then
  info "encontrado $(node -v)"
elif [ -x "$NODE_DIR/bin/node" ] && [ "$(version_node "$NODE_DIR/bin/node")" -ge "$NODE_MIN" ]; then
  export PATH="$NODE_DIR/bin:$PATH"; info "propio $(node -v)"
else
  case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; armv7l) ARCH=armv7l ;; *) echo "Arquitectura no soportada: $(uname -m)"; exit 1 ;; esac
  BASE="https://nodejs.org/dist/latest-v22.x"
  ARCHIVO=$(curl -fsSL "$BASE/SHASUMS256.txt" | awk -v a="linux-$ARCH.tar.xz" '$2 ~ a"$" {print $2; exit}')
  [ -n "$ARCHIVO" ] || { echo "No encuentro Node.js 22 para $ARCH"; exit 1; }
  info "descargando $ARCHIVO (solo para APOLO, sin tocar el sistema)..."
  rm -rf "$NODE_DIR"; mkdir -p "$NODE_DIR"
  curl -fsSL "$BASE/$ARCHIVO" | tar -xJ -C "$NODE_DIR" --strip-components=1
  export PATH="$NODE_DIR/bin:$PATH"; info "instalado $(node -v)"
fi

# ---------- 2. Descargar APOLO ----------
verde "Descargando APOLO en $DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# version exacta (commit) para que APOLO sepa cuando hay una actualizacion
SHA=$(curl -fsSL -H 'User-Agent: APOLO-instalador' "https://api.github.com/repos/$REPO/commits/$RAMA" 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).sha||'')}catch{}})" || true)
[ -n "$SHA" ] || aviso "no pude leer la version de GitHub (los avisos de actualizacion no funcionaran)"
REF="${SHA:-$RAMA}"
# APOLO_TARBALL=<archivo .tar.gz>: instalar desde un paquete local (pruebas antes de publicar)
if [ -n "${APOLO_TARBALL:-}" ]; then tar -xzf "$APOLO_TARBALL" -C "$TMP"; else curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP"; fi
SRC=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
# si APOLO esta abierto, cerrarlo (y sus ayudantes: Whisper, etc.) antes de reemplazar archivos
pkill -f -- "$DIR/node_modules/electron" 2>/dev/null || true
pkill -f -- "$DIR/tools/" 2>/dev/null || true
for _ in $(seq 1 20); do pgrep -f -- "$DIR/node_modules/electron" >/dev/null || break; sleep 0.5; done
mkdir -p "$DIR"
# codigo nuevo; se conservan node_modules (actualizar rapido) y el Node propio
find "$DIR" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .node -exec rm -rf {} +
cp -a "$SRC"/. "$DIR"/
[ -n "$SHA" ] && printf '{"sha":"%s","instalado":"%s"}' "$SHA" "$(date -Iseconds)" > "$DIR/instalado.json" && info "version ${SHA:0:7}"

# ---------- 3. Dependencias (Electron incluido) ----------
verde "Instalando dependencias (Electron, three.js, discord.js...) - puede tardar 1-3 min"
cd "$DIR"
NODE_ENV='' npm install --no-audit --no-fund --loglevel=error
ELECTRON="$DIR/node_modules/electron/dist/electron"
if [ ! -x "$ELECTRON" ]; then aviso "el binario de Electron no se descargo, reintentando..."; node node_modules/electron/install.js; fi
[ -x "$ELECTRON" ] || { echo "No se pudo descargar Electron. Revisa tu conexion y vuelve a ejecutar."; exit 1; }
info "Electron OK"
# Ubuntu 23.10+ restringe los "user namespaces" (AppArmor): Chromium necesita entonces su sandbox SUID (chrome-sandbox de root).
# Se configura con sudo (pide la contrasena una vez); si no se puede, APOLO arranca con --no-sandbox y se avisa.
EXTRA=""
SANDBOX="$DIR/node_modules/electron/dist/chrome-sandbox"
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = "1" ] || ! unshare -Ur true 2>/dev/null; then
  if [ -f "$SANDBOX" ] && [ "$(stat -c %u:%a "$SANDBOX" 2>/dev/null)" = "0:4755" ]; then info "sandbox de Chromium ya configurado"
  elif [ -f "$SANDBOX" ] && info "tu sistema necesita configurar el sandbox de Chromium (sudo):" && sudo chown root:root "$SANDBOX" && sudo chmod 4755 "$SANDBOX"; then info "sandbox de Chromium configurado"
  else EXTRA="--no-sandbox"; aviso "sin sandbox de Chromium (no pude usar sudo): APOLO arranca con --no-sandbox"; fi
fi

# ---------- 4. Opcionales ----------
verde "Opcionales"
FALTAN=""
tiene tmux || FALTAN="$FALTAN tmux"
[ "${XDG_SESSION_TYPE:-}" = "x11" ] && ! tiene xdotool && FALTAN="$FALTAN xdotool"
tiene python3 || FALTAN="$FALTAN python3"
if [ -n "$FALTAN" ]; then
  if tiene apt-get; then CMD="sudo apt install$FALTAN python3-pip"; elif tiene dnf; then CMD="sudo dnf install$FALTAN python3-pip"; elif tiene pacman; then CMD="sudo pacman -S$FALTAN python-pip"; else CMD="(tu gestor de paquetes)$FALTAN"; fi
  aviso "recomendado:$FALTAN  →  $CMD"
  info "(tmux: escribir en tus sesiones de Claude Code; xdotool: lo mismo sin tmux en X11)"
fi
if tiene python3; then
  if python3 -m pip install --quiet --disable-pip-version-check --user edge-tts faster-whisper sounddevice av 2>/dev/null \
     || python3 -m pip install --quiet --disable-pip-version-check --user --break-system-packages edge-tts faster-whisper sounddevice av 2>/dev/null; then
    info "voz neural y reconocimiento de voz instalados"
  else aviso "la voz no se pudo instalar (pip). APOLO funciona igual; luego: bandeja → Instalar voz y micrófono"; fi
fi

# ---------- 5. Acceso en el menu de aplicaciones ----------
verde "Acceso en el menu de aplicaciones"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS"
cat > "$APPS/apolo.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=APOLO
Comment=AI desktop companion
Exec="$ELECTRON" "$DIR" $EXTRA
Path=$DIR
Icon=$DIR/build/icon.png
Terminal=false
Categories=Utility;Development;
EOF
tiene update-desktop-database && update-desktop-database "$APPS" >/dev/null 2>&1 || true
info "$APPS/apolo.desktop"

# ---------- 6. Arrancar ----------
verde "Arrancando APOLO"
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  # independiente de esta terminal: no se cierra al cerrarla
  (cd "$DIR" && setsid nohup "$ELECTRON" "$DIR" $EXTRA >/dev/null 2>&1 &)
  printf '\n   \033[32mAPOLO esta en marcha: busca el robot arriba de tu pantalla y su icono en la bandeja.\033[0m\n'
  printf '   Desde la bandeja: "Instalar hooks" (Claude Code) y "Abrir panel de control".\n'
else
  aviso "no hay escritorio grafico en esta sesion: abrelo desde el menu de aplicaciones (APOLO)"
fi
printf '   Para actualizar, vuelve a ejecutar el mismo comando.\n\n'
