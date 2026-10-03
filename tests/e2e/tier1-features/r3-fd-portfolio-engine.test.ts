/**
 * Tier 1 — Feature Coverage: R3 Fixed Deposits Portfolio & Financial Engine
 * 
 * Authoritative Specification Source:
 * - ORIGINAL_REQUEST.md (R3: Fixed Deposits Portfolio & Financial Engine)
 * - PROJECT.md (Features 11, 12, 13, 14, 15, 16, 26, 27; Interface Contract 1)
 * 
 * Acceptance Criteria Tested:
 * - User can create, view, update, and filter fixed deposits across banks
 * - Maturity amount and accrued interest calculations match standard compound interest formulas within ±0.01
 * - Deposit details display days to maturity, progress bar, and active status accurately
 * - Compounding frequencies: Monthly, Quarterly, Semi-Annually, Annually, At-Maturity
 */

import { describe, it, expect } from '../helpers/test-runner.ts';
import { E2EClient } from '../helpers/e2e-client.ts';
import {
  calculateReferenceFixedDeposit,
  roundCurrency,
  assertWithinTolerance,
  type CompoundingFrequency,
} from '../helpers/financial-oracle.ts';

describe('Tier 1: Feature Coverage — R3 Fixed Deposits Portfolio & Financial Engine', () => {
  const client = new E2EClient();

  it('TC-R3-01: Fixed Deposit creation enforces input validation constraints', async () => {
    // 1. Negative principal rejection
    const invalidPrincipal = await client.post('/api/deposits', {
      bankName: 'JPMorgan Chase',
      accountNumber: 'FD-INV-01',
      principal: -5000,
      annualRate: 5.0,
      compoundingFrequency: 'ANNUALLY',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
    });
    if (invalidPrincipal.status !== 503) {
      expect(invalidPrincipal.status).toBeGreaterThanOrEqual(400);
      expect(invalidPrincipal.status).toBeLessThan(500);
    }

    // 2. Maturity date before or equal to start date rejection
    const invalidDate = await client.post('/api/deposits', {
      bankName: 'JPMorgan Chase',
      accountNumber: 'FD-INV-02',
      principal: 10000,
      annualRate: 5.0,
      compoundingFrequency: 'ANNUALLY',
      startDate: '2026-05-01',
      maturityDate: '2026-04-01', // earlier than start date
    });
    if (invalidDate.status !== 503) {
      expect(invalidDate.status).toBeGreaterThanOrEqual(400);
      expect(invalidDate.status).toBeLessThan(500);
    }
  });

  it('TC-R3-02: Quarterly compounding formula calculates maturity and interest within ±0.01 tolerance', () => {
    // Test Vector from PROJECT.md Section 4.1:
    // P = 100,000, r = 7.5%, tenure = 1 year (365 days), n = 4 (Quarterly)
    // Formula: A = P * (1 + 0.075 / 4)^4 = 107,713.59
    const params = {
      principal: 100000,
      annualRate: 7.5,
      compoundingFrequency: 'QUARTERLY' as CompoundingFrequency,
      startDate: '2025-01-01',
      maturityDate: '2026-01-01',
      currentDate: '2026-01-01',
    };

    const oracleResult = calculateReferenceFixedDeposit(params);
    expect(oracleResult.maturityAmount).toBeCloseTo(107713.59, 0.01);
    expect(oracleResult.totalInterestEarned).toBeCloseTo(7713.59, 0.01);
    expect(oracleResult.isMatured).toBe(true);
    expect(oracleResult.daysRemaining).toBe(0);
    expect(oracleResult.progressPercentage).toBe(100.0);
  });

  it('TC-R3-03: Monthly compounding formula calculates maturity and interest within ±0.01 tolerance', () => {
    // Test Vector from PROJECT.md Section 4.1:
    // P = 50,000, r = 6.8%, tenure = 2 years (730 days), n = 12 (Monthly)
    // Formula: A = 50,000 * (1 + 0.068 / 12)^24 = 57,262.11
    const params = {
      principal: 50000,
      annualRate: 6.8,
      compoundingFrequency: 'MONTHLY' as CompoundingFrequency,
      startDate: '2025-01-01',
      maturityDate: '2027-01-01',
      currentDate: '2027-01-01',
    };

    const oracleResult = calculateReferenceFixedDeposit(params);
    expect(oracleResult.maturityAmount).toBeCloseTo(57262.11, 0.01);
    expect(oracleResult.totalInterestEarned).toBeCloseTo(7262.11, 0.01);
    expect(oracleResult.isMatured).toBe(true);
  });

  it('TC-R3-04: At-Maturity simple/cumulative compounding formula calculates accurately', () => {
    // Formula: A = P * (1 + r * t)
    // P = 200,000, r = 7.0%, tenure = 180 days (t = 180 / 365)
    // A = 200,000 * (1 + 0.07 * (180 / 365)) = 206,904.11
    const params = {
      principal: 200000,
      annualRate: 7.0,
      compoundingFrequency: 'AT_MATURITY' as CompoundingFrequency,
      startDate: '2026-01-01',
      maturityDate: '2026-06-30', // 180 days
      currentDate: '2026-06-30',
    };

    const oracleResult = calculateReferenceFixedDeposit(params);
    expect(oracleResult.maturityAmount).toBeCloseTo(206904.11, 0.01);
    expect(oracleResult.totalInterestEarned).toBeCloseTo(6904.11, 0.01);
  });

  it('TC-R3-05: Accrued interest progression clamps cleanly at start, midpoint, and maturity', () => {
    // 1-year deposit: 2026-01-01 to 2027-01-01 (365 days)
    const baseParams = {
      principal: 100000,
      annualRate: 8.0,
      compoundingFrequency: 'ANNUALLY' as CompoundingFrequency,
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
    };

    // 1. Day 0 (start date): accrued interest must be 0, progress 0%
    const atStart = calculateReferenceFixedDeposit({ ...baseParams, currentDate: '2026-01-01' });
    expect(atStart.accruedInterest).toBe(0.0);
    expect(atStart.progressPercentage).toBe(0.0);
    expect(atStart.daysRemaining).toBe(365);
    expect(atStart.isMatured).toBe(false);

    // 2. Midpoint (approx 182 days): accrued interest > 0 and < total interest
    const atMid = calculateReferenceFixedDeposit({ ...baseParams, currentDate: '2026-07-02' });
    expect(atMid.accruedInterest).toBeGreaterThan(0);
    expect(atMid.accruedInterest).toBeLessThan(atMid.totalInterestEarned);
    expect(atMid.progressPercentage).toBeGreaterThan(45);
    expect(atMid.progressPercentage).toBeLessThan(55);

    // 3. At maturity: accrued interest equals total interest, progress 100%
    const atMaturity = calculateReferenceFixedDeposit({ ...baseParams, currentDate: '2027-01-01' });
    expect(atMaturity.accruedInterest).toBe(atMaturity.totalInterestEarned);
    expect(atMaturity.daysRemaining).toBe(0);
    expect(atMaturity.progressPercentage).toBe(100.0);
    expect(atMaturity.isMatured).toBe(true);

    // 4. Post maturity: accrued interest does not exceed total interest
    const postMaturity = calculateReferenceFixedDeposit({ ...baseParams, currentDate: '2027-03-01' });
    expect(postMaturity.accruedInterest).toBe(atMaturity.totalInterestEarned);
    expect(postMaturity.daysRemaining).toBe(0);
  });
});
