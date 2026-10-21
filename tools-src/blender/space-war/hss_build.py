"""黑塔空間站（HSS）精緻硬表面重建——程序式建模，取代 TRIPO 的軟糊模型（Godot 專用版，網頁版不動）。
形制參考使用者提供的圖：尾端一個大白環＋輻條、白色長艦體、橘色飾板、深灰分段、紅色航行燈、天線、太陽能板臂、藍色引擎光。
座標（Blender）：長軸 Y，圓環端＝+Y（船尾），艦首＝−Y（甲板導引光端）；Z 向上；錨點沿用 finish_hss.py 的位置。
材質（無貼圖，只有名稱＋底色；Godot 端以 hss_ 前綴套用 POM 艦體 shader＋共用的面板貼圖）：
  hss_white 白陶瓷、hss_dark 深灰、hss_orange 橘飾板、hss_solar 太陽能板、hss_red/hss_blue/hss_window 發光件。
輸出 godot/assets/models/hss.glb。"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
DST = '/home/user/tools/godot/assets/models/hss.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = {}
def mat(name, col, emit=None, energy=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*col, 1)
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = energy
    MATS[name] = m
mat('hss_white', (0.9, 0.9, 0.88)); mat('hss_dark', (0.1, 0.1, 0.12)); mat('hss_orange', (0.9, 0.36, 0.06))
mat('hss_solar', (0.04, 0.07, 0.16)); mat('hss_red', (0.9, 0.05, 0.03), (1, 0.05, 0.02), 4.0)
mat('hss_blue', (0.3, 0.6, 1.0), (0.35, 0.65, 1.0), 4.0); mat('hss_window', (1, 0.8, 0.5), (1, 0.75, 0.4), 2.5)
objs = {k: [] for k in MATS}
def _fin(o, m, bevel):
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    if bevel:
        md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 1; md.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier='b')
    o.data.materials.append(MATS[m]); objs[m].append(o); o.select_set(False)
def box(c, s, m, bevel=0.12, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c); o = bpy.context.active_object; o.scale = s
    if rot: o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); _fin(o, m, bevel); return o
def cyl(c, r, d, m, axis='Y', verts=24, r2=None, bevel=0.0):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=c)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=d, location=c)
    o = bpy.context.active_object
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': o.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); _fin(o, m, bevel); return o
def ring(c, R, r, sq, m, segs=96):
    bpy.ops.mesh.primitive_torus_add(major_segments=segs, minor_segments=8, major_radius=R, minor_radius=r, location=c)
    o = bpy.context.active_object; o.rotation_euler = (math.pi / 2, 0, 0); o.scale = (1, 1, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for v in o.data.vertices: v.co.y *= sq           # 沿軸向壓長 → 環帶有寬度
    _fin(o, m, 0); return o
ZC = 2.0                                              # 圓環／船身中軸高度（與引擎錨點一致）
# ── 尾部大圓環＋輻條＋輪轂 ──
RY, RR = 32.0, 19.0
ring((0, RY, ZC), RR, 1.0, 2.2, 'hss_white')
ring((0, RY, ZC), RR - 2.6, 0.55, 3.0, 'hss_dark')
ring((0, RY - 1.4, ZC), 11.0, 0.5, 1.6, 'hss_white')
for k in range(36):                                   # 環上的分段飾板（橘白相間）
    a = k / 36 * math.tau; cx, cz = math.cos(a) * (RR + 1.05), math.sin(a) * (RR + 1.05)
    box((cx, RY, ZC + cz), (0.7, 2.6 if k % 2 else 3.4, 2.2), 'hss_orange' if k % 3 == 0 else 'hss_dark', 0.06, rot=(0, -a, 0))
for k in range(6):                                    # 六根輻條（寬板）
    a = k / 6 * math.tau + 0.26; Lr = RR - 6.0
    box((math.cos(a) * (6 + Lr / 2 + 0.2), RY - 0.3, ZC + math.sin(a) * (6 + Lr / 2 + 0.2)), (Lr, 1.1, 1.0), 'hss_white', 0.12, rot=(0, -a, 0))
    box((math.cos(a) * (RR - 3.0), RY - 0.3, ZC + math.sin(a) * (RR - 3.0)), (3.0, 1.3, 1.25), 'hss_dark', 0.1, rot=(0, -a, 0))
cyl((0, RY, ZC), 6.2, 9.0, 'hss_white', 'Y', 32, bevel=0.2)                    # 輪轂
cyl((0, RY + 4.6, ZC), 5.2, 0.8, 'hss_dark', 'Y', 32)
for x, z, r in ((0, 0, 1.7), (-2.3, 0.0, 1.2), (2.3, 0.0, 1.2)):                 # 三具引擎噴口（藍色光）
    cyl((x, RY + 5.6, ZC + z - 0.0), r + 0.5, 1.4, 'hss_dark', 'Y', 20, r2=r + 0.2)
    cyl((x, RY + 6.4, ZC + z), r * 0.8, 0.4, 'hss_blue', 'Y', 20)
for k in range(8):                                    # 輪轂周圍的小推進器
    a = k / 8 * math.tau; cyl((math.cos(a) * 5.2, RY - 4.8, ZC + math.sin(a) * 5.2), 0.5, 1.2, 'hss_dark', 'Y', 10)
# ── 主艦體：由尾到頭 ──
box((0, 24.0, ZC + 0.5), (9.0, 8.0, 7.5), 'hss_dark', 0.35)                       # 動力艙（深灰）
box((0, 24.0, ZC + 4.55), (6.8, 6.5, 0.5), 'hss_white', 0.1)
for s in (-1, 1):
    box((s * 4.55, 24.0, ZC + 0.5), (0.25, 7.0, 3.0), 'hss_orange', 0.04)
box((0, 6.5, ZC + 0.6), (7.0, 28.0, 6.0), 'hss_white', 0.45)                     # 長主梁（白陶瓷）
box((0, 6.5, ZC + 3.9), (5.2, 25.0, 0.8), 'hss_white', 0.2)
for k in range(8):                                    # 背部分段裝甲槽（深灰縫）
    box((0, -4.5 + k * 3.6, ZC + 3.4), (6.2, 0.35, 0.5), 'hss_dark', 0.05)
for s in (-1, 1):                                     # 兩側橘色飾板（長條）＋深灰側裙
    box((s * 3.58, 8.0, ZC + 0.6), (0.3, 22.0, 2.2), 'hss_orange', 0.05)
    box((s * 3.62, -2.5, ZC - 1.8), (0.4, 14.0, 1.0), 'hss_dark', 0.05)
    for k in range(5):
        box((s * 3.7, 16.0 - k * 4.4, ZC + 0.6), (0.45, 0.25, 2.8), 'hss_dark', 0.03)
box((0, -12.0, ZC - 0.6), (6.0, 20.0, 5.0), 'hss_white', 0.45)                    # 前段艦體
box((0, -22.0, ZC - 0.2), (8.4, 3.0, 5.6), 'hss_dark', 0.25)                      # 前段過渡環
box((0, -29.0, ZC - 0.4), (5.0, 14.0, 4.4), 'hss_white', 0.4)                     # 艦首
box((0, -38.0, ZC - 0.5), (7.0, 6.2, 4.2), 'hss_dark', 0.3)                       # 艦首黑色方塊（甲板導引光端）
box((0, -41.0 + 0.0, ZC - 0.5), (4.6, 0.3, 0.5), 'hss_blue', 0.02)
for s in (-1, 1):
    box((s * 2.4, -35.0, ZC + 1.65), (0.5, 4.0, 0.2), 'hss_blue', 0.02)           # 甲板導引光條
# ── 艦橋（中前段，視點約 y=−9）──
box((0, -9.0, ZC + 4.4), (4.2, 8.0, 2.2), 'hss_white', 0.3)
box((0, -9.0, ZC + 5.9), (3.0, 5.0, 1.2), 'hss_dark', 0.2)
box((0, -12.8, ZC + 5.9), (2.6, 0.25, 0.7), 'hss_window', 0.03)
for s in (-1, 1): box((s * 2.15, -9.0, ZC + 4.6), (0.15, 6.0, 0.55), 'hss_window', 0.02)
cyl((0, -7.0, ZC + 7.2), 0.15, 5.0, 'hss_dark', 'Z', 8)                            # 天線
cyl((0, -9.0, ZC + 8.0), 0.9, 0.3, 'hss_white', 'Z', 16)
cyl((0.0, -9.0, ZC + 7.4), 0.12, 1.4, 'hss_dark', 'Z', 8)
# ── 砲塔（錨點：y=21、15、−11；Z 約 7.4~8.1）──
for y in (21.0, 15.0, -11.0):
    zt = ZC + (4.6 if y > 0 else 3.2)
    cyl((0, y, zt), 1.4, 0.9, 'hss_dark', 'Z', 16); cyl((0, y, zt + 0.7), 0.9, 0.9, 'hss_white', 'Z', 16)
    cyl((0, y - 1.3, zt + 0.8), 0.18, 2.4, 'hss_dark', 'Y', 8)
# ── 太陽能板臂（艦體左右兩側，y≈4）──
for s in (-1, 1):
    box((s * 5.2, 4.0, ZC), (3.6, 1.6, 1.6), 'hss_white', 0.2)
    cyl((s * 9.0, 4.0, ZC), 0.45, 8.0, 'hss_dark', 'X', 12)
    for k, yy in enumerate((-1.0, 9.0)):
        box((s * 13.4, yy + 0.0, ZC), (6.4, 8.2, 0.22), 'hss_solar', 0.04)
        box((s * 13.4, yy, ZC), (6.6, 0.3, 0.30), 'hss_white', 0.03)
        box((s * 13.4, yy + 4.2, ZC), (6.6, 0.25, 0.3), 'hss_dark', 0.03)
        box((s * 13.4, yy - 4.2, ZC), (6.6, 0.25, 0.3), 'hss_dark', 0.03)
    box((s * 16.5, 4.0, ZC), (0.3, 20.0, 0.4), 'hss_orange', 0.03)
# ── 天線陣與紅色航行燈 ──
for (x, y, z, h) in ((2.6, 12, 6.0, 5.0), (-2.6, 27, 6.0, 4.0), (0.0, 29.5, 5.5, 7.0), (1.8, -26, 3.8, 4.0), (-1.8, -20, 4.0, 5.5), (3.0, 0, 5.0, 3.0)):
    cyl((x, y, ZC + z + h / 2 - 1), 0.12, h, 'hss_dark', 'Z', 8)
    box((x, y, ZC + z + h - 0.8), (0.3, 0.3, 0.3), 'hss_red', 0.0)
for (x, y, z) in ((0, -41.2, ZC + 1.6), (0, -41.2, ZC - 2.6), (4.6, 24, ZC + 4), (-4.6, 24, ZC + 4), (0, 32, ZC + RR + 1.5), (0, 32, ZC - RR - 1.5),
                  (RR + 1.5, 32, ZC), (-RR - 1.5, 32, ZC), (16.8, 4.0, ZC), (-16.8, 4.0, ZC)):
    box((x, y, z), (0.45, 0.45, 0.45), 'hss_red', 0.0)
# ── 合併 + 盒狀 UV（每約 6 單位一個磁磚）──
bpy.ops.object.select_all(action='DESELECT')
allo = [o for k in objs for o in objs[k]]
for o in allo: o.select_set(True)
bpy.context.view_layer.objects.active = allo[0]
bpy.ops.object.join(); hull = bpy.context.active_object; hull.name = 'HSS_Station'
mats = [m.name for m in hull.data.materials]; print('materials', mats)
bm = bmesh.new(); bm.from_mesh(hull.data); bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
for f in bm.faces: f.smooth = False
uvl = bm.loops.layers.uv.verify(); TILE = 6.0
for f in bm.faces:
    n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
    for l in f.loops:
        p = l.vert.co
        l[uvl].uv = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
        l[uvl].uv = (l[uvl].uv[0] / TILE, l[uvl].uv[1] / TILE)
bm.to_mesh(hull.data); bm.free()
print('faces', len(hull.data.polygons))
for n, g in {'HP_ENGINE_1': (0, RY + 6.0, ZC), 'HP_ENGINE_2': (-2.3, RY + 6.0, ZC), 'HP_ENGINE_3': (2.3, RY + 6.0, ZC),
             'HP_GUN_1': (0, 21, ZC + 6.2), 'HP_GUN_2': (0, 15, ZC + 6.2), 'HP_GUN_3': (0, -11, ZC + 4.8), 'HP_COCKPIT': (0, -9.0, ZC + 5.0)}.items():
    e = bpy.data.objects.new(n, None); bpy.context.scene.collection.objects.link(e); e.location = g
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_image_format='NONE')
print('exported', DST)
