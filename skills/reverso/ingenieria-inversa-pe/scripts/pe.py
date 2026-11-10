#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bancada de análisis estático para ingeniería inversa de PE y ensamblados .NET (Windows).

Lee archivos SIN ejecutarlos: no descarga nada, no abre procesos, no usa la red.
Cada subcomando devuelve UNA línea JSON.

  info <ruta>            PE/MZ, arquitectura, DLL/EXE, subsistema, secciones, firma Authenticode, ¿.NET?
  tipo <ruta>            "dotnet" o "nativo" + cómo seguir (ilspycmd / Ghidra / REA)
  miembros <ruta>        tipos y métodos declarados por el propio ensamblado (TypeDef/MethodDef del metadata)
  refs <ruta>            ensamblados referenciados con su versión
  cadenas <ruta> --n=8 --buscar=texto      rutas, URL, claves, APIs de interés y cadenas del heap #US
  carcasa <ruta>         huellas de protector/ofuscador + qué hacer
  importaciones <ruta>   DLLs y nombres de función importados

Uso:
  python -X utf8 pe.py info "C:\\ruta\\app.dll"
"""
import json
import re
import struct
import sys


def leer(ruta):
    with open(ruta, 'rb') as f:
        return f.read()


def rva2off(pe, rva):
    for s in pe['secciones']:
        if s['va'] <= rva < s['va'] + max(s['vsize'], s['rsize']):
            return s['raw'] + (rva - s['va'])
    return None


def parsear_pe(b):
    if len(b) < 0x40 or b[:2] != b'MZ':
        return {'error': 'no es un ejecutable PE (falta MZ)'}
    try:
        e_lfanew = struct.unpack_from('<I', b, 0x3C)[0]
        if b[e_lfanew:e_lfanew + 4] != b'PE\0\0':
            return {'error': 'no es un ejecutable PE (falta firma PE)'}
        coff = e_lfanew + 4
        maquina, nsec, tstamp, _, _, opt_size, caracteristicas = struct.unpack_from('<HHIIIHH', b, coff)
        opt = coff + 20
        magic = struct.unpack_from('<H', b, opt)[0]
        pe32mas = magic == 0x20B
        # el número de directorios está justo antes de la tabla (96 en PE32, 112 en PE32+), no 4 bytes antes
        dir_off = opt + (112 if pe32mas else 96)
        n_dir = struct.unpack_from('<I', b, dir_off - 4)[0]
        directorios = []
        for i in range(min(n_dir, 16)):
            directorios.append(list(struct.unpack_from('<II', b, dir_off + i * 8)))
        clr_rva = directorios[14][0] if len(directorios) > 14 else 0
        sec_off = opt + opt_size
        secciones = []
        for i in range(nsec):
            o = sec_off + i * 40
            nombre = b[o:o + 8].rstrip(b'\0').decode('latin-1', 'replace')
            vsize, va, rsize, raw = struct.unpack_from('<IIII', b, o + 8)
            flags = struct.unpack_from('<I', b, o + 36)[0]
            secciones.append({'nombre': nombre, 'va': va, 'vsize': vsize, 'raw': raw, 'rsize': rsize,
                              'ejecutable': bool(flags & 0x20000000), 'escribible': bool(flags & 0x80000000)})
        sub = struct.unpack_from('<H', b, opt + 68)[0]
        datasig = None
        if len(directorios) > 4 and directorios[4][0]:
            o2 = rva2off({'secciones': secciones}, directorios[4][0])
            if o2:
                datasig = list(struct.unpack_from('<II', b, o2))
        clr_rva = directorios[14][0] if len(directorios) > 14 else 0
        return {'es_pe': True, 'arquitectura': {0x14c: 'x86', 0x8664: 'x64', 0xAA64: 'ARM64', 0x1c0: 'ARM'}.get(maquina, hex(maquina)),
                'dll': bool(caracteristicas & 0x2000), 'exe': bool(caracteristicas & 0x2), 'timestamp': tstamp,
                'magic': 'PE32+' if pe32mas else 'PE32', 'subsistema': {2: 'gui', 3: 'consola', 9: 'windows-ce', 1: 'nativo'}.get(sub, sub),
                'secciones': secciones, 'firma_autenticode': datasig, 'clr_rva': clr_rva,
                'tamano': len(b), 'opt': opt, 'opt_size': opt_size, 'e_lfanew': e_lfanew}
    except Exception as e:
        return {'error': f'PE ilegible: {e}'}


def parsear_clr(b, pe):
    o = rva2off(pe, pe['clr_rva']) if pe.get('clr_rva') else None
    if not o:
        return None
    try:
        cb, major, minor, md_rva, md_size, flags, entry = struct.unpack_from('<IHHIIII', b, o)
        m = rva2off(pe, md_rva)
        if not m or b[m:m + 4] != b'BSJB':
            return None
        ver_len = struct.unpack_from('<I', b, m + 12)[0]
        version = b[m + 16:m + 16 + ver_len].split(b'\0')[0].decode('latin-1', 'replace')
        p = m + 16 + ver_len                     # flags (2) + nº de flujos (2) empiezan aquí
        p += 2
        nstreams = struct.unpack_from('<H', b, p)[0]
        p += 2
        streams = {}
        for _ in range(nstreams):
            off, size = struct.unpack_from('<II', b, p)
            p += 8
            fin = b.index(b'\0', p)
            nombre = b[p:fin].decode('latin-1', 'replace')
            p += ((len(nombre) + 1 + 3) // 4) * 4   # el nombre va alineado a 4 bytes, contando su \0
            streams[nombre] = {'off': m + off, 'size': size}
        cor = {}
        for k, v in (('IL_ONLY', 0x1), ('32BIT_REQUIRED', 0x2), ('IL_LIBRARY', 0x4), ('STRONGNAME_SIGNED', 0x8), ('NATIVE_ENTRYPOINT', 0x10)):
            if flags & v:
                cor[k] = True
        return {'version': version, 'flags': flags, 'corflags': cor, 'streams': streams}
    except Exception:
        return None


def leer_md(b, clr):
    st = clr['streams']
    if '#~' not in st:
        return None
    base = st['#~']['off']
    heap_sizes = b[base + 6]
    valid = struct.unpack_from('<Q', b, base + 8)[0]
    p = base + 24
    filas = {}
    for i in range(64):
        if valid & (1 << i):
            filas[i] = struct.unpack_from('<I', b, p)[0]
            p += 4
    return {'filas': filas, 'tabla_inicio': p, 'heap_sizes': heap_sizes, 'str': st['#Strings']['off'], 'str_size': st['#Strings']['size']}


def s_str(b, md, i):
    """Cadena del heap #Strings. Con nombres de 4 bytes el índice puede pasarse del heap: se acota y se avisa."""
    if not i:
        return ''
    o = md['str'] + i
    fin_heap = md['str'] + md['str_size'] if md.get('str_size') else len(b)
    if o >= fin_heap:
        return f'<índice fuera del heap: {i}>'
    try:
        return b[o:b.index(b'\0', o, len(b))].decode('utf-8', 'replace')
    except ValueError:
        return b[o:min(o + 120, len(b))].decode('utf-8', 'replace')


