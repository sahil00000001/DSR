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
