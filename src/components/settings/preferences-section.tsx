"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { ThemePicker } from "@/components/theme/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/components/theme/theme-provider";
import { updatePreferencesAction } from "@/server/actions/settings";
import { IDLE } from "@/server/actions/form-state";

/**
 * Appearance and notification preferences.
 *
 * The theme control writes a cookie immediately (so the change is instant) *and*
 * posts to the server on save, which is what carries the preference to a new
 * device. Two stores, one deliberate reason: the cookie is for this browser, the
 * column is for the account.
 */
export function PreferencesSection({
  defaults,
  emailEnabled,
}: {
  defaults: {
    theme: string;
    notifyByEmail: boolean;
    dsrReminderOptOut: boolean;
    emailDigestOnly: boolean;
  };
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { theme } = useTheme();
  const [state, action, pending] = useActionState(updatePreferencesAction, IDLE);

  const [notifyByEmail, setNotifyByEmail] = useState(defaults.notifyByEmail);
  const [remindersOff, setRemindersOff] = useState(defaults.dsrReminderOptOut);
  const [digestOnly, setDigestOnly] = useState(defaults.emailDigestOnly);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Preferences saved");
      router.refresh();
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't save your preferences", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card>
      <form action={action} noValidate>
        {/* The live theme is submitted, so what you see is what gets stored. */}
        <input type="hidden" name="theme" value={theme} />
        {notifyByEmail ? <input type="hidden" name="notifyByEmail" value="true" /> : null}
        {remindersOff ? <input type="hidden" name="dsrReminderOptOut" value="true" /> : null}
        {digestOnly ? <input type="hidden" name="emailDigestOnly" value="true" /> : null}

        <CardHeader>
          <CardTitle>Appearance &amp; notifications</CardTitle>
          <CardDescription>
            Theme applies to this device instantly and follows you to new ones.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <Field label="Colour theme">
            <ThemePicker />
          </Field>

          <div className="space-y-4 border-t border-border pt-4">
            <Switch
              checked={notifyByEmail}
              onChange={(event) => setNotifyByEmail(event.target.checked)}
              disabled={!emailEnabled}
              label="Email notifications"
              description={
                emailEnabled
                  ? "Leave decisions, report reviews and announcements are emailed as well as shown in-app."
                  : "Email isn't configured on this deployment, so notifications are in-app only."
              }
            />

            <Switch
              checked={!remindersOff}
              onChange={(event) => setRemindersOff(!event.target.checked)}
              label="Daily report reminders"
              description="A nudge late in the afternoon if your status report is still open."
            />

            {/* The answer to "I get too many emails from this thing". */}
            <Switch
              checked={digestOnly}
              onChange={(event) => setDigestOnly(event.target.checked)}
              disabled={!emailEnabled || !notifyByEmail}
              label="One email a day instead of many"
              description={
                digestOnly
                  ? "Leave requests, expense claims and task updates are collected into one end-of-day briefing. Anything urgent — an order about to miss its date, somebody blocked — still reaches you straight away."
                  : "Every request and update is emailed as it happens. Turn this on to receive one briefing at the end of the day instead."
              }
            />
          </div>
        </CardContent>

        <CardFooter>
          <p className="text-[11.5px] text-fg-subtle">
            You&apos;ll always see in-app notifications for things that need a decision,
            whichever email setting you choose.
          </p>
          <Button type="submit" variant="primary" size="sm" loading={pending}>
            <Save className="size-4" />
            Save preferences
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
