"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, SendHorizontal, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addExpenseCommentAction } from "@/server/actions/expenses";
import { IDLE } from "@/server/actions/form-state";
import { formatRelative } from "@/lib/utils/date";
import type { ExpenseCommentDto } from "@/lib/services/expenses";

/**
 * The conversation on a claim.
 *
 * This is the part that makes the module feel joined-up rather than a form plus a
 * verdict: an admin can ask "which vehicle was this fuel for?" and get an answer
 * without anyone re-filing anything. Comments post optimistically so the reply
 * appears the moment it's sent — a round trip to Mumbai is ~200 ms and a chat box
 * that stalls for that long feels broken.
 */
export function ExpenseThread({
  claimId,
  comments,
  viewer,
  claimantId,
}: {
  claimId: string;
  comments: ExpenseCommentDto[];
  viewer: { id: string; name: string; avatarUrl: string | null; role: string };
  claimantId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(addExpenseCommentAction, IDLE);
  const [draft, setDraft] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [optimistic, addOptimistic] = useOptimistic(
    comments,
    (current, body: string) => [
      ...current,
      {
        id: `pending-${current.length}`,
        body,
        createdAt: new Date(),
        author: {
          id: viewer.id,
          name: viewer.name,
          avatarUrl: viewer.avatarUrl,
          role: viewer.role,
        },
      },
    ],
  );

  /**
   * The box is cleared in the submit handler, not here, so it empties at the same
   * moment the optimistic message appears. If the post fails, the text is put back
   * from `lastSent` — losing what someone typed is a worse failure than the error
   * itself.
   */
  const lastSent = useRef("");

  useEffect(() => {
    if (state.ok === true) router.refresh();
    else if (state.ok === false && state.message) {
      toast.error("Couldn't post that", state.message);
      setDraft(lastSent.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="space-y-4">
      {optimistic.length > 0 ? (
        <ul className="space-y-3.5">
          {optimistic.map((comment) => {
            const isViewer = comment.author.id === viewer.id;
            const isClaimant = comment.author.id === claimantId;
            const pendingRow = comment.id.startsWith("pending-");

            return (
              <li
                key={comment.id}
                className={cn("flex gap-2.5", pendingRow && "opacity-60")}
              >
                <Avatar
                  name={comment.author.name}
                  seed={comment.author.id}
                  src={comment.author.avatarUrl}
                  size="sm"
                  className="mt-0.5 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12.5px] font-medium text-fg">
                      {isViewer ? "You" : comment.author.name}
                    </span>
                    {!isClaimant ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">
                        <ShieldCheck className="size-2.5" aria-hidden="true" />
                        Reviewer
                      </span>
                    ) : null}
                    <span className="text-[11px] text-fg-subtle">
                      {pendingRow ? "Sending…" : formatRelative(comment.createdAt)}
                    </span>
                  </p>

                  <div
                    className={cn(
                      "mt-1 rounded-lg rounded-tl-sm border px-3 py-2 text-[13px] leading-[19px] whitespace-pre-wrap",
                      isClaimant
                        ? "border-border bg-surface-inset text-fg-muted"
                        : "border-accent/20 bg-accent-soft/40 text-fg",
                    )}
                  >
                    {comment.body}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[12.5px] leading-[18px] text-fg-muted">
          <MessageSquare className="mt-px size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
          No messages yet. Use this to ask or explain anything about the claim — both sides
          get a notification.
        </p>
      )}

      <form
        ref={formRef}
        action={(formData) => {
          const body = String(formData.get("body") ?? "").trim();
          if (!body) return;
          lastSent.current = body;
          setDraft("");
          addOptimistic(body);
          action(formData);
        }}
        className="space-y-2"
      >
        <input type="hidden" name="claimId" value={claimId} />

        <Textarea
          name="body"
          rows={2}
          autosize
          maxLength={2000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // ⌘/Ctrl+Enter sends, matching every other composer in the app.
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="Add a note, or answer a question about this claim…"
          aria-label="Add a comment"
        />

        {state.fieldErrors?.body ? (
          <p role="alert" className="text-[12.5px] text-danger-text">
            {state.fieldErrors.body}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-fg-subtle">⌘↵ to send</span>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            loading={pending}
            disabled={draft.trim().length < 2}
          >
            <SendHorizontal className="size-3.5" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
