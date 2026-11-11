# -*- coding: utf-8 -*-
"""Fotos directas por HTTP, sin exigir que yt-dlp reconozca una publicación."""
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

TIPOS = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/bmp': '.bmp', 'image/tiff': '.tiff', 'image/svg+xml': '.svg'}
UA = 'Mozilla/5.0 SnapGrab/APOLO'


def foto_directa(pedido, emitir):
    url = pedido['url']
    headers = {'User-Agent': UA}
    if pedido.get('referer'):
        headers['Referer'] = pedido['referer']
    host = (urlparse(url).hostname or '').lower()
    # Las páginas de estas plataformas deben ir a sus extractores específicos.
    if any(host == h or host.endswith('.' + h) for h in ('youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'facebook.com', 'x.com', 'twitter.com', 'vimeo.com')):
        return False
    try:
        with urlopen(Request(url, method='HEAD', headers=headers), timeout=5) as r:
            tipo = r.headers.get_content_type()
    except Exception:
        tipo = None
    if tipo not in TIPOS:
        # Algunos servidores no permiten HEAD aunque sí dejan descargar la foto.
        if Path(urlparse(url).path).suffix.lower() not in TIPOS.values():
            return False
        with urlopen(Request(url, headers=headers), timeout=15) as r:
            tipo = r.headers.get_content_type()
        if tipo not in TIPOS:
            return False
    if pedido['accion'] == 'analizar':
        emitir({'evento': 'resultado', 'titulo': 'Imagen de esta página', 'plataforma': host,
                'cantidad': 1, 'video': False, 'fotos': True})
        return True
    if pedido.get('modo') not in ('fotos', 'todo'):
        raise ValueError('Este contenido es una foto; elige Fotos o Todo')
    carpeta = Path(pedido['carpeta'])
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / ('imagen' + TIPOS[tipo])
    try:
        with urlopen(Request(url, headers=headers), timeout=30) as r, destino.open('wb') as f:
            if r.headers.get_content_type() not in TIPOS:
                raise ValueError('El servidor ya no está devolviendo una imagen')
            n = 0
            while True:
                trozo = r.read(262144)
                if not trozo:
                    break
                n += len(trozo)
                if n > 128 * 1024 * 1024:
                    raise ValueError('La imagen supera los 128 MB')
                f.write(trozo)
        if not destino.stat().st_size:
            raise ValueError('La imagen está vacía')
    except Exception:
        destino.unlink(missing_ok=True)
        raise
    emitir({'evento': 'resultado', 'archivos': [str(destino.resolve())]})
    return True
