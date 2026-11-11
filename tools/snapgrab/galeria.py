# -*- coding: utf-8 -*-
"""Galería de fotos públicas: HTML, miniaturas limitadas y selección explícita."""
import base64
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.request import Request, urlopen
from fotos import TIPOS, UA, foto_directa

MAX_FOTOS = 24


class FotosHTML(HTMLParser):
    def __init__(self, url):
        super().__init__(convert_charrefs=True)
        self.base = url
        self.fotos = []
        self.ignorados = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'base' and a.get('href'):
            self.base = urljoin(self.base, a['href'])
        src = None
        if tag == 'img':
            if any(str(a.get(k) or '').isdigit() and int(a[k]) < 24 for k in ('width', 'height')):
                return
            src = a.get('data-src') or a.get('data-original') or a.get('src')
            conjunto = a.get('data-srcset') or a.get('srcset')
            if conjunto and not conjunto.lstrip().startswith('data:'):
                # Dentro de un srcset, preferir el candidato con mayor descriptor.
                opciones = []
                for parte in conjunto.split(','):
                    trozos = parte.strip().split()
                    if not trozos:
                        continue
                    try:
                        peso = float(trozos[-1][:-1]) if len(trozos) > 1 else 1
                    except ValueError:
                        peso = 1
                    opciones.append((peso, trozos[0]))
                if opciones:
                    src = max(opciones)[1]
        elif tag == 'meta' and (a.get('property') or a.get('name', '')).lower() in ('og:image', 'twitter:image', 'og:image:secure_url'):
            src = a.get('content')
        if src:
            try:
                url = urldefrag(urljoin(self.base, src))[0]
                u = urlparse(url)
            except ValueError:
                return
            if len(url) <= 8192 and u.scheme in ('http', 'https') and not u.username and not u.password and not any(f['url'] == url for f in self.fotos):
                if len(self.fotos) < MAX_FOTOS:
                    self.fotos.append({'url': url, 'titulo': (a.get('alt') or a.get('title') or f'Foto {len(self.fotos) + 1}')[:120]})
                else:
                    self.ignorados += 1


def miniatura(foto, pagina):
    resultado = {**foto, 'miniatura': ''}
    try:
        with urlopen(Request(foto['url'], headers={'User-Agent': UA, 'Referer': pagina}), timeout=6) as r:
            tipo = r.headers.get_content_type()
            if tipo not in TIPOS or tipo == 'image/svg+xml':
                return resultado
            datos = r.read(2 * 1024 * 1024 + 1)
            if len(datos) > 2 * 1024 * 1024:
                return resultado
        try:
            from PIL import Image
            with Image.open(BytesIO(datos)) as imagen:
                imagen.thumbnail((200, 140))
                salida = BytesIO()
                imagen.convert('RGB').save(salida, format='JPEG', quality=65)
                datos = salida.getvalue()
                tipo = 'image/jpeg'
        except ImportError:
            pass
        if len(datos) <= 24000:
            resultado['miniatura'] = 'data:' + tipo + ';base64,' + base64.b64encode(datos).decode('ascii')
    except Exception:
        # Una miniatura bloqueada no impide seleccionar ni descargar su original.
        pass
    return resultado


def analizar(url, seleccionada=None):
    with urlopen(Request(url, headers={'User-Agent': UA}), timeout=15) as r:
        tipo = r.headers.get_content_type()
        pagina = r.geturl()
        if tipo in TIPOS:
            fotos = [{'url': pagina, 'titulo': 'Esta foto'}]
            ignorados = 0
        elif tipo in ('text/html', 'application/xhtml+xml'):
            datos = r.read(3 * 1024 * 1024 + 1)
            if len(datos) > 3 * 1024 * 1024:
                raise ValueError('La página es demasiado grande para esta galería')
            lector = FotosHTML(pagina)
            lector.feed(datos.decode(r.headers.get_content_charset() or 'utf-8', errors='replace'))
            fotos, ignorados = lector.fotos, lector.ignorados
        else:
            fotos, ignorados = [], 0
    if seleccionada:
        u = urlparse(seleccionada)
        if u.scheme in ('http', 'https') and not u.username and not u.password:
            fotos = [f for f in fotos if f['url'] != seleccionada]
            fotos.insert(0, {'url': seleccionada, 'titulo': 'Foto señalada'})
            fotos = fotos[:MAX_FOTOS]
    with ThreadPoolExecutor(max_workers=4) as grupo:
        resultado = list(grupo.map(lambda f: miniatura(f, pagina), fotos))
    return {'evento': 'resultado', 'fotos': resultado, 'limitada': ignorados > 0,
            'aviso': 'Se muestran hasta 24 fotos de la página.' if ignorados else ''}


def guardar(pedido, emitir):
    urls = pedido.get('imagenes', [])
    if not urls or len(urls) > MAX_FOTOS:
        raise ValueError('Selecciona entre una y 24 fotos')
    guardados, fallos = [], 0
    for i, url in enumerate(urls):
        try:
            u = urlparse(url)
            if u.scheme not in ('http', 'https') or u.username or u.password:
                raise ValueError('Dirección de foto no válida')
            salida = []
            ok = foto_directa({'url': url, 'accion': 'descargar', 'modo': 'fotos',
                               'carpeta': str(Path(pedido['carpeta']) / f'foto-{i + 1:02d}'), 'referer': pedido['url']}, salida.append)
            if not ok:
                raise ValueError('El servidor no devuelve una foto')
            guardados.extend(salida[-1]['archivos'])
        except Exception:
            fallos += 1
        emitir({'evento': 'progreso', 'porcentaje': round((i + 1) * 100 / len(urls)), 'texto': f'Foto {i + 1} de {len(urls)}'})
    if not guardados:
        raise ValueError('No se pudo descargar ninguna de las fotos seleccionadas. Puedes guardar un recorte visible.')
    emitir({'evento': 'resultado', 'archivos': guardados, 'fallos': fallos,
            'advertencia': f'{fallos} foto(s) no se pudieron guardar' if fallos else ''})
