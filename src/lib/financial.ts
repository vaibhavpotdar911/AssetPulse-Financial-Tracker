/**
 * AssetPulse - Financial Calculation Engine
 * 
 * Authoritative implementation compliant with:
 * - ORIGINAL_REQUEST.md (R3: Fixed Deposits Portfolio & Financial Engine)
 * - PROJECT.md (Interface Contract 1: Financial Engine Contract)
 * 
 * Provides high-precision financial calculations:
 * 1. Compound Interest across frequencies (Monthly n=12, Quarterly n=4, Semi-Annually n=2, Annually n=1)
 * 2. At-Maturity Simple/Cumulative Interest: A = P * (1 + r * t)
 * 3. Actual/365 Day Convention with UTC timezone neutrality
 * 4. Accrued Interest to Date with clamping (0 before start, capped at maturity)
 * 5. Days Remaining & Visual Progress Percentage [0.00 to 100.00]
 * 6. Strict ±0.01 currency tolerance via epsilon half-up rounding
 */

export type CompoundingFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'AT_MATURITY';

export interface FinancialCalculationParams {
  principal: number;
  annualRate: number; // percentage, e.g. 7.5 for 7.5%
  compoundingFrequency: CompoundingFrequency;
  startDate: string | Date;
  maturityDate: string | Date;
  currentDate?: string | Date; // defaults to current date/time
}

