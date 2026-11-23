# Audio for The Case File

Every sound here is a **CC0 recording from Freesound**, cut, looped and encoded by
`blender/audio.py` as `.ogg` (Vorbis) and `.mp3` (Safari versions without Vorbis; the browser
downloads only one). The list, with each sound's source and how it is cut, is
`assets/audio.json`; authors and links are in `CREDITS.md` and `assets/manifest.json`.

To change a sound:

1. Find a CC0 replacement on [Freesound](https://freesound.org) (licence filter "Creative
   Commons 0"; spec §7.5 allows CC0 only, no copyrighted music).
2. Put its id, user and title in `assets/audio.json` under the slot, and adjust `pick` / `start`
   / `length` (see the `$comment` there).
3. Delete `assets-src/audio/<slot>.mp3`, then run `pnpm audio:fetch --only <slot>` and
   `pnpm blender audio.py -- --only <slot>`.

| File | Length | Loop | What it is |
|---|---|---|---|
| `rain-bed.ogg` | 90 s | yes | Heavy rain on a window pane, from inside |
| `room-tone.ogg` | 45 s | yes | A small empty room at 2 AM, street faintly outside |
| `radio-music.ogg` | 60 s | yes | Jazz loop, band-limited and saturated like a valve set |
| `radio-static.ogg` | 1.6 s | no | Tuning static |
| `clock-tick.ogg` | 4 s | yes | Wall clock tick-tock |
| `thunder.ogg` | 8 s | no | Distant lightning strike and roll |
| `bus-pass.ogg` | 7.5 s | no | A truck passing on a wet road, muffled by the window |
| `door-creak.ogg` | 3.2 s | no | Wooden door creaking open |
| `footsteps.ogg` | 9 s | yes | Slow boots on a hard floor |
| `typewriter-key.ogg` | 0.2 s | no | One manual typewriter key strike |
| `typewriter-ding.ogg` | 0.9 s | no | Carriage bell |
| `paper-rustle.ogg` | 1 s | no | Page turn |
| `stamp-thud.ogg` | 0.8 s | no | Rubber stamp on a desk |
| `phone-ring.ogg` | 6 s | yes | Western Electric 500 bell: one ring and its pause |
| `tape-hiss.ogg` | 5.2 s | yes | Tape hiss |

The silent `.wav` placeholders are gone; `scripts/placeholder-audio.mjs` can still write them for a
sound that has no recording yet.
