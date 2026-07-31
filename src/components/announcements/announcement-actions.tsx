"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { DropdownMenu, MenuItem } from "@/components/ui/dropdown-menu";
import { usePopover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { deleteAnnouncementAction, togglePinAction } from "@/server/actions/announcements";

/** Author/admin controls on a posted announcement. */
export function AnnouncementActions({
  id,
  pinned,
  title,
}: {
  id: string;
  pinned: boolean;
  title: string;
}) {
  const { triggerProps, panelProps, close } = usePopover({ role: "menu" });
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const togglePin = () => {
    close();
    startTransition(async () => {
      const response = await togglePinAction(id);
      if (response.ok) {
        toast.success(response.message ?? "Updated");
        router.refresh();
      } else {
        toast.error("Couldn't update", response.message);
      }
    });
  };

  const remove = async () => {
    close();
    const result = await confirm({
      title: "Delete this announcement?",
      description: `“${title}” will be removed for everyone. Notifications already sent are not recalled.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await deleteAnnouncementAction(id);
      if (response.ok) {
        toast.success(response.message ?? "Deleted");
        router.refresh();
      } else {
        toast.error("Couldn't delete", response.message);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={`Actions for ${title}`}
        className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <MoreHorizontal className="size-4" />
      </button>

      <DropdownMenu {...panelProps} align="end">
        <MenuItem onClick={togglePin} disabled={isPending}>
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? "Unpin" : "Pin to top"}
        </MenuItem>
        <MenuItem tone="danger" onClick={remove} disabled={isPending}>
          <Trash2 />
          Delete
        </MenuItem>
      </DropdownMenu>
    </>
  );
}
