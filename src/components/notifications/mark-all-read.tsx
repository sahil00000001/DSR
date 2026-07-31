"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Marks every notification read.
 *
 * Calls the same endpoint the tray uses, then refreshes so the page, the tray and
 * the nav badge all reconcile from one server response instead of three
 * independently-optimistic client states.
 */
export function MarkAllReadButton() {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const markAll = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        if (!response.ok) throw new Error("Request failed");
        router.refresh();
      } catch {
        toast.error("Couldn't mark these as read", "Check your connection and try again.");
      }
    });
  };

  return (
    <Button variant="secondary" size="sm" onClick={markAll} loading={isPending}>
      <CheckCheck className="size-4" />
      Mark all read
    </Button>
  );
}
