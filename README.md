# PSL Signing Avatar

A modern, web-based, open-source **Pakistan Sign Language (PSL) signing avatar** renderer.
Phase 1 of a text-to-PSL platform: a rigged 3D character in the browser (Three.js) that will
perform sign sequences, designed from the start to support non-manual (facial) grammar —
the main gap in prior PSL systems (PakParse, Sign4PSL, PSL SignBank), which all rely on the
dated HamNoSys → SiGML → JASigning pipeline.

## Stack

- **Vite + TypeScript + Three.js**
- **VRM avatars** via [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm) — VRM is a
  standardized humanoid format with a fixed bone spec (including all finger bones) and
  **native facial expressions/blendshapes**, which is exactly the hook the non-manual-features
  phase needs. Free avatars: [VRoid Studio](https://vroid.com/en/studio) / VRoid Hub.
- Milestone 4 (authoring) will use **MediaPipe + [Kalidokit](https://github.com/yeemachine/kalidokit)**,
  a face/pose/hand solver built specifically for driving VRM rigs from webcam landmarks.

> **Why not Ready Player Me?** RPM was acquired by Netflix (Dec 2025) and its avatar
> creator and developer services shut down on 2026-01-31. The project originally targeted
> RPM GLBs; it now targets VRM, which is an open spec with a healthier ecosystem and a
> cleaner retarget story (three-vrm's *normalized* humanoid).

## Status

- ✅ **Milestone 1** — Scene + avatar: studio-lit Three.js scene, orbit/zoom camera clamped
  above the floor, camera reset, swappable VRM avatar with automatic placeholder fallback.
- ✅ **Milestone 2** — Sign library + `SignPlayer`: manifest + JSON clip format, cross-faded
  playback with fingerspelling fallback and per-type rhythm, rest as a real clip, speed /
  pause / resume / replay, expression (non-manual) channel plumbed end to end.
- ✅ **Milestone 3** — Minimal UI: gloss-sequence input (Enter or Play to run), Pause/Resume,
  Replay, speed slider (0.25–2×), available-gloss chip panel (click to append), active-gloss
  indicator synced to playback, camera reset.
- ✅ **Milestone 4** — Sign authoring tool (`/author.html`): webcam → MediaPipe tasks-vision
  (pose + hands + face) → Kalidokit → live-drive the avatar, record, preview, export clip
  JSON + manifest entry. Includes a no-camera synthetic test mode.
  *Verified in-session: model loading, record → export → play-in-library round trip.
  Live webcam capture still needs a session with a physical camera (and the Mirror /
  Space-flip defaults confirmed on real footage).*

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # static production build in dist/
```

## Deployment

`npm run build` emits a fully static site (`dist/`) — two pages (`index.html` player,
`author.html` authoring tool) — deployable to any static host (GitHub Pages, Netlify,
Cloudflare Pages). Notes:

- Sample VRMs (`npm run fetch:samples`) are git-ignored dev fixtures — don't ship them.
- The authoring page fetches MediaPipe models (~17 MB) from Google's CDN at runtime;
  self-host under `public/models/` + update `MODEL_URLS` for offline/air-gapped use.
- Camera capture requires a secure context (HTTPS or localhost).

## Urdu fingerspelling

Fingerspelling splits unknown glosses into **grapheme clusters** (`Intl.Segmenter`), so an
Urdu letter plus its combining marks (e.g. `اَ`) stays one unit. Adding Urdu support is
purely a data task: record letter clips and add manifest entries whose `gloss` is the Urdu
character (multi-codepoint glosses work). Gloss inputs are `dir="auto"` for RTL. Open
decision: whether marked letters get dedicated signs or fall back to their base letter.

## Swapping the avatar

Drop a VRM at `public/avatar/avatar.vrm` (VRoid Studio export recommended). The URL is a
single constant: `AVATAR_URL` in [src/config.ts](src/config.ts). Loading order:

1. **VRM** — loaded with three-vrm; animation targets are the *normalized* humanoid bones.
2. **Plain glTF/GLB** — still renders (with a warning); raw bone names, clips may not retarget.
3. **Placeholder** — procedurally rigged mannequin ([src/avatar/placeholder.ts](src/avatar/placeholder.ts)).

## Bone/retargeting convention (important for clip authoring)

All animation targets use **VRM humanoid bone names** (`hips`, `spine`, `chest`, `upperChest`,
`neck`, `head`, `leftShoulder`, `leftUpperArm`, `leftLowerArm`, `leftHand`,
`leftThumbMetacarpal/Proximal/Distal`, `leftIndex|Middle|Ring|LittleProximal/Intermediate/Distal`,
legs, etc.). Rest pose is **T-pose with identity rotations** — the same convention as
three-vrm's normalized humanoid — so a clip authored on the placeholder plays identically on
any VRM. The relaxed arms-down idle you see on screen is just an initial pose
(`applyRelaxedPose`), overridden by any clip.

**VRM0 clip-space mirror (verified against real models):** three-vrm's normalized humanoid
keeps the source model's facing, so a VRM 0.x rig lives in −Z-facing model space and every
lateral rotation sign flips relative to our +Z-facing clip space. The loader detects this
from the rig's rest-pose arm direction (`LoadedAvatar.mirrorClipSpace` — never trusted from
metadata) and conjugates all clip rotations by 180° about Y (quaternion `(x,y,z,w) →
(−x,y,−z,w)`, positions `(x,y,z) → (−x,y,−z)`). Verified on AliciaSolid (VRM0) and the
three-vrm VRM1 sample: same clips, correct right-hand signing on both.

For testing, `?avatar=<url>` overrides the avatar per session. Run `npm run fetch:samples` to
download two dev fixtures (not committed — they are third-party models under their own
licenses) covering both spec versions:

```
npm run fetch:samples
# then: /?avatar=/avatar/samples/vrm0_alicia.vrm   (VRM 0.51, vrm-c/UniVRM)
#       /?avatar=/avatar/samples/vrm1_twist.vrm    (VRM 1.0, pixiv/three-vrm)
```

## Architecture contract (future translation engine)

The future engine (text → PSL) will output **only** a gloss sequence: `string[]` of uppercase
sign labels, e.g. `["HELLO", "MY", "NAME", "A", "L", "I"]`. The renderer's sole public entry
point is `SignPlayer.play(glossSequence): Promise<void>` (resolves when the avatar is back at
rest). Unknown glosses are fingerspelled; unknown letters warn and are skipped. Nothing else
couples the renderer to the engine.

## Sign library

`public/signs/manifest.json`:

```jsonc
{
  "defaults": {              // playback rhythm (ms); all optional
    "wordHoldMs": 120,       // hold after a word clip ends
    "wordFadeMs": 250,       // word-to-word cross-fade
    "letterHoldMs": 300,     // fingerspelling needs a readable hold…
    "letterFadeMs": 120,     // …and a crisper inter-letter transition
    "restFadeMs": 450        // ease back to neutral
  },
  "signs": [
    { "gloss": "REST",  "clip": "rest.json",  "type": "rest" },   // required
    { "gloss": "HELLO", "clip": "hello.json", "type": "word",
      "nmf": { "happy": 0.4 } },                                  // VRM expression -> weight
    { "gloss": "A", "clip": "letter_a.json", "type": "letter" }
    // per-entry "holdMs"/"fadeMs" override the defaults
  ]
}
```

Clip files (same format the Milestone 4 authoring tool will export):

```jsonc
{
  "name": "hello",
  "fps": 30,
  "tracks": [
    { "bone": "rightUpperArm",          // VRM humanoid bone name
      "type": "quaternion",             // or "position"
      "keys": [[0, x,y,z,w], [0.4, x,y,z,w]] }  // [timeSec, ...values]
  ]
}
```

Durations are always derived from the keyframes, never declared. The loader resolves bone
names against the avatar and binds tracks by node uuid, so the same clip drives the
placeholder and a real VRM identically.

**Adding a sign today:** author a pose/motion in `scripts/generate-clips.mjs` and run
`npm run gen:clips`, or hand-write a clip JSON into `public/signs/` and add a manifest entry.
(The shipped clips are procedural placeholders, **not** verified PSL handshapes — they prove
the pipeline until clips are recorded with a PSL signer.)

## Player internals (why it's built this way)

- **Update order**: each frame runs `player.update(delta)` (skeletal mixer, then expression
  ramping) **before** `avatar.update(delta)` — three-vrm propagates normalized bones and
  expression values to the skinned mesh inside `vrm.update`. Clips target the *normalized*
  humanoid, so a clip authored on the placeholder lands identically on a VRoid avatar.
- **Rest is a clip**, cross-faded like any other transition — no direct bone writes, one
  uniform blend path, no snap back to neutral.
- **Expressions ride the same timeline**: a sign's `nmf` weights ramp in over its cross-fade,
  hold for its duration, and ramp out — via `vrm.expressionManager.setValue`. Empty on the
  placeholder (warns once); first-class on any VRM.
- **Double letters** (e.g. fingerspelling "ALL") cross-fade a clip into a lazily-created
  clone of itself, since a mixer can't blend an action into the same action.

## Authoring a sign (`/author.html`)

1. **Load models** (~17 MB, fetched from Google's CDN — pin/self-host under `public/models/`
   and change `MODEL_URLS` in [src/author/tracker.ts](src/author/tracker.ts) for offline use).
2. **Start camera**, perform in frame — the avatar mirrors you live ("Live drive").
3. **Record → Stop**, type the gloss label + type (word/letter), **Preview** on the avatar.
4. **Export** downloads `<gloss>.json`; drop it into `public/signs/` and paste the shown
   entry into `manifest.json`. It's then playable like any other sign.

**Test (no camera)** runs a synthetic motion through the exact record → export path, for
verifying the pipeline without a webcam.

### MediaPipe/Kalidokit → VRM bone mapping

| Kalidokit output | VRM bone |
| --- | --- |
| `Hips` / `Spine` / `Chest` | `hips` / `spine` / `chest` |
| `{L,R}UpperArm`, `{L,R}LowerArm` | `leftUpperArm`, `rightLowerArm`, … |
| `{L,R}Wrist` (Hand.solve) | `leftHand` / `rightHand` |
| `{L,R}{Index,Middle,Ring,Little}{Proximal,Intermediate,Distal}` | same names, lowercased side |
| `{L,R}Thumb{Proximal,Intermediate,Distal}` | `…Thumb{Metacarpal,Proximal,Distal}` (shifted!) |
| `Face.solve().head` | `head` |

Legs are deliberately not captured (upper-body signing box). Eye/mouth solver outputs are
the future non-manual capture channel (VRM expressions, not bones).

Two calibration toggles, both defaulting on and **needing confirmation on real footage**:
**Mirror (selfie)** — swaps MediaPipe's image-space hand labels so your right hand drives the
avatar's right hand; **Space flip** — conjugates Kalidokit's (VRM0-convention) rotations into
our +Z clip space, same math as `mirrorClipSpace`.

## Module layout

```
src/
  config.ts             AVATAR_URL (single avatar swap point)
  scene/createScene.ts  renderer, lights, ground, camera + OrbitControls, framing/reset
  avatar/loadAvatar.ts  VRM/glTF loading with placeholder fallback; humanoid bone map
  avatar/placeholder.ts procedural VRM-spec rig (T-pose rest, relaxed initial pose)
  signs/types.ts        manifest + clip JSON formats, rhythm defaults
  signs/clipLoader.ts   clip JSON -> THREE.AnimationClip (bone-name resolution)
  signs/library.ts      manifest/clip fetching -> SignLibrary
  player/SignPlayer.ts  gloss sequence playback: cross-fades, holds, expressions
  ui/hud.ts             top-left overlay: title, avatar status, camera reset
  ui/controls.ts        bottom bar: gloss input, transport, speed, gloss chips
  main.ts               bootstrap + render loop (player.update before avatar.update)
  author/tracker.ts     MediaPipe init + Kalidokit solve -> clip-space bone frames
  author/recorder.ts    frame capture -> clip JSON, download, manifest snippet
  author/main.ts        /author.html app: live drive, record, preview, export
scripts/
  generate-clips.mjs    procedural starter clips + manifest (npm run gen:clips)
```
