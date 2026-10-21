"""由艦艇底色貼圖推導視差遮蔽（POM）用的高度圖與粗糙度圖。用法：python3 tools-src/godot/make_heightmaps.py
輸入：godot/assets/models/*basecolor*.jpg 與 frigate／fighter 的底色貼圖；輸出：同名 _height.png（灰階，白＝凸、黑＝凹）與 _rough.png。
推導規則（無需手繪）：面板接縫、凹槽在底色上是細暗線 → 取「模糊後亮度 − 原亮度」的正部分當凹陷；大面積亮度差當緩慢起伏；
高頻細節（鉚釘、紋理）加一點噪聲式顆粒。粗糙度：凹處與暗處較粗糙（髒汙），凸起邊緣較光滑（磨亮）。"""
import glob, os
import numpy as np
from PIL import Image, ImageFilter

SRC = sorted(glob.glob('godot/assets/models/*basecolor*.jpg') + glob.glob('godot/assets/models/frigate_tripo_rgb*.jpg') + glob.glob('godot/assets/models/fighter_starskiff_base*.jpg'))
for f in SRC:
    im = Image.open(f).convert('RGB')
    L = np.asarray(im.convert('L'), dtype=np.float32) / 255.0
    def blur(a, r): return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255.0
    fine = np.clip((blur(L, 2.2) - L) * 5.0, 0, 1)          # 細暗線＝接縫／凹槽（凹）
    mid = np.clip((blur(L, 7.0) - L) * 2.5, 0, 1)           # 中尺度暗區（凹）
    bump = np.clip((L - blur(L, 3.5)) * 3.0, 0, 1)           # 細亮線＝凸起邊緣
    low = blur(L, 18.0)                                       # 大面積亮度＝緩慢起伏
    h = 0.55 - 0.55 * fine - 0.25 * mid + 0.30 * bump + 0.18 * (low - 0.5)
    rng = np.random.default_rng(7)
    h += rng.normal(0, 0.012, h.shape).astype(np.float32)     # 細顆粒
    h = np.clip(h, 0, 1)
    base = os.path.splitext(f)[0]
    Image.fromarray((h * 255).astype(np.uint8)).save(base + '_height.png')
    rough = np.clip(0.55 + 0.35 * fine + 0.15 * mid - 0.25 * bump + 0.2 * (0.5 - L), 0.2, 0.95)
    Image.fromarray((rough * 255).astype(np.uint8)).save(base + '_rough.png')
    print(os.path.basename(base), im.size)
