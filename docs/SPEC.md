# THE CASE FILE — Build Spec

> Portfolio of **Ayaan Bagawan**. A photoreal, scroll-driven 3D noir investigation.
> The visitor is the detective. The suspect is Ayaan. The evidence is his work.
>
> **Read this entire file before writing any code.** Then follow the phases in §14 in order.
> Stop at every ★ CHECKPOINT, show Ayaan what you built (screenshots / renders), and wait for "go".

---

## 0. Ground rules (copied into `docs/DEVELOPMENT.md` in Phase 0)

1. **Realism is the product.** Every decision trades toward "looks like a real room photographed at night", then we optimise until it runs. Never ship a placeholder material on a hero object.
2. **Vertical slice first.** The office hero scene must look finished (★ CHECKPOINT 3) before any other scene gets polish.
3. **Never invent facts about Ayaan.** All copy lives in `content/case.ts`. If something is missing, write `[TODO: …]` and list it in your checkpoint report.
4. **Licences:** only CC0, CC-BY (with credit), OFL or Apache-2.0 assets, fonts and audio. Log every asset in `CREDITS.md` and `assets/manifest.json` with source URL, author and licence. No copyrighted music, film stills or logos.
5. **Blender runs headless from scripts** in `/blender` (`blender -b -P blender/<script>.py -- <args>`). If a Blender MCP server is connected, you may use it for inspection and screenshots, but every scene change must also exist as a re-runnable Python script. Never touch Blender files outside this repo.
6. **Ask before** installing anything global/system-level (Blender add-ons, global npm packages, drivers), before deleting files, and before any paid service.
7. **Git:** small commits per task with clear messages. Raw downloads (`assets-src/`) are git-ignored and re-fetchable by script. Optimised runtime assets in `public/` go through Git LFS (`*.glb *.ktx2 *.hdr *.exr *.ogg *.mp3`).
8. **After every task:** run `pnpm typecheck && pnpm lint && pnpm build`. After every scene task, capture Playwright screenshots at the scroll positions in §6 into `/screenshots/<phase>/`.
9. **Performance budgets in §11 are hard limits.** Add `scripts/check-budgets.mjs` and run it in CI.
10. **Hardware:** Ayaan's laptop has an RTX 5070 Laptop GPU (Blackwell). Use Cycles with OptiX (or CUDA) for renders and bakes. Check `blender --version` first. A recent release (4.5 LTS or newer) is recommended for RTX 50-series. If Cycles can't see the GPU, stop and tell Ayaan; don't silently bake on CPU for hours.

---

## 1. The concept in one paragraph

A rainy night in Bengaluru. You walk down a dim corridor to a frosted-glass door with gold-leaf lettering: **AYAAN BAGAWAN — ENGINEERING & INVESTIGATIONS**. Scroll and the door creaks open. Inside is a 1940s detective office that someone has been using to build drones and robots. Your cursor is a flashlight. A case folder sits on the desk: **CASE FILE No. 2316 — SUBJECT: AYAAN BAGAWAN — STATUS: UNKNOWN**. You open the dossier, study the evidence board (red string connects his projects), inspect the suspect's tools in evidence bags, sit in on his interrogation, and watch the verdict stamp slam down: **GUILTY — of building too many things at once. SENTENCE: Hire him.** Then the phone on the desk rings. Pick it up to contact him.

Tone: cinematic, moody, witty. Think film-noir set dressing, photographed like a modern A24 film: deep shadows, warm practical lights, cold moonlight, rain everywhere. Local flavour: Bengaluru details (a ceiling fan, filter coffee in a steel davara-tumbler, a Kannada neon sign outside, a BMTC bus whose headlights sweep through the blinds).

---

## 1a. Art direction: hybrid modern-noir (decided 2026-11-01, overrides §1/§5 where they differ)

Ayaan picked a hybrid: the **room** is a present-day Bengaluru office, renovated dark inside an older building; the **story props** stay vintage noir. Mood references live in `/reference` (local only).

- **Architecture and light (from the references):** a heavily textured charcoal feature wall (stone/plaster relief) grazed by a warm cove light; dark stained wood-plank ceiling with black track spots; warm LED strips under black floating shelves; floor-to-ceiling black steel-framed window as the cool source (rain, Bengaluru night, the Kannada neon across the street) with dark venetian blinds kept for light shafts and the bus-headlight sweep; warm-grey plaster on the other walls; mid-brown plank floor; charcoal woven rug.
- **Furniture:** modern. Ebonised/black oak desk, black leather executive chair, black floating shelves, dark steel filing cabinet.
- **Story props stay vintage:** manila case folder, typewriter, rotary phone, green banker's lamp, valve radio, wall clock, coat rack with trench coat and fedora, evidence board, magnifying glass, steel davara-tumbler, ceiling fan.
- **Light:** warm ~2700 K practicals and strips against cool moonlight/neon through the window. Low-key exposure that keeps shadow detail (darkest pixels ~RGB 6–10).
- **Corridor:** stays older and grittier (old building, renovated office) so the door reveal has contrast.
- **Realism bar is unchanged:** the target is a real photograph. The references are CG and only set mood and lighting.

