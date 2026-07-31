"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileText,
  ImagePlus,
  IndianRupee,
  Save,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { RadioCard } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { saveExpenseClaimAction } from "@/server/actions/expenses";
import { IDLE } from "@/server/actions/form-state";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_HINT,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/constants/enums";
import { todayKey } from "@/lib/utils/date";
import { formatBytes, formatMoney, parseMoneyToMinor } from "@/lib/utils/format";

/** Kept in step with MAX_RECEIPT_BYTES / MAX_CLAIM_MINOR on the server. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_CLAIM_MINOR = 50_000_000;

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

interface Preview {
  key: string;
  name: string;
  size: number;
  type: string;
  /** Object URL for images; null for PDFs. Revoked on unmount. */
  src: string | null;
}

/**
 * File a claim.
 *
 * Two things here are deliberate rather than decorative:
 *
 *  • **The amount is echoed back formatted** as you type. `parseMoneyToMinor` is the
 *    *same function the server uses*, so what you see is exactly what will be stored —
 *    a form that accepts "1,2 50" and silently files ₹12.50 is how expense tools lose
 *    people's trust.
 *  • **Receipts are previewed before submitting**, because the single most common
 *    mistake is attaching a photo of the wrong bill, and nobody spots that from a
 *    filename.
 *
 * File constraints are checked here for fast feedback and *again* on the server
 * against the real bytes — the `accept` attribute is a file-picker convenience, not
 * a control.
 */
