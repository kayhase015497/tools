"""護衛艦 frigate_slim（Desktop 重塑版）加錨點節點後輸出 models/frigate.glb（純 Python，不動網格與材質）。"""
import json, struct, sys
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); rest = d[20 + jl:]
A = {'HP_GUN_1': (0.45, -0.3, 3.0), 'HP_GUN_2': (-0.45, -0.3, 3.0),
     'HP_ENGINE_1': (0.9, -1.0, -4.6), 'HP_ENGINE_2': (-0.9, -1.0, -4.6), 'HP_COCKPIT': (0, 0.3, 0.5)}
sc = j['scenes'][j.get('scene', 0)]
for k, v in A.items():
    j['nodes'].append({'name': k, 'translation': list(v)}); sc['nodes'].append(len(j['nodes']) - 1)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<I', len(js)) + b'JSON' + js + rest
open(dst, 'wb').write(out)