---

## 2. Tech stack (use latest **stable** versions, no alphas/RCs)

| Area      | Choice                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Framework | Next.js (App Router, TypeScript, `output: 'export'` static build) + React 19                                                  |
| 3D        | `three`, `@react-three/fiber` v9 (pairs with React 19), `@react-three/drei`, `@react-three/postprocessing` + `postprocessing` |
| Motion    | `gsap` + `ScrollTrigger` + `@gsap/react` (`useGSAP`), `lenis` for smooth scroll                                               |
| State     | `zustand` (scene index, scroll progress, selected exhibit, sound on/off, quality tier)                                        |
| Audio     | `howler` for music/ambience, `THREE.PositionalAudio` for in-world sounds                                                      |
| Utils     | `maath` (damping/easing), `leva` (dev-only tuning panel, stripped from prod)                                                  |
| Assets    | Blender (headless Python), `@gltf-transform/cli` (meshopt + KTX2), `ktx` / `toktx` for textures                               |
| Hosting   | Cloudflare Pages (static `out/`) + Pages Functions (`/functions/api/tip.ts`) + D1 + Turnstile                                 |
| Testing   | Playwright (screenshot + smoke tests), Lighthouse for `/resume`                                                               |

`next.config.ts`: `transpilePackages: ['three']`, `output: 'export'`, `images: { unoptimized: true }`.
Render the Canvas client-only (`dynamic(() => import(...), { ssr: false })`).

---

## 3. Repo structure

```
case-file/
├─ app/
│  ├─ layout.tsx            # fonts, metadata, OG image, Cloudflare Web Analytics
│  ├─ page.tsx              # <Experience/> + DOM overlay + scroll container
│  ├─ resume/page.tsx       # "Recruiter mode": plain, fast, accessible résumé (no WebGL)
│  └─ not-found.tsx         # 404: "CASE NOT FOUND" (stamped, with a link back)
├─ components/
│  ├─ dom/                  # Loader, Overlay, SceneCaptions, RecruiterButton, SoundToggle,
│  │                        # ExhibitPanel, TipForm, Cursor, QualityBadge, NoWebGLFallback
│  └─ canvas/
│     ├─ Experience.tsx     # Canvas, renderer config, Suspense, PerformanceMonitor
│     ├─ CameraRig.tsx      # scroll → camera spline + lookAt + fov + focus distance
│     ├─ scenes/            # Corridor, Office, Dossier, EvidenceBoard, EvidenceTable,
│     │                     # Interrogation, Verdict, Contact
│     ├─ props/             # Flashlight, Radio, Typewriter, Telephone, WallClock, CeilingFan,
│     │                     # FilingCabinet, Polaroid, RedString, EvidenceBag, Stamp, TapeRecorder
│     └─ effects/           # RainGlass, LightShafts, DustMotes, Lightning, BusHeadlights,
│                           # NeonSign, PostFX, SinCityRed (custom Effect)
├─ content/case.ts          # ALL copy, exhibits, connections, links (see §9)
├─ lib/                     # store.ts, scroll.ts, cameraPath.ts, audio.ts, quality.ts, materials.ts
├─ shaders/                 # rainGlass.glsl, lightShaft.glsl, sinCityRed.glsl, paperCurl.glsl
├─ public/                  # models/*.glb, textures/*.ktx2, hdri/*.hdr, audio/*, fonts/*, resume.pdf
├─ assets-src/              # RAW downloads (git-ignored)
├─ assets/manifest.json     # every asset: id, source, url, author, licence, used-in
├─ blender/
│  ├─ build_scene.py        # assembles every scene from assets + procedural geometry
│  ├─ procedural/           # room_shell.py, blinds.py, cork_board.py, folder.py, polaroid.py,
│  │                        # evidence_bag.py, neon_sign.py, door.py, papers.py
│  ├─ materials.py          # PBR material library (wood, plaster, cork, paper, brass, glass…)
│  ├─ lighting.py           # moonlight, practicals, neon, bake lights
│  ├─ bake.py               # lightmap + AO bake per static atlas
│  ├─ export.py             # glTF export per scene (static atlas + dynamic props)
│  ├─ render_stills.py      # Cycles review stills + OG image
│  └─ scenes/*.blend        # generated, git-ignored except final
├─ scripts/
│  ├─ fetch-assets.mjs      # Poly Haven API downloader (see §8)
│  ├─ optimize.mjs          # gltf-transform + KTX2 pipeline
│  └─ check-budgets.mjs     # fails build if §11 budgets are exceeded
├─ functions/api/tip.ts     # Cloudflare Pages Function: Turnstile verify → D1 insert → email notify
├─ reference/               # Ayaan drops mockup screenshots + mood images here
├─ CREDITS.md
└─ docs/DEVELOPMENT.md
```

