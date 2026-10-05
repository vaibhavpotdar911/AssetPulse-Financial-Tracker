'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  calculateFixedDeposit,
  calculateMaturityDateFromTenure,
  calculateTenureBreakdown,
  roundCurrency,
  CompoundingFrequency,
} from '@/lib/financial';
import { X, AlertCircle, Loader2, Clock, Calculator, ArrowRightLeft } from 'lucide-react';
import { InstitutionSelect } from '@/components/ui/institution-select';
import { Select, SelectOption } from '@/components/ui/select';
import { useCurrency } from '@/components/providers/currency-provider';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deposit?: any; // If provided, edit mode
}

const COMPOUNDING_OPTIONS: SelectOption[] = [
  { value: 'MONTHLY', label: 'Monthly Compounding (n=12)', description: 'Interest compounded every month' },
  { value: 'QUARTERLY', label: 'Quarterly Compounding (n=4)', description: 'Standard Indian bank fixed deposit frequency' },
  { value: 'SEMI_ANNUALLY', label: 'Semi-Annually (n=2)', description: 'Interest compounded every 6 months' },
  { value: 'ANNUALLY', label: 'Annually (n=1)', description: 'Interest compounded once per year' },
  { value: 'AT_MATURITY', label: 'At Maturity (Simple Interest)', description: 'Cumulative payout upon maturity date' },
];

