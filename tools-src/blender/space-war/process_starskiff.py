"""仙舟星槎（Starskiff，玩家與友軍戰機）整理：
  1. 移除貨艙的水果（橘紅、綠色果串）與兩側的橘色貨袋（含藍色綁帶）
  2. 刪除細小的繩索碎片、補平被移除物體留下的洞
  3. 擺正：原模型長軸在 X，轉成船頭朝 glTF +Z；加上錨點（槍口、引擎、座艙視點）
  4. 減面到約 TARGET 三角面（戰機數量多）；貼圖降為 1024 JPEG，去掉法線與金屬粗糙度貼圖（改用固定值）
用法：python process_starskiff.py <輸入.glb> <輸出.glb> [目標三角面=3500]"""
import sys, os, math, io
import numpy as np
import bpy, bmesh
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]; TARGET = int(sys.argv[3]) if len(sys.argv) > 3 else 3500
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
obj = [o for o in sc.objects if o.type == 'MESH'][0]; obj.parent = None
bpy.context.view_layer.objects.active = obj; bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mat = obj.data.materials[0]
base_img = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'Color' in n.image.name][0]
W, H = base_img.size; px = np.array(base_img.pixels[:], dtype=np.float32).reshape(H, W, 4)[..., :3]   # 注意：Blender 影像原點在左下
print('base', W, H, 'tris before', sum(len(p.vertices) - 2 for p in obj.data.polygons))

bm = bmesh.new(); bm.from_mesh(obj.data); uvl = bm.loops.layers.uv.active
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)   # 焊接 UV 縫造成的重複頂點（UV 存在面的角點上，不受影響）
to_g = lambda v: (v.x, v.z, -v.y)   # Blender → glTF 座標


def face_color(f):
    c = np.zeros(3)
    for lp in f.loops:
        u, v = lp[uvl].uv; c += px[min(H - 1, max(0, int(v * H))), min(W - 1, max(0, int(u * W)))]
    return c / len(f.loops)


def inbox(p, c, s, e): return all(abs(p[i] - c[i]) <= s[i] / 2 + e for i in range(3))


BAGS = [((-0.262, 0.179, -0.136), (0.158, 0.063, 0.033)), ((-0.265, 0.180, 0.135), (0.162, 0.062, 0.033))]   # 橘色貨袋（連藍色綁帶一起）
FRUIT = [((-0.004, 0.208, 0.0), (0.037, 0.027, 0.035)), ((0.209, 0.206, -0.003), (0.061, 0.024, 0.077)), ((0.130, 0.225, 0.0), (0.075, 0.050, 0.075))]   # 綠色果串、紅色水果（含裝水果的深色籃子）
kill = []
for f in bm.faces:
    cg = f.calc_center_median(); p = to_g(cg); col = face_color(f); r, g, b = col
    if any(inbox(p, c, s, 0.012) for c, s in BAGS): kill.append(f); continue
    fruitish = (g > r * 1.1 and g > b * 1.3 and g > 0.3) or (r > 0.6 and g < 0.35 and b < 0.35) or (r > 0.65 and 0.3 < g < 0.75 and b < 0.4 and r > g * 1.15)
    if any(inbox(p, c, s, 0.010) and (fruitish or p[1] > c[1] - s[1] / 2 + 0.002) for c, s in FRUIT): kill.append(f)   # 水果顏色的面，或高於箱底（籃壁、果實）的面
print('faces removed (bags + fruit):', len(kill))
bmesh.ops.delete(bm, geom=kill, context='FACES')

# 刪細小碎片（繩索）：以連通區塊計算
seen = set(); small = []
for v0 in bm.verts:
    if v0 in seen: continue
    stack = [v0]; comp = []; seen.add(v0)
    while stack:
        v = stack.pop(); comp.append(v)
        for e in v.link_edges:
            w = e.other_vert(v)
            if w not in seen: seen.add(w); stack.append(w)
    nf = len({f for v in comp for f in v.link_faces})
    if nf < 150: small.append(comp)
for comp in small: bmesh.ops.delete(bm, geom=[v for v in comp], context='VERTS')
print('small fragments removed:', len(small))
bm.verts.ensure_lookup_table()
# 補洞：邊界環 → 以環上 UV 平均值填平（顏色與周邊相近）
bound = [e for e in bm.edges if e.is_boundary]
res = bmesh.ops.holes_fill(bm, edges=bound, sides=24)
def px_at(uv): return px[min(H - 1, max(0, int(uv[1] * H))), min(W - 1, max(0, int(uv[0] * W)))]
for f in res['faces']:   # 補洞面的 UV：取周邊「最不鮮豔」（灰色船殼）的像素位置，避免補丁沾到果實的綠、紅、橘色
    us = [lp[uvl].uv.copy() for v in f.verts for lp in v.link_loops if lp.face not in res['faces'] and lp[uvl].uv.length > 0]
    if us:
        best = min(us, key=lambda u: (lambda c: (c.max() - c.min()) + abs(c.mean() - 0.3))(px_at(u)))
        for lp in f.loops: lp[uvl].uv = best