---

## 4. The realism playbook (non-negotiable)

How award-level sites get photoreal in a browser: **Blender does the expensive light; the browser does the living details.**

### 4.1 Lighting strategy: baked GI + live accents

- **Static geometry** (room shell, desk, cabinets, shelves, board frame, interrogation room) is lit in Blender Cycles and **baked to lightmaps** (diffuse direct + indirect) plus **AO maps**. In Three.js, keep `MeshStandardMaterial`/`MeshPhysicalMaterial` so normals/roughness still react to live lights. Assign the bake to `material.lightMap` (and `aoMap`), using the second UV set.
  - glTF exports the 2nd UV set as `TEXCOORD_1`. In current three.js that's the `uv1` attribute, so set `lightMap.channel = 1` and `aoMap.channel = 1`.
  - Avoid banding: bake to 16-bit/EXR, then ship as KTX2 HDR (UASTC HDR if the installed three/KTX tooling supports it) **or** RGBM-encoded PNG→KTX2 with a decode in `onBeforeCompile`. Pick one, document it, and test for banding on dark gradients.
  - The glTF exporter won't carry lightmaps. Export them as separate textures named `<atlasName>_lm.ktx2` and assign them in code by mesh name (`lib/materials.ts`).
- **Live lights** (real-time): the **flashlight** (SpotLight with a `map` cookie texture for a real lens pattern, soft penumbra, slight flicker), the **passing bus headlights** (one shadow-casting SpotLight sweeping through the blinds), **lightning** flashes, the **interrogation lamp** (swinging), the **neon sign** glow (emissive + small PointLight), and the **desk lamp** once Ayaan "turns it on" (easter egg).
- **Reflections:** a local night HDRI (Poly Haven, 1K–2K) for env reflections only (`environmentIntensity` low). Add drei `<Lightformer>`s for highlights on brass, glass and lacquered wood.

### 4.2 Materials

- Real **PBR** everywhere: albedo, normal, roughness, (metalness), AO. Prefer Poly Haven/ambientCG textures at 2K for hero surfaces, 1K elsewhere.
- **Bevel every hard edge** (Bevel modifier 1.5–4 mm, harden normals). Sharp CG edges are the #1 realism killer.
- **Imperfection layers:** fingerprint/smudge roughness maps on glass and brass, dust on top surfaces (top-facing mask), edge wear on painted metal and wood, water rings on the desk, coffee stains on papers, scuffs on the floor near the chair.
- **Break tiling:** macro-variation overlay or a triplanar blend on walls and floor. No visible texture repeats.
- **Real scale:** metres. Desk height 0.75 m, door 2.1 m, ceiling 3.2 m (old building). Camera at eye height 1.6 m standing, 1.2 m seated.
- **Specific shading:** `MeshPhysicalMaterial` with `transmission` for glass (window, tumbler, magnifier), `clearcoat` for lacquered desk and Bakelite phone, `sheen` for the trench coat and fedora felt, `anisotropy` for brushed metal (stamp handle, filing cabinet).
- **Paper** gets subtle `transmission`/thickness or a fake back-light term so it glows when the flashlight is behind it.

### 4.3 Camera and lens

- Use a cinematic FOV of 35–42°. Add subtle **handheld micro-shake** (low-amplitude noise on rotation, scaled down when the visitor is reading).
- **Depth of field** with focus pulls driven by scroll (focus on the folder, then the board, then the transcript).
- Exposure: never crush to pure `#000`. The darkest pixels sit around RGB 6–10 with visible detail under the flashlight.

### 4.4 Atmosphere

- **Rain on the window:** an original shader with static droplets, running trails and refraction of the blurred city behind (bokeh). If you adapt any Shadertoy, check its licence first and credit it in `CREDITS.md`.
- **Light shafts** through the venetian blinds: additive mesh shafts generated per slat with a scrolling noise shader, plus **dust motes** (instanced soft sprites, Brownian drift) visible mainly inside the shafts.
- **Fog:** very light `FogExp2` in navy, stronger in the corridor.
- **Lightning:** every 25–45 s a double flash (exposure spike plus a moonlight intensity spike), with thunder 1–3 s later.
- **Bus headlights:** every ~40 s, light stripes sweep across the ceiling and wall through the blinds (dynamic shadows from the blind slats), with a muffled engine sound and a distant horn.

