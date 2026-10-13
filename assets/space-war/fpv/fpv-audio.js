/* fpv-audio.js — FPV 版的音效（Web Audio 程序化合成）＋背景音樂
 *
 * 全部音效即時合成，沒有外部音檔，方便日後換成真正的素材：
 * 把 FPVAudio.sfx 裡對應函式換成播放 AudioBuffer 即可（建議來源見 docs/space-war/FPV-ROADMAP.md）。
 *
 *   FPVAudio.init()                 在第一次使用者互動後呼叫
 *   FPVAudio.sfx.laser(pan) / missile() / boom(size, dist) / hit() / shield() / alarm() / lance()
 *   FPVAudio.engine(speed01, boost) 每幀更新引擎低頻
 *   FPVAudio.music(on)              背景音樂開關
 */
(function (global) {
  'use strict';
  let ctx = null, master = null, noiseBuf = null, eng = null, mus = null, musicOn = true, muted = false;

  function init(src) {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 引擎：低通噪音 + 低頻振盪
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
    const og = ctx.createGain(); og.gain.value = 0.05;
    n.connect(lp); lp.connect(g); o.connect(og); og.connect(g); g.connect(master); n.start(); o.start();
    eng = { g, lp, o };
    if (src) {
      mus = new Audio(src); mus.loop = true; mus.volume = 0.32; mus.preload = 'auto';
      if (musicOn) mus.play().catch(() => {});
    }
  }
  function now() { return ctx.currentTime; }
  function env(g, t0, a, d, peak) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function pan(v) { if (!ctx.createStereoPanner) return null; const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v || 0)); return p; }
  function out(node, p, vol) { const g = ctx.createGain(); g.gain.value = vol; node.connect(g); if (p) { g.connect(p); p.connect(master); } else g.connect(master); return g; }

  const sfx = {
    laser(pn) {
      if (!ctx || muted) return; const t = now(), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.14);
      env(g, t, 0.004, 0.14, 0.22); o.connect(g); out(g, pan(pn), 0.5); o.start(t); o.stop(t + 0.2);
    },
    missile() {
      if (!ctx || muted) return; const t = now(), s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.7); f.Q.value = 1.2;
      const g = ctx.createGain(); env(g, t, 0.05, 0.8, 0.4); s.connect(f); f.connect(g); out(g, null, 0.7); s.start(t); s.stop(t + 1);
    },
    boom(size, dist) {
      if (!ctx || muted) return; const t = now(), k = Math.min(1, 0.25 + (size || 1) * 0.12), att = 1 / (1 + (dist || 0) / 900);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(1800 * k + 300, t); f.frequency.exponentialRampToValueAtTime(70, t + 0.5 + k * 1.6);
      const g = ctx.createGain(); env(g, t, 0.01, 0.5 + k * 1.8, 0.9 * k * att + 0.02); s.connect(f); f.connect(g); out(g, null, 1); s.start(t); s.stop(t + 2.6);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
      env(og, t, 0.01, 0.8, 0.6 * k * att + 0.01); o.connect(og); out(og, null, 1); o.start(t); o.stop(t + 1);
    },
    hit() { if (!ctx || muted) return; const t = now(), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12); env(g, t, 0.004, 0.14, 0.4); o.connect(g); out(g, null, 0.6); o.start(t); o.stop(t + 0.2); },
    shield() { if (!ctx || muted) return; const t = now(), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.25); env(g, t, 0.005, 0.25, 0.3); o.connect(g); out(g, null, 0.6); o.start(t); o.stop(t + 0.3); },
    alarm() { if (!ctx || muted) return; const t = now(), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 880; env(g, t, 0.005, 0.12, 0.18); o.connect(g); out(g, null, 0.4); o.start(t); o.stop(t + 0.18); },
    lance() {
      if (!ctx || muted) return; const t = now(), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(110, t + 3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; env(g, t, 0.6, 3, 0.5); o.connect(lp); lp.connect(g); out(g, null, 0.7); o.start(t); o.stop(t + 4);
    }
  };

  function engine(speed01, boost) {
    if (!ctx || !eng) return; const t = now();
    eng.g.gain.setTargetAtTime(muted ? 0 : 0.1 + 0.28 * speed01 + (boost ? 0.2 : 0), t, 0.1);
    eng.lp.frequency.setTargetAtTime(160 + 700 * speed01 + (boost ? 600 : 0), t, 0.1);
    eng.o.frequency.setTargetAtTime(44 + 40 * speed01 + (boost ? 30 : 0), t, 0.1);
  }
  function music(on) { musicOn = on; if (mus) { if (on) mus.play().catch(() => {}); else mus.pause(); } }
  function mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; if (mus) mus.muted = m; }
  function suspend(s) { if (!ctx) return; if (s) { ctx.suspend(); if (mus) mus.pause(); } else { ctx.resume(); if (mus && musicOn) mus.play().catch(() => {}); } }

  global.FPVAudio = { init, sfx, engine, music, mute, suspend, get ready() { return !!ctx; } };
})(window);
