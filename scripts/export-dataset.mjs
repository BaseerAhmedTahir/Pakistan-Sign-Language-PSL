/**
 * Exports the sign library as a versioned, self-describing dataset bundle.
 * Run: npm run dataset:export  ->  dataset-dist/psl-signs-v<version>/
 *
 * Bundle contents: all clip JSONs + manifest.json, index.json (version,
 * stats, per-sign summary), the datasheet, and the license.
 */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIGNS = join(ROOT, "public", "signs");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(SIGNS, "manifest.json"), "utf8"));

const OUT = join(ROOT, "dataset-dist", `psl-signs-v${pkg.version}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "signs"), { recursive: true });

const clipDuration = (clipFile) => {
  const clip = JSON.parse(readFileSync(join(SIGNS, clipFile), "utf8"));
  return Math.max(...clip.tracks.map((t) => t.keys[t.keys.length - 1][0]));
};

const signs = manifest.signs.map((s) => ({
  gloss: s.gloss,
  type: s.type,
  clip: s.clip,
  durationS: +clipDuration(s.clip).toFixed(3),
  nmf: s.nmf ?? null,
  ...s.meta,
}));

const countBy = (key) =>
  signs.reduce((acc, s) => ((acc[s[key] ?? "unspecified"] = (acc[s[key] ?? "unspecified"] ?? 0) + 1), acc), {});

const index = {
  name: "PSL Signs — gloss to animation clip dataset",
  version: pkg.version,
  generated: new Date().toISOString(),
  license: "MIT",
  homepage: "https://github.com/BaseerAhmedTahir/Pakistan-Sign-Language-PSL",
  conventions: {
    bones: "VRM humanoid bone names",
    restPose: "T-pose with identity rotations (three-vrm normalized humanoid)",
    clipSpace: "+Z-facing; VRM0 rigs need the 180°-Y conjugation (see project README)",
  },
  counts: {
    total: signs.length,
    byType: countBy("type"),
    byStatus: countBy("status"),
    byMethod: countBy("method"),
  },
  totalDurationS: +signs.reduce((s, x) => s + x.durationS, 0).toFixed(3),
  signs,
};

for (const file of readdirSync(SIGNS)) copyFileSync(join(SIGNS, file), join(OUT, "signs", file));
copyFileSync(join(ROOT, "docs", "DATASHEET.md"), join(OUT, "DATASHEET.md"));
copyFileSync(join(ROOT, "LICENSE"), join(OUT, "LICENSE"));
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2));

console.log(`exported ${signs.length} signs (${index.totalDurationS}s total) -> ${OUT}`);
console.log(`  byStatus: ${JSON.stringify(index.counts.byStatus)}`);
