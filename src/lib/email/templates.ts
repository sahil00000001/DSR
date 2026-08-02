import "server-only";
import { env } from "@/lib/env";
import { escapeHtml, markdownToEmailHtml, markdownToText } from "@/lib/utils/markdown";
import { BRAND as COMPANY } from "@/lib/constants/brand";

/**
 * Transactional email templates.
 *
 * Written as table-based HTML with fully inline styles, which is not nostalgia —
 * it's the only markup Outlook (Word's rendering engine) and Gmail's class
 * stripping both handle reliably. Notably avoided: flexbox, grid, `<style>`
 * blocks for layout, background images, and web fonts.
 *
 * Every template also returns plain text. A text alternative measurably improves
 * deliverability and is what watch/terminal clients actually show.
 */

const BRAND = {
  name: COMPANY.name,
  accent: "#4f46e5",
  accentSoft: "#eef0ff",
  ink: "#0f1115",
  body: "#3f4756",
  muted: "#6b7280",
  border: "#e8e9ee",
  surface: "#ffffff",
  canvas: "#f6f7f9",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function appUrl(path = ""): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;
}

/** Table-based button — the only shape that renders in every major client. */
function button(label: string, href: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${BRAND.accent}" style="border-radius:8px;">
      <a href="${escapeHtml(href)}"
         style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:14px;font-weight:600;
                color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Key/value block used for leave dates, DSR metadata, and so on. */
function detailRows(rows: Array<[string, string]>): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin:20px 0;border:1px solid ${BRAND.border};border-radius:10px;background:${BRAND.canvas};">
  ${rows
    .map(
      ([label, value], index) => `
  <tr>
    <td style="padding:${index === 0 ? "12px" : "8px"} 16px ${
      index === rows.length - 1 ? "12px" : "8px"
    };font-family:${FONT};font-size:13px;color:${BRAND.muted};width:38%;">${escapeHtml(label)}</td>
    <td style="padding:${index === 0 ? "12px" : "8px"} 16px ${
      index === rows.length - 1 ? "12px" : "8px"
    };font-family:${FONT};font-size:13px;color:${BRAND.ink};font-weight:600;">${value}</td>
  </tr>`,
    )
    .join("")}
</table>`;
}

function statusPill(label: string, tone: "success" | "danger" | "warning" | "info"): string {
  const palette = {
    success: { bg: "#ecfdf5", fg: "#047857" },
    danger: { bg: "#fef2f2", fg: "#b91c1c" },
    warning: { bg: "#fffbeb", fg: "#b45309" },
    info: { bg: "#eff6ff", fg: "#1d4ed8" },
  }[tone];

  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${palette.bg};
    color:${palette.fg};font-family:${FONT};font-size:12px;font-weight:600;">${escapeHtml(label)}</span>`;
}

/**
 * Shell shared by every message.
 *
 * `preheader` is the snippet shown next to the subject in an inbox list. It is
 * hidden in the body with the standard zero-height + whitespace trick, then
 * padded so the client doesn't pull the following content into the preview.
 */
