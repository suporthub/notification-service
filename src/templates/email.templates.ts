import fs from 'fs';
import path from 'path';
import { NotificationTemplate } from '../types/notification.types';
import { logger } from '../lib/logger';

// ─── Email Template Engine ────────────────────────────────────────────────────
// SRP: only responsible for rendering HTML + subject from template ID + data.
// Adding a new template = add one function here and register it in the map.
// No external deps — pure string interpolation.

interface RenderedEmail { subject: string; html: string; text: string }

type TemplateData = Record<string, unknown>;

function str(data: TemplateData, key: string, fallback = ''): string {
  return String(data[key] ?? fallback);
}

// ── Shared layout wrapper ─────────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <span style="color:#38bdf8;font-size:22px;font-weight:700;letter-spacing:-.5px;">LiveFXHub</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">Professional Trading</span>
        </td></tr>
        <tr><td style="padding:32px;">${body}</td></tr>
        <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">
            © ${new Date().getFullYear()} LiveFXHub. This is an automated message — please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function otpBox(code: string): string {
  return `<div style="background:#f0f9ff;border:2px dashed #38bdf8;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
    <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#0f172a;">${code}</span>
  </div>`;
}

// ── Strip HTML tags for safe plain-text fallback ──────────────────────────────
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

// ── Sanitize untrusted HTML to prevent XSS ───────────────────────────────────
// NOTE: `body` in renderAnnouncement is assumed to be admin-authored only.
// If this ever accepts user input, replace this with a proper sanitizer (e.g. DOMPurify server-side).
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

// ── Templates ─────────────────────────────────────────────────────────────────

