/**
 * AssetPulse - Telegram Bot Dispatcher Service
 * File: src/lib/telegram.ts
 * 
 * Supports:
 * - Direct Telegram Bot API integration (Zero external library required)
 * - Message formatting with Markdown & emoji badges
 * - Bot token & Chat ID connection verification
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramDepositAlertPayload {
  bankName: string;
  accountNumber: string;
  principalAmount: number;
  maturityAmount: number;
  maturityDate: string;
  daysRemaining: number;
  eventType: string;
  currencySymbol?: string;
}

/**
 * Verifies Telegram Bot token and chat access
 */
export async function verifyTelegramCredentials(
  config: TelegramConfig
): Promise<{ success: boolean; botName?: string; error?: string }> {
  try {
    if (!config.botToken || !config.chatId) {
      return { success: false, error: 'Bot Token and Chat ID are required' };
    }

    // 1. Verify bot token
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || 'Invalid Telegram bot token' };
    }

    const botName = data.result?.first_name || data.result?.username || 'Bot';

    // 2. Test send a lightweight ping message to the chatId
    const pingRes = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: `✅ *AssetPulse Telegram Integration Active*\n\nConnected successfully to bot *@${data.result?.username}*. You will receive Fixed Deposit maturity alerts here.`,
        parse_mode: 'Markdown',
      }),
    });

    const pingData = await pingRes.json();
    if (!pingData.ok) {
      return {
        success: false,
        error: `Bot exists, but failed to send to Chat ID: ${pingData.description}. Ensure you have pressed /start with the bot.`,
      };
    }

    return { success: true, botName };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error verifying Telegram credentials' };
  }
}

/**
 * Dispatches a formatted deposit alert message to Telegram
 */
export async function sendTelegramMaturityAlert(
  config: TelegramConfig,
  payload: TelegramDepositAlertPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.botToken || !config.chatId) {
      return { success: false, error: 'Telegram configuration incomplete' };
    }

    const symbol = payload.currencySymbol || '₹';
    const isMatured = payload.daysRemaining <= 0 || payload.eventType === 'MATURED_TODAY';
    const formattedPrincipal = `${symbol}${Number(payload.principalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedPayout = `${symbol}${Number(payload.maturityAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const titleBadge = isMatured ? '🚨 *MATURED TODAY*' : `⏰ *MATURING IN ${payload.daysRemaining} DAYS*`;

    const text = [
      `${titleBadge}`,
      `*AssetPulse Fixed Deposit Alert*`,
      ``,
      `🏦 *Bank*: ${payload.bankName}`,
      `📄 *Account*: \`${payload.accountNumber}\``,
      `💰 *Principal*: ${formattedPrincipal}`,
      `💵 *Maturity Payout*: *${formattedPayout}*`,
      `📅 *Maturity Date*: ${payload.maturityDate}`,
      ``,
      isMatured
        ? `⚠️ *Action*: This deposit has reached maturity. Please liquidate or record disposition in AssetPulse.`
        : `ℹ️ *Reminder*: Upcoming maturity scheduled in ${payload.daysRemaining} days.`,
    ].join('\n');

    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || 'Telegram API returned an error' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[AssetPulse Telegram Dispatch Error]:', err);
    return { success: false, error: err.message || 'Failed to dispatch Telegram message' };
  }
}