function layout({
  preheader,
  heading,
  body,
  footerNote,
}: {
  preheader: string;
  heading: string;
  body: string;
  footerNote?: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};">
<div style="display:none;font-size:1px;color:${BRAND.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.canvas};">
  <tr>
    <td align="center" style="padding:32px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <!-- Wordmark -->
        <tr>
          <td style="padding:0 4px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:9px;">
                  <div style="width:26px;height:26px;border-radius:7px;background:${BRAND.accent};
                              font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;
                              text-align:center;line-height:26px;">C</div>
                </td>
                <td style="font-family:${FONT};font-size:15px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.01em;">
                  ${BRAND.name}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;padding:30px 28px;">
            <h1 style="margin:0 0 14px;font-family:${FONT};font-size:19px;line-height:1.35;
                       font-weight:600;color:${BRAND.ink};letter-spacing:-0.015em;">${escapeHtml(heading)}</h1>
            <div style="font-family:${FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">
              ${body}
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 8px 0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${BRAND.muted};">
            ${footerNote ? `<p style="margin:0 0 8px;">${footerNote}</p>` : ""}
            <p style="margin:0;">
              Sent by ${BRAND.name} · <a href="${appUrl("/settings")}" style="color:${BRAND.muted};text-decoration:underline;">Notification settings</a>
            </p>
            <p style="margin:6px 0 0;color:#9ca3af;">
              This is an automated message from your team operations portal.
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${text}</p>`;
}

// ---------------------------------------------------------------------------
//  Account lifecycle
// ---------------------------------------------------------------------------

export function welcomeEmail({
  name,
  setPasswordUrl,
  employeeCode,
  role,
}: {
  name: string;
  setPasswordUrl: string;
  employeeCode: string;
  role: string;
}): EmailContent {
  const first = escapeHtml(name.split(" ")[0] ?? name);

  return {
    subject: `Welcome to ${BRAND.name} — set up your account`,
    html: layout({
      preheader: `Your ${BRAND.name} account is ready. Choose a password to get started.`,
      heading: `Welcome aboard, ${first}`,
      body: [
        paragraph(
          `Your ${BRAND.name} account has been created. ${BRAND.name} is where the team logs daily status reports, attendance and leave — all in one place.`,
        ),
        detailRows([
          ["Employee ID", escapeHtml(employeeCode)],
          ["Access level", escapeHtml(role)],
        ]),
        paragraph("Choose a password to activate your account:"),
        button("Set your password", setPasswordUrl),
        paragraph(
          `<span style="color:${BRAND.muted};font-size:13px;">This link is valid for 7 days. If it expires, use “Forgot password” on the sign-in screen.</span>`,
        ),
      ].join(""),
    }),
    text: [
      `Welcome aboard, ${name.split(" ")[0]}`,
      "",
      `Your ${BRAND.name} account has been created.`,
      `Employee ID: ${employeeCode}`,
      `Access level: ${role}`,
      "",
      "Set your password:",
      setPasswordUrl,
      "",
      "This link is valid for 7 days.",
    ].join("\n"),
  };
}

export function passwordResetEmail({
  name,
  resetUrl,
  expiresInMinutes,
}: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): EmailContent {
  return {
    subject: `Reset your ${BRAND.name} password`,
    html: layout({
      preheader: `A password reset was requested. The link expires in ${expiresInMinutes} minutes.`,
      heading: "Reset your password",
      body: [
        paragraph(`Hi ${escapeHtml(name.split(" ")[0] ?? name)},`),
        paragraph(
          `We received a request to reset the password for your ${BRAND.name} account. Choose a new one here:`,
        ),
        button("Choose a new password", resetUrl),
        paragraph(
          `<span style="color:${BRAND.muted};font-size:13px;">This link expires in ${expiresInMinutes} minutes and can only be used once.</span>`,
        ),
      ].join(""),
      footerNote:
        "If you didn't request this, you can safely ignore this email — your password won't change.",
    }),
    text: [
      `Hi ${name.split(" ")[0]},`,
      "",
      `Reset your ${BRAND.name} password:`,
      resetUrl,
      "",
      `This link expires in ${expiresInMinutes} minutes and can only be used once.`,
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
  };
}

export function emailVerificationEmail({
  name,
  verifyUrl,
}: {
  name: string;
  verifyUrl: string;
}): EmailContent {
  return {
    subject: `Confirm your email address`,
    html: layout({
      preheader: "One click to confirm your email address.",
      heading: "Confirm your email",
      body: [
        paragraph(`Hi ${escapeHtml(name.split(" ")[0] ?? name)},`),
        paragraph("Please confirm this is your email address so we can send you notifications."),
        button("Confirm email address", verifyUrl),
      ].join(""),
    }),
    text: [`Hi ${name.split(" ")[0]},`, "", "Confirm your email address:", verifyUrl].join("\n"),
  };
}

// ---------------------------------------------------------------------------
//  Leave
// ---------------------------------------------------------------------------

export function leaveSubmittedEmail({
  approverName,
  requesterName,
  leaveType,
  dateRange,
  days,
  reason,
  reviewUrl,
  balanceAfter,
}: {
  approverName: string;
  requesterName: string;
  leaveType: string;
  dateRange: string;
  days: string;
  reason: string;
  reviewUrl: string;
  balanceAfter: string;
}): EmailContent {
  return {
    subject: `Leave request from ${requesterName} — ${dateRange}`,
    html: layout({
      preheader: `${requesterName} requested ${days} of ${leaveType.toLowerCase()} (${dateRange}).`,
      heading: `${escapeHtml(requesterName)} requested leave`,
      body: [
        paragraph(`Hi ${escapeHtml(approverName.split(" ")[0] ?? approverName)},`),
        paragraph("A leave request is waiting for your decision."),
        detailRows([
          ["Employee", escapeHtml(requesterName)],
          ["Leave type", escapeHtml(leaveType)],
          ["Dates", escapeHtml(dateRange)],
          ["Duration", escapeHtml(days)],
          ["Balance if approved", escapeHtml(balanceAfter)],
        ]),
        `<div style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">Reason</div>`,
        `<div style="padding:12px 14px;border-left:3px solid ${BRAND.border};background:${BRAND.canvas};border-radius:0 8px 8px 0;font-size:13.5px;">${escapeHtml(
          reason,
        )}</div>`,
        button("Review request", reviewUrl),
      ].join(""),
    }),
    text: [
      `${requesterName} requested leave`,
      "",
      `Leave type: ${leaveType}`,
      `Dates: ${dateRange}`,
      `Duration: ${days}`,
      `Balance if approved: ${balanceAfter}`,
      "",
      `Reason: ${reason}`,
      "",
      `Review: ${reviewUrl}`,
    ].join("\n"),
  };
}

