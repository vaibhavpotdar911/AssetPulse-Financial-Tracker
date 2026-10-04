/**
 * AssetPulse - Immutable Audit Logging Subsystem
 * File: src/lib/audit.ts
 * 
 * Provides:
 * - Immutable, append-only financial audit trail recording
 * - Dual parameter signature support (state diffs vs explicit disposition fields)
 * - Safe JSON serialization for deep snapshot history
 * - Transaction client integration (Prisma $transaction / Prisma.TransactionClient)
 * - Resilient error handling (graceful degradation or transactional rollback)
 * - Reusable scoped query and count helpers for API routes and UI views
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

// ============================================================================
// 1. Types & Enums
// ============================================================================

export type AuditAction =
  | 'CREATE'
  | 'CREATED'
  | 'UPDATE'
  | 'UPDATED'
  | 'DELETE'
  | 'DELETED'
  | 'CLOSE'
  | 'CLOSED'
  | 'LIQUIDATE'
  | 'LIQUIDATED'
  | 'REINVEST'
  | 'REINVESTED';

export type CanonicalAuditAction =
  | 'CREATED'
  | 'UPDATED'
  | 'CLOSED'
  | 'LIQUIDATED'
  | 'DELETED';

export type DispositionType =
  | 'MATURED_REINVESTED'
  | 'TRANSFERRED_SAVINGS'
  | 'PREMATURE_WITHDRAWAL'
  | 'CORRECTION'
  | 'OTHER';

export interface AuditSnapshotPayload {
  entityType?: string;
  entityId?: string | null;
  action?: string;
  timestamp?: string;
  previousState?: Record<string, any> | null;
  newState?: Record<string, any> | null;
  details?: Record<string, any> | null;
  [key: string]: any;
}

export interface RecordAuditLogParams {
  userId: string;
  action: AuditAction | string;
  entityType?: string; // Default: 'FixedDeposit'
  entityId?: string | null;
  depositId?: string | null;

  // Financial & Disposition Metadata (Explicit or inferred)
  bankName?: string;
  accountNumber?: string;
  principalAmount?: number;
  realizedInterest?: number | null;
  penaltyAmount?: number | null;
  dispositionType?: DispositionType | string | null;
  destinationAccount?: string | null;
  notes?: string | null;

  // State diffing objects
  previousState?: Record<string, any> | null;
  newState?: Record<string, any> | null;
  details?: Record<string, any> | null;

  // Pre-formatted snapshot object or string
  snapshotData?: Record<string, any> | string;

  // Execution controls
  tx?: Prisma.TransactionClient | PrismaClient;
  throwOnError?: boolean;
}

export interface RecordAuditLogOptions {
  prismaClient?: Prisma.TransactionClient | PrismaClient;
  tx?: Prisma.TransactionClient | PrismaClient;
  throwOnError?: boolean;
}

export interface AuditLogFilterOptions {
  userId?: string;
  action?: string;
  entityId?: string | null;
  depositId?: string | null;
  bankName?: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  page?: number;
  limit?: number;
  skip?: number;
}

// ============================================================================
// 2. Normalization & Serialization Helpers
// ============================================================================

/**
 * Normalizes input action verbs to canonical database action values.
 */
export function normalizeAuditAction(rawAction: string): CanonicalAuditAction {
  const upper = (rawAction || '').trim().toUpperCase();
  switch (upper) {
    case 'CREATE':
    case 'CREATED':
      return 'CREATED';
    case 'UPDATE':
    case 'UPDATED':
      return 'UPDATED';
    case 'CLOSE':
    case 'CLOSED':
    case 'REINVEST':
    case 'REINVESTED':
      return 'CLOSED';
    case 'LIQUIDATE':
    case 'LIQUIDATED':
      return 'LIQUIDATED';
    case 'DELETE':
    case 'DELETED':
      return 'DELETED';
    default:
      return (upper as CanonicalAuditAction) || 'UPDATED';
  }
}

