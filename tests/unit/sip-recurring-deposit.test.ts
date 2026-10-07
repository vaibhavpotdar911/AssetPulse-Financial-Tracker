import { describe, it, expect } from 'vitest';
import {
  calculateRecurringDeposit,
  calculateNextSipDate,
  roundCurrency,
} from '@/lib/financial';

describe('Phase 1: Recurring Deposits & SIP Financial Calculation Engine', () => {
  describe('calculateRecurringDeposit', () => {
    it('accurately calculates 1-year quarterly compounding RD', () => {
      // Monthly installment: 10,000, 12 months, 7.1% interest, quarterly compounding
      const res = calculateRecurringDeposit({
        monthlyInstallment: 10000,
        annualRate: 7.1,
        tenureMonths: 12,
        compoundingFrequency: 'QUARTERLY',
      });

      expect(res.totalDepositAmount).toBe(120000);
      expect(res.maturityAmount).toBeGreaterThan(120000);
      expect(res.totalInterestEarned).toBeGreaterThan(4000);
      expect(res.maturityAmount).toBe(roundCurrency(res.totalDepositAmount + res.totalInterestEarned));
    });

    it('returns zero for invalid or non-positive parameters', () => {
      const res = calculateRecurringDeposit({
        monthlyInstallment: 0,
        annualRate: 7.1,
        tenureMonths: 12,
      });

      expect(res.totalDepositAmount).toBe(0);
      expect(res.maturityAmount).toBe(0);
      expect(res.totalInterestEarned).toBe(0);
    });
  });

  describe('calculateNextSipDate', () => {
    it('advances date by 1 day for DAILY frequency', () => {
      const from = new Date('2026-10-01T00:00:00.000Z');
      const next = calculateNextSipDate({
        frequency: 'DAILY',
        fromDate: from,
      });

      expect(next.getUTCDate()).toBe(2);
      expect(next.getUTCMonth()).toBe(9); // Oct (0-indexed)
    });

    it('advances to next target day of week for WEEKLY frequency', () => {
      // 2026-10-01 was a Thursday (day 4). Target Monday (day 1)
      const from = new Date('2026-10-01T00:00:00.000Z');
      const next = calculateNextSipDate({
        frequency: 'WEEKLY',
        fromDate: from,
        dayOfWeek: 1, // Monday
      });

      // Next Monday should be 2026-10-05
      expect(next.getUTCDate()).toBe(5);
      expect(next.getUTCDay()).toBe(1); // Monday
    });

    it('advances to next month target day for MONTHLY frequency', () => {
      const from = new Date('2026-10-05T00:00:00.000Z');
      const next = calculateNextSipDate({
        frequency: 'MONTHLY',
        fromDate: from,
        dayOfMonth: 10,
      });

      expect(next.getUTCFullYear()).toBe(2026);
      expect(next.getUTCMonth()).toBe(10); // November (0-indexed)
      expect(next.getUTCDate()).toBe(10);
    });
  });
});
