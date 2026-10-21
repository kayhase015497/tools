"""仙舟巡洋艦艦橋改建：把舊的簡易塔樓換成一棟小小的中式廟宇建築（該垂直的地方垂直）。
流程：載入網頁版 cruiser.glb → 刪掉舊艦橋（艦背 y∈[0.8,4.2]、z>0.95 的頂點）→ 加上程序式廟宇（台基、廳堂與立柱、飛簷歇山頂、二樓、第二層屋頂、寶頂）
→ 輸出 godot/assets/models/cruiser.glb（Godot 專用版；網頁版 cruiser.glb 不動）。
座標（Blender）：+Z 向上、船首朝 -Y；舊艦橋在艦背中段。材質：temple_wood（木）、temple_roof（瓦）、temple_door（深色門窗）。"""
import bpy, bmesh, math
from mathutils import Vector

SRC = '/home/user/tools/assets/space-war/models/cruiser.glb'
DST = '/home/user/tools/godot/assets/models/cruiser.glb'
CY = 2.35          # 廟宇中心（沿船身 Y）
Z0 = 0.90          # 艦背高度

def mat(name, color, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = color; b.inputs['Roughness'].default_value = rough
    return m

def add_box(bm, c, d, mi):      # c＝中心、d＝尺寸
    x, y, z = c; sx, sy, sz = d[0] / 2, d[1] / 2, d[2] / 2
    vs = [bm.verts.new((x + a * sx, y + b * sy, z + cc * sz)) for a in (-1, 1) for b in (-1, 1) for cc in (-1, 1)]
    for f in ((0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)):
        fc = bm.faces.new([vs[i] for i in f]); fc.material_index = mi

def add_column(bm, c, r, h, mi, seg=8):
    x, y, z = c
    bot = [bm.verts.new((x + r * math.cos(2 * math.pi * i / seg), y + r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
    top = [bm.verts.new((x + r * 0.92 * math.cos(2 * math.pi * i / seg), y + r * 0.92 * math.sin(2 * math.pi * i / seg), z + h)) for i in range(seg)]
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((bot[i], bot[j], top[j], top[i])).material_index = mi
    bm.faces.new(top).material_index = mi

def add_roof(bm, cz, bw, bd, tw, td, h, lift, mi):
    """歇山頂簡化：下緣矩形（四角上翹＝飛簷）→ 上緣矩形（屋脊）。bw/bd＝下緣 x／y 全寬，tw/td＝上緣。"""
    def rect(w, d, z, k=0.0):
        return [bm.verts.new((sx * w / 2 * (1 + k if k else 1), sy * d / 2 * (1 + k if k else 1), z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    lower = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):   # 四角：向外延伸並上翹
        lower.append(bm.verts.new((CX * 0 + sx * bw / 2 * 1.06, CY + sy * bd / 2 * 1.06, cz + lift)))
    # 邊的中點略低（屋檐下垂弧度）：每邊插一個中點頂點
    mids = [bm.verts.new((0, CY - bd / 2, cz)), bm.verts.new((bw / 2, CY, cz)), bm.verts.new((0, CY + bd / 2, cz)), bm.verts.new((-bw / 2, CY, cz))]
    upper = [bm.verts.new((sx * tw / 2, CY + sy * td / 2, cz + h)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ring = [lower[0], mids[0], lower[1], mids[1], lower[2], mids[2], lower[3], mids[3]]
    up = [upper[0], upper[0], upper[1], upper[1], upper[2], upper[2], upper[3], upper[3]]
    for i in range(0, 8):
        j = (i + 1) % 8
        a, b, c2, d2 = ring[i], ring[j], up[j], up[i]
        try:
            f = bm.faces.new((a, b, c2, d2) if c2 != d2 else (a, b, c2)); f.material_index = mi
        except ValueError:
            pass
    bm.faces.new(upper[::-1]).material_index = mi   # 屋頂頂面
    bm.faces.new(ring[::-1]).material_index = mi    # 屋底（封閉）

CX = 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in objs:   # 刪除舊艦橋
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    kill = [v for v in bm.verts if v.co.z > 0.95 and 0.8 < v.co.y < 4.2 and abs(v.co.x) < 1.45]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.transform(o.matrix_world.inverted()); bm.to_mesh(o.data); bm.free()

me = bpy.data.meshes.new('XZ_Temple'); me.materials.append(mat('temple_wood', (0.45, 0.30, 0.15, 1), 0.5))
me.materials.append(mat('temple_roof', (0.12, 0.16, 0.16, 1), 0.35)); me.materials.append(mat('temple_door', (0.03, 0.025, 0.02, 1), 0.7))
bm = bmesh.new()
W, M, R = 0, 0, 1
# 台基：兩層
add_box(bm, (0, CY, Z0 + 0.06), (2.4, 3.1, 0.32), W)
add_box(bm, (0, CY, Z0 + 0.26), (2.05, 2.7, 0.14), W)
# 一樓廳堂：牆（垂直）、前後門洞、四角與前廊立柱
zb = Z0 + 0.33
add_box(bm, (0, CY, zb + 0.4), (1.5, 2.1, 0.8), W)
add_box(bm, (0, CY - 1.06, zb + 0.35), (0.62, 0.05, 0.62), 2)     # 正面門洞（船首側，-Y）
add_box(bm, (0, CY + 1.06, zb + 0.35), (0.62, 0.05, 0.62), 2)
for sx in (-1, 1):
    add_box(bm, (sx * 0.76, CY, zb + 0.4), (0.05, 1.3, 0.5), 2)  # 側面窗
for sx in (-1, 1):
    for sy in (-1, 0, 1):
        add_column(bm, (sx * 0.92, CY + sy * 1.0, zb), 0.065, 0.82, W)
# 第一層屋頂（飛簷）
add_roof(bm, zb + 0.82, 2.55, 3.35, 0.95, 1.7, 0.45, 0.13, R)
# 二樓：小廳堂
z2 = zb + 0.82 + 0.45
add_box(bm, (0, CY, z2 + 0.27), (1.0, 1.45, 0.54), W)
add_box(bm, (0, CY - 0.74, z2 + 0.25), (0.4, 0.04, 0.34), 2)
for sx in (-1, 1):
    for sy in (-1, 1):
        add_column(bm, (sx * 0.56, CY + sy * 0.78, z2), 0.05, 0.56, W)
# 第二層屋頂
add_roof(bm, z2 + 0.56, 1.75, 2.35, 0.32, 0.85, 0.4, 0.11, R)
# 寶頂（脊刹）
add_column(bm, (0, CY, z2 + 0.95), 0.035, 0.5, R, 6)
bm.normal_update(); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()
t = bpy.data.objects.new('XZ_Temple', me); bpy.context.scene.collection.objects.link(t)
bpy.context.view_layer.objects.active = t; t.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=False)
print('exported', DST, 'temple faces', len(me.polygons))