print('holes filled faces:', len(res['faces']))
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(obj.data); bm.free()
print('tris after cleanup', len(obj.data.polygons))

# 減面
ratio = min(1.0, TARGET / max(1, len(obj.data.polygons)))
if ratio < 1.0:
    m = obj.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; bpy.ops.object.modifier_apply(modifier='dec')
print('tris after decimate', len(obj.data.polygons))

# 擺正：原模型長軸在 X、船頭 +X；轉成船頭朝 glTF +Z（Blender −Y）。繞 Blender Z 轉 −90°
for v in obj.data.vertices: v.co.x, v.co.y = v.co.y, -v.co.x   # 繞 Blender Z 轉 −90°（直接改頂點，避免操作器依賴選取狀態）
bb = np.array([v.co[:] for v in obj.data.vertices]); mn, mx = bb.min(0), bb.max(0); ctr = (mn + mx) / 2
for v in obj.data.vertices: v.co -= type(v.co)(ctr)
obj.data.update(); obj.data.calc_loop_triangles()
bb = np.array([v.co[:] for v in obj.data.vertices]); mn, mx = bb.min(0), bb.max(0); print('size (blender xyz)', np.round(mx - mn, 3))

# 貼圖：底色降到 1024 JPEG；移除法線與金屬粗糙度貼圖
out_dir = os.path.dirname(os.path.abspath(dst)); small_png = os.path.join(out_dir, 'starskiff_base_1024.png')
# 貼圖上果實接觸甲板處有綠色、橘色的底色（烘焙的接觸陰影／殘色）：把綠色與橘色像素改成甲板的深灰，避免移除果實後留下色斑
r_, g_, b_ = px[..., 0], px[..., 1], px[..., 2]
fruit_px = ((g_ > r_ * 1.1) & (g_ > b_ * 1.3) & (g_ > 0.25)) | ((r_ > 0.55) & (g_ > 0.3) & (g_ < 0.8) & (b_ < 0.4) & (r_ > g_ * 1.15))
px2 = px.copy(); px2[fruit_px] = (0.30, 0.30, 0.32); print('texture pixels recoloured: %.2f%%' % (fruit_px.mean() * 100))
arr = (np.clip(px2, 0, 1) * 255).astype(np.uint8)[::-1]; Image.fromarray(arr).resize((1024, 1024), Image.LANCZOS).save(small_png)
nt = mat.node_tree; bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
for l in list(nt.links):
    if l.to_node == bsdf and l.to_socket.name in ('Normal', 'Metallic', 'Roughness'): nt.links.remove(l)
for n in list(nt.nodes):
    if n.type in ('NORMAL_MAP',) or (n.type == 'TEX_IMAGE' and n.image and 'Color' not in n.image.name): nt.nodes.remove(n)
bsdf.inputs['Metallic'].default_value = 0.15; bsdf.inputs['Roughness'].default_value = 0.6
for n in nt.nodes:
    if n.type == 'TEX_IMAGE': n.image = bpy.data.images.load(small_png); n.image.colorspace_settings.name = 'sRGB'

# 錨點：原座標（x 長軸，+x 船頭）→ 新 glTF 座標 (x', y, z') = (−z, y, x)，再扣掉置中位移；glTF→Blender = (X, −Z, Y)
def anchor(name, o):   # o 為原模型 glTF 座標
    gx, gy, gz = -o[2], o[1], o[0]; e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = (gx, -gz, gy)
    e.location.x -= ctr[0]; e.location.y -= ctr[1]; e.location.z -= ctr[2]; e.empty_display_type = 'PLAIN_AXES'
for n, o in {'HP_GUN_1': (0.28, 0.22, 0.05), 'HP_GUN_2': (0.28, 0.22, -0.05), 'HP_GUN_3': (0.14, 0.20, 0.10), 'HP_GUN_4': (0.14, 0.20, -0.10),
             'HP_ENGINE_1': (-0.485, 0.235, 0.0), 'HP_ENGINE_2': (-0.37, 0.12, 0.0), 'HP_COCKPIT': (0.22, 0.30, 0.0)}.items(): anchor(n, o)
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects: o.select_set(o.type in ('MESH', 'EMPTY'))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, export_image_format='JPEG', export_jpeg_quality=88)
print('exported', dst, os.path.getsize(dst))
