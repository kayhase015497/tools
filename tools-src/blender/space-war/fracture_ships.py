"""艦艇斷裂方案生成：把完整艦沿長軸切成 2~4 塊（乾脆的大塊），斷口補蓋並做出凹凸不平的斷面。
用法：python -I fracture_ships.py <ship> [<ship>...]      （ship：cruiser、ipc）
輸出：godot/assets/models/frag/<ship>_frag_<方案>.glb（無貼圖；材質依名稱對應回完整艦：原艦體材質＋ break_face 斷面材質）
每個方案是一份 GLB，內含 Mesh 物件 FRAG<i>_<原物件名> 與 Empty FRAG<i>（塊的質心）。座標與完整艦相同。
方案：同一艘船 3 套（A：2 塊、B：3 塊、C：4 塊），切面帶亂數傾斜與雜訊起伏。"""
import bpy, bmesh, sys, math, random
from mathutils import Vector, noise

OUT = '/home/user/tools/godot/assets/models/frag'
PLANS = {'A': 2, 'B': 3, 'C': 4}

def load(ship):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f'/home/user/tools/assets/space-war/models/{ship}.glb')
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def break_material():
    m = bpy.data.materials.get('break_face') or bpy.data.materials.new('break_face')
    m.use_nodes = True
    return m

def make_chunk(src_obj, planes, lo, hi, tag, seed):
    """從 src_obj 複製出「平面 lo 與 hi 之間」的一塊（lo/hi 為 None 表示艦首／艦尾端）。"""
    rnd = random.Random(seed)
    me = src_obj.data.copy()
    bm = bmesh.new(); bm.from_mesh(me)
    bm.transform(src_obj.matrix_world)
    if len(me.materials) == 0: me.materials.append(None)
    bmat = break_material()
    me.materials.append(bmat); break_idx = len(me.materials) - 1
    uv = bm.loops.layers.uv.verify()
    cap_faces = []
    for plane, keep in ((lo, 'above'), (hi, 'below')):
        if plane is None: continue
        co, no = plane
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_inner=(keep == 'above'), clear_outer=(keep == 'below'))
        cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if not cut: continue
        fill = bmesh.ops.holes_fill(bm, edges=cut, sides=0)
        faces = fill['faces'] or []
        if not faces:
            fill = bmesh.ops.edgenet_fill(bm, edges=cut, mat_nr=break_idx)
            faces = fill['faces']
        for f in faces:
            f.material_index = break_idx
            cap_faces.append((f, co, no))
    # 斷面：細分 + 沿法線的雜訊位移（凹凸不平），並內縮一圈做出「撕裂邊」
    for f, co, no in cap_faces:
        if not f.is_valid: continue
        try:
            res = bmesh.ops.triangulate(bm, faces=[f])
            tris = res['faces']
        except Exception:
            tris = [f]
        for _ in range(3):
            edges = list({e for t in tris if t.is_valid for e in t.edges})
            r = bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
            tris = [x for x in r['geom_inner'] + r['geom'] if isinstance(x, bmesh.types.BMFace) and x.is_valid]
        n = Vector(no).normalized()
        for t in tris:
            t.material_index = break_idx
        verts = {v for t in tris if t.is_valid for v in t.verts}
        for v in verts:
            # 只位移沒有被鄰接「外表面」共用的內部頂點，避免外殼被撕開：邊界頂點保持不動
            if any(ff.material_index != break_idx for ff in v.link_faces):
                continue
            nz = noise.noise(v.co * 0.9 + Vector((seed, 0, 0)))
            v.co += n * (nz * 0.55 + rnd.uniform(-0.05, 0.05)) * (1 if 'hi' in tag else -1)
    # 斷面 UV：投影到切面（供 Godot 的斷面高度圖／餘燼用）
    for f in bm.faces:
        if f.material_index == break_idx:
            for l in f.loops:
                l[uv].uv = (l.vert.co.x * 0.12 + 0.5, l.vert.co.z * 0.12 + 0.5)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(tag + '_' + src_obj.name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj

def build(ship, plan, n):
    seed = hash((ship, plan)) % 1000 + 7
    rnd = random.Random(seed)
    srcs = load(ship)
    ys = [v.co.y for o in srcs for v in o.data.vertices]
    y0, y1 = min(ys), max(ys)
    # n-1 個切面，沿 Y（長軸）等分後加亂數偏移；法線帶亂數傾斜
    planes = []
    for i in range(1, n):
        t = i / n + rnd.uniform(-0.08, 0.08)
        no = Vector((rnd.uniform(-0.35, 0.35), 1.0, rnd.uniform(-0.3, 0.3))).normalized()
        planes.append((Vector((0, y0 + (y1 - y0) * t, 0)), no))
    chunks = []
    for ci in range(n):
        lo = planes[ci - 1] if ci > 0 else None
        hi = planes[ci] if ci < n - 1 else None
        for o in srcs:
            obj = make_chunk(o, planes, lo, hi, f'FRAG{ci}', seed + ci)
            chunks.append((ci, obj))
    # 質心 Empty
    for ci in range(n):
        objs = [ob for c, ob in chunks if c == ci]
        pts = [ob.matrix_world @ v.co for ob in objs for v in ob.data.vertices]
        if not pts: continue
        cen = sum(pts, Vector()) / len(pts)
        e = bpy.data.objects.new(f'FRAG{ci}', None); e.location = cen
        bpy.context.scene.collection.objects.link(e)
    for o in srcs: bpy.data.objects.remove(o, do_unlink=True)
    for ob in list(bpy.context.scene.objects):   # 清掉匯入的 Empty（HP_*）以外的原物件已移除；錨點保留在完整艦 GLB，不需要複製
        if ob.type == 'EMPTY' and ob.name.startswith('HP_'): bpy.data.objects.remove(ob, do_unlink=True)
    import os; os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{ship}_frag_{plan}.glb', export_format='GLB', export_image_format='NONE', export_materials='EXPORT', use_selection=False)
    print('exported', ship, plan, n)

if __name__ == '__main__':
    ships = [a for a in sys.argv[sys.argv.index('--') + 1:] if a] if '--' in sys.argv else sys.argv[1:]
    for ship in ships or ['cruiser', 'ipc']:
        for plan, n in PLANS.items():
            build(ship, plan, n)
