/**
 * Generates the starter sign clips + manifest into public/signs/.
 * Run: npm run gen:clips
 *
 * These are PROCEDURAL PLACEHOLDER poses — visually distinguishable stand-ins
 * that prove the pipeline end to end, NOT verified PSL handshapes. They will
 * be replaced by clips recorded from a PSL signer via the Milestone 4
 * authoring tool, which exports the same JSON clip format.
 *
 * Conventions (must match the renderer):
 * - Bones: VRM humanoid names; identity rotation = T-pose.
 * - Poses here are euler degrees [x, y, z], order XYZ, converted to
 *   quaternions in the output. Right-hand finger curl is +z, left is -z.
 * - The relaxed rest values mirror applyRelaxedPose() in
 *   src/avatar/placeholder.ts (±1.2 rad upper arm, ±0.25 rad lower arm).
 */
import * as THREE from "three";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "signs");
mkdirSync(OUT_DIR, { recursive: true });

const DEG = Math.PI / 180;
const round = (n) => Math.round(n * 1e5) / 1e5;

/** Euler degrees [x,y,z] (XYZ order) -> quaternion [x,y,z,w]. */
function quat([x, y, z]) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, "XYZ"));
  return [round(q.x), round(q.y), round(q.z), round(q.w)];
}

const FINGERS = [
  ["Thumb", ["Metacarpal", "Proximal", "Distal"]],
  ["Index", ["Proximal", "Intermediate", "Distal"]],
  ["Middle", ["Proximal", "Intermediate", "Distal"]],
  ["Ring", ["Proximal", "Intermediate", "Distal"]],
  ["Little", ["Proximal", "Intermediate", "Distal"]],
];

function fingerBones(side) {
  return FINGERS.flatMap(([finger, segs]) => segs.map((s) => `${side}${finger}${s}`));
}

/** All fingers at [0,0,0] (open flat hand). */
function openHand(side) {
  return Object.fromEntries(fingerBones(side).map((b) => [b, [0, 0, 0]]));
}

/**
 * Curl the named fingers toward the palm. Curl axis is z: positive for the
 * right hand, negative for the left (mirrored rig).
 */
function curl(side, fingers, amounts = [85, 95, 55]) {
  const s = side === "right" ? 1 : -1;
  const pose = {};
  for (const [finger, segs] of FINGERS) {
    if (!fingers.includes(finger)) continue;
    segs.forEach((seg, i) => {
      pose[`${side}${finger}${seg}`] = [0, 0, (amounts[i] ?? 50) * s];
    });
  }
  return pose;
}

// ---- Shared poses ----

// Mirrors applyRelaxedPose(): 1.2 rad = 68.75°, 0.25 rad = 14.32°.
const ARMS_RELAXED = {
  rightUpperArm: [0, 0, 68.75],
  rightLowerArm: [0, 0, 14.32],
  rightHand: [0, 0, 0],
  leftUpperArm: [0, 0, -68.75],
  leftLowerArm: [0, 0, -14.32],
  leftHand: [0, 0, 0],
};

const REST_POSE = { ...ARMS_RELAXED, ...openHand("right"), ...openHand("left") };

// Right arm raised to signing space: upper arm partly lowered from T-pose,
// elbow bent to bring the forearm up in front of the chest. The euler-Y
// component on the lower arm is SUPINATION — twist about the forearm's own
// axis (euler order XYZ applies Z first, so Y acts on the already-raised
// forearm). Without it the palm faces sideways, not toward the viewer.
const R_PRESENT_ARM = {
  rightUpperArm: [-25, 0, 55],
  rightLowerArm: [15, 80, -115],
  rightHand: [0, 0, 0],
};

/** Full pose for a right-hand letter handshape (left arm stays relaxed). */
function letterPose(handshape) {
  return {
    ...ARMS_RELAXED,
    ...R_PRESENT_ARM,
    ...openHand("right"),
    ...handshape,
  };
}

// ---- Clip assembly ----

/**
 * keys: [ [timeSec, pose], ... ] — every pose must contain the same bone
 * set (build them from shared bases with spreads).
 */
function makeClip(name, keys) {
  const bones = Object.keys(keys[0][1]);
  const tracks = bones.map((bone) => ({
    bone,
    type: "quaternion",
    keys: keys.map(([t, pose]) => {
      if (!(bone in pose)) throw new Error(`${name}: key at t=${t} missing bone ${bone}`);
      return [t, ...quat(pose[bone])];
    }),
  }));
  return { name, fps: 30, tracks };
}

