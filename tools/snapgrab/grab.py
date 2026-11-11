#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SNAPGRAB - Descargador universal (YouTube, Instagram, TikTok, Facebook, X, etc.)
Pegas el link -> eliges foto/video -> se descarga.

Uso:
    python grab.py                          # modo asistente (pregunta el link)
    python grab.py <url>                    # descarga lo mejor automaticamente
    python grab.py <url> --fotos            # solo fotos/imagenes
    python grab.py <url> --todo             # carrusel completo + video
    python grab.py <url> -o "C:\\MisVideos"  # carpeta destino
    python grab.py <url> --info             # solo ver que hay, no descargar
    python grab.py <url> --cookies navegador# usar cookies de chrome/firefox/edge...
    python grab.py --gui                    # abre la interfaz grafica

Tambien hay interfaz grafica: app.pyw  (doble clic)
"""
import os
import re
import sys
import glob
import json
import shutil
import argparse
import subprocess
from pathlib import Path

# consola de Windows (cp1252) rompe con acentos/emojis -> forzar UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import yt_dlp
    from yt_dlp.utils import DownloadError
except ImportError:
    print("Falta yt-dlp. Instala con:\n    python -m pip install -U \"yt-dlp[default]\" curl_cffi")
    sys.exit(1)

# ----------------------------------------------------------------------------
# Configuracion
# ----------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
# carpeta destino por defecto: <Descargas de Windows>\SnapGrab
DOWNLOAD_DIR = Path.home() / "Downloads" / "SnapGrab"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# cookies.txt exportado (se usa si existe) y perfiles navegables
COOKIES_DIR = BASE_DIR / "cookies"
COOKIES_TXT = COOKIES_DIR / "cookies.txt"
LOGIN_PROFILE = COOKIES_DIR / "perfil"   # perfil aislado donde inicias sesión

VIDEO_EXT = (".mp4", ".webm", ".mkv", ".mov", ".m4a", ".mp3", ".opus")
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".avif")


def find_ffmpeg() -> str | None:
    """Busca ffmpeg en PATH, junto al script y en las carpetas de winget."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    local = BASE_DIR / "ffmpeg" / "bin" / "ffmpeg.exe"
    if local.exists():
        return str(local)
    winget = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    if winget.exists():
        hits = sorted(winget.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"))
        if hits:
            return str(hits[-1])
    return None


FFMPEG = find_ffmpeg()


def is_url(txt: str) -> bool:
    return bool(re.match(r"^https?://", txt.strip(), re.I))


def detect_platform(url: str) -> str:
    u = url.lower()
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "instagram.com" in u:
        return "instagram"
    if "tiktok.com" in u:
        return "tiktok"
    if "facebook.com" in u or "fb.watch" in u:
        return "facebook"
    if "twitter.com" in u or "x.com" in u:
        return "x"
    if "pinterest." in u:
        return "pinterest"
    if "vimeo.com" in u:
        return "vimeo"
    return "otros"


# ----------------------------------------------------------------------------
# Opciones base de yt-dlp
# ----------------------------------------------------------------------------
def base_opts(cookies: str | None = None) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "http_headers": {"User-Agent": UA, "Accept-Language": "es,en;q=0.9"},
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 10,
        "ignoreerrors": False,
        "restrictfilenames": False,
        "windowsfilenames": True,
        "trim_file_name": 180,
        "concurrent_fragment_downloads": 4,
    }
    if FFMPEG:
        opts["ffmpeg_location"] = str(Path(FFMPEG).parent)
    opts.update(cookie_opts(cookies))
    return opts


def cookie_opts(cookies: str | None = None) -> dict:
    """
    Cookies SOLO si se piden explícitamente (--cookies, o desde la GUI).
    Nunca se aplican de forma global: un cookies.txt con miles de cookies de
    muchas cuentas hace que YouTube responda 'Requested format is not available'.
    Instagram y X gestionan sus cookies en sus propios módulos.
    """
    if not cookies:
        return {}
    if cookies.lower().endswith(".txt") and Path(cookies).exists():
        return {"cookiefile": cookies}
    return {"cookiesfrombrowser": (cookies, None, None, None)}


