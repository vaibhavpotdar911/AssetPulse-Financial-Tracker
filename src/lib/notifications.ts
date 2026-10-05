/**
 * AssetPulse - Maturity Proximity Scanner & Notification Engine
 * File: src/lib/notifications.ts
 * 
 * Provides:
 * - Maturity threshold window classification (Today, 7-day, 14-day, 30-day)
 * - Strict deduplication logic via compound depositId + type index
 * - Dynamic notification message synthesis with bankName, accountNumber, principal
 * - Tenant-scoped scanner (scanMaturityAlertsForUser)
 * - Cross-tenant global scanner (scanAllMaturityAlerts)
 * - Multi-channel webhook dispatcher integration
 */

import { prisma } from '@/lib/db';
import { calculateFixedDeposit, parseDateUTC, CompoundingFrequency } from '@/lib/financial';
import { dispatchWebhookAlert } from '@/lib/webhook';
import { sendMaturityEmail } from '@/lib/email';
import { sendTelegramMaturityAlert } from '@/lib/telegram';

// Re-export webhook alert dispatcher for Interface Contract 5 compliance
export { dispatchWebhookAlert };

// ============================================================================
// 1. Types & Enums (PROJECT.md Interface Contract 5)
// ============================================================================

export type NotificationType =
  | 'MATURED_TODAY'
  | 'MATURING_7_DAYS'
  | 'MATURING_14_DAYS'
  | 'MATURING_30_DAYS'
  | 'SYSTEM';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface MaturityClassification {
  type: NotificationType | null;
  severity: NotificationSeverity | null;
}

export interface ScanResult {
  userId: string;
  notificationsCreated: number;
  webhooksDispatched: number;
  scanned?: number;
}

export interface ScanOptions {
  currentDate?: string | Date;
  dispatchWebhooks?: boolean;
}

// ============================================================================
// 2. Pure Classification & Content Synthesis Helpers
// ============================================================================

/**
 * Classifies days remaining into standard maturity alert windows.
 * Compliant with TC-R5-01.
 */
export function classifyMaturityWindow(daysRemaining: number): MaturityClassification {
  if (daysRemaining <= 0) {
    return { type: 'MATURED_TODAY', severity: 'critical' };
  }
  if (daysRemaining <= 7) {
    return { type: 'MATURING_7_DAYS', severity: 'warning' };
  }
  if (daysRemaining <= 14) {
    return { type: 'MATURING_14_DAYS', severity: 'warning' };
  }
  if (daysRemaining <= 30) {
    return { type: 'MATURING_30_DAYS', severity: 'info' };
  }
  return { type: null, severity: null };
}

/**
 * Generates dynamic user-friendly notification title and message.
 */