def offs_tablas(b, md):
    """Desplazamiento y tamaño de fila de CADA tabla de metadata según su esquema oficial (ECMA-335).
    Las tablas que no se usan se necesitan solo para saber medirlas: sin eso, todo lo que viene después
    de ellas se lee en el sitio equivocado (de ahí nombres a trozos)."""
    f = md['filas']
    hs = md['heap_sizes']
    a_str = 4 if hs & 1 else 2
    a_guid = 4 if hs & 2 else 2
    a_blob = 4 if hs & 4 else 2
    I = lambda t: 2 if f.get(t, 0) < 0x10000 else 4      # índice corto a la tabla t
    def COD(a, b_):
        return 2 if f.get(a, 0) < (1 << b_) else 4       # codificación de tablas con límite de bits
    c_typedeforref = 2 if max(f.get(2, 0), f.get(1, 0)) < (1 << 14) else 4
    c_hasconst = 2 if f.get(4, 0) < (1 << 14) else 4
    c_hascustattr = 2 if max(f.get(6, 0), f.get(4, 0)) < (1 << 21) else 4
    c_hasfieldmarshal = 2 if f.get(4, 0) < (1 << 14) else 4
    c_hasdeclsec = 2 if max(f.get(2, 0), f.get(0x23, 0)) < (1 << 14) else 4
    c_memberref = 2 if max(f.get(2, 0), f.get(1, 0), f.get(0x1A, 0)) < (1 << 14) else 4
    c_resolutionscope = 2 if max(f.get(0, 0), f.get(0x1A, 0), f.get(0x23, 0)) < (1 << 14) else 4
    c_typespec = 2 if f.get(0x1B, 0) < (1 << 12) else 4
    c_methoddef = 2 if f.get(6, 0) < (1 << 13) else 4
    c_methoddef_or_ref = 2 if max(f.get(6, 0), f.get(0x0A, 0)) < (1 << 13) else 4
    c_customattr = 2 if max(f.get(6, 0), f.get(4, 0)) < (1 << 22) else 4
    S = {
        0x00: 2,                                                                 # Module
        0x01: I(0) + a_str + a_guid + a_guid + a_guid,                           # TypeRef
        0x02: 4 + a_str + a_str + c_typedeforref + c_methoddef,                  # TypeDef
        0x03: I(4),                                                              # FieldPtr
        0x04: 2 + a_str + a_blob,                                                # Field
        0x05: I(6),                                                              # MethodPtr
        0x06: 4 + 2 + 2 + a_str + a_blob,                                        # MethodDef
        0x07: I(8),                                                              # ParamPtr
        0x08: 2 + 2 + a_str,                                                     # Param
        0x09: I(2) + c_typedeforref,                                             # InterfaceImpl
        0x0A: c_memberref + a_str + a_blob,                                      # MemberRef
        0x0B: 1 + 1 + c_hasconst + a_blob,                                       # Constant
        0x0C: c_hascustattr + c_customattr + a_blob,                             # CustomAttribute
        0x0D: c_hasfieldmarshal + a_blob,                                        # FieldMarshal
        0x0E: c_hasdeclsec + a_blob,                                             # DeclSecurity
        0x0F: 2 + 4 + I(2),                                                      # ClassLayout
        0x10: 4 + I(4),                                                          # FieldLayout
        0x11: a_blob,                                                            # StandAloneSig
        0x12: I(2) + c_typedeforref,                                             # EventMap
        0x13: 2 + a_str + c_typedeforref,                                        # EventPtr
        0x14: I(2) + I(0x14) + a_str,                                            # Event
        0x15: I(2) + I(0x17) + a_str,                                            # PropertyMap
        0x17: 2 + a_str + a_blob,                                                # Property
        0x18: 2 + I(6) + c_hasdeclsec,                                           # MethodSemantics
        0x19: I(2) + c_methoddef_or_ref,                                         # MethodImpl
        0x1A: a_str,                                                             # ModuleRef
        0x1B: a_blob,                                                            # TypeSpec
        0x1C: 2 + c_memberref + a_blob,                                          # ImplMap
        0x1D: 4 + I(4),                                                          # FieldRVA
        0x1E: 4 + 4,                                                             # ENCLog
        0x1F: 4 + 4,                                                             # ENCMap
        0x20: 4 + 2 + 2 + 2 + 2 + 4 + a_blob + a_str + a_str,                    # Assembly
        0x21: 4,                                                                 # AssemblyProcessor
        0x22: 4 + 4 + 4,                                                         # AssemblyOS
        0x23: 2 + 2 + 2 + 2 + 4 + a_blob + a_str + a_str,                        # AssemblyRef
        0x24: 4 + I(0x23),                                                       # AssemblyRefProcessor
        0x25: 4 + 4 + 4 + I(0x23),                                               # AssemblyRefOS
        0x26: 4 + a_str + a_blob,                                                # File
        0x27: 4 + 4 + a_str + a_blob,                                            # ExportedType
        0x28: 4 + 4 + a_str + I(0x26),                                           # ManifestResource
        0x29: I(2) + I(2),                                                       # NestedClass
        0x2A: 2 + 2 + c_typespec + c_methoddef_or_ref,                           # GenericParam
        0x2B: c_methoddef_or_ref + c_typespec,                                   # MethodSpec
        0x2C: I(2) + c_typespec,                                                 # GenericParamConstraint
        0x2D: c_resolutionscope + a_str + a_blob + 4 + 4,                        # ModuleRef 2026? (por si aparece)
    }
    p, offs = md['tabla_inicio'], {}
    for t in sorted(f):
        if t not in S:
            break                        # tabla desconocida: hasta aquí se puede leer con seguridad
        offs[t] = (p, S[t])
        p += S[t] * f[t]
    return offs, (t if t not in S else None)


