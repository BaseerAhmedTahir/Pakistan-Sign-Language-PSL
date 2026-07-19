import * as THREE from "three";
import { resolveAvatarUrl } from "../config";
import { createScene } from "../scene/createScene";
import { loadAvatar } from "../avatar/loadAvatar";
import { buildAnimationClip } from "../signs/clipLoader";
import { Tracker, type BoneFrame } from "./tracker";
import { Recorder } from "./recorder";

/**
 * Sign authoring tool (/author.html): record a signer with the webcam,
 * retarget onto the avatar via MediaPipe + Kalidokit, preview, and export
 * a clip in the library's JSON format.
 */

const SMOOTHING = 0.45; // slerp factor per frame for live drive (jitter damping)

async function bootstrap(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) throw new Error("Missing #app container");

  const ctx = createScene(container);
  const avatar = await loadAvatar(resolveAvatarUrl());
  ctx.scene.add(avatar.root);
  ctx.frameUpperBody(avatar.root);

  const tracker = new Tracker();
  const recorder = new Recorder();
  const previewMixer = new THREE.AnimationMixer(avatar.animationRoot);
  let previewAction: THREE.AnimationAction | null = null;
  let liveFrame: BoneFrame | null = null;
  let liveDrive = true;
  let video: HTMLVideoElement | null = null;

  const ui = buildPanel();

  // ---- model init ----
  ui.initBtn.addEventListener("click", async () => {
    ui.initBtn.disabled = true;
    try {
      await tracker.init((msg) => ui.setStatus("track", msg));
      ui.cameraBtn.disabled = false;
    } catch (err) {
      ui.setStatus("track", `Model load failed: ${(err as Error).message}`, true);
      ui.initBtn.disabled = false;
    }
  });

  // ---- camera ----
  ui.cameraBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      video = ui.video;
      video.srcObject = stream;
      await video.play();
      ui.setStatus("track", "Tracking… perform in frame.");
      ui.recordBtn.disabled = false;
    } catch (err) {
      ui.setStatus("track", `Camera failed: ${(err as Error).message}`, true);
    }
  });

  ui.mirrorToggle.addEventListener("change", () => {
    tracker.options.mirror = ui.mirrorToggle.checked;
    ui.video.classList.toggle("mirrored", ui.mirrorToggle.checked);
  });
  ui.flipToggle.addEventListener("change", () => {
    tracker.options.spaceFlip = ui.flipToggle.checked;
  });

  // ---- record / preview / export ----
  ui.recordBtn.addEventListener("click", () => {
    if (recorder.recording) {
      recorder.stop();
      ui.recordBtn.textContent = "● Record";
      ui.recordBtn.classList.remove("rec");
      const ok = recorder.frameCount >= 2;
      ui.previewBtn.disabled = !ok;
      ui.exportBtn.disabled = !ok;
      ui.setStatus(
        "rec",
        ok
          ? `Recorded ${recorder.frameCount} frames (${recorder.durationS.toFixed(2)}s).`
          : "Recording too short — nothing captured.",
        !ok
      );
    } else {
      recorder.start();
      ui.recordBtn.textContent = "■ Stop";
      ui.recordBtn.classList.add("rec");
      ui.setStatus("rec", "Recording…");
    }
  });

  function currentClipName(): string {
    return (ui.glossInput.value.trim() || "untitled").toLowerCase().replace(/\s+/g, "_");
  }

  ui.previewBtn.addEventListener("click", () => {
    const json = recorder.toClipJson(currentClipName());
    if (!json) return;
    liveDrive = false;
    ui.liveToggle.checked = false;
    previewAction?.stop();
    const clip = buildAnimationClip(json, avatar.bones, avatar.mirrorClipSpace);
    previewAction = previewMixer.clipAction(clip);
    previewAction.reset();
    previewAction.setLoop(THREE.LoopOnce, 1);
    previewAction.clampWhenFinished = true;
    previewAction.fadeIn(0.15).play();
  });

  ui.liveToggle.addEventListener("change", () => {
    liveDrive = ui.liveToggle.checked;
    if (liveDrive) previewAction?.stop();
  });

  ui.exportBtn.addEventListener("click", () => {
    const gloss = ui.glossInput.value.trim().toUpperCase();
    if (!gloss) {
      ui.setStatus("rec", "Enter a gloss label before exporting.", true);
      return;
    }
    const json = recorder.toClipJson(currentClipName());
    if (!json) return;
    recorder.download(json);
    const entry = recorder.manifestEntry(gloss, `${json.name}.json`, ui.typeSelect.value as "word" | "letter");
    ui.snippet.textContent = entry + ",";
    ui.setStatus(
      "rec",
      `Downloaded ${json.name}.json — move it into public/signs/ and add the entry below to manifest.json.`
    );
  });

  // ---- synthetic pipeline test (no camera needed) ----
  ui.testBtn.addEventListener("click", () => {
    ui.setStatus("track", "Synthetic drive: 3s sine wave on the right arm…");
    const t0 = performance.now();
    recorder.start();
    ui.recordBtn.textContent = "■ Stop";
    ui.recordBtn.classList.add("rec");
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > 3) {
        recorder.stop();
        ui.recordBtn.textContent = "● Record";
        ui.recordBtn.classList.remove("rec");
        ui.previewBtn.disabled = false;
        ui.exportBtn.disabled = false;
        ui.recordBtn.disabled = false;
        ui.setStatus("rec", `Synthetic recording: ${recorder.frameCount} frames (${recorder.durationS.toFixed(2)}s).`);
        return;
      }
      const frame: BoneFrame = new Map();
      frame.set("rightUpperArm", new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.9 + 0.5 * Math.sin(t * 4))));
      frame.set("rightLowerArm", new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.2 - 0.5 * Math.sin(t * 4))));
      frame.set("head", new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4 * Math.sin(t * 2), 0)));
      liveFrame = frame;
      recorder.capture(frame);
      requestAnimationFrame(tick);
    };
    tick();
  });

  // ---- render loop ----
  const clock = new THREE.Clock();
  ctx.renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();

    if (video && tracker.ready) {
      const solved = tracker.solve(video, performance.now());
      if (solved) {
        liveFrame = solved;
        recorder.capture(solved);
      }
    }

    if (liveDrive && liveFrame) {
      for (const [bone, q] of liveFrame) {
        const node = avatar.bones.get(bone);
        if (!node) continue;
        // Live application must match how clips bind: mirrored rigs get
        // the same conjugation the clip loader applies.
        const target = avatar.mirrorClipSpace ? new THREE.Quaternion(-q.x, q.y, -q.z, q.w) : q;
        node.quaternion.slerp(target, SMOOTHING);
      }
    }

    previewMixer.update(delta);
    avatar.update(delta);
    ctx.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__author = { ctx, avatar, tracker, recorder };
  }

  // ---- panel construction ----
  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "author-panel";
    panel.innerHTML = `
      <p class="author-title">Sign Authoring <a href="${import.meta.env.BASE_URL}">← player</a></p>
      <div class="author-section">
        <h3>Tracking</h3>
        <video class="mirrored" playsinline muted></video>
        <div class="a-row">
          <button class="a-btn" data-id="init">Load models (~17 MB)</button>
          <button class="a-btn" data-id="camera" disabled>Start camera</button>
        </div>
        <div class="a-row">
          <label><input type="checkbox" data-id="mirror" checked> Mirror (selfie)</label>
          <label title="Kalidokit targets -Z-facing rigs; ours is +Z. Toggle if motion looks mirrored.">
            <input type="checkbox" data-id="flip" checked> Space flip</label>
        </div>
        <div class="a-row">
          <label><input type="checkbox" data-id="live" checked> Live drive avatar</label>
          <button class="a-btn" data-id="test" title="Runs a synthetic motion through record/export — no camera needed">Test (no camera)</button>
        </div>
        <p class="author-status" data-id="track-status">Models not loaded.</p>
      </div>
      <div class="author-section">
        <h3>Record</h3>
        <div class="a-row">
          <input type="text" data-id="gloss" placeholder="Gloss label, e.g. THANKS" spellcheck="false" dir="auto">
          <select data-id="type"><option value="word">word</option><option value="letter">letter</option></select>
        </div>
        <div class="a-row">
          <button class="a-btn" data-id="record" disabled>● Record</button>
          <button class="a-btn" data-id="preview" disabled>▶ Preview</button>
          <button class="a-btn primary" data-id="export" disabled>⬇ Export</button>
        </div>
        <p class="author-status" data-id="rec-status"></p>
        <code class="snippet" data-id="snippet"></code>
      </div>`;
    document.body.appendChild(panel);

    const el = <T extends HTMLElement>(id: string) => panel.querySelector(`[data-id="${id}"]`) as T;
    const trackStatus = el<HTMLParagraphElement>("track-status");
    const recStatus = el<HTMLParagraphElement>("rec-status");
    return {
      video: panel.querySelector("video") as HTMLVideoElement,
      initBtn: el<HTMLButtonElement>("init"),
      cameraBtn: el<HTMLButtonElement>("camera"),
      mirrorToggle: el<HTMLInputElement>("mirror"),
      flipToggle: el<HTMLInputElement>("flip"),
      liveToggle: el<HTMLInputElement>("live"),
      testBtn: el<HTMLButtonElement>("test"),
      glossInput: el<HTMLInputElement>("gloss"),
      typeSelect: el<HTMLSelectElement>("type"),
      recordBtn: el<HTMLButtonElement>("record"),
      previewBtn: el<HTMLButtonElement>("preview"),
      exportBtn: el<HTMLButtonElement>("export"),
      snippet: el<HTMLElement>("snippet"),
      setStatus(which: "track" | "rec", msg: string, warn = false) {
        const target = which === "track" ? trackStatus : recStatus;
        target.textContent = msg;
        target.classList.toggle("warn", warn);
      },
    };
  }
}

bootstrap().catch((err) => {
  console.error("[author]", err);
});