export function generateNotificationContent(
  deposit: {
    bankName: string;
    accountNumber: string;
    principalAmount: number;
    maturityAmount: number;
    maturityDate: Date | string;
  },
  type: NotificationType,
  daysRemaining: number
): { title: string; message: string } {
  const formattedPrincipal = `$${Number(deposit.principalAmount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const formattedPayout = `$${Number(deposit.maturityAmount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const formattedDate = new Date(deposit.maturityDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  switch (type) {
    case 'MATURED_TODAY':
      return {
        title: 'Fixed Deposit Matured Today!',
        message: `Your deposit ${deposit.accountNumber} at ${deposit.bankName} for ${formattedPrincipal} has reached maturity today (${formattedPayout} payout). Immediate rollover or liquidation required.`,
      };
    case 'MATURING_7_DAYS':
      return {
        title: `Maturity Alert: Maturing in ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'}`,
        message: `Deposit ${deposit.accountNumber} at ${deposit.bankName} (${formattedPrincipal}) matures on ${formattedDate} (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining). Estimated payout: ${formattedPayout}.`,
      };
    case 'MATURING_14_DAYS':
      return {
        title: `Deposit Maturing in ${daysRemaining} Days`,
        message: `Deposit ${deposit.accountNumber} at ${deposit.bankName} (${formattedPrincipal}) will mature on ${formattedDate}. Payout: ${formattedPayout}.`,
      };
    case 'MATURING_30_DAYS':
      return {
        title: `Maturity Horizon: ${daysRemaining} Days Remaining`,
        message: `Upcoming maturity for ${deposit.bankName} deposit ${deposit.accountNumber} (${formattedPrincipal}) on ${formattedDate} (30-day window).`,
      };
    default:
      return {
        title: 'Fixed Deposit Status Alert',
        message: `Status notification for deposit ${deposit.accountNumber} at ${deposit.bankName}.`,
      };
  }
}

// ============================================================================
// 3. User-Scoped Maturity Scanner: scanMaturityAlertsForUser
// ============================================================================

/**
 * Scans active fixed deposits for an authenticated user and creates deduplicated alerts.
 */
export async function scanMaturityAlertsForUser(
  userId: string,
  options?: ScanOptions
): Promise<ScanResult> {
  const currentDate = options?.currentDate ? parseDateUTC(options.currentDate) : parseDateUTC(new Date());
  const shouldDispatchWebhooks = options?.dispatchWebhooks !== false;

  // 1. Fetch active and matured deposits for this user
  const deposits = await prisma.fixedDeposit.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'MATURED'] },
    },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (deposits.length === 0) {
    return { userId, notificationsCreated: 0, webhooksDispatched: 0, scanned: 0 };
  }

  // 2. Batch-load existing notifications for deduplication
  const existingNotifications = await prisma.notification.findMany({
    where: {
      depositId: { in: deposits.map((d) => d.id) },
    },
    select: {
      depositId: true,
      type: true,
    },
  });

  const existingSet = new Set<string>(
    existingNotifications.map((n) => `${n.depositId}:${n.type}`)
  );

  let notificationsCreated = 0;
  let webhooksDispatched = 0;

  for (const deposit of deposits) {
    // 3. Calculate dynamic metrics with reference financial engine
    const metrics = calculateFixedDeposit({
      principal: deposit.principalAmount,
      annualRate: deposit.annualRate,
      compoundingFrequency: deposit.compoundingFrequency as CompoundingFrequency,
      startDate: deposit.startDate,
      maturityDate: deposit.maturityDate,
      currentDate,
    });

    const daysRemaining = metrics.daysRemaining;
    const isMatured = metrics.isMatured;

    // Transition status to MATURED if active and matured
    if (isMatured && deposit.status === 'ACTIVE') {
      await prisma.fixedDeposit.update({
        where: { id: deposit.id },
        data: { status: 'MATURED' },
      });
    }

    // 4. Classify proximity threshold
    const classification = classifyMaturityWindow(daysRemaining);
    if (!classification.type || !classification.severity) {
      continue;
    }

    // 5. Strict Deduplication Check
    const deduplicationKey = `${deposit.id}:${classification.type}`;
    if (existingSet.has(deduplicationKey)) {
      continue;
    }

    // 6. Generate dynamic content
    const content = generateNotificationContent(
      {
        ...deposit,
        maturityAmount: metrics.maturityAmount,
      },
      classification.type,
      daysRemaining
    );

    // 7. Insert Notification Record
    try {
      await prisma.notification.create({
        data: {
          userId: deposit.userId,
          depositId: deposit.id,
          type: classification.type,
          severity: classification.severity,
          title: content.title,
          message: content.message,
          isRead: false,
        },
      });

      existingSet.add(deduplicationKey);
      notificationsCreated += 1;
    } catch (err: any) {
      if (err?.code === 'P2003') {
        continue;
      }
      throw err;
    }

    // 8. Dispatch Webhook (non-blocking)
    if (shouldDispatchWebhooks) {
      const webhookSuccess = await dispatchWebhookAlert({
        event: classification.type,
        deposit: {
          ...deposit,
          daysRemaining,
          maturityAmount: metrics.maturityAmount,
        },
        user: deposit.user,
      });
      if (webhookSuccess) {
        webhooksDispatched += 1;
      }
    }

    // 9. Dispatch User-Configured Email & Telegram Alerts (Non-blocking)
    try {
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId: deposit.userId },
      });

      if (userSettings) {
        const shouldSendForThreshold =
          (classification.type === 'MATURED_TODAY' && userSettings.notifyMaturedToday) ||
          (classification.type === 'MATURING_7_DAYS' && userSettings.notify7Days) ||
          (classification.type === 'MATURING_14_DAYS' && userSettings.notify14Days) ||
          (classification.type === 'MATURING_30_DAYS' && userSettings.notify30Days);

        const maturityDateStr = new Date(deposit.maturityDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });

        // Email Alert
        if (shouldSendForThreshold && userSettings.emailAlertsEnabled && userSettings.smtpHost && userSettings.smtpUser && userSettings.smtpPassword) {
          const recipientEmail = userSettings.emailTo || deposit.user?.email;
          if (recipientEmail) {
            sendMaturityEmail(
              {
                provider: userSettings.emailProvider,
                host: userSettings.smtpHost,
                port: userSettings.smtpPort || 587,
                secure: userSettings.smtpSecure,
                user: userSettings.smtpUser,
                password: userSettings.smtpPassword,
                from: userSettings.smtpFrom || userSettings.smtpUser,
              },
              {
                to: recipientEmail,
                recipientName: deposit.user?.name || undefined,
                bankName: deposit.bankName,
                accountNumber: deposit.accountNumber,
                principalAmount: deposit.principalAmount,
                maturityAmount: metrics.maturityAmount,
                maturityDate: maturityDateStr,
                daysRemaining,
                eventType: classification.type,
              }
            ).catch((err) => console.error('[Email Notification Error]:', err));
          }
        }

        // Telegram Alert
        if (shouldSendForThreshold && userSettings.telegramAlertsEnabled && userSettings.telegramBotToken && userSettings.telegramChatId) {
          sendTelegramMaturityAlert(
            {
              botToken: userSettings.telegramBotToken,
              chatId: userSettings.telegramChatId,
            },
            {
              bankName: deposit.bankName,
              accountNumber: deposit.accountNumber,
              principalAmount: deposit.principalAmount,
              maturityAmount: metrics.maturityAmount,
              maturityDate: maturityDateStr,
              daysRemaining,
              eventType: classification.type,
            }
          ).catch((err) => console.error('[Telegram Notification Error]:', err));
        }
      }
    } catch (notificationDispatchErr) {
      // Non-blocking: keep processing deposits even if an alert channel errors
      console.warn('[Notification Multi-Channel Dispatch Warning]:', notificationDispatchErr);
    }
  }

  return {
    userId,
    notificationsCreated,
    webhooksDispatched,
    scanned: deposits.length,
  };
}

// ============================================================================
// 4. Global Cross-Tenant Maturity Scanner: scanAllMaturityAlerts
// ============================================================================

/**
 * Scans active fixed deposits across all tenant accounts.
 * Used by scheduled cron jobs.
 */
export async function scanAllMaturityAlerts(
  options?: ScanOptions
): Promise<ScanResult[]> {
  // Query all distinct user IDs with active deposits
  const activeTenants = await prisma.fixedDeposit.findMany({
    where: {
      status: { in: ['ACTIVE', 'MATURED'] },
    },
    select: {
      userId: true,
    },
    distinct: ['userId'],
  });

  const results: ScanResult[] = [];

  for (const tenant of activeTenants) {
    try {
      const userResult = await scanMaturityAlertsForUser(tenant.userId, options);
      results.push(userResult);
    } catch (err) {
      console.warn(`[scanAllMaturityAlerts] Skipped tenant ${tenant.userId}:`, err);
    }
  }

  return results;
}
