# Image → Particle Point Cloud

[中文](README.md) | **English**

Turn any image into an **interactive 3D particle point cloud**. Pure front-end, single file,
no upload — your image is processed entirely in your own browser and never sent anywhere.

**Live demo**: <https://afeiisfine.mindpion.workers.dev/>

![Demo: colourful abstraction → particles assembling into a tree](screenshots/demo.gif)

> **A note from the author**: I don't know how to program. Every line of code, every feature —
> and this document — was written by AI. Please forgive any amateurish mistakes, and feel free
> to open an Issue if you spot one.
>
> **Note for English readers**: the source code is commented in Chinese. The UI has a built-in
> Chinese/English switch, but code comments were not translated.

---

## What it is

A web tool built with three.js. Drop in an image and it samples the picture into tens of
thousands of 3D particles based on pixel brightness. It then reads the **largest-area colour**
in the image to decide whether the background is dark or light, and configures a whole set of
parameters for you — so you see a finished result on open, instead of staring at an empty scene
tweaking sliders.

Two particle forms, each solving a specific problem:

| Form | What it is | Good for |
|---|---|---|
| **Soft glow dots** (default) | Round dots with soft edges, using a *depth prepass* for occlusion: the opaque core of a near particle hides the ones behind it, while the edges stay soft | Atmosphere, abstract, glow |
| **Solid spheres** | Each particle is shaded as a lit solid sphere — per-pixel spherical depth, baked contact shadows, ACES filmic tone mapping | Objects, sculpture, a sense of volume |

Both images below were rendered from the repo's default sample `testpic/black_4.jpg` with the
same particle count (50,000) and the same camera — only the form and size differ
(glow dots 0.5 / solid spheres 1.0). The two forms genuinely have different optimal sizes:
solid spheres are lit solids, whereas glow dots additively brighten and would smear into a blob
at the same size:

| Soft glow dots | Solid spheres |
|---|---|
| ![Soft glow dots](screenshots/form-soft-dots.png) | ![Solid spheres](screenshots/form-solid-spheres.png) |

---

## Getting started

### Option 1: Just use it (nothing to install)

Download `index.html` and open it in your browser (latest Chrome / Edge / Safari recommended).
It loads a sample image automatically, so you can start playing immediately.

### Option 2: Serve locally (for development)

```bash
python3 -m http.server 8123
# then open http://127.0.0.1:8123/index.html
```

> Opened directly as a `file://` URL, the page cannot read `testpic/black_4.jpg` from the same
> folder and will appear empty. That's the browser's same-origin policy, not a bug. Use Option 2
> for local development, or append `?test` to the URL to load the built-in sample image.

### Controls

- **Left-drag** = orbit · **scroll wheel** = zoom · **middle/right-drag** = pan
- The small `↺` left of each slider resets that parameter to its default
- The panel has two columns and 7 groups; click a group title to collapse it, or the `—` at the
  top-right to hide the whole panel (handy for screen recording)

### URL parameters (for debugging / pinning state)

| Parameter | Effect |
|---|---|
| `?test` | Load the built-in test image, skipping the default sample |
| `?blank` | Start with an empty scene (no sample loaded) |
| `?stats=1` | Print sampling statistics to the console |
| `?dist=` / `?lumMin=` / `?lumMax=` / `?solid=` | Pin the corresponding parameter, disabling the auto-detection on image change |
| `?bgauto=0` | Disable the entire auto colour/parameter logic at once |

---

## Features

- **Source**: drag in an image / video / GIF / whole folder; GIFs and videos drive particle
  colour and depth in real time
- **Auto-config on image change**: background colour is taken from the largest-area colour;
  dark background → luminance range 30–255 and soft glow dots; light background → range 0–240
  and solid spheres
- **Particle distribution**: count (up to 300,000), luminance min/max, distribution bias,
  depth strength, noise jitter
- **Particle appearance**: size, opacity, lightness, saturation, form, sphere gloss, bloom,
  background colour (supports gradients)
- **Particle motion**: particles flow back and forth along luminance bands, with configurable
  start / end / speed / phase spread
- **Camera**: auto-rotate, recentre view
- **Render & export**: single frame as PNG, or a frame sequence (rendered offline without
  stuttering; import the sequence into your editor to make a video)
- **Bilingual UI** with a Chinese/English switch

---

## Measured performance

Source: headless Chrome + system Chrome (real GPU, ANGLE Metal / Apple M1 Max),
1440×900 canvas, 20,000 particles.

| Scenario | Frame rate | p95 frame time | JS heap |
|---|---|---|---|
| Default 20k · glow dots · no bloom | 60.0 fps | 18.0 ms | 8.1 MB |
| 100k | 60.0 fps | 18.2 ms | 12.0 MB |
| 300k (slider maximum) | 60.0 fps | 18.3 ms | 21.1 MB |
| Solid spheres 20k | 60.0 fps | 17.3 ms | 8.1 MB |
| Bloom 1.0 + 100k | 60.0 fps | 18.2 ms | 12.1 MB |

Flow animation (20k particles × 12 keyframe tracks, Catmull-Rom interpolated on the CPU each
frame): **0.6 – 2.8 ms/frame**.

---

## Some interesting implementation details

The pitfalls hit while building this are more interesting than the features themselves.
Each one is explained in a code comment that answers *why*, not *what*:

