"""仙舟無畏艦（Desktop 版 xzd_new.glb）收尾，依使用者提供的美術圖修正圓環：
  1. 圓環上方的兩顆青綠球體：TRIPO 做成「托在實心碟子裡」。改成「浮空飄在環形框框裡」：
     移除球與碟子與周邊環片，改放：青綠發光球體＋細環形框（torus）＋左右兩小段連接，球與框不相連。
  2. 圓環頂端中央：補上美術圖有的綠色發光膠囊（深色外框＋綠色發光內芯），環片在此留出缺口。
  3. 補上砲塔錨點 HP_GUN_1..8（甲板中線）與飛彈錨點 HP_MSL_1/2；引擎錨點沿用 Desktop 的。
用法：python finish_xzd.py <輸入.glb> <輸出.glb>
座標：下面以 glTF 座標（x 右、y 上、+z 艦首）書寫，內部轉成 Blender（x, −z, y）。"""
import sys, os, math
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix

src, dst = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
objs = {o.name: o for o in sc.objects}
ring = [o for o in sc.objects if o.type == 'MESH' and 'Ring' in o.name][0]
to_b = lambda p: (p[0], -p[2], p[1])                       # glTF → Blender
to_g = lambda v: (v[0], v[2], -v[1])                       # Blender → glTF

# ── 1/2. 圓環：切掉球體＋碟子＋頂端缺口 ──
SPH = [(-10.9, 14.0, -17.2), (10.9, 14.0, -17.2)]; CLIP = 3.7; RING_C = (-0.03, -1.4, -17.96)
bm = bmesh.new(); bm.from_mesh(ring.data); mw = ring.matrix_world
kill = []
for f in bm.faces:
    g = to_g(mw @ f.calc_center_median())
    near = any(math.dist(g, s) < CLIP for s in SPH)
    top = abs(g[0]) < 2.1 and g[1] > 14.0
    if near or top: kill.append(f)
bmesh.ops.delete(bm, geom=kill, context='FACES')
loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
bm.to_mesh(ring.data); bm.free(); print('ring faces removed', len(kill))

# ── 新增幾何 ──
def mat(name, base, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = base; b.inputs['Roughness'].default_value = 0.4; b.inputs['Metallic'].default_value = 0.3
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = strength
    return m
M_TEAL = mat('xz_teal', (0.02, 0.22, 0.25, 1), (0.05, 0.55, 0.55, 1), 0.35)
M_GREEN = mat('xz_green', (0.03, 0.2, 0.06, 1), (0.25, 1.0, 0.4, 1), 1.4)
M_DARK = mat('xz_frame', (0.05, 0.06, 0.08, 1))

def add(obj_name, mesh_op, loc_g, m, rot=(0, 0, 0), scale=(1, 1, 1)):
    mesh_op(); o = bpy.context.active_object; o.name = obj_name; o.location = to_b(loc_g); o.rotation_euler = rot; o.scale = scale
    o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o

for i, s in enumerate(SPH):
    sg = 1 if s[0] > 0 else -1
    add('XZ_Sphere%d' % i, lambda: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=1.7), s, M_TEAL)
    # 環形框：圓環所在平面（法線 = 艦首軸），球位於框中心，球與框之間是空的
    add('XZ_Frame%d' % i, lambda: bpy.ops.mesh.primitive_torus_add(major_radius=2.75, minor_radius=0.24, major_segments=40, minor_segments=8), s, M_DARK, rot=(math.radians(90), 0, 0))
    # 左右各一小段連接，接回被切開的大環（沿環的切線方向）
    cx, cy = s[0] - RING_C[0], s[1] - RING_C[1]; r = math.hypot(cx, cy); tx, ty = -cy / r, cx / r
    for k in (-1, 1):
        mid = (s[0] + k * tx * 3.25, s[1] + k * ty * 3.25, RING_C[2])
        ang = math.atan2(ty, tx)
        add('XZ_Link%d_%d' % (i, k), lambda: bpy.ops.mesh.primitive_cube_add(size=1), mid, M_DARK, rot=(0, 0, ang), scale=(1.4, 0.45, 0.45))
# 頂端中央膠囊：深色外框＋綠色發光內芯
TOP = (0.0, 18.6, RING_C[2])
add('XZ_CapsuleFrame', lambda: bpy.ops.mesh.primitive_cube_add(size=1), TOP, M_DARK, scale=(1.0, 5.4, 0.9))
cap = add('XZ_Capsule', lambda: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.42), TOP, M_GREEN, scale=(1.0, 4.6, 1.0))
cap.location.z += -0.0; bpy.context.view_layer.update()
# 把膠囊外框的前後面稍微凸出，讓綠色內芯露出（內芯較厚）
cap.scale = (1.0, 4.3, 1.5)

# ── 3. 錨點 ──
def anchor(name, g):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = to_b(g); e.empty_display_type = 'PLAIN_AXES'
for i, z in enumerate((30, 24, 18, 12, 6, 0, -6, -12)): anchor('HP_GUN_%d' % (i + 1), (0.0, 3.2, float(z)))
anchor('HP_MSL_1', (-8.0, 1.2, 10.0)); anchor('HP_MSL_2', (8.0, 1.2, 10.0))

bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects: o.select_set(o.type in ('MESH', 'EMPTY'))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, export_image_format='JPEG', export_jpeg_quality=90)
print('exported', dst, os.path.getsize(dst))
