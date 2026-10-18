"""IPC 戰略投資部專用艦（IPC_SID，Desktop 版 ipc_sid.glb）收尾（純 Python，不需 Blender）：
  底色貼圖非紅色區域略提亮（原平均亮度 0.18，遊戲光照下偏暗；紅色保留不動），擷取紅色圖樣成發光貼圖（1024 JPEG），重新打包 GLB。
用法：python finish_sid.py <輸入.glb> <輸出.glb>"""
import sys, io, json, struct
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + l]); bl = struct.unpack('<I', d[20 + l:24 + l])[0]; blob = d[28 + l:28 + l + bl]
mat = j['materials'][0]; bidx = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
bv0 = j['bufferViews'][j['images'][bidx]['bufferView']]
a = np.asarray(Image.open(io.BytesIO(blob[bv0.get('byteOffset', 0):bv0.get('byteOffset', 0) + bv0['byteLength']])).convert('RGB')).astype(np.float32) / 255
r, g, b = a[..., 0], a[..., 1], a[..., 2]
red = np.clip((r - 1.5 * np.maximum(g, b)) * 4, 0, 1)[..., None]
a2 = np.clip(a * (1 - red) * 1.3 + a * red, 0, 1)
mask = ((r > 0.5) & (r > 1.8 * g) & (r > 1.4 * b)).astype(np.uint8) * 255
print('emissive pixels %.2f%%' % (mask.mean() / 255 * 100))
mk = Image.fromarray(mask).filter(ImageFilter.MaxFilter(3)); em = a * (np.asarray(mk).astype(np.float32)[..., None] / 255)
emi = Image.fromarray(np.clip(em * 255 * 1.0, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS); eb = io.BytesIO(); emi.save(eb, 'JPEG', quality=88)
gb = io.BytesIO(); Image.fromarray((a2 * 255).astype(np.uint8)).save(gb, 'JPEG', quality=90)
views = [(bv, blob[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]) for bv in j['bufferViews']]
views[j['images'][bidx]['bufferView']] = (views[j['images'][bidx]['bufferView']][0], gb.getvalue())
nbv = {'buffer': 0, 'byteLength': 0}; j['bufferViews'].append(nbv); views.append((nbv, eb.getvalue()))
j['images'].append({'name': 'sid_emissive_1024', 'mimeType': 'image/jpeg', 'bufferView': len(views) - 1})
j['textures'].append({'source': len(j['images']) - 1, **({'sampler': j['textures'][0]['sampler']} if 'sampler' in j['textures'][0] else {})})
mat['emissiveTexture'] = {'index': len(j['textures']) - 1}; mat['emissiveFactor'] = [0.8, 0.8, 0.8]
out = bytearray()
for bv, data in views:
    while len(out) % 4: out.append(0)
    bv['byteOffset'] = len(out); bv['byteLength'] = len(data); bv['buffer'] = 0; out += data
while len(out) % 4: out.append(0)
j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out)); print('wrote', dst)
