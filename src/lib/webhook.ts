/**
 * AssetPulse - Multi-Channel Webhook Dispatcher Subsystem
 * File: src/lib/webhook.ts
 * 
 * Supports:
 * - Generic JSON, Slack, Discord, and Telegram payload adapters
 * - Structured fields: event type, deposit details, maturity date, bank name, principal, message, timestamp
 * - Error resilience: Network timeout handling (default 5s), non-blocking execution, safe failure suppression
 * - URL validation & test ping dispatching
 */

export type WebhookChannel = 'generic' | 'slack' | 'discord' | 'telegram';

export interface WebhookDepositData {
  id?: string;
  bankName: string;
  accountNumber: string;
  principal?: number;
  principalAmount?: number;
  maturityAmount?: number;
  maturityDate?: string | Date;
  daysRemaining?: number;
  annualRate?: number;
  compoundingFrequency?: string;
  status?: string;
}

export interface WebhookUserData {
  id?: string;
  email?: string;
  name?: string | null;
}

export interface WebhookPayload {
  event?: string;
  eventType?: string;
  message?: string;
  timestamp?: string;
  deposit: WebhookDepositData;
  user?: WebhookUserData;
}

export interface WebhookSendOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface WebhookSendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

/**
 * Validates whether a given string is a valid HTTP or HTTPS webhook target URL.
 */
export function validateWebhookUrl(url: string): { valid: boolean; error?: string; parsedUrl?: URL } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Webhook URL cannot be empty.' };
  }

  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Webhook URL must use HTTP or HTTPS protocol.' };
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { valid: false, error: 'Webhook URL must contain a valid host name.' };
    }
    return { valid: true, parsedUrl: parsed };
  } catch {
    return { valid: false, error: 'Malformed webhook URL syntax.' };
  }
}

/**
 * Autodetects the webhook channel provider from the URL if not explicitly specified.
 */
export function detectWebhookChannel(url: string): WebhookChannel {
  const lower = (url || '').toLowerCase();
  if (lower.includes('hooks.slack.com')) return 'slack';
  if (lower.includes('discord.com/api/webhooks') || lower.includes('discordapp.com/api/webhooks')) return 'discord';
  if (lower.includes('api.telegram.org')) return 'telegram';
  return 'generic';
}

/**
 * Formats notification data into platform-specific JSON payload schemas.
 */
export function formatWebhookPayload(
  channel: WebhookChannel,
  payload: WebhookPayload
): any {
  const { deposit, user } = payload;
  const event = payload.event || payload.eventType || 'MATURITY_ALERT';
  const timestamp = payload.timestamp || new Date().toISOString();

  const bankName = deposit?.bankName || 'Unknown Bank';
  const accountNumber = deposit?.accountNumber || 'N/A';
  const principal = Number(deposit?.principal ?? deposit?.principalAmount ?? 0);
  const maturityAmount = Number(deposit?.maturityAmount ?? principal);
  const daysRemaining = Number(deposit?.daysRemaining ?? 0);

  const maturityDateRaw = deposit?.maturityDate;
  const maturityDateStr = maturityDateRaw
    ? (typeof maturityDateRaw === 'string'
        ? maturityDateRaw.split('T')[0]
        : maturityDateRaw.toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0];

  const defaultMessage =
    event === 'MATURED_TODAY'
      ? `Fixed deposit ${accountNumber} at ${bankName} for $${principal.toLocaleString()} has matured today ($${maturityAmount.toLocaleString()} payout).`
      : `Fixed deposit ${accountNumber} at ${bankName} ($${principal.toLocaleString()}) matures in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} on ${maturityDateStr}.`;

  const message = payload.message || defaultMessage;

  switch (channel) {
    case 'slack':
      return {
        text: `🚨 AssetPulse Alert: Fixed Deposit at ${bankName} (${accountNumber}) - ${message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${event === 'MATURED_TODAY' ? 'Deposit Matured' : 'Upcoming Maturity Alert'}*: ${bankName} (${accountNumber})\n*Principal*: $${principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n*Payout*: $${maturityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n*Maturity Date*: ${maturityDateStr}\n*Days Remaining*: ${daysRemaining}\n\n>${message}`,
            },
          },
        ],
      };

    case 'discord':
      return {
        content: `🚨 **AssetPulse Alert**: ${message}`,
        embeds: [
          {
            title: `AssetPulse: ${bankName} (${accountNumber})`,
            description: message,
            color: event === 'MATURED_TODAY' ? 0xe11d48 : 0xf59e0b,
            fields: [
              { name: 'Bank', value: bankName, inline: true },
              { name: 'Account', value: accountNumber, inline: true },
              { name: 'Principal', value: `$${principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
              { name: 'Estimated Payout', value: `$${maturityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
              { name: 'Maturity Date', value: maturityDateStr, inline: true },
              { name: 'Days Remaining', value: String(daysRemaining), inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'AssetPulse Notification Engine' },
          },
        ],
      };

    case 'telegram':
      return {
        text: `🚨 *AssetPulse Maturity Alert*\n\n🏦 *Bank*: ${bankName}\n📄 *Account*: \`${accountNumber}\`\n💰 *Principal*: $${principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n💵 *Estimated Payout*: $${maturityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n📅 *Maturity Date*: ${maturityDateStr}\n⏳ *Days Left*: ${daysRemaining}\n\n_${message}_`,
        parse_mode: 'Markdown',
      };

    case 'generic':
    default:
      return {
        event,
        eventType: 'MATURITY_ALERT',
        timestamp,
        message,
        bankName,
        principal,
        maturityDate: maturityDateStr,
        deposit: {
          id: deposit?.id,
          bankName,
          accountNumber,
          principal,
          principalAmount: principal,
          maturityAmount,
          maturityDate: maturityDateStr,
          daysRemaining,
          annualRate: deposit?.annualRate,
          compoundingFrequency: deposit?.compoundingFrequency,
          status: deposit?.status,
        },
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name ?? null,
            }
          : undefined,
      };
  }
}