### 4.5 Post-processing stack (order matters)

1. SMAA (or MSAA via `multisampling` if cheaper on the tier)
2. Depth of Field (scroll-driven focus)
3. Bloom: selective, luminance threshold high, for lamp bulbs, neon and phone dial
4. **SinCityRed** custom effect (see §7.4): near-monochrome grade that keeps reds saturated. Fades in on the evidence board, interrogation and verdict.
5. Colour grade: AgX or ACES tone mapping, plus a LUT (`.cube`, teal shadows / amber highlights). Build the LUT yourself in Blender or code. No paid LUTs.
6. Vignette (subtle), Film grain (animated, ~0.04), slight Chromatic Aberration at the edges only.

### 4.6 Realism acceptance test (run at ★ CHECKPOINT 2 and 3)

- [ ] Side-by-side with 3 real reference photos of noir offices (Ayaan provides them in `/reference`), it reads as a photo at a glance
- [ ] No pure-black or clipped-white regions except bulbs
- [ ] Every hero prop has bevels, roughness variation and contact shadows (baked AO)
- [ ] Nothing floats; nothing intersects; texel density is consistent (~1024 px/m hero, ~512 px/m background)
- [ ] Glass has reflections and refraction; metal has believable highlights
- [ ] Scale feels right when the camera is at eye height

---

## 5. Scenes and props (set dressing list)

Build every item below. The more lived-in, the better. Mark hero props (camera gets close) with ★.

### Scene A: Corridor (opener)

- Long dim corridor: cracked plaster walls, chair-rail moulding, worn terrazzo or wood floor, a flickering ceiling bulb in a wire cage, a radiator, peeling notice board
- ★ **Office door**: wood frame, **frosted glass** with gold-leaf lettering `AYAAN BAGAWAN` / `ENGINEERING & INVESTIGATIONS` (reverse-painted, slightly worn), brass knob, a light strip under the door from the office
- Rain audible, muffled. Footstep sounds as you scroll (subtle)

### Scene B: The Office (hero, vertical slice)

- **Room shell:** 5 × 4 m, 3.2 m ceiling, wainscoting, aged plaster, crown moulding, hardwood floor with a worn rug
- ★ **Window** with ★ **venetian blinds** (half-open, one slat bent), rain glass shader, and Bengaluru night outside: blurred building lights, a ★ **Kannada neon sign** across the street reading `ಕಾಫಿ` with `FILTER COFFEE` underneath, buzzing and flickering (one letter stutters)
- ★ **Desk** (heavy wood, lacquered, scratches) with:
  - ★ **Case folder** (manila, tab, typed label, red `CLASSIFIED` stamp, paperclip, coffee ring) with ★ polaroid peeking out
  - ★ **Typewriter**: types the headline onto paper during the intro
  - ★ **Rotary telephone** (Bakelite): rings at the contact scene
  - ★ **Green banker's lamp** (off by default; easter egg turns it on)
  - ★ **Steel filter-coffee davara-tumbler** with steam
  - Magnifying glass, fountain pen, ink blotter, stacked case files, rubber stamp + ink pad, desk calendar showing **today's date**, a loose ESP32 dev board and a soldering iron in its stand (the suspect's habits)
- ★ **Vintage valve radio** on a side table: **this is the sound toggle**. Click to turn it on: the dial glows, the needle sweeps, static then music
- ★ **Wall clock** showing **real IST time**, ticking
- **Ceiling fan** turning slowly (Bengaluru), casting moving shadows from the street light
- **Filing cabinet** (brushed steel, labelled drawers `A–G`, `CLOSED CASES`, `RÉSUMÉ`). The `RÉSUMÉ` drawer opens and downloads `/resume.pdf`
- **Coat rack** with trench coat and fedora (easter egg: click the fedora → the camera "puts it on", brim vignette for 5 s)
- Bookshelf with real-looking spines (generic titles only: _Signals & Systems_, _Digital Logic_, _Control Theory_, _Field Notes_), a framed certificate (`[TODO: real certificate text]`), a dead plant
- A **drone in a clear evidence bag** on top of the filing cabinet

### Scene C: The Dossier (inside the folder)

- Camera dives down to the desk and the folder opens, with paper curl/bend on the pages
- Page 1, **SUBJECT PROFILE**: paper-clipped polaroid (`/public/photos/ayaan.jpg`, `[TODO]`), typed fields (name, trade, institution, location, status), "Known associates" and "Prior record" from `content/case.ts`
- Page 2, **MODUS OPERANDI**: how he works ("Things that look good on the outside and go deep underneath"), handwritten margin notes
- Pages flip on scroll with a rustle sound

