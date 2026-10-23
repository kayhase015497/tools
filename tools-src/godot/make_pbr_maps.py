"""艦體 PBR 補貼圖（Build 20）：由既有底色／高度圖推導 法線圖（含烘進去的細節面板法線）、金屬度圖、發光圖。
輸出在 godot/assets/models/ 與底色貼圖同資料夾：<底色名>_nrm.png／_metal.png／_emit.png。
參數（強度等）在 godot/data/materials.json；貼圖本身只需重新產生時才跑：python -I make_pbr_maps.py
"""
import glob, os, sys
import numpy as np
from PIL import Image, ImageFilter
D = 'godot/assets/models/'
rng = np.random.default_rng(11)

def load_gray(p):
    return np.asarray(Image.open(p).convert('L')).astype(np.float32) / 255

def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1)

# 細節面板高度（HSS 面板貼圖，512 可平鋪）：烘進法線，近看有面板縫與鉚釘
detail = load_gray(D + 'hss_panel_albedo_height.png') if os.path.exists(D + 'hss_panel_albedo_height.png') else None

def tile_to(a, shape, k):
    h, w = shape
    t = np.tile(a, (int(np.ceil(h / a.shape[0] * k)), int(np.ceil(w / a.shape[1] * k))))
    return np.asarray(Image.fromarray((t * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float32) / 255

done = 0
for alb in sorted(glob.glob(D + '*basecolor*.jpg') + glob.glob(D + 'cruiser_xz_basecolor_graded.jpg') + glob.glob(D + 'fighter_starskiff_base_1024.jpg') + glob.glob(D + 'frigate_tripo_rgb_*.jpg')):
    if 'emissive' in alb or '_normal' in alb or any(k in alb for k in ('hss_', 'ipc_sid_', 'whale_', 'xzd_')):   # 這幾艘的 GLB 已有法線圖（與發光圖），不重做
        continue
    base = alb[:-4]
    if os.path.exists(base + '_nrm.png') and '--force' not in sys.argv:
        continue
    im = Image.open(alb).convert('RGB'); a = np.asarray(im).astype(np.float32) / 255
    if max(a.shape[:2]) > 2048:   # 超大貼圖（護衛艦 4096）降到 2048
        im = im.resize((2048, 2048), Image.LANCZOS); a = np.asarray(im).astype(np.float32) / 255
    H, W = a.shape[:2]
    hp = base + '_height.png'
    h = load_gray(hp) if os.path.exists(hp) else a.mean(-1)
    if h.shape != (H, W):
        h = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    hs = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    n = normal_from_height(hs, 6.0)
    if detail is not None:
        dh = tile_to(detail, (H, W), 4.0)
        n2 = normal_from_height(dh, 2.2)
        n = n + np.stack([n2[..., 0], n2[..., 1], np.zeros_like(h)], -1) * 0.55
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(base + '_nrm.png')
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    metal = np.clip(0.22 + 0.55 * np.clip((lum - 0.25) / 0.5, 0, 1) * (1.0 - 0.6 * sat), 0, 1)
    Image.fromarray((metal * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).save(base + '_metal.png')
    # 發光：高亮且飽和的色塊（燈帶、窗、航行燈），輕微擴張
    em = ((mx > 0.9) & (sat > 0.6)).astype(np.uint8) * 255
    em = Image.fromarray(em).filter(ImageFilter.MaxFilter(3))
    emm = np.asarray(em).astype(np.float32)[..., None] / 255
    Image.fromarray((a * emm * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).save(base + '_emit.png')
    print('maps', os.path.basename(base), 'emit %.2f%%' % (emm.mean() * 100)); done += 1
print('done', done)
