/**
 * Downloads the sample VRM avatars used to test the VRM0 and VRM1 code
 * paths. Run: npm run fetch:samples
 *
 * These are third-party models under their own licenses (not redistributed
 * in this repo) — they are dev fixtures only, not part of the deployed app:
 *   - AliciaSolid (VRM 0.51) — vrm-c/UniVRM test models
 *   - VRM1_Constraint_Twist_Sample (VRM 1.0) — pixiv/three-vrm examples
 *
 * Load one with: http://localhost:5173/?avatar=/avatar/samples/vrm0_alicia.vrm
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "avatar", "samples");
mkdirSync(OUT_DIR, { recursive: true });

const SAMPLES = [
  {
    file: "vrm0_alicia.vrm",
    url: "https://raw.githubusercontent.com/vrm-c/UniVRM/master/Tests/Models/Alicia_vrm-0.51/AliciaSolid_vrm-0.51.vrm",
  },
  {
    file: "vrm1_twist.vrm",
    url: "https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm",
  },
];

for (const { file, url } of SAMPLES) {
  const dest = join(OUT_DIR, file);
  if (existsSync(dest)) {
    console.log(`${file} already present — skipping`);
    continue;
  }
  process.stdout.write(`fetching ${file}… `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED (HTTP ${res.status})`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`ok (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
}
