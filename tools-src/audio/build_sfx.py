"""
build_sfx.py — 以 numpy / scipy 程序化合成「好萊塢式」太空戰音效（無外部素材、無授權問題）。

    pip install numpy scipy        # 另需 ffmpeg（編成 mp3）
    python build_sfx.py --out ../../assets/space-war/fpv/sfx [--wav-dir ./wav] [名稱…]

設計重點（避免「小蜜蜂」式的電子嗶聲）：
  * 每個聲音都是多層疊加：瞬間爆裂（crack）＋低頻衝擊（thump／sub）＋雜訊主體（body）＋殘響尾巴（tail）。
  * 爆炸：低頻下掃的正弦（次聲重擊）＋隨時間變暗的雜訊＋隆隆聲＋隨機碎裂聲，大型爆炸再加延遲的二次爆炸。
  * 雷射：尖銳的雜訊爆音＋快速下掃的鋸齒波＋低頻重擊，像「砲」而不是「嗶」。
  * 光矛（鐵墓）：多支失諧鋸齒波疊成的 BRAAM 式低吼，音量與亮度緩緩攀升。
之後想換成真實素材（Freesound、Sonniss…）：把檔案以相同名稱放進輸出資料夾即可，遊戲端不需修改。
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import scipy.signal as sg

SR = 44100
rng = np.random.default_rng(20261013)


# ───────────────────────── 基本積木 ─────────────────────────
def T(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def lp(x, f, order=2):
    b, a = sg.butter(order, min(f, SR * 0.45) / (SR / 2), 'low')
    return sg.lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = sg.butter(order, f / (SR / 2), 'high')
    return sg.lfilter(b, a, x)


def bp(x, f0, f1, order=2):
    b, a = sg.butter(order, [f0 / (SR / 2), min(f1, SR * 0.45) / (SR / 2)], 'band')
    return sg.lfilter(b, a, x)


def expenv(n, tau, attack=0.002):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = np.minimum(1.0, t / max(attack, 1e-4))
    return e * a


def sweep_phase(f0, f1, d, curve='exp'):
    t = T(d)
    if curve == 'exp':
        k = (f1 / f0) ** (1.0 / d)
        return 2 * np.pi * f0 * (k ** t - 1) / np.log(k)
    return 2 * np.pi * (f0 * t + (f1 - f0) * t * t / (2 * d))


def saw_stack(phase, n=6):
    y = np.zeros_like(phase)
    for h in range(1, n + 1):
        y += np.sin(h * phase) / h
    return y * 0.8


def sat(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def place(dst, src, at=0.0, gain=1.0):
    i = int(at * SR)
    if i >= len(dst):
        return dst
    n = min(len(src), len(dst) - i)
    dst[i:i + n] += src[:n] * gain
    return dst


def reverb(x, rt60, wet=0.3, damp=5000, predelay=0.0):
    n = int(rt60 * SR)
    ir = noise(rt60) * np.exp(-6.9 * np.arange(n) / SR / rt60)
    ir = lp(ir, damp)
    ir[:int(predelay * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    y = sg.fftconvolve(x, ir)
    out = np.zeros(len(y))
    out[:len(x)] += x * (1 - wet)
    out += y * wet * 1.6
    return out


def norm(x, peak=0.95):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def fade_out(x, ms=30):
    n = int(ms / 1000 * SR)
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)
    return x


def trim(x, thresh=0.0015):
    idx = np.where(np.abs(x) > thresh)[0]
    return x[:idx[-1] + 1] if len(idx) else x


def swept_noise(d, f0, f1, width=0.5, peak=0.5, bw_ratio=0.5, bands=22):
    """頻率隨時間掃動的雜訊（咻聲／氣流）：多個窄頻帶雜訊，各自在不同時間點達到峰值。"""
    out = np.zeros(int(d * SR))
    t = T(d)
    base = noise(d)
    for i in range(bands):
        u = i / (bands - 1)
        fc = f0 * (f1 / f0) ** u
        tc = peak * d + (u - 0.5) * 2 * width * d * 0.5 * np.sign(f1 - f0 + 1e-9)
        band = bp(base, fc * (1 - bw_ratio * 0.5), fc * (1 + bw_ratio * 0.5))
        out += band * np.exp(-((t - tc) / (width * d * 0.22)) ** 2)
    return out


def crackle(d, rate0, rate1, level=0.3, f=(1500, 6000)):
    """隨機碎裂聲（碎片、火花）：事件密度隨時間遞減。"""
    out = np.zeros(int(d * SR))
    t = 0.0
    while t < d:
        r = rate0 + (rate1 - rate0) * (t / d)
        t += rng.exponential(1.0 / max(r, 1e-3))
        if t >= d:
            break
        dur = rng.uniform(0.003, 0.018)
        c = noise(dur)
        c = bp(c, f[0] * rng.uniform(0.6, 1.4), f[1] * rng.uniform(0.6, 1.2)) * expenv(len(c), dur * 0.4, 0.0005)
        place(out, c, t, level * rng.uniform(0.3, 1.0) * (1 - 0.7 * t / d))
    return out


# ───────────────────────── 聲音 ─────────────────────────
def blaster(i):
    d = 0.5
    f0, f1 = rng.uniform(2600, 3400), rng.uniform(340, 520)
    n = int(d * SR)
    ph = sweep_phase(f0, f1, 0.18)
    fm = 2.5 * np.sin(2 * np.pi * rng.uniform(150, 220) * T(0.18))
    tone = saw_stack(ph + fm, 7) * expenv(len(ph), 0.07, 0.001)
    body = np.sin(sweep_phase(330, 70, 0.2)) * expenv(int(0.2 * SR), 0.07, 0.001) * 1.1
    crack = hp(noise(0.03), 1800) * expenv(int(0.03 * SR), 0.004, 0.0002) * 1.4
    sub = np.sin(sweep_phase(110, 42, 0.25)) * expenv(int(0.25 * SR), 0.09, 0.002) * 0.9
    y = np.zeros(n)
    place(y, tone, 0, 0.9); place(y, body, 0, 0.7); place(y, crack, 0, 1.0); place(y, sub, 0, 0.4)
    y = sat(y, 2.2)
    y = reverb(y, 0.55, 0.28, 4500)
    return norm(trim(y), 0.85)


def enemy_blaster(i):
    d = 0.6
    n = int(d * SR)
    ph = sweep_phase(rng.uniform(1500, 1900), rng.uniform(230, 300), 0.3)
    ring = np.sin(2 * np.pi * rng.uniform(70, 110) * T(0.3))
    tone = saw_stack(ph, 5) * (0.55 + 0.45 * ring) * expenv(len(ph), 0.11, 0.002)
    grit = bp(noise(0.25), 400, 2400) * expenv(int(0.25 * SR), 0.06, 0.001)
    crack = hp(noise(0.03), 1200) * expenv(int(0.03 * SR), 0.005, 0.0002)
    sub = np.sin(sweep_phase(90, 34, 0.35)) * expenv(int(0.35 * SR), 0.12, 0.003)
    y = np.zeros(n)
    place(y, tone, 0, 1.0); place(y, grit, 0, 0.8); place(y, crack, 0, 1.1); place(y, sub, 0, 0.45)
    y = sat(y, 2.6)
    y = reverb(y, 0.7, 0.3, 3500)
    return norm(trim(y), 0.85)


def cannon(i):
    d = 2.2
    n = int(d * SR)
    y = np.zeros(n)
    boom = np.sin(sweep_phase(rng.uniform(100, 125), 32, 0.9)) * expenv(int(0.9 * SR), 0.28, 0.004)
    thump = lp(noise(0.5), 260) * expenv(int(0.5 * SR), 0.12, 0.002)
    crack = hp(noise(0.04), 900) * expenv(int(0.04 * SR), 0.008, 0.0003)
    body = swept_noise(1.6, 2500, 180, 0.6, 0.15, 0.7) * 0.0 + lp(noise(1.6), 600) * expenv(int(1.6 * SR), 0.45, 0.02)
    midn = bp(noise(1.0), 140, 1200) * expenv(int(1.0 * SR), 0.18, 0.002)
    place(y, boom, 0, 0.6); place(y, thump, 0, 0.8); place(y, crack, 0, 1.0); place(y, body, 0.02, 0.5); place(y, midn, 0, 1.3)
    y = sat(y, 1.8)
    y = reverb(y, 1.6, 0.38, 2800)
    return norm(trim(y), 0.92)


def missile_launch(i):
    d = 2.0
    n = int(d * SR)
    y = np.zeros(n)
    whoosh = swept_noise(d, 250, 3600, 0.55, 0.45, 0.8)
    thump = np.sin(sweep_phase(95, 40, 0.35)) * expenv(int(0.35 * SR), 0.1, 0.003)
    crack = hp(noise(0.04), 1500) * expenv(int(0.04 * SR), 0.01, 0.0003)
    rumble = lp(noise(1.6), 380) * expenv(int(1.6 * SR), 0.6, 0.05)
    place(y, whoosh, 0, 0.9); place(y, thump, 0, 1.0); place(y, crack, 0, 0.6); place(y, rumble, 0, 0.6)
    y = sat(y, 1.5)
    y = reverb(y, 1.0, 0.3, 4000)
    return norm(trim(y), 0.88)


def explosion(kind, i):
    cfg = {
        'small': dict(D=1.8, f0=(95, 120), f1=28, rumble=900, tauB=0.22, crk=(26, 3), rt=0.9, wet=0.28, second=0),
        'med': dict(D=3.0, f0=(70, 90), f1=24, rumble=600, tauB=0.38, crk=(34, 4), rt=1.7, wet=0.33, second=1),
        'big': dict(D=5.2, f0=(52, 62), f1=17, rumble=380, tauB=0.62, crk=(40, 5), rt=3.0, wet=0.4, second=2),
    }[kind]
    D = cfg['D']
    n = int(D * SR)
    y = np.zeros(n)
    # 1 瞬間爆裂
    crack = hp(noise(0.05), 700) * expenv(int(0.05 * SR), 0.009, 0.0002)
    place(y, crack, 0, 1.2)
    # 2 衝擊主體：雜訊，亮度隨時間快速變暗
    t = T(D)
    body = np.zeros(n)
    for fc, tau, amp in ((6000, 0.07, 0.9), (2500, 0.16, 0.9), (900, cfg['tauB'] * 0.6, 1.0), (350, cfg['tauB'], 1.0)):
        body += lp(noise(D), fc) * np.exp(-t / tau) * amp
    place(y, body, 0, 1.5)
    mid = bp(noise(D), 150, 1100) * np.exp(-t / (cfg['tauB'] * 0.55))
    place(y, mid, 0, 1.3)
    # 3 次聲重擊
    boom_d = min(D, 1.4 if kind != 'big' else 2.4)
    boom = np.sin(sweep_phase(rng.uniform(*cfg['f0']), cfg['f1'], boom_d)) * expenv(int(boom_d * SR), cfg['tauB'] * 0.8, 0.006)
    place(y, sat(boom, 1.6), 0, 0.55)
    # 4 隆隆聲
    rum = lp(noise(D), cfg['rumble']) * expenv(n, cfg['tauB'] * 1.4, 0.04)
    rum *= 0.75 + 0.25 * np.sin(2 * np.pi * rng.uniform(9, 15) * t)
    place(y, rum, 0.02, 0.6)
    # 5 碎裂聲
    place(y, crackle(D * 0.85, cfg['crk'][0], cfg['crk'][1], 0.6), 0.12, 1.4)
    # 6 二次爆炸
    for s in range(cfg['second']):
        at = rng.uniform(0.25, 0.5) + s * rng.uniform(0.3, 0.55)
        sub = np.sin(sweep_phase(rng.uniform(55, 80), 22, 1.1)) * expenv(int(1.1 * SR), 0.3, 0.005)
        sec = lp(noise(1.2), 1400) * expenv(int(1.2 * SR), 0.28, 0.003)
        place(y, sub, at, 0.8 - 0.2 * s); place(y, sec, at, 0.55 - 0.15 * s)
    y = sat(y, 1.7)
    y = reverb(y, cfg['rt'], cfg['wet'], 3200, 0.012)
    return norm(fade_out(trim(y, 0.002)), 0.97)


def hit_hull(i):
    d = 0.7
    n = int(d * SR)
    y = np.zeros(n)
    base = rng.uniform(210, 330)
    for r, tau, a in ((1.0, 0.26, 0.8), (2.76, 0.15, 0.6), (5.40, 0.10, 0.4), (8.93, 0.06, 0.25)):
        f = base * r * rng.uniform(0.97, 1.03)
        tt = T(d)
        y += np.sin(2 * np.pi * f * tt) * np.exp(-tt / tau) * a
    place(y, hp(noise(0.04), 1400) * expenv(int(0.04 * SR), 0.006, 0.0002), 0, 1.3)
    place(y, np.sin(sweep_phase(150, 55, 0.18)) * expenv(int(0.18 * SR), 0.05, 0.002), 0, 1.4)
    place(y, crackle(0.5, 40, 5, 0.25, (2500, 8000)), 0.02, 0.9)
    y = sat(y, 2.0)
    y = reverb(y, 0.45, 0.22, 5000)
    return norm(trim(y), 0.9)


def shield_hit(i):
    d = 0.7
    n = int(d * SR)
    y = np.zeros(n)
    t = T(d)
    zap = bp(noise(d), 900, 5000) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 65 * t))) * np.exp(-t / 0.12)
    ph = sweep_phase(1500, 240, 0.45)
    tone = np.sin(ph + 3 * np.sin(2 * np.pi * 90 * T(0.45))) * np.exp(-T(0.45) / 0.14)
    thump = np.sin(sweep_phase(120, 50, 0.25)) * expenv(int(0.25 * SR), 0.07, 0.002)
    place(y, zap, 0, 0.8); place(y, tone, 0, 0.7); place(y, thump, 0, 1.1)
    place(y, hp(noise(0.03), 2500) * expenv(int(0.03 * SR), 0.005, 0.0002), 0, 0.9)
    y = sat(y, 2.0)
    y = reverb(y, 0.6, 0.3, 5500)
    return norm(trim(y), 0.85)


def lance(i):
    d = 6.0
    n = int(d * SR)
    t = T(d)
    swell = np.clip(t / 2.4, 0, 1) ** 1.6 * np.exp(-np.clip(t - 2.8, 0, None) / 1.5)
    y = np.zeros(n)
    f = 41.2
    for k, cents in enumerate((-14, -6, 0, 7, 15)):
        ff = f * 2 ** (cents / 1200)
        ph = 2 * np.pi * np.cumsum(ff * (1 + 0.35 * np.clip(t / 5, 0, 1)) * np.ones(n)) / SR
        y += saw_stack(ph, 10) * (0.5 if k != 2 else 0.8)
    # 亮度隨時間打開
    bright = np.zeros(n)
    for fc, g0, g1 in ((180, 1.0, 0.7), (600, 0.2, 0.8), (1800, 0.0, 0.7), (4500, 0.0, 0.5)):
        bright += lp(y, fc) * np.clip(g0 + (g1 - g0) * t / 3.0, 0, 1) * (1.0 if fc < 1000 else 0.6)
    air = bp(noise(d), 800, 7000) * swell * 0.25
    sub = np.sin(2 * np.pi * np.cumsum(30 + 12 * np.clip(t / 4, 0, 1)) / SR) * swell * 1.2
    y = (bright * 0.9 + air * 1.2 + sub * 0.5) * swell
    y += lp(noise(d), 300) * swell * 0.5
    y = sat(y, 2.4)
    y = reverb(y, 3.4, 0.4, 3000, 0.02)
    return norm(fade_out(trim(y), 200), 0.95)


def flyby(i):
    d = 1.3
    n = int(d * SR)
    t = T(d)
    g = np.exp(-((t - 0.5) / 0.22) ** 2)
    air = swept_noise(d, 500, 3200, 0.5, 0.42, 0.9) * 0.9
    f = 95 * (1.12 - 0.3 * np.clip((t - 0.2) / 0.7, 0, 1))
    eng = saw_stack(2 * np.pi * np.cumsum(f) / SR, 8) * g * 0.5
    y = (air + eng) * (0.3 + 0.7 * g)
    y = sat(y, 1.4)
    y = reverb(y, 0.7, 0.2, 4500)
    return norm(trim(y), 0.8)


def alarm(i):
    d = 1.2
    n = int(d * SR)
    t = T(d)
    y = np.zeros(n)
    for k in range(3):
        f = 520 if k % 2 == 0 else 390
        tt = T(0.38)
        tone = np.sign(np.sin(2 * np.pi * f * tt)) * 0.6 + np.sin(2 * np.pi * f * 1.5 * tt) * 0.3
        tone = lp(tone, 1800) * np.minimum(1, tt / 0.01) * np.exp(-np.clip(tt - 0.25, 0, None) / 0.05)
        place(y, tone, k * 0.4, 1.0)
    y = sat(y, 1.8)
    y = reverb(y, 0.4, 0.15, 3000)
    return norm(trim(y), 0.7)


def lock_tick(i):
    n = int(0.16 * SR)
    t = T(0.16)
    y = np.sin(2 * np.pi * 1500 * t) * np.exp(-t / 0.022) * 0.7 + hp(noise(0.16), 3000) * np.exp(-t / 0.004) * 0.5
    y += np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03) * 0.6
    return norm(trim(reverb(y, 0.25, 0.15, 4000)), 0.55)


def lock_acquired(i):
    y = np.zeros(int(0.45 * SR))
    for k, f in enumerate((1100, 1650)):
        t = T(0.09)
        place(y, np.sin(2 * np.pi * f * t) * np.exp(-t / 0.03), k * 0.11, 0.8)
        place(y, np.sin(2 * np.pi * f * 0.25 * t) * np.exp(-t / 0.05), k * 0.11, 0.8)
    return norm(trim(reverb(y, 0.3, 0.18, 4000)), 0.55)


def afterburner(i):
    d = 1.6
    y = swept_noise(d, 180, 2600, 0.6, 0.4, 0.8) * 0.9 + lp(noise(d), 260) * expenv(int(d * SR), 0.7, 0.05) * 1.0
    y = sat(y, 1.5)
    return norm(trim(reverb(y, 0.8, 0.2, 3500)), 0.8)


def respawn(i):
    d = 1.8
    t = T(d)
    y = swept_noise(d, 200, 3000, 0.45, 0.5, 0.8) * 0.6
    y += np.sin(2 * np.pi * np.cumsum(60 + 160 * np.clip(t / 1.4, 0, 1)) / SR) * np.clip(t / 1.2, 0, 1) * 0.5
    return norm(fade_out(trim(sat(reverb(y, 1.0, 0.3, 4000), 1.4)), 80), 0.75)


SOUNDS = {}
for _i in range(1, 4):
    SOUNDS['blaster_%d' % _i] = (lambda i=_i: blaster(i))
    SOUNDS['cannon_%d' % _i] = (lambda i=_i: cannon(i))
    SOUNDS['hit_hull_%d' % _i] = (lambda i=_i: hit_hull(i))
    SOUNDS['explosion_small_%d' % _i] = (lambda i=_i: explosion('small', i))
    SOUNDS['explosion_med_%d' % _i] = (lambda i=_i: explosion('med', i))
    SOUNDS['explosion_big_%d' % _i] = (lambda i=_i: explosion('big', i))
for _i in range(1, 3):
    SOUNDS['enemy_blaster_%d' % _i] = (lambda i=_i: enemy_blaster(i))
    SOUNDS['shield_hit_%d' % _i] = (lambda i=_i: shield_hit(i))
    SOUNDS['flyby_%d' % _i] = (lambda i=_i: flyby(i))
SOUNDS['missile_launch'] = lambda: missile_launch(0)
SOUNDS['lance'] = lambda: lance(0)
SOUNDS['alarm'] = lambda: alarm(0)
SOUNDS['lock_tick'] = lambda: lock_tick(0)
SOUNDS['lock_acquired'] = lambda: lock_acquired(0)
SOUNDS['afterburner'] = lambda: afterburner(0)
SOUNDS['respawn'] = lambda: respawn(0)


def write_wav(path, x):
    import wave
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='.')
    ap.add_argument('--wav-dir', default=None)
    ap.add_argument('names', nargs='*')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if a.wav_dir:
        os.makedirs(a.wav_dir, exist_ok=True)
    manifest = {}
    for name in (a.names or list(SOUNDS)):
        x = SOUNDS[name]()
        assert np.all(np.isfinite(x)), name
        tmp = os.path.join(a.wav_dir or a.out, name + '.wav')
        write_wav(tmp, x)
        mp3 = os.path.join(a.out, name + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-q:a', '3', '-ac', '1', mp3], check=True)
        if not a.wav_dir:
            os.remove(tmp)
        manifest[name] = round(len(x) / SR, 2)
        print('%-22s %5.2fs  peak %.2f  %6.1f KB' % (name, len(x) / SR, np.max(np.abs(x)), os.path.getsize(mp3) / 1024))
    with open(os.path.join(a.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
