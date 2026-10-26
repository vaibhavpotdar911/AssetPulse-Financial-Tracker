'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { DepositModal } from '@/components/deposits/deposit-modal';
import { DispositionModal } from '@/components/deposits/disposition-modal';
import { RenewModal } from '@/components/deposits/renew-modal';
import { RollbackModal } from '@/components/deposits/rollback-modal';
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
  RotateCw,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export default function DepositsPage() {
  const { symbol, formatAmount } = useCurrency();
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [horizonFilter, setHorizonFilter] = useState('ALL');
  const [frequencyFilter, setFrequencyFilter] = useState('ALL');
  const [principalRangeFilter, setPrincipalRangeFilter] = useState('ALL');
  const [rateRangeFilter, setRateRangeFilter] = useState('ALL');
  const [autoRenewFilter, setAutoRenewFilter] = useState('ALL');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState('maturityDate');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<any | null>(null);
  const [closingDeposit, setClosingDeposit] = useState<any | null>(null);
  const [renewingDeposit, setRenewingDeposit] = useState<any | null>(null);
  const [rollbackDeposit, setRollbackDeposit] = useState<any | null>(null);

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

  const horizonOptions = [
    { value: 'ALL', label: 'All Horizons' },
    { value: 'MATURED', label: 'Matured / Overdue' },
    { value: 'URGENT_7', label: '≤ 7 Days (Urgent)' },
    { value: 'MONTH_30', label: '≤ 30 Days Left' },
    { value: 'QUARTER_90', label: '≤ 90 Days Left' },
    { value: 'YEAR_365', label: '≤ 1 Year Left' },
    { value: 'OVER_1_YEAR', label: '> 1 Year (Long Term)' },
  ];

  const frequencyOptions = [
    { value: 'ALL', label: 'All Frequencies' },
    { value: 'AT_MATURITY', label: 'Simple / At Maturity' },
    { value: 'QUARTERLY', label: 'Quarterly Compounding' },
    { value: 'MONTHLY', label: 'Monthly Compounding' },
    { value: 'SEMI_ANNUALLY', label: 'Semi-Annually' },
    { value: 'ANNUALLY', label: 'Annually' },
  ];

  const principalRangeOptions = useMemo(() => [
    { value: 'ALL', label: 'All Principal Ranges' },
    { value: 'UNDER_50K', label: `< ${symbol}50,000` },
    { value: '50K_100K', label: `${symbol}50,000 – ${symbol}1,00,000` },
    { value: '100K_500K', label: `${symbol}1,00,000 – ${symbol}5,00,000` },
    { value: '500K_1M', label: `${symbol}5,00,000 – ${symbol}10,00,000` },
    { value: 'OVER_1M', label: `> ${symbol}10,00,000` },
  ], [symbol]);

  const rateRangeOptions = [
    { value: 'ALL', label: 'All Interest Rates' },
    { value: 'BELOW_6', label: '< 6.00% p.a.' },
    { value: '6_TO_7', label: '6.00% – 7.00% p.a.' },
    { value: '7_TO_8', label: '7.00% – 8.00% p.a.' },
    { value: 'ABOVE_8', label: '8.00%+ (High Yield)' },
  ];

  const autoRenewOptions = [
    { value: 'ALL', label: 'All Auto-Renew' },
    { value: 'AUTO_ON', label: 'Auto-Renew ON' },
    { value: 'AUTO_OFF', label: 'Auto-Renew OFF' },
  ];

  const sortOptions = [
    { value: 'maturityDate', label: 'Maturity (Soonest First)' },
    { value: 'maturityDateDesc', label: 'Maturity (Furthest First)' },
    { value: 'principalHigh', label: 'Principal (High to Low)' },
    { value: 'principalLow', label: 'Principal (Low to High)' },
    { value: 'rateHigh', label: 'Interest Rate (High to Low)' },
    { value: 'rateLow', label: 'Interest Rate (Low to High)' },
    { value: 'accruedHigh', label: 'Accrued Interest (High to Low)' },
    { value: 'bankNameAsc', label: 'Bank Name (A-Z)' },
  ];

  // Active filters counter
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (bankFilter !== 'ALL') count++;
    if (statusFilter !== 'ALL') count++;
    if (horizonFilter !== 'ALL') count++;
    if (frequencyFilter !== 'ALL') count++;
    if (principalRangeFilter !== 'ALL') count++;
    if (rateRangeFilter !== 'ALL') count++;
    if (autoRenewFilter !== 'ALL') count++;
    if (search.trim()) count++;
    return count;
  }, [bankFilter, statusFilter, horizonFilter, frequencyFilter, principalRangeFilter, rateRangeFilter, autoRenewFilter, search]);

  const handleResetFilters = () => {
    setSearch('');
    setBankFilter('ALL');
    setStatusFilter('ALL');
    setHorizonFilter('ALL');
    setFrequencyFilter('ALL');
    setPrincipalRangeFilter('ALL');
    setRateRangeFilter('ALL');
    setAutoRenewFilter('ALL');
    setSortBy('maturityDate');
  };

  // Client-side filtering & sorting
  const filteredDeposits = useMemo(() => {
    return deposits.filter((d) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;

      // 2. Bank Filter
      if (bankFilter !== 'ALL' && d.bankName.toLowerCase() !== bankFilter.toLowerCase()) return false;

      // 3. Search query across Bank Name and Account Number
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesBank = d.bankName.toLowerCase().includes(q);
        const matchesAcc = d.accountNumber.toLowerCase().includes(q);
        if (!matchesBank && !matchesAcc) return false;
      }

      // 4. Horizon Filter
      if (horizonFilter !== 'ALL') {
        const isMatured = Boolean(d.isMatured || d.daysRemaining === 0 || d.status === 'MATURED');
        const days = d.daysRemaining !== undefined ? d.daysRemaining : 0;
        if (horizonFilter === 'MATURED' && !isMatured) return false;
        if (horizonFilter === 'URGENT_7' && (isMatured || days <= 0 || days > 7)) return false;
        if (horizonFilter === 'MONTH_30' && (isMatured || days <= 0 || days > 30)) return false;
        if (horizonFilter === 'QUARTER_90' && (isMatured || days <= 0 || days > 90)) return false;
        if (horizonFilter === 'YEAR_365' && (isMatured || days <= 0 || days > 365)) return false;
        if (horizonFilter === 'OVER_1_YEAR' && (isMatured || days <= 365)) return false;
      }

      // 5. Compounding Frequency Filter
      if (frequencyFilter !== 'ALL' && d.compoundingFrequency !== frequencyFilter) return false;

      // 6. Principal Amount Range Filter
      if (principalRangeFilter !== 'ALL') {
        const p = Number(d.principalAmount || 0);
        if (principalRangeFilter === 'UNDER_50K' && p >= 50000) return false;
        if (principalRangeFilter === '50K_100K' && (p < 50000 || p > 100000)) return false;
        if (principalRangeFilter === '100K_500K' && (p < 100000 || p > 500000)) return false;
        if (principalRangeFilter === '500K_1M' && (p < 500000 || p > 1000000)) return false;
        if (principalRangeFilter === 'OVER_1M' && p <= 1000000) return false;
      }

      // 7. Interest Rate Range Filter
      if (rateRangeFilter !== 'ALL') {
        const r = Number(d.annualRate || 0);
        if (rateRangeFilter === 'BELOW_6' && r >= 6) return false;
        if (rateRangeFilter === '6_TO_7' && (r < 6 || r >= 7)) return false;
        if (rateRangeFilter === '7_TO_8' && (r < 7 || r >= 8)) return false;
        if (rateRangeFilter === 'ABOVE_8' && r < 8) return false;
      }

      // 8. Auto-Renew Filter
      if (autoRenewFilter !== 'ALL') {
        if (autoRenewFilter === 'AUTO_ON' && !d.isAutoRenew) return false;
        if (autoRenewFilter === 'AUTO_OFF' && d.isAutoRenew) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'maturityDate') {
        return new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime();
      }
      if (sortBy === 'maturityDateDesc') {
        return new Date(b.maturityDate).getTime() - new Date(a.maturityDate).getTime();
      }
      if (sortBy === 'principalHigh') {
        return b.principalAmount - a.principalAmount;
      }
      if (sortBy === 'principalLow') {
        return a.principalAmount - b.principalAmount;
      }
      if (sortBy === 'rateHigh') {
        return b.annualRate - a.annualRate;
      }
      if (sortBy === 'rateLow') {
        return a.annualRate - b.annualRate;
      }
      if (sortBy === 'accruedHigh') {
        return (Number(b.accruedInterest) || 0) - (Number(a.accruedInterest) || 0);
      }
      if (sortBy === 'bankNameAsc') {
        return a.bankName.localeCompare(b.bankName);
      }
      return 0;
    });
  }, [deposits, statusFilter, bankFilter, search, sortBy, horizonFilter, frequencyFilter, principalRangeFilter, rateRangeFilter, autoRenewFilter]);

  const totalFilteredPrincipal = useMemo(() => {
    return filteredDeposits.reduce((acc, d) => acc + (Number(d.principalAmount) || 0), 0);
  }, [filteredDeposits]);

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

        {/* Filter & Search Bar with elevated z-30 */}
        <div className="relative z-30 p-4 sm:p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3.5">
          {/* Primary Filter Row */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by bank or account number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
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
              <div className="min-w-[135px]">
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  size="sm"
                  placeholder="Filter Status"
                />
              </div>

              {/* Horizon Filter */}
              <div className="min-w-[160px]">
                <Select
                  value={horizonFilter}
                  onChange={setHorizonFilter}
                  options={horizonOptions}
                  size="sm"
                  placeholder="Maturity Horizon"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="min-w-[175px]">
                <Select
                  value={sortBy}
                  onChange={setSortBy}
                  options={sortOptions}
                  size="sm"
                  placeholder="Sort By"
                />
              </div>

              {/* More Filters Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  showAdvancedFilters || activeFilterCount > 0
                    ? 'bg-emerald-500/10 border-brand-emerald-500/40 text-brand-emerald-700 dark:text-brand-emerald-300'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title="Toggle more filters"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>More Filters</span>
                {activeFilterCount > 0 && (
                  <span className="h-4 w-4 rounded-full bg-brand-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

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

          {/* Secondary Row: Advanced Filters */}
          {showAdvancedFilters && (
            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in-0 duration-150">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Compounding Frequency Filter */}
                <div className="min-w-[170px]">
                  <Select
                    value={frequencyFilter}
                    onChange={setFrequencyFilter}
                    options={frequencyOptions}
                    size="sm"
                    placeholder="Compounding Frequency"
                  />
                </div>

                {/* Principal Range Filter */}
                <div className="min-w-[175px]">
                  <Select
                    value={principalRangeFilter}
                    onChange={setPrincipalRangeFilter}
                    options={principalRangeOptions}
                    size="sm"
                    placeholder="Principal Amount Range"
                  />
                </div>

                {/* Interest Rate Range Filter */}
                <div className="min-w-[165px]">
                  <Select
                    value={rateRangeFilter}
                    onChange={setRateRangeFilter}
                    options={rateRangeOptions}
                    size="sm"
                    placeholder="Interest Rate Range"
                  />
                </div>

                {/* Auto-Renew Filter */}
                <div className="min-w-[150px]">
                  <Select
                    value={autoRenewFilter}
                    onChange={setAutoRenewFilter}
                    options={autoRenewOptions}
                    size="sm"
                    placeholder="Auto-Renew Setting"
                  />
                </div>
              </div>

              {/* Reset Filters Button */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors ml-auto"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset All Filters ({activeFilterCount})</span>
                </button>
              )}
            </div>
          )}

          {/* Active Filter Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>Showing <strong>{filteredDeposits.length}</strong> of <strong>{deposits.length}</strong> certificates</span>
              {filteredDeposits.length > 0 && (
                <>
                  <span>•</span>
                  <span>Filtered Principal: <strong className="font-mono text-slate-900 dark:text-white">{formatAmount(totalFilteredPrincipal)}</strong></span>
                </>
              )}
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-brand-emerald-600 dark:text-brand-emerald-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <X className="h-3 w-3" />
                <span>Clear all {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}</span>
              </button>
            )}
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
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                            : fd.status === 'MATURED'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                            : fd.status === 'LIQUIDATED'
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
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
                          onClick={() => setRenewingDeposit(fd)}
                          className="flex items-center gap-1 font-semibold text-brand-emerald-700 dark:text-brand-emerald-400 hover:text-brand-emerald-800 transition-colors"
                          title="Renew with same account number"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          <span>Renew</span>
                        </button>
                        <button
                          onClick={() => setClosingDeposit(fd)}
                          className="font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 transition-colors"
                        >
                          Close
                        </button>
                      </>
                    ) : (
                      <div className="w-full flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 italic">Archived</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setRollbackDeposit(fd)}
                            className="inline-flex items-center gap-1 font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 text-xs px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                            title="Rollback closed deposit back to active or matured"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Rollback</span>
                          </button>
                          <button
                            onClick={() => setRenewingDeposit(fd)}
                            className="inline-flex items-center gap-1 font-semibold text-brand-emerald-700 dark:text-brand-emerald-400 hover:text-brand-emerald-800 text-xs px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                            title="Renew deposit"
                          >
                            <RotateCw className="h-3 w-3" />
                            <span>Renew</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="relative z-10 brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm">
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
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                fd.status === 'LIQUIDATED'
                                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                  : 'bg-slate-500/10 text-slate-500 border border-slate-500/30'
                              }`}
                            >
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
                                onClick={() => setRenewingDeposit(fd)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-emerald-700 dark:text-brand-emerald-400 hover:text-brand-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                title="Renew with same account number"
                              >
                                <RotateCw className="h-3 w-3" />
                                <span>Renew</span>
                              </button>
                              <button
                                onClick={() => setClosingDeposit(fd)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                Close
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setRollbackDeposit(fd)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                                title="Rollback closed deposit back to active or matured"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Rollback</span>
                              </button>
                              <button
                                onClick={() => setRenewingDeposit(fd)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-emerald-700 dark:text-brand-emerald-400 hover:text-brand-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                title="Renew with same account number"
                              >
                                <RotateCw className="h-3 w-3" />
                                <span>Renew</span>
                              </button>
                            </div>
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
        onRenew={(dep) => setRenewingDeposit(dep)}
      />

      <RenewModal
        isOpen={Boolean(renewingDeposit)}
        onClose={() => setRenewingDeposit(null)}
        onSuccess={fetchDeposits}
        deposit={renewingDeposit}
      />

      <RollbackModal
        isOpen={Boolean(rollbackDeposit)}
        onClose={() => setRollbackDeposit(null)}
        onSuccess={fetchDeposits}
        deposit={rollbackDeposit}
        onRenew={(dep) => setRenewingDeposit(dep)}
      />
    </div>
  );
}
