import fs from 'fs';
import path from 'path';
import { NotificationTemplate } from '../types/notification.types';

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

// ── Templates ─────────────────────────────────────────────────────────────────

function renderOtp(data: TemplateData): RenderedEmail {
  const purpose = str(data, 'purpose', 'Verification');
  const otp     = str(data, 'otp');
  const expiry  = str(data, 'expiryMinutes', '5');
  const html = layout('Your OTP', `
    <h2 style="color:#0f172a;margin:0 0 8px;">Verification Code</h2>
    <p style="color:#475569;margin:0 0 4px;">Your code for <strong>${purpose}</strong>:</p>
    ${otpBox(otp)}
    <p style="color:#64748b;font-size:13px;">Expires in <strong>${expiry} minutes</strong>. Never share this code with anyone.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
  `);
  return {
    subject: `[LiveFXHub] Your ${purpose} Code`,
    html,
    text: `Your LiveFXHub ${purpose} code is: ${otp}. It expires in ${expiry} minutes.`,
  };
}

function renderNewDeviceLogin(data: TemplateData): RenderedEmail {
  const device    = str(data, 'deviceInfo', 'Unknown device');
  const ip        = str(data, 'ipAddress', 'Unknown');
  const timestamp = str(data, 'timestamp', new Date().toUTCString());
  const html = layout('New Device Login', `
    <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ New Device Login</h2>
    <p style="color:#475569;">Your LiveFXHub account was accessed from a <strong>new device</strong>:</p>
    <table width="100%" style="border-collapse:collapse;margin:16px 0;">
      <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;width:120px;">Device</td><td style="padding:10px 0;color:#0f172a;font-weight:600;">${device}</td></tr>
      <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;">IP Address</td><td style="padding:10px 0;color:#0f172a;font-weight:600;">${ip}</td></tr>
      <tr><td style="padding:10px 0;color:#94a3b8;">Time</td><td style="padding:10px 0;color:#0f172a;font-weight:600;">${timestamp}</td></tr>
    </table>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:4px;">
      <p style="color:#dc2626;font-weight:600;margin:0;">If this wasn't you, change your password and contact support immediately.</p>
    </div>
  `);
  return {
    subject: '[LiveFXHub] New Device Login Detected',
    html,
    text: `New device login detected on your LiveFXHub account. Device: ${device}, IP: ${ip}, Time: ${timestamp}. If not you, change your password immediately.`,
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
  const otp    = str(data, 'otp');
  const expiry = str(data, 'expiryMinutes', '10');
  const html = layout('Password Reset', `
    <h2 style="color:#0f172a;margin:0 0 8px;">Password Reset Request</h2>
    <p style="color:#475569;">Use the code below to reset your LiveFXHub password:</p>
    ${otpBox(otp)}
    <p style="color:#64748b;font-size:13px;">Expires in <strong>${expiry} minutes</strong>. Do not share this code.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you didn't request a password reset, ignore this email — your password won't change.</p>
  `);
  return {
    subject: '[LiveFXHub] Password Reset Code',
    html,
    text: `Your LiveFXHub password reset code is: ${otp}. Expires in ${expiry} minutes.`,
  };
}

function renderWelcomeLive(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const html = layout('Welcome to LiveFXHub', `
    <h2 style="color:#0f172a;margin:0 0 16px;">Welcome to LiveFXHub! 🎉</h2>
    <p style="color:#475569;">Your live trading account is ready:</p>
    <div style="background:#f0f9ff;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;">Account Number</p>
      <p style="color:#0f172a;font-size:24px;font-weight:700;margin:0;letter-spacing:2px;">${accountNumber}</p>
    </div>
    <p style="color:#475569;">Complete your KYC verification to unlock full trading access.</p>
  `);
  return {
    subject: `[LiveFXHub] Welcome! Your Account ${accountNumber} is Ready`,
    html,
    text: `Welcome to LiveFXHub! Your account number is ${accountNumber}. Complete KYC to start trading.`,
  };
}

function renderWelcomeDemo(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const balance       = str(data, 'demoBalance', '10,000');
  const html = layout('Welcome to LiveFXHub Demo', `
    <h2 style="color:#0f172a;margin:0 0 16px;">Your Demo Account is Ready 🚀</h2>
    <p style="color:#475569;">Practice risk-free with your demo account:</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
      <p style="color:#64748b;font-size:13px;margin:0 0 4px;">Account Number</p>
      <p style="color:#0f172a;font-size:24px;font-weight:700;margin:0;letter-spacing:2px;">${accountNumber}</p>
      <p style="color:#64748b;font-size:13px;margin:8px 0 4px;">Virtual Balance</p>
      <p style="color:#15803d;font-size:22px;font-weight:700;margin:0;">$${balance}</p>
    </div>
  `);
  return {
    subject: `[LiveFXHub] Your Demo Account ${accountNumber} is Ready`,
    html,
    text: `Your LiveFXHub demo account is ready. Account: ${accountNumber}, Balance: $${balance}.`,
  };
}

function renderAutoCutoff(data: TemplateData): RenderedEmail {
  const accountNumber = str(data, 'accountNumber');
  const marginLevel   = str(data, 'marginLevel', '0');
  const closedAt      = str(data, 'closedAt', new Date().toUTCString());
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
  const marginLevel   = str(data, 'marginLevel', '0');
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
  const amount   = str(data, 'amount', '0');
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
  const amount   = str(data, 'amount', '0');
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
  const amount   = str(data, 'amount', '0');
  const currency = str(data, 'currency', 'USD');
  const reason   = str(data, 'reason', 'No reason provided');
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
  const title   = str(data, 'title', 'Important Update');
  const body    = str(data, 'body', '');
  const html = layout(title, `
    <h2 style="color:#0f172a;margin:0 0 16px;">${title}</h2>
    <div style="color:#475569;line-height:1.7;">${body}</div>
  `);
  return {
    subject: `[LiveFXHub] ${title}`,
    html,
    text: `${title}\n\n${body.replace(/<[^>]+>/g, '')}`,
  };
}

function renderIbSignup(data: TemplateData): RenderedEmail {
  const firstName    = str(data, 'firstName', 'Partner');
  const referralCode = str(data, 'referralCode', 'Pending');
  const createdAt    = str(data, 'createdAt', new Date().toUTCString());

  const templatePath = path.join(__dirname, '../../templates/ib_signup.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // Inject dynamic values
  html = html.replace(/{{firstName}}/g,    firstName);
  html = html.replace(/{{referralCode}}/g, referralCode);
  html = html.replace(/{{createdAt}}/g,    createdAt);

  return {
    subject: '[LiveFXHub] IB Partnership Application Received',
    html,
    text: `Congratulations ${firstName}! Your IB application under code ${referralCode} has been received at ${createdAt}.`,
  };
}

// ── Template registry ─────────────────────────────────────────────────────────

const REGISTRY: Record<NotificationTemplate, (data: TemplateData) => RenderedEmail> = {
  otp:                  renderOtp,
  new_device_login:     renderNewDeviceLogin,
  password_changed:     renderPasswordChanged,
  password_reset:       renderPasswordReset,
  welcome_live:         renderWelcomeLive,
  welcome_demo:         renderWelcomeDemo,
  auto_cutoff:          renderAutoCutoff,
  margin_call:          renderMarginCall,
  deposit_approved:     renderDepositApproved,
  withdrawal_approved:  renderWithdrawalApproved,
  withdrawal_rejected:  renderWithdrawalRejected,
  ib_signup:            renderIbSignup,
  announcement:         renderAnnouncement,
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
