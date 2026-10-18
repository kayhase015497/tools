"""frigate_slim 收緊：圓環縮小、下垂飄帶與小零件往艦體靠攏（純 Python 改頂點位置，材質貼圖不動）。
用法：tighten_frigate.py in.glb out.glb"""
import json, struct, sys
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
RING_S, SIDE_X, DROOP_K, HULL_Y = 0.62, 0.8, 0.45, -0.2
d = bytearray(open(src, 'rb').read())
jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); bo = 28 + jl
pr = j['meshes'][0]['primitives'][0]
a = j['accessors'][pr['attributes']['POSITION']]; bv = j['bufferViews'][a['bufferView']]
off = bo + bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', 12); n = a['count']
raw = np.frombuffer(d, dtype=np.uint8, count=n * st, offset=off).reshape(n, st)
P = raw[:, :12].copy().view('<f4').reshape(-1, 3).astype(np.float64)
idx = j['accessors'][pr['indices']]; ibv = j['bufferViews'][idx['bufferView']]
dt = {5123: '<u2', 5125: '<u4'}[idx['componentType']]
I = np.frombuffer(d, dtype=dt, count=idx['count'], offset=bo + ibv.get('byteOffset', 0) + idx.get('byteOffset', 0)).astype(np.int64).reshape(-1, 3)
key = np.round(P, 4); u, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
par = np.arange(len(u))
def f(x):
    while par[x] != x: par[x] = par[par[x]]; x = par[x]
    return x
for t in inv[I]:
    for k in (1, 2):
        p, q = f(t[0]), f(t[k])
        if p != q: par[p] = q
comp = np.array([f(i) for i in range(len(u))])[inv]
ids, cnt = np.unique(comp, return_counts=True); order = ids[np.argsort(-cnt)]
hull, ring = order[0], order[1]
Q = P.copy()
for c in order:
    m = comp == c
    if c == hull: continue
    if c == ring:
        ctr = (P[m].min(0) + P[m].max(0)) / 2; Q[m] = ctr + (P[m] - ctr) * RING_S; continue
    q = P[m].copy(); q[:, 0] *= SIDE_X
    if q[:, 1].mean() < -0.8: q[:, 1] = HULL_Y + (q[:, 1] - HULL_Y) * DROOP_K
    Q[m] = q
out = Q.astype('<f4')
for i in range(n): raw[i, :12] = np.frombuffer(out[i].tobytes(), dtype=np.uint8)
a['min'] = Q.min(0).tolist(); a['max'] = Q.max(0).tolist()
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
rest = bytes(d[20 + jl:])
open(dst, 'wb').write(b'glTF' + struct.pack('<II', 2, 20 + len(js) + len(rest)) + struct.pack('<I', len(js)) + b'JSON' + js + rest)
print('bbox', Q.min(0).round(2), Q.max(0).round(2))
