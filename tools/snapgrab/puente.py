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
        emitir({'evento': 'resultado', 'titulo': datos.get('title') or 'Contenido',
                'plataforma': datos.get('platform') or grab.detect_platform(url),
                'cantidad': datos.get('count', len(tipos)),
                'video': 'video' in tipos, 'fotos': 'foto' in tipos})
        return
    carpeta = Path(pedido['carpeta'])
    carpeta.mkdir(parents=True, exist_ok=True)
    plataforma = grab.detect_platform(url)
    with contextlib.redirect_stdout(sys.stderr):
        if plataforma in ('instagram', 'x'):
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
    emitir({'evento': 'resultado', 'archivos': guardados})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    try:
        ejecutar(json.loads(sys.stdin.readline()))
    except Exception as e:
        emitir({'evento': 'error', 'error': str(e)[:500]})
        sys.exit(1)
