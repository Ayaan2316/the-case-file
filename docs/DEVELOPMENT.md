> Next.js version notes: see `AGENTS.md` in the repo root.

# The Case File — portfolio of Ayaan Bagawan

A photoreal, scroll-driven 3D noir investigation. The visitor is the detective, the suspect is
Ayaan, the evidence is his work. The full build spec lives in `docs/SPEC.md`; read it before
starting a phase, and stop at every ★ CHECKPOINT.

## Ground rules

1. **Realism is the product.** Every decision trades toward "looks like a real room photographed
   at night", then we optimise until it runs. Never ship a placeholder material on a hero object.
2. **Vertical slice first.** The office hero scene must look finished (★ CHECKPOINT 3) before any
   other scene gets polish.
3. **Never invent facts about Ayaan.** All copy lives in `content/case.ts`. If something is
   missing, write `[TODO: …]` and list it in the checkpoint report.
4. **Licences:** only CC0, CC-BY (with credit), OFL or Apache-2.0 assets, fonts and audio. Log
   every asset in `CREDITS.md` and `assets/manifest.json` with source URL, author and licence. No
   copyrighted music, film stills or logos.
5. **Blender runs headless from scripts** in `/blender`
   (`pnpm blender <script>.py -- <args>`). If a Blender MCP server is connected it may be used for
   inspection and screenshots, but every scene change must also exist as a re-runnable Python
   script. Never touch Blender files outside this repo.
6. **Ask before** installing anything global/system-level (Blender add-ons, global npm packages,
   drivers), before deleting files, and before any paid service.
7. **Git:** small commits per task with clear messages. Raw downloads (`assets-src/`) are
   git-ignored and re-fetchable by script. Optimised runtime assets in `public/` go through Git LFS
   (`*.glb *.ktx2 *.hdr *.exr *.ogg *.mp3`, see `.gitattributes`).
8. **After every task:** run `pnpm typecheck && pnpm lint && pnpm build` (or `pnpm check`). After
   every scene task, capture Playwright screenshots at scroll positions
   `0.04 0.12 0.20 0.30 0.45 0.62 0.72 0.85 0.95` into `/screenshots/<phase>/`.
9. **Performance budgets (spec §11) are hard limits.** `pnpm budgets` runs
   `scripts/check-budgets.mjs`; CI runs it too.
10. **Hardware:** RTX 5070 Laptop GPU (Blackwell). Use Cycles with OptiX (CUDA fallback) for
    renders and bakes. If Cycles can't see the GPU, stop and tell Ayaan; never silently bake on CPU.

## Environment notes (verified 2026-11-01)

- Repo lives at `C:\Users\AYAAN\Projects\the-case-file\case-file` (moved there 2026-11-22; keep it out
  of OneDrive: sync locks break builds). The reports (build report, Q&A PDFs) sit beside it in
  `..\reports`.
- Node 24, pnpm 12 (`packageManager` pinned), Git LFS 3.7.
- Blender 5.1.2 is **not on PATH**. `scripts/blender.mjs` resolves it from `BLENDER_BIN` (set in
  `.env.local`) or `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`. Cycles sees the
  GPU via OptiX and CUDA.
- KTX-Software 4.4.2 is installed in `C:\Program Files\KTX-Software\bin` (not on PATH;
  `scripts/optimize.mjs` adds it for its child processes).
- Playwright and Lighthouse use the system Chrome (`channel: "chrome"`), so no browser download.

## Stack decisions

- Next.js 16 App Router, `output: "export"`, `trailingSlash: true`. No server features (no route
  handlers that read requests, no server actions, no `next/image` optimisation). This version
  differs from older Next.js; check `node_modules/next/dist/docs/` before using an API.
- `three` is pinned to **0.186.x** because `postprocessing` 6.39 requires `three <0.187`. Don't
  bump it until postprocessing widens its peer range.
- `@react-three/fiber` 9 requires `react <19.4`. Don't bump React past 19.3 until fiber allows it.
- The WebGL Canvas is client-only (`dynamic(() => import(...), { ssr: false })`). `/resume` must
  never import anything from `components/canvas`.
- `leva` is a devDependency and only loads behind `process.env.NODE_ENV === "development"`.
- Styling: plain CSS with design tokens in `app/globals.css` and CSS Modules per component.

## Layout

- `content/case.ts` holds all copy. Every component reads from it.
- `app/resume/` is the recruiter mode page: semantic HTML, no WebGL, Lighthouse ≥ 95.
- `docs/SPEC.md` is the full build spec. `CREDITS.md` and `assets/manifest.json` are the licence
  log.

## Commands

- `pnpm dev`: dev server
- `pnpm check`: typecheck + lint + build
- `pnpm start`: serve the static `out/` folder on http://localhost:4173
- `pnpm budgets`: performance budget check (run after `pnpm build`)
- `pnpm test:e2e`: Playwright smoke + screenshot tests (needs `pnpm build` first)
- `pnpm lighthouse`: Lighthouse on `/resume/` (needs `pnpm build` first)
- `pnpm blender <script.py> [-- args]`: run a Blender script headless (exports
  `blender/content.json` from `content/case.ts` first)
- `pnpm assets:fetch [--only id,id]`: download the curated Poly Haven list
  (`assets/polyhaven.json`) and OFL font files into `assets-src/`, update manifest + CREDITS
- `pnpm blender build_scene.py`: build corridor + office into `blender/scenes/case_file.blend`
- `pnpm blender render_stills.py -- office|corridor|evidence|interrogation|debug [--cams a,b]
[--samples 384] [--pct 50] [--wb 3700] [--suffix _test] [--bake-view] [--hide light,light]`:
  Cycles stills into `screenshots/blender/`
