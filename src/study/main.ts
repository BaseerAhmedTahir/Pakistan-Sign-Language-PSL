import { resolveAvatarUrl } from "../config";
import { createScene } from "../scene/createScene";
import { loadAvatar } from "../avatar/loadAvatar";
import { loadSignLibrary } from "../signs/library";
import { SignPlayer, type NmfSpan } from "../player/SignPlayer";

/**
 * Comprehension study tool (/study.html).
 *
 * Facilitator-driven evaluation flow: an anonymous participant watches the
 * avatar perform each stimulus (replays allowed and counted), answers a
 * comprehension question (multiple-choice or open response), optionally
 * rates clarity 1-5, and the session exports as JSON + CSV for analysis.
 *
 * No personal data is collected by design — participants are identified
 * only by a facilitator-assigned code. Obtain informed consent and follow
 * local ethics guidance before running sessions.
 */

interface StudyItem {
  id: string;
  glosses: string[];
  nmf?: NmfSpan[];
  question: string;
  type: "choice" | "open";
  options?: string[];
  correct?: number;
  rate?: boolean;
}

interface StudyConfig {
  title: string;
  randomize?: boolean;
  items: StudyItem[];
}

interface ItemResult {
  itemId: string;
  glosses: string;
  response: string;
  correct: boolean | null;
  replays: number;
  responseMs: number | null;
  rating: number | null;
}

