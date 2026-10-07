'use client';

import React, { useState, useEffect } from 'react';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { useCurrency } from '@/components/providers/currency-provider';
import {
  Coins,
  Plus,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Trash2,
  ChevronRight,
  ArrowUpRight,
  Layers,
  Building,
  HelpCircle,
  Loader2,
  CalendarDays,
} from 'lucide-react';

interface SipItem {
  id: string;
  name: string;
  assetType: 'MUTUAL_FUND' | 'RECURRING_DEPOSIT' | 'STOCK';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  installmentAmount: number;
  annualRate?: number | null;
  tenureMonths?: number | null;
  targetMaturityAmount?: number | null;
  startDate: string;
  endDate?: string | null;
  schemeCode?: string | null;
  schemeName?: string | null;
  folioNumber?: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  totalInvested: number;
  installmentsExecuted: number;
  nextExecutionDate: string;
  notes?: string | null;
  executions?: Array<{
    id: string;
    executionDate: string;
    amount: number;
    notes?: string | null;
  }>;
}

export default function SipsPage() {
  const { formatAmount } = useCurrency();
  const [sips, setSips] = useState<SipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCommitment, setTotalCommitment] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    assetType: 'MUTUAL_FUND' as 'MUTUAL_FUND' | 'RECURRING_DEPOSIT' | 'STOCK',
    frequency: 'MONTHLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    installmentAmount: '',
    dayOfWeek: 1,
    dayOfMonth: 1,
    startDate: new Date().toISOString().split('T')[0],
    schemeName: '',
    folioNumber: '',
    annualRate: '',
    tenureMonths: '',
    notes: '',
  });

  const fetchSips = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sips');
      const data = await res.json();
      if (data.success) {
        setSips(data.sips || []);
        setTotalCommitment(data.totalMonthlyCommitment || 0);
      }
    } catch (err) {
      console.error('Error fetching SIPs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSips();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/sips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        setFormData({
          name: '',
          assetType: 'MUTUAL_FUND',
          frequency: 'MONTHLY',
          installmentAmount: '',
          dayOfWeek: 1,
          dayOfMonth: 1,
          startDate: new Date().toISOString().split('T')[0],
          schemeName: '',
          folioNumber: '',
          annualRate: '',
          tenureMonths: '',
          notes: '',
        });
        fetchSips();
      } else {
        alert(data.error || 'Failed to create SIP');
      }
    } catch {
      alert('Error creating SIP');
    }
  };

  const handleToggleStatus = async (sip: SipItem) => {
    const newStatus = sip.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await fetch(`/api/sips/${sip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchSips();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SIP schedule?')) return;
    try {
      await fetch(`/api/sips/${id}`, { method: 'DELETE' });
      fetchSips();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteInstallment = async (id: string) => {
    try {
      setExecutingId(id);
      const res = await fetch(`/api/sips/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSips();
      } else {
        alert(data.error || 'Failed to record installment');
      }
    } catch {
      alert('Error executing installment');
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <DashboardNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-brand-emerald-700 dark:text-brand-emerald-300 text-[11px] font-semibold mb-2">
              <Coins className="h-3.5 w-3.5" />
              <span>Systematic Investment Plans & Recurring Deposits</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              SIP & Recurring Outflow Manager
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Automate and track your daily, weekly, and monthly SIP commitments across Mutual Funds, Stocks, and RDs.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white font-semibold text-sm shadow-md transition-all self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>New SIP / RD Schedule</span>
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Active SIP Schedules
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-slate-950 dark:text-white">
                {sips.filter((s) => s.status === 'ACTIVE').length}
              </span>
              <span className="text-xs text-slate-400">active commitments</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Monthly Outflow Obligation
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-brand-emerald-600 dark:text-brand-emerald-400 font-mono">
                {formatAmount(totalCommitment)}
              </span>
              <span className="text-xs text-slate-400">/ month</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Capital Deployed via SIPs
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-slate-950 dark:text-white font-mono">
                {formatAmount(sips.reduce((acc, curr) => acc + (curr.totalInvested || 0), 0))}
              </span>
              <span className="text-xs text-slate-400">cumulative</span>
            </div>
          </div>
        </div>

        {/* SIP Schedule List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-emerald-600" />
            <span>Active & Recurring Schedules</span>
          </h2>

          {loading ? (
            <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-brand-emerald-600" />
              <span className="text-sm">Loading SIP schedules...</span>
            </div>
          ) : sips.length === 0 ? (
            <div className="p-12 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 text-center space-y-3">
              <Coins className="h-10 w-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">No SIP schedules found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Set up recurring Daily, Weekly, or Monthly investments for Mutual Funds, Stocks, or Bank Recurring Deposits.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 font-semibold text-xs border border-emerald-500/30 hover:bg-emerald-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create your first schedule</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sips.map((sip) => {
                const nextDate = new Date(sip.nextExecutionDate);
                const nextDateStr = nextDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div
                    key={sip.id}
                    className="p-5 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            sip.assetType === 'MUTUAL_FUND'
                              ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                              : sip.assetType === 'RECURRING_DEPOSIT'
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              : 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                          }`}
                        >
                          {sip.assetType.replace('_', ' ')}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            sip.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-brand-emerald-600 border border-emerald-500/20'
                              : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                          }`}
                        >
                          {sip.status}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-950 dark:text-white mt-2 line-clamp-1">
                        {sip.name}
                      </h3>
                      {sip.schemeName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {sip.schemeName}
                        </p>
                      )}

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Installment:</span>
                          <span className="font-bold text-slate-900 dark:text-white font-mono">
                            {formatAmount(sip.installmentAmount)}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">({sip.frequency.toLowerCase()})</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Next Due:</span>
                          <span className="font-semibold text-brand-emerald-600 dark:text-brand-emerald-400">
                            {nextDateStr}
                          </span>
                        </div>
                      </div>

                      {sip.assetType === 'RECURRING_DEPOSIT' && sip.targetMaturityAmount && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                          Target Maturity: <strong>{formatAmount(sip.targetMaturityAmount)}</strong> ({sip.annualRate}% @ {sip.tenureMonths}m)
                        </div>
                      )}

                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                        <span>Executed: {sip.installmentsExecuted} times</span>
                        <span>Invested: {formatAmount(sip.totalInvested)}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleExecuteInstallment(sip.id)}
                        disabled={executingId === sip.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                      >
                        {executingId === sip.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        <span>Record Installment</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleStatus(sip)}
                          title={sip.status === 'ACTIVE' ? 'Pause SIP' : 'Resume SIP'}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          {sip.status === 'ACTIVE' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(sip.id)}
                          title="Delete SIP"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal for Creating SIP */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl brand-glass bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <Coins className="h-5 w-5 text-brand-emerald-600" />
              <span>Create New SIP / Recurring Deposit</span>
            </h3>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Schedule Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Parag Parikh Flexi Cap Fund SIP"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Asset Category *
                  </label>
                  <select
                    value={formData.assetType}
                    onChange={(e) => setFormData({ ...formData, assetType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="MUTUAL_FUND">Mutual Fund</option>
                    <option value="RECURRING_DEPOSIT">Recurring Deposit (RD)</option>
                    <option value="STOCK">Stock / Equity</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Frequency *
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Installment Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="5000"
                    value={formData.installmentAmount}
                    onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {formData.frequency === 'WEEKLY'
                      ? 'Day of Week (1=Mon, 7=Sun)'
                      : formData.frequency === 'MONTHLY'
                      ? 'Day of Month (1 - 31)'
                      : 'Start Date'}
                  </label>
                  {formData.frequency === 'WEEKLY' ? (
                    <select
                      value={formData.dayOfWeek}
                      onChange={(e) => setFormData({ ...formData, dayOfWeek: parseInt(e.target.value, 10) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                    </select>
                  ) : formData.frequency === 'MONTHLY' ? (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.dayOfMonth}
                      onChange={(e) => setFormData({ ...formData, dayOfMonth: parseInt(e.target.value, 10) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                  ) : (
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  )}
                </div>
              </div>

              {formData.assetType === 'RECURRING_DEPOSIT' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div>
                    <label className="block font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      Annual Interest Rate (%) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 7.1"
                      value={formData.annualRate}
                      onChange={(e) => setFormData({ ...formData, annualRate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      Tenure (Months) *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 12"
                      value={formData.tenureMonths}
                      onChange={(e) => setFormData({ ...formData, tenureMonths: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Scheme or Institution Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank / Axis Mutual Fund"
                    value={formData.schemeName}
                    onChange={(e) => setFormData({ ...formData, schemeName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Folio / Account Number
                  </label>
                  <input
                    type="text"
                    placeholder="Optional reference"
                    value={formData.folioNumber}
                    onChange={(e) => setFormData({ ...formData, folioNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white font-semibold"
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
