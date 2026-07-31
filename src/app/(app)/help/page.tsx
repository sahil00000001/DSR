import type { Metadata } from "next";
import Link from "next/link";
import { Command, Keyboard, LifeBuoy, Mail, Shield } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { ROLE_DESCRIPTION, ROLES, ROLE_LABEL } from "@/lib/constants/enums";

export const metadata: Metadata = {
  title: "Help & shortcuts",
  description: "Keyboard shortcuts and how Cadence works.",
};

const SHORTCUTS = [
  { keys: ["⌘", "K"], alt: ["Ctrl", "K"], action: "Open the command palette" },
  { keys: ["/"], action: "Search from anywhere" },
  { keys: ["⌘", "↵"], alt: ["Ctrl", "↵"], action: "Submit a status report while writing" },
  { keys: ["Esc"], action: "Close a dialog, menu or the palette" },
  { keys: ["Tab"], action: "Move through a form; focus never leaves an open dialog" },
  { keys: ["↑", "↓"], action: "Move through menus and palette results" },
  { keys: ["Space"], action: "Toggle a checkbox or switch" },
];

const FAQ = [
  {
    question: "Why does my leave request cost fewer days than the dates suggest?",
    answer:
      "Leave is measured in working days. Weekends and public holidays are never counted or deducted, so a Friday-to-Monday request costs two days, not four. The form shows the exact figure before you submit.",
  },
  {
    question: "I submitted a report but attendance still shows nothing.",
    answer:
      "Submitting a report marks that day present automatically — unless a record already exists. If an admin has corrected the day, or it's covered by approved leave, that record wins and isn't overwritten.",
  },
  {
    question: "Why can't I edit a report from last month?",
    answer:
      "Reports can be filed for the last 30 days. Anything older needs an admin, which keeps historical completion figures meaningful. A report that's already been reviewed is also locked.",
  },
  {
    question: "Can I approve my own leave?",
    answer:
      "No — at any role, including admin. The separation matters more than the convenience, and the server refuses it rather than just hiding the button.",
  },
  {
    question: "What happens to someone's data when they leave?",
    answer:
      "Disable the account rather than deleting it. They're signed out everywhere immediately and can't sign back in, while their reports, attendance and leave history stay intact for reporting.",
  },
  {
    question: "Where did my draft go when the connection dropped?",
    answer:
      "Report drafts are saved to your browser as you type, keyed by date. Reopen the same day and you'll be offered what you had written.",
  },
];

export default async function HelpPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Help & shortcuts"
        description="How Cadence works, and how to move through it quickly."
      />

      <div className="max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="size-3.5 text-fg-subtle" aria-hidden="true" />
              Keyboard shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {SHORTCUTS.map((shortcut) => (
                <li
                  key={shortcut.action}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-[13px] text-fg-muted">{shortcut.action}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                    {shortcut.alt ? (
                      <>
                        <span className="px-1 text-[10.5px] text-fg-subtle">or</span>
                        {shortcut.alt.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Command className="size-3.5 text-fg-subtle" aria-hidden="true" />
              The command palette
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] leading-6 text-fg-muted">
            <p>
              Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> anywhere to search people, status reports, departments
              and leave requests at once — or to jump straight to a screen without navigating.
            </p>
            <p>
              Results are scoped to what you&apos;re allowed to see, so searching never surfaces a
              colleague&apos;s report you don&apos;t have access to.
            </p>
          </CardContent>
        </Card>

        <SectionHeader title="Access levels" description="What each role can do." className="mt-2 mb-0" />

        <Card>
          <CardContent className="pt-4">
            <dl className="space-y-3.5">
              {ROLES.map((role) => (
                <div key={role} className="flex gap-3">
                  <dt className="w-20 shrink-0">
                    <span
                      className={
                        role === user.role
                          ? "text-[12.5px] font-semibold text-accent"
                          : "text-[12.5px] font-semibold text-fg"
                      }
                    >
                      {ROLE_LABEL[role]}
                      {role === user.role ? " (you)" : ""}
                    </span>
                  </dt>
                  <dd className="text-[12.5px] leading-5 text-fg-muted">
                    {ROLE_DESCRIPTION[role]}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <SectionHeader title="Common questions" className="mt-2 mb-0" />

        <Card>
          <CardContent className="pt-4">
            <div className="divide-y divide-border">
              {FAQ.map((entry) => (
                <details key={entry.question} className="group py-3 first:pt-0 last:pb-0">
                  <summary className="cursor-pointer list-none text-[13px] font-medium text-fg marker:hidden">
                    <span className="flex items-start gap-2">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fg-subtle transition-colors group-open:bg-accent"
                        aria-hidden="true"
                      />
                      {entry.question}
                    </span>
                  </summary>
                  <p className="mt-2 pl-3.5 text-[12.5px] leading-6 text-fg-muted">{entry.answer}</p>
                </details>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-3.5 text-fg-subtle" aria-hidden="true" />
              Privacy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[12.5px] leading-6 text-fg-muted">
            <p>
              Your manager and admins can read your status reports, attendance and leave. Colleagues
              can see the directory — name, team, designation and work contact details — but not each
              other&apos;s reports or leave.
            </p>
            <p>
              Phone numbers and dates of birth are only shown to you, your management line and
              admins.
            </p>
            <p>
              Every administrative change is recorded in the audit log with who made it and when.
              Passwords and tokens are never written there.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-2.5">
              <LifeBuoy className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <p className="text-[12.5px] text-fg-muted">
                Something not working the way you expect?
              </p>
            </div>
            <Link
              href="/announcements"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent underline-offset-2 hover:underline"
            >
              <Mail className="size-3.5" />
              Ask in announcements
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
