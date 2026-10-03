'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { DepositModal } from '@/components/deposits/deposit-modal';
import { DispositionModal } from '@/components/deposits/disposition-modal';
import {
  Wallet,
  TrendingUp,
  PiggyBank,
  ShieldCheck,
  AlertCircle,
  Plus,
  ArrowRight,
  History,
  Building2,
  Calendar,
  Loader2,
} from 'lucide-react';

export default function DashboardPage() {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDepositForClose, setSelectedDepositForClose] = useState<any | null>(null);

  const fetchDeposits = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/deposits?sortBy=maturityDate&sortOrder=asc');
      if (res.ok) {
        const data = await res.json();
        setDeposits(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
  }, []);

  // Overview metrics calculations
  const activeDeposits = deposits.filter((d) => d.status === 'ACTIVE');
  const totalPrincipal = activeDeposits.reduce((sum, d) => sum + (d.principalAmount || 0), 0);
  const totalAccruedInterest = activeDeposits.reduce((sum, d) => sum + (d.accruedInterest || 0), 0);
  const totalMaturityValue = activeDeposits.reduce((sum, d) => sum + (d.maturityAmount || 0), 0);
  const maturedCount = activeDeposits.filter((d) => d.isMatured || d.daysRemaining === 0).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <DashboardNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              Portfolio Overview
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Real-time fixed deposit accruals, performance metrics, and maturity horizon.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-xl shadow-sm transition-all focus:ring-2 focus:ring-brand-emerald-500"
            >
              <Plus className="h-4 w-4" />
              <span>Add Deposit</span>
            </button>
            <Link
              href="/deposits"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/audit-logs"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              <span>Audit Ledger</span>
            </Link>
          </div>
        </div>

        {/* 5 Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Portfolio Principal */}
          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Principal
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-slate-950 dark:text-white">
              ${totalPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Invested principal capital
            </span>
          </div>

          {/* Card 2: Accrued Interest to Date */}
          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Accrued Interest
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-brand-emerald-600 dark:text-brand-emerald-400">
              +${totalAccruedInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Earned up to today
            </span>
          </div>

          {/* Card 3: Estimated Maturity Value */}
          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Est. Maturity Value
              </span>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                <PiggyBank className="h-4 w-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              ${totalMaturityValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Principal + guaranteed payout
            </span>
          </div>

          {/* Card 4: Active Deposits Count */}
          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Active Deposits
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white">
              {activeDeposits.length}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Yield-generating contracts
            </span>
          </div>

          {/* Card 5: Matured Deposits Count */}
          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Matured Deposits
              </span>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${maturedCount > 0 ? 'text-amber-600' : 'text-slate-950 dark:text-white'}`}>
              {maturedCount}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Ready for rollover/liquidation
            </span>
          </div>
        </div>

        {/* Recent Deposits Table */}
        <div className="brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                Upcoming & Active Deposits
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sorted by nearest maturity date
              </p>
            </div>
            <Link
              href="/deposits"
              className="text-xs font-semibold text-brand-emerald-600 dark:text-brand-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>Manage All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-brand-emerald-600" />
              <span className="text-xs">Loading portfolio data...</span>
            </div>
          ) : activeDeposits.length === 0 ? (
            <div className="p-12 text-center">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center mx-auto mb-3">
                <Building2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                No active fixed deposits yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                Add your first fixed deposit certificate to begin tracking compounding returns and maturity dates.
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-lg shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Add Fixed Deposit</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Bank & Certificate</th>
                    <th className="py-3 px-4">Principal</th>
                    <th className="py-3 px-4">Annual Rate</th>
                    <th className="py-3 px-4">Accrued Interest</th>
                    <th className="py-3 px-4">Maturity Date</th>
                    <th className="py-3 px-4">Progress Horizon</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {activeDeposits.slice(0, 6).map((fd) => {
                    const isMatured = fd.isMatured || fd.daysRemaining === 0;
                    return (
                      <tr key={fd.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {fd.bankName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white block">
                                {fd.bankName}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {fd.accountNumber}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          ${fd.principalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300">
                            {fd.annualRate}% ({fd.compoundingFrequency.toLowerCase().replace('_', ' ')})
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-brand-emerald-600 dark:text-brand-emerald-400 font-semibold">
                          +${Number(fd.accruedInterest || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{new Date(fd.maturityDate).toLocaleDateString()}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 min-w-[140px]">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className={`font-semibold ${isMatured ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                                {isMatured ? 'Matured Today' : `${fd.daysRemaining} days left`}
                              </span>
                              <span className="text-slate-400">{fd.progressPercentage}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isMatured ? 'bg-amber-500' : 'bg-brand-emerald-500'}`}
                                style={{ width: `${Math.min(100, fd.progressPercentage)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedDepositForClose(fd)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          >
                            Close / Liquidate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <DepositModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={fetchDeposits}
      />

      <DispositionModal
        isOpen={Boolean(selectedDepositForClose)}
        onClose={() => setSelectedDepositForClose(null)}
        onSuccess={fetchDeposits}
        deposit={selectedDepositForClose}
      />
    </div>
  );
}
