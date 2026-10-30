const t = key => messenger.i18n.getMessage(key);

const handlers = {
  reply: ids => messenger.compose.beginReply(ids[0], "replyToSender"),
  replyAll: ids => messenger.compose.beginReply(ids[0], "replyToAll"),
  archive: ids => messenger.messages.archive(ids),
  delete: ids => messenger.messages.delete(ids, { isUserAction: true }),
};

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
});

messenger.composeDoc.start({
  normal: t("styleNormal"),
  heading1: t("styleHeading1"),
  heading2: t("styleHeading2"),
  heading3: t("styleHeading3"),
  highlight: t("highlight"),
});

// AI help opens as its own window: a popup would close, and lose the suggestion, on the first click in the letter.
const aiPanels = new Map(); // compose tab ID -> panel window ID

messenger.composeAction.onClicked.addListener(async tab => {
  const open = aiPanels.get(tab.id);
  if (open !== undefined) {
    await messenger.windows.update(open, { focused: true });
    return;
  }
  const panel = await messenger.windows.create({
    type: "popup",
    url: `ai/panel.html?tab=${tab.id}`,
    width: 520,
    height: 620,
  });
  aiPanels.set(tab.id, panel.id);
});

messenger.windows.onRemoved.addListener(windowId => {
  for (const [tabId, panelId] of aiPanels) {
    if (panelId === windowId) {
      aiPanels.delete(tabId);
    }
  }
});

messenger.tabs.onRemoved.addListener(tabId => {
  const panelId = aiPanels.get(tabId);
  if (panelId !== undefined) {
    messenger.windows.remove(panelId);
  }
});
