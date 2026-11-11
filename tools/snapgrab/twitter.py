# -*- coding: utf-8 -*-
"""
Extractor de X/Twitter SIN cookies, via el endpoint syndication.
yt-dlp solo saca video; esto saca fotos, videos y GIFs.

Endpoint: cdn.syndication.twimg.com/tweet-result?id=<id>&lang=es&token=<token>
El token se calcula: ((id / 1e15) * pi) en base36 con 7 decimales.
"""
import json
import math
import re
import urllib.error
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")

RE_TUIT = re.compile(
    r"(?:x|twitter)\.com/(?:#!)?[^/]+/status(?:es)?/(\d+)", re.I)
RE_PERFIL = re.compile(r"(?:x|twitter)\.com/(?:#!)?([A-Za-z0-9_]+)/?$", re.I)

_DIG = "0123456789abcdefghijklmnopqrstuvwxyz"


def es_x(url: str) -> bool:
    return bool(re.search(r"(?:^|//)(?:www\.|mobile\.)?(?:x|twitter)\.com/", url, re.I))


def extraer_id(url: str) -> str | None:
    m = RE_TUIT.search(url)
    return m.group(1) if m else None


def _token(tid: str) -> str:
    """Token que exige la API de syndication (formula del JS de Twitter)."""
    val = (int(tid) / 1e15) * math.pi
    entero = int(val)
    frac = val - entero
    out = ""
    while entero > 0:
        entero, r = divmod(entero, 36)
        out = _DIG[r] + out
    out = out or "0"
    res = ""
    for _ in range(7):
        frac *= 36
        d = int(frac)
        res += _DIG[d]
        frac -= d
    return f"{out}.{res}"


def info_tuit(tid: str) -> dict:
    url = (f"https://cdn.syndication.twimg.com/tweet-result?"
           f"id={tid}&lang=es&token={_token(tid)}")
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Referer": "https://platform.twitter.com/",
        "Origin": "https://platform.twitter.com",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


# --------------------------------------------------------------------------
# Analisis
# --------------------------------------------------------------------------
def analizar(url: str) -> dict:
    tid = extraer_id(url)
    if not tid:
        m = RE_PERFIL.search(url)
        if m and m.group(1).lower() not in ("i", "home", "search", "explore"):
            raise RuntimeError(
                f"Los perfiles de X no se pueden descargar enteros.\n\n"
                f"Pega el link de un tuit concreto:\n"
                f"  x.com/{m.group(1)}/status/1234567890")
        raise RuntimeError(
            "No reconozco ese link de X/Twitter.\n\n"
            "Formato válido:\n"
            "  https://x.com/usuario/status/1234567890\n"
            "  https://twitter.com/usuario/status/1234567890")

    try:
        datos = info_tuit(tid)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise RuntimeError(
                f"El tuit {tid} no existe o no se puede mostrar.\n\n"
                "Puede ser: borrado, cuenta suspendida, privada,\n"
                "o un link mal copiado.")
        raise RuntimeError(f"X respondió con error {e.code}.")

    if not datos:
        raise RuntimeError(
            "X no devolvió datos de ese tuit.\n\n"
            "Suele pasar con tuits de cuentas protegidas o sensibles.")

    if datos.get("__typename") in ("TweetTombstone", "TweetUnavailable"):
        motivo = str(datos.get("tombstone") or datos)[:90]
        raise RuntimeError(f"Ese tuit no está disponible.\n\n{motivo}")

    usuario = (datos.get("user") or {}).get("screen_name") or "x"
    texto = (datos.get("text") or "").replace("\n", " ").strip()
    media = datos.get("mediaDetails") or []

    items = []
    n = 0
    for m in media:
        tipo = m.get("type")
        if tipo == "photo":
            n += 1
            items.append({
                "n": n, "id": tid,
                "title": f"{usuario} · foto {n}",
                "url": _original(m.get("media_url_https", "")),
                "kind": "foto", "duration": None, "ext": "jpg",
            })
        elif tipo in ("video", "animated_gif"):
            mejor = _mejor_video(m)
            if mejor:
                n += 1
                items.append({
                    "n": n, "id": tid,
                    "title": f"{usuario} · {'gif' if tipo == 'animated_gif' else 'video'} {n}",
                    "url": mejor, "kind": "video", "duration": None, "ext": "mp4",
                })

    # tuits con video vienen a veces solo en 'video' (top level)
    if not items:
        vid = datos.get("video") or {}
        mejor = _mejor_variante(vid.get("variants") or [])
        if mejor:
            items.append({"n": 1, "id": tid, "title": f"{usuario} · video",
                          "url": mejor, "kind": "video", "duration": None, "ext": "mp4"})

    if not items:
        raise RuntimeError(
            f"El tuit de @{usuario} no tiene foto ni video.\n\n"
            f"Texto: {texto[:120] or '(sin texto)'}")

    return {
        "url": url,
        "platform": "x",
        "title": f"@{usuario} — {texto[:70] or tid}",
        "kind": "playlist" if len(items) > 1 else items[0]["kind"],
        "count": len(items),
        "thumbnail": (str(media[0].get("media_url_https")) if media else None),
        "uploader": usuario,
        "items": items,
    }


def _original(u) -> str:
    """Version de maxima calidad de una imagen de X."""
    s = str(u or "")
    if not s:
        return s
    s = s.split("?")[0]
    return s + "?format=jpg&name=4096x4096"


def _mejor_video(m: dict) -> str | None:
    vi = m.get("video_info") or {}
    return _mejor_variante(vi.get("variants") or [])


def _mejor_variante(variantes: list) -> str | None:
    mp4 = [v for v in variantes if v.get("content_type") == "video/mp4"]
    if not mp4:
        return None
    mp4.sort(key=lambda v: v.get("bitrate", 0), reverse=True)
    return mp4[0].get("url")


# --------------------------------------------------------------------------
# Descarga
# --------------------------------------------------------------------------
def descargar(url: str, carpeta, modo: str = "auto") -> list:
    from pathlib import Path
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)

    datos = analizar(url)
    usuario = datos["uploader"]
    guardados = []

    for it in datos["items"]:
        if modo in ("video", "audio") and it["kind"] != "video":
            continue
        if modo == "fotos" and it["kind"] != "foto":
            continue
        destino = carpeta / f"{usuario}_{it['id']}_{it['n']:02d}.{it['ext']}"
        if destino.exists() and destino.stat().st_size > 0:
            guardados.append(str(destino))
            continue
        _bajar(it["url"], destino)
        guardados.append(str(destino))

        if modo == "audio" and it["kind"] == "video":
            audio = destino.with_suffix(".mp3")
            if _audio(destino, audio):
                destino.unlink(missing_ok=True)
                guardados[-1] = str(audio)

    return guardados


def _bajar(url: str, destino) -> None:
    req = urllib.request.Request(str(url), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r, open(destino, "wb") as f:
        while True:
            trozo = r.read(65536)
            if not trozo:
                break
            f.write(trozo)


def _audio(video, audio) -> bool:
    import shutil
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


if __name__ == "__main__":
    import sys
    u = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        d = analizar(u)
        print(d["title"])
        print(f"{d['count']} elemento(s)")
        for it in d["items"]:
            print(f"  {it['n']}. [{it['kind']}] {it['url'][:95]}")
    except Exception as e:
        print("Error:", e)
