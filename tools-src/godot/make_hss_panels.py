"""黑塔空間站共用的「面板」貼圖（可無縫平鋪 512²）：淺灰底＋面板縫＋鉚釘＋細微污漬。
輸出 godot/assets/models/hss_panel_albedo.png / _height.png / _rough.png（底色由材質的 albedo_color 染色）。"""
import numpy as np
from PIL import Image
N = 512; rng = np.random.default_rng(7)
def tile_noise(n, k):
    a = rng.random((k, k)); im = Image.fromarray((a * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255
yy, xx = np.mgrid[0:N, 0:N]
h = np.ones((N, N), np.float32)
def groove(mask_line, w=2.0): return np.exp(-(mask_line / w) ** 2)
g = np.zeros((N, N), np.float32)
for cuts in ((0, 256), (0, 128, 256, 384)):
    pass
for x in (0, 256): g = np.maximum(g, groove(np.minimum(np.abs(xx - x), N - np.abs(xx - x))))
for y in (0, 170, 341): g = np.maximum(g, groove(np.minimum(np.abs(yy - y), N - np.abs(yy - y))))
for x in (128, 384):                                  # 次級細縫（只在半幅內）
    g = np.maximum(g, 0.5 * groove(np.abs(xx - x), 1.2) * ((yy < 170) | (yy > 341)))
rivet = np.zeros((N, N), np.float32)
for x in range(16, N, 32):
    for y in (10, 160, 180, 331, 351, 502):
        rivet = np.maximum(rivet, np.exp(-(((xx - x) ** 2 + (yy - y) ** 2) / 5.0)))
noise = 0.5 * tile_noise(N, 8) + 0.3 * tile_noise(N, 32) + 0.2 * tile_noise(N, 128)
height = np.clip(1.0 - 0.8 * g + 0.25 * rivet + 0.06 * (noise - 0.5), 0, 1)
alb = np.clip(0.88 - 0.35 * g - 0.1 * (noise - 0.4) * (noise > 0.55) + 0.03 * rivet, 0, 1)
rough = np.clip(0.42 + 0.35 * g + 0.25 * noise, 0, 1)
d = 'godot/assets/models/hss_panel_'
Image.fromarray((np.stack([alb] * 3, -1) * 255).astype(np.uint8)).save(d + 'albedo.png')
Image.fromarray((height * 255).astype(np.uint8)).save(d + 'albedo_height.png')
Image.fromarray((rough * 255).astype(np.uint8)).save(d + 'albedo_rough.png')
print('ok')
