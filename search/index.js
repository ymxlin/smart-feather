/* The semantic search index: keeping it up to date and finding mail in it. Runs in the background page. */
const SKIPPED_FOLDERS = ["trash", "junk", "drafts", "templates"];
const CHUNK_CHARS = 1500;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS = 4;
const MESSAGES_PER_BATCH = 8;
const CHUNKS_PER_REQUEST = 16;
const MAX_HITS = 30;
const RANK_OFFSET = 60; // the usual constant for merging ranked lists
const SNIPPET_CHARS = 180;
const STARTUP_DELAY_MS = 60000;
const REFRESH_MS = 15 * 60000;
const REFRESH_OVERLAP_MS = 24 * 3600000; // mail can arrive with an older date than the last run
const UNLOAD_MS = 10 * 60000;

const indexState = { state: "idle", done: 0, total: 0, skipped: 0, error: "" };
let activeRun = null;
let stopRequested = false;
let records = null; // in memory only while searching
let unloadTimer;
let database;

const idb = request =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDatabase() {
  const open = indexedDB.open("search", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("messages", { keyPath: "id" });
  database ??= idb(open);
  return database;
}

const store = async mode => (await openDatabase()).transaction("messages", mode).objectStore("messages");

async function allMessages(query) {
  const found = [];
  let page = await messenger.messages.query(query);
  found.push(...page.messages);
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    found.push(...page.messages);
  }
  return found;
}

const isSearchable = header => !header.junk && !header.folder?.specialUse?.some(use => SKIPPED_FOLDERS.includes(use));

/** The window's mail, one copy of each message however many folders hold it. */
async function listMail(since) {
  const mail = new Map();
  for (const header of await allMessages({ fromDate: since })) {
    if (header.headerMessageId && isSearchable(header)) {
      mail.set(header.headerMessageId, header);
    }
  }
  return mail;
}

function cleanText(text) {
  const own = text
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith(">"))
    .join("\n");
  return own.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
}

function chunksOf(subject, text) {
  const chunks = [];
  const step = CHUNK_CHARS - CHUNK_OVERLAP;
  for (let i = 0; i < MAX_CHUNKS && (i === 0 || i * step < text.length); i++) {
    chunks.push(`Subject: ${subject}\n${text.slice(i * step, i * step + CHUNK_CHARS)}`);
  }
  return chunks;
}

const prepare = record => ({ ...record, haystack: `${record.subject}\n${record.author}\n${record.text}`.toLowerCase() });

async function readForIndex(header) {
  try {
    const { author, subject, text } = await readMessage(header.id);
    const clean = cleanText(text);
    return { id: header.headerMessageId, subject, author, date: header.date.getTime(), text: clean, chunks: chunksOf(subject, clean) };
  } catch (error) {
    // Some messages can't be read, such as encrypted ones. The next full run tries them again.
    console.warn("Smart Feather: couldn't read a message for the index", error);
    indexState.skipped++;
    return null;
  }
}

async function indexBatch(settings, headers) {
  const messages = (await Promise.all(headers.map(readForIndex))).filter(Boolean);
  const chunks = messages.flatMap(message => message.chunks);
  const vectors = [];
  for (let i = 0; i < chunks.length; i += CHUNKS_PER_REQUEST) {
    vectors.push(...(await embed(settings, chunks.slice(i, i + CHUNKS_PER_REQUEST), crypto.randomUUID())));
  }
  if (!vectors.length) {
    return;
  }
  const size = vectors[0].length;
  const prepared = [];
  let next = 0;
  for (const { chunks: own, ...message } of messages) {
    const joined = new Float32Array(own.length * size);
    own.forEach((chunk, i) => joined.set(vectors[next + i], i * size));
    next += own.length;
    prepared.push({ ...message, vectors: joined });
  }
  const objects = await store("readwrite");
  await Promise.all(prepared.map(record => idb(objects.put(record))));
  records?.push(...prepared.map(prepare));
  indexState.done += prepared.length;
}

