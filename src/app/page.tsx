import React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/navbar';
import {
  TrendingUp,
  ShieldCheck,
  History,
  BellRing,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-28 md:pt-28 md:pb-36 border-b border-slate-200 dark:border-slate-800">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(8,173,106,0.15),rgba(32,30,81,0.05))]" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 text-xs font-semibold uppercase tracking-wider mb-8">
              <ShieldCheck className="h-4 w-4" />
              Open-Source Financial Asset Tracking
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-950 dark:text-white max-w-4xl mx-auto leading-tight">
              Master Your Fixed Deposits with <span className="brand-gradient-text">Precision & Audit Trust</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Automated multi-frequency compounding, proactive maturity alerts, immutable closure audit ledger, and dual SQLite/MySQL database engine.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
              >
                Start Tracking Free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Sign In to Portfolio
              </Link>
            </div>

            {/* Quick Proof Points */}
            <div className="mt-14 pt-10 border-t border-slate-200/60 dark:border-slate-800/60 grid grid-cols-2 md:grid-cols-4 gap-6 text-left max-w-4xl mx-auto">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-emerald-600 dark:text-brand-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Exact Accrual Formula</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-emerald-600 dark:text-brand-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Zero-Config SQLite</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-emerald-600 dark:text-brand-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Immutable Audit Trail</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-emerald-600 dark:text-brand-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Self-Host with Docker</span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-20 md:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Engineered for Rigorous Financial Tracking
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Every deposit, calculation, and liquidation event is tracked with mathematical accuracy and verifiable audit history.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl brand-glass shadow-sm hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-brand-emerald-500/10 text-brand-emerald-600 dark:text-brand-emerald-400 flex items-center justify-center mb-6">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                Multi-Frequency Math Engine
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Supports monthly, quarterly, semi-annual, annual, and at-maturity compounding with actual/365 elapsed interest calculation within ±$0.01 precision.
              </p>
            </div>

            <div className="p-8 rounded-2xl brand-glass shadow-sm hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-brand-indigo-500/10 text-brand-indigo-600 dark:text-brand-indigo-400 flex items-center justify-center mb-6">
                <History className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                Immutable Audit Ledger
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Deposits cannot disappear silently. Every closure or early liquidation captures destination account, realized penalty, and an append-only snapshot.
              </p>
            </div>

            <div className="p-8 rounded-2xl brand-glass shadow-sm hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6">
                <BellRing className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                Proximity Maturity Alerts
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                In-app notification badge and banners alerting on 30, 14, and 7 days to maturity, plus real-time dispatch to Discord, Slack, or webhooks.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-10 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            Asset<span className="text-brand-emerald-600 dark:text-brand-emerald-400">Pulse</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Open-source under MIT License. Copyright © 2026 AssetPulse Contributors.
          </p>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Link href="/login" className="hover:text-brand-emerald-600 transition-colors">Login</Link>
            <Link href="/register" className="hover:text-brand-emerald-600 transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
