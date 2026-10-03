/**
 * AssetPulse - Multi-Tenant Session & Authorization Helpers
 * 
 * Provides bulletproof server-side session extraction, route guards,
 * and tenant-scoped query assertions for Next.js App Router API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, SessionUser } from '@/lib/auth';

export interface AuthContext {
  user: SessionUser;
}

export type AuthenticatedRouteHandler = (
  request: NextRequest,
  context: AuthContext,
  routeParams?: any
) => Promise<NextResponse>;

/**
 * Extracts and verifies session user from incoming request.
 * Returns null if missing or invalid.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<SessionUser | null> {
  return getSessionFromRequest(request);
}

/**
 * Asserts authenticated session. If unauthenticated, returns a 401 NextResponse.
 * Use for inline route protection:
 * 
 * const { user, errorResponse } = await requireAuth(request);
 * if (errorResponse) return errorResponse;
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: SessionUser; errorResponse: null } | { user: null; errorResponse: NextResponse }> {
  const user = await authenticateRequest(request);
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Valid session required.' },
        { status: 401 }
      ),
    };
  }
  return { user, errorResponse: null };
}

/**
 * Higher-order function wrapping route handlers with automated session enforcement.
 * Strips away boilerplate and guarantees authenticated user context.
 * 
 * Example usage:
 * export const GET = withAuth(async (req, { user }) => {
 *   const deposits = await prisma.fixedDeposit.findMany({
 *     where: { userId: user.id }
 *   });
 *   return NextResponse.json(deposits);
 * });
 */
export function withAuth(handler: AuthenticatedRouteHandler) {
  return async (request: NextRequest, routeParams?: any): Promise<NextResponse> => {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) {
      return errorResponse;
    }
    return handler(request, { user }, routeParams);
  };
}

/**
 * Sanitizes input body by explicitly removing any client-supplied tenancy or identity fields.
 */
export function stripTenantFields<T extends Record<string, any>>(payload: T): Omit<T, 'userId' | 'user' | 'id'> {
  const { userId, user, id, ...safePayload } = payload;
  return safePayload;
}