- `pnpm blender analyze_stills.py`: darkest-pixel / crushed / clipped report for the stills
- `pnpm exec wrangler pages dev out`: the static site plus the tip function locally (see Contact
  backend below)
- `pnpm audio:fetch [--only slot,slot]`: download the CC0 Freesound sounds in `assets/audio.json`
  into `assets-src/audio/` (checks each is still CC0), update manifest + CREDITS; then
  `pnpm blender audio.py [-- --only slot]` cuts, loops and encodes `public/audio/*.ogg`
- `pnpm demo-photos [--force]`: draw "witness sketch" demo images for exhibits without a real
  photo. `--force` only redraws files whose sha256 still matches the manifest, so real photos are
  never overwritten.
- `pnpm resume:pdf`: print `/resume` to `public/resume.pdf`. That file is Ayaan's own résumé now
  (LaTeX), so the script refuses to overwrite it without `--force`.
- `pnpm lite:images`: 240/480/720 px copies of `public/photos/*.webp` in `public/photos/lite`
  for the lite file (rerun after `pnpm photos`)
- `pnpm photos`: web copies of Ayaan's project photos (originals in the git-ignored
  `assets-src/photos/<project>/`) into `public/photos`; hero shots get a square crop that frames
  the build (a polaroid shows the centre square), gallery shots keep their frame. Exhibit C's
  polaroid is a crop of the Cycles office still.
- `pnpm brand`: the icons (`app/favicon.ico`, `app/apple-icon.png` from `app/icon.svg`), the share
  image `public/og.png` (title over `screenshots/blender/og_base.png`, rendered by
  `pnpm blender og_image.py`) and the scene stills `public/images/stills/*.webp` from the review
  stills (the lite file opens on the office one; Chrome encodes them: Blender's `save_render`
  darkened them ~6 levels)
- `pnpm blender probe_agx.py`: Blender's AgX against three's on a grey ramp; prints
  `AGX_TO_BLENDER` for `components/canvas/effects/grading.ts`

## Blender pipeline (Phase 2+)

- Art direction is **hybrid modern-noir** (spec §1a): modern dark room from the references,
  vintage noir story props.
- One world space: corridor at y<0 (x 0→1.8), office at y≥0 (x 0→5, y 0→4, 3.2 m ceiling). Door
  at x 0.45–1.35. Blender is Z-up; glTF export converts to Y-up.
- `blender/lib/common.py` (helpers, `world_uvs` for metre-based UVs, Poly Haven `append_model`
  / `place` / `rest_on`), `materials.py` (scanned + procedural PBR), `lighting.py`,
  `cameras.py` (review shots, vertical FOV like three.js), `procedural/*.py` (one module per area).
- Names: `static_*` baked, `dyn_*` animated/interactive, `fx_*` effects. Lights: `live_*` become
  real-time three.js lights, `bake_*` only go into lightmaps.
- Stills use AgX + view white balance 3700 K with physically warm practicals (2700–3000 K); the
  browser grade must match that look.
- Gotchas: Cycles' refractive glass blocks direct light (no caustics), so window/door glass, rain
  and the evidence bag set `visible_shadow = False`. Building thousands of meshes with per-item
  bmesh ops is quadratic; batch into one `from_pydata` call. Headless runs use
  `--factory-startup`, so `enable_gpu()` picks OptiX itself. Ayaan may have Blender open with the
  MCP add-on: never kill a `blender.exe` whose command line lacks `-b`.

## Runtime pipeline (Phase 3+)

