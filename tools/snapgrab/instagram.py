# -*- coding: utf-8 -*-
"""
Motor de Instagram para SnapGrab — basado en instagrapi.
Sustituye a instaloader porque instagrapi mantiene doc_ids y API movil actualizados
y maneja sesiones, 2FA y challenge_required.
"""
import json
import re
import shutil
import sys
from pathlib import Path

try:
    from instagrapi import Client
    from instagrapi.exceptions import LoginRequired, ChallengeRequired, TwoFactorRequired
    TIENE_INSTAGRAPI = True
except ImportError:
    TIENE_INSTAGRAPI = False

RE_SHORTCODE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")
RE_STORY = re.compile(r"instagram\.com/stories/([A-Za-z0-9_.]+)/(\d+)")
RE_USUARIO = re.compile(r"instagram\.com/([A-Za-z0-9_.]+)/?(?:\?|$)")

DIR = Path(__file__).resolve().parent
SESION = DIR / "cookies" / "instagrapi_sesion.json"
COOKIES_TXT = DIR / "cookies" / "cookies.txt"
CACHE = DIR / "cookies" / "cache_ig.json"
CACHE_MIN = 30   # minutos que se recuerda un analisis


def _cache_leer(url: str) -> dict | None:
    try:
        import time
        j = json.loads(CACHE.read_text(encoding="utf-8"))
        e = j.get(url)
        if e and (time.time() - e.get("t", 0)) < CACHE_MIN * 60:
            return e.get("d")
    except Exception:
        pass
    return None


def _cache_guardar(url: str, data: dict):
    try:
        import time
        j = {}
        if CACHE.exists():
            try:
                j = json.loads(CACHE.read_text(encoding="utf-8"))
            except Exception:
                j = {}
        # limpiar entradas viejas
        ahora = time.time()
        j = {k: v for k, v in j.items() if (ahora - v.get("t", 0)) < CACHE_MIN * 60}
        d = {k: v for k, v in data.items() if not k.startswith("_")}
        j[url] = {"t": ahora, "d": d}
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


# --------------------------------------------------------------------------
# Cliente
# --------------------------------------------------------------------------
def _cliente(cargar_sesion: bool = True) -> "Client":
    if not TIENE_INSTAGRAPI:
        raise RuntimeError("Falta instagrapi: python -m pip install instagrapi")
    cl = Client()
    cl.delay_range = [1, 3]          # pausa entre peticiones: evita rate limit
    cl.request_timeout = 15
    if not cargar_sesion:
        return cl

    # 1) sesion guardada por instagrapi (dump_settings)
    if SESION.exists():
        try:
            st = cl.load_settings(SESION)
            cl.set_settings(st)
            if st.get("authorization"):
                return cl
        except Exception:
            pass

    # 2) sessionid del navegador (cookies.txt)
    sid = _sessionid_de(COOKIES_TXT) if COOKIES_TXT.exists() else None
    if sid:
        try:
            cl.login_by_sessionid(sid)
            SESION.parent.mkdir(parents=True, exist_ok=True)
            cl.dump_settings(SESION)
            return cl
        except Exception:
            pass

    # 3) anonimo: sirve para contenido publico
    return Client()


def _sesion_util(cl) -> bool:
    """True si el cliente tiene una sesion que Instagram acepta."""
    if not cl.authorization:
        return False
    try:
        cl.get_timeline_feed()
        return True
    except Exception:
        return False


def _sessionid_de(ruta: Path) -> str | None:
    import http.cookiejar
    try:
        jar = http.cookiejar.MozillaCookieJar(str(ruta))
        jar.load(ignore_discard=True, ignore_expires=True)
        vals = {c.name: c.value for c in jar if "instagram" in c.domain}
        return vals.get("sessionid")
    except Exception:
        return None


def sesion_valida() -> str | None:
    """Devuelve el usuario si hay sesion utilizable (sin gastar peticiones)."""
    cl = _cliente()
    return cl.username or None


