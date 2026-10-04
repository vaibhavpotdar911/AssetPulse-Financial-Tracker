/**
 * AssetPulse - Test Webhook Endpoint
 * File: src/app/api/notifications/test-webhook/route.ts
 * 
 * Protected API route allowing users to validate webhook URLs and send test pings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/session';
import { sendTestWebhookPing, validateWebhookUrl, WebhookChannel } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { webhookUrl, channel } = body || {};

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: webhookUrl must be a valid URL string.' },
        { status: 400 }
      );
    }

    const validation = validateWebhookUrl(webhookUrl);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid webhook target URL.' },
        { status: 400 }
      );
    }

    const validChannels: WebhookChannel[] = ['generic', 'slack', 'discord', 'telegram'];
    const selectedChannel =
      channel && validChannels.includes(channel.toLowerCase())
        ? (channel.toLowerCase() as WebhookChannel)
        : undefined;

    const pingResult = await sendTestWebhookPing(webhookUrl.trim(), selectedChannel);

    if (!pingResult.success) {
      const responseStatus = pingResult.statusCode && pingResult.statusCode >= 500 ? 502 : 400;
      return NextResponse.json(
        {
          success: false,
          error: pingResult.error || 'Webhook test delivery failed.',
          statusCode: pingResult.statusCode,
          durationMs: pingResult.durationMs,
        },
        { status: responseStatus }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Webhook test ping delivered successfully.',
        statusCode: pingResult.statusCode || 200,
        durationMs: pingResult.durationMs,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/notifications/test-webhook POST] Unhandled Error:', error);
    return NextResponse.json(
      { error: 'Internal server error while dispatching test webhook.' },
      { status: 500 }
    );
  }
});