**Why solid spheres must be opaque.** A semi-transparent pixel written into the depth buffer
culls the particles behind it, leaving only itself blended at very low alpha against a black
background → every particle gets a dark halo. Measured count of "isolated black dots surrounded
by particles": soft glow dots **0**, the older hard-edge occlusion approach **559**. So in solid
mode the silhouette is hard-cut (`rho2 > 1` → `discard`), and any pixel taking part in depth
writing has alpha exactly 1 — the halo is structurally impossible. The "opacity" slider instead
darkens RGB rather than lowering alpha.

**Particle size cannot be a constant.** The original
`gl_PointSize = uSize * rand * (160.0 / -mv.z)` had a hard-coded 160.0 that ignored viewport
height, so the higher the resolution, the *smaller* the particles appeared
(900×600 → 1800×1200 gave a coverage ratio of 0.68). It now multiplies by
`uResScale = drawing buffer height / 1800`, keeping the particle's world size constant —
what you preview is what you export, and Retina and non-Retina look the same.

**Export must match the preview exactly.** `EffectComposer` locks its pixel ratio at
construction time. Changing only the renderer on export left the composer rendering at 2×,
so particles were drawn onto a 2× buffer and then downsampled → smaller and greyer
(measured coverage ratio 0.492, mean luminance 133.9 → 107.5). The fix changes both together and
restores both afterwards; re-measured coverage ratio **0.999**.

**The colour pipeline must not encode twice.** A minimal reproduction page proved that
`OutputPass` re-encodes the shader output to sRGB once more: reading the canvas directly gives
128, going through the composer gives 188. So image pixels must be decoded with
`srgbToLinear()` before entering the shader — otherwise double gamma makes the whole image look
washed out and grey.

**The flow animation must not start from an endpoint.** The default dynamic range is −0.9 to
+0.9 while the user sits at +0.7; pressing "start flow" jumped straight to the dark end, reading
as "it goes dark the moment you press it". The fix records the level closest to the current
distribution and uses it as the starting phase.

---

## Project structure

```
index.html          Everything: HTML / CSS / shaders / application logic (single file, ~3200 lines)
libs/               three.js r160 + OrbitControls + post-processing chain (MIT, see headers)
testpic/            9 sample images (see below)
screenshots/        Demo and comparison images used by the README
favicon.ico
build_share.py      Optional: bundle into a single-file HTML (local share / web deploy)
```

### Sample images

All 9 images in `testpic/` can be dragged straight in. They come in two groups by background
brightness, and the auto-detection therefore picks different defaults for each:

| Files | Background | Auto-detected defaults |
|---|---|---|
| `black_0.jpg` … `black_5.jpg` | Dark | Luminance 30 / 255, distribution bias +0.7, **soft glow dots** |
| `white_0.jpg` … `white_2.jpg` | Light | Luminance 0 / 240, distribution bias 0, **solid spheres** |

**`black_4.jpg` is the default sample loaded on page open** (its filename is hard-coded); the
other 8 are for testing replacements.

---

## Development and testing

`.test/` keeps the regression scripts and notes from development (`node_modules/` and debug
screenshots are not tracked):

```bash
node .test/test_sampling.mjs        # Algorithm level: sampling distribution / luminance filter / pairing quality / waveform
cd .test/pup && npm i               # Browser-level tests need dependencies on first run
node .test/pup/review_checks.js     # Regression guard (~28 s, 5 assertions)
```

The guard's workflow is "find a bug → add an assertion first → then fix the code", so the same
pit is never hit twice. `.test/README.md` records what each script checks, plus measured data
behind several design constraints (for example the comparison experiment behind "why solid
spheres must be opaque").

Three tools written while producing the demo assets above are kept here for reuse:

- `.test/pup/form_shots.js` — renders the two-form comparison images from the default sample
- `.test/pup/video_probe.swift` — frame extraction and metadata via pure AVFoundation,
  **no ffmpeg required** (`swift video_probe.swift <video> <outdir> sample` grabs 12 evenly
  spaced frames to inspect content; add `frames <start> <end> <fps> <width>` to extract a
  continuous sequence for a GIF)
- `.test/pup/video_encode.swift` — trimming and transcoding via pure AVFoundation,
  **no ffmpeg required** (concatenates several second-based clips into one highlight reel and
  exports 720p H.264; the demo GIF and video in this README were produced with it)

### Bundling into a single file

`index.html` depends on `libs/` in the same folder, so double-clicking it fails on the
same-origin policy. To produce a **double-clickable** single-file build:

```bash
python3 build_share.py            # → dist/index.html     three.js and sample image inlined
python3 build_share.py --web      # → dist-web/index.html no inlined image, smaller (for web deploy)
```

This needs `npx` (i.e. Node.js installed) because the script invokes esbuild to bundle an IIFE.
The web build transfers about 156 KB on first open (after Brotli) — considerably faster than the
unbundled version.

---

## Browser requirements

Requires **WebGL2** (supported by the latest Chrome / Edge / Safari). Exporting a frame sequence
uses `showDirectoryPicker`, which requires **HTTPS or localhost** — satisfied by static hosting
by default. When opened locally via `file://` that one feature is unavailable (everything else
works).

---

## License

[MIT](LICENSE) — free to use, modify and use commercially, as long as the copyright notice is
kept.

three.js (r160) and its addons under `libs/` are copyright Three.js Authors and are likewise
MIT licensed; their copyright headers are preserved in each file. This project's MIT license
does not alter the terms those files were already under.