def login(usuario: str, password: str, codigo_2fa: str | None = None) -> str | None:
    """
    Login por usuario/contraseña. Guarda la sesion y devuelve el usuario.
    Lanza TwoFactorRequired / ChallengeRequired para que la GUI los maneje.
    """
    cl = _cliente(cargar_sesion=False)
    cl.login(usuario, password, verification_code=codigo_2fa or "")
    SESION.parent.mkdir(parents=True, exist_ok=True)
    cl.dump_settings(SESION)
    return cl.username


def login_sessionid(sessionid: str) -> str | None:
    """Login reutilizando el sessionid del navegador."""
    cl = _cliente(cargar_sesion=False)
    cl.login_by_sessionid(sessionid)
    SESION.parent.mkdir(parents=True, exist_ok=True)
    cl.dump_settings(SESION)
    return cl.username


def importar_cookies(ruta: Path | None = None) -> str | None:
    """Crea la sesion a partir de un cookies.txt exportado del navegador."""
    import http.cookiejar
    ruta = Path(ruta) if ruta else COOKIES_TXT
    if not ruta.exists():
        return None
    jar = http.cookiejar.MozillaCookieJar(str(ruta))
    jar.load(ignore_discard=True, ignore_expires=True)
    vals = {c.name: c.value for c in jar if "instagram" in c.domain}
    sid = vals.get("sessionid")
    if not sid:
        return None
    try:
        return login_sessionid(sid)
    except Exception:
        return None


def refrescar_desde_navegador(perfil: str | None = None) -> str | None:
    """
    Re-exporta cookies del Chrome real (perfil de grab-config) y rehace la sesion.
    Es la via que no caduca: usa la sesion viva del navegador.
    """
    import http.cookiejar
    import shutil
    import tempfile
    import time

    try:
        import grab
    except Exception:
        return None

    cfg = grab.leer_config()
    perfil = perfil or cfg.get("perfil")
    if not perfil:
        return None

    db = grab.CHROME_USERDATA / perfil / "Network" / "Cookies"
    if not db.exists():
        return None

    tmp = Path(tempfile.gettempdir()) / f"ig_cookies_{int(time.time())}.db"
    try:
        shutil.copy2(db, tmp)
    except Exception:
        return None

    # Chrome cifra v20: no se puede descifrar. Solo funciona si alguna cookie es legible.
    try:
        import cookies_chrome
        n = cookies_chrome.extraer(perfil, tmp.with_suffix(".txt"), dominios=["instagram"])
    except Exception:
        n = 0
    tmp.unlink(missing_ok=True)

    if not n:
        return None
    sesion_txt = tmp.with_suffix(".txt")
    try:
        return importar_cookies(sesion_txt)
    finally:
        sesion_txt.unlink(missing_ok=True)


def estado() -> dict:
    """Devuelve informacion util para la GUI."""
    info = {
        "instagrapi": TIENE_INSTAGRAPI,
        "sesion_json": SESION.exists(),
        "cookies_txt": COOKIES_TXT.exists(),
        "usuario": None,
        "sesion_ok": False,
    }
    if SESION.exists():
        try:
            j = json.loads(SESION.read_text(encoding="utf-8"))
            info["usuario"] = j.get("username") or j.get("cookies", {}).get("ds_user_id")
            info["sesion_ok"] = bool(j.get("authorization"))
        except Exception:
            pass
    return info


# --------------------------------------------------------------------------
# Analisis
# --------------------------------------------------------------------------
def analizar(url: str) -> dict:
    """
    Usa cache (30 min). Si hay sesion valida va con instagrapi (accede a privado);
    si no, instaloader primero (mucho mas rapido para publico).
    """
    cacheado = _cache_leer(url)
    if cacheado:
        return cacheado

    errores = []
    hay_sesion = _tiene_sesion_util()

    orden = ["instaloader", "instagrapi"] if not hay_sesion else ["instagrapi", "instaloader"]

    for motor in orden:
        try:
            if motor == "instagrapi":
                d = _analizar_instagrapi(url)
            else:
                d = _analizar_instaloader(url)
            if d:
                _cache_guardar(url, d)
                return d
            errores.append(f"{motor}: sin resultado")
        except Exception as e:
            errores.append(f"{motor}: {type(e).__name__}")

    m = RE_SHORTCODE.search(url)
    code = m.group(1) if m else "?"

    raise RuntimeError(
        f"No pude leer el post «{code}» de Instagram.\n\n"
        "Instagram no entregó sus datos al motor externo. Puede requerir sesión o limitar las solicitudes.\n\n"
        "Si puedes verlo con tu cuenta, pulsa «Abrir en Chrome». Conecta la extensión de APOLO en ese Chrome y vuelve a «Leer publicación».\n\n"
        f"Detalle técnico: {' | '.join(errores)}"
    )