async function run(full) {
  const settings = await aiSettings();
  const { searchIndexModel, searchIndexedAt } = await messenger.storage.local.get(["searchIndexModel", "searchIndexedAt"]);
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - Number(settings.searchMonths));
  const startedAt = Date.now();
  const since = full || !searchIndexedAt ? windowStart : new Date(Math.max(windowStart, searchIndexedAt - REFRESH_OVERLAP_MS));
  Object.assign(indexState, { state: "reading", skipped: 0, error: "" });
  try {
    const mail = await listMail(since);
    const keys = await idb((await store("readonly")).getAllKeys());
    if (full && mail.size) {
      // Whatever is left has been deleted, or has aged out of the time window.
      const gone = keys.filter(key => !mail.has(key));
      const objects = await store("readwrite");
      await Promise.all(gone.map(key => idb(objects.delete(key))));
      if (gone.length) {
        records = null;
      }
    }
    const indexed = new Set(await idb((await store("readonly")).getAllKeys()));
    const pending = [...mail.values()].filter(header => !indexed.has(header.headerMessageId)).sort((a, b) => b.date - a.date);
    Object.assign(indexState, { state: "indexing", done: indexed.size, total: indexed.size + pending.length });
    for (let i = 0; i < pending.length; i += MESSAGES_PER_BATCH) {
      if (stopRequested) {
        indexState.state = "paused";
        return;
      }
      await indexBatch({ ...settings, embedModel: searchIndexModel }, pending.slice(i, i + MESSAGES_PER_BATCH));
    }
    await messenger.storage.local.set({ searchIndexedAt: startedAt });
    indexState.state = "idle";
  } catch (error) {
    console.error("Smart Feather: indexing stopped", error);
    Object.assign(indexState, { state: "waiting", error: error.message });
  }
}

function updateIndex(full) {
  if (!activeRun) {
    stopRequested = false;
    activeRun = run(full).finally(() => {
      activeRun = null;
    });
  }
  return activeRun;
}

async function startIndex() {
  const settings = await aiSettings();
  const model = settings.embedModel.trim();
  await embed(settings, ["test"], crypto.randomUUID()); // a wrong address should fail here, before anything is cleared
  const { searchIndexModel } = await messenger.storage.local.get("searchIndexModel");
  if (searchIndexModel && searchIndexModel !== model) {
    await clearIndex(); // vectors from different models can't be compared
  }
  await messenger.storage.local.set({ searchEnabled: true, searchIndexModel: model });
  updateIndex(true);
}

async function pauseIndex() {
  await messenger.storage.local.set({ searchEnabled: false });
  stopRequested = true;
  await activeRun;
  if (indexState.state !== "paused") {
    indexState.state = "paused";
  }
}

async function clearIndex() {
  await pauseIndex();
  await idb((await store("readwrite")).clear());
  await messenger.storage.local.remove(["searchIndexedAt", "searchIndexModel"]);
  records = null;
  Object.assign(indexState, { state: "idle", done: 0, total: 0, skipped: 0, error: "" });
}

async function indexStatus() {
  const { searchEnabled, searchIndexModel } = await messenger.storage.local.get(["searchEnabled", "searchIndexModel"]);
  return { ...indexState, count: await idb((await store("readonly")).count()), enabled: Boolean(searchEnabled), model: searchIndexModel ?? "" };
}

async function loadRecords() {
  records ??= (await idb((await store("readonly")).getAll())).map(prepare);
  clearTimeout(unloadTimer);
  unloadTimer = setTimeout(() => {
    records = null;
  }, UNLOAD_MS);
  return records;
}

function bestChunk(record, query) {
  const size = query.length;
  let score = -1;
  let chunk = 0;
  for (let c = 0; c * size < record.vectors.length; c++) {
    let sum = 0;
    for (let i = 0; i < size; i++) {
      sum += query[i] * record.vectors[c * size + i];
    }
    if (sum > score) {
      score = sum;
      chunk = c;
    }
  }
  return { record, score, chunk };
}

async function meaningHits(query, all) {
  const settings = await aiSettings();
  const { searchIndexModel } = await messenger.storage.local.get("searchIndexModel");
  const [vector] = await embed({ ...settings, embedModel: searchIndexModel }, [query], crypto.randomUUID());
  return all
    .map(record => bestChunk(record, vector))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HITS);
}

