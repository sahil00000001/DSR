"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  AtSign,
  Bold,
  Code,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Textarea } from "@/components/ui/input";
import { MarkdownView } from "@/components/markdown-view";
import { Avatar } from "@/components/ui/avatar";

/**
 * Markdown composer with a formatting toolbar, live preview and @mentions.
 *
 * ## Why Markdown rather than a WYSIWYG editor
 *
 * The app already has a hand-rolled Markdown parser that renders to **React nodes**
 * rather than HTML, which means a description cannot inject markup no matter what is
 * typed into it — there is no `dangerouslySetInnerHTML` anywhere in the path. The
 * same parser also renders to email HTML, so a task description reaches an inbox
 * looking like it does on screen.
 *
 * A ProseMirror-based editor would add ~350 kB, store HTML that then needs
 * sanitising on every read, and require a second renderer for email. The toolbar
 * below closes most of the usability gap for a fraction of that.
 *
 * ## Mentions
 *
 * Typing `@` opens a picker. The chosen person's id is tracked in `mentionIds` and
 * posted as a hidden field, because matching a name back out of prose afterwards is
 * ambiguous — two people can share a first name, and someone can type a name that
 * belongs to nobody. The server validates the ids regardless.
 */

export interface MentionablePerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
}

interface Segment {
  before: string;
  selected: string;
  after: string;
}