export interface FinancialCalculationResult {
  maturityAmount: number;     // rounded to 2 decimal places
  totalInterestEarned: number; // maturityAmount - principal
  accruedInterest: number;    // accrued interest up to currentDate
  daysRemaining: number;      // max(0, days between currentDate and maturityDate)
  totalDays: number;          // total tenure days
  elapsedDays: number;        // days elapsed since startDate
  progressPercentage: number; // 0.00 to 100.00
  isMatured: boolean;         // currentDate >= maturityDate
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Rounds a floating-point number to 2 decimal places using half-up rounding with epsilon adjustment.
 */
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Parses date string or Date object into a UTC midnight Date instance.
 * Ensures consistent day-difference math regardless of local server/browser timezone.
 */
export function parseDateUTC(d: string | Date): Date {
  if (d === null || d === undefined) {
    throw new Error(`Invalid date provided: ${d}`);
  }

  if (typeof d === 'string') {
    const trimmed = d.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      const year = parseInt(dateOnlyMatch[1], 10);
      const month = parseInt(dateOnlyMatch[2], 10) - 1;
      const day = parseInt(dateOnlyMatch[3], 10);
      return new Date(Date.UTC(year, month, day));
    }
  }

  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date provided: ${d}`);
  }

  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

/**
 * Calculates calendar days between two UTC dates.
 */
export function calculateDaysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / MS_PER_DAY);
}

/**
 * Returns annual compounding frequency integer (n).
 */
export function getCompoundingMultiplier(frequency: CompoundingFrequency): number {
  switch (frequency) {
    case 'MONTHLY':
      return 12;
    case 'QUARTERLY':
      return 4;
    case 'SEMI_ANNUALLY':
      return 2;
    case 'ANNUALLY':
      return 1;
    case 'AT_MATURITY':
      return 1;
    default:
      throw new Error(`Unsupported compounding frequency: ${frequency}`);
  }
}

/**
 * Validates financial calculation parameters.
 */
export function validateFinancialParams(params: FinancialCalculationParams): void {
  if (typeof params.principal !== 'number' || isNaN(params.principal) || params.principal < 0) {
    throw new Error('Principal amount cannot be negative');
  }
  if (typeof params.annualRate !== 'number' || isNaN(params.annualRate) || params.annualRate < 0) {
    throw new Error('Annual interest rate cannot be negative');
  }

  const validFrequencies: CompoundingFrequency[] = [
    'MONTHLY',
    'QUARTERLY',
    'SEMI_ANNUALLY',
    'ANNUALLY',
    'AT_MATURITY',
  ];
  if (!validFrequencies.includes(params.compoundingFrequency)) {
    throw new Error(`Unsupported compounding frequency: ${params.compoundingFrequency}`);
  }
}

/**
 * Main Financial Calculation Engine for Fixed Deposits.
 */
export function calculateFixedDeposit(params: FinancialCalculationParams): FinancialCalculationResult {
  validateFinancialParams(params);

  const { principal, annualRate, compoundingFrequency } = params;

  const start = parseDateUTC(params.startDate);
  const maturity = parseDateUTC(params.maturityDate);
  const current = params.currentDate ? parseDateUTC(params.currentDate) : parseDateUTC(new Date());

  const rawTotalDays = calculateDaysBetween(start, maturity);
  const totalDays = Math.max(0, rawTotalDays);

  const rawElapsed = calculateDaysBetween(start, current);
  const rawRemaining = calculateDaysBetween(current, maturity);

  const isMatured = current.getTime() >= maturity.getTime();
  const daysRemaining = Math.max(0, rawRemaining);
  const elapsedDays = Math.min(Math.max(0, rawElapsed), totalDays);

  // Edge case: Same-day maturity (totalDays === 0)
  if (totalDays === 0) {
    return {
      maturityAmount: roundCurrency(principal),
      totalInterestEarned: 0,
      accruedInterest: 0,
      daysRemaining: 0,
      totalDays: 0,
      elapsedDays: 0,
      progressPercentage: 100,
      isMatured: true,
    };
  }

  const r = annualRate / 100;
  const tTotal = totalDays / 365;

  let maturityAmount = principal;
  if (annualRate === 0) {
    maturityAmount = principal;
  } else if (compoundingFrequency === 'AT_MATURITY') {
    // Simple / cumulative interest: A = P * (1 + r * t)
    maturityAmount = principal * (1 + r * tTotal);
  } else {
    // Standard compound interest: A = P * (1 + r / n)^(n * t)
    const n = getCompoundingMultiplier(compoundingFrequency);
    maturityAmount = principal * Math.pow(1 + r / n, n * tTotal);
  }

  const roundedMaturityAmount = roundCurrency(maturityAmount);
  const totalInterestEarned = roundCurrency(roundedMaturityAmount - principal);

  // Accrued interest calculation
  let accruedInterest = 0;
  if (elapsedDays <= 0 || annualRate === 0) {
    accruedInterest = 0;
  } else if (isMatured || elapsedDays >= totalDays) {
    accruedInterest = totalInterestEarned;
  } else {
    const tElapsed = elapsedDays / 365;
    if (compoundingFrequency === 'AT_MATURITY') {
      const accrued = principal * (1 + r * tElapsed) - principal;
      accruedInterest = Math.min(totalInterestEarned, roundCurrency(accrued));
    } else {
      const n = getCompoundingMultiplier(compoundingFrequency);
      const accrued = principal * Math.pow(1 + r / n, n * tElapsed) - principal;
      accruedInterest = Math.min(totalInterestEarned, roundCurrency(accrued));
    }
  }

  const progressPercentage = roundCurrency(Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)));

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

export interface TenureInput {
  years?: number;
  months?: number;
  days?: number;
}

/**
 * Calculates maturity date string (YYYY-MM-DD) from a given start date and mixed tenure (years, months, days).
 * Employs UTC date arithmetic for timezone consistency.
 */
export function calculateMaturityDateFromTenure(startDateStr: string | Date, tenure: TenureInput): string {
  const start = parseDateUTC(startDateStr);
  const years = Math.max(0, Math.floor(tenure.years || 0));
  const months = Math.max(0, Math.floor(tenure.months || 0));
  const days = Math.max(0, Math.floor(tenure.days || 0));

  const targetYear = start.getUTCFullYear() + years;
  const targetMonth = start.getUTCMonth() + months;
  const originalDay = start.getUTCDate();

  // Create date adding years and months
  const result = new Date(Date.UTC(targetYear, targetMonth, 1));
  // Determine max days in the target month to prevent month overflow (e.g. Jan 31 + 1 month -> Feb 28)
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, daysInMonth));

  // Now add any extra days
  if (days > 0) {
    result.setUTCDate(result.getUTCDate() + days);
  }

  const yyyy = result.getUTCFullYear();
  const mm = String(result.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(result.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface TenureBreakdown {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

/**
 * Computes human-readable tenure breakdown (years, months, days) from two dates.
 */
export function calculateTenureBreakdown(startDateStr: string | Date, maturityDateStr: string | Date): TenureBreakdown {
  const start = parseDateUTC(startDateStr);
  const maturity = parseDateUTC(maturityDateStr);

  const totalDays = calculateDaysBetween(start, maturity);
  if (totalDays <= 0) {
    return { years: 0, months: 0, days: 0, totalDays: Math.max(0, totalDays) };
  }

  let years = maturity.getUTCFullYear() - start.getUTCFullYear();
  let months = maturity.getUTCMonth() - start.getUTCMonth();
  let days = maturity.getUTCDate() - start.getUTCDate();

  if (days < 0) {
    months -= 1;
    // Days in previous month of maturity date
    const prevMonthDays = new Date(Date.UTC(maturity.getUTCFullYear(), maturity.getUTCMonth(), 0)).getUTCDate();
    days += prevMonthDays;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
    totalDays,
  };
}

// ============================================================================
// 7. Recurring Deposit (RD) & SIP Financial Calculation Engine
// ============================================================================

export interface RecurringDepositParams {
  monthlyInstallment: number;
  annualRate: number; // e.g. 7.1 for 7.1%
  tenureMonths: number;
  compoundingFrequency?: 'MONTHLY' | 'QUARTERLY'; // Indian banks typically compound RD quarterly (n=4)
}

export interface RecurringDepositResult {
  totalDepositAmount: number;     // monthlyInstallment * tenureMonths
  maturityAmount: number;         // Total payout at maturity
  totalInterestEarned: number;    // maturityAmount - totalDepositAmount
}

/**
 * Calculates Recurring Deposit (RD) maturity payout based on quarterly/monthly compounding standard.
 * Formula: M = Sum over i=1..N of P * (1 + r/n)^(n * (N - i + 1)/12)
 * Where:
 *  P = monthly installment
 *  r = annual interest rate as decimal (annualRate / 100)
 *  n = compounding frequency (4 for quarterly, 12 for monthly)
 *  N = total tenure in months
 */
export function calculateRecurringDeposit(params: RecurringDepositParams): RecurringDepositResult {
  const { monthlyInstallment, annualRate, tenureMonths } = params;
  const compoundingFrequency = params.compoundingFrequency || 'QUARTERLY';
  const n = compoundingFrequency === 'QUARTERLY' ? 4 : 12;
  const r = annualRate / 100;

  if (monthlyInstallment <= 0 || tenureMonths <= 0) {
    return {
      totalDepositAmount: 0,
      maturityAmount: 0,
      totalInterestEarned: 0,
    };
  }

  let totalMaturity = 0;
  for (let i = 1; i <= tenureMonths; i++) {
    // Tenure remaining in years for this installment
    const remainingMonths = tenureMonths - i + 1;
    const tYears = remainingMonths / 12;
    const installmentMaturity = monthlyInstallment * Math.pow(1 + r / n, n * tYears);
    totalMaturity += installmentMaturity;
  }

  const roundedMaturity = roundCurrency(totalMaturity);
  const totalDepositAmount = roundCurrency(monthlyInstallment * tenureMonths);
  const totalInterestEarned = roundCurrency(roundedMaturity - totalDepositAmount);

  return {
    totalDepositAmount,
    maturityAmount: roundedMaturity,
    totalInterestEarned,
  };
}

export type SipFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * Computes next execution date for a SIP schedule (Daily, Weekly, Monthly) given a reference date.
 */
export function calculateNextSipDate(options: {
  frequency: SipFrequency;
  fromDate: string | Date;
  dayOfWeek?: number;  // 1 (Mon) - 7 (Sun)
  dayOfMonth?: number; // 1 - 31
}): Date {
  const current = parseDateUTC(options.fromDate);
  const next = new Date(current.getTime());

  switch (options.frequency) {
    case 'DAILY': {
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    }

    case 'WEEKLY': {
      const targetDay = options.dayOfWeek ? Math.min(7, Math.max(1, options.dayOfWeek)) : 1; // Default Monday
      // In JS Date, getUTCDay() is 0 (Sun) .. 6 (Sat). Map 1..7 (Mon..Sun) to JS getUTCDay()
      const jsTargetDay = targetDay === 7 ? 0 : targetDay;

      // Move forward at least 1 day
      next.setUTCDate(next.getUTCDate() + 1);
      while (next.getUTCDay() !== jsTargetDay) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;
    }

    case 'MONTHLY': {
      const targetDay = options.dayOfMonth ? Math.min(31, Math.max(1, options.dayOfMonth)) : 1;
      const targetMonth = next.getUTCMonth() + 1;
      const targetYear = next.getUTCFullYear();

      // Check how many days in the target month to prevent overflow
      const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const clampedDay = Math.min(targetDay, maxDaysInTargetMonth);

      next.setUTCFullYear(targetYear, targetMonth, clampedDay);
      break;
    }

    default:
      next.setUTCDate(next.getUTCDate() + 30);
  }

  return next;
}

