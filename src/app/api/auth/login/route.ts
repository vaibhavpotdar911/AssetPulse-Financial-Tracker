import { NextRequest, NextResponse } from 'next/server';
import { prisma, getDatabaseType, getSafeDatabaseHost } from '@/lib/db';
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Standard 10-round bcrypt hash used for constant-time dummy verification on invalid emails
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    const { email, password } = body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Find user by email (with 1 immediate retry on connection initialization failure)
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
    } catch (dbErr: any) {
      console.warn(
        `[API /api/auth/login] Initial DB query failed (${dbErr?.name || 'Error'}: ${dbErr?.message || 'unknown'}). Retrying once in 500ms...`
      );
      // Wait 500ms before retrying in case the connection pool or handshake was initializing
      await new Promise((resolve) => setTimeout(resolve, 500));
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
    }

    // 2. Constant-time password verification to prevent timing-based user enumeration
    let isPasswordValid = false;
    if (user) {
      isPasswordValid = await verifyPassword(password, user.password);
    } else {
      await verifyPassword(password, DUMMY_BCRYPT_HASH);
    }

    if (!user || !isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // 3. Generate session token
    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    // 4. Return user profile and session cookie
    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        id: user.id,
        email: user.email,
        name: user.name,
      },
      { status: 200 }
    );

    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

    return response;
  } catch (error: any) {
    console.error('[API /api/auth/login] Internal Error:', {
      name: error?.name,
      code: error?.code,
      clientVersion: error?.clientVersion,
      message: error?.message,
      hasDbUrl: Boolean(process.env.DATABASE_URL),
      dbType: getDatabaseType(),
      target: getSafeDatabaseHost(),
    });

    return NextResponse.json(
      { error: 'An unexpected error occurred during login.' },
      { status: 500 }
    );
  }
}
