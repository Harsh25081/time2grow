var currentUser = null;
var runHistoryEl = null;
var usageSummaryEl = null;

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `API ${response.status}`);
  return data;
}

function ensureSaasPanel() {
  if (document.querySelector("#saasPanel")) return;
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  const panel = document.createElement("section");
  panel.className = "saas-panel";
  panel.id = "saasPanel";
  panel.innerHTML = `
    <div class="usage-card" id="usageSummary">
      <span>Workspace</span>
      <strong>Sign in to load credits</strong>
    </div>
    <div class="history-card">
      <div class="history-heading">
        <span>Recent runs</span>
        <button class="secondary-button history-refresh" id="refreshRuns" type="button">Refresh</button>
      </div>
      <div class="run-history" id="runHistory">No saved runs yet.</div>
    </div>
  `;
  topbar.insertAdjacentElement("afterend", panel);
  usageSummaryEl = panel.querySelector("#usageSummary");
  runHistoryEl = panel.querySelector("#runHistory");
  panel.querySelector("#refreshRuns").addEventListener("click", () => void loadRuns());
  runHistoryEl.addEventListener("click", (event) => void handleRunClick(event));
}

function renderAccount(user) {
  currentUser = user || null;
  if (!user) return;
  els.accountName.textContent = `${user.name || user.email} - ${user.creditsRemaining ?? "--"} credits`;
  ensureSaasPanel();
  if (usageSummaryEl) {
    usageSummaryEl.innerHTML = `
      <span>${escapeHtml(user.plan || "starter")} plan</span>
      <strong>${escapeHtml(user.creditsRemaining ?? "--")} / ${escapeHtml(user.monthlyCredits ?? "--")} credits left</strong>
      <small>Signed in as ${escapeHtml(user.email)}</small>
    `;
  }
}

function setUser(user) {
  renderAccount(user);
  els.authView.hidden = true;
  els.appShell.hidden = false;
  updateLinkCount();
  void loadRuns();
}

function getUser() {
  return currentUser;
}

async function loadSession() {
  ensureSaasPanel();
  try {
    const data = await apiRequest("/api/auth/me");
    if (data.user) {
      setUser(data.user);
    } else {
      els.authView.hidden = false;
      els.appShell.hidden = true;
    }
  } catch (error) {
    els.authError.textContent = error.message;
    els.authView.hidden = false;
    els.appShell.hidden = true;
  }
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
  currentUser = null;
  latestReport = null;
  els.authView.hidden = false;
  els.appShell.hidden = true;
  if (runHistoryEl) runHistoryEl.textContent = "No saved runs yet.";
}

