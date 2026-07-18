# Datasheet: PSL Signs — a gloss → animation-clip dataset

Following the structure of *Datasheets for Datasets* (Gebru et al., 2021). This datasheet
ships with every export (`npm run dataset:export`) and must be updated as the dataset grows.

## Motivation

**Why was this dataset created?** Every public PSL dataset targets *recognition*
(images/video/landmarks of signers → labels). Sign-language *production* — rendering signs
with an avatar — needs the inverse resource: a machine-readable mapping from gloss labels to
performable animation clips. No open PSL dataset of this kind existed; prior systems locked
sign forms inside HamNoSys/SiGML toolchains. This dataset is the production-side counterpart,
in an open JSON keyframe format any Three.js/VRM application can play.

**Who created it / funding?** Baseer Ahmed Tahir; no external funding.

## Composition

- **Instances:** one instance = one sign: an animation clip (quaternion keyframe tracks over
  VRM humanoid bones, T-pose-identity rest convention, +Z-facing clip space) plus a manifest
  entry (gloss label, type `word`/`letter`/`rest`, optional non-manual expression weights,
  and metadata: English/Urdu translation, category, capture method, signer code, review
  status).
- **Current size (v0):** 7 clips — 2 words (HELLO, NOT), 4 Latin fingerspelling letters
  (A, B, I, L), 1 system rest pose. **All current clips are `status: "placeholder"` —
  procedurally authored stand-ins that prove the pipeline. None is a verified PSL sign.**
- **Format:** see the "Sign library" section of the project README for the exact clip and
  manifest JSON schemas.

## Collection process

Three capture methods, recorded per sign in `meta.method`:

1. `procedural` — hand-authored keyframes (current placeholders).
2. `mocap-webcam` — the project's authoring tool: webcam → MediaPipe Holistic landmarks →
   Kalidokit solving → clip-space bone rotations. Signers are identified only by anonymous
   codes (e.g. "S01"); obtain informed consent covering open publication of the *motion
   data* before recording.
3. `converted` — offline conversion from existing landmark datasets (e.g. WLPSL; see
   docs/DATASETS.md), inheriting the source dataset's license and credit requirements.

**Review pipeline:** `placeholder` → `recorded` (captured, self-reviewed on the avatar) →
`validated` (approved by Deaf PSL users / sign-language experts). Only `validated` signs
should be presented as correct PSL.

## Uses

Intended: driving signing avatars (this renderer or any VRM/Three.js app), text-to-sign
research, sign-synthesis benchmarking, education. The clips animate an avatar; they are not
suitable as ground truth for recognition training without review of the solver's accuracy
(monocular capture limits finger precision).

## Distribution & licensing

Distributed in-repo (`public/signs/`) and as a versioned export bundle. License: **MIT**,
same as the project. Converted instances may carry additional source-dataset terms noted in
their metadata. Cite via the repository's CITATION.cff.

## Maintenance

Maintained in the project repository; additions come from the authoring tool or converters.
Dataset version follows the package version at export time. Corrections: open an issue or PR
against the manifest/clips.
