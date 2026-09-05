import { useCallback, useState } from "react";

const KEY = "voucherku_sound";
let ctx;

const tone = (freq, start, dur, type = "sine", gain = 0.25) => {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
};

const ensureCtx = () => {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
};

export const useSound = () => {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) !== "off");

  const toggle = useCallback(() => {
    setEnabled((v) => {
      localStorage.setItem(KEY, v ? "off" : "on");
      return !v;
    });
  }, []);

  const playSuccess = useCallback(() => {
    if (!enabled) return;
    try {
      ensureCtx();
      tone(880, 0, 0.15);
      tone(1320, 0.14, 0.25);
    } catch {}
  }, [enabled]);

  const playError = useCallback(() => {
    if (!enabled) return;
    try {
      ensureCtx();
      tone(180, 0, 0.35, "sawtooth", 0.2);
      tone(140, 0.3, 0.4, "sawtooth", 0.2);
    } catch {}
  }, [enabled]);

  return { enabled, toggle, playSuccess, playError };
};
