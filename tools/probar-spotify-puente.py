# -*- coding: utf-8 -*-
"""Solo pruebas: metadatos ficticios y búsquedas redirigidas a un vídeo propio local."""
import io
import json
import os
from pathlib import Path
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).parent / 'snapgrab'))
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import puente

pedido = json.loads(sys.stdin.readline())
try:
    if urllib.parse.urlsplit(pedido.get('url', '')).hostname in ('www.instagram.com', 'instagram.com') and pedido.get('accion') in ('analizar', 'descargar'):
        raise RuntimeError('Instagram no entrega datos sin sesión. Usa Abrir Instagram y Leer publicación.')
    if urllib.parse.urlsplit(pedido.get('url', '')).hostname == 'open.spotify.com':
        import spotify
        import yt_dlp
        local = os.environ['APOLO_SNAPGRAB_URL']
        if urllib.parse.urlsplit(local).hostname != '127.0.0.1':
            raise ValueError('La prueba exige un vídeo local ficticio')
        abrir_real = urllib.request.urlopen

        def abrir(req, *args, **kw):
            u = urllib.parse.urlsplit(req.full_url if hasattr(req, 'full_url') else req)
            if u.hostname != 'open.spotify.com':
                return abrir_real(req, *args, **kw)
            if u.path == '/oembed':
                return io.BytesIO(json.dumps({'title': 'Música de prueba', 'thumbnail_url': None}).encode())
            if '/track/' in u.path:
                entidad = {'title': 'Música de prueba', 'artists': [{'name': 'Artista de prueba'}]}
            else:
                pistas = [{'title': 'Primera canción', 'subtitle': 'Artista de prueba', 'uri': 'spotify:track:Prueba1'}, {'title': 'Segunda canción', 'subtitle': 'Otro artista', 'uri': 'spotify:track:Prueba2'}]
                if '/playlist/' in u.path:
                    pistas.append({'title': 'Fallo de prueba', 'subtitle': 'Prueba', 'uri': 'spotify:track:Prueba3'})
                entidad = {'trackList': pistas}
            datos = {'props': {'pageProps': {'state': {'data': {'entity': entidad}}}}}
            return io.BytesIO(('<script id="__NEXT_DATA__" type="application/json">' + json.dumps(datos) + '</script>').encode())

        urllib.request.urlopen = abrir
        RealYDL = yt_dlp.YoutubeDL

        class BusquedaLocal:
            def __init__(self, opciones):
                self.real = RealYDL(opciones)

            def __enter__(self):
                self.real.__enter__()
                return self

            def __exit__(self, *args):
                return self.real.__exit__(*args)

            def extract_info(self, consulta, download):
                assert consulta.startswith('ytsearch1:')
                if 'Fallo de prueba' in consulta:
                    raise RuntimeError('Fallo simulado de búsqueda')
                assert 'artista' in consulta.lower(), 'La búsqueda incluye el intérprete'
                return self.real.extract_info(local, download=download)

        yt_dlp.YoutubeDL = BusquedaLocal
    puente.ejecutar(pedido)
except Exception as e:
    puente.emitir({'evento': 'error', 'error': str(e)})
    sys.exit(1)
