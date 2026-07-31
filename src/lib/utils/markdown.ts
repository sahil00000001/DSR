/**
 * Tiny, dependency-free Markdown subset renderer.
 *
 * DSR bodies are authored in Markdown. Rather than pull in a full parser plus a
 * sanitiser (and the XSS surface that comes with `dangerouslySetInnerHTML`), we
 * parse the small subset employees actually use into a typed AST and render it
 * with ordinary React elements. Nothing user-authored ever becomes raw HTML, so
 * injection is structurally impossible.
 *
 * Supported: `-`/`*`/`1.` lists, `#`–`###` headings, `> quotes`, fenced code,
 * `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, bare URLs and [links](url).
 */

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "strike"; children: InlineNode[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; label: string };

export type BlockNode =
  | { kind: "paragraph"; children: InlineNode[] }
  | { kind: "heading"; level: 1 | 2 | 3; children: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: InlineNode[][] }
  | { kind: "quote"; children: InlineNode[] }
  | { kind: "code"; value: string; language?: string }
  | { kind: "rule" };

/** Only these schemes may appear in a rendered link. */
const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

export function parseMarkdown(input: string): BlockNode[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      index += 1;
      continue;
    }

    // Fenced code block
    const fence = /^```(\w+)?\s*$/.exec(trimmed);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index]!.trim())) {
        body.push(lines[index]!);
        index += 1;
      }
      index += 1; // closing fence
      blocks.push({ kind: "code", value: body.join("\n"), language: fence[1] });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        children: parseInline(heading[2]!),
      });
      index += 1;
      continue;
    }

    // Block quote (consecutive `>` lines merge)
    if (/^>\s?/.test(trimmed)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]!.trim())) {
        body.push(lines[index]!.trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(body.join(" ")) });
      continue;
    }

    // Lists
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: InlineNode[][] = [];
      while (index < lines.length) {
        const candidate = lines[index]!.trim();
        const match = isOrdered
          ? /^\d+[.)]\s+(.*)$/.exec(candidate)
          : /^[-*+]\s+(.*)$/.exec(candidate);
        if (!match) break;
        items.push(parseInline(match[1]!));
        index += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    // Paragraph — consume until a blank line or a block-level marker.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index]!.trim();
      if (!candidate || isBlockStart(candidate)) break;
      paragraph.push(candidate);
      index += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s/.test(line) ||
    /^[-*+]\s/.test(line) ||
    /^\d+[.)]\s/.test(line) ||
    /^>\s?/.test(line) ||
    /^```/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line)
  );
}

/** Ordered so that longer delimiters win over their prefixes. */
const INLINE_PATTERNS: Array<{
  regex: RegExp;
  build: (match: RegExpExecArray) => InlineNode;
}> = [
  { regex: /`([^`]+)`/, build: (m) => ({ kind: "code", value: m[1]! }) },
  { regex: /\*\*([^*]+)\*\*/, build: (m) => ({ kind: "bold", children: parseInline(m[1]!) }) },
  { regex: /__([^_]+)__/, build: (m) => ({ kind: "bold", children: parseInline(m[1]!) }) },
  { regex: /~~([^~]+)~~/, build: (m) => ({ kind: "strike", children: parseInline(m[1]!) }) },
  { regex: /\*([^*]+)\*/, build: (m) => ({ kind: "italic", children: parseInline(m[1]!) }) },
  { regex: /_([^_]+)_/, build: (m) => ({ kind: "italic", children: parseInline(m[1]!) }) },
  {
    regex: /\[([^\]]+)\]\(([^)\s]+)\)/,
    build: (m) => ({ kind: "link", href: safeUrl(m[2]!), label: m[1]! }),
  },
  {
    regex: /(https?:\/\/[^\s<>()]+)/,
    build: (m) => ({ kind: "link", href: safeUrl(m[1]!), label: m[1]! }),
  },
];

export function parseInline(input: string): InlineNode[] {
  if (!input) return [];

  // Find the earliest match across all patterns, then recurse either side.
  let best: { index: number; match: RegExpExecArray; build: (m: RegExpExecArray) => InlineNode } | null =
    null;

  for (const { regex, build } of INLINE_PATTERNS) {
    const match = regex.exec(input);
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, match, build };
    }
  }

  if (!best) return [{ kind: "text", value: input }];

  const nodes: InlineNode[] = [];
  const before = input.slice(0, best.index);
  if (before) nodes.push({ kind: "text", value: before });
  nodes.push(best.build(best.match));
  const after = input.slice(best.index + best.match[0]!.length);
  if (after) nodes.push(...parseInline(after));
  return nodes;
}

/** Drops anything that isn't an http(s), mailto or root-relative URL. */
function safeUrl(url: string): string {
  return SAFE_URL.test(url) ? url : "#";
}

// ---------------------------------------------------------------------------
//  Plain-text projections (search indexing, exports, e-mail, previews)
// ---------------------------------------------------------------------------

/** Strips Markdown syntax, leaving readable prose on one line. */
export function markdownToText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/(\*\*|__|~~|\*|_)/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Converts the Markdown subset to the HTML used in e-mail templates. */
export function markdownToEmailHtml(input: string): string {
  return parseMarkdown(input)
    .map((block) => {
      switch (block.kind) {
        case "heading":
          return `<h${block.level} style="margin:16px 0 8px;font-size:${
            block.level === 1 ? 18 : 16
          }px;color:#0f1115;">${inlineToHtml(block.children)}</h${block.level}>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const items = block.items
            .map((item) => `<li style="margin:4px 0;">${inlineToHtml(item)}</li>`)
            .join("");
          return `<${tag} style="margin:8px 0;padding-left:20px;color:#3f4756;">${items}</${tag}>`;
        }
        case "quote":
          return `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #e2e4ea;color:#5b6472;">${inlineToHtml(
            block.children,
          )}</blockquote>`;
        case "code":
          return `<pre style="margin:12px 0;padding:12px;background:#f6f7f9;border-radius:8px;font-size:13px;overflow:auto;"><code>${escapeHtml(
            block.value,
          )}</code></pre>`;
        case "rule":
          return `<hr style="border:none;border-top:1px solid #e8e9ee;margin:20px 0;" />`;
        case "paragraph":
        default:
          return `<p style="margin:8px 0;color:#3f4756;line-height:1.6;">${inlineToHtml(
            block.children,
          )}</p>`;
      }
    })
    .join("");
}

function inlineToHtml(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "bold":
          return `<strong>${inlineToHtml(node.children)}</strong>`;
        case "italic":
          return `<em>${inlineToHtml(node.children)}</em>`;
        case "strike":
          return `<s>${inlineToHtml(node.children)}</s>`;
        case "code":
          return `<code style="background:#f1f2f5;padding:1px 5px;border-radius:4px;font-size:13px;">${escapeHtml(
            node.value,
          )}</code>`;
        case "link":
          return `<a href="${escapeHtml(node.href)}" style="color:#4f46e5;">${escapeHtml(
            node.label,
          )}</a>`;
        case "text":
        default:
          return escapeHtml(node.value);
      }
    })
    .join("");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Counts list items across the document — powers the "6 tasks" summary chip. */
export function countBullets(input: string): number {
  return parseMarkdown(input).reduce(
    (total, block) => total + (block.kind === "list" ? block.items.length : 0),
    0,
  );
}
