const t = (key, ...args) => messenger.i18n.getMessage(key, args);
const $ = id => document.getElementById(id);
const ask = (type, args) => messenger.runtime.sendMessage({ type, ...args });

const KIND_LABELS = { words: "searchByWords", meaning: "searchByMeaning", sender: "moreLikeSender", subject: "moreLikeSubject" };
const seedMessage = Number(new URLSearchParams(location.search).get("message"));

for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}

function setStatus(text, failed = false) {
  $("status").textContent = text;
  $("status").dataset.status = failed ? "failed" : "";
}

function line(className, text) {
  return Object.assign(document.createElement("span"), { className, textContent: text });
}

function resultRow(result) {
  const button = document.createElement("button");
  const how = result.kinds.map(kind => t(KIND_LABELS[kind])).join(" + ");
  const day = new Date(result.date).toLocaleDateString();
  button.append(line("subject", result.subject || t("searchNoSubject")), line("meta", `${result.author} · ${day} · ${how}`), line("snippet", result.snippet));
  button.addEventListener("click", () => ask("openMail", { id: result.id }).catch(error => setStatus(error.message, true)));
  const row = document.createElement("li");
  row.append(button);
  return row;
}

/** Runs a search and shows its results. failure turns the reason meaning search failed into the status text. */
async function show(request, failure) {
  $("go").disabled = true;
  setStatus(t("searchWorking"));
  try {
    const answer = await request();
    $("results").replaceChildren(...answer.results.map(resultRow));
    if (answer.meaningError) {
      setStatus(failure(answer.meaningError), true);
    } else {
      setStatus(answer.results.length ? t("searchFound", String(answer.results.length), String(answer.searched)) : t("searchNothing"));
    }
    return answer;
  } catch (error) {
    setStatus(error.message, true);
    return null;
  } finally {
    $("go").disabled = false;
  }
}

function search(event) {
  event.preventDefault();
  const query = $("query").value.trim();
  if (query) {
    $("moreLike").hidden = true;
    show(() => ask("search", { query }), reason => t("searchWordsOnly", reason));
  }
}

async function moreLike(mode) {
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  const answer = await show(() => ask("moreLike", { messageId: seedMessage, mode }), reason => t("moreLikeExactOnly", reason));
  if (answer) {
    $("seed").textContent = t("moreLikeSeed", answer.seed || t("searchNoSubject"));
  }
  messenger.storage.local.set({ searchMoreLikeMode: mode });
}

async function load() {
  const { count, state } = await ask("indexStatus");
  $("setup").hidden = count > 0;
  $("work").hidden = !count;
  if (!count) {
    return;
  }
  setStatus(t(state === "indexing" ? "searchStillIndexing" : "searchReady", String(count)));
  if (seedMessage) {
    const { searchMoreLikeMode } = await messenger.storage.local.get("searchMoreLikeMode");
    $("moreLike").hidden = false;
    moreLike(searchMoreLikeMode ?? "both");
  } else {
    $("query").focus();
  }
}

$("form").addEventListener("submit", search);
$("openSettings").addEventListener("click", () => messenger.runtime.openOptionsPage());
for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => moreLike(button.dataset.mode));
}

load();
