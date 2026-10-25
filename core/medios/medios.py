"""Ayudante de core/medios: buscar vídeos y sacar el enlace reproducible (YouTube y Rumble) con yt-dlp.
Uso:  python medios.py buscar youtube|rumble "<texto>"    → [{id, titulo, canal, duracion, mini, url, fecha}]
      python medios.py stream "<url>"                       → {url, titulo, canal, duracion, tipo: mp4|hls, mini}
Siempre imprime UNA línea JSON por stdout ({"error": "..."} si falla). Lo que va al reproductor de la R1 es un formato
que Android abre sin más: YouTube formato 18 (MP4 360p H.264+AAC), Rumble HLS ≤ 480p.
Rumble está detrás de Cloudflare: se entra imitando Chrome 131 de Android (curl_cffi).
"""
import html
import json
import re
import sys


def salir(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(0)


def dur_txt(s):
    try:
        s = int(s or 0)
    except (TypeError, ValueError):
        return ''
    if not s:
        return ''
    return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}' if s >= 3600 else f'{s // 60}:{s % 60:02d}'


def ydl(extra=None):
    from yt_dlp import YoutubeDL
    o = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'noplaylist': True, 'js_runtimes': {'node': {}}}
    o.update(extra or {})
    return YoutubeDL(o)


def imitar():
    from yt_dlp.networking.impersonate import ImpersonateTarget
    return ImpersonateTarget('chrome', '131', 'android', '14')


def buscar_youtube(q):
    with ydl({'extract_flat': 'in_playlist'}) as y:
        info = y.extract_info(f'ytsearch15:{q}', download=False)
    r = []
    for e in info.get('entries') or []:
        if not e or not e.get('id') or e.get('live_status') == 'is_live':
            continue
        mini = (e.get('thumbnails') or [{}])[-1].get('url') or f"https://i.ytimg.com/vi/{e['id']}/mqdefault.jpg"
        r.append({'id': e['id'], 'titulo': e.get('title') or '', 'canal': e.get('channel') or e.get('uploader') or '',
                  'duracion': dur_txt(e.get('duration')), 'mini': f"https://i.ytimg.com/vi/{e['id']}/mqdefault.jpg" if 'ytimg' not in mini else mini,
                  'url': f"https://www.youtube.com/watch?v={e['id']}", 'fecha': ''})
    return r


def buscar_rumble(q):
    from curl_cffi import requests
    from urllib.parse import quote
    h = requests.get(f'https://rumble.com/search/video?q={quote(q)}', impersonate='chrome131', timeout=20)
    if h.status_code != 200:
        raise RuntimeError(f'Rumble respondió {h.status_code}')
    r = []
    for a in re.findall(r'<article class="video-item[\s\S]*?</article>', h.text):
        href = re.search(r'href="(/v[^"?]+)', a)
        tit = re.search(r'video-item--title[^>]*>([^<]+)', a)
        if not href or not tit:
            continue
        img = re.search(r'<img[^>]*video-item--img[^>]*>', a)
        mini = re.search(r'(?:data-)?src="(https://[^"]+)"', img.group(0)) if img else None
        dur = re.search(r'video-item--duration" data-value="([^"]+)"', a)
        canal = re.search(r'class=ellipsis-1>([^<]+)', a)
        fecha = re.search(r'<time[^>]*>([^<]+)</time>', a)
        if 'video-item--live' in a:
            continue
        r.append({'id': href.group(1).strip('/').split('-')[0], 'titulo': html.unescape(tit.group(1).strip()),
                  'canal': html.unescape(canal.group(1).strip()) if canal else '', 'duracion': dur.group(1) if dur else '',
                  'mini': mini.group(1) if mini else '', 'url': 'https://rumble.com' + href.group(1), 'fecha': fecha.group(1).strip() if fecha else ''})
    return r[:20]


def stream(url):
    rumble = 'rumble.com' in url
    o = {'format': 'hls-1058/hls-680/b[height<=480][protocol^=m3u8]/b[height<=480]/b' if rumble
         else '18/b[height<=480][ext=mp4][vcodec!=none][acodec!=none]/b[vcodec!=none][acodec!=none]'}
    if rumble:
        o['impersonate'] = imitar()
    with ydl(o) as y:
        i = y.extract_info(url, download=False)
    u = i.get('url')
    if not u and i.get('requested_formats'):
        raise RuntimeError('ese vídeo no tiene un formato con audio y vídeo juntos')
    if not u:
        raise RuntimeError('no encontré un enlace reproducible')
    tipo = 'hls' if 'm3u8' in str(i.get('protocol') or '') or '.m3u8' in u else 'mp4'
    return {'url': u, 'titulo': i.get('title') or '', 'canal': i.get('channel') or i.get('uploader') or '',
            'duracion': dur_txt(i.get('duration')), 'tipo': tipo, 'mini': i.get('thumbnail') or '',
            'cabeceras': {k: v for k, v in (i.get('http_headers') or {}).items() if k.lower() in ('user-agent', 'referer')}}


def main():
    try:
        if len(sys.argv) >= 4 and sys.argv[1] == 'buscar':
            fuente, q = sys.argv[2], sys.argv[3].strip()[:200]
            salir(buscar_rumble(q) if fuente == 'rumble' else buscar_youtube(q))
        if len(sys.argv) >= 3 and sys.argv[1] == 'stream':
            url = sys.argv[2]
            if not re.match(r'^https://(www\.|m\.)?(youtube\.com|youtu\.be|rumble\.com)/', url):
                raise RuntimeError('solo enlaces de YouTube o Rumble')
            salir(stream(url))
        salir({'error': 'uso: buscar youtube|rumble "<texto>" | stream "<url>"'})
    except Exception as e:  # noqa: BLE001 — el núcleo enseña el motivo
        salir({'error': str(e).replace('\n', ' ')[:300]})


if __name__ == '__main__':
    main()