def cmd_miembros(b):
    pe = parsear_pe(b)
    if not pe.get('es_pe'):
        return {'error': pe.get('error')}
    clr = parsear_clr(b, pe)
    if not clr:
        return {'error': 'no es un ensamblado .NET (sin CLR)', 'tipo': 'nativo'}
    md = leer_md(b, clr)
    if not md:
        return {'error': 'metadata .NET ilegible (sin #~)'}
    offs, desconocida = offs_tablas(b, md)
    if 0x02 not in offs or 0x06 not in offs:
        return {'error': 'TypeDef/MethodDef no encontrados', 'tablas': {hex(k): v for k, v in md['filas'].items()}}
    o2, t2 = offs[0x02]
    o6, t6 = offs[0x06]
    n2, n6 = md['filas'][0x02], md['filas'][0x06]
    hs = md['heap_sizes']
    w_str = 4 if hs & 1 else 2
    w_tref = 2 if max(n2, md['filas'].get(1, 0)) < (1 << 14) else 4
    w_mlist = 2 if n6 < (1 << 13) else 4
    # lee un índice del heap #Strings del ancho real (2 o 4 bytes)
    idx_str = lambda fo: struct.unpack_from('<I', b, fo)[0] if w_str == 4 else struct.unpack_from('<H', b, fo)[0]
    tipos = []
    for i in range(n2):
        fo = o2 + i * t2
        flags = struct.unpack_from('<I', b, fo)[0]
        nombre = s_str(b, md, idx_str(fo + 4))
        esp = s_str(b, md, idx_str(fo + 4 + w_str))
        tipos.append({'flags': flags, 'nombre': nombre, 'espacio': esp, 'fo': fo})
    metodos = []
    for i in range(n6):
        fo = o6 + i * t6
        rva = struct.unpack_from('<I', b, fo)[0]
        impl = struct.unpack_from('<H', b, fo + 4)[0]
        metodos.append({'nombre': s_str(b, md, idx_str(fo + 8)), 'rva': rva, 'impl': impl})
    # MethodList: la última columna del TypeDef; cada tipo abarca [inicio, inicio siguiente) - 1
    col_mlist = 4 + w_str * 2 + w_tref
    salida = []
    for i, t in enumerate(tipos):
        def mlist(fo):
            return struct.unpack_from('<H', b, fo + col_mlist)[0] if w_mlist == 2 else struct.unpack_from('<I', b, fo + col_mlist)[0]
        ini = mlist(t['fo'])
        fin = mlist(tipos[i + 1]['fo']) if i + 1 < len(tipos) else n6 + 1
        a = max(0, (ini - 1) if ini else 0)
        z = (fin - 1) if fin else n6
        if z < a:
            z = a
        salida.append({'tipo': (t['espacio'] + '.' if t['espacio'] else '') + t['nombre'],
                       'metodos': [m['nombre'] for m in metodos[a:z][:80]], 'n': max(0, z - a)})
    return {'tipo': 'dotnet', 'tipos': n2, 'metodos': n6, 'tabla_ilegible_desde': desconocida, 'detalle': salida[:300]}


