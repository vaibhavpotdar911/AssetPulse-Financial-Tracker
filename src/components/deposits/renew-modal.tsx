'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  calculateFixedDeposit,
  calculateMaturityDateFromTenure,
  calculateTenureBreakdown,
  CompoundingFrequency,
} from '@/lib/financial';
import {
  X,
  RotateCw,
  Building2,
  Calendar,
  Lock,
  ArrowRight,
  Sparkles,
  Calculator,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Select, SelectOption } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useCurrency } from '@/components/providers/currency-provider';

interface RenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deposit: any;
}

const COMPOUNDING_OPTIONS: SelectOption[] = [
  { value: 'AT_MATURITY', label: 'Simple Interest (At Maturity)', description: 'Standard simple interest formula: P × (1 + r × t)' },
  { value: 'QUARTERLY', label: 'Quarterly Compounding (n=4)', description: 'Standard Indian bank fixed deposit frequency' },
  { value: 'MONTHLY', label: 'Monthly Compounding (n=12)', description: 'Interest compounded every month' },
  { value: 'SEMI_ANNUALLY', label: 'Semi-Annually (n=2)', description: 'Interest compounded every 6 months' },
  { value: 'ANNUALLY', label: 'Annually (n=1)', description: 'Interest compounded once per year' },
];

const roundBankWhole = (val: number | string): number => {
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(n)) return 0;
  return Math.round(n);
};