function wordHits(words, all) {
  const inSubject = record => words.some(word => record.subject.toLowerCase().includes(word));
  return all
    .filter(record => words.every(word => record.haystack.includes(word)))
    .sort((a, b) => inSubject(b) - inSubject(a) || b.date - a.date)
    .slice(0, MAX_HITS)
    .map(record => ({ record }));
}

function snippet({ record, chunk }, words) {
  if (chunk !== undefined) {
    return record.text.slice(chunk * (CHUNK_CHARS - CHUNK_OVERLAP)).slice(0, SNIPPET_CHARS);
  }
  const lower = record.text.toLowerCase();
  const found = words.map(word => lower.indexOf(word)).filter(at => at >= 0);
  const at = found.length ? Math.min(...found) : 0;
  return record.text.slice(Math.max(0, at - 40)).slice(0, SNIPPET_CHARS);
}

const toResult = (hit, words, kinds) => ({
  id: hit.record.id,
  subject: hit.record.subject,
  author: hit.record.author,
  date: hit.record.date,
  snippet: snippet(hit, words),
  kinds,
});

async function searchMail({ query }) {
  const all = await loadRecords();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const byWords = wordHits(words, all);
  let byMeaning = [];
  let meaningError = "";
  try {
    byMeaning = await meaningHits(query, all);
  } catch (error) {
    meaningError = error.message;
  }

  const merged = new Map();
  const merge = (hits, kind) =>
    hits.forEach((hit, rank) => {
      const entry = merged.get(hit.record.id) ?? { hit, score: 0, kinds: [] };
      entry.score += 1 / (RANK_OFFSET + rank);
      entry.kinds.push(kind);
      merged.set(hit.record.id, entry);
    });
  merge(byWords, "words");
  merge(byMeaning, "meaning");

  const results = [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HITS)
    .map(({ hit, kinds }) => toResult(hit, words, kinds));
  return { results, meaningError, searched: all.length };
}

const senderOf = author => (author.match(/<([^>]+)>/)?.[1] ?? author).trim().toLowerCase();
const baseSubject = subject => subject.replace(/^(\s*(re|fwd?|aw|回覆|答覆|轉寄)\s*[:：]\s*)+/i, "").trim();
const newestFirst = (a, b) => b.date - a.date;

async function moreLikeMail({ messageId, mode }) {
  const seed = await messenger.messages.get(messageId);
  const all = await loadRecords();
  const others = all.filter(record => record.id !== seed.headerMessageId);
  const fromSender = others.filter(record => senderOf(record.author) === senderOf(seed.author)).sort(newestFirst);
  const subject = baseSubject(seed.subject);
  const pool = mode === "both" ? fromSender : others;
  const sameSubject = pool
    .filter(record => baseSubject(record.subject).toLowerCase() === subject.toLowerCase())
    .sort(newestFirst)
    .map(record => ({ record }));

  let hits = sameSubject;
  let meaningError = "";
  if (mode === "sender" || !subject) {
    hits = fromSender.map(record => ({ record }));
  } else {
    try {
      const close = await meaningHits(subject, pool);
      const exact = new Set(sameSubject.map(hit => hit.record.id));
      hits = [...sameSubject, ...close.filter(hit => !exact.has(hit.record.id))];
    } catch (error) {
      meaningError = error.message;
    }
  }
  const kinds = mode === "both" ? ["sender", "subject"] : [mode];
  return { results: hits.slice(0, MAX_HITS).map(hit => toResult(hit, [], kinds)), meaningError, searched: all.length, seed: seed.subject };
}

async function openMail({ id }) {
  const message = (await allMessages({ headerMessageId: id })).find(isSearchable);
  if (!message) {
    throw new Error(t("searchMessageGone"));
  }
  await messenger.messageDisplay.open({ messageId: message.id, location: "tab" });
}

const searchCommands = { indexStatus, startIndex, pauseIndex, clearIndex, search: searchMail, moreLike: moreLikeMail, openMail };

messenger.runtime.onMessage.addListener(({ type, ...args }) => searchCommands[type]?.(args));

async function refreshIndex(full) {
  const { searchEnabled } = await messenger.storage.local.get("searchEnabled");
  if (searchEnabled) {
    updateIndex(full);
  }
}

setTimeout(() => refreshIndex(true), STARTUP_DELAY_MS);
setInterval(() => refreshIndex(false), REFRESH_MS);
