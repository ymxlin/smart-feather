const t = (key, ...args) => messenger.i18n.getMessage(key, args);
const $ = id => document.getElementById(id);

for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}

function setStatus(text, failed = false) {
  $("status").textContent = text;
  $("status").dataset.status = failed ? "failed" : "";
}

function showModels(models) {
  $("models").replaceChildren(...models.map(id => Object.assign(document.createElement("option"), { value: id })));
}

async function saveField(id) {
  await messenger.storage.local.set({ [id]: $(id).value });
}

async function load() {
  const settings = await aiSettings();
  for (const id of Object.keys(AI_DEFAULTS)) {
    $(id).value = settings[id];
    $(id).addEventListener("input", () => saveField(id));
  }
}

async function testConnection() {
  await Promise.all(["aiBaseUrl", "aiApiKey", "aiModel"].map(saveField));
  const settings = await aiSettings();
  if (!settings.aiBaseUrl.trim()) {
    setStatus(t("aiTestNeedsUrl"), true);
    return;
  }
  $("test").disabled = true;
  setStatus(t("aiTestConnecting"));
  try {
    let found = "";
    try {
      const models = await listModels(settings, crypto.randomUUID());
      showModels(models);
      found = t("aiTestModels", String(models.length));
    } catch (error) {
      if (!/^HTTP 40[45]/.test(error.message)) {
        throw error; // some servers have no model list; anything else means no connection
      }
    }
    if (!settings.aiModel.trim()) {
      setStatus(`${found} ${t("aiTestPickModel")}`.trim());
      return;
    }
    setStatus(`${found} ${t("aiTestAsking", settings.aiModel.trim())}`.trim());
    const started = Date.now();
    const answer = await chat(settings, "You are a connection test.", "Reply with the single word OK.", crypto.randomUUID());
    if (answer === null) {
      setStatus(t("aiErrorTimeout"), true);
      return;
    }
    setStatus(t("aiTestPassed", settings.aiModel.trim(), String(Math.round((Date.now() - started) / 1000))));
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    $("test").disabled = false;
  }
}

$("test").addEventListener("click", testConnection);

function setEmbedStatus(text, failed = false) {
  $("embedStatus").textContent = text;
  $("embedStatus").dataset.status = failed ? "failed" : "";
}

async function testEmbedding() {
  await Promise.all(["embedBaseUrl", "embedApiKey", "embedModel"].map(saveField));
  const settings = await aiSettings();
  if (!settings.embedBaseUrl.trim() || !settings.embedModel.trim()) {
    setEmbedStatus(t("searchNeedsServer"), true);
    return;
  }
  $("testEmbed").disabled = true;
  setEmbedStatus(t("aiTestConnecting"));
  try {
    const started = Date.now();
    const [vector] = await embed(settings, ["Smart Feather"], crypto.randomUUID());
    setEmbedStatus(t("searchTestPassed", settings.embedModel.trim(), String(vector.length), String(Date.now() - started)));
  } catch (error) {
    setEmbedStatus(error.message, true);
  } finally {
    $("testEmbed").disabled = false;
  }
}

function describeIndex(status) {
  const count = String(status.count);
  const skipped = status.skipped ? ` ${t("searchSkipped", String(status.skipped))}` : "";
  switch (status.state) {
    case "reading":
      return t("searchReading");
    case "indexing":
      return t("searchProgress", count, String(status.total)) + skipped;
    case "waiting":
      return t("searchWaiting", count, status.error);
    case "paused":
      return t("searchPaused", count);
    default:
      return status.count ? t("searchIndexed", count) + skipped : t("searchEmpty");
  }
}

async function refreshIndexStatus() {
  const status = await messenger.runtime.sendMessage({ type: "indexStatus" });
  $("indexStatus").textContent = describeIndex(status);
  $("indexStatus").dataset.status = status.state === "waiting" ? "failed" : "";
  $("startIndex").disabled = ["reading", "indexing"].includes(status.state);
  $("pauseIndex").disabled = !status.enabled;
  $("clearIndex").disabled = !status.count && !status.enabled;
}

async function indexCommand(type) {
  setEmbedStatus("");
  try {
    if (type === "startIndex") {
      await Promise.all(["embedBaseUrl", "embedApiKey", "embedModel", "searchMonths"].map(saveField));
      const settings = await aiSettings();
      if (!settings.embedBaseUrl.trim() || !settings.embedModel.trim()) {
        setEmbedStatus(t("searchNeedsServer"), true);
        return;
      }
    }
    await messenger.runtime.sendMessage({ type });
  } catch (error) {
    setEmbedStatus(error.message, true);
  }
  await refreshIndexStatus();
}

$("testEmbed").addEventListener("click", testEmbedding);
for (const id of ["startIndex", "pauseIndex", "clearIndex"]) {
  $(id).addEventListener("click", () => indexCommand(id));
}
refreshIndexStatus();
setInterval(refreshIndexStatus, 1000);

$("resetPrompts").addEventListener("click", async () => {
  $("aiRevisePrompt").value = AI_DEFAULTS.aiRevisePrompt;
  $("aiReplyPrompt").value = AI_DEFAULTS.aiReplyPrompt;
  $("aiSubjectPrompt").value = AI_DEFAULTS.aiSubjectPrompt;
  $("aiSummaryPrompt").value = AI_DEFAULTS.aiSummaryPrompt;
  await messenger.storage.local.remove(["aiRevisePrompt", "aiReplyPrompt", "aiSubjectPrompt", "aiSummaryPrompt"]); // follow future defaults again
});

load();
