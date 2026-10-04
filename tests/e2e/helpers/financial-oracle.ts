/**
 * Authoritative Financial Engine Reference Oracle
 * 
 * Derived directly from:
 * - ORIGINAL_REQUEST.md (R3: Fixed Deposits Portfolio & Financial Engine)
 * - PROJECT.md (Interface Contract 1: Financial Engine Contract & Mathematical Models)
 * 
 * Provides independent mathematical calculations for:
 * 1. Compound Interest across frequencies (Monthly n=12, Quarterly n=4, Semi-Annually n=2, Annually n=1)
 * 2. At-Maturity Simple/Cumulative Interest: A = P * (1 + r * t)
 * 3. Accrued Interest to Date (Actual/365 convention with boundary clamping)
 * 4. Days Remaining & Visual Progress Percentage
 * 5. Strict ±0.01 currency tolerance validation
 */

export type CompoundingFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'AT_MATURITY';

export interface FinancialCalculationParams {
  principal: number;
  annualRate: number; // percentage, e.g. 7.5 for 7.5%
  compoundingFrequency: CompoundingFrequency;
  startDate: string | Date;
  maturityDate: string | Date;
  currentDate?: string | Date;
}

export interface FinancialCalculationResult {
  maturityAmount: number;
  totalInterestEarned: number;
  accruedInterest: number;
  daysRemaining: number;
  totalDays: number;
  elapsedDays: number;
  progressPercentage: number;
  isMatured: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function parseDateUTC(d: string | Date): Date {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

export function calculateDaysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / MS_PER_DAY);
}

export function calculateReferenceFixedDeposit(params: FinancialCalculationParams): FinancialCalculationResult {
  const { principal, annualRate, compoundingFrequency } = params;
  const start = parseDateUTC(params.startDate);
  const maturity = parseDateUTC(params.maturityDate);
  const current = params.currentDate ? parseDateUTC(params.currentDate) : parseDateUTC(new Date());

  const totalDays = Math.max(0, calculateDaysBetween(start, maturity));
  const r = annualRate / 100;
  const tTotal = totalDays / 365;

  let maturityAmount = principal;
  if (compoundingFrequency === 'AT_MATURITY') {
    maturityAmount = principal * (1 + r * tTotal);
  } else {
    let n = 1;
    switch (compoundingFrequency) {
      case 'MONTHLY':
        n = 12;
        break;
      case 'QUARTERLY':
        n = 4;
        break;
      case 'SEMI_ANNUALLY':
        n = 2;
        break;
      case 'ANNUALLY':
        n = 1;
        break;
    }
    maturityAmount = principal * Math.pow(1 + r / n, n * tTotal);
  }

  const roundedMaturityAmount = roundCurrency(maturityAmount);
  const totalInterestEarned = roundCurrency(roundedMaturityAmount - principal);

  // Accrued calculation to currentDate
  const rawElapsed = calculateDaysBetween(start, current);
  const elapsedDays = Math.min(Math.max(0, rawElapsed), totalDays);
  const rawRemaining = calculateDaysBetween(current, maturity);
  const daysRemaining = Math.max(0, rawRemaining);
  const isMatured = current.getTime() >= maturity.getTime();

  let accruedInterest = 0;
  if (elapsedDays === 0) {
    accruedInterest = 0;
  } else if (isMatured || elapsedDays >= totalDays) {
    accruedInterest = totalInterestEarned;
  } else {
    const tElapsed = elapsedDays / 365;
    if (compoundingFrequency === 'AT_MATURITY') {
      const accrued = principal * (1 + r * tElapsed) - principal;
      accruedInterest = Math.min(totalInterestEarned, roundCurrency(accrued));
    } else {
      let n = 1;
      switch (compoundingFrequency) {
        case 'MONTHLY':
          n = 12;
          break;
        case 'QUARTERLY':
          n = 4;
          break;
        case 'SEMI_ANNUALLY':
          n = 2;
          break;
        case 'ANNUALLY':
          n = 1;
          break;
      }
      const accrued = principal * Math.pow(1 + r / n, n * tElapsed) - principal;
      accruedInterest = Math.min(totalInterestEarned, roundCurrency(accrued));
    }
  }

  const progressPercentage = totalDays > 0
    ? roundCurrency(Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)))
    : 100;

  return {
    maturityAmount: roundedMaturityAmount,
    totalInterestEarned,
    accruedInterest,
    daysRemaining,
    totalDays,
    elapsedDays,
    progressPercentage,
    isMatured,
  };
}

export function assertWithinTolerance(actual: number, expected: number, tolerance: number = 0.01): boolean {
  return Math.abs(actual - expected) <= tolerance + 1e-9;
}
