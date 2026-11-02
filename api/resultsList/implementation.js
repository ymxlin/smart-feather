/* Shows search results in a real message list tab, the kind Betterbird's own "Open as list" uses. */
"use strict";
this.resultsList = (() => {
  const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
  const { GlodaSyntheticView } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaSyntheticView.sys.mjs");

  const RANK_COLUMN = "smartFeatherRank";
  const LOAD_RETRIES = 100;
  const LOAD_RETRY_MS = 50;

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
          async show(title, messageIds) {
            const items = messageIds.map(id => {
              const folderMessage = context.extension.messageManager.get(id);
              return { folderMessage, headerMessageID: folderMessage?.messageId };
            });
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
