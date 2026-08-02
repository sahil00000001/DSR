import "server-only";

/**
 * Who gets emailed, and when.
 *
 * ## The problem
 *
 * The works manager is the only person who decides a leave request or an expense claim, and
 * he creates every task and every order. So every routine event in the business generated
 * an email to one man: five claims and three leave requests is eight emails before lunch.
 * The predictable result is a filter rule and a folder he never opens — at which point the
 * urgent mail is lost along with the rest, and the notification system has made things
 * worse than no notifications at all.
 *
 * ## The rule
 *
 * Every outbound email declares an urgency. `routine` is withheld from anyone who has asked
 * for digest-only delivery and appears in their end-of-day briefing instead. `urgent` always
 * sends, because some things cannot wait until six.
 *
 * In-app notifications are unaffected in both cases. A badge is not an interruption, so
 * there is no reason to batch it — somebody looking at the screen should see the claim
 * arrive.
 *
 * ## Where the line sits
 *
 * The test is not "is this important" — everything feels important to whoever raised it. It
 * is **"would a competent person act on this before the end of the day, and is that action
 * still possible?"**
 *
 *   urgent   an order forecast to miss its promise · a stage blocked · a password reset ·
 *            an account invitation · being @mentioned by name
 *   routine  a leave request · an expense claim · a task assigned · a report reviewed ·
 *            a status change
 *
 * A leave request for next month is routine even though it matters. An order about to be
 * late is urgent even though nobody will die. The difference is whether waiting until 6pm
 * costs anything.
 */

export type EmailUrgency = "routine" | "urgent";

/** The subset of a user this decision needs. Narrow on purpose — it is a pure function. */
export interface EmailRecipient {
  notifyByEmail: boolean;
  /**
   * Required, not optional, and deliberately so.
   *
   * Optional, a Prisma `select` that forgot this column still compiled — and the gate then
   * silently opened, because `undefined !== true`. The failure mode is mail continuing to
   * arrive, which is indistinguishable from the feature working. Requiring it turns that
   * into a compile error at the one place that can fix it: the query.
   */
  emailDigestOnly: boolean;
}

/**
 * Whether to send this email now.
 *
 * `notifyByEmail: false` is absolute — somebody who has switched email off gets none,
 * urgent or otherwise, because that is what the switch says. `emailDigestOnly` only holds
 * back the routine.
 */
export function shouldEmailNow(
  recipient: EmailRecipient,
  urgency: EmailUrgency = "routine",
): boolean {
  if (!recipient.notifyByEmail) return false;
  if (urgency === "urgent") return true;
  return recipient.emailDigestOnly !== true;
}

/**
 * Filters a list of recipients down to those who should be emailed now.
 *
 * Convenience for the fan-out cases — notifying every admin about a submitted claim, say —
 * so a call site cannot accidentally check the preference for one recipient and forget it
 * for the others.
 */
export function emailableNow<T extends EmailRecipient>(
  recipients: readonly T[],
  urgency: EmailUrgency = "routine",
): T[] {
  return recipients.filter((recipient) => shouldEmailNow(recipient, urgency));
}

/**
 * True when this person's routine mail is being held back.
 *
 * Used by the settings screen to explain what the preference is doing, and by the briefing
 * builder to decide whether the briefing is the *only* record they will have seen.
 */
export function isDigestOnly(recipient: EmailRecipient): boolean {
  return recipient.notifyByEmail && recipient.emailDigestOnly === true;
}