export function DepositModal({ isOpen, onClose, onSuccess, deposit }: DepositModalProps) {
  const isEdit = Boolean(deposit);
  const { symbol, formatAmount } = useCurrency();

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [principal, setPrincipal] = useState<number | string>(100000);
  const [annualRate, setAnnualRate] = useState<number | string>(7.5);
  const [compoundingFrequency, setCompoundingFrequency] = useState<CompoundingFrequency>('QUARTERLY');
  const [startDate, setStartDate] = useState('');
  const [maturityDate, setMaturityDate] = useState('');

  // Tenure controls (years, months, days mix & match)
  const [tenureYears, setTenureYears] = useState<number | string>(1);
  const [tenureMonths, setTenureMonths] = useState<number | string>(0);
  const [tenureDays, setTenureDays] = useState<number | string>(0);

  // Editable Financial Outputs (Interest Earned & Maturity Amount)
  const [customInterestEarned, setCustomInterestEarned] = useState<number | string>('');
  const [customMaturityAmount, setCustomMaturityAmount] = useState<number | string>('');
  const [isCustomCalculation, setIsCustomCalculation] = useState(false);

  const [isAutoRenew, setIsAutoRenew] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Initialize or reset on open / deposit change
  useEffect(() => {
    if (deposit) {
      setBankName(deposit.bankName || '');
      setAccountNumber(deposit.accountNumber || '');
      const p = deposit.principalAmount || 100000;
      setPrincipal(p);
      setAnnualRate(deposit.annualRate || 7.5);
      setCompoundingFrequency(deposit.compoundingFrequency || 'QUARTERLY');
      const s = deposit.startDate ? new Date(deposit.startDate).toISOString().split('T')[0] : '';
      const m = deposit.maturityDate ? new Date(deposit.maturityDate).toISOString().split('T')[0] : '';
      setStartDate(s);
      setMaturityDate(m);
      if (s && m) {
        const breakdown = calculateTenureBreakdown(s, m);
        setTenureYears(breakdown.years);
        setTenureMonths(breakdown.months);
        setTenureDays(breakdown.days);
      }
      setIsAutoRenew(deposit.isAutoRenew || false);
      setNotes(deposit.notes || '');
      setIsCustomCalculation(false);
      setCustomInterestEarned('');
      setCustomMaturityAmount('');
    } else {
      setBankName('');
      setAccountNumber('');
      setPrincipal(100000);
      setAnnualRate(7.5);
      setCompoundingFrequency('QUARTERLY');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setTenureYears(1);
      setTenureMonths(0);
      setTenureDays(0);
      const computedMaturity = calculateMaturityDateFromTenure(today, { years: 1, months: 0, days: 0 });
      setMaturityDate(computedMaturity);
      setIsAutoRenew(false);
      setNotes('');
      setIsCustomCalculation(false);
      setCustomInterestEarned('');
      setCustomMaturityAmount('');
    }
    setError(null);
  }, [deposit, isOpen]);

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
      setTenureYears(breakdown.years);
      setTenureMonths(breakdown.months);
      setTenureDays(breakdown.days);
    }
  };

  // Quick Preset Helper
  const applyPresetTenure = (years: number, months: number, days: number) => {
    handleTenureChange(years, months, days);
  };

  // Formula-based Standard Calculation
  const formulaCalculation = useMemo(() => {
    const numPrincipal = Number(principal);
    const numRate = Number(annualRate);
    if (!numPrincipal || numPrincipal <= 0 || isNaN(numRate) || numRate < 0 || !startDate || !maturityDate) {
      return null;
    }
    try {
      if (new Date(maturityDate) <= new Date(startDate)) {
        return null;
      }
      return calculateFixedDeposit({
        principal: numPrincipal,
        annualRate: numRate,
        compoundingFrequency,
        startDate,
        maturityDate,
      });
    } catch {
      return null;
    }
  }, [principal, annualRate, compoundingFrequency, startDate, maturityDate]);

  // Synchronize custom interest & maturity with formula when formula changes (if not in custom edit mode)
  useEffect(() => {
    if (!isCustomCalculation && formulaCalculation) {
      setCustomInterestEarned(formulaCalculation.totalInterestEarned);
      setCustomMaturityAmount(formulaCalculation.maturityAmount);
    }
  }, [formulaCalculation, isCustomCalculation]);

  // Bidirectional Editable Handlers:
  // When user edits Interest Earned: Maturity Amount = Principal + Interest
  const handleInterestEarnedChange = (val: string) => {
    setIsCustomCalculation(true);
    setCustomInterestEarned(val);
    const numInterest = parseFloat(val);
    const numPrincipal = Number(principal) || 0;
    if (!isNaN(numInterest)) {
      const newMaturity = roundCurrency(numPrincipal + numInterest);
      setCustomMaturityAmount(newMaturity);
    }
  };

  // When user edits Maturity Amount: Interest Earned = Maturity - Principal
  const handleMaturityAmountChange = (val: string) => {
    setIsCustomCalculation(true);
    setCustomMaturityAmount(val);
    const numMaturity = parseFloat(val);
    const numPrincipal = Number(principal) || 0;
    if (!isNaN(numMaturity)) {
      const newInterest = roundCurrency(Math.max(0, numMaturity - numPrincipal));
      setCustomInterestEarned(newInterest);
    }
  };

  // When Principal changes: If in custom mode, keep interest and update maturity amount
  const handlePrincipalChange = (val: string) => {
    setPrincipal(val);
    const numPrincipal = parseFloat(val) || 0;
    if (isCustomCalculation && customInterestEarned !== '') {
      const numInterest = Number(customInterestEarned) || 0;
      setCustomMaturityAmount(roundCurrency(numPrincipal + numInterest));
    }
  };

  // Reset to formula auto-calculation
  const resetToFormula = () => {
    setIsCustomCalculation(false);
    if (formulaCalculation) {
      setCustomInterestEarned(formulaCalculation.totalInterestEarned);
      setCustomMaturityAmount(formulaCalculation.maturityAmount);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bankName.trim() || !accountNumber.trim()) {
      setError('Bank name and account number are required.');
      return;
    }

    if (new Date(maturityDate) <= new Date(startDate)) {
      setError('Maturity date must be after start date.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        bankName,
        accountNumber,
        principalAmount: Number(principal),
        annualRate: Number(annualRate),
        compoundingFrequency,
        startDate,
        maturityDate,
        isAutoRenew,
        notes: notes.trim() || null,
      };

      const endpoint = isEdit ? `/api/deposits/${deposit.id}` : '/api/deposits';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save deposit');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const displayedPrincipal = Number(principal) || 0;
  const displayedInterest = customInterestEarned !== '' ? Number(customInterestEarned) : (formulaCalculation?.totalInterestEarned ?? 0);
  const displayedMaturity = customMaturityAmount !== '' ? Number(customMaturityAmount) : (formulaCalculation?.maturityAmount ?? displayedPrincipal + displayedInterest);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
          {isEdit ? 'Edit Fixed Deposit' : 'Add New Fixed Deposit'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          Configure institution, flexible tenure, interest rates, and customize investment/maturity amounts with live bidirectional recalculation.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Institution & Certificate Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <InstitutionSelect
                value={bankName}
                onChange={setBankName}
                required
                label="Bank / Financial Institution"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Account / Certificate Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. FD-2026-9081"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Investment Amount & Annual Rate & Compounding */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Investment / Principal ({symbol}) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400 font-mono">
                  {symbol}
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={principal}
                  onChange={(e) => handlePrincipalChange(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Annual Rate (%) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={annualRate}
                onChange={(e) => {
                  setAnnualRate(e.target.value);
                  setIsCustomCalculation(false);
                }}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <Select
                value={compoundingFrequency}
                onChange={(val) => {
                  setCompoundingFrequency(val as CompoundingFrequency);
                  setIsCustomCalculation(false);
                }}
                options={COMPOUNDING_OPTIONS}
                label="Compounding Frequency"
                placeholder="Select frequency"
              />
            </div>
          </div>

          {/* Tenure Selection Section (Days, Months, Years, Mix & Match) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Clock className="h-4 w-4 text-brand-emerald-600" />
                <span>Select Tenure (Mix & Match)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Quick:</span>
                <button
                  type="button"
                  onClick={() => applyPresetTenure(0, 0, 45)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-brand-emerald-500/20 hover:text-brand-emerald-600"
                >
                  45D
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTenure(0, 3, 0)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-brand-emerald-500/20 hover:text-brand-emerald-600"
                >
                  3M
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTenure(0, 6, 0)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-brand-emerald-500/20 hover:text-brand-emerald-600"
                >
                  6M
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTenure(1, 0, 0)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-brand-emerald-500/20 hover:text-brand-emerald-600"
                >
                  1Y
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTenure(3, 0, 0)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-brand-emerald-500/20 hover:text-brand-emerald-600"
                >
                  3Y
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTenure(5, 0, 0)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-brand-emerald-500/20 hover:text-brand-emerald-600"
                >
                  5Y
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Years
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tenureYears}
                  onChange={(e) => handleTenureChange(e.target.value, tenureMonths, tenureDays)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Months
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tenureMonths}
                  onChange={(e) => handleTenureChange(tenureYears, e.target.value, tenureDays)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Days
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tenureDays}
                  onChange={(e) => handleTenureChange(tenureYears, tenureMonths, e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <span>Selected Tenure:</span>
              <span className="font-semibold text-brand-emerald-600 dark:text-brand-emerald-400">
                {Number(tenureYears) > 0 ? `${tenureYears} Yr ` : ''}
                {Number(tenureMonths) > 0 ? `${tenureMonths} Mo ` : ''}
                {Number(tenureDays) > 0 ? `${tenureDays} Days` : ''}
                {Number(tenureYears) === 0 && Number(tenureMonths) === 0 && Number(tenureDays) === 0 ? 'Custom Dates' : ''}
              </span>
            </div>
          </div>

          {/* Start Date and Maturity Date (Both Editable & Synchronized) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Maturity Date (Calculated or Custom) *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={maturityDate}
                  onChange={(e) => handleMaturityDateChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Editable Financial Breakdown: Investment + Interest = Maturity */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-slate-50 to-indigo-500/10 dark:from-emerald-950/20 dark:via-slate-900 dark:to-indigo-950/20 border border-emerald-500/20 text-slate-900 dark:text-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-emerald-700 dark:text-brand-emerald-400 uppercase tracking-wider">
                <Calculator className="h-4 w-4" />
                <span>Financial Engine & Editable Returns</span>
              </div>
              {isCustomCalculation && (
                <button
                  type="button"
                  onClick={resetToFormula}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  <span>Reset to Standard Formula</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Investment Amount */}
              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block mb-1">
                  Investment Principal
                </span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white block">
                  {formatAmount(displayedPrincipal)}
                </span>
              </div>

              {/* Interest Earned (Editable) */}
              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">
                    Interest Earned (Editable)
                  </span>
                  {isCustomCalculation && (
                    <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                      Custom
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1 text-xs font-bold text-brand-emerald-600 dark:text-brand-emerald-400 font-mono">
                    +{symbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customInterestEarned}
                    onChange={(e) => handleInterestEarnedChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-6 pr-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-transparent font-mono font-bold text-brand-emerald-600 dark:text-brand-emerald-400 focus:outline-none focus:ring-1 focus:ring-brand-emerald-500"
                  />
                </div>
              </div>

              {/* Maturity Amount (Editable = Principal + Interest) */}
              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">
                    Total Maturity Payout
                  </span>
                  <span className="text-[9px] text-slate-400">Principal + Interest</span>
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                    {symbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customMaturityAmount}
                    onChange={(e) => handleMaturityAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-6 pr-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-transparent font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Quick Summary Pill */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between pt-1">
              <span>
                Calculation Equation: <strong>{formatAmount(displayedPrincipal)}</strong> + <strong className="text-brand-emerald-600">+{formatAmount(displayedInterest)}</strong> = <strong className="text-indigo-600">{formatAmount(displayedMaturity)}</strong>
              </span>
              {formulaCalculation && (
                <span>
                  Tenure Horizon: <strong>{formulaCalculation.daysRemaining} days remaining</strong>
                </span>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notes / Memo (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Special festive rate offer, auto-renews for 12 months"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoRenew"
              checked={isAutoRenew}
              onChange={(e) => setIsAutoRenew(e.target.checked)}
              className="rounded border-slate-300 text-brand-emerald-600 focus:ring-brand-emerald-500"
            />
            <label htmlFor="autoRenew" className="text-xs text-slate-600 dark:text-slate-300">
              Auto-renew principal upon maturity
            </label>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-brand-emerald-500 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isEdit ? 'Save Changes' : 'Create Deposit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
