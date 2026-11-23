"use client";

import { useStore } from "./store";

// sound. off until the visitor turns it on, howler is lazy loaded so it doesn't slow the first paint.
// files are in public/audio - CC0 stuff from freesound, cut + encoded by blender/audio.py
// from assets/audio.json (more in public/audio/README.md)
export const SOUNDS = {
  rain: { file: "rain-bed", loop: true, volume: 0.28 }, // ~5 dB under the first 0.5: it drowned the room
  room: { file: "room-tone", loop: true, volume: 0.25 },
  radio: { file: "radio-music", loop: true, volume: 0.2 }, // background, under the rain
  radioStatic: { file: "radio-static", loop: false, volume: 0.4 },
  clock: { file: "clock-tick", loop: true, volume: 0.2 },
  thunder: { file: "thunder", loop: false, volume: 0.7 },
  bus: { file: "bus-pass", loop: false, volume: 0.45 },
  door: { file: "door-creak", loop: false, volume: 0.6 },
  footsteps: { file: "footsteps", loop: true, volume: 0.3 },
  key: { file: "typewriter-key", loop: false, volume: 0.5 },
  ding: { file: "typewriter-ding", loop: false, volume: 0.5 },
  rustle: { file: "paper-rustle", loop: false, volume: 0.5 },
  stamp: { file: "stamp-thud", loop: false, volume: 0.8 },
  phone: { file: "phone-ring", loop: true, volume: 0.6 },
  tape: { file: "tape-hiss", loop: true, volume: 0.3 },
} as const;

export type SoundName = keyof typeof SOUNDS;
const STORAGE_KEY = "case-file:sound";

type HowlLike = {
  play(): number;
  pause(): void;
  stop(): void;
  volume(v?: number): number;
  fade(from: number, to: number, ms: number): void;
  stereo(pan: number): unknown;
  playing(): boolean;
};
let howls: Partial<Record<SoundName, HowlLike>> | null = null;
/** where the listener is, 0-1 on top of each sound's own volume (clock is office only) */
const levels: Partial<Record<SoundName, number>> = {};
/** howler's web audio graph. missing if it fell back to html5 audio, then no filters */
let graph: { ctx: AudioContext; out: AudioNode } | null = null;

let loading: Promise<Partial<Record<SoundName, HowlLike>>> | null = null;
/** create howler + all sounds once, two quick toggles shouldn't make them twice */
function load() {
  loading ??= (async () => {
    const { Howl, Howler } = await import("howler");
    const loaded: Partial<Record<SoundName, HowlLike>> = {};
    for (const [name, s] of Object.entries(SOUNDS) as [SoundName, (typeof SOUNDS)[SoundName]][]) {
      // ogg first, mp3 for old safari
      const src = [`/audio/${s.file}.ogg`, `/audio/${s.file}.mp3`];
      loaded[name] = new Howl({ src, loop: s.loop, volume: s.volume * (levels[name] ?? 1), preload: true });
    }
    const h = Howler as unknown as { ctx?: AudioContext; masterGain?: AudioNode; usingWebAudio?: boolean };
    if (h.usingWebAudio && h.ctx && h.masterGain) graph = { ctx: h.ctx, out: h.masterGain };
    howls = loaded;
    return loaded;
  })();
  return loading;
}

const filters: Partial<Record<SoundName, BiquadFilterNode>> = {};

/**
 * low-pass between a sound and the speakers (rain through the walls). howler has no filter api
 * so we reroute its gain nodes through one BiquadFilter, once
 */
function filterOf(name: SoundName) {
  if (filters[name]) return filters[name];
  const sounds = (howls?.[name] as unknown as { _sounds?: { _node?: AudioNode }[] } | undefined)?._sounds;
  if (!graph || !sounds?.length || !sounds.every((x) => x._node)) return undefined;
  const f = graph.ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 20000;
  for (const x of sounds) {
    x._node!.disconnect();
    x._node!.connect(f);
  }
  f.connect(graph.out);
  filters[name] = f;
  return f;
}