async function handleAuth(event) {
  event.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value.trim();
  const name = els.authName.value.trim();
  if (!email || !email.includes("@")) {
    els.authError.textContent = "Enter a valid email.";
    return;
  }
  if (password.length < 8) {
    els.authError.textContent = "Password should be at least 8 characters.";
    return;
  }
  els.authError.textContent = "";
  const button = els.authForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const data = await apiRequest("/api/auth/start", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setUser(data.user);
  } catch (error) {
    els.authError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function demoLogin() {
  els.authError.textContent = "Demo login is removed. Create an account or sign in with your email.";
}

async function loadRuns() {
  if (!currentUser) return;
  try {
    const data = await apiRequest("/api/runs");
    if (data.user) renderAccount(data.user);
    renderRuns(data.runs || []);
  } catch (error) {
    if (runHistoryEl) runHistoryEl.textContent = error.message;
  }
}

function renderRuns(runs) {
  ensureSaasPanel();
  if (!runHistoryEl) return;
  if (!runs.length) {
    runHistoryEl.textContent = "No saved runs yet.";
    return;
  }
  runHistoryEl.innerHTML = "";
  runs.slice(0, 10).forEach((run) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-item";
    button.dataset.runId = run.id;
    button.innerHTML = `
      <strong>${escapeHtml(run.title || "Untitled run")}</strong>
      <span>${escapeHtml(run.mode || "Analysis")} - Score ${scoreText(run.score)} - ${escapeHtml(run.scriptCount || 0)} scripts - ${escapeHtml(run.cost || 1)} credit(s)</span>
    `;
    runHistoryEl.appendChild(button);
  });
}

async function handleRunClick(event) {
  const button = event.target.closest(".run-item");
  if (!button) return;
  try {
    const data = await apiRequest(`/api/runs/${encodeURIComponent(button.dataset.runId)}`);
    if (data.run?.report) renderReport(data.run.report);
  } catch (error) {
    els.verdict.textContent = `Could not load saved run: ${error.message}`;
  }
}

async function analyze() {
  const payload = collectPayload();
  const freshMode = els.scriptMode.value === "fresh";
  if (!currentUser) {
    els.verdict.textContent = "Sign in before running analysis.";
    return;
  }
  if (!payload.videoLinks.length && !freshMode) {
    els.verdict.textContent = "Paste at least one link, or switch client choice to fresh scripts from brief.";
    return;
  }
  if (!payload.videoLinks.length && !payload.creative.topic) {
    els.verdict.textContent = "Fresh script mode needs a product/client brief. Fill the brief field first.";
    return;
  }
  if (payload.videoLinks.length > 5) {
    els.verdict.textContent = "Use up to 5 links for this run.";
    return;
  }
  els.analyzeButton.disabled = true;
  setButtonLabel(els.analyzeButton, "Analyzing");
  try {
    const report = await apiRequest("/api/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderReport(report);
    if (report.account) renderAccount(report.account);
    await loadRuns();
  } catch (error) {
    els.verdict.textContent = `Analysis failed: ${error.message}`;
  } finally {
    els.analyzeButton.disabled = false;
    updateActionLabel();
  }
}

function renderReport(report) {
  latestReport = report;
  if (report.account) renderAccount(report.account);
  const metrics = report.metrics || {};
  els.platformBadge.textContent = report.profile?.platform || `${report.videos?.length || 0} links`;
  els.scoreValue.textContent = report.score ? String(report.score) : "--";
  els.meterFill.style.width = `${report.score || 0}%`;
  els.profileStrength.textContent = scoreText(metrics.profileStrength);
  els.hookClarity.textContent = scoreText(metrics.hookClarity);
  els.competitorGap.textContent = scoreText(metrics.competitorGap);
  els.verdict.textContent = verdictText(report);

  els.insightList.innerHTML = "";
  (report.insights || []).forEach((insight) => {
    const item = document.createElement("li");
    item.textContent = insight;
    if (/warning|unavailable|not configured|fallback|missing/i.test(insight)) item.classList.add("warning");
    els.insightList.appendChild(item);
  });

  renderVideos(report.videos || []);
  renderScripts(report.variations || [], report.creative?.makeSimilarConcept !== false);
}

function init() {
  ensureSaasPanel();
  if (els.demoLogin) els.demoLogin.hidden = true;
  if (els.sampleData) els.sampleData.hidden = true;
  els.authForm.addEventListener("submit", (event) => void handleAuth(event));
  if (els.demoLogin) els.demoLogin.addEventListener("click", demoLogin);
  els.signOut.addEventListener("click", () => void signOut());
  els.analyzeButton.addEventListener("click", () => void analyze());
  if (els.sampleData) els.sampleData.addEventListener("click", fillSampleData);
  els.copyReport.addEventListener("click", copyReport);
  els.exportPdf.addEventListener("click", exportPdf);
  els.exportWord.addEventListener("click", exportWord);
  els.videoLinks.addEventListener("input", updateLinkCount);
  els.scriptMode.addEventListener("change", updateActionLabel);
  els.comparisonGrid.addEventListener("click", handleConceptClick);
  updateActionLabel();
  void loadSession();
}
