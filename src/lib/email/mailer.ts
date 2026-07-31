import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, isProduction, isSmtpEnabled } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { EmailContent } from "@/lib/email/templates";

/**
 * SMTP delivery.
 *
 * Two behaviours by design:
 *
 *  • **Configured** (SMTP_* set): sends via nodemailer over a pooled connection.
 *  • **Unconfigured**: renders the message and logs a summary instead. A fresh
 *    clone therefore runs — and demos — with zero credentials, and no code path
 *    silently does nothing.
 *
 * `sendEmail` never throws. A notification failing to send must not roll back the
 * leave request that triggered it; failures are logged and reported in the return
 * value so the caller can surface a soft warning if it wants to.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isSmtpEnabled) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Port 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: env.SMTP_SECURE && env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    // Reuse connections — a leave decision can fan out to several recipients.
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

export interface SendResult {
  sent: boolean;
  /** True when SMTP isn't configured and the message was logged instead. */
  skipped: boolean;
  error?: string;
}

interface SendOptions {
  to: string | string[];
  content: EmailContent;
  /** Where replies should go — usually the person who triggered the email. */
  replyTo?: string;
  cc?: string[];
}

const MAX_ATTEMPTS = 3;

export async function sendEmail({ to, content, replyTo, cc }: SendOptions): Promise<SendResult> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    return { sent: false, skipped: true, error: "No recipients" };
  }

  const mail = getTransporter();

  if (!mail) {
    logger.info("📧 Email (SMTP not configured — logged instead of sent)", {
      to: recipients.join(", "),
      subject: content.subject,
      preview: content.text.split("\n").filter(Boolean).slice(0, 3).join(" · ").slice(0, 200),
    });
    return { sent: false, skipped: true };
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const info = await mail.sendMail({
        from: env.EMAIL_FROM,
        to: recipients,
        cc,
        replyTo,
        subject: content.subject,
        text: content.text,
        html: content.html,
        headers: {
          // Tells Gmail/Outlook this is transactional, not bulk marketing.
          "X-Auto-Response-Suppress": "OOF, AutoReply",
          "Auto-Submitted": "auto-generated",
        },
      });

      logger.info("Email sent", {
        to: recipients.join(", "),
        subject: content.subject,
        messageId: info.messageId,
        attempt,
      });
      return { sent: true, skipped: false };
    } catch (error) {
      lastError = error;

      // 5xx responses are permanent — retrying just delays the inevitable.
      const code = (error as { responseCode?: number }).responseCode;
      if (code && code >= 500 && code < 600) break;

      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff: 400ms, 1600ms.
        await new Promise((resolve) => setTimeout(resolve, 400 * 4 ** (attempt - 1)));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  logger.error("Email delivery failed", lastError, {
    to: recipients.join(", "),
    subject: content.subject,
  });

  return { sent: false, skipped: false, error: message };
}

/**
 * Fan-out helper for reminders and announcements.
 *
 * Sends in small batches rather than all at once: Gmail's SMTP relay throttles
 * aggressively, and a 20-person org fits comfortably inside its limits when
 * paced. Failures are counted, never thrown.
 */
export async function sendBulkEmail(
  messages: Array<{ to: string; content: EmailContent }>,
  { batchSize = 5, pauseMs = 350 }: { batchSize?: number; pauseMs?: number } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let index = 0; index < messages.length; index += batchSize) {
    const batch = messages.slice(index, index + batchSize);

    const results = await Promise.all(
      batch.map((message) => sendEmail({ to: message.to, content: message.content })),
    );

    for (const result of results) {
      if (result.sent) sent += 1;
      else if (result.skipped) skipped += 1;
      else failed += 1;
    }

    if (index + batchSize < messages.length) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  logger.info("Bulk email complete", { total: messages.length, sent, failed, skipped });
  return { sent, failed, skipped };
}

/** Health probe for the settings screen — verifies credentials without sending. */
export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  const mail = getTransporter();
  if (!mail) {
    return {
      ok: false,
      message: "SMTP is not configured. Emails are written to the server log instead.",
    };
  }

  try {
    await mail.verify();
    return { ok: true, message: `Connected to ${env.SMTP_HOST} as ${env.SMTP_USER}.` };
  } catch (error) {
    return {
      ok: false,
      // In production, don't echo the provider's raw error back into the UI.
      message: isProduction
        ? "Could not connect to the mail server. Check the credentials in your environment."
        : error instanceof Error
          ? error.message
          : String(error),
    };
  }
}