export function ExpenseForm({
  approverNames,
  storageReady,
}: {
  approverNames: string[];
  storageReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(saveExpenseClaimAction, IDLE);

  const [category, setCategory] = useState<ExpenseCategory>("TRAVEL");
  const [amount, setAmount] = useState("");
  const [intent, setIntent] = useState<"DRAFT" | "SUBMITTED">("SUBMITTED");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  /** The authoritative list; the input's own FileList can't be spliced. */
  const files = useRef<File[]>([]);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(intent === "DRAFT" ? "Draft saved" : "Claim submitted", state.message);
      const id = (state.data as { id?: string } | undefined)?.id;
      router.push(id ? `/expenses/${id}` : "/expenses");
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't file the claim", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * Object URLs are a leak if they outlive the component.
   *
   * The set is appended to in `addFiles` (an event handler) rather than during
   * render, and the cleanup runs once on unmount. Keying the effect on `previews`
   * instead would revoke every URL on each change — including the ones still on
   * screen. Revoking twice is a no-op, so removals can revoke eagerly as well.
   */
  const createdUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of createdUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const minor = useMemo(() => parseMoneyToMinor(amount), [amount]);
  const amountTooLarge = minor !== null && minor > MAX_CLAIM_MINOR;
  const amountUnreadable = amount.trim().length > 0 && minor === null;

  function syncInput() {
    // Write the trimmed list back so the form posts exactly what's on screen.
    const transfer = new DataTransfer();
    for (const file of files.current) transfer.items.add(file);
    if (fileInput.current) fileInput.current.files = transfer.files;
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return;
    setFileError(null);

    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (files.current.length + accepted.length >= MAX_FILES) {
        setFileError(`Attach at most ${MAX_FILES} receipts to one claim.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError(`${file.name} is ${formatBytes(file.size)} — the limit is 8 MB per receipt.`);
        continue;
      }
      if (!ACCEPT.split(",").includes(file.type)) {
        setFileError(`${file.name} isn't a photo or PDF.`);
        continue;
      }
      // Same name + size twice is a double-tap on the picker, not two bills.
      if (files.current.some((existing) => existing.name === file.name && existing.size === file.size)) {
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      syncInput();
      return;
    }

    const added = accepted.map((file) => {
      const src = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      if (src) createdUrls.current.push(src);
      return {
        key: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type,
        src,
      };
    });

    files.current = [...files.current, ...accepted];
    setPreviews((previous) => [...previous, ...added]);
    syncInput();
  }

  function removeFile(key: string) {
    const index = previews.findIndex((preview) => preview.key === key);
    if (index === -1) return;

    const removed = previews[index];
    if (removed?.src) URL.revokeObjectURL(removed.src);

    // Both lists are index-aligned, so drop the same position from each.
    files.current = files.current.filter((_, position) => position !== index);
    setPreviews(previews.filter((_, position) => position !== index));
    setFileError(null);
    syncInput();
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="intent" value={intent} />

      <Card>
        <CardHeader>
          <CardTitle>What are you claiming for?</CardTitle>
          <CardDescription>
            Write it the way you&apos;d explain it to someone who wasn&apos;t there.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Field
            label="Title"
            required
            hint="A short line an admin can scan in a queue."
            error={state.fieldErrors?.title}
          >
            <Input
              name="title"
              required
              maxLength={140}
              placeholder="Taxi to the Ludhiana dealer for a fan-motor complaint"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Description"
            required
            hint="Why it was needed, and anything that justifies the amount."
            error={state.fieldErrors?.description}
          >
            <Textarea
              name="description"
              rows={4}
              autosize
              required
              maxLength={4000}
              placeholder="Went out to inspect a returned table-fan motor at Sharma Electricals. Took an auto both ways as the service van was at the plant."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How much, and when?</CardTitle>
          <CardDescription>Enter the amount exactly as it appears on the bill.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount"
              required
              error={state.fieldErrors?.amount ?? (amountUnreadable ? "Enter a number like 1250 or 1250.50." : undefined)}
            >
              <Input
                name="amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="1250.00"
                icon={<IndianRupee />}
                suffix={
                  minor !== null && minor > 0 ? (
                    <span className="text-[11.5px] tabular-nums text-fg-subtle">
                      {formatMoney(minor)}
                    </span>
                  ) : undefined
                }
              />
            </Field>

            <Field label="Date on the bill" required error={state.fieldErrors?.expenseDate}>
              <Input name="expenseDate" type="date" max={todayKey()} defaultValue={todayKey()} required />
            </Field>
          </div>

          {amountTooLarge ? (
            <p role="alert" className="flex items-start gap-2 text-[12.5px] text-danger-text">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Claims above {formatMoney(MAX_CLAIM_MINOR)} go through finance directly — check the
              decimal point.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Paid to"
              optional
              hint="Shop, vendor or transporter."
              error={state.fieldErrors?.vendor}
            >
              <Input name="vendor" maxLength={140} placeholder="Sharma Electricals" autoComplete="off" />
            </Field>
            <Field
              label="Bill / reference no."
              optional
              hint="Helps finance match it to the paperwork."
              error={state.fieldErrors?.referenceNo}
            >
              <Input name="referenceNo" maxLength={60} placeholder="INV-2291" autoComplete="off" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category</CardTitle>
          <CardDescription>
            Used for the spend breakdown, so pick the closest fit rather than “Other”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Expense category</legend>
            {EXPENSE_CATEGORIES.map((option) => (
              <RadioCard
                key={option}
                name="category-display"
                value={option}
                checked={category === option}
                onChange={() => setCategory(option)}
                label={EXPENSE_CATEGORY_LABEL[option]}
                description={EXPENSE_CATEGORY_HINT[option]}
              />
            ))}
          </fieldset>
          {state.fieldErrors?.category ? (
            <p role="alert" className="mt-2 text-[12.5px] text-danger-text">
              {state.fieldErrors.category}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Receipts
            <Badge tone={previews.length > 0 ? "accent" : "neutral"} variant="outline" size="sm">
              {previews.length} of {MAX_FILES}
            </Badge>
          </CardTitle>
          <CardDescription>
            {storageReady
              ? "A photo of the bill is enough. JPG, PNG, WebP, HEIC or PDF, up to 8 MB each."
              : "Receipt storage isn't configured on this deployment — you can still file the claim."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            name="receipts"
            accept={ACCEPT}
            multiple
            disabled={!storageReady}
            onChange={(event) => addFiles(event.target.files)}
            className="sr-only"
            id="receipts-input"
          />

          <label
            htmlFor="receipts-input"
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
              storageReady
                ? "border-border hover:border-accent/50 hover:bg-accent-soft/30"
                : "cursor-not-allowed border-border bg-surface-inset opacity-60",
            )}
          >
            <ImagePlus className="size-5 text-fg-subtle" aria-hidden="true" />
            <span className="text-[13px] font-medium text-fg">
              {previews.length > 0 ? "Add another receipt" : "Attach a receipt"}
            </span>
            <span className="text-[11.5px] text-fg-subtle">
              Take a photo, or choose a file from this device
            </span>
          </label>

          {fileError ? (
            <p role="alert" className="flex items-start gap-2 text-[12.5px] text-danger-text">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {fileError}
            </p>
          ) : null}

          {previews.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {previews.map((preview) => (
                <li
                  key={preview.key}
                  className="relative overflow-hidden rounded-lg border border-border bg-surface-inset"
                >
                  <span className="grid aspect-4/3 place-items-center overflow-hidden">
                    {preview.src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                      <img
                        src={preview.src}
                        alt={preview.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex flex-col items-center gap-1.5 text-fg-muted">
                        <FileText className="size-6" aria-hidden="true" />
                        <span className="text-[10.5px] font-medium tracking-wide uppercase">
                          PDF
                        </span>
                      </span>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeFile(preview.key)}
                    className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-surface/90 text-fg-muted backdrop-blur-sm transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    aria-label={`Remove ${preview.name}`}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>

                  <span className="block border-t border-border px-2 py-1.5">
                    <span className="block truncate text-[11.5px] font-medium text-fg">
                      {preview.name}
                    </span>
                    <span className="block text-[10.5px] text-fg-subtle">
                      {formatBytes(preview.size)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {state.ok === false && state.message && !state.fieldErrors ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[12.5px] leading-[18px] text-danger-text">{state.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-fg-subtle">
          {approverNames.length > 0
            ? `${approverNames.join(", ")} ${approverNames.length === 1 ? "decides" : "decide"} on claims.`
            : "An admin will decide on this claim."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="secondary"
            loading={pending && intent === "DRAFT"}
            disabled={pending || amountTooLarge}
            onClick={() => setIntent("DRAFT")}
          >
            <Save className="size-4" />
            Save draft
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={pending && intent === "SUBMITTED"}
            disabled={pending || amountTooLarge || amountUnreadable}
            onClick={() => setIntent("SUBMITTED")}
          >
            <Send className="size-4" />
            Submit claim
          </Button>
        </div>
      </div>
    </form>
  );
}