/**
 * Normalizes disposition types to standard accepted values.
 */
export function normalizeDispositionType(rawType?: string | null): DispositionType | null {
  if (!rawType) return null;
  const upper = rawType.trim().toUpperCase();
  if (['MATURED_REINVESTED', 'TRANSFERRED_SAVINGS', 'PREMATURE_WITHDRAWAL', 'CORRECTION', 'OTHER'].includes(upper)) {
    return upper as DispositionType;
  }
  if (upper.includes('REINVEST')) return 'MATURED_REINVESTED';
  if (upper.includes('SAVING') || upper.includes('TRANSFER')) return 'TRANSFERRED_SAVINGS';
  if (upper.includes('PREMATURE') || upper.includes('LIQUIDAT') || upper.includes('EARLY')) {
    return 'PREMATURE_WITHDRAWAL';
  }
  return 'OTHER';
}

/**
 * Safely stringifies complex nested data, avoiding circular references and BigInt serialization failures.
 */
export function safeSerializeJson(data: any): string {
  if (typeof data === 'string') {
    // Validate if it is already valid JSON
    try {
      JSON.parse(data);
      return data;
    } catch {
      // Raw string -> wrap in object
      return JSON.stringify({ message: data });
    }
  }

  const seen = new WeakSet();
  return JSON.stringify(
    data,
    (_key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    },
    2
  );
}

/**
 * Safely parses JSON strings with typed fallback.
 */
export function safeDeserializeJson<T = any>(jsonStr: string | null | undefined, fallback?: T): T {
  if (!jsonStr) return (fallback ?? {}) as T;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return (fallback ?? {}) as T;
  }
}

/**
 * Builds a unified snapshot object that preserves root attributes (bankName, principalAmount)
 * while also encapsulating previousState, newState, and disposition details.
 */
export function buildSnapshotObject(params: RecordAuditLogParams): Record<string, any> {
  const {
    previousState,
    newState,
    details,
    snapshotData,
    entityType = 'FixedDeposit',
    entityId,
    depositId,
    action,
  } = params;

  // Base snapshot object
  const rootSnapshot: Record<string, any> = {
    entityType,
    entityId: entityId || depositId || null,
    action: normalizeAuditAction(action),
    timestamp: new Date().toISOString(),
  };

  // If newState is an object, merge its direct fields to root for easy property access
  if (newState && typeof newState === 'object') {
    Object.assign(rootSnapshot, newState);
  } else if (previousState && typeof previousState === 'object') {
    Object.assign(rootSnapshot, previousState);
  }

  // If explicit snapshotData object was passed, merge it
  if (snapshotData) {
    if (typeof snapshotData === 'object') {
      Object.assign(rootSnapshot, snapshotData);
    } else if (typeof snapshotData === 'string') {
      try {
        const parsed = JSON.parse(snapshotData);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.assign(rootSnapshot, parsed);
        }
      } catch {
        rootSnapshot.rawSnapshot = snapshotData;
      }
    }
  }

  // Explicitly store state diffs under dedicated keys for UI diff inspectors
  if (previousState !== undefined) rootSnapshot.previousState = previousState;
  if (newState !== undefined) rootSnapshot.newState = newState;
  if (details !== undefined) rootSnapshot.details = details;

  return rootSnapshot;
}

// ============================================================================
// 3. Core Audit Logging Helper: recordAuditLog
// ============================================================================

/**
 * Records an immutable audit log entry in the audit_logs table.
 * 
 * Supports both signatures:
 * 1. State diff: recordAuditLog({ userId, action, entityType, entityId, previousState, newState, details })
 * 2. Explicit fields: recordAuditLog({ userId, depositId, action, bankName, accountNumber, principalAmount, ... })
 * 
 * Resilience:
 * - When used in a transaction (`tx`), rethrows errors on failure so the transaction rolls back.
 * - When used standalone, gracefully logs errors to console.error and returns null by default,
 *   unless `throwOnError: true` is explicitly requested.
 */