export function leaveDecisionEmail({
  requesterName,
  deciderName,
  approved,
  leaveType,
  dateRange,
  days,
  note,
  remainingBalance,
  detailUrl,
}: {
  requesterName: string;
  deciderName: string;
  approved: boolean;
  leaveType: string;
  dateRange: string;
  days: string;
  note?: string;
  remainingBalance: string;
  detailUrl: string;
}): EmailContent {
  const verdict = approved ? "approved" : "declined";

  return {
    subject: `Your leave request was ${verdict} — ${dateRange}`,
    html: layout({
      preheader: `${deciderName} ${verdict} your ${leaveType.toLowerCase()} for ${dateRange}.`,
      heading: `Your leave request was ${verdict}`,
      body: [
        paragraph(`Hi ${escapeHtml(requesterName.split(" ")[0] ?? requesterName)},`),
        `<p style="margin:0 0 16px;">${statusPill(
          approved ? "Approved" : "Declined",
          approved ? "success" : "danger",
        )}</p>`,
        detailRows([
          ["Leave type", escapeHtml(leaveType)],
          ["Dates", escapeHtml(dateRange)],
          ["Duration", escapeHtml(days)],
          ["Decided by", escapeHtml(deciderName)],
          ["Remaining balance", escapeHtml(remainingBalance)],
        ]),
        note
          ? [
              `<div style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">Note from ${escapeHtml(
                deciderName.split(" ")[0] ?? deciderName,
              )}</div>`,
              `<div style="padding:12px 14px;border-left:3px solid ${BRAND.border};background:${BRAND.canvas};border-radius:0 8px 8px 0;font-size:13.5px;">${escapeHtml(
                note,
              )}</div>`,
            ].join("")
          : "",
        button("View request", detailUrl),
      ].join(""),
    }),
    text: [
      `Your leave request was ${verdict}.`,
      "",
      `Leave type: ${leaveType}`,
      `Dates: ${dateRange}`,
      `Duration: ${days}`,
      `Decided by: ${deciderName}`,
      `Remaining balance: ${remainingBalance}`,
      note ? `\nNote: ${note}` : "",
      "",
      detailUrl,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
//  Reminders
// ---------------------------------------------------------------------------

export function dsrReminderEmail({
  name,
  dateLabel,
  composeUrl,
  streak,
}: {
  name: string;
  dateLabel: string;
  composeUrl: string;
  streak: number;
}): EmailContent {
  return {
    subject: `Your status report for ${dateLabel} is still open`,
    html: layout({
      preheader: `Two minutes now saves your manager ten tomorrow.`,
      heading: `How did ${escapeHtml(dateLabel)} go?`,
      body: [
        paragraph(`Hi ${escapeHtml(name.split(" ")[0] ?? name)},`),
        paragraph(
          `Your daily status report for <strong>${escapeHtml(dateLabel)}</strong> hasn't been submitted yet. It usually takes about two minutes.`,
        ),
        streak > 2
          ? paragraph(
              `You're on a <strong>${streak}-day streak</strong> — worth keeping going. 🎯`,
            )
          : "",
        button("Write today's report", composeUrl),
        paragraph(
          `<span style="color:${BRAND.muted};font-size:13px;">Prefer not to get these? Turn reminders off in your notification settings.</span>`,
        ),
      ].join(""),
    }),
    text: [
      `Hi ${name.split(" ")[0]},`,
      "",
      `Your daily status report for ${dateLabel} hasn't been submitted yet.`,
      streak > 2 ? `You're on a ${streak}-day streak.` : "",
      "",
      `Write it here: ${composeUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function attendanceReminderEmail({
  name,
  dateLabel,
  markUrl,
}: {
  name: string;
  dateLabel: string;
  markUrl: string;
}): EmailContent {
  return {
    subject: `Mark your attendance for ${dateLabel}`,
    html: layout({
      preheader: "One tap to mark yourself in.",
      heading: "Mark your attendance",
      body: [
        paragraph(`Hi ${escapeHtml(name.split(" ")[0] ?? name)},`),
        paragraph(
          `We haven't recorded your attendance for <strong>${escapeHtml(dateLabel)}</strong> yet.`,
        ),
        button("Mark attendance", markUrl),
      ].join(""),
    }),
    text: [
      `Hi ${name.split(" ")[0]},`,
      "",
      `Attendance for ${dateLabel} isn't recorded yet.`,
      markUrl,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
//  Team communication
// ---------------------------------------------------------------------------

export function announcementEmail({
  title,
  body,
  authorName,
  url,
}: {
  title: string;
  body: string;
  authorName: string;
  url: string;
}): EmailContent {
  return {
    subject: `📣 ${title}`,
    html: layout({
      preheader: markdownToText(body).slice(0, 140),
      heading: title,
      body: [
        `<p style="margin:0 0 16px;color:${BRAND.muted};font-size:13px;">Posted by ${escapeHtml(
          authorName,
        )}</p>`,
        markdownToEmailHtml(body),
        button(`Open in ${COMPANY.name}`, url),
      ].join(""),
    }),
    text: [title, `Posted by ${authorName}`, "", markdownToText(body), "", url].join("\n"),
  };
}

export function dsrReviewedEmail({
  name,
  reviewerName,
  dateLabel,
  flagged,
  comment,
  url,
}: {
  name: string;
  reviewerName: string;
  dateLabel: string;
  flagged: boolean;
  comment?: string;
  url: string;
}): EmailContent {
  return {
    subject: flagged
      ? `${reviewerName} has a question about your ${dateLabel} report`
      : `${reviewerName} reviewed your ${dateLabel} report`,
    html: layout({
      preheader: comment ? comment.slice(0, 140) : `Your report for ${dateLabel} has been reviewed.`,
      heading: flagged ? "A question about your report" : "Your report was reviewed",
      body: [
        paragraph(`Hi ${escapeHtml(name.split(" ")[0] ?? name)},`),
        `<p style="margin:0 0 16px;">${statusPill(
          flagged ? "Needs attention" : "Reviewed",
          flagged ? "warning" : "success",
        )}</p>`,
        paragraph(
          `${escapeHtml(reviewerName)} looked at your status report for <strong>${escapeHtml(
            dateLabel,
          )}</strong>.`,
        ),
        comment
          ? `<div style="padding:12px 14px;border-left:3px solid ${BRAND.border};background:${BRAND.canvas};border-radius:0 8px 8px 0;font-size:13.5px;">${escapeHtml(
              comment,
            )}</div>`
          : "",
        button("View report", url),
      ].join(""),
    }),
    text: [
      `Hi ${name.split(" ")[0]},`,
      "",
      `${reviewerName} ${flagged ? "flagged" : "reviewed"} your report for ${dateLabel}.`,
      comment ? `\nComment: ${comment}` : "",
      "",
      url,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
//  Expense claims
// ---------------------------------------------------------------------------

export function expenseSubmittedEmail({
  approverName,
  claimantName,
  claimNumber,
  title,
  amount,
  category,
  expenseDate,
  reviewUrl,
}: {
  approverName: string;
  claimantName: string;
  claimNumber: string;
  title: string;
  amount: string;
  category: string;
  expenseDate: string;
  reviewUrl: string;
}): EmailContent {
  return {
    subject: `${claimNumber} — ${claimantName} claimed ${amount}`,
    html: layout({
      preheader: `${title} · ${category} · ${expenseDate}`,
      heading: `${escapeHtml(claimantName)} filed an expense claim`,
      body: [
        paragraph(`Hi ${escapeHtml(approverName.split(" ")[0] ?? approverName)},`),
        paragraph("An expense claim is waiting for your decision."),
        detailRows([
          ["Claim", escapeHtml(claimNumber)],
          ["Claimed by", escapeHtml(claimantName)],
          ["Amount", `<strong>${escapeHtml(amount)}</strong>`],
          ["Category", escapeHtml(category)],
          ["Spent on", escapeHtml(expenseDate)],
        ]),
        `<div style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">What it was for</div>`,
        `<div style="padding:12px 14px;border-left:3px solid ${BRAND.border};background:${BRAND.canvas};border-radius:0 8px 8px 0;font-size:13.5px;">${escapeHtml(
          title,
        )}</div>`,
        button("Review claim", reviewUrl),
        paragraph(
          `<span style="color:${BRAND.muted};font-size:13px;">Receipts are attached to the claim in the portal — they aren't emailed, since they can contain personal details.</span>`,
        ),
      ].join(""),
    }),
    text: [
      `${claimantName} filed an expense claim.`,
      "",
      `Claim: ${claimNumber}`,
      `Amount: ${amount}`,
      `Category: ${category}`,
      `Spent on: ${expenseDate}`,
      `For: ${title}`,
      "",
      `Review: ${reviewUrl}`,
    ].join("\n"),
  };
}

export function expenseDecisionEmail({
  claimantName,
  deciderName,
  approved,
  claimNumber,
  title,
  amount,
  category,
  expenseDate,
  note,
  detailUrl,
}: {
  claimantName: string;
  deciderName: string;
  approved: boolean;
  claimNumber: string;
  title: string;
  amount: string;
  category: string;
  expenseDate: string;
  note?: string;
  detailUrl: string;
}): EmailContent {
  const verdict = approved ? "approved" : "declined";

  return {
    subject: `${claimNumber} was ${verdict} — ${amount}`,
    html: layout({
      preheader: approved
        ? `${amount} approved for payment.`
        : `${amount} declined — see the reason.`,
      heading: `Your claim was ${verdict}`,
      body: [
        paragraph(`Hi ${escapeHtml(claimantName.split(" ")[0] ?? claimantName)},`),
        `<p style="margin:0 0 16px;">${statusPill(
          approved ? "Approved" : "Declined",
          approved ? "success" : "danger",
        )}</p>`,
        detailRows([
          ["Claim", escapeHtml(claimNumber)],
          ["Amount", `<strong>${escapeHtml(amount)}</strong>`],
          ["Category", escapeHtml(category)],
          ["Spent on", escapeHtml(expenseDate)],
          ["Decided by", escapeHtml(deciderName)],
        ]),
        note
          ? [
              `<div style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">Note from ${escapeHtml(
                deciderName.split(" ")[0] ?? deciderName,
              )}</div>`,
              `<div style="padding:12px 14px;border-left:3px solid ${BRAND.border};background:${BRAND.canvas};border-radius:0 8px 8px 0;font-size:13.5px;">${escapeHtml(
                note,
              )}</div>`,
            ].join("")
          : "",
        paragraph(
          approved
            ? `<span style="color:${BRAND.muted};font-size:13px;">Finance will mark it reimbursed once the payment goes out.</span>`
            : `<span style="color:${BRAND.muted};font-size:13px;">If the note explains something you can correct, file a fresh claim with the change.</span>`,
        ),
        button("View claim", detailUrl),
      ].join(""),
    }),
    text: [
      `Your claim ${claimNumber} was ${verdict}.`,
      "",
      `Amount: ${amount}`,
      `Category: ${category}`,
      `Spent on: ${expenseDate}`,
      `For: ${title}`,
      `Decided by: ${deciderName}`,
      note ? `\nNote: ${note}` : "",
      "",
      detailUrl,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
//  Tasks
// ---------------------------------------------------------------------------

/** First name, for a greeting. Falls back to the whole string for mononyms. */
function firstWord(name: string): string {
  return name.trim().split(/s+/)[0] ?? name;
}

/** Coloured chip for a task priority, matching the in-app badge tones. */
function priorityPill(priority: string): string {
  const tone: Record<string, { bg: string; fg: string }> = {
    Critical: { bg: "#fee2e2", fg: "#991b1b" },
    High: { bg: "#fef3c7", fg: "#92400e" },
    Medium: { bg: "#e0e7ff", fg: "#3730a3" },
    Low: { bg: "#f1f5f9", fg: "#475569" },
  };
  const chosen = tone[priority] ?? tone.Medium!;

  return (
    `<span style="display:inline-block;padding:3px 9px;border-radius:999px;` +
    `background:${chosen.bg};color:${chosen.fg};font-family:${FONT};font-size:11.5px;` +
    `font-weight:600;letter-spacing:0.02em;">${escapeHtml(priority)}</span>`
  );
}

/**
 * A task has landed on someone.
 *
 * Carries the full description rather than a teaser: the brief asks for it, and a
 * fitter reading this on a phone in a plant should not have to open a browser to
 * find out what the job is.
 *
 * Attachments are **named, not attached**. A 50 MB video would bounce off most
 * mailboxes, and a file that can contain anything is safer behind an authenticated
 * page than loose in an inbox.
 */
export function taskAssignedEmail({
  assigneeName,
  assignedByName,
  taskNumber,
  title,
  description,
  priority,
  dueOn,
  attachmentNames,
  taskUrl,
}: {
  assigneeName: string;
  assignedByName: string;
  taskNumber: string;
  title: string;
  description: string;
  priority: string;
  dueOn: string | null;
  attachmentNames: string[];
  taskUrl: string;
}): EmailContent {
  return {
    subject: `${taskNumber}: ${title}`,
    html: layout({
      preheader: `${priority} priority${dueOn ? ` · due ${dueOn}` : ""} · from ${assignedByName}`,
      heading: `${escapeHtml(assignedByName)} assigned you a task`,
      body: [
        paragraph(`Hi ${escapeHtml(firstWord(assigneeName))},`),
        `<h2 style="margin:0 0 14px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;color:${BRAND.ink};">${escapeHtml(
          title,
        )}</h2>`,
        detailRows([
          ["Task", escapeHtml(taskNumber)],
          ["Priority", priorityPill(priority)],
          ...(dueOn ? ([["Due", `<strong>${escapeHtml(dueOn)}</strong>`]] as Array<[string, string]>) : []),
          ["Assigned by", escapeHtml(assignedByName)],
        ]),
        `<div style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">What needs doing</div>`,
        `<div style="padding:12px 14px;border-left:3px solid ${BRAND.border};background:${BRAND.canvas};border-radius:0 8px 8px 0;font-size:13.5px;line-height:21px;">${markdownToEmailHtml(
          description,
        )}</div>`,
        attachmentNames.length > 0
          ? [
              `<div style="margin:18px 0 4px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.04em;">Attached (${attachmentNames.length})</div>`,
              `<ul style="margin:0 0 4px;padding-left:18px;font-family:${FONT};font-size:13px;color:${BRAND.body};">`,
              attachmentNames
                .map((name) => `<li style="margin:0 0 3px;">${escapeHtml(name)}</li>`)
                .join(""),
              "</ul>",
              paragraph(
                `<span style="color:${BRAND.muted};font-size:12.5px;">Open the task to view or download these.</span>`,
              ),
            ].join("")
          : "",
        button("Open the task", taskUrl),
        paragraph(
          `<span style="color:${BRAND.muted};font-size:13px;">Post your progress on the task itself so everyone working on it can see it.</span>`,
        ),
      ].join(""),
    }),
    text: [
      `${assignedByName} assigned you ${taskNumber}.`,
      "",
      title,
      "",
      `Priority: ${priority}`,
      dueOn ? `Due: ${dueOn}` : "No due date",
      "",
      markdownToText(description),
      attachmentNames.length > 0 ? `\nAttached: ${attachmentNames.join(", ")}` : "",
      "",
      taskUrl,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

/** 24 hours out, or already late. One template, two tones. */
export function taskDeadlineEmail({
  assigneeName,
  taskNumber,
  title,
  priority,
  dueOn,
  overdue,
  daysLate,
  progressPercent,
  taskUrl,
}: {
  assigneeName: string;
  taskNumber: string;
  title: string;
  priority: string;
  dueOn: string;
  overdue: boolean;
  daysLate: number;
  progressPercent: number;
  taskUrl: string;
}): EmailContent {
  return {
    subject: overdue
      ? `Overdue: ${taskNumber} — ${title}`
      : `Due tomorrow: ${taskNumber} — ${title}`,
    html: layout({
      preheader: overdue
        ? `${daysLate} day${daysLate === 1 ? "" : "s"} past its due date.`
        : `Due ${dueOn}.`,
      heading: overdue ? "This task is overdue" : "This task is due tomorrow",
      body: [
        paragraph(`Hi ${escapeHtml(firstWord(assigneeName))},`),
        `<h2 style="margin:0 0 14px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;color:${BRAND.ink};">${escapeHtml(
          title,
        )}</h2>`,
        `<p style="margin:0 0 16px;">${statusPill(
          overdue ? `${daysLate} day${daysLate === 1 ? "" : "s"} late` : "Due tomorrow",
          overdue ? "danger" : "warning",
        )}</p>`,
        detailRows([
          ["Task", escapeHtml(taskNumber)],
          ["Priority", priorityPill(priority)],
          ["Due", `<strong>${escapeHtml(dueOn)}</strong>`],
          ["Progress", `${progressPercent}%`],
        ]),
        paragraph(
          overdue
            ? "If it is finished, mark it complete. If something is holding it up, set it to blocked with a reason so it can be cleared."
            : "If it is on track, no action needed. If it will slip, say so on the task now rather than tomorrow.",
        ),
        button(overdue ? "Update the task" : "Open the task", taskUrl),
      ].join(""),
    }),
    text: [
      overdue
        ? `${taskNumber} is ${daysLate} day(s) overdue.`
        : `${taskNumber} is due tomorrow.`,
      "",
      title,
      `Priority: ${priority}`,
      `Due: ${dueOn}`,
      `Progress: ${progressPercent}%`,
      "",
      taskUrl,
    ].join("\n"),
  };
}

export function taskMentionEmail({
  recipientName,
  authorName,
  taskNumber,
  title,
  body,
  taskUrl,
}: {
  recipientName: string;
  authorName: string;
  taskNumber: string;
  title: string;
  body: string;
  taskUrl: string;
}): EmailContent {
  return {
    subject: `${authorName} mentioned you on ${taskNumber}`,
    html: layout({
      preheader: `${title} — ${markdownToText(body).slice(0, 90)}`,
      heading: `${escapeHtml(authorName)} mentioned you`,
      body: [
        paragraph(`Hi ${escapeHtml(firstWord(recipientName))},`),
        paragraph(`On <strong>${escapeHtml(taskNumber)}</strong> — ${escapeHtml(title)}:`),
        `<div style="padding:12px 14px;border-left:3px solid ${BRAND.accent};background:${BRAND.accentSoft};border-radius:0 8px 8px 0;font-size:13.5px;line-height:21px;">${markdownToEmailHtml(
          body,
        )}</div>`,
        button("Reply on the task", taskUrl),
      ].join(""),
    }),
    text: [
      `${authorName} mentioned you on ${taskNumber} — ${title}.`,
      "",
      markdownToText(body),
      "",
      taskUrl,
    ].join("\n"),
  };
}

export interface TaskDigestSection {
  heading: string;
  tone: "neutral" | "success" | "warning" | "danger";
  items: Array<{
    taskNumber: string;
    title: string;
    assignees: string;
    detail: string;
    url: string;
  }>;
}

/**
 * The grouped report from section 8 of the brief.
 *
 * Deliberately *not* one email per update. Twenty people posting three updates a day
 * is sixty emails an admin will filter into a folder and stop reading, at which point
 * the notification system has achieved nothing. One scannable digest, grouped by what
 * needs attention first, is read.
 *
 * Sections arrive pre-ordered by urgency and empty ones are dropped by the caller, so
 * a quiet day produces a short email rather than a page of "nothing to report".
 */
export function taskDigestEmail({
  recipientName,
  periodLabel,
  sections,
  stats,
  dashboardUrl,
}: {
  recipientName: string;
  periodLabel: string;
  sections: TaskDigestSection[];
  stats: {
    updated: number;
    completed: number;
    overdue: number;
    blocked: number;
    awaitingReview: number;
  };
  dashboardUrl: string;
}): EmailContent {
  const toneColour: Record<TaskDigestSection["tone"], string> = {
    neutral: BRAND.muted,
    success: "#047857",
    warning: "#92400e",
    danger: "#991b1b",
  };

  const statCard = (label: string, value: number, emphasis = false) =>
    `<td style="padding:0 6px 0 0;" width="20%">` +
    `<div style="border:1px solid ${BRAND.border};border-radius:8px;padding:10px 8px;text-align:center;background:${
      emphasis && value > 0 ? "#fef2f2" : BRAND.surface
    };">` +
    `<div style="font-family:${FONT};font-size:20px;font-weight:600;color:${
      emphasis && value > 0 ? "#991b1b" : BRAND.ink
    };line-height:1;">${value}</div>` +
    `<div style="font-family:${FONT};font-size:10.5px;color:${BRAND.muted};margin-top:4px;text-transform:uppercase;letter-spacing:0.03em;">${escapeHtml(
      label,
    )}</div>` +
    `</div></td>`;

  const sectionHtml = sections
    .map((section) =>
      [
        `<div style="margin:22px 0 8px;font-family:${FONT};font-size:12px;font-weight:700;color:${
          toneColour[section.tone]
        };text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(section.heading)} (${section.items.length})</div>`,
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">`,
        section.items
          .map(
            (item) =>
              `<tr><td style="padding:9px 0;border-bottom:1px solid ${BRAND.border};font-family:${FONT};">` +
              `<a href="${item.url}" style="color:${BRAND.accent};text-decoration:none;font-size:13.5px;font-weight:600;">${escapeHtml(
                item.taskNumber,
              )}</a> ` +
              `<span style="color:${BRAND.ink};font-size:13.5px;">${escapeHtml(item.title)}</span>` +
              `<div style="margin-top:3px;font-size:11.5px;color:${BRAND.muted};">${escapeHtml(
                item.assignees,
              )} · ${escapeHtml(item.detail)}</div>` +
              `</td></tr>`,
          )
          .join(""),
        `</table>`,
      ].join(""),
    )
    .join("");

  return {
    subject:
      stats.overdue > 0
        ? `Task report — ${periodLabel} (${stats.overdue} overdue)`
        : `Task report — ${periodLabel}`,
    html: layout({
      preheader:
        `${stats.updated} updated · ${stats.completed} completed · ${stats.overdue} overdue · ` +
        `${stats.blocked} blocked`,
      heading: `Task report — ${escapeHtml(periodLabel)}`,
      body: [
        paragraph(`Hi ${escapeHtml(firstWord(recipientName))}, here is where the work stands.`),
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;margin:0 0 4px;"><tr>`,
        statCard("Updated", stats.updated),
        statCard("Completed", stats.completed),
        statCard("In review", stats.awaitingReview),
        statCard("Blocked", stats.blocked, true),
        statCard("Overdue", stats.overdue, true),
        `</tr></table>`,
        sections.length > 0
          ? sectionHtml
          : paragraph(
              `<span style="color:${BRAND.muted};">Nothing moved in this period — no updates, and nothing overdue.</span>`,
            ),
        button("Open the task dashboard", dashboardUrl),
      ].join(""),
    }),
    text: [
      `Task report — ${periodLabel}`,
      "",
      `Updated: ${stats.updated}   Completed: ${stats.completed}   In review: ${stats.awaitingReview}`,
      `Blocked: ${stats.blocked}   Overdue: ${stats.overdue}`,
      "",
      ...sections.flatMap((section) => [
        `${section.heading.toUpperCase()} (${section.items.length})`,
        ...section.items.map(
          (item) => `  ${item.taskNumber}  ${item.title}\n    ${item.assignees} · ${item.detail}`,
        ),
        "",
      ]),
      dashboardUrl,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
//  The daily briefing
// ---------------------------------------------------------------------------

interface BriefingItemView {
  label: string;
  text: string;
  meta?: string;
  url?: string;
  children?: Array<{ text: string; meta?: string; late?: boolean }>;
}

interface BriefingSectionView {
  heading: string;
  tone: "critical" | "warning" | "neutral" | "good";
  note?: string;
  items: BriefingItemView[];
}

/**
 * One email a day, replacing eight.
 *
 * ## Why it looks like this
 *
 * It is read on a phone, in the evening, by somebody who has been on a factory floor all
 * day. So it is a scannable list, not a report: a five-figure strip at the top for the
 * shape of the day, then sections in descending order of what it costs to ignore them.
 *
 * The order section nests one level to show each stage's days-used against days-allotted,
 * because that is the only place where the detail changes what he would do — everything
 * else is one line per thing.
 *
 * Severity is carried by a left border and a label, never by colour alone. Plenty of people
 * read mail with images off and in high-contrast modes, and "critical" has to survive that.
 */
export function dailyBriefingEmail({
  recipientName,
  dateLabel,
  sections,
  stats,
  dashboardUrl,
  digestOnly,
}: {
  recipientName: string;
  dateLabel: string;
  sections: BriefingSectionView[];
  stats: {
    ordersOpen: number;
    ordersLate: number;
    awaitingDecision: number;
    blocked: number;
    completedToday: number;
    absent: number;
  };
  dashboardUrl: string;
  /** True when this email is the only one they will have received today. */
  digestOnly: boolean;
}): EmailContent {
  const toneColour: Record<BriefingSectionView["tone"], string> = {
    critical: "#991b1b",
    warning: "#92400e",
    neutral: BRAND.muted,
    good: "#047857",
  };

  const toneRule: Record<BriefingSectionView["tone"], string> = {
    critical: "#dc2626",
    warning: "#d97706",
    neutral: BRAND.border,
    good: "#059669",
  };

  const statCell = (label: string, value: number, alarming = false) =>
    `<td width="16%" style="padding:0 5px 0 0;vertical-align:top;">` +
    `<div style="border:1px solid ${
      alarming && value > 0 ? "#fecaca" : BRAND.border
    };border-radius:8px;padding:9px 6px;text-align:center;background:${
      alarming && value > 0 ? "#fef2f2" : BRAND.surface
    };">` +
    `<div style="font-family:${FONT};font-size:19px;font-weight:600;line-height:1;color:${
      alarming && value > 0 ? "#991b1b" : BRAND.ink
    };">${value}</div>` +
    `<div style="font-family:${FONT};font-size:9.5px;color:${BRAND.muted};margin-top:4px;text-transform:uppercase;letter-spacing:0.03em;">${escapeHtml(
      label,
    )}</div>` +
    `</div></td>`;

  const itemHtml = (item: BriefingItemView, tone: BriefingSectionView["tone"]) => {
    const label = item.url
      ? `<a href="${item.url}" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">${escapeHtml(
          item.label,
        )}</a>`
      : `<strong style="color:${BRAND.ink};">${escapeHtml(item.label)}</strong>`;

    const children = (item.children ?? [])
      .map(
        (child) =>
          `<tr><td style="padding:2px 0 2px 14px;font-family:${FONT};font-size:12px;color:${
            child.late ? "#991b1b" : BRAND.muted
          };">` +
          `<span style="color:${BRAND.border};">└</span> ${escapeHtml(child.text)}` +
          (child.meta
            ? ` <span style="color:${child.late ? "#b91c1c" : BRAND.muted};">· ${escapeHtml(
                child.meta,
              )}</span>`
            : "") +
          `</td></tr>`,
      )
      .join("");

    return (
      `<tr><td style="padding:8px 0 8px 12px;border-left:3px solid ${
        toneRule[tone]
      };border-bottom:1px solid ${BRAND.border};font-family:${FONT};">` +
      `<div style="font-size:13.5px;line-height:19px;">${label} <span style="color:${BRAND.body};">${escapeHtml(
        item.text,
      )}</span></div>` +
      (item.meta
        ? `<div style="margin-top:2px;font-size:11.5px;color:${BRAND.muted};">${escapeHtml(
            item.meta,
          )}</div>`
        : "") +
      (children
        ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:5px;border-collapse:collapse;">${children}</table>`
        : "") +
      `</td></tr>`
    );
  };

  const sectionHtml = sections
    .map((section) =>
      [
        `<div style="margin:22px 0 6px;font-family:${FONT};font-size:11.5px;font-weight:700;color:${
          toneColour[section.tone]
        };text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(section.heading)} (${section.items.length})</div>`,
        section.note
          ? `<div style="margin:0 0 8px;font-family:${FONT};font-size:11.5px;color:${BRAND.muted};">${escapeHtml(
              section.note,
            )}</div>`
          : "",
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">`,
        section.items.map((item) => itemHtml(item, section.tone)).join(""),
        `</table>`,
      ].join(""),
    )
    .join("");

  const headline =
    stats.ordersLate > 0
      ? stats.ordersLate === 1
        ? "1 order will miss its date"
        : `${stats.ordersLate} orders will miss their dates`
      : stats.awaitingDecision > 0
        ? `${stats.awaitingDecision} thing${stats.awaitingDecision === 1 ? "" : "s"} waiting on you`
        : "Nothing needs a decision";

  return {
    subject: `${dateLabel} — ${headline}`,
    html: layout({
      preheader:
        `${stats.ordersOpen} open · ${stats.ordersLate} at risk · ${stats.awaitingDecision} to decide · ` +
        `${stats.blocked} blocked · ${stats.completedToday} finished`,
      heading: `Where things stand — ${escapeHtml(dateLabel)}`,
      body: [
        paragraph(`Hi ${escapeHtml(firstWord(recipientName))},`),

        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;margin:0 0 6px;"><tr>`,
        statCell("Orders", stats.ordersOpen),
        statCell("At risk", stats.ordersLate, true),
        statCell("To decide", stats.awaitingDecision),
        statCell("Blocked", stats.blocked, true),
        statCell("Done", stats.completedToday),
        statCell("Not in", stats.absent),
        `</tr></table>`,

        sections.length > 0
          ? sectionHtml
          : paragraph(
              `<span style="color:${BRAND.muted};">A quiet day — nothing late, nothing waiting on you, and nobody blocked.</span>`,
            ),

        button("Open the portal", dashboardUrl),

        digestOnly
          ? paragraph(
              `<span style="color:${BRAND.muted};font-size:12px;">This is your one email for the day: leave requests, expense claims and task updates are collected here rather than sent one at a time. Urgent things — an order about to miss its date, somebody blocked — still reach you straight away. You can change that under Settings.</span>`,
            )
          : "",
      ].join(""),
    }),
    text: [
      `Where things stand — ${dateLabel}`,
      "",
      `Open orders: ${stats.ordersOpen}   At risk: ${stats.ordersLate}   To decide: ${stats.awaitingDecision}`,
      `Blocked: ${stats.blocked}   Finished today: ${stats.completedToday}   Not in: ${stats.absent}`,
      "",
      ...(sections.length === 0
        ? ["A quiet day — nothing late, nothing waiting on you, and nobody blocked."]
        : sections.flatMap((section) => [
            `${section.heading.toUpperCase()} (${section.items.length})`,
            ...section.items.flatMap((item) => [
              `  ${item.label}  ${item.text}${item.meta ? `  [${item.meta}]` : ""}`,
              ...(item.children ?? []).map(
                (child) => `      - ${child.text}${child.meta ? ` (${child.meta})` : ""}`,
              ),
            ]),
            "",
          ])),
      dashboardUrl,
    ].join("\n"),
  };
}
