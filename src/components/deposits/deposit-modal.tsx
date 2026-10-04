'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { calculateFixedDeposit, CompoundingFrequency } from '@/lib/financial';
import { X, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deposit?: any; // If provided, edit mode
}

export function DepositModal({ isOpen, onClose, onSuccess, deposit }: DepositModalProps) {
  const isEdit = Boolean(deposit);

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [principal, setPrincipal] = useState<number | string>(100000);
  const [annualRate, setAnnualRate] = useState<number | string>(7.5);
  const [compoundingFrequency, setCompoundingFrequency] = useState<CompoundingFrequency>('QUARTERLY');
  const [startDate, setStartDate] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [isAutoRenew, setIsAutoRenew] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (deposit) {
      setBankName(deposit.bankName || '');
      setAccountNumber(deposit.accountNumber || '');
      setPrincipal(deposit.principalAmount || 100000);
      setAnnualRate(deposit.annualRate || 7.5);
      setCompoundingFrequency(deposit.compoundingFrequency || 'QUARTERLY');
      setStartDate(deposit.startDate ? new Date(deposit.startDate).toISOString().split('T')[0] : '');
      setMaturityDate(deposit.maturityDate ? new Date(deposit.maturityDate).toISOString().split('T')[0] : '');
      setIsAutoRenew(deposit.isAutoRenew || false);
      setNotes(deposit.notes || '');
    } else {
      setBankName('');
      setAccountNumber('');
      setPrincipal(100000);
      setAnnualRate(7.5);
      setCompoundingFrequency('QUARTERLY');
      const today = new Date().toISOString().split('T')[0];
      const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
      setStartDate(today);
      setMaturityDate(nextYear);
      setIsAutoRenew(false);
      setNotes('');
    }
    setError(null);
  }, [deposit, isOpen]);

  // LIVE Calculation Preview
  const calculationPreview = useMemo(() => {
    const numPrincipal = Number(principal);
    const numRate = Number(annualRate);
    if (!numPrincipal || numPrincipal <= 0 || !numRate || numRate < 0 || !startDate || !maturityDate) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 my-8">
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
          Enter deposit certificate parameters with real-time compound interest preview.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bank / Financial Institution *
              </label>
              <input
                type="text"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. JPMorgan Chase, HDFC"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Account / Certificate Number *
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. FD-2026-9081"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Principal Amount ($) *
              </label>
              <input
                type="number"
                required
                min="1"
                step="any"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Annual Rate (%) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Compounding Frequency *
              </label>
              <select
                value={compoundingFrequency}
                onChange={(e) => setCompoundingFrequency(e.target.value as CompoundingFrequency)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
              >
                <option value="MONTHLY">Monthly (n=12)</option>
                <option value="QUARTERLY">Quarterly (n=4)</option>
                <option value="SEMI_ANNUALLY">Semi-Annually (n=2)</option>
                <option value="ANNUALLY">Annually (n=1)</option>
                <option value="AT_MATURITY">At Maturity (Simple)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Maturity Date *
              </label>
              <input
                type="date"
                required
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* LIVE Calculation Preview Card */}
          {calculationPreview && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 text-slate-900 dark:text-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-emerald-700 dark:text-brand-emerald-400 mb-2 uppercase tracking-wider">
                <Sparkles className="h-4 w-4" />
                <span>Live Financial Engine Preview</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Est. Maturity Amount</span>
                  <span className="font-bold text-sm text-brand-emerald-600 dark:text-brand-emerald-400 font-mono">
                    ${calculationPreview.maturityAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Total Interest</span>
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 font-mono">
                    +${calculationPreview.totalInterestEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Accrued to Date</span>
                  <span className="font-semibold text-sm text-indigo-600 dark:text-indigo-400 font-mono">
                    +${calculationPreview.accruedInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Days Remaining</span>
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    {calculationPreview.daysRemaining} days ({calculationPreview.progressPercentage}%)
                  </span>
                </div>
              </div>
            </div>
          )}

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