_sesion_cache = {}


def _tiene_sesion_util() -> bool:
    """Comprueba (una vez por ejecucion) si la sesion guardada sirve."""
    if "ok" in _sesion_cache:
        return _sesion_cache["ok"]
    ok = False
    try:
        if SESION.exists():
            j = json.loads(SESION.read_text(encoding="utf-8"))
            ok = bool(j.get("authorization"))
    except Exception:
        ok = False
    _sesion_cache["ok"] = ok
    return ok


def _analizar_instaloader(url):
    """Respaldo para contenido publico cuando instagrapi falla."""
    try:
        import instaloader
        from instaloader import Post, Profile
    except ImportError:
        return None

    UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")
    L = instaloader.Instaloader(quiet=True, user_agent=UA,
                                max_connection_attempts=1, request_timeout=20)

    m = RE_SHORTCODE.search(url)
    if m:
        try:
            post = Post.from_shortcode(L.context, m.group(1))
        except Exception:
            return None
        autor = post.owner_username
        items = []
        if post.typename == "GraphSidecar":
            for i, node in enumerate(post.get_sidecar_nodes(), 1):
                items.append({"n": i, "id": post.shortcode,
                              "title": f"{autor} · slide {i}", "url": url,
                              "kind": "video" if node.is_video else "foto",
                              "duration": None,
                              "ext": "mp4" if node.is_video else "jpg"})
        else:
            items.append({"n": 1, "id": post.shortcode,
                          "title": f"{autor} · {post.shortcode}", "url": url,
                          "kind": "video" if post.is_video else "foto",
                          "duration": None,
                          "ext": "mp4" if post.is_video else "jpg"})
        return _info(url, f"@{autor} — {(post.caption or post.shortcode)[:60]}", items,
                     thumb=post.url, uploader=autor)

    m = RE_USUARIO.search(url.split("?")[0])
    if m:
        try:
            perfil = Profile.from_username(L.context, m.group(1))
            items = []
            for i, p in enumerate(perfil.get_posts(), 1):
                items.append({"n": i, "id": p.shortcode,
                              "title": f"{p.shortcode} {'[video]' if p.is_video else '[foto]'}",
                              "url": f"https://www.instagram.com/p/{p.shortcode}/",
                              "kind": "video" if p.is_video else "foto",
                              "duration": None,
                              "ext": "mp4" if p.is_video else "jpg"})
                if i >= 20:
                    break
            return _info(url, f"@{perfil.username} ({len(items)} posts)", items,
                         uploader=perfil.username)
        except Exception:
            return None
    return None


