/* Small Markdown renderer for AI Summary. Model output is untrusted, so it only ever builds elements and text
 * nodes: nothing is parsed as HTML, and links are shown as text rather than made clickable. */
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|(?<!\w)__(.+?)__(?!\w)|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<!\w)_([^_\s](?:[^_]*[^_\s])?)_(?!\w)|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;

function appendInline(parent, text) {
  let position = 0;
  for (const match of text.matchAll(INLINE)) {
    parent.append(text.slice(position, match.index));
    position = match.index + match[0].length;
    const [, code, bold, boldAlt, italic, italicAlt, linkText, linkUrl] = match;
    if (code !== undefined) {
      const element = document.createElement("code");
      element.textContent = code;
      parent.append(element);
    } else if (linkText !== undefined) {
      parent.append(`${linkText} (${linkUrl})`);
    } else {
      const element = document.createElement(bold !== undefined || boldAlt !== undefined ? "strong" : "em");
      appendInline(element, bold ?? boldAlt ?? italic ?? italicAlt);
      parent.append(element);
    }
  }
  parent.append(text.slice(position));
}

function renderMarkdown(markdown, root) {
  root.replaceChildren();
  const lines = markdown.split(/\r?\n/);
  let lists = []; // open lists, outermost first: { indent, list }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      continue; // a blank line alone doesn't end a list
    }

    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (item && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      const indent = item[1].length;
      const tag = /\d/.test(item[2]) ? "OL" : "UL";
      while (lists.length && indent < lists.at(-1).indent) {
        lists.pop();
      }
      if (lists.at(-1)?.indent === indent && lists.at(-1).list.tagName !== tag) {
        lists.pop();
      }
      if (lists.at(-1)?.indent !== indent) {
        const list = document.createElement(tag.toLowerCase());
        (lists.at(-1)?.list.lastElementChild ?? root).append(list);
        lists.push({ indent, list });
      }
      const li = document.createElement("li");
      appendInline(li, item[3]);
      lists.at(-1).list.append(li);
      continue;
    }

    if (lists.length && /^\s+\S/.test(line)) {
      appendInline(lists.at(-1).list.lastElementChild, ` ${line.trim()}`);
      continue;
    }
    lists = [];

    const fence = line.match(/^\s*```/);
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (fence) {
      const code = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) {
        code.push(lines[i]);
      }
      const pre = document.createElement("pre");
      pre.textContent = code.join("\n");
      root.append(pre);
    } else if (heading) {
      // The window title is the h1.
      const element = document.createElement(`h${Math.min(heading[1].length + 1, 6)}`);
      appendInline(element, heading[2]);
      root.append(element);
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      root.append(document.createElement("hr"));
    } else if (/^\s*>/.test(line)) {
      const quote = document.createElement("blockquote");
      const quoted = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
      }
      i--;
      appendInline(quote, quoted.join(" "));
      root.append(quote);
    } else {
      const paragraph = document.createElement("p");
      appendInline(paragraph, line.trim());
      for (; i + 1 < lines.length && isPlainLine(lines[i + 1]); i++) {
        paragraph.append(document.createElement("br"));
        appendInline(paragraph, lines[i + 1].trim());
      }
      root.append(paragraph);
    }
  }
}

function isPlainLine(line) {
  return line.trim() && !/^\s*(#{1,6}\s|>|```|([-*+]|\d+[.)])\s|([-*_])(\s*\5){2,}\s*$)/.test(line);
}