# ---------------------------------------------------------------------------
# Perfiles de TU Chrome real
# ---------------------------------------------------------------------------
CHROME_USERDATA = Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "User Data"
CONFIG_JSON = COOKIES_DIR / "config.json"


def leer_config() -> dict:
    try:
        return json.loads(CONFIG_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}


def guardar_config(**kw):
    cfg = leer_config()
    cfg.update(kw)
    COOKIES_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_JSON.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def listar_perfiles_chrome() -> list[dict]:
    """
    Devuelve los perfiles de Chrome reales: [{'dir','nombre','email','abierto','instagram'}]
    'abierto' = Chrome lo tiene bloqueado ahora mismo.
    """
    res = []
    if not CHROME_USERDATA.exists():
        return res
    cands = [CHROME_USERDATA / "Default"] + sorted(CHROME_USERDATA.glob("Profile *"))
    for p in cands:
        db = p / "Network" / "Cookies"
        if not db.exists():
            continue
        nombre, email = p.name, ""
        try:
            j = json.loads((p / "Preferences").read_text(encoding="utf-8", errors="replace"))
            nombre = j.get("profile", {}).get("name") or p.name
            infos = j.get("account_info") or []
            email = next((a.get("email") for a in infos if a.get("email")), "")
        except Exception:
            pass
        res.append({
            "dir": p.name,
            "nombre": nombre,
            "email": email,
            "abierto": _esta_bloqueado(db),
            "instagram": _cuenta_cookies(p),
        })
    return res


def _esta_bloqueado(db: Path) -> bool:
    tmp = Path(os.environ["TEMP"]) / "snapgrab_lock_probe.db"
    try:
        shutil.copy2(db, tmp)
        tmp.unlink(missing_ok=True)
        return False
    except PermissionError:
        return True
    except Exception:
        return True


def _cuenta_cookies(perfil: Path) -> int:
    """Cuantas cookies de instagram tiene (0 si no se puede leer)."""
    db = perfil / "Network" / "Cookies"
    tmp = Path(os.environ["TEMP"]) / f"snapgrab_cnt_{perfil.name.replace(' ', '_')}.db"
    target = db
    try:
        shutil.copy2(db, tmp)
        target = tmp
    except Exception:
        pass
    try:
        import sqlite3
        con = sqlite3.connect(f"file:{target}?mode=ro&immutable=1", uri=True, timeout=2)
        n = con.execute("SELECT count(*) FROM cookies WHERE host_key LIKE '%instagram.com'").fetchone()[0]
        con.close()
        return n
    except Exception:
        return -1
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


def estado_cifrado(perfil: str) -> str:
    """
    Devuelve 'v20' si ese perfil usa App-Bound Encryption (cookies ilegibles),
    'ok' si se pueden leer, 'abierto' si Chrome lo tiene bloqueado, '?' si no se sabe.
    """
    db = CHROME_USERDATA / perfil / "Network" / "Cookies"
    if not db.exists():
        return "?"
    tmp = Path(os.environ["TEMP"]) / f"snapgrab_ver_{perfil.replace(' ', '_')}.db"
    try:
        shutil.copy2(db, tmp)
    except Exception:
        return "abierto"
    try:
        import sqlite3
        con = sqlite3.connect(f"file:{tmp}?mode=ro&immutable=1", uri=True, timeout=2)
        filas = con.execute(
            "SELECT substr(encrypted_value,1,3) FROM cookies WHERE length(encrypted_value)>0"
        ).fetchall()
        con.close()
        if not filas:
            return "ok"
        v20 = sum(1 for (p,) in filas if p == b"v20")
        return "v20" if v20 == len(filas) else ("parcial" if v20 else "ok")
    except Exception:
        return "?"
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass



