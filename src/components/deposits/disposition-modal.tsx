'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { DispositionType } from '@/lib/audit';
import { X, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { Select, SelectOption } from '@/components/ui/select';
import { useCurrency } from '@/components/providers/currency-provider';

interface DispositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deposit: any;
}

const DISPOSITION_OPTIONS: SelectOption[] = [
  { value: 'MATURED_REINVESTED', label: 'Matured & Reinvested into New Instrument', description: 'Rolled over into another fixed deposit or asset' },
  { value: 'TRANSFERRED_SAVINGS', label: 'Transferred to Savings / Checking Account', description: 'Funds credited to primary bank account' },
  { value: 'PREMATURE_WITHDRAWAL', label: 'Premature / Early Emergency Liquidation', description: 'Withdrawn before scheduled maturity with penalty' },
  { value: 'OTHER', label: 'Other / Portfolio Realignment', description: 'Reallocated to other assets or investments' },
];

export function DispositionModal({
  isOpen,
  onClose,
  onSuccess,
  deposit,
}: DispositionModalProps) {
  const { symbol, formatAmount } = useCurrency();
  const [dispositionType, setDispositionType] = useState<DispositionType>('MATURED_REINVESTED');
  const [destinationAccount, setDestinationAccount] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState<number | string>(0);
  const [realizedInterest, setRealizedInterest] = useState<number | string>(deposit?.accruedInterest || 0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (deposit) {
      setRealizedInterest(deposit.accruedInterest || deposit.totalInterestEarned || 0);
      setPenaltyAmount(0);
      setDestinationAccount('');
      setNotes('');
      setError(null);
    }
  }, [deposit, isOpen]);

  const netProceeds = useMemo(() => {
    if (!deposit) return 0;
    const p = Number(deposit.principalAmount || 0);
    const i = Number(realizedInterest || 0);
    const pen = Number(penaltyAmount || 0);
    return Math.max(0, p + i - pen);
  }, [deposit, realizedInterest, penaltyAmount]);

  if (!isOpen || !deposit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!destinationAccount.trim()) {
      setError('Payout destination account is required.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        dispositionType,
        destinationAccount: destinationAccount.trim(),
        realizedInterest: Number(realizedInterest),
        penaltyAmount: Number(penaltyAmount),
        notes: notes.trim() || null,
      };

      const res = await fetch(`/api/deposits/${deposit.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to close deposit');
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
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Close / Liquidate Fixed Deposit
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {deposit.bankName} • {deposit.accountNumber}
            </p>
          </div>
        </div>

        <div className="my-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Immutable Audit Requirement:</strong> Closing or liquidating this deposit creates an irrevocable snapshot entry in your permanent financial audit ledger.
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Select
              value={dispositionType}
              onChange={(val) => setDispositionType(val as DispositionType)}
              options={DISPOSITION_OPTIONS}
              label="Disposition Reason"
              placeholder="Select disposition reason"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Payout Destination Account / Entity <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={destinationAccount}
              onChange={(e) => setDestinationAccount(e.target.value)}
              placeholder="e.g. SBI Savings #9102 or Rollover Certificate"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Realized Interest Disbursed ({symbol})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400 font-mono">
                  {symbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={realizedInterest}
                  onChange={(e) => setRealizedInterest(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Early Penalty Deducted ({symbol})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400 font-mono">
                  {symbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={penaltyAmount}
                  onChange={(e) => setPenaltyAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Net Proceeds Calculation Box */}
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-emerald-800 dark:text-brand-emerald-300">
              Net Disbursed Proceeds (Principal + Interest - Penalty):
            </span>
            <span className="text-base font-bold text-brand-emerald-600 dark:text-brand-emerald-400 font-mono">
              {formatAmount(netProceeds)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Audit Notes / Memorandum (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Liquidated early for down payment; branch manager approved penalty waiver"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
            />
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
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Confirm & Write to Ledger</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
