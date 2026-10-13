"""
shiplib.py — 太空戰艦艇建模共用函式庫（Blender / bpy）

用法與座標約定
--------------
* 建模時使用「模型座標」：x = 右、f = 前（Blender 的 +Y）、z = 上。
  匯出前整個模型會繞 Z 軸轉 180 度，使「前方」落在 Blender -Y，
  經 glTF 匯出器（Z-up -> Y-up）後，前方 = glTF / three.js 的 +Z，
  與遊戲模擬層（rotation.y = 航向，前方 = +Z）一致。
* 材質顏色以「顯示色」直接填入（遊戲端 renderer 使用 Linear 輸出，不做 sRGB 轉換）。
* 「錨點」（hardpoint）以 Empty 匯出，命名規則：
    HP_COCKPIT      第一人稱視角位置（未來飛船駕駛艙）
    HP_ENGINE_n     引擎噴口（引擎光暈、尾跡粒子）
    HP_GUN_n        砲口（光束／曳光彈起點）
    HP_NAV_n        航行燈
  遊戲端讀取這些節點的位置，因此新增或移動錨點不需要改程式。
* 本檔不依賴 GUI，可用 `pip install bpy` 的 headless 版本執行，
  也可在 Blender GUI（或 Blender MCP）中貼上執行。
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, noise


# ───────────────────────── 材質 ─────────────────────────
def make_mat(name, color, metallic=0.5, rough=0.5, emit=None, emit_strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (emit[0], emit[1], emit[2], 1.0)
        b.inputs['Emission Strength'].default_value = emit_strength
    else:
        b.inputs['Emission Strength'].default_value = 0.0
    return m


def hexc(h):
    """'#rrggbb' -> (r, g, b)，0~1，不做色彩空間轉換。"""
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ───────────────────────── 建模器 ─────────────────────────
class ShipBuilder:
    def __init__(self, name, materials):
        """materials: {鍵: bpy 材質}（順序即材質槽順序）"""
        self.name = name
        self.bm = bmesh.new()
        self.mats = list(materials.items())
        self.idx = {k: i for i, (k, _) in enumerate(self.mats)}
        self.anchors = []

    # ── 內部：加入頂點／面 ──
    def _verts(self, pts):
        return [self.bm.verts.new(Vector(p)) for p in pts]

    def _face(self, verts, mat, smooth=False):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.material_index = self.idx[mat]
        f.smooth = smooth
        return f

    # ── 放樣艦體：sections = [(f, 半寬, 上高, 下高, 中心z, 方度p), ...] ──
    def loft(self, sections, mat, n=20, smooth=True, x_scale=1.0, xo=0.0):
        rings = []
        for (f, w, top, bot, zc, p) in sections:
            ring = []
            for i in range(n):
                t = 2 * math.pi * i / n
                c, s = math.cos(t), math.sin(t)
                x = xo + w * x_scale * math.copysign(abs(c) ** (2.0 / p), c)
                z = zc + (top if s >= 0 else bot) * math.copysign(abs(s) ** (2.0 / p), s)
                ring.append((x, f, z))
            rings.append(ring)
        vr = [self._verts(r) for r in rings]
        for a in range(len(vr) - 1):
            for i in range(n):
                j = (i + 1) % n
                self._face([vr[a][i], vr[a][j], vr[a + 1][j], vr[a + 1][i]], mat, smooth)
        # 封口
        for ring_idx, flip in ((0, True), (len(vr) - 1, False)):
            ring = vr[ring_idx]
            c = Vector((0, 0, 0))
            for v in ring:
                c += v.co
            c /= len(ring)
            cv = self.bm.verts.new(c)
            for i in range(n):
                j = (i + 1) % n
                tri = [ring[j], ring[i], cv] if flip else [ring[i], ring[j], cv]
                self._face(tri, mat, smooth)
        return vr

    # ── 方塊（中心 c，尺寸 s=(x,f,z)，繞三軸旋轉 rot（弧度，x→f→z 順序）） ──
    def box(self, c, s, mat, rot=(0, 0, 0), taper=None):
        hx, hf, hz = s[0] / 2, s[1] / 2, s[2] / 2
        pts = [(-hx, -hf, -hz), (hx, -hf, -hz), (hx, hf, -hz), (-hx, hf, -hz),
               (-hx, -hf, hz), (hx, -hf, hz), (hx, hf, hz), (-hx, hf, hz)]
        if taper:  # taper=(上方 x 倍率, 前方 f 倍率)
            tx, tf = taper
            pts = [((x * tx) if z > 0 else x, (f * tf) if z > 0 else f, z) for (x, f, z) in pts]
        R = Matrix.Rotation(rot[2], 3, 'Z') @ Matrix.Rotation(rot[1], 3, 'Y') @ Matrix.Rotation(rot[0], 3, 'X')
        vs = self._verts([tuple(Vector(c) + R @ Vector(p)) for p in pts])
        for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self._face([vs[i] for i in q], mat, False)
        return vs

    # ── 把平面輪廓（x,f）沿 z 擠出成稜柱；thick 為厚度，z0 為中心高度 ──
    def prism(self, outline, thick, z0, mat, smooth=False, scale_top=None, tilt=0.0):
        top = [(x, f, z0 + thick / 2 + tilt * abs(x)) for (x, f) in outline]
        sc = scale_top or 1.0
        cx = sum(p[0] for p in outline) / len(outline)
        cf = sum(p[1] for p in outline) / len(outline)
        bot = [(cx + (x - cx) * sc, cf + (f - cf) * sc, z0 - thick / 2 + tilt * abs(x)) for (x, f) in outline]
        vt = self._verts(top)
        vb = self._verts(bot)
        n = len(outline)
        self._face(vt, mat, smooth)
        self._face(list(reversed(vb)), mat, smooth)
        for i in range(n):
            j = (i + 1) % n
            self._face([vb[i], vb[j], vt[j], vt[i]], mat, smooth)

    # ── 任意兩點之間的柱體（可錐形）：肢體、棘刺、細桿 ──
    def bar(self, a, b, r, mat, sides=6, r2=None, cap=True, smooth=True):
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        if L < 1e-5:
            return
        ax = d / L
        up = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized()
        v = ax.cross(u).normalized()
        r2 = r if r2 is None else r2
        ra, rb = [], []
        for i in range(sides):
            t = 2 * math.pi * i / sides
            off = u * math.cos(t) + v * math.sin(t)
            ra.append(tuple(a + off * r))
            rb.append(tuple(b + off * r2))
        va, vb = self._verts(ra), self._verts(rb)
        for i in range(sides):
            j = (i + 1) % sides
            self._face([va[i], va[j], vb[j], vb[i]], mat, smooth)
        if cap:
            if r > 1e-4:
                self._face(list(reversed(va)), mat, False)
            if r2 > 1e-4:
                self._face(vb, mat, False)

    # ── 垂直放樣：sections = [(z, 半寬x, 前半深, 後半深, x中心, f中心, 方度p), ...]，沿 z 軸由上而下 ──
    def loft_v(self, sections, mat, n=16, smooth=True):
        rings = []
        for (z, hx, hf, hb, xc, fc, p) in sections:
            ring = []
            for i in range(n):
                t = 2 * math.pi * i / n
                c, s = math.cos(t), math.sin(t)
                ring.append((xc + hx * math.copysign(abs(c) ** (2.0 / p), c), fc + (hf if s >= 0 else hb) * math.copysign(abs(s) ** (2.0 / p), s), z))
            rings.append(ring)
        vr = [self._verts(r) for r in rings]
        for a in range(len(vr) - 1):
            for i in range(n):
                j = (i + 1) % n
                self._face([vr[a][i], vr[a][j], vr[a + 1][j], vr[a + 1][i]], mat, smooth)
        for ring_idx in (0, len(vr) - 1):
            ring = vr[ring_idx]
            c = Vector((0, 0, 0))
            for v in ring:
                c += v.co
            c /= len(ring)
            cv = self.bm.verts.new(c)
            for i in range(n):
                self._face([ring[i], ring[(i + 1) % n], cv], mat, smooth)

    # ── 側視稜柱：輪廓在 (x, z) 平面，沿 f 方向擠出（直立的刃片、裙擺碎片） ──
    def prism_xz(self, outline, thick, f0, mat, smooth=False, back_scale=1.0):
        front = [(x, f0 + thick / 2, z) for (x, z) in outline]
        cx = sum(p[0] for p in outline) / len(outline)
        cz = sum(p[1] for p in outline) / len(outline)
        back = [(cx + (x - cx) * back_scale, f0 - thick / 2, cz + (z - cz) * back_scale) for (x, z) in outline]
        vf, vb = self._verts(front), self._verts(back)
        n = len(outline)
        self._face(vf, mat, smooth)
        self._face(list(reversed(vb)), mat, smooth)
        for i in range(n):
            j = (i + 1) % n
            self._face([vb[i], vb[j], vf[j], vf[i]], mat, smooth)

    # ── 圓柱／圓錐（軸向 'f' 前後、'x' 左右、'z' 上下）；r2 為另一端半徑 ──
    def cyl(self, c, r, length, mat, axis='f', sides=12, r2=None, smooth=True, cap=True):
        r2 = r if r2 is None else r2
        ring_a, ring_b = [], []
        for i in range(sides):
            t = 2 * math.pi * i / sides
            u, v = math.cos(t), math.sin(t)
            if axis == 'f':
                ring_a.append((c[0] + r * u, c[1] - length / 2, c[2] + r * v))
                ring_b.append((c[0] + r2 * u, c[1] + length / 2, c[2] + r2 * v))
            elif axis == 'x':
                ring_a.append((c[0] - length / 2, c[1] + r * u, c[2] + r * v))
                ring_b.append((c[0] + length / 2, c[1] + r2 * u, c[2] + r2 * v))
            else:
                ring_a.append((c[0] + r * u, c[1] + r * v, c[2] - length / 2))
                ring_b.append((c[0] + r2 * u, c[1] + r2 * v, c[2] + length / 2))
        va, vb = self._verts(ring_a), self._verts(ring_b)
        for i in range(sides):
            j = (i + 1) % sides
            self._face([va[i], va[j], vb[j], vb[i]], mat, smooth)
        if cap:
            if r > 1e-4:
                self._face(list(reversed(va)), mat, False)
            if r2 > 1e-4:
                self._face(vb, mat, False)

    # ── 球（UV 球，可橢球） ──
    def sphere(self, c, r, mat, seg=16, rings=10, scale=(1, 1, 1), smooth=True):
        m = Matrix.Translation(Vector(c)) @ Matrix.Diagonal(Vector((r * scale[0], r * scale[1], r * scale[2], 1)))
        ret = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=m)
        faces = set()
        for v in ret['verts']:
            for f in v.link_faces:
                faces.add(f)
        for f in faces:
            f.material_index = self.idx[mat]
            f.smooth = smooth

    # ── 圓環（軸向 'f'：圓環平面為 x-z；axis='z'：平面為 x-f） ──
    def torus(self, c, R, r, mat, axis='f', major=32, minor=8, smooth=True, a0=0.0, a1=None):
        verts = []
        partial = a1 is not None
        a1 = (2 * math.pi) if a1 is None else a1
        steps = major + (1 if partial else 0)
        for i in range(steps):
            a = a0 + (a1 - a0) * i / major
            row = []
            for k in range(minor):
                b = 2 * math.pi * k / minor
                rr = R + r * math.cos(b)
                u, v, w = rr * math.cos(a), rr * math.sin(a), r * math.sin(b)
                if axis == 'f':
                    row.append((c[0] + u, c[1] + w, c[2] + v))
                elif axis == 'z':
                    row.append((c[0] + u, c[1] + v, c[2] + w))
                else:
                    row.append((c[0] + w, c[1] + u, c[2] + v))
            verts.append(self._verts(row))
        for i in range(major):
            i2 = i + 1 if partial else (i + 1) % major
            for k in range(minor):
                k2 = (k + 1) % minor
                self._face([verts[i][k], verts[i2][k], verts[i2][k2], verts[i][k2]], mat, smooth)

    # ── 隨機點的凸包（稜角碎片） ──
    def convex(self, pts, mat, hot_mat=None, hot_n=0, seed=0):
        import random
        rnd = random.Random(seed)
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        ret = bmesh.ops.convex_hull(self.bm, input=vs)
        faces = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMFace)]
        for f in faces:
            f.material_index = self.idx[mat]
            f.smooth = False
        if hot_mat and hot_n:
            for f in rnd.sample(faces, min(hot_n, len(faces))):
                f.material_index = self.idx[hot_mat]

    # ── 沿折線的發光帶（平放；width 為帶寬，ofs 為垂直方向偏移） ──
    def ribbon(self, pts, width, mat, up=(0, 0, 1), lift=0.0, closed=False):
        up = Vector(up).normalized()
        pts = [Vector(p) for p in pts]
        n = len(pts)
        left, right = [], []
        for i, p in enumerate(pts):
            a = pts[i - 1] if (i > 0 or closed) else p
            b = pts[(i + 1) % n] if (i < n - 1 or closed) else p
            d = (b - a)
            if d.length < 1e-6:
                d = Vector((0, 1, 0))
            side = d.cross(up).normalized() * (width / 2)
            left.append(p + side + up * lift)
            right.append(p - side + up * lift)
        vl, vr = self._verts([tuple(v) for v in left]), self._verts([tuple(v) for v in right])
        last = n if closed else n - 1
        for i in range(last):
            j = (i + 1) % n
            self._face([vl[i], vr[i], vr[j], vl[j]], mat, False)

    # ── 錨點 ──
    def anchor(self, name, loc):
        self.anchors.append((name, Vector(loc)))

    # ── 頂點環境遮蔽（AO）：烘進頂點色，遊戲端以 COLOR_0 乘在底色上，凹槽與接縫自然變暗 ──
    @staticmethod
    def bake_ao(obj, rays=26, strength=0.6, radius=0.16):
        from mathutils.bvhtree import BVHTree
        bpy.context.view_layer.update()
        bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
        me = obj.data
        size = max(obj.dimensions) or 1.0
        R, bias = size * radius, size * 0.004
        attr = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
        for v in me.vertices:
            n = v.normal.normalized()
            o = v.co + n * bias
            t = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized()
            b = n.cross(t)
            occ = 0.0
            for i in range(rays):
                u1 = (i + 0.5) / rays
                phi = 2 * math.pi * ((i * 0.6180339887) % 1.0)
                r = math.sqrt(u1)
                d = t * (r * math.cos(phi)) + b * (r * math.sin(phi)) + n * math.sqrt(1.0 - u1)
                hit = bvh.ray_cast(o, d, R)
                if hit[0] is not None and hit[3] > bias:
                    occ += 1.0 - hit[3] / R
            ao = max(0.35, 1.0 - strength * occ / rays * 1.6)
            attr.data[v.index].color = (ao, ao, ao, 1.0)

    # ── 完成：轉向、建立物件、匯出 GLB ──
    def build_object(self):
        bmesh.ops.rotate(self.bm, verts=self.bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for _, m in self.mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        objs = [obj]
        if getattr(self, 'ao', True):
            self.bake_ao(obj)
        for (nm, loc) in self.anchors:
            e = bpy.data.objects.new(nm, None)
            e.empty_display_type = 'PLAIN_AXES'
            e.empty_display_size = 0.5
            e.location = Matrix.Rotation(math.pi, 3, 'Z') @ Vector(loc)
            bpy.context.scene.collection.objects.link(e)
            objs.append(e)
        return objs

    def export(self, path):
        objs = self.build_object()
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                                  export_apply=True, export_yup=True, export_materials='EXPORT',
                                  export_cameras=False, export_lights=False, export_texcoords=False, export_vertex_color='ACTIVE',
                                  export_normals=True, export_extras=False, export_animations=False)
        tris = sum(len(p.vertices) - 2 for p in objs[0].data.polygons)
        print('[export] %s  tris=%d  -> %s' % (self.name, tris, path))
        return objs


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ───────────────────────── 共用零件 ─────────────────────────
def swept_fin(sb, side, root_f, root_x, root_z, length, span, sweep, thick, mat, curl=0.0, steps=6):
    """向後掃的弧形尾翼：以多段平行四邊形近似彎曲的刀刃。side=+1/-1。"""
    pts_top, pts_bot = [], []
    for i in range(steps + 1):
        t = i / steps
        x = root_x + side * span * t
        f = root_f - sweep * (t ** 1.4)
        zc = root_z + curl * (t ** 2)
        chord = length * (1 - 0.85 * t)
        pts_top.append((x, f + chord * 0.25, zc))
        pts_bot.append((x, f - chord * 0.75, zc))
    verts_a = sb._verts(pts_top)
    verts_b = sb._verts(pts_bot)
    # 上下兩面
    for i in range(steps):
        sb._face([verts_a[i], verts_a[i + 1], verts_b[i + 1], verts_b[i]] if side > 0 else
                 [verts_a[i], verts_b[i], verts_b[i + 1], verts_a[i + 1]], mat)
    # 厚度：複製一層往下
    va2 = sb._verts([(p[0], p[1], p[2] - thick) for p in pts_top])
    vb2 = sb._verts([(p[0], p[1], p[2] - thick) for p in pts_bot])
    for i in range(steps):
        sb._face([va2[i], vb2[i], vb2[i + 1], va2[i + 1]] if side > 0 else
                 [va2[i], va2[i + 1], vb2[i + 1], vb2[i]], mat)
    for i in range(steps):  # 前緣與後緣
        sb._face([verts_a[i], va2[i], va2[i + 1], verts_a[i + 1]] if side > 0 else
                 [verts_a[i], verts_a[i + 1], va2[i + 1], va2[i]], mat)
        sb._face([verts_b[i], verts_b[i + 1], vb2[i + 1], vb2[i]] if side > 0 else
                 [verts_b[i], vb2[i], vb2[i + 1], verts_b[i + 1]], mat)
    sb._face([verts_a[0], verts_b[0], vb2[0], va2[0]] if side > 0 else [verts_a[0], va2[0], vb2[0], verts_b[0]], mat)
    sb._face([verts_a[-1], va2[-1], vb2[-1], verts_b[-1]] if side > 0 else [verts_a[-1], verts_b[-1], vb2[-1], va2[-1]], mat)


def pagoda(sb, f0, z0, tiers, base_w, base_l, tier_h, mat_hull, mat_plate, mat_trim, window_mat=None, shrink=0.8, roof=0.18):
    """多層寶塔式艦橋（聯軍主力艦的特徵）。回傳最高點 z。"""
    z = z0
    w, l = base_w, base_l
    for i in range(tiers):
        sb.box((0, f0, z + tier_h / 2), (w, l, tier_h), mat_hull, taper=(0.92, 0.94))
        # 每層挑簷（比下層略寬的薄板）
        sb.box((0, f0, z + tier_h + roof / 2), (w * 1.18, l * 1.14, roof), mat_plate)
        # 窗帶
        if window_mat is not None:
            sb.box((0, f0 + l / 2 + 0.01, z + tier_h * 0.5), (w * 0.72, 0.04, tier_h * 0.18), window_mat)
            sb.box((0, f0 - l / 2 - 0.01, z + tier_h * 0.5), (w * 0.72, 0.04, tier_h * 0.18), window_mat)
        z += tier_h + roof
        w *= shrink
        l *= shrink
    return z
