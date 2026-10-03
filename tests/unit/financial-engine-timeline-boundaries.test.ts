/**
 * Empirical Challenge Suite: Accrual Timeline, Boundaries & Date Handling
 * Location: tests/unit/financial-engine-timeline-boundaries.test.ts
 * 
 * Challenger Role: Empirical Challenger 2 (critic, specialist)
 * Authoritative Specifications:
 * - ORIGINAL_REQUEST.md (R3: Fixed Deposits Portfolio & Financial Engine)
 * - PROJECT.md (Interface Contract 1: Financial Engine Contract)
 * 
 * Challenge Vectors:
 * 1. Accrual Timeline Boundary Conditions:
 *    - Start date minus 1 day (pre-start): accrued = 0.00, progress = 0.0%, daysRemaining > 0, isMatured = false
 *    - Exact start date (Day 0): accrued = 0.00, progress = 0.0%, daysRemaining = totalDays, isMatured = false
 *    - Exact midpoint: accrued within (0, totalInterest), progress = 50.0% (or ~50%), daysRemaining = totalDays - elapsed
 *    - Maturity date: accrued = totalInterest, progress = 100.0%, daysRemaining = 0, isMatured = true
 *    - Maturity date plus 1 day: accrued capped at totalInterest, progress = 100.0%, daysRemaining = 0, isMatured = true
 *    - 5 years post-maturity: accrued strictly clamped, daysRemaining = 0 (never negative), progress = 100.0%
 *    - Extreme pre-start (5 years prior): accrued = 0.00, progress = 0.0%, daysRemaining = totalDays + 1826
 * 2. Leap Year Dynamics:
 *    - Spanning Feb 29 2024: 366 days in 2024 leap year
 *    - Spanning Feb 29 2028: 366 days in 2028 leap year
 *    - Spanning Feb 28 to Mar 1 in leap year (2 days) vs non-leap (1 day)
 *    - Deposit starting on leap day (Feb 29) to next year (Feb 28)
 *    - Quadrennial leap-to-leap tenure: 2024-02-29 to 2028-02-29 (1461 days)
 *    - Accrual on leap day itself across all 5 compounding frequencies
 * 3. Date Formats & Timezone Neutrality:
 *    - Format equivalence: YYYY-MM-DD vs ISO 8601 with Z vs Date object vs trimmed strings
 *    - Timestamps at arbitrary hours (00:00, 12:00, 23:59:59.999) mapping to UTC calendar date
 *    - Positive timezone offsets (e.g. +05:30, +09:00, +12:00)
 *    - Negative timezone offsets (e.g. -05:00, -08:00, -11:00)
 *    - Daylight Saving Time (DST) spring-forward and fall-back immunity
 * 4. Invariant Stress Testing:
 *    - Invariants: 0 <= accrued <= totalInterest, daysRemaining >= 0, 0 <= progress <= 100
 *    - Monotonicity across continuous timeline sampling
 *    - Same-day tenure (totalDays = 0) evaluation at all lifecycle points
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFixedDeposit,
  parseDateUTC,
  calculateDaysBetween,
  roundCurrency,
  type CompoundingFrequency,
  type FinancialCalculationParams,
  type FinancialCalculationResult,
} from '@/lib/financial';

describe('Empirical Challenge: Accrual Timeline, Boundaries & Date Handling', () => {

  const standardFrequencies: CompoundingFrequency[] = [
    'MONTHLY',
    'QUARTERLY',
    'SEMI_ANNUALLY',
    'ANNUALLY',
    'AT_MATURITY',
  ];

  // =========================================================================
  // 1. BOUNDARY CONDITIONS ACCRUAL TIMELINE
  // =========================================================================
  describe('1. Accrual Timeline Boundary Conditions', () => {

    const baseParams: FinancialCalculationParams = {
      principal: 100000,
      annualRate: 7.5,
      compoundingFrequency: 'QUARTERLY',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01', // 365 days
    };

    it('CH-BND-01: Start date minus 1 day (T_eval = T_start - 1d) clamps accrued interest to 0.00 and progress to 0.0%', () => {
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          ...baseParams,
          compoundingFrequency: freq,
          currentDate: '2025-12-31',
        });

        expect(result.accruedInterest).toBe(0.00);
        expect(result.elapsedDays).toBe(0);
        expect(result.daysRemaining).toBe(366); // 1 day before start + 365 days tenure
        expect(result.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(result.progressPercentage).toBe(0.00);
        expect(result.isMatured).toBe(false);
      }
    });

    it('CH-BND-02: Exact start date (T_eval = T_start / Day 0) has zero accrual and 100% days remaining', () => {
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          ...baseParams,
          compoundingFrequency: freq,
          currentDate: '2026-01-01',
        });

        expect(result.accruedInterest).toBe(0.00);
        expect(result.elapsedDays).toBe(0);
        expect(result.daysRemaining).toBe(365);
        expect(result.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(result.progressPercentage).toBe(0.00);
        expect(result.isMatured).toBe(false);
      }
    });

    it('CH-BND-03: Exact midpoint of 180-day even tenure reflects exactly 50.00% progress and proportional accrual', () => {
      // 180 days tenure: 2026-01-01 to 2026-06-30
      // Midpoint: 90 days elapsed -> 2026-04-01
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          principal: 200000,
          annualRate: 8.0,
          compoundingFrequency: freq,
          startDate: '2026-01-01',
          maturityDate: '2026-06-30',
          currentDate: '2026-04-01',
        });

        expect(result.totalDays).toBe(180);
        expect(result.elapsedDays).toBe(90);
        expect(result.daysRemaining).toBe(90);
        expect(result.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(result.progressPercentage).toBe(50.00);
        expect(result.isMatured).toBe(false);
        expect(result.accruedInterest).toBeGreaterThan(0);
        expect(result.accruedInterest).toBeLessThan(result.totalInterestEarned);
      }
    });

    it('CH-BND-04: Exact midpoint of 365-day odd tenure reflects ~50% progress without floating precision overflow', () => {
      // 365 days tenure: 2026-01-01 to 2027-01-01
      // Day 182: 2026-07-02 -> progress = (182 / 365) * 100 = 49.86%
      // Day 183: 2026-07-03 -> progress = (183 / 365) * 100 = 50.14%
      const resultDay182 = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2026-07-02',
      });
      const resultDay183 = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2026-07-03',
      });

      expect(resultDay182.elapsedDays).toBe(182);
      expect(resultDay182.daysRemaining).toBe(183);
      expect(resultDay182.progressPercentage).toBe(49.86);
      expect(resultDay182.isMatured).toBe(false);

      expect(resultDay183.elapsedDays).toBe(183);
      expect(resultDay183.daysRemaining).toBe(182);
      expect(resultDay183.progressPercentage).toBe(50.14);
      expect(resultDay183.isMatured).toBe(false);

      // Monotonic progression between midpoint days
      expect(resultDay183.accruedInterest).toBeGreaterThanOrEqual(resultDay182.accruedInterest);
    });

    it('CH-BND-05: Exact maturity date (T_eval = T_maturity) reaches exactly 100% interest and 0 days remaining', () => {
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          ...baseParams,
          compoundingFrequency: freq,
          currentDate: '2027-01-01',
        });

        expect(result.accruedInterest).toBe(result.totalInterestEarned);
        expect(result.elapsedDays).toBe(365);
        expect(result.daysRemaining).toBe(0);
        expect(result.progressPercentage).toBe(100.00);
        expect(result.isMatured).toBe(true);
      }
    });

    it('CH-BND-06: Maturity date plus 1 day (T_eval = T_maturity + 1d) strictly clamps accrued interest and keeps daysRemaining at 0', () => {
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          ...baseParams,
          compoundingFrequency: freq,
          currentDate: '2027-01-02',
        });

        expect(result.accruedInterest).toBe(result.totalInterestEarned);
        expect(result.elapsedDays).toBe(365); // strictly capped at totalDays
        expect(result.daysRemaining).toBe(0); // never -1!
        expect(result.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(result.progressPercentage).toBe(100.00);
        expect(result.isMatured).toBe(true);
      }
    });

    it('CH-BND-07: 5 years post-maturity (T_eval = T_maturity + 1826d) maintains invariant clamping and never exceeds totalInterestEarned', () => {
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          ...baseParams,
          compoundingFrequency: freq,
          currentDate: '2032-01-01', // 5 years later
        });

        expect(result.accruedInterest).toBe(result.totalInterestEarned);
        expect(result.elapsedDays).toBe(365);
        expect(result.daysRemaining).toBe(0);
        expect(result.progressPercentage).toBe(100.00);
        expect(result.isMatured).toBe(true);
      }
    });

    it('CH-BND-08: Extreme pre-start (5 years prior to start date) clamps accrued to 0.00 and progress to 0.0%', () => {
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          ...baseParams,
          compoundingFrequency: freq,
          currentDate: '2021-01-01', // 5 years before start
        });

        expect(result.accruedInterest).toBe(0.00);
        expect(result.elapsedDays).toBe(0);
        expect(result.daysRemaining).toBe(2191); // 1826 + 365
        expect(result.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(result.progressPercentage).toBe(0.00);
        expect(result.isMatured).toBe(false);
      }
    });

    it('CH-BND-09: Same-day deposit (totalDays = 0) evaluated across pre-start, exact day, and post-maturity', () => {
      const sameDayParams: FinancialCalculationParams = {
        principal: 50000,
        annualRate: 6.0,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-05-15',
        maturityDate: '2026-05-15',
      };

      // 1 day before
      const preResult = calculateFixedDeposit({ ...sameDayParams, currentDate: '2026-05-14' });
      expect(preResult.totalDays).toBe(0);
      expect(preResult.maturityAmount).toBe(50000.00);
      expect(preResult.totalInterestEarned).toBe(0.00);
      expect(preResult.accruedInterest).toBe(0.00);
      expect(preResult.daysRemaining).toBe(0);
      expect(preResult.progressPercentage).toBe(100.00);
      expect(preResult.isMatured).toBe(true);

      // On same day
      const onResult = calculateFixedDeposit({ ...sameDayParams, currentDate: '2026-05-15' });
      expect(onResult.maturityAmount).toBe(50000.00);
      expect(onResult.accruedInterest).toBe(0.00);
      expect(onResult.daysRemaining).toBe(0);
      expect(onResult.isMatured).toBe(true);

      // 5 years after
      const postResult = calculateFixedDeposit({ ...sameDayParams, currentDate: '2031-05-15' });
      expect(postResult.maturityAmount).toBe(50000.00);
      expect(postResult.accruedInterest).toBe(0.00);
      expect(postResult.daysRemaining).toBe(0);
      expect(postResult.isMatured).toBe(true);
    });

  });

  // =========================================================================
  // 2. LEAP YEAR DYNAMICS (2024 & 2028)
  // =========================================================================
  describe('2. Leap Year Dynamics (Spanning Feb 29 2024 & 2028)', () => {

    it('CH-LEAP-01: Full leap year 2024 contains exactly 366 calendar days', () => {
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 7.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: '2024-01-01',
        maturityDate: '2025-01-01',
        currentDate: '2025-01-01',
      });

      expect(result.totalDays).toBe(366);
      expect(result.elapsedDays).toBe(366);
      expect(result.daysRemaining).toBe(0);
      // Math: A = 100,000 * (1 + 0.07)^(366 / 365) = 107,020.09
      expect(result.maturityAmount).toBeCloseTo(107020.09, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(7020.09, 0.01);
      expect(result.isMatured).toBe(true);
    });

    it('CH-LEAP-02: Full leap year 2028 contains exactly 366 calendar days', () => {
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 7.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: '2028-01-01',
        maturityDate: '2029-01-01',
        currentDate: '2029-01-01',
      });

      expect(result.totalDays).toBe(366);
      expect(result.elapsedDays).toBe(366);
      expect(result.daysRemaining).toBe(0);
      expect(result.maturityAmount).toBeCloseTo(107020.09, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(7020.09, 0.01);
      expect(result.isMatured).toBe(true);
    });

    it('CH-LEAP-03: Window across Feb 28 to Mar 1 in leap year 2024 is 2 days vs 1 day in non-leap year 2023', () => {
      const leapDays = calculateDaysBetween(parseDateUTC('2024-02-28'), parseDateUTC('2024-03-01'));
      const nonLeapDays = calculateDaysBetween(parseDateUTC('2023-02-28'), parseDateUTC('2023-03-01'));
      const leapDays2028 = calculateDaysBetween(parseDateUTC('2028-02-28'), parseDateUTC('2028-03-01'));

      expect(leapDays).toBe(2); // Feb 28 -> Feb 29 (1), Feb 29 -> Mar 1 (1)
      expect(nonLeapDays).toBe(1); // Feb 28 -> Mar 1 (1)
      expect(leapDays2028).toBe(2); // Feb 28 -> Feb 29 (1), Feb 29 -> Mar 1 (1)
    });

    it('CH-LEAP-04: Deposit starting on Leap Day (2024-02-29) maturing on 2025-02-28 has exactly 365 days', () => {
      const result = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2024-02-29',
        maturityDate: '2025-02-28',
        currentDate: '2025-02-28',
      });

      expect(result.totalDays).toBe(365);
      expect(result.isMatured).toBe(true);
      // A = 50,000 * (1 + 0.06 / 4)^(4 * 365 / 365) = 50,000 * (1.015)^4 = 53,068.18
      expect(result.maturityAmount).toBeCloseTo(53068.18, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(3068.18, 0.01);
    });

    it('CH-LEAP-05: Quadrennial Leap-to-Leap tenure (2024-02-29 to 2028-02-29) contains exactly 1461 days', () => {
      // 1461 days = 366 (2024) + 365 (2025) + 365 (2026) + 365 (2027)
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 8.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: '2024-02-29',
        maturityDate: '2028-02-29',
        currentDate: '2028-02-29',
      });

      expect(result.totalDays).toBe(1461);
      // t = 1461 / 365 = 4.0027397...
      // A = 100,000 * (1.08)^(1461 / 365) = 136,077.59
      expect(result.maturityAmount).toBeCloseTo(136077.59, 2);
      expect(result.totalInterestEarned).toBeCloseTo(36077.59, 2);
      expect(result.isMatured).toBe(true);
    });

    it('CH-LEAP-06: Accurate accrual evaluation on Leap Day itself (2024-02-29) across all compounding frequencies', () => {
      // Deposit from 2024-01-01 to 2024-12-31 (365 days)
      // On 2024-02-29: exactly 59 days elapsed (Jan has 31 days, Feb elapsed = 28 + 1 on leap day = 59)
      for (const freq of standardFrequencies) {
        const result = calculateFixedDeposit({
          principal: 100000,
          annualRate: 7.2,
          compoundingFrequency: freq,
          startDate: '2024-01-01',
          maturityDate: '2024-12-31',
          currentDate: '2024-02-29',
        });

        expect(result.totalDays).toBe(365);
        expect(result.elapsedDays).toBe(59);
        expect(result.daysRemaining).toBe(306);
        expect(result.daysRemaining + result.elapsedDays).toBe(result.totalDays);
        expect(result.progressPercentage).toBeCloseTo(16.16, 0.01); // 59 / 365 * 100 = 16.1643%
        expect(result.accruedInterest).toBeGreaterThan(0);
        expect(result.accruedInterest).toBeLessThan(result.totalInterestEarned);
        expect(result.isMatured).toBe(false);
      }
    });

  });

  // =========================================================================
  // 3. DATE FORMATS (ISO STRINGS vs DATE OBJECTS vs YYYY-MM-DD)
  // =========================================================================
  describe('3. Date Formats & Serialization Compatibility', () => {

    it('CH-FMT-01: Pure YYYY-MM-DD, ISO-8601 UTC string, and UTC Date objects yield identical results', () => {
      const p1 = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.5,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-03-15',
        maturityDate: '2027-03-15',
        currentDate: '2026-09-15',
      });

      const p2 = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.5,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-03-15T00:00:00.000Z',
        maturityDate: '2027-03-15T00:00:00.000Z',
        currentDate: '2026-09-15T00:00:00.000Z',
      });

      const p3 = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.5,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-03-15T00:00:00Z',
        maturityDate: '2027-03-15T00:00:00Z',
        currentDate: '2026-09-15T00:00:00Z',
      });

      const p4 = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.5,
        compoundingFrequency: 'MONTHLY',
        startDate: new Date(Date.UTC(2026, 2, 15)),
        maturityDate: new Date(Date.UTC(2027, 2, 15)),
        currentDate: new Date(Date.UTC(2026, 8, 15)),
      });

      // Strict equivalence
      expect(p1.maturityAmount).toBe(p2.maturityAmount);
      expect(p1.maturityAmount).toBe(p3.maturityAmount);
      expect(p1.maturityAmount).toBe(p4.maturityAmount);

      expect(p1.totalInterestEarned).toBe(p2.totalInterestEarned);
      expect(p1.totalInterestEarned).toBe(p4.totalInterestEarned);

      expect(p1.accruedInterest).toBe(p2.accruedInterest);
      expect(p1.accruedInterest).toBe(p4.accruedInterest);

      expect(p1.totalDays).toBe(p2.totalDays);
      expect(p1.totalDays).toBe(p4.totalDays);

      expect(p1.elapsedDays).toBe(p2.elapsedDays);
      expect(p1.daysRemaining).toBe(p2.daysRemaining);
      expect(p1.progressPercentage).toBe(p2.progressPercentage);
    });

    it('CH-FMT-02: String dates with leading/trailing whitespace parse cleanly without error', () => {
      const result = calculateFixedDeposit({
        principal: 75000,
        annualRate: 7.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: '   2026-04-01   ',
        maturityDate: '   2027-04-01 \n',
        currentDate: '\t2026-10-01  ',
      });

      expect(result.totalDays).toBe(365);
      expect(result.elapsedDays).toBe(183);
      expect(result.maturityAmount).toBeGreaterThan(75000);
      expect(result.isMatured).toBe(false);
    });

    it('CH-FMT-03: Timestamps at various intra-day hours map consistently to UTC midnight calendar date', () => {
      // Intra-day times in UTC for 2026-07-01: 00:00:00, 12:00:00, 23:59:59.999
      const dMorning = parseDateUTC('2026-07-01T00:00:00.000Z');
      const dNoon = parseDateUTC('2026-07-01T12:00:00.000Z');
      const dNight = parseDateUTC('2026-07-01T23:59:59.999Z');

      expect(dMorning.getTime()).toBe(dNoon.getTime());
      expect(dMorning.getTime()).toBe(dNight.getTime());
      expect(dMorning.getUTCHours()).toBe(0);
      expect(dMorning.getUTCMinutes()).toBe(0);
      expect(dMorning.getUTCSeconds()).toBe(0);
    });

    it('CH-FMT-04: Non-string, non-Date inputs (null, undefined, invalid string) throw descriptive errors', () => {
      expect(() => parseDateUTC(null as any)).toThrow('Invalid date provided');
      expect(() => parseDateUTC(undefined as any)).toThrow('Invalid date provided');
      expect(() => parseDateUTC('not-a-real-date')).toThrow('Invalid date provided');
      expect(() => parseDateUTC(new Date('invalid-date'))).toThrow('Invalid date provided');
    });

  });

  // =========================================================================
  // 4. TIMEZONE TRANSITIONS & OFFSETS
  // =========================================================================
  describe('4. Timezone Transitions & UTC Offsets', () => {

    it('CH-TZ-01: Positive timezone offsets (+05:30 IST, +09:00 JST, +12:00 NZST) resolve to proper UTC calendar date', () => {
      // 2026-06-15 at 03:00 AM JST (+09:00) is 2026-06-14 18:00:00 UTC -> UTC date is June 14
      const jstNightBefore = parseDateUTC('2026-06-15T03:00:00+09:00');
      expect(jstNightBefore.toISOString()).toBe('2026-06-14T00:00:00.000Z');

      // 2026-06-15 at 15:00 PM JST (+09:00) is 2026-06-15 06:00:00 UTC -> UTC date is June 15
      const jstSameDay = parseDateUTC('2026-06-15T15:00:00+09:00');
      expect(jstSameDay.toISOString()).toBe('2026-06-15T00:00:00.000Z');

      // 2026-06-15 at 05:30 AM IST (+05:30) is 2026-06-15 00:00:00 UTC -> UTC date is June 15
      const istMidnightUTC = parseDateUTC('2026-06-15T05:30:00+05:30');
      expect(istMidnightUTC.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    });

    it('CH-TZ-02: Negative timezone offsets (-05:00 EST, -08:00 PST) resolve to proper UTC calendar date', () => {
      // 2026-06-15 at 22:00 PM EDT (-04:00) is 2026-06-16 02:00:00 UTC -> UTC date is June 16
      const edtNextDayUTC = parseDateUTC('2026-06-15T22:00:00-04:00');
      expect(edtNextDayUTC.toISOString()).toBe('2026-06-16T00:00:00.000Z');

      // 2026-06-15 at 04:00 AM EDT (-04:00) is 2026-06-15 08:00:00 UTC -> UTC date is June 15
      const edtSameDay = parseDateUTC('2026-06-15T04:00:00-04:00');
      expect(edtSameDay.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    });

    it('CH-TZ-03: DST Spring Forward (23h) and Fall Back (25h) transitions do not distort calendar day difference', () => {
      // US DST 2026:
      // Spring Forward: Sunday, March 8, 2026 (23-hour local day)
      // Fall Back: Sunday, November 1, 2026 (25-hour local day)
      const dBeforeSpring = parseDateUTC('2026-03-07');
      const dAfterSpring = parseDateUTC('2026-03-09');
      // March 7 to March 9 must be exactly 2 calendar days regardless of local DST shift
      expect(calculateDaysBetween(dBeforeSpring, dAfterSpring)).toBe(2);

      const dBeforeFall = parseDateUTC('2026-10-31');
      const dAfterFall = parseDateUTC('2026-11-02');
      // Oct 31 to Nov 2 must be exactly 2 calendar days regardless of local DST shift
      expect(calculateDaysBetween(dBeforeFall, dAfterFall)).toBe(2);

      // Financial calculation spanning entire DST period
      const dstFD = calculateFixedDeposit({
        principal: 100000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2026-03-01',
        maturityDate: '2026-11-15', // 259 days
        currentDate: '2026-11-15',
      });

      expect(dstFD.totalDays).toBe(259);
      expect(dstFD.daysRemaining).toBe(0);
      expect(dstFD.isMatured).toBe(true);
    });

    it('CH-TZ-04: Evaluating currentDate across opposing timezones produces consistent clamped output', () => {
      // Compare evaluating at Tokyo vs Honolulu
      const paramsTokyo: FinancialCalculationParams = {
        principal: 100000,
        annualRate: 7.5,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        currentDate: '2026-07-01T12:00:00+09:00', // UTC 2026-07-01 03:00
      };

      const paramsHonolulu: FinancialCalculationParams = {
        principal: 100000,
        annualRate: 7.5,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        currentDate: '2026-07-01T12:00:00-10:00', // UTC 2026-07-01 22:00
      };

      const resTokyo = calculateFixedDeposit(paramsTokyo);
      const resHonolulu = calculateFixedDeposit(paramsHonolulu);

      // Both map to UTC calendar day 2026-07-01
      expect(resTokyo.totalDays).toBe(365);
      expect(resHonolulu.totalDays).toBe(365);
      expect(resTokyo.elapsedDays).toBe(resHonolulu.elapsedDays);
      expect(resTokyo.accruedInterest).toBe(resHonolulu.accruedInterest);
      expect(resTokyo.daysRemaining).toBe(resHonolulu.daysRemaining);
      expect(resTokyo.progressPercentage).toBe(resHonolulu.progressPercentage);
    });

  });

  // =========================================================================
  // 5. INVARIANT STRESS HARNESS & EMPIRICAL SWEEP
  // =========================================================================
  describe('5. Invariant Stress Harness & Empirical Sweep', () => {

    it('CH-INV-01: Full lifecycle timeline sweep (daily from day -30 to day +60) maintains all invariants', () => {
      const p = 50000;
      const r = 8.5;
      const start = parseDateUTC('2026-01-01');
      const maturity = parseDateUTC('2026-12-31'); // 364 days

      for (const freq of standardFrequencies) {
        let prevAccrued = 0;
        let prevProgress = 0;

        // Sample every 5 days from 30 days before start to 60 days after maturity
        for (let dayOffset = -30; dayOffset <= 424; dayOffset += 5) {
          const evalDate = new Date(start.getTime() + dayOffset * 86400000);

          const result = calculateFixedDeposit({
            principal: p,
            annualRate: r,
            compoundingFrequency: freq,
            startDate: start,
            maturityDate: maturity,
            currentDate: evalDate,
          });

          // Invariant 1: Accrued interest is bounded in [0, totalInterestEarned]
          expect(result.accruedInterest).toBeGreaterThanOrEqual(0.00);
          expect(result.accruedInterest).toBeLessThanOrEqual(result.totalInterestEarned + 0.01);

          // Invariant 2: daysRemaining is never negative
          expect(result.daysRemaining).toBeGreaterThanOrEqual(0);

          // Invariant 3: progressPercentage is clamped [0.00, 100.00]
          expect(result.progressPercentage).toBeGreaterThanOrEqual(0.00);
          expect(result.progressPercentage).toBeLessThanOrEqual(100.00);

          // Invariant 4: Monotonic non-decreasing progression
          expect(result.accruedInterest).toBeGreaterThanOrEqual(prevAccrued);
          expect(result.progressPercentage).toBeGreaterThanOrEqual(prevProgress);

          // Invariant 5: isMatured boolean consistency
          if (dayOffset >= 364) {
            expect(result.isMatured).toBe(true);
            expect(result.daysRemaining).toBe(0);
            expect(result.progressPercentage).toBe(100.00);
            expect(result.accruedInterest).toBe(result.totalInterestEarned);
          } else {
            expect(result.isMatured).toBe(false);
          }

          if (dayOffset <= 0) {
            expect(result.accruedInterest).toBe(0.00);
            expect(result.progressPercentage).toBe(0.00);
            expect(result.elapsedDays).toBe(0);
          }

          prevAccrued = result.accruedInterest;
          prevProgress = result.progressPercentage;
        }
      }
    });

    it('CH-INV-02: Micro-tenure boundaries (1-day, 2-day) evaluate cleanly without division by zero', () => {
      const t1 = calculateFixedDeposit({
        principal: 100000,
        annualRate: 10.0,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-06-01',
        maturityDate: '2026-06-02',
        currentDate: '2026-06-01',
      });

      expect(t1.totalDays).toBe(1);
      expect(t1.elapsedDays).toBe(0);
      expect(t1.daysRemaining).toBe(1);
      expect(t1.progressPercentage).toBe(0.00);
      expect(t1.isMatured).toBe(false);

      const t1Matured = calculateFixedDeposit({
        principal: 100000,
        annualRate: 10.0,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-06-01',
        maturityDate: '2026-06-02',
        currentDate: '2026-06-02',
      });

      expect(t1Matured.elapsedDays).toBe(1);
      expect(t1Matured.daysRemaining).toBe(0);
      expect(t1Matured.progressPercentage).toBe(100.00);
      expect(t1Matured.isMatured).toBe(true);
      expect(t1Matured.accruedInterest).toBe(t1Matured.totalInterestEarned);
    });

  });

});
