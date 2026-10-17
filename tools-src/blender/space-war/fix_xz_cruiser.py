"""把 TRIPO 產生的仙舟巡洋艦（XZ_Cruiser）整理成遊戲用的 GLB：
  1. 依美術圖補上大量螢光青藍飾條（發光幾何：鋒利稜線＋艦首雙叉＋舷側）
  2. 重新擺放錨點（砲塔、艦首雙叉砲口、尾部引擎）
用法：python fix_xz_cruiser.py <輸入.glb> <輸出.glb> [--debug]
  需要 bpy（pip install bpy）。座標：glTF（x 右、y 上、+z 艦首）。"""
import sys, os, math, json, struct
import numpy as np
import bpy

src, dst = sys.argv[1], sys.argv[2]
DEBUG = '--debug' in sys.argv


def load_gltf_arrays(p):   # 直接讀 GLB 的頂點／索引（glTF 座標）
    d = open(p, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + l]); bl = struct.unpack('<I', d[20 + l:24 + l])[0]; b = d[28 + l:28 + l + bl]
    P, I, base = [], [], 0
    for me in j['meshes']:
        for pr in me['primitives']:
            a = j['accessors'][pr['attributes']['POSITION']]; bv = j['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', 12)
            P.append(np.frombuffer(b, dtype=np.uint8, count=a['count'] * st, offset=off).reshape(a['count'], st)[:, :12].copy().view('<f4').reshape(-1, 3))
            a = j['accessors'][pr['indices']]; bv = j['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
            dt = {5123: '<u2', 5125: '<u4', 5121: 'u1'}[a['componentType']]
            I.append(np.frombuffer(b, dtype=dt, count=a['count'], offset=off).astype(np.int64).reshape(-1, 3) + base); base += a['count'] if False else len(P[-1])
    return np.vstack(P), np.vstack(I)


V, F = load_gltf_arrays(src)

# ── 合併重複頂點（UV 縫），好找出相鄰面 ──
key = np.round(V * 1e4).astype(np.int64); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1)
Vu = np.zeros((inv.max() + 1, 3)); Vu[inv] = V; Fu = inv[F]
A, B, C = Vu[Fu[:, 0]], Vu[Fu[:, 1]], Vu[Fu[:, 2]]; N = np.cross(B - A, C - A); N /= (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)
edges = {}
for fi, f in enumerate(Fu):
    for k in range(3):
        a, b = int(f[k]), int(f[(k + 1) % 3]); edges.setdefault((min(a, b), max(a, b)), []).append(fi)

# ── 鋒利稜線：兩面夾角大、且夠長 ──
sharp = []
for (a, b), fs in edges.items():
    if len(fs) != 2: continue
    ang = math.degrees(math.acos(float(np.clip(np.dot(N[fs[0]], N[fs[1]]), -1, 1))))
    ln = float(np.linalg.norm(Vu[a] - Vu[b]))
    if ang > 85 and ln > 0.22: sharp.append((a, b, ang, ln))
print('sharp edges', len(sharp))

# ── 手工飾條折線（沿艦首雙叉與舷側的最外緣）──
def outline(zs, xs_filter, ysel):
    pts = []
    for t in zs:
        m = (np.abs(V[:, 2] - t) < 0.3) & xs_filter(V)
        if m.sum() < 3: continue
        pts.append((t, m))
    return pts
polys = []
for sg in (1, -1):
    # 艦首雙叉的上稜線
    pl = []
    for t in np.arange(10.7, 4.0, -0.35):
        m = (np.abs(V[:, 2] - t) < 0.35) & (V[:, 0] * sg > 0.7) & (V[:, 0] * sg < 1.9)
        if m.sum() >= 3: pl.append((V[m, 0].mean(), V[m, 1].max() + 0.015, t))
    if len(pl) > 3: polys.append(pl)
    # 舷側主稜線（中段船身最外緣、高度約 y=0.2~0.8）
    pl = []
    for t in np.arange(5.5, -7.5, -0.4):
        m = (np.abs(V[:, 2] - t) < 0.3) & (V[:, 0] * sg > 0.2) & (V[:, 1] > -0.4) & (V[:, 1] < 1.0)
        if m.sum() >= 5: xo = np.percentile(np.abs(V[m, 0]), 92); pl.append((sg * (xo + 0.01), 0.35, t))
    if len(pl) > 3: polys.append(pl)
    # 舷側下緣與上緣各一條，與主稜線形成多條平行的螢光飾條（美術圖上很多條）
    for yo, lo, hi in ((0.85, 0.4, 1.4), (-0.35, -1.0, -0.1)):
        pl = []
        for t in np.arange(4.5, -7.0, -0.45):
            m = (np.abs(V[:, 2] - t) < 0.3) & (V[:, 0] * sg > 0.2) & (V[:, 1] > lo) & (V[:, 1] < hi)
            if m.sum() >= 5: xo = np.percentile(np.abs(V[m, 0]), 90); pl.append((sg * (xo + 0.01), yo, t))
        if len(pl) > 3: polys.append(pl)


