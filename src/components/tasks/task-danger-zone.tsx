"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { deleteTaskAction } from "@/server/actions/tasks";

/**
 * Deleting a task.
 *
 * Deliberately the only irreversible control on the page, in its own card, below
 * everything else. The confirmation says what actually goes — updates, timeline and
 * files — because "are you sure?" without consequences is a dialog people click
 * through.
 */
export function TaskDangerZone({
  taskId,
  taskNumber,
  title,
}: {
  taskId: string;
  taskNumber: string;
  title: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  async function remove() {
    const result = await confirm({
      title: `Delete ${taskNumber}?`,
      description: `“${title}” and everything on it — every update, the whole timeline and all attached files — is removed permanently. This cannot be undone. If the work simply is not happening, marking it complete or blocked keeps the record.`,
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await deleteTaskAction(taskId);
      if (response.ok) {
        toast.success(response.message ?? "Task deleted");
        router.push("/tasks");
      } else {
        toast.error("Couldn't delete the task", response.message);
      }
    });
  }

  return (
    <Card className="border-danger/25">
      <CardHeader>
        <CardTitle className="text-danger-text">Delete this task</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-[12px] leading-[17px] text-fg-muted">
          Removes the task, its updates, its timeline and its files. Consider marking it
          complete or blocked instead — both keep the history.
        </p>
        <Button variant="danger" size="sm" block loading={isPending} onClick={remove}>
          <Trash2 className="size-4" />
          Delete {taskNumber}
        </Button>
      </CardContent>
    </Card>
  );
}