export function MarkdownEditor({
  name,
  value,
  onChange,
  people = [],
  onMentionsChange,
  placeholder,
  rows = 6,
  maxLength,
  required,
  ariaLabel,
  className,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Candidates for the @ picker. Empty disables mentions. */
  people?: MentionablePerson[];
  onMentionsChange?: (ids: string[]) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeMention, setActiveMention] = useState(0);
  const listboxId = useId();

  const mentionsOn = people.length > 0;

  /** Splits the current value at the selection so a wrap can be applied. */
  const segment = useCallback((): Segment & { start: number; end: number } => {
    const element = textarea.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    return {
      before: value.slice(0, start),
      selected: value.slice(start, end),
      after: value.slice(end),
      start,
      end,
    };
  }, [value]);

  /** Applies `wrap` around the selection, or inserts a placeholder if empty. */
  function surround(prefix: string, suffix = prefix, fallback = "text") {
    const { before, selected, after, start } = segment();
    const body = selected || fallback;
    onChange(`${before}${prefix}${body}${suffix}${after}`);

    // Restore a useful selection: the inserted text, so typing replaces it.
    requestAnimationFrame(() => {
      const element = textarea.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(start + prefix.length, start + prefix.length + body.length);
    });
  }

  /** Prefixes each selected line — for lists and quotes. */
  function prefixLines(marker: string | ((index: number) => string)) {
    const { before, selected, after } = segment();
    // Expand the selection to whole lines, so a mid-line caret still works.
    const lineStart = before.lastIndexOf("\n") + 1;
    const head = before.slice(0, lineStart);
    const target = `${before.slice(lineStart)}${selected}` || "";

    const marked = (target || "item")
      .split("\n")
      .map((line, index) => `${typeof marker === "function" ? marker(index) : marker}${line}`)
      .join("\n");

    onChange(`${head}${marked}${after}`);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function handleChange(next: string) {
    onChange(next);
    if (!mentionsOn) return;

    // Open the picker when the caret sits in a partial `@word` at a word boundary.
    const caret = textarea.current?.selectionStart ?? next.length;
    const upto = next.slice(0, caret);
    const match = /(?:^|[\s(])@([\p{L}\p{N}. -]{0,40})$/u.exec(upto);

    if (match) {
      setMentionQuery(match[1] ?? "");
      setActiveMention(0);
    } else {
      setMentionQuery(null);
    }
  }

  const suggestions =
    mentionQuery === null
      ? []
      : people
          .filter((person) => person.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6);

  function insertMention(person: MentionablePerson) {
    const element = textarea.current;
    const caret = element?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const match = /(?:^|[\s(])@([\p{L}\p{N}. -]{0,40})$/u.exec(upto);
    if (!match) return;

    // Replace the partial `@query` with the full name, keeping the boundary char.
    const at = upto.lastIndexOf("@");
    const next = `${value.slice(0, at)}@${person.name} ${value.slice(caret)}`;

    onChange(next);
    setMentionQuery(null);

    const ids = mentionIds.includes(person.id) ? mentionIds : [...mentionIds, person.id];
    setMentionIds(ids);
    onMentionsChange?.(ids);

    requestAnimationFrame(() => {
      const caretAfter = at + person.name.length + 2;
      element?.focus();
      element?.setSelectionRange(caretAfter, caretAfter);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveMention((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveMention((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(suggestions[activeMention]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Familiar shortcuts, so the toolbar is optional rather than required.
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        surround("**", "**", "bold");
      } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        surround("_", "_", "italic");
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        surround("[", "](https://)", "label");
      }
    }
  }

  return (
    <div className={cn("rounded-lg border border-border bg-surface", className)}>
      {/* Hidden field: what the server reads. The textarea itself is uncontrolled
          from the form's point of view so the toolbar can rewrite it freely. */}
      <input type="hidden" name={name} value={value} />
      {mentionsOn ? <input type="hidden" name="mentionIds" value={mentionIds.join(",")} /> : null}

      <div className="flex items-center justify-between gap-2 border-b border-border px-1.5 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          <ToolButton label="Bold" hint="⌘B" onClick={() => surround("**", "**", "bold")}>
            <Bold />
          </ToolButton>
          <ToolButton label="Italic" hint="⌘I" onClick={() => surround("_", "_", "italic")}>
            <Italic />
          </ToolButton>
          <ToolButton label="Heading" onClick={() => prefixLines("## ")}>
            <Type />
          </ToolButton>

          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />

          <ToolButton label="Bulleted list" onClick={() => prefixLines("- ")}>
            <List />
          </ToolButton>
          <ToolButton
            label="Numbered list"
            onClick={() => prefixLines((index) => `${index + 1}. `)}
          >
            <ListOrdered />
          </ToolButton>
          <ToolButton label="Quote" onClick={() => prefixLines("> ")}>
            <Quote />
          </ToolButton>

          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />

          <ToolButton label="Code" onClick={() => surround("`", "`", "code")}>
            <Code />
          </ToolButton>
          <ToolButton label="Link" hint="⌘K" onClick={() => surround("[", "](https://)", "label")}>
            <Link2 />
          </ToolButton>
          {mentionsOn ? (
            <ToolButton
              label="Mention someone"
              onClick={() => {
                const { before, after } = segment();
                onChange(`${before}@${after}`);
                setMentionQuery("");
                requestAnimationFrame(() => textarea.current?.focus());
              }}
            >
              <AtSign />
            </ToolButton>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center rounded-md bg-surface-inset p-0.5">
          {(["write", "preview"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTab(mode)}
              aria-pressed={tab === mode}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium transition-colors",
                tab === mode
                  ? "bg-surface text-fg shadow-xs"
                  : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {mode === "write" ? (
                <Pencil className="size-3" aria-hidden="true" />
              ) : (
                <Eye className="size-3" aria-hidden="true" />
              )}
              {mode === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      {tab === "write" ? (
        <div className="relative">
          <Textarea
            ref={textarea}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Let a click on a suggestion land before the list unmounts.
              setTimeout(() => setMentionQuery(null), 120);
            }}
            rows={rows}
            autosize
            maxLength={maxLength}
            required={required}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-autocomplete={mentionsOn ? "list" : undefined}
            aria-controls={mentionQuery !== null ? listboxId : undefined}
            aria-expanded={mentionsOn ? mentionQuery !== null : undefined}
            className="rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />

          {suggestions.length > 0 ? (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="People you can mention"
              className="absolute bottom-2 left-2 z-20 w-[min(20rem,calc(100%-1rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
            >
              {suggestions.map((person, index) => (
                <li key={person.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeMention}
                    onMouseDown={(event) => {
                      // mousedown, not click: blur would close the list first.
                      event.preventDefault();
                      insertMention(person);
                    }}
                    onMouseEnter={() => setActiveMention(index)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
                      index === activeMention ? "bg-accent-soft" : "hover:bg-surface-hover",
                    )}
                  >
                    <Avatar
                      name={person.name}
                      seed={person.id}
                      src={person.avatarUrl}
                      size="xs"
                      className="shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-fg">
                        {person.name}
                      </span>
                      {person.designation ? (
                        <span className="block truncate text-[10.5px] text-fg-subtle">
                          {person.designation}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="min-h-[6rem] px-3.5 py-3">
          {value.trim() ? (
            <MarkdownView source={value} />
          ) : (
            <p className="text-[13px] text-fg-subtle">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5">
        <p className="text-[10.5px] text-fg-subtle">
          Markdown supported{mentionsOn ? " · type @ to mention someone" : ""}
        </p>
        {maxLength ? (
          <p
            className={cn(
              "text-[10.5px] tabular-nums",
              value.length > maxLength * 0.92 ? "text-warning-text" : "text-fg-subtle",
            )}
          >
            {value.length.toLocaleString()} / {maxLength.toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      className="grid size-7 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&>svg]:size-3.5"
    >
      {children}
    </button>
  );
}
