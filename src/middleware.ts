/**
 * AssetPulse - Edge Route Protection Middleware
 * 
 * Intercepts incoming HTTP requests in Next.js Edge Runtime:
 * - Guards private web pages with 307 redirects to /login?callbackUrl=...
 * - Guards private API routes with 401 Unauthorized JSON
 * - Redirects authenticated users away from /login and /register to /dashboard
 * - Propagates verified session headers (x-user-id, x-user-email, x-user-name)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

// Protected page route prefixes requiring authentication
const PROTECTED_PAGE_PREFIXES = [
  '/dashboard',
  '/deposits',
  '/audit-logs',
  '/settings',
];

// Protected API route prefixes requiring authentication
const PROTECTED_API_PREFIXES = [
  '/api/deposits',
  '/api/audit-logs',
  '/api/notifications',
];

// Authentication UI routes (inaccessible once authenticated)
const AUTH_PAGE_PREFIXES = [
  '/login',
  '/register',
];

/**
 * Checks if a pathname matches an exact prefix or any of its subpaths.
 */
function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Validates callbackUrl to prevent Open Redirect vulnerabilities.
 */
function getSafeCallbackUrl(rawUrl: string | null): string {
  if (rawUrl && rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    return rawUrl;
  }
  return '/dashboard';
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Extract session token from cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;

  const isProtectedPage = matchesPrefix(pathname, PROTECTED_PAGE_PREFIXES);
  const isProtectedApi = matchesPrefix(pathname, PROTECTED_API_PREFIXES);
  const isAuthPage = matchesPrefix(pathname, AUTH_PAGE_PREFIXES);

  // --------------------------------------------------------------------------
  // Rule 1: Guard Protected Pages (307 Redirect to /login)
  // --------------------------------------------------------------------------
  if (isProtectedPage && !sessionUser) {
    const loginUrl = new URL('/login', request.url);
    const callbackUrl = pathname + search;
    loginUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(loginUrl, 307);
  }

  // --------------------------------------------------------------------------
  // Rule 2: Guard Protected API Routes (401 Unauthorized JSON)
  // --------------------------------------------------------------------------
  if (isProtectedApi && !sessionUser) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required to access this resource.',
      },
      { status: 401 }
    );
  }

  // --------------------------------------------------------------------------
  // Rule 3: Redirect Authenticated Users Away From Auth Pages (/dashboard)
  // --------------------------------------------------------------------------
  if (isAuthPage && sessionUser) {
    const rawCallback = request.nextUrl.searchParams.get('callbackUrl');
    const destination = getSafeCallbackUrl(rawCallback);
    return NextResponse.redirect(new URL(destination, request.url), 307);
  }

  // --------------------------------------------------------------------------
  // Rule 4: Propagate User Context Headers Downstream
  // --------------------------------------------------------------------------
  if (sessionUser) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', sessionUser.id);
    requestHeaders.set('x-user-email', sessionUser.email);
    if (sessionUser.name) {
      requestHeaders.set('x-user-name', encodeURIComponent(sessionUser.name));
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

/**
 * Matcher configuration:
 * Run middleware on all paths except Next.js internals, static assets, and images.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo\\.jpg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