def elegir_perfil_chrome(interactivo: bool = True) -> str | None:
    """
    Deja elegir uno de TUS perfiles de Chrome y lo guarda en config.json.
    Si el perfil esta abierto, avisa que hay que cerrar Chrome (o solo ese perfil).
    """
    perfiles = listar_perfiles_chrome()
    if not perfiles:
        return None
    print("\n  Perfiles de TU Chrome:")
    for i, p in enumerate(perfiles, 1):
        estado = "ABIERTO (bloqueado)" if p["abierto"] else "cerrado (legible)"
        ig = "" if p["instagram"] <= 0 else f"  insta={p['instagram']} cookies"
        print(f"   [{i}] {p['nombre']:<22} {p['email']:<32} {estado}{ig}")

    if not interactivo:
        # automatico: primero con instagram y legible, luego cualquiera legible
        for p in perfiles:
            if p["instagram"] > 0 and not p["abierto"]:
                guardar_config(perfil=p["dir"])
                return p["dir"]
        return None

    try:
        sel = input("\n  Numero de perfil (Enter = cancelar): ").strip()
    except (EOFError, KeyboardInterrupt):
        return None
    if not sel.isdigit() or not (1 <= int(sel) <= len(perfiles)):
        return None
    p = perfiles[int(sel) - 1]
    guardar_config(perfil=p["dir"], nombre=p["nombre"], email=p["email"])
    print(f"  Usando el perfil: {p['nombre']} ({p['dir']})")
    if p["abierto"]:
        print("  [!] Ese perfil esta abierto: Chrome bloquea sus cookies.")
        print("      Cierra Chrome y vuelve a intentarlo, o usa otra ventana.")
    return p["dir"]


def _chrome_exe() -> str | None:
    for p in (
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Chromium/Application/chrome.exe",
    ):
        if p.exists():
            return str(p)
    return shutil.which("chrome")



def _edge_exe() -> str | None:
    for p in (
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
    ):
        if p.exists():
            return str(p)
    return shutil.which("msedge")


def navegador_login() -> tuple[str, str]:
    """
    Devuelve (exe, nombre_para_yt_dlp). Prefiere Chrome; Edge solo si no hay Chrome.
    """
    ch = _chrome_exe()
    if ch:
        return ch, "chrome"
    ed = _edge_exe()
    if ed:
        return ed, "edge"
    return "", ""


def abrir_login(cookies_file: Path | None = None) -> str | None:
    """
    Abre Chrome con un perfil PROPIO de SnapGrab para que inicies sesión en IG/FB/TikTok.
    Al cerrar el navegador, exporta las cookies a cookies.txt automáticamente.
    Devuelve la ruta del .txt exportado (o None).
    """
    exe, bro = navegador_login()
    if not exe:
        return None
    nombre = "Chrome" if bro == "chrome" else "Edge"
    LOGIN_PROFILE.mkdir(parents=True, exist_ok=True)
    out = Path(cookies_file) if cookies_file else COOKIES_TXT
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"\nSe abrirá {nombre} con un perfil de SnapGrab.")
    print("  1) Inicia sesión en Instagram / Facebook / TikTok")
    print(f"  2) CIERRA la ventana de ese {nombre}")
    print("  3) Las cookies se guardan solas y el programa sigue\n")

    proc = subprocess.Popen([
        exe,
        f"--user-data-dir={LOGIN_PROFILE}",
        "--no-first-run", "--no-default-browser-check",
        f"--user-agent={UA}",
        "https://www.instagram.com/",
    ])
    proc.wait()

    print("Exportando cookies del perfil…")
    cmd = [sys.executable, "-m", "yt_dlp",
           "--cookies-from-browser", f"{bro}:{LOGIN_PROFILE}",
           "--cookies", str(out),
           "--skip-download", "--simulate",
           "https://www.instagram.com/"]
    subprocess.run(cmd, capture_output=True)
    if out.exists() and out.stat().st_size > 0:
        print(f"Cookies guardadas en: {out}")
        return str(out)
    print(f"No pude exportar cookies (¿cerraste {nombre}?).")
    return None




