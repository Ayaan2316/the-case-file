"""Cuts, loops and encodes the sound effects using blender's own audio lib (audaspace).

Reads assets/audio.json and the recordings from `pnpm audio:fetch` in assets-src/audio/ and
writes public/audio/<slot>.ogg (vorbis) + <slot>.mp3 (for safari). For each sound: optional
band limiting, a window picked from the recording (see `pick`), then either a seamless loop
(equal power crossfade of the tail into the head) or short fades for one-shots, then the level -
peak dBFS for one-shots, RMS dBFS for beds. `even` (seconds) evens out the level first so a
track with a quiet intro stays just as loud.

Usage: pnpm blender audio.py [-- --only slot,slot]
"""
import json
import math
import os
import sys

import aud
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "audio")
OUT = os.path.join(ROOT, "public", "audio")
RATE = 44100
FRAME = 0.05  # envelope frame, seconds

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None


def db(x):
    return 20 * math.log10(max(x, 1e-9))


def load(path, stereo, highpass=None, lowpass=None):
    s = aud.Sound(path).resample(RATE, False)
    if highpass:
        s = s.highpass(highpass, 0.7)
    if lowpass:
        s = s.lowpass(lowpass, 0.7)
    x = np.array(s.data(), dtype=np.float32)
    if x.ndim == 1:
        x = x[:, None]
    if stereo:
        return x if x.shape[1] >= 2 else np.repeat(x, 2, axis=1)
    return x.mean(axis=1, keepdims=True)


def envelope(x):
    n = int(FRAME * RATE)
    m = x.mean(axis=1)
    frames = len(m) // n
    return np.sqrt((m[: frames * n].reshape(frames, n) ** 2).mean(axis=1) + 1e-12)


def pick(x, cfg):
    """where the window starts (s) per strategy, and how long it is (s, 0 = to the end)"""
    total = len(x) / RATE
    length = cfg.get("length", 0) or total
    tail = cfg.get("crossfade", 1.0) if cfg.get("loop") else 0
    span = min(length + tail, total)
    if "start" in cfg:
        return float(cfg["start"]), min(length, total - cfg["start"] - tail)
    env = envelope(x)
    loud = np.array([db(v) for v in env])
    win = max(1, int(span / FRAME))
    margin = int(1.0 / FRAME) if total > span + 2 else 0
    starts = range(margin, max(margin + 1, len(env) - win - margin))
    strategy = cfg.get("pick", "onset")
    if strategy in ("steady", "quiet"):
        def score(i):
            w = loud[i:i + win]
            return np.percentile(w, 95) if strategy == "quiet" else w.std()
        best = min(starts, key=score)
        t = best * FRAME
        if cfg.get("loop") and tail < 0.5:
            # short crossfade loops (footsteps) start and end between hits, not on one
            t = snap(loud, t)
            end = snap(loud, t + length)
            length = end - t
        return t, length
    peak = int(np.argmax(env))
    if strategy == "peak":
        return max(0.0, peak * FRAME - cfg.get("preroll", 0.05)), length
    if strategy == "onset":
        above = np.nonzero(env > env.max() * 0.1)[0]
        return max(0.0, above[0] * FRAME - 0.01), length
    if strategy == "cycle":
        # ringing phone: bursts above 20% of peak, one cycle = start of burst 2 to burst 3
        on = env > env.max() * 0.2
        rises = [i for i in range(1, len(on)) if on[i] and not on[i - 1] and not on[max(0, i - int(0.5 / FRAME)):i].any()]
        if len(rises) >= 3:
            return (rises[1] - 1) * FRAME, (rises[2] - rises[1]) * FRAME
        return max(0.0, rises[0] * FRAME - 0.02) if rises else 0.0, length
    raise ValueError(strategy)


def limit(x, knee=-6.0, ceiling=-1.0):
    """soft limiter, untouched below the knee then a tanh shoulder up to the ceiling"""
    t, c = 10 ** (knee / 20), 10 ** (ceiling / 20)
    a = np.abs(x)
    over = a > t
    a[over] = t + (c - t) * np.tanh((a[over] - t) / (c - t))
    return np.sign(x) * a


