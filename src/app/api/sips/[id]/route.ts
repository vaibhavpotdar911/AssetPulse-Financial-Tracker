import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/session';
import { calculateNextSipDate, SipFrequency } from '@/lib/financial';

export const dynamic = 'force-dynamic';

async function resolveId(routeParams: any): Promise<string | null> {
  if (!routeParams) return null;
  if (typeof routeParams.id === 'string') return routeParams.id;
  if (routeParams.params) {
    const resolved = await routeParams.params;
    return resolved?.id || null;
  }
  return null;
}

/**
 * PUT /api/sips/[id]
 * Updates a SIP schedule (pause, resume, adjust amount, change dates)
 */
export const PUT = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ success: false, error: 'SIP ID required' }, { status: 400 });
    }

    const body = await request.json();

    const existing = await prisma.sipSchedule.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'SIP not found' }, { status: 404 });
    }

    const updated = await prisma.sipSchedule.update({
      where: { id },
      data: {
        status: body.status !== undefined ? body.status : existing.status,
        name: body.name !== undefined ? body.name.trim() : existing.name,
        installmentAmount: body.installmentAmount ? parseFloat(body.installmentAmount) : existing.installmentAmount,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      },
    });

    return NextResponse.json({ success: true, sip: updated });
  } catch (err: any) {
    console.error('Error updating SIP:', err);
    return NextResponse.json({ success: false, error: 'Failed to update SIP' }, { status: 500 });
  }
});

/**
 * DELETE /api/sips/[id]
 * Removes a SIP schedule
 */
export const DELETE = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ success: false, error: 'SIP ID required' }, { status: 400 });
    }

    const existing = await prisma.sipSchedule.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'SIP not found' }, { status: 404 });
    }

    await prisma.sipSchedule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'SIP schedule deleted' });
  } catch (err: any) {
    console.error('Error deleting SIP:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete SIP' }, { status: 500 });
  }
});

/**
 * POST /api/sips/[id]
 * Action trigger: Records an execution / installment payout for the SIP
 * Payload: { action: 'execute', amount?: number, navOrPrice?: number, unitsAllocated?: number, notes?: string }
 */
export const POST = withAuth(async (request: NextRequest, { user }, routeParams) => {
  try {
    const id = await resolveId(routeParams);
    if (!id) {
      return NextResponse.json({ success: false, error: 'SIP ID required' }, { status: 400 });
    }

    const body = await request.json();

    if (body.action !== 'execute') {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    const sip = await prisma.sipSchedule.findFirst({
      where: { id, userId: user.id },
    });

    if (!sip) {
      return NextResponse.json({ success: false, error: 'SIP not found' }, { status: 404 });
    }

    const execAmount = body.amount ? parseFloat(body.amount) : sip.installmentAmount;
    const executionDate = body.executionDate ? new Date(body.executionDate) : new Date();

    // 1. Record installment execution
    const execution = await prisma.sipExecution.create({
      data: {
        sipScheduleId: sip.id,
        executionDate,
        amount: execAmount,
        navOrPrice: body.navOrPrice ? parseFloat(body.navOrPrice) : null,
        unitsAllocated: body.unitsAllocated ? parseFloat(body.unitsAllocated) : null,
        notes: body.notes?.trim() || 'Scheduled SIP installment executed',
      },
    });

    // 2. Advance nextExecutionDate
    const nextDate = calculateNextSipDate({
      frequency: sip.frequency as SipFrequency,
      fromDate: executionDate,
      dayOfWeek: sip.dayOfWeek || undefined,
      dayOfMonth: sip.dayOfMonth || undefined,
    });

    const updatedSip = await prisma.sipSchedule.update({
      where: { id: sip.id },
      data: {
        totalInvested: sip.totalInvested + execAmount,
        installmentsExecuted: sip.installmentsExecuted + 1,
        nextExecutionDate: nextDate,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'SIP installment recorded',
      execution,
      sip: updatedSip,
    });
  } catch (err: any) {
    console.error('Error executing SIP installment:', err);
    return NextResponse.json({ success: false, error: 'Failed to record installment' }, { status: 500 });
  }
});
