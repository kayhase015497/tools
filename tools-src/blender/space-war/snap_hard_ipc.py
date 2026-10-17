"""IPC 巡洋艦「硬表面化」：把 TRIPO 磨圓的平面拉回平整、把圓角收成銳利稜線。
做法（不改拓樸、不重烘貼圖，UV 與貼圖原樣保留）：
  1. 依面法線把面歸入 ±X／±Y／±Z 六個軸向（夾角 < ANGLE 度才算），相鄰且同軸向的面連成「平面區」。
  2. 面積夠大的平面區，把區內所有頂點在該軸向上對齊到同一個平面位置（面積加權平均）→ 平的地方變平、方的地方變方。
     兩個不同軸向的平面區相鄰時，共用頂點會同時被兩個平面約束，自然落在兩平面的交線上 → 圓角變成銳利稜線。
  3. 其餘小細節不動；再以「依角度的平滑」重算法線，平面保持平，稜線保持硬。
用法：python snap_hard_ipc.py <輸入.glb> <輸出.glb> [--smooth=18] [--rough=0.55] [--metal=0.12] [--keepNormalMap]
  對齊分兩輪：先較寬鬆抓大平面（32°、面積 0.25），再較嚴格抓小平面（22°、面積 0.08）"""
import sys, os, math
import numpy as np
import bpy

src, dst = sys.argv[1], sys.argv[2]
opt = {a.split('=')[0]: (a.split('=')[1] if '=' in a else True) for a in sys.argv[3:] if a.startswith('--')}
PASSES = [(32, 0.25), (22, 0.08)]; MAXMOVE = float(opt.get('--maxmove', 0.4)); SMOOTH = float(opt.get('--smooth', 18)); ROUGH = float(opt.get('--rough', 0.55)); METAL = float(opt.get('--metal', 0.12))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
hull = [o for o in sc.objects if o.type == 'MESH'][0]
for o in sc.objects: o.parent = None if o.type in ('EMPTY', 'MESH') else o.parent
bpy.context.view_layer.objects.active = hull; bpy.ops.object.select_all(action='DESELECT'); hull.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = hull.data; nv = len(me.vertices)
P = np.empty(nv * 3, np.float64); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
nf = len(me.polygons); F = np.array([list(p.vertices) for p in me.polygons], dtype=np.int64)   # 已三角化（匯入時）
assert F.shape[1] == 3, 'need triangles'
# 焊接：同位置的頂點視為同一個（UV 縫會造成重複頂點）
key = np.round(P * 1e4).astype(np.int64); _, uid, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1)
Pu = P[uid]; Fu = inv[F]
A, B, C = Pu[Fu[:, 0]], Pu[Fu[:, 1]], Pu[Fu[:, 2]]; Nn = np.cross(B - A, C - A); area = np.linalg.norm(Nn, axis=1) * 0.5; Nn /= (np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-12)
axes = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], float)


def snap_pass(Pu, angle, minarea):
    A, B, C = Pu[Fu[:, 0]], Pu[Fu[:, 1]], Pu[Fu[:, 2]]; Nn = np.cross(B - A, C - A); area = np.linalg.norm(Nn, axis=1) * 0.5; Nn /= (np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-12)
    dots = Nn @ axes.T; lab = dots.argmax(1); ok = dots.max(1) > math.cos(math.radians(angle)); lab[~ok] = -1
    parent = np.arange(nf)

    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for fs in edge.values():
        for i in range(len(fs)):
            for j in range(i + 1, len(fs)):
                if lab[fs[i]] >= 0 and lab[fs[i]] == lab[fs[j]]: parent[find(fs[i])] = find(fs[j])
    roots = np.array([find(i) for i in range(nf)])
    snap_sum = np.zeros((len(Pu), 3)); snap_w = np.zeros((len(Pu), 3)); nreg = 0; cover = 0.0
    for r in np.unique(roots[lab >= 0]):
        fm = np.where(roots == r)[0]; ar = area[fm].sum()
        if ar < minarea: continue
        d = int(np.abs(axes[lab[fm[0]]]).argmax()); cen = (A[fm, d] + B[fm, d] + C[fm, d]) / 3.0; off = float((cen * area[fm]).sum() / ar)
        vs = np.unique(Fu[fm].ravel()); snap_sum[vs, d] += off * ar; snap_w[vs, d] += ar; nreg += 1; cover += ar
    Pn = Pu.copy(); m = snap_w > 0; Pn[m] = snap_sum[m] / snap_w[m]
    dd = Pn - Pu; ln = np.linalg.norm(dd, axis=1, keepdims=True); Pn = Pu + dd * np.minimum(1.0, MAXMOVE / np.maximum(ln, 1e-9))   # 單輪位移上限，避免被兩個互相衝突的平面拉成長刺
    print('pass angle %.0f area %.2f: regions %d covered %.1f/%.1f, vertices moved %d' % (angle, minarea, nreg, cover, area.sum(), (np.linalg.norm(Pn - Pu, axis=1) > 1e-6).sum()))
    return Pn


edge = {}
for fi in range(nf):
    for k in range(3):
        a, b = int(Fu[fi, k]), int(Fu[fi, (k + 1) % 3]); edge.setdefault((min(a, b), max(a, b)), []).append(fi)
Pn = Pu
for ang, ar in PASSES: Pn = snap_pass(Pn, ang, ar)
P2 = Pn[inv]; me.vertices.foreach_set('co', P2.ravel()); me.update()
for mat in me.materials:   # 硬表面的高光不要太油亮
    for nd in mat.node_tree.nodes:
        if nd.type == 'BSDF_PRINCIPLED': nd.inputs['Roughness'].default_value = ROUGH; nd.inputs['Metallic'].default_value = METAL
# 依角度平滑法線（平面保持平、稜線保持硬）
for p in me.polygons: p.use_smooth = True
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SMOOTH))
if '--keepNormalMap' not in opt:   # 法線貼圖是依舊形狀烘的，形狀硬化後會與新表面打架：拿掉，改靠幾何與底色貼圖
    for mat in me.materials:
        for nd in list(mat.node_tree.nodes):
            if nd.type == 'NORMAL_MAP':
                for lk in list(mat.node_tree.links):
                    if lk.to_node == nd or lk.from_node == nd: mat.node_tree.links.remove(lk)
                mat.node_tree.nodes.remove(nd)
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects: o.select_set(o.type in ('MESH', 'EMPTY'))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, export_image_format='JPEG', export_jpeg_quality=88)
print('exported', dst, os.path.getsize(dst))
