/* Shows search results in a real message list tab, the kind Betterbird's own "Open as list" uses. */
"use strict";
this.resultsList = (() => {
  const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
  const { GlodaSyntheticView } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaSyntheticView.sys.mjs");
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

  const RANK_COLUMN = "smartFeatherRank";
  const LOAD_RETRIES = 100;
  const LOAD_RETRY_MS = 50;
  const F = Ci.nsMsgFolderFlags;
  const SKIPPED_FOLDERS = F.Trash | F.Junk | F.Drafts | F.Templates | F.Queue | F.Virtual; // as the index leaves them out

  /**
   * Finds each message by its Message-ID with one pass over the folders, using each folder's own Message-ID lookup.
   * Asking messages.query once per message searched every folder each time, which made long lists slow.
   */
  function findMessages(headerMessageIds) {
    const found = new Map();
    for (const server of MailServices.accounts.allServers) {
      for (const folder of server.rootFolder.descendants) {
        if (found.size === headerMessageIds.length) {
          return found;
        }
        if (folder.flags & SKIPPED_FOLDERS) {
          continue;
        }
        let database;
        try {
          database = folder.msgDatabase;
        } catch {
          continue; // some folders have no message database, such as an account's top level
        }
        for (const id of headerMessageIds) {
          if (!found.has(id)) {
            const header = database?.getMsgHdrForMessageID(id);
            if (header && header.getStringProperty("junkscore") !== "100") {
              found.set(id, header);
            }
          }
        }
      }
    }
    return found;
  }

  /** A column with no header, only there so the view can sort by the search's own ranking. */
  const rankColumn = ranks => ({
    id: RANK_COLUMN,
    bindToView() {},
    isEditable: () => false,
    getCellText: () => "",
    getSortStringForRow: () => "",
    getSortLongForRow: hdr => ranks.get(hdr.messageId) ?? ranks.size,
    isString: () => false,
    getCellProperties: () => "",
    getRowProperties: () => "",
    getImageSrc: () => "",
  });

  return class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        resultsList: {
          async show(title, headerMessageIds) {
            const found = findMessages(headerMessageIds);
            const items = headerMessageIds.filter(id => found.has(id)).map(id => ({ folderMessage: found.get(id), headerMessageID: id }));
            // The view only reads the collection's items, so it needs no Gloda index.
            const syntheticView = new GlodaSyntheticView({ collection: { items } });
            syntheticView.customColumns = [rankColumn(new Map(items.map((item, rank) => [item.headerMessageID, rank])))];
            const win = Services.wm.getMostRecentWindow("mail:3pane");
            const tab = win.document.getElementById("tabmail").openTab("mail3PaneTab", { folderPaneVisible: false, syntheticView, title });
            win.focus();
            for (let tries = 0; tries < LOAD_RETRIES; tries++) {
              const wrapper = tab.chromeBrowser.contentWindow?.gViewWrapper;
              if (wrapper?.dbView) {
                wrapper.showUnthreaded = true; // threads would hide results inside collapsed rows
                wrapper.dbView.curCustomColumn = RANK_COLUMN;
                wrapper.dbView.sort(Ci.nsMsgViewSortType.byCustom, Ci.nsMsgViewSortOrder.ascending);
                return;
              }
              await new Promise(resolve => win.setTimeout(resolve, LOAD_RETRY_MS));
            }
          },
        },
      };
    }
  };
})();
