'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { DepositModal } from '@/components/deposits/deposit-modal';
import { DispositionModal } from '@/components/deposits/disposition-modal';
import { Select } from '@/components/ui/select';
import { useCurrency } from '@/components/providers/currency-provider';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Edit2,
  Calendar,
  Building2,
  Loader2,
  Clock,
  Filter,
} from 'lucide-react';

export default function DepositsPage() {
  const { symbol, formatAmount } = useCurrency();
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('maturityDate');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<any | null>(null);
  const [closingDeposit, setClosingDeposit] = useState<any | null>(null);

  const fetchDeposits = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/deposits');
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

  // Unique bank list for dropdown
  const uniqueBanks = useMemo(() => {
    const set = new Set<string>();
    deposits.forEach((d) => {
      if (d.bankName) set.add(d.bankName);
    });
    return Array.from(set).sort();
  }, [deposits]);

  const bankOptions = useMemo(() => [
    { value: 'ALL', label: 'All Banks / Institutions' },
    ...uniqueBanks.map((b) => ({ value: b, label: b })),
  ], [uniqueBanks]);

  const statusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active Deposits' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'LIQUIDATED', label: 'Liquidated' },
  ];

  const sortOptions = [
    { value: 'maturityDate', label: 'Maturity (Soonest First)' },
    { value: 'principalHigh', label: 'Principal (High to Low)' },
    { value: 'rateHigh', label: 'Interest Rate (High to Low)' },
  ];

  // Client-side filtering & sorting
  const filteredDeposits = useMemo(() => {
    return deposits.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (bankFilter !== 'ALL' && d.bankName.toLowerCase() !== bankFilter.toLowerCase()) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesBank = d.bankName.toLowerCase().includes(q);
        const matchesAcc = d.accountNumber.toLowerCase().includes(q);
        if (!matchesBank && !matchesAcc) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'maturityDate') {
        return new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime();
      }
      if (sortBy === 'principalHigh') {
        return b.principalAmount - a.principalAmount;
      }
      if (sortBy === 'rateHigh') {
        return b.annualRate - a.annualRate;
      }
      return 0;
    });
  }, [deposits, statusFilter, bankFilter, search, sortBy]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <DashboardNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              Fixed Deposits Portfolio
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Active certificates, real-time accruals, and maturity planning.
            </p>
          </div>

          <button
            onClick={() => {
              setEditingDeposit(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-xl shadow-sm transition-all focus:ring-2 focus:ring-brand-emerald-500 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Add Fixed Deposit</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by bank or account number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Bank Filter */}
            <div className="min-w-[170px]">
              <Select
                value={bankFilter}
                onChange={setBankFilter}
                options={bankOptions}
                size="sm"
                searchable={true}
                placeholder="Filter Bank"
              />
            </div>

            {/* Status Filter */}
            <div className="min-w-[140px]">
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                size="sm"
                placeholder="Filter Status"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="min-w-[180px]">
              <Select
                value={sortBy}
                onChange={setSortBy}
                options={sortOptions}
                size="sm"
                placeholder="Sort By"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Table View"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Grid Card View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-brand-emerald-600" />
            <span className="text-xs">Loading deposits...</span>
          </div>
        ) : filteredDeposits.length === 0 ? (
          <div className="p-16 text-center brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
            <Building2 className="h-10 w-10 text-slate-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              No fixed deposits found matching the current filters.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid Card View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDeposits.map((fd) => {
              const isClosed = ['CLOSED', 'LIQUIDATED'].includes(fd.status);
              return (
                <div
                  key={fd.id}
                  className="brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center font-bold text-sm">
                          {fd.bankName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-950 dark:text-white">
                            {fd.bankName}
                          </h3>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {fd.accountNumber}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          fd.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-500/10 text-slate-500 border border-slate-500/30'
                        }`}
                      >
                        {fd.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 my-4 p-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Principal</span>
                        <span className="font-bold font-mono text-sm text-slate-900 dark:text-white">
                          {formatAmount(fd.principalAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Rate & Freq</span>
                        <span className="font-semibold text-xs text-brand-emerald-600 dark:text-brand-emerald-400">
                          {fd.annualRate}% ({fd.compoundingFrequency.slice(0, 4)})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Est. Maturity</span>
                        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {formatAmount(fd.maturityAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Accrued Interest</span>
                        <span className="font-mono text-xs font-semibold text-brand-emerald-600 dark:text-brand-emerald-400">
                          +{formatAmount(Number(fd.accruedInterest || 0))}
                        </span>
                      </div>
                    </div>

                    {!isClosed && (
                      <div className="space-y-1 mb-4">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fd.daysRemaining} days remaining
                          </span>
                          <span className="font-semibold text-slate-400">{fd.progressPercentage}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, fd.progressPercentage)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    {!isClosed ? (
                      <>
                        <button
                          onClick={() => {
                            setEditingDeposit(fd);
                            setIsModalOpen(true);
                          }}
                          className="flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-emerald-600 transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setClosingDeposit(fd)}
                          className="font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 transition-colors"
                        >
                          Close / Liquidate
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Archived in immutable ledger</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Bank & Account</th>
                    <th className="py-3 px-4">Principal</th>
                    <th className="py-3 px-4">Rate & Compounding</th>
                    <th className="py-3 px-4">Accrued Interest</th>
                    <th className="py-3 px-4">Maturity Value</th>
                    <th className="py-3 px-4">Maturity Date</th>
                    <th className="py-3 px-4">Status / Horizon</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {filteredDeposits.map((fd) => {
                    const isClosed = ['CLOSED', 'LIQUIDATED'].includes(fd.status);
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
                          {formatAmount(fd.principalAmount)}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-brand-emerald-700 dark:text-brand-emerald-400 block">
                            {fd.annualRate}%
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase">
                            {fd.compoundingFrequency.toLowerCase().replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-brand-emerald-600 dark:text-brand-emerald-400 font-semibold">
                          +{formatAmount(Number(fd.accruedInterest || 0))}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                          {formatAmount(fd.maturityAmount)}
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{new Date(fd.maturityDate).toLocaleDateString()}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {isClosed ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/30">
                              {fd.status}
                            </span>
                          ) : (
                            <div className="space-y-1 min-w-[110px]">
                              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 block">
                                {fd.daysRemaining} days remaining
                              </span>
                              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-emerald-500 rounded-full"
                                  style={{ width: `${Math.min(100, fd.progressPercentage)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {!isClosed ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingDeposit(fd);
                                  setIsModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                                title="Edit"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setClosingDeposit(fd)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                Close
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <DepositModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDeposit(null);
        }}
        onSuccess={fetchDeposits}
        deposit={editingDeposit}
      />

      <DispositionModal
        isOpen={Boolean(closingDeposit)}
        onClose={() => setClosingDeposit(null)}
        onSuccess={fetchDeposits}
        deposit={closingDeposit}
      />
    </div>
  );
}