export async function recordAuditLog(
  params: RecordAuditLogParams,
  options?: RecordAuditLogOptions
): Promise<any | null> {
  const activeTx = options?.tx || options?.prismaClient || params.tx;
  const isTransactional = Boolean(activeTx);
  const shouldThrow =
    options?.throwOnError ??
    params.throwOnError ??
    isTransactional; // Default to throw in transactions, suppress otherwise

  try {
    const {
      userId,
      action: rawAction,
      entityId,
      depositId: explicitDepositId,
      previousState,
      newState,
      details,
    } = params;

    if (!userId) {
      throw new Error('[AssetPulse Audit] Cannot record audit log: userId is required.');
    }

    const action = normalizeAuditAction(rawAction);
    const depositId = explicitDepositId || entityId || null;

    // Infer bankName
    const bankName =
      params.bankName ||
      newState?.bankName ||
      previousState?.bankName ||
      details?.bankName ||
      'Unknown Bank';

    // Infer accountNumber
    const accountNumber =
      params.accountNumber ||
      newState?.accountNumber ||
      previousState?.accountNumber ||
      details?.accountNumber ||
      'Unknown Account';

    // Infer principalAmount
    const principalAmount = Number(
      params.principalAmount ??
      newState?.principalAmount ??
      previousState?.principalAmount ??
      details?.principalAmount ??
      0
    );

    // Infer realizedInterest
    const realizedInterest =
      params.realizedInterest !== undefined && params.realizedInterest !== null
        ? Number(params.realizedInterest)
        : details?.realizedInterest !== undefined && details?.realizedInterest !== null
        ? Number(details.realizedInterest)
        : newState?.realizedInterest !== undefined && newState?.realizedInterest !== null
        ? Number(newState.realizedInterest)
        : null;

    // Infer penaltyAmount
    const penaltyAmount =
      params.penaltyAmount !== undefined && params.penaltyAmount !== null
        ? Number(params.penaltyAmount)
        : details?.penaltyAmount !== undefined && details?.penaltyAmount !== null
        ? Number(details.penaltyAmount)
        : null;

    // Infer dispositionType
    const rawDisposition =
      params.dispositionType ||
      details?.dispositionType ||
      details?.closureReason ||
      (rawAction.toUpperCase().includes('REINVEST') ? 'MATURED_REINVESTED' : null);
    const dispositionType = normalizeDispositionType(rawDisposition);

    // Infer destinationAccount
    const destinationAccount =
      params.destinationAccount ||
      details?.destinationAccount ||
      null;

    // Infer notes
    const notes =
      params.notes ||
      details?.notes ||
      newState?.notes ||
      previousState?.notes ||
      null;

    // Build serialized snapshot
    const snapshotObject = buildSnapshotObject(params);
    const serializedSnapshot = safeSerializeJson(snapshotObject);

    const client = (activeTx || prisma) as PrismaClient;

    const auditEntry = await client.auditLog.create({
      data: {
        userId,
        depositId,
        action,
        bankName,
        accountNumber,
        principalAmount,
        realizedInterest,
        penaltyAmount,
        dispositionType,
        destinationAccount,
        notes,
        snapshotData: serializedSnapshot,
      },
    });

    return auditEntry;
  } catch (error: any) {
    console.error('[AssetPulse Audit] Failed to record audit log:', error?.message || error);
    if (shouldThrow) {
      throw error;
    }
    return null;
  }
}

// ============================================================================
// 4. Scoped Query Helpers for Route Handlers & Components
// ============================================================================

/**
 * Builds multi-tenant Prisma where filter object for audit logs.
 */
