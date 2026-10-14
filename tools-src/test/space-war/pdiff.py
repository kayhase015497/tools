import sys, glob, os
from PIL import Image, ImageChops
q = sys.argv[1]
names = sorted(set(os.path.basename(p)[len('v1_'+q+'_'):-4] for p in glob.glob(f'par/v1_{q}_*.png')))
for n in names:
    a = Image.open(f'par/v1_{q}_{n}.png').convert('RGB'); b = Image.open(f'par/v2_{q}_{n}.png').convert('RGB')
    d = ImageChops.difference(a, b); import numpy as np; arr = np.asarray(d).astype(float)
    ma = np.asarray(a).astype(float).mean(); mb = np.asarray(b).astype(float).mean()
    print(f'{n:14s} meanDiff {arr.mean():6.2f}  bright v1 {ma:6.1f} v2 {mb:6.1f}')
    w, h = a.size; s = Image.new('RGB', (w*2, h)); s.paste(a, (0,0)); s.paste(b, (w,0)); s.save(f'par/cmp_{q}_{n}.png')
