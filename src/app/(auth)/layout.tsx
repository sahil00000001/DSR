import { CalendarCheck, ClipboardCheck, LineChart, Plane } from "lucide-react";
import { BrandLockup } from "@/components/layout/brand";

const HIGHLIGHTS = [
  {
    icon: ClipboardCheck,
    title: "Daily status reports",
    body: "Two minutes to write, one screen to review the whole team.",
  },
  {
    icon: CalendarCheck,
    title: "Attendance that keeps itself",
    body: "Present, WFH, half day — with a month at a glance.",
  },
  {
    icon: Plane,
    title: "Leave without the chasing",
    body: "Balances update themselves; approvals take one click.",
  },
  {
    icon: LineChart,
    title: "Answers, not spreadsheets",
    body: "Trends, completion rates and department insights, live.",
  },
];

/**
 * Split layout for the unauthenticated screens.
 *
 * The marketing panel is desktop-only and `aria-hidden`: it's decorative
 * reinforcement, and reading four feature blurbs before reaching the password
 * field is a poor experience on a screen reader. Mobile drops it entirely so the
 * form is the first and only thing on the page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      {/* Left: brand panel */}
      <div
        aria-hidden="true"
        className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <div className="grid-backdrop absolute inset-0 opacity-[0.35]" />
        {/* Two soft accent washes give the panel depth without an image asset. */}
        <div className="absolute -top-24 -left-16 size-[26rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-[22rem] rounded-full bg-[var(--cat-violet)]/10 blur-3xl" />

        <div className="relative">
          <BrandLockup href="/login" />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[26px] leading-8 font-semibold tracking-[-0.025em] text-fg">
            The operating rhythm
            <br />
            for your team.
          </h2>
          <p className="mt-3 text-[14px] leading-6 text-fg-muted">
            Cadence keeps the daily details — reports, attendance, leave — in one place, so the
            people running the team can spend their time on the work instead of the paperwork.
          </p>

          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight.title} className="flex gap-3.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-accent shadow-xs">
                  <highlight.icon className="size-[15px]" />
                </span>
                <span>
                  <span className="block text-[13.5px] font-medium text-fg">{highlight.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-5 text-fg-subtle">
                    {highlight.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11.5px] text-fg-subtle">
          © {new Date().getFullYear()} Cadence · Team operations portal
        </p>
      </div>

      {/* Right: the form */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-[24rem]">
          <div className="mb-8 lg:hidden">
            <BrandLockup href="/login" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
