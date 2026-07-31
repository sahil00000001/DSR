import { parseMarkdown, type BlockNode, type InlineNode } from "@/lib/utils/markdown";
import { cn } from "@/lib/utils/cn";

/**
 * Renders the DSR Markdown subset as React elements.
 *
 * No `dangerouslySetInnerHTML` anywhere in this file — user-authored text only
 * ever becomes text nodes and known element types, so stored-XSS via a status
 * report is not possible by construction.
 */
export function MarkdownView({
  source,
  className,
  /** Caps the rendered blocks for previews; the rest is dropped. */
  maxBlocks,
}: {
  source: string;
  className?: string;
  maxBlocks?: number;
}) {
  const blocks = parseMarkdown(source);
  const visible = maxBlocks ? blocks.slice(0, maxBlocks) : blocks;

  if (visible.length === 0) return null;

  return (
    <div className={cn("space-y-2.5 text-[13.5px] leading-6 text-fg-muted", className)}>
      {visible.map((block, index) => (
        <Block key={index} node={block} />
      ))}
    </div>
  );
}

function Block({ node }: { node: BlockNode }) {
  switch (node.kind) {
    case "heading": {
      const Tag = (["h4", "h5", "h6"] as const)[node.level - 1]!;
      return (
        <Tag
          className={cn(
            "font-semibold text-fg",
            node.level === 1 ? "text-[15px]" : node.level === 2 ? "text-sm" : "text-[13.5px]",
          )}
        >
          <Inline nodes={node.children} />
        </Tag>
      );
    }

    case "list":
      return node.ordered ? (
        <ol className="ml-1 list-outside list-decimal space-y-1 pl-4 marker:text-fg-subtle">
          {node.items.map((item, index) => (
            <li key={index} className="pl-0.5">
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-1">
          {node.items.map((item, index) => (
            <li key={index} className="flex gap-2.5">
              {/* A dot rather than a bullet glyph: aligns cleanly on wrap. */}
              <span
                aria-hidden="true"
                className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-subtle"
              />
              <span className="min-w-0 flex-1">
                <Inline nodes={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote className="border-l-2 border-border-strong pl-3 text-fg-subtle italic">
          <Inline nodes={node.children} />
        </blockquote>
      );

    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface-inset p-3 font-mono text-[12px] leading-5 text-fg">
          <code>{node.value}</code>
        </pre>
      );

    case "rule":
      return <hr className="border-border" />;

    case "paragraph":
    default:
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      );
  }
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "bold":
            return (
              <strong key={index} className="font-semibold text-fg">
                <Inline nodes={node.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={index}>
                <Inline nodes={node.children} />
              </em>
            );
          case "strike":
            return (
              <s key={index} className="text-fg-subtle">
                <Inline nodes={node.children} />
              </s>
            );
          case "code":
            return (
              <code
                key={index}
                className="rounded border border-border bg-surface-muted px-1 py-px font-mono text-[12px] text-fg"
              >
                {node.value}
              </code>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                // Untrusted destination: never leak the referrer or window handle.
                target={node.href.startsWith("/") ? undefined : "_blank"}
                rel="noopener noreferrer nofollow"
                className="font-medium text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
              >
                {node.label}
              </a>
            );
          case "text":
          default:
            return <span key={index}>{node.value}</span>;
        }
      })}
    </>
  );
}
