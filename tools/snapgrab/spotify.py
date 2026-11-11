# -*- coding: utf-8 -*-
"""
Motor de Spotify para SnapGrab.

Como funciona spotdown.org (analizado, 2026-11):
  1. Pega la URL -> GET /apinew/song-details?url=<spotify>
  2. Cabecera X-Session-Token -> POST /apinew/download {url} -> {downloadUrl}
  3. Descarga el mp3 de ese downloadUrl
Pero su API exige un Cloudflare Turnstile real y devuelve 401/400 sin el.
(issue-nonce -> token -> X-Session-Token). No se puede usar sin navegador.

Alternativa que SI funciona desde aqui, sin cuenta ni tokens:
  metadata : open.spotify.com/oembed                     -> titulo/album/artista
  album/lista: pagina embebida /embed/{album,playlist}   -> lista de pistas
  audio    : busca la cancion en YouTube y saca el mp3   -> yt-dlp + ffmpeg
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")

RE_SPOTIFY = re.compile(
    r"open\.spotify\.com/(?:intl-[a-z\-]+/)?(track|album|playlist|artist)/([A-Za-z0-9]+)")
RE_SPOTIFY_URI = re.compile(r"^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$")


def es_spotify(url: str) -> bool:
    if RE_SPOTIFY_URI.fullmatch(url.strip()):
        return True
    try:
        u = urllib.parse.urlsplit(url)
        return u.scheme in ('http', 'https') and u.hostname == 'open.spotify.com' and not u.username and not u.password
    except ValueError:
        return False


def parsear(url: str) -> tuple[str, str] | None:
    if not es_spotify(url):
        return None
    m = RE_SPOTIFY_URI.fullmatch(url.strip())
    if m:
        return m.group(1), m.group(2)
    m = re.fullmatch(r'/(?:intl-[a-z\-]+/)?(?:embed/)?(track|album|playlist|artist)/([A-Za-z0-9]+)/?', urllib.parse.urlsplit(url).path)
    if m:
        return m.group(1), m.group(2)
    return None


# --------------------------------------------------------------------------
# Metadatos
# --------------------------------------------------------------------------
def oembed(tipo: str, sid: str) -> dict:
    """Titulo, artista y miniatura sin cuenta ni token."""
    u = f"https://open.spotify.com/{tipo}/{sid}"
    api = "https://open.spotify.com/oembed?url=" + urllib.parse.quote(u, safe="")
    req = urllib.request.Request(api, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _limpiar_titulo(t: str) -> str:
    """Quita sufijos tipo ' - song and lyrics by X | Spotify'."""
    t = re.sub(r"\s*[-–]\s*(?:song|album|playlist|artist).*$", "", t, flags=re.I)
    t = re.sub(r"\s*\|.*$", "", t)
    return t.strip()


def entidad_embed(tipo: str, sid: str):
    url = f"https://open.spotify.com/embed/{tipo}/{sid}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        return {}, html
    try:
        j = json.loads(m.group(1))
        datos = (((j.get('props') or {}).get('pageProps') or {}).get('state') or {}).get('data') or {}
        return datos.get('entity') or {}, html
    except (ValueError, TypeError):
        return {}, html


def pistas_de(album_o_lista: str, sid: str) -> list[dict]:
    """
    Lista las pistas de un album o playlist leyendo el endpoint embed.
    Devuelve [{'titulo','artista','spotify_url'}]
    """
    entidad, html = entidad_embed(album_o_lista, sid)
    pistas = []

    if album_o_lista == "album":
        for t in (entidad.get("trackList") or []):
            pistas.append({
                "titulo": t.get("title"),
                "artista": t.get("subtitle") or entidad.get("subtitle"),
                "spotify_url": (t.get("uri") or "").replace("spotify:track:", "https://open.spotify.com/track/"),
            })
    else:  # playlist
        lista = entidad.get("trackList") or []
        for t in lista:
            pistas.append({
                "titulo": t.get("title"),
                "artista": t.get("subtitle"),
                "spotify_url": (t.get("uri") or "").replace("spotify:track:", "https://open.spotify.com/track/"),
            })

    if not pistas:
        return _pistas_por_regex(html)
    return [p for p in pistas if p.get("titulo")]


def _pistas_por_regex(html: str) -> list[dict]:
    """Respaldo: saca 'titulo' y 'subtitle' de los JSON embebidos."""
    pistas = []
    for m in re.finditer(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"subtitle"\s*:\s*"((?:[^"\\]|\\.)*)"',
                         html):
        titulo = json.loads('"' + m.group(1) + '"')
        artista = json.loads('"' + m.group(2) + '"')
        if titulo and not titulo.startswith("http"):
            pistas.append({"titulo": titulo, "artista": artista, "spotify_url": None})
    # quitar duplicados conservando orden
    vistos, limpio = set(), []
    for p in pistas:
        k = (p["titulo"], p["artista"])
        if k not in vistos:
            vistos.add(k)
            limpio.append(p)
    return limpio


# --------------------------------------------------------------------------
# API publica del modulo
# --------------------------------------------------------------------------
def analizar(url: str) -> dict:
    p = parsear(url)
    if not p:
        raise RuntimeError(
            "No reconozco ese link de Spotify.\n\n"
            "Formatos válidos:\n"
            "  open.spotify.com/track/ID\n"
            "  open.spotify.com/album/ID\n"
            "  open.spotify.com/playlist/ID")

    tipo, sid = p
    items = []

    if tipo == "track":
        info = oembed(tipo, sid)
        titulo = _limpiar_titulo(info.get("title") or sid)
        artista = None
        try:
            entidad, _ = entidad_embed(tipo, sid)
            artista = ', '.join(a['name'] for a in entidad.get('artists', []) if a.get('name')) or None
        except Exception:
            pass
        items.append({
            "n": 1, "id": sid, "title": titulo + (' — ' + artista if artista else ''),
            "url": f"https://open.spotify.com/track/{sid}",
            "kind": "audio", "duration": None, "ext": "mp3",
        })
        return {
            "url": url, "platform": "spotify",
            "title": titulo,
            "kind": "audio", "count": 1,
            "thumbnail": info.get("thumbnail_url"),
            "uploader": artista or info.get("author_name"),
            "items": items,
        }

    if tipo == "album":
        info = oembed(tipo, sid)
        nombre = _limpiar_titulo(info.get("title") or sid)
        pistas = pistas_de("album", sid)
        for i, t in enumerate(pistas, 1):
            items.append({
                "n": i, "id": sid,
                "title": f"{t['titulo']} — {t.get('artista') or ''}".strip(" —"),
                "url": t.get("spotify_url") or url,
                "kind": "audio", "duration": None, "ext": "mp3",
            })
        return {
            "url": url, "platform": "spotify",
            "title": f"Álbum: {nombre} ({len(items)} pistas)",
            "kind": "playlist", "count": len(items),
            "thumbnail": info.get("thumbnail_url"),
            "uploader": info.get("author_name"),
            "items": items,
        }

    if tipo == "playlist":
        info = oembed(tipo, sid)
        nombre = _limpiar_titulo(info.get("title") or sid)
        pistas = pistas_de("playlist", sid)
        for i, t in enumerate(pistas, 1):
            items.append({
                "n": i, "id": sid,
                "title": f"{t['titulo']} — {t.get('artista') or ''}".strip(" —"),
                "url": t.get("spotify_url") or url,
                "kind": "audio", "duration": None, "ext": "mp3",
            })
        return {
            "url": url, "platform": "spotify",
            "title": f"Lista: {nombre} ({len(items)} pistas)",
            "kind": "playlist", "count": len(items),
            "thumbnail": info.get("thumbnail_url"),
            "uploader": info.get("author_name"),
            "items": items,
        }

    raise RuntimeError(
        "Los perfiles de artista de Spotify no se pueden listar aqui.\n\n"
        "Abre una canción, un álbum o una lista y usa el menú de APOLO sobre esa página.")


# --------------------------------------------------------------------------
# Descarga (audio via YouTube)
# --------------------------------------------------------------------------
def descargar(url: str, carpeta, modo: str = "auto", limite: int = 0, datos=None, progreso=None, informe=None) -> list:
    """
    Descarga la cancion (o pistas del album/lista) como mp3.
    limite=0 -> todas; limite=N -> solo las N primeras.
    """
    from pathlib import Path
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)

    if modo not in ('auto', 'audio', 'todo'):
        raise ValueError('Spotify ofrece audio: elige Solo audio o Todas las pistas')
    datos = datos or analizar(url)
    if datos["count"] == 0:
        raise RuntimeError("No encontré pistas en ese link de Spotify.")

    pistas = datos["items"]
    if limite:
        pistas = pistas[:limite]

    guardados = []
    if informe is not None:
        informe.update(solicitadas=len(pistas), fallos=0, limitadas=max(0, len(datos['items']) - len(pistas)))
    for i, it in enumerate(pistas):
        consulta = it["title"]
        if progreso:
            progreso({'evento': 'progreso', 'porcentaje': round(i * 100 / len(pistas)), 'texto': f'Buscando en YouTube: pista {i + 1} de {len(pistas)}'})
        if not consulta:
            if informe is not None:
                informe['fallos'] += 1
            continue
        try:
            destino = carpeta / f'pista-{i + 1:02d}'
            destino.mkdir(parents=True, exist_ok=True)
            f = _mp3_de_youtube(consulta, destino)
            if f:
                guardados.append(f)
            elif informe is not None:
                informe['fallos'] += 1
        except Exception as e:
            if informe is not None:
                informe['fallos'] += 1
            print(f"  [!] {consulta[:40]}: {e}")
        if progreso:
            progreso({'evento': 'progreso', 'porcentaje': round((i + 1) * 100 / len(pistas)), 'texto': f'Procesadas {i + 1} de {len(pistas)} pistas'})
    return guardados


def _mp3_de_youtube(consulta: str, carpeta) -> str | None:
    """Busca la cancion en YouTube y la guarda como mp3."""
    import yt_dlp

    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "default_search": "ytsearch1",
        "format": "bestaudio/best",
        "outtmpl": str(carpeta / "%(title).120s.%(ext)s"),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "0",
        }],
        "http_headers": {"User-Agent": UA},
        "socket_timeout": 30,
        "retries": 3,
        "windowsfilenames": True,
        "trim_file_name": 120,
        "noplaylist": True,
    }
    try:
        import grab
        if grab.FFMPEG:
            opts["ffmpeg_location"] = str(__import__("pathlib").Path(grab.FFMPEG).parent)
    except Exception:
        pass

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{consulta}", download=True)

    if not info:
        return None
    if info.get("_type") == "playlist":
        entradas = [e for e in (info.get("entries") or []) if e]
        if not entradas:
            return None
        info = entradas[0]
    from pathlib import Path
    req = info.get("requested_downloads") or []
    archivo = (req[0].get('filepath') if req else None) or info.get('_filename')
    if not archivo:
        return None
    mp3 = Path(archivo).with_suffix('.mp3')
    return str(mp3.resolve()) if mp3.is_file() and mp3.stat().st_size else None


if __name__ == "__main__":
    import sys
    u = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        d = analizar(u)
        print(d["title"])
        print(f"{d['count']} elemento(s)")
        for it in d["items"][:15]:
            print(f"  {it['n']}. {it['title']}")
    except Exception as e:
        print("Error:", e)
