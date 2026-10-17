"""反物質軍團航母（Desktop 版 legion_carrier_new.glb）的最後處理，不需要 Blender：
  1. 法線貼圖 2048 PNG → 1024 JPEG q90（檔案大小約三分之一，上百艘同時出現時較輕）
  2. 由底色貼圖擷取「金色窗列」與「青綠符文」產生發光貼圖（emissiveTexture），與舊版一樣會發光
  3. 重新打包 GLB
用法：python finish_legion_carrier.py <輸入.glb> <輸出.glb>"""
import sys, io, json, struct
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + l]); bl = struct.unpack('<I', d[20 + l:24 + l])[0]; blob = d[28 + l:28 + l + bl]


def view_bytes(i):
    bv = j['bufferViews'][i]; o = bv.get('byteOffset', 0); return blob[o:o + bv['byteLength']]


mat = j['materials'][0]
nidx = j['textures'][mat['normalTexture']['index']]['source']; bidx = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
base = Image.open(io.BytesIO(view_bytes(j['images'][bidx]['bufferView']))).convert('RGB')
nrm = Image.open(io.BytesIO(view_bytes(j['images'][nidx]['bufferView']))).convert('RGB')

nrm1k = nrm.resize((1024, 1024), Image.LANCZOS); nb = io.BytesIO(); nrm1k.save(nb, 'JPEG', quality=90)

# 發光遮罩：金色（高飽和黃）與青綠（符文／艙窗）的像素
a = np.asarray(base).astype(np.float32) / 255; r, g, b = a[..., 0], a[..., 1], a[..., 2]
gold = (r > 0.62) & (g > 0.45) & (b < 0.5) & (r > g * 1.1) & (g > b * 1.4)
teal = (g > 0.45) & (b > 0.4) & (r < 0.35) & (g > r * 1.7)
mask = (gold | teal).astype(np.float32)
# 稍微擴張一圈，讓光點在 mipmap 後仍看得到
from PIL import ImageFilter
mk = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
em = (np.asarray(base).astype(np.float32) * (np.asarray(mk).astype(np.float32)[..., None] / 255)); em = np.clip(em * 1.5, 0, 255).astype(np.uint8)
emi = Image.fromarray(em).resize((1024, 1024), Image.LANCZOS); eb = io.BytesIO(); emi.save(eb, 'JPEG', quality=88)
print('emissive pixels %.3f%%' % (mask.mean() * 100))

# ── 重新打包：沿用原有 bufferView，替換法線圖，新增發光圖 ──
newviews = []
for i, bv in enumerate(j['bufferViews']):
    data = view_bytes(i)
    if i == j['images'][nidx]['bufferView']: data = nb.getvalue()
    newviews.append((bv, data))
j['images'].append({'name': 'legion_emissive_1024', 'mimeType': 'image/jpeg', 'bufferView': len(newviews)}); nbv = {'buffer': 0, 'byteLength': 0}; j['bufferViews'].append(nbv); newviews.append((nbv, eb.getvalue()))
j['images'][nidx]['mimeType'] = 'image/jpeg'
j['textures'].append({'source': len(j['images']) - 1, 'sampler': j['textures'][0].get('sampler', 0)} if 'sampler' in j['textures'][0] else {'source': len(j['images']) - 1})
mat['emissiveTexture'] = {'index': len(j['textures']) - 1}; mat['emissiveFactor'] = [1.0, 1.0, 1.0]
out = bytearray()
for bv, data in newviews:
    while len(out) % 4: out.append(0)
    bv['byteOffset'] = len(out); bv['byteLength'] = len(data); bv['buffer'] = 0; out += data
while len(out) % 4: out.append(0)
j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out)
open(dst, 'wb').write(glb); print('wrote', dst, len(glb))