def make_ydl(extra: dict | None = None, cookies: str | None = None) -> yt_dlp.YoutubeDL:
    opts = base_opts(cookies)
    if extra:
        opts.update(extra)
    return yt_dlp.YoutubeDL(opts)


# ----------------------------------------------------------------------------
# Analisis del link (que hay dentro)
# ----------------------------------------------------------------------------
def analizar_url(url: str, cookies: str | None = None) -> dict:
    """
    Instagram  -> instagram.py  (instagrapi + respaldo instaloader)
    X/Twitter  -> twitter.py    (syndication, fotos y videos sin cookies)
    resto      -> yt-dlp
    """
    if "instagram.com" in url.lower():
        try:
            import instagram
            return instagram.analizar(url)
        except Exception as e:
            raise RuntimeError(str(e))

    if re.search(r"(?:^|//)(?:www\.|mobile\.)?(?:x|twitter)\.com/", url, re.I):
        try:
            import twitter
            return twitter.analizar(url)
        except Exception as e:
            raise RuntimeError(str(e))

    try:
        return _analizar_crudo(url, cookies)
    except Exception as e:
        msg = str(e).lower()
        sin_sesion = ("empty media response" in msg or "login" in msg or
                      "requested content is not available" in msg or "api is not granting" in msg or
                      "failed to decrypt" in msg)
        if not sin_sesion:
            raise
        try:
            return _analizar_crudo(url, cookies, impersonate=True)
        except Exception:
            raise e


def _analizar_crudo(url: str, cookies: str | None = None, impersonate: bool = False) -> dict:
    extra = {"skip_download": True, "extract_flat": "in_playlist",
             "socket_timeout": 20, "retries": 1}
    if impersonate:
        extra["impersonate"] = "chrome"
    with make_ydl(extra, cookies) as ydl:
        info = ydl.extract_info(url, download=False)

    if info is None:
        raise RuntimeError("No se pudo leer el link.")

    items = []
    if info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if e]
        for i, e in enumerate(entries, 1):
            items.append({
                "n": i,
                "id": e.get("id"),
                "title": e.get("title") or e.get("id") or f"item{i}",
                "url": e.get("webpage_url") or e.get("url") or url,
                "kind": _guess_kind(e),
                "duration": e.get("duration"),
                "ext": e.get("ext"),
            })
        title = info.get("title") or "Album"
        kind = "playlist"
    else:
        items.append({
            "n": 1,
            "id": info.get("id"),
            "title": info.get("title") or info.get("id") or "video",
            "url": info.get("webpage_url") or url,
            "kind": "video",
            "duration": info.get("duration"),
            "ext": info.get("ext"),
        })
        title = info.get("title") or "Vídeo"
        kind = "video"

    return {
        "url": url,
        "platform": detect_platform(url),
        "title": title,
        "kind": kind,
        "count": len(items),
        "thumbnail": info.get("thumbnail"),
        "uploader": info.get("uploader") or info.get("channel"),
        "items": items,
    }


def _guess_kind(entry: dict) -> str:
    ext = (entry.get("ext") or "").lower()
    if ext in IMAGE_EXT:
        return "foto"
    if entry.get("duration"):
        return "video"
    if ext in VIDEO_EXT:
        return "video"
    return "foto"


# ----------------------------------------------------------------------------
# Descargas
# ----------------------------------------------------------------------------
analyze = analizar_url  # alias usado por la GUI

def _outtmpl(folder: Path, name: str) -> str:
    return str(folder / f"{name}.%(ext)s")


def _find_downloaded(folder: Path, stem: str) -> str | None:
    hits = sorted(glob.glob(str(folder / f"{stem}.*")), key=os.path.getmtime, reverse=True)
    for h in hits:
        if Path(h).suffix.lower() in VIDEO_EXT + IMAGE_EXT:
            return h
    return None


def _safe_name(text: str, fallback: str = "media") -> str:
    text = re.sub(r"[\\/:*?\"<>|#\r\n\t]+", " ", text or "")
    text = re.sub(r"\s+", " ", text).strip(" .")
    return (text[:120] or fallback).strip()


