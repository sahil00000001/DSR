"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { reviewDsrAction } from "@/server/actions/dsr";
import { IDLE } from "@/server/actions/form-state";
import { DSR_STATUS_LABEL, type DsrStatus } from "@/lib/constants/enums";

/**
 * Reviewer controls on a single report.
 *
 * Two verbs, one optional note. "Needs attention" requires the note — telling
 * someone their report is wrong without saying why just creates a second
 * conversation, so the server enforces it and the field is labelled accordingly.
 */
export function ReviewActions({
  reportId,
  currentStatus,
  authorName,
}: {
  reportId: string;
  currentStatus: DsrStatus;
  authorName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(reviewDsrAction, IDLE);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Review saved");
      router.refresh();
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't save the review", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const alreadyReviewed = currentStatus === "REVIEWED" || currentStatus === "FLAGGED";

  return (
    <Card data-print="hide">
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription>
          {alreadyReviewed
            ? `Currently marked “${DSR_STATUS_LABEL[currentStatus]}”. You can change it.`
            : `Let ${authorName.split(" ")[0]} know you've read this.`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={action} className="space-y-3.5">
          <input type="hidden" name="id" value={reportId} />

          <Field
            label="Note"
            optional
            hint="Required when flagging. The author receives it by email and in-app."
            error={state.fieldErrors?.comment}
          >
            <Textarea
              name="comment"
              rows={3}
              autosize
              placeholder={`Nice work on the importer — could you add the ticket numbers next time?`}
            />
          </Field>

          {state.ok === false && state.message && !state.fieldErrors ? (
            <p role="alert" className="text-[12.5px] text-danger-text">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="status"
              value="REVIEWED"
              variant="primary"
              size="sm"
              loading={pending}
            >
              <CheckCheck className="size-4" />
              Mark reviewed
            </Button>
            <Button
              type="submit"
              name="status"
              value="FLAGGED"
              variant="secondary"
              size="sm"
              disabled={pending}
            >
              <Flag className="size-4" />
              Needs attention
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