1. `pnpm blender bake.py [-- --quick]` → `blender/scenes/case_file_baked.blend` + `blender/bakes/`.
   Each group is flattened, joined, baked once per pass (lightmap, AO, normal, roughness,
   metallic, albedo), then split back into its static mesh and `dyn_*` pieces (`SPLITS` in
   bake.py decides which parts move separately). `--quick` halves sizes and samples.
   - UV layout (`unwrap`): scans keep their Poly Haven UVs, typed text is laid flat in its own
     plane (fronts only), only the rest is smart-projected; torn decimation slivers are
     re-unwrapped; faces no room can see (outer walls, roof, slab, undersides) and zero-area faces
     sit out of packing. `TEXEL_WEIGHT` gives hero pieces (relief wall, desk chair, typewriter,
     yarn) a bigger share; the relief wall gets one flat projection (`PLANAR`).
   - Lightmaps are denoised with OIDN (the compositor's Denoise node, normal-guided) and stored
     as RGBM with the multiplier floored at 16/255 (lower M made block-compression errors swing
     dark texels ±50%: blotchy "camouflage").
2. `pnpm blender export.py` → `assets-src/export/*.glb` (one per room), RGBM lightmaps,
   `scene.json` (groups, live lights, pivots, glass/emissive specials).
3. `pnpm assets:optimize` → `public/models/*.glb` (meshopt + KTX2),
   `public/textures/lightmaps/*.ktx2` (UASTC RGBM) and the window sky
   `public/hdri/city_night_sky.ktx2` (from `pnpm blender sky.py`). Uses KTX-Software from
   `C:\Program Files\KTX-Software\bin` (not on PATH; override with `KTX_BIN`). `prune` must keep
   attributes: tiling surfaces carry their lightmap UV in TEXCOORD_1, which no texture references.
4. Browser: `components/canvas/scenes/CaseFile.tsx` loads one GLB per room, `lib/materials.ts`
   assigns lightmaps by mesh name (RGBM decode, ×π, diffuse IBL removed), `RoomProbe` captures the
   rooms as the reflection environment, `batch.ts` merges statics to stay under 150 draws.

- `node scripts/shots.mjs --url http://localhost:4173 --p 0.04,0.12,0.20 --fps --tier ultra
--gpu nvidia [--query off=shadows]` captures frames + FPS/draw calls (incl. the peak) with the
  real GPU. `--gpu intel` pins the iGPU by its adapter LUID (read from chrome://gpu each run:
  once Windows sets Chrome to High performance, no switch brings the iGPU back). `--tier auto`
  pins nothing, so the tier is guessed and may drop, as for a visitor. `node
scripts/gpu-profile.mjs "tier=medium&scale=1" 0.12,0.30` times every draw and post pass on the
  iGPU (timer queries) and lists the costliest per frame.
  `--cam establishing|desk|window` renders from the `blender/cameras.py` review shot
  with the UI hidden, for 1:1 comparison with `screenshots/blender/`. On the page: `?tier=`, `?wb=<kelvin>`,
  `?cam=px,py,pz,tx,ty,tz,fov[,focus]` (Blender coords), `?scale=` (pins the adaptive render
  scale) and
  `?off=shadows,rain,shafts,dust,dof,bloom,flashlight,post,albedo,macro,grain,ca,shine,magnifier,ao,grade,lamp,env,prepass`
  (`albedo` = baked lighting on grey, `grade` = no SinCityRed, `env` = no room probe, `lamp` = no
  interrogation lamp, `prepass` = no depth pre-pass; `post` draws nothing at all) and `?aniso=`. `window.__caseFile.scene` is the live scene. Dev builds show a Leva camera
  panel (copy keyframe JSON → `lib/cameraPath.ts`).
- Frame rate: the performance monitor (`Experience.tsx`, bounds 50/58 fps) first steps the render
  scale (`RENDER_SCALES` 1 → 0.875 → 0.75, store `renderScale`) and only at its floor drops a
  tier; it steps back up once the camera has moved on from where it stepped down. A tier sheds
  its extras before any sharpness (`settingsFor`, `TRIMS` in `lib/quality.ts`, store `trim`):
  ultra's rung 1 fewer shine lights, no chromatic aberration, lighter dust and rain, rung 2 the
  torch's shadow map at half rate; medium's one rung half the shine lights and dust, a smaller
  rain view and the torch at half rate. No rung turns shadows or a post effect off (that
  recompiles every shader: a second-long stall). Ultra's resolution then stops at one pixel per
  screen pixel (`renderScales`): ultra at 75 % on the iGPU was the "blurry office". Medium renders
  one pixel per CSS pixel, skips depth of field and chromatic aberration, and keeps the torch's
  shadows (without them its beam lit straight through the frosted door). `guessTier` starts
  Intel's older HD/UHD and Iris Plus/Pro graphics, AMD's HD/R-series APUs and NVIDIA's 2010s
  laptop chips on low (an old i5's UHD is a tenth of an Arc iGPU's fill rate), at 75 % scale;
  `?gpu=<renderer string>` tests the guess as such a laptop. Low keeps bloom and grain (nearly
  free, most of the mood), skips the tiling surfaces' macro noise (`prepareScene`, picked when a
  room loads) and steps on down to 62.5 % and 50 % (`renderScales`).
  Simulate an old i5's UHD 620 on the Arc iGPU with nine times the pixels: `gpu-profile.mjs