export function RenewModal({ isOpen, onClose, onSuccess, deposit }: RenewModalProps) {
  const { symbol, formatAmount } = useCurrency();

  // Rollover principal option: 'FULL_ROLLOVER' | 'PRINCIPAL_ONLY' | 'CUSTOM'
  const [rolloverOption, setRolloverOption] = useState<'FULL_ROLLOVER' | 'PRINCIPAL_ONLY' | 'CUSTOM'>('FULL_ROLLOVER');
  const [principal, setPrincipal] = useState<number | string>('');
  const [annualRate, setAnnualRate] = useState<number | string>('');
  const [compoundingFrequency, setCompoundingFrequency] = useState<CompoundingFrequency>('AT_MATURITY');
  const [startDate, setStartDate] = useState('');
  const [maturityDate, setMaturityDate] = useState('');

  // Tenure controls
  const [tenureYears, setTenureYears] = useState<number | string>('');
  const [tenureMonths, setTenureMonths] = useState<number | string>('');
  const [tenureDays, setTenureDays] = useState<number | string>('');

  const [isAutoRenew, setIsAutoRenew] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Computed previous contract figures
  const previousPrincipal = useMemo(() => roundBankWhole(deposit?.principalAmount || 0), [deposit]);
  const realizedInterest = useMemo(() => {
    if (!deposit) return 0;
    return roundBankWhole(deposit.accruedInterest ?? deposit.totalInterestEarned ?? 0);
  }, [deposit]);
  const totalProceeds = useMemo(() => previousPrincipal + realizedInterest, [previousPrincipal, realizedInterest]);

  // Reset and initialize when modal opens or deposit changes
  useEffect(() => {
    if (deposit && isOpen) {
      setRolloverOption('FULL_ROLLOVER');
      // Default to full rollover: principal + realized interest
      const fullMaturity = previousPrincipal + realizedInterest;
      setPrincipal(fullMaturity);

      // Pre-fill previous interest rate & compounding frequency
      setAnnualRate(deposit.annualRate !== undefined ? deposit.annualRate : '');
      setCompoundingFrequency(deposit.compoundingFrequency || 'AT_MATURITY');

      // Start date: defaults to the previous maturity date, or today if that was in the past
      let defaultStart = new Date().toISOString().split('T')[0];
      if (deposit.maturityDate) {
        const matStr = new Date(deposit.maturityDate).toISOString().split('T')[0];
        defaultStart = matStr;
      }
      setStartDate(defaultStart);

      // Default tenure: mirror previous tenure if available, otherwise 1 Year
      if (deposit.startDate && deposit.maturityDate) {
        const breakdown = calculateTenureBreakdown(deposit.startDate, deposit.maturityDate);
        setTenureYears(breakdown.years || '');
        setTenureMonths(breakdown.months || '');
        setTenureDays(breakdown.days || '');

        const calculatedMaturity = calculateMaturityDateFromTenure(defaultStart, {
          years: breakdown.years || 0,
          months: breakdown.months || 0,
          days: breakdown.days || 0,
        });
        setMaturityDate(calculatedMaturity);
      } else {
        setTenureYears(1);
        setTenureMonths('');
        setTenureDays('');
        const calculatedMaturity = calculateMaturityDateFromTenure(defaultStart, { years: 1, months: 0, days: 0 });
        setMaturityDate(calculatedMaturity);
      }

      setIsAutoRenew(deposit.isAutoRenew || false);
      setNotes(`Renewed contract for Account #${deposit.accountNumber} with same portfolio identifier.`);
      setError(null);
    }
  }, [deposit, isOpen, previousPrincipal, realizedInterest]);

  // Handle Rollover Option change
  const handleRolloverChange = (option: 'FULL_ROLLOVER' | 'PRINCIPAL_ONLY' | 'CUSTOM') => {
    setRolloverOption(option);
    if (option === 'FULL_ROLLOVER') {
      setPrincipal(totalProceeds);
    } else if (option === 'PRINCIPAL_ONLY') {
      setPrincipal(previousPrincipal);
    }
  };

  // Handle Tenure Change -> automatically updates maturityDate
  const handleTenureChange = (y: number | string, m: number | string, d: number | string) => {
    setTenureYears(y);
    setTenureMonths(m);
    setTenureDays(d);

    if (startDate) {
      const numY = Number(y) || 0;
      const numM = Number(m) || 0;
      const numD = Number(d) || 0;
      if (numY > 0 || numM > 0 || numD > 0) {
        const calculatedMaturity = calculateMaturityDateFromTenure(startDate, {
          years: numY,
          months: numM,
          days: numD,
        });
        setMaturityDate(calculatedMaturity);
      } else {
        setMaturityDate('');
      }
    }
  };

  // Handle Start Date Change -> updates maturityDate based on current tenure
  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    if (newStart) {
      const numY = Number(tenureYears) || 0;
      const numM = Number(tenureMonths) || 0;
      const numD = Number(tenureDays) || 0;
      if (numY > 0 || numM > 0 || numD > 0) {
        const calculatedMaturity = calculateMaturityDateFromTenure(newStart, {
          years: numY,
          months: numM,
          days: numD,
        });
        setMaturityDate(calculatedMaturity);
      }
    }
  };

  // Handle Direct Maturity Date Change -> back-calculates tenure breakdown
  const handleMaturityDateChange = (newMaturity: string) => {
    setMaturityDate(newMaturity);
    if (startDate && newMaturity && new Date(newMaturity) > new Date(startDate)) {
      const breakdown = calculateTenureBreakdown(startDate, newMaturity);
      setTenureYears(breakdown.years || '');
      setTenureMonths(breakdown.months || '');
      setTenureDays(breakdown.days || '');
    }
  };

  // Quick Preset Helper
  const applyPresetTenure = (years: number, months: number, days: number) => {
    handleTenureChange(years || '', months || '', days || '');
  };

  // Live Formula-based Projection of the Renewed Certificate
  const renewedProjection = useMemo(() => {
    if (principal === '' || annualRate === '' || !startDate || !maturityDate) {
      return null;
    }
    const numPrincipal = roundBankWhole(principal);
    const numRate = Number(annualRate);
    if (!numPrincipal || numPrincipal <= 0 || isNaN(numRate) || numRate < 0) {
      return null;
    }
    try {
      if (new Date(maturityDate) <= new Date(startDate)) {
        return null;
      }
      const raw = calculateFixedDeposit({
        principal: numPrincipal,
        annualRate: numRate,
        compoundingFrequency,
        startDate,
        maturityDate,
      });

      return {
        maturityAmount: Math.round(raw.maturityAmount),
        totalInterestEarned: Math.round(raw.totalInterestEarned),
        totalDays: raw.totalDays,
      };
    } catch {
      return null;
    }
  }, [principal, annualRate, compoundingFrequency, startDate, maturityDate]);

  if (!isOpen || !deposit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numPrincipal = roundBankWhole(principal);
    if (!numPrincipal || numPrincipal <= 0) {
      setError('Renewed principal amount is required and must be greater than zero.');
      return;
    }

    if (annualRate === '' || isNaN(Number(annualRate)) || Number(annualRate) < 0) {
      setError('Annual interest rate percentage is required.');
      return;
    }

    if (!startDate || !maturityDate) {
      setError('Renewal start date and new maturity date are required.');
      return;
    }

    if (new Date(maturityDate) <= new Date(startDate)) {
      setError('Renewed maturity date must be after the start date.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        principal: numPrincipal,
        annualRate: Number(annualRate),
        compoundingFrequency,
        startDate,
        maturityDate,
        isAutoRenew,
        notes: notes.trim() || null,
        rolloverOption,
        realizedInterest,
      };

      const res = await fetch(`/api/deposits/${deposit.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to renew fixed deposit');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center">
            <RotateCw className="h-5 w-5 animate-spin-reverse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Renew Fixed Deposit
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {deposit.bankName}
              </span>
              <span className="text-slate-400">•</span>
              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-brand-emerald-700 dark:text-brand-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                <Lock className="h-3 w-3" />
                {deposit.accountNumber}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Rollover this certificate seamlessly into a new tenure with new interest rates while permanently preserving the identical account number and historical continuity.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: Previous Term Outcome Reference */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
              Current / Maturing Certificate Summary
            </div>
            <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Initial Principal</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white">
                  {formatAmount(previousPrincipal)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Realized Interest</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-brand-emerald-600 dark:text-brand-emerald-400">
                  +{formatAmount(realizedInterest)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Maturity Value</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {formatAmount(totalProceeds)}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Reinvestment Principal Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Rollover Principal Selection
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleRolloverChange('FULL_ROLLOVER')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  rolloverOption === 'FULL_ROLLOVER'
                    ? 'border-brand-emerald-500 bg-brand-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-brand-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Full Rollover</span>
                  {rolloverOption === 'FULL_ROLLOVER' && (
                    <CheckCircle2 className="h-4 w-4 text-brand-emerald-600" />
                  )}
                </div>
                <div className="text-xs font-mono font-bold text-brand-emerald-700 dark:text-brand-emerald-300">
                  {formatAmount(totalProceeds)}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                  Reinvest Principal + all earned interest
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleRolloverChange('PRINCIPAL_ONLY')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  rolloverOption === 'PRINCIPAL_ONLY'
                    ? 'border-brand-emerald-500 bg-brand-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-brand-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Principal Only</span>
                  {rolloverOption === 'PRINCIPAL_ONLY' && (
                    <CheckCircle2 className="h-4 w-4 text-brand-emerald-600" />
                  )}
                </div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                  {formatAmount(previousPrincipal)}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                  Disburse earned interest to savings
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleRolloverChange('CUSTOM')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  rolloverOption === 'CUSTOM'
                    ? 'border-brand-emerald-500 bg-brand-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-brand-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Custom Amount</span>
                  {rolloverOption === 'CUSTOM' && (
                    <CheckCircle2 className="h-4 w-4 text-brand-emerald-600" />
                  )}
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  Custom Top-up / Partial
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                  Adjust principal with custom cash flow
                </span>
              </button>
            </div>

            {/* Custom Principal Input if chosen */}
            {rolloverOption === 'CUSTOM' && (
              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Enter Custom Renewed Principal ({symbol})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400 font-mono">
                    {symbol}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    placeholder="Enter renewed principal amount"
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: New Interest Rate & Compounding */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                New Annual Interest Rate (%) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  placeholder="e.g. 7.50"
                  value={annualRate}
                  onChange={(e) => setAnnualRate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none font-mono"
                />
                <span className="absolute right-3 top-2 text-sm text-slate-400 font-mono">%</span>
              </div>
            </div>

            <div>
              <Select
                value={compoundingFrequency}
                onChange={(val) => setCompoundingFrequency(val as CompoundingFrequency)}
                options={COMPOUNDING_OPTIONS}
                label="Compounding Frequency"
                placeholder="Select frequency"
              />
            </div>
          </div>

          {/* Section 4: Start Date & New Tenure */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                New Tenure & Maturity Horizon
              </span>
              <span className="text-[11px] text-slate-500">
                Start date defaults to previous maturity
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <DatePicker
                  value={startDate}
                  onChange={handleStartDateChange}
                  label="Renewal Effective Start Date"
                  required
                />
              </div>

              <div>
                <DatePicker
                  value={maturityDate}
                  onChange={handleMaturityDateChange}
                  label="New Maturity Date"
                  required
                />
              </div>
            </div>

            {/* Tenure Breakdown (Years, Months, Days) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Interactive Tenure Duration
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={tenureYears}
                      onChange={(e) => handleTenureChange(e.target.value, tenureMonths, tenureDays)}
                      placeholder="0"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-2 top-1.5 text-[11px] text-slate-400 pointer-events-none">Yrs</span>
                  </div>
                </div>

                <div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="11"
                      value={tenureMonths}
                      onChange={(e) => handleTenureChange(tenureYears, e.target.value, tenureDays)}
                      placeholder="0"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-2 top-1.5 text-[11px] text-slate-400 pointer-events-none">Mos</span>
                  </div>
                </div>

                <div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={tenureDays}
                      onChange={(e) => handleTenureChange(tenureYears, tenureMonths, e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-2 top-1.5 text-[11px] text-slate-400 pointer-events-none">Days</span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] font-semibold text-slate-400">Presets:</span>
                {[
                  { label: '7 Days', y: 0, m: 0, d: 7 },
                  { label: '3 Months', y: 0, m: 3, d: 0 },
                  { label: '6 Months', y: 0, m: 6, d: 0 },
                  { label: '1 Year', y: 1, m: 0, d: 0 },
                  { label: '2 Years', y: 2, m: 0, d: 0 },
                  { label: '3 Years', y: 3, m: 0, d: 0 },
                  { label: '5 Years', y: 5, m: 0, d: 0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPresetTenure(preset.y, preset.m, preset.d)}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Live Projected Performance of Renewed Certificate */}
          {renewedProjection && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-emerald-700 dark:text-brand-emerald-300">
                  <Calculator className="h-4 w-4" />
                  <span>Renewed Contract Projected Yield ({renewedProjection.totalDays} Days)</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Account: #{deposit.accountNumber}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-slate-500 block">Renewed Principal</span>
                  <span className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white">
                    {formatAmount(roundBankWhole(principal))}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Est. Interest Earned</span>
                  <span className="text-xs sm:text-sm font-bold font-mono text-brand-emerald-600 dark:text-brand-emerald-400">
                    +{formatAmount(renewedProjection.totalInterestEarned)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">New Maturity Value</span>
                  <span className="text-xs sm:text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {formatAmount(renewedProjection.maturityAmount)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section 6: Auto-Renew Toggle & Notes */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                Auto-Renew on Next Maturity
              </span>
              <span className="text-[10px] text-slate-500">
                Flag this certificate for automatic rollover upon reaching the new maturity date
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsAutoRenew(!isAutoRenew)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isAutoRenew ? 'bg-brand-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isAutoRenew ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Renewal Memo / Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rolled over at branch counter with special senior rate"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
            />
          </div>

          {/* Ledger Notice */}
          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>Dual Ledger Guarantee:</strong> Confirming renewal will simultaneously record the completion of previous cycle <strong>#{deposit.accountNumber}</strong> with realized interest, and issue the renewed certificate under the exact same account number in your portfolio.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-xl shadow-md transition-all focus:ring-2 focus:ring-brand-emerald-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing Renewal...</span>
                </>
              ) : (
                <>
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Confirm & Renew Certificate</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
