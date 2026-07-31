import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  /** Meta row under the title — counts, last-updated, status chips. */
  meta?: React.ReactNode;
  /** Tab strip rendered flush to the header's bottom edge. */
  tabs?: React.ReactNode;
  className?: string;
}

/**
 * Consistent page masthead. Every screen uses it, which is a large part of why
 * the product reads as one application rather than a set of pages.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  tabs,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1 text-[12.5px] text-fg-subtle">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? (
                  <ChevronRight className="size-3 shrink-0 text-fg-subtle/70" aria-hidden="true" />
                ) : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded transition-colors hover:text-fg hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-fg-muted">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-fg sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13.5px] leading-5 text-fg-muted">{description}</p>
          ) : null}
          {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>

        {actions ? (
          <div
            data-print="hide"
            className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            {actions}
          </div>
        ) : null}
      </div>

      {tabs ? <div className="mt-5">{tabs}</div> : null}
    </header>
  );
}

/**
 * Section heading inside a page — one step down from PageHeader.
 */
export function SectionHeader({
  title,
  description,
  actions,
  className,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <Tag className="text-[15px] leading-6 font-semibold text-fg">{title}</Tag>
        {description ? (
          <p className="mt-0.5 text-[12.5px] leading-4 text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
