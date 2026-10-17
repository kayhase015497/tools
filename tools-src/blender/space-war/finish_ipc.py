"""IPC 巡洋艦收尾（純 Python）：1. 底色貼圖調色（去飽和、略壓暗，紅色保留）；2. 由底色貼圖擷取紅色發光飾條 → emissiveTexture（1024 JPEG）；3. 重新打包 GLB。
用法：python finish_ipc.py <輸入.glb> <輸出.glb>"""
import sys, io, json, struct
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + l]); bl = struct.unpack('<I', d[20 + l:24 + l])[0]; blob = d[28 + l:28 + l + bl]
mat = j['materials'][0]; bidx = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
bv0 = j['bufferViews'][j['images'][bidx]['bufferView']]; base = Image.open(io.BytesIO(blob[bv0.get('byteOffset', 0):bv0.get('byteOffset', 0) + bv0['byteLength']])).convert('RGB')
a = np.asarray(base).astype(np.float32) / 255; r, g, b = a[..., 0], a[..., 1], a[..., 2]
mask = ((r > 0.55) & (r > 2.0 * g) & (r > 1.5 * b)).astype(np.uint8) * 255
print('emissive pixels %.2f%%' % (mask.mean() / 255 * 100))
mk = Image.fromarray(mask).filter(ImageFilter.MaxFilter(3)); em = np.asarray(base).astype(np.float32) * (np.asarray(mk).astype(np.float32)[..., None] / 255)
em = Image.fromarray(np.clip(em * 1.15, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS); eb = io.BytesIO(); em.save(eb, 'JPEG', quality=88)
# 底色貼圖調色：去飽和、略壓暗（紅色飾條保留），貼近 IPC 的炭灰配色，也避免在遊戲強光下過亮過藍
red = np.clip((r - 1.4 * np.maximum(g, b)) * 5, 0, 1)[..., None]; lum = a.mean(axis=2, keepdims=True)
gr = np.clip((lum + (a - lum) * 0.45) * 0.82, 0, 1); a2 = np.clip(gr * (1 - red) + a * red, 0, 1)
gb = io.BytesIO(); Image.fromarray((a2 * 255).astype(np.uint8)).save(gb, 'JPEG', quality=90)
views = [(bv, blob[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]) for bv in j['bufferViews']]
nbv = {'buffer': 0, 'byteLength': 0}; j['bufferViews'].append(nbv); views.append((nbv, eb.getvalue())); views[j['images'][bidx]['bufferView']] = (views[j['images'][bidx]['bufferView']][0], gb.getvalue())
j['images'].append({'name': 'ipc_emissive_1024', 'mimeType': 'image/jpeg', 'bufferView': len(views) - 1})
j['textures'].append({'source': len(j['images']) - 1, **({'sampler': j['textures'][0]['sampler']} if 'sampler' in j['textures'][0] else {})})
mat['emissiveTexture'] = {'index': len(j['textures']) - 1}; mat['emissiveFactor'] = [1.0, 1.0, 1.0]
out = bytearray()
for bv, data in views:
    while len(out) % 4: out.append(0)
    bv['byteOffset'] = len(out); bv['byteLength'] = len(data); bv['buffer'] = 0; out += data
while len(out) % 4: out.append(0)
j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out)); print('wrote', dst)
