"""黑塔空間站（Desktop 版 hss_new.glb）收尾：
  1. 方向：不旋轉。依使用者提供的美術圖（視點在圓環右下方、看向整個空間站，左上角即為引擎所在）：
     圓環端＝船頭（+Z），引擎在遠端的黑色長方塊末端（−Z）。（黑色方塊旁的藍光是甲板導引光，不是引擎。）
  2. 錨點：引擎 3 個放在黑色方塊末端；砲塔 3 個與艦橋視點沿用 Desktop 擺放的位置
  3. 底色貼圖提亮（原圖平均亮度僅 0.2，遊戲光照下太暗）；擷取藍色甲板導引光成發光貼圖；重新打包
用法：python finish_hss.py <輸入.glb> <輸出.glb>"""
import sys, os, io, json, struct, math
import numpy as np
from PIL import Image, ImageFilter
import bpy

src, dst = sys.argv[1], sys.argv[2]
tmp = dst + '.tmp.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
mesh = [o for o in sc.objects if o.type == 'MESH'][0]; mesh.parent = None
bpy.context.view_layer.objects.active = mesh; bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh.data.update()
for e in [o for o in sc.objects if o.type == 'EMPTY']: sc.objects.remove(e) if False else bpy.data.objects.remove(e, do_unlink=True)
to_b = lambda g: (g[0], -g[2], g[1])
def anchor(name, g):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = to_b(g); e.empty_display_type = 'PLAIN_AXES'
# glTF 座標（x 右、y 上、+z 船頭＝圓環端）。引擎在黑色長方塊末端（z≈−32）
for n, g in {'HP_ENGINE_1': (0.0, -1.15, -33.0), 'HP_ENGINE_2': (-1.3, -1.15, -33.0), 'HP_ENGINE_3': (1.3, -1.15, -33.0),
             'HP_GUN_1': (0.0, 8.06, 21.0), 'HP_GUN_2': (0.0, 7.39, 15.0), 'HP_GUN_3': (0.0, 4.88, -11.0), 'HP_COCKPIT': (0.0, 7.3, -4.5)}.items(): anchor(n, g)
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects: o.select_set(o.type in ('MESH', 'EMPTY'))
bpy.ops.export_scene.gltf(filepath=tmp, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False, export_image_format='JPEG', export_jpeg_quality=90)

# ── 貼圖調色＋發光層 ──
d = open(tmp, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + l]); bl = struct.unpack('<I', d[20 + l:24 + l])[0]; blob = d[28 + l:28 + l + bl]
mat = j['materials'][0]; bidx = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
bv0 = j['bufferViews'][j['images'][bidx]['bufferView']]
a = np.asarray(Image.open(io.BytesIO(blob[bv0.get('byteOffset', 0):bv0.get('byteOffset', 0) + bv0['byteLength']])).convert('RGB')).astype(np.float32) / 255
r, g, b = a[..., 0], a[..., 1], a[..., 2]
blue = ((b > 0.55) & (b > r * 1.3) & (b > g * 1.05)).astype(np.uint8) * 255
print('emissive pixels %.3f%%' % (blue.mean() / 255 * 100))
mk = Image.fromarray(blue).filter(ImageFilter.MaxFilter(5)); em = np.asarray(mk).astype(np.float32)[..., None] / 255 * np.array([0.35, 0.65, 1.0], np.float32)
emi = Image.fromarray(np.clip(em * 255, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS); eb = io.BytesIO(); emi.save(eb, 'JPEG', quality=88)
lum = a.mean(axis=2, keepdims=True); a2 = np.clip((lum * 1.7 + (a - lum) * 0.9), 0, 1) ** 0.85   # 提亮，保持原本的色相
gb = io.BytesIO(); Image.fromarray((a2 * 255).astype(np.uint8)).save(gb, 'JPEG', quality=90)
views = [(bv, blob[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]) for bv in j['bufferViews']]
views[j['images'][bidx]['bufferView']] = (views[j['images'][bidx]['bufferView']][0], gb.getvalue())
nbv = {'buffer': 0, 'byteLength': 0}; j['bufferViews'].append(nbv); views.append((nbv, eb.getvalue()))
j['images'].append({'name': 'hss_emissive_1024', 'mimeType': 'image/jpeg', 'bufferView': len(views) - 1})
j['textures'].append({'source': len(j['images']) - 1, **({'sampler': j['textures'][0]['sampler']} if 'sampler' in j['textures'][0] else {})})
mat['emissiveTexture'] = {'index': len(j['textures']) - 1}; mat['emissiveFactor'] = [1.0, 1.0, 1.0]
out = bytearray()
for bv, data in views:
    while len(out) % 4: out.append(0)
    bv['byteOffset'] = len(out); bv['byteLength'] = len(data); bv['buffer'] = 0; out += data
while len(out) % 4: out.append(0)
j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out))
os.remove(tmp); print('exported', dst, os.path.getsize(dst))