def moving_mean(v, n):
    c = np.concatenate([[0.0], np.cumsum(v, dtype=np.float64)])
    out = (c[n:] - c[:-n]) / n
    pad = len(v) - len(out)
    return np.pad(out, (pad // 2, pad - pad // 2), mode="edge")


def even_out(x, window, most=18.0):
    """rides the level like an AM radio compressor - slow gain bringing every part to the recording's
    overall loudness (quiet intro up, loud chorus down), at most `most` dB
    """
    n = int(window * RATE)
    m = x.mean(axis=1).astype(np.float64)
    env = np.sqrt(moving_mean(m * m, n) + 1e-10)
    gain = np.clip(np.sqrt((m * m).mean()) / env, 10 ** (-most / 20), 10 ** (most / 20))
    return (x * moving_mean(gain, n)[:, None]).astype(np.float32)


def snap(loud, t, reach=0.4):
    i = int(t / FRAME)
    lo, hi = max(0, i - int(reach / FRAME)), min(len(loud) - 1, i + int(reach / FRAME))
    return (lo + int(np.argmin(loud[lo:hi + 1]))) * FRAME


def make(cfg):
    src = os.path.join(SRC, f"{cfg['slot']}.mp3")
    x = load(src, cfg.get("stereo", False), cfg.get("highpass"), cfg.get("lowpass"))
    if cfg.get("even"):
        x = even_out(x, cfg["even"])
    start, length = pick(x, cfg)
    a = int(start * RATE)
    n = int(length * RATE)
    if cfg.get("loop"):
        k = int(cfg.get("crossfade", 1.0) * RATE)
        k = min(k, len(x) - a - n)
        out = x[a:a + n].copy()
        if k > 0:
            # equal power, the tail fades out over the head fading in
            r = np.linspace(0, 1, k, dtype=np.float32)[:, None]
            out[:k] = x[a:a + k] * np.sin(r * math.pi / 2) + x[a + n:a + n + k] * np.cos(r * math.pi / 2)
    else:
        out = x[a:a + n].copy()
        fi = min(int(0.004 * RATE), len(out))
        fo = min(int(min(0.3, 0.2 * length) * RATE), len(out))
        out[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
        out[len(out) - fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None] ** 2
    if cfg["slot"] == "radio-music":
        # valve radio output stage, gentle saturation on top of the band limiting
        out = np.tanh(out * 2.2) / np.tanh(2.2)
    peak = float(np.abs(out).max())
    rms = float(np.sqrt((out ** 2).mean()))
    level = cfg.get("level", -1)
    if level >= -6:  # one-shot: peak level
        out = out * (10 ** (level / 20) / peak)
    else:  # bed: RMS level, raindrop-like spikes get softly limited under -1 dBFS
        out = limit(out * (10 ** (level / 20) / rms))
    out = out.astype(np.float32)
    ch = out.shape[1]
    dest = os.path.join(OUT, f"{cfg['slot']}.ogg")
    sound = aud.Sound.buffer(np.ascontiguousarray(out), RATE)
    channels = aud.CHANNELS_STEREO if ch == 2 else aud.CHANNELS_MONO
    sound.write(dest, RATE, channels, aud.FORMAT_S16, aud.CONTAINER_OGG, aud.CODEC_VORBIS, 112000 if ch == 2 else 64000, 16384)
    # same thing as mp3 for safari versions without vorbis (audio.ts lists both)
    sound.write(dest[:-4] + ".mp3", RATE, channels, aud.FORMAT_S16, aud.CONTAINER_MP3, aud.CODEC_MP3, 128000 if ch == 2 else 80000,
                16384)
    print(f"[audio] {cfg['slot']:<16} {start:7.2f}s +{length:6.2f}s  peak {db(float(np.abs(out).max())):6.1f} dBFS  "
          f"rms {db(float(np.sqrt((out ** 2).mean()))):6.1f} dBFS  {ch}ch  {os.path.getsize(dest) / 1024:6.1f} KB")


def main():
    sounds = json.load(open(os.path.join(ROOT, "assets", "audio.json"), encoding="utf-8"))["sounds"]
    os.makedirs(OUT, exist_ok=True)
    for cfg in sounds:
        if ONLY and cfg["slot"] not in ONLY:
            continue
        if not os.path.exists(os.path.join(SRC, f"{cfg['slot']}.mp3")):
            print(f"[audio] {cfg['slot']}: missing, run pnpm audio:fetch")
            continue
        make(cfg)


main()
