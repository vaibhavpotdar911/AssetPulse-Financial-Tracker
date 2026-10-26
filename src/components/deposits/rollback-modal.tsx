'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RotateCcw,
  RotateCw,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { useCurrency } from '@/components/providers/currency-provider';

interface RollbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deposit: any;
  onRenew?: (deposit: any) => void;
}

export function RollbackModal({
  isOpen,
  onClose,
  onSuccess,
  deposit,
  onRenew,
}: RollbackModalProps) {
  const { symbol, formatAmount } = useCurrency();
  const [targetStatus, setTargetStatus] = useState<'AUTO' | 'ACTIVE' | 'MATURED'>('AUTO');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deposit) {
      setTargetStatus('AUTO');
      setReason('');
      setError(null);
    }
  }, [deposit, isOpen]);

  const naturalMaturity = useMemo(() => {
    if (!deposit || !deposit.maturityDate) return { isMatured: false, label: 'ACTIVE' };
    const matDate = new Date(deposit.maturityDate);
    const now = new Date();
    const isMatured = now >= matDate;
    return {
      isMatured,
      label: isMatured ? 'MATURED' : 'ACTIVE',
      dateFormatted: matDate.toLocaleDateString(),
    };
  }, [deposit]);

  if (!isOpen || !deposit) return null;

  const handleRollback = async (triggerRenewAfter: boolean = false) => {
    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        targetStatus: targetStatus === 'AUTO' ? naturalMaturity.label : targetStatus,
        reason: reason.trim() || undefined,
      };

      const res = await fetch(`/api/deposits/${deposit.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to rollback deposit');
      }

      const updatedDeposit = data.deposit || {
        ...deposit,
        status: payload.targetStatus,
      };

      onSuccess();
      onClose();

      if (triggerRenewAfter && onRenew) {
        setTimeout(() => {
          onRenew(updatedDeposit);
        }, 150);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during rollback.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                Rollback Deposit Closure
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Restore closed/liquidated certificate back to active portfolio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Deposit Metadata Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-brand-emerald-500/10 text-brand-emerald-600 flex items-center justify-center font-bold text-xs">
                  {deposit.bankName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                    {deposit.bankName}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {deposit.accountNumber}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                  {deposit.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Principal</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatAmount(deposit.principalAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Maturity Date</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {new Date(deposit.maturityDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 text-purple-950 dark:text-purple-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-300">
              <ShieldAlert className="h-4 w-4" />
              <span>Correction & Rollback Ledger Action</span>
            </div>
            <p className="text-[11px] leading-relaxed text-purple-800 dark:text-purple-300/80">
              Rolling back will reactivate this instrument and immediately recalculate its principal, accrued returns, and horizon metrics in your portfolio. An immutable correction event will be appended to your audit ledger.
            </p>
          </div>

          {/* Target Status Choice */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Rollback Target Status
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                  targetStatus === 'AUTO'
                    ? 'border-purple-500 bg-purple-500/5 dark:bg-purple-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="targetStatus"
                  value="AUTO"
                  checked={targetStatus === 'AUTO'}
                  onChange={() => setTargetStatus('AUTO')}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    Auto-detect based on maturity date (Recommended)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Will be restored to{' '}
                    <strong className="text-purple-700 dark:text-purple-300 font-semibold">
                      {naturalMaturity.label}
                    </strong>{' '}
                    ({naturalMaturity.isMatured ? `matured on ${naturalMaturity.dateFormatted}` : `matures on ${naturalMaturity.dateFormatted}`}).
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                  targetStatus === 'ACTIVE'
                    ? 'border-purple-500 bg-purple-500/5 dark:bg-purple-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="targetStatus"
                  value="ACTIVE"
                  checked={targetStatus === 'ACTIVE'}
                  onChange={() => setTargetStatus('ACTIVE')}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    ACTIVE (Ongoing Tenure)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Force active status regardless of current calendar date.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                  targetStatus === 'MATURED'
                    ? 'border-purple-500 bg-purple-500/5 dark:bg-purple-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="targetStatus"
                  value="MATURED"
                  checked={targetStatus === 'MATURED'}
                  onChange={() => setTargetStatus('MATURED')}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    MATURED (Tenure Completed)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mark as matured certificate ready for renewal rollover or payout disposition.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Reason / Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Reason / Correction Note <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Deposit closed by mistake; instrument is renewed and still active"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2">
            {onRenew && (
              <button
                type="button"
                onClick={() => handleRollback(true)}
                disabled={loading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-brand-emerald-700 dark:text-brand-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Rollback & Renew Now</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleRollback(false)}
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-all focus:ring-2 focus:ring-purple-500"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Rolling back...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Confirm Rollback</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
