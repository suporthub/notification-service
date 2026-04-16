import fs from 'fs';
import path from 'path';
import { NotificationTemplate } from '../types/notification.types';

// ─────────────────────────────────────────────────────────────
// ✅ FIX: Resolve templates path correctly (IMPORTANT)
// Works in both src (dev) and dist (prod)
// ─────────────────────────────────────────────────────────────
const TEMPLATE_DIR = path.resolve(process.cwd(), 'templates');

// Safe HTML loader
function loadTemplate(fileName: string): string {
  const filePath = path.join(TEMPLATE_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`❌ Template not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

// ─────────────────────────────────────────────────────────────

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type TemplateData = Record<string, unknown>;

function str(data: TemplateData, key: string, fallback = ''): string {
  return String(data[key] ?? fallback);
}

// ── Layout ───────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial;background:#f4f6f8;padding:20px;">
  <div style="max-width:520px;margin:auto;background:#fff;padding:20px;border-radius:10px;">
    <h2>${title}</h2>
    ${body}
    <hr/>
    <p style="font-size:12px;color:#888;">© ${new Date().getFullYear()} LiveFXHub</p>
  </div>
</body>
</html>`;
}

function otpBox(code: string): string {
  return `<div style="text-align:center;font-size:30px;font-weight:bold;">${code}</div>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function sanitizeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

// ── Templates ────────────────────────────────────────────────

function renderOtp(data: TemplateData): RenderedEmail {
  let html = loadTemplate('2fa.html');

  html = html
    .replace(/{{OTP_CODE}}/g, str(data, 'otp'))
    .replace(/{{EXPIRY_MINUTES}}/g, str(data, 'expiryMinutes', '5'))
    .replace(/{{ACCOUNT_EMAIL}}/g, str(data, 'accountEmail'))
    .replace(/{{TIMESTAMP}}/g, str(data, 'timestamp', new Date().toUTCString()));

  return {
    subject: `[LiveFXHub] Your Verification Code`,
    html,
    text: `OTP: ${str(data, 'otp')}`,
  };
}

function renderNewDeviceLogin(data: TemplateData): RenderedEmail {
  let html = loadTemplate('login.html');

  html = html
    .replace(/{{IP_ADDRESS}}/g, str(data, 'ipAddress'))
    .replace(/{{LOCATION}}/g, str(data, 'location'))
    .replace(/{{TIMESTAMP}}/g, str(data, 'timestamp'))
    .replace(/{{DEVICE}}/g, str(data, 'deviceInfo'));

  return {
    subject: 'New Device Login',
    html,
    text: 'New login detected',
  };
}

function renderPasswordChanged(data: TemplateData): RenderedEmail {
  const html = layout('Password Changed', `<p>Password updated</p>`);

  return {
    subject: 'Password Changed',
    html,
    text: 'Password updated',
  };
}

function renderPasswordReset(data: TemplateData): RenderedEmail {
  const html = layout(
    'Reset Password',
    otpBox(str(data, 'otp'))
  );

  return {
    subject: 'Reset Password',
    html,
    text: `OTP: ${str(data, 'otp')}`,
  };
}

function renderWelcomeLive(data: TemplateData): RenderedEmail {
  let html = loadTemplate('signup.html');

  html = html
    .replace(/{{ACCOUNT_NUMBER}}/g, str(data, 'accountNumber'))
    .replace(/{{EMAIL}}/g, str(data, 'email'));

  return {
    subject: 'Welcome Live Account',
    html,
    text: 'Account created',
  };
}

function renderWelcomeDemo(data: TemplateData): RenderedEmail {
  let html = loadTemplate('signup.html');

  html = html
    .replace(/{{ACCOUNT_NUMBER}}/g, str(data, 'accountNumber'))
    .replace(/{{EMAIL}}/g, str(data, 'email'));

  return {
    subject: 'Welcome Demo Account',
    html,
    text: 'Demo created',
  };
}

function renderAutoCutoff(data: TemplateData): RenderedEmail {
  const html = layout('Auto Cutoff', `<p>Account: ${str(data, 'accountNumber')}</p>`);

  return {
    subject: 'Auto Cutoff',
    html,
    text: 'Auto cutoff triggered',
  };
}

function renderMarginCall(data: TemplateData): RenderedEmail {
  const html = layout('Margin Call', `<p>${str(data, 'marginLevel')}%</p>`);

  return {
    subject: 'Margin Call',
    html,
    text: 'Margin warning',
  };
}

function renderDepositApproved(data: TemplateData): RenderedEmail {
  const html = layout('Deposit Approved', `<p>${str(data, 'amount')}</p>`);

  return {
    subject: 'Deposit Approved',
    html,
    text: 'Deposit done',
  };
}

function renderWithdrawalApproved(data: TemplateData): RenderedEmail {
  const html = layout('Withdrawal Approved', `<p>${str(data, 'amount')}</p>`);

  return {
    subject: 'Withdrawal Approved',
    html,
    text: 'Withdrawal approved',
  };
}

function renderWithdrawalRejected(data: TemplateData): RenderedEmail {
  const html = layout('Withdrawal Rejected', `<p>${str(data, 'reason')}</p>`);

  return {
    subject: 'Withdrawal Rejected',
    html,
    text: 'Rejected',
  };
}

function renderAnnouncement(data: TemplateData): RenderedEmail {
  const html = layout(
    str(data, 'title'),
    sanitizeHtml(str(data, 'body'))
  );

  return {
    subject: str(data, 'title'),
    html,
    text: stripHtml(str(data, 'body')),
  };
}

// IB

export function renderIbSignup(data: TemplateData): RenderedEmail {
  let html = loadTemplate('ib_signup.html');

  html = html
    .replace(/{{firstName}}/g, str(data, 'firstName'))
    .replace(/{{referralCode}}/g, str(data, 'referralCode'));

  return {
    subject: 'IB Signup',
    html,
    text: 'IB created',
  };
}

export function renderIbInvite(data: TemplateData): RenderedEmail {
  let html = loadTemplate('ib_email_invite.html');

  html = html
    .replace(/{{IB_NAME}}/g, str(data, 'friendName'))
    .replace(/{{IB_CODE}}/g, str(data, 'referralCode'));

  return {
    subject: 'IB Invite',
    html,
    text: 'Invite sent',
  };
}

// ── Registry ────────────────────────────────────────────────

const REGISTRY: Record<
  NotificationTemplate,
  (data: TemplateData) => RenderedEmail
> = {
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

// ── Main function ────────────────────────────────────────────

export function renderEmailTemplate(
  template: NotificationTemplate,
  data: TemplateData
): RenderedEmail {
  const renderer = REGISTRY[template];

  if (!renderer) {
    throw new Error(`No renderer for ${template}`);
  }

  return renderer(data);
}