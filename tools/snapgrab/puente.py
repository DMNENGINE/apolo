# -*- coding: utf-8 -*-
"""Puente JSON de SnapGrab para la ventana de APOLO; sin interfaz Tkinter."""
import contextlib
import json
import os
import subprocess
import time
from pathlib import Path
import sys
SALIDA = sys.stdout


def emitir(datos):
    print(json.dumps(datos, ensure_ascii=False), file=SALIDA, flush=True)


def ejecutar(pedido):
    if pedido.get('accion') == 'convertir-audio':
        import grab
        carpeta = Path(pedido['carpeta']).resolve()
        archivos = pedido.get('archivos') or []
        if not grab.FFMPEG or not archivos:
            raise ValueError('Se necesita ffmpeg y un vídeo descargado para extraer el audio')
        guardados = []
        for archivo in archivos[:20]:
            p = Path(archivo).resolve()
            if not p.is_relative_to(carpeta) or not p.is_file() or p.suffix.lower() not in ('.mp4', '.webm', '.mkv'):
                raise ValueError('El vídeo no pertenece a esta descarga')
            audio = p.with_suffix('.mp3')
            r = subprocess.run([grab.FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(p), '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', str(audio)], capture_output=True, timeout=180)
            if r.returncode or not audio.is_file() or not audio.stat().st_size:
                raise ValueError('No se pudo convertir el vídeo de Instagram a MP3')
            guardados.append(str(audio))
            p.unlink()
        emitir({'evento': 'resultado', 'archivos': guardados})
        return
    if pedido.get('accion') in ('galeria', 'guardar-fotos'):
        from galeria import analizar, guardar
        if pedido['accion'] == 'galeria':
            emitir(analizar(pedido['url'], pedido.get('seleccionada')))
        else:
            guardar(pedido, emitir)
        return
    from fotos import foto_directa
    if pedido.get('accion') in ('analizar', 'descargar') and str(pedido.get('url', '')).startswith(('http://', 'https://')):
        if foto_directa(pedido, emitir):
            return
    # La salida del motor queda fuera del protocolo JSON.
    with contextlib.redirect_stdout(sys.stderr):
        import grab
    accion = pedido.get('accion')
    modo = pedido.get('modo')
    url = pedido['url']
    if accion not in ('analizar', 'descargar') or not url.startswith(('http://', 'https://')):
        raise ValueError('Petición de SnapGrab no válida')
    if accion == 'descargar' and modo not in ('video', 'fotos', 'todo', 'audio'):
        raise ValueError('Modo de descarga no válido')
    if accion == 'descargar' and modo == 'audio' and not grab.FFMPEG:
        raise ValueError('Se necesita ffmpeg para guardar audio MP3')
    if grab.FFMPEG:
        # Los extractores propios de Instagram/X también necesitan localizarlo.
        os.environ['PATH'] = str(Path(grab.FFMPEG).parent) + os.pathsep + os.environ.get('PATH', '')

    ultimo = [0.0]
    def progreso(d):
        if d.get('status') == 'downloading':
            ahora = time.monotonic()
            if ahora - ultimo[0] < 0.3:
                return
            ultimo[0] = ahora
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            emitir({'evento': 'progreso', 'porcentaje': min(100, int(d.get('downloaded_bytes', 0) * 100 / total)) if total else None})
        elif d.get('status') == 'finished':
            emitir({'evento': 'progreso', 'texto': 'Preparando el archivo…'})

    original = grab.base_opts

    def opciones(cookies=None):
        o = original(cookies)
        o.update({'progress_hooks': [progreso], 'noplaylist': True, 'playlistend': 20})
        return o

    grab.base_opts = opciones
    with contextlib.redirect_stdout(sys.stderr):
        datos = grab.analizar_url(url)
    if accion == 'analizar':
        # No trasladar las URL firmadas ni los datos internos del extractor a la UI.
        tipos = [i.get('kind') for i in datos.get('items', [])]
        spotify = datos.get('platform') == 'spotify'
        if spotify and not tipos:
            raise ValueError('No se encontraron pistas públicas en esta página de Spotify')
        emitir({'evento': 'resultado', 'titulo': datos.get('title') or 'Contenido',
                'plataforma': datos.get('platform') or grab.detect_platform(url),
                'cantidad': datos.get('count', len(tipos)),
                'video': 'video' in tipos, 'fotos': 'foto' in tipos,
                'audio': 'audio' in tipos or 'video' in tipos,
                'origenAudio': 'YouTube' if spotify else None,
                'avisoAudio': 'Busca una coincidencia en YouTube y la convierte a MP3; puede ser otra versión de la canción.' if spotify else '',
                'pistas': [str(i.get('title') or 'Pista')[:180] for i in datos['items'][:20]] if spotify else [],
                'limitePistas': 20 if spotify else None})
        return
    carpeta = Path(pedido['carpeta'])
    carpeta.mkdir(parents=True, exist_ok=True)
    plataforma = grab.detect_platform(url)
    informe_spotify = {}
    with contextlib.redirect_stdout(sys.stderr):
        if plataforma == 'spotify':
            if not grab.FFMPEG:
                raise ValueError('Se necesita ffmpeg para convertir las canciones a MP3')
            import spotify
            archivos = spotify.descargar(url, carpeta, modo, limite=20, datos=datos, progreso=emitir, informe=informe_spotify)
        elif plataforma in ('instagram', 'x'):
            modulo = __import__('instagram' if plataforma == 'instagram' else 'twitter')
            archivos = modulo.descargar(url, carpeta, modo)
        elif modo in ('fotos', 'todo') and datos.get('kind') == 'playlist':
            # El motor original pasaba todo=True incluso en "solo fotos".
            archivos = grab.download_fotos(url, carpeta, solo_fotos=modo == 'fotos', todo=modo == 'todo')
        elif modo == 'fotos':
            raise ValueError('Esta publicación no ofrece fotos descargables')
        elif datos.get('kind') == 'playlist':
            archivos = []
            for item in datos.get('items', [])[:20]:
                if item.get('kind') == 'video':
                    archivo = grab.download_video(item['url'], carpeta, want_audio=modo == 'audio', short=True)
                    if archivo:
                        archivos.append(archivo)
        else:
            archivo = grab.download_video(url, carpeta, want_audio=modo == 'audio', short=True)
            archivos = [archivo] if archivo else []
    # yt-dlp puede devolver la ruta anterior al remux: localizar el resultado final.
    guardados = []
    for archivo in archivos:
        p = Path(archivo)
        if not p.exists():
            p = next((p.with_suffix(ext) for ext in ('.mp4', '.mp3', '.mkv', '.webm') if p.with_suffix(ext).is_file()), p)
        if p.is_file() and p.resolve().is_relative_to(carpeta.resolve()):
            if modo == 'audio' and p.suffix.lower() != '.mp3':
                if p.suffix.lower() not in ('.mp4', '.mkv', '.webm', '.mov', '.m4a', '.aac', '.ogg', '.opus'):
                    continue
                audio = p.with_suffix('.mp3')
                conversion = subprocess.run([grab.FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(p), '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', str(audio)], capture_output=True, timeout=180)
                if conversion.returncode or not audio.is_file() or not audio.stat().st_size:
                    raise ValueError('El extractor no pudo convertir el audio a MP3')
                p.unlink()
                p = audio
            guardados.append(str(p.resolve()))
    if not guardados:
        raise ValueError('SnapGrab no guardó ningún archivo. La publicación puede requerir sesión o no ofrecer ese formato.')
    avisos = []
    if informe_spotify.get('fallos'):
        avisos.append(f"{informe_spotify['fallos']} pista(s) no se pudieron guardar")
    if informe_spotify.get('limitadas'):
        avisos.append('Se procesaron las primeras 20 pistas accesibles')
    emitir({'evento': 'resultado', 'archivos': guardados, 'advertencia': ' · '.join(avisos),
            'fallos': informe_spotify.get('fallos', 0), 'origenAudio': 'YouTube' if plataforma == 'spotify' else None})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    try:
        ejecutar(json.loads(sys.stdin.readline()))
    except Exception as e:
        emitir({'evento': 'error', 'error': str(e)[:500]})
        sys.exit(1)
