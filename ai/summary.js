const t = (key, ...args) => messenger.i18n.getMessage(key, args);
const $ = id => document.getElementById(id);
const messageId = Number(new URLSearchParams(location.search).get("message"));

let settings;
let original;
let requestId = null;

for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}

function setStatus(text, failed = false) {
  $("status").textContent = text;
  $("status").dataset.status = failed ? "failed" : "";
}

async function summarize() {
  $("again").hidden = true;
  $("cancel").hidden = false;
  $("copy").hidden = true;
  setStatus(t("aiWorking"));
  requestId = crypto.randomUUID();
  try {
    const prompt = summaryRequest(settings, original);
    const started = Date.now();
    const text = await chat(settings, prompt.system, prompt.user, requestId);
    if (text === null) {
      setStatus(t("aiStopped"));
    } else if (!text) {
      setStatus(t("aiErrorEmpty"), true);
    } else {
      $("suggestion").value = text;
      $("suggestion").hidden = false;
      $("copy").hidden = false;
      setStatus(t("summaryDone", String(Math.round((Date.now() - started) / 1000))));
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    requestId = null;
    $("cancel").hidden = true;
    $("again").hidden = false;
  }
}

$("again").addEventListener("click", summarize);
$("cancel").addEventListener("click", () => requestId && messenger.aiHelp.cancel(requestId));
$("openSettings").addEventListener("click", () => messenger.runtime.openOptionsPage());
$("copy").addEventListener("click", () => navigator.clipboard.writeText($("suggestion").value));

async function start() {
  settings = await aiSettings();
  if (!aiConfigured(settings)) {
    $("setup").hidden = false;
    return;
  }
  original = await readMessage(messageId);
  document.title = original.subject;
  $("subject").textContent = original.subject;
  $("destination").textContent = t("summarySends", new URL(settings.aiBaseUrl.trim()).host);
  $("work").hidden = false;
  summarize();
}

start();