def bar_mesh(segs, r):   # 每段一根細方柱（8 個三角面）
    verts, faces = [], []
    for p0, p1 in segs:
        p0 = np.array(p0, float); p1 = np.array(p1, float); d = p1 - p0; L = np.linalg.norm(d)
        if L < 1e-4: continue
        d /= L; up = np.array([0, 1, 0.0]) if abs(d[1]) < 0.9 else np.array([1, 0, 0.0]); s = np.cross(d, up); s /= np.linalg.norm(s); u = np.cross(s, d)
        base = len(verts)
        for p in (p0, p1):
            for a, b in ((1, 1), (-1, 1), (-1, -1), (1, -1)): verts.append(tuple(p + r * (a * s + b * u)))
        for k in range(4):
            k2 = (k + 1) % 4; faces.append((base + k, base + k2, base + 4 + k2, base + 4 + k))
    return verts, faces


segs = []
for pl in polys:
    for i in range(len(pl) - 1): segs.append((pl[i], pl[i + 1]))
for a, b, ang, ln in sharp: segs.append((tuple(Vu[a]), tuple(Vu[b])))
print('trim segments', len(segs))

# ── 貼圖調色：TRIPO 原貼圖整體太暗（平均亮度約 0.2），放進遊戲的光照下會融進太空背景。
#    灰色區域提亮並偏鋼藍（仙舟的深青藍艦體），紅色區域保留並略提亮、加飽和 ──
def grade_texture(glb, out_png):
    from PIL import Image
    d = open(glb, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + l]); bl = struct.unpack('<I', d[20 + l:24 + l])[0]; b = d[28 + l:28 + l + bl]
    bv = j['bufferViews'][j['images'][0]['bufferView']]; raw = b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    import io
    im = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).astype(np.float32) / 255
    lum = im.mean(axis=2, keepdims=True); red = np.clip((im[..., 0:1] - 1.3 * im[..., 1:2]) * 6, 0, 1)
    gray = np.clip(lum * 1.65, 0, 1) ** 0.9 * np.array([0.80, 1.0, 1.22], np.float32)
    redc = np.clip(im * np.array([1.9, 0.9, 0.9], np.float32), 0, 1)
    out = np.clip(gray * (1 - red) + redc * red, 0, 1)
    Image.fromarray((out * 255).astype(np.uint8)).save(out_png, quality=90) if out_png.endswith('.jpg') else Image.fromarray((out * 255).astype(np.uint8)).save(out_png)


# ── 進 Blender：匯入原模型、加飾條、改錨點、匯出 ──
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hull = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
tex_path = os.path.join(os.path.dirname(os.path.abspath(dst)), 'xz_basecolor_graded.png'); grade_texture(src, tex_path)
for m in hull.data.materials:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE':
            img = bpy.data.images.load(tex_path); img.colorspace_settings.name = 'sRGB'; nd.image = img
to_b = lambda p: (p[0], -p[2], p[1])   # glTF → Blender 座標（x, y, z）＝(x, −z, y)
verts, faces = bar_mesh([(to_b(a), to_b(b)) for a, b in segs], 0.035)
me = bpy.data.meshes.new('XZ_Trim'); me.from_pydata(verts, [], faces); me.update()
trim = bpy.data.objects.new('XZ_Trim', me); bpy.context.scene.collection.objects.link(trim)
mat = bpy.data.materials.new('trim'); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.02, 0.12, 0.16, 1); bsdf.inputs['Emission Color'].default_value = (0.25, 0.9, 1.0, 1); bsdf.inputs['Emission Strength'].default_value = 1.8
me.materials.append(mat)
ANCHORS = {   # glTF 座標（x, y, z）
    'HP_GUN_1': (0, 1.12, 3.5), 'HP_GUN_2': (0, 0.9, 1.0), 'HP_GUN_3': (-1.3, 0.45, 10.7), 'HP_GUN_4': (1.3, 0.45, 10.7),
    'HP_ENGINE_1': (0, 0.35, -8.3), 'HP_ENGINE_2': (-0.32, 0.35, -8.3), 'HP_ENGINE_3': (0.32, 0.35, -8.3)}
for o in bpy.context.scene.objects:
    if o.name in ANCHORS: o.parent = None; o.location = to_b(ANCHORS[o.name]); o.rotation_euler = (0, 0, 0)
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects: o.select_set(o.type in ('MESH', 'EMPTY'))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, export_image_format='JPEG', export_jpeg_quality=85)
print('exported', dst, os.path.getsize(dst))