def _analizar_instagrapi(url: str) -> dict:
    cl = _cliente()

    # --- story ---
    m = RE_STORY.search(url)
    if m:
        usuario, sid_story = m.group(1), int(m.group(2))
        uid = cl.user_id_from_username(usuario)
        for item in cl.user_stories(uid):
            if item.pk == sid_story:
                kind = "video" if item.video_url else "foto"
                return _info(url, f"Story de @{usuario}", [
                    {"n": 1, "id": str(item.pk), "title": f"story {item.pk}",
                     "url": url, "kind": kind, "duration": None,
                     "ext": "mp4" if item.video_url else "jpg"}], extra=item)
        raise RuntimeError(f"No encontré ese story de @{usuario}.")

    # --- post / reel ---
    m = RE_SHORTCODE.search(url)
    if m:
        code = m.group(1)
        try:
            pk = cl.media_pk_from_code(code)
        except Exception as e:
            raise RuntimeError(f"Link de Instagram no válido ({code}): {e}")
        try:
            media = cl.media_info(pk)
        except Exception as e:
            nombre = type(e).__name__
            detalle = str(e)[:120]
            if "TooManyRedirects" in nombre or "LoginRequired" in nombre:
                raise RuntimeError(
                    "Instagram pide iniciar sesión para este post.\n\n"
                    "Tu sesión no está activa (caducó o nunca se inició).\n\n"
                    "Solución:\n"
                    "  1. Pulsa «Login IG» en SnapGrab y entra con usuario y contraseña\n"
                    "  2. O exporta cookies frescas del navegador a cookies\\cookies.txt\n"
                    "  3. O abre instagram.com en Chrome y luego pulsa «Login IG»\n\n"
                    f"Detalle: {nombre} — {detalle}"
                )
            if "MediaNotFound" in nombre or "MediaUnavailable" in nombre:
                raise RuntimeError(
                    f"El post «{code}» no existe o no es visible para tu cuenta.\n\n"
                    "Puede ser:\n"
                    "  · la cuenta que lo publicó está eliminada o desactivada\n"
                    "  · es privado y no sigues a esa cuenta\n"
                    "  · el post fue borrado\n\n"
                    f"Detalle: {nombre}"
                )
            raise RuntimeError(
                f"Instagram no me deja abrir el post «{code}».\n\n"
                f"Detalle: {nombre} — {detalle}\n\n"
                "Si los links públicos tampoco funcionan, espera unos minutos\n"
                "(límite temporal de Instagram) y reintenta."
            )
        autor = media.user.username
        kind = "video" if media.video_url else "foto"
        items = []
        recursos = getattr(media, "resources", None) or []
        if recursos:
            for i, r in enumerate(recursos, 1):
                es_video = bool(getattr(r, "video_url", None))
                items.append({"n": i, "id": str(media.pk),
                              "title": f"{autor} · slide {i}",
                              "url": url, "kind": "video" if es_video else "foto",
                              "duration": None, "ext": "mp4" if es_video else "jpg"})
        else:
            items.append({"n": 1, "id": str(media.pk),
                          "title": f"{autor} · {code}", "url": url, "kind": kind,
                          "duration": getattr(media, "video_duration", None),
                          "ext": "mp4" if kind == "video" else "jpg"})

        caption = (getattr(media, "caption_text", "") or "").split("\n")[0][:70]
        return _info(url, f"@{autor} — {caption or code}", items,
                     thumb=getattr(media, "thumbnail_url", None),
                     extra=media, uploader=autor)

    # --- perfil ---
    m = RE_USUARIO.search(url.split("?")[0])
    if m:
        usuario = m.group(1)
        try:
            uid = cl.user_id_from_username(usuario)
            medios = cl.user_medias(uid, amount=20)
        except Exception as e:
            raise RuntimeError(f"No pude leer el perfil @{usuario}: {e}")
        items = []
        for i, med in enumerate(medios, 1):
            es_video = bool(med.video_url)
            items.append({"n": i, "id": str(med.pk),
                          "title": f"{med.code} {'[video]' if es_video else '[foto]'}",
                          "url": f"https://www.instagram.com/p/{med.code}/",
                          "kind": "video" if es_video else "foto",
                          "duration": None, "ext": "mp4" if es_video else "jpg"})
        return _info(url, f"@{usuario} ({len(items)} posts recientes)", items,
                     uploader=usuario)

    raise RuntimeError("No reconozco ese link de Instagram.")


def _info(url, titulo, items, thumb=None, extra=None, uploader=None) -> dict:
    return {
        "url": url,
        "platform": "instagram",
        "title": titulo,
        "kind": "playlist" if len(items) > 1 else "video",
        "count": len(items),
        "thumbnail": str(thumb) if thumb else None,
        "uploader": uploader,
        "items": items,
        "_media": extra,
    }


