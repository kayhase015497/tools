"""IPC 巡洋艦「方正化」：把船身的圓弧斷面壓成方形斷面（squircle → 矩形），讓船身方方正正、有稜有角。
做法：沿船身長軸（Blender Y）每 0.5 單位切一片，估計該片的核心半寬／半高（80% 分位數），把片內「核心範圍內」的頂點做
p' = p·(1 + t·(‖p‖₂/‖p‖∞ − 1))（p 為以半寬／半高正規化的座標）——圓形斷面會被拉成矩形，原有貼圖 UV 與細節保持；超出核心的突出物（炮塔、翼）不動。
輸出 godot/assets/models/ipc.glb（Godot 專用版；網頁版 ipc.glb 不動）。"""
import bpy, bmesh, numpy as np
SRC = '/home/user/tools/assets/space-war/models/ipc.glb'
DST = '/home/user/tools/godot/assets/models/ipc.glb'
T = 1.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
me = o.data
co = np.array([o.matrix_world @ v.co for v in me.vertices], dtype=np.float64)
ys = co[:, 1]
bins = np.floor((ys - ys.min()) / 0.5).astype(int)
nb = bins.max() + 1
cx = np.zeros(nb); cz = np.zeros(nb); ax = np.ones(nb); az = np.ones(nb)
for b in range(nb):
    m = bins == b
    if m.sum() < 6:
        cx[b] = np.nan; continue
    x, z = co[m, 0], co[m, 2]
    cx[b], cz[b] = np.median(x), np.median(z)
    ax[b] = max(np.quantile(np.abs(x - cx[b]), 0.8), 0.15)
    az[b] = max(np.quantile(np.abs(z - cz[b]), 0.8), 0.15)
def fill(a):
    idx = np.arange(len(a)); ok = ~np.isnan(a)
    return np.interp(idx, idx[ok], a[ok])
cx, cz = fill(cx), fill(cz)
def smooth(a, k=3):
    return np.convolve(np.pad(a, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='valid')
ax, az = smooth(ax), smooth(az)
cx, cz = smooth(cx), smooth(cz)
new = co.copy(); moved = 0
for i, (x, y, z) in enumerate(co):
    b = bins[i]
    px, pz = (x - cx[b]) / ax[b], (z - cz[b]) / az[b]
    r2 = np.hypot(px, pz); ri = max(abs(px), abs(pz))
    if ri < 1e-6 or ri > 1.25: continue          # 突出物不動
    f = 1 + T * (r2 / ri - 1)
    new[i] = (cx[b] + px * f * ax[b], y, cz[b] + pz * f * az[b]); moved += 1
inv = o.matrix_world.inverted()
for i, v in enumerate(me.vertices):
    v.co = inv @ __import__('mathutils').Vector(new[i])
me.update()
for pl in me.polygons: pl.use_smooth = False   # 硬表面：平面著色，法線依新形狀重算
# 平面減面：把近乎共面的小三角面合併成大平面（去掉皺褶，留下乾淨的稜角），保留 UV 邊界
bpy.context.view_layer.objects.active = o
mod = o.modifiers.new('planar', 'DECIMATE'); mod.decimate_type = 'DISSOLVE'; mod.angle_limit = 0.5; mod.delimit = {'UV', 'MATERIAL'}
bpy.ops.object.modifier_apply(modifier='planar')
print('faces after planar dissolve', len(o.data.polygons))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=False)
print('exported', DST, 'verts moved', moved, 'of', len(co))
