/* Document-style compose window on top of Betterbird's own editor, which keeps quoting, signatures,
 * inline images, spell check and sending working. Everything is undone when the add-on is disabled. */
"use strict";
this.composeDoc = (() => {
  const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
  const { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");

  const LISTENER = "smart-feather-compose-doc";
  const COMPOSE_URL = "chrome://messenger/content/messengercompose/messengercompose.xhtml";
  const STYLE_ID = "sf-compose-style";
  const BUTTON_ID = "sf-highlight";
  const DOC_ATTR = "sf-doc";
  const HIGHLIGHT = "#fff176";
  const NO_HIGHLIGHT = "transparent";
  // Set with the highlight so the text stays readable when the editor or the recipient uses dark mode.
  const HIGHLIGHT_TEXT = "#1f1f1f";
  const PARAGRAPH_PREF = "mail.compose.default_to_paragraph";
  const SAVED_PARAGRAPH_PREF = "extensions.smartfeather.saved_default_to_paragraph";

  // Ctrl+Alt+digit is the shortcut for heading levels in common document editors.
  const BLOCK_KEYS = { Digit0: "p", Digit1: "h1", Digit2: "h2", Digit3: "h3" };
  const STYLE_ITEMS = {
    toolbarmenu_bodyText: "normal",
    toolbarmenu_paragraph: "normal",
    toolbarmenu_h1: "heading1",
    toolbarmenu_h2: "heading2",
    toolbarmenu_h3: "heading3",
  };
  const HIDDEN_ITEMS = [
    "toolbarmenu_bodyText", // same as paragraph; only reached when the caret is in unwrapped text
    "toolbarmenu_h4",
    "toolbarmenu_h5",
    "toolbarmenu_h6",
    "toolbarmenu_address",
    "toolbarmenu_pre",
    "InsertAnchorItem",
    "InsertTableItem",
    "insertHTMLSource",
  ];

  const CSS = `
#${BUTTON_ID} {
  list-style-image: url("chrome://messenger/skin/icons/new/compact/pencil.svg");
  -moz-context-properties: fill, stroke;
  fill: currentColor;
  stroke: currentColor;
}
#${BUTTON_ID} .toolbarbutton-icon { box-shadow: 0 3px 0 ${HIGHLIGHT}; }
#FormatToolbar[${DOC_ATTR}] #BackgroundColorButton { visibility: hidden; }`;

  let labels = null;
  let started = false;
  const windows = new Map(); // compose window -> undo()

  function setParagraphDefault() {
    if (!Services.prefs.prefHasUserValue(SAVED_PARAGRAPH_PREF)) {
      Services.prefs.setBoolPref(SAVED_PARAGRAPH_PREF, Services.prefs.getBoolPref(PARAGRAPH_PREF));
    }
    Services.prefs.setBoolPref(PARAGRAPH_PREF, true);
  }

  function restoreParagraphDefault() {
    if (Services.prefs.prefHasUserValue(SAVED_PARAGRAPH_PREF)) {
      Services.prefs.setBoolPref(PARAGRAPH_PREF, Services.prefs.getBoolPref(SAVED_PARAGRAPH_PREF));
      Services.prefs.clearUserPref(SAVED_PARAGRAPH_PREF);
    }
  }

  const editorDocument = win => {
    try {
      return win.gMsgCompose?.composeHTML ? win.GetCurrentEditor()?.document : null;
    } catch (e) {
      return null; // the editor isn't ready yet
    }
  };

  const toRgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

  /** Looks at the text where the selection starts: queryCommandValue("hiliteColor") always answers "transparent" here. */
  function isHighlighted(doc) {
    const selection = doc.getSelection();
    if (!selection?.rangeCount) {
      return false;
    }
    const { startContainer, startOffset } = selection.getRangeAt(0);
    let node = startContainer.childNodes[startOffset] ?? startContainer;
    while (node.firstChild) {
      node = node.firstChild;
    }
    const element = node.nodeType === node.ELEMENT_NODE ? node : node.parentElement;
    return element.closest('[style*="background-color"]')?.style.backgroundColor === toRgb(HIGHLIGHT);
  }

  function setup(win) {
    const doc = win.document;
    const bar = doc.getElementById("FormatToolbar");
    const underline = doc.getElementById("underlineButton");
    const styleMenu = doc.getElementById("ParagraphSelect");
    if (windows.has(win) || !bar || !underline || !styleMenu) {
      return;
    }

    const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.documentElement.append(style);

    const button = doc.createXULElement("toolbarbutton");
    button.id = BUTTON_ID;
    button.className = "formatting-button";
    button.setAttribute("type", "checkbox");
    button.setAttribute("autoCheck", "false");
    button.setAttribute("tooltiptext", labels.highlight);
    button.setAttribute("observes", "cmd_renderedHTMLEnabler");
    underline.after(button);

    const savedLabels = new Map();
    for (const [id, label] of Object.entries(STYLE_ITEMS)) {
      const item = doc.getElementById(id);
      savedLabels.set(item, item.getAttribute("label"));
      item.setAttribute("label", labels[label]);
    }
    const hiddenItems = HIDDEN_ITEMS.map(id => doc.getElementById(id)).filter(item => item && !item.hidden);
    hiddenItems.forEach(item => (item.hidden = true));
    bar.setAttribute(DOC_ATTR, "true");
    win.onParagraphFormatChange?.(); // the menulist caches the label of the selected item

    let hookedDoc = null;
    const updateButton = () => {
      const editorDoc = editorDocument(win);
      if (editorDoc) {
        button.toggleAttribute("checked", isHighlighted(editorDoc));
      }
    };
    const hookEditor = () => {
      const editorDoc = editorDocument(win);
      if (!editorDoc || editorDoc === hookedDoc) {
        return;
      }
      hookedDoc = editorDoc;
      // Without this, Enter at the end of a heading continues in a <div>.
      editorDoc.execCommand("defaultParagraphSeparator", false, "p");
      editorDoc.addEventListener("selectionchange", updateButton);
    };
    const toggleHighlight = () => {
      const editorDoc = editorDocument(win);
      if (!editorDoc) {
        return;
      }
      const editor = win.GetCurrentEditor();
      editor.beginTransaction(); // one undo step for both colours
      if (isHighlighted(editorDoc)) {
        editorDoc.execCommand("hiliteColor", false, NO_HIGHLIGHT);
        editor.removeInlineProperty("font", "color");
      } else {
        editorDoc.execCommand("hiliteColor", false, HIGHLIGHT);
        editorDoc.execCommand("foreColor", false, HIGHLIGHT_TEXT);
      }
      editor.endTransaction();
      updateButton();
      win.gContentWindow?.focus();
    };
    const onKeyDown = event => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) {
        return;
      }
      const editorDoc = editorDocument(win);
      if (!editorDoc || event.target.ownerDocument !== editorDoc) {
        return;
      }
      const block = BLOCK_KEYS[event.code];
      if (block) {
        win.editorSetParagraphState(block);
      } else if (event.code === "KeyH") {
        toggleHighlight();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    button.addEventListener("command", toggleHighlight);
    win.addEventListener("focus", hookEditor, true);
    win.addEventListener("keydown", onKeyDown, true);
    hookEditor();

    windows.set(win, () => {
      win.removeEventListener("focus", hookEditor, true);
      win.removeEventListener("keydown", onKeyDown, true);
      hookedDoc?.removeEventListener("selectionchange", updateButton);
      bar.removeAttribute(DOC_ATTR);
      hiddenItems.forEach(item => (item.hidden = false));
      savedLabels.forEach((label, item) => item.setAttribute("label", label));
      win.onParagraphFormatChange?.();
      button.remove();
      style.remove();
      windows.delete(win);
    });
  }

  function stop() {
    if (!started) {
      return;
    }
    started = false;
    ExtensionSupport.unregisterWindowListener(LISTENER);
    for (const undo of [...windows.values()]) {
      undo();
    }
    restoreParagraphDefault();
  }

  return class extends ExtensionCommon.ExtensionAPI {
    onShutdown(isAppShutdown) {
      if (!isAppShutdown) {
        stop();
        Services.obs.notifyObservers(null, "startupcache-invalidate");
      }
    }

    getAPI() {
      return {
        composeDoc: {
          async start(newLabels) {
            labels = newLabels;
            if (started) {
              return;
            }
            started = true;
            setParagraphDefault();
            ExtensionSupport.registerWindowListener(LISTENER, {
              chromeURLs: [COMPOSE_URL],
              onLoadWindow: setup,
              onUnloadWindow: win => windows.delete(win),
            });
          },
        },
      };
    }
  };
})();
