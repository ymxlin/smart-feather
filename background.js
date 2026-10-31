const t = (key, ...args) => messenger.i18n.getMessage(key, args);

const handlers = {
  reply: ids => messenger.compose.beginReply(ids[0], "replyToSender"),
  replyAll: ids => messenger.compose.beginReply(ids[0], "replyToAll"),
  archive: ids => messenger.messages.archive(ids),
  delete: ids => messenger.messages.delete(ids, { isUserAction: true }),
  summary: ids => openSummary(ids[0]),
  moreLike: ids => openSearch(`?message=${ids[0]}`),
};

// Open pages are found through getViews: windows.create doesn't always resolve, so its ID can't be relied on.
const findPage = (path, search = "") =>
  messenger.extension.getViews().find(view => view.location.pathname === path && (!search || view.location.search === search));

function openSummary(messageId) {
  const search = `?message=${messageId}`;
  const open = findPage("/ai/summary.html");
  if (open) {
    open.location.search = search;
    open.focus();
    return;
  }
  messenger.windows.create({ type: "popup", url: `ai/summary.html${search}`, width: 520, height: 560 });
}

function openSearch(search = "") {
  const open = findPage("/search/search.html");
  if (open) {
    if (search) {
      open.location.search = search;
    }
    open.focus();
    return;
  }
  messenger.windows.create({ type: "popup", url: `search/search.html${search}`, width: 640, height: 680 });
}

messenger.browserAction.onClicked.addListener(() => openSearch());
messenger.commands.onCommand.addListener(name => {
  if (name === "open-search") {
    openSearch();
  }
});

messenger.hoverActions.onAction.addListener(async (action, ids) => {
  try {
    await handlers[action](ids);
  } catch (error) {
    console.error("Smart Feather:", action, error);
    messenger.notifications.create({
      type: "basic",
      title: "Smart Feather",
      message: `${t("actionFailed")} ${error.message}`,
    });
  }
});

messenger.hoverActions.start({
  reply: t("reply"),
  replyAll: t("replyAll"),
  archive: t("archive"),
  delete: t("delete"),
  archiveThread: t("archiveThread"),
  deleteThread: t("deleteThread"),
  summary: t("summaryButton"),
  moreLike: t("moreLikeButton"),
});

messenger.messageDisplayAction.onClicked.addListener(async tab => {
  const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
  if (message) {
    openSummary(message.id);
  }
});

messenger.composeDoc.start({
  normal: t("styleNormal"),
  heading1: t("styleHeading1"),
  heading2: t("styleHeading2"),
  heading3: t("styleHeading3"),
  highlight: t("highlight"),
});

// The AI Writing Assistant opens as its own window: a popup would close, and lose the suggestion, on the first click in the letter.
messenger.composeAction.onClicked.addListener(tab => {
  const search = `?tab=${tab.id}`;
  const open = findPage("/ai/panel.html", search);
  if (open) {
    open.focus();
    return;
  }
  messenger.windows.create({ type: "popup", url: `ai/panel.html${search}`, width: 520, height: 620 });
});

messenger.tabs.onRemoved.addListener(tabId => {
  findPage("/ai/panel.html", `?tab=${tabId}`)?.close();
});
