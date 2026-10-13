# Caja paramétrica para impresión 3D. Se ejecuta DENTRO de Blender (lo lanza scripts/caja.py):
#   blender -b --factory-startup --python caja_blender.py -- <params.json> <carpeta de salida>
# 1 unidad = 1 mm. Saca <nombre>_caja.stl, <nombre>_tapa.stl y <nombre>_vista.png (render rápido).
import bpy, bmesh, json, math, os, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
P = json.load(open(args[0], encoding='utf-8'))
OUT = args[1]
os.makedirs(OUT, exist_ok=True)

nombre = P.get('nombre', 'proyecto')
ix, iy, iz = P['interior']                       # hueco útil (mm)
pared = P.get('pared', 2.4)
base = P.get('base', 2.0)
radio = P.get('radio', 3.0)                       # redondeo de las esquinas verticales
tol = P.get('tolerancia', 0.25)                   # holgura tapa/caja
tapa_grosor = P.get('tapa_grosor', 2.0)
pestana = P.get('pestana', 4.0)                   # lo que la tapa entra en la caja
ox, oy, oz = ix + 2 * pared, iy + 2 * pared, iz + base

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def caja_redondeada(nom, sx, sy, sz, r, z0=0.0):
    """prisma de esquinas verticales redondeadas, apoyado en z0"""
    bm = bmesh.new()
    r = max(0.0, min(r, sx / 2 - 0.01, sy / 2 - 0.01))
    pts = []
    seg = 8 if r > 0 else 1
    for cx, cy, a0 in ((sx / 2 - r, sy / 2 - r, 0), (-sx / 2 + r, sy / 2 - r, 90), (-sx / 2 + r, -sy / 2 + r, 180), (sx / 2 - r, -sy / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    abajo = [bm.verts.new((x, y, z0)) for x, y in pts]
    arriba = [bm.verts.new((x, y, z0 + sz)) for x, y in pts]
    bm.faces.new(list(reversed(abajo))); bm.faces.new(arriba)
    n = len(pts)
    for i in range(n): bm.faces.new((abajo[i], abajo[(i + 1) % n], arriba[(i + 1) % n], arriba[i]))
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); bpy.context.collection.objects.link(o)
    return o

def cilindro(nom, d, h, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=d / 2, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = nom; return o

def cubo(nom, sx, sy, sz, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = nom; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True); return o

def restar(obj, cortador):
    m = obj.modifiers.new('bool', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cortador
    for s in ('EXACT', 'MANIFOLD', 'FLOAT', 'FAST'):
        try: m.solver = s; break
        except Exception: pass
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cortador, do_unlink=True)

def unir(obj, otro):
    m = obj.modifiers.new('u', 'BOOLEAN'); m.operation = 'UNION'; m.object = otro
    for s in ('EXACT', 'MANIFOLD', 'FLOAT', 'FAST'):
        try: m.solver = s; break
        except Exception: pass
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(otro, do_unlink=True)

# ---------- cuerpo ----------
caja = caja_redondeada('caja', ox, oy, oz, radio)
restar(caja, caja_redondeada('hueco', ix, iy, iz + 1, max(0, radio - pared), base))

# postes para tornillos (coordenadas desde el centro del suelo)
for i, p in enumerate(P.get('postes', [])):
    h, d = p.get('alto', 5), p.get('diametro', 6)
    poste = cilindro(f'poste{i}', d, h, (p['x'], p['y'], base + h / 2))
    unir(caja, poste)
    restar(caja, cilindro(f'tal{i}', p.get('tornillo', 2.5), h + 0.2, (p['x'], p['y'], base + h / 2 + 0.1)))

# agujeros en las caras. x/y = desplazamiento desde el centro de la cara (y = vertical en las caras laterales)
def cara(c):
    zc = base + iz / 2
    return {
        'frente': ((0, -oy / 2, zc), (math.pi / 2, 0, 0), ('x', 'z')),
        'atras': ((0, oy / 2, zc), (math.pi / 2, 0, 0), ('x', 'z')),
        'izq': ((-ox / 2, 0, zc), (0, math.pi / 2, 0), ('y', 'z')),
        'der': ((ox / 2, 0, zc), (0, math.pi / 2, 0), ('y', 'z')),
        'abajo': ((0, 0, base / 2), (0, 0, 0), ('x', 'y')),
    }[c]
for i, a in enumerate(P.get('agujeros', [])):
    if a.get('cara') == 'tapa': continue
    (cx, cy, cz), rot, (eh, ev) = cara(a.get('cara', 'frente'))
    loc = Vector((cx, cy, cz)); loc['xyz'.index(eh)] += a.get('x', 0); loc['xyz'.index(ev)] += a.get('y', 0)
    prof = pared * 3 + 2 if a.get('cara') != 'abajo' else base * 3
    if a.get('forma', 'rect') == 'circulo':
        restar(caja, cilindro(f'ag{i}', a['diametro'], prof, loc, rot))
    else:
        w, h = a['ancho'], a['alto']
        dims = {'frente': (w, prof, h), 'atras': (w, prof, h), 'izq': (prof, w, h), 'der': (prof, w, h), 'abajo': (w, h, prof)}[a.get('cara', 'frente')]
        restar(caja, cubo(f'ag{i}', *dims, loc))

# rejilla de ventilación en los laterales que no tienen agujeros (si no, la rejilla se come el agujero)
if P.get('ventilacion'):
    n = max(3, int(iy / 6))
    ocupadas = {a.get('cara') for a in P.get('agujeros', [])}
    for lado in [l for l, c in ((-1, 'izq'), (1, 'der')) if c not in ocupadas]:
        for k in range(n):
            y = -iy / 2 + 6 + k * (iy - 12) / max(1, n - 1)
            restar(caja, cubo(f'v{lado}{k}', pared * 3 + 2, 2.0, iz * 0.45, (lado * ox / 2, y, base + iz * 0.55)))

# ---------- tapa: placa + pestaña que encaja dentro ----------
tapa = caja_redondeada('tapa', ox, oy, tapa_grosor, radio)
lab = caja_redondeada('pest', ix - 2 * tol, iy - 2 * tol, pestana, max(0, radio - pared), -pestana)
unir(tapa, lab)
restar(tapa, caja_redondeada('pest_hueco', ix - 2 * tol - 2 * 1.6, iy - 2 * tol - 2 * 1.6, pestana + 0.01, max(0, radio - pared - 1.6), -pestana - 0.01))
for i, a in enumerate(P.get('agujeros', [])):
    if a.get('cara') != 'tapa': continue
    loc = (a.get('x', 0), a.get('y', 0), tapa_grosor / 2)
    if a.get('forma', 'rect') == 'circulo': restar(tapa, cilindro(f'at{i}', a['diametro'], 40, loc))
    else: restar(tapa, cubo(f'at{i}', a['ancho'], a['alto'], 40, loc))

# ---------- exportar ----------
def exportar(o, f):
    for x in bpy.data.objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    try: bpy.ops.wm.stl_export(filepath=f, export_selected_objects=True, ascii_format=False)
    except AttributeError: bpy.ops.export_mesh.stl(filepath=f, use_selection=True)
caja_stl, tapa_stl = os.path.join(OUT, f'{nombre}_caja.stl'), os.path.join(OUT, f'{nombre}_tapa.stl')
exportar(caja, caja_stl)
tapa.rotation_euler = (math.pi, 0, 0); tapa.location = (0, 0, tapa_grosor)    # boca abajo para imprimir sin soportes
bpy.context.view_layer.update(); exportar(tapa, tapa_stl)

# ---------- vista previa: tapa flotando sobre la caja ----------
tapa.rotation_euler = (0, 0, 0); tapa.location = (0, 0, oz + max(25, oz * 0.6))
sc = bpy.context.scene
try: sc.render.engine = 'BLENDER_WORKBENCH'
except Exception: pass
sc.render.resolution_x, sc.render.resolution_y = 1000, 750
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'SINGLE'
sc.display.shading.single_color = (0.85, 0.45, 0.12)
tam = max(ox, oy, oz * 2)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
cam.location = (tam * 1.6, -tam * 1.9, tam * 1.5)
d = Vector((0, 0, oz * 0.8)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.camera = cam
sc.render.filepath = os.path.join(OUT, f'{nombre}_vista.png')
bpy.ops.render.render(write_still=True)

dims = lambda o: [round(v, 1) for v in o.dimensions]
print('CAJA_JSON ' + json.dumps({'caja': caja_stl, 'tapa': tapa_stl, 'vista': sc.render.filepath,
                                 'exterior_mm': [round(ox, 1), round(oy, 1), round(oz + tapa_grosor, 1)], 'cabe_ender3': max(ox, oy) <= 220 and oz <= 250}))