def download_video(url: str, folder: Path, cookies: str | None = None,
                   want_audio: bool = False, short: bool = False) -> str | None:
    """Descarga el video. short=True => solo reels/shorts (un item)."""
    folder.mkdir(parents=True, exist_ok=True)
    if want_audio:
        fmt = "bestaudio/best"
        post = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}]
    else:
        fmt = "bv*+ba/b"
        post = [{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}]

    extra = {
        "format": fmt,
        "outtmpl": _outtmpl(folder, "%(uploader)s - %(title).100s [%(id)s]"),
        "postprocessors": post,
        "merge_output_format": "mp4",
        "playlist_items": "1" if short else None,
        "noplaylist": short,
    }
    extra = {k: v for k, v in extra.items() if v is not None}

    with make_ydl(extra, cookies) as ydl:
        info = ydl.extract_info(url, download=True)
    if info is None:
        return None
    if FFMPEG and os.path.exists(FFMPEG):
        reqs = info.get("requested_downloads") or []
        if reqs:
            return reqs[0].get("filepath")
    return info.get("_filename") or info.get("filepath")


def download_fotos(url: str, folder: Path, cookies: str | None = None,
                   solo_fotos: bool = True, todo: bool = False) -> list[str]:
    """
    Descarga fotos de un carrusel/post de Instagram o Facebook.
    Instagram: yt-dlp expone cada slide del carrusel como entrada de playlist.
    Si 'solo_fotos' y alguna entrada es video se puede filtrar; con 'todo' baja ambos.
    """
    folder.mkdir(parents=True, exist_ok=True)
    data = analizar_url(url, cookies)
    saved: list[str] = []

    for it in data["items"]:
        kind = it["kind"]
        if solo_fotos and not todo and kind != "foto":
            continue
        base = _safe_name(f"{data['title']} - {it['n']:02d}", f"foto{it['n']}")
        target = folder / base
        # si ya existe, saltar
        if _find_downloaded(folder, base):
            saved.append(str(_find_downloaded(folder, base)))
            continue
        extra = {
            "outtmpl": _outtmpl(folder, base),
            "format": "bv*+ba/b" if kind == "video" else None,
            "merge_output_format": "mp4",
            "noplaylist": True,
            "skip_download": False,
        }
        extra = {k: v for k, v in extra.items() if v is not None}
        try:
            with make_ydl(extra, cookies) as ydl:
                ydl.extract_info(it["url"], download=True)
            got = _find_downloaded(folder, base)
            if got:
                saved.append(got)
            else:
                print(f"  [!] no se guardó: {base}")
        except Exception as e:
            print(f"  [!] fallo {it['n']}: {e}")
    return saved


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------
def auto_descargar(url: str, folder: Path, cookies: str | None = None,
                   modo: str = "auto") -> list[str]:
    plat = detect_platform(url)
    try:
        data = analizar_url(url, cookies)
    except Exception as e:
        print(f"[x] No pude analizar el link: {e}")
        return []

    print(f"\n  Plataforma : {plat}")
    print(f"  Título     : {data['title']}")
    print(f"  Contenido  : {data['count']} elemento(s) [{data['kind']}]")
    print(f"  Carpeta    : {folder}\n")

    if modo == "info":
        for it in data["items"]:
            print(f"    {it['n']:>2}. [{it['kind']}] {it['title']}")
        return []

    resultados: list[str] = []

    if plat == "instagram":
        # Instagram va por instagram.py
        try:
            import instagram
            resultados = instagram.descargar(url, folder, modo if modo != "info" else "todo")
        except Exception as e:
            print(f"  [x] Instagram: {e}")
    elif plat == "x":
        # X/Twitter va por twitter.py (fotos y videos)
        try:
            import twitter
            resultados = twitter.descargar(url, folder, modo if modo != "info" else "auto")
        except Exception as e:
            print(f"  [x] X/Twitter: {e}")
    elif data["kind"] == "playlist":
        # carrusel / album de otras plataformas
        resultados = download_fotos(url, folder, cookies, solo_fotos=(modo != "todo"), todo=True)
    else:
        f = download_video(url, folder, cookies, want_audio=(modo == "audio"))
        if f:
            resultados = [f]

    for r in resultados:
        print(f"  [OK] {r}")
    if not resultados:
        print("  [!] Nada descargado.")
    return resultados


