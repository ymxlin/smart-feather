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
  await Promise.all(Object.keys(AI_DEFAULTS).map(saveField));
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

$("resetPrompts").addEventListener("click", async () => {
  $("aiRevisePrompt").value = AI_DEFAULTS.aiRevisePrompt;
  $("aiReplyPrompt").value = AI_DEFAULTS.aiReplyPrompt;
  await Promise.all(["aiRevisePrompt", "aiReplyPrompt"].map(saveField));
});

load();
