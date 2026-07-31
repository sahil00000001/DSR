"use client";

import { useEffect, useRef } from "react";
import { markTaskSeenAction } from "@/server/actions/tasks";

/**
 * Records that an assignee has actually opened the task.
 *
 * Renders nothing. It exists so the detail page can answer "has anyone read this?" —
 * which is what turns chasing a task from a guess into a question with an answer.
 *
 * Fire-and-forget on purpose: the action is idempotent, swallows its own errors, and
 * must never delay or break opening a task. The ref guards against the double-invoke
 * React performs in development.
 */
export function MarkSeen({ taskId }: { taskId: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void markTaskSeenAction(taskId);
  }, [taskId]);

  return null;
}
