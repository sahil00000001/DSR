"use client";

import { useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendSummaryNowAction } from "@/server/actions/messaging";

/**
 * "Send it to me now."
 *
 * Exists because the whole feature is invisible until a message actually arrives on
 * somebody's phone. Being able to press this and see the WhatsApp land is the difference
 * between believing the integration works and hoping it does at 6pm.
 *
 * The toast reports whether the send was **free or billable**, because that is the thing
 * the client asked about and it should not be a mystery: free means a service window was
 * open, billable means a template went out at roughly ₹0.14.
 */
export function SendSummaryButton({ configured }: { configured: boolean }) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const result = await sendSummaryNowAction();

      if (result.ok) {
        toast.success(
          "Summary sent",
          result.via === "text"
            ? `Free — a reply window was open. ${result.counts.open} open orders.`
            : `Sent as a template (~₹0.14) because no reply window was open. ${result.counts.open} open orders.`,
        );
      } else {
        toast.error("Couldn't send the summary", result.message);
      }
    });
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={send}
      loading={isPending}
      disabled={!configured}
      title={
        configured
          ? "Send the order summary to WhatsApp now"
          : "WhatsApp is not configured on this deployment"
      }
    >
      <Send className="size-4" />
      Send summary
    </Button>
  );
}