def cmd_refs(b):
    pe = parsear_pe(b)
    if not pe.get('es_pe') or not pe.get('clr_rva'):
        return {'error': 'sin CLR'}
    clr = parsear_clr(b, pe)
    md = leer_md(b, clr)
    offs, _ = offs_tablas(b, md)
    out = []
    if 0x23 in offs:
        o, t = offs[0x23]
        w_str = 4 if md['heap_sizes'] & 1 else 2
        for i in range(md['filas'][0x23]):
            fo = o + i * t
            may, mino, bld, rev = struct.unpack_from('<HHHH', b, fo)
            nidx = struct.unpack_from('<H', b, fo + 12)[0] if w_str == 2 else struct.unpack_from('<I', b, fo + 12)[0]
            out.append({'nombre': s_str(b, md, nidx), 'version': f'{may}.{mino}.{bld}.{rev}'})
    return {'referencias': out}


def cmd_cadenas(b, n=8, buscar=None):
    vista = b.decode('latin-1', 'replace')
    pat = [
        ('rutas', re.compile(r'[A-Za-z]:\\[^\x00\n\r"<>|]{3,160}')),
        ('urls', re.compile(r'https?://[^\s\x00"\'<>]{6,160}')),
        ('claves', re.compile(r'(?i)\b(licen[cs]e|serial|productkey|apikey|api_key|secret|token|passw)\b[\w .:=-]{0,50}')),
        ('apis', re.compile(r'\b(Reg(Set|Get|Open|Create)Value\w*|VirtualAlloc(Ex)?|CreateProcess\w*|WinExec|ShellExecute\w*|IsDebuggerPresent|CheckRemoteDebuggerPresent|InternetOpen\w*|WinHttp\w+|Crypt\w+|BCrypt\w+|LoadLibrary\w*|GetProcAddress)\b')),
        ('protectores', re.compile(r'\b(Costura|SmartAssembly|Themida|VMProtect|ConfuserEx|Eazfuscator|Dotfuscator|Enigma)\b')),
    ]
    res = {}
    for nombre, re_ in pat:
        vistos = []
        for m in re_.finditer(vista):
            x = m.group(0).strip()
            if x not in vistos:
                vistos.append(x)
            if len(vistos) >= n:
                break
        if vistos:
            res[nombre] = vistos
    if buscar:
        q = buscar.lower()
        todo = set(re.findall(r'[ -~]{4,120}', vista)) | set(re.findall(r'[ -~]{4,120}', b.decode('utf-16-le', 'ignore')))
        res['busqueda'] = [x for x in todo if q in x.lower()][:n]
    try:
        pe = parsear_pe(b)
        clr = parsear_clr(b, pe) if pe.get('clr_rva') else None
        if clr and '#US' in clr['streams']:
            o, tam = clr['streams']['#US']['off'], clr['streams']['#US']['size']
            p, fin, trozos = o, o + tam, []
            while p < fin - 1:
                comp = b[p]
                if comp == 0:
                    p += 1
                    continue
                if comp & 0x80:
                    if comp & 0x40:
                        ln = ((comp & 0x1F) << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]
                        p += 4
                    else:
                        ln = ((comp & 0x3F) << 8) | b[p + 1]
                        p += 2
                else:
                    ln, p = comp, p + 1
                s = b[p:p + max(0, ln - 1)].decode('utf-16-le', 'ignore').strip()
                p += ln
                if len(s) >= 3:
                    trozos.append(s)
            if trozos:
                res['cadenas_us'] = trozos[:40]
    except Exception:
        pass
    return res


