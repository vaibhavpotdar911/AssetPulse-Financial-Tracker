'use client';

import React from 'react';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { CurrencySelector } from '@/components/settings/currency-selector';
import { NotificationSettingsManager } from '@/components/settings/notification-settings';
import { useCurrency, SUPPORTED_CURRENCIES } from '@/components/providers/currency-provider';
import { Settings, Coins, ShieldCheck, Database, Sliders, CheckCircle2, Bell } from 'lucide-react';

export default function SettingsPage() {
  const { currency, symbol, currencyConfig, formatAmount } = useCurrency();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <DashboardNav />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Title */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-brand-emerald-700 dark:text-brand-emerald-300 text-[11px] font-semibold mb-2">
            <Sliders className="h-3.5 w-3.5" />
            <span>Preferences & Configuration</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Application Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Customize your currency display, regional formatting, and portfolio preferences.
          </p>
        </div>

        {/* Currency & Financial Localization Card */}
        <div className="p-6 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-brand-emerald-600 dark:text-brand-emerald-400 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                Currency & Localization
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Set your primary currency. Defaults to <strong className="text-slate-800 dark:text-slate-200">Indian Rupees (₹)</strong> and automatically updates portfolio calculations, interest metrics, and ledger views across the application.
              </p>
            </div>
          </div>

          <div className="pt-2 max-w-md">
            <CurrencySelector size="md" />
          </div>

          {/* Live Preview Box */}
          <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Live Currency Formatting Preview
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Selected Currency:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {currencyConfig.name}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Symbol:</span>
                <span className="font-bold text-brand-emerald-600 dark:text-brand-emerald-400 font-mono text-base">
                  {symbol}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Sample ₹1,00,000 / $100k:</span>
                <span className="font-bold text-brand-emerald-600 dark:text-brand-emerald-400 font-mono">
                  {formatAmount(100000)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Email & Telegram Multi-Channel Alerts Settings Card */}
        <NotificationSettingsManager />

        {/* Database & Architecture Info */}
        <div className="p-6 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-brand-indigo-500/10 text-brand-indigo-600 dark:text-brand-indigo-400 flex items-center justify-center shrink-0">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                Database Engine
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                AssetPulse supports dual-database connectivity. Local embedded SQLite is zero-configuration; external MySQL instances can be hooked up anytime via <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[11px]">DATABASE_URL</code> in <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[11px]">.env</code>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-brand-emerald-600 shrink-0" />
              <span className="text-xs text-slate-700 dark:text-slate-300">
                Active Dialect: <strong>SQLite (fintrack.db)</strong>
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-brand-emerald-600 shrink-0" />
              <span className="text-xs text-slate-700 dark:text-slate-300">
                Immutable Ledger: <strong>Enforced</strong>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