def modo_asistente(cookies: str | None = None):
    print("=" * 62)
    print("  SNAPGRAB  ·  pega un link de Insta / TikTok / Facebook / YT")
    print("=" * 62)
    while True:
        try:
            url = input("\nLink (Enter para salir): ").strip().strip('"').strip("'")
        except (EOFError, KeyboardInterrupt):
            break
        if not url:
            break
        if not is_url(url):
            print("  [!] Eso no parece un link (debe empezar con http).")
            continue
        try:
            data = analizar_url(url, cookies)
        except Exception as e:
            print(f"  [x] {e}")
            continue

        print(f"\n  {data['title']}")
        print(f"  {data['count']} elemento(s) · plataforma {data['platform']}")
        if data["count"] > 1:
            for it in data["items"][:30]:
                print(f"    {it['n']:>2}. [{it['kind']}] {it['title']}")
            if data["count"] > 30:
                print(f"    ... y {data['count']-30} más")

        print("\n  ¿Qué descargo?")
        print("   [1] Video / Reel  (mejor calidad, mp4)")
        print("   [2] Fotos / carrusel completo")
        print("   [3] Todo lo que haya")
        print("   [4] Solo audio (mp3)")
        print("   [0] Cancelar")
        op = input("  Opción [1]: ").strip() or "1"

        modo = {"1": "video", "2": "fotos", "3": "todo", "4": "audio"}.get(op)
        if not modo:
            print("  Cancelado.")
            continue
        auto_descargar(url, DOWNLOAD_DIR, cookies, modo)

    print(f"\nListo. Tus archivos están en: {DOWNLOAD_DIR}")


def main():
    ap = argparse.ArgumentParser(description="SnapGrab: descarga foto/video de Instagram, TikTok, Facebook, YouTube...")
    ap.add_argument("url", nargs="?", help="link del contenido")
    ap.add_argument("-o", "--output", default=str(DOWNLOAD_DIR), help="carpeta destino")
    ap.add_argument("--fotos", action="store_true", help="solo fotos / carrusel")
    ap.add_argument("--todo", action="store_true", help="todo (fotos + video)")
    ap.add_argument("--audio", action="store_true", help="solo audio mp3")
    ap.add_argument("--info", action="store_true", help="solo mostrar contenido")
    ap.add_argument("--cookies", metavar="NAVEGADOR",
                    help="cookies del navegador: chrome, edge, firefox, brave, opera")
    ap.add_argument("--gui", action="store_true", help="abrir interfaz gráfica")
    ap.add_argument("--login", action="store_true",
                    help="abrir navegador para iniciar sesión y guardar cookies (Instagram privado)")
    ap.add_argument("--perfil", action="store_true",
                    help="elegir cuál de TUS perfiles de Chrome usar (usa tus sesiones reales)")
    args = ap.parse_args()

    if args.gui:
        os.execv(sys.executable, [sys.executable, str(BASE_DIR / "app.pyw")])
        return

    if args.login:
        ruta = abrir_login()
        if ruta:
            print("Listo. Ya puedes pasar links de Instagram/Facebook.")
        return

    if args.perfil:
        elegir_perfil_chrome()
        return

    folder = Path(args.output).expanduser()
    cookies = args.cookies.lower() if args.cookies else None

    if not args.url:
        modo_asistente(cookies)
        return

    modo = "auto"
    if args.fotos:
        modo = "fotos"
    elif args.todo:
        modo = "todo"
    elif args.audio:
        modo = "audio"
    elif args.info:
        modo = "info"

    auto_descargar(args.url.strip().strip('"'), folder, cookies, modo)


if __name__ == "__main__":
    main()