def cmd_carcasa(b):
    firmas = {
        'Costura/Fody': [b'costura'], 'SmartAssembly': [b'SmartAssembly', b'ConfusedByAttribute'],
        'Themida': [b'Themida'], 'VMProtect': [b'VMProtect', b'.vmp'], 'Enigma': [b'Enigma protector'],
        '.NET Reactor': [b'Reactore'], 'ConfuserEx': [b'ConfuserEx'], 'Eazfuscator': [b'Eazfuscator'],
        'Dotfuscator': [b'Dotfuscator'], 'MPRESS': [b'MPRESS1', b'MPRESS2'],
    }
    cab = b[:4_000_000].lower()
    hit = sorted({k for k, vs in firmas.items() if any(v.lower() in cab for v in vs)})
    pdb = [x.decode('latin-1') for x in re.findall(rb'([ -~]{4,120}\.pdb)', b[:4_000_000])[:3]]
    return {'protectores': hit, 'pdb': pdb,
            'siguiente': ('hay huellas: desembala antes de analizar (stub → OEP → volcado con Scylla → recoloca importaciones)' if hit else 'sin huellas conocidas: sigue con ilspycmd (si .NET) o Ghidra/REA (si nativo)')}


def cmd_importaciones(b):
    pe = parsear_pe(b)
    if not pe.get('es_pe'):
        return {'error': pe.get('error')}
    dirs = pe.get('directorios') if 'directorios' in pe else None
    return {'nota': 'usa `info` para las secciones y `cadenas` para las APIs de interés; la tabla de importaciones completa la da diec/pefile/REA',
            'dlls_sospechosas': sorted({d for d in ('winhttp.dll', 'wininet.dll', 'urlmon.dll', 'advapi32.dll', 'crypt32.dll', 'bcrypt.dll', 'kernel32.dll') if d.encode() in b[:4_000_000].lower()})}


