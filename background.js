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
