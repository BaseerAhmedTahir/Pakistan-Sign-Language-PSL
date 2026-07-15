import * as THREE from "three";

/**
 * Procedurally built rigged mannequin, used when no avatar.vrm is present.
 *
 * Bone names follow the VRM humanoid bone spec (hips, spine, chest,
 * leftUpperArm, leftIndexProximal, ...) — the same names three-vrm's
 * normalized humanoid exposes — so animation clips authored against this
 * placeholder drive a real VRM avatar without any renaming.
 *
 * The rig is built in T-POSE with identity bone rotations, matching the
 * rest pose of three-vrm's normalized humanoid: a clip that sets identity
 * rotations yields a T-pose on both rigs, so clips transfer 1:1. A relaxed
 * arms-down pose is applied as an initial (overridable) pose for display.
 */

const BODY_COLOR = 0xd6d9de;
const ACCENT_COLOR = 0x3a3f47;

/** VRM finger bone chains: [finger, [segment names in order]]. */
const FINGERS: Array<[string, [string, string, string]]> = [
  ["Thumb", ["Metacarpal", "Proximal", "Distal"]],
  ["Index", ["Proximal", "Intermediate", "Distal"]],
  ["Middle", ["Proximal", "Intermediate", "Distal"]],
  ["Ring", ["Proximal", "Intermediate", "Distal"]],
  ["Little", ["Proximal", "Intermediate", "Distal"]],
];

export interface PlaceholderAvatar {
  root: THREE.Group;
  bones: Map<string, THREE.Object3D>;
}

