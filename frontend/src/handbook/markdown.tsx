import type { ReactNode } from "react";

// ponytail: a small Markdown subset, written here so the stack needs no library: ATX headings,
// paragraphs, **strong**, *emphasis*, `code`, fenced code blocks, flat - and 1. lists, > quotes and
// [links](url). Everything else (HTML, images, tables, nested lists, underscores, reference links)
// shows as the text it is. It returns React elements and never sets HTML, so markup in a page
// cannot run. Swap in a CommonMark library plus an HTML sanitizer if pages need more.

// Only these link targets: web, mail and the app's own #/ pages. Anything else is shown as text.
const safeHref = (target: string): string | undefined =>
  /^(?:https?:\/\/|mailto:|#\/)\S*$/i.test(target) &&
  [...target].every((char) => char >= " " && char !== "\u007f")
    ? target
    : undefined;

const inlinePattern =
  /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]*)\]\(([^\s()]*)\)/g;

const inline = (text: string, links = true): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const [whole, code, strong, em, label, target] = match;
    const start = match.index;
    const href = label === undefined ? undefined : safeHref(target);
    // A link inside a link, or to a refused target, stays as text.
    if (label !== undefined && (!links || !href)) continue;
    if (start > at) nodes.push(text.slice(at, start));
    const key = nodes.length;
    if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
    else if (strong !== undefined) nodes.push(<strong key={key}>{inline(strong, links)}</strong>);
    else if (em !== undefined) nodes.push(<em key={key}>{inline(em, links)}</em>);
    else
      nodes.push(
        <a key={key} href={href}>
          {inline(label, false)}
        </a>
      );
    at = start + whole.length;
  }
  if (at < text.length) nodes.push(text.slice(at));
  return nodes;
};

const fence = /^```/;
const heading = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const quote = /^>\s?/;
const bullet = /^[-*+]\s+/;
const numbered = /^\d+[.)]\s+/;
const startsBlock = (line: string) =>
  [fence, heading, quote, bullet, numbered].some((pattern) => pattern.test(line));

const levels = ["h2", "h3", "h4", "h5", "h6", "h6"] as const;

const blocks = (lines: readonly string[]): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let at = 0;
  // Takes lines from `at` while `keep` holds.
  const take = (keep: (line: string) => boolean) => {
    const start = at;
    while (at < lines.length && keep(lines[at])) at++;
    return lines.slice(start, at);
  };
  while (at < lines.length) {
    const line = lines[at];
    const key = nodes.length;
    const title = heading.exec(line);
    if (line.trim() === "") {
      at++;
    } else if (fence.test(line)) {
      at++;
      const code = take((next) => !fence.test(next));
      at++; // The closing fence; an unclosed block runs to the end.
      nodes.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>
      );
    } else if (title) {
      at++;
      const Tag = levels[title[1].length - 1];
      nodes.push(<Tag key={key}>{inline(title[2])}</Tag>);
    } else if (quote.test(line)) {
      const inner = take((next) => quote.test(next)).map((next) => next.replace(quote, ""));
      nodes.push(<blockquote key={key}>{blocks(inner)}</blockquote>);
    } else if (bullet.test(line) || numbered.test(line)) {
      const marker = bullet.test(line) ? bullet : numbered;
      const items = take((next) => marker.test(next)).map((next) => next.replace(marker, ""));
      const List = marker === bullet ? "ul" : "ol";
      nodes.push(
        <List key={key}>
          {items.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </List>
      );
    } else {
      at++;
      const rest = take((next) => next.trim() !== "" && !startsBlock(next));
      nodes.push(<p key={key}>{inline([line, ...rest].join("\n"))}</p>);
    }
  }
  return nodes;
};

// Page headings start at h2, below the page title.
export function Markdown({ source }: { readonly source: string }) {
  return <div className="handbook-prose">{blocks(source.split(/\r\n?|\n/))}</div>;
}