/**
 * Dispatches a formatted payload over HTTP POST with timeout protection and safe error suppression.
 */
export async function sendWebhook(
  url: string,
  payload: any,
  options?: WebhookSendOptions
): Promise<WebhookSendResult> {
  const timeoutMs = options?.timeoutMs ?? (Number(process.env.WEBHOOK_TIMEOUT_MS) || 5000);
  const startTime = Date.now();

  const validation = validateWebhookUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error || 'Invalid webhook target URL.',
      durationMs: 0,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AssetPulse-Webhook-Dispatcher/1.0',
        ...(options?.headers || {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const statusText = response.statusText || 'Error';
      return {
        success: false,
        statusCode: response.status,
        error: `Remote webhook responded with HTTP ${response.status}: ${statusText}`,
        durationMs,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      durationMs,
    };
  } catch (error: any) {
    clearTimeout(timer);
    const durationMs = Date.now() - startTime;
    const isTimeout = error?.name === 'AbortError' || error?.code === 20;
    const errorMessage = isTimeout
      ? `Webhook delivery timed out after ${timeoutMs}ms`
      : error?.message || 'Network communication error during webhook delivery';

    return {
      success: false,
      error: errorMessage,
      durationMs,
    };
  }
}

/**
 * High-level dispatch helper integrated into the Maturity Proximity Scanner.
 * Fails safely and never throws exceptions to the caller.
 */
export async function dispatchWebhookAlert(
  payload: WebhookPayload,
  targetUrl?: string,
  targetChannel?: WebhookChannel
): Promise<boolean> {
  const url = (targetUrl || process.env.WEBHOOK_URL || '').trim();
  if (!url) {
    return false; // Silently skip if no outbound webhook URL is configured
  }

  const channel = (targetChannel || process.env.WEBHOOK_TYPE || detectWebhookChannel(url) || 'generic').toLowerCase() as WebhookChannel;
  const formattedPayload = formatWebhookPayload(channel, payload);

  try {
    const result = await sendWebhook(url, formattedPayload);
    if (!result.success) {
      console.warn(`[AssetPulse Webhook] Outbound delivery warning: ${result.error}`);
    }
    return result.success;
  } catch (err: any) {
    console.error(`[AssetPulse Webhook] Outbound dispatch exception suppressed: ${err?.message || err}`);
    return false;
  }
}

/**
 * Sends a structured test ping to validate webhook connectivity.
 */
export async function sendTestWebhookPing(
  url: string,
  channel?: WebhookChannel
): Promise<WebhookSendResult> {
  const val = validateWebhookUrl(url);
  if (!val.valid) {
    return {
      success: false,
      error: val.error,
      durationMs: 0,
    };
  }

  const resolvedChannel = channel || detectWebhookChannel(url);
  const testPayload: WebhookPayload = {
    event: 'MATURITY_ALERT',
    eventType: 'MATURITY_ALERT',
    timestamp: new Date().toISOString(),
    message: 'Test ping from AssetPulse Maturity Tracking & Notification Engine',
    deposit: {
      id: 'test-deposit-sample-uuid',
      bankName: 'AssetPulse Test Bank',
      accountNumber: 'TEST-FD-8888',
      principal: 100000,
      principalAmount: 100000,
      maturityAmount: 107500,
      maturityDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      daysRemaining: 7,
      annualRate: 7.5,
      compoundingFrequency: 'QUARTERLY',
      status: 'ACTIVE',
    },
  };

  const formatted = formatWebhookPayload(resolvedChannel, testPayload);
  return sendWebhook(url, formatted, { timeoutMs: 5000 });
}