# --------------------------------------------------------------------------
# Descarga
# --------------------------------------------------------------------------
def descargar(url: str, carpeta: Path, modo: str = "auto") -> list[str]:
    """Intenta con instagrapi y, si falla, con instaloader (publico)."""
    try:
        return _descargar_instagrapi(url, carpeta, modo)
    except Exception as e:
        r = _descargar_instaloader(url, carpeta, modo)
        if r:
            return r
        raise e


def _descargar_instaloader(url: str, carpeta: Path, modo: str = "auto") -> list[str]:
    """Respaldo de descarga para contenido publico."""
    try:
        import instaloader
        from instaloader import Post, Profile
    except ImportError:
        return []

    UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")
    L = instaloader.Instaloader(quiet=True, user_agent=UA,
                                max_connection_attempts=1, request_timeout=25)
    carpeta.mkdir(parents=True, exist_ok=True)
    guardados: list[str] = []

    m = RE_SHORTCODE.search(url)
    if m:
        try:
            post = Post.from_shortcode(L.context, m.group(1))
        except Exception:
            return []
        autor = post.owner_username
        fecha = post.date_utc.strftime("%Y%m%d_%H%M%S")

        if post.typename == "GraphSidecar":
            for i, node in enumerate(post.get_sidecar_nodes(), 1):
                if modo in ("video", "audio") and not node.is_video:
                    continue
                if modo == "fotos" and node.is_video:
                    continue
                ext = "mp4" if node.is_video else "jpg"
                destino = carpeta / f"{autor}_{fecha}_{i:02d}.{ext}"
                _bajar(node.video_url if node.is_video else node.display_url, destino)
                guardados.append(str(destino))
            return guardados

        if modo == "fotos":
            destino = carpeta / f"{autor}_{fecha}.jpg"
            _bajar(post.url, destino)
            return [str(destino)]

        es_video = post.is_video
        ext = "mp4" if es_video else "jpg"
        destino = carpeta / f"{autor}_{fecha}.{ext}"
        _bajar(post.video_url if es_video else post.url, destino)
        guardados.append(str(destino))

        if modo == "audio" and es_video:
            audio = carpeta / f"{autor}_{fecha}.mp3"
            if _audio(destino, audio):
                destino.unlink(missing_ok=True)
                guardados[-1] = str(audio)
        return guardados

    m = RE_USUARIO.search(url.split("?")[0])
    if m:
        try:
            perfil = Profile.from_username(L.context, m.group(1))
        except Exception:
            return []
        for i, p in enumerate(perfil.get_posts(), 1):
            if i > 20:
                break
            es_video = p.is_video
            if modo in ("video", "audio") and not es_video:
                continue
            if modo == "fotos" and es_video:
                continue
            ext = "mp4" if es_video else "jpg"
            destino = carpeta / f"{perfil.username}_{p.date_utc:%Y%m%d}_{p.shortcode}.{ext}"
            try:
                _bajar(p.video_url if es_video else p.url, destino)
                guardados.append(str(destino))
            except Exception:
                continue
    return guardados


