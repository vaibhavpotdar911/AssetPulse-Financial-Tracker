'use client';

import React, { useState, useEffect } from 'react';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { DiffInspector } from '@/components/audit/diff-inspector';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useCurrency } from '@/components/providers/currency-provider';
import {
  History,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

const ACTION_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Actions' },
  { value: 'CREATED', label: 'CREATED (Certificate Issued)' },
  { value: 'UPDATED', label: 'UPDATED (Terms Modified)' },
  { value: 'CLOSED', label: 'CLOSED (Tenure Completed)' },
  { value: 'LIQUIDATED', label: 'LIQUIDATED (Early Exit)' },
  { value: 'DELETED', label: 'DELETED' },
];

export default function AuditLogsPage() {
  const { formatAmount } = useCurrency();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [bankQuery, setBankQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter !== 'ALL') params.set('action', actionFilter);
      if (bankQuery.trim()) params.set('bankName', bankQuery.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, [actionFilter, bankQuery, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATED':
        return 'bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 border-emerald-500/30';
      case 'UPDATED':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
      case 'CLOSED':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'LIQUIDATED':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30';
      case 'DELETED':
        return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
      default:
        return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <DashboardNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-brand-emerald-700 dark:text-brand-emerald-300 text-[11px] font-semibold mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Immutable Ledger Protection Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              Financial Audit Ledger
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Append-only cryptographic timeline of all portfolio creations, recalculations, closures, and dispositions.
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by bank name..."
              value={bankQuery}
              onChange={(e) => setBankQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
            />
          </form>

          <div className="flex flex-wrap items-center gap-3">
            {/* Action Filter */}
            <div className="min-w-[180px]">
              <Select
                value={actionFilter}
                onChange={setActionFilter}
                options={ACTION_FILTER_OPTIONS}
                size="sm"
                placeholder="All Actions"
              />
            </div>

            {/* Date Range with custom DatePicker */}
            <div className="flex items-center gap-1.5 min-w-[280px]">
              <div className="flex-1">
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="From date"
                  size="sm"
                />
              </div>
              <span className="text-slate-400 text-xs px-0.5">to</span>
              <div className="flex-1">
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="To date"
                  size="sm"
                />
              </div>
            </div>

            {(startDate || endDate || bankQuery || actionFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setBankQuery('');
                  setActionFilter('ALL');
                }}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Ledger Table */}
        <div className="brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-brand-emerald-600" />
              <span className="text-xs">Loading ledger entries...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-16 text-center">
              <History className="h-10 w-10 text-slate-400 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No audit records found.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Bank & Account</th>
                    <th className="py-3 px-4">Principal</th>
                    <th className="py-3 px-4">Realized Yield</th>
                    <th className="py-3 px-4">Disposition Type</th>
                    <th className="py-3 px-4 text-right">Inspector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {logs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                            isExpanded ? 'bg-slate-50/80 dark:bg-slate-900/80' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border ${getActionBadge(
                                log.action
                              )}`}
                            >
                              {log.action}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {log.bankName}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {log.accountNumber}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                            {formatAmount(log.principalAmount)}
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            {log.realizedInterest !== null && log.realizedInterest !== undefined ? (
                              <span className="text-brand-emerald-600 dark:text-brand-emerald-400 font-semibold">
                                +{formatAmount(Number(log.realizedInterest))}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {log.dispositionType ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                {log.dispositionType}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                            >
                              <span>{isExpanded ? 'Collapse' : 'Inspect'}</span>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Interactive Diff / Snapshot Inspector */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-4 bg-slate-950/80">
                              <DiffInspector log={log} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
