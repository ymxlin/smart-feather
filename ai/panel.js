const t = (key, ...args) => messenger.i18n.getMessage(key, args);
const $ = id => document.getElementById(id);
const tabId = Number(new URLSearchParams(location.search).get("tab"));

let settings;
let isReply = false;
let relatedMessageId;
let requestId = null;
let currentSubject = "";
let wantsSubject = false;

for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}

function setStatus(text, failed = false) {
  $("status").textContent = text;
  $("status").dataset.status = failed ? "failed" : "";
}

function setBusy(busy) {
  $("generate").hidden = busy;
  $("cancel").hidden = !busy;
  $("insert").disabled = busy;
}

const topicOf = subject => subject.replace(/^\s*(re|aw|回覆|答覆)\s*[:：]\s*/i, "").trim().toLowerCase();

function showSubject(subject) {
  const changed = subject && topicOf(subject) !== topicOf(currentSubject);
  $("subjectRow").hidden = !changed;
  if (changed) {
    $("subject").value = subject;
    $("useSubject").checked = true;
    $("subjectCurrent").textContent = currentSubject ? t("aiSubjectCurrent", currentSubject) : "";
  }
}

function showSuggestion(text) {
  $("suggestion").value = stripSubjectLine(text);
  $("suggestion").hidden = false;
  $("insert").hidden = false;
  $("generate").textContent = t("aiTryAgain");
}

async function suggestSubject() {
  setStatus(t("aiCheckingSubject"));
  try {
    const prompt = subjectRequest(settings, $("suggestion").value, currentSubject);
    const answer = await chat(settings, prompt.system, prompt.user, requestId);
    showSubject(cleanSubject(answer ?? ""));
  } catch (error) {
    // The letter is what matters: keep it even if this extra step fails.
    console.warn("Smart Feather: subject check failed:", error);
  }
}

async function buildRequest() {
  const draft = await messenger.aiHelp.getDraft(tabId);
  $("insert").textContent = t(draft.scope === "empty" ? "aiInsert" : "aiReplace");
  const instruction = $("instruction").value.trim();
  currentSubject = (await messenger.compose.getComposeDetails(tabId)).subject ?? "";
  // A selection is only part of the letter, too little to judge the subject from.
  wantsSubject = draft.scope !== "selection";
  if (isReply) {
    return replyRequest(settings, await readMessage(relatedMessageId), draft.text, instruction);
  }
  return draft.text ? reviseRequest(settings, draft.text, instruction) : null;
}

async function generate() {
  setBusy(true);
  setStatus(t("aiWorking"));
  $("subjectRow").hidden = true;
  requestId = crypto.randomUUID();
  try {
    const prompt = await buildRequest();
    if (!prompt) {
      setStatus(t("aiNothingToRevise"), true);
      return;
    }
    const started = Date.now();
    const text = await chat(settings, prompt.system, prompt.user, requestId);
    if (text === null) {
      setStatus(t("aiStopped"));
    } else if (!text) {
      setStatus(t("aiErrorEmpty"), true);
    } else {
      showSuggestion(text);
      if (wantsSubject) {
        await suggestSubject();
      }
      setStatus(t("aiDone", String(Math.round((Date.now() - started) / 1000))));
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    requestId = null;
    setBusy(false);
  }
}

$("generate").addEventListener("click", generate);
$("cancel").addEventListener("click", () => requestId && messenger.aiHelp.cancel(requestId));
$("openSettings").addEventListener("click", () => messenger.runtime.openOptionsPage());

$("insert").addEventListener("click", async () => {
  try {
    await messenger.aiHelp.applySuggestion(tabId, $("suggestion").value);
    const subject = $("subject").value.trim();
    if (!$("subjectRow").hidden && $("useSubject").checked && subject) {
      await messenger.compose.setComposeDetails(tabId, { subject });
    }
    window.close();
  } catch (error) {
    setStatus(t("aiInsertFailed", error.message), true);
  }
});

async function start() {
  settings = await aiSettings();
  const details = await messenger.compose.getComposeDetails(tabId);
  isReply = details.type === "reply" && details.relatedMessageId !== undefined;
  relatedMessageId = details.relatedMessageId;

  $("title").textContent = t(isReply ? "aiReplyTitle" : "aiReviseTitle");
  document.title = $("title").textContent;
  $("generate").textContent = t(isReply ? "aiGenerateReply" : "aiGenerateRevision");
  $("instructionLabel").textContent = t(isReply ? "aiReplyInstruction" : "aiReviseInstruction");

  if (!aiConfigured(settings)) {
    $("setup").hidden = false;
    return;
  }
  const host = new URL(settings.aiBaseUrl.trim()).host;
  $("destination").textContent = t(isReply ? "aiSendsReply" : "aiSendsLetter", host);
  $("work").hidden = false;
}

start();
