/* Privileged side of the AI Writing Assistant: reaching the model server, and reading and changing the letter being written. */
"use strict";
this.aiHelp = (() => {
  const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

  // Quoted mail, forwards and signatures aren't the user's own writing, so the assistant never touches them.
  const NOT_OWN_TEXT = "blockquote[type=cite], .moz-cite-prefix, .moz-signature, .moz-forward-container";
  const requests = new Map(); // requestId -> AbortController

  const isOther = node => node.nodeType === node.ELEMENT_NODE && node.matches(NOT_OWN_TEXT);
  const isBlank = node => !node.textContent.trim() && !node.querySelector?.("img");
  const textOf = node => (node.nodeType === node.TEXT_NODE ? node.nodeValue : node.innerText).trim();

  /** The first stretch of the body that holds the user's text, between quotes and signature. */
  function ownNodes(body) {
    const runs = [[]];
    for (const node of body.childNodes) {
      if (isOther(node)) {
        runs.push([]);
      } else {
        runs.at(-1).push(node);
      }
    }
    for (const run of runs) {
      const filled = run.filter(node => !isBlank(node));
      if (filled.length) {
        return run.slice(run.indexOf(filled[0]), run.indexOf(filled.at(-1)) + 1);
      }
    }
    return [];
  }

  function findTarget(win) {
    const doc = win.GetCurrentEditor().document;
    const selection = doc.getSelection();
    if (selection.rangeCount && !selection.isCollapsed) {
      return { doc, selection, range: selection.getRangeAt(0).cloneRange(), text: selection.toString().trim(), scope: "selection" };
    }
    const nodes = ownNodes(doc.body);
    if (!nodes.length) {
      return { doc, selection, range: null, text: "", scope: "empty" };
    }
    const range = doc.createRange();
    range.setStartBefore(nodes[0]);
    range.setEndAfter(nodes.at(-1));
    return { doc, selection, range, text: nodes.map(textOf).filter(Boolean).join("\n\n"), scope: "letter" };
  }

  const escapeHtml = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const toParagraphs = text =>
    text
      .trim()
      .split(/\n\s*\n/)
      .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");

  return class extends ExtensionCommon.ExtensionAPI {
    onShutdown() {
      for (const controller of requests.values()) {
        controller.abort();
      }
      requests.clear();
    }

    getAPI(context) {
      const composeWindow = tabId => context.extension.tabManager.get(tabId).nativeTab;

      return {
        aiHelp: {
          async request({ url, apiKey, payload, requestId, timeoutMs }) {
            // Not the frontmost window: the AI panel's own window isn't allowed to make this request.
            const win = Services.wm.getMostRecentWindow("mail:3pane") ?? Services.appShell.hiddenDOMWindow;
            const controller = new win.AbortController();
            requests.set(requestId, controller);
            const timer = win.setTimeout(() => controller.abort(), timeoutMs);
            const headers = {};
            if (apiKey) {
              headers.Authorization = `Bearer ${apiKey}`;
            }
            if (payload) {
              headers["Content-Type"] = "application/json";
            }
            try {
              const response = await win.fetch(url, {
                method: payload ? "POST" : "GET",
                headers,
                body: payload,
                credentials: "omit",
                signal: controller.signal,
              });
              return { ok: response.ok, status: response.status, body: await response.text() };
            } catch (error) {
              return error.name === "AbortError" ? { aborted: true } : { ok: false, status: 0, body: error.message };
            } finally {
              win.clearTimeout(timer);
              requests.delete(requestId);
            }
          },

          async cancel(requestId) {
            requests.get(requestId)?.abort();
          },

          async getDraft(tabId) {
            const { text, scope } = findTarget(composeWindow(tabId));
            return { text, scope };
          },

          async applySuggestion(tabId, text) {
            const win = composeWindow(tabId);
            const { doc, selection, range } = findTarget(win);
            if (range) {
              selection.removeAllRanges();
              selection.addRange(range);
            } else if (selection.focusNode?.parentElement?.closest(NOT_OWN_TEXT) || selection.focusNode?.closest?.(NOT_OWN_TEXT)) {
              selection.collapse(doc.body, 0);
            }
            const editor = win.GetCurrentEditor();
            editor.beginTransaction(); // one undo step for the whole change
            if (win.gMsgCompose.composeHTML) {
              doc.execCommand("insertHTML", false, toParagraphs(text));
              // Replacing a whole paragraph leaves its empty shell behind. Blank lines the user made hold a <br>.
              for (const leftover of doc.body.querySelectorAll("p:empty")) {
                editor.deleteNode(leftover);
              }
            } else {
              doc.execCommand("insertText", false, text.trim());
            }
            editor.endTransaction();
            win.focus();
          },
        },
      };
    }
  };
})();
