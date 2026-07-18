export interface Hud {
  setStatus: (text: string, warn?: boolean) => void;
}

/** Top-left overlay: title, avatar status, camera reset. */
export function createHud(onResetCamera: () => void): Hud {
  const hud = document.createElement("div");
  hud.className = "hud";

  const panel = document.createElement("div");
  panel.className = "hud-panel";

  const title = document.createElement("p");
  title.className = "hud-title";
  title.textContent = "PSL Signing Avatar";

  const status = document.createElement("p");
  status.className = "hud-status";
  status.textContent = "Loading avatar…";

  const authorLink = document.createElement("a");
  authorLink.className = "hud-status";
  authorLink.href = "/author.html";
  authorLink.textContent = "Sign authoring tool →";

  const studyLink = document.createElement("a");
  studyLink.className = "hud-status";
  studyLink.href = "/study.html";
  studyLink.textContent = "Comprehension study →";

  panel.append(title, status, authorLink, studyLink);

  const resetBtn = document.createElement("button");
  resetBtn.className = "hud-btn";
  resetBtn.textContent = "Reset camera";
  resetBtn.addEventListener("click", onResetCamera);

  hud.append(panel, resetBtn);
  document.body.appendChild(hud);

  return {
    setStatus(text, warn = false) {
      status.textContent = text;
      status.classList.toggle("warn", warn);
    },
  };
}
