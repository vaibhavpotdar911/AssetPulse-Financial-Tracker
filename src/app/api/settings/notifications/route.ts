import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';
import { verifyEmailConnection, sendMaturityEmail } from '@/lib/email';
import { verifyTelegramCredentials, sendTelegramMaturityAlert } from '@/lib/telegram';

/**
 * GET /api/settings/notifications
 * Retrieves current user's email and telegram notification settings.
 */
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    let settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId: user.id,
          emailTo: user.email,
        },
      });
    }

    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        // Mask passwords on fetch
        smtpPassword: settings.smtpPassword ? '••••••••' : '',
        telegramBotToken: settings.telegramBotToken ? '••••••••' : '',
      },
    });
  } catch (err: any) {
    console.error('Error fetching notification settings:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve notification settings' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/settings/notifications
 * Updates user's email and telegram notification configuration.
 */
export const PUT = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json();

    const existing = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    const updateData: any = {
      emailAlertsEnabled: Boolean(body.emailAlertsEnabled),
      emailProvider: body.emailProvider || 'custom_smtp',
      emailTo: body.emailTo?.trim() || user.email,
      smtpHost: body.smtpHost?.trim() || null,
      smtpPort: body.smtpPort ? parseInt(body.smtpPort, 10) : 587,
      smtpSecure: Boolean(body.smtpSecure),
      smtpUser: body.smtpUser?.trim() || null,
      smtpFrom: body.smtpFrom?.trim() || null,

      telegramAlertsEnabled: Boolean(body.telegramAlertsEnabled),
      telegramChatId: body.telegramChatId?.trim() || null,

      notifyMaturedToday: body.notifyMaturedToday ?? true,
      notify7Days: body.notify7Days ?? true,
      notify14Days: body.notify14Days ?? true,
      notify30Days: body.notify30Days ?? false,
    };

    // Only update passwords/tokens if new values were provided (not masked)
    if (body.smtpPassword && body.smtpPassword !== '••••••••') {
      updateData.smtpPassword = body.smtpPassword;
    }
    if (body.telegramBotToken && body.telegramBotToken !== '••••••••') {
      updateData.telegramBotToken = body.telegramBotToken.trim();
    }

    const updated = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...updateData,
        smtpPassword: body.smtpPassword && body.smtpPassword !== '••••••••' ? body.smtpPassword : null,
        telegramBotToken: body.telegramBotToken && body.telegramBotToken !== '••••••••' ? body.telegramBotToken.trim() : null,
      },
      update: updateData,
    });

    return NextResponse.json({
      success: true,
      settings: {
        ...updated,
        smtpPassword: updated.smtpPassword ? '••••••••' : '',
        telegramBotToken: updated.telegramBotToken ? '••••••••' : '',
      },
    });
  } catch (err: any) {
    console.error('Error saving notification settings:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification settings' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/settings/notifications
 * Action dispatcher for testing email or telegram connectivity.
 * Payload: { action: 'test-email' | 'test-telegram', ...credentials }
 */
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json();
    const action = body.action;

    const existingSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (action === 'test-email') {
      const host = body.smtpHost || existingSettings?.smtpHost;
      const port = body.smtpPort ? parseInt(body.smtpPort, 10) : existingSettings?.smtpPort || 587;
      const userParam = body.smtpUser || existingSettings?.smtpUser;
      const password = (body.smtpPassword && body.smtpPassword !== '••••••••')
        ? body.smtpPassword
        : existingSettings?.smtpPassword;
      const from = body.smtpFrom || existingSettings?.smtpFrom || userParam;
      const to = body.emailTo || existingSettings?.emailTo || user.email;

      if (!host || !userParam || !password || !from) {
        return NextResponse.json(
          { success: false, error: 'SMTP Host, User, Password, and From address are required for email test.' },
          { status: 400 }
        );
      }

      // 1. Verify connection
      const verifyRes = await verifyEmailConnection({
        host,
        port,
        secure: Boolean(body.smtpSecure ?? existingSettings?.smtpSecure),
        user: userParam,
        password,
        from,
      });

      if (!verifyRes.success) {
        return NextResponse.json({ success: false, error: verifyRes.error }, { status: 400 });
      }

      // 2. Dispatch a sample test email
      const sendRes = await sendMaturityEmail(
        {
          host,
          port,
          secure: Boolean(body.smtpSecure ?? existingSettings?.smtpSecure),
          user: userParam,
          password,
          from,
        },
        {
          to,
          recipientName: user.name || 'AssetPulse User',
          bankName: 'HDFC Bank (Sample Test)',
          accountNumber: 'FD-SAMPLE-9901',
          principalAmount: 100000,
          maturityAmount: 107500,
          maturityDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          daysRemaining: 0,
          eventType: 'MATURED_TODAY',
          currencySymbol: '₹',
        }
      );

      if (!sendRes.success) {
        return NextResponse.json({ success: false, error: sendRes.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: `Test email successfully sent to ${to}! Check your inbox.`,
      });
    }

    if (action === 'test-telegram') {
      const botToken = (body.telegramBotToken && body.telegramBotToken !== '••••••••')
        ? body.telegramBotToken.trim()
        : existingSettings?.telegramBotToken;
      const chatId = body.telegramChatId?.trim() || existingSettings?.telegramChatId;

      if (!botToken || !chatId) {
        return NextResponse.json(
          { success: false, error: 'Telegram Bot Token and Chat ID are required.' },
          { status: 400 }
        );
      }

      const verifyRes = await verifyTelegramCredentials({ botToken, chatId });
      if (!verifyRes.success) {
        return NextResponse.json({ success: false, error: verifyRes.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: `Successfully sent test ping to Telegram! Bot: ${verifyRes.botName}`,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Error testing notification service:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal test error' },
      { status: 500 }
    );
  }
});
