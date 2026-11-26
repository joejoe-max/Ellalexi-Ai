import React from "react";

function renderInline(text) {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\x60[^`]+\x60|\[[^\]]+\]\([^)]+\))/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      try {
        const url = new URL(link[2]);
        if (url.protocol === "https:" || url.protocol === "http:") {
          return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
        }
      } catch { /* Render unsafe or malformed links as plain text. */ }
      return <React.Fragment key={index}>{link[1]}</React.Fragment>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}
function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

export default function MarkdownMessage({ content = "" }) {
  const lines = String(content).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      const fence = line.trim().slice(0, 3);
      const language = line.trim().slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={blocks.length} className="markdown-code"><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(React.createElement(`h${level}`, { key: blocks.length }, renderInline(heading[2])));
      i++; continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} />); i++; continue;
    }

    if (i + 1 < lines.length && line.includes("|") && isTableDivider(lines[i + 1])) {
      const headers = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(<div className="markdown-table-wrap" key={blocks.length}><table><thead><tr>{headers.map((cell, n) => <th key={n}>{renderInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, n) => <tr key={n}>{headers.map((_, c) => <td key={c}>{renderInline(row[c] || "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={blocks.length}>{quote.map((part, n) => <React.Fragment key={n}>{n > 0 && <br />}{renderInline(part)}</React.Fragment>)}</blockquote>);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items = [];
      while (i < lines.length) {
        const match = lines[i].match(orderedList ? /^\s*\d+[.)]\s+(.+)/ : /^\s*[-*+]\s+(.+)/);
        if (!match) break;
        items.push(match[1]); i++;
      }
      const Tag = orderedList ? "ol" : "ul";
      blocks.push(<Tag key={blocks.length}>{items.map((item, n) => <li key={n}>{renderInline(item)}</li>)}</Tag>);
      continue;
    }

    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|[-*+]\s+|\d+[.)]\s+|>|\x60``|~~~)/.test(lines[i]) && !/^\s*(---+|\*\*\*+|___+)\s*$/.test(lines[i])) {
      paragraph.push(lines[i].trim()); i++;
    }
    blocks.push(<p key={blocks.length}>{paragraph.map((part, n) => <React.Fragment key={n}>{n > 0 && <br />}{renderInline(part)}</React.Fragment>)}</p>);
  }
  return <div className="markdown-message">{blocks}</div>;
}
