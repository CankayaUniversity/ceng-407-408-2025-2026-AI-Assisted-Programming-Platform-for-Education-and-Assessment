/**
 * emailService.ts
 *
 * Thin wrapper around nodemailer. Reads SMTP config from env vars.
 *
 * Required env vars:
 *   SMTP_HOST     — e.g. smtp.gmail.com
 *   SMTP_PORT     — e.g. 587
 *   SMTP_USER     — sender email address
 *   SMTP_PASS     — app password / SMTP password
 *   SMTP_FROM     — "display name <email>" (optional, defaults to SMTP_USER)
 *
 * If SMTP_HOST is not set the service prints OTP codes to the console
 * (development / no-email mode) so the app still works without an SMTP server.
 */

import nodemailer from "nodemailer";

// ── Transport factory ─────────────────────────────────────────────────────────

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null; // dev mode — log to console

  return nodemailer.createTransport({
    host,
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

const transport = createTransport();

const FROM = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@platform.local";
const APP_NAME = process.env.APP_NAME ?? "AI Programming Platform";

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Send an email OTP verification code.
 */
export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const subject = `${APP_NAME} — Email Verification Code`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#6366f1">${APP_NAME}</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your email verification code is:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;
                  background:#f1f5f9;border-radius:8px;padding:16px 0;margin:24px 0;color:#1e293b">
        ${code}
      </div>
      <p style="color:#64748b;font-size:13px">
        This code expires in <strong>15 minutes</strong>. If you did not register,
        you can ignore this email.
      </p>
    </div>`;

  if (!transport) {
    console.log(`[email/dev] OTP for ${to}: ${code}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, html });
}

/**
 * Notify a teacher that their account has been approved.
 */
export async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const subject = `${APP_NAME} — Your account has been approved`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#6366f1">${APP_NAME}</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Great news — your teacher account has been <strong style="color:#22c55e">approved</strong>!
         You can now sign in and start using the platform.</p>
      <p style="color:#64748b;font-size:13px">Welcome aboard.</p>
    </div>`;

  if (!transport) {
    console.log(`[email/dev] Approval notification sent to ${to}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, html });
}

/**
 * Notify a teacher that their registration was rejected.
 */
export async function sendRejectionEmail(to: string, name: string, reason?: string): Promise<void> {
  const subject = `${APP_NAME} — Account registration update`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#6366f1">${APP_NAME}</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Unfortunately your teacher account registration could not be approved at this time.</p>
      ${reason ? `<p style="color:#64748b">Reason: ${reason}</p>` : ""}
      <p style="color:#64748b;font-size:13px">
        If you believe this is a mistake please contact the platform administrator.
      </p>
    </div>`;

  if (!transport) {
    console.log(`[email/dev] Rejection notification sent to ${to}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, html });
}

/**
 * Notify admin(s) that a new teacher is waiting for approval.
 */
export async function sendPendingApprovalAlert(
  adminEmails: string[],
  teacherName: string,
  teacherEmail: string,
): Promise<void> {
  if (adminEmails.length === 0) return;
  const subject = `${APP_NAME} — New teacher pending approval`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#6366f1">${APP_NAME}</h2>
      <p>A new teacher account is waiting for your approval:</p>
      <ul>
        <li><strong>Name:</strong> ${teacherName}</li>
        <li><strong>Email:</strong> ${teacherEmail}</li>
      </ul>
      <p>Please sign in to the platform and visit <strong>Pending Approvals</strong> to review.</p>
    </div>`;

  if (!transport) {
    console.log(`[email/dev] Pending approval alert for ${teacherName} (${teacherEmail}) → ${adminEmails.join(", ")}`);
    return;
  }
  await transport.sendMail({ from: FROM, to: adminEmails.join(", "), subject, html });
}