def _descargar_instagrapi(url: str, carpeta: Path, modo: str = "auto") -> list[str]:
    cl = _cliente()
    carpeta.mkdir(parents=True, exist_ok=True)
    guardados: list[str] = []

    # story
    m = RE_STORY.search(url)
    if m:
        usuario, pk_story = m.group(1), int(m.group(2))
        uid = cl.user_id_from_username(usuario)
        for item in cl.user_stories(uid):
            if item.pk == pk_story:
                ext = "mp4" if item.video_url else "jpg"
                destino = carpeta / f"{usuario}_story_{item.pk}.{ext}"
                _bajar(item.video_url if item.video_url else item.thumbnail_url, destino)
                guardados.append(str(destino))
        return guardados

    # post / reel
    m = RE_SHORTCODE.search(url)
    if m:
        media = cl.media_info(cl.media_pk_from_code(m.group(1)))
        autor, fecha = media.user.username, media.taken_at.strftime("%Y%m%d_%H%M%S")
        recursos = getattr(media, "resources", None) or []

        if recursos:
            for i, r in enumerate(recursos, 1):
                es_video = bool(getattr(r, "video_url", None))
                if modo in ("video", "audio") and not es_video:
                    continue
                if modo == "fotos" and es_video:
                    continue
                ext = "mp4" if es_video else "jpg"
                destino = carpeta / f"{autor}_{fecha}_{i:02d}.{ext}"
                _bajar(r.video_url if es_video else r.thumbnail_url, destino)
                guardados.append(str(destino))
            return guardados

        es_video = bool(media.video_url)
        if modo == "fotos":
            destino = carpeta / f"{autor}_{fecha}.jpg"
            _bajar(media.thumbnail_url, destino)
            guardados.append(str(destino))
            return guardados

        ext = "mp4" if es_video else "jpg"
        destino = carpeta / f"{autor}_{fecha}.{ext}"
        _bajar(media.video_url if es_video else media.thumbnail_url, destino)
        guardados.append(str(destino))

        if modo == "audio" and es_video:
            audio = carpeta / f"{autor}_{fecha}.mp3"
            if _audio(destino, audio):
                destino.unlink(missing_ok=True)
                guardados[-1] = str(audio)
        return guardados

    # perfil
    m = RE_USUARIO.search(url.split("?")[0])
    if m:
        usuario = m.group(1)
        uid = cl.user_id_from_username(usuario)
        for med in cl.user_medias(uid, amount=20):
            es_video = bool(med.video_url)
            if modo in ("video", "audio") and not es_video:
                continue
            if modo == "fotos" and es_video:
                continue
            ext = "mp4" if es_video else "jpg"
            destino = carpeta / f"{usuario}_{med.taken_at:%Y%m%d}_{med.code}.{ext}"
            _bajar(med.video_url if es_video else med.thumbnail_url, destino)
            guardados.append(str(destino))

    return guardados


def _bajar(url, destino: Path):
    import urllib.request
    req = urllib.request.Request(str(url), headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=90) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f)


def _audio(video: Path, audio: Path) -> bool:
    import subprocess
    exe = shutil.which("ffmpeg")
    if not exe:
        return False
    try:
        subprocess.run([exe, "-y", "-i", str(video), "-vn", "-acodec", "libmp3lame",
                        "-q:a", "2", str(audio)], capture_output=True, timeout=180)
        return audio.exists() and audio.stat().st_size > 0
    except Exception:
        return False


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Sesion de Instagram (instagrapi)")
    ap.add_argument("--login", metavar="USUARIO", help="login usuario/contraseña")
    ap.add_argument("--sessionid", help="login con sessionid del navegador")
    ap.add_argument("--importar", nargs="?", const=str(COOKIES_TXT), metavar="COOKIES.TXT")
    ap.add_argument("--estado", action="store_true")
    ap.add_argument("--probar", metavar="URL", help="probar un link")
    args = ap.parse_args()

    if args.estado:
        u = sesion_valida()
        print(f"Sesión activa: {u}" if u else "Sin sesión (solo contenido público).")
        sys.exit(0)

    if args.importar:
        u = importar_cookies(Path(args.importar))
        print(f"Sesión importada: {u}" if u else "No se pudo importar esa cookie.")
        sys.exit(0 if u else 1)

    if args.sessionid:
        try:
            print("Sesión:", login_sessionid(args.sessionid))
        except Exception as e:
            print("Fallo:", e)
        sys.exit(0)

    if args.login:
        import getpass
        pw = getpass.getpass(f"Contraseña de {args.login}: ")
        try:
            print("Sesión:", login(args.login, pw))
        except TwoFactorRequired:
            codigo = input("Código 2FA: ").strip()
            print("Sesión:", login(args.login, pw, codigo))
        except Exception as e:
            print("Fallo:", type(e).__name__, e)
        sys.exit(0)

    if args.probar:
        try:
            d = analizar(args.probar)
            print(d["title"], "|", d["count"], "elemento(s)")
        except Exception as e:
            print("Error:", e)
        sys.exit(0)

    ap.print_help()
