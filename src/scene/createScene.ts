import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Restore the camera to its default framing. */
  resetCamera: () => void;
  /**
   * Frame the camera on the upper body (torso + head signing box) of the
   * given object, and remember that framing as the reset default.
   */
  frameUpperBody: (target: THREE.Object3D) => void;
  /** Per-frame update (controls damping). Call from the render loop. */
  update: () => void;
}

const MIN_CAMERA_HEIGHT = 0.12;

export function createScene(container: HTMLElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeceef2);

  // Soft image-based ambient light (neutral studio feel).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Three-point lighting: key (with shadow), fill, rim.
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.6, 2.6, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 8;
  key.shadow.camera.left = -1.5;
  key.shadow.camera.right = 1.5;
  key.shadow.camera.top = 2.5;
  key.shadow.camera.bottom = -0.5;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-2.0, 1.6, 1.4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(0.4, 2.2, -2.4);
  scene.add(rim);

  // Ground disc + soft contact shadow.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 64),
    new THREE.MeshStandardMaterial({ color: 0xe2e4e9, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    50
  );

  // Sensible defaults until an avatar is framed.
  let homePosition = new THREE.Vector3(0, 1.45, 2.0);
  let homeTarget = new THREE.Vector3(0, 1.3, 0);
  camera.position.copy(homePosition);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(homeTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.6;
  controls.maxDistance = 4.5;
  // Clamp so the user can't orbit under the floor.
  controls.maxPolarAngle = Math.PI / 2 + 0.12;
  controls.addEventListener("change", () => {
    if (camera.position.y < MIN_CAMERA_HEIGHT) {
      camera.position.y = MIN_CAMERA_HEIGHT;
    }
  });
  controls.update();

  function resetCamera(): void {
    camera.position.copy(homePosition);
    controls.target.copy(homeTarget);
    controls.update();
  }

  function frameUpperBody(target: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(target);
    const height = box.max.y - box.min.y;
    if (!isFinite(height) || height <= 0) return;
    // Signing happens in the torso/head box: frame head-to-hips with a
    // little headroom for the HUD overlay.
    homeTarget = new THREE.Vector3(0, box.min.y + height * 0.75, 0);
    homePosition = new THREE.Vector3(0, box.min.y + height * 0.78, height * 1.2);
    resetCamera();
  }

  function onResize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  return {
    renderer,
    scene,
    camera,
    controls,
    resetCamera,
    frameUpperBody,
    update: () => controls.update(),
  };
}
