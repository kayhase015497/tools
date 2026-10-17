"""
build_ships.py — 產生太空戰所有艦艇的 GLB。

執行（headless，不需要 Blender GUI）：
    pip install bpy numpy
    python build_ships.py --out ../../../assets/space-war/models            # 全部
    python build_ships.py --out ... frigate whale                           # 只建指定艦艇
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, noise  # noqa: E402
from shiplib import ShipBuilder, make_mat, hexc, reset, swept_fin, pagoda  # noqa: E402


# ═════════════════ 聯軍：護衛艦（小型飛鏢艦，約 10 單位長） ═════════════════
def frigate(out):
    reset()
    M = {
        'hull': make_mat('hull', hexc('#1c2a54'), 0.6, 0.45),
        'plate': make_mat('plate', hexc('#d5ddf7'), 0.35, 0.5),
        'trim': make_mat('trim', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#7fe9ff'), emit_strength=1.0),
        'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#9fdcff'), emit_strength=1.0),
        'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
    }
    sb = ShipBuilder('frigate', M)
    # 主體：尖鼻、向後略寬
    sb.loft([(5.0, 0.02, 0.02, 0.02, 0, 2.2), (4.0, 0.30, 0.28, 0.22, 0, 2.4), (2.0, 0.62, 0.42, 0.34, 0, 2.6),
             (-1.0, 0.85, 0.50, 0.42, 0, 2.8), (-3.5, 0.80, 0.46, 0.40, 0, 2.8), (-5.0, 0.60, 0.36, 0.32, 0, 2.4)],
            'hull', n=16)
    # 背甲
    sb.prism([(0.0, 3.4), (0.46, 1.0), (0.42, -3.9), (-0.42, -3.9), (-0.46, 1.0)], 0.10, 0.46, 'plate', scale_top=0.9)
    # 後掠翼 + 前緣發光帶
    for sg in (1, -1):
        sb.prism([(sg * 0.7, 2.0), (sg * 3.6, -3.7), (sg * 3.2, -4.8), (sg * 0.9, -3.0)], 0.10, 0.04, 'hull')
        sb.ribbon([(sg * 0.8, 1.95, 0.12), (sg * 3.55, -3.65, 0.12)], 0.10, 'trim')
        sb.ribbon([(sg * 1.0, -2.95, 0.12), (sg * 3.15, -4.7, 0.12)], 0.06, 'trim')
        sb.box((sg * 3.45, -4.0, 0.06), (0.14, 0.4, 0.14), 'nav')
        # 引擎
        sb.cyl((sg * 0.45, -5.15, 0.0), 0.24, 0.9, 'hull', axis='f', sides=10)
        sb.cyl((sg * 0.45, -5.62, 0.0), 0.18, 0.1, 'glow', axis='f', sides=10)
        sb.anchor('HP_ENGINE_%d' % (1 if sg > 0 else 2), (sg * 0.45, -5.7, 0.0))
        sb.anchor('HP_GUN_%d' % (1 if sg > 0 else 2), (sg * 0.45, 3.3, 0.0))
    # 背鰭與座艙
    sb.box((0, -3.6, 0.78), (0.08, 1.8, 0.62), 'plate', taper=(1, 0.7))
    sb.sphere((0, 1.6, 0.46), 0.42, 'trim', seg=10, rings=6, scale=(0.7, 1.4, 0.5))
    sb.anchor('HP_COCKPIT', (0, 1.3, 0.6))
    sb.export(os.path.join(out, 'frigate.glb'))



# ═════════════════ 聯軍：巡洋艦／無畏艦（共用生成器） ═════════════════
# 參照影片 0:49–0:50 的聯軍主力艦：深藍細長艦體、沿舷線的白色發光描邊、
# 船尾多層「寶塔」艦橋、向後掃的弧形尾翼、背部雙聯裝砲塔。
def _capital_mats(theme=None):
    if theme == 'xz':   # 仙舟聯盟：深青藍艦體、銀白裝甲、金色窗與描邊
        return {
            'hull': make_mat('hull', hexc('#1c3358'), 0.7, 0.38), 'plate': make_mat('plate', hexc('#b9c6e0'), 0.6, 0.4),
            'dark': make_mat('dark', hexc('#070b18'), 0.3, 0.7), 'trim': make_mat('trim', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#ffe2a0'), emit_strength=1.0),
            'win': make_mat('win', hexc('#1a1208'), 0.2, 0.6, emit=hexc('#ffd98a'), emit_strength=1.0), 'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#9fe4ff'), emit_strength=1.0),
            'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
            'green': make_mat('green', hexc('#0a2a22'), 0.2, 0.5, emit=hexc('#1fc88a'), emit_strength=0.8)}
    if theme == 'ipc':   # 星際和平公司：炭黑艦體、赤橙發光線條、紅色砲口
        return {
            'hull': make_mat('hull', hexc('#2a2124'), 0.7, 0.42), 'plate': make_mat('plate', hexc('#6d5a55'), 0.55, 0.45),
            'dark': make_mat('dark', hexc('#0a0607'), 0.3, 0.7), 'trim': make_mat('trim', hexc('#200808'), 0.2, 0.6, emit=hexc('#ff7a3a'), emit_strength=1.0),
            'win': make_mat('win', hexc('#200a04'), 0.2, 0.6, emit=hexc('#ff9a4a'), emit_strength=1.0), 'glow': make_mat('glow', hexc('#200808'), 0.2, 0.6, emit=hexc('#ff6a3a'), emit_strength=1.0),
            'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff2a3a'), emit_strength=1.0)}
    return {
        'hull': make_mat('hull', hexc('#1a2750'), 0.65, 0.42),
        'plate': make_mat('plate', hexc('#7d89b8'), 0.5, 0.48),
        'dark': make_mat('dark', hexc('#080c1a'), 0.3, 0.7),
        'trim': make_mat('trim', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#a8e8ff'), emit_strength=1.0),
        'win': make_mat('win', hexc('#1a1208'), 0.2, 0.6, emit=hexc('#ffd98a'), emit_strength=1.0),
        'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#8fd8ff'), emit_strength=1.0),
        'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
    }


def capital(out, name, H, big, theme=None):
    reset()
    sb = ShipBuilder(name, _capital_mats(theme))
    r = (H / 10.5)
    W, T = 1.7 * r ** 0.85, 1.0 * r ** 0.8          # 半寬與半高
    secs = [(1.00 * H, .05, .05, .05), (.86 * H, .32 * W, .5 * T, .4 * T), (.57 * H, .68 * W, .8 * T, .6 * T),
            (.19 * H, .94 * W, .95 * T, .75 * T), (-.29 * H, 1.0 * W, 1.0 * T, .8 * T), (-.76 * H, .8 * W, .9 * T, .7 * T),
            (-1.0 * H, .59 * W, .7 * T, .55 * T)]
    sb.loft([(f, w, t, b, 0, 2.5 if i < 3 else 3.0) for i, (f, w, t, b) in enumerate(secs)], 'hull', n=20)
    ztop = T * 0.97
    # 背甲
    sb.prism([(0, .81 * H), (.6 * W, .48 * H), (.65 * W, -.57 * H), (.35 * W, -.9 * H), (-.35 * W, -.9 * H), (-.65 * W, -.57 * H), (-.6 * W, .48 * H)],
             0.16 * T, ztop + 0.03, 'plate', scale_top=0.92)
    sb.box((0, -.05 * H, ztop + 0.18 * T), (0.16 * W, 1.5 * H, 0.14 * T), 'hull')
    # 舷線發光描邊與窗列
    for sg in (1, -1):
        sb.ribbon([(sg * (w + 0.03), f, 0.12 * T) for (f, w, t, b) in secs[1:-1]], 0.10 * r ** 0.5, 'trim', up=(sg, 0, 0))
        sb.ribbon([(sg * (w * 0.97 + 0.03), f, -0.35 * T) for (f, w, t, b) in secs[2:-1]], 0.06 * r ** 0.5, 'trim', up=(sg, 0, 0))
        n_win = int(H * 0.9)
        for i in range(n_win):
            f = .62 * H - i * (1.25 * H / max(n_win, 1))
            w = W * (0.9 if f > -.5 * H else 0.7)
            sb.box((sg * (w + 0.04), f, 0.5 * T), (0.06, 0.34, 0.14), 'win')
    # 寶塔艦橋
    tiers = 7 if (big and theme == 'xz') else 6 if big else 2 if theme == 'ipc' else 4
    top = pagoda(sb, -.33 * H, ztop, tiers, base_w=(1.5 if big else 1.15) * W, base_l=(.2 if big else .3) * H, tier_h=0.55 * r ** 0.55 * (0.9 if big else 1.0),
                 mat_hull='hull', mat_plate='plate', mat_trim='trim', window_mat='win', shrink=0.8 if big else 0.77)
    sb.cyl((0, -.33 * H, top + 0.5), 0.07, 1.0, 'plate', axis='z', sides=6)
    sb.anchor('HP_COCKPIT', (0, -.33 * H + 0.4, top - 0.3 * r ** 0.4))
    sb.box((0, -.33 * H, top + 1.05), (0.5, 0.5, 0.1), 'nav')
    # 雙聯裝砲塔
    tpos = ([.80, .64, .48, .32, .16, -.08, -.24, -.40] if (big and theme == 'xz') else [.78, .62, .46, -.52, -.68, -.84] if big else [.52, .74] if theme != 'ipc' else [.6, .35, -.2])
    ts = 0.75 if big else 0.55
    for gi, fr in enumerate(tpos):
        f = fr * H
        sb.cyl((0, f, ztop + 0.12 * T), ts, 0.28 * r ** 0.4, 'plate', axis='z', sides=12)
        sb.box((0, f, ztop + 0.32 * T + 0.1), (ts * 1.5, ts * 2.0, 0.4 * r ** 0.4), 'hull', taper=(0.85, 0.9))
        for sg in (1, -1):
            sb.cyl((sg * ts * 0.36, f + ts * 1.3 + 0.6, ztop + 0.34 * T + 0.12), 0.09 * (1.4 if big else 1), 1.7 * (1.4 if big else 1), 'plate', axis='f', sides=8)
        sb.anchor('HP_GUN_%d' % (gi + 1), (0, f + ts * 1.3 + 1.5, ztop + 0.34 * T + 0.12))
    # 舷側
    if big:
        for sg in (1, -1):
            xo = sg * (W + 1.7)
            sb.loft([(.58 * H, .05, .05, .05, 0, 2.4), (.46 * H, .5 * W * .45, .5 * T, .42 * T, -.1 * T, 2.6), (.1 * H, .62 * W * .45, .55 * T, .5 * T, -.1 * T, 2.8),
                     (-.4 * H, .6 * W * .45, .5 * T, .45 * T, -.1 * T, 2.8), (-.66 * H, .35 * W * .45, .35 * T, .3 * T, -.1 * T, 2.4)], 'hull', n=14, xo=xo)
            sb.box((sg * (W + .8), .1 * H, -.1 * T), (1.8, 1.0, .35), 'plate')          # 連結樑
            sb.box((sg * (W + .8), -.3 * H, -.1 * T), (1.8, 1.0, .35), 'plate')
            sb.ribbon([(xo + sg * (.62 * W * .45 + .03), f, 0.0) for f in (.4 * H, .1 * H, -.3 * H, -.58 * H)], 0.09, 'trim', up=(sg, 0, 0))
            # 機庫（凹槽＋內部燈帶）
            sb.box((sg * (W * 0.93 + 0.05), -.12 * H, -.18 * T), (0.3, 0.16 * H, 0.8 * T), 'dark')
            sb.box((sg * (W * 0.93 + 0.12), -.12 * H, -.18 * T), (0.06, 0.15 * H, 0.14 * T), 'win')
    else:
        for sg in (1, -1):
            sb.box((sg * (W + 0.1), .1 * H, -.1 * T), (.55, 3.2, .6), 'hull', taper=(0.9, 0.9))
            for k2 in (-.3, .3):
                sb.cyl((sg * (W + 0.1 + k2 * .5), .1 * H + 2.2, -.1 * T), 0.07, 1.3, 'plate', axis='f', sides=8)
            sb.anchor('HP_GUN_%d' % (len(tpos) + (1 if sg > 0 else 2)), (sg * (W + 0.1), .1 * H + 2.9, -.1 * T))
    # 向後掃的弧形尾翼 + 航行燈
    pairs = [(-.45 * H, 0.35 * T, 1.0), (-.55 * H, -0.55 * T, -0.7)] + ([(-.35 * H, 0.1 * T, 0.5)] if big else [])
    for (rf, rz, curl) in ([] if theme == 'ipc' else pairs):
        for sg in (1, -1):
            swept_fin(sb, sg, rf, sg * W * 0.82, rz, length=.2 * H, span=.42 * H + 1.2, sweep=.34 * H, thick=0.14 * r ** 0.5, mat='hull', curl=curl * 0.08 * H)
    for sg in ((1, -1) if theme != 'ipc' else ()):
        sb.box((sg * (W * 0.82 + .42 * H + 1.2), -.45 * H - .34 * H + .1 * H, .35 * T + .1 * H * .08 * 4), (0.18, 0.4, 0.18), 'nav')
    # 腹龍骨
    sb.box((0, -.05 * H, -(T * 0.78) - 0.15), (.55 * W, .9 * H, .5), 'hull', taper=(0.85, 0.8))
    if theme == 'xz':   # 舷側飛彈發射陣列與金色艦首刃脊
        for sg in (1, -1):
            for k in range(5):
                f = (.5 - k * .16) * H
                sb.box((sg * (W + 1.9), f, .25 * T), (0.9, 2.4, 0.55), 'plate', taper=(0.9, 0.9))
                for j in (-1, 0, 1):
                    sb.cyl((sg * (W + 1.9 + j * 0.28), f + 1.4, .25 * T + 0.1), 0.09, 0.5, 'dark', axis='f', sides=6)
            sb.anchor('HP_MSL_%d' % (1 if sg > 0 else 2), (sg * (W + 1.9), .3 * H, .25 * T))
        sb.box((0, .9 * H, 0.05), (0.12, 0.35 * H, T * 1.4), 'trim')
    if theme == 'xz':   # 船尾圓環（參照美術設定圖）：銀白細環，環上有缺口與托架，兩顆青綠圓球、頂部矩形發光節點、底部尖刺
        f0, R = -.70 * H, .27 * H
        def pt(ang, rr=R):
            a = math.radians(ang); return (math.cos(a) * rr, f0, math.sin(a) * rr)
        for (a0, a1) in ((38, 82), (98, 142), (158, 382)):
            sb.torus((0, f0, 0), R, 0.42, 'plate', axis='f', major=max(8, int((a1 - a0) / 6)), minor=8, a0=math.radians(a0), a1=math.radians(a1))
        sb.torus((0, f0, 0), R - 0.5, 0.07, 'trim', axis='f', major=60, minor=6)                      # 內側細描邊
        for ang in (150, 30):                                                                          # 兩顆青綠球＋月牙托架
            c = pt(ang)
            sb.sphere(c, 1.1, 'green', seg=14, rings=8)
            sb.torus(c, 1.45, 0.14, 'plate', axis='f', major=14, minor=6, a0=math.radians(ang + 90 - 120), a1=math.radians(ang + 90 + 120))
        c = pt(90, R + 0.1)                                                                            # 頂部矩形節點
        sb.box(c, (1.1, 0.7, 1.7), 'plate'); sb.box((c[0], f0 + 0.38, c[2]), (0.18, 0.05, 1.2), 'green')
        sb.cyl((0, f0, -R - 1.2), 0.55, 2.8, 'plate', axis='z', sides=6, r2=0.04)                      # 底部尖刺
        for ang in (45, 135, 225, 315):                                                                # 連接艦體的細樑
            a = math.radians(ang); sb.ribbon([(math.cos(a) * W * 0.8, f0, math.sin(a) * T * 0.8), (math.cos(a) * (R - 0.1), f0, math.sin(a) * (R - 0.1))], 0.22, 'plate', up=(0, 1, 0))
        for (a0, a1) in ((115, 245), (-65, 65)):                                                       # 橫向的扁平弧環（繞著艦體）
            sb.torus((0, f0 - 1.0, 0), R * 1.3, 0.12, 'plate', axis='z', major=24, minor=6, a0=math.radians(a0), a1=math.radians(a1))
    if theme == 'ipc':   # 背部發光脊線 + 艦首方形砲口
        sb.box((0, .1 * H, ztop + 0.3 * T), (0.35 * W, 1.1 * H, 0.3 * T), 'trim', taper=(0.7, 0.8))
        sb.box((0, .9 * H, 0), (0.7 * W, 0.2 * H, 0.9 * T), 'plate', taper=(0.6, 0.8))
        for sg in (1, -1):
            sb.cyl((sg * W * 0.4, .98 * H, 0.0), 0.22 * r ** 0.5, 1.6, 'dark', axis='f', sides=8)
        sb.anchor('HP_GUN_%d' % (len(tpos) + 1), (W * 0.4, .98 * H + 1.2, 0.0)); sb.anchor('HP_GUN_%d' % (len(tpos) + 2), (-W * 0.4, .98 * H + 1.2, 0.0))
    # 引擎
    ne = 5 if big else 3
    xs = [0, 1, -1, 2, -2][:ne]
    for ei, xi in enumerate(xs):
        x = xi * (1.3 if big else 0.85) * r ** 0.3
        sb.cyl((x, -1.0 * H - 0.25, 0.1 * T), 0.45 * r ** 0.5, 1.0, 'hull', axis='f', sides=12)
        sb.cyl((x, -1.0 * H - 0.8, 0.1 * T), 0.36 * r ** 0.5, 0.12, 'glow', axis='f', sides=12)
        sb.anchor('HP_ENGINE_%d' % (ei + 1), (x, -1.0 * H - 1.0, 0.1 * T))
    sb.export(os.path.join(out, name + '.glb'))


def cruiser(out):
    capital(out, 'cruiser', 10.5, False)


def dread(out):
    capital(out, 'dread', 26.0, True)


def xzd(out):   # 仙舟聯盟無畏艦：比黑塔空間站更大
    capital(out, 'xzd', 40.0, True, 'xz')


def ipc(out):   # 星際和平公司巡洋艦
    capital(out, 'ipc', 12.0, False, 'ipc')


# ═════════════════ 聯軍：HSS 旗艦（黑塔太空站旗艦；美術圖：尾部有輪輻圓環的長矛形主力艦） ═════════════════
# 參照美術圖：艦首是帶藍色箭頭（>>）紋的長方形突刺；中段為層疊裝甲、橘色與紅色燈；
# 船尾是大型輪輻圓環（外圈弧框上有圓形發射節點）與放射狀天線。遊戲中以黃色為主色。
def hss(out):
    reset()
    M = {
        'hull': make_mat('hull', hexc('#1b2748'), 0.65, 0.42),
        'plate': make_mat('plate', hexc('#f0c23a'), 0.65, 0.34),     # 黃色裝甲
        'white': make_mat('white', hexc('#e4e9f7'), 0.4, 0.5),
        'dark': make_mat('dark', hexc('#070a16'), 0.3, 0.7),
        'trim': make_mat('trim', hexc('#201808'), 0.2, 0.6, emit=hexc('#ffe9a0'), emit_strength=1.0),
        'chev': make_mat('chev', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#5aa8ff'), emit_strength=1.0),
        'orange': make_mat('orange', hexc('#301000'), 0.2, 0.6, emit=hexc('#ff8a30'), emit_strength=1.0),
        'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#ffe08a'), emit_strength=1.0),
        'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
    }
    sb = ShipBuilder('hss', M)
    # 艦首長矛
    sb.loft([(34, 1.6, 1.3, 1.3, 0, 3.5), (30, 2.1, 1.7, 1.7, 0, 4.0), (14, 2.2, 1.8, 1.7, 0, 4.0), (8, 2.8, 2.0, 1.7, 0, 3.2)], 'hull', n=20)
    sb.box((0, 31.5, 0), (3.4, 5.0, 2.8), 'white', taper=(0.95, 1.0))                         # 箭頭紋所在的前端塊
    for sg in (1, -1):
        for k in range(3):                                                                    # 側面 >> 箭頭
            f0 = 30 + k * 1.3
            sb.ribbon([(sg * 1.75, f0, 0.9), (sg * 1.75, f0 + 1.0, 0.0), (sg * 1.75, f0, -0.9)], 0.22, 'chev', up=(sg, 0, 0))
        sb.ribbon([(sg * 2.25, f, 0.0) for f in (27, 22, 16, 10)], 0.14, 'trim', up=(sg, 0, 0))
        sb.box((sg * 2.0, 20, 1.0), (0.4, 8.0, 0.5), 'plate')                                 # 黃色側板
    sb.box((0, 26, 1.95), (1.6, 12, 0.5), 'plate', taper=(0.9, 0.95))                         # 上方黃色背板
    sb.box((0, 24, -1.95), (1.4, 12, 0.4), 'hull')
    # 主艦體：層疊裝甲
    sb.loft([(10, 2.4, 1.8, 1.5, 0, 3.0), (4, 3.6, 2.4, 1.9, 0, 3.0), (-6, 4.2, 2.9, 2.1, 0, 3.0), (-16, 3.4, 2.4, 1.8, 0, 2.8), (-19, 2.2, 1.6, 1.4, 0, 2.6)], 'hull', n=22)
    for sg in (1, -1):
        sb.box((sg * 4.6, -2, 0.3), (1.2, 16, 2.6), 'plate', taper=(0.9, 0.95))                 # 側裝甲（黃）
        sb.box((sg * 5.35, -2, 0.3), (0.14, 15, 0.5), 'orange')                               # 橘色燈帶
        for k in range(5):
            sb.box((sg * 4.1, 3 - k * 3.2, 2.0), (0.9, 2.2, 0.4), 'white')                     # 背部層疊板
        sb.box((sg * 3.2, -12, 2.2), (1.4, 5.5, 0.5), 'plate')
        sb.box((sg * 5.6, 5, -0.4), (0.12, 0.5, 0.5), 'nav')
        sb.box((sg * 5.6, -9, -0.4), (0.12, 0.5, 0.5), 'nav')
    # 上層結構與砲塔
    sb.box((0, -3, 3.3), (5.5, 8.5, 2.2), 'hull', taper=(0.8, 0.8))
    sb.box((0, -3, 4.6), (4.0, 6.5, 0.4), 'plate')
    sb.box((0, -5, 5.6), (2.6, 3.8, 1.8), 'white', taper=(0.8, 0.8))
    sb.box((0, -5.0 + 1.95, 5.7), (1.9, 0.08, 0.5), 'trim')
    sb.anchor('HP_COCKPIT', (0, -3.6, 6.0))
    sb.cyl((0, -5, 7.6), 0.07, 3.2, 'white', axis='z', sides=6)
    for gi, f in enumerate((6.0, 0.5, -10.5)):
        sb.cyl((0, f, 3.0 if f != 0.5 else 4.9), 1.1, 0.5, 'white', axis='z', sides=14)
        sb.box((0, f, 3.4 if f != 0.5 else 5.3), (2.2, 2.8, 0.7), 'hull', taper=(0.85, 0.9))
        for sg in (1, -1):
            sb.cyl((sg * 0.5, f + 3.4, 3.5 if f != 0.5 else 5.4), 0.15, 3.0, 'white', axis='f', sides=8)
        sb.anchor('HP_GUN_%d' % (gi + 1), (0, f + 4.9, 3.5 if f != 0.5 else 5.4))
    # 太陽能帆板（腹側薄金板）
    for sg in (1, -1):
        sb.prism([(sg * 3.5, 5), (sg * 8.5, -4), (sg * 8.5, -12), (sg * 3.5, -9)], 0.1, -2.1, 'plate', tilt=-0.05)
        sb.ribbon([(sg * 3.6, 5, -2.0), (sg * 8.4, -4, -2.0)], 0.12, 'trim', up=(0, 0, 1))
    # 尾部：輪輻圓環
    WF = -27.0
    sb.cyl((0, -22, 0), 2.4, 6.0, 'hull', axis='f', sides=16)
    sb.cyl((0, WF, 0), 3.4, 3.2, 'white', axis='f', sides=20)
    sb.cyl((0, WF - 1.9, 0), 2.6, 0.2, 'glow', axis='f', sides=20)
    sb.torus((0, WF, 0), 12.5, 0.95, 'plate', axis='f', major=48, minor=8)                    # 主輪圈
    sb.torus((0, WF, 0), 11.1, 0.28, 'trim', axis='f', major=48, minor=6)                     # 內側燈圈
    # 輪輻：十字四根粗輻條 + 四根斜向細輻條（皆為平面薄樑）
    for k in range(4):
        a = k * math.pi / 2
        c, sn = math.cos(a), math.sin(a)
        sb.box((c * 7.6, WF, sn * 7.6), (8.4 if abs(c) > 0.5 else 0.7, 0.8, 8.4 if abs(sn) > 0.5 else 0.7), 'white')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        p0, p1 = (math.cos(a) * 3.4, WF, math.sin(a) * 3.4), (math.cos(a) * 11.6, WF, math.sin(a) * 11.6)
        sb.ribbon([p0, p1], 0.5, 'white', up=(0, 1, 0))
        sb.ribbon([p0, p1], 0.5, 'white', up=(0, -1, 0))
    # 外圈弧框與圓形發射節點
    sb.torus((0, WF - 0.5, 0), 15.4, 0.32, 'white', axis='f', major=36, minor=6, a0=math.radians(-40), a1=math.radians(220))
    for ang in (-40, 90, 220):
        a = math.radians(ang)
        sb.sphere((math.cos(a) * 15.4, WF - 0.5, math.sin(a) * 15.4), 1.1, 'white', seg=14, rings=8)
        sb.sphere((math.cos(a) * 15.4, WF - 0.5 + 0.5, math.sin(a) * 15.4), 0.7, 'glow', seg=10, rings=6)
    for k in range(4):                                                                         # 外圈連桿
        a = math.radians(-40 + k * 86.0)
        sb.ribbon([(math.cos(a) * 12.5, WF - 0.2, math.sin(a) * 12.5), (math.cos(a) * 15.2, WF - 0.5, math.sin(a) * 15.2)], 0.35, 'white', up=(0, 1, 0))
    # 放射狀天線與尾刺
    for k in range(10):
        a = k * math.pi / 5 + 0.2
        sb.cyl((math.cos(a) * 13.2, WF, math.sin(a) * 13.2), 0.14, 3.2, 'white', axis='f', sides=6, r2=0.02)
    sb.cyl((0, WF - 9, 0), 0.4, 14.0, 'white', axis='f', sides=8, r2=0.03)
    sb.cyl((0, WF - 2.2, 4.8), 0.14, 8.0, 'white', axis='f', sides=6, r2=0.02)
    sb.cyl((0, WF - 2.2, -4.8), 0.14, 8.0, 'white', axis='f', sides=6, r2=0.02)
    sb.anchor('HP_ENGINE_1', (0, WF - 2.2, 0))
    sb.anchor('HP_ENGINE_2', (3.4, -23.5, 0.0))
    sb.anchor('HP_ENGINE_3', (-3.4, -23.5, 0.0))
    sb.export(os.path.join(out, 'hss.glb'))



# ═════════════════ 聯軍：螺絲咕姆行星級艦（月球大小的黃色星球，主砲為「巨型光束泡」） ═════════════════
def moon(out):
    import random
    reset()
    M = {
        'rock': make_mat('rock', hexc('#a9831c'), 0.1, 0.8),
        'dark': make_mat('dark', hexc('#5c4410'), 0.1, 0.88),
        'plate': make_mat('plate', hexc('#c9a73c'), 0.55, 0.4),
        'metal': make_mat('metal', hexc('#3a321c'), 0.8, 0.4),
        'glow': make_mat('glow', hexc('#201a08'), 0.2, 0.6, emit=hexc('#fff2b8'), emit_strength=1.0),
        'trim': make_mat('trim', hexc('#201a08'), 0.2, 0.6, emit=hexc('#ffd24a'), emit_strength=1.0),
    }
    sb = ShipBuilder('moon', M)
    rnd = random.Random(7)
    ret = bmesh.ops.create_icosphere(sb.bm, subdivisions=4, radius=1.0)
    craters = []
    for _ in range(22):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        if d.y > 0.55:   # 前方留給主砲口
            continue
        craters.append((d, rnd.uniform(0.07, 0.22), rnd.uniform(0.018, 0.05)))
    cannon = Vector((0, 1, 0))
    for v in ret['verts']:
        p = v.co.normalized()
        h = noise.fractal(p * 3.0, 0.5, 2.0, 4, noise_basis='PERLIN_ORIGINAL') * 0.03
        for (d, sz, dep) in craters:
            a = math.acos(max(-1, min(1, p.dot(d))))
            if a < sz * 1.35:
                t = a / (sz * 1.35)
                h -= dep * (1 - t * t) ** 2
                if 0.75 < t < 0.95:
                    h += dep * 0.25
        a = math.acos(max(-1, min(1, p.dot(cannon))))     # 主砲口：圓形凹陷
        if a < 0.42:
            t = a / 0.42
            h -= 0.075 * (1 - t ** 4)
        v.co = p * (1 + h)
    faces = set()
    for v in ret['verts']:
        for f in v.link_faces:
            faces.add(f)
    for f in faces:
        r = sum(v.co.length for v in f.verts) / len(f.verts)
        f.material_index = sb.idx['dark'] if r < 0.985 else sb.idx['rock']
        f.smooth = True
    # 主砲口：框環、內部光盤與環形發射器
    sb.torus((0, 0.93, 0), 0.38, 0.035, 'plate', axis='f', major=40, minor=8)
    sb.torus((0, 0.915, 0), 0.31, 0.012, 'trim', axis='f', major=40, minor=6)
    sb.cyl((0, 0.885, 0), 0.30, 0.03, 'glow', axis='f', sides=28)
    for k in range(8):
        a = k * math.pi / 4
        sb.sphere((math.cos(a) * 0.5, 0.86, math.sin(a) * 0.5), 0.04, 'trim', seg=8, rings=5)
    # 緯度帶、軌道環與天線
    sb.torus((0, 0, 0), 1.012, 0.012, 'trim', axis='z', major=64, minor=6)
    sb.torus((0, 0, 0), 1.012, 0.010, 'plate', axis='x', major=64, minor=6)
    sb.torus((0, 0, 0), 1.34, 0.012, 'plate', axis='f', major=64, minor=6)
    for k in range(8):
        a = k * math.pi / 4 + 0.2
        sb.sphere((math.cos(a) * 1.34, 0, math.sin(a) * 1.34), 0.03, 'trim', seg=8, rings=5)
        sb.cyl((math.cos(a) * 1.17, 0, math.sin(a) * 1.17), 0.006, 0.34, 'plate', axis='x' if abs(math.cos(a)) > 0.7 else 'z', sides=5)
    for k in range(12):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 0.3), rnd.uniform(-1, 1))).normalized()
        c = d * 1.07
        ax = 'x' if abs(d.x) > max(abs(d.y), abs(d.z)) else ('f' if abs(d.y) > abs(d.z) else 'z')
        sb.cyl(tuple(c), 0.012, 0.18, 'metal', axis=ax, sides=5, r2=0.003)
    sb.anchor('HP_GUN_1', (0, 0.92, 0))
    sb.anchor('HP_ENGINE_1', (0, -1.0, 0))
    sb.export(os.path.join(out, 'moon.glb'))


# ═════════════════ 反物質軍團：鯨形旗艦（美術圖：圓潤的鯨／魟形艦體、金色窗列、藍色符文、鰓狀鰭片） ═════════════════
def whale(out):
    reset()
    M = {
        'hull': make_mat('hull', hexc('#2c2560'), 0.5, 0.5),
        'plate': make_mat('plate', hexc('#4a4192'), 0.4, 0.5),
        'fin': make_mat('fin', hexc('#5b4cc0'), 0.45, 0.5),
        'dark': make_mat('dark', hexc('#0c0a22'), 0.3, 0.7),
        'trim': make_mat('trim', hexc('#10102a'), 0.2, 0.6, emit=hexc('#ece6ff'), emit_strength=1.0),
        'gold': make_mat('gold', hexc('#201408'), 0.2, 0.6, emit=hexc('#ffc83a'), emit_strength=1.0),
        'glyph': make_mat('glyph', hexc('#06182a'), 0.2, 0.6, emit=hexc('#4ad0ff'), emit_strength=1.0),
        'void': make_mat('void', hexc('#10062a'), 0.2, 0.6, emit=hexc('#a566ff'), emit_strength=1.0),
    }
    sb = ShipBuilder('whale', M)
    secs = [(13.5, .1, .1, .1, 0, 2.0), (12.2, 1.6, 1.1, 1.3, -.1, 2.3), (9, 3.2, 1.9, 2.3, -.2, 2.2), (4, 4.4, 2.3, 3.0, -.3, 2.3),
            (-2, 4.6, 2.3, 3.3, -.35, 2.3), (-8, 3.6, 1.9, 2.6, -.3, 2.4), (-12, 2.0, 1.0, 1.4, -.2, 2.2), (-13.5, .6, .4, .5, -.1, 2.0)]
    sb.loft(secs, 'hull', n=26)
    # 上甲板（淡紫白）與邊緣發光、中央金色光帶
    deck = [(0, 11.5), (2.6, 8), (3.5, 2), (3.4, -5), (2.0, -10), (-2.0, -10), (-3.4, -5), (-3.5, 2), (-2.6, 8)]
    sb.prism(deck, 0.10, 2.2, 'plate', scale_top=0.97)
    sb.ribbon([(x * 1.0, f, 2.27) for (x, f) in deck], 0.20, 'trim', closed=True)
    sb.ribbon([(0, 9.5, 2.34), (0, -4, 2.34)], 0.4, 'gold')
    sb.box((0, 0.5, 2.5), (1.2, 7.0, 0.3), 'hull', taper=(0.8, 0.9))
    # 窗列（黃）與藍色圓形符文
    for sg in (1, -1):
        for k in range(11):
            f = 8.2 - k * 1.45
            w = 3.3 if f > 0 else 3.9 - (-f) * 0.1
            sb.box((sg * (w + 0.12), f, 0.55), (0.14, 0.55, 0.26), 'gold')
            if k % 2 == 0:
                sb.box((sg * (w + 0.1), f - 0.7, -0.35), (0.12, 0.5, 0.2), 'gold')
        for (f, z, rr) in ((2.0, 1.0, 0.6), (-4.0, 0.9, 0.45)):
            sb.cyl((sg * 4.45, f, z), rr, 0.12, 'glyph', axis='x', sides=18)
            sb.cyl((sg * 4.4, f, z), rr * 1.35, 0.08, 'plate', axis='x', sides=18)
    # 鰓狀鰭片：腹側向後下方層疊
    for i in range(6):
        for sg in (1, -1):
            swept_fin(sb, sg, -1.5 - i * 1.7, sg * (3.4 - i * 0.18), -2.0 - i * 0.06, length=2.8 - i * 0.12, span=4.2 + i * 0.5, sweep=3.4, thick=0.14, mat='fin', curl=-1.9)
    # 尾鰭
    for sg in (1, -1):
        swept_fin(sb, sg, -11.5, sg * 0.7, -0.2, length=3.6, span=6.6, sweep=2.6, thick=0.2, mat='hull', curl=0.4)
    # 尾部虛空光源與錨點
    sb.sphere((0, -13.6, -0.1), 0.85, 'void', seg=14, rings=8, scale=(1, 1.2, 1))
    sb.anchor('HP_ENGINE_1', (0, -14.4, -0.1))
    for k, (x, f, z) in enumerate(((2.4, 10.0, -1.3), (-2.4, 10.0, -1.3), (3.2, 6.0, -2.0), (-3.2, 6.0, -2.0))):
        sb.anchor('HP_GUN_%d' % (k + 1), (x, f, z))
        sb.sphere((x, f, z), 0.28, 'void', seg=8, rings=5)
    sb.export(os.path.join(out, 'whale.glb'))


# ═════════════════ 反物質軍團：蝶翼機（藍色蝶翼的小型單位） ═════════════════
def butterfly(out):
    reset()
    M = {
        'body': make_mat('body', hexc('#1a1f44'), 0.6, 0.45),
        'wing': make_mat('wing', hexc('#0c1c5a'), 0.25, 0.4),
        'vein': make_mat('vein', hexc('#06142a'), 0.2, 0.6, emit=hexc('#44b4ff'), emit_strength=1.0),
        'core': make_mat('core', hexc('#10062a'), 0.2, 0.6, emit=hexc('#b074ff'), emit_strength=1.0),
    }
    sb = ShipBuilder('butterfly', M)
    # 身體：細長機甲軀幹、頭部與拖曳的雙腿
    sb.loft([(2.4, .05, .05, .05, 0, 2), (1.8, .28, .26, .22, 0, 2.4), (0.2, .42, .38, .3, 0, 2.6), (-1.6, .30, .3, .24, 0, 2.4), (-2.6, .08, .1, .08, 0, 2)], 'body', n=12)
    sb.sphere((0, 1.9, 0.18), 0.26, 'core', seg=10, rings=6)
    sb.sphere((0, 0.2, 0.12), 0.2, 'core', seg=8, rings=5)
    for sg in (1, -1):
        sb.cyl((sg * 0.16, -2.7, -0.1), 0.06, 1.6, 'body', axis='f', sides=6, r2=0.02)
        # 上翅：前緣長而尖的燕尾形；下翅：短而帶尾突
        up = [(sg * 0.3, 0.6), (sg * 1.5, 2.5), (sg * 3.2, 3.5), (sg * 5.0, 2.7), (sg * 4.2, 1.4), (sg * 3.0, 0.6), (sg * 3.7, -0.5), (sg * 2.0, -1.0), (sg * 0.4, -0.4)]
        lo = [(sg * 0.3, -0.5), (sg * 2.4, -1.1), (sg * 3.6, -2.7), (sg * 3.0, -4.0), (sg * 1.8, -2.7), (sg * 0.5, -1.8)]
        sb.prism(up, 0.05, 0.15, 'wing', tilt=0.07)
        sb.prism(lo, 0.05, 0.1, 'wing', tilt=0.06)
        for poly in (up, lo):
            sb.ribbon([(x, f, 0.18 + 0.07 * abs(x)) for (x, f) in poly], 0.09, 'vein', closed=True)
        sb.ribbon([(sg * 0.5, 0.5, 0.2), (sg * 2.2, 1.5, 0.32), (sg * 4.0, 2.2, 0.46)], 0.07, 'vein')
        sb.ribbon([(sg * 0.5, 0.0, 0.2), (sg * 2.6, 0.3, 0.36), (sg * 4.2, 0.9, 0.5)], 0.06, 'vein')
        sb.ribbon([(sg * 0.5, -0.9, 0.18), (sg * 2.0, -1.8, 0.27), (sg * 2.6, -3.2, 0.31)], 0.06, 'vein')
    sb.anchor('HP_ENGINE_1', (0, -3.0, 0.0))
    sb.anchor('HP_GUN_1', (0.2, 2.3, 0.1))
    sb.anchor('HP_GUN_2', (-0.2, 2.3, 0.1))
    sb.export(os.path.join(out, 'butterfly.glb'))


# ═════════════════ 通用：爆炸碎片（稜角岩塊，部分面燒得發橘） ═════════════════
def debris(out):
    import random
    reset()
    M = {
        'rock': make_mat('rock', hexc('#2a2a3c'), 0.5, 0.6),
        'hot': make_mat('hot', hexc('#301000'), 0.2, 0.6, emit=hexc('#ff7a28'), emit_strength=1.0),
    }
    sb = ShipBuilder('debris', M)
    rnd = random.Random(3)
    pts = []
    for _ in range(11):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        pts.append(tuple(d * rnd.uniform(0.55, 1.0) * Vector((1.0, 0.7, 1.4))))
    sb.convex(pts, 'rock', hot_mat='hot', hot_n=2, seed=5)
    sb.export(os.path.join(out, 'debris.glb'))



# ═════════════════ 鐵墓（Irontomb）：行星級的巨人 ═════════════════
# 依美術設定圖（正面 T 字站姿）製作：
#   · 高聳的尖頂＋盾形兜帽，兜帽內是層層疊疊的紫光百葉，正中一顆洋紅菱形核心
#   · 十字平舉的主臂：沙漏形肩段 → 帶 T 形棘刺的齒輪環 → 長前臂 → 骨骼狀手掌
#   · 肩胛碎片、頸椎串、胸前骨板與紫色縫隙光
#   · 第二對細臂垂在身側；腰間一圈棘刺環；腰部垂下多對細長多節的手臂
#   · 下半身為逐漸收尖的碎片裙擺，中央有紫光縫
# 座標：x 左右（對稱）、f 前後（+f 為正面）、z 上下；全高約 248、手尖寬約 ±138（遊戲內單位）。
def irontomb(out):
    """依 3D 美術設定圖（T-pose 前後視圖）重做：座標單位使全高 ≈ 248。
    量測依據：全高 580px ↔ 248 單位；手臂水平線與兜帽同高（z≈86）；雙臂半展幅 ≈ 122；
    兜帽小而尖（半寬 ≈ 19）；環齒輪在 x≈46；腰間荊棘環半徑 ≈ 41、高 z≈14；垂手只有約 35 單位長；
    裙擺上寬下尖，尾端雙尖，總長延伸到 z≈-124。配色為灰褐骨質＋薰衣草色嵌紋。"""
    reset()
    M = {
        'armor': make_mat('armor', hexc('#5b4a53'), 0.12, 0.74),
        'bone': make_mat('bone', hexc('#74616c'), 0.1, 0.7),
        'dark': make_mat('dark', hexc('#3b2e38'), 0.15, 0.75),
        'thorn': make_mat('thorn', hexc('#5e403f'), 0.2, 0.65),
        'glow': make_mat('glow', hexc('#7d6ad4'), 0.1, 0.55, emit=hexc('#7a62ee'), emit_strength=0.75),
        'core': make_mat('core', hexc('#e6dcff'), 0.1, 0.4, emit=hexc('#d3bcff'), emit_strength=1.7),
        'hand': make_mat('hand', hexc('#a99aef'), 0.1, 0.55, emit=hexc('#7a68d8'), emit_strength=0.5),
    }
    # 兩隻主臂（最上面那一對）各自獨立的材質名（後綴 _aL／_aR）：匯出後成為獨立零件，遊戲裡可繞肩膀轉動（末日：舉劍、下刺）
    for suf in ('_aL', '_aR'):
        M['armor' + suf] = make_mat('armor' + suf, hexc('#5b4a53'), 0.12, 0.74)
        M['bone' + suf] = make_mat('bone' + suf, hexc('#74616c'), 0.1, 0.7)
        M['thorn' + suf] = make_mat('thorn' + suf, hexc('#5e403f'), 0.2, 0.65)
        M['hand' + suf] = make_mat('hand' + suf, hexc('#a99aef'), 0.1, 0.55, emit=hexc('#7a68d8'), emit_strength=0.5)
    sb = ShipBuilder('irontomb', M)
    ZA = 86.0                                    # 主臂高度（與兜帽同高）

    def hand(c, d, fingers=4, flen=11.0, spread=3.2, palm=(7.0, 1.6, 7.0), thumb=True, lift=(0, 0.7, 0), mat='hand'):
        """修長的開掌：掌板＋兩節指骨＋拇指；d 為指尖方向單位向量。"""
        sb.box(c, palm, mat)
        dv = Vector(d).normalized()
        side = Vector((0, 1, 0)).cross(dv)
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        side.normalize()
        half = palm[1] / 2.0 if abs(dv.y) >= max(abs(dv.x), abs(dv.z)) else (palm[0] / 2.0 if abs(dv.x) > 0.5 else palm[2] / 2.0)
        for k in range(fingers):
            o = (k - (fingers - 1) / 2.0) * spread
            base = Vector(c) + dv * half + side * o
            mid = base + dv * flen * 0.55 + side * o * 0.10
            tip = mid + dv * flen * 0.45 + Vector(lift) + side * o * 0.08
            sb.bar(tuple(base), tuple(mid), 0.55, mat, sides=5, r2=0.45)
            sb.bar(tuple(mid), tuple(tip), 0.45, mat, sides=5, r2=0.22)
        if thumb:
            th = Vector(c) + side * (-palm[2] / 2.0 - 0.2)
            sb.bar(tuple(th), tuple(th + dv * flen * 0.45 + side * -3.4 + Vector(lift)), 0.6, mat, sides=5, r2=0.25)

    # ── 尖頂：薄刃狀 ──
    sb.prism_xz([(0, 126), (4.5, 112), (8.5, 99), (0, 95), (-8.5, 99), (-4.5, 112)], 4.0, 0.5, 'armor')
    sb.prism_xz([(0, 120), (2.6, 109), (0, 101), (-2.6, 109)], 4.5, 0.5, 'glow')
    # ── 兜帽：小而尖的盾形，前面是薰衣草 V 形嵌紋框住發亮菱形 ──
    sb.loft_v([(100, 6, 3.6, 3.2, 0, 1.0, 2.2), (94, 13, 6.4, 6.0, 0, 1.4, 2.4), (87, 19, 8.2, 7.4, 0, 2.0, 2.6), (79, 14, 7.4, 6.6, 0, 2.0, 2.4), (71, 6.5, 4.2, 3.8, 0, 1.0, 2.2)], 'armor', n=16, smooth=False)
    sb.prism_xz([(-17.5, 96), (-13.0, 97.5), (0, 79), (13.0, 97.5), (17.5, 96), (0, 70)], 1.0, 8.6, 'glow')
    sb.sphere((0, 9.6, 85), 1.0, 'core', seg=4, rings=2, scale=(5.6, 1.5, 11.5), smooth=False)
    for sg in (1, -1):                           # 兜帽兩側的「耳」板，連到肩上
        sb.prism_xz([(sg * 15, 97), (sg * 28, 93), (sg * 32, 87), (sg * 28, 81), (sg * 16, 80)], 3.4, 0.0, 'armor')
        sb.prism_xz([(sg * 17, 94), (sg * 26, 91), (sg * 29, 87), (sg * 25, 84)], 3.7, 0.0, 'glow')
    sb.anchor('HP_CORE', (0, 10, 85))

    # ── 百葉（上寬下窄的肋片）與頸椎 ──
    for i in range(6):
        z = 72.0 - i * 2.0
        w = 14.0 - i * 1.1
        sb.box((0, 1.2, z), (2 * w, 11, 1.25), 'bone')
        if i % 2 == 0:
            sb.box((0, 6.9, z), (2 * w - 5, 0.6, 0.55), 'glow')
    for i in range(5):
        z = 59.0 - i * 2.2
        sb.box((0, 0, z), (9.5 - 0.5 * i, 6.5, 1.5), 'bone')
        for sg in (1, -1):
            sb.bar((sg * (4.6 - 0.2 * i), 0, z), (sg * (9.5 - 0.3 * i), -1.5, z + 1.6), 0.7, 'bone', sides=4, r2=0.15)

    # ── 胸腹：細長脊柱式軀幹、背棘與薰衣草嵌紋 ──
    sb.loft_v([(52, 6, 4.0, 3.6, 0, 0, 2.4), (44, 10, 6.0, 5.2, 0, 0, 2.5), (34, 9, 5.5, 5.0, 0, 0, 2.4), (24, 7.5, 5.0, 4.5, 0, 0, 2.4), (14, 6.2, 4.6, 4.2, 0, 0, 2.4), (6, 7.8, 5.2, 4.6, 0, 0, 2.4)], 'armor', n=14, smooth=False)
    sb.sphere((0, 5.6, 41), 1.0, 'glow', seg=6, rings=3, scale=(5.4, 1.0, 6.5), smooth=False)
    sb.sphere((0, 5.0, 25), 1.0, 'glow', seg=6, rings=3, scale=(3.4, 1.0, 8.0), smooth=False)
    sb.sphere((0, 5.2, 9), 1.0, 'glow', seg=6, rings=3, scale=(5.0, 1.0, 4.0), smooth=False)
    sb.ribbon([(0, -5.0, 50), (0, -5.0, 8)], 2.4, 'glow', up=(0, 1, 0))
    sb.sphere((0, -5.4, 38), 1.0, 'glow', seg=6, rings=3, scale=(4.8, 1.0, 6.0), smooth=False)
    sb.prism_xz([(-14, 94), (-9, 95), (0, 80), (9, 95), (14, 94), (0, 74)], 0.9, -7.6, 'glow')
    for sg in (1, -1):
        for z, L in ((48, 14), (40, 18), (32, 16), (24, 12)):
            sb.prism_xz([(sg * 5, z + 1.5), (sg * (6 + L), z - 3), (sg * (5 + L * 0.55), z - 8), (sg * 4, z - 7)], 2.4, -1.8, 'bone')
            sb.prism_xz([(sg * 4.5, z - 3), (sg * (4 + L * 0.7), z - 10), (sg * 4, z - 12)], 2.0, 1.6, 'dark')
        sb.bar((sg * 5, 0, 60), (sg * 19, 0, 56), 1.5, 'bone', sides=5, r2=1.0)            # 鎖骨
        sb.bar((sg * 18, -1, 57), (sg * 22, -3, 41), 2.0, 'bone', sides=5, r2=0.9)         # 肩胛骨

    # ── 主臂（與兜帽同高、水平展開）：沙漏肩 → 荊棘齒輪環 → 長前臂 → 開掌 ──
    for sg in (1, -1):
        sf = '_aR' if sg > 0 else '_aL'
        sb.box((sg * 21, 0, ZA + 1), (8, 9, 12), 'armor' + sf, rot=(0, sg * 0.0, 0))
        sb.bar((sg * 17, 0, ZA), (sg * 28, 0, ZA), 4.8, 'armor' + sf, sides=8, r2=2.3)
        sb.bar((sg * 28, 0, ZA), (sg * 40, 0, ZA), 2.3, 'armor' + sf, sides=8, r2=4.6)
        sb.bar((sg * 40, 0, ZA), (sg * 46, 0, ZA), 5.0, 'bone' + sf, sides=8)
        x0 = sg * 46.0
        sb.torus((x0, 0, ZA), 8.4, 0.5, 'thorn' + sf, axis='x', major=28, minor=5)
        for k in range(14):
            a = 2 * math.pi * k / 14
            c, sn = math.cos(a), math.sin(a)
            sb.bar((x0, 8.0 * c, ZA + 8.0 * sn), (x0, 11.5 * c, ZA + 11.5 * sn), 0.5, 'thorn' + sf, sides=4)
            tx, tz = -sn, c
            sb.bar((x0, 11.5 * c - tx * 1.9, ZA + 11.5 * sn - tz * 1.9), (x0, 11.5 * c + tx * 1.9, ZA + 11.5 * sn + tz * 1.9), 0.45, 'thorn' + sf, sides=4)
        sb.bar((sg * 46, 0, ZA), (sg * 54, 0, ZA), 4.4, 'armor' + sf, sides=8, r2=3.6)
        sb.bar((sg * 54, 0, ZA), (sg * 91, 0, ZA), 3.4, 'armor' + sf, sides=8, r2=1.9)
        sb.prism_xz([(sg * 56, ZA + 3.4), (sg * 74, ZA + 2.4), (sg * 91, ZA + 1.4), (sg * 91, ZA - 1.4), (sg * 74, ZA - 2.4), (sg * 56, ZA - 3.4)], 1.4, 0.0, 'bone' + sf)
        sb.bar((sg * 88, 0, ZA), (sg * 96, 0, ZA), 2.2, 'bone' + sf, sides=8, r2=3.2)
        hand((sg * 100.0, 0, ZA), (sg, 0, 0), fingers=4, flen=17, spread=2.5, palm=(8.0, 1.3, 9.0), mat='hand' + sf)

        # ── 第二對手臂：攤手——上臂自然下垂微向外，小臂向外前方伸出，掌心朝上、五指自然張開（依設定圖修正，原先誤作瑜珈手印）──
        sb.sphere((sg * 19, 0, 54), 2.6, 'bone', seg=8, rings=5)
        sb.bar((sg * 19, 0, 54), (sg * 30, 3, 40), 2.8, 'bone', sides=6, r2=2.2)                 # 上臂：往下、向外
        sb.sphere((sg * 30, 3, 40), 2.6, 'bone', seg=8, rings=5)
        sb.bar((sg * 30, 3, 40), (sg * 51, 14, 43), 2.2, 'bone', sides=6, r2=1.5)                # 小臂：向外、微朝前伸出
        sb.sphere((sg * 51, 14, 43), 1.7, 'bone', seg=8, rings=5)                                # 手腕
        hand((sg * 54.5, 16.0, 43.6), (sg * 0.78, 0.62, 0.05), fingers=4, flen=10.5, spread=2.3, palm=(6.5, 6.5, 1.0), lift=(0, 0, 1.8))   # 掌心朝上、手指張開

        # ── 髖部垂下的四對細長多節手臂（約 35 單位長） ──
        for k in range(4):
            r0 = (sg * (6 + 1.8 * k), -1, 8 - 1.0 * k)
            m1 = (sg * (14 + 5.0 * k), 2, -6 - 4.0 * k)
            m2 = (sg * (20 + 6.5 * k), 3 + 0.5 * k, -18 - 5.0 * k)
            sb.bar(r0, m1, 1.6, 'bone', sides=5, r2=1.2)
            sb.sphere(m1, 1.5, 'bone', seg=6, rings=4)
            sb.bar(m1, m2, 1.2, 'bone', sides=5, r2=0.8)
            for q in (-1, 0, 1):
                sb.bar(m2, (m2[0] + sg * (0.8 + q * 0.8), m2[1] + 0.4 + q * 0.6, m2[2] - 5.5), 0.35, 'hand', sides=4, r2=0.1)

    # ── 腰間荊棘環：纖細的圈＋放射狀 T 形棘 ──
    ZR, RR = 14.0, 41.0
    sb.torus((0, 0, ZR), RR, 0.55, 'thorn', axis='z', major=72, minor=5)
    for k in range(60):
        a = 2 * math.pi * k / 60
        c, sn = math.cos(a), math.sin(a)
        p0 = (c * (RR - 0.5), sn * (RR - 0.5), ZR)
        p1 = (c * (RR + 3.4), sn * (RR + 3.4), ZR + (1.2 if k % 2 == 0 else -0.8))
        sb.bar(p0, p1, 0.4, 'thorn', sides=4, r2=0.3)
        tx, ty = -sn, c
        sb.bar((p1[0] - tx * 2.0, p1[1] - ty * 2.0, p1[2]), (p1[0] + tx * 2.0, p1[1] + ty * 2.0, p1[2]), 0.35, 'thorn', sides=4)

    # ── 骨盆與裙擺：中央長刃＋四層漸短的碎片，尾端雙尖 ──
    sb.loft_v([(10, 9, 5.0, 4.5, 0, 0, 2.4), (2, 10, 5.5, 5.0, 0, 0, 2.4), (-8, 8, 5.0, 4.5, 0, 0, 2.4)], 'armor', n=14, smooth=False)
    # 骨盆護翼：向外下方撐開的爪形
    for sg in (1, -1):
        sb.prism_xz([(sg * 6, 8), (sg * 14, 12), (sg * 17, 4), (sg * 23, 6), (sg * 20, -6), (sg * 14, -12), (sg * 8, -4)], 3.6, 0.0, 'bone')
        sb.prism_xz([(sg * 9, 6), (sg * 14, 8), (sg * 16, 2), (sg * 14, -6), (sg * 10, -2)], 3.9, 0.0, 'glow')
    # 中央長刃（鋸齒邊緣，尾端雙尖）
    sb.prism_xz([(0, 6), (7, 0), (9, -12), (8, -22), (11, -34), (8, -50), (9, -66), (6, -84), (3, -102), (2.2, -114), (0.8, -126), (0, -110), (-0.8, -126), (-2.2, -114), (-3, -102), (-6, -84), (-9, -66), (-8, -50), (-11, -34), (-8, -22), (-9, -12), (-7, 0)], 7.0, 0.0, 'armor')
    sb.ribbon([(0, 3.8, 4), (0, 3.8, -104)], 3.2, 'glow', up=(0, 1, 0))
    sb.ribbon([(0, -3.8, 4), (0, -3.8, -100)], 3.0, 'glow', up=(0, 1, 0))
    # 左右各五層碎片：由上往下變長、變窄；前後交錯，帶薰衣草縫線
    for k in range(5):
        for sg in (1, -1):
            z0 = 2.0 - 9.0 * k
            f0 = 2.4 if k % 2 == 0 else -2.4
            th = 5.0 - 0.5 * k
            w = 20 - 1.8 * k
            sb.prism_xz([(sg * 5.5, z0), (sg * w, z0 - 10), (sg * (w - 3), z0 - 17), (sg * (w - 1.5), z0 - 30 - 4 * k), (sg * (w - 5), z0 - 36 - 5 * k), (sg * 4.2, z0 - 58 - 11 * k), (sg * 3.5, z0 - 22)], th, f0, 'armor')
            for fs in (1, -1):
                sb.ribbon([(sg * 9, f0 + fs * (th / 2 + 0.2), z0 - 6), (sg * (8 - 0.4 * k), f0 + fs * (th / 2 + 0.2), z0 - 44 - 9 * k)], 1.5, 'glow', up=(0, 1, 0))
    sb.export(os.path.join(out, 'irontomb.glb'))


# ═════════════════ FPV：聯軍截擊機（玩家／友軍戰機，約 12 單位長） ═════════════════
def fighter(out):
    reset()
    M = {
        'hull': make_mat('hull', hexc('#1c2a54'), 0.6, 0.45),
        'plate': make_mat('plate', hexc('#d5ddf7'), 0.35, 0.5),
        'dark': make_mat('dark', hexc('#080c1a'), 0.3, 0.7),
        'trim': make_mat('trim', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#7fe9ff'), emit_strength=1.0),
        'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#9fdcff'), emit_strength=1.0),
        'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
        'canopy': make_mat('canopy', hexc('#06101f'), 0.9, 0.12, emit=hexc('#2a79c8'), emit_strength=0.55),
    }
    sb = ShipBuilder('fighter', M)
    # 機身：細長尖鼻、座艙後隆起、尾部收攏
    sb.loft([(6.0, 0.02, 0.02, 0.02, 0, 2.2), (5.0, 0.22, 0.2, 0.16, 0, 2.4), (3.0, 0.50, 0.40, 0.30, 0, 2.6),
             (0.0, 0.72, 0.52, 0.40, 0, 2.8), (-3.0, 0.70, 0.46, 0.38, 0, 2.8), (-5.2, 0.55, 0.34, 0.30, 0, 2.4), (-6.0, 0.42, 0.26, 0.24, 0, 2.2)],
            'hull', n=14)
    sb.prism([(0.0, 4.2), (0.40, 1.2), (0.38, -4.6), (-0.38, -4.6), (-0.40, 1.2)], 0.08, 0.38, 'plate', scale_top=0.88)
    sb.sphere((0, 1.7, 0.42), 0.46, 'canopy', seg=12, rings=7, scale=(0.72, 1.7, 0.62))
    # 主翼：大後掠三角翼，前緣發光
    for sg in (1, -1):
        sb.prism([(sg * 0.6, 2.6), (sg * 4.9, -4.4), (sg * 4.5, -5.5), (sg * 0.9, -3.6)], 0.10, -0.02, 'hull')
        sb.ribbon([(sg * 0.7, 2.55, 0.1), (sg * 4.85, -4.35, 0.1)], 0.10, 'trim')
        sb.ribbon([(sg * 1.0, -3.55, 0.1), (sg * 4.5, -5.4, 0.1)], 0.06, 'trim')
        sb.box((sg * 4.75, -4.9, 0.05), (0.14, 0.4, 0.14), 'nav')
        # 翼根機砲（四挺：每側兩挺）
        for k, fx_ in enumerate((2.0, 1.2)):
            xg = sg * (1.15 + 0.42 * k)
            sb.cyl((xg, 2.0 - 0.0, -0.02), 0.07, 2.2, 'dark', axis='f', sides=6)
            sb.anchor('HP_GUN_%d' % (len([1 for _ in range(0)]) + (1 if sg > 0 else 3) + k), (xg, 3.1, -0.02))
        # 垂直雙尾翼，微外傾
        sb.prism_xz([(sg * 0.55, -2.4), (sg * 1.2, -5.7), (sg * 0.55, -5.7)], 0.08, 0.35, 'hull') if False else None
        sb.box((sg * 0.75, -4.7, 0.78), (0.08, 1.7, 1.0), 'plate', rot=(0, sg * 0.28, 0), taper=(1, 0.5))
        # 雙引擎
        sb.cyl((sg * 0.42, -6.1, -0.02), 0.26, 1.1, 'dark', axis='f', sides=10)
        sb.cyl((sg * 0.42, -6.62, -0.02), 0.2, 0.1, 'glow', axis='f', sides=10)
        sb.anchor('HP_ENGINE_%d' % (1 if sg > 0 else 2), (sg * 0.42, -6.75, -0.02))
    sb.anchor('HP_COCKPIT', (0, 1.6, 0.62))
    sb.export(os.path.join(out, 'fighter.glb'))


# ═════════════════ FPV：駕駛艙內裝（相機位於原點；僅作為疊加畫面，不進入主場景深度） ═════════════════
# 參照影片中黑塔太空站艦橋：深色面板、六角格、藍色霓虹結構線。單位：公尺。
def cockpit(out):
    reset()
    M = {
        'frame': make_mat('frame', hexc('#10182c'), 0.7, 0.4),
        'panel': make_mat('panel', hexc('#1b2744'), 0.6, 0.45),
        'dark': make_mat('dark', hexc('#05070f'), 0.4, 0.6),
        'neon': make_mat('neon', hexc('#06142a'), 0.2, 0.6, emit=hexc('#5fd0ff'), emit_strength=1.4),
        'screen': make_mat('screen', hexc('#03121c'), 0.2, 0.5, emit=hexc('#2bb6c8'), emit_strength=0.45),
        'warn': make_mat('warn', hexc('#2a0a08'), 0.2, 0.5, emit=hexc('#ff7a3a'), emit_strength=1.0),
    }
    sb = ShipBuilder('cockpit', M)
    ZD = -0.75                                                    # 儀表板頂面高度（壓低，讓視野開闊）
    # 儀表板本體與前緣
    sb.box((0, 1.05, ZD - 0.14), (3.0, 1.5, 0.28), 'frame', taper=(0.92, 1.0))
    sb.box((0, 0.35, ZD - 0.10), (1.5, 0.22, 0.2), 'panel')
    sb.box((0, 1.82, ZD + 0.02), (3.2, 0.12, 0.2), 'frame')
    sb.ribbon([(-1.35, 1.76, ZD + 0.13), (1.35, 1.76, ZD + 0.13)], 0.025, 'neon')
    # 六角格面板
    r = 0.085
    for row in range(-3, 4):
        for col in range(0, 11):
            fx_ = 0.55 + row * 0.0 + col * 0.115
            fx_ = 0.62 + col * 0.118
            x = (row + (0.5 if col % 2 else 0.0)) * 0.19
            if abs(x) > 1.30 or abs(x) < 0.0 and False:
                continue
            if abs(x) < 0.36 and fx_ < 1.5:                            # 中央留給主螢幕
                continue
            ang = [(math.cos(math.pi / 3 * i + math.pi / 6) * r, math.sin(math.pi / 3 * i + math.pi / 6) * r) for i in range(6)]
            sb.prism([(x + a, fx_ + b) for a, b in ang], 0.012, ZD, 'panel' if (row + col) % 3 else 'dark')
            if (row * 7 + col * 3) % 11 == 0:
                sb.prism([(x + a * 0.55, fx_ + b * 0.55) for a, b in ang], 0.008, ZD + 0.012, 'neon')
    # 主螢幕（雷達／狀態）與警示燈
    sb.box((0, 1.32, ZD + 0.012), (0.42, 0.26, 0.014), 'screen')
    sb.ribbon([(-0.21, 1.17, ZD + 0.02), (0.21, 1.17, ZD + 0.02)], 0.012, 'neon')
    for sg in (1, -1):
        sb.box((sg * 0.42, 1.25, ZD + 0.012), (0.16, 0.2, 0.012), 'screen')
        sb.box((sg * 0.98, 1.1, ZD + 0.016), (0.07, 0.07, 0.02), 'warn')
    # 座艙框架：A 柱、頂樑、側欄與藍色霓虹內緣
    for sg in (1, -1):
        sb.bar((sg * 1.42, 0.2, ZD), (sg * 1.12, 1.0, 0.18), 0.05, 'frame', sides=6)      # 後側欄（下）
        sb.bar((sg * 1.12, 1.0, 0.18), (sg * 0.62, 1.78, 0.74), 0.045, 'frame', sides=6)    # A 柱
        sb.bar((sg * 1.42, 0.2, ZD), (sg * 1.18, -0.3, 0.48), 0.04, 'frame', sides=6)
        sb.bar((sg * 1.18, -0.3, 0.48), (sg * 0.62, 1.78, 0.74), 0.045, 'frame', sides=6)  # 側頂樑
        sb.bar((sg * 1.1, 1.02, 0.17), (sg * 0.6, 1.76, 0.72), 0.014, 'neon', sides=4)
        sb.bar((sg * 1.40, 0.2, ZD + 0.02), (sg * 1.12, 1.0, 0.16), 0.014, 'neon', sides=4)
    sb.bar((-0.62, 1.78, 0.74), (0.62, 1.78, 0.74), 0.04, 'frame', sides=6)                 # 前頂樑
    sb.bar((-1.18, -0.3, 0.48), (1.18, -0.3, 0.48), 0.05, 'frame', sides=6)                 # 後頂樑
    sb.bar((-0.5, 1.76, 0.7), (0.5, 1.76, 0.7), 0.012, 'neon', sides=4)
    sb.box((0, 0.7, 0.62), (0.9, 0.9, 0.05), 'frame')                                      # 頭頂面板
    sb.ribbon([(-0.35, 0.3, 0.59), (0.35, 0.3, 0.59)], 0.02, 'neon')
    sb.anchor('HP_EYE', (0, 0, 0))
    sb.export(os.path.join(out, 'cockpit.glb'))


# ═════════════ FPV／統一版：Sentinel 預警機（雷達罩大型機，約 12 單位長） ═════════════
def sentinel(out):
    reset()
    M = {
        'hull': make_mat('hull', hexc('#1c2a54'), 0.6, 0.45),
        'plate': make_mat('plate', hexc('#d5ddf7'), 0.35, 0.5),
        'dark': make_mat('dark', hexc('#080c1a'), 0.3, 0.7),
        'trim': make_mat('trim', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#7fe9ff'), emit_strength=1.0),
        'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#9fdcff'), emit_strength=1.0),
        'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
        'win': make_mat('win', hexc('#1a1208'), 0.2, 0.6, emit=hexc('#ffd98a'), emit_strength=0.8),
    }
    sb = ShipBuilder('sentinel', M)
    # 機身：圓潤的長筒，前端收尖、後段略粗
    sb.loft([(6.0, 0.05, 0.05, 0.05, 0, 2.2), (5.0, 0.55, 0.5, 0.42, 0, 2.4), (3.0, 0.95, 0.8, 0.7, 0, 2.6), (0.0, 1.15, 0.9, 0.8, 0, 2.8),
             (-3.0, 1.1, 0.9, 0.8, 0, 2.8), (-5.2, 0.8, 0.7, 0.6, 0, 2.4), (-6.0, 0.5, 0.4, 0.4, 0, 2.2)], 'hull', n=16)
    sb.prism([(0.0, 5.0), (0.8, 2.5), (0.9, -4.5), (-0.9, -4.5), (-0.8, 2.5)], 0.12, 0.92, 'plate', scale_top=0.9)
    sb.ribbon([(-0.98, 3.0, 0.25), (-1.02, -3.5, 0.25)], 0.16, 'win'); sb.ribbon([(0.98, 3.0, 0.25), (1.02, -3.5, 0.25)], 0.16, 'win')
    sb.bar((0, 6.0, 0.0), (0, 7.4, 0.0), 0.07, 'plate', sides=5, r2=0.02)                       # 機鼻探針
    # 雷達罩：圓盤＋穹頂，由雙立柱撐在機背
    for sg in (1, -1):
        sb.bar((sg * 0.5, -1.0, 0.85), (sg * 0.8, -1.3, 1.85), 0.16, 'plate', sides=6)
        sb.bar((sg * 0.5, -2.4, 0.85), (sg * 0.8, -2.0, 1.85), 0.16, 'plate', sides=6)
    sb.cyl((0, -1.6, 2.0), 3.5, 0.34, 'plate', axis='z', sides=32, r2=3.5)
    sb.cyl((0, -1.6, 2.2), 3.1, 0.2, 'hull', axis='z', sides=32, r2=2.6)
    sb.torus((0, -1.6, 2.0), 3.5, 0.07, 'trim', axis='z', major=48, minor=6)
    sb.sphere((0, -1.6, 2.3), 1.0, 'glow', seg=16, rings=8, scale=(1.4, 1.4, 0.35))
    for k in range(8):                                                                         # 圓盤上的感測鰭
        a = 2 * math.pi * k / 8
        sb.bar((math.cos(a) * 2.6, -1.6 + math.sin(a) * 2.6, 2.2), (math.cos(a) * 3.3, -1.6 + math.sin(a) * 3.3, 2.2), 0.05, 'trim', sides=4)
    # 主翼與尾翼
    for sg in (1, -1):
        sb.prism([(sg * 0.9, 1.5), (sg * 5.6, -3.2), (sg * 5.2, -4.3), (sg * 1.0, -3.0)], 0.12, -0.05, 'hull')
        sb.ribbon([(sg * 1.0, 1.45, 0.08), (sg * 5.55, -3.15, 0.08)], 0.1, 'trim')
        sb.box((sg * 5.4, -3.8, 0.0), (0.14, 0.4, 0.14), 'nav')
        sb.prism([(sg * 0.8, -4.6), (sg * 2.6, -6.2), (sg * 0.8, -6.0)], 0.1, 0.1, 'hull')      # 水平尾翼
        sb.box((sg * 1.0, -5.2, 1.0), (0.1, 1.5, 1.3), 'plate', rot=(0, sg * 0.25, 0), taper=(1, 0.5))
        for k, (xo, fo) in enumerate(((2.2, -1.4), (3.8, -2.6))):                                # 翼下兩具引擎吊艙
            sb.cyl((sg * xo, fo, -0.55), 0.3, 1.8, 'dark', axis='f', sides=10)
            sb.cyl((sg * xo, fo - 0.95, -0.55), 0.24, 0.1, 'glow', axis='f', sides=10)
            sb.bar((sg * xo, fo, -0.2), (sg * xo, fo, -0.05), 0.1, 'hull', sides=4)
            sb.anchor('HP_ENGINE_%d' % (1 + k * 2 + (0 if sg > 0 else 1)), (sg * xo, fo - 1.1, -0.55))
    sb.export(os.path.join(out, 'sentinel.glb'))


BUILDERS = {'frigate': frigate, 'cruiser': cruiser, 'dread': dread, 'xzd': xzd, 'ipc': ipc, 'hss': hss, 'moon': moon, 'whale': whale, 'butterfly': butterfly, 'debris': debris, 'irontomb': irontomb, 'fighter': fighter, 'cockpit': cockpit, 'sentinel': sentinel}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='.')
    ap.add_argument('names', nargs='*')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    for n in (args.names or list(BUILDERS)):
        BUILDERS[n](args.out)
