/* fpv-audio.js — FPV 版音效引擎：取樣播放＋3D 空間化＋殘響匯流排＋程序化引擎聲
 *
 * 取樣檔由 tools-src/audio/build_sfx.py 合成（多層疊加的好萊塢式音效），放在 assets/space-war/fpv/sfx/*.mp3。
 * 想換成 Freesound／Sonniss 的真實素材：以相同檔名覆蓋即可，遊戲端不需修改。
 *
 *   FPVAudio.init(musicSrc, sfxBase)        使用者第一次互動後呼叫
 *   FPVAudio.listener(camera)               每幀更新聆聽者（位置與朝向）
 *   FPVAudio.play(name, { pos, vol, rate, ref, delay, wet })
 *   FPVAudio.fire(kind, pos) / explode(size, pos) / cannon(pos) / hit() / shield() / missile() / lance() / alarm()
 *   FPVAudio.lock(acquired) / boost() / flyby(pos) / respawn()
 *   FPVAudio.engine(speed01, boost)         每幀更新引擎低頻
 *   FPVAudio.music(on) / mute(m) / suspend(s)
 *
 * 空間化：聲音距離 → 音量（反比）、低通濾波（越遠越悶）、聲速延遲（爆炸從遠處傳來會晚一點，電影式誇張）、
 *        左右聲道依據聲源相對於相機的方向。
 */
