"""Vuelca las bases de datos de Medal (clips y capturas) a JSON, solo lectura (Medal puede estar abierto: modo ro + WAL).

Uso: python medal.py <db> [<db> ...]  →  {"filas": [...], "ajustes": {...}} por stdout
La columna metadata va en base64 (formato binario de Medal; lo decodifica core/craft/medal.js).
"""
import base64
import json
import sqlite3
import sys


def leer(ruta):
    c = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True, timeout=5)
    try:
        filas = [{
            "creado": r[0], "categoria": r[1], "video": r[2], "imagen": r[3], "miniatura": r[4],
            "meta": base64.b64encode(r[5]).decode() if isinstance(r[5], (bytes, bytearray)) else None,
            "remoto": r[6], "local": r[7], "padre": r[8], "db": ruta,
        } for r in c.execute("select created_at, category_id, video_path, image_path, thumbnail_path, metadata,"
                             " remote_content_id, local_content_id, parent_id from contents")]
        borrados = [r[0] for r in c.execute("select local_content_id from deleted_contents")]
        ajustes = {k: base64.b64encode(v).decode() if isinstance(v, (bytes, bytearray)) else v
                   for k, v in c.execute("select key, value from key_values")}
        return filas, borrados, ajustes
    finally:
        c.close()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = {"filas": [], "borrados": [], "ajustes": {}, "errores": []}
    for ruta in sys.argv[1:]:
        try:
            f, b, a = leer(ruta)
            out["filas"] += f
            out["borrados"] += b
            out["ajustes"].update(a)
        except Exception as e:  # una base rota o bloqueada no tumba las demás
            out["errores"].append(f"{ruta}: {e}")
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
