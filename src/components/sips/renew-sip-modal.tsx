'use client';

import React, { useState, useEffect } from 'react';
import { calculateRecurringDeposit } from '@/lib/financial';
import {
  X,
  RotateCw,
  Coins,
  Calendar,
  Lock,
  ArrowRight,
  Calculator,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Select, SelectOption } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useCurrency } from '@/components/providers/currency-provider';

interface RenewSipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sip: any;
}

const FREQUENCY_OPTIONS: SelectOption[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'DAILY', label: 'Daily' },
];

const RD_COMPOUNDING_OPTIONS: SelectOption[] = [
  { value: 'QUARTERLY', label: 'Quarterly Compounding (Standard)' },
  { value: 'MONTHLY', label: 'Monthly Compounding' },
];

export function RenewSipModal({ isOpen, onClose, onSuccess, sip }: RenewSipModalProps) {
  const { symbol, formatAmount } = useCurrency();

  const [installmentAmount, setInstallmentAmount] = useState<number | string>('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [annualRate, setAnnualRate] = useState<number | string>('');
  const [tenureMonths, setTenureMonths] = useState<number | string>('');
  const [compoundingFrequency, setCompoundingFrequency] = useState('QUARTERLY');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sip && isOpen) {
      setInstallmentAmount(sip.installmentAmount || '');
      setFrequency(sip.frequency || 'MONTHLY');
      setAnnualRate(sip.annualRate !== undefined && sip.annualRate !== null ? sip.annualRate : '');
      setTenureMonths(sip.tenureMonths !== undefined && sip.tenureMonths !== null ? sip.tenureMonths : '');
      setCompoundingFrequency(sip.compoundingFrequency || 'QUARTERLY');

      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setNotes(`Renewed contract for account/folio #${sip.folioNumber || 'N/A'}`);
      setError(null);
    }
  }, [sip, isOpen]);

  // Projected maturity if RD
  const isRD = sip?.assetType === 'RECURRING_DEPOSIT';
  const rdProjection = React.useMemo(() => {
    if (!isRD) return null;
    const inst = parseFloat(String(installmentAmount));
    const rate = parseFloat(String(annualRate));
    const months = parseInt(String(tenureMonths), 10);
    if (!inst || inst <= 0 || !rate || rate <= 0 || !months || months <= 0) return null;

    try {
      return calculateRecurringDeposit({
        monthlyInstallment: inst,
        annualRate: rate,
        tenureMonths: months,
        compoundingFrequency: compoundingFrequency === 'MONTHLY' ? 'MONTHLY' : 'QUARTERLY',
      });
    } catch {
      return null;
    }
  }, [isRD, installmentAmount, annualRate, tenureMonths, compoundingFrequency]);

  if (!isOpen || !sip) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const inst = parseFloat(String(installmentAmount));
    if (isNaN(inst) || inst <= 0) {
      setError('Installment amount must be greater than zero.');
      return;
    }

    if (isRD) {
      const rate = parseFloat(String(annualRate));
      if (isNaN(rate) || rate <= 0) {
        setError('Annual interest rate percentage is required for Recurring Deposits.');
        return;
      }
      const months = parseInt(String(tenureMonths), 10);
      if (isNaN(months) || months <= 0) {
        setError('Tenure in months is required for Recurring Deposits.');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        installmentAmount: inst,
        frequency,
        annualRate: annualRate !== '' ? parseFloat(String(annualRate)) : null,
        tenureMonths: tenureMonths !== '' ? parseInt(String(tenureMonths), 10) : null,
        compoundingFrequency: isRD ? compoundingFrequency : null,
        startDate,
        notes: notes.trim() || null,
      };

      const res = await fetch(`/api/sips/${sip.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to renew schedule');
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
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center">
            <RotateCw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Renew {isRD ? 'Recurring Deposit' : 'SIP Schedule'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {sip.name}
              </span>
              {sip.folioNumber && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-brand-emerald-700 dark:text-brand-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    <Lock className="h-3 w-3" />
                    {sip.folioNumber}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Renew this schedule for a new investment cycle with the same account / folio number to maintain unbroken portfolio tracking.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Installment Amount ({symbol}) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400 font-mono">
                  {symbol}
                </span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={installmentAmount}
                  onChange={(e) => setInstallmentAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <Select
                value={frequency}
                onChange={setFrequency}
                options={FREQUENCY_OPTIONS}
                label="Frequency"
              />
            </div>
          </div>

          {isRD && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Recurring Deposit Terms
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    New Annual Rate (%) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 7.10"
                    value={annualRate}
                    onChange={(e) => setAnnualRate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    New Tenure (Months) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 12"
                    value={tenureMonths}
                    onChange={(e) => setTenureMonths(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <Select
                  value={compoundingFrequency}
                  onChange={setCompoundingFrequency}
                  options={RD_COMPOUNDING_OPTIONS}
                  label="Compounding Frequency"
                  size="sm"
                />
              </div>

              {rdProjection && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-brand-emerald-700 dark:text-brand-emerald-300 flex items-center justify-between">
                  <span>Projected Maturity Value:</span>
                  <span className="font-mono font-bold text-sm">
                    {formatAmount(rdProjection.maturityAmount)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              label="New Cycle Start Date"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Renewal Memo
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Extended for 12 more months"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
            />
          </div>

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
                  <span>Renewing...</span>
                </>
              ) : (
                <>
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Confirm & Renew Schedule</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