### Scene D: The Evidence Board

- ★ **Cork board** (real cork PBR, frame, lit by a clip lamp from above), a **map of Bengaluru** (stylised, original, no Google/OSM tiles unless licence-compliant), newspaper clippings (fictional paper _THE CITY DAILY_), index cards, sticky notes in handwriting (Caveat font)
- ★ **Polaroids**, one per exhibit (A–G from `content/case.ts`), pinned with red map pins
- ★ **Red yarn strings** between connected exhibits: real yarn (thin tube with twisted fibre normal map), catenary sag, gentle sway (verlet), small paper tags at midpoints naming the connection
- Hover: polaroid lifts, strings to its connections brighten, others dim. Click: camera dollies in, the polaroid flips over to show handwritten notes on the back, and the **ExhibitPanel** (DOM, accessible) slides in with the case study
- Cursor becomes a **magnifying glass** here (lens distortion via a render target)
- **SinCityRed** grade fades in: the room goes near-monochrome, the yarn/pins/stamps stay red

### Scene E: Evidence Table ("Tools found at the scene")

- Steel table under a hard overhead light. Clear **evidence bags** with paper tags, each holding a skill: Next.js, Three.js, GSAP, ArduPilot/MAVLink, SLAM, TensorRT INT8, LLM inference optimisation, prompt engineering, FPGA prototyping
- Each tag has a hand-written **"confidence"** note. Be honest: Ayaan says he is still learning all of these. Use labels like "handled often", "getting good", "recently acquired". No fake percentage bars

### Scene F: Interrogation Room