"tier=low&scale=3"` (`scale=2.25` / `1.875` are its 75 % / 62.5 % steps). That overstates the
  post passes (bandwidth is only 3–5× apart); a bigger viewport also overstates compositing.
  Measure the iGPU at the laptop's real size, `--size 1536x864 --dpr 1.25` (Windows runs at
  125 %), not 1280×720: that is 2.3× fewer pixels and flatters every number.
- Highlights: lightmaps hold the baked lights' diffuse part only. `lib/shine.ts` adds their
  specular (GGX, spots as small spheres, LED strips as line lights) to every lightmapped
  material from `scene.json` `highlights` (lights inside a room only; moon, street lamp and neon
  stay diffuse because nothing would shadow them). Tier sets how many lights draw highlights
  (`shineLights`) and how many light the live-lit pieces (`liveLights`: all, on every tier; they
  have no lightmap, so it is all the light they get). A short budget goes to the lights that
  matter most at the camera's focus point (`updateShine`, `camera.focus` from CameraRig:
  intensity / distance², aimed lights by their aim), crossfading over ~0.3 s. With the room's 4
  brightest, medium's résumé drawer files came out black. Pixels the bake leaves almost dark skip
  the light loop (it is the costliest part of a pixel).
- Depth of field follows a lens (`components/canvas/effects/PostFX.tsx`): focus range ∝ focus
  distance, blur ∝ focal length² / (f-stop · focus), f/2 for close-ups easing to f/4 for wide
  shots, calibrated against the desk still. Past the desk close-up the range grows as
  f-stop · distance² / focal length² (`deep`): the effect has no in-focus zone (any circle of
  confusion blends in its half-resolution blur), and the office's back wall was at 38 % of its
  sharpness on the way in.
- The window sky is at the Cycles world's 0.22: through refractive glass it isn't a camera ray.
- Dossier (Phase 4, `components/canvas/scenes/Dossier.tsx`, beats `folderOpen` / `pageFlip`):
  the baked `dyn_case_folder_front` swings on its left edge; the two pages, the clipped polaroid
  and the paperclip are built in the browser in the folder's own frame (pivot from `scene.json`).
  Page text is drawn on 2K canvases with the self-hosted fonts (`app/fonts.ts`
  `specialElite.style.fontFamily`, never the bare family name: next/font hashes it). Moving or
  opening pieces use `liveLit()` (`lib/materials.ts`): no lightmap, lit by the baked lights'
  diffuse + specular and RoomProbe, with at least 3 lights on every tier. The profile text is also
  in `app/page.tsx`'s sr-only block.
- Evidence board (Phase 5, `components/canvas/scenes/EvidenceBoard.tsx`, beat `board`): bake.py
  `STATIC_SPLITS` moves polaroids, pins and yarn into `dyn_board_pieces`, which stays on screen
  as the baked stand-in until `pageFlip` begins. From then on the live board takes over (~13
  draws): polaroids on pin/swing/body pivots, instanced pins, Verlet yarn merged into one mesh,
  and clippings/cards/notes in one atlas. The layout comes from `scene.json` `board` via
  `lib/board.ts`. Hover twists a polaroid, click flips it and opens `ExhibitPanel` (an
  accessible dialog), and the camera dollies in (`CameraRig`). The cursor is a magnifying glass
  (`effects/Magnifier.ts`), and SinCityRed keeps only the yarn, pins and stamps red.
- Bus headlights (`effects/Weather.tsx`): their shadow map has its own pass, hooked onto
  `gl.shadowMap.render` with a stand-in camera on `BUS_SHADOW_LAYER`. That layer holds the
  blinds plus the window wall, ceiling and trim (`BUS_OCCLUDERS` in CaseFile). The shell casts
  shadows only in that pass; without it the light came straight through the walls, so on a
  tier without shadows (low) the bus is heard but its light stays off. Peak cost is +4 draws. From the street the slats overlap and block everything, so the light only enters
  through the clear band below the blinds.
- Evidence room (Phase 6, Scene E, `blender/procedural/evidence_room.py`,
  `components/canvas/scenes/EvidenceRoom.tsx`): a windowless store room far from the office
  (Blender x 0→4.2, y 30→33.6) the camera _cuts_ to at `CUTS.table`. One bag per
  `content.tools` entry, its contents picked by keyword (`contents_`), its own GLB
  (`evidence.glb`, groups `evidence_*`) loaded lazily from progress 0.42 with its own lightmaps
  and reflection probe. The bake keeps paper blank: the panels, tags and clipboard log are
  printed in the browser from content (`evidencePrint.ts`) at the `evid_decal_*` poses
  export.py writes to `scene.json` `table.decals`, so renaming a tool needs no re-bake (adding
  or removing one does). Bags are additive film (`glassFor` evidence_bag + shine): they never
  veil what's inside.
- Interrogation + verdict (Phase 7, Scenes F/G, `blender/procedural/interrogation_room.py`,
  `components/canvas/scenes/Interrogation.tsx`, `interroPrint.ts`): a third room (Blender x 0→4,
  y 40→43.6, 3 m) cut to at `CUTS.interrogation`, loaded lazily from 0.56 (`interrogation.glb`,
  groups `interro_*`). Its lamp is the only real light and it swings, so it is _live_
  (`case_realtime`: the bake leaves it out) and the bake gets small bounce stand-ins instead
  (`case_bake_only`: the stills leave them out). Calibrate the stand-ins with
  `render_stills.py -- interrogation --bake-view` (what the lightmaps hold) against the plain
  still. The lamp's SpotLight is in the scene from the start at intensity 0 (adding a shadowed
  light later recompiles every shader); it swings from the hook, flickers after the cut, and
  draws an additive haze cone. The one-way mirror is a three `Reflector` at the `interro_mirror`
  marker, 6 mm in front of the baked backing (no silhouette in it: Ayaan cut it). The room is in
  colour, not SinCityRed (also Ayaan's call). Hide the reflector during a cube capture: it
  resets the render target to face 0. The transcript types by a per-glyph order texture (a
  uniform compare, no per-frame upload); the stamp is carried by scroll but falls in a fixed
  0.12 s, then inks the cover, plays `stamp` and kicks `impact` (CameraRig's jolt).
- Contact (Phase 8, Scene H): `CUTS.contact` (0.885) cuts back to the office desk (space
  `office` again: the office, its sounds, rain and bus return). `props/Telephone.tsx` rings
  (`phone` loop, the handset rattling in the bell's 6 s cadence) until clicked or "Pick up the
  phone" (`lib/contact.ts` `answerPhone`); the handset lifts out of frame and `components/dom/
Notepad.tsx` opens (lazy chunk: zod + Turnstile load only then). `props/ResumeDrawer.tsx`
  builds the drawer box and files behind the baked front (the bake has the front only); opening
  it blends the camera to `CABINET_VIEW` and downloads `/resume.pdf` once it's out. The scroll
  ends there too: after the phone's close-up (`BEATS.phone`, 0.885–0.935) the camera goes round
  the desk's front-left (straight across it met the banker's lamp) to `CABINET_VIEW`, and the
  drawer slides out with the scroll (`BEATS.cabinet`). Scrolling never downloads; the caption
  links the PDF, and "Open the résumé" opens `components/dom/ResumeWindow.tsx`: a dialog with the
  same `CaseReport` as /resume, rendered on the server and passed in from `app/page.tsx`
  (`nested`: h2, no `<main>`, ids prefixed so they don't clash with the print-only copy). Its
  backdrop is the scroller (`data-lenis-prevent`), so the wheel reads the résumé, not the story.
  The bell, quieter over there, rings on until answered.
- Contact backend (spec §12): `functions/api/tip.ts` (Pages Function: `lib/tip.ts` zod schema,
  shared with the form; Turnstile siteverify; 5 tips/hour per salted IP hash; D1 `tips`, see
  `migrations/`). Pages Functions have no `send_email` binding, so email goes through
  `workers/tip-mailer` (its own Worker with the binding, no public route) over the `MAILER`
  service binding. Local run: `cp .dev.vars.example .dev.vars`, `pnpm build`,
  `pnpm exec wrangler d1 migrations apply case-file-tips --local`,
  `pnpm exec wrangler pages dev out` (the mailer: `pnpm exec wrangler dev -c