interface SessionMeta {
  participantCode: string;
  group: string;
  pslFluency: string;
  studyTitle: string;
  avatar: string;
  startedAt: string;
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) throw new Error("Missing #app container");

  const ctx = createScene(container);
  const avatarUrl = resolveAvatarUrl();
  const avatar = await loadAvatar(avatarUrl);
  ctx.scene.add(avatar.root);
  ctx.frameUpperBody(avatar.root);

  const library = await loadSignLibrary(avatar);
  const player = new SignPlayer(avatar, library);

  const clock = new (await import("three")).Clock();
  ctx.renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    player.update(delta);
    avatar.update(delta);
    ctx.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  });

  const configRes = await fetch("/study/pilot.json");
  if (!configRes.ok) throw new Error(`study config: HTTP ${configRes.status}`);
  const config = (await configRes.json()) as StudyConfig;

  const panel = document.createElement("div");
  panel.className = "study-panel";
  document.body.appendChild(panel);

  let meta: SessionMeta | null = null;
  let items: StudyItem[] = [];
  let index = 0;
  const results: ItemResult[] = [];

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__study = { player, avatar, getResults: () => results };
  }

  renderSetup();

  // ---- screens ----

  function renderSetup(): void {
    panel.innerHTML = `
      <h2>Comprehension Study <a href="/">← player</a></h2>
      <p>${config.title}</p>
      <p class="muted">${config.items.length} items · avatar: ${avatarUrl}${avatar.source === "placeholder" ? " (placeholder rig — facial NMF inactive)" : ""}</p>
      <hr>
      <label>Participant code (anonymous)</label>
      <input type="text" data-id="code" placeholder="e.g. P01" spellcheck="false">
      <label>Group</label>
      <select data-id="group">
        <option value="deaf">Deaf</option>
        <option value="hard-of-hearing">Hard of hearing</option>
        <option value="hearing">Hearing</option>
      </select>
      <label>PSL fluency (self-reported)</label>
      <select data-id="fluency">
        <option value="native">Native</option>
        <option value="fluent">Fluent</option>
        <option value="basic">Basic</option>
        <option value="none">None</option>
      </select>
      <label class="s-row"><input type="checkbox" data-id="randomize" ${config.randomize ? "checked" : ""} style="width:auto"> Randomize item order</label>
      <button class="s-btn primary" data-id="start">Start session</button>
      <p class="muted">No personal data is stored. Obtain informed consent before starting.</p>`;

    q<HTMLButtonElement>("start").addEventListener("click", () => {
      const code = q<HTMLInputElement>("code").value.trim();
      if (!code) {
        q<HTMLInputElement>("code").focus();
        return;
      }
      meta = {
        participantCode: code,
        group: q<HTMLSelectElement>("group").value,
        pslFluency: q<HTMLSelectElement>("fluency").value,
        studyTitle: config.title,
        avatar: `${avatarUrl} (${avatar.source})`,
        startedAt: new Date().toISOString(),
      };
      items = [...config.items];
      if (q<HTMLInputElement>("randomize").checked) {
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
      }
      index = 0;
      renderItem();
    });
  }

  function renderItem(): void {
    const item = items[index];
    let replays = -1; // first play is not a replay
    let watchedOnce = false;
    let firstPlayDoneAt = 0;
    let selectedChoice = -1;

    const optionsHtml =
      item.type === "choice"
        ? item.options!.map((o, i) => `<button class="s-btn choice" data-opt="${i}">${o}</button>`).join("")
        : `<textarea data-id="open" placeholder="Participant's response (facilitator may type)"></textarea>`;

    panel.innerHTML = `
      <h2>Item ${index + 1} / ${items.length}</h2>
      <p class="progress">Participant ${meta!.participantCode}</p>
      <hr>
      <button class="s-btn primary" data-id="play">▶ Play sign</button>
      <p class="muted" data-id="playstate">Participant watches the avatar, then answers.</p>
      <hr>
      <div data-id="qa" style="display:none; flex-direction:column; gap:8px;">
        <p><strong>${item.question}</strong></p>
        ${optionsHtml}
        <button class="s-btn primary" data-id="submit" disabled>Submit answer</button>
      </div>`;

    const qa = q<HTMLDivElement>("qa");
    const playBtn = q<HTMLButtonElement>("play");
    const submitBtn = q<HTMLButtonElement>("submit");

    playBtn.addEventListener("click", async () => {
      replays += 1;
      playBtn.disabled = true;
      q<HTMLParagraphElement>("playstate").textContent = "Playing…";
      await player.play({ glosses: item.glosses, nmf: item.nmf });
      playBtn.disabled = false;
      playBtn.textContent = "↻ Replay";
      q<HTMLParagraphElement>("playstate").textContent = "Answer when ready — replay if needed.";
      if (!watchedOnce) {
        watchedOnce = true;
        firstPlayDoneAt = performance.now();
        qa.style.display = "flex";
      }
    });

    if (item.type === "choice") {
      panel.querySelectorAll<HTMLButtonElement>("[data-opt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          panel.querySelectorAll("[data-opt]").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedChoice = Number(btn.dataset.opt);
          submitBtn.disabled = false;
        });
      });
    } else {
      q<HTMLTextAreaElement>("open").addEventListener("input", () => {
        submitBtn.disabled = q<HTMLTextAreaElement>("open").value.trim().length === 0;
      });
    }

    submitBtn.addEventListener("click", () => {
      const response =
        item.type === "choice" ? item.options![selectedChoice] : q<HTMLTextAreaElement>("open").value.trim();
      const result: ItemResult = {
        itemId: item.id,
        glosses: item.glosses.join(" "),
        response,
        correct: item.type === "choice" && item.correct !== undefined ? selectedChoice === item.correct : null,
        replays: Math.max(0, replays),
        responseMs: watchedOnce ? Math.round(performance.now() - firstPlayDoneAt) : null,
        rating: null,
      };
      results.push(result);
      if (item.rate) renderRating(result);
      else nextItem();
    });
  }

  function renderRating(result: ItemResult): void {
    panel.innerHTML = `
      <h2>Item ${index + 1} / ${items.length}</h2>
      <hr>
      <p><strong>How clear was the signing?</strong></p>
      <p class="muted">1 = not understandable · 5 = completely clear</p>
      <div class="s-rating">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="s-btn" data-rate="${n}">${n}</button>`).join("")}
      </div>`;
    panel.querySelectorAll<HTMLButtonElement>("[data-rate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        result.rating = Number(btn.dataset.rate);
        nextItem();
      });
    });
  }

  function nextItem(): void {
    index += 1;
    if (index < items.length) renderItem();
    else renderDone();
  }

  function renderDone(): void {
    const scored = results.filter((r) => r.correct !== null);
    const accuracy = scored.length > 0 ? Math.round((scored.filter((r) => r.correct).length / scored.length) * 100) : null;
    const rated = results.filter((r) => r.rating !== null);
    const meanRating = rated.length > 0 ? (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(2) : null;

    panel.innerHTML = `
      <h2>Session complete</h2>
      <p>Participant <strong>${meta!.participantCode}</strong> · ${results.length} items</p>
      ${accuracy !== null ? `<p>Comprehension accuracy (choice items): <strong>${accuracy}%</strong></p>` : ""}
      ${meanRating !== null ? `<p>Mean clarity rating: <strong>${meanRating} / 5</strong></p>` : ""}
      <hr>
      <table>
        <tr><th>Item</th><th>Response</th><th>✓</th><th>Replays</th><th>Rating</th></tr>
        ${results.map((r) => `<tr><td>${r.itemId}</td><td>${r.response}</td><td>${r.correct === null ? "–" : r.correct ? "✓" : "✗"}</td><td>${r.replays}</td><td>${r.rating ?? "–"}</td></tr>`).join("")}
      </table>
      <hr>
      <div class="s-row">
        <button class="s-btn primary" data-id="json">⬇ JSON</button>
        <button class="s-btn primary" data-id="csv">⬇ CSV</button>
        <button class="s-btn" data-id="again">New session</button>
      </div>`;

    q<HTMLButtonElement>("json").addEventListener("click", () =>
      download(`study_${meta!.participantCode}.json`, JSON.stringify({ meta, results }, null, 2), "application/json")
    );
    q<HTMLButtonElement>("csv").addEventListener("click", () => {
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = "participant,group,fluency,item,glosses,response,correct,replays,responseMs,rating";
      const rows = results.map((r) =>
        [meta!.participantCode, meta!.group, meta!.pslFluency, r.itemId, r.glosses, r.response, r.correct, r.replays, r.responseMs, r.rating]
          .map(esc)
          .join(",")
      );
      download(`study_${meta!.participantCode}.csv`, [head, ...rows].join("\n"), "text/csv");
    });
    q<HTMLButtonElement>("again").addEventListener("click", () => {
      results.length = 0;
      renderSetup();
    });
  }

  // ---- helpers ----

  function q<T extends HTMLElement>(id: string): T {
    return panel.querySelector(`[data-id="${id}"]`) as T;
  }

  function download(name: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}

bootstrap().catch((err) => {
  console.error("[study]", err);
  const panel = document.createElement("div");
  panel.className = "study-panel";
  panel.innerHTML = `<h2>Study failed to load</h2><p>${(err as Error).message}</p>`;
  document.body.appendChild(panel);
});