export function buildAuditLogWhereInput(
  userId: string,
  filters: AuditLogFilterOptions = {}
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {
    userId, // Strict multi-tenant isolation
  };

  // 1. Action filtering (supporting aliases and uppercase)
  if (filters.action && filters.action.toUpperCase() !== 'ALL') {
    const rawAction = filters.action.trim().toUpperCase();
    if (['CREATE', 'CREATED'].includes(rawAction)) {
      where.action = { in: ['CREATE', 'CREATED'] };
    } else if (['UPDATE', 'UPDATED'].includes(rawAction)) {
      where.action = { in: ['UPDATE', 'UPDATED'] };
    } else if (['CLOSE', 'CLOSED'].includes(rawAction)) {
      where.action = { in: ['CLOSE', 'CLOSED'] };
    } else if (['LIQUIDATE', 'LIQUIDATED'].includes(rawAction)) {
      where.action = { in: ['LIQUIDATE', 'LIQUIDATED'] };
    } else if (['DELETE', 'DELETED'].includes(rawAction)) {
      where.action = { in: ['DELETE', 'DELETED'] };
    } else if (['REINVEST', 'REINVESTED'].includes(rawAction)) {
      where.OR = [
        { action: { in: ['REINVEST', 'REINVESTED'] } },
        { dispositionType: 'MATURED_REINVESTED' },
      ];
    } else {
      where.action = rawAction;
    }
  }

  // 2. Deposit / Entity filtering
  const targetEntityId = filters.entityId || filters.depositId;
  if (targetEntityId) {
    where.depositId = targetEntityId;
  }

  // 3. Bank name filtering
  // NOTE: Do NOT use `mode: 'insensitive'` to maintain SQLite & MySQL parity
  if (filters.bankName && filters.bankName.trim()) {
    where.bankName = {
      contains: filters.bankName.trim(),
    };
  }

  // 4. Date range filtering
  const rawStart = filters.startDate || filters.fromDate;
  const rawEnd = filters.endDate || filters.toDate;

  if (rawStart || rawEnd) {
    const createdAtFilter: Prisma.DateTimeFilter = {};

    if (rawStart) {
      const startDateObj = new Date(rawStart);
      if (!isNaN(startDateObj.getTime())) {
        // If string length <= 10 (e.g. YYYY-MM-DD), force start of UTC day
        if (typeof rawStart === 'string' && rawStart.length <= 10) {
          startDateObj.setUTCHours(0, 0, 0, 0);
        }
        createdAtFilter.gte = startDateObj;
      }
    }

    if (rawEnd) {
      const endDateObj = new Date(rawEnd);
      if (!isNaN(endDateObj.getTime())) {
        // If string length <= 10 (e.g. YYYY-MM-DD), force end of UTC day
        if (typeof rawEnd === 'string' && rawEnd.length <= 10) {
          endDateObj.setUTCHours(23, 59, 59, 999);
        }
        createdAtFilter.lte = endDateObj;
      }
    }

    if (Object.keys(createdAtFilter).length > 0) {
      where.createdAt = createdAtFilter;
    }
  }

  return where;
}

/**
 * Retrieves audit logs for an authenticated user with filtering, pagination, and descending order.
 */
export async function queryAuditLogsForUser(
  userId: string,
  filters: AuditLogFilterOptions = {}
) {
  const where = buildAuditLogWhereInput(userId, filters);
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 50)));
  const page = Math.max(1, Number(filters.page || 1));
  const skip = filters.skip !== undefined ? Number(filters.skip) : (page - 1) * limit;

  return prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    skip,
  });
}

/**
 * Returns total count of audit logs matching the given filter.
 */
export async function countAuditLogsForUser(
  userId: string,
  filters: AuditLogFilterOptions = {}
): Promise<number> {
  const where = buildAuditLogWhereInput(userId, filters);
  return prisma.auditLog.count({ where });
}

/**
 * Compatibility query helper accepting { userId, bankName, action, startDate, endDate, depositId }
 */
export async function queryAuditLogs(filters: AuditLogFilterOptions & { userId: string }) {
  const where = buildAuditLogWhereInput(filters.userId, filters);
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}