workers/tip-mailer/wrangler.toml`, which writes each email to a local .eml). Turnstile uses
  Cloudflare's always-pass test keys until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET`
  are set. `functions/` and `workers/` have their own tsconfig (Workers types).
- Shots and cuts (`lib/cameraPath.ts`): a keyframe with `cut: true` starts a new shot with its own
  spline; the camera jumps inside a dip to black (`camera.blackout`, applied as exposure).
  `camera` (smoothed progress, blackout, `space`) is what room culling and room-bound effects
  read (rain refraction, lightning, bus, board physics are office-only), never the raw scroll.
- Tests and tools: `window.__caseFile.store` (the zustand store) and `toScreen(x, y, z)` (CSS px
  of a world point) let Playwright open exhibits and aim the mouse.
- Gotchas:
  - A slab whose top is coplanar with the floor makes Cycles' camera rays hit either: the
    interrogation stills showed the black slab instead of the floor (its slab now sits 0.5 mm
    lower). The browser drops those faces anyway (`drop_faces_under_floors`).
  - SinCityRed runs after the white balance: before it, its greys picked up the 3700 K
    correction and the whole grade went blue.
  - Light colours use `blackbody()` (grading.ts, Blender's own curve, probed headless); `kelvin()`
    is 35 % short on blue at 3000 K and only the white balance keeps it (calibrated with it).
  - three runs the full BRDF for every light on every lit pixel, even a light that is off: six
    live lights, most of them dark in any one room. `materials.ts` patches
    `ShaderChunk.lights_fragment_begin` globally to skip a light whose colour is zero there (no
    pixel changes; a fifth of the frame at old-i5 load). Keep lights at zero intensity rather
    than adding or hiding them (that recompiles every shader), and they now cost next to nothing.
  - Ink printed in the browser sits `PRINT_LIFT` (0.4 mm) above its sheet with `PRINT_DEPTH`
    (`lib/materials.ts`: a constant polygon offset too). A slope-only offset is zero on a sheet
    seen square-on, and on a real phone the interrogation transcript lay behind its own paper:
    blank. Emulation on this laptop's GPUs never showed it.
  - A print that covers a small patch of a page gets a plane that size (`region` in
    `interroPrint.ts`), and a print that isn't there yet is hidden: the verdict's label and the
    unlanded stamp were full-cover transparent planes, shaded over the whole folder.
  - three sorts opaque draws by material before distance, so nothing is drawn front to back: in
    the desk close-ups the floor and walls were shaded in full and then painted over (23 ms of GPU
    at the folder on the Arc 140T; 9 ms since). `depthFirst` (`scenes/batch.ts`) draws the desk's
    furniture and props batches depth-only first (2 draws; not on ultra, whose GPU has fill to
    spare and whose doorway reached 151 draws with them and the bus). Find costs like that with
    `scripts/gpu-profile.mjs`, not by switching effects off: those were all small.
  - The frosted door pane (`glassFor`) puts a soft knee on the live lights' luminance: lit like
    paper, the torch (right beside the camera) burned it white with the lens's rings on it. Per
    channel the knee bleached the warm glass grey.
  - Shadow casters cost one draw per pass per light: the flashlight's cone over the desk once
    pushed the door view to 156 draws. Casters are props of 20 cm and up, and dyn pieces that
    never move are batched (`batchStatics` `alsoMerge`).
  - three's AgX isn't Blender's (another sigmoid: middle grey 10 levels brighter, the last stops
    crushed). `SplitToneEffect` (grading.ts) maps it onto Blender's per channel in display space
    (`AGX_TO_BLENDER`, from `pnpm blender probe_agx.py`), then adds the split tone and a toe
    (black → sRGB 6, gone by 64), and decodes again for the output pass. Grade display-space
    looks on the encoded value: a 0.012 "toe" once added in linear showed as sRGB 28 and veiled
    every room in blue-grey. The vignette runs before that pass so the toe holds the corners.
  - Comparing with Cycles: `--query off=flashlight` (the stills have no torch; it is most of the
    office's shadow light) and the frame's centre (the stills have no vignette). Left after the
    grade fix, per room (bake/lighting): window blinds and evidence table darker than Cycles,
    interrogation shadows and the desk a little brighter.
  - Reading a WebGL canvas with `drawImage` from page scripts returns stale frames here; measure
    pixels on Playwright screenshots instead.
  - Near-black rough surfaces read in Cycles mostly through glossy sheen (the charcoal wall
    under the cove LED). Shine covers most of it; `SHEEN_GAIN` in `lib/materials.ts` lifts the
    rest, calibrated with `--cam`.
  - Glass that carries a texture but no alpha (picture-frame panes) must still become see-through
    glass in the browser, or it covers what's behind it.
  - React StrictMode runs memos and effects twice in dev: material tweaks must set values, not
    multiply them (dev and production otherwise look different).
  - The iGPU shares power with the CPU: right after long bakes it measures ~40 % slower. Let
    the laptop cool before an FPS report.
  - On battery, Chrome stays on the Intel iGPU even with `--force_high_performance_gpu` (the
    renderer line in `shots.mjs` says so): plug in before measuring ultra.
  - Chrome on this laptop runs WebGL on the Intel Arc iGPU unless launched with
    `--force_high_performance_gpu`. Measure ultra on the RTX, medium on the iGPU.
  - meshopt quantization moves node origins; `restorePivots` puts moving pieces back on their
    real pivots from `scene.json`, and anything that rewrites vertices must `toFloat` first.
  - A shadow-casting light whose shadow map never rendered breaks every lit draw call
    (sampler mismatch). Set `shadow.needsUpdate = true` before turning `autoUpdate` off.
  - Toggling a light's `visible` recompiles every shader; animate `intensity` instead.
  - Material `transmission` re-renders the whole scene; door glass and lamp shade fake it.
  - A `useFrame` with positive priority disables R3F's own render; only the composer (1) and
    the probe (2) use one.
  - The scroller is `pointer-events: none` so the canvas gets hover and click (the wheel still
    scrolls). Handlers for objects inside a non-R3F group go through `createPortal`; a
    `<primitive>` would re-parent the object out of its group.
  - Never disable the last EffectPass (the magnifier): the screen goes black. Its strength 0
    is the off switch.
  - SinCityRed's hue band is 336–346° / 6–11°: warm-lit cork sits at ~18° and must go grey.
  - three.js picks shadow casters by the _viewing_ camera's layers, not the shadow camera's.
    `WebGLShadowMap.render` reads `this` and needs the render state, so call it with
    `.call(shadowMap, …)` and only from inside `renderer.render` (hence the hook).
  - Close the Browser pane's WebGL tab before measuring the iGPU: it shares the GPU.
  - Paper must never lie on paper in a bake: the covered sheet bakes black and the denoiser (UV
    space) smears it into the sheet above. Lay printed layers side by side.
  - A lamp model's glass dome blocks its own light in Cycles: give lamp models
    `visible_shadow = False`, and the same for an emissive bulb mesh around a light.
  - Cycles' DIFFUSE bake is black on metal (no diffuse lobe), and the shine reads a black
    lightmap as "no light here" and drops the highlights: `bake_lightmap` turns Metallic off for
    that pass only (`_metal_off`). Without it the steel table and every brass/chrome part stayed dark.
  - ORM atlases ship as ETC1S, which shares colour endpoints across channels: sharp AO (contact
    shadows) bleeds into the roughness in 4×4 blocks, and a lamp mirrored in a big metal surface
    shows every block (the steel table's mosaic). The lazy evidence room's ORM is UASTC
    (`optimize.mjs`); Scene A+B can't afford that. Keep big mirror-ish surfaces at a constant
    roughness too.
  - Coplanar faces z-fight in the browser even where Cycles doesn't mind: each room's slab had
    its top face in the floor plane, and both floors crawled with bands on every camera move.
    `export.py` (`drop_faces_under_floors`) drops any other horizontal shell face lying in a
    floor. Anything that comes to rest on a surface (a turned page on the folder cover) needs a
    real gap, ~0.5 mm at desk distance.
  - CaseFile's scene setup (prepareScene, restorePivots, batching) runs once per loaded model
    (`userData.prepared`) because it rewrites geometry. drei's `useKTX2({...})` returns a new
    object every render, so a memo keyed on it re-ran on any re-render; a tier change mid-scroll
    then baked the open door's angle into the leaf and only the glass swung. Keep `roots` and
    other props to the scene components memoized.

## Polish and release (Phase 9)

- Deployed on Cloudflare Pages (project `case-file`, **https://case-file-ao8.pages.dev**: the
  plain name was taken). Domain `ayaanbagawan.in` (GoDaddy, nameservers `ada`/`dax.ns.cloudflare.com`,
  Cloudflare Free plan), active. `ayaanbagawan.in` and `www.ayaanbagawan.in` are attached in Pages
  > Custom domains (CNAMEs to the pages.dev name). Email Routing is enabled on the zone (MX, SPF and
  > DKIM records added by Cloudflare); the tip-mailer sends from `tips@ayaanbagawan.in` to
  > `ayaan.i.bagawan@gmail.com`, which must be a _verified_ destination address (Email Routing >
  > Destination addresses) or `send_email` fails. "could not find account config of sending domain"
  > in `wrangler pages deployment tail` meant Email Routing wasn't on yet.
  - Build settings are in the committed `.env.production` (public values only:
    `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` of the Turnstile widget "Case File tip
    line"); canonical, OG, sitemap and robots read the URL.
  - Secrets live in Pages (Settings > Variables and Secrets), never in the repo: `IP_SALT` (set)
    and `TURNSTILE_SECRET` (Ayaan pastes it: `pnpm exec wrangler pages secret put TURNSTILE_SECRET
--project-name case-file`).
  - D1 `case-file-tips` (APAC) has its id in `wrangler.toml`; migrations: `pnpm exec wrangler d1
migrations apply case-file-tips --remote`. The `case-file-tip-mailer` Worker must exist before
    a Pages deploy (the `MAILER` service binding fails it otherwise).
  - Deploy: `pnpm build`, then `pnpm exec wrangler pages deploy --branch main --commit-dirty=true`
    from the PowerShell terminal: Wrangler's login lives there; the agent's bash keeps another
    config dir and reads as logged out. Upload the built `out/` (never let Pages build from git:
    the models and textures are Git LFS).
- Lite file or 3D (`lib/mode.ts`): phones, older laptop graphics (`OLD_GPU`), graphics drawn in
  software and browsers without WebGL2 get the **lite file** (`components/lite/LiteFile.tsx`);
  laptops that run medium or ultra get the 3D.
  `MODE_SCRIPT` runs inline first thing in `app/page.tsx`'s body, before anything paints, and sets
  `data-mode` (`lite`/`3d`) and `data-lite` (why: `phone|old|none|software|slow|lost`, picks the
  note in the lite file's opening) on `<html>`; `globals.css` `.lite-only` / `.three-only` hide the
  other one, and with no script at all the lite file is what shows. Phones skip the WebGL probe;
  the probe's result is cached in `window.__gpu` for `lib/quality.ts`. `app/ThreeGate.tsx` loads the
  3D (`Home`, its own chunk) only in 3D mode: phones never download it, the models or the audio.
  `?3d`, a pinned `?tier=` or "Open the 3D case file" (a plain `<a href="/?3d">`: a client-side
  `<Link>` wouldn't rerun the script) ask for the 3D for the visit (`force3d`, sessionStorage), and
  the script drops `3d` from the address bar. When the 3D gives way mid-visit (store `flat`), Home
  calls `toLite(reason)` and ThreeGate unmounts it.
  - The lite file is server-rendered HTML and CSS (`lite.module.css`): it reads and scrolls with no
    JavaScript. Only the tip form (`TipForm.tsx`) hydrates; Turnstile (`lib/turnstile.ts`, shared
    with Notepad) and zod load once the form comes near or is touched, and its button stays
    disabled until React runs (no data in a GET URL). The board is laid out at build time
    (`board.ts`: spots per layout, strings as SVG paths, labels in the gap between rows).
  - The board is the projects section: each polaroid opens its exhibit's file over the page
    (`ExhibitFile`, `#exhibit-a`…), shown by CSS `:target`, so it opens and closes with no
    JavaScript and the back button closes it; `globals.css` stops the page scrolling behind it
    (`:has`). `FileKeys.tsx` adds focus (into the file, back to its photo), Escape, ← / →, a Tab
    trap, and closes with `history.back()` (the page stays where it was); stepping to another
    exhibit uses `location.replace`, so closing returns to the board. A closed file's photos
    don't load until it opens.
  - Images: `pnpm lite:images` makes 240/480/720 px copies in `public/photos/lite`, used through
    `srcSet` (`lib/imageSize.ts` reads WebP sizes at build). The opening photo is a CSS
    background (a hidden `<img>` would still download on laptops in 3D) with a `preload` hint.
  - Old-phone safe CSS: no flex `gap` or `inset`; `aspect-ratio` and `clip-path` only where the page
    reads fine without them. A class that sets margins on a `p`/`ul`/`h3` needs `.lite .x`: the
    element reset `.lite p` would beat a bare class.
  - Section anchors differ from the print-only CaseReport's ids on the same page (`#subject`,
    `#cover-story`, `#exhibit-a`…). In 3D mode the lite file's form is in the DOM (hidden): scope
    label lookups in tests to the notepad dialog.
  - Lighthouse mobile on `/` (lite): 85, LCP 4.4 s simulated slow 4G, TBT 80 ms, CLS 0.
    `MSYS_NO_PATHCONV=1 pnpm lighthouse /` from Git Bash (it rewrites `/` into a Windows path).
  - Tests: `tests/lite.spec.ts`, `fallback.spec.ts` (no WebGL), `old-laptops.spec.ts`. The full
    suite is reliable at `--workers 2`; at the default the 3D tests contend for the GPU.
- Phones that ask for the 3D: the low tier loads the `.low` asset set (half-size textures, `optimize.mjs` `VARIANTS`),
  picked once from the first tier (`store.assets`). Phones and `?tier=low` also get a shorter
  runway (`store.short`, `data-short`, 850vh instead of 1300vh); a laptop that starts on low (old
  Intel graphics) keeps the full one for its wheel. `check-budgets.mjs` checks both sets. Progress
  is computed from the page scroll (`lib/scroll.ts`), not from ScrollTrigger's cached height, so
  the runway can change. The phone path (`store.phone`, from `isPhone`):
  - Resolution: up to `PHONE_DPR` (1.5) canvas pixels per CSS pixel, not low's 1 (a Pixel 7 drew
    one per 2.6: soft). It starts by GPU name (`phoneStartScale`: flagship Adreno 640+/Mali-G610+
    at 1.5, budget Mali-G5x/Adreno ≤613/PowerVR at ~0.94, the rest and iPhones ("Apple GPU") at
    ~1.1) and the ladder moves it, down to 0.75.
  - `frameloop="never"` with `FrameCap` (Experience): 120 Hz+ screens draw every other tick, so a
    120 Hz Android draws 60 fps, not 120 (heat, then throttling). R3F times such frames in
    _seconds_: `advance(t / 1000)`, or every frame looks 16 s long (SlowGuard took the 3D down).
    The performance monitor's bounds stay 50/58 there.
  - No magnifier pass without a fine pointer (PostFX, decided once); no depth pre-pass on GPUs that
    drop hidden pixels themselves (`store.hsr`: Apple, PowerVR); Mali and Adreno keep it (the floor
    under the desk was a third of a mid-range phone's frame at the folder).
  - The stage is `100lvh`, not the visible viewport, and ScrollTrigger ignores mobile resizes: the
    address bar sliding in and out no longer resizes the canvas mid-scroll.
  - Portrait screens widen the FOV, and close shots (under ~1.6 m) also step back along their line
    of sight, up to ~40 % (`CameraRig`): the folder's pages and the transcript were cut off.
  - Budget phones (`isBudgetPhone`: phoneStartScale's bottom class, or `deviceMemory` ≤ 3; store
    `budget`): their CPU, 5–7× slower than this laptop's, set the frame rate before their GPU did
    (CPU throttled 6× with a fast GPU: 15–41 fps). They start in steady 30 (`fps30`: FrameCap
    waits 29.5 ms; even frames read as film, 30–45 wandering reads as stutter), with FXAA merged
    into the grade for SMAA's passes and no bloom (both decided before the stack is built). Any
    device still under 45 fps at low's floor moves into steady 30 too (SlowGuard); there the
    monitor's bounds are 25/29 and it never steps up (every frame is on time whatever the
    headroom). CPU work that went for everyone: low's lightmapped surfaces carry no highlight
    uniforms (three re-sent ~170 floats before every draw), statics' matrices are frozen
    (`freezeStatics`), the bus light isn't added without its shadow pass and the banker's lamp
    not on phones (fewer lights in every lit draw), the corridor leaves the draw list once the
    camera faces into the office, and the board's yarn is only rebuilt when it moved (budget
    phones have no draught, so it settles; a TubeGeometry per string per frame was garbage
    collection pauses of a quarter second). `node scripts/cpu-profile.mjs "gpu=Mali-G57%20MC2"
0.12 6` profiles the CPU per frame.
  - Touch copy: `.touchOnly` / `.mouseOnly` (Overlay, `pointer: coarse`), e.g. "Tap a polaroid".
    The evidence room's tool list goes two columns under 560 px tall (a phone held sideways).
  - Simulate a mid-range phone on the Arc iGPU: `gpu-profile.mjs "scale=2.37" <points> 412x839
phone` (Pixel 7 emulation, ten times the pixels of its 1.1 start). Intel draws every hidden
    pixel, so the figures are pessimistic for Apple/PowerVR. Touch scrolling in Playwright needs
    CDP `Input.dispatchTouchEvent` (`synthesizeScrollGesture` doesn't scroll). `tests/phones.spec.ts`.
- Reduced motion: no Lenis; `html.snap` scroll-snaps to `REDUCED_MOTION_STOPS` (one per held
  beat, `lib/cameraPath.ts`) and each wheel tick steps to the next stop.
- When the 3D can't run well, the lite file takes over mid-visit (store `flat` → `toLite`), so the
  site runs on any laptop. Without a scene (`ready` false), `openDrawer` downloads the PDF directly.
  - graphics drawn in software or no WebGL2 (`webglSupport`), normally caught by the mode script;
  - the graphics driver drops the context and it hasn't come back 1.5 s later (Experience);
  - medium at its lowest resolution and still under 50 fps: it doesn't step down to low by itself;
    `SlowNotice` offers the lite file, and only "Keep the 3D" (`force3d`) lets it go on to low;
  - under 8 fps for two 4 s windows anywhere (`SlowGuard`): the lite file, or for a visitor who
    asked for the 3D, straight to low at 50 %; there, under 45 fps → steady 30, under 20 fps →
    `SlowNotice`, under 8 fps → the lite file.
    A pinned `?tier=` counts as asking for the 3D (tests on CI machines without a GPU). Taking over
    silences the sound and scrolls to the top. (The lite file replaced the old photographs page,
    `NoWebGLFallback`.) An 8–30× CPU throttle (CDP `Emulation.setCPUThrottlingRate`) with `?3d&gpu=` an
    HD 4000 plays a very old laptop that asked for the 3D.
- Printing `/` prints `components/report/CaseReport.tsx` (print-only) instead of the canvas.
  `app/page.tsx` also carries the JSON-LD Person (`lib/person.ts`) and the sr-only story text.
- Easter eggs (`components/dom/EasterEggs.tsx`, `props/EasterEggs.tsx`): the Konami code lights
  the banker's lamp, the ESP32's LED blinks HIRE ME in Morse, clicking the fedora puts its brim
  over the view, the tab title changes while the visitor is away, and the console has a note.
  Props merged into batches stay clickable through `recordRegion` (`scenes/interactions.ts`):
  record the region before batching.
- Audio: `setTone(name, { lowpass, pan })` filters a playing sound (rain behind glass, the clock's
  side); every sound ships as .ogg and .mp3 (Safari). Sound starts off (browsers start audio only
  from a click, key or tap); the opening caption offers "Turn the sound on", and `restoreSound`
  brings a remembered "on" back at the visitor's first click anywhere (spec §7.5).
- Tests: `screenshots.spec.ts` walks the standard positions (lit, not blank, < 150 draws);
  `fallback.spec.ts` runs Chrome without WebGL (launch flags are per worker, so they sit at the
  file's top level).

## Photos and references

- Exhibits have a `kind`: `project` and `research` go on the résumé in their own sections;
  `sealed` ("coming soon") files are on the board only, and their panel leaves out the empty
  Evidence and Tools lists. `board` is a short polaroid label for a long title.
- `public/photos/ayaan.webp`, `bumblebee*.webp` and `desk-pet*.webp` are Ayaan's own photos
  (`pnpm photos`). `case-file.webp` is a Cycles render; `coco*.webp` is the Coco project's own art (`pnpm photos coco`); `data-privacy` and
  `sealed-*` are drawn cards (`pnpm demo-photos`, `scripts/demo-photos/sketch.js`).
- Evidence bags pick their prop by the tool's name (`contents_` in evidence_room.py): a renamed
  tool may need a new pattern there, and a rebuild + re-bake of `evidence_props`.
- `reference/` holds mood references (third-party, git-ignored, never shipped). They are dark
  modern CG interiors, not photos, so they guide mood and lighting only.