(function (global) {
  'use strict';
  let ctx = null, master = null, sfxBus = null, rvSend = null, buffers = {}, loading = null, eng = null, mus = null;
  let musicOn = true, muted = false, voices = 0, refScale = 1;
  const perName = {}, lastT = {};
  const L = { x: 0, y: 0, z: 0, q: null };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const SPEED = 1100;                      // 誇張的「聲速」(m/s)：1 km 約延遲 0.9 s
  const VARIANTS = { blaster: 3, enemy_blaster: 2, cannon: 3, hit_hull: 3, explosion_small: 3, explosion_med: 3, explosion_big: 3, shield_hit: 2, flyby: 2 };

  function makeIR(sec) {
    const n = Math.floor(ctx.sampleRate * sec), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lpv = 0; for (let i = 0; i < n; i++) { const t = i / n; lpv += (Math.random() * 2 - 1 - lpv) * (0.5 - 0.42 * t); d[i] = lpv * Math.pow(1 - t, 2.4) * 3.2; } }
    return ir;
  }

  function init(musicSrc, base) {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return loading; }
    const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    const conv = ctx.createConvolver(); conv.buffer = makeIR(2.4); const rvOut = ctx.createGain(); rvOut.gain.value = 0.7; conv.connect(rvOut); rvOut.connect(master);
    rvSend = ctx.createGain(); rvSend.gain.value = 1; rvSend.connect(conv);
    // 引擎：低通雜訊＋次低頻鋸齒＋渦輪嘶聲
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mk = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7; s.connect(fl); s.start(); return fl; };
    const rumble = mk('lowpass', 150), hiss = mk('bandpass', 1400, 0.8);
    const g = ctx.createGain(), hg = ctx.createGain(); g.gain.value = 0; hg.gain.value = 0; rumble.connect(g); hiss.connect(hg);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40; const og = ctx.createGain(); og.gain.value = 0.05; const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 160; o.connect(olp); olp.connect(og); og.connect(g); o.start();
    g.connect(master); hg.connect(master); eng = { g, hg, rumble, hiss, o, og };
    if (musicSrc) { mus = new Audio(musicSrc); mus.loop = true; mus.volume = 0.3; mus.preload = 'auto'; if (musicOn) mus.play().catch(() => {}); }
    base = base || '../assets/space-war/fpv/sfx/';
    loading = fetch(base + 'manifest.json').then((r) => r.json()).then((man) => Promise.all(Object.keys(man).map((n) =>
      fetch(base + n + '.mp3').then((r) => r.arrayBuffer()).then((ab) => new Promise((res) => { const p = ctx.decodeAudioData(ab, (b) => { buffers[n] = b; res(); }, () => res()); if (p && p.catch) p.catch(() => res()); }))))).catch((e) => console.warn('音效載入失敗', e));
    return loading;
  }

  function listener(camera) { L.x = camera.position.x; L.y = camera.position.y; L.z = camera.position.z; L.q = camera.quaternion; }

  /** 以聲源位置計算：距離、左右平衡、是否在身後 */
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null, _q = typeof THREE !== 'undefined' ? new THREE.Quaternion() : null;
  function spatial(pos) {
    _v.set(pos.x - L.x, pos.y - L.y, pos.z - L.z); const dist = _v.length() || 1;
    if (L.q) { _q.copy(L.q).invert(); _v.applyQuaternion(_q); }
    return { dist, pan: clamp(_v.x / dist * 1.5, -1, 1), behind: _v.z > 0 };   // 相機朝 -Z，+Z 在身後
  }

  function play(name, o) {
    if (!ctx || muted || ctx.state !== 'running') return null;
    o = o || {};
    let key = name; if (VARIANTS[name]) key = name + '_' + (1 + ((Math.random() * VARIANTS[name]) | 0));
    const buf = buffers[key]; if (!buf) return null;
    if (voices > 40 || (perName[name] || 0) >= (o.max || 8)) return null;
    let gain = o.vol != null ? o.vol : 1, pan = o.pan || 0, cutoff = 20000, delay = 0, behind = false;
    if (o.pos) {
      const sp = spatial(o.pos), ref = (o.ref || 150) * refScale;
      gain *= 1 / (1 + Math.pow(sp.dist / ref, 1.15)); pan = sp.pan; behind = sp.behind;
      cutoff = clamp(16000 / (1 + sp.dist / (ref * 2.2)), 600, 16000); if (behind) cutoff *= 0.55;
      if (o.delay !== false && refScale === 1) delay = Math.min(1.8, Math.max(0, sp.dist - 60) / SPEED);
    }
    if (gain < 0.012) return null;
    const t0 = ctx.currentTime + delay, src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * 0.08);
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.value = gain; const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pn) pn.pan.value = pan;
    src.connect(lpf); lpf.connect(g); if (pn) { g.connect(pn); pn.connect(sfxBus); } else g.connect(sfxBus);
    const wet = o.wet != null ? o.wet : 0.2; if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(rvSend); }
    voices++; perName[name] = (perName[name] || 0) + 1;
    src.onended = () => { voices--; perName[name]--; };
    src.start(t0); return src;
  }

  function rate(name, minGap) { const t = ctx ? ctx.currentTime : 0; if (t - (lastT[name] || -9) < minGap) return false; lastT[name] = t; return true; }

  const A = {
    init, listener, play,
    fire(kind, pos) {
      if (kind === 'player') return play('blaster', { vol: 0.9, wet: 0.12, pan: pos && pos.pan || 0, max: 10 });
      if (!rate('f_' + kind, 0.05)) return;
      return play(kind === 'enemy' ? 'enemy_blaster' : 'blaster', { pos, vol: kind === 'enemy' ? 0.7 : 0.5, ref: 160, max: 6 });
    },
    cannon(pos) { if (rate('cannon', 0.12)) play('cannon', { pos, vol: 1.1, ref: 700, max: 5, wet: 0.3 }); },
    explode(size, pos) {
      const kind = size < 2 ? 'small' : size < 8 ? 'med' : 'big', ref = kind === 'small' ? 260 : kind === 'med' ? 700 : 1800;
      if (!pos) return play('explosion_' + kind, { vol: 1, wet: 0.3, max: 4 });
      play('explosion_' + kind, { pos, vol: kind === 'big' ? 1.6 : 1.2, ref, wet: kind === 'small' ? 0.22 : 0.35, max: kind === 'small' ? 5 : 4 });
    },
    hit() { play('hit_hull', { vol: 1, wet: 0.15 }); }, shield() { play('shield_hit', { vol: 0.9, wet: 0.2 }); },
    missile() { play('missile_launch', { vol: 0.95, wet: 0.2 }); },
    lance(pos) { play('lance', { vol: 1, wet: 0.45, max: 2 }); },
    alarm() { if (rate('alarm', 1.4)) play('alarm', { vol: 0.5, wet: 0.08 }); },
    lock(acquired) { play(acquired ? 'lock_acquired' : 'lock_tick', { vol: 0.8, wet: 0.1 }); },
    boost() { play('afterburner', { vol: 0.7, wet: 0.15, max: 2 }); },
    flyby(pos) { play('flyby', { pos, vol: 1.1, ref: 90, delay: false, wet: 0.1, max: 3 }); },
    respawn() { play('respawn', { vol: 0.7, max: 1 }); },
    engine(speed01, boost) {
      if (!ctx || !eng) return; const t = ctx.currentTime, k = muted ? 0 : 1;
      eng.g.gain.setTargetAtTime(k * (0.16 + 0.34 * speed01 + (boost ? 0.22 : 0)), t, 0.12);
      eng.rumble.frequency.setTargetAtTime(110 + 520 * speed01 + (boost ? 380 : 0), t, 0.12);
      eng.hg.gain.setTargetAtTime(k * (0.012 + 0.05 * speed01 + (boost ? 0.1 : 0)), t, 0.1);
      eng.hiss.frequency.setTargetAtTime(900 + 1800 * speed01 + (boost ? 1400 : 0), t, 0.1);
      eng.o.frequency.setTargetAtTime(38 + 34 * speed01 + (boost ? 22 : 0), t, 0.15);
    },
    setScale(k) { refScale = k; },
    musicSeek(sec) { if (mus) { try { mus.currentTime = sec; } catch (e) {} } },
    music(on) { musicOn = on; if (mus) { if (on) mus.play().catch(() => {}); else mus.pause(); } },
    mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.85; if (mus) mus.muted = m; },
    suspend(s) { if (!ctx) return; if (s) { ctx.suspend(); if (mus) mus.pause(); } else { ctx.resume(); if (mus && musicOn) mus.play().catch(() => {}); } },
    get ready() { return !!ctx && Object.keys(buffers).length > 0; }
  };
  global.FPVAudio = A;
})(window);
