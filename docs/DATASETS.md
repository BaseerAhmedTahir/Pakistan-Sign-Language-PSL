# PSL datasets: survey and integration paths

Surveyed 2026-07 for this project. Two directions matter and they need *different* data:

- **Recognition** (sign → text): images/videos/landmarks of signers. Most existing PSL
  datasets are this.
- **Production** (text → sign, what this project renders): gloss → *animation clip*. No
  public PSL dataset of this kind existed before this project; ours
  ([docs/DATASHEET.md](DATASHEET.md)) fills that gap and is the project's dataset
  contribution.

## Existing PSL datasets (verified links)

| Dataset | Contents | Form | Use here |
| --- | --- | --- | --- |
| [WLPSL (Kaggle)](https://www.kaggle.com/datasets/mohib123456/dynamic-word-level-pakistan-sign-language-dataset) | 70+ dynamic word-level PSL gestures, multiple signers | **MediaPipe Holistic landmarks** (pose 32 upper-body joints + 21/hand) | ⭐ Best conversion candidate — same landmark format our authoring pipeline consumes (see below) |
| [PakSign (2025)](https://www.sciencedirect.com/science/article/abs/pii/S107731422500181X) | Dynamic word-level PSL | Skeleton-based | Recognition benchmark; possible conversion source (format TBD, paywalled paper) |
| [PSL SignBank (2026)](https://www.vfast.org/journals/index.php/VTSE/article/view/2246) | 300 common words: English + Urdu + HamNoSys + signer video + SiGML avatar | Multimodal dictionary, expert-verified | Reference vocabulary + sign-form ground truth when recording our clips; HamNoSys is *not* imported (we deliberately skip the HamNoSys→SiGML pipeline) |
| [UAlpha40](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11848795/) | Urdu alphabet, 40 classes | Images | Reference for recording Urdu fingerspelling handshapes |
| [PSL Urdu alphabet (2021)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8076696/) | 37 Urdu alphabet hand configurations | Images | Same as above |
| [PSL OpenPose (Kaggle)](https://www.kaggle.com/datasets/saadbutt321/pakistan-sign-language-dataset) | PSL gestures | OpenPose keypoints | Secondary conversion candidate (OpenPose→our rig needs a different joint mapping) |
| [Open Data Pakistan PSL](https://opendata.com.pk/dataset/pakistan-sign-language-dataset) | Alphabet + word images | Images | Reference only |

## WLPSL → clip conversion path (planned importer)

WLPSL stores exactly what our authoring tool consumes live: MediaPipe Holistic landmark
sequences. The conversion is therefore the authoring pipeline run offline:

```
WLPSL landmark frames ──Kalidokit (Node)──► clip-space bone rotations ──► clip JSON + manifest entries
```

1. Download WLPSL (requires a Kaggle account/API token — not redistributed here).
2. For each gesture sequence: feed pose + hand landmarks through Kalidokit's `Pose.solve` /
   `Hand.solve` (kalidokit is pure JS and runs in Node), apply the same
   Kalidokit→VRM bone mapping and clip-space conversion as
   [src/author/tracker.ts](../src/author/tracker.ts).
3. Emit clip JSON + manifest entries with `meta.status: "recorded"`, `meta.method`
   documenting the source, and credit WLPSL per its license.
4. Review each converted clip on the avatar (`/author.html` preview) before promoting it
   into the library; converted clips still need Deaf-user validation to reach
   `status: "validated"`.

Caveats: WLPSL's exact per-file schema must be inspected after download; landmark→rotation
solving inherits monocular-capture limits (finger precision); licenses of source datasets
apply to converted derivatives.

## Our dataset (the production-side contribution)

`public/signs/` **is** the dataset: gloss → animation clip in an open JSON format, with
per-sign metadata (English/Urdu, category, capture method, review status). See
[docs/DATASHEET.md](DATASHEET.md) for the datasheet and `npm run dataset:export` for the
distributable bundle. v0 ships procedural placeholders; it grows via the authoring tool
(webcam) and, potentially, the WLPSL importer above.