export function createPlaceholderAvatar(): PlaceholderAvatar {
  const root = new THREE.Group();
  root.name = "PlaceholderAvatar";

  const bodyMat = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.55,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: ACCENT_COLOR,
    roughness: 0.4,
    metalness: 0.1,
  });

  const bones = new Map<string, THREE.Object3D>();
  const worldPos = new Map<string, THREE.Vector3>();

  function addBone(name: string, parentName: string | null, pos: THREE.Vector3): THREE.Bone {
    const bone = new THREE.Bone();
    bone.name = name;
    if (parentName === null) {
      bone.position.copy(pos);
      root.add(bone);
    } else {
      const parent = bones.get(parentName);
      if (!parent) throw new Error(`Placeholder rig: unknown parent bone "${parentName}"`);
      bone.position.copy(pos).sub(worldPos.get(parentName)!);
      parent.add(bone);
    }
    bones.set(name, bone);
    worldPos.set(name, pos.clone());
    return bone;
  }

  /** Attach a capsule to bone `boneName` spanning two T-pose world points. */
  function addSegmentMesh(
    boneName: string,
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    material: THREE.Material = bodyMat
  ): void {
    const bone = bones.get(boneName)!;
    const boneWorld = worldPos.get(boneName)!;
    const dir = to.clone().sub(from);
    const length = Math.max(dir.length() - radius * 0.6, 0.004);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
    mesh.castShadow = true;
    mesh.position.copy(from).add(to).multiplyScalar(0.5).sub(boneWorld);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    bone.add(mesh);
  }

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ---- Core skeleton (T-pose world-space joints, ~1.75 m mannequin) ----
  addBone("hips", null, v(0, 1.0, 0));
  addBone("spine", "hips", v(0, 1.08, 0));
  addBone("chest", "spine", v(0, 1.2, 0));
  addBone("upperChest", "chest", v(0, 1.32, 0));
  addBone("neck", "upperChest", v(0, 1.46, 0));
  addBone("head", "neck", v(0, 1.54, 0));

  addSegmentMesh("hips", v(0, 0.98, 0), v(0, 1.42, 0), 0.13);
  addSegmentMesh("upperChest", v(-0.15, 1.4, 0), v(0.15, 1.4, 0), 0.06);
  addSegmentMesh("neck", v(0, 1.44, 0), v(0, 1.56, 0), 0.045);

  // Head + simple face markers (so facing direction is obvious).
  const headBone = bones.get("head")!;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 20), bodyMat);
  head.position.set(0, 0.115, 0.01);
  head.scale.set(0.88, 1.05, 0.95);
  head.castShadow = true;
  headBone.add(head);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), accentMat);
    eye.position.set(0.038 * side, 0.135, 0.098);
    headBone.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), bodyMat);
  nose.position.set(0, 0.1, 0.108);
  headBone.add(nose);

  // ---- Arms in T-pose: straight out along ±X, palms down, thumbs +Z ----
  for (const side of ["left", "right"] as const) {
    const s = side === "left" ? 1 : -1;

    const shoulder = v(0.07 * s, 1.42, 0);
    const upperArm = v(0.18 * s, 1.42, 0);
    const elbow = v(0.46 * s, 1.42, 0);
    const wrist = v(0.72 * s, 1.42, 0);

    addBone(`${side}Shoulder`, "upperChest", shoulder);
    addBone(`${side}UpperArm`, `${side}Shoulder`, upperArm);
    addBone(`${side}LowerArm`, `${side}UpperArm`, elbow);
    addBone(`${side}Hand`, `${side}LowerArm`, wrist);

    addSegmentMesh(`${side}UpperArm`, upperArm, elbow, 0.045);
    addSegmentMesh(`${side}LowerArm`, elbow, wrist, 0.038);
    // Palm (fingers extend along the arm axis).
    addSegmentMesh(`${side}Hand`, wrist, wrist.clone().add(v(0.075 * s, 0, 0.01)), 0.032);

    // Fingers: 3 bones each, spread along Z (thumb toward +Z / front).
    const fingerSpecs: Record<string, { base: THREE.Vector3; dir: THREE.Vector3; lengths: [number, number, number] }> = {
      Thumb: {
        base: wrist.clone().add(v(0.025 * s, -0.012, 0.03)),
        dir: v(0.45 * s, -0.12, 0.88).normalize(),
        lengths: [0.032, 0.028, 0.022],
      },
      Index: {
        base: wrist.clone().add(v(0.095 * s, 0, 0.028)),
        dir: v(1 * s, 0, 0.06).normalize(),
        lengths: [0.033, 0.025, 0.02],
      },
      Middle: {
        base: wrist.clone().add(v(0.098 * s, 0, 0.009)),
        dir: v(1 * s, 0, 0),
        lengths: [0.036, 0.027, 0.021],
      },
      Ring: {
        base: wrist.clone().add(v(0.095 * s, 0, -0.01)),
        dir: v(1 * s, 0, -0.05).normalize(),
        lengths: [0.033, 0.025, 0.019],
      },
      Little: {
        base: wrist.clone().add(v(0.088 * s, 0, -0.028)),
        dir: v(1 * s, 0, -0.1).normalize(),
        lengths: [0.026, 0.02, 0.016],
      },
    };

    for (const [finger, segments] of FINGERS) {
      const spec = fingerSpecs[finger];
      let prevName = `${side}Hand`;
      let prevPos = spec.base;
      for (let i = 0; i < 3; i++) {
        const name = `${side}${finger}${segments[i]}`;
        addBone(name, prevName, prevPos);
        const nextPos = prevPos.clone().addScaledVector(spec.dir, spec.lengths[i]);
        addSegmentMesh(name, prevPos, nextPos, finger === "Thumb" ? 0.011 : 0.009);
        prevName = name;
        prevPos = nextPos;
      }
    }
  }

  // ---- Legs (straight down in T-pose, matching VRM rest) ----
  for (const side of ["left", "right"] as const) {
    const s = side === "left" ? 1 : -1;
    const hip = v(0.09 * s, 0.94, 0);
    const knee = v(0.095 * s, 0.52, 0.01);
    const ankle = v(0.095 * s, 0.1, -0.02);
    const toe = v(0.095 * s, 0.02, 0.12);

    addBone(`${side}UpperLeg`, "hips", hip);
    addBone(`${side}LowerLeg`, `${side}UpperLeg`, knee);
    addBone(`${side}Foot`, `${side}LowerLeg`, ankle);
    addBone(`${side}Toes`, `${side}Foot`, toe);

    addSegmentMesh(`${side}UpperLeg`, hip, knee, 0.065);
    addSegmentMesh(`${side}LowerLeg`, knee, ankle, 0.05);
    addSegmentMesh(`${side}Foot`, ankle, toe, 0.035);
  }

  applyRelaxedPose(bones);

  return { root, bones };
}

/**
 * Rotate the arms from T-pose down to a natural rest. This is an initial
 * display pose only — any animation clip overrides it, and the identity
 * (T-pose) rest orientation is what clips are authored against.
 *
 * `mirrored` flips the lateral sign for -Z-facing (VRM0-style) rigs; see
 * LoadedAvatar.mirrorClipSpace.
 */
export function applyRelaxedPose(bones: Map<string, THREE.Object3D>, mirrored = false): void {
  for (const side of ["left", "right"] as const) {
    let s = side === "left" ? 1 : -1;
    if (mirrored) s = -s;
    const upper = bones.get(`${side}UpperArm`);
    const lower = bones.get(`${side}LowerArm`);
    if (upper) upper.rotation.z = -1.2 * s;
    if (lower) lower.rotation.z = -0.25 * s;
  }
}