/** where a sound comes from: low-pass cutoff in Hz + stereo pan (-1 left, 1 right) */
export function setTone(name: SoundName, { lowpass, pan }: { lowpass?: number; pan?: number }) {
  const s = howls?.[name];
  if (!s) return;
  if (lowpass !== undefined) {
    const f = filterOf(name);
    if (f && Math.abs(f.frequency.value - lowpass) > 5) f.frequency.setTargetAtTime(lowpass, graph!.ctx.currentTime, 0.15);
  }
  if (pan !== undefined) s.stereo(Math.max(-1, Math.min(1, pan)));
}

// loops that run while sound is on. setLevel (CaseFile) decides where they're heard
// and when the footsteps walk
const AMBIENT: SoundName[] = ["rain", "room", "clock", "radio", "footsteps"];

export async function setSound(on: boolean) {
  useStore.getState().set({ soundOn: on });
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // private mode: the choice just isn't remembered
  }
  const h = await load();
  // last choice wins, another toggle might have come in while howler was loading
  const now = useStore.getState().soundOn;
  for (const name of AMBIENT) {
    const s = h[name];
    if (!s) continue;
    if (now && !s.playing()) s.play();
    if (!now) s.stop();
  }
}

/**
 * remember the choice from last time. browsers only allow audio after a click/key/tap,
 * so it shows as on right away and actually starts on the first interaction
 */
export function restoreSound() {
  if (!rememberedSound()) return;
  useStore.getState().set({ soundOn: true });
  const gestures = ["pointerdown", "keydown", "touchend"] as const;
  const start = () => {
    for (const g of gestures) removeEventListener(g, start, true);
    if (useStore.getState().soundOn) void setSound(true);
  };
  for (const g of gestures) addEventListener(g, start, true);
}

/** stop everything but keep the saved choice (used when the 3D bails) */
export function silence() {
  useStore.getState().set({ soundOn: false });
  if (howls) for (const s of Object.values(howls)) s?.stop();
}

export function play(name: SoundName) {
  if (!useStore.getState().soundOn || !howls) return;
  howls[name]?.play();
}

/** how much of a sound reaches the listener here (0-1), e.g. the clock fading in with the door */
export function setLevel(name: SoundName, level: number) {
  if (Math.abs((levels[name] ?? 1) - level) < 0.005) return;
  levels[name] = level;
  howls?.[name]?.volume(SOUNDS[name].volume * level);
}

const scrubs: Partial<Record<SoundName, { moving: boolean; timer?: ReturnType<typeof setTimeout> }>> = {};

/**
 * sound tied to a motion (door creak). plays while the thing moves, fades + pauses when it stops,
 * continues from there next time. `rewind` (door fully open/shut) resets it to the start
 */
export function scrub(name: SoundName, moving: boolean, rewind = false) {
  const s = howls?.[name];
  const st = (scrubs[name] ??= { moving: false });
  if (!s || moving === st.moving) return;
  st.moving = moving;
  if (st.timer) clearTimeout(st.timer);
  const volume = SOUNDS[name].volume * (levels[name] ?? 1);
  if (moving) {
    if (!useStore.getState().soundOn) return;
    s.volume(volume);
    s.play();
    return;
  }
  if (!s.playing()) {
    if (rewind) s.stop();
    return;
  }
  s.fade(volume, 0, 120);
  st.timer = setTimeout(() => (rewind ? s.stop() : s.pause()), 130);
}

/** loop for one moment only (tape hiss while the recorder runs). returns true if it started */
export function setLoop(name: SoundName, on: boolean) {
  const s = howls?.[name];
  if (!s) return false;
  if (!on && s.playing()) s.stop();
  if (!on || !useStore.getState().soundOn || s.playing()) return false;
  s.play();
  return true;
}

export function rememberedSound() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