function renderOtp(data: TemplateData): RenderedEmail {
  const otp = str(data, 'otp');
  const expiry = str(data, 'expiryMinutes', '5');
  const accountEmail = str(data, 'accountEmail');
  if (!accountEmail) logger.warn({ template: 'otp' }, 'accountEmail missing from OTP data');
  const timestamp = str(data, 'timestamp', new Date().toUTCString());

  // Fixed path resolution using process.cwd()
  const templatePath = path.join(process.cwd(), 'templates/2fa.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{OTP_CODE}}/g, otp);
  html = html.replace(/{{EXPIRY_MINUTES}}/g, expiry);
  html = html.replace(/{{ACCOUNT_EMAIL}}/g, accountEmail);
  html = html.replace(/{{TIMESTAMP}}/g, timestamp);

  return {
    subject: `[LiveFXHub] Your Verification Code`,
    html,
    text: `Your LiveFXHub verification code is: ${otp}. It expires in ${expiry} minutes.`,
  };
}

function renderNewDeviceLogin(data: TemplateData): RenderedEmail {
  const device = str(data, 'deviceInfo', 'Unknown device');
  const ip = str(data, 'ipAddress', 'Unknown');
  const location = str(data, 'location', 'Unknown');
  const timestamp = str(data, 'timestamp', new Date().toUTCString());
  const accountEmail = str(data, 'accountEmail');
  if (!accountEmail) logger.warn({ template: 'new_device_login' }, 'accountEmail missing from login data');

  // Fixed path resolution using process.cwd()
  const templatePath = path.join(process.cwd(), 'templates/login.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{IP_ADDRESS}}/g, ip);
  html = html.replace(/{{LOCATION}}/g, location);
  html = html.replace(/{{TIMESTAMP}}/g, timestamp);
  html = html.replace(/{{DEVICE}}/g, device);
  html = html.replace(/{{ACCOUNT_EMAIL}}/g, accountEmail);

  return {
    subject: '[LiveFXHub] New Device Login Detected',
    html,
    text: `New device login detected on your LiveFXHub account. Device: ${device}, IP: ${ip}, Location: ${location}, Time: ${timestamp}. If not you, change your password immediately.`,
  };
}

function renderPasswordChanged(data: TemplateData): RenderedEmail {
  const timestamp = str(data, 'timestamp', new Date().toUTCString());
  const html = layout('Password Changed', `
    <h2 style="color:#0f172a;margin:0 0 16px;">Password Changed</h2>
    <p style="color:#475569;">Your LiveFXHub account password was successfully changed on <strong>${timestamp}</strong>.</p>
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;margin-top:16px;">
      <p style="color:#15803d;margin:0;">If you made this change, no action is needed.</p>
    </div>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:4px;margin-top:12px;">
      <p style="color:#dc2626;margin:0;">If you didn't change your password, contact support immediately.</p>
    </div>
  `);
  return {
    subject: '[LiveFXHub] Your Password Has Been Changed',
    html,
    text: `Your LiveFXHub password was changed on ${timestamp}. If you didn't do this, contact support immediately.`,
  };
}

function renderPasswordReset(data: TemplateData): RenderedEmail {
  const resetLink    = str(data, 'resetLink');
  const accountEmail = str(data, 'accountEmail');
  const timestamp    = str(data, 'timestamp', new Date().toUTCString());

  const templatePath = path.join(process.cwd(), 'templates/resetpassword.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{RESET_LINK}}/g,     resetLink);
  html = html.replace(/{{ACCOUNT_EMAIL}}/g,  accountEmail);
  html = html.replace(/{{TIMESTAMP}}/g,      timestamp);

  return {
    subject: '[LiveFXHub] Password Reset Request',
    html,
    text: `Reset your LiveFXHub password using this link (expires in 15 minutes): ${resetLink}`,
  };
}

function renderWelcomeLive(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const email = str(data, 'email');
  const accountType = str(data, 'accountType', 'Live');
  const accountCategory = str(data, 'accountCategory', 'Standard');
  const phone = str(data, 'phone', '');
  const registrationDate = str(data, 'registrationDate', new Date().toUTCString());

  // Fixed path resolution using process.cwd()
  const templatePath = path.join(process.cwd(), 'templates/signup.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{ACCOUNT_NUMBER}}/g, accountNumber);
  html = html.replace(/{{EMAIL}}/g, email);
  html = html.replace(/{{ACCOUNT_TYPE}}/g, accountType);
  html = html.replace(/{{ACCOUNT_CATEGORY}}/g, accountCategory);
  html = html.replace(/{{PHONE}}/g, phone);
  html = html.replace(/{{REGISTRATION_DATE}}/g, registrationDate);

  return {
    subject: `[LiveFXHub] Welcome! Your Account ${accountNumber} is Ready`,
    html,
    text: `Welcome to LiveFXHub! Your live account ${accountNumber} has been created. Login with ${email}.`,
  };
}

function renderWelcomeDemo(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const email = str(data, 'email');
  const accountType = str(data, 'accountType', 'Demo');
  const accountCategory = str(data, 'accountCategory', 'Standard');
  const phone = str(data, 'phone', '');
  const registrationDate = str(data, 'registrationDate', new Date().toUTCString());

  // Fixed path resolution using process.cwd()
  const templatePath = path.join(process.cwd(), 'templates/signup.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{ACCOUNT_NUMBER}}/g, accountNumber);
  html = html.replace(/{{EMAIL}}/g, email);
  html = html.replace(/{{ACCOUNT_TYPE}}/g, accountType);
  html = html.replace(/{{ACCOUNT_CATEGORY}}/g, accountCategory);
  html = html.replace(/{{PHONE}}/g, phone);
  html = html.replace(/{{REGISTRATION_DATE}}/g, registrationDate);

  return {
    subject: `[LiveFXHub] Your Demo Account ${accountNumber} is Ready`,
    html,
    text: `Your LiveFXHub demo account is ready. Account: ${accountNumber}. Login with ${email}.`,
  };
}

function renderAutoCutoff(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const marginLevel = str(data, 'marginLevel', '0');
  const closedAt = str(data, 'closedAt', new Date().toUTCString());
  const html = layout('Auto Cutoff Triggered', `
    <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ Auto Cutoff Triggered</h2>
    <p style="color:#475569;">Your account <strong>${accountNumber}</strong> reached the auto-cutoff margin level.</p>
    <table width="100%" style="border-collapse:collapse;margin:16px 0;">
      <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;width:140px;">Account</td><td style="padding:10px 0;color:#0f172a;font-weight:600;">${accountNumber}</td></tr>
      <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;">Margin Level</td><td style="padding:10px 0;color:#dc2626;font-weight:600;">${marginLevel}%</td></tr>
      <tr><td style="padding:10px 0;color:#94a3b8;">Closed At</td><td style="padding:10px 0;color:#0f172a;font-weight:600;">${closedAt}</td></tr>
    </table>
    <p style="color:#475569;">All open positions have been closed to protect your account from further losses. Please add funds to continue trading.</p>
  `);
  return {
    subject: `[LiveFXHub] Auto Cutoff on Account ${accountNumber}`,
    html,
    text: `Auto cutoff triggered on account ${accountNumber}. Margin level: ${marginLevel}%. All positions closed at ${closedAt}.`,
  };
}

function renderMarginCall(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const marginLevel = str(data, 'marginLevel', '0');
  const html = layout('Margin Call Warning', `
    <h2 style="color:#f59e0b;margin:0 0 16px;">⚠️ Margin Call Warning</h2>
    <p style="color:#475569;">Account <strong>${accountNumber}</strong> margin level has dropped to <strong style="color:#dc2626;">${marginLevel}%</strong>.</p>
    <p style="color:#475569;">Add funds or close positions to avoid auto-cutoff.</p>
  `);
  return {
    subject: `[LiveFXHub] Margin Call Warning — Account ${accountNumber}`,
    html,
    text: `Margin call on account ${accountNumber}. Margin level: ${marginLevel}%. Please add funds or close positions.`,
  };
}

function renderDepositApproved(data: TemplateData): RenderedEmail {
  const amount = str(data, 'amount', '0');
  const currency = str(data, 'currency', 'USD');
  const html = layout('Deposit Approved', `
    <h2 style="color:#15803d;margin:0 0 16px;">✅ Deposit Approved</h2>
    <p style="color:#475569;">Your deposit of <strong>${currency} ${amount}</strong> has been approved and credited to your account.</p>
  `);
  return {
    subject: `[LiveFXHub] Deposit of ${currency} ${amount} Approved`,
    html,
    text: `Your deposit of ${currency} ${amount} has been approved and credited to your account.`,
  };
}

function renderWithdrawalApproved(data: TemplateData): RenderedEmail {
  const amount = str(data, 'amount', '0');
  const currency = str(data, 'currency', 'USD');
  const html = layout('Withdrawal Approved', `
    <h2 style="color:#15803d;margin:0 0 16px;">✅ Withdrawal Approved</h2>
    <p style="color:#475569;">Your withdrawal of <strong>${currency} ${amount}</strong> has been approved and is being processed.</p>
  `);
  return {
    subject: `[LiveFXHub] Withdrawal of ${currency} ${amount} Approved`,
    html,
    text: `Your withdrawal of ${currency} ${amount} has been approved and is being processed.`,
  };
}

function renderWithdrawalRejected(data: TemplateData): RenderedEmail {
  const amount = str(data, 'amount', '0');
  const currency = str(data, 'currency', 'USD');
  const reason = str(data, 'reason', 'No reason provided');
  const html = layout('Withdrawal Rejected', `
    <h2 style="color:#dc2626;margin:0 0 16px;">❌ Withdrawal Rejected</h2>
    <p style="color:#475569;">Your withdrawal of <strong>${currency} ${amount}</strong> was rejected.</p>
    <p style="color:#475569;"><strong>Reason:</strong> ${reason}</p>
    <p style="color:#475569;">Contact support if you have questions.</p>
  `);
  return {
    subject: `[LiveFXHub] Withdrawal of ${currency} ${amount} Rejected`,
    html,
    text: `Your withdrawal of ${currency} ${amount} was rejected. Reason: ${reason}.`,
  };
}

function renderAnnouncement(data: TemplateData): RenderedEmail {
  const title = str(data, 'title', 'Important Update');
  // NOTE: body is assumed to be admin-authored. If this ever accepts user input,
  // replace sanitizeHtml() with a proper server-side sanitizer (e.g. sanitize-html).
  const body = sanitizeHtml(str(data, 'body', ''));
  const html = layout(title, `
    <h2 style="color:#0f172a;margin:0 0 16px;">${title}</h2>
    <div style="color:#475569;line-height:1.7;">${body}</div>
  `);
  return {
    subject: `[LiveFXHub] ${title}`,
    html,
    text: `${title}\n\n${stripHtml(body)}`,
  };
}

// ✅ IB Signup (Welcome Email)
export function renderIbSignup(data: TemplateData): RenderedEmail {
  const firstName = str(data, 'firstName', 'Partner');
  const referralCode = str(data, 'referralCode', 'Pending');
  const createdAt = str(data, 'createdAt', new Date().toUTCString());

  // Fixed path resolution using process.cwd()
  const templatePath = path.join(process.cwd(), 'templates/ib_signup.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{firstName}}/g, firstName);
  html = html.replace(/{{referralCode}}/g, referralCode);
  html = html.replace(/{{createdAt}}/g, createdAt);

  return {
    subject: '[LiveFXHub] IB Partnership Application Received',
    html,
    text: `Congratulations ${firstName}! Your IB application under code ${referralCode} has been received at ${createdAt}.`,
  };
}

// ✅ IB Invite Email
export function renderIbInvite(data: TemplateData): RenderedEmail {
  const ibName = str(data, 'friendName', 'Your friend');
  const ibCode = str(data, 'referralCode', '');

  // Fixed path resolution using process.cwd()
  const templatePath = path.join(process.cwd(), 'templates/ib_email_invite.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/{{IB_NAME}}/g, ibName);
  html = html.replace(/{{IB_CODE}}/g, ibCode);

  return {
    subject: `[LiveFXHub] ${ibName} invited you to join!`,
    html,
    text: `${ibName} invited you to join LiveFXHub! Use referral code: ${ibCode}. Join here: https://www.livefxhub.com/register`,
  };
}

// ── Template registry ─────────────────────────────────────────────────────────

const REGISTRY: Record<NotificationTemplate, (data: TemplateData) => RenderedEmail> = {
  otp: renderOtp,
  new_device_login: renderNewDeviceLogin,
  password_changed: renderPasswordChanged,
  password_reset: renderPasswordReset,
  welcome_live: renderWelcomeLive,
  welcome_demo: renderWelcomeDemo,
  auto_cutoff: renderAutoCutoff,
  margin_call: renderMarginCall,
  deposit_approved: renderDepositApproved,
  withdrawal_approved: renderWithdrawalApproved,
  withdrawal_rejected: renderWithdrawalRejected,
  ib_signup: renderIbSignup,
  ib_invite: renderIbInvite,
  announcement: renderAnnouncement,
};

export function renderEmailTemplate(
  template: NotificationTemplate,
  data: TemplateData,
): RenderedEmail {
  const renderer = REGISTRY[template];
  if (!renderer) {
    throw new Error(`No email renderer for template: ${template}`);
  }
  return renderer(data);
}