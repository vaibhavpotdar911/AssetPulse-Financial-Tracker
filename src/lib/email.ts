/**
 * AssetPulse - Email Dispatcher Service
 * File: src/lib/email.ts
 * 
 * Supports:
 * - Oracle Cloud Infrastructure (OCI) Email Delivery (Free tier: 3,000 emails/month free)
 * - Custom SMTP, Gmail App Passwords, Brevo, and Resend
 * - Pre-formatted responsive HTML and text templates with FD details
 * - Test email connection verification
 */

import nodemailer from 'nodemailer';

export interface EmailServerConfig {
  provider?: string; // 'oci' | 'custom_smtp' | 'gmail' | 'brevo' | 'resend'
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  password?: string;
  from: string;
}

export interface DepositEmailPayload {
  to: string;
  recipientName?: string;
  bankName: string;
  accountNumber: string;
  principalAmount: number;
  maturityAmount: number;
  maturityDate: string;
  daysRemaining: number;
  eventType: string; // 'MATURED_TODAY' | 'MATURING_7_DAYS' | 'MATURING_14_DAYS' | 'MATURING_30_DAYS'
  currencySymbol?: string;
}

/**
 * Creates a configured Nodemailer Transporter
 */
export function createEmailTransporter(config: EmailServerConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? (config.port === 465),
    auth: {
      user: config.user,
      pass: config.password,
    },
    // Useful for OCI and standard TLS handshakes
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
}

/**
 * Verifies email server credentials and connectivity
 */
export async function verifyEmailConnection(config: EmailServerConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createEmailTransporter(config);
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to verify SMTP credentials' };
  }
}

/**
 * Generates responsive HTML email template for FD maturity alerts
 */
export function generateMaturityEmailHtml(payload: DepositEmailPayload): { subject: string; html: string; text: string } {
  const symbol = payload.currencySymbol || '₹';
  const isMatured = payload.daysRemaining <= 0 || payload.eventType === 'MATURED_TODAY';
  const formattedPrincipal = `${symbol}${Number(payload.principalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedPayout = `${symbol}${Number(payload.maturityAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const subject = isMatured
    ? `🚨 [AssetPulse] Fixed Deposit at ${payload.bankName} (${payload.accountNumber}) Has Matured Today!`
    : `⏰ [AssetPulse] Fixed Deposit at ${payload.bankName} matures in ${payload.daysRemaining} days`;

  const bannerColor = isMatured ? '#e11d48' : '#d97706';
  const badgeText = isMatured ? 'MATURED TODAY' : `${payload.daysRemaining} DAYS REMAINING`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #08ad6a 0%, #201e51 100%); padding: 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">AssetPulse</h1>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Fixed Deposit Maturity & Portfolio Manager</p>
    </div>

    <!-- Alert Banner -->
    <div style="background-color: ${bannerColor}15; border-bottom: 2px solid ${bannerColor}; padding: 14px 24px; display: flex; align-items: center;">
      <span style="display: inline-block; background-color: ${bannerColor}; color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.5px; text-transform: uppercase;">
        ${badgeText}
      </span>
      <span style="margin-left: 10px; font-size: 13px; font-weight: 700; color: ${bannerColor};">
        ${isMatured ? 'Immediate Action Required: Liquidation or Renewal' : 'Upcoming Maturity Alert'}
      </span>
    </div>

    <!-- Body Content -->
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px; line-height: 1.6; color: #475569;">
        Hello${payload.recipientName ? ` <strong>${payload.recipientName}</strong>` : ''},
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        ${isMatured 
          ? `Your fixed deposit certificate with <strong>${payload.bankName}</strong> has completed its tenure today. Please review the details below:`
          : `This is a reminder that your fixed deposit with <strong>${payload.bankName}</strong> will reach maturity on <strong>${payload.maturityDate}</strong>.`}
      </p>

      <!-- Deposit Breakdown Card -->
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Bank / Institution</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 700; text-align: right;">${payload.bankName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Account Number</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-family: monospace; color: #0f172a; text-align: right;">${payload.accountNumber}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Principal Invested</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">${formattedPrincipal}</td>
        </tr>
        <tr style="background-color: #f0fdf4;">
          <td style="padding: 14px 16px; font-size: 13px; color: #166534; font-weight: 700;">Total Payout (Maturity Amount)</td>
          <td style="padding: 14px 16px; font-size: 16px; color: #15803d; font-weight: 800; text-align: right; font-family: monospace;">${formattedPayout}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 12px; color: #64748b; font-weight: 600;">Maturity Date</td>
          <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">${payload.maturityDate}</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        You can log into AssetPulse to record the closure disposition into your permanent financial audit memory.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      AssetPulse Open-Source Portfolio Tracker • Automated Notifications
    </div>
  </div>
</body>
</html>
  `;

  const text = `
[AssetPulse Maturity Alert]
${subject}

Bank: ${payload.bankName}
Account Number: ${payload.accountNumber}
Principal: ${formattedPrincipal}
Maturity Amount: ${formattedPayout}
Maturity Date: ${payload.maturityDate}
Status: ${isMatured ? 'MATURED TODAY' : `${payload.daysRemaining} days left`}

Log in to AssetPulse to manage or close this fixed deposit.
  `.trim();

  return { subject, html, text };
}

/**
 * Dispatches an email notification for a deposit
 */
export async function sendMaturityEmail(
  config: EmailServerConfig,
  payload: DepositEmailPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createEmailTransporter(config);
    const { subject, html, text } = generateMaturityEmailHtml(payload);

    await transporter.sendMail({
      from: config.from,
      to: payload.to,
      subject,
      text,
      html,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[AssetPulse Email Dispatch Error]:', err);
    return { success: false, error: err.message || 'Failed to dispatch email' };
  }
}
