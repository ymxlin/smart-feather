/* Hover toolbar for the message list. One floating bar per about:3pane document, kept outside
 * #threadTree: rows are recycled while scrolling, and clicks inside the tree would change the selection. */
"use strict";
this.hoverActions = (() => {
  const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
  const { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");

  const LISTENER = "smart-feather-hover-actions";
  const MAIN_URL = "chrome://messenger/content/messenger.xhtml";
  const BAR_ID = "sf-hover-bar";
  const STYLE_ID = "sf-hover-style";
  const ICONS = "chrome://messenger/skin/icons/new/compact";
  const ACTIONS = [
    { action: "reply", icon: "reply.svg" },
    { action: "replyAll", icon: "reply-all.svg" },
    { action: "archive", icon: "archive.svg" },
    { action: "delete", icon: "trash.svg" },
  ];
  // After a click the next row slides under the pointer; a double click must not hit it.
  const COOLDOWN_MS = 500;
  const EDGE_GAP_PX = 6;
  const SCAN_RETRIES = 60;
  const SCAN_RETRY_MS = 500;
  const NO_REPLY_FOLDERS = Ci.nsMsgFolderFlags.Drafts | Ci.nsMsgFolderFlags.Templates | Ci.nsMsgFolderFlags.Queue;
  const NO_ARCHIVE_FOLDERS = NO_REPLY_FOLDERS | Ci.nsMsgFolderFlags.Archive | Ci.nsMsgFolderFlags.Trash;

  const CSS = `
#${BAR_ID} {
  position: fixed;
  z-index: 100;
  display: flex;
  gap: 2px;
  align-items: center;
  padding-inline: 2px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 6px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .18);
}
#${BAR_ID}[hidden] { display: none; }
#${BAR_ID} button {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 26px;
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
}
#${BAR_ID} button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
#${BAR_ID} button[data-action="delete"]:hover { color: #c5221f; }
#${BAR_ID} img {
  inline-size: 16px;
  block-size: 16px;
  -moz-context-properties: fill, stroke;
  fill: color-mix(in srgb, currentColor 20%, transparent);
  stroke: currentColor;
  pointer-events: none;
}`;

  let labels = null;
  let emit = null;
  let started = false;
  const attached = new Map(); // about:3pane window -> detach()

  /** Everything an action needs about a row, or null when the row has no toolbar (group header, stale index). */
  function describeRow(cw, row) {
    const index = row.index;
    if (!Number.isInteger(index) || index < 0 || row.dataset.properties?.split(" ").includes("dummy")) {
      return null;
    }
    const view = cw.gDBView;
    let hdr;
    try {
      hdr = view.getMsgHdrAt(index);
    } catch (e) {
      return null;
    }
    if (!hdr) {
      return null;
    }
    const collapsed = row.list.view.isContainer(index) && !row.list.view.isContainerOpen(index);
    return {
      index,
      hdr,
      key: `${hdr.folder.URI}#${hdr.messageKey}`,
      threadCount: collapsed ? view.getThreadContainingIndex(index, false).numChildren : 1,
    };
  }

  function threadHeaders(cw, target) {
    if (target.threadCount < 2) {
      return [target.hdr];
    }
    const thread = cw.gDBView.getThreadContainingIndex(target.index, false);
    const hdrs = [];
    for (let i = 0; i < thread.numChildren; i++) {
      hdrs.push(thread.getChildHdrAt(i));
    }
    return hdrs;
  }

  function attach(cw, context) {
    const doc = cw.document;
    const tree = doc.getElementById("threadTree");
    if (attached.has(cw) || !tree) {
      return;
    }

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.append(style);

    const bar = doc.createElement("div");
    bar.id = BAR_ID;
    bar.hidden = true;
    const buttons = {};
    for (const { action, icon } of ACTIONS) {
      const button = doc.createElement("button");
      button.tabIndex = -1;
      button.dataset.action = action;
      const img = doc.createElement("img");
      img.src = `${ICONS}/${icon}`;
      img.alt = "";
      button.append(img);
      buttons[action] = button;
      bar.append(button);
    }
    doc.body.append(bar);

    let target = null;
    let hoveredRow = null;
    let cooldownUntil = 0;

    const hide = () => {
      bar.hidden = true;
      target = null;
      hoveredRow = null;
    };

    function show(row, described) {
      target = described;
      hoveredRow = row;

      const { folder } = described.hdr;
      const inAny = flags => folder.isSpecialFolder(flags, true);
      const canReply = !inAny(NO_REPLY_FOLDERS);
      buttons.reply.hidden = buttons.replyAll.hidden = !canReply;
      buttons.archive.hidden = inAny(NO_ARCHIVE_FOLDERS);
      // Deleting from Trash is permanent, too much for one stray click.
      buttons.delete.hidden = !folder.canDeleteMessages || inAny(Ci.nsMsgFolderFlags.Trash);

      const many = described.threadCount > 1;
      buttons.reply.title = labels.reply;
      buttons.replyAll.title = labels.replyAll;
      buttons.archive.title = many ? labels.archiveThread.replace("{n}", described.threadCount) : labels.archive;
      buttons.delete.title = many ? labels.deleteThread.replace("{n}", described.threadCount) : labels.delete;

      if (Object.values(buttons).every(button => button.hidden)) {
        hide();
        return;
      }
      const rowRect = row.getBoundingClientRect();
      const treeRect = tree.getBoundingClientRect();
      const height = Math.min(rowRect.height - 2, 28);
      // clientWidth leaves out the scrollbar; the row itself can be wider with horizontal scrolling.
      const right = Math.min(rowRect.right, treeRect.left + tree.clientWidth);
      bar.style.blockSize = `${height}px`;
      bar.style.top = `${rowRect.top + (rowRect.height - height) / 2}px`;
      bar.style.right = `${doc.documentElement.clientWidth - right + EDGE_GAP_PX}px`;
      bar.hidden = false;
    }

    const onMouseOver = event => {
      const row = event.target.closest?.("tr");
      if (!row || row === hoveredRow || cw.performance.now() < cooldownUntil) {
        return;
      }
      const described = describeRow(cw, row);
      if (described) {
        show(row, described);
      } else {
        hide();
      }
    };
    const onLeaveTree = event => {
      if (!bar.contains(event.relatedTarget)) {
        hide();
      }
    };
    const onLeaveBar = event => {
      if (!tree.contains(event.relatedTarget)) {
        hide();
      }
    };
    const onClick = event => {
      const action = event.target.closest("button")?.dataset.action;
      if (!action || !target) {
        return;
      }
      const clicked = target;
      const now = hoveredRow?.isConnected ? describeRow(cw, hoveredRow) : null;
      hide();
      cooldownUntil = cw.performance.now() + COOLDOWN_MS;
      // New mail or a sort can move rows under a stationary pointer: never act on a row that changed.
      if (now?.key !== clicked.key) {
        return;
      }
      const wholeThread = action === "archive" || action === "delete";
      const hdrs = wholeThread ? threadHeaders(cw, clicked) : [clicked.hdr];
      const ids = hdrs.map(hdr => context.extension.messageManager.convert(hdr).id);
      emit(action, ids);
    };

    tree.addEventListener("mouseover", onMouseOver);
    tree.addEventListener("mouseleave", onLeaveTree);
    tree.addEventListener("scroll", hide);
    tree.addEventListener("dragstart", hide);
    bar.addEventListener("mouseleave", onLeaveBar);
    bar.addEventListener("click", onClick);

    const detach = () => {
      tree.removeEventListener("mouseover", onMouseOver);
      tree.removeEventListener("mouseleave", onLeaveTree);
      tree.removeEventListener("scroll", hide);
      tree.removeEventListener("dragstart", hide);
      bar.remove();
      style.remove();
      attached.delete(cw);
    };
    attached.set(cw, detach);
    cw.addEventListener("unload", () => attached.delete(cw), { once: true });
  }

  /** A mail tab can still be loading when this runs, and at startup no tab event follows, so keep trying. */
  function scan(win, context, retries = SCAN_RETRIES) {
    let pending = false;
    for (const info of win.document.getElementById("tabmail")?.tabInfo ?? []) {
      if (info.mode?.name !== "mail3PaneTab") {
        continue;
      }
      const cw = info.chromeBrowser?.contentWindow;
      if (cw?.location.href === "about:3pane" && cw.document.readyState === "complete") {
        attach(cw, context);
      } else {
        pending = true;
      }
    }
    if (pending && retries > 0 && started) {
      win.setTimeout(() => scan(win, context, retries - 1), SCAN_RETRY_MS);
    }
  }

  function hookWindow(win, context) {
    const tabmail = win.document.getElementById("tabmail");
    if (!tabmail || win._smartFeatherHover) {
      return;
    }
    const onTab = () => win.setTimeout(() => scan(win, context), 300);
    win._smartFeatherHover = { tabmail, onTab };
    tabmail.tabContainer.addEventListener("TabOpen", onTab);
    tabmail.tabContainer.addEventListener("TabSelect", onTab);
    scan(win, context);
  }

  function unhookWindow(win) {
    const hook = win._smartFeatherHover;
    if (hook) {
      hook.tabmail.tabContainer.removeEventListener("TabOpen", hook.onTab);
      hook.tabmail.tabContainer.removeEventListener("TabSelect", hook.onTab);
      delete win._smartFeatherHover;
    }
  }

  function stop() {
    if (!started) {
      return;
    }
    started = false;
    ExtensionSupport.unregisterWindowListener(LISTENER);
    for (const win of Services.wm.getEnumerator("mail:3pane")) {
      unhookWindow(win);
    }
    for (const detach of [...attached.values()]) {
      detach();
    }
  }

  return class extends ExtensionCommon.ExtensionAPI {
    onShutdown(isAppShutdown) {
      if (!isAppShutdown) {
        stop();
        Services.obs.notifyObservers(null, "startupcache-invalidate");
      }
    }

    getAPI(context) {
      return {
        hoverActions: {
          async start(newLabels) {
            labels = newLabels;
            if (started) {
              return;
            }
            started = true;
            ExtensionSupport.registerWindowListener(LISTENER, {
              chromeURLs: [MAIN_URL],
              onLoadWindow: win => hookWindow(win, context),
              onUnloadWindow: unhookWindow,
            });
          },
          onAction: new ExtensionCommon.EventManager({
            context,
            name: "hoverActions.onAction",
            register: fire => {
              emit = (action, ids) => fire.async(action, ids);
              return () => {
                emit = null;
              };
            },
          }).api(),
        },
      };
    }
  };
})();