- Concrete walls with peeling paint, metal table, two chairs, ★ **swinging hanging lamp** (live light, volumetric cone), a ★ **one-way mirror** (reflective; subtly shows the camera's silhouette: "you're being watched too"), a corner CCTV camera with a blinking red LED
- ★ **Reel-to-reel tape recorder**: reels spin while the **transcript** types line by line (Q in grey, A in black) on paper on the table, synced to scroll

### Scene G: Verdict

- Camera tilts down to the case file. A ★ **rubber stamp** slams `GUILTY` in red with camera shake, a thud and ink texture spread
- Text: _"of building too many things at once."_ → **SENTENCE: Hire him.** (Or at least put him on your hackathon team.)

### Scene H: Contact (back in the office)

- Camera returns to the desk. The ★ **phone rings** (bell sound, handset rattles)
- "Pick up the phone" → handset lifts, and a **notepad** (DOM overlay styled as a paper pad, fully accessible) opens with the **Tip form**: name, email, message, Turnstile
- Also on the notepad: GitHub, LinkedIn, email, and "Get the résumé" (opens the filing cabinet drawer)
- The scroll ends at the filing cabinet: the camera leaves the ringing phone and the `RÉSUMÉ` drawer slides out, with links to the PDF and `/resume` and the phone still a click away
- Footer: `Case closed? Not yet. Status: open to internships.` · credits · _Powered by Poly Haven_

---

## 6. Scroll choreography

- One tall scroll container (~1300vh). Lenis smooth scroll with ScrollTrigger driving a single master timeline (`lib/scroll.ts`)
- Progress 0→1 maps to camera keyframes in `lib/cameraPath.ts`: `{ t, position, target, fov, focusDistance, shake, grade }`. Interpolate positions/targets with Catmull-Rom splines; ease FOV and focus
- Dev-only Leva panel: scrub the timeline, nudge the current keyframe, and a **"Copy keyframe JSON"** button so Ayaan can tune shots himself
- Scenes lazy-mount as the camera approaches (preload the next scene's GLB at 60% of the current section)

| Progress  | Scene          | Camera / events                                                                                                   | DOM caption (also sr-only text)                                                                                                                                    |
| --------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.00      | Loader         | Darkroom: a photo of the office **develops in a red-lit tray** as assets load (progress = real loading %)         | "Developing evidence… 64%"                                                                                                                                         |
| 0.00–0.08 | Corridor       | Slow dolly toward the door, bulb flicker, the door lettering comes into focus                                     | "Case No. 2316"                                                                                                                                                    |
| 0.08–0.14 | Door           | Door creaks open, light spills, camera passes through                                                             | —                                                                                                                                                                  |
| 0.14–0.26 | Office hero    | Wide establishing shot, rain, neon, flashlight enabled; the typewriter types the headline                         | **Who is Ayaan Bagawan?** + "Someone in Bengaluru has been building drones, desk robots and route-finding AI. Seven exhibits. One verdict. You are the detective." |
| 0.26–0.36 | Dossier        | Dive to the desk, folder opens, pages 1–2 flip                                                                    | profile copy                                                                                                                                                       |
| 0.36–0.58 | Evidence board | Pan to the wall, SinCityRed fades in; scroll steps through exhibits A→G (camera nudges to each); click for detail | exhibit captions                                                                                                                                                   |
| 0.58–0.66 | Evidence table | Overhead slide along the bags                                                                                     | "Tools found at the scene"                                                                                                                                         |
| 0.66–0.80 | Interrogation  | Cut-style transition (light flicker to black), lamp swing, transcript types                                       | transcript                                                                                                                                                         |
| 0.80–0.88 | Verdict        | Stamp slam at 0.85                                                                                                | "GUILTY"                                                                                                                                                           |
| 0.88–1.00 | Contact        | Back to the desk, phone rings until clicked; the camera turns to the filing cabinet and the `RÉSUMÉ` drawer slides out (the end) | "Pick up the phone"                                                                                                                                                |

Screenshot positions for Playwright: `0.04, 0.12, 0.20, 0.30, 0.45, 0.62, 0.72, 0.85, 0.95`.

---

## 7. Interactions and systems

### 7.1 Flashlight (Office, Corridor)

- Raycast the cursor into the scene; the SpotLight target lerps toward the hit point (`maath/easing.damp3`, ~0.12 s). Light sits slightly below and behind the camera
- Use a cookie `map` texture (concentric lens rings + a dark spot) and add a faint volumetric cone
- On touch devices it auto-sweeps slowly; tapping aims it
- Hidden while the visitor reads the DOM panels

### 7.2 Red strings

- Each string is a verlet rope (12–16 points) between two pin positions, rendered as a `TubeGeometry` updated per frame (or instanced segments). Add gravity sag, damping and a small wind impulse when hovered
- Connection highlight: emissive boost plus opacity change on the others; tags fade accordingly

### 7.3 Typewriter

- Text from `content.hero.headline`. Each character depresses the matching key (approximate key mapping is fine), advances the carriage, and plays a clack; ding at line end
- The paper texture is a `CanvasTexture` updated as characters type (typewriter font, slight ink jitter)

### 7.4 SinCityRed effect (custom `postprocessing` Effect)

- Convert to HSV. If hue is within the red band (≈ 340°–15°) and saturation > 0.35, keep the colour (boost slightly). Otherwise desaturate toward luminance with contrast.
- Uniform `intensity` 0→1 driven by the scroll timeline

### 7.5 Audio (`lib/audio.ts`)

- **Off until the visitor clicks the radio** (or the SoundToggle). Remember the choice in `localStorage` (wrapped in try/catch)
- Layers: rain bed (low-pass filtered inside, brighter near the window), room tone, clock tick (positional), radio music, thunder, bus pass-by, door creak, typewriter, paper rustle, stamp thud, phone ring, tape hiss in interrogation
- Sources: CC0 only (Freesound CC0 filter, Pixabay licence-checked, Sonniss GDC bundles). Ayaan downloads these himself. Create `public/audio/README.md` listing each needed file, its exact filename, duration and suggested search terms. Ship silent placeholders until the real files arrive

### 7.6 Easter eggs

- Konami code → the banker's lamp turns on (warm practical light, bloom)
- Click the fedora → "put on the hat" brim vignette
- Clicking the ESP32 board on the desk → its LED blinks Morse for "HIRE ME"
- When the tab is hidden, set `document.title` to "Come back, detective…"
- DevTools console: ASCII magnifying glass + "You inspected the source. Good instinct. ayaan.i.bagawan@gmail.com"
- Print stylesheet: Ctrl+P prints a clean "case report" résumé

### 7.7 Recruiter mode

- A persistent top-right **"Skip to résumé"** button → `/resume`: plain semantic HTML from the same `content/case.ts`, loads in < 1 s, Lighthouse ≥ 95 on all four scores, with a PDF download

---

## 8. Asset pipeline

### 8.1 Sources (priority order)

1. **Poly Haven** (CC0): photoscanned models, PBR textures, HDRIs. Use the public API at `https://api.polyhaven.com` from `scripts/fetch-assets.mjs`. **Send a unique User-Agent** (`ayaan-case-file-portfolio/1.0 (ayaan.i.bagawan@gmail.com)`) and add a visible "Powered by Poly Haven" credit in the footer and `CREDITS.md`. This is a personal, non-commercial portfolio
2. **ambientCG** (CC0): extra materials (cork, concrete, plaster, paper, rust, felt)
3. **Sketchfab**: **only** CC0 or CC-BY models, credited. Downloads need Ayaan's API token in `.env.local` (`SKETCHFAB_API_TOKEN`); ask him for it if needed
4. **Procedural in Blender** (`blender/procedural/*.py`) for everything custom: room shell, blinds, door with lettering, folder, papers, polaroids, cork board, evidence bags, neon sign, stamp, notepad, tags

### 8.2 Shopping list (search the API by these keywords; pick the most realistic match; record choices in `assets/manifest.json`)

- **Models:** wooden desk, office chair (wood/leather), rotary/vintage telephone, typewriter, desk lamp, radio, wall clock, filing cabinet, coat rack, hat, bookshelf, books, mug/cup, magnifying glass, pen, ceiling fan, radiator, potted plant, metal table, metal chair, tape recorder, hanging lamp, CCTV camera, drone (fallback: procedural)
- **Textures:** dark hardwood floor, wood planks (desk), aged plaster, painted wall with wear, concrete (interrogation), cork, cardboard/manila paper, old paper, brushed steel, brass, leather, felt, fabric (rug), terrazzo
- **HDRIs:** night city / overcast night (reflections only), 1K–2K
- **Fonts (self-host via `next/font`):** Special Elite (typewriter), Playfair Display (headlines), Caveat (handwriting), Noto Sans Kannada (neon sign), IBM Plex Mono (UI details)

If an item isn't available from 1–3, build it procedurally and tell Ayaan which ones you made.

### 8.3 Blender build → bake → export

1. `build_scene.py <scene>` imports assets, builds procedural geometry, applies `materials.py`, places everything to the layout in §5, and sets up `lighting.py`. Real units, applied transforms, clean names (`static_*`, `dyn_*`, `fx_*`)
2. `render_stills.py <scene>` renders Cycles stills (1920×1080, OptiX, denoise) from 3 camera angles → `/screenshots/blender/`. **★ CHECKPOINT 2 uses these**
3. `bake.py <scene>`
   - Join static meshes into 2–4 atlases per scene by material/zone
   - Generate the 2nd UV channel (`Lightmap` via Lightmap Pack or Smart UV, margin ≥ 4 px at bake res)
   - Bake Diffuse (Direct+Indirect, no Color) → lightmap and AO → aoMap at 2K (hero) / 1K (background); denoise with OIDN; save 16-bit/EXR
4. `export.py <scene>`: glTF binary per scene: `office_static.glb`, `office_dynamic.glb`, etc. Y-up, +Y up, apply modifiers, export both UV sets, no lights in the file (lights are set up in code)
5. `scripts/optimize.mjs`: `gltf-transform` → dedup, weld, simplify (background only), **meshopt** compression, textures to **KTX2** (UASTC for normal/ORM, ETC1S for albedo), resize to budget. Load in R3F with `useGLTF` + `KTX2Loader` + `MeshoptDecoder` (drei helpers)

---

## 9. Content model: `content/case.ts`

The canonical file is `content/case.ts` in the repo. Ayaan will replace the samples with his final projects later, so **every component must read from there**.

The board layout must handle **any number of exhibits (4–12)** automatically (grid with organic jitter and rotation), because Ayaan will add or remove projects.

---

## 10. Design system (DOM overlay)

- **Colours:** night `#0D0C0A`, wall `#1D1915`, paper `#EDE4D0`, manila `#C9A66B`, ink `#2A221B`, evidence red `#C1272D`, moonlight `#A5BCDE`, lamp amber `#FFD696`
- **Type:** Playfair Display 900 (headlines), Special Elite (body/UI), Caveat (handwritten notes), IBM Plex Mono (small technical labels)
- **UI components:** paper cards with subtle grain, typewriter labels, stamped buttons (press-down animation), focus rings in evidence red, 44 px minimum touch targets
- **Text contrast** ≥ 4.5:1 on every overlay
- All real content exists in the DOM (sr-only where the 3D shows it visually) so screen readers and search engines get it

---

## 11. Performance and quality tiers (hard budgets)

| Budget                                 | Target                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| First paint of loader                  | < 1.2 s on 4G                                                                                           |
| Initial JS (gz, excluding three)       | < 250 KB                                                                                                |
| Scene A+B download (GLB + KTX2 + HDRI) | < 18 MB                                                                                                 |
| Total of all scenes                    | < 45 MB, lazy-loaded                                                                                    |
| Draw calls per frame                   | < 150 (merge statics in Blender)                                                                        |
| FPS                                    | 60 on Ayaan's RTX laptop (ultra), ≥ 45 on a mid laptop iGPU (medium), ≥ 30 on a mid Android phone (low) |

**Tiers** (`lib/quality.ts`, auto-picked via drei `PerformanceMonitor` + GPU detection, with a manual override in a small settings menu):

- **Ultra:** 2K lightmaps, DOF, light shafts + dust, rain refraction at full res, bloom, SinCityRed, DPR up to 2
- **Medium:** 1K lightmaps, no DOF, half-res rain, fewer dust particles, DPR 1.5
- **Low / mobile:** 1K, no shafts, simplified rain (no refraction), no CA/grain, DPR 1, shorter scroll timeline
- `prefers-reduced-motion`: no shake, no auto camera moves (scroll-step snaps instead), no lightning flashes
- **No WebGL:** show the lite file (`components/lite`, see docs/DEVELOPMENT.md: it replaced `NoWebGLFallback`, Blender-rendered stills of each scene with a link to `/resume`)

---

## 12. Contact backend (Cloudflare)

- `functions/api/tip.ts` (Pages Function): validate input (zod), verify the **Turnstile** token, insert into a **D1** table `tips(id, name, email, message, created_at, ip_hash)`, then notify Ayaan by email via Cloudflare Email Routing's `send_email` binding to his verified address. Rate-limit by IP hash
- `wrangler.toml` with D1 + email bindings; `.dev.vars.example` for secrets
- The form shows a typed "TIP FILED" confirmation stamp on success and an honest error on failure

---

## 13. SEO and sharing

- Metadata: title `Ayaan Bagawan — The Case File`, description from the hero lede
- **OG image** (1200×630) rendered in Blender from the office (folder + flashlight beam + title)
- `sitemap.xml`, `robots.txt`, JSON-LD `Person` schema from `content/case.ts`
- Favicon: a tiny red wax-seal "AB"

---

## 14. Build phases (stop at every ★)

**Phase 0: Setup**

- Check tools: `node -v` (≥ 20), `pnpm -v`, `git --version`, `git lfs version`, `blender --version`, `nvidia-smi`. Report anything missing and ask before installing
- Scaffold Next.js + TS + ESLint + Prettier; add deps from §2; write `docs/DEVELOPMENT.md` (§0), `.gitignore`, LFS rules, `CREDITS.md`
- Create `content/case.ts` exactly as §9

**Phase 1: Recruiter mode first**

- Build `/resume` from `content/case.ts` (works without WebGL). Lighthouse ≥ 95
- ★ **CHECKPOINT 1:** show `/resume` screenshots plus the list of `[TODO]`s

**Phase 2: Assets + Blender office (look development)**

- `fetch-assets.mjs` → download the shopping list; write `assets/manifest.json`
- `blender/` scripts: room shell, procedural props, materials, lighting for **Corridor + Office**
- Render Cycles stills (3 angles each)
- ★ **CHECKPOINT 2:** show the stills against the realism test in §4.6. Iterate until Ayaan says it looks real

**Phase 3: Office vertical slice in the browser**

- Bake + export + optimise the Office. R3F Experience, renderer config (AgX/ACES, sRGB, shadows only where needed), lightmap assignment, HDRI reflections
- Loader (darkroom photo), Lenis + ScrollTrigger + CameraRig with the Corridor → Door → Office keyframes
- Flashlight, rain glass, blinds shafts + dust, neon sign, lightning, bus headlights, wall clock (IST), ceiling fan, typewriter headline, radio sound toggle, PostFX stack, quality tiers
- ★ **CHECKPOINT 3:** the hero must look finished. Screenshots at 0.04/0.12/0.20, an FPS report per tier, and bundle/asset sizes vs §11

**Phase 4: Dossier** (folder opening, page curl, profile pages)

**Phase 5: Evidence board** (cork, polaroids from content, verlet strings, hover/click, ExhibitPanel, magnifier cursor, SinCityRed)

- ★ **CHECKPOINT 4**

**Phase 6: Evidence table** (bags + tags from `tools`)

**Phase 7: Interrogation + Verdict** (room, swinging lamp, one-way mirror, tape recorder + transcript, stamp slam)

- ★ **CHECKPOINT 5**

**Phase 8: Contact** (phone ring, notepad TipForm, Cloudflare function + D1 + Turnstile, filing-cabinet résumé)

**Phase 9: Polish**

- Full audio pass, easter eggs, 404, print stylesheet, accessibility (keyboard path through every interaction, focus management, sr-only content), reduced motion, mobile tier, OG image, SEO, Playwright screenshot suite, budget check
- ★ **CHECKPOINT 6**, then deploy to Cloudflare Pages (preview first, production only after Ayaan approves)

---

## 15. Checkpoint report format

At every ★, reply with:

1. What was built (bullets)
2. Screenshots / renders (paths)
3. Budget table (sizes, FPS per tier, draw calls)
4. Realism self-critique: the 3 weakest-looking things and how you'd fix them
5. `[TODO]`s and anything you need from Ayaan (photos, audio files, API tokens, reference images)
6. Proposed next step. Then **wait**.
