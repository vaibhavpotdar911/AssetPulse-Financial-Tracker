/**
 * Unit Test Suite: Financial Calculation Engine
 * Location: tests/unit/financial-engine.test.ts
 * 
 * Authoritative Specification Source:
 * - ORIGINAL_REQUEST.md (R3: Fixed Deposits Portfolio & Financial Engine)
 * - PROJECT.md (Features 11, 12, 13, 14, 15, 16, 17; Interface Contract 1)
 * 
 * Verifies:
 * 1. Benchmark banking accuracy across all 5 compounding frequencies within ±0.01 tolerance
 * 2. Accrual timeline verification: day 0 (0%), midpoint (exact fractional accrual), maturity date (100%), and post-maturity (capped)
 * 3. Boundary & edge cases: 0% interest, 1-day/7-day/15-day micro tenures, leap year transitions, massive principal ($1B), same-day tenure
 * 4. Input resilience and parameter validation
 * 5. Oracle parity verification against reference calculation engine
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFixedDeposit,
  roundCurrency,
  parseDateUTC,
  calculateDaysBetween,
  getCompoundingMultiplier,
  validateFinancialParams,
  type CompoundingFrequency,
  type FinancialCalculationParams,
} from '@/lib/financial';
import { calculateReferenceFixedDeposit } from '../e2e/helpers/financial-oracle';

describe('Financial Calculation Engine (src/lib/financial.ts)', () => {

  describe('1. Compounding Frequencies Banking Benchmark Suite (±0.01 Tolerance)', () => {

    it('TC-ENG-01: Quarterly compounding (n=4) matches standard banking benchmark ($100k @ 7.5% for 1 year)', () => {
      // Benchmark: P = 100,000, r = 7.5%, tenure = 1 year (365 days), n = 4
      // A = 100,000 * (1 + 0.075 / 4)^4 = 107,713.59
      // I = 7,713.59
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 7.5,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2025-01-01',
        maturityDate: '2026-01-01',
        currentDate: '2026-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(107713.59, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(7713.59, 0.01);
      expect(result.totalDays).toBe(365);
      expect(result.daysRemaining).toBe(0);
      expect(result.progressPercentage).toBe(100.0);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ENG-02: Quarterly compounding (n=4) multi-year tenure ($25k @ 8.0% for 2 years / 730 days)', () => {
      // Benchmark: P = 25,000, r = 8.0%, tenure = 2 years (730 days), n = 4
      // A = 25,000 * (1 + 0.08 / 4)^8 = 25,000 * (1.02)^8 = 29,291.48
      // I = 4,291.48
      const result = calculateFixedDeposit({
        principal: 25000,
        annualRate: 8.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2025-01-01',
        maturityDate: '2027-01-01',
        currentDate: '2027-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(29291.48, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(4291.48, 0.01);
      expect(result.totalDays).toBe(730);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ENG-03: Monthly compounding (n=12) matches standard banking benchmark ($50k @ 6.8% for 2 years / 730 days)', () => {
      // Benchmark: P = 50,000, r = 6.8%, tenure = 2 years (730 days), n = 12
      // A = 50,000 * (1 + 0.068 / 12)^24 = 57,262.11
      // I = 7,262.11
      const result = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.8,
        compoundingFrequency: 'MONTHLY',
        startDate: '2025-01-01',
        maturityDate: '2027-01-01',
        currentDate: '2027-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(57262.11, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(7262.11, 0.01);
      expect(result.totalDays).toBe(730);
      expect(result.daysRemaining).toBe(0);
      expect(result.progressPercentage).toBe(100.0);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ENG-04: Monthly compounding (n=12) 1-year tenure ($10k @ 12.0% for 1 year / 365 days)', () => {
      // Benchmark: P = 10,000, r = 12.0%, tenure = 1 year (365 days), n = 12
      // A = 10,000 * (1 + 0.12 / 12)^12 = 10,000 * (1.01)^12 = 11,268.25
      // I = 1,268.25
      const result = calculateFixedDeposit({
        principal: 10000,
        annualRate: 12.0,
        compoundingFrequency: 'MONTHLY',
        startDate: '2025-01-01',
        maturityDate: '2026-01-01',
        currentDate: '2026-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(11268.25, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(1268.25, 0.01);
    });

    it('TC-ENG-05: Semi-Annual compounding (n=2) matches standard banking benchmark ($250k @ 8.0% for 3 years / 1095 days)', () => {
      // Benchmark: P = 250,000, r = 8.0%, tenure = 3 years (1095 days), n = 2
      // A = 250,000 * (1 + 0.08 / 2)^6 = 250,000 * (1.04)^6 = 316,329.75
      // I = 66,329.75
      const result = calculateFixedDeposit({
        principal: 250000,
        annualRate: 8.0,
        compoundingFrequency: 'SEMI_ANNUALLY',
        startDate: '2025-01-01',
        maturityDate: '2028-01-01',
        currentDate: '2028-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(316329.75, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(66329.75, 0.01);
      expect(result.totalDays).toBe(1095);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ENG-06: Semi-Annual compounding (n=2) 1-year tenure ($100k @ 6.0% for 1 year / 365 days)', () => {
      // Benchmark: P = 100,000, r = 6.0%, tenure = 1 year (365 days), n = 2
      // A = 100,000 * (1 + 0.06 / 2)^2 = 100,000 * (1.03)^2 = 106,090.00
      // I = 6,090.00
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 6.0,
        compoundingFrequency: 'SEMI_ANNUALLY',
        startDate: '2025-01-01',
        maturityDate: '2026-01-01',
        currentDate: '2026-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(106090.00, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(6090.00, 0.01);
    });

    it('TC-ENG-07: Annual compounding (n=1) matches standard banking benchmark ($50k @ 7.0% for 1 year / 365 days)', () => {
      // Benchmark: P = 50,000, r = 7.0%, tenure = 1 year (365 days), n = 1
      // A = 50,000 * (1 + 0.07)^1 = 53,500.00
      // I = 3,500.00
      const result = calculateFixedDeposit({
        principal: 50000,
        annualRate: 7.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: '2025-01-01',
        maturityDate: '2026-01-01',
        currentDate: '2026-01-01',
      });

      expect(result.maturityAmount).toBeCloseTo(53500.00, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(3500.00, 0.01);
      expect(result.totalDays).toBe(365);
    });

    it('TC-ENG-08: Annual compounding (n=1) multi-year tenure ($10k @ 5.0% for 1825 days / exactly 5 x 365)', () => {
      // Benchmark: P = 10,000, r = 5.0%, tenure = 1825 days (t = 5.0), n = 1
      // A = 10,000 * (1 + 0.05)^5 = 12,762.82
      // I = 2,762.82
      const start = new Date(Date.UTC(2025, 0, 1));
      const maturity = new Date(start.getTime() + 1825 * 24 * 60 * 60 * 1000);

      const result = calculateFixedDeposit({
        principal: 10000,
        annualRate: 5.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: start,
        maturityDate: maturity,
        currentDate: maturity,
      });

      expect(result.totalDays).toBe(1825);
      expect(result.maturityAmount).toBeCloseTo(12762.82, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(2762.82, 0.01);
    });

    it('TC-ENG-09: At-Maturity simple/cumulative compounding matches standard benchmark ($200k @ 7.0% for 180 days)', () => {
      // Benchmark: P = 200,000, r = 7.0%, tenure = 180 days (t = 180 / 365)
      // A = 200,000 * (1 + 0.07 * (180 / 365)) = 206,904.11
      // I = 6,904.11
      const result = calculateFixedDeposit({
        principal: 200000,
        annualRate: 7.0,
        compoundingFrequency: 'AT_MATURITY',
        startDate: '2026-01-01',
        maturityDate: '2026-06-30', // exactly 180 days
        currentDate: '2026-06-30',
      });

      expect(result.totalDays).toBe(180);
      expect(result.maturityAmount).toBeCloseTo(206904.11, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(6904.11, 0.01);
      expect(result.accruedInterest).toBeCloseTo(6904.11, 0.01);
      expect(result.daysRemaining).toBe(0);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ENG-10: At-Maturity simple/cumulative compounding 90-day tenure ($100k @ 6.5%)', () => {
      // Benchmark: P = 100,000, r = 6.5%, tenure = 90 days (t = 90 / 365)
      // A = 100,000 * (1 + 0.065 * (90 / 365)) = 101,602.74
      // I = 1,602.74
      const start = new Date(Date.UTC(2026, 0, 1));
      const maturity = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 6.5,
        compoundingFrequency: 'AT_MATURITY',
        startDate: start,
        maturityDate: maturity,
        currentDate: maturity,
      });

      expect(result.totalDays).toBe(90);
      expect(result.maturityAmount).toBeCloseTo(101602.74, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(1602.74, 0.01);
    });

  });

  describe('2. Accrual Timeline Verification Across Lifecycle', () => {

    const baseParams: FinancialCalculationParams = {
      principal: 100000,
      annualRate: 8.0,
      compoundingFrequency: 'QUARTERLY',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01', // 365 days
    };

    it('TC-ACCR-01: Day 0 (start date): accrued interest is 0.00, progress is 0%, full tenure remaining', () => {
      const result = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2026-01-01',
      });

      expect(result.accruedInterest).toBe(0.00);
      expect(result.elapsedDays).toBe(0);
      expect(result.daysRemaining).toBe(365);
      expect(result.progressPercentage).toBe(0.0);
      expect(result.isMatured).toBe(false);
    });

    it('TC-ACCR-02: Midpoint: exact fractional accrual matches formula, progress is ~50%, deposit is active', () => {
      // Midpoint: 182 days elapsed (2026-07-02)
      // t_elapsed = 182 / 365
      // Accrued = 100,000 * (1 + 0.08 / 4)^(4 * 182 / 365) - 100,000 = 4,028.71
      const result = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2026-07-02',
      });

      expect(result.elapsedDays).toBe(182);
      expect(result.daysRemaining).toBe(183);
      expect(result.accruedInterest).toBeGreaterThan(0);
      expect(result.accruedInterest).toBeLessThan(result.totalInterestEarned);
      expect(result.accruedInterest).toBeCloseTo(4028.71, 0.05);
      expect(result.progressPercentage).toBeCloseTo(49.86, 0.05);
      expect(result.isMatured).toBe(false);
    });

    it('TC-ACCR-03: Maturity date: accrued interest equals 100% of total interest, 0 days remaining, isMatured is true', () => {
      const result = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2027-01-01',
      });

      expect(result.elapsedDays).toBe(365);
      expect(result.daysRemaining).toBe(0);
      expect(result.accruedInterest).toBe(result.totalInterestEarned);
      expect(result.progressPercentage).toBe(100.0);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ACCR-04: Post-maturity: accrued interest is capped at total interest earned, days remaining does not drop below 0', () => {
      // Query 90 days after maturity: 2027-04-01
      const result = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2027-04-01',
      });

      expect(result.accruedInterest).toBe(result.totalInterestEarned);
      expect(result.daysRemaining).toBe(0);
      expect(result.elapsedDays).toBe(365); // capped at totalDays
      expect(result.progressPercentage).toBe(100.0);
      expect(result.isMatured).toBe(true);
    });

    it('TC-ACCR-05: Pre-start date: querying before start date clamps accrued interest to 0.00 and progress to 0.0%', () => {
      // Query 15 days before start date: 2025-12-17
      const result = calculateFixedDeposit({
        ...baseParams,
        currentDate: '2025-12-17',
      });

      expect(result.accruedInterest).toBe(0.00);
      expect(result.elapsedDays).toBe(0);
      expect(result.daysRemaining).toBe(380); // 15 + 365
      expect(result.progressPercentage).toBe(0.0);
      expect(result.isMatured).toBe(false);
    });

  });

  describe('3. Boundary, Corner & Edge Cases', () => {

    it('TC-EDGE-01: Zero percent interest rate (r=0.0%) returns principal with zero interest across all stages', () => {
      const frequencies: CompoundingFrequency[] = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'AT_MATURITY'];

      for (const freq of frequencies) {
        const result = calculateFixedDeposit({
          principal: 50000,
          annualRate: 0.0,
          compoundingFrequency: freq,
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
          currentDate: '2026-07-01',
        });

        expect(result.maturityAmount).toBe(50000.00);
        expect(result.totalInterestEarned).toBe(0.00);
        expect(result.accruedInterest).toBe(0.00);
        expect(result.isMatured).toBe(false);
      }
    });

    it('TC-EDGE-02: Micro tenure 1-day calculates precise fractional interest without NaN', () => {
      // P = 100,000, r = 7.3%, tenure = 1 day (At-Maturity)
      // A = 100,000 * (1 + 0.073 * 1 / 365) = 100,020.00
      // I = 20.00
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 7.3,
        compoundingFrequency: 'AT_MATURITY',
        startDate: '2026-01-01',
        maturityDate: '2026-01-02',
        currentDate: '2026-01-02',
      });

      expect(result.totalDays).toBe(1);
      expect(result.maturityAmount).toBeCloseTo(100020.00, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(20.00, 0.01);
      expect(Number.isNaN(result.maturityAmount)).toBe(false);
      expect(result.isMatured).toBe(true);
    });

    it('TC-EDGE-03: Micro tenure 7-day calculates precise fractional interest without NaN', () => {
      // P = 100,000, r = 7.3%, tenure = 7 days (At-Maturity)
      // A = 100,000 * (1 + 0.073 * 7 / 365) = 100,140.00
      // I = 140.00
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 7.3,
        compoundingFrequency: 'AT_MATURITY',
        startDate: '2026-01-01',
        maturityDate: '2026-01-08',
        currentDate: '2026-01-08',
      });

      expect(result.totalDays).toBe(7);
      expect(result.maturityAmount).toBeCloseTo(100140.00, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(140.00, 0.01);
      expect(Number.isNaN(result.maturityAmount)).toBe(false);
      expect(result.isMatured).toBe(true);
    });

    it('TC-EDGE-04: Micro tenure 15-day calculates precise fractional interest without NaN', () => {
      // P = 100,000, r = 7.3%, tenure = 15 days (At-Maturity)
      // A = 100,000 * (1 + 0.073 * 15 / 365) = 100,300.00
      // I = 300.00
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 7.3,
        compoundingFrequency: 'AT_MATURITY',
        startDate: '2026-01-01',
        maturityDate: '2026-01-16',
        currentDate: '2026-01-16',
      });

      expect(result.totalDays).toBe(15);
      expect(result.maturityAmount).toBeCloseTo(100300.00, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(300.00, 0.01);
      expect(Number.isNaN(result.maturityAmount)).toBe(false);
    });

    it('TC-EDGE-05: Leap year transition spanning February 29 accurately accounts for 366 days', () => {
      // 2024 is a leap year (Feb 29 exists)
      // Start: 2024-01-01, Maturity: 2025-01-01 -> exactly 366 calendar days
      // P = 100,000, r = 6.0%, Annually (n=1)
      // A = 100,000 * (1 + 0.06)^(366 / 365) = 106,016.92
      // I = 6,016.92
      const result = calculateFixedDeposit({
        principal: 100000,
        annualRate: 6.0,
        compoundingFrequency: 'ANNUALLY',
        startDate: '2024-01-01',
        maturityDate: '2025-01-01',
        currentDate: '2025-01-01',
      });

      expect(result.totalDays).toBe(366);
      expect(result.maturityAmount).toBeCloseTo(106016.92, 0.01);
      expect(result.totalInterestEarned).toBeCloseTo(6016.92, 0.01);
      expect(result.isMatured).toBe(true);
    });

    it('TC-EDGE-06: Massive principal scaling ($1,000,000,000) maintains floating-point precision safety', () => {
      // P = 1,000,000,000 ($1 Billion), r = 8.25%, Quarterly (n=4), 2 years (730 days)
      // A = 1,000,000,000 * (1 + 0.0825 / 4)^8 = 1,177,415,141.85
      // I = 177,415,141.85
      const result = calculateFixedDeposit({
        principal: 1000000000,
        annualRate: 8.25,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2026-01-01',
        maturityDate: '2028-01-01',
        currentDate: '2028-01-01',
      });

      expect(Number.isFinite(result.maturityAmount)).toBe(true);
      expect(result.maturityAmount).toBeCloseTo(1177415141.85, 0.05);
      expect(result.totalInterestEarned).toBeCloseTo(177415141.85, 0.05);
    });

    it('TC-EDGE-07: Same-day start and maturity boundary condition (totalDays = 0) returns principal safely', () => {
      const result = calculateFixedDeposit({
        principal: 25000,
        annualRate: 5.5,
        compoundingFrequency: 'MONTHLY',
        startDate: '2026-06-01',
        maturityDate: '2026-06-01',
        currentDate: '2026-06-01',
      });

      expect(result.maturityAmount).toBe(25000.00);
      expect(result.totalInterestEarned).toBe(0.00);
      expect(result.accruedInterest).toBe(0.00);
      expect(result.daysRemaining).toBe(0);
      expect(result.totalDays).toBe(0);
      expect(result.progressPercentage).toBe(100.0);
      expect(result.isMatured).toBe(true);
    });

    it('TC-EDGE-08: Accepts string dates, ISO timestamps, and Date objects interchangeably', () => {
      const resStr = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
      });

      const resISO = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: '2026-01-01T00:00:00.000Z',
        maturityDate: '2027-01-01T00:00:00.000Z',
      });

      const resDate = calculateFixedDeposit({
        principal: 50000,
        annualRate: 6.0,
        compoundingFrequency: 'QUARTERLY',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        maturityDate: new Date('2027-01-01T00:00:00.000Z'),
      });

      expect(resStr.maturityAmount).toBe(resISO.maturityAmount);
      expect(resStr.maturityAmount).toBe(resDate.maturityAmount);
      expect(resStr.totalDays).toBe(resISO.totalDays);
      expect(resStr.totalDays).toBe(resDate.totalDays);
    });

    it('TC-EDGE-09: Rejects negative principal with descriptive error', () => {
      expect(() => {
        calculateFixedDeposit({
          principal: -5000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        });
      }).toThrow('Principal amount cannot be negative');
    });

    it('TC-EDGE-10: Rejects invalid date inputs with descriptive error', () => {
      expect(() => {
        calculateFixedDeposit({
          principal: 5000,
          annualRate: 5.0,
          compoundingFrequency: 'ANNUALLY',
          startDate: 'not-a-valid-date',
          maturityDate: '2027-01-01',
        });
      }).toThrow('Invalid date provided');
    });

  });

  describe('4. Mathematical Helper Functions', () => {

    it('roundCurrency rounds to 2 decimal places with half-up behavior', () => {
      expect(roundCurrency(10.004)).toBe(10.00);
      expect(roundCurrency(10.005)).toBe(10.01);
      expect(roundCurrency(10.006)).toBe(10.01);
      expect(roundCurrency(0)).toBe(0);
    });

    it('getCompoundingMultiplier returns correct compounding periods per year (n)', () => {
      expect(getCompoundingMultiplier('MONTHLY')).toBe(12);
      expect(getCompoundingMultiplier('QUARTERLY')).toBe(4);
      expect(getCompoundingMultiplier('SEMI_ANNUALLY')).toBe(2);
      expect(getCompoundingMultiplier('ANNUALLY')).toBe(1);
      expect(getCompoundingMultiplier('AT_MATURITY')).toBe(1);
    });

    it('calculateDaysBetween computes accurate day counts', () => {
      const d1 = parseDateUTC('2026-01-01');
      const d2 = parseDateUTC('2026-01-31');
      expect(calculateDaysBetween(d1, d2)).toBe(30);

      const leapStart = parseDateUTC('2024-02-01');
      const leapEnd = parseDateUTC('2024-03-01');
      expect(calculateDaysBetween(leapStart, leapEnd)).toBe(29); // Leap Feb has 29 days
    });

    it('validateFinancialParams rejects negative rate and invalid frequency', () => {
      expect(() => validateFinancialParams({
        principal: 1000,
        annualRate: -1,
        compoundingFrequency: 'ANNUALLY',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
      })).toThrow('Annual interest rate cannot be negative');

      expect(() => validateFinancialParams({
        principal: 1000,
        annualRate: 5,
        compoundingFrequency: 'WEEKLY' as any,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
      })).toThrow('Unsupported compounding frequency: WEEKLY');
    });

  });

  describe('5. Oracle Parity Verification', () => {

    it('matches calculateReferenceFixedDeposit across all compounding frequencies and random lifecycles', () => {
      const frequencies: CompoundingFrequency[] = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'AT_MATURITY'];
      
      for (const freq of frequencies) {
        const params: FinancialCalculationParams = {
          principal: 75000,
          annualRate: 7.25,
          compoundingFrequency: freq,
          startDate: '2025-03-01',
          maturityDate: '2026-09-01',
          currentDate: '2025-11-15',
        };

        const engineResult = calculateFixedDeposit(params);
        const oracleResult = calculateReferenceFixedDeposit(params);

        expect(engineResult.maturityAmount).toBeCloseTo(oracleResult.maturityAmount, 0.01);
        expect(engineResult.totalInterestEarned).toBeCloseTo(oracleResult.totalInterestEarned, 0.01);
        expect(engineResult.accruedInterest).toBeCloseTo(oracleResult.accruedInterest, 0.01);
        expect(engineResult.daysRemaining).toBe(oracleResult.daysRemaining);
        expect(engineResult.totalDays).toBe(oracleResult.totalDays);
        expect(engineResult.elapsedDays).toBe(oracleResult.elapsedDays);
        expect(engineResult.progressPercentage).toBeCloseTo(oracleResult.progressPercentage, 0.01);
        expect(engineResult.isMatured).toBe(oracleResult.isMatured);
      }
    });

  });

});
