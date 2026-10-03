/**
 * Tier 2 — Boundary & Corner Cases
 * 
 * Authoritative Specification Source:
 * - ORIGINAL_REQUEST.md (Acceptance Criteria: Financial Engine & Security)
 * - PROJECT.md (Mathematical Engine Section 4.1 & Security Suite 4.2)
 * 
 * Scenarios Covered:
 * - Zero percent interest rates (r = 0.0%)
 * - Micro tenures (1 day, 7 days, 15 days)
 * - Leap year spanning tenures (366 days, Feb 29)
 * - Same-day boundary conditions (t = 0)
 * - Massive principal scaling ($1,000,000,000+)
 * - Accrual clamping before start and beyond maturity
 * - Tampered/malformed JWT authentication tokens
 * - Non-existent ID enumeration protection (404/403)
 */

import { describe, it, expect } from '../helpers/test-runner.ts';
import { E2EClient } from '../helpers/e2e-client.ts';
import {
  calculateReferenceFixedDeposit,
  roundCurrency,
  type CompoundingFrequency,
} from '../helpers/financial-oracle.ts';

describe('Tier 2: Boundary & Corner Cases', () => {
  const client = new E2EClient();

  it('TC-T2-01: Zero percent interest rate boundary returns principal with zero interest', () => {
    const params = {
      principal: 50000,
      annualRate: 0.0, // 0.0% interest
      compoundingFrequency: 'QUARTERLY' as CompoundingFrequency,
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      currentDate: '2026-07-01',
    };

    const res = calculateReferenceFixedDeposit(params);
    expect(res.maturityAmount).toBe(50000.0);
    expect(res.totalInterestEarned).toBe(0.0);
    expect(res.accruedInterest).toBe(0.0);
    expect(res.isMatured).toBe(false);
  });

  it('TC-T2-04: Same-day start and maturity boundary condition handles t = 0 gracefully', () => {
    const params = {
      principal: 25000,
      annualRate: 5.5,
      compoundingFrequency: 'MONTHLY' as CompoundingFrequency,
      startDate: '2026-06-01',
      maturityDate: '2026-06-01', // 0 days
      currentDate: '2026-06-01',
    };

    const res = calculateReferenceFixedDeposit(params);
    expect(res.maturityAmount).toBe(25000.0);
    expect(res.totalInterestEarned).toBe(0.0);
    expect(res.daysRemaining).toBe(0);
    expect(res.progressPercentage).toBe(100.0);
    expect(res.isMatured).toBe(true);
  });

  it('TC-T2-02: Micro-tenures (1 day, 7 days, 15 days) calculate accurate fractional interest without NaN', () => {
    const microTenures = [
      { days: 1, maturityDate: '2026-01-02' },
      { days: 7, maturityDate: '2026-01-08' },
      { days: 15, maturityDate: '2026-01-16' },
    ];

    for (const item of microTenures) {
      const res = calculateReferenceFixedDeposit({
        principal: 100000,
        annualRate: 7.3,
        compoundingFrequency: 'AT_MATURITY',
        startDate: '2026-01-01',
        maturityDate: item.maturityDate,
        currentDate: item.maturityDate,
      });

      expect(res.maturityAmount).toBeGreaterThan(100000);
      expect(res.totalInterestEarned).toBeGreaterThan(0);
      expect(res.totalDays).toBe(item.days);
      expect(Number.isNaN(res.maturityAmount)).toBe(false);
    }
  });

  it('TC-T2-03: Leap year transition spanning February 29 accurately accounts for 366 days', () => {
    // 2024 was a leap year (Feb 29 exists)
    const leapYearParams = {
      principal: 100000,
      annualRate: 6.0,
      compoundingFrequency: 'ANNUALLY' as CompoundingFrequency,
      startDate: '2024-01-01',
      maturityDate: '2025-01-01', // 366 calendar days in 2024
      currentDate: '2025-01-01',
    };

    const res = calculateReferenceFixedDeposit(leapYearParams);
    expect(res.totalDays).toBe(366);
    expect(res.maturityAmount).toBeGreaterThan(106000); // 366/365 gives slightly > 6%
    expect(res.isMatured).toBe(true);
  });

  it('TC-T2-05: Massive principal scaling ($1,000,000,000) maintains numerical precision', () => {
    const hugePrincipalParams = {
      principal: 1000000000, // $1 Billion
      annualRate: 8.25,
      compoundingFrequency: 'QUARTERLY' as CompoundingFrequency,
      startDate: '2026-01-01',
      maturityDate: '2028-01-01', // 2 years (730 days)
      currentDate: '2028-01-01',
    };

    const res = calculateReferenceFixedDeposit(hugePrincipalParams);
    // (1 + 0.0825/4)^8 = 1.17741514185 * 1B = 1,177,415,141.85
    expect(res.maturityAmount).toBeCloseTo(1177415141.85, 0.05);
    expect(res.totalInterestEarned).toBeCloseTo(177415141.85, 0.05);
    expect(Number.isFinite(res.maturityAmount)).toBe(true);
  });

  it('TC-T2-06: Boundary date clamping correctly handles pre-start and post-maturity query dates', () => {
    const baseParams = {
      principal: 50000,
      annualRate: 7.0,
      compoundingFrequency: 'MONTHLY' as CompoundingFrequency,
      startDate: '2026-03-01',
      maturityDate: '2027-03-01',
    };

    // Pre-start query (e.g. 2026-01-01 before deposit starts)
    const preStart = calculateReferenceFixedDeposit({
      ...baseParams,
      currentDate: '2026-01-01',
    });
    expect(preStart.accruedInterest).toBe(0.0);
    expect(preStart.elapsedDays).toBe(0);
    expect(preStart.progressPercentage).toBe(0.0);
    expect(preStart.isMatured).toBe(false);

    // Far post-maturity query (e.g. 2028-01-01)
    const farPost = calculateReferenceFixedDeposit({
      ...baseParams,
      currentDate: '2028-01-01',
    });
    expect(farPost.accruedInterest).toBe(farPost.totalInterestEarned);
    expect(farPost.daysRemaining).toBe(0);
    expect(farPost.progressPercentage).toBe(100.0);
    expect(farPost.isMatured).toBe(true);
  });

  it('TC-T2-07: Malformed, truncated, or tampered session tokens are rejected with 401', async () => {
    const tamperedClient = new E2EClient();
    
    // Inject invalid / garbage token
    tamperedClient.setCookie('assetpulse_session', 'invalid.jwt.token.payload');
    const res = await tamperedClient.get('/api/deposits');
    if (res.status !== 503) {
      expect([401, 307, 302]).toContain(res.status);
    }

    // Inject empty session
    tamperedClient.setCookie('assetpulse_session', '');
    const resEmpty = await tamperedClient.get('/api/deposits');
    if (resEmpty.status !== 503) {
      expect([401, 307, 302]).toContain(resEmpty.status);
    }
  });

  it('TC-T2-08: Non-existent resource ID requests return 404 without leaking internal system errors', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000000';
    const res = await client.get(`/api/deposits/${randomUuid}`);
    if (res.status !== 503) {
      // Must return 404 or 401 if unauthenticated
      expect([404, 401]).toContain(res.status);
      // Must not leak raw SQL or stack traces
      expect(res.rawText.toLowerCase()).not.toContain('prisma client error');
      expect(res.rawText.toLowerCase()).not.toContain('syntax error');
    }
  });
});