def main(argv):
    if len(argv) < 3:
        print(json.dumps({'error': 'uso: pe.py <info|tipo|miembros|refs|cadenas|carcasa|importaciones> <ruta> [--n=8] [--buscar=x]'}, ensure_ascii=False))
        return 2
    cmd, ruta = argv[1], argv[2]
    opts = dict(a[2:].split('=', 1) for a in argv[3:] if a.startswith('--') and '=' in a)
    try:
        b = leer(ruta)
    except Exception as e:
        print(json.dumps({'error': f'no puedo abrir {ruta}: {e}'}, ensure_ascii=False))
        return 1
    try:
        if cmd == 'info':
            pe = parsear_pe(b)
            if pe.get('es_pe'):
                pe['clr'] = parsear_clr(b, pe)
                pe['es_dotnet'] = bool(pe['clr'])
            print(json.dumps(pe, ensure_ascii=False))
        elif cmd == 'tipo':
            pe = parsear_pe(b)
            if not pe.get('es_pe'):
                print(json.dumps({'tipo': 'desconocido', 'error': pe.get('error')}, ensure_ascii=False))
            elif pe['clr_rva']:
                clr = parsear_clr(b, pe)
                print(json.dumps({'tipo': 'dotnet', 'arquitectura': pe['arquitectura'], 'carga': clr['version'] if clr else '?',
                                  'corflags': clr['corflags'] if clr else {}, 'siguiente': 'ilspycmd -p -o <carpeta> <ruta> para C#, y REA MCP si quieres evidencia y trazado por funciones'}, ensure_ascii=False))
            else:
                print(json.dumps({'tipo': 'nativo', 'arquitectura': pe['arquitectura'], 'secciones': [s['nombre'] for s in pe['secciones']],
                                  'siguiente': 'Ghidra/IDA/Hopper para pseudocódigo; REA MCP para la sesión con evidencia'}, ensure_ascii=False))
        elif cmd == 'miembros':
            print(json.dumps(cmd_miembros(b), ensure_ascii=False))
        elif cmd == 'refs':
            print(json.dumps(cmd_refs(b), ensure_ascii=False))
        elif cmd == 'cadenas':
            print(json.dumps(cmd_cadenas(b, int(opts.get('n', 8)), opts.get('buscar')), ensure_ascii=False))
        elif cmd == 'carcasa':
            print(json.dumps(cmd_carcasa(b), ensure_ascii=False))
        elif cmd == 'importaciones':
            print(json.dumps(cmd_importaciones(b), ensure_ascii=False))
        else:
            print(json.dumps({'error': f'comando desconocido: {cmd}'}, ensure_ascii=False))
            return 2
    except Exception as e:
        print(json.dumps({'error': f'{type(e).__name__}: {e}'}, ensure_ascii=False))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
