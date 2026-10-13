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
def _capital_mats():
    return {
        'hull': make_mat('hull', hexc('#1a2750'), 0.65, 0.42),
        'plate': make_mat('plate', hexc('#7d89b8'), 0.5, 0.48),
        'dark': make_mat('dark', hexc('#080c1a'), 0.3, 0.7),
        'trim': make_mat('trim', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#a8e8ff'), emit_strength=1.0),
        'win': make_mat('win', hexc('#1a1208'), 0.2, 0.6, emit=hexc('#ffd98a'), emit_strength=1.0),
        'glow': make_mat('glow', hexc('#0a1830'), 0.2, 0.6, emit=hexc('#8fd8ff'), emit_strength=1.0),
        'nav': make_mat('nav', hexc('#300000'), 0.2, 0.6, emit=hexc('#ff4455'), emit_strength=1.0),
    }


def capital(out, name, H, big):
    reset()
    sb = ShipBuilder(name, _capital_mats())
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
    tiers = 6 if big else 4
    top = pagoda(sb, -.33 * H, ztop, tiers, base_w=(1.5 if big else 1.15) * W, base_l=(.2 if big else .3) * H, tier_h=0.55 * r ** 0.55 * (0.9 if big else 1.0),
                 mat_hull='hull', mat_plate='plate', mat_trim='trim', window_mat='win', shrink=0.8 if big else 0.77)
    sb.cyl((0, -.33 * H, top + 0.5), 0.07, 1.0, 'plate', axis='z', sides=6)
    sb.anchor('HP_COCKPIT', (0, -.33 * H + 0.4, top - 0.3 * r ** 0.4))
    sb.box((0, -.33 * H, top + 1.05), (0.5, 0.5, 0.1), 'nav')
    # 雙聯裝砲塔
    tpos = ([.78, .62, .46, -.52, -.68, -.84] if big else [.52, .74])
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
    for (rf, rz, curl) in pairs:
        for sg in (1, -1):
            swept_fin(sb, sg, rf, sg * W * 0.82, rz, length=.2 * H, span=.42 * H + 1.2, sweep=.34 * H, thick=0.14 * r ** 0.5, mat='hull', curl=curl * 0.08 * H)
    for sg in (1, -1):
        sb.box((sg * (W * 0.82 + .42 * H + 1.2), -.45 * H - .34 * H + .1 * H, .35 * T + .1 * H * .08 * 4), (0.18, 0.4, 0.18), 'nav')
    # 腹龍骨
    sb.box((0, -.05 * H, -(T * 0.78) - 0.15), (.55 * W, .9 * H, .5), 'hull', taper=(0.85, 0.8))
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
    reset()
    M = {
        'armor': make_mat('armor', hexc('#3a2434'), 0.5, 0.55),
        'dark': make_mat('dark', hexc('#1c1021'), 0.4, 0.6),
        'bone': make_mat('bone', hexc('#7d6877'), 0.35, 0.55),
        'thorn': make_mat('thorn', hexc('#563448'), 0.5, 0.5),
        'glow': make_mat('glow', hexc('#12062a'), 0.2, 0.6, emit=hexc('#a566ff'), emit_strength=1.0),
        'core': make_mat('core', hexc('#200020'), 0.2, 0.6, emit=hexc('#ff3df0'), emit_strength=1.0),
        'hand': make_mat('hand', hexc('#9b88e8'), 0.2, 0.55, emit=hexc('#5a46b0'), emit_strength=0.7),
    }
    sb = ShipBuilder('irontomb', M)
    ZA = 63.0                                   # 主臂高度

    def hand(c, d, fingers=4, flen=11.0, spread=3.2, curl=0.0, palm=(7.0, 1.6, 7.0), tilt=(0, 0, 0)):
        """骨骼狀手掌：掌板＋指節；d 為指尖方向的單位向量（x,f,z）。"""
        sb.box(c, palm, 'hand', rot=tilt)
        dv = Vector(d).normalized()
        side = Vector((0, 1, 0)).cross(dv)
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        side.normalize()
        for k in range(fingers):
            o = (k - (fingers - 1) / 2.0) * spread
            base = Vector(c) + dv * (palm[0] / 2.0 if abs(dv.x) > 0.5 else palm[2] / 2.0) + side * o
            mid = base + dv * flen * 0.55 + side * o * 0.12
            tip = mid + dv * flen * 0.45 + Vector((0, curl, 0)) + side * o * 0.1
            sb.bar(tuple(base), tuple(mid), 0.62, 'hand', sides=5, r2=0.5)
            sb.bar(tuple(mid), tuple(tip), 0.5, 'hand', sides=5, r2=0.28)
        th = Vector(c) + side * (-palm[2] / 2.0 - 0.3) + Vector((0, 0.6, 0))
        sb.bar(tuple(th), tuple(th + dv * flen * 0.55 + side * -2.6), 0.6, 'hand', sides=5, r2=0.3)

    # ── 頭：尖頂、盾形兜帽、紫光百葉、洋紅菱形核心 ──
    sb.cyl((0, 0, 108), 12.0, 38.0, 'armor', axis='z', sides=4, r2=0.5, smooth=False)
    sb.box((0, 5.0, 100), (2.4, 2.0, 30), 'bone', taper=(0.5, 1.0))
    sb.loft_v([(90, 15, 8, 8, 0, 0, 2.2), (80, 27, 12, 11, 0, 0, 2.4), (68, 38, 16, 15, 0, 0, 2.6), (58, 33, 14, 13, 0, 0, 2.6), (50, 16, 8, 8, 0, 0, 2.2)], 'armor', n=16, smooth=False)
    for i in range(8):
        z = 77.0 - i * 3.2
        w = 46.0 - i * 2.5
        sb.box((0, -3.0, z), (2 * w, 24, 1.5), 'dark')
        if i % 2 == 0:
            sb.box((0, -3.0, z - 1.05), (2 * (w - 7), 24.6, 0.7), 'glow')
    sb.sphere((0, 15.5, 74), 1.0, 'core', seg=4, rings=2, scale=(7.5, 2.4, 14), smooth=False)
    sb.sphere((0, 14.0, 74), 1.0, 'glow', seg=4, rings=2, scale=(11, 1.6, 19), smooth=False)
    for sg in (1, -1):
        sb.prism_xz([(sg * 34, 70), (sg * 64, 64), (sg * 72, 57), (sg * 46, 54)], 3.0, 0.0, 'armor')
        sb.prism_xz([(sg * 36, 66), (sg * 60, 61), (sg * 66, 58), (sg * 44, 58)], 3.2, 0.0, 'glow')
    sb.anchor('HP_CORE', (0, 16, 74))

    # ── 頸椎串與胸前骨板 ──
    for i in range(7):
        z = 47.0 - i * 3.6
        sb.box((0, 0, z), (23 - i * 1.3, 9.5, 2.6), 'bone')
        sb.box((0, -5.2, z), (11 - i * 0.6, 1.0, 1.8), 'glow')
        for sg in (1, -1):
            sb.bar((sg * (11.5 - i * 0.6), 0, z), (sg * (16.5 - i * 0.7), -2, z + 2.2), 1.1, 'thorn', sides=5, r2=0.2)
    sb.loft_v([(30, 13, 6.5, 6.5, 0, 0, 2.6), (14, 17, 8.5, 8.5, 0, 0, 2.6), (0, 21, 9.5, 9.5, 0, 0, 2.6), (-14, 18, 8.5, 8.5, 0, 0, 2.4), (-28, 15, 7, 7, 0, 0, 2.4)], 'armor', n=18)
    for i in range(5):
        z = 25.0 - i * 6.0
        sb.box((0, 7.2, z), (25 - 2 * i, 2.8, 4.2), 'bone', taper=(0.9, 1))
        sb.box((0, 6.2, z - 3.1), (19 - 2 * i, 1.0, 1.3), 'glow')
    sb.ribbon([(0, 9.8, 20), (0, 9.8, -30)], 3.0, 'glow', up=(0, 1, 0))

    # ── 肩、肩胛與主臂 ──
    for sg in (1, -1):
        sb.box((sg * 44, 0, 62), (24, 17, 13), 'armor', rot=(0, sg * 0.32, 0), taper=(0.8, 0.9))
        sb.bar((sg * 38, 0, 67), (sg * 50, -2, 86), 3.4, 'armor', sides=5, r2=0.3)
        sb.bar((sg * 48, 3, 66), (sg * 64, 3, 80), 2.4, 'armor', sides=5, r2=0.25)
        sb.prism_xz([(sg * 21, 52), (sg * 36, 47), (sg * 33, 22), (sg * 24, 8), (sg * 17, 32)], 7.0, -2.0, 'armor')
        sb.prism_xz([(sg * 22, 49), (sg * 32, 45), (sg * 29, 24), (sg * 24, 14)], 7.4, -2.0, 'glow', back_scale=0.9)
        # 沙漏形肩段 → 齒輪環 → 長前臂
        sb.bar((sg * 40, 0, ZA), (sg * 56, 0, ZA), 10.5, 'armor', sides=8, r2=4.6)
        sb.bar((sg * 56, 0, ZA), (sg * 73, 0, ZA), 4.6, 'armor', sides=8, r2=10.5)
        sb.bar((sg * 73, 0, ZA), (sg * 77, 0, ZA), 11.2, 'bone', sides=8)
        sb.bar((sg * 77, 0, ZA), (sg * 95, 0, ZA), 6.2, 'dark', sides=10)
        for k in range(14):                                        # 齒輪環：放射狀 T 形棘刺
            a = 2 * math.pi * k / 14
            c, sn = math.cos(a), math.sin(a)
            x0 = sg * 86.0
            sb.bar((x0, 8.0 * c, ZA + 8.0 * sn), (x0, 15.0 * c, ZA + 15.0 * sn), 0.75, 'thorn', sides=5)
            tx, tz = -sn, c
            sb.bar((x0 - sg * 0.0, 15.0 * c - tx * 3.4, ZA + 15.0 * sn - tz * 3.4), (x0, 15.0 * c + tx * 3.4, ZA + 15.0 * sn + tz * 3.4), 0.75, 'thorn', sides=5)
        for xr in (80.0, 92.0):
            sb.torus((sg * xr, 0, ZA), 9.0, 0.7, 'thorn', axis='x', major=28, minor=5)
        sb.bar((sg * 95, 0, ZA), (sg * 114, 0, ZA), 7.6, 'armor', sides=8, r2=5.2)
        sb.bar((sg * 114, 0, ZA), (sg * 118, 0, ZA), 5.6, 'bone', sides=8)
        hand((sg * 122, 0, ZA), (sg, 0, 0), fingers=4, flen=13, spread=3.0, palm=(8.0, 1.6, 8.0))
        # 第二對細臂：垂在身側，手掌朝前
        sb.sphere((sg * 30, -1, 48), 3.6, 'bone', seg=8, rings=5)
        sb.bar((sg * 30, -1, 48), (sg * 47, 2, 22), 3.3, 'bone', sides=6, r2=2.8)
        sb.sphere((sg * 47, 2, 22), 3.2, 'bone', seg=8, rings=5)
        sb.bar((sg * 47, 2, 22), (sg * 41, 6, -6), 2.8, 'bone', sides=6, r2=2.2)
        hand((sg * 40.5, 6, -8.5), (sg * 0.15, 0.1, -1), fingers=4, flen=9, spread=2.3, palm=(6.0, 1.4, 5.0))
        # 腰間垂下的多對細長多節手臂
        for k in range(5):
            x0, z0 = sg * (9 + 2.2 * k), -14.0 - k * 1.2
            m1 = (sg * (18 + 6.5 * k), 3 + 2 * k, -34 - 4.5 * k)
            m2 = (sg * (22 + 8.5 * k), 5 + 3 * k, -56 - 6.0 * k)
            sb.bar((x0, 0, z0), m1, 1.7, 'bone', sides=5, r2=1.3)
            sb.sphere(m1, 1.6, 'bone', seg=6, rings=4)
            sb.bar(m1, m2, 1.3, 'bone', sides=5, r2=1.0)
            for q in (-1, 0, 1):
                sb.bar(m2, (m2[0] + sg * (1.2 + q * 1.1), m2[1] + 0.6 + q * 0.9, m2[2] - 7.0), 0.45, 'hand', sides=4, r2=0.12)

    # ── 腰間的棘刺環（T 形棘刺排成一圈） ──
    ZR, RR = -14.0, 49.0
    sb.torus((0, 0, ZR), RR, 0.9, 'thorn', axis='z', major=72, minor=5)
    for k in range(44):
        a = 2 * math.pi * k / 44
        c, sn = math.cos(a), math.sin(a)
        p0 = (c * (RR - 1.0), sn * (RR - 1.0), ZR)
        p1 = (c * (RR + 5.0), sn * (RR + 5.0), ZR + (2.0 if k % 2 == 0 else -1.0))
        sb.bar(p0, p1, 0.8, 'thorn', sides=4, r2=0.5)
        tx, ty = -sn, c
        sb.bar((p1[0] - tx * 3.2, p1[1] - ty * 3.2, p1[2]), (p1[0] + tx * 3.2, p1[1] + ty * 3.2, p1[2]), 0.6, 'thorn', sides=4)

    # ── 骨盆兩側的爪形護翼與下半身碎片裙擺 ──
    for sg in (1, -1):
        sb.prism_xz([(sg * 14, 10), (sg * 24, 20), (sg * 29, 8), (sg * 39, 15), (sg * 41, -4), (sg * 36, -12), (sg * 33, -26), (sg * 20, -40), (sg * 12, -20)], 6.0, -3.0, 'armor')
        sb.prism_xz([(sg * 16, 6), (sg * 26, 12), (sg * 31, 0), (sg * 28, -14), (sg * 20, -28), (sg * 15, -16)], 6.4, -3.0, 'glow', back_scale=0.88)
    sb.prism_xz([(0, -126), (7, -72), (11, -38), (0, -26), (-11, -38), (-7, -72)], 13.0, 1.0, 'armor')
    sb.ribbon([(0, 7.6, -34), (0, 7.6, -116)], 2.6, 'glow', up=(0, 1, 0))
    for k in range(1, 5):
        for sg in (1, -1):
            top, tip = -24.0 - k * 1.5, -68.0 - 15.0 * k
            sb.prism_xz([(sg * (8 + 5 * k), top), (sg * (14 + 6 * k), top - 24 - 6 * k), (sg * (13 + 10 * k), tip), (sg * (6 + 3 * k), top - 18)], 8.0 - k, (2.0 if k % 2 else -3.0), 'armor')
            sb.ribbon([(sg * (10 + 6 * k), (2.0 if k % 2 else -3.0) + 4.4 - 0.4 * k, top - 8), (sg * (13 + 9 * k), (2.0 if k % 2 else -3.0) + 4.0 - 0.4 * k, tip + 8)], 1.8, 'glow', up=(0, 1, 0))
    sb.export(os.path.join(out, 'irontomb.glb'))


BUILDERS = {'frigate': frigate, 'cruiser': cruiser, 'dread': dread, 'hss': hss, 'moon': moon, 'whale': whale, 'butterfly': butterfly, 'debris': debris, 'irontomb': irontomb}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='.')
    ap.add_argument('names', nargs='*')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    for n in (args.names or list(BUILDERS)):
        BUILDERS[n](args.out)
