"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "@/server/actions/settings";
import { IDLE } from "@/server/actions/form-state";
import { toDateInput } from "@/lib/utils/date";

/** Editable personal details. Organisational fields live with the admin actions. */
export function ProfileSection({
  defaults,
}: {
  defaults: {
    name: string;
    phone: string | null;
    designation: string | null;
    bio: string | null;
    dateOfBirth: Date | null;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(updateProfileAction, IDLE);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Profile updated");
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't save your profile", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card>
      <form action={action} noValidate>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>
            How you appear across the workspace — in reports, the directory and the calendar.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={state.fieldErrors?.name}>
            <Input name="name" defaultValue={defaults.name} required />
          </Field>

          <Field label="Designation" optional error={state.fieldErrors?.designation}>
            <Input
              name="designation"
              defaultValue={defaults.designation ?? ""}
              placeholder="Senior Engineer"
            />
          </Field>

          <Field label="Phone" optional error={state.fieldErrors?.phone}>
            <Input
              name="phone"
              type="tel"
              defaultValue={defaults.phone ?? ""}
              placeholder="+91 98765 43210"
            />
          </Field>

          <Field
            label="Date of birth"
            optional
            error={state.fieldErrors?.dateOfBirth}
            hint="Shows on the team calendar — the year is never displayed."
          >
            <Input name="dateOfBirth" type="date" defaultValue={toDateInput(defaults.dateOfBirth)} />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="About you"
              optional
              error={state.fieldErrors?.bio}
              hint="A line or two for your profile. Markdown supported."
            >
              <Textarea
                name="bio"
                rows={3}
                autosize
                defaultValue={defaults.bio ?? ""}
                placeholder="Working on billing and the public API. Usually online 10am–6pm IST."
              />
            </Field>
          </div>
        </CardContent>

        <CardFooter>
          <p className="text-[11.5px] text-fg-subtle">
            Changes are visible to the whole team immediately.
          </p>
          <Button type="submit" variant="primary" size="sm" loading={pending}>
            <Save className="size-4" />
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