// ---- Clips ----

const clips = [];

clips.push(makeClip("rest", [
  [0, REST_POSE],
  [1, REST_POSE],
]));

// HELLO: raise right arm beside the head, palm toward the viewer (90° of
// forearm supination), then a side-to-side wave. With the palm forward,
// the hand's local-Y axis is the one that produces the windshield-wiper
// waggle.
const WAVE_UP = { ...ARMS_RELAXED, ...openHand("right"), rightUpperArm: [-10, 0, 15], rightLowerArm: [0, 90, -105], rightHand: [0, 0, 0] };
const wavePose = (handY) => ({ ...WAVE_UP, rightHand: [0, handY, 0] });
clips.push(makeClip("hello", [
  [0.0, { ...ARMS_RELAXED, ...openHand("right") }],
  [0.4, WAVE_UP],
  [0.6, wavePose(-30)],
  [0.8, wavePose(30)],
  [1.0, wavePose(-30)],
  [1.2, wavePose(30)],
  [1.4, WAVE_UP],
  [1.8, { ...ARMS_RELAXED, ...openHand("right") }],
]));

// Letters (static holds; the cross-fade animates the transition).
const hold = (name, pose) => makeClip(name, [[0, pose], [0.2, pose]]);

// A: fist, thumb alongside.
clips.push(hold("letter_a", letterPose({
  ...curl("right", ["Index", "Middle", "Ring", "Little"]),
  rightThumbMetacarpal: [0, -15, 20],
  rightThumbProximal: [0, -5, 25],
  rightThumbDistal: [0, 0, 15],
})));

// B: flat hand, thumb folded across the palm.
clips.push(hold("letter_b", letterPose({
  rightThumbMetacarpal: [0, -30, 45],
  rightThumbProximal: [0, -10, 40],
  rightThumbDistal: [0, 0, 20],
})));

// I: little finger extended, others curled, thumb over.
clips.push(hold("letter_i", letterPose({
  ...curl("right", ["Index", "Middle", "Ring"]),
  rightThumbMetacarpal: [0, -15, 40],
  rightThumbProximal: [0, -5, 35],
  rightThumbDistal: [0, 0, 20],
})));

// L: index + thumb extended (L shape), others curled.
clips.push(hold("letter_l", letterPose({
  ...curl("right", ["Middle", "Ring", "Little"]),
  rightThumbMetacarpal: [0, -45, -5],
  rightThumbProximal: [0, -15, 0],
})));

// NOT: raised index finger wagging side to side (placeholder negation
// sign; the sentence-level headshake NMF rides on top of it).
const NOT_BASE = letterPose({
  ...curl("right", ["Middle", "Ring", "Little"]),
  rightThumbMetacarpal: [0, -20, 25],
  rightThumbProximal: [0, -5, 20],
});
const notWag = (handY) => ({ ...NOT_BASE, rightHand: [0, handY, 0] });
clips.push(makeClip("not", [
  [0.0, NOT_BASE],
  [0.2, notWag(-22)],
  [0.4, notWag(22)],
  [0.6, notWag(-22)],
  [0.8, notWag(22)],
  [1.0, NOT_BASE],
]));

// ---- Manifest ----

const manifest = {
  defaults: {
    wordHoldMs: 120,
    wordFadeMs: 250,
    letterHoldMs: 300,
    letterFadeMs: 120,
    restFadeMs: 450,
  },
  signs: [
    { gloss: "REST", clip: "rest.json", type: "rest" },
    { gloss: "HELLO", clip: "hello.json", type: "word", nmf: { happy: 0.4 } },
    { gloss: "NOT", clip: "not.json", type: "word" },
    { gloss: "A", clip: "letter_a.json", type: "letter" },
    { gloss: "B", clip: "letter_b.json", type: "letter" },
    { gloss: "I", clip: "letter_i.json", type: "letter" },
    { gloss: "L", clip: "letter_l.json", type: "letter" },
  ],
};

for (const clip of clips) {
  writeFileSync(join(OUT_DIR, `${clip.name}.json`), JSON.stringify(clip));
  console.log(`wrote ${clip.name}.json (${clip.tracks.length} tracks)`);
}
writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`wrote manifest.json (${manifest.signs.length} entries)`);
